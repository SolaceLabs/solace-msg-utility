package main

import (
	"log/slog"
	"reflect"
	"testing"
	"time"
)

// liveWith is the live settings of defaultConfig after mutate.
func liveWith(mutate func(*config)) *live {
	cfg := defaultConfig()
	if mutate != nil {
		mutate(&cfg)
	}
	return newLive(cfg)
}

// fixed is a getter that always returns v, for a component under test that
// reads live settings.
func fixed[T any](v T) func() T { return func() T { return v } }

func TestLive_ApplySwapsEveryLiveKey(t *testing.T) {
	lv := liveWith(nil)
	if lv.level.Level() != slog.LevelWarn || lv.get().connModes != connDirect {
		t.Fatalf("defaults: level %v, %+v", lv.level.Level(), lv.get())
	}
	before := lv.get()
	cfg := defaultConfig()
	cfg.connModes, cfg.defaultConn, cfg.logLevel = connBoth, connProvisioned, slog.LevelDebug
	cfg.session = sessionLimits{idle: time.Minute, absolute: 2 * time.Minute}
	cfg.login.maxFailures = 9
	cfg.modules = moduleSettings{offered: []string{"queue-copy"}, userDefault: modulesDefaultNone}
	lv.apply(cfg)
	got := lv.get()
	if got.connModes != connBoth || got.defaultConn != connProvisioned || lv.level.Level() != slog.LevelDebug {
		t.Errorf("modes or level not applied: %+v, %v", got, lv.level.Level())
	}
	if lv.sessionLimits() != cfg.session || lv.loginLimits() != cfg.login || !reflect.DeepEqual(got.modules, cfg.modules) {
		t.Errorf("limits or modules not applied: %+v", got)
	}
	if before.connModes != connDirect {
		t.Error("apply must swap in a new value, never edit the one a reader holds")
	}
}

func TestPendingRestart(t *testing.T) {
	running := defaultConfig()
	file := fileConfigFromConfig(running)
	if got := pendingRestart(running, file); len(got) != 0 {
		t.Fatalf("same file: want none, got %v", got)
	}
	// Live keys never need a restart.
	file.LogLevel, file.ConnModes, file.Session.IdleMinutes = "debug", connBoth, 1
	file.Access.Allow = []string{"10.0.0.0/8"}
	file.Modules.Offered = nil
	if got := pendingRestart(running, file); len(got) != 0 {
		t.Fatalf("live keys only: want none, got %v", got)
	}
	file.TLS.CertFile, file.TLS.InsecureSkipVerify, file.ConnectionsFile = "/elsewhere/tls.crt", true, "/m/c.yaml"
	want := []string{"tls.certFile", "tls.insecureSkipVerify", "connectionsFile"}
	if got := pendingRestart(running, file); !reflect.DeepEqual(got, want) {
		t.Errorf("want %v, got %v", want, got)
	}
}

// Every restart-only key reads its own field: changing exactly that field
// flags exactly that key.
func TestRestartOnlyKeys_EachReadsItsField(t *testing.T) {
	want := []string{"hosted", "tls.certFile", "tls.keyFile", "tls.trustDir", "tls.insecureSkipVerify", "usersFile", "connectionsFile"}
	if got := restartOnlyKeyNames(); !reflect.DeepEqual(got, want) {
		t.Fatalf("restart-only keys: want %v, got %v", want, got)
	}
	running := defaultConfig()
	edits := map[string]func(*fileConfig){
		"hosted":                 func(f *fileConfig) { f.Hosted = false },
		"tls.certFile":           func(f *fileConfig) { f.TLS.CertFile = "/x" },
		"tls.keyFile":            func(f *fileConfig) { f.TLS.KeyFile = "/x" },
		"tls.trustDir":           func(f *fileConfig) { f.TLS.TrustDir = "/x" },
		"tls.insecureSkipVerify": func(f *fileConfig) { f.TLS.InsecureSkipVerify = true },
		"usersFile":              func(f *fileConfig) { f.UsersFile = "/x" },
		"connectionsFile":        func(f *fileConfig) { f.ConnectionsFile = "/x" },
	}
	for key, edit := range edits {
		file := fileConfigFromConfig(running)
		edit(&file)
		if got := pendingRestart(running, file); !reflect.DeepEqual(got, []string{key}) {
			t.Errorf("%s: got %v", key, got)
		}
	}
}
