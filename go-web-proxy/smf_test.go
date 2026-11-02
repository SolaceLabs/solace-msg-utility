//go:build managed

package main

import (
	"bufio"
	"cmp"
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// wsKey is the sample key of RFC 6455 section 1.3.
const wsKey = "dGhlIHNhbXBsZSBub25jZQ=="

func wsAccept(key string) string {
	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(sum[:])
}

// wsHeaders are a browser's WebSocket upgrade headers from origin. Each pair
// in over replaces one; an empty value counts as absent.
func wsHeaders(origin string, over ...string) []string {
	return append([]string{
		"Upgrade", "websocket", "Connection", "Upgrade",
		"Sec-WebSocket-Key", wsKey, "Sec-WebSocket-Version", "13", "Origin", origin,
	}, over...)
}

// fakeSMFBroker completes a WebSocket upgrade by hand, the way a broker's SMF
// port does, echoing the requested subprotocol and extensions, then echoes
// every byte until either side closes.
type fakeSMFBroker struct {
	fakeBroker
	ended chan struct{} // one value per upgraded connection that closed
}

// fakeAnswer is how the fake broker answers: a non-zero refuse instead of
// upgrading, and the Upgrade its 101 names ("" is websocket).
type fakeAnswer struct {
	refuse  int
	upgrade string
}

func newFakeSMFBroker(t *testing.T, a fakeAnswer) *fakeSMFBroker {
	t.Helper()
	fb := &fakeSMFBroker{ended: make(chan struct{}, 16)}
	fb.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fb.mu.Lock()
		fb.reqs = append(fb.reqs, seenRequest{method: r.Method, uri: r.RequestURI, header: r.Header.Clone()})
		fb.mu.Unlock()
		if a.refuse != 0 {
			w.WriteHeader(a.refuse)
			return
		}
		conn, brw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			return
		}
		defer func() {
			_ = conn.Close()
			fb.ended <- struct{}{}
		}()
		upgrade, negotiated := cmp.Or(a.upgrade, "websocket"), ""
		for _, k := range []string{"Sec-WebSocket-Protocol", "Sec-WebSocket-Extensions"} {
			if v := r.Header.Get(k); v != "" {
				negotiated += k + ": " + v + "\r\n"
			}
		}
		_, _ = fmt.Fprintf(brw, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: %s\r\nConnection: Upgrade\r\n"+
			"Sec-WebSocket-Accept: %s\r\n%sServer: broker/1\r\nSet-Cookie: broker=1\r\n\r\n",
			upgrade, wsAccept(r.Header.Get("Sec-WebSocket-Key")), negotiated)
		if brw.Flush() == nil {
			_, _ = io.Copy(conn, brw)
		}
	}))
	t.Cleanup(fb.srv.Close)
	return fb
}

func (fb *fakeSMFBroker) waitEnded(t *testing.T) {
	t.Helper()
	select {
	case <-fb.ended:
	case <-time.After(5 * time.Second):
		t.Fatal("the broker side of the socket was never closed")
	}
}

// smfEnv is the managed gateway served over TLS (so a socket can be taken
// over), with b1 pointed at a fake SMF broker: VPNs v1 (the viewer's) and v2.
type smfEnv struct {
	*managedEnv
	broker                 *fakeSMFBroker
	brokerHost, brokerPort string
	gw                     *httptest.Server
	roots                  *x509.CertPool
}

