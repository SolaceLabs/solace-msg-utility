package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"sync"
	"testing"
)

// quietLogger is defined in tls_test.go and newCapturingLogger in
// proxy_test.go (same package), both reused here.

// Fixture passwords for the admin and viewer users. Hashed at test time with a
// one-iteration hasher, so the store holds real hashes without the real cost.
const (
	adminPW  = "admin-password-1"
	viewerPW = "viewer-password-1"
)

// The fixture files stand at seq 2: the first record at rev 1, the second at
// rev 2 (so a rev and the seq differ, as in a store that has seen a change).
const usersYAMLTemplate = `seq: 2
msg-utility-users:
  - username: admin
    rev: 1
    password: %s
    admin: true
    operate:
      - brokers: '*'
        msgVpns: '*'
        queues: '*'
  - username: viewer
    rev: 2
    password: %s
    admin: false
    read-only:
      - brokers: b1
        msgVpns: v1
        queues: '*'
    modules: [queue-browser]
`

const connsYAML = `seq: 2
msg-utility-connections:
  - broker: b1
    rev: 1
    hostname: host1
    semp:
      port: 1943
      username: mon
      password: semp-b1-pw
    client:
      port: 1443
      msgVpns:
        - name: v1
          username: u1
          password: cli-b1v1-pw
        - name: v2
          username: u2
          password: cli-b1v2-pw
  - broker: b2
    rev: 2
    hostname: host2
    semp:
      port: 1943
      username: mon
      password: semp-b2-pw
    client:
      port: 1443
      msgVpns:
        - name: v9
          username: u9
          password: cli-b2v9-pw
`

func testHasher(t *testing.T) *hasher {
	t.Helper()
	h, err := newHasher(1, 2)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func mustHash(t *testing.T, h *hasher, pw string) string {
	t.Helper()
	s, err := h.hash(context.Background(), pw)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func noEnv(string) string { return "" }

func envOf(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// testStoreKeyHex is the fixture store key, as the key file holds it.
const testStoreKeyHex = "00112233445566778899aabbccddeeff102132435465768798a9bacbdcedfe0f"

// storeFixture is a temp dir holding the store key and the users (admin +
// viewer) and connections (brokers b1, b2) fixtures, sealed as the gateway
// writes them.
type storeFixture struct {
	usersPath, connsPath, keyPath string
	h                             *hasher
}

func newStoreFixture(t *testing.T) storeFixture {
	t.Helper()
	f := bootstrapFixture(t)
	if err := os.WriteFile(f.keyPath, []byte(testStoreKeyHex+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, adminPW), mustHash(t, f.h, viewerPW)))
	f.writeConns(t, connsYAML)
	return f
}

func (f storeFixture) opts(getenv func(string) string) storeOptions {
	return storeOptions{usersPath: f.usersPath, connsPath: f.connsPath, keyPath: f.keyPath, hasher: f.h, getenv: getenv}
}

// sealer opens and seals with the key in the fixture's key file, whether the
// fixture wrote it or the gateway generated it.
func (f storeFixture) sealer(t *testing.T) *sealer {
	t.Helper()
	data, err := os.ReadFile(f.keyPath)
	if err != nil {
		t.Fatal(err)
	}
	key, err := parseStoreKey(data)
	if err != nil {
		t.Fatal(err)
	}
	sl, err := newSealer(key)
	if err != nil {
		t.Fatal(err)
	}
	return sl
}

// writeUsers and writeConns seal YAML text into the store files.
func (f storeFixture) writeUsers(t *testing.T, doc string) {
	t.Helper()
	writeFile(t, f.usersPath, string(f.sealer(t).seal(roleUsers, []byte(doc))))
}

func (f storeFixture) writeConns(t *testing.T, doc string) {
	t.Helper()
	writeFile(t, f.connsPath, string(f.sealer(t).seal(roleConns, []byte(doc))))
}

// readUsers returns the users file decrypted.
func (f storeFixture) readUsers(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(f.usersPath)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := f.sealer(t).open(roleUsers, data)
	if err != nil {
		t.Fatal(err)
	}
	return string(plain)
}

func (f storeFixture) load(t *testing.T) *store {
	t.Helper()
	s, err := loadStore(f.opts(noEnv), quietLogger())
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	return s
}

func newStoreWithFixtures(t *testing.T) *store {
	t.Helper()
	return newStoreFixture(t).load(t)
}

// signsIn reports whether the store accepts user/pw.
func signsIn(t *testing.T, s *store, user, pw string) bool {
	t.Helper()
	_, ok, err := s.checkPassword(context.Background(), user, pw)
	if err != nil {
		t.Fatal(err)
	}
	return ok
}

// seedUsersDoc and seedConnsDoc wrap records in a document as the gateway
// stamps a seed: seq 1 and every record at rev 1. For a fixture that marshals
// its own store files (the contract test).
func seedUsersDoc(users []userRec) usersDoc {
	users = slices.Clone(users)
	for i := range users {
		users[i].Rev = 1
	}
	return usersDoc{Seq: 1, Users: users}
}

func seedConnsDoc(conns []connRec) connsDoc {
	conns = slices.Clone(conns)
	for i := range conns {
		conns[i].Rev = 1
	}
	return connsDoc{Seq: 1, Connections: conns}
}

// currentUser and currentConn are the stored record (a copy), fatal when it
// is absent.
func currentUser(t *testing.T, s *store, name string) userRec {
	t.Helper()
	i := slices.IndexFunc(s.listUsers(), func(u userRec) bool { return u.Username == name })
	if i < 0 {
		t.Fatalf("no user %q", name)
	}
	return s.listUsers()[i]
}

func currentConn(t *testing.T, s *store, broker string) connRec {
	t.Helper()
	i := slices.IndexFunc(s.listConnections(), func(c connRec) bool { return c.Broker == broker })
	if i < 0 {
		t.Fatalf("no connection %q", broker)
	}
	return s.listConnections()[i]
}

// putUser is the unconditional edit a fixture makes: it saves u at the rev the
// store holds now (0 for a new name), with no caller, and fails the test on
// any refusal. For the refusals themselves, call saveUser.
func putUser(t *testing.T, s *store, u userRec, password string) savedUser {
	t.Helper()
	rev := 0
	if i := slices.IndexFunc(s.listUsers(), func(r userRec) bool { return r.Username == u.Username }); i >= 0 {
		rev = s.listUsers()[i].Rev
	}
	out, err := s.saveUser(context.Background(), "", u, password, rev)
	if err != nil {
		t.Fatalf("putUser %q: %v", u.Username, err)
	}
	return out
}

// putConn is putUser for a connection.
func putConn(t *testing.T, s *store, c connRec) savedConn {
	t.Helper()
	rev := 0
	if i := slices.IndexFunc(s.listConnections(), func(r connRec) bool { return r.Broker == c.Broker }); i >= 0 {
		rev = s.listConnections()[i].Rev
	}
	out, err := s.saveConnection(context.Background(), "", c, rev)
	if err != nil {
		t.Fatalf("putConn %q: %v", c.Broker, err)
	}
	return out
}

// readDocs decrypts both store files into their documents.
func (f storeFixture) readDocs(t *testing.T) (usersDoc, connsDoc) {
	t.Helper()
	var u usersDoc
	var c connsDoc
	if err := f.sealer(t).readDoc(roleUsers, f.usersPath, &u); err != nil {
		t.Fatal(err)
	}
	if err := f.sealer(t).readDoc(roleConns, f.connsPath, &c); err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatal(err)
	}
	return u, c
}

// ----- bootstrap ------------------------------------------------------------------

// bootstrapFixture is an empty temp dir: no users file yet.
func bootstrapFixture(t *testing.T) storeFixture {
	t.Helper()
	dir := t.TempDir()
	return storeFixture{
		usersPath: filepath.Join(dir, "users.yaml"),
		connsPath: filepath.Join(dir, "conns.yaml"),
		keyPath:   filepath.Join(dir, "store.key"),
		h:         testHasher(t),
	}
}

func TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(t *testing.T) {
	f := bootstrapFixture(t)
	var buf strings.Builder
	s, err := loadStore(f.opts(noEnv), newCapturingLogger(&buf))
	if err != nil {
		t.Fatalf("loadStore: %v", err)
	}
	m := regexp.MustCompile(`password=(\S+)`).FindStringSubmatch(buf.String())
	if m == nil {
		t.Fatalf("the generated password must be logged: %s", buf.String())
	}
	pw := m[1]
	mustChange, ok, err := s.checkPassword(context.Background(), "admin", pw)
	if err != nil || !ok || !mustChange {
		t.Fatalf("bootstrap admin must sign in with the logged password and must change it: ok=%v mustChange=%v err=%v", ok, mustChange, err)
	}
	if admin, _ := s.isAdmin("admin"); !admin {
		t.Error("bootstrap user must be admin")
	}
	if doc, _ := f.readDocs(t); doc.Seq != 1 || len(doc.Users) != 1 || doc.Users[0].Rev != 1 || s.usersSeq != 1 {
		t.Errorf("the bootstrap writes seq 1 and rev 1: file %+v, memory seq %d", doc.Seq, s.usersSeq)
	}
	data := f.readUsers(t)
	if strings.Contains(data, pw) || !strings.Contains(data, "mustChangePassword: true") {
		t.Errorf("users file must hold a hash and the change flag, never the password:\n%s", data)
	}
	if info, _ := os.Stat(f.usersPath); runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Errorf("users file must be owner-only, got %v", info.Mode().Perm())
	}

	buf.Reset()
	if _, err := loadStore(f.opts(noEnv), newCapturingLogger(&buf)); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(buf.String(), "bootstrap admin created") {
		t.Error("the password is shown once: a second start must not bootstrap again")
	}
}

func TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(t *testing.T) {
	const pw = "operator-chosen-pw"
	secretFile := filepath.Join(t.TempDir(), "admin.pw")
	writeFile(t, secretFile, pw+"\r\n") // a trailing newline from `echo` is not part of it
	for _, env := range []map[string]string{
		{envAdminPassword: pw},
		{envAdminPasswordFile: secretFile},
	} {
		f := bootstrapFixture(t)
		var buf strings.Builder
		s, err := loadStore(f.opts(envOf(env)), newCapturingLogger(&buf))
		if err != nil {
			t.Fatalf("%v: %v", env, err)
		}
		if strings.Contains(buf.String(), pw) {
			t.Errorf("%v: a supplied password must never be logged: %s", env, buf.String())
		}
		for name := range env {
			if !strings.Contains(buf.String(), "source="+name) {
				t.Errorf("log must name the source %s: %s", name, buf.String())
			}
		}
		mustChange, ok, _ := s.checkPassword(context.Background(), "admin", pw)
		if !ok || !mustChange {
			t.Errorf("%v: admin must sign in with the supplied password and still change it (ok=%v mustChange=%v)", env, ok, mustChange)
		}
	}
}

// A supplied password outside the policy (too short or too long, from either
// variable) does not stop the start: it is set aside with a warning that names
// the variable and the rule, never the value, and the admin gets a generated
// password, logged once, that must be changed at first sign-in.
func TestLoadStore_BootstrapPasswordOutsideThePolicyIsReplacedByAGeneratedOne(t *testing.T) {
	short, long := "tiny-pw", strings.Repeat("x", passwordMaxLen+1)
	for _, tc := range []struct {
		name, env, value string
	}{
		{"too short", envAdminPassword, short},
		{"too long", envAdminPassword, long},
		{"file too short", envAdminPasswordFile, short},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := bootstrapFixture(t)
			val := tc.value
			if tc.env == envAdminPasswordFile {
				val = filepath.Join(t.TempDir(), "admin.pw")
				writeFile(t, val, tc.value+"\n")
			}
			var buf strings.Builder
			s, err := loadStore(f.opts(envOf(map[string]string{tc.env: val})), newCapturingLogger(&buf))
			if err != nil {
				t.Fatalf("a password outside the policy must not stop the start: %v", err)
			}
			out := buf.String()
			if strings.Contains(out, tc.value) {
				t.Errorf("the rejected value must never be logged: %s", out)
			}
			if !strings.Contains(out, "bootstrap password variable ignored") || !strings.Contains(out, "env="+tc.env) ||
				!strings.Contains(out, "password must be 12 to 128 characters") {
				t.Errorf("the warning must name the variable and the rule: %s", out)
			}
			if _, ok, _ := s.checkPassword(context.Background(), "admin", tc.value); ok {
				t.Error("the rejected password must not sign in")
			}
			m := regexp.MustCompile(`password=(\S+)`).FindStringSubmatch(out)
			if m == nil {
				t.Fatalf("the generated password must be logged once: %s", out)
			}
			mustChange, ok, err := s.checkPassword(context.Background(), "admin", m[1])
			if err != nil || !ok || !mustChange {
				t.Fatalf("admin must sign in with the generated password and must change it: ok=%v mustChange=%v err=%v", ok, mustChange, err)
			}
		})
	}
}

func TestLoadStore_BootstrapRefusesBadSources(t *testing.T) {
	cases := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"both set", map[string]string{envAdminPassword: "long-enough-pw", envAdminPasswordFile: "/x"}, "not both"},
		{"file unreadable", map[string]string{envAdminPasswordFile: "/nonexistent/admin.pw"}, `SMU_ADMIN_PASSWORD_FILE="/nonexistent/admin.pw" cannot be read`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := bootstrapFixture(t)
			_, err := loadStore(f.opts(envOf(tc.env)), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), f.usersPath) {
				t.Fatalf("want an error naming the users file and %q, got %v", tc.want, err)
			}
			if strings.Contains(err.Error(), "long-enough-pw") {
				t.Errorf("the error must not echo the value: %v", err)
			}
			if _, statErr := os.Stat(f.usersPath); statErr == nil {
				t.Error("a refused bootstrap must not write the users file")
			}
		})
	}
}

