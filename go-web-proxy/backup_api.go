package main

import (
	"errors"
	"io/fs"
	"net/http"
	"slices"
	"strconv"
	"time"
)

// The Backup & Restore page's API (admin only; backup.go has the format and
// the schedule):
//
//	GET    /managed/backup               schedule, last and next run, directory problem, files
//	GET    /managed/backup/files/{name}  one saved backup, as it is on disk
//	PUT    /managed/backup/schedule      save the schedule; a passphrase derives a new key
//	DELETE /managed/backup/schedule      remove it (the files stay)
//	POST   /managed/backup/run           back up now, with the schedule's key
//	POST   /managed/backup/export        a backup file, sealed with the given passphrase
//	POST   /managed/backup/preview       what importing a file would change
//	POST   /managed/backup/import        import it, section by section
//
// Preview and import take the file itself or the name of one in the backup
// directory, and the passphrase, each time: the gateway holds no pending
// import between the two.

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
	mux.HandleFunc("PUT /managed/backup/schedule", h.adminOnly(h.saveBackupSchedule))
	mux.HandleFunc("DELETE /managed/backup/schedule", h.adminOnly(h.deleteBackupSchedule))
	mux.HandleFunc("POST /managed/backup/run", h.adminOnly(h.runBackup))
	mux.HandleFunc("POST /managed/backup/export", h.adminOnly(h.exportBackup))
	mux.HandleFunc("POST /managed/backup/preview", h.adminOnly(h.previewImport))
	mux.HandleFunc("POST /managed/backup/import", h.adminOnly(h.importBackup))
}

// writeBackupProblem answers a *backupProblem as a 422; anything else is a
// server error.
func (h *managedHandler) writeBackupProblem(w http.ResponseWriter, op string, err error) {
	var p *backupProblem
	if errors.As(err, &p) {
		writeInvalid(w, p.field, p.reason)
		return
	}
	h.serverError(w, op, err)
}

// ----- status and schedule ----------------------------------------------------------

type backupScheduleJSON struct {
	backupSchedule
	Keep int `json:"keep"`
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
	if sd := b.schedule(); sd != nil {
		out.Schedule = &backupScheduleJSON{backupSchedule: sd.Schedule, Keep: sd.Keep}
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
		h.writeBackupProblem(w, "downloadBackup", err)
	default:
		h.logger.Warn("backup downloaded", "by", sessionOf(r).user, "file", name)
		writeJSON(w, http.StatusOK, map[string]string{"filename": name, "content": string(data)})
	}
}

type scheduleSaveJSON struct {
	backupSchedule
	Keep       int    `json:"keep"`
	Passphrase string `json:"passphrase"` // "" keeps the current key
}

func (h *managedHandler) saveBackupSchedule(w http.ResponseWriter, r *http.Request) {
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
	if err := h.backups.setSchedule(r.Context(), body.backupSchedule, body.Keep, body.Passphrase); err != nil {
		h.writeBackupProblem(w, "saveBackupSchedule", err)
		return
	}
	h.logger.Warn("backup schedule saved", "by", sessionOf(r).user, "kind", body.Kind, "keep", body.Keep, "new_passphrase", body.Passphrase != "")
	w.WriteHeader(http.StatusNoContent)
}

func (h *managedHandler) deleteBackupSchedule(w http.ResponseWriter, r *http.Request) {
	found, err := h.backups.removeSchedule()
	switch {
	case err != nil:
		h.serverError(w, "deleteBackupSchedule", err)
	case !found:
		writeError(w, http.StatusNotFound, "not_found")
	default:
		h.logger.Warn("backup schedule removed", "by", sessionOf(r).user)
		w.WriteHeader(http.StatusNoContent)
	}
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
		h.logger.Warn("backup run by an administrator", "by", sessionOf(r).user, "file", name)
		writeJSON(w, http.StatusOK, map[string]string{"file": name})
	}
}

// ----- export ------------------------------------------------------------------------------

