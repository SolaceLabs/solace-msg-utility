package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

// managedEnv is the managed gateway as serve() mounts it, over the store
// fixtures (admin + viewer, brokers b1, b2), with a fake clock. The hosted,
// admin, app and relay handlers are stubs that answer with their name.
type managedEnv struct {
	f       storeFixture
	clock   *fakeClock
	log     *strings.Builder
	cfg     config // as the gateway started
	live    *live
	cfgPath string  // config.yaml, seeded from cfg
	tls     *tlsFix // the TLS manager the /managed/tls* routes call, over a temp directory
	routes  *managedRoutes
	api     *managedHandler
	pages   *authPages
	root    http.Handler
}

func named(name string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, name) })
}

func newManagedEnv(t *testing.T, mutate func(*config)) *managedEnv {
	t.Helper()
	return newManagedEnvWith(t, mutate, nil)
}

// newManagedEnvWith takes the broker transport the SEMP relay uses (nil: the
// default transport, for tests that never reach a broker).
func newManagedEnvWith(t *testing.T, mutate func(*config), upstream http.RoundTripper) *managedEnv {
	t.Helper()
	return newManagedEnvFrom(t, newStoreFixture(t), mutate, upstream)
}

// newManagedEnvFrom mounts the gateway over the store files in f (the
// contract test writes its own seed there).
func newManagedEnvFrom(t *testing.T, f storeFixture, mutate func(*config), upstream http.RoundTripper) *managedEnv {
	t.Helper()
	cfg := defaultConfig()
	cfg.hosted, cfg.connModes = true, connBoth
	cfg.usersFile, cfg.connectionsFile, cfg.storeKeyFile = f.usersPath, f.connsPath, f.keyPath
	cfg.login.unauthPerMinute = 1000
	cfg.backupDir = filepath.Join(filepath.Dir(f.usersPath), "backup")
	if err := os.MkdirAll(cfg.backupDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if mutate != nil {
		mutate(&cfg)
	}
	clock := newFakeClock()
	log := &strings.Builder{}
	cfgPath := filepath.Join(filepath.Dir(f.usersPath), "config.yaml")
	data, err := seedConfigFile(cfgPath, cfg)
	if err != nil {
		t.Fatal(err)
	}
	lv := newLive(cfg)
	logger := newCapturingLogger(log)
	tf := newTLSFix(t)
	routes, err := buildManagedRoutes(cfg, lv, configSource{path: cfgPath, data: data}, f.h, noEnv, clock.now, upstream, tf.m, logger)
	if err != nil {
		t.Fatalf("buildManagedRoutes: %v", err)
	}
	// The chain serve() builds, minus the access log: the client list
	// applies, so a saved allow list is enforced on the next request.
	root := withClient(lv, clientACL(lv, newRootHandler(named("hosted"), named("admin"), named("app"), named("relay"), routes), logger))
	return &managedEnv{
		f: f, clock: clock, log: log, cfg: cfg, live: lv, cfgPath: cfgPath, tls: tf, routes: routes,
		api:   routes.api.(*managedHandler),
		pages: routes.pages.(*authPages),
		root:  root,
	}
}

// cookie signs user in directly (the sign-in form has its own tests).
func (e *managedEnv) cookie(user string, mustChange bool) *http.Cookie {
	return &http.Cookie{Name: sessionCookie, Value: e.api.sessions.create(user, mustChange)}
}

func (e *managedEnv) do(method, path, body string, c *http.Cookie, headers ...string) *httptest.ResponseRecorder {
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, "https://gw.example"+path, r)
	req.RemoteAddr = "192.0.2.10:5000"
	if c != nil {
		req.AddCookie(c)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req)
	return rec
}

// withRev puts "rev" first in the JSON object body, as the console sends a
// save.
func withRev(body string, rev int) string {
	if body == "" || body == "{}" {
		return fmt.Sprintf(`{"rev":%d}`, rev)
	}
	return fmt.Sprintf(`{"rev":%d,`, rev) + body[1:]
}

// userRev and connRev are the rev the store holds for the record now: what
// the console read when it listed it, and 0 for a name that is not there.
func (e *managedEnv) userRev(name string) int {
	u, _ := userNamed(e.api.store.listUsers(), name)
	return u.Rev
}

func (e *managedEnv) connRev(broker string) int {
	c, _ := connectionNamed(e.api.store.listConnections(), broker)
	return c.Rev
}

// putUserAs and putConnAs save as the console would after listing the record:
// at the rev the store holds now (0, a create, for a new name). delUserAs and
// delConnAs delete at the current rev. The tests of a refusal for the rev send
// their own.
func (e *managedEnv) putUserAs(c *http.Cookie, name, body string) *httptest.ResponseRecorder {
	return e.do("PUT", "/managed/users/"+name, withRev(body, e.userRev(name)), c)
}

func (e *managedEnv) putConnAs(c *http.Cookie, broker, body string) *httptest.ResponseRecorder {
	return e.do("PUT", "/managed/connections/"+broker, withRev(body, e.connRev(broker)), c)
}

func (e *managedEnv) delUserAs(c *http.Cookie, name string) *httptest.ResponseRecorder {
	return e.do("DELETE", fmt.Sprintf("/managed/users/%s?rev=%d", name, e.userRev(name)), "", c)
}

func (e *managedEnv) delConnAs(c *http.Cookie, broker string) *httptest.ResponseRecorder {
	return e.do("DELETE", fmt.Sprintf("/managed/connections/%s?rev=%d", broker, e.connRev(broker)), "", c)
}

func errorCode(t *testing.T, rec *httptest.ResponseRecorder) apiError {
	t.Helper()
	var e apiError
	if err := json.Unmarshal(rec.Body.Bytes(), &e); err != nil {
		t.Fatalf("want a JSON error body, got %q", rec.Body.String())
	}
	return e
}

func expect(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status: want %d, got %d (%s)", status, rec.Code, rec.Body.String())
	}
	if code != "" {
		if got := errorCode(t, rec).Error; got != code {
			t.Fatalf("error code: want %q, got %q", code, got)
		}
	}
}

// ----- the audit trail over the managed gateway ---------------------------------------

// auditTestTime is every entry's time under newTestAuditor's clock.
const auditTestTime = "2026-11-12T09:30:00Z"

// auditLog reads the audit file an auditor wrote.
type auditLog struct{ path string }

// newTestAuditor opens an auditor over lv in a temp file, its clock fixed at
// auditTestTime and the stdout copy discarded.
func newTestAuditor(t *testing.T, lv *live) (*auditor, *auditLog) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "audit.log")
	a, err := openAuditor(path, lv, io.Discard, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.close() })
	a.now = func() time.Time { return time.Date(2026, 11, 12, 9, 30, 0, 0, time.UTC) }
	return a, &auditLog{path: path}
}

// setAudit swaps the live audit options, as a settings save does.
func (e *managedEnv) setAudit(set auditSettings) {
	next := e.cfg
	next.audit = set
	e.live.apply(next)
}

// withAudit gives every piece of the gateway an auditor over a temp file, with
// the live audit options set.
func (e *managedEnv) withAudit(t *testing.T, set auditSettings) *auditLog {
	t.Helper()
	e.setAudit(set)
	a, l := newTestAuditor(t, e.live)
	e.routes.setAuditor(a)
	return l
}

func (l *auditLog) entries(t *testing.T) []auditEntry {
	t.Helper()
	var out []auditEntry
	for _, line := range fileLines(t, l.path) {
		if line == "" {
			continue
		}
		var e auditEntry
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			t.Fatalf("audit line %q: %v", line, err)
		}
		out = append(out, e)
	}
	return out
}

// expect asserts the whole trail so far. A want's Time is the test clock's,
// and its Client the one e.do uses unless it names another.
func (l *auditLog) expect(t *testing.T, want ...auditEntry) {
	t.Helper()
	for i := range want {
		want[i].Time = auditTestTime
		if want[i].Client == "" {
			want[i].Client = "192.0.2.10"
		}
	}
	if got := l.entries(t); !reflect.DeepEqual(got, want) {
		t.Fatalf("audit entries:\n got %+v\nwant %+v", got, want)
	}
}

// waitEntries waits for n entries: a few are written after the response (an
// SMF socket's close).
func (l *auditLog) waitEntries(t *testing.T, n int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for len(l.entries(t)) < n {
		if time.Now().After(deadline) {
			t.Fatalf("want %d audit entries, got %+v", n, l.entries(t))
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// ----- the gate ------------------------------------------------------------------

// Without a session every /managed/* request gets byte-for-byte the same 401:
// known, unknown, admin-only and state-changing paths alike.
func TestManagedAPI_UnauthenticatedIsUniform(t *testing.T) {
	e := newManagedEnv(t, nil)
	forged := &http.Cookie{Name: sessionCookie, Value: "forged"}
	var first string
	for _, c := range []*http.Cookie{nil, forged} {
		for _, rq := range [][2]string{
			{"GET", "/managed/me"}, {"GET", "/managed/users"}, {"POST", "/managed/logout"},
			{"GET", "/managed/nope"}, {"PUT", "/managed/users/x"}, {"DELETE", "/managed/connections/b1"},
			{"GET", "/managed/relay/b1/SEMP/v2/monitor/msgVpns"}, {"POST", "/managed/relay/b1/SEMP"},
			{"POST", "/managed/dial"}, {"GET", "/managed/smf/b1/v1"},
		} {
			rec := e.do(rq[0], rq[1], `{"a":1}`, c)
			expect(t, rec, http.StatusUnauthorized, "unauthenticated")
			if first == "" {
				first = rec.Body.String()
			}
			if rec.Body.String() != first || rec.Header().Get("Cache-Control") != "no-store" {
				t.Errorf("%s %s: response differs: %q", rq[0], rq[1], rec.Body.String())
			}
		}
	}
}

func TestManagedAPI_UnauthenticatedIsThrottled(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login.unauthPerMinute = 2 })
	e.do("GET", "/managed/me", "", nil)
	e.do("GET", "/managed/me", "", nil)
	rec := e.do("GET", "/managed/me", "", nil)
	expect(t, rec, http.StatusTooManyRequests, "rate_limited")
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 must carry Retry-After")
	}
	expect(t, e.do("GET", "/managed/me", "", e.cookie("admin", false)), http.StatusOK, "")
}

func TestManagedAPI_MustChangeAllowsOnlyLogout(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", true)
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusForbidden, "password_change_required")
	expect(t, e.do("GET", "/managed/users", "", c), http.StatusForbidden, "password_change_required")
	expect(t, e.do("POST", "/managed/logout", "", c), http.StatusNoContent, "")
}

