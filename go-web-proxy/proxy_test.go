package main

import (
	"crypto/x509"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// ----- isProxyPath / firstSegment ----------------------------------------------

func TestIsProxyPath(t *testing.T) {
	cases := map[string]bool{
		"/http/8080/host":    true,
		"/https/443/host":    true,
		"/ws/8008/host":      true,
		"/wss/1443/host":     true,
		"/hosted":            false,
		"/index.html":        false,
		"/assets/foo.js":     false,
		"/":                  false,
		"/httpish/8080/host": false, // not exactly "http"
		"/HTTP/8080/host":    false, // case-sensitive
	}
	for in, want := range cases {
		if got := isProxyPath(in); got != want {
			t.Errorf("isProxyPath(%q): want %v, got %v", in, want, got)
		}
	}
}

func TestFirstSegment(t *testing.T) {
	if got := firstSegment("/http/8080/foo"); got != "http" {
		t.Errorf("got %q", got)
	}
	if got := firstSegment("only"); got != "only" {
		t.Errorf("got %q", got)
	}
	if got := firstSegment(""); got != "" {
		t.Errorf("got %q", got)
	}
}

// ----- parseProxyPath ---------------------------------------------------------

func TestParseProxyPath_HTTPSchemes(t *testing.T) {
	cases := []struct {
		in         string
		wantScheme string
		wantHost   string
		wantPath   string
	}{
		{"/http/8080/broker.local/SEMP/v2/__about", "http", "broker.local:8080", "/SEMP/v2/__about"},
		{"/https/1943/broker.local/SEMP/v2/config", "https", "broker.local:1943", "/SEMP/v2/config"},
		{"/ws/8008/broker.local/", "http", "broker.local:8008", "/"},
		{"/wss/1443/broker.local", "https", "broker.local:1443", "/"},
		// Tail with extra slashes preserved.
		{"/http/80/h/a/b/c", "http", "h:80", "/a/b/c"},
	}
	for _, c := range cases {
		got, err := parseProxyPath(c.in)
		if err != nil {
			t.Errorf("parseProxyPath(%q): unexpected error %v", c.in, err)
			continue
		}
		if got.Scheme != c.wantScheme || got.Host != c.wantHost || got.Path != c.wantPath {
			t.Errorf("parseProxyPath(%q): got %s://%s%s, want %s://%s%s",
				c.in, got.Scheme, got.Host, got.Path, c.wantScheme, c.wantHost, c.wantPath)
		}
	}
}

func TestParseProxyPath_IPv6(t *testing.T) {
	cases := []struct {
		in   string
		host string
	}{
		{"/https/443/2001:db8::1/api", "[2001:db8::1]:443"},
		{"/https/443/[2001:db8::1]/api", "[2001:db8::1]:443"},
		{"/http/80/::1", "[::1]:80"},
	}
	for _, c := range cases {
		got, err := parseProxyPath(c.in)
		if err != nil {
			t.Errorf("parseProxyPath(%q): %v", c.in, err)
			continue
		}
		if got.Host != c.host {
			t.Errorf("parseProxyPath(%q): got host %q, want %q", c.in, got.Host, c.host)
		}
	}
}

func TestParseProxyPath_BadInput(t *testing.T) {
	bad := []string{
		"/http/abc/host/x",   // port not numeric
		"/http/0/host/x",     // port out of range
		"/http/70000/host/x", // port out of range
		"/http/-1/host/x",    // negative port
		"/ftp/21/host/x",     // unknown scheme
		"/http",              // missing port + host
		"/http/8080",         // missing host
		"/http/8080/",        // empty host segment
	}
	for _, in := range bad {
		if _, err := parseProxyPath(in); err == nil {
			t.Errorf("parseProxyPath(%q): want error, got nil", in)
		}
	}
}

// ----- joinHostPort -----------------------------------------------------------

func TestJoinHostPort(t *testing.T) {
	cases := []struct {
		host string
		port int
		want string
	}{
		{"broker.local", 8080, "broker.local:8080"},
		{"10.0.0.1", 443, "10.0.0.1:443"},
		{"::1", 8443, "[::1]:8443"},
		{"[::1]", 8443, "[::1]:8443"},
		{"2001:db8::1", 1234, "[2001:db8::1]:1234"},
		{"[2001:db8::1]", 1234, "[2001:db8::1]:1234"},
	}
	for _, c := range cases {
		if got := joinHostPort(c.host, c.port); got != c.want {
			t.Errorf("joinHostPort(%q, %d): want %q, got %q", c.host, c.port, c.want, got)
		}
	}
}

// ----- hostedHandler ----------------------------------------------------------

func TestHostedHandler_Enabled(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/hosted", nil)
	newHostedHandler(true, liveWith(func(c *config) { c.connModes, c.defaultConn = connBoth, connProvisioned }), bundleReady).ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rec.Code)
	}
	// The SPA reads its connection-mode config from this body — it is the only
	// channel a statically-served page has for the gateway's container env.
	var got hostedInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not JSON: %v (%q)", err, rec.Body.String())
	}
	want := hostedInfo{Hosted: true, ConnModes: connBoth, DefaultConn: connProvisioned}
	if got != want {
		t.Errorf("body: want %+v, got %+v", want, got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: want application/json, got %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control: want no-store, got %q", cc)
	}
}

