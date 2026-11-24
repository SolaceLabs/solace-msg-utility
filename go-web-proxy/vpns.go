package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"time"
)

// The Message VPN lookup: POST /managed/connections/vpns asks a broker, over
// SEMP v2, for the names of its Message VPNs, so the connection form can fill
// its list. Administrators only (managedHandler mounts it behind adminOnly).
//
// The broker is the one the form describes, saved or not: its hostname and
// its SEMP scheme, port and account come in the body and are held to the
// rules a save applies. A blank password stands for the stored one, and only
// for the saved connection the body names while its hostname, scheme, port
// and username are the stored ones: a stored credential never goes to an
// address or an account the form changed.
//
// The gateway sends GETs for /SEMP/v2/monitor/msgVpns on the shared upstream
// transport, one page at a time. Like the relay it follows no redirect and
// answers a failure as a generic 502 (upstream_unavailable, upstream_auth)
// with the cause in the log. Of the broker's answer only names reach the
// browser, and of its paging only the cursor is used: the address and path of
// every request are the lookup's own.
const (
	vpnLookupPath     = "/SEMP/v2/monitor/msgVpns"
	vpnLookupPageSize = 100
	vpnLookupMaxPages = 20
	vpnLookupMaxBody  = 1 << 20 // one page of names
	vpnLookupMaxName  = 32      // the broker's own limit on a Message VPN name
)

// vpnLookupNeedsPassword is the reason of the 422 a lookup without a password
// gets when no stored one applies.
const vpnLookupNeedsPassword = "Type the SEMP password. The stored one is used only for a saved connection whose hostname, scheme, port and username are unchanged."

// vpnLookupTimeout bounds one lookup, every page included. A variable so
// tests can shorten it.
var vpnLookupTimeout = 15 * time.Second

// vpnLookupJSON is the POST /managed/connections/vpns body. Broker names the
// saved connection whose stored password a blank semp.pass stands for; it is
// blank for a connection that is not saved yet.
type vpnLookupJSON struct {
	Broker   string   `json:"broker"`
	Hostname string   `json:"hostname"`
	Semp     sempJSON `json:"semp"`
}

// sempVpnPage is the part of a SEMP v2 msgVpns answer the lookup reads.
type sempVpnPage struct {
	Data []struct {
		MsgVpnName string `json:"msgVpnName"`
	} `json:"data"`
	Meta struct {
		Paging struct {
			NextPageURI string `json:"nextPageUri"`
		} `json:"paging"`
	} `json:"meta"`
}

// lookupVpns answers 200 {"vpns": [...]} with the broker's Message VPN names,
// sorted. It runs behind managedHandler's gates (session, throttle, cross-site
// writes, forced password change) and adminOnly, so sessionOf(r) is an
// administrator.
func (rl *sempRelay) lookupVpns(w http.ResponseWriter, r *http.Request) {
	user := sessionOf(r).user
	var body vpnLookupJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	target, field, reason := rl.lookupTarget(body)
	if reason != "" {
		writeInvalid(w, field, reason)
		return
	}
	address := net.JoinHostPort(target.host, target.port)
	if !rl.inFlight.acquire(user) {
		rl.logger.Warn("vpn lookup limited: too many requests in flight", "user", user, "address", address, "max_in_flight", relayMaxInFlight)
		writeRateLimited(w, time.Second)
		return
	}
	defer rl.inFlight.release(user)

	e := auditFor(r, auditVPNLookup)
	e.Target, e.Outcome = address, auditOK
	e.Msg = user + " read the message VPN names of " + address
	rl.audit.record(auditAccess, e)

	ctx, cancel := context.WithTimeout(r.Context(), vpnLookupTimeout)
	defer cancel()
	names, ok := rl.fetchVpns(ctx, w, r, target)
	if !ok {
		return
	}
	rl.logger.Info("vpn lookup", "user", user, "address", address, "vpns", len(names))
	writeJSON(w, http.StatusOK, map[string][]string{"vpns": names})
}

