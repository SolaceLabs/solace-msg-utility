package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"
)

const vpnLookupRoute = "/managed/connections/vpns"

// lookupBody is a lookup request for the SEMP endpoint at host:port over https.
func lookupBody(broker, host, port, user, pass string) string {
	return fmt.Sprintf(`{"broker":%q,"hostname":%q,"semp":{"scheme":"https","port":%q,"user":%q,"pass":%q}}`, broker, host, port, user, pass)
}

// brokerAddr is where the fake broker of newRelayEnv listens, as broker b1 is
// stored.
func brokerAddr(t *testing.T, fb *fakeBroker) (host, port string) {
	t.Helper()
	host, port, err := net.SplitHostPort(fb.srv.Listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	return host, port
}

func basicAuth(user, pass string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(user+":"+pass))
}

func TestVPNLookup_ReadsEveryPageWithTheTypedCredential(t *testing.T) {
	e, fb := newRelayEnv(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("cursor") == "" {
			// The next page is named on another host and path: only its cursor is used.
			_, _ = io.WriteString(w, `{"data":[{"msgVpnName":"default"},{"msgVpnName":"beta"},{"msgVpnName":""},`+
				`{"msgVpnName":"a-name-longer-than-a-broker-allows-01"},{"msgVpnName":"bad\u0007name"}],`+
				`"meta":{"paging":{"nextPageUri":"https://elsewhere.example/other/path?count=100&cursor=c2"}}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":[{"msgVpnName":"alpha"},{"msgVpnName":"beta"}],"meta":{}}`)
	})
	host, port := brokerAddr(t, fb)
	rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "typed", "typed-pw"), e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	if got := strings.TrimSpace(rec.Body.String()); got != `{"vpns":["alpha","beta","default"]}` {
		t.Errorf("body: %s", got)
	}
	if fb.hits() != 2 {
		t.Fatalf("want two pages read from the broker, got %d requests", fb.hits())
	}
	fb.mu.Lock()
	first, second := fb.reqs[0], fb.reqs[1]
	fb.mu.Unlock()
	if first.method != "GET" || first.uri != "/SEMP/v2/monitor/msgVpns?count=100&select=msgVpnName" {
		t.Errorf("first request: %s %s", first.method, first.uri)
	}
	if second.uri != "/SEMP/v2/monitor/msgVpns?count=100&cursor=c2&select=msgVpnName" {
		t.Errorf("second request: %s", second.uri)
	}
	for _, up := range []seenRequest{first, second} {
		if up.header.Get("Authorization") != basicAuth("typed", "typed-pw") {
			t.Errorf("upstream Authorization: want the typed credential, got %q", up.header.Get("Authorization"))
		}
		if up.header.Get("Cookie") != "" || up.header.Get("User-Agent") != relayUserAgent || up.header.Get("X-Forwarded-For") != "192.0.2.10" {
			t.Errorf("upstream headers: %v", up.header)
		}
	}
	if logLine(e.log.String(), "level=INFO", "vpn lookup", "user=admin", "vpns=3") == "" {
		t.Errorf("want the lookup logged with its count, got:\n%s", e.log.String())
	}
}

