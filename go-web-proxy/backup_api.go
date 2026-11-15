package main

import (
	"errors"
	"io/fs"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"time"
)

// The Backup & Restore page's API (admin only; backup.go has the format and
// the schedule):
//
//	GET    /managed/backup               schedule, last and next run, directory problem, files
//	GET    /managed/backup/files/{name}  one saved backup, as it is on disk
//	PUT    /managed/backup/schedule      save the schedule (body carries rev; 0 creates); a passphrase derives a new key
//	DELETE /managed/backup/schedule?rev=N  remove it (the files stay)
//	POST   /managed/backup/run           back up now, with the schedule's key
//	POST   /managed/backup/export        a backup file, sealed with the given passphrase
//	POST   /managed/backup/preview       what importing a file would change
//	POST   /managed/backup/import        import it, section by section
//
// Preview and import take the file itself or the name of one in the backup
// directory, and the passphrase, each time: the gateway holds no pending
// import between the two. The preview answers the basis it saw (the seq of
// users.yaml and connections.yaml and the settings rev); the import sends it
// back, and a section it imports that moved since is refused as stale.
//
// The schedule and the import change the stores only inside writer.Do (writer.go):
// the file write and the memory swap are one step, so two saves cannot leave
// disk and memory different and an import cannot read the stores outside the
// lock.

// maxImportBytes caps an import body: a backup file is a store's size.
const maxImportBytes = maxStoreFile

const (
	importReplace = "replace"
	importMerge   = "merge"
	importSkip    = "skip"
)

func (h *managedHandler) registerBackupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /managed/backup", h.adminOnly(h.backupStatus))
	mux.HandleFunc("GET /managed/backup/files/{name}", h.adminOnly(h.downloadBackup))
	mux.HandleFunc("PUT /managed/backup/schedule", h.audited(fixedAction(auditScheduleSet), h.saveBackupSchedule))
	mux.HandleFunc("DELETE /managed/backup/schedule", h.audited(fixedAction(auditScheduleRemove), h.deleteBackupSchedule))
	mux.HandleFunc("POST /managed/backup/run", h.adminOnly(h.runBackup))
	mux.HandleFunc("POST /managed/backup/export", h.audited(fixedAction(auditBackupExport), h.exportBackup))
	mux.HandleFunc("POST /managed/backup/preview", h.adminOnly(h.previewImport))
	mux.HandleFunc("POST /managed/backup/import", h.audited(fixedAction(auditBackupImport), h.importBackup))
}

// writeBackupProblem answers a *backupProblem as a 422; anything else is a
// server error.
func (h *managedHandler) writeBackupProblem(w http.ResponseWriter, r *http.Request, op string, err error) {
	var p *backupProblem
	if errors.As(err, &p) {
		writeInvalid(w, p.field, p.reason)
		return
	}
	h.serverError(w, r, op, err)
}

// ----- status and schedule ----------------------------------------------------------

type backupScheduleJSON struct {
	backupSchedule
	Keep int `json:"keep"`
	Rev  int `json:"rev"` // backup.yaml's seq: what a save or a delete must carry
}

type backupRunJSON struct {
	At    string `json:"at"`
	File  string `json:"file"`
	Error string `json:"error"`
}

type backupStatusJSON struct {
	Schedule   *backupScheduleJSON `json:"schedule"`
	NextRun    *string             `json:"nextRun"`
	LastRun    *backupRunJSON      `json:"lastRun"`
	DirProblem string              `json:"dirProblem"`
	Files      []backupFileInfo    `json:"files"`
}

func (h *managedHandler) backupStatus(w http.ResponseWriter, _ *http.Request) {
	b := h.backups
	out := backupStatusJSON{DirProblem: b.dirProblem(), Files: []backupFileInfo{}}
	if sd, rev := b.scheduleWithRev(); sd != nil {
		out.Schedule = &backupScheduleJSON{backupSchedule: sd.Schedule, Keep: sd.Keep, Rev: rev}
		next := nextRun(b.now(), sd.Schedule).Format(time.RFC3339)
		out.NextRun = &next
	}
	if r := b.lastRun(); r != nil {
		out.LastRun = &backupRunJSON{At: r.at.UTC().Format(time.RFC3339), File: r.file, Error: r.err}
	}
	if out.DirProblem == "" {
		if files, err := b.list(); err == nil {
			out.Files = files
		}
	}
	writeJSON(w, http.StatusOK, out)
}

