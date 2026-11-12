package main

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeBroker is a TLS SEMP endpoint that records what reached it and answers
// with answer.
type fakeBroker struct {
	srv  *httptest.Server
	mu   sync.Mutex
	reqs []seenRequest
}

type seenRequest struct {
	method, uri, body string
	header            http.Header
}

func (fb *fakeBroker) hits() int {
	fb.mu.Lock()
	defer fb.mu.Unlock()
	return len(fb.reqs)
}

func (fb *fakeBroker) last(t *testing.T) seenRequest {
	t.Helper()
	fb.mu.Lock()
	defer fb.mu.Unlock()
	if len(fb.reqs) == 0 {
		t.Fatal("the broker was never called")
	}
	return fb.reqs[len(fb.reqs)-1]
}

func answerJSON(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, `{"data":[]}`)
}

// newRelayEnv points broker b1 (viewer: read-only on b1/v1; admin: every
// broker) at a fake SEMP endpoint, with SEMP account mon / semp-pw.
func newRelayEnv(t *testing.T, answer http.HandlerFunc) (*managedEnv, *fakeBroker) {
	t.Helper()
	fb := &fakeBroker{}
	fb.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		fb.mu.Lock()
		fb.reqs = append(fb.reqs, seenRequest{method: r.Method, uri: r.RequestURI, body: string(body), header: r.Header.Clone()})
		fb.mu.Unlock()
		answer(w, r)
	}))
	t.Cleanup(fb.srv.Close)
	e := newManagedEnvWith(t, nil, fb.srv.Client().Transport)
	host, port, _ := net.SplitHostPort(fb.srv.Listener.Addr().String())
	err := e.api.store.upsertConnection(connRec{
		Broker: "b1", Hostname: host,
		Semp:   sempRec{Port: flexStr(port), Username: "mon", Password: "semp-pw"},
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1", Password: "vpn-pw"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	return e, fb
}

const showRPC = `<rpc><show><queue><name>q</name><vpn-name>v1</vpn-name></queue></show></rpc>`

func TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(t *testing.T) {
	e, fb := newRelayEnv(t, func(w http.ResponseWriter, r *http.Request) {
		for k, v := range map[string]string{
			"Set-Cookie": "broker=1", "WWW-Authenticate": `Basic realm="semp"`, "Server": "broker/1",
			"Location": "https://elsewhere/", "X-Custom": "1", "ETag": `"e1"`,
		} {
			w.Header().Set(k, v)
		}
		answerJSON(w, r)
	})
	path := "/managed/relay/b1/SEMP/v2/monitor/msgVpns/v1/queues/a%2Fb?count=10&where=x"
	rec := e.do("GET", path, "", e.cookie("viewer", false),
		"Authorization", "Basic Zm9yZ2VkOmZvcmdlZA==", "Origin", "https://gw.example", "Referer", "https://gw.example/",
		"X-Forwarded-For", "203.0.113.9", "Accept", "application/json", "Sec-Fetch-Site", "same-origin",
		"If-None-Match", `"e0"`, "If-Match", `"e0"`)
	expect(t, rec, http.StatusOK, "")
	if rec.Body.String() != `{"data":[]}` {
		t.Errorf("body: %q", rec.Body.String())
	}

	up := fb.last(t)
	if up.method != "GET" || up.uri != "/SEMP/v2/monitor/msgVpns/v1/queues/a%2Fb?count=10&where=x" {
		t.Errorf("upstream request: %s %s", up.method, up.uri)
	}
	if want := "Basic " + base64.StdEncoding.EncodeToString([]byte("mon:semp-pw")); up.header.Get("Authorization") != want {
		t.Errorf("upstream Authorization: want the stored credential, got %q", up.header.Get("Authorization"))
	}
	// No conditional request either: the relay would answer the broker's 304
	// as a 502.
	for _, k := range []string{"Cookie", "Origin", "Referer", "X-Forwarded-For", "Sec-Fetch-Site", "If-None-Match", "If-Match"} {
		if v := up.header.Get(k); v != "" {
			t.Errorf("%s reached the broker: %q", k, v)
		}
	}
	if up.header.Get("Accept") != "application/json" || up.header.Get("User-Agent") != relayUserAgent {
		t.Errorf("allowed headers: Accept %q, User-Agent %q", up.header.Get("Accept"), up.header.Get("User-Agent"))
	}

	h := rec.Header()
	for _, k := range []string{"Set-Cookie", "WWW-Authenticate", "Server", "Location", "X-Custom", "ETag"} {
		if v := h.Get(k); v != "" {
			t.Errorf("%s reached the browser: %q", k, v)
		}
	}
	if cc := h.Values("Cache-Control"); len(cc) != 1 || cc[0] != "no-store" {
		t.Errorf("Cache-Control: want exactly no-store, got %q", cc)
	}
	if h.Get("Content-Type") != "application/json" ||
		h.Get("X-Content-Type-Options") != "nosniff" || h.Get("Content-Security-Policy") != "default-src 'none'; sandbox" {
		t.Errorf("response headers: %v", h)
	}
}

func TestRelay_UpstreamAnswers(t *testing.T) {
	cases := []struct {
		upstream int
		status   int
		code     string
	}{
		{http.StatusFound, http.StatusBadGateway, "upstream_unavailable"},
		{http.StatusUnauthorized, http.StatusBadGateway, "upstream_auth"},
		{http.StatusProxyAuthRequired, http.StatusBadGateway, "upstream_auth"},
		{http.StatusForbidden, http.StatusForbidden, ""}, // SEMP's own authorisation answer
		{http.StatusInternalServerError, http.StatusInternalServerError, ""},
	}
	for _, tc := range cases {
		t.Run(http.StatusText(tc.upstream), func(t *testing.T) {
			e, _ := newRelayEnv(t, func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Location", "https://elsewhere/")
				w.WriteHeader(tc.upstream)
			})
			rec := e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", e.cookie("viewer", false))
			expect(t, rec, tc.status, tc.code)
			if rec.Header().Get("Location") != "" {
				t.Error("an upstream Location must never reach the browser")
			}
		})
	}
}

