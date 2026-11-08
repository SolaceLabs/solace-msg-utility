package main

import (
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
