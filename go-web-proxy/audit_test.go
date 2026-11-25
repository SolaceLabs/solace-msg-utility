package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// auditEnv is an auditor over a temp file with a fixed clock, the stdout copy
// in a buffer and the application log in a builder.
type auditEnv struct {
	a      *auditor
	lv     *live
	path   string
	stdout *bytes.Buffer
	log    *strings.Builder
}

func newAuditEnv(t *testing.T, set auditSettings) *auditEnv {
	t.Helper()
	e := &auditEnv{path: filepath.Join(t.TempDir(), "audit.log"), stdout: &bytes.Buffer{}, log: &strings.Builder{}}
	e.lv = liveWith(func(c *config) { c.audit = set })
	a, err := openAuditor(e.path, e.lv, e.stdout, newCapturingLogger(e.log))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.close() })
	// 09:30 at +01:00, so the entry's UTC time proves the conversion.
	a.now = func() time.Time { return time.Date(2026, 11, 12, 9, 30, 0, 0, time.FixedZone("plus1", 3600)) }
	e.a = a
	return e
}

// setAudit swaps the live audit options, as a settings save does.
func (e *auditEnv) setAudit(set auditSettings) {
	cfg := defaultConfig()
	cfg.audit = set
	e.lv.apply(cfg)
}

// rec records an admin entry whose message is msg.
func (e *auditEnv) rec(msg string) {
	e.a.record(auditAdmin, auditEntry{Actor: "alice", Client: "192.0.2.10", Action: auditUserCreate, Target: "bob", Outcome: auditOK, Msg: msg})
}

// fileLines are the lines of the file at path, nil when it does not exist.
func fileLines(t *testing.T, path string) []string {
	t.Helper()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
}

