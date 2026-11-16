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
		remove, ok := sr.add(openSocket{session: session, user: user, broker: broker, vpn: vpn, cancel: func() { cancelled[name]++ }})
		if !ok {
			t.Fatalf("%s: a socket well under the ceilings was refused", name)
		}
		return remove
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
	// A closed socket stays listed until its goroutine removes it, which this
	// test has none to do: lift the ceilings so every attempt is judged on access.
	sr.perUser, sr.total = 1<<30, 1<<30
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
				remove, _ := sr.add(openSocket{session: "s", user: "viewer", broker: "b1", vpn: "v1", cancel: func() { a.closed.Store(true) }})
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

// A user holds at most perUser open sockets and the gateway at most total: a
// refused socket registers nothing (so nothing of it can be cancelled or
// counted), and closing one admits the next.
func TestSocketRegistry_CeilingsRefuseAndRegisterNothing(t *testing.T) {
	sr := newSocketRegistry(func(string, string, string) bool { return true }, quietLogger())
	sr.perUser, sr.total = 2, 3
	var cancelled atomic.Int32
	add := func(user string) (func(), bool) {
		return sr.add(openSocket{session: "s-" + user, user: user, broker: "b1", vpn: "v1", cancel: func() { cancelled.Add(1) }})
	}
	count := func() int {
		sr.mu.Lock()
		defer sr.mu.Unlock()
		return len(sr.open)
	}
	removeA1, ok := add("alice")
	if _, ok2 := add("alice"); !ok || !ok2 {
		t.Fatal("two sockets are within the per-user ceiling")
	}
	if remove, ok := add("alice"); ok || remove != nil || count() != 2 {
		t.Fatalf("a third socket for alice: want refused and unregistered, got ok=%v remove nil=%v open=%d", ok, remove == nil, count())
	}
	if _, ok := add("bob"); !ok {
		t.Fatal("another user is not held to alice's count")
	}
	if _, ok := add("carol"); ok || count() != 3 {
		t.Fatalf("the fourth socket in all: want refused by the total ceiling, got ok=%v open=%d", ok, count())
	}
	sr.closeUser("carol")
	if cancelled.Load() != 0 {
		t.Error("a refused socket was registered: a revocation cancelled it")
	}
	removeA1()
	if _, ok := add("carol"); !ok {
		t.Error("closing one socket must admit the next")
	}
	if _, ok := add("alice"); ok {
		t.Error("alice is back at the total ceiling, not below it")
	}
}

// The ceilings are the documented ones until a test lowers them.
func TestNewSocketRegistry_StartsAtTheCeilings(t *testing.T) {
	sr := newSocketRegistry(func(string, string, string) bool { return true }, quietLogger())
	if sr.perUser != 20 || sr.total != 1000 {
		t.Errorf("want 20 per user and 1000 in all, got %d and %d", sr.perUser, sr.total)
	}
}
