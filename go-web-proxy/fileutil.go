package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
)

// The journaled commit. Every change to a store file (config.yaml, users.yaml,
// connections.yaml, backup.yaml), one file or several, goes through one path
// (journal.run, reached from writer.Do). Several renames are not atomic as a
// group, so a journal file in the data directory is the commit point: while
// it exists a crash or a failure rolls everything back, once it is gone the
// change stands.
//
//	1 write txn (the targets, and which of them did not exist); fsync
//	2 copy each existing target to <target>.bak; fsync
//	3 write each new content to a temp file; fsync
//	4 read each temp back and run the caller's verify on the bytes (round trip)
//	5 rename each temp over its target; fsync the directory
//	6 delete txn (the commit point)
//	7 fsync the directory
//	8 delete the backups
//
// A failure up to step 6 is rolled back in the running process (backups put
// back, created files removed, temps and txn removed); a rollback that fails
// too leaves txn in place for recoverDataDir at the next start. A crash at any
// step is the same at the next start: txn present means roll back, absent
// means the change was committed and only leftovers remain to sweep.
const (
	txnFileName  = "txn"
	backupSuffix = ".bak"
	tempPrefix   = ".tmp-"
	txnVersion   = 1
)

// commitStep names a step of the commit (the numbers in the list above);
// journalHooks.after reports each one once it has completed. stepCommit is the
// commit point, stepSync and stepCleanup come after it.
type commitStep int

const (
	stepTxn commitStep = iota + 1
	stepBackups
	stepTemps
	stepVerify
	stepRename
	stepCommit
	stepSync
	stepCleanup
)

// errSimulatedCrash is what a test hook returns to stop a commit dead after a
// step, leaving the directory as a power loss would.
var errSimulatedCrash = errors.New("simulated crash: the commit stopped without any cleanup")

// journalHooks are the seams tests use; production leaves them zero.
type journalHooks struct {
	// after runs once a step has completed. errSimulatedCrash stops the
	// commit on the spot with no cleanup; any other error fails that step.
	after func(step commitStep) error
	// rename replaces os.Rename for the renames of step 5 and for putting a
	// backup back.
	rename func(oldpath, newpath string) error
}

// journalFile is one file a commit writes. verify, when set, gets the bytes
// read back from the temp file (the round-trip check): an error fails the
// commit before anything is renamed.
type journalFile struct {
	path   string
	data   []byte
	perm   fs.FileMode
	verify func(data []byte) error
}

// txnRecord is the journal file's content: base names only, so a damaged or
// planted journal can never point outside the data directory.
type txnRecord struct {
	Version int         `json:"version"`
	Files   []txnTarget `json:"files"`
}

type txnTarget struct {
	Name    string `json:"name"`
	Existed bool   `json:"existed"`
}

// stepPanic is a panic a step raised before the commit point, caught so the
// commit could roll back; the writer raises it again afterwards.
type stepPanic struct {
	value any
	stack []byte
}

func (p *stepPanic) Error() string { return fmt.Sprintf("panic during a store write: %v", p.value) }

// rollbackFailedError is a failed commit whose rollback failed too. The
// journal and the backups are still on disk; the process must exit and let
// recoverDataDir finish the job.
type rollbackFailedError struct {
	cause    error
	rollback error
}

func (e *rollbackFailedError) Error() string {
	return fmt.Sprintf("%v; rolling back failed too: %v; the transaction journal stays for the next start to recover", e.cause, e.rollback)
}

// journal is one commit in progress. It is used once and from one goroutine.
type journal struct {
	dir    string
	files  []journalFile
	hooks  journalHooks
	logger *slog.Logger
	rename func(oldpath, newpath string) error

	targets []txnTarget
	// staged holds the temp file of each journalFile, in order. scratch holds
	// the other temps (the journal's and the backups'), renamed away on the
	// way, so a rollback removes whatever is left of both.
	staged  []string
	scratch []string
	// committed is set once txn is deleted. A panic after it is not rolled
	// back: the writer logs it and exits.
	committed bool
}

func newJournal(dir string, files []journalFile, hooks journalHooks, logger *slog.Logger) *journal {
	j := &journal{dir: dir, files: files, hooks: hooks, logger: logger, rename: os.Rename}
	if hooks.rename != nil {
		j.rename = hooks.rename
	}
	return j
}

// commitJournal writes files as one journaled commit with no writer around
// it: for the first write on a fresh volume and for test fixtures. A change
// to a live store goes through writer.Do.
func commitJournal(dir string, files []journalFile) error {
	return newJournal(dir, files, journalHooks{}, slog.New(slog.DiscardHandler)).run()
}

func (j *journal) txnPath() string { return filepath.Join(j.dir, txnFileName) }