func TestAudit_EntryShapeFieldOrderAndTime(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.a.record(auditAdmin, auditEntry{
		Time: "stale", Actor: "alice", Client: "192.0.2.10", Action: auditUserUpdate, Target: "bob",
		Outcome: auditOK, Changed: []string{"vpn", "modules"}, Msg: "alice updated user bob: vpn prod",
	})
	e.a.record(auditAuth, auditEntry{Client: "unknown", Action: auditSignin, Outcome: auditRefused, Code: "bad_credentials", Msg: "sign-in refused for bob: bad credentials"})
	want := []string{
		`{"time":"2026-11-12T08:30:00Z","actor":"alice","client":"192.0.2.10","action":"user.update","target":"bob","outcome":"ok","changed":["vpn","modules"],"msg":"alice updated user bob: vpn prod"}`,
		`{"time":"2026-11-12T08:30:00Z","actor":"","client":"unknown","action":"signin","outcome":"refused","code":"bad_credentials","msg":"sign-in refused for bob: bad credentials"}`,
	}
	if got := fileLines(t, e.path); !reflect.DeepEqual(got, want) {
		t.Errorf("lines:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
	if e.stdout.Len() != 0 {
		t.Errorf("the stdout copy is opt-in, got %q", e.stdout)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(e.path); err != nil || info.Mode().Perm() != 0o600 {
			t.Errorf("audit log mode: want 0600, got %v (%v)", info.Mode().Perm(), err)
		}
	}
}

// A message with a quote or a line break stays one JSON line: a user-chosen
// name cannot forge a second entry.
func TestAudit_MessageCannotBreakTheLine(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	msg := "admin created user \"x\"\n{\"action\":\"forged\"}"
	e.rec(msg)
	lines := fileLines(t, e.path)
	if len(lines) != 1 {
		t.Fatalf("want one line, got %d: %q", len(lines), lines)
	}
	var got auditEntry
	if err := json.Unmarshal([]byte(lines[0]), &got); err != nil || got.Msg != msg || got.Action != auditUserCreate {
		t.Errorf("the line must round-trip: %+v (%v)", got, err)
	}
}

func TestAudit_AccessEntriesOnlyWhileEnabled(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	access := auditEntry{Actor: "alice", Client: "192.0.2.10", Action: auditRelay, Target: "b1", Outcome: auditOK, Msg: "GET /SEMP/v2/config"}
	e.a.record(auditAccess, access)
	e.a.record(auditAuth, auditEntry{Actor: "alice", Action: auditSignout, Outcome: auditOK, Msg: "alice signed out"})
	e.a.record(auditAdmin, auditEntry{Actor: "alice", Action: auditUserDelete, Outcome: auditOK, Msg: "alice deleted user bob"})
	if got := fileLines(t, e.path); len(got) != 2 || strings.Contains(strings.Join(got, ""), "relay") {
		t.Fatalf("audit.access off: want the auth and admin entries only, got %q", got)
	}
	e.setAudit(auditSettings{access: true}) // the next event sees it
	e.a.record(auditAccess, access)
	if got := fileLines(t, e.path); len(got) != 3 || !strings.Contains(got[2], `"action":"relay"`) {
		t.Errorf("audit.access on: want the relay entry appended, got %q", got)
	}
	e.setAudit(auditSettings{})
	e.a.record(auditAccess, access)
	if got := fileLines(t, e.path); len(got) != 3 {
		t.Errorf("audit.access off again: want no new entry, got %q", got)
	}
}

func TestAudit_StdoutCopyOnlyWhileEnabled(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.rec("first")
	if e.stdout.Len() != 0 {
		t.Fatalf("audit.stdout off: want nothing on stdout, got %q", e.stdout)
	}
	e.setAudit(auditSettings{stdout: true})
	e.rec("second")
	lines := fileLines(t, e.path)
	if got := e.stdout.String(); got != lines[1]+"\n" {
		t.Errorf("stdout must carry the bare JSON line:\n%q\nwant %q", got, lines[1]+"\n")
	}
	e.setAudit(auditSettings{})
	e.rec("third")
	if got := e.stdout.String(); got != lines[1]+"\n" {
		t.Errorf("audit.stdout off again: stdout grew: %q", got)
	}
}

// Rotation: a write that would pass maxSize renames the log to .1 and shifts
// the older files up; the oldest beyond keep is deleted.
func TestAudit_RotatesBySizeAndDeletesTheOldest(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.rec("entry 1")
	info, err := os.Stat(e.path)
	if err != nil {
		t.Fatal(err)
	}
	e.a.maxSize, e.a.keep = 2*info.Size(), 3 // two lines to a file
	for i := 2; i <= 9; i++ {
		e.rec(fmt.Sprintf("entry %d", i))
	}
	msgs := func(path string) []string {
		var out []string
		for _, l := range fileLines(t, path) {
			var en auditEntry
			if err := json.Unmarshal([]byte(l), &en); err != nil {
				t.Fatalf("%s: %v", path, err)
			}
			out = append(out, en.Msg)
		}
		return out
	}
	check := func(name, path string, want ...string) {
		t.Helper()
		if got := msgs(path); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: want %v, got %v", name, want, got)
		}
	}
	check("audit.log", e.path, "entry 9")
	check("audit.log.1", e.path+".1", "entry 7", "entry 8")
	check("audit.log.2", e.path+".2", "entry 5", "entry 6")
	check("audit.log.3", e.path+".3", "entry 3", "entry 4")
	check("audit.log.4", e.path+".4") // entries 1 and 2 were the oldest beyond keep
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(e.path); err != nil || info.Mode().Perm() != 0o600 {
			t.Errorf("the new log after a rotation: want 0600, got %v (%v)", info.Mode().Perm(), err)
		}
	}
	if e.log.Len() != 0 {
		t.Errorf("a clean rotation logs nothing: %s", e.log)
	}
}

// A line longer than maxSize still goes to an empty file rather than rotating
// forever; each later line rotates the one before it.
func TestAudit_OversizedLineGoesToAnEmptyFile(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.a.maxSize, e.a.keep = 1, 2
	for i := 1; i <= 3; i++ {
		e.rec(fmt.Sprintf("entry %d", i))
	}
	for i, want := range []string{"entry 3", "entry 2", "entry 1"} {
		path := e.a.slot(i)
		if got := fileLines(t, path); len(got) != 1 || !strings.Contains(got[0], want) {
			t.Errorf("%s: want one line with %q, got %q", filepath.Base(path), want, got)
		}
	}
}

