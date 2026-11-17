package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
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

// ----- the pages' policy ------------------------------------------------------------

// The policy allows the page's own stylesheet and nothing else inline: the
// hash it names is that of the <style> block the browser receives.
func TestPageCSP_HashesTheStyleBlockThePageCarries(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("GET", "/login", "", nil)
	_, rest, _ := strings.Cut(rec.Body.String(), "<style>")
	css, _, found := strings.Cut(rest, "</style>")
	if !found {
		t.Fatalf("the sign-in page has no <style> block:\n%s", rec.Body.String())
	}
	sum := sha256.Sum256([]byte(css))
	want := "style-src 'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "';"
	got := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(got, want) || strings.Contains(got, "unsafe-inline") {
		t.Errorf("policy %q: want %q and no 'unsafe-inline'", got, want)
	}
}

// A template without a complete <style> block allows no style at all, and
// CRLF line ends hash as LF, as the browser hashes them.
func TestPagePolicy_StyleBlockOrNone(t *testing.T) {
	for _, src := range []string{"<p>no style</p>", "<style>p{}"} {
		if got := pagePolicy(src); !strings.Contains(got, "style-src 'none';") {
			t.Errorf("pagePolicy(%q) = %q: want style-src 'none'", src, got)
		}
	}
	lf := pagePolicy("<style>a\nb\n</style>")
	if pagePolicy("<style>a\r\nb\r</style>") != lf {
		t.Errorf("CRLF and CR line ends must hash as LF: %q", lf)
	}
}

// ----- /login ---------------------------------------------------------------------

// A sign-in form whose body stops arriving is refused at bodyReadTimeout: the
// page says the form could not be read, and the handler is free again. The
// form needs no session, so this is where a slow body costs the least to send.
// The access log's writer sits in front, as serve mounts it: the deadline
// reaches the connection through it.
func TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline(t *testing.T) {
	shortBodyDeadline(t, 200*time.Millisecond)
	e := newManagedEnv(t, nil)
	srv := httptest.NewServer(accessLog(e.root, quietLogger()))
	t.Cleanup(srv.Close)
	got := rawExchange(t, srv, "POST /login HTTP/1.1\r\nHost: gw\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 100\r\n\r\nusername=alice")
	if !strings.HasPrefix(got, "400 ") || !strings.Contains(got, "The form could not be read.") {
		t.Errorf("want 400 with the page that says the form could not be read, got %q", got)
	}
}

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
	au := e.withAudit(t, auditSettings{})
	e.api.store.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	e.api.store.hasher.slots <- struct{}{} // every slot busy...
	req := httptest.NewRequest("POST", "https://gw.example/login", strings.NewReader(signInForm("viewer", viewerPW, "/").Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	ctx, cancel := context.WithCancel(req.Context())
	cancel() // ...and the client gone
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req.WithContext(ctx))
	expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
	au.expect(t, auditEntry{Client: "192.0.2.1", Action: "signin", Target: "viewer", Outcome: "refused", Code: "unavailable", Msg: "sign-in refused for viewer: unavailable"})
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
	au := e.withAudit(t, auditSettings{})
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
	// The forged submission was refused before it was read: no entry.
	refused := func(code string) auditEntry {
		return auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "refused", Code: code,
			Msg: "viewer could not change their password: " + strings.ReplaceAll(code, "_", " ")}
	}
	au.expect(t, refused("bad_credentials"), refused("invalid"), refused("invalid"), refused("invalid"))
}

// login.passwordMinLength is read live by the password page: the form states it
// and carries it as minlength, a shorter password is refused 422 naming it, and
// a password of that length is taken.
func TestPasswordPage_EnforcesAndShowsTheLiveMinimum(t *testing.T) {
	e := newManagedEnv(t, nil)
	// The audit trail first: withAudit applies e.cfg's live settings, which
	// would put the minimum back to its default.
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("viewer", false)
	expectPage(t, e.do("GET", "/login/password", "", c), http.StatusOK, `minlength="12"`)
	next := e.cfg
	next.login.passwordMinLength = 20
	e.live.apply(next)
	page := e.do("GET", "/login/password", "", c)
	expectPage(t, page, http.StatusOK, `minlength="20"`)
	if !strings.Contains(page.Body.String(), "20 to 128 characters.") || strings.Contains(page.Body.String(), `minlength="12"`) {
		t.Errorf("the page must state the live minimum:\n%s", page.Body.String())
	}
	short := "viewer-new-pw-1" // 15 characters: fine by default, short of 20
	expectPage(t, e.form("/login/password", passwordForm(viewerPW, short, short), c), http.StatusUnprocessableEntity, "The new password must be 20 to 128 characters.")
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("a refused change leaves the password")
	}
	au.expect(t, auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "refused", Code: "invalid",
		Msg: "viewer could not change their password: invalid"})
	long := strings.Repeat("v", 20)
	expectRedirect(t, e.form("/login/password", passwordForm(viewerPW, long, long), c), "/")
	if !signsIn(t, e.api.store, "viewer", long) {
		t.Error("a password of the minimum length must be taken")
	}
}

func TestPasswordChange_SuccessEndsOtherSessionsAndClearsFlag(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
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
	au.expect(t, auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "ok", Wrote: usersWrote(3), Msg: "viewer set a new password after the forced change"})
}

// A change the user chose to make reads differently from the forced one, and
// neither entry holds a password.
func TestPasswordChange_VoluntaryChangeIsAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	expectRedirect(t, e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), e.cookie("viewer", false)), "/")
	au.expect(t, auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "ok", Wrote: usersWrote(3), Msg: "viewer changed their password"})
	data, err := os.ReadFile(au.path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), viewerPW) || strings.Contains(string(data), "viewer-new-pw-1") {
		t.Errorf("a password reached the trail: %s", data)
	}
}

func TestPasswordChange_ThrottledAndFailures(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	au := e.withAudit(t, auditSettings{})
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

	// Three wrong guesses (the third starts the lockout), the refused attempt,
	// the failed write and the unavailable check; the last request came from
	// httptest's default address.
	refused := func(client, code string) auditEntry {
		return auditEntry{Actor: "viewer", Client: client, Action: "password.change", Target: "viewer", Outcome: "refused", Code: code,
			Msg: "viewer could not change their password: " + strings.ReplaceAll(code, "_", " ")}
	}
	lockout := func(target, kind string) auditEntry {
		return auditEntry{Action: "lockout", Target: target, Outcome: "refused", Code: "throttled",
			Msg: "sign-in throttled for " + kind + " " + target + " after 3 failed attempts"}
	}
	au.expect(t,
		refused("", "bad_credentials"), refused("", "bad_credentials"),
		lockout("viewer", "user"), lockout("192.0.2.10/32", "client"), refused("", "bad_credentials"),
		refused("", "throttled"), refused("", "store_write_failed"), refused("192.0.2.1", "unavailable"),
	)
}

// The refusals the writer adds, each with its own audit code and an answer the
// user can act on: the audit log cannot be written (audit.onFailure refuse), a
// store file changed outside the gateway. The password stays as it was.
func TestPasswordChange_WriterRefusals(t *testing.T) {
	change := func(e *managedEnv, c *http.Cookie) *httptest.ResponseRecorder {
		return e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), c)
	}
	t.Run("audit log unavailable", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
		a, _ := e.withLoudAudit(t)
		_ = a.f.Close()
		e.api.audit.record(auditAdmin, auditEntry{Actor: "admin", Action: auditUserCreate, Outcome: auditOK, Msg: "admin created user x"}) // the lost record
		expectPage(t, change(e, e.cookie("viewer", false)), http.StatusServiceUnavailable, "cannot record changes")
		if !signsIn(t, e.api.store, "viewer", viewerPW) {
			t.Error("a refused change leaves the password")
		}
		if got := mustRead(t, a.path); len(got) != 0 {
			t.Errorf("the audit file is closed, so no line: %q", got)
		}
	})
	t.Run("store file changed on disk", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		au := e.withAudit(t, auditSettings{})
		if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
			t.Fatal(err)
		}
		expectPage(t, change(e, e.cookie("viewer", false)), http.StatusConflict, "restart the gateway")
		if !signsIn(t, e.api.store, "viewer", viewerPW) {
			t.Error("a refused change leaves the password")
		}
		au.expect(t, auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "refused", Code: "store_changed_on_disk",
			Msg: "viewer could not change their password: store changed on disk"})
	})
}

// A browser that went away before the change began is not answered or audited.
func TestPasswordChange_ClientGoneIsNotAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	release := holdWriter(t, e.api.store.wr)
	req := httptest.NewRequest("POST", "https://gw.example/login/password", strings.NewReader(passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1").Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(e.cookie("viewer", false))
	ctx, cancel := context.WithCancel(req.Context())
	done := make(chan *httptest.ResponseRecorder)
	go func() {
		rec := httptest.NewRecorder()
		e.root.ServeHTTP(rec, req.WithContext(ctx))
		done <- rec
	}()
	waitForWaiters(t, e.api.store.wr, 1)
	cancel()
	rec := <-done
	release()
	if rec.Body.Len() != 0 || len(au.entries(t)) != 0 {
		t.Errorf("nothing to answer and nothing to audit: %d %q %+v", rec.Code, rec.Body.String(), au.entries(t))
	}
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("the password must be unchanged")
	}
}

