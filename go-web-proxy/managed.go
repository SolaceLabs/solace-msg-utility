//go:build managed

package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
)

// managedHandler serves the /managed/* endpoints (managed RBAC mode). It is
// only wired into the mux when MANAGED=true; otherwise /managed/* falls through
// to the SPA, leaving non-managed deployments exactly as before.
type managedHandler struct {
	store  *store
	logger *slog.Logger
}

func newManagedHandler(s *store, logger *slog.Logger) *managedHandler {
	return &managedHandler{store: s, logger: logger}
}

func (h *managedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/managed/getConnections":
		h.getConnections(w, r)
	case "/managed/reload":
		h.reload(w, r)
	case "/managed/listUsers":
		h.listUsers(w, r)
	case "/managed/saveUser":
		h.saveUser(w, r)
	case "/managed/deleteUser":
		h.deleteUser(w, r)
	case "/managed/listConnections":
		h.listConnections(w, r)
	case "/managed/saveConnection":
		h.saveConnection(w, r)
	case "/managed/deleteConnection":
		h.deleteConnection(w, r)
	default:
		http.NotFound(w, r)
	}
}

// methodPost rejects non-POST requests with 405; returns true to proceed. All
// /managed/* endpoints are POST (the resend-token creds travel in the JSON
// body, which fetch cannot attach to a GET).
func (h *managedHandler) methodPost(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return false
	}
	return true
}

// decodeBody decodes the JSON request body into dst; on a malformed body it
// writes 400 and returns false (the caller must return). Shared by every
// /managed/* handler so the bad-body response is identical across them.
func (h *managedHandler) decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return false
	}
	return true
}

// writeJSON sends v as JSON with no-store caching. A late encode failure (after
// headers are sent) is only logged — it cannot be turned into an error status.
func (h *managedHandler) writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		h.logger.Error("managed: response encode failed", "err", err)
	}
}

func (h *managedHandler) getConnections(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}

	profile, ok := h.store.getConnections(body.Username, body.Token)
	if !ok {
		// Unknown user and bad token are intentionally indistinguishable.
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	h.writeJSON(w, profile)
}

