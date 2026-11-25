package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"html/template"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"rsc.io/qr"
)

// Two-factor sign-in with a time-based one-time password (RFC 6238: HMAC-SHA-1,
// 6 digits, 30 second steps, counted from the Unix epoch), the form every
// authenticator app speaks. The functions here are pure except the replay
// guard and the generators; the sign-in pages (pages.go) and the store
// (store.go) call them and own every decision about what a result means.
//
// Nothing here logs, and no error carries a secret, a code or a recovery code.

// The values of login.twoFactor: whether the gateway asks for a second step at
// sign-in. optional is the default, also for a file or backup without the key.
// There is no value that asks nobody: two-factor is always available.
const (
	twoFactorOptional  = "optional"
	twoFactorAdmins    = "admins"
	twoFactorMandatory = "mandatory"
)

// checkTwoFactor validates a login.twoFactor value as the file holds it; the
// empty value (a file or backup from before the key) is the default.
func checkTwoFactor(v string) (string, error) {
	switch v {
	case "":
		return twoFactorOptional, nil
	case twoFactorOptional, twoFactorAdmins, twoFactorMandatory:
		return v, nil
	}
	return "", fmt.Errorf("key %q has invalid value %q: must be %q, %q or %q", "login.twoFactor", v, twoFactorOptional, twoFactorAdmins, twoFactorMandatory)
}

// twoFactorOrDefault is the login.twoFactor a config holds: the zero value of
// a config built without it is the default.
func twoFactorOrDefault(v string) string {
	if v == "" {
		return twoFactorOptional
	}
	return v
}

// The stages of a sign-in ticket (session.go) and the answers of need: a
// ticket waits for a code at sign-in (code), for the first confirmation of a
// new secret (enrol) or for the confirmation of a replacement secret asked by
// a signed-in user (setup).
const (
	stageCode  = "code"
	stageEnrol = "enrol"
	stageSetup = "setup"
)

// need is the one rule both gateways apply once a password has matched: what
// the sign-in still owes. It returns "" (nothing, open the session), stageCode
// (a code from the user's authenticator) or stageEnrol (set two-factor up
// first). optional (also the answer for a mode that is not set) asks only the
// enrolled.
func need(mode string, isAdmin, enrolled bool) string {
	switch mode {
	case twoFactorAdmins:
		if enrolled {
			return stageCode
		}
		if isAdmin {
			return stageEnrol
		}
	case twoFactorMandatory:
		if enrolled {
			return stageCode
		}
		return stageEnrol
	}
	if enrolled {
		return stageCode
	}
	return ""
}

// ----- the code ----------------------------------------------------------------------

const (
	totpDigits      = 6
	totpPeriod      = 30 * time.Second
	totpSecretBytes = 20 // 160 bits, the size of the SHA-1 output
	totpSkew        = 1  // steps accepted either side of the current one
)

// totpEncoding is base32 as authenticator apps expect it: RFC 4648 alphabet,
// upper case, no padding (20 bytes are 32 characters).
var totpEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

// totpStepAt is the 30 second step a time falls in.
func totpStepAt(t time.Time) int64 { return t.Unix() / int64(totpPeriod/time.Second) }

