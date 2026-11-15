package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
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

// scheduleBody is a weekly schedule save with the given keys changed.
func scheduleBody(kv ...any) map[string]any {
	out := map[string]any{"kind": "weekly", "minute": 15, "hour": 2, "weekday": 1, "day": 0, "keep": 14, "passphrase": testPassphrase}
	for i := 0; i+1 < len(kv); i += 2 {
		out[kv[i].(string)] = kv[i+1]
	}
	return out
}

// putSchedule is PUT /managed/backup/schedule with rev added to the body (nil:
// no rev at all; json.RawMessage("null") sends a null).
func (e *managedEnv) putSchedule(t *testing.T, body map[string]any, rev any) *httptest.ResponseRecorder {
	t.Helper()
	b := maps.Clone(body)
	if rev != nil {
		b["rev"] = rev
	}
	return e.do("PUT", "/managed/backup/schedule", jsonBody(t, b), e.admin())
}

// newSchedule creates an hourly schedule (rev 0) and checks it answers rev 1,
// the first seq of a fresh volume.
func (e *managedEnv) newSchedule(t *testing.T, kind string, keep int) {
	t.Helper()
	expectRev(t, e.putSchedule(t, map[string]any{"kind": kind, "keep": keep, "passphrase": testPassphrase}, 0), 1)
}

func (e *managedEnv) deleteSchedule(t *testing.T, query string) *httptest.ResponseRecorder {
	t.Helper()
	return e.do("DELETE", "/managed/backup/schedule"+query, "", e.admin())
}

// expectRev is a 200 {"rev": want}.
func expectRev(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	expect(t, rec, http.StatusOK, "")
	if got := decodeTo[map[string]int](t, rec.Body.Bytes()); !reflect.DeepEqual(got, map[string]int{"rev": want}) {
		t.Fatalf("want rev %d, got %v", want, got)
	}
}

// expectStale is a 409 stale carrying the current rev.
func expectStale(t *testing.T, rec *httptest.ResponseRecorder, rev int) {
	t.Helper()
	expect(t, rec, http.StatusConflict, "stale")
	if got := errorCode(t, rec).Rev; got != float64(rev) {
		t.Fatalf("stale must carry the current rev %d, got %v", rev, got)
	}
}

// staleBasis is the current basis a stale import answers with.
func staleBasis(t *testing.T, rec *httptest.ResponseRecorder) importBasis {
	t.Helper()
	expect(t, rec, http.StatusConflict, "stale")
	b := errorCode(t, rec).Basis
	if b == nil {
		t.Fatalf("a stale import carries the current basis: %s", rec.Body.String())
	}
	return decodeTo[importBasis](t, []byte(jsonBody(t, b)))
}

// importRaw posts an import whose body is fields over a default of the test
// passphrase and the basis the gateway holds now.
func (e *managedEnv) importRaw(t *testing.T, fields map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body := map[string]any{"passphrase": testPassphrase, "basis": e.api.currentBasis()}
	maps.Copy(body, fields)
	return e.do("POST", "/managed/backup/import", jsonBody(t, body), e.admin())
}

// importWith imports file with the given choice per section, at the current basis.
func (e *managedEnv) importWith(t *testing.T, file, users, conns, settings string) *httptest.ResponseRecorder {
	t.Helper()
	return e.importRaw(t, map[string]any{"file": file, "users": users, "connections": conns, "settings": settings})
}

// diskBytes are the three files an import can write, as they are on disk.
func (e *managedEnv) diskBytes(t *testing.T) [3][]byte {
	t.Helper()
	return [3][]byte{mustRead(t, e.f.usersPath), mustRead(t, e.f.connsPath), mustRead(t, e.cfgPath)}
}

// noExit fails the test if the writer decides the process cannot go on.
func (e *managedEnv) noExit(t *testing.T) {
	t.Helper()
	e.api.store.wr.exit = func(code int) { t.Errorf("the writer called exit(%d): a rollback failed", code) }
}

