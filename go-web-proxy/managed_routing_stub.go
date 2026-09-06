//go:build !managed

package main

import (
	"log/slog"
	"net/http"
)

// newManagedRouting is the stub linked into the stdlib-only hosted binary (built
// without `-tags managed`). The RBAC store + handler and the yaml dependency are
// not compiled in, so /managed/* always falls through to the SPA. If an operator
// sets MANAGED=true on this binary, warn loudly that managed support is absent
// rather than failing silently.
func newManagedRouting(cfg config, logger *slog.Logger) (http.Handler, error) {
	if cfg.managed {
		logger.Warn("MANAGED=true but this binary was built without managed support (-tags managed); /managed/* falls through to the SPA")
	}
	return nil, nil
}
