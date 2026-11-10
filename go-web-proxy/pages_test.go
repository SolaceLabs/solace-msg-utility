package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func (e *managedEnv) form(path string, v url.Values, c *http.Cookie, headers ...string) *httptest.ResponseRecorder {
	return e.do("POST", path, v.Encode(), c, append([]string{"Content-Type", "application/x-www-form-urlencoded"}, headers...)...)
}

func signInForm(user, pw, next string) url.Values {
	return url.Values{"username": {user}, "password": {pw}, "next": {next}}
}

func issuedCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookie && c.Value != "" {
			return c
		}
	}
	t.Fatalf("no session cookie issued: %v", rec.Header())
	return nil
}

func expectRedirect(t *testing.T, rec *httptest.ResponseRecorder, to string) {
	t.Helper()
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != to {
		t.Fatalf("want 303 to %q, got %d %q", to, rec.Code, rec.Header().Get("Location"))
	}
}

func expectPage(t *testing.T, rec *httptest.ResponseRecorder, status int, text string) {
	t.Helper()
	if rec.Code != status || !strings.Contains(rec.Body.String(), text) {
		t.Fatalf("want %d containing %q, got %d:\n%s", status, text, rec.Code, rec.Body.String())
	}
}

// ----- /login ---------------------------------------------------------------------

func TestLoginPage_FormHeadersAndNext(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("GET", "/login", "", nil)
	expectPage(t, rec, http.StatusOK, `action="/login"`)
	h := rec.Header()
	if h.Get("Content-Security-Policy") != pageCSP || h.Get("Cache-Control") != "no-store" || h.Get("X-Robots-Tag") != "noindex, nofollow" {
		t.Errorf("page headers: %v", h)
	}
	if strings.Contains(rec.Body.String(), "<script") {
		t.Error("the sign-in page carries no script")
	}
	for query, want := range map[string]string{
		"":                             `name="next" value="/"`,
		"?next=/solAdmin":              `name="next" value="/solAdmin"`,
		"?next=https://evil.example/x": `name="next" value="/"`,
		"?next=//evil.example":         `name="next" value="/"`,
	} {
		expectPage(t, e.do("GET", "/login"+query, "", nil), http.StatusOK, want)
	}
	if rec := e.do("PUT", "/login", "", nil); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("PUT /login: want 405, got %d", rec.Code)
	}
}

func TestLogin_SuccessIssuesCookieAndRedirects(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), nil)
	expectRedirect(t, rec, "/")
	c := issuedCookie(t, rec)
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode {
		t.Errorf("cookie flags: %+v", c)
	}
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusOK, "")
	if !strings.Contains(e.log.String(), "signed in") {
		t.Error("a sign-in is logged")
	}

	// Signing in again (here as admin, to /solAdmin) ends the previous session.
	rec = e.form("/login", signInForm("admin", adminPW, "/solAdmin"), c)
	expectRedirect(t, rec, "/solAdmin")
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusUnauthorized, "unauthenticated")

	// GET /login with a live session goes straight on.
	expectRedirect(t, e.do("GET", "/login?next=/solAdmin", "", issuedCookie(t, rec)), "/solAdmin")
}

// Wrong password and unknown user look the same: one status, one message.
func TestLogin_FailureIsGeneric(t *testing.T) {
	e := newManagedEnv(t, nil)
	wrong := e.form("/login", signInForm("viewer", "not-the-password", "/"), nil)
	ghost := e.form("/login", signInForm("ghost", "not-the-password", "/"), nil)
	for _, rec := range []*httptest.ResponseRecorder{wrong, ghost} {
		expectPage(t, rec, http.StatusUnauthorized, "Sign-in failed. Check the username and password.")
		if len(rec.Result().Cookies()) != 0 {
			t.Error("a failed sign-in issues no cookie")
		}
	}
	if !strings.Contains(e.log.String(), "sign-in failed") || !strings.Contains(e.log.String(), "user=ghost") {
		t.Errorf("failures are logged with the attempted user: %s", e.log.String())
	}
}