// A store dir the gateway cannot write (a read-only /data, with the key from a
// secret elsewhere) stops the load, and no password is shown for an admin that
// was never saved.
func TestLoadStore_BootstrapThatCannotBeSavedStopsTheLoad(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("directory permissions do not bind on Windows or as root")
	}
	f := bootstrapFixture(t)
	f.keyPath = filepath.Join(t.TempDir(), "store.key")
	if err := os.WriteFile(f.keyPath, []byte(testStoreKeyHex+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Dir(f.usersPath)
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}

	var buf strings.Builder
	_, err := loadStore(f.opts(noEnv), newCapturingLogger(&buf))
	if err == nil || !strings.Contains(err.Error(), "bootstrap users file") || !strings.Contains(err.Error(), f.usersPath) {
		t.Fatalf("want the bootstrap refused, naming %s, got %v", f.usersPath, err)
	}
	if strings.Contains(buf.String(), "password=") || strings.Contains(buf.String(), "bootstrap admin created") {
		t.Errorf("an admin that was never saved must not be announced: %s", buf.String())
	}
	if _, err := os.Stat(f.usersPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("no users file may be left behind: %v", err)
	}
}

func TestLoadStore_ExistingUsersFileIgnoresBootstrapVariables(t *testing.T) {
	f := newStoreFixture(t)
	var buf strings.Builder
	env := envOf(map[string]string{envAdminPassword: "x", envAdminPasswordFile: "/nowhere"})
	if _, err := loadStore(f.opts(env), newCapturingLogger(&buf)); err != nil {
		t.Fatalf("an invalid bootstrap variable must not matter once the users file exists: %v", err)
	}
	for _, name := range []string{envAdminPassword, envAdminPasswordFile} {
		if !strings.Contains(buf.String(), "env="+name) {
			t.Errorf("want a warn naming %s: %s", name, buf.String())
		}
	}
}

// ----- strict load ------------------------------------------------------------------

func TestLoadStore_RejectsInvalidUsersFile(t *testing.T) {
	h := testHasher(t)
	good := mustHash(t, h, adminPW)
	user := func(name, pw string, admin bool) string {
		return fmt.Sprintf("  - username: %s\n    password: %s\n    admin: %v\n", name, pw, admin)
	}
	cases := []struct{ name, doc, want string }{
		{"malformed", "msg-utility-users:\n  - [unclosed", "read users file"},
		{"unknown key", "msg-utility-users:\n" + user("admin", good, true) + "    role: x\n", "field role not found"},
		{"older token", "msg-utility-users:\n" + user("admin", "S1:K160PHJHFKEGE8N50K9CRQZRF0", true), "password token from an older build; delete the users file"},
		{"not a hash", "msg-utility-users:\n" + user("admin", "plaintext", true), `user "admin": password is not a pbkdf2-sha256 password hash`},
		{"bad username", "msg-utility-users:\n" + user("'a b'", good, true), `username "a b" must be 1 to 64`},
		{"dots only username", "msg-utility-users:\n" + user("'..'", good, true), `username ".." must be 1 to 64 characters from A-Z a-z 0-9 . _ @ -, not only dots`},
		{"duplicate", "msg-utility-users:\n" + user("admin", good, true) + user("admin", good, false), `user "admin" appears more than once`},
		{"no admin", "msg-utility-users:\n" + user("viewer", good, false), "at least one administrator"},
		{"unknown module", "msg-utility-users:\n" + user("admin", good, true) + "    modules: [queue-discovery]\n", `user "admin": key "modules[0]" has invalid value "queue-discovery"`},
		{"empty", "", "at least one administrator"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			f.writeUsers(t, tc.doc)
			_, err := loadStore(f.opts(noEnv), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), f.usersPath) {
				t.Fatalf("want an error naming the file and %q, got %v", tc.want, err)
			}
		})
	}
}

func TestLoadStore_RejectsInvalidConnectionsFile(t *testing.T) {
	conn := func(broker, extra string) string {
		return "  - broker: " + broker + "\n    hostname: h\n" + extra
	}
	vpns := func(names ...string) string {
		out := "    client:\n      msgVpns:\n"
		for _, n := range names {
			out += "        - name: '" + n + "'\n"
		}
		return out
	}
	cases := []struct{ name, doc, want string }{
		{"malformed", "msg-utility-connections: [", "read connections file"},
		{"unknown key", "msg-utility-connections:\n" + conn("b1", "    vpn: x\n"), "field vpn not found"},
		{"bad broker", "msg-utility-connections:\n" + conn("'b 1'", ""), `broker "b 1" must be 1 to 64`},
		{"dots only broker", "msg-utility-connections:\n" + conn("'.'", ""), `broker "." must be 1 to 64 characters from A-Z a-z 0-9 . _ -, not only dots`},
		{"duplicate broker", "msg-utility-connections:\n" + conn("b1", "") + conn("b1", ""), `broker "b1" appears more than once`},
		{"semp port", "msg-utility-connections:\n" + conn("b1", "    semp:\n      port: 99999\n"), `semp.port "99999" is not a port`},
		{"client port", "msg-utility-connections:\n" + conn("b1", "    client:\n      port: tcp\n"), `client.port "tcp" is not a port`},
		{"signed port", "msg-utility-connections:\n" + conn("b1", "    semp:\n      port: '+8080'\n"), `semp.port "+8080" is not a port`},
		{"vpn without name", "msg-utility-connections:\n" + conn("b1", vpns("")), "a message VPN has no name"},
		{"duplicate vpn", "msg-utility-connections:\n" + conn("b1", vpns("v1", "v1")), `message VPN "v1" appears more than once`},
		{"bad hostname", "msg-utility-connections:\n  - broker: b1\n    hostname: 'https://h'\n", `hostname "https://h" must be a host name`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			f.writeConns(t, tc.doc)
			_, err := loadStore(f.opts(noEnv), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), f.connsPath) {
				t.Fatalf("want an error naming the file and %q, got %v", tc.want, err)
			}
		})
	}
}

func TestLoadStore_EmptyOrMissingConnectionsFileYieldsNoBrokers(t *testing.T) {
	for _, content := range []string{"", "-"} {
		f := newStoreFixture(t)
		if content == "-" {
			_ = os.Remove(f.connsPath)
		} else {
			f.writeConns(t, content)
		}
		s := f.load(t)
		prof, _ := s.profile("admin", defaultConfig().modules)
		if len(prof.Brokers) != 0 {
			t.Errorf("content %q: want no brokers, got %d", content, len(prof.Brokers))
		}
	}
}

// ----- encrypted store files ---------------------------------------------------------

func TestStore_FilesOnDiskAreEncrypted(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	putUser(t, s, userRec{Username: "bob", Operate: []permRow{}, ReadOnly: []permRow{}}, "bob-password-1")
	putConn(t, s, connRec{Broker: "b3", Hostname: "host3", Semp: sempRec{Port: "1943", Username: "mon3", Password: "semp-secret-3"}})
	for _, path := range []string{f.usersPath, f.connsPath} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(string(raw), storeMagic) {
			t.Errorf("%s: want the store header, got %q", filepath.Base(path), raw[:min(len(raw), 8)])
		}
		for _, plain := range []string{"username", "admin", "mon3", "semp-secret-3", "host3", "cli-b1v1-pw"} {
			if strings.Contains(string(raw), plain) {
				t.Errorf("%s holds %q in the clear", filepath.Base(path), plain)
			}
		}
		if info, _ := os.Stat(path); runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
			t.Errorf("%s must be owner-only, got %v", filepath.Base(path), info.Mode().Perm())
		}
	}
	// A fresh load with the same key reads both writes.
	s2 := f.load(t)
	if !signsIn(t, s2, "bob", "bob-password-1") || len(s2.listConnections()) != 3 {
		t.Error("the sealed writes must load again with the same key")
	}
}

func TestLoadStore_RefusesStoresItCannotOpen(t *testing.T) {
	cases := []struct {
		name    string
		prepare func(t *testing.T, f storeFixture)
		path    func(f storeFixture) string
		want    string
	}{
		{"plaintext users file", func(t *testing.T, f storeFixture) {
			writeFile(t, f.usersPath, "msg-utility-users: []\n")
		}, func(f storeFixture) string { return f.usersPath }, "plaintext store from an earlier build"},
		{"plaintext connections file", func(t *testing.T, f storeFixture) {
			writeFile(t, f.connsPath, connsYAML)
		}, func(f storeFixture) string { return f.connsPath }, "plaintext store from an earlier build"},
		{"empty users file", func(t *testing.T, f storeFixture) {
			writeFile(t, f.usersPath, "")
		}, func(f storeFixture) string { return f.usersPath }, "is empty (damaged)"},
		{"another key", func(t *testing.T, f storeFixture) {
			writeFile(t, f.keyPath, strings.Repeat("ab", storeKeyBytes))
		}, func(f storeFixture) string { return f.usersPath }, "wrong store key file, or the file is damaged"},
		{"files swapped", func(t *testing.T, f storeFixture) {
			users, _ := os.ReadFile(f.usersPath)
			writeFile(t, f.connsPath, string(users))
		}, func(f storeFixture) string { return f.connsPath }, "holds the users store, not the connections store"},
		{"the backup schedule in the users file's place", func(t *testing.T, f storeFixture) {
			if err := f.sealer(t).writeDoc(roleSchedule, f.usersPath, scheduleDoc{}); err != nil {
				t.Fatal(err)
			}
		}, func(f storeFixture) string { return f.usersPath }, "holds the backup schedule store, not the users store"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			tc.prepare(t, f)
			_, err := loadStore(f.opts(noEnv), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), tc.path(f)) {
				t.Fatalf("want an error naming %s and %q, got %v", tc.path(f), tc.want, err)
			}
		})
	}
}

func TestLoadStore_KeyProblemsStopTheLoad(t *testing.T) {
	f := newStoreFixture(t)
	_ = os.Remove(f.keyPath)
	if _, err := loadStore(f.opts(noEnv), quietLogger()); err == nil || !strings.Contains(err.Error(), "is missing but") {
		t.Fatalf("a missing key beside the stores must refuse, got %v", err)
	}
	if _, err := os.Stat(f.keyPath); err == nil {
		t.Error("a refused start must not create a key")
	}
}

func TestValidateConn_HostPortsAndCredentials(t *testing.T) {
	base := func() connRec {
		return connRec{
			Broker: "b1", Hostname: "broker-1.example.com",
			Semp:   sempRec{Port: "1943", Username: "mon", Password: "semp-pw"},
			Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1", Password: "vpn-pw"}}},
		}
	}
	for _, host := range []string{"h", "10.0.0.1", "::1", "2001:db8::5", "my_host.local"} {
		c := base()
		c.Hostname = host
		if err := validateConn(c); err != nil {
			t.Errorf("hostname %q must be accepted: %v", host, err)
		}
	}
	cases := []struct {
		name   string
		mutate func(*connRec)
		want   string
	}{
		{"no hostname", func(c *connRec) { c.Hostname = "" }, `hostname "" must be a host name`},
		{"scheme", func(c *connRec) { c.Hostname = "https://h" }, "must be a host name"},
		{"port in host", func(c *connRec) { c.Hostname = "h:1943" }, "must be a host name"},
		{"path", func(c *connRec) { c.Hostname = "h/x" }, "must be a host name"},
		{"user info", func(c *connRec) { c.Hostname = "u@h" }, "must be a host name"},
		{"space", func(c *connRec) { c.Hostname = "h x" }, "must be a host name"},
		{"bracketed v6", func(c *connRec) { c.Hostname = "[::1]" }, "must be a host name"},
		{"semp port missing", func(c *connRec) { c.Semp.Port = "" }, "semp.port is required when a SEMP username is set"},
		{"client port missing", func(c *connRec) { c.Client.Port = "" }, "client.port is required when message VPNs are listed"},
		{"colon in semp user", func(c *connRec) { c.Semp.Username = "a:b" }, "the username no ':'"},
		{"control in semp password", func(c *connRec) { c.Semp.Password = "semp\npw" }, "must not contain control characters"},
		{"control in vpn password", func(c *connRec) { c.Client.MsgVpns[0].Password = "vpn\x7fpw" }, `message VPN "v1": the name, username and password`},
		{"control in vpn user", func(c *connRec) { c.Client.MsgVpns[0].Username = "u\t1" }, "must not contain control characters"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := base()
			tc.mutate(&c)
			err := validateConn(c)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, err)
			}
			if strings.Contains(err.Error(), "pw") {
				t.Errorf("the error must not echo a password: %v", err)
			}
		})
	}
	// Ports stay optional where nothing uses them.
	c := base()
	c.Semp = sempRec{}
	c.Client = clientRec{}
	if err := validateConn(c); err != nil {
		t.Errorf("a connection with no SEMP user and no VPNs needs no ports: %v", err)
	}
}

// ----- queries ------------------------------------------------------------------------

func TestStore_ProfileAndEntitlement(t *testing.T) {
	s := newStoreWithFixtures(t)
	if _, ok := s.profile("ghost", defaultConfig().modules); ok {
		t.Error("unknown user has no profile")
	}
	prof, ok := s.profile("admin", defaultConfig().modules)
	if !ok || prof.Username != "admin" || !prof.Admin {
		t.Fatalf("admin profile: %+v", prof)
	}
	if len(prof.Brokers) != 2 {
		t.Fatalf("admin should see 2 brokers, got %d", len(prof.Brokers))
	}
	// Names only: no address, port, username or password reaches the browser.
	raw, err := json.Marshal(prof)
	if err != nil {
		t.Fatal(err)
	}
	for _, leak := range []string{`"pass"`, `"user"`, `"hostname"`, `"port"`, `"semp"`, `"client"`, `"siteSeed"`, "host1", "1443", "1943", "-pw"} {
		if strings.Contains(string(raw), leak) {
			t.Errorf("the profile holds %s: %s", leak, raw)
		}
	}
	if tg, ok := s.smfTarget("admin", "b1", "v1"); !ok || tg.port != "1443" || tg.pass != "cli-b1v1-pw" {
		t.Errorf("an unquoted YAML port must become a string, the password opaque: %+v", tg)
	}

	vp, _ := s.profile("viewer", defaultConfig().modules)
	if vp.Admin || len(vp.Brokers) != 1 || vp.Brokers[0].Broker != "b1" {
		t.Fatalf("viewer should see only b1, got %+v", vp.Brokers)
	}
	if len(vp.Brokers[0].MsgVpns) != 1 || vp.Brokers[0].MsgVpns[0].Name != "v1" {
		t.Error("viewer should see only v1 on b1")
	}
	// Modules: admin has no list of their own (the default: every offered
	// module), viewer has one.
	if !reflect.DeepEqual(prof.Modules, []string{"queue-browser", "queue-copy", "queue-subscription-explorer"}) || !reflect.DeepEqual(vp.Modules, []string{"queue-browser"}) {
		t.Errorf("modules: admin %v, viewer %v", prof.Modules, vp.Modules)
	}
	narrow := moduleSettings{offered: []string{"queue-copy"}, userDefault: modulesDefaultAll}
	if vp, _ := s.profile("viewer", narrow); len(vp.Modules) != 0 {
		t.Errorf("a module the deployment no longer offers must drop out, got %v", vp.Modules)
	}
}

