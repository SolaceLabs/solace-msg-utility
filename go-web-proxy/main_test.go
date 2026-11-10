package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestEnvOr(t *testing.T) {
	t.Setenv("GW_TEST_KEY", "")
	if got := envOr("GW_TEST_KEY", "fallback"); got != "fallback" {
		t.Fatalf("unset env: want fallback, got %q", got)
	}
	t.Setenv("GW_TEST_KEY", "value")
	if got := envOr("GW_TEST_KEY", "fallback"); got != "value" {
		t.Fatalf("set env: want value, got %q", got)
	}
}

func TestParseLogLevel(t *testing.T) {
	cases := map[string]slog.Level{
		"debug": slog.LevelDebug,
		"DEBUG": slog.LevelDebug,
		"info":  slog.LevelInfo,
		"warn":  slog.LevelWarn,
		"Error": slog.LevelError,
	}
	for in, want := range cases {
		got, err := parseLogLevel(in)
		if err != nil || got != want {
			t.Errorf("parseLogLevel(%q): want %v, got %v (err %v)", in, want, got, err)
		}
	}
	// A typo is a startup error, never a silent fallback to warn: the value
	// persists in config.yaml, so it has to be right.
	for _, in := range []string{"garbage", "", "warning"} {
		if _, err := parseLogLevel(in); err == nil {
			t.Errorf("parseLogLevel(%q): want an error", in)
		}
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	// Clear all relevant env so we exercise the default path.
	for _, k := range []string{"HOSTED", "SSL_CERT_FILE", "SSL_KEY_FILE", "SSL_TRUST_DIR", "SSL_INSECURE_SKIP_VERIFY", "LOG_LEVEL"} {
		t.Setenv(k, "")
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.hosted {
		t.Errorf("hosted: want true, Gateway mode is the default")
	}
	if cfg.connModes != connDirect || cfg.provisioned() {
		t.Errorf("connModes: want direct, Provisioned mode off; got %q", cfg.connModes)
	}
	if cfg.usersFile != "/data/users.yaml" || cfg.connectionsFile != "/data/connections.yaml" || cfg.storeKeyFile != "/data/store.key" {
		t.Errorf("stores: want them under /data, got %q %q %q", cfg.usersFile, cfg.connectionsFile, cfg.storeKeyFile)
	}
	if cfg.certFile != "/tls/tls.crt" {
		t.Errorf("certFile: want /tls/tls.crt, got %q", cfg.certFile)
	}
	if cfg.keyFile != "/tls/tls.key" {
		t.Errorf("keyFile: want /tls/tls.key, got %q", cfg.keyFile)
	}
	if cfg.trustDir != "/tls/trust" {
		t.Errorf("trustDir: want /tls/trust, got %q", cfg.trustDir)
	}
	if cfg.insecureSkipVerify {
		t.Errorf("insecureSkipVerify: want false")
	}
	if cfg.logLevel != slog.LevelWarn {
		t.Errorf("logLevel: want warn, got %v", cfg.logLevel)
	}
}

func TestLoadConfig_FromEnv(t *testing.T) {
	t.Setenv("HOSTED", "true")
	t.Setenv("SSL_CERT_FILE", "/x/cert")
	t.Setenv("SSL_KEY_FILE", "/x/key")
	t.Setenv("SSL_TRUST_DIR", "/x/trust")
	t.Setenv("SSL_INSECURE_SKIP_VERIFY", "true")
	t.Setenv("LOG_LEVEL", "debug")

	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.hosted {
		t.Errorf("hosted: want true")
	}
	if !cfg.insecureSkipVerify {
		t.Errorf("insecureSkipVerify: want true")
	}
	if cfg.logLevel != slog.LevelDebug {
		t.Errorf("logLevel: want debug, got %v", cfg.logLevel)
	}
}

func TestLoadConfig_HostedIsTrueUnlessFalse(t *testing.T) {
	// Gateway mode is the image's purpose: unset is true, "false" opts out.
	for v, want := range map[string]bool{"": true, "true": true, "false": false} {
		t.Setenv("HOSTED", v)
		cfg, err := loadConfig()
		if err != nil || cfg.hosted != want {
			t.Errorf("HOSTED=%q: want hosted=%v, got %v (%v)", v, want, cfg.hosted, err)
		}
	}
	// Anything else is refused rather than guessed, naming the value.
	for _, v := range []string{"1", "yes", "TRUE", "False", "y"} {
		t.Setenv("HOSTED", v)
		if _, err := loadConfig(); err == nil || !strings.Contains(err.Error(), `HOSTED="`+v+`"`) || !strings.Contains(err.Error(), `"true" or "false"`) {
			t.Errorf("HOSTED=%q: want an error naming the value, got %v", v, err)
		}
	}
}

func TestLoadConfig_InvalidLogLevelFails(t *testing.T) {
	t.Setenv("LOG_LEVEL", "verbose")
	_, err := loadConfig()
	if err == nil {
		t.Fatal("LOG_LEVEL=verbose: want an error, the value would persist in config.yaml")
	}
	if !strings.Contains(err.Error(), `LOG_LEVEL="verbose"`) {
		t.Errorf("error must name the variable and value, got %q", err)
	}
}

func TestPrintVersionIfRequested(t *testing.T) {
	// The build stamps `version` via -ldflags; tests run without it, so pin a
	// known value rather than asserting on the "dev" default.
	orig := version
	version = "v9.9.9"
	t.Cleanup(func() { version = orig })

	handled := map[string]bool{
		"--version": true,
		"-version":  true,
		"version":   true,
		"--help":    false,
		"serve":     false,
		"":          false,
	}
	for arg, want := range handled {
		var buf bytes.Buffer
		if got := printVersionIfRequested([]string{arg}, &buf); got != want {
			t.Errorf("arg %q: want handled=%v, got %v", arg, want, got)
		}
		if want && buf.String() != "v9.9.9\n" {
			t.Errorf("arg %q: want the version on stdout, got %q", arg, buf.String())
		}
		if !want && buf.Len() != 0 {
			t.Errorf("arg %q: want no output, got %q", arg, buf.String())
		}
	}

	// No arguments at all: the gateway starts normally.
	var buf bytes.Buffer
	if printVersionIfRequested(nil, &buf) {
		t.Error("no args: want handled=false")
	}

	// Only the first argument is inspected — `--version` behind another flag is
	// not a version query.
	if printVersionIfRequested([]string{"serve", "--version"}, &buf) {
		t.Error("trailing --version: want handled=false")
	}
}

// stubHandler answers with its name, so a test can see which handler a route
// reached.
func stubHandler(name string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, name) })
}

