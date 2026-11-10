package main

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// config.yaml is the gateway's single source of settings. Environment variables
// seed it on first start only (see resolveConfig); afterwards the file wins and
// a differing env var is reported, never applied. The file is always at
// configFilePath; no setting moves it. STORE_KEY_FILE (where the store key is)
// is deliberately environment-only and never written to the file, so an
// admin-editable settings file can never point the gateway at a different
// secret.
const (
	configVersion       = 1
	configFilePath      = "/data/config.yaml" // fixed, like appRoot
	defaultStoreKeyFile = "/data/store.key"
)

const configFileHeader = `# config.yaml -- AUTHORITATIVE gateway settings.
# Environment variables seed this file on first start only, when it does not
# exist. Afterwards the file wins; a changed env var is ignored and logged.
# Edit this file and restart the gateway, or delete it to re-seed from env.
# STORE_KEY_FILE (the store key) is environment-only and never appears here.
# access.*, session.*, login.* and modules.* have no env var: edit them here.
# An empty allow list admits every client; trustedProxies lists the reverse
# proxies whose X-Forwarded-For is believed. session.*, login.* and modules.*
# apply only in Provisioned mode (connModes provisioned or both):
# modules.offered lists the app modules a signed-in user may be given,
# modules.userDefault (all|none) what a user without a list of their own gets.
# In Provisioned mode an administrator can also edit this file from the admin
# console's Gateway Settings, where every key except hosted, tls.*, usersFile
# and connectionsFile applies at once.
`

// fileConfig is the on-disk shape. Field order is the order yaml.Marshal writes.
// The JSON names are the settings page's (GET/PUT /managed/settings): the same
// keys, without the version, which the gateway owns.
type fileConfig struct {
	Version         int         `yaml:"version" json:"-"`
	Hosted          bool        `yaml:"hosted" json:"hosted"`
	ConnModes       string      `yaml:"connModes" json:"connModes"`
	DefaultConn     string      `yaml:"defaultConn" json:"defaultConn"`
	TLS             fileTLS     `yaml:"tls" json:"tls"`
	LogLevel        string      `yaml:"logLevel" json:"logLevel"`
	UsersFile       string      `yaml:"usersFile" json:"usersFile"`
	ConnectionsFile string      `yaml:"connectionsFile" json:"connectionsFile"`
	Access          fileAccess  `yaml:"access" json:"access"`
	Session         fileSession `yaml:"session" json:"session"`
	Login           fileLogin   `yaml:"login" json:"login"`
	Modules         fileModules `yaml:"modules" json:"modules"`
	// RemovedAppDir is the appDir key an earlier release read; the app is now
	// always served from appRoot. A file that still has it loads, the value is
	// ignored with a warning at start (removedInUse), and the gateway's next
	// write of the file drops it.
	RemovedAppDir *string `yaml:"appDir,omitempty" json:"-"`
}

type fileTLS struct {
	CertFile           string `yaml:"certFile" json:"certFile"`
	KeyFile            string `yaml:"keyFile" json:"keyFile"`
	TrustDir           string `yaml:"trustDir" json:"trustDir"`
	InsecureSkipVerify bool   `yaml:"insecureSkipVerify" json:"insecureSkipVerify"`
}

type fileAccess struct {
	Allow          []string `yaml:"allow" json:"allow"`
	TrustedProxies []string `yaml:"trustedProxies" json:"trustedProxies"`
}

type fileSession struct {
	IdleMinutes     int `yaml:"idleMinutes" json:"idleMinutes"`
	AbsoluteMinutes int `yaml:"absoluteMinutes" json:"absoluteMinutes"`
}

type fileLogin struct {
	MaxFailures              int `yaml:"maxFailures" json:"maxFailures"`
	BackoffSeconds           int `yaml:"backoffSeconds" json:"backoffSeconds"`
	MaxBackoffSeconds        int `yaml:"maxBackoffSeconds" json:"maxBackoffSeconds"`
	UnauthenticatedPerMinute int `yaml:"unauthenticatedPerMinute" json:"unauthenticatedPerMinute"`
}

