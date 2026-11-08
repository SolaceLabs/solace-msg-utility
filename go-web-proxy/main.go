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

// Connection modes the app may offer, advertised to the SPA via /hosted. Any
// value but direct turns Provisioned mode on: sign-in, the stores and the admin
// console.
const (
	connDirect      = "direct"
	connProvisioned = "provisioned"
	connBoth        = "both"
)

// Route and bundle for the administration console. Served only in Provisioned
// mode -- see adminHandler.
const (
	adminPath      = "/solAdmin"
	adminIndexFile = "solAdmin.html"
)

// The app bundle served at /: the Direct-only Release bundle, or in
// Provisioned mode the one that carries the sign-in. The image ships both.
const (
	directIndexFile      = "index.html"
	provisionedIndexFile = "provisioned.html"
)

// config is the validated config.yaml. The keys live.go lists as live are
// copied into a *live at startup and swapped by the settings page; read them
// there, per request, so a save reaches them. The rest apply at restart.
type config struct {
	hosted             bool
	appDir             string
	certFile           string
	keyFile            string
	trustDir           string
	insecureSkipVerify bool
	logLevel           slog.Level
	// Provisioned mode's stores. Read only when connModes offers provisioned.
	usersFile       string
	connectionsFile string
	storeKeyFile    string // encrypts usersFile and connectionsFile (keyfile.go)
	// Connection-mode config surfaced to the SPA through /hosted. connModes is
	// one of direct|provisioned|both; defaultConn (direct|provisioned) picks
	// the tab shown first when both are offered. The default, direct, is
	// Gateway mode: users type their broker's details and the gateway relays.
	connModes   string
	defaultConn string
	// Client access list. Lives in config.yaml only (no env var); an empty
	// allow list admits every client. See access.go.
	access accessConfig
	// Provisioned sign-in limits and module control, config.yaml only (no env
	// var). Unused in Gateway mode.
	session sessionLimits
	login   loginLimits
	modules moduleSettings
}

// managedRoutes is what Provisioned mode adds to the router; nil in Gateway
// mode.
type managedRoutes struct {
	api       http.Handler                    // /managed/*
	pages     http.Handler                    // /login, /login/password
	gateApp   func(http.Handler) http.Handler // the PWA; a session under connModes=provisioned
	gateAdmin func(http.Handler) http.Handler // /solAdmin; an admin session, every mode
	gateRelay func(http.Handler) http.Handler // the Direct relay; 404 under connModes=provisioned
}

// robotsTxt asks every crawler to stay out; X-Robots-Tag on each response says
// the same to the ones that skip robots.txt.
const robotsTxt = "User-agent: *\nDisallow: /\n"

// newRootHandler routes a request to the gateway's handlers. /managed/* never
// falls through to the SPA: in Gateway mode it is a plain 404.
func newRootHandler(hosted, admin, app, relay http.Handler, mr *managedRoutes) http.Handler {
	if mr != nil {
		app, admin, relay = mr.gateApp(app), mr.gateAdmin(admin), mr.gateRelay(relay)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		p := r.URL.Path
		switch {
		case p == "/robots.txt":
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, robotsTxt)
		case p == "/hosted":
			hosted.ServeHTTP(w, r)
		case p == adminPath || p == adminPath+"/":
			admin.ServeHTTP(w, r)
		case strings.HasPrefix(p, "/managed/"):
			if mr == nil {
				http.NotFound(w, r)
				return
			}
			mr.api.ServeHTTP(w, r)
		case mr != nil && (p == "/login" || p == "/login/password"):
			mr.pages.ServeHTTP(w, r)
		case isProxyPath(p):
			relay.ServeHTTP(w, r)
		default:
			app.ServeHTTP(w, r)
		}
	})
}

