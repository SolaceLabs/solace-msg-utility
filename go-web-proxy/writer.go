package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"sync"
)

// The writer is the only way the gateway changes a store file. One lock covers
// all of them (config.yaml, users.yaml, connections.yaml, backup.yaml), held
// around a whole transaction: check, plan, stage, commit (the journal in
// fileutil.go), publish, after-commit work. The lock is a one-slot channel, so
// a request that is waiting gives up when its client goes away.
//
// A handler does its slow, input-only work first (hashing a password, opening
// a backup), then:
//
//	err := w.Do(r.Context(), func(tx *txn) error {
//		if err := tx.check(usersPath); err != nil { return err } // changed on disk?
//		... re-check the caller, find the record, compare the rev, validate ...
//		tx.stage(usersPath, sealed, 0o600, verify)               // or sealer.stageDoc
//		tx.onPublish(func() { /* swap the in-memory snapshot */ })
//		tx.afterCommit(func() { /* audit line, close sockets, sign-outs */ })
//		return nil
//	})
//	if code, ok := writeStoreError(rw, err); ok { /* audit the refusal with code */ return }
//
// Nothing the op does before it returns touches a file or live memory: it
// plans on copies. When it returns an error nothing is written.
type writer struct {
	dir    string
	sums   *checksums
	logger *slog.Logger
	slot   chan struct{}
	// gate runs after the lock is taken and before the op: a non-nil error
	// refuses the transaction as is (the audit.onFailure refuse check returns
	// errAuditUnavailable). nil means no gate.
	gate func() error
	// exit is os.Exit in production. It is called when the process cannot be
	// trusted to go on: a rollback that failed, a panic after the commit
	// point. The restart runs recoverDataDir and loads what is on disk.
	exit func(code int)
	// pub is the publish lock. A commit publishes memory (and the new
	// checksums) holding its write side, once for all the files it wrote; a
	// backup reads users, connections and settings holding its read side
	// (snapshot), so it never sees half of an import. Always take pub before
	// any store's own lock, never after.
	pub sync.RWMutex
	// hooks are the commit's test seams, zero in production.
	hooks journalHooks
}

// newWriter makes the writer for the data directory dir; every file it writes
// must be directly in dir, because that is where txn lives. sums may be nil:
// then there is no disk check and no rev (the registry with no key).
func newWriter(dir string, sums *checksums, logger *slog.Logger) *writer {
	if sums == nil {
		sums, _ = newChecksums(nil) // cannot fail without a key
	}
	if logger == nil {
		logger = slog.New(slog.DiscardHandler)
	}
	return &writer{dir: dir, sums: sums, logger: logger, slot: make(chan struct{}, 1), exit: os.Exit}
}

// rev is the settings rev of path (checksums.rev): "" without a store key.
func (w *writer) rev(path string) string { return w.sums.rev(path) }

// snapshot runs fn holding the read side of the publish lock: what fn reads
// from the stores is one committed state, never half of a transaction.
func (w *writer) snapshot(fn func()) {
	w.pub.RLock()
	defer w.pub.RUnlock()
	fn()
}

// Do runs op as one transaction.
//
//   - It waits for the lock; if ctx ends first it returns *clientGoneError and
//     nothing happened. After getting the lock it checks ctx once more.
//   - The gate runs, then op. An error from either is returned unchanged and
//     nothing is written.
//   - When op returns nil and staged files, they are checked against the disk
//     once more (the sticky changed-on-disk refusal, in case op did not call
//     tx.check), committed through the journal, and published: the new
//     checksums are remembered and the onPublish funcs run, in one critical
//     section. Then the afterCommit funcs run, still under the lock.
//   - From the moment the commit starts a vanished client no longer matters:
//     it runs to the end.
//   - A failed commit has been rolled back and returns *writeFailedError.
//   - A panic in op, or in the commit before its commit point, leaves nothing
//     changed and is raised again for the recover middleware to turn into a
//     500. A panic after the commit point is logged and calls the exit hook.
func (w *writer) Do(ctx context.Context, op func(tx *txn) error) (err error) {
	select {
	case w.slot <- struct{}{}:
	case <-ctx.Done():
		return &clientGoneError{err: ctx.Err()}
	}
	defer func() { <-w.slot }()
	if cerr := ctx.Err(); cerr != nil {
		return &clientGoneError{err: cerr}
	}
	if w.gate != nil {
		if gerr := w.gate(); gerr != nil {
			return gerr
		}
	}

	tx := &txn{w: w, ctx: ctx, index: map[string]int{}}
	var j *journal
	defer func() {
		r := recover()
		if r == nil {
			return
		}
		if j != nil && j.committed {
			w.logger.Error("panic after the commit point; exiting so the restart loads the committed state", "panic", r, "stack", string(debug.Stack()))
			w.exit(1)
			err = fmt.Errorf("panic after the commit point: %v", r)
			return
		}
		panic(r)
	}()

	if err := op(tx); err != nil {
		return err
	}
	if tx.failed != nil {
		return &writeFailedError{err: tx.failed}
	}
	if len(tx.files) > 0 {
		if err := tx.check(tx.paths()...); err != nil {
			return err
		}
		j = newJournal(w.dir, tx.files, w.hooks, w.logger)
		if err := w.commit(j); err != nil {
			return err
		}
	}
	w.publish(tx)
	for _, fn := range tx.after {
		fn()
	}
	return nil
}

