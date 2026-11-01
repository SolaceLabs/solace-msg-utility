//go:build managed

package main

import (
	"crypto/sha256"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"sync"
)

// settingsFile lets an administrator edit config.yaml from the admin app
// (GET and PUT /managed/settings). A save is validated exactly as at startup,
// written atomically with the usual header, and its live keys (live.go) apply
// at once; restart-only keys are saved and reported back, except the hostOnly
// path keys, which only a hand edit changes. The gateway will not save over a
// hand edit it has not loaded: it keeps the SHA-256 of the bytes it last read
// or wrote and compares before writing.
type settingsFile struct {
	mu     sync.Mutex
	path   string
	boot   config     // the running config; its restart-only keys never change
	saved  fileConfig // the file as last read or written, normalised
	sum    [32]byte
	live   *live
	logger *slog.Logger
}

func newSettingsFile(src configSource, boot config, lv *live, logger *slog.Logger) *settingsFile {
	return &settingsFile{path: src.path, sum: src.sum, boot: boot, saved: fileConfigFromConfig(boot), live: lv, logger: logger}
}

// changedOnDisk reports whether the file no longer holds what the gateway last
// read or wrote. A file it cannot read is an error, not a hand edit.
func (sf *settingsFile) changedOnDisk() (bool, error) {
	data, err := os.ReadFile(sf.path)
	if err != nil {
		return false, err
	}
	return sha256.Sum256(data) != sf.sum, nil
}

// configUnreadable answers 500 config_unreadable with what to do: a missing
// file is written again from the environment at the next start.
func (h *managedHandler) configUnreadable(w http.ResponseWriter, err error) {
	h.logger.Error("managed: cannot read config file", "path", h.settings.path, "err", err)
	reason := "The gateway cannot read config.yaml (" + err.Error() + "). Fix the file on the gateway host, then reload this page."
	if errors.Is(err, fs.ErrNotExist) {
		reason = "config.yaml is missing on the gateway host (" + h.settings.path + "). Restart the gateway to write it again, then reload this page."
	}
	writeJSON(w, http.StatusInternalServerError, apiError{Error: "config_unreadable", Reason: reason})
}

// settingsJSON is the GET /managed/settings body.
type settingsJSON struct {
	Settings       fileConfig `json:"settings"`
	RestartOnly    []string   `json:"restartOnly"`    // keys that apply at restart
	HostOnly       []string   `json:"hostOnly"`       // keys only a hand edit changes
	PendingRestart []string   `json:"pendingRestart"` // saved, not yet running
	ChangedOnDisk  bool       `json:"changedOnDisk"`  // hand-edited since loaded
	Catalog        []string   `json:"catalog"`        // modules.offered choices
}

func (h *managedHandler) getSettings(w http.ResponseWriter, _ *http.Request) {
	sf := h.settings
	sf.mu.Lock()
	defer sf.mu.Unlock()
	changed, err := sf.changedOnDisk()
	if err != nil {
		h.configUnreadable(w, err)
		return
	}
	writeJSON(w, http.StatusOK, settingsJSON{
		Settings:       sf.saved,
		RestartOnly:    restartOnlyKeyNames(),
		HostOnly:       hostOnlyKeyNames(),
		PendingRestart: pendingRestart(sf.boot, sf.saved),
		ChangedOnDisk:  changed,
		Catalog:        moduleCatalog(),
	})
}

// saveSettings validates and writes the whole file. A key missing from the
// body keeps its saved value. Refusals, in order:
//   - 422 invalid: a changed hostOnly path key; a value startup would reject;
//     connModes offering managed sign-in while the running gateway is not hosted
//   - 409 would_lock_out: the new access list would deny this request's client
//   - 500 config_unreadable: the file cannot be read to check for a hand edit
//   - 409 config_changed_on_disk: a hand edit the gateway has not loaded
func (h *managedHandler) saveSettings(w http.ResponseWriter, r *http.Request) {
	sf := h.settings
	sf.mu.Lock()
	defer sf.mu.Unlock()
	body := sf.saved.clone()
	if !decodeJSON(w, r, &body) {
		return
	}
	body.Version = configVersion
	for _, k := range restartOnlyKeys {
		if k.hostOnly && k.value(body) != k.value(sf.saved) {
			writeInvalid(w, k.key, k.key+" is a path, so it changes only in config.yaml on the gateway host, followed by a restart.")
			return
		}
	}
	cfg, err := body.toConfig(secretPaths{siteSeed: sf.boot.siteSeedFile, storeKey: sf.boot.storeKeyFile})
	if err != nil {
		writeInvalid(w, "settings", err.Error())
		return
	}
	// connModes applies now but hosted only at restart, so the pair must
	// also hold for the running gateway.
	running := sf.boot
	running.connModes, running.defaultConn = cfg.connModes, cfg.defaultConn
	if err := validateConnModes(running, true); err != nil {
		writeInvalid(w, "connModes", err.Error()+" in the running gateway; hosted applies at restart, so save it first and restart")
		return
	}
	ip, ok := clientIP(r.RemoteAddr, r.Header.Values("X-Forwarded-For"), cfg.access.trustedProxies)
	if len(cfg.access.allow) > 0 && !(ok && prefixContains(cfg.access.allow, ip)) {
		reason := "The gateway cannot tell your address, so this allow list would deny this browser."
		if ok {
			reason = "This allow list would deny your own address (" + ip.String() + "). Add it, or a range that contains it."
		}
		writeJSON(w, http.StatusConflict, apiError{Error: "would_lock_out", Field: "access.allow", Reason: reason})
		return
	}
	changed, err := sf.changedOnDisk()
	if err != nil {
		h.configUnreadable(w, err)
		return
	}
	if changed {
		writeError(w, http.StatusConflict, "config_changed_on_disk")
		return
	}
	saved := fileConfigFromConfig(cfg)
	data, err := encodeConfigFile(saved)
	if err == nil {
		err = writeFileAtomic(sf.path, data, 0o644)
	}
	if err != nil {
		h.serverError(w, "saveSettings", err)
		return
	}
	sf.saved, sf.sum = saved, sha256.Sum256(data)
	sf.live.apply(cfg)
	restart := pendingRestart(sf.boot, saved)
	h.logger.Warn("gateway settings saved", "by", sessionOf(r).user, "path", sf.path, "restart_required", restart)
	writeJSON(w, http.StatusOK, map[string]any{"restartRequired": restart})
}
