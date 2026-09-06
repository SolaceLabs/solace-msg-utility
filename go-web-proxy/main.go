package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// Stamped at build time by scripts/dev.sh via
// -ldflags "-X main.version=$VERSION", and by docker/Dockerfile from the
// APP_VERSION build-arg. The git tag is the single source of version truth, so
// this default should only ever be seen in an ad-hoc `go build`.
var version = "dev"

// Connection modes the app may offer, advertised to the SPA via /hosted.
const (
	connDirect  = "direct"
	connManaged = "managed"
	connBoth    = "both"
)

// Route and bundle for the standalone administration app. Served only when the
// gateway is hosted AND managed — see adminHandler.
const (
	adminPath      = "/solAdmin"
	adminIndexFile = "solAdmin.html"
)

type config struct {
	hosted             bool
	appDir             string
	certFile           string
	keyFile            string
	trustDir           string
	insecureSkipVerify bool
	logLevel           slog.Level
	// Managed (RBAC) mode. When false, /managed/* is not served (falls through
	// to the SPA) and none of the files below are read.
	managed         bool
	usersFile       string
	connectionsFile string
	siteSeedFile    string
	// Connection-mode config surfaced to the SPA through /hosted. connModes is
	// one of direct|managed|both; defaultConn (direct|managed) picks the tab
	// shown first when both are offered. Defaults keep a plain deployment
	// Direct-only.
	connModes   string
	defaultConn string
}

func loadConfig() config {
	return config{
		hosted:             os.Getenv("HOSTED") == "true",
		appDir:             envOr("APP_DIR", "/SolaceMsgUtility"),
		certFile:           envOr("SSL_CERT_FILE", "/tls/tls.crt"),
		keyFile:            envOr("SSL_KEY_FILE", "/tls/tls.key"),
		trustDir:           envOr("SSL_TRUST_DIR", "/tls/trust"),
		insecureSkipVerify: os.Getenv("SSL_INSECURE_SKIP_VERIFY") == "true",
		logLevel:           parseLogLevel(envOr("LOG_LEVEL", "warn")),
		managed:            os.Getenv("MANAGED") == "true",
		usersFile:          envOr("USERS_FILE", "/managed/users.yaml"),
		connectionsFile:    envOr("CONNECTIONS_FILE", "/managed/connections.yaml"),
		siteSeedFile:       envOr("SITE_SEED_FILE", "/managed/site.seed"),
		connModes:          strings.ToLower(envOr("CONN_MODES", connDirect)),
		defaultConn:        strings.ToLower(envOr("DEFAULT_CONN", connDirect)),
	}
}

// validateConnModes reports whether the advertised connection modes can actually
// be served. Called at startup and fatal on failure: a deployment that promises
// Managed sign-in but cannot serve /managed/* would show users a tab that only
// fails at login, so it must refuse to start instead.
//
// `managedRouting` is whether the managed handler was actually built + loaded
// (false on the stdlib-only binary compiled without the `managed` build tag).
func validateConnModes(cfg config, managedRouting bool) error {
	switch cfg.connModes {
	case connDirect, connManaged, connBoth:
	default:
		return fmt.Errorf("CONN_MODES=%q must be one of %q, %q, %q", cfg.connModes, connDirect, connManaged, connBoth)
	}
	switch cfg.defaultConn {
	case connDirect, connManaged:
	default:
		return fmt.Errorf("DEFAULT_CONN=%q must be one of %q, %q", cfg.defaultConn, connDirect, connManaged)
	}
	if cfg.connModes == connDirect {
		return nil // managed never offered — nothing else to check
	}
	// Managed is advertised: every prerequisite must be in place.
	if !cfg.hosted {
		return fmt.Errorf("CONN_MODES=%q offers managed sign-in but HOSTED is not \"true\", so the app cannot detect the gateway", cfg.connModes)
	}
	if !cfg.managed {
		return fmt.Errorf("CONN_MODES=%q offers managed sign-in but MANAGED is not \"true\", so /managed/* would not be served", cfg.connModes)
	}
	if !managedRouting {
		return fmt.Errorf("CONN_MODES=%q offers managed sign-in but this gateway was built without the \"managed\" build tag", cfg.connModes)
	}
	return nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func parseLogLevel(s string) slog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "error":
		return slog.LevelError
	default:
		return slog.LevelWarn
	}
}

