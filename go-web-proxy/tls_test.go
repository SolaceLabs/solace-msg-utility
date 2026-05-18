package main

import (
	"crypto/x509"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
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
	if d := parsed.NotAfter.Sub(parsed.NotBefore); d < 364*24*time.Hour || d > 366*24*time.Hour {
		t.Errorf("validity window %s outside ~365d", d)
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

func TestLoadOrGenerateServerCert_GeneratesWhenOnlyOneFilePresent(t *testing.T) {
	dir := t.TempDir()
	certPath := filepath.Join(dir, "tls.crt")
	keyPath := filepath.Join(dir, "tls.key")
	// Only cert present — generate path should trigger (and overwrite the stray cert).
	if err := os.WriteFile(certPath, []byte("stray"), 0o644); err != nil {
		t.Fatal(err)
	}
	cert, err := loadOrGenerateServerCert(certPath, keyPath, quietLogger())
	if err != nil {
		t.Fatalf("want generation, got error: %v", err)
	}
	if len(cert.Certificate) == 0 {
		t.Fatal("returned cert has no DER")
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
