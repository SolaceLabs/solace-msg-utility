package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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

// appRoot is where the image keeps the app's files (docker/Dockerfile). It is
// fixed: to serve another build, mount it here.
const appRoot = "/SolaceMsgUtility"

// config is the validated config.yaml. The keys live.go lists as live are
// copied into a *live at startup and swapped by the settings page; read them
// there, per request, so a save reaches them. The rest apply at restart.
type config struct {
	hosted             bool
	certFile           string
	keyFile            string
	trustDir           string
	insecureSkipVerify bool
	logLevel           slog.Level
	// Provisioned mode's stores, at fixed paths (the defaults below; serve
	// moves them under process.dataDir for tests). Read only when connModes
	// offers provisioned.
	usersFile       string
	connectionsFile string
	storeKeyFile    string // encrypts usersFile and connectionsFile (keyfile.go)
	// backupDir is where scheduled backups go: always backupRoot, a field
	// only so tests can point it elsewhere (backup.go).
	backupDir string
	// auditFile is the audit log (audit.go): always defaultAuditFile, a field
	// only so tests can move it (inDataDir). Opened in Provisioned mode only.
	auditFile string
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
	// The audit stream's options (audit.go): audit.stdout is seeded by
	// SMU_SHOW_AUDIT, audit.access has no env var. Live.
	audit auditSettings
}

// managedRoutes is what Provisioned mode adds to the router; nil in Gateway
// mode.
type managedRoutes struct {
	api       http.Handler                    // /managed/*
	pages     http.Handler                    // /login, /login/password
	gateApp   func(http.Handler) http.Handler // the PWA; a session under connModes=provisioned
	gateAdmin func(http.Handler) http.Handler // /solAdmin; an admin session, every mode
	gateRelay func(http.Handler) http.Handler // the Direct relay; 404 under connModes=provisioned
	backups   *backupService                  // the backup schedule, run by serve
	audit     *auditor                        // the audit trail, closed by serve at shutdown
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
		certFile:        "/tls/tls.crt",
		keyFile:         "/tls/tls.key",
		trustDir:        "/tls/trust",
		logLevel:        slog.LevelWarn,
		usersFile:       defaultUsersFile,
		connectionsFile: defaultConnectionsFile,
		storeKeyFile:    defaultStoreKeyFile,
		backupDir:       backupRoot,
		auditFile:       defaultAuditFile,
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
	hosted, err := parseHosted(os.Getenv("SMU_HOSTED"))
	if err != nil {
		return config{}, fmt.Errorf("SMU_HOSTED=%q: %w", os.Getenv("SMU_HOSTED"), err)
	}
	insecure, err := parseInsecureSkipVerify(os.Getenv("SMU_SSL_SKIP_CERT_VERIFY"))
	if err != nil {
		return config{}, fmt.Errorf("SMU_SSL_SKIP_CERT_VERIFY=%q: %w", os.Getenv("SMU_SSL_SKIP_CERT_VERIFY"), err)
	}
	showAudit, err := parseShowAudit(os.Getenv("SMU_SHOW_AUDIT"))
	if err != nil {
		return config{}, fmt.Errorf("SMU_SHOW_AUDIT=%q: %w", os.Getenv("SMU_SHOW_AUDIT"), err)
	}
	return config{
		hosted:             hosted,
		certFile:           envOr("SMU_SSL_CERTFILE", d.certFile),
		keyFile:            envOr("SMU_SSL_CERTKEYFILE", d.keyFile),
		trustDir:           envOr("SMU_SSL_TRUSTDIR", d.trustDir),
		insecureSkipVerify: insecure,
		logLevel:           level,
		usersFile:          d.usersFile,
		connectionsFile:    d.connectionsFile,
		storeKeyFile:       d.storeKeyFile,
		connModes:          strings.ToLower(envOr("SMU_CONN_MODES", d.connModes)),
		defaultConn:        strings.ToLower(envOr("SMU_DEFAULT_CONN", d.defaultConn)),
		session:            d.session,
		login:              d.login,
		modules:            d.modules,
		auditFile:          d.auditFile,
		audit:              auditSettings{stdout: showAudit},
	}, nil
}

// parseHosted reads SMU_HOSTED. Gateway mode is the image's purpose, so unset is
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

// parseInsecureSkipVerify reads SMU_SSL_SKIP_CERT_VERIFY as strictly as
// parseHosted: unset or "false" verifies brokers' certificates, "true" turns
// that off, and anything else (TRUE, 1, yes) is refused rather than guessed,
// since the value is written into config.yaml on the first start.
func parseInsecureSkipVerify(raw string) (bool, error) {
	switch raw {
	case "", "false":
		return false, nil
	case "true":
		return true, nil
	}
	return false, errors.New(`must be "true" or "false"`)
}