type fileModules struct {
	Offered     []string `yaml:"offered" json:"offered"`
	UserDefault string   `yaml:"userDefault" json:"userDefault"`
}

// clone copies fc deeply enough that decoding into the copy cannot write
// through to fc's slices.
func (fc fileConfig) clone() fileConfig {
	fc.Access.Allow = slices.Clone(fc.Access.Allow)
	fc.Access.TrustedProxies = slices.Clone(fc.Access.TrustedProxies)
	fc.Modules.Offered = slices.Clone(fc.Modules.Offered)
	return fc
}

// sessionLimits bound a Provisioned sign-in session: idle is measured from the
// last request, absolute from sign-in (session.go).
type sessionLimits struct{ idle, absolute time.Duration }

// loginLimits drive the sign-in throttle (throttle.go): back-off after
// maxFailures failed sign-ins, doubling from backoff up to maxBackoff, and a
// per-client budget for requests that carry no session.
type loginLimits struct {
	maxFailures     int
	backoff         time.Duration
	maxBackoff      time.Duration
	unauthPerMinute int
}

// moduleCatalog is every app module an administrator can give a signed-in user.
// The sign-in module (connections) is always shown and the admin modules live
// in the admin app, so neither is listed. Queue Subscription Explorer reads the
// broker's whole subscription list over SEMP v1 and filters it to the user's
// provisioned VPNs and visible queues in the browser (visibleQueueRows in
// src/core/managed-semp-filter.ts), like the queue lists. Queue Discovery is
// left out: nothing filters it, so it stays hidden in every Provisioned
// session (src/core/rbac.ts). tests/variants.test.ts parses this line and
// checks it against the managed variant.
func moduleCatalog() []string { return []string{"queue-browser", "queue-copy", "queue-subscription-explorer"} }

// modules.userDefault values: what a user without a list of their own gets.
const (
	modulesDefaultAll  = "all"
	modulesDefaultNone = "none"
)

// moduleSettings is the validated modules block. offered is in catalog order.
type moduleSettings struct {
	offered     []string
	userDefault string
}

// forUser is the modules a user may open: their own list, or the deployment
// default when they have none, never beyond what is offered. granted nil means
// "no list of their own"; an empty list means none.
func (ms moduleSettings) forUser(granted *[]string) []string {
	out := []string{}
	for _, id := range ms.offered {
		if granted == nil && ms.userDefault == modulesDefaultAll || granted != nil && slices.Contains(*granted, id) {
			out = append(out, id)
		}
	}
	return out
}

// checkModuleIDs rejects an id outside the catalog and one listed twice; key
// names the list in the error.
func checkModuleIDs(key string, ids []string) error {
	catalog := moduleCatalog()
	for i, id := range ids {
		at := fmt.Sprintf("%s[%d]", key, i)
		if !slices.Contains(catalog, id) {
			return fmt.Errorf("key %q has invalid value %q: must be one of %s", at, id, strings.Join(catalog, ", "))
		}
		if slices.Index(ids, id) < i {
			return fmt.Errorf("key %q has invalid value %q: listed twice", at, id)
		}
	}
	return nil
}

// seedVar maps one environment variable to its config.yaml key. fromEnv
// normalises the raw env string the way loadConfig parses it, so the override
// comparison is on effective values (SSL_INSECURE_SKIP_VERIFY=TRUE parses to
// false and therefore agrees with `insecureSkipVerify: false`).
type seedVar struct {
	env, key  string
	fromEnv   func(raw string) string
	fileValue func(c config) string
}

