# E-settings note: config.yaml on the journal, settings rev, audit.onFailure, wrote

Files: go-web-proxy/settings.go, settings_test.go, configfile.go, configfile_test.go, live_test.go (one line), audit.go, audit_test.go,
main.go (3 small edits), writer.go (A1's, small edit, see below). live.go needed no change (audit is copied whole by apply).
Nothing compiled or run. ASCII only. Hand-formatted for gofmt.

## API others rely on (package main)

### Settings (settings.go)
    func newSettingsFile(src configSource, boot config, lv *live, wr *writer, logger *slog.Logger) *settingsFile
        NEW param wr (after lv). It calls wr.sums.remember(src.path, src.data) when src.data != nil. The writer's sums MUST already hold
        the store key (build the writer after loadStore / the key is read). settingsFile keeps wr in sf.wr.
    type configSource struct { path string; data []byte }      // was {path, sum [32]byte}
    configLoad.data []byte replaces configLoad.sum; main.go passes configSource{path: configFile, data: load.data}.
    func seedConfigFile(path string, cfg config) ([]byte, error)   // returns the bytes written (was [32]byte). One-shot nil-key writer, journaled.
    func configVerifier(path string) func([]byte) error            // strict-parse verify for any config.yaml stage
    func (sf *settingsFile) rev() string                           // current settings rev ("" with no key / no data)
    func (sf *settingsFile) current() fileConfig                   // unchanged (locks sf.mu briefly)
    func (sf *settingsFile) stage(tx *txn, cfg config) (stagedSettings, error)
    type stagedSettings struct{ restart, changed []string }
    func (h *managedHandler) checkSettings(r *http.Request, body fileConfig) (config, error)   // CHANGED: no w, returns a refusal error
    func (h *managedHandler) stageSettings(tx *txn, r *http.Request, body fileConfig) (stagedSettings, error)   // FOR THE BACKUP IMPORT
    func (h *managedHandler) settingsCaller(r *http.Request) error   // 401/403 re-check inside the lock
    func invalidRefusal(field, reason string) error                  // 422 invalid as an error
    sf.mu now guards sf.saved only. sf.sum, sf.commit, sf.apply(ch settingsChange), type settingsChange are GONE.
    apply is now sf.apply(saved fileConfig, cfg config), called only from the publish.

### stageSettings usage (backup import, inside its writer.Do op)
    if err := tx.check(h.settings.path /*, usersPath, connsPath*/); err != nil { return err }
    // basis compare: cur := h.settings.rev()  (settings part of basis; compare only when settings != skip)
    staged, err := h.stageSettings(tx, r, withHostPaths(doc.Settings, h.settings.current()))
    if err != nil { return err }          // a *refusalError, answered by writeStoreError
    // staged.restart = restart-only keys now pending (import answer), staged.changed = dotted keys, for call.changed if wanted
    // the publish (saved file + live keys) is registered; it runs with the other onPublish funcs in the one critical section
    // new settings rev after the commit: h.settings.rev()
    The import MUST NOT hold sf.mu around writer.Do (the old importBackup did: remove sf.mu.Lock/defer). Use sf.current() for saved.
    Old doc.Settings from before this change has audit.onFailure "" : accepted as continue (checkAuditOnFailure), written back as "continue".

### Refusal error (writer.go, small edit to A1's file)
    type refusalError{status int; body apiError}; func newRefusal(status int, body apiError) error
    classifyStoreError gained: case errors.As(err, &refusal) -> refusal.status, refusal.body, true. So writeStoreError answers
    422 invalid / 409 would_lock_out / 401 / 403 returned from an op. Handlers agent may reuse newRefusal for last_admin etc.
    Edit made after re-reading writer.go; it adds the type, newRefusal, `var refusal *refusalError`, one case. A1's writer_test.go untouched
    (the case is covered in settings_test.go TestRefusalError_IsAnsweredAsItSays).

### Audit (audit.go)
    type auditWrote struct { File string `json:"file"`; Seq int64 `json:"seq,omitempty"` }
    auditEntry.Wrote []auditWrote `json:"wrote,omitempty"` between Changed and Msg.   Seq is int64: convert A2's seq type.
    const auditOnFailureContinue = "continue", auditOnFailureRefuse = "refuse"
    auditSettings{stdout, access bool; onFailure string}   (zero onFailure == continue everywhere)
    func (a *auditor) gate() error      // nil-safe; errAuditUnavailable only if onFailure==refuse && last write lost its record
    auditor.failing atomic.Bool          // set by every record() that wrote (true on a lost record, false on a success). Dropped access entries touch nothing.
    auditor.write now returns (rotateErr, writeErr error). Lost record -> ERROR "AUDIT RECORD LOST" with attrs path, err, entry_time, actor,
    client, action, target, outcome, code, changed, wrote, entry_msg. A rotation failure whose line was still written logs
    "audit log rotation failed; the entry was written to the current file ..." and is NOT a lost record / not failing.
    func checkAuditOnFailure(v string) (string, error)   // "" -> continue
    fileAudit.OnFailure string `yaml:"onFailure" json:"onFailure"`; fileConfigFromConfig uses onFailureOrDefault; defaultConfig() and loadConfig()
    set audit.onFailure continue. config.yaml header text mentions audit.onFailure.

## WIRING NEEDED (handlers agent: managed.go, managed_routing.go, tests fixtures)
1. buildManagedRoutes: construct ONE writer after loadStore (key known): sums from the store key (newChecksums), newWriter(dir of users file,
   sums, logger) and call newSettingsFile(src, cfg, lv, wr, logger). h.settings.wr is that writer; handlers may use it as their writer.
   (configSource now carries data, so the first remembered checksum of config.yaml is the bytes resolveConfig read.)
2. setAuditor(a): add `h.settings.wr.gate = a.gate` (a.gate is nil-safe; method value on the *auditor). Without it refuse never refuses.
   My tests (settings_test.go TestSettings_OnFailureRefuse..., OnFailureContinue..., via managedEnv.withLoudAudit -> e.routes.setAuditor) rely on it,
   and on e.routes.audit being the auditor.
3. auditCall (managed.go) needs `wrote []auditWrote`; recordAdmin must copy it into the entry on the ok branch: `e.Wrote = call.wrote`.
   saveSettings sets call.wrote = []auditWrote{{File: "config.yaml"}} and call.changed. COMPILE DEPENDENCY: field name must be `wrote`.
4. auditRefused for 503/409/etc. needs nothing extra: the audited wrapper already records refused with the code of the error body.
   The refusal line is what clears the failing state (see deviations).
5. managed_test.go newManagedEnvFrom: `sum, err := seedConfigFile(...)` -> `data, err :=`, `configSource{path: cfgPath, data: data}`, and the
   buildManagedRoutes call as the wiring dictates. Same for backup_test.go:485-496 (seedConfigFile / newSettingsFile now takes a writer) and
   managed_routing_test.go (configSource{} literals still compile; configSource{path: ...} too).
6. The audit-trail for a refused settings save keeps working through writeStoreError; nothing else to wire for settings.
7. Any code reading sf.saved / sf.mu / sf.sum / checkSettings(w, r, body) / sf.stage(tx *fileTx...) / sf.apply(change) / sf.commit must migrate
   (backup_api.go importBackup is the only caller).

## Behavior of PUT /managed/settings (as built)
decode (400 bad_request / 413) -> rev missing/null/"" = 400 rev_required (a non-string rev is 400 bad_request) -> writer.Do:
gate 503 audit_unavailable -> settingsCaller 401/403 -> disk check 409 config_changed_on_disk (sticky; wins over stale) -> 409 stale
{"error":"stale","rev":"<current>"} -> checkSettings refusals (422 invalid, 409 would_lock_out) -> stage + commit.
Success 200 {"restartRequired":[...],"rev":"<new rev>"}. Failed commit: 500 store_write_failed (logged "gateway settings not saved").
GET: {"settings","rev","restartOnly","hostOnly","pendingRestart","changedOnDisk","catalog"}; read under w.snapshot so rev and settings match.
GET unreadable file (not absent) = 500 config_unreadable; absent file (was present at load) = changedOnDisk true and sticky (was config_unreadable "missing").
The handler holds sf.mu only for brief reads inside the writer op or the publish; never while waiting for the writer. Lock order: writer, pub, sf.mu.
The decode base is sf.current() read before the lock (correct whenever the save is accepted: an accepted rev means no commit since the admin read).

## Deviations
- gate does NOT write its own refusal line (it has no request, so no actor/action). The audited handler wrapper writes the refusal line
  (outcome refused, code audit_unavailable) for the 503, and that successful write clears the failing state, so the observable behaviour
  (next change 503, recovery once writable, one more refusal then ok) is as specified. Dropping the duplicate generic line was deliberate.
- Missing config.yaml (was present at load) is now config_changed_on_disk (sticky), not config_unreadable "missing ... restart to write it again".
  config_unreadable remains for a file that exists but cannot be read (GET only; a PUT gets 500 store_write_failed).
- audit.onFailure "" (a file or backup from before the key) loads as continue instead of being refused: old backups must still import.
- Added a caller re-check (settingsCaller) inside the lock for settings, per 11.1's order, and a refusalError type in writer.go.
- "the drop of removed keys": there is no start-time rewrite in the code; the keys drop on the next settings save (encode never writes them),
  which now goes through the journal. Nothing extra to wire.
- seedConfigFile returns []byte and configSource/configLoad carry bytes instead of a SHA-256 (the keyed checksum needs the bytes).
- Rev is "" when no store key / no source bytes: PUT then can never carry a matching rev. Provisioned always has a key.

## Tests (mine)
configfile_test.go: audit onFailure default/validation/round trip, old file default and written, seed through the journal (mode, no leftovers),
configVerifier + refused round trip, load.data checks. audit_test.go: lost record loud with fields, reopen failure, rotation failure is not a loss,
wrote shape and order, gate (refuse/continue/nil/recovery), dropped access entry. settings_test.go: rev across restart / other key / nothing
written, save moves rev + stale + no journal leftovers, rev_required cases, hand edit at write time wins over stale and is sticky, deleted and
unreadable file, write failure, caller re-check, stageSettings commit and refusals, refusalError mapping, onFailure live key, settingsChanges,
onFailure continue and refuse over managedEnv. Existing settings tests updated for rev/new body (saveSettings helper adds the current rev).
Cross reference: none needed.

## Unfinished / unverified
- Everything uncompiled. The managedEnv-based tests need the handlers agent's wiring (items 1-3, 5) before they can pass.
- No race-style test of the lock re-check (needs a demotion while a save waits); settingsCaller is unit tested instead.
- docs: config.yaml reference for audit.onFailure, settings rev, new codes are the docs agent's.
