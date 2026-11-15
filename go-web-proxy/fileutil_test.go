package main

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

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

// jfix is a data directory in the state before a group commit: config.yaml
// and users.yaml hold old content, connections.yaml does not exist.
type jfix struct {
	dir     string
	a, b, c string // config.yaml, users.yaml, connections.yaml
}

func newJFix(t *testing.T) *jfix {
	t.Helper()
	dir := t.TempDir()
	f := &jfix{dir: dir, a: filepath.Join(dir, "config.yaml"), b: filepath.Join(dir, "users.yaml"), c: filepath.Join(dir, "connections.yaml")}
	writeFile(t, f.a, "old a")
	writeFile(t, f.b, "old b")
	return f
}

// files is the group commit: new content for all three.
func (f *jfix) files(verifyB func([]byte) error) []journalFile {
	return []journalFile{
		{path: f.a, data: []byte("new a"), perm: 0o644},
		{path: f.b, data: []byte("new b"), perm: 0o600, verify: verifyB},
		{path: f.c, data: []byte("new c"), perm: 0o600},
	}
}

func (f *jfix) run(hooks journalHooks) error {
	return newJournal(f.dir, f.files(nil), hooks, quietLogger()).run()
}

func (f *jfix) want(t *testing.T, a, b, c string) {
	t.Helper()
	for path, want := range map[string]string{f.a: a, f.b: b, f.c: c} {
		if got := readOr(t, path); got != want {
			t.Errorf("%s: want %q, got %q", filepath.Base(path), want, got)
		}
	}
}

// clean fails when anything but the three store files is in the directory: no
// journal, no backup, no temp.
func (f *jfix) clean(t *testing.T) {
	t.Helper()
	entries, err := os.ReadDir(f.dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		switch e.Name() {
		case "config.yaml", "users.yaml", "connections.yaml":
		default:
			t.Errorf("leftover in the data directory: %s", e.Name())
		}
	}
}

// crashAfter stops a commit dead once step has completed.
func crashAfter(step commitStep) journalHooks {
	return journalHooks{after: func(s commitStep) error {
		if s == step {
			return errSimulatedCrash
		}
		return nil
	}}
}

// failAfter makes step fail once it has completed.
func failAfter(step commitStep, err error) journalHooks {
	return journalHooks{after: func(s commitStep) error {
		if s == step {
			return err
		}
		return nil
	}}
}

// panicAfter panics once step has completed.
func panicAfter(step commitStep) journalHooks {
	return journalHooks{after: func(s commitStep) error {
		if s == step {
			panic("boom")
		}
		return nil
	}}
}

func TestJournal_CommitsAGroupWithItsModes(t *testing.T) {
	f := newJFix(t)
	if err := f.run(journalHooks{}); err != nil {
		t.Fatal(err)
	}
	f.want(t, "new a", "new b", "new c")
	f.clean(t)
	if runtime.GOOS == "windows" { // no POSIX mode bits on Windows
		return
	}
	for path, want := range map[string]os.FileMode{f.a: 0o644, f.b: 0o600, f.c: 0o600} {
		st, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if st.Mode().Perm() != want {
			t.Errorf("%s: want mode %o, got %o", filepath.Base(path), want, st.Mode().Perm())
		}
	}
}

func TestCommitJournal_WritesAloneWithoutAWriter(t *testing.T) {
	f := newJFix(t)
	if err := commitJournal(f.dir, []journalFile{{path: f.a, data: []byte("alone"), perm: 0o644}}); err != nil {
		t.Fatal(err)
	}
	f.want(t, "alone", "old b", "<absent>")
	f.clean(t)
}

