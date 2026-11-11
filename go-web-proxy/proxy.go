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
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ----- /hosted ----------------------------------------------------------------

// hostedInfo is the /hosted response body. Beyond the hosted flag it carries the
// deployment's connection-mode config (connModes / defaultConn), which is
// the only channel the statically-served SPA has for reading container env — it
// decides which connection tabs (Direct / Provisioned) the app offers.
type hostedInfo struct {
	Hosted      bool   `json:"hosted"`
	ConnModes   string `json:"connModes"`
	DefaultConn string `json:"defaultConn"`
}

// hostedHandler reads connModes and defaultConn from live per request: both
// keys apply without a restart. It is also the documented health probe, so it
// answers 503 while ready (the app bundle check) fails: an orchestrator then
// sees a gateway that cannot serve the app as unhealthy.
type hostedHandler struct {
	hosted bool
	live   *live
	ready  func() error
}

func newHostedHandler(hosted bool, lv *live, ready func() error) *hostedHandler {
	return &hostedHandler{hosted: hosted, live: lv, ready: ready}
}

func (h *hostedHandler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	if !h.hosted {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if err := h.ready(); err != nil {
		http.Error(w, "503 the app bundle cannot be served", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	cur := h.live.get()
	_ = json.NewEncoder(w).Encode(hostedInfo{
		Hosted:      true,
		ConnModes:   cur.connModes,
		DefaultConn: cur.defaultConn,
	})
}

// ----- /solAdmin ---------------------------------------------------------------

// adminHandler serves the standalone administration app (the `admin` variant's
// solAdmin.html). It is a dedicated route rather than a file the SPA tree serves
// on its own for two reasons: the entitlement editors must not be reachable from
// a deployment that has no user list to edit, and the app's catch-all
// would otherwise answer /solAdmin with a redirect to the ordinary app.
//
// Outside Provisioned mode the route 404s, which is also what a wrong URL
// returns -- a probe cannot tell an admin-capable deployment from any
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
	// The bundle's relative vendor paths only resolve at /solAdmin.
	if r.URL.Path == adminPath+"/" {
		http.Redirect(w, r, adminPath, http.StatusPermanentRedirect)
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
	index  string // the bundle served at /
	fs     http.Handler
	logger *slog.Logger
}

// appIndexFile is the bundle the app is served from: the Direct-only one, or
// in Provisioned mode the one that carries the sign-in.
func appIndexFile(provisioned bool) string {
	if provisioned {
		return provisionedIndexFile
	}
	return directIndexFile
}

// newPWAHandler serves the app from appDir. The mode's bundle must be there:
// without it every page would be a 404, so a missing or unreadable one stops
// the start, naming the file and what to do.
func newPWAHandler(appDir, index string, logger *slog.Logger) (*pwaHandler, error) {
	h := &pwaHandler{root: appDir, index: index, logger: logger}
	if err := h.ready(); err != nil {
		return nil, fmt.Errorf("%w. The gateway serves the app from %s: run the image's own files, or mount a build that holds %s there", err, appDir, index)
	}
	h.fs = http.FileServer(http.FS(os.DirFS(appDir)))
	return h, nil
}

// ready reports whether the mode's bundle can be served: a regular file the
// gateway can open. Checked at start, and by /hosted on every probe.
func (h *pwaHandler) ready() error {
	p := filepath.Join(h.root, h.index)
	f, err := os.Open(p)
	if err != nil {
		return fmt.Errorf("app bundle %s cannot be read: %w", p, err)
	}
	defer f.Close()
	if info, err := f.Stat(); err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("app bundle %s is not a regular file", p)
	}
	return nil
}

func (h *pwaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clean := path.Clean(r.URL.Path)
	if clean == "." {
		clean = "/"
	}
	// The image ships the admin and the Provisioned bundles in this directory,
	// but each has one way in: /solAdmin behind its admin gate, and / in
	// Provisioned mode. Case-insensitive for file systems that are.
	if strings.EqualFold(clean, "/"+adminIndexFile) || strings.EqualFold(clean, "/"+provisionedIndexFile) {
		http.NotFound(w, r)
		return
	}
	// / is the mode's bundle. The app has no client-side routes, and the
	// bundle's relative vendor paths only resolve at /, so a path that doesn't
	// resolve to a real file is sent there (308 for GET and HEAD; any other
	// method has nothing to follow, so 404). A missing asset (anything with a
	// file extension) 404s loudly.
	if clean == "/" {
		h.serveIndex(w, r)
		return
	}
	if !fileResolvable(h.root, clean) {
		if hasExt(clean) {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.NotFound(w, r)
			return
		}
		http.Redirect(w, r, "/", http.StatusPermanentRedirect)
		return
	}
	h.fs.ServeHTTP(w, r)
}

// serveIndex answers with the mode's bundle. The start checked it, so a
// missing one went away under a running gateway (a mount changed): the 404
// names it and so does a warn line.
func (h *pwaHandler) serveIndex(w http.ResponseWriter, r *http.Request) {
	p := filepath.Join(h.root, h.index)
	data, err := os.ReadFile(p)
	if err != nil {
		requestLogger(h.logger, r).Warn("app bundle missing; answered 404", "file", p, "err", err)
		http.Error(w, h.index+" not found", http.StatusNotFound)
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

// upstreamDialTimeout bounds the TCP connect to a broker. Without it a
// blackholed address held the request until the client gave up.
const upstreamDialTimeout = 10 * time.Second

// newUpstreamTransport is the one transport for every broker-bound request:
// the Direct relay and, in the managed build, the SEMP relay. It trusts the
// system roots plus SMU_SSL_TRUSTDIR, and never follows redirects (the
// ReverseProxy calls RoundTrip directly).
func newUpstreamTransport(trustPool *x509.CertPool, insecure bool) *http.Transport {
	return &http.Transport{
		DialContext: (&net.Dialer{Timeout: upstreamDialTimeout, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig: &tls.Config{
			RootCAs:            trustPool,
			InsecureSkipVerify: insecure, // gated by config.yaml tls.insecureSkipVerify (SMU_SSL_SKIP_CERT_VERIFY only seeds it on first start)
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}
}

func newReverseProxy(transport http.RoundTripper, logger *slog.Logger) *reverseProxy {
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
			dropSessionCookie(pr.Out.Header)
			// Intentionally NOT calling pr.SetXForwarded() — transparent passthrough.
		},
		// Runs for a 101 upgrade answer too, before its headers are copied.
		ModifyResponse: func(res *http.Response) error {
			dropSessionSetCookie(res.Header)
			return nil
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

// sessionCookie carries the Provisioned sign-in session id (session.go). The
// __Host- prefix makes the browser insist on Secure, Path=/ and no Domain, so
// no sibling host can set or read it. It is declared here, beside the Direct
// relay, which must strip it in every mode.
const sessionCookie = "__Host-smu-session"

// dropSessionCookie removes the gateway's own sign-in cookie from a request
// bound upstream. The Direct relay forwards every other header unchanged, so
// without this a Direct connection to any host would hand that host a live
// gateway session. Every Cookie line is rebuilt; other cookies pass as sent.
func dropSessionCookie(h http.Header) {
	lines := h.Values("Cookie")
	if len(lines) == 0 {
		return
	}
	h.Del("Cookie")
	for _, line := range lines {
		var kept []string
		for _, part := range strings.Split(line, ";") {
			part = strings.TrimSpace(part)
			name, _, _ := strings.Cut(part, "=")
			if part == "" || name == sessionCookie {
				continue
			}
			kept = append(kept, part)
		}
		if len(kept) > 0 {
			h.Add("Cookie", strings.Join(kept, "; "))
		}
	}
}

// dropSessionSetCookie removes every Set-Cookie line naming the gateway's
// sign-in cookie from a Direct upstream's answer. That answer is served on the
// gateway's own origin, so without this any host a user connects to could
// replace the cookie (signing the user in to an account of the host's
// choosing) or expire it. Other cookies pass as sent.
func dropSessionSetCookie(h http.Header) {
	lines := h.Values("Set-Cookie")
	if len(lines) == 0 {
		return
	}
	h.Del("Set-Cookie")
	for _, line := range lines {
		pair, _, _ := strings.Cut(line, ";")
		name, _, _ := strings.Cut(pair, "=")
		if strings.TrimSpace(name) != sessionCookie {
			h.Add("Set-Cookie", line)
		}
	}
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

// refuseRelay answers the relay paths in files-only mode (hosted: false), where
// the app connects to brokers itself: the gateway relays nothing, and a 403
// says so where the app's redirect to / would hide it.
func refuseRelay(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, "403 forbidden: this deployment serves the app's files only and relays no broker connection", http.StatusForbidden)
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

// accessLog records one INFO line per request: the client withClient
// resolved (it runs inside withClient), the signed-in user once a gate found
// one, the status, the bytes and the time. A handler that takes over the
// connection (a WebSocket) is logged as 101 with hijacked=true, and the time
// is the socket's lifetime.
func accessLog(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// /hosted is skipped: the app asks it once per page load and a health
		// probe asks it every few seconds, so its lines would drown the rest.
		if r.URL.Path == "/hosted" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &recordingResponseWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		attrs := []any{"status", rec.status, "bytes", rec.bytes, "duration_ms", time.Since(start).Milliseconds()}
		if rec.hijacked {
			attrs = append(attrs, "hijacked", true)
		}
		requestLogger(logger, r).Info("request", attrs...)
	})
}

type recordingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int64
	wroteHeader bool
	hijacked    bool
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
// From then on the handler answers on the raw connection, with a 101.
func (r *recordingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijack")
	}
	conn, brw, err := h.Hijack()
	if err == nil {
		r.status, r.wroteHeader, r.hijacked = http.StatusSwitchingProtocols, true, true
	}
	return conn, brw, err
}

func (r *recordingResponseWriter) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
