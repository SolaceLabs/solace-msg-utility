//go:build managed

package main

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// bootstrapAdminToken is the stored token for the default admin (username
// "admin", password "msgutility"). It is the client-side stamp() of those
// values — Go never computes it. PINNED by tests/core/encode.test.ts
// ("pins the bootstrap admin token"); if that test's expected value changes,
// update this literal in lockstep or admin login (string-match) breaks.
const bootstrapAdminToken = "S1:K160PHJHFKEGE8N50K9CRQZRF0"

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
	Username string    `yaml:"username"`
	Password string    `yaml:"password"` // stored token (client stamp); never decrypted
	Admin    bool      `yaml:"admin"`
	Operate  []permRow `yaml:"operate"`
	ReadOnly []permRow `yaml:"read-only"`
}

type usersDoc struct {
	Users []userRec `yaml:"msg-utility-users"`
}

type vpnRec struct {
	Name     string `yaml:"name"`
	Username string `yaml:"username"`
	Password string `yaml:"password"` // packed (client-encrypted); stored opaque
}

type clientRec struct {
	Port    flexStr  `yaml:"port"`
	MsgVpns []vpnRec `yaml:"msgVpns"`
}

type sempRec struct {
	Port     flexStr `yaml:"port"`
	Username string  `yaml:"username"`
	Password string  `yaml:"password"` // packed (client-encrypted); stored opaque
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

// ----- getConnections response shapes (JSON to the browser) -------------------

type respPerm struct {
	Brokers string `json:"brokers"`
	MsgVpns string `json:"msgVpns"`
	Queues  string `json:"queues"`
}
type respClient struct {
	Port string `json:"port"`
	User string `json:"user"`
	Pass string `json:"pass"` // still packed
}
type respVpn struct {
	Name   string     `json:"name"`
	Client respClient `json:"client"`
}
type respSemp struct {
	Port string `json:"port"`
	User string `json:"user"`
	Pass string `json:"pass"` // still packed
}
type respBroker struct {
	Broker   string    `json:"broker"`
	Hostname string    `json:"hostname"`
	Semp     respSemp  `json:"semp"`
	MsgVpns  []respVpn `json:"msgVpns"`
}
type profileResponse struct {
	Admin    bool         `json:"admin"`
	SiteSeed string       `json:"siteSeed"` // base64; client imports NON-extractable
	Operate  []respPerm   `json:"operate"`
	ReadOnly []respPerm   `json:"readOnly"`
	Brokers  []respBroker `json:"brokers"`
}

// ----- store ------------------------------------------------------------------

// store holds the parsed users + connections + the site seed, guarded by an
// RWMutex (reads under RLock, CRUD writes under Lock). The file paths are
// retained so admin-CRUD mutations can persist back to the same files.
type store struct {
	mu        sync.RWMutex
	users     []userRec
	conns     []connRec
	siteSeed  string // base64 of the raw seed bytes
	usersPath string // retained for CRUD persistence
	connsPath string // retained for CRUD persistence
}

func loadStore(usersPath, connsPath, seedPath string, logger *slog.Logger) (*store, error) {
	s := &store{usersPath: usersPath, connsPath: connsPath}

	if _, err := os.Stat(usersPath); errors.Is(err, os.ErrNotExist) {
		logger.Warn("users file missing — bootstrapping a default admin", "path", usersPath)
		doc, err := bootstrapUsers(usersPath)
		if err != nil {
			return nil, fmt.Errorf("bootstrap users: %w", err)
		}
		s.users = doc.Users
	} else {
		var doc usersDoc
		if err := readYAML(usersPath, &doc); err != nil {
			return nil, fmt.Errorf("read users: %w", err)
		}
		s.users = doc.Users
	}

	if _, err := os.Stat(connsPath); errors.Is(err, os.ErrNotExist) {
		logger.Warn("connections file missing — no brokers will be offered", "path", connsPath)
	} else {
		var doc connsDoc
		if err := readYAML(connsPath, &doc); err != nil {
			return nil, fmt.Errorf("read connections: %w", err)
		}
		s.conns = doc.Connections
	}

	seed, err := loadOrGenerateSeed(seedPath, logger)
	if err != nil {
		return nil, fmt.Errorf("site seed: %w", err)
	}
	s.siteSeed = seed
	return s, nil
}

// reload re-reads users + connections from disk into the in-memory store, under
// the write lock, so out-of-band edits to the YAML files take effect without a
// restart. Unlike loadStore it does NOT bootstrap a missing users file or touch
// the site seed. A missing connections file is tolerated (→ no brokers), matching
// loadStore. The slices are swapped only after both reads succeed, so a failed
// read leaves the store unchanged.
func (s *store) reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var udoc usersDoc
	if err := readYAML(s.usersPath, &udoc); err != nil {
		return fmt.Errorf("reload users: %w", err)
	}

	var cdoc connsDoc
	if _, err := os.Stat(s.connsPath); errors.Is(err, os.ErrNotExist) {
		cdoc.Connections = nil
	} else if err := readYAML(s.connsPath, &cdoc); err != nil {
		return fmt.Errorf("reload connections: %w", err)
	}

	s.users = udoc.Users
	s.conns = cdoc.Connections
	return nil
}