// A power loss after any step: the next start rolls back what had not reached
// the commit point (txn still there) and keeps what had, and leaves no
// journal, backup or temp. Recovery run again changes nothing.
func TestJournal_CrashAfterEachStepRecoversAtTheNextStart(t *testing.T) {
	names := map[commitStep]string{
		stepTxn: "txn written", stepBackups: "backups copied", stepTemps: "temps written", stepVerify: "temps verified",
		stepRename: "renamed", stepCommit: "txn deleted", stepSync: "directory synced", stepCleanup: "backups deleted",
	}
	for step := stepTxn; step <= stepCleanup; step++ {
		t.Run(names[step], func(t *testing.T) {
			f := newJFix(t)
			if err := f.run(crashAfter(step)); !errors.Is(err, errSimulatedCrash) {
				t.Fatalf("want the simulated crash, got %v", err)
			}
			committed := step >= stepCommit
			if got := readOr(t, filepath.Join(f.dir, txnFileName)) != "<absent>"; got == committed {
				t.Errorf("journal present after the crash: %v, but the commit point passed: %v", got, committed)
			}
			for i := 0; i < 2; i++ {
				if err := recoverDataDir(f.dir, quietLogger()); err != nil {
					t.Fatalf("recovery run %d: %v", i+1, err)
				}
				if committed {
					f.want(t, "new a", "new b", "new c")
				} else {
					f.want(t, "old a", "old b", "<absent>")
				}
				f.clean(t)
			}
		})
	}
}

// A failure (not a crash) before the commit point is rolled back by the
// running process itself, at whichever step it hit.
func TestJournal_FailureBeforeTheCommitPointRollsBackInProcess(t *testing.T) {
	for step := stepTxn; step < stepCommit; step++ {
		t.Run(fmt.Sprintf("after step %d", step), func(t *testing.T) {
			f := newJFix(t)
			err := f.run(failAfter(step, errors.New("disk full")))
			var rf *rollbackFailedError
			if err == nil || !strings.Contains(err.Error(), "disk full") || errors.As(err, &rf) {
				t.Fatalf("want the step's error after a clean rollback, got %v", err)
			}
			f.want(t, "old a", "old b", "<absent>")
			f.clean(t)
		})
	}
}

// After the commit point a failing step cannot undo the change: the commit
// stands, run says so by returning nil, and logs the step.
func TestJournal_FailureAfterTheCommitPointStillCommits(t *testing.T) {
	for _, step := range []commitStep{stepCommit, stepSync, stepCleanup} {
		t.Run(fmt.Sprintf("after step %d", step), func(t *testing.T) {
			f := newJFix(t)
			log := &syncBuffer{}
			j := newJournal(f.dir, f.files(nil), failAfter(step, errors.New("late trouble")), slog.New(slog.NewTextHandler(log, nil)))
			if err := j.run(); err != nil {
				t.Fatalf("a failure after the commit point must not fail the commit: %v", err)
			}
			f.want(t, "new a", "new b", "new c")
			f.clean(t)
			expectLogged(t, log.String(), "a cleanup step failed", "late trouble")
		})
	}
}

// A backup that cannot be deleted is logged; the next start sweeps it.
func TestJournal_ABackupThatCannotBeDeletedIsLeftForTheSweep(t *testing.T) {
	f := newJFix(t)
	hooks := journalHooks{after: func(s commitStep) error {
		if s != stepSync {
			return nil
		}
		// users.yaml.bak becomes a directory with a child: remove fails.
		bak := f.b + backupSuffix
		if err := os.Remove(bak); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Join(bak, "child"), 0o755); err != nil {
			return err
		}
		return nil
	}}
	log := &syncBuffer{}
	if err := newJournal(f.dir, f.files(nil), hooks, slog.New(slog.NewTextHandler(log, nil))).run(); err != nil {
		t.Fatalf("the commit must stand: %v", err)
	}
	f.want(t, "new a", "new b", "new c")
	expectLogged(t, log.String(), "a cleanup step failed")
}

// The second of three renames fails: the first is put back, the third file
// (which did not exist) never appears, and nothing is left behind. Each rename
// is tried as the failing one.
func TestJournal_ARenameThatFailsRollsEverythingBack(t *testing.T) {
	for _, call := range []int{1, 2, 3} {
		t.Run(fmt.Sprintf("rename %d", call), func(t *testing.T) {
			f := newJFix(t)
			err := f.run(journalHooks{rename: renameFailing(call)})
			if err == nil || !strings.Contains(err.Error(), "cannot replace") {
				t.Fatalf("want the rename failure, got %v", err)
			}
			f.want(t, "old a", "old b", "<absent>")
			f.clean(t)
		})
	}
}

