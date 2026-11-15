package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Bootstrap admin password sources, read only when the users file is missing.
// Environment-only and never written to config.yaml: the value is a secret.
const (
	envAdminPassword     = "SMU_ADMIN_PASSWORD"
	envAdminPasswordFile = "SMU_ADMIN_PASSWORD_FILE"
	bootstrapAdminName   = "admin"
)

// flexStr unmarshals a YAML scalar (int or string) into a string, so ports can
// be written unquoted (`port: 1943`) or quoted (`port: "1943"`).
type flexStr string

func (s *flexStr) UnmarshalYAML(node *yaml.Node) error {
	*s = flexStr(node.Value)
	return nil
}

// ----- YAML document shapes ---------------------------------------------------

type permRow struct {
	Brokers flexStr `yaml:"brokers"`
	MsgVpns flexStr `yaml:"msgVpns"`
	Queues  flexStr `yaml:"queues"`
}

type userRec struct {
	Username string `yaml:"username"`
	// Rev is the record's version: the file's seq as of the last change the
	// admin console can see (saveUser). 1 to the file's seq, checked at load.
	Rev      int    `yaml:"rev"`
	Password string `yaml:"password"` // pbkdf2-sha256 hash (password.go)
	// MustChangePassword limits the user's session to the password page until
	// they set a new one. Set for the bootstrap admin.
	MustChangePassword bool      `yaml:"mustChangePassword,omitempty"`
	Admin              bool      `yaml:"admin"`
	Operate            []permRow `yaml:"operate"`
	ReadOnly           []permRow `yaml:"read-only"`
	// Modules is the app modules this user may open (moduleCatalog ids),
	// within config.yaml's modules.offered. nil (key absent) means the
	// deployment's modules.userDefault; an empty list means none.
	Modules *[]string `yaml:"modules,omitempty"`
	// TOTP is the user's two-factor sign-in: nil (key absent) when they have
	// not set it up. Only the field-scoped writes below (setTOTP,
	// useRecoveryCode, clearTOTP) and an import change it; an administrator's
	// save keeps what is stored. A stored value is never mutated in place, so
	// copies of a record may share the pointer.
	TOTP *userTOTP `yaml:"totp,omitempty"`
}

// userTOTP is a user's authenticator secret and their unused recovery codes.
// Both are secrets: they live only inside the sealed file and never reach a
// log, an audit line, an error or a browser (but for the one page that shows
// them at enrolment).
type userTOTP struct {
	Secret   string   `yaml:"secret"`   // base32, 32 characters (totp.go)
	Recovery []string `yaml:"recovery"` // lower-case hex SHA-256 of each unused code (hashRecoveryCode)
}

// usersDoc is users.yaml. Seq moves on every commit of the file and is stored,
// never derived from the highest rev: after a delete no record holds it.
type usersDoc struct {
	Seq   int       `yaml:"seq"`
	Users []userRec `yaml:"msg-utility-users"`
}

type vpnRec struct {
	Name     string `yaml:"name"`
	Username string `yaml:"username"`
	Password string `yaml:"password"` // inside the sealed file; reaches a browser only through dial
}

// A record's scheme fields name how the gateway reaches the broker: blank is
// TLS, the default (https for SEMP, wss for SMF), so every record written
// before the field existed stays on TLS; the plain scheme is an
// administrator's choice per connection (http for SEMP, ws for SMF). A save
// stores the TLS scheme as blank (canonScheme), so a record has one spelling
// either way.
type clientRec struct {
	Scheme  string   `yaml:"scheme,omitempty"`
	Port    flexStr  `yaml:"port"`
	MsgVpns []vpnRec `yaml:"msgVpns"`
}

type sempRec struct {
	Scheme   string  `yaml:"scheme,omitempty"`
	Port     flexStr `yaml:"port"`
	Username string  `yaml:"username"`
	Password string  `yaml:"password"` // inside the sealed file; never reaches a browser
}

// The schemes a connection may name, TLS first.
const (
	sempTLS, sempPlain     = "https", "http"
	clientTLS, clientPlain = "wss", "ws"
)

// orTLS is the scheme a record's field stands for: the field, or tls when
// it is blank.
func orTLS(s, tls string) string {
	if s == "" {
		return tls
	}
	return s
}

// canonScheme is how a save stores a scheme: the TLS default as blank.
func canonScheme(s, tls string) string {
	if s == tls {
		return ""
	}
	return s
}

// schemeOK reports whether s may be stored: blank (TLS), tls or plain.
func schemeOK(s, tls, plain string) bool {
	return s == "" || s == tls || s == plain
}

type connRec struct {
	Broker   string    `yaml:"broker"`
	Rev      int       `yaml:"rev"` // as userRec.Rev, against connections.yaml's seq
	Hostname string    `yaml:"hostname"`
	Semp     sempRec   `yaml:"semp"`
	Client   clientRec `yaml:"client"`
}

// connsDoc is connections.yaml, with a seq as usersDoc has.
type connsDoc struct {
	Seq         int       `yaml:"seq"`
	Connections []connRec `yaml:"msg-utility-connections"`
}

// ----- /managed/me response shapes (JSON to the browser) ----------------------

// The profile names brokers and VPNs only: no address, port, username or
// password. The SEMP relay adds the SEMP account, and dial hands out a VPN's
// credential when the browser connects.
type respPerm struct {
	Brokers string `json:"brokers"`
	MsgVpns string `json:"msgVpns"`
	Queues  string `json:"queues"`
}
type respVpn struct {
	Name string `json:"name"`
}
type respBroker struct {
	Broker  string    `json:"broker"`
	MsgVpns []respVpn `json:"msgVpns"`
}
type profileResponse struct {
	Username string       `json:"username"`
	Admin    bool         `json:"admin"`
	Operate  []respPerm   `json:"operate"`
	ReadOnly []respPerm   `json:"readOnly"`
	Brokers  []respBroker `json:"brokers"`
	Modules  []string     `json:"modules"` // the app modules this user may open
}

// ----- store ------------------------------------------------------------------