var seedVars = []seedVar{
	{"HOSTED", "hosted", hostedEnv, func(c config) string { return strconv.FormatBool(c.hosted) }},
	{"CONN_MODES", "connModes", strings.ToLower, func(c config) string { return c.connModes }},
	{"DEFAULT_CONN", "defaultConn", strings.ToLower, func(c config) string { return c.defaultConn }},
	{"SSL_CERT_FILE", "tls.certFile", identity, func(c config) string { return c.certFile }},
	{"SSL_KEY_FILE", "tls.keyFile", identity, func(c config) string { return c.keyFile }},
	{"SSL_TRUST_DIR", "tls.trustDir", identity, func(c config) string { return c.trustDir }},
	{"SSL_INSECURE_SKIP_VERIFY", "tls.insecureSkipVerify", boolEnv, func(c config) string { return strconv.FormatBool(c.insecureSkipVerify) }},
	{"LOG_LEVEL", "logLevel", strings.ToLower, func(c config) string { return levelName(c.logLevel) }},
	{"USERS_FILE", "usersFile", identity, func(c config) string { return c.usersFile }},
	{"CONNECTIONS_FILE", "connectionsFile", identity, func(c config) string { return c.connectionsFile }},
}

func boolEnv(raw string) string { return strconv.FormatBool(raw == "true") }

// hostedEnv mirrors parseHosted for the override comparison: unset or "true" is
// true, "false" is false, and any other value stays as typed, so it is
// reported as differing from the file.
func hostedEnv(raw string) string {
	if b, err := parseHosted(raw); err == nil {
		return strconv.FormatBool(b)
	}
	return raw
}
func identity(raw string) string { return raw }

// secretPaths are the environment-only locations of the gateway's secrets.
// toConfig takes them from its caller, never from the file.
type secretPaths struct {
	storeKey string // STORE_KEY_FILE
}

func secretPathsFromEnv() secretPaths {
	return secretPaths{storeKey: envOr("STORE_KEY_FILE", defaultStoreKeyFile)}
}

func defaultFileConfig() fileConfig { return fileConfigFromConfig(defaultConfig()) }

func fileConfigFromConfig(c config) fileConfig {
	return fileConfig{
		Version:     configVersion,
		Hosted:      c.hosted,
		ConnModes:   c.connModes,
		DefaultConn: c.defaultConn,
		TLS: fileTLS{
			CertFile:           c.certFile,
			KeyFile:            c.keyFile,
			TrustDir:           c.trustDir,
			InsecureSkipVerify: c.insecureSkipVerify,
		},
		LogLevel:        levelName(c.logLevel),
		UsersFile:       c.usersFile,
		ConnectionsFile: c.connectionsFile,
		Access: fileAccess{
			Allow:          prefixStrings(c.access.allow),
			TrustedProxies: prefixStrings(c.access.trustedProxies),
		},
		Session: fileSession{
			IdleMinutes:     int(c.session.idle / time.Minute),
			AbsoluteMinutes: int(c.session.absolute / time.Minute),
		},
		Login: fileLogin{
			MaxFailures:              c.login.maxFailures,
			BackoffSeconds:           int(c.login.backoff / time.Second),
			MaxBackoffSeconds:        int(c.login.maxBackoff / time.Second),
			UnauthenticatedPerMinute: c.login.unauthPerMinute,
		},
		Modules: fileModules{
			Offered:     append([]string{}, c.modules.offered...),
			UserDefault: c.modules.userDefault,
		},
	}
}

func prefixStrings(ps []netip.Prefix) []string {
	out := make([]string, 0, len(ps))
	for _, p := range ps {
		out = append(out, p.String())
	}
	return out
}

