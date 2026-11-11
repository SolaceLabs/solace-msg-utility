package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"sync"
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
}

// The same race on the password page: the administrator's reset stands and
// the user is told to sign in again.
func TestPasswordChange_AccountChangedDuringTheCheckIs409(t *testing.T) {
	e := newManagedEnv(t, nil)
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