// store holds the parsed users and connections, guarded by an RWMutex: reads
// under RLock, and the memory swap of a commit under Lock. Memory changes only
// there (publish), inside the writer's publish lock. The file paths are
// retained so admin-CRUD mutations can persist back to the same files. Both
// files are encrypted with the store key (storecrypt.go), and every change to
// them goes through the writer (wr), so the gateway is the only writer and
// nobody edits them by hand.
type store struct {
	mu        sync.RWMutex
	users     []userRec
	conns     []connRec
	usersSeq  int    // seq of users.yaml, moves on every commit of it
	connsSeq  int    // seq of connections.yaml; 0 until the file exists
	usersPath string // retained for CRUD persistence
	connsPath string // retained for CRUD persistence
	seal      *sealer
	hasher    *hasher

	// wr is the one writer of the data directory, made by loadStore with the
	// checksums of the store key (sums). The settings and the backup schedule
	// share it, so one lock covers every store file; the caller sets its gate
	// and exit hook before serving.
	wr   *writer
	sums *checksums

	// onChange runs after every committed change that can alter an entitlement
	// (a user or connection save or delete, an import): the SMF sockets
	// re-check their access (sockets.go). It runs under the writer lock and
	// outside mu, and must not call the writer. Set once before serving.
	onChange func()
}

type storeOptions struct {
	usersPath, connsPath, keyPath string
	// schedulePath is the backup schedule (backup.go), also sealed with the
	// key: a missing key beside it refuses to start, as beside a store.
	schedulePath string
	hasher       *hasher
	getenv       func(string) string // os.Getenv; injected for tests
}