// commit runs the journal and sorts its failures.
func (w *writer) commit(j *journal) error {
	err := j.run()
	if err == nil {
		return nil
	}
	var rolledBackFailed *rollbackFailedError
	var panicked *stepPanic
	switch {
	case errors.Is(err, errSimulatedCrash):
		return err
	case errors.As(err, &rolledBackFailed):
		w.logger.Error("store write failed and could not be rolled back; exiting so the restart recovers it", "err", err)
		w.exit(1)
	case errors.As(err, &panicked):
		w.logger.Error("panic during a store write; rolled back", "panic", panicked.value, "stack", string(panicked.stack))
		panic(panicked.value)
	default:
		w.logger.Error("store write failed and was rolled back; nothing changed", "err", err)
	}
	return &writeFailedError{err: err}
}

// publish remembers the new checksums and runs the onPublish funcs, holding
// the write side of the publish lock for all of them together.
func (w *writer) publish(tx *txn) {
	w.pub.Lock()
	defer w.pub.Unlock()
	for _, f := range tx.files {
		w.sums.remember(f.path, f.data)
	}
	for _, fn := range tx.publish {
		fn()
	}
}

// txn is what an op sees: the checks and the staging area of one transaction.
// It is valid only inside the op.
type txn struct {
	w       *writer
	ctx     context.Context
	files   []journalFile
	index   map[string]int
	publish []func()
	after   []func()
	failed  error
}

// context is the request's context. It is for the op's own use; the commit
// does not look at it.
func (tx *txn) context() context.Context { return tx.ctx }

// check is the disk check: for each path, the keyed checksum of the bytes on
// disk must equal the one remembered. A mismatch returns *changedOnDiskError
// naming the file and stays in force for that file until restart. Call it
// first, before the existence and rev checks. Without a store key it does
// nothing.
func (tx *txn) check(paths ...string) error {
	for _, p := range paths {
		if err := tx.w.sums.check(p); err != nil {
			return err
		}
	}
	return nil
}

// stage puts a file into the transaction: data is what the file will hold and
// perm its mode (0o600 for the sealed files, 0o644 for config.yaml). verify,
// when not nil, gets the bytes read back from the temp file before anything is
// renamed (the round-trip check; sealer.stageDoc supplies it for a sealed
// document), and an error from it fails the commit. Staging a path twice keeps
// the last. The directory is the writer's; data must not be changed after the
// call.
func (tx *txn) stage(path string, data []byte, perm fs.FileMode, verify func(data []byte) error) {
	f := journalFile{path: filepath.Clean(path), data: data, perm: perm, verify: verify}
	if i, ok := tx.index[f.path]; ok {
		tx.files[i] = f
		return
	}
	tx.index[f.path] = len(tx.files)
	tx.files = append(tx.files, f)
}

// fail marks the transaction as one that cannot commit: Do writes nothing and
// returns err as a failed store write. It is for a step that does not fail in
// practice (encoding a store document), so an op need not carry an error it
// never sees. The first failure is the one reported.
func (tx *txn) fail(err error) {
	if tx.failed == nil {
		tx.failed = err
	}
}

// paths are the staged paths in staging order.
func (tx *txn) paths() []string {
	out := make([]string, len(tx.files))
	for i, f := range tx.files {
		out[i] = f.path
	}
	return out
}

// onPublish queues fn to run after the commit point, in the one critical
// section that also remembers the new checksums, with the other onPublish
// funcs of this transaction. Swap the in-memory snapshot here. It must be
// quick and must not call the writer.
func (tx *txn) onPublish(fn func()) { tx.publish = append(tx.publish, fn) }

// afterCommit queues fn to run once the change is published, still under the
// writer lock: the audit line, closing sockets, signing users out. It runs in
// queueing order.
func (tx *txn) afterCommit(fn func()) { tx.after = append(tx.after, fn) }

// rev is the settings rev of path as of now (writer.rev).
func (tx *txn) rev(path string) string { return tx.w.sums.rev(path) }

// ----- errors the handlers share ----------------------------------------------
//
// One mapping, so every endpoint answers the same way (classifyStoreError).

