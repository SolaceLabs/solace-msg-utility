package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Stored password format: pbkdf2-sha256$<iterations>$<salt>$<key>, salt and
// key in unpadded standard base64. The iteration count travels with the hash,
// so raising passwordIter later only affects passwords set afterwards.
const (
	passwordScheme    = "pbkdf2-sha256"
	passwordIter      = 600_000 // OWASP 2023 figure for PBKDF2-HMAC-SHA256
	passwordMaxIter   = 10_000_000
	passwordSaltBytes = 16
	passwordKeyBytes  = 32
	passwordMinLen    = 12
	passwordMaxLen    = 128
)

var errPasswordPolicy = fmt.Errorf("password must be %d to %d characters", passwordMinLen, passwordMaxLen)

// checkPasswordPolicy is the one rule a new password must pass. The upper bound
// also caps the work a single hash costs.
func checkPasswordPolicy(pw string) error {
	if n := utf8.RuneCountInString(pw); n < passwordMinLen || n > passwordMaxLen {
		return errPasswordPolicy
	}
	return nil
}

// hasher makes and checks password hashes. iter is the cost of new hashes;
// slots bounds how many run at once (half of GOMAXPROCS, newManagedRouting),
// so a burst of sign-ins, exports or imports leaves the other half of the
// CPU to the relay, the sockets and the files. dummy is checked for an
// unknown username, so the response time does not say whether the user
// exists.
type hasher struct {
	iter  int
	slots chan struct{}
	dummy string
}

func newHasher(iter, concurrency int) (*hasher, error) {
	h := &hasher{iter: iter, slots: make(chan struct{}, max(concurrency, 1))}
	dummy, err := h.hash(context.Background(), rand.Text())
	if err != nil {
		return nil, err
	}
	h.dummy = dummy
	return h, nil
}

// acquire takes a hashing slot, or gives up when the request goes away.
func (h *hasher) acquire(ctx context.Context) error {
	select {
	case h.slots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *hasher) release() { <-h.slots }

func (h *hasher) hash(ctx context.Context, pw string) (string, error) {
	salt := make([]byte, passwordSaltBytes)
	rand.Read(salt) // never fails: since Go 1.24 it crashes the process instead
	if err := h.acquire(ctx); err != nil {
		return "", err
	}
	defer h.release()
	key, err := pbkdf2.Key(sha256.New, pw, salt, h.iter, passwordKeyBytes)
	if err != nil {
		return "", err
	}
	enc := base64.RawStdEncoding
	return strings.Join([]string{passwordScheme, strconv.Itoa(h.iter), enc.EncodeToString(salt), enc.EncodeToString(key)}, "$"), nil
}

// verify reports whether pw matches stored. An empty stored value means an
// unknown user: the dummy is checked instead and the answer is always false.
// err is set only when the request went away or the hash could not run.
func (h *hasher) verify(ctx context.Context, stored, pw string) (bool, error) {
	known := stored != ""
	if !known {
		stored = h.dummy
	}
	iter, salt, want, err := parsePasswordHash(stored)
	if err != nil {
		return false, nil // load validation keeps these out of the store
	}
	if err := h.acquire(ctx); err != nil {
		return false, err
	}
	defer h.release()
	got, err := pbkdf2.Key(sha256.New, pw, salt, iter, len(want))
	if err != nil {
		return false, err
	}
	return known && subtle.ConstantTimeCompare(got, want) == 1, nil
}

var errNotPasswordHash = errors.New("not a " + passwordScheme + " password hash")

// parsePasswordHash splits a stored hash. The iteration cap stops an edited
// file from making a single sign-in run for minutes.
func parsePasswordHash(stored string) (iter int, salt, key []byte, err error) {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != passwordScheme {
		return 0, nil, nil, errNotPasswordHash
	}
	iter, err = strconv.Atoi(parts[1])
	if err != nil || iter < 1 || iter > passwordMaxIter {
		return 0, nil, nil, errNotPasswordHash
	}
	enc := base64.RawStdEncoding
	salt, err = enc.DecodeString(parts[2])
	if err != nil || len(salt) == 0 {
		return 0, nil, nil, errNotPasswordHash
	}
	key, err = enc.DecodeString(parts[3])
	if err != nil || len(key) == 0 {
		return 0, nil, nil, errNotPasswordHash
	}
	return iter, salt, key, nil
}
