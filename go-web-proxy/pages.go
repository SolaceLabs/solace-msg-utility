package main

import (
	"embed"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"strconv"
	"sync"
	"time"
)

// pageFiles holds the sign-in page template: plain HTML, inline CSS, no
// script, so the gateway can serve it with a CSP that allows nothing else.
//
//go:embed pages/login.html
var pageFiles embed.FS

const pageCSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"

// pageData feeds pages/login.html. Mode picks the form: "login", "password"
// or "message" (a title and an error, nothing to submit).
type pageData struct {
	Mode, Title, Error, Next string
	Required                 bool
	MinLen, MaxLen           int
}

// authPages serves the gateway's own pages, /login and /login/password, and
// gates the app bundles on the session they create.
type authPages struct {
	store    *store
	sessions *sessions
	throttle *throttle
	live     *live
	cop      *http.CrossOriginProtection
	logger   *slog.Logger
	tmpl     *template.Template
	watch    *clientWatch // warns when every recent sign-in looks like one client
}

func newAuthPages(st *store, ss *sessions, th *throttle, lv *live, logger *slog.Logger) (*authPages, error) {
	tmpl, err := template.ParseFS(pageFiles, "pages/login.html")
	if err != nil {
		return nil, err
	}
	return &authPages{
		store: st, sessions: ss, throttle: th, live: lv, cop: http.NewCrossOriginProtection(), logger: logger, tmpl: tmpl,
		watch: newClientWatch(sameClientWindow),
	}, nil
}

// safeNext keeps the post-sign-in redirect on one of the two app entry points,
// so /login can never be used to bounce a user to another site.
func safeNext(next string) string {
	if next == adminPath {
		return adminPath
	}
	return "/"
}

func loginURL(next string) string    { return withNext("/login", next) }
func passwordURL(next string) string { return withNext("/login/password", next) }

func withNext(base, next string) string {
	if next == "/" {
		return base
	}
	return base + "?next=" + url.QueryEscape(next)
}

func (p *authPages) render(w http.ResponseWriter, status int, d pageData) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Security-Policy", pageCSP)
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	d.MinLen, d.MaxLen = passwordMinLen, passwordMaxLen
	w.WriteHeader(status)
	if err := p.tmpl.Execute(w, d); err != nil {
		p.logger.Error("sign-in page render failed", "err", err)
	}
}

func (p *authPages) message(w http.ResponseWriter, status int, title, msg string) {
	p.render(w, status, pageData{Mode: "message", Title: title, Error: msg})
}

// allowAnon charges a request without a session to the client's budget. On
// false the 429 page has been written.
func (p *authPages) allowAnon(w http.ResponseWriter, r *http.Request) bool {
	client, ok := clientOf(r)
	allowed, wait := p.throttle.allowUnauthenticated(client, ok)
	if !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
		p.message(w, http.StatusTooManyRequests, "Too many requests", "Too many requests from this address. Wait a minute and try again.")
	}
	return allowed
}