var (
	// errExists is a create (rev 0) of a name that exists: 409 exists.
	errExists = errors.New("already exists")
	// errRevRequired is a save without a rev: 400 rev_required.
	errRevRequired = errors.New("a rev is required")
	// errNotFound is a rev above 0 for a record that is gone: 404 not_found.
	errNotFound = errors.New("not found")
	// errAuditUnavailable is the refusal while audit.onFailure is refuse and
	// the audit log fails: 503 audit_unavailable.
	errAuditUnavailable = errors.New("the audit log cannot be written, so changes are refused until it can")
)

// staleError is a rev (or an import's basis) that is no longer current: 409
// stale, carrying the current value so the browser can say what moved.
type staleError struct {
	rev   any
	basis any
}

func (e *staleError) Error() string { return "stale: it was changed since it was read" }

// newStale is a stale save. rev is the record's current rev: a number, or a
// string for settings.
func newStale(rev any) error { return &staleError{rev: rev} }

// newStaleBasis is a stale import. basis is the current basis object.
func newStaleBasis(basis any) error { return &staleError{basis: basis} }

// changedOnDiskError is a store file that changed outside the gateway: 409
// config_changed_on_disk for config.yaml, store_changed_on_disk for the
// sealed files. file is the base name.
type changedOnDiskError struct {
	file string
}

func (e *changedOnDiskError) Error() string {
	return e.file + " was changed outside the gateway; restart the gateway to load it"
}

// writeFailedError is a store write that failed and was rolled back, or could
// not even start: 500 store_write_failed. Nothing changed.
type writeFailedError struct {
	err error
}

func (e *writeFailedError) Error() string {
	return "store write failed, nothing was changed: " + e.err.Error()
}
func (e *writeFailedError) Unwrap() error { return e.err }

// clientGoneError is a request whose client left before the transaction
// started. Nothing happened and nobody reads an answer.
type clientGoneError struct {
	err error
}

func (e *clientGoneError) Error() string { return "the client went away: " + e.err.Error() }
func (e *clientGoneError) Unwrap() error { return e.err }

// refusalError is a refusal that carries its own status and body: a 422
// invalid, a 409 would_lock_out and the like, decided inside a transaction
// where there is no response writer yet. classifyStoreError answers it as it
// says, so a handler's one error path covers it (newRefusal).
type refusalError struct {
	status int
	body   apiError
}

func (e *refusalError) Error() string {
	if e.body.Reason == "" {
		return e.body.Error
	}
	return e.body.Error + ": " + e.body.Reason
}

// newRefusal is the refusal answered with status and body.
func newRefusal(status int, body apiError) error { return &refusalError{status: status, body: body} }

// statusClientGone is nginx's "client closed request"; net/http has no name
// for it.
const statusClientGone = 499

// classifyStoreError is the status, the body and the audit code for the errors
// above, and false for any other error (the handler answers it its own way:
// 422 invalid, 409 last_admin, 500 server_error, ...). The audit code is
// body.Error. A refusal that wrote nothing is audited as refused with that
// code; client_gone needs no audit line.
func classifyStoreError(err error) (status int, body apiError, ok bool) {
	var stale *staleError
	var disk *changedOnDiskError
	var failed *writeFailedError
	var gone *clientGoneError
	var refusal *refusalError
	switch {
	case errors.As(err, &stale):
		return http.StatusConflict, apiError{Error: "stale", Rev: stale.rev, Basis: stale.basis}, true
	case errors.Is(err, errExists):
		return http.StatusConflict, apiError{Error: "exists"}, true
	case errors.Is(err, errRevRequired):
		return http.StatusBadRequest, apiError{Error: "rev_required"}, true
	case errors.Is(err, errNotFound):
		return http.StatusNotFound, apiError{Error: "not_found"}, true
	case errors.As(err, &disk):
		code := "store_changed_on_disk"
		if disk.file == filepath.Base(configFilePath) {
			code = "config_changed_on_disk"
		}
		return http.StatusConflict, apiError{Error: code}, true
	case errors.Is(err, errAuditUnavailable):
		return http.StatusServiceUnavailable, apiError{Error: "audit_unavailable"}, true
	case errors.As(err, &failed):
		return http.StatusInternalServerError, apiError{Error: "store_write_failed"}, true
	case errors.As(err, &gone):
		return statusClientGone, apiError{Error: "client_gone"}, true
	case errors.As(err, &refusal):
		return refusal.status, refusal.body, true
	}
	return 0, apiError{}, false
}

// writeStoreError answers err when it is one of the shared errors and reports
// whether it did, with the code to audit it under. When it returns false the
// response is untouched.
func writeStoreError(w http.ResponseWriter, err error) (code string, handled bool) {
	status, body, ok := classifyStoreError(err)
	if !ok {
		return "", false
	}
	writeJSON(w, status, body)
	return body.Error, true
}