// A browser that already holds a session still draws every sign-in attempt from
// its client's budget: the 61st POST /login in a minute (the default
// login.unauthenticatedPerMinute) is refused, while pages that need a session
// and carry one stay unmetered.
func TestLogin_SignInWithASessionDrawsFromTheBudget(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login.unauthPerMinute = defaultConfig().login.unauthPerMinute })
	if e.cfg.login.unauthPerMinute != 60 {
		t.Fatalf("the default budget is 60 a minute, got %d", e.cfg.login.unauthPerMinute)
	}
	c := e.cookie("viewer", false)
	for i := range 60 {
		rec := e.form("/login", signInForm("viewer", viewerPW, "/"), c)
		if rec.Code != http.StatusSeeOther {
			t.Fatalf("attempt %d: want a sign-in, got %d %s", i+1, rec.Code, rec.Body.String())
		}
		c = issuedCookie(t, rec)
	}
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), c)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many requests from this address")
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 must carry Retry-After")
	}
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusOK, "") // the session was not touched
	expectRedirect(t, e.do("GET", "/login?next=/solAdmin", "", c), "/solAdmin")
	expectPage(t, e.do("GET", "/login/password", "", c), http.StatusOK, `action="/login/password"`)
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
	// A deleted user's session ends here; /login would bounce it straight back.
	ghost := e.cookie("ghost", false)
	rec := e.do("GET", "/solAdmin", "", ghost)
	expectRedirect(t, rec, "/login?next=%2FsolAdmin")
	if cs := rec.Result().Cookies(); len(cs) != 1 || cs[0].Name != sessionCookie || cs[0].MaxAge >= 0 {
		t.Errorf("the cookie must be cleared: %v", cs)
	}
	if _, ok := e.api.sessions.lookup(ghost.Value); ok {
		t.Error("a deleted user's session must end at /solAdmin")
	}
	if rec := e.do("GET", "/solAdmin/", "", e.cookie("admin", false)); rec.Body.String() != "admin" {
		t.Errorf("an admin reaches the admin app, got %d %q", rec.Code, rec.Body.String())
	}
}

// formFrom posts a form as the client at remote (host:port), with ctx.
func (e *managedEnv) formFrom(ctx context.Context, remote, path string, v url.Values, c *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest("POST", "https://gw.example"+path, strings.NewReader(v.Encode())).WithContext(ctx)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.RemoteAddr = remote
	if c != nil {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req)
	return rec
}

// Guesses for one account sent all at once, each from its own address, are
// checked one at a time: the first maxFailures fail and block the account,
// and every guess queued behind them meets the block before its password is
// looked at.
func TestLogin_ParallelGuessesForOneAccountQueue(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	const guesses = 12
	codes := make([]int, guesses)
	var wg sync.WaitGroup
	for i := range guesses {
		wg.Add(1)
		go func() {
			defer wg.Done()
			remote := fmt.Sprintf("198.51.100.%d:5000", i+1)
			codes[i] = e.formFrom(context.Background(), remote, "/login", signInForm("viewer", "wrong-password", "/"), nil).Code
		}()
	}
	wg.Wait()
	failed, throttled := 0, 0
	for _, c := range codes {
		switch c {
		case http.StatusUnauthorized:
			failed++
		case http.StatusTooManyRequests:
			throttled++
		}
	}
	if failed != testLoginLimits.maxFailures || throttled != guesses-failed {
		t.Fatalf("want %d checked and the rest throttled, got %d checked, %d throttled: %v", testLoginLimits.maxFailures, failed, throttled, codes)
	}
	if n := strings.Count(e.log.String(), "sign-in failed"); n != failed {
		t.Errorf("each checked guess logs one failure: want %d, got %d", failed, n)
	}
	if len(e.pages.throttle.turns) != 0 {
		t.Error("every turn must be given back")
	}
}

// A request queued behind another sign-in for the same account that goes
// away while it waits gets the 503, on either form, and never reaches the
// password check.
func TestLogin_QueuedRequestThatGoesAwayIs503(t *testing.T) {
	e := newManagedEnv(t, nil)
	release, wait, err := e.pages.throttle.loginTurn(context.Background(), "viewer")
	if err != nil || wait != 0 {
		t.Fatalf("take the turn: %v %v", wait, err)
	}
	defer release()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	expectPage(t, e.formFrom(ctx, "192.0.2.10:5000", "/login", signInForm("viewer", viewerPW, "/"), nil),
		http.StatusServiceUnavailable, "could not be checked")
	expectPage(t, e.formFrom(ctx, "192.0.2.10:5000", "/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), e.cookie("viewer", false)),
		http.StatusServiceUnavailable, "could not be checked")
	if !strings.Contains(e.log.String(), "sign-in check failed") || !strings.Contains(e.log.String(), "user=viewer") {
		t.Errorf("the failure names the account: %s", e.log.String())
	}
}

// With the table of accounts being signed in to full, a new account waits a
// back-off, as a full failure table makes it.
func TestLogin_FullTurnTableIs429(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	th := e.pages.throttle
	th.maxTracked = 1
	th.turns["someone-else"] = &turn{token: make(chan struct{}, 1), refs: 1}
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), nil)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many attempts. Try again in 30 seconds.")
	if !strings.Contains(e.log.String(), "throttle table full") || !strings.Contains(e.log.String(), "table=turns") {
		t.Errorf("a full table is named in the log: %s", e.log.String())
	}
}

// slowHasher makes every hash wait on its unbuffered slots channel: a test
// receives to let one start and sends to let it finish, so it can act while a
// sign-in is between reading the record and creating the session.
func slowHasher(e *managedEnv) chan struct{} {
	slots := make(chan struct{})
	e.api.store.hasher = &hasher{iter: 1, slots: slots}
	return slots
}

// A password reset that lands while a sign-in's hash runs wins: the sign-in
// matched the old password, so it gets the generic failure and no session.
func TestLogin_AccountChangedDuringTheCheckIsRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	reset := mustHash(t, e.f.h, "reset-by-admin-1")
	slots := slowHasher(e)
	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- e.form("/login", signInForm("viewer", viewerPW, "/"), nil) }()
	<-slots // the sign-in has read the record and starts its hash
	e.api.store.mu.Lock()
	e.api.store.users[1].Password = reset
	e.api.store.mu.Unlock()
	slots <- struct{}{} // and finishes it
	rec := <-done
	expectPage(t, rec, http.StatusUnauthorized, "Sign-in failed. Check the username and password.")
	if len(rec.Result().Cookies()) != 0 {
		t.Error("no session may be created over a reset")
	}
	if !strings.Contains(e.log.String(), "the account changed while its password was checked") {
		t.Errorf("the refusal is logged: %s", e.log.String())
	}
	au.expect(t, auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "account_changed", Msg: "sign-in refused for viewer: account changed"})
}

// The same race on the password page: the administrator's reset stands and
// the user is told to sign in again.
func TestPasswordChange_AccountChangedDuringTheCheckIs409(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	reset := mustHash(t, e.f.h, "reset-by-admin-1")
	c := e.cookie("viewer", false)
	slots := slowHasher(e)
	done := make(chan *httptest.ResponseRecorder)
	go func() {
		done <- e.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), c)
	}()
	<-slots // the current password's check starts
	e.api.store.mu.Lock()
	e.api.store.users[1].Password = reset
	e.api.store.mu.Unlock()
	slots <- struct{}{}
	<-slots // the new password's hash
	slots <- struct{}{}
	rec := <-done
	expectPage(t, rec, http.StatusConflict, "Sign in again")
	if storedHash(e.api.store, "viewer") != reset {
		t.Error("the administrator's reset must stand")
	}
	au.expect(t, auditEntry{Actor: "viewer", Action: "password.change", Target: "viewer", Outcome: "refused", Code: "account_changed",
		Msg: "viewer could not change their password: account changed"})
}

// Every recent sign-in from one private address means a proxy the gateway
// does not trust sits in front of it: one warning says so.
func TestLogin_WarnsWhenEverySignInLooksLikeOneClient(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.pages.watch = newClientWatch(2)
	for range 3 {
		expectRedirect(t, e.formFrom(context.Background(), "172.17.0.1:40000", "/login", signInForm("viewer", viewerPW, "/"), nil), "/")
	}
	if n := strings.Count(e.log.String(), "every recent sign-in came from this one private address"); n != 1 {
		t.Errorf("want one warning, got %d: %s", n, e.log.String())
	}
	if !strings.Contains(e.log.String(), "client=172.17.0.1") || !strings.Contains(e.log.String(), "sign_ins=2") {
		t.Errorf("the warning names the address and the window: %s", e.log.String())
	}
}

func TestClientWatch(t *testing.T) {
	private, public, other := netip.MustParseAddr("10.0.0.7"), netip.MustParseAddr("203.0.113.9"), netip.MustParseAddr("10.0.0.8")
	cases := []struct {
		name string
		seq  []netip.Addr
		ok   []bool // resolved, per entry
		want []bool
	}{
		{"one private address fills the window", []netip.Addr{private, private, private}, []bool{true, true, true}, []bool{false, true, false}},
		{"a public address never warns", []netip.Addr{public, public}, []bool{true, true}, []bool{false, false}},
		{"two addresses do not warn", []netip.Addr{private, other, private}, []bool{true, true, true}, []bool{false, false, false}},
		{"an unresolved client says nothing", []netip.Addr{{}, private, private}, []bool{false, true, true}, []bool{false, false, true}},
		{"loopback counts as private", []netip.Addr{netip.MustParseAddr("127.0.0.1"), netip.MustParseAddr("127.0.0.1")}, []bool{true, true}, []bool{false, true}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cw := newClientWatch(2)
			for i, a := range c.seq {
				if got := cw.seen(a, c.ok[i]); got != c.want[i] {
					t.Errorf("sign-in %d: warn %v, want %v", i+1, got, c.want[i])
				}
			}
		})
	}
}