func loadStore(opts storeOptions, logger *slog.Logger) (*store, error) {
	// The key comes first: it decides whether the store files may be created
	// (fresh volume) or must be opened (and refused without their key).
	key, err := loadStoreKey(opts.keyPath, []string{opts.usersPath, opts.connsPath, opts.schedulePath}, logger)
	if err != nil {
		return nil, err
	}
	sl, err := newSealer(key)
	if err != nil {
		return nil, fmt.Errorf("store key file %q: %w", opts.keyPath, err)
	}
	sums, err := newChecksums(key)
	if err != nil {
		return nil, fmt.Errorf("store key file %q: %w", opts.keyPath, err)
	}
	s := &store{
		usersPath: opts.usersPath, connsPath: opts.connsPath, seal: sl, hasher: opts.hasher,
		sums: sums, wr: newWriter(filepath.Dir(opts.usersPath), sums, logger),
	}

	if _, err := os.Stat(opts.usersPath); errors.Is(err, os.ErrNotExist) {
		doc, err := bootstrapUsers(opts, sl, logger)
		if err != nil {
			return nil, fmt.Errorf("bootstrap users file %q: %w", opts.usersPath, err)
		}
		s.users, s.usersSeq = doc.Users, doc.Seq
	} else {
		for _, name := range []string{envAdminPassword, envAdminPasswordFile} {
			if opts.getenv(name) != "" {
				logger.Warn("users file exists, so the bootstrap password variable is ignored; remove it", "env", name, "path", opts.usersPath)
			}
		}
		var doc usersDoc
		if err := sl.readDoc(roleUsers, opts.usersPath, &doc); err != nil {
			return nil, fmt.Errorf("read users file %q: %w", opts.usersPath, err)
		}
		if err := validateUsers(doc.Users); err != nil {
			return nil, fmt.Errorf("users file %q: %w", opts.usersPath, err)
		}
		if err := validateUserRevs(doc.Users, doc.Seq); err != nil {
			return nil, fmt.Errorf("users file %q: %w", opts.usersPath, err)
		}
		s.users, s.usersSeq = doc.Users, doc.Seq
	}

	if _, err := os.Stat(opts.connsPath); errors.Is(err, os.ErrNotExist) {
		logger.Warn("connections file missing — no brokers will be offered", "path", opts.connsPath)
	} else {
		var doc connsDoc
		if err := sl.readDoc(roleConns, opts.connsPath, &doc); err != nil {
			return nil, fmt.Errorf("read connections file %q: %w", opts.connsPath, err)
		}
		if err := validateConns(doc.Connections); err != nil {
			return nil, fmt.Errorf("connections file %q: %w", opts.connsPath, err)
		}
		if err := validateConnRevs(doc.Connections, doc.Seq); err != nil {
			return nil, fmt.Errorf("connections file %q: %w", opts.connsPath, err)
		}
		s.conns, s.connsSeq = doc.Connections, doc.Seq
	}
	// What is on disk now is what the writer compares with before every write
	// (the changed-on-disk refusal). A connections file that does not exist is
	// remembered as absent.
	for _, p := range []string{opts.usersPath, opts.connsPath} {
		if err := sums.rememberDisk(p); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// ----- validation (on load; the CRUD handlers apply the same rules) -----------

var (
	usernamePattern = regexp.MustCompile(`^[A-Za-z0-9._@-]{1,64}$`)
	brokerPattern   = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)
)

const (
	usernameRule = "must be 1 to 64 characters from A-Z a-z 0-9 . _ @ -, not only dots"
	brokerRule   = "must be 1 to 64 characters from A-Z a-z 0-9 . _ -, not only dots"
)

// validName reports whether name matches pattern and is more than dots: "."
// and ".." are path segments the router cleans away, so a record named that
// way could never be edited or deleted through /managed.
func validName(pattern *regexp.Regexp, name string) bool {
	return pattern.MatchString(name) && strings.Trim(name, ".") != ""
}

func validateUsers(users []userRec) error {
	seen := map[string]bool{}
	admins := 0
	for i, u := range users {
		if !validName(usernamePattern, u.Username) {
			return fmt.Errorf("user %d: username %q %s", i+1, u.Username, usernameRule)
		}
		if seen[u.Username] {
			return fmt.Errorf("user %q appears more than once", u.Username)
		}
		seen[u.Username] = true
		if strings.HasPrefix(u.Password, "S1:") {
			return fmt.Errorf("user %q has a password token from an older build; delete the users file to bootstrap a new admin", u.Username)
		}
		if _, _, _, err := parsePasswordHash(u.Password); err != nil {
			return fmt.Errorf("user %q: password is %w", u.Username, err)
		}
		if u.Modules != nil {
			if err := checkModuleIDs("modules", *u.Modules); err != nil {
				return fmt.Errorf("user %q: %w", u.Username, err)
			}
		}
		if u.TOTP != nil {
			if err := validateTOTP(*u.TOTP); err != nil {
				return fmt.Errorf("user %q: two-factor %w", u.Username, err)
			}
		}
		if u.Admin {
			admins++
		}
	}
	if admins == 0 {
		return errors.New("no user has admin: true; at least one administrator is required")
	}
	return nil
}

func validateConns(conns []connRec) error {
	seen := map[string]bool{}
	for i, c := range conns {
		if err := validateConn(c); err != nil {
			return fmt.Errorf("connection %d: %w", i+1, err)
		}
		if seen[c.Broker] {
			return fmt.Errorf("broker %q appears more than once", c.Broker)
		}
		seen[c.Broker] = true
	}
	return nil
}

var (
	totpSecretPattern   = regexp.MustCompile(`^[A-Z2-7]{32}$`)
	recoveryHashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

const (
	totpSecretRule   = "secret must be 32 characters from A-Z 2-7 (base32)"
	recoveryHashRule = "recovery entry must be 64 lower-case hex characters (a SHA-256)"
)

// validateTOTP is the load check on a stored two-factor record. The errors
// name the rule and the position, never the value: both fields are secrets.
func validateTOTP(t userTOTP) error {
	if !totpSecretPattern.MatchString(t.Secret) {
		return errors.New(totpSecretRule)
	}
	for i, h := range t.Recovery {
		if !recoveryHashPattern.MatchString(h) {
			return fmt.Errorf("%s (entry %d)", recoveryHashRule, i+1)
		}
	}
	return nil
}

// revRule is the load check on a record's rev, for the errors below.
const revRule = "a rev must be from 1 to the file's seq, and the gateway never writes it otherwise; restore the file from a backup"

// validateUserRevs holds the users of a file with the given seq to the load
// check: every rev is at least 1 and at most seq. Run after validateUsers, so
// a file that is wrong in another way says so first.
func validateUserRevs(users []userRec, seq int) error {
	if seq < 0 {
		return fmt.Errorf("seq is %d, which the gateway never writes; restore the file from a backup", seq)
	}
	for _, u := range users {
		if u.Rev < 1 || u.Rev > seq {
			return fmt.Errorf("user %q has rev %d and the file's seq is %d: %s", u.Username, u.Rev, seq, revRule)
		}
	}
	return nil
}

// validateConnRevs is validateUserRevs for the connections file.
func validateConnRevs(conns []connRec, seq int) error {
	if seq < 0 {
		return fmt.Errorf("seq is %d, which the gateway never writes; restore the file from a backup", seq)
	}
	for _, c := range conns {
		if c.Rev < 1 || c.Rev > seq {
			return fmt.Errorf("broker %q has rev %d and the file's seq is %d: %s", c.Broker, c.Rev, seq, revRule)
		}
	}
	return nil
}

// validateConn checks one record. The gateway builds broker URLs and a Basic
// header from these values, so the hostname must be a bare host, a port must
// be given wherever it is used (blank never means a default), and credentials
// hold no control characters. Errors never echo a credential.
func validateConn(c connRec) error {
	if !validName(brokerPattern, c.Broker) {
		return fmt.Errorf("broker %q %s", c.Broker, brokerRule)
	}
	for key, port := range map[string]flexStr{"semp.port": c.Semp.Port, "client.port": c.Client.Port} {
		if err := validatePort(string(port)); err != nil {
			return fmt.Errorf("broker %q: %s %w", c.Broker, key, err)
		}
	}
	for _, s := range []struct{ key, got, tls, plain string }{
		{"semp.scheme", c.Semp.Scheme, sempTLS, sempPlain},
		{"client.scheme", c.Client.Scheme, clientTLS, clientPlain},
	} {
		if !schemeOK(s.got, s.tls, s.plain) {
			return fmt.Errorf("broker %q: %s %q must be %q or %q", c.Broker, s.key, s.got, s.tls, s.plain)
		}
	}
	vpns := map[string]bool{}
	for _, v := range c.Client.MsgVpns {
		if v.Name == "" {
			return fmt.Errorf("broker %q: a message VPN has no name", c.Broker)
		}
		if vpns[v.Name] {
			return fmt.Errorf("broker %q: message VPN %q appears more than once", c.Broker, v.Name)
		}
		vpns[v.Name] = true
	}
	if !validHost(c.Hostname) {
		return fmt.Errorf("broker %q: hostname %q %s", c.Broker, c.Hostname, hostRule)
	}
	if c.Semp.Username != "" && c.Semp.Port == "" {
		return fmt.Errorf("broker %q: semp.port is required when a SEMP username is set", c.Broker)
	}
	if len(c.Client.MsgVpns) > 0 && c.Client.Port == "" {
		return fmt.Errorf("broker %q: client.port is required when message VPNs are listed", c.Broker)
	}
	if strings.Contains(c.Semp.Username, ":") || hasControl(c.Semp.Username) || hasControl(c.Semp.Password) {
		return fmt.Errorf("broker %q: the SEMP username and password must not contain control characters, and the username no ':'", c.Broker)
	}
	for _, v := range c.Client.MsgVpns {
		if hasControl(v.Name) || hasControl(v.Username) || hasControl(v.Password) {
			return fmt.Errorf("broker %q: message VPN %q: the name, username and password must not contain control characters", c.Broker, v.Name)
		}
	}
	return nil
}

// hostPattern is a DNS-style host name; validHost also takes IP literals
// (IPv6 without brackets). No scheme, port, path, user info or spaces.
var hostPattern = regexp.MustCompile(`^[A-Za-z0-9_]([A-Za-z0-9_.-]{0,251}[A-Za-z0-9_])?$`)

const hostRule = "must be a host name (A-Z a-z 0-9 . _ -) or an IP address, without scheme or port"

func validHost(h string) bool {
	return net.ParseIP(h) != nil || hostPattern.MatchString(h)
}

// hasControl reports a C0 control character or DEL, which must never reach a
// URL or a header.
func hasControl(s string) bool {
	return strings.ContainsFunc(s, func(r rune) bool { return r < 0x20 || r == 0x7f })
}

func validatePort(p string) error {
	if p == "" {
		return nil
	}
	// Digits only: Atoi alone takes "+80", which no dialer accepts.
	if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 || strings.Trim(p, "0123456789") != "" {
		return fmt.Errorf("%q is not a port (1 to 65535)", p)
	}
	return nil
}

// ----- queries ----------------------------------------------------------------

func (s *store) findUser(username string) (userRec, bool) {
	for _, u := range s.users {
		if u.Username == username {
			return u, true
		}
	}
	return userRec{}, false
}

// profile returns the user's entitled profile for /managed/me, or ok=false
// when the user no longer exists. ms is the live modules setting.
func (s *store) profile(username string, ms moduleSettings) (*profileResponse, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	u, ok := s.findUser(username)
	if !ok {
		return nil, false
	}
	resp := &profileResponse{
		Username: u.Username,
		Admin:    u.Admin,
		Operate:  toRespPerms(u.Operate),
		ReadOnly: toRespPerms(u.ReadOnly),
		Brokers:  []respBroker{},
		Modules:  ms.forUser(u.Modules),
	}
	for _, c := range s.conns {
		vpns := []respVpn{}
		for _, v := range entitledVPNs(&u, c) {
			vpns = append(vpns, respVpn{Name: v.Name})
		}
		if len(vpns) > 0 {
			resp.Brokers = append(resp.Brokers, respBroker{Broker: c.Broker, MsgVpns: vpns})
		}
	}
	return resp, true
}

// entitledVPNs lists the VPNs of c the user may connect to. The profile and
// the relay share it, so what the browser is shown and what the gateway lets
// through cannot drift apart.
func entitledVPNs(u *userRec, c connRec) []vpnRec {
	var out []vpnRec
	for _, v := range c.Client.MsgVpns {
		if entitled(u, c.Broker, v.Name) {
			out = append(out, v)
		}
	}
	return out
}

// brokerTarget is a broker address, the scheme to reach it with (https or
// http for SEMP, wss or ws for SMF) and the credential the gateway uses or
// hands out there. A copy: the store may change while a request runs.
type brokerTarget struct {
	scheme, host, port, user, pass string
}

// sempTarget returns the broker's SEMP address and credential when the user
// is entitled to at least one of its VPNs (the condition under which the
// profile lists the broker) and a SEMP port is set. An unknown user, an
// unknown broker, no entitlement and no SEMP all return false, and the relay
// answers them alike. Read per request, so an edit applies to the next call.
func (s *store) sempTarget(username, broker string) (brokerTarget, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.findUser(username)
	if !ok {
		return brokerTarget{}, false
	}
	for _, c := range s.conns {
		if c.Broker == broker && c.Semp.Port != "" && len(entitledVPNs(&u, c)) > 0 {
			return brokerTarget{scheme: orTLS(c.Semp.Scheme, sempTLS), host: c.Hostname, port: string(c.Semp.Port), user: c.Semp.Username, pass: c.Semp.Password}, true
		}
	}
	return brokerTarget{}, false
}

// smfTarget returns the broker's SMF address and the VPN's client credential
// when the user is entitled to that VPN: what dial hands out and where the
// SMF gate connects. validateConn guarantees client.port wherever a VPN is
// listed. Read per call, so a socket re-check sees the latest edit.
func (s *store) smfTarget(username, broker, vpn string) (brokerTarget, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.findUser(username)
	if !ok {
		return brokerTarget{}, false
	}
	for _, c := range s.conns {
		if c.Broker != broker {
			continue
		}
		for _, v := range entitledVPNs(&u, c) {
			if v.Name == vpn {
				return brokerTarget{scheme: orTLS(c.Client.Scheme, clientTLS), host: c.Hostname, port: string(c.Client.Port), user: v.Username, pass: v.Password}, true
			}
		}
	}
	return brokerTarget{}, false
}

// isAdmin reports the user's current admin flag; exists is false for a user
// that was deleted.
func (s *store) isAdmin(username string) (admin, exists bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.findUser(username)
	return u.Admin, ok
}

// twoFactorOn is the user list's twoFactor flag: whether the record has
// two-factor set up.
func (u userRec) twoFactorOn() bool { return u.TOTP != nil }

// twoFactorOf reports whether the user has two-factor set up now; exists is
// false for a user that was deleted.
func (s *store) twoFactorOf(username string) (enrolled, exists bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.findUser(username)
	return u.twoFactorOn(), ok
}

// totpSecret is the user's stored secret, for verifying a code; ok is false
// when the user is gone or has none.
func (s *store) totpSecret(username string) (secret string, ok bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if u, found := s.findUser(username); found && u.TOTP != nil {
		return u.TOTP.Secret, true
	}
	return "", false
}

// secretOf is a record's authenticator secret, "" for none: what a backup
// import compares to tell a user whose two-factor changed.
func secretOf(t *userTOTP) string {
	if t == nil {
		return ""
	}
	return t.Secret
}

// passwordCheck is a sign-in's verdict and the record it was made against:
// hash is the stored hash pw was checked with, so what follows can insist
// that the record still stands (ifUnchanged, setPassword).
type passwordCheck struct {
	ok, mustChange bool
	hash           string
}

// verifyPassword checks a sign-in. An unknown user is checked against the
// hasher's dummy, so both answers take the same time. The hash runs outside
// the lock. err is set only when the hash could not run (request gone).
func (s *store) verifyPassword(ctx context.Context, username, pw string) (passwordCheck, error) {
	s.mu.RLock()
	u, found := s.findUser(username)
	s.mu.RUnlock()
	match, err := s.hasher.verify(ctx, u.Password, pw)
	if err != nil {
		return passwordCheck{}, err
	}
	return passwordCheck{ok: found && match, mustChange: u.MustChangePassword, hash: u.Password}, nil
}

// checkPassword is verifyPassword's verdict alone.
func (s *store) checkPassword(ctx context.Context, username, pw string) (mustChange, ok bool, err error) {
	c, err := s.verifyPassword(ctx, username, pw)
	return c.mustChange, c.ok, err
}

// ifUnchanged runs fn under the store's read lock when username still
// exists with the stored hash hash, and reports whether it ran. A sign-in
// creates its session in fn: an edit that ends sessions (a new password, a
// deletion, an import) either lands first, and fn never runs, or waits for
// the lock, and the dropUser after it sees the new session.
func (s *store) ifUnchanged(username, hash string, fn func()) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if u, ok := s.findUser(username); !ok || u.Password != hash {
		return false
	}
	fn()
	return true
}

func toRespPerms(rows []permRow) []respPerm {
	out := []respPerm{}
	for _, r := range rows {
		out = append(out, respPerm{Brokers: string(r.Brokers), MsgVpns: string(r.MsgVpns), Queues: string(r.Queues)})
	}
	return out
}

// ----- admin CRUD --------------------------------------------------------------
//
// Every change to users.yaml or connections.yaml goes through the writer
// (writer.go): one transaction at a time, the order of checks pinned by the
// design (caller, disk, existence, rev, cross-record rules), planned on
// copies, staged with the round-trip check, and published by swapping memory
// only after the commit point. The slow, input-only work (hashing a password)
// happens before the lock.
//
// A mutator's committed funcs run after its commit, still under the writer
// lock and after the socket re-check: the handler's audit line.
//
// Each file carries a seq that moves on every commit; a record's rev becomes
// the new seq only when the record changed as the admin console shows it
// (sameUserView, sameConnView). A password-only change moves seq and keeps rev.

// errBlankNewUserPassword rejects creating a brand-new user with no password.
// (A blank password on EDIT legitimately keeps the existing hash.)
var errBlankNewUserPassword = errors.New("new user requires a password")

// errLastAdmin refuses deleting or demoting the only remaining admin, which
// would leave no one able to reach the admin app.
var errLastAdmin = errors.New("cannot remove the last admin")

var errUserNotFound = errors.New("user not found")

// errAccountChanged refuses a user's own password change when the record no
// longer holds the hash their current password was checked against: an
// administrator reset it while the check ran.
var errAccountChanged = errors.New("the account changed while its password was checked")

// The caller re-check inside the lock: the user who asked for the change was
// deleted (401 unauthenticated) or lost the admin flag (403 forbidden) while
// the request waited.
var (
	errCallerGone     = errors.New("the requesting user no longer exists")
	errCallerNotAdmin = errors.New("the requesting user is no longer an administrator")
)

// importInvalidError is an import section that breaks the load rules: 422
// invalid, with the section name for the message.
type importInvalidError struct {
	section string // "users" or "connections"
	err     error
}

func (e *importInvalidError) Error() string {
	return "The backup's " + e.section + " cannot be imported: " + e.err.Error()
}

func (e *importInvalidError) Unwrap() error { return e.err }

func countAdmins(users []userRec) int {
	n := 0
	for _, u := range users {
		if u.Admin {
			n++
		}
	}
	return n
}

// savedUser is what a committed user save tells the handler: the record's rev
// after the save (the answer's body), the new seq of users.yaml (the audit
// line's "wrote"), and whether the change must end the user's sessions (a new
// password or a changed admin flag).
type savedUser struct {
	rev, seq     int
	dropSessions bool
}

// savedConn is the same for a connection: no sessions are involved.
type savedConn struct {
	rev, seq int
}

// seqs are the seq of users.yaml and connections.yaml as of now: the users
// and connections parts of an import's basis.
func (s *store) seqs() (users, conns int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.usersSeq, s.connsSeq
}

// usersNow is the current user list (the slice is a copy; the records share
// their inner slices, which nothing mutates in place) and the file's seq.
func (s *store) usersNow() ([]userRec, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return slices.Clone(s.users), s.usersSeq
}

// connsNow is usersNow for the connections.
func (s *store) connsNow() ([]connRec, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return slices.Clone(s.conns), s.connsSeq
}

// publish swaps memory for the committed documents, nil leaving a list alone,
// in one critical section: a reader sees the old state or the new, never one
// list of an import from each. It runs from tx.onPublish.
func (s *store) publish(u *usersDoc, c *connsDoc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if u != nil {
		s.users, s.usersSeq = u.Users, u.Seq
	}
	if c != nil {
		s.conns, s.connsSeq = c.Connections, c.Seq
	}
}

// changed is the after-commit hook of every change that can alter an
// entitlement: the SMF sockets re-check their access. It runs under the writer
// lock and outside the store's own.
func (s *store) changed() {
	if s.onChange != nil {
		s.onChange()
	}
}

// checkCaller re-checks, against the current users, that the requesting user
// still exists and is an admin. An empty caller skips it (a change the gateway
// makes for itself, and tests).
func (s *store) checkCaller(caller string) error {
	if caller == "" {
		return nil
	}
	admin, exists := s.isAdmin(caller)
	switch {
	case !exists:
		return errCallerGone
	case !admin:
		return errCallerNotAdmin
	}
	return nil
}

// checkRev is the existence and rev rules of a whole-record save or delete:
// rev 0 is a create and refuses an existing name, rev above 0 needs the
// record and its current rev. cur is the record's current rev, valid when
// found.
func checkRev(found bool, cur, rev int) error {
	switch {
	case rev == 0 && found:
		return errExists
	case rev > 0 && !found:
		return errNotFound
	case rev > 0 && cur != rev:
		return newStale(cur)
	}
	return nil
}

// sameUserView reports whether two users look the same in the admin console:
// what userToOutput shows. The password hash is never shown, and neither is
// the rev. Absent grant lists equal empty ones; an absent module list differs
// from an empty one. Whether two-factor is set is shown (the list's twoFactor
// flag), but not the secret nor which recovery codes are left: setting up
// again, or using a recovery code, is not a visible change.
func sameUserView(a, b userRec) bool {
	return a.Username == b.Username && a.Admin == b.Admin && a.MustChangePassword == b.MustChangePassword &&
		a.twoFactorOn() == b.twoFactorOn() &&
		slices.Equal(a.Operate, b.Operate) && slices.Equal(a.ReadOnly, b.ReadOnly) && sameModules(a.Modules, b.Modules)
}

// sameConnView is sameUserView for a connection: what connToOutput shows,
// which leaves every password out. A blank scheme is TLS either way.
func sameConnView(a, b connRec) bool {
	return a.Broker == b.Broker && a.Hostname == b.Hostname &&
		orTLS(a.Semp.Scheme, sempTLS) == orTLS(b.Semp.Scheme, sempTLS) && a.Semp.Port == b.Semp.Port && a.Semp.Username == b.Semp.Username &&
		orTLS(a.Client.Scheme, clientTLS) == orTLS(b.Client.Scheme, clientTLS) && a.Client.Port == b.Client.Port &&
		slices.EqualFunc(a.Client.MsgVpns, b.Client.MsgVpns, func(x, y vpnRec) bool { return x.Name == y.Name && x.Username == y.Username })
}

// listUsers returns a deep copy of the stored users — the nested permRow and
// module slices are cloned so a caller can't mutate the live store through the
// result. Each record carries its rev.
// Callers must strip secrets before sending them to a client (see userToOutput).
func (s *store) listUsers() []userRec {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := append([]userRec(nil), s.users...)
	for i := range out {
		out[i].Operate = append([]permRow(nil), out[i].Operate...)
		out[i].ReadOnly = append([]permRow(nil), out[i].ReadOnly...)
		if m := out[i].Modules; m != nil {
			c := slices.Clone(*m)
			out[i].Modules = &c
		}
		if t := out[i].TOTP; t != nil {
			out[i].TOTP = &userTOTP{Secret: t.Secret, Recovery: slices.Clone(t.Recovery)}
		}
	}
	return out
}

// saveUser creates (rev 0) or edits (rev above 0) the user u.Username.
// caller is the requesting admin, re-checked inside the lock ("" skips it).
// password is plaintext: blank on an EXISTING user keeps the stored hash and
// change flag as they are NOW (inside the lock, so a password the user set
// meanwhile survives), blank on a NEW user is errBlankNewUserPassword. The
// hash is computed before the lock. Order of refusals once inside: caller
// (errCallerGone, errCallerNotAdmin), disk (*changedOnDiskError), existence
// (errExists, errNotFound), rev (a stale error naming the current rev), then
// errBlankNewUserPassword and errLastAdmin (demoting the only admin). Like a
// blank password, the save never carries or clears two-factor: an existing
// record keeps the TOTP stored now and a new one has none. A write
// that fails comes back as *writeFailedError, with memory and files as they
// were. A refusal leaves seq alone.
func (s *store) saveUser(ctx context.Context, caller string, u userRec, password string, rev int, committed ...func()) (savedUser, error) {
	if rev < 0 {
		return savedUser{}, errRevRequired
	}
	if password != "" {
		hash, err := s.hasher.hash(ctx, password)
		if err != nil {
			return savedUser{}, err
		}
		u.Password = hash
	}
	var out savedUser
	err := s.wr.Do(ctx, func(tx *txn) error {
		if err := s.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, seq := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == u.Username })
		old := userRec{}
		if i >= 0 {
			old = cur[i]
		}
		if err := checkRev(i >= 0, old.Rev, rev); err != nil {
			return err
		}
		next, rec, newSeq := slices.Clone(cur), u, seq+1
		rec.TOTP = old.TOTP
		drop := false
		if i >= 0 {
			if old.Admin && !u.Admin && countAdmins(cur) <= 1 {
				return errLastAdmin
			}
			if password == "" {
				rec.Password, rec.MustChangePassword = old.Password, old.MustChangePassword
			}
			drop = password != "" || old.Admin != u.Admin
			rec.Rev = old.Rev
			if !sameUserView(old, rec) {
				rec.Rev = newSeq
			}
			next[i] = rec
		} else {
			if password == "" {
				return errBlankNewUserPassword
			}
			rec.Rev = newSeq
			next = append(next, rec)
		}
		doc := usersDoc{Seq: newSeq, Users: next}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		tx.afterCommit(s.changed)
		tx.afterCommit(committed...)
		out = savedUser{rev: rec.Rev, seq: newSeq, dropSessions: drop}
		return nil
	})
	if err != nil {
		return savedUser{}, err
	}
	return out, nil
}