func TestManagedAPI_CrossOriginStateChangeRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.do("DELETE", "/managed/users/viewer?rev=2", "", c, "Sec-Fetch-Site", "cross-site"), http.StatusForbidden, "cross_origin")
	expect(t, e.do("POST", "/managed/logout", "", c, "Origin", "https://evil.example"), http.StatusForbidden, "cross_origin")
	expect(t, e.do("GET", "/managed/me", "", c, "Sec-Fetch-Site", "cross-site"), http.StatusOK, "")
	expect(t, e.do("DELETE", "/managed/users/viewer?rev=2", "", c, "Sec-Fetch-Site", "same-origin"), http.StatusNoContent, "")
}

func TestManagedAPI_UnknownPathOrMethodIs404(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("viewer", false)
	expect(t, e.do("GET", "/managed/nope", "", c), http.StatusNotFound, "not_found")
	expect(t, e.do("POST", "/managed/me", "", c), http.StatusNotFound, "not_found")
}

// ----- session endpoints -------------------------------------------------------------

func TestManagedAPI_Me(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("GET", "/managed/me", "", e.cookie("viewer", false))
	expect(t, rec, http.StatusOK, "")
	var p profileResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if p.Username != "viewer" || p.Admin || len(p.Brokers) != 1 || len(p.Brokers[0].MsgVpns) != 1 {
		t.Errorf("viewer profile: %+v", p)
	}
	if !reflect.DeepEqual(p.Modules, []string{"queue-browser"}) {
		t.Errorf("viewer modules: want their own list, got %v", p.Modules)
	}
	// Names only: the relay and dial supply addresses and credentials.
	if !strings.Contains(rec.Body.String(), `"brokers":[{"broker":"b1","msgVpns":[{"name":"v1"}]}]`) {
		t.Errorf("viewer brokers must be names only: %s", rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "application/json" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("headers: %v", rec.Header())
	}
	// A session whose user was removed behind its back is not signed in.
	c := e.cookie("ghost", false)
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/users", "", c), http.StatusUnauthorized, "unauthenticated")
}

func TestManagedAPI_Logout(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("viewer", false)
	rec := e.do("POST", "/managed/logout", "", c)
	expect(t, rec, http.StatusNoContent, "")
	au.expect(t, auditEntry{Actor: "viewer", Action: "signout", Target: "viewer", Outcome: "ok", Msg: "viewer signed out"})
	if cl := rec.Result().Cookies(); len(cl) != 1 || cl[0].MaxAge >= 0 {
		t.Errorf("logout must expire the cookie: %+v", cl)
	}
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusUnauthorized, "unauthenticated")
}

// ----- users ----------------------------------------------------------------------------

func TestManagedAPI_AdminOnly(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("viewer", false)
	for _, rq := range [][2]string{
		{"GET", "/managed/users"}, {"PUT", "/managed/users/x"}, {"DELETE", "/managed/users/x"},
		{"GET", "/managed/connections"}, {"PUT", "/managed/connections/b1"}, {"DELETE", "/managed/connections/b1"},
		{"GET", "/managed/settings"}, {"PUT", "/managed/settings"},
	} {
		expect(t, e.do(rq[0], rq[1], "{}", c), http.StatusForbidden, "forbidden")
	}
}