// A rollback that fails too is reported as such, and the journal and backups
// stay for the next start, which finishes the job.
func TestJournal_AFailedRollbackKeepsTheJournalForTheNextStart(t *testing.T) {
	f := newJFix(t)
	// rename 1 works, rename 2 fails, rename 3 is the put-back of config.yaml
	err := f.run(journalHooks{rename: renameFailing(2, 3)})
	var rf *rollbackFailedError
	if !errors.As(err, &rf) {
		t.Fatalf("want a rollback failure, got %v", err)
	}
	if !strings.Contains(err.Error(), "rename refused") || !strings.Contains(err.Error(), "stays for the next start") {
		t.Errorf("the error must carry both causes and say what happens next: %v", err)
	}
	if readOr(t, filepath.Join(f.dir, txnFileName)) == "<absent>" {
		t.Fatal("the journal must stay after a failed rollback")
	}
	if got := readOr(t, f.a+backupSuffix); got != "old a" {
		t.Errorf("config.yaml.bak must stay: %q", got)
	}
	if err := recoverDataDir(f.dir, quietLogger()); err != nil {
		t.Fatal(err)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// A data directory that turns read-only in the middle of a commit: the commit
// cannot finish, the rollback cannot write either, and the next start, with
// the directory writable again, puts the old state back.
func TestJournal_ADirectoryThatTurnsReadOnlyIsRecoveredAtTheNextStart(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs a directory the process cannot write to")
	}
	for _, c := range []struct {
		name  string
		after commitStep
		cause string
	}{
		{"before the renames", stepTemps, "cannot replace"},
		{"at the commit point", stepRename, "cannot delete the transaction journal"},
	} {
		t.Run(c.name, func(t *testing.T) {
			f := newJFix(t)
			t.Cleanup(func() { _ = os.Chmod(f.dir, 0o700) })
			err := f.run(journalHooks{after: func(s commitStep) error {
				if s == c.after {
					return os.Chmod(f.dir, 0o500)
				}
				return nil
			}})
			var rf *rollbackFailedError
			if !errors.As(err, &rf) || !strings.Contains(err.Error(), c.cause) {
				t.Fatalf("want a rollback failure after %q, got %v", c.cause, err)
			}
			if err := os.Chmod(f.dir, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := recoverDataDir(f.dir, quietLogger()); err != nil {
				t.Fatal(err)
			}
			f.want(t, "old a", "old b", "<absent>")
			f.clean(t)
		})
	}
}

// A new journal never overwrites an unfinished one: it holds the only record
// of what to put back.
func TestJournal_RefusesToStartOverAnUnfinishedJournal(t *testing.T) {
	f := newJFix(t)
	txnPath := filepath.Join(f.dir, txnFileName)
	writeFile(t, txnPath, "keep me")
	err := f.run(journalHooks{})
	if err == nil || !strings.Contains(err.Error(), "unfinished transaction journal") {
		t.Fatalf("want a refusal, got %v", err)
	}
	if got := readOr(t, txnPath); got != "keep me" {
		t.Errorf("the journal was touched: %q", got)
	}
	f.want(t, "old a", "old b", "<absent>")
}

// The round-trip check: what is read back from each temp must be what was
// written and must pass the caller's check, or nothing is renamed.
func TestJournal_RoundTripCheckRefusesTheCommit(t *testing.T) {
	cases := []struct {
		name   string
		verify func([]byte) error
		hooks  func(dir string) journalHooks
		want   string
	}{
		{"the caller's check fails", func([]byte) error { return errors.New("sealed wrong") }, func(string) journalHooks { return journalHooks{} }, "round-trip check of the new users.yaml failed: sealed wrong"},
		{"a temp reads back short", nil, func(dir string) journalHooks {
			return damageTemps(dir, func(p string) error {
				return os.Truncate(p, 1)
			})
		}, "differs from what was written"},
		{"a temp cannot be read back", nil, func(dir string) journalHooks {
			return damageTemps(dir, os.Remove)
		}, "cannot read back"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newJFix(t)
			err := newJournal(f.dir, f.files(c.verify), c.hooks(f.dir), quietLogger()).run()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want %q, got %v", c.want, err)
			}
			f.want(t, "old a", "old b", "<absent>")
			f.clean(t)
		})
	}
}