// setPassword is a user changing their own password, the one field-scoped
// write: it sends no rev, and inside the lock it sets only the password hash
// and clears MustChangePassword on the record as it is now. It is refused with
// errAccountChanged when the record no longer holds expect, the hash the
// current password was checked against (an administrator's reset during the
// check wins), and with errUserNotFound when the user is gone. seq moves; the
// user's rev moves only when the change flag was set. committed runs under the
// writer lock once the new hash is published, so the session it creates cannot
// slip past a revocation. The new password is hashed before the lock. The
// caller ends the user's other sessions.
func (s *store) setPassword(ctx context.Context, username, password, expect string, committed func()) error {
	hash, err := s.hasher.hash(ctx, password)
	if err != nil {
		return err
	}
	return s.wr.Do(ctx, func(tx *txn) error {
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, seq := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == username })
		switch {
		case i < 0:
			return errUserNotFound
		case cur[i].Password != expect:
			return errAccountChanged
		}
		next, newSeq := slices.Clone(cur), seq+1
		rec := cur[i]
		rec.Password = hash
		if rec.MustChangePassword {
			rec.MustChangePassword, rec.Rev = false, newSeq
		}
		next[i] = rec
		doc := usersDoc{Seq: newSeq, Users: next}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		tx.afterCommit(committed)
		return nil
	})
}

