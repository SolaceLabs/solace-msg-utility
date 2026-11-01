//go:build managed

package main

import (
	"bytes"
	"os"
	"path/filepath"
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

	if err := sl.readDoc(roleUsers, filepath.Join(dir, "missing.yaml"), &usersDoc{}); err == nil {
		t.Error("a missing file must be an error")
	}
	if err := sl.readDoc(roleUsers, dir, &usersDoc{}); err == nil {
		t.Error("a directory must be an error")
	}

	// Oversized: refused before decrypting.
	if err := os.WriteFile(path, bytes.Repeat([]byte{'S'}, maxStoreFile+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := sl.readDoc(roleUsers, path, &usersDoc{}); err == nil || !strings.Contains(err.Error(), "is larger than 8 MiB") {
		t.Errorf("want the size refusal, got %v", err)
	}
}
