package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

const testPassphrase = "correct horse battery"

// sampleBackup is a small but complete backup document.
func sampleBackup(t *testing.T, h *hasher) backupDoc {
	t.Helper()
	modules := []string{"queue-browser"}
	return backupDoc{
		Version: backupVersion, Created: "2026-11-09T02:00:00Z", Gateway: "v-test",
		Users: []userRec{
			{Username: "admin", Password: mustHash(t, h, adminPW), Admin: true, Operate: []permRow{{Brokers: "*", MsgVpns: "*", Queues: "*"}}, ReadOnly: []permRow{}},
			{Username: "viewer", Password: mustHash(t, h, viewerPW), Operate: []permRow{}, ReadOnly: []permRow{{Brokers: "b1", MsgVpns: "v1", Queues: "*"}}, Modules: &modules},
		},
		Connections: []connRec{{Broker: "b1", Hostname: "host1",
			Semp:   sempRec{Port: "1943", Username: "mon", Password: "semp-b1-pw"},
			Client: clientRec{Port: "1443", MsgVpns: []vpnRec{{Name: "v1", Username: "u1", Password: "cli-b1v1-pw"}}}}},
		Settings: withHostPaths(fileConfigFromConfig(defaultConfig()), fileConfig{}),
	}
}

func sealed(t *testing.T, h *hasher, doc backupDoc, pass string) []byte {
	t.Helper()
	k, err := newBackupKey(context.Background(), h, pass)
	if err != nil {
		t.Fatal(err)
	}
	data, err := sealBackup(k, doc)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func envelope(t *testing.T, data []byte) backupEnvelope {
	t.Helper()
	var env backupEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		t.Fatal(err)
	}
	return env
}

func reseal(t *testing.T, env backupEnvelope) []byte {
	t.Helper()
	data, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func wantProblem(t *testing.T, err error, want *backupProblem) {
	t.Helper()
	var p *backupProblem
	if !errors.As(err, &p) || p.field != want.field || p.reason != want.reason {
		t.Fatalf("want %v, got %v", want, err)
	}
}

// ----- format --------------------------------------------------------------------------

func TestBackup_SealsAndOpensWithThePassphrase(t *testing.T) {
	h := testHasher(t)
	doc := sampleBackup(t, h)
	data := sealed(t, h, doc, testPassphrase)
	if strings.Contains(string(data), "semp-b1-pw") || strings.Contains(string(data), "host1") {
		t.Fatal("a backup must not carry the configuration in clear")
	}
	env := envelope(t, data)
	if env.Format != backupFormat || env.Version != backupVersion || env.KDF.Name != backupKDFName || env.KDF.Iter != h.iter {
		t.Fatalf("envelope: %+v", env)
	}
	got, err := openBackup(context.Background(), h, data, testPassphrase)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, doc) {
		t.Fatalf("round trip:\nwant %+v\ngot  %+v", doc, got)
	}
}

func TestBackup_PassphraseRule(t *testing.T) {
	h := testHasher(t)
	if _, err := newBackupKey(context.Background(), h, "too short"); err != errPassRule {
		t.Fatalf("export: want the rule, got %v", err)
	}
	data := sealed(t, h, sampleBackup(t, h), testPassphrase)
	if _, err := openBackup(context.Background(), h, data, ""); err != errPassRule {
		t.Fatalf("import: want the rule, got %v", err)
	}
	if _, err := openBackup(context.Background(), h, data, "another passphrase"); err != errWrongPass {
		t.Fatalf("want the wrong passphrase, got %v", err)
	}
}

func TestBackup_RefusesWhatItCannotOpen(t *testing.T) {
	h := testHasher(t)
	good := envelope(t, sealed(t, h, sampleBackup(t, h), testPassphrase))
	usersFile := base64.StdEncoding.EncodeToString(mustSealer(t).seal(roleUsers, []byte("msg-utility-users: []")))
	edit := func(f func(*backupEnvelope)) []byte {
		env := good
		f(&env)
		return reseal(t, env)
	}
	flip := func(s string) string {
		b, _ := base64.StdEncoding.DecodeString(s)
		b[len(b)-1] ^= 1
		return base64.StdEncoding.EncodeToString(b)
	}
	cases := []struct {
		name string
		data []byte
		want *backupProblem
	}{
		{"not JSON", []byte("users: []"), errNotBackup},
		{"unknown key", []byte(`{"format":"smu-backup","extra":1}`), errNotBackup},
		{"another format", edit(func(e *backupEnvelope) { e.Format = "zip" }), errNotBackup},
		{"another kdf", edit(func(e *backupEnvelope) { e.KDF.Name = "scrypt" }), errDamaged},
		{"no iterations", edit(func(e *backupEnvelope) { e.KDF.Iter = 0 }), errDamaged},
		{"too many iterations", edit(func(e *backupEnvelope) { e.KDF.Iter = passwordMaxIter + 1 }), errDamaged},
		{"salt not base64", edit(func(e *backupEnvelope) { e.KDF.Salt = "!" }), errDamaged},
		{"short salt", edit(func(e *backupEnvelope) { e.KDF.Salt = "AAAA" }), errDamaged},
		{"data not base64", edit(func(e *backupEnvelope) { e.Data = "!" }), errDamaged},
		{"a store file's data", edit(func(e *backupEnvelope) { e.Data = usersFile }), errDamaged},
		{"tampered data", edit(func(e *backupEnvelope) { e.Data = flip(e.Data) }), errWrongPass},
		{"tampered iterations", edit(func(e *backupEnvelope) { e.KDF.Iter++ }), errWrongPass},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := openBackup(context.Background(), h, c.data, testPassphrase)
			wantProblem(t, err, c.want)
		})
	}
	_, err := openBackup(context.Background(), h, edit(func(e *backupEnvelope) { e.Version = 2 }), testPassphrase)
	wantProblem(t, err, &backupProblem{"file", "This backup has format version 2, which this gateway does not read."})
}

