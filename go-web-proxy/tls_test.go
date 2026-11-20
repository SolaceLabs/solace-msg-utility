package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError + 1}))
}

// namesPath reports whether msg names path, as written or as %q quotes it.
// The gateway's errors quote paths with %q, which doubles every backslash, so
// on Windows a message reads C:\\Users\\... where the path is C:\Users\....
func namesPath(msg, path string) bool {
	return strings.Contains(msg, path) || strings.Contains(msg, strconv.Quote(path))
}

func TestFileExists(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "exists")
	if fileExists(p) {
		t.Fatal("non-existent file reported as existing")
	}
	if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !fileExists(p) {
		t.Fatal("existing file not detected")
	}
}

func TestFormatFingerprint(t *testing.T) {
	got := formatFingerprint([]byte{0xab, 0xcd, 0x01, 0x23})
	const want = "AB:CD:01:23"
	if got != want {
		t.Fatalf("want %q, got %q", want, got)
	}
}

func TestGenerateSelfSigned_CreatesValidKeypair(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "nested", "tls.crt")
	keyPath := filepath.Join(dir, "nested", "tls.key")

	cert, err := generateSelfSigned(certPath, keyPath)
	if err != nil {
		t.Fatalf("generateSelfSigned: %v", err)
	}

	// Cert/key files must exist; their modes are checked below.
	if !fileExists(certPath) || !fileExists(keyPath) {
		t.Fatal("cert/key file not written")
	}

	// Parse the cert and verify the SANs + validity window.
	if len(cert.Certificate) == 0 {
		t.Fatal("no DER in returned Certificate")
	}
	parsed, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("parse cert: %v", err)
	}
	if parsed.Subject.CommonName != "localhost" {
		t.Errorf("CN: want localhost, got %q", parsed.Subject.CommonName)
	}
	if got := parsed.DNSNames; len(got) != 1 || got[0] != "localhost" {
		t.Errorf("DNS SAN: want [localhost], got %v", got)
	}
	hasV6 := false
	for _, ip := range parsed.IPAddresses {
		if ip.Equal(net.IPv6loopback) {
			hasV6 = true
		}
	}
	if !hasV6 {
		t.Errorf("IPAddresses missing ::1, got %v", parsed.IPAddresses)
	}
	hasV4 := false
	for _, ip := range parsed.IPAddresses {
		if ip.Equal(net.IPv4(127, 0, 0, 1)) {
			hasV4 = true
		}
	}
	if !hasV4 {
		t.Errorf("IPAddresses missing 127.0.0.1, got %v", parsed.IPAddresses)
	}
	// The modes are asked for as 0644 and 0600; the umask may narrow them, never widen.
	if runtime.GOOS != "windows" {
		for path, allowed := range map[string]os.FileMode{certPath: 0o644, keyPath: 0o600} {
			info, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			if got := info.Mode().Perm(); got&^allowed != 0 {
				t.Errorf("%s: mode %o, want no more than %o", path, got, allowed)
			}
		}
	}
	// A bootstrap pair: seven days (plus the minute of back-dating), never more.
	if d := parsed.NotAfter.Sub(parsed.NotBefore); d < bootstrapCertValidity || d > bootstrapCertValidity+2*time.Minute {
		t.Errorf("validity window %s, want 7 days", d)
	}
	if left := time.Until(parsed.NotAfter); left > bootstrapCertValidity || left < bootstrapCertValidity-time.Hour {
		t.Errorf("NotAfter %v: want 7 days from now", parsed.NotAfter)
	}
	// NotBefore should be slightly in the past (now - 1 min); allow generous skew.
	if time.Until(parsed.NotBefore) > 0 {
		t.Errorf("NotBefore not in the past: %v", parsed.NotBefore)
	}
}

func TestLoadOrGenerateServerCert_LoadsExisting(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "tls.crt")
	keyPath := filepath.Join(dir, "tls.key")

	// First call creates the material.
	cert1, err := loadOrGenerateServerCert(certPath, keyPath, quietLogger())
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	// Second call must reuse it — compare the DER.
	cert2, err := loadOrGenerateServerCert(certPath, keyPath, quietLogger())
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if string(cert1.Certificate[0]) != string(cert2.Certificate[0]) {
		t.Fatal("second call regenerated instead of loading existing cert")
	}
}

func TestLoadOrGenerateServerCert_RefusesToOverwriteCorruptKeypair(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "tls.crt")
	keyPath := filepath.Join(dir, "tls.key")
	if err := os.WriteFile(certPath, []byte("not a real PEM"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyPath, []byte("also not a PEM"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := loadOrGenerateServerCert(certPath, keyPath, quietLogger())
	if err == nil {
		t.Fatal("expected error when both files exist but fail to parse")
	}
	for _, want := range []string{certPath, keyPath, "refusing to overwrite user-supplied material"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the error lacks %q: %v", want, err)
		}
	}
	// User material must still be on disk -- verifies the no-silent-overwrite contract.
	for path, want := range map[string]string{certPath: "not a real PEM", keyPath: "also not a PEM"} {
		if data, _ := os.ReadFile(path); string(data) != want {
			t.Errorf("%s was overwritten: %q", path, data)
		}
	}
}

// Half a pair is the operator's material (a key whose certificate is not
// issued yet): the start stops, naming both files and the ways out, and the
// file that is there stays as it was.
func TestLoadOrGenerateServerCert_RefusesHalfAPair(t *testing.T) {
	cases := []struct {
		name, present string
	}{
		{"only the certificate", "tls.crt"},
		{"only the key", "tls.key"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			certPath, keyPath := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
			present := filepath.Join(dir, c.present)
			writeFile(t, present, "operator material")
			_, err := loadOrGenerateServerCert(certPath, keyPath, quietLogger())
			if err == nil {
				t.Fatal("want the start refused")
			}
			for _, want := range []string{certPath, keyPath, "Add the missing file", "remove " + present} {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("the error lacks %q: %v", want, err)
				}
			}
			if data, _ := os.ReadFile(present); string(data) != "operator material" {
				t.Error("the operator's file must stay as it was")
			}
		})
	}
}

// writePEM goes through a .partial file: a write that fails leaves neither a
// truncated target nor the partial, and a partial an earlier write left
// behind is replaced, not appended to.
func TestWritePEM_PartialThenRename(t *testing.T) {
	dir := t.TempDir()
	block := &pem.Block{Type: "CERTIFICATE", Bytes: []byte("der")}
	target := filepath.Join(dir, "tls.crt")
	writeFile(t, target+".partial", "left by a write that stopped")
	if err := writePEM(target, 0o644, block); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(target); string(data) != string(pem.EncodeToMemory(block)) {
		t.Errorf("target: %q", data)
	}
	if fileExists(target + ".partial") {
		t.Error("the partial must be renamed into place")
	}

	busy := filepath.Join(dir, "busy")
	if err := os.MkdirAll(filepath.Join(busy, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := writePEM(busy, 0o644, block); err == nil || !strings.Contains(err.Error(), "write "+busy) {
		t.Fatalf("a target the rename cannot replace: want an error naming it, got %v", err)
	}
	if fileExists(busy + ".partial") {
		t.Error("a failed write must remove its partial")
	}

	nowhere := filepath.Join(dir, "missing", "tls.crt")
	if err := writePEM(nowhere, 0o644, block); err == nil || !strings.Contains(err.Error(), "open "+nowhere+".partial") {
		t.Fatalf("a directory that is not there: want an error naming the partial, got %v", err)
	}
}

func TestBuildTrustPool_NoDir(t *testing.T) {
	// Non-existent directory: an empty pool, not an error.
	pool, err := buildTrustPool(filepath.Join(t.TempDir(), "absent"), quietLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pool == nil {
		t.Fatal("nil pool returned")
	}
}

func TestBuildTrustPool_AddsCerts(t *testing.T) {
	trustDir := filepath.Join(t.TempDir(), "trust")
	if err := os.MkdirAll(filepath.Join(trustDir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Each file holds its own certificate, so the pool says which files it read.
	files := map[string]testCertPair{
		"ca.crt":       newTestCert(t, testCertSpec{cn: "crt-ca", ca: true}),
		"ca.pem":       newTestCert(t, testCertSpec{cn: "pem-ca", ca: true}),
		"notes.txt":    newTestCert(t, testCertSpec{cn: "txt-ca", ca: true}),
		"sub/deep.crt": newTestCert(t, testCertSpec{cn: "deep-ca", ca: true}),
	}
	for name, pair := range files {
		if err := os.WriteFile(filepath.Join(trustDir, filepath.FromSlash(name)), []byte(pair.certPEM), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	pool, err := buildTrustPool(trustDir, quietLogger())
	if err != nil {
		t.Fatalf("buildTrustPool: %v", err)
	}
	// A certificate verifies against the pool only when the pool holds it as a root.
	for name, want := range map[string]bool{"ca.crt": true, "ca.pem": true, "notes.txt": false, "sub/deep.crt": false} {
		_, err := files[name].cert.Verify(x509.VerifyOptions{Roots: pool})
		if got := err == nil; got != want {
			t.Errorf("%s trusted: got %v, want %v (%v)", name, got, want, err)
		}
	}
}

func TestBuildTrustPool_RejectsFile(t *testing.T) {
	dir := t.TempDir()
	notADir := filepath.Join(dir, "trust")
	if err := os.WriteFile(notADir, []byte("file"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := buildTrustPool(notADir, quietLogger())
	if err == nil || !strings.Contains(err.Error(), "trust dir "+notADir+" is not a directory") {
		t.Fatalf("a trust dir that is a regular file: want an error naming it, got %v", err)
	}
}

// A trust dir the gateway may not look into stops the start, naming it: a
// /tls mounted owner-only for another user must not quietly leave the broker
// CAs out.
func TestBuildTrustPool_UnreadableDirStopsTheStart(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("directory permissions do not bind on Windows or as root")
	}
	closed := filepath.Join(t.TempDir(), "closed")
	trust := filepath.Join(t.TempDir(), "trust")
	for _, d := range []string{closed, trust} {
		if err := os.Mkdir(d, 0o755); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(d, 0o755) })
		if err := os.Chmod(d, 0); err != nil {
			t.Fatal(err)
		}
	}
	cases := []struct{ name, dir, want string }{
		{"its parent cannot be searched", filepath.Join(closed, "trust"), "stat trust dir"},
		{"it cannot be listed", trust, "read trust dir"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, err := buildTrustPool(c.dir, quietLogger()); err == nil || !strings.Contains(err.Error(), c.want+" "+c.dir) {
				t.Fatalf("want %q naming %s, got %v", c.want, c.dir, err)
			}
		})
	}
}

func TestAppendPEMCerts_CountsCertsSkipsNonCert(t *testing.T) {
	dir := t.TempDir()
	cp := filepath.Join(dir, "src.crt")
	kp := filepath.Join(dir, "src.key")
	if _, err := generateSelfSigned(cp, kp); err != nil {
		t.Fatal(err)
	}
	certPEM, _ := os.ReadFile(cp)
	keyPEM, _ := os.ReadFile(kp)

	pool := x509.NewCertPool()
	// Cert + key concatenated: only the CERTIFICATE block should be added.
	mixed := append(append([]byte{}, certPEM...), keyPEM...)
	if n := appendPEMCerts(pool, mixed); n != 1 {
		t.Errorf("mixed PEM: want 1 cert added, got %d", n)
	}

	// Nothing usable — zero added.
	if n := appendPEMCerts(pool, []byte("no pem here")); n != 0 {
		t.Errorf("garbage: want 0 added, got %d", n)
	}
}

// Generation that cannot write where the pair belongs stops the start, naming
// the path: /tls mounted wrong, or a path that is a directory.
func TestLoadOrGenerateServerCert_UnwritableLocationsStopTheStart(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "file")
	writeFile(t, file, "x")
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatal(err)
	}
	cases := []struct{ name, cert, key, want string }{
		{"the certificate's directory is a file", filepath.Join(file, "tls.crt"), filepath.Join(dir, "a.key"), "mkdir " + file},
		{"the key's directory is a file", filepath.Join(dir, "b.crt"), filepath.Join(file, "tls.key"), "mkdir " + file},
		{"the certificate path is a directory", sub, filepath.Join(dir, "c.key"), "write " + sub},
		{"the key path is a directory", filepath.Join(dir, "d.crt"), sub, "write " + sub},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// A directory counts as present, so the last two go to
			// generateSelfSigned directly: loadOrGenerateServerCert would
			// refuse them as half a pair before writing anything.
			gen := func() error { _, err := loadOrGenerateServerCert(c.cert, c.key, quietLogger()); return err }
			if c.cert == sub || c.key == sub {
				gen = func() error { _, err := generateSelfSigned(c.cert, c.key); return err }
			}
			if err := gen(); err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want an error with %q, got %v", c.want, err)
			}
		})
	}
}