// downloadBackup answers one saved backup as {filename, content}, the shape
// an export has; the content is the file as written, still sealed with its
// schedule's passphrase. A name the gateway would not write, or no such
// file, is 404 not_found.
func (h *managedHandler) downloadBackup(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	data, err := h.backups.read(name)
	switch {
	case errors.Is(err, fs.ErrNotExist):
		writeError(w, http.StatusNotFound, "not_found")
	case err != nil:
		h.writeBackupProblem(w, r, "downloadBackup", err)
	default:
		h.log(r).Info("backup downloaded", "file", name)
		writeJSON(w, http.StatusOK, map[string]string{"filename": name, "content": string(data)})
	}
}

type scheduleSaveJSON struct {
	backupSchedule
	Keep       int    `json:"keep"`
	Passphrase string `json:"passphrase"` // "" keeps the current key
	// Rev is the schedule's rev as the page read it, 0 when it had none (the
	// same reading as a user's: managed.go).
	Rev bodyRev `json:"rev"`
}

// backupFailed answers the error of a backup transaction: the shared store
// errors as they say (writeStoreError), the caller re-check, last_admin, the
// records an import cannot load, a *backupProblem as 422, anything else as a
// server error. A store write that failed is logged with its cause (the body
// never carries it).
func (h *managedHandler) backupFailed(w http.ResponseWriter, r *http.Request, op string, err error) {
	var failed *writeFailedError
	var invalid *importInvalidError
	switch {
	case errors.As(err, &failed):
		h.log(r).Error("backup change not written", "op", op, "err", err)
	case errors.Is(err, errCallerGone):
		writeError(w, http.StatusUnauthorized, "unauthenticated")
		return
	case errors.Is(err, errCallerNotAdmin):
		writeError(w, http.StatusForbidden, "forbidden")
		return
	case errors.Is(err, errLastAdmin):
		writeError(w, http.StatusConflict, "last_admin")
		return
	case errors.As(err, &invalid):
		writeInvalid(w, "file", invalid.Error())
		return
	}
	if _, ok := writeStoreError(w, err); !ok {
		h.writeBackupProblem(w, r, op, err)
	}
}

// saveBackupSchedule saves the schedule. Refusals, in order: 422 invalid (the
// schedule, keep, a passphrase outside the policy), 400 rev_required, then
// inside the writer 503 audit_unavailable, the caller no longer an
// administrator (401, 403), 409 store_changed_on_disk, 409 exists (rev 0 and a
// schedule is there), 404 not_found (rev above 0 and none is), 409 stale
// (carrying the current rev), 422 invalid (a new schedule without a
// passphrase). Success is 200 {"rev": N}.
func (h *managedHandler) saveBackupSchedule(w http.ResponseWriter, r *http.Request, call *auditCall) {
	var body scheduleSaveJSON
	if !decodeJSON(w, r, &body) {
		return
	}
	if p := body.backupSchedule.problem(); p != "" {
		writeInvalid(w, "schedule", p)
		return
	}
	if body.Keep < 1 || body.Keep > backupKeepMax {
		writeInvalid(w, "keep", "Keep 1 to "+strconv.Itoa(backupKeepMax)+" backups.")
		return
	}
	if body.Passphrase != "" && checkPasswordPolicy(body.Passphrase) != nil {
		h.writeBackupProblem(w, r, "saveBackupSchedule", errPassRule)
		return
	}
	if !body.Rev.ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	newRev, err := h.backups.setSchedule(r.Context(), sessionOf(r).user, body.backupSchedule, body.Keep, body.Passphrase, body.Rev.n,
		h.committed(r, call, h.wroteSchedule))
	if err != nil {
		h.backupFailed(w, r, "saveBackupSchedule", err)
		return
	}
	h.log(r).Info("backup schedule saved", "kind", body.Kind, "keep", body.Keep, "new_passphrase", body.Passphrase != "", "rev", newRev)
	writeJSON(w, http.StatusOK, map[string]int{"rev": newRev})
}

