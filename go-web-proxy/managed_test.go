//go:build managed

package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// managedEnv is the managed gateway as serve() mounts it, over the store
// fixtures (admin + viewer, brokers b1, b2), with a fake clock. The hosted,
// admin, app and relay handlers are stubs that answer with their name.
type managedEnv struct {
	f      storeFixture
	clock  *fakeClock
	log    *strings.Builder
	routes *managedRoutes
	api    *managedHandler
	pages  *authPages
	root   http.Handler
}

func named(name string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, name) })
}

func newManagedEnv(t *testing.T, mutate func(*config)) *managedEnv {
	t.Helper()
	f := newStoreFixture(t)
	cfg := defaultConfig()
	cfg.hosted, cfg.managed, cfg.connModes = true, true, connBoth
	cfg.usersFile, cfg.connectionsFile, cfg.siteSeedFile = f.usersPath, f.connsPath, f.seedPath
	cfg.login.unauthPerMinute = 1000
	if mutate != nil {
		mutate(&cfg)
	}
	clock := newFakeClock()
	log := &strings.Builder{}
	routes, err := buildManagedRoutes(cfg, f.h, noEnv, clock.now, newCapturingLogger(log))
	if err != nil {
		t.Fatalf("buildManagedRoutes: %v", err)
	}
	return &managedEnv{
		f: f, clock: clock, log: log, routes: routes,
		api:   routes.api.(*managedHandler),
		pages: routes.pages.(*authPages),
		root:  withClient(nil, newRootHandler(named("hosted"), named("admin"), named("app"), named("relay"), routes)),
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
	if p.Username != "viewer" || p.Admin || len(p.Brokers) != 1 || p.SiteSeed == "" {
		t.Errorf("viewer profile: %+v", p)
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
	c := e.cookie("viewer", false)
	rec := e.do("POST", "/managed/logout", "", c)
	expect(t, rec, http.StatusNoContent, "")
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
	var out struct{ Users []userJSON }
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil || len(out.Users) != 2 {
		t.Fatalf("users: %v %s", err, body)
	}
	if out.Users[1].Username != "viewer" || len(out.Users[1].ReadOnly) != 1 || out.Users[1].ReadOnly[0].Brokers != "b1" {
		t.Errorf("viewer row: %+v", out.Users[1])
	}
}

func TestManagedAPI_SaveUser_CreateAndValidate(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("admin", false)
	put := func(name, body string) *httptest.ResponseRecorder { return e.do("PUT", "/managed/users/"+name, body, c) }

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
		{"short password", "carol", `{"password":"short"}`, 422, "invalid", "password"},
		{"new without password", "carol", `{}`, 422, "invalid", "password"},
		{"unknown field", "carol", `{"password":"long-enough-pw","role":"x"}`, 400, "bad_request", ""},
		{"trailing data", "carol", `{"password":"long-enough-pw"} {}`, 400, "bad_request", ""},
		{"malformed", "carol", `{`, 400, "bad_request", ""},
		{"too large", "carol", `{"password":"` + strings.Repeat("x", maxBodyBytes) + `"}`, 413, "too_large", ""},
		{"last admin", "admin", `{"admin":false}`, 409, "last_admin", ""},
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
	if !strings.Contains(e.log.String(), "managed: saveUser failed") {
		t.Errorf("the cause must reach the log: %s", e.log.String())
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
	if strings.Contains(body, "PKD:") {
		t.Errorf("packed passwords must never be listed: %s", body)
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
