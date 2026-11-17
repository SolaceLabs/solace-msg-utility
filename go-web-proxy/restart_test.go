package main

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// The handler answers 202 {"restarting":true} with its audit line already
// written and the answer already flushed, and only then asks serve to stop:
// the hook sees both. It asks once.
func TestRestart_AnswersAuditsAndFlushesBeforeAskingServe(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	var calls, entriesAtCall int
	var bodyAtCall string
	var flushedAtCall bool
	req := httptest.NewRequest("POST", "https://gw.example/managed/restart", nil)
	req.RemoteAddr = "192.0.2.10:5000"
	req.AddCookie(e.admin())
	rec := httptest.NewRecorder()
	e.api.restart = func() {
		calls++
		bodyAtCall, flushedAtCall, entriesAtCall = rec.Body.String(), rec.Flushed, len(au.entries(t))
	}
	e.root.ServeHTTP(rec, req)

	expect(t, rec, http.StatusAccepted, "")
	if calls != 1 {
		t.Fatalf("serve is asked once, got %d", calls)
	}
	if strings.TrimSpace(bodyAtCall) != `{"restarting":true}` || !flushedAtCall {
		t.Errorf("the answer is out before serve is asked: body %q flushed %v", bodyAtCall, flushedAtCall)
	}
	if entriesAtCall != 1 {
		t.Errorf("the audit line is written before serve is asked: %d entries", entriesAtCall)
	}
	au.expect(t, auditEntry{Actor: "admin", Action: "gateway.restart", Outcome: auditOK, Msg: "admin restarted the gateway"})
}

// Until serve gives it a hook (the API under test alone) the route answers and
// does nothing; setRestart wires the hook the handler calls.
func TestManagedRoutes_SetRestartWiresTheHook(t *testing.T) {
	e := newManagedEnv(t, nil)
	expect(t, e.do("POST", "/managed/restart", "", e.admin()), http.StatusAccepted, "")
	calls := 0
	e.routes.setRestart(func() { calls++ })
	expect(t, e.do("POST", "/managed/restart", "", e.admin()), http.StatusAccepted, "")
	if calls != 1 {
		t.Errorf("the hook is called once, got %d", calls)
	}
}

// Presses of the button while a restart is pending make no second one, and the
// handler never waits for serve.
func TestRestartRequester_RemembersOneRequestAndNeverBlocks(t *testing.T) {
	request, requested := restartRequester()
	pending := func() bool {
		select {
		case <-requested:
			return true
		default:
			return false
		}
	}
	if pending() {
		t.Fatal("nothing is pending before a request")
	}
	request()
	request()
	request()
	if !pending() {
		t.Fatal("a request is remembered")
	}
	if pending() {
		t.Fatal("however many requests, one restart")
	}
	request()
	if !pending() {
		t.Error("a request after the last was taken is remembered again")
	}
}

// ----- the whole gateway ------------------------------------------------------------------

// noRedirects is client without following redirects: the sign-in answers 303.
func noRedirects(client *http.Client) *http.Client {
	c := *client
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &c
}

// postTo sends a POST to base+path with the cookie and an optional form.
func postTo(t *testing.T, client *http.Client, base, path string, form url.Values, c *http.Cookie) *http.Response {
	t.Helper()
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequest("POST", base+path, body)
	if err != nil {
		t.Fatal(err)
	}
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if c != nil {
		req.AddCookie(c)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })
	return resp
}

func sessionFromResponse(t *testing.T, resp *http.Response) *http.Cookie {
	t.Helper()
	for _, c := range resp.Cookies() {
		if c.Name == sessionCookie && c.Value != "" {
			return c
		}
	}
	t.Fatalf("no session cookie in the answer (status %d)", resp.StatusCode)
	return nil
}

