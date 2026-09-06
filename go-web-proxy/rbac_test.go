//go:build managed

package main

import "testing"

// TestMatchGlob_Conformance MUST stay in lockstep with the GLOB_CONFORMANCE
// table in tests/core/rbac.test.ts so the proxy entitlement filter and the
// browser re-filter agree byte-for-byte. Globs are case-sensitive.
func TestMatchGlob_Conformance(t *testing.T) {
	cases := []struct {
		pattern, value string
		want           bool
	}{
		{"*", "anything", true},
		{"*", "", true},
		{"", "", true},
		{"", "x", false},
		{"queue1", "queue1", true},
		{"queue1", "queue2", false},
		{"broker-group*", "broker-group-prod", true},
		{"broker-group*", "other", false},
		{"*prod", "us-prod", true},
		{"*prod", "prod-us", false},
		{"orders.*", "orders.new", true},
		{"orders.*", "ordersXnew", false},
		{"a*b*c", "aXXbYYc", true},
		{"a*b*c", "aXXc", false},
		{"Order*", "order-secret", false},
		{"Order*", "Order-1", true},
	}
	for _, c := range cases {
		if got := matchGlob(c.pattern, c.value); got != c.want {
			t.Errorf("matchGlob(%q, %q) = %v, want %v", c.pattern, c.value, got, c.want)
		}
	}
}

func TestMatchGlob_NoOverlap(t *testing.T) {
	// "a*a" must not match a single "a" (the trailing segment may not overlap
	// the consumed prefix) but must match "aa" and "aba".
	if matchGlob("a*a", "a") {
		t.Error(`"a*a" should not match "a"`)
	}
	if !matchGlob("a*a", "aa") {
		t.Error(`"a*a" should match "aa"`)
	}
	if !matchGlob("a*a", "aba") {
		t.Error(`"a*a" should match "aba"`)
	}
}

func TestEntitled(t *testing.T) {
	u := &userRec{
		Operate:  []permRow{{Brokers: "b1", MsgVpns: "v1", Queues: "*"}},
		ReadOnly: []permRow{{Brokers: "*", MsgVpns: "audit*", Queues: "*"}},
	}
	if !entitled(u, "b1", "v1") {
		t.Error("operate row should entitle b1/v1")
	}
	if !entitled(u, "bX", "audit-1") {
		t.Error("read-only row should entitle anyBroker/audit*")
	}
	if entitled(u, "b1", "v2") {
		t.Error("no row matches b1/v2")
	}
	if entitled(&userRec{}, "b", "v") {
		t.Error("a user with no rows is entitled to nothing")
	}
}
