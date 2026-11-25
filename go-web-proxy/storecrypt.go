package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sync"

	"gopkg.in/yaml.v3"
)

// The users and connections files are encrypted whole with the store key
// (keyfile.go). On disk:
//
//	"SMUS" | version (1 byte) | role (1 byte) | nonce (12) | ciphertext | tag (16)
//
// AES-256-GCM with a fresh random nonce per write: cipher.NewGCMWithRandomNonce
// generates it and prepends it in Seal, and reads it back in Open. A store is
// rewritten only on an admin edit, far below the 2^32 messages one key may
// seal this way. The 6-byte header is the associated data, so the version and
// the file's role are authenticated: a users file put in place of the
// connections file, or a changed version byte, fails to open.
const (
	storeMagic     = "SMUS"
	storeVersion   = 1
	storeHeaderLen = len(storeMagic) + 2
	maxStoreFile   = 8 << 20 // read cap, checked before decrypting
)

// storeRole names which store a sealed file holds.
type storeRole byte

const (
	roleUsers    storeRole = 1
	roleConns    storeRole = 2
	roleSchedule storeRole = 3 // the backup schedule, sealed with the store key (backup.go)
	roleBackup   storeRole = 4 // a backup file's data, sealed with a passphrase-derived key
)

func (r storeRole) String() string {
	switch r {
	case roleUsers:
		return "users"
	case roleConns:
		return "connections"
	case roleSchedule:
		return "backup schedule"
	case roleBackup:
		return "backup"
	}
	return fmt.Sprintf("unknown (%d)", byte(r))
}

// errPlaintextStore is a store without the header: a file from a build before
// encryption. There is no migration (managed mode never shipped plaintext).
var errPlaintextStore = errors.New("is not encrypted: it is a plaintext store from an earlier build, and there is no migration; delete the users and connections files (and the key file) to start over")

// sealer encrypts and decrypts the store files with one key. It lives in the
// store struct; nothing holds the key globally.
type sealer struct {
	aead cipher.AEAD
}

