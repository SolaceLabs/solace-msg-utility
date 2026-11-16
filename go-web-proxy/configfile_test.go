package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// clearSeedEnv isolates a test from the developer's shell: every seeding
// variable, the old names of the renamed ones and the removed ones is unset
// for its duration.
func clearSeedEnv(t *testing.T) {
	t.Helper()
	for _, v := range seedVars {
		t.Setenv(v.env, "")
	}
	for _, r := range renamedEnv {
		t.Setenv(r.old, "")
	}
	for _, name := range []string{"SMU_SSL_CERTFILE", "SMU_SSL_CERTKEYFILE", "SMU_SSL_TRUSTDIR"} {
		t.Setenv(name, "") // environment only now, so not in seedVars
	}
	for _, name := range []string{"USERS_FILE", "CONNECTIONS_FILE", "STORE_KEY_FILE"} {
		t.Setenv(name, "") // removed, but still read for their warning
	}
	t.Setenv("CONFIG_FILE", "") // removed, but still read for its refusal or warning
	t.Setenv("APP_DIR", "")     // removed, but still read for its warning
}

func removedNames(rs []removedSetting) []string {
	out := []string{}
	for _, r := range rs {
		out = append(out, r.name)
	}
	return out
}

const fullConfigYAML = `version: 1
hosted: true
connModes: both
defaultConn: provisioned
tls:
  insecureSkipVerify: true
logLevel: debug
access:
  allow: [10.0.0.0/8, "2001:db8::/32"]
  trustedProxies: [10.0.0.1/32]
session:
  idleMinutes: 5
  absoluteMinutes: 60
  connectsPerMinute: 40
login:
  maxFailures: 3
  perClient: false
  clientMaxFailures: 30
  resetMinutes: 45
  backoffSeconds: 10
  maxBackoffSeconds: 600
  unauthenticatedPerMinute: 20
  passwordMinLength: 16
  twoFactorMinutes: 5
  twoFactor: admins
modules:
  offered: [queue-copy]
  userDefault: none
audit:
  stdout: true
  access: true
  onFailure: refuse
`

func TestDecodeConfigFile_Valid(t *testing.T) {
	fc, err := decodeConfigFile([]byte(fullConfigYAML), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	want := fileConfig{
		Version: 1, Hosted: true, ConnModes: "both", DefaultConn: "provisioned",
		TLS:      fileTLS{InsecureSkipVerify: true},
		LogLevel: "debug",
		Access:   fileAccess{Allow: []string{"10.0.0.0/8", "2001:db8::/32"}, TrustedProxies: []string{"10.0.0.1/32"}},
		Session:  fileSession{IdleMinutes: 5, AbsoluteMinutes: 60, ConnectsPerMinute: 40},
		Login:    fileLogin{MaxFailures: 3, PerClient: false, ClientMaxFailures: 30, ResetMinutes: 45, BackoffSeconds: 10, MaxBackoffSeconds: 600, UnauthenticatedPerMinute: 20, PasswordMinLength: 16, TwoFactorMinutes: 5, TwoFactor: "admins"},
		Modules:  fileModules{Offered: []string{"queue-copy"}, UserDefault: "none"},
		Audit:    fileAudit{Stdout: true, Access: true, OnFailure: "refuse"},
	}
	if !reflect.DeepEqual(fc, want) {
		t.Errorf("decoded:\n%+v\nwant:\n%+v", fc, want)
	}
}

// A hand-edited file may omit keys; they take the built-in defaults, never an
// env value. A partial nested block keeps its sibling defaults too.
func TestDecodeConfigFile_MissingKeysKeepDefaults(t *testing.T) {
	fc, err := decodeConfigFile([]byte("version: 1\n"), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(fc, defaultFileConfig()) {
		t.Errorf("version-only file:\n%+v\nwant defaults:\n%+v", fc, defaultFileConfig())
	}
	fc, err = decodeConfigFile([]byte("version: 1\ntls:\n  insecureSkipVerify: true\nlogLevel: info\n"), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if !fc.TLS.InsecureSkipVerify || fc.LogLevel != "info" || fc.ConnModes != connDirect {
		t.Errorf("partial file: got %+v", fc)
	}
}

func TestDecodeConfigFile_UnknownFieldFails(t *testing.T) {
	cases := map[string]string{
		"version: 1\nbogus: 1\n":              "bogus",
		"version: 1\ntls:\n  nope: true\n":    "nope",
		"version: 1\nsiteSeedFile: /x/seed\n": "siteSeedFile", // retired with the site seed
		"version: 1\nstoreKeyFile: /x/key\n":  "storeKeyFile", // the store key path is env-only by design
		"version: 1\nmanaged: true\n":         "managed",      // retired: connModes turns Provisioned mode on
	}
	for doc, field := range cases {
		_, err := decodeConfigFile([]byte(doc), "/etc/gw/config.yaml")
		if err == nil {
			t.Errorf("%q: want an error", doc)
			continue
		}
		msg := err.Error()
		if !strings.Contains(msg, "/etc/gw/config.yaml") || !strings.Contains(msg, "field "+field+" not found") {
			t.Errorf("%q: error %q must name the file and the field", doc, msg)
		}
	}
}

func TestDecodeConfigFile_EmptyBadYAMLBadVersion(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"empty", "", "is empty"},
		{"whitespace", "  \n\n", "is empty"},
		{"comment only", "# nothing here\n", ""},
		{"bad yaml", "version: [1\n", "invalid config file"},
		{"version 2", "version: 2\n", "version=2 unsupported"},
		{"version missing", "hosted: true\n", "version=0 unsupported"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := decodeConfigFile([]byte(tc.doc), "/etc/gw/config.yaml")
			if err == nil {
				t.Fatal("want an error")
			}
			if !strings.Contains(err.Error(), "/etc/gw/config.yaml") {
				t.Errorf("error must name the file: %q", err)
			}
			if tc.want != "" && !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error %q lacks %q", err, tc.want)
			}
		})
	}
}