func route(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestRootHandler_WithoutManagedRouting(t *testing.T) {
	h := newRootHandler(stubHandler("hosted"), stubHandler("admin"), stubHandler("app"), stubHandler("relay"), nil)
	for path, want := range map[string]string{
		"/hosted":                  "hosted",
		"/solAdmin":                "admin",
		"/solAdmin/":               "admin",
		"/https/943/broker/SEMP/x": "relay",
		"/":                        "app",
		"/login":                   "app", // Gateway mode: an SPA route like any other
	} {
		if got := route(h, path).Body.String(); got != want {
			t.Errorf("%s: want %s, got %q", path, want, got)
		}
	}
	// /managed/* never falls through to the SPA.
	if rec := route(h, "/managed/me"); rec.Code != http.StatusNotFound || rec.Body.String() == "app" {
		t.Errorf("/managed/me in Gateway mode: want 404, got %d %q", rec.Code, rec.Body.String())
	}
}

func TestRootHandler_RobotsOnEveryResponse(t *testing.T) {
	h := newRootHandler(stubHandler("hosted"), stubHandler("admin"), stubHandler("app"), stubHandler("relay"), nil)
	rec := route(h, "/robots.txt")
	if rec.Body.String() != "User-agent: *\nDisallow: /\n" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/plain") {
		t.Errorf("robots.txt: %q %v", rec.Body.String(), rec.Header())
	}
	for _, path := range []string{"/", "/hosted", "/managed/x", "/robots.txt"} {
		if got := route(h, path).Header().Get("X-Robots-Tag"); got != "noindex, nofollow" {
			t.Errorf("%s: X-Robots-Tag %q", path, got)
		}
	}
}