// A sealed document the gateway would not have written: the key opens it,
// the content is refused.
func TestBackup_RefusesContentItDoesNotRead(t *testing.T) {
	h := testHasher(t)
	for name, plain := range map[string]string{
		"a newer version": "version: 2\n",
		"an unknown key":  "version: 1\nextra: true\n",
		"not YAML":        "version: [\n",
	} {
		t.Run(name, func(t *testing.T) {
			k, err := newBackupKey(context.Background(), h, testPassphrase)
			if err != nil {
				t.Fatal(err)
			}
			sl, _ := newSealer(k.key)
			data := reseal(t, backupEnvelope{Format: backupFormat, Version: backupVersion,
				KDF:  backupKDF{Name: backupKDFName, Iter: k.iter, Salt: base64.StdEncoding.EncodeToString(k.salt)},
				Data: base64.StdEncoding.EncodeToString(sl.seal(roleBackup, []byte(plain)))})
			_, err = openBackup(context.Background(), h, data, testPassphrase)
			wantProblem(t, err, errDamaged)
		})
	}
}

// A request that goes away while waiting for a hashing slot is not a
// problem with the file: the error is the context's.
func TestBackup_GivesUpWhenTheRequestGoesAway(t *testing.T) {
	h, err := newHasher(1, 1)
	if err != nil {
		t.Fatal(err)
	}
	data := sealed(t, h, sampleBackup(t, h), testPassphrase)
	if err := h.acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer h.release()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := newBackupKey(ctx, h, testPassphrase); !errors.Is(err, context.Canceled) {
		t.Fatalf("export: want the context's error, got %v", err)
	}
	if _, err := openBackup(ctx, h, data, testPassphrase); !errors.Is(err, context.Canceled) {
		t.Fatalf("import: want the context's error, got %v", err)
	}
}

// The file both gateways must open: go-web-proxy/testdata/contract/backup.json,
// also read by tests/mock-broker/gateway/backup.test.ts.
func TestBackup_SharedVector(t *testing.T) {
	var vec struct {
		Passphrase string `json:"passphrase"`
		File       string `json:"file"`
		Expect     struct {
			Created     string   `json:"created"`
			Gateway     string   `json:"gateway"`
			Users       []string `json:"users"`
			Connections []string `json:"connections"`
			ConnModes   string   `json:"connModes"`
		} `json:"expect"`
	}
	data, err := os.ReadFile(filepath.Join("testdata", "contract", "backup.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &vec); err != nil {
		t.Fatal(err)
	}
	doc, err := openBackup(context.Background(), testHasher(t), []byte(vec.File), vec.Passphrase)
	if err != nil {
		t.Fatal(err)
	}
	names := func(n int, name func(int) string) []string {
		out := []string{}
		for i := range n {
			out = append(out, name(i))
		}
		return out
	}
	got := []any{doc.Created, doc.Gateway,
		names(len(doc.Users), func(i int) string { return doc.Users[i].Username }),
		names(len(doc.Connections), func(i int) string { return doc.Connections[i].Broker }),
		doc.Settings.ConnModes}
	want := []any{vec.Expect.Created, vec.Expect.Gateway, vec.Expect.Users, vec.Expect.Connections, vec.Expect.ConnModes}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("want %v, got %v", want, got)
	}
	if err := validateUsers(doc.Users); err != nil {
		t.Fatalf("the vector's users must load: %v", err)
	}
	if err := validateConns(doc.Connections); err != nil {
		t.Fatalf("the vector's connections must load: %v", err)
	}
}

func mustSealer(t *testing.T) *sealer {
	t.Helper()
	key, _ := parseStoreKey([]byte(testStoreKeyHex))
	sl, err := newSealer(key)
	if err != nil {
		t.Fatal(err)
	}
	return sl
}

// withHostPaths must cover exactly the keys restartOnlyKeys marks host-only.
func TestBackup_WithHostPathsCoversTheHostOnlyKeys(t *testing.T) {
	appDir := "/old"
	a := fileConfigFromConfig(defaultConfig())
	a.RemovedAppDir, a.RemovedUsersFile, a.RemovedConnectionsFile = &appDir, &appDir, &appDir
	b := a.clone()
	b.TLS.CertFile, b.TLS.KeyFile, b.TLS.TrustDir = "/h/c", "/h/k", "/h/t"
	b.Hosted, b.TLS.InsecureSkipVerify = !a.Hosted, !a.TLS.InsecureSkipVerify
	got := withHostPaths(a, b)
	for _, k := range restartOnlyKeys {
		want := a
		if k.hostOnly {
			want = b
		}
		if k.value(got) != k.value(want) {
			t.Errorf("%s: want %v, got %v", k.key, k.value(want), k.value(got))
		}
	}
	if got.RemovedAppDir != nil || got.RemovedUsersFile != nil || got.RemovedConnectionsFile != nil {
		t.Error("an export or import never carries the removed appDir, usersFile or connectionsFile keys")
	}
}

// ----- import planning ------------------------------------------------------------------

// The rev is the store's stamp, not part of what a backup says: a backup of
// the gateway as it stands previews as no change whatever the revs are.
func TestBackup_DiffIgnoresRev(t *testing.T) {
	u := userRec{Username: "ops", Password: "h", Rev: 3, Operate: []permRow{}, ReadOnly: []permRow{}}
	moved := u
	moved.Rev = 9
	c := connRec{Broker: "b1", Hostname: "host1", Rev: 2}
	cMoved := c
	cMoved.Rev = 7
	none := nameDiff{Added: []string{}, Changed: []string{}, Removed: []string{}}
	if got := diffByName([]userRec{u}, []userRec{moved}, userName); !reflect.DeepEqual(got, none) {
		t.Errorf("users differing in rev only: %+v", got)
	}
	if got := diffByName([]connRec{c}, []connRec{cMoved}, connName); !reflect.DeepEqual(got, none) {
		t.Errorf("connections differing in rev only: %+v", got)
	}
	moved.Admin = true
	if got := diffByName([]userRec{u}, []userRec{moved}, userName); len(got.Changed) != 1 {
		t.Errorf("a real change still shows: %+v", got)
	}
	if !sameRecord("a", "a") || sameRecord("a", "b") {
		t.Error("anything else compares as it is")
	}
}

