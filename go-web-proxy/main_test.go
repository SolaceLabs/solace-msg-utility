package main

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
