package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

// The /managed/backup* routes over the managed gateway fixture (admin and
// viewer, brokers b1 and b2), its backup directory a temporary one.

func (e *managedEnv) admin() *http.Cookie { return e.cookie("admin", false) }

func (e *managedEnv) backupStatus(t *testing.T) backupStatusJSON {
	t.Helper()
	rec := e.do("GET", "/managed/backup", "", e.admin())
	expect(t, rec, http.StatusOK, "")
	var out backupStatusJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out
}

// exported is a backup file of the gateway as it stands, edited first.
func (e *managedEnv) exported(t *testing.T, edit func(*backupDoc)) string {
	t.Helper()
	doc := e.api.backups.snapshot()
	if edit != nil {
		edit(&doc)
	}
	return string(sealed(t, e.f.h, doc, testPassphrase))
}

func jsonBody(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func decodeTo[T any](t *testing.T, data []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("%v: %s", err, data)
	}
	return v
}

func expectInvalid(t *testing.T, rec interface{ Result() *http.Response }, field string) {
	t.Helper()
	res := rec.Result()
	var e apiError
	_ = json.NewDecoder(res.Body).Decode(&e)
	if res.StatusCode != http.StatusUnprocessableEntity || e.Error != "invalid" || e.Field != field || e.Reason == "" {
		t.Fatalf("want 422 invalid on %q with a reason, got %d %+v", field, res.StatusCode, e)
	}
}

func TestBackupAPI_AdminsOnly(t *testing.T) {
	e := newManagedEnv(t, nil)
	viewer := e.cookie("viewer", false)
	for _, r := range [][2]string{
		{"GET", "/managed/backup"}, {"GET", "/managed/backup/files/smu-backup-20261030T090000Z.json"},
		{"PUT", "/managed/backup/schedule"}, {"DELETE", "/managed/backup/schedule"},
		{"POST", "/managed/backup/run"}, {"POST", "/managed/backup/export"},
		{"POST", "/managed/backup/preview"}, {"POST", "/managed/backup/import"},
	} {
		expect(t, e.do(r[0], r[1], "{}", viewer), http.StatusForbidden, "forbidden")
	}
}

func TestBackupAPI_StatusWithNothingSet(t *testing.T) {
	e := newManagedEnv(t, nil)
	got := e.backupStatus(t)
	if want := (backupStatusJSON{Files: []backupFileInfo{}}); !reflect.DeepEqual(got, want) {
		t.Fatalf("want %+v, got %+v", want, got)
	}
	// A directory that is not there is reported, with what to do.
	e.api.backups.dir = filepath.Join(e.cfg.backupDir, "missing")
	if p := e.backupStatus(t).DirProblem; !strings.Contains(p, "Mount a directory") {
		t.Fatalf("dirProblem: %q", p)
	}
}

func TestBackupAPI_Schedule(t *testing.T) {
	e := newManagedEnv(t, nil)
	put := func(body any) *http.Response {
		return e.do("PUT", "/managed/backup/schedule", jsonBody(t, body), e.admin()).Result()
	}
	sched := map[string]any{"kind": "weekly", "minute": 15, "hour": 2, "weekday": 1, "day": 0, "keep": 14, "passphrase": testPassphrase}
	with := func(k string, v any) map[string]any {
		out := map[string]any{}
		for key, val := range sched {
			out[key] = val
		}
		out[k] = v
		return out
	}
	expectInvalid(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, with("kind", "yearly")), e.admin()), "schedule")
	expectInvalid(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, with("keep", 0)), e.admin()), "keep")
	expectInvalid(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, with("keep", backupKeepMax+1)), e.admin()), "keep")
	expectInvalid(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, with("passphrase", "")), e.admin()), "passphrase")
	expectInvalid(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, with("passphrase", "short")), e.admin()), "passphrase")
	expect(t, e.do("PUT", "/managed/backup/schedule", `{"kind":"daily","unknown":1}`, e.admin()), http.StatusBadRequest, "bad_request")

	if res := put(sched); res.StatusCode != http.StatusNoContent {
		t.Fatalf("save: %d", res.StatusCode)
	}
	got := e.backupStatus(t)
	want := backupScheduleJSON{backupSchedule: backupSchedule{Kind: scheduleWeekly, Minute: 15, Hour: 2, Weekday: 1}, Keep: 14}
	// The fixture clock is Friday 2026-10-30 09:00 UTC: the next Monday 02:15.
	if got.Schedule == nil || *got.Schedule != want || got.NextRun == nil || *got.NextRun != "2026-11-02T02:15:00Z" {
		t.Fatalf("status: %+v next %v", got.Schedule, got.NextRun)
	}
	if !strings.Contains(e.log.String(), "backup schedule saved") || strings.Contains(e.log.String(), testPassphrase) {
		t.Fatal("a save is logged, never with the passphrase")
	}
	// An edit without a passphrase keeps the key.
	if res := put(with("passphrase", "")); res.StatusCode != http.StatusNoContent {
		t.Fatalf("edit: %d", res.StatusCode)
	}

	expect(t, e.do("DELETE", "/managed/backup/schedule", "", e.admin()), http.StatusNoContent, "")
	expect(t, e.do("DELETE", "/managed/backup/schedule", "", e.admin()), http.StatusNotFound, "not_found")
	if e.backupStatus(t).Schedule != nil {
		t.Fatal("removed")
	}
}

