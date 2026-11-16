# I-crosscheck: the Go change read as a compiler and a reviewer

Nothing was compiled or run. Method: read writer.go, fileutil.go, storecrypt.go, store.go, managed.go, settings.go, backup.go,
backup_api.go, the diffs of pages.go, sockets.go, main.go, audit.go, configfile.go, managed_routing.go, and sampled the test files.
Mechanical scans (python, read-only) over every .go file for: unused/missing imports, import order, duplicate top-level names and
methods, calls to unexported functions/methods with no definition, comment alignment, trailing whitespace, non-ASCII added lines.

## Fixed
- settings_test.go: `withRev(t, body, rev string)` clashed with managed_test.go `withRev(body string, rev int)` (duplicate in package main).
  Renamed the settings one to `withSettingsRev` (definition + 3 uses). Only duplicate declaration found.
- contract_test.go (newContractEnv): marshalled `usersDoc{Users: users}` / `connsDoc{Connections: ...}` (seq 0, rev 0), which the new load check
  refuses. Now `seedUsersDoc(users)` / `seedConnsDoc(st.Connections)` (store_test.go helpers, seq 1, rev 1).
- fileutil.go: comment of writeFileAtomic named callers that do not exist (TLS, key, backup file, config seed). Fixed the text; it has no production
  caller now (only fileutil_test.go). Left in place on purpose (removing it means removing 4 tests).

## Checked and found consistent
1. Calls vs definitions: every changed signature (saveUser, deleteUser, saveConnection, deleteConnection, setPassword, stageImport, setSchedule,
   removeSchedule, stageDoc, writeDoc, newSettingsFile, seedConfigFile, newWriter, checkSettings, stageSettings, newBackupService, recoverDataDir)
   matches at every call site I grepped, including tests. No reference remains to fileTx, stagedFile, priorFile, upsertUser, upsertConnection,
   replaceStores, afterWrite, sf.sum, sf.commit, configSource.sum.
2. Imports: no unused, none missing, all groups sorted. slog calls have even key/value pairs (vet slog check). No lock-bearing struct is copied
   (writer, store, checksums, auditor, settingsFile, backupService are used by pointer).
3. gofmt (by reading): struct field and trailing-comment alignment, comment blocks breaking alignment, doc-comment lists and code blocks in
   canonical form. No trailing whitespace, no space indentation in code, no non-ASCII on any added line.
4. Test helpers: every helper the tests call exists once (putUser, putConn, currentUser, currentConn, seedUsersDoc, seedConnsDoc, withRev,
   holdWriter, waitForWaiters, raced, statusesOf, crashAfter, failAfter, panicAfter, renameFailing, readOr, fileLines, mustRead, logLine,
   signsIn, storedHash, decodeTo, withLoudAudit, ...). 503 Test functions, no duplicate names.

## Locks (all of package main) and their order
- writer slot W (chan, one slot) > publish lock `pub` (RWMutex) > store.mu (RWMutex), settingsFile.mu, backupService.mu, checksums.mu (leaf).
- Do: W is taken first (ctx-aware). Inside the op: store.mu RLock, sf.mu, b.mu are taken briefly, one at a time, never while waiting for W.
  publish: pub.Lock, then checksums.mu, then onPublish funcs (store.mu.Lock / sf.mu / live atomic / b.mu), release pub. afterCommit funcs run under W only
  (not pub): sockets.recheck (sr.mu -> store.mu RLock), sessions.create (sessions mutex), audit lines (auditor.mu, leaf), b.poke (non-blocking chan).
- Read side: snapshot = pub.RLock then store.mu RLock / sf.mu. No snapshot callback calls snapshot, snapshotAll, Do or anything that takes pub
  (checked: backup.snapshot, previewImport, getSettings, store.snapshotAll). The read path (GET lists, GET settings, status, /managed/me) never takes W.
- Nothing waits for W while holding another lock: handlers hash, derive keys and decode before Do. submitPassword holds a throttle turn while
  waiting for W, but no W holder needs that turn.
- afterCommit hooks cannot re-enter W: they call sockets, sessions, audit, poke, seqs() (store.mu RLock; pub already released), tx.rev (checksums.mu).
- Auditor: `gate` reads an atomic and the live settings only; record() takes auditor.mu and never W.
- Pre-existing, not changed by this work: store.ifUnchanged holds store.mu RLock while sessions.create may call onDrop -> sr.mu, and
  socketRegistry.closeWhere holds sr.mu while `allowed` takes store.mu RLock. With a writer pending on store.mu (publish) that is the classic
  RWMutex cycle. It needs a sign-in replacing a session at the same moment as a commit and a recheck; I did not touch it.

