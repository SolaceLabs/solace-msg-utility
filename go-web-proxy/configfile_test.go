package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

// clearSeedEnv isolates a test from the developer's shell: every seeding
// variable plus the two environment-only ones is unset for its duration.
func clearSeedEnv(t *testing.T) {
	t.Helper()
	for _, v := range seedVars {
		t.Setenv(v.env, "")
	}
	t.Setenv("CONFIG_FILE", "")
	t.Setenv("STORE_KEY_FILE", "")
	t.Setenv("APP_DIR", "") // removed, but still read for its warning
}

const fullConfigYAML = `version: 1
hosted: true
connModes: both
defaultConn: provisioned
tls:
  certFile: /c/tls.crt
  keyFile: /c/tls.key
  trustDir: /c/trust
  insecureSkipVerify: true
logLevel: debug
usersFile: /m/users.yaml
connectionsFile: /m/connections.yaml
access:
  allow: [10.0.0.0/8, "2001:db8::/32"]
  trustedProxies: [10.0.0.1/32]
session:
  idleMinutes: 5
  absoluteMinutes: 60
login:
  maxFailures: 3
  backoffSeconds: 10
  maxBackoffSeconds: 600
  unauthenticatedPerMinute: 20
modules:
  offered: [queue-copy]
  userDefault: none
`

