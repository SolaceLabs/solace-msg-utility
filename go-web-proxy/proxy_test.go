package main

import (
	"crypto/x509"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ----- isProxyPath / firstSegment ----------------------------------------------

func TestIsProxyPath(t *testing.T) {
	cases := map[string]bool{
		"/http/8080/host":     true,
		"/https/443/host":     true,
		"/ws/8008/host":       true,
		"/wss/1443/host":      true,
		"/hosted":             false,
		"/index.html":         false,
		"/assets/foo.js":      false,
		"/":                   false,
		"/httpish/8080/host":  false, // not exactly "http"
		"/HTTP/8080/host":     false, // case-sensitive
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
		"/http/abc/host/x",       // port not numeric
		"/http/0/host/x",         // port out of range
		"/http/70000/host/x",     // port out of range
		"/http/-1/host/x",        // negative port
		"/ftp/21/host/x",         // unknown scheme
		"/http",                  // missing port + host
		"/http/8080",             // missing host
		"/http/8080/",            // empty host segment
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
	newHostedHandler(true).ServeHTTP(rec, r)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rec.Code)
	}
	if got := rec.Body.String(); got != "true" {
		t.Errorf("body: want 'true' (no newline), got %q", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/html" {
		t.Errorf("Content-Type: want text/html, got %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control: want no-store, got %q", cc)
	}
}

func TestHostedHandler_Disabled(t *testing.T) {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/hosted", nil)
	newHostedHandler(false).ServeHTTP(rec, r)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status: want 404, got %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body: want empty, got %q", rec.Body.String())
	}
}

// ----- pwaHandler -------------------------------------------------------------

func TestPWAHandler_MissingDir(t *testing.T) {
	h := newPWAHandler(filepath.Join(t.TempDir(), "absent"), quietLogger())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("missing dir: want 404, got %d", rec.Code)
	}
}

func TestPWAHandler_EmptyDir(t *testing.T) {
	h := newPWAHandler(t.TempDir(), quietLogger()) // empty dir
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("empty dir: want 404, got %d", rec.Code)
	}
}

func TestPWAHandler_ServesIndex(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>hi</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := newPWAHandler(dir, quietLogger())

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
	h := newPWAHandler(dir, quietLogger())

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

func TestPWAHandler_MissingAsset_404(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := newPWAHandler(dir, quietLogger())

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
	rp := newReverseProxy(x509.NewCertPool(), false, quietLogger())

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

func TestReverseProxy_BadPathReturns400(t *testing.T) {
	rp := newReverseProxy(x509.NewCertPool(), false, quietLogger())
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
	rp := newReverseProxy(x509.NewCertPool(), false, quietLogger())
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