## Write-path rule (4.5)
Every write of users.yaml, connections.yaml, backup.yaml and config.yaml in non-test code goes through writer.Do (store.go save/delete/setPassword/stageImport,
backup.go setSchedule/removeSchedule, settings.go saveSettings and backup_api.go importBackup via stageSettings) with two documented exceptions that
run before any writer exists: (a) store.go bootstrapUsers -> sealer.writeDoc (one-file journaled commit, first start on a fresh volume),
(b) configfile.go seedConfigFile (one-shot nil-key writer.Do, journaled). Backup files, TLS files and the store key are outside the writer by design.

## Pinned contract (section 11) vs code
Statuses, codes, bodies, the check order (decode/422 -> rev_required -> gate 503 -> caller -> disk -> exists/not_found -> stale -> cross-record -> commit 500),
the rev rule (sameUserView/sameConnView, create and import stamp the new seq), 200 {"rev"} on PUT user/connection/schedule, 204 on DELETE, settings rev
base64 raw URL and "rev" required non-empty, preview basis and import basis (non-skipped sections only, 409 stale with `basis`), `wrote` position and
omission of seq for config.yaml, audit.onFailure continue/refuse, "AUDIT RECORD LOST" attributes: all match section 11. No code change was needed.

## Wiring
main.go: recovery (dir = dataDir or dir of config file) -> resolveConfig -> configSource{path, data}. managed_routing.go: loadStore builds the one
writer and the checksums from the store key; schedule remembered; newSettingsFile remembers config bytes; setAuditor sets `wr.gate = a.gate`;
exit = os.Exit. Test environments: newManagedEnvFrom, settingsRig, backup rig use st.wr / newWriter with the same checksums. Journal covers ONE directory:
config.yaml, users.yaml, connections.yaml and backup.yaml must share a directory (production: /data; every test env I read does).

## Could not decide
- Whether the real gateway's exports should carry `rev` (userRec/connRec yaml has `rev`, no omitempty): F noted the fake's strict reader refuses it, so a
  file exported by the real gateway does not open in the fake demo. Either the fake ignores `rev`, or backupService.snapshot strips it and the tags get
  omitempty. Not changed.
- Deleting writeFileAtomic (dead in production) or keeping it.
- Whether handlers should drop a user's sessions inside the writer lock (spec 4.2 step 9) instead of right after Do returns (as built, covered by
  store.ifUnchanged for sign-ins).

## Three places most likely to fail the first `go vet` / `go test -race`
1. Contract goldens: go-web-proxy/testdata/contract/cases.json (75 of 157 steps are PUT/DELETE/preview/import) still has the old bodies (no rev, no ?rev=,
   no basis) and old answers (204 on PUT, no rev in lists). TestContract_Cases will fail until the requests are edited and `go test -run Contract -update .`
   rewrites the answers (settings and schedule revs, and the basis settings value, must be normalised like nextRun). The TS contract tests read the same file.
2. The big new test tables and generics: store_test.go (sectionImport[userRec] literals, long tables), managed_test.go (decodeTo[struct{ Connections []connListJSON }],
   revCase and the anonymous table in TestManagedAPI_CallerIsCheckedAgainInsideTheLock for gofmt alignment), backup_test.go/backup_api_test.go (ImportBasis table).
   Also waitForWaiters relies on the frame text "main.(*writer).Do(" in runtime.Stack, and the race tests assume the journal renames in staging order
   (users, connections, config) for renameFailing(2).
3. -race and ordering in tests that read a.f / a.mu of the auditor directly (settings_test.go, managed_test.go audit refuse tests) and the
   TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed loop (50us sleep, 4 goroutines, 20 sealed commits with fsync: slow but not wrong).

## Edits to files that are not mine
None except the three fixes above (settings_test.go, contract_test.go, fileutil.go comment), all in Go files under go-web-proxy/.

## NEEDED FROM OTHERS
- Whoever owns the contract goldens: edit testdata/contract/cases.json requests (rev in PUT bodies, ?rev= on DELETE, basis on import, rev on settings/schedule PUT,
  new refusal cases), then regenerate answers with `go test -run Contract -update .` run by the owner, and normalise rev/basis settings checksums in contractNormalize
  (contract_test.go has no rule for them yet).
- Docs agent: txn, <target>.bak and .tmp-* reserved names in the data dir (operators must not keep their own copies under them), recovery at start,
  store_write_failed / store_changed_on_disk / audit_unavailable, audit.onFailure, seq and rev in the stored format, import basis.