// A file already there is appended to, its size counts toward the next
// rotation, and a mode an operator left too open is tightened.
func TestOpenAuditor_AppendsToAnExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "audit.log")
	if err := os.WriteFile(path, []byte("0123456789"), 0o644); err != nil {
		t.Fatal(err)
	}
	a, err := openAuditor(path, liveWith(nil), &bytes.Buffer{}, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.close() })
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm() != 0o600 {
			t.Errorf("mode: want 0600, got %v (%v)", info.Mode().Perm(), err)
		}
	}
	a.maxSize, a.keep = 15, 2
	a.record(auditAdmin, auditEntry{Action: auditUserCreate, Outcome: auditOK, Msg: "alice created user bob"})
	if got, err := os.ReadFile(path + ".1"); err != nil || string(got) != "0123456789" {
		t.Errorf("the existing bytes must count toward the size and be rotated whole: %q (%v)", got, err)
	}
	if got := fileLines(t, path); len(got) != 1 || !strings.Contains(got[0], "created user bob") {
		t.Errorf("the new log: %q", got)
	}
}

func TestOpenAuditor_FailureIsActionable(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "audit.log")
	if err := os.Mkdir(path, 0o700); err != nil { // a directory where the log goes
		t.Fatal(err)
	}
	a, err := openAuditor(path, liveWith(nil), &bytes.Buffer{}, quietLogger())
	if a != nil || err == nil || !strings.Contains(err.Error(), path) || !strings.Contains(err.Error(), "writable") {
		t.Fatalf("want an error naming the path and the fix, got %v, %v", a, err)
	}
}

// A record that cannot be written is logged at ERROR as AUDIT RECORD LOST,
// once per record, with the path, the cause and every field of the entry, so
// the loss is in the application log; the stdout copy still goes out and
// record returns as normal.
func TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(t *testing.T) {
	e := newAuditEnv(t, auditSettings{stdout: true})
	_ = e.a.f.Close() // every write now fails
	e.a.record(auditAdmin, auditEntry{
		Actor: "alice", Client: "192.0.2.10", Action: auditUserCreate, Target: "bob", Outcome: auditOK,
		Changed: []string{"password"}, Wrote: []auditWrote{{File: "users.yaml", Seq: 43}}, Msg: "alice created user bob",
	})
	e.rec("second")
	log := e.log.String()
	if strings.Count(log, "level=ERROR") != 2 || strings.Count(log, `msg="AUDIT RECORD LOST"`) != 2 {
		t.Fatalf("want one ERROR per lost record: %s", log)
	}
	first := strings.Split(log, "\n")[0]
	for _, want := range []string{e.path, "actor=alice", "client=192.0.2.10", "action=user.create", "target=bob", "outcome=ok",
		"password", "users.yaml", `entry_msg="alice created user bob"`, "entry_time=2026-11-12T08:30:00Z", "err="} {
		if !strings.Contains(first, want) {
			t.Errorf("the lost record's log line lacks %q: %s", want, first)
		}
	}
	if strings.Count(e.stdout.String(), "alice created user bob") != 1 || strings.Count(e.stdout.String(), "second") != 1 {
		t.Errorf("the stdout copy must still go out: %q", e.stdout)
	}
}

// A log that cannot be reopened (its directory is gone) loses the record the
// same way.
func TestAudit_ReopenFailureLosesTheRecordLoudly(t *testing.T) {
	var log strings.Builder
	a := &auditor{
		lv: liveWith(nil), stdout: &bytes.Buffer{}, logger: newCapturingLogger(&log), now: time.Now,
		path: filepath.Join(t.TempDir(), "gone", "audit.log"), maxSize: auditMaxBytes, keep: auditKeepFiles,
	}
	a.record(auditAdmin, auditEntry{Action: auditUserCreate, Outcome: auditOK, Msg: "alice created user bob"})
	if !strings.Contains(log.String(), "level=ERROR") || !strings.Contains(log.String(), "AUDIT RECORD LOST") || !strings.Contains(log.String(), `entry_msg="alice created user bob"`) {
		t.Errorf("want an ERROR with the entry: %s", log.String())
	}
	if !a.failing.Load() {
		t.Error("a lost record must set the failing state")
	}
}