// Every sign-in is one auth entry: a refusal names the account tried as its
// target and has no actor, a lockout follows the failure that starts it, and
// a sign-in that forces a password change says so.
func TestLogin_IsAudited(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.login = testLoginLimits; c.login.unauthPerMinute = 1000 })
	au := e.withAudit(t, auditSettings{})
	for range testLoginLimits.maxFailures {
		e.form("/login", signInForm("viewer", "wrong-password", "/"), nil)
	}
	e.form("/login", signInForm("viewer", viewerPW, "/"), nil) // throttled, though the password is right
	e.clock.advance(testLoginLimits.backoff)
	expectRedirect(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil), "/")
	e.form("/login", signInForm("ghost", "wrong-password", "/"), nil)
	// The sign-in did not clear the client's count, so the ghost's failure is
	// its fourth and blocks it again, for a doubled back-off; wait it out.
	e.clock.advance(2 * testLoginLimits.backoff)
	e.api.store.users[0].MustChangePassword = true
	e.form("/login", signInForm("admin", adminPW, "/"), nil)

	bad := func(user string) auditEntry {
		return auditEntry{Action: "signin", Target: user, Outcome: "refused", Code: "bad_credentials", Msg: "sign-in refused for " + user + ": bad credentials"}
	}
	au.expect(t,
		bad("viewer"), bad("viewer"),
		auditEntry{Action: "lockout", Target: "viewer", Outcome: "refused", Code: "throttled", Msg: "sign-in throttled for user viewer after 3 failed attempts"},
		auditEntry{Action: "lockout", Target: "192.0.2.10/32", Outcome: "refused", Code: "throttled", Msg: "sign-in throttled for client 192.0.2.10/32 after 3 failed attempts"},
		bad("viewer"),
		auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "throttled", Msg: "sign-in refused for viewer: throttled"},
		auditEntry{Actor: "viewer", Action: "signin", Target: "viewer", Outcome: "ok", Msg: "viewer signed in"},
		bad("ghost"),
		auditEntry{Actor: "admin", Action: "signin", Target: "admin", Outcome: "ok", Msg: "admin signed in; a password change is required"},
	)
}

// A refused sign-in has no actor even when the browser already holds a
// session: nobody was authenticated by it.
func TestLogin_RefusalHasNoActorEvenWithASession(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	e.form("/login", signInForm("ghost", "wrong-password", "/"), e.cookie("viewer", false))
	au.expect(t, auditEntry{Action: "signin", Target: "ghost", Outcome: "refused", Code: "bad_credentials", Msg: "sign-in refused for ghost: bad credentials"})
}

// ----- two-factor sign-in ------------------------------------------------------------------

// enrolWithCodes sets two-factor up for user in the store, as the confirm
// step does, and returns the recovery codes (the store keeps only hashes).
func (e *managedEnv) enrolWithCodes(t *testing.T, user, secret string) []string {
	t.Helper()
	codes := newRecoveryCodes()
	s := e.api.store
	if err := s.setTOTP(context.Background(), user, secret, hashRecoveryCodes(codes), storedHash(s, user), func() {}); err != nil {
		t.Fatalf("enrol %s: %v", user, err)
	}
	return codes
}

// nowCode is the code an authenticator holding secret shows at the test clock.
func (e *managedEnv) nowCode(t *testing.T, secret string) string {
	t.Helper()
	c, err := totpCode(secret, totpStepAt(e.clock.now()))
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// send is a request carrying any number of cookies (e.do and e.form carry one).
func (e *managedEnv) send(method, path string, v url.Values, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "https://gw.example"+path, strings.NewReader(v.Encode()))
	req.RemoteAddr = "192.0.2.10:5000"
	if method == "POST" {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req)
	return rec
}

func codeForm(code, next string) url.Values { return url.Values{"code": {code}, "next": {next}} }

func confirmForm(code, next string) url.Values {
	return url.Values{"step": {"confirm"}, "code": {code}, "next": {next}}
}

func verifyForm(pw, code, next string) url.Values {
	return url.Values{"step": {"verify"}, "password": {pw}, "code": {code}, "next": {next}}
}

func ticketCookie(t *testing.T, rec *httptest.ResponseRecorder) *http.Cookie {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == signinCookie && c.Value != "" {
			return c
		}
	}
	t.Fatalf("no sign-in ticket cookie issued: %v", rec.Header())
	return nil
}

// noSession fails when the response opened a session.
func noSession(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	for _, c := range rec.Result().Cookies() {
		if c.Name == sessionCookie && c.Value != "" {
			t.Fatalf("a session was opened: %v", rec.Header())
		}
	}
}

// cookieEnded reports whether the response clears the named cookie.
func cookieEnded(rec *httptest.ResponseRecorder, name string) bool {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name && c.Value == "" && c.MaxAge < 0 {
			return true
		}
	}
	return false
}

var (
	secretOnPage = regexp.MustCompile(`<code id="two-factor-secret"[^>]*>([A-Z2-7 ]+)</code>`)
	codesOnPage  = regexp.MustCompile(`<li>([A-Z2-9]{4}(?:-[A-Z2-9]{4}){3})</li>`)
)

// pageSecret is the secret the enrol page shows, ungrouped.
func pageSecret(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	m := secretOnPage.FindStringSubmatch(rec.Body.String())
	if m == nil {
		t.Fatalf("no secret on the page:\n%s", rec.Body.String())
	}
	if groups := strings.Fields(m[1]); len(groups) != 8 || len(groups[0]) != 4 {
		t.Fatalf("the secret is shown in 8 groups of four: %q", m[1])
	}
	return strings.ReplaceAll(m[1], " ", "")
}

// pageCodes are the ten recovery codes the recovery page lists.
func pageCodes(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	var out []string
	for _, m := range codesOnPage.FindAllStringSubmatch(rec.Body.String(), -1) {
		out = append(out, m[1])
	}
	if len(out) != recoveryCount {
		t.Fatalf("want %d recovery codes on the page, got %d:\n%s", recoveryCount, len(out), rec.Body.String())
	}
	return out
}

// expectNoSecrets fails when any of secrets is in the application log or the
// audit file. The failure never prints the secret.
func (e *managedEnv) expectNoSecrets(t *testing.T, au *auditLog, secrets ...string) {
	t.Helper()
	hay := e.log.String() + string(mustRead(t, au.path))
	for i, s := range secrets {
		if s != "" && strings.Contains(hay, s) {
			t.Errorf("secret #%d reached the log or the audit trail", i)
		}
	}
}

func isEnrolled(e *managedEnv, user string) bool {
	on, _ := e.api.store.twoFactorOf(user)
	return on
}

func recoveryLeft(e *managedEnv, user string) int {
	u, _ := e.api.store.findUser(user)
	if u.TOTP == nil {
		return -1
	}
	return len(u.TOTP.Recovery)
}

func optionalEnv(t *testing.T) (*managedEnv, *auditLog) {
	t.Helper()
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorOptional })
	return e, e.withAudit(t, auditSettings{})
}

// beginEnrol signs user in under a mode that asks for enrolment and returns
// the ticket cookie and the secret the enrol page shows.
func beginEnrol(t *testing.T, e *managedEnv, user, pw string) (*http.Cookie, string) {
	t.Helper()
	rec := e.form("/login", signInForm(user, pw, "/"), nil)
	expectRedirect(t, rec, "/login/two-factor")
	tc := ticketCookie(t, rec)
	page := e.do("GET", "/login/two-factor", "", tc)
	expectPage(t, page, http.StatusOK, `name="step" value="confirm"`)
	return tc, pageSecret(t, page)
}

// ----- the sign-in's second step -----------------------------------------------------------

func TestLogin_TwoFactorModeDecidesTheNextStep(t *testing.T) {
	cases := []struct {
		mode, user, pw string
		enrolled       bool
		want           string // "" opens the session, else where the ticket goes
	}{
		{twoFactorOptional, "viewer", viewerPW, true, "/login/code"},
		{twoFactorOptional, "viewer", viewerPW, false, ""},
		{twoFactorOptional, "admin", adminPW, false, ""},
		{twoFactorAdmins, "admin", adminPW, true, "/login/code"},
		{twoFactorAdmins, "admin", adminPW, false, "/login/two-factor"},
		{twoFactorAdmins, "viewer", viewerPW, false, ""},
		{twoFactorAdmins, "viewer", viewerPW, true, "/login/code"},
		{twoFactorMandatory, "viewer", viewerPW, false, "/login/two-factor"},
		{twoFactorMandatory, "admin", adminPW, false, "/login/two-factor"},
		{twoFactorMandatory, "viewer", viewerPW, true, "/login/code"},
	}
	for _, c := range cases {
		t.Run(fmt.Sprintf("%s/%s/enrolled=%t", c.mode, c.user, c.enrolled), func(t *testing.T) {
			e := newManagedEnv(t, func(cfg *config) { cfg.twoFactor = c.mode })
			if c.enrolled {
				e.enrolWithCodes(t, c.user, storeTOTPSecret)
			}
			rec := e.form("/login", signInForm(c.user, c.pw, "/"), nil)
			if c.want == "" {
				expectRedirect(t, rec, "/")
				issuedCookie(t, rec)
				return
			}
			expectRedirect(t, rec, c.want)
			ticketCookie(t, rec)
			noSession(t, rec)
		})
	}
}