func TestToConfig_InvalidValues(t *testing.T) {
	base := func() fileConfig {
		fc := defaultFileConfig()
		fc.Hosted = true
		return fc
	}
	cases := []struct {
		name       string
		mutate     func(*fileConfig)
		key, value string
	}{
		{"connModes", func(fc *fileConfig) { fc.ConnModes = "bogus" }, "connModes", "bogus"},
		{"defaultConn", func(fc *fileConfig) { fc.DefaultConn = "x" }, "defaultConn", "x"},
		{"logLevel", func(fc *fileConfig) { fc.LogLevel = "verbose" }, "logLevel", "verbose"},
		{"allow prefix length", func(fc *fileConfig) { fc.Access.Allow = []string{"10.0.0.0/33"} }, "access.allow[0]", "10.0.0.0/33"},
		{"allow bare address", func(fc *fileConfig) { fc.Access.Allow = []string{"10.0.0.0/8", "10.0.0.1"} }, "access.allow[1]", "10.0.0.1"},
		{"allow mapped", func(fc *fileConfig) { fc.Access.Allow = []string{"::ffff:10.0.0.0/104"} }, "access.allow[0]", "::ffff:10.0.0.0/104"},
		{"trusted proxy", func(fc *fileConfig) { fc.Access.TrustedProxies = []string{"nope"} }, "access.trustedProxies[0]", "nope"},
		{"absolute zero", func(fc *fileConfig) { fc.Session.AbsoluteMinutes = 0 }, "session.absoluteMinutes", "0"},
		{"absolute over a day", func(fc *fileConfig) { fc.Session.AbsoluteMinutes = 1441 }, "session.absoluteMinutes", "1441"},
		{"idle over absolute", func(fc *fileConfig) { fc.Session.IdleMinutes = 31 }, "session.idleMinutes", "31"},
		{"max failures", func(fc *fileConfig) { fc.Login.MaxFailures = 0 }, "login.maxFailures", "0"},
		{"max backoff", func(fc *fileConfig) { fc.Login.MaxBackoffSeconds = 86401 }, "login.maxBackoffSeconds", "86401"},
		{"backoff over max", func(fc *fileConfig) { fc.Login.BackoffSeconds = 901 }, "login.backoffSeconds", "901"},
		{"unauthenticated", func(fc *fileConfig) { fc.Login.UnauthenticatedPerMinute = -1 }, "login.unauthenticatedPerMinute", "-1"},
		{"client max failures below", func(fc *fileConfig) { fc.Login.ClientMaxFailures = 0 }, "login.clientMaxFailures", "0"},
		{"client max failures above", func(fc *fileConfig) { fc.Login.ClientMaxFailures = 1001 }, "login.clientMaxFailures", "1001"},
		{"reset minutes below", func(fc *fileConfig) { fc.Login.ResetMinutes = 0 }, "login.resetMinutes", "0"},
		{"reset minutes above a day", func(fc *fileConfig) { fc.Login.ResetMinutes = 1441 }, "login.resetMinutes", "1441"},
		{"password minimum below the built-in rule", func(fc *fileConfig) { fc.Login.PasswordMinLength = 11 }, "login.passwordMinLength", "11"},
		{"password minimum above the maximum", func(fc *fileConfig) { fc.Login.PasswordMinLength = 129 }, "login.passwordMinLength", "129"},
		{"two-factor minutes below", func(fc *fileConfig) { fc.Login.TwoFactorMinutes = 0 }, "login.twoFactorMinutes", "0"},
		{"two-factor minutes above an hour", func(fc *fileConfig) { fc.Login.TwoFactorMinutes = 61 }, "login.twoFactorMinutes", "61"},
		{"connects below", func(fc *fileConfig) { fc.Session.ConnectsPerMinute = 0 }, "session.connectsPerMinute", "0"},
		{"connects above", func(fc *fileConfig) { fc.Session.ConnectsPerMinute = 1001 }, "session.connectsPerMinute", "1001"},
		// Queue Discovery reads the broker unfiltered, so it is not in the catalog.
		{"module outside the catalog", func(fc *fileConfig) { fc.Modules.Offered = []string{"queue-discovery"} }, "modules.offered[0]", "queue-discovery"},
		{"module twice", func(fc *fileConfig) { fc.Modules.Offered = []string{"queue-copy", "queue-copy"} }, "modules.offered[1]", "queue-copy"},
		{"userDefault", func(fc *fileConfig) { fc.Modules.UserDefault = "some" }, "modules.userDefault", "some"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fc := base()
			tc.mutate(&fc)
			_, err := fc.toConfig(secretPaths{})
			if err == nil {
				t.Fatal("want an error")
			}
			msg := err.Error()
			if !strings.Contains(msg, tc.key) || !strings.Contains(msg, `"`+tc.value+`"`) {
				t.Errorf("error %q must name key %s and value %q", msg, tc.key, tc.value)
			}
		})
	}
}

func TestToConfig_CrossCheckAndConversion(t *testing.T) {
	fc := defaultFileConfig()
	fc.ConnModes = "Both" // a hand-edited file is lowercased like the env
	fc.Hosted = false     // SMU_HOSTED=false: the files only, so no gateway for sign-in
	if _, err := fc.toConfig(secretPaths{}); err == nil || !strings.Contains(err.Error(), "hosted is false") {
		t.Fatalf("both without hosted must fail the cross check, got %v", err)
	}
	fc.Hosted = true
	fc.Access.Allow = []string{"10.1.2.3/8", "2001:db8::1/32"}
	fc.Access.TrustedProxies = []string{"192.0.2.0/24"}
	cfg, err := fc.toConfig(secretPaths{storeKey: "/seed/store.key"})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.connModes != connBoth || cfg.defaultConn != connDirect {
		t.Errorf("modes: got %q/%q", cfg.connModes, cfg.defaultConn)
	}
	if cfg.storeKeyFile != "/seed/store.key" {
		t.Errorf("the store key path must come from the caller (env), got %q", cfg.storeKeyFile)
	}
	if got := prefixStrings(cfg.access.allow); !reflect.DeepEqual(got, []string{"10.0.0.0/8", "2001:db8::/32"}) {
		t.Errorf("allow: want masked prefixes, got %v", got)
	}
	if got := prefixStrings(cfg.access.trustedProxies); !reflect.DeepEqual(got, []string{"192.0.2.0/24"}) {
		t.Errorf("trustedProxies: got %v", got)
	}
	if cfg.logLevel != slog.LevelWarn {
		t.Errorf("defaults not carried: %+v", cfg)
	}
	if cfg.session != (sessionLimits{idle: 10 * time.Minute, absolute: 30 * time.Minute, ticket: 10 * time.Minute, connects: 20}) {
		t.Errorf("session defaults: %+v", cfg.session)
	}
	if want := (loginLimits{
		maxFailures: 5, backoff: 30 * time.Second, maxBackoff: 15 * time.Minute, unauthPerMinute: 60,
		clientMaxFailures: 10, reset: 15 * time.Minute, passwordMinLength: 12,
	}); cfg.login != want {
		t.Errorf("login defaults: %+v", cfg.login)
	}
	if want := (moduleSettings{offered: moduleCatalog(), userDefault: modulesDefaultAll}); !reflect.DeepEqual(cfg.modules, want) {
		t.Errorf("modules default: want every catalog module for every user, got %+v", cfg.modules)
	}
}

