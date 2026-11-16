package main

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func (e *managedEnv) settings(t *testing.T) settingsJSON {
	t.Helper()
	rec := e.do("GET", "/managed/settings", "", e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	var s settingsJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &s); err != nil {
		t.Fatal(err)
	}
	return s
}

// mustRead is path's content; a read error fails the test.
func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// withSettingsRev is body, a JSON object, with a top-level rev added.
func withSettingsRev(t *testing.T, body, rev string) string {
	t.Helper()
	m := map[string]any{}
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		t.Fatal(err)
	}
	m["rev"] = rev
	out, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

// saveSettingsRev saves body with rev as the rev it was read at.
func (e *managedEnv) saveSettingsRev(t *testing.T, rev, body string) *httptest.ResponseRecorder {
	t.Helper()
	return e.do("PUT", "/managed/settings", withSettingsRev(t, body, rev), e.cookie("admin", false))
}

// saveSettings saves body as an admin who has just read the page: the rev a
// GET shows now is added.
func (e *managedEnv) saveSettings(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return e.saveSettingsRev(t, e.settings(t).Rev, body)
}

// saveAnswer is the 200 body of a settings save: the new rev and nothing else
// (decodeSave refuses any other key).
type saveAnswer struct {
	Rev string `json:"rev"`
}

func decodeSave(t *testing.T, rec *httptest.ResponseRecorder) saveAnswer {
	t.Helper()
	var a saveAnswer
	dec := json.NewDecoder(bytes.NewReader(rec.Body.Bytes()))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&a); err != nil {
		t.Fatalf("want a save answer holding the rev only, got %q (%v)", rec.Body.String(), err)
	}
	return a
}

