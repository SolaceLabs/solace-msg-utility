package main

import (
	"crypto/x509"
	"encoding/pem"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError + 1}))
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

	// Cert/key files must exist with the right permissions on the cert.
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
	// User material must still be on disk — verifies the no-silent-overwrite contract.
	data, _ := os.ReadFile(certPath)
	if string(data) != "not a real PEM" {
		t.Fatal("corrupt cert file was overwritten — violates safety contract")
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
	// Non-existent directory: must still return a usable pool (system pool fallback).
	pool, err := buildTrustPool(filepath.Join(t.TempDir(), "absent"), quietLogger())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pool == nil {
		t.Fatal("nil pool returned")
	}
}

func TestBuildTrustPool_AddsCerts(t *testing.T) {
	dir := t.TempDir()

	// Generate one valid CA via the existing helper, then read the PEM back.
	cp := filepath.Join(dir, "src.crt")
	kp := filepath.Join(dir, "src.key")
	if _, err := generateSelfSigned(cp, kp); err != nil {
		t.Fatalf("seed cert: %v", err)
	}
	certPEM, err := os.ReadFile(cp)
	if err != nil {
		t.Fatal(err)
	}

	trustDir := filepath.Join(dir, "trust")
	if err := os.MkdirAll(trustDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(trustDir, "ca.crt"), certPEM, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(trustDir, "ca.pem"), certPEM, 0o644); err != nil {
		t.Fatal(err)
	}
	// .txt file MUST be ignored.
	if err := os.WriteFile(filepath.Join(trustDir, "notes.txt"), []byte("not a cert"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Subdirectory MUST be ignored (non-recursive).
	if err := os.MkdirAll(filepath.Join(trustDir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(trustDir, "sub", "deep.crt"), certPEM, 0o644); err != nil {
		t.Fatal(err)
	}

	pool, err := buildTrustPool(trustDir, quietLogger())
	if err != nil {
		t.Fatalf("buildTrustPool: %v", err)
	}
	if pool == nil {
		t.Fatal("nil pool")
	}
	// We can't easily count pool entries, but Subjects() works on system+added.
	subjects := pool.Subjects() //nolint:staticcheck // x509.CertPool.Subjects is the only stdlib way to introspect added certs.
	found := 0
	for _, s := range subjects {
		if strings.Contains(string(s), "localhost") {
			found++
		}
	}
	if found < 1 {
		t.Errorf("expected at least one 'localhost' subject in pool, got %d", found)
	}
}

func TestBuildTrustPool_RejectsFile(t *testing.T) {
	dir := t.TempDir()
	notADir := filepath.Join(dir, "trust")
	if err := os.WriteFile(notADir, []byte("file"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := buildTrustPool(notADir, quietLogger())
	if err == nil {
		t.Fatal("expected error when trust dir is a regular file")
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