func TestBackupAPI_ScheduleWriteFailureIsAServerError(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.api.backups.schedulePath = filepath.Join(e.f.usersPath, "nested") // under a file
	body := jsonBody(t, map[string]any{"kind": "daily", "keep": 1, "passphrase": testPassphrase})
	expect(t, e.do("PUT", "/managed/backup/schedule", body, e.admin()), http.StatusInternalServerError, "server_error")
}

func TestBackupAPI_RemoveFailureIsAServerError(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	e := newManagedEnv(t, nil)
	body := jsonBody(t, map[string]any{"kind": "daily", "keep": 1, "passphrase": testPassphrase})
	expect(t, e.do("PUT", "/managed/backup/schedule", body, e.admin()), http.StatusNoContent, "")
	dir := filepath.Dir(e.api.backups.schedulePath)
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o700)
	expect(t, e.do("DELETE", "/managed/backup/schedule", "", e.admin()), http.StatusInternalServerError, "server_error")
}

func TestBackupAPI_RunNowAndList(t *testing.T) {
	e := newManagedEnv(t, nil)
	expect(t, e.do("POST", "/managed/backup/run", "", e.admin()), http.StatusNotFound, "not_found")
	expect(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, map[string]any{"kind": "hourly", "keep": 5, "passphrase": testPassphrase}), e.admin()), http.StatusNoContent, "")

	rec := e.do("POST", "/managed/backup/run", "", e.admin())
	expect(t, rec, http.StatusOK, "")
	if got := decodeTo[map[string]string](t, rec.Body.Bytes())["file"]; got != "smu-backup-20261030T090000Z.json" {
		t.Fatalf("file: %q", got)
	}
	st := e.backupStatus(t)
	if len(st.Files) != 1 || st.Files[0].Name != "smu-backup-20261030T090000Z.json" || st.Files[0].Created != "2026-10-30T09:00:00Z" || st.Files[0].Size == 0 {
		t.Fatalf("files: %+v", st.Files)
	}
	if st.LastRun == nil || st.LastRun.File != st.Files[0].Name || st.LastRun.Error != "" || st.LastRun.At != "2026-10-30T09:00:00Z" {
		t.Fatalf("last run: %+v", st.LastRun)
	}

	// The same second again: 409 with the reason, recorded as the last run.
	rec = e.do("POST", "/managed/backup/run", "", e.admin())
	expect(t, rec, http.StatusConflict, "backup_unavailable")
	if r := errorCode(t, rec).Reason; !strings.Contains(r, "already exists") {
		t.Fatalf("reason: %q", r)
	}
	if st := e.backupStatus(t); st.LastRun.Error == "" || st.LastRun.File != "" {
		t.Fatalf("a failed run: %+v", st.LastRun)
	}
}