// toConfig validates every value and converts to the runtime config.
// The secret paths come from the environment, never from the file.
func (fc fileConfig) toConfig(secrets secretPaths) (config, error) {
	level, err := parseLogLevel(fc.LogLevel)
	if err != nil {
		return config{}, fmt.Errorf("key %q has invalid value %q: %w", "logLevel", fc.LogLevel, err)
	}
	allow, err := parseCIDRs("access.allow", fc.Access.Allow)
	if err != nil {
		return config{}, err
	}
	trusted, err := parseCIDRs("access.trustedProxies", fc.Access.TrustedProxies)
	if err != nil {
		return config{}, err
	}
	session, err := fc.Session.limits()
	if err != nil {
		return config{}, err
	}
	login, err := fc.Login.limits()
	if err != nil {
		return config{}, err
	}
	modules, err := fc.Modules.settings()
	if err != nil {
		return config{}, err
	}
	cfg := config{
		hosted:             fc.Hosted,
		certFile:           fc.TLS.CertFile,
		keyFile:            fc.TLS.KeyFile,
		trustDir:           fc.TLS.TrustDir,
		insecureSkipVerify: fc.TLS.InsecureSkipVerify,
		logLevel:           level,
		usersFile:          fc.UsersFile,
		connectionsFile:    fc.ConnectionsFile,
		storeKeyFile:       secrets.storeKey,
		backupDir:          backupRoot,
		connModes:          strings.ToLower(fc.ConnModes),
		defaultConn:        strings.ToLower(fc.DefaultConn),
		access:             accessConfig{allow: allow, trustedProxies: trusted},
		session:            session,
		login:              login,
		modules:            modules,
	}
	// Value and cross checks on the connection modes.
	if err := validateConnModes(cfg); err != nil {
		return config{}, err
	}
	return cfg, nil
}

// limits validates the session block. The upper bound keeps a session from
// outliving a day; idle can never exceed absolute.
func (sc fileSession) limits() (sessionLimits, error) {
	if err := intInRange("session.absoluteMinutes", sc.AbsoluteMinutes, 1, 1440); err != nil {
		return sessionLimits{}, err
	}
	if err := intInRange("session.idleMinutes", sc.IdleMinutes, 1, sc.AbsoluteMinutes); err != nil {
		return sessionLimits{}, fmt.Errorf("%w (session.absoluteMinutes is %d)", err, sc.AbsoluteMinutes)
	}
	return sessionLimits{
		idle:     time.Duration(sc.IdleMinutes) * time.Minute,
		absolute: time.Duration(sc.AbsoluteMinutes) * time.Minute,
	}, nil
}

// limits validates the login block; maxBackoffSeconds can never be below
// backoffSeconds.
func (fl fileLogin) limits() (loginLimits, error) {
	checks := []struct {
		key       string
		v, lo, hi int
	}{
		{"login.maxFailures", fl.MaxFailures, 1, 1000},
		{"login.maxBackoffSeconds", fl.MaxBackoffSeconds, 1, 86400},
		{"login.unauthenticatedPerMinute", fl.UnauthenticatedPerMinute, 1, 10000},
	}
	for _, c := range checks {
		if err := intInRange(c.key, c.v, c.lo, c.hi); err != nil {
			return loginLimits{}, err
		}
	}
	if err := intInRange("login.backoffSeconds", fl.BackoffSeconds, 1, fl.MaxBackoffSeconds); err != nil {
		return loginLimits{}, fmt.Errorf("%w (login.maxBackoffSeconds is %d)", err, fl.MaxBackoffSeconds)
	}
	return loginLimits{
		maxFailures:     fl.MaxFailures,
		backoff:         time.Duration(fl.BackoffSeconds) * time.Second,
		maxBackoff:      time.Duration(fl.MaxBackoffSeconds) * time.Second,
		unauthPerMinute: fl.UnauthenticatedPerMinute,
	}, nil
}

// settings validates the modules block.
func (fm fileModules) settings() (moduleSettings, error) {
	if err := checkModuleIDs("modules.offered", fm.Offered); err != nil {
		return moduleSettings{}, err
	}
	switch fm.UserDefault {
	case modulesDefaultAll, modulesDefaultNone:
	default:
		return moduleSettings{}, fmt.Errorf("key %q has invalid value %q: must be %q or %q", "modules.userDefault", fm.UserDefault, modulesDefaultAll, modulesDefaultNone)
	}
	offered := []string{}
	for _, id := range moduleCatalog() {
		if slices.Contains(fm.Offered, id) {
			offered = append(offered, id)
		}
	}
	return moduleSettings{offered: offered, userDefault: fm.UserDefault}, nil
}