func TestHostedHandler_EnabledDirectOnlyDefault(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/hosted", nil)
	newHostedHandler(true, liveWith(nil), bundleReady).ServeHTTP(rec, r)

	var got hostedInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if got.ConnModes != connDirect || got.DefaultConn != connDirect {
		t.Errorf("want direct-only, got %+v", got)
	}
}

func TestHostedHandler_Disabled(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/hosted", nil)
	newHostedHandler(false, liveWith(nil), bundleReady).ServeHTTP(rec, r)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body: want empty, got %q", rec.Body.String())
	}
}

// connModes and defaultConn apply without a restart: /hosted answers from the
// live settings on every request.
func TestHostedHandler_ReadsLiveSettings(t *testing.T) {
	cfg := defaultConfig()
	lv := newLive(cfg)
	h := newHostedHandler(true, lv, bundleReady)
	cfg.connModes, cfg.defaultConn = connBoth, connProvisioned
	lv.apply(cfg)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/hosted", nil))
	var got hostedInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ConnModes != connBoth || got.DefaultConn != connProvisioned {
		t.Errorf("want the applied modes, got %+v", got)
	}
}

// bundleReady is the app bundle check of a deployment whose bundle is there.
func bundleReady() error { return nil }

// /hosted is the health probe: once the app bundle cannot be served it
// answers 503, so an orchestrator sees the gateway as unhealthy.
func TestHostedHandler_UnusableBundleIs503(t *testing.T) {
	dir := writeBundles(t)
	pwa := mustPWA(t, dir, directIndexFile)
	h := newHostedHandler(true, liveWith(nil), pwa.ready)
	if err := os.Remove(filepath.Join(dir, directIndexFile)); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/hosted", nil))
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("want an uncached 503, got %d %v", rec.Code, rec.Header())
	}
}

// ----- validateConnModes ------------------------------------------------------

