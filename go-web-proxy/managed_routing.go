//go:build managed

package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"runtime"
	"time"
)

// newManagedRouting builds the managed sign-in, sessions and /managed/* API
// when managed is true. It is compiled only into the `-tags managed` binary;
// the stdlib-only hosted binary links the stub in managed_routing_stub.go
// instead. It returns nil (and nil error) when managed mode is disabled, and
// the caller then serves /managed/* as a plain 404.
//
// lv is the live settings every piece reads per request; src is config.yaml,
// which the settings endpoint rewrites; upstream is the broker transport the
// Direct relay uses too (newUpstreamTransport).
func newManagedRouting(cfg config, lv *live, src configSource, upstream http.RoundTripper, logger *slog.Logger) (*managedRoutes, error) {
	if !cfg.managed {
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
	st, err := loadStore(storeOptions{
		usersPath: cfg.usersFile, connsPath: cfg.connectionsFile, seedPath: cfg.siteSeedFile, keyPath: cfg.storeKeyFile,
		hasher: h, getenv: getenv,
	}, logger)
	if err != nil {
		return nil, err
	}
	ss := newSessions(lv.sessionLimits, now)
	th := newThrottle(lv.loginLimits, now, logger)
	pages, err := newAuthPages(st, ss, th, lv, logger)
	if err != nil {
		return nil, fmt.Errorf("sign-in page template: %w", err)
	}
	// gateApp passes everything through unless connModes is managed, which
	// it reads per request: the settings page can change it.
	routes := &managedRoutes{
		api:       newManagedHandler(st, ss, th, lv, newSettingsFile(src, cfg, lv, logger), newSEMPRelay(st, upstream, logger), logger),
		pages:     pages,
		gateApp:   pages.gateApp,
		gateAdmin: pages.gateAdmin,
	}
	logger.Info("managed mode enabled", "users", cfg.usersFile, "connections", cfg.connectionsFile,
		"session_idle", cfg.session.idle, "session_absolute", cfg.session.absolute, "app_gated", cfg.connModes == connManaged)
	return routes, nil
}