func (e *managedEnv) fileOnDisk(t *testing.T) fileConfig {
	t.Helper()
	data, err := os.ReadFile(e.cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	fc, err := decodeConfigFile(data, e.cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	return fc
}

func TestSettings_GetReportsTheFile(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.do("GET", "/managed/settings", "", e.cookie("admin", false))
	expect(t, rec, http.StatusOK, "")
	if body := rec.Body.String(); strings.Contains(body, "version") || strings.Contains(body, "seed") || strings.Contains(body, "store.key") || strings.Contains(body, "storeKey") {
		t.Errorf("the version and the secret paths are not the page's to see: %s", body)
	}
	if body := rec.Body.String(); strings.Contains(body, "certFile") || strings.Contains(body, "keyFile") || strings.Contains(body, "trustDir") || strings.Contains(body, "hostOnly") {
		t.Errorf("the TLS paths are environment only and no key is host-only: %s", body)
	}
	if body := rec.Body.String(); strings.Contains(body, "restartOnly") || strings.Contains(body, "pendingRestart") || strings.Contains(body, "restartRequired") {
		t.Errorf("no setting waits for a restart, so the page is told of none: %s", body)
	}
	s := e.settings(t)
	want := fileConfigFromConfig(e.cfg)
	want.Version = 0 // never sent
	if !reflect.DeepEqual(s.Settings, want) {
		t.Errorf("settings:\n%+v\nwant:\n%+v", s.Settings, want)
	}
	if s.ChangedOnDisk {
		t.Errorf("flags: %+v", s)
	}
	data, err := os.ReadFile(e.cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	if want := checksumRev(e.api.settings.wr.sums.sumOf(data)); s.Rev != want || len(s.Rev) != 43 {
		t.Errorf("rev: want the keyed checksum of config.yaml %q, got %q", want, s.Rev)
	}
	if s.Settings.Audit.OnFailure != auditOnFailureContinue {
		t.Errorf("audit.onFailure defaults to continue, got %q", s.Settings.Audit.OnFailure)
	}
	if !reflect.DeepEqual(s.Catalog, moduleCatalog()) {
		t.Errorf("catalog: %v", s.Catalog)
	}
}

// Live keys apply on the next request; keys the body leaves out keep their
// saved value.
func TestSettings_SaveAppliesLiveKeysAtOnce(t *testing.T) {
	e := newManagedEnv(t, nil)
	if rec := e.do("GET", "/", "", nil); rec.Body.String() != "app" {
		t.Fatalf("connModes both: the app is open, got %d", rec.Code)
	}
	rec := e.saveSettings(t, `{"connModes":"provisioned","logLevel":"debug","session":{"idleMinutes":1,"absoluteMinutes":30},"modules":{"offered":["queue-copy"],"userDefault":"none"}}`)
	expect(t, rec, http.StatusOK, "")
	if got := decodeSave(t, rec); got.Rev == "" || got.Rev != e.settings(t).Rev {
		t.Errorf("the answer carries the new rev: %s", rec.Body.String())
	}
	cur := e.live.get()
	if cur.connModes != connProvisioned || cur.session.idle != time.Minute || e.live.level.Level() != slog.LevelDebug {
		t.Errorf("not applied: %+v level %v", cur, e.live.level.Level())
	}
	if !reflect.DeepEqual(cur.modules, moduleSettings{offered: []string{"queue-copy"}, userDefault: modulesDefaultNone}) {
		t.Errorf("modules: %+v", cur.modules)
	}
	if rec := e.do("GET", "/", "", nil); rec.Code != http.StatusSeeOther {
		t.Errorf("connModes provisioned: the app must now need a session, got %d", rec.Code)
	}
	disk := e.fileOnDisk(t)
	if disk.ConnModes != connProvisioned || disk.Session.IdleMinutes != 1 {
		t.Errorf("file: %+v", disk)
	}
	line := logLine(e.log.String(), `msg="gateway settings saved"`)
	if !strings.Contains(line, "level=INFO") || !strings.Contains(line, "user=admin") ||
		!strings.Contains(line, `changed="[connModes logLevel modules.offered modules.userDefault session.idleMinutes]"`) {
		t.Errorf("a save must be logged at info with who made it and what changed: %s", e.log.String())
	}
	if got := e.settings(t); got.Settings.ConnModes != connProvisioned || got.ChangedOnDisk {
		t.Errorf("GET after save: %+v", got)
	}
}

// audit.stdout and audit.access are live keys: saved, shown by GET, applied to
// the next audit event with no restart, and a body that names one keeps the
// other.
func TestSettings_AuditKeysApplyLive(t *testing.T) {
	e := newManagedEnv(t, nil)
	if cur := e.live.get().audit; cur != (auditSettings{onFailure: auditOnFailureContinue}) {
		t.Fatalf("both options default to off and onFailure to continue, got %+v", cur)
	}
	rec := e.saveSettings(t, `{"audit":{"stdout":true,"access":true}}`)
	expect(t, rec, http.StatusOK, "")
	decodeSave(t, rec)
	if cur := e.live.get().audit; cur != (auditSettings{stdout: true, access: true, onFailure: auditOnFailureContinue}) {
		t.Errorf("not applied: %+v", cur)
	}
	want := fileAudit{Stdout: true, Access: true, OnFailure: auditOnFailureContinue}
	if got := e.settings(t).Settings.Audit; got != want {
		t.Errorf("GET after save: %+v", got)
	}
	if got := e.fileOnDisk(t).Audit; got != want {
		t.Errorf("file: %+v", got)
	}
	if line := logLine(e.log.String(), `msg="gateway settings saved"`); !strings.Contains(line, `changed="[audit.access audit.stdout]"`) {
		t.Errorf("the save must name the audit keys changed: %s", line)
	}
	expect(t, e.saveSettings(t, `{"audit":{"access":false}}`), http.StatusOK, "")
	if cur := e.live.get().audit; cur != (auditSettings{stdout: true, onFailure: auditOnFailureContinue}) {
		t.Errorf("a body naming access must keep stdout and onFailure: %+v", cur)
	}
}

// tls.insecureSkipVerify applies at once: the trust holder takes it with the
// save, no restart is asked for, and nothing is left pending.
func TestSettings_SkipVerifyAppliesAtOnce(t *testing.T) {
	e := newManagedEnv(t, nil)
	holder := newTrustHolder(x509.NewCertPool(), false, quietLogger())
	e.live.bindTrust(holder)

	rec := e.saveSettings(t, `{"tls":{"insecureSkipVerify":true}}`)
	expect(t, rec, http.StatusOK, "")
	decodeSave(t, rec)
	if !e.fileOnDisk(t).TLS.InsecureSkipVerify || !holder.get().skip {
		t.Errorf("the key is saved and live: disk %v, holder %v", e.fileOnDisk(t).TLS.InsecureSkipVerify, holder.get().skip)
	}
	expect(t, e.saveSettings(t, `{"tls":{"insecureSkipVerify":false}}`), http.StatusOK, "")
	if holder.get().skip {
		t.Error("turning it off applies at once too")
	}
}

// The TLS paths are environment only: a body that names one is refused as an
// unknown key and leaves the file alone, and the whole document the page holds
// (which has none) saves.
func TestSettings_PathKeysAreNotSettings(t *testing.T) {
	e := newManagedEnv(t, nil)
	before, _ := os.ReadFile(e.cfgPath)
	for key, body := range map[string]string{
		"tls.certFile": `{"tls":{"certFile":"/data/users.yaml"}}`,
		"tls.keyFile":  `{"tls":{"keyFile":"/nowhere/tls.key"}}`,
		"tls.trustDir": `{"tls":{"trustDir":"/"}}`,
	} {
		t.Run(key, func(t *testing.T) {
			expect(t, e.saveSettings(t, body), http.StatusBadRequest, "bad_request")
		})
	}
	if after, _ := os.ReadFile(e.cfgPath); string(after) != string(before) {
		t.Error("a refused body must leave the file alone")
	}
	whole, err := json.Marshal(e.settings(t).Settings)
	if err != nil {
		t.Fatal(err)
	}
	expect(t, e.saveSettings(t, string(whole)), http.StatusOK, "")
}

// A refused save changes neither the file nor the running gateway.
func TestSettings_Refusals(t *testing.T) {
	e := newManagedEnv(t, nil)
	before, _ := os.ReadFile(e.cfgPath)
	cases := []struct {
		name, body          string
		status              int
		code, field, reason string
	}{
		{"bad value", `{"session":{"idleMinutes":0}}`, 422, "invalid", "settings", `"session.idleMinutes"`},
		{"module outside the catalog", `{"modules":{"offered":["queue-discovery"]}}`, 422, "invalid", "settings", "must be one of queue-browser, queue-copy, queue-subscription-explorer"},
		{"cross check", `{"hosted":false,"connModes":"both"}`, 422, "invalid", "settings", "hosted is false"},
		{"direct would end Provisioned mode", `{"connModes":"direct"}`, 422, "invalid", "connModes", "remove config.yaml from the gateway's data volume and start the gateway with SMU_CONN_MODES=direct"},
		{"managed is retired", `{"managed":true}`, 400, "bad_request", "", ""},
		{"unknown key", `{"bogus":1}`, 400, "bad_request", "", ""},
		{"version is the gateway's", `{"version":2}`, 400, "bad_request", "", ""},
		{"store key path is env-only", `{"storeKeyFile":"/tmp/k"}`, 400, "bad_request", "", ""},
		{"lock-out", `{"access":{"allow":["10.0.0.0/8"]}}`, 409, "would_lock_out", "access.allow", "(192.0.2.10)"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := e.saveSettings(t, tc.body)
			expect(t, rec, tc.status, tc.code)
			got := errorCode(t, rec)
			if got.Field != tc.field || !strings.Contains(got.Reason, tc.reason) {
				t.Errorf("want field %q and a reason with %q, got %+v", tc.field, tc.reason, got)
			}
		})
	}
	after, _ := os.ReadFile(e.cfgPath)
	if string(after) != string(before) || len(e.live.get().access.allow) != 0 || e.live.get().session.idle != 10*time.Minute {
		t.Error("a refused save must leave the file and the live settings alone")
	}
}

// The lock-out check resolves this request's client with the NEW trusted
// proxies, and an allow list that admits it is saved and enforced at once.
func TestSettings_AccessListThatAdmitsTheAdmin(t *testing.T) {
	e := newManagedEnv(t, nil)
	behindProxy := func(body string) *httptest.ResponseRecorder {
		return e.do("PUT", "/managed/settings", withSettingsRev(t, body, e.settings(t).Rev), e.cookie("admin", false), "X-Forwarded-For", "10.9.9.9")
	}
	expect(t, behindProxy(`{"access":{"allow":["10.0.0.0/8"],"trustedProxies":[]}}`), http.StatusConflict, "would_lock_out")
	expect(t, behindProxy(`{"access":{"allow":["10.0.0.0/8"],"trustedProxies":["192.0.2.10/32"]}}`), http.StatusOK, "")
	if rec := e.do("GET", "/managed/me", "", e.cookie("viewer", false)); rec.Code != http.StatusForbidden {
		t.Errorf("a client outside the new list must be denied at once, got %d", rec.Code)
	}
}

// A client the gateway cannot resolve is denied by any allow list, so saving
// one would lock it out.
func TestSettings_LockOutWhenClientUnresolved(t *testing.T) {
	e := newManagedEnv(t, nil)
	req := httptest.NewRequest("PUT", "https://gw.example/managed/settings", strings.NewReader(withSettingsRev(t, `{"access":{"allow":["0.0.0.0/0","::/0"]}}`, e.settings(t).Rev)))
	req.RemoteAddr = "not-an-address"
	req.AddCookie(e.cookie("admin", false))
	rec := httptest.NewRecorder()
	e.root.ServeHTTP(rec, req)
	expect(t, rec, http.StatusConflict, "would_lock_out")
	if got := errorCode(t, rec).Reason; !strings.Contains(got, "cannot tell your address") {
		t.Errorf("reason: %q", got)
	}
}

// The gateway never saves over a hand edit it has not loaded.
func TestSettings_RefusesOverAHandEdit(t *testing.T) {
	e := newManagedEnv(t, nil)
	f, err := os.OpenFile(e.cfgPath, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("# edited by hand\n")
	f.Close()
	if !e.settings(t).ChangedOnDisk {
		t.Error("GET must report the hand edit")
	}
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusConflict, "config_changed_on_disk")
	if data, _ := os.ReadFile(e.cfgPath); !strings.HasSuffix(string(data), "# edited by hand\n") || e.live.level.Level() != slog.LevelWarn {
		t.Error("the hand edit must survive and nothing may apply")
	}
}

// A config.yaml that is gone is a change on disk like any other: GET says so,
// a save is refused 409 config_changed_on_disk and the log is not touched.
func TestSettings_AFileThatIsGoneIsAChangeOnDisk(t *testing.T) {
	e := newManagedEnv(t, nil)
	rev := e.settings(t).Rev
	if err := os.Remove(e.cfgPath); err != nil {
		t.Fatal(err)
	}
	if !e.settings(t).ChangedOnDisk {
		t.Error("GET must report the missing file as a change on disk")
	}
	expect(t, e.saveSettingsRev(t, rev, `{"logLevel":"info"}`), http.StatusConflict, "config_changed_on_disk")
	if e.live.level.Level() != slog.LevelWarn {
		t.Error("nothing may apply")
	}
	if _, err := os.Stat(e.cfgPath); err == nil {
		t.Error("a refused save must not recreate the file")
	}
}

// A file the gateway cannot read is not a hand edit: GET says what is wrong
// and what to do, a save is a failed store write, the log has the cause, and
// neither is remembered as a change on disk.
func TestSettings_UnreadableFileIsNotAHandEdit(t *testing.T) {
	e := newManagedEnv(t, nil)
	rev := e.settings(t).Rev
	if err := os.Remove(e.cfgPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(e.cfgPath, 0o755); err != nil { // reads fail, and it is not "not found"
		t.Fatal(err)
	}
	rec := e.do("GET", "/managed/settings", "", e.cookie("admin", false))
	expect(t, rec, http.StatusInternalServerError, "config_unreadable")
	if got := errorCode(t, rec).Reason; !strings.HasPrefix(got, "The gateway cannot read config.yaml (") || !strings.Contains(got, "once the gateway can read the file again, reload this page") {
		t.Errorf("reason: %q", got)
	}
	expect(t, e.saveSettingsRev(t, rev, `{"logLevel":"info"}`), http.StatusInternalServerError, "store_write_failed")
	if e.live.level.Level() != slog.LevelWarn || !strings.Contains(e.log.String(), "managed: cannot read config file") || !strings.Contains(e.log.String(), "gateway settings not saved") {
		t.Errorf("nothing may apply, and the log names the cause: %s", e.log.String())
	}
}

func TestSettings_WriteFailureIs500AndChangesNothing(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs POSIX permissions and a non-root user")
	}
	e := newManagedEnv(t, nil)
	rev := e.settings(t).Rev
	before := mustRead(t, e.cfgPath)
	dir := filepath.Dir(e.cfgPath)
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
	expect(t, e.saveSettingsRev(t, rev, `{"logLevel":"info"}`), http.StatusInternalServerError, "store_write_failed")
	if e.live.level.Level() != slog.LevelWarn || !strings.Contains(e.log.String(), "gateway settings not saved") {
		t.Errorf("a failed write must apply nothing and log the cause: %s", e.log.String())
	}
	if string(mustRead(t, e.cfgPath)) != string(before) || e.api.settings.rev() != rev {
		t.Error("a failed write must leave the file and the rev as they were")
	}
}

// A settings save is one admin entry naming the keys changed, never their
// values, and the file it wrote; a refusal carries the code checkSettings
// answered.
func TestSettings_SaveIsAudited(t *testing.T) {
	e := newManagedEnv(t, nil)
	au := e.withAudit(t, auditSettings{})
	e.saveSettings(t, `{"logLevel":"debug"}`)
	e.saveSettings(t, `{"connModes":"direct"}`)
	e.saveSettings(t, `{"audit":{"stdout":true,"access":true}}`)
	e.do("PUT", "/managed/settings", `{}`, e.cookie("viewer", false))
	au.expect(t,
		auditEntry{Actor: "admin", Action: "settings.update", Outcome: "ok", Changed: []string{"logLevel"}, Wrote: []auditWrote{{File: "config.yaml"}}, Msg: "admin updated the gateway settings: logLevel"},
		auditEntry{Actor: "admin", Action: "settings.update", Outcome: "refused", Code: "invalid", Msg: "admin could not update the gateway settings: invalid"},
		auditEntry{Actor: "admin", Action: "settings.update", Outcome: "ok", Changed: []string{"audit.access", "audit.stdout"}, Wrote: []auditWrote{{File: "config.yaml"}},
			Msg: "admin updated the gateway settings: audit.access, audit.stdout"},
		auditEntry{Actor: "viewer", Action: "settings.update", Outcome: "refused", Code: "forbidden", Msg: "viewer could not update the gateway settings: forbidden"},
	)
}

// ----- the settings rev ---------------------------------------------------------------

// settingsRig is a settings file over a writer with store key key, loaded from
// the bytes data of path, as the gateway builds them at start.
func settingsRig(t *testing.T, key []byte, path string, data []byte) *settingsFile {
	t.Helper()
	sums, err := newChecksums(key)
	if err != nil {
		t.Fatal(err)
	}
	cfg := defaultConfig()
	wr := newWriter(filepath.Dir(path), sums, quietLogger())
	return newSettingsFile(configSource{path: path, data: data}, cfg, newLive(cfg), wr, quietLogger())
}

// The rev is the keyed checksum of the file as loaded: the same file and key
// give the same rev after a restart, another key a different one, a source
// with no bytes none, and computing it writes nothing.
func TestSettingsRev_SameAcrossARestartDifferentUnderAnotherKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	data, err := seedConfigFile(path, defaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	listing := func() string {
		entries, err := os.ReadDir(dir)
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, en := range entries {
			info, err := en.Info()
			if err != nil {
				t.Fatal(err)
			}
			out = append(out, fmt.Sprintf("%s %d %s", en.Name(), info.Size(), info.ModTime().Format(time.RFC3339Nano)))
		}
		return strings.Join(out, "\n")
	}
	before := listing()
	keyA, keyB := bytes.Repeat([]byte{1}, storeKeyBytes), bytes.Repeat([]byte{2}, storeKeyBytes)
	first := settingsRig(t, keyA, path, data).rev()
	again := settingsRig(t, keyA, path, mustRead(t, path)).rev() // the next start reads the same file
	other := settingsRig(t, keyB, path, data).rev()
	if first == "" || first != again {
		t.Errorf("the same file and key must give the same rev across a restart: %q vs %q", first, again)
	}
	if other == "" || other == first {
		t.Errorf("another store key must give another rev: %q vs %q", other, first)
	}
	if len(first) != 43 || strings.ContainsAny(first, "+/=") {
		t.Errorf("want 32 bytes in base64 raw URL form (43 characters), got %q", first)
	}
	if got := settingsRig(t, keyA, path, nil).rev(); got != "" {
		t.Errorf("a source without bytes has no rev, got %q", got)
	}
	if listing() != before {
		t.Errorf("computing the rev must write nothing:\n%s\nwas:\n%s", listing(), before)
	}
}

// A save moves the rev, the answer and the next GET carry the same new one,
// the commit leaves no journal behind, and a second save made with the old
// rev is stale: 409 with the current rev, the file untouched.
func TestSettings_SaveMovesTheRevAndAStaleSaveIsRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	r1 := e.settings(t).Rev
	rec := e.saveSettingsRev(t, r1, `{"logLevel":"info"}`)
	expect(t, rec, http.StatusOK, "")
	r2 := decodeSave(t, rec).Rev
	data := mustRead(t, e.cfgPath)
	if r2 == "" || r2 == r1 || r2 != e.settings(t).Rev || r2 != checksumRev(e.api.settings.wr.sums.sumOf(data)) {
		t.Fatalf("the answer's rev must be the checksum of the file now: %q (was %q)", r2, r1)
	}
	dir := filepath.Dir(e.cfgPath)
	for _, left := range []string{txnFileName, "config.yaml.bak"} {
		if got := readOr(t, filepath.Join(dir, left)); got != "<absent>" {
			t.Errorf("%s left behind by the commit: %q", left, got)
		}
	}
	assertNoTempFiles(t, dir)

	stale := e.saveSettingsRev(t, r1, `{"logLevel":"debug"}`)
	expect(t, stale, http.StatusConflict, "stale")
	if got := errorCode(t, stale).Rev; got != r2 {
		t.Errorf("a stale answer carries the current rev %q, got %v", r2, got)
	}
	if string(mustRead(t, e.cfgPath)) != string(data) || e.live.level.Level() != slog.LevelInfo || e.api.settings.rev() != r2 {
		t.Error("a stale save must change nothing")
	}
	expect(t, e.saveSettingsRev(t, r2, `{"logLevel":"debug"}`), http.StatusOK, "")
}

// A save with no rev, an empty one or a null one is refused 400 rev_required
// before anything else; a rev that is not a string is a plain bad request.
func TestSettings_ASaveWithoutARevIsRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	before := mustRead(t, e.cfgPath)
	for name, body := range map[string]string{
		"missing": `{"logLevel":"info"}`,
		"empty":   `{"logLevel":"info","rev":""}`,
		"null":    `{"logLevel":"info","rev":null}`,
	} {
		t.Run(name, func(t *testing.T) {
			expect(t, e.do("PUT", "/managed/settings", body, e.cookie("admin", false)), http.StatusBadRequest, "rev_required")
		})
	}
	expect(t, e.do("PUT", "/managed/settings", `{"logLevel":"info","rev":5}`, e.cookie("admin", false)), http.StatusBadRequest, "bad_request")
	if string(mustRead(t, e.cfgPath)) != string(before) || e.live.level.Level() != slog.LevelWarn {
		t.Error("a refused save must change nothing")
	}
}