// Startup guard: Provisioned sign-in on a gateway the app cannot detect must
// refuse to start rather than ship a tab that only fails at sign-in. Each
// refusal names the key and the variable that seeds it.
func TestValidateConnModes(t *testing.T) {
	base := func(modes, def string, hosted bool) config {
		return config{connModes: modes, defaultConn: def, hosted: hosted}
	}
	cases := []struct {
		name    string
		cfg     config
		wantErr string
	}{
		{"Gateway mode", base(connDirect, connDirect, true), ""},
		{"direct needs no gateway (SMU_HOSTED=false)", base(connDirect, connDirect, false), ""},
		{"direct ignores an odd defaultConn", base(connDirect, connProvisioned, false), ""},
		{"provisioned", base(connProvisioned, connProvisioned, true), ""},
		{"both", base(connBoth, connDirect, true), ""},
		{"invalid SMU_CONN_MODES", base("managed", connDirect, true), `connModes="managed" (config.yaml; seeded by SMU_CONN_MODES) must be one of "direct", "provisioned", "both"`},
		{"invalid SMU_DEFAULT_CONN", base(connBoth, "bogus", true), `defaultConn="bogus" (config.yaml; seeded by SMU_DEFAULT_CONN) must be one of "direct", "provisioned"`},
		{"provisioned without SMU_HOSTED", base(connProvisioned, connProvisioned, false), `offers Provisioned sign-in but hosted is false (config.yaml; seeded by SMU_HOSTED)`},
		{"both without SMU_HOSTED", base(connBoth, connDirect, false), `hosted is false`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateConnModes(tc.cfg)
			if tc.wantErr == "" && err != nil {
				t.Fatalf("want no error, got %v", err)
			}
			if tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
				t.Fatalf("want an error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

// The defaults are Gateway mode: Direct only, so Provisioned mode stays off.
func TestLoadConfig_ConnModeDefaults(t *testing.T) {
	t.Setenv("SMU_CONN_MODES", "")
	t.Setenv("SMU_DEFAULT_CONN", "")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.connModes != connDirect || cfg.defaultConn != connDirect {
		t.Fatalf("want direct/direct, got %q/%q", cfg.connModes, cfg.defaultConn)
	}
	if err := validateConnModes(cfg); err != nil {
		t.Errorf("the defaults must validate, got %v", err)
	}
}

// Env values are case-insensitive so "Provisioned"/"BOTH" don't fail the enum check.
func TestLoadConfig_ConnModesLowercased(t *testing.T) {
	t.Setenv("SMU_CONN_MODES", "BOTH")
	t.Setenv("SMU_DEFAULT_CONN", "Provisioned")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.connModes != connBoth || cfg.defaultConn != connProvisioned {
		t.Fatalf("want both/provisioned, got %q/%q", cfg.connModes, cfg.defaultConn)
	}
}

// ----- pwaHandler -------------------------------------------------------------

// mustPWA is newPWAHandler over a directory that holds the bundle.
func mustPWA(t *testing.T, dir, index string) *pwaHandler {
	t.Helper()
	h, err := newPWAHandler(dir, index, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	return h
}

// A deployment that cannot serve the mode's bundle does not start: a missing
// or empty app directory, a path that is a file, a bundle that is missing or
// is a directory. The error names the file and what to do.
func TestPWAHandler_UnusableBundleStopsTheStart(t *testing.T) {
	file := filepath.Join(t.TempDir(), "SolaceMsgUtility")
	writeFile(t, file, "not a directory")
	directOnly := t.TempDir()
	writeFile(t, filepath.Join(directOnly, directIndexFile), "<html>direct</html>")
	bundleIsADir := t.TempDir()
	if err := os.Mkdir(filepath.Join(bundleIsADir, directIndexFile), 0o755); err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, dir, index, want string }{
		{"the directory is missing", filepath.Join(t.TempDir(), "absent"), directIndexFile, "cannot be read"},
		{"the directory is empty", t.TempDir(), directIndexFile, "cannot be read"},
		{"the path is a file", file, directIndexFile, "cannot be read"},
		{"the Provisioned bundle is missing", directOnly, provisionedIndexFile, "cannot be read"},
		{"the bundle is a directory", bundleIsADir, directIndexFile, "is not a regular file"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, err := newPWAHandler(c.dir, c.index, quietLogger())
			if h != nil || err == nil {
				t.Fatalf("want the start refused, got %v %v", h, err)
			}
			for _, want := range []string{c.want, filepath.Join(c.dir, c.index), "mount a build that holds " + c.index} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("the error lacks %q: %v", want, err)
				}
			}
		})
	}
}

func TestPWAHandler_ServesIndex(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>hi</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := mustPWA(t, dir, directIndexFile)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("root: want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "hi") {
		t.Errorf("root body: want index content, got %q", rec.Body.String())
	}
}

func TestPWAHandler_SPAFallback_NoExtension(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>SPA</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := mustPWA(t, dir, directIndexFile)

	// /queue-browser/some/deep/route has no file extension → fallback to index.html.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/queue-browser/some/deep/route", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("fallback: want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "SPA") {
		t.Errorf("fallback body: want SPA index, got %q", rec.Body.String())
	}
}