func TestStore_CheckPassword(t *testing.T) {
	s := newStoreWithFixtures(t)
	if !signsIn(t, s, "admin", adminPW) {
		t.Error("correct password must sign in")
	}
	if signsIn(t, s, "admin", viewerPW) {
		t.Error("another user's password must not sign in")
	}
	if signsIn(t, s, "ghost", adminPW) {
		t.Error("unknown user must not sign in")
	}
	// Both hashing slots busy and the request gone: the check gives up with
	// the context error instead of waiting.
	s.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1), dummy: s.hasher.dummy}
	s.hasher.slots <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, ok, err := s.checkPassword(ctx, "admin", adminPW); ok || !errors.Is(err, context.Canceled) {
		t.Errorf("want context.Canceled, got ok=%v err=%v", ok, err)
	}
}

func TestStore_IsAdmin(t *testing.T) {
	s := newStoreWithFixtures(t)
	cases := []struct {
		user          string
		admin, exists bool
	}{{"admin", true, true}, {"viewer", false, true}, {"ghost", false, false}}
	for _, tc := range cases {
		if admin, exists := s.isAdmin(tc.user); admin != tc.admin || exists != tc.exists {
			t.Errorf("%s: got admin=%v exists=%v", tc.user, admin, exists)
		}
	}
}

// ----- user CRUD ------------------------------------------------------------------------

func TestStore_SaveUser_CreateStampsRevAndPersists(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	onChange := 0
	s.onChange = func() { onChange++ }
	got, err := s.saveUser(context.Background(), "admin", userRec{
		Username: "bob", Admin: true,
		Operate: []permRow{{Brokers: "*", MsgVpns: "*", Queues: "*"}},
		Modules: &[]string{},
	}, "bob-password-1", 0)
	if err != nil || got.dropSessions || got.rev != 3 || got.seq != 3 {
		t.Fatalf("create: %+v err=%v (the file stood at seq 2: rev and seq are both 3, no session to end)", got, err)
	}
	if onChange != 1 {
		t.Errorf("onChange ran %d times, want once", onChange)
	}
	if strings.Contains(f.readUsers(t), "bob-password-1") {
		t.Error("the plaintext password must never reach the file")
	}
	doc, _ := f.readDocs(t)
	if doc.Seq != 3 || doc.Users[0].Rev != 1 || doc.Users[1].Rev != 2 || doc.Users[2].Rev != 3 {
		t.Errorf("the file holds seq 3 and revs 1, 2, 3 (the others untouched), got seq %d and %+v", doc.Seq, doc.Users)
	}
	s2 := f.load(t)
	if !signsIn(t, s2, "bob", "bob-password-1") {
		t.Error("bob should sign in after a fresh load (persistence)")
	}
	// An empty module list (none) survives the file; no list stays absent.
	if bob, _ := s2.findUser("bob"); bob.Modules == nil || len(*bob.Modules) != 0 {
		t.Errorf("bob's empty module list must round-trip as empty, got %v", bob.Modules)
	}
	if admin, _ := s2.findUser("admin"); admin.Modules != nil {
		t.Errorf("admin has no module list and must keep none, got %v", *admin.Modules)
	}
}

// The rev of a record becomes the new seq only when its console view changed;
// seq moves on every commit. A save that changes nothing, or only the
// password, keeps the rev.
func TestStore_SaveUser_RevMovesOnlyWhenTheConsoleViewChanges(t *testing.T) {
	s := newStoreWithFixtures(t)
	steps := []struct {
		name     string
		edit     func(u *userRec)
		password string
		revMoves bool
		drops    bool
	}{
		{"password only", func(*userRec) {}, "viewer-new-pw-1", false, true},
		{"nothing changed", func(*userRec) {}, "", false, false},
		{"a grant row added", func(u *userRec) { u.ReadOnly = append(u.ReadOnly, permRow{Brokers: "b2", MsgVpns: "v9", Queues: "*"}) }, "", true, false},
		{"modules emptied", func(u *userRec) { u.Modules = &[]string{} }, "", true, false},
		{"modules back to the default", func(u *userRec) { u.Modules = nil }, "", true, false},
		{"promoted to admin", func(u *userRec) { u.Admin = true }, "", true, true},
		{"grants as an empty list", func(u *userRec) { u.Operate = []permRow{} }, "", false, false},
	}
	for _, st := range steps {
		before := currentUser(t, s, "viewer")
		_, seq := s.usersNow()
		u := before
		st.edit(&u)
		got, err := s.saveUser(context.Background(), "admin", u, st.password, before.Rev)
		if err != nil {
			t.Fatalf("%s: %v", st.name, err)
		}
		wantRev := before.Rev
		if st.revMoves {
			wantRev = seq + 1
		}
		if got.seq != seq+1 || got.rev != wantRev || got.dropSessions != st.drops {
			t.Errorf("%s: got %+v, want seq %d rev %d drop %v", st.name, got, seq+1, wantRev, st.drops)
		}
		if after := currentUser(t, s, "viewer"); after.Rev != wantRev {
			t.Errorf("%s: stored rev %d, want %d", st.name, after.Rev, wantRev)
		}
	}
}

// A forced-change flag that an admin's new password clears is a change the
// console shows, so the rev moves; a blank password keeps the flag.
func TestStore_SaveUser_AdminResetClearsTheChangeFlagAndMovesRev(t *testing.T) {
	s := newStoreWithFixtures(t)
	s.users[1].MustChangePassword = true
	keep := putUser(t, s, currentUser(t, s, "viewer"), "")
	if keep.rev != 2 || !currentUser(t, s, "viewer").MustChangePassword {
		t.Fatalf("a blank password keeps the flag and the rev: %+v", keep)
	}
	asked := currentUser(t, s, "viewer")
	asked.MustChangePassword = false // the console's form never sends the flag
	reset := putUser(t, s, asked, "reset-by-admin-1")
	if reset.rev != reset.seq || currentUser(t, s, "viewer").MustChangePassword {
		t.Errorf("a new password clears the flag, which moves the rev to the new seq: %+v", reset)
	}
}

// An admin's save with a blank password resolves "keep" against the record as
// it is inside the lock: the hash a user set meanwhile survives.
func TestStore_SaveUser_BlankPasswordKeepsTheHashTheUserSetMeanwhile(t *testing.T) {
	s := newStoreWithFixtures(t)
	opened := currentUser(t, s, "viewer") // the admin opens the form
	check, err := s.verifyPassword(context.Background(), "viewer", viewerPW)
	if err != nil || !check.ok {
		t.Fatalf("verify: %+v %v", check, err)
	}
	if err := s.setPassword(context.Background(), "viewer", "viewer-new-pw-1", check.hash, func() {}); err != nil {
		t.Fatal(err)
	}
	got, err := s.saveUser(context.Background(), "admin", opened, "", opened.Rev)
	if err != nil {
		t.Fatalf("the user's own password change keeps the rev, so the admin's save stands: %v", err)
	}
	if got.rev != opened.Rev || !signsIn(t, s, "viewer", "viewer-new-pw-1") || signsIn(t, s, "viewer", viewerPW) {
		t.Errorf("the admin's blank password must keep the hash the user set: %+v", got)
	}
}

