package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// pageFiles holds the sign-in page template: plain HTML, one <style> block,
// no script, so the gateway can serve it with a CSP that allows nothing else.
//
//go:embed pages/login.html
var pageFiles embed.FS

//go:embed pages/login.html
var pageSource string

// pageCSP is the sign-in pages' policy: no script, the template's one <style>
// block by its hash, forms that post back to the gateway, and no framing.
var pageCSP = pagePolicy(pageSource)

// pagePolicy builds the policy for a page template. The <style> block holds
// no template action, so the page carries it exactly as written; the browser
// hashes it with CRLF line ends turned into LF, and so does this. A template
// with no <style> block gets style-src 'none', which
// TestPageCSP_HashesTheStyleBlockThePageCarries would catch.
func pagePolicy(src string) string {
	style := "'none'"
	if _, rest, ok := strings.Cut(src, "<style>"); ok {
		if css, _, ok := strings.Cut(rest, "</style>"); ok {
			sum := sha256.Sum256([]byte(strings.ReplaceAll(strings.ReplaceAll(css, "\r\n", "\n"), "\r", "\n")))
			style = "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
		}
	}
	return "default-src 'none'; style-src " + style + "; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
}

// pageData feeds pages/login.html. Mode picks the form: "login", "password"
// or "message" (a title and an error, nothing to submit), and for two-factor
// "code" (the sign-in's second step), "setup" (a signed-in user proving who
// they are before a new authenticator), "enrol" (the secret and its QR code,
// asking for the first code) and "recovery" (the ten codes, shown once).
type pageData struct {
	Mode, Title, Error, Next string
	Required                 bool
	MinLen, MaxLen           int
	Enrolled                 bool          // setup: the user has two-factor now, so a code is asked too
	Secret, Note             string        // enrol: the secret in groups of four, and a line for when the QR code is missing
	QR                       template.HTML // enrol: inline SVG from qrSVG, trusted markup the gateway drew
	Codes                    []string      // recovery: the formatted codes
	Continue                 string        // recovery: where the Continue link goes
}

// authPages serves the gateway's own pages, /login, /login/password and the
// two-factor steps (/login/code, /login/two-factor), and gates the app bundles
// on the session they create.
type authPages struct {
	store    *store
	sessions *sessions
	throttle *throttle
	live     *live
	cop      *http.CrossOriginProtection
	logger   *slog.Logger
	tmpl     *template.Template
	watch    *clientWatch // warns when every recent sign-in looks like one client
	audit    *auditor     // the audit trail (audit.go); nil records nothing
	totp     *totpGuard   // the last code step accepted per user (totp.go): a code works once
}

