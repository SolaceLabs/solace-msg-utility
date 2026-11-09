package main

import (
	"log/slog"
	"sync/atomic"
)

// live holds the config.yaml keys that take effect without a restart:
// connModes, defaultConn, logLevel, access.*, session.*, login.* and
// modules.*. serve() builds it from the loaded config and passes it to every
// reader, which loads the current value per request. The settings
// endpoint (settings.go) is the only writer. Every other key is read once at
// startup (restartOnlyKeys) and applies at the next restart.
type live struct {
	cur   atomic.Pointer[liveSettings]
	level slog.LevelVar // the logger's level; set with the rest by apply
}

type liveSettings struct {
	connModes, defaultConn string
	access                 accessConfig
	session                sessionLimits
	login                  loginLimits
	modules                moduleSettings
}

func newLive(cfg config) *live {
	lv := &live{}
	lv.apply(cfg)
	return lv
}

// apply swaps in cfg's live keys as one value: a reader sees the old set or
// the new one, never a mix of the two.
func (lv *live) apply(cfg config) {
	lv.cur.Store(&liveSettings{
		connModes:   cfg.connModes,
		defaultConn: cfg.defaultConn,
		access:      cfg.access,
		session:     cfg.session,
		login:       cfg.login,
		modules:     cfg.modules,
	})
	lv.level.Set(cfg.logLevel)
}

func (lv *live) get() *liveSettings { return lv.cur.Load() }

func (lv *live) sessionLimits() sessionLimits { return lv.get().session }
func (lv *live) loginLimits() loginLimits     { return lv.get().login }

// restartOnlyKeys are the config.yaml keys the gateway reads once at startup.
// A saved change applies at the next restart; the settings page marks them.
// The hostOnly keys name files and directories: the settings endpoint never
// changes them, because a path an administrator could point anywhere would let
// the gateway serve its own secrets or overwrite its stores at the next start.
// They change only by editing config.yaml on the gateway host.
var restartOnlyKeys = []struct {
	key      string
	hostOnly bool
	value    func(fileConfig) any
}{
	{"hosted", false, func(f fileConfig) any { return f.Hosted }},
	{"tls.certFile", true, func(f fileConfig) any { return f.TLS.CertFile }},
	{"tls.keyFile", true, func(f fileConfig) any { return f.TLS.KeyFile }},
	{"tls.trustDir", true, func(f fileConfig) any { return f.TLS.TrustDir }},
	{"tls.insecureSkipVerify", false, func(f fileConfig) any { return f.TLS.InsecureSkipVerify }},
	{"usersFile", true, func(f fileConfig) any { return f.UsersFile }},
	{"connectionsFile", true, func(f fileConfig) any { return f.ConnectionsFile }},
}

func restartOnlyKeyNames() []string {
	out := make([]string, 0, len(restartOnlyKeys))
	for _, k := range restartOnlyKeys {
		out = append(out, k.key)
	}
	return out
}

func hostOnlyKeyNames() []string {
	out := []string{}
	for _, k := range restartOnlyKeys {
		if k.hostOnly {
			out = append(out, k.key)
		}
	}
	return out
}

// pendingRestart lists the restart-only keys on which file differs from the
// running gateway.
func pendingRestart(running config, file fileConfig) []string {
	run := fileConfigFromConfig(running)
	out := []string{}
	for _, k := range restartOnlyKeys {
		if k.value(run) != k.value(file) {
			out = append(out, k.key)
		}
	}
	return out
}
