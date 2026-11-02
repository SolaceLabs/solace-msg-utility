//go:build managed

package main

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// The SMF gate: GET /managed/smf/{broker}/{vpn}[/tail] upgrades a signed-in,
// entitled user's WebSocket and joins it to the broker's SMF port over TLS.
// The SDK then logs in with the credential dial handed out (dial.go). The
// socket stays open until either side ends it or access is revoked
// (sockets.go); the gateway sets no timer of its own.
//
// Like the SEMP relay it makes one direct round trip on the shared broker
// transport, not a reverse proxy, so the header allow-lists below are the
// whole story in both directions and no interim response reaches the browser.
const smfPrefix = "/managed/smf/"

// Upgrade request headers that reach the broker, besides the fixed
// Connection, Upgrade and User-Agent. Cookie, Authorization and Origin never
// do.
var smfRequestHeaders = []string{"Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol", "Sec-WebSocket-Extensions"}

// The broker's 101 headers that reach the browser, besides Connection and
// Upgrade.
var smfResponseHeaders = []string{"Sec-WebSocket-Accept", "Sec-WebSocket-Protocol", "Sec-WebSocket-Extensions"}

// smfPath is a request path the gate accepted.
type smfPath struct {
	broker, vpn   string
	rawTail, tail string // escaped and decoded, "/" when there is none
}

type smfGate struct {
	store    *store
	sessions *sessions
	sockets  *socketRegistry
	rate     *rateWindow
	upstream http.RoundTripper
	logger   *slog.Logger
}

func newSMFGate(st *store, ss *sessions, sockets *socketRegistry, rate *rateWindow, upstream http.RoundTripper, logger *slog.Logger) *smfGate {
	if upstream == nil {
		upstream = http.DefaultTransport
	}
	return &smfGate{store: st, sessions: ss, sockets: sockets, rate: rate, upstream: upstream, logger: logger}
}

