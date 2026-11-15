package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"rsc.io/qr"
)

// totpVectors is testdata/contract/totp.json: the RFC 6238 vectors the e2e
// helper tests read too.
type totpVectors struct {
	Secret  string `json:"secret"`
	Vectors []struct {
		Time int64  `json:"time"`
		Code string `json:"code"`
	} `json:"vectors"`
}

func loadTOTPVectors(t *testing.T) totpVectors {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(contractDir, "totp.json"))
	if err != nil {
		t.Fatal(err)
	}
	var v totpVectors
	if err := json.Unmarshal(data, &v); err != nil || len(v.Vectors) == 0 {
		t.Fatalf("totp.json: %v (%d vectors)", err, len(v.Vectors))
	}
	return v
}

// ----- the code ----------------------------------------------------------------------

func TestTOTPCode_RFC6238Vectors(t *testing.T) {
	v := loadTOTPVectors(t)
	if got := totpEncoding.EncodeToString([]byte("12345678901234567890")); got != v.Secret {
		t.Fatalf("the vectors' secret must be the RFC's ASCII secret in base32: %s", got)
	}
	for _, c := range v.Vectors {
		at := time.Unix(c.Time, 0)
		if got, err := totpCode(v.Secret, totpStepAt(at)); err != nil || got != c.Code {
			t.Errorf("time %d: want %s, got %q, %v", c.Time, c.Code, got, err)
		}
		if step, ok := totpVerify(v.Secret, c.Code, at); !ok || step != totpStepAt(at) {
			t.Errorf("time %d: verify want step %d, got %d, %v", c.Time, totpStepAt(at), step, ok)
		}
	}
}

func TestTOTPCode_RefusesASecretThatIsNotBase32(t *testing.T) {
	const bad = "not-base32-lowercase-secret-0189"
	_, err := totpCode(bad, 1)
	if err == nil || strings.Contains(err.Error(), bad) {
		t.Fatalf("want an error that does not repeat the secret, got %v", err)
	}
	if _, ok := totpVerify(bad, "123456", time.Unix(59, 0)); ok {
		t.Error("a secret that is not base32 must verify nothing")
	}
}

// The three steps around now are accepted and report the step they matched;
// two steps away on either side are not.
func TestTOTPVerify_AcceptedWindowAndItsEdges(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	now := time.Unix(1700000010, 0) // the first second of a step
	cur := totpStepAt(now)
	codeAt := func(step int64) string {
		c, err := totpCode(secret, step)
		if err != nil {
			t.Fatal(err)
		}
		return c
	}
	seen := map[string]bool{}
	for d := int64(-2); d <= 2; d++ {
		if seen[codeAt(cur+d)] {
			t.Fatal("two steps of this window share a code; pick another time")
		}
		seen[codeAt(cur+d)] = true
	}
	for d := int64(-1); d <= 1; d++ {
		if step, ok := totpVerify(secret, codeAt(cur+d), now); !ok || step != cur+d {
			t.Errorf("step %+d: want accepted as %d, got %d, %v", d, cur+d, step, ok)
		}
	}
	for _, d := range []int64{-2, 2} {
		if _, ok := totpVerify(secret, codeAt(cur+d), now); ok {
			t.Errorf("step %+d is outside the window and must be refused", d)
		}
	}
	// A clock 29 s into the step still accepts the previous step's code, and
	// 30 s later it no longer does.
	late := time.Unix(cur*30+29, 0)
	if _, ok := totpVerify(secret, codeAt(cur-1), late); !ok {
		t.Error("the previous step must still be accepted at the end of this one")
	}
	if _, ok := totpVerify(secret, codeAt(cur-1), late.Add(31*time.Second)); ok {
		t.Error("the code of two steps ago must be refused")
	}
}

func TestTOTPVerify_RefusesMalformedCodes(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	now := time.Unix(1111111109, 0)
	good, err := totpCode(secret, totpStepAt(now))
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "0818", "08180", "0818044", good + " ", " " + good, good + "\n", good[:5] + "x", "-" + good[1:], "+" + good[1:], good[:3] + " " + good[3:]} {
		if _, ok := totpVerify(secret, bad, now); ok {
			t.Errorf("%q must be refused: it is not exactly 6 digits", bad)
		}
		if totpShaped(bad) {
			t.Errorf("%q is not shaped like a code", bad)
		}
	}
	if !totpShaped(good) || !totpShaped("000000") {
		t.Error("6 digits, leading zeros included, are code-shaped")
	}
}

// ----- the replay guard --------------------------------------------------------------