// Files in the trust dir that hold no usable certificate are skipped with a
// warning, never a refusal: a damaged CA, a private key put there by mistake
// and, where symlinks exist, a link to a file that is gone.
func TestBuildTrustPool_SkipsFilesWithoutACertificate(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "damaged.crt"), string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: []byte("not DER")})))
	writeFile(t, filepath.Join(dir, "key.pem"), string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: []byte("not a key")})))
	linked := os.Symlink(filepath.Join(dir, "gone"), filepath.Join(dir, "gone.crt")) == nil

	var buf strings.Builder
	pool, err := buildTrustPool(dir, newCapturingLogger(&buf))
	if err != nil || pool == nil {
		t.Fatalf("want a pool, got %v", err)
	}
	log := buf.String()
	if n := strings.Count(log, "trust file contained no certificates"); n != 2 {
		t.Errorf("want 2 warnings for files without a certificate, got %d: %s", n, log)
	}
	if linked && !strings.Contains(log, "trust file unreadable; skipping") {
		t.Errorf("a dangling link must be skipped with a warning: %s", log)
	}
	if !strings.Contains(log, "added_certs=0") {
		t.Errorf("nothing was added: %s", log)
	}
}

// A generated pair is logged with its fingerprint and its 7-day life, and
// says it is never renewed.
func TestLoadOrGenerateServerCert_GeneratedPairIsABootstrap(t *testing.T) {
	dir := t.TempDir()
	var buf strings.Builder
	if _, err := loadOrGenerateServerCert(filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key"), newCapturingLogger(&buf)); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"generating a self-signed bootstrap certificate", "validity_days=7", "never renewed", "sha256_fingerprint="} {
		if !strings.Contains(buf.String(), want) {
			t.Errorf("log lacks %q: %s", want, buf.String())
		}
	}
}

// ----- live certificate, live trust and the TLS manager ---------------------------------

// testTrust is a trust holder with an empty pool.
func testTrust(skip bool) *trustHolder {
	return newTrustHolder(x509.NewCertPool(), skip, quietLogger())
}

// testCertPair is a throwaway certificate and its key, as PEM and parsed.
type testCertPair struct {
	certPEM, keyPEM string
	cert            *x509.Certificate
	key             *ecdsa.PrivateKey
}

// testCertSpec shapes newTestCert's certificate. Zero values give a valid
// self-signed leaf for localhost and 127.0.0.1.
type testCertSpec struct {
	cn                  string
	dns                 []string
	ips                 []net.IP
	notBefore, notAfter time.Time
	ca                  bool
	curve               elliptic.Curve // the key's curve; nil means P-256
	parent              *testCertPair  // signs it; nil means self-signed
}

func newTestCert(t *testing.T, spec testCertSpec) testCertPair {
	t.Helper()
	if spec.cn == "" {
		spec.cn = "test.example"
	}
	if spec.dns == nil && spec.ips == nil {
		spec.dns, spec.ips = []string{"localhost"}, []net.IP{net.IPv4(127, 0, 0, 1)}
	}
	now := time.Now()
	if spec.notBefore.IsZero() {
		spec.notBefore = now.Add(-time.Hour)
	}
	if spec.notAfter.IsZero() {
		spec.notAfter = now.Add(24 * time.Hour)
	}
	if spec.curve == nil {
		spec.curve = elliptic.P256()
	}
	key, err := ecdsa.GenerateKey(spec.curve, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 62))
	if err != nil {
		t.Fatal(err)
	}
	usage := x509.KeyUsageDigitalSignature
	if spec.ca {
		usage |= x509.KeyUsageCertSign
	}
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: spec.cn},
		NotBefore:             spec.notBefore,
		NotAfter:              spec.notAfter,
		KeyUsage:              usage,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  spec.ca,
		DNSNames:              spec.dns,
		IPAddresses:           spec.ips,
	}
	signer, parent := key, tmpl
	if spec.parent != nil {
		signer, parent = spec.parent.key, spec.parent.cert
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, &key.PublicKey, signer)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return testCertPair{
		certPEM: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		keyPEM:  string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})),
		cert:    cert,
		key:     key,
	}
}

// pemOf is a PEM block of the given type around body.
func pemOf(typ, body string) string {
	return string(pem.EncodeToMemory(&pem.Block{Type: typ, Bytes: []byte(body)}))
}

func loadPair(t *testing.T, p testCertPair) tls.Certificate {
	t.Helper()
	pair, err := tls.X509KeyPair([]byte(p.certPEM), []byte(p.keyPEM))
	if err != nil {
		t.Fatal(err)
	}
	return pair
}

func fingerprintOf(c *x509.Certificate) string {
	sum := sha256.Sum256(c.Raw)
	return formatFingerprint(sum[:])
}

// keyBodyLine is a line of base64 from p's key: text that must never show up
// in a response, a log line or an error.
func keyBodyLine(p testCertPair) string { return strings.Split(p.keyPEM, "\n")[1] }

func wantInvalid(t *testing.T, err error, field, reason string) {
	t.Helper()
	var inv *tlsInvalidError
	if !errors.As(err, &inv) || inv.Field != field || !strings.Contains(inv.Reason, reason) {
		t.Fatalf("want a refusal on %q saying %q, got %v", field, reason, err)
	}
}

// tlsFix is a TLS manager over a temp dir: tls.crt and tls.key holding orig,
// and a trust directory that does not exist yet.
type tlsFix struct {
	m                                *tlsManager
	dir, certFile, keyFile, trustDir string
	orig                             testCertPair
	log                              *strings.Builder
}

func newTLSFix(t *testing.T) *tlsFix {
	t.Helper()
	dir := t.TempDir()
	f := &tlsFix{
		dir:      dir,
		certFile: filepath.Join(dir, "tls.crt"),
		keyFile:  filepath.Join(dir, "tls.key"),
		trustDir: filepath.Join(dir, "trust"),
		log:      &strings.Builder{},
	}
	f.orig = newTestCert(t, testCertSpec{cn: "original"})
	writeFile(t, f.certFile, f.orig.certPEM)
	if err := os.WriteFile(f.keyFile, []byte(f.orig.keyPEM), 0o600); err != nil {
		t.Fatal(err)
	}
	pair, err := tls.LoadX509KeyPair(f.certFile, f.keyFile)
	if err != nil {
		t.Fatal(err)
	}
	pool, err := buildTrustPool(f.trustDir, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	trust := newTrustHolder(pool, false, quietLogger())
	// As serve() holds them with no bundle: on (the default), and none read.
	trust.holdStandard(loadStandardRoots(""), true)
	f.m = newTLSManager(f.certFile, f.keyFile, f.trustDir, newCertHolder(pair), trust, newCapturingLogger(f.log))
	return f
}

// served is the fingerprint of the certificate the listener would serve now.
func (f *tlsFix) served() string {
	sum := sha256.Sum256(f.m.cert.get().Certificate[0])
	return formatFingerprint(sum[:])
}

// wantFiles checks that tls.crt and tls.key hold p, and nothing else is in the
// directory but the trust directory: no journal, no backup, no temp.
func (f *tlsFix) wantFiles(t *testing.T, p testCertPair) {
	t.Helper()
	if got := string(mustRead(t, f.certFile)); got != string(encodeCertificates([]*x509.Certificate{p.cert})) {
		t.Errorf("tls.crt holds %q", got)
	}
	if got := string(mustRead(t, f.keyFile)); got != p.keyPEM {
		t.Error("tls.key does not hold the expected key")
	}
	entries, err := os.ReadDir(f.dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if n := e.Name(); n != "tls.crt" && n != "tls.key" && n != "trust" {
			t.Errorf("leftover in the certificate directory: %s", n)
		}
	}
}

func (f *tlsFix) readOnly() {
	f.m.seams.probe = func(string) error { return errors.New("read-only file system") }
}

// ----- the holders ----------------------------------------------------------------------

func TestCertHolder_GetCertificateReturnsTheCurrentPair(t *testing.T) {
	a, b := newTestCert(t, testCertSpec{cn: "a"}), newTestCert(t, testCertSpec{cn: "b"})
	h := newCertHolder(loadPair(t, a))
	got, err := h.getCertificate(nil)
	if err != nil || !bytes.Equal(got.Certificate[0], a.cert.Raw) {
		t.Fatalf("want a's certificate, got %v (%v)", got, err)
	}
	h.set(loadPair(t, b))
	if got, _ = h.getCertificate(&tls.ClientHelloInfo{}); !bytes.Equal(got.Certificate[0], b.cert.Raw) {
		t.Error("want b's certificate after set")
	}
}

// A replaced certificate reaches the next handshake; a connection already open
// carries on with the one it made, and is not dropped.
func TestCertHolder_ANewHandshakeSeesTheReplacedCertificateWhileAnOpenConnectionCarriesOn(t *testing.T) {
	f := newTLSFix(t)
	var handshakes atomic.Int32
	cfg := &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: func(h *tls.ClientHelloInfo) (*tls.Certificate, error) {
		handshakes.Add(1)
		return f.m.cert.getCertificate(h)
	}}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "ok") })}
	go func() { _ = srv.Serve(tls.NewListener(ln, cfg)) }()
	t.Cleanup(func() { _ = srv.Close() })

	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}
	t.Cleanup(client.CloseIdleConnections)
	seen := func() string {
		resp, err := client.Get("https://" + ln.Addr().String() + "/")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		_, _ = io.Copy(io.Discard, resp.Body)
		return fingerprintOf(resp.TLS.PeerCertificates[0])
	}
	if got := seen(); got != fingerprintOf(f.orig.cert) {
		t.Fatalf("before the replacement the original is served, got %s", got)
	}

	next := newTestCert(t, testCertSpec{cn: "next"})
	if _, err := f.m.replaceCertificate(next.certPEM, next.keyPEM); err != nil {
		t.Fatal(err)
	}
	if got := seen(); got != fingerprintOf(f.orig.cert) || handshakes.Load() != 1 {
		t.Errorf("the open connection carries on with the certificate it made: got %s after %d handshakes", got, handshakes.Load())
	}
	conn, err := tls.Dial("tcp", ln.Addr().String(), &tls.Config{InsecureSkipVerify: true})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if got := fingerprintOf(conn.ConnectionState().PeerCertificates[0]); got != fingerprintOf(next.cert) || handshakes.Load() != 2 {
		t.Errorf("a new handshake sees the replacement: got %s after %d handshakes", got, handshakes.Load())
	}
}

