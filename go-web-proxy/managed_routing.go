package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"
)

// newManagedRouting builds Provisioned mode's sign-in, sessions and /managed/*
// API when connModes offers it (provisioned or both). In Gateway mode it
// returns nil (and nil error), and the caller then serves /managed/* as a
// plain 404.
//
// lv is the live settings every piece reads per request; src is config.yaml,
// which the settings endpoint rewrites; upstream is the broker transport the
// Direct relay uses too (newUpstreamTransport), for the SEMP relay and the
// SMF gate.
func newManagedRouting(cfg config, lv *live, src configSource, upstream http.RoundTripper, logger *slog.Logger) (*managedRoutes, error) {
	if !cfg.provisioned() {
		return nil, nil
	}
	h, err := newHasher(passwordIter, runtime.NumCPU())
	if err != nil {
		return nil, fmt.Errorf("password hasher: %w", err)
	}
	return buildManagedRoutes(cfg, lv, src, h, os.Getenv, time.Now, upstream, logger)
}

// buildManagedRoutes wires the pieces; split from newManagedRouting so tests
// can supply a cheap hasher, an environment and a clock.
func buildManagedRoutes(cfg config, lv *live, src configSource, h *hasher, getenv func(string) string, now func() time.Time, upstream http.RoundTripper, logger *slog.Logger) (*managedRoutes, error) {
	schedulePath := filepath.Join(filepath.Dir(cfg.usersFile), scheduleFileName)
	st, err := loadStore(storeOptions{
		usersPath: cfg.usersFile, connsPath: cfg.connectionsFile, keyPath: cfg.storeKeyFile,
		schedulePath: schedulePath, hasher: h, getenv: getenv,
	}, logger)
	if err != nil {
		return nil, err
	}
	sf := newSettingsFile(src, cfg, lv, logger)
	backups, err := newBackupService(cfg.backupDir, schedulePath, st, sf, h, now, logger)
	if err != nil {
		return nil, err
	}
	ss := newSessions(lv.sessionLimits, now)
	th := newThrottle(lv.loginLimits, now, logger)
	// Revocation: open SMF sockets close when their session is ended, their
	// user changes, or a store edit takes their VPN away (sockets.go).
	sockets := newSocketRegistry(func(user, broker, vpn string) bool {
		_, ok := st.smfTarget(user, broker, vpn)
		return ok
	}, logger)
	ss.onDrop, ss.onDropUser = sockets.closeSession, sockets.closeUser
	st.onChange = sockets.recheck
	connects := newRateWindow(connectsPerWindow, connectWindow, now)
	pages, err := newAuthPages(st, ss, th, lv, logger)
	if err != nil {
		return nil, fmt.Errorf("sign-in page template: %w", err)
	}
	// gateApp passes everything through unless connModes is provisioned, which
	// it reads per request: the settings page can change it.
	routes := &managedRoutes{
		api: newManagedHandler(st, ss, th, lv, sf, backups, managedEndpoints{
			relay: newSEMPRelay(st, upstream, logger),
			smf:   newSMFGate(st, ss, sockets, connects, upstream, logger),
			dial:  newDialer(st, connects, logger),
		}, logger),
		pages:     pages,
		gateApp:   pages.gateApp,
		gateAdmin: pages.gateAdmin,
		gateRelay: gateDirect(lv),
		backups:   backups,
	}
	logger.Info("provisioned mode enabled", "users", cfg.usersFile, "connections", cfg.connectionsFile,
		"session_idle", cfg.session.idle, "session_absolute", cfg.session.absolute, "app_gated", cfg.connModes == connProvisioned)
	return routes, nil
}

// gateDirect closes the Direct relay while connModes is provisioned, read per
// request like gateApp: a Provisioned-only deployment offers no Direct tab, and
// its sessions reach brokers through the SEMP relay and the SMF gate only.
// Under both or direct the relay is unchanged.
func gateDirect(lv *live) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if lv.get().connModes == connProvisioned {
				http.NotFound(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