func TestLoginCode_NoSessionUntilTheCodePasses(t *testing.T) {
	e, au := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), nil)
	expectRedirect(t, rec, "/login/code")
	tc := ticketCookie(t, rec)
	if !tc.Secure || !tc.HttpOnly || tc.SameSite != http.SameSiteStrictMode || tc.MaxAge != 0 {
		t.Errorf("ticket cookie flags: %+v", tc)
	}
	noSession(t, rec)
	expect(t, e.do("GET", "/managed/me", "", nil), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/me", "", tc), http.StatusUnauthorized, "unauthenticated") // a ticket opens nothing
	if n := len(au.entries(t)); n != 0 {
		t.Fatalf("the password step writes no audit entry, got %d", n)
	}
	page := e.do("GET", "/login/code", "", tc)
	expectPage(t, page, http.StatusOK, `action="/login/code"`)
	if page.Header().Get("Content-Security-Policy") != pageCSP || strings.Contains(page.Body.String(), "<script") {
		t.Error("the code page keeps the content policy and carries no script")
	}

	code := e.nowCode(t, storeTOTPSecret)
	rec = e.form("/login/code", codeForm(code, "/"), tc)
	expectRedirect(t, rec, "/")
	c := issuedCookie(t, rec)
	if !cookieEnded(rec, signinCookie) {
		t.Error("the ticket ends with the sign-in")
	}
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusOK, "")
	expectRedirect(t, e.do("GET", "/login/code", "", tc), "/login") // the ticket is spent
	au.expect(t, auditEntry{Actor: "viewer", Action: "signin", Target: "viewer", Outcome: "ok", Msg: "viewer signed in"})
	e.expectNoSecrets(t, au, storeTOTPSecret, code)
}

func TestLoginCode_NextAndForcedPasswordChangeFollowTheCode(t *testing.T) {
	e, au := optionalEnv(t)
	e.enrolWithCodes(t, "admin", storeTOTPSecret)
	e.api.store.users[0].MustChangePassword = true
	rec := e.form("/login", signInForm("admin", adminPW, "/solAdmin"), nil)
	expectRedirect(t, rec, "/login/code?next=%2FsolAdmin")
	tc := ticketCookie(t, rec)
	expectPage(t, e.do("GET", "/login/code?next=/solAdmin", "", tc), http.StatusOK, `name="next" value="/solAdmin"`)
	rec = e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/solAdmin"), tc)
	expectRedirect(t, rec, "/login/password?next=%2FsolAdmin") // the two-factor step came first
	expectPage(t, e.do("GET", "/login/password", "", issuedCookie(t, rec)), http.StatusOK, "You must set a new password")
	au.expect(t, auditEntry{Actor: "admin", Action: "signin", Target: "admin", Outcome: "ok", Msg: "admin signed in; a password change is required"})

	// Without a forced change, next is where it ends.
	e.api.store.users[0].MustChangePassword = false
	e.clock.advance(totpPeriod)
	tc = ticketCookie(t, e.form("/login", signInForm("admin", adminPW, "/solAdmin"), nil))
	expectRedirect(t, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/solAdmin"), tc), "/solAdmin")
}

func TestLoginCode_WrongCodeIsRefusedAndCounted(t *testing.T) {
	e := newManagedEnv(t, func(c *config) {
		c.twoFactor = twoFactorOptional
		c.login = testLoginLimits
		c.login.unauthPerMinute = 1000
	})
	au := e.withAudit(t, auditSettings{})
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	seq0, _ := e.api.store.seqs()
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))

	rec := e.form("/login/code", codeForm("000000", "/"), tc)
	expectPage(t, rec, http.StatusUnauthorized, "The code is not correct.")
	noSession(t, rec)
	au.expect(t, auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "bad_code", Msg: "sign-in refused for viewer: bad code"})
	expectPage(t, e.do("GET", "/login/code", "", tc), http.StatusOK, `action="/login/code"`) // the ticket stands: try again

	// Anything that is not six digits is tried as a recovery code, and fails the same way.
	expectPage(t, e.form("/login/code", codeForm("not-a-code", "/"), tc), http.StatusUnauthorized, "The code is not correct.")
	if seq, _ := e.api.store.seqs(); seq != seq0 || recoveryLeft(e, "viewer") != recoveryCount {
		t.Error("a refused code writes nothing")
	}

	// The third failure blocks the account: even the right code waits.
	expectPage(t, e.form("/login/code", codeForm("000000", "/"), tc), http.StatusUnauthorized, "The code is not correct.")
	rec = e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many attempts. Try again in 30 seconds.")
	if rec.Header().Get("Retry-After") != "30" {
		t.Errorf("Retry-After: got %q", rec.Header().Get("Retry-After"))
	}
	noSession(t, rec)
	var throttled bool
	for _, en := range au.entries(t) {
		throttled = throttled || (en.Action == "signin" && en.Code == "throttled")
	}
	if !throttled {
		t.Errorf("the blocked attempt is audited: %+v", au.entries(t))
	}
	e.clock.advance(testLoginLimits.backoff)
	expectRedirect(t, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc), "/")
}

// A wrong code counts with the wrong passwords before it: one budget for the
// whole sign-in.
func TestLoginCode_FailureCountIncludesThePasswordStep(t *testing.T) {
	e := newManagedEnv(t, func(c *config) {
		c.twoFactor = twoFactorOptional
		c.login = testLoginLimits
		c.login.unauthPerMinute = 1000
	})
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	for range 2 {
		expectPage(t, e.form("/login", signInForm("viewer", "wrong-password", "/"), nil), http.StatusUnauthorized, "Sign-in failed")
	}
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil)) // the right password does not clear them
	expectPage(t, e.form("/login/code", codeForm("000000", "/"), tc), http.StatusUnauthorized, "The code is not correct.")
	rec := e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc)
	expectPage(t, rec, http.StatusTooManyRequests, "Too many attempts")
	noSession(t, rec)
}

func TestLoginCode_ReplayedCodeIsRefused(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	code := e.nowCode(t, storeTOTPSecret)
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	expectRedirect(t, e.form("/login/code", codeForm(code, "/"), tc), "/")

	tc = ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	rec := e.form("/login/code", codeForm(code, "/"), tc)
	expectPage(t, rec, http.StatusUnauthorized, "The code is not correct.")
	noSession(t, rec)
	e.clock.advance(totpPeriod)
	expectRedirect(t, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc), "/") // the next step's code is fresh
}

func TestLoginCode_RecoveryCodeWorksOnce(t *testing.T) {
	e, au := optionalEnv(t)
	codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	typed := strings.ToLower(formatRecoveryCode(codes[0])) // as a person types it
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	rec := e.form("/login/code", codeForm(typed, "/"), tc)
	expectRedirect(t, rec, "/")
	issuedCookie(t, rec)
	if recoveryLeft(e, "viewer") != recoveryCount-1 {
		t.Fatalf("a used code is removed: %d left", recoveryLeft(e, "viewer"))
	}

	tc = ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	rec = e.form("/login/code", codeForm(typed, "/"), tc)
	expectPage(t, rec, http.StatusUnauthorized, "The code is not correct.")
	noSession(t, rec)
	other := strings.ReplaceAll(formatRecoveryCode(codes[1]), "-", " ")
	expectRedirect(t, e.form("/login/code", codeForm(other, "/"), tc), "/")
	au.expect(t,
		auditEntry{Actor: "viewer", Action: "signin", Target: "viewer", Outcome: "ok", Msg: "viewer signed in with a recovery code (9 left)"},
		auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "bad_code", Msg: "sign-in refused for viewer: bad code"},
		auditEntry{Actor: "viewer", Action: "signin", Target: "viewer", Outcome: "ok", Msg: "viewer signed in with a recovery code (8 left)"},
	)
	e.expectNoSecrets(t, au, codes[0], codes[1], typed, other, storeTOTPSecret)
}

// A code typed as an authenticator shows it ("123 456", or with a hyphen) is a
// TOTP code once the separators are out: it signs in, and it is still judged as
// a TOTP code, so a replay of it is refused however it is typed.
func TestLoginCode_SeparatorsInATOTPCodeAreIgnored(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	signIn := func() *http.Cookie {
		return ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	}
	for _, sep := range []string{" ", "-"} {
		e.clock.advance(totpPeriod)
		code := e.nowCode(t, storeTOTPSecret)
		typed := code[:3] + sep + code[3:]
		rec := e.form("/login/code", codeForm(typed, "/"), signIn())
		expectRedirect(t, rec, "/")
		issuedCookie(t, rec)
		if recoveryLeft(e, "viewer") != recoveryCount {
			t.Errorf("%q: a TOTP code uses no recovery code, %d left", typed, recoveryLeft(e, "viewer"))
		}
		replay := e.form("/login/code", codeForm(code, "/"), signIn())
		expectPage(t, replay, http.StatusUnauthorized, "The code is not correct.")
		noSession(t, replay)
	}
	// Six digits with other characters around them is not a TOTP code.
	e.clock.advance(totpPeriod)
	code := e.nowCode(t, storeTOTPSecret)
	rec := e.form("/login/code", codeForm(code+"x", "/"), signIn())
	expectPage(t, rec, http.StatusUnauthorized, "The code is not correct.")
	noSession(t, rec)
}