// run performs the commit. It returns nil once the change is committed, even
// if a later cleanup step failed (that is logged: the next start sweeps it).
// Any other error means nothing changed, or a *rollbackFailedError. A *stepPanic
// means a step panicked and was rolled back.
func (j *journal) run() error {
	if err := j.prepare(); err != nil {
		return err
	}
	steps := []struct {
		id commitStep
		do func() error
	}{
		{stepTxn, j.writeTxn},
		{stepBackups, j.backup},
		{stepTemps, j.writeTemps},
		{stepVerify, j.verify},
		{stepRename, j.renameAll},
		{stepCommit, j.dropTxn},
		{stepSync, j.syncDirStep},
		{stepCleanup, j.dropBackups},
	}
	for _, s := range steps {
		err := j.attempt(s.id, s.do)
		if errors.Is(err, errSimulatedCrash) {
			return err
		}
		if err == nil {
			continue
		}
		if !j.committed {
			return j.fail(err)
		}
		var sp *stepPanic
		if errors.As(err, &sp) {
			panic(sp.value)
		}
		j.logger.Warn("store write committed, but a cleanup step failed; the next start sweeps the leftovers", "step", int(s.id), "err", err)
	}
	return nil
}

// attempt runs one step and the test hook after it. Before the commit point a
// panic becomes a *stepPanic so run can roll back; after it a panic goes on
// to the writer.
func (j *journal) attempt(id commitStep, do func() error) (err error) {
	if !j.committed {
		defer func() {
			if r := recover(); r != nil {
				err = &stepPanic{value: r, stack: debug.Stack()}
			}
		}()
	}
	err = do()
	if err == nil && id == stepCommit {
		j.committed = true
	}
	if err == nil && j.hooks.after != nil {
		err = j.hooks.after(id)
	}
	return err
}

// fail rolls back after a failure before the commit point.
func (j *journal) fail(cause error) error {
	if rerr := j.rollback(); rerr != nil {
		return &rollbackFailedError{cause: cause, rollback: rerr}
	}
	return cause
}

// prepare checks the files and notes which targets exist. Nothing has been
// written, so a failure here needs no rollback. An unfinished journal from an
// earlier failed rollback is never overwritten: it holds the only record of
// what to put back.
func (j *journal) prepare() error {
	dir := filepath.Clean(j.dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, f := range j.files {
		if filepath.Clean(filepath.Dir(f.path)) != dir {
			return fmt.Errorf("%s is not in the data directory %s: the journal covers one directory", f.path, dir)
		}
		name := filepath.Base(f.path)
		if err := checkJournalName(name); err != nil {
			return err
		}
		if seen[name] {
			return fmt.Errorf("%s is written twice in one commit", name)
		}
		seen[name] = true
		_, err := os.Stat(f.path)
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("cannot examine %s before replacing it: %w", f.path, err)
		}
		j.targets = append(j.targets, txnTarget{Name: name, Existed: err == nil})
	}
	_, err := os.Lstat(j.txnPath())
	switch {
	case err == nil:
		return fmt.Errorf("an unfinished transaction journal %s is present (an earlier rollback failed); restart the gateway so it is recovered", j.txnPath())
	case !errors.Is(err, fs.ErrNotExist):
		return fmt.Errorf("cannot examine the transaction journal %s: %w", j.txnPath(), err)
	}
	// A backup that is already there is a leftover (or somebody's own copy
	// under a reserved name), never this commit's: clear it now, before any
	// step could put it back over a target.
	for i, t := range j.targets {
		if !t.Existed {
			continue
		}
		if err := os.Remove(j.files[i].path + backupSuffix); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("cannot clear the stale backup of %s: %w", j.files[i].path, err)
		}
	}
	return nil
}

func (j *journal) writeTxn() error {
	raw, _ := json.Marshal(txnRecord{Version: txnVersion, Files: j.targets}) // cannot fail: strings, a bool and an int
	tmp, err := writeTemp(j.dir, raw, 0o600)
	if err == nil {
		j.scratch = append(j.scratch, tmp)
		err = os.Rename(tmp, j.txnPath())
	}
	if err != nil {
		return fmt.Errorf("cannot write the transaction journal: %w", err)
	}
	return syncDir(j.dir)
}

// backup copies each existing target to <target>.bak. The copy is written as
// a temp file and renamed, so a .bak that exists is always whole: a crash
// while copying must never leave a half copy that recovery would put back.
func (j *journal) backup() error {
	for i, t := range j.targets {
		if !t.Existed {
			continue
		}
		src := j.files[i].path
		data, rerr := os.ReadFile(src)
		info, serr := os.Stat(src)
		err := errors.Join(rerr, serr)
		if err == nil {
			var tmp string
			if tmp, err = writeTemp(j.dir, data, info.Mode().Perm()); err == nil {
				j.scratch = append(j.scratch, tmp)
				err = os.Rename(tmp, src+backupSuffix)
			}
		}
		if err != nil {
			return fmt.Errorf("cannot back up %s: %w", src, err)
		}
	}
	return syncDir(j.dir)
}