func newSealer(key []byte) (*sealer, error) {
	if len(key) != storeKeyBytes {
		return nil, fmt.Errorf("store key must be %d bytes, got %d", storeKeyBytes, len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCMWithRandomNonce(block)
	if err != nil {
		return nil, err
	}
	return &sealer{aead: aead}, nil
}

func storeHeader(role storeRole) []byte {
	return append([]byte(storeMagic), storeVersion, byte(role))
}

// seal returns the on-disk bytes for plain. dst and the associated data must
// not overlap (cipher.AEAD), hence the two header copies.
func (s *sealer) seal(role storeRole, plain []byte) []byte {
	return s.aead.Seal(storeHeader(role), nil, plain, storeHeader(role))
}

// open checks the header and decrypts. Each error says what is wrong with the
// file without echoing any of it.
func (s *sealer) open(role storeRole, blob []byte) ([]byte, error) {
	switch {
	case len(blob) == 0:
		return nil, errors.New("is empty (damaged); restore it from a backup, or delete it to start over")
	case !bytes.HasPrefix(blob, []byte(storeMagic)):
		return nil, errPlaintextStore
	case len(blob) < storeHeaderLen:
		return nil, errors.New("is truncated (damaged); restore it from a backup, or delete it to start over")
	case blob[len(storeMagic)] != storeVersion:
		return nil, fmt.Errorf("has store format version %d, which this gateway does not read", blob[len(storeMagic)])
	case storeRole(blob[len(storeMagic)+1]) != role:
		return nil, fmt.Errorf("holds the %s store, not the %s store", storeRole(blob[len(storeMagic)+1]), role)
	}
	plain, err := s.aead.Open(nil, nil, blob[storeHeaderLen:], blob[:storeHeaderLen])
	if err != nil {
		return nil, errors.New("cannot be decrypted: wrong store key file, or the file is damaged")
	}
	return plain, nil
}

// sealDoc marshals a store document and seals it.
func (s *sealer) sealDoc(role storeRole, v any) ([]byte, error) {
	data, err := yaml.Marshal(v)
	if err != nil {
		return nil, err
	}
	return s.seal(role, data), nil
}

// docVerifier is the round-trip check for a sealed document: the bytes read
// back from the temp file must open under role and decode, strictly, into the
// type v has. The decode error is replaced by a fixed message: yaml's own can
// quote a value from the document.
func (s *sealer) docVerifier(role storeRole, v any) func([]byte) error {
	typ := reflect.TypeOf(v)
	for typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	return func(blob []byte) error {
		plain, err := s.open(role, blob)
		if err != nil {
			return err
		}
		dec := yaml.NewDecoder(bytes.NewReader(plain))
		dec.KnownFields(true)
		if err := dec.Decode(reflect.New(typ).Interface()); err != nil && !errors.Is(err, io.EOF) {
			return errors.New("the sealed document does not decode back")
		}
		return nil
	}
}

// stageDoc seals a store document into tx, owner-only, with the round-trip
// check, for a write that commits with others (an import) or alone. A document
// that does not encode fails the transaction (tx.fail): nothing is written.
func (s *sealer) stageDoc(tx *txn, role storeRole, path string, v any) {
	sealed, err := s.sealDoc(role, v)
	if err != nil {
		tx.fail(fmt.Errorf("cannot encode %s: %w", filepath.Base(path), err))
		return
	}
	tx.stage(path, sealed, 0o600, s.docVerifier(role, v))
}

// writeDoc persists a store document sealed and owner-only as one journaled
// commit (fileutil.go), with no writer around it: for the first write on a
// fresh volume, before the writer exists, and for test fixtures. A change to a
// live store goes through writer.Do, never here.
func (s *sealer) writeDoc(role storeRole, path string, v any) error {
	sealed, err := s.sealDoc(role, v)
	if err != nil {
		return err
	}
	return commitJournal(filepath.Dir(path), []journalFile{{path: path, data: sealed, perm: 0o600, verify: s.docVerifier(role, v)}})
}

// readDoc opens a sealed store document and decodes it strictly, rejecting
// unknown keys. An empty document decodes to an empty value.
func (s *sealer) readDoc(role storeRole, path string, v any) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	blob, err := io.ReadAll(io.LimitReader(f, maxStoreFile+1))
	if err != nil {
		return err
	}
	if len(blob) > maxStoreFile {
		return fmt.Errorf("is larger than %d MiB; a store this size is not one the gateway wrote", maxStoreFile>>20)
	}
	plain, err := s.open(role, blob)
	if err != nil {
		return err
	}
	dec := yaml.NewDecoder(bytes.NewReader(plain))
	dec.KnownFields(true)
	if err := dec.Decode(v); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

// checksumInfo is the HKDF label of the checksum key: it keeps that key apart
// from every other use of the store key.
const checksumInfo = "smu store checksum v1"

// checksums remembers, in memory only, a keyed checksum of each store file as
// the gateway last read or wrote it, and compares it with the disk before a
// write (the changed-on-disk refusal). The key is HKDF-SHA256 of the store
// key, so the value cannot be computed without it; it is HMAC-SHA256 over the
// file's bytes (for a sealed file: nonce, ciphertext and tag), recomputed at
// load and never written. Never compare by sealing again: the nonce is fresh
// every time.
//
// With no store key (Direct mode has none) the registry is switched off: no
// disk check, no rev. The journal is used all the same.
type checksums struct {
	key  []byte
	mu   sync.Mutex
	seen map[string]fileSum
	bad  map[string]bool
}

// fileSum is what is remembered about one file: its checksum, or that it was
// absent.
type fileSum struct {
	sum    []byte
	absent bool
}

// newChecksums derives the checksum key from the store key. A nil or empty
// key gives the switched-off registry; any other length is an error.
func newChecksums(storeKey []byte) (*checksums, error) {
	c := &checksums{seen: map[string]fileSum{}, bad: map[string]bool{}}
	if len(storeKey) == 0 {
		return c, nil
	}
	if len(storeKey) != storeKeyBytes {
		return nil, fmt.Errorf("store key must be %d bytes, got %d", storeKeyBytes, len(storeKey))
	}
	key, err := hkdf.Key(sha256.New, storeKey, nil, checksumInfo, sha256.Size)
	if err != nil {
		return nil, err
	}
	c.key = key
	return c, nil
}

// enabled reports whether there is a key, so whether check and rev do
// anything.
func (c *checksums) enabled() bool { return c.key != nil }

// sumOf is the keyed checksum of data.
func (c *checksums) sumOf(data []byte) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write(data) // never fails: hash.Hash.Write
	return m.Sum(nil)
}

// checksumRev renders a checksum as the opaque text the settings rev is:
// base64, raw URL alphabet.
func checksumRev(sum []byte) string { return base64.RawURLEncoding.EncodeToString(sum) }

// remember records data as what path now holds. A no-op without a key.
func (c *checksums) remember(path string, data []byte) {
	if !c.enabled() {
		return
	}
	sum := c.sumOf(data)
	c.mu.Lock()
	c.seen[filepath.Clean(path)] = fileSum{sum: sum}
	c.mu.Unlock()
}

// rememberAbsent records that path does not exist (backup.yaml before the
// first schedule): a file appearing there later is a change on disk.
func (c *checksums) rememberAbsent(path string) {
	if !c.enabled() {
		return
	}
	c.mu.Lock()
	c.seen[filepath.Clean(path)] = fileSum{absent: true}
	c.mu.Unlock()
}

// rememberDisk records what path holds on disk now (or that it is absent): the
// call a loader makes beside reading the file, once the key is known.
func (c *checksums) rememberDisk(path string) error {
	if !c.enabled() {
		return nil
	}
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		c.rememberAbsent(path)
	case err != nil:
		return fmt.Errorf("cannot read %s to checksum it: %w", path, err)
	default:
		c.remember(path, data)
	}
	return nil
}

// check compares the disk with what is remembered for path. It returns a
// *changedOnDiskError naming the file when they differ, and keeps returning it
// for that file until the process restarts, because the cause does not go
// away. A file never remembered is not checked. A file that cannot be read is
// a *writeFailedError, not a mismatch, and is not sticky.
func (c *checksums) check(path string) error {
	if !c.enabled() {
		return nil
	}
	p := filepath.Clean(path)
	c.mu.Lock()
	bad := c.bad[p]
	want, known := c.seen[p]
	c.mu.Unlock()
	if bad {
		return &changedOnDiskError{file: filepath.Base(p)}
	}
	if !known {
		return nil
	}
	data, err := os.ReadFile(p)
	absent := errors.Is(err, fs.ErrNotExist)
	if err != nil && !absent {
		return &writeFailedError{err: fmt.Errorf("cannot read %s to check it was not changed outside the gateway: %w", p, err)}
	}
	if (absent && want.absent) || (!absent && !want.absent && hmac.Equal(c.sumOf(data), want.sum)) {
		return nil
	}
	c.mu.Lock()
	c.bad[p] = true
	c.mu.Unlock()
	return &changedOnDiskError{file: filepath.Base(p)}
}

// rev is the remembered checksum of path as text (checksumRev), "" when there
// is no key, nothing is remembered or the file was absent.
func (c *checksums) rev(path string) string {
	if !c.enabled() {
		return ""
	}
	c.mu.Lock()
	got, ok := c.seen[filepath.Clean(path)]
	c.mu.Unlock()
	if !ok || got.absent {
		return ""
	}
	return checksumRev(got.sum)
}