// setTOTP is a user setting up two-factor (secret) or setting it up again,
// the field-scoped write of setPassword: it sends no rev, and inside the lock
// it replaces only the secret and the recovery list (recovery holds the
// hashes, hashRecoveryCodes) of the record as it is now. Order of refusals:
// disk (*changedOnDiskError), errUserNotFound, errAccountChanged (the record
// no longer holds expect, the password hash the user's password was checked
// against). seq moves. The rev moves when two-factor was off (enrol) and stays
// when it was on (set up again). committed runs under the writer lock once the
// new secret is published: the handler opens the session and writes the audit
// line there. The caller ends the user's other sessions and forgets the old
// secret's replay state (totpGuard.forget).
func (s *store) setTOTP(ctx context.Context, username, secret string, recovery []string, expect string, committed func()) error {
	return s.wr.Do(ctx, func(tx *txn) error {
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, seq := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == username })
		switch {
		case i < 0:
			return errUserNotFound
		case cur[i].Password != expect:
			return errAccountChanged
		}
		next, newSeq := slices.Clone(cur), seq+1
		rec := cur[i]
		if rec.TOTP == nil {
			rec.Rev = newSeq
		}
		rec.TOTP = &userTOTP{Secret: secret, Recovery: slices.Clone(recovery)}
		next[i] = rec
		doc := usersDoc{Seq: newSeq, Users: next}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		tx.afterCommit(committed)
		return nil
	})
}