func TestBackup_DiffMergeAndSessionEnders(t *testing.T) {
	u := func(name, pw string, admin bool) userRec {
		return userRec{Username: name, Password: pw, Admin: admin, Operate: []permRow{}, ReadOnly: []permRow{}}
	}
	cur := []userRec{u("admin", "h1", true), u("ops", "h2", false), u("gone", "h3", false), u("same", "h4", false)}
	file := []userRec{u("admin", "h1", false), u("ops", "h2", false), u("new", "h5", false), u("same", "h4-new", false)}
	file[1].Operate = []permRow{{Brokers: "b1", MsgVpns: "*", Queues: "*"}}

	if got, want := diffByName(cur, file, userName), (nameDiff{Added: []string{"new"}, Changed: []string{"admin", "ops", "same"}, Removed: []string{"gone"}}); !reflect.DeepEqual(got, want) {
		t.Fatalf("diff: want %+v, got %+v", want, got)
	}
	merged := mergeByName(cur, file, userName)
	if got := userNames(merged); !reflect.DeepEqual(got, []string{"admin", "ops", "gone", "same", "new"}) {
		t.Fatalf("merge keeps the rest and appends the new: %v", got)
	}
	if merged[1].Operate[0].Brokers != "b1" || len(cur[1].Operate) != 0 {
		t.Fatal("merge takes the file's record and leaves cur alone")
	}
	// The admin flag and the password hash end sessions; a changed grant does
	// not (the sockets re-check it); a removed user always does.
	if got := sessionEnders(cur, file); !reflect.DeepEqual(got, []string{"admin", "gone", "same"}) {
		t.Fatalf("replace ends: %v", got)
	}
	if got := sessionEnders(cur, merged); !reflect.DeepEqual(got, []string{"admin", "same"}) {
		t.Fatalf("merge ends: %v", got)
	}
}

func userNames(users []userRec) []string {
	out := []string{}
	for _, u := range users {
		out = append(out, u.Username)
	}
	return out
}

func TestBackup_SettingsChangesNamesDottedKeysAndSkipsHostPaths(t *testing.T) {
	cur := fileConfigFromConfig(defaultConfig())
	next := cur.clone()
	next.Session.IdleMinutes++
	next.Access.Allow = []string{"10.0.0.0/8"}
	next.TLS.CertFile = "/elsewhere/tls.crt"
	next.TLS.InsecureSkipVerify = true
	if got := settingsChanges(cur, next); !reflect.DeepEqual(got, []string{"access.allow", "session.idleMinutes", "tls.insecureSkipVerify"}) {
		t.Fatalf("got %v", got)
	}
	if got := settingsChanges(cur, cur.clone()); len(got) != 0 {
		t.Fatalf("no change lists nothing: %v", got)
	}
	// A backup that leaves a list unset (null, or the key absent) holds it
	// empty, as config.yaml does: not a change.
	unset := cur.clone()
	unset.Access.Allow, unset.Access.TrustedProxies = nil, nil
	if got := settingsChanges(cur, unset); len(got) != 0 {
		t.Fatalf("an unset list is an empty one: %v", got)
	}
}

// ----- schedule ------------------------------------------------------------------------

func TestBackup_ScheduleProblem(t *testing.T) {
	ok := []backupSchedule{
		{Kind: scheduleHourly, Minute: 59},
		{Kind: scheduleDaily, Hour: 23, Minute: 0},
		{Kind: scheduleWeekly, Weekday: 6, Hour: 2},
		{Kind: scheduleMonthly, Day: 31, Hour: 2},
	}
	for _, s := range ok {
		if p := s.problem(); p != "" {
			t.Errorf("%+v: %s", s, p)
		}
	}
	bad := map[string]backupSchedule{
		"no kind":              {},
		"unknown kind":         {Kind: "yearly"},
		"minute 60":            {Kind: scheduleHourly, Minute: 60},
		"negative minute":      {Kind: scheduleDaily, Minute: -1},
		"hour 24":              {Kind: scheduleDaily, Hour: 24},
		"hourly with an hour":  {Kind: scheduleHourly, Hour: 2},
		"weekday 7":            {Kind: scheduleWeekly, Weekday: 7},
		"daily with a weekday": {Kind: scheduleDaily, Weekday: 1},
		"monthly with no day":  {Kind: scheduleMonthly},
		"day 32":               {Kind: scheduleMonthly, Day: 32},
		"weekly with a day":    {Kind: scheduleWeekly, Day: 3},
	}
	for name, s := range bad {
		if s.problem() == "" {
			t.Errorf("%s: want a problem", name)
		}
	}
}