// Every refusal answers with the typed error, in the pinned order, and leaves
// seq, the file and the sockets as they were.
func TestStore_SaveUser_Refusals(t *testing.T) {
	ctx := context.Background()
	var stale *staleError
	cases := []struct {
		name   string
		caller string
		user   userRec
		pw     string
		rev    int
		check  func(t *testing.T, err error)
	}{
		{"a create of an existing name", "admin", userRec{Username: "viewer"}, "viewer-other-pw-1", 0, func(t *testing.T, err error) {
			if !errors.Is(err, errExists) {
				t.Errorf("want errExists, got %v", err)
			}
		}},
		{"exists wins over a blank password", "admin", userRec{Username: "viewer"}, "", 0, func(t *testing.T, err error) {
			if !errors.Is(err, errExists) {
				t.Errorf("want errExists, got %v", err)
			}
		}},
		{"an edit of a user that is gone", "admin", userRec{Username: "ghost"}, "", 1, func(t *testing.T, err error) {
			if !errors.Is(err, errNotFound) {
				t.Errorf("want errNotFound, got %v", err)
			}
		}},
		{"an old rev", "admin", userRec{Username: "viewer"}, "", 1, func(t *testing.T, err error) {
			if !errors.As(err, &stale) || stale.rev != 2 {
				t.Errorf("want a stale error naming rev 2, got %v", err)
			}
		}},
		{"stale wins over the last-admin rule", "admin", userRec{Username: "admin", Admin: false}, "", 9, func(t *testing.T, err error) {
			if !errors.As(err, &stale) || stale.rev != 1 {
				t.Errorf("want a stale error naming rev 1, got %v", err)
			}
		}},
		{"a new user with no password", "admin", userRec{Username: "ghost"}, "", 0, func(t *testing.T, err error) {
			if !errors.Is(err, errBlankNewUserPassword) {
				t.Errorf("want errBlankNewUserPassword, got %v", err)
			}
		}},
		{"demoting the last admin", "admin", userRec{Username: "admin", Admin: false}, "", 1, func(t *testing.T, err error) {
			if !errors.Is(err, errLastAdmin) {
				t.Errorf("want errLastAdmin, got %v", err)
			}
		}},
		{"a negative rev", "admin", userRec{Username: "viewer"}, "", -1, func(t *testing.T, err error) {
			if !errors.Is(err, errRevRequired) {
				t.Errorf("want errRevRequired, got %v", err)
			}
		}},
		{"a caller who lost the admin flag", "viewer", userRec{Username: "viewer"}, "", 2, func(t *testing.T, err error) {
			if !errors.Is(err, errCallerNotAdmin) {
				t.Errorf("want errCallerNotAdmin, got %v", err)
			}
		}},
		{"a caller who was deleted", "ghost", userRec{Username: "viewer"}, "", 2, func(t *testing.T, err error) {
			if !errors.Is(err, errCallerGone) {
				t.Errorf("want errCallerGone, got %v", err)
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			s := f.load(t)
			onChange := 0
			s.onChange = func() { onChange++ }
			before, _ := os.ReadFile(f.usersPath)
			got, err := s.saveUser(ctx, tc.caller, tc.user, tc.pw, tc.rev)
			tc.check(t, err)
			if got != (savedUser{}) {
				t.Errorf("a refusal returns no result, got %+v", got)
			}
			if seq, _ := s.seqs(); seq != 2 || onChange != 0 {
				t.Errorf("a refusal moves nothing: seq %d, onChange %d", seq, onChange)
			}
			if now, _ := os.ReadFile(f.usersPath); !bytes.Equal(now, before) {
				t.Error("a refusal must not rewrite the file")
			}
			if len(s.listUsers()) != 2 || !signsIn(t, s, "viewer", viewerPW) {
				t.Error("a refusal must leave the users as they were")
			}
		})
	}
	t.Run("a hash that cannot run", func(t *testing.T) {
		s := newStoreWithFixtures(t)
		cctx, cancel := context.WithCancel(ctx)
		cancel()
		s.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
		s.hasher.slots <- struct{}{}
		if _, err := s.saveUser(cctx, "admin", userRec{Username: "carol"}, "carol-password", 0); !errors.Is(err, context.Canceled) {
			t.Errorf("want context.Canceled, got %v", err)
		}
		if seq, _ := s.seqs(); seq != 2 || len(s.listUsers()) != 2 {
			t.Error("a failed hash must not persist")
		}
	})
	t.Run("a client that left", func(t *testing.T) {
		s := newStoreWithFixtures(t)
		cctx, cancel := context.WithCancel(ctx)
		cancel()
		var gone *clientGoneError
		if _, err := s.saveUser(cctx, "admin", currentUser(t, s, "viewer"), "", 2); !errors.As(err, &gone) {
			t.Errorf("want *clientGoneError, got %v", err)
		}
		if seq, _ := s.seqs(); seq != 2 {
			t.Error("nothing may change for a client that is gone")
		}
	})
}

// blockWrites points path under a regular file so the commit cannot put the
// file there: the write fails, exercising publish-after-commit.
func blockWrites(t *testing.T, path *string) {
	t.Helper()
	blocker := filepath.Join(t.TempDir(), "blocker")
	writeFile(t, blocker, "x")
	*path = filepath.Join(blocker, "file.yaml")
}

// A write that fails leaves memory and seq as they were, for every kind of
// user change, and says store_write_failed.
func TestStore_PersistErrorLeavesMemoryUnchanged(t *testing.T) {
	s := newStoreWithFixtures(t)
	onChange := 0
	s.onChange = func() { onChange++ }
	blockWrites(t, &s.usersPath)
	var failed *writeFailedError
	ctx := context.Background()
	if _, err := s.saveUser(ctx, "admin", userRec{Username: "bob"}, "bob-password-1", 0); !errors.As(err, &failed) {
		t.Errorf("save: want *writeFailedError, got %v", err)
	}
	if err := s.setPassword(ctx, "viewer", "viewer-new-pw-1", storedHash(s, "viewer"), func() { t.Error("committed must not run") }); !errors.As(err, &failed) {
		t.Errorf("own password: want *writeFailedError, got %v", err)
	}
	if _, err := s.deleteUser(ctx, "admin", "viewer", 2); !errors.As(err, &failed) {
		t.Errorf("delete: want *writeFailedError, got %v", err)
	}
	if seq, _ := s.seqs(); seq != 2 || len(s.listUsers()) != 2 || !signsIn(t, s, "viewer", viewerPW) || onChange != 0 {
		t.Errorf("a failed write must leave the in-memory users, seq and sockets alone (seq %d, onChange %d)", seq, onChange)
	}
}

// onChange runs after each committed edit that can change entitlement, under
// the writer lock but outside the store's (it reads the store here, which would
// deadlock inside), once the new state is published, and not after a refused
// or failed one.
func TestStore_OnChangeFiresAfterACommittedEdit(t *testing.T) {
	s := newStoreWithFixtures(t)
	n := 0
	s.onChange = func() {
		n++
		_ = s.listConnections()
		if n == 1 && len(s.listUsers()) != 3 {
			t.Errorf("onChange must see the committed state, saw %d users", len(s.listUsers()))
		}
	}
	ctx := context.Background()
	for i, edit := range []func() error{
		func() error { _, err := s.saveUser(ctx, "", userRec{Username: "bob"}, "bob-password-1", 0); return err },
		func() error { _, err := s.deleteUser(ctx, "", "bob", currentUser(t, s, "bob").Rev); return err },
		func() error {
			_, err := s.saveConnection(ctx, "", connRec{Broker: "b3", Hostname: "host3"}, 0)
			return err
		},
		func() error { _, err := s.deleteConnection(ctx, "", "b3", currentConn(t, s, "b3").Rev); return err },
	} {
		if err := edit(); err != nil {
			t.Fatal(err)
		}
		if n != i+1 {
			t.Fatalf("edit %d: onChange ran %d times", i, n)
		}
	}
	if _, err := s.deleteUser(ctx, "", "admin", 1); !errors.Is(err, errLastAdmin) {
		t.Fatalf("want errLastAdmin, got %v", err)
	}
	blockWrites(t, &s.connsPath)
	if _, err := s.saveConnection(ctx, "", connRec{Broker: "b3", Hostname: "host3"}, 0); err == nil {
		t.Fatal("expected a persist error")
	}
	if n != 4 {
		t.Errorf("a refused or failed edit must not run onChange (%d runs)", n)
	}
}

// storedHash is the user's stored password hash, "" for no such user.
func storedHash(s *store, user string) string {
	u, _ := s.findUser(user)
	return u.Password
}

func TestStore_SetPassword(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	s.users[0].MustChangePassword = true
	committed := 0
	if err := s.setPassword(context.Background(), "admin", "admin-new-pw-1", storedHash(s, "admin"), func() { committed++ }); err != nil {
		t.Fatal(err)
	}
	if committed != 1 {
		t.Errorf("committed must run once with the new hash stored, ran %d times", committed)
	}
	mustChange, ok, _ := s.checkPassword(context.Background(), "admin", "admin-new-pw-1")
	if !ok || mustChange {
		t.Errorf("new password must work and clear the change flag: ok=%v mustChange=%v", ok, mustChange)
	}
	if !signsIn(t, f.load(t), "admin", "admin-new-pw-1") {
		t.Error("the change must persist")
	}
	if err := s.setPassword(context.Background(), "ghost", "ghost-password", "", func() { committed++ }); !errors.Is(err, errUserNotFound) {
		t.Errorf("unknown user: want errUserNotFound, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	s.hasher.slots <- struct{}{}
	if err := s.setPassword(ctx, "admin", "admin-other-pw", storedHash(s, "admin"), func() { committed++ }); !errors.Is(err, context.Canceled) {
		t.Errorf("hash failure: want context.Canceled, got %v", err)
	}
	if committed != 1 {
		t.Errorf("a refused change must not run committed (%d runs)", committed)
	}
}

// A user's own change moves seq always, and their rev only when it clears the
// forced-change flag (the one visible effect).
func TestStore_SetPassword_RevMovesOnlyWhenTheFlagFlips(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	s.users[1].MustChangePassword = true
	ctx := context.Background()
	if err := s.setPassword(ctx, "viewer", "viewer-new-pw-1", storedHash(s, "viewer"), func() {}); err != nil {
		t.Fatal(err)
	}
	if u := currentUser(t, s, "viewer"); u.Rev != 3 || u.MustChangePassword {
		t.Errorf("clearing the flag moves the rev to the new seq 3, got rev %d flag %v", u.Rev, u.MustChangePassword)
	}
	if err := s.setPassword(ctx, "viewer", "viewer-new-pw-2", storedHash(s, "viewer"), func() {}); err != nil {
		t.Fatal(err)
	}
	if u := currentUser(t, s, "viewer"); u.Rev != 3 {
		t.Errorf("a password change alone keeps the rev, got %d", u.Rev)
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("seq moves on every commit: want 4, got %d", seq)
	}
	doc, _ := f.readDocs(t)
	if doc.Seq != 4 || doc.Users[1].Rev != 3 || doc.Users[0].Rev != 1 {
		t.Errorf("the file agrees: %+v", doc)
	}
}

// A user's own change is checked against the hash their current password
// matched: an administrator's reset that landed in between wins, and nothing
// is written.
func TestStore_SetPasswordRefusesAChangedAccount(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	checked := storedHash(s, "viewer")
	putUser(t, s, currentUser(t, s, "viewer"), "reset-by-admin-1")
	seq, _ := s.seqs()
	ran := false
	if err := s.setPassword(context.Background(), "viewer", "viewer-new-pw-1", checked, func() { ran = true }); !errors.Is(err, errAccountChanged) {
		t.Fatalf("want errAccountChanged, got %v", err)
	}
	if now, _ := s.seqs(); ran || now != seq || !signsIn(t, f.load(t), "viewer", "reset-by-admin-1") {
		t.Error("the administrator's reset must stand, on disk and without a session, and seq must not move")
	}
}

// ifUnchanged ties a sign-in's session to the record its password matched.
func TestStore_IfUnchanged(t *testing.T) {
	cases := []struct {
		name  string
		edit  func(t *testing.T, s *store)
		wants bool
	}{
		{"the record stands", func(*testing.T, *store) {}, true},
		{"an administrator reset the password", func(t *testing.T, s *store) {
			putUser(t, s, currentUser(t, s, "viewer"), "reset-by-admin-1")
		}, false},
		{"the user was deleted", func(t *testing.T, s *store) {
			if _, err := s.deleteUser(context.Background(), "", "viewer", 2); err != nil {
				t.Fatal(err)
			}
		}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := newStoreWithFixtures(t)
			check, err := s.verifyPassword(context.Background(), "viewer", viewerPW)
			if err != nil || !check.ok || check.hash == "" {
				t.Fatalf("verify: %+v %v", check, err)
			}
			c.edit(t, s)
			ran := false
			if got := s.ifUnchanged("viewer", check.hash, func() { ran = true }); got != c.wants || ran != c.wants {
				t.Errorf("ifUnchanged = %v (fn ran %v), want %v", got, ran, c.wants)
			}
		})
	}
}

// A delete moves seq, so no record holds the new value, and a record created
// again under the same name gets a rev nobody held before.
func TestStore_DeleteUser_MovesSeqAndNoRevIsReused(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	seq, err := s.deleteUser(context.Background(), "admin", "viewer", 2)
	if err != nil || seq != 3 {
		t.Fatalf("delete viewer: seq=%d err=%v", seq, err)
	}
	if signsIn(t, s, "viewer", viewerPW) {
		t.Error("deleted user must not sign in")
	}
	doc, _ := f.readDocs(t)
	if doc.Seq != 3 || len(doc.Users) != 1 || doc.Users[0].Rev != 1 {
		t.Errorf("the file holds seq 3 and only the admin at rev 1, got %+v", doc)
	}
	back := putUser(t, s, userRec{Username: "viewer"}, "viewer-password-2")
	if back.rev != 4 || back.rev == 2 || back.rev == 3 {
		t.Errorf("a re-created user must get a fresh rev (4), got %d", back.rev)
	}
}

func TestStore_DeleteUser_Refusals(t *testing.T) {
	ctx := context.Background()
	s := newStoreWithFixtures(t)
	var stale *staleError
	if _, err := s.deleteUser(ctx, "admin", "viewer", 1); !errors.As(err, &stale) || stale.rev != 2 {
		t.Errorf("an old rev: want a stale error naming rev 2, got %v", err)
	}
	if _, err := s.deleteUser(ctx, "admin", "ghost", 4); !errors.Is(err, errNotFound) {
		t.Errorf("an unknown user: want errNotFound, got %v", err)
	}
	for _, rev := range []int{0, -1} {
		if _, err := s.deleteUser(ctx, "admin", "viewer", rev); !errors.Is(err, errRevRequired) {
			t.Errorf("rev %d: want errRevRequired, got %v", rev, err)
		}
	}
	if _, err := s.deleteUser(ctx, "viewer", "viewer", 2); !errors.Is(err, errCallerNotAdmin) {
		t.Errorf("a caller who is not an admin: want errCallerNotAdmin, got %v", err)
	}
	if _, err := s.deleteUser(ctx, "ghost", "viewer", 2); !errors.Is(err, errCallerGone) {
		t.Errorf("a caller who is gone: want errCallerGone, got %v", err)
	}
	if _, err := s.deleteUser(ctx, "admin", "admin", 1); !errors.Is(err, errLastAdmin) {
		t.Errorf("the only admin: want errLastAdmin, got %v", err)
	}
	if seq, _ := s.seqs(); seq != 2 || len(s.listUsers()) != 2 {
		t.Errorf("a refusal moves nothing: seq %d, %d users", seq, len(s.listUsers()))
	}
	putUser(t, s, userRec{Username: "admin2", Admin: true}, "admin2-password")
	if _, err := s.deleteUser(ctx, "admin", "admin", 1); err != nil {
		t.Fatalf("deleting a non-last admin must succeed, got %v", err)
	}
}

func TestStore_ListUsers_ReturnsDeepCopy(t *testing.T) {
	s := newStoreWithFixtures(t)
	us := s.listUsers()
	if len(us) != 2 || len(us[0].Operate) == 0 {
		t.Fatalf("fixture: want 2 users, admin with an operate row, got %+v", us)
	}
	us[0].Username = "MUTATED"
	us[0].Operate[0].Queues = "MUTATED"
	(*us[1].Modules)[0] = "MUTATED"
	fresh := s.listUsers()
	if fresh[0].Username == "MUTATED" || fresh[0].Operate[0].Queues == "MUTATED" || (*fresh[1].Modules)[0] == "MUTATED" {
		t.Error("listUsers must return a deep copy")
	}
}

// ----- connection CRUD -----------------------------------------------------------------

func TestStore_SaveConnection_CreateStampsRev(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	got, err := s.saveConnection(context.Background(), "admin", connRec{
		Broker: "b3", Hostname: "host3",
		Semp:   sempRec{Port: "1943", Username: "mon", Password: "V1:semp-b3"},
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u", Password: "V1:c"}}},
	}, 0)
	if err != nil || got.rev != 3 || got.seq != 3 {
		t.Fatalf("create: %+v err=%v (the file stood at seq 2)", got, err)
	}
	if len(s.listConnections()) != 3 {
		t.Errorf("want 3 connections after create, got %d", len(s.listConnections()))
	}
	_, doc := f.readDocs(t)
	if doc.Seq != 3 || doc.Connections[0].Rev != 1 || doc.Connections[1].Rev != 2 || doc.Connections[2].Rev != 3 {
		t.Errorf("the file holds seq 3 and revs 1, 2, 3, got seq %d %+v", doc.Seq, doc.Connections)
	}
}

// A missing connections file is allowed; the first save creates it at seq 1.
func TestStore_SaveConnection_CreatesTheFileWhenMissing(t *testing.T) {
	f := newStoreFixture(t)
	if err := os.Remove(f.connsPath); err != nil {
		t.Fatal(err)
	}
	s := f.load(t)
	if _, seq := s.seqs(); seq != 0 {
		t.Fatalf("no file, no seq, got %d", seq)
	}
	got := putConn(t, s, connRec{Broker: "b1", Hostname: "host1"})
	if got.rev != 1 || got.seq != 1 {
		t.Errorf("the first save stamps seq 1 and rev 1, got %+v", got)
	}
	if again := f.load(t); len(again.listConnections()) != 1 {
		t.Error("the created file must load again")
	}
}

func TestStore_SaveConnection_MergeSecretsOnEdit(t *testing.T) {
	s := newStoreWithFixtures(t)
	edit := connRec{
		Broker: "b1", Hostname: "host1-new",
		Semp: sempRec{Port: "1943", Username: "mon", Password: ""}, // blank -> keep semp-b1-pw
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{
			{Name: "v1", Username: "u1", Password: ""},           // blank + match -> keep cli-b1v1-pw
			{Name: "v2", Username: "u2", Password: "V1:changed"}, // non-blank -> replace
			{Name: "vX", Username: "ux", Password: ""},           // blank + no match -> stays ""
		}},
	}
	got := putConn(t, s, edit)
	if got.rev != 3 || got.seq != 3 {
		t.Errorf("a hostname change moves the rev to the new seq, got %+v", got)
	}
	b1 := currentConn(t, s, "b1")
	if b1.Hostname != "host1-new" {
		t.Errorf("non-secret fields must update, hostname=%q", b1.Hostname)
	}
	if b1.Semp.Password != "semp-b1-pw" {
		t.Errorf("blank semp password must be kept, got %q", b1.Semp.Password)
	}
	pw := map[string]string{}
	for _, v := range b1.Client.MsgVpns {
		pw[v.Name] = v.Password
	}
	if pw["v1"] != "cli-b1v1-pw" || pw["v2"] != "V1:changed" || pw["vX"] != "" {
		t.Errorf("VPN secrets: want keep/replace/blank, got %v", pw)
	}
}

// Passwords are not in the console view: changing only them moves seq and
// keeps the rev. The blank-keeps rule is resolved against the record now.
func TestStore_SaveConnection_PasswordOnlyKeepsRev(t *testing.T) {
	s := newStoreWithFixtures(t)
	edit := currentConn(t, s, "b2")
	edit.Semp.Password = "V1:semp-b2-new"
	edit.Client.MsgVpns[0].Password = "V1:c-new"
	got := putConn(t, s, edit)
	if got.rev != 2 || got.seq != 3 {
		t.Errorf("passwords only: want rev 2 and seq 3, got %+v", got)
	}
	if c := currentConn(t, s, "b2"); c.Semp.Password != "V1:semp-b2-new" || c.Client.MsgVpns[0].Password != "V1:c-new" {
		t.Errorf("a non-blank password must replace, got %+v", c)
	}
	same := currentConn(t, s, "b2")
	same.Semp.Scheme = sempTLS // TLS spelled out is the blank scheme: nothing the console shows
	if got := putConn(t, s, same); got.rev != 2 || got.seq != 4 {
		t.Errorf("the TLS scheme spelled out changes nothing visible: %+v", got)
	}
	plain := currentConn(t, s, "b2")
	plain.Client.Scheme = clientPlain
	if got := putConn(t, s, plain); got.rev != got.seq {
		t.Errorf("a scheme the console shows moves the rev: %+v", got)
	}
}

func TestStore_SaveConnection_Refusals(t *testing.T) {
	ctx := context.Background()
	var stale *staleError
	cases := []struct {
		name   string
		caller string
		rec    connRec
		rev    int
		check  func(err error) bool
	}{
		{"a create of an existing broker", "admin", connRec{Broker: "b1"}, 0, func(err error) bool { return errors.Is(err, errExists) }},
		{"an edit of a broker that is gone", "admin", connRec{Broker: "b9"}, 1, func(err error) bool { return errors.Is(err, errNotFound) }},
		{"an old rev", "admin", connRec{Broker: "b2"}, 1, func(err error) bool { return errors.As(err, &stale) && stale.rev == 2 }},
		{"a negative rev", "admin", connRec{Broker: "b2"}, -3, func(err error) bool { return errors.Is(err, errRevRequired) }},
		{"a caller who is not an admin", "viewer", connRec{Broker: "b2"}, 2, func(err error) bool { return errors.Is(err, errCallerNotAdmin) }},
		{"a caller who is gone", "ghost", connRec{Broker: "b2"}, 2, func(err error) bool { return errors.Is(err, errCallerGone) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			s := f.load(t)
			before, _ := os.ReadFile(f.connsPath)
			if _, err := s.saveConnection(ctx, tc.caller, tc.rec, tc.rev); !tc.check(err) {
				t.Errorf("got %v", err)
			}
			if _, seq := s.seqs(); seq != 2 || len(s.listConnections()) != 2 {
				t.Errorf("a refusal moves nothing: seq %d", seq)
			}
			if now, _ := os.ReadFile(f.connsPath); !bytes.Equal(now, before) {
				t.Error("a refusal must not rewrite the file")
			}
		})
	}
}

func TestStore_DeleteConnection(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	var stale *staleError
	if _, err := s.deleteConnection(ctx, "admin", "b2", 1); !errors.As(err, &stale) || stale.rev != 2 {
		t.Errorf("an old rev: want a stale error naming rev 2, got %v", err)
	}
	if _, err := s.deleteConnection(ctx, "admin", "nope", 1); !errors.Is(err, errNotFound) {
		t.Errorf("an unknown broker: want errNotFound, got %v", err)
	}
	if _, err := s.deleteConnection(ctx, "admin", "b2", 0); !errors.Is(err, errRevRequired) {
		t.Errorf("rev 0: want errRevRequired, got %v", err)
	}
	if _, err := s.deleteConnection(ctx, "viewer", "b2", 2); !errors.Is(err, errCallerNotAdmin) {
		t.Errorf("a caller who is not an admin: want errCallerNotAdmin, got %v", err)
	}
	if _, seq := s.seqs(); seq != 2 || len(s.listConnections()) != 2 {
		t.Fatalf("a refusal moves nothing: seq %d", seq)
	}
	seq, err := s.deleteConnection(ctx, "admin", "b2", 2)
	if err != nil || seq != 3 {
		t.Fatalf("delete b2: seq=%d err=%v", seq, err)
	}
	_, doc := f.readDocs(t)
	if doc.Seq != 3 || len(doc.Connections) != 1 || doc.Connections[0].Rev != 1 {
		t.Errorf("the file holds seq 3 and only b1 at rev 1, got %+v", doc)
	}
	if back := putConn(t, s, connRec{Broker: "b2", Hostname: "host2"}); back.rev != 4 {
		t.Errorf("a re-created broker must get a fresh rev (4), got %d", back.rev)
	}
}

func TestStore_ListConnections_ReturnsDeepCopy(t *testing.T) {
	s := newStoreWithFixtures(t)
	cs := s.listConnections()
	if len(cs) != 2 || len(cs[0].Client.MsgVpns) == 0 {
		t.Fatalf("fixture: want 2 connections, b1 with VPNs, got %+v", cs)
	}
	cs[0].Broker = "MUTATED"
	cs[0].Client.MsgVpns[0].Password = "MUTATED"
	fresh := s.listConnections()
	if fresh[0].Broker == "MUTATED" || fresh[0].Client.MsgVpns[0].Password == "MUTATED" {
		t.Error("listConnections must return a deep copy")
	}
}

// sameUserView and sameConnView say what the admin console can tell apart;
// they must agree with what userToOutput and connToOutput show.
func TestStore_SameViewAgreesWithTheOutput(t *testing.T) {
	s := newStoreWithFixtures(t)
	u := currentUser(t, s, "viewer")
	userEdits := map[string]func(u *userRec){
		"username":      func(u *userRec) { u.Username = "other" },
		"password hash": func(u *userRec) { u.Password = "another-hash" },
		"admin":         func(u *userRec) { u.Admin = true },
		"must change":   func(u *userRec) { u.MustChangePassword = true },
		"operate":       func(u *userRec) { u.Operate = []permRow{{Brokers: "b1"}} },
		"read-only":     func(u *userRec) { u.ReadOnly = nil },
		"modules":       func(u *userRec) { u.Modules = &[]string{} },
		"modules gone":  func(u *userRec) { u.Modules = nil },
		"empty operate": func(u *userRec) { u.Operate = []permRow{} },
	}
	for name, edit := range userEdits {
		v := currentUser(t, s, "viewer")
		edit(&v)
		if got, want := sameUserView(u, v), reflect.DeepEqual(userToOutput(u), userToOutput(v)); got != want {
			t.Errorf("user edit %q: sameUserView = %v, the output says %v", name, got, want)
		}
	}
	c := currentConn(t, s, "b1")
	connEdits := map[string]func(c *connRec){
		"broker":        func(c *connRec) { c.Broker = "other" },
		"hostname":      func(c *connRec) { c.Hostname = "other" },
		"semp scheme":   func(c *connRec) { c.Semp.Scheme = sempPlain },
		"semp tls":      func(c *connRec) { c.Semp.Scheme = sempTLS },
		"semp port":     func(c *connRec) { c.Semp.Port = "1" },
		"semp user":     func(c *connRec) { c.Semp.Username = "other" },
		"semp password": func(c *connRec) { c.Semp.Password = "other" },
		"client scheme": func(c *connRec) { c.Client.Scheme = clientPlain },
		"client tls":    func(c *connRec) { c.Client.Scheme = clientTLS },
		"client port":   func(c *connRec) { c.Client.Port = "1" },
		"vpn name":      func(c *connRec) { c.Client.MsgVpns[0].Name = "other" },
		"vpn user":      func(c *connRec) { c.Client.MsgVpns[0].Username = "other" },
		"vpn password":  func(c *connRec) { c.Client.MsgVpns[0].Password = "other" },
		"vpn removed":   func(c *connRec) { c.Client.MsgVpns = c.Client.MsgVpns[1:] },
		"vpn order":     func(c *connRec) { slices.Reverse(c.Client.MsgVpns) },
		"no vpns":       func(c *connRec) { c.Client.MsgVpns = nil },
	}
	for name, edit := range connEdits {
		v := currentConn(t, s, "b1")
		edit(&v)
		if got, want := sameConnView(c, v), reflect.DeepEqual(connToOutput(c), connToOutput(v)); got != want {
			t.Errorf("connection edit %q: sameConnView = %v, the output says %v", name, got, want)
		}
	}
}

// ----- load check on seq and rev ---------------------------------------------------------

func TestLoadStore_RevChecks(t *testing.T) {
	h := testHasher(t)
	hash := mustHash(t, h, adminPW)
	users := func(seq string, rev string) string {
		return fmt.Sprintf("seq: %s\nmsg-utility-users:\n  - username: admin\n    rev: %s\n    password: %s\n    admin: true\n", seq, rev, hash)
	}
	conns := func(seq string, rev string) string {
		return fmt.Sprintf("seq: %s\nmsg-utility-connections:\n  - broker: b1\n    rev: %s\n    hostname: h\n", seq, rev)
	}
	cases := []struct {
		name, doc, want string
		users           bool
	}{
		{"user rev 0", users("3", "0"), `user "admin" has rev 0 and the file's seq is 3`, true},
		{"user rev absent", strings.Replace(users("3", "1"), "    rev: 1\n", "", 1), `user "admin" has rev 0`, true},
		{"user rev above seq", users("3", "4"), `user "admin" has rev 4 and the file's seq is 3`, true},
		{"user rev negative", users("3", "-1"), `has rev -1`, true},
		{"users seq negative", users("-1", "1"), "seq is -1", true},
		{"users seq absent", strings.Replace(users("3", "1"), "seq: 3\n", "", 1), `the file's seq is 0`, true},
		{"connection rev 0", conns("3", "0"), `broker "b1" has rev 0 and the file's seq is 3`, false},
		{"connection rev above seq", conns("3", "9"), `broker "b1" has rev 9 and the file's seq is 3`, false},
		{"connections seq negative", conns("-2", "1"), "seq is -2", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newStoreFixture(t)
			path := f.connsPath
			if tc.users {
				f.writeUsers(t, tc.doc)
				path = f.usersPath
			} else {
				f.writeConns(t, tc.doc)
			}
			_, err := loadStore(f.opts(noEnv), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), path) || !strings.Contains(err.Error(), "restore the file") {
				t.Fatalf("want a refusal naming %s and %q, got %v", path, tc.want, err)
			}
		})
	}
	// A rev equal to seq, and a file with no records at seq 0, are fine.
	f := newStoreFixture(t)
	f.writeUsers(t, users("1", "1"))
	f.writeConns(t, "seq: 0\nmsg-utility-connections: []\n")
	s := f.load(t)
	if us, cs := s.seqs(); us != 1 || cs != 0 {
		t.Errorf("seqs after load: %d %d", us, cs)
	}
}

