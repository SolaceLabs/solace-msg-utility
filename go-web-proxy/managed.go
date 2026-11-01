//go:build managed

package main

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

// maxBodyBytes caps every /managed/* request body and the sign-in forms. The
// largest legitimate body, a connection with its VPN list, is a few KiB.
const maxBodyBytes = 64 << 10

// managedHandler serves the /managed/* JSON API behind the session cookie. It
// is only wired into the mux when managed is true and the binary carries the
// managed tag; otherwise /managed/* is a plain 404.
//
// Every request without a valid session gets the same 401, whatever the path,
// so nothing about routes, users or brokers leaks to a client that has not
// signed in. A session that must change its password gets 403 everywhere but
// logout. Errors are JSON {"error": code} with an optional field and reason;
// the browser maps the code to a message (src/core/services/managed-api.ts).
type managedHandler struct {
	store    *store
	sessions *sessions
	throttle *throttle
	live     *live
	settings *settingsFile
	cop      *http.CrossOriginProtection
	logger   *slog.Logger
	mux      *http.ServeMux
}

func newManagedHandler(st *store, ss *sessions, th *throttle, lv *live, sf *settingsFile, logger *slog.Logger) *managedHandler {
	h := &managedHandler{store: st, sessions: ss, throttle: th, live: lv, settings: sf, cop: http.NewCrossOriginProtection(), logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /managed/me", h.me)
	mux.HandleFunc("POST /managed/logout", h.logout)
	mux.HandleFunc("GET /managed/users", h.adminOnly(h.listUsers))
	mux.HandleFunc("PUT /managed/users/{name}", h.adminOnly(h.saveUser))
	mux.HandleFunc("DELETE /managed/users/{name}", h.adminOnly(h.deleteUser))
	mux.HandleFunc("GET /managed/connections", h.adminOnly(h.listConnections))
	mux.HandleFunc("PUT /managed/connections/{broker}", h.adminOnly(h.saveConnection))
	mux.HandleFunc("DELETE /managed/connections/{broker}", h.adminOnly(h.deleteConnection))
	mux.HandleFunc("GET /managed/settings", h.adminOnly(h.getSettings))
	mux.HandleFunc("PUT /managed/settings", h.adminOnly(h.saveSettings))
	// Anything else, including a known path with the wrong method, is a 404:
	// a signed-in client learns nothing a 405 would add.
	mux.HandleFunc("/managed/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found")
	})
	h.mux = mux
	return h
}

func (h *managedHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	as, ok := h.sessions.fromRequest(r)
	if !ok {
		client, resolved := clientOf(r)
		if allowed, wait := h.throttle.allowUnauthenticated(client, resolved); !allowed {
			writeRateLimited(w, wait)
			return
		}
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	if err := h.cop.Check(r); err != nil {
		writeError(w, http.StatusForbidden, "cross_origin")
		return
	}
	if as.mustChange && r.URL.Path != "/managed/logout" {
		writeError(w, http.StatusForbidden, "password_change_required")
		return
	}
	h.mux.ServeHTTP(w, r.WithContext(withSession(r.Context(), as)))
}

// adminOnly reads the admin flag from the store on every call, so a demotion
// takes effect at once (the demoted user's sessions are dropped as well).
func (h *managedHandler) adminOnly(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		admin, exists := h.store.isAdmin(sessionOf(r).user)
		switch {
		case !exists:
			writeError(w, http.StatusUnauthorized, "unauthenticated")
		case !admin:
			writeError(w, http.StatusForbidden, "forbidden")
		default:
			fn(w, r)
		}
	}
}

// ----- responses ----------------------------------------------------------------

