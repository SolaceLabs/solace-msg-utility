package main

import "testing"

// The glob vectors live in testdata/contract/validation.json ("glob": rows
// of [pattern, value, expected]), so the gateway's entitlement match and the
// app's re-filter (src/core/rbac.ts, which the demo's fake gateway uses and
// tests/mock-broker/gateway/contract.test.ts runs the same rows against) are
// held to one table. Globs are case-sensitive; a trailing segment may not
// overlap the consumed prefix ("a*a" does not match "a").
func TestMatchGlob_Conformance(t *testing.T) {
	rows := readContractVectors(t).Glob
	if len(rows) == 0 {
		t.Fatal("validation.json holds no glob vector")
	}
	for i, row := range rows {
		pattern, okP := row[0].(string)
		value, okV := row[1].(string)
		want, okW := row[2].(bool)
		if !okP || !okV || !okW {
			t.Fatalf("glob row %d: want [pattern, value, expected], got %v", i+1, row)
		}
		if got := matchGlob(pattern, value); got != want {
			t.Errorf("matchGlob(%q, %q) = %v, want %v", pattern, value, got, want)
		}
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