// getConnections validates the credentials (string-match — never decrypts) and
// returns the entitled profile, or ok=false for unknown-user / token-mismatch
// (the caller maps both to 400, indistinguishable by design).
func (s *store) getConnections(username, token string) (*profileResponse, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var u *userRec
	for i := range s.users {
		if s.users[i].Username == username {
			u = &s.users[i]
			break
		}
	}
	if u == nil || u.Password != token {
		return nil, false
	}

	resp := &profileResponse{
		Admin:    u.Admin,
		SiteSeed: s.siteSeed,
		Operate:  toRespPerms(u.Operate),
		ReadOnly: toRespPerms(u.ReadOnly),
		Brokers:  []respBroker{},
	}
	for _, c := range s.conns {
		vpns := []respVpn{}
		for _, v := range c.Client.MsgVpns {
			if entitled(u, c.Broker, v.Name) {
				vpns = append(vpns, respVpn{
					Name:   v.Name,
					Client: respClient{Port: string(c.Client.Port), User: v.Username, Pass: v.Password},
				})
			}
		}
		if len(vpns) > 0 {
			resp.Brokers = append(resp.Brokers, respBroker{
				Broker:   c.Broker,
				Hostname: c.Hostname,
				Semp:     respSemp{Port: string(c.Semp.Port), User: c.Semp.Username, Pass: c.Semp.Password},
				MsgVpns:  vpns,
			})
		}
	}
	return resp, true
}

func toRespPerms(rows []permRow) []respPerm {
	out := []respPerm{}
	for _, r := range rows {
		out = append(out, respPerm{Brokers: string(r.Brokers), MsgVpns: string(r.MsgVpns), Queues: string(r.Queues)})
	}
	return out
}

// ----- admin CRUD (string-match auth; never decrypts) -------------------------

// errBlankNewUserPassword rejects creating a brand-new user with no password —
// an empty stored token would authenticate against an empty token string.
// (A blank password on EDIT legitimately keeps the existing token.)
var errBlankNewUserPassword = errors.New("new user requires a password")

// errLastAdmin refuses deleting the only remaining admin, which would lock
// every /managed/* admin endpoint out with no in-app recovery.
var errLastAdmin = errors.New("cannot delete the last admin")

// authAdmin reports whether username+token match a stored user with admin:true
// (string-match, never decrypts). Unknown user, wrong token, and non-admin are
// all indistinguishable false — the caller maps every false to 400. Takes its
// own RLock, so it must NOT be called while already holding the lock.
func (s *store) authAdmin(username, token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == username && s.users[i].Password == token {
			return s.users[i].Admin
		}
	}
	return false
}

// authUser reports whether username+token match ANY stored user (string-match,
// never decrypts) — the admin flag is ignored. Used to gate operations any
// logged-in user may trigger (e.g. reloading the store from disk).
func (s *store) authUser(username, token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].Username == username && s.users[i].Password == token {
			return true
		}
	}
	return false
}

// listUsers returns a deep copy of the stored users — the nested permRow slices
// are cloned so a caller can't mutate the live store through the result.
// Callers must strip secrets before sending them to a client (see userToOutput).
func (s *store) listUsers() []userRec {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := append([]userRec(nil), s.users...)
	for i := range out {
		out[i].Operate = append([]permRow(nil), out[i].Operate...)
		out[i].ReadOnly = append([]permRow(nil), out[i].ReadOnly...)
	}
	return out
}