// audit.stdout, audit.access and audit.onFailure reach the runtime config and
// back; the two flags default to off and onFailure to continue, also for a
// config or backup that never had the key.
func TestToConfig_Audit(t *testing.T) {
	cfg, err := defaultFileConfig().toConfig(secretPaths{})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.audit != (auditSettings{onFailure: auditOnFailureContinue}) || cfg.auditFile != defaultAuditFile {
		t.Errorf("defaults: want both options off, continue and the fixed log path, got %+v %q", cfg.audit, cfg.auditFile)
	}
	fc := defaultFileConfig()
	fc.Audit = fileAudit{Stdout: true, Access: true, OnFailure: "refuse"}
	cfg, err = fc.toConfig(secretPaths{})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.audit != (auditSettings{stdout: true, access: true, onFailure: "refuse"}) {
		t.Errorf("audit: got %+v", cfg.audit)
	}
	if back := fileConfigFromConfig(cfg).Audit; back != fc.Audit {
		t.Errorf("round trip: got %+v", back)
	}
	fc.Audit.OnFailure = ""
	cfg, err = fc.toConfig(secretPaths{})
	if err != nil || cfg.audit.onFailure != auditOnFailureContinue {
		t.Errorf("an absent onFailure is continue: %+v, %v", cfg.audit, err)
	}
}

// audit.onFailure takes exactly continue or refuse; the error names the key,
// the value and the choices.
func TestToConfig_AuditOnFailureIsValidated(t *testing.T) {
	for _, bad := range []string{"Refuse", "stop", " continue", "true"} {
		fc := defaultFileConfig()
		fc.Audit.OnFailure = bad
		_, err := fc.toConfig(secretPaths{})
		if err == nil {
			t.Errorf("%q must be refused", bad)
			continue
		}
		for _, want := range []string{`"audit.onFailure"`, strconv.Quote(bad), `"continue"`, `"refuse"`} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("%q: error %q lacks %s", bad, err, want)
			}
		}
	}
}

// login.twoFactor reaches the runtime config and back; it defaults to optional,
// also for a config or backup that never had the key, and an empty value is
// optional.
func TestToConfig_TwoFactor(t *testing.T) {
	cfg, err := defaultFileConfig().toConfig(secretPaths{})
	if err != nil || cfg.twoFactor != twoFactorOptional {
		t.Fatalf("default: want optional, got %q, %v", cfg.twoFactor, err)
	}
	for _, mode := range []string{twoFactorOptional, twoFactorAdmins, twoFactorMandatory} {
		fc := defaultFileConfig()
		fc.Login.TwoFactor = mode
		cfg, err := fc.toConfig(secretPaths{})
		if err != nil || cfg.twoFactor != mode {
			t.Errorf("%q: got %q, %v", mode, cfg.twoFactor, err)
		}
		if back := fileConfigFromConfig(cfg).Login.TwoFactor; back != mode {
			t.Errorf("%q: round trip gave %q", mode, back)
		}
	}
	fc := defaultFileConfig()
	fc.Login.TwoFactor = ""
	if cfg, err := fc.toConfig(secretPaths{}); err != nil || cfg.twoFactor != twoFactorOptional {
		t.Errorf("an absent value is optional: %q, %v", cfg.twoFactor, err)
	}
	if got := fileConfigFromConfig(config{}).Login.TwoFactor; got != twoFactorOptional {
		t.Errorf("a config built without the value is written as optional, got %q", got)
	}
}

// login.twoFactor takes exactly the three values; start refuses anything else,
// the removed off included, naming the key, the value and the choices.
func TestToConfig_TwoFactorIsValidated(t *testing.T) {
	for _, bad := range []string{"off", "Off", "on", "true", " admins", "everyone"} {
		fc := defaultFileConfig()
		fc.Login.TwoFactor = bad
		_, err := fc.toConfig(secretPaths{})
		if err == nil {
			t.Errorf("%q must be refused", bad)
			continue
		}
		for _, want := range []string{`"login.twoFactor"`, strconv.Quote(bad), `"optional"`, `"admins"`, `"mandatory"`} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("%q: error %q lacks %s", bad, err, want)
			}
		}
	}
}

// A file written before the key existed loads as optional, one that sets it keeps
// it, and the next write carries the key.
func TestDecodeConfigFile_TwoFactorDefaultsAndIsWritten(t *testing.T) {
	fc, err := decodeConfigFile([]byte("version: 1\nlogin:\n  maxFailures: 7\n"), "x.yaml")
	if err != nil || fc.Login.TwoFactor != twoFactorOptional || fc.Login.MaxFailures != 7 {
		t.Fatalf("login: %+v, %v", fc.Login, err)
	}
	out, err := encodeConfigFile(fc)
	if err != nil || !strings.Contains(string(out), "  twoFactor: optional\n") {
		t.Errorf("the file must carry the key once written: %v\n%s", err, out)
	}
	if !strings.Contains(string(out), "# login.twoFactor (optional|admins|mandatory)") {
		t.Errorf("the header must describe the key:\n%s", out)
	}
	fc, err = decodeConfigFile([]byte("version: 1\nlogin:\n  twoFactor: admins\n"), "x.yaml")
	if err != nil || fc.Login.TwoFactor != twoFactorAdmins {
		t.Errorf("a file that sets it keeps it: %+v, %v", fc.Login, err)
	}
}

// A file written before the key existed loads with continue, and the next
// write adds the key.
func TestDecodeConfigFile_OnFailureDefaultsAndIsWritten(t *testing.T) {
	fc, err := decodeConfigFile([]byte("version: 1\naudit:\n  stdout: true\n"), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if fc.Audit.OnFailure != auditOnFailureContinue || !fc.Audit.Stdout {
		t.Fatalf("audit: %+v", fc.Audit)
	}
	out, err := encodeConfigFile(fc)
	if err != nil || !strings.Contains(string(out), "onFailure: continue\n") {
		t.Errorf("the file must carry the key once written: %v\n%s", err, out)
	}
}

// offered is kept in catalog order whatever order the file lists it in; an
// empty list offers nothing.
func TestToConfig_ModulesInCatalogOrder(t *testing.T) {
	fc := defaultFileConfig()
	fc.Modules.Offered = []string{"queue-subscription-explorer", "queue-copy", "queue-browser"}
	cfg, err := fc.toConfig(secretPaths{})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(cfg.modules.offered, []string{"queue-browser", "queue-copy", "queue-subscription-explorer"}) {
		t.Errorf("want catalog order, got %v", cfg.modules.offered)
	}
	fc.Modules.Offered = []string{}
	if cfg, err = fc.toConfig(secretPaths{}); err != nil || len(cfg.modules.offered) != 0 || cfg.modules.offered == nil {
		t.Errorf("an empty list offers nothing (as [], not null): %v %#v", err, cfg.modules.offered)
	}
}

func TestModuleSettings_ForUser(t *testing.T) {
	all := moduleSettings{offered: []string{"queue-browser", "queue-copy"}, userDefault: modulesDefaultAll}
	none := moduleSettings{offered: []string{"queue-browser"}, userDefault: modulesDefaultNone}
	list := func(ids ...string) *[]string { return &ids }
	cases := []struct {
		name    string
		ms      moduleSettings
		granted *[]string
		want    []string
	}{
		{"no list, default all", all, nil, []string{"queue-browser", "queue-copy"}},
		{"no list, default none", none, nil, []string{}},
		{"own list", all, list("queue-copy"), []string{"queue-copy"}},
		{"own empty list", all, list(), []string{}},
		{"own list beyond the offer", none, list("queue-copy", "queue-browser"), []string{"queue-browser"}},
	}
	for _, tc := range cases {
		if got := tc.ms.forUser(tc.granted); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: want %v, got %v", tc.name, tc.want, got)
		}
	}
}

