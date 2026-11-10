package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// The store key encrypts the users and connections files (storecrypt.go). It
// is 32 random bytes, kept as 64 hex characters in the file STORE_KEY_FILE
// names. That path is environment-only, so config.yaml can never point the
// gateway at another key. Hex is deliberate: the 44-character
// base64 site seed of earlier builds, which /managed/me sent to every
// signed-in user, can never pass as a key.
const (
	storeKeyBytes    = 32
	storeKeyHexChars = 2 * storeKeyBytes
	keyGenerateHint  = "head -c 32 /dev/urandom | xxd -p -c 64"
)

// loadStoreKey returns the store key, generating it only on a fresh volume:
// when the key file and every store file are absent. A missing key beside an
// existing store refuses to start, because a new key could not open that
// store and would hide a wrong mount. No error carries any key material.
func loadStoreKey(path string, stores []string, logger *slog.Logger) ([]byte, error) {
	data, err := os.ReadFile(path)
	switch {
	case err == nil:
		key, perr := parseStoreKey(data)
		if perr != nil {
			return nil, fmt.Errorf("store key file %q %w; it must hold %d hex characters (to make one: %s)", path, perr, storeKeyHexChars, keyGenerateHint)
		}
		warnLooseKeyMode(path, logger)
		return key, nil
	case !errors.Is(err, fs.ErrNotExist):
		return nil, fmt.Errorf("cannot read store key file %q: %w%s", path, err, ownershipHint(err))
	}
	for _, p := range stores {
		if _, err := os.Stat(p); !errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("store key file %q is missing but %q exists; restore the key file, or delete the store files to start over", path, p)
		}
	}
	key := make([]byte, storeKeyBytes)
	rand.Read(key) // never fails: crypto/rand.Read crashes the process instead
	if err := createExclusive(path, []byte(hex.EncodeToString(key)+"\n"), 0o600); err != nil {
		return nil, fmt.Errorf("cannot create store key file %q: %w%s", path, err, ownershipHint(err))
	}
	logger.Warn("store key file generated; back it up: without it the users and connections files cannot be read", "path", path)
	return key, nil
}

// parseStoreKey accepts exactly 64 hex characters, plus a trailing newline
// (an editor or `echo` adds one). The error names the length found, never the
// content.
func parseStoreKey(data []byte) ([]byte, error) {
	s := strings.TrimRight(string(data), "\r\n")
	if len(s) != storeKeyHexChars {
		return nil, fmt.Errorf("has %d characters", len(s))
	}
	key, err := hex.DecodeString(s)
	if err != nil {
		return nil, errors.New("is not hex")
	}
	return key, nil
}

// warnLooseKeyMode warns, never refuses: Docker secrets mount files 0444.
// Windows reports no Unix modes, so the check is skipped there.
func warnLooseKeyMode(path string, logger *slog.Logger) {
	if runtime.GOOS == "windows" {
		return
	}
	if info, err := os.Stat(path); err == nil && info.Mode().Perm()&0o077 != 0 {
		logger.Warn("store key file is readable by other users; restrict it to the gateway user", "path", path, "mode", fmt.Sprintf("%#o", info.Mode().Perm()))
	}
}

// ownershipHint adds the likely fix to a permission error: the image runs as
// uid 65532, so a bind-mounted directory must be writable by it.
func ownershipHint(err error) string {
	if errors.Is(err, fs.ErrPermission) {
		return " (the gateway runs as uid 65532 in the image; check the owner of the file and its directory)"
	}
	return ""
}

// createExclusive writes a file that must not exist yet (O_EXCL), so a second
// start racing the first can never replace a key already in use.
func createExclusive(path string, data []byte, perm fs.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, perm)
	if err != nil {
		return err
	}
	_, werr := f.Write(data)
	if err := errors.Join(werr, f.Sync(), f.Close()); err != nil {
		_ = os.Remove(path)
		return err
	}
	return nil
}
