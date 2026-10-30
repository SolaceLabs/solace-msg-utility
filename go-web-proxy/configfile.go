package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/netip"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// config.yaml is the gateway's single source of settings. Environment variables
// seed it on first start only (see resolveConfig); afterwards the file wins and
// a differing env var is reported, never applied. Two values are deliberately
// environment-only and never written to the file: CONFIG_FILE (where the file
// is) and SITE_SEED_FILE (where the deployment secret is), so an admin-editable
// settings file can never point the gateway at a different secret.
const (
	configVersion       = 1
	defaultConfigFile   = "/managed/config.yaml"
	defaultSiteSeedFile = "/managed/site.seed"
)

const configFileHeader = `# config.yaml -- AUTHORITATIVE gateway settings.
# Environment variables seed this file on first start only, when it does not
# exist. Afterwards the file wins; a changed env var is ignored and logged.
# Edit this file and restart the gateway, or delete it to re-seed from env.
# CONFIG_FILE (this file) and SITE_SEED_FILE (the deployment secret) are
# environment-only and never appear here.
# access.* has no env var: edit it here. An empty allow list admits every
# client; trustedProxies lists the reverse proxies whose X-Forwarded-For is
# believed.
`

// fileConfig is the on-disk shape. Field order is the order yaml.Marshal writes.
type fileConfig struct {
	Version         int        `yaml:"version"`
	Hosted          bool       `yaml:"hosted"`
	Managed         bool       `yaml:"managed"`
	ConnModes       string     `yaml:"connModes"`
	DefaultConn     string     `yaml:"defaultConn"`
	AppDir          string     `yaml:"appDir"`
	TLS             fileTLS    `yaml:"tls"`
	LogLevel        string     `yaml:"logLevel"`
	UsersFile       string     `yaml:"usersFile"`
	ConnectionsFile string     `yaml:"connectionsFile"`
	Access          fileAccess `yaml:"access"`
}

type fileTLS struct {
	CertFile           string `yaml:"certFile"`
	KeyFile            string `yaml:"keyFile"`
	TrustDir           string `yaml:"trustDir"`
	InsecureSkipVerify bool   `yaml:"insecureSkipVerify"`
}

type fileAccess struct {
	Allow          []string `yaml:"allow"`
	TrustedProxies []string `yaml:"trustedProxies"`
}

// seedVar maps one environment variable to its config.yaml key. fromEnv
// normalises the raw env string the way loadConfig parses it, so the override
// comparison is on effective values (HOSTED=TRUE parses to false and therefore
// agrees with `hosted: false`).
type seedVar struct {
	env, key  string
	fromEnv   func(raw string) string
	fileValue func(c config) string
}

var seedVars = []seedVar{
	{"HOSTED", "hosted", boolEnv, func(c config) string { return strconv.FormatBool(c.hosted) }},
	{"MANAGED", "managed", boolEnv, func(c config) string { return strconv.FormatBool(c.managed) }},
	{"CONN_MODES", "connModes", strings.ToLower, func(c config) string { return c.connModes }},
	{"DEFAULT_CONN", "defaultConn", strings.ToLower, func(c config) string { return c.defaultConn }},
	{"APP_DIR", "appDir", identity, func(c config) string { return c.appDir }},
	{"SSL_CERT_FILE", "tls.certFile", identity, func(c config) string { return c.certFile }},
	{"SSL_KEY_FILE", "tls.keyFile", identity, func(c config) string { return c.keyFile }},
	{"SSL_TRUST_DIR", "tls.trustDir", identity, func(c config) string { return c.trustDir }},
	{"SSL_INSECURE_SKIP_VERIFY", "tls.insecureSkipVerify", boolEnv, func(c config) string { return strconv.FormatBool(c.insecureSkipVerify) }},
	{"LOG_LEVEL", "logLevel", strings.ToLower, func(c config) string { return levelName(c.logLevel) }},
	{"USERS_FILE", "usersFile", identity, func(c config) string { return c.usersFile }},
	{"CONNECTIONS_FILE", "connectionsFile", identity, func(c config) string { return c.connectionsFile }},
}