// upsertUser replaces the user with the same username, or appends a new one,
// then persists. A blank Password on an EXISTING user keeps the stored token
// (edit-without-changing-password); a blank Password on a NEW user is rejected
// (errBlankNewUserPassword) so the store never holds an empty-token account.
// Persist-then-commit: the in-memory slice is swapped only after the file write
// succeeds, so a failed write leaves the store unchanged.
func (s *store) upsertUser(u userRec) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	next := append([]userRec(nil), s.users...)
	found := false
	for i := range next {
		if next[i].Username == u.Username {
			if u.Password == "" {
				u.Password = next[i].Password // keep existing
			}
			next[i] = u
			found = true
			break
		}
	}
	if !found {
		if u.Password == "" {
			return errBlankNewUserPassword
		}
		next = append(next, u)
	}
	if err := writeYAML(s.usersPath, usersDoc{Users: next}); err != nil {
		return err
	}
	s.users = next
	return nil
}

// deleteUser removes the named user and persists. Returns found=false (and no
// error, no write) when there is no such user, or errLastAdmin when the target
// is the only remaining admin (refused — deleting it would lock out /managed/*).
func (s *store) deleteUser(username string) (bool, error) {
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
	if s.users[idx].Admin {
		admins := 0
		for i := range s.users {
			if s.users[i].Admin {
				admins++
			}
		}
		if admins <= 1 {
			return false, errLastAdmin
		}
	}
	next := append(append([]userRec(nil), s.users[:idx]...), s.users[idx+1:]...)
	if err := writeYAML(s.usersPath, usersDoc{Users: next}); err != nil {
		return false, err
	}
	s.users = next
	return true, nil
}

// listConnections returns a deep copy of the stored connections — the nested
// VPN slices are cloned so a caller can't mutate the live store through the
// result. Callers strip the packed passwords before sending them to a client
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
// new one, then persists. Blank packed-password fields on an EXISTING broker
// keep the stored secrets (edit-without-changing-password) — see
// mergeConnSecrets. Persist-then-commit, same as upsertUser.
func (s *store) upsertConnection(c connRec) error {
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
	if err := writeYAML(s.connsPath, connsDoc{Connections: next}); err != nil {
		return err
	}
	s.conns = next
	return nil
}

// mergeConnSecrets fills blank packed-password fields in `c` from the existing
// record `old` (keep-on-edit), matching VPNs by name. A blank with no matching
// existing VPN stays blank — a renamed or brand-new VPN must carry its own
// packed password.
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
func (s *store) deleteConnection(broker string) (bool, error) {
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
	if err := writeYAML(s.connsPath, connsDoc{Connections: next}); err != nil {
		return false, err
	}
	s.conns = next
	return true, nil
}

// ----- bootstrap + seed -------------------------------------------------------

func bootstrapUsers(path string) (usersDoc, error) {
	doc := usersDoc{Users: []userRec{{
		Username: "admin",
		Password: bootstrapAdminToken,
		Admin:    true,
		Operate:  []permRow{},
		ReadOnly: []permRow{},
	}}}
	if err := writeYAML(path, doc); err != nil {
		return usersDoc{}, err
	}
	return doc, nil
}

func loadOrGenerateSeed(path string, logger *slog.Logger) (string, error) {
	data, err := os.ReadFile(path)
	if err == nil {
		return strings.TrimSpace(string(data)), nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	logger.Warn("site-seed file missing — generating a new one (back this up; losing it orphans stored creds)", "path", path)
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	b64 := base64.StdEncoding.EncodeToString(raw)
	if err := writeFileAtomic(path, []byte(b64)); err != nil {
		return "", err
	}
	return b64, nil
}

// ----- atomic file helpers ----------------------------------------------------

// writeFileAtomic writes data via a same-directory temp file + fsync + rename so
// a crash mid-write can't leave a truncated YAML/seed file.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func writeYAML(path string, v any) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, data)
}

func readYAML(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return yaml.Unmarshal(data, v)
}
