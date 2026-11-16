package main

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

const (
	tlsPath      = "/managed/tls"
	tlsCertPath  = "/managed/tls/certificate"
	tlsCheckPath = "/managed/tls/certificate/check"
	tlsTrustPath = "/managed/tls/trust"
)

func tlsJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// trustDirNames lists the entries of the trust directory (nil when it is not
// there).
func trustDirNames(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, en := range entries {
		names = append(names, en.Name())
	}
	return names
}

// wantTLSUntouched asserts that nothing was written or swapped: the original
// pair is on disk (with no journal or temp beside it) and served, and the
// trust directory holds exactly the named entries.
func (e *managedEnv) wantTLSUntouched(t *testing.T, trust ...string) {
	t.Helper()
	e.tls.wantFiles(t, e.tls.orig)
	if e.tls.served() != fingerprintOf(e.tls.orig.cert) {
		t.Error("the original certificate must still be served")
	}
	if got := trustDirNames(t, e.tls.trustDir); !slices.Equal(got, trust) {
		t.Errorf("trust directory holds %v, want %v", got, trust)
	}
}

// wantNoSecret fails when text holds any of the key's material. A PEM header
// is checked too: no response, log or audit line quotes a key block.
func wantNoSecret(t *testing.T, what, text string, keys ...testCertPair) {
	t.Helper()
	// A refusal names the armour lines in words ("from -----BEGIN PRIVATE KEY-----
	// to ..."), so a key block is a BEGIN line followed by a line break, raw or
	// escaped in JSON.
	if strings.Contains(text, "PRIVATE KEY-----\n") || strings.Contains(text, `PRIVATE KEY-----\n`) {
		t.Errorf("%s holds a private key block", what)
	}
	for _, k := range keys {
		if strings.Contains(text, keyBodyLine(k)) {
			t.Errorf("%s holds key material", what)
		}
	}
}

// putTrustDir makes the trust directory and puts files in it.
func (e *managedEnv) putTrustDir(t *testing.T, files map[string]string) {
	t.Helper()
	if err := os.MkdirAll(e.tls.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for name, content := range files {
		writeFile(t, filepath.Join(e.tls.trustDir, name), content)
	}
}

func decodeState(t *testing.T, rec *httptest.ResponseRecorder) tlsStateJSON {
	t.Helper()
	var s tlsStateJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatalf("want a TLS state body, got %q", rec.Body.String())
	}
	return s
}

func decodeCertAnswer(t *testing.T, rec *httptest.ResponseRecorder) tlsCertJSON {
	t.Helper()
	var a tlsCertAnswerJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &a); err != nil {
		t.Fatalf("want a certificate body, got %q", rec.Body.String())
	}
	return a.Certificate
}

func stateNames(s tlsStateJSON) []string {
	var names []string
	for _, f := range s.Trust {
		names = append(names, f.Name)
	}
	return names
}

// ----- who may call -----------------------------------------------------------------------

// Every route of the page answers a client with no session the one 401 every
// /managed/* path gives, and a signed-in user who is not an administrator 403:
// with a body that would succeed, nothing is written, swapped or restarted.
// The gate's refusal of a write is audited under the action tried.
func TestTLSAPI_EveryRouteNeedsAnAdministrator(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	next := newTestCert(t, testCertSpec{cn: "next"})
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	restarts := 0
	e.api.restart = func() { restarts++ }
	pair := tlsJSON(t, tlsPairJSON{Certificate: next.certPEM, Key: next.keyPEM})
	routes := []struct{ method, path, body string }{
		{"GET", tlsPath, ""},
		{"POST", tlsCheckPath, pair},
		{"PUT", tlsCertPath, pair},
		{"POST", tlsTrustPath, tlsJSON(t, tlsTrustAddJSON{Name: "ca.crt", Certificate: ca.certPEM})},
		{"DELETE", tlsTrustPath + "/ca.crt", ""},
		{"POST", "/managed/restart", ""},
	}
	viewer := e.cookie("viewer", false)
	for _, rt := range routes {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			expect(t, e.do(rt.method, rt.path, rt.body, nil), http.StatusUnauthorized, "unauthenticated")
			expect(t, e.do(rt.method, rt.path, rt.body, viewer), http.StatusForbidden, "forbidden")
		})
	}
	e.wantTLSUntouched(t)
	if restarts != 0 {
		t.Errorf("no restart for a user who is not an administrator, got %d", restarts)
	}
	refused := func(action, target, msg string) auditEntry {
		return auditEntry{Actor: "viewer", Action: action, Target: target, Outcome: auditRefused, Code: "forbidden", Msg: "viewer could not " + msg + ": forbidden"}
	}
	au.expect(t,
		refused("tls.certificate.replace", "", "replace the gateway certificate"),
		refused("tls.trust.add", "", "add a CA certificate file"),
		refused("tls.trust.remove", "ca.crt", "remove the CA certificate file ca.crt"),
		refused("gateway.restart", "", "restart the gateway"),
	)
}

