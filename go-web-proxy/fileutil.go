package main

import (
	"io/fs"
	"os"
	"path/filepath"
)

// writeFileAtomic writes data via a same-directory temp file + fsync + rename so
// a crash mid-write can't leave a truncated YAML/seed file. perm is applied to
// the temp file before the rename: CreateTemp alone leaves 0600, which is right
// for the store files but too tight for config.yaml, which operators read and
// edit on the volume.
func writeFileAtomic(path string, data []byte, perm fs.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