func newSMFEnv(t *testing.T, a fakeAnswer) *smfEnv {
	t.Helper()
	fb := newFakeSMFBroker(t, a)
	e := newManagedEnvWith(t, nil, fb.srv.Client().Transport)
	host, port, _ := net.SplitHostPort(fb.srv.Listener.Addr().String())
	if err := e.api.store.upsertConnection(connRec{
		Broker: "b1", Hostname: host,
		Semp: sempRec{Port: "1943", Username: "mon", Password: "semp-pw"},
		Client: clientRec{Port: flexStr(port), MsgVpns: []vpnRec{
			{Name: "v1", Username: "u1", Password: "vpn-pw"},
			{Name: "v2", Username: "u2", Password: "vpn-pw2"},
		}},
	}); err != nil {
		t.Fatal(err)
	}
	gw := httptest.NewTLSServer(e.root)
	t.Cleanup(gw.Close)
	roots := x509.NewCertPool()
	roots.AddCert(gw.Certificate())
	return &smfEnv{managedEnv: e, broker: fb, brokerHost: host, brokerPort: port, gw: gw, roots: roots}
}

// b1Body is a PUT /managed/connections/b1 body that keeps b1's address and
// stored passwords, listing vpns.
func (s *smfEnv) b1Body(vpns string) string {
	return fmt.Sprintf(`{"hostname":%q,"semp":{"port":"1943","user":"mon","pass":""},"client":{"port":%q,"msgVpns":[%s]}}`,
		s.brokerHost, s.brokerPort, vpns)
}

// wsClient is a raw browser-side socket: no WebSocket library, the bytes as
// sent.
type wsClient struct {
	conn *tls.Conn
	br   *bufio.Reader
	resp *http.Response
	body string // a refusal's body
}

// open sends a WebSocket upgrade for path from the gateway's own origin.
func (s *smfEnv) open(t *testing.T, path string, c *http.Cookie, over ...string) *wsClient {
	t.Helper()
	host := s.gw.Listener.Addr().String()
	h := http.Header{}
	pairs := wsHeaders("https://"+host, over...)
	for i := 0; i+1 < len(pairs); i += 2 {
		h.Set(pairs[i], pairs[i+1])
	}
	if c != nil {
		h.Set("Cookie", c.Name+"="+c.Value)
	}
	conn, err := tls.Dial("tcp", host, &tls.Config{RootCAs: s.roots})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	var req strings.Builder
	req.WriteString("GET " + path + " HTTP/1.1\r\nHost: " + host + "\r\n")
	for k := range h {
		if v := h.Get(k); v != "" {
			req.WriteString(k + ": " + v + "\r\n")
		}
	}
	req.WriteString("\r\n")
	if _, err := io.WriteString(conn, req.String()); err != nil {
		t.Fatal(err)
	}
	_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	ws := &wsClient{conn: conn, br: br, resp: resp}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		b, _ := io.ReadAll(resp.Body)
		ws.body = string(b)
	}
	return ws
}

func (s *smfEnv) mustOpen(t *testing.T, path string, c *http.Cookie, over ...string) *wsClient {
	t.Helper()
	ws := s.open(t, path, c, over...)
	if ws.resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("%s: want 101, got %d %s", path, ws.resp.StatusCode, ws.body)
	}
	return ws
}

// echo sends msg and expects the broker's echo back through the gateway.
func (c *wsClient) echo(t *testing.T, msg string) {
	t.Helper()
	if _, err := io.WriteString(c.conn, msg); err != nil {
		t.Fatalf("write: %v", err)
	}
	_ = c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	got := make([]byte, len(msg))
	if _, err := io.ReadFull(c.br, got); err != nil || string(got) != msg {
		t.Fatalf("echo: got %q, %v", got, err)
	}
}

// expectClosed waits for the gateway to end the socket.
func (c *wsClient) expectClosed(t *testing.T) {
	t.Helper()
	_ = c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, err := c.br.ReadByte()
	var ne net.Error
	if err == nil || (errors.As(err, &ne) && ne.Timeout()) {
		t.Fatalf("the socket is still open (%v)", err)
	}
}

