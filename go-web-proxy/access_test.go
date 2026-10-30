package main

import (
	"bufio"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

func prefixes(t *testing.T, cidrs ...string) []netip.Prefix {
	t.Helper()
	ps, err := parseCIDRs("test", cidrs)
	if err != nil {
		t.Fatal(err)
	}
	return ps
}

type countingHandler struct{ calls int }

func (h *countingHandler) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	h.calls++
	w.WriteHeader(http.StatusOK)
}

func TestClientIP(t *testing.T) {
	trusted := prefixes(t, "10.0.0.0/8", "fd00::/8")
	cases := []struct {
		name   string
		remote string
		xff    []string
		want   string
		ok     bool
	}{
		{"no XFF: the peer", "192.0.2.1:5000", nil, "192.0.2.1", true},
		{"untrusted peer: XFF ignored", "192.0.2.1:5000", []string{"203.0.113.9"}, "192.0.2.1", true},
		{"trusted peer, one hop", "10.1.1.1:5000", []string{"203.0.113.9"}, "203.0.113.9", true},
		{"trusted chain", "10.1.1.1:5000", []string{"203.0.113.9, 10.2.2.2, 10.3.3.3"}, "203.0.113.9", true},
		{"spoofed left entry never reached", "10.1.1.1:5000", []string{"198.51.100.7, 203.0.113.9, 10.2.2.2"}, "203.0.113.9", true},
		{"all trusted: leftmost", "10.1.1.1:5000", []string{"10.9.9.9, 10.2.2.2"}, "10.9.9.9", true},
		{"several header values join in order", "10.1.1.1:5000", []string{"203.0.113.9", "10.2.2.2"}, "203.0.113.9", true},
		{"IPv4-mapped peer and hop are unmapped", "[::ffff:10.0.0.5]:1", []string{"::ffff:203.0.113.9"}, "203.0.113.9", true},
		{"IPv6 zones stripped", "[fd00::1%eth0]:1", []string{"2001:db8::7%eth0"}, "2001:db8::7", true},
		{"garbage hop fails closed", "10.1.1.1:5000", []string{"not-an-ip, 10.2.2.2"}, "", false},
		{"empty segment fails closed", "10.1.1.1:5000", []string{"203.0.113.9,, 10.2.2.2"}, "", false},
		{"bad RemoteAddr fails closed", "nonsense", nil, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := clientIP(tc.remote, tc.xff, trusted)
			if ok != tc.ok {
				t.Fatalf("ok: want %v, got %v (addr %v)", tc.ok, ok, got)
			}
			if ok && got.String() != tc.want {
				t.Errorf("addr: want %s, got %s", tc.want, got)
			}
		})
	}
}

func TestClientACL_EmptyAllowListReturnsNextItself(t *testing.T) {
	next := &countingHandler{}
	got := clientACL(accessConfig{trustedProxies: prefixes(t, "10.0.0.0/8")}, next, quietLogger())
	if got != http.Handler(next) {
		t.Fatal("an empty allow list must return the inner handler unchanged (allow all, zero cost)")
	}
	rec := httptest.NewRecorder()
	got.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK || next.calls != 1 {
		t.Errorf("want pass-through 200, got %d (calls %d)", rec.Code, next.calls)
	}
}

func TestClientACL_DeniedIsOpaque403(t *testing.T) {
	var buf strings.Builder
	next := &countingHandler{}
	h := clientACL(accessConfig{allow: prefixes(t, "10.0.0.0/8")}, next, newCapturingLogger(&buf))
	req := httptest.NewRequest(http.MethodPost, "/managed/getConnections", nil)
	req.RemoteAddr = "192.0.2.1:4444"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status: want 403, got %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body must be empty, got %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "" {
		t.Errorf("no Content-Type on a denial, got %q", ct)
	}
	if next.calls != 0 {
		t.Error("inner handler must not run for a denied client")
	}
	log := buf.String()
	for _, want := range []string{"level=WARN", "client denied by access list", "client=192.0.2.1", "method=POST", "path=/managed/getConnections"} {
		if !strings.Contains(log, want) {
			t.Errorf("log missing %q: %s", want, log)
		}
	}
	if n := strings.Count(log, "client denied"); n != 1 {
		t.Errorf("want exactly one denial line, got %d: %s", n, log)
	}
}

func TestClientACL_Allowed(t *testing.T) {
	next := &countingHandler{}
	h := clientACL(accessConfig{allow: prefixes(t, "10.0.0.0/8", "2001:db8::/32")}, next, quietLogger())
	for _, remote := range []string{"10.20.30.40:1", "[2001:db8::9]:1", "[::ffff:10.0.0.1]:1"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remote
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: want 200, got %d", remote, rec.Code)
		}
	}
	if next.calls != 3 {
		t.Errorf("inner calls: want 3, got %d", next.calls)
	}
}

func TestClientACL_BadPeerFailsClosed(t *testing.T) {
	var buf strings.Builder
	h := clientACL(accessConfig{allow: prefixes(t, "0.0.0.0/0")}, &countingHandler{}, newCapturingLogger(&buf))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "garbage"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status: want 403, got %d", rec.Code)
	}
	if !strings.Contains(buf.String(), "client=unknown") {
		t.Errorf("log must say the client is unknown: %s", buf.String())
	}
}