// wroteSchedule is what a commit to backup.yaml wrote, for committed.
func (h *managedHandler) wroteSchedule() []auditWrote {
	return []auditWrote{{File: filepath.Base(h.backups.schedulePath), Seq: int64(h.backups.counter())}}
}

// deleteBackupSchedule removes the schedule: DELETE ...?rev=N with the rev the
// page read. A missing, non-numeric or zero rev is 400 rev_required, no
// schedule is 404 not_found, a moved one 409 stale. backup.yaml stays with its
// counter.
func (h *managedHandler) deleteBackupSchedule(w http.ResponseWriter, r *http.Request, call *auditCall) {
	rev, ok := queryRev(r)
	if !ok {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	if _, err := h.backups.removeSchedule(r.Context(), sessionOf(r).user, rev, h.committed(r, call, h.wroteSchedule)); err != nil {
		h.backupFailed(w, r, "deleteBackupSchedule", err)
		return
	}
	h.log(r).Info("backup schedule removed")
	w.WriteHeader(http.StatusNoContent)
}

// runBackup is Back up now. A directory the gateway cannot write is 409
// backup_unavailable, with the reason.
func (h *managedHandler) runBackup(w http.ResponseWriter, r *http.Request) {
	name, err := h.backups.run()
	switch {
	case errors.Is(err, errNoSched):
		writeError(w, http.StatusNotFound, "not_found")
	case err != nil:
		writeJSON(w, http.StatusConflict, apiError{Error: "backup_unavailable", Reason: err.Error()})
	default:
		h.log(r).Info("backup run by an administrator", "file", name)
		writeJSON(w, http.StatusOK, map[string]string{"file": name})
	}
}

// ----- export ------------------------------------------------------------------------------

func (h *managedHandler) exportBackup(w http.ResponseWriter, r *http.Request, _ *auditCall) {
	var body struct {
		Passphrase string `json:"passphrase"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	k, err := newBackupKey(r.Context(), h.backups.hasher, body.Passphrase)
	if err != nil {
		h.writeBackupProblem(w, r, "exportBackup", err)
		return
	}
	data, err := sealBackup(k, h.backups.snapshot())
	if err != nil {
		h.serverError(w, r, "exportBackup", err)
		return
	}
	h.log(r).Info("configuration exported")
	writeJSON(w, http.StatusOK, map[string]string{"filename": backupName(h.backups.now()), "content": string(data)})
}

// ----- preview and import ---------------------------------------------------------------

// importSourceJSON names the file: its content, or a backup in the directory.
type importSourceJSON struct {
	File       string `json:"file"`
	Backup     string `json:"backup"`
	Passphrase string `json:"passphrase"`
}

// openSource reads and opens the named file. On failure it has written the
// response.
func (h *managedHandler) openSource(w http.ResponseWriter, r *http.Request, src importSourceJSON) (backupDoc, bool) {
	data := []byte(src.File)
	switch {
	case (src.File == "") == (src.Backup == ""):
		writeInvalid(w, "file", "Choose one file to import: an upload or a saved backup.")
		return backupDoc{}, false
	case src.Backup != "":
		var err error
		if data, err = h.backups.read(src.Backup); err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				writeInvalid(w, "backup", "There is no backup named "+strconv.Quote(src.Backup)+".")
			} else {
				h.writeBackupProblem(w, r, "readBackup", err)
			}
			return backupDoc{}, false
		}
	}
	doc, err := openBackup(r.Context(), h.backups.hasher, data, src.Passphrase)
	if err != nil {
		h.writeBackupProblem(w, r, "openBackup", err)
		return backupDoc{}, false
	}
	return doc, true
}

type signsOutJSON struct {
	Replace bool `json:"replace"`
	Merge   bool `json:"merge"`
}

type importPreviewJSON struct {
	Created     string   `json:"created"`
	Gateway     string   `json:"gateway"`
	Users       nameDiff `json:"users"`
	Connections nameDiff `json:"connections"`
	// Settings lists the keys an import would change; the host-only paths
	// are never imported.
	Settings []string `json:"settings"`
	// SignsOutCaller says, per mode, whether importing the users would end
	// the requesting administrator's session.
	SignsOutCaller signsOutJSON `json:"signsOutCaller"`
	// Basis is what the preview saw; the import sends it back untouched.
	Basis importBasis `json:"basis"`
}

// importBasis is the version of each section an import applies to: the seq of
// users.yaml and of connections.yaml and the settings rev. The browser treats
// it as opaque.
type importBasis struct {
	Users       int    `json:"users"`
	Connections int    `json:"connections"`
	Settings    string `json:"settings"`
}

// currentBasis is the basis now. Read it inside a writer transaction (or a
// snapshot) for a value that cannot move under the caller.
func (h *managedHandler) currentBasis() importBasis {
	users, conns := h.store.seqs()
	return importBasis{Users: users, Connections: conns, Settings: h.settings.rev()}
}

func (h *managedHandler) previewImport(w http.ResponseWriter, r *http.Request) {
	var body importSourceJSON
	if !decodeJSONLimit(w, r, &body, maxImportBytes) {
		return
	}
	doc, ok := h.openSource(w, r, body)
	if !ok {
		return
	}
	// One committed state: the lists, the settings and the basis agree.
	var users []userRec
	var conns []connRec
	var cur fileConfig
	var basis importBasis
	h.store.wr.snapshot(func() {
		users, conns = h.store.listUsers(), h.store.listConnections()
		cur, basis = h.settings.current(), h.currentBasis()
	})
	caller := sessionOf(r).user
	writeJSON(w, http.StatusOK, importPreviewJSON{
		Created:     doc.Created,
		Gateway:     doc.Gateway,
		Users:       diffByName(users, doc.Users, userName),
		Connections: diffByName(conns, doc.Connections, connName),
		Settings:    settingsChanges(cur, doc.Settings),
		SignsOutCaller: signsOutJSON{
			Replace: slices.Contains(sessionEnders(users, doc.Users), caller),
			Merge:   slices.Contains(sessionEnders(users, mergeByName(users, doc.Users, userName)), caller),
		},
		Basis: basis,
	})
}

type importJSON struct {
	importSourceJSON
	Users       string `json:"users"`       // replace | merge | skip
	Connections string `json:"connections"` // replace | merge | skip
	Settings    string `json:"settings"`    // replace | skip
	// Basis is the object the preview answered; a pointer, so a missing one is
	// 400 rev_required.
	Basis *importBasis `json:"basis"`
}

type importResultJSON struct {
	RestartRequired []string `json:"restartRequired"`
	SignedOut       bool     `json:"signedOut"` // the requester's session ended
}

// importBackup applies the chosen sections. The file is opened and decrypted
// before the lock (the key derivation is slow). Then ONE writer transaction
// does the rest: the caller re-check, the disk check, the basis comparison of
// every section that is not skipped, the merge or replace on the CURRENT
// lists, the validation, and the staging of users.yaml, connections.yaml and
// config.yaml, so the three commit together or not at all, and memory and the
// live settings change only after all of them are in place. Every record of an
// imported section is restamped. Sessions to end and the caller's sign-out
// follow the commit.
//
// Refusals: 422 invalid (a choice, the file, the passphrase, or records the
// gateway would not load), 400 rev_required (no basis), 409 stale (a section
// moved since the preview; the body carries the current basis), 409 last_admin
// (no administrator would remain), checkSettings' refusals for the settings,
// the disk refusals, 503 audit_unavailable, and 500 store_write_failed (a
// failed write; nothing was imported).
func (h *managedHandler) importBackup(w http.ResponseWriter, r *http.Request, call *auditCall) {
	var body importJSON
	if !decodeJSONLimit(w, r, &body, maxImportBytes) {
		return
	}
	for _, c := range []struct{ field, value string }{{"users", body.Users}, {"connections", body.Connections}} {
		if c.value != importReplace && c.value != importMerge && c.value != importSkip {
			writeInvalid(w, c.field, "Choose replace, merge or skip.")
			return
		}
	}
	if body.Settings != importReplace && body.Settings != importSkip {
		writeInvalid(w, "settings", "Choose replace or skip.")
		return
	}
	if body.Users == importSkip && body.Connections == importSkip && body.Settings == importSkip {
		writeInvalid(w, "sections", "Choose at least one section to import.")
		return
	}
	doc, ok := h.openSource(w, r, body.importSourceJSON)
	if !ok {
		return
	}
	if body.Basis == nil {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	call.target = body.Backup
	for _, sec := range []struct{ name, mode string }{{"users", body.Users}, {"connections", body.Connections}, {"settings", body.Settings}} {
		if sec.mode != importSkip {
			call.changed = append(call.changed, sec.name)
		}
	}

	var users *sectionImport[userRec]
	if body.Users != importSkip {
		users = &sectionImport[userRec]{recs: doc.Users, merge: body.Users == importMerge}
	}
	var conns *sectionImport[connRec]
	if body.Connections != importSkip {
		conns = &sectionImport[connRec]{recs: doc.Connections, merge: body.Connections == importMerge}
	}
	var staged importStaged
	var settings stagedSettings
	err := h.store.wr.Do(r.Context(), func(tx *txn) error {
		if err := h.settingsCaller(r); err != nil {
			return err
		}
		var paths []string
		if users != nil {
			paths = append(paths, h.store.usersPath)
		}
		if conns != nil {
			paths = append(paths, h.store.connsPath)
		}
		if body.Settings != importSkip {
			paths = append(paths, h.settings.path)
		}
		if err := tx.check(paths...); err != nil {
			return err
		}
		cur := h.currentBasis()
		if (users != nil && body.Basis.Users != cur.Users) ||
			(conns != nil && body.Basis.Connections != cur.Connections) ||
			(body.Settings != importSkip && body.Basis.Settings != cur.Settings) {
			return newStaleBasis(cur)
		}
		if users != nil || conns != nil {
			var err error
			if staged, err = h.store.stageImport(tx, users, conns); err != nil {
				return err
			}
		}
		if body.Settings != importSkip {
			var err error
			if settings, err = h.stageSettings(tx, r, withHostPaths(doc.Settings, h.settings.current())); err != nil {
				return err
			}
		}
		tx.afterCommit(h.committed(r, call, func() []auditWrote {
			var wrote []auditWrote
			if users != nil {
				wrote = append(wrote, auditWrote{File: filepath.Base(h.store.usersPath), Seq: int64(staged.usersSeq)})
			}
			if conns != nil {
				wrote = append(wrote, auditWrote{File: filepath.Base(h.store.connsPath), Seq: int64(staged.connsSeq)})
			}
			if body.Settings != importSkip {
				wrote = append(wrote, h.wroteSettings()...)
			}
			return wrote
		}))
		return nil
	})
	if err != nil {
		h.backupFailed(w, r, "importBackup", err)
		return
	}
	result := importResultJSON{RestartRequired: []string{}}
	if settings.restart != nil {
		result.RestartRequired = settings.restart
	}
	for _, name := range staged.drop {
		h.sessions.dropUser(name)
		h.totp.forget(name) // an imported secret is not compared with the old one's steps
	}
	result.SignedOut = slices.Contains(staged.drop, sessionOf(r).user)
	h.log(r).Info("configuration imported", "users", body.Users, "connections", body.Connections,
		"settings", body.Settings, "from", doc.Created, "restart_required", result.RestartRequired)
	writeJSON(w, http.StatusOK, result)
}