// The image ships the Direct, Provisioned and admin bundles side by side.
func writeBundles(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	for name, body := range map[string]string{directIndexFile: "<html>direct</html>", provisionedIndexFile: "<html>provisioned</html>", adminIndexFile: "<html>admin</html>"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// / and the history-mode fallback serve the mode's bundle: the Direct-only one
// in Gateway mode, the one with the sign-in in Provisioned mode.
func TestPWAHandler_ServesTheModesBundle(t *testing.T) {
	dir := writeBundles(t)
	for provisioned, want := range map[bool]string{false: "direct", true: "provisioned"} {
		h := mustPWA(t, dir, appIndexFile(provisioned))
		for _, p := range []string{"/", "/queue-browser/deep/route"} {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
			if rec.Code != http.StatusOK || rec.Body.String() != "<html>"+want+"</html>" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
				t.Errorf("provisioned=%v %s: want the %s bundle, got %d %q", provisioned, p, want, rec.Code, rec.Body.String())
			}
		}
	}
}

// Only the gated /solAdmin route may serve the admin bundle, and only / the
// Provisioned one, in either mode.
func TestPWAHandler_NeverServesTheAdminOrProvisionedBundleByName(t *testing.T) {
	dir := writeBundles(t)
	for _, provisioned := range []bool{false, true} {
		h := mustPWA(t, dir, appIndexFile(provisioned))
		for _, p := range []string{"/solAdmin.html", "/SOLADMIN.HTML", "/x/../solAdmin.html", "/solAdmin.html/", "/provisioned.html", "/Provisioned.HTML"} {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
			if rec.Code != http.StatusNotFound || strings.Contains(rec.Body.String(), "<html>") {
				t.Errorf("provisioned=%v %s: want 404 without a bundle, got %d %q", provisioned, p, rec.Code, rec.Body.String())
			}
		}
	}
}

// A bundle that goes away under a running gateway (a mount changed) is a 404
// naming the file, and a warn line naming it and the request.
func TestPWAHandler_BundleGoneAtRequestTimeIsLogged(t *testing.T) {
	dir := writeBundles(t)
	var buf strings.Builder
	h, err := newPWAHandler(dir, appIndexFile(true), newCapturingLogger(&buf))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, provisionedIndexFile)); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"/", "/queue-browser/deep/route"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, p, nil))
		if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "provisioned.html not found") {
			t.Errorf("%s: want 404 naming provisioned.html, got %d %q", p, rec.Code, rec.Body.String())
		}
	}
	for _, want := range []string{"level=WARN", "app bundle missing", "file=" + filepath.Join(dir, provisionedIndexFile), "path=/queue-browser/deep/route"} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("log lacks %q: %s", want, buf.String())
		}
	}
}

func TestPWAHandler_MissingAsset_404(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := mustPWA(t, dir, directIndexFile)

	// Anything with a file extension should NOT fall back — it's an asset request.
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/missing.js", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("missing asset: want 404, got %d", rec.Code)
	}
}

// ----- reverse proxy round-trip -----------------------------------------------