func TestManagedAPI_ListUsersNeverSendsHashes(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("GET", "/managed/users", "", e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	body := rec.Body.String()
	if strings.Contains(body, "pbkdf2") || strings.Contains(body, `"password"`) {
		t.Errorf("the hash must never leave the gateway: %s", body)
	}
	var out struct {
		Users   []userListJSON
		Modules modulesJSON
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || len(out.Users) != 2 {
		t.Fatalf("users: %v %s", err, body)
	}
	// Each row carries the rev a save or delete of it must send back.
	if out.Users[0].Rev != 1 || out.Users[1].Rev != 2 || !strings.Contains(body, `"username":"admin"`) {
		t.Errorf("revs: want admin 1 and viewer 2, got %d and %d in %s", out.Users[0].Rev, out.Users[1].Rev, body)
	}
	if out.Users[1].Username != "viewer" || len(out.Users[1].ReadOnly) != 1 || out.Users[1].ReadOnly[0].Brokers != "b1" {
		t.Errorf("viewer row: %+v", out.Users[1])
	}
	// The module editor's inputs: each user's own list (null = the default)
	// and what the deployment offers.
	if !strings.Contains(body, `"modules":null`) || !reflect.DeepEqual(*out.Users[1].Modules, []string{"queue-browser"}) {
		t.Errorf("user modules: %s", body)
	}
	want := modulesJSON{Catalog: moduleCatalog(), Offered: moduleCatalog(), UserDefault: modulesDefaultAll}
	if !reflect.DeepEqual(out.Modules, want) {
		t.Errorf("modules block: want %+v, got %+v", want, out.Modules)
	}
}

func TestManagedAPI_SaveUser_CreateAndValidate(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	put := func(name, body string) *httptest.ResponseRecorder {
		return e.do("PUT", "/managed/users/"+name, body, c)
	}

	created := put("bob", `{"rev":0,"password":"bob-password-1","admin":false,"operate":[],"readOnly":[{"brokers":"b1","msgVpns":"*","queues":"*"}]}`)
	expect(t, created, http.StatusOK, "")
	if got := decodeTo[map[string]int](t, created.Body.Bytes()); got["rev"] != 3 || e.userRev("bob") != 3 {
		t.Errorf("a create answers the rev it stamped (the users file's new seq, 3): %v", got)
	}
	if !signsIn(t, e.api.store, "bob", "bob-password-1") {
		t.Error("the created user must sign in")
	}
	cases := []struct {
		name, user, body string
		status           int
		code, field      string
	}{
		{"bad username", "a%20b", `{"password":"long-enough-pw"}`, 422, "invalid", "username"},
		{"dots only", "...", `{"password":"long-enough-pw"}`, 422, "invalid", "username"},
		{"short password", "carol", `{"password":"short"}`, 422, "invalid", "password"},
		{"new without password", "carol", `{"rev":0}`, 422, "invalid", "password"},
		{"unknown field", "carol", `{"password":"long-enough-pw","role":"x"}`, 400, "bad_request", ""},
		{"trailing data", "carol", `{"password":"long-enough-pw"} {}`, 400, "bad_request", ""},
		{"malformed", "carol", `{`, 400, "bad_request", ""},
		{"too large", "carol", `{"password":"` + strings.Repeat("x", maxBodyBytes) + `"}`, 413, "too_large", ""},
		{"too large after the value", "carol", `{"password":"long-enough-pw"}` + strings.Repeat(" ", maxBodyBytes), 413, "too_large", ""},
		{"last admin", "admin", `{"rev":1,"admin":false}`, 409, "last_admin", ""},
		{"unknown module", "carol", `{"password":"long-enough-pw","modules":["queue-discovery"]}`, 422, "invalid", "modules"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := put(tc.user, tc.body)
			expect(t, rec, tc.status, tc.code)
			if got := errorCode(t, rec).Field; got != tc.field {
				t.Errorf("field: want %q, got %q", tc.field, got)
			}
		})
	}
	if _, exists := e.api.store.isAdmin("carol"); exists {
		t.Error("no rejected save may create the user")
	}
}

// A module list is stored as sent; null goes back to the deployment default.
// /managed/me reflects a change at once, without ending the session.
func TestManagedAPI_SaveUser_Modules(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin, viewer := e.cookie("admin", false), e.cookie("viewer", false)
	modules := func() []string {
		var p profileResponse
		rec := e.do("GET", "/managed/me", "", viewer)
		expect(t, rec, http.StatusOK, "")
		_ = json.Unmarshal(rec.Body.Bytes(), &p)
		return p.Modules
	}
	expect(t, e.putUserAs(admin, "viewer", `{"modules":["queue-copy"]}`), http.StatusOK, "")
	if got := modules(); !reflect.DeepEqual(got, []string{"queue-copy"}) {
		t.Errorf("own list: got %v", got)
	}
	expect(t, e.putUserAs(admin, "viewer", `{"modules":null}`), http.StatusOK, "")
	if got := modules(); !reflect.DeepEqual(got, moduleCatalog()) {
		t.Errorf("null: want the deployment default (every module), got %v", got)
	}
	expect(t, e.putUserAs(admin, "viewer", `{"modules":[]}`), http.StatusOK, "")
	if got := modules(); len(got) != 0 {
		t.Errorf("empty list: want none, got %v", got)
	}
}

func TestManagedAPI_SaveUser_SessionsEndOnPasswordOrRoleChange(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin := e.cookie("admin", false)
	viewer := e.cookie("viewer", false)

	// An edit that changes neither keeps the user signed in.
	expect(t, e.putUserAs(admin, "viewer", `{"readOnly":[]}`), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "")

	expect(t, e.putUserAs(admin, "viewer", `{"password":"viewer-new-pw-1"}`), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")

	viewer = e.cookie("viewer", false)
	expect(t, e.putUserAs(admin, "viewer", `{"admin":true}`), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")

	// The admin's own password change ends the admin's own session too.
	expect(t, e.putUserAs(admin, "admin", `{"admin":true,"password":"admin-new-pw-1"}`), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", admin), http.StatusUnauthorized, "unauthenticated")
}

func TestManagedAPI_SaveAndDeleteUser_PersistErrorIs500(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	blockWrites(t, &e.api.store.usersPath)
	expect(t, e.do("PUT", "/managed/users/bob", `{"rev":0,"password":"bob-password-1"}`, c), http.StatusInternalServerError, "store_write_failed")
	expect(t, e.do("DELETE", "/managed/users/viewer?rev=2", "", c), http.StatusInternalServerError, "store_write_failed")
	for _, want := range []string{"admin request failed", "op=saveUser", "target=bob", "user=admin", "op=deleteUser", "target=viewer"} {
		if !strings.Contains(e.log.String(), want) {
			t.Errorf("the failure must name %q in the log: %s", want, e.log.String())
		}
	}
}

func TestManagedAPI_DeleteUser(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin := e.cookie("admin", false)
	viewer := e.cookie("viewer", false)
	expect(t, e.do("DELETE", "/managed/users/admin?rev=1", "", admin), http.StatusConflict, "last_admin")
	expect(t, e.do("DELETE", "/managed/users/ghost?rev=1", "", admin), http.StatusNotFound, "not_found")
	expect(t, e.delUserAs(admin, "viewer"), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")
}

// ----- connections ----------------------------------------------------------------------

func TestManagedAPI_ListConnectionsNeverSendsSecrets(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.putConnAs(c, "b3", `{"hostname":"h3","semp":{"port":"","user":"","pass":""},"client":{"port":"","msgVpns":[]}}`), http.StatusOK, "")
	rec := e.do("GET", "/managed/connections", "", c)
	expect(t, rec, http.StatusOK, "")
	body := rec.Body.String()
	var list struct{ Connections []connListJSON }
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list.Connections) != 3 {
		t.Fatalf("connections: %v %s", err, body)
	}
	// Each row carries the rev a save or delete of it must send back.
	if got := []int{list.Connections[0].Rev, list.Connections[1].Rev, list.Connections[2].Rev}; !reflect.DeepEqual(got, []int{1, 2, 3}) {
		t.Errorf("revs: want 1, 2 and the new b3's 3, got %v in %s", got, body)
	}
	if strings.Contains(body, "-pw") || strings.Contains(strings.ReplaceAll(body, `"pass":""`, ""), `"pass"`) {
		t.Errorf("stored passwords must never be listed: %s", body)
	}
	if !strings.Contains(body, `"broker":"b3","hostname":"h3"`) || !strings.Contains(body, `"msgVpns":[]`) {
		t.Errorf("a VPN-less connection must list msgVpns as []: %s", body)
	}
}

func TestManagedAPI_SaveConnection(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	ok := `{"hostname":"h","semp":{"port":"1943","user":"mon","pass":"V1:x"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"V1:y"}]}}`
	created := e.do("PUT", "/managed/connections/b3", withRev(ok, 0), c)
	expect(t, created, http.StatusOK, "")
	if got := decodeTo[map[string]int](t, created.Body.Bytes()); got["rev"] != 3 || e.connRev("b3") != 3 {
		t.Errorf("a create answers the rev it stamped (the connections file's new seq, 3): %v", got)
	}
	if n := len(e.api.store.listConnections()); n != 3 {
		t.Errorf("want 3 connections, got %d", n)
	}
	rec := e.do("PUT", "/managed/connections/b3", `{"semp":{"port":"x"}}`, c)
	expect(t, rec, http.StatusUnprocessableEntity, "invalid")
	if r := errorCode(t, rec); r.Field != "connection" || !strings.Contains(r.Reason, `semp.port "x" is not a port`) {
		t.Errorf("want the field and reason, got %+v", r)
	}
	expect(t, e.do("PUT", "/managed/connections/b%203", ok, c), http.StatusUnprocessableEntity, "invalid")
	expect(t, e.do("PUT", "/managed/connections/...", ok, c), http.StatusUnprocessableEntity, "invalid")
	expect(t, e.do("PUT", "/managed/connections/b3", `{"vpn":1}`, c), http.StatusBadRequest, "bad_request")
	blockWrites(t, &e.api.store.connsPath)
	expect(t, e.do("PUT", "/managed/connections/b4", withRev(ok, 0), c), http.StatusInternalServerError, "store_write_failed")
}

func TestManagedAPI_DeleteConnection(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.do("DELETE", "/managed/connections/nope?rev=1", "", c), http.StatusNotFound, "not_found")
	expect(t, e.delConnAs(c, "b2"), http.StatusNoContent, "")
	blockWrites(t, &e.api.store.connsPath)
	expect(t, e.do("DELETE", "/managed/connections/b1?rev=1", "", c), http.StatusInternalServerError, "store_write_failed")
}

func TestWriteJSON_EncodeFailureKeepsStatus(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, map[string]any{"bad": func() {}})
	if rec.Code != http.StatusOK {
		t.Errorf("status already sent must stand, got %d", rec.Code)
	}
}

// Each user and connection change logs one INFO line naming the acting
// administrator (user), the target and what changed, never a password.
func TestManagedAPI_ChangesAreLoggedWithActorAndTarget(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.putUserAs(c, "carol", `{"password":"carol-password-1","modules":["queue-browser"]}`), http.StatusOK, "")
	expect(t, e.putUserAs(c, "viewer", `{"readOnly":[]}`), http.StatusOK, "")
	expect(t, e.delUserAs(c, "carol"), http.StatusNoContent, "")
	expect(t, e.putConnAs(c, "b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"semp-new-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"vpn-new-pw"},{"name":"v2","user":"u","pass":""}]}}`), http.StatusOK, "")
	expect(t, e.delConnAs(c, "b3"), http.StatusNoContent, "")
	log := e.log.String()
	lines := []struct {
		msg, target string
		wants       []string
	}{
		{"user saved", "carol", []string{"user=admin", "created=true", "password_set=true", "modules=[queue-browser]"}},
		{"user saved", "viewer", []string{"created=false", "password_set=false", "modules=default", "sessions_ended=false"}},
		{"user deleted", "carol", []string{"user=admin"}},
		{"connection saved", "b3", []string{"created=true", "semp_scheme=https", "client_scheme=wss", "semp_password_set=true", "vpns=\"[v1 v2]\"", "vpn_passwords_set=1"}},
		{"connection deleted", "b3", []string{"user=admin"}},
	}
	for _, l := range lines {
		line := logLine(log, `msg="`+l.msg+`"`, "target="+l.target)
		if line == "" {
			t.Errorf("no %q line for %s in %s", l.msg, l.target, log)
			continue
		}
		for _, w := range l.wants {
			if !strings.Contains(line, w) {
				t.Errorf("%s %s: want %q in %s", l.msg, l.target, w, line)
			}
		}
	}
	for _, secret := range []string{"carol-password-1", "semp-new-pw", "vpn-new-pw"} {
		if strings.Contains(log, secret) {
			t.Errorf("a password reached the log: %s", secret)
		}
	}
}

// logLine is the first line of log containing every one of want, or "".
func logLine(log string, want ...string) string {
	for _, l := range strings.Split(log, "\n") {
		all := true
		for _, w := range want {
			all = all && strings.Contains(l, w)
		}
		if all {
			return l
		}
	}
	return ""
}

// A connection's schemes: a save may name the plain one, leave the field out
// or name TLS (both stored as the default), and the list always says which.
func TestManagedAPI_ConnectionSchemes(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	plain := `{"hostname":"h3","semp":{"scheme":"http","port":"8080","user":"","pass":""},"client":{"scheme":"ws","port":"8008","msgVpns":[]}}`
	tls := `{"hostname":"h4","semp":{"scheme":"https","port":"1943","user":"","pass":""},"client":{"scheme":"wss","port":"1443","msgVpns":[]}}`
	expect(t, e.putConnAs(c, "b3", plain), http.StatusOK, "")
	expect(t, e.putConnAs(c, "b4", tls), http.StatusOK, "")
	rec := e.do("GET", "/managed/connections", "", c)
	expect(t, rec, http.StatusOK, "")
	var list struct{ Connections []connJSON }
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	want := map[string][2]string{"b1": {"https", "wss"}, "b2": {"https", "wss"}, "b3": {"http", "ws"}, "b4": {"https", "wss"}}
	for _, conn := range list.Connections {
		if got := [2]string{conn.Semp.Scheme, conn.Client.Scheme}; got != want[conn.Broker] {
			t.Errorf("%s: schemes %v, want %v", conn.Broker, got, want[conn.Broker])
		}
	}
	for _, rc := range e.api.store.listConnections() {
		if rc.Broker == "b4" && (rc.Semp.Scheme != "" || rc.Client.Scheme != "") {
			t.Errorf("TLS is stored as the default: %+v", rc)
		}
	}
	bad := e.do("PUT", "/managed/connections/b5", `{"hostname":"h5","semp":{"scheme":"ftp"},"client":{}}`, c)
	expect(t, bad, http.StatusUnprocessableEntity, "invalid")
	if r := errorCode(t, bad); r.Field != "connection" || r.Reason != `broker "b5": semp.scheme "ftp" must be "https" or "http"` {
		t.Errorf("want the field and reason, got %+v", r)
	}
}

// GET /managed/client says which address the gateway took this browser for,
// and whether a trusted proxy's X-Forwarded-For decided it.
func TestManagedAPI_ClientSeen(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.access.trustedProxies = prefixes(t, "192.0.2.10/32") })
	admin := e.cookie("admin", false)
	cases := []struct {
		name string
		xff  []string
		want clientSeenJSON
	}{
		{"direct", nil, clientSeenJSON{Address: "192.0.2.10", Peer: "192.0.2.10"}},
		{"through a trusted proxy", []string{"X-Forwarded-For", "203.0.113.9"}, clientSeenJSON{Address: "203.0.113.9", Peer: "192.0.2.10", ViaProxy: true}},
		{"a proxy header that does not parse", []string{"X-Forwarded-For", "not-an-address"}, clientSeenJSON{Peer: "192.0.2.10"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := e.do("GET", "/managed/client", "", admin, c.xff...)
			expect(t, rec, http.StatusOK, "")
			var got clientSeenJSON
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got != c.want {
				t.Errorf("got %+v, want %+v", got, c.want)
			}
		})
	}
	expect(t, e.do("GET", "/managed/client", "", e.cookie("viewer", false)), http.StatusForbidden, "forbidden")
}

// ----- audit entries of the admin routes ---------------------------------------------

// Every user change is one admin entry: ok after the commit, refused with the
// API's code otherwise, and an update names the parts changed, never a value.
func TestManagedAPI_UserChangesAreAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	put := func(name, body string) { e.putUserAs(c, name, body) }

	put("bob", `{"password":"bob-password-1","readOnly":[{"brokers":"b1","msgVpns":"*","queues":"*"}]}`)
	put("bob", `{"password":"bob-password-2","admin":true,"readOnly":[],"modules":["queue-browser"]}`)
	put("viewer", `{"modules":["queue-browser"],"readOnly":[{"brokers":"b1","msgVpns":"v1","queues":"*"}]}`)
	put("admin", `{"admin":true,"operate":[{"brokers":"*","msgVpns":"*","queues":"*"}]}`)
	put("carol", `{"password":"short"}`)
	// bob goes first: while bob is an admin, the demotion would succeed and sign admin out.
	e.delUserAs(c, "bob")
	put("admin", `{"admin":false}`)
	e.do("DELETE", "/managed/users/ghost?rev=1", "", c)
	e.do("PUT", "/managed/users/x", `{}`, e.cookie("viewer", false))

	au.expect(t,
		auditEntry{Actor: "admin", Action: "user.create", Target: "bob", Outcome: "ok", Wrote: usersWrote(3), Msg: "admin created user bob"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "bob", Outcome: "ok", Changed: []string{"password", "admin", "grants", "modules"}, Wrote: usersWrote(4),
			Msg: "admin updated user bob: password, admin, grants, modules"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "viewer", Outcome: "ok", Wrote: usersWrote(5), Msg: "admin updated user viewer"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "admin", Outcome: "ok", Wrote: usersWrote(6), Msg: "admin updated user admin"},
		auditEntry{Actor: "admin", Action: "user.create", Target: "carol", Outcome: "refused", Code: "invalid", Msg: "admin could not create user carol: invalid"},
		auditEntry{Actor: "admin", Action: "user.delete", Target: "bob", Outcome: "ok", Wrote: usersWrote(7), Msg: "admin deleted user bob"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "admin", Outcome: "refused", Code: "last_admin", Msg: "admin could not update user admin: last_admin"},
		auditEntry{Actor: "admin", Action: "user.delete", Target: "ghost", Outcome: "refused", Code: "not_found", Msg: "admin could not delete user ghost: not_found"},
		auditEntry{Actor: "viewer", Action: "user.create", Target: "x", Outcome: "refused", Code: "forbidden", Msg: "viewer could not create user x: forbidden"},
	)
}

// A save that fails to write is a refusal with the store_write_failed code,
// and carries no "wrote": nothing was written.
func TestManagedAPI_FailedSaveIsAuditedAsRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	blockWrites(t, &e.api.store.usersPath)
	expect(t, e.do("PUT", "/managed/users/bob", `{"rev":0,"password":"bob-password-1"}`, e.cookie("admin", false)), http.StatusInternalServerError, "store_write_failed")
	au.expect(t, auditEntry{Actor: "admin", Action: "user.create", Target: "bob", Outcome: "refused", Code: "store_write_failed",
		Msg: "admin could not create user bob: store_write_failed"})
}

// usersWrote and connsWrote are the "wrote" of an ok entry for a commit that
// moved the file to seq.
func usersWrote(seq int64) []auditWrote { return []auditWrote{{File: "users.yaml", Seq: seq}} }
func connsWrote(seq int64) []auditWrote { return []auditWrote{{File: "conns.yaml", Seq: seq}} }

// A connection update names hostname, semp, client and each VPN added,
// changed or removed; a password counts as a change to its part, with no value.
func TestManagedAPI_ConnectionChangesAreAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	put := func(broker, body string) { e.putConnAs(c, broker, body) }

	put("b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"semp-new-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"vpn-new-pw"}]}}`)
	put("b3", `{"hostname":"h3b","semp":{"scheme":"http","port":"1943","user":"mon","pass":""},"client":{"scheme":"ws","port":"1443","msgVpns":[{"name":"v1","user":"u","pass":""},{"name":"v2","user":"u2","pass":"vpn2-pw"}]}}`)
	put("b3", `{"hostname":"h3b","semp":{"scheme":"http","port":"1943","user":"mon","pass":"semp2-pw"},"client":{"scheme":"ws","port":"1443","msgVpns":[{"name":"v1","user":"u-new","pass":""}]}}`)
	put("b3", `{"semp":{"port":"x"}}`)
	e.delConnAs(c, "b3")
	e.do("DELETE", "/managed/connections/nope?rev=1", "", c)
	e.do("PUT", "/managed/connections/b9", `{}`, e.cookie("viewer", false))

	au.expect(t,
		auditEntry{Actor: "admin", Action: "connection.create", Target: "b3", Outcome: "ok", Wrote: connsWrote(3), Msg: "admin created connection b3"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "ok", Changed: []string{"hostname", "semp", "client", "vpn v2"}, Wrote: connsWrote(4),
			Msg: "admin updated connection b3: hostname, semp, client, vpn v2"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "ok", Changed: []string{"semp", "vpn v1", "vpn v2"}, Wrote: connsWrote(5),
			Msg: "admin updated connection b3: semp, vpn v1, vpn v2"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "refused", Code: "invalid", Msg: "admin could not update connection b3: invalid"},
		auditEntry{Actor: "admin", Action: "connection.delete", Target: "b3", Outcome: "ok", Wrote: connsWrote(6), Msg: "admin deleted connection b3"},
		auditEntry{Actor: "admin", Action: "connection.delete", Target: "nope", Outcome: "refused", Code: "not_found", Msg: "admin could not delete connection nope: not_found"},
		auditEntry{Actor: "viewer", Action: "connection.create", Target: "b9", Outcome: "refused", Code: "forbidden", Msg: "viewer could not create connection b9: forbidden"},
	)
}

