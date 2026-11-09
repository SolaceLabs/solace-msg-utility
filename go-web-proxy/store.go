package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
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
	envAdminPassword     = "ADMIN_PASSWORD"
	envAdminPasswordFile = "ADMIN_PASSWORD_FILE"
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
}

type usersDoc struct {
	Users []userRec `yaml:"msg-utility-users"`
}

type vpnRec struct {
	Name     string `yaml:"name"`
	Username string `yaml:"username"`
	Password string `yaml:"password"` // inside the sealed file; reaches a browser only through dial
}

type clientRec struct {
	Port    flexStr  `yaml:"port"`
	MsgVpns []vpnRec `yaml:"msgVpns"`
}

type sempRec struct {
	Port     flexStr `yaml:"port"`
	Username string  `yaml:"username"`
	Password string  `yaml:"password"` // inside the sealed file; never reaches a browser
}

type connRec struct {
	Broker   string    `yaml:"broker"`
	Hostname string    `yaml:"hostname"`
	Semp     sempRec   `yaml:"semp"`
	Client   clientRec `yaml:"client"`
}

type connsDoc struct {
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

// store holds the parsed users and connections, guarded by an
// RWMutex (reads under RLock, CRUD writes under Lock). The file paths are
// retained so admin-CRUD mutations can persist back to the same files. Both
// files are encrypted with the store key (storecrypt.go), so the gateway is
// the only writer and nobody edits them by hand.
type store struct {
	mu        sync.RWMutex
	users     []userRec
	conns     []connRec
	usersPath string // retained for CRUD persistence
	connsPath string // retained for CRUD persistence
	seal      *sealer
	hasher    *hasher

	// onChange runs after every call to upsertUser, deleteUser,
	// upsertConnection or deleteConnection that returns no error, outside mu
	// (the SMF sockets re-check their access, sockets.go). Set once before
	// serving.
	onChange func()
}

// afterWrite is deferred first by each mutator that can change entitlement,
// so it runs after the mutator's own deferred unlock.
func (s *store) afterWrite(err *error) {
	if *err == nil && s.onChange != nil {
		s.onChange()
	}
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
	s := &store{usersPath: opts.usersPath, connsPath: opts.connsPath, seal: sl, hasher: opts.hasher}

	if _, err := os.Stat(opts.usersPath); errors.Is(err, os.ErrNotExist) {
		doc, err := bootstrapUsers(opts, sl, logger)
		if err != nil {
			return nil, fmt.Errorf("bootstrap users file %q: %w", opts.usersPath, err)
		}
		s.users = doc.Users
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
		s.users = doc.Users
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
		s.conns = doc.Connections
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

// brokerTarget is a broker address and the credential the gateway uses or
// hands out there. A copy: the store may change while a request runs.
type brokerTarget struct {
	host, port, user, pass string
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
			return brokerTarget{host: c.Hostname, port: string(c.Semp.Port), user: c.Semp.Username, pass: c.Semp.Password}, true
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
				return brokerTarget{host: c.Hostname, port: string(c.Client.Port), user: v.Username, pass: v.Password}, true
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

// checkPassword verifies a sign-in. An unknown user is checked against the
// hasher's dummy, so both answers take the same time. The hash runs outside
// the lock. err is set only when the hash could not run (request gone).
func (s *store) checkPassword(ctx context.Context, username, pw string) (mustChange, ok bool, err error) {
	s.mu.RLock()
	u, found := s.findUser(username)
	s.mu.RUnlock()
	match, err := s.hasher.verify(ctx, u.Password, pw)
	if err != nil {
		return false, false, err
	}
	return u.MustChangePassword, found && match, nil
}

func toRespPerms(rows []permRow) []respPerm {
	out := []respPerm{}
	for _, r := range rows {
		out = append(out, respPerm{Brokers: string(r.Brokers), MsgVpns: string(r.MsgVpns), Queues: string(r.Queues)})
	}
	return out
}

// ----- admin CRUD --------------------------------------------------------------

// errBlankNewUserPassword rejects creating a brand-new user with no password.
// (A blank password on EDIT legitimately keeps the existing hash.)
var errBlankNewUserPassword = errors.New("new user requires a password")

// errLastAdmin refuses deleting or demoting the only remaining admin, which
// would leave no one able to reach the admin app.
var errLastAdmin = errors.New("cannot remove the last admin")

var errUserNotFound = errors.New("user not found")

func countAdmins(users []userRec) int {
	n := 0
	for _, u := range users {
		if u.Admin {
			n++
		}
	}
	return n
}

// listUsers returns a deep copy of the stored users — the nested permRow and
// module slices are cloned so a caller can't mutate the live store through the
// result.
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
	}
	return out
}

// upsertUser replaces the user with the same username, or appends a new one,
// then persists. password is plaintext: blank on an EXISTING user keeps the
// stored hash (edit without changing the password), blank on a NEW user is
// rejected (errBlankNewUserPassword). The hash is computed before the lock.
// Demoting the last admin is refused (errLastAdmin). dropSessions reports a
// change that must end the user's sessions: a new password or a changed admin
// flag. Persist-then-commit: the in-memory slice is swapped only after the file
// write succeeds, so a failed write leaves the store unchanged.
func (s *store) upsertUser(ctx context.Context, u userRec, password string) (dropSessions bool, err error) {
	defer s.afterWrite(&err)
	if password != "" {
		if u.Password, err = s.hasher.hash(ctx, password); err != nil {
			return false, err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]userRec(nil), s.users...)
	found := false
	for i := range next {
		if next[i].Username != u.Username {
			continue
		}
		old := next[i]
		if old.Admin && !u.Admin && countAdmins(next) <= 1 {
			return false, errLastAdmin
		}
		if password == "" {
			u.Password = old.Password // keep existing
			u.MustChangePassword = old.MustChangePassword
		}
		dropSessions = password != "" || old.Admin != u.Admin
		next[i] = u
		found = true
		break
	}
	if !found {
		if password == "" {
			return false, errBlankNewUserPassword
		}
		next = append(next, u)
	}
	if err := s.seal.writeDoc(roleUsers, s.usersPath, usersDoc{Users: next}); err != nil {
		return false, err
	}
	s.users = next
	return dropSessions, nil
}

// setPassword is a user changing their own password: it stores the new hash and
// clears MustChangePassword. The caller drops the user's sessions.
func (s *store) setPassword(ctx context.Context, username, password string) error {
	hash, err := s.hasher.hash(ctx, password)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]userRec(nil), s.users...)
	for i := range next {
		if next[i].Username == username {
			next[i].Password = hash
			next[i].MustChangePassword = false
			if err := s.seal.writeDoc(roleUsers, s.usersPath, usersDoc{Users: next}); err != nil {
				return err
			}
			s.users = next
			return nil
		}
	}
	return errUserNotFound
}