// The settings endpoint decodes a request into a clone of the saved file: a
// decode must never write through to the original's slices.
func TestFileConfig_CloneIsIndependent(t *testing.T) {
	orig := defaultFileConfig()
	orig.Access.Allow = []string{"10.0.0.0/8"}
	c := orig.clone()
	body := `{"access":{"allow":["192.0.2.0/24"],"trustedProxies":["198.51.100.1/32"]},"modules":{"offered":["queue-copy"]}}`
	if err := json.Unmarshal([]byte(body), &c); err != nil {
		t.Fatal(err)
	}
	if orig.Access.Allow[0] != "10.0.0.0/8" || orig.Modules.Offered[0] != "queue-browser" || len(orig.Access.TrustedProxies) != 0 {
		t.Errorf("the original changed: %+v", orig)
	}
}

// The cross-field messages say which other key bounds the value.
func TestToConfig_BoundsNameTheOtherKey(t *testing.T) {
	fc := defaultFileConfig()
	fc.Session.IdleMinutes = 40
	if _, err := fc.toConfig(secretPaths{}); err == nil || !strings.Contains(err.Error(), "(session.absoluteMinutes is 30)") {
		t.Errorf("idle: got %v", err)
	}
	fc = defaultFileConfig()
	fc.Login.BackoffSeconds = 1000
	if _, err := fc.toConfig(secretPaths{}); err == nil || !strings.Contains(err.Error(), "(login.maxBackoffSeconds is 900)") {
		t.Errorf("backoff: got %v", err)
	}
}

func TestEncodeConfigFile_HeaderNoSecretsRoundTrip(t *testing.T) {
	cfg := defaultConfig()
	cfg.storeKeyFile = "/very/secret/custom.key"
	cfg.access.allow = prefixes(t, "10.0.0.0/8")
	out, err := encodeConfigFile(fileConfigFromConfig(cfg))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.HasPrefix(s, "# config.yaml -- AUTHORITATIVE") {
		t.Errorf("header missing: %q", s[:60])
	}
	for _, forbidden := range []string{"custom.key", "storeKey"} {
		if strings.Contains(s, forbidden) {
			t.Errorf("the file must never carry a secret path, found %q", forbidden)
		}
	}
	for _, v := range seedVars {
		if !strings.Contains(s, v.key+" <- "+v.env) {
			t.Errorf("header lacks the mapping %s <- %s", v.key, v.env)
		}
	}
	fc, err := decodeConfigFile(out, "x")
	if err != nil {
		t.Fatalf("the written file must decode strictly: %v", err)
	}
	want := fileConfigFromConfig(cfg)
	if !reflect.DeepEqual(fc.Access.Allow, want.Access.Allow) || len(fc.Access.TrustedProxies) != 0 {
		t.Errorf("access round trip: got %+v, want %+v", fc.Access, want.Access)
	}
	fc.Access, want.Access = fileAccess{}, fileAccess{}
	if !reflect.DeepEqual(fc, want) {
		t.Errorf("round trip:\n%+v\nwant:\n%+v", fc, want)
	}
}

func TestResolveConfig_SeedsFromEnvThenFileWins(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "cfg", "config.yaml")
	t.Setenv("SMU_HOSTED", "true")
	t.Setenv("SMU_CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "Info")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !load.seeded || len(load.overrides) != 0 {
		t.Fatalf("first start: want seeded with no overrides, got seeded=%v overrides=%v", load.seeded, load.overrides)
	}
	if !load.cfg.hosted || !load.cfg.provisioned() || load.cfg.connModes != connBoth || load.cfg.logLevel != slog.LevelInfo {
		t.Errorf("seeded config does not reflect env: %+v", load.cfg)
	}
	if load.cfg.storeKeyFile != defaultStoreKeyFile {
		t.Errorf("store key path: want the fixed default, got %q", load.cfg.storeKeyFile)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("seed file not written: %v", err)
	}
	if strings.Contains(string(raw), defaultStoreKeyFile) {
		t.Error("a secret path leaked into config.yaml")
	}
	if !bytes.Equal(load.data, raw) {
		t.Error("the seeded load must carry the bytes it wrote")
	}
	if !strings.Contains(string(raw), "connModes: both") || !strings.Contains(string(raw), "logLevel: info") {
		t.Errorf("file content: %s", raw)
	}

	again, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(again.data, load.data) {
		t.Error("reading the file back must carry the same bytes")
	}
	if again.seeded || len(again.overrides) != 0 {
		t.Errorf("second start: want file read with no overrides, got seeded=%v overrides=%v", again.seeded, again.overrides)
	}
	if again.cfg.connModes != connBoth || again.cfg.logLevel != slog.LevelInfo || !again.cfg.provisioned() {
		t.Errorf("second start config: %+v", again.cfg)
	}
}

// SMU_SHOW_AUDIT seeds audit.stdout on the first start only; audit.access has
// no variable. Afterwards the file wins and a differing value is reported.
func TestResolveConfig_SeedsAuditStdoutFromEnvThenFileWins(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("SMU_SHOW_AUDIT", "true")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !load.seeded || !load.cfg.audit.stdout || load.cfg.audit.access {
		t.Fatalf("first start: want audit.stdout seeded on and audit.access off, got seeded=%v %+v", load.seeded, load.cfg.audit)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "audit:") || !strings.Contains(string(raw), "stdout: true") || !strings.Contains(string(raw), "access: false") || !strings.Contains(string(raw), "audit.stdout <- SMU_SHOW_AUDIT") {
		t.Errorf("seeded file lacks the audit block or its header mapping:\n%s", raw)
	}

	t.Setenv("SMU_SHOW_AUDIT", "false")
	again, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !again.cfg.audit.stdout {
		t.Error("the file must win over a later SMU_SHOW_AUDIT")
	}
	want := []envOverride{{Env: "SMU_SHOW_AUDIT", Key: "audit.stdout", EnvValue: "false", FileValue: "true"}}
	if !reflect.DeepEqual(again.overrides, want) {
		t.Errorf("overrides: want %v, got %v", want, again.overrides)
	}
}

func TestResolveConfig_InvalidEnvFailsWithoutWriting(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("SMU_CONN_MODES", "bogus")
	_, err := resolveConfig(path)
	if err == nil || !strings.Contains(err.Error(), `connModes="bogus"`) || !strings.Contains(err.Error(), "SMU_CONN_MODES") {
		t.Fatalf("want an error naming the key and the env var, got %v", err)
	}
	if _, statErr := os.Stat(path); !errors.Is(statErr, fs.ErrNotExist) {
		t.Error("a rejected seed must not be written")
	}
	t.Setenv("SMU_CONN_MODES", "")
	t.Setenv("LOG_LEVEL", "verbose")
	if _, err := resolveConfig(path); err == nil || !strings.Contains(err.Error(), `LOG_LEVEL="verbose"`) {
		t.Fatalf("want the LOG_LEVEL error, got %v", err)
	}
}

