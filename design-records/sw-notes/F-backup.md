# F-backup: the backup schedule and the import on the writer

Files (mine): go-web-proxy/backup.go, backup_test.go, backup_api.go, backup_api_test.go.
Nothing compiled or run. ASCII only, hand-formatted for gofmt (column alignment checked by script).

## Names others rely on (package main)

### backup.go
    type scheduleFile struct { Seq int; Schedule *backupSchedule; Keep, Iter int; Salt, Key string }  // backup.yaml as stored (yaml: seq, schedule, keep, iter, salt, key; all but seq omitempty)
    func fileOfSchedule(seq int, sd *scheduleDoc) scheduleFile      // nil sd = the "no schedule" file a delete leaves
    func (f scheduleFile) doc() *scheduleDoc ; (f scheduleFile) problem() string
    func (b *backupService) scheduleWithRev() (*scheduleDoc, int)    // schedule and rev under one lock; rev 0 when none
    func (b *backupService) setSchedule(ctx, caller string, s backupSchedule, keep int, passphrase string, rev int) (newRev int, err error)
    func (b *backupService) removeSchedule(ctx, caller string, rev int) (newSeq int, err error)
    backupService.seq (guarded by mu). schedule() unchanged.
    snapshot() now reads users, connections and settings inside store.wr.snapshot (one committed state): used by export, Back up now and the scheduled run.
    withoutRev(v any) any; sameRecord ignores Rev, so a backup of the gateway as it stands previews as "no change".
- caller: the requesting admin, re-checked inside the lock via store.checkCaller ("" skips). Errors: errRevRequired (rev<0 / delete rev<1), errNotFound, errExists,
  newStale(seq), *changedOnDiskError (file backup.yaml), errCallerGone / errCallerNotAdmin, *backupProblem (422), errAuditUnavailable, *writeFailedError, *clientGoneError.
- newBackupService now ALSO calls st.sums.rememberDisk(schedulePath) after reading the file (idempotent; managed_routing.go already does it before; harmless duplicate, keeps
  direct constructions in tests safe). It loads seq from the file: no file = seq 0; schedule present with seq < 1 or seq < 0, or a key with no schedule = refuses to start ("delete it and set the schedule again").
- On disk a delete writes backup.yaml = sealed `seq: N` and nothing else; the next create stamps N+1.

### backup_api.go
    type importBasis struct { Users, Connections int; Settings string }   // json users, connections, settings
    func (h *managedHandler) currentBasis() importBasis                  // h.store.seqs() + h.settings.rev(); read inside Do or wr.snapshot
    func (h *managedHandler) backupFailed(w, r, op string, err error)    // ONE mapping for schedule and import: writeStoreError, errCallerGone 401, errCallerNotAdmin 403, errLastAdmin 409, *importInvalidError 422 field "file", *backupProblem 422, else 500 server_error; logs a *writeFailedError ("backup change not written")
    backupScheduleJSON gains Rev; importPreviewJSON gains Basis; importJSON gains Basis *importBasis.
    Reuses managed.go's bodyRev (type) and queryRev(r) for the body rev and ?rev=.

## Behaviour (as built, per 11.1 and 11.4)
- GET /managed/backup: schedule.rev (= backup.yaml seq), absent schedule as today.
- PUT /managed/backup/schedule: decode (400 bad_request/413) -> 422 schedule / keep / passphrase outside the policy (checked BEFORE rev_required, as the fake does) -> 400 rev_required (missing, null, string, fraction, negative) ->
  key derivation (before the lock) -> writer.Do: 503 audit_unavailable, 401/403 caller, 409 store_changed_on_disk, 409 exists (rev 0, schedule present), 404 not_found (rev>0, none), 409 stale {"rev":current},
  422 passphrase ("A new schedule needs a passphrase.", after the rev checks, as the fake) -> commit (500 store_write_failed). Success 200 {"rev": N}. The file write and memory swap are one Do (onPublish); the loop is poked afterCommit.
- DELETE ?rev=N: queryRev (missing/0/junk = 400 rev_required) -> same in-lock order (no schedule = 404, moved = stale with current rev) -> 204. backup.yaml stays with the counter.
- POST preview: answer carries "basis" {users, connections, settings}, read with the lists and the settings diff inside store.wr.snapshot.
- POST import: choices 422 -> openSource (decrypt BEFORE the lock; 422 file/passphrase) -> 400 rev_required (basis missing/null; wrong shape = 400 bad_request) -> ONE writer.Do:
  settingsCaller (401/403) -> tx.check on every file of a non-skipped section (disk check wins over stale) -> basis compare of non-skipped sections only (409 stale {"basis": current}) ->
  store.stageImport (users + connections: merge/replace on the CURRENT lists, last_admin, load rules, restamp every record) -> stageSettings (checkSettings refusals) -> commit of up to three files together.
  After the commit: sessions.dropUser for every user in staged.drop, SignedOut as before. Audit: call.wrote = users.yaml {seq}, connections.yaml {seq}, config.yaml (no seq), only for imported sections; call.changed as before.
  Order matches the fake: choices 422 -> file 422 -> basis 400.