// A rotation that fails (the oldest file cannot be deleted) is logged, and the
// line is still written to the current file rather than lost.
func TestAudit_RotationFailureIsLoggedAndTheLineIsKept(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.rec("entry 1")
	info, err := os.Stat(e.path)
	if err != nil {
		t.Fatal(err)
	}
	e.a.maxSize, e.a.keep = info.Size(), 2
	if err := os.MkdirAll(filepath.Join(e.path+".2", "inner"), 0o700); err != nil { // cannot be removed
		t.Fatal(err)
	}
	e.rec("entry 2")
	if got := fileLines(t, e.path); len(got) != 2 || !strings.Contains(got[1], "entry 2") {
		t.Errorf("the line must be kept in the current file: %q", got)
	}
	if log := e.log.String(); !strings.Contains(log, "level=ERROR") || !strings.Contains(log, "rotate") || !strings.Contains(log, filepath.Base(e.path)+".2") {
		t.Errorf("want the rotation failure logged with the file: %s", log)
	}
	if log := e.log.String(); strings.Contains(log, "AUDIT RECORD LOST") || e.a.failing.Load() {
		t.Errorf("the line was written, so no record was lost and the log is not failing: %s", log)
	}
}

// waitFor polls cond every 5 ms and fails the test after 5 s, naming what it
// waited for.
func waitFor(t *testing.T, cond func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// gatedWriter blocks every Write until open is closed, then fails each one
// while fail is set; it counts the lines it took.
type gatedWriter struct {
	open  chan struct{}
	fail  atomic.Bool
	mu    sync.Mutex
	lines int
}

func (g *gatedWriter) Write(p []byte) (int, error) {
	<-g.open
	if g.fail.Load() {
		return 0, errors.New("write /dev/stdout: broken pipe")
	}
	g.mu.Lock()
	g.lines++
	g.mu.Unlock()
	return len(p), nil
}

// A stdout copy that cannot be written (a log pipe under back-pressure) holds
// up neither the audit file nor the next record's file line: the file gets
// both while the first copy is still stuck. Once stdout drains, both copies go
// out. A copy that fails is logged once, not per line, and logged again only
// after a copy has succeeded in between.
func TestAudit_StuckOrFailingStdoutNeverHoldsUpTheFile(t *testing.T) {
	e := newAuditEnv(t, auditSettings{stdout: true})
	out := &gatedWriter{open: make(chan struct{})}
	e.a.stdout = out

	first := make(chan struct{})
	go func() { e.rec("first"); close(first) }()
	waitFor(t, func() bool { return len(fileLines(t, e.path)) == 1 }, "the first line in the file while its stdout copy is stuck")
	second := make(chan struct{})
	go func() { e.rec("second"); close(second) }()
	waitFor(t, func() bool { return len(fileLines(t, e.path)) == 2 }, "the second line in the file while the first copy is still stuck")
	close(out.open)
	<-first
	<-second
	if out.lines != 2 {
		t.Errorf("both copies go out once stdout drains, got %d", out.lines)
	}

	out.fail.Store(true)
	e.rec("third")
	e.rec("fourth")
	if n := strings.Count(e.log.String(), "audit stdout copy failed"); n != 1 {
		t.Errorf("a failing stdout is logged once, got %d:\n%s", n, e.log)
	}
	out.fail.Store(false)
	e.rec("fifth")
	out.fail.Store(true)
	e.rec("sixth")
	if n := strings.Count(e.log.String(), "audit stdout copy failed"); n != 2 {
		t.Errorf("a new failure after a copy succeeded is logged again, got %d:\n%s", n, e.log)
	}
	if got := len(fileLines(t, e.path)); got != 6 || e.a.failing.Load() {
		t.Errorf("the file holds every line (%d of 6) and is not failing: %v", got, e.a.failing.Load())
	}
}

func TestAudit_ConcurrentRecordsAreWholeLines(t *testing.T) {
	e := newAuditEnv(t, auditSettings{stdout: true})
	const writers, each = 16, 25
	pad := strings.Repeat("x", 300)
	var wg sync.WaitGroup
	for w := 0; w < writers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := 0; i < each; i++ {
				e.rec(fmt.Sprintf("writer %d entry %d %s", w, i, pad))
			}
		}(w)
	}
	wg.Wait()
	for name, lines := range map[string][]string{"file": fileLines(t, e.path), "stdout": strings.Split(strings.TrimSuffix(e.stdout.String(), "\n"), "\n")} {
		if len(lines) != writers*each {
			t.Fatalf("%s: want %d lines, got %d", name, writers*each, len(lines))
		}
		seen := map[string]bool{}
		for _, l := range lines {
			var en auditEntry
			if err := json.Unmarshal([]byte(l), &en); err != nil {
				t.Fatalf("%s: an interleaved or torn line: %v: %q", name, err, l)
			}
			seen[en.Msg] = true
		}
		if len(seen) != writers*each {
			t.Errorf("%s: want %d distinct entries, got %d", name, writers*each, len(seen))
		}
	}
}