type apiError struct {
	Error  string `json:"error"`
	Field  string `json:"field,omitempty"`
	Reason string `json:"reason,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v) // a late failure cannot change the status
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, apiError{Error: code})
}

// writeInvalid is a 422 naming the offending field and a reason fit to show
// the admin (never a secret).
func writeInvalid(w http.ResponseWriter, field, reason string) {
	writeJSON(w, http.StatusUnprocessableEntity, apiError{Error: "invalid", Field: field, Reason: reason})
}

func writeRateLimited(w http.ResponseWriter, wait time.Duration) {
	w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
	writeError(w, http.StatusTooManyRequests, "rate_limited")
}

// decodeJSON reads one JSON value of at most maxBodyBytes into dst, rejecting
// unknown fields and trailing data. On failure it has written the response
// (413 too_large or 400 bad_request) and returns false.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	err := dec.Decode(dst)
	if err == nil {
		if _, trailing := dec.Token(); trailing != io.EOF {
			err = errors.New("trailing data after the JSON value")
		}
	}
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "too_large")
		} else {
			writeError(w, http.StatusBadRequest, "bad_request")
		}
		return false
	}
	return true
}

func (h *managedHandler) serverError(w http.ResponseWriter, op string, err error) {
	h.logger.Error("managed: "+op+" failed", "err", err)
	writeError(w, http.StatusInternalServerError, "server_error")
}

// ----- session endpoints ----------------------------------------------------------

func (h *managedHandler) me(w http.ResponseWriter, r *http.Request) {
	profile, ok := h.store.profile(sessionOf(r).user, h.live.get().modules)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (h *managedHandler) logout(w http.ResponseWriter, r *http.Request) {
	h.sessions.drop(sessionOf(r).id)
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// ----- JSON wire shapes (camelCase; distinct from the YAML structs) ------------

type permJSON struct {
	Brokers string `json:"brokers"`
	MsgVpns string `json:"msgVpns"`
	Queues  string `json:"queues"`
}

// userJSON is a user as the admin app lists it. The password hash never
// leaves the gateway. Modules null means the deployment default.
type userJSON struct {
	Username           string     `json:"username"`
	Admin              bool       `json:"admin"`
	MustChangePassword bool       `json:"mustChangePassword"`
	Operate            []permJSON `json:"operate"`
	ReadOnly           []permJSON `json:"readOnly"`
	Modules            *[]string  `json:"modules"`
}

// userSaveJSON is the PUT /managed/users/{name} body. The username comes from
// the path. Password is plaintext over TLS, hashed here; "" keeps it on edit.
// Modules null or absent means the deployment default.
type userSaveJSON struct {
	Password string     `json:"password"`
	Admin    bool       `json:"admin"`
	Operate  []permJSON `json:"operate"`
	ReadOnly []permJSON `json:"readOnly"`
	Modules  *[]string  `json:"modules"`
}

// modulesJSON is what the user editor needs to offer module choices.
type modulesJSON struct {
	Catalog     []string `json:"catalog"`
	Offered     []string `json:"offered"`
	UserDefault string   `json:"userDefault"`
}

type vpnJSON struct {
	Name string `json:"name"`
	User string `json:"user"`
	Pass string `json:"pass"` // client-packed; "" = keep on edit; never listed
}

type sempJSON struct {
	Port string `json:"port"`
	User string `json:"user"`
	Pass string `json:"pass"` // client-packed; "" = keep on edit; never listed
}

type clientJSON struct {
	Port    string    `json:"port"`
	MsgVpns []vpnJSON `json:"msgVpns"`
}

// connJSON is a connection as the admin app lists it.
type connJSON struct {
	Broker   string     `json:"broker"`
	Hostname string     `json:"hostname"`
	Semp     sempJSON   `json:"semp"`
	Client   clientJSON `json:"client"`
}

// connSaveJSON is the PUT /managed/connections/{broker} body; the broker name
// comes from the path.
type connSaveJSON struct {
	Hostname string     `json:"hostname"`
	Semp     sempJSON   `json:"semp"`
	Client   clientJSON `json:"client"`
}

func permsToRows(in []permJSON) []permRow {
	out := make([]permRow, 0, len(in))
	for _, p := range in {
		out = append(out, permRow{Brokers: flexStr(p.Brokers), MsgVpns: flexStr(p.MsgVpns), Queues: flexStr(p.Queues)})
	}
	return out
}

func rowsToPerms(rows []permRow) []permJSON {
	out := make([]permJSON, 0, len(rows))
	for _, r := range rows {
		out = append(out, permJSON{Brokers: string(r.Brokers), MsgVpns: string(r.MsgVpns), Queues: string(r.Queues)})
	}
	return out
}

func (c connSaveJSON) toRec(broker string) connRec {
	vpns := make([]vpnRec, 0, len(c.Client.MsgVpns))
	for _, v := range c.Client.MsgVpns {
		vpns = append(vpns, vpnRec{Name: v.Name, Username: v.User, Password: v.Pass})
	}
	return connRec{
		Broker:   broker,
		Hostname: c.Hostname,
		Semp:     sempRec{Port: flexStr(c.Semp.Port), Username: c.Semp.User, Password: c.Semp.Pass},
		Client:   clientRec{Port: flexStr(c.Client.Port), MsgVpns: vpns},
	}
}

func userToOutput(u userRec) userJSON {
	return userJSON{
		Username: u.Username, Admin: u.Admin, MustChangePassword: u.MustChangePassword,
		Operate: rowsToPerms(u.Operate), ReadOnly: rowsToPerms(u.ReadOnly), Modules: u.Modules,
	}
}

// connToOutput strips the packed passwords.
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

// ----- admin endpoints -------------------------------------------------------------

func (h *managedHandler) listUsers(w http.ResponseWriter, _ *http.Request) {
	out := []userJSON{}
	for _, u := range h.store.listUsers() {
		out = append(out, userToOutput(u))
	}
	ms := h.live.get().modules
	writeJSON(w, http.StatusOK, map[string]any{
		"users":   out,
		"modules": modulesJSON{Catalog: moduleCatalog(), Offered: ms.offered, UserDefault: ms.userDefault},
	})
}

// saveUser creates or edits a user. A new password, a changed admin flag or a
// deletion ends the target's sessions, the requester's own included: an admin
// who changes their own password signs in again.
func (h *managedHandler) saveUser(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var body userSaveJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	if !usernamePattern.MatchString(name) {
		writeInvalid(w, "username", "Username "+usernameRule+".")
		return
	}
	if body.Password != "" {
		if err := checkPasswordPolicy(body.Password); err != nil {
			writeInvalid(w, "password", "Password must be "+strconv.Itoa(passwordMinLen)+" to "+strconv.Itoa(passwordMaxLen)+" characters.")
			return
		}
	}
	if body.Modules != nil {
		if err := checkModuleIDs("modules", *body.Modules); err != nil {
			writeInvalid(w, "modules", err.Error())
			return
		}
	}
	rec := userRec{Username: name, Admin: body.Admin, Operate: permsToRows(body.Operate), ReadOnly: permsToRows(body.ReadOnly), Modules: body.Modules}
	drop, err := h.store.upsertUser(r.Context(), rec, body.Password)
	switch {
	case errors.Is(err, errBlankNewUserPassword):
		writeInvalid(w, "password", "A new user needs a password.")
		return
	case errors.Is(err, errLastAdmin):
		writeError(w, http.StatusConflict, "last_admin")
		return
	case err != nil:
		h.serverError(w, "saveUser", err)
		return
	}
	if drop {
		h.sessions.dropUser(name)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) deleteUser(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	found, err := h.store.deleteUser(name)
	switch {
	case errors.Is(err, errLastAdmin):
		writeError(w, http.StatusConflict, "last_admin")
	case err != nil:
		h.serverError(w, "deleteUser", err)
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		h.sessions.dropUser(name)
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *managedHandler) listConnections(w http.ResponseWriter, _ *http.Request) {
	out := []connJSON{}
	for _, c := range h.store.listConnections() {
		out = append(out, connToOutput(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": out})
}

func (h *managedHandler) saveConnection(w http.ResponseWriter, r *http.Request) {
	var body connSaveJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	rec := body.toRec(r.PathValue("broker"))
	if err := validateConn(rec); err != nil {
		writeInvalid(w, "connection", err.Error())
		return
	}
	if err := h.store.upsertConnection(rec); err != nil {
		h.serverError(w, "saveConnection", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) deleteConnection(w http.ResponseWriter, r *http.Request) {
	found, err := h.store.deleteConnection(r.PathValue("broker"))
	switch {
	case err != nil:
		h.serverError(w, "deleteConnection", err)
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}