func TestSMF_JoinsTheSocketToTheBroker(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	c := s.cookie("viewer", false)
	ws := s.mustOpen(t, "/managed/smf/b1/v1", c,
		"Authorization", "Basic Zm9yZ2VkOmZvcmdlZA==", "Sec-WebSocket-Protocol", "binary", "Sec-WebSocket-Extensions", "permessage-deflate")
	for k, want := range map[string]string{
		"Sec-WebSocket-Accept": wsAccept(wsKey), "Sec-WebSocket-Protocol": "binary", "Sec-WebSocket-Extensions": "permessage-deflate",
	} {
		if got := ws.resp.Header.Get(k); got != want {
			t.Errorf("101 %s: got %q, want %q", k, got, want)
		}
	}
	for _, k := range []string{"Server", "Set-Cookie"} {
		if v := ws.resp.Header.Get(k); v != "" {
			t.Errorf("the broker's %s reached the browser: %q", k, v)
		}
	}
	ws.echo(t, "ping")

	up := s.broker.last(t)
	if up.method != "GET" || up.uri != "/" {
		t.Errorf("upstream request: %s %s", up.method, up.uri)
	}
	for _, k := range []string{"Cookie", "Origin", "Authorization"} {
		if v := up.header.Get(k); v != "" {
			t.Errorf("%s reached the broker: %q", k, v)
		}
	}
	for k, want := range map[string]string{
		"Sec-WebSocket-Key": wsKey, "Sec-WebSocket-Version": "13", "Sec-WebSocket-Protocol": "binary", "Sec-WebSocket-Extensions": "permessage-deflate",
		"Upgrade": "websocket", "User-Agent": relayUserAgent,
	} {
		if got := up.header.Get(k); got != want {
			t.Errorf("upstream %s: got %q, want %q", k, got, want)
		}
	}

	// A tail and a query are forwarded as sent; a lone trailing slash is none.
	for path, uri := range map[string]string{"/managed/smf/b1/v1/x%2Fy?a=1": "/x%2Fy?a=1", "/managed/smf/b1/v1/": "/"} {
		s.mustOpen(t, path, c).echo(t, "tail")
		if got := s.broker.last(t).uri; got != uri {
			t.Errorf("%s: the broker got %q, want %q", path, got, uri)
		}
	}

	// The browser leaving ends the broker side too.
	_ = ws.conn.Close()
	s.broker.waitEnded(t)
}

