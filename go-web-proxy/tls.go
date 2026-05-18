package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// loadOrGenerateServerCert returns the TLS keypair to serve from :443.
//   - If both files exist, parse them. On parse failure, return an error (do NOT
//     regenerate over user-supplied material).
//   - If either file is missing, generate a self-signed ECDSA P-256 cert valid
//     for 365 days with CN=localhost and SANs DNS:localhost, IP:::1, IP:127.0.0.1.
//     Write cert (0644) and key (0600), creating parent directories as needed.
func loadOrGenerateServerCert(certFile, keyFile string, logger *slog.Logger) (tls.Certificate, error) {
	certExists := fileExists(certFile)
	keyExists := fileExists(keyFile)

	if certExists && keyExists {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("parse keypair %s / %s: %w (refusing to overwrite user-supplied material)", certFile, keyFile, err)
		}
		logger.Info("loaded TLS server certificate", "cert_file", certFile, "key_file", keyFile)
		return cert, nil
	}

	logger.Warn("TLS material missing — generating self-signed certificate",
		"cert_file", certFile, "cert_exists", certExists,
		"key_file", keyFile, "key_exists", keyExists,
	)

	cert, err := generateSelfSigned(certFile, keyFile)
	if err != nil {
		return tls.Certificate{}, err
	}

	fp := sha256.Sum256(cert.Certificate[0])
	logger.Warn("self-signed certificate generated",
		"cert_file", certFile,
		"key_file", keyFile,
		"sha256_fingerprint", formatFingerprint(fp[:]),
		"validity_days", 365,
	)
	return cert, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func generateSelfSigned(certFile, keyFile string) (tls.Certificate, error) {
	if err := os.MkdirAll(filepath.Dir(certFile), 0o755); err != nil {
		return tls.Certificate{}, fmt.Errorf("mkdir %s: %w", filepath.Dir(certFile), err)
	}
	if err := os.MkdirAll(filepath.Dir(keyFile), 0o755); err != nil {
		return tls.Certificate{}, fmt.Errorf("mkdir %s: %w", filepath.Dir(keyFile), err)
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate serial: %w", err)
	}

	now := time.Now()
	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "localhost"},
		NotBefore:             now.Add(-time.Minute),
		NotAfter:              now.Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost"},
		IPAddresses:           []net.IP{net.IPv6loopback, net.IPv4(127, 0, 0, 1)},
	}

	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("create certificate: %w", err)
	}

	if err := writePEM(certFile, 0o644, &pem.Block{Type: "CERTIFICATE", Bytes: der}); err != nil {
		return tls.Certificate{}, err
	}

	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("marshal key: %w", err)
	}
	if err := writePEM(keyFile, 0o600, &pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}); err != nil {
		return tls.Certificate{}, err
	}

	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("reload generated keypair: %w", err)
	}
	return cert, nil
}

func writePEM(path string, mode os.FileMode, block *pem.Block) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	if err := pem.Encode(f, block); err != nil {
		return fmt.Errorf("encode %s: %w", path, err)
	}
	return nil
}

func formatFingerprint(b []byte) string {
	hexStr := hex.EncodeToString(b)
	var sb strings.Builder
	for i := 0; i < len(hexStr); i += 2 {
		if i > 0 {
			sb.WriteByte(':')
		}
		sb.WriteString(strings.ToUpper(hexStr[i : i+2]))
	}
	return sb.String()
}

// buildTrustPool returns the CA pool used by the upstream Transport.
// Starts with the system pool (or an empty pool if none) and appends every PEM
// block found in *.crt / *.pem files under trustDir (non-recursive).
func buildTrustPool(trustDir string, logger *slog.Logger) (*x509.CertPool, error) {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		logger.Debug("system cert pool unavailable; starting empty", "err", err)
		pool = x509.NewCertPool()
	}

	info, err := os.Stat(trustDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			logger.Info("trust dir not present; using system pool only", "trust_dir", trustDir)
			return pool, nil
		}
		return nil, fmt.Errorf("stat trust dir %s: %w", trustDir, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("trust dir %s is not a directory", trustDir)
	}

	entries, err := os.ReadDir(trustDir)
	if err != nil {
		return nil, fmt.Errorf("read trust dir %s: %w", trustDir, err)
	}

	addedCerts := 0
	addedFiles := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".crt" && ext != ".pem" {
			continue
		}
		path := filepath.Join(trustDir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			logger.Warn("trust file unreadable; skipping", "path", path, "err", err)
			continue
		}
		n := appendPEMCerts(pool, data)
		if n == 0 {
			logger.Warn("trust file contained no certificates", "path", path)
			continue
		}
		addedCerts += n
		addedFiles = append(addedFiles, name)
	}

	logger.Info("trust pool ready",
		"trust_dir", trustDir,
		"added_files", addedFiles,
		"added_certs", addedCerts,
	)
	return pool, nil
}

// appendPEMCerts walks every PEM block in data and adds CERTIFICATE blocks to
// the pool. Returns the number of certificates added.
func appendPEMCerts(pool *x509.CertPool, data []byte) int {
	added := 0
	rest := data
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return added
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}
		pool.AddCert(cert)
		added++
	}
}
