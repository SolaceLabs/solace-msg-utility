//go:build managed

package main

import (
	"log/slog"
	"net/http"
)

// newManagedRouting builds the /managed/* RBAC handler when MANAGED=true. It is
// compiled only into the `-tags managed` binary; the stdlib-only hosted binary
// links the stub in managed_routing_stub.go instead. It returns a nil handler
// (and nil error) when managed mode is disabled, so the caller's `mh != nil`
// check leaves /managed/* falling through to the SPA. Returning a literal nil
// (never a typed-nil *managedHandler) keeps that interface check correct.
func newManagedRouting(cfg config, logger *slog.Logger) (http.Handler, error) {
	if !cfg.managed {
		return nil, nil
	}
	st, err := loadStore(cfg.usersFile, cfg.connectionsFile, cfg.siteSeedFile, logger)
	if err != nil {
		return nil, err
	}
	logger.Info("managed mode enabled", "users", cfg.usersFile, "connections", cfg.connectionsFile)
	return newManagedHandler(st, logger), nil
}