// Gateway mode has no auditor; a nil one records nothing and closes cleanly,
// so a handler never checks for it.
func TestAuditor_NilRecordsNothing(t *testing.T) {
	var a *auditor
	a.record(auditAdmin, auditEntry{Action: auditUserCreate})
	if err := a.close(); err != nil {
		t.Errorf("close on nil: %v", err)
	}
}

// close releases the file and is safe twice; a later entry reopens it, so a
// request that outlives the shutdown is still recorded.
func TestAuditor_CloseThenRecordReopens(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.rec("before")
	if err := e.a.close(); err != nil {
		t.Fatal(err)
	}
	if err := e.a.close(); err != nil {
		t.Errorf("second close: %v", err)
	}
	e.rec("after")
	if got := fileLines(t, e.path); len(got) != 2 || !strings.Contains(got[1], "after") {
		t.Errorf("want both entries, got %q", got)
	}
}

// auditFor fills the actor and the client the way the access log does.
func TestAuditFor_ActorAndClient(t *testing.T) {
	var got auditEntry
	h := withClient(liveWith(nil), http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = auditFor(r, auditSignin)
	}))
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = "192.0.2.10:5000"
	h.ServeHTTP(httptest.NewRecorder(), req)
	if want := (auditEntry{Client: "192.0.2.10", Action: auditSignin}); got.Actor != "" || got.Client != want.Client || got.Action != want.Action {
		t.Errorf("before a gate has looked the session up: %+v", got)
	}

	h = withClient(liveWith(nil), http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		setRequestUser(r, "alice")
		got = auditFor(r, auditUserDelete)
	}))
	h.ServeHTTP(httptest.NewRecorder(), req)
	if got.Actor != "alice" || got.Client != "192.0.2.10" || got.Action != auditUserDelete || got.Time != "" || got.Outcome != "" {
		t.Errorf("a signed-in request: %+v", got)
	}

	// Outside the gateway's chain nothing is known.
	if bare := auditFor(httptest.NewRequest(http.MethodGet, "/x", nil), auditRelay); bare.Actor != "" || bare.Client != "unknown" {
		t.Errorf("no chain: %+v", bare)
	}
}

