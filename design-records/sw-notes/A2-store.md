# A2-store note: seq and rev in the users and connections stores

Files: go-web-proxy/store.go (edited), go-web-proxy/store_test.go (edited). Nothing compiled or run; ASCII only, hand-formatted for gofmt.
No file that is not mine was edited.

## Stored format
    type usersDoc struct { Seq int `yaml:"seq"`; Users []userRec }        // userRec gained Rev int `yaml:"rev"` (after Username)
    type connsDoc struct { Seq int `yaml:"seq"`; Connections []connRec }  // connRec gained Rev int `yaml:"rev"` (after Broker)
Load (loadStore): validateUsers/validateConns first, THEN validateUserRevs/validateConnRevs(records, seq): every rev 1..seq, seq >= 0, else
the load fails ("users file <path>: user "x" has rev 0 and the file's seq is 3: ... restore the file from a backup"). A connections file with
no records at seq 0 is fine. Bootstrap writes seq 1 / rev 1 (sealer.writeDoc, the journal path). Missing connections file still allowed (seq 0).
Because userRec/connRec carry rev in YAML, a backup built from listUsers/listConnections contains revs; the backup's strict reader accepts the key
and an import ignores it.

## What loadStore now builds (others rely on it)
    s.wr   *writer     // THE writer of the data directory: newWriter(filepath.Dir(usersPath), sums, logger). Share it with settings and the backup schedule.
    s.sums *checksums  // newChecksums(store key). loadStore already called sums.rememberDisk for users.yaml and connections.yaml (absent is remembered as absent).
                       // STILL TO DO by the owners of config.yaml / backup.yaml: s.sums.rememberDisk(configPath), s.sums.rememberDisk(schedulePath).
    s.usersSeq, s.connsSeq int (guarded by s.mu)
Caller must still set before serving: s.wr.gate (audit refuse) and, if wanted, s.wr.exit. s.onChange as before (sockets.recheck).
Journal covers ONE directory: users.yaml and connections.yaml (and config.yaml, backup.yaml) must be in filepath.Dir(usersFile). A connections file configured
in another directory makes every connection write fail with store_write_failed (A1 deviation, surfaced here).

## New signatures (all methods on *store, package main)
    type savedUser struct { rev, seq int; dropSessions bool }
    type savedConn struct { rev, seq int }

    func (s *store) saveUser(ctx context.Context, caller string, u userRec, password string, rev int) (savedUser, error)
    func (s *store) deleteUser(ctx context.Context, caller, username string, rev int) (seq int, err error)
    func (s *store) saveConnection(ctx context.Context, caller string, c connRec, rev int) (savedConn, error)
    func (s *store) deleteConnection(ctx context.Context, caller, broker string, rev int) (seq int, err error)
    func (s *store) setPassword(ctx context.Context, username, password, expect string, committed func()) error   // SAME signature as before
    func (s *store) stageImport(tx *txn, users *sectionImport[userRec], conns *sectionImport[connRec]) (importStaged, error)
    func (s *store) seqs() (users, conns int)
    func (s *store) snapshotAll() (users []userRec, conns []connRec, usersSeq, connsSeq int)

    type sectionImport[T any] struct { recs []T; merge bool }   // nil pointer = skip the section; merge=false = replace the whole list
    type importStaged struct { usersSeq, connsSeq int; drop []string }  // new seq per staged file (0 = skipped); drop = users whose sessions must end

Usage of the whole-record saves (handler, after decoding, validation that needs no store state, and rev_required for a missing rev):
    caller := sessionOf(r).user                       // re-checked INSIDE the lock; "" skips the re-check
    got, err := h.store.saveUser(r.Context(), caller, rec, body.Password, *body.Rev)   // rev 0 = create
    // success: writeJSON(w, 200, {"rev": got.rev}); audit wrote {"users.yaml", got.seq}; if got.dropSessions { h.sessions.dropUser(name) }
    // rec.Rev is ignored (overwritten). rec.MustChangePassword is taken as given ONLY when password != "" (the console form sends false); with a blank
    // password the stored flag and hash are kept.
Delete: seq, err := h.store.deleteUser(ctx, caller, name, rev)  (rev must be >= 1, else errRevRequired); the handler drops the user's sessions on success.
Passwords are hashed BEFORE the lock inside saveUser/setPassword (ctx-aware, like before). saveConnection never hashes; the caller runs validateConn first.