func TestBackup_NextRun(t *testing.T) {
	at := func(s string) time.Time {
		t.Helper()
		v, err := time.Parse(time.RFC3339, s)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	cases := []struct {
		now  string
		s    backupSchedule
		want string
	}{
		{"2026-11-09T09:10:00Z", backupSchedule{Kind: scheduleHourly, Minute: 30}, "2026-11-09T09:30:00Z"},
		{"2026-11-09T09:30:00Z", backupSchedule{Kind: scheduleHourly, Minute: 30}, "2026-11-09T10:30:00Z"}, // on the minute: the next slot
		{"2026-12-31T23:45:00Z", backupSchedule{Kind: scheduleHourly, Minute: 15}, "2027-01-01T00:15:00Z"},
		{"2026-11-09T01:00:00Z", backupSchedule{Kind: scheduleDaily, Hour: 2}, "2026-11-09T02:00:00Z"},
		{"2026-11-09T02:00:00Z", backupSchedule{Kind: scheduleDaily, Hour: 2}, "2026-11-10T02:00:00Z"},
		{"2026-12-31T23:59:00Z", backupSchedule{Kind: scheduleDaily, Hour: 0, Minute: 30}, "2027-01-01T00:30:00Z"},
		{"2026-11-09T09:00:00Z", backupSchedule{Kind: scheduleWeekly, Weekday: 1, Hour: 10}, "2026-11-09T10:00:00Z"}, // a Monday, later today
		{"2026-11-09T11:00:00Z", backupSchedule{Kind: scheduleWeekly, Weekday: 1, Hour: 10}, "2026-11-16T10:00:00Z"},
		{"2026-11-09T11:00:00Z", backupSchedule{Kind: scheduleWeekly, Weekday: 0, Hour: 3}, "2026-11-15T03:00:00Z"},
		{"2026-11-09T11:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 15, Hour: 2}, "2026-11-15T02:00:00Z"},
		{"2026-11-20T00:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 15, Hour: 2}, "2026-12-15T02:00:00Z"},
		{"2026-12-20T00:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 1}, "2027-01-01T00:00:00Z"},
		{"2027-02-01T00:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 31, Hour: 2}, "2027-02-28T02:00:00Z"}, // a short month: its last day
		{"2028-02-01T00:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 30}, "2028-02-29T00:00:00Z"},          // leap year
		{"2026-04-30T03:00:00Z", backupSchedule{Kind: scheduleMonthly, Day: 31, Hour: 2}, "2026-05-31T02:00:00Z"}, // April's slot has passed
	}
	for _, c := range cases {
		// The answer is in UTC whatever zone now is in.
		now := at(c.now).In(time.FixedZone("UTC+8", 8*3600))
		if got := nextRun(now, c.s); !got.Equal(at(c.want)) || got.Location() != time.UTC {
			t.Errorf("%s %+v: want %s, got %s", c.now, c.s, c.want, got)
		}
	}
}

func TestBackup_ScheduleDocProblem(t *testing.T) {
	good := scheduleDoc{Schedule: backupSchedule{Kind: scheduleDaily}, Keep: 7, Iter: 1,
		Salt: base64.StdEncoding.EncodeToString(make([]byte, 16)), Key: base64.StdEncoding.EncodeToString(make([]byte, 32))}
	if p := good.problem(); p != "" {
		t.Fatal(p)
	}
	for name, f := range map[string]func(*scheduleDoc){
		"bad schedule":  func(d *scheduleDoc) { d.Schedule.Kind = "" },
		"keep 0":        func(d *scheduleDoc) { d.Keep = 0 },
		"keep too many": func(d *scheduleDoc) { d.Keep = backupKeepMax + 1 },
		"salt garbage":  func(d *scheduleDoc) { d.Salt = "!" },
		"key garbage":   func(d *scheduleDoc) { d.Key = "!" },
		"short key":     func(d *scheduleDoc) { d.Key = "AAAA" },
		"no iterations": func(d *scheduleDoc) { d.Iter = 0 },
	} {
		d := good
		f(&d)
		if d.problem() == "" {
			t.Errorf("%s: want a problem", name)
		}
	}
}

// ----- service ---------------------------------------------------------------------------

// lockedClock is a fake clock the scheduler goroutine and the test share.
type lockedClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *lockedClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *lockedClock) set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = t
}

type backupFixture struct {
	f     storeFixture
	b     *backupService
	clock *lockedClock
	log   *strings.Builder
	dir   string
}

func newBackupFixture(t *testing.T) backupFixture {
	t.Helper()
	f := newStoreFixture(t)
	return backupFixtureFrom(t, f)
}

func backupFixtureFrom(t *testing.T, f storeFixture) backupFixture {
	t.Helper()
	opts := f.opts(noEnv)
	opts.schedulePath = filepath.Join(filepath.Dir(f.usersPath), scheduleFileName)
	st, err := loadStore(opts, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	cfg := defaultConfig()
	cfg.usersFile, cfg.connectionsFile = f.usersPath, f.connsPath
	cfgPath := filepath.Join(filepath.Dir(f.usersPath), "config.yaml")
	data, err := seedConfigFile(cfgPath, cfg)
	if err != nil {
		t.Fatal(err)
	}
	log := &strings.Builder{}
	logger := newCapturingLogger(log)
	clock := &lockedClock{t: time.Date(2026, 11, 9, 9, 0, 0, 0, time.UTC)}
	dir := filepath.Join(filepath.Dir(f.usersPath), "backup")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	b, err := newBackupService(dir, opts.schedulePath, st, newSettingsFile(configSource{path: cfgPath, data: data}, cfg, newLive(cfg), st.wr, logger), f.h, clock.now, logger)
	if err != nil {
		t.Fatal(err)
	}
	return backupFixture{f: f, b: b, clock: clock, log: log, dir: dir}
}

var daily2 = backupSchedule{Kind: scheduleDaily, Hour: 2}

// schedule saves daily2 at the rev the service holds now (0 creates).
func (x backupFixture) schedule(t *testing.T, keep int) {
	t.Helper()
	_, rev := x.b.scheduleWithRev()
	if _, err := x.b.setSchedule(context.Background(), "", daily2, keep, testPassphrase, rev); err != nil {
		t.Fatal(err)
	}
}

// scheduleOnDisk is backup.yaml decrypted.
func (x backupFixture) scheduleOnDisk(t *testing.T) scheduleFile {
	t.Helper()
	var f scheduleFile
	if err := x.f.sealer(t).readDoc(roleSchedule, x.b.schedulePath, &f); err != nil {
		t.Fatal(err)
	}
	return f
}

func (x backupFixture) files(t *testing.T) []string {
	t.Helper()
	files, err := x.b.list()
	if err != nil {
		t.Fatal(err)
	}
	out := []string{}
	for _, f := range files {
		out = append(out, f.Name)
	}
	return out
}

func TestBackupService_ScheduleIsSealedAndSurvivesARestart(t *testing.T) {
	x := newBackupFixture(t)
	ctx := context.Background()
	if x.b.schedule() != nil {
		t.Fatal("no schedule on a fresh volume")
	}
	if _, err := x.b.setSchedule(ctx, "", daily2, 7, "", 0); err == nil || !strings.Contains(err.Error(), "needs a passphrase") {
		t.Fatalf("a new schedule needs a passphrase, got %v", err)
	}
	if _, err := x.b.setSchedule(ctx, "", daily2, 7, "short", 0); err != errPassRule {
		t.Fatalf("want the rule, got %v", err)
	}
	x.schedule(t, 7)
	raw, err := os.ReadFile(x.b.schedulePath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(raw), storeMagic) || strings.Contains(string(raw), "daily") {
		t.Fatal("the schedule file must be sealed")
	}
	key := x.b.schedule().Key

	// An edit without a passphrase keeps the key.
	weekly := backupSchedule{Kind: scheduleWeekly, Weekday: 1, Hour: 3}
	if rev, err := x.b.setSchedule(ctx, "", weekly, 3, "", 1); err != nil || rev != 2 {
		t.Fatalf("edit: rev %d, %v", rev, err)
	}
	if got := x.b.schedule(); got.Key != key || got.Keep != 3 || got.Schedule != weekly {
		t.Fatalf("edit: %+v", got)
	}
	// A restart reads it back, with its rev.
	y := backupFixtureFrom(t, x.f)
	if got, rev := y.b.scheduleWithRev(); got == nil || got.Key != key || got.Schedule != weekly || rev != 2 {
		t.Fatalf("after a restart: %+v rev %d", got, rev)
	}
	// A new passphrase makes a new key.
	if _, err := x.b.setSchedule(ctx, "", weekly, 3, "another passphrase", 2); err != nil {
		t.Fatal(err)
	}
	if x.b.schedule().Key == key {
		t.Fatal("a new passphrase must derive a new key")
	}
}

// The schedule's rev is backup.yaml's seq: it moves on every save and every
// delete, a delete keeps the file with the counter and no schedule, and a
// schedule created afterwards gets a rev nobody holds.
func TestBackupService_RevIsTheSeqAndADeleteKeepsTheCounter(t *testing.T) {
	x := newBackupFixture(t)
	ctx := context.Background()
	if sd, rev := x.b.scheduleWithRev(); sd != nil || rev != 0 {
		t.Fatalf("no schedule is rev 0: %v %d", sd, rev)
	}
	if _, err := os.Stat(x.b.schedulePath); !errors.Is(err, fs.ErrNotExist) {
		t.Fatal("nothing is written before the first save")
	}
	if rev, err := x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 0); err != nil || rev != 1 {
		t.Fatalf("create: rev %d, %v", rev, err)
	}
	if f := x.scheduleOnDisk(t); f.Seq != 1 || f.Schedule == nil || *f.Schedule != daily2 || f.Keep != 7 {
		t.Fatalf("the file holds the seq and the schedule: %+v", f)
	}
	if seq, err := x.b.removeSchedule(ctx, "", 1); err != nil || seq != 2 {
		t.Fatalf("remove: seq %d, %v", seq, err)
	}
	if sd, rev := x.b.scheduleWithRev(); sd != nil || rev != 0 || x.b.schedule() != nil {
		t.Fatalf("after a delete the schedule is gone and the rev is 0: %v %d", sd, rev)
	}
	f := x.scheduleOnDisk(t)
	if f.Seq != 2 || f.Schedule != nil || f.Key != "" || f.Keep != 0 {
		t.Fatalf("the file stays with the counter and no schedule: %+v", f)
	}
	// A restart agrees: no schedule, and the counter goes on.
	y := backupFixtureFrom(t, x.f)
	if sd, rev := y.b.scheduleWithRev(); sd != nil || rev != 0 {
		t.Fatalf("after a restart: %v %d", sd, rev)
	}
	if rev, err := y.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 0); err != nil || rev != 3 {
		t.Fatalf("a re-created schedule gets a new rev, never a reused one: rev %d, %v", rev, err)
	}
}

// Every refusal of a schedule save or delete, with nothing written and the
// service as it was.
func TestBackupService_ScheduleRefusals(t *testing.T) {
	x := newBackupFixture(t)
	ctx := context.Background()
	expectNone := func(step string, err, want error) {
		t.Helper()
		if !errors.Is(err, want) {
			t.Fatalf("%s: want %v, got %v", step, want, err)
		}
	}
	_, err := x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, -1)
	expectNone("a negative rev", err, errRevRequired)
	_, err = x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 3)
	expectNone("rev above 0 and no schedule", err, errNotFound)
	_, err = x.b.removeSchedule(ctx, "", 0)
	expectNone("delete without a rev", err, errRevRequired)
	_, err = x.b.removeSchedule(ctx, "", 1)
	expectNone("delete with no schedule", err, errNotFound)
	if _, statErr := os.Stat(x.b.schedulePath); !errors.Is(statErr, fs.ErrNotExist) {
		t.Fatal("a refusal writes nothing")
	}

	x.schedule(t, 7)
	before, _ := os.ReadFile(x.b.schedulePath)
	_, err = x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 0)
	expectNone("rev 0 and a schedule", err, errExists)
	var stale *staleError
	_, err = x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 5)
	if !errors.As(err, &stale) || stale.rev != 1 {
		t.Fatalf("a moved rev is stale and names the current one: %v", err)
	}
	_, err = x.b.removeSchedule(ctx, "", 5)
	if !errors.As(err, &stale) || stale.rev != 1 {
		t.Fatalf("delete with a moved rev: %v", err)
	}
	_, err = x.b.setSchedule(ctx, "nobody", daily2, 7, testPassphrase, 1)
	expectNone("a caller who is gone", err, errCallerGone)
	_, err = x.b.removeSchedule(ctx, "viewer", 1)
	expectNone("a caller who is no administrator", err, errCallerNotAdmin)
	if after, _ := os.ReadFile(x.b.schedulePath); !bytes.Equal(after, before) {
		t.Fatal("a refusal writes nothing")
	}
	if _, rev := x.b.scheduleWithRev(); rev != 1 {
		t.Fatalf("a refusal moves nothing: rev %d", rev)
	}

	// A backup.yaml replaced outside the gateway is refused, and stays refused.
	writeFile(t, x.b.schedulePath, "replaced by hand")
	var disk *changedOnDiskError
	_, err = x.b.setSchedule(ctx, "", daily2, 7, testPassphrase, 1)
	if !errors.As(err, &disk) || disk.file != scheduleFileName {
		t.Fatalf("want store_changed_on_disk naming backup.yaml, got %v", err)
	}
	if _, err = x.b.removeSchedule(ctx, "", 1); !errors.As(err, &disk) {
		t.Fatalf("delete over a hand edit: %v", err)
	}
	if sd, _ := x.b.scheduleWithRev(); sd == nil {
		t.Fatal("memory keeps the schedule it holds")
	}
}