func TestReverseProxy_HTTPRoundTrip(t *testing.T) {
	// Real upstream HTTP server.
	var captured *http.Request
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.Clone(r.Context())
		w.Header().Set("X-Upstream", "yes")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("upstream-body"))
	}))
	defer upstream.Close()

	upURL, _ := url.Parse(upstream.URL)
	rp := newReverseProxy(newUpstreamTransport(x509.NewCertPool(), false), quietLogger())

	// Build /http/{port}/{host}/some/path?x=1 against the test server.
	gw := httptest.NewServer(rp)
	defer gw.Close()
	path := "/http/" + upURL.Port() + "/" + upURL.Hostname() + "/some/path"
	resp, err := http.Get(gw.URL + path + "?x=1&y=2")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	if string(body) != "upstream-body" {
		t.Errorf("body: want upstream-body, got %q", body)
	}
	if resp.Header.Get("X-Upstream") != "yes" {
		t.Errorf("missing X-Upstream header passthrough")
	}
	// Upstream must have received the rewritten path and query.
	if captured == nil {
		t.Fatal("upstream did not receive the request")
	}
	if captured.URL.Path != "/some/path" {
		t.Errorf("upstream path: want /some/path, got %q", captured.URL.Path)
	}
	if captured.URL.RawQuery != "x=1&y=2" {
		t.Errorf("upstream query: want x=1&y=2, got %q", captured.URL.RawQuery)
	}
	// X-Forwarded-For must NOT be set — transparent passthrough.
	if v := captured.Header.Get("X-Forwarded-For"); v != "" {
		t.Errorf("X-Forwarded-For leaked: %q (must be empty per spec)", v)
	}
}

// One transport serves the Direct relay and the SEMP relay: the trust pool and
// skip-verify flag reach TLS, and a connect has its own bound.
func TestNewUpstreamTransport(t *testing.T) {
	pool := x509.NewCertPool()
	tr := newUpstreamTransport(pool, true)
	if tr.TLSClientConfig.RootCAs != pool || !tr.TLSClientConfig.InsecureSkipVerify {
		t.Errorf("TLS config: %+v", tr.TLSClientConfig)
	}
	if tr.DialContext == nil || tr.ResponseHeaderTimeout != 30*time.Second || tr.TLSHandshakeTimeout != 10*time.Second {
		t.Error("the transport must bound the connect, the handshake and the wait for headers")
	}
	if newUpstreamTransport(pool, false).TLSClientConfig.InsecureSkipVerify {
		t.Error("skip-verify must follow the flag")
	}
}

func TestDropSessionCookie(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"no cookie header", nil, nil},
		{"only the session", []string{"__Host-smu-session=abc"}, nil},
		{"session among others", []string{"a=1; __Host-smu-session=abc; b=2"}, []string{"a=1; b=2"}},
		{"one line per cookie", []string{"__Host-smu-session=abc", "c=3"}, []string{"c=3"}},
		{"empty parts dropped", []string{" ; d=4 ;"}, []string{"d=4"}},
		{"look-alike name kept", []string{"__Host-smu-session2=x"}, []string{"__Host-smu-session2=x"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := http.Header{}
			for _, v := range c.in {
				h.Add("Cookie", v)
			}
			dropSessionCookie(h)
			if got := h.Values("Cookie"); !slices.Equal(got, c.want) {
				t.Errorf("Cookie: want %q, got %q", c.want, got)
			}
		})
	}
}

func TestReverseProxy_NeverForwardsTheSessionCookie(t *testing.T) {
	var captured http.Header
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured = r.Header.Clone()
	}))
	defer upstream.Close()
	upURL, _ := url.Parse(upstream.URL)
	gw := httptest.NewServer(newReverseProxy(newUpstreamTransport(x509.NewCertPool(), false), quietLogger()))
	defer gw.Close()

	req, _ := http.NewRequest("GET", gw.URL+"/http/"+upURL.Port()+"/"+upURL.Hostname()+"/SEMP", nil)
	req.Header.Add("Cookie", "theirs=1; __Host-smu-session=live-session-id")
	req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()
	if got := captured.Values("Cookie"); !slices.Equal(got, []string{"theirs=1"}) {
		t.Errorf("upstream Cookie: want [theirs=1], got %q", got)
	}
	// Direct SEMP needs the browser's own Basic header.
	if got := captured.Get("Authorization"); got != "Basic dXNlcjpwYXNz" {
		t.Errorf("upstream Authorization: want the browser's, got %q", got)
	}
}

