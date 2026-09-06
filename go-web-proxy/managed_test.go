//go:build managed

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func newTestHandler(t *testing.T) *managedHandler {
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
	return newManagedHandler(s, quietLogger())
}

func post(h *managedHandler, path string, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestManaged_GetConnections_OK(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "token": "tok-admin"})
	rec := post(h, "/managed/getConnections", string(body))
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var prof profileResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &prof); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !prof.Admin || len(prof.Brokers) != 2 {
		t.Errorf("unexpected profile: admin=%v brokers=%d", prof.Admin, len(prof.Brokers))
	}
	if prof.SiteSeed == "" {
		t.Error("response should carry the siteSeed")
	}
}

func TestManaged_GetConnections_BadCredsReturns400(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "token": "wrong"})
	rec := post(h, "/managed/getConnections", string(body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestManaged_GetConnections_BadBodyReturns400(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/getConnections", "not json")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestManaged_GetConnections_MethodNotAllowed(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/managed/getConnections", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405, got %d", rec.Code)
	}
}

func TestManaged_Reload_OK_AppliesDiskEditsForAnyUser(t *testing.T) {
	h := newTestHandler(t)
	// Out-of-band edit: add broker b3 on disk.
	writeFile(t, h.store.connsPath, connsYAML+"  - broker: b3\n    hostname: host3\n    semp:\n      port: 1943\n      username: mon\n      password: PKD:semp-b3\n    client:\n      port: 1443\n      msgVpns:\n        - name: v3\n          username: u3\n          password: PKD:cli-b3v3\n")

	// Reload as a NON-admin user (viewer) — any logged-in user may trigger it.
	rec := post(h, "/managed/reload", `{"username":"viewer","token":"tok-viewer"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("reload: want 204, got %d", rec.Code)
	}

	// The disk edit is now visible: admin sees the new broker.
	rec2 := post(h, "/managed/getConnections", `{"username":"admin","token":"tok-admin"}`)
	var prof profileResponse
	if err := json.Unmarshal(rec2.Body.Bytes(), &prof); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(prof.Brokers) != 3 {
		t.Errorf("reload should have added b3; want 3 brokers, got %d", len(prof.Brokers))
	}
}

func TestManaged_Reload_BadCredsReturns400(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/reload", `{"username":"viewer","token":"wrong"}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestManaged_Reload_BadBodyReturns400(t *testing.T) {
	h := newTestHandler(t)
	if rec := post(h, "/managed/reload", "not json"); rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestManaged_Reload_MethodNotAllowed(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/managed/reload", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("want 405, got %d", rec.Code)
	}
}

func TestManaged_Reload_ReadErrorReturns500(t *testing.T) {
	h := newTestHandler(t)
	writeFile(t, h.store.usersPath, "msg-utility-users:\n  - [malformed") // unparseable
	rec := post(h, "/managed/reload", `{"username":"admin","token":"tok-admin"}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}

func TestManaged_UnknownPathReturns404(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/managed/nope", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", rec.Code)
	}
}

// ----- admin CRUD endpoints --------------------------------------------------

var crudPaths = []string{
	"/managed/listUsers", "/managed/saveUser", "/managed/deleteUser",
	"/managed/listConnections", "/managed/saveConnection", "/managed/deleteConnection",
}

func TestManaged_CRUD_MethodNotAllowed(t *testing.T) {
	h := newTestHandler(t)
	for _, p := range crudPaths {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s GET: want 405, got %d", p, rec.Code)
		}
	}
}

func TestManaged_CRUD_BadBodyReturns400(t *testing.T) {
	h := newTestHandler(t)
	for _, p := range crudPaths {
		rec := post(h, p, "not json")
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s bad body: want 400, got %d", p, rec.Code)
		}
	}
}

func TestManaged_CRUD_NonAdminRejected(t *testing.T) {
	h := newTestHandler(t)
	// viewer is a valid, authenticated, NON-admin user — every CRUD endpoint
	// must reject it with the same opaque 400.
	bodies := map[string]string{
		"/managed/listUsers":        `{"username":"viewer","token":"tok-viewer"}`,
		"/managed/saveUser":         `{"username":"viewer","token":"tok-viewer","user":{"username":"x","password":"p"}}`,
		"/managed/deleteUser":       `{"username":"viewer","token":"tok-viewer","target":"x"}`,
		"/managed/listConnections":  `{"username":"viewer","token":"tok-viewer"}`,
		"/managed/saveConnection":   `{"username":"viewer","token":"tok-viewer","connection":{"broker":"x"}}`,
		"/managed/deleteConnection": `{"username":"viewer","token":"tok-viewer","target":"x"}`,
	}
	for p, b := range bodies {
		rec := post(h, p, b)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s non-admin: want 400, got %d", p, rec.Code)
		}
	}
}

func TestManaged_ListUsers_OK_NoPasswordLeak(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/listUsers", `{"username":"admin","token":"tok-admin"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var resp struct {
		Users []userJSON `json:"users"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Users) != 2 {
		t.Fatalf("want 2 users, got %d", len(resp.Users))
	}
	for _, u := range resp.Users {
		if u.Password != "" {
			t.Errorf("listUsers must not leak the token for %s, got %q", u.Username, u.Password)
		}
	}
}

func TestManaged_SaveUser_CreateThenAuthsAsAdmin(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"user": map[string]any{
			"username": "carol", "password": "S1:carol", "admin": true,
			"operate": []map[string]string{{"brokers": "*", "msgVpns": "*", "queues": "*"}},
		},
	})
	rec := post(h, "/managed/saveUser", string(body))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
	// carol is now an admin and can drive an admin endpoint.
	rec2 := post(h, "/managed/listUsers", `{"username":"carol","token":"S1:carol"}`)
	if rec2.Code != http.StatusOK {
		t.Errorf("new admin carol should list users, got %d", rec2.Code)
	}
}

func TestManaged_SaveUser_MissingUsername400(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"user": map[string]any{"username": "", "password": "S1:x"},
	})
	rec := post(h, "/managed/saveUser", string(body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}

func TestManaged_SaveUser_PersistError500(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	writeFile(t, blocker, "x")
	h.store.usersPath = filepath.Join(blocker, "users.yaml") // parent is a file → write fails
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"user": map[string]any{"username": "bob", "password": "S1:bob"},
	})
	rec := post(h, "/managed/saveUser", string(body))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}

func TestManaged_SaveUser_BlankNewPassword400(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"user": map[string]any{"username": "ghost", "password": "", "admin": true},
	})
	rec := post(h, "/managed/saveUser", string(body))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("blank-password new user: want 400, got %d", rec.Code)
	}
	// no empty-token admin must have been minted
	if rec2 := post(h, "/managed/listUsers", `{"username":"ghost","token":""}`); rec2.Code == http.StatusOK {
		t.Error("an empty-token admin account must not exist")
	}
}

func TestManaged_DeleteUser_LastAdminReturns409(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/deleteUser", `{"username":"admin","token":"tok-admin","target":"admin"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("deleting the last admin: want 409, got %d", rec.Code)
	}
}

func TestConnToOutput_EmptyVpnsSerializesAsArray(t *testing.T) {
	out := connToOutput(connRec{Broker: "b", Hostname: "h"})
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"msgVpns":[]`) {
		t.Errorf("a VPN-less connection must serialize msgVpns as [], got %s", b)
	}
}

func TestManaged_DeleteUser_PersistError500(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	writeFile(t, blocker, "x")
	h.store.usersPath = filepath.Join(blocker, "users.yaml") // parent is a file → write fails
	rec := post(h, "/managed/deleteUser", `{"username":"admin","token":"tok-admin","target":"viewer"}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}

func TestManaged_DeleteUser_OKAndNotFound(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/deleteUser", `{"username":"admin","token":"tok-admin","target":"viewer"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
	rec2 := post(h, "/managed/deleteUser", `{"username":"admin","token":"tok-admin","target":"ghost"}`)
	if rec2.Code != http.StatusNotFound {
		t.Errorf("deleting unknown user: want 404, got %d", rec2.Code)
	}
}

func TestManaged_ListConnections_OK_NoPasswordLeak(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/listConnections", `{"username":"admin","token":"tok-admin"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rec.Code)
	}
	var resp struct {
		Connections []connJSON `json:"connections"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Connections) != 2 {
		t.Fatalf("want 2 connections, got %d", len(resp.Connections))
	}
	for _, c := range resp.Connections {
		if c.Semp.Pass != "" {
			t.Errorf("semp pass leaked for %s: %q", c.Broker, c.Semp.Pass)
		}
		for _, v := range c.Client.MsgVpns {
			if v.Pass != "" {
				t.Errorf("vpn pass leaked for %s/%s: %q", c.Broker, v.Name, v.Pass)
			}
		}
	}
}

func TestManaged_SaveConnection_CreateAndMissingBroker(t *testing.T) {
	h := newTestHandler(t)
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"connection": map[string]any{
			"broker": "b3", "hostname": "host3",
			"semp":   map[string]string{"port": "1943", "user": "mon", "pass": "V1:s"},
			"client": map[string]any{"port": "1443", "msgVpns": []map[string]string{{"name": "v1", "user": "u", "pass": "V1:c"}}},
		},
	})
	if rec := post(h, "/managed/saveConnection", string(body)); rec.Code != http.StatusNoContent {
		t.Fatalf("create: want 204, got %d", rec.Code)
	}
	body2, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"connection": map[string]any{"broker": ""},
	})
	if rec := post(h, "/managed/saveConnection", string(body2)); rec.Code != http.StatusBadRequest {
		t.Errorf("missing broker: want 400, got %d", rec.Code)
	}
}

func TestManaged_SaveConnection_PersistError500(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	writeFile(t, blocker, "x")
	h.store.connsPath = filepath.Join(blocker, "conns.yaml") // parent is a file → write fails
	body, _ := json.Marshal(map[string]any{
		"username": "admin", "token": "tok-admin",
		"connection": map[string]any{"broker": "b9", "hostname": "h9"},
	})
	rec := post(h, "/managed/saveConnection", string(body))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}

func TestManaged_DeleteConnection_OKAndNotFound(t *testing.T) {
	h := newTestHandler(t)
	rec := post(h, "/managed/deleteConnection", `{"username":"admin","token":"tok-admin","target":"b2"}`)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("want 204, got %d", rec.Code)
	}
	rec2 := post(h, "/managed/deleteConnection", `{"username":"admin","token":"tok-admin","target":"nope"}`)
	if rec2.Code != http.StatusNotFound {
		t.Errorf("want 404, got %d", rec2.Code)
	}
}

func TestManaged_DeleteConnection_PersistError500(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	blocker := filepath.Join(dir, "blocker")
	writeFile(t, blocker, "x")
	h.store.connsPath = filepath.Join(blocker, "conns.yaml") // parent is a file → write fails
	rec := post(h, "/managed/deleteConnection", `{"username":"admin","token":"tok-admin","target":"b1"}`)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", rec.Code)
	}
}