// A 101 the relay never asked for would hand the browser a raw broker
// connection; it is refused like a redirect, and no upgrade header passes.
func TestRelay_UnaskedUpgradeIsA502(t *testing.T) {
	e, _ := newRelayEnv(t, func(w http.ResponseWriter, _ *http.Request) {
		conn, buf, err := http.NewResponseController(w).Hijack()
		if err != nil {
			t.Errorf("hijack: %v", err)
			return
		}
		defer conn.Close()
		_, _ = buf.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		_ = buf.Flush()
	})
	rec := e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", e.cookie("viewer", false))
	expect(t, rec, http.StatusBadGateway, "upstream_unavailable")
	for _, k := range []string{"Upgrade", "Connection"} {
		if rec.Header().Get(k) != "" {
			t.Errorf("the broker's %s header must never reach the browser", k)
		}
	}
}

func TestRelay_UnreachableBrokerIsAGeneric502(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	addr := fb.srv.Listener.Addr().String()
	fb.srv.Close()
	rec := e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", e.cookie("viewer", false))
	expect(t, rec, http.StatusBadGateway, "upstream_unavailable")
	if strings.Contains(rec.Body.String(), addr) {
		t.Errorf("the broker's address must not reach the browser: %s", rec.Body.String())
	}
	if !strings.Contains(e.log.String(), "semp relay upstream failure") || !strings.Contains(e.log.String(), "broker=b1") {
		t.Errorf("want the cause in the log: %s", e.log.String())
	}
}

