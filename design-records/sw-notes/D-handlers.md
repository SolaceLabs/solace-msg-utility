# D-handlers: users and connections API, own password, wiring, sockets

Nothing compiled or run. ASCII only, hand-formatted for gofmt.

## Wiring (managed_routing.go buildManagedRoutes / setAuditor) -- for F and everyone
- ONE writer = st.wr, built by loadStore (key known there). sf := newSettingsFile(src, cfg, lv, st.wr, ...) shares it. newBackupService signature is UNCHANGED:
  newBackupService(dir, schedulePath, st, sf, h, now, logger); take the writer from st.wr (or sf.wr). Do not build another.
- buildManagedRoutes calls st.sums.rememberDisk(schedulePath) BEFORE newSettingsFile/newBackupService (backup.yaml absent is remembered as absent). F must not repeat it.
  rememberDisk failure stops the start (error names the path).
- setAuditor(a) now also sets h.store.wr.gate = a.gate (nil-safe method value). exit hook = os.Exit default.
- st.onChange = sockets.recheck as before (after-commit, level-triggered, safe twice).
- main.go needed no edit: start order is recovery (serve) -> resolveConfig -> newManagedRouting -> buildManagedRoutes -> loadStore (store key, checksum key, users, conns) -> remember schedule -> settings (remembers config bytes) -> backup.

## managed.go (names)
- auditCall gained `wrote []auditWrote`; recordAdmin copies it into the ok entry (e.Wrote). Backup handlers: call.wrote = []auditWrote{{File: "backup.yaml", Seq: int64(seq)}}.
- recordAdmin writes NO entry when the response status is statusClientGone (499).
- (h *managedHandler) storeFailed(w, r, op string, err error): one error mapping for transactions: writeStoreError first (logs "admin request failed" op/target/err for a *writeFailedError), then errCallerGone 401 unauthenticated, errCallerNotAdmin 403 forbidden, errBlankNewUserPassword 422 password, errLastAdmin 409 last_admin, else serverError. F may reuse it.
- type bodyRev struct{n int; ok bool} with UnmarshalJSON: ok only for a JSON whole number >= 0 (null, string, fraction, negative = not ok = 400 rev_required). Used as `Rev bodyRev `json:"rev"`` in userSaveJSON and connSaveJSON (not a pointer; same effect, plus non-whole numbers are rev_required as the fake does).
- func queryRev(r *http.Request) (rev int, ok bool): ?rev=N, whole number >= 1.
- userListJSON{userJSON; Rev int}, connListJSON{connJSON; Rev int}: list rows. userToOutput/connToOutput are unchanged (no rev), so store_test.go parity of sameUserView/sameConnView holds.
- PUT users/connections: 200 {"rev": N}; DELETE: 204. Order: decode (400/413) -> 422 body-only checks (username, password policy, modules / validateConn) -> 400 rev_required -> store (gate, caller, disk, existence, rev, cross-record, commit). This matches the fake (422 before rev_required).
- Audit action of a save follows rev (rev 0 = create), set after the body is read; a refusal before that keeps the pre-handler guess (exists/not).
- Ok entries carry wrote {users.yaml|<connections file base name>, seq}.

## pages.go (own password)
- submitPassword: setPassword unchanged; new outcomes mapped: *clientGoneError (nothing written, no audit), errAuditUnavailable (503 page, audit code audit_unavailable), *changedOnDiskError (409 page, store_changed_on_disk), *writeFailedError (500, store_write_failed), others server_error. Ok line carries wrote {users.yaml, seq} (seq read via store.seqs() inside the afterCommit callback, lock held).

## sockets.go
- Behaviour unchanged (recheck was already level-triggered; smf.go registers before the access check). Comment expanded. Tests: sockets_test.go TestSockets_AfterCommitHookIsLevelTriggered, TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed.

## Test helpers (managed_test.go) others may use
withRev(body, rev); (e) userRev/connRev(name); (e) putUserAs/putConnAs(c, name, body) (current rev, 0 for new); (e) delUserAs/delConnAs(c, name);
usersWrote(seq)/connsWrote(seq) ("users.yaml" / "conns.yaml"); holdWriter(t, w) release func; waitForWaiters(t, n); raced(t, reqs...); statusesOf.
newManagedEnvFrom now seeds config with `data, err := seedConfigFile(...)` and configSource{path, data}. Existing helpers kept (newManagedEnv, newManagedEnvWith, newManagedEnvFrom, do, cookie, expect, errorCode, withAudit...).

## Edits to files that are not mine
- dial_test.go, relay_test.go (removed `context` import), smf_test.go: fixtures moved from upsertConnection/upsertUser to putConn/putUser (store_test.go helpers) because the old methods are gone. smf_test.go also PUT/DELETE through putUserAs etc.

## Deviations
- Two admins demoting EACH OTHER: the loser is refused 403 forbidden (caller re-check) or 401 (its session was dropped by the winner's commit before the request started), not last_admin. last_admin is the outcome when two admins demote THEMSELVES; both are tested (TestManagedAPI_TwoAdminsDemotingEachOther / ...Themselves).
- rev is a custom type, not *int (see above).
- Caller-recheck tests use holdWriter + a goroutine-dump wait (waitForWaiters) to know a request is parked at the lock, and swap memory behind the held lock; deterministic outcome, no sleeps.
- The audit "wrote" for the own-password line uses store.seqs() inside the commit's afterCommit.

## NEEDED FROM OTHERS
- contract agent (unassigned as far as I know): contract_test.go newContractEnv must marshal seedUsersDoc/seedConnsDoc (seq 1, rev 1) instead of usersDoc{Users: ...} or its store files fail the load check; testdata/contract/*.json goldens (rev in lists, 200 {"rev"} on PUT, ?rev= on DELETE, new codes) -- see C-fake's list. I did not touch them.
- F-backup: backup_test.go:485-496 still uses seedConfigFile's old return and newSettingsFile(src, cfg, lv, logger); needs `data`, configSource{path, data} and the writer (st.wr). backup_api.go still uses fileTx/replaceStores/old settings internals.

## Unfinished / unverified
- Not compiled. Likeliest compile risks: generic call decodeTo[struct{ Connections []connListJSON }] in managed_test.go; gofmt alignment of the revCase struct and the anonymous table struct in TestManagedAPI_CallerIsCheckedAgainInsideTheLock; waitForWaiters relies on the frame name "main.(*writer).Do(" in runtime.Stack output.
- TestManagedAPI_* race tests (two saves, creates, delete vs save, demotions, own password) are meant for -race; import-vs-user-save races belong to F's backup tests.
- Go total coverage not measured; new branches (storeFailed cases, queryRev/bodyRev, client gone) each have a test; errCallerGone/NotAdmin on delete/save of connections covered by the caller table.