## Deviations
- setSchedule/removeSchedule take a `caller` string and return the new rev/seq (spec did not fix signatures); needed for the in-lock caller re-check and the audit "wrote".
- sameRecord/diffByName now ignore Rev (A2's note asked for it): without it every user previews as changed.
- The scheduled-run, export and Back up now take their snapshot inside writer.snapshot only for the READ of users, connections and settings; saved files stay outside the writer, as specified.
- Exports still carry the stamped rev of each record (userRec/connRec yaml has `rev`); an import ignores it. The fake's strict backup reader refuses a `rev` key (C-fake note), so a file exported by the REAL gateway
  will not open in the fake demo. If that cross-import matters, either strip Rev in backupService.snapshot (it would still write `rev: 0` unless store.go's tags get omitempty) or let the fake ignore `rev`. Not decided here.
- Tests: the old "server_error" expectations for failed schedule and import writes are now store_write_failed.

## Edits to files that are not mine
None.

## NEEDED FROM OTHERS
- D-handlers: `auditCall.wrote` and `auditEntry.Wrote` copy in recordAdmin are already in managed.go (seen); nothing else needed. managed_test.go newManagedEnvFrom must use the data from seedConfigFile and the
  writer-sharing buildManagedRoutes (it is being done); my tests use e.api.store.wr, e.api.currentBasis(), e.withLoudAudit, e.setAudit, e.saveSettings, mustRead, renameFailing, putUser/putConn/currentUser/currentConn.
- The settings basis uses h.settings.rev(): h.settings.wr MUST be the same writer as h.store.wr (buildManagedRoutes does that today).
- Contract agent: GET /managed/backup schedule.rev; PUT schedule 200 {"rev"}; DELETE needs ?rev=; preview basis; import needs basis; new refusals as listed above. The real settings basis value is a checksum: normalise it like the settings rev.
- Docs agent: user-guide/provisioned-mode (previewing again after a stale import, schedule refusals), architecture (backup.yaml seq, snapshot read side), test-report (new tests in backup_test.go and backup_api_test.go).

## Tests
backup_test.go: scheduleFile problem/format cases (TestBackupService_LoadRefusesADamagedSchedule), rev = seq and delete keeps the counter across a restart
(TestBackupService_RevIsTheSeqAndADeleteKeepsTheCounter), every service refusal incl. hand edit sticky (TestBackupService_ScheduleRefusals), failed write changes nothing
(TestBackupService_FailedWriteChangesNothing), two saves leave disk and memory equal for create and edit (TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual), snapshot never half an import
(TestBackupService_SnapshotNeverSeesHalfAnImport), diff ignores rev (TestBackup_DiffIgnoresRev). backup_api_test.go: schedule happy path and every HTTP refusal (TestBackupAPI_Schedule, _ScheduleRefusals,
_ScheduleRefusedWhileTheAuditLogIsDown, write/remove failures, backupFailed table), preview basis, import refusals incl. rev_required/bad shape, restamping (ReplaceAll, RestampsOnlyTheImportedSections),
matching/moved basis per section and a password change (TestBackupAPI_ImportBasis), skipped section not compared, disk check before basis, store_write_failed per file, second-of-three rename failure rolls all back
(TestBackupAPI_ImportIsAllOrNothing), import racing a user save in both orders plus at once (TestBackupAPI_ImportRacingAUserSave), audit lines with wrote and the new codes (TestBackupAPI_ActionsAreAudited).

## Unfinished / unverified
- Uncompiled and unrun. Likeliest first-compile issues: names from other agents (managedEnv helpers, auditSettings.onFailure, a.f / a.mu on the auditor, e.f.load, journalHooks.rename), generic sectionImport literals,
  gofmt alignment of the long audit-test literal and the ImportBasis case table.
- Likeliest first-run failures: ordering assumptions about the journal (renames in staging order users, connections, config; renameFailing(2) hits connections); the audit expectations (msg text and Wrote order) if D changed the wrapper;
  the audit.onFailure refuse test relies on the same auditor internals as settings_test.go.
- Uncovered by design (Go total only): stageDoc's marshal error branches in setSchedule/removeSchedule, newBackupService's rememberDisk error branch.