func TestRootHandler_WithManagedRouting(t *testing.T) {
	gate := func(tag string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = io.WriteString(w, tag+">")
				next.ServeHTTP(w, r)
			})
		}
	}
	mr := &managedRoutes{api: stubHandler("api"), pages: stubHandler("pages"), gateApp: gate("appgate"), gateAdmin: gate("admingate"), gateRelay: gate("relaygate")}
	h := newRootHandler(stubHandler("hosted"), stubHandler("admin"), stubHandler("app"), stubHandler("relay"), mr)
	for path, want := range map[string]string{
		"/managed/me":     "api",
		"/login":          "pages",
		"/login/password": "pages",
		"/solAdmin":       "admingate>admin",
		"/":               "appgate>app",
		"/hosted":         "hosted",
		"/http/80/host/x": "relaygate>relay",
	} {
		if got := route(h, path).Body.String(); got != want {
			t.Errorf("%s: want %s, got %q", path, want, got)
		}
	}
}

// ----- serve: a whole start and shutdown ---------------------------------------

// syncBuffer is the log serve writes to from its own goroutines.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// serveRun is one serve call in the background.
type serveRun struct {
	base    string // https://127.0.0.1:<port>
	log     *syncBuffer
	signals chan os.Signal
	done    chan error
}

// startServe runs serve on p with the run's log and signal channel, listening
// on a loopback port unless p.listen is given, with the real shutdown deadline
// unless p.shutdown is. Closing the listener at cleanup ends a serve a failed
// test left running.
func startServe(t *testing.T, p process) *serveRun {
	t.Helper()
	r := &serveRun{log: &syncBuffer{}, signals: make(chan os.Signal, 1), done: make(chan error, 1)}
	if p.listen == nil {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = ln.Close() })
		r.base = "https://" + ln.Addr().String()
		p.listen = func() (net.Listener, error) { return ln, nil }
	}
	if p.shutdown == 0 {
		p.shutdown = shutdownTimeout
	}
	p.log, p.signals = r.log, r.signals
	go func() {
		r.done <- serve(p)
	}()
	return r
}

// result waits for serve to return.
func (r *serveRun) result(t *testing.T) error {
	t.Helper()
	select {
	case err := <-r.done:
		return err
	case <-time.After(30 * time.Second):
		t.Fatalf("serve did not return; log:\n%s", r.log)
		return nil
	}
}

// gatewayDir is a temp dir holding a self-signed tls.crt and tls.key, with the
// seeding and bootstrap variables cleared.
func gatewayDir(t *testing.T) string {
	t.Helper()
	clearSeedEnv(t)
	t.Setenv("ADMIN_PASSWORD", "")
	t.Setenv("ADMIN_PASSWORD_FILE", "")
	dir := t.TempDir()
	if _, err := generateSelfSigned(filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")); err != nil {
		t.Fatal(err)
	}
	return dir
}

// yamlPath is dir/name as a single-quoted YAML scalar (Windows paths included).
func yamlPath(dir, name string) string { return "'" + filepath.Join(dir, name) + "'" }

// writeServeConfig writes dir/config.yaml for gatewayDir's pair, logging at
// debug, plus extra keys, and returns its path.
func writeServeConfig(t *testing.T, dir, extra string) string {
	t.Helper()
	path := filepath.Join(dir, "config.yaml")
	body := "version: 1\ntls:\n  certFile: " + yamlPath(dir, "tls.crt") + "\n  keyFile: " + yamlPath(dir, "tls.key") +
		"\n  trustDir: " + yamlPath(dir, "trust") + "\nlogLevel: debug\n" + extra
	writeFile(t, path, body)
	return path
}

// provisionedKeys turns Provisioned mode on, with the stores in dir.
func provisionedKeys(dir string) string {
	return "connModes: provisioned\nusersFile: " + yamlPath(dir, "users.yaml") + "\nconnectionsFile: " + yamlPath(dir, "connections.yaml") + "\n"
}

// gatewayClient trusts only the certificate in dir, the one the gateway serves.
func gatewayClient(t *testing.T, dir string) *http.Client {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "tls.crt"))
	if err != nil {
		t.Fatal(err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(data) {
		t.Fatal("tls.crt holds no certificate")
	}
	return &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{
		TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
	}}
}

