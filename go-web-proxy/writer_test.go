package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// wfix is a writer over the jfix directory, with the checksums of the three
// files remembered as they are on disk (the state after a load).
type wfix struct {
	*jfix
	w     *writer
	sums  *checksums
	exits []int
}

func newWFix(t *testing.T) *wfix {
	t.Helper()
	f := &wfix{jfix: newJFix(t)}
	sums, err := newChecksums(bytes.Repeat([]byte{7}, storeKeyBytes))
	if err != nil {
		t.Fatal(err)
	}
	f.sums = sums
	for _, p := range []string{f.a, f.b, f.c} {
		if err := sums.rememberDisk(p); err != nil {
			t.Fatal(err)
		}
	}
	f.w = newWriter(f.dir, sums, quietLogger())
	f.w.exit = func(code int) { f.exits = append(f.exits, code) }
	return f
}

// stageAll is the import: new content for all three files.
func (f *wfix) stageAll(tx *txn) {
	tx.stage(f.a, []byte("new a"), 0o644, nil)
	tx.stage(f.b, []byte("new b"), 0o600, nil)
	tx.stage(f.c, []byte("new c"), 0o600, nil)
}

// importAll is an op that stages all three and records whether it was
// published and what ran after.
func (f *wfix) importAll(published, after *int) func(tx *txn) error {
	return func(tx *txn) error {
		f.stageAll(tx)
		tx.onPublish(func() { *published++ })
		tx.afterCommit(func() { *after++ })
		return nil
	}
}

func recoverValue(fn func()) (got any) {
	defer func() { got = recover() }()
	fn()
	return nil
}