// useRecoveryCode spends a recovery code: when hash (hashRecoveryCode) is in
// the user's list it is removed, used is true and left is how many remain.
// Otherwise nothing is written and used is false (left is what remains). Order
// of refusals: disk (*changedOnDiskError), errUserNotFound. A user without
// two-factor has nothing to spend. A spent code moves seq and keeps the rev;
// the writer runs one change at a time, so a code used by two requests at once
// passes once.
func (s *store) useRecoveryCode(ctx context.Context, username, hash string) (used bool, left int, err error) {
	err = s.wr.Do(ctx, func(tx *txn) error {
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, seq := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == username })
		if i < 0 {
			return errUserNotFound
		}
		used, left = false, 0
		if cur[i].TOTP == nil {
			return nil
		}
		left = len(cur[i].TOTP.Recovery)
		at := recoveryIndex(cur[i].TOTP.Recovery, hash)
		if at < 0 {
			return nil
		}
		next, rec := slices.Clone(cur), cur[i]
		rec.TOTP = &userTOTP{Secret: rec.TOTP.Secret, Recovery: slices.Delete(slices.Clone(rec.TOTP.Recovery), at, at+1)}
		next[i] = rec
		doc := usersDoc{Seq: seq + 1, Users: next}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		used, left = true, left-1
		return nil
	})
	if err != nil {
		return false, 0, err
	}
	return used, left, nil
}

// clearTOTP is an administrator removing a user's two-factor. caller is the
// requesting admin, re-checked inside the lock ("" skips it). It sends no rev.
// Order of refusals: caller (errCallerGone, errCallerNotAdmin), disk
// (*changedOnDiskError), errNotFound for an unknown user. A user without
// two-factor is not an error and not a commit: removed is false, seq and rev
// stay, and committed does not run (the handler writes its own entry). When it
// removes, seq and the user's rev move to the new seq, the sockets re-check
// and committed runs under the writer lock. rev is the user's rev after the
// call. The handler ends the user's sessions and tickets.
func (s *store) clearTOTP(ctx context.Context, caller, username string, committed ...func()) (rev int, removed bool, err error) {
	err = s.wr.Do(ctx, func(tx *txn) error {
		if err := s.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, seq := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == username })
		if i < 0 {
			return errNotFound
		}
		rev, removed = cur[i].Rev, false
		if cur[i].TOTP == nil {
			return nil
		}
		next, rec, newSeq := slices.Clone(cur), cur[i], seq+1
		rec.TOTP, rec.Rev = nil, newSeq
		next[i] = rec
		doc := usersDoc{Seq: newSeq, Users: next}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		tx.afterCommit(s.changed)
		tx.afterCommit(committed...)
		rev, removed = newSeq, true
		return nil
	})
	if err != nil {
		return 0, false, err
	}
	return rev, removed, nil
}

