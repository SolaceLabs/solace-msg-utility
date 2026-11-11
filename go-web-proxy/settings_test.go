package main

import (
	"encoding/json"
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

func (e *managedEnv) saveSettings(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	return e.do("PUT", "/managed/settings", body, e.cookie("admin", false))
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
	s := e.settings(t)
	want := fileConfigFromConfig(e.cfg)
	want.Version = 0 // never sent
	if !reflect.DeepEqual(s.Settings, want) {
		t.Errorf("settings:\n%+v\nwant:\n%+v", s.Settings, want)
	}
	if !reflect.DeepEqual(s.RestartOnly, restartOnlyKeyNames()) || len(s.PendingRestart) != 0 || s.ChangedOnDisk {
		t.Errorf("flags: %+v", s)
	}
	if want := []string{"tls.certFile", "tls.keyFile", "tls.trustDir"}; !reflect.DeepEqual(s.HostOnly, want) {
		t.Errorf("hostOnly: %v, want %v", s.HostOnly, want)
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
	if strings.TrimSpace(rec.Body.String()) != `{"restartRequired":[]}` {
		t.Errorf("live keys need no restart: %s", rec.Body.String())
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
	if disk.ConnModes != connProvisioned || disk.Session.IdleMinutes != 1 || disk.TLS.CertFile != e.cfg.certFile {
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

func TestSettings_RestartOnlyKeysAreSavedAndFlagged(t *testing.T) {
	e := newManagedEnv(t, nil)
	rec := e.saveSettings(t, `{"tls":{"insecureSkipVerify":true}}`)
	expect(t, rec, http.StatusOK, "")
	if strings.TrimSpace(rec.Body.String()) != `{"restartRequired":["tls.insecureSkipVerify"]}` {
		t.Errorf("restartRequired: %s", rec.Body.String())
	}
	if got := e.settings(t).PendingRestart; !reflect.DeepEqual(got, []string{"tls.insecureSkipVerify"}) {
		t.Errorf("pendingRestart: %v", got)
	}
	if !e.fileOnDisk(t).TLS.InsecureSkipVerify {
		t.Error("a restart-only key is still saved")
	}
	expect(t, e.saveSettings(t, `{"tls":{"insecureSkipVerify":false}}`), http.StatusOK, "")
	if got := e.settings(t).PendingRestart; len(got) != 0 {
		t.Errorf("back to the running values: want nothing pending, got %v", got)
	}
}

// A path key changes only by a hand edit: pointed anywhere, it would let the
// gateway serve its own secrets or overwrite a store at the next start. The
// page resends every key, so the saved paths themselves are accepted.
func TestSettings_PathKeysChangeOnlyOnTheHost(t *testing.T) {
	e := newManagedEnv(t, nil)
	before, _ := os.ReadFile(e.cfgPath)
	for key, body := range map[string]string{
		"tls.certFile": `{"tls":{"certFile":"/data/users.yaml"}}`,
		"tls.keyFile":  `{"tls":{"keyFile":"/nowhere/tls.key"}}`,
		"tls.trustDir": `{"tls":{"trustDir":"/"}}`,
	} {
		t.Run(key, func(t *testing.T) {
			rec := e.saveSettings(t, body)
			expect(t, rec, http.StatusUnprocessableEntity, "invalid")
			if got := errorCode(t, rec); got.Field != key || !strings.Contains(got.Reason, "only in config.yaml on the gateway host") {
				t.Errorf("want field %q and the hand-edit reason, got %+v", key, got)
			}
		})
	}
	if after, _ := os.ReadFile(e.cfgPath); string(after) != string(before) {
		t.Error("a refused path change must leave the file alone")
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
		{"direct would end Provisioned mode", `{"connModes":"direct"}`, 422, "invalid", "connModes", "set connModes: direct in config.yaml on the gateway host and restart"},
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
		return e.do("PUT", "/managed/settings", body, e.cookie("admin", false), "X-Forwarded-For", "10.9.9.9")
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
	req := httptest.NewRequest("PUT", "https://gw.example/managed/settings", strings.NewReader(`{"access":{"allow":["0.0.0.0/0","::/0"]}}`))
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

// A file the gateway cannot read is not a hand edit: both calls say what is
// wrong and what to do, and the log has the cause.
func TestSettings_UnreadableFileIsNotAHandEdit(t *testing.T) {
	e := newManagedEnv(t, nil)
	if err := os.Remove(e.cfgPath); err != nil {
		t.Fatal(err)
	}
	for _, rec := range []*httptest.ResponseRecorder{
		e.do("GET", "/managed/settings", "", e.cookie("admin", false)),
		e.saveSettings(t, `{"logLevel":"info"}`),
	} {
		expect(t, rec, http.StatusInternalServerError, "config_unreadable")
		if got := errorCode(t, rec).Reason; !strings.Contains(got, "missing on the gateway host") || !strings.Contains(got, "Restart the gateway") {
			t.Errorf("reason: %q", got)
		}
	}
	if e.live.level.Level() != slog.LevelWarn || !strings.Contains(e.log.String(), "managed: cannot read config file") {
		t.Errorf("nothing may apply, and the log names the cause: %s", e.log.String())
	}
	if err := os.Mkdir(e.cfgPath, 0o755); err != nil {
		t.Fatal(err)
	}
	rec := e.saveSettings(t, `{"logLevel":"info"}`)
	expect(t, rec, http.StatusInternalServerError, "config_unreadable")
	if got := errorCode(t, rec).Reason; !strings.HasPrefix(got, "The gateway cannot read config.yaml (") {
		t.Errorf("reason: %q", got)
	}
}

func TestSettings_WriteFailureIs500AndChangesNothing(t *testing.T) {
	if runtime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("needs POSIX permissions and a non-root user")
	}
	e := newManagedEnv(t, nil)
	dir := filepath.Dir(e.cfgPath)
	if err := os.Chmod(dir, 0o555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(dir, 0o755) })
	expect(t, e.saveSettings(t, `{"logLevel":"info"}`), http.StatusInternalServerError, "server_error")
	if e.live.level.Level() != slog.LevelWarn || !strings.Contains(e.log.String(), "op=saveSettings") {
		t.Errorf("a failed write must apply nothing and log the cause: %s", e.log.String())
	}
}