// wrote names the store files a commit wrote, after changed and before msg;
// config.yaml has no seq, and an entry without it has no key.
func TestAudit_WroteFieldShapeAndOrder(t *testing.T) {
	e := newAuditEnv(t, auditSettings{})
	e.a.record(auditAdmin, auditEntry{
		Actor: "alice", Client: "192.0.2.10", Action: auditBackupImport, Target: "b.smubak", Outcome: auditOK,
		Changed: []string{"users", "settings"}, Wrote: []auditWrote{{File: "users.yaml", Seq: 43}, {File: "config.yaml"}},
		Msg: "alice imported a backup",
	})
	e.a.record(auditAdmin, auditEntry{Actor: "alice", Client: "192.0.2.10", Action: auditUserDelete, Target: "bob", Outcome: auditRefused, Code: "stale", Msg: "alice could not delete user bob: stale"})
	want := []string{
		`{"time":"2026-11-12T08:30:00Z","actor":"alice","client":"192.0.2.10","action":"backup.import","target":"b.smubak","outcome":"ok","changed":["users","settings"],"wrote":[{"file":"users.yaml","seq":43},{"file":"config.yaml"}],"msg":"alice imported a backup"}`,
		`{"time":"2026-11-12T08:30:00Z","actor":"alice","client":"192.0.2.10","action":"user.delete","target":"bob","outcome":"refused","code":"stale","msg":"alice could not delete user bob: stale"}`,
	}
	if got := fileLines(t, e.path); !reflect.DeepEqual(got, want) {
		t.Errorf("lines:\n%s\nwant:\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

// audit.onFailure refuse: while the last write lost its record the gate
// refuses with errAuditUnavailable; any write that succeeds clears it, and
// continue (also the zero value) and a nil auditor never refuse.
func TestAuditor_GateFollowsOnFailureAndTheLastWrite(t *testing.T) {
	e := newAuditEnv(t, auditSettings{onFailure: auditOnFailureRefuse})
	if err := e.a.gate(); err != nil {
		t.Fatalf("a healthy log must not refuse: %v", err)
	}
	_ = e.a.f.Close()
	e.rec("lost")
	if err := e.a.gate(); !errors.Is(err, errAuditUnavailable) {
		t.Fatalf("refuse while the last write failed: got %v", err)
	}
	for _, set := range []auditSettings{{onFailure: auditOnFailureContinue}, {}} {
		e.setAudit(set)
		if err := e.a.gate(); err != nil {
			t.Errorf("onFailure %q must never refuse: %v", set.onFailure, err)
		}
	}
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	if err := e.a.gate(); !errors.Is(err, errAuditUnavailable) {
		t.Fatalf("switching back to refuse sees the failing log: got %v", err)
	}
	e.a.mu.Lock()
	e.a.f = nil // the next write reopens the file, as it would once the disk has room
	e.a.mu.Unlock()
	e.rec("the refusal line")
	if err := e.a.gate(); err != nil {
		t.Errorf("a write that succeeds clears the failing state: %v", err)
	}
	if got := fileLines(t, e.path); len(got) != 1 || !strings.Contains(got[0], "the refusal line") {
		t.Errorf("only the written record is on disk: %q", got)
	}
	var none *auditor
	if err := none.gate(); err != nil {
		t.Errorf("no auditor, no refusal: %v", err)
	}
}

// An access entry dropped by audit.access off touches nothing: a failing log
// stays failing, since no write was tried.
func TestAuditor_ADroppedAccessEntryDoesNotClearTheFailingState(t *testing.T) {
	e := newAuditEnv(t, auditSettings{onFailure: auditOnFailureRefuse})
	_ = e.a.f.Close()
	e.rec("lost")
	e.a.record(auditAccess, auditEntry{Action: auditRelay, Outcome: auditOK, Msg: "GET /x"})
	if err := e.a.gate(); !errors.Is(err, errAuditUnavailable) {
		t.Errorf("want still failing, got %v", err)
	}
}

// The two-factor actions are named once here and used by the pages and the
// managed API; the messages never carry a code, a secret or a recovery code.
func TestAudit_TwoFactorActionsAndMessages(t *testing.T) {
	if auditTwoFactorEnrol != "twofactor.enrol" || auditTwoFactorReset != "user.twofactor.reset" || auditBadCode != "bad_code" {
		t.Errorf("action names: %q %q %q", auditTwoFactorEnrol, auditTwoFactorReset, auditBadCode)
	}
	if got := signedInMsg("alice"); got != "alice signed in" {
		t.Errorf("got %q", got)
	}
	if got := signedInRecoveryMsg("alice", 7); got != "alice signed in with a recovery code (7 left)" {
		t.Errorf("got %q", got)
	}
	if got := signedInRecoveryMsg("alice", 0); got != "alice signed in with a recovery code (0 left)" {
		t.Errorf("the last code leaves none: %q", got)
	}
	if got := twoFactorEnrolMsg("alice", false); got != "alice set up two-factor sign-in" {
		t.Errorf("got %q", got)
	}
	if got := twoFactorEnrolMsg("alice", true); got != "alice set up two-factor sign-in again" {
		t.Errorf("got %q", got)
	}
}

// The TLS and restart actions have the names the docs list, and each has a done and an attempted phrase (a refused
// entry would read as a bare "could not" without one).
func TestAudit_TLSAndRestartActionsAreNamedAndPhrased(t *testing.T) {
	for action, name := range map[string]string{
		auditTLSCertificateReplace: "tls.certificate.replace",
		auditTLSTrustAdd:           "tls.trust.add",
		auditTLSTrustRemove:        "tls.trust.remove",
		auditRestart:               "gateway.restart",
	} {
		if action != name {
			t.Errorf("action %q, want %q", action, name)
		}
		if p := auditPhrases[action]; p.done == "" || p.attempt == "" {
			t.Errorf("%s needs both phrases: %+v", name, p)
		}
	}
}