// ----- the writer's refusals ---------------------------------------------------------------

// A sealed file replaced on disk behind the gateway's back refuses every later
// write of it until restart, even if the old bytes are put back, and wins over
// the rev check. The other file is not affected.
func TestStore_ReplacedFileRefusesEveryWriteUntilRestart(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	original, _ := os.ReadFile(f.usersPath)
	f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, "someone-else-1"), mustHash(t, f.h, "someone-else-2")))
	var disk *changedOnDiskError
	attempts := func() []error {
		_, e1 := s.saveUser(ctx, "admin", userRec{Username: "bob"}, "bob-password-1", 0)
		_, e2 := s.saveUser(ctx, "admin", userRec{Username: "viewer"}, "", 1) // stale too: the disk check comes first
		_, e3 := s.deleteUser(ctx, "admin", "viewer", 2)
		e4 := s.setPassword(ctx, "viewer", "viewer-new-pw-1", storedHash(s, "viewer"), func() {})
		return []error{e1, e2, e3, e4}
	}
	for round := 0; round < 2; round++ {
		for i, err := range attempts() {
			if !errors.As(err, &disk) || disk.file != "users.yaml" {
				t.Errorf("round %d attempt %d: want *changedOnDiskError for users.yaml, got %v", round, i, err)
			}
		}
		if err := os.WriteFile(f.usersPath, original, 0o600); err != nil { // the cause does not go away by undoing it
			t.Fatal(err)
		}
	}
	if seq, _ := s.seqs(); seq != 2 || len(s.listUsers()) != 2 {
		t.Error("a refused write must leave memory alone")
	}
	if got := putConn(t, s, connRec{Broker: "b3", Hostname: "host3"}); got.rev != 3 {
		t.Errorf("the connections file is not the one that changed: %+v", got)
	}
	// A restart loads what is on disk and writes again.
	again := f.load(t)
	if got := putUser(t, again, userRec{Username: "bob"}, "bob-password-1"); got.seq != 3 {
		t.Errorf("after a restart the write must go through: %+v", got)
	}
}