func TestBackupAPI_Download(t *testing.T) {
	e := newManagedEnv(t, nil)
	const name = "smu-backup-20261030T090000Z.json"
	// No such file yet, and names the gateway never writes.
	for _, n := range []string{name, "users.yaml", "smu-backup-latest.json"} {
		expect(t, e.do("GET", "/managed/backup/files/"+n, "", e.admin()), http.StatusNotFound, "not_found")
	}
	expect(t, e.do("PUT", "/managed/backup/schedule", jsonBody(t, map[string]any{"kind": "hourly", "keep": 5, "passphrase": testPassphrase}), e.admin()), http.StatusNoContent, "")
	expect(t, e.do("POST", "/managed/backup/run", "", e.admin()), http.StatusOK, "")

	rec := e.do("GET", "/managed/backup/files/"+name, "", e.admin())
	expect(t, rec, http.StatusOK, "")
	out := decodeTo[map[string]string](t, rec.Body.Bytes())
	onDisk, err := os.ReadFile(filepath.Join(e.cfg.backupDir, name))
	if err != nil {
		t.Fatal(err)
	}
	if out["filename"] != name || out["content"] != string(onDisk) {
		t.Fatalf("want the file as written, got %q (%d bytes)", out["filename"], len(out["content"]))
	}
	if _, err := openBackup(context.Background(), e.api.backups.hasher, []byte(out["content"]), testPassphrase); err != nil {
		t.Fatalf("the download opens with the schedule's passphrase: %v", err)
	}
	if !strings.Contains(e.log.String(), "backup downloaded") {
		t.Fatal("a download is logged")
	}

	big := "smu-backup-20261030T100000Z.json"
	writeFile(t, filepath.Join(e.cfg.backupDir, big), strings.Repeat("x", maxStoreFile+1))
	expectInvalid(t, e.do("GET", "/managed/backup/files/"+big, "", e.admin()), "file")
}

func TestBackupAPI_Export(t *testing.T) {
	e := newManagedEnv(t, nil)
	expectInvalid(t, e.do("POST", "/managed/backup/export", `{"passphrase":"short"}`, e.admin()), "passphrase")
	expect(t, e.do("POST", "/managed/backup/export", `{"passphrase":"x","extra":1}`, e.admin()), http.StatusBadRequest, "bad_request")
	rec := e.do("POST", "/managed/backup/export", jsonBody(t, map[string]string{"passphrase": testPassphrase}), e.admin())
	expect(t, rec, http.StatusOK, "")
	out := decodeTo[map[string]string](t, rec.Body.Bytes())
	if out["filename"] != "smu-backup-20261030T090000Z.json" {
		t.Fatalf("filename: %q", out["filename"])
	}
	for _, secret := range []string{"semp-b1-pw", "cli-b1v1-pw", "pbkdf2-sha256$"} {
		if strings.Contains(rec.Body.String(), secret) {
			t.Fatalf("an export must not carry %q in clear", secret)
		}
	}
	doc, err := openBackup(context.Background(), e.f.h, []byte(out["content"]), testPassphrase)
	if err != nil {
		t.Fatal(err)
	}
	none := nameDiff{Added: []string{}, Changed: []string{}, Removed: []string{}}
	if !reflect.DeepEqual(diffByName(e.api.store.listUsers(), doc.Users, userName), none) ||
		!reflect.DeepEqual(diffByName(e.api.store.listConnections(), doc.Connections, connName), none) ||
		len(settingsChanges(e.api.settings.current(), doc.Settings)) != 0 {
		t.Fatal("an export holds the configuration as it is, and previews as no change")
	}
	if doc.Settings.TLS.CertFile != "" || doc.Settings.ConnModes != connBoth {
		t.Fatalf("settings, without the host paths: %+v", doc.Settings)
	}
	if !strings.Contains(e.log.String(), "configuration exported") {
		t.Fatal("an export is logged")
	}
}

