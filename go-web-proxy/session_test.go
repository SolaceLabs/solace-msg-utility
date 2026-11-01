//go:build managed

package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// fakeClock is a settable clock for sessions and the throttle.
type fakeClock struct{ t time.Time }

func newFakeClock() *fakeClock { return &fakeClock{t: time.Date(2026, 10, 30, 9, 0, 0, 0, time.UTC)} }

func (c *fakeClock) now() time.Time { return c.t }

func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

var testSessionLimits = sessionLimits{idle: 10 * time.Minute, absolute: 30 * time.Minute}

func TestSessions_IdleExpiry(t *testing.T) {
	clock := newFakeClock()
	s := newSessions(testSessionLimits, clock.now)
	id := s.create("alice", false)
	clock.advance(9 * time.Minute)
	if ss, ok := s.lookup(id); !ok || ss.user != "alice" {
		t.Fatal("a session used within the idle window must be live")
	}
	clock.advance(9 * time.Minute) // 18 min since sign-in, 9 since last use
	if _, ok := s.lookup(id); !ok {
		t.Fatal("each use must reset the idle timer")
	}
	clock.advance(10 * time.Minute)
	if _, ok := s.lookup(id); ok {
		t.Fatal("10 idle minutes must end the session")
	}
	if len(s.byID) != 0 {
		t.Error("an expired session must be removed when seen")
	}
}

func TestSessions_AbsoluteExpiry(t *testing.T) {
	clock := newFakeClock()
	s := newSessions(testSessionLimits, clock.now)
	id := s.create("alice", false)
	for i := 0; i < 5; i++ { // busy for 25 minutes
		clock.advance(5 * time.Minute)
		if _, ok := s.lookup(id); !ok {
			t.Fatalf("minute %d: an active session must be live", (i+1)*5)
		}
	}
	clock.advance(5 * time.Minute)
	if _, ok := s.lookup(id); ok {
		t.Fatal("30 minutes after sign-in the session must end, however busy")
	}
}

func TestSessions_DropAndDropUser(t *testing.T) {
	s := newSessions(testSessionLimits, newFakeClock().now)
	a1, a2, b := s.create("alice", false), s.create("alice", true), s.create("bob", false)
	if a1 == a2 || len(a1) != 43 {
		t.Fatalf("ids must be distinct 32-byte base64url values, got %q %q", a1, a2)
	}
	if ss, _ := s.lookup(a2); !ss.mustChange {
		t.Error("the change flag must be kept on the session")
	}
	s.dropUser("alice")
	if _, ok := s.lookup(a1); ok {
		t.Error("dropUser must end every session of the user")
	}
	if _, ok := s.lookup(a2); ok {
		t.Error("dropUser must end every session of the user")
	}
	if _, ok := s.lookup(b); !ok {
		t.Error("another user's session must survive")
	}
	s.drop(b)
	if _, ok := s.lookup(b); ok {
		t.Error("drop must end the session")
	}
	if _, ok := s.lookup("never-issued"); ok {
		t.Error("an unknown id must not be a session")
	}
}

func TestSessions_CreateSweepsExpired(t *testing.T) {
	clock := newFakeClock()
	s := newSessions(testSessionLimits, clock.now)
	s.create("old", false)
	clock.advance(time.Hour)
	s.create("new", false)
	if len(s.byID) != 1 {
		t.Errorf("create must sweep expired sessions, table has %d", len(s.byID))
	}
}

func TestSessionCookie_FlagsAndRequestLookup(t *testing.T) {
	s := newSessions(testSessionLimits, newFakeClock().now)
	rec := httptest.NewRecorder()
	setSessionCookie(rec, s.create("alice", false))
	c := rec.Result().Cookies()[0]
	if c.Name != "__Host-smu-session" || !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/" || c.Domain != "" || c.MaxAge != 0 {
		t.Fatalf("cookie flags: %+v", c)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if _, ok := s.fromRequest(req); ok {
		t.Error("no cookie, no session")
	}
	req.AddCookie(c)
	as, ok := s.fromRequest(req)
	if !ok || as.user != "alice" || as.id != c.Value {
		t.Fatalf("fromRequest: %+v %v", as, ok)
	}
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookie, Value: "forged"})
	if _, ok := s.fromRequest(req); ok {
		t.Error("a forged id is not a session")
	}

	rec = httptest.NewRecorder()
	clearSessionCookie(rec)
	if cl := rec.Result().Cookies()[0]; cl.MaxAge >= 0 || cl.Value != "" || cl.Name != sessionCookie {
		t.Errorf("clear must expire the cookie: %+v", cl)
	}
}

func TestSessionOf_ContextRoundTrip(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if as := sessionOf(req); as.user != "" {
		t.Errorf("no session on the context: got %+v", as)
	}
	want := activeSession{id: "x", session: session{user: "alice"}}
	req = req.WithContext(withSession(req.Context(), want))
	if got := sessionOf(req); got.id != "x" || got.user != "alice" {
		t.Errorf("got %+v", got)
	}
}