// audit.onFailure refuse with an audit log that cannot be written: a recovery
// code (a store write) is answered 503 on the code page, audited as
// audit_unavailable once the log can be written, and not used up; a code from
// the authenticator and a sign-in without two-factor write nothing and go on.
func TestLoginCode_RecoveryCodeIsRefusedWhileTheAuditLogCannotBeWritten(t *testing.T) {
	newEnv := func(t *testing.T) (*managedEnv, *auditor, []string) {
		e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorOptional })
		e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
		a, _ := e.withLoudAudit(t)
		codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		_ = a.f.Close()
		e.api.audit.record(auditAdmin, auditEntry{Actor: "admin", Action: auditUserCreate, Outcome: auditOK, Msg: "admin created user x"}) // the lost record
		return e, a, codes
	}
	t.Run("recovery code", func(t *testing.T) {
		e, a, codes := newEnv(t)
		typed := formatRecoveryCode(codes[0])
		tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil)) // the password step writes nothing
		rec := e.form("/login/code", codeForm(typed, "/"), tc)
		expectPage(t, rec, http.StatusServiceUnavailable, recoveryAuditText)
		noSession(t, rec)
		if recoveryLeft(e, "viewer") != recoveryCount {
			t.Fatalf("a refused recovery code is not used up: %d left", recoveryLeft(e, "viewer"))
		}

		a.mu.Lock()
		a.f = nil // the next write reopens the file: space is back
		a.mu.Unlock()
		expectPage(t, e.form("/login/code", codeForm(typed, "/"), tc), http.StatusServiceUnavailable, recoveryAuditText) // its refusal line is written and clears the state
		lines := fileLines(t, a.path)
		if len(lines) != 1 || !strings.Contains(lines[0], `"action":"signin"`) || !strings.Contains(lines[0], `"outcome":"refused"`) || !strings.Contains(lines[0], `"code":"audit_unavailable"`) {
			t.Errorf("want one refused sign-in entry with code audit_unavailable: %q", lines)
		}
		rec = e.form("/login/code", codeForm(typed, "/"), tc)
		expectRedirect(t, rec, "/")
		issuedCookie(t, rec)
		if recoveryLeft(e, "viewer") != recoveryCount-1 {
			t.Errorf("the code works once the log is writable and is then used up: %d left", recoveryLeft(e, "viewer"))
		}
	})
	t.Run("authenticator code and no two-factor", func(t *testing.T) {
		e, _, _ := newEnv(t)
		tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
		rec := e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc)
		expectRedirect(t, rec, "/")
		issuedCookie(t, rec)
		expectRedirect(t, e.form("/login", signInForm("admin", adminPW, "/solAdmin"), nil), "/solAdmin")
	})
}

// login.twoFactorMinutes is the sign-in ticket's lifetime, read live: a ticket
// ends at the time in force, and lowering the setting ends one already issued.
func TestLoginCode_TicketLivesAsLongAsTwoFactorMinutes(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	setTicket := func(d time.Duration) {
		next := e.cfg
		next.session.ticket = d
		e.live.apply(next)
	}
	signIn := func() *http.Cookie {
		return ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	}
	setTicket(2 * time.Minute)
	tc := signIn()
	e.clock.advance(2*time.Minute - time.Second)
	expectPage(t, e.do("GET", "/login/code", "", tc), http.StatusOK, `action="/login/code"`)
	e.clock.advance(time.Second)
	expectRedirect(t, e.do("GET", "/login/code", "", tc), "/login")

	setTicket(10 * time.Minute)
	tc = signIn()
	e.clock.advance(5 * time.Minute)
	expectPage(t, e.do("GET", "/login/code", "", tc), http.StatusOK, `action="/login/code"`)
	setTicket(4 * time.Minute)
	expectRedirect(t, e.do("GET", "/login/code", "", tc), "/login")
	rec := e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc)
	expectRedirect(t, rec, "/login")
	noSession(t, rec)
}

func TestLoginCode_NeedsALiveCodeTicket(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	expectRedirect(t, e.do("GET", "/login/code?next=/solAdmin", "", nil), "/login?next=%2FsolAdmin")
	expectRedirect(t, e.form("/login/code", codeForm("123456", "/solAdmin"), nil), "/login?next=%2FsolAdmin")

	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	e.clock.advance(defaultTicketTTL)
	expectRedirect(t, e.do("GET", "/login/code", "", tc), "/login")
	rec := e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc)
	expectRedirect(t, rec, "/login")
	noSession(t, rec)

	// A ticket of another stage grants nothing on this page.
	id := e.api.sessions.tickets.create(ticket{user: "viewer", stage: stageSetup, hash: storedHash(e.api.store, "viewer"), secret: newTOTPSecret()})
	setup := &http.Cookie{Name: signinCookie, Value: id}
	expectRedirect(t, e.do("GET", "/login/code", "", setup), "/login")
	rec = e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), setup)
	expectRedirect(t, rec, "/login")
	noSession(t, rec)
}

func TestLoginCode_ANewPasswordStepReplacesTheTicket(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	first := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	second := ticketCookie(t, e.send("POST", "/login", signInForm("viewer", viewerPW, "/"), first))
	expectRedirect(t, e.do("GET", "/login/code", "", first), "/login")
	expectPage(t, e.do("GET", "/login/code", "", second), http.StatusOK, `action="/login/code"`)
}

func TestLoginCode_EndsThePreviousSessionOfTheBrowser(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "admin", storeTOTPSecret)
	old := e.cookie("viewer", false)
	rec := e.form("/login", signInForm("admin", adminPW, "/"), old)
	noSession(t, rec)
	expect(t, e.do("GET", "/managed/me", "", old), http.StatusUnauthorized, "unauthenticated") // ended at the password step
	tc := ticketCookie(t, rec)

	stray := e.cookie("viewer", false) // a session this browser gained meanwhile
	rec = e.send("POST", "/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc, stray)
	expectRedirect(t, rec, "/")
	expect(t, e.do("GET", "/managed/me", "", stray), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/me", "", issuedCookie(t, rec)), http.StatusOK, "")
}

func TestLoginCode_AccountChangedBetweenThePasswordAndTheCode(t *testing.T) {
	signInAndWait := func(t *testing.T) (*managedEnv, *auditLog, *http.Cookie) {
		e, au := optionalEnv(t)
		e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		return e, au, ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	}
	refusedChanged := auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "account_changed", Msg: "sign-in refused for viewer: account changed"}
	check := func(t *testing.T, e *managedEnv, au *auditLog, rec *httptest.ResponseRecorder) {
		t.Helper()
		expectPage(t, rec, http.StatusUnauthorized, "Sign-in failed. Check the username and password.")
		noSession(t, rec)
		if !cookieEnded(rec, signinCookie) {
			t.Error("the ticket ends")
		}
		au.expect(t, refusedChanged)
		if !strings.Contains(e.log.String(), "the account changed while the code step was open") {
			t.Errorf("the refusal is logged: %s", e.log.String())
		}
	}
	t.Run("password reset", func(t *testing.T) {
		e, au, tc := signInAndWait(t)
		reset := mustHash(t, e.f.h, "reset-by-admin-1")
		e.api.store.mu.Lock()
		e.api.store.users[1].Password = reset
		e.api.store.mu.Unlock()
		check(t, e, au, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc))
	})
	t.Run("two-factor removed by an administrator", func(t *testing.T) {
		e, au, tc := signInAndWait(t)
		if _, removed, err := e.api.store.clearTOTP(context.Background(), "admin", "viewer"); err != nil || !removed {
			t.Fatalf("clear: %v %v", removed, err)
		}
		check(t, e, au, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc))
	})
	t.Run("store unavailable for a recovery code", func(t *testing.T) {
		e, au := optionalEnv(t)
		codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
		if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
			t.Fatal(err)
		}
		rec := e.form("/login/code", codeForm(formatRecoveryCode(codes[0]), "/"), tc)
		expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
		noSession(t, rec)
		au.expect(t, auditEntry{Action: "signin", Target: "viewer", Outcome: "refused", Code: "unavailable", Msg: "sign-in refused for viewer: unavailable"})
	})
}

// holdTurn takes user's sign-in turn, as a request in progress holds it, and
// returns the call that gives it back.
func holdTurn(t *testing.T, e *managedEnv, user string) func() {
	t.Helper()
	release, wait, err := e.pages.throttle.loginTurn(context.Background(), user)
	if err != nil || wait != 0 {
		t.Fatalf("take the turn: %v %v", wait, err)
	}
	return release
}

// queuedFor waits until n requests wait for user's turn behind its holder.
func queuedFor(t *testing.T, e *managedEnv, user string, n int) {
	t.Helper()
	th := e.pages.throttle
	waitFor(t, func() bool {
		th.mu.Lock()
		defer th.mu.Unlock()
		tn := th.turns[userKey(user)]
		return tn != nil && tn.refs == n+1
	}, fmt.Sprintf("%d request(s) queued for %s's turn", n, user))
}