func TestBackupAPI_Schedule(t *testing.T) {
	e := newManagedEnv(t, nil)
	expectInvalid(t, e.putSchedule(t, scheduleBody("kind", "yearly"), 0), "schedule")
	expectInvalid(t, e.putSchedule(t, scheduleBody("keep", 0), 0), "keep")
	expectInvalid(t, e.putSchedule(t, scheduleBody("keep", backupKeepMax+1), 0), "keep")
	expectInvalid(t, e.putSchedule(t, scheduleBody("passphrase", ""), 0), "passphrase") // a new schedule needs one
	expectInvalid(t, e.putSchedule(t, scheduleBody("passphrase", "short"), 0), "passphrase")
	expect(t, e.do("PUT", "/managed/backup/schedule", `{"kind":"daily","unknown":1}`, e.admin()), http.StatusBadRequest, "bad_request")

	expectRev(t, e.putSchedule(t, scheduleBody(), 0), 1)
	got := e.backupStatus(t)
	want := backupScheduleJSON{backupSchedule: backupSchedule{Kind: scheduleWeekly, Minute: 15, Hour: 2, Weekday: 1}, Keep: 14, Rev: 1}
	// The fixture clock is Friday 2026-10-30 09:00 UTC: the next Monday 02:15.
	if got.Schedule == nil || *got.Schedule != want || got.NextRun == nil || *got.NextRun != "2026-11-02T02:15:00Z" {
		t.Fatalf("status: %+v next %v", got.Schedule, got.NextRun)
	}
	if !strings.Contains(e.log.String(), "backup schedule saved") || strings.Contains(e.log.String(), testPassphrase) {
		t.Fatal("a save is logged, never with the passphrase")
	}
	// An edit without a passphrase keeps the key, and moves the rev.
	expectRev(t, e.putSchedule(t, scheduleBody("passphrase", ""), 1), 2)
	if st := e.backupStatus(t); st.Schedule == nil || st.Schedule.Rev != 2 {
		t.Fatalf("status after the edit: %+v", st.Schedule)
	}

	expect(t, e.deleteSchedule(t, "?rev=2"), http.StatusNoContent, "")
	expect(t, e.deleteSchedule(t, "?rev=2"), http.StatusNotFound, "not_found")
	if e.backupStatus(t).Schedule != nil {
		t.Fatal("removed")
	}
}

// Every refusal of a schedule save or delete, in the order the gateway makes
// them, with the schedule left as it was.
func TestBackupAPI_ScheduleRefusals(t *testing.T) {
	e := newManagedEnv(t, nil)

	// What needs no store state comes first: a bad schedule or passphrase is
	// 422 even with no rev.
	expectInvalid(t, e.putSchedule(t, scheduleBody("kind", "yearly"), nil), "schedule")
	expectInvalid(t, e.putSchedule(t, scheduleBody("passphrase", "short"), nil), "passphrase")
	// A rev that is not a whole number from 0 up is 400 rev_required.
	for name, rev := range map[string]any{"missing": nil, "null": json.RawMessage("null"), "negative": -1, "fraction": 1.5, "text": "1"} {
		if rec := e.putSchedule(t, scheduleBody(), rev); rec.Code != http.StatusBadRequest || errorCode(t, rec).Error != "rev_required" {
			t.Errorf("%s rev: want 400 rev_required, got %d %s", name, rec.Code, rec.Body.String())
		}
	}
	for _, q := range []string{"", "?rev=", "?rev=0", "?rev=-1", "?rev=1.5", "?rev=abc", "?rev=99999999999"} {
		if rec := e.deleteSchedule(t, q); rec.Code != http.StatusBadRequest || errorCode(t, rec).Error != "rev_required" {
			t.Errorf("DELETE %q: want 400 rev_required, got %d %s", q, rec.Code, rec.Body.String())
		}
	}
	// No schedule: a rev above 0 is not found, for a save and a delete.
	expect(t, e.putSchedule(t, scheduleBody(), 3), http.StatusNotFound, "not_found")
	expect(t, e.deleteSchedule(t, "?rev=3"), http.StatusNotFound, "not_found")
	if _, err := os.Stat(e.api.backups.schedulePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a refusal writes nothing")
	}

	// A schedule exists.
	expectRev(t, e.putSchedule(t, scheduleBody(), 0), 1)
	expect(t, e.putSchedule(t, scheduleBody(), 0), http.StatusConflict, "exists")
	expectStale(t, e.putSchedule(t, scheduleBody(), 5), 1)
	expectStale(t, e.deleteSchedule(t, "?rev=5"), 1)
	expectRev(t, e.putSchedule(t, scheduleBody("keep", 3, "passphrase", ""), 1), 2)
	expectStale(t, e.putSchedule(t, scheduleBody("keep", 4, "passphrase", ""), 1), 2) // the rev it was read at
	expectStale(t, e.deleteSchedule(t, "?rev=1"), 2)
	if st := e.backupStatus(t); st.Schedule == nil || st.Schedule.Rev != 2 || st.Schedule.Keep != 3 {
		t.Fatalf("the refusals moved nothing: %+v", st.Schedule)
	}

	// A delete keeps backup.yaml with the counter; the schedule is gone, so a
	// rev above 0 is not found and a create gets a rev nobody holds.
	expect(t, e.deleteSchedule(t, "?rev=2"), http.StatusNoContent, "")
	if _, err := os.Stat(e.api.backups.schedulePath); err != nil {
		t.Fatalf("backup.yaml stays after a delete: %v", err)
	}
	if e.backupStatus(t).Schedule != nil {
		t.Fatal("removed")
	}
	expect(t, e.putSchedule(t, scheduleBody(), 2), http.StatusNotFound, "not_found")
	expectRev(t, e.putSchedule(t, scheduleBody(), 0), 4)

	// A backup.yaml replaced outside the gateway is refused, and so is every
	// later save and delete.
	writeFile(t, e.api.backups.schedulePath, "replaced by hand")
	expect(t, e.putSchedule(t, scheduleBody(), 4), http.StatusConflict, "store_changed_on_disk")
	expect(t, e.deleteSchedule(t, "?rev=4"), http.StatusConflict, "store_changed_on_disk")
	if st := e.backupStatus(t); st.Schedule == nil || st.Schedule.Rev != 4 {
		t.Fatalf("memory keeps the schedule it holds: %+v", st.Schedule)
	}
}