// A target is cut to the length of a username key: a path segment is the
// requester's to make long.
func TestManagedAPI_AuditTargetIsCut(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	long := strings.Repeat("a", 200)
	e.do("DELETE", "/managed/users/"+long, "", e.cookie("admin", false))
	got := au.entries(t)
	if len(got) != 1 || got[0].Target != strings.Repeat("a", 64) || strings.Contains(got[0].Msg, long) {
		t.Fatalf("want the target cut to 64 bytes, got %+v", got)
	}
}

// A password, a hash, a store key, a session and a VPN or SEMP credential
// never reach the trail, whichever action handled them.
func TestManagedAPI_AuditNeverHoldsASecret(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{access: true})
	rec := e.form("/login", signInForm("admin", adminPW, "/"), nil)
	expectRedirect(t, rec, "/")
	c := issuedCookie(t, rec)
	expect(t, e.putUserAs(c, "sweep", `{"password":"sweep-user-pw-1"}`), http.StatusOK, "")
	expect(t, e.putConnAs(c, "b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"sweep-semp-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"sweep-vpn-pw"}]}}`), http.StatusOK, "")
	expect(t, e.do("POST", "/managed/dial", dialBody("b1", "v1"), c), http.StatusOK, "")
	exp := e.do("POST", "/managed/backup/export", `{"passphrase":"sweep passphrase one"}`, c)
	expect(t, exp, http.StatusOK, "")

	if n := len(au.entries(t)); n != 5 {
		t.Fatalf("want sign-in, user, connection, dial and export entries, got %d", n)
	}
	data, err := os.ReadFile(au.path)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{
		adminPW, viewerPW, "sweep-user-pw-1", "sweep-semp-pw", "sweep-vpn-pw", "sweep passphrase one",
		"cli-b1v1-pw", "semp-b1-pw", "pbkdf2", testStoreKeyHex, c.Value,
		decodeTo[map[string]string](t, exp.Body.Bytes())["content"],
	} {
		if strings.Contains(string(data), secret) {
			t.Errorf("the audit file holds %q:\n%s", secret, data)
		}
	}
}

// ----- versions: every refusal of 11.1 on users and connections ------------------------

// revCase is one request of a refusal table: what it sends, the status and
// error code it must get, and the current rev a stale answer must carry.
type revCase struct {
	name, method, path, body string
	status                   int
	code                     string
	rev                      int // the rev in the body of a stale answer
}

// runRevCases sends every case as the admin, checks the answer, and then that
// the audit trail holds one refused entry per case under the same code and the
// store did not move.
func runRevCases(t *testing.T, e *managedEnv, au *auditLog, cases []revCase) {
	t.Helper()
	c := e.cookie("admin", false)
	usersSeq, connsSeq := e.api.store.seqs()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := e.do(tc.method, tc.path, tc.body, c)
			expect(t, rec, tc.status, tc.code)
			if tc.rev != 0 {
				if got := errorCode(t, rec).Rev; got != float64(tc.rev) {
					t.Errorf("a stale answer carries the current rev %d, got %v", tc.rev, got)
				}
			}
		})
	}
	if u, cn := e.api.store.seqs(); u != usersSeq || cn != connsSeq {
		t.Errorf("a refusal must not move a seq: users %d->%d, connections %d->%d", usersSeq, u, connsSeq, cn)
	}
	got := au.entries(t)
	if len(got) != len(cases) {
		t.Fatalf("want one audit entry per case, got %d for %d: %+v", len(got), len(cases), got)
	}
	for i, tc := range cases {
		if got[i].Outcome != auditRefused || got[i].Code != tc.code || got[i].Wrote != nil {
			t.Errorf("%s: audit entry %+v, want refused with code %q and nothing written", tc.name, got[i], tc.code)
		}
	}
}

func TestManagedAPI_UserVersionCodes(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	const view = `"readOnly":[]`
	u := "/managed/users/"
	runRevCases(t, e, au, []revCase{
		{"no rev", "PUT", u + "viewer", `{` + view + `}`, 400, "rev_required", 0},
		{"rev as text", "PUT", u + "viewer", `{"rev":"2",` + view + `}`, 400, "rev_required", 0},
		{"rev with a fraction", "PUT", u + "viewer", `{"rev":2.5,` + view + `}`, 400, "rev_required", 0},
		{"negative rev", "PUT", u + "viewer", `{"rev":-1,` + view + `}`, 400, "rev_required", 0},
		{"null rev", "PUT", u + "viewer", `{"rev":null,` + view + `}`, 400, "rev_required", 0},
		{"invalid input comes before the rev", "PUT", u + "a%20b", `{}`, 422, "invalid", 0},
		{"create of a name that exists", "PUT", u + "viewer", `{"rev":0,` + view + `}`, 409, "exists", 0},
		{"update of a user that is gone", "PUT", u + "ghost", `{"rev":4,"password":"ghost-password-1"}`, 404, "not_found", 0},
		{"stale update", "PUT", u + "viewer", `{"rev":1,` + view + `}`, 409, "stale", 2},
		{"stale beats last admin", "PUT", u + "admin", `{"rev":2,"admin":false}`, 409, "stale", 1},
		{"delete without a rev", "DELETE", u + "viewer", "", 400, "rev_required", 0},
		{"delete rev empty", "DELETE", u + "viewer?rev=", "", 400, "rev_required", 0},
		{"delete rev as text", "DELETE", u + "viewer?rev=two", "", 400, "rev_required", 0},
		{"delete rev zero", "DELETE", u + "viewer?rev=0", "", 400, "rev_required", 0},
		{"delete negative rev", "DELETE", u + "viewer?rev=-2", "", 400, "rev_required", 0},
		{"delete rev with a fraction", "DELETE", u + "viewer?rev=2.5", "", 400, "rev_required", 0},
		{"delete of a user that is gone", "DELETE", u + "ghost?rev=4", "", 404, "not_found", 0},
		{"stale delete", "DELETE", u + "viewer?rev=1", "", 409, "stale", 2},
	})
}

func TestManagedAPI_ConnectionVersionCodes(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	const rec = `"hostname":"host1","semp":{"port":"1943","user":"mon","pass":""},"client":{"port":"1443","msgVpns":[]}`
	p := "/managed/connections/"
	runRevCases(t, e, au, []revCase{
		{"no rev", "PUT", p + "b1", `{` + rec + `}`, 400, "rev_required", 0},
		{"rev as text", "PUT", p + "b1", `{"rev":"1",` + rec + `}`, 400, "rev_required", 0},
		{"rev with a fraction", "PUT", p + "b1", `{"rev":1.5,` + rec + `}`, 400, "rev_required", 0},
		{"negative rev", "PUT", p + "b1", `{"rev":-1,` + rec + `}`, 400, "rev_required", 0},
		{"null rev", "PUT", p + "b1", `{"rev":null,` + rec + `}`, 400, "rev_required", 0},
		{"invalid input comes before the rev", "PUT", p + "b1", `{"semp":{"port":"x"}}`, 422, "invalid", 0},
		{"create of a name that exists", "PUT", p + "b1", `{"rev":0,` + rec + `}`, 409, "exists", 0},
		{"update of a connection that is gone", "PUT", p + "b9", `{"rev":4,` + rec + `}`, 404, "not_found", 0},
		{"stale update", "PUT", p + "b2", `{"rev":1,` + rec + `}`, 409, "stale", 2},
		{"delete without a rev", "DELETE", p + "b1", "", 400, "rev_required", 0},
		{"delete rev empty", "DELETE", p + "b1?rev=", "", 400, "rev_required", 0},
		{"delete rev as text", "DELETE", p + "b1?rev=one", "", 400, "rev_required", 0},
		{"delete rev zero", "DELETE", p + "b1?rev=0", "", 400, "rev_required", 0},
		{"delete negative rev", "DELETE", p + "b1?rev=-1", "", 400, "rev_required", 0},
		{"delete of a connection that is gone", "DELETE", p + "b9?rev=4", "", 404, "not_found", 0},
		{"stale delete", "DELETE", p + "b2?rev=1", "", 409, "stale", 2},
	})
}

// A delete that won leaves nothing to save or delete: the loser is told the
// record was deleted, not that it is stale.
func TestManagedAPI_DeletedMeanwhileIsNotFound(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.do("DELETE", "/managed/users/viewer?rev=2", "", c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/users/viewer", `{"rev":2,"readOnly":[]}`, c), http.StatusNotFound, "not_found")
	expect(t, e.do("DELETE", "/managed/users/viewer?rev=2", "", c), http.StatusNotFound, "not_found")
	expect(t, e.do("DELETE", "/managed/connections/b2?rev=2", "", c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/connections/b2", `{"rev":2,"hostname":"host2","semp":{},"client":{}}`, c), http.StatusNotFound, "not_found")
	// A re-created name never reuses a rev: the old one is stale.
	expect(t, e.do("PUT", "/managed/users/viewer", `{"rev":0,"password":"viewer-new-pw-1"}`, c), http.StatusOK, "")
	expect(t, e.do("PUT", "/managed/users/viewer", `{"rev":2,"readOnly":[]}`, c), http.StatusConflict, "stale")
}

// The answer to a save carries the rev the record holds afterwards: the new
// seq of the file when what the console shows changed, the same rev when only
// a password did (the hash is never shown). The list says the same.
func TestManagedAPI_ResponseRevFollowsWhatTheConsoleShows(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	rev := func(rec *httptest.ResponseRecorder) int {
		t.Helper()
		expect(t, rec, http.StatusOK, "")
		return decodeTo[map[string]int](t, rec.Body.Bytes())["rev"]
	}
	same := `"readOnly":[{"brokers":"b1","msgVpns":"v1","queues":"*"}],"modules":["queue-browser"]`
	if got := rev(e.putUserAs(c, "viewer", `{"password":"viewer-new-pw-1",`+same+`}`)); got != 2 {
		t.Errorf("a password alone keeps the rev (2), got %d", got)
	}
	if u, _ := e.api.store.seqs(); u != 3 {
		t.Errorf("the file's seq moves on every commit, want 3, got %d", u)
	}
	if got := rev(e.putUserAs(c, "viewer", `{"readOnly":[],"modules":["queue-browser"]}`)); got != 4 {
		t.Errorf("a change to the grants takes the file's new seq (4), got %d", got)
	}
	if e.userRev("viewer") != 4 || e.userRev("admin") != 1 {
		t.Errorf("revs after the saves: viewer %d, admin %d", e.userRev("viewer"), e.userRev("admin"))
	}

	if got := rev(e.putConnAs(c, "b1", `{"hostname":"host1","semp":{"port":"1943","user":"mon","pass":"semp-new-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u1","pass":""},{"name":"v2","user":"u2","pass":""}]}}`)); got != 1 {
		t.Errorf("a SEMP password alone keeps the rev (1), got %d", got)
	}
	if got := rev(e.putConnAs(c, "b1", `{"hostname":"host1b","semp":{"port":"1943","user":"mon","pass":""},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u1","pass":""},{"name":"v2","user":"u2","pass":""}]}}`)); got != 4 {
		t.Errorf("a changed hostname takes the file's new seq (4), got %d", got)
	}
	list := decodeTo[struct{ Connections []connListJSON }](t, e.do("GET", "/managed/connections", "", c).Body.Bytes())
	if list.Connections[0].Rev != 4 || list.Connections[1].Rev != 2 {
		t.Errorf("the list carries the revs: %+v", list.Connections)
	}
}