// signInBootstrapAdmin signs the bootstrap administrator in over the real
// listener, sets the new password the first sign-in forces, and returns the
// session that password change opened.
func signInBootstrapAdmin(t *testing.T, client *http.Client, base string) *http.Cookie {
	t.Helper()
	const bootstrapPW, newPW = "serve-test-password", "serve-test-new-password"
	client = noRedirects(client)
	first := sessionFromResponse(t, postTo(t, client, base, "/login", url.Values{"username": {"admin"}, "password": {bootstrapPW}, "next": {"/"}}, nil))
	changed := postTo(t, client, base, "/login/password", url.Values{"current": {bootstrapPW}, "new": {newPW}, "confirm": {newPW}, "next": {"/"}}, first)
	if changed.StatusCode != http.StatusSeeOther {
		t.Fatalf("password change: status %d", changed.StatusCode)
	}
	return sessionFromResponse(t, changed)
}

// restartServe starts a Provisioned gateway (Direct relay open too, for a slow
// request to hold) with the given restart hook, and signs the administrator in.
func restartServe(t *testing.T, ln net.Listener, shutdown time.Duration, restart func() error) (r *serveRun, client *http.Client, base, dir string, session *http.Cookie) {
	t.Helper()
	dir = gatewayDir(t)
	t.Setenv("SMU_ADMIN_PASSWORD", "serve-test-password")
	configFile := writeServeConfig(t, dir, "connModes: both\n")
	p := process{configFile: configFile, dataDir: dir, restart: restart, shutdown: shutdown}
	if ln != nil {
		p.listen = func() (net.Listener, error) { return ln, nil }
	}
	r = startServe(t, p)
	base = r.base
	if ln != nil {
		base = "https://" + ln.Addr().String()
	}
	client = gatewayClient(t, dir)
	return r, client, base, dir, signInBootstrapAdmin(t, client, base)
}

// The console's restart through the real gateway: the 202 reaches the client,
// a request already in flight is drained (serve does not return, and the hook
// is not called, until it has finished), the listener is closed when the hook
// runs, the hook runs once, and the audit trail holds the line. It is the
// SIGTERM shutdown (main_test.go TestServe_ProvisionedModeStartsAndShutsDownOnASignal)
// followed by the hook. A restart whose shutdown overruns its deadline still
// reaches the hook (TestServe_RestartWhoseDrainOverrunsClosesWhatIsLeftAndRestarts).
func TestServe_RestartDrainsRequestsInFlightThenCallsTheHookOnce(t *testing.T) {
	started, release := make(chan struct{}, 1), make(chan struct{})
	var releaseOnce sync.Once
	letGo := func() { releaseOnce.Do(func() { close(release) }) }
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		started <- struct{}{}
		<-release
		_, _ = io.WriteString(w, "slow-done")
	}))
	t.Cleanup(func() { letGo(); upstream.Close() })
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	var calls atomic.Int32
	var listenerClosed atomic.Bool
	hook := func() error {
		calls.Add(1)
		conn, err := net.DialTimeout("tcp", ln.Addr().String(), time.Second)
		if err != nil {
			listenerClosed.Store(true)
		} else {
			_ = conn.Close()
		}
		return nil
	}
	r, client, base, dir, session := restartServe(t, ln, 0, hook)

	_, port, _ := net.SplitHostPort(upstream.Listener.Addr().String())
	type answer struct {
		status int
		body   string
		err    error
	}
	slow := make(chan answer, 1)
	go func() {
		resp, err := client.Get(base + "/http/" + port + "/127.0.0.1/slow")
		if err != nil {
			slow <- answer{err: err}
			return
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		slow <- answer{status: resp.StatusCode, body: string(b), err: err}
	}()
	select {
	case <-started:
	case <-time.After(30 * time.Second):
		t.Fatalf("the slow request never reached the upstream; log:\n%s", r.log)
	}

	resp := postTo(t, client, base, "/managed/restart", nil, session)
	if b, _ := io.ReadAll(resp.Body); resp.StatusCode != http.StatusAccepted || strings.TrimSpace(string(b)) != `{"restarting":true}` {
		t.Fatalf("restart answered %d %q", resp.StatusCode, b)
	}
	select {
	case err := <-r.done:
		t.Fatalf("serve returned (%v) while a request was in flight", err)
	case <-time.After(300 * time.Millisecond):
	}
	if calls.Load() != 0 {
		t.Fatal("the hook runs after the drain, not before")
	}

	letGo()
	if a := <-slow; a.err != nil || a.status != http.StatusOK || a.body != "slow-done" {
		t.Fatalf("the request in flight is answered: %+v", a)
	}
	if err := r.result(t); err != nil {
		t.Fatalf("serve after a restart: %v\n%s", err, r.log)
	}
	if calls.Load() != 1 || !listenerClosed.Load() {
		t.Errorf("hook called %d times, listener closed at the call: %v", calls.Load(), listenerClosed.Load())
	}
	log := r.log.String()
	expectLogged(t, log, "restart requested", "shutdown complete")
	if strings.Contains(log, "shutdown signal received") || strings.Contains(log, "restart failed") {
		t.Errorf("a restart is neither a signal nor a failure:\n%s", log)
	}
	audit := string(mustRead(t, filepath.Join(dir, "audit.log")))
	if n := strings.Count(audit, `"action":"gateway.restart","outcome":"ok"`); n != 1 {
		t.Errorf("one gateway.restart line in the audit log, got %d:\n%s", n, audit)
	}
}