func TestSMF_RefusalsNeverReachTheBroker(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	viewer := s.cookie("viewer", false)
	const origin = "https://gw.example"
	for _, tc := range []struct {
		name, method, path string
		cookie             *http.Cookie
		over               []string
		status             int
		code               string
	}{
		{"no session", "GET", "/managed/smf/b1/v1", nil, nil, http.StatusUnauthorized, "unauthenticated"},
		{"forced password change", "GET", "/managed/smf/b1/v1", s.cookie("viewer", true), nil, http.StatusForbidden, "password_change_required"},
		{"foreign origin", "GET", "/managed/smf/b1/v1", viewer, []string{"Origin", "https://evil.example"}, http.StatusForbidden, "cross_origin"},
		{"no origin", "GET", "/managed/smf/b1/v1", viewer, []string{"Origin", ""}, http.StatusForbidden, "cross_origin"},
		{"plain-http origin", "GET", "/managed/smf/b1/v1", viewer, []string{"Origin", "http://gw.example"}, http.StatusForbidden, "cross_origin"},
		{"origin with a path", "GET", "/managed/smf/b1/v1", viewer, []string{"Origin", origin + "/x"}, http.StatusForbidden, "cross_origin"},
		{"cross-site fetch", "GET", "/managed/smf/b1/v1", viewer, []string{"Sec-Fetch-Site", "cross-site"}, http.StatusForbidden, "cross_origin"},
		{"not an upgrade", "GET", "/managed/smf/b1/v1", viewer, []string{"Upgrade", ""}, http.StatusBadRequest, "bad_request"},
		{"no Connection upgrade", "GET", "/managed/smf/b1/v1", viewer, []string{"Connection", "keep-alive"}, http.StatusBadRequest, "bad_request"},
		{"another protocol", "GET", "/managed/smf/b1/v1", viewer, []string{"Upgrade", "h2c"}, http.StatusBadRequest, "bad_request"},
		{"POST", "POST", "/managed/smf/b1/v1", viewer, nil, http.StatusBadRequest, "bad_request"},
		{"not entitled", "GET", "/managed/smf/b2/v9", viewer, nil, http.StatusNotFound, "not_found"},
		{"another VPN", "GET", "/managed/smf/b1/v2", viewer, nil, http.StatusNotFound, "not_found"},
		{"unknown broker", "GET", "/managed/smf/nope/v1", viewer, nil, http.StatusNotFound, "not_found"},
		{"no VPN", "GET", "/managed/smf/b1", viewer, nil, http.StatusNotFound, "not_found"},
		{"empty VPN", "GET", "/managed/smf/b1//x", viewer, nil, http.StatusNotFound, "not_found"},
		{"dot segments", "GET", "/managed/smf/b1/v1/../x", viewer, nil, http.StatusNotFound, "not_found"},
		{"encoded dot segments", "GET", "/managed/smf/b1/v1/%2e%2e/x", viewer, nil, http.StatusNotFound, "not_found"},
		{"encoded prefix", "GET", "/managed/smf%2Fb1/v1", viewer, nil, http.StatusNotFound, "not_found"},
		{"unparsable query", "GET", "/managed/smf/b1/v1?a=%zz", viewer, nil, http.StatusBadRequest, "bad_request"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			expect(t, s.do(tc.method, tc.path, "", tc.cookie, wsHeaders(origin, tc.over...)...), tc.status, tc.code)
		})
	}
	if n := s.broker.hits(); n != 0 {
		t.Errorf("a refused socket must never reach the broker (%d calls)", n)
	}
}

// A revocation between the session gate and the socket's registration is
// caught by the check that follows it.
func TestSMF_SessionEndedBeforeRegistration(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	req := httptest.NewRequest("GET", "https://gw.example/managed/smf/b1/v1", nil)
	h := wsHeaders("https://gw.example")
	for i := 0; i+1 < len(h); i += 2 {
		req.Header.Set(h[i], h[i+1])
	}
	req = req.WithContext(withSession(req.Context(), activeSession{id: "ended", session: session{user: "viewer"}}))
	rec := httptest.NewRecorder()
	s.api.smf.ServeHTTP(rec, req)
	expect(t, rec, http.StatusUnauthorized, "unauthenticated")
	if s.broker.hits() != 0 {
		t.Error("nothing reaches the broker")
	}
}

func TestSMF_BrokerFailuresAre502(t *testing.T) {
	for _, refuse := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusInternalServerError} {
		s := newSMFEnv(t, fakeAnswer{refuse: refuse})
		expect(t, s.do("GET", "/managed/smf/b1/v1", "", s.cookie("viewer", false), wsHeaders("https://gw.example")...),
			http.StatusBadGateway, "upstream_unavailable")
	}

	// A 101 that switches to anything but WebSocket is refused, and the
	// broker side it opened is closed.
	s := newSMFEnv(t, fakeAnswer{upgrade: "h2c"})
	expect(t, s.do("GET", "/managed/smf/b1/v1", "", s.cookie("viewer", false), wsHeaders("https://gw.example")...),
		http.StatusBadGateway, "upstream_unavailable")
	s.broker.waitEnded(t)

	s = newSMFEnv(t, fakeAnswer{})
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	_, closed, _ := net.SplitHostPort(l.Addr().String())
	_ = l.Close()
	admin := s.cookie("admin", false)
	b1 := strings.Replace(s.b1Body(`{"name":"v1","user":"u1","pass":""}`), `"port":"`+s.brokerPort+`"`, `"port":"`+closed+`"`, 1)
	expect(t, s.do("PUT", "/managed/connections/b1", b1, admin), http.StatusNoContent, "")
	expect(t, s.do("GET", "/managed/smf/b1/v1", "", s.cookie("viewer", false), wsHeaders("https://gw.example")...),
		http.StatusBadGateway, "upstream_unavailable")
}