func (h *managedHandler) exportBackup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Passphrase string `json:"passphrase"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	k, err := newBackupKey(r.Context(), h.backups.hasher, body.Passphrase)
	if err != nil {
		h.writeBackupProblem(w, "exportBackup", err)
		return
	}
	data, err := sealBackup(k, h.backups.snapshot())
	if err != nil {
		h.serverError(w, "exportBackup", err)
		return
	}
	h.logger.Warn("configuration exported", "by", sessionOf(r).user)
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
				h.writeBackupProblem(w, "readBackup", err)
			}
			return backupDoc{}, false
		}
	}
	doc, err := openBackup(r.Context(), h.backups.hasher, data, src.Passphrase)
	if err != nil {
		h.writeBackupProblem(w, "openBackup", err)
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
	users, conns := h.store.listUsers(), h.store.listConnections()
	caller := sessionOf(r).user
	writeJSON(w, http.StatusOK, importPreviewJSON{
		Created:     doc.Created,
		Gateway:     doc.Gateway,
		Users:       diffByName(users, doc.Users, userName),
		Connections: diffByName(conns, doc.Connections, connName),
		Settings:    settingsChanges(h.settings.current(), doc.Settings),
		SignsOutCaller: signsOutJSON{
			Replace: slices.Contains(sessionEnders(users, doc.Users), caller),
			Merge:   slices.Contains(sessionEnders(users, mergeByName(users, doc.Users, userName)), caller),
		},
	})
}

type importJSON struct {
	importSourceJSON
	Users       string `json:"users"`       // replace | merge | skip
	Connections string `json:"connections"` // replace | merge | skip
	Settings    string `json:"settings"`    // replace | skip
}

type importResultJSON struct {
	RestartRequired []string `json:"restartRequired"`
	SignedOut       bool     `json:"signedOut"` // the requester's session ended
}

// importBackup applies the chosen sections. Everything is validated before
// anything is written; the writes then go users, connections, settings, each
// file atomic. Refusals: 422 invalid (a choice, the file, the passphrase, or
// records the gateway would not load), 409 last_admin (no administrator
// would remain), and checkSettings' refusals for the settings.
func (h *managedHandler) importBackup(w http.ResponseWriter, r *http.Request) {
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

	sf := h.settings
	sf.mu.Lock()
	defer sf.mu.Unlock()

	var users []userRec
	switch body.Users {
	case importReplace:
		users = append([]userRec{}, doc.Users...)
	case importMerge:
		users = mergeByName(h.store.listUsers(), doc.Users, userName)
	}
	if users != nil {
		if countAdmins(users) == 0 {
			writeError(w, http.StatusConflict, "last_admin")
			return
		}
		if err := validateUsers(users); err != nil {
			writeInvalid(w, "file", "The backup's users cannot be imported: "+err.Error())
			return
		}
	}
	var conns []connRec
	switch body.Connections {
	case importReplace:
		conns = append([]connRec{}, doc.Connections...)
	case importMerge:
		conns = mergeByName(h.store.listConnections(), doc.Connections, connName)
	}
	if conns != nil {
		if err := validateConns(conns); err != nil {
			writeInvalid(w, "file", "The backup's connections cannot be imported: "+err.Error())
			return
		}
	}
	var cfg *config
	if body.Settings == importReplace {
		c, ok := h.checkSettings(w, r, withHostPaths(doc.Settings, sf.saved))
		if !ok {
			return
		}
		cfg = &c
	}

	result := importResultJSON{RestartRequired: []string{}}
	caller := sessionOf(r).user
	if users != nil {
		drop, err := h.store.replaceUsers(users)
		if err != nil {
			h.serverError(w, "importUsers", err)
			return
		}
		for _, name := range drop {
			h.sessions.dropUser(name)
		}
		result.SignedOut = slices.Contains(drop, caller)
	}
	if conns != nil {
		if err := h.store.replaceConnections(conns); err != nil {
			h.serverError(w, "importConnections (users already imported)", err)
			return
		}
	}
	if cfg != nil {
		restart, err := sf.commit(*cfg)
		if err != nil {
			h.serverError(w, "importSettings (users and connections already imported)", err)
			return
		}
		result.RestartRequired = restart
	}
	h.logger.Warn("configuration imported", "by", caller, "users", body.Users, "connections", body.Connections,
		"settings", body.Settings, "from", doc.Created, "restart_required", result.RestartRequired)
	writeJSON(w, http.StatusOK, result)
}
