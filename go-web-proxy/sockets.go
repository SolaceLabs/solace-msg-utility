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
}

type openSocket struct {
	session, user, broker, vpn string
	cancel                     context.CancelFunc // ends the socket's context: smf.go closes both sides
}

func newSocketRegistry(allowed func(user, broker, vpn string) bool, logger *slog.Logger) *socketRegistry {
	return &socketRegistry{open: map[uint64]openSocket{}, allowed: allowed, logger: logger}
}

// add registers a socket; the returned func removes it once the socket ends.
func (sr *socketRegistry) add(s openSocket) (remove func()) {
	sr.mu.Lock()
	id := sr.next
	sr.next++
	sr.open[id] = s
	sr.mu.Unlock()
	return func() {
		sr.mu.Lock()
		delete(sr.open, id)
		sr.mu.Unlock()
	}
}

func (sr *socketRegistry) closeSession(id string) {
	sr.closeWhere("signed out", func(s openSocket) bool { return s.session == id })
}

func (sr *socketRegistry) closeUser(user string) {
	sr.closeWhere("user changed", func(s openSocket) bool { return s.user == user })
}

// recheck closes every socket whose user may no longer reach its VPN.
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