// A connection that cannot be taken over (here a recorder) is a 500, and the
// broker side that already upgraded is closed.
func TestSMF_NoTakeoverClosesTheBrokerSide(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	expect(t, s.do("GET", "/managed/smf/b1/v1", "", s.cookie("viewer", false), wsHeaders("https://gw.example")...),
		http.StatusInternalServerError, "server_error")
	s.broker.waitEnded(t)
}

// deadHijacker hands over a connection whose peer is already gone.
type deadHijacker struct {
	http.ResponseWriter
	conn net.Conn
}

func (d deadHijacker) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return d.conn, bufio.NewReadWriter(bufio.NewReader(d.conn), bufio.NewWriter(d.conn)), nil
}

// A browser that left before its 101 was written: no socket opens, and the
// broker side is closed.
func TestSMF_BrowserGoneBeforeTheSwitch(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	ours, theirs := net.Pipe()
	_ = theirs.Close()
	req := httptest.NewRequest("GET", "https://gw.example/managed/smf/b1/v1", nil)
	h := wsHeaders("https://gw.example")
	for i := 0; i+1 < len(h); i += 2 {
		req.Header.Set(h[i], h[i+1])
	}
	id := s.api.sessions.create("viewer", false)
	req = req.WithContext(withSession(req.Context(), activeSession{id: id, session: session{user: "viewer"}}))
	s.api.smf.ServeHTTP(deadHijacker{ResponseWriter: httptest.NewRecorder(), conn: ours}, req)
	s.broker.waitEnded(t)
	if log := s.log.String(); strings.Contains(log, "smf socket opened") || !strings.Contains(log, `msg="smf socket ended"`) {
		t.Errorf("want an ended socket that never opened:\n%s", log)
	}
}

// Every revocation closes an open socket, both sides.
func TestSMF_ClosesOnRevocation(t *testing.T) {
	const viewerUser = `{"admin":false,"operate":[],"readOnly":[{"brokers":"b1","msgVpns":"v1","queues":"*"}],"modules":["queue-browser"]%s}`
	const opsUser = `{"admin":%t%s,"operate":[{"brokers":"*","msgVpns":"*","queues":"*"}],"readOnly":[]}`
	for _, tc := range []struct {
		name, user string
		revoke     func(t *testing.T, s *smfEnv, own, admin *http.Cookie)
	}{
		{"sign-out", "viewer", func(t *testing.T, s *smfEnv, own, _ *http.Cookie) {
			expect(t, s.do("POST", "/managed/logout", "", own), http.StatusNoContent, "")
		}},
		{"own password change", "viewer", func(t *testing.T, s *smfEnv, own, _ *http.Cookie) {
			if rec := s.form("/login/password", passwordForm(viewerPW, "viewer-new-pw-1", "viewer-new-pw-1"), own); rec.Code != http.StatusSeeOther {
				t.Fatalf("password change: %d %s", rec.Code, rec.Body.String())
			}
		}},
		{"password reset by an admin", "viewer", func(t *testing.T, s *smfEnv, _, admin *http.Cookie) {
			expect(t, s.do("PUT", "/managed/users/viewer", fmt.Sprintf(viewerUser, `,"password":"viewer-new-pw-2"`), admin), http.StatusNoContent, "")
		}},
		{"user deleted", "viewer", func(t *testing.T, s *smfEnv, _, admin *http.Cookie) {
			expect(t, s.do("DELETE", "/managed/users/viewer", "", admin), http.StatusNoContent, "")
		}},
		{"demoted", "ops", func(t *testing.T, s *smfEnv, _, admin *http.Cookie) {
			expect(t, s.do("PUT", "/managed/users/ops", fmt.Sprintf(opsUser, false, ""), admin), http.StatusNoContent, "")
		}},
		{"entitlement removed", "viewer", func(t *testing.T, s *smfEnv, own, admin *http.Cookie) {
			body := strings.Replace(fmt.Sprintf(viewerUser, ""), `[{"brokers":"b1","msgVpns":"v1","queues":"*"}]`, `[]`, 1)
			expect(t, s.do("PUT", "/managed/users/viewer", body, admin), http.StatusNoContent, "")
			// The session survives: the store re-check closed the socket.
			expect(t, s.do("GET", "/managed/me", "", own), http.StatusOK, "")
		}},
		{"VPN removed", "viewer", func(t *testing.T, s *smfEnv, _, admin *http.Cookie) {
			expect(t, s.do("PUT", "/managed/connections/b1", s.b1Body(`{"name":"v2","user":"u2","pass":""}`), admin), http.StatusNoContent, "")
		}},
		{"broker deleted", "viewer", func(t *testing.T, s *smfEnv, _, admin *http.Cookie) {
			expect(t, s.do("DELETE", "/managed/connections/b1", "", admin), http.StatusNoContent, "")
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := newSMFEnv(t, fakeAnswer{})
			admin := s.cookie("admin", false)
			if tc.user == "ops" {
				expect(t, s.do("PUT", "/managed/users/ops", fmt.Sprintf(opsUser, true, `,"password":"ops-password-1"`), admin), http.StatusNoContent, "")
			}
			own := s.cookie(tc.user, false)
			ws := s.mustOpen(t, "/managed/smf/b1/v1", own)
			ws.echo(t, "before")
			tc.revoke(t, s, own, admin)
			ws.expectClosed(t)
			s.broker.waitEnded(t)
		})
	}
}

