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
	s := newSessions(fixed(testSessionLimits), clock.now)
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
	s := newSessions(fixed(testSessionLimits), clock.now)
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

// The limits are read on every lookup: shortening them on the settings page
// ends sessions that are already older than the new limit.
func TestSessions_LimitsAreReadLive(t *testing.T) {
	clock := newFakeClock()
	lim := testSessionLimits
	s := newSessions(func() sessionLimits { return lim }, clock.now)
	id := s.create("alice", false)
	clock.advance(5 * time.Minute)
	if _, ok := s.lookup(id); !ok {
		t.Fatal("within the limits the session must be live")
	}
	lim = sessionLimits{idle: 2 * time.Minute, absolute: 4 * time.Minute}
	clock.advance(time.Minute)
	if _, ok := s.lookup(id); ok {
		t.Fatal("6 minutes after sign-in, a 4-minute absolute limit must end the session")
	}
}

// A password changed in one browser ends the user's other sessions and keeps
// the one that browser was just given; the socket hook still fires.
func TestSessions_DropOthersKeepsOne(t *testing.T) {
	s := newSessions(fixed(testSessionLimits), newFakeClock().now)
	var hooked []string
	s.onDropUser = func(user string) { hooked = append(hooked, user) }
	old, keep, other := s.create("alice", false), s.create("alice", false), s.create("bob", false)
	s.dropOthers("alice", keep)
	if _, ok := s.lookup(old); ok {
		t.Error("the user's other session must end")
	}
	for _, id := range []string{keep, other} {
		if _, ok := s.lookup(id); !ok {
			t.Errorf("session %s must survive", id)
		}
	}
	if len(hooked) != 1 || hooked[0] != "alice" {
		t.Errorf("onDropUser: %v", hooked)
	}
}

func TestSessions_DropAndDropUser(t *testing.T) {
	s := newSessions(fixed(testSessionLimits), newFakeClock().now)
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
	s := newSessions(fixed(testSessionLimits), clock.now)
	s.create("old", false)
	clock.advance(time.Hour)
	s.create("new", false)
	if len(s.byID) != 1 {
		t.Errorf("create must sweep expired sessions, table has %d", len(s.byID))
	}
}

