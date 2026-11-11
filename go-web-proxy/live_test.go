package main

import (
	"log/slog"
	"reflect"
	"strings"
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
	file.TLS.CertFile, file.TLS.InsecureSkipVerify, file.TLS.TrustDir = "/elsewhere/tls.crt", true, "/elsewhere/trust"
	want := []string{"tls.certFile", "tls.trustDir", "tls.insecureSkipVerify"}
	if got := pendingRestart(running, file); !reflect.DeepEqual(got, want) {
		t.Errorf("want %v, got %v", want, got)
	}
}

// Every restart-only key reads its own field: changing exactly that field
// flags exactly that key.
func TestRestartOnlyKeys_EachReadsItsField(t *testing.T) {
	want := []string{"hosted", "tls.certFile", "tls.keyFile", "tls.trustDir", "tls.insecureSkipVerify"}
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
	}
	for key, edit := range edits {
		file := fileConfigFromConfig(running)
		edit(&file)
		if got := pendingRestart(running, file); !reflect.DeepEqual(got, []string{key}) {
			t.Errorf("%s: got %v", key, got)
		}
	}
}

// yamlLeaves lists the config.yaml keys of t at the granularity the lists use:
// a struct field is walked into (tls.certFile), a list or scalar is a key.
// Removed-setting fields (RemovedAppDir and the like, kept only so an old file
// still loads) and the gateway-owned version are left out, and a removed one
// must be named in removed so the exclusion is deliberate.
func yamlLeaves(t *testing.T, typ reflect.Type, prefix string, removed map[string]bool) []string {
	t.Helper()
	var out []string
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		name, _, _ := strings.Cut(f.Tag.Get("yaml"), ",")
		if name == "" {
			t.Fatalf("%s.%s has no yaml key", typ.Name(), f.Name)
		}
		switch {
		case strings.HasPrefix(f.Name, "Removed"):
			if !removed[name] {
				t.Fatalf("%s is a removed-setting field but its key %q is not in the test's removed list", f.Name, name)
			}
			continue
		case prefix == "" && name == "version":
			continue
		case f.Type.Kind() == reflect.Struct:
			out = append(out, yamlLeaves(t, f.Type, prefix+name+".", removed)...)
		default:
			out = append(out, prefix+name)
		}
	}
	return out
}

// Every config.yaml setting is exactly one of: live (apply copies it, so a
// save reaches it at once), restart-only (restartOnlyKeys) or host-only
// (restartOnlyKeys with hostOnly, which the settings endpoint refuses to
// change). A new fileConfig field that nobody classified would silently never
// apply, or apply twice; this test fails naming it.
func TestFileConfig_EveryKeyIsClassifiedOnce(t *testing.T) {
	// The live keys are the top-level keys apply copies: liveSettings' fields,
	// and logLevel, which apply sets on the logger's level instead.
	liveKeys := map[string]bool{"logLevel": true}
	lt := reflect.TypeOf(liveSettings{})
	for i := 0; i < lt.NumField(); i++ {
		liveKeys[lt.Field(i).Name] = true
	}
	for _, top := range []string{"connModes", "defaultConn", "logLevel", "access", "session", "login", "modules"} {
		if !liveKeys[top] {
			t.Errorf("live key %q is not copied by liveSettings/apply", top)
		}
		delete(liveKeys, top)
	}
	if len(liveKeys) != 0 {
		t.Errorf("liveSettings copies %v, which this test does not know as live keys", liveKeys)
	}

	leaves := yamlLeaves(t, reflect.TypeOf(fileConfig{}), "", map[string]bool{"appDir": true, "usersFile": true, "connectionsFile": true})
	liveTops := map[string]bool{"connModes": true, "defaultConn": true, "logLevel": true, "access": true, "session": true, "login": true, "modules": true}
	restartOnly, hostOnly := map[string]bool{}, map[string]bool{}
	for _, k := range restartOnlyKeys {
		if k.hostOnly {
			hostOnly[k.key] = true
		} else {
			restartOnly[k.key] = true
		}
	}
	seen := map[string]bool{}
	for _, key := range leaves {
		seen[key] = true
		top, _, _ := strings.Cut(key, ".")
		var classes []string
		if liveTops[top] {
			classes = append(classes, "live")
		}
		if restartOnly[key] {
			classes = append(classes, "restartOnlyKeys")
		}
		if hostOnly[key] {
			classes = append(classes, "hostOnly")
		}
		if len(classes) != 1 {
			t.Errorf("config.yaml key %q is classified as %v: want exactly one of live (live.go apply), restartOnlyKeys or hostOnly", key, classes)
		}
	}
	for _, k := range restartOnlyKeys {
		if !seen[k.key] {
			t.Errorf("restartOnlyKeys names %q, which is not a fileConfig key", k.key)
		}
	}
}
