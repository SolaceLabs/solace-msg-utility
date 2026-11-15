package main

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

// maxBodyBytes caps every /managed/* request body and the sign-in forms. The
// largest legitimate body, a connection with its VPN list, is a few KiB.
const maxBodyBytes = 64 << 10

// managedHandler serves the /managed/* JSON API behind the session cookie. It
// is only wired into the mux in Provisioned mode; otherwise /managed/* is a
// plain 404.
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
	backups  *backupService // /managed/backup* (backup_api.go)
	relay    http.Handler   // /managed/relay/*, dispatched before the mux (relay.go)
	smf      http.Handler   // /managed/smf/*, dispatched before the mux (smf.go)
	dial     http.Handler   // POST /managed/dial (dial.go)
	audit    *auditor       // the audit trail (audit.go); nil records nothing
	totp     *totpGuard     // the replay guard the sign-in pages share (managed_routing.go)
	cop      *http.CrossOriginProtection
	logger   *slog.Logger
	mux      *http.ServeMux
}

// managedEndpoints are the broker-facing handlers managedHandler serves
// behind its gates.
type managedEndpoints struct {
	relay, smf, dial http.Handler
}

func newManagedHandler(st *store, ss *sessions, th *throttle, lv *live, sf *settingsFile, bk *backupService, ep managedEndpoints, logger *slog.Logger) *managedHandler {
	h := &managedHandler{
		store: st, sessions: ss, throttle: th, live: lv, settings: sf, backups: bk,
		relay: ep.relay, smf: ep.smf, dial: ep.dial,
		totp: newTOTPGuard(), cop: http.NewCrossOriginProtection(), logger: logger,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /managed/me", h.me)
	mux.HandleFunc("POST /managed/logout", h.logout)
	mux.Handle("POST /managed/dial", h.dial)
	mux.HandleFunc("GET /managed/users", h.adminOnly(h.listUsers))
	mux.HandleFunc("PUT /managed/users/{name}", h.audited(h.userAction, h.saveUser))
	mux.HandleFunc("DELETE /managed/users/{name}", h.audited(fixedAction(auditUserDelete), h.deleteUser))
	mux.HandleFunc("DELETE /managed/users/{name}/totp", h.audited(fixedAction(auditTwoFactorReset), h.resetTwoFactor))
	mux.HandleFunc("GET /managed/connections", h.adminOnly(h.listConnections))
	mux.HandleFunc("PUT /managed/connections/{broker}", h.audited(h.connectionAction, h.saveConnection))
	mux.HandleFunc("DELETE /managed/connections/{broker}", h.audited(fixedAction(auditConnectionDelete), h.deleteConnection))
	mux.HandleFunc("GET /managed/settings", h.adminOnly(h.getSettings))
	mux.HandleFunc("PUT /managed/settings", h.audited(fixedAction(auditSettingsUpdate), h.saveSettings))
	mux.HandleFunc("GET /managed/client", h.adminOnly(h.clientSeen))
	h.registerBackupRoutes(mux)
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
	setRequestUser(r, as.user)
	if as.mustChange && r.URL.Path != "/managed/logout" {
		writeError(w, http.StatusForbidden, "password_change_required")
		return
	}
	r = r.WithContext(withSession(r.Context(), as))
	// The relay and the SMF gate parse their own escaped paths: the mux would
	// clean them, and redirect, before they could refuse what they must not
	// forward.
	switch {
	case strings.HasPrefix(r.URL.Path, relayPrefix):
		h.relay.ServeHTTP(w, r)
	case strings.HasPrefix(r.URL.Path, smfPrefix):
		h.smf.ServeHTTP(w, r)
	default:
		h.mux.ServeHTTP(w, r)
	}
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

// ----- audit trail of the admin routes ---------------------------------------------

// auditCall is what an audited admin handler tells its wrapper beyond the
// response: the action when it knows better than the route did (a save that
// turned out to create), the target that is not in the path (an import's
// backup file), the names of the parts it changed and the store files the
// commit wrote (with their seq), which an ok entry carries as "wrote".
// recorded says the entry is written already: a change that commits writes
// its ok entry from an after-commit hook (committed), under the writer lock.
type auditCall struct {
	action   string
	target   string
	changed  []string
	wrote    []auditWrote
	recorded bool
}

// auditWriter notes the status and error code of a response, so the wrapper
// can tell an ok entry from a refusal and name the code the API answered. It
// reads the body of an error only; a success body (an export) is never looked
// at.
type auditWriter struct {
	http.ResponseWriter
	status int
	code   string
}

func (a *auditWriter) WriteHeader(status int) {
	a.status = status
	a.ResponseWriter.WriteHeader(status)
}

func (a *auditWriter) Write(b []byte) (int, error) {
	if a.status >= http.StatusBadRequest && a.code == "" {
		var e apiError
		_ = json.Unmarshal(b, &e) // a body that is not an apiError leaves the code empty
		a.code = e.Error
	}
	return a.ResponseWriter.Write(b)
}

// auditPhrases word an action in an entry's msg: what happened, and what was
// tried when it was refused. {t} is the target.
var auditPhrases = map[string]struct{ done, attempt string }{
	auditUserCreate:       {"created user {t}", "create user {t}"},
	auditUserUpdate:       {"updated user {t}", "update user {t}"},
	auditUserDelete:       {"deleted user {t}", "delete user {t}"},
	auditTwoFactorReset:   {"reset two-factor sign-in for {t}", "reset two-factor sign-in for {t}"},
	auditConnectionCreate: {"created connection {t}", "create connection {t}"},
	auditConnectionUpdate: {"updated connection {t}", "update connection {t}"},
	auditConnectionDelete: {"deleted connection {t}", "delete connection {t}"},
	auditSettingsUpdate:   {"updated the gateway settings", "update the gateway settings"},
	auditBackupExport:     {"exported a backup", "export a backup"},
	auditBackupImport:     {"imported a backup", "import a backup"},
	auditScheduleSet:      {"set the backup schedule", "set the backup schedule"},
	auditScheduleRemove:   {"removed the backup schedule", "remove the backup schedule"},
}

// auditPre names the action and target a route stands for before its handler
// has run, so a refusal that never reaches the handler (not an administrator)
// is still recorded under the action that was tried.
type auditPre func(r *http.Request) (action, target string)

// fixedAction is the pre of a route that always means action on the broker or
// user its path names, if any.
func fixedAction(action string) auditPre {
	return func(r *http.Request) (string, string) { return action, pathTarget(r) }
}

// userAction is PUT /managed/users/{name} before the handler has read the
// body: a create unless the user exists. A save that gets as far as its body
// names the action by its rev instead (0 creates).
func (h *managedHandler) userAction(r *http.Request) (string, string) {
	name := r.PathValue("name")
	_, exists := h.store.isAdmin(name)
	return userSaveAction(exists), name
}

func userSaveAction(existed bool) string {
	if existed {
		return auditUserUpdate
	}
	return auditUserCreate
}

// connectionAction is userAction for PUT /managed/connections/{broker}.
func (h *managedHandler) connectionAction(r *http.Request) (string, string) {
	broker := r.PathValue("broker")
	return connectionSaveAction(h.store.hasConnection(broker)), broker
}

func connectionSaveAction(existed bool) string {
	if existed {
		return auditConnectionUpdate
	}
	return auditConnectionCreate
}

// audited is adminOnly plus one admin audit entry per request: ok when the
// status is below 400, else refused with the code of the error body. A change
// that commits writes its ok entry itself, inside the transaction (committed);
// everything else is written here once fn has answered. A request the admin
// gate refuses is recorded too, under the action pre names.
func (h *managedHandler) audited(pre auditPre, fn func(http.ResponseWriter, *http.Request, *auditCall)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		action, target := pre(r)
		call := &auditCall{action: action, target: target}
		aw := &auditWriter{ResponseWriter: w}
		h.adminOnly(func(w http.ResponseWriter, r *http.Request) { fn(w, r, call) })(aw, r)
		h.recordAdmin(r, call, aw)
	}
}

// recordAdmin writes the entry of an audited admin request. The target is cut
// like a sign-in's username (userKey): it can be a path segment or a file
// name the requester chose.
func (h *managedHandler) recordAdmin(r *http.Request, call *auditCall, aw *auditWriter) {
	switch {
	case aw.status == statusClientGone:
		return // the client left before the change began: nothing happened, nobody reads an answer
	case call.recorded:
		return // the commit's own hook wrote the entry
	case aw.status < http.StatusBadRequest:
		h.recordOK(r, call)
		return
	}
	e := auditFor(r, call.action)
	e.Target = userKey(call.target)
	e.Outcome, e.Code = auditRefused, aw.code
	e.Msg = e.Actor + " could not " + strings.Replace(auditPhrases[call.action].attempt, "{t}", e.Target, 1) + ": " + aw.code
	h.audit.record(auditAdmin, e)
}

// recordOK writes the ok entry of call.
func (h *managedHandler) recordOK(r *http.Request, call *auditCall) {
	e := auditFor(r, call.action)
	e.Target = userKey(call.target)
	e.Outcome, e.Changed, e.Wrote = auditOK, call.changed, call.wrote
	e.Msg = e.Actor + " " + strings.Replace(auditPhrases[call.action].done, "{t}", e.Target, 1)
	if len(e.Changed) > 0 {
		e.Msg += ": " + strings.Join(e.Changed, ", ")
	}
	h.audit.record(auditAdmin, e)
	call.recorded = true
}

// committed is the after-commit hook of an audited change: it writes the ok
// entry while the writer lock is still held, so the audit lines follow the
// order of the commits, and with audit.onFailure refuse a lost record refuses
// the very next change. wrote names the files the commit wrote and their seq;
// it runs under the same lock, so a seq it reads is that commit's own.
func (h *managedHandler) committed(r *http.Request, call *auditCall, wrote func() []auditWrote) func() {
	return func() {
		call.wrote = wrote()
		h.recordOK(r, call)
	}
}

// wroteUsers and wroteConnections are what a commit to one store file wrote,
// for committed.
func (h *managedHandler) wroteUsers() []auditWrote {
	seq, _ := h.store.seqs()
	return []auditWrote{{File: filepath.Base(h.store.usersPath), Seq: int64(seq)}}
}

func (h *managedHandler) wroteConnections() []auditWrote {
	_, seq := h.store.seqs()
	return []auditWrote{{File: filepath.Base(h.store.connsPath), Seq: int64(seq)}}
}

// ----- responses ----------------------------------------------------------------

type apiError struct {
	Error  string `json:"error"`
	Field  string `json:"field,omitempty"`
	Reason string `json:"reason,omitempty"`
	Rev    any    `json:"rev,omitempty"`
	Basis  any    `json:"basis,omitempty"`
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
	return decodeJSONLimit(w, r, dst, maxBodyBytes)
}

// decodeJSONLimit is decodeJSON with another size cap, for the one body that
// carries a file (an import).
func decodeJSONLimit(w http.ResponseWriter, r *http.Request, dst any, limit int64) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	dec.DisallowUnknownFields()
	err := dec.Decode(dst)
	if err == nil {
		// Keep the reader's own error: the size cap can trip on trailing
		// bytes, and that is a 413, not a 400.
		if _, trailing := dec.Token(); trailing != io.EOF {
			err = trailing
			if err == nil {
				err = errors.New("trailing data after the JSON value")
			}
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

// log is the handler's logger with the request's client, method, path and
// signed-in user (the acting administrator, on an admin route).
func (h *managedHandler) log(r *http.Request) *slog.Logger { return requestLogger(h.logger, r) }

// serverError answers 500 server_error and logs what failed: the operation,
// the user or broker the path names (target) and the cause.
func (h *managedHandler) serverError(w http.ResponseWriter, r *http.Request, op string, err error) {
	h.log(r).Error("admin request failed", "op", op, "target", pathTarget(r), "err", err)
	writeError(w, http.StatusInternalServerError, "server_error")
}

// pathTarget is the user or broker a request's path names, "" for none. No
// route has both, so the two values never mix.
func pathTarget(r *http.Request) string {
	return r.PathValue("name") + r.PathValue("broker")
}

// ----- session endpoints ----------------------------------------------------------

func (h *managedHandler) me(w http.ResponseWriter, r *http.Request) {
	profile, ok := h.store.profile(sessionOf(r).user, h.live.get().modules)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	enrolled, _ := h.store.twoFactorOf(profile.Username)
	writeJSON(w, http.StatusOK, meJSON{
		profileResponse: profile,
		TwoFactor:       twoFactorJSON{Mode: h.live.twoFactor(), Enrolled: enrolled},
	})
}

// twoFactorJSON is what the apps need to know of two-factor sign-in: the
// setting, and whether this user has set it up.
type twoFactorJSON struct {
	Mode     string `json:"mode"`
	Enrolled bool   `json:"enrolled"`
}

// meJSON is GET /managed/me: the profile plus the user's two-factor state.
type meJSON struct {
	*profileResponse
	TwoFactor twoFactorJSON `json:"twoFactor"`
}

func (h *managedHandler) logout(w http.ResponseWriter, r *http.Request) {
	as := sessionOf(r)
	h.sessions.drop(as.id)
	clearSessionCookie(w)
	e := auditFor(r, auditSignout)
	e.Target, e.Outcome, e.Msg = as.user, auditOK, as.user+" signed out"
	h.audit.record(auditAuth, e)
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

// userListJSON is a user in the list answer: the view plus the rev a save or a
// delete of it must send back. The rev is not in userJSON because the view is
// what sameUserView compares, and a rev is not part of it.
type userListJSON struct {
	userJSON
	Rev       int  `json:"rev"`
	TwoFactor bool `json:"twoFactor"` // two-factor sign-in is set up; the secret never leaves the gateway
}

// bodyRev is the "rev" of a whole-record save. A body without one, or with
// anything but a whole number from 0 up (null, a string, a fraction, a
// negative), leaves ok false and is refused as rev_required; 0 creates.
type bodyRev struct {
	n  int
	ok bool
}

func (b *bodyRev) UnmarshalJSON(data []byte) error {
	n, err := strconv.ParseUint(string(data), 10, 31)
	b.n, b.ok = int(n), err == nil
	return nil
}

// queryRev is the ?rev=N of a delete: a whole number from 1 up (a record that
// exists has a rev of at least 1), else ok is false and the delete is refused
// as rev_required.
func queryRev(r *http.Request) (rev int, ok bool) {
	n, err := strconv.ParseUint(r.URL.Query().Get("rev"), 10, 31)
	return int(n), err == nil && n > 0
}

// userSaveJSON is the PUT /managed/users/{name} body. The username comes from
// the path. Password is plaintext over TLS, hashed here; "" keeps it on edit.
// Modules null or absent means the deployment default. Rev is the rev the
// admin read the user at, 0 for a new user.
type userSaveJSON struct {
	Rev      bodyRev    `json:"rev"`
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
	Pass string `json:"pass"` // plaintext over TLS; "" = keep on edit; never listed
}

// sempJSON and clientJSON carry the scheme the gateway reaches the broker
// with. A list always names it (https or http, wss or ws); on a save it may
// be left out, which means TLS.
type sempJSON struct {
	Scheme string `json:"scheme"`
	Port   string `json:"port"`
	User   string `json:"user"`
	Pass   string `json:"pass"` // plaintext over TLS; "" = keep on edit; never listed
}

type clientJSON struct {
	Scheme  string    `json:"scheme"`
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

// connListJSON is a connection in the list answer: the view plus its rev (see
// userListJSON).
type connListJSON struct {
	connJSON
	Rev int `json:"rev"`
}

// connSaveJSON is the PUT /managed/connections/{broker} body; the broker name
// comes from the path. Rev is the rev the admin read the connection at, 0 for
// a new one.
type connSaveJSON struct {
	Rev      bodyRev    `json:"rev"`
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
		Semp:     sempRec{Scheme: canonScheme(c.Semp.Scheme, sempTLS), Port: flexStr(c.Semp.Port), Username: c.Semp.User, Password: c.Semp.Pass},
		Client:   clientRec{Scheme: canonScheme(c.Client.Scheme, clientTLS), Port: flexStr(c.Client.Port), MsgVpns: vpns},
	}
}

func userToOutput(u userRec) userJSON {
	return userJSON{
		Username: u.Username, Admin: u.Admin, MustChangePassword: u.MustChangePassword,
		Operate: rowsToPerms(u.Operate), ReadOnly: rowsToPerms(u.ReadOnly), Modules: u.Modules,
	}
}

// connToOutput leaves the passwords out.
func connToOutput(c connRec) connJSON {
	out := connJSON{Broker: c.Broker, Hostname: c.Hostname}
	out.Semp.Scheme = orTLS(c.Semp.Scheme, sempTLS)
	out.Semp.Port = string(c.Semp.Port)
	out.Semp.User = c.Semp.Username
	out.Client.Scheme = orTLS(c.Client.Scheme, clientTLS)
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
	out := []userListJSON{}
	for _, u := range h.store.listUsers() {
		out = append(out, userListJSON{userJSON: userToOutput(u), Rev: u.Rev, TwoFactor: u.twoFactorOn()})
	}
	ms := h.live.get().modules
	writeJSON(w, http.StatusOK, map[string]any{
		"users":   out,
		"modules": modulesJSON{Catalog: moduleCatalog(), Offered: ms.offered, UserDefault: ms.userDefault},
	})
}

// storeFailed answers the error of a user or connection transaction: the
// shared store errors as writeStoreError says, the in-lock caller re-check as
// a 401 or 403, the two user rules (a new user needs a password, the last
// admin stays) and anything else as a 500 server_error. A store write that
// failed is logged with its cause; the body never carries it.
func (h *managedHandler) storeFailed(w http.ResponseWriter, r *http.Request, op string, err error) {
	if _, ok := writeStoreError(w, err); ok {
		var failed *writeFailedError
		if errors.As(err, &failed) {
			h.log(r).Error("admin request failed", "op", op, "target", pathTarget(r), "err", err)
		}
		return
	}
	switch {
	case errors.Is(err, errCallerGone):
		writeError(w, http.StatusUnauthorized, "unauthenticated")
	case errors.Is(err, errCallerNotAdmin):
		writeError(w, http.StatusForbidden, "forbidden")
	case errors.Is(err, errBlankNewUserPassword):
		writeInvalid(w, "password", "A new user needs a password.")
	case errors.Is(err, errLastAdmin):
		writeError(w, http.StatusConflict, "last_admin")
	default:
		h.serverError(w, r, op, err)
	}
}

// saveUser creates (rev 0) or edits (rev above 0) a user and answers 200 with
// the user's rev. A new password, a changed admin flag or a deletion ends the
// target's sessions, the requester's own included: an admin who changes their
// own password signs in again.
//
// What needs no store state comes first (422 invalid, 400 rev_required), and
// the password is policy-checked and hashed before the writer lock. Inside it
// the store refuses in the order of the contract: audit gate, caller, disk,
// existence, rev, then the cross-record rules.
func (h *managedHandler) saveUser(w http.ResponseWriter, r *http.Request, call *auditCall) {
	name := r.PathValue("name")
	var body userSaveJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	if !validName(usernamePattern, name) {
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
	if !body.Rev.ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	rev := body.Rev.n
	call.action = userSaveAction(rev > 0)
	rec := userRec{Username: name, Admin: body.Admin, Operate: permsToRows(body.Operate), ReadOnly: permsToRows(body.ReadOnly), Modules: body.Modules}
	if old, found := userNamed(h.store.listUsers(), name); rev > 0 && found {
		// Read outside the lock, for the audit entry's list of parts only. An
		// accepted save means the user's rev has not moved since the admin
		// read it, and a password-only commit is the one change that keeps
		// the rev (and is not in the list).
		call.changed = userChanges(old, rec, body.Password != "")
	}
	got, err := h.store.saveUser(r.Context(), sessionOf(r).user, rec, body.Password, rev, h.committed(r, call, h.wroteUsers))
	if err != nil {
		h.storeFailed(w, r, "saveUser", err)
		return
	}
	if got.dropSessions {
		h.sessions.dropUser(name)
	}
	h.log(r).Info("user saved", "target", name, "created", rev == 0, "admin", body.Admin,
		"password_set", body.Password != "", "operate_rows", len(body.Operate), "read_only_rows", len(body.ReadOnly),
		"modules", modulesAttr(body.Modules), "sessions_ended", got.dropSessions, "rev", got.rev)
	writeJSON(w, http.StatusOK, map[string]int{"rev": got.rev})
}

// userNamed is the user called name in users.
func userNamed(users []userRec, name string) (userRec, bool) {
	i := slices.IndexFunc(users, func(u userRec) bool { return u.Username == name })
	if i < 0 {
		return userRec{}, false
	}
	return users[i], true
}

// userChanges names the parts of a user a save changes, for the audit trail:
// never a value. newPassword says the save carries one.
func userChanges(old, next userRec, newPassword bool) []string {
	var out []string
	if newPassword {
		out = append(out, "password")
	}
	if old.Admin != next.Admin {
		out = append(out, "admin")
	}
	if !slices.Equal(old.Operate, next.Operate) || !slices.Equal(old.ReadOnly, next.ReadOnly) {
		out = append(out, "grants")
	}
	if !sameModules(old.Modules, next.Modules) {
		out = append(out, "modules")
	}
	return out
}

// sameModules compares two module lists, where nil (the deployment default)
// differs from an empty list.
func sameModules(a, b *[]string) bool {
	if a == nil || b == nil {
		return a == b
	}
	return slices.Equal(*a, *b)
}

// modulesAttr is a user's module list for a log line: "default" when the
// user has no list of their own.
func modulesAttr(m *[]string) any {
	if m == nil {
		return "default"
	}
	return *m
}

// deleteUser removes a user: ?rev=N, the rev the admin read the user at, is
// required (400 rev_required without it, or with 0). Success is 204.
func (h *managedHandler) deleteUser(w http.ResponseWriter, r *http.Request, call *auditCall) {
	name := r.PathValue("name")
	rev, ok := queryRev(r)
	if !ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	if _, err := h.store.deleteUser(r.Context(), sessionOf(r).user, name, rev, h.committed(r, call, h.wroteUsers)); err != nil {
		h.storeFailed(w, r, "deleteUser", err)
		return
	}
	h.sessions.dropUser(name)
	h.log(r).Info("user deleted", "target", name)
	w.WriteHeader(http.StatusNoContent)
}

// resetTwoFactor removes a user's two-factor sign-in (a lost phone) and
// answers 200 with the user's rev: the rev moves only when something was set
// up, and then the user's sessions and sign-in tickets end and their replay
// record is dropped. A user without two-factor is not an error and not a
// commit: the rev is as it was and the ok entry carries no "wrote". No rev is
// sent: the reset is field-scoped, as the user's own password change is.
func (h *managedHandler) resetTwoFactor(w http.ResponseWriter, r *http.Request, call *auditCall) {
	name := r.PathValue("name")
	rev, removed, err := h.store.clearTOTP(r.Context(), sessionOf(r).user, name, h.committed(r, call, h.wroteUsers))
	if err != nil {
		h.storeFailed(w, r, "resetTwoFactor", err)
		return
	}
	if removed {
		h.sessions.dropUser(name)
		h.totp.forget(name)
	}
	h.log(r).Info("two-factor reset", "target", name, "removed", removed, "rev", rev)
	writeJSON(w, http.StatusOK, map[string]int{"rev": rev})
}

func (h *managedHandler) listConnections(w http.ResponseWriter, _ *http.Request) {
	out := []connListJSON{}
	for _, c := range h.store.listConnections() {
		out = append(out, connListJSON{connJSON: connToOutput(c), Rev: c.Rev})
	}
	writeJSON(w, http.StatusOK, map[string]any{"connections": out})
}

// saveConnection creates (rev 0) or edits (rev above 0) a connection and
// answers 200 with its rev. The order of refusals is saveUser's.
func (h *managedHandler) saveConnection(w http.ResponseWriter, r *http.Request, call *auditCall) {
	var body connSaveJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	rec := body.toRec(r.PathValue("broker"))
	if err := validateConn(rec); err != nil {
		writeInvalid(w, "connection", err.Error())
		return
	}
	if !body.Rev.ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	rev := body.Rev.n
	call.action = connectionSaveAction(rev > 0)
	if old, found := connectionNamed(h.store.listConnections(), rec.Broker); rev > 0 && found {
		call.changed = connChanges(old, rec)
	}
	got, err := h.store.saveConnection(r.Context(), sessionOf(r).user, rec, rev, h.committed(r, call, h.wroteConnections))
	if err != nil {
		h.storeFailed(w, r, "saveConnection", err)
		return
	}
	vpns, newPasswords := make([]string, 0, len(body.Client.MsgVpns)), 0
	for _, v := range body.Client.MsgVpns {
		vpns = append(vpns, v.Name)
		if v.Pass != "" {
			newPasswords++
		}
	}
	h.log(r).Info("connection saved", "target", rec.Broker, "created", rev == 0, "hostname", rec.Hostname,
		"semp_scheme", orTLS(rec.Semp.Scheme, sempTLS), "semp_port", string(rec.Semp.Port), "semp_password_set", body.Semp.Pass != "",
		"client_scheme", orTLS(rec.Client.Scheme, clientTLS), "client_port", string(rec.Client.Port),
		"vpns", vpns, "vpn_passwords_set", newPasswords, "rev", got.rev)
	writeJSON(w, http.StatusOK, map[string]int{"rev": got.rev})
}

// connectionNamed is the connection to broker in conns.
func connectionNamed(conns []connRec, broker string) (connRec, bool) {
	i := slices.IndexFunc(conns, func(c connRec) bool { return c.Broker == broker })
	if i < 0 {
		return connRec{}, false
	}
	return conns[i], true
}

// connChanges names the parts of a connection a save changes, for the audit
// trail: hostname, semp, client, and "vpn <name>" for each VPN added, changed
// or removed; never a value. A password in next is one the save supplies (the
// stored one is merged in after this runs), so it counts as a change.
func connChanges(old, next connRec) []string {
	var out []string
	if old.Hostname != next.Hostname {
		out = append(out, "hostname")
	}
	if old.Semp.Scheme != next.Semp.Scheme || old.Semp.Port != next.Semp.Port || old.Semp.Username != next.Semp.Username || next.Semp.Password != "" {
		out = append(out, "semp")
	}
	if old.Client.Scheme != next.Client.Scheme || old.Client.Port != next.Client.Port {
		out = append(out, "client")
	}
	named := func(vpns []vpnRec, name string) int {
		return slices.IndexFunc(vpns, func(v vpnRec) bool { return v.Name == name })
	}
	for _, v := range next.Client.MsgVpns {
		i := named(old.Client.MsgVpns, v.Name)
		if i < 0 || old.Client.MsgVpns[i].Username != v.Username || v.Password != "" {
			out = append(out, "vpn "+v.Name)
		}
	}
	for _, v := range old.Client.MsgVpns {
		if named(next.Client.MsgVpns, v.Name) < 0 {
			out = append(out, "vpn "+v.Name)
		}
	}
	return out
}

// deleteConnection is deleteUser for a connection.
func (h *managedHandler) deleteConnection(w http.ResponseWriter, r *http.Request, call *auditCall) {
	broker := r.PathValue("broker")
	rev, ok := queryRev(r)
	if !ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	if _, err := h.store.deleteConnection(r.Context(), sessionOf(r).user, broker, rev, h.committed(r, call, h.wroteConnections)); err != nil {
		h.storeFailed(w, r, "deleteConnection", err)
		return
	}
	h.log(r).Info("connection deleted", "target", broker)
	w.WriteHeader(http.StatusNoContent)
}

// clientSeenJSON is GET /managed/client.
type clientSeenJSON struct {
	Address  string `json:"address"`  // the client address the gateway resolved; "" when it could not
	Peer     string `json:"peer"`     // the TCP peer: the browser itself, or a proxy in front of it
	ViaProxy bool   `json:"viaProxy"` // the address came from a trusted proxy's X-Forwarded-For
}

// clientSeen answers with the address the gateway resolved for this browser
// and how: the settings page shows it, so an administrator behind Docker's
// userland proxy or a proxy missing from access.trustedProxies sees that the
// gateway takes every user for that one address (docs/deployment.md).
func (h *managedHandler) clientSeen(w http.ResponseWriter, r *http.Request) {
	peer, _ := clientIP(r.RemoteAddr, nil, nil)
	addr, ok := clientOf(r)
	out := clientSeenJSON{Peer: peer.String(), ViaProxy: ok && addr != peer}
	if ok {
		out.Address = addr.String()
	}
	writeJSON(w, http.StatusOK, out)
}