func TestVPNLookup_BlankPasswordIsTheStoredOneOnlyForTheUnchangedSavedConnection(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	c := e.cookie("admin", false)

	rec := e.do("POST", vpnLookupRoute, lookupBody("b1", host, port, "mon", ""), c)
	expect(t, rec, http.StatusOK, "")
	if got := strings.TrimSpace(rec.Body.String()); got != `{"vpns":[]}` {
		t.Errorf("body: %s", got)
	}
	if got := fb.last(t).header.Get("Authorization"); got != basicAuth("mon", "semp-pw") {
		t.Errorf("upstream Authorization: want the stored credential, got %q", got)
	}

	// Anything the form changed, or a connection that is not saved, needs the
	// password typed: the stored one never goes anywhere else.
	for name, body := range map[string]string{
		"not saved":        lookupBody("", host, port, "mon", ""),
		"unknown broker":   lookupBody("b9", host, port, "mon", ""),
		"another username": lookupBody("b1", host, port, "other", ""),
		"another port":     lookupBody("b1", host, "1", "mon", ""),
		"another hostname": lookupBody("b1", "elsewhere.example", port, "mon", ""),
		"another scheme":   strings.Replace(lookupBody("b1", host, port, "mon", ""), `"https"`, `"http"`, 1),
		"another URL path": strings.Replace(lookupBody("b1", host, port, "mon", ""), `"port"`, `"urlPath":"/other","port"`, 1),
	} {
		rec := e.do("POST", vpnLookupRoute, body, c)
		expect(t, rec, http.StatusUnprocessableEntity, "invalid")
		if got := errorCode(t, rec); got.Field != "semp.pass" || got.Reason != vpnLookupNeedsPassword {
			t.Errorf("%s: field %q, reason %q", name, got.Field, got.Reason)
		}
	}
	if fb.hits() != 1 {
		t.Errorf("a refused lookup reached the broker: %d requests", fb.hits())
	}
}

// The lookup asks under the form's SEMP URL path, and the stored password
// stands in only while that path is the saved one.
func TestVPNLookup_GoesUnderTheURLPath(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	c := e.cookie("admin", false)
	putConn(t, e.api.store, connRec{
		Broker: "b1", Hostname: host,
		Semp:   sempRec{Port: flexStr(port), URLPath: "/proxy/b1", Username: "mon", Password: "semp-pw"},
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1", Password: "vpn-pw"}}},
	})
	withPath := func(path string) string {
		return strings.Replace(lookupBody("b1", host, port, "mon", ""), `"port"`, fmt.Sprintf(`"urlPath":%q,"port"`, path), 1)
	}
	expect(t, e.do("POST", vpnLookupRoute, withPath("/proxy/b1"), c), http.StatusOK, "")
	last := fb.last(t)
	if last.uri != "/proxy/b1/SEMP/v2/monitor/msgVpns?count=100&select=msgVpnName" || last.header.Get("Authorization") != basicAuth("mon", "semp-pw") {
		t.Errorf("upstream request: %s with %q", last.uri, last.header.Get("Authorization"))
	}
	if logLine(e.log.String(), "level=INFO", "vpn lookup", "address="+net.JoinHostPort(host, port)+"/proxy/b1") == "" {
		t.Errorf("want the lookup logged with the URL path in its address, got:\n%s", e.log.String())
	}
	for _, path := range []string{"", "/proxy/b2"} {
		rec := e.do("POST", vpnLookupRoute, withPath(path), c)
		expect(t, rec, http.StatusUnprocessableEntity, "invalid")
		if got := errorCode(t, rec); got.Field != "semp.pass" || got.Reason != vpnLookupNeedsPassword {
			t.Errorf("URL path %q: field %q, reason %q", path, got.Field, got.Reason)
		}
	}
	if fb.hits() != 1 {
		t.Errorf("a refused lookup reached the broker: %d requests", fb.hits())
	}
}