// A body that is not one JSON object of the known fields, or is over the cap,
// is refused before anything is read from it: the same codes as every other
// route.
func TestTLSAPI_MalformedBodiesAreRefusedAndNothingChanges(t *testing.T) {
	e := newManagedEnv(t, nil)
	for _, rt := range []struct{ method, path string }{
		{"POST", tlsCheckPath}, {"PUT", tlsCertPath}, {"POST", tlsTrustPath},
	} {
		t.Run(rt.method+" "+rt.path, func(t *testing.T) {
			expect(t, e.do(rt.method, rt.path, "{", e.admin()), http.StatusBadRequest, "bad_request")
			expect(t, e.do(rt.method, rt.path, `{"certificate":"x","path":"/etc/passwd"}`, e.admin()), http.StatusBadRequest, "bad_request")
			expect(t, e.do(rt.method, rt.path, `{"certificate":"x"} {}`, e.admin()), http.StatusBadRequest, "bad_request")
			big := `{"certificate":"` + strings.Repeat("A", maxBodyBytes) + `"}`
			expect(t, e.do(rt.method, rt.path, big, e.admin()), http.StatusRequestEntityTooLarge, "too_large")
		})
	}
	e.wantTLSUntouched(t)
}

// ----- GET /managed/tls -------------------------------------------------------------------

// The page's first call: the certificate with every field the console shows,
// both writable flags, and the CA files with what each holds. A file that
// cannot be read, or holds no certificate, says so; no path is in the body.
func TestTLSAPI_GetShowsTheCertificateAndTheCAFiles(t *testing.T) {
	e := newManagedEnv(t, nil)
	ca := newTestCert(t, testCertSpec{cn: "corp root", ca: true})
	e.putTrustDir(t, map[string]string{"corp.crt": ca.certPEM, "notes.pem": "no certificate here\n"})
	linked := os.Symlink(filepath.Join(e.tls.trustDir, "gone"), filepath.Join(e.tls.trustDir, "broken.crt")) == nil

	rec := e.do("GET", tlsPath, "", e.admin())
	expect(t, rec, http.StatusOK, "")
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("Cache-Control: %q", rec.Header().Get("Cache-Control"))
	}
	got := decodeState(t, rec)
	if want := e.tls.m.describe(e.tls.orig.cert); !reflect.DeepEqual(got.Certificate, want) {
		t.Errorf("certificate %+v, want %+v", got.Certificate, want)
	}
	if got.Certificate.SHA256 != fingerprintOf(e.tls.orig.cert) || got.Certificate.Subject != "CN=original" || got.Certificate.Expired {
		t.Errorf("certificate fields: %+v", got.Certificate)
	}
	if !got.CertificateWritable || !got.TrustWritable {
		t.Errorf("a writable directory: flags %v %v", got.CertificateWritable, got.TrustWritable)
	}
	want := []string{"corp.crt", "notes.pem"}
	if linked {
		want = []string{"broken.crt", "corp.crt", "notes.pem"}
	}
	if !slices.Equal(stateNames(got), want) {
		t.Fatalf("files %v, want %v", stateNames(got), want)
	}
	for _, f := range got.Trust {
		switch f.Name {
		case "corp.crt":
			if len(f.Certificates) != 1 || f.Certificates[0].Subject != "CN=corp root" || f.Problem != "" {
				t.Errorf("corp.crt: %+v", f)
			}
		case "notes.pem":
			if len(f.Certificates) != 0 || f.Problem == "" {
				t.Errorf("notes.pem holds no certificate and says why: %+v", f)
			}
		case "broken.crt":
			if len(f.Certificates) != 0 || f.Problem == "" {
				t.Errorf("an unreadable file says so: %+v", f)
			}
		}
	}
	if strings.Contains(rec.Body.String(), e.tls.dir) {
		t.Error("a path is in the answer")
	}
	wantNoSecret(t, "the GET body", rec.Body.String(), e.tls.orig)
}

