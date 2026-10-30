package main

import (
	"log/slog"
	"net/http"
	"net/netip"
	"strings"
)

// accessConfig is the client access list from config.yaml (`access:`). It has
// no environment variable. An empty allow list admits every client, which is
// the default; trustedProxies names the reverse proxies whose X-Forwarded-For
// header is believed when resolving the client address.
type accessConfig struct {
	allow          []netip.Prefix
	trustedProxies []netip.Prefix
}

// clientACL wraps next with the access list. With an empty allow list it
// returns next itself, so the default deployment pays nothing. A denied client
// gets a bare 403 with no body: nothing in the response says why, the warn log
// line does. The writer is passed through untouched, so the Hijacker that
// httputil.ReverseProxy needs for WebSocket upgrades still reaches it.
func clientACL(ac accessConfig, next http.Handler, logger *slog.Logger) http.Handler {
	if len(ac.allow) == 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip, ok := clientIP(r.RemoteAddr, r.Header.Values("X-Forwarded-For"), ac.trustedProxies)
		if ok && prefixContains(ac.allow, ip) {
			next.ServeHTTP(w, r)
			return
		}
		client := "unknown"
		if ok {
			client = ip.String()
		}
		logger.Warn("client denied by access list", "client", client, "method", r.Method, "path", r.URL.Path)
		w.WriteHeader(http.StatusForbidden)
	})
}

// clientIP resolves the client address for the access check. The TCP peer is
// the answer unless it is a trusted proxy that sent X-Forwarded-For; then the
// header is walked right to left and the first address that is not itself a
// trusted proxy is the client (a spoofed entry on the left is never reached).
// If every hop is trusted the leftmost one is returned. Any address that does
// not parse fails closed: ok is false and the caller denies.
func clientIP(remoteAddr string, xff []string, trusted []netip.Prefix) (netip.Addr, bool) {
	ap, err := netip.ParseAddrPort(remoteAddr)
	if err != nil {
		return netip.Addr{}, false
	}
	peer := normalizeAddr(ap.Addr())
	if len(xff) == 0 || !prefixContains(trusted, peer) {
		return peer, true
	}
	hops := strings.Split(strings.Join(xff, ","), ",")
	var last netip.Addr
	for i := len(hops) - 1; i >= 0; i-- {
		a, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			return netip.Addr{}, false
		}
		a = normalizeAddr(a)
		if !prefixContains(trusted, a) {
			return a, true
		}
		last = a
	}
	return last, true
}

func prefixContains(ps []netip.Prefix, a netip.Addr) bool {
	for _, p := range ps {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// normalizeAddr makes IPv4-mapped IPv6 addresses compare equal to their IPv4
// form and drops the zone, so a prefix written as 10.0.0.0/8 matches a peer the
// listener reported as ::ffff:10.0.0.5 (Prefix.Contains never matches across
// families or zones).
func normalizeAddr(a netip.Addr) netip.Addr {
	return a.Unmap().WithZone("")
}