// A hand edit of a sealed file is refused on every later save and delete of
// that file, even with the bytes put back (the cause does not go away until a
// restart), before the existence and the rev are looked at. The other file is
// not affected.
func TestManagedAPI_StoreChangedOnDiskIsRefusedUntilRestart(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	orig := mustRead(t, e.f.usersPath)
	if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
		t.Fatal(err)
	}
	expect(t, e.do("PUT", "/managed/users/viewer", `{"rev":1,"readOnly":[]}`, c), http.StatusConflict, "store_changed_on_disk")
	expect(t, e.do("DELETE", "/managed/users/ghost?rev=9", "", c), http.StatusConflict, "store_changed_on_disk")
	if err := os.WriteFile(e.f.usersPath, orig, 0o600); err != nil {
		t.Fatal(err)
	}
	expect(t, e.putUserAs(c, "viewer", `{"readOnly":[]}`), http.StatusConflict, "store_changed_on_disk")
	expect(t, e.putConnAs(c, "b3", `{"hostname":"h3","semp":{},"client":{}}`), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/users", "", c), http.StatusOK, "") // reads come from memory
	for _, en := range au.entries(t)[:3] {
		if en.Outcome != auditRefused || en.Code != "store_changed_on_disk" {
			t.Errorf("a refused entry with the disk code, got %+v", en)
		}
	}
}

// audit.onFailure refuse: the change that meets the failure stands, then every
// user and connection change is 503 audit_unavailable with nothing written
// while sign-ins and reads go on; the refusal's own line, once the log is
// writable, clears the state.
func TestManagedAPI_AuditUnavailableRefusesChanges(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	a, _ := e.withLoudAudit(t)
	c := e.cookie("admin", false)
	_ = a.f.Close() // the audit log is no longer writable

	expect(t, e.putUserAs(c, "bob", `{"password":"bob-password-1"}`), http.StatusOK, "") // meets the failure: stands
	if _, exists := e.api.store.isAdmin("bob"); !exists {
		t.Fatal("the change that met the failure must stand")
	}
	seq, _ := e.api.store.seqs()
	expect(t, e.putUserAs(c, "carol", `{"password":"carol-password-1"}`), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.delUserAs(c, "viewer"), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.putConnAs(c, "b3", `{"hostname":"h3","semp":{},"client":{}}`), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.delConnAs(c, "b2"), http.StatusServiceUnavailable, "audit_unavailable")
	if now, _ := e.api.store.seqs(); now != seq || e.api.store.hasConnection("b3") || !e.api.store.hasConnection("b2") {
		t.Error("a refused change must write nothing")
	}
	expect(t, e.do("GET", "/managed/users", "", c), http.StatusOK, "")
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("sign-ins are never refused")
	}

	a.mu.Lock()
	a.f = nil // the next write reopens the file: space is back
	a.mu.Unlock()
	expect(t, e.putUserAs(c, "carol", `{"password":"carol-password-1"}`), http.StatusServiceUnavailable, "audit_unavailable") // its refusal line is written and clears the state
	expect(t, e.putUserAs(c, "carol", `{"password":"carol-password-1"}`), http.StatusOK, "")
}

// ----- the caller is checked again inside the lock -------------------------------------

// holdWriter takes the writer's lock for the test and returns the func that
// gives it back, so a request can be parked at the lock.
func holdWriter(t *testing.T, w *writer) (release func()) {
	t.Helper()
	started, stop, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		done <- w.Do(context.Background(), func(*txn) error {
			close(started)
			<-stop
			return nil
		})
	}()
	<-started
	return func() {
		close(stop)
		if err := <-done; err != nil {
			t.Errorf("the held transaction: %v", err)
		}
	}
}

// waitForWaiters returns once n goroutines are waiting for the writer's lock
// beside the one that holds it: each is a goroutine inside writer.Do, found
// from the goroutine dump, because nothing else says a request has got that
// far.
func waitForWaiters(t *testing.T, n int) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		buf := make([]byte, 1<<20)
		if strings.Count(string(buf[:runtime.Stack(buf, true)]), ".(*writer).Do(") >= n+1 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("%d request(s) never reached the writer's lock", n)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// changeUsersBehindTheWriter stands in for a commit that lands while the lock
// is held: it swaps memory for the users edit makes of the current list.
func changeUsersBehindTheWriter(s *store, edit func([]userRec) []userRec) {
	cur, seq := s.usersNow()
	s.publish(&usersDoc{Seq: seq + 1, Users: edit(cur)}, nil)
}