func newAuthPages(st *store, ss *sessions, th *throttle, lv *live, logger *slog.Logger) (*authPages, error) {
	tmpl, err := template.ParseFS(pageFiles, "pages/login.html")
	if err != nil {
		return nil, err
	}
	return &authPages{
		store: st, sessions: ss, throttle: th, live: lv, cop: http.NewCrossOriginProtection(), logger: logger, tmpl: tmpl,
		watch: newClientWatch(sameClientWindow), totp: newTOTPGuard(),
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

func loginURL(next string) string     { return withNext("/login", next) }
func passwordURL(next string) string  { return withNext("/login/password", next) }
func codeURL(next string) string      { return withNext("/login/code", next) }
func twoFactorURL(next string) string { return withNext("/login/two-factor", next) }

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
	d.MinLen, d.MaxLen = p.live.loginLimits().minPassword(), passwordMaxLen
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

// readForm parses a POSTed form within the body cap, the body deadline
// (bodyDeadline) and the cross-origin check. On false the response has been
// written.
func (p *authPages) readForm(w http.ResponseWriter, r *http.Request) bool {
	if err := p.cop.Check(r); err != nil {
		p.message(w, http.StatusForbidden, "Request refused", "This form was submitted from another site.")
		return false
	}
	lift := bodyDeadline(w)
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := r.ParseForm(); err != nil {
		p.message(w, http.StatusBadRequest, "Request refused", "The form could not be read.")
		return false
	}
	lift()
	return true
}

// signinRefused records a refused sign-in. The actor is empty whatever the
// browser's earlier session: nobody was authenticated, and the target names
// the account tried (cut, it is a form field).
func (p *authPages) signinRefused(r *http.Request, user, code string) {
	e := auditFor(r, auditSignin)
	e.Actor, e.Target = "", userKey(user)
	e.Outcome, e.Code = auditRefused, code
	e.Msg = "sign-in refused for " + e.Target + ": " + strings.ReplaceAll(code, "_", " ")
	p.audit.record(auditAuth, e)
}

// passwordRefused records a refused change of the signed-in user's own
// password.
func (p *authPages) passwordRefused(r *http.Request, code string) {
	e := auditFor(r, auditPasswordChange)
	e.Target, e.Outcome, e.Code = e.Actor, auditRefused, code
	e.Msg = e.Actor + " could not change their password: " + strings.ReplaceAll(code, "_", " ")
	p.audit.record(auditAuth, e)
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
	}
	// Requests without a session draw from the client's budget, and so does
	// every sign-in attempt: a session must not buy a browser unmetered
	// guesses at other accounts.
	if (!signedIn || r.URL.Path == "/login" && post) && !p.allowAnon(w, r) {
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
	case r.URL.Path == "/login/code" && post:
		p.submitCode(w, r, as, signedIn)
	case r.URL.Path == "/login/code":
		p.showCode(w, r)
	case r.URL.Path == "/login/two-factor" && post:
		p.submitTwoFactor(w, r, as, signedIn)
	case r.URL.Path == "/login/two-factor":
		p.showTwoFactor(w, r, as, signedIn)
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
		p.signinRefused(r, user, "unavailable")
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
		p.signinRefused(r, user, "throttled")
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
		p.signinRefused(r, user, "bad_credentials")
		log.Warn("sign-in failed")
		refused()
		return
	}
	if stage := p.signinNeed(user); stage != "" {
		// The password matched but a second step is owed: a ticket, no session.
		// This browser's earlier session ends; the throttle's failure count
		// stays until the last step passes.
		if hadSession {
			p.sessions.drop(prior.id)
			clearSessionCookie(w)
		}
		tk := ticket{user: user, stage: stage, hash: check.hash, mustChange: check.mustChange}
		if stage == stageEnrol {
			tk.secret = newTOTPSecret() // the enrol page and its confirmation share one secret
		}
		p.startTicket(w, r, tk)
		log.Info("password accepted, a second step is owed", "step", stage)
		to := codeURL(next)
		if stage == stageEnrol {
			to = twoFactorURL(next)
		}
		http.Redirect(w, r, to, http.StatusSeeOther)
		return
	}
	id, ok := p.startSession(user, check)
	if !ok {
		p.signinRefused(r, user, "account_changed")
		log.Warn("sign-in refused: the account changed while its password was checked")
		refused()
		return
	}
	if hadSession {
		p.sessions.drop(prior.id)
	}
	p.sessionOpened(w, r, log, user, id, signedInMsg(user), check.mustChange, client, resolved)
	http.Redirect(w, r, p.onwardURL(next, check.mustChange), http.StatusSeeOther)
}

// signinNeed is what a matched password still owes (need): "" when the session
// may open, else stageCode or stageEnrol.
func (p *authPages) signinNeed(user string) string {
	admin, _ := p.store.isAdmin(user)
	enrolled, _ := p.store.twoFactorOf(user)
	return need(p.live.twoFactor(), admin, enrolled)
}

// onwardURL is where a signed-in browser goes next: the forced password change
// first, else next.
func (p *authPages) onwardURL(next string, mustChange bool) string {
	if mustChange {
		return passwordURL(next)
	}
	return next
}

// sessionOpened is everything that follows a session's creation at sign-in:
// the throttle forgets the account's failures, the cookie is set, the audit entry
// (an ok signin, only now that the session exists) and the log line are
// written, and the client watch may warn.
func (p *authPages) sessionOpened(w http.ResponseWriter, r *http.Request, log *slog.Logger, user, id, msg string, mustChange bool, client netip.Addr, resolved bool) {
	p.throttle.loginSucceeded(user)
	setSessionCookie(w, id)
	setRequestUser(r, user)
	e := auditFor(r, auditSignin)
	e.Target, e.Outcome, e.Msg = user, auditOK, msg
	if mustChange {
		e.Msg += "; a password change is required"
	}
	p.audit.record(auditAuth, e)
	log.Info("signed in")
	if p.watch.seen(client, resolved) {
		log.Warn("every recent sign-in came from this one private address: a reverse proxy or Docker's userland proxy the gateway does not trust is likely in front of it, so all users share one throttle and one access-list entry; list the proxy under Trusted reverse proxies on Gateway Settings (access.trustedProxies), see docs/deployment.md",
			"sign_ins", len(p.watch.recent))
	}
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
// in the same store write; then every other session of the user ends. The
// current password is checked and the new one hashed before the writer lock;
// inside it the store refuses when the hash changed meanwhile (an
// administrator's reset), as a wrong current password would be.
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
	least := p.live.loginLimits().minPassword()
	page := pageData{Mode: "password", Title: "Change password", Next: next, Required: as.mustChange}
	fail := func(status int, msg string) {
		page.Error = msg
		p.render(w, status, page)
	}
	client, resolved := clientOf(r)
	log := requestLogger(p.logger, r)
	unavailable := func(err error) {
		log.Error("password check failed", "err", err)
		p.passwordRefused(r, "unavailable")
		fail(http.StatusServiceUnavailable, "The password could not be checked. Try again.")
	}
	release, wait, err := p.checkTurn(r, as.user, client, resolved)
	switch {
	case err != nil:
		unavailable(err)
		return
	case wait > 0:
		p.passwordRefused(r, "throttled")
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
		p.passwordRefused(r, "bad_credentials")
		log.Warn("password change refused: the current password is not correct")
		fail(http.StatusUnauthorized, "The current password is not correct.")
		return
	case nw != confirm:
		p.passwordRefused(r, "invalid")
		fail(http.StatusUnprocessableEntity, "The new passwords do not match.")
		return
	case checkPasswordPolicy(nw, least) != nil:
		p.passwordRefused(r, "invalid")
		fail(http.StatusUnprocessableEntity, "The new password must be "+strconv.Itoa(least)+" to "+strconv.Itoa(passwordMaxLen)+" characters.")
		return
	case nw == cur:
		p.passwordRefused(r, "invalid")
		fail(http.StatusUnprocessableEntity, "The new password must differ from the current one.")
		return
	}
	var id string
	err = p.store.setPassword(r.Context(), as.user, nw, check.hash, func() {
		id = p.sessions.create(as.user, false)
		// The audit line too is written while the writer lock is held, so it
		// follows the order of the commits; the seq read is this commit's own.
		seq, _ := p.store.seqs()
		e := auditFor(r, auditPasswordChange)
		e.Target, e.Outcome, e.Msg = as.user, auditOK, as.user+" changed their password"
		e.Wrote = []auditWrote{{File: filepath.Base(p.store.usersPath), Seq: int64(seq)}}
		if as.mustChange {
			e.Msg = as.user + " set a new password after the forced change"
		}
		p.audit.record(auditAuth, e)
	})
	var diskChanged *changedOnDiskError
	var writeFailed *writeFailedError
	var clientGone *clientGoneError
	switch {
	case errors.Is(err, errAccountChanged), errors.Is(err, errUserNotFound):
		p.passwordRefused(r, "account_changed")
		log.Warn("password change refused: the account changed while its password was checked")
		p.message(w, http.StatusConflict, "Password not changed", "Your account was changed while this request ran. Sign in again.")
		return
	case errors.As(err, &clientGone):
		return // the browser left before the change began: nothing happened and nobody reads an answer
	case errors.Is(err, errAuditUnavailable):
		p.passwordRefused(r, "audit_unavailable")
		log.Error("password change refused: the audit log cannot be written", "err", err)
		p.message(w, http.StatusServiceUnavailable, "Password not changed", "The gateway cannot record changes right now, so it refused this one. Try again later or tell an administrator.")
		return
	case errors.As(err, &diskChanged):
		p.passwordRefused(r, "store_changed_on_disk")
		log.Error("password change refused: a store file was changed outside the gateway", "err", err)
		p.message(w, http.StatusConflict, "Password not changed", "The gateway's user file was changed outside the gateway. An administrator must restart the gateway before passwords can be changed.")
		return
	case err != nil:
		// A store write that failed and was rolled back, or a hash that could
		// not run: either way nothing changed.
		code := "server_error"
		if errors.As(err, &writeFailed) {
			code = "store_write_failed"
		}
		p.passwordRefused(r, code)
		log.Error("password change failed", "err", err)
		fail(http.StatusInternalServerError, "The password could not be saved.")
		return
	}
	p.throttle.loginSucceeded(as.user)
	p.sessions.dropOthers(as.user, id)
	setSessionCookie(w, id)
	log.Info("password changed")
	http.Redirect(w, r, next, http.StatusSeeOther)
}

// ----- two-factor steps ----------------------------------------------------------------

const twoFactorTitle = "Two-factor sign-in"

// codeSeparators are taken out of a typed code before it is judged a TOTP
// code: authenticator apps show "123 456".
var codeSeparators = strings.NewReplacer(" ", "", "-", "")

// recoveryAuditText is the code page's answer when audit.onFailure is refuse
// and the audit log cannot be written: using a recovery code changes the
// users file, so it waits until a change can be recorded.
const recoveryAuditText = "The gateway cannot record changes right now, so it cannot accept a recovery code. Sign in with the code from your authenticator app, or try again later."

// startTicket begins a half-finished sign-in in this browser: the ticket the
// browser held before (if any) ends, the new one is created and its cookie
// set. It returns the new ticket's id.
func (p *authPages) startTicket(w http.ResponseWriter, r *http.Request, tk ticket) string {
	if old, ok := p.sessions.tickets.fromRequest(r); ok {
		p.sessions.tickets.drop(old.id)
	}
	id := p.sessions.tickets.create(tk)
	setSigninCookie(w, id)
	return id
}

// enrolRefused records a refused set-up of two-factor (the first one or a
// replacement). The actor is the user: the password has matched, or they are
// signed in. A code is never in the entry.
func (p *authPages) enrolRefused(r *http.Request, user, code string) {
	e := auditFor(r, auditTwoFactorEnrol)
	e.Target, e.Outcome, e.Code = user, auditRefused, code
	e.Msg = user + " could not set up two-factor sign-in: " + strings.ReplaceAll(code, "_", " ")
	p.audit.record(auditAuth, e)
}

// stepAnswers are how a two-factor step answers a refusal of its own kind, so
// takeTurn can serve all three steps: refused writes the audit entry, page
// renders the step's form again with a message, unavailable answers 503.
type stepAnswers struct {
	refused     func(code string)
	page        func(status int, msg string)
	unavailable func(err error)
}

// takeTurn is checkTurn for a two-factor step: the user's sign-in turn, then
// the throttle's verdict, with the refusals answered through a. On ok the
// caller defers release.
func (p *authPages) takeTurn(w http.ResponseWriter, r *http.Request, user string, client netip.Addr, resolved bool, a stepAnswers) (release func(), ok bool) {
	release, wait, err := p.checkTurn(r, user, client, resolved)
	switch {
	case err != nil:
		a.unavailable(err)
		return nil, false
	case wait > 0:
		a.refused("throttled")
		w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
		a.page(http.StatusTooManyRequests, throttledText(wait))
		return nil, false
	}
	return release, true
}

// ticketStands reports, once the account's turn is held, whether the ticket
// read before the turn still exists at the same stage. A request queued behind
// another on the same ticket finds it ended (that one signed in or set
// two-factor up), so a ticket is used once however many requests carry it.
func (p *authPages) ticketStands(id, stage string) bool {
	cur, ok := p.sessions.tickets.lookup(id)
	return ok && cur.stage == stage
}

// spendCode checks the one code field of a user who has two-factor with the
// given secret: six digits, once spaces and hyphens are taken out ("123 456"
// as authenticator apps show it), is a TOTP code (a replayed one is refused);
// anything else is tried as a recovery code, which is used up. A recovery code
// has 16 characters, so taking the separators out never makes one look like a
// TOTP code. left is the recovery codes remaining and means something only
// when byRecovery. err is a store failure.
func (p *authPages) spendCode(ctx context.Context, user, secret, code string) (valid, byRecovery bool, left int, err error) {
	if digits := codeSeparators.Replace(code); totpShaped(digits) {
		return p.totp.check(user, secret, digits, p.sessions.now()), false, 0, nil
	}
	valid, left, err = p.store.useRecoveryCode(ctx, user, hashRecoveryCode(code))
	return valid, true, left, err
}

// enrolData is the enrol page for a pending secret: the QR code (when it can be
// drawn; otherwise a line says to type the key) and the key in groups of four.
func (p *authPages) enrolData(r *http.Request, user, secret, next string) pageData {
	d := pageData{Mode: "enrol", Title: "Set up two-factor sign-in", Next: next, Secret: groupSecret(secret)}
	qr, err := qrSVG(totpURI(user, secret))
	if err != nil {
		requestLogger(p.logger, r).Error("two-factor QR code could not be drawn", "err", err)
		d.Note = "The picture could not be drawn. Type the key into your app instead."
		return d
	}
	d.QR = qr
	return d
}

// twoFactorRefusal maps an error of store.setTOTP to its answer: the status,
// the audit code and the sentence the page shows. Nothing was changed in any
// of these cases.
func twoFactorRefusal(err error) (status int, code, msg string) {
	var diskChanged *changedOnDiskError
	var writeFailed *writeFailedError
	switch {
	case errors.Is(err, errAccountChanged), errors.Is(err, errUserNotFound):
		return http.StatusConflict, "account_changed", "Your account was changed while this request ran. Sign in again."
	case errors.Is(err, errAuditUnavailable):
		return http.StatusServiceUnavailable, "audit_unavailable", "The gateway cannot record changes right now, so it refused this one. Try again later or tell an administrator."
	case errors.As(err, &diskChanged):
		return http.StatusConflict, "store_changed_on_disk", "The gateway's user file was changed outside the gateway. An administrator must restart the gateway before two-factor can be set up."
	case errors.As(err, &writeFailed):
		return http.StatusInternalServerError, "store_write_failed", "Two-factor sign-in could not be saved."
	}
	return http.StatusInternalServerError, "server_error", "Two-factor sign-in could not be saved."
}

// showCode is the sign-in's code step: it needs a code ticket.
func (p *authPages) showCode(w http.ResponseWriter, r *http.Request) {
	next := safeNext(r.URL.Query().Get("next"))
	if at, ok := p.sessions.tickets.fromRequest(r); !ok || at.stage != stageCode {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	p.render(w, http.StatusOK, pageData{Mode: "code", Title: twoFactorTitle, Next: next})
}

// submitCode finishes a sign-in whose password matched: the code is a current
// TOTP code or a recovery code. The throttle applies as for a password (same
// turn, same counters); a wrong code counts as a failed sign-in. The session
// is created only here, once the code passed, and only while the account is
// the one the password was checked against.
func (p *authPages) submitCode(w http.ResponseWriter, r *http.Request, prior activeSession, hadSession bool) {
	if !p.readForm(w, r) {
		return
	}
	next := safeNext(r.PostFormValue("next"))
	at, ok := p.sessions.tickets.fromRequest(r)
	if !ok || at.stage != stageCode {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	user, code := at.user, r.PostFormValue("code")
	page := pageData{Mode: "code", Title: twoFactorTitle, Next: next}
	client, resolved := clientOf(r)
	log := clientLogger(p.logger, r).With("user", userKey(user))
	endTicket := func() {
		p.sessions.tickets.drop(at.id)
		clearSigninCookie(w)
	}
	unavailable := func(err error) {
		log.Error("sign-in check failed", "err", err)
		p.signinRefused(r, user, "unavailable")
		p.message(w, http.StatusServiceUnavailable, "Sign-in unavailable", "Sign-in could not be checked. Try again.")
	}
	changed := func() {
		endTicket()
		p.signinRefused(r, user, "account_changed")
		log.Warn("sign-in refused: the account changed while the code step was open")
		p.render(w, http.StatusUnauthorized, pageData{Mode: "login", Title: "Sign in", Next: next, Error: "Sign-in failed. Check the username and password."})
	}
	release, ok := p.takeTurn(w, r, user, client, resolved, stepAnswers{
		refused: func(c string) { p.signinRefused(r, user, c) },
		page: func(status int, msg string) {
			page.Error = msg
			p.render(w, status, page)
		},
		unavailable: unavailable,
	})
	if !ok {
		return
	}
	defer release()
	if !p.ticketStands(at.id, stageCode) {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	secret, enrolled := p.store.totpSecret(user)
	if !enrolled {
		changed() // two-factor was removed, or the account deleted, after the password step
		return
	}
	valid, byRecovery, left, err := p.spendCode(r.Context(), user, secret, code)
	if errors.Is(err, errAuditUnavailable) {
		// audit.onFailure refuse: a recovery code is a store write, so it is
		// refused while the audit log cannot be written. The code is not used
		// up; a code from the authenticator writes nothing and still works.
		p.signinRefused(r, user, "audit_unavailable")
		log.Error("sign-in refused: a recovery code cannot be used while the audit log cannot be written", "err", err)
		page.Error = recoveryAuditText
		p.render(w, http.StatusServiceUnavailable, page)
		return
	}
	if err != nil {
		unavailable(err)
		return
	}
	if !valid {
		p.throttle.loginFailed(user, client, resolved)
		p.signinRefused(r, user, auditBadCode)
		log.Warn("sign-in failed: the code is not correct")
		page.Error = "The code is not correct."
		p.render(w, http.StatusUnauthorized, page)
		return
	}
	var id string
	if !p.store.ifUnchanged(user, at.hash, func() { id = p.sessions.create(user, at.mustChange) }) {
		changed()
		return
	}
	endTicket()
	if hadSession {
		p.sessions.drop(prior.id)
	}
	msg := signedInMsg(user)
	if byRecovery {
		msg = signedInRecoveryMsg(user, left)
	}
	p.sessionOpened(w, r, log, user, id, msg, at.mustChange, client, resolved)
	http.Redirect(w, r, p.onwardURL(next, at.mustChange), http.StatusSeeOther)
}

// showTwoFactor is the page for setting two-factor up: the enrol page (secret
// and QR code) for a browser with an enrol ticket, or the setup page (password,
// and a code when the user has two-factor) for a signed-in user.
func (p *authPages) showTwoFactor(w http.ResponseWriter, r *http.Request, as activeSession, signedIn bool) {
	next := safeNext(r.URL.Query().Get("next"))
	at, hasTicket := p.sessions.tickets.fromRequest(r)
	enrol := hasTicket && at.stage == stageEnrol
	switch {
	case !enrol && !(signedIn && !as.mustChange):
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
	case enrol:
		p.render(w, http.StatusOK, p.enrolData(r, at.user, at.secret, next))
	default:
		enrolled, _ := p.store.twoFactorOf(as.user)
		p.render(w, http.StatusOK, pageData{Mode: "setup", Title: twoFactorTitle, Next: next, Enrolled: enrolled})
	}
}

// submitTwoFactor routes the form of /login/two-factor by its step field:
// verify (a signed-in user proving who they are) or confirm (the first code of
// the new secret).
func (p *authPages) submitTwoFactor(w http.ResponseWriter, r *http.Request, as activeSession, signedIn bool) {
	if !p.readForm(w, r) {
		return
	}
	next := safeNext(r.PostFormValue("next"))
	switch r.PostFormValue("step") {
	case "verify":
		p.submitSetup(w, r, next, as, signedIn)
	case "confirm":
		p.submitConfirm(w, r, next, as, signedIn)
	default:
		p.message(w, http.StatusBadRequest, "Request refused", "The form could not be read.")
	}
}

// submitSetup is step verify: a signed-in user asks to set two-factor up (or
// again). The password counts like the own-password change's (a wrong one is a
// failed sign-in under the same turn), and so does the current code or a
// recovery code when they already have two-factor; one message covers either.
// Only then does a setup ticket with a new secret exist, and the enrol page
// shows it. Nothing is stored yet.
func (p *authPages) submitSetup(w http.ResponseWriter, r *http.Request, next string, as activeSession, signedIn bool) {
	if !signedIn || as.mustChange {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	pw, code := r.PostFormValue("password"), r.PostFormValue("code")
	// Only whether two-factor is set up, for the form a refused turn shows:
	// the secret is read under the turn.
	_, enrolled := p.store.totpSecret(as.user)
	page := pageData{Mode: "setup", Title: twoFactorTitle, Next: next, Enrolled: enrolled}
	client, resolved := clientOf(r)
	log := requestLogger(p.logger, r)
	unavailable := func(err error) {
		log.Error("two-factor set-up check failed", "err", err)
		p.enrolRefused(r, as.user, "unavailable")
		page.Error = "The password could not be checked. Try again."
		p.render(w, http.StatusServiceUnavailable, page)
	}
	release, ok := p.takeTurn(w, r, as.user, client, resolved, stepAnswers{
		refused: func(c string) { p.enrolRefused(r, as.user, c) },
		page: func(status int, msg string) {
			page.Error = msg
			p.render(w, status, page)
		},
		unavailable: unavailable,
	})
	if !ok {
		return
	}
	defer release()
	// Read again under the turn: a set-up that finished while this request
	// waited makes the current code required.
	secret, enrolled := p.store.totpSecret(as.user)
	page.Enrolled = enrolled
	check, err := p.store.verifyPassword(r.Context(), as.user, pw)
	if err != nil {
		unavailable(err)
		return
	}
	valid := check.ok
	if valid && enrolled {
		// A wrong password never spends a recovery code.
		if valid, _, _, err = p.spendCode(r.Context(), as.user, secret, code); err != nil {
			unavailable(err)
			return
		}
	}
	if !valid {
		p.throttle.loginFailed(as.user, client, resolved)
		p.enrolRefused(r, as.user, "bad_credentials")
		log.Warn("two-factor set-up refused: the password or the code is not correct")
		page.Error = "The password or the code is not correct."
		p.render(w, http.StatusUnauthorized, page)
		return
	}
	pending := newTOTPSecret()
	p.startTicket(w, r, ticket{user: as.user, stage: stageSetup, hash: check.hash, secret: pending})
	p.render(w, http.StatusOK, p.enrolData(r, as.user, pending, next))
}

// submitConfirm is step confirm: the first code of the new secret. A wrong
// one counts as a failed sign-in and the page shows the same secret again. A
// right one stores the secret and ten recovery codes in one commit; inside
// that commit (writer lock held) an enrol ticket's session is created and the
// audit line written, so the session exists only once two-factor does. The
// user's other sessions then end, and the recovery page shows the codes this
// once.
func (p *authPages) submitConfirm(w http.ResponseWriter, r *http.Request, next string, prior activeSession, hadSession bool) {
	at, ok := p.sessions.tickets.fromRequest(r)
	if !ok || (at.stage != stageEnrol && at.stage != stageSetup) {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	if at.stage == stageSetup && !(hadSession && prior.user == at.user && !prior.mustChange) {
		// A set-up belongs to the signed-in browser that asked for it.
		p.sessions.tickets.drop(at.id)
		clearSigninCookie(w)
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	user, code := at.user, r.PostFormValue("code")
	setRequestUser(r, user)
	page := p.enrolData(r, user, at.secret, next)
	client, resolved := clientOf(r)
	log := requestLogger(p.logger, r)
	endTicket := func() {
		p.sessions.tickets.drop(at.id)
		clearSigninCookie(w)
	}
	refuseWrite := func(status int, reason, title, msg string) {
		endTicket()
		p.enrolRefused(r, user, reason)
		p.message(w, status, title, msg)
	}
	unavailable := func(err error) {
		log.Error("two-factor set-up check failed", "err", err)
		p.enrolRefused(r, user, "unavailable")
		p.message(w, http.StatusServiceUnavailable, "Two-factor not set up", "The code could not be checked. Try again.")
	}
	release, ok := p.takeTurn(w, r, user, client, resolved, stepAnswers{
		refused: func(c string) { p.enrolRefused(r, user, c) },
		page: func(status int, msg string) {
			page.Error = msg
			p.render(w, status, page)
		},
		unavailable: unavailable,
	})
	if !ok {
		return
	}
	defer release()
	if !p.ticketStands(at.id, at.stage) {
		http.Redirect(w, r, loginURL(next), http.StatusSeeOther)
		return
	}
	wasEnrolled, exists := p.store.twoFactorOf(user)
	if !exists || (at.stage == stageEnrol && wasEnrolled) {
		// Deleted meanwhile, or enrolled elsewhere since the password step: an
		// enrol ticket never replaces a secret that exists.
		status, reason, msg := twoFactorRefusal(errAccountChanged)
		log.Warn("two-factor set-up refused: the account changed since the password step")
		refuseWrite(status, reason, "Two-factor not set up", msg)
		return
	}
	// The new secret has no replay history of its own, so the code is checked
	// without the guard and recorded in it only once the secret is stored.
	if _, valid := totpVerify(at.secret, code, p.sessions.now()); !valid {
		p.throttle.loginFailed(user, client, resolved)
		p.enrolRefused(r, user, auditBadCode)
		log.Warn("two-factor set-up refused: the code is not correct")
		page.Error = "The code is not correct."
		p.render(w, http.StatusUnauthorized, page)
		return
	}
	codes := newRecoveryCodes()
	var id string
	err := p.store.setTOTP(r.Context(), user, at.secret, hashRecoveryCodes(codes), at.hash, func() {
		id = prior.id
		if at.stage == stageEnrol {
			id = p.sessions.create(user, at.mustChange)
		}
		seq, _ := p.store.seqs()
		e := auditFor(r, auditTwoFactorEnrol)
		e.Target, e.Outcome, e.Msg = user, auditOK, twoFactorEnrolMsg(user, wasEnrolled)
		e.Wrote = []auditWrote{{File: filepath.Base(p.store.usersPath), Seq: int64(seq)}}
		p.audit.record(auditAuth, e)
	})
	var clientGone *clientGoneError
	if errors.As(err, &clientGone) {
		return // the browser left before the change began: nothing happened and nobody reads an answer
	}
	if err != nil {
		status, reason, msg := twoFactorRefusal(err)
		log.Warn("two-factor set-up refused", "code", reason, "err", err)
		refuseWrite(status, reason, "Two-factor not set up", msg)
		return
	}
	// Stored. The old secret's replay history means nothing for the new one;
	// the code just used is recorded so it cannot also sign in.
	p.totp.forget(user)
	p.totp.check(user, at.secret, code, p.sessions.now())
	p.sessions.dropOthers(user, id)
	endTicket()
	if at.stage == stageEnrol {
		if hadSession {
			p.sessions.drop(prior.id)
		}
		p.sessionOpened(w, r, log, user, id, signedInMsg(user), at.mustChange, client, resolved)
	} else {
		p.throttle.loginSucceeded(user)
	}
	log.Info("two-factor sign-in set up", "again", wasEnrolled)
	formatted := make([]string, len(codes))
	for i, c := range codes {
		formatted[i] = formatRecoveryCode(c)
	}
	p.render(w, http.StatusOK, pageData{Mode: "recovery", Title: "Recovery codes", Codes: formatted, Continue: p.onwardURL(next, at.mustChange)})
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