// One file: the op checks, stages and queues; the commit lands, the new
// checksum is remembered before the publish funcs run, publish holds the write
// side of the publish lock, and the after-commit funcs follow in order.
func TestWriter_OneFileSaveCommitsAndPublishesInOrder(t *testing.T) {
	f := newWFix(t)
	oldA, oldB := f.w.rev(f.a), f.w.rev(f.b)
	var events []string
	err := f.w.Do(context.Background(), func(tx *txn) error {
		if err := tx.check(f.a, f.b); err != nil {
			return err
		}
		tx.stage(f.a, []byte("new a"), 0o644, nil)
		tx.onPublish(func() {
			events = append(events, "publish")
			if f.w.pub.TryRLock() {
				f.w.pub.RUnlock()
				t.Error("publish must hold the write side of the publish lock")
			}
			if got := tx.rev(f.a); got != checksumRev(f.sums.sumOf([]byte("new a"))) {
				t.Errorf("the new checksum must be remembered before the publish funcs run: %q", got)
			}
		})
		tx.afterCommit(func() { events = append(events, "after 1") })
		tx.afterCommit(func() { events = append(events, "after 2") })
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(events, ","); got != "publish,after 1,after 2" {
		t.Errorf("order: %s", got)
	}
	f.want(t, "new a", "old b", "<absent>")
	f.clean(t)
	if f.w.rev(f.a) == oldA || f.w.rev(f.a) != checksumRev(f.sums.sumOf([]byte("new a"))) {
		t.Errorf("config.yaml's rev must follow its new bytes: %q (was %q)", f.w.rev(f.a), oldA)
	}
	if f.w.rev(f.b) != oldB {
		t.Error("a file the commit did not write keeps its rev")
	}
}

// Three files, one of which did not exist: one commit, one publish, one
// after-commit run.
func TestWriter_ThreeFileImportIsOneTransaction(t *testing.T) {
	f := newWFix(t)
	var published, after int
	if err := f.w.Do(context.Background(), f.importAll(&published, &after)); err != nil {
		t.Fatal(err)
	}
	if published != 1 || after != 1 {
		t.Errorf("publish %d times, after-commit %d times: want once each", published, after)
	}
	f.want(t, "new a", "new b", "new c")
	f.clean(t)
	for path, want := range map[string]string{f.a: "new a", f.b: "new b", f.c: "new c"} {
		if f.w.rev(path) != checksumRev(f.sums.sumOf([]byte(want))) {
			t.Errorf("%s: the remembered checksum does not match the bytes written", filepath.Base(path))
		}
	}
}

// An op that returns an error has written nothing, published nothing and
// moved no checksum, whatever it staged.
func TestWriter_AnOpThatFailsWritesNothing(t *testing.T) {
	f := newWFix(t)
	refused := errors.New("refused")
	var published, after int
	before := f.w.rev(f.a)
	err := f.w.Do(context.Background(), func(tx *txn) error {
		f.stageAll(tx)
		tx.onPublish(func() { published++ })
		tx.afterCommit(func() { after++ })
		return refused
	})
	if !errors.Is(err, refused) {
		t.Fatalf("want the op's error unchanged, got %v", err)
	}
	if published != 0 || after != 0 {
		t.Error("nothing may be published or run after a refused transaction")
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
	if f.w.rev(f.a) != before {
		t.Error("the checksum moved")
	}
}

// An op that stages nothing still runs its publish and after-commit funcs
// (it decided there was nothing to write) and touches no file.
func TestWriter_AnOpThatStagesNothingWritesNothing(t *testing.T) {
	f := newWFix(t)
	var published, after int
	err := f.w.Do(context.Background(), func(tx *txn) error {
		tx.onPublish(func() { published++ })
		tx.afterCommit(func() { after++ })
		return nil
	})
	if err != nil || published != 1 || after != 1 {
		t.Fatalf("err %v, published %d, after %d", err, published, after)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// Staging a path twice keeps the last, in the position of the first.
func TestTxn_StagingAPathTwiceKeepsTheLast(t *testing.T) {
	f := newWFix(t)
	err := f.w.Do(context.Background(), func(tx *txn) error {
		tx.stage(f.a, []byte("first"), 0o644, nil)
		tx.stage(f.b, []byte("b"), 0o600, nil)
		tx.stage(f.a, []byte("second"), 0o644, nil)
		if got := tx.paths(); len(got) != 2 || got[0] != f.a || got[1] != f.b {
			t.Errorf("paths: %v", got)
		}
		if tx.context() == nil {
			t.Error("the op must be able to reach the request context")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	f.want(t, "second", "b", "<absent>")
}

// A simulated crash stops the commit where it is: nothing is published and no
// after-commit work runs, whether or not the commit point had passed. After
// the next start's recovery and reload the writer works again.
func TestWriter_ACrashPublishesNothing(t *testing.T) {
	for _, step := range []commitStep{stepRename, stepCommit} {
		t.Run(fmt.Sprintf("after step %d", step), func(t *testing.T) {
			f := newWFix(t)
			var published, after int
			f.w.hooks = crashAfter(step)
			if err := f.w.Do(context.Background(), f.importAll(&published, &after)); !errors.Is(err, errSimulatedCrash) {
				t.Fatalf("want the simulated crash, got %v", err)
			}
			if published != 0 || after != 0 {
				t.Error("a crashed commit must publish nothing")
			}
			if len(f.exits) != 0 {
				t.Error("a crash is not the exit hook's business")
			}
			if err := recoverDataDir(f.dir, quietLogger()); err != nil {
				t.Fatal(err)
			}
			for _, p := range []string{f.a, f.b, f.c} { // the next start reloads
				if err := f.sums.rememberDisk(p); err != nil {
					t.Fatal(err)
				}
			}
			f.w.hooks = journalHooks{}
			if err := f.w.Do(context.Background(), f.importAll(&published, &after)); err != nil {
				t.Fatalf("the writer must work after recovery: %v", err)
			}
		})
	}
}

// The second of three renames fails: rolled back, nothing published, the
// error is the shared write-failed one, and the writer carries on.
func TestWriter_ARenameFailureRollsBackAndNeverPublishes(t *testing.T) {
	f := newWFix(t)
	var published, after int
	f.w.hooks = journalHooks{rename: renameFailing(2)}
	err := f.w.Do(context.Background(), f.importAll(&published, &after))
	var failed *writeFailedError
	if !errors.As(err, &failed) {
		t.Fatalf("want a write failure, got %v", err)
	}
	if status, body, ok := classifyStoreError(err); !ok || status != http.StatusInternalServerError || body.Error != "store_write_failed" {
		t.Errorf("mapped to %d %+v %v", status, body, ok)
	}
	if published != 0 || after != 0 {
		t.Error("a failed commit must publish nothing")
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
	if len(f.exits) != 0 {
		t.Error("a rollback that worked must not exit")
	}

	f.w.hooks = journalHooks{}
	if err := f.w.Do(context.Background(), f.importAll(&published, &after)); err != nil {
		t.Fatalf("the next transaction: %v", err)
	}
	f.want(t, "new a", "new b", "new c")
}

// A rollback that fails too calls the exit hook, publishes nothing, and
// leaves the journal for the restart.
func TestWriter_AFailedRollbackCallsTheExitHook(t *testing.T) {
	f := newWFix(t)
	var published, after int
	f.w.hooks = journalHooks{rename: renameFailing(2, 3)}
	err := f.w.Do(context.Background(), f.importAll(&published, &after))
	var failed *writeFailedError
	if !errors.As(err, &failed) {
		t.Fatalf("want a write failure, got %v", err)
	}
	if len(f.exits) != 1 || f.exits[0] != 1 {
		t.Fatalf("exit hook calls: %v", f.exits)
	}
	if published != 0 || after != 0 {
		t.Error("nothing may be published")
	}
	if readOr(t, filepath.Join(f.dir, txnFileName)) == "<absent>" {
		t.Error("the journal must stay for the restart")
	}
	if err := recoverDataDir(f.dir, quietLogger()); err != nil {
		t.Fatal(err)
	}
	f.want(t, "old a", "old b", "<absent>")
}

// The round-trip check refuses a commit whose new bytes do not verify, before
// anything is renamed or published.
func TestWriter_TheRoundTripCheckRefusesTheCommit(t *testing.T) {
	f := newWFix(t)
	var published, after int
	err := f.w.Do(context.Background(), func(tx *txn) error {
		tx.stage(f.a, []byte("new a"), 0o644, nil)
		tx.stage(f.b, []byte("new b"), 0o600, func([]byte) error { return errors.New("does not decode") })
		tx.onPublish(func() { published++ })
		tx.afterCommit(func() { after++ })
		return nil
	})
	var failed *writeFailedError
	if !errors.As(err, &failed) || !strings.Contains(err.Error(), "does not decode") {
		t.Fatalf("want a write failure carrying the check's error, got %v", err)
	}
	if published != 0 || after != 0 {
		t.Error("nothing may be published")
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// A client that leaves while its request waits for the lock gives up: its op
// never runs, and the lock stays with the transaction that holds it.
func TestWriter_ClientGoneWhileWaitingChangesNothing(t *testing.T) {
	f := newWFix(t)
	entered, release := make(chan struct{}), make(chan struct{})
	holder := make(chan error, 1)
	go func() {
		holder <- f.w.Do(context.Background(), func(tx *txn) error {
			close(entered)
			<-release
			return nil
		})
	}()
	<-entered

	ctx, cancel := context.WithCancel(context.Background())
	var ran atomic.Bool
	waiter := make(chan error, 1)
	go func() {
		waiter <- f.w.Do(ctx, func(tx *txn) error {
			ran.Store(true)
			f.stageAll(tx)
			return nil
		})
	}()
	cancel()
	err := <-waiter
	var gone *clientGoneError
	if !errors.As(err, &gone) || !errors.Is(err, context.Canceled) {
		t.Fatalf("want the client-gone error wrapping the context's, got %v", err)
	}
	if ran.Load() {
		t.Error("the op of a client that left must not run")
	}
	close(release)
	if err := <-holder; err != nil {
		t.Fatal(err)
	}
	f.want(t, "old a", "old b", "<absent>")
	if err := f.w.Do(context.Background(), func(*txn) error { return nil }); err != nil {
		t.Fatalf("the lock must be free again: %v", err)
	}
}

// A client already gone when the lock is free is caught by the one check
// after acquiring; neither the gate nor the op runs.
func TestWriter_ClientGoneBeforeTheOpIsRefused(t *testing.T) {
	f := newWFix(t)
	var gateCalls, opCalls int
	f.w.gate = func() error { gateCalls++; return nil }
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for i := 0; i < 20; i++ { // select picks at random when both are ready
		err := f.w.Do(ctx, func(*txn) error { opCalls++; return nil })
		if _, _, ok := classifyStoreError(err); !ok || !errors.Is(err, context.Canceled) {
			t.Fatalf("want client gone, got %v", err)
		}
	}
	if gateCalls != 0 || opCalls != 0 {
		t.Errorf("gate ran %d times, op %d times", gateCalls, opCalls)
	}
}

// Once the commit has started, a client that vanishes does not stop it: the
// change lands, is published and is followed up.
func TestWriter_ClientGoneAfterTheCommitStartedStillCommits(t *testing.T) {
	f := newWFix(t)
	var published, after int
	ctx, cancel := context.WithCancel(context.Background())
	err := f.w.Do(ctx, func(tx *txn) error {
		f.stageAll(tx)
		tx.onPublish(func() { published++ })
		tx.afterCommit(func() { after++ })
		cancel() // the client is gone by the time the op returns
		return nil
	})
	if err != nil {
		t.Fatalf("a commit must run to the end: %v", err)
	}
	if published != 1 || after != 1 {
		t.Errorf("published %d, after %d", published, after)
	}
	f.want(t, "new a", "new b", "new c")
}

// Transactions never overlap, however many requests arrive at once.
func TestWriter_TwoTransactionsNeverOverlap(t *testing.T) {
	f := newWFix(t)
	const n = 12
	var active, done atomic.Int32
	var overlapped atomic.Bool
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := f.w.Do(context.Background(), func(tx *txn) error {
				if active.Add(1) != 1 {
					overlapped.Store(true)
				}
				time.Sleep(time.Millisecond)
				tx.stage(f.a, []byte("a"), 0o644, nil)
				tx.onPublish(func() {
					if active.Load() != 1 {
						overlapped.Store(true)
					}
				})
				tx.afterCommit(func() {
					if active.Add(-1) != 0 {
						overlapped.Store(true)
					}
					done.Add(1)
				})
				return nil
			})
			if err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if overlapped.Load() {
		t.Error("two transactions were in flight together")
	}
	if done.Load() != n {
		t.Errorf("%d of %d transactions completed", done.Load(), n)
	}
}

// The gate refuses a transaction before its op runs, and its error comes back
// unchanged; no gate means no refusal.
func TestWriter_TheGateRefusesBeforeTheOp(t *testing.T) {
	f := newWFix(t)
	var ran bool
	f.w.gate = func() error { return errAuditUnavailable }
	err := f.w.Do(context.Background(), func(tx *txn) error {
		ran = true
		f.stageAll(tx)
		return nil
	})
	if !errors.Is(err, errAuditUnavailable) || ran {
		t.Fatalf("err %v, op ran %v", err, ran)
	}
	if status, body, ok := classifyStoreError(err); !ok || status != http.StatusServiceUnavailable || body.Error != "audit_unavailable" {
		t.Errorf("mapped to %d %+v", status, body)
	}
	f.want(t, "old a", "old b", "<absent>")

	f.w.gate = func() error { return nil }
	if err := f.w.Do(context.Background(), func(*txn) error { ran = true; return nil }); err != nil || !ran {
		t.Errorf("a gate that passes: err %v, ran %v", err, ran)
	}
}

// A panic in the op changes nothing and goes on up (the recover middleware
// answers 500); the lock is released.
func TestWriter_APanicInTheOpChangesNothingAndGoesUp(t *testing.T) {
	f := newWFix(t)
	got := recoverValue(func() {
		_ = f.w.Do(context.Background(), func(tx *txn) error {
			f.stageAll(tx)
			panic("op boom")
		})
	})
	if got != "op boom" {
		t.Fatalf("want the panic to go up, got %v", got)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
	if len(f.exits) != 0 {
		t.Error("a panic before the commit must not exit")
	}
	if err := f.w.Do(context.Background(), func(*txn) error { return nil }); err != nil {
		t.Fatalf("the lock must be free again: %v", err)
	}
}

// A panic inside the commit before its commit point is rolled back, then goes
// up: nothing changed, nothing published, no exit.
func TestWriter_APanicBeforeTheCommitPointChangesNothing(t *testing.T) {
	f := newWFix(t)
	var published, after int
	f.w.hooks = panicAfter(stepVerify)
	got := recoverValue(func() { _ = f.w.Do(context.Background(), f.importAll(&published, &after)) })
	if got != "boom" {
		t.Fatalf("want the panic to go up, got %v", got)
	}
	if published != 0 || after != 0 || len(f.exits) != 0 {
		t.Errorf("published %d, after %d, exits %v", published, after, f.exits)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)

	f.w.hooks = journalHooks{}
	if err := f.w.Do(context.Background(), f.importAll(&published, &after)); err != nil {
		t.Fatalf("the next transaction: %v", err)
	}
}

// A panic after the commit point cannot be undone: it is logged and the exit
// hook is called, so the restart loads the committed state. That covers a
// panic in the commit's own cleanup, in a publish func and in an after-commit
// func.
func TestWriter_APanicAfterTheCommitPointCallsTheExitHook(t *testing.T) {
	cases := []struct {
		name  string
		hooks journalHooks
		op    func(f *wfix) func(tx *txn) error
	}{
		{"in the cleanup", panicAfter(stepCleanup), func(f *wfix) func(tx *txn) error {
			return func(tx *txn) error {
				f.stageAll(tx)
				return nil
			}
		}},
		{"in a publish func", journalHooks{}, func(f *wfix) func(tx *txn) error {
			return func(tx *txn) error {
				f.stageAll(tx)
				tx.onPublish(func() { panic("boom") })
				return nil
			}
		}},
		{"in an after-commit func", journalHooks{}, func(f *wfix) func(tx *txn) error {
			return func(tx *txn) error {
				f.stageAll(tx)
				tx.afterCommit(func() { panic("boom") })
				return nil
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newWFix(t)
			f.w.hooks = c.hooks
			var err error
			if got := recoverValue(func() { err = f.w.Do(context.Background(), c.op(f)) }); got != nil {
				t.Fatalf("the panic must not go on once the process is told to exit: %v", got)
			}
			if len(f.exits) != 1 || f.exits[0] != 1 {
				t.Fatalf("exit hook calls: %v", f.exits)
			}
			if err == nil || !strings.Contains(err.Error(), "panic after the commit point") {
				t.Errorf("want an error saying so, got %v", err)
			}
			f.want(t, "new a", "new b", "new c")
		})
	}
}

// Without a file in the commit there is no commit point: a panic in the
// after-commit work is an ordinary panic and goes up.
func TestWriter_APanicWithNothingCommittedGoesUp(t *testing.T) {
	f := newWFix(t)
	got := recoverValue(func() {
		_ = f.w.Do(context.Background(), func(tx *txn) error {
			tx.afterCommit(func() { panic("late boom") })
			return nil
		})
	})
	if got != "late boom" || len(f.exits) != 0 {
		t.Errorf("panic %v, exits %v", got, f.exits)
	}
}

// The disk check: a hand edit is refused naming the file, and stays refused for
// that file (restoring the bytes does not lift it) until restart; the other
// files are not affected.
func TestWriter_ADiskCheckMismatchIsStickyPerFile(t *testing.T) {
	f := newWFix(t)
	writeFile(t, f.a, "edited by hand")
	check := func(paths ...string) error {
		return f.w.Do(context.Background(), func(tx *txn) error { return tx.check(paths...) })
	}
	err := check(f.a)
	var disk *changedOnDiskError
	if !errors.As(err, &disk) || disk.file != "config.yaml" {
		t.Fatalf("want a change on disk naming config.yaml, got %v", err)
	}
	if !strings.Contains(err.Error(), "config.yaml") || !strings.Contains(err.Error(), "restart") {
		t.Errorf("the message must name the file and say what to do: %v", err)
	}
	if _, body, _ := classifyStoreError(err); body.Error != "config_changed_on_disk" {
		t.Errorf("config.yaml maps to %q", body.Error)
	}

	writeFile(t, f.a, "old a") // the cause goes away; the refusal does not
	if err := check(f.a); !errors.As(err, &disk) {
		t.Errorf("the refusal must be sticky, got %v", err)
	}
	if err := check(f.b, f.c); err != nil {
		t.Errorf("the other files are unaffected: %v", err)
	}

	// An op that forgot to check is caught before the commit writes anything.
	err = f.w.Do(context.Background(), func(tx *txn) error {
		f.stageAll(tx)
		return nil
	})
	if !errors.As(err, &disk) {
		t.Fatalf("a staged file that changed on disk must stop the commit, got %v", err)
	}
	f.want(t, "old a", "old b", "<absent>")
	f.clean(t)
}

// A sealed file replaced behind the gateway's back maps to
// store_changed_on_disk; so does a file that appears where none existed.
func TestWriter_ASealedFileChangedOnDiskMapsToTheStoreCode(t *testing.T) {
	f := newWFix(t)
	writeFile(t, f.b, "replaced")
	err := f.w.Do(context.Background(), func(tx *txn) error { return tx.check(f.b) })
	if _, body, ok := classifyStoreError(err); !ok || body.Error != "store_changed_on_disk" {
		t.Errorf("users.yaml maps to %+v %v", body, ok)
	}
	writeFile(t, f.c, "appeared")
	err = f.w.Do(context.Background(), func(tx *txn) error { return tx.check(f.c) })
	var disk *changedOnDiskError
	if !errors.As(err, &disk) || disk.file != "connections.yaml" {
		t.Errorf("a file that appeared: %v", err)
	}
}

// With no store key (Direct mode) there is no disk check and no rev, and the
// journal is used all the same.
func TestWriter_WithoutAKeyThereIsNoDiskCheckAndNoRev(t *testing.T) {
	f := newJFix(t)
	w := newWriter(f.dir, nil, nil)
	writeFile(t, f.a, "edited by hand")
	err := w.Do(context.Background(), func(tx *txn) error {
		if err := tx.check(f.a); err != nil {
			return err
		}
		tx.stage(f.a, []byte("new a"), 0o644, nil)
		return nil
	})
	if err != nil {
		t.Fatalf("no key, no check: %v", err)
	}
	f.want(t, "new a", "old b", "<absent>")
	f.clean(t)
	if w.rev(f.a) != "" {
		t.Errorf("no key, no rev: %q", w.rev(f.a))
	}
}

// A backup read while a transaction is publishing waits for it: it sees the
// state before or after, never the middle.
func TestWriter_SnapshotWaitsForAPublishInProgress(t *testing.T) {
	f := newWFix(t)
	var published atomic.Bool
	done := make(chan error, 1)
	w := f.w
	w.snapshot(func() {
		go func() {
			done <- w.Do(context.Background(), func(tx *txn) error {
				tx.stage(f.a, []byte("new a"), 0o644, nil)
				tx.onPublish(func() { published.Store(true) })
				return nil
			})
		}()
		time.Sleep(50 * time.Millisecond) // long enough for the commit to reach its publish
		if published.Load() {
			t.Error("a publish got in while a snapshot was being read")
		}
	})
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if !published.Load() {
		t.Error("the publish must run once the snapshot is done")
	}
}

// The shared errors map to one status, code and body everywhere.
func TestClassifyStoreError_OneMappingForEveryHandler(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		body   string
	}{
		{"stale save", newStale(7), 409, `{"error":"stale","rev":7}`},
		{"stale save of a rev 0", newStale(0), 409, `{"error":"stale","rev":0}`},
		{"stale settings", newStale("abc"), 409, `{"error":"stale","rev":"abc"}`},
		{"stale import", newStaleBasis(map[string]any{"users": 3, "settings": "s"}), 409, `{"error":"stale","basis":{"settings":"s","users":3}}`},
		{"exists, wrapped", fmt.Errorf("create ann: %w", errExists), 409, `{"error":"exists"}`},
		{"rev required", errRevRequired, 400, `{"error":"rev_required"}`},
		{"not found", errNotFound, 404, `{"error":"not_found"}`},
		{"config.yaml changed", &changedOnDiskError{file: "config.yaml"}, 409, `{"error":"config_changed_on_disk"}`},
		{"users.yaml changed", &changedOnDiskError{file: "users.yaml"}, 409, `{"error":"store_changed_on_disk"}`},
		{"backup.yaml changed", &changedOnDiskError{file: "backup.yaml"}, 409, `{"error":"store_changed_on_disk"}`},
		{"audit unavailable", errAuditUnavailable, 503, `{"error":"audit_unavailable"}`},
		{"write failed hides its cause", &writeFailedError{err: errors.New("disk full at /data")}, 500, `{"error":"store_write_failed"}`},
		{"client gone", &clientGoneError{err: context.Canceled}, statusClientGone, `{"error":"client_gone"}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, body, ok := classifyStoreError(c.err)
			if !ok || status != c.status {
				t.Fatalf("status %d handled %v, want %d", status, ok, c.status)
			}
			raw, err := json.Marshal(body)
			if err != nil || string(raw) != c.body {
				t.Errorf("body %s, want %s (%v)", raw, c.body, err)
			}

			rec := httptest.NewRecorder()
			code, handled := writeStoreError(rec, c.err)
			if !handled || code != body.Error || rec.Code != c.status {
				t.Errorf("writeStoreError: code %q handled %v status %d", code, handled, rec.Code)
			}
			if got := strings.TrimSpace(rec.Body.String()); got != c.body {
				t.Errorf("written body %s, want %s", got, c.body)
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("content type %q", ct)
			}
		})
	}
}

// Any other error is not the helper's: it answers nothing and the handler
// keeps its own mapping (422, 409 last_admin, 500 server_error, ...).
func TestWriteStoreError_LeavesOtherErrorsToTheHandler(t *testing.T) {
	for _, err := range []error{nil, errors.New("last admin"), os.ErrNotExist} {
		rec := httptest.NewRecorder()
		if code, handled := writeStoreError(rec, err); handled || code != "" || rec.Body.Len() != 0 || rec.Code != http.StatusOK {
			t.Errorf("%v: code %q handled %v wrote %d %q", err, code, handled, rec.Code, rec.Body.String())
		}
	}
}

func TestStoreErrors_UnwrapToTheirCause(t *testing.T) {
	cause := errors.New("disk full")
	if err := error(&writeFailedError{err: cause}); !errors.Is(err, cause) || !strings.Contains(err.Error(), "nothing was changed") {
		t.Errorf("write failed: %v", err)
	}
	if err := error(&clientGoneError{err: context.Canceled}); !errors.Is(err, context.Canceled) || !strings.Contains(err.Error(), "the client went away") {
		t.Errorf("client gone: %v", err)
	}
	if !strings.Contains(newStale(1).Error(), "stale") {
		t.Error("stale message")
	}
}
