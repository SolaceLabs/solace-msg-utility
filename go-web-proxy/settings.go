package main

import (
	"errors"
	"log/slog"
	"net/http"
	"path/filepath"
	"sync"
)

// settingsFile lets an administrator edit config.yaml from the admin app
// (GET and PUT /managed/settings). A save is validated exactly as at startup,
// written through the writer's journaled commit with the usual header, and its
// live keys (live.go) apply at once; restart-only keys are saved and reported
// back, except the hostOnly path keys, which only a hand edit changes.
//
// The settings rev is the writer's keyed checksum of config.yaml as last read
// or written (checksums.rev): opaque, derived from the store key, never stored.
// A save carries the rev it was read at and runs inside writer.Do, so two
// admins cannot overwrite each other, and the gateway will not save over a
// hand edit it has not loaded (the disk check, sticky until restart).
type settingsFile struct {
	// mu guards saved only. Take it for a moment inside a writer transaction
	// or in a publish; never hold it while waiting for the writer (the lock
	// order is writer, publish lock, then mu).
	mu     sync.Mutex
	path   string
	boot   config     // the running config; its restart-only keys never change
	saved  fileConfig // the file as last read or written, normalised
	live   *live
	wr     *writer
	logger *slog.Logger
}

// newSettingsFile starts the settings of src's file under writer wr. The bytes
// src holds are what the file said when the gateway loaded it: they become the
// checksum the rev and the disk check start from, so a hand edit between the
// load and the first save is caught. A source without bytes (a test that never
// saves) leaves the file unchecked and its rev empty.
func newSettingsFile(src configSource, boot config, lv *live, wr *writer, logger *slog.Logger) *settingsFile {
	if src.data != nil {
		wr.sums.remember(src.path, src.data)
	}
	return &settingsFile{path: src.path, boot: boot, saved: fileConfigFromConfig(boot), live: lv, wr: wr, logger: logger}
}

// rev is the settings rev now: what a GET shows and what a save must carry. An
// import's basis holds it; read it inside a writer transaction or a snapshot
// for a value that cannot move under the caller.
func (sf *settingsFile) rev() string { return sf.wr.rev(sf.path) }

// changedOnDisk reports whether the file no longer holds what the gateway last
// read or wrote (the writer's disk check, so it stays true until a restart). A
// file it cannot read is an error, not a hand edit.
func (sf *settingsFile) changedOnDisk() (bool, error) {
	err := sf.wr.sums.check(sf.path)
	var disk *changedOnDiskError
	switch {
	case err == nil:
		return false, nil
	case errors.As(err, &disk):
		return true, nil
	}
	return false, errors.Unwrap(err) // the read error, without the writer's "nothing was changed"
}

// configUnreadable answers 500 config_unreadable with what to do.
func (h *managedHandler) configUnreadable(w http.ResponseWriter, err error) {
	h.logger.Error("managed: cannot read config file", "path", h.settings.path, "err", err)
	reason := "The gateway cannot read config.yaml (" + err.Error() + "). Fix the file on the gateway host, then reload this page."
	writeJSON(w, http.StatusInternalServerError, apiError{Error: "config_unreadable", Reason: reason})
}

// settingsJSON is the GET /managed/settings body.
type settingsJSON struct {
	Settings       fileConfig `json:"settings"`
	Rev            string     `json:"rev"`            // opaque; a save sends it back
	RestartOnly    []string   `json:"restartOnly"`    // keys that apply at restart
	HostOnly       []string   `json:"hostOnly"`       // keys only a hand edit changes
	PendingRestart []string   `json:"pendingRestart"` // saved, not yet running
	ChangedOnDisk  bool       `json:"changedOnDisk"`  // hand-edited since loaded
	Catalog        []string   `json:"catalog"`        // modules.offered choices
}