// A read-only mount: the same page, both flags false (the console disables its
// actions).
func TestTLSAPI_GetOfAReadOnlyDirectory(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.tls.readOnly()
	got := decodeState(t, e.do("GET", tlsPath, "", e.admin()))
	if got.CertificateWritable || got.TrustWritable {
		t.Errorf("read-only: flags %v %v", got.CertificateWritable, got.TrustWritable)
	}
	if got.Trust == nil || got.Certificate.SHA256 != fingerprintOf(e.tls.orig.cert) {
		t.Errorf("the certificate and an empty list still show: %+v", got)
	}
}

// ----- POST /managed/tls/certificate/check ------------------------------------------------

func TestTLSAPI_CheckDescribesTheLeafAndWritesNothing(t *testing.T) {
	e := newManagedEnv(t, nil)
	next := newTestCert(t, testCertSpec{cn: "next"})
	body := tlsJSON(t, tlsPairJSON{Certificate: next.certPEM, Key: next.keyPEM})
	rec := e.do("POST", tlsCheckPath, body, e.admin())
	expect(t, rec, http.StatusOK, "")
	if got, want := decodeCertAnswer(t, rec), e.tls.m.describe(next.cert); !reflect.DeepEqual(got, want) {
		t.Errorf("leaf %+v, want %+v", got, want)
	}
	wantNoSecret(t, "the check answer", rec.Body.String(), next)
	e.wantTLSUntouched(t)

	// A check needs no write access: it still answers on a read-only mount.
	e.tls.readOnly()
	expect(t, e.do("POST", tlsCheckPath, body, e.admin()), http.StatusOK, "")
	e.wantTLSUntouched(t)
}

