//go:build managed

package main

import "strings"

// matchGlob reports whether value matches a case-sensitive glob pattern where
// '*' matches any run of characters (including empty) and every other character
// is literal. Mirrors src/core/rbac.ts matchGlob exactly — a shared conformance
// vector (rbac_test.go <-> tests/core/rbac.test.ts) keeps them in lockstep.
func matchGlob(pattern, value string) bool {
	parts := strings.Split(pattern, "*")
	if len(parts) == 1 {
		// No wildcard: exact match.
		return pattern == value
	}
	// First segment must be a prefix; last segment must be a suffix; middle
	// segments must occur in order in between — equivalent to ^p0.*p1.*...pN$.
	if !strings.HasPrefix(value, parts[0]) {
		return false
	}
	pos := len(parts[0])
	for _, seg := range parts[1 : len(parts)-1] {
		idx := strings.Index(value[pos:], seg)
		if idx < 0 {
			return false
		}
		pos += idx + len(seg)
	}
	last := parts[len(parts)-1]
	// Guard against the last segment overlapping already-consumed input
	// (e.g. "a*a" must not match "a").
	if len(value)-pos < len(last) {
		return false
	}
	return strings.HasSuffix(value, last)
}

// anyMatch reports whether any permission row matches the broker+vpn pair.
// Queue globs are NOT considered here: connection-level entitlement is
// broker AND vpn; per-queue gating is enforced client-side.
func anyMatch(rows []permRow, broker, vpn string) bool {
	for _, r := range rows {
		if matchGlob(string(r.Brokers), broker) && matchGlob(string(r.MsgVpns), vpn) {
			return true
		}
	}
	return false
}

// entitled reports whether the user may connect to broker/vpn at all — i.e. any
// operate OR read-only row matches (operate is a superset of read-only).
func entitled(u *userRec, broker, vpn string) bool {
	return anyMatch(u.Operate, broker, vpn) || anyMatch(u.ReadOnly, broker, vpn)
}
