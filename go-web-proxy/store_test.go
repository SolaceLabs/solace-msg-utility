//go:build managed

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// newStoreWithFixtures loads a store seeded with the package usersYAML/connsYAML
// fixtures (admin + viewer, brokers b1/b2) in a fresh temp dir.
func newStoreWithFixtures(t *testing.T) *store {
	t.Helper()
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	connsPath := filepath.Join(dir, "conns.yaml")
	writeFile(t, usersPath, usersYAML)
	writeFile(t, connsPath, connsYAML)
	s, err := loadStore(usersPath, connsPath, filepath.Join(dir, "s.seed"), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	return s
}

// quietLogger is defined in tls_test.go (same package) and reused here.

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

const usersYAML = `msg-utility-users:
  - username: admin
    password: tok-admin
    admin: true
    operate:
      - brokers: '*'
        msgVpns: '*'
        queues: '*'
  - username: viewer
    password: tok-viewer
    admin: false
    read-only:
      - brokers: b1
        msgVpns: v1
        queues: '*'
`

const connsYAML = `msg-utility-connections:
  - broker: b1
    hostname: host1
    semp:
      port: 1943
      username: mon
      password: PKD:semp-b1
    client:
      port: 1443
      msgVpns:
        - name: v1
          username: u1
          password: PKD:cli-b1v1
        - name: v2
          username: u2
          password: PKD:cli-b1v2
  - broker: b2
    hostname: host2
    semp:
      port: 1943
      username: mon
      password: PKD:semp-b2
    client:
      port: 1443
      msgVpns:
        - name: v9
          username: u9
          password: PKD:cli-b2v9
`

func TestLoadStore_BootstrapsAdminWhenUsersFileMissing(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	seedPath := filepath.Join(dir, "site.seed")

	s, err := loadStore(usersPath, filepath.Join(dir, "conns.yaml"), seedPath, quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	if _, err := os.Stat(usersPath); err != nil {
		t.Fatalf("users file should have been written: %v", err)
	}
	prof, ok := s.getConnections("admin", bootstrapAdminToken)
	if !ok {
		t.Fatal("bootstrap admin should authenticate with the pinned token")
	}
	if !prof.Admin {
		t.Error("bootstrap admin should be admin")
	}
	if len(prof.Brokers) != 0 {
		t.Errorf("bootstrap admin has no broker access, got %d", len(prof.Brokers))
	}
	if s.siteSeed == "" {
		t.Error("site seed should be generated")
	}
	if _, err := os.Stat(seedPath); err != nil {
		t.Fatalf("seed file should have been written: %v", err)
	}
}

func TestGetConnections_AuthAndEntitlement(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	connsPath := filepath.Join(dir, "conns.yaml")
	writeFile(t, usersPath, usersYAML)
	writeFile(t, connsPath, connsYAML)

	s, err := loadStore(usersPath, connsPath, filepath.Join(dir, "site.seed"), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}

	if _, ok := s.getConnections("ghost", "x"); ok {
		t.Error("unknown user should fail")
	}
	if _, ok := s.getConnections("admin", "wrong"); ok {
		t.Error("bad token should fail")
	}

	prof, ok := s.getConnections("admin", "tok-admin")
	if !ok {
		t.Fatal("admin auth failed")
	}
	if len(prof.Brokers) != 2 {
		t.Fatalf("admin should see 2 brokers, got %d", len(prof.Brokers))
	}
	if prof.Brokers[0].Semp.Pass != "PKD:semp-b1" {
		t.Errorf("packed semp pass should pass through opaque, got %q", prof.Brokers[0].Semp.Pass)
	}
	if prof.Brokers[0].MsgVpns[0].Client.Port != "1443" {
		t.Errorf("unquoted YAML port should become string, got %q", prof.Brokers[0].MsgVpns[0].Client.Port)
	}
	if prof.SiteSeed == "" {
		t.Error("siteSeed should be present")
	}

	vp, ok := s.getConnections("viewer", "tok-viewer")
	if !ok {
		t.Fatal("viewer auth failed")
	}
	if len(vp.Brokers) != 1 || vp.Brokers[0].Broker != "b1" {
		t.Fatalf("viewer should see only b1, got %+v", vp.Brokers)
	}
	if len(vp.Brokers[0].MsgVpns) != 1 || vp.Brokers[0].MsgVpns[0].Name != "v1" {
		t.Error("viewer should see only v1 on b1")
	}
	if vp.Admin {
		t.Error("viewer is not admin")
	}
}

func TestLoadStore_MissingConnectionsFileYieldsNoBrokers(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	writeFile(t, usersPath, usersYAML)
	s, err := loadStore(usersPath, filepath.Join(dir, "absent.yaml"), filepath.Join(dir, "s.seed"), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	prof, _ := s.getConnections("admin", "tok-admin")
	if len(prof.Brokers) != 0 {
		t.Error("no connections file should yield no brokers")
	}
}

func TestLoadStore_SeedPersistsAcrossLoads(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	seedPath := filepath.Join(dir, "s.seed")
	writeFile(t, usersPath, usersYAML)
	s1, _ := loadStore(usersPath, filepath.Join(dir, "c.yaml"), seedPath, quietLogger())
	s2, _ := loadStore(usersPath, filepath.Join(dir, "c.yaml"), seedPath, quietLogger())
	if s1.siteSeed == "" || s1.siteSeed != s2.siteSeed {
		t.Errorf("seed should persist across loads: %q vs %q", s1.siteSeed, s2.siteSeed)
	}
}

func TestLoadStore_MalformedUsersYAML(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	writeFile(t, usersPath, "msg-utility-users:\n  - [unclosed")
	_, err := loadStore(usersPath, filepath.Join(dir, "c.yaml"), filepath.Join(dir, "s.seed"), quietLogger())
	if err == nil {
		t.Error("malformed users YAML should error")
	}
}

func TestGetConnections_RaceSafe(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	connsPath := filepath.Join(dir, "conns.yaml")
	writeFile(t, usersPath, usersYAML)
	writeFile(t, connsPath, connsYAML)
	s, _ := loadStore(usersPath, connsPath, filepath.Join(dir, "s.seed"), quietLogger())

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.getConnections("admin", "tok-admin")
		}()
	}
	wg.Wait()
}

// ----- admin CRUD store methods ----------------------------------------------

func TestStore_AuthAdmin(t *testing.T) {
	s := newStoreWithFixtures(t)
	if !s.authAdmin("admin", "tok-admin") {
		t.Error("admin with correct token should pass")
	}
	if s.authAdmin("viewer", "tok-viewer") {
		t.Error("a valid non-admin user must be rejected")
	}
	if s.authAdmin("admin", "wrong") {
		t.Error("bad token must be rejected")
	}
	if s.authAdmin("ghost", "x") {
		t.Error("unknown user must be rejected")
	}
}

func TestStore_AuthUser(t *testing.T) {
	s := newStoreWithFixtures(t)
	if !s.authUser("admin", "tok-admin") {
		t.Error("admin with correct token should pass")
	}
	if !s.authUser("viewer", "tok-viewer") {
		t.Error("a valid NON-admin user must pass (the key difference from authAdmin)")
	}
	if s.authUser("viewer", "wrong") {
		t.Error("bad token must be rejected")
	}
	if s.authUser("ghost", "x") {
		t.Error("unknown user must be rejected")
	}
}

func TestStore_Reload_PicksUpDiskEdits(t *testing.T) {
	s := newStoreWithFixtures(t)
	// Out-of-band edits to both files: add a user and a broker on disk.
	writeFile(t, s.usersPath, usersYAML+"  - username: carol\n    password: tok-carol\n    admin: false\n")
	writeFile(t, s.connsPath, connsYAML+"  - broker: b3\n    hostname: host3\n    semp:\n      port: 1943\n      username: mon\n      password: PKD:semp-b3\n    client:\n      port: 1443\n      msgVpns:\n        - name: v3\n          username: u3\n          password: PKD:cli-b3v3\n")

	if s.authUser("carol", "tok-carol") {
		t.Fatal("carol should not be known before reload (disk edit not yet applied)")
	}
	if err := s.reload(); err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !s.authUser("carol", "tok-carol") {
		t.Error("reload should pick up the new user from disk")
	}
	found := false
	for _, c := range s.listConnections() {
		if c.Broker == "b3" {
			found = true
		}
	}
	if !found {
		t.Error("reload should pick up the new connection from disk")
	}
}

func TestStore_Reload_ToleratesMissingConnectionsFile(t *testing.T) {
	s := newStoreWithFixtures(t)
	if err := os.Remove(s.connsPath); err != nil {
		t.Fatalf("remove conns: %v", err)
	}
	if err := s.reload(); err != nil {
		t.Fatalf("reload should tolerate a missing connections file: %v", err)
	}
	if len(s.listConnections()) != 0 {
		t.Error("a missing connections file should reload to zero brokers")
	}
	if !s.authUser("admin", "tok-admin") {
		t.Error("users must remain after reload")
	}
}

func TestStore_Reload_ErrorLeavesStoreUnchanged(t *testing.T) {
	s := newStoreWithFixtures(t)
	beforeUsers := len(s.listUsers())
	beforeConns := len(s.listConnections())
	writeFile(t, s.usersPath, "msg-utility-users:\n  - [malformed")
	if err := s.reload(); err == nil {
		t.Fatal("reload should error on malformed users YAML")
	}
	if len(s.listUsers()) != beforeUsers || len(s.listConnections()) != beforeConns {
		t.Error("a failed reload must leave the in-memory store unchanged")
	}
}

func TestStore_Reload_ErrorOnMalformedConnections(t *testing.T) {
	s := newStoreWithFixtures(t)
	beforeConns := len(s.listConnections())
	writeFile(t, s.connsPath, "msg-utility-connections:\n  - [malformed")
	if err := s.reload(); err == nil {
		t.Fatal("reload should error on malformed connections YAML")
	}
	if len(s.listConnections()) != beforeConns {
		t.Error("a failed reload must leave the in-memory connections unchanged")
	}
}

func TestStore_UpsertUser_CreateAndPersist(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	connsPath := filepath.Join(dir, "conns.yaml")
	writeFile(t, usersPath, usersYAML)
	writeFile(t, connsPath, connsYAML)
	s, err := loadStore(usersPath, connsPath, filepath.Join(dir, "s.seed"), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	err = s.upsertUser(userRec{
		Username: "bob", Password: "S1:bob", Admin: true,
		Operate: []permRow{{Brokers: "*", MsgVpns: "*", Queues: "*"}},
	})
	if err != nil {
		t.Fatalf("upsertUser: %v", err)
	}
	// Persisted: a fresh load from the same file sees bob and authenticates him.
	s2, err := loadStore(usersPath, connsPath, filepath.Join(dir, "s.seed"), quietLogger())
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if !s2.authAdmin("bob", "S1:bob") {
		t.Error("bob should authenticate as admin after reload (persistence)")
	}
}

func TestStore_UpsertUser_EditKeepsPasswordOnBlank(t *testing.T) {
	s := newStoreWithFixtures(t)
	// Demote admin to non-admin without resupplying the password.
	if err := s.upsertUser(userRec{Username: "admin", Password: "", Admin: false}); err != nil {
		t.Fatalf("upsertUser: %v", err)
	}
	if s.authAdmin("admin", "tok-admin") {
		t.Error("admin was demoted → authAdmin must now be false")
	}
	// The kept password still authenticates (string-match) — proving the blank
	// password did not wipe the stored token.
	if _, ok := s.getConnections("admin", "tok-admin"); !ok {
		t.Error("blank password on edit must keep the existing token")
	}
}

func TestStore_UpsertUser_EditChangesPassword(t *testing.T) {
	s := newStoreWithFixtures(t)
	if err := s.upsertUser(userRec{Username: "viewer", Password: "S1:new", Admin: false}); err != nil {
		t.Fatalf("upsertUser: %v", err)
	}
	if _, ok := s.getConnections("viewer", "tok-viewer"); ok {
		t.Error("old token must stop working after a password change")
	}
	if _, ok := s.getConnections("viewer", "S1:new"); !ok {
		t.Error("new token must authenticate")
	}
}

func TestStore_UpsertUser_RejectsBlankNewPassword(t *testing.T) {
	s := newStoreWithFixtures(t)
	before := len(s.listUsers())
	err := s.upsertUser(userRec{Username: "ghost", Password: "", Admin: true})
	if !errors.Is(err, errBlankNewUserPassword) {
		t.Fatalf("blank-password create must be rejected, got %v", err)
	}
	if len(s.listUsers()) != before {
		t.Error("a rejected create must not persist")
	}
	if s.authAdmin("ghost", "") {
		t.Error("no empty-token admin account should have been minted")
	}
}

func TestStore_DeleteUser(t *testing.T) {
	s := newStoreWithFixtures(t)
	found, err := s.deleteUser("viewer")
	if err != nil || !found {
		t.Fatalf("delete viewer: found=%v err=%v", found, err)
	}
	if _, ok := s.getConnections("viewer", "tok-viewer"); ok {
		t.Error("deleted user must not authenticate")
	}
	found, err = s.deleteUser("ghost")
	if err != nil || found {
		t.Errorf("deleting unknown user: want found=false err=nil, got found=%v err=%v", found, err)
	}
}

func TestStore_DeleteUser_RefusesLastAdmin(t *testing.T) {
	s := newStoreWithFixtures(t) // admin is the only admin
	found, err := s.deleteUser("admin")
	if !errors.Is(err, errLastAdmin) {
		t.Fatalf("deleting the last admin must return errLastAdmin, got found=%v err=%v", found, err)
	}
	if _, ok := s.getConnections("admin", "tok-admin"); !ok {
		t.Error("a refused delete must leave the admin in place")
	}
}

func TestStore_DeleteUser_AllowsNonLastAdmin(t *testing.T) {
	s := newStoreWithFixtures(t)
	if err := s.upsertUser(userRec{Username: "admin2", Password: "S1:a2", Admin: true}); err != nil {
		t.Fatalf("upsertUser: %v", err)
	}
	found, err := s.deleteUser("admin")
	if err != nil || !found {
		t.Fatalf("deleting a non-last admin must succeed, got found=%v err=%v", found, err)
	}
	if !s.authAdmin("admin2", "S1:a2") {
		t.Error("the remaining admin should still authenticate")
	}
}

func TestStore_ListUsers_ReturnsDeepCopy(t *testing.T) {
	s := newStoreWithFixtures(t)
	us := s.listUsers()
	if len(us) != 2 {
		t.Fatalf("want 2 users, got %d", len(us))
	}
	us[0].Username = "MUTATED"
	// admin (index 0) carries one operate glob row in the fixture.
	if len(us[0].Operate) == 0 {
		t.Fatal("fixture admin should have an operate row")
	}
	us[0].Operate[0].Queues = "MUTATED"
	fresh := s.listUsers()
	if fresh[0].Username == "MUTATED" {
		t.Error("top-level field must be isolated")
	}
	if fresh[0].Operate[0].Queues == "MUTATED" {
		t.Error("nested permRow slice must be isolated (deep copy)")
	}
}

func TestStore_UpsertConnection_Create(t *testing.T) {
	s := newStoreWithFixtures(t)
	err := s.upsertConnection(connRec{
		Broker: "b3", Hostname: "host3",
		Semp:   sempRec{Port: "1943", Username: "mon", Password: "V1:semp-b3"},
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u", Password: "V1:c"}}},
	})
	if err != nil {
		t.Fatalf("upsertConnection: %v", err)
	}
	if len(s.listConnections()) != 3 {
		t.Errorf("want 3 connections after create, got %d", len(s.listConnections()))
	}
}

func TestStore_UpsertConnection_MergeSecretsOnEdit(t *testing.T) {
	s := newStoreWithFixtures(t)
	edit := connRec{
		Broker: "b1", Hostname: "host1-new",
		Semp: sempRec{Port: "1943", Username: "mon", Password: ""}, // blank → keep PKD:semp-b1
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{
			{Name: "v1", Username: "u1", Password: ""},           // blank + match → keep PKD:cli-b1v1
			{Name: "v2", Username: "u2", Password: "V1:changed"}, // non-blank → replace
			{Name: "vX", Username: "ux", Password: ""},           // blank + no match → stays ""
		}},
	}
	if err := s.upsertConnection(edit); err != nil {
		t.Fatalf("upsertConnection: %v", err)
	}
	var b1 connRec
	for _, c := range s.listConnections() {
		if c.Broker == "b1" {
			b1 = c
		}
	}
	if b1.Hostname != "host1-new" {
		t.Errorf("non-secret fields must update, hostname=%q", b1.Hostname)
	}
	if b1.Semp.Password != "PKD:semp-b1" {
		t.Errorf("blank semp password must be kept, got %q", b1.Semp.Password)
	}
	got := map[string]string{}
	for _, v := range b1.Client.MsgVpns {
		got[v.Name] = v.Password
	}
	if got["v1"] != "PKD:cli-b1v1" {
		t.Errorf("v1: blank + name match must keep, got %q", got["v1"])
	}
	if got["v2"] != "V1:changed" {
		t.Errorf("v2: non-blank must replace, got %q", got["v2"])
	}
	if got["vX"] != "" {
		t.Errorf("vX: blank + no match must stay blank, got %q", got["vX"])
	}
}

func TestStore_UpsertConnection_EditReplacesSemp(t *testing.T) {
	s := newStoreWithFixtures(t)
	// Non-blank semp password on edit must hit the replace (not keep) branch.
	edit := connRec{
		Broker: "b2", Hostname: "host2",
		Semp:   sempRec{Port: "1943", Username: "mon", Password: "V1:semp-b2-new"},
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v9", Username: "u9", Password: "V1:c-new"}}},
	}
	if err := s.upsertConnection(edit); err != nil {
		t.Fatalf("upsertConnection: %v", err)
	}
	for _, c := range s.listConnections() {
		if c.Broker == "b2" && c.Semp.Password != "V1:semp-b2-new" {
			t.Errorf("non-blank semp password must replace, got %q", c.Semp.Password)
		}
	}
}

func TestStore_DeleteConnection(t *testing.T) {
	s := newStoreWithFixtures(t)
	found, err := s.deleteConnection("b2")
	if err != nil || !found {
		t.Fatalf("delete b2: found=%v err=%v", found, err)
	}
	if len(s.listConnections()) != 1 {
		t.Errorf("want 1 connection after delete, got %d", len(s.listConnections()))
	}
	found, _ = s.deleteConnection("nope")
	if found {
		t.Error("deleting an unknown broker must return found=false")
	}
}

func TestStore_ListConnections_ReturnsDeepCopy(t *testing.T) {
	s := newStoreWithFixtures(t)
	cs := s.listConnections()
	if len(cs) != 2 {
		t.Fatalf("want 2 connections, got %d", len(cs))
	}
	cs[0].Broker = "MUTATED"
	// b1 (index 0) carries VPN rows in the fixture.
	if len(cs[0].Client.MsgVpns) == 0 {
		t.Fatal("fixture b1 should have VPN rows")
	}
	cs[0].Client.MsgVpns[0].Password = "MUTATED"
	fresh := s.listConnections()
	if fresh[0].Broker == "MUTATED" {
		t.Error("top-level field must be isolated")
	}
	if fresh[0].Client.MsgVpns[0].Password == "MUTATED" {
		t.Error("nested VPN slice must be isolated (deep copy)")
	}
}

func TestStore_UpsertUser_PersistErrorLeavesMemoryUnchanged(t *testing.T) {
	dir := t.TempDir()
	usersPath := filepath.Join(dir, "users.yaml")
	connsPath := filepath.Join(dir, "conns.yaml")
	writeFile(t, usersPath, usersYAML)
	writeFile(t, connsPath, connsYAML)
	s, err := loadStore(usersPath, connsPath, filepath.Join(dir, "s.seed"), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	// Point the users file under a regular file so the atomic write's MkdirAll
	// fails — exercising persist-then-commit (memory must not change).
	blocker := filepath.Join(dir, "blocker")
	writeFile(t, blocker, "x")
	s.usersPath = filepath.Join(blocker, "users.yaml")
	before := len(s.listUsers())
	if err := s.upsertUser(userRec{Username: "bob", Password: "S1:b"}); err == nil {
		t.Fatal("expected a persist error")
	}
	if len(s.listUsers()) != before {
		t.Error("a failed write must leave the in-memory users unchanged")
	}
}

func TestStore_CRUD_RaceSafe(t *testing.T) {
	s := newStoreWithFixtures(t)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			s.getConnections("admin", "tok-admin")
			s.listUsers()
			s.authAdmin("admin", "tok-admin")
			_ = s.upsertUser(userRec{Username: fmt.Sprintf("u%d", n), Password: "S1:x"})
			s.listConnections()
		}(i)
	}
	wg.Wait()
}