func TestDropSessionSetCookie(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want []string
	}{
		{"no Set-Cookie", nil, nil},
		{"a replacement session", []string{"__Host-smu-session=theirs; Secure; Path=/; HttpOnly"}, nil},
		{"an expiry", []string{"__Host-smu-session=; Max-Age=0; Secure; Path=/"}, nil},
		{"spaces around the name", []string{" __Host-smu-session =x; Secure; Path=/"}, nil},
		{"others kept in order", []string{"a=1; Path=/", "__Host-smu-session=x; Secure; Path=/", "b=2"}, []string{"a=1; Path=/", "b=2"}},
		{"look-alike name kept", []string{"__Host-smu-session2=x; Secure; Path=/"}, []string{"__Host-smu-session2=x; Secure; Path=/"}},
		{"name only in the value kept", []string{"a=__Host-smu-session; Path=/"}, []string{"a=__Host-smu-session; Path=/"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := http.Header{}
			for _, v := range c.in {
				h.Add("Set-Cookie", v)
			}
			dropSessionSetCookie(h)
			if got := h.Values("Set-Cookie"); !slices.Equal(got, c.want) {
				t.Errorf("Set-Cookie: want %q, got %q", c.want, got)
			}
		})
	}
}

func TestReverseProxy_UpstreamCannotSetTheSessionCookie(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Set-Cookie", "__Host-smu-session=attacker-session; Secure; Path=/; HttpOnly")
		w.Header().Add("Set-Cookie", "theirs=1; Path=/")
	}))
	defer upstream.Close()
	upURL, _ := url.Parse(upstream.URL)
	gw := httptest.NewServer(newReverseProxy(newUpstreamTransport(x509.NewCertPool(), false), quietLogger()))
	defer gw.Close()

	resp, err := http.Get(gw.URL + "/http/" + upURL.Port() + "/" + upURL.Hostname() + "/SEMP")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()
	if got := resp.Header.Values("Set-Cookie"); !slices.Equal(got, []string{"theirs=1; Path=/"}) {
		t.Errorf("Set-Cookie to the browser: want only theirs=1, got %q", got)
	}
}

func TestReverseProxy_BadPathReturns400(t *testing.T) {
	rp := newReverseProxy(newUpstreamTransport(x509.NewCertPool(), false), quietLogger())
	gw := httptest.NewServer(rp)
	defer gw.Close()

	resp, err := http.Get(gw.URL + "/http/abc/host/x")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

func TestReverseProxy_UpstreamDown_502(t *testing.T) {
	rp := newReverseProxy(newUpstreamTransport(x509.NewCertPool(), false), quietLogger())
	gw := httptest.NewServer(rp)
	defer gw.Close()

	// 127.0.0.1:1 will refuse — port 1 is reserved and unbound.
	resp, err := http.Get(gw.URL + "/http/1/127.0.0.1/whatever")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status: want 502, got %d", resp.StatusCode)
	}
}

// ----- access log -------------------------------------------------------------

func TestAccessLog_RecordsStatusAndBytes(t *testing.T) {
	var buf strings.Builder
	logger := newCapturingLogger(&buf)

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("hello"))
	})
	rec := httptest.NewRecorder()
	accessLog(inner, logger).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/foo", nil))

	log := buf.String()
	if !strings.Contains(log, "status=418") {
		t.Errorf("access log missing status=418: %s", log)
	}
	if !strings.Contains(log, "bytes=5") {
		t.Errorf("access log missing bytes=5: %s", log)
	}
	if !strings.Contains(log, "path=/foo") {
		t.Errorf("access log missing path=/foo: %s", log)
	}
}

