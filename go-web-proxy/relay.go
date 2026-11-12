package main

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// The SEMP relay: /managed/relay/{broker}/SEMP... forwards a signed-in user's
// SEMP request to a provisioned broker with the broker's stored credential,
// which never reaches the browser, over the connection's SEMP scheme (https
// unless the record says http). It is read-only by rule:
//
//   - GET and HEAD under /SEMP/v2/
//   - POST /SEMP (v1) only when the body is a single <rpc> whose one command
//     is <show>
//
// Everything else under /SEMP is 403 read_only, any other path 404. The app
// sends nothing else: its SEMP v2 calls are GETs and its v1 calls are <show>.
// Queue globs stay a UI filter (managed-semp-filter.ts); the relay checks the
// broker only, against the same entitlement the profile uses.
const (
	relayPrefix      = "/managed/relay/"
	relayMaxBody     = 1 << 20 // a SEMP v1 request; v2 reads carry no body
	relayMaxInFlight = 16      // concurrent relayed requests per user
	relayUserAgent   = "smu-gateway"
)

// Request headers that reach the broker; everything else, the session cookie,
// Authorization, Origin, Referer, Sec-Fetch-* and X-Forwarded-* included, is
// dropped. Accept-Encoding is dropped too: the transport negotiates its own.
// Content-Type is not taken from the client: a v1 POST is sent as
// relayV1ContentType, so no charset the client names can make the broker read
// the body differently from isShowRPC. No conditional request header passes
// either way: the relay answers a broker's 304 as a 502 (forward), so it
// neither forwards If-Match and If-None-Match nor hands out an ETag.
var relayRequestHeaders = []string{"Accept"}

const relayV1ContentType = "application/xml"

// Response headers that reach the browser. Set-Cookie, WWW-Authenticate (it
// would raise a Basic prompt), Location, Server, Via and the rest never do.
var relayResponseHeaders = []string{"Content-Type", "Content-Length", "Content-Encoding", "Last-Modified"}

// relayPath is a request path the relay accepted.
type relayPath struct {
	broker  string
	rawTail string // escaped, as received: /SEMP/v2/...
	tail    string // decoded
	v1      bool   // exactly /SEMP
}

// sempRelay sends each accepted request with one RoundTrip on the shared
// upstream transport, not through httputil.ReverseProxy: a plain round trip
// follows no redirect, forwards no 1xx response and re-adds no header, so the
// allow-lists above are the whole story in both directions.
type sempRelay struct {
	store    *store
	upstream http.RoundTripper
	inFlight *userCounter
	logger   *slog.Logger
	audit    *auditor // the audit trail (audit.go); nil records nothing
}

func newSEMPRelay(st *store, upstream http.RoundTripper, logger *slog.Logger) *sempRelay {
	if upstream == nil {
		upstream = http.DefaultTransport
	}
	return &sempRelay{store: st, upstream: upstream, inFlight: newUserCounter(relayMaxInFlight), logger: logger}
}