// readForm parses a POSTed form within the body cap and the cross-origin
// check. On false the response has been written.
func (p *authPages) readForm(w http.ResponseWriter, r *http.Request) bool {
	if err := p.cop.Check(r); err != nil {
		p.message(w, http.StatusForbidden, "Request refused", "This form was submitted from another site.")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := r.ParseForm(); err != nil {
		p.message(w, http.StatusBadRequest, "Request refused", "The form could not be read.")
		return false
	}
	return true
}

func throttledText(wait time.Duration) string {
	return "Too many attempts. Try again in " + strconv.Itoa(retrySeconds(wait)) + " seconds."
}

func (p *authPages) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var post bool
	switch r.Method {
	case http.MethodGet, http.MethodHead:
	case http.MethodPost:
		post = true
	default:
		w.Header().Set("Allow", "GET, HEAD, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	as, signedIn := p.sessions.fromRequest(r)
	if signedIn {
		setRequestUser(r, as.user)
	} else if !p.allowAnon(w, r) {
		return
	}
	switch {
	case r.URL.Path == "/login" && post:
		p.submitLogin(w, r, as, signedIn)
	case r.URL.Path == "/login":
		p.showLogin(w, r, as, signedIn)
	case r.URL.Path == "/login/password" && post:
		p.submitPassword(w, r, as, signedIn)
	case r.URL.Path == "/login/password":
		p.showPassword(w, r, as, signedIn)
	default:
		http.NotFound(w, r)
	}
}

func (p *authPages) showLogin(w http.ResponseWriter, r *http.Request, as activeSession, signedIn bool) {
	next := safeNext(r.URL.Query().Get("next"))
	switch {
	case signedIn && as.mustChange:
		http.Redirect(w, r, passwordURL(next), http.StatusSeeOther)
	case signedIn:
		http.Redirect(w, r, next, http.StatusSeeOther)
	default:
		p.render(w, http.StatusOK, pageData{Mode: "login", Title: "Sign in", Next: next})
	}
}

// checkTurn takes user's sign-in turn (throttle.loginTurn), then asks the
// throttle whether the attempt may go ahead. On wait > 0 or err the turn has
// been given back and the caller answers 429 or 503; otherwise the caller
// calls release once the attempt is recorded.
func (p *authPages) checkTurn(r *http.Request, user string, client netip.Addr, resolved bool) (release func(), wait time.Duration, err error) {
	release, wait, err = p.throttle.loginTurn(r.Context(), user)
	if err != nil || wait > 0 {
		return nil, wait, err
	}
	if wait = p.throttle.loginWait(user, client, resolved); wait > 0 {
		release()
		return nil, wait, nil
	}
	return release, 0, nil
}

// startSession creates the session for a sign-in whose password matched the
// record check saw, but only while that record still stands
// (store.ifUnchanged): a reset, deletion or import that landed during the
// hash either came first, and this refuses, or waits for the store lock and
// its dropUser then ends the new session. ok is false when the account
// changed.
func (p *authPages) startSession(user string, check passwordCheck) (id string, ok bool) {
	ok = p.store.ifUnchanged(user, check.hash, func() {
		id = p.sessions.create(user, check.mustChange)
	})
	return id, ok
}

// submitLogin checks a sign-in. Every failure gets the same message and
// status whatever went wrong; the throttle refuses a blocked user or client
// before the password is looked at, and sign-ins for one account are checked
// one at a time. A previous session in this browser ends.
func (p *authPages) submitLogin(w http.ResponseWriter, r *http.Request, prior activeSession, hadSession bool) {
	if !p.readForm(w, r) {
		return
	}
	next := safeNext(r.PostFormValue("next"))
	user, pw := r.PostFormValue("username"), r.PostFormValue("password")
	page := pageData{Mode: "login", Title: "Sign in", Next: next}
	client, resolved := clientOf(r)
	log := clientLogger(p.logger, r).With("user", userKey(user))
	unavailable := func(err error) {
		log.Error("sign-in check failed", "err", err)
		p.message(w, http.StatusServiceUnavailable, "Sign-in unavailable", "Sign-in could not be checked. Try again.")
	}
	refused := func() {
		page.Error = "Sign-in failed. Check the username and password."
		p.render(w, http.StatusUnauthorized, page)
	}
	release, wait, err := p.checkTurn(r, user, client, resolved)
	switch {
	case err != nil:
		unavailable(err)
		return
	case wait > 0:
		w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
		page.Error = throttledText(wait)
		p.render(w, http.StatusTooManyRequests, page)
		return
	}
	defer release()
	check, err := p.store.verifyPassword(r.Context(), user, pw)
	if err != nil {
		unavailable(err)
		return
	}
	if !check.ok {
		p.throttle.loginFailed(user, client, resolved)
		log.Warn("sign-in failed")
		refused()
		return
	}
	id, ok := p.startSession(user, check)
	if !ok {
		log.Warn("sign-in refused: the account changed while its password was checked")
		refused()
		return
	}
	p.throttle.loginSucceeded(user, client, resolved)
	if hadSession {
		p.sessions.drop(prior.id)
	}
	setSessionCookie(w, id)
	setRequestUser(r, user)
	log.Info("signed in")
	if p.watch.seen(client, resolved) {
		log.Warn("every recent sign-in came from this one private address: a reverse proxy or Docker's userland proxy the gateway does not trust is likely in front of it, so all users share one throttle and one access-list entry; list the proxy in access.trustedProxies (config.yaml), see docs/deployment.md",
			"sign_ins", len(p.watch.recent))
	}
	if check.mustChange {
		http.Redirect(w, r, passwordURL(next), http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, next, http.StatusSeeOther)
}

func (p *authPages) showPassword(w http.ResponseWriter, r *http.Request, as activeSession, signedIn bool) {
	next := safeNext(r.URL.Query().Get("next"))
	if !signedIn {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	p.render(w, http.StatusOK, pageData{Mode: "password", Title: "Change password", Next: next, Required: as.mustChange})
}

// submitPassword is a signed-in user changing their own password. A wrong
// current password counts as a failed sign-in, under the same one-at-a-time
// turn. The new hash is stored only while the record is the one the current
// password was checked against, and this browser's fresh session is created
// in the same store write; then every other session of the user ends.
func (p *authPages) submitPassword(w http.ResponseWriter, r *http.Request, as activeSession, signedIn bool) {
	if !p.readForm(w, r) {
		return
	}
	next := safeNext(r.PostFormValue("next"))
	if !signedIn {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	cur, nw, confirm := r.PostFormValue("current"), r.PostFormValue("new"), r.PostFormValue("confirm")
	page := pageData{Mode: "password", Title: "Change password", Next: next, Required: as.mustChange}
	fail := func(status int, msg string) {
		page.Error = msg
		p.render(w, status, page)
	}
	client, resolved := clientOf(r)
	log := requestLogger(p.logger, r)
	unavailable := func(err error) {
		log.Error("password check failed", "err", err)
		fail(http.StatusServiceUnavailable, "The password could not be checked. Try again.")
	}
	release, wait, err := p.checkTurn(r, as.user, client, resolved)
	switch {
	case err != nil:
		unavailable(err)
		return
	case wait > 0:
		w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
		fail(http.StatusTooManyRequests, throttledText(wait))
		return
	}
	defer release()
	check, err := p.store.verifyPassword(r.Context(), as.user, cur)
	switch {
	case err != nil:
		unavailable(err)
		return
	case !check.ok:
		p.throttle.loginFailed(as.user, client, resolved)
		log.Warn("password change refused: the current password is not correct")
		fail(http.StatusUnauthorized, "The current password is not correct.")
		return
	case nw != confirm:
		fail(http.StatusUnprocessableEntity, "The new passwords do not match.")
		return
	case checkPasswordPolicy(nw) != nil:
		fail(http.StatusUnprocessableEntity, "The new password must be "+strconv.Itoa(passwordMinLen)+" to "+strconv.Itoa(passwordMaxLen)+" characters.")
		return
	case nw == cur:
		fail(http.StatusUnprocessableEntity, "The new password must differ from the current one.")
		return
	}
	var id string
	err = p.store.setPassword(r.Context(), as.user, nw, check.hash, func() { id = p.sessions.create(as.user, false) })
	switch {
	case errors.Is(err, errAccountChanged), errors.Is(err, errUserNotFound):
		log.Warn("password change refused: the account changed while its password was checked")
		p.message(w, http.StatusConflict, "Password not changed", "Your account was changed while this request ran. Sign in again.")
		return
	case err != nil:
		log.Error("password change failed", "err", err)
		fail(http.StatusInternalServerError, "The password could not be saved.")
		return
	}
	p.throttle.loginSucceeded(as.user, client, resolved)
	p.sessions.dropOthers(as.user, id)
	setSessionCookie(w, id)
	log.Info("password changed")
	http.Redirect(w, r, next, http.StatusSeeOther)
}

// gateApp guards the PWA while connModes is provisioned (read live, so a settings
// save applies to the next request): nothing of the app reaches a client
// without a session. Navigations are sent to the sign-in (or the
// forced password change); asset requests get a bare 401.
func (p *authPages) gateApp(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if p.live.get().connModes != connProvisioned {
			next.ServeHTTP(w, r)
			return
		}
		as, ok := p.sessions.fromRequest(r)
		if ok {
			setRequestUser(r, as.user)
		}
		if ok && !as.mustChange {
			next.ServeHTTP(w, r)
			return
		}
		if !ok && !p.allowAnon(w, r) {
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		switch {
		case hasExt(path.Clean(r.URL.Path)):
			w.WriteHeader(http.StatusUnauthorized)
		case ok:
			http.Redirect(w, r, passwordURL("/"), http.StatusSeeOther)
		default:
			http.Redirect(w, r, loginURL("/"), http.StatusSeeOther)
		}
	})
}

// gateAdmin guards /solAdmin in every mode: it needs an administrator's
// session. The admin flag is read from the store, so a demotion applies at
// once. The session of a user that no longer exists ends here: /login would
// otherwise send that browser straight back.
func (p *authPages) gateAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		as, ok := p.sessions.fromRequest(r)
		if !ok {
			if p.allowAnon(w, r) {
				http.Redirect(w, r, loginURL(adminPath), http.StatusSeeOther)
			}
			return
		}
		setRequestUser(r, as.user)
		if as.mustChange {
			http.Redirect(w, r, passwordURL(adminPath), http.StatusSeeOther)
			return
		}
		admin, exists := p.store.isAdmin(as.user)
		switch {
		case !exists:
			p.sessions.drop(as.id)
			clearSessionCookie(w)
			http.Redirect(w, r, loginURL(adminPath), http.StatusSeeOther)
		case !admin:
			p.message(w, http.StatusForbidden, "Administrator access required", "You are signed in as "+as.user+", which is not an administrator.")
		default:
			next.ServeHTTP(w, r)
		}
	})
}

// sameClientWindow is how many recent sign-ins clientWatch compares.
const sameClientWindow = 50

// clientWatch keeps the client addresses of the last sign-ins. When all of
// them are one private or loopback address, the gateway is almost certainly
// behind a proxy it does not trust (a reverse proxy not in
// access.trustedProxies, or Docker's userland proxy), and every user then
// shares one throttle bucket, one failure count and one access-list entry.
// It says so once per process. Its lock is its own.
type clientWatch struct {
	mu     sync.Mutex
	recent []netip.Addr // a ring of the last len(recent) resolved clients
	next   int
	filled bool
	warned bool
}

func newClientWatch(size int) *clientWatch {
	return &clientWatch{recent: make([]netip.Addr, size)}
}

// seen records one successful sign-in's client and reports whether the
// warning is due now. An unresolved client says nothing either way.
func (cw *clientWatch) seen(addr netip.Addr, resolved bool) bool {
	if !resolved {
		return false
	}
	cw.mu.Lock()
	defer cw.mu.Unlock()
	cw.recent[cw.next] = addr
	cw.next = (cw.next + 1) % len(cw.recent)
	cw.filled = cw.filled || cw.next == 0
	if cw.warned || !cw.filled || !(addr.IsPrivate() || addr.IsLoopback()) {
		return false
	}
	for _, a := range cw.recent {
		if a != addr {
			return false
		}
	}
	cw.warned = true
	return true
}