// A hand edit made after the page was read is found at write time. The
// refusal wins over stale (the rev sent is old as well as the file changed),
// stays in force when the file is put back, and holds for every later save
// whatever rev it carries.
func TestSettings_AHandEditIsFoundAtWriteTimeAndStaysRefused(t *testing.T) {
	e := newManagedEnv(t, nil)
	r1 := e.settings(t).Rev
	original := mustRead(t, e.cfgPath)
	if err := os.WriteFile(e.cfgPath, append(append([]byte{}, original...), "# edited by hand\n"...), 0o644); err != nil {
		t.Fatal(err)
	}
	expect(t, e.saveSettingsRev(t, "an-old-rev", `{"logLevel":"info"}`), http.StatusConflict, "config_changed_on_disk")
	expect(t, e.saveSettingsRev(t, r1, `{"logLevel":"info"}`), http.StatusConflict, "config_changed_on_disk")
	if err := os.WriteFile(e.cfgPath, original, 0o644); err != nil { // the edit is undone, the refusal is not
		t.Fatal(err)
	}
	expect(t, e.saveSettingsRev(t, r1, `{"logLevel":"info"}`), http.StatusConflict, "config_changed_on_disk")
	if got := e.settings(t); !got.ChangedOnDisk || got.Rev != r1 {
		t.Errorf("GET keeps reporting it, with the rev the gateway last read: %+v", got)
	}
	if string(mustRead(t, e.cfgPath)) != string(original) || e.live.level.Level() != slog.LevelWarn {
		t.Error("nothing may be written or applied")
	}
}