// damageTemps applies act to every temp file once the temps are written.
func damageTemps(dir string, act func(path string) error) journalHooks {
	return journalHooks{after: func(s commitStep) error {
		return eachTemp(dir, s, act)
	}}
}

// eachTemp applies act to every temp file in dir once the temps are written.
func eachTemp(dir string, step commitStep, act func(path string) error) error {
	if step != stepTemps {
		return nil
	}
	temps, err := filepath.Glob(filepath.Join(dir, tempPrefix+"*"))
	if err != nil {
		return err
	}
	for _, p := range temps {
		if err := act(p); err != nil {
			return err
		}
	}
	return nil
}

// Inputs the journal cannot cover are refused before anything is written.
func TestJournal_RefusesWhatItCannotCover(t *testing.T) {
	other := t.TempDir()
	blocker := filepath.Join(t.TempDir(), "blocker")
	writeFile(t, blocker, "x")
	cases := []struct {
		name  string
		dir   func(f *jfix) string
		files func(f *jfix) []journalFile
		want  string
	}{
		{"a file outside the data directory", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			return []journalFile{{path: filepath.Join(other, "users.yaml"), data: []byte("x"), perm: 0o600}}
		}, "is not in the data directory"},
		{"the journal's own name", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			return []journalFile{{path: filepath.Join(f.dir, txnFileName), data: []byte("x"), perm: 0o600}}
		}, "reserves"},
		{"a backup name", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			return []journalFile{{path: filepath.Join(f.dir, "users.yaml.bak"), data: []byte("x"), perm: 0o600}}
		}, "reserves"},
		{"a temp name", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			return []journalFile{{path: filepath.Join(f.dir, ".tmp-1"), data: []byte("x"), perm: 0o600}}
		}, "reserves"},
		{"one file twice", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			return []journalFile{{path: f.a, data: []byte("1"), perm: 0o600}, {path: f.a, data: []byte("2"), perm: 0o600}}
		}, "written twice"},
		{"a directory that cannot be made", func(f *jfix) string { return filepath.Join(blocker, "sub") }, func(f *jfix) []journalFile {
			return []journalFile{{path: filepath.Join(blocker, "sub", "users.yaml"), data: []byte("x"), perm: 0o600}}
		}, "blocker"},
		{"a stale backup that cannot be cleared", func(f *jfix) string { return f.dir }, func(f *jfix) []journalFile {
			if err := os.MkdirAll(filepath.Join(f.a+backupSuffix, "child"), 0o755); err != nil {
				t.Fatal(err)
			}
			return f.files(nil)
		}, "cannot clear the stale backup"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newJFix(t)
			err := newJournal(c.dir(f), c.files(f), journalHooks{}, quietLogger()).run()
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want %q, got %v", c.want, err)
			}
			if got := readOr(t, filepath.Join(f.dir, txnFileName)); got != "<absent>" {
				t.Errorf("a refusal must write no journal")
			}
			f.want(t, "old a", "old b", "<absent>")
		})
	}
}

