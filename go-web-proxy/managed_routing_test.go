package main

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestNewManagedRouting_DisabledIsNil(t *testing.T) {
	routes, err := newManagedRouting(defaultConfig(), liveWith(nil), configSource{}, nil, io.Discard, quietLogger())
	if routes != nil || err != nil {
		t.Fatalf("Gateway mode (connModes direct): want nil, nil; got %v, %v", routes, err)
	}
}

// The real constructor, real hashing cost: bootstraps an admin and serves.
// Hashing may take half the scheduler's threads at most, so a burst of
// sign-ins leaves the rest to the relay, the sockets and the files.
func TestNewManagedRouting_Enabled(t *testing.T) {
	dir := t.TempDir()
	cfg := defaultConfig()
	cfg.hosted, cfg.connModes = true, connBoth
	cfg.usersFile = filepath.Join(dir, "users.yaml")
	cfg.connectionsFile = filepath.Join(dir, "connections.yaml")
	cfg.storeKeyFile = filepath.Join(dir, "store.key")
	cfg.auditFile = filepath.Join(dir, "audit.log")
	cfg.audit.stdout = true
	t.Setenv(envAdminPassword, "")
	t.Setenv(envAdminPasswordFile, "")
	var buf strings.Builder
	var auditOut bytes.Buffer
	routes, err := newManagedRouting(cfg, newLive(cfg), configSource{path: filepath.Join(dir, "config.yaml")}, nil, &auditOut, newCapturingLogger(&buf))
	if err != nil || routes == nil {
		t.Fatalf("want routes, got %v %v", routes, err)
	}
	t.Cleanup(func() { _ = routes.audit.close() })
	// The audit trail is open and reaches the handlers, the log file and the
	// stdout copy (audit.stdout is on) included.
	h := routes.api.(*managedHandler)
	if routes.audit == nil || h.audit != routes.audit {
		t.Fatalf("the managed handler must hold the auditor: %v", routes.audit)
	}
	for name, got := range map[string]*auditor{
		"throttle": h.throttle.audit,
		"relay":    h.relay.(*sempRelay).audit,
		"smf":      h.smf.(*smfGate).audit,
		"dial":     h.dial.(*dialer).audit,
		"pages":    routes.pages.(*authPages).audit,
	} {
		if got != routes.audit {
			t.Errorf("the %s must hold the auditor", name)
		}
	}
	routes.audit.record(auditAdmin, auditEntry{Actor: "admin", Action: auditUserCreate, Outcome: auditOK, Msg: "admin created user bob"})
	if got := fileLines(t, cfg.auditFile); len(got) != 1 || auditOut.String() != got[0]+"\n" {
		t.Errorf("audit log %q, stdout copy %q", got, auditOut.String())
	}
	st := routes.api.(*managedHandler).store
	if !strings.Contains(st.users[0].Password, "$600000$") {
		t.Error("the bootstrap hash must use the production cost")
	}
	if got, want := cap(st.hasher.slots), max(runtime.GOMAXPROCS(0)/2, 1); got != want {
		t.Errorf("hashing slots: want %d (half of GOMAXPROCS), got %d", want, got)
	}
	if !strings.Contains(buf.String(), "component=store") {
		t.Errorf("the store's lines name their component: %s", buf.String())
	}
}

// A start that cannot open the audit log fails whole: Provisioned mode never
// runs without its trail.
func TestNewManagedRouting_AuditLogErrorIsReturned(t *testing.T) {
	dir := t.TempDir()
	cfg := defaultConfig()
	cfg.hosted, cfg.connModes = true, connBoth
	cfg.usersFile = filepath.Join(dir, "users.yaml")
	cfg.connectionsFile = filepath.Join(dir, "connections.yaml")
	cfg.storeKeyFile = filepath.Join(dir, "store.key")
	cfg.auditFile = filepath.Join(dir, "audit")
	if err := os.Mkdir(cfg.auditFile, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv(envAdminPassword, "")
	t.Setenv(envAdminPasswordFile, "")
	routes, err := newManagedRouting(cfg, newLive(cfg), configSource{path: filepath.Join(dir, "config.yaml")}, nil, io.Discard, quietLogger())
	if routes != nil || err == nil || !strings.Contains(err.Error(), cfg.auditFile) {
		t.Fatalf("want no routes and an error naming the audit log, got %v, %v", routes, err)
	}
}

func TestBuildManagedRoutes_StoreErrorIsReturned(t *testing.T) {
	f := newStoreFixture(t)
	f.writeUsers(t, "msg-utility-users: [")
	cfg := defaultConfig()
	cfg.connModes, cfg.usersFile, cfg.connectionsFile, cfg.storeKeyFile = connBoth, f.usersPath, f.connsPath, f.keyPath
	if _, err := buildManagedRoutes(cfg, newLive(cfg), configSource{}, f.h, noEnv, time.Now, nil, quietLogger()); err == nil || !strings.Contains(err.Error(), f.usersPath) {
		t.Fatalf("want the store error naming the file, got %v", err)
	}
}

// Only connModes=provisioned gates the app bundle and closes the Direct relay;
// /solAdmin is gated in every mode. The settings page can change connModes, so
// both gates read it live: settings_test.go
// TestSettings_SaveAppliesLiveKeysAtOnce, and the flip below.
func TestBuildManagedRoutes_GatesByMode(t *testing.T) {
	for mode, gated := range map[string]bool{connDirect: false, connBoth: false, connProvisioned: true} {
		e := newManagedEnv(t, func(c *config) { c.connModes = mode })
		rec := e.do("GET", "/", "", nil)
		if got := rec.Code == http.StatusSeeOther; got != gated {
			t.Errorf("%s: app gated=%v, want %v", mode, got, gated)
		}
		if rec := e.do("GET", "/solAdmin", "", nil); rec.Code != http.StatusSeeOther {
			t.Errorf("%s: /solAdmin must need a session, got %d", mode, rec.Code)
		}
		for _, path := range []string{"/http/80/host/x", "/https/443/host/SEMP/v2/monitor", "/ws/80/host/", "/wss/443/host"} {
			for _, c := range []*http.Cookie{nil, e.cookie("viewer", false)} {
				rec := e.do("GET", path, "", c)
				if closed := rec.Code == http.StatusNotFound && rec.Body.String() != "relay"; closed != gated {
					t.Errorf("%s %s (cookie %v): Direct relay closed=%v, want %v (%d %q)", mode, path, c != nil, closed, gated, rec.Code, rec.Body.String())
				}
			}
		}
	}
	// A settings change applies to the next request.
	e := newManagedEnv(t, func(c *config) { c.connModes = connProvisioned })
	next := e.cfg
	next.connModes = connBoth
	e.live.apply(next)
	if got := e.do("GET", "/https/443/host/x", "", nil).Body.String(); got != "relay" {
		t.Errorf("after switching to both: want the relay, got %q", got)
	}
}