func (j *journal) writeTemps() error {
	for _, f := range j.files {
		tmp, err := writeTemp(j.dir, f.data, f.perm)
		if err != nil {
			return fmt.Errorf("cannot stage %s: %w", f.path, err)
		}
		j.staged = append(j.staged, tmp)
	}
	return nil
}

// verify is the round-trip check: each temp is read back, must hold the bytes
// that were written, and must pass the caller's verify (for a sealed file:
// decrypts and parses). A commit that cannot read its own writing back is
// refused before any target is touched.
func (j *journal) verify() error {
	for i, f := range j.files {
		got, err := os.ReadFile(j.staged[i])
		if err != nil {
			return fmt.Errorf("cannot read back the new %s: %w", filepath.Base(f.path), err)
		}
		if !bytes.Equal(got, f.data) {
			return fmt.Errorf("the new %s differs from what was written to disk (a disk fault?)", filepath.Base(f.path))
		}
		if f.verify != nil {
			if err := f.verify(got); err != nil {
				return fmt.Errorf("round-trip check of the new %s failed: %w", filepath.Base(f.path), err)
			}
		}
	}
	return nil
}

func (j *journal) renameAll() error {
	for i, f := range j.files {
		if err := j.rename(j.staged[i], f.path); err != nil {
			return fmt.Errorf("cannot replace %s: %w", f.path, err)
		}
	}
	return syncDir(j.dir)
}

// dropTxn is the commit point.
func (j *journal) dropTxn() error {
	if err := os.Remove(j.txnPath()); err != nil {
		return fmt.Errorf("cannot delete the transaction journal: %w", err)
	}
	return nil
}

func (j *journal) syncDirStep() error { return syncDir(j.dir) }