// The same holds for connections.yaml: a save, a delete and an import of the
// connections are refused once that file was replaced, and users.yaml is not
// affected.
func TestStore_ReplacedConnectionsFileRefusesItsWrites(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	conns := s.listConnections()
	if err := os.WriteFile(f.connsPath, []byte("not the file the gateway wrote"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, e1 := s.saveConnection(ctx, "admin", connRec{Broker: "b9", Hostname: "h9"}, 0)
	_, e2 := s.deleteConnection(ctx, "admin", conns[0].Broker, conns[0].Rev)
	_, e3 := runImport(s, nil, &sectionImport[connRec]{recs: conns})
	var disk *changedOnDiskError
	for i, err := range []error{e1, e2, e3} {
		if !errors.As(err, &disk) || disk.file != filepath.Base(f.connsPath) {
			t.Errorf("attempt %d: want *changedOnDiskError for the connections file, got %v", i, err)
		}
	}
	if _, err := s.saveUser(ctx, "admin", userRec{Username: "bob"}, "bob-password-1", 0); err != nil {
		t.Errorf("users.yaml is not affected: %v", err)
	}
}

// ----- import ------------------------------------------------------------------------------

// runImport runs stageImport as the backup's import does, in one transaction.
func runImport(s *store, users *sectionImport[userRec], conns *sectionImport[connRec]) (importStaged, error) {
	var res importStaged
	err := s.wr.Do(context.Background(), func(tx *txn) error {
		var err error
		res, err = s.stageImport(tx, users, conns)
		return err
	})
	return res, err
}

func TestStore_StageImport_ReplaceStampsEveryRecordAndIgnoresTheBackupsRevs(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	onChange := 0
	s.onChange = func() { onChange++ }
	admin := currentUser(t, s, "admin")
	admin.Rev = 99
	carol := userRec{Username: "carol", Rev: 7, Password: storedHash(s, "viewer"), Operate: []permRow{}, ReadOnly: []permRow{}}
	res, err := runImport(s,
		&sectionImport[userRec]{recs: []userRec{admin, carol}},
		&sectionImport[connRec]{recs: []connRec{{Broker: "b9", Rev: 50, Hostname: "host9"}}})
	if err != nil {
		t.Fatal(err)
	}
	if res.usersSeq != 3 || res.connsSeq != 3 || !reflect.DeepEqual(res.drop, []string{"viewer"}) {
		t.Errorf("want both files at seq 3 and the removed viewer signed out, got %+v", res)
	}
	if onChange != 1 {
		t.Errorf("onChange ran %d times, want once", onChange)
	}
	for _, u := range s.listUsers() {
		if u.Rev != 3 {
			t.Errorf("user %q: rev %d, want 3 (the backup's revs are ignored)", u.Username, u.Rev)
		}
	}
	for _, c := range s.listConnections() {
		if c.Rev != 3 {
			t.Errorf("connection %q: rev %d, want 3", c.Broker, c.Rev)
		}
	}
	ud, cd := f.readDocs(t)
	if ud.Seq != 3 || cd.Seq != 3 || len(ud.Users) != 2 || len(cd.Connections) != 1 || cd.Connections[0].Broker != "b9" {
		t.Errorf("both files must hold the import: %+v %+v", ud, cd)
	}
	if again := f.load(t); !signsIn(t, again, "carol", viewerPW) {
		t.Error("the imported hash must load and work")
	}
}

func TestStore_StageImport_MergeKeepsTheRestAndSkipLeavesAFileAlone(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	usersBefore, _ := os.ReadFile(f.usersPath)
	b1 := currentConn(t, s, "b1")
	b1.Hostname = "host1-from-backup"
	res, err := runImport(s, nil, &sectionImport[connRec]{recs: []connRec{b1, {Broker: "b3", Hostname: "host3"}}, merge: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.usersSeq != 0 || res.connsSeq != 3 || len(res.drop) != 0 {
		t.Errorf("only connections are written: %+v", res)
	}
	names := []string{}
	for _, c := range s.listConnections() {
		names = append(names, c.Broker)
		if c.Rev != 3 {
			t.Errorf("%s: every record of an imported section takes the new seq, got rev %d", c.Broker, c.Rev)
		}
	}
	if !reflect.DeepEqual(names, []string{"b1", "b2", "b3"}) || currentConn(t, s, "b1").Hostname != "host1-from-backup" {
		t.Errorf("merge keeps b2, replaces b1, appends b3: %v", names)
	}
	if now, _ := os.ReadFile(f.usersPath); !bytes.Equal(now, usersBefore) {
		t.Error("a skipped section's file must not be rewritten")
	}
	if us, _ := s.seqs(); us != 2 {
		t.Errorf("users seq must not move, got %d", us)
	}
	// Merging users: a restored hash replaces the same name's, the others stay.
	viewer := currentUser(t, s, "viewer")
	viewer.Password = storedHash(s, "admin")
	res, err = runImport(s, &sectionImport[userRec]{recs: []userRec{viewer}, merge: true}, nil)
	if err != nil || res.usersSeq != 3 || !reflect.DeepEqual(res.drop, []string{"viewer"}) {
		t.Fatalf("merge users: %+v %v", res, err)
	}
	if u := currentUser(t, s, "admin"); u.Rev != 3 {
		t.Errorf("the admin was not in the backup but its rev follows the file: %d", u.Rev)
	}
}

// An import that breaks the load rules is refused before anything is queued:
// files, memory and seq stay as they were.
func TestStore_StageImport_RefusalsChangeNothing(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	usersFile, _ := os.ReadFile(f.usersPath)
	connsFile, _ := os.ReadFile(f.connsPath)
	users, conns := s.listUsers(), s.listConnections()
	viewerOnly := []userRec{currentUser(t, s, "viewer")}

	var invalid *importInvalidError
	if _, err := runImport(s, &sectionImport[userRec]{recs: viewerOnly}, nil); !errors.Is(err, errLastAdmin) {
		t.Errorf("no admin left: want errLastAdmin, got %v", err)
	}
	if _, err := runImport(s, &sectionImport[userRec]{recs: append(slices.Clone(users), users[0])}, nil); !errors.As(err, &invalid) || invalid.section != "users" ||
		!strings.Contains(err.Error(), "The backup's users cannot be imported") || !strings.Contains(err.Error(), "appears more than once") {
		t.Errorf("a duplicate user: want an importInvalidError for users, got %v", err)
	}
	if _, err := runImport(s, nil, &sectionImport[connRec]{recs: append(slices.Clone(conns), conns[0])}); !errors.As(err, &invalid) || invalid.section != "connections" {
		t.Errorf("a duplicate connection: want an importInvalidError for connections, got %v", err)
	}
	// The users section is fine, the connections one is not: neither is written.
	if _, err := runImport(s, &sectionImport[userRec]{recs: users}, &sectionImport[connRec]{recs: []connRec{{Broker: "b 1"}}}); !errors.As(err, &invalid) {
		t.Errorf("a bad second section: want a refusal, got %v", err)
	}
	if us, cs := s.seqs(); us != 2 || cs != 2 || len(s.listUsers()) != 2 || len(s.listConnections()) != 2 {
		t.Errorf("a refused import moves nothing: seqs %d %d", us, cs)
	}
	if now, _ := os.ReadFile(f.usersPath); !bytes.Equal(now, usersFile) {
		t.Error("a refused import rewrote the users file")
	}
	if now, _ := os.ReadFile(f.connsPath); !bytes.Equal(now, connsFile) {
		t.Error("a refused import rewrote the connections file")
	}
	// A file replaced behind the gateway's back refuses the import too.
	f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, "x-password-1"), mustHash(t, f.h, "x-password-2")))
	var disk *changedOnDiskError
	if _, err := runImport(s, &sectionImport[userRec]{recs: users}, nil); !errors.As(err, &disk) {
		t.Errorf("a replaced users file: want *changedOnDiskError, got %v", err)
	}
}

// An import writes the users and the connections together: when the second
// file cannot be replaced, the first is put back and memory keeps both lists.
func TestStore_StageImport_IsAllOrNothing(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	usersFile, _ := os.ReadFile(f.usersPath)
	connsFile, _ := os.ReadFile(f.connsPath)
	s.wr.hooks.rename = renameFailing(2)
	users := []userRec{currentUser(t, s, "admin")}
	_, err := runImport(s, &sectionImport[userRec]{recs: users}, &sectionImport[connRec]{recs: []connRec{{Broker: "b9", Hostname: "host9"}}})
	var failed *writeFailedError
	if !errors.As(err, &failed) {
		t.Fatalf("want a write that failed and changed nothing, got %v", err)
	}
	if now, _ := os.ReadFile(f.usersPath); !bytes.Equal(now, usersFile) {
		t.Error("the users file must be put back")
	}
	if now, _ := os.ReadFile(f.connsPath); !bytes.Equal(now, connsFile) {
		t.Error("the connections file must be put back")
	}
	if us, cs := s.seqs(); us != 2 || cs != 2 || len(s.users) != 2 || len(s.conns) != 2 {
		t.Errorf("memory must keep both lists: seqs %d %d, %d users, %d connections", us, cs, len(s.users), len(s.conns))
	}

	// With both files writable the two lists change together.
	s.wr.hooks.rename = nil
	res, err := runImport(s, &sectionImport[userRec]{recs: users}, &sectionImport[connRec]{recs: []connRec{{Broker: "b9", Hostname: "host9"}}})
	if err != nil || !reflect.DeepEqual(res.drop, []string{"viewer"}) {
		t.Fatalf("want the viewer signed out, got %+v %v", res, err)
	}
	if l := f.load(t); len(l.users) != 1 || len(l.conns) != 1 || l.conns[0].Broker != "b9" {
		t.Errorf("both files must hold the import: %d users, %+v", len(l.users), l.conns)
	}
}

// ----- races (run with -race) ---------------------------------------------------------------

// together starts every fn at once and waits for all of them.
func together(fns ...func()) {
	start := make(chan struct{})
	var wg sync.WaitGroup
	for _, fn := range fns {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			fn()
		}()
	}
	close(start)
	wg.Wait()
}

// Two saves of one record from the same rev: exactly one lands, the other is
// stale, and the file and memory agree.
func TestStore_Race_TwoSavesOfOneRecord(t *testing.T) {
	for round := 0; round < 5; round++ {
		f := newStoreFixture(t)
		s := f.load(t)
		errs := make([]error, 2)
		together(
			func() {
				u := currentUser(t, s, "viewer")
				u.ReadOnly = []permRow{{Brokers: "b1", MsgVpns: "v1", Queues: "a"}}
				_, errs[0] = s.saveUser(context.Background(), "admin", u, "", 2)
			},
			func() {
				u := currentUser(t, s, "viewer")
				u.ReadOnly = []permRow{{Brokers: "b1", MsgVpns: "v1", Queues: "b"}}
				_, errs[1] = s.saveUser(context.Background(), "admin", u, "", 2)
			},
		)
		var stale *staleError
		wins := 0
		for _, err := range errs {
			switch {
			case err == nil:
				wins++
			case errors.As(err, &stale) && stale.rev == 3:
			default:
				t.Fatalf("round %d: want nil or stale at rev 3, got %v", round, err)
			}
		}
		doc, _ := f.readDocs(t)
		if wins != 1 || doc.Seq != 3 || currentUser(t, s, "viewer").Rev != 3 || doc.Users[1].Rev != 3 {
			t.Fatalf("round %d: one winner, one commit: wins=%d file seq %d", round, wins, doc.Seq)
		}
	}
}

// Saves of different records in one file both land: neither overwrites the
// other, because each plans on the state the other published.
func TestStore_Race_SavesOfDifferentRecordsBothLand(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	var e1, e2, e3 error
	together(
		func() {
			u := currentUser(t, s, "viewer")
			u.Admin = true
			_, e1 = s.saveUser(context.Background(), "admin", u, "", 2)
		},
		func() {
			_, e2 = s.saveUser(context.Background(), "admin", userRec{Username: "bob"}, "bob-password-1", 0)
		},
		func() {
			_, e3 = s.saveUser(context.Background(), "admin", userRec{Username: "carol"}, "carol-password-1", 0)
		},
	)
	if e1 != nil || e2 != nil || e3 != nil {
		t.Fatalf("all three must land: %v %v %v", e1, e2, e3)
	}
	again := f.load(t)
	if us, _ := again.seqs(); us != 5 || len(again.users) != 4 {
		t.Errorf("want seq 5 and four users after a restart, got seq %d, %d users", us, len(again.users))
	}
	if admin, _ := again.isAdmin("viewer"); !admin {
		t.Error("the promotion must survive the creates")
	}
}

// Two creates of one name: one wins, the other is told it exists.
func TestStore_Race_TwoCreatesOfOneName(t *testing.T) {
	s := newStoreWithFixtures(t)
	errs := make([]error, 2)
	together(
		func() {
			_, errs[0] = s.saveUser(context.Background(), "admin", userRec{Username: "bob"}, "bob-password-1", 0)
		},
		func() {
			_, errs[1] = s.saveUser(context.Background(), "admin", userRec{Username: "bob"}, "bob-password-2", 0)
		},
	)
	exists := 0
	for _, err := range errs {
		if errors.Is(err, errExists) {
			exists++
		} else if err != nil {
			t.Fatalf("unexpected %v", err)
		}
	}
	if exists != 1 || len(s.listUsers()) != 3 {
		t.Errorf("one create wins and one exists: exists=%d users=%d", exists, len(s.listUsers()))
	}
}

// A delete racing a save of the same record: one of them wins and the other is
// refused for what the winner did.
func TestStore_Race_DeleteRacingASave(t *testing.T) {
	for round := 0; round < 5; round++ {
		s := newStoreWithFixtures(t)
		var saveErr, delErr error
		together(
			func() {
				u := currentUser(t, s, "viewer")
				u.Admin = true
				_, saveErr = s.saveUser(context.Background(), "admin", u, "", 2)
			},
			func() { _, delErr = s.deleteUser(context.Background(), "admin", "viewer", 2) },
		)
		var stale *staleError
		switch {
		case saveErr == nil && errors.As(delErr, &stale):
		case delErr == nil && errors.Is(saveErr, errNotFound):
		default:
			t.Fatalf("round %d: want one winner, got save=%v delete=%v", round, saveErr, delErr)
		}
	}
}

// An import racing a user save, in whichever order they run: the import's list
// is the final state, and a save that ran second finds its user gone.
func TestStore_Race_ImportRacingASave(t *testing.T) {
	for round := 0; round < 8; round++ {
		s := newStoreWithFixtures(t)
		admin := currentUser(t, s, "admin")
		var impErr, saveErr error
		together(
			func() {
				_, impErr = runImport(s, &sectionImport[userRec]{recs: []userRec{admin}}, nil)
			},
			func() {
				u := currentUser(t, s, "viewer")
				u.Admin = true
				_, saveErr = s.saveUser(context.Background(), "admin", u, "", 2)
			},
		)
		var stale *staleError
		if impErr != nil || (saveErr != nil && !errors.As(saveErr, &stale) && !errors.Is(saveErr, errNotFound)) {
			t.Fatalf("round %d: import=%v save=%v", round, impErr, saveErr)
		}
		if us, _ := s.seqs(); len(s.listUsers()) != 1 || us < 3 || us > 4 {
			t.Fatalf("round %d: the import's list must be the final state, got %d users at seq %d", round, len(s.listUsers()), us)
		}
	}
}

