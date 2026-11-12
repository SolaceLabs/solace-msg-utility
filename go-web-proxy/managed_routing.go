package main

import (
	"fmt"
	"io"
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
// SMF gate; auditOut gets the copy of each audit line while audit.stdout is on.
//
// Provisioned mode always has an audit trail: the log at cfg.auditFile is
// opened here, and a failure stops the start. buildManagedRoutes leaves the
// auditor nil (no trail), so tests that do not look at it need no /data.
func newManagedRouting(cfg config, lv *live, src configSource, upstream http.RoundTripper, auditOut io.Writer, logger *slog.Logger) (*managedRoutes, error) {
	if !cfg.provisioned() {
		return nil, nil
	}
	// GOMAXPROCS honours the container's CPU quota (NumCPU does not); half of
	// it leaves the rest for the relay, the sockets and the files.
	h, err := newHasher(passwordIter, max(runtime.GOMAXPROCS(0)/2, 1))
	if err != nil {
		return nil, fmt.Errorf("password hasher: %w", err)
	}
	routes, err := buildManagedRoutes(cfg, lv, src, h, os.Getenv, time.Now, upstream, logger)
	if err != nil {
		return nil, err
	}
	au, err := openAuditor(cfg.auditFile, lv, auditOut, logger.With("component", "audit"))
	if err != nil {
		return nil, err
	}
	routes.setAuditor(au)
	return routes, nil
}

// setAuditor hands the audit trail to every piece that records to it. Each
// piece keeps its own *auditor field, nil until here.
func (mr *managedRoutes) setAuditor(a *auditor) {
	mr.audit = a
	h := mr.api.(*managedHandler)
	h.audit = a
	h.throttle.audit = a // the sign-in pages share it
	h.relay.(*sempRelay).audit = a
	h.smf.(*smfGate).audit = a
	h.dial.(*dialer).audit = a
	mr.pages.(*authPages).audit = a
}

// buildManagedRoutes wires the pieces; split from newManagedRouting so tests
// can supply a cheap hasher, an environment and a clock.
func buildManagedRoutes(cfg config, lv *live, src configSource, h *hasher, getenv func(string) string, now func() time.Time, upstream http.RoundTripper, logger *slog.Logger) (*managedRoutes, error) {
	schedulePath := filepath.Join(filepath.Dir(cfg.usersFile), scheduleFileName)
	st, err := loadStore(storeOptions{
		usersPath: cfg.usersFile, connsPath: cfg.connectionsFile, keyPath: cfg.storeKeyFile,
		schedulePath: schedulePath, hasher: h, getenv: getenv,
	}, logger.With("component", "store"))
	if err != nil {
		return nil, err
	}
	sf := newSettingsFile(src, cfg, lv, logger.With("component", "settings"))
	backups, err := newBackupService(cfg.backupDir, schedulePath, st, sf, h, now, logger.With("component", "backup"))
	if err != nil {
		return nil, err
	}
	ss := newSessions(lv.sessionLimits, now)
	th := newThrottle(lv.loginLimits, now, logger.With("component", "throttle"))
	// Revocation: open SMF sockets close when their session is ended, their
	// user changes, or a store edit takes their VPN away (sockets.go).
	sockets := newSocketRegistry(func(user, broker, vpn string) bool {
		_, ok := st.smfTarget(user, broker, vpn)
		return ok
	}, logger.With("component", "smf"))
	ss.onDrop, ss.onDropUser = sockets.closeSession, sockets.closeUser
	st.onChange = sockets.recheck
	connects := newRateWindow(connectsPerWindow, connectWindow, now)
	pages, err := newAuthPages(st, ss, th, lv, logger.With("component", "signin"))
	if err != nil {
		return nil, fmt.Errorf("sign-in page template: %w", err)
	}
	// gateApp passes everything through unless connModes is provisioned, which
	// it reads per request: the settings page can change it.
	routes := &managedRoutes{
		api: newManagedHandler(st, ss, th, lv, sf, backups, managedEndpoints{
			relay: newSEMPRelay(st, upstream, logger.With("component", "relay")),
			smf:   newSMFGate(st, ss, sockets, connects, upstream, logger.With("component", "smf")),
			dial:  newDialer(st, connects, logger.With("component", "dial")),
		}, logger.With("component", "managed")),
		pages:     pages,
		gateApp:   pages.gateApp,
		gateAdmin: pages.gateAdmin,
		gateRelay: gateDirect(lv),
		backups:   backups,
	}
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