// get fetches path from the running gateway and returns the status and body.
func (r *serveRun) get(t *testing.T, client *http.Client, path string) (int, string) {
	t.Helper()
	resp, err := client.Get(r.base + path)
	if err != nil {
		t.Fatalf("GET %s: %v\nlog:\n%s", path, err, r.log)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, string(body)
}

func expectLogged(t *testing.T, log string, want ...string) {
	t.Helper()
	for _, w := range want {
		if !strings.Contains(log, w) {
			t.Errorf("log lacks %q:\n%s", w, log)
		}
	}
}

// A first start in Gateway mode: config.yaml is seeded from the environment,
// a removed setting and skipped verification are warned about, the gateway
// serves over its certificate, and SIGTERM shuts it down cleanly.
func TestServe_GatewayModeStartsAndShutsDownOnASignal(t *testing.T) {
	dir := gatewayDir(t)
	t.Setenv("SSL_CERT_FILE", filepath.Join(dir, "tls.crt"))
	t.Setenv("SSL_KEY_FILE", filepath.Join(dir, "tls.key"))
	t.Setenv("SSL_TRUST_DIR", filepath.Join(dir, "trust"))
	t.Setenv("SSL_INSECURE_SKIP_VERIFY", "true")
	t.Setenv("LOG_LEVEL", "debug")
	t.Setenv("APP_DIR", "/old")
	configFile := filepath.Join(dir, "data", "config.yaml")
	t.Setenv("CONFIG_FILE", configFile) // the file read: warned about, not refused

	r := startServe(t, process{configFile: configFile})
	if code, body := r.get(t, gatewayClient(t, dir), "/robots.txt"); code != http.StatusOK || body != robotsTxt {
		t.Errorf("/robots.txt: %d %q", code, body)
	}

	r.signals <- syscall.SIGTERM
	if err := r.result(t); err != nil {
		t.Fatalf("serve after SIGTERM: %v", err)
	}
	if _, err := os.Stat(configFile); err != nil {
		t.Errorf("config.yaml was not seeded: %v", err)
	}
	log := r.log.String()
	expectLogged(t, log,
		"config file seeded from the environment",
		"setting=APP_DIR",
		"setting=CONFIG_FILE",
		"upstream certificates will NOT be validated",
		"conn_modes=direct",
		"listening",
		"shutdown signal received",
		"shutdown complete",
	)
	if strings.Contains(log, "administration app enabled") {
		t.Error("Gateway mode enabled the admin console")
	}
}

// A start in Provisioned mode: the stores and their key are made, the admin
// console is enabled, a variable that differs from the file is reported and
// not applied, and the shutdown stops the backup loop before returning.
func TestServe_ProvisionedModeStartsAndShutsDownOnASignal(t *testing.T) {
	dir := gatewayDir(t)
	configFile := writeServeConfig(t, dir, provisionedKeys(dir))
	t.Setenv("STORE_KEY_FILE", filepath.Join(dir, "store.key"))
	t.Setenv("ADMIN_PASSWORD", "serve-test-password")
	t.Setenv("LOG_LEVEL", "error") // the file says debug, and wins

	r := startServe(t, process{configFile: configFile})
	if code, _ := r.get(t, gatewayClient(t, dir), "/login"); code != http.StatusOK {
		t.Errorf("/login: want 200, got %d", code)
	}

	r.signals <- syscall.SIGTERM
	if err := r.result(t); err != nil {
		t.Fatalf("serve after SIGTERM: %v", err)
	}
	for _, name := range []string{"users.yaml", "store.key"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s was not created: %v", name, err)
		}
	}
	expectLogged(t, r.log.String(),
		"env=LOG_LEVEL",
		"conn_modes=provisioned",
		"administration app enabled",
		"shutdown complete",
	)
}

