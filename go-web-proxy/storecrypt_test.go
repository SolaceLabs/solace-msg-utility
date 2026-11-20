package main

import (
	"bytes"
	"context"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func testSealer(t *testing.T, fill byte) *sealer {
	t.Helper()
	sl, err := newSealer(bytes.Repeat([]byte{fill}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	return sl
}

func TestNewSealer_TakesOnlyA32ByteKey(t *testing.T) {
	for _, n := range []int{0, 16, 24, 31, 33} {
		if _, err := newSealer(make([]byte, n)); err == nil || !strings.Contains(err.Error(), "must be 32 bytes") {
			t.Errorf("%d-byte key: want a refusal, got %v", n, err)
		}
	}
}

func TestSealer_RoundTripAndFreshNonce(t *testing.T) {
	sl := testSealer(t, 1)
	plain := []byte("msg-utility-users: []\n")
	for _, role := range []storeRole{roleUsers, roleConns} {
		a, b := sl.seal(role, plain), sl.seal(role, plain)
		if !bytes.HasPrefix(a, []byte{'S', 'M', 'U', 'S', storeVersion, byte(role)}) {
			t.Errorf("%s: want the header, got %x", role, a[:storeHeaderLen])
		}
		if bytes.Equal(a, b) {
			t.Errorf("%s: two seals of the same document must differ (fresh nonce)", role)
		}
		if len(a) != storeHeaderLen+len(plain)+28 {
			t.Errorf("%s: want header + nonce + ciphertext + tag, got %d bytes", role, len(a))
		}
		got, err := sl.open(role, a)
		if err != nil || !bytes.Equal(got, plain) {
			t.Errorf("%s: round trip: %q, %v", role, got, err)
		}
	}
}

func TestSealer_OpenRefusesWhatItCannotTrust(t *testing.T) {
	sl := testSealer(t, 1)
	sealed := sl.seal(roleUsers, []byte("msg-utility-users: []\n"))
	flip := func(i int) []byte {
		b := bytes.Clone(sealed)
		b[i] ^= 0x01
		return b
	}
	const undecryptable = "cannot be decrypted: wrong store key file, or the file is damaged"
	cases := []struct {
		name string
		blob []byte
		role storeRole
		with *sealer
		want string
	}{
		{"empty", nil, roleUsers, sl, "is empty (damaged)"},
		{"plaintext", []byte("msg-utility-users: []\n"), roleUsers, sl, "plaintext store from an earlier build"},
		{"magic changed", flip(0), roleUsers, sl, "plaintext store from an earlier build"},
		{"truncated header", sealed[:5], roleUsers, sl, "is truncated (damaged)"},
		{"version changed", flip(4), roleUsers, sl, "store format version 0"},
		{"other role", sealed, roleConns, sl, "holds the users store, not the connections store"},
		{"unknown role", flip(5), roleUsers, sl, "holds the unknown (0) store"},
		{"header only", sealed[:storeHeaderLen+10], roleUsers, sl, undecryptable},
		{"nonce changed", flip(storeHeaderLen), roleUsers, sl, undecryptable},
		{"ciphertext changed", flip(storeHeaderLen + 12), roleUsers, sl, undecryptable},
		{"tag changed", flip(len(sealed) - 1), roleUsers, sl, undecryptable},
		{"another key", sealed, roleUsers, testSealer(t, 2), undecryptable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := tc.with.open(tc.role, tc.blob); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, err)
			}
		})
	}
}