// Certificate replacements and CA additions sent by several administrators at
// once, which the store writer does not serialise: the manager's lock does. The
// pair served is one of the pairs sent and is the pair on disk, every CA file
// is there and trusted, and no journal, backup or temporary file is left.
func TestTLSManager_ConcurrentWritesSerialise(t *testing.T) {
	f := newTLSFix(t)
	if err := os.Mkdir(f.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	const n = 6
	pairs, cas := make([]testCertPair, n), make([]testCertPair, n)
	for i := range n {
		pairs[i] = newTestCert(t, testCertSpec{cn: fmt.Sprintf("next-%d", i)})
		cas[i] = newTestCert(t, testCertSpec{cn: fmt.Sprintf("ca-%d", i), ca: true})
	}
	var wg sync.WaitGroup
	errs := make(chan error, 2*n)
	for i := range n {
		wg.Add(2)
		go func() {
			defer wg.Done()
			if _, err := f.m.replaceCertificate(pairs[i].certPEM, pairs[i].keyPEM); err != nil {
				errs <- fmt.Errorf("replace %d: %w", i, err)
			}
		}()
		go func() {
			defer wg.Done()
			if _, err := f.m.addTrust(fmt.Sprintf("ca-%d.crt", i), cas[i].certPEM); err != nil {
				errs <- fmt.Errorf("add CA %d: %w", i, err)
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}

	var winner *testCertPair
	for i := range pairs {
		if fingerprintOf(pairs[i].cert) == f.served() {
			winner = &pairs[i]
		}
	}
	if winner == nil {
		t.Fatalf("the served certificate %s is none of those sent", f.served())
	}
	f.wantFiles(t, *winner)
	if got := len(f.m.trustFiles()); got != n {
		t.Errorf("every CA file is listed: %d of %d", got, n)
	}
	for i := range cas {
		leaf := newTestCert(t, testCertSpec{cn: "broker", parent: &cas[i]})
		if _, err := leaf.cert.Verify(x509.VerifyOptions{Roots: f.m.trust.get().pool, DNSName: "localhost"}); err != nil {
			t.Errorf("CA %d is trusted: %v", i, err)
		}
	}
	entries, err := os.ReadDir(f.trustDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), "ca-") || filepath.Ext(e.Name()) != ".crt" {
			t.Errorf("only the CA files are left in the trust directory, found %s", e.Name())
		}
	}
}

func TestTrustHolder_ChangesRunTheHooksOnlyWhenSomethingChanged(t *testing.T) {
	var buf strings.Builder
	h := newTrustHolder(x509.NewCertPool(), false, newCapturingLogger(&buf))
	calls := 0
	h.onChange(func() { calls++ })

	h.setSkip(false) // what it already is
	if calls != 0 || buf.Len() != 0 {
		t.Fatalf("no change, no hook, no warning: %d calls, log %q", calls, buf.String())
	}
	h.setSkip(true)
	h.setSkip(true)
	if calls != 1 || !h.get().skip || strings.Count(buf.String(), "upstream certificates will NOT be validated") != 1 {
		t.Fatalf("turning it on runs the hooks and warns once: %d calls, log %q", calls, buf.String())
	}
	pool := x509.NewCertPool()
	h.setPool(pool)
	if calls != 2 || h.get().pool != pool || !h.get().skip {
		t.Errorf("a new pool keeps the flag and runs the hooks: %d calls, %+v", calls, h.get())
	}
	h.setSkip(false)
	if calls != 3 || h.get().skip {
		t.Errorf("turning it off runs the hooks: %d calls", calls)
	}

	buf.Reset()
	newTrustHolder(pool, true, newCapturingLogger(&buf))
	if !strings.Contains(buf.String(), "upstream certificates will NOT be validated") {
		t.Errorf("a holder that starts with the check off warns at once: %q", buf.String())
	}
}

// The standard root bundle: none, missing, unreadable and empty each give the
// console's reason and no pool; a bundle gives its certificates in a pool.
func TestLoadStandardRoots(t *testing.T) {
	dir := t.TempDir()
	empty := filepath.Join(dir, "empty.crt")
	writeFile(t, empty, "no certificate here\n")
	a := newTestCert(t, testCertSpec{cn: "Root A", ca: true})
	b := newTestCert(t, testCertSpec{cn: "Root B", ca: true})
	bundle := filepath.Join(dir, "bundle.crt")
	writeFile(t, bundle, pemOf("CERTIFICATE", string(b.cert.Raw))+pemOf("CERTIFICATE", string(a.cert.Raw)))

	for path, want := range map[string]string{
		"":                               standardRootsMissing,
		filepath.Join(dir, "absent.crt"): standardRootsMissing,
		dir:                              standardRootsUnreadable,
		empty:                            standardRootsEmpty,
	} {
		if r := loadStandardRoots(path); r.problem != want || r.pool != nil || len(r.certs) != 0 {
			t.Errorf("%q: want %q and no certificate, got %+v", path, want, r)
		}
	}
	r := loadStandardRoots(bundle)
	if r.problem != "" || r.pool == nil || len(r.certs) != 2 {
		t.Fatalf("a bundle of two: got %+v", r)
	}
}

// holdStandard logs the count, or warns when the roots count but the bundle
// gave none; setStandard runs the hooks only on a change.
func TestTrustHolder_StandardRoots(t *testing.T) {
	var buf strings.Builder
	h := newTrustHolder(x509.NewCertPool(), false, newCapturingLogger(&buf))
	h.holdStandard(standardRoots{problem: standardRootsMissing}, true)
	if !h.get().standard || !strings.Contains(buf.String(), "no standard root CA was read") {
		t.Fatalf("on with no bundle: standard %v, log %q", h.get().standard, buf.String())
	}
	buf.Reset()
	h.holdStandard(standardRoots{problem: standardRootsMissing}, false)
	if h.get().standard || strings.Contains(buf.String(), "no standard root CA was read") || !strings.Contains(buf.String(), "count=0") {
		t.Fatalf("off: no warning, the count logged; standard %v, log %q", h.get().standard, buf.String())
	}
	calls := 0
	h.onChange(func() { calls++ })
	h.setStandard(false)
	if calls != 0 {
		t.Fatalf("what it already is: %d calls", calls)
	}
	h.setStandard(true)
	if calls != 1 || !h.get().standard {
		t.Errorf("turning it on runs the hooks: %d calls, standard %v", calls, h.get().standard)
	}
}

// A broker whose root is only among the standard roots is reached while they
// count and refused once they do not; the trust directory's pool still counts
// alone, and a failure against both reports the first.
func TestUpstreamTransport_StandardRootsApplyLive(t *testing.T) {
	root := newTestCert(t, testCertSpec{cn: "standard root", ca: true})
	leaf := newTestCert(t, testCertSpec{cn: "leaf", ips: []net.IP{net.IPv4(127, 0, 0, 1)}, parent: &root})
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{loadPair(t, leaf)}}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	bundle := filepath.Join(t.TempDir(), "bundle.crt")
	writeFile(t, bundle, pemOf("CERTIFICATE", string(root.cert.Raw)))

	trust := testTrust(false)
	trust.holdStandard(loadStandardRoots(bundle), true)
	tr := newUpstreamTransport(trust)
	t.Cleanup(tr.CloseIdleConnections)
	if err := roundTrip(tr, "127.0.0.1", u.Port()); err != nil {
		t.Fatalf("a root among the standard roots, which count: %v", err)
	}
	if err := roundTrip(tr, "localhost", u.Port()); err == nil || !strings.Contains(err.Error(), "valid for") {
		t.Fatalf("the name is still checked, got %v", err)
	}
	trust.setStandard(false)
	if err := roundTrip(tr, "127.0.0.1", u.Port()); err == nil || !strings.Contains(err.Error(), "unknown authority") {
		t.Fatalf("with the standard roots off, the broker is refused, got %v", err)
	}
	dir := x509.NewCertPool()
	dir.AddCert(root.cert)
	trust.setPool(dir)
	if err := roundTrip(tr, "127.0.0.1", u.Port()); err != nil {
		t.Errorf("the trust directory's pool counts alone: %v", err)
	}
}

// brokerFixture is a TLS server standing for a broker, with its certificate
// as PEM for the trust directory.
func brokerFixture(t *testing.T) (broker *httptest.Server, pemText string, port string) {
	t.Helper()
	broker = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "broker") }))
	t.Cleanup(broker.Close)
	u, err := url.Parse(broker.URL)
	if err != nil {
		t.Fatal(err)
	}
	return broker, pemOf("CERTIFICATE", string(broker.Certificate().Raw)), u.Port()
}