// deleteUser removes the named user, which must stand at rev (above 0). The
// refusals are saveUser's, with errNotFound for a user that is gone and
// errLastAdmin for the only admin; a rev of 0 or less is errRevRequired.
// seq of users.yaml moves and no record holds the new value. The handler ends
// the user's sessions.
func (s *store) deleteUser(ctx context.Context, caller, username string, rev int, committed ...func()) (seq int, err error) {
	if rev <= 0 {
		return 0, errRevRequired
	}
	err = s.wr.Do(ctx, func(tx *txn) error {
		if err := s.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(s.usersPath); err != nil {
			return err
		}
		cur, prev := s.usersNow()
		i := slices.IndexFunc(cur, func(r userRec) bool { return r.Username == username })
		curRev := 0
		if i >= 0 {
			curRev = cur[i].Rev
		}
		if err := checkRev(i >= 0, curRev, rev); err != nil {
			return err
		}
		if cur[i].Admin && countAdmins(cur) <= 1 {
			return errLastAdmin
		}
		doc := usersDoc{Seq: prev + 1, Users: slices.Delete(slices.Clone(cur), i, i+1)}
		s.seal.stageDoc(tx, roleUsers, s.usersPath, doc)
		tx.onPublish(func() { s.publish(&doc, nil) })
		tx.afterCommit(s.changed)
		tx.afterCommit(committed...)
		seq = doc.Seq
		return nil
	})
	if err != nil {
		return 0, err
	}
	return seq, nil
}

// listConnections returns a deep copy of the stored connections — the nested
// VPN slices are cloned so a caller can't mutate the live store through the
// result. Each record carries its rev. Callers strip the passwords before
// sending them to a client (see connToOutput).
func (s *store) listConnections() []connRec {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := append([]connRec(nil), s.conns...)
	for i := range out {
		out[i].Client.MsgVpns = append([]vpnRec(nil), out[i].Client.MsgVpns...)
	}
	return out
}

// snapshotAll is users and connections, each with its seq, as one committed
// state: it holds the writer's publish lock for read, so an import is seen
// whole or not at all. For a backup that also reads settings, call
// listUsers, listConnections and seqs inside writer.snapshot instead (the
// publish lock is not re-entrant).
func (s *store) snapshotAll() (users []userRec, conns []connRec, usersSeq, connsSeq int) {
	s.wr.snapshot(func() {
		users, conns = s.listUsers(), s.listConnections()
		usersSeq, connsSeq = s.seqs()
	})
	return users, conns, usersSeq, connsSeq
}

// hasConnection reports whether broker is stored.
func (s *store) hasConnection(broker string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return slices.ContainsFunc(s.conns, func(c connRec) bool { return c.Broker == broker })
}

// saveConnection creates (rev 0) or edits (rev above 0) the connection
// c.Broker, with saveUser's order of refusals (no last-admin rule). Blank
// password fields on an EXISTING broker keep the stored secrets as they are
// now (mergeConnSecrets). A change to a password alone moves seq and keeps
// the rev. The caller validates the record (validateConn) before the call.
func (s *store) saveConnection(ctx context.Context, caller string, c connRec, rev int, committed ...func()) (savedConn, error) {
	if rev < 0 {
		return savedConn{}, errRevRequired
	}
	var out savedConn
	err := s.wr.Do(ctx, func(tx *txn) error {
		if err := s.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(s.connsPath); err != nil {
			return err
		}
		cur, seq := s.connsNow()
		i := slices.IndexFunc(cur, func(r connRec) bool { return r.Broker == c.Broker })
		old := connRec{}
		if i >= 0 {
			old = cur[i]
		}
		if err := checkRev(i >= 0, old.Rev, rev); err != nil {
			return err
		}
		next, rec, newSeq := slices.Clone(cur), c, seq+1
		if i >= 0 {
			mergeConnSecrets(&rec, old)
			rec.Rev = old.Rev
			if !sameConnView(old, rec) {
				rec.Rev = newSeq
			}
			next[i] = rec
		} else {
			rec.Rev = newSeq
			next = append(next, rec)
		}
		doc := connsDoc{Seq: newSeq, Connections: next}
		s.seal.stageDoc(tx, roleConns, s.connsPath, doc)
		tx.onPublish(func() { s.publish(nil, &doc) })
		tx.afterCommit(s.changed)
		tx.afterCommit(committed...)
		out = savedConn{rev: rec.Rev, seq: newSeq}
		return nil
	})
	if err != nil {
		return savedConn{}, err
	}
	return out, nil
}

// mergeConnSecrets fills blank password fields in `c` from the existing
// record `old` (keep-on-edit), matching VPNs by name. A blank with no matching
// existing VPN stays blank — a renamed or brand-new VPN must carry its own
// password.
func mergeConnSecrets(c *connRec, old connRec) {
	if c.Semp.Password == "" {
		c.Semp.Password = old.Semp.Password
	}
	for i := range c.Client.MsgVpns {
		if c.Client.MsgVpns[i].Password != "" {
			continue
		}
		for _, ov := range old.Client.MsgVpns {
			if ov.Name == c.Client.MsgVpns[i].Name {
				c.Client.MsgVpns[i].Password = ov.Password
				break
			}
		}
	}
}

// deleteConnection removes the named broker, which must stand at rev (above
// 0); the refusals are deleteUser's without the last-admin rule. seq of
// connections.yaml moves and no record holds the new value.
func (s *store) deleteConnection(ctx context.Context, caller, broker string, rev int, committed ...func()) (seq int, err error) {
	if rev <= 0 {
		return 0, errRevRequired
	}
	err = s.wr.Do(ctx, func(tx *txn) error {
		if err := s.checkCaller(caller); err != nil {
			return err
		}
		if err := tx.check(s.connsPath); err != nil {
			return err
		}
		cur, prev := s.connsNow()
		i := slices.IndexFunc(cur, func(r connRec) bool { return r.Broker == broker })
		curRev := 0
		if i >= 0 {
			curRev = cur[i].Rev
		}
		if err := checkRev(i >= 0, curRev, rev); err != nil {
			return err
		}
		doc := connsDoc{Seq: prev + 1, Connections: slices.Delete(slices.Clone(cur), i, i+1)}
		s.seal.stageDoc(tx, roleConns, s.connsPath, doc)
		tx.onPublish(func() { s.publish(nil, &doc) })
		tx.afterCommit(s.changed)
		tx.afterCommit(committed...)
		seq = doc.Seq
		return nil
	})
	if err != nil {
		return 0, err
	}
	return seq, nil
}