// Two requests on one code ticket: the one queued behind the other for the
// account's turn finds the ticket ended when its turn comes, so it starts
// again at the sign-in instead of opening a second session with another code.
func TestLoginCode_ARequestQueuedOnAnEndedTicketStartsAgain(t *testing.T) {
	e, _ := optionalEnv(t)
	codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	recovery := formatRecoveryCode(codes[0])
	release := holdTurn(t, e, "viewer")
	queued := make(chan *httptest.ResponseRecorder, 1)
	go func() { queued <- e.form("/login/code", codeForm(recovery, "/"), tc) }()
	queuedFor(t, e, "viewer", 1)
	e.pages.sessions.tickets.drop(tc.Value) // the request ahead signed in, which ends the ticket
	release()
	rec := <-queued
	expectRedirect(t, rec, "/login")
	noSession(t, rec)
	if recoveryLeft(e, "viewer") != recoveryCount {
		t.Error("the queued request uses up no recovery code")
	}
}

func TestLoginCode_RefusedRequests(t *testing.T) {
	e, _ := optionalEnv(t)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	expectPage(t, e.form("/login/code", codeForm(e.nowCode(t, storeTOTPSecret), "/"), tc, "Sec-Fetch-Site", "cross-site"),
		http.StatusForbidden, "submitted from another site")
	expectPage(t, e.do("GET", "/login/code", "", tc), http.StatusOK, `action="/login/code"`) // the ticket is untouched
	expectPage(t, e.form("/login/code", url.Values{"code": {strings.Repeat("9", maxBodyBytes)}}, tc), http.StatusBadRequest, "could not be read")
	expectPage(t, e.form("/login/two-factor", confirmForm("123456", "/"), tc, "Sec-Fetch-Site", "cross-site"),
		http.StatusForbidden, "submitted from another site")
	expectPage(t, e.form("/login/two-factor", url.Values{"step": {"nope"}}, tc), http.StatusBadRequest, "could not be read")
}

// ----- enrolling with a ticket -------------------------------------------------------------

func TestEnrol_WithATicketOpensTheSessionOnlyAfterTheFirstCode(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
	au := e.withAudit(t, auditSettings{})
	other := e.cookie("viewer", false) // another browser's session
	rec := e.form("/login", signInForm("viewer", viewerPW, "/"), nil)
	expectRedirect(t, rec, "/login/two-factor")
	tc := ticketCookie(t, rec)
	noSession(t, rec)
	expectRedirect(t, e.do("GET", "/login/two-factor", "", nil), "/login")

	page := e.do("GET", "/login/two-factor", "", tc)
	expectPage(t, page, http.StatusOK, `name="step" value="confirm"`)
	for _, want := range []string{"<svg", `role="img"`, `aria-label="QR code for your authenticator app"`} {
		if !strings.Contains(page.Body.String(), want) {
			t.Errorf("the enrol page lacks %q", want)
		}
	}
	for _, banned := range []string{"<script", "<img"} {
		if strings.Contains(page.Body.String(), banned) {
			t.Errorf("the page content policy forbids %q", banned)
		}
	}
	secret := pageSecret(t, page)
	if isEnrolled(e, "viewer") {
		t.Fatal("nothing is stored before the first code")
	}

	// A wrong code keeps the secret on the page and stores nothing.
	rec = e.form("/login/two-factor", confirmForm("000000", "/"), tc)
	expectPage(t, rec, http.StatusUnauthorized, "The code is not correct.")
	if pageSecret(t, rec) != secret || isEnrolled(e, "viewer") {
		t.Error("a wrong code keeps the same secret and stores nothing")
	}
	noSession(t, rec)

	code := e.nowCode(t, secret)
	rec = e.form("/login/two-factor", confirmForm(code, "/"), tc)
	expectPage(t, rec, http.StatusOK, `id="recovery-codes"`)
	expectPage(t, rec, http.StatusOK, `id="two-factor-continue"`)
	expectPage(t, rec, http.StatusOK, `href="/"`)
	codes := pageCodes(t, rec)
	c := issuedCookie(t, rec)
	if !cookieEnded(rec, signinCookie) {
		t.Error("the ticket ends")
	}
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", other), http.StatusUnauthorized, "unauthenticated") // the other session ended

	u, _ := e.api.store.findUser("viewer")
	if u.TOTP == nil || u.TOTP.Secret != secret || !slices.Equal(u.TOTP.Recovery, hashRecoveryCodes(codes)) {
		t.Fatalf("the stored secret and recovery hashes are those of the page: %+v", u.TOTP)
	}
	seq, _ := e.api.store.seqs()
	au.expect(t,
		auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "refused", Code: "bad_code", Msg: "viewer could not set up two-factor sign-in: bad code"},
		auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "ok", Msg: "viewer set up two-factor sign-in",
			Wrote: []auditWrote{{File: filepath.Base(e.f.usersPath), Seq: int64(seq)}}},
		auditEntry{Actor: "viewer", Action: "signin", Target: "viewer", Outcome: "ok", Msg: "viewer signed in"},
	)

	// The code that confirmed cannot also sign in; the next one can.
	tc = ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	expectPage(t, e.form("/login/code", codeForm(code, "/"), tc), http.StatusUnauthorized, "The code is not correct.")
	e.clock.advance(totpPeriod)
	expectRedirect(t, e.form("/login/code", codeForm(e.nowCode(t, secret), "/"), tc), "/")
	secrets := []string{secret, code}
	for _, c := range codes {
		secrets = append(secrets, c, strings.ReplaceAll(c, "-", ""))
	}
	e.expectNoSecrets(t, au, secrets...)
}

func TestEnrol_ForcedPasswordChangeAndNextFollow(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorAdmins })
	e.api.store.users[0].MustChangePassword = true
	rec := e.form("/login", signInForm("admin", adminPW, "/solAdmin"), nil)
	expectRedirect(t, rec, "/login/two-factor?next=%2FsolAdmin")
	tc := ticketCookie(t, rec)
	secret := pageSecret(t, e.do("GET", "/login/two-factor?next=/solAdmin", "", tc))
	rec = e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/solAdmin"), tc)
	expectPage(t, rec, http.StatusOK, `href="/login/password?next=%2FsolAdmin"`)
	expectPage(t, e.do("GET", "/login/password", "", issuedCookie(t, rec)), http.StatusOK, "You must set a new password")
}

func TestEnrol_ARaceNeverReplacesAnExistingSecretOrOpensASession(t *testing.T) {
	mandatory := func(t *testing.T) (*managedEnv, *auditLog, *http.Cookie, string) {
		e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
		au := e.withAudit(t, auditSettings{})
		tc, secret := beginEnrol(t, e, "viewer", viewerPW)
		return e, au, tc, secret
	}
	refused := func(code, msg string) auditEntry {
		return auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "refused", Code: code, Msg: "viewer could not set up two-factor sign-in: " + msg}
	}
	t.Run("enrolled elsewhere meanwhile", func(t *testing.T) {
		e, au, tc, secret := mandatory(t)
		e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		rec := e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc)
		expectPage(t, rec, http.StatusConflict, "Your account was changed")
		noSession(t, rec)
		if s, _ := e.api.store.totpSecret("viewer"); s != storeTOTPSecret {
			t.Error("an enrol ticket must not replace a secret that exists")
		}
		au.expect(t, refused("account_changed", "account changed"))
		expectRedirect(t, e.do("GET", "/login/two-factor", "", tc), "/login") // the ticket ended
	})
	t.Run("password reset meanwhile", func(t *testing.T) {
		e, au, tc, secret := mandatory(t)
		reset := mustHash(t, e.f.h, "reset-by-admin-1")
		e.api.store.mu.Lock()
		e.api.store.users[1].Password = reset
		e.api.store.mu.Unlock()
		rec := e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc)
		expectPage(t, rec, http.StatusConflict, "Sign in again")
		noSession(t, rec)
		if isEnrolled(e, "viewer") {
			t.Error("nothing is stored over a reset")
		}
		au.expect(t, refused("account_changed", "account changed"))
	})
	t.Run("user deleted meanwhile", func(t *testing.T) {
		e, au, tc, secret := mandatory(t)
		e.api.store.mu.Lock()
		e.api.store.users = e.api.store.users[:1]
		e.api.store.mu.Unlock()
		rec := e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc)
		expectPage(t, rec, http.StatusConflict, "Sign in again")
		noSession(t, rec)
		au.expect(t, refused("account_changed", "account changed"))
	})
	t.Run("audit log unavailable", func(t *testing.T) {
		e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
		e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
		a, _ := e.withLoudAudit(t)
		_ = a.f.Close()
		e.api.audit.record(auditAdmin, auditEntry{Actor: "admin", Action: auditUserCreate, Outcome: auditOK, Msg: "admin created user x"}) // the lost record
		tc, secret := beginEnrol(t, e, "viewer", viewerPW)
		rec := e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc)
		expectPage(t, rec, http.StatusServiceUnavailable, "cannot record changes")
		noSession(t, rec)
		if isEnrolled(e, "viewer") {
			t.Error("a refused change stores nothing")
		}
	})
	t.Run("store file changed on disk", func(t *testing.T) {
		e, au, tc, secret := mandatory(t)
		if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
			t.Fatal(err)
		}
		rec := e.form("/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc)
		expectPage(t, rec, http.StatusConflict, "restart the gateway")
		noSession(t, rec)
		au.expect(t, refused("store_changed_on_disk", "store changed on disk"))
	})
}