// With audit.onFailure refuse and an audit log that cannot be written, the
// schedule is refused 503 audit_unavailable before anything else, and nothing
// is written; once the log is writable the change goes through.
func TestBackupAPI_ScheduleRefusedWhileTheAuditLogIsDown(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.setAudit(auditSettings{onFailure: auditOnFailureRefuse})
	a, _ := e.withLoudAudit(t)
	_ = a.f.Close() // the audit log is no longer writable
	// The change that meets the failure stands.
	expectRev(t, e.putSchedule(t, scheduleBody(), 0), 1)
	expect(t, e.putSchedule(t, scheduleBody(), 1), http.StatusServiceUnavailable, "audit_unavailable")
	expect(t, e.deleteSchedule(t, "?rev=1"), http.StatusServiceUnavailable, "audit_unavailable")
	if st := e.backupStatus(t); st.Schedule == nil || st.Schedule.Rev != 1 { // reads are never refused
		t.Fatalf("a refused change writes nothing: %+v", st.Schedule)
	}
	a.mu.Lock()
	a.f = nil // the next write reopens the file: space is back
	a.mu.Unlock()
	expect(t, e.putSchedule(t, scheduleBody(), 1), http.StatusServiceUnavailable, "audit_unavailable") // its refusal line clears the state
	expectRev(t, e.putSchedule(t, scheduleBody(), 1), 2)
}

// A store write that fails is 500 store_write_failed, and the schedule and
// backup.yaml are as they were.
func TestBackupAPI_ScheduleWriteFailureIsAStoreWriteFailure(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.noExit(t)
	e.api.backups.schedulePath = filepath.Join(e.f.usersPath, "nested") // under a file
	rec := e.putSchedule(t, scheduleBody(), 0)
	expect(t, rec, http.StatusInternalServerError, "store_write_failed")
	if strings.Contains(rec.Body.String(), "nested") {
		t.Fatal("the cause is logged, never in the body")
	}
	if !strings.Contains(e.log.String(), "backup change not written") {
		t.Fatalf("the failure is logged: %s", e.log.String())
	}
	if e.backupStatus(t).Schedule != nil {
		t.Fatal("memory must not hold a schedule that was not written")
	}
}

func TestBackupAPI_RemoveFailureIsAStoreWriteFailure(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores directory permissions")
	}
	e := newManagedEnv(t, nil)
	e.noExit(t)
	e.newSchedule(t, "daily", 1)
	dir := filepath.Dir(e.api.backups.schedulePath)
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(dir, 0o700)
	expect(t, e.deleteSchedule(t, "?rev=1"), http.StatusInternalServerError, "store_write_failed")
	if st := e.backupStatus(t); st.Schedule == nil || st.Schedule.Rev != 1 {
		t.Fatalf("the schedule stays when its removal was not written: %+v", st.Schedule)
	}
}