func TestSessionCookie_FlagsAndRequestLookup(t *testing.T) {
	s := newSessions(fixed(testSessionLimits), newFakeClock().now)
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

// Ending a session on purpose fires a revocation hook (open SMF sockets
// close, sockets.go); expiry does not, by design: a socket outlives its
// session's limits. has never marks a session used.
func TestSessions_RevocationHooksFireOnlyOnPurpose(t *testing.T) {
	clock := newFakeClock()
	s := newSessions(fixed(testSessionLimits), clock.now)
	var dropped, droppedUsers []string
	s.onDrop = func(id string) { dropped = append(dropped, id) }
	s.onDropUser = func(user string) { droppedUsers = append(droppedUsers, user) }

	a, b := s.create("alice", false), s.create("bob", false)
	s.drop(a)
	if s.has(a) || !s.has(b) || len(dropped) != 1 || dropped[0] != a {
		t.Fatalf("drop: has(a)=%v has(b)=%v hooks=%q", s.has(a), s.has(b), dropped)
	}
	s.dropUser("bob")
	s.dropUser("nobody") // no session left, but a socket may have outlived it
	if s.has(b) || len(droppedUsers) != 2 || droppedUsers[0] != "bob" || droppedUsers[1] != "nobody" {
		t.Fatalf("dropUser: has(b)=%v hooks=%q", s.has(b), droppedUsers)
	}

	c := s.create("carol", false)
	clock.advance(testSessionLimits.idle - time.Minute)
	if !s.has(c) {
		t.Fatal("a live session must be present")
	}
	clock.advance(2 * time.Minute)
	if _, ok := s.lookup(c); ok {
		t.Fatal("has must not count as use: the session should have gone idle")
	}
	d := s.create("dave", false)
	clock.advance(testSessionLimits.absolute)
	s.create("erin", false) // the sweep removes dave's expired session
	if s.has(d) {
		t.Fatal("the sweep must remove an expired session")
	}
	if len(dropped) != 1 || len(droppedUsers) != 2 {
		t.Errorf("expiry fired a revocation hook: %q %q", dropped, droppedUsers)
	}
}

// ----- sign-in tickets ---------------------------------------------------------------

func newTestTickets() (*signinTickets, *fakeClock) {
	clock := newFakeClock()
	return newSigninTickets(clock.now), clock
}

func TestTickets_CreateAndLookupKeepEveryField(t *testing.T) {
	tk, clock := newTestTickets()
	id := tk.create(ticket{user: "alice", stage: stageEnrol, hash: "h1", mustChange: true, secret: "SECRET"})
	if len(id) != 43 {
		t.Errorf("want 32 random bytes in base64url, got %q", id)
	}
	got, ok := tk.lookup(id)
	want := ticket{user: "alice", stage: stageEnrol, hash: "h1", mustChange: true, secret: "SECRET", created: clock.now()}
	if !ok || got != want {
		t.Errorf("got %+v, %v; want %+v", got, ok, want)
	}
	if _, ok := tk.lookup("not-a-ticket"); ok {
		t.Error("an unknown id is absent")
	}
	// A returned copy cannot edit the table.
	got.stage = stageCode
	if again, _ := tk.lookup(id); again.stage != stageEnrol {
		t.Error("lookup must hand out a copy")
	}
}

// Creating a ticket replaces nothing: the caller drops the browser's old one.
func TestTickets_CreateReplacesNothing(t *testing.T) {
	tk, _ := newTestTickets()
	a := tk.create(ticket{user: "alice", stage: stageCode})
	b := tk.create(ticket{user: "alice", stage: stageCode})
	if a == b {
		t.Fatal("every ticket has its own id")
	}
	if _, ok := tk.lookup(a); !ok {
		t.Error("the earlier ticket must still be live until the caller drops it")
	}
	tk.drop(a)
	if _, ok := tk.lookup(a); ok {
		t.Error("a dropped ticket is gone")
	}
	if _, ok := tk.lookup(b); !ok {
		t.Error("dropping one ticket must leave the other")
	}
	tk.drop("unknown") // not an error
}

// A ticket lives ticketTTL from create; using it does not extend it.
func TestTickets_ExpireTenMinutesAfterCreate(t *testing.T) {
	tk, clock := newTestTickets()
	id := tk.create(ticket{user: "alice", stage: stageCode})
	clock.advance(ticketTTL - time.Second)
	if _, ok := tk.lookup(id); !ok {
		t.Fatal("a ticket must be live just before its time is up")
	}
	clock.advance(time.Second)
	if _, ok := tk.lookup(id); ok {
		t.Fatal("a ticket must end ticketTTL after it was made, however often it was used")
	}
	if len(tk.byID) != 0 {
		t.Error("an expired ticket must be removed when seen")
	}
}

func TestTickets_SweepOnCreateRemovesTheExpired(t *testing.T) {
	tk, clock := newTestTickets()
	old := tk.create(ticket{user: "alice", stage: stageCode})
	clock.advance(ticketTTL / 2)
	fresh := tk.create(ticket{user: "bob", stage: stageCode})
	clock.advance(ticketTTL/2 + time.Second) // alice's is past its time, bob's is not
	tk.create(ticket{user: "carol", stage: stageCode})
	if _, held := tk.byID[old]; held {
		t.Error("the sweep must remove an expired ticket nobody asked for")
	}
	if _, ok := tk.lookup(fresh); !ok || len(tk.byID) != 2 {
		t.Errorf("the sweep must keep the live ones: %d held", len(tk.byID))
	}
}

func TestTickets_DropUserEndsOnlyThatUsersTickets(t *testing.T) {
	tk, _ := newTestTickets()
	a1 := tk.create(ticket{user: "alice", stage: stageCode})
	a2 := tk.create(ticket{user: "alice", stage: stageSetup})
	b := tk.create(ticket{user: "bob", stage: stageCode})
	tk.dropUser("alice")
	for _, id := range []string{a1, a2} {
		if _, ok := tk.lookup(id); ok {
			t.Error("every ticket of the user must end")
		}
	}
	if _, ok := tk.lookup(b); !ok {
		t.Error("another user's ticket must survive")
	}
	tk.dropUser("nobody") // not an error
}

// The sessions table owns a ticket table, and the two revocations that end a
// user's sessions end that user's tickets too: one call for both.
func TestSessions_DropUserAndDropOthersEndTheUsersTickets(t *testing.T) {
	clock := newFakeClock()
	s := newSessions(fixed(testSessionLimits), clock.now)
	keep := s.create("alice", false)
	a1 := s.tickets.create(ticket{user: "alice", stage: stageCode})
	b := s.tickets.create(ticket{user: "bob", stage: stageCode})
	s.dropOthers("alice", keep)
	if _, ok := s.tickets.lookup(a1); ok {
		t.Error("dropOthers must end the user's tickets")
	}
	if !s.has(keep) {
		t.Error("dropOthers must keep the session it was asked to spare")
	}
	a2 := s.tickets.create(ticket{user: "alice", stage: stageSetup})
	s.dropUser("alice")
	if _, ok := s.tickets.lookup(a2); ok || s.has(keep) {
		t.Error("dropUser must end the user's sessions and tickets")
	}
	if _, ok := s.tickets.lookup(b); !ok {
		t.Error("another user's ticket must survive")
	}
}

func TestSigninCookie_Attributes(t *testing.T) {
	rec := httptest.NewRecorder()
	setSigninCookie(rec, "the-id")
	cs := rec.Result().Cookies()
	if len(cs) != 1 {
		t.Fatalf("want one cookie, got %d", len(cs))
	}
	c := cs[0]
	if c.Name != "__Host-smu-signin" || c.Value != "the-id" || c.Path != "/" || c.Domain != "" {
		t.Errorf("a __Host- cookie needs Path=/ and no Domain: %+v", c)
	}
	if !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Errorf("want Secure, HttpOnly and SameSite=Strict: %+v", c)
	}
	if c.MaxAge != 0 || !c.Expires.IsZero() {
		t.Errorf("a browser-session cookie carries no lifetime: %+v", c)
	}

	rec = httptest.NewRecorder()
	clearSigninCookie(rec)
	c = rec.Result().Cookies()[0]
	if c.Name != "__Host-smu-signin" || c.Value != "" || c.MaxAge != -1 || c.Path != "/" || !c.Secure || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Errorf("the clearing cookie must keep the attributes and expire at once: %+v", c)
	}
}

func TestTickets_FromRequest(t *testing.T) {
	tk, clock := newTestTickets()
	id := tk.create(ticket{user: "alice", stage: stageCode, hash: "h"})
	req := func(cookies ...*http.Cookie) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/login/code", nil)
		for _, c := range cookies {
			r.AddCookie(c)
		}
		return r
	}
	got, ok := tk.fromRequest(req(&http.Cookie{Name: signinCookie, Value: id}))
	if !ok || got.id != id || got.user != "alice" || got.stage != stageCode || got.hash != "h" {
		t.Errorf("got %+v, %v", got, ok)
	}
	if _, ok := tk.fromRequest(req()); ok {
		t.Error("no cookie, no ticket")
	}
	if _, ok := tk.fromRequest(req(&http.Cookie{Name: sessionCookie, Value: id})); ok {
		t.Error("a session cookie is not a ticket cookie")
	}
	if _, ok := tk.fromRequest(req(&http.Cookie{Name: signinCookie, Value: "forged"})); ok {
		t.Error("an unknown id is no ticket")
	}
	clock.advance(ticketTTL)
	if _, ok := tk.fromRequest(req(&http.Cookie{Name: signinCookie, Value: id})); ok {
		t.Error("an expired ticket is no ticket")
	}
}