// A failed write leaves backup.yaml and the schedule in memory as they were.
func TestBackupService_FailedWriteChangesNothing(t *testing.T) {
	x := newBackupFixture(t)
	ctx := context.Background()
	x.b.store.wr.exit = func(code int) { t.Errorf("exit(%d): the rollback must succeed", code) }
	x.schedule(t, 7)
	before, _ := os.ReadFile(x.b.schedulePath)

	x.b.store.wr.hooks.rename = renameFailing(1)
	var failed *writeFailedError
	if _, err := x.b.setSchedule(ctx, "", daily2, 3, "", 1); !errors.As(err, &failed) {
		t.Fatalf("save: want a write that failed and changed nothing, got %v", err)
	}
	x.b.store.wr.hooks.rename = renameFailing(1)
	if _, err := x.b.removeSchedule(ctx, "", 1); !errors.As(err, &failed) {
		t.Fatalf("delete: want a write that failed and changed nothing, got %v", err)
	}
	x.b.store.wr.hooks.rename = nil
	if after, _ := os.ReadFile(x.b.schedulePath); !bytes.Equal(after, before) {
		t.Fatal("backup.yaml must be put back")
	}
	if sd, rev := x.b.scheduleWithRev(); sd == nil || sd.Keep != 7 || rev != 1 {
		t.Fatalf("memory must keep the schedule and its rev: %+v %d", sd, rev)
	}
	// The same save works once the disk does.
	if rev, err := x.b.setSchedule(ctx, "", daily2, 3, "", 1); err != nil || rev != 2 {
		t.Fatalf("retry: rev %d, %v", rev, err)
	}
}

