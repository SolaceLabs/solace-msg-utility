package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestWriteFileAtomic_WritesWithModeAndLeavesNoTemp(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "sub", "f.txt")
	if err := writeFileAtomic(p, []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic(p, []byte("two"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "two" {
		t.Errorf("content: want %q, got %q", "two", got)
	}
	if runtime.GOOS != "windows" { // no POSIX mode bits on Windows
		st, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if st.Mode().Perm() != 0o644 {
			t.Errorf("mode: want 0644, got %o", st.Mode().Perm())
		}
	}
	assertNoTempFiles(t, filepath.Dir(p))
}

// The store files are written 0600 and config.yaml 0644; the mode is the
// caller's choice, not a side effect of CreateTemp.
func TestWriteFileAtomic_ModeIsCallerChosen(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("no POSIX mode bits on Windows")
	}
	p := filepath.Join(t.TempDir(), "secret")
	if err := writeFileAtomic(p, []byte("s"), 0o600); err != nil {
		t.Fatal(err)
	}
	st, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o600 {
		t.Errorf("mode: want 0600, got %o", st.Mode().Perm())
	}
}

func TestWriteFileAtomic_ParentIsAFile(t *testing.T) {
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic(filepath.Join(blocker, "f"), []byte("x"), 0o644); err == nil {
		t.Fatal("want an error when the parent is a regular file")
	}
}

func TestWriteFileAtomic_RenameOntoDirectoryFails(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	if err := os.MkdirAll(filepath.Join(target, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic(target, []byte("x"), 0o644); err == nil {
		t.Fatal("want an error when the target is a non-empty directory")
	}
	assertNoTempFiles(t, dir)
}

func assertNoTempFiles(t *testing.T, dir string) {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(dir, ".tmp-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Errorf("temp files left behind: %v", matches)
	}
}

// readOr is path's content, or "<absent>".
func readOr(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "<absent>"
	}
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// renameFailing renames as os.Rename does, except on the given call numbers.
func renameFailing(calls ...int) func(string, string) error {
	n := 0
	return func(oldpath, newpath string) error {
		n++
		for _, c := range calls {
			if n == c {
				return errors.New("rename refused")
			}
		}
		return os.Rename(oldpath, newpath)
	}
}

// A group write changes every file or none: a rename that fails puts back
// the files renamed before it (their old contents, or gone when the write
// created them), and abort leaves no temp file behind.
func TestFileTx_AllOrNothing(t *testing.T) {
	cases := []struct {
		name    string
		oldA    string // "" leaves a absent at the start
		rename  func(string, string) error
		wantErr string // "" for none
		a, b    string // a and b afterwards
	}{
		{"every rename works", "old a", nil, "", "new a", "new b"},
		{"the second rename fails: the first file is put back", "old a", renameFailing(2), "nothing was changed", "old a", "<absent>"},
		{"the second rename fails: a file the write created goes", "", renameFailing(2), "nothing was changed", "<absent>", "<absent>"},
		{"putting back fails too: the error says so", "old a", renameFailing(2, 3), "putting back the files replaced before it failed too", "new a", "<absent>"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			a, b := filepath.Join(dir, "a"), filepath.Join(dir, "b")
			if c.oldA != "" {
				writeFile(t, a, c.oldA)
			}
			tx := &fileTx{rename: c.rename}
			defer tx.abort()
			if err := tx.stage(a, []byte("new a"), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := tx.stage(b, []byte("new b"), 0o600); err != nil {
				t.Fatal(err)
			}
			err := tx.commit()
			switch {
			case c.wantErr == "" && err != nil:
				t.Fatalf("want no error, got %v", err)
			case c.wantErr != "" && (err == nil || !strings.Contains(err.Error(), c.wantErr)):
				t.Fatalf("want an error with %q, got %v", c.wantErr, err)
			}
			tx.abort()
			if got := readOr(t, a); got != c.a {
				t.Errorf("a: want %q, got %q", c.a, got)
			}
			if got := readOr(t, b); got != c.b {
				t.Errorf("b: want %q, got %q", c.b, got)
			}
			assertNoTempFiles(t, dir)
		})
	}
}

// A target commit cannot read before replacing it stops the commit before
// any rename: there would be nothing to put back.
func TestFileTx_UnreadableTargetChangesNothing(t *testing.T) {
	dir := t.TempDir()
	unreadable, b := filepath.Join(dir, "is-a-directory"), filepath.Join(dir, "b")
	if err := os.Mkdir(unreadable, 0o755); err != nil {
		t.Fatal(err)
	}
	tx := &fileTx{}
	defer tx.abort()
	for _, p := range []string{unreadable, b} {
		if err := tx.stage(p, []byte("new"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.commit(); err == nil || !strings.Contains(err.Error(), "cannot read "+unreadable+" before replacing it") {
		t.Fatalf("want the read failure naming the file, got %v", err)
	}
	tx.abort()
	if got := readOr(t, b); got != "<absent>" {
		t.Errorf("no file may change: b holds %q", got)
	}
	assertNoTempFiles(t, dir)
}