// An administrator who is demoted, or removed, while the request waits for the
// lock is refused as the admin gate would have refused it, on every route that
// changes a user or a connection, and nothing is written.
func TestManagedAPI_CallerIsCheckedAgainInsideTheLock(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, body string
		audited                  string // the action of the refused entry
	}{
		{"user save", "PUT", "/managed/users/bob", `{"rev":0,"password":"bob-password-1"}`, "user.create"},
		{"user delete", "DELETE", "/managed/users/viewer?rev=2", "", "user.delete"},
		{"connection save", "PUT", "/managed/connections/b3", `{"rev":0,"hostname":"h3","semp":{},"client":{}}`, "connection.create"},
		{"connection delete", "DELETE", "/managed/connections/b2?rev=2", "", "connection.delete"},
	} {
		for _, gone := range []bool{false, true} {
			name := tc.name + " by an admin demoted meanwhile"
			status, code := http.StatusForbidden, "forbidden"
			if gone {
				name, status, code = tc.name+" by an admin removed meanwhile", http.StatusUnauthorized, "unauthenticated"
			}
			t.Run(name, func(t *testing.T) {
				e := newManagedEnv(t, nil)
				au := e.withAudit(t, auditSettings{})
				putUser(t, e.api.store, userRec{Username: "boss", Admin: true}, "boss-password-1")
				caller := e.cookie("boss", false)
				seq, _ := e.api.store.seqs()
				release := holdWriter(t, e.api.store.wr)
				done := make(chan *httptest.ResponseRecorder)
				go func() { done <- e.do(tc.method, tc.path, tc.body, caller) }()
				waitForWaiters(t, 1)
				changeUsersBehindTheWriter(e.api.store, func(users []userRec) []userRec {
					i := slices.IndexFunc(users, func(u userRec) bool { return u.Username == "boss" })
					if gone {
						return slices.Delete(slices.Clone(users), i, i+1)
					}
					next := slices.Clone(users)
					next[i].Admin = false
					return next
				})
				release()
				expect(t, <-done, status, code)
				if _, now := e.api.store.usersNow(); now != seq+1 || e.api.store.hasConnection("b3") || !e.api.store.hasConnection("b2") {
					t.Error("a refused change must write nothing")
				}
				if _, exists := e.api.store.isAdmin("bob"); exists {
					t.Error("the refused save must not create the user")
				}
				entries := au.entries(t)
				if len(entries) != 1 || entries[0].Actor != "boss" || entries[0].Action != tc.audited || entries[0].Outcome != auditRefused || entries[0].Code != code {
					t.Errorf("want one refused entry for boss under %s with code %s, got %+v", tc.audited, code, entries)
				}
			})
		}
	}
}

// The settings save and the import take the lock through their own handlers
// and re-check the caller there too: an administrator demoted while the
// request waited is refused, and nothing is written.
func TestManagedAPI_SettingsAndImportCheckTheCallerAgainInsideTheLock(t *testing.T) {
	for _, tc := range []struct {
		name, method, path string
		body               func(t *testing.T, e *managedEnv) string
		audited            string // the action of the refused entry
	}{
		{"settings save", "PUT", "/managed/settings", func(t *testing.T, e *managedEnv) string {
			return withSettingsRev(t, `{"logLevel":"debug"}`, e.settings(t).Rev)
		}, auditSettingsUpdate},
		{"import", "POST", "/managed/backup/import", func(t *testing.T, e *managedEnv) string {
			return jsonBody(t, map[string]any{
				"file": e.exported(t, nil), "passphrase": testPassphrase, "basis": e.api.currentBasis(),
				"users": importMerge, "connections": importMerge, "settings": importReplace,
			})
		}, auditBackupImport},
	} {
		t.Run(tc.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			au := e.withAudit(t, auditSettings{})
			putUser(t, e.api.store, userRec{Username: "boss", Admin: true}, "boss-password-1")
			caller := e.cookie("boss", false)
			body := tc.body(t, e)
			rev := e.settings(t).Rev
			users, conns := e.api.store.seqs()
			release := holdWriter(t, e.api.store.wr)
			done := make(chan *httptest.ResponseRecorder)
			go func() { done <- e.do(tc.method, tc.path, body, caller) }()
			waitForWaiters(t, 1)
			changeUsersBehindTheWriter(e.api.store, func(list []userRec) []userRec {
				next := slices.Clone(list)
				next[slices.IndexFunc(next, func(u userRec) bool { return u.Username == "boss" })].Admin = false
				return next
			})
			release()
			expect(t, <-done, http.StatusForbidden, "forbidden")
			if nowUsers, nowConns := e.api.store.seqs(); nowUsers != users+1 || nowConns != conns || e.settings(t).Rev != rev {
				t.Error("a refused change must write nothing")
			}
			entries := au.entries(t)
			if len(entries) != 1 || entries[0].Actor != "boss" || entries[0].Action != tc.audited || entries[0].Outcome != auditRefused || entries[0].Code != "forbidden" {
				t.Errorf("want one refused entry for boss under %s with code forbidden, got %+v", tc.audited, entries)
			}
		})
	}
}

// A password that cannot be hashed, here because the client leaves while every
// hashing slot is busy, is a 500 server_error: nothing is written, and the
// cause goes to the log, not into the answer.
func TestManagedAPI_APasswordThatCannotBeHashedIsAServerError(t *testing.T) {
	e := newManagedEnv(t, nil)
	h := e.api.store.hasher
	for range cap(h.slots) {
		h.slots <- struct{}{}
	}
	req := httptest.NewRequest("PUT", "https://gw.example/managed/users/bob", strings.NewReader(`{"rev":0,"password":"bob-password-1"}`))
	req.AddCookie(e.cookie("admin", false))
	ctx, cancel := context.WithCancel(req.Context())
	cancel()
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req.WithContext(ctx))
	expect(t, rec, http.StatusInternalServerError, "server_error")
	if _, exists := e.api.store.isAdmin("bob"); exists || strings.Contains(rec.Body.String(), "canceled") {
		t.Errorf("nothing may be written and the cause stays out of the answer: %s", rec.Body.String())
	}
	if line := logLine(e.log.String(), `msg="admin request failed"`); !strings.Contains(line, "op=saveUser") || !strings.Contains(line, "context canceled") {
		t.Errorf("the failure must be logged with its operation and cause: %s", e.log.String())
	}
}

// An error the settings transaction does not know is a 500 server_error too:
// the cause is logged and stays out of the answer.
func TestManagedAPI_AnUnknownSettingsFailureIsAServerError(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := httptest.NewRecorder()
	e.api.settingsFailed(rec, httptest.NewRequest("PUT", "https://gw.example/managed/settings", nil), fmt.Errorf("the disk is on fire"))
	expect(t, rec, http.StatusInternalServerError, "server_error")
	if strings.Contains(rec.Body.String(), "fire") || !strings.Contains(e.log.String(), "the disk is on fire") {
		t.Errorf("the cause belongs in the log, not in the answer: %s", rec.Body.String())
	}
}

// A client that leaves while its request waits for the lock changes nothing
// and writes no audit line: nobody reads the answer (499).
func TestManagedAPI_ClientGoneWhileWaitingChangesNothing(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	seq, _ := e.api.store.seqs()
	release := holdWriter(t, e.api.store.wr)
	req := httptest.NewRequest("PUT", "https://gw.example/managed/users/bob", strings.NewReader(`{"rev":0,"password":"bob-password-1"}`))
	req.AddCookie(e.cookie("admin", false))
	ctx, cancel := context.WithCancel(req.Context())
	done := make(chan *httptest.ResponseRecorder)
	go func() {
		rec := httptest.NewRecorder()
		e.root.ServeHTTP(rec, req.WithContext(ctx))
		done <- rec
	}()
	waitForWaiters(t, 1)
	cancel()
	rec := <-done
	release()
	if rec.Code != statusClientGone {
		t.Errorf("want 499, got %d %s", rec.Code, rec.Body.String())
	}
	if now, _ := e.api.store.seqs(); now != seq {
		t.Error("nothing may change for a client that is gone")
	}
	if got := au.entries(t); len(got) != 0 {
		t.Errorf("nothing happened, so nothing is audited: %+v", got)
	}
}

// The ok audit line of a change is written inside its transaction, so the
// lines follow the order of the commits: for changes that raced, the seq each
// line carries only goes up.
func TestManagedAPI_AuditLinesFollowTheOrderOfTheCommits(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	var reqs []func() *httptest.ResponseRecorder
	for i := range 8 {
		name := fmt.Sprintf("racer%d", i)
		reqs = append(reqs, func() *httptest.ResponseRecorder { return e.putUserAs(c, name, `{"password":"a-password-12"}`) })
	}
	for _, rec := range raced(t, reqs...) {
		expect(t, rec, http.StatusOK, "")
	}
	entries := au.entries(t)
	if len(entries) != len(reqs) {
		t.Fatalf("want one entry per change, got %d", len(entries))
	}
	last := int64(0)
	for _, en := range entries {
		if en.Action != "user.create" || len(en.Wrote) != 1 || en.Wrote[0].Seq <= last {
			t.Fatalf("the entries must be in commit order, each seq above the one before: %+v", entries)
		}
		last = en.Wrote[0].Seq
	}
}

// audit.onFailure refuse holds for a change that was already waiting for the
// lock: the record is lost inside the first change's transaction, so the one
// behind it meets the gate with the failure known and is refused.
func TestManagedAPI_AuditRefuseStopsAChangeAlreadyWaiting(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	a, _ := e.withLoudAudit(t)
	c := e.cookie("admin", false)
	_ = a.f.Close() // the audit log is no longer writable
	release := holdWriter(t, e.api.store.wr)
	done := make(chan *httptest.ResponseRecorder, 2)
	go func() { done <- e.putUserAs(c, "bob", `{"password":"bob-password-1"}`) }()
	go func() { done <- e.putConnAs(c, "b3", `{"hostname":"h3","semp":{},"client":{}}`) }()
	waitForWaiters(t, 2)
	release()
	codes := []int{(<-done).Code, (<-done).Code}
	slices.Sort(codes)
	if !slices.Equal(codes, []int{http.StatusOK, http.StatusServiceUnavailable}) {
		t.Fatalf("the change that met the failure stands and the one waiting behind it is refused, got %v", codes)
	}
	_, bob := e.api.store.isAdmin("bob")
	if bob == e.api.store.hasConnection("b3") {
		t.Error("exactly one of the two changes may be written")
	}
}

// ----- races -------------------------------------------------------------------------------

// raced runs every request at once, each as soon as the others are ready, and
// returns their answers in the order given.
func raced(t *testing.T, reqs ...func() *httptest.ResponseRecorder) []*httptest.ResponseRecorder {
	t.Helper()
	out := make([]*httptest.ResponseRecorder, len(reqs))
	var ready, wg sync.WaitGroup
	start := make(chan struct{})
	ready.Add(len(reqs))
	wg.Add(len(reqs))
	for i, rq := range reqs {
		go func() {
			defer wg.Done()
			ready.Done()
			<-start
			out[i] = rq()
		}()
	}
	ready.Wait()
	close(start)
	wg.Wait()
	return out
}

func statusesOf(recs []*httptest.ResponseRecorder) []int {
	out := make([]int, len(recs))
	for i, r := range recs {
		out[i] = r.Code
	}
	slices.Sort(out)
	return out
}