func TestClientACL_XFFBelievedOnlyFromTrustedProxy(t *testing.T) {
	ac := accessConfig{allow: prefixes(t, "203.0.113.0/24"), trustedProxies: prefixes(t, "10.0.0.0/8")}
	h := clientACL(ac, &countingHandler{}, quietLogger())
	send := func(remote, xff string) int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remote
		req.Header.Set("X-Forwarded-For", xff)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if got := send("10.0.0.2:1", "203.0.113.9"); got != http.StatusOK {
		t.Errorf("trusted proxy forwarding an allowed client: want 200, got %d", got)
	}
	if got := send("198.51.100.5:1", "203.0.113.9"); got != http.StatusForbidden {
		t.Errorf("untrusted peer with a forged header: want 403, got %d", got)
	}
	if got := send("10.0.0.2:1", "198.51.100.5"); got != http.StatusForbidden {
		t.Errorf("trusted proxy forwarding a client outside the list: want 403, got %d", got)
	}
}

// Denials sit inside the access log: the request record shows the 403 and the
// ACL adds the reason, so operators see both in one stream.
func TestClientACL_InsideAccessLog(t *testing.T) {
	var buf strings.Builder
	logger := newCapturingLogger(&buf)
	h := accessLog(clientACL(accessConfig{allow: prefixes(t, "10.0.0.0/8")}, &countingHandler{}, logger), logger)
	req := httptest.NewRequest(http.MethodGet, "/solAdmin", nil)
	req.RemoteAddr = "192.0.2.1:1"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	log := buf.String()
	for _, want := range []string{"client denied by access list", "status=403", "path=/solAdmin"} {
		if !strings.Contains(log, want) {
			t.Errorf("log missing %q: %s", want, log)
		}
	}
}

// The relay's WebSocket upgrades need http.Hijacker on the writer. The ACL
// never wraps the writer, so the hijack must still work through both wrappers,
// and a denied client must get a plain 403 with no upgrade.
func TestClientACL_HijackSurvivesBothWrappers(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Error("writer lost http.Hijacker through the wrappers")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		conn, rw, err := hj.Hijack()
		if err != nil {
			t.Errorf("hijack: %v", err)
			return
		}
		defer conn.Close()
		_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n")
		_ = rw.Flush()
	})
	const upgrade = "GET /ws HTTP/1.1\r\nHost: gateway\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\n"
	logger := quietLogger()

	allowed := httptest.NewServer(accessLog(clientACL(accessConfig{allow: prefixes(t, "127.0.0.0/8", "::1/128")}, inner, logger), logger))
	defer allowed.Close()
	if status := rawStatusLine(t, allowed.Listener.Addr().String(), upgrade); !strings.HasPrefix(status, "HTTP/1.1 101") {
		t.Fatalf("allowed client: want a 101 from the hijacked connection, got %q", status)
	}

	denied := httptest.NewServer(accessLog(clientACL(accessConfig{allow: prefixes(t, "192.0.2.0/24")}, inner, logger), logger))
	defer denied.Close()
	if status := rawStatusLine(t, denied.Listener.Addr().String(), upgrade); !strings.HasPrefix(status, "HTTP/1.1 403") {
		t.Fatalf("denied client: want 403, got %q", status)
	}
}

func rawStatusLine(t *testing.T, addr, request string) string {
	t.Helper()
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := conn.Write([]byte(request)); err != nil {
		t.Fatal(err)
	}
	line, err := bufio.NewReader(conn).ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	return strings.TrimRight(line, "\r\n")
}

// /hosted is behind the ACL like every other route, and its payload is
// untouched for an allowed client.
func TestClientACL_HostedPayloadUnchanged(t *testing.T) {
	hh := newHostedHandler(true, connBoth, connManaged)
	h := clientACL(accessConfig{allow: prefixes(t, "10.0.0.0/8")}, hh, quietLogger())

	direct := httptest.NewRecorder()
	hh.ServeHTTP(direct, httptest.NewRequest(http.MethodGet, "/hosted", nil))

	req := httptest.NewRequest(http.MethodGet, "/hosted", nil)
	req.RemoteAddr = "10.1.2.3:9"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Body.String() != direct.Body.String() {
		t.Fatalf("allowed /hosted must match the unwrapped handler: %d %q vs %q", rec.Code, rec.Body.String(), direct.Body.String())
	}
	var got hostedInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if want := (hostedInfo{Hosted: true, ConnModes: connBoth, DefaultConn: connManaged}); got != want {
		t.Errorf("payload: want %+v, got %+v", want, got)
	}

	req = httptest.NewRequest(http.MethodGet, "/hosted", nil)
	req.RemoteAddr = "192.0.2.1:9"
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden || rec.Body.Len() != 0 {
		t.Errorf("denied /hosted: want 403 with an empty body, got %d %q", rec.Code, rec.Body.String())
	}
}

func TestParseCIDRs(t *testing.T) {
	got, err := parseCIDRs("access.allow", []string{" 10.1.2.3/8 ", "2001:db8::1/32", "192.0.2.7/32"})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"10.0.0.0/8", "2001:db8::/32", "192.0.2.7/32"}
	for i := range want {
		if got[i].String() != want[i] {
			t.Errorf("[%d]: want masked %s, got %s", i, want[i], got[i])
		}
	}
	if ps, err := parseCIDRs("k", nil); err != nil || ps != nil {
		t.Errorf("empty list: want nil, nil; got %v, %v", ps, err)
	}

	bad := map[string]string{
		"10.0.0.1":            "want CIDR such as",
		"10.0.0.0/33":         "want CIDR such as",
		"nope":                "want CIDR such as",
		"::ffff:10.0.0.0/104": "use the IPv4 form",
	}
	for in, want := range bad {
		_, err := parseCIDRs("access.trustedProxies", []string{"10.0.0.0/8", in})
		if err == nil {
			t.Errorf("%q: want an error", in)
			continue
		}
		msg := err.Error()
		for _, part := range []string{`"access.trustedProxies[1]"`, `"` + in + `"`, want} {
			if !strings.Contains(msg, part) {
				t.Errorf("%q: error %q lacks %q", in, msg, part)
			}
		}
	}
}