func TestSealer_ReadDoc(t *testing.T) {
	sl := testSealer(t, 1)
	dir := t.TempDir()
	path := filepath.Join(dir, "users.yaml")

	if err := sl.writeDoc(roleUsers, path, usersDoc{Users: []userRec{{Username: "ann", Admin: true}}}); err != nil {
		t.Fatal(err)
	}
	var doc usersDoc
	if err := sl.readDoc(roleUsers, path, &doc); err != nil || len(doc.Users) != 1 || doc.Users[0].Username != "ann" {
		t.Fatalf("round trip through the file: %+v, %v", doc, err)
	}

	// Strict decode after decrypting: an unknown key is refused.
	writeFile(t, path, string(sl.seal(roleUsers, []byte("msg-utility-users: []\nextra: 1\n"))))
	if err := sl.readDoc(roleUsers, path, &usersDoc{}); err == nil || !strings.Contains(err.Error(), "field extra not found") {
		t.Errorf("want the strict decode error, got %v", err)
	}

	missing := filepath.Join(dir, "missing.yaml")
	if err := sl.readDoc(roleUsers, missing, &usersDoc{}); !errors.Is(err, os.ErrNotExist) || !namesPath(err.Error(), missing) {
		t.Errorf("a missing file: want a does-not-exist error naming %s, got %v", missing, err)
	}
	err := sl.readDoc(roleUsers, dir, &usersDoc{})
	if err == nil || !namesPath(err.Error(), dir) {
		t.Errorf("a directory: want an error naming %s, got %v", dir, err)
	} else if runtime.GOOS != "windows" && !strings.Contains(err.Error(), "is a directory") {
		t.Errorf("a directory: want the is-a-directory error, got %v", err)
	}

	// Oversized: refused before decrypting.
	if err := os.WriteFile(path, bytes.Repeat([]byte{'S'}, maxStoreFile+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := sl.readDoc(roleUsers, path, &usersDoc{}); err == nil || !strings.Contains(err.Error(), "is larger than 8 MiB") {
		t.Errorf("want the size refusal, got %v", err)
	}
}

// writeDoc is one journaled commit: replacing a document leaves only the
// document, owner-only.
func TestSealer_WriteDocIsAJournaledCommit(t *testing.T) {
	sl := testSealer(t, 1)
	dir := t.TempDir()
	path := filepath.Join(dir, "users.yaml")
	for _, name := range []string{"ann", "bob"} { // create, then replace
		if err := sl.writeDoc(roleUsers, path, usersDoc{Users: []userRec{{Username: name}}}); err != nil {
			t.Fatal(err)
		}
	}
	var doc usersDoc
	if err := sl.readDoc(roleUsers, path, &doc); err != nil || len(doc.Users) != 1 || doc.Users[0].Username != "bob" {
		t.Fatalf("round trip: %+v, %v", doc, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Errorf("only the document may remain: %v %v", entries, err)
	}
	if runtime.GOOS != "windows" {
		if st, err := os.Stat(path); err != nil || st.Mode().Perm() != 0o600 {
			t.Errorf("want owner-only, got %v %v", st, err)
		}
	}
}

// The round-trip check of a sealed document: it must open under the role and
// decode strictly into the document's type. A failure names the problem and
// never quotes the document.
func TestSealer_DocVerifier(t *testing.T) {
	sl := testSealer(t, 1)
	good := sl.seal(roleUsers, []byte("msg-utility-users: []\n"))
	for name, v := range map[string]any{"a value": usersDoc{}, "a pointer": &usersDoc{}} {
		if err := sl.docVerifier(roleUsers, v)(good); err != nil {
			t.Errorf("%s: a good document must pass: %v", name, err)
		}
	}
	verify := sl.docVerifier(roleUsers, usersDoc{})
	if err := verify(sl.seal(roleUsers, nil)); err != nil {
		t.Errorf("an empty document decodes to an empty value: %v", err)
	}
	if err := verify(sl.seal(roleConns, []byte("x: 1"))); err == nil || !strings.Contains(err.Error(), "holds the connections store") {
		t.Errorf("another role: got %v", err)
	}
	if err := verify([]byte("plain")); !errors.Is(err, errPlaintextStore) {
		t.Errorf("an unsealed file: got %v", err)
	}
	if err := testSealer(t, 2).docVerifier(roleUsers, usersDoc{})(good); err == nil || !strings.Contains(err.Error(), "cannot be decrypted") {
		t.Errorf("another key: got %v", err)
	}
	err := verify(sl.seal(roleUsers, []byte("extra: SECRETVALUE\n")))
	if err == nil || !strings.Contains(err.Error(), "does not decode back") || strings.Contains(err.Error(), "SECRETVALUE") {
		t.Errorf("an unknown key must fail without quoting the document: %v", err)
	}
}

// stageDoc seals into the transaction owner-only with the round-trip check
// wired, and the commit writes a file readDoc opens.
func TestSealer_StageDocCarriesTheRoundTripCheck(t *testing.T) {
	sl := testSealer(t, 1)
	dir := t.TempDir()
	path := filepath.Join(dir, "users.yaml")
	w := newWriter(dir, nil, nil)
	err := w.Do(context.Background(), func(tx *txn) error {
		sl.stageDoc(tx, roleUsers, path, usersDoc{Users: []userRec{{Username: "ann", Admin: true}}})
		f := tx.files[0]
		if f.perm != 0o600 || f.verify == nil || f.verify(f.data) != nil || f.verify([]byte("garbage")) == nil {
			t.Errorf("staged with mode %o, verify %v", f.perm, f.verify != nil)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	var doc usersDoc
	if err := sl.readDoc(roleUsers, path, &doc); err != nil || len(doc.Users) != 1 || doc.Users[0].Username != "ann" {
		t.Fatalf("round trip: %+v, %v", doc, err)
	}
}

// unencodable is a document yaml cannot encode: its marshaller fails.
type unencodable struct{}

func (unencodable) MarshalYAML() (any, error) {
	return nil, errors.New("this document does not encode")
}

// A document that does not encode never reaches the disk: writeDoc returns the
// error, and a transaction that staged one fails as a store write, naming the
// file, with nothing written and nothing published.
func TestSealer_ADocumentThatDoesNotEncodeIsAFailedWrite(t *testing.T) {
	sl := testSealer(t, 1)
	dir := t.TempDir()
	path := filepath.Join(dir, "users.yaml")
	if err := sl.writeDoc(roleUsers, path, unencodable{}); err == nil || !strings.Contains(err.Error(), "does not encode") {
		t.Errorf("writeDoc: want the encoding error, got %v", err)
	}
	published := false
	err := newWriter(dir, nil, nil).Do(context.Background(), func(tx *txn) error {
		sl.stageDoc(tx, roleUsers, path, unencodable{})
		sl.stageDoc(tx, roleUsers, path, unencodable{}) // the first failure is the one reported
		tx.onPublish(func() { published = true })
		return nil
	})
	var failed *writeFailedError
	if !errors.As(err, &failed) || !strings.Contains(err.Error(), "cannot encode users.yaml") {
		t.Errorf("want a failed store write naming the file, got %v", err)
	}
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) || published {
		t.Errorf("nothing may be written or published: stat %v, published %v", statErr, published)
	}
}

// The checksum is HMAC-SHA256 under an HKDF-SHA256 key derived from the store
// key with the pinned label: pinned here by deriving it again, independently.
func TestChecksums_AreKeyedAndPinned(t *testing.T) {
	storeKey := bytes.Repeat([]byte{9}, storeKeyBytes)
	c, err := newChecksums(storeKey)
	if err != nil || !c.enabled() {
		t.Fatalf("%v enabled %v", err, c != nil && c.enabled())
	}
	derived, err := hkdf.Key(sha256.New, storeKey, nil, "smu store checksum v1", 32)
	if err != nil {
		t.Fatal(err)
	}
	m := hmac.New(sha256.New, derived)
	m.Write([]byte("file bytes"))
	want := m.Sum(nil)
	if got := c.sumOf([]byte("file bytes")); !bytes.Equal(got, want) {
		t.Error("the checksum is not HMAC-SHA256 under the HKDF-derived key")
	}
	plain := hmac.New(sha256.New, storeKey)
	plain.Write([]byte("file bytes"))
	if bytes.Equal(plain.Sum(nil), want) {
		t.Error("the checksum key must not be the store key itself")
	}
	if bytes.Equal(c.sumOf([]byte("file bytes")), c.sumOf([]byte("file byteS"))) {
		t.Error("different bytes must give different checksums")
	}
	other, err := newChecksums(bytes.Repeat([]byte{8}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(c.sumOf([]byte("file bytes")), other.sumOf([]byte("file bytes"))) {
		t.Error("a different store key must give a different checksum")
	}
	if got := checksumRev(want); got != base64.RawURLEncoding.EncodeToString(want) || len(got) != 43 || strings.ContainsAny(got, "=+/") {
		t.Errorf("the rev must be base64 raw URL text: %q", got)
	}
}

func TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(t *testing.T) {
	if _, err := newChecksums(make([]byte, 16)); err == nil || !strings.Contains(err.Error(), "must be 32 bytes") {
		t.Errorf("got %v", err)
	}
}

// Direct mode has no store key: the registry does nothing and says so, and a
// file that differs from anything is not an error.
func TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(t *testing.T) {
	for name, key := range map[string][]byte{"nil": nil, "empty": {}} {
		c, err := newChecksums(key)
		if err != nil || c.enabled() {
			t.Fatalf("%s: %v enabled %v", name, err, c != nil && c.enabled())
		}
		path := filepath.Join(t.TempDir(), "config.yaml")
		writeFile(t, path, "one")
		c.remember(path, []byte("one"))
		c.rememberAbsent(path)
		if err := c.rememberDisk(filepath.Dir(path)); err != nil { // would fail if it read anything
			t.Errorf("%s: rememberDisk: %v", name, err)
		}
		writeFile(t, path, "two")
		if err := c.check(path); err != nil {
			t.Errorf("%s: no key, no check: %v", name, err)
		}
		if c.rev(path) != "" {
			t.Errorf("%s: no key, no rev: %q", name, c.rev(path))
		}
	}
}

// The registry compares the disk with what it remembered, per file: a change
// is refused naming the file and stays refused until restart; a file never
// remembered is not checked; absence is remembered like content.
func TestChecksums_CheckComparesTheDiskWithMemory(t *testing.T) {
	c, err := newChecksums(bytes.Repeat([]byte{3}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	writeFile(t, path, "one")
	if err := c.rememberDisk(path); err != nil {
		t.Fatal(err)
	}
	if err := c.check(dir + "/./config.yaml"); err != nil {
		t.Errorf("unchanged (and the path spelled differently): %v", err)
	}
	if c.rev(path) != checksumRev(c.sumOf([]byte("one"))) {
		t.Errorf("rev: %q", c.rev(path))
	}

	writeFile(t, path, "two")
	var disk *changedOnDiskError
	if err := c.check(path); !errors.As(err, &disk) || disk.file != "config.yaml" {
		t.Fatalf("changed: got %v", err)
	}
	writeFile(t, path, "one")
	if err := c.check(path); !errors.As(err, &disk) {
		t.Errorf("sticky until restart: got %v", err)
	}
	if c.rev(path) != checksumRev(c.sumOf([]byte("one"))) {
		t.Error("the rev stays what the gateway remembers")
	}

	if err := c.check(filepath.Join(dir, "never-seen.yaml")); err != nil {
		t.Errorf("a file never remembered is not checked: %v", err)
	}
	if c.rev(filepath.Join(dir, "never-seen.yaml")) != "" {
		t.Error("no rev for a file never remembered")
	}
}

func TestChecksums_AbsenceIsRemembered(t *testing.T) {
	c, err := newChecksums(bytes.Repeat([]byte{3}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	missing, present := filepath.Join(dir, "backup.yaml"), filepath.Join(dir, "users.yaml")
	writeFile(t, present, "x")
	if err := c.rememberDisk(missing); err != nil {
		t.Fatal(err)
	}
	if err := c.rememberDisk(present); err != nil {
		t.Fatal(err)
	}
	if err := c.check(missing); err != nil || c.rev(missing) != "" {
		t.Errorf("still absent: %v rev %q", err, c.rev(missing))
	}
	writeFile(t, missing, "appeared")
	var disk *changedOnDiskError
	if err := c.check(missing); !errors.As(err, &disk) || disk.file != "backup.yaml" {
		t.Errorf("a file that appeared: %v", err)
	}
	if err := os.Remove(present); err != nil {
		t.Fatal(err)
	}
	if err := c.check(present); !errors.As(err, &disk) || disk.file != "users.yaml" {
		t.Errorf("a file that vanished: %v", err)
	}
}

// A file that cannot be read is a failed write, not a change on disk, and is
// not held against the file afterwards.
func TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(t *testing.T) {
	c, err := newChecksums(bytes.Repeat([]byte{3}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "users.yaml")
	writeFile(t, path, "one")
	if err := c.rememberDisk(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0o755); err != nil { // a directory where the file was
		t.Fatal(err)
	}
	var failed *writeFailedError
	if err := c.check(path); !errors.As(err, &failed) {
		t.Fatalf("want a write failure, got %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	writeFile(t, path, "one")
	if err := c.check(path); err != nil {
		t.Errorf("an unreadable moment must not stick: %v", err)
	}
	if err := c.rememberDisk(t.TempDir()); err == nil || !strings.Contains(err.Error(), "cannot read") {
		t.Errorf("rememberDisk of a directory: got %v", err)
	}
}