// A browser that went away before the change began is not answered or audited.
func TestEnrol_ClientGoneIsNotAudited(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
	au := e.withAudit(t, auditSettings{})
	tc, secret := beginEnrol(t, e, "viewer", viewerPW)
	release := holdWriter(t, e.api.store.wr)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan *httptest.ResponseRecorder)
	code := e.nowCode(t, secret)
	go func() { done <- e.formFrom(ctx, "192.0.2.10:5000", "/login/two-factor", confirmForm(code, "/"), tc) }()
	waitForWaiters(t, e.api.store.wr, 1)
	cancel()
	rec := <-done
	release()
	if rec.Body.Len() != 0 || len(au.entries(t)) != 0 {
		t.Errorf("nothing to answer and nothing to audit: %d %q %+v", rec.Code, rec.Body.String(), au.entries(t))
	}
	if isEnrolled(e, "viewer") {
		t.Error("nothing may be stored")
	}
}

// A confirm queued behind another on the same enrol ticket finds the ticket
// ended when its turn comes: it starts again at the sign-in and stores
// nothing.
func TestEnrol_AConfirmQueuedOnAnEndedTicketStartsAgain(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	code := e.nowCode(t, pageSecret(t, e.do("GET", "/login/two-factor", "", tc)))
	release := holdTurn(t, e, "viewer")
	queued := make(chan *httptest.ResponseRecorder, 1)
	go func() { queued <- e.form("/login/two-factor", confirmForm(code, "/"), tc) }()
	queuedFor(t, e, "viewer", 1)
	e.pages.sessions.tickets.drop(tc.Value) // the request ahead confirmed, which ends the ticket
	release()
	rec := <-queued
	expectRedirect(t, rec, "/login")
	noSession(t, rec)
	if isEnrolled(e, "viewer") {
		t.Error("the queued confirm stores nothing")
	}
}

func TestEnrol_QRCodeThatCannotBeDrawnLeavesTheKey(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
	id := e.api.sessions.tickets.create(ticket{user: strings.Repeat("u", 5000), stage: stageEnrol, secret: newTOTPSecret()})
	rec := e.do("GET", "/login/two-factor", "", &http.Cookie{Name: signinCookie, Value: id})
	expectPage(t, rec, http.StatusOK, "The picture could not be drawn")
	if strings.Contains(rec.Body.String(), "<svg") || !strings.Contains(rec.Body.String(), `id="two-factor-secret"`) {
		t.Error("the key is shown to type, with no picture")
	}
	if !strings.Contains(e.log.String(), "QR code could not be drawn") {
		t.Errorf("the failure is logged: %s", e.log.String())
	}
}

func TestTwoFactorRefusal(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"account changed", errAccountChanged, http.StatusConflict, "account_changed"},
		{"user gone", errUserNotFound, http.StatusConflict, "account_changed"},
		{"audit unavailable", fmt.Errorf("wrapped: %w", errAuditUnavailable), http.StatusServiceUnavailable, "audit_unavailable"},
		{"changed on disk", &changedOnDiskError{}, http.StatusConflict, "store_changed_on_disk"},
		{"write failed", &writeFailedError{err: errors.New("disk full")}, http.StatusInternalServerError, "store_write_failed"},
		{"anything else", errors.New("boom"), http.StatusInternalServerError, "server_error"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, code, msg := twoFactorRefusal(c.err)
			if status != c.status || code != c.code || msg == "" || strings.Contains(msg, "disk full") || strings.Contains(msg, "boom") {
				t.Errorf("got %d %q %q", status, code, msg)
			}
		})
	}
}

// ----- setting up while signed in ----------------------------------------------------------

func TestSetupPage_ByStateAndMode(t *testing.T) {
	e, _ := optionalEnv(t)
	c := e.cookie("viewer", false)
	page := e.do("GET", "/login/two-factor", "", c)
	expectPage(t, page, http.StatusOK, `name="step" value="verify"`)
	if strings.Contains(page.Body.String(), `name="code"`) {
		t.Error("a user without two-factor is not asked for a code")
	}
	e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	expectPage(t, e.do("GET", "/login/two-factor", "", c), http.StatusOK, `name="code"`)

	expectRedirect(t, e.do("GET", "/login/two-factor?next=/solAdmin", "", nil), "/login?next=%2FsolAdmin")
	expectRedirect(t, e.do("GET", "/login/two-factor", "", e.cookie("viewer", true)), "/login")
	expectRedirect(t, e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), nil), "/login")
	expectRedirect(t, e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), e.cookie("viewer", true)), "/login")

	// A code ticket is not an enrol ticket.
	tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
	expectRedirect(t, e.do("GET", "/login/two-factor", "", tc), "/login")
}

// ticket2 is a setup ticket for user, as the verify step creates.
func ticket2(e *managedEnv, user string) ticket {
	return ticket{user: user, stage: stageSetup, hash: storedHash(e.api.store, user), secret: newTOTPSecret()}
}

func TestSetupVerify_RefusalsStoreNothingAndOpenNothing(t *testing.T) {
	e, au := optionalEnv(t)
	codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	c := e.cookie("viewer", false)
	seq0, _ := e.api.store.seqs()
	const msg = "The password or the code is not correct."
	for name, form := range map[string]url.Values{
		"wrong password, right recovery code": verifyForm("not-the-password", formatRecoveryCode(codes[0]), "/"),
		"right password, wrong code":          verifyForm(viewerPW, "000000", "/"),
		"right password, no code":             verifyForm(viewerPW, "", "/"),
	} {
		t.Run(name, func(t *testing.T) {
			rec := e.form("/login/two-factor", form, c)
			expectPage(t, rec, http.StatusUnauthorized, msg)
			if len(rec.Result().Cookies()) != 0 {
				t.Errorf("no ticket is issued: %v", rec.Header())
			}
		})
	}
	if seq, _ := e.api.store.seqs(); seq != seq0 || recoveryLeft(e, "viewer") != recoveryCount {
		t.Error("a refused verify writes nothing and keeps every recovery code")
	}
	bad := auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "refused", Code: "bad_credentials", Msg: "viewer could not set up two-factor sign-in: bad credentials"}
	entries := au.entries(t)
	if len(entries) != 3 {
		t.Fatalf("one refused entry per attempt: %+v", entries)
	}
	for _, en := range entries {
		bad.Time, bad.Client = en.Time, en.Client
		if !reflect.DeepEqual(en, bad) {
			t.Errorf("audit entry: got %+v want %+v", en, bad)
		}
	}
	// Without two-factor there is no code to give, and a wrong password still fails.
	expectPage(t, e.form("/login/two-factor", verifyForm("not-the-password", "", "/"), e.cookie("admin", false)), http.StatusUnauthorized, msg)
}

// A set-up's verify step queued behind another request of the same user
// reads the account under the turn: a set-up that finished meanwhile makes the
// current code required, so the password alone no longer starts another.
func TestSetup_VerifyQueuedBehindAFinishedSetupNeedsTheCode(t *testing.T) {
	e, _ := optionalEnv(t)
	c := e.cookie("viewer", false)
	release := holdTurn(t, e, "viewer")
	queued := make(chan *httptest.ResponseRecorder, 1)
	go func() { queued <- e.send("POST", "/login/two-factor", verifyForm(viewerPW, "", "/"), c) }()
	queuedFor(t, e, "viewer", 1)
	e.enrolWithCodes(t, "viewer", storeTOTPSecret) // the request ahead set two-factor up
	release()
	expectPage(t, <-queued, http.StatusUnauthorized, "The password or the code is not correct.")
}

func TestSetup_ReplacesTheSecretAndTheRecoveryCodes(t *testing.T) {
	e, au := optionalEnv(t)
	old := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
	c, other := e.cookie("viewer", false), e.cookie("viewer", false)
	rev0 := e.userRev("viewer")

	rec := e.send("POST", "/login/two-factor", verifyForm(viewerPW, e.nowCode(t, storeTOTPSecret), "/"), c)
	expectPage(t, rec, http.StatusOK, `name="step" value="confirm"`)
	tc := ticketCookie(t, rec)
	secret := pageSecret(t, rec)
	if secret == storeTOTPSecret {
		t.Fatal("a new secret is made")
	}
	if s, _ := e.api.store.totpSecret("viewer"); s != storeTOTPSecret {
		t.Fatal("nothing is replaced before the first code")
	}

	expectPage(t, e.send("POST", "/login/two-factor", confirmForm("000000", "/"), c, tc), http.StatusUnauthorized, "The code is not correct.")
	if s, _ := e.api.store.totpSecret("viewer"); s != storeTOTPSecret {
		t.Fatal("a wrong code replaces nothing")
	}

	// The code the verify step spent belongs to the old secret: the new one's first code works in the same step.
	rec = e.send("POST", "/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), c, tc)
	expectPage(t, rec, http.StatusOK, `id="recovery-codes"`)
	codes := pageCodes(t, rec)
	noSession(t, rec)
	expect(t, e.do("GET", "/managed/me", "", c), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/me", "", other), http.StatusUnauthorized, "unauthenticated")
	u, _ := e.api.store.findUser("viewer")
	if u.TOTP == nil || u.TOTP.Secret != secret || !slices.Equal(u.TOTP.Recovery, hashRecoveryCodes(codes)) {
		t.Fatalf("the new secret and codes are stored: %+v", u.TOTP)
	}
	for _, oc := range old {
		if recoveryIndex(u.TOTP.Recovery, hashRecoveryCode(oc)) >= 0 {
			t.Error("an old recovery code must stop working")
		}
	}
	if e.userRev("viewer") != rev0 {
		t.Error("setting up again keeps the rev")
	}
	seq, _ := e.api.store.seqs()
	au.expect(t,
		auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "refused", Code: "bad_code", Msg: "viewer could not set up two-factor sign-in: bad code"},
		auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "ok", Msg: "viewer set up two-factor sign-in again",
			Wrote: []auditWrote{{File: filepath.Base(e.f.usersPath), Seq: int64(seq)}}},
	)
	e.expectNoSecrets(t, au, secret, storeTOTPSecret, codes[0], old[0])
}