// sectionImport is one section of an import: the backup's records, and
// whether they merge (the backup's records replace those of the same name and
// the rest stay) or replace the whole list. A nil *sectionImport skips the
// section.
type sectionImport[T any] struct {
	recs  []T
	merge bool
}

// importStaged is what stageImport tells the handler: the new seq of each file
// it staged (0 for a skipped section) and the users whose sessions must end
// (sessionEnders).
type importStaged struct {
	usersSeq, connsSeq int
	drop               []string
}

// stageImport plans an import of users and/or connections inside a
// transaction the caller opened with writer.Do, together with whatever else
// the caller stages there (the settings). It checks the files it will write
// against the disk, plans the merge or replace on the CURRENT lists, holds the
// result to the load rules (no administrator left is errLastAdmin, any other
// breach an *importInvalidError naming the section), stamps EVERY record of
// each imported section with that file's new seq (a seq or rev in the backup
// is ignored), stages the sealed files with the round-trip check, and queues
// the memory swap (both lists in one critical section) and the socket
// re-check. A refusal returns before anything is queued; the caller returns it
// from the op. Read the basis it compares with from seqs() in the same op.
func (s *store) stageImport(tx *txn, users *sectionImport[userRec], conns *sectionImport[connRec]) (importStaged, error) {
	var res importStaged
	var udoc *usersDoc
	var cdoc *connsDoc
	if users != nil {
		if err := tx.check(s.usersPath); err != nil {
			return importStaged{}, err
		}
		cur, seq := s.usersNow()
		list := slices.Clone(users.recs)
		if users.merge {
			list = mergeByName(cur, users.recs, userName)
		}
		if countAdmins(list) == 0 {
			return importStaged{}, errLastAdmin
		}
		if err := validateUsers(list); err != nil {
			return importStaged{}, &importInvalidError{section: "users", err: err}
		}
		for i := range list {
			list[i].Rev = seq + 1
		}
		udoc = &usersDoc{Seq: seq + 1, Users: list}
		res.usersSeq, res.drop = seq+1, sessionEnders(cur, list)
	}
	if conns != nil {
		if err := tx.check(s.connsPath); err != nil {
			return importStaged{}, err
		}
		cur, seq := s.connsNow()
		list := slices.Clone(conns.recs)
		if conns.merge {
			list = mergeByName(cur, conns.recs, connName)
		}
		if err := validateConns(list); err != nil {
			return importStaged{}, &importInvalidError{section: "connections", err: err}
		}
		for i := range list {
			list[i].Rev = seq + 1
		}
		cdoc = &connsDoc{Seq: seq + 1, Connections: list}
		res.connsSeq = seq + 1
	}
	if udoc != nil {
		s.seal.stageDoc(tx, roleUsers, s.usersPath, *udoc)
	}
	if cdoc != nil {
		s.seal.stageDoc(tx, roleConns, s.connsPath, *cdoc)
	}
	if udoc != nil || cdoc != nil {
		tx.onPublish(func() { s.publish(udoc, cdoc) })
		tx.afterCommit(s.changed)
	}
	return res, nil
}

// ----- bootstrap ----------------------------------------------------------------

// adminSeed returns the bootstrap admin password from SMU_ADMIN_PASSWORD or the
// file named by SMU_ADMIN_PASSWORD_FILE (a Docker secret), and which variable gave
// it. Neither set: "" and "", and the caller generates one. The password policy
// is the caller's to apply. The value is never echoed in an error.
func adminSeed(getenv func(string) string) (password, source string, err error) {
	direct, file := getenv(envAdminPassword), getenv(envAdminPasswordFile)
	switch {
	case direct != "" && file != "":
		return "", "", fmt.Errorf("set %s or %s, not both", envAdminPassword, envAdminPasswordFile)
	case file != "":
		data, err := os.ReadFile(file)
		if err != nil {
			return "", "", fmt.Errorf("%s=%q cannot be read: %w", envAdminPasswordFile, file, err)
		}
		password, source = strings.TrimRight(string(data), "\r\n"), envAdminPasswordFile
	case direct != "":
		password, source = direct, envAdminPassword
	default:
		return "", "", nil
	}
	return password, source, nil
}

// bootstrapUsers writes the first users file: one admin who must change the
// password at first sign-in. The password comes from the environment, or is
// generated and logged once (the operator's only way to read it). A supplied
// password that fails the policy is set aside with a warning naming the
// variable, never the value, and a generated one takes its place: the admin
// still has to change it at first sign-in, so the start need not stop.
func bootstrapUsers(opts storeOptions, sl *sealer, logger *slog.Logger) (usersDoc, error) {
	password, source, err := adminSeed(opts.getenv)
	if err != nil {
		return usersDoc{}, err
	}
	if source != "" {
		if err := checkPasswordPolicy(password); err != nil {
			logger.Warn("bootstrap password variable ignored: it does not meet the password policy, so a generated password is used instead",
				"env", source, "rule", err.Error())
			password, source = "", ""
		}
	}
	generated := source == ""
	if generated {
		password = rand.Text()
	}
	hash, err := opts.hasher.hash(context.Background(), password)
	if err != nil {
		return usersDoc{}, err
	}
	doc := usersDoc{Seq: 1, Users: []userRec{{
		Username:           bootstrapAdminName,
		Rev:                1,
		Password:           hash,
		MustChangePassword: true,
		Admin:              true,
		Operate:            []permRow{},
		ReadOnly:           []permRow{},
	}}}
	if err := sl.writeDoc(roleUsers, opts.usersPath, doc); err != nil {
		return usersDoc{}, err
	}
	if generated {
		logger.Warn("users file missing: bootstrap admin created with a generated password; sign in and change it now (shown once; delete the users file to bootstrap again)",
			"path", opts.usersPath, "username", bootstrapAdminName, "password", password)
	} else {
		logger.Warn("users file missing: bootstrap admin created; the password must be changed at first sign-in",
			"path", opts.usersPath, "username", bootstrapAdminName, "source", source)
	}
	return doc, nil
}