// Two saves of one record at one rev: exactly one wins, the other is stale.
func TestManagedAPI_TwoSavesOfOneRecordOneWins(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/viewer", `{"rev":2,"readOnly":[]}`, c)
		},
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/viewer", `{"rev":2,"modules":[]}`, c)
		},
	)
	if got := statusesOf(recs); !reflect.DeepEqual(got, []int{200, 409}) {
		t.Fatalf("want one 200 and one 409, got %v", got)
	}
	for _, r := range recs {
		if r.Code == http.StatusConflict {
			expect(t, r, http.StatusConflict, "stale")
		}
	}
	if u, _ := e.api.store.seqs(); u != 3 {
		t.Errorf("one commit: want seq 3, got %d", u)
	}
}

// Two creates of one name: one wins, the other is told it exists.
func TestManagedAPI_TwoCreatesOfOneNameOneWins(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/bob", `{"rev":0,"password":"bob-password-1"}`, c)
		},
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/bob", `{"rev":0,"password":"bob-password-2"}`, c)
		},
	)
	if got := statusesOf(recs); !reflect.DeepEqual(got, []int{200, 409}) {
		t.Fatalf("want one 200 and one 409, got %v", got)
	}
	for _, r := range recs {
		if r.Code == http.StatusConflict {
			expect(t, r, http.StatusConflict, "exists")
		}
	}
}

// Saves of different records of one file all land: each is stale only against
// its own record.
func TestManagedAPI_SavesOfDifferentRecordsBothLand(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/connections/b1", `{"rev":1,"hostname":"host1b","semp":{"port":"1943","user":"mon"},"client":{"port":"1443"}}`, c)
		},
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/connections/b2", `{"rev":2,"hostname":"host2b","semp":{"port":"1943","user":"mon"},"client":{"port":"1443"}}`, c)
		},
	)
	if got := statusesOf(recs); !reflect.DeepEqual(got, []int{200, 200}) {
		t.Fatalf("want two 200, got %v", got)
	}
	if currentConn(t, e.api.store, "b1").Hostname != "host1b" || currentConn(t, e.api.store, "b2").Hostname != "host2b" {
		t.Error("both saves must stand")
	}
}

// A delete and a save of one record at one rev: whichever commits first wins,
// and the other finds the record gone (404) or changed (409 stale).
func TestManagedAPI_DeleteRacingASave(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder { return e.do("DELETE", "/managed/users/viewer?rev=2", "", c) },
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/viewer", `{"rev":2,"readOnly":[]}`, c)
		},
	)
	del, save := recs[0], recs[1]
	switch {
	case del.Code == http.StatusNoContent:
		expect(t, save, http.StatusNotFound, "not_found")
	case save.Code == http.StatusOK:
		expect(t, del, http.StatusConflict, "stale")
	default:
		t.Fatalf("one of the two must win, got delete %d and save %d", del.Code, save.Code)
	}
}

// Two administrators demoting each other at once: whichever commits first
// wins, and the other is no longer an administrator when it gets the lock (403),
// or no longer has a session at all when its request starts after the first
// commit ended it (401), so someone is always left.
func TestManagedAPI_TwoAdminsDemotingEachOther(t *testing.T) {
	e := newManagedEnv(t, nil)
	putUser(t, e.api.store, userRec{Username: "boss", Admin: true}, "boss-password-1")
	admin, boss := e.cookie("admin", false), e.cookie("boss", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/boss", withRev(`{"admin":false}`, e.userRev("boss")), admin)
		},
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/admin", withRev(`{"admin":false}`, e.userRev("admin")), boss)
		},
	)
	got := statusesOf(recs)
	if got[0] != http.StatusOK || (got[1] != http.StatusForbidden && got[1] != http.StatusUnauthorized) {
		t.Fatalf("want one 200 and one 401 or 403, got %v", got)
	}
	if n := countAdmins(e.api.store.listUsers()); n != 1 {
		t.Errorf("exactly one administrator must be left, got %d", n)
	}
}

// Two administrators each demoting themselves at once: the second still is an
// administrator when it gets the lock, and the last-admin rule stops it.
func TestManagedAPI_TwoAdminsDemotingThemselves(t *testing.T) {
	e := newManagedEnv(t, nil)
	putUser(t, e.api.store, userRec{Username: "boss", Admin: true}, "boss-password-1")
	admin, boss := e.cookie("admin", false), e.cookie("boss", false)
	recs := raced(t,
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/admin", withRev(`{"admin":false}`, e.userRev("admin")), admin)
		},
		func() *httptest.ResponseRecorder {
			return e.do("PUT", "/managed/users/boss", withRev(`{"admin":false}`, e.userRev("boss")), boss)
		},
	)
	if got := statusesOf(recs); !reflect.DeepEqual(got, []int{200, 409}) {
		t.Fatalf("want one 200 and one 409, got %v", got)
	}
	for _, r := range recs {
		if r.Code == http.StatusConflict {
			expect(t, r, http.StatusConflict, "last_admin")
		}
	}
	if n := countAdmins(e.api.store.listUsers()); n != 1 {
		t.Errorf("exactly one administrator must be left, got %d", n)
	}
}

// A user changing their own password while an administrator saves the same
// user: both land, whichever goes first. The password does not move the rev,
// and the save with no password keeps the hash the user set.
func TestManagedAPI_OwnPasswordRacingAnAdminSave(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin, viewer := e.cookie("admin", false), e.cookie("viewer", false)
	var page *httptest.ResponseRecorder
	var save *httptest.ResponseRecorder
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		page = e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), viewer)
	}()
	go func() {
		defer wg.Done()
		save = e.do("PUT", "/managed/users/viewer", `{"rev":2,"readOnly":[],"modules":["queue-browser"]}`, admin)
	}()
	wg.Wait()
	expectRedirect(t, page, "/")
	expect(t, save, http.StatusOK, "")
	if !signsIn(t, e.api.store, "viewer", "viewer-new-pw-1") || signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("the admin's save must keep the password the user set")
	}
	if got, _ := userNamed(e.api.store.listUsers(), "viewer"); len(got.ReadOnly) != 0 {
		t.Errorf("the admin's save must stand: %+v", got)
	}
}

// ----- two-factor sign-in in the API ---------------------------------------------------

// The user list says who has two-factor on and never what it holds, and /me
// carries the setting and whether the signed-in user has set it up, in every
// mode, so the apps can offer the setup link only when it is in use.
func TestManagedAPI_ListAndMeCarryTwoFactor(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin, viewer := e.cookie("admin", false), e.cookie("viewer", false)
	meOf := func(c *http.Cookie) (string, twoFactorJSON) {
		t.Helper()
		rec := e.do("GET", "/managed/me", "", c)
		expect(t, rec, http.StatusOK, "")
		var out struct {
			Username  string
			TwoFactor twoFactorJSON
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return rec.Body.String(), out.TwoFactor
	}
	for _, mode := range []string{twoFactorOptional, twoFactorAdmins, twoFactorMandatory} {
		next := e.cfg
		next.twoFactor = mode
		e.live.apply(next)
		if _, got := meOf(viewer); got != (twoFactorJSON{Mode: mode, Enrolled: false}) {
			t.Errorf("mode %s, nobody enrolled: got %+v", mode, got)
		}
	}
	// A config without the key reads as optional.
	next := e.cfg
	next.twoFactor = ""
	e.live.apply(next)
	if _, got := meOf(viewer); got.Mode != twoFactorOptional {
		t.Errorf("an unset mode is optional, got %+v", got)
	}

	enrolViewer(t, e.api.store, storeTOTPSecret)
	body, got := meOf(viewer)
	if got != (twoFactorJSON{Mode: twoFactorOptional, Enrolled: true}) || !strings.Contains(body, `"twoFactor":{"mode":"optional","enrolled":true}`) {
		t.Errorf("an enrolled viewer: %s", body)
	}
	if _, got := meOf(admin); got.Enrolled {
		t.Error("the admin has not set two-factor up")
	}

	rec := e.do("GET", "/managed/users", "", admin)
	expect(t, rec, http.StatusOK, "")
	var out struct{ Users []userListJSON }
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || len(out.Users) != 2 {
		t.Fatalf("users: %v %s", err, rec.Body.String())
	}
	if out.Users[0].TwoFactor || !out.Users[1].TwoFactor {
		t.Errorf("want admin off and viewer on, got %v and %v", out.Users[0].TwoFactor, out.Users[1].TwoFactor)
	}
	if !strings.Contains(rec.Body.String(), `"twoFactor":true`) || !strings.Contains(rec.Body.String(), `"twoFactor":false`) {
		t.Errorf("every row names the flag: %s", rec.Body.String())
	}
	for _, leak := range []string{storeTOTPSecret, "totp", "recovery"} {
		if strings.Contains(rec.Body.String(), leak) {
			t.Errorf("the list must not carry %q: %s", leak, rec.Body.String())
		}
	}
}

// An administrator's reset: an unknown user is not found; a user without
// two-factor is 200 with the rev as it was, nothing written, and an ok line
// without "wrote"; an enrolled user loses it, the rev and seq move, their
// sessions and sign-in tickets end and the ok line carries the commit's seq,
// written inside the transaction.
func TestManagedAPI_ResetTwoFactor(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	admin := e.cookie("admin", false)
	viewer := e.cookie("viewer", false)
	reset := func(user string) *httptest.ResponseRecorder {
		return e.do("DELETE", "/managed/users/"+user+"/totp", "", admin)
	}
	revOf := func(rec *httptest.ResponseRecorder) int {
		t.Helper()
		return decodeTo[map[string]int](t, rec.Body.Bytes())["rev"]
	}

	expect(t, reset("ghost"), http.StatusNotFound, "not_found")

	seq, _ := e.api.store.seqs()
	tk := e.api.sessions.tickets.create(ticket{user: "viewer", stage: stageCode})
	rec := reset("viewer")
	expect(t, rec, http.StatusOK, "")
	if got := revOf(rec); got != 2 || e.userRev("viewer") != 2 {
		t.Errorf("nothing to remove: the rev stays 2, got %d", got)
	}
	if now, _ := e.api.store.seqs(); now != seq {
		t.Errorf("nothing to remove writes nothing: seq %d -> %d", seq, now)
	}
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "")
	if _, ok := e.api.sessions.tickets.lookup(tk); !ok {
		t.Error("nothing was removed: the user's sessions and tickets stand")
	}

	enrolViewer(t, e.api.store, storeTOTPSecret)
	now := time.Now()
	code, err := totpCode(storeTOTPSecret, totpStepAt(now))
	if err != nil {
		t.Fatal(err)
	}
	if !e.api.totp.check("viewer", storeTOTPSecret, code, now) {
		t.Fatal("the code opens the replay guard's record")
	}
	rec = reset("viewer")
	expect(t, rec, http.StatusOK, "")
	if got := revOf(rec); got != 4 || e.userRev("viewer") != 4 {
		t.Errorf("a reset moves the rev to the commit's seq (4), got %d", got)
	}
	if on, exists := e.api.store.twoFactorOf("viewer"); on || !exists {
		t.Errorf("two-factor is gone and the user stays: on %v exists %v", on, exists)
	}
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")
	if _, ok := e.api.sessions.tickets.lookup(tk); ok {
		t.Error("the user's tickets end with their sessions")
	}
	enrolViewer(t, e.api.store, storeTOTPSecret)
	if !e.api.totp.check("viewer", storeTOTPSecret, code, now) {
		t.Error("a reset forgets the replay record, so a new setup is not held to the old steps")
	}

	au.expect(t,
		auditEntry{Actor: "admin", Action: "user.twofactor.reset", Target: "ghost", Outcome: "refused", Code: "not_found",
			Msg: "admin could not reset two-factor sign-in for ghost: not_found"},
		auditEntry{Actor: "admin", Action: "user.twofactor.reset", Target: "viewer", Outcome: "ok",
			Msg: "admin reset two-factor sign-in for viewer"},
		auditEntry{Actor: "admin", Action: "user.twofactor.reset", Target: "viewer", Outcome: "ok", Wrote: usersWrote(4),
			Msg: "admin reset two-factor sign-in for viewer"},
	)
}