// The access log runs inside withClient: behind a trusted proxy it names the
// client X-Forwarded-For gives, the one the access list and the throttle use,
// and the signed-in user a gate recorded.
func TestAccessLog_NamesTheResolvedClientAndUser(t *testing.T) {
	var buf strings.Builder
	lv := liveWith(func(c *config) { c.access.trustedProxies = prefixes(t, "10.0.0.0/8") })
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setRequestUser(r, "viewer")
		w.WriteHeader(http.StatusNoContent)
	})
	req := httptest.NewRequest(http.MethodGet, "/managed/me", nil)
	req.RemoteAddr = "10.1.1.1:5000"
	req.Header.Set("X-Forwarded-For", "203.0.113.9")
	withClient(lv, accessLog(inner, newCapturingLogger(&buf))).ServeHTTP(httptest.NewRecorder(), req)
	for _, want := range []string{"client=203.0.113.9", "user=viewer", "status=204", "path=/managed/me"} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("access log lacks %q: %s", want, buf.String())
		}
	}
	if strings.Contains(buf.String(), "10.1.1.1") {
		t.Errorf("the proxy is not the client: %s", buf.String())
	}
}

// A handler that takes the connection over (a WebSocket) is logged as a 101
// with hijacked=true, not as a 200 with no bytes.
func TestAccessLog_RecordsAHijackAsA101(t *testing.T) {
	var buf strings.Builder
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		conn, brw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			t.Errorf("hijack: %v", err)
			return
		}
		defer conn.Close()
		_, _ = brw.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n")
		_ = brw.Flush()
	})
	logged := accessLog(inner, newCapturingLogger(&buf))
	done := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logged.ServeHTTP(w, r)
		close(done)
	}))
	defer srv.Close()
	if status := rawStatusLine(t, srv.Listener.Addr().String(), "GET /ws HTTP/1.1\r\nHost: gateway\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n"); !strings.HasPrefix(status, "HTTP/1.1 101") {
		t.Fatalf("want the handler's 101, got %q", status)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the handler never returned")
	}
	if !strings.Contains(buf.String(), "status=101") || !strings.Contains(buf.String(), "hijacked=true") {
		t.Errorf("want a 101 marked hijacked: %s", buf.String())
	}
}

func TestAccessLog_SkipsHosted(t *testing.T) {
	var buf strings.Builder
	logger := newCapturingLogger(&buf)

	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	rec := httptest.NewRecorder()
	accessLog(inner, logger).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/hosted", nil))

	if buf.Len() != 0 {
		t.Errorf("/hosted must not produce access log entries, got: %s", buf.String())
	}
}

func TestRecordingResponseWriter_DefaultStatus(t *testing.T) {
	// Writing without explicit WriteHeader: status should remain the default 200.
	rec := httptest.NewRecorder()
	rrw := &recordingResponseWriter{ResponseWriter: rec, status: 200}
	if _, err := rrw.Write([]byte("xy")); err != nil {
		t.Fatal(err)
	}
	if rrw.status != 200 {
		t.Errorf("status: want 200, got %d", rrw.status)
	}
	if rrw.bytes != 2 {
		t.Errorf("bytes: want 2, got %d", rrw.bytes)
	}
}