func intInRange(key string, v, lo, hi int) error {
	if v < lo || v > hi {
		return fmt.Errorf("key %q has invalid value %q: must be %d to %d", key, strconv.Itoa(v), lo, hi)
	}
	return nil
}

// parseCIDRs turns the file's CIDR strings into masked prefixes. A bare address
// is rejected (ParsePrefix needs the slash) and so is an IPv4-mapped IPv6
// prefix, which would never match the unmapped addresses the access check
// compares against.
func parseCIDRs(key string, in []string) ([]netip.Prefix, error) {
	if len(in) == 0 {
		return nil, nil
	}
	out := make([]netip.Prefix, 0, len(in))
	for i, s := range in {
		at := fmt.Sprintf("%s[%d]", key, i)
		p, err := netip.ParsePrefix(strings.TrimSpace(s))
		if err != nil {
			return nil, fmt.Errorf("key %q has invalid value %q: want CIDR such as 10.0.0.0/8 or 192.0.2.7/32 (%v)", at, s, err)
		}
		if p.Addr().Is4In6() {
			return nil, fmt.Errorf("key %q has invalid value %q: use the IPv4 form", at, s)
		}
		out = append(out, p.Masked())
	}
	return out, nil
}

// decodeConfigFile parses a config file strictly: unknown keys, an empty file
// and a foreign version are errors. Missing keys keep their built-in defaults
// (never an env value: the file is authoritative).
func decodeConfigFile(data []byte, path string) (fileConfig, error) {
	fc := defaultFileConfig()
	fc.Version = 0 // the file must say so itself
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(&fc); err != nil {
		if errors.Is(err, io.EOF) {
			return fileConfig{}, fmt.Errorf("config file %q is empty; delete it to re-seed from the environment", path)
		}
		return fileConfig{}, fmt.Errorf("invalid config file %q: %w", path, err)
	}
	if fc.Version != configVersion {
		return fileConfig{}, fmt.Errorf("config file %q: version=%d unsupported, this gateway reads version %d (add \"version: 1\")", path, fc.Version, configVersion)
	}
	return fc, nil
}

// encodeConfigFile renders the file the gateway writes on first start: the
// fixed header, the key-to-env table (generated from seedVars so it cannot
// drift), then the marshalled settings.
func encodeConfigFile(fc fileConfig) ([]byte, error) {
	body, err := yaml.Marshal(fc)
	if err != nil {
		return nil, err
	}
	var b bytes.Buffer
	b.WriteString(configFileHeader)
	b.WriteString("# Key <- seeding environment variable:\n")
	for _, v := range seedVars {
		fmt.Fprintf(&b, "#   %s <- %s\n", v.key, v.env)
	}
	b.Write(body)
	return b.Bytes(), nil
}

// envOverride is one seeding variable that is set but disagrees with the file.
type envOverride struct{ Env, Key, EnvValue, FileValue string }

type configLoad struct {
	cfg       config
	seeded    bool
	overrides []envOverride
	removed   []removedSetting // still set (removedInUse); ignored
	sum       [32]byte         // SHA-256 of the file as read or seeded
}

// removedSetting is a setting an earlier release read that the file or the
// environment still sets.
type removedSetting struct {
	name    string // the key or the variable
	instead string // what replaced it, for the warning
}

// removedInUse names the removed settings still set. They are accepted and
// ignored, so an upgrade never fails on them; serve warns about each. A
// CONFIG_FILE naming another file never gets here: resolveConfig refuses it.
func removedInUse(fc fileConfig) []removedSetting {
	const ownBuild = "to serve your own build, mount it at " + appRoot
	var out []removedSetting
	if fc.RemovedAppDir != nil {
		out = append(out, removedSetting{"appDir", ownBuild})
	}
	if os.Getenv("APP_DIR") != "" {
		out = append(out, removedSetting{"APP_DIR", ownBuild})
	}
	if os.Getenv("CONFIG_FILE") != "" {
		out = append(out, removedSetting{"CONFIG_FILE", "config.yaml is always " + configFilePath})
	}
	return out
}