func TestSetup_FirstTimeFromASessionAndWithARecoveryCode(t *testing.T) {
	e, au := optionalEnv(t)
	c := e.cookie("viewer", false)
	rev0 := e.userRev("viewer")
	rec := e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), c)
	expectPage(t, rec, http.StatusOK, `name="step" value="confirm"`)
	secret := pageSecret(t, rec)
	rec = e.send("POST", "/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), c, ticketCookie(t, rec))
	expectPage(t, rec, http.StatusOK, `id="recovery-codes"`)
	if e.userRev("viewer") == rev0 {
		t.Error("the first set-up moves the rev")
	}
	seq, _ := e.api.store.seqs()
	au.expect(t, auditEntry{Actor: "viewer", Action: "twofactor.enrol", Target: "viewer", Outcome: "ok", Msg: "viewer set up two-factor sign-in",
		Wrote: []auditWrote{{File: filepath.Base(e.f.usersPath), Seq: int64(seq)}}})

	// Now enrolled: a recovery code stands in for the current code, and is spent.
	codes := pageCodes(t, rec)
	rec = e.form("/login/two-factor", verifyForm(viewerPW, strings.ToLower(codes[0]), "/"), c)
	expectPage(t, rec, http.StatusOK, `name="step" value="confirm"`)
	if recoveryLeft(e, "viewer") != recoveryCount-1 {
		t.Errorf("the recovery code is used up: %d left", recoveryLeft(e, "viewer"))
	}
}

func TestSetupConfirm_BelongsToTheSignedInBrowserThatAsked(t *testing.T) {
	e, _ := optionalEnv(t)
	post := func(tk ticket, cookies ...*http.Cookie) (*httptest.ResponseRecorder, *http.Cookie) {
		tc := &http.Cookie{Name: signinCookie, Value: e.api.sessions.tickets.create(tk)}
		return e.send("POST", "/login/two-factor", confirmForm(e.nowCode(t, tk.secret), "/"), append(cookies, tc)...), tc
	}
	for name, cookies := range map[string][]*http.Cookie{
		"no session":              nil,
		"another user's session":  {e.cookie("admin", false)},
		"a forced-change session": {e.cookie("viewer", true)},
	} {
		t.Run(name, func(t *testing.T) {
			rec, tc := post(ticket2(e, "viewer"), cookies...)
			expectRedirect(t, rec, "/login")
			if _, ok := e.api.sessions.tickets.lookup(tc.Value); ok || isEnrolled(e, "viewer") {
				t.Error("the ticket ends and nothing is stored")
			}
		})
	}
	// A code ticket is no set-up ticket either.
	rec, _ := post(ticket{user: "viewer", stage: stageCode, hash: storedHash(e.api.store, "viewer")}, e.cookie("viewer", false))
	expectRedirect(t, rec, "/login")
}

func TestTwoFactorSteps_ThrottledLikeAPassword(t *testing.T) {
	newEnv := func(t *testing.T) (*managedEnv, *auditLog) {
		e := newManagedEnv(t, func(c *config) {
			c.twoFactor = twoFactorOptional
			c.login = testLoginLimits
			c.login.unauthPerMinute = 1000
		})
		return e, e.withAudit(t, auditSettings{})
	}
	blocked := func(t *testing.T, au *auditLog, rec *httptest.ResponseRecorder) {
		t.Helper()
		expectPage(t, rec, http.StatusTooManyRequests, "Too many attempts. Try again in 30 seconds.")
		if rec.Header().Get("Retry-After") != "30" {
			t.Errorf("Retry-After: got %q", rec.Header().Get("Retry-After"))
		}
		var found bool
		for _, en := range au.entries(t) {
			found = found || (en.Action == "twofactor.enrol" && en.Code == "throttled")
		}
		if !found {
			t.Errorf("the blocked attempt is audited: %+v", au.entries(t))
		}
	}
	t.Run("verify", func(t *testing.T) {
		e, au := newEnv(t)
		c := e.cookie("viewer", false)
		for range testLoginLimits.maxFailures {
			expectPage(t, e.form("/login/two-factor", verifyForm("not-the-password", "", "/"), c), http.StatusUnauthorized, "not correct")
		}
		rec := e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), c)
		blocked(t, au, rec)
		if len(rec.Result().Cookies()) != 0 {
			t.Error("a blocked verify issues no ticket")
		}
		e.clock.advance(testLoginLimits.backoff)
		expectPage(t, e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), c), http.StatusOK, `name="step" value="confirm"`)
	})
	t.Run("confirm", func(t *testing.T) {
		e, au := newEnv(t)
		c := e.cookie("viewer", false)
		rec := e.form("/login/two-factor", verifyForm(viewerPW, "", "/"), c)
		secret, tc := pageSecret(t, rec), ticketCookie(t, rec)
		for range testLoginLimits.maxFailures {
			expectPage(t, e.send("POST", "/login/two-factor", confirmForm("000000", "/"), c, tc), http.StatusUnauthorized, "not correct")
		}
		rec = e.send("POST", "/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), c, tc)
		blocked(t, au, rec)
		if pageSecret(t, rec) != secret || isEnrolled(e, "viewer") {
			t.Error("a blocked confirm shows the same secret and stores nothing")
		}
	})
}

// A check that cannot run (the client left while queued, or the hash slots are
// busy) is a 503 on each step, and nothing is stored or opened.
func TestTwoFactorSteps_CheckUnavailableIs503(t *testing.T) {
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	post := func(e *managedEnv, ctx context.Context, path string, v url.Values, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest("POST", "https://gw.example"+path, strings.NewReader(v.Encode())).WithContext(ctx)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.RemoteAddr = "192.0.2.10:5000"
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		e.root.ServeHTTP(rec, req)
		return rec
	}
	t.Run("queued behind another sign-in of the account", func(t *testing.T) {
		e, au := optionalEnv(t)
		e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		tc := ticketCookie(t, e.form("/login", signInForm("viewer", viewerPW, "/"), nil))
		release, wait, err := e.pages.throttle.loginTurn(context.Background(), "viewer")
		if err != nil || wait != 0 {
			t.Fatalf("take the turn: %v %v", wait, err)
		}
		defer release()
		c := e.cookie("viewer", false)
		setupTicket := &http.Cookie{Name: signinCookie, Value: e.api.sessions.tickets.create(ticket2(e, "viewer"))}
		for _, rec := range []*httptest.ResponseRecorder{
			post(e, gone, "/login/code", codeForm("123456", "/"), tc),
			post(e, gone, "/login/two-factor", verifyForm(viewerPW, "123456", "/"), c),
			post(e, gone, "/login/two-factor", confirmForm("123456", "/"), c, setupTicket),
		} {
			expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
			noSession(t, rec)
		}
		var codes []string
		for _, en := range au.entries(t) {
			codes = append(codes, en.Action+":"+en.Code)
		}
		if want := []string{"signin:unavailable", "twofactor.enrol:unavailable", "twofactor.enrol:unavailable"}; !slices.Equal(codes, want) {
			t.Errorf("audit: got %v want %v", codes, want)
		}
	})
	t.Run("password check cannot run", func(t *testing.T) {
		e, _ := optionalEnv(t)
		c := e.cookie("viewer", false)
		e.api.store.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
		e.api.store.hasher.slots <- struct{}{}                                      // every slot busy...
		rec := post(e, gone, "/login/two-factor", verifyForm(viewerPW, "", "/"), c) // ...and the client gone
		expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
	})
	t.Run("store cannot spend the recovery code", func(t *testing.T) {
		e, _ := optionalEnv(t)
		codes := e.enrolWithCodes(t, "viewer", storeTOTPSecret)
		if err := os.WriteFile(e.f.usersPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
			t.Fatal(err)
		}
		rec := e.form("/login/two-factor", verifyForm(viewerPW, formatRecoveryCode(codes[0]), "/"), e.cookie("viewer", false))
		expectPage(t, rec, http.StatusServiceUnavailable, "could not be checked")
		if len(rec.Result().Cookies()) != 0 {
			t.Error("no ticket is issued")
		}
	})
}

func TestEnrol_EndsAnotherSessionLeftInTheBrowser(t *testing.T) {
	e := newManagedEnv(t, func(c *config) { c.twoFactor = twoFactorMandatory })
	tc, secret := beginEnrol(t, e, "viewer", viewerPW)
	stray := e.cookie("admin", false) // a session this browser gained meanwhile
	rec := e.send("POST", "/login/two-factor", confirmForm(e.nowCode(t, secret), "/"), tc, stray)
	expectPage(t, rec, http.StatusOK, `id="recovery-codes"`)
	expect(t, e.do("GET", "/managed/me", "", stray), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/me", "", issuedCookie(t, rec)), http.StatusOK, "")
}
