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

const usersYAMLTemplate = `msg-utility-users:
  - username: admin
    password: %s
    admin: true
    operate:
      - brokers: '*'
        msgVpns: '*'
        queues: '*'
  - username: viewer
    password: %s
    admin: false
    read-only:
      - brokers: b1
        msgVpns: v1
        queues: '*'
    modules: [queue-browser]
`

const connsYAML = `msg-utility-connections:
  - broker: b1
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
	h                                       *hasher
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

func TestLoadStore_BootstrapRefusesBadSources(t *testing.T) {
	cases := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"both set", map[string]string{envAdminPassword: "long-enough-pw", envAdminPasswordFile: "/x"}, "not both"},
		{"too short", map[string]string{envAdminPassword: "short"}, "ADMIN_PASSWORD: password must be 12 to 128"},
		{"file too short", map[string]string{envAdminPasswordFile: "SHORTFILE"}, "ADMIN_PASSWORD_FILE: password must be"},
		{"file unreadable", map[string]string{envAdminPasswordFile: "/nonexistent/admin.pw"}, `ADMIN_PASSWORD_FILE="/nonexistent/admin.pw" cannot be read`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := bootstrapFixture(t)
			if v := tc.env[envAdminPasswordFile]; v == "SHORTFILE" {
				p := filepath.Join(t.TempDir(), "pw")
				writeFile(t, p, "tiny")
				tc.env[envAdminPasswordFile] = p
			}
			_, err := loadStore(f.opts(envOf(tc.env)), quietLogger())
			if err == nil || !strings.Contains(err.Error(), tc.want) || !strings.Contains(err.Error(), f.usersPath) {
				t.Fatalf("want an error naming the users file and %q, got %v", tc.want, err)
			}
			if strings.Contains(err.Error(), "tiny") || strings.Contains(err.Error(), "short\"") {
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
	if _, err := s.upsertUser(context.Background(), userRec{Username: "bob", Operate: []permRow{}, ReadOnly: []permRow{}}, "bob-password-1"); err != nil {
		t.Fatal(err)
	}
	if err := s.upsertConnection(connRec{Broker: "b3", Hostname: "host3", Semp: sempRec{Port: "1943", Username: "mon3", Password: "semp-secret-3"}}); err != nil {
		t.Fatal(err)
	}
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

func TestStore_UpsertUser_CreateHashesAndPersists(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	drop, err := s.upsertUser(context.Background(), userRec{
		Username: "bob", Admin: true,
		Operate: []permRow{{Brokers: "*", MsgVpns: "*", Queues: "*"}},
		Modules: &[]string{},
	}, "bob-password-1")
	if err != nil || drop {
		t.Fatalf("create: drop=%v err=%v", drop, err)
	}
	if strings.Contains(f.readUsers(t), "bob-password-1") {
		t.Error("the plaintext password must never reach the file")
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

func TestStore_UpsertUser_EditWithoutPasswordKeepsHashAndFlag(t *testing.T) {
	s := newStoreWithFixtures(t)
	s.users[1].MustChangePassword = true
	drop, err := s.upsertUser(context.Background(), userRec{Username: "viewer"}, "")
	if err != nil || drop {
		t.Fatalf("edit: drop=%v err=%v (no password, same admin flag: sessions stay)", drop, err)
	}
	mustChange, ok, _ := s.checkPassword(context.Background(), "viewer", viewerPW)
	if !ok || !mustChange {
		t.Errorf("blank password must keep the hash and the change flag: ok=%v mustChange=%v", ok, mustChange)
	}
}

func TestStore_UpsertUser_NewPasswordOrAdminFlagDropsSessions(t *testing.T) {
	s := newStoreWithFixtures(t)
	s.users[1].MustChangePassword = true
	drop, err := s.upsertUser(context.Background(), userRec{Username: "viewer"}, "viewer-new-pw-1")
	if err != nil || !drop {
		t.Fatalf("password change: drop=%v err=%v", drop, err)
	}
	if signsIn(t, s, "viewer", viewerPW) || !signsIn(t, s, "viewer", "viewer-new-pw-1") {
		t.Error("the old password must stop working and the new one must work")
	}
	if mustChange, _, _ := s.checkPassword(context.Background(), "viewer", "viewer-new-pw-1"); mustChange {
		t.Error("an admin-set password replaces the record, change flag included")
	}

	drop, err = s.upsertUser(context.Background(), userRec{Username: "viewer", Admin: true}, "")
	if err != nil || !drop {
		t.Fatalf("promotion: drop=%v err=%v", drop, err)
	}
}

func TestStore_UpsertUser_Refusals(t *testing.T) {
	s := newStoreWithFixtures(t)
	if _, err := s.upsertUser(context.Background(), userRec{Username: "admin", Admin: false}, ""); !errors.Is(err, errLastAdmin) {
		t.Errorf("demoting the last admin: want errLastAdmin, got %v", err)
	}
	if admin, _ := s.isAdmin("admin"); !admin {
		t.Error("a refused demotion must leave the admin in place")
	}
	before := len(s.listUsers())
	if _, err := s.upsertUser(context.Background(), userRec{Username: "ghost", Admin: true}, ""); !errors.Is(err, errBlankNewUserPassword) {
		t.Errorf("blank-password create: want errBlankNewUserPassword, got %v", err)
	}
	if len(s.listUsers()) != before {
		t.Error("a rejected create must not persist")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	s.hasher.slots <- struct{}{}
	if _, err := s.upsertUser(ctx, userRec{Username: "carol"}, "carol-password"); !errors.Is(err, context.Canceled) {
		t.Errorf("hash failure: want context.Canceled, got %v", err)
	}
	if len(s.listUsers()) != before {
		t.Error("a failed hash must not persist")
	}
}

// blockWrites points path under a regular file so the atomic write's MkdirAll
// fails, exercising persist-then-commit.
func blockWrites(t *testing.T, path *string) {
	t.Helper()
	blocker := filepath.Join(t.TempDir(), "blocker")
	writeFile(t, blocker, "x")
	*path = filepath.Join(blocker, "file.yaml")
}

func TestStore_PersistErrorLeavesMemoryUnchanged(t *testing.T) {
	s := newStoreWithFixtures(t)
	blockWrites(t, &s.usersPath)
	before := len(s.listUsers())
	if _, err := s.upsertUser(context.Background(), userRec{Username: "bob"}, "bob-password-1"); err == nil {
		t.Fatal("expected a persist error")
	}
	if err := s.setPassword(context.Background(), "viewer", "viewer-new-pw-1"); err == nil {
		t.Fatal("expected a persist error")
	}
	if len(s.listUsers()) != before || !signsIn(t, s, "viewer", viewerPW) {
		t.Error("a failed write must leave the in-memory users unchanged")
	}
}

// onChange runs after each committed edit that can change entitlement, outside
// the store's lock (it reads the store here, which would deadlock inside),
// and not after a refused or failed one.
func TestStore_OnChangeFiresAfterACommittedEdit(t *testing.T) {
	s := newStoreWithFixtures(t)
	n := 0
	s.onChange = func() {
		n++
		_ = s.listConnections()
	}
	ctx := context.Background()
	b3 := connRec{Broker: "b3", Hostname: "host3"}
	for i, edit := range []func() error{
		func() error { _, err := s.upsertUser(ctx, userRec{Username: "bob"}, "bob-password-1"); return err },
		func() error { _, err := s.deleteUser("bob"); return err },
		func() error { return s.upsertConnection(b3) },
		func() error { _, err := s.deleteConnection("b3"); return err },
	} {
		if err := edit(); err != nil {
			t.Fatal(err)
		}
		if n != i+1 {
			t.Fatalf("edit %d: onChange ran %d times", i, n)
		}
	}
	if _, err := s.deleteUser("admin"); !errors.Is(err, errLastAdmin) {
		t.Fatalf("want errLastAdmin, got %v", err)
	}
	blockWrites(t, &s.connsPath)
	if err := s.upsertConnection(b3); err == nil {
		t.Fatal("expected a persist error")
	}
	if n != 4 {
		t.Errorf("a refused or failed edit must not run onChange (%d runs)", n)
	}
}

func TestStore_SetPassword(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	s.users[0].MustChangePassword = true
	if err := s.setPassword(context.Background(), "admin", "admin-new-pw-1"); err != nil {
		t.Fatal(err)
	}
	mustChange, ok, _ := s.checkPassword(context.Background(), "admin", "admin-new-pw-1")
	if !ok || mustChange {
		t.Errorf("new password must work and clear the change flag: ok=%v mustChange=%v", ok, mustChange)
	}
	if !signsIn(t, f.load(t), "admin", "admin-new-pw-1") {
		t.Error("the change must persist")
	}
	if err := s.setPassword(context.Background(), "ghost", "ghost-password"); !errors.Is(err, errUserNotFound) {
		t.Errorf("unknown user: want errUserNotFound, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.hasher = &hasher{iter: 1, slots: make(chan struct{}, 1)}
	s.hasher.slots <- struct{}{}
	if err := s.setPassword(ctx, "admin", "admin-other-pw"); !errors.Is(err, context.Canceled) {
		t.Errorf("hash failure: want context.Canceled, got %v", err)
	}
}

func TestStore_DeleteUser(t *testing.T) {
	s := newStoreWithFixtures(t)
	found, err := s.deleteUser("viewer")
	if err != nil || !found {
		t.Fatalf("delete viewer: found=%v err=%v", found, err)
	}
	if signsIn(t, s, "viewer", viewerPW) {
		t.Error("deleted user must not sign in")
	}
	found, err = s.deleteUser("ghost")
	if err != nil || found {
		t.Errorf("deleting unknown user: want found=false err=nil, got found=%v err=%v", found, err)
	}
}

func TestStore_DeleteUser_LastAdmin(t *testing.T) {
	s := newStoreWithFixtures(t) // admin is the only admin
	if _, err := s.deleteUser("admin"); !errors.Is(err, errLastAdmin) {
		t.Fatalf("deleting the last admin must return errLastAdmin, got %v", err)
	}
	if _, err := s.upsertUser(context.Background(), userRec{Username: "admin2", Admin: true}, "admin2-password"); err != nil {
		t.Fatal(err)
	}
	if found, err := s.deleteUser("admin"); err != nil || !found {
		t.Fatalf("deleting a non-last admin must succeed, got found=%v err=%v", found, err)
	}
}

func TestStore_DeleteUser_PersistError(t *testing.T) {
	s := newStoreWithFixtures(t)
	blockWrites(t, &s.usersPath)
	if _, err := s.deleteUser("viewer"); err == nil {
		t.Fatal("expected a persist error")
	}
	if !signsIn(t, s, "viewer", viewerPW) {
		t.Error("a failed delete must leave the user in place")
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
		Semp: sempRec{Port: "1943", Username: "mon", Password: ""}, // blank -> keep semp-b1-pw
		Client: clientRec{Port: "1443", MsgVpns: []vpnRec{
			{Name: "v1", Username: "u1", Password: ""},           // blank + match -> keep cli-b1v1-pw
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
	if b1.Semp.Password != "semp-b1-pw" {
		t.Errorf("blank semp password must be kept, got %q", b1.Semp.Password)
	}
	got := map[string]string{}
	for _, v := range b1.Client.MsgVpns {
		got[v.Name] = v.Password
	}
	if got["v1"] != "cli-b1v1-pw" || got["v2"] != "V1:changed" || got["vX"] != "" {
		t.Errorf("VPN secrets: want keep/replace/blank, got %v", got)
	}
}

func TestStore_UpsertConnection_EditReplacesSemp(t *testing.T) {
	s := newStoreWithFixtures(t)
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
	if found, _ = s.deleteConnection("nope"); found {
		t.Error("deleting an unknown broker must return found=false")
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
			_, _ = s.upsertUser(context.Background(), userRec{Username: fmt.Sprintf("u%d", n)}, "racer-password")
			s.listConnections()
		}(i)
	}
	wg.Wait()
}

// An import replaces whole lists. The store still refuses a list that breaks
// its rules, and keeps what it had, in memory and on disk.
func TestStore_ReplaceRefusesAnInvalidList(t *testing.T) {
	f := newStoreFixture(t)
	s := f.load(t)
	usersBefore, connsBefore := len(s.users), len(s.conns)
	usersFile, _ := os.ReadFile(f.usersPath)
	connsFile, _ := os.ReadFile(f.connsPath)

	if _, err := s.replaceUsers(append(append([]userRec{}, s.users...), s.users[0])); err == nil || !strings.Contains(err.Error(), "appears more than once") {
		t.Errorf("replaceUsers with a duplicate: want a refusal, got %v", err)
	}
	if err := s.replaceConnections(append(append([]connRec{}, s.conns...), s.conns[0])); err == nil || !strings.Contains(err.Error(), "appears more than once") {
		t.Errorf("replaceConnections with a duplicate: want a refusal, got %v", err)
	}
	if len(s.users) != usersBefore || len(s.conns) != connsBefore {
		t.Error("a refused replace changed the store in memory")
	}
	if now, _ := os.ReadFile(f.usersPath); !bytes.Equal(now, usersFile) {
		t.Error("a refused replace rewrote the users file")
	}
	if now, _ := os.ReadFile(f.connsPath); !bytes.Equal(now, connsFile) {
		t.Error("a refused replace rewrote the connections file")
	}
}