// A save by someone who is no longer an administrator when the writer lock is
// theirs is refused as the gate would: 403 for a user who lost the flag, 401
// for one who is gone.
func TestSettings_TheCallerIsCheckedAgainWhenTheLockIsHeld(t *testing.T) {
	e := newManagedEnv(t, nil)
	asUser := func(name string) *http.Request {
		req := httptest.NewRequest("PUT", "https://gw.example/managed/settings", nil)
		return req.WithContext(withSession(req.Context(), activeSession{session: session{user: name}}))
	}
	if err := e.api.settingsCaller(asUser("admin")); err != nil {
		t.Errorf("an administrator passes: %v", err)
	}
	for name, want := range map[string]struct {
		status int
		code   string
	}{"viewer": {http.StatusForbidden, "forbidden"}, "ghost": {http.StatusUnauthorized, "unauthenticated"}} {
		status, body, ok := classifyStoreError(e.api.settingsCaller(asUser(name)))
		if !ok || status != want.status || body.Error != want.code {
			t.Errorf("%s: got %d %+v (%v), want %d %s", name, status, body, ok, want.status, want.code)
		}
	}
}

// ----- stageSettings (the import's way in) ----------------------------------------------

// Staging validates and stages inside somebody else's transaction: nothing is
// on disk or live until it commits, the changed keys come back, and the settings rev after the commit is the new checksum.
func TestStageSettings_AppliesOnlyWhenTheTransactionCommits(t *testing.T) {
	e := newManagedEnv(t, nil)
	sf := e.api.settings
	req := httptest.NewRequest("POST", "https://gw.example/managed/backup/import", nil)
	req.RemoteAddr = "192.0.2.10:5000"
	next := sf.current()
	next.LogLevel, next.TLS.InsecureSkipVerify, next.Audit.OnFailure = "info", true, auditOnFailureRefuse
	holder := newTrustHolder(x509.NewCertPool(), false, quietLogger())
	e.live.bindTrust(holder)
	before, revBefore := mustRead(t, e.cfgPath), sf.rev()

	var staged stagedSettings
	err := sf.wr.Do(t.Context(), func(tx *txn) error {
		if err := tx.check(sf.path); err != nil {
			return err
		}
		var err error
		if staged, err = e.api.stageSettings(tx, req, next); err != nil {
			return err
		}
		if string(mustRead(t, e.cfgPath)) != string(before) || e.live.level.Level() != slog.LevelWarn || sf.current().LogLevel != "warn" || holder.get().skip {
			t.Error("nothing may be written or applied before the commit")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(staged.changed, []string{"audit.onFailure", "logLevel", "tls.insecureSkipVerify"}) {
		t.Errorf("staged: %+v", staged)
	}
	disk := e.fileOnDisk(t)
	if disk.LogLevel != "info" || disk.Audit.OnFailure != auditOnFailureRefuse || !disk.TLS.InsecureSkipVerify {
		t.Errorf("file: %+v", disk)
	}
	if e.live.level.Level() != slog.LevelInfo || e.live.get().audit.onFailure != auditOnFailureRefuse || sf.current().LogLevel != "info" || !holder.get().skip {
		t.Error("the live keys, tls.insecureSkipVerify and the saved file must apply with the commit")
	}
	if rev := sf.rev(); rev == revBefore || rev != checksumRev(sf.wr.sums.sumOf(mustRead(t, e.cfgPath))) {
		t.Errorf("the rev after the commit is the new checksum, got %q (was %q)", rev, revBefore)
	}
}

// A document that still holds the removed path keys (the settings of an old
// backup) stages as if it did not: the keys are never refused, and the file
// the commit writes has none of them.
func TestStageSettings_DropsTheRemovedPathKeys(t *testing.T) {
	e := newManagedEnv(t, nil)
	sf := e.api.settings
	req := httptest.NewRequest("POST", "https://gw.example/managed/backup/import", nil)
	req.RemoteAddr = "192.0.2.10:5000"
	old := "/old/trust"
	next := sf.current()
	next.TLS.RemovedTrustDir = &old
	next.LogLevel = "info"
	err := sf.wr.Do(t.Context(), func(tx *txn) error {
		_, err := e.api.stageSettings(tx, req, next)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	raw := string(mustRead(t, e.cfgPath))
	if strings.Contains(raw, "\n  trustDir:") || !strings.Contains(raw, "logLevel: info") {
		t.Errorf("the file must carry the change and not the removed key:\n%s", raw)
	}
}

// A document startup would refuse and a direct-only mode are refusals
// returned from the staging, as the page answers them; the transaction stages
// nothing.
func TestStageSettings_RefusalsComeBackAsErrors(t *testing.T) {
	e := newManagedEnv(t, nil)
	sf := e.api.settings
	req := httptest.NewRequest("POST", "https://gw.example/managed/backup/import", nil)
	req.RemoteAddr = "192.0.2.10:5000"
	before := mustRead(t, e.cfgPath)
	cases := map[string]struct {
		mutate      func(*fileConfig)
		status      int
		code, field string
	}{
		"bad value":  {func(f *fileConfig) { f.Session.IdleMinutes = 0 }, 422, "invalid", "settings"},
		"bad onFail": {func(f *fileConfig) { f.Audit.OnFailure = "stop" }, 422, "invalid", "settings"},
		"direct":     {func(f *fileConfig) { f.ConnModes = connDirect }, 422, "invalid", "connModes"},
		"lock-out":   {func(f *fileConfig) { f.Access.Allow = []string{"10.0.0.0/8"} }, 409, "would_lock_out", "access.allow"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			next := sf.current()
			tc.mutate(&next)
			staged := false
			err := sf.wr.Do(t.Context(), func(tx *txn) error {
				_, err := e.api.stageSettings(tx, req, next)
				staged = len(tx.paths()) > 0
				return err
			})
			status, body, ok := classifyStoreError(err)
			if !ok || status != tc.status || body.Error != tc.code || body.Field != tc.field || staged {
				t.Errorf("got %d %+v (%v), staged %v; want %d %s on %s", status, body, ok, staged, tc.status, tc.code, tc.field)
			}
		})
	}
	if string(mustRead(t, e.cfgPath)) != string(before) {
		t.Error("a refused staging must leave the file alone")
	}
}

// A refusal carries its own status and body through the one error mapping,
// also when wrapped.
func TestRefusalError_IsAnsweredAsItSays(t *testing.T) {
	err := newRefusal(http.StatusConflict, apiError{Error: "would_lock_out", Field: "access.allow", Reason: "no"})
	status, body, ok := classifyStoreError(fmt.Errorf("staging: %w", err))
	if !ok || status != http.StatusConflict || body.Error != "would_lock_out" || body.Field != "access.allow" {
		t.Errorf("got %d %+v (%v)", status, body, ok)
	}
	if err.Error() != "would_lock_out: no" || newRefusal(403, apiError{Error: "forbidden"}).Error() != "forbidden" {
		t.Errorf("error text: %q", err)
	}
	rec := httptest.NewRecorder()
	if code, handled := writeStoreError(rec, err); !handled || code != "would_lock_out" || rec.Code != http.StatusConflict {
		t.Errorf("writeStoreError: %q %v %d", code, handled, rec.Code)
	}
}

// ----- audit.onFailure ---------------------------------------------------------------

// audit.onFailure is saved, shown, validated and applied at once, and a body
// naming only onFailure keeps the other audit keys.
func TestSettings_AuditOnFailureIsALiveKey(t *testing.T) {
	e := newManagedEnv(t, nil)
	if got := e.settings(t).Settings.Audit.OnFailure; got != auditOnFailureContinue {
		t.Fatalf("default: %q", got)
	}
	expect(t, e.saveSettings(t, `{"audit":{"stdout":true}}`), http.StatusOK, "")
	rec := e.saveSettings(t, `{"audit":{"onFailure":"refuse"}}`)
	expect(t, rec, http.StatusOK, "")
	decodeSave(t, rec)
	if cur := e.live.get().audit; cur != (auditSettings{stdout: true, onFailure: auditOnFailureRefuse}) {
		t.Errorf("not applied: %+v", cur)
	}
	if got := e.fileOnDisk(t).Audit; got != (fileAudit{Stdout: true, OnFailure: auditOnFailureRefuse}) {
		t.Errorf("file: %+v", got)
	}
	if line := logLine(e.log.String(), `msg="gateway settings saved"`, "audit.onFailure"); line == "" {
		t.Errorf("the save must name audit.onFailure as changed: %s", e.log.String())
	}
	bad := e.saveSettings(t, `{"audit":{"onFailure":"stop"}}`)
	expect(t, bad, http.StatusUnprocessableEntity, "invalid")
	if got := errorCode(t, bad); got.Field != "settings" || !strings.Contains(got.Reason, `"audit.onFailure"`) || !strings.Contains(got.Reason, `"stop"`) {
		t.Errorf("the refusal names the key and the value: %+v", got)
	}
	if e.live.get().audit.onFailure != auditOnFailureRefuse {
		t.Error("a refused value must change nothing")
	}
}

// ----- login.twoFactor ---------------------------------------------------------------

// login.twoFactor is saved, shown, validated and applied at once, a body that
// names another login key keeps it, and a refused value changes nothing.
func TestSettings_TwoFactorIsALiveKey(t *testing.T) {
	e := newManagedEnv(t, nil)
	if got := e.settings(t).Settings.Login.TwoFactor; got != twoFactorOptional || e.live.twoFactor() != twoFactorOptional {
		t.Fatalf("default: shown %q, live %q", got, e.live.twoFactor())
	}
	for _, mode := range []string{twoFactorOptional, twoFactorAdmins, twoFactorMandatory} {
		rec := e.saveSettings(t, `{"login":{"twoFactor":"`+mode+`"}}`)
		expect(t, rec, http.StatusOK, "")
		decodeSave(t, rec)
		if e.live.twoFactor() != mode || e.settings(t).Settings.Login.TwoFactor != mode || e.fileOnDisk(t).Login.TwoFactor != mode {
			t.Errorf("%s: not applied, shown and written", mode)
		}
	}
	expect(t, e.saveSettings(t, `{"login":{"twoFactor":"admins"}}`), http.StatusOK, "")
	if line := logLine(e.log.String(), `msg="gateway settings saved"`, "login.twoFactor"); line == "" {
		t.Errorf("the save must name login.twoFactor as changed: %s", e.log.String())
	}
	expect(t, e.saveSettings(t, `{"login":{"maxFailures":9}}`), http.StatusOK, "")
	if e.live.twoFactor() != twoFactorAdmins || e.live.get().login.maxFailures != 9 {
		t.Errorf("a body naming another login key must keep twoFactor: %q %+v", e.live.twoFactor(), e.live.get().login)
	}
	for _, value := range []string{"everyone", "off"} {
		bad := e.saveSettings(t, `{"login":{"twoFactor":"`+value+`"}}`)
		expect(t, bad, http.StatusUnprocessableEntity, "invalid")
		if got := errorCode(t, bad); got.Field != "login.twoFactor" || !strings.Contains(got.Reason, `"login.twoFactor"`) || !strings.Contains(got.Reason, `"`+value+`"`) {
			t.Errorf("%s: the refusal is on the field and names the value: %+v", value, got)
		}
	}
	if e.live.twoFactor() != twoFactorAdmins || e.fileOnDisk(t).Login.TwoFactor != twoFactorAdmins {
		t.Error("a refused value must change nothing")
	}
}

// settingsChanges lists login.twoFactor by its dotted name.
func TestSettingsChanges_ListsTwoFactor(t *testing.T) {
	a, b := defaultFileConfig(), defaultFileConfig()
	b.Login.TwoFactor = twoFactorMandatory
	if got := settingsChanges(a, b); !reflect.DeepEqual(got, []string{"login.twoFactor"}) {
		t.Errorf("got %v", got)
	}
}

// settingsChanges lists audit.onFailure by its dotted name.
func TestSettingsChanges_ListsAuditOnFailure(t *testing.T) {
	a, b := defaultFileConfig(), defaultFileConfig()
	b.Audit.OnFailure = auditOnFailureRefuse
	if got := settingsChanges(a, b); !reflect.DeepEqual(got, []string{"audit.onFailure"}) {
		t.Errorf("got %v", got)
	}
}

// withLoudAudit gives every piece an auditor whose application log is captured,
// over a temp file, and returns it with that log.
func (e *managedEnv) withLoudAudit(t *testing.T) (*auditor, *strings.Builder) {
	t.Helper()
	var log strings.Builder
	a, err := openAuditor(filepath.Join(t.TempDir(), "audit.log"), e.live, io.Discard, newCapturingLogger(&log))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.close() })
	a.now = func() time.Time { return time.Date(2026, 11, 12, 9, 30, 0, 0, time.UTC) }
	e.routes.setAuditor(a)
	return a, &log
}

// continue: a change whose audit record cannot be written stands, the request
// succeeds, and every lost record is logged loudly with its fields.
func TestSettings_OnFailureContinueKeepsTheChangeAndLogsTheLostRecord(t *testing.T) {
	e := newManagedEnv(t, nil)
	a, log := e.withLoudAudit(t)
	_ = a.f.Close() // the audit log is no longer writable
	expect(t, e.saveSettings(t, `{"logLevel":"debug"}`), http.StatusOK, "")
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusOK, "")
	if e.fileOnDisk(t).LogLevel != "info" || e.live.level.Level() != slog.LevelInfo {
		t.Error("the change must stand")
	}
	if n := strings.Count(log.String(), "AUDIT RECORD LOST"); n != 2 {
		t.Fatalf("want one loud line per lost record, got %d: %s", n, log.String())
	}
	if line := logLine(log.String(), "AUDIT RECORD LOST", "action=settings.update", "actor=admin", "outcome=ok", "config.yaml"); line == "" {
		t.Errorf("the lost record's fields must be in the line: %s", log.String())
	}
}

// refuse: the change that meets the failure stands; the next change is refused
// 503 audit_unavailable with nothing written, while reads still work; once the
// log is writable the refusal's own audit line clears the state and the change
// after it goes through.
func TestSettings_OnFailureRefuseRefusesUntilTheLogIsWritable(t *testing.T) {
	e := newManagedEnv(t, nil)
	a, _ := e.withLoudAudit(t)
	expect(t, e.saveSettings(t, `{"audit":{"onFailure":"refuse"}}`), http.StatusOK, "")
	_ = a.f.Close()

	expect(t, e.saveSettings(t, `{"logLevel":"debug"}`), http.StatusOK, "") // meets the failure: stands
	if e.live.level.Level() != slog.LevelDebug {
		t.Fatal("the change that met the failure must stand")
	}
	before, rev := mustRead(t, e.cfgPath), e.api.settings.rev()
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusServiceUnavailable, "audit_unavailable")
	if string(mustRead(t, e.cfgPath)) != string(before) || e.api.settings.rev() != rev || e.live.level.Level() != slog.LevelDebug {
		t.Error("a refused change must write and apply nothing")
	}
	expect(t, e.do("GET", "/managed/settings", "", e.cookie("admin", false)), http.StatusOK, "") // reads are never refused

	a.mu.Lock()
	a.f = nil // the next write reopens the file: space is back
	a.mu.Unlock()
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusServiceUnavailable, "audit_unavailable") // its refusal line is written, and clears the state
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusOK, "")
	if e.live.level.Level() != slog.LevelInfo {
		t.Error("the change after recovery must apply")
	}
	lines := fileLines(t, a.path)
	if len(lines) != 3 || !strings.Contains(lines[1], `"code":"audit_unavailable"`) || !strings.Contains(lines[1], `"outcome":"refused"`) || !strings.Contains(lines[2], `"outcome":"ok"`) {
		t.Errorf("want the onFailure change, the refusal audited as audit_unavailable and the change after recovery: %q", lines)
	}
}