// roundTrip fetches https://host:port/ through tr and closes the body.
func roundTrip(tr http.RoundTripper, host, port string) error {
	req, err := http.NewRequest(http.MethodGet, "https://"+host+":"+port+"/", nil)
	if err != nil {
		return err
	}
	resp, err := tr.RoundTrip(req)
	if err != nil {
		return err
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.Body.Close()
}

// The transport checks the chain against the pool held when it connects, and
// the name against the host asked for; a chain through an intermediate the
// server presents verifies against the root alone.
func TestUpstreamTransport_VerifiesTheChainAndTheName(t *testing.T) {
	broker, _, port := brokerFixture(t)
	pool := x509.NewCertPool()
	pool.AddCert(broker.Certificate())
	tr := newUpstreamTransport(newTrustHolder(pool, false, quietLogger()))
	t.Cleanup(tr.CloseIdleConnections)
	if err := roundTrip(tr, "127.0.0.1", port); err != nil {
		t.Fatalf("a broker whose certificate is in the pool: %v", err)
	}
	if err := roundTrip(tr, "localhost", port); err == nil || !strings.Contains(err.Error(), "valid for") {
		t.Fatalf("a name the certificate does not carry must fail verification, got %v", err)
	}

	root := newTestCert(t, testCertSpec{cn: "root", ca: true})
	inter := newTestCert(t, testCertSpec{cn: "inter", ca: true, parent: &root})
	leaf := newTestCert(t, testCertSpec{cn: "leaf", parent: &inter})
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{leaf.cert.Raw, inter.cert.Raw}, PrivateKey: leaf.key}}}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	rootOnly := x509.NewCertPool()
	rootOnly.AddCert(root.cert)
	chain := newUpstreamTransport(newTrustHolder(rootOnly, false, quietLogger()))
	t.Cleanup(chain.CloseIdleConnections)
	if err := roundTrip(chain, "127.0.0.1", u.Port()); err != nil {
		t.Errorf("leaf and intermediate, the root in the pool: %v", err)
	}
	other := newTestCert(t, testCertSpec{cn: "other root", ca: true})
	otherPool := x509.NewCertPool()
	otherPool.AddCert(other.cert)
	stranger := newUpstreamTransport(newTrustHolder(otherPool, false, quietLogger()))
	t.Cleanup(stranger.CloseIdleConnections)
	if err := roundTrip(stranger, "127.0.0.1", u.Port()); err == nil || !strings.Contains(err.Error(), "unknown authority") {
		t.Errorf("a chain to a root that is not in the pool must fail, got %v", err)
	}
}

// A broker reached by IP address is checked against the certificate's IP
// addresses: a certificate for other addresses is refused, whatever name it
// carries.
func TestUpstreamTransport_ChecksAnIPHostAgainstTheCertificateAddresses(t *testing.T) {
	elsewhere := newTestCert(t, testCertSpec{cn: "elsewhere", dns: []string{"localhost"}, ips: []net.IP{net.IPv4(192, 0, 2, 1)}})
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{loadPair(t, elsewhere)}}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	pool := x509.NewCertPool()
	pool.AddCert(elsewhere.cert)
	tr := newUpstreamTransport(newTrustHolder(pool, false, quietLogger()))
	t.Cleanup(tr.CloseIdleConnections)
	if err := roundTrip(tr, "127.0.0.1", u.Port()); err == nil || !strings.Contains(err.Error(), "valid for") {
		t.Fatalf("an IP the certificate does not carry must fail verification, got %v", err)
	}
	if err := roundTrip(tr, "localhost", u.Port()); err != nil {
		t.Errorf("a name the certificate carries: %v", err)
	}
}

// tls.insecureSkipVerify applied live: the next connection skips (or checks)
// at once, and a connection kept idle under the old value is not reused.
func TestUpstreamTransport_SkipVerifyAppliesLive(t *testing.T) {
	_, _, port := brokerFixture(t)
	trust := testTrust(false)
	tr := newUpstreamTransport(trust)
	t.Cleanup(tr.CloseIdleConnections)
	if err := roundTrip(tr, "127.0.0.1", port); err == nil || !strings.Contains(err.Error(), "unknown authority") {
		t.Fatalf("a broker no CA vouches for must fail, got %v", err)
	}
	trust.setSkip(true)
	if err := roundTrip(tr, "127.0.0.1", port); err != nil {
		t.Fatalf("with the check off the broker is reached: %v", err)
	}
	trust.setSkip(false)
	if err := roundTrip(tr, "127.0.0.1", port); err == nil || !strings.Contains(err.Error(), "unknown authority") {
		t.Fatalf("with the check back on, the idle connection made under the skip must not be reused: want the unknown-authority failure, got %v", err)
	}
}

// The Direct relay over the live trust: a request fails verification once its
// CA file is deleted and passes once it is added back, with no restart, even
// with a connection to the broker sitting idle.
func TestRelay_CAFilesApplyWithNoRestart(t *testing.T) {
	f := newTLSFix(t)
	_, brokerPEM, port := brokerFixture(t)
	gw := httptest.NewServer(newReverseProxy(newUpstreamTransport(f.m.trust), quietLogger()))
	t.Cleanup(gw.Close)
	get := func() int {
		resp, err := http.Get(gw.URL + "/https/" + port + "/127.0.0.1/x")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		_, _ = io.Copy(io.Discard, resp.Body)
		return resp.StatusCode
	}
	if code := get(); code != http.StatusBadGateway {
		t.Fatalf("no CA file: want 502 (verification fails), got %d", code)
	}
	if _, err := f.m.addTrust("broker.crt", brokerPEM); err != nil {
		t.Fatal(err)
	}
	if code := get(); code != http.StatusOK || get() != http.StatusOK {
		t.Fatalf("with the CA file added the broker is reached, and again over the idle connection")
	}
	if err := f.m.removeTrust("broker.crt"); err != nil {
		t.Fatal(err)
	}
	if code := get(); code != http.StatusBadGateway {
		t.Fatalf("after the CA file is deleted verification fails at once, got %d", code)
	}
	if _, err := f.m.addTrust("broker.crt", brokerPEM); err != nil {
		t.Fatal(err)
	}
	if code := get(); code != http.StatusOK {
		t.Fatalf("added back, the broker is reached again, got %d", code)
	}
}

// ----- describing, listing, writable --------------------------------------------------

func TestTLSManager_DescribesACertificate(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "Example Root", ca: true})
	leaf := newTestCert(t, testCertSpec{cn: "gw.example", dns: []string{"gw.example", "alt.example"}, ips: []net.IP{net.ParseIP("10.0.0.1"), net.ParseIP("::1")}, parent: &ca})
	got := f.m.describe(leaf.cert)
	want := tlsCertJSON{
		Subject:   "CN=gw.example",
		Issuer:    "CN=Example Root",
		Names:     []string{"gw.example", "alt.example", "10.0.0.1", "::1"},
		NotBefore: leaf.cert.NotBefore.UTC().Format(time.RFC3339),
		NotAfter:  leaf.cert.NotAfter.UTC().Format(time.RFC3339),
		SHA256:    fingerprintOf(leaf.cert),
	}
	if !equalCertJSON(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
	if !strings.Contains(got.SHA256, ":") || strings.ToUpper(got.SHA256) != got.SHA256 {
		t.Errorf("the fingerprint is upper-case hex pairs joined by colons: %s", got.SHA256)
	}
	self := f.m.describe(ca.cert)
	if !self.SelfSigned || self.Issuer != self.Subject {
		t.Errorf("a root is self-signed: %+v", self)
	}
	f.m.now = func() time.Time { return leaf.cert.NotAfter.Add(time.Second) }
	if !f.m.describe(leaf.cert).Expired {
		t.Error("a certificate past its notAfter is expired")
	}
	none := newTestCert(t, testCertSpec{dns: []string{}, ips: []net.IP{}})
	raw, err := json.Marshal(f.m.describe(none.cert))
	if err != nil || !strings.Contains(string(raw), `"names":[]`) {
		t.Errorf("no names is an empty list, not null: %s (%v)", raw, err)
	}
}

func equalCertJSON(a, b tlsCertJSON) bool {
	return a.Subject == b.Subject && a.Issuer == b.Issuer && strings.Join(a.Names, ",") == strings.Join(b.Names, ",") &&
		a.NotBefore == b.NotBefore && a.NotAfter == b.NotAfter && a.SHA256 == b.SHA256 && a.SelfSigned == b.SelfSigned && a.Expired == b.Expired
}

func TestTLSManager_StateHasTheShapeTheConsoleReads(t *testing.T) {
	f := newTLSFix(t)
	raw, err := json.Marshal(f.m.state())
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	trust, ok := body["trust"].([]any)
	if !ok || len(trust) != 0 || body["certificateWritable"] != true || body["trustWritable"] != true {
		t.Errorf("an empty trust list is [], and both are writable here: %s", raw)
	}
	cert, _ := body["certificate"].(map[string]any)
	for _, k := range []string{"subject", "issuer", "names", "notBefore", "notAfter", "sha256", "selfSigned", "expired"} {
		if _, ok := cert[k]; !ok {
			t.Errorf("certificate lacks %q: %s", k, raw)
		}
	}
	if cert["sha256"] != fingerprintOf(f.orig.cert) || cert["selfSigned"] != true || cert["expired"] != false {
		t.Errorf("the certificate in use is described: %s", raw)
	}
	for _, leak := range []string{f.dir, "PRIVATE", keyBodyLine(f.orig)} {
		if strings.Contains(string(raw), leak) {
			t.Errorf("the answer must carry no path and no key: %s", raw)
		}
	}
}