func TestTOTPGuard_RefusesReplayAndOlderSteps(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	g := newTOTPGuard()
	now := time.Unix(1700000010, 0)
	cur := totpStepAt(now)
	code := func(step int64) string {
		c, _ := totpCode(secret, step)
		return c
	}
	if g.check("alice", secret, "000000x", now) || g.check("alice", secret, "", now) {
		t.Fatal("a malformed code must not pass")
	}
	if !g.check("alice", secret, code(cur), now) {
		t.Fatal("the first use of a valid code must pass")
	}
	if g.check("alice", secret, code(cur), now) {
		t.Error("the same code twice must be refused")
	}
	if g.check("alice", secret, code(cur-1), now) {
		t.Error("an older step than the last accepted one must be refused")
	}
	if !g.check("bob", secret, code(cur), now) {
		t.Error("another user's replay record must not affect this one")
	}
	if !g.check("alice", secret, code(cur+1), now) {
		t.Error("a newer step must pass")
	}
	if g.check("alice", secret, code(cur+1), now.Add(time.Minute)) {
		t.Error("a step stays used however much later it is shown again")
	}
}

// A refused code leaves no record: the right code typed next still passes.
func TestTOTPGuard_AWrongCodeRecordsNothing(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	g := newTOTPGuard()
	now := time.Unix(1700000010, 0)
	good, _ := totpCode(secret, totpStepAt(now))
	n, _ := strconv.Atoi(good)
	wrong := fmt.Sprintf("%06d", (n+1)%1000000)
	if g.check("alice", secret, wrong, now) {
		t.Fatal("a wrong code must be refused")
	}
	if !g.check("alice", secret, good, now) {
		t.Error("a wrong code must not use up the right one")
	}
}

func TestTOTPGuard_ForgetStartsAgain(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	g := newTOTPGuard()
	now := time.Unix(1700000010, 0)
	code, _ := totpCode(secret, totpStepAt(now))
	if !g.check("alice", secret, code, now) {
		t.Fatal("first use must pass")
	}
	g.forget("alice")
	if !g.check("alice", secret, code, now) {
		t.Error("after forget the user's secret is new, so its step counts from nothing")
	}
	g.forget("nobody") // an unknown user is not an error
}

// Two requests carrying one code at once: exactly one passes.
func TestTOTPGuard_ConcurrentUseOfOneCodePassesOnce(t *testing.T) {
	secret := loadTOTPVectors(t).Secret
	g := newTOTPGuard()
	now := time.Unix(1700000010, 0)
	code, _ := totpCode(secret, totpStepAt(now))
	var passed atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if g.check("alice", secret, code, now) {
				passed.Add(1)
			}
		}()
	}
	wg.Wait()
	if passed.Load() != 1 {
		t.Errorf("want exactly one pass, got %d", passed.Load())
	}
}

// ----- secret and URI ----------------------------------------------------------------

func TestNewTOTPSecret_Shape(t *testing.T) {
	re := regexp.MustCompile(`^[A-Z2-7]{32}$`)
	a, b := newTOTPSecret(), newTOTPSecret()
	for _, s := range []string{a, b} {
		if !re.MatchString(s) {
			t.Errorf("want 32 base32 characters, upper case, no padding: %q", s)
		}
		if raw, err := totpEncoding.DecodeString(s); err != nil || len(raw) != 20 {
			t.Errorf("want 20 bytes back, got %d, %v", len(raw), err)
		}
	}
	if a == b {
		t.Error("two secrets must differ")
	}
}

func TestTOTPURI_EscapesTheUsername(t *testing.T) {
	const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	const tail = "?secret=" + secret + "&issuer=Solace%20Message%20Utility&algorithm=SHA1&digits=6&period=30"
	const head = "otpauth://totp/Solace%20Message%20Utility:"
	for user, esc := range map[string]string{
		"alice":             "alice",
		"alice@example.com": "alice%40example.com",
		"a b+c":             "a%20b%2Bc",
	} {
		got := totpURI(user, secret)
		if want := head + esc + tail; got != want {
			t.Errorf("%q:\n got %s\nwant %s", user, got, want)
		}
		u, err := url.Parse(got)
		if err != nil || u.Query().Get("secret") != secret || u.Query().Get("issuer") != totpIssuer {
			t.Errorf("%q: the URI must parse back: %v", user, err)
		}
	}
}

func TestGroupSecret(t *testing.T) {
	if got := groupSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"); got != "GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ" {
		t.Errorf("a full secret is 8 groups of four: %q", got)
	}
	if got := groupSecret("ABCDEFGHIJ"); got != "ABCD EFGH IJ" {
		t.Errorf("a short last group stays short: %q", got)
	}
}

// ----- recovery codes ----------------------------------------------------------------

