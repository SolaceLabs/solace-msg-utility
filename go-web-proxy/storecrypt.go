package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
	"io"
	"os"

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

// writeDoc persists a store document sealed and owner-only, atomically.
func (s *sealer) writeDoc(role storeRole, path string, v any) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, s.seal(role, data), 0o600)
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