func TestLogin_ThrottledEvenWithTheRightPassword(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	for i := 0; i < testLoginLimits.maxFailures; i++ {
		e.form("/login", signInForm("viewer", "wrong-password", "/"), nil)
	}
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), nil)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many attempts. Try again in 30 seconds.")
	if rec.Header().Get("Retry-After") != "30" {
		t.Errorf("Retry-After: got %q", rec.Header().Get("Retry-After"))
	}
	e.clock.advance(testLoginLimits.backoff)
	expectRedirect(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil), "/")
}

func TestLogin_MustChangeGoesToPasswordPage(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.api.store.users[0].MustChangePassword = true
	rec := e.form("/login", signInForm("admin", adminPW, "/solAdmin"), nil)
	expectRedirect(t, rec, "/login/password?next=%2FsolAdmin")
	expectRedirect(t, e.do("GET", "/login", "", issuedCookie(t, rec)), "/login/password")
}

func TestLogin_RefusedRequests(t *testing.T) {
	e := newManagedEnv(t, nil)
	expectPage(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil, "Sec-Fetch-Site", "cross-site"),
		http.StatusForbidden, "submitted from another site")
	big := url.Values{"username": {strings.Repeat("x", maxBodyBytes)}}
	expectPage(t, e.form("/login", big, nil), http.StatusBadRequest, "could not be read")
}

func TestLogin_CheckUnavailableIs503(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.api.store.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	e.api.store.hasher.slots <- struct{}{} // every slot busy...
	req := httptest.NewRequest("POST", "https://gw.example/login", strings.NewReader(signInForm("viewer", viewerPW, "/").Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	ctx, cancel := context.WithCancel(req.Context())
	cancel() // ...and the client gone
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req.WithContext(ctx))
	expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
}

func TestAuthPages_UnauthenticatedBudget(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login.unauthPerMinute = 1 })
	expectPage(t, e.do("GET", "/login", "", nil), http.StatusOK, "Sign in")
	rec := e.do("GET", "/login", "", nil)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many requests from this address")
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 must carry Retry-After")
	}
}

func TestAuthPages_UnknownPathIs404(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := httptest.NewRecorder()
	e.pages.ServeHTTP(rec, httptest.NewRequest("GET", "/login/other", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", rec.Code)
	}
}

// ----- /login/password -----------------------------------------------------------------

func passwordForm(cur, nw, confirm string) url.Values {
	return url.Values{"current": {cur}, "new": {nw}, "confirm": {confirm}, "next": {"/"}}
}

func TestPasswordPage_NeedsSession(t *testing.T) {
	e := newManagedEnv(t, nil)
	expectRedirect(t, e.do("GET", "/login/password?next=/solAdmin", "", nil), "/login?next=%2FsolAdmin")
	expectRedirect(t, e.form("/login/password", passwordForm("a", "b", "b"), nil), "/login")
	expectPage(t, e.do("GET", "/login/password", "", e.cookie("viewer", false)), http.StatusOK, `action="/login/password"`)
	forced := e.do("GET", "/login/password", "", e.cookie("viewer", true))
	expectPage(t, forced, http.StatusOK, "You must set a new password")
	if strings.Contains(forced.Body.String(), "Cancel") {
		t.Error("a forced change offers no way around it")
	}
}

func TestPasswordChange_Rejections(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("viewer", false)
	cases := []struct {
		name   string
		form   url.Values
		status int
		text   string
	}{
		{"wrong current", passwordForm("nope", "viewer-new-pw-1", "viewer-new-pw-1"), 401, "current password is not correct"},
		{"mismatch", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-2"), 422, "do not match"},
		{"too short", passwordForm(viewerPW, "short", "short"), 422, "must be 12 to 128 characters"},
		{"unchanged", passwordForm(viewerPW, viewerPW, viewerPW), 422, "must differ"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			expectPage(t, e.form("/login/password", tc.form, c), tc.status, tc.text)
		})
	}
	// A forged submission from another site, with the right current password
	// and the victim's session cookie, is refused before it is read.
	expectPage(t, e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), c, "Sec-Fetch-Site", "cross-site"),
		http.StatusForbidden, "submitted from another site")
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("no rejected change may alter the password")
	}
}

