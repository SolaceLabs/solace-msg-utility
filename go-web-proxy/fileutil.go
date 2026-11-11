package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// writeFileAtomic writes data via a same-directory temp file + fsync + rename so
// a crash mid-write can't leave a truncated file. perm is applied to
// the temp file before the rename: CreateTemp alone leaves 0600, which is right
// for the store files but too tight for config.yaml, which operators read and
// edit on the volume.
func writeFileAtomic(path string, data []byte, perm fs.FileMode) error {
	tx := &fileTx{}
	defer tx.abort()
	err := tx.stage(path, data, perm)
	if err == nil {
		err = tx.commit()
	}
	return err
}

// fileTx changes a group of files together: each write is staged beside its
// target as a synced temp file, and commit renames them all into place, or
// none (a rename that fails puts back the files renamed before it). An import
// writes the users, the connections and config.yaml through one, so a failure
// leaves all three as they were. Every caller defers abort, which removes
// whatever commit did not rename.
type fileTx struct {
	staged []stagedFile
	// done counts the staged files commit has renamed (or abort removed).
	done int
	// rename is os.Rename when nil; tests make it fail.
	rename func(oldpath, newpath string) error
}

type stagedFile struct {
	path, tmp string
	perm      fs.FileMode
}

// priorFile is what a target held before commit replaced it.
type priorFile struct {
	data   []byte
	exists bool
}

// stage writes data to a synced temp file beside path, with perm, for commit
// to rename. On failure nothing is left behind.
func (tx *fileTx) stage(path string, data []byte, perm fs.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	_, err = tmp.Write(data)
	if err == nil {
		err = tmp.Chmod(perm)
	}
	if err == nil {
		err = tmp.Sync()
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		_ = os.Remove(tmp.Name())
		return err
	}
	tx.staged = append(tx.staged, stagedFile{path: path, tmp: tmp.Name(), perm: perm})
	return nil
}

// commit renames the staged files into place in the order they were staged.
// It first reads what each target but the last holds, so that when a rename
// fails the files already renamed get their old contents back (or go, when
// the transaction created them); the error says whether that worked.
func (tx *fileTx) commit() error {
	rename := tx.rename
	if rename == nil {
		rename = os.Rename
	}
	prior := make([]priorFile, len(tx.staged))
	for i := 0; i < len(tx.staged)-1; i++ {
		data, err := os.ReadFile(tx.staged[i].path)
		switch {
		case err == nil:
			prior[i] = priorFile{data: data, exists: true}
		case !errors.Is(err, fs.ErrNotExist):
			return fmt.Errorf("cannot read %s before replacing it: %w; nothing was changed", tx.staged[i].path, err)
		}
	}
	for i, sf := range tx.staged {
		if err := rename(sf.tmp, sf.path); err != nil {
			tx.done = i
			var failed []string
			for j := i - 1; j >= 0; j-- {
				if perr := tx.putBack(tx.staged[j], prior[j]); perr != nil {
					failed = append(failed, fmt.Sprintf("%s (%v)", tx.staged[j].path, perr))
				}
			}
			if len(failed) > 0 {
				return fmt.Errorf("cannot replace %s: %w; putting back the files replaced before it failed too: %s", sf.path, err, strings.Join(failed, ", "))
			}
			return fmt.Errorf("cannot replace %s: %w; nothing was changed", sf.path, err)
		}
	}
	tx.done = len(tx.staged)
	return nil
}

// putBack gives sf.path the contents it had before commit, or removes it
// when the transaction created it.
func (tx *fileTx) putBack(sf stagedFile, p priorFile) error {
	if !p.exists {
		return os.Remove(sf.path)
	}
	back := &fileTx{rename: tx.rename}
	defer back.abort()
	err := back.stage(sf.path, p.data, sf.perm)
	if err == nil {
		err = back.commit()
	}
	return err
}

// abort removes the staged temp files commit has not renamed. It is safe to
// call more than once and after a successful commit.
func (tx *fileTx) abort() {
	for _, sf := range tx.staged[tx.done:] {
		_ = os.Remove(sf.tmp)
	}
	tx.done = len(tx.staged)
}
