package main

import (
	"context"
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
// session draws from a per-client token bucket of unauthPerMinute. Sign-ins
// for one account are checked one at a time (loginTurn), so parallel guesses
// cannot all pass the check before the first failure is counted.
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
	turns      map[string]*turn     // accounts with a sign-in being checked (loginTurn)
	fullWarned map[string]time.Time // when tableFull last warned, per table
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

// turn is one account's sign-in slot: token holds a value while a sign-in
// for the account is being checked, and refs counts the requests holding or
// waiting for it. The entry goes when the last of them leaves, so the table
// holds only accounts with a sign-in in flight.
type turn struct {
	token chan struct{}
	refs  int
}

func newThrottle(limits func() loginLimits, now func() time.Time, logger *slog.Logger) *throttle {
	return &throttle{
		limits: limits, now: now, logger: logger, maxTracked: throttleMaxTracked,
		users:      map[string]*failures{},
		clients:    map[netip.Prefix]*failures{},
		buckets:    map[netip.Prefix]*bucket{},
		turns:      map[string]*turn{},
		fullWarned: map[string]time.Time{},
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

// loginTurn waits until no other sign-in for user is being checked, then
// returns release, which the caller calls once the attempt is recorded. One
// check per account at a time means each guess is looked at only after the
// one before it was counted: parallel guesses queue behind the first and meet
// its failure in loginWait, so no more than maxFailures of them reach the
// password check. A free turn is taken at once, whatever the request's state.
// When the table of accounts with a sign-in in flight is full, a new account
// waits one back-off (wait > 0), as failureWait fails closed; err is the
// request going away while it queued.
func (t *throttle) loginTurn(ctx context.Context, user string) (release func(), wait time.Duration, err error) {
	k := userKey(user)
	t.mu.Lock()
	tn := t.turns[k]
	if tn == nil {
		if len(t.turns) >= t.maxTracked {
			t.lim = t.limits()
			t.tableFull("turns", len(t.turns), t.now())
			wait = t.lim.backoff
			t.mu.Unlock()
			return nil, wait, nil
		}
		tn = &turn{token: make(chan struct{}, 1)}
		t.turns[k] = tn
	}
	tn.refs++
	t.mu.Unlock()
	release = func() {
		<-tn.token
		t.leave(k, tn)
	}
	select {
	case tn.token <- struct{}{}:
		return release, 0, nil
	default:
	}
	select {
	case tn.token <- struct{}{}:
		return release, 0, nil
	case <-ctx.Done():
		t.leave(k, tn)
		return nil, 0, ctx.Err()
	}
}

// leave drops one request's hold on an account's turn, and the entry with
// the last one.
func (t *throttle) leave(k string, tn *turn) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if tn.refs--; tn.refs == 0 {
		delete(t.turns, k)
	}
}

// loginWait is how long a sign-in for user from client must wait; 0 means it
// may proceed to the password check. A key that is not tracked while its table
// is full (after pruning) waits one back-off: the throttle fails closed.
func (t *throttle) loginWait(user string, client netip.Addr, ok bool) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lim = t.limits()
	now := t.now()
	return max(failureWait(t, t.users, userKey(user), now, "users"), failureWait(t, t.clients, clientKey(client, ok), now, "clients"))
}

func failureWait[K comparable](t *throttle, m map[K]*failures, k K, now time.Time, table string) time.Duration {
	if f := m[k]; f != nil {
		return max(f.blockedUntil.Sub(now), 0)
	}
	if !hasRoom(t, m, now) {
		t.tableFull(table, len(m), now)
		return t.lim.backoff
	}
	return 0
}

// tableFull warns that a table is full and a new key was refused, at most
// once a minute per table: the flood that fills a table must not flood the
// log as well. t.mu must be held.
func (t *throttle) tableFull(table string, size int, now time.Time) {
	if last, ok := t.fullWarned[table]; ok && now.Sub(last) < time.Minute {
		return
	}
	t.fullWarned[table] = now
	t.logger.Warn("throttle table full: new keys are refused until entries expire", "table", table, "size", size)
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
			t.tableFull(kind+"s", len(m), now) // loginWait already refuses untracked keys while full
			return
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
				t.tableFull("buckets", len(t.buckets), now)
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