func TestNewRecoveryCodes_Shape(t *testing.T) {
	codes := newRecoveryCodes()
	if len(codes) != 10 {
		t.Fatalf("want 10 codes, got %d", len(codes))
	}
	shape := regexp.MustCompile(`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$`)
	seen := map[string]bool{}
	for _, c := range codes {
		if !shape.MatchString(c) {
			t.Errorf("want 16 characters of the code alphabet, got %q", c)
		}
		if seen[c] {
			t.Errorf("duplicate code %q", c)
		}
		seen[c] = true
		if f := formatRecoveryCode(c); !regexp.MustCompile(`^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$`).MatchString(f) || strings.ReplaceAll(f, "-", "") != c {
			t.Errorf("display form of %q: %q", c, f)
		}
	}
	if again := newRecoveryCodes(); again[0] == codes[0] {
		t.Error("a second set must differ")
	}
}

func TestRecoveryCode_NormaliseAndHash(t *testing.T) {
	const raw = "ABCDEFGHJKLMNPQR"
	const want = "7cf629bb82226bfb6356859edb341b8f36a74d8997c4fe385dbef6dc85c5c4bb" // sha256 of raw
	for _, typed := range []string{raw, "ABCD-EFGH-JKLM-NPQR", "abcd-efgh-jklm-npqr", " abcd efgh jklm npqr ", "ABCD EFGH-JKLMNPQR"} {
		if got := normaliseRecoveryCode(typed); got != raw {
			t.Errorf("%q normalised to %q", typed, got)
		}
		if got := hashRecoveryCode(typed); got != want {
			t.Errorf("%q hashed to %s, want %s", typed, got, want)
		}
	}
	if hashRecoveryCode("ABCD-EFGH-JKLM-NPQS") == want {
		t.Error("a different code must hash differently")
	}
	if h := hashRecoveryCode("x"); !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(h) {
		t.Errorf("want 64 lower-case hex characters, got %q", h)
	}
}

func TestRecoveryCode_HashListAndIndex(t *testing.T) {
	codes := newRecoveryCodes()
	stored := hashRecoveryCodes(codes)
	if len(stored) != len(codes) {
		t.Fatalf("one hash per code, got %d", len(stored))
	}
	for i, c := range codes {
		if got := recoveryIndex(stored, hashRecoveryCode(formatRecoveryCode(c))); got != i {
			t.Errorf("code %d found at %d", i, got)
		}
	}
	if got := recoveryIndex(stored, hashRecoveryCode("AAAA-AAAA-AAAA-AAAA")); got != -1 {
		t.Errorf("a code not in the list is -1, got %d", got)
	}
	if got := recoveryIndex(nil, stored[0]); got != -1 {
		t.Errorf("an empty list holds nothing, got %d", got)
	}
}

// ----- the rule ----------------------------------------------------------------------

func TestNeed_RuleOverEveryModeAdminAndEnrolment(t *testing.T) {
	cases := []struct {
		mode            string
		admin, enrolled bool
		want            string
	}{
		{twoFactorOptional, false, false, ""},
		{twoFactorOptional, true, false, ""},
		{twoFactorOptional, false, true, stageCode},
		{twoFactorOptional, true, true, stageCode},
		{twoFactorAdmins, false, false, ""},
		{twoFactorAdmins, true, false, stageEnrol},
		{twoFactorAdmins, false, true, stageCode},
		{twoFactorAdmins, true, true, stageCode},
		{twoFactorMandatory, false, false, stageEnrol},
		{twoFactorMandatory, true, false, stageEnrol},
		{twoFactorMandatory, false, true, stageCode},
		{twoFactorMandatory, true, true, stageCode},
		// A config without the key is optional: it asks only the enrolled.
		{"", true, false, ""},
		{"", false, true, stageCode},
	}
	for _, c := range cases {
		if got := need(c.mode, c.admin, c.enrolled); got != c.want {
			t.Errorf("need(%q, admin %v, enrolled %v) = %q, want %q", c.mode, c.admin, c.enrolled, got, c.want)
		}
	}
}

func TestCheckTwoFactor(t *testing.T) {
	for in, want := range map[string]string{"": "optional", "optional": "optional", "admins": "admins", "mandatory": "mandatory"} {
		if got, err := checkTwoFactor(in); err != nil || got != want {
			t.Errorf("%q: want %q, got %q, %v", in, want, got, err)
		}
	}
	for _, bad := range []string{"off", "Off", "on", "true", " admins", "admin", "all"} {
		_, err := checkTwoFactor(bad)
		if err == nil {
			t.Errorf("%q must be refused", bad)
			continue
		}
		for _, want := range []string{`"login.twoFactor"`, strconv.Quote(bad), `"optional"`, `"admins"`, `"mandatory"`} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("%q: error %q lacks %s", bad, err, want)
			}
		}
	}
	if twoFactorOrDefault("") != twoFactorOptional || twoFactorOrDefault(twoFactorAdmins) != twoFactorAdmins {
		t.Error("the zero value is optional; any other value is kept")
	}
}