// defaultConfig is the built-in baseline: what an unconfigured deployment runs
// with, and what a config.yaml key falls back to when it is missing.
func defaultConfig() config {
	return config{
		hosted:          true,
		appDir:          "/SolaceMsgUtility",
		certFile:        "/tls/tls.crt",
		keyFile:         "/tls/tls.key",
		trustDir:        "/tls/trust",
		logLevel:        slog.LevelWarn,
		usersFile:       "/data/users.yaml",
		connectionsFile: "/data/connections.yaml",
		storeKeyFile:    defaultStoreKeyFile,
		connModes:       connDirect,
		defaultConn:     connDirect,
		session:         sessionLimits{idle: 10 * time.Minute, absolute: 30 * time.Minute},
		login: loginLimits{
			maxFailures:     5,
			backoff:         30 * time.Second,
			maxBackoff:      15 * time.Minute,
			unauthPerMinute: 60,
		},
		modules: moduleSettings{offered: moduleCatalog(), userDefault: modulesDefaultAll},
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
	hosted, err := parseHosted(os.Getenv("HOSTED"))
	if err != nil {
		return config{}, fmt.Errorf("HOSTED=%q: %w", os.Getenv("HOSTED"), err)
	}
	return config{
		hosted:             hosted,
		appDir:             envOr("APP_DIR", d.appDir),
		certFile:           envOr("SSL_CERT_FILE", d.certFile),
		keyFile:            envOr("SSL_KEY_FILE", d.keyFile),
		trustDir:           envOr("SSL_TRUST_DIR", d.trustDir),
		insecureSkipVerify: os.Getenv("SSL_INSECURE_SKIP_VERIFY") == "true",
		logLevel:           level,
		usersFile:          envOr("USERS_FILE", d.usersFile),
		connectionsFile:    envOr("CONNECTIONS_FILE", d.connectionsFile),
		storeKeyFile:       envOr("STORE_KEY_FILE", d.storeKeyFile),
		connModes:          strings.ToLower(envOr("CONN_MODES", d.connModes)),
		defaultConn:        strings.ToLower(envOr("DEFAULT_CONN", d.defaultConn)),
		session:            d.session,
		login:              d.login,
		modules:            d.modules,
	}, nil
}

// parseHosted reads HOSTED. Gateway mode is the image's purpose, so unset is
// true; "false" makes the gateway serve the files only (browsers then connect
// to brokers themselves). Anything else is refused rather than guessed.
func parseHosted(raw string) (bool, error) {
	switch raw {
	case "", "true":
		return true, nil
	case "false":
		return false, nil
	}
	return false, errors.New(`must be "true" or "false"`)
}

// provisioned reports whether cfg turns Provisioned mode on: sign-in, the
// stores and the admin console.
func (c config) provisioned() bool { return c.connModes != connDirect }

// validateConnModes reports whether the advertised connection modes can be
// served. Fatal at startup and a refusal on the settings page: Provisioned
// sign-in on a gateway the app cannot detect would show a tab that only fails
// at sign-in. Messages name the config.yaml key and the env var that seeds it,
// since either may be the source.
func validateConnModes(cfg config) error {
	switch cfg.connModes {
	case connDirect, connProvisioned, connBoth:
	default:
		return fmt.Errorf("connModes=%q (config.yaml; seeded by CONN_MODES) must be one of %q, %q, %q", cfg.connModes, connDirect, connProvisioned, connBoth)
	}
	switch cfg.defaultConn {
	case connDirect, connProvisioned:
	default:
		return fmt.Errorf("defaultConn=%q (config.yaml; seeded by DEFAULT_CONN) must be one of %q, %q", cfg.defaultConn, connDirect, connProvisioned)
	}
	if cfg.provisioned() && !cfg.hosted {
		return fmt.Errorf("connModes=%q offers Provisioned sign-in but hosted is false (config.yaml; seeded by HOSTED), so the app cannot detect the gateway", cfg.connModes)
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

	// The live keys (live.go), the log level among them, are read per request
	// from lv, so a save on the settings page reaches them without a restart.
	lv := newLive(cfg)
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: &lv.level}))
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

	hh := newHostedHandler(cfg.hosted, lv)
	upstream := newUpstreamTransport(trustPool, cfg.insecureSkipVerify)
	rp := newReverseProxy(upstream, logger)

	// Provisioned sign-in and the /managed/* API; nil in Gateway mode, where
	// /managed/* is a 404. A load failure is fatal: a misconfiguration must not
	// fall back to an unauthenticated app. The connection modes were validated
	// with the rest of config.yaml (resolveConfig).
	mr, err := newManagedRouting(cfg, lv, configSource{path: configFile, sum: load.sum}, upstream, logger)
	if err != nil {
		logger.Error("provisioned store load failed", "err", err)
		os.Exit(1)
	}
	logger.Info("connection modes", "conn_modes", cfg.connModes, "default_conn", cfg.defaultConn)

	pwa := newPWAHandler(cfg.appDir, appIndexFile(mr != nil), logger)

	// The admin console edits the stores, so it only exists in Provisioned
	// mode, where they are served.
	admin := newAdminHandler(cfg.appDir, cfg.hosted && mr != nil, logger)
	if admin.enabled {
		logger.Info("administration app enabled", "path", adminPath)
	}

	root := newRootHandler(hh, admin, pwa, rp, mr)

	// The client address is resolved once (trusted proxies) for the access
	// list and the sign-in throttle. The access list sits inside the access
	// log, so a denial is logged as a 403 like any other response (the ACL
	// adds its own warn line with the reason).
	handler := accessLog(withClient(lv, clientACL(lv, root, logger)), logger)

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
