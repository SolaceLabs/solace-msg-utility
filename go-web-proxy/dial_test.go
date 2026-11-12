package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func dialBody(broker, vpn string) string {
	return fmt.Sprintf(`{"broker":%q,"vpn":%q}`, broker, vpn)
}

// The viewer is read-only on b1/v1 and still dials: SMF is how it browses.
// The password is in the body and nowhere in the log.
func TestDial_IssuesTheVPNCredential(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("POST", "/managed/dial", dialBody("b1", "v1"), e.cookie("viewer", false))
	expect(t, rec, http.StatusOK, "")
	if want := `{"smfPath":"/managed/smf/b1/v1","vpn":"v1","user":"u1","pass":"cli-b1v1-pw"}` + "\n"; rec.Body.String() != want {
		t.Errorf("body:\n got %s\nwant %s", rec.Body.String(), want)
	}
	if rec.Header().Get("Content-Type") != "application/json" || rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("headers: %v", rec.Header())
	}
	log := e.log.String()
	if !strings.Contains(log, `msg="dial issued" component=dial user=viewer broker=b1 vpn=v1`) || strings.Contains(log, "cli-b1v1-pw") {
		t.Errorf("log must record the dial without the password:\n%s", log)
	}
}

// smfPath escapes the names, and the SMF gate reads them back.
func TestDial_PathRoundTripsThroughTheGate(t *testing.T) {
	e := newManagedEnv(t, nil)
	if err := e.api.store.upsertConnection(connRec{
		Broker: "b3", Hostname: "host3",
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "a b/c", Username: "u", Password: "p"}}},
	}); err != nil {
		t.Fatal(err)
	}
	rec := e.do("POST", "/managed/dial", dialBody("b3", "a b/c"), e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	var got dialResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	p, ok := parseSMFPath(got.SMFPath)
	if got.SMFPath != "/managed/smf/b3/a%20b%2Fc" || !ok || p.broker != "b3" || p.vpn != "a b/c" {
		t.Errorf("smfPath %q parsed as %+v, %v", got.SMFPath, p, ok)
	}
}

func TestDial_Refusals(t *testing.T) {
	e := newManagedEnv(t, nil)
	c := e.cookie("viewer", false)
	// Unknown and not entitled look the same.
	var first string
	for _, bv := range [][2]string{{"nope", "v1"}, {"b2", "v9"}, {"b1", "v2"}, {"b1", ""}, {"", ""}} {
		rec := e.do("POST", "/managed/dial", dialBody(bv[0], bv[1]), c)
		expect(t, rec, http.StatusNotFound, "not_found")
		if first == "" {
			first = rec.Body.String()
		}
		if rec.Body.String() != first {
			t.Errorf("%v: the 404 differs: %q", bv, rec.Body.String())
		}
	}
	if !strings.Contains(e.log.String(), `msg="dial denied" component=dial user=viewer broker=b2 vpn=v9`) {
		t.Errorf("a denied dial must be logged:\n%s", e.log.String())
	}
	for _, tc := range []struct {
		method, body string
		cookie       *http.Cookie
		headers      []string
		status       int
		code         string
	}{
		{"POST", `{"broker":"b1"`, c, nil, http.StatusBadRequest, "bad_request"},
		{"POST", `{"broker":"b1","vpn":"v1","x":1}`, c, nil, http.StatusBadRequest, "bad_request"},
		{"POST", `{"broker":"` + strings.Repeat("a", maxBodyBytes) + `"}`, c, nil, http.StatusRequestEntityTooLarge, "too_large"},
		{"GET", "", c, nil, http.StatusNotFound, "not_found"},
		{"POST", dialBody("b1", "v1"), c, []string{"Sec-Fetch-Site", "cross-site"}, http.StatusForbidden, "cross_origin"},
		{"POST", dialBody("b1", "v1"), e.cookie("viewer", true), nil, http.StatusForbidden, "password_change_required"},
	} {
		expect(t, e.do(tc.method, "/managed/dial", tc.body, tc.cookie, tc.headers...), tc.status, tc.code)
	}
}

// Dials and SMF upgrades share one window per user.
func TestDial_ConnectsAreRateLimitedPerUser(t *testing.T) {
	e := newManagedEnv(t, nil)
	viewer := e.cookie("viewer", false)
	dial := func(c *http.Cookie) *httptest.ResponseRecorder {
		return e.do("POST", "/managed/dial", dialBody("b1", "v1"), c)
	}
	for range connectsPerWindow {
		expect(t, dial(viewer), http.StatusOK, "")
	}
	rec := dial(viewer)
	expect(t, rec, http.StatusTooManyRequests, "rate_limited")
	if rec.Header().Get("Retry-After") != "60" {
		t.Errorf("Retry-After: %q", rec.Header().Get("Retry-After"))
	}
	expect(t, dial(e.cookie("admin", false)), http.StatusOK, "")
	expect(t, e.do("GET", "/managed/smf/b1/v1", "", viewer, wsHeaders("https://gw.example")...), http.StatusTooManyRequests, "rate_limited")
	e.clock.advance(connectWindow)
	expect(t, dial(viewer), http.StatusOK, "")
}

// A secret marshals as itself and nothing else prints it.
func TestSecret_OnlyJSONCarriesIt(t *testing.T) {
	v := struct{ Pass secret }{Pass: "hunter2-pw"}
	js, err := json.Marshal(v)
	if err != nil || string(js) != `{"Pass":"hunter2-pw"}` {
		t.Fatalf("json: %s, %v", js, err)
	}
	var log strings.Builder
	slog.New(slog.NewTextHandler(&log, nil)).Info("x", "pass", v.Pass, "v", v)
	printed := fmt.Sprintf("%v %+v %#v %s %q", v, v, v, v.Pass, v.Pass) + log.String()
	if strings.Contains(printed, "hunter2") || !strings.Contains(printed, maskedSecret) {
		t.Errorf("printed or logged: %s", printed)
	}
}

// A dial is an access entry: recorded only while audit.access is on, only when
// a credential was issued, and never with the password.
func TestDial_IsAuditedOnlyWhileAccessIsOn(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	c := e.cookie("viewer", false)
	expect(t, e.do("POST", "/managed/dial", dialBody("b1", "v1"), c), http.StatusOK, "")
	au.expect(t)
	e.setAudit(auditSettings{access: true})
	expect(t, e.do("POST", "/managed/dial", dialBody("b1", "v1"), c), http.StatusOK, "")
	expect(t, e.do("POST", "/managed/dial", dialBody("b2", "v9"), c), http.StatusNotFound, "not_found")
	au.expect(t, auditEntry{Actor: "viewer", Action: "dial", Target: "b1/v1", Outcome: "ok", Msg: "viewer dialed b1/v1"})
}
