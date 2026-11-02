//go:build managed

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

	// Revocation hooks (sockets.go): set once before serving, called outside
	// mu. drop calls onDrop with the id, dropUser calls onDropUser with the
	// user. Expiry and the sweep call neither: an SMF socket ends only on
	// revocation, never because its session timed out.
	onDrop     func(id string)
	onDropUser func(user string)
}

func newSessions(limits func() sessionLimits, now func() time.Time) *sessions {
	return &sessions{byID: map[string]*session{}, limits: limits, now: now}
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

// dropUser ends every session of one user: their password, admin flag or
// account changed. onDropUser fires even when no session was left, so a
// socket that outlived its session is still closed.
func (s *sessions) dropUser(user string) {
	s.mu.Lock()
	for k, ss := range s.byID {
		if ss.user == user {
			delete(s.byID, k)
		}
	}
	s.mu.Unlock()
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