// Verification refuses these on both the check and the replace, 422 invalid
// naming the field: nothing is written or swapped, and no answer repeats a
// key.
func TestTLSAPI_CertificateRefusals(t *testing.T) {
	now := time.Now()
	next := newTestCert(t, testCertSpec{cn: "next"})
	other := newTestCert(t, testCertSpec{cn: "other"})
	expired := newTestCert(t, testCertSpec{cn: "old", notBefore: now.Add(-48 * time.Hour), notAfter: now.Add(-24 * time.Hour)})
	future := newTestCert(t, testCertSpec{cn: "later", notBefore: now.Add(24 * time.Hour), notAfter: now.Add(48 * time.Hour)})
	cases := []struct {
		name, field string
		cert, key   string
	}{
		{"text that is not PEM", "certificate", "hello", next.keyPEM},
		{"no certificate", "certificate", "", next.keyPEM},
		{"a key where the certificate goes", "certificate", next.keyPEM, next.keyPEM},
		{"a certificate with a key after it", "certificate", next.certPEM + next.keyPEM, next.keyPEM},
		{"no key", "key", next.certPEM, ""},
		{"a certificate where the key goes", "key", next.certPEM, next.certPEM},
		{"two keys", "key", next.certPEM, next.keyPEM + next.keyPEM},
		{"a key that does not match", "key", next.certPEM, other.keyPEM},
		{"an expired certificate", "certificate", expired.certPEM, expired.keyPEM},
		{"a certificate not valid yet", "certificate", future.certPEM, future.keyPEM},
	}
	for _, route := range []struct{ method, path string }{{"POST", tlsCheckPath}, {"PUT", tlsCertPath}} {
		for _, c := range cases {
			t.Run(route.method+" "+c.name, func(t *testing.T) {
				e := newManagedEnv(t, nil)
				au := e.withAudit(t, auditSettings{})
				rec := e.do(route.method, route.path, tlsJSON(t, tlsPairJSON{Certificate: c.cert, Key: c.key}), e.admin())
				expect(t, rec, http.StatusUnprocessableEntity, "invalid")
				if got := errorCode(t, rec); got.Field != c.field || got.Reason == "" {
					t.Errorf("field %q reason %q, want field %q and a reason", got.Field, got.Reason, c.field)
				}
				wantNoSecret(t, "the refusal", rec.Body.String(), next, other, expired, future)
				e.wantTLSUntouched(t)
				if route.method == "PUT" {
					entries := au.entries(t)
					if len(entries) != 1 || entries[0].Outcome != auditRefused || entries[0].Code != "invalid" {
						t.Fatalf("one refused entry: %+v", entries)
					}
					raw, _ := os.ReadFile(au.path)
					wantNoSecret(t, "the audit log", string(raw), next, other, expired, future)
				}
				wantNoSecret(t, "the application log", e.log.String()+e.tls.log.String(), next, other, expired, future)
			})
		}
	}
}

// ----- PUT /managed/tls/certificate --------------------------------------------------------

// A replacement is live when the answer arrives: both files hold the new pair,
// the listener serves it, the audit line names the subject and the expiry and
// no key is in the answer, the audit trail or either log.
func TestTLSAPI_ReplaceWritesSwapsAndAudits(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	next := newTestCert(t, testCertSpec{cn: "next"})
	rec := e.do("PUT", tlsCertPath, tlsJSON(t, tlsPairJSON{Certificate: next.certPEM, Key: next.keyPEM}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeCertAnswer(t, rec)
	if want := e.tls.m.describe(next.cert); !reflect.DeepEqual(got, want) {
		t.Errorf("answer %+v, want %+v", got, want)
	}
	e.tls.wantFiles(t, next)
	if e.tls.served() != fingerprintOf(next.cert) {
		t.Error("the new certificate is served at once")
	}
	au.expect(t, auditEntry{
		Actor: "admin", Action: "tls.certificate.replace", Outcome: auditOK,
		Msg: "admin replaced the gateway certificate (subject CN=next, expires " + got.NotAfter + ")",
	})
	raw, _ := os.ReadFile(au.path)
	wantNoSecret(t, "the audit log", string(raw), next)
	wantNoSecret(t, "the answer", rec.Body.String(), next)
	wantNoSecret(t, "the application log", e.log.String()+e.tls.log.String(), next)
}

// The refusals that come after verification, each with the pair and the
// served certificate as they were, the audit line saying refused with the
// code, and the cause of a failed write in the log only.
func TestTLSAPI_ReplaceRefusalsAfterVerification(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(e *managedEnv)
		status int
		code   string
		cause  string
	}{
		{"a read-only directory", func(e *managedEnv) { e.tls.readOnly() }, http.StatusConflict, "tls_read_only", ""},
		{"a write that fails", func(e *managedEnv) {
			e.tls.m.seams.journal = failAfter(stepRename, errors.New("no space left on device"))
		}, http.StatusInternalServerError, "tls_write_failed", "no space left on device"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			au := e.withAudit(t, auditSettings{})
			c.setup(e)
			next := newTestCert(t, testCertSpec{cn: "next"})
			rec := e.do("PUT", tlsCertPath, tlsJSON(t, tlsPairJSON{Certificate: next.certPEM, Key: next.keyPEM}), e.admin())
			expect(t, rec, c.status, c.code)
			e.wantTLSUntouched(t)
			if c.cause != "" {
				if strings.Contains(rec.Body.String(), c.cause) {
					t.Errorf("the answer carries no cause: %s", rec.Body.String())
				}
				if !strings.Contains(e.tls.log.String(), c.cause) {
					t.Errorf("the cause is in the log: %s", e.tls.log.String())
				}
			}
			au.expect(t, auditEntry{
				Actor: "admin", Action: "tls.certificate.replace", Outcome: auditRefused, Code: c.code,
				Msg: "admin could not replace the gateway certificate: " + c.code,
			})
			raw, _ := os.ReadFile(au.path)
			wantNoSecret(t, "the audit log", string(raw), next)
			wantNoSecret(t, "the application log", e.log.String()+e.tls.log.String(), next)
		})
	}
}