// A leftover backup of a file is never put back by a later commit that fails:
// prepare clears it first, so the rollback restores the file's own content.
func TestJournal_AStaleBackupIsNotPutBackOverTheTarget(t *testing.T) {
	f := newJFix(t)
	writeFile(t, f.a+backupSuffix, "foreign copy")
	if err := f.run(failAfter(stepTxn, errors.New("disk full"))); err == nil {
		t.Fatal("want the failure")
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// A target the journal cannot read (here a directory) stops the commit at the
// backup step, and the files already backed up are put back.
func TestJournal_ATargetItCannotReadChangesNothing(t *testing.T) {
	f := newJFix(t)
	if err := os.Remove(f.b); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(f.b, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	err := f.run(journalHooks{})
	if err == nil || !strings.Contains(err.Error(), "cannot back up "+f.b) {
		t.Fatalf("want the backup failure naming the file, got %v", err)
	}
	if got := readOr(t, f.a); got != "old a" {
		t.Errorf("config.yaml: %q", got)
	}
	if _, err := os.Stat(filepath.Join(f.b, "child")); err != nil {
		t.Errorf("the directory in the way was damaged: %v", err)
	}
	f.clean(t)
}

// A panic before the commit point is rolled back and handed on as a
// *stepPanic, for the writer to raise again.
func TestJournal_APanicBeforeTheCommitPointRollsBack(t *testing.T) {
	f := newJFix(t)
	err := f.run(panicAfter(stepVerify))
	var sp *stepPanic
	if !errors.As(err, &sp) || sp.value != "boom" || len(sp.stack) == 0 {
		t.Fatalf("want a *stepPanic carrying the value and a stack, got %v", err)
	}
	if !strings.Contains(err.Error(), "boom") {
		t.Errorf("the error must name the panic: %v", err)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// A panic after the commit point is not rolled back and is not swallowed: it
// goes up to the writer, with the change committed.
func TestJournal_APanicAfterTheCommitPointGoesUp(t *testing.T) {
	for _, step := range []commitStep{stepCommit, stepCleanup} {
		t.Run(fmt.Sprintf("after step %d", step), func(t *testing.T) {
			f := newJFix(t)
			j := newJournal(f.dir, f.files(nil), panicAfter(step), quietLogger())
			var got any
			func() {
				defer func() { got = recover() }()
				_ = j.run()
			}()
			if got != "boom" {
				t.Fatalf("want the panic to go up, got %v", got)
			}
			if !j.committed {
				t.Error("the journal must know the commit point was passed")
			}
			f.want(t, "new a", "new b", "new c")
		})
	}
}

func TestRecoverDataDir_RollsBackFromTheJournalAlone(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "config.yaml"), filepath.Join(dir, "users.yaml")
	writeFile(t, a, "half written")
	writeFile(t, a+backupSuffix, "old a")
	writeFile(t, b, "created by the interrupted write")
	writeFile(t, filepath.Join(dir, txnFileName), `{"version":1,"files":[{"name":"config.yaml","existed":true},{"name":"users.yaml","existed":false}]}`)
	writeFile(t, filepath.Join(dir, ".tmp-123"), "stray")
	log := &syncBuffer{}
	if err := recoverDataDir(dir, slog.New(slog.NewTextHandler(log, nil))); err != nil {
		t.Fatal(err)
	}
	if got := readOr(t, a); got != "old a" {
		t.Errorf("config.yaml: %q", got)
	}
	if got := readOr(t, b); got != "<absent>" {
		t.Errorf("users.yaml, which the write created, must be gone: %q", got)
	}
	expectLogged(t, log.String(), "an interrupted store write was found", "config.yaml,users.yaml")
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Errorf("only config.yaml may remain: %v %v", entries, err)
	}
}

// With no journal only leftovers are swept: temps, and the backups of the
// journal's own files. Anything else in the directory stays, an operator's
// copy of another file included.
func TestRecoverDataDir_SweepsOnlyTheJournalsLeftovers(t *testing.T) {
	dir := t.TempDir()
	for name, content := range map[string]string{
		"users.yaml": "keep", "users.yaml.bak": "x", "config.yaml.bak": "x", "connections.yaml.bak": "x", "backup.yaml.bak": "x",
		".tmp-1": "x", ".tmp-2": "x", "notes.bak": "keep", "other.yaml.bak": "keep", "tls.crt": "keep",
	} {
		writeFile(t, filepath.Join(dir, name), content)
	}
	if err := os.Mkdir(filepath.Join(dir, ".tmp-dir"), 0o755); err != nil {
		t.Fatal(err)
	}
	log := &syncBuffer{}
	if err := recoverDataDir(dir, slog.New(slog.NewTextHandler(log, nil))); err != nil {
		t.Fatal(err)
	}
	var left []string
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		left = append(left, e.Name())
	}
	if got, want := strings.Join(left, " "), ".tmp-dir notes.bak other.yaml.bak tls.crt users.yaml"; got != want {
		t.Errorf("left in the directory: want %q, got %q", want, got)
	}
	expectLogged(t, log.String(), "removed leftovers", ".tmp-1", "users.yaml.bak")
}

func TestRecoverDataDir_ADirectoryThatDoesNotExistIsFine(t *testing.T) {
	if err := recoverDataDir(filepath.Join(t.TempDir(), "absent"), quietLogger()); err != nil {
		t.Fatal(err)
	}
}

// A journal that cannot be trusted stops the start with what to do, and is
// kept.
func TestRecoverDataDir_RefusesADamagedJournal(t *testing.T) {
	cases := []struct{ name, body string }{
		{"not JSON", "{not json"},
		{"an unknown field", `{"version":1,"files":[{"name":"users.yaml","existed":true}],"extra":1}`},
		{"another version", `{"version":2,"files":[{"name":"users.yaml","existed":true}]}`},
		{"no files", `{"version":1,"files":[]}`},
		{"a path instead of a name", `{"version":1,"files":[{"name":"../users.yaml","existed":true}]}`},
		{"a reserved name", `{"version":1,"files":[{"name":"txn","existed":true}]}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			writeFile(t, filepath.Join(dir, "users.yaml"), "untouched")
			writeFile(t, filepath.Join(dir, txnFileName), c.body)
			err := recoverDataDir(dir, quietLogger())
			if err == nil || !strings.Contains(err.Error(), "is damaged") || !strings.Contains(err.Error(), ".bak files") {
				t.Fatalf("want the damaged-journal error with its remedy, got %v", err)
			}
			if got := readOr(t, filepath.Join(dir, txnFileName)); got != c.body {
				t.Errorf("the journal must be kept: %q", got)
			}
			if got := readOr(t, filepath.Join(dir, "users.yaml")); got != "untouched" {
				t.Errorf("nothing may be restored from a journal that cannot be trusted: %q", got)
			}
		})
	}
}

func TestRecoverDataDir_ErrorsNameTheCauseAndKeepTheJournal(t *testing.T) {
	t.Run("the journal cannot be read", func(t *testing.T) {
		dir := t.TempDir()
		if err := os.Mkdir(filepath.Join(dir, txnFileName), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := recoverDataDir(dir, quietLogger()); err == nil || !strings.Contains(err.Error(), "cannot read the transaction journal") {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("a backup cannot be put back", func(t *testing.T) {
		dir := t.TempDir()
		target := filepath.Join(dir, "users.yaml")
		writeFile(t, target+backupSuffix, "old")
		if err := os.MkdirAll(filepath.Join(target, "child"), 0o755); err != nil { // a directory in the way
			t.Fatal(err)
		}
		body := `{"version":1,"files":[{"name":"users.yaml","existed":true}]}`
		writeFile(t, filepath.Join(dir, txnFileName), body)
		err := recoverDataDir(dir, quietLogger())
		if err == nil || !strings.Contains(err.Error(), "cannot roll back the interrupted store write") || !strings.Contains(err.Error(), "is kept") {
			t.Fatalf("got %v", err)
		}
		if got := readOr(t, filepath.Join(dir, txnFileName)); got != body {
			t.Errorf("the journal must be kept: %q", got)
		}
		if got := readOr(t, target+backupSuffix); got != "old" {
			t.Errorf("the backup must be kept: %q", got)
		}
	})
}

func TestSweepLeftovers_ADataDirectoryThatIsAFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows reports a file listed as a directory as a missing path")
	}
	file := filepath.Join(t.TempDir(), "plain")
	writeFile(t, file, "x")
	if err := sweepLeftovers(file, quietLogger()); err == nil || !strings.Contains(err.Error(), "cannot list the data directory") {
		t.Errorf("got %v", err)
	}
}

func TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs a directory the process cannot write to")
	}
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, ".tmp-1"), "x")
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o700) })
	log := &syncBuffer{}
	if err := sweepLeftovers(dir, slog.New(slog.NewTextHandler(log, nil))); err != nil {
		t.Fatalf("an unremovable leftover is clutter, not a failure: %v", err)
	}
	expectLogged(t, log.String(), "cannot remove a leftover", ".tmp-1")
}

func TestSyncDir_ReportsAMissingDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows has no directory sync")
	}
	if err := syncDir(t.TempDir()); err != nil {
		t.Errorf("a directory: %v", err)
	}
	if err := syncDir(filepath.Join(t.TempDir(), "absent")); err == nil {
		t.Error("a missing directory must be an error")
	}
}