// A restart whose drain overruns the shutdown deadline still starts the program
// again: the request still open is cut (the exec would cut it anyway), the
// overrun is a warning, and the hook runs once. A signal's overrun fails
// (main_test.go TestServe_ShutdownThatOverrunsItsDeadlineFails).
func TestServe_RestartWhoseDrainOverrunsClosesWhatIsLeftAndRestarts(t *testing.T) {
	started, release := make(chan struct{}, 1), make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		started <- struct{}{}
		<-release
	}))
	t.Cleanup(func() { close(release); upstream.Close() })
	var calls atomic.Int32
	r, client, base, _, session := restartServe(t, nil, 200*time.Millisecond, func() error {
		calls.Add(1)
		return nil
	})

	_, port, _ := net.SplitHostPort(upstream.Listener.Addr().String())
	slow := make(chan error, 1)
	go func() {
		resp, err := client.Get(base + "/http/" + port + "/127.0.0.1/slow")
		if err == nil {
			_, err = io.ReadAll(resp.Body)
			_ = resp.Body.Close()
		}
		slow <- err
	}()
	select {
	case <-started:
	case <-time.After(30 * time.Second):
		t.Fatalf("the slow request never reached the upstream; log:\n%s", r.log)
	}

	if resp := postTo(t, client, base, "/managed/restart", nil, session); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("restart answered %d", resp.StatusCode)
	}
	if err := r.result(t); err != nil {
		t.Fatalf("a restart's overrun is not a failure: %v\n%s", err, r.log)
	}
	if calls.Load() != 1 {
		t.Errorf("hook called %d times", calls.Load())
	}
	if err := <-slow; err == nil {
		t.Error("the request still open at the deadline is cut, not answered")
	}
	log := r.log.String()
	expectLogged(t, log, "restart requested", "graceful shutdown overran its deadline")
	if strings.Contains(log, "graceful shutdown failed") || strings.Contains(log, "gateway restart failed") {
		t.Errorf("an overrun restart is neither a failed shutdown nor a failed restart:\n%s", log)
	}
}

// A hook that fails (the program could not be started again): the cause is
// logged and serve returns it, so main exits with status 1 and the platform's
// restart policy takes over.
func TestServe_RestartWhoseHookFailsLogsWhyAndReturnsTheError(t *testing.T) {
	cause := errors.New("cannot start /usr/local/bin/gateway again: exec format error")
	var calls atomic.Int32
	r, client, base, _, session := restartServe(t, nil, 0, func() error {
		calls.Add(1)
		return cause
	})
	if resp := postTo(t, client, base, "/managed/restart", nil, session); resp.StatusCode != http.StatusAccepted {
		t.Fatalf("restart answered %d", resp.StatusCode)
	}
	if err := r.result(t); !errors.Is(err, cause) {
		t.Fatalf("serve returns the hook's error, got %v\n%s", err, r.log)
	}
	if calls.Load() != 1 {
		t.Errorf("hook called %d times", calls.Load())
	}
	expectLogged(t, r.log.String(), "shutdown complete", "gateway restart failed", "exec format error")
}