// totpShaped reports whether s is exactly 6 ASCII digits: the shape of a code
// from an authenticator, as opposed to a recovery code.
func totpShaped(s string) bool {
	if len(s) != totpDigits {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// totpCode is the code for a base32 secret at a step (RFC 4226 dynamic
// truncation of HMAC-SHA-1 over the big-endian step).
func totpCode(secret string, step int64) (string, error) {
	key, err := totpEncoding.DecodeString(secret)
	if err != nil {
		return "", fmt.Errorf("the two-factor secret is not base32: %w", err)
	}
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	mac := hmac.New(sha1.New, key)
	mac.Write(msg[:]) // a hash.Hash never fails to write
	sum := mac.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	bin := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", totpDigits, bin%1000000), nil
}

// totpVerify checks code against the steps now-1, now and now+1 and returns
// the step it matched. A code of the wrong length or with a non-digit never
// matches. Every step is compared, in constant time, whatever matches first.
func totpVerify(secret, code string, now time.Time) (int64, bool) {
	if !totpShaped(code) {
		return 0, false
	}
	cur := totpStepAt(now)
	var matched int64
	found := false
	for step := cur - totpSkew; step <= cur+totpSkew; step++ {
		want, err := totpCode(secret, step)
		if err != nil {
			return 0, false
		}
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			matched, found = step, true
		}
	}
	return matched, found
}

// totpGuard refuses a replayed code: per user it remembers the last step it
// accepted and refuses that step and any below it. In memory, so a restart
// forgets it (a code is then good for at most the rest of its window).
type totpGuard struct {
	mu   sync.Mutex
	last map[string]int64
}

func newTOTPGuard() *totpGuard { return &totpGuard{last: map[string]int64{}} }

// check verifies code for user against secret at now and, when it is valid and
// newer than the last accepted step, records it. The verdict and the record are
// one step under the lock, so two concurrent uses of one code cannot both pass.
func (g *totpGuard) check(user, secret, code string, now time.Time) bool {
	step, ok := totpVerify(secret, code, now)
	if !ok {
		return false
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if last, seen := g.last[user]; seen && step <= last {
		return false
	}
	g.last[user] = step
	return true
}

// forget drops what the guard knows of user: their secret was replaced or
// removed, so the steps counted for the old one mean nothing for the next.
func (g *totpGuard) forget(user string) {
	g.mu.Lock()
	delete(g.last, user)
	g.mu.Unlock()
}

// ----- secret and URI ----------------------------------------------------------------

// newTOTPSecret is a new random secret, base32 (32 characters).
func newTOTPSecret() string {
	b := make([]byte, totpSecretBytes)
	rand.Read(b) // never fails: since Go 1.24 it crashes the process instead
	return totpEncoding.EncodeToString(b)
}

const totpIssuer = "Solace Message Utility"

// totpURI is the otpauth URI an authenticator app reads from the QR code. The
// label is issuer and user, percent-encoded (a space as %20, never +).
func totpURI(user, secret string) string {
	esc := func(s string) string { return strings.ReplaceAll(url.QueryEscape(s), "+", "%20") }
	return "otpauth://totp/" + esc(totpIssuer) + ":" + esc(user) +
		"?secret=" + secret + "&issuer=" + esc(totpIssuer) +
		"&algorithm=SHA1&digits=" + strconv.Itoa(totpDigits) + "&period=" + strconv.Itoa(int(totpPeriod/time.Second))
}

// groupSecret shows a secret in groups of four characters separated by single
// spaces, for typing it into an app by hand.
func groupSecret(secret string) string {
	var b strings.Builder
	for i := 0; i < len(secret); i += 4 {
		if i > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(secret[i:min(i+4, len(secret))])
	}
	return b.String()
}

// ----- recovery codes ----------------------------------------------------------------

const (
	recoveryCount    = 10
	recoveryLength   = 16
	recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 32 characters, none that read alike
)

// newRecoveryCodes makes recoveryCount codes of recoveryLength characters, in
// their normalised form. formatRecoveryCode shows one; hashRecoveryCode is
// what the store keeps.
func newRecoveryCodes() []string {
	out := make([]string, recoveryCount)
	b := make([]byte, recoveryLength)
	for i := range out {
		rand.Read(b) // never fails: since Go 1.24 it crashes the process instead
		for j := range b {
			b[j] = recoveryAlphabet[b[j]&31] // 32 symbols: no modulo bias
		}
		out[i] = string(b)
	}
	return out
}

// formatRecoveryCode shows a normalised code as XXXX-XXXX-XXXX-XXXX.
func formatRecoveryCode(code string) string {
	parts := make([]string, 0, recoveryLength/4)
	for i := 0; i < len(code); i += 4 {
		parts = append(parts, code[i:min(i+4, len(code))])
	}
	return strings.Join(parts, "-")
}

// normaliseRecoveryCode is a typed code as it is hashed: upper case, hyphens
// and spaces removed.
func normaliseRecoveryCode(s string) string {
	return strings.NewReplacer("-", "", " ", "").Replace(strings.ToUpper(s))
}

// hashRecoveryCode is the lower-case hex SHA-256 of the normalised code. The
// codes are random and long, so a fast hash is enough: there is nothing to
// guess from.
func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(normaliseRecoveryCode(code)))
	return hex.EncodeToString(sum[:])
}

// hashRecoveryCodes is hashRecoveryCode of each, in order.
func hashRecoveryCodes(codes []string) []string {
	out := make([]string, len(codes))
	for i, c := range codes {
		out[i] = hashRecoveryCode(c)
	}
	return out
}

// recoveryIndex is where hash is in a stored list, or -1. Every entry is
// compared, in constant time, so the answer does not depend on the position.
func recoveryIndex(stored []string, hash string) int {
	at := -1
	for i, h := range stored {
		if subtle.ConstantTimeCompare([]byte(h), []byte(hash)) == 1 {
			at = i
		}
	}
	return at
}

// ----- QR code -----------------------------------------------------------------------

const qrQuiet = 4 // modules of white around the code, as the standard asks

// qrPixels is how many pixels one module is drawn as; the viewBox scales it.
const qrPixels = 6

// qrSVG draws text as a QR code (error correction M) in inline SVG: one unit
// per module, a quiet zone of qrQuiet modules, black on white. The markup has
// no script and no external reference, so the pages' content policy (no
// script, no image source) allows it, and it holds only what qr.Encode drew,
// never user text: the label and the numbers are fixed.
func qrSVG(text string) (template.HTML, error) {
	code, err := qr.Encode(text, qr.M)
	if err != nil {
		return "", fmt.Errorf("cannot draw the QR code: %w", err)
	}
	side := code.Size + 2*qrQuiet
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %[1]d %[1]d" width="%[2]d" height="%[2]d" shape-rendering="crispEdges" role="img" aria-label="QR code for your authenticator app">`, side, side*qrPixels)
	fmt.Fprintf(&b, `<rect width="%[1]d" height="%[1]d" fill="#fff"/><path fill="#000" d="`, side)
	for y := 0; y < code.Size; y++ {
		for x := 0; x < code.Size; x++ {
			if !code.Black(x, y) {
				continue
			}
			run := 1
			for x+run < code.Size && code.Black(x+run, y) {
				run++
			}
			fmt.Fprintf(&b, "M%d %dh%dv1h-%dz", x+qrQuiet, y+qrQuiet, run, run)
			x += run - 1
		}
	}
	b.WriteString(`"/></svg>`)
	return template.HTML(b.String()), nil
}
