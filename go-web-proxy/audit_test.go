package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
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

// A write that fails is logged at ERROR with the path and the cause, never the
// entry, the stdout copy still goes out, and record returns as normal.
func TestAudit_FailedWriteIsLoggedAndNotFatal(t *testing.T) {
	e := newAuditEnv(t, auditSettings{stdout: true})
	_ = e.a.f.Close() // every write now fails
	e.rec("TOP-SECRET-MARKER")
	e.rec("TOP-SECRET-MARKER")
	log := e.log.String()
	if strings.Count(log, "level=ERROR") != 2 || !strings.Contains(log, "audit log write failed") || !strings.Contains(log, e.path) {
		t.Errorf("want one ERROR per failed write naming the path: %s", log)
	}
	if strings.Contains(log, "TOP-SECRET-MARKER") {
		t.Errorf("the application log must not carry the entry: %s", log)
	}
	if strings.Count(e.stdout.String(), "TOP-SECRET-MARKER") != 2 {
		t.Errorf("the stdout copy must still go out: %q", e.stdout)
	}
}

// A log that cannot be reopened (its directory is gone) is logged the same way.
func TestAudit_ReopenFailureIsLogged(t *testing.T) {
	var log strings.Builder
	a := &auditor{
		lv: liveWith(nil), stdout: &bytes.Buffer{}, logger: newCapturingLogger(&log), now: time.Now,
		path: filepath.Join(t.TempDir(), "gone", "audit.log"), maxSize: auditMaxBytes, keep: auditKeepFiles,
	}
	a.record(auditAdmin, auditEntry{Action: auditUserCreate, Outcome: auditOK, Msg: "TOP-SECRET-MARKER"})
	if !strings.Contains(log.String(), "level=ERROR") || !strings.Contains(log.String(), "audit log write failed") || strings.Contains(log.String(), "TOP-SECRET-MARKER") {
		t.Errorf("want an ERROR without the entry: %s", log.String())
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