func TestSeedConfigFile_WriteFailureIsActionable(t *testing.T) {
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(blocker, "config.yaml")
	_, err := seedConfigFile(path, defaultConfig())
	if err == nil {
		t.Fatal("want an error when the directory cannot be created")
	}
	if !namesPath(err.Error(), path) {
		t.Errorf("error %q does not name %q", err, path)
	}
	for _, want := range []string{"cannot write config file", "UID 65532", "/data"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q lacks %q", err, want)
		}
	}
}

func TestResolveConfig_PropagatesWriteFailure(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs POSIX permissions and a non-root user")
	}
	clearSeedEnv(t)
	dir := t.TempDir()
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
	_, err := resolveConfig(filepath.Join(dir, "config.yaml"))
	if err == nil || !strings.Contains(err.Error(), "cannot write config file") {
		t.Fatalf("want the write failure, got %v", err)
	}
}

// An existing file with a bad value fails at startup naming the file, the key
// and the value, so a hand edit is caught before anything listens.
func TestResolveConfig_InvalidFileValueNamesFileAndKey(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	doc := "version: 1\naccess:\n  allow: [10.0.0.0/8, 10.0.0.1]\n"
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := resolveConfig(path)
	if err == nil {
		t.Fatal("want an error")
	}
	if !namesPath(err.Error(), path) {
		t.Errorf("error %q does not name %q", err, path)
	}
	for _, want := range []string{`"access.allow[1]"`, `"10.0.0.1"`, "want CIDR such as"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q lacks %q", err, want)
		}
	}
}

func TestResolveConfig_ReadErrorIsReported(t *testing.T) {
	clearSeedEnv(t)
	dir := t.TempDir() // a directory where the file should be
	_, err := resolveConfig(dir)
	if err == nil || !strings.Contains(err.Error(), "cannot read config file") {
		t.Fatalf("want a read error, got %v", err)
	}
}

func TestResolveConfig_FileWinsAndReportsOverrides(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	doc := "version: 1\nconnModes: direct\nlogLevel: warn\n"
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SMU_CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("SMU_HOSTED", "true") // the file's default: nothing to report

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if load.seeded {
		t.Error("an existing file must not be re-seeded")
	}
	if load.cfg.connModes != connDirect || load.cfg.logLevel != slog.LevelWarn {
		t.Errorf("the file must win: %+v", load.cfg)
	}
	got := map[string]envOverride{}
	for _, o := range load.overrides {
		got[o.Env] = o
	}
	want := map[string][3]string{ // env -> key, env value, file value
		"SMU_CONN_MODES": {"connModes", "both", "direct"},
		"LOG_LEVEL":      {"logLevel", "debug", "warn"},
	}
	if len(got) != len(want) {
		t.Fatalf("overrides: want %d, got %v", len(want), load.overrides)
	}
	for env, w := range want {
		o, ok := got[env]
		if !ok {
			t.Errorf("missing override for %s", env)
			continue
		}
		if o.Key != w[0] || o.EnvValue != w[1] || o.FileValue != w[2] {
			t.Errorf("%s: got %+v, want key=%s env=%s file=%s", env, o, w[0], w[1], w[2])
		}
	}
	if len(load.removed) != 0 {
		t.Errorf("no removed setting is set: %v", load.removed)
	}
}

// appDir and APP_DIR are gone: the app is always served from appRoot. A file
// that still has the key loads, the key and the variable are named for the
// start-up warning, and the next write of the file (a settings save) drops it.
func TestResolveConfig_IgnoresTheRemovedAppDir(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("version: 1\nappDir: /pwa\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("APP_DIR", "/other")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatalf("a file with the removed key must still load: %v", err)
	}
	if want := []string{"appDir", "APP_DIR"}; !reflect.DeepEqual(removedNames(load.removed), want) {
		t.Errorf("removed: want %v, got %v", want, load.removed)
	}
	if !strings.Contains(load.removed[0].instead, appRoot) {
		t.Errorf("the warning must say where to mount a build: %q", load.removed[0].instead)
	}
	if len(load.overrides) != 0 {
		t.Errorf("APP_DIR is no longer a seeding variable: %v", load.overrides)
	}
	data, err := encodeConfigFile(fileConfigFromConfig(load.cfg))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "appDir") || strings.Contains(string(data), "APP_DIR") {
		t.Errorf("the next write must drop the key:\n%s", data)
	}
}

// A first start with APP_DIR set seeds a file without the key, and names the
// variable for the start-up warning.
func TestResolveConfig_SeedIgnoresTheRemovedAppDir(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("APP_DIR", "/other")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !load.seeded || !reflect.DeepEqual(removedNames(load.removed), []string{"APP_DIR"}) {
		t.Errorf("seeded=%v removed=%v: want a seed that names APP_DIR", load.seeded, load.removed)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "appDir") || strings.Contains(string(data), "APP_DIR") {
		t.Errorf("the seeded file must not carry the removed setting:\n%s", data)
	}
}