func TestBackupAPI_PreviewSources(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	preview := func(body any) *http.Response {
		return e.do("POST", "/managed/backup/preview", jsonBody(t, body), e.admin()).Result()
	}
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"passphrase": testPassphrase}), e.admin()), "file")
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"file": file, "backup": "x", "passphrase": testPassphrase}), e.admin()), "file")
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"backup": "../users.yaml", "passphrase": testPassphrase}), e.admin()), "backup")
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"file": file, "passphrase": "the wrong passphrase"}), e.admin()), "passphrase")
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"file": "{}", "passphrase": testPassphrase}), e.admin()), "file")

	// An oversized file in the directory is not a backup.
	big := "smu-backup-20261030T080000Z.json"
	writeFile(t, filepath.Join(e.cfg.backupDir, big), strings.Repeat("x", maxStoreFile+1))
	expectInvalid(t, e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"backup": big, "passphrase": testPassphrase}), e.admin()), "file")

	// A backup in the directory, by name.
	name := "smu-backup-20261030T090000Z.json"
	writeFile(t, filepath.Join(e.cfg.backupDir, name), file)
	if res := preview(map[string]string{"backup": name, "passphrase": testPassphrase}); res.StatusCode != http.StatusOK {
		t.Fatalf("by name: %d", res.StatusCode)
	}
}

func TestBackupAPI_PreviewSaysWhatWouldChange(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, func(d *backupDoc) {
		d.Users = append(d.Users[:1:1], userRec{Username: "newbie", Password: d.Users[0].Password, Operate: []permRow{}, ReadOnly: []permRow{}})
		d.Users[0].Password = mustHash(t, e.f.h, "a new admin password")
		d.Connections[0].Hostname = "host1-new"
		d.Settings.Session.IdleMinutes = 5
		d.Settings.TLS.CertFile = "/elsewhere/tls.crt" // never imported
	})
	rec := e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeTo[importPreviewJSON](t, rec.Body.Bytes())
	want := importPreviewJSON{
		Created: "2026-10-30T09:00:00Z", Gateway: version,
		Users:          nameDiff{Added: []string{"newbie"}, Changed: []string{"admin"}, Removed: []string{"viewer"}},
		Connections:    nameDiff{Added: []string{}, Changed: []string{"b1"}, Removed: []string{}},
		Settings:       []string{"session.idleMinutes"},
		SignsOutCaller: signsOutJSON{Replace: true, Merge: true},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("want %+v\ngot  %+v", want, got)
	}
}

func TestBackupAPI_ImportRefusals(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	imp := func(users, conns, settings string, f string) *http.Response {
		return e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
			"file": f, "passphrase": testPassphrase, "users": users, "connections": conns, "settings": settings,
		}), e.admin()).Result()
	}
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase, "users": "all", "connections": "skip", "settings": "skip"}), e.admin()), "users")
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase, "users": "skip", "connections": "", "settings": "skip"}), e.admin()), "connections")
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase, "users": "skip", "connections": "skip", "settings": "merge"}), e.admin()), "settings")
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase, "users": "skip", "connections": "skip", "settings": "skip"}), e.admin()), "sections")
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": file, "passphrase": "the wrong passphrase", "users": "merge", "connections": "skip", "settings": "skip"}), e.admin()), "passphrase")

	noAdmin := e.exported(t, func(d *backupDoc) { d.Users = d.Users[1:] })
	if res := imp("replace", "skip", "skip", noAdmin); res.StatusCode != http.StatusConflict {
		t.Fatalf("no administrator: %d", res.StatusCode)
	}
	empty := e.exported(t, func(d *backupDoc) { d.Users, d.Connections = nil, nil })
	if res := imp("replace", "skip", "skip", empty); res.StatusCode != http.StatusConflict {
		t.Fatalf("no users at all: %d", res.StatusCode)
	}
	badHash := e.exported(t, func(d *backupDoc) { d.Users[1].Password = "plain" })
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": badHash, "passphrase": testPassphrase, "users": "merge", "connections": "skip", "settings": "skip"}), e.admin()), "file")
	badConn := e.exported(t, func(d *backupDoc) { d.Connections[0].Hostname = "http://x" })
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": badConn, "passphrase": testPassphrase, "users": "skip", "connections": "replace", "settings": "skip"}), e.admin()), "file")
	direct := e.exported(t, func(d *backupDoc) { d.Settings.ConnModes = connDirect })
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": direct, "passphrase": testPassphrase, "users": "skip", "connections": "skip", "settings": "replace"}), e.admin()), "connModes")
	lockOut := e.exported(t, func(d *backupDoc) { d.Settings.Access.Allow = []string{"10.0.0.0/8"} })
	expect(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{"file": lockOut, "passphrase": testPassphrase, "users": "skip", "connections": "skip", "settings": "replace"}), e.admin()), http.StatusConflict, "would_lock_out")

	// Nothing above wrote anything.
	if got := userNames(e.api.store.listUsers()); !reflect.DeepEqual(got, []string{"admin", "viewer"}) {
		t.Fatalf("users touched: %v", got)
	}
	if e.api.store.listConnections()[0].Hostname != "host1" {
		t.Fatal("connections touched")
	}

	// The body cap is a file's, not a form's.
	huge := `{"file":"` + strings.Repeat("x", maxImportBytes) + `"}`
	expect(t, e.do("POST", "/managed/backup/import", huge, e.admin()), http.StatusRequestEntityTooLarge, "too_large")
}