// backupFailed answers each kind of error of a backup transaction.
func TestBackupAPI_BackupFailedAnswersEachError(t *testing.T) {
	e := newManagedEnv(t, nil)
	cases := []struct {
		name         string
		err          error
		status       int
		code         string
		wantLogged   string
		wantNoDetail string
	}{
		{name: "caller gone", err: errCallerGone, status: http.StatusUnauthorized, code: "unauthenticated"},
		{name: "caller not an admin", err: errCallerNotAdmin, status: http.StatusForbidden, code: "forbidden"},
		{name: "last admin", err: errLastAdmin, status: http.StatusConflict, code: "last_admin"},
		{name: "records that cannot load", err: &importInvalidError{section: "users", err: errors.New("no password")}, status: http.StatusUnprocessableEntity, code: "invalid"},
		{name: "a refusal fit to show", err: errWrongPass, status: http.StatusUnprocessableEntity, code: "invalid"},
		{name: "audit unavailable", err: errAuditUnavailable, status: http.StatusServiceUnavailable, code: "audit_unavailable"},
		{name: "a failed write", err: &writeFailedError{err: errors.New("disk full")}, status: http.StatusInternalServerError, code: "store_write_failed", wantLogged: "disk full", wantNoDetail: "disk full"},
		{name: "anything else", err: errors.New("boom"), status: http.StatusInternalServerError, code: "server_error", wantLogged: "boom", wantNoDetail: "boom"},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		e.api.backupFailed(rec, httptest.NewRequest("PUT", "/managed/backup/schedule", nil), "test", c.err)
		expect(t, rec, c.status, c.code)
		if c.wantNoDetail != "" && strings.Contains(rec.Body.String(), c.wantNoDetail) {
			t.Errorf("%s: the cause must stay out of the body: %s", c.name, rec.Body.String())
		}
		if c.wantLogged != "" && !strings.Contains(e.log.String(), c.wantLogged) {
			t.Errorf("%s: the cause must be logged: %s", c.name, e.log.String())
		}
	}
}

func TestBackupAPI_RunNowAndList(t *testing.T) {
	e := newManagedEnv(t, nil)
	expect(t, e.do("POST", "/managed/backup/run", "", e.admin()), http.StatusNotFound, "not_found")
	e.newSchedule(t, "hourly", 5)

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
	e.newSchedule(t, "hourly", 5)
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
	usersSeq, connsSeq := e.api.store.seqs()
	rec := e.do("POST", "/managed/backup/preview", jsonBody(t, map[string]string{"file": file, "passphrase": testPassphrase}), e.admin())
	expect(t, rec, http.StatusOK, "")
	got := decodeTo[importPreviewJSON](t, rec.Body.Bytes())
	want := importPreviewJSON{
		Created: "2026-10-30T09:00:00Z", Gateway: version,
		Users:          nameDiff{Added: []string{"newbie"}, Changed: []string{"admin"}, Removed: []string{"viewer"}},
		Connections:    nameDiff{Added: []string{}, Changed: []string{"b1"}, Removed: []string{}},
		Settings:       []string{"session.idleMinutes"},
		SignsOutCaller: signsOutJSON{Replace: true, Merge: true},
		Basis:          importBasis{Users: usersSeq, Connections: connsSeq, Settings: e.settings(t).Rev},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("want %+v\ngot  %+v", want, got)
	}
	if got.Basis.Users < 1 || got.Basis.Connections < 1 || got.Basis.Settings == "" {
		t.Fatalf("the basis names a version of every section: %+v", got.Basis)
	}
}

