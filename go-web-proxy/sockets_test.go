//go:build managed

package main

import (
	"reflect"
	"testing"
)

// Each revocation closes exactly the sockets it covers, once; a socket that
// already ended (removed) is never cancelled.
func TestSocketRegistry_ClosesOnlyWhatWasRevoked(t *testing.T) {
	allowed := map[string]bool{"alice/b1/v1": true, "bob/b1/v1": true, "bob/b2/v9": true}
	sr := newSocketRegistry(func(user, broker, vpn string) bool { return allowed[user+"/"+broker+"/"+vpn] }, quietLogger())
	cancelled := map[string]int{}
	open := func(name, session, user, broker, vpn string) func() {
		return sr.add(openSocket{session: session, user: user, broker: broker, vpn: vpn, cancel: func() { cancelled[name]++ }})
	}
	open("alice-1", "s-a1", "alice", "b1", "v1")
	open("alice-2", "s-a2", "alice", "b1", "v1")
	open("bob-1", "s-b", "bob", "b1", "v1")
	endBob2 := open("bob-2", "s-b", "bob", "b2", "v9")
	step := func(what string, want map[string]int) {
		t.Helper()
		if !reflect.DeepEqual(cancelled, want) {
			t.Fatalf("after %s: cancelled %v, want %v", what, cancelled, want)
		}
	}

	sr.closeSession("s-a1")
	step("closeSession", map[string]int{"alice-1": 1})
	endBob2()
	sr.closeUser("bob")
	step("closeUser", map[string]int{"alice-1": 1, "bob-1": 1})
	sr.recheck()
	step("a recheck with no change", map[string]int{"alice-1": 1, "bob-1": 1})
	allowed["alice/b1/v1"] = false
	sr.recheck()
	sr.recheck()
	step("recheck", map[string]int{"alice-1": 1, "alice-2": 1, "bob-1": 1})
}