// getSettings answers the saved file and its rev as one committed state: it
// reads under the writer's publish lock, so a save that is publishing is seen
// whole, never the new rev with the old settings.
func (h *managedHandler) getSettings(w http.ResponseWriter, _ *http.Request) {
	sf := h.settings
	var body settingsJSON
	var err error
	sf.wr.snapshot(func() {
		sf.mu.Lock()
		defer sf.mu.Unlock()
		var changed bool
		if changed, err = sf.changedOnDisk(); err != nil {
			return
		}
		body = settingsJSON{
			Settings:       sf.saved,
			Rev:            sf.rev(),
			RestartOnly:    restartOnlyKeyNames(),
			HostOnly:       hostOnlyKeyNames(),
			PendingRestart: pendingRestart(sf.boot, sf.saved),
			ChangedOnDisk:  changed,
			Catalog:        moduleCatalog(),
		}
	})
	if err != nil {
		h.configUnreadable(w, err)
		return
	}
	writeJSON(w, http.StatusOK, body)
}

// current returns config.yaml as last read or written.
func (sf *settingsFile) current() fileConfig {
	sf.mu.Lock()
	defer sf.mu.Unlock()
	return sf.saved.clone()
}

// settingsBody is the PUT /managed/settings body: the settings keys at top
// level, as the page shows them, and the rev of the document they were read
// at. A pointer, so a missing rev is not an empty one.
type settingsBody struct {
	fileConfig
	Rev *string `json:"rev"`
}

// saveSettings validates and writes the whole file. A key missing from the
// body keeps its saved value. Refusals, in order: 400 rev_required (no rev),
// then inside the writer: 503 audit_unavailable (the gate), the caller no
// longer an administrator (401, 403), 409 config_changed_on_disk (a hand edit
// the gateway has not loaded; it wins over stale), 409 stale (carrying the
// current rev), then checkSettings' refusals. Success is 200 with the keys
// still to restart and the new rev.
func (h *managedHandler) saveSettings(w http.ResponseWriter, r *http.Request, call *auditCall) {
	sf := h.settings
	// The base of the decode is the saved file read now, outside the writer.
	// It matters only when the save is accepted, and then no commit has landed
	// since the admin read the page (the rev says so), so it is the file the
	// admin saw.
	body := settingsBody{fileConfig: sf.current()}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Rev == nil || *body.Rev == "" {
		_, _ = writeStoreError(w, errRevRequired)
		return
	}
	var staged stagedSettings
	var newRev string
	err := sf.wr.Do(r.Context(), func(tx *txn) error {
		if err := h.settingsCaller(r); err != nil {
			return err
		}
		if err := tx.check(sf.path); err != nil {
			return err
		}
		if cur := tx.rev(sf.path); *body.Rev != cur {
			return newStale(cur)
		}
		var err error
		if staged, err = h.stageSettings(tx, r, body.fileConfig); err != nil {
			return err
		}
		tx.afterCommit(func() { newRev = tx.rev(sf.path) })
		return nil
	})
	if err != nil {
		h.settingsFailed(w, r, err)
		return
	}
	call.changed = staged.changed
	call.wrote = []auditWrote{{File: filepath.Base(sf.path)}}
	h.log(r).Info("gateway settings saved", "file", sf.path, "changed", staged.changed, "restart_required", staged.restart)
	writeJSON(w, http.StatusOK, map[string]any{"restartRequired": staged.restart, "rev": newRev})
}

// settingsFailed answers an error of a settings transaction: the shared store
// errors and refusals as they say, anything else as a 500 server_error. A
// store write that failed is logged with its cause (the body never carries it).
func (h *managedHandler) settingsFailed(w http.ResponseWriter, r *http.Request, err error) {
	if _, ok := writeStoreError(w, err); !ok {
		h.serverError(w, r, "saveSettings", err)
		return
	}
	var failed *writeFailedError
	if errors.As(err, &failed) {
		h.log(r).Error("gateway settings not saved", "file", h.settings.path, "err", err)
	}
}

// settingsCaller is the writer-lock re-check of the caller: the administrator
// who sent the request must still be one now that it holds the lock (a
// demotion or a deletion while it waited is refused as the gate would).
func (h *managedHandler) settingsCaller(r *http.Request) error {
	admin, exists := h.store.isAdmin(sessionOf(r).user)
	switch {
	case !exists:
		return newRefusal(http.StatusUnauthorized, apiError{Error: "unauthenticated"})
	case !admin:
		return newRefusal(http.StatusForbidden, apiError{Error: "forbidden"})
	}
	return nil
}

// invalidRefusal is the 422 invalid refusal for field, as writeInvalid answers.
func invalidRefusal(field, reason string) error {
	return newRefusal(http.StatusUnprocessableEntity, apiError{Error: "invalid", Field: field, Reason: reason})
}

