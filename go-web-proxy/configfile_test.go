package main

import (
	"errors"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

// clearSeedEnv isolates a test from the developer's shell: every seeding
// variable plus the two environment-only ones is unset for its duration.
func clearSeedEnv(t *testing.T) {
	t.Helper()
	for _, v := range seedVars {
		t.Setenv(v.env, "")
	}
	t.Setenv("CONFIG_FILE", "")
	t.Setenv("SITE_SEED_FILE", "")
}

const fullConfigYAML = `version: 1
hosted: true
managed: true
connModes: both
defaultConn: managed
appDir: /pwa
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
`

func TestDecodeConfigFile_Valid(t *testing.T) {
	fc, err := decodeConfigFile([]byte(fullConfigYAML), "x.yaml")
	if err != nil {
		t.Fatal(err)
	}
	want := fileConfig{
		Version: 1, Hosted: true, Managed: true, ConnModes: "both", DefaultConn: "managed", AppDir: "/pwa",
		TLS:      fileTLS{CertFile: "/c/tls.crt", KeyFile: "/c/tls.key", TrustDir: "/c/trust", InsecureSkipVerify: true},
		LogLevel: "debug", UsersFile: "/m/users.yaml", ConnectionsFile: "/m/connections.yaml",
		Access: fileAccess{Allow: []string{"10.0.0.0/8", "2001:db8::/32"}, TrustedProxies: []string{"10.0.0.1/32"}},
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
		"version: 1\nsiteSeedFile: /x/seed\n": "siteSeedFile", // the seed path is env-only by design
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
		fc.Hosted, fc.Managed = true, true
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
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fc := base()
			tc.mutate(&fc)
			_, err := fc.toConfig("/s")
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
	fc.Managed = true
	if _, err := fc.toConfig("/s"); err == nil || !strings.Contains(err.Error(), "hosted is false") {
		t.Fatalf("both without hosted must fail the cross check, got %v", err)
	}
	fc.Hosted = true
	fc.Access.Allow = []string{"10.1.2.3/8", "2001:db8::1/32"}
	fc.Access.TrustedProxies = []string{"192.0.2.0/24"}
	cfg, err := fc.toConfig("/seed/site.seed")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.connModes != connBoth || cfg.defaultConn != connDirect {
		t.Errorf("modes: got %q/%q", cfg.connModes, cfg.defaultConn)
	}
	if cfg.siteSeedFile != "/seed/site.seed" {
		t.Errorf("siteSeedFile must come from the caller (env), got %q", cfg.siteSeedFile)
	}
	if got := prefixStrings(cfg.access.allow); !reflect.DeepEqual(got, []string{"10.0.0.0/8", "2001:db8::/32"}) {
		t.Errorf("allow: want masked prefixes, got %v", got)
	}
	if got := prefixStrings(cfg.access.trustedProxies); !reflect.DeepEqual(got, []string{"192.0.2.0/24"}) {
		t.Errorf("trustedProxies: got %v", got)
	}
	if cfg.logLevel != slog.LevelWarn || cfg.appDir != "/SolaceMsgUtility" {
		t.Errorf("defaults not carried: %+v", cfg)
	}
}

func TestEncodeConfigFile_HeaderNoSecretsRoundTrip(t *testing.T) {
	cfg := defaultConfig()
	cfg.siteSeedFile = "/very/secret/custom.seed"
	cfg.access.allow = prefixes(t, "10.0.0.0/8")
	out, err := encodeConfigFile(fileConfigFromConfig(cfg))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.HasPrefix(s, "# config.yaml -- AUTHORITATIVE") {
		t.Errorf("header missing: %q", s[:60])
	}
	for _, forbidden := range []string{"custom.seed", "siteSeed", "site.seed"} {
		if strings.Contains(s, forbidden) {
			t.Errorf("the file must never carry the seed path, found %q", forbidden)
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
	t.Setenv("MANAGED", "true")
	t.Setenv("CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "Info")
	t.Setenv("SITE_SEED_FILE", "/x/site.seed")

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if !load.seeded || len(load.overrides) != 0 {
		t.Fatalf("first start: want seeded with no overrides, got seeded=%v overrides=%v", load.seeded, load.overrides)
	}
	if !load.cfg.hosted || !load.cfg.managed || load.cfg.connModes != connBoth || load.cfg.logLevel != slog.LevelInfo {
		t.Errorf("seeded config does not reflect env: %+v", load.cfg)
	}
	if load.cfg.siteSeedFile != "/x/site.seed" {
		t.Errorf("siteSeedFile: want the env value, got %q", load.cfg.siteSeedFile)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("seed file not written: %v", err)
	}
	if strings.Contains(string(raw), "/x/site.seed") {
		t.Error("the seed path leaked into config.yaml")
	}
	if !strings.Contains(string(raw), "connModes: both") || !strings.Contains(string(raw), "logLevel: info") {
		t.Errorf("file content: %s", raw)
	}

	again, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if again.seeded || len(again.overrides) != 0 {
		t.Errorf("second start: want file read with no overrides, got seeded=%v overrides=%v", again.seeded, again.overrides)
	}
	if again.cfg.connModes != connBoth || again.cfg.logLevel != slog.LevelInfo || !again.cfg.managed {
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
	err := seedConfigFile(path, defaultConfig())
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
	doc := "version: 1\nconnModes: direct\nlogLevel: warn\nappDir: /SolaceMsgUtility\n"
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONN_MODES", "both")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("APP_DIR", "/other")
	t.Setenv("HOSTED", "TRUE")                        // parses to false: agrees with the file
	t.Setenv("USERS_FILE", "/managed/users.yaml")     // equal to the file: nothing to report
	t.Setenv("SITE_SEED_FILE", "/elsewhere/site.seed") // env-only: applied, never compared

	load, err := resolveConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if load.seeded {
		t.Error("an existing file must not be re-seeded")
	}
	if load.cfg.connModes != connDirect || load.cfg.logLevel != slog.LevelWarn || load.cfg.appDir != "/SolaceMsgUtility" {
		t.Errorf("the file must win: %+v", load.cfg)
	}
	if load.cfg.siteSeedFile != "/elsewhere/site.seed" {
		t.Errorf("siteSeedFile: want the env value, got %q", load.cfg.siteSeedFile)
	}
	got := map[string]envOverride{}
	for _, o := range load.overrides {
		got[o.Env] = o
	}
	want := map[string][3]string{ // env -> key, env value, file value
		"CONN_MODES": {"connModes", "both", "direct"},
		"LOG_LEVEL":  {"logLevel", "debug", "warn"},
		"APP_DIR":    {"appDir", "/other", "/SolaceMsgUtility"},
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
}

func TestEnvOverrides_EveryVariableAndBoolParsing(t *testing.T) {
	clearSeedEnv(t)
	file := defaultConfig()
	t.Setenv("HOSTED", "true")
	if o := envOverrides(file); len(o) != 1 || o[0].Env != "HOSTED" || o[0].FileValue != "false" {
		t.Errorf("HOSTED=true vs hosted:false: want one override, got %v", o)
	}
	t.Setenv("HOSTED", "TRUE") // loadConfig reads this as false, so it agrees with the file
	if o := envOverrides(file); len(o) != 0 {
		t.Errorf("HOSTED=TRUE must not be reported, got %v", o)
	}
	t.Setenv("HOSTED", "")

	differing := map[string]string{
		"HOSTED": "true", "MANAGED": "true", "CONN_MODES": "both", "DEFAULT_CONN": "managed", "APP_DIR": "/x",
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