func TestEnvOverrides_EveryVariableAndBoolParsing(t *testing.T) {
	clearSeedEnv(t)
	file := defaultConfig()
	t.Setenv("SMU_HOSTED", "false")
	if o := envOverrides(file); len(o) != 1 || o[0].Env != "SMU_HOSTED" || o[0].FileValue != "true" {
		t.Errorf("SMU_HOSTED=false vs hosted:true: want one override, got %v", o)
	}
	t.Setenv("SMU_HOSTED", "true") // agrees with the default file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("SMU_HOSTED=true must not be reported, got %v", o)
	}
	t.Setenv("SMU_HOSTED", "TRUE") // not a value SMU_HOSTED takes: reported as typed
	if o := envOverrides(file); len(o) != 1 || o[0].EnvValue != "TRUE" {
		t.Errorf("SMU_HOSTED=TRUE: want it reported as typed, got %v", o)
	}
	t.Setenv("SMU_HOSTED", "")
	t.Setenv("SMU_SSL_SKIP_CERT_VERIFY", "false") // agrees with the default file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("SMU_SSL_SKIP_CERT_VERIFY=false must not be reported, got %v", o)
	}
	t.Setenv("SMU_SSL_SKIP_CERT_VERIFY", "TRUE") // not a value loadConfig takes: reported as typed
	if o := envOverrides(file); len(o) != 1 || o[0].EnvValue != "TRUE" || o[0].Key != "tls.insecureSkipVerify" {
		t.Errorf("SMU_SSL_SKIP_CERT_VERIFY=TRUE: want it reported as typed, got %v", o)
	}
	t.Setenv("SMU_SSL_SKIP_CERT_VERIFY", "")
	t.Setenv("SMU_SHOW_AUDIT", "false") // agrees with the default file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("SMU_SHOW_AUDIT=false must not be reported, got %v", o)
	}
	t.Setenv("SMU_SHOW_AUDIT", "TRUE") // not a value loadConfig takes: reported as typed
	if o := envOverrides(file); len(o) != 1 || o[0].EnvValue != "TRUE" || o[0].Key != "audit.stdout" {
		t.Errorf("SMU_SHOW_AUDIT=TRUE: want it reported as typed, got %v", o)
	}
	t.Setenv("SMU_SHOW_AUDIT", "")

	differing := map[string]string{
		"SMU_HOSTED": "false", "SMU_CONN_MODES": "both", "SMU_DEFAULT_CONN": "provisioned",
		"SMU_SSL_SKIP_CERT_VERIFY": "true", "LOG_LEVEL": "debug", "SMU_SHOW_AUDIT": "true",
	}
	if len(differing) != len(seedVars) {
		t.Fatalf("test table covers %d vars, seedVars has %d", len(differing), len(seedVars))
	}
	for _, v := range seedVars {
		t.Setenv(v.env, differing[v.env])
		o := envOverrides(file)
		t.Setenv(v.env, "")
		if len(o) != 1 || o[0].Env != v.env || o[0].Key != v.key || o[0].EnvValue != differing[v.env] {
			t.Errorf("%s: want exactly one override for key %s, got %v", v.env, v.key, o)
		}
	}
}

func TestLevelName(t *testing.T) {
	cases := map[slog.Level]string{
		slog.LevelDebug:    "debug",
		slog.LevelInfo:     "info",
		slog.LevelWarn:     "warn",
		slog.LevelError:    "error",
		slog.LevelWarn + 1: "warn+1",
	}
	for l, want := range cases {
		if got := levelName(l); got != want {
			t.Errorf("levelName(%v): want %q, got %q", l, want, got)
		}
	}
}

// CONFIG_FILE is gone: config.yaml is always configFilePath. One that names
// another file stops the start, since a fresh seed would drop that file's
// settings (the access list among them); one that names the file read is only
// warned about.
func TestResolveConfig_RemovedConfigFile(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	elsewhere := filepath.Join(t.TempDir(), "mine.yaml")
	t.Setenv("CONFIG_FILE", elsewhere)
	_, err := resolveConfig(path)
	if err == nil || !strings.Contains(err.Error(), "CONFIG_FILE") || !strings.Contains(err.Error(), "no longer read") || !strings.Contains(err.Error(), path) {
		t.Fatalf("want a refusal naming CONFIG_FILE and the file read, got %v", err)
	}
	if _, err := os.Stat(path); err == nil {
		t.Error("a refused start must not seed a file")
	}

	t.Setenv("CONFIG_FILE", path)
	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(removedNames(load.removed), []string{"CONFIG_FILE"}) || !strings.Contains(load.removed[0].instead, configFilePath) {
		t.Errorf("want a warning that names CONFIG_FILE and the fixed path, got %+v", load.removed)
	}
}

// An old variable name stops the start before anything is written: one error
// lists every old name set with its new name, and never a value (ADMIN_PASSWORD
// is a secret). An empty value counts as unset.
func TestResolveConfig_RefusesRenamedVariables(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("SSL_CERT_FILE", "/old/value-one")
	t.Setenv("HOSTED", "false")
	t.Setenv("ADMIN_PASSWORD", "hunter2-not-for-logs")

	_, err := resolveConfig(path)
	if err == nil {
		t.Fatal("want a refusal")
	}
	msg := err.Error()
	for _, want := range []string{"SSL_CERT_FILE -> SMU_SSL_CERTFILE", "HOSTED -> SMU_HOSTED", "ADMIN_PASSWORD -> SMU_ADMIN_PASSWORD", "Rename them"} {
		if !strings.Contains(msg, want) {
			t.Errorf("error lacks %q: %s", want, msg)
		}
	}
	for _, leaked := range []string{"hunter2-not-for-logs", "/old/value-one"} {
		if strings.Contains(msg, leaked) {
			t.Errorf("a value leaked into the error: %s", msg)
		}
	}
	for _, unset := range []string{"SSL_KEY_FILE", "SSL_TRUST_DIR", "CONN_MODES", "DEFAULT_CONN", "ADMIN_PASSWORD_FILE", "SSL_INSECURE_SKIP_VERIFY"} {
		if strings.Contains(msg, unset) {
			t.Errorf("%s is not set and must not be listed: %s", unset, msg)
		}
	}
	if _, err := os.Stat(path); err == nil {
		t.Error("a refused start must not seed a file")
	}
}

// Each old name alone is refused, with its new name, whether config.yaml
// exists or not.
func TestResolveConfig_RefusesEachRenamedVariable(t *testing.T) {
	existing := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(existing, []byte("version: 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, r := range renamedEnv {
		t.Run(r.old, func(t *testing.T) {
			clearSeedEnv(t)
			t.Setenv(r.old, "x")
			for _, path := range []string{existing, filepath.Join(t.TempDir(), "fresh.yaml")} {
				_, err := resolveConfig(path)
				if err == nil || !strings.Contains(err.Error(), r.old+" -> "+r.new) {
					t.Errorf("%s: want a refusal naming %s, got %v", path, r.new, err)
				}
			}
		})
	}
}

// The users store, the connections store and the store key are always at their
// default paths. An environment variable that still names one is ignored and
// named for the start-up warning, which sends the operator to Backup & Restore;
// it never refuses the start.
func TestResolveConfig_IgnoresTheRemovedStoreVariables(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("version: 1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("USERS_FILE", "/m/users.yaml")
	t.Setenv("CONNECTIONS_FILE", "/m/connections.yaml")
	t.Setenv("STORE_KEY_FILE", "/m/store.key")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatalf("a removed variable must only warn: %v", err)
	}
	if want := []string{"USERS_FILE", "CONNECTIONS_FILE", "STORE_KEY_FILE"}; !reflect.DeepEqual(removedNames(load.removed), want) {
		t.Errorf("removed: want %v, got %v", want, load.removed)
	}
	for _, r := range load.removed {
		if !strings.Contains(r.instead, "Backup & Restore") || !strings.Contains(r.instead, "/data/") {
			t.Errorf("%s: the warning must name the fixed path and Backup & Restore: %q", r.name, r.instead)
		}
	}
	if load.cfg.usersFile != defaultUsersFile || load.cfg.connectionsFile != defaultConnectionsFile || load.cfg.storeKeyFile != defaultStoreKeyFile {
		t.Errorf("the stores stay at their fixed paths: %q %q %q", load.cfg.usersFile, load.cfg.connectionsFile, load.cfg.storeKeyFile)
	}
	if len(load.overrides) != 0 {
		t.Errorf("a removed variable is no longer a seeding variable: %v", load.overrides)
	}
}

// A first start with a removed variable set seeds a file without it and names
// the variable for the warning.
func TestResolveConfig_SeedIgnoresTheRemovedStoreVariables(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("USERS_FILE", "/m/users.yaml")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !load.seeded || !reflect.DeepEqual(removedNames(load.removed), []string{"USERS_FILE"}) {
		t.Errorf("seeded=%v removed=%v: want a seed that names USERS_FILE", load.seeded, load.removed)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "usersFile") || strings.Contains(string(data), "/m/users.yaml") {
		t.Errorf("the seeded file must not carry the removed setting:\n%s", data)
	}
}

// usersFile and connectionsFile are gone from config.yaml. A file that still
// has them loads, the value is ignored, both keys are named for the warning,
// and the next write of the file (a settings save) drops them.
func TestResolveConfig_IgnoresTheRemovedStoreKeys(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("version: 1\nusersFile: /m/users.yaml\nconnectionsFile: /m/connections.yaml\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatalf("a file with the removed keys must still load: %v", err)
	}
	if want := []string{"usersFile", "connectionsFile"}; !reflect.DeepEqual(removedNames(load.removed), want) {
		t.Errorf("removed: want %v, got %v", want, load.removed)
	}
	for _, r := range load.removed {
		if !strings.Contains(r.instead, "Backup & Restore") {
			t.Errorf("%s: the warning must point to Backup & Restore: %q", r.name, r.instead)
		}
	}
	if load.cfg.usersFile != defaultUsersFile || load.cfg.connectionsFile != defaultConnectionsFile {
		t.Errorf("the file's paths must be ignored: %q %q", load.cfg.usersFile, load.cfg.connectionsFile)
	}
	data, err := encodeConfigFile(fileConfigFromConfig(load.cfg))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "usersFile") || strings.Contains(string(data), "connectionsFile") {
		t.Errorf("the next write must drop the keys:\n%s", data)
	}
}