// ServeHTTP runs behind managedHandler's gates (session, forced password
// change), so sessionOf(r) is set. Every refusal comes before the broker is
// dialled.
func (g *smfGate) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	as := sessionOf(r)
	if !sameOriginSocket(r) {
		g.logger.Warn("smf refused a cross-origin socket", "user", as.user, "origin", r.Header.Get("Origin"), "host", r.Host)
		writeError(w, http.StatusForbidden, "cross_origin")
		return
	}
	if !isWebSocketUpgrade(r) {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	p, ok := parseSMFPath(r.URL.EscapedPath())
	if !ok {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if _, err := url.ParseQuery(r.URL.RawQuery); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	remove := g.sockets.add(openSocket{session: as.id, user: as.user, broker: p.broker, vpn: p.vpn, cancel: cancel})
	defer remove()
	// Registered first, checked second: a revocation that lands after the
	// session gate either finds this socket in the registry or is seen here.
	if !g.sessions.has(as.id) {
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	target, ok := g.store.smfTarget(as.user, p.broker, p.vpn)
	if !ok {
		g.logger.Info("smf denied", "user", as.user, "broker", p.broker, "vpn", p.vpn)
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if allowed, wait := g.rate.allow(as.user); !allowed {
		g.logger.Warn("smf rate limited", "user", as.user, "broker", p.broker, "vpn", p.vpn)
		writeRateLimited(w, wait)
		return
	}
	g.connect(ctx, w, r, target, p, g.logger.With("user", as.user, "broker", p.broker, "vpn", p.vpn))
}

// connect opens the broker side first, so a refusal is still a JSON answer,
// then takes over the browser's connection and copies bytes both ways until
// one side ends or ctx is cancelled.
func (g *smfGate) connect(ctx context.Context, w http.ResponseWriter, r *http.Request, target brokerTarget, p smfPath, log *slog.Logger) {
	header := http.Header{}
	for _, k := range smfRequestHeaders {
		if v := r.Header.Values(k); len(v) > 0 {
			header[http.CanonicalHeaderKey(k)] = v
		}
	}
	header.Set("Connection", "Upgrade")
	header.Set("Upgrade", "websocket")
	header.Set("User-Agent", relayUserAgent)
	u := &url.URL{
		Scheme:   "https",
		Host:     net.JoinHostPort(target.host, target.port),
		Path:     p.tail,
		RawPath:  p.rawTail,
		RawQuery: r.URL.RawQuery,
	}
	out := (&http.Request{Method: http.MethodGet, URL: u, Host: u.Host, Header: header, Body: http.NoBody}).WithContext(ctx)
	resp, err := g.upstream.RoundTrip(out)
	if err != nil {
		log.Warn("smf upstream failure", "err", err)
		writeError(w, http.StatusBadGateway, "upstream_unavailable")
		return
	}
	back, isConn := resp.Body.(io.ReadWriteCloser)
	if resp.StatusCode != http.StatusSwitchingProtocols || !isConn || !strings.EqualFold(resp.Header.Get("Upgrade"), "websocket") {
		_ = resp.Body.Close()
		log.Warn("smf refused the broker's answer", "status", resp.StatusCode)
		writeError(w, http.StatusBadGateway, "upstream_unavailable")
		return
	}
	defer back.Close()
	conn, brw, err := http.NewResponseController(w).Hijack()
	if err != nil {
		log.Error("smf cannot take over the browser connection", "err", err)
		writeError(w, http.StatusInternalServerError, "server_error")
		return
	}
	defer conn.Close()
	err = writeSwitch(brw.Writer, resp.Header)
	if err == nil {
		log.Info("smf socket opened")
		pipe(ctx, conn, brw.Reader, back)
	}
	log.Debug("smf socket ended", "err", err)
}

// writeSwitch sends the browser a 101 carrying only the allow-listed headers
// of the broker's. A bufio.Writer error is sticky, so Flush reports any.
func writeSwitch(w *bufio.Writer, upstream http.Header) error {
	h := http.Header{"Connection": {"Upgrade"}, "Upgrade": {"websocket"}}
	for _, k := range smfResponseHeaders {
		if v := upstream.Values(k); len(v) > 0 {
			h[http.CanonicalHeaderKey(k)] = v
		}
	}
	_, _ = w.WriteString("HTTP/1.1 101 Switching Protocols\r\n")
	_ = h.Write(w)
	_, _ = w.WriteString("\r\n")
	return w.Flush()
}

// pipe copies both ways until either direction ends or ctx is cancelled (a
// revocation), then closes both sides and waits for both copies.
func pipe(ctx context.Context, client net.Conn, fromClient io.Reader, broker io.ReadWriteCloser) {
	done := make(chan struct{}, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(broker, fromClient)
		done <- struct{}{}
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(client, broker)
		done <- struct{}{}
	}()
	select {
	case <-done:
	case <-ctx.Done():
	}
	_ = client.Close()
	_ = broker.Close()
	wg.Wait()
}

// sameOriginSocket requires an Origin naming this gateway over https, and a
// same-origin Sec-Fetch-Site when one is sent. A WebSocket is not subject to
// CORS and a GET passes the cross-origin write check, so this is the socket's
// cross-site defence. Behind a proxy that rewrites Host the two differ; the
// refusal's warn log shows both.
func sameOriginSocket(r *http.Request) bool {
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return false
	}
	o, err := url.Parse(r.Header.Get("Origin"))
	return err == nil && o.Scheme == "https" && o.User == nil && o.Host != "" &&
		o.Path == "" && o.RawQuery == "" && strings.EqualFold(o.Host, r.Host)
}

func isWebSocketUpgrade(r *http.Request) bool {
	return r.Method == http.MethodGet && headerHasToken(r.Header, "Connection", "upgrade") &&
		strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}

// headerHasToken reports whether a comma-separated header lists token.
func headerHasToken(h http.Header, name, token string) bool {
	for _, v := range h.Values(name) {
		for _, t := range strings.Split(v, ",") {
			if strings.EqualFold(strings.TrimSpace(t), token) {
				return true
			}
		}
	}
	return false
}

// parseSMFPath accepts /managed/smf/{broker}/{vpn}[/tail], from the escaped
// path (smfPathFor builds it). The broker and VPN are only looked up in the
// store; the tail is forwarded, so each of its segments must pass
// safeSegment (relay.go). A lone trailing slash is the same as none.
func parseSMFPath(escaped string) (smfPath, bool) {
	rest, ok := strings.CutPrefix(escaped, smfPrefix)
	if !ok {
		return smfPath{}, false
	}
	segs := strings.Split(rest, "/")
	if len(segs) < 2 {
		return smfPath{}, false
	}
	broker, errB := url.PathUnescape(segs[0])
	vpn, errV := url.PathUnescape(segs[1])
	if errB != nil || errV != nil || !validName(brokerPattern, broker) || vpn == "" {
		return smfPath{}, false
	}
	p := smfPath{broker: broker, vpn: vpn, rawTail: "/", tail: "/"}
	tail := segs[2:]
	if len(tail) == 0 || (len(tail) == 1 && tail[0] == "") {
		return p, true
	}
	decoded := make([]string, len(tail))
	for i, s := range tail {
		d, err := url.PathUnescape(s)
		if err != nil || !safeSegment(d) {
			return smfPath{}, false
		}
		decoded[i] = d
	}
	p.rawTail = "/" + strings.Join(tail, "/")
	p.tail = "/" + strings.Join(decoded, "/")
	return p, true
}