// Expiry is not revocation: the socket outlives its session, and an
// unrelated edit's re-check leaves it open.
func TestSMF_OutlivesItsSession(t *testing.T) {
	s := newSMFEnv(t, fakeAnswer{})
	own := s.cookie("viewer", false)
	ws := s.mustOpen(t, "/managed/smf/b1/v1", own)
	s.clock.advance(s.cfg.session.absolute)
	expect(t, s.do("GET", "/managed/me", "", own), http.StatusUnauthorized, "unauthenticated")
	admin := s.cookie("admin", false)
	b2 := `{"hostname":"host2","semp":{"port":"1943","user":"mon","pass":""},"client":{"port":"1443","msgVpns":[{"name":"v9","user":"u9","pass":""}]}}`
	expect(t, s.do("PUT", "/managed/connections/b2", b2, admin), http.StatusNoContent, "")
	ws.echo(t, "still open")
}

func TestParseSMFPath(t *testing.T) {
	for _, tc := range []struct {
		path               string
		ok                 bool
		vpn, rawTail, tail string
	}{
		{"/managed/smf/b1/v1", true, "v1", "/", "/"},
		{"/managed/smf/b1/a%20b%2Fc/x%2Fy/z", true, "a b/c", "/x%2Fy/z", "/x/y/z"},
		{"/managed/smf/b%zz/v1", false, "", "", ""},
		{"/managed/smf/b1/v%zz", false, "", "", ""},
		{"/managed/smf/b1/v1/x%zz", false, "", "", ""},
		{"/managed/smf/b1/v1/a%5cb", false, "", "", ""},
		{"/managed/smf/b 1/v1", false, "", "", ""},
		{"/managed/relay/b1/v1", false, "", "", ""},
	} {
		p, ok := parseSMFPath(tc.path)
		if ok != tc.ok || (ok && (p.broker == "" || p.vpn != tc.vpn || p.rawTail != tc.rawTail || p.tail != tc.tail)) {
			t.Errorf("%s: got %+v, %v", tc.path, p, ok)
		}
	}
}
