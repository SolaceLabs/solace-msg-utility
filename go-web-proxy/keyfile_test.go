//go:build managed

package main

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// keyDir is an empty temp dir with the key and store paths a volume would hold.
func keyDir(t *testing.T) (key string, stores []string) {
	t.Helper()
	dir := t.TempDir()
	return filepath.Join(dir, "store.key"), []string{filepath.Join(dir, "users.yaml"), filepath.Join(dir, "connections.yaml")}
}

func TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(t *testing.T) {
	path, stores := keyDir(t)
	var buf strings.Builder
	key, err := loadStoreKey(path, stores, newCapturingLogger(&buf))
	if err != nil || len(key) != storeKeyBytes {
		t.Fatalf("want a %d-byte key, got %d bytes, err %v", storeKeyBytes, len(key), err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != hex.EncodeToString(key)+"\n" {
		t.Errorf("the file must hold the key as hex plus a newline, got %d bytes", len(data))
	}
	if info, _ := os.Stat(path); runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Errorf("the key file must be owner-only, got %v", info.Mode().Perm())
	}
	if !strings.Contains(buf.String(), "store key file generated") || !strings.Contains(buf.String(), path) {
		t.Errorf("want a warn naming the new key file: %s", buf.String())
	}
	if strings.Contains(buf.String(), hex.EncodeToString(key)) {
		t.Error("the key must never be logged")
	}

	buf.Reset()
	again, err := loadStoreKey(path, stores, newCapturingLogger(&buf))
	if err != nil || !bytes.Equal(again, key) || buf.Len() != 0 {
		t.Errorf("a second start must read the same key quietly: err %v, log %q", err, buf.String())
	}
}

func TestLoadStoreKey_RefusesAMissingKeyBesideAStore(t *testing.T) {
	for i := range 2 {
		path, stores := keyDir(t)
		writeFile(t, stores[i], "anything")
		_, err := loadStoreKey(path, stores, quietLogger())
		if err == nil || !strings.Contains(err.Error(), path) || !strings.Contains(err.Error(), stores[i]) ||
			!strings.Contains(err.Error(), "restore the key file, or delete the store files") {
			t.Fatalf("want a refusal naming both files and the fix, got %v", err)
		}
		if _, err := os.Stat(path); err == nil {
			t.Error("no key may be generated beside an existing store")
		}
	}
}

func TestLoadStoreKey_RefusesAMalformedKey(t *testing.T) {
	good := strings.Repeat("0f", storeKeyBytes)
	cases := []struct{ name, content, want string }{
		{"empty", "", "has 0 characters"},
		{"short", good[:62], "has 62 characters"},
		{"long", good + "00", "has 66 characters"},
		{"not hex", strings.Repeat("zq", storeKeyBytes), "is not hex"},
		// The base64 site seed of earlier builds is 44 characters.
		{"old site seed", "q83vEjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJA=", "has 44 characters"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path, stores := keyDir(t)
			writeFile(t, path, tc.content)
			_, err := loadStoreKey(path, stores, quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), path) || !strings.Contains(err.Error(), keyGenerateHint) {
				t.Fatalf("want %q naming the file and how to make a key, got %v", tc.want, err)
			}
			if tc.content != "" && strings.Contains(err.Error(), tc.content) {
				t.Error("the error must not echo the file's content")
			}
		})
	}
}

func TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(t *testing.T) {
	path, stores := keyDir(t)
	want := bytes.Repeat([]byte{0xa5}, storeKeyBytes)
	writeFile(t, path, hex.EncodeToString(want)+"\r\n")
	if err := os.Chmod(path, 0o644); err != nil { // whatever the umask
		t.Fatal(err)
	}
	var buf strings.Builder
	key, err := loadStoreKey(path, stores, newCapturingLogger(&buf))
	if err != nil || !bytes.Equal(key, want) {
		t.Fatalf("a trailing newline is not part of the key: %v", err)
	}
	if runtime.GOOS != "windows" && !strings.Contains(buf.String(), "readable by other users") {
		t.Errorf("a group- or world-readable key must warn: %s", buf.String())
	}
	if err := os.Chmod(path, 0o600); err != nil {
		t.Fatal(err)
	}
	buf.Reset()
	if _, err := loadStoreKey(path, stores, newCapturingLogger(&buf)); err != nil || buf.Len() != 0 {
		t.Errorf("an owner-only key must load quietly: err %v, log %q", err, buf.String())
	}
}

func TestLoadStoreKey_UnreadableKeyPath(t *testing.T) {
	// The key path is a directory: it exists but cannot be read as a key.
	path, stores := keyDir(t)
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := loadStoreKey(path, stores, quietLogger()); err == nil || !strings.Contains(err.Error(), "cannot read store key file") {
		t.Errorf("want a read error, got %v", err)
	}

}

func TestLoadStoreKey_CreateFailures(t *testing.T) {
	_, stores := keyDir(t)
	// A dangling symlink reads as absent, but O_EXCL refuses to create
	// through it: a create error that is not about permissions.
	dangling := filepath.Join(t.TempDir(), "store.key")
	if err := os.Symlink(filepath.Join(t.TempDir(), "gone"), dangling); err != nil {
		t.Skipf("symlinks unavailable here: %v", err)
	}
	_, err := loadStoreKey(dangling, stores, quietLogger())
	if err == nil || !strings.Contains(err.Error(), "cannot create store key file") || strings.Contains(err.Error(), "uid 65532") {
		t.Errorf("want a create error without the ownership hint, got %v", err)
	}

	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("directory permissions do not bind on Windows or as root")
	}
	locked := filepath.Join(t.TempDir(), "locked")
	if err := os.Mkdir(locked, 0o500); err != nil {
		t.Fatal(err)
	}
	_, err = loadStoreKey(filepath.Join(locked, "store.key"), stores, quietLogger())
	if err == nil || !strings.Contains(err.Error(), "cannot create store key file") || !strings.Contains(err.Error(), "uid 65532") {
		t.Errorf("a permission error must carry the ownership hint, got %v", err)
	}
}

func TestCreateExclusive_NeverReplacesAFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "store.key")
	if err := createExclusive(path, []byte("first"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := createExclusive(path, []byte("second"), 0o600); err == nil {
		t.Error("a second create must fail")
	}
	if data, _ := os.ReadFile(path); string(data) != "first" {
		t.Errorf("the existing file must be untouched, got %q", data)
	}
}