func TestBackupAPI_ImportRefusals(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	skipAll := map[string]any{"file": file, "users": "skip", "connections": "skip", "settings": "skip"}
	with := func(kv ...any) map[string]any {
		out := maps.Clone(skipAll)
		for i := 0; i+1 < len(kv); i += 2 {
			out[kv[i].(string)] = kv[i+1]
		}
		return out
	}
	expectInvalid(t, e.importRaw(t, with("users", "all")), "users")
	expectInvalid(t, e.importRaw(t, with("connections", "")), "connections")
	expectInvalid(t, e.importRaw(t, with("settings", "merge")), "settings")
	expectInvalid(t, e.importRaw(t, with()), "sections")
	expectInvalid(t, e.importRaw(t, with("users", "merge", "passphrase", "the wrong passphrase")), "passphrase")

	// No basis: 400 rev_required, once the file is open.
	noBasis := jsonBody(t, map[string]any{"file": file, "passphrase": testPassphrase, "users": "merge", "connections": "skip", "settings": "skip"})
	expect(t, e.do("POST", "/managed/backup/import", noBasis, e.admin()), http.StatusBadRequest, "rev_required")
	expect(t, e.importRaw(t, with("users", "merge", "basis", nil)), http.StatusBadRequest, "rev_required")
	expect(t, e.importRaw(t, with("users", "merge", "basis", "1")), http.StatusBadRequest, "bad_request")
	expect(t, e.importRaw(t, with("users", "merge", "basis", map[string]any{"users": 1, "other": 1})), http.StatusBadRequest, "bad_request")
	expectInvalid(t, e.do("POST", "/managed/backup/import", jsonBody(t, map[string]any{"passphrase": testPassphrase, "users": "merge", "connections": "skip", "settings": "skip"}), e.admin()), "file")

	noAdmin := e.exported(t, func(d *backupDoc) { d.Users = d.Users[1:] })
	expect(t, e.importRaw(t, with("file", noAdmin, "users", "replace")), http.StatusConflict, "last_admin")
	empty := e.exported(t, func(d *backupDoc) { d.Users, d.Connections = nil, nil })
	expect(t, e.importRaw(t, with("file", empty, "users", "replace")), http.StatusConflict, "last_admin")
	badHash := e.exported(t, func(d *backupDoc) { d.Users[1].Password = "plain" })
	expectInvalid(t, e.importRaw(t, with("file", badHash, "users", "merge")), "file")
	badConn := e.exported(t, func(d *backupDoc) { d.Connections[0].Hostname = "http://x" })
	expectInvalid(t, e.importRaw(t, with("file", badConn, "connections", "replace")), "file")
	direct := e.exported(t, func(d *backupDoc) { d.Settings.ConnModes = connDirect })
	expectInvalid(t, e.importRaw(t, with("file", direct, "settings", "replace")), "connModes")
	lockOut := e.exported(t, func(d *backupDoc) { d.Settings.Access.Allow = []string{"10.0.0.0/8"} })
	expect(t, e.importRaw(t, with("file", lockOut, "settings", "replace")), http.StatusConflict, "would_lock_out")

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
	before := e.api.currentBasis()
	rec := e.importWith(t, file, "replace", "replace", "replace")
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
	// Every section moved: the basis the preview saw is no longer current.
	after := e.api.currentBasis()
	if after.Users != before.Users+1 || after.Connections != before.Connections+1 || after.Settings == before.Settings {
		t.Fatalf("basis before %+v, after %+v", before, after)
	}
	// Every record of an imported section is restamped with the file's new seq,
	// whatever revs the backup carried.
	for _, u := range e.api.store.listUsers() {
		if u.Rev != after.Users {
			t.Errorf("user %q has rev %d, want %d", u.Username, u.Rev, after.Users)
		}
	}
	for _, c := range e.api.store.listConnections() {
		if c.Rev != after.Connections {
			t.Errorf("connection %q has rev %d, want %d", c.Broker, c.Rev, after.Connections)
		}
	}
}

