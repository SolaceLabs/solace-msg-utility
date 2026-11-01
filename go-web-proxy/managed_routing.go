//go:build managed

package main

import (
	"fmt"
	"log/slog"
	"os"
	"runtime"
	"time"
)

// newManagedRouting builds the managed sign-in, sessions and /managed/* API
// when managed is true. It is compiled only into the `-tags managed` binary;
// the stdlib-only hosted binary links the stub in managed_routing_stub.go
// instead. It returns nil (and nil error) when managed mode is disabled, and
// the caller then serves /managed/* as a plain 404.
func newManagedRouting(cfg config, logger *slog.Logger) (*managedRoutes, error) {
	if !cfg.managed {
		return nil, nil
	}
	h, err := newHasher(passwordIter, runtime.NumCPU())
	if err != nil {
		return nil, fmt.Errorf("password hasher: %w", err)
	}
	return buildManagedRoutes(cfg, h, os.Getenv, time.Now, logger)
}

// buildManagedRoutes wires the pieces; split from newManagedRouting so tests
// can supply a cheap hasher, an environment and a clock.
func buildManagedRoutes(cfg config, h *hasher, getenv func(string) string, now func() time.Time, logger *slog.Logger) (*managedRoutes, error) {
	st, err := loadStore(storeOptions{
		usersPath: cfg.usersFile, connsPath: cfg.connectionsFile, seedPath: cfg.siteSeedFile,
		hasher: h, getenv: getenv,
	}, logger)
	if err != nil {
		return nil, err
	}
	ss := newSessions(cfg.session, now)
	th := newThrottle(cfg.login, now, logger)
	pages, err := newAuthPages(st, ss, th, logger)
	if err != nil {
		return nil, fmt.Errorf("sign-in page template: %w", err)
	}
	routes := &managedRoutes{
		api:       newManagedHandler(st, ss, th, logger),
		pages:     pages,
		gateApp:   noGate,
		gateAdmin: pages.gateAdmin,
	}
	if cfg.connModes == connManaged {
		routes.gateApp = pages.gateApp
	}
	logger.Info("managed mode enabled", "users", cfg.usersFile, "connections", cfg.connectionsFile,
		"session_idle", cfg.session.idle, "session_absolute", cfg.session.absolute, "app_gated", cfg.connModes == connManaged)
	return routes, nil
}