// configSource is where the running config came from: the file and the
// SHA-256 of the bytes the gateway last read or wrote, so a settings save can
// tell a hand edit it has not loaded from its own last write.
type configSource struct {
	path string
	sum  [32]byte
}

// resolveConfig loads config.yaml, seeding it from the environment when it does
// not exist yet. Every failure is fatal for the caller and names the path.
func resolveConfig(path string) (configLoad, error) {
	// CONFIG_FILE is no longer read. One that still names another file stops
	// the start: seeding a fresh file instead would drop that file's settings,
	// the access list among them, without a word.
	if v := os.Getenv("CONFIG_FILE"); v != "" && filepath.Clean(v) != filepath.Clean(path) {
		return configLoad{}, fmt.Errorf("CONFIG_FILE=%q is no longer read: config.yaml is always %s. Move the file there and remove CONFIG_FILE", v, path)
	}
	secrets := secretPathsFromEnv()
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		envCfg, err := loadConfig()
		if err != nil {
			return configLoad{}, fmt.Errorf("cannot seed config file %q from the environment: %w", path, err)
		}
		// Validate before writing, so a rejected value never lands in the file.
		cfg, err := fileConfigFromConfig(envCfg).toConfig(secrets)
		if err != nil {
			return configLoad{}, fmt.Errorf("cannot seed config file %q from the environment: %w", path, err)
		}
		sum, err := seedConfigFile(path, cfg)
		if err != nil {
			return configLoad{}, err
		}
		return configLoad{cfg: cfg, seeded: true, removed: removedInUse(fileConfig{}), sum: sum}, nil
	case err != nil:
		return configLoad{}, fmt.Errorf("cannot read config file %q: %w", path, err)
	}
	fc, err := decodeConfigFile(data, path)
	if err != nil {
		return configLoad{}, err
	}
	cfg, err := fc.toConfig(secrets)
	if err != nil {
		return configLoad{}, fmt.Errorf("config file %q: %w", path, err)
	}
	return configLoad{cfg: cfg, overrides: envOverrides(cfg), removed: removedInUse(fc), sum: sha256.Sum256(data)}, nil
}

// seedConfigFile writes the first config.yaml and returns the SHA-256 of what
// it wrote. Readable by operators (0644): it holds no secret.
func seedConfigFile(path string, cfg config) ([32]byte, error) {
	data, err := encodeConfigFile(fileConfigFromConfig(cfg))
	if err != nil {
		return [32]byte{}, fmt.Errorf("cannot encode config file %q: %w", path, err)
	}
	if err := writeFileAtomic(path, data, 0o644); err != nil {
		return [32]byte{}, fmt.Errorf("cannot write config file %q: %w. The gateway creates it on first start. Fix: make the directory writable by the gateway user (UID 65532), e.g. mount a writable volume at /data", path, err)
	}
	return sha256.Sum256(data), nil
}

// envOverrides lists the seeding variables that are set but disagree with the
// file. They are reported, never applied: the file is authoritative.
func envOverrides(file config) []envOverride {
	var out []envOverride
	for _, v := range seedVars {
		raw := os.Getenv(v.env)
		if raw == "" {
			continue
		}
		fv := v.fileValue(file)
		if v.fromEnv(raw) == fv {
			continue
		}
		out = append(out, envOverride{Env: v.env, Key: v.key, EnvValue: raw, FileValue: fv})
	}
	return out
}

// levelName is the inverse of parseLogLevel for the four levels the file accepts.
func levelName(l slog.Level) string {
	switch l {
	case slog.LevelDebug:
		return "debug"
	case slog.LevelInfo:
		return "info"
	case slog.LevelWarn:
		return "warn"
	case slog.LevelError:
		return "error"
	}
	return strings.ToLower(l.String())
}