func TestBackupAPI_ImportReplaceAll(t *testing.T) {
	e := newManagedEnv(t, nil)
	viewer := e.cookie("viewer", false)
	file := e.exported(t, func(d *backupDoc) {
		d.Users[1].Password = mustHash(t, e.f.h, "viewer password two")
		d.Connections = d.Connections[:1]
		d.Settings.Session.IdleMinutes = 5
		d.Settings.TLS.InsecureSkipVerify = true
		d.Settings.TLS.CertFile = "/elsewhere/tls.crt" // the deployment keeps its own
	})
	rec := e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
		"file": file, "passphrase": testPassphrase, "users": "replace", "connections": "replace", "settings": "replace",
	}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeTo[importResultJSON](t, rec.Body.Bytes())
	if !reflect.DeepEqual(got, importResultJSON{RestartRequired: []string{"tls.insecureSkipVerify"}, SignedOut: false}) {
		t.Fatalf("result: %+v", got)
	}
	if conns := e.api.store.listConnections(); len(conns) != 1 || conns[0].Broker != "b1" {
		t.Fatalf("connections replaced: %+v", conns)
	}
	if !signsIn(t, e.api.store, "viewer", "viewer password two") {
		t.Fatal("the imported hash signs in")
	}
	// The viewer's password changed: their session ended. The admin's did not.
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusUnauthorized, "unauthenticated")
	expect(t, e.do("GET", "/managed/me", "", e.admin()), http.StatusOK, "")
	s := e.settings(t).Settings
	if s.Session.IdleMinutes != 5 || s.TLS.CertFile != e.cfg.certFile {
		t.Fatalf("settings: idle %d, tls.certFile %q", s.Session.IdleMinutes, s.TLS.CertFile)
	}
	if e.live.get().session.idle.Minutes() != 5 {
		t.Fatal("a live key applies at once")
	}
	if !strings.Contains(e.log.String(), "configuration imported") {
		t.Fatal("an import is logged")
	}
}

func TestBackupAPI_ImportMergeAndTheCallersOwnSession(t *testing.T) {
	e := newManagedEnv(t, nil)
	me := e.admin()
	file := e.exported(t, func(d *backupDoc) {
		d.Users = []userRec{d.Users[0], {Username: "newbie", Password: d.Users[1].Password, Operate: []permRow{}, ReadOnly: []permRow{}}}
		d.Users[0].Password = mustHash(t, e.f.h, "a new admin password")
		d.Connections = []connRec{{Broker: "b3", Hostname: "host3"}}
	})
	rec := e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
		"file": file, "passphrase": testPassphrase, "users": "merge", "connections": "merge", "settings": "skip",
	}), me)
	expect(t, rec, http.StatusOK, "")
	if got := decodeTo[importResultJSON](t, rec.Body.Bytes()); !got.SignedOut || len(got.RestartRequired) != 0 {
		t.Fatalf("result: %+v", got)
	}
	if got := userNames(e.api.store.listUsers()); !reflect.DeepEqual(got, []string{"admin", "viewer", "newbie"}) {
		t.Fatalf("merge keeps the viewer: %v", got)
	}
	if n := len(e.api.store.listConnections()); n != 3 {
		t.Fatalf("merge keeps b1 and b2 and adds b3: %d", n)
	}
	expect(t, e.do("GET", "/managed/me", "", me), http.StatusUnauthorized, "unauthenticated")
}