// ServeHTTP runs behind managedHandler's gates (session, throttle, cross-site
// writes, forced password change), so sessionOf(r) is set.
func (rl *sempRelay) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	user := sessionOf(r).user
	// cop.Check passes safe methods, so cross-site reads are refused here.
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		writeError(w, http.StatusForbidden, "cross_origin")
		return
	}
	// The relay forwards requests, never connections.
	if r.Header.Get("Upgrade") != "" {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	p, ok := parseRelayPath(r.URL.EscapedPath())
	if !ok {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	// A query the gateway cannot parse (a ';' separator, a bad escape) might
	// be parsed differently by the broker, so it is refused, not cleaned.
	if _, err := url.ParseQuery(r.URL.RawQuery); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request")
		return
	}
	header := http.Header{}
	for _, k := range relayRequestHeaders {
		if v := r.Header.Values(k); len(v) > 0 {
			header[http.CanonicalHeaderKey(k)] = v
		}
	}
	header.Set("User-Agent", relayUserAgent)
	var body []byte
	switch {
	case p.v1 && r.Method == http.MethodPost:
		var err error
		body, err = io.ReadAll(http.MaxBytesReader(w, r.Body, relayMaxBody))
		var tooLarge *http.MaxBytesError
		switch {
		case errors.As(err, &tooLarge):
			writeError(w, http.StatusRequestEntityTooLarge, "too_large")
			return
		case err != nil:
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		case !isShowRPC(body):
			rl.logger.Warn("semp relay refused a v1 request that is not a show", "user", user, "broker", p.broker)
			writeError(w, http.StatusForbidden, "read_only")
			return
		}
		header.Set("Content-Type", relayV1ContentType)
	case !p.v1 && (r.Method == http.MethodGet || r.Method == http.MethodHead):
		// A read carries no body upstream, whatever the client sent.
	default:
		rl.logger.Warn("semp relay refused a write", "user", user, "broker", p.broker, "method", r.Method)
		writeError(w, http.StatusForbidden, "read_only")
		return
	}
	target, ok := rl.store.sempTarget(user, p.broker)
	if !ok {
		rl.logger.Info("semp relay denied", "user", user, "broker", p.broker)
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	if !rl.inFlight.acquire(user) {
		rl.logger.Info("semp relay limited: too many requests in flight", "user", user, "broker", p.broker, "max_in_flight", relayMaxInFlight)
		writeRateLimited(w, time.Second)
		return
	}
	defer rl.inFlight.release(user)

	u := &url.URL{
		Scheme:   target.scheme,
		Host:     net.JoinHostPort(target.host, target.port),
		Path:     p.tail,
		RawPath:  p.rawTail,
		RawQuery: r.URL.RawQuery,
	}
	out := (&http.Request{
		Method:        r.Method,
		URL:           u,
		Host:          u.Host,
		Header:        header,
		Body:          http.NoBody,
		ContentLength: int64(len(body)),
	}).WithContext(r.Context())
	if len(body) > 0 {
		out.Body = io.NopCloser(bytes.NewReader(body))
	}
	out.SetBasicAuth(target.user, target.pass)
	e := auditFor(r, auditRelay)
	e.Target, e.Outcome = p.broker, auditOK
	e.Msg = user + " relayed " + r.Method + " " + p.tail + " to " + p.broker
	rl.audit.record(auditAccess, e)
	rl.forward(w, out, user, p.broker)
}

// forward sends out and passes on only a final, non-redirect answer, with an
// allow-list of headers. A broker 401 or 407 means the stored credential is
// wrong, not the user's session, so it must not reach the browser as a 401
// (the app signs out on a 401 from /managed/*). Every failure is a generic
// JSON 502; the cause, which may name the broker's address, goes to the log.
func (rl *sempRelay) forward(w http.ResponseWriter, out *http.Request, user, broker string) {
	resp, err := rl.upstream.RoundTrip(out)
	if err != nil {
		rl.logger.Warn("semp relay upstream failure", "user", user, "broker", broker, "err", err)
		writeError(w, http.StatusBadGateway, "upstream_unavailable")
		return
	}
	defer resp.Body.Close()
	code := ""
	switch s := resp.StatusCode; {
	case s < 200, s >= 300 && s < 400:
		code = "upstream_unavailable"
	case s == http.StatusUnauthorized, s == http.StatusProxyAuthRequired:
		code = "upstream_auth"
	}
	if code != "" {
		rl.logger.Warn("semp relay refused the broker's answer", "user", user, "broker", broker, "status", resp.StatusCode)
		writeError(w, http.StatusBadGateway, code)
		return
	}
	h := w.Header()
	for _, k := range relayResponseHeaders {
		if v := resp.Header.Values(k); len(v) > 0 {
			h[http.CanonicalHeaderKey(k)] = v
		}
	}
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.WriteHeader(resp.StatusCode)
	n, err := io.Copy(w, resp.Body)
	rl.logger.Debug("semp relayed", "user", user, "broker", broker, "method", out.Method, "status", resp.StatusCode, "bytes", n, "err", err)
}

// parseRelayPath accepts /managed/relay/{broker}/SEMP and
// /managed/relay/{broker}/SEMP/v2/{at least one more segment}, from the
// escaped path: ServeMux leaves encoded dot segments in place, so every
// decoded segment is checked here (safeSegment).
func parseRelayPath(escaped string) (relayPath, bool) {
	rest, ok := strings.CutPrefix(escaped, relayPrefix)
	if !ok {
		return relayPath{}, false
	}
	segs := strings.Split(rest, "/")
	decoded := make([]string, len(segs))
	for i, s := range segs {
		d, err := url.PathUnescape(s)
		if err != nil || !safeSegment(d) {
			return relayPath{}, false
		}
		decoded[i] = d
	}
	if !validName(brokerPattern, decoded[0]) || len(decoded) < 2 || decoded[1] != "SEMP" {
		return relayPath{}, false
	}
	tail := decoded[1:]
	v1 := len(tail) == 1
	if !v1 && (len(tail) < 3 || tail[1] != "v2") {
		return relayPath{}, false
	}
	return relayPath{
		broker:  decoded[0],
		rawTail: "/" + strings.Join(segs[1:], "/"),
		tail:    "/" + strings.Join(tail, "/"),
		v1:      v1,
	}, true
}

// safeSegment reports whether a decoded path segment may be forwarded. It may
// hold a "/" (a queue named a/b arrives as a%2Fb), but no part of it may be
// empty, "." or ".."; and it holds no control character, backslash, "%" (a
// second encoding) or ";" (a path parameter some servers strip before
// resolving dot segments).
func safeSegment(d string) bool {
	if d == "" || hasControl(d) || strings.ContainsAny(d, `\%;`) {
		return false
	}
	for _, part := range strings.Split(d, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

// isShowRPC reports whether body is one <rpc> element whose single child
// element is <show>: the SEMP v1 read form. Text outside <show>, a second
// command, a DOCTYPE, a namespace or malformed XML is not.
func isShowRPC(body []byte) bool {
	dec := xml.NewDecoder(bytes.NewReader(body))
	depth, roots, commands := 0, 0, 0
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return depth == 0 && roots == 1 && commands == 1
		}
		if err != nil {
			return false
		}
		switch t := tok.(type) {
		case xml.StartElement:
			depth++
			switch {
			case t.Name.Space != "":
				return false
			case depth == 1:
				roots++
				if roots > 1 || t.Name.Local != "rpc" {
					return false
				}
			case depth == 2:
				commands++
				if commands > 1 || t.Name.Local != "show" {
					return false
				}
			}
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth < 2 && len(bytes.TrimSpace(t)) > 0 {
				return false
			}
		case xml.Directive:
			return false
		}
	}
}

// userCounter caps concurrent work per user.
type userCounter struct {
	mu  sync.Mutex
	n   map[string]int
	max int
}

func newUserCounter(max int) *userCounter {
	return &userCounter{n: map[string]int{}, max: max}
}

func (c *userCounter) acquire(user string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.n[user] >= c.max {
		return false
	}
	c.n[user]++
	return true
}

func (c *userCounter) release(user string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.n[user]--; c.n[user] <= 0 {
		delete(c.n, user)
	}
}
