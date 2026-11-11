package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/netip"
	"strings"
	"testing"
	"time"
)

var testLoginLimits = loginLimits{maxFailures: 3, backoff: 30 * time.Second, maxBackoff: 2 * time.Minute, unauthPerMinute: 3}

func addr(t *testing.T, s string) netip.Addr {
	t.Helper()
	a, err := netip.ParseAddr(s)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestThrottle_BackoffGrowsDoublesAndCaps(t *testing.T) {
	clock := newFakeClock()
	var buf strings.Builder
	th := newThrottle(fixed(testLoginLimits), clock.now, newCapturingLogger(&buf))
	client := addr(t, "192.0.2.7")
	fail := func() time.Duration {
		th.loginFailed("alice", client, true)
		return th.loginWait("alice", client, true)
	}
	if fail() != 0 || fail() != 0 {
		t.Fatal("the first maxFailures-1 failures must not block")
	}
	waits := []time.Duration{30 * time.Second, time.Minute, 2 * time.Minute, 2 * time.Minute}
	for i, want := range waits {
		if got := fail(); got != want {
			t.Fatalf("block %d: want %v, got %v", i+1, want, got)
		}
		clock.advance(want) // a blocked attempt never reaches loginFailed
		if w := th.loginWait("alice", client, true); w != 0 {
			t.Fatalf("block %d must have ended, wait %v", i+1, w)
		}
	}
	log := buf.String()
	if n := strings.Count(log, "sign-in throttled"); n != 2 {
		t.Errorf("want one warn per key (user and client) at the first block, got %d: %s", n, log)
	}
	for _, want := range []string{"user=alice", "client=192.0.2.7/32", "retry_after_s=30"} {
		if !strings.Contains(log, want) {
			t.Errorf("warn lacks %q: %s", want, log)
		}
	}
}

func TestThrottle_SuccessResetsAndQuietPeriodForgives(t *testing.T) {
	clock := newFakeClock()
	th := newThrottle(fixed(testLoginLimits), clock.now, quietLogger())
	client := addr(t, "192.0.2.7")
	th.loginFailed("alice", client, true)
	th.loginFailed("alice", client, true)
	th.loginSucceeded("alice", client, true)
	th.loginFailed("alice", client, true)
	th.loginFailed("alice", client, true)
	if th.loginWait("alice", client, true) != 0 {
		t.Fatal("a success must reset the count")
	}
	clock.advance(testLoginLimits.maxBackoff + time.Second)
	th.loginFailed("alice", client, true)
	if th.loginWait("alice", client, true) != 0 {
		t.Fatal("after a quiet maxBackoff the old failures must be forgotten")
	}
}

// Spraying usernames from one client blocks the client; guessing one user
// from many clients blocks the user.
func TestThrottle_CountsPerUserAndPerClient(t *testing.T) {
	th := newThrottle(fixed(testLoginLimits), newFakeClock().now, quietLogger())
	sprayer := addr(t, "192.0.2.7")
	for _, u := range []string{"u1", "u2", "u3"} {
		th.loginFailed(u, sprayer, true)
	}
	if th.loginWait("u4", sprayer, true) == 0 {
		t.Error("the spraying client must be blocked for any username")
	}
	if th.loginWait("u4", addr(t, "198.51.100.1"), true) != 0 {
		t.Error("another client trying u4 must not be blocked")
	}
	for _, c := range []string{"203.0.113.1", "203.0.113.2", "203.0.113.3"} {
		th.loginFailed("target", addr(t, c), true)
	}
	if th.loginWait("target", addr(t, "203.0.113.99"), true) == 0 {
		t.Error("the targeted user must be blocked from any client")
	}
}

func TestClientKey(t *testing.T) {
	a, _ := netip.ParseAddr("2001:db8:1:2:aaaa::1")
	b, _ := netip.ParseAddr("2001:db8:1:2:bbbb::9")
	c, _ := netip.ParseAddr("2001:db8:1:3::1")
	if clientKey(a, true) != clientKey(b, true) {
		t.Error("addresses in one /64 must share a key")
	}
	if clientKey(a, true) == clientKey(c, true) {
		t.Error("different /64s must not share a key")
	}
	v4, _ := netip.ParseAddr("192.0.2.7")
	if got := clientKey(v4, true).String(); got != "192.0.2.7/32" {
		t.Errorf("IPv4 is keyed per address, got %s", got)
	}
	if clientKey(v4, false) != (netip.Prefix{}) {
		t.Error("an unresolved client gets the shared zero key")
	}
	if got := userKey(strings.Repeat("x", 100)); len(got) != 64 {
		t.Errorf("username keys are capped at 64 bytes, got %d", len(got))
	}
}

func TestThrottle_FullFailureTableFailsClosed(t *testing.T) {
	clock := newFakeClock()
	th := newThrottle(fixed(testLoginLimits), clock.now, quietLogger())
	th.maxTracked = 2
	client := addr(t, "192.0.2.7")
	th.loginFailed("u1", client, true)
	th.loginFailed("u2", client, true)
	if got := th.loginWait("u3", addr(t, "198.51.100.1"), true); got != testLoginLimits.backoff {
		t.Fatalf("an untracked user while the table is full must wait one back-off, got %v", got)
	}
	th.loginFailed("u3", client, true) // no room: not recorded
	if _, tracked := th.users["u3"]; tracked {
		t.Error("a full table must not take a new key")
	}
	clock.advance(testLoginLimits.maxBackoff + time.Second) // u1, u2 go stale
	if got := th.loginWait("u3", addr(t, "198.51.100.1"), true); got != 0 {
		t.Errorf("stale records must be pruned to make room, got wait %v", got)
	}
}

func TestThrottle_UnauthenticatedBucket(t *testing.T) {
	clock := newFakeClock()
	var buf strings.Builder
	th := newThrottle(fixed(testLoginLimits), clock.now, newCapturingLogger(&buf))
	client := addr(t, "192.0.2.7")
	for i := 0; i < 3; i++ {
		if ok, _ := th.allowUnauthenticated(client, true); !ok {
			t.Fatalf("request %d within the per-minute budget must pass", i+1)
		}
	}
	ok, wait := th.allowUnauthenticated(client, true)
	if ok || wait < 19*time.Second || wait > 21*time.Second {
		t.Fatalf("over budget: want refused with about a 20s wait (3/min), got %v %v", ok, wait)
	}
	th.allowUnauthenticated(client, true)
	if n := strings.Count(buf.String(), "unauthenticated requests throttled"); n != 1 {
		t.Errorf("want one warn per episode, got %d", n)
	}
	if ok, _ := th.allowUnauthenticated(addr(t, "198.51.100.1"), true); !ok {
		t.Error("another client has its own budget")
	}
	clock.advance(21 * time.Second)
	if ok, _ := th.allowUnauthenticated(client, true); !ok {
		t.Error("the bucket must refill at unauthPerMinute/60 per second")
	}
	th.allowUnauthenticated(client, true)
	if n := strings.Count(buf.String(), "unauthenticated requests throttled"); n != 2 {
		t.Errorf("a new episode after a pass must warn again, got %d", n)
	}
}

func TestThrottle_FullBucketTableFailsClosed(t *testing.T) {
	clock := newFakeClock()
	th := newThrottle(fixed(testLoginLimits), clock.now, quietLogger())
	th.maxTracked = 1
	th.allowUnauthenticated(addr(t, "192.0.2.7"), true)
	if ok, wait := th.allowUnauthenticated(addr(t, "198.51.100.1"), true); ok || wait != time.Minute {
		t.Fatalf("a new client while the table is full must be refused, got %v %v", ok, wait)
	}
	clock.advance(time.Minute) // the first bucket has refilled: nothing to remember
	if ok, _ := th.allowUnauthenticated(addr(t, "198.51.100.1"), true); !ok {
		t.Error("a refilled bucket must be pruned to make room")
	}
}

// The limits are read on every call, so a settings save applies at once: here a
// larger unauthenticated budget refills an empty bucket faster.
func TestThrottle_LimitsAreReadLive(t *testing.T) {
	clock := newFakeClock()
	lim := testLoginLimits
	th := newThrottle(func() loginLimits { return lim }, clock.now, quietLogger())
	client := addr(t, "192.0.2.7")
	for i := 0; i < lim.unauthPerMinute; i++ {
		th.allowUnauthenticated(client, true)
	}
	clock.advance(time.Second)
	if ok, _ := th.allowUnauthenticated(client, true); ok {
		t.Fatal("3 per minute: one second refills no whole token")
	}
	lim.unauthPerMinute = 600
	clock.advance(time.Second)
	if ok, _ := th.allowUnauthenticated(client, true); !ok {
		t.Fatal("600 per minute: one second refills ten tokens")
	}
	lim.maxFailures = 1
	th.loginFailed("bob", client, true)
	if th.loginWait("bob", client, true) == 0 {
		t.Error("with maxFailures 1 a single failure must block")
	}
}

func TestRetrySeconds(t *testing.T) {
	for d, want := range map[time.Duration]int{0: 1, 200 * time.Millisecond: 1, 1200 * time.Millisecond: 2, 30 * time.Second: 30} {
		if got := retrySeconds(d); got != want {
			t.Errorf("%v: want %d, got %d", d, want, got)
		}
	}
}

// One sign-in per account is checked at a time: a second one for the same
// account waits for the first to give its turn back, one for another account
// does not, and the table forgets an account once nobody holds or waits.
func TestThrottle_LoginTurnSerialisesAnAccount(t *testing.T) {
	th := newThrottle(fixed(testLoginLimits), newFakeClock().now, quietLogger())
	release, wait, err := th.loginTurn(context.Background(), "alice")
	if err != nil || wait != 0 {
		t.Fatalf("first turn: %v %v", wait, err)
	}
	other, _, err := th.loginTurn(context.Background(), "bob")
	if err != nil {
		t.Fatalf("another account waits for nobody: %v", err)
	}
	other()
	got := make(chan func(), 1)
	go func() {
		r, _, _ := th.loginTurn(context.Background(), "alice")
		got <- r
	}()
	select {
	case <-got:
		t.Fatal("a second sign-in for the account must wait for the first")
	case <-time.After(50 * time.Millisecond):
	}
	release()
	select {
	case second := <-got:
		second()
	case <-time.After(5 * time.Second):
		t.Fatal("the waiting sign-in never got its turn")
	}
	th.mu.Lock()
	n := len(th.turns)
	th.mu.Unlock()
	if n != 0 {
		t.Errorf("the table must forget accounts nobody holds, %d left", n)
	}
}

// A sign-in that goes away while it waits for its turn stops waiting; a free
// turn is taken whatever the request's state.
func TestThrottle_LoginTurnGivesUpWhenTheRequestGoes(t *testing.T) {
	th := newThrottle(fixed(testLoginLimits), newFakeClock().now, quietLogger())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	release, _, err := th.loginTurn(ctx, "alice")
	if err != nil {
		t.Fatalf("a free turn is taken at once: %v", err)
	}
	if _, _, err := th.loginTurn(ctx, "alice"); !errors.Is(err, context.Canceled) {
		t.Fatalf("queued and gone: want context.Canceled, got %v", err)
	}
	release()
	if len(th.turns) != 0 {
		t.Errorf("both holds must be given back, %d left", len(th.turns))
	}
}

// Each table that fills refuses new keys, and says so at most once a minute,
// naming itself and its size.
func TestThrottle_FullTablesWarnOncePerMinute(t *testing.T) {
	clock := newFakeClock()
	var buf strings.Builder
	th := newThrottle(fixed(testLoginLimits), clock.now, newCapturingLogger(&buf))
	th.maxTracked = 1
	seen, other := addr(t, "192.0.2.7"), addr(t, "198.51.100.1")
	th.loginFailed("u1", seen, true)
	th.allowUnauthenticated(seen, true)
	hold, _, _ := th.loginTurn(context.Background(), "u1")
	defer hold()
	refuse := func() {
		th.loginWait("u2", other, true) // users and clients
		th.loginFailed("u2", other, true)
		th.allowUnauthenticated(other, true)
		if _, wait, _ := th.loginTurn(context.Background(), "u2"); wait != testLoginLimits.backoff {
			t.Errorf("a new account while the turn table is full waits one back-off, got %v", wait)
		}
	}
	refuse()
	refuse()
	for _, table := range []string{"users", "clients", "buckets", "turns"} {
		if n := strings.Count(buf.String(), "table="+table+" "); n != 1 {
			t.Errorf("%s: want one warning, got %d: %s", table, n, buf.String())
		}
	}
	if !strings.Contains(buf.String(), "size=1") {
		t.Errorf("the warning names the size: %s", buf.String())
	}
	clock.advance(time.Minute)
	th.loginWait("u2", other, true)
	if n := strings.Count(buf.String(), "table=users "); n != 2 {
		t.Errorf("a minute later a full table warns again: want 2 warnings, got %d", n)
	}
}

// throttleVectors is testdata/contract/throttle.json: the rules the demo's
// fake throttle (src/mock-broker/gateway/throttle.ts) is held to as well.
type throttleVectors struct {
	Comment string `json:"_comment"`
	Limits  struct {
		MaxFailures       int `json:"maxFailures"`
		BackoffSeconds    int `json:"backoffSeconds"`
		MaxBackoffSeconds int `json:"maxBackoffSeconds"`
	} `json:"limits"`
	Cases []struct {
		Name  string `json:"name"`
		Steps []struct {
			Fail    string `json:"fail"`
			Times   int    `json:"times"`
			Succeed string `json:"succeed"`
			Advance int    `json:"advance"`
			Wait    string `json:"wait"`
			Want    int    `json:"want"`
		} `json:"steps"`
	} `json:"cases"`
}

func TestThrottle_SharedVectors(t *testing.T) {
	var v throttleVectors
	dec := json.NewDecoder(bytes.NewReader(readContract(t, "throttle.json")))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&v); err != nil || len(v.Cases) == 0 {
		t.Fatalf("throttle.json: %v (%d cases)", err, len(v.Cases))
	}
	lim := loginLimits{
		maxFailures: v.Limits.MaxFailures, unauthPerMinute: 60,
		backoff:    time.Duration(v.Limits.BackoffSeconds) * time.Second,
		maxBackoff: time.Duration(v.Limits.MaxBackoffSeconds) * time.Second,
	}
	client := addr(t, "192.0.2.10")
	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			clock := newFakeClock()
			th := newThrottle(fixed(lim), clock.now, quietLogger())
			for i, s := range c.Steps {
				switch {
				case s.Fail != "":
					for range max(s.Times, 1) {
						th.loginFailed(s.Fail, client, true)
					}
				case s.Succeed != "":
					th.loginSucceeded(s.Succeed, client, true)
				case s.Advance > 0:
					clock.advance(time.Duration(s.Advance) * time.Second)
				case s.Wait != "":
					if got := th.loginWait(s.Wait, client, true); got != time.Duration(s.Want)*time.Second {
						t.Errorf("step %d: %s waits %v, want %ds", i+1, s.Wait, got, s.Want)
					}
				default:
					t.Fatalf("step %d does nothing", i+1)
				}
			}
		})
	}
}
