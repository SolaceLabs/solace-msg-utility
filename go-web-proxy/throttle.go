package main

import (
	"log/slog"
	"math"
	"net/netip"
	"sync"
	"time"
)

// throttleMaxTracked caps each table. When a table is full and nothing in it
// has expired, a new key is refused: a flood of fresh addresses or usernames
// costs the attacker a 429, never the gateway its memory.
const throttleMaxTracked = 10_000

// throttle slows password guessing and probing. Sign-in failures are counted
// per username and per client; after maxFailures each further failure blocks
// that key for backoff, doubling up to maxBackoff, and a blocked attempt is
// refused before any password is checked. Separately, every request without a
// session draws from a per-client token bucket of unauthPerMinute.
//
// Clients are keyed by address, IPv6 by its /64: one host usually owns a whole
// /64, so rotating within it buys nothing.
type throttle struct {
	mu         sync.Mutex
	limits     func() loginLimits // the live login.* settings
	lim        loginLimits        // limits() as read at the start of the current call, under mu
	now        func() time.Time
	logger     *slog.Logger
	maxTracked int
	users      map[string]*failures
	clients    map[netip.Prefix]*failures
	buckets    map[netip.Prefix]*bucket
}

type failures struct {
	count        int
	last         time.Time
	blockedUntil time.Time
}

type bucket struct {
	tokens  float64
	last    time.Time
	limited bool // a warn was logged for this episode
}

func newThrottle(limits func() loginLimits, now func() time.Time, logger *slog.Logger) *throttle {
	return &throttle{
		limits: limits, now: now, logger: logger, maxTracked: throttleMaxTracked,
		users:   map[string]*failures{},
		clients: map[netip.Prefix]*failures{},
		buckets: map[netip.Prefix]*bucket{},
	}
}

// clientKey groups addresses for counting. An unresolved client (ok false)
// shares the zero key with every other unresolved one.
func clientKey(addr netip.Addr, ok bool) netip.Prefix {
	if !ok {
		return netip.Prefix{}
	}
	bits := 32
	if addr.Is6() {
		bits = 64
	}
	p, _ := addr.Prefix(bits)
	return p
}

// userKey bounds the username used as a map key; the form field is attacker
// supplied.
func userKey(user string) string {
	if len(user) > 64 {
		return user[:64]
	}
	return user
}

// stale reports whether a failure record no longer matters: not blocked, and
// quiet for longer than the longest back-off.
func (t *throttle) stale(f *failures, now time.Time) bool {
	return !now.Before(f.blockedUntil) && now.Sub(f.last) > t.lim.maxBackoff
}

// loginWait is how long a sign-in for user from client must wait; 0 means it
// may proceed to the password check. A key that is not tracked while its table
// is full (after pruning) waits one back-off: the throttle fails closed.
func (t *throttle) loginWait(user string, client netip.Addr, ok bool) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lim = t.limits()
	now := t.now()
	return max(failureWait(t, t.users, userKey(user), now), failureWait(t, t.clients, clientKey(client, ok), now))
}

func failureWait[K comparable](t *throttle, m map[K]*failures, k K, now time.Time) time.Duration {
	if f := m[k]; f != nil {
		return max(f.blockedUntil.Sub(now), 0)
	}
	if !hasRoom(t, m, now) {
		return t.lim.backoff
	}
	return 0
}

// hasRoom reports whether m may take a new key, pruning stale records first
// when it is full.
func hasRoom[K comparable](t *throttle, m map[K]*failures, now time.Time) bool {
	if len(m) < t.maxTracked {
		return true
	}
	for k, f := range m {
		if t.stale(f, now) {
			delete(m, k)
		}
	}
	return len(m) < t.maxTracked
}

// loginFailed records a failed sign-in against both keys.
func (t *throttle) loginFailed(user string, client netip.Addr, ok bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lim = t.limits()
	now := t.now()
	ck := clientKey(client, ok)
	recordFailure(t, t.users, userKey(user), now, "user", userKey(user))
	recordFailure(t, t.clients, ck, now, "client", ck.String())
}

// recordFailure bumps one key's count and blocks it once it reaches
// maxFailures. The first block logs a warn: that line is the "burst of failed
// sign-ins" signal for the operator.
func recordFailure[K comparable](t *throttle, m map[K]*failures, k K, now time.Time, kind, label string) {
	f := m[k]
	if f != nil && t.stale(f, now) {
		f.count = 0
	}
	if f == nil {
		if !hasRoom(t, m, now) {
			return // loginWait already refuses untracked keys while full
		}
		f = &failures{}
		m[k] = f
	}
	f.count++
	f.last = now
	if f.count < t.lim.maxFailures {
		return
	}
	backoff := t.lim.backoff
	for i := t.lim.maxFailures; i < f.count && backoff < t.lim.maxBackoff; i++ {
		backoff *= 2
	}
	backoff = min(backoff, t.lim.maxBackoff)
	f.blockedUntil = now.Add(backoff)
	if f.count == t.lim.maxFailures {
		t.logger.Warn("sign-in throttled after repeated failures", kind, label, "failures", f.count, "retry_after_s", int(backoff.Seconds()))
	}
}

// loginSucceeded clears both keys' failure counts.
func (t *throttle) loginSucceeded(user string, client netip.Addr, ok bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.users, userKey(user))
	delete(t.clients, clientKey(client, ok))
}

// allowUnauthenticated takes one token from the client's bucket. When it is
// empty the caller answers 429 with the returned wait.
func (t *throttle) allowUnauthenticated(client netip.Addr, ok bool) (bool, time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lim = t.limits()
	now := t.now()
	capacity := float64(t.lim.unauthPerMinute)
	perSecond := capacity / 60
	k := clientKey(client, ok)
	b := t.buckets[k]
	if b == nil {
		if len(t.buckets) >= t.maxTracked {
			// A bucket that has refilled says nothing a new one would not.
			for bk, old := range t.buckets {
				if old.tokens+now.Sub(old.last).Seconds()*perSecond >= capacity {
					delete(t.buckets, bk)
				}
			}
			if len(t.buckets) >= t.maxTracked {
				return false, time.Minute
			}
		}
		b = &bucket{tokens: capacity, last: now}
		t.buckets[k] = b
	}
	b.tokens = min(capacity, b.tokens+now.Sub(b.last).Seconds()*perSecond)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		b.limited = false
		return true, 0
	}
	if !b.limited {
		b.limited = true
		t.logger.Warn("unauthenticated requests throttled", "client", k.String(), "limit_per_minute", t.lim.unauthPerMinute)
	}
	return false, time.Duration((1 - b.tokens) / perSecond * float64(time.Second))
}

// retrySeconds is a Retry-After value: whole seconds, rounded up, at least 1.
func retrySeconds(d time.Duration) int {
	return max(int(math.Ceil(d.Seconds())), 1)
}