func newCapturingLogger(w io.Writer) *slog.Logger {
	return slog.New(slog.NewTextHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

// ----- adminHandler (/solAdmin) ------------------------------------------------

func TestAdminHandler_DisabledIs404(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, adminIndexFile), []byte("<html>admin</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Bundle present but the deployment is not in Provisioned mode: the surface must
	// not exist, and must be indistinguishable from a wrong URL.
	h := newAdminHandler(dir, false, quietLogger())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, adminPath, nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("disabled: want 404, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "admin") {
		t.Errorf("disabled: body leaked the bundle: %q", rec.Body.String())
	}
}

func TestAdminHandler_ServesBundle(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, adminIndexFile), []byte("<html>admin</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := newAdminHandler(dir, true, quietLogger())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, adminPath, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("enabled: want 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "admin") {
		t.Errorf("enabled: want the admin bundle, got %q", rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/html") {
		t.Errorf("content-type: want text/html, got %q", got)
	}
	// The admin surface must never be cached by an intermediary.
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache-control: want no-store, got %q", got)
	}
}

func TestAdminHandler_EnabledButNotDeployed(t *testing.T) {
	// Route on, bundle missing — a packaging error, still a 404 to the caller.
	h := newAdminHandler(t.TempDir(), true, quietLogger())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, adminPath, nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("missing bundle: want 404, got %d", rec.Code)
	}
}

func TestAdminHandler_DoesNotFallBackToTheSPA(t *testing.T) {
	// The whole point of a dedicated route: the SPA's history-mode fallback
	// would otherwise answer /solAdmin with the ordinary app.
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>SPA</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := newAdminHandler(dir, true, quietLogger())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, adminPath, nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "SPA") {
		t.Errorf("served the SPA at %s: %q", adminPath, rec.Body.String())
	}
}

// The image keeps the vendor scripts beside the bundle and a licenses/
// directory: a file is served as itself, a directory with an index.html gets
// it, and one without is never listed but answered with the bundle.
func TestPWAHandler_FilesAndDirectories(t *testing.T) {
	dir := writeBundles(t)
	writeFile(t, filepath.Join(dir, "solclient.js"), "// solclient")
	if err := os.MkdirAll(filepath.Join(dir, "licenses", "jszip"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(dir, "licenses", "jszip", "LICENSE.markdown"), "jszip licence")
	if err := os.Mkdir(filepath.Join(dir, "guide"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(dir, "guide", "index.html"), "<html>guide</html>")
	h := mustPWA(t, dir, directIndexFile)

	cases := []struct{ path, want, never string }{
		{"/solclient.js", "// solclient", ""},
		{"/licenses/", "<html>direct</html>", "LICENSE.markdown"},
		{"/guide/", "<html>guide</html>", ""},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, c.path, nil))
		body := rec.Body.String()
		if rec.Code != http.StatusOK || !strings.Contains(body, c.want) {
			t.Errorf("%s: want 200 with %q, got %d %q", c.path, c.want, rec.Code, body)
		}
		if c.never != "" && strings.Contains(body, c.never) {
			t.Errorf("%s: a directory must never be listed, got %q", c.path, body)
		}
	}
}

// The relay streams through the access log: a flush reaches the client.
func TestAccessLog_PassesFlushThrough(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("chunk"))
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("flush through the access log: %v", err)
		}
	})
	rec := httptest.NewRecorder()
	accessLog(inner, quietLogger()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/http/8080/h/x", nil))
	if !rec.Flushed {
		t.Error("the flush did not reach the client's writer")
	}
}

// A second WriteHeader is ignored, as net/http ignores it: the log records
// the status the client got.
func TestAccessLog_KeepsTheFirstStatus(t *testing.T) {
	var buf strings.Builder
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		w.WriteHeader(http.StatusInternalServerError)
	})
	rec := httptest.NewRecorder()
	accessLog(inner, newCapturingLogger(&buf)).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/foo", nil))
	if rec.Code != http.StatusTeapot || !strings.Contains(buf.String(), "status=418") {
		t.Errorf("want 418 sent and logged, got %d; log: %s", rec.Code, buf.String())
	}
}

// A WebSocket upgrade over a writer that cannot hijack fails with an error
// the relay reports, rather than a panic.
func TestRecordingResponseWriter_HijackWithoutSupport(t *testing.T) {
	rrw := &recordingResponseWriter{ResponseWriter: httptest.NewRecorder(), status: 200}
	if _, _, err := rrw.Hijack(); err == nil {
		t.Error("want an error from a writer without http.Hijacker")
	}
}