// A section that is skipped is not restamped and its seq does not move.
func TestBackupAPI_ImportRestampsOnlyTheImportedSections(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	st := e.api.store
	connRevs := map[string]int{}
	for _, c := range st.listConnections() {
		connRevs[c.Broker] = c.Rev
	}
	usersSeq, connsSeq := st.seqs()
	settingsRev := e.api.settings.rev()

	expect(t, e.importWith(t, file, "merge", "skip", "skip"), http.StatusOK, "")
	if us, cs := st.seqs(); us != usersSeq+1 || cs != connsSeq || e.api.settings.rev() != settingsRev {
		t.Fatalf("only the users file moved: seqs %d %d", us, cs)
	}
	for _, u := range st.listUsers() { // merge restamps every user, the ones the file did not name included
		if u.Rev != usersSeq+1 {
			t.Errorf("user %q has rev %d, want %d", u.Username, u.Rev, usersSeq+1)
		}
	}
	for _, c := range st.listConnections() {
		if c.Rev != connRevs[c.Broker] {
			t.Errorf("connection %q was restamped: rev %d, was %d", c.Broker, c.Rev, connRevs[c.Broker])
		}
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
	rec := e.importWith(t, file, "merge", "merge", "skip")
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

// A section that moved since the preview makes the import stale (409, with the
// current basis) and nothing is written; a skipped section is not compared;
// the same import at the current basis then passes.
func TestBackupAPI_ImportBasis(t *testing.T) {
	st := func(e *managedEnv) *store { return e.api.store }
	cases := []struct {
		name                         string
		move                         func(t *testing.T, e *managedEnv)
		users, conns, settingsChoice string
	}{
		{"users", func(t *testing.T, e *managedEnv) { putUser(t, st(e), currentUser(t, st(e), "viewer"), "") }, "merge", "skip", "skip"},
		{"connections", func(t *testing.T, e *managedEnv) { putConn(t, st(e), currentConn(t, st(e), "b1")) }, "skip", "merge", "skip"},
		{"settings", func(t *testing.T, e *managedEnv) {
			expect(t, e.saveSettings(t, `{"logLevel":"debug"}`), http.StatusOK, "")
		}, "skip", "skip", "replace"},
		// A new password moves the file's seq though no record's rev changes.
		{"a password change", func(t *testing.T, e *managedEnv) {
			putUser(t, st(e), currentUser(t, st(e), "viewer"), "another viewer password 9")
		}, "merge", "skip", "skip"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := newManagedEnv(t, nil)
			file := e.exported(t, nil)
			previewed := e.api.currentBasis()
			c.move(t, e)
			before := e.diskBytes(t)
			current := e.api.currentBasis()
			if reflect.DeepEqual(previewed, current) {
				t.Fatal("the change must move the basis")
			}

			fields := map[string]any{"file": file, "users": c.users, "connections": c.conns, "settings": c.settingsChoice, "basis": previewed}
			if got := staleBasis(t, e.importRaw(t, fields)); got != current {
				t.Fatalf("stale carries the current basis %+v, got %+v", current, got)
			}
			if after := e.diskBytes(t); !reflect.DeepEqual(after, before) {
				t.Fatal("a stale import writes nothing")
			}

			// Previewed again, the same import goes through.
			delete(fields, "basis")
			expect(t, e.importRaw(t, fields), http.StatusOK, "")
		})
	}
}

func TestBackupAPI_ImportDoesNotCompareASkippedSection(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	previewed := e.api.currentBasis()
	putUser(t, e.api.store, currentUser(t, e.api.store, "viewer"), "")
	expect(t, e.saveSettings(t, `{"logLevel":"debug"}`), http.StatusOK, "")
	// Users and settings moved; only connections are imported.
	rec := e.importRaw(t, map[string]any{"file": file, "users": "skip", "connections": "merge", "settings": "skip", "basis": previewed})
	expect(t, rec, http.StatusOK, "")
}

// A file replaced outside the gateway is refused whatever the basis says: the
// disk check comes before the basis.
func TestBackupAPI_ImportDiskCheckComesBeforeTheBasis(t *testing.T) {
	e := newManagedEnv(t, nil)
	file := e.exported(t, nil)
	old := importBasis{Users: 99, Connections: 99, Settings: "old"} // stale on every count
	fields := func(users, conns, settings string) map[string]any {
		return map[string]any{"file": file, "users": users, "connections": conns, "settings": settings, "basis": old}
	}
	writeFile(t, e.f.usersPath, "replaced by hand")
	expect(t, e.importRaw(t, fields("merge", "skip", "skip")), http.StatusConflict, "store_changed_on_disk")
	// Only the sections imported are checked: connections are not affected.
	staleBasis(t, e.importRaw(t, fields("skip", "merge", "skip")))

	writeFile(t, e.cfgPath, string(mustRead(t, e.cfgPath))+"\n# edited by hand\n")
	expect(t, e.importRaw(t, fields("skip", "skip", "replace")), http.StatusConflict, "config_changed_on_disk")
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
			e.noExit(t)
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
			rec := e.importWith(t, file, c.users, c.conns, c.settings)
			expect(t, rec, http.StatusInternalServerError, "store_write_failed")
		})
	}
}

// An import whose second of three files cannot be written applies nothing:
// config.yaml and the users file are put back, the users keep their passwords
// and sessions, the live settings stay as they were and memory keeps every
// list and seq. The answer is a 500 that means nothing was imported.
func TestBackupAPI_ImportIsAllOrNothing(t *testing.T) {
	e := newManagedEnv(t, nil)
	e.noExit(t)
	viewer := e.cookie("viewer", false)
	file := e.exported(t, func(d *backupDoc) {
		d.Users[1].Password = mustHash(t, e.f.h, "viewer password two")
		d.Settings.Session.IdleMinutes = 5
	})
	disk := e.diskBytes(t)
	basis := e.api.currentBasis()
	// The files are renamed in the order users, connections, config: the
	// second rename fails.
	e.api.store.wr.hooks.rename = renameFailing(2)
	rec := e.importWith(t, file, "replace", "replace", "replace")
	expect(t, rec, http.StatusInternalServerError, "store_write_failed")
	for i, name := range []string{"users file", "connections file", "config.yaml"} {
		if now := e.diskBytes(t); !bytes.Equal(now[i], disk[i]) {
			t.Errorf("the %s must be put back", name)
		}
	}
	if !signsIn(t, e.api.store, "viewer", viewerPW) {
		t.Error("the viewer keeps the old password")
	}
	expect(t, e.do("GET", "/managed/me", "", viewer), http.StatusOK, "")
	if got := e.settings(t); e.live.get().session.idle != 10*time.Minute || got.Settings.Session.IdleMinutes != 10 || got.ChangedOnDisk {
		t.Errorf("the settings must stay as they were: live idle %v, file %+v", e.live.get().session.idle, got)
	}
	if got := e.api.currentBasis(); got != basis || len(e.api.store.listUsers()) != 2 || len(e.api.store.listConnections()) != 2 {
		t.Errorf("memory must keep every list and seq: basis %+v, was %+v", got, basis)
	}
	if log := e.log.String(); strings.Contains(log, "configuration imported") || !strings.Contains(log, "op=importBackup") {
		t.Errorf("the failure is logged and no import is: %s", log)
	}

	// With the disk working the same import commits all three together.
	e.api.store.wr.hooks.rename = nil
	expect(t, e.importRaw(t, map[string]any{"file": file, "users": "replace", "connections": "replace", "settings": "replace"}), http.StatusOK, "")
	if e.live.get().session.idle != 5*time.Minute || !signsIn(t, e.api.store, "viewer", "viewer password two") {
		t.Errorf("the import applies: idle %v", e.live.get().session.idle)
	}
	if got := e.f.load(t); !reflect.DeepEqual(userNames(got.listUsers()), userNames(e.api.store.listUsers())) {
		t.Error("disk and memory agree")
	}
}

