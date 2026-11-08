package main

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestHasher_RoundTripAndFormat(t *testing.T) {
	h := testHasher(t)
	stored := mustHash(t, h, "correct horse battery")
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != passwordScheme || parts[1] != "1" {
		t.Fatalf("stored form: want pbkdf2-sha256$1$salt$key, got %q", stored)
	}
	if again := mustHash(t, h, "correct horse battery"); again == stored {
		t.Error("each hash must carry its own random salt")
	}
	for pw, want := range map[string]bool{"correct horse battery": true, "correct horse batter": false, "": false} {
		if got, err := h.verify(context.Background(), stored, pw); err != nil || got != want {
			t.Errorf("verify(%q): got %v err=%v, want %v", pw, got, err, want)
		}
	}
}

// The cost travels with the hash: a hasher configured for a different cost
// still verifies an older hash, and new hashes use the new cost.
func TestHasher_CostIsReadFromStoredHash(t *testing.T) {
	old := mustHash(t, testHasher(t), "a password here")
	h, err := newHasher(3, 1)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := h.verify(context.Background(), old, "a password here"); !ok {
		t.Error("a 1-iteration hash must verify under a 3-iteration hasher")
	}
	if !strings.HasPrefix(mustHash(t, h, "x"), passwordScheme+"$3$") {
		t.Error("new hashes must use the hasher's cost")
	}
}

// An unknown user is checked against the dummy hash (same work) and is never
// accepted, not even with the dummy's own password.
func TestHasher_UnknownUserUsesDummy(t *testing.T) {
	h := testHasher(t)
	if _, _, _, err := parsePasswordHash(h.dummy); err != nil {
		t.Fatalf("dummy must be a real hash: %v", err)
	}
	if ok, err := h.verify(context.Background(), "", "anything at all"); ok || err != nil {
		t.Errorf("empty stored value: want false/nil, got %v/%v", ok, err)
	}
}

func TestHasher_MalformedStoredValueNeverMatches(t *testing.T) {
	h := testHasher(t)
	for _, stored := range []string{"plaintext", "S1:token", "pbkdf2-sha256$x$c2FsdA$a2V5", "pbkdf2-sha256$1$c2FsdA"} {
		if ok, err := h.verify(context.Background(), stored, "plaintext"); ok || err != nil {
			t.Errorf("%q: want false/nil, got %v/%v", stored, ok, err)
		}
	}
}

func TestParsePasswordHash_Rejects(t *testing.T) {
	cases := map[string]string{
		"wrong scheme":    "bcrypt$1$c2FsdA$a2V5",
		"field count":     "pbkdf2-sha256$1$c2FsdA",
		"iter not number": "pbkdf2-sha256$many$c2FsdA$a2V5",
		"iter zero":       "pbkdf2-sha256$0$c2FsdA$a2V5",
		"iter above cap":  "pbkdf2-sha256$10000001$c2FsdA$a2V5",
		"salt not base64": "pbkdf2-sha256$1$!!$a2V5",
		"salt empty":      "pbkdf2-sha256$1$$a2V5",
		"key not base64":  "pbkdf2-sha256$1$c2FsdA$!!",
		"key empty":       "pbkdf2-sha256$1$c2FsdA$",
	}
	for name, stored := range cases {
		if _, _, _, err := parsePasswordHash(stored); !errors.Is(err, errNotPasswordHash) {
			t.Errorf("%s (%q): want errNotPasswordHash, got %v", name, stored, err)
		}
	}
}

func TestCheckPasswordPolicy(t *testing.T) {
	cases := map[string]bool{
		strings.Repeat("a", 11):  false,
		strings.Repeat("a", 12):  true,
		strings.Repeat("e", 128): true,
		strings.Repeat("a", 129): false,
		// Counted in characters, not bytes: 12 two-byte runes pass.
		strings.Repeat("é", 12): true,
	}
	for pw, ok := range cases {
		if err := checkPasswordPolicy(pw); (err == nil) != ok {
			t.Errorf("len %d: want ok=%v, got %v", len([]rune(pw)), ok, err)
		}
	}
}

// With every slot taken, a request that goes away stops waiting.
func TestHasher_GivesUpWhenRequestGoesAway(t *testing.T) {
	h := &hasher{iter: 1, slots: make(chan struct{}, 1)}
	h.slots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := h.hash(ctx, "some password"); !errors.Is(err, context.Canceled) {
		t.Errorf("hash: want context.Canceled, got %v", err)
	}
	stored := mustHash(t, testHasher(t), "some password")
	if ok, err := h.verify(ctx, stored, "some password"); ok || !errors.Is(err, context.Canceled) {
		t.Errorf("verify: want false/context.Canceled, got %v/%v", ok, err)
	}
}