### Errors each returns (typed, for writeStoreError / handler mapping)
- errCallerGone (401 unauthenticated), errCallerNotAdmin (403 forbidden): NEW, from the in-lock caller re-check (saveUser, deleteUser, saveConnection, deleteConnection). Not in classifyStoreError: the handler maps them.
- *changedOnDiskError (409 store_changed_on_disk), errExists (409), errNotFound (404), newStale(currentRev) (409, *staleError.rev = current rev int), in that order.
- then, saveUser only: errBlankNewUserPassword (422 password) for a create without a password, errLastAdmin (409) for demoting the only admin; deleteUser: errLastAdmin.
- errRevRequired (400): rev < 0 in a save, rev <= 0 in a delete (returned before the lock; the handler normally catches it earlier).
- *writeFailedError (500 store_write_failed) for a failed and rolled-back commit; *clientGoneError (499); errAuditUnavailable (503) from w.gate; hash errors (context.Canceled etc.) unchanged.
- setPassword: errUserNotFound, errAccountChanged (existing outcomes), *changedOnDiskError, *writeFailedError.
- stageImport: errLastAdmin (users list ends with no admin), *importInvalidError{section "users"|"connections"} (Error() = "The backup's users cannot be imported: <load rule>"; handler: 422 invalid field "file"
  with err.Error()), *changedOnDiskError. Backup agent: the old handler's own validateUsers/validateConns/countAdmins block can be deleted; stageImport does it on the CURRENT lists inside the lock.
- Order inside the lock: gate (writer) -> caller -> disk -> existence -> rev -> blank password / last admin -> stage. A refusal leaves seq, files, memory, sockets untouched.

### After-commit behaviour
tx.afterCommit(s.changed) -> s.onChange() runs under the writer lock, after publish, for saveUser, deleteUser, saveConnection, deleteConnection, stageImport (NOT setPassword, as before).
setPassword runs `committed` via tx.afterCommit (writer lock held, memory already published). The audit line is the handler's: use the returned seq (savedUser.seq, savedConn.seq, delete's seq, importStaged.usersSeq/connsSeq)
for "wrote". Nothing in the store writes audit lines. If you want the audit line inside the writer lock, that needs a hook param; not built.

### Rev rule (11.2)
seq of the file +1 on every commit. rec.Rev = new seq for a create, an import, and when sameUserView/sameConnView (hand-written, test pinned against userToOutput/connToOutput) says the GET view changed; otherwise it keeps the old rev.
User view = username, admin, mustChangePassword, operate, readOnly (nil == empty), modules (nil != empty). Connection view = everything listed (blank scheme == TLS), no passwords.
Own password: rev moves only when mustChangePassword goes true -> false.

### Import and backup
    // inside the backup's single writer.Do:
    err := h.store.wr.Do(ctx, func(tx *txn) error {
        if err := tx.check(configPath ...); ...               // its own
        usersSeq, connsSeq := h.store.seqs()                  // compare with the sent basis (users/connections) -> newStaleBasis(...)
        res, err := h.store.stageImport(tx, usersSection, connsSection)   // nil section = skipped; it does tx.check on the files it writes
        ... stage settings, tx.onPublish(apply settings) ...
        tx.afterCommit(...); return nil
    })
    res.drop -> h.sessions.dropUser each; SignedOut = slices.Contains(res.drop, sessionOf(r).user)
Backup/export/scheduled run: either h.store.snapshotAll() (takes the publish read lock itself), or, when settings are read too, call listUsers(), listConnections(), seqs() INSIDE s.wr.snapshot(func(){...})
(the publish lock is not re-entrant: do not call snapshotAll inside w.snapshot).
stageImport DEPENDS on backup.go helpers that must stay: mergeByName, userName, connName, sessionEnders. Also on sameModules (managed.go).

