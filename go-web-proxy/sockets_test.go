package main

import (
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"
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

// The store's after-commit hook looks at the state as it is, not at what the
// commit changed: a commit that leaves a socket's access alone leaves the
// socket, one that takes the VPN away closes it once however often the hook
// runs, and a socket listed after that commit (judged on the snapshot from
// before it) is closed by the next run.
func TestSockets_AfterCommitHookIsLevelTriggered(t *testing.T) {
	e := newManagedEnv(t, nil)
	st, sr := e.api.store, e.api.smf.(*smfGate).sockets
	var closed atomic.Int32
	list := func() {
		sr.add(openSocket{session: "s", user: "viewer", broker: "b1", vpn: "v1", cancel: func() { closed.Add(1) }})
	}
	viewer := func(rows ...permRow) userRec {
		return userRec{Username: "viewer", ReadOnly: rows, Modules: &[]string{"queue-browser"}}
	}
	list()
	putUser(t, st, viewer(permRow{Brokers: "b1", MsgVpns: "v1", Queues: "*"}), "")
	if closed.Load() != 0 {
		t.Fatal("an edit that keeps the access must leave the socket open")
	}
	putUser(t, st, viewer(), "")
	st.onChange()
	st.onChange()
	sr.recheck()
	if closed.Load() != 1 {
		t.Fatalf("the VPN was taken away: want the socket closed once, got %d", closed.Load())
	}
	list() // judged on the old snapshot, listed after the commit
	st.onChange()
	if closed.Load() != 2 {
		t.Errorf("the next run of the hook must close it, got %d closed", closed.Load())
	}
}

// Sockets listed while commits take the entitlement away and give it back:
// once the last commit has run its hook, every socket was either refused at
// its access check or has been closed, whichever side of a commit it landed on.
// The order smf.go keeps (listed first, checked second) is what makes that so.
func TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(t *testing.T) {
	e := newManagedEnv(t, nil)
	st, sr := e.api.store, e.api.smf.(*smfGate).sockets
	type attempt struct {
		refused bool
		closed  atomic.Bool
	}
	var mu sync.Mutex
	var attempts []*attempt
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				a := &attempt{}
				remove := sr.add(openSocket{session: "s", user: "viewer", broker: "b1", vpn: "v1", cancel: func() { a.closed.Store(true) }})
				if _, ok := st.smfTarget("viewer", "b1", "v1"); !ok {
					remove()
					a.refused = true
				}
				mu.Lock()
				attempts = append(attempts, a)
				mu.Unlock()
				time.Sleep(50 * time.Microsecond)
			}
		}()
	}
	with := []permRow{{Brokers: "b1", MsgVpns: "v1", Queues: "*"}}
	for i := range 20 {
		rows := with
		if i%2 == 1 {
			rows = nil
		}
		putUser(t, st, userRec{Username: "viewer", ReadOnly: rows, Modules: &[]string{"queue-browser"}}, "")
	}
	// The last commit left the viewer without the VPN.
	close(stop)
	wg.Wait()
	mu.Lock()
	defer mu.Unlock()
	for i, a := range attempts {
		if !a.refused && !a.closed.Load() {
			t.Fatalf("socket %d of %d was neither refused nor closed after the last commit", i, len(attempts))
		}
	}
}