// reload re-reads users.yaml + connections.yaml from disk into the in-memory
// store so out-of-band edits take effect without a restart. Available to any
// logged-in user (the managed-connections Refresh button drives it). 400 for an
// unknown user / bad token; 500 if a file can't be re-read.
func (h *managedHandler) reload(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authUser(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if err := h.store.reload(); err != nil {
		h.logger.Error("reload: re-read failed", "err", err)
		http.Error(w, "reload failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ----- admin CRUD endpoints (resend-token; admin-gated) -----------------------
//
// Every endpoint is POST with a JSON body carrying the caller's admin
// {username, token} (resent per call — there is no session layer; documented as
// an accepted non-standard choice for these few admin-only endpoints) plus the
// operation payload. Auth is string-match + admin:true; unknown user, bad
// token, and non-admin are all the same opaque 400. Passwords are NEVER read
// back to the client: list endpoints strip them, and a blank password on edit
// keeps the stored secret (see store.upsertUser / mergeConnSecrets).

// --- JSON wire shapes (camelCase; distinct from the YAML structs) ---

type permJSON struct {
	Brokers string `json:"brokers"`
	MsgVpns string `json:"msgVpns"`
	Queues  string `json:"queues"`
}

type userJSON struct {
	Username string     `json:"username"`
	Password string     `json:"password"` // client-stamped (S1:); "" = keep on edit
	Admin    bool       `json:"admin"`
	Operate  []permJSON `json:"operate"`
	ReadOnly []permJSON `json:"readOnly"`
}

type vpnJSON struct {
	Name string `json:"name"`
	User string `json:"user"`
	Pass string `json:"pass"` // client-packed (V1:); "" = keep on edit
}

type connJSON struct {
	Broker   string `json:"broker"`
	Hostname string `json:"hostname"`
	Semp     struct {
		Port string `json:"port"`
		User string `json:"user"`
		Pass string `json:"pass"` // client-packed (V1:); "" = keep on edit
	} `json:"semp"`
	Client struct {
		Port    string    `json:"port"`
		MsgVpns []vpnJSON `json:"msgVpns"`
	} `json:"client"`
}

func permsToRows(in []permJSON) []permRow {
	out := make([]permRow, 0, len(in))
	for _, p := range in {
		out = append(out, permRow{Brokers: flexStr(p.Brokers), MsgVpns: flexStr(p.MsgVpns), Queues: flexStr(p.Queues)})
	}
	return out
}

func (u userJSON) toRec() userRec {
	return userRec{
		Username: u.Username,
		Password: u.Password,
		Admin:    u.Admin,
		Operate:  permsToRows(u.Operate),
		ReadOnly: permsToRows(u.ReadOnly),
	}
}

func (c connJSON) toRec() connRec {
	vpns := make([]vpnRec, 0, len(c.Client.MsgVpns))
	for _, v := range c.Client.MsgVpns {
		vpns = append(vpns, vpnRec{Name: v.Name, Username: v.User, Password: v.Pass})
	}
	return connRec{
		Broker:   c.Broker,
		Hostname: c.Hostname,
		Semp:     sempRec{Port: flexStr(c.Semp.Port), Username: c.Semp.User, Password: c.Semp.Pass},
		Client:   clientRec{Port: flexStr(c.Client.Port), MsgVpns: vpns},
	}
}

// list outputs strip secrets (the one-way user token, the packed conn blobs).

func userToOutput(u userRec) userJSON {
	conv := func(rows []permRow) []permJSON {
		out := make([]permJSON, 0, len(rows))
		for _, r := range rows {
			out = append(out, permJSON{Brokers: string(r.Brokers), MsgVpns: string(r.MsgVpns), Queues: string(r.Queues)})
		}
		return out
	}
	return userJSON{Username: u.Username, Admin: u.Admin, Operate: conv(u.Operate), ReadOnly: conv(u.ReadOnly)}
}

func connToOutput(c connRec) connJSON {
	out := connJSON{Broker: c.Broker, Hostname: c.Hostname}
	out.Semp.Port = string(c.Semp.Port)
	out.Semp.User = c.Semp.Username
	out.Client.Port = string(c.Client.Port)
	// Initialise so a VPN-less connection serialises "msgVpns":[] (not null),
	// matching the non-nullable client type the frontend declares.
	out.Client.MsgVpns = make([]vpnJSON, 0, len(c.Client.MsgVpns))
	for _, v := range c.Client.MsgVpns {
		out.Client.MsgVpns = append(out.Client.MsgVpns, vpnJSON{Name: v.Name, User: v.Username})
	}
	return out
}

// --- handlers ---

func (h *managedHandler) listUsers(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	out := []userJSON{}
	for _, u := range h.store.listUsers() {
		out = append(out, userToOutput(u))
	}
	h.writeJSON(w, map[string]any{"users": out})
}

func (h *managedHandler) saveUser(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string   `json:"username"`
		Token    string   `json:"token"`
		User     userJSON `json:"user"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if body.User.Username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}
	if err := h.store.upsertUser(body.User.toRec()); err != nil {
		if errors.Is(err, errBlankNewUserPassword) {
			http.Error(w, "password required", http.StatusBadRequest)
			return
		}
		h.logger.Error("saveUser: persist failed", "err", err)
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) deleteUser(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
		Target   string `json:"target"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	found, err := h.store.deleteUser(body.Target)
	if errors.Is(err, errLastAdmin) {
		http.Error(w, "cannot delete the last admin", http.StatusConflict)
		return
	}
	if err != nil {
		h.logger.Error("deleteUser: persist failed", "err", err)
		http.Error(w, "delete failed", http.StatusInternalServerError)
		return
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) listConnections(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	out := []connJSON{}
	for _, c := range h.store.listConnections() {
		out = append(out, connToOutput(c))
	}
	h.writeJSON(w, map[string]any{"connections": out})
}

func (h *managedHandler) saveConnection(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username   string   `json:"username"`
		Token      string   `json:"token"`
		Connection connJSON `json:"connection"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if body.Connection.Broker == "" {
		http.Error(w, "broker required", http.StatusBadRequest)
		return
	}
	if err := h.store.upsertConnection(body.Connection.toRec()); err != nil {
		h.logger.Error("saveConnection: persist failed", "err", err)
		http.Error(w, "save failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) deleteConnection(w http.ResponseWriter, r *http.Request) {
	if !h.methodPost(w, r) {
		return
	}
	var body struct {
		Username string `json:"username"`
		Token    string `json:"token"`
		Target   string `json:"target"`
	}
	if !h.decodeBody(w, r, &body) {
		return
	}
	if !h.store.authAdmin(body.Username, body.Token) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	found, err := h.store.deleteConnection(body.Target)
	if err != nil {
		h.logger.Error("deleteConnection: persist failed", "err", err)
		http.Error(w, "delete failed", http.StatusInternalServerError)
		return
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
