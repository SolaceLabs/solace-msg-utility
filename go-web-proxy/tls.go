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
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// bootstrapCertValidity is how long a generated pair lasts: long enough to
// reach the admin console and put a real certificate in place, short enough
// that no deployment runs on it. It is never renewed.
const bootstrapCertValidity = 7 * 24 * time.Hour

// certExpiryWarning is how close to its end a loaded server certificate is
// when the start warns that it expires soon. The bootstrap pair is always
// that close, so every start on it warns.
const certExpiryWarning = 30 * 24 * time.Hour

// loadOrGenerateServerCert returns the TLS keypair the gateway serves.
//   - Both files exist: parse them. A pair that does not parse stops the
//     start; the gateway never writes over material it did not make.
//   - Exactly one exists: stop the start too. Half a pair is the operator's
//     (a key whose certificate is not issued yet, say), and generating would
//     replace it.
//   - Neither: generate a self-signed ECDSA P-256 bootstrap pair, valid for
//     bootstrapCertValidity, with CN=localhost and SANs DNS:localhost,
//     IP:::1, IP:127.0.0.1. Write cert (0644) and key (0600), creating parent
//     directories as needed.
func loadOrGenerateServerCert(certFile, keyFile string, logger *slog.Logger) (tls.Certificate, error) {
	certExists := fileExists(certFile)
	keyExists := fileExists(keyFile)

	if certExists && keyExists {
		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return tls.Certificate{}, fmt.Errorf("parse keypair %s / %s: %w (refusing to overwrite user-supplied material)", certFile, keyFile, err)
		}
		logger.Info("loaded TLS server certificate", "cert_file", certFile, "key_file", keyFile)
		// Placed on the host, it is served as it is; the console would have refused it.
		if problem := browserKeyProblem(cert.Leaf.PublicKey); problem != "" {
			logger.Warn("browsers cannot connect with this TLS server certificate", "cert_file", certFile, "reason", problem)
		}
		warnIfExpiring(logger, certFile, cert.Leaf, time.Now())
		return cert, nil
	}
	if certExists != keyExists {
		present, missing := certFile, keyFile
		if keyExists {
			present, missing = keyFile, certFile
		}
		return tls.Certificate{}, fmt.Errorf("TLS material incomplete: %s exists but %s does not. Add the missing file, or remove %s so the gateway generates a self-signed bootstrap pair", present, missing, present)
	}

	logger.Warn("TLS material missing: generating a self-signed bootstrap certificate",
		"cert_file", certFile, "key_file", keyFile,
	)

	cert, err := generateSelfSigned(certFile, keyFile)
	if err != nil {
		return tls.Certificate{}, err
	}

	fp := sha256.Sum256(cert.Certificate[0])
	logger.Warn("self-signed bootstrap certificate generated; it expires and is never renewed: put your own certificate and key in place before then",
		"cert_file", certFile,
		"key_file", keyFile,
		"sha256_fingerprint", formatFingerprint(fp[:]),
		"validity_days", int(bootstrapCertValidity/(24*time.Hour)),
	)
	return cert, nil
}