// deleteUser removes the named user and persists. Returns found=false (and no
// error, no write) when there is no such user, or errLastAdmin when the target
// is the only remaining admin.
func (s *store) deleteUser(username string) (found bool, err error) {
	defer s.afterWrite(&err)
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.users {
		if s.users[i].Username == username {
			idx = i
			break
		}
	}
	if idx == -1 {
		return false, nil
	}
	if s.users[idx].Admin && countAdmins(s.users) <= 1 {
		return false, errLastAdmin
	}
	next := append(append([]userRec(nil), s.users[:idx]...), s.users[idx+1:]...)
	if err := s.seal.writeDoc(roleUsers, s.usersPath, usersDoc{Users: next}); err != nil {
		return false, err
	}
	s.users = next
	return true, nil
}

// listConnections returns a deep copy of the stored connections — the nested
// VPN slices are cloned so a caller can't mutate the live store through the
// result. Callers strip the passwords before sending them to a client
// (see connToOutput).
func (s *store) listConnections() []connRec {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := append([]connRec(nil), s.conns...)
	for i := range out {
		out[i].Client.MsgVpns = append([]vpnRec(nil), out[i].Client.MsgVpns...)
	}
	return out
}

// upsertConnection replaces the connection with the same broker, or appends a
// new one, then persists. Blank password fields on an EXISTING broker
// keep the stored secrets (edit-without-changing-password) — see
// mergeConnSecrets. Persist-then-commit, same as upsertUser.
func (s *store) upsertConnection(c connRec) (err error) {
	defer s.afterWrite(&err)
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]connRec(nil), s.conns...)
	found := false
	for i := range next {
		if next[i].Broker == c.Broker {
			mergeConnSecrets(&c, next[i])
			next[i] = c
			found = true
			break
		}
	}
	if !found {
		next = append(next, c)
	}
	if err := s.seal.writeDoc(roleConns, s.connsPath, connsDoc{Connections: next}); err != nil {
		return err
	}
	s.conns = next
	return nil
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

// deleteConnection removes the named broker and persists. Returns found=false
// (no error, no write) when there is no such broker.
func (s *store) deleteConnection(broker string) (found bool, err error) {
	defer s.afterWrite(&err)
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i := range s.conns {
		if s.conns[i].Broker == broker {
			idx = i
			break
		}
	}
	if idx == -1 {
		return false, nil
	}
	next := append(append([]connRec(nil), s.conns[:idx]...), s.conns[idx+1:]...)
	if err := s.seal.writeDoc(roleConns, s.connsPath, connsDoc{Connections: next}); err != nil {
		return false, err
	}
	s.conns = next
	return true, nil
}

// replaceUsers swaps the whole user list (an import) and persists. It returns
// the users whose sessions must end (sessionEnders). next must hold an
// administrator.
func (s *store) replaceUsers(next []userRec) (drop []string, err error) {
	defer s.afterWrite(&err)
	if err := validateUsers(next); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.seal.writeDoc(roleUsers, s.usersPath, usersDoc{Users: next}); err != nil {
		return nil, err
	}
	drop = sessionEnders(s.users, next)
	s.users = next
	return drop, nil
}

// replaceConnections swaps the whole connection list (an import) and
// persists.
func (s *store) replaceConnections(next []connRec) (err error) {
	defer s.afterWrite(&err)
	if err := validateConns(next); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.seal.writeDoc(roleConns, s.connsPath, connsDoc{Connections: next}); err != nil {
		return err
	}
	s.conns = next
	return nil
}

// ----- bootstrap ----------------------------------------------------------------

// adminSeed returns the bootstrap admin password from ADMIN_PASSWORD or the
// file named by ADMIN_PASSWORD_FILE (a Docker secret), and which variable gave
// it. Neither set: "" and "", and the caller generates one. The value is never
// echoed in an error.
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
	if err := checkPasswordPolicy(password); err != nil {
		return "", "", fmt.Errorf("%s: %w", source, err)
	}
	return password, source, nil
}

// bootstrapUsers writes the first users file: one admin who must change the
// password at first sign-in. The password comes from the environment, or is
// generated and logged once (the operator's only way to read it).
func bootstrapUsers(opts storeOptions, sl *sealer, logger *slog.Logger) (usersDoc, error) {
	password, source, err := adminSeed(opts.getenv)
	if err != nil {
		return usersDoc{}, err
	}
	generated := source == ""
	if generated {
		password = rand.Text()
	}
	hash, err := opts.hasher.hash(context.Background(), password)
	if err != nil {
		return usersDoc{}, err
	}
	doc := usersDoc{Users: []userRec{{
		Username:           bootstrapAdminName,
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