// Every refusal a write has, on the reset route: the admin gate (a user cannot
// remove their own two-factor), the caller re-check in the lock, a store file
// that changed on disk, a failed write and an unavailable audit trail. Each is
// audited as refused, and the user keeps two-factor.
func TestManagedAPI_ResetTwoFactorRefusals(t *testing.T) {
	enrolled := func(e *managedEnv) bool {
		on, _ := e.api.store.twoFactorOf("viewer")
		return on
	}
	const path = "/managed/users/viewer/totp"
	refused := func(t *testing.T, au *auditLog, code string) {
		t.Helper()
		got := au.entries(t)
		if len(got) != 1 || got[0].Action != "user.twofactor.reset" || got[0].Outcome != auditRefused || got[0].Code != code || got[0].Wrote != nil {
			t.Errorf("want one refused entry with code %s and no wrote, got %+v", code, got)
		}
	}

	t.Run("not an administrator", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		au := e.withAudit(t, auditSettings{})
		enrolViewer(t, e.api.store, storeTOTPSecret)
		expect(t, e.do("DELETE", path, "", e.cookie("viewer", false)), http.StatusForbidden, "forbidden")
		if !enrolled(e) {
			t.Error("a refused reset must leave two-factor on")
		}
		refused(t, au, "forbidden")
	})

	for _, gone := range []bool{false, true} {
		name, status, code := "the caller demoted meanwhile", http.StatusForbidden, "forbidden"
		if gone {
			name, status, code = "the caller removed meanwhile", http.StatusUnauthorized, "unauthenticated"
		}
		t.Run(name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			au := e.withAudit(t, auditSettings{})
			putUser(t, e.api.store, userRec{Username: "boss", Admin: true}, "boss-password-1")
			enrolViewer(t, e.api.store, storeTOTPSecret)
			caller := e.cookie("boss", false)
			seq, _ := e.api.store.seqs()
			release := holdWriter(t, e.api.store.wr)
			done := make(chan *httptest.ResponseRecorder)
			go func() { done <- e.do("DELETE", path, "", caller) }()
			waitForWaiters(t, 1)
			changeUsersBehindTheWriter(e.api.store, func(users []userRec) []userRec {
				i := slices.IndexFunc(users, func(u userRec) bool { return u.Username == "boss" })
				if gone {
					return slices.Delete(slices.Clone(users), i, i+1)
				}
				next := slices.Clone(users)
				next[i].Admin = false
				return next
			})
			release()
			expect(t, <-done, status, code)
			if _, now := e.api.store.usersNow(); now != seq+1 || !enrolled(e) {
				t.Error("a refused reset must write nothing")
			}
			refused(t, au, code)
		})
	}

	t.Run("store changed on disk", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		au := e.withAudit(t, auditSettings{})
		enrolViewer(t, e.api.store, storeTOTPSecret)
		if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
			t.Fatal(err)
		}
		expect(t, e.do("DELETE", path, "", e.cookie("admin", false)), http.StatusConflict, "store_changed_on_disk")
		if !enrolled(e) {
			t.Error("a refused reset must leave two-factor on")
		}
		refused(t, au, "store_changed_on_disk")
	})

	t.Run("a failed write", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		au := e.withAudit(t, auditSettings{})
		enrolViewer(t, e.api.store, storeTOTPSecret)
		viewer := e.cookie("viewer", false)
		blockWrites(t, &e.api.store.usersPath)
		expect(t, e.do("DELETE", path, "", e.cookie("admin", false)), http.StatusInternalServerError, "store_write_failed")
		if !enrolled(e) {
			t.Error("a failed write must leave two-factor on")
		}
		expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "") // nothing was removed: the session stands
		for _, want := range []string{"admin request failed", "op=resetTwoFactor", "target=viewer", "user=admin"} {
			if !strings.Contains(e.log.String(), want) {
				t.Errorf("the failure must name %q in the log: %s", want, e.log.String())
			}
		}
		refused(t, au, "store_write_failed")
	})

	t.Run("audit unavailable", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
		a, _ := e.withLoudAudit(t)
		enrolViewer(t, e.api.store, storeTOTPSecret)
		admin := e.cookie("admin", false)
		_ = a.f.Close()                                                                          // the audit log is no longer writable
		expect(t, e.putUserAs(admin, "bob", `{"password":"bob-password-1"}`), http.StatusOK, "") // meets the failure: stands
		seq, _ := e.api.store.seqs()
		expect(t, e.do("DELETE", path, "", admin), http.StatusServiceUnavailable, "audit_unavailable")
		if now, _ := e.api.store.seqs(); now != seq || !enrolled(e) {
			t.Error("a refused reset must write nothing")
		}
	})
}

// A reset whose commit loses its audit line under audit.onFailure refuse
// stands, as every change does, and the very next change is refused: the line
// is written inside the transaction, so the gate is closed by the time the
// lock is given back.
func TestManagedAPI_ResetTwoFactorStopsTheNextChangeWhenItsAuditLineIsLost(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	a, _ := e.withLoudAudit(t)
	enrolViewer(t, e.api.store, storeTOTPSecret)
	admin := e.cookie("admin", false)
	_ = a.f.Close()
	expect(t, e.do("DELETE", "/managed/users/viewer/totp", "", admin), http.StatusOK, "")
	if on, _ := e.api.store.twoFactorOf("viewer"); on {
		t.Error("the reset that met the failure stands")
	}
	expect(t, e.putUserAs(admin, "bob", `{"password":"bob-password-1"}`), http.StatusServiceUnavailable, "audit_unavailable")
}

// An administrator's PUT never carries or clears two-factor: the body field is
// unknown (400), two-factor stays as it was, and a plain edit of the same user
// keeps it.
func TestManagedAPI_SaveUserCannotCarryTwoFactor(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin := e.cookie("admin", false)
	enrolViewer(t, e.api.store, storeTOTPSecret)
	seq, _ := e.api.store.seqs()
	for _, body := range []string{
		`{"twoFactor":false}`,
		`{"twoFactor":true,"readOnly":[]}`,
		`{"totp":{"secret":"` + storeTOTPSecret2 + `","recovery":[]}}`,
	} {
		expect(t, e.putUserAs(admin, "viewer", body), http.StatusBadRequest, "bad_request")
	}
	if now, _ := e.api.store.seqs(); now != seq {
		t.Errorf("a refused body writes nothing: seq %d -> %d", seq, now)
	}
	if secret, ok := e.api.store.totpSecret("viewer"); !ok || secret != storeTOTPSecret {
		t.Error("two-factor must be as it was")
	}
	expect(t, e.putUserAs(admin, "viewer", `{"readOnly":[]}`), http.StatusOK, "")
	if secret, ok := e.api.store.totpSecret("viewer"); !ok || secret != storeTOTPSecret {
		t.Error("an edit of the user keeps their two-factor")
	}
}

// login.passwordMinLength is read at each save: creating a user and resetting a
// user's password are both refused below the live minimum, the message names
// it, and nothing is written. A password stored before a raise keeps working.
func TestManagedAPI_SaveUser_PasswordMinimumFollowsTheLiveSetting(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login.passwordMinLength = 16 })
	admin := e.cookie("admin", false)
	setMin := func(n int) {
		next := e.cfg
		next.login.passwordMinLength = n
		e.live.apply(next)
	}
	refused := func(rec *httptest.ResponseRecorder, least int) {
		t.Helper()
		expect(t, rec, http.StatusUnprocessableEntity, "invalid")
		got := errorCode(t, rec)
		if want := fmt.Sprintf("Password must be %d to 128 characters.", least); got.Field != "password" || got.Reason != want {
			t.Errorf("want field password with %q, got %+v", want, got)
		}
	}
	const fifteen, sixteen, twelve = "fifteen-chars-p", "sixteen-chars-pw", "twelve-chars"

	refused(e.putUserAs(admin, "carol", `{"password":"`+fifteen+`"}`), 16)
	if _, exists := e.api.store.isAdmin("carol"); exists {
		t.Error("a refused create must not create the user")
	}
	expect(t, e.putUserAs(admin, "carol", `{"password":"`+sixteen+`"}`), http.StatusOK, "")

	refused(e.putUserAs(admin, "viewer", `{"password":"`+fifteen+`"}`), 16)
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("a refused reset must leave the password")
	}
	expect(t, e.putUserAs(admin, "viewer", `{"password":"`+sixteen+`"}`), http.StatusOK, "")

	setMin(20) // applies at the next save, no restart
	refused(e.putUserAs(admin, "dave", `{"password":"`+sixteen+`"}`), 20)
	if !signsIn(t, e.api.store, "viewer", sixteen) {
		t.Error("a password stored under the old minimum keeps working")
	}

	setMin(passwordMinLen)
	expect(t, e.putUserAs(admin, "dave", `{"password":"`+twelve+`"}`), http.StatusOK, "")
	// A save that sends no password changes none, whatever the minimum.
	setMin(30)
	expect(t, e.putUserAs(admin, "dave", `{"admin":false}`), http.StatusOK, "")
}