func boolEnv(raw string) string { return strconv.FormatBool(raw == "true") }
func identity(raw string) string { return raw }

// configPath is one of the two environment-only settings (the other is
// SITE_SEED_FILE, read in resolveConfig).
func configPath() string { return envOr("CONFIG_FILE", defaultConfigFile) }

func defaultFileConfig() fileConfig { return fileConfigFromConfig(defaultConfig()) }

func fileConfigFromConfig(c config) fileConfig {
	return fileConfig{
		Version:     configVersion,
		Hosted:      c.hosted,
		Managed:     c.managed,
		ConnModes:   c.connModes,
		DefaultConn: c.defaultConn,
		AppDir:      c.appDir,
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
// siteSeedFile comes from the environment, never from the file.
func (fc fileConfig) toConfig(siteSeedFile string) (config, error) {
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
	cfg := config{
		hosted:             fc.Hosted,
		appDir:             fc.AppDir,
		certFile:           fc.TLS.CertFile,
		keyFile:            fc.TLS.KeyFile,
		trustDir:           fc.TLS.TrustDir,
		insecureSkipVerify: fc.TLS.InsecureSkipVerify,
		logLevel:           level,
		managed:            fc.Managed,
		usersFile:          fc.UsersFile,
		connectionsFile:    fc.ConnectionsFile,
		siteSeedFile:       siteSeedFile,
		connModes:          strings.ToLower(fc.ConnModes),
		defaultConn:        strings.ToLower(fc.DefaultConn),
		access:             accessConfig{allow: allow, trustedProxies: trusted},
	}
	// Value and cross checks on the connection modes. Whether managed routing
	// actually loaded is serve()'s knowledge, so the build-tag leg is assumed
	// here and re-checked there with the real flag.
	if err := validateConnModes(cfg, true); err != nil {
		return config{}, err
	}
	return cfg, nil
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
}

// resolveConfig loads config.yaml, seeding it from the environment when it does
// not exist yet. Every failure is fatal for the caller and names the path.
func resolveConfig(path string) (configLoad, error) {
	siteSeed := envOr("SITE_SEED_FILE", defaultSiteSeedFile)
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		envCfg, err := loadConfig()
		if err != nil {
			return configLoad{}, fmt.Errorf("cannot seed config file %q from the environment: %w", path, err)
		}
		// Validate before writing, so a rejected value never lands in the file.
		cfg, err := fileConfigFromConfig(envCfg).toConfig(siteSeed)
		if err != nil {
			return configLoad{}, fmt.Errorf("cannot seed config file %q from the environment: %w", path, err)
		}
		if err := seedConfigFile(path, cfg); err != nil {
			return configLoad{}, err
		}
		return configLoad{cfg: cfg, seeded: true}, nil
	case err != nil:
		return configLoad{}, fmt.Errorf("cannot read config file %q: %w", path, err)
	}
	fc, err := decodeConfigFile(data, path)
	if err != nil {
		return configLoad{}, err
	}
	cfg, err := fc.toConfig(siteSeed)
	if err != nil {
		return configLoad{}, fmt.Errorf("config file %q: %w", path, err)
	}
	return configLoad{cfg: cfg, overrides: envOverrides(cfg)}, nil
}

// seedConfigFile writes the first config.yaml. Readable by operators (0644):
// it holds no secret, and the standard image has no admin UI to edit it with.
func seedConfigFile(path string, cfg config) error {
	data, err := encodeConfigFile(fileConfigFromConfig(cfg))
	if err != nil {
		return fmt.Errorf("cannot encode config file %q: %w", path, err)
	}
	if err := writeFileAtomic(path, data, 0o644); err != nil {
		return fmt.Errorf("cannot write config file %q: %w. The gateway creates it on first start. Fix: make the directory writable by the gateway user (UID 65532), e.g. mount a writable volume at /managed, or set CONFIG_FILE to a writable path", path, err)
	}
	return nil
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