// warnIfExpiring logs, at WARN so it shows at the default level, a loaded
// server certificate that has expired or expires within certExpiryWarning.
// Without it the operator learns of it from browsers.
func warnIfExpiring(logger *slog.Logger, certFile string, leaf *x509.Certificate, now time.Time) {
	notAfter := leaf.NotAfter.UTC().Format(time.RFC3339)
	switch left := leaf.NotAfter.Sub(now); {
	case left <= 0:
		logger.Warn("the TLS server certificate has expired, so browsers refuse it: put a renewed certificate and key in place (the Certificates page of the admin console in Provisioned mode, or the files named here)",
			"cert_file", certFile, "not_after", notAfter)
	case left <= certExpiryWarning:
		logger.Warn("the TLS server certificate expires soon: put a renewed certificate and key in place before then (the Certificates page of the admin console in Provisioned mode, or the files named here)",
			"cert_file", certFile, "not_after", notAfter, "days_left", int(left/(24*time.Hour)))
	}
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
		NotAfter:              now.Add(bootstrapCertValidity),
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

// writePEM writes block to path through path.partial: the data is synced
// and closed, and only then renamed into place, so path is either absent or
// whole; the directory is synced after the rename. A failed write removes the partial: a truncated file would make the
// next start refuse "user-supplied material" the gateway wrote itself.
func writePEM(path string, mode os.FileMode, block *pem.Block) error {
	partial := path + ".partial"
	_ = os.Remove(partial) // left by a write that stopped; created afresh with mode
	f, err := os.OpenFile(partial, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("open %s: %w", partial, err)
	}
	err = pem.Encode(f, block)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(partial, path)
	}
	if err == nil {
		err = syncDir(filepath.Dir(path))
	}
	if err != nil {
		_ = os.Remove(partial)
		return fmt.Errorf("write %s: %w", path, err)
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

// standardRootsFile is the standard root CA bundle the image carries: the
// Mozilla list as Alpine's ca-certificates-bundle packages it, copied from the
// gateway's build stage (docker/Dockerfile). The gateway reads this file
// itself, never the host's or Go's system roots, so what it trusts is what the
// image holds.
const standardRootsFile = "/etc/ssl/certs/ca-certificates.crt"

// The reasons the standard roots gave no certificate, as the console shows them.
const (
	standardRootsMissing    = "The gateway image holds no standard root CA bundle."
	standardRootsUnreadable = "The standard root CA bundle cannot be read."
	standardRootsEmpty      = "The standard root CA bundle holds no certificate."
)

// standardRoots is the standard root CA bundle as read at start. problem says
// why it gave no certificate ("" when it did); pool is nil then.
type standardRoots struct {
	certs   []*x509.Certificate
	pool    *x509.CertPool
	problem string
}

// loadStandardRoots reads the bundle at path ("" is none). A bundle that is
// missing, unreadable or empty leaves only the trust directory trusted; the
// start goes on, and holdStandard warns when tls.standardRoots is on.
func loadStandardRoots(path string) standardRoots {
	if path == "" {
		return standardRoots{problem: standardRootsMissing}
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return standardRoots{problem: standardRootsMissing}
	}
	if err != nil {
		return standardRoots{problem: standardRootsUnreadable}
	}
	certs := pemCertificates(data)
	if len(certs) == 0 {
		return standardRoots{problem: standardRootsEmpty}
	}
	pool := x509.NewCertPool()
	for _, c := range certs {
		pool.AddCert(c)
	}
	return standardRoots{certs: certs, pool: pool}
}

// buildTrustPool returns the pool of the CAs in the trust directory: every
// PEM certificate in its *.crt and *.pem files (non-recursive). The standard
// roots are a pool of their own (standardRoots), which verify adds while
// tls.standardRoots is on.
func buildTrustPool(trustDir string, logger *slog.Logger) (*x509.CertPool, error) {
	pool := x509.NewCertPool()

	info, err := os.Stat(trustDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			logger.Info("trust dir not present; it adds no CAs", "trust_dir", trustDir)
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

// ----- the certificate and the trust the gateway holds, live ---------------------------

// certHolder holds the pair the listener serves. tls.Config.GetCertificate
// reads it per handshake, so replacing the pair (set) reaches the next
// handshake while open connections carry on with the one they made. Every
// pair comes from tls.LoadX509KeyPair or tls.X509KeyPair, which fill Leaf.
type certHolder struct {
	cur atomic.Pointer[tls.Certificate]
}

func newCertHolder(pair tls.Certificate) *certHolder {
	h := &certHolder{}
	h.set(pair)
	return h
}

func (h *certHolder) set(pair tls.Certificate) { h.cur.Store(&pair) }

func (h *certHolder) get() *tls.Certificate { return h.cur.Load() }

// getCertificate is the listener's tls.Config.GetCertificate.
func (h *certHolder) getCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	return h.get(), nil
}

// trustState is what every outbound TLS connection verifies a broker with:
// the trust directory's CA pool, whether the standard roots count as well
// (config.yaml's tls.standardRoots) and whether to skip the check
// (tls.insecureSkipVerify).
type trustState struct {
	pool     *x509.CertPool
	standard bool
	skip     bool
}

// trustHolder holds the current trustState. The upstream transport reads it
// when it connects (verify); a change swaps it and runs the onChange
// hooks, which close the transport's idle connections so the next request
// handshakes under the new trust. Open connections and sockets carry on.
type trustHolder struct {
	cur   atomic.Pointer[trustState]
	mu    sync.Mutex // writers; readers use cur
	hooks []func()
	// roots is the standard root CA bundle, read once at start and set by
	// holdStandard before the gateway serves; readers take it without a lock.
	roots  standardRoots
	logger *slog.Logger
}

// newTrustHolder holds pool and skip. A holder that starts with skip on warns
// at once, as a later change to on does.
func newTrustHolder(pool *x509.CertPool, skip bool, logger *slog.Logger) *trustHolder {
	h := &trustHolder{logger: logger}
	h.cur.Store(&trustState{pool: pool, skip: skip})
	if skip {
		h.warnSkip()
	}
	return h
}

func (h *trustHolder) warnSkip() {
	h.logger.Warn("tls.insecureSkipVerify is true (config.yaml; seeded by SMU_SSL_SKIP_CERT_VERIFY): upstream certificates will NOT be validated")
}

func (h *trustHolder) get() trustState { return *h.cur.Load() }

// holdStandard takes the standard roots read at start and whether they count
// (tls.standardRoots). Call it once, before the gateway serves. It logs how
// many there are, and warns when they count but the bundle gave none.
func (h *trustHolder) holdStandard(roots standardRoots, on bool) {
	h.roots = roots
	s := h.get()
	s.standard = on
	h.cur.Store(&s)
	if on && roots.problem != "" {
		h.logger.Warn("tls.standardRoots is true but no standard root CA was read; only the trust directory is trusted", "problem", roots.problem)
		return
	}
	h.logger.Info("standard root CAs", "count", len(roots.certs), "trusted", on)
}

// onChange registers f to run after every change of the trust.
func (h *trustHolder) onChange(f func()) {
	h.mu.Lock()
	h.hooks = append(h.hooks, f)
	h.mu.Unlock()
}

// change swaps in mutate's result and, when it says so, runs the hooks.
func (h *trustHolder) change(mutate func(trustState) (trustState, bool)) {
	h.mu.Lock()
	next, changed := mutate(h.get())
	if !changed {
		h.mu.Unlock()
		return
	}
	h.cur.Store(&next)
	hooks := slices.Clone(h.hooks)
	h.mu.Unlock()
	for _, f := range hooks {
		f()
	}
}

// setPool swaps in a rebuilt CA pool.
func (h *trustHolder) setPool(pool *x509.CertPool) {
	h.change(func(s trustState) (trustState, bool) {
		s.pool = pool
		return s, true
	})
}

// setSkip applies tls.insecureSkipVerify. Setting what is already held does
// nothing; turning it on is warned about.
func (h *trustHolder) setSkip(skip bool) {
	h.change(func(s trustState) (trustState, bool) {
		if s.skip == skip {
			return s, false
		}
		s.skip = skip
		if skip {
			h.warnSkip()
		}
		return s, true
	})
}

// setStandard applies tls.standardRoots. Setting what is already held does
// nothing.
func (h *trustHolder) setStandard(on bool) {
	h.change(func(s trustState) (trustState, bool) {
		if s.standard == on {
			return s, false
		}
		s.standard = on
		h.logger.Info("standard root CAs", "count", len(h.roots.certs), "trusted", on)
		return s, true
	})
}

// verify is the upstream transport's certificate check (dialUpstreamTLS): it
// verifies the broker's certificate chain against the trust directory's pool
// held now, then, when that fails and the standard roots count, against them,
// and the name against host, the host the request asked for; or it accepts the
// connection when skip is on. The first failure is the one returned. host is
// passed in because ConnectionState.ServerName is empty for an IP address,
// which would silently skip the name check.
func (h *trustHolder) verify(cs tls.ConnectionState, host string) error {
	st := h.get()
	if st.skip {
		return nil
	}
	intermediates := x509.NewCertPool()
	for _, c := range cs.PeerCertificates[1:] {
		intermediates.AddCert(c)
	}
	opts := x509.VerifyOptions{DNSName: host, Roots: st.pool, Intermediates: intermediates}
	_, err := cs.PeerCertificates[0].Verify(opts)
	if err != nil && st.standard && h.roots.pool != nil {
		opts.Roots = h.roots.pool
		if _, serr := cs.PeerCertificates[0].Verify(opts); serr == nil {
			return nil
		}
	}
	return err
}

// ----- the TLS manager: what the console reads and changes ----------------------------

// tlsCertJSON describes one certificate to the console. Times are
// RFC 3339 UTC; SHA256 is the fingerprint as upper-case hex pairs joined by
// colons; Names are the DNS names then the IP addresses.
type tlsCertJSON struct {
	Subject    string   `json:"subject"`
	Issuer     string   `json:"issuer"`
	Names      []string `json:"names"`
	NotBefore  string   `json:"notBefore"`
	NotAfter   string   `json:"notAfter"`
	SHA256     string   `json:"sha256"`
	SelfSigned bool     `json:"selfSigned"`
	Expired    bool     `json:"expired"`
}

// tlsTrustFileJSON is one file of the trust directory. Problem says why a file
// gave no certificate ("" when it did); paths never appear.
type tlsTrustFileJSON struct {
	Name         string        `json:"name"`
	Certificates []tlsCertJSON `json:"certificates"`
	Problem      string        `json:"problem"`
}

// tlsStandardJSON is the standard root CAs: whether they are trusted now
// (tls.standardRoots), each one, sorted by subject, and why the bundle gave
// none ("" when it did).
type tlsStandardJSON struct {
	Trusted      bool          `json:"trusted"`
	Certificates []tlsCertJSON `json:"certificates"`
	Problem      string        `json:"problem"`
}

// tlsStateJSON is the GET /managed/tls body.
type tlsStateJSON struct {
	Certificate         tlsCertJSON        `json:"certificate"`
	CertificateWritable bool               `json:"certificateWritable"`
	TrustWritable       bool               `json:"trustWritable"`
	Trust               []tlsTrustFileJSON `json:"trust"`
	Standard            tlsStandardJSON    `json:"standard"`
}

// tlsInvalidError is a certificate, key or file name the manager refused: the
// API answers 422 invalid with Field and Reason. Reason is plain words and
// never holds key material.
type tlsInvalidError struct{ Field, Reason string }

func (e *tlsInvalidError) Error() string { return e.Field + ": " + e.Reason }

// tlsWriteError is a write that failed after the input was accepted; nothing
// was changed (or, for a delete whose pool rebuild failed, the file is gone and
// the pool is as it was). The cause is already logged; the API answers 500
// tls_write_failed without it.
type tlsWriteError struct{ cause error }

func (e *tlsWriteError) Error() string { return "TLS files not written: " + e.cause.Error() }
func (e *tlsWriteError) Unwrap() error { return e.cause }

var (
	// errTLSReadOnly: the directory cannot be written, or the certificate and
	// its key are not in one directory. The API answers 409 tls_read_only.
	errTLSReadOnly = errors.New("the TLS files are read-only on the gateway host")
	// errTLSExists: a CA file of that name is there (409 exists).
	errTLSExists = errors.New("a CA file with that name already exists")
	// errTLSNotFound: no such file directly in the trust directory, or a
	// directory of that name (404 not_found).
	errTLSNotFound = errors.New("there is no such CA file")
)

// trustNameRE is the CA file names the console writes: a plain name directly
// in the trust directory, ending in .crt or .pem.
var trustNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(crt|pem)$`)

// trustListedName reports whether name is one the trust listing can show
// (trustFiles' rule): one path element ending in .crt or .pem, in any case.
// A delete takes every such name, so the console can remove any file it lists,
// one placed on the host under another name included; a new file is held to
// trustNameRE.
func trustListedName(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return (ext == ".crt" || ext == ".pem") && !strings.ContainsAny(name, "/\\\x00")
}

// dashRuns is a run of dashes, which trustFileName makes one.
var dashRuns = regexp.MustCompile(`-+`)

const trustNameReason = "Use letters, digits, dots, dashes and underscores, start with a letter or digit, end in .crt or .pem, and keep the name before the extension to 64 characters."

// trustDeleteReason is a delete's refusal of a name the listing cannot show.
const trustDeleteReason = "Name one .crt or .pem file directly in the trust directory."

// tlsSeams are the faults tests make: production uses newTLSManager's defaults.
type tlsSeams struct {
	// journal hooks the certificate pair's commit.
	journal journalHooks
	// probe is nil when a new file can be created in dir.
	probe func(dir string) error
	// write puts a trust file in place; remove deletes one.
	write  func(path string, data []byte, perm fs.FileMode) error
	remove func(path string) error
	// buildPool rebuilds the CA pool from the trust directory.
	buildPool func(dir string, logger *slog.Logger) (*x509.CertPool, error)
}

// tlsManager is what the TLS API calls: it describes the certificate and the
// trusted CAs, verifies a certificate and key, and changes either live. One
// lock serialises the writes; the last write wins (no rev). The certificate
// pair is written as one journaled commit in its directory, so a crash never
// leaves half a pair; recoverTLSPair finishes that at start.
type tlsManager struct {
	certFile, keyFile, trustDir string // from the environment (tlsPaths)

	cert   *certHolder
	trust  *trustHolder
	logger *slog.Logger
	now    func() time.Time
	seams  tlsSeams
	mu     sync.Mutex // serialises the writes
}

func newTLSManager(certFile, keyFile, trustDir string, cert *certHolder, trust *trustHolder, logger *slog.Logger) *tlsManager {
	return &tlsManager{
		certFile: certFile,
		keyFile:  keyFile,
		trustDir: trustDir,
		cert:     cert,
		trust:    trust,
		logger:   logger,
		now:      time.Now,
		seams:    tlsSeams{probe: probeWritable, write: atomicWrite, remove: os.Remove, buildPool: buildTrustPool},
	}
}

// recoverTLSPair runs at start, before the pair is loaded: a replacement the
// last process left half done is rolled back (or its leftovers swept) in the
// certificate's directory. A certificate and key in two directories were never
// written by a journal, so there is nothing to recover.
func recoverTLSPair(certFile, keyFile string, logger *slog.Logger) error {
	dir := filepath.Dir(certFile)
	if filepath.Clean(dir) != filepath.Clean(filepath.Dir(keyFile)) {
		return nil
	}
	return recoverDir(dir, []string{filepath.Base(certFile), filepath.Base(keyFile)}, logger)
}

// probeWritable reports whether a new file can be created in dir (a read-only
// mount cannot), by creating and removing one.
func probeWritable(dir string) error {
	f, err := os.CreateTemp(dir, tempPrefix+"probe-*")
	if err != nil {
		return err
	}
	return errors.Join(f.Close(), os.Remove(f.Name()))
}

// atomicWrite writes data to path through a synced temp file and a rename, so
// path is absent or whole. A failure leaves no temp behind.
func atomicWrite(path string, data []byte, perm fs.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := writeTemp(dir, data, perm)
	if err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return syncDir(dir)
}

// certificateWritable: the pair can be replaced from the console when the
// certificate and its key share a directory that takes a new file.
func (m *tlsManager) certificateWritable() bool {
	dir := filepath.Dir(m.certFile)
	return filepath.Clean(dir) == filepath.Clean(filepath.Dir(m.keyFile)) && m.seams.probe(dir) == nil
}

// trustWritable: CA files can be added and deleted when the trust directory
// takes a new file, or does not exist yet and its parent does.
func (m *tlsManager) trustWritable() bool {
	dir := m.trustDir
	if _, err := os.Stat(dir); errors.Is(err, fs.ErrNotExist) {
		dir = filepath.Dir(dir)
	}
	return m.seams.probe(dir) == nil
}

// nameLabels are the short names openssl prints for the distinguished-name
// attributes certificates commonly carry; any other is shown by its OID.
var nameLabels = map[string]string{
	"2.5.4.3":                    "CN",
	"2.5.4.4":                    "SN",
	"2.5.4.5":                    "serialNumber",
	"2.5.4.6":                    "C",
	"2.5.4.7":                    "L",
	"2.5.4.8":                    "ST",
	"2.5.4.9":                    "street",
	"2.5.4.10":                   "O",
	"2.5.4.11":                   "OU",
	"2.5.4.12":                   "title",
	"2.5.4.17":                   "postalCode",
	"2.5.4.42":                   "GN",
	"0.9.2342.19200300.100.1.1":  "UID",
	"0.9.2342.19200300.100.1.25": "DC",
	"1.2.840.113549.1.9.1":       "emailAddress",
}

// readableName shows a distinguished name as openssl does: every attribute,
// in the order the certificate holds them, by its short name
// ("CN=gw.example, O=Example, emailAddress=ops@example.com"). Go's
// pkix.Name.String reverses that order and prints the attributes it has no
// name for, UID and emailAddress among them, as hex.
func readableName(n pkix.Name) string {
	parts := make([]string, 0, len(n.Names))
	for _, a := range n.Names {
		label, ok := nameLabels[a.Type.String()]
		if !ok {
			label = a.Type.String()
		}
		parts = append(parts, fmt.Sprintf("%s=%v", label, a.Value))
	}
	return strings.Join(parts, ", ")
}

// browserKeyProblem says why browsers cannot use a certificate with public key
// pub for TLS, or "". Chrome and Edge sign a handshake only with an RSA key or
// an ECDSA key on P-256 or P-384: with a P-521 or Ed25519 certificate every
// handshake fails ("peer doesn't support any of the certificate's signature
// algorithms"). An RSA key under 2048 bits is refused by browsers as well.
func browserKeyProblem(pub any) string {
	const use = " Issue the certificate for an RSA key of at least 2048 bits, or an ECDSA key on P-256 or P-384."
	switch k := pub.(type) {
	case *ecdsa.PublicKey:
		if k.Curve == elliptic.P256() || k.Curve == elliptic.P384() {
			return ""
		}
		return "The certificate's key is ECDSA on " + k.Curve.Params().Name + ", which Chrome and Edge cannot use for TLS." + use
	case *rsa.PublicKey:
		if k.N.BitLen() >= 2048 {
			return ""
		}
		return fmt.Sprintf("The certificate's key is RSA with %d bits, which browsers refuse.", k.N.BitLen()) + use
	case ed25519.PublicKey:
		return "The certificate's key is Ed25519, which browsers do not accept in a TLS certificate." + use
	}
	return "The certificate's key is of a kind browsers cannot use for TLS." + use
}

// describe is the console's view of c.
func (m *tlsManager) describe(c *x509.Certificate) tlsCertJSON {
	names := make([]string, 0, len(c.DNSNames)+len(c.IPAddresses))
	names = append(names, c.DNSNames...)
	for _, ip := range c.IPAddresses {
		names = append(names, ip.String())
	}
	sum := sha256.Sum256(c.Raw)
	return tlsCertJSON{
		Subject:    readableName(c.Subject),
		Issuer:     readableName(c.Issuer),
		Names:      names,
		NotBefore:  c.NotBefore.UTC().Format(time.RFC3339),
		NotAfter:   c.NotAfter.UTC().Format(time.RFC3339),
		SHA256:     formatFingerprint(sum[:]),
		SelfSigned: bytes.Equal(c.RawSubject, c.RawIssuer),
		Expired:    m.now().After(c.NotAfter),
	}
}

// state is the GET /managed/tls body.
func (m *tlsManager) state() tlsStateJSON {
	return tlsStateJSON{
		Certificate:         m.describe(m.cert.get().Leaf),
		CertificateWritable: m.certificateWritable(),
		TrustWritable:       m.trustWritable(),
		Trust:               m.trustFiles(),
		Standard:            m.standard(),
	}
}

// standard describes the standard roots for the console.
func (m *tlsManager) standard() tlsStandardJSON {
	out := tlsStandardJSON{Trusted: m.trust.get().standard, Certificates: []tlsCertJSON{}, Problem: m.trust.roots.problem}
	for _, c := range m.trust.roots.certs {
		out.Certificates = append(out.Certificates, m.describe(c))
	}
	slices.SortStableFunc(out.Certificates, func(a, b tlsCertJSON) int { return strings.Compare(a.Subject, b.Subject) })
	return out
}

// trustFiles lists the trust directory as the pool reads it: every .crt and
// .pem file (any case) directly in it, by name. A directory that is missing or
// cannot be listed gives an empty list.
func (m *tlsManager) trustFiles() []tlsTrustFileJSON {
	out := []tlsTrustFileJSON{}
	entries, err := os.ReadDir(m.trustDir)
	if err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			m.logger.Warn("trust directory cannot be listed", "err", err)
		}
		return out
	}
	for _, e := range entries {
		ext := strings.ToLower(filepath.Ext(e.Name()))
		if e.IsDir() || (ext != ".crt" && ext != ".pem") {
			continue
		}
		f := tlsTrustFileJSON{Name: e.Name(), Certificates: []tlsCertJSON{}}
		data, err := os.ReadFile(filepath.Join(m.trustDir, e.Name()))
		if err != nil {
			f.Problem = "The file cannot be read."
			out = append(out, f)
			continue
		}
		for _, c := range pemCertificates(data) {
			f.Certificates = append(f.Certificates, m.describe(c))
		}
		if len(f.Certificates) == 0 {
			f.Problem = "The file holds no certificate."
		}
		out = append(out, f)
	}
	return out
}

// pemCertificates returns the certificates in data, skipping every other block
// and every certificate that does not parse (appendPEMCerts' rule).
func pemCertificates(data []byte) []*x509.Certificate {
	var out []*x509.Certificate
	for rest := data; ; {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return out
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		if c, err := x509.ParseCertificate(block.Bytes); err == nil {
			out = append(out, c)
		}
	}
}

// parseCertificatePEM reads text as certificates and nothing else: at least
// one CERTIFICATE block, no other block, no text after the last block. problem
// is the refusal in plain words, "" when text is fine. Only a block's type is
// ever repeated in it, so a key sent here is never echoed.
func parseCertificatePEM(text string) (certs []*x509.Certificate, problem string) {
	rest := []byte(text)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		if block.Type != "CERTIFICATE" {
			if strings.HasSuffix(block.Type, "PRIVATE KEY") {
				return nil, "A private key was found. A private key never belongs here: send only the certificate."
			}
			return nil, fmt.Sprintf("A %q block was found. Only CERTIFICATE blocks are accepted.", block.Type)
		}
		c, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, "A CERTIFICATE block cannot be read as a certificate."
		}
		certs = append(certs, c)
	}
	switch {
	case len(certs) == 0:
		return nil, "No certificate was found. Send the PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----."
	case len(bytes.TrimSpace(rest)) > 0:
		return nil, "There is text after the last certificate block. Send only certificate blocks."
	}
	return certs, ""
}

// parseKeyPEM reads text as exactly one private key (an EC PARAMETERS block,
// which openssl writes beside an EC key, is skipped). problem is the refusal
// in plain words; only a block's type is ever repeated in it.
func parseKeyPEM(text string) (key *pem.Block, problem string) {
	rest := []byte(text)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		switch {
		case block.Type == "EC PARAMETERS":
			continue
		case strings.Contains(block.Type, "ENCRYPTED") || block.Headers["DEK-Info"] != "":
			return nil, "The key is encrypted. Send it without a passphrase (openssl pkey -in key.pem -out plain.pem)."
		case !strings.HasSuffix(block.Type, "PRIVATE KEY"):
			return nil, fmt.Sprintf("A %q block was found. Only the private key belongs here.", block.Type)
		case key != nil:
			return nil, "More than one private key was found. Send exactly one."
		}
		key = block
	}
	switch {
	case key == nil:
		return nil, "No private key was found. Send the PEM text, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----."
	case len(bytes.TrimSpace(rest)) > 0:
		return nil, "There is text after the key block. Send only the key."
	}
	return key, ""
}

// verifiedPair is a certificate and key that passed verifyPair: the pair as
// the listener serves it, its leaf, and the PEM the files will hold (every
// block re-encoded, so nothing else the sender included is kept).
type verifiedPair struct {
	pair            tls.Certificate
	leaf            *x509.Certificate
	certPEM, keyPEM []byte
}

// encodeCertificates is certs as PEM, one CERTIFICATE block each.
func encodeCertificates(certs []*x509.Certificate) []byte {
	var out []byte
	for _, c := range certs {
		out = append(out, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})...)
	}
	return out
}

// verifyPair is the check every replacement passes before anything is written:
// the certificate field holds certificates only, the key field exactly one
// private key, the two match (tls.X509KeyPair), and the leaf (the first
// certificate) is valid now. A refusal is a *tlsInvalidError naming the field.
// Nothing here reads or changes a file.
func (m *tlsManager) verifyPair(certText, keyText string) (verifiedPair, error) {
	certs, problem := parseCertificatePEM(certText)
	if problem != "" {
		return verifiedPair{}, &tlsInvalidError{Field: "certificate", Reason: problem}
	}
	keyBlock, problem := parseKeyPEM(keyText)
	if problem != "" {
		return verifiedPair{}, &tlsInvalidError{Field: "key", Reason: problem}
	}
	v := verifiedPair{
		leaf:    certs[0],
		certPEM: encodeCertificates(certs),
		keyPEM:  pem.EncodeToMemory(&pem.Block{Type: keyBlock.Type, Bytes: keyBlock.Bytes}),
	}
	pair, err := tls.X509KeyPair(v.certPEM, v.keyPEM)
	if err != nil {
		// Go's text holds no key bytes, but a refusal says its own words.
		if strings.Contains(err.Error(), "does not match") {
			return verifiedPair{}, &tlsInvalidError{Field: "key", Reason: "The key does not match the certificate (the first one sent)."}
		}
		return verifiedPair{}, &tlsInvalidError{Field: "key", Reason: "The private key cannot be read, or is a kind the gateway does not support. Use an RSA, ECDSA or Ed25519 key."}
	}
	v.pair = pair
	// A replacement is served at once, so one browsers refuse would lock the
	// console out the moment it is installed.
	if problem := browserKeyProblem(v.leaf.PublicKey); problem != "" {
		return verifiedPair{}, &tlsInvalidError{Field: "certificate", Reason: problem}
	}
	now := m.now()
	switch {
	case now.After(v.leaf.NotAfter):
		return verifiedPair{}, &tlsInvalidError{Field: "certificate", Reason: "The certificate expired on " + v.leaf.NotAfter.UTC().Format(time.RFC3339) + "."}
	case now.Before(v.leaf.NotBefore):
		return verifiedPair{}, &tlsInvalidError{Field: "certificate", Reason: "The certificate is not valid until " + v.leaf.NotBefore.UTC().Format(time.RFC3339) + "."}
	}
	return v, nil
}

// checkCertificate verifies a pair and describes its leaf. Nothing is written.
func (m *tlsManager) checkCertificate(certText, keyText string) (tlsCertJSON, error) {
	v, err := m.verifyPair(certText, keyText)
	if err != nil {
		return tlsCertJSON{}, err
	}
	return m.describe(v.leaf), nil
}

// writeFailed logs a write that failed (with its cause) and wraps it.
func (m *tlsManager) writeFailed(what string, err error) error {
	m.logger.Error("TLS "+what+" failed", "err", err)
	return &tlsWriteError{cause: err}
}

// replaceCertificate verifies a pair, writes both files as one journaled
// commit in the certificate's directory (certificate 0644, key 0600) and swaps
// the listener's certificate: new handshakes use it, open connections carry
// on. Refusals: *tlsInvalidError, errTLSReadOnly, *tlsWriteError (nothing
// changed). It logs the subject, the expiry and the fingerprint, never the key.
func (m *tlsManager) replaceCertificate(certText, keyText string) (tlsCertJSON, error) {
	v, err := m.verifyPair(certText, keyText)
	if err != nil {
		return tlsCertJSON{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.certificateWritable() {
		return tlsCertJSON{}, errTLSReadOnly
	}
	files := []journalFile{
		{path: m.certFile, data: v.certPEM, perm: 0o644},
		{path: m.keyFile, data: v.keyPEM, perm: 0o600},
	}
	if err := newJournal(filepath.Dir(m.certFile), files, m.seams.journal, m.logger).run(); err != nil {
		return tlsCertJSON{}, m.writeFailed("certificate replacement", err)
	}
	m.cert.set(v.pair)
	desc := m.describe(v.leaf)
	m.logger.Info("TLS server certificate replaced", "subject", desc.Subject, "not_after", desc.NotAfter, "sha256_fingerprint", desc.SHA256)
	return desc, nil
}

// trustFileName derives a file name from c's subject common name: lower case,
// every run of characters other than a-z and 0-9 one "-", the dashes at both
// ends trimmed, "ca" when nothing is left, cut to 64 characters, ".crt" added.
func trustFileName(c *x509.Certificate) string {
	var b strings.Builder
	for _, r := range strings.ToLower(c.Subject.CommonName) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	base := strings.Trim(dashRuns.ReplaceAllString(b.String(), "-"), "-")
	if len(base) > 64 {
		base = strings.TrimRight(base[:64], "-")
	}
	if base == "" {
		base = "ca"
	}
	return base + ".crt"
}

// refreshTrust rebuilds the pool from the trust directory and swaps it in.
func (m *tlsManager) refreshTrust() error {
	pool, err := m.seams.buildPool(m.trustDir, m.logger)
	if err != nil {
		return err
	}
	m.trust.setPool(pool)
	return nil
}

// addTrust writes the certificates of certText as a CA file (name, or one
// derived from the first certificate's subject when name is "") and rebuilds
// the pool, which applies at once. It returns the file name. Refusals:
// *tlsInvalidError (field certificate or name), errTLSReadOnly, errTLSExists,
// *tlsWriteError (the new file is removed again when the pool cannot be rebuilt).
func (m *tlsManager) addTrust(name, certText string) (string, error) {
	certs, problem := parseCertificatePEM(certText)
	if problem != "" {
		return "", &tlsInvalidError{Field: "certificate", Reason: problem}
	}
	switch {
	case name == "":
		name = trustFileName(certs[0])
	case !trustNameRE.MatchString(name):
		return "", &tlsInvalidError{Field: "name", Reason: trustNameReason}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.trustWritable() {
		return "", errTLSReadOnly
	}
	if err := os.MkdirAll(m.trustDir, 0o755); err != nil {
		return "", m.writeFailed("trust directory creation", err)
	}
	path := filepath.Join(m.trustDir, name)
	if _, err := os.Lstat(path); err == nil {
		return "", errTLSExists
	}
	if err := m.seams.write(path, encodeCertificates(certs), 0o644); err != nil {
		return "", m.writeFailed("CA file write", err)
	}
	if err := m.refreshTrust(); err != nil {
		_ = m.seams.remove(path)
		return "", m.writeFailed("trust pool rebuild", err)
	}
	m.logger.Info("trusted CA file added", "file", name, "certificates", len(certs))
	return name, nil
}

// removeTrust deletes the CA file called name, any the listing shows
// (trustListedName), and rebuilds the pool, which applies at once. It reaches
// only an entry directly in the trust directory and never a directory; a link
// is removed itself, never the file it points at. Refusals: *tlsInvalidError
// (field name), errTLSReadOnly, errTLSNotFound, *tlsWriteError.
func (m *tlsManager) removeTrust(name string) error {
	if !trustListedName(name) {
		return &tlsInvalidError{Field: "name", Reason: trustDeleteReason}
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if !m.trustWritable() {
		return errTLSReadOnly
	}
	path := filepath.Join(m.trustDir, name)
	if info, err := os.Lstat(path); err != nil || info.IsDir() {
		return errTLSNotFound
	}
	if err := m.seams.remove(path); err != nil {
		return m.writeFailed("CA file removal", err)
	}
	if err := m.refreshTrust(); err != nil {
		return m.writeFailed("trust pool rebuild", err)
	}
	m.logger.Info("trusted CA file removed", "file", name)
	return nil
}