// Readers during writes see a committed state, never half of one: an import
// moves users.yaml and connections.yaml together, so a reader that sees one
// file's seq ahead of the other's saw half of it.
func TestStore_Race_ReadersNeverSeeHalfAnImport(t *testing.T) {
	s := newStoreWithFixtures(t)
	admin := currentUser(t, s, "admin")
	done := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
				}
				users, conns, us, cs := s.snapshotAll()
				if us != cs {
					t.Errorf("half an import: users seq %d, connections seq %d", us, cs)
					return
				}
				for _, u := range users {
					if u.Rev < 1 || u.Rev > us {
						t.Errorf("user %q rev %d outside 1..%d", u.Username, u.Rev, us)
						return
					}
				}
				for _, c := range conns {
					if c.Rev < 1 || c.Rev > cs {
						t.Errorf("connection %q rev %d outside 1..%d", c.Broker, c.Rev, cs)
						return
					}
				}
				s.profile("admin", defaultConfig().modules)
				s.sempTarget("admin", "b1")
			}
		}()
	}
	for i := 0; i < 20; i++ {
		if _, err := runImport(s, &sectionImport[userRec]{recs: []userRec{admin}}, &sectionImport[connRec]{recs: []connRec{{Broker: fmt.Sprintf("b%d", i), Hostname: "h"}}}); err != nil {
			t.Fatal(err)
		}
	}
	close(done)
	wg.Wait()
	if us, cs := s.seqs(); us != 22 || cs != 22 {
		t.Errorf("after 20 imports both files stand at seq 22, got %d and %d", us, cs)
	}
}

func TestStore_CRUD_RaceSafe(t *testing.T) {
	s := newStoreWithFixtures(t)
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			s.profile("admin", defaultConfig().modules)
			s.listUsers()
			s.isAdmin("admin")
			_, _, _ = s.checkPassword(context.Background(), "admin", adminPW)
			if _, err := s.saveUser(context.Background(), "admin", userRec{Username: fmt.Sprintf("u%d", n)}, "racer-password", 0); err != nil {
				t.Error(err)
			}
			s.listConnections()
		}(i)
	}
	wg.Wait()
	if us, _ := s.seqs(); us != 12 || len(s.listUsers()) != 12 {
		t.Errorf("ten creates, ten commits: seq %d, %d users", us, len(s.listUsers()))
	}
}

// A connection names its schemes or leaves them blank for TLS; the targets
// carry the scheme each side is reached with.
func TestStore_ConnectionSchemes(t *testing.T) {
	cases := []struct {
		name       string
		semp, smf  string
		sempScheme string
		smfScheme  string
	}{
		{"blank is TLS", "", "", "https", "wss"},
		{"plain on both sides", sempPlain, clientPlain, "http", "ws"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := newStoreWithFixtures(t)
			rec := connRec{Broker: "b1", Hostname: "host1",
				Semp:   sempRec{Scheme: c.semp, Port: "8080", Username: "mon"},
				Client: clientRec{Scheme: c.smf, Port: "8008", MsgVpns: []vpnRec{{Name: "v1", Username: "u1"}}},
			}
			if err := validateConn(rec); err != nil {
				t.Fatal(err)
			}
			putConn(t, s, rec)
			if st, ok := s.sempTarget("viewer", "b1"); !ok || st.scheme != c.sempScheme {
				t.Errorf("SEMP target: %+v %v, want scheme %s", st, ok, c.sempScheme)
			}
			if mt, ok := s.smfTarget("viewer", "b1", "v1"); !ok || mt.scheme != c.smfScheme {
				t.Errorf("SMF target: %+v %v, want scheme %s", mt, ok, c.smfScheme)
			}
		})
	}
	for _, bad := range []struct{ semp, smf, want string }{
		{"ftp", "", `broker "b1": semp.scheme "ftp" must be "https" or "http"`},
		{"", "http", `broker "b1": client.scheme "http" must be "wss" or "ws"`},
	} {
		err := validateConn(connRec{Broker: "b1", Hostname: "host1", Semp: sempRec{Scheme: bad.semp}, Client: clientRec{Scheme: bad.smf}})
		if err == nil || err.Error() != bad.want {
			t.Errorf("want %q, got %v", bad.want, err)
		}
	}
	if canonScheme(sempTLS, sempTLS) != "" || canonScheme(sempPlain, sempTLS) != sempPlain {
		t.Error("a save stores TLS as blank and keeps the plain scheme")
	}
}

// ----- two-factor (the totp field of a user) --------------------------------------------------

// Two valid secrets (base32, 32 characters): the RFC 6238 test key and another.
const (
	storeTOTPSecret  = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	storeTOTPSecret2 = "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U"
)

// writerHeld reports whether the writer's lock is held now: true inside a
// committed hook, which runs under it.
func writerHeld(s *store) bool { return len(s.wr.slot) == 1 }

// enrolViewer sets two-factor up for the viewer as the sign-in's confirm step
// does, and returns the stored recovery hashes. Fails the test on a refusal.
func enrolViewer(t *testing.T, s *store, secret string) []string {
	t.Helper()
	hashes := hashRecoveryCodes(newRecoveryCodes())
	if err := s.setTOTP(context.Background(), "viewer", secret, hashes, storedHash(s, "viewer"), func() {}); err != nil {
		t.Fatalf("enrol: %v", err)
	}
	return hashes
}

// usersWithTOTP is the fixture users file with a totp block on the viewer.
func usersWithTOTP(t *testing.T, f storeFixture, secret string, recovery ...string) string {
	t.Helper()
	doc := fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, adminPW), mustHash(t, f.h, viewerPW)) + "    totp:\n      secret: " + secret + "\n      recovery:\n"
	if len(recovery) == 0 {
		return doc + "        []\n"
	}
	for _, r := range recovery {
		doc += "        - " + r + "\n"
	}
	return doc
}

func TestStore_Load_TwoFactorRecordsAreHeldToTheirRules(t *testing.T) {
	good := hashRecoveryCode("ABCD-EFGH-JKLM-NPQR")
	cases := []struct {
		name, secret string
		recovery     []string
		rule         string // "" loads
	}{
		{"a full record", storeTOTPSecret, []string{good, good}, ""},
		{"every recovery code spent", storeTOTPSecret, nil, ""},
		{"a secret too short", "GEZDGNBV", []string{good}, totpSecretRule},
		{"a secret in lower case", strings.ToLower(storeTOTPSecret), []string{good}, totpSecretRule},
		{"a secret with a character outside base32", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJ1", []string{good}, totpSecretRule},
		{"a recovery entry in upper case", storeTOTPSecret, []string{good, strings.ToUpper(good)}, recoveryHashRule + " (entry 2)"},
		{"a recovery entry too short", storeTOTPSecret, []string{good[:63]}, recoveryHashRule + " (entry 1)"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newStoreFixture(t)
			f.writeUsers(t, usersWithTOTP(t, f, c.secret, c.recovery...))
			s, err := loadStore(f.opts(noEnv), quietLogger())
			if c.rule == "" {
				if err != nil {
					t.Fatalf("must load: %v", err)
				}
				u := currentUser(t, s, "viewer")
				if u.TOTP == nil || u.TOTP.Secret != c.secret || len(u.TOTP.Recovery) != len(c.recovery) {
					t.Errorf("the record must load as written: %+v", u.TOTP)
				}
				return
			}
			if err == nil {
				t.Fatal("a broken two-factor record must stop the load")
			}
			msg := err.Error()
			if !strings.Contains(msg, `user "viewer"`) || !strings.Contains(msg, c.rule) {
				t.Errorf("the error must name the user and the rule, got %q", msg)
			}
			for _, secret := range append([]string{c.secret}, c.recovery...) {
				if strings.Contains(msg, secret) {
					t.Errorf("the error must not quote a value: %q", msg)
				}
			}
		})
	}
}

func TestStore_TwoFactorReaders(t *testing.T) {
	s := newStoreWithFixtures(t)
	if on, exists := s.twoFactorOf("viewer"); on || !exists {
		t.Errorf("before enrolment: on=%v exists=%v", on, exists)
	}
	if _, ok := s.totpSecret("viewer"); ok {
		t.Error("no secret before enrolment")
	}
	if _, exists := s.twoFactorOf("ghost"); exists {
		t.Error("an unknown user does not exist")
	}
	if _, ok := s.totpSecret("ghost"); ok {
		t.Error("an unknown user has no secret")
	}
	enrolViewer(t, s, storeTOTPSecret)
	if on, _ := s.twoFactorOf("viewer"); !on {
		t.Error("enrolled")
	}
	if secret, ok := s.totpSecret("viewer"); !ok || secret != storeTOTPSecret {
		t.Errorf("secret = %q, %v", secret, ok)
	}
	if !currentUser(t, s, "viewer").twoFactorOn() || currentUser(t, s, "admin").twoFactorOn() {
		t.Error("the list view flag follows the record")
	}
}

// listUsers hands out copies: changing the two-factor record of one leaves the
// store alone.
func TestStore_ListUsersCopiesTheTwoFactorRecord(t *testing.T) {
	s := newStoreWithFixtures(t)
	hashes := enrolViewer(t, s, storeTOTPSecret)
	got := currentUser(t, s, "viewer")
	got.TOTP.Secret = "changed"
	got.TOTP.Recovery[0] = "changed"
	if secret, _ := s.totpSecret("viewer"); secret != storeTOTPSecret {
		t.Error("the stored secret must not change through a listed copy")
	}
	if now := currentUser(t, s, "viewer"); now.TOTP.Recovery[0] != hashes[0] {
		t.Error("the stored recovery list must not change through a listed copy")
	}
}

// Enrolling moves the rev (the list's twoFactor flag flips), setting up again
// does not; each is one commit, and the password and grants stay as they are.
func TestStore_SetTOTP_EnrolMovesTheRevAndSetUpAgainKeepsIt(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	hashes := hashRecoveryCodes(newRecoveryCodes())
	ran := 0
	err := s.setTOTP(context.Background(), "viewer", storeTOTPSecret, hashes, storedHash(s, "viewer"), func() {
		ran++
		if !writerHeld(s) {
			t.Error("committed must run under the writer lock")
		}
		if secret, ok := s.totpSecret("viewer"); !ok || secret != storeTOTPSecret {
			t.Error("the new secret must be published before committed runs")
		}
	})
	if err != nil || ran != 1 {
		t.Fatalf("enrol: err %v, committed ran %d times", err, ran)
	}
	if u := currentUser(t, s, "viewer"); u.Rev != 3 || u.TOTP == nil || !slices.Equal(u.TOTP.Recovery, hashes) {
		t.Errorf("enrol moves the rev to the new seq 3 and stores the hashes: %+v", u)
	}
	if seq, _ := s.seqs(); seq != 3 {
		t.Errorf("seq = %d, want 3", seq)
	}
	if !signsIn(t, s, "viewer", viewerPW) || len(currentUser(t, s, "viewer").ReadOnly) != 1 {
		t.Error("the password and the grants must stay")
	}
	if currentUser(t, s, "admin").Rev != 1 {
		t.Error("another user's rev must not move")
	}

	again := hashRecoveryCodes(newRecoveryCodes())
	if err := s.setTOTP(context.Background(), "viewer", storeTOTPSecret2, again, storedHash(s, "viewer"), func() {}); err != nil {
		t.Fatal(err)
	}
	u := currentUser(t, s, "viewer")
	if u.Rev != 3 || u.TOTP.Secret != storeTOTPSecret2 || !slices.Equal(u.TOTP.Recovery, again) {
		t.Errorf("setting up again replaces both and keeps the rev: %+v", u.TOTP)
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("seq = %d, want 4", seq)
	}
	doc, _ := f.readDocs(t)
	if doc.Seq != 4 || doc.Users[1].Rev != 3 || doc.Users[1].TOTP == nil || doc.Users[1].TOTP.Secret != storeTOTPSecret2 {
		t.Errorf("the file agrees: %+v", doc.Users[1])
	}
	if got := f.load(t).users[1].TOTP; got == nil || got.Secret != storeTOTPSecret2 {
		t.Error("the change must survive a restart")
	}
}

// Every refusal leaves the file, seq and memory as they were and never runs
// committed.
func TestStore_SetTOTP_Refusals(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		user   string
		expect func(f storeFixture, s *store) string
		want   func(error) bool
	}{
		{"an unknown user", "ghost", func(_ storeFixture, s *store) string { return storedHash(s, "viewer") },
			func(err error) bool { return errors.Is(err, errUserNotFound) }},
		{"an account that changed while its password was checked", "viewer", func(_ storeFixture, s *store) string {
			checked := storedHash(s, "viewer")
			putUser(t, s, currentUser(t, s, "viewer"), "reset-by-admin-1")
			return checked
		}, func(err error) bool { return errors.Is(err, errAccountChanged) }},
		{"a users file that changed on disk", "viewer", func(f storeFixture, s *store) string {
			f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, "someone-else-1"), mustHash(t, f.h, "someone-else-2")))
			return storedHash(s, "viewer")
		}, func(err error) bool {
			var disk *changedOnDiskError
			return errors.As(err, &disk) && disk.file == "users.yaml"
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newStoreFixture(t)
			s := f.load(t)
			expect := c.expect(f, s)
			seq, _ := s.seqs()
			before, _ := os.ReadFile(f.usersPath)
			ran := false
			err := s.setTOTP(ctx, c.user, storeTOTPSecret, hashRecoveryCodes(newRecoveryCodes()), expect, func() { ran = true })
			if !c.want(err) {
				t.Fatalf("got %v", err)
			}
			now, _ := s.seqs()
			after, _ := os.ReadFile(f.usersPath)
			if ran || now != seq || !bytes.Equal(before, after) {
				t.Errorf("a refusal writes nothing: committed ran %v, seq %d -> %d", ran, seq, now)
			}
			if on, _ := s.twoFactorOf("viewer"); on {
				t.Error("a refusal must not turn two-factor on")
			}
		})
	}
}

