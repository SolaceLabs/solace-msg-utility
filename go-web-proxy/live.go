package main

import (
	"log/slog"
	"sync/atomic"
)

// live holds the config.yaml keys that take effect without a restart:
// connModes, defaultConn, logLevel, access.*, session.*, login.*, modules.*,
// audit.* and tls.insecureSkipVerify. serve() builds it from the loaded config
// and passes it to every reader, which loads the current value per request.
// The settings endpoint (settings.go) is the only writer. Every other key is
// read once at startup (restartOnlyKeys) and applies at the next restart.
type live struct {
	cur   atomic.Pointer[liveSettings]
	level slog.LevelVar // the logger's level; set with the rest by apply
	// trust takes tls.insecureSkipVerify, which outbound TLS connections read
	// when they connect. Bound once, before the gateway serves (bindTrust).
	trust *trustHolder
}

type liveSettings struct {
	connModes, defaultConn string
	access                 accessConfig
	session                sessionLimits
	login                  loginLimits
	twoFactor              string
	modules                moduleSettings
	audit                  auditSettings
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
		twoFactor:   twoFactorOrDefault(cfg.twoFactor),
		modules:     cfg.modules,
		audit:       cfg.audit,
	})
	lv.level.Set(cfg.logLevel)
	if lv.trust != nil {
		lv.trust.setSkip(cfg.insecureSkipVerify)
	}
}

// bindTrust makes apply carry tls.insecureSkipVerify into h from now on. Call
// it before the gateway serves: apply reads the binding without a lock.
func (lv *live) bindTrust(h *trustHolder) { lv.trust = h }

func (lv *live) get() *liveSettings { return lv.cur.Load() }

func (lv *live) sessionLimits() sessionLimits { return lv.get().session }
func (lv *live) loginLimits() loginLimits     { return lv.get().login }

// twoFactor is login.twoFactor as the next sign-in sees it: optional, admins
// or mandatory (totp.go).
func (lv *live) twoFactor() string { return lv.get().twoFactor }

// restartOnlyKeys are the config.yaml keys the gateway reads once at startup.
// A saved change applies at the next restart; the settings page marks them.
// tls.insecureSkipVerify is not among them: it is live through the trust
// holder (trustHolder.setSkip, reached from apply). The TLS paths are not
// config.yaml keys at all (tlsPaths).
var restartOnlyKeys = []struct {
	key   string
	value func(fileConfig) any
}{
	{"hosted", func(f fileConfig) any { return f.Hosted }},
}

func restartOnlyKeyNames() []string {
	out := make([]string, 0, len(restartOnlyKeys))
	for _, k := range restartOnlyKeys {
		out = append(out, k.key)
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
