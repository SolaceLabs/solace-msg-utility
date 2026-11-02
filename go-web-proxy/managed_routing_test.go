//go:build managed

package main

import (
	"net/http"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewManagedRouting_DisabledIsNil(t *testing.T) {
	routes, err := newManagedRouting(defaultConfig(), liveWith(nil), configSource{}, nil, quietLogger())
	if routes != nil || err != nil {
		t.Fatalf("managed false: want nil, nil; got %v, %v", routes, err)
	}
}

// The real constructor, real hashing cost: bootstraps an admin and serves.
func TestNewManagedRouting_Enabled(t *testing.T) {
	dir := t.TempDir()
	cfg := defaultConfig()
	cfg.hosted, cfg.managed, cfg.connModes = true, true, connBoth
	cfg.usersFile = filepath.Join(dir, "users.yaml")
	cfg.connectionsFile = filepath.Join(dir, "connections.yaml")
	cfg.siteSeedFile = filepath.Join(dir, "site.seed")
	cfg.storeKeyFile = filepath.Join(dir, "store.key")
	t.Setenv(envAdminPassword, "")
	t.Setenv(envAdminPasswordFile, "")
	var buf strings.Builder
	routes, err := newManagedRouting(cfg, newLive(cfg), configSource{path: filepath.Join(dir, "config.yaml")}, nil, newCapturingLogger(&buf))
	if err != nil || routes == nil {
		t.Fatalf("want routes, got %v %v", routes, err)
	}
	if !strings.Contains(buf.String(), "managed mode enabled") || !strings.Contains(buf.String(), "app_gated=false") {
		t.Errorf("startup log: %s", buf.String())
	}
	if !strings.Contains(routes.api.(*managedHandler).store.users[0].Password, "$600000$") {
		t.Error("the bootstrap hash must use the production cost")
	}
}

func TestBuildManagedRoutes_StoreErrorIsReturned(t *testing.T) {
	f := newStoreFixture(t)
	f.writeUsers(t, "msg-utility-users: [")
	cfg := defaultConfig()
	cfg.managed, cfg.usersFile, cfg.connectionsFile, cfg.siteSeedFile, cfg.storeKeyFile = true, f.usersPath, f.connsPath, f.seedPath, f.keyPath
	if _, err := buildManagedRoutes(cfg, newLive(cfg), configSource{}, f.h, noEnv, time.Now, nil, quietLogger()); err == nil || !strings.Contains(err.Error(), f.usersPath) {
		t.Fatalf("want the store error naming the file, got %v", err)
	}
}

// Only connModes=managed gates the app bundle; /solAdmin is gated in every mode.
// The settings page can change connModes, so the gate reads it live:
// settings_test.go TestSettings_SaveAppliesLiveKeysAtOnce.
func TestBuildManagedRoutes_GatesByMode(t *testing.T) {
	for mode, gated := range map[string]bool{connDirect: false, connBoth: false, connManaged: true} {
		e := newManagedEnv(t, func(c *config) { c.connModes = mode })
		rec := e.do("GET", "/", "", nil)
		if got := rec.Code == http.StatusSeeOther; got != gated {
			t.Errorf("%s: app gated=%v, want %v", mode, got, gated)
		}
		if rec := e.do("GET", "/solAdmin", "", nil); rec.Code != http.StatusSeeOther {
			t.Errorf("%s: /solAdmin must need a session, got %d", mode, rec.Code)
		}
	}
}
