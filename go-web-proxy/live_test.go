package main

import (
	"crypto/x509"
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
	cfg.audit = auditSettings{stdout: true, access: true, onFailure: auditOnFailureRefuse}
	lv.apply(cfg)
	got := lv.get()
	if got.connModes != connBoth || got.defaultConn != connProvisioned || lv.level.Level() != slog.LevelDebug {
		t.Errorf("modes or level not applied: %+v, %v", got, lv.level.Level())
	}
	if lv.sessionLimits() != cfg.session || lv.loginLimits() != cfg.login || !reflect.DeepEqual(got.modules, cfg.modules) {
		t.Errorf("limits or modules not applied: %+v", got)
	}
	if got.audit != cfg.audit {
		t.Errorf("audit options not applied: %+v", got.audit)
	}
	if before.connModes != connDirect {
		t.Error("apply must swap in a new value, never edit the one a reader holds")
	}
}

// login.twoFactor is read at each sign-in: a reader gets the value applied last,
// and a config built without it reads as optional.
func TestLive_TwoFactorIsLive(t *testing.T) {
	lv := liveWith(nil)
	if lv.twoFactor() != twoFactorOptional {
		t.Fatalf("default: want optional, got %q", lv.twoFactor())
	}
	for _, mode := range []string{twoFactorOptional, twoFactorAdmins, twoFactorMandatory} {
		cfg := defaultConfig()
		cfg.twoFactor = mode
		lv.apply(cfg)
		if lv.twoFactor() != mode {
			t.Errorf("applied %q, read %q", mode, lv.twoFactor())
		}
	}
	cfg := defaultConfig()
	cfg.twoFactor = twoFactorMandatory
	lv.apply(cfg)
	cfg.twoFactor = ""
	lv.apply(cfg)
	if lv.twoFactor() != twoFactorOptional {
		t.Errorf("a config without the value reads as optional, got %q", lv.twoFactor())
	}
}

// tls.insecureSkipVerify reaches the trust holder on apply, with the warning
// when it turns on; apply with no holder bound (a test's live) changes nothing
// else.
func TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(t *testing.T) {
	var buf strings.Builder
	holder := newTrustHolder(x509.NewCertPool(), false, newCapturingLogger(&buf))
	cfg := defaultConfig()
	lv := newLive(cfg)
	lv.apply(cfg) // unbound: nothing to carry into
	lv.bindTrust(holder)

	cfg.insecureSkipVerify = true
	lv.apply(cfg)
	if !holder.get().skip || !strings.Contains(buf.String(), "upstream certificates will NOT be validated") {
		t.Fatalf("a save with the flag on must reach the holder and warn; skip=%v log=%q", holder.get().skip, buf.String())
	}
	cfg.insecureSkipVerify = false
	lv.apply(cfg)
	if holder.get().skip {
		t.Error("a save with the flag off must reach the holder")
	}
}

// tls.standardRoots reaches the trust holder on apply, both ways.
func TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(t *testing.T) {
	holder := newTrustHolder(x509.NewCertPool(), false, quietLogger())
	cfg := defaultConfig()
	lv := newLive(cfg)
	lv.bindTrust(holder)
	lv.apply(cfg)
	if !holder.get().standard {
		t.Fatal("the default (on) must reach the holder")
	}
	cfg.standardRoots = false
	lv.apply(cfg)
	if holder.get().standard {
		t.Error("a save with the key off must reach the holder")
	}
}

// yamlLeaves lists the config.yaml keys of t at the granularity the lists use:
// a struct field is walked into (tls.insecureSkipVerify), a list or scalar is a
// key.
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
// save reaches it at once) or restart-only (restartOnlyKeys). A new fileConfig
// field that nobody classified would silently never apply, or apply twice;
// this test fails naming it.
func TestFileConfig_EveryKeyIsClassifiedOnce(t *testing.T) {
	// The live keys are the top-level keys apply copies: liveSettings' fields,
	// and logLevel, which apply sets on the logger's level instead.
	liveKeys := map[string]bool{"logLevel": true}
	lt := reflect.TypeOf(liveSettings{})
	for i := 0; i < lt.NumField(); i++ {
		liveKeys[lt.Field(i).Name] = true
	}
	for _, top := range []string{"connModes", "defaultConn", "logLevel", "access", "session", "login", "modules", "audit"} {
		if !liveKeys[top] {
			t.Errorf("live key %q is not copied by liveSettings/apply", top)
		}
		delete(liveKeys, top)
	}
	// login.twoFactor is live as well, in a field of its own beside the login limits.
	if !liveKeys["twoFactor"] {
		t.Error("login.twoFactor is not copied by liveSettings/apply")
	}
	delete(liveKeys, "twoFactor")
	if len(liveKeys) != 0 {
		t.Errorf("liveSettings copies %v, which this test does not know as live keys", liveKeys)
	}

	leaves := yamlLeaves(t, reflect.TypeOf(fileConfig{}), "", map[string]bool{
		"appDir": true, "usersFile": true, "connectionsFile": true, "certFile": true, "keyFile": true, "trustDir": true,
	})
	// The tls keys are live through the trust holder: apply hands them to
	// lv.trust (go-web-proxy/live_test.go > TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder
	// and TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder), so they are not
	// liveSettings fields.
	liveTops := map[string]bool{"connModes": true, "defaultConn": true, "logLevel": true, "access": true, "session": true, "login": true, "modules": true, "audit": true, "tls": true}
	restartOnly := map[string]bool{}
	for _, k := range restartOnlyKeys {
		restartOnly[k] = true
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
		if len(classes) != 1 {
			t.Errorf("config.yaml key %q is classified as %v: want exactly one of live (live.go apply) or restartOnlyKeys", key, classes)
		}
	}
	for _, k := range restartOnlyKeys {
		if !seen[k] {
			t.Errorf("restartOnlyKeys names %q, which is not a fileConfig key", k)
		}
	}
}