func TestBackupAPI_ImportWriteFailures(t *testing.T) {
	cases := []struct {
		name, users, conns, settings string
		breakPath                    func(e *managedEnv) *string
	}{
		{"users", "merge", "skip", "skip", func(e *managedEnv) *string { return &e.api.store.usersPath }},
		{"connections", "skip", "merge", "skip", func(e *managedEnv) *string { return &e.api.store.connsPath }},
		{"settings", "skip", "skip", "replace", func(e *managedEnv) *string { return &e.api.settings.path }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			file := e.exported(t, nil)
			p := c.breakPath(e)
			if c.name == "settings" {
				// The settings check reads the file first: break only the write.
				dir := filepath.Dir(*p)
				if os.Geteuid() == 0 {
					t.Skip("root ignores directory permissions")
				}
				if err := os.Chmod(dir, 0o500); err != nil {
					t.Fatal(err)
				}
				defer os.Chmod(dir, 0o700)
			} else {
				*p = filepath.Join(*p, "under-a-file")
			}
			rec := e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
				"file": file, "passphrase": testPassphrase, "users": c.users, "connections": c.conns, "settings": c.settings,
			}), e.admin())
			expect(t, rec, http.StatusInternalServerError, "server_error")
		})
	}
}

// An import whose last file cannot be written applies nothing: config.yaml
// and the users file, already replaced, are put back, the users keep their
// passwords and sessions, and the live settings stay as they were. The
// answer is a 500 that means nothing was imported.
func TestBackupAPI_ImportIsAllOrNothing(t *testing.T) {
	e := newManagedEnv(t, nil)
	viewer := e.cookie("viewer", false)
	file := e.exported(t, func(d *backupDoc) {
		d.Users[1].Password = mustHash(t, e.f.h, "viewer password two")
		d.Settings.Session.IdleMinutes = 5
	})
	usersBefore, _ := os.ReadFile(e.f.usersPath)
	configBefore, _ := os.ReadFile(e.cfgPath)
	connsPath := e.api.store.connsPath
	// The connections file's place is a directory with something in it, so
	// its rename, the last of the three, fails.
	e.api.store.connsPath = filepath.Join(t.TempDir(), "conns.yaml")
	if err := os.MkdirAll(filepath.Join(e.api.store.connsPath, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
		"file": file, "passphrase": testPassphrase, "users": "replace", "connections": "replace", "settings": "replace",
	}), e.admin())
	expect(t, rec, http.StatusInternalServerError, "server_error")
	if now, _ := os.ReadFile(e.f.usersPath); !bytes.Equal(now, usersBefore) {
		t.Error("the users file must be put back")
	}
	if now, _ := os.ReadFile(e.cfgPath); !bytes.Equal(now, configBefore) {
		t.Error("config.yaml must be put back")
	}
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("the viewer keeps the old password")
	}
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "")
	if got := e.settings(t); e.live.get().session.idle != 10*time.Minute || got.Settings.Session.IdleMinutes != 10 || got.ChangedOnDisk {
		t.Errorf("the settings must stay as they were: live idle %v, file %+v", e.live.get().session.idle, got)
	}
	if log := e.log.String(); strings.Contains(log, "configuration imported") || !strings.Contains(log, "op=importBackup") {
		t.Errorf("the failure is logged and no import is: %s", log)
	}

	// The settings alone commit on their own.
	e.api.store.connsPath = connsPath
	rec = e.do("POST", "/managed/backup/import", jsonBody(t, map[string]string{
		"file": file, "passphrase": testPassphrase, "users": "skip", "connections": "skip", "settings": "replace",
	}), e.admin())
	expect(t, rec, http.StatusOK, "")
	if e.live.get().session.idle != 5*time.Minute {
		t.Errorf("a settings-only import applies at once: idle %v", e.live.get().session.idle)
	}
}