// printVersionIfRequested handles the version query before any configuration is
// read, so `--version` works on a gateway that would refuse to start. Extracted
// from main so it is testable; main itself is not.
func printVersionIfRequested(args []string, w io.Writer) bool {
	if len(args) == 0 {
		return false
	}
	switch args[0] {
	case "--version", "-version", "version":
		fmt.Fprintln(w, version)
		return true
	}
	return false
}

func main() {
	if printVersionIfRequested(os.Args[1:], os.Stdout) {
		return
	}
	serve()
}

// serve is the gateway proper. Split from main so the version query above does
// not add a branch to an already dense function.
func serve() {
	cfg := loadConfig()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.logLevel}))
	slog.SetDefault(logger)

	logger.Info("gateway starting",
		"version", version,
		"hosted", cfg.hosted,
		"app_dir", cfg.appDir,
		"cert_file", cfg.certFile,
		"trust_dir", cfg.trustDir,
		"insecure_skip_verify", cfg.insecureSkipVerify,
	)

	serverCert, err := loadOrGenerateServerCert(cfg.certFile, cfg.keyFile, logger)
	if err != nil {
		logger.Error("server certificate setup failed", "err", err)
		os.Exit(1)
	}

	trustPool, err := buildTrustPool(cfg.trustDir, logger)
	if err != nil {
		logger.Error("trust pool setup failed", "err", err)
		os.Exit(1)
	}
	if cfg.insecureSkipVerify {
		logger.Warn("SSL_INSECURE_SKIP_VERIFY=true — upstream certificates will NOT be validated")
	}

	hh := newHostedHandler(cfg.hosted, cfg.connModes, cfg.defaultConn)
	pwa := newPWAHandler(cfg.appDir, logger)
	rp := newReverseProxy(trustPool, cfg.insecureSkipVerify, logger)

	// Managed (RBAC) routing is compiled in only with `-tags managed`; the
	// stdlib-only hosted binary links a stub that returns a nil handler. A load
	// failure is fatal (misconfiguration shouldn't silently fall back to an
	// unauthenticated app). When disabled or absent, mh is nil and /managed/*
	// falls through to the SPA.
	mh, err := newManagedRouting(cfg, logger)
	if err != nil {
		logger.Error("managed store load failed", "err", err)
		os.Exit(1)
	}

	// Refuse to start when the advertised connection modes can't be served — a
	// Managed tab that always fails at login is worse than a clear startup error.
	if err := validateConnModes(cfg, mh != nil); err != nil {
		logger.Error("invalid connection-mode configuration", "err", err)
		os.Exit(1)
	}
	logger.Info("connection modes", "conn_modes", cfg.connModes, "default_conn", cfg.defaultConn)

	// The admin app edits the managed store, so it only exists where that store
	// is actually served: hosted, managed, and built with the managed tag.
	admin := newAdminHandler(cfg.appDir, cfg.hosted && mh != nil, logger)
	if admin.enabled {
		logger.Info("administration app enabled", "path", adminPath)
	}

	root := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/hosted":
			hh.ServeHTTP(w, r)
		case r.URL.Path == adminPath || r.URL.Path == adminPath+"/":
			admin.ServeHTTP(w, r)
		case mh != nil && strings.HasPrefix(r.URL.Path, "/managed/"):
			mh.ServeHTTP(w, r)
		case isProxyPath(r.URL.Path):
			rp.ServeHTTP(w, r)
		default:
			pwa.ServeHTTP(w, r)
		}
	})

	handler := accessLog(root, logger)

	srv := &http.Server{
		Addr:              ":9443",
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		TLSConfig: &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{serverCert},
		},
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", srv.Addr)
		if err := srv.ListenAndServeTLS("", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err, ok := <-errCh:
		if ok && err != nil {
			logger.Error("listener failed", "err", err)
			os.Exit(1)
		}
	case sig := <-sigCh:
		logger.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			logger.Error("graceful shutdown failed", "err", err)
			os.Exit(1)
		}
		logger.Info("shutdown complete")
	}
}