func (j *journal) dropBackups() error {
	var errs []error
	for i, t := range j.targets {
		if !t.Existed {
			continue
		}
		if err := os.Remove(j.files[i].path + backupSuffix); err != nil && !errors.Is(err, fs.ErrNotExist) {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// rollback undoes a commit that failed before its commit point: backups back
// over their targets, targets the commit created removed, then this commit's
// temps and txn. txn goes last, and only when everything before it worked, so
// a failed rollback can be finished by recoverDataDir.
func (j *journal) rollback() error {
	err := restoreFiles(j.dir, j.targets, j.rename)
	for _, tmp := range append(append([]string{}, j.scratch...), j.staged...) {
		if rerr := os.Remove(tmp); rerr != nil && !errors.Is(rerr, fs.ErrNotExist) {
			err = errors.Join(err, rerr)
		}
	}
	if err != nil {
		return err
	}
	if rerr := os.Remove(j.txnPath()); rerr != nil && !errors.Is(rerr, fs.ErrNotExist) {
		return rerr
	}
	return syncDir(j.dir)
}

// restoreFiles puts every target back as it was before the commit: an
// existing one from its .bak (a missing .bak means it was never replaced), one
// the commit created removed. It tries every file and joins the errors. It is
// safe to run again after a partial run.
func restoreFiles(dir string, targets []txnTarget, rename func(oldpath, newpath string) error) error {
	var errs []error
	for _, t := range targets {
		path := filepath.Join(dir, t.Name)
		var err error
		if t.Existed {
			err = rename(path+backupSuffix, path)
		} else {
			err = os.Remove(path)
		}
		if err != nil && !errors.Is(err, fs.ErrNotExist) {
			errs = append(errs, fmt.Errorf("cannot restore %s: %w", path, err))
		}
	}
	return errors.Join(errs...)
}

// checkJournalName refuses a name the journal could not keep apart from its
// own files, or that is not a plain file name.
func checkJournalName(name string) error {
	switch {
	case name == "." || name == ".." || name != filepath.Base(name):
		return fmt.Errorf("%q is not a plain file name", name)
	case name == txnFileName || strings.HasSuffix(name, backupSuffix) || strings.HasPrefix(name, tempPrefix):
		return fmt.Errorf("%q is a name the transaction journal reserves", name)
	}
	return nil
}

// journalTargetNames are the files the journal covers, which is what the
// start-up sweep may remove a .bak of: an operator's own copy of anything else
// (config.yaml.bak is not on this list on purpose, see recoverDataDir) stays.
func journalTargetNames() []string {
	return []string{
		filepath.Base(configFilePath),
		filepath.Base(defaultUsersFile),
		filepath.Base(defaultConnectionsFile),
		scheduleFileName,
	}
}

// recoverDataDir runs once at process start, before config.yaml is read, in
// every mode that has a data directory. If txn exists a commit was cut short:
// every backup goes back over its target, targets that did not exist are
// removed, then the leftovers and txn go. If txn does not exist the last
// commit completed (or never began) and only stray temps and backups are
// swept. A missing directory is fine. An error means the directory is not
// safe to start on: it names what to do.
//
// The sweep removes <name>.bak only for the journal's own files (the four
// store files), plus every .tmp-* file. Operators must not keep their own
// copies under those names in the data directory.
func recoverDataDir(dir string, logger *slog.Logger) error {
	return recoverDir(dir, journalTargetNames(), logger)
}

// recoverDir is recoverDataDir for any directory a journal covers: bakNames
// are the files whose .bak the sweep may remove (the certificate's directory
// passes the certificate and key names, tls.go).
func recoverDir(dir string, bakNames []string, logger *slog.Logger) error {
	txnPath := filepath.Join(dir, txnFileName)
	raw, err := os.ReadFile(txnPath)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		return sweepLeftoversOf(dir, bakNames, logger)
	case err != nil:
		return fmt.Errorf("cannot read the transaction journal %s: %w", txnPath, err)
	}
	rec, err := parseTxn(raw)
	if err != nil {
		return fmt.Errorf("the transaction journal %s is damaged (%w), so the gateway cannot tell which change was interrupted: restore %s from your volume backup (for the data directory, importing a backup into a fresh volume also works)", txnPath, err, dir)
	}
	names := make([]string, len(rec.Files))
	for i, t := range rec.Files {
		names[i] = t.Name
	}
	logger.Warn("an interrupted store write was found; rolling it back", "files", strings.Join(names, ","))
	if err := restoreFiles(dir, rec.Files, os.Rename); err != nil {
		return fmt.Errorf("cannot roll back the interrupted store write: %w; fix the cause (permissions, disk) and start again, the journal %s is kept", err, txnPath)
	}
	if err := sweepLeftoversOf(dir, bakNames, logger); err != nil {
		return err
	}
	if err := os.Remove(txnPath); err != nil {
		return fmt.Errorf("cannot delete the transaction journal after rolling back: %w", err)
	}
	return syncDir(dir)
}

// parseTxn reads a journal strictly: it is a file the gateway wrote, so
// anything unexpected means damage or tampering.
func parseTxn(raw []byte) (txnRecord, error) {
	var rec txnRecord
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&rec); err != nil {
		return txnRecord{}, errors.New("it does not parse")
	}
	if rec.Version != txnVersion {
		return txnRecord{}, fmt.Errorf("it has version %d, which this gateway does not read", rec.Version)
	}
	if len(rec.Files) == 0 {
		return txnRecord{}, errors.New("it names no files")
	}
	for _, t := range rec.Files {
		if err := checkJournalName(t.Name); err != nil {
			return txnRecord{}, err
		}
	}
	return rec, nil
}

// sweepLeftovers removes the temp files and the journal's backups a finished
// or interrupted commit left. A file that cannot be removed is logged, not
// fatal: it is clutter, not state.
func sweepLeftovers(dir string, logger *slog.Logger) error {
	return sweepLeftoversOf(dir, journalTargetNames(), logger)
}

// sweepLeftoversOf is sweepLeftovers with the file names whose .bak may go.
func sweepLeftoversOf(dir string, names []string, logger *slog.Logger) error {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("cannot list the data directory %s: %w", dir, err)
	}
	backups := map[string]bool{}
	for _, n := range names {
		backups[n+backupSuffix] = true
	}
	var removed []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !(strings.HasPrefix(name, tempPrefix) || backups[name]) {
			continue
		}
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			logger.Warn("cannot remove a leftover of an earlier store write", "file", name, "err", err)
			continue
		}
		removed = append(removed, name)
	}
	if len(removed) > 0 {
		logger.Info("removed leftovers of an earlier store write", "files", strings.Join(removed, ","))
	}
	return nil
}

// writeTemp writes data to a synced temp file in dir with perm and returns its
// name. On failure nothing is left behind.
func writeTemp(dir string, data []byte, perm fs.FileMode) (string, error) {
	tmp, err := os.CreateTemp(dir, tempPrefix+"*")
	if err != nil {
		return "", err
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
		return "", err
	}
	return tmp.Name(), nil
}

// syncDir flushes a directory's entries (a rename or a delete) to disk.
// Windows cannot open a directory for syncing and has no equivalent.
func syncDir(dir string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	return errors.Join(d.Sync(), d.Close())
}
