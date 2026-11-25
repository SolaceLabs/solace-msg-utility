package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"
	"time"
)

// session is one signed-in browser. Only the username is kept: the admin flag
// and entitlements are read from the store on every request, so an edit takes
// effect without waiting for the session to end.
type session struct {
	user       string
	mustChange bool
	created    time.Time
	lastSeen   time.Time
}

// sessions is the in-memory session table (single replica: a restart signs
// everyone out). Ids are 32 random bytes; the table is the only place they
// mean anything. limits returns the live session.* settings, so a change
// applies to every session, existing ones included, at its next request.
type sessions struct {
	mu     sync.Mutex
	byID   map[string]*session
	limits func() sessionLimits
	now    func() time.Time

	// tickets are the sign-ins that have passed the password and still owe a
	// second step (below). dropUser and dropOthers end a user's tickets with
	// their sessions, so one call revokes both.
	tickets *signinTickets

	// Revocation hooks (sockets.go): set once before serving, called outside
	// mu. drop calls onDrop with the id, dropUser calls onDropUser with the
	// user. Expiry and the sweep call neither: an SMF socket ends only on
	// revocation, never because its session timed out.
	onDrop     func(id string)
	onDropUser func(user string)
}

func newSessions(limits func() sessionLimits, now func() time.Time) *sessions {
	ttl := func() time.Duration { return limits().ticketTTL() }
	return &sessions{byID: map[string]*session{}, limits: limits, now: now, tickets: newSigninTickets(ttl, now)}
}

func expired(ss *session, now time.Time, lim sessionLimits) bool {
	return now.Sub(ss.lastSeen) >= lim.idle || now.Sub(ss.created) >= lim.absolute
}

// create starts a session and returns its id. Expired sessions are swept here,
// so the table never grows past the sessions alive in the last absolute window.
func (s *sessions) create(user string, mustChange bool) string {
	b := make([]byte, 32)
	rand.Read(b) // never fails: since Go 1.24 it crashes the process instead
	id := base64.RawURLEncoding.EncodeToString(b)
	s.mu.Lock()
	defer s.mu.Unlock()
	now, lim := s.now(), s.limits()
	for k, ss := range s.byID {
		if expired(ss, now, lim) {
			delete(s.byID, k)
		}
	}
	s.byID[id] = &session{user: user, mustChange: mustChange, created: now, lastSeen: now}
	return id
}

// lookup returns a copy of a live session and marks it used. An expired one is
// dropped and reported as absent.
func (s *sessions) lookup(id string) (session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ss, ok := s.byID[id]
	if !ok {
		return session{}, false
	}
	now := s.now()
	if expired(ss, now, s.limits()) {
		delete(s.byID, id)
		return session{}, false
	}
	ss.lastSeen = now
	return *ss, true
}

// drop ends one session: a sign-out, or a sign-in replacing it.
func (s *sessions) drop(id string) {
	s.mu.Lock()
	delete(s.byID, id)
	s.mu.Unlock()
	if s.onDrop != nil {
		s.onDrop(id)
	}
}

// dropUser ends every session and sign-in ticket of one user: their password,
// admin flag, account or two-factor changed. onDropUser fires even when no
// session was left, so a socket that outlived its session is still closed.
func (s *sessions) dropUser(user string) { s.dropOthers(user, "") }

// dropOthers is dropUser sparing the session keep: the browser that changed
// the user's own password keeps the session it was just given. No id is "".
// The user's tickets all end: a half-finished sign-in of an account that has
// just changed must not finish.
func (s *sessions) dropOthers(user, keep string) {
	s.mu.Lock()
	for k, ss := range s.byID {
		if ss.user == user && k != keep {
			delete(s.byID, k)
		}
	}
	s.mu.Unlock()
	s.tickets.dropUser(user)
	if s.onDropUser != nil {
		s.onDropUser(user)
	}
}

// has reports whether id is still in the table, without marking it used or
// expiring it: the SMF gate's check after it registers a socket.
func (s *sessions) has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.byID[id]
	return ok
}

// activeSession is a looked-up session plus its id, as handlers see it.
type activeSession struct {
	id string
	session
}

// fromRequest looks up the request's session cookie.
func (s *sessions) fromRequest(r *http.Request) (activeSession, bool) {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return activeSession{}, false
	}
	ss, ok := s.lookup(c.Value)
	if !ok {
		return activeSession{}, false
	}
	return activeSession{id: c.Value, session: ss}, true
}

// setSessionCookie issues the cookie. No Max-Age: it is a browser-session
// cookie, and the idle and absolute limits are enforced here, not by the browser.
func setSessionCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: id, Path: "/",
		Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
}

type sessionCtxKey struct{}