// ----- POST /managed/tls/trust --------------------------------------------------------------

// A file added without a name gets one from the subject; the answer is the page
// body with the new file in it, the pool has changed, and the audit line names
// the file the gateway chose.
func TestTLSAPI_AddTrustDerivesTheNameAndAudits(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	ca := newTestCert(t, testCertSpec{cn: "My Root CA", ca: true})
	before := e.tls.m.trust.get().pool
	rec := e.do("POST", tlsTrustPath, tlsJSON(t, tlsTrustAddJSON{Certificate: ca.certPEM}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeState(t, rec)
	if !slices.Equal(stateNames(got), []string{"my-root-ca.crt"}) || len(got.Trust[0].Certificates) != 1 || got.Trust[0].Certificates[0].SHA256 != fingerprintOf(ca.cert) {
		t.Fatalf("answer %+v", got)
	}
	if !got.CertificateWritable || !got.TrustWritable {
		t.Errorf("the answer is the page body: %+v", got)
	}
	if e.tls.m.trust.get().pool == before {
		t.Error("the new CA is trusted at once")
	}
	if data := mustRead(t, filepath.Join(e.tls.trustDir, "my-root-ca.crt")); !strings.Contains(string(data), "BEGIN CERTIFICATE") {
		t.Error("the file holds the certificate")
	}
	au.expect(t, auditEntry{
		Actor: "admin", Action: "tls.trust.add", Target: "my-root-ca.crt", Outcome: auditOK,
		Msg: "admin added the CA certificate file my-root-ca.crt",
	})
}

// A given name is kept, and a bundle of two certificates is one file.
func TestTLSAPI_AddTrustWithANameAndABundle(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	a := newTestCert(t, testCertSpec{cn: "a", ca: true})
	b := newTestCert(t, testCertSpec{cn: "b", ca: true})
	rec := e.do("POST", tlsTrustPath, tlsJSON(t, tlsTrustAddJSON{Name: "Corp_1.pem", Certificate: a.certPEM + b.certPEM}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeState(t, rec)
	if !slices.Equal(stateNames(got), []string{"Corp_1.pem"}) || len(got.Trust[0].Certificates) != 2 {
		t.Fatalf("answer %+v", got)
	}
	au.expect(t, auditEntry{
		Actor: "admin", Action: "tls.trust.add", Target: "Corp_1.pem", Outcome: auditOK,
		Msg: "admin added the CA certificate file Corp_1.pem",
	})
}

// Each refusal leaves the directory and the pool as they were; the audit line
// carries the name asked for, and no key (a private key sent as a CA included)
// is repeated anywhere.
func TestTLSAPI_AddTrustRefusals(t *testing.T) {
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	taken := newTestCert(t, testCertSpec{cn: "taken", ca: true})
	cases := []struct {
		name         string
		in           tlsTrustAddJSON
		setup        func(e *managedEnv)
		status       int
		code, field  string
		cause        string
		auditsTarget string
	}{
		{name: "a name with a path", in: tlsTrustAddJSON{Name: "../x.crt", Certificate: ca.certPEM}, status: 422, code: "invalid", field: "name", auditsTarget: "../x.crt"},
		{name: "a name with no extension", in: tlsTrustAddJSON{Name: "corp", Certificate: ca.certPEM}, status: 422, code: "invalid", field: "name", auditsTarget: "corp"},
		{name: "a name with the wrong extension", in: tlsTrustAddJSON{Name: "corp.txt", Certificate: ca.certPEM}, status: 422, code: "invalid", field: "name", auditsTarget: "corp.txt"},
		{name: "a name that starts with a dot", in: tlsTrustAddJSON{Name: ".hidden.crt", Certificate: ca.certPEM}, status: 422, code: "invalid", field: "name", auditsTarget: ".hidden.crt"},
		{name: "a private key sent as a CA", in: tlsTrustAddJSON{Name: "new.crt", Certificate: ca.keyPEM}, status: 422, code: "invalid", field: "certificate", auditsTarget: "new.crt"},
		{name: "a certificate with its key", in: tlsTrustAddJSON{Name: "new.crt", Certificate: ca.certPEM + ca.keyPEM}, status: 422, code: "invalid", field: "certificate", auditsTarget: "new.crt"},
		{name: "text that is not PEM", in: tlsTrustAddJSON{Name: "new.crt", Certificate: "hello"}, status: 422, code: "invalid", field: "certificate", auditsTarget: "new.crt"},
		{name: "no certificate", in: tlsTrustAddJSON{Name: "new.crt"}, status: 422, code: "invalid", field: "certificate", auditsTarget: "new.crt"},
		{name: "a name already there", in: tlsTrustAddJSON{Name: "taken.crt", Certificate: ca.certPEM}, status: 409, code: "exists", auditsTarget: "taken.crt"},
		{name: "a read-only directory", in: tlsTrustAddJSON{Name: "new.crt", Certificate: ca.certPEM}, setup: func(e *managedEnv) { e.tls.readOnly() }, status: 409, code: "tls_read_only", auditsTarget: "new.crt"},
		{name: "a write that fails", in: tlsTrustAddJSON{Name: "new.crt", Certificate: ca.certPEM}, setup: func(e *managedEnv) {
			e.tls.m.seams.write = func(string, []byte, os.FileMode) error { return errors.New("input/output error") }
		}, status: 500, code: "tls_write_failed", cause: "input/output error", auditsTarget: "new.crt"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			au := e.withAudit(t, auditSettings{})
			e.putTrustDir(t, map[string]string{"taken.crt": taken.certPEM})
			if c.setup != nil {
				c.setup(e)
			}
			before := e.tls.m.trust.get().pool
			rec := e.do("POST", tlsTrustPath, tlsJSON(t, c.in), e.admin())
			expect(t, rec, c.status, c.code)
			if got := errorCode(t, rec); got.Field != c.field {
				t.Errorf("field %q, want %q", got.Field, c.field)
			}
			e.wantTLSUntouched(t, "taken.crt")
			if string(mustRead(t, filepath.Join(e.tls.trustDir, "taken.crt"))) != taken.certPEM {
				t.Error("an existing file is never overwritten")
			}
			if e.tls.m.trust.get().pool != before {
				t.Error("the pool is as it was")
			}
			if c.cause != "" {
				if strings.Contains(rec.Body.String(), c.cause) {
					t.Errorf("the answer carries no cause: %s", rec.Body.String())
				}
				if !strings.Contains(e.tls.log.String(), c.cause) {
					t.Errorf("the cause is in the log: %s", e.tls.log.String())
				}
			}
			au.expect(t, auditEntry{
				Actor: "admin", Action: "tls.trust.add", Target: c.auditsTarget, Outcome: auditRefused, Code: c.code,
				Msg: "admin could not add a CA certificate file: " + c.code,
			})
			raw, _ := os.ReadFile(au.path)
			wantNoSecret(t, "the audit log", string(raw), ca)
			wantNoSecret(t, "the answer", rec.Body.String(), ca)
			wantNoSecret(t, "the application log", e.log.String()+e.tls.log.String(), ca)
		})
	}
}

// ----- DELETE /managed/tls/trust/{name} -----------------------------------------------------

func TestTLSAPI_RemoveTrustDeletesTheFileAndAudits(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	a := newTestCert(t, testCertSpec{cn: "a", ca: true})
	b := newTestCert(t, testCertSpec{cn: "b", ca: true})
	e.putTrustDir(t, map[string]string{"a.crt": a.certPEM, "b.pem": b.certPEM})
	before := e.tls.m.trust.get().pool
	rec := e.do("DELETE", tlsTrustPath+"/a.crt", "", e.admin())
	expect(t, rec, http.StatusOK, "")
	if got := decodeState(t, rec); !slices.Equal(stateNames(got), []string{"b.pem"}) {
		t.Fatalf("answer %+v", got)
	}
	if got := trustDirNames(t, e.tls.trustDir); !slices.Equal(got, []string{"b.pem"}) {
		t.Errorf("trust directory holds %v", got)
	}
	if e.tls.m.trust.get().pool == before {
		t.Error("the CA is no longer trusted at once")
	}
	au.expect(t, auditEntry{
		Actor: "admin", Action: "tls.trust.remove", Target: "a.crt", Outcome: auditOK,
		Msg: "admin removed the CA certificate file a.crt",
	})
}

// A name outside the rule is 422 whatever the path says, a name that is not a
// regular file directly in the directory is 404, and every refusal leaves the
// files as they were, the certificate pair and anything outside the trust
// directory included.
func TestTLSAPI_RemoveTrustRefusals(t *testing.T) {
	cases := []struct {
		name, path string
		setup      func(t *testing.T, e *managedEnv)
		status     int
		code       string
		cause      string
		field      string
	}{
		{name: "a name with a path", path: "..%2Ftls.crt", status: 422, code: "invalid", field: "name"},
		{name: "a name with no extension", path: "taken", status: 422, code: "invalid", field: "name"},
		{name: "a name with a space", path: "a%20b.crt", status: 422, code: "invalid", field: "name"},
		{name: "no such file", path: "nothere.crt", status: 404, code: "not_found"},
		{name: "a directory", path: "dir.crt", status: 404, code: "not_found", setup: func(t *testing.T, e *managedEnv) {
			if err := os.Mkdir(filepath.Join(e.tls.trustDir, "dir.crt"), 0o755); err != nil {
				t.Fatal(err)
			}
		}},
		{name: "a read-only directory", path: "taken.crt", status: 409, code: "tls_read_only", setup: func(_ *testing.T, e *managedEnv) { e.tls.readOnly() }},
		{name: "a delete that fails", path: "taken.crt", status: 500, code: "tls_write_failed", cause: "input/output error", setup: func(_ *testing.T, e *managedEnv) {
			e.tls.m.seams.remove = func(string) error { return errors.New("input/output error") }
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			au := e.withAudit(t, auditSettings{})
			taken := newTestCert(t, testCertSpec{cn: "taken", ca: true})
			e.putTrustDir(t, map[string]string{"taken.crt": taken.certPEM})
			if c.setup != nil {
				c.setup(t, e)
			}
			before := e.tls.m.trust.get().pool
			rec := e.do("DELETE", tlsTrustPath+"/"+c.path, "", e.admin())
			expect(t, rec, c.status, c.code)
			if got := errorCode(t, rec); got.Field != c.field {
				t.Errorf("field %q, want %q", got.Field, c.field)
			}
			want := []string{"taken.crt"}
			if c.name == "a directory" {
				want = []string{"dir.crt", "taken.crt"}
			}
			e.wantTLSUntouched(t, want...)
			if e.tls.m.trust.get().pool != before {
				t.Error("the pool is as it was")
			}
			if c.cause != "" {
				if strings.Contains(rec.Body.String(), c.cause) {
					t.Errorf("the answer carries no cause: %s", rec.Body.String())
				}
				if !strings.Contains(e.tls.log.String(), c.cause) {
					t.Errorf("the cause is in the log: %s", e.tls.log.String())
				}
			}
			entries := au.entries(t)
			if len(entries) != 1 || entries[0].Action != "tls.trust.remove" || entries[0].Outcome != auditRefused || entries[0].Code != c.code {
				t.Fatalf("one refused entry with code %q: %+v", c.code, entries)
			}
		})
	}
}

// A link in the directory is never followed: it is not a regular file, so the
// delete says there is no such file and both the link and its target stay.
func TestTLSAPI_RemoveTrustNeverFollowsALink(t *testing.T) {
	e := newManagedEnv(t, nil)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	e.putTrustDir(t, map[string]string{"real.crt": ca.certPEM})
	if err := os.Symlink(filepath.Join(e.tls.trustDir, "real.crt"), filepath.Join(e.tls.trustDir, "link.crt")); err != nil {
		t.Skipf("no symbolic links here: %v", err)
	}
	expect(t, e.do("DELETE", tlsTrustPath+"/link.crt", "", e.admin()), http.StatusNotFound, "not_found")
	e.wantTLSUntouched(t, "link.crt", "real.crt")
}

func TestClip(t *testing.T) {
	if got := clip("abcdef", 3); got != "abc" {
		t.Errorf("a long text is cut: %q", got)
	}
	if got := clip("abc", 3); got != "abc" {
		t.Errorf("a text of the limit is kept: %q", got)
	}
}

// audit.onFailure refuse with an audit log that cannot be written: a certificate
// replacement, a trusted-CA add and a trusted-CA delete are each 503
// audit_unavailable with the pair, the served certificate and the trust
// directory as they were, while reads, the check and Restart gateway go on (a
// restart changes no stored file, and may be what makes the log writable). Once
// the log can be written the refusal's own entry clears the state and the
// change goes through.
func TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	a, _ := e.withLoudAudit(t)
	next := newTestCert(t, testCertSpec{cn: "next"})
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	old := newTestCert(t, testCertSpec{cn: "old", ca: true})
	e.putTrustDir(t, map[string]string{"old.crt": old.certPEM})
	restarts := 0
	e.api.restart = func() { restarts++ }
	pair := tlsJSON(t, tlsPairJSON{Certificate: next.certPEM, Key: next.keyPEM})
	add := tlsJSON(t, tlsTrustAddJSON{Name: "ca.crt", Certificate: ca.certPEM})
	// The audit log cannot be written from here on; the record it loses starts the refusals.
	_ = a.f.Close()
	e.api.audit.record(auditAdmin, auditEntry{Actor: "admin", Action: auditUserCreate, Outcome: auditOK, Msg: "admin created user x"})

	expect(t, e.do("PUT", tlsCertPath, pair, e.admin()), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.do("POST", tlsTrustPath, add, e.admin()), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.do("DELETE", tlsTrustPath+"/old.crt", "", e.admin()), http.StatusServiceUnavailable, "audit_unavailable")
	e.wantTLSUntouched(t, "old.crt")

	expect(t, e.do("GET", tlsPath, "", e.admin()), http.StatusOK, "")
	expect(t, e.do("POST", tlsCheckPath, pair, e.admin()), http.StatusOK, "")
	expect(t, e.do("POST", "/managed/restart", "", e.admin()), http.StatusAccepted, "")
	if restarts != 1 {
		t.Errorf("Restart gateway is not refused: want 1 restart, got %d", restarts)
	}

	a.mu.Lock()
	a.f = nil // the next write reopens the file: space is back
	a.mu.Unlock()
	expect(t, e.do("PUT", tlsCertPath, pair, e.admin()), http.StatusServiceUnavailable, "audit_unavailable") // its refusal line is written and clears the state
	expect(t, e.do("PUT", tlsCertPath, pair, e.admin()), http.StatusOK, "")
	e.tls.wantFiles(t, next)
	lines := fileLines(t, a.path)
	if len(lines) != 2 || !strings.Contains(lines[0], `"action":"tls.certificate.replace"`) || !strings.Contains(lines[0], `"outcome":"refused"`) ||
		!strings.Contains(lines[0], `"code":"audit_unavailable"`) || !strings.Contains(lines[1], `"outcome":"ok"`) {
		t.Errorf("want the refusal audited as audit_unavailable, then the change: %q", lines)
	}
}