// An import and a user save at once never lose the user: whichever commits
// first, the other either is refused as stale (the import, to be previewed
// again) or lands on top of it (the save, on the current list).
func TestBackupAPI_ImportRacingAUserSave(t *testing.T) {
	racer := func(name string) userRec {
		return userRec{Username: name, Operate: []permRow{}, ReadOnly: []permRow{}}
	}
	const racerPW = "a racing user password"

	t.Run("the save first", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		file := e.exported(t, nil)
		previewed := e.api.currentBasis()
		putUser(t, e.api.store, racer("saved-first"), racerPW)
		fields := map[string]any{"file": file, "users": "merge", "connections": "skip", "settings": "skip", "basis": previewed}
		staleBasis(t, e.importRaw(t, fields))
		if !slices.Contains(userNames(e.api.store.listUsers()), "saved-first") {
			t.Fatal("the saved user is still there")
		}
		delete(fields, "basis")
		expect(t, e.importRaw(t, fields), http.StatusOK, "")
		if got := userNames(e.api.store.listUsers()); !slices.Contains(got, "saved-first") || !slices.Contains(got, "viewer") {
			t.Fatalf("a merge keeps the saved user: %v", got)
		}
	})

	t.Run("the import first", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		file := e.exported(t, nil)
		expect(t, e.importWith(t, file, "merge", "skip", "skip"), http.StatusOK, "")
		putUser(t, e.api.store, racer("saved-second"), racerPW)
		if got := userNames(e.api.store.listUsers()); !reflect.DeepEqual(got, []string{"admin", "viewer", "saved-second"}) {
			t.Fatalf("the save lands on the imported list: %v", got)
		}
	})

	t.Run("at once", func(t *testing.T) {
		e := newManagedEnv(t, nil)
		for i := range 8 {
			name := "racer-" + string(rune('a'+i))
			file := e.exported(t, nil)
			var wg sync.WaitGroup
			var saveErr error
			var status int
			wg.Add(2)
			go func() {
				defer wg.Done()
				_, saveErr = e.api.store.saveUser(context.Background(), "", racer(name), racerPW, 0)
			}()
			go func() {
				defer wg.Done()
				status = e.importWith(t, file, "merge", "skip", "skip").Code
			}()
			wg.Wait()
			if saveErr != nil {
				t.Fatalf("round %d: the save must land: %v", i, saveErr)
			}
			if status != http.StatusOK && status != http.StatusConflict {
				t.Fatalf("round %d: the import is applied or refused as stale, got %d", i, status)
			}
			if !slices.Contains(userNames(e.api.store.listUsers()), name) {
				t.Fatalf("round %d: the user saved at the same time was lost", i)
			}
		}
		// Disk and memory agree afterwards.
		loaded := e.f.load(t)
		if !reflect.DeepEqual(userNames(loaded.listUsers()), userNames(e.api.store.listUsers())) {
			t.Fatalf("disk %v, memory %v", userNames(loaded.listUsers()), userNames(e.api.store.listUsers()))
		}
		wantSeq, _ := e.api.store.seqs()
		if gotSeq, _ := loaded.seqs(); gotSeq != wantSeq {
			t.Fatalf("the seq on disk is %d, in memory %d", gotSeq, wantSeq)
		}
	})
}