// ----- the QR code -------------------------------------------------------------------

var qrRun = regexp.MustCompile(`M(\d+) (\d+)h(\d+)v1h-(\d+)z`)

func TestQRSVG_DrawsTheCodeWithItsQuietZone(t *testing.T) {
	const text = "otpauth://totp/Solace%20Message%20Utility:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	html, err := qrSVG(text)
	if err != nil {
		t.Fatal(err)
	}
	svg := string(html)
	// Well formed: it parses as XML to the end.
	dec := xml.NewDecoder(strings.NewReader(svg))
	var root xml.StartElement
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("not well-formed XML: %v\n%s", err, svg)
		}
		if se, ok := tok.(xml.StartElement); ok && root.Name.Local == "" {
			root = se
		}
	}
	code, err := qr.Encode(text, qr.M)
	if err != nil {
		t.Fatal(err)
	}
	side := code.Size + 2*qrQuiet
	attrs := map[string]string{}
	for _, a := range root.Attr {
		attrs[a.Name.Local] = a.Value
	}
	if root.Name.Local != "svg" || attrs["viewBox"] != fmt.Sprintf("0 0 %d %d", side, side) {
		t.Errorf("want an svg whose side is the code (%d) plus 4 modules each side: %v", code.Size, attrs)
	}
	if attrs["role"] != "img" || attrs["aria-label"] != "QR code for your authenticator app" || attrs["shape-rendering"] != "crispEdges" {
		t.Errorf("accessibility and rendering attributes: %v", attrs)
	}
	for _, banned := range []string{"<script", "href", "src=", "onload", "<image", "<style", "javascript:"} {
		if strings.Contains(svg, banned) {
			t.Errorf("the page's content policy allows no %q: %s", banned, svg)
		}
	}
	if !strings.Contains(svg, `<rect width="`+strconv.Itoa(side)+`" height="`+strconv.Itoa(side)+`" fill="#fff"/>`) || !strings.Contains(svg, `fill="#000"`) {
		t.Errorf("black on white: %s", svg)
	}
	// The path draws exactly the code's black modules, none in the quiet zone.
	want := 0
	for y := 0; y < code.Size; y++ {
		for x := 0; x < code.Size; x++ {
			if code.Black(x, y) {
				want++
			}
		}
	}
	got := 0
	for _, m := range qrRun.FindAllStringSubmatch(svg, -1) {
		x, _ := strconv.Atoi(m[1])
		y, _ := strconv.Atoi(m[2])
		run, _ := strconv.Atoi(m[3])
		if m[3] != m[4] || x < qrQuiet || y < qrQuiet || x+run > qrQuiet+code.Size || y >= qrQuiet+code.Size {
			t.Fatalf("a run outside the code area: %v", m)
		}
		for i := 0; i < run; i++ {
			if !code.Black(x-qrQuiet+i, y-qrQuiet) {
				t.Fatalf("a white module drawn black at %d,%d", x-qrQuiet+i, y-qrQuiet)
			}
		}
		got += run
	}
	if got != want {
		t.Errorf("want %d black modules drawn, got %d", want, got)
	}
}

func TestQRSVG_SameTextSameDrawing(t *testing.T) {
	a, errA := qrSVG("otpauth://totp/x:y?secret=AAAA")
	b, errB := qrSVG("otpauth://totp/x:y?secret=AAAA")
	c, errC := qrSVG("otpauth://totp/x:y?secret=BBBB")
	if errA != nil || errB != nil || errC != nil {
		t.Fatal(errA, errB, errC)
	}
	if a != b {
		t.Error("the same text must give the same markup")
	}
	if a == c {
		t.Error("different text must give a different drawing")
	}
}

func TestQRSVG_TextTooLongForACodeIsAnError(t *testing.T) {
	html, err := qrSVG(strings.Repeat("a", 10000))
	if err == nil || html != "" {
		t.Fatalf("want an error and no markup, got %d bytes, %v", len(html), err)
	}
}

// A secret from newTOTPSecret works with the code and verify functions the
// vectors test.
func TestTOTP_NewSecretRoundTripsThroughVerify(t *testing.T) {
	secret := newTOTPSecret()
	now := time.Unix(1700000010, 0)
	code, err := totpCode(secret, totpStepAt(now))
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := totpVerify(secret, code, now); !ok {
		t.Error("a code made for a new secret must verify")
	}
}