// checkSettings validates body as the settings to save, for the settings page
// and for an import alike. It reads the saved file but changes nothing, and
// returns a refusal (newRefusal, answered by writeStoreError) naming what is
// wrong. Refusals:
//   - 422 invalid: a changed hostOnly path key; a value startup would reject;
//     connModes direct, which would end Provisioned mode and this console
//   - 409 would_lock_out: the new access list would deny this request's client
//
// The disk check and the rev are the caller's, inside the writer transaction.
func (h *managedHandler) checkSettings(r *http.Request, body fileConfig) (config, error) {
	sf := h.settings
	saved := sf.current()
	body.Version = configVersion
	for _, k := range restartOnlyKeys {
		if k.hostOnly && k.value(body) != k.value(saved) {
			return config{}, invalidRefusal(k.key, k.key+" is a path, so it changes only in config.yaml on the gateway host, followed by a restart.")
		}
	}
	cfg, err := body.toConfig(secretPaths{storeKey: sf.boot.storeKeyFile})
	if err != nil {
		return config{}, invalidRefusal("settings", err.Error())
	}
	// Direct alone would end Provisioned mode at the next restart, and this
	// console with it, leaving no page to undo it from. That change is the
	// host's to make.
	if cfg.connModes == connDirect {
		return config{}, invalidRefusal("connModes", `connModes "direct" would turn Provisioned mode off at the next restart, and this console with it. To leave Provisioned mode, set connModes: direct in config.yaml on the gateway host and restart.`)
	}
	ip, ok := clientIP(r.RemoteAddr, r.Header.Values("X-Forwarded-For"), cfg.access.trustedProxies)
	if len(cfg.access.allow) > 0 && !(ok && prefixContains(cfg.access.allow, ip)) {
		reason := "The gateway cannot tell your address, so this allow list would deny this browser."
		if ok {
			reason = "This allow list would deny your own address (" + ip.String() + "). Add it, or a range that contains it."
		}
		return config{}, newRefusal(http.StatusConflict, apiError{Error: "would_lock_out", Field: "access.allow", Reason: reason})
	}
	return cfg, nil
}

// stagedSettings is what staging a settings document tells its caller:
// restart is the restart-only keys now pending, as a save answers them;
// changed the settings keys, dotted, on which the new file differs from the
// saved one (settingsChanges), for the audit entry.
type stagedSettings struct {
	restart, changed []string
}

// stageSettings is the import's way into config.yaml: inside a transaction the
// caller opened (writer.Do), it validates body as checkSettings does, stages
// the new file and registers the publish that takes it in (the saved file and
// the live keys, in the commit's one critical section). A refusal comes back
// as an error the caller returns from its op unchanged (writeStoreError
// answers it); nothing is written or applied until the transaction commits.
// The caller does the disk check first (tx.check(h.settings.path)) and its own
// basis comparison; Do checks the disk again before it commits. The settings
// rev after the commit is h.settings.rev().
func (h *managedHandler) stageSettings(tx *txn, r *http.Request, body fileConfig) (stagedSettings, error) {
	cfg, err := h.checkSettings(r, body)
	if err != nil {
		return stagedSettings{}, err
	}
	return h.settings.stage(tx, cfg)
}

// stage encodes cfg as config.yaml into tx, verified by a strict parse of the
// bytes read back, and registers the publish. Nothing changes until tx commits.
func (sf *settingsFile) stage(tx *txn, cfg config) (stagedSettings, error) {
	saved := fileConfigFromConfig(cfg)
	data, err := encodeConfigFile(saved)
	if err != nil {
		return stagedSettings{}, err
	}
	changed := settingsChanges(sf.current(), saved)
	tx.stage(sf.path, data, 0o644, configVerifier(sf.path))
	tx.onPublish(func() { sf.apply(saved, cfg) })
	return stagedSettings{restart: pendingRestart(sf.boot, saved), changed: changed}, nil
}

// apply takes a committed change in: the saved file and the live keys at once.
// It runs from the commit's publish, which holds the writer's publish lock.
func (sf *settingsFile) apply(saved fileConfig, cfg config) {
	sf.mu.Lock()
	sf.saved = saved
	sf.mu.Unlock()
	sf.live.apply(cfg)
}