// Two saves at once leave the file and the memory equal: the schedule one of
// them wrote, the seq it stamped.
func TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(t *testing.T) {
	for _, edit := range []bool{false, true} {
		x := newBackupFixture(t)
		ctx := context.Background()
		rev := 0
		if edit {
			x.schedule(t, 7)
			rev = 1
		}
		var wg sync.WaitGroup
		results := make([]error, 2)
		kept := []int{3, 4}
		for i := range results {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, results[i] = x.b.setSchedule(ctx, "", daily2, kept[i], testPassphrase, rev)
			}()
		}
		wg.Wait()
		wins, loser := 0, error(nil)
		for _, err := range results {
			if err == nil {
				wins++
			} else {
				loser = err
			}
		}
		var stale *staleError
		if wins != 1 || (!errors.Is(loser, errExists) && !errors.As(loser, &stale)) {
			t.Fatalf("edit=%v: exactly one save wins and the other is refused, got %v", edit, results)
		}
		sd, seq := x.b.scheduleWithRev()
		f := x.scheduleOnDisk(t)
		if sd == nil || f.Seq != seq || f.Schedule == nil || *f.Schedule != sd.Schedule || f.Keep != sd.Keep || f.Key != sd.Key {
			t.Fatalf("edit=%v: disk %+v and memory %+v rev %d must agree", edit, f, sd, seq)
		}
	}
}

// A backup reads the users and the connections as one committed state: an
// import that replaces both is seen whole or not at all.
func TestBackupService_SnapshotNeverSeesHalfAnImport(t *testing.T) {
	x := newBackupFixture(t)
	st := x.b.store
	admin := currentUser(t, st, "admin")
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for range 4 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
				}
				doc := x.b.snapshot()
				// Each import below names its users u<i> and its broker b<i>.
				var u, b string
				for _, r := range doc.Users {
					if strings.HasPrefix(r.Username, "u") {
						u = strings.TrimPrefix(r.Username, "u")
					}
				}
				for _, c := range doc.Connections {
					if strings.HasPrefix(c.Broker, "b") && len(c.Broker) > 2 {
						b = strings.TrimPrefix(c.Broker, "b")
					}
				}
				if u != b {
					t.Errorf("half an import: users %q, connections %q", u, b)
					return
				}
			}
		}()
	}
	for i := range 40 {
		n := strconv.Itoa(i + 10)
		users := &sectionImport[userRec]{recs: []userRec{admin, {Username: "u" + n, Password: admin.Password, Operate: []permRow{}, ReadOnly: []permRow{}}}}
		conns := &sectionImport[connRec]{recs: []connRec{{Broker: "b" + n, Hostname: "host" + n}}}
		if err := st.wr.Do(context.Background(), func(tx *txn) error {
			_, err := st.stageImport(tx, users, conns)
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	close(stop)
	wg.Wait()
}

func TestBackupService_LoadRefusesADamagedSchedule(t *testing.T) {
	x := newBackupFixture(t)
	writeFile(t, x.b.schedulePath, "not sealed")
	if _, err := newBackupService(x.dir, x.b.schedulePath, x.b.store, x.b.settings, x.f.h, x.clock.now, quietLogger()); err == nil || !strings.Contains(err.Error(), x.b.schedulePath) {
		t.Fatalf("want an error naming the file, got %v", err)
	}
	sched := daily2
	good := fileOfSchedule(1, &scheduleDoc{Schedule: sched, Keep: 7, Iter: 1,
		Salt: base64.StdEncoding.EncodeToString(make([]byte, 16)), Key: base64.StdEncoding.EncodeToString(make([]byte, 32))})
	for name, f := range map[string]func(*scheduleFile){
		"keep 0":                 func(f *scheduleFile) { f.Keep = 0 },
		"a seq of 0":             func(f *scheduleFile) { f.Seq = 0 },
		"a negative seq":         func(f *scheduleFile) { f.Seq = -1 },
		"a key and no schedule":  func(f *scheduleFile) { f.Schedule = nil },
		"a keep and no schedule": func(f *scheduleFile) { f.Schedule, f.Key, f.Salt, f.Iter = nil, "", "", 0 },
	} {
		doc := good
		f(&doc)
		if err := x.b.store.seal.writeDoc(roleSchedule, x.b.schedulePath, doc); err != nil {
			t.Fatal(err)
		}
		if _, err := newBackupService(x.dir, x.b.schedulePath, x.b.store, x.b.settings, x.f.h, x.clock.now, quietLogger()); err == nil || !strings.Contains(err.Error(), "delete it") {
			t.Errorf("%s: want the problem and what to do, got %v", name, err)
		}
	}
	// A counter with no schedule is what a delete leaves, and loads.
	if err := x.b.store.seal.writeDoc(roleSchedule, x.b.schedulePath, scheduleFile{Seq: 4}); err != nil {
		t.Fatal(err)
	}
	b, err := newBackupService(x.dir, x.b.schedulePath, x.b.store, x.b.settings, x.f.h, x.clock.now, quietLogger())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := b.setSchedule(context.Background(), "", daily2, 7, testPassphrase, 0); err != nil {
		t.Fatal(err)
	}
	if _, rev := b.scheduleWithRev(); rev != 5 {
		t.Fatalf("the counter goes on from the file: rev %d", rev)
	}
}

// A missing store key beside an existing schedule refuses to start, as
// beside a store: a new key could not open it.
func TestBackupService_MissingKeyBesideAScheduleRefusesToStart(t *testing.T) {
	f := bootstrapFixture(t)
	schedulePath := filepath.Join(filepath.Dir(f.usersPath), scheduleFileName)
	writeFile(t, schedulePath, "sealed with a lost key")
	opts := f.opts(noEnv)
	opts.schedulePath = schedulePath
	if _, err := loadStore(opts, quietLogger()); err == nil || !strings.Contains(err.Error(), schedulePath) {
		t.Fatalf("want a refusal naming the schedule, got %v", err)
	}
}

func TestBackupService_RunWritesOpensAndPrunes(t *testing.T) {
	x := newBackupFixture(t)
	if _, err := x.b.run(); err != errNoSched {
		t.Fatalf("no schedule: %v", err)
	}
	x.schedule(t, 2)
	// Files the gateway did not write are never touched.
	for _, foreign := range []string{"notes.txt", "smu-backup-latest.json"} {
		writeFile(t, filepath.Join(x.dir, foreign), "keep me")
	}
	if err := os.Mkdir(filepath.Join(x.dir, "smu-backup-20200101T000000Z.json"), 0o700); err != nil {
		t.Fatal(err)
	}
	var written []string
	for i := range 3 {
		x.clock.set(time.Date(2026, 11, 9, 2, i, 0, 0, time.UTC))
		name, err := x.b.run()
		if err != nil {
			t.Fatal(err)
		}
		written = append(written, name)
	}
	if want := []string{"smu-backup-20261109T020200Z.json", "smu-backup-20261109T020100Z.json"}; !reflect.DeepEqual(x.files(t), want) {
		t.Fatalf("keep 2, newest first: want %v, got %v", want, x.files(t))
	}
	for _, foreign := range []string{"notes.txt", "smu-backup-latest.json", "smu-backup-20200101T000000Z.json"} {
		if _, err := os.Stat(filepath.Join(x.dir, foreign)); err != nil {
			t.Errorf("%s must stay: %v", foreign, err)
		}
	}
	info, err := os.Stat(filepath.Join(x.dir, written[2]))
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Errorf("a backup is owner-only, got %v", info.Mode().Perm())
	}
	data, err := x.b.read(written[2])
	if err != nil {
		t.Fatal(err)
	}
	doc, err := openBackup(context.Background(), x.f.h, data, testPassphrase)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(userNames(doc.Users), []string{"admin", "viewer"}) || len(doc.Connections) != 2 || doc.Settings.TLS.CertFile != "" {
		t.Fatalf("content: %+v", doc)
	}
	if last := x.b.lastRun(); last.file != written[2] || last.err != "" {
		t.Fatalf("last run: %+v", last)
	}
	if !strings.Contains(x.log.String(), "backup written") {
		t.Fatal("a run is logged")
	}
}

func TestBackupService_RunFailures(t *testing.T) {
	x := newBackupFixture(t)
	x.schedule(t, 7)
	if _, err := x.b.run(); err != nil {
		t.Fatal(err)
	}
	// Twice in the same second.
	if _, err := x.b.run(); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("want already exists, got %v", err)
	}
	if last := x.b.lastRun(); last.file != "" || !strings.Contains(last.err, "already exists") {
		t.Fatalf("the failure is recorded: %+v", last)
	}
	// A directory that is a file.
	x.b.dir = filepath.Join(x.dir, "notes.txt")
	writeFile(t, x.b.dir, "x")
	x.clock.set(x.clock.now().Add(time.Second))
	if _, err := x.b.run(); err == nil || !strings.Contains(err.Error(), "cannot write") {
		t.Fatalf("want cannot write, got %v", err)
	}
	if !strings.Contains(x.log.String(), "backup failed") {
		t.Fatal("a failure is logged")
	}
}