func TestVPNLookup_RefusesWhatASaveWouldRefuse(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	c := e.cookie("admin", false)
	body := func(host, scheme, port, user, pass string) string {
		return fmt.Sprintf(`{"broker":"","hostname":%q,"semp":{"scheme":%q,"port":%q,"user":%q,"pass":"%s"}}`, host, scheme, port, user, pass)
	}
	for _, tc := range []struct{ name, body, field, reason string }{
		{"a hostname with a scheme", body("https://h", "https", "943", "mon", "pw"), "hostname", `hostname "https://h" ` + hostRule},
		{"an unknown scheme", body("h", "ftp", "943", "mon", "pw"), "semp.scheme", `semp.scheme "ftp" must be "https" or "http"`},
		{"no port", body("h", "https", "", "mon", "pw"), "semp.port", "A SEMP port is required to read the Message VPNs."},
		{"a port out of range", body("h", "https", "0", "mon", "pw"), "semp.port", `semp.port "0" is not a port (1 to 65535)`},
		{"a URL path that is not one", strings.Replace(body("h", "https", "943", "mon", "pw"), `"port"`, `"urlPath":"semp/","port"`, 1),
			"semp.urlPath", `semp.urlPath "semp/" ` + urlPathRule},
		{"no username", body("h", "https", "943", "", "pw"), "semp.user", "A SEMP username is required to read the Message VPNs."},
		{"a username the broker has none of", body("h", "https", "943", "a:b", "pw"), "semp.user", "The SEMP username " + sempUserRule + "."},
		{"a control character in the password", body("h", "https", "943", "mon", `a\u0007b`), "semp.pass", "The SEMP password must not contain control characters."},
	} {
		rec := e.do("POST", vpnLookupRoute, tc.body, c)
		expect(t, rec, http.StatusUnprocessableEntity, "invalid")
		if got := errorCode(t, rec); got.Field != tc.field || got.Reason != tc.reason {
			t.Errorf("%s: field %q, reason %q", tc.name, got.Field, got.Reason)
		}
	}
	expect(t, e.do("POST", vpnLookupRoute, `{"hostname":"h","extra":1}`, c), http.StatusBadRequest, "bad_request")
	if fb.hits() != 0 {
		t.Errorf("a refused lookup reached the broker: %d requests", fb.hits())
	}
}

func TestVPNLookup_AnswersABrokerFailureAsA502(t *testing.T) {
	status := func(code int) http.HandlerFunc {
		return func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Location", "https://elsewhere.example/")
			w.WriteHeader(code)
		}
	}
	for _, tc := range []struct {
		name   string
		answer http.HandlerFunc
		code   string
		log    string
	}{
		{"a refused credential", status(http.StatusUnauthorized), "upstream_auth", "vpn lookup refused by the broker"},
		{"an account without the right", status(http.StatusForbidden), "upstream_auth", "vpn lookup refused by the broker"},
		{"a broker error", status(http.StatusInternalServerError), "upstream_unavailable", "vpn lookup got an answer it cannot use"},
		{"a redirect, which is not followed", status(http.StatusFound), "upstream_unavailable", "vpn lookup got an answer it cannot use"},
		{"an answer that is not JSON", func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "<html>") }, "upstream_unavailable", "vpn lookup got an answer it cannot use"},
	} {
		e, fb := newRelayEnv(t, tc.answer)
		host, port := brokerAddr(t, fb)
		rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), e.cookie("admin", false))
		expect(t, rec, http.StatusBadGateway, tc.code)
		if fb.hits() != 1 {
			t.Errorf("%s: want one request and no redirect followed, got %d", tc.name, fb.hits())
		}
		if logLine(e.log.String(), "level=WARN", tc.log, "user=admin") == "" {
			t.Errorf("%s: want the cause in the log, got:\n%s", tc.name, e.log.String())
		}
	}
}

func TestVPNLookup_AnUnreachableBrokerIsA502(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	fb.srv.Close()
	rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), e.cookie("admin", false))
	expect(t, rec, http.StatusBadGateway, "upstream_unavailable")
	if logLine(e.log.String(), "level=WARN", "vpn lookup upstream failure", "user=admin") == "" {
		t.Errorf("want the cause in the log, got:\n%s", e.log.String())
	}
}

func TestVPNLookup_GivesUpAfterItsTimeout(t *testing.T) {
	was := vpnLookupTimeout
	vpnLookupTimeout = 20 * time.Millisecond
	t.Cleanup(func() { vpnLookupTimeout = was })
	e, fb := newRelayEnv(t, func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // a broker that never answers
	})
	host, port := brokerAddr(t, fb)
	rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), e.cookie("admin", false))
	expect(t, rec, http.StatusBadGateway, "upstream_unavailable")
}