func TestRelay_PathRules(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	c := e.cookie("viewer", false)
	accepted := map[string]string{ // path -> what the broker receives
		"/managed/relay/b1/SEMP/v2/monitor/msgVpns":                   "/SEMP/v2/monitor/msgVpns",
		"/managed/relay/b1/SEMP/v2/config/msgVpns/v1/queues/a%2Fb":    "/SEMP/v2/config/msgVpns/v1/queues/a%2Fb",
		"/managed/relay/b%31/SEMP/v2/monitor/msgVpns/v1/queues/q%20x": "/SEMP/v2/monitor/msgVpns/v1/queues/q%20x",
	}
	for path, uri := range accepted {
		expect(t, e.do("GET", path, "", c), http.StatusOK, "")
		if got := fb.last(t).uri; got != uri {
			t.Errorf("%s: the broker got %q, want %q", path, got, uri)
		}
	}
	before := fb.hits()
	for _, path := range []string{
		"/managed/relay/",
		"/managed/relay/b1",
		"/managed/relay/b1/x",
		"/managed/relay/b1/SEMPx/v2/monitor",
		"/managed/relay/b1/SEMP/v2",
		"/managed/relay/b1/SEMP/v1/monitor",
		"/managed/relay/b1/SEMP/v2/monitor/",
		"/managed/relay/b1/SEMP/v2//monitor",
		"/managed/relay/b1/SEMP/v2/../../x",
		"/managed/relay/b1/SEMP/v2/%2e%2e/%2e%2e/x",
		"/managed/relay/b1/SEMP/v2/a%2F..%2Fb",
		"/managed/relay/b1/SEMP/v2/a%2F%2Fb",
		"/managed/relay/b1/SEMP/v2/a%5cb",
		"/managed/relay/b1/SEMP/v2/%252e%252e",
		"/managed/relay/b1/SEMP/v2/a%00b",
		"/managed/relay/b%201/SEMP/v2/monitor",
		"/managed/relay/../users",
		"/managed/relay/b1%2FSEMP/v2/monitor",
		"/managed/relay%2Fb1/SEMP/v2/monitor",
		"/managed/relay/b1/SEMP/v2/..;/..;/x",
		"/managed/relay/b1/SEMP/v2/monitor;x=1",
	} {
		expect(t, e.do("GET", path, "", c), http.StatusNotFound, "not_found")
	}
	// A query the gateway cannot parse could be parsed differently upstream.
	for _, q := range []string{"count=1;x=y", "where=%zz"} {
		expect(t, e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/msgVpns?"+q, "", c), http.StatusBadRequest, "bad_request")
	}
	if fb.hits() != before {
		t.Errorf("a refused path must never reach the broker (%d calls)", fb.hits()-before)
	}
}

func TestRelay_IsReadOnly(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	c := e.cookie("admin", false)
	v2 := "/managed/relay/b1/SEMP/v2/config/msgVpns/v1/queues/q"
	for _, m := range []string{"POST", "PUT", "PATCH", "DELETE", "OPTIONS"} {
		expect(t, e.do(m, v2, `{"egressEnabled":false}`, c), http.StatusForbidden, "read_only")
	}
	expect(t, e.do("GET", "/managed/relay/b1/SEMP", "", c), http.StatusForbidden, "read_only")
	expect(t, e.do("POST", "/managed/relay/b1/SEMP", `<rpc><admin><message-spool/></admin></rpc>`, c), http.StatusForbidden, "read_only")
	expect(t, e.do("POST", "/managed/relay/b1/SEMP", strings.Repeat(" ", relayMaxBody)+showRPC, c), http.StatusRequestEntityTooLarge, "too_large")
	if fb.hits() != 0 {
		t.Fatalf("a refused write must never reach the broker (%d calls)", fb.hits())
	}
	if !strings.Contains(e.log.String(), "semp relay refused a write") || !strings.Contains(e.log.String(), "not a show") {
		t.Errorf("refusals are logged: %s", e.log.String())
	}

	// The reads the app makes pass, with their bodies (or none).
	// The broker reads the body as the gateway checked it: the client's
	// Content-Type, and any charset in it, is replaced.
	expect(t, e.do("POST", "/managed/relay/b1/SEMP", showRPC, c, "Content-Type", "text/xml; charset=utf-7"), http.StatusOK, "")
	if up := fb.last(t); up.method != "POST" || up.uri != "/SEMP" || up.body != showRPC || up.header.Get("Content-Type") != relayV1ContentType {
		t.Errorf("v1 show: %+v", up)
	}
	expect(t, e.do("GET", v2, "ignored", c), http.StatusOK, "")
	if up := fb.last(t); up.body != "" {
		t.Errorf("a GET carries no body upstream, got %q", up.body)
	}
	expect(t, e.do("HEAD", v2, "", c), http.StatusOK, "")
	if up := fb.last(t); up.method != "HEAD" {
		t.Errorf("HEAD: %+v", up)
	}
}

func TestIsShowRPC(t *testing.T) {
	cases := []struct {
		body string
		want bool
	}{
		{showRPC, true},
		{`<rpc semp-version="soltr/10_0"><show><version/></show></rpc>`, true},
		{"<?xml version=\"1.0\"?>\n<!-- q --><rpc>\n  <show><queue/></show>\n</rpc>\n", true},
		{``, false},
		{`<show/>`, false},
		{`<rpc/>`, false},
		{`<rpc><admin/></rpc>`, false},
		{`<rpc><show/><show/></rpc>`, false},
		{`<rpc><show/><admin/></rpc>`, false},
		{`<rpc><show/></rpc><rpc><admin/></rpc>`, false},
		{`<rpc>x<show/></rpc>`, false},
		{`<rpc><show/></rpc>trailing`, false},
		{`<rpc><show></rpc>`, false},
		{`<rpc xmlns="urn:x"><show/></rpc>`, false},
		{`<rpc><x:show xmlns:x="urn:x"/></rpc>`, false},
		{`<!DOCTYPE rpc [<!ENTITY e "x">]><rpc><show/></rpc>`, false},
	}
	for _, tc := range cases {
		if got := isShowRPC([]byte(tc.body)); got != tc.want {
			t.Errorf("%q: want %v, got %v", tc.body, tc.want, got)
		}
	}
}

func TestRelay_EntitlementIsTheBrokers(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	c := e.cookie("viewer", false)
	notEntitled := e.do("GET", "/managed/relay/b2/SEMP/v2/monitor/about", "", c)
	unknown := e.do("GET", "/managed/relay/nope/SEMP/v2/monitor/about", "", c)
	expect(t, notEntitled, http.StatusNotFound, "not_found")
	if notEntitled.Body.String() != unknown.Body.String() || unknown.Code != notEntitled.Code {
		t.Error("an unknown broker and one the user may not use must answer alike")
	}
	expect(t, e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", c), http.StatusOK, "")

	// An edit applies to the next call: no entitlement, no relay.
	if _, err := e.api.store.upsertUser(context.Background(), userRec{Username: "viewer", Operate: []permRow{}, ReadOnly: []permRow{}}, ""); err != nil {
		t.Fatal(err)
	}
	expect(t, e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", c), http.StatusNotFound, "not_found")

	// A broker without SEMP has nothing to relay to.
	if err := e.api.store.upsertConnection(connRec{Broker: "b1", Hostname: "h", Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1"}}}}); err != nil {
		t.Fatal(err)
	}
	expect(t, e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/about", "", e.cookie("admin", false)), http.StatusNotFound, "not_found")
	if fb.hits() != 1 {
		t.Errorf("only the entitled call may reach the broker, got %d calls", fb.hits())
	}
	if line := logLine(e.log.String(), "semp relay denied", "user=viewer", "broker=b2"); !strings.Contains(line, "level=INFO") {
		t.Errorf("a refusal is logged at info with the user and the broker: %s", e.log.String())
	}
}

// urlRecorder is a broker transport that notes the URL it was asked for and
// fails: enough to see where the gateway would have gone.
type urlRecorder struct {
	mu   sync.Mutex
	urls []string
}

func (u *urlRecorder) RoundTrip(r *http.Request) (*http.Response, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.urls = append(u.urls, r.URL.String())
	return nil, errors.New("recorded, not sent")
}

func (u *urlRecorder) last(t *testing.T) string {
	t.Helper()
	u.mu.Lock()
	defer u.mu.Unlock()
	if len(u.urls) == 0 {
		t.Fatal("the broker transport was never called")
	}
	return u.urls[len(u.urls)-1]
}

// The relay reaches the broker over the connection's SEMP scheme: https by
// default, http when the record says so.
func TestRelay_UsesTheConnectionsScheme(t *testing.T) {
	for scheme, want := range map[string]string{"": "https://host1:8080/SEMP/v2/monitor/msgVpns", sempPlain: "http://host1:8080/SEMP/v2/monitor/msgVpns"} {
		up := &urlRecorder{}
		e := newManagedEnvWith(t, nil, up)
		if err := e.api.store.upsertConnection(connRec{
			Broker: "b1", Hostname: "host1",
			Semp:   sempRec{Scheme: scheme, Port: "8080", Username: "mon"},
			Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1"}}},
		}); err != nil {
			t.Fatal(err)
		}
		expect(t, e.do("GET", "/managed/relay/b1/SEMP/v2/monitor/msgVpns", "", e.cookie("viewer", false)), http.StatusBadGateway, "upstream_unavailable")
		if got := up.last(t); got != want {
			t.Errorf("scheme %q: the relay asked for %s, want %s", scheme, got, want)
		}
	}
}

func TestRelay_RefusesCrossSiteUpgradesAndForcedChange(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	path := "/managed/relay/b1/SEMP/v2/monitor/about"
	for _, site := range []string{"cross-site", "same-site", "none"} {
		expect(t, e.do("GET", path, "", e.cookie("viewer", false), "Sec-Fetch-Site", site), http.StatusForbidden, "cross_origin")
	}
	expect(t, e.do("GET", path, "", e.cookie("viewer", false), "Connection", "Upgrade", "Upgrade", "websocket"), http.StatusBadRequest, "bad_request")
	expect(t, e.do("GET", path, "", e.cookie("viewer", true)), http.StatusForbidden, "password_change_required")
	if fb.hits() != 0 {
		t.Errorf("none of these may reach the broker (%d calls)", fb.hits())
	}
}

func TestRelay_InFlightCapPerUser(t *testing.T) {
	started, release := make(chan struct{}, 2*relayMaxInFlight), make(chan struct{})
	e, _ := newRelayEnv(t, func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		<-release
		answerJSON(w, r)
	})
	c := e.cookie("viewer", false)
	path := "/managed/relay/b1/SEMP/v2/monitor/about"
	var wg sync.WaitGroup
	for range relayMaxInFlight {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e.do("GET", path, "", c)
		}()
	}
	for range relayMaxInFlight {
		<-started
	}
	rec := e.do("GET", path, "", c)
	expect(t, rec, http.StatusTooManyRequests, "rate_limited")
	if rec.Header().Get("Retry-After") == "" {
		t.Error("want Retry-After")
	}
	if logLine(e.log.String(), "semp relay limited", "user=viewer", "broker=b1") == "" {
		t.Errorf("the cap is logged with the user and the broker: %s", e.log.String())
	}
	close(release)
	wg.Wait()
	expect(t, e.do("GET", path, "", c), http.StatusOK, "")
}

func TestUserCounter(t *testing.T) {
	uc := newUserCounter(2)
	if !uc.acquire("a") || !uc.acquire("a") || uc.acquire("a") {
		t.Fatal("two slots per user")
	}
	if !uc.acquire("b") {
		t.Error("another user has slots of their own")
	}
	uc.release("a")
	if !uc.acquire("a") {
		t.Error("a released slot is free again")
	}
	uc.release("a")
	uc.release("a")
	uc.release("b")
	if len(uc.n) != 0 {
		t.Errorf("idle users leave no entry: %v", uc.n)
	}
}

// errReader fails like a client that went away mid-body.
type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("client went away") }

func TestRelay_UnreadableBodyIs400(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	req := httptest.NewRequest("POST", "https://gw.example/managed/relay/b1/SEMP", errReader{})
	req = req.WithContext(withSession(req.Context(), activeSession{session: session{user: "viewer"}}))
	rec := httptest.NewRecorder()
	e.api.relay.ServeHTTP(rec, req)
	expect(t, rec, http.StatusBadRequest, "bad_request")
	if fb.hits() != 0 {
		t.Error("nothing reaches the broker")
	}
}

// A user deleted after the session gate passed (the request was already in
// flight) gets the same 404 as an unentitled one, and the broker is not called.
func TestRelay_UserDeletedMidRequestIs404(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	req := httptest.NewRequest("GET", "https://gw.example/managed/relay/b1/SEMP/v2/monitor/msgVpns", nil)
	req = req.WithContext(withSession(req.Context(), activeSession{session: session{user: "gone"}}))
	rec := httptest.NewRecorder()
	e.api.relay.ServeHTTP(rec, req)
	expect(t, rec, http.StatusNotFound, "not_found")
	if fb.hits() != 0 {
		t.Error("nothing reaches the broker")
	}
}

// Each relayed SEMP request is an access entry naming the method and the path
// without its query; a refused one is not recorded.
func TestRelay_IsAuditedOnlyWhileAccessIsOn(t *testing.T) {
	e, _ := newRelayEnv(t, answerJSON)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("viewer", false)
	get := "/managed/relay/b1/SEMP/v2/monitor/msgVpns?count=10&where=secret"
	expect(t, e.do("GET", get, "", c), http.StatusOK, "")
	au.expect(t)
	e.setAudit(auditSettings{access: true})
	expect(t, e.do("GET", get, "", c), http.StatusOK, "")
	expect(t, e.do("POST", "/managed/relay/b1/SEMP", showRPC, c), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/relay/b2/SEMP/v2/monitor/msgVpns", "", c), http.StatusNotFound, "not_found")
	expect(t, e.do("DELETE", "/managed/relay/b1/SEMP/v2/config/msgVpns/v1", "", c), http.StatusForbidden, "read_only")
	au.expect(t,
		auditEntry{Actor: "viewer", Action: "relay", Target: "b1", Outcome: "ok", Msg: "viewer relayed GET /SEMP/v2/monitor/msgVpns to b1"},
		auditEntry{Actor: "viewer", Action: "relay", Target: "b1", Outcome: "ok", Msg: "viewer relayed POST /SEMP to b1"},
	)
}