// Export, the schedule and import are admin entries; an import names the
// sections it applied and, for a saved backup, the file, never any content.
// An ok entry says which files it wrote, with the seq each got; a refusal
// carries the code of the answer.
func TestBackupAPI_ActionsAreAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	usersFile, connsFile := filepath.Base(e.api.store.usersPath), filepath.Base(e.api.store.connsPath)
	schedFile := filepath.Base(e.api.backups.schedulePath)
	u0, c0 := e.api.store.seqs()
	pass := jsonBody(t, map[string]string{"passphrase": testPassphrase})
	e.do("POST", "/managed/backup/export", pass, e.admin())
	e.do("POST", "/managed/backup/export", `{"passphrase":"short"}`, e.admin())
	e.do("POST", "/managed/backup/export", pass, e.cookie("viewer", false))
	e.newSchedule(t, "hourly", 5)
	e.putSchedule(t, scheduleBody("kind", "yearly"), 0)
	rec := e.do("POST", "/managed/backup/run", "", e.admin())
	expect(t, rec, http.StatusOK, "")
	saved := decodeTo[map[string]string](t, rec.Body.Bytes())["file"]
	e.importRaw(t, map[string]any{"backup": saved, "users": "merge", "connections": "skip", "settings": "skip"})
	e.importWith(t, e.exported(t, nil), "merge", "replace", "skip")
	noAdmin := e.exported(t, func(d *backupDoc) { d.Users = d.Users[1:] })
	e.importWith(t, noAdmin, "replace", "skip", "skip")
	e.importWith(t, "x", "all", "skip", "skip")
	e.do("POST", "/managed/backup/import", jsonBody(t, map[string]any{"file": e.exported(t, nil), "passphrase": testPassphrase, "users": "merge", "connections": "skip", "settings": "skip"}), e.admin())
	e.importRaw(t, map[string]any{"file": e.exported(t, nil), "users": "merge", "connections": "skip", "settings": "skip", "basis": importBasis{}})
	e.deleteSchedule(t, "")
	e.deleteSchedule(t, "?rev=1")
	e.deleteSchedule(t, "?rev=1")

	au.expect(t,
		auditEntry{Actor: "admin", Action: "backup.export", Outcome: "ok", Msg: "admin exported a backup"},
		auditEntry{Actor: "admin", Action: "backup.export", Outcome: "refused", Code: "invalid", Msg: "admin could not export a backup: invalid"},
		auditEntry{Actor: "viewer", Action: "backup.export", Outcome: "refused", Code: "forbidden", Msg: "viewer could not export a backup: forbidden"},
		auditEntry{Actor: "admin", Action: "schedule.set", Outcome: "ok", Wrote: []auditWrote{{File: schedFile, Seq: 1}}, Msg: "admin set the backup schedule"},
		auditEntry{Actor: "admin", Action: "schedule.set", Outcome: "refused", Code: "invalid", Msg: "admin could not set the backup schedule: invalid"},
		auditEntry{Actor: "admin", Action: "backup.import", Target: saved, Outcome: "ok", Changed: []string{"users"}, Wrote: []auditWrote{{File: usersFile, Seq: int64(u0 + 1)}}, Msg: "admin imported a backup: users"},
		auditEntry{Actor: "admin", Action: "backup.import", Outcome: "ok", Changed: []string{"users", "connections"},
			Wrote: []auditWrote{{File: usersFile, Seq: int64(u0 + 2)}, {File: connsFile, Seq: int64(c0 + 1)}}, Msg: "admin imported a backup: users, connections"},
		auditEntry{Actor: "admin", Action: "backup.import", Outcome: "refused", Code: "last_admin", Msg: "admin could not import a backup: last_admin"},
		auditEntry{Actor: "admin", Action: "backup.import", Outcome: "refused", Code: "invalid", Msg: "admin could not import a backup: invalid"},
		auditEntry{Actor: "admin", Action: "backup.import", Outcome: "refused", Code: "rev_required", Msg: "admin could not import a backup: rev_required"},
		auditEntry{Actor: "admin", Action: "backup.import", Outcome: "refused", Code: "stale", Msg: "admin could not import a backup: stale"},
		auditEntry{Actor: "admin", Action: "schedule.remove", Outcome: "refused", Code: "rev_required", Msg: "admin could not remove the backup schedule: rev_required"},
		auditEntry{Actor: "admin", Action: "schedule.remove", Outcome: "ok", Wrote: []auditWrote{{File: schedFile, Seq: 2}}, Msg: "admin removed the backup schedule"},
		auditEntry{Actor: "admin", Action: "schedule.remove", Outcome: "refused", Code: "not_found", Msg: "admin could not remove the backup schedule: not_found"},
	)
}