// parseShowAudit reads SMU_SHOW_AUDIT as strictly as parseInsecureSkipVerify:
// unset or "false" keeps the audit copy off stdout, "true" turns it on, and
// anything else is refused, since the value is written into config.yaml on the
// first start.
func parseShowAudit(raw string) (bool, error) {
	switch raw {
	case "", "false":
		return false, nil
	case "true":
		return true, nil
	}
	return false, errors.New(`must be "true" or "false"`)
}

// inDataDir moves the stores, the store key and the audit log under dir,
// keeping their file names. It is the one seam tests use to keep the fixed paths out of /data;
// "" (main) leaves them as they are.
func (c config) inDataDir(dir string) config {
	if dir == "" {
		return c
	}
	c.usersFile = filepath.Join(dir, filepath.Base(defaultUsersFile))
	c.connectionsFile = filepath.Join(dir, filepath.Base(defaultConnectionsFile))
	c.storeKeyFile = filepath.Join(dir, filepath.Base(defaultStoreKeyFile))
	c.auditFile = filepath.Join(dir, filepath.Base(defaultAuditFile))
	return c
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
		return fmt.Errorf("connModes=%q (config.yaml; seeded by SMU_CONN_MODES) must be one of %q, %q, %q", cfg.connModes, connDirect, connProvisioned, connBoth)
	}
	switch cfg.defaultConn {
	case connDirect, connProvisioned:
	default:
		return fmt.Errorf("defaultConn=%q (config.yaml; seeded by SMU_DEFAULT_CONN) must be one of %q, %q", cfg.defaultConn, connDirect, connProvisioned)
	}
	if cfg.provisioned() && !cfg.hosted {
		return fmt.Errorf("connModes=%q offers Provisioned sign-in but hosted is false (config.yaml; seeded by SMU_HOSTED), so the app cannot detect the gateway", cfg.connModes)
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

// listenAddr is the gateway's one port: unprivileged, so the non-root image
// binds it without a capability.
const listenAddr = ":9443"

// shutdownTimeout is how long a graceful shutdown waits for open connections
// before it gives up and fails.
const shutdownTimeout = 10 * time.Second

func main() {
	if printVersionIfRequested(os.Args[1:], os.Stdout) {
		return
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	err := serve(process{
		configFile: configFilePath,
		appDir:     appRoot,
		log:        os.Stderr,
		stdout:     os.Stdout,
		listen:     func() (net.Listener, error) { return net.Listen("tcp", listenAddr) },
		signals:    signals,
		shutdown:   shutdownTimeout,
	})
	if err != nil {
		os.Exit(1)
	}
}

// process is what serve takes from main: the operating system's pieces and
// the shutdown deadline. main passes the real ones; tests pass a config.yaml in
// a temp dir, a buffer, a loopback listener, their own signal channel and, to
// overrun it, a short deadline, so a whole start and shutdown runs in a test.
type process struct {
	configFile string                       // config.yaml: configFilePath
	appDir     string                       // the app's files: appRoot
	dataDir    string                       // holds the stores and the store key; "" keeps the fixed /data paths
	log        io.Writer                    // every log line
	stdout     io.Writer                    // the audit copy while audit.stdout is on: os.Stdout; nil discards
	listen     func() (net.Listener, error) // listenAddr
	signals    <-chan os.Signal             // SIGINT or SIGTERM: a graceful shutdown
	shutdown   time.Duration                // shutdownTimeout
}

// serve is the gateway proper: it returns when a signal has shut it down (nil)
// or when it cannot start or keep serving (the error, already logged; main
// exits 1).
func serve(p process) error {
	// config.yaml first: the log level lives in it, so the real logger cannot
	// exist yet. A bootstrap logger at the default level carries the one error
	// that can happen before it.
	configFile := p.configFile
	load, err := resolveConfig(configFile)
	if err != nil {
		slog.New(slog.NewTextHandler(p.log, nil)).Error("configuration failed", "err", err)
		return err
	}
	cfg := load.cfg.inDataDir(p.dataDir)

	// The live keys (live.go), the log level among them, are read per request
	// from lv, so a save on the settings page reaches them without a restart.
	lv := newLive(cfg)
	logger := slog.New(slog.NewTextHandler(p.log, &slog.HandlerOptions{Level: &lv.level}))

	if load.seeded {
		logger.Info("config file seeded from the environment; it is authoritative from now on", "path", configFile)
	}
	for _, o := range load.overrides {
		logger.Warn("env var ignored, config.yaml wins", "env", o.Env, "key", o.Key, "env_value", o.EnvValue, "file_value", o.FileValue)
	}
	for _, s := range load.removed {
		logger.Warn("setting no longer used, ignored: remove it", "setting", s.name, "instead", s.instead)
	}

	// The summary shows at every level: an operator diagnosing a denied
	// client or the wrong mode needs it without raising the level first.
	logStartup(p.log, cfg, configFile, p.appDir)

	serverCert, err := loadOrGenerateServerCert(cfg.certFile, cfg.keyFile, logger.With("component", "tls"))
	if err != nil {
		logger.Error("server certificate setup failed", "err", err)
		return err
	}

	trustPool, err := buildTrustPool(cfg.trustDir, logger.With("component", "tls"))
	if err != nil {
		logger.Error("trust pool setup failed", "err", err)
		return err
	}
	if cfg.insecureSkipVerify {
		logger.Warn("tls.insecureSkipVerify is true (config.yaml; seeded by SMU_SSL_SKIP_CERT_VERIFY): upstream certificates will NOT be validated",
			"component", "tls")
	}

	upstream := newUpstreamTransport(trustPool, cfg.insecureSkipVerify)
	// Files only (hosted: false): browsers reach brokers themselves, so the
	// relay paths are refused, not left open.
	var relay http.Handler = newReverseProxy(upstream, logger.With("component", "direct-relay"))
	if !cfg.hosted {
		relay = http.HandlerFunc(refuseRelay)
	}

	// Provisioned sign-in and the /managed/* API; nil in Gateway mode, where
	// /managed/* is a 404. A load failure is fatal: a misconfiguration must not
	// fall back to an unauthenticated app. The connection modes were validated
	// with the rest of config.yaml (resolveConfig).
	auditOut := p.stdout
	if auditOut == nil {
		auditOut = io.Discard
	}
	mr, err := newManagedRouting(cfg, lv, configSource{path: configFile, sum: load.sum}, upstream, auditOut, logger)
	if err != nil {
		logger.Error("provisioned store load failed", "err", err)
		return err
	}
	if mr != nil {
		defer func() { _ = mr.audit.close() }()
	}

	// The mode's bundle must be there, or every page would be a 404: a
	// packaging or mount fault stops the start, naming the file.
	pwa, err := newPWAHandler(p.appDir, appIndexFile(mr != nil), logger.With("component", "app"))
	if err != nil {
		logger.Error("app bundle check failed", "err", err)
		return err
	}
	// /hosted, the health probe, answers 503 once the bundle is unusable.
	hh := newHostedHandler(cfg.hosted, lv, pwa.ready)

	// The admin console edits the stores, so it only exists in Provisioned
	// mode, where they are served.
	admin := newAdminHandler(p.appDir, cfg.hosted && mr != nil, logger.With("component", "app"))
	if admin.enabled {
		logger.Info("administration app enabled", "path", adminPath)
	}

	root := newRootHandler(hh, admin, pwa, relay, mr)

	// The client address is resolved once (trusted proxies) for the access
	// log, the access list and the sign-in throttle, so every line names the
	// same client. The access list sits inside the access log, so a denial is
	// logged as a 403 like any other response (the ACL adds its own warn line
	// with the reason), and so does a recovered handler panic (a 500).
	accessLogger := logger.With("component", "access")
	handler := withClient(lv, accessLog(recoverPanics(clientACL(lv, root, accessLogger), logger.With("component", "http")), accessLogger))

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		TLSConfig: &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{serverCert},
		},
		// net/http's own errors go to the same log, at info: they are mostly
		// TLS handshakes a client gave up on. A handler panic never gets here
		// (recoverPanics logs it at error).
		ErrorLog: slog.NewLogLogger(logger.With("component", "http").Handler(), slog.LevelInfo),
	}

	// The backup schedule runs in the gateway: the image has no cron. It
	// stops at shutdown, after any backup it is writing.
	backupCtx, stopBackups := context.WithCancel(context.Background())
	defer stopBackups()
	backupsDone := make(chan struct{})
	if mr != nil {
		go mr.backups.loop(backupCtx, time.After, backupsDone)
	} else {
		close(backupsDone)
	}

	ln, err := p.listen()
	if err != nil {
		logger.Error("listener failed", "err", err)
		return err
	}
	served := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", ln.Addr().String())
		served <- srv.ServeTLS(ln, "", "")
	}()

	select {
	case err := <-served:
		// Before a shutdown, ServeTLS returns only when it fails.
		logger.Error("listener failed", "err", err)
		return err
	case sig := <-p.signals:
		logger.Info("shutdown signal received", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), p.shutdown)
		defer cancel()
		err := srv.Shutdown(ctx)
		stopBackups()
		<-backupsDone
		if err != nil {
			logger.Error("graceful shutdown failed", "err", err)
			return err
		}
		logger.Info("shutdown complete")
		return nil
	}
}