## Removed or renamed
- upsertUser(ctx, u, password) (dropSessions bool, err) -> saveUser(...) above
- upsertConnection(c) error -> saveConnection(...)
- deleteUser(username) (found, err) -> deleteUser(ctx, caller, username, rev) (seq, err); "not found" is now errNotFound, not found=false
- deleteConnection(broker) (found, err) -> deleteConnection(ctx, caller, broker, rev) (seq, err)
- replaceStores(tx *fileTx, users, conns) -> stageImport(tx *txn, ...) inside the caller's writer.Do (it no longer commits, locks, or swaps by itself)
- afterWrite(err *error): removed (onChange now fires from tx.afterCommit)
- setPassword: same signature; no longer holds s.mu while calling committed.
- store.mu is now taken only for reads and for the swap (publish), under the writer's publish lock (lock order pub -> s.mu).
Call sites to migrate (not mine): managed.go (saveUser :532, deleteUser :601, saveConnection :640, deleteConnection :700, listUsers/listConnections output gets rev), backup_api.go (listUsers/listConnections :258, :332, :349, replaceStores :380),
backup.go :588 (use snapshotAll or w.snapshot), managed_routing.go (share st.wr with settings and backup; set st.wr.gate; rememberDisk for config.yaml and backup.yaml via st.sums),
pages.go setPassword (unchanged call), tests: dial_test.go:38, relay_test.go:65,318,324,366, smf_test.go:113,370 (use putConn/putUser below), managed_test.go, backup_api_test.go.

## Test helpers other test files may use (store_test.go, package main)
    putUser(t, s, u, password) savedUser     // unconditional fixture edit at the current rev, fatal on refusal (replaces upsertUser in fixtures)
    putConn(t, s, c) savedConn               // same for connections (replaces upsertConnection)
    currentUser(t, s, name) userRec, currentConn(t, s, broker) connRec
    seedUsersDoc(users []userRec) usersDoc, seedConnsDoc(conns []connRec) connsDoc   // seq 1, every rev 1: contract_test.go newContractEnv must marshal these instead of usersDoc{Users: ...}
                                              // or its store files fail the new load check (rev 0). The fake seeds the same way (users seq 1, rev 1 each).
    (f storeFixture) readDocs(t) (usersDoc, connsDoc)
Fixtures: usersYAMLTemplate and connsYAML now carry seq: 2, first record rev 1, second rev 2. Any other test that writes a store file by hand needs seq and rev (backup_test.go:118 and managed_routing_test.go:99 write
no loadable store, so they are unaffected as far as I can tell).
Existing assertions that compare imported records to a backup (backup_api_test.go:244 diffByName on listUsers vs doc.Users) now see Rev differences: diffByName/equality in backup code must ignore Rev.

## Tests (store_test.go, all new or rewritten, mirror store.go)
create stamps rev = seq (users, connections, missing connections file); update; delete moves seq and no record holds it; re-create never reuses a rev; every refusal (table, with unchanged seq/file/onChange);
password-only keeps rev; forced-change flip moves rev (own password and admin reset); blank password keeps a hash set meanwhile; own password refused after an admin reset; caller re-check; stale beats last-admin; exists beats blank password;
hash failure and client-gone leave nothing; failed write (blocked path) leaves memory/seq/sockets; onChange once per commit, sees published state; load check (rev 0, absent, above seq, negative, seq negative/absent, for both files; rev == seq and seq 0 ok);
sealed file replaced -> every later write refused until restart (even after restoring the bytes), wins over stale, other file unaffected; stageImport replace/merge/skip stamping, ignoring backup revs, refusals change nothing, all-or-nothing via renameFailing(2);
sameUserView/sameConnView parity with userToOutput/connToOutput; races (-race): two saves of one record, different records, two creates of one name, delete vs save, import vs save, readers never see half an import (snapshotAll), CRUD smoke.
Not at store level (handler agents): the HTTP codes, rev_required for a missing JSON rev, import basis compare.

## Deviations from the spec
- loadStore creates the writer and checksums (the key is only known there) and exposes them as s.wr / s.sums instead of taking a writer in storeOptions. storeOptions is unchanged.
- No audit/after-commit hook parameter: audit "wrote" values come from the return values (see above); the handler writes the line after Do returns.
- saveUser trusts u.MustChangePassword when a new password is given (as the old upsertUser did); it is never taken from a blank-password edit.
- stageImport takes sections as generics (*sectionImport[T]) and performs the merge itself on the current lists (the old handler merged before locking); mergeByName from backup.go is reused.
- No-op saves still commit and move seq (spec: every commit moves seq).

## Unfinished / unverified
- Not compiled or run. Likeliest compile risks: generic type use (*sectionImport[userRec]) in stageImport and tests; the helper name `together`/`runImport`/`currentUser` colliding with a name in another test file I did not grep exhaustively
  (checked currentUser, currentConn, stage, together); gofmt alignment of the long test tables and map literals.
- TOTP: nothing built (out of scope).
- Anything outside store*.go still calls the removed functions and will not compile until the handler agents migrate (listed above).