// lookupTarget is the broker a lookup body names and the credential to use
// there, or the field and reason of a 422. A reason never echoes a credential.
func (rl *sempRelay) lookupTarget(b vpnLookupJSON) (t brokerTarget, field, reason string) {
	if !validHost(b.Hostname) {
		return t, "hostname", fmt.Sprintf("hostname %q %s", b.Hostname, hostRule)
	}
	if !schemeOK(b.Semp.Scheme, sempTLS, sempPlain) {
		return t, "semp.scheme", fmt.Sprintf("semp.scheme %q must be %q or %q", b.Semp.Scheme, sempTLS, sempPlain)
	}
	if b.Semp.Port == "" {
		return t, "semp.port", "A SEMP port is required to read the Message VPNs."
	}
	if err := validatePort(b.Semp.Port); err != nil {
		return t, "semp.port", "semp.port " + err.Error()
	}
	if b.Semp.User == "" {
		return t, "semp.user", "A SEMP username is required to read the Message VPNs."
	}
	if !validSempUser(b.Semp.User) {
		return t, "semp.user", "The SEMP username " + sempUserRule + "."
	}
	if hasControl(b.Semp.Pass) {
		return t, "semp.pass", "The SEMP password must not contain control characters."
	}
	scheme, pass := orTLS(b.Semp.Scheme, sempTLS), b.Semp.Pass
	if pass == "" {
		c, found := connectionNamed(rl.store.listConnections(), b.Broker)
		if !found || c.Hostname != b.Hostname || orTLS(c.Semp.Scheme, sempTLS) != scheme ||
			string(c.Semp.Port) != b.Semp.Port || c.Semp.Username != b.Semp.User {
			return t, "semp.pass", vpnLookupNeedsPassword
		}
		pass = c.Semp.Password
	}
	return brokerTarget{scheme: scheme, host: b.Hostname, port: b.Semp.Port, user: b.Semp.User, pass: pass}, "", ""
}

// fetchVpns reads the broker's Message VPN list, page by page, and returns the
// names, sorted and each once. On a failure it has written the 502 and returns
// false. A name the broker could not hold (empty, too long, a control
// character) is left out.
func (rl *sempRelay) fetchVpns(ctx context.Context, w http.ResponseWriter, r *http.Request, t brokerTarget) ([]string, bool) {
	user := sessionOf(r).user
	host := net.JoinHostPort(t.host, t.port)
	seen := map[string]bool{}
	cursor := ""
	for page := 0; ; page++ {
		if page == vpnLookupMaxPages {
			rl.logger.Warn("vpn lookup stopped at its page cap: the list is cut short", "user", user, "address", host, "pages", page)
			break
		}
		q := url.Values{"select": {"msgVpnName"}, "count": {strconv.Itoa(vpnLookupPageSize)}}
		if cursor != "" {
			q.Set("cursor", cursor)
		}
		u := &url.URL{Scheme: t.scheme, Host: host, Path: vpnLookupPath, RawQuery: q.Encode()}
		header := http.Header{}
		header.Set("Accept", "application/json")
		header.Set("User-Agent", relayUserAgent)
		setForwarded(header, r)
		out := (&http.Request{Method: http.MethodGet, URL: u, Host: u.Host, Header: header, Body: http.NoBody}).WithContext(ctx)
		out.SetBasicAuth(t.user, t.pass)
		resp, err := rl.upstream.RoundTrip(out)
		if err != nil {
			rl.logger.Warn("vpn lookup upstream failure", "user", user, "address", host, "err", err)
			writeError(w, http.StatusBadGateway, "upstream_unavailable")
			return nil, false
		}
		var doc sempVpnPage
		status := resp.StatusCode
		if status == http.StatusOK {
			err = json.NewDecoder(io.LimitReader(resp.Body, vpnLookupMaxBody)).Decode(&doc)
		}
		resp.Body.Close()
		switch {
		case status == http.StatusUnauthorized, status == http.StatusForbidden, status == http.StatusProxyAuthRequired:
			rl.logger.Warn("vpn lookup refused by the broker", "user", user, "address", host, "status", status)
			writeError(w, http.StatusBadGateway, "upstream_auth")
			return nil, false
		case status != http.StatusOK || err != nil:
			rl.logger.Warn("vpn lookup got an answer it cannot use", "user", user, "address", host, "status", status, "err", err)
			writeError(w, http.StatusBadGateway, "upstream_unavailable")
			return nil, false
		}
		for _, d := range doc.Data {
			if n := d.MsgVpnName; n != "" && len(n) <= vpnLookupMaxName && !hasControl(n) {
				seen[n] = true
			}
		}
		if cursor = nextCursor(doc.Meta.Paging.NextPageURI); cursor == "" {
			break
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	slices.Sort(names)
	return names, true
}

// nextCursor is the cursor of a broker's nextPageUri, or "" when there is no
// further page. Only the cursor is taken: the address and path of the next
// request are the lookup's own, whatever the broker names.
func nextCursor(nextPageURI string) string {
	u, err := url.Parse(nextPageURI)
	if err != nil {
		return ""
	}
	return u.Query().Get("cursor")
}