func withSession(ctx context.Context, as activeSession) context.Context {
	return context.WithValue(ctx, sessionCtxKey{}, as)
}

// sessionOf returns the session the managed API gate put on the request.
func sessionOf(r *http.Request) activeSession {
	as, _ := r.Context().Value(sessionCtxKey{}).(activeSession)
	return as
}

// ----- sign-in tickets ---------------------------------------------------------------

// signinCookie carries the id of a sign-in ticket (below). Like the session
// cookie it is __Host- prefixed, so a browser accepts it only from this host
// over TLS with Path=/, and the Direct relay strips it as it strips the
// session cookie (proxy.go).
const signinCookie = "__Host-smu-signin"

// defaultTicketTTL is how long a half-finished sign-in waits for its next
// step unless login.twoFactorMinutes says otherwise.
const defaultTicketTTL = 10 * time.Minute

// ticket is a sign-in that has passed the password and still owes a step. It
// is never a session: no session exists until every step has passed, so
// nothing that checks sessions needs to know a half-finished state. A ticket
// grants nothing but its own page.
type ticket struct {
	user       string
	stage      string // stageCode, stageEnrol or stageSetup (totp.go)
	hash       string // the password hash that was checked, for ifUnchanged
	mustChange bool
	secret     string // the pending new secret, for stageEnrol and stageSetup
	created    time.Time
}

// signinTickets is the in-memory ticket table, beside the sessions (a restart
// ends every half-finished sign-in). Ids are 32 random bytes.
type signinTickets struct {
	mu   sync.Mutex
	byID map[string]*ticket
	ttl  func() time.Duration // login.twoFactorMinutes, read live
	now  func() time.Time
}

func newSigninTickets(ttl func() time.Duration, now func() time.Time) *signinTickets {
	return &signinTickets{byID: map[string]*ticket{}, ttl: ttl, now: now}
}

// expired reports whether tk is older than the ticket lifetime in force now,
// so a shorter login.twoFactorMinutes also ends tickets already issued.
func (t *signinTickets) expired(tk *ticket, now time.Time) bool {
	return now.Sub(tk.created) >= t.ttl()
}

// create stores tk (its created time is set here) and returns its id. It
// replaces nothing: a caller that holds the browser's earlier ticket drops it.
// Expired tickets are swept here, so the table never outgrows the sign-ins
// begun in the last ticket lifetime.
func (t *signinTickets) create(tk ticket) string {
	b := make([]byte, 32)
	rand.Read(b) // never fails: since Go 1.24 it crashes the process instead
	id := base64.RawURLEncoding.EncodeToString(b)
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	for k, old := range t.byID {
		if t.expired(old, now) {
			delete(t.byID, k)
		}
	}
	tk.created = now
	t.byID[id] = &tk
	return id
}

// lookup returns a copy of a live ticket. An expired one is dropped and
// reported as absent. A lookup does not extend it: the lifetime runs from create.
func (t *signinTickets) lookup(id string) (ticket, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	tk, ok := t.byID[id]
	if !ok {
		return ticket{}, false
	}
	if t.expired(tk, t.now()) {
		delete(t.byID, id)
		return ticket{}, false
	}
	return *tk, true
}

// drop ends one ticket: the sign-in finished, failed for good or was replaced.
func (t *signinTickets) drop(id string) {
	t.mu.Lock()
	delete(t.byID, id)
	t.mu.Unlock()
}

// dropUser ends every ticket of one user.
func (t *signinTickets) dropUser(user string) {
	t.mu.Lock()
	for k, tk := range t.byID {
		if tk.user == user {
			delete(t.byID, k)
		}
	}
	t.mu.Unlock()
}

// activeTicket is a looked-up ticket plus its id, as handlers see it.
type activeTicket struct {
	id string
	ticket
}

// fromRequest looks up the request's sign-in cookie.
func (t *signinTickets) fromRequest(r *http.Request) (activeTicket, bool) {
	c, err := r.Cookie(signinCookie)
	if err != nil {
		return activeTicket{}, false
	}
	tk, ok := t.lookup(c.Value)
	if !ok {
		return activeTicket{}, false
	}
	return activeTicket{id: c.Value, ticket: tk}, true
}

// setSigninCookie issues the ticket cookie. SameSite=Strict: only a request
// from this site continues a sign-in. No Max-Age: the ticket's own expiry
// applies, not the browser's.
func setSigninCookie(w http.ResponseWriter, id string) {
	http.SetCookie(w, &http.Cookie{
		Name: signinCookie, Value: id, Path: "/",
		Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode,
	})
}

func clearSigninCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: signinCookie, Value: "", Path: "/", MaxAge: -1,
		Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode,
	})
}