// A recovery code works once: the hash leaves the list in a commit that moves
// seq and keeps the rev, and the same code again, or any other value, is not
// used and writes nothing.
func TestStore_UseRecoveryCode_OnceAndNotTwice(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	hashes := enrolViewer(t, s, storeTOTPSecret) // seq 3, rev 3

	used, left, err := s.useRecoveryCode(ctx, "viewer", hashes[4])
	if err != nil || !used || left != 9 {
		t.Fatalf("first use: used=%v left=%d err=%v", used, left, err)
	}
	u := currentUser(t, s, "viewer")
	if u.Rev != 3 || len(u.TOTP.Recovery) != 9 || slices.Contains(u.TOTP.Recovery, hashes[4]) || u.TOTP.Secret != storeTOTPSecret {
		t.Errorf("the hash leaves, the secret and rev stay: %+v rev %d", u.TOTP, u.Rev)
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("a used code is a commit: seq = %d, want 4", seq)
	}
	if got := f.load(t).users[1].TOTP; len(got.Recovery) != 9 {
		t.Error("the spent code must stay spent after a restart")
	}

	before, _ := os.ReadFile(f.usersPath)
	for name, hash := range map[string]string{"the same code again": hashes[4], "a code that was never issued": hashRecoveryCode("ZZZZ-ZZZZ-ZZZZ-ZZZZ")} {
		used, left, err := s.useRecoveryCode(ctx, "viewer", hash)
		if err != nil || used || left != 9 {
			t.Errorf("%s: used=%v left=%d err=%v", name, used, left, err)
		}
	}
	if after, _ := os.ReadFile(f.usersPath); !bytes.Equal(before, after) {
		t.Error("a code that is not used writes nothing")
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("seq must not move: %d", seq)
	}

	// The last code leaves an enrolled user with an empty list.
	for _, h := range hashes {
		if _, _, err := s.useRecoveryCode(ctx, "viewer", h); err != nil {
			t.Fatal(err)
		}
	}
	if u := currentUser(t, s, "viewer"); u.TOTP == nil || len(u.TOTP.Recovery) != 0 {
		t.Errorf("every code spent: %+v", u.TOTP)
	}
	if got := f.load(t).users[1].TOTP; got == nil || len(got.Recovery) != 0 {
		t.Error("an empty list must load")
	}
}

func TestStore_UseRecoveryCode_Refusals(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	hash := hashRecoveryCode("ABCD-EFGH-JKLM-NPQR")
	if _, _, err := s.useRecoveryCode(ctx, "ghost", hash); !errors.Is(err, errUserNotFound) {
		t.Errorf("unknown user: want errUserNotFound, got %v", err)
	}
	// Nobody to spend from: not used, not a commit.
	seq, _ := s.seqs()
	if used, left, err := s.useRecoveryCode(ctx, "viewer", hash); err != nil || used || left != 0 {
		t.Errorf("a user without two-factor: used=%v left=%d err=%v", used, left, err)
	}
	if now, _ := s.seqs(); now != seq {
		t.Error("nothing to spend must not commit")
	}
	hashes := enrolViewer(t, s, storeTOTPSecret)
	f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, "someone-else-1"), mustHash(t, f.h, "someone-else-2")))
	var disk *changedOnDiskError
	if _, _, err := s.useRecoveryCode(ctx, "viewer", hashes[0]); !errors.As(err, &disk) {
		t.Errorf("changed on disk: want *changedOnDiskError, got %v", err)
	}
	if u := currentUser(t, s, "viewer"); len(u.TOTP.Recovery) != len(hashes) {
		t.Error("a refused use must leave the list alone")
	}
}

// Two requests carrying the same recovery code: the writer serves one at a
// time, so exactly one is let in and the file holds one removal.
func TestStore_Race_OneRecoveryCodeUsedByTwoRequests(t *testing.T) {
	for round := 0; round < 5; round++ {
		f := newStoreFixture(t)
		s := f.load(t)
		hashes := enrolViewer(t, s, storeTOTPSecret)
		var mu sync.Mutex
		wins := 0
		attempt := func() {
			used, _, err := s.useRecoveryCode(context.Background(), "viewer", hashes[0])
			if err != nil {
				t.Errorf("round %d: %v", round, err)
				return
			}
			if used {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}
		together(attempt, attempt, attempt)
		doc, _ := f.readDocs(t)
		if wins != 1 || doc.Seq != 4 || len(doc.Users[1].TOTP.Recovery) != 9 {
			t.Fatalf("round %d: one use, one commit: wins=%d seq=%d", round, wins, doc.Seq)
		}
	}
}

func TestStore_ClearTOTP(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	changed := 0
	s.onChange = func() { changed++ }
	enrolViewer(t, s, storeTOTPSecret) // seq 3, rev 3

	ran := 0
	rev, removed, err := s.clearTOTP(ctx, "admin", "viewer", func() {
		ran++
		if !writerHeld(s) {
			t.Error("committed must run under the writer lock")
		}
		if on, _ := s.twoFactorOf("viewer"); on {
			t.Error("the removal must be published before committed runs")
		}
	})
	if err != nil || !removed || rev != 4 || ran != 1 || changed != 1 {
		t.Fatalf("reset: rev=%d removed=%v err=%v committed=%d onChange=%d", rev, removed, err, ran, changed)
	}
	if u := currentUser(t, s, "viewer"); u.TOTP != nil || u.Rev != 4 {
		t.Errorf("a reset moves the rev to the new seq: %+v rev %d", u.TOTP, u.Rev)
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("seq = %d, want 4", seq)
	}
	if !signsIn(t, s, "viewer", viewerPW) {
		t.Error("the password stays")
	}
	if got := f.load(t).users[1]; got.TOTP != nil || got.Rev != 4 {
		t.Errorf("the file agrees: %+v", got)
	}

	// Nothing to remove: the rev as it is, no commit, no hooks, no re-check.
	before, _ := os.ReadFile(f.usersPath)
	rev, removed, err = s.clearTOTP(ctx, "admin", "viewer", func() { ran++ })
	if err != nil || removed || rev != 4 || ran != 1 || changed != 1 {
		t.Errorf("again: rev=%d removed=%v err=%v committed=%d onChange=%d", rev, removed, err, ran, changed)
	}
	if after, _ := os.ReadFile(f.usersPath); !bytes.Equal(before, after) {
		t.Error("nothing to remove writes nothing")
	}
	if seq, _ := s.seqs(); seq != 4 {
		t.Errorf("seq must not move: %d", seq)
	}
	// A caller of "" is the gateway itself, as for every change.
	enrolViewer(t, s, storeTOTPSecret2)
	if _, removed, err := s.clearTOTP(ctx, "", "viewer"); err != nil || !removed {
		t.Errorf("no caller: removed=%v err=%v", removed, err)
	}
}

// The refusals come in the pinned order (caller, disk, existence) and leave
// the record alone.
func TestStore_ClearTOTP_Refusals(t *testing.T) {
	ctx := context.Background()
	f := newStoreFixture(t)
	s := f.load(t)
	enrolViewer(t, s, storeTOTPSecret)
	seq, _ := s.seqs()
	ran := false
	hook := func() { ran = true }

	if _, _, err := s.clearTOTP(ctx, "ghost", "viewer", hook); !errors.Is(err, errCallerGone) {
		t.Errorf("a caller who is gone: want errCallerGone, got %v", err)
	}
	if _, _, err := s.clearTOTP(ctx, "viewer", "viewer", hook); !errors.Is(err, errCallerNotAdmin) {
		t.Errorf("a caller who is not an admin: want errCallerNotAdmin, got %v", err)
	}
	if _, _, err := s.clearTOTP(ctx, "admin", "ghost", hook); !errors.Is(err, errNotFound) {
		t.Errorf("an unknown user: want errNotFound, got %v", err)
	}
	if on, _ := s.twoFactorOf("viewer"); !on || ran {
		t.Error("a refusal must leave two-factor on and run nothing")
	}
	if now, _ := s.seqs(); now != seq {
		t.Errorf("a refusal leaves seq alone: %d -> %d", seq, now)
	}

	f.writeUsers(t, fmt.Sprintf(usersYAMLTemplate, mustHash(t, f.h, "someone-else-1"), mustHash(t, f.h, "someone-else-2")))
	var disk *changedOnDiskError
	if _, _, err := s.clearTOTP(ctx, "admin", "ghost", hook); !errors.As(err, &disk) {
		t.Errorf("the disk check comes before existence: got %v", err)
	}
	if _, _, err := s.clearTOTP(ctx, "viewer", "viewer", hook); !errors.Is(err, errCallerNotAdmin) {
		t.Errorf("the caller check comes before the disk check: got %v", err)
	}
	if on, _ := s.twoFactorOf("viewer"); !on || ran {
		t.Error("a refusal must leave two-factor on and run nothing")
	}
}

// An administrator's save never carries or clears two-factor, as a blank
// password keeps the hash; a body that names one is ignored by the store.
func TestStore_SaveUser_KeepsTwoFactor(t *testing.T) {
	ctx := context.Background()
	s := newStoreWithFixtures(t)
	hashes := enrolViewer(t, s, storeTOTPSecret) // seq 3, rev 3

	// Carrying other values, or none, changes nothing about the stored record.
	for name, carried := range map[string]*userTOTP{"none": nil, "another secret": {Secret: storeTOTPSecret2, Recovery: []string{"x"}}} {
		u := currentUser(t, s, "viewer")
		u.TOTP = carried
		saved, err := s.saveUser(ctx, "admin", u, "", currentUser(t, s, "viewer").Rev)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		got := currentUser(t, s, "viewer")
		if got.TOTP == nil || got.TOTP.Secret != storeTOTPSecret || !slices.Equal(got.TOTP.Recovery, hashes) {
			t.Errorf("%s: the stored two-factor must stay: %+v", name, got.TOTP)
		}
		if saved.rev != 3 {
			t.Errorf("%s: nothing visible changed, so the rev stays 3, got %d", name, saved.rev)
		}
	}

	// A visible change moves the rev and still keeps it.
	u := currentUser(t, s, "viewer")
	u.TOTP = nil
	u.ReadOnly = []permRow{{Brokers: "b2", MsgVpns: "*", Queues: "*"}}
	saved, err := s.saveUser(ctx, "admin", u, "", u.Rev)
	if err != nil || saved.rev != saved.seq {
		t.Fatalf("grant change: %+v %v", saved, err)
	}
	if on, _ := s.twoFactorOf("viewer"); !on {
		t.Error("a grant change must keep two-factor")
	}

	// A new user starts without it, whatever the body carried.
	if _, err := s.saveUser(ctx, "admin", userRec{Username: "bob", TOTP: &userTOTP{Secret: storeTOTPSecret}}, "bob-password-1", 0); err != nil {
		t.Fatal(err)
	}
	if on, _ := s.twoFactorOf("bob"); on {
		t.Error("a new user has no two-factor")
	}
}

// What the admin console shows decides the rev: the flag counts, the secret
// and the codes left do not.
func TestSameUserView_TwoFactor(t *testing.T) {
	off := userRec{Username: "u"}
	on := userRec{Username: "u", TOTP: &userTOTP{Secret: storeTOTPSecret, Recovery: []string{"a"}}}
	again := userRec{Username: "u", TOTP: &userTOTP{Secret: storeTOTPSecret2}}
	if sameUserView(off, on) || sameUserView(on, off) {
		t.Error("two-factor on and off look different")
	}
	if !sameUserView(on, again) || !sameUserView(off, off) {
		t.Error("another secret or fewer codes look the same")
	}
}

// An import takes two-factor from the backup, names the users it added,
// removed or replaced for sign-out, and holds it to the load rules.
func TestStore_StageImport_TwoFactor(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	admin, viewer := currentUser(t, s, "admin"), currentUser(t, s, "viewer")
	viewer.TOTP = &userTOTP{Secret: storeTOTPSecret, Recovery: hashRecoveryCodes(newRecoveryCodes())}
	res, err := runImport(s, &sectionImport[userRec]{recs: []userRec{admin, viewer}}, nil)
	if err != nil || !reflect.DeepEqual(res.drop, []string{"viewer"}) {
		t.Fatalf("an added two-factor ends the user's sessions: %+v %v", res, err)
	}
	if secret, ok := s.totpSecret("viewer"); !ok || secret != storeTOTPSecret {
		t.Error("the import must restore the secret")
	}

	bad := viewer
	bad.TOTP = &userTOTP{Secret: "not-a-secret"}
	var invalid *importInvalidError
	seq, _ := s.seqs()
	if _, err := runImport(s, &sectionImport[userRec]{recs: []userRec{admin, bad}}, nil); !errors.As(err, &invalid) || invalid.section != "users" {
		t.Fatalf("a broken record is an invalid users section, got %v", err)
	}
	if strings.Contains(err2s(invalid), "not-a-secret") {
		t.Error("the refusal must not quote the secret")
	}
	if now, _ := s.seqs(); now != seq {
		t.Error("a refused import writes nothing")
	}
}

// err2s is an error's text, "" for nil.
func err2s(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// A bootstrap password from the environment is held to login.passwordMinLength
// as the gateway started with it: one that meets the built-in 12 but not the
// raised minimum is set aside like any other outside the policy, with the
// warning naming the minimum in force; one that meets it is used.
func TestLoadStore_BootstrapPasswordIsCheckedAgainstTheConfiguredMinimum(t *testing.T) {
	const twelve, sixteen = "twelve-chars", "sixteen-chars-pw"
	for _, tc := range []struct {
		name, value string
		accepted    bool
	}{
		{"12 characters under a minimum of 16", twelve, false},
		{"16 characters under a minimum of 16", sixteen, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := bootstrapFixture(t)
			opts := f.opts(envOf(map[string]string{envAdminPassword: tc.value}))
			opts.passwordMin = 16
			var buf strings.Builder
			s, err := loadStore(opts, newCapturingLogger(&buf))
			if err != nil {
				t.Fatal(err)
			}
			_, ok, _ := s.checkPassword(context.Background(), "admin", tc.value)
			if ok != tc.accepted {
				t.Errorf("sign-in with the supplied password: got %v, want %v", ok, tc.accepted)
			}
			out := buf.String()
			if !tc.accepted && (!strings.Contains(out, "bootstrap password variable ignored") || !strings.Contains(out, "password must be 16 to 128 characters")) {
				t.Errorf("the warning must name the minimum in force: %s", out)
			}
			if tc.accepted && strings.Contains(out, "ignored") {
				t.Errorf("a password that meets the minimum is not set aside: %s", out)
			}
		})
	}
}