func TestBackupService_RunRenamesThePartialAndDeletesStaleOnes(t *testing.T) {
	x := newBackupFixture(t)
	x.schedule(t, 7)
	// What stopped runs left, and look-alikes the gateway never writes.
	writeFile(t, filepath.Join(x.dir, "smu-backup-20261108T020000Z.partial"), "half a backup")
	for _, foreign := range []string{"notes.partial", "smu-backup-latest.partial"} {
		writeFile(t, filepath.Join(x.dir, foreign), "keep me")
	}
	if err := os.Mkdir(filepath.Join(x.dir, "smu-backup-20200101T000000Z.partial"), 0o700); err != nil {
		t.Fatal(err)
	}
	name, err := x.b.run()
	if err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(x.dir)
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, e := range entries {
		got = append(got, e.Name())
	}
	want := []string{"notes.partial", "smu-backup-20200101T000000Z.partial", name, "smu-backup-latest.partial"}
	if name != "smu-backup-20261109T090000Z.json" || !reflect.DeepEqual(got, want) {
		t.Fatalf("want %v, got %v (wrote %s)", want, got, name)
	}
	if !strings.Contains(x.log.String(), "deleted an unfinished backup") {
		t.Fatal("a deleted partial is logged")
	}
	// A partial the run cannot create leaves no backup.
	x.clock.set(x.clock.now().Add(time.Second))
	if err := os.Mkdir(filepath.Join(x.dir, "smu-backup-20261109T090001Z.partial"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := x.b.run(); err == nil || !strings.Contains(err.Error(), "cannot write") {
		t.Fatalf("want cannot write, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(x.dir, "smu-backup-20261109T090001Z.json")); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("no .json without a whole partial: %v", err)
	}
}

func TestBackupService_RunLogsAPartialItCannotDelete(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs Unix permissions and a non-root user")
	}
	x := newBackupFixture(t)
	x.schedule(t, 7)
	writeFile(t, filepath.Join(x.dir, "smu-backup-20261108T020000Z.partial"), "half a backup")
	if err := os.Chmod(x.dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(x.dir, 0o700)
	if _, err := x.b.run(); err == nil {
		t.Fatal("a read-only directory takes no backup")
	}
	if !strings.Contains(x.log.String(), "cannot delete an unfinished backup") {
		t.Fatal("want the failure logged")
	}
}

func TestBackupService_PruneSkipsAnUnreadableDirectory(t *testing.T) {
	x := newBackupFixture(t)
	x.b.dir = filepath.Join(x.dir, "missing")
	x.b.prune(1)
	if !strings.Contains(x.log.String(), "backup prune skipped") {
		t.Fatal("want the skip logged")
	}
}

func TestBackupService_PruneLogsAFileItCannotDelete(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs Unix permissions and a non-root user")
	}
	x := newBackupFixture(t)
	for _, n := range []string{"smu-backup-20261109T010000Z.json", "smu-backup-20261109T020000Z.json"} {
		writeFile(t, filepath.Join(x.dir, n), "x")
	}
	if err := os.Chmod(x.dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(x.dir, 0o700)
	x.b.prune(1)
	if !strings.Contains(x.log.String(), "cannot delete an old backup") {
		t.Fatal("want the failure logged")
	}
}

func TestBackupService_Read(t *testing.T) {
	x := newBackupFixture(t)
	for _, name := range []string{"../users.yaml", "smu-backup-20261109T020000Z.json"} {
		if _, err := x.b.read(name); !errors.Is(err, fs.ErrNotExist) {
			t.Errorf("%s: want not found, got %v", name, err)
		}
	}
	big := filepath.Join(x.dir, "smu-backup-20261109T030000Z.json")
	writeFile(t, big, strings.Repeat("x", maxStoreFile+1))
	if _, err := x.b.read(filepath.Base(big)); err != errNotBackup {
		t.Fatalf("an oversized file: %v", err)
	}
}

func TestBackupService_DirProblem(t *testing.T) {
	x := newBackupFixture(t)
	if p := x.b.dirProblem(); p != "" {
		t.Fatalf("a writable dir: %q", p)
	}
	if entries, _ := os.ReadDir(x.dir); len(entries) != 0 {
		t.Fatal("the probe leaves nothing behind")
	}
	x.b.dir = filepath.Join(x.dir, "missing")
	if p := x.b.dirProblem(); !strings.Contains(p, "does not exist. Mount a directory") {
		t.Fatalf("missing: %q", p)
	}
	x.b.dir = filepath.Join(x.dir, "file")
	writeFile(t, x.b.dir, "x")
	if p := x.b.dirProblem(); !strings.Contains(p, "is not a directory") {
		t.Fatalf("a file: %q", p)
	}
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		return
	}
	x.b.dir = filepath.Join(x.dir, "readonly")
	if err := os.Mkdir(x.b.dir, 0o500); err != nil {
		t.Fatal(err)
	}
	if p := x.b.dirProblem(); !strings.Contains(p, "is not writable (the gateway runs as uid 65532") {
		t.Fatalf("read-only: %q", p)
	}
	x.b.dir = filepath.Join(x.b.dir, "inner")
	if err := os.Chmod(filepath.Dir(x.b.dir), 0o000); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(filepath.Dir(x.b.dir), 0o700)
	if p := x.b.dirProblem(); !strings.HasPrefix(p, "Cannot read ") {
		t.Fatalf("unreadable: %q", p)
	}
}

// fakeAfter stands in for time.After: each wait is reported on calls, and the
// test wakes the loop by sending on fire.
type fakeAfter struct {
	calls chan time.Duration
	fire  chan time.Time
}

func (f *fakeAfter) after(d time.Duration) <-chan time.Time {
	f.calls <- d
	return f.fire
}

func (f *fakeAfter) next(t *testing.T) time.Duration {
	t.Helper()
	select {
	case d := <-f.calls:
		return d
	case <-time.After(5 * time.Second):
		t.Fatal("the loop did not wait")
		return 0
	}
}

func TestBackupService_LoopRunsOnScheduleAndStops(t *testing.T) {
	x := newBackupFixture(t)
	fa := &fakeAfter{calls: make(chan time.Duration, 1), fire: make(chan time.Time)}

	// No schedule: the loop sets no timer, and stops with its context.
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go x.b.loop(ctx, fa.after, done)
	cancel()
	<-done
	if len(fa.calls) != 0 {
		t.Fatal("no schedule, no timer")
	}

	// 09:00 to the next 10:30 is 90 minutes, waited in hour-long steps.
	if _, err := x.b.setSchedule(context.Background(), "", backupSchedule{Kind: scheduleDaily, Hour: 10, Minute: 30}, 7, testPassphrase, 0); err != nil {
		t.Fatal(err)
	}
	<-x.b.reset // the loop below starts with the schedule; no change to wake it for
	ctx, cancel = context.WithCancel(context.Background())
	done = make(chan struct{})
	go x.b.loop(ctx, fa.after, done)
	if d := fa.next(t); d != maxBackupSleep {
		t.Fatalf("want an hour-long step, got %v", d)
	}
	x.clock.set(time.Date(2026, 11, 9, 10, 0, 0, 0, time.UTC))
	fa.fire <- time.Time{}
	if d := fa.next(t); d != 30*time.Minute {
		t.Fatalf("an early wake waits for the rest: %v", d)
	}
	if len(x.files(t)) != 0 {
		t.Fatal("nothing runs before it is due")
	}
	// A late wake still runs the missed slot, then waits for tomorrow's.
	x.clock.set(time.Date(2026, 11, 9, 10, 31, 0, 0, time.UTC))
	fa.fire <- time.Time{}
	if d := fa.next(t); d != maxBackupSleep {
		t.Fatalf("after a run: %v", d)
	}
	if got := x.files(t); !reflect.DeepEqual(got, []string{"smu-backup-20261109T103100Z.json"}) {
		t.Fatalf("want one run, got %v", got)
	}
	// A schedule change recomputes the next run.
	if _, err := x.b.setSchedule(context.Background(), "", backupSchedule{Kind: scheduleHourly, Minute: 45}, 7, "", 1); err != nil {
		t.Fatal(err)
	}
	if d := fa.next(t); d != 14*time.Minute {
		t.Fatalf("after a change: %v", d)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the loop must stop when its context ends")
	}
}

// The schedule file round-trips through YAML with every field.
func TestBackup_ScheduleDocYAML(t *testing.T) {
	in := scheduleDoc{Schedule: backupSchedule{Kind: scheduleMonthly, Minute: 5, Hour: 4, Day: 31}, Keep: 9, Iter: 2, Salt: "c2FsdA==", Key: "a2V5"}
	data, err := yaml.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	var out scheduleDoc
	if err := yaml.Unmarshal(data, &out); err != nil || out != in {
		t.Fatalf("round trip: %+v %v", out, err)
	}
}