// The standard roots: whether they count now, each one sorted by subject, and
// the bundle's problem; with no bundle, an empty list (not null) and its reason.
func TestTLSManager_StateDescribesTheStandardRoots(t *testing.T) {
	f := newTLSFix(t)
	a := newTestCert(t, testCertSpec{cn: "Alpha Root", ca: true})
	z := newTestCert(t, testCertSpec{cn: "Zulu Root", ca: true})
	bundle := filepath.Join(f.dir, "bundle.crt")
	writeFile(t, bundle, pemOf("CERTIFICATE", string(z.cert.Raw))+pemOf("CERTIFICATE", string(a.cert.Raw)))
	f.m.trust.holdStandard(loadStandardRoots(bundle), true)
	st := f.m.state().Standard
	if !st.Trusted || st.Problem != "" || len(st.Certificates) != 2 ||
		st.Certificates[0].SHA256 != fingerprintOf(a.cert) || st.Certificates[1].SHA256 != fingerprintOf(z.cert) {
		t.Fatalf("two roots, sorted by subject: %+v", st)
	}
	f.m.trust.setStandard(false)
	if f.m.state().Standard.Trusted {
		t.Error("trusted follows tls.standardRoots")
	}

	f.m.trust.holdStandard(loadStandardRoots(""), true)
	raw, err := json.Marshal(f.m.state())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"standard":{"trusted":true,"certificates":[],"problem":"`+standardRootsMissing+`"}`) {
		t.Errorf("no bundle: %s", raw)
	}
}

func TestTLSManager_WritableFlags(t *testing.T) {
	f := newTLSFix(t)
	if !f.m.certificateWritable() || !f.m.trustWritable() {
		t.Fatal("a directory that takes a new file is writable (the trust directory need not exist yet)")
	}
	entries, _ := os.ReadDir(f.dir)
	if len(entries) != 2 {
		t.Errorf("probing leaves nothing behind: %v", entries)
	}

	f.readOnly()
	if f.m.certificateWritable() || f.m.trustWritable() {
		t.Error("a read-only mount is not writable")
	}
	if st := f.m.state(); st.CertificateWritable || st.TrustWritable {
		t.Errorf("the flags reach the answer: %+v", st)
	}

	f = newTLSFix(t)
	f.m.keyFile = filepath.Join(t.TempDir(), "tls.key")
	if f.m.certificateWritable() || !f.m.trustWritable() {
		t.Error("a certificate and key in two directories cannot be replaced as one commit: read-only, while the trust directory stays writable")
	}
}

// A trust directory that does not exist yet is writable when its parent is:
// the probe goes to the parent.
func TestTLSManager_AMissingTrustDirectoryIsProbedThroughItsParent(t *testing.T) {
	f := newTLSFix(t)
	var probed []string
	f.m.seams.probe = func(dir string) error {
		probed = append(probed, dir)
		return nil
	}
	f.m.trustWritable()
	if len(probed) != 1 || probed[0] != f.dir {
		t.Errorf("probed %v, want the parent %s", probed, f.dir)
	}
	if err := os.Mkdir(f.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	probed = nil
	f.m.trustWritable()
	if len(probed) != 1 || probed[0] != f.trustDir {
		t.Errorf("probed %v, want the directory %s", probed, f.trustDir)
	}
}

func TestProbeWritable(t *testing.T) {
	dir := t.TempDir()
	if err := probeWritable(dir); err != nil {
		t.Fatal(err)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("the probe left %v", entries)
	}
	if err := probeWritable(filepath.Join(dir, "absent")); err == nil {
		t.Error("a directory that is not there takes no file")
	}
}

func TestAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.crt")
	if err := atomicWrite(path, []byte("one"), 0o644); err != nil || string(mustRead(t, path)) != "one" {
		t.Fatalf("write: %v", err)
	}
	if err := atomicWrite(path, []byte("two"), 0o644); err != nil || string(mustRead(t, path)) != "two" {
		t.Fatalf("replace: %v", err)
	}
	if err := atomicWrite(filepath.Join(dir, "absent", "b.crt"), []byte("x"), 0o644); err == nil {
		t.Error("a directory that is not there cannot take a temp file")
	}
	target := filepath.Join(dir, "d.crt")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := atomicWrite(target, []byte("x"), 0o644); err == nil {
		t.Error("a rename over a directory fails")
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), tempPrefix) {
			t.Errorf("a failed write leaves no temp behind: %s", e.Name())
		}
	}
}

func TestTLSManager_TrustFilesListsWhatThePoolReads(t *testing.T) {
	f := newTLSFix(t)
	if got := f.m.trustFiles(); got == nil || len(got) != 0 {
		t.Fatalf("a directory that is not there lists as [], got %#v", got)
	}
	if err := os.Mkdir(f.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	a, b := newTestCert(t, testCertSpec{cn: "a", ca: true}), newTestCert(t, testCertSpec{cn: "b", ca: true})
	writeFile(t, filepath.Join(f.trustDir, "b.pem"), a.certPEM+b.certPEM)
	writeFile(t, filepath.Join(f.trustDir, "a.CRT"), a.certPEM)
	writeFile(t, filepath.Join(f.trustDir, "junk.crt"), pemOf("CERTIFICATE", "not DER"))
	writeFile(t, filepath.Join(f.trustDir, "key.pem"), a.keyPEM)
	writeFile(t, filepath.Join(f.trustDir, "notes.txt"), a.certPEM)
	if err := os.Mkdir(filepath.Join(f.trustDir, "sub.crt"), 0o755); err != nil {
		t.Fatal(err)
	}
	linked := os.Symlink(filepath.Join(f.trustDir, "gone"), filepath.Join(f.trustDir, "dangling.crt")) == nil

	got := f.m.trustFiles()
	var names []string
	byName := map[string]tlsTrustFileJSON{}
	for _, tf := range got {
		names = append(names, tf.Name)
		byName[tf.Name] = tf
	}
	want := []string{"a.CRT", "b.pem", "junk.crt", "key.pem"}
	if linked {
		want = []string{"a.CRT", "b.pem", "dangling.crt", "junk.crt", "key.pem"}
	}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Fatalf("files %v, want %v (sorted; .crt and .pem only, any case; no directory)", names, want)
	}
	if bundle := byName["b.pem"]; len(bundle.Certificates) != 2 || bundle.Problem != "" || bundle.Certificates[1].Subject != "CN=b" || bundle.Certificates[0].SHA256 != fingerprintOf(a.cert) {
		t.Errorf("a bundle lists each certificate: %+v", bundle)
	}
	for _, name := range []string{"junk.crt", "key.pem"} {
		if tf := byName[name]; len(tf.Certificates) != 0 || tf.Certificates == nil || tf.Problem != "The file holds no certificate." {
			t.Errorf("%s gives no certificate and says why: %+v", name, tf)
		}
	}
	if linked && byName["dangling.crt"].Problem != "The file cannot be read." {
		t.Errorf("an unreadable file says so: %+v", byName["dangling.crt"])
	}
	for _, tf := range got {
		if strings.Contains(tf.Problem, f.dir) {
			t.Errorf("a problem never carries a path: %q", tf.Problem)
		}
	}
}

// A trust directory that cannot be listed (here a file in its place) gives an
// empty list and a warning, not an error page.
func TestTLSManager_TrustFilesOfAnUnlistableDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows reports a file listed as a directory as a missing path")
	}
	f := newTLSFix(t)
	f.m.trustDir = f.certFile // a regular file
	if got := f.m.trustFiles(); len(got) != 0 || !strings.Contains(f.log.String(), "trust directory cannot be listed") {
		t.Errorf("got %v, log %q", got, f.log.String())
	}
}

// ----- verifying a pair ------------------------------------------------------------

func TestTLSManager_VerifyRefusals(t *testing.T) {
	f := newTLSFix(t)
	now := time.Now()
	good := newTestCert(t, testCertSpec{cn: "good"})
	other := newTestCert(t, testCertSpec{cn: "other"})
	expired := newTestCert(t, testCertSpec{cn: "old", notBefore: now.Add(-48 * time.Hour), notAfter: now.Add(-24 * time.Hour)})
	future := newTestCert(t, testCertSpec{cn: "soon", notBefore: now.Add(24 * time.Hour), notAfter: now.Add(48 * time.Hour)})
	p521 := newTestCert(t, testCertSpec{cn: "p521", curve: elliptic.P521()})
	passKey := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Headers: map[string]string{"Proc-Type": "4,ENCRYPTED", "DEK-Info": "AES-128-CBC,00"}, Bytes: []byte("x")}))
	cases := []struct {
		name, cert, key, field, reason string
	}{
		{"an empty certificate", "", good.keyPEM, "certificate", "No certificate was found"},
		{"text that is not PEM", "hello", good.keyPEM, "certificate", "No certificate was found"},
		{"a private key in the certificate field", good.keyPEM, good.keyPEM, "certificate", "A private key was found"},
		{"a certificate followed by a key", good.certPEM + good.keyPEM, good.keyPEM, "certificate", "A private key was found"},
		{"another kind of block", pemOf("PUBLIC KEY", "x"), good.keyPEM, "certificate", `A "PUBLIC KEY" block was found`},
		{"a certificate that does not parse", pemOf("CERTIFICATE", "not DER"), good.keyPEM, "certificate", "cannot be read as a certificate"},
		{"text after the last certificate", good.certPEM + "trailing words\n", good.keyPEM, "certificate", "text after the last certificate block"},
		{"no key", good.certPEM, "", "key", "No private key was found"},
		{"a certificate in the key field", good.certPEM, good.certPEM, "key", `A "CERTIFICATE" block was found`},
		{"two keys", good.certPEM, good.keyPEM + other.keyPEM, "key", "More than one private key"},
		{"an encrypted key", good.certPEM, pemOf("ENCRYPTED PRIVATE KEY", "x"), "key", "The key is encrypted"},
		{"a key with a passphrase header", good.certPEM, passKey, "key", "The key is encrypted"},
		{"text after the key", good.certPEM, good.keyPEM + "oops\n", "key", "text after the key block"},
		{"a key that does not parse", good.certPEM, pemOf("PRIVATE KEY", "not a key"), "key", "cannot be read"},
		{"another certificate's key", good.certPEM, other.keyPEM, "key", "does not match the certificate"},
		{"a key browsers cannot use", p521.certPEM, p521.keyPEM, "certificate", "The certificate's key is ECDSA on P-521, which Chrome and Edge cannot use for TLS."},
		{"an expired certificate", expired.certPEM, expired.keyPEM, "certificate", "expired on"},
		{"a certificate not valid yet", future.certPEM, future.keyPEM, "certificate", "not valid until"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := f.m.checkCertificate(c.cert, c.key)
			wantInvalid(t, err, c.field, c.reason)
			for _, k := range []testCertPair{good, other, expired, future, p521} {
				if strings.Contains(err.Error(), keyBodyLine(k)) {
					t.Errorf("a refusal never repeats key material: %v", err)
				}
			}
			_, err = f.m.replaceCertificate(c.cert, c.key)
			wantInvalid(t, err, c.field, c.reason)
			f.wantFiles(t, f.orig)
			if f.served() != fingerprintOf(f.orig.cert) {
				t.Error("a refused replacement changes nothing that is served")
			}
		})
	}
	if strings.Contains(f.log.String(), keyBodyLine(good)) {
		t.Error("the log never carries key material")
	}
}

func TestTLSManager_CheckAcceptsWhatTheFilesWillHold(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	leaf := newTestCert(t, testCertSpec{cn: "leaf", parent: &ca})
	// A chain: the leaf first, then its issuer; the key is the leaf's.
	got, err := f.m.checkCertificate(leaf.certPEM+ca.certPEM, leaf.keyPEM)
	if err != nil || got.Subject != "CN=leaf" || got.Issuer != "CN=ca" || got.SelfSigned {
		t.Fatalf("a chain is checked by its leaf: %+v (%v)", got, err)
	}
	// An EC key as openssl writes it: a parameters block, then the key (SEC1).
	sec1, err := x509.MarshalECPrivateKey(leaf.key)
	if err != nil {
		t.Fatal(err)
	}
	ecKey := pemOf("EC PARAMETERS", "params") + pemOf("EC PRIVATE KEY", string(sec1))
	if _, err := f.m.checkCertificate(leaf.certPEM, ecKey); err != nil {
		t.Fatalf("an EC key with its parameters block: %v", err)
	}
	f.wantFiles(t, f.orig) // checking writes nothing
}

// ----- replacing the certificate ------------------------------------------------------

func TestTLSManager_ReplaceWritesBothFilesAndSwaps(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	next := newTestCert(t, testCertSpec{cn: "next", parent: &ca})
	// Everything the sender included beyond the blocks is dropped.
	got, err := f.m.replaceCertificate("# issued today\n"+next.certPEM+ca.certPEM, pemOf("EC PARAMETERS", "p")+next.keyPEM)
	if err != nil {
		t.Fatal(err)
	}
	if got.Subject != "CN=next" || got.SHA256 != fingerprintOf(next.cert) {
		t.Errorf("the answer describes the leaf: %+v", got)
	}
	if got := string(mustRead(t, f.certFile)); got != next.certPEM+ca.certPEM {
		t.Errorf("tls.crt holds the chain, re-encoded: %q", got)
	}
	if got := string(mustRead(t, f.keyFile)); got != next.keyPEM {
		t.Errorf("tls.key holds the one key block")
	}
	if runtime.GOOS != "windows" {
		for path, want := range map[string]os.FileMode{f.certFile: 0o644, f.keyFile: 0o600} {
			if info, err := os.Stat(path); err != nil || info.Mode().Perm() != want {
				t.Errorf("%s: mode %v, want %v (%v)", filepath.Base(path), info.Mode().Perm(), want, err)
			}
		}
	}
	if f.served() != fingerprintOf(next.cert) {
		t.Error("the listener serves the new certificate")
	}
	if _, err := tls.LoadX509KeyPair(f.certFile, f.keyFile); err != nil {
		t.Errorf("the pair on disk loads at the next start: %v", err)
	}
	entries, _ := os.ReadDir(f.dir)
	for _, e := range entries {
		if n := e.Name(); n != "tls.crt" && n != "tls.key" {
			t.Errorf("leftover of the commit: %s", n)
		}
	}
	log := f.log.String()
	for _, want := range []string{"TLS server certificate replaced", `subject="CN=next"`, "sha256_fingerprint=" + fingerprintOf(next.cert)} {
		if !strings.Contains(log, want) {
			t.Errorf("log lacks %q: %s", want, log)
		}
	}
	if strings.Contains(log, keyBodyLine(next)) || strings.Contains(log, "PRIVATE") {
		t.Errorf("the log never carries the key: %s", log)
	}
}

func TestTLSManager_ReplaceIsRefusedWhenReadOnly(t *testing.T) {
	f := newTLSFix(t)
	next := newTestCert(t, testCertSpec{cn: "next"})
	f.readOnly()
	if _, err := f.m.replaceCertificate(next.certPEM, next.keyPEM); !errors.Is(err, errTLSReadOnly) {
		t.Fatalf("want errTLSReadOnly, got %v", err)
	}
	f.wantFiles(t, f.orig)
	if f.served() != fingerprintOf(f.orig.cert) {
		t.Error("nothing is swapped")
	}

	f = newTLSFix(t)
	f.m.keyFile = filepath.Join(t.TempDir(), "tls.key")
	if _, err := f.m.replaceCertificate(next.certPEM, next.keyPEM); !errors.Is(err, errTLSReadOnly) {
		t.Fatalf("a pair split over two directories: want errTLSReadOnly, got %v", err)
	}
	if string(mustRead(t, f.certFile)) != f.orig.certPEM {
		t.Error("nothing is written")
	}
}

// A write that fails changes nothing: the old pair is in both files and still
// served, the cause is logged and neither the error nor the log holds the key.
func TestTLSManager_AFailedWriteChangesNothing(t *testing.T) {
	for _, c := range []struct {
		name  string
		hooks journalHooks
	}{
		{"staging", failAfter(stepTemps, errors.New("no space left on device"))},
		{"the renames", failAfter(stepRename, errors.New("no space left on device"))},
	} {
		t.Run(c.name, func(t *testing.T) {
			f := newTLSFix(t)
			next := newTestCert(t, testCertSpec{cn: "next"})
			f.m.seams.journal = c.hooks
			_, err := f.m.replaceCertificate(next.certPEM, next.keyPEM)
			var werr *tlsWriteError
			if !errors.As(err, &werr) || !strings.Contains(err.Error(), "no space left") {
				t.Fatalf("want a *tlsWriteError carrying the cause, got %v", err)
			}
			f.wantFiles(t, f.orig)
			if f.served() != fingerprintOf(f.orig.cert) {
				t.Error("the old certificate is still served")
			}
			log := f.log.String()
			if !strings.Contains(log, "TLS certificate replacement failed") || !strings.Contains(log, "no space left") {
				t.Errorf("the cause is logged: %s", log)
			}
			if strings.Contains(log+err.Error(), keyBodyLine(next)) {
				t.Error("neither the log nor the error holds the key")
			}
		})
	}
}

// A fault that stops the rollback too leaves the journal for the next start;
// until then a further replacement is refused, still with nothing changed in
// what is served.
func TestTLSManager_AFailedRollbackLeavesTheJournalAndRefusesTheNextWrite(t *testing.T) {
	f := newTLSFix(t)
	next := newTestCert(t, testCertSpec{cn: "next"})
	f.m.seams.journal = journalHooks{rename: func(string, string) error { return errors.New("input/output error") }}
	_, err := f.m.replaceCertificate(next.certPEM, next.keyPEM)
	var rf *rollbackFailedError
	if !errors.As(err, &rf) {
		t.Fatalf("want the rollback failure, got %v", err)
	}
	if f.served() != fingerprintOf(f.orig.cert) {
		t.Error("the old certificate is still served")
	}
	f.m.seams.journal = journalHooks{}
	_, err = f.m.replaceCertificate(next.certPEM, next.keyPEM)
	var werr *tlsWriteError
	if !errors.As(err, &werr) || !strings.Contains(err.Error(), "unfinished transaction journal") {
		t.Fatalf("want a refusal naming the unfinished journal, got %v", err)
	}
}

// ----- recovery at start ---------------------------------------------------------------

// A crash between the two files of a pair (the certificate renamed, the key
// not yet) is rolled back at the next start, before the pair is loaded: the
// old pair is whole again. Without that the pair would not load at all.
func TestRecoverTLSPair_ACrashBetweenTheTwoFilesOfAPairIsRolledBackAtStart(t *testing.T) {
	f := newTLSFix(t)
	next := newTestCert(t, testCertSpec{cn: "next"})
	f.m.seams.journal = crashAfter(stepBackups)
	if _, err := f.m.replaceCertificate(next.certPEM, next.keyPEM); !errors.Is(err, errSimulatedCrash) {
		t.Fatalf("want the simulated crash, got %v", err)
	}
	// The first of the two renames had landed when the process stopped.
	writeFile(t, f.certFile, next.certPEM)
	if _, err := tls.LoadX509KeyPair(f.certFile, f.keyFile); err == nil {
		t.Fatal("a certificate beside another key must not load: the crash left half a pair")
	}

	var buf strings.Builder
	if err := recoverTLSPair(f.certFile, f.keyFile, newCapturingLogger(&buf)); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buf.String(), "interrupted store write") {
		t.Errorf("the rollback is logged: %s", buf.String())
	}
	f.wantFiles(t, f.orig)
	pair, err := loadOrGenerateServerCert(f.certFile, f.keyFile, quietLogger())
	if err != nil || fingerprintOf(pair.Leaf) != fingerprintOf(f.orig.cert) {
		t.Fatalf("the old pair loads again: %v", err)
	}
}

// A crash after the commit point (the journal gone, the backups still there)
// keeps the new pair and sweeps the backups, and only the pair's own: an
// operator's file under another name stays.
func TestRecoverTLSPair_ACrashAfterTheCommitKeepsTheNewPairAndSweepsItsBackups(t *testing.T) {
	f := newTLSFix(t)
	next := newTestCert(t, testCertSpec{cn: "next"})
	f.m.seams.journal = crashAfter(stepCommit)
	if _, err := f.m.replaceCertificate(next.certPEM, next.keyPEM); !errors.Is(err, errSimulatedCrash) {
		t.Fatalf("want the simulated crash, got %v", err)
	}
	writeFile(t, filepath.Join(f.dir, "other.crt.bak"), "an operator's copy")
	if err := recoverTLSPair(f.certFile, f.keyFile, quietLogger()); err != nil {
		t.Fatal(err)
	}
	if got := string(mustRead(t, f.certFile)); got != string(encodeCertificates([]*x509.Certificate{next.cert})) {
		t.Error("a committed replacement stands")
	}
	for _, name := range []string{"tls.crt.bak", "tls.key.bak", txnFileName} {
		if _, err := os.Stat(filepath.Join(f.dir, name)); err == nil {
			t.Errorf("%s was not swept", name)
		}
	}
	if string(mustRead(t, filepath.Join(f.dir, "other.crt.bak"))) != "an operator's copy" {
		t.Error("only the pair's own backups are swept")
	}
}

// A certificate and key in two directories were never written by a journal:
// nothing to recover, and a directory that is not there is fine.
func TestRecoverTLSPair_TwoDirectoriesHaveNothingToRecover(t *testing.T) {
	a, b := t.TempDir(), filepath.Join(t.TempDir(), "absent")
	writeFile(t, filepath.Join(a, txnFileName), "{not json") // would stop a recovery of this directory
	if err := recoverTLSPair(filepath.Join(a, "tls.crt"), filepath.Join(b, "tls.key"), quietLogger()); err != nil {
		t.Errorf("two directories: %v", err)
	}
	if err := recoverTLSPair(filepath.Join(b, "tls.crt"), filepath.Join(b, "tls.key"), quietLogger()); err != nil {
		t.Errorf("a directory that is not there: %v", err)
	}
	writeFile(t, filepath.Join(a, "tls.crt"), "x")
	if err := recoverTLSPair(filepath.Join(a, "tls.crt"), filepath.Join(a, "tls.key"), quietLogger()); err == nil || !strings.Contains(err.Error(), "damaged") {
		t.Errorf("a damaged journal beside the pair stops the start: %v", err)
	}
}

// ----- the trust directory --------------------------------------------------------------

func TestTLSManager_AddTrustDerivesTheNameAndAppliesAtOnce(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "Example Root CA", ca: true})
	name, err := f.m.addTrust("", ca.certPEM+"\n\n")
	if err != nil || name != "example-root-ca.crt" {
		t.Fatalf("name %q (%v)", name, err)
	}
	path := filepath.Join(f.trustDir, name)
	if got := string(mustRead(t, path)); got != string(encodeCertificates([]*x509.Certificate{ca.cert})) {
		t.Errorf("the file holds the certificate re-encoded: %q", got)
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(path); err != nil || info.Mode().Perm() != 0o644 {
			t.Errorf("mode: %v (%v)", info.Mode().Perm(), err)
		}
	}
	leaf := newTestCert(t, testCertSpec{cn: "broker", parent: &ca})
	if _, err := leaf.cert.Verify(x509.VerifyOptions{Roots: f.m.trust.get().pool, DNSName: "localhost"}); err != nil {
		t.Errorf("the pool trusts the new CA at once: %v", err)
	}
	st := f.m.state()
	if len(st.Trust) != 1 || st.Trust[0].Name != name || st.Trust[0].Certificates[0].SHA256 != fingerprintOf(ca.cert) {
		t.Errorf("the list shows the file: %+v", st.Trust)
	}
	if !strings.Contains(f.log.String(), "trusted CA file added") {
		t.Errorf("the add is logged: %s", f.log.String())
	}
}

func TestTLSManager_AddTrustWithAGivenNameAndABundle(t *testing.T) {
	f := newTLSFix(t)
	a, b := newTestCert(t, testCertSpec{cn: "a", ca: true}), newTestCert(t, testCertSpec{cn: "b", ca: true})
	name, err := f.m.addTrust("bundle.pem", a.certPEM+b.certPEM)
	if err != nil || name != "bundle.pem" {
		t.Fatalf("name %q (%v)", name, err)
	}
	if st := f.m.state(); len(st.Trust) != 1 || len(st.Trust[0].Certificates) != 2 {
		t.Errorf("a bundle keeps both certificates: %+v", st.Trust)
	}
}

func TestTLSManager_AddTrustRefusals(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	for _, bad := range []string{"../escape.crt", "sub/dir.crt", `sub\dir.crt`, "-lead.crt", ".hidden.crt", "noext", "x.txt", "UPPER.CRT", strings.Repeat("a", 65) + ".crt", "with space.crt", "nul\x00.crt", "a.crt "} {
		_, err := f.m.addTrust(bad, ca.certPEM)
		wantInvalid(t, err, "name", "letters, digits")
	}
	for _, c := range []struct{ name, pem, reason string }{
		{"a private key sent as a CA", ca.keyPEM, "A private key was found"},
		{"a certificate with its key behind it", ca.certPEM + ca.keyPEM, "A private key was found"},
		{"text that is not PEM", "hello", "No certificate was found"},
		{"a certificate that does not parse", pemOf("CERTIFICATE", "not DER"), "cannot be read as a certificate"},
		{"text after the certificates", ca.certPEM + "words", "text after the last certificate block"},
	} {
		_, err := f.m.addTrust("good.crt", c.pem)
		wantInvalid(t, err, "certificate", c.reason)
		if strings.Contains(err.Error(), keyBodyLine(ca)) {
			t.Errorf("%s: a refusal never repeats key material: %v", c.name, err)
		}
	}
	if _, err := os.Stat(f.trustDir); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("a refused add writes nothing, not even the directory: %v", err)
	}
	if len(f.m.state().Trust) != 0 {
		t.Error("nothing is listed")
	}
}

func TestTLSManager_AddTrustNeverOverwrites(t *testing.T) {
	f := newTLSFix(t)
	first, second := newTestCert(t, testCertSpec{cn: "first", ca: true}), newTestCert(t, testCertSpec{cn: "second", ca: true})
	if _, err := f.m.addTrust("ca.crt", first.certPEM); err != nil {
		t.Fatal(err)
	}
	if _, err := f.m.addTrust("ca.crt", second.certPEM); !errors.Is(err, errTLSExists) {
		t.Fatalf("want errTLSExists, got %v", err)
	}
	if got := string(mustRead(t, filepath.Join(f.trustDir, "ca.crt"))); got != string(encodeCertificates([]*x509.Certificate{first.cert})) {
		t.Error("the existing file is untouched")
	}
	if err := os.Mkdir(filepath.Join(f.trustDir, "dir.crt"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := f.m.addTrust("dir.crt", second.certPEM); !errors.Is(err, errTLSExists) {
		t.Errorf("a directory of that name counts as taken, got %v", err)
	}
}

func TestTLSManager_TrustWritesAreRefusedWhenReadOnly(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	if _, err := f.m.addTrust("ca.crt", ca.certPEM); err != nil {
		t.Fatal(err)
	}
	f.readOnly()
	if _, err := f.m.addTrust("other.crt", ca.certPEM); !errors.Is(err, errTLSReadOnly) {
		t.Errorf("add: want errTLSReadOnly, got %v", err)
	}
	if err := f.m.removeTrust("ca.crt"); !errors.Is(err, errTLSReadOnly) {
		t.Errorf("delete: want errTLSReadOnly, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.trustDir, "ca.crt")); err != nil {
		t.Error("a refused delete keeps the file")
	}
	if _, err := os.Stat(filepath.Join(f.trustDir, "other.crt")); err == nil {
		t.Error("a refused add writes nothing")
	}
}

// Every way an add can fail after its input was accepted leaves the trust as
// it was: no file, the same pool.
func TestTLSManager_AddTrustFailuresChangeNothing(t *testing.T) {
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	cases := []struct {
		name  string
		setup func(f *tlsFix)
		cause string
	}{
		{"a write that fails", func(f *tlsFix) {
			f.m.seams.write = func(string, []byte, os.FileMode) error { return errors.New("input/output error") }
		}, "input/output error"},
		{"a pool that cannot be rebuilt", func(f *tlsFix) {
			f.m.seams.buildPool = func(string, *slog.Logger) (*x509.CertPool, error) {
				return nil, errors.New("cannot read the trust directory")
			}
		}, "cannot read the trust directory"},
		{"a directory that cannot be made", func(f *tlsFix) {
			f.m.trustDir = filepath.Join(f.certFile, "trust") // under a regular file
			f.m.seams.probe = func(string) error { return nil }
		}, "not a directory"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.cause == "not a directory" && runtime.GOOS == "windows" {
				t.Skip("Windows reports a directory under a file as a missing path, not as one that is not a directory")
			}
			f := newTLSFix(t)
			c.setup(f)
			before := f.m.trust.get().pool
			_, err := f.m.addTrust("ca.crt", ca.certPEM)
			var werr *tlsWriteError
			if !errors.As(err, &werr) || !strings.Contains(err.Error(), c.cause) {
				t.Fatalf("want a *tlsWriteError carrying %q, got %v", c.cause, err)
			}
			if !strings.Contains(f.log.String(), c.cause) {
				t.Errorf("the cause is logged: %s", f.log.String())
			}
			if f.m.trust.get().pool != before {
				t.Error("the pool is as it was")
			}
			if _, err := os.Stat(filepath.Join(f.m.trustDir, "ca.crt")); err == nil {
				t.Error("no file is left")
			}
		})
	}
}

func TestTLSManager_RemoveTrustAppliesAtOnce(t *testing.T) {
	f := newTLSFix(t)
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	leaf := newTestCert(t, testCertSpec{cn: "broker", parent: &ca})
	if _, err := f.m.addTrust("ca.crt", ca.certPEM); err != nil {
		t.Fatal(err)
	}
	verify := func() error {
		_, err := leaf.cert.Verify(x509.VerifyOptions{Roots: f.m.trust.get().pool, DNSName: "localhost"})
		return err
	}
	if err := verify(); err != nil {
		t.Fatalf("trusted before the delete: %v", err)
	}
	if err := f.m.removeTrust("ca.crt"); err != nil {
		t.Fatal(err)
	}
	if err := verify(); err == nil {
		t.Error("the pool no longer trusts the deleted CA")
	}
	if _, err := os.Stat(filepath.Join(f.trustDir, "ca.crt")); err == nil {
		t.Error("the file is gone")
	}
	if err := f.m.removeTrust("ca.crt"); !errors.Is(err, errTLSNotFound) {
		t.Errorf("a second delete: want errTLSNotFound, got %v", err)
	}
	if !strings.Contains(f.log.String(), "trusted CA file removed") {
		t.Errorf("the delete is logged: %s", f.log.String())
	}
}

// A delete reaches only an entry directly in the trust directory: a name that
// is a path, or that the listing could not show, is refused, and a directory
// of that name is not found. A link is removed itself; the file it points at
// never is.
func TestTLSManager_RemoveTrustReachesOnlyFilesDirectlyInTheDirectory(t *testing.T) {
	f := newTLSFix(t)
	if err := os.Mkdir(f.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"../tls.crt", "../../etc/passwd", "sub/x.crt", `sub\x.crt`, "nul\x00.crt", "tls.key", ""} {
		wantInvalid(t, f.m.removeTrust(bad), "name", "directly in the trust directory")
	}
	if _, err := os.Stat(f.certFile); err != nil {
		t.Fatal("a path outside the directory is never reached")
	}
	if err := f.m.removeTrust("absent.crt"); !errors.Is(err, errTLSNotFound) {
		t.Errorf("absent: want errTLSNotFound, got %v", err)
	}
	if err := os.Mkdir(filepath.Join(f.trustDir, "dir.crt"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := f.m.removeTrust("dir.crt"); !errors.Is(err, errTLSNotFound) {
		t.Errorf("a directory: want errTLSNotFound, got %v", err)
	}
	target := filepath.Join(f.dir, "real.crt")
	writeFile(t, target, "keep me")
	link := filepath.Join(f.trustDir, "link.crt")
	if err := os.Symlink(target, link); err == nil {
		if err := f.m.removeTrust("link.crt"); err != nil {
			t.Errorf("a link the listing shows is removed, got %v", err)
		}
		if _, err := os.Lstat(link); !errors.Is(err, os.ErrNotExist) {
			t.Error("the link is gone")
		}
		if string(mustRead(t, target)) != "keep me" {
			t.Error("the file behind a link is never removed")
		}
	}
	if _, err := os.Stat(filepath.Join(f.trustDir, "dir.crt")); err != nil {
		t.Error("the directory stays")
	}
}

// Every file the listing shows can be deleted, a host-supplied name the
// console would not write included (upper-case extension, a space, a leading
// underscore, more than 64 characters): the pool trusts them, so the console
// must be able to stop it.
func TestTLSManager_RemoveTrustTakesEveryNameTheListingShows(t *testing.T) {
	f := newTLSFix(t)
	if err := os.Mkdir(f.trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	names := []string{"Corp-Root.CRT", "my ca.pem", "_root.crt", strings.Repeat("a", 70) + ".pem"}
	for _, n := range names {
		writeFile(t, filepath.Join(f.trustDir, n), ca.certPEM)
	}
	if err := f.m.refreshTrust(); err != nil {
		t.Fatal(err)
	}
	listed := func() []string {
		var out []string
		for _, tf := range f.m.trustFiles() {
			out = append(out, tf.Name)
		}
		return out
	}
	if got := listed(); len(got) != len(names) {
		t.Fatalf("the listing shows every file: %v", got)
	}
	for _, n := range names {
		if trustNameRE.MatchString(n) {
			t.Fatalf("%q is a name the console writes; the test needs one it does not", n)
		}
		if err := f.m.removeTrust(n); err != nil {
			t.Errorf("delete %q: %v", n, err)
		}
	}
	if got := listed(); len(got) != 0 {
		t.Errorf("every listed file deleted, left: %v", got)
	}
}

func TestTLSManager_RemoveTrustFailures(t *testing.T) {
	ca := newTestCert(t, testCertSpec{cn: "ca", ca: true})
	t.Run("a delete that fails", func(t *testing.T) {
		f := newTLSFix(t)
		if _, err := f.m.addTrust("ca.crt", ca.certPEM); err != nil {
			t.Fatal(err)
		}
		before := f.m.trust.get().pool
		f.m.seams.remove = func(string) error { return errors.New("input/output error") }
		err := f.m.removeTrust("ca.crt")
		var werr *tlsWriteError
		if !errors.As(err, &werr) || !strings.Contains(f.log.String(), "input/output error") {
			t.Fatalf("want a *tlsWriteError with the cause logged, got %v", err)
		}
		if _, err := os.Stat(filepath.Join(f.trustDir, "ca.crt")); err != nil || f.m.trust.get().pool != before {
			t.Error("the file and the pool are as they were")
		}
	})
	t.Run("a pool that cannot be rebuilt", func(t *testing.T) {
		f := newTLSFix(t)
		if _, err := f.m.addTrust("ca.crt", ca.certPEM); err != nil {
			t.Fatal(err)
		}
		f.m.seams.buildPool = func(string, *slog.Logger) (*x509.CertPool, error) {
			return nil, errors.New("cannot read the trust directory")
		}
		err := f.m.removeTrust("ca.crt")
		var werr *tlsWriteError
		if !errors.As(err, &werr) || !strings.Contains(f.log.String(), "cannot read the trust directory") {
			t.Fatalf("want a *tlsWriteError with the cause logged, got %v", err)
		}
	})
}

func TestTrustFileName(t *testing.T) {
	cases := []struct{ cn, want string }{
		{"Example Root CA", "example-root-ca.crt"},
		{"corp.example (Root) -- 2026", "corp-example-root-2026.crt"},
		{"", "ca.crt"},
		{"  --  ", "ca.crt"},
		{"\u00fcn\u00ef", "n.crt"},
		{strings.Repeat("a", 70), strings.Repeat("a", 64) + ".crt"},
		{strings.Repeat("a", 63) + " bcde", strings.Repeat("a", 63) + ".crt"},
	}
	for _, c := range cases {
		got := trustFileName(&x509.Certificate{Subject: pkix.Name{CommonName: c.cn}})
		if got != c.want {
			t.Errorf("CN %q: got %q, want %q", c.cn, got, c.want)
		}
		if !trustNameRE.MatchString(got) {
			t.Errorf("CN %q: %q is not a name the console accepts", c.cn, got)
		}
	}
}

// Browsers sign a TLS handshake only with RSA keys of 2048 bits or more and
// ECDSA keys on P-256 or P-384; anything else is named, with what to issue.
func TestBrowserKeyProblem(t *testing.T) {
	const use = " Issue the certificate for an RSA key of at least 2048 bits, or an ECDSA key on P-256 or P-384."
	bits := func(n uint) *rsa.PublicKey {
		return &rsa.PublicKey{N: new(big.Int).Lsh(big.NewInt(1), n-1), E: 65537}
	}
	for _, c := range []struct {
		name string
		pub  any
		want string
	}{
		{"ECDSA P-256", &ecdsa.PublicKey{Curve: elliptic.P256()}, ""},
		{"ECDSA P-384", &ecdsa.PublicKey{Curve: elliptic.P384()}, ""},
		{"RSA 2048", bits(2048), ""},
		{"RSA 4096", bits(4096), ""},
		{"ECDSA P-521", &ecdsa.PublicKey{Curve: elliptic.P521()}, "The certificate's key is ECDSA on P-521, which Chrome and Edge cannot use for TLS." + use},
		{"ECDSA P-224", &ecdsa.PublicKey{Curve: elliptic.P224()}, "The certificate's key is ECDSA on P-224, which Chrome and Edge cannot use for TLS." + use},
		{"RSA 1024", bits(1024), "The certificate's key is RSA with 1024 bits, which browsers refuse." + use},
		{"Ed25519", ed25519.PublicKey(make([]byte, ed25519.PublicKeySize)), "The certificate's key is Ed25519, which browsers do not accept in a TLS certificate." + use},
		{"another kind", "not a key", "The certificate's key is of a kind browsers cannot use for TLS." + use},
	} {
		if got := browserKeyProblem(c.pub); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

// A pair placed on the host is served as it is, but the start says when
// browsers cannot use it.
func TestLoadOrGenerateServerCert_WarnsOfAKeyBrowsersCannotUse(t *testing.T) {
	for _, c := range []struct {
		name  string
		curve elliptic.Curve
		warn  bool
	}{{"P-521", elliptic.P521(), true}, {"P-256", elliptic.P256(), false}} {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			pair := newTestCert(t, testCertSpec{cn: "host", curve: c.curve})
			crt, key := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
			writeFile(t, crt, pair.certPEM)
			writeFile(t, key, pair.keyPEM)
			var log strings.Builder
			if _, err := loadOrGenerateServerCert(crt, key, newCapturingLogger(&log)); err != nil {
				t.Fatal(err)
			}
			warned := strings.Contains(log.String(), "browsers cannot connect with this TLS server certificate") &&
				strings.Contains(log.String(), "ECDSA on P-521")
			if warned != c.warn {
				t.Errorf("warned %v, want %v:\n%s", warned, c.warn, log.String())
			}
		})
	}
}

// A pair placed on the host is served whatever its dates, but the start warns
// when it has expired or expires within certExpiryWarning, at WARN so the
// default level shows it. A certificate with 29 days left warns; one with 31
// days left, or longer, says nothing.
func TestLoadOrGenerateServerCert_WarnsOfAnExpiredOrExpiringCertificate(t *testing.T) {
	now := time.Now()
	for _, c := range []struct {
		name     string
		notAfter time.Time
		want     string // "" for no warning
		daysLeft string // the days_left attribute, "" when the warning carries none
	}{
		{"expired", now.Add(-24 * time.Hour), "the TLS server certificate has expired", ""},
		{"expires in 3 days", now.Add(3*24*time.Hour + time.Hour), "the TLS server certificate expires soon", "days_left=3"},
		{"29 days left", now.Add(29*24*time.Hour + time.Hour), "the TLS server certificate expires soon", "days_left=29"},
		{"31 days left", now.Add(31 * 24 * time.Hour), "", ""},
		{"a year left", now.Add(365 * 24 * time.Hour), "", ""},
	} {
		t.Run(c.name, func(t *testing.T) {
			dir := t.TempDir()
			pair := newTestCert(t, testCertSpec{cn: "host", notBefore: now.Add(-400 * 24 * time.Hour), notAfter: c.notAfter})
			crt, key := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
			writeFile(t, crt, pair.certPEM)
			writeFile(t, key, pair.keyPEM)
			var log strings.Builder
			if _, err := loadOrGenerateServerCert(crt, key, newCapturingLogger(&log)); err != nil {
				t.Fatal(err)
			}
			got := log.String()
			if c.want == "" {
				if strings.Contains(got, "TLS server certificate has expired") || strings.Contains(got, "TLS server certificate expires soon") {
					t.Errorf("no warning for a certificate beyond the 30-day threshold:\n%s", got)
				}
				return
			}
			if !strings.Contains(got, c.want) || !strings.Contains(got, "level=WARN") || !strings.Contains(got, "not_after="+c.notAfter.UTC().Format(time.RFC3339)) {
				t.Errorf("want a WARN %q naming not_after:\n%s", c.want, got)
			}
			if c.daysLeft != "" && !strings.Contains(got, c.daysLeft) {
				t.Errorf("want %s:\n%s", c.daysLeft, got)
			}
		})
	}
}

// The console shows a distinguished name as openssl prints it: every
// attribute in the certificate's order, by its short name, with an OID for an
// attribute it has no name for. (Go's own String reverses the order and shows
// UID and emailAddress as hex.)
func TestReadableName(t *testing.T) {
	oid := func(ids ...int) asn1.ObjectIdentifier { return asn1.ObjectIdentifier(ids) }
	var n pkix.Name
	n.FillFromRDNSequence(&pkix.RDNSequence{
		{{Type: oid(2, 5, 4, 3), Value: "hamaster"}},
		{{Type: oid(2, 5, 4, 6), Value: "SG"}},
		{{Type: oid(2, 5, 4, 7), Value: "Singapore"}},
		{{Type: oid(2, 5, 4, 10), Value: "HAFIO"}},
		{{Type: oid(2, 5, 4, 11), Value: "ITO"}},
		{{Type: oid(0, 9, 2342, 19200300, 100, 1, 1), Value: "hamaster"}},
		{{Type: oid(1, 2, 840, 113549, 1, 9, 1), Value: "hamaster@hafio.tv"}},
		{{Type: oid(1, 2, 3, 4), Value: "other"}},
	})
	want := "CN=hamaster, C=SG, L=Singapore, O=HAFIO, OU=ITO, UID=hamaster, emailAddress=hamaster@hafio.tv, 1.2.3.4=other"
	if got := readableName(n); got != want {
		t.Errorf("got  %q\nwant %q", got, want)
	}
	if got := readableName(pkix.Name{}); got != "" {
		t.Errorf("an empty name: got %q", got)
	}
}