func TestVPNLookup_StopsAtItsPageCapAndAtAPageItCannotFollow(t *testing.T) {
	// A broker that always names a next page is read vpnLookupMaxPages times.
	e, fb := newRelayEnv(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = fmt.Fprintf(w, `{"data":[{"msgVpnName":"v%s"}],"meta":{"paging":{"nextPageUri":"https://b/SEMP?cursor=n%d"}}}`,
			r.URL.Query().Get("cursor"), len(r.URL.Query().Get("cursor")))
	})
	host, port := brokerAddr(t, fb)
	c := e.cookie("admin", false)
	expect(t, e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), c), http.StatusOK, "")
	if fb.hits() != vpnLookupMaxPages {
		t.Errorf("want %d pages, got %d", vpnLookupMaxPages, fb.hits())
	}
	if logLine(e.log.String(), "level=WARN", "vpn lookup stopped at its page cap", "user=admin") == "" {
		t.Errorf("want the cut list in the log, got:\n%s", e.log.String())
	}

	// A next page whose address cannot be read ends the list at that page.
	e, fb = newRelayEnv(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"data":[{"msgVpnName":"only"}],"meta":{"paging":{"nextPageUri":"https://[bad"}}}`)
	})
	host, port = brokerAddr(t, fb)
	rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	if got := strings.TrimSpace(rec.Body.String()); got != `{"vpns":["only"]}` || fb.hits() != 1 {
		t.Errorf("body %s after %d requests", got, fb.hits())
	}
}

func TestVPNLookup_AdministratorsOnly(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	body := lookupBody("b1", host, port, "mon", "")
	expect(t, e.do("POST", vpnLookupRoute, body, e.cookie("viewer", false)), http.StatusForbidden, "forbidden")
	expect(t, e.do("POST", vpnLookupRoute, body, nil), http.StatusUnauthorized, "unauthenticated")
	// Only POST is the lookup: the same path is no connection to read.
	expect(t, e.do("GET", vpnLookupRoute, "", e.cookie("admin", false)), http.StatusNotFound, "not_found")
	if fb.hits() != 0 {
		t.Errorf("a refused lookup reached the broker: %d requests", fb.hits())
	}
}

func TestVPNLookup_InFlightCapPerUser(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	rl := e.api.relay.(*sempRelay)
	for range relayMaxInFlight {
		rl.inFlight.acquire("admin")
	}
	rec := e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), e.cookie("admin", false))
	expect(t, rec, http.StatusTooManyRequests, "rate_limited")
	if rec.Header().Get("Retry-After") == "" {
		t.Error("want Retry-After")
	}
	if logLine(e.log.String(), "level=WARN", "vpn lookup limited", "user=admin") == "" || fb.hits() != 0 {
		t.Errorf("want the limit logged and no request sent (%d sent), got:\n%s", fb.hits(), e.log.String())
	}
}

func TestVPNLookup_IsAuditedOnlyWhileAccessIsOn(t *testing.T) {
	e, fb := newRelayEnv(t, answerJSON)
	host, port := brokerAddr(t, fb)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("admin", false)
	expect(t, e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), c), http.StatusOK, "")
	au.expect(t)
	e.setAudit(auditSettings{access: true})
	expect(t, e.do("POST", vpnLookupRoute, lookupBody("", host, port, "mon", "pw"), c), http.StatusOK, "")
	// A lookup refused before it reaches the broker is no broker access.
	expect(t, e.do("POST", vpnLookupRoute, lookupBody("", host, "", "mon", "pw"), c), http.StatusUnprocessableEntity, "invalid")
	address := net.JoinHostPort(host, port)
	au.expect(t, auditEntry{
		Actor: "admin", Action: "vpns.lookup", Target: address, Outcome: "ok",
		Msg: "admin read the message VPN names of " + address,
	})
}