// Every way a start can fail ends serve with an error, logged with what failed:
// main exits 1 on it.
func TestServe_FailuresStopTheStart(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(t *testing.T, dir string) string // returns config.yaml's path
		listen func() (net.Listener, error)
		want   string
	}{
		{"a config.yaml it cannot use", func(t *testing.T, dir string) string {
			return writeServeConfig(t, dir, "bogus: 1\n")
		}, nil, "configuration failed"},
		{"a certificate pair that does not load", func(t *testing.T, dir string) string {
			writeFile(t, filepath.Join(dir, "tls.key"), "not a key")
			return writeServeConfig(t, dir, "")
		}, nil, "server certificate setup failed"},
		{"a trust dir that is a file", func(t *testing.T, dir string) string {
			writeFile(t, filepath.Join(dir, "trust"), "not a directory")
			return writeServeConfig(t, dir, "")
		}, nil, "trust pool setup failed"},
		{"a store without its key", func(t *testing.T, dir string) string {
			t.Setenv("STORE_KEY_FILE", filepath.Join(dir, "store.key"))
			writeFile(t, filepath.Join(dir, "users.yaml"), "users: []\n")
			return writeServeConfig(t, dir, provisionedKeys(dir))
		}, nil, "provisioned store load failed"},
		{"a backup schedule it cannot read", func(t *testing.T, dir string) string {
			t.Setenv("STORE_KEY_FILE", filepath.Join(dir, "store.key"))
			writeFile(t, filepath.Join(dir, "store.key"), testStoreKeyHex+"\n")
			writeFile(t, filepath.Join(dir, scheduleFileName), "not sealed\n")
			return writeServeConfig(t, dir, provisionedKeys(dir))
		}, nil, "read backup schedule"},
		{"a port it cannot listen on", func(t *testing.T, dir string) string {
			return writeServeConfig(t, dir, "")
		}, func() (net.Listener, error) {
			return nil, errors.New("address already in use")
		}, "listener failed"},
		{"a listener that fails while serving", func(t *testing.T, dir string) string {
			return writeServeConfig(t, dir, "")
		}, func() (net.Listener, error) {
			ln, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				return nil, err
			}
			_ = ln.Close() // Accept fails at once
			return ln, nil
		}, "listener failed"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := gatewayDir(t)
			r := startServe(t, process{configFile: c.setup(t, dir), listen: c.listen})
			if err := r.result(t); err == nil {
				t.Fatalf("serve returned nil; log:\n%s", r.log)
			}
			expectLogged(t, r.log.String(), c.want)
		})
	}
}

// A connection still open at the shutdown deadline, here one that never starts
// its TLS handshake, fails the graceful shutdown: serve says so and returns the
// error, so main exits 1 and the stop is never reported as clean.
func TestServe_ShutdownThatOverrunsItsDeadlineFails(t *testing.T) {
	dir := gatewayDir(t)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	tracked := make(chan struct{})
	r := startServe(t, process{
		configFile: writeServeConfig(t, dir, ""),
		listen:     func() (net.Listener, error) { return &acceptWatch{Listener: ln, tracked: tracked}, nil },
		shutdown:   100 * time.Millisecond,
	})

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	select {
	case <-tracked:
	case <-time.After(30 * time.Second):
		t.Fatalf("the connection was never accepted; log:\n%s", r.log)
	}

	r.signals <- syscall.SIGTERM
	if err := r.result(t); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want the shutdown deadline's error, got %v; log:\n%s", err, r.log)
	}
	log := r.log.String()
	expectLogged(t, log, "shutdown signal received", "graceful shutdown failed")
	if strings.Contains(log, "shutdown complete") {
		t.Error("an overrun shutdown must not be reported as complete")
	}
}

// acceptWatch closes tracked when the server asks for its second connection:
// by then it has counted the first among the open connections a graceful
// shutdown waits for. Only the server's accept loop calls Accept.
type acceptWatch struct {
	net.Listener
	tracked chan struct{}
	calls   int
}

func (l *acceptWatch) Accept() (net.Conn, error) {
	l.calls++
	if l.calls == 2 {
		close(l.tracked)
	}
	return l.Listener.Accept()
}

// Files only (hosted: false): /hosted is a 404, so the app connects to brokers
// itself, and every relay path is a 403 that never reaches the broker.
func TestServe_FilesOnlyRefusesTheRelay(t *testing.T) {
	dir := gatewayDir(t)
	var hits atomic.Int32
	broker := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hits.Add(1) }))
	t.Cleanup(broker.Close)
	port := broker.Listener.Addr().(*net.TCPAddr).Port

	r := startServe(t, process{configFile: writeServeConfig(t, dir, "hosted: false\n")})
	client := gatewayClient(t, dir)
	if code, _ := r.get(t, client, "/hosted"); code != http.StatusNotFound {
		t.Errorf("/hosted: want 404, got %d", code)
	}
	for _, scheme := range []string{"http", "https", "ws", "wss"} {
		path := fmt.Sprintf("/%s/%d/127.0.0.1/SEMP/v2/monitor/msgVpns", scheme, port)
		if code, body := r.get(t, client, path); code != http.StatusForbidden || !strings.Contains(body, "relays no broker connection") {
			t.Errorf("%s: want 403, got %d %q", path, code, body)
		}
	}
	if n := hits.Load(); n != 0 {
		t.Errorf("a refused relay reached the broker %d times", n)
	}

	r.signals <- syscall.SIGTERM
	if err := r.result(t); err != nil {
		t.Fatalf("serve after SIGTERM: %v", err)
	}
}
