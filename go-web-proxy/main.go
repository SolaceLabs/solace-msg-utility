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
	// Client access list. Lives in config.yaml only (no env var); an empty
	// allow list admits every client. See access.go.
	access accessConfig
}

// defaultConfig is the built-in baseline: what an unconfigured deployment runs
// with, and what a config.yaml key falls back to when it is missing.
func defaultConfig() config {
	return config{
		appDir:          "/SolaceMsgUtility",
		certFile:        "/tls/tls.crt",
		keyFile:         "/tls/tls.key",
		trustDir:        "/tls/trust",
		logLevel:        slog.LevelWarn,
		usersFile:       "/managed/users.yaml",
		connectionsFile: "/managed/connections.yaml",
		siteSeedFile:    defaultSiteSeedFile,
		connModes:       connDirect,
		defaultConn:     connDirect,
	}
}

// loadConfig reads the environment. It seeds config.yaml on first start
// (resolveConfig) and is compared against the file on later starts; it never
// overrides the file.
func loadConfig() (config, error) {
	d := defaultConfig()
	level, err := parseLogLevel(envOr("LOG_LEVEL", levelName(d.logLevel)))
	if err != nil {
		return config{}, fmt.Errorf("LOG_LEVEL=%q: %w", os.Getenv("LOG_LEVEL"), err)
	}
	return config{
		hosted:             os.Getenv("HOSTED") == "true",
		appDir:             envOr("APP_DIR", d.appDir),
		certFile:           envOr("SSL_CERT_FILE", d.certFile),
		keyFile:            envOr("SSL_KEY_FILE", d.keyFile),
		trustDir:           envOr("SSL_TRUST_DIR", d.trustDir),
		insecureSkipVerify: os.Getenv("SSL_INSECURE_SKIP_VERIFY") == "true",
		logLevel:           level,
		managed:            os.Getenv("MANAGED") == "true",
		usersFile:          envOr("USERS_FILE", d.usersFile),
		connectionsFile:    envOr("CONNECTIONS_FILE", d.connectionsFile),
		siteSeedFile:       envOr("SITE_SEED_FILE", d.siteSeedFile),
		connModes:          strings.ToLower(envOr("CONN_MODES", d.connModes)),
		defaultConn:        strings.ToLower(envOr("DEFAULT_CONN", d.defaultConn)),
	}, nil
}

// validateConnModes reports whether the advertised connection modes can actually
// be served. Called at startup and fatal on failure: a deployment that promises
// Managed sign-in but cannot serve /managed/* would show users a tab that only
// fails at login, so it must refuse to start instead. Messages name the
// config.yaml key and the env var that seeds it, since either may be the source.
//
// `managedRouting` is whether the managed handler was actually built + loaded
// (false on the stdlib-only binary compiled without the `managed` build tag).
func validateConnModes(cfg config, managedRouting bool) error {
	switch cfg.connModes {
	case connDirect, connManaged, connBoth:
	default:
		return fmt.Errorf("connModes=%q (config.yaml; seeded by CONN_MODES) must be one of %q, %q, %q", cfg.connModes, connDirect, connManaged, connBoth)
	}
	switch cfg.defaultConn {
	case connDirect, connManaged:
	default:
		return fmt.Errorf("defaultConn=%q (config.yaml; seeded by DEFAULT_CONN) must be one of %q, %q", cfg.defaultConn, connDirect, connManaged)
	}
	if cfg.connModes == connDirect {
		return nil // managed never offered — nothing else to check
	}
	// Managed is advertised: every prerequisite must be in place.
	if !cfg.hosted {
		return fmt.Errorf("connModes=%q offers managed sign-in but hosted is false (config.yaml; seeded by HOSTED), so the app cannot detect the gateway", cfg.connModes)
	}
	if !cfg.managed {
		return fmt.Errorf("connModes=%q offers managed sign-in but managed is false (config.yaml; seeded by MANAGED), so /managed/* would not be served", cfg.connModes)
	}
	if !managedRouting {
		return fmt.Errorf("connModes=%q offers managed sign-in but this gateway was built without the \"managed\" build tag", cfg.connModes)
	}
	return nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// parseLogLevel is strict: the value persists in config.yaml, so a typo must
// fail at startup rather than silently run at warn.
func parseLogLevel(s string) (slog.Level, error) {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	}
	return 0, errors.New("must be one of debug, info, warn, error")
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
	// config.yaml first: the log level lives in it, so the real logger cannot
	// exist yet. A bootstrap logger at the default level carries the one error
	// that can happen before it.
	configFile := configPath()
	load, err := resolveConfig(configFile)
	if err != nil {
		slog.New(slog.NewTextHandler(os.Stderr, nil)).Error("configuration failed", "err", err)
		os.Exit(1)
	}
	cfg := load.cfg

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.logLevel}))
	slog.SetDefault(logger)

	if load.seeded {
		logger.Info("config file seeded from the environment; it is authoritative from now on", "path", configFile)
	}
	for _, o := range load.overrides {
		logger.Warn("env var ignored, config.yaml wins", "env", o.Env, "key", o.Key, "env_value", o.EnvValue, "file_value", o.FileValue)
	}

	logger.Info("gateway starting",
		"version", version,
		"config_file", configFile,
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

	// Access list inside the access log, so a denial is logged as a 403 like
	// any other response (the ACL adds its own warn line with the reason).
	handler := accessLog(clientACL(cfg.access, root, logger), logger)

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