// The first-start seed is a journaled commit like every other write of the
// file: the file lands whole with the operator-readable mode, the journal and
// its leftovers are gone, and the bytes returned are the bytes on disk.
func TestSeedConfigFile_GoesThroughTheJournal(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	data, err := seedConfigFile(path, defaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if onDisk := readOr(t, path); onDisk != string(data) || !strings.HasPrefix(onDisk, "# config.yaml -- AUTHORITATIVE") {
		t.Errorf("the seed on disk differs from what was returned:\n%s", onDisk)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm() != 0o644 {
			t.Errorf("mode: want 0644, got %v (%v)", info, err)
		}
	}
	for _, left := range []string{txnFileName, "config.yaml.bak"} {
		if got := readOr(t, filepath.Join(dir, left)); got != "<absent>" {
			t.Errorf("%s left behind after the commit: %q", left, got)
		}
	}
	assertNoTempFiles(t, dir)
}

// A seed whose bytes would not parse back strictly is never committed: the
// round-trip check refuses it and the target stays absent.
func TestConfigVerifier_RefusesWhatAStartWouldRefuse(t *testing.T) {
	good, err := encodeConfigFile(defaultFileConfig())
	if err != nil {
		t.Fatal(err)
	}
	verify := configVerifier("config.yaml")
	if err := verify(good); err != nil {
		t.Fatalf("a file the gateway wrote must verify: %v", err)
	}
	for name, bad := range map[string][]byte{
		"empty":         nil,
		"unknown key":   []byte("version: 1\nsurprise: true\n"),
		"wrong version": []byte("version: 2\n"),
		"not yaml":      []byte("version: [1\n"),
	} {
		if err := verify(bad); err == nil {
			t.Errorf("%s must fail the round trip", name)
		}
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	wr := newWriter(dir, nil, quietLogger())
	err = wr.Do(t.Context(), func(tx *txn) error {
		tx.stage(path, []byte("version: 1\nsurprise: true\n"), 0o644, configVerifier(path))
		return nil
	})
	var failed *writeFailedError
	if !errors.As(err, &failed) || readOr(t, path) != "<absent>" {
		t.Errorf("want the commit refused with nothing written, got %v", err)
	}
}

// A config.yaml of an earlier release still holds tls.certFile, tls.keyFile
// and tls.trustDir. It loads as before: the paths in use are the environment's
// (or the image's defaults), the keys are ignored, each one that differs from
// the path in use is named for the start-up warning, and the next write of the
// file drops all three.
func TestResolveConfig_RemovedTLSPathKeysAreIgnoredAndDropped(t *testing.T) {
	clearSeedEnv(t)
	t.Setenv("SMU_SSL_CERTFILE", "/env/tls.crt")
	path := filepath.Join(t.TempDir(), "config.yaml")
	writeFile(t, path, "version: 1\ntls:\n  certFile: /env/tls.crt\n  keyFile: /old/tls.key\n  trustDir: /old/trust\n  insecureSkipVerify: true\n")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatalf("a file with the removed keys must still load: %v", err)
	}
	if load.cfg.certFile != "/env/tls.crt" || load.cfg.keyFile != defaultKeyFile || load.cfg.trustDir != defaultTrustDir || !load.cfg.insecureSkipVerify {
		t.Errorf("paths in use %q %q %q, skip %v: want the environment's and the defaults, never the file's", load.cfg.certFile, load.cfg.keyFile, load.cfg.trustDir, load.cfg.insecureSkipVerify)
	}
	want := []string{
		`tls.keyFile="/old/tls.key" (in use: "/tls/tls.key")`,
		`tls.trustDir="/old/trust" (in use: "/tls/trust")`,
	}
	if !reflect.DeepEqual(load.tlsPathsIgnored, want) {
		t.Errorf("ignored keys %q, want %q (certFile agrees with the environment and says nothing)", load.tlsPathsIgnored, want)
	}

	data, err := encodeConfigFile(fileConfigFromConfig(load.cfg))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"\n  certFile:", "\n  keyFile:", "\n  trustDir:", "<- SMU_SSL_CERTFILE", "<- SMU_SSL_CERTKEYFILE", "<- SMU_SSL_TRUSTDIR"} {
		if strings.Contains(string(data), key) {
			t.Errorf("the next write must drop the removed keys, but it holds %q:\n%s", key, data)
		}
	}
	if !strings.Contains(string(data), "insecureSkipVerify: true") {
		t.Errorf("tls.insecureSkipVerify stays in the file:\n%s", data)
	}
}