func TestPasswordChange_SuccessEndsOtherSessionsAndClearsFlag(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.api.store.users[1].MustChangePassword = true
	other := e.cookie("viewer", true)
	here := e.cookie("viewer", true)
	rec := e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), here)
	expectRedirect(t, rec, "/")
	fresh := issuedCookie(t, rec)
	expect(t, e.do("GET", "/managed/me", "", fresh), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", other), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/me", "", here), http.StatusUnauthorized, "unauthenticated")
	mustChange, ok, _ := e.api.store.checkPassword(context.Background(), "viewer", "viewer-new-pw-1")
	if !ok || mustChange {
		t.Errorf("new password must work and clear the flag: ok=%v mustChange=%v", ok, mustChange)
	}
}

func TestPasswordChange_ThrottledAndFailures(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	c := e.cookie("viewer", false)
	for i := 0; i < testLoginLimits.maxFailures; i++ {
		e.form("/login/password", passwordForm("guess", "viewer-new-pw-1", "viewer-new-pw-1"), c)
	}
	expectPage(t, e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), c),
		http.StatusTooManyRequests, "Too many attempts")

	e.clock.advance(testLoginLimits.maxBackoff)
	blockWrites(t, &e.api.store.usersPath)
	expectPage(t, e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), c),
		http.StatusInternalServerError, "could not be saved")

	e.api.store.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	e.api.store.hasher.slots <- struct{}{}
	req := httptest.NewRequest("POST", "https://gw.example/login/password", strings.NewReader(passwordForm(viewerPW, "x", "x").Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(c)
	ctx, cancel := context.WithCancel(req.Context())
	cancel()
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req.WithContext(ctx))
	expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
}

// ----- gates ------------------------------------------------------------------------------

func TestGateApp_ManagedModeNeedsASession(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.connModes = connProvisioned })
	expectRedirect(t, e.do("GET", "/", "", nil), "/login")
	expectRedirect(t, e.do("GET", "/some/route", "", nil), "/login")
	if rec := e.do("GET", "/solclient.js", "", nil); rec.Code != http.StatusUnauthorized || rec.Body.Len() != 0 {
		t.Errorf("an asset without a session: want a bare 401, got %d %q", rec.Code, rec.Body.String())
	}
	forced := e.cookie("viewer", true)
	expectRedirect(t, e.do("GET", "/", "", forced), "/login/password")
	if rec := e.do("GET", "/solclient.js", "", forced); rec.Code != http.StatusUnauthorized {
		t.Errorf("an asset during a forced change: want 401, got %d", rec.Code)
	}
	if rec := e.do("GET", "/", "", e.cookie("viewer", false)); rec.Body.String() != "app" {
		t.Errorf("a session reaches the app, got %q", rec.Body.String())
	}
}

func TestGateApp_OtherModesServeTheBundleWithoutSession(t *testing.T) {
	e := newManagedEnv(t, nil) // connModes both: the Direct tab needs no sign-in
	if rec := e.do("GET", "/", "", nil); rec.Body.String() != "app" {
		t.Errorf("want the app without a session, got %d %q", rec.Code, rec.Body.String())
	}
}

func TestGateApp_UnauthenticatedBudget(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.connModes = connProvisioned; c.login.unauthPerMinute = 1 })
	e.do("GET", "/", "", nil)
	expectPage(t, e.do("GET", "/", "", nil), http.StatusTooManyRequests, "Too many requests")
}

func TestGateAdmin(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login.unauthPerMinute = 1 })
	expectRedirect(t, e.do("GET", "/solAdmin", "", nil), "/login?next=%2FsolAdmin")
	expectPage(t, e.do("GET", "/solAdmin", "", nil), http.StatusTooManyRequests, "Too many requests")
	expectRedirect(t, e.do("GET", "/solAdmin", "", e.cookie("admin", true)), "/login/password?next=%2FsolAdmin")
	expectPage(t, e.do("GET", "/solAdmin", "", e.cookie("viewer", false)), http.StatusForbidden, "signed in as viewer, which is not an administrator")
	expectRedirect(t, e.do("GET", "/solAdmin", "", e.cookie("ghost", false)), "/login?next=%2FsolAdmin")
	if rec := e.do("GET", "/solAdmin/", "", e.cookie("admin", false)); rec.Body.String() != "admin" {
		t.Errorf("an admin reaches the admin app, got %d %q", rec.Code, rec.Body.String())
	}
}
