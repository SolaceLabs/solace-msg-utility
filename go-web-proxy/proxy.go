package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

// ----- /hosted ----------------------------------------------------------------

// hostedInfo is the /hosted response body. Beyond the hosted flag it carries the
// deployment's connection-mode config (from CONN_MODES / DEFAULT_CONN), which is
// the only channel the statically-served SPA has for reading container env — it
// decides which connection tabs (Direct / Managed) the app offers.
type hostedInfo struct {
	Hosted      bool   `json:"hosted"`
	ConnModes   string `json:"connModes"`
	DefaultConn string `json:"defaultConn"`
}

type hostedHandler struct {
	hosted      bool
	connModes   string
	defaultConn string
}

func newHostedHandler(hosted bool, connModes, defaultConn string) *hostedHandler {
	return &hostedHandler{hosted: hosted, connModes: connModes, defaultConn: defaultConn}
}

func (h *hostedHandler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	if !h.hosted {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(hostedInfo{
		Hosted:      true,
		ConnModes:   h.connModes,
		DefaultConn: h.defaultConn,
	})
}

// ----- /solAdmin ---------------------------------------------------------------

// adminHandler serves the standalone administration app (the `admin` variant's
// solAdmin.html). It is a dedicated route rather than a file the SPA tree serves
// on its own for two reasons: the entitlement editors must not be reachable from
// a deployment that has no managed user list to edit, and the SPA's history-mode
// fallback would otherwise answer /solAdmin with the ordinary index.html.
//
// When the deployment is not hosted+managed the route 404s, which is also what a
// wrong URL returns — a probe cannot tell an admin-capable deployment from any
// other. Authentication is still the app's job; this only decides whether the
// surface exists at all.
type adminHandler struct {
	root    string
	enabled bool
	logger  *slog.Logger
}

func newAdminHandler(root string, enabled bool, logger *slog.Logger) *adminHandler {
	return &adminHandler{root: root, enabled: enabled, logger: logger}
}

func (h *adminHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile(h.root + "/" + adminIndexFile)
	if err != nil {
		// The route is enabled but the bundle isn't deployed — a packaging
		// error, so say so in the log rather than leaving an operator to guess.
		h.logger.Warn("admin app requested but not deployed", "file", adminIndexFile, "err", err)
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

// ----- PWA --------------------------------------------------------------------

type pwaHandler struct {
	root   string
	fs     http.Handler
	logger *slog.Logger
	usable bool
}

func newPWAHandler(appDir string, logger *slog.Logger) *pwaHandler {
	h := &pwaHandler{root: appDir, logger: logger}
	info, err := os.Stat(appDir)
	if err != nil {
		logger.Warn("APP_DIR missing; PWA handler will return 404", "app_dir", appDir, "err", err)
		return h
	}
	if !info.IsDir() {
		logger.Warn("APP_DIR is not a directory; PWA handler will return 404", "app_dir", appDir)
		return h
	}
	entries, err := os.ReadDir(appDir)
	if err != nil || len(entries) == 0 {
		logger.Warn("APP_DIR empty or unreadable; PWA handler will return 404", "app_dir", appDir, "err", err)
		return h
	}
	h.fs = http.FileServer(http.FS(os.DirFS(appDir)))
	h.usable = true
	return h
}

func (h *pwaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.usable {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	clean := path.Clean(r.URL.Path)
	if clean == "." {
		clean = "/"
	}
	// SPA history-mode fallback: if the requested path doesn't resolve to a real
	// file, serve the root index.html inline. Asset requests (anything with a
	// file extension) skip the fallback so a missing asset still 404s loudly.
	if clean != "/" && !fileResolvable(h.root, clean) {
		if hasExt(clean) {
			http.NotFound(w, r)
			return
		}
		serveIndex(w, h.root)
		return
	}
	h.fs.ServeHTTP(w, r)
}

func serveIndex(w http.ResponseWriter, root string) {
	data, err := os.ReadFile(root + "/index.html")
	if err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}

func fileResolvable(root, p string) bool {
	full := root + p
	info, err := os.Stat(full)
	if err != nil {
		return false
	}
	if info.IsDir() {
		_, err := os.Stat(full + "/index.html")
		return err == nil
	}
	return true
}

func hasExt(p string) bool {
	return path.Ext(p) != ""
}

// ----- Reverse Proxy ----------------------------------------------------------

type reverseProxy struct {
	rp     *httputil.ReverseProxy
	logger *slog.Logger
}

func newReverseProxy(trustPool *x509.CertPool, insecure bool, logger *slog.Logger) *reverseProxy {
	tlsCfg := &tls.Config{
		RootCAs:            trustPool,
		InsecureSkipVerify: insecure, // gated by SSL_INSECURE_SKIP_VERIFY=true
	}
	transport := &http.Transport{
		TLSClientConfig:       tlsCfg,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}

	p := &reverseProxy{logger: logger}

	p.rp = &httputil.ReverseProxy{
		Transport: transport,
		Rewrite: func(pr *httputil.ProxyRequest) {
			target, ok := pr.In.Context().Value(targetURLKey{}).(*url.URL)
			if !ok || target == nil {
				return
			}
			pr.Out.URL = target
			pr.Out.URL.RawQuery = pr.In.URL.RawQuery
			pr.Out.Host = target.Host
			pr.Out.Header = pr.In.Header.Clone()
			// Intentionally NOT calling pr.SetXForwarded() — transparent passthrough.
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Warn("upstream proxy error",
				"path", r.URL.Path,
				"err", err,
			)
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte("502 bad gateway: upstream unreachable\n"))
		},
	}
	return p
}

type targetURLKey struct{}

func (p *reverseProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target, err := parseProxyPath(r.URL.Path)
	if err != nil {
		http.Error(w, fmt.Sprintf("400 bad request: %s\n", err.Error()), http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	r = r.WithContext(contextWithTarget(ctx, target))
	p.rp.ServeHTTP(w, r)
}

func contextWithTarget(ctx context.Context, u *url.URL) context.Context {
	return context.WithValue(ctx, targetURLKey{}, u)
}

// isProxyPath returns true for any path whose first segment is a known proxy
// scheme. Used to route in the main mux without committing to a full parse.
func isProxyPath(p string) bool {
	switch firstSegment(p) {
	case "http", "https", "ws", "wss":
		return true
	}
	return false
}

func firstSegment(p string) string {
	p = strings.TrimPrefix(p, "/")
	if i := strings.IndexByte(p, '/'); i >= 0 {
		return p[:i]
	}
	return p
}

// parseProxyPath converts an incoming gateway path into an upstream URL.
//
//	/{http|https}/{port}/{host}/{rest...}
//	/{ws|wss}/{port}/{host}/{rest...}
//
// IPv6 hosts may be bare ("2001:db8::1") or bracketed ("[2001:db8::1]") and are
// normalised to the bracketed form for URL construction. WebSocket schemes map
// to their HTTP equivalents on the upstream URL so net/http's Transport can
// dial: ws→http (TCP), wss→https (TCP+TLS). httputil.ReverseProxy detects the
// Upgrade header on its own and hijacks the connection.
func parseProxyPath(p string) (*url.URL, error) {
	rest := strings.TrimPrefix(p, "/")
	parts := strings.SplitN(rest, "/", 4)
	if len(parts) < 3 {
		return nil, errors.New("path must be /{scheme}/{port}/{host}[/rest]")
	}
	scheme := parts[0]
	portStr := parts[1]
	host := parts[2]
	tail := ""
	if len(parts) == 4 {
		tail = parts[3]
	}

	var upstreamScheme string
	switch scheme {
	case "http", "ws":
		upstreamScheme = "http"
	case "https", "wss":
		upstreamScheme = "https"
	default:
		return nil, fmt.Errorf("unknown scheme %q", scheme)
	}

	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("invalid port %q", portStr)
	}

	host = strings.TrimSpace(host)
	if host == "" {
		return nil, errors.New("host segment empty")
	}
	hostPort := joinHostPort(host, port)

	upath := "/" + tail
	u := &url.URL{
		Scheme: upstreamScheme,
		Host:   hostPort,
		Path:   upath,
	}
	return u, nil
}

// joinHostPort normalises a host segment to "[ipv6]:port" form when needed,
// "host:port" otherwise. Accepts already-bracketed IPv6 ("[::1]") and bare IPv6
// ("::1"); strips brackets first so we don't double-wrap.
func joinHostPort(host string, port int) string {
	unbracketed := host
	if strings.HasPrefix(unbracketed, "[") && strings.HasSuffix(unbracketed, "]") {
		unbracketed = unbracketed[1 : len(unbracketed)-1]
	}
	if ip := net.ParseIP(unbracketed); ip != nil && ip.To4() == nil {
		// IPv6 → bracket it.
		return "[" + unbracketed + "]:" + strconv.Itoa(port)
	}
	return unbracketed + ":" + strconv.Itoa(port)
}

// ----- Access log middleware --------------------------------------------------

func accessLog(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /hosted is polled frequently by the PWA — skip to avoid log spam.
		if r.URL.Path == "/hosted" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &recordingResponseWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		logger.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"remote", r.RemoteAddr,
			"status", rec.status,
			"bytes", rec.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type recordingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
}

func (r *recordingResponseWriter) WriteHeader(code int) {
	if r.wroteHeader {
		return
	}
	r.wroteHeader = true
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *recordingResponseWriter) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.wroteHeader = true
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += int64(n)
	return n, err
}

// Hijack lets the WebSocket upgrade path keep working when the underlying
// ResponseWriter supports it (httputil.ReverseProxy requires Hijacker for ws).
func (r *recordingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijack")
	}
	return h.Hijack()
}

func (r *recordingResponseWriter) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