// Keys that agree with the paths in use change nothing, so they are not named.
func TestRemovedTLSPaths_AgreeingKeysAreSilent(t *testing.T) {
	inUse := tlsPaths{certFile: "/a", keyFile: "/b", trustDir: "/c"}
	same, other := "/a", "/z"
	if got := removedTLSPaths(fileConfig{TLS: fileTLS{RemovedCertFile: &same}}, inUse); len(got) != 0 {
		t.Errorf("an agreeing key was named: %v", got)
	}
	if got := removedTLSPaths(fileConfig{}, inUse); len(got) != 0 {
		t.Errorf("no keys, nothing to name: %v", got)
	}
	got := removedTLSPaths(fileConfig{TLS: fileTLS{RemovedCertFile: &other}}, inUse)
	if !reflect.DeepEqual(got, []string{`tls.certFile="/z" (in use: "/a")`}) {
		t.Errorf("got %v", got)
	}
}

// The TLS paths are read from the environment at every start, with the image's
// defaults, and a settings page or an import never carries them.
func TestTLSPathsFromEnv(t *testing.T) {
	clearSeedEnv(t)
	if got := tlsPathsFromEnv(); got != (tlsPaths{certFile: "/tls/tls.crt", keyFile: "/tls/tls.key", trustDir: "/tls/trust"}) {
		t.Errorf("defaults: %+v", got)
	}
	t.Setenv("SMU_SSL_CERTFILE", "/e/c")
	t.Setenv("SMU_SSL_CERTKEYFILE", "/e/k")
	t.Setenv("SMU_SSL_TRUSTDIR", "/e/t")
	if got := tlsPathsFromEnv(); got != (tlsPaths{certFile: "/e/c", keyFile: "/e/k", trustDir: "/e/t"}) {
		t.Errorf("environment: %+v", got)
	}
	cfg := defaultConfig()
	cfg.certFile, cfg.keyFile, cfg.trustDir = "/r/c", "/r/k", "/r/t"
	rebuilt, err := fileConfigFromConfig(cfg).toConfig(cfg.secretPaths())
	if err != nil {
		t.Fatal(err)
	}
	if rebuilt.certFile != "/r/c" || rebuilt.keyFile != "/r/k" || rebuilt.trustDir != "/r/t" {
		t.Errorf("a config rebuilt from a document keeps the running paths: %q %q %q", rebuilt.certFile, rebuilt.keyFile, rebuilt.trustDir)
	}
}

// The sign-in and session keys added to the file have these defaults, for a
// file or a config that never had them, and each is the bound the setting
// documents.
func TestFileConfig_SignInKeysDefaults(t *testing.T) {
	d := defaultFileConfig()
	if l := d.Login; l.MaxFailures != 5 || !l.PerClient || l.ClientMaxFailures != 10 || l.ResetMinutes != 15 ||
		l.PasswordMinLength != 12 || l.TwoFactorMinutes != 10 {
		t.Errorf("login defaults: %+v", l)
	}
	if d.Session.ConnectsPerMinute != 20 {
		t.Errorf("session.connectsPerMinute defaults to 20, got %d", d.Session.ConnectsPerMinute)
	}
	// A file that leaves them out reads the defaults, also beside keys it sets.
	fc, err := decodeConfigFile([]byte("version: 1\nlogin:\n  maxFailures: 7\nsession:\n  idleMinutes: 5\n"), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if l := fc.Login; l.MaxFailures != 7 || !l.PerClient || l.ClientMaxFailures != 10 || l.ResetMinutes != 15 || l.PasswordMinLength != 12 || l.TwoFactorMinutes != 10 {
		t.Errorf("login: %+v", l)
	}
	if fc.Session.ConnectsPerMinute != 20 || fc.Session.IdleMinutes != 5 {
		t.Errorf("session: %+v", fc.Session)
	}
	// perClient false in a file is kept, not read as absent.
	fc, err = decodeConfigFile([]byte("version: 1\nlogin:\n  perClient: false\n"), "x.yaml")
	if err != nil || fc.Login.PerClient {
		t.Errorf("perClient: false must survive the decode: %+v, %v", fc.Login, err)
	}
}

// The new keys reach the runtime config and back, and the file written from it
// carries every one and decodes to the same values.
func TestToConfig_SignInKeysRoundTrip(t *testing.T) {
	fc := defaultFileConfig()
	fc.Login.PerClient, fc.Login.ClientMaxFailures, fc.Login.ResetMinutes = false, 30, 45
	fc.Login.PasswordMinLength, fc.Login.TwoFactorMinutes = 16, 5
	fc.Session.ConnectsPerMinute = 40
	cfg, err := fc.toConfig(secretPaths{})
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.login.perClientOff || cfg.login.clientMaxFailures != 30 || cfg.login.reset != 45*time.Minute || cfg.login.passwordMinLength != 16 {
		t.Errorf("login: %+v", cfg.login)
	}
	if cfg.session.ticket != 5*time.Minute || cfg.session.connects != 40 {
		t.Errorf("session: %+v", cfg.session)
	}
	if back := fileConfigFromConfig(cfg); !reflect.DeepEqual(back.Login, fc.Login) || back.Session != fc.Session {
		t.Errorf("config round trip:\n%+v %+v\nwant:\n%+v %+v", back.Login, back.Session, fc.Login, fc.Session)
	}
	out, err := encodeConfigFile(fc)
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range []string{
		"  perClient: false\n", "  clientMaxFailures: 30\n", "  resetMinutes: 45\n", "  passwordMinLength: 16\n",
		"  twoFactorMinutes: 5\n", "  connectsPerMinute: 40\n",
	} {
		if !strings.Contains(string(out), line) {
			t.Errorf("the written file lacks %q:\n%s", line, out)
		}
	}
	got, err := decodeConfigFile(out, "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	got.Access, fc.Access = fileAccess{}, fileAccess{} // an empty list reads back as none; the access lists have their own tests
	if !reflect.DeepEqual(got, fc) {
		t.Errorf("file round trip:\n%+v\nwant:\n%+v", got, fc)
	}
}

// A config built without the new fields (the zero values) is written with the
// defaults the accessors give: the client limit follows the account limit, the
// reset follows the longest back-off, and the rest are the built-in values.
func TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(t *testing.T) {
	cfg := defaultConfig()
	cfg.login.perClientOff, cfg.login.clientMaxFailures, cfg.login.reset, cfg.login.passwordMinLength = false, 0, 0, 0
	cfg.session.ticket, cfg.session.connects = 0, 0
	got := fileConfigFromConfig(cfg)
	if l := got.Login; !l.PerClient || l.ClientMaxFailures != cfg.login.maxFailures || l.ResetMinutes != 15 || l.PasswordMinLength != passwordMinLen || l.TwoFactorMinutes != 10 {
		t.Errorf("login: %+v", l)
	}
	if got.Session.ConnectsPerMinute != defaultConnectsPerMinute {
		t.Errorf("session.connectsPerMinute: %d", got.Session.ConnectsPerMinute)
	}
	// The accessors are what the throttle, the password rule and the sessions read.
	if (loginLimits{}).minPassword() != passwordMinLen || (sessionLimits{}).ticketTTL() != defaultTicketTTL || (sessionLimits{}).connectsPerMinute() != defaultConnectsPerMinute {
		t.Error("zero limits must read as the built-in defaults")
	}
}