func TestDecodeConfigFile_Valid(t *testing.T) {
	fc, err := decodeConfigFile([]byte(fullConfigYAML), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	want := fileConfig{
		Version: 1, Hosted: true, ConnModes: "both", DefaultConn: "provisioned",
		TLS:      fileTLS{CertFile: "/c/tls.crt", KeyFile: "/c/tls.key", TrustDir: "/c/trust", InsecureSkipVerify: true},
		LogLevel: "debug", UsersFile: "/m/users.yaml", ConnectionsFile: "/m/connections.yaml",
		Access:  fileAccess{Allow: []string{"10.0.0.0/8", "2001:db8::/32"}, TrustedProxies: []string{"10.0.0.1/32"}},
		Session: fileSession{IdleMinutes: 5, AbsoluteMinutes: 60},
		Login:   fileLogin{MaxFailures: 3, BackoffSeconds: 10, MaxBackoffSeconds: 600, UnauthenticatedPerMinute: 20},
		Modules: fileModules{Offered: []string{"queue-copy"}, UserDefault: "none"},
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
	fc, err = decodeConfigFile([]byte("version: 1\ntls:\n  trustDir: /other\n"), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if fc.TLS.TrustDir != "/other" || fc.TLS.CertFile != "/tls/tls.crt" {
		t.Errorf("partial tls block: got %+v", fc.TLS)
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
	fc.Hosted = false // HOSTED=false: the files only, so no gateway for sign-in
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
	if cfg.session != (sessionLimits{idle: 10 * time.Minute, absolute: 30 * time.Minute}) {
		t.Errorf("session defaults: %+v", cfg.session)
	}
	if want := (loginLimits{maxFailures: 5, backoff: 30 * time.Second, maxBackoff: 15 * time.Minute, unauthPerMinute: 60}); cfg.login != want {
		t.Errorf("login defaults: %+v", cfg.login)
	}
	if want := (moduleSettings{offered: moduleCatalog(), userDefault: modulesDefaultAll}); !reflect.DeepEqual(cfg.modules, want) {
		t.Errorf("modules default: want every catalog module for every user, got %+v", cfg.modules)
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
	t.Setenv("HOSTED", "true")
	t.Setenv("CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "Info")
	t.Setenv("STORE_KEY_FILE", "/x/store.key")

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
	if load.cfg.storeKeyFile != "/x/store.key" {
		t.Errorf("store key path: want the env value, got %q", load.cfg.storeKeyFile)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("seed file not written: %v", err)
	}
	if strings.Contains(string(raw), "/x/store.key") {
		t.Error("a secret path leaked into config.yaml")
	}
	if load.sum != sha256.Sum256(raw) {
		t.Error("the seeded load must carry the hash of the bytes it wrote")
	}
	if !strings.Contains(string(raw), "connModes: both") || !strings.Contains(string(raw), "logLevel: info") {
		t.Errorf("file content: %s", raw)
	}

	again, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if again.sum != load.sum {
		t.Error("reading the file back must carry the same hash")
	}
	if again.seeded || len(again.overrides) != 0 {
		t.Errorf("second start: want file read with no overrides, got seeded=%v overrides=%v", again.seeded, again.overrides)
	}
	if again.cfg.connModes != connBoth || again.cfg.logLevel != slog.LevelInfo || !again.cfg.provisioned() {
		t.Errorf("second start config: %+v", again.cfg)
	}
}

func TestResolveConfig_InvalidEnvFailsWithoutWriting(t *testing.T) {
	clearSeedEnv(t)
	path := filepath.Join(t.TempDir(), "config.yaml")
	t.Setenv("CONN_MODES", "bogus")
	_, err := resolveConfig(path)
	if err == nil || !strings.Contains(err.Error(), `connModes="bogus"`) || !strings.Contains(err.Error(), "CONN_MODES") {
		t.Fatalf("want an error naming the key and the env var, got %v", err)
	}
	if _, statErr := os.Stat(path); !errors.Is(statErr, fs.ErrNotExist) {
		t.Error("a rejected seed must not be written")
	}
	t.Setenv("CONN_MODES", "")
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
	for _, want := range []string{path, "cannot write config file", "UID 65532", "CONFIG_FILE"} {
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
	for _, want := range []string{path, `"access.allow[1]"`, `"10.0.0.1"`, "want CIDR such as"} {
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
	t.Setenv("CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("HOSTED", "true")                        // the file's default: nothing to report
	t.Setenv("USERS_FILE", "/data/users.yaml")         // equal to the file: nothing to report
	t.Setenv("STORE_KEY_FILE", "/elsewhere/store.key") // env-only: applied, never compared

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
	if load.cfg.storeKeyFile != "/elsewhere/store.key" {
		t.Errorf("store key path: want the env value, got %q", load.cfg.storeKeyFile)
	}
	got := map[string]envOverride{}
	for _, o := range load.overrides {
		got[o.Env] = o
	}
	want := map[string][3]string{ // env -> key, env value, file value
		"CONN_MODES": {"connModes", "both", "direct"},
		"LOG_LEVEL":  {"logLevel", "debug", "warn"},
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
	if want := []string{"appDir", "APP_DIR"}; !reflect.DeepEqual(load.removed, want) {
		t.Errorf("removed: want %v, got %v", want, load.removed)
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
	if !load.seeded || !reflect.DeepEqual(load.removed, []string{"APP_DIR"}) {
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
	t.Setenv("HOSTED", "false")
	if o := envOverrides(file); len(o) != 1 || o[0].Env != "HOSTED" || o[0].FileValue != "true" {
		t.Errorf("HOSTED=false vs hosted:true: want one override, got %v", o)
	}
	t.Setenv("HOSTED", "true") // agrees with the default file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("HOSTED=true must not be reported, got %v", o)
	}
	t.Setenv("HOSTED", "TRUE") // not a value HOSTED takes: reported as typed
	if o := envOverrides(file); len(o) != 1 || o[0].EnvValue != "TRUE" {
		t.Errorf("HOSTED=TRUE: want it reported as typed, got %v", o)
	}
	t.Setenv("HOSTED", "")
	t.Setenv("SSL_INSECURE_SKIP_VERIFY", "TRUE") // loadConfig reads this as false, so it agrees with the file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("SSL_INSECURE_SKIP_VERIFY=TRUE must not be reported, got %v", o)
	}
	t.Setenv("SSL_INSECURE_SKIP_VERIFY", "")

	differing := map[string]string{
		"HOSTED": "false", "CONN_MODES": "both", "DEFAULT_CONN": "provisioned",
		"SSL_CERT_FILE": "/x", "SSL_KEY_FILE": "/x", "SSL_TRUST_DIR": "/x", "SSL_INSECURE_SKIP_VERIFY": "true",
		"LOG_LEVEL": "debug", "USERS_FILE": "/x", "CONNECTIONS_FILE": "/x",
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

func TestConfigPath(t *testing.T) {
	t.Setenv("CONFIG_FILE", "")
	if got := configPath(); got != defaultConfigFile {
		t.Errorf("default: want %s, got %s", defaultConfigFile, got)
	}
	t.Setenv("CONFIG_FILE", "/etc/gw/config.yaml")
	if got := configPath(); got != "/etc/gw/config.yaml" {
		t.Errorf("from env: got %s", got)
	}
}
