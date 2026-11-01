//go:build !managed

package main

import "log/slog"

// newManagedRouting is the stub linked into the stdlib-only hosted binary (built
// without `-tags managed`). The sign-in pages, the store and the /managed/* API
// are not compiled in, so /managed/* is always a 404. If an operator
// sets managed: true on this binary, warn loudly that managed support is absent
// rather than failing silently.
func newManagedRouting(cfg config, _ *live, _ configSource, logger *slog.Logger) (*managedRoutes, error) {
	if cfg.managed {
		logger.Warn("managed is true but this binary was built without managed support (-tags managed); /managed/* answers 404")
	}
	return nil, nil
}
