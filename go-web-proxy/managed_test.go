package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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
	cfgPath string // config.yaml, seeded from cfg
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
	sum, err := seedConfigFile(cfgPath, cfg)
	if err != nil {
		t.Fatal(err)
	}
	lv := newLive(cfg)
	logger := newCapturingLogger(log)
	routes, err := buildManagedRoutes(cfg, lv, configSource{path: cfgPath, sum: sum}, f.h, noEnv, clock.now, upstream, logger)
	if err != nil {
		t.Fatalf("buildManagedRoutes: %v", err)
	}
	// The chain serve() builds, minus the access log: the client list
	// applies, so a saved allow list is enforced on the next request.
	root := withClient(lv, clientACL(lv, newRootHandler(named("hosted"), named("admin"), named("app"), named("relay"), routes), logger))
	return &managedEnv{
		f: f, clock: clock, log: log, cfg: cfg, live: lv, cfgPath: cfgPath, routes: routes,
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
	expect(t, e.do("DELETE", "/managed/users/viewer", "", c, "Sec-Fetch-Site", "cross-site"), http.StatusForbidden, "cross_origin")
	expect(t, e.do("POST", "/managed/logout", "", c, "Origin", "https://evil.example"), http.StatusForbidden, "cross_origin")
	expect(t, e.do("GET", "/managed/me", "", c, "Sec-Fetch-Site", "cross-site"), http.StatusOK, "")
	expect(t, e.do("DELETE", "/managed/users/viewer", "", c, "Sec-Fetch-Site", "same-origin"), http.StatusNoContent, "")
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
		Users   []userJSON
		Modules modulesJSON
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || len(out.Users) != 2 {
		t.Fatalf("users: %v %s", err, body)
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

	expect(t, put("bob", `{"password":"bob-password-1","admin":false,"operate":[],"readOnly":[{"brokers":"b1","msgVpns":"*","queues":"*"}]}`), http.StatusNoContent, "")
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
		{"new without password", "carol", `{}`, 422, "invalid", "password"},
		{"unknown field", "carol", `{"password":"long-enough-pw","role":"x"}`, 400, "bad_request", ""},
		{"trailing data", "carol", `{"password":"long-enough-pw"} {}`, 400, "bad_request", ""},
		{"malformed", "carol", `{`, 400, "bad_request", ""},
		{"too large", "carol", `{"password":"` + strings.Repeat("x", maxBodyBytes) + `"}`, 413, "too_large", ""},
		{"too large after the value", "carol", `{"password":"long-enough-pw"}` + strings.Repeat(" ", maxBodyBytes), 413, "too_large", ""},
		{"last admin", "admin", `{"admin":false}`, 409, "last_admin", ""},
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
	expect(t, e.do("PUT", "/managed/users/viewer", `{"modules":["queue-copy"]}`, admin), http.StatusNoContent, "")
	if got := modules(); !reflect.DeepEqual(got, []string{"queue-copy"}) {
		t.Errorf("own list: got %v", got)
	}
	expect(t, e.do("PUT", "/managed/users/viewer", `{"modules":null}`, admin), http.StatusNoContent, "")
	if got := modules(); !reflect.DeepEqual(got, moduleCatalog()) {
		t.Errorf("null: want the deployment default (every module), got %v", got)
	}
	expect(t, e.do("PUT", "/managed/users/viewer", `{"modules":[]}`, admin), http.StatusNoContent, "")
	if got := modules(); len(got) != 0 {
		t.Errorf("empty list: want none, got %v", got)
	}
}

func TestManagedAPI_SaveUser_SessionsEndOnPasswordOrRoleChange(t *testing.T) {
	e := newManagedEnv(t, nil)
	admin := e.cookie("admin", false)
	viewer := e.cookie("viewer", false)

	// An edit that changes neither keeps the user signed in.
	expect(t, e.do("PUT", "/managed/users/viewer", `{"readOnly":[]}`, admin), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "")

	expect(t, e.do("PUT", "/managed/users/viewer", `{"password":"viewer-new-pw-1"}`, admin), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")

	viewer = e.cookie("viewer", false)
	expect(t, e.do("PUT", "/managed/users/viewer", `{"admin":true}`, admin), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")

	// The admin's own password change ends the admin's own session too.
	expect(t, e.do("PUT", "/managed/users/admin", `{"admin":true,"password":"admin-new-pw-1"}`, admin), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", admin), http.StatusUnauthorized, "unauthenticated")
}

func TestManagedAPI_SaveAndDeleteUser_PersistErrorIs500(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	blockWrites(t, &e.api.store.usersPath)
	expect(t, e.do("PUT", "/managed/users/bob", `{"password":"bob-password-1"}`, c), http.StatusInternalServerError, "server_error")
	expect(t, e.do("DELETE", "/managed/users/viewer", "", c), http.StatusInternalServerError, "server_error")
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
	expect(t, e.do("DELETE", "/managed/users/admin", "", admin), http.StatusConflict, "last_admin")
	expect(t, e.do("DELETE", "/managed/users/ghost", "", admin), http.StatusNotFound, "not_found")
	expect(t, e.do("DELETE", "/managed/users/viewer", "", admin), http.StatusNoContent, "")
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")
}

// ----- connections ----------------------------------------------------------------------

func TestManagedAPI_ListConnectionsNeverSendsSecrets(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.do("PUT", "/managed/connections/b3", `{"hostname":"h3","semp":{"port":"","user":"","pass":""},"client":{"port":"","msgVpns":[]}}`, c), http.StatusNoContent, "")
	rec := e.do("GET", "/managed/connections", "", c)
	expect(t, rec, http.StatusOK, "")
	body := rec.Body.String()
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
	expect(t, e.do("PUT", "/managed/connections/b3", ok, c), http.StatusNoContent, "")
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
	expect(t, e.do("PUT", "/managed/connections/b4", ok, c), http.StatusInternalServerError, "server_error")
}

func TestManagedAPI_DeleteConnection(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	expect(t, e.do("DELETE", "/managed/connections/nope", "", c), http.StatusNotFound, "not_found")
	expect(t, e.do("DELETE", "/managed/connections/b2", "", c), http.StatusNoContent, "")
	blockWrites(t, &e.api.store.connsPath)
	expect(t, e.do("DELETE", "/managed/connections/b1", "", c), http.StatusInternalServerError, "server_error")
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
	expect(t, e.do("PUT", "/managed/users/carol", `{"password":"carol-password-1","modules":["queue-browser"]}`, c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/users/viewer", `{"readOnly":[]}`, c), http.StatusNoContent, "")
	expect(t, e.do("DELETE", "/managed/users/carol", "", c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/connections/b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"semp-new-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"vpn-new-pw"},{"name":"v2","user":"u","pass":""}]}}`, c), http.StatusNoContent, "")
	expect(t, e.do("DELETE", "/managed/connections/b3", "", c), http.StatusNoContent, "")
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
	expect(t, e.do("PUT", "/managed/connections/b3", plain, c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/connections/b4", tls, c), http.StatusNoContent, "")
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
	put := func(name, body string) { e.do("PUT", "/managed/users/"+name, body, c) }

	put("bob", `{"password":"bob-password-1","readOnly":[{"brokers":"b1","msgVpns":"*","queues":"*"}]}`)
	put("bob", `{"password":"bob-password-2","admin":true,"readOnly":[],"modules":["queue-browser"]}`)
	put("viewer", `{"modules":["queue-browser"],"readOnly":[{"brokers":"b1","msgVpns":"v1","queues":"*"}]}`)
	put("admin", `{"admin":true,"operate":[{"brokers":"*","msgVpns":"*","queues":"*"}]}`)
	put("carol", `{"password":"short"}`)
	// bob goes first: while bob is an admin, the demotion would succeed and sign admin out.
	e.do("DELETE", "/managed/users/bob", "", c)
	put("admin", `{"admin":false}`)
	e.do("DELETE", "/managed/users/ghost", "", c)
	e.do("PUT", "/managed/users/x", `{}`, e.cookie("viewer", false))

	au.expect(t,
		auditEntry{Actor: "admin", Action: "user.create", Target: "bob", Outcome: "ok", Msg: "admin created user bob"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "bob", Outcome: "ok", Changed: []string{"password", "admin", "grants", "modules"},
			Msg: "admin updated user bob: password, admin, grants, modules"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "viewer", Outcome: "ok", Msg: "admin updated user viewer"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "admin", Outcome: "ok", Msg: "admin updated user admin"},
		auditEntry{Actor: "admin", Action: "user.create", Target: "carol", Outcome: "refused", Code: "invalid", Msg: "admin could not create user carol: invalid"},
		auditEntry{Actor: "admin", Action: "user.delete", Target: "bob", Outcome: "ok", Msg: "admin deleted user bob"},
		auditEntry{Actor: "admin", Action: "user.update", Target: "admin", Outcome: "refused", Code: "last_admin", Msg: "admin could not update user admin: last_admin"},
		auditEntry{Actor: "admin", Action: "user.delete", Target: "ghost", Outcome: "refused", Code: "not_found", Msg: "admin could not delete user ghost: not_found"},
		auditEntry{Actor: "viewer", Action: "user.create", Target: "x", Outcome: "refused", Code: "forbidden", Msg: "viewer could not create user x: forbidden"},
	)
}

// A save that fails to write is a refusal with the server_error code.
func TestManagedAPI_FailedSaveIsAuditedAsRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	blockWrites(t, &e.api.store.usersPath)
	expect(t, e.do("PUT", "/managed/users/bob", `{"password":"bob-password-1"}`, e.cookie("admin", false)), http.StatusInternalServerError, "server_error")
	au.expect(t, auditEntry{Actor: "admin", Action: "user.create", Target: "bob", Outcome: "refused", Code: "server_error",
		Msg: "admin could not create user bob: server_error"})
}

// A connection update names hostname, semp, client and each VPN added,
// changed or removed; a password counts as a change to its part, with no value.
func TestManagedAPI_ConnectionChangesAreAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	put := func(broker, body string) { e.do("PUT", "/managed/connections/"+broker, body, c) }

	put("b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"semp-new-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"vpn-new-pw"}]}}`)
	put("b3", `{"hostname":"h3b","semp":{"scheme":"http","port":"1943","user":"mon","pass":""},"client":{"scheme":"ws","port":"1443","msgVpns":[{"name":"v1","user":"u","pass":""},{"name":"v2","user":"u2","pass":"vpn2-pw"}]}}`)
	put("b3", `{"hostname":"h3b","semp":{"scheme":"http","port":"1943","user":"mon","pass":"semp2-pw"},"client":{"scheme":"ws","port":"1443","msgVpns":[{"name":"v1","user":"u-new","pass":""}]}}`)
	put("b3", `{"semp":{"port":"x"}}`)
	e.do("DELETE", "/managed/connections/b3", "", c)
	e.do("DELETE", "/managed/connections/nope", "", c)
	e.do("PUT", "/managed/connections/b9", `{}`, e.cookie("viewer", false))

	au.expect(t,
		auditEntry{Actor: "admin", Action: "connection.create", Target: "b3", Outcome: "ok", Msg: "admin created connection b3"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "ok", Changed: []string{"hostname", "semp", "client", "vpn v2"},
			Msg: "admin updated connection b3: hostname, semp, client, vpn v2"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "ok", Changed: []string{"semp", "vpn v1", "vpn v2"},
			Msg: "admin updated connection b3: semp, vpn v1, vpn v2"},
		auditEntry{Actor: "admin", Action: "connection.update", Target: "b3", Outcome: "refused", Code: "invalid", Msg: "admin could not update connection b3: invalid"},
		auditEntry{Actor: "admin", Action: "connection.delete", Target: "b3", Outcome: "ok", Msg: "admin deleted connection b3"},
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
	expect(t, e.do("PUT", "/managed/users/sweep", `{"password":"sweep-user-pw-1"}`, c), http.StatusNoContent, "")
	expect(t, e.do("PUT", "/managed/connections/b3", `{"hostname":"h3","semp":{"port":"1943","user":"mon","pass":"sweep-semp-pw"},"client":{"port":"1443","msgVpns":[{"name":"v1","user":"u","pass":"sweep-vpn-pw"}]}}`, c), http.StatusNoContent, "")
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
