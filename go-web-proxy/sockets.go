package main

import (
	"context"
	"log/slog"
	"sync"
)

// socketRegistry tracks the open SMF sockets (smf.go) so the gateway can close
// them when access is revoked. There is no idle or absolute timer: the SMF
// API's own keep-alive owns a connection's lifetime, so a socket may outlive
// its session's limits. It closes on:
//
//   - sign-out, or a sign-in replacing the session (sessions.onDrop)
//   - a password change, a changed admin flag or a deleted user
//     (sessions.onDropUser)
//   - any user or connection edit after which the user may no longer reach
//     the socket's VPN (store.onChange -> recheck): an entitlement removed,
//     the VPN removed from the broker, the broker deleted
type socketRegistry struct {
	mu   sync.Mutex
	next uint64
	open map[uint64]openSocket

	// allowed is the store's entitlement check. It is called with mu held;
	// it takes only the store's lock and never calls back in here.
	allowed func(user, broker, vpn string) bool
	logger  *slog.Logger
	// perUser and total are the open-socket ceilings (maxSocketsPerUser,
	// maxSocketsTotal); fields so tests can lower them.
	perUser, total int
}

type openSocket struct {
	session, user, broker, vpn string
	cancel                     context.CancelFunc // ends the socket's context: smf.go closes both sides
}

// The ceilings on open sockets. The connect rate (session.connectsPerMinute)
// bounds how fast sockets open, not how many stay open, and each one holds two
// goroutines and two file descriptors until the SMF keep-alive ends it. A
// browser tab holds one socket per connection (two with a Queue Copy
// destination), so the per-user ceiling leaves room for many tabs.
const (
	maxSocketsPerUser = 20
	maxSocketsTotal   = 1000
)

func newSocketRegistry(allowed func(user, broker, vpn string) bool, logger *slog.Logger) *socketRegistry {
	return &socketRegistry{
		open: map[uint64]openSocket{}, allowed: allowed, logger: logger,
		perUser: maxSocketsPerUser, total: maxSocketsTotal,
	}
}

// add registers a socket; the returned func removes it once the socket ends.
// ok is false, and nothing is registered, when the user already holds
// perUser open sockets or the gateway holds total.
func (sr *socketRegistry) add(s openSocket) (remove func(), ok bool) {
	sr.mu.Lock()
	held := 0
	for _, o := range sr.open {
		if o.user == s.user {
			held++
		}
	}
	if total := len(sr.open); held >= sr.perUser || total >= sr.total {
		sr.mu.Unlock()
		sr.logger.Warn("smf socket refused: too many open sockets", "user", s.user, "user_open", held, "total_open", total)
		return nil, false
	}
	id := sr.next
	sr.next++
	sr.open[id] = s
	sr.mu.Unlock()
	return func() {
		sr.mu.Lock()
		delete(sr.open, id)
		sr.mu.Unlock()
	}, true
}

func (sr *socketRegistry) closeSession(id string) {
	sr.closeWhere("signed out", func(s openSocket) bool { return s.session == id })
}

func (sr *socketRegistry) closeUser(user string) {
	sr.closeWhere("user changed", func(s openSocket) bool { return s.user == user })
}

// recheck closes every socket whose user may no longer reach its VPN. It is
// the store's after-commit hook and is level-triggered: it looks at the state
// as it is now, not at what the commit changed, so running it twice, or after
// a commit that changed nothing for a socket, is harmless. A socket is added
// to the registry before smf.go checks its access, so one that was judged on
// the snapshot from before a commit is already listed when the commit's hook
// runs, and the hook closes it.
func (sr *socketRegistry) recheck() {
	sr.closeWhere("access changed", func(s openSocket) bool { return !sr.allowed(s.user, s.broker, s.vpn) })
}

// closeWhere removes the matching sockets under the lock and cancels them
// outside it.
func (sr *socketRegistry) closeWhere(reason string, match func(openSocket) bool) {
	sr.mu.Lock()
	var closing []openSocket
	for id, s := range sr.open {
		if match(s) {
			closing = append(closing, s)
			delete(sr.open, id)
		}
	}
	sr.mu.Unlock()
	for _, s := range closing {
		s.cancel()
		sr.logger.Info("smf socket closed", "user", s.user, "broker", s.broker, "vpn", s.vpn, "reason", reason)
	}
}
