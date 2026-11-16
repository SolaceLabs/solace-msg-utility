# A1-core note: journaled commit, writer, checksums, shared errors

Files: go-web-proxy/fileutil.go (rewritten), fileutil_test.go (rewritten), writer.go + writer_test.go (new),
storecrypt.go + storecrypt_test.go (additions, and stageDoc/writeDoc changed), managed.go (apiError only),
main.go (recovery call in serve()), main_test.go (2 tests added).
Nothing was compiled or run. Everything is plain ASCII, hand-formatted for gofmt.

## API (all package main, lower case)

### Writer (writer.go)
    func newWriter(dir string, sums *checksums, logger *slog.Logger) *writer
        dir = the data directory (where txn lives). EVERY staged path must be directly in dir (else commit fails).
        sums may be nil (then: no disk check, no rev). logger may be nil.
    func (w *writer) Do(ctx context.Context, op func(tx *txn) error) error
    func (w *writer) rev(path string) string          // settings rev of a file ("" without a store key)
    func (w *writer) snapshot(fn func())              // holds w.pub.RLock: backups read users+connections+settings in here
    fields set by assignment after newWriter:
        w.gate func() error     // nil = none. Return errAuditUnavailable to refuse (503). Runs after lock+ctx check, before op.
        w.exit func(code int)   // os.Exit by default; tests replace it
        w.pub  sync.RWMutex     // publish lock (11.7). Lock order: pub BEFORE any store's own lock, never after.
        w.hooks journalHooks    // test seams (crash/fail after a step, failing rename). Zero in production.

    txn methods (valid only inside op):
    func (tx *txn) check(paths ...string) error               // disk check; *changedOnDiskError, sticky per file
    func (tx *txn) stage(path string, data []byte, perm fs.FileMode, verify func(data []byte) error)   // no error return; same path twice = last wins
    func (tx *txn) onPublish(fn func())                       // after commit point, inside ONE critical section (pub write lock) with the new checksums remembered first
    func (tx *txn) afterCommit(fn func())                     // after publish, lock still held (audit line, sockets, sign-outs), in queue order
    func (tx *txn) rev(path string) string                    // current remembered rev (inside onPublish it is already the NEW rev)
    func (tx *txn) context() context.Context
    func (tx *txn) paths() []string

Do semantics: wait for slot or ctx (-> *clientGoneError); check ctx once; gate; op; if files staged: re-run the disk check on every
staged path (so a forgotten tx.check still cannot overwrite a hand edit), commit via journal, publish, afterCommit funcs.
op error -> returned as is, nothing written, no publish, no afterCommit. op that stages nothing: no commit, but publish and afterCommit
funcs still run. Commit failure -> *writeFailedError (rolled back). Failed rollback -> exit(1) + *writeFailedError.
Panic in op or before the commit point: rolled back and re-panicked (recover middleware answers 500). Panic after the commit point
(journal cleanup, onPublish, afterCommit): logged, exit(1), Do returns an error. Client leaving after op returned never stops the commit.

### Sealed docs (storecrypt.go)
    func (s *sealer) stageDoc(tx *txn, role storeRole, path string, v any) error   // seals, 0600, wires the round-trip verify (open + strict decode into v's type)
    func (s *sealer) sealDoc(role storeRole, v any) ([]byte, error)
    func (s *sealer) docVerifier(role storeRole, v any) func([]byte) error
    func (s *sealer) writeDoc(role storeRole, path string, v any) error   // KEPT for first write on a fresh volume (before the writer exists) and test fixtures: one-file journaled commit, NO lock. Production changes use writer.Do.
    (readDoc, seal, open, newSealer unchanged)

### Checksums (storecrypt.go)
    func newChecksums(storeKey []byte) (*checksums, error)  // nil/empty key = switched off; other length than 32 = error. HKDF-SHA256(key, nil salt, "smu store checksum v1"), HMAC-SHA256
    (c) enabled() bool; sumOf(data) []byte; remember(path, data); rememberAbsent(path); rememberDisk(path) error; check(path) error; rev(path) string
    func checksumRev(sum []byte) string   // base64 raw URL
    LOADERS MUST CALL: sums.rememberDisk(path) (or remember(path, bytesJustRead)) for config.yaml, users.yaml, connections.yaml, backup.yaml
    once the store key is known. backup.yaml absent is fine (remembered absent; a file appearing = changed on disk). A path never remembered is not checked.

### Shared errors (writer.go)  -- ONE mapping for every handler
    errExists (409 exists) | errRevRequired (400 rev_required) | errNotFound (404 not_found) | errAuditUnavailable (503 audit_unavailable)
    newStale(rev any) error          -> 409 {"error":"stale","rev":<rev>}   (rev number, or string for settings; rev 0 is kept in the body)
    newStaleBasis(basis any) error   -> 409 {"error":"stale","basis":<basis>}
    *changedOnDiskError{file}        -> 409 config_changed_on_disk if file == "config.yaml", else store_changed_on_disk (returned by tx.check)
    *writeFailedError{err}           -> 500 store_write_failed (cause never in the body; Unwrap works)
    *clientGoneError{err}            -> 499 client_gone (statusClientGone). Nobody reads it; skip auditing it.
    func classifyStoreError(err error) (status int, body apiError, ok bool)
    func writeStoreError(w http.ResponseWriter, err error) (code string, handled bool)
        code == the audit code (same string as the body's "error"). When handled is false nothing was written; keep the handler's own
        mapping for 422 invalid, 409 last_admin, 409 would_lock_out, 403, 401, 500 server_error.
    apiError (managed.go) gained: Rev any `json:"rev,omitempty"`, Basis any `json:"basis,omitempty"` (after Reason).
    Wrap freely: fmt.Errorf("...: %w", errExists) is still recognised (errors.Is / errors.As).

### Recovery (fileutil.go, called from main.go serve())
    func recoverDataDir(dir string, logger *slog.Logger) error
    serve() calls it before resolveConfig, with dir = p.dataDir, or filepath.Dir(p.configFile) when dataDir is "". Failure stops the start
    ("data directory recovery failed"). Sweeps `.tmp-*` and `<name>.bak` ONLY for config.yaml, users.yaml, connections.yaml, backup.yaml.

### On disk
    txn (JSON, base names only, written temp+rename), <target>.bak (always whole: temp+rename), temps `.tmp-*`. A stale <target>.bak is
    deleted before a commit starts (so it can never be put back over a target). The journal covers ONE directory.

## Worked examples

(a) one-file save (the user PUT), after decoding and the slow work:

    err := h.wr.Do(r.Context(), func(tx *txn) error {
        // re-check the caller against the current snapshot (403/401) here, then:
        if err := tx.check(h.usersPath); err != nil { // 409 *_changed_on_disk
            return err
        }
        cur, ok := h.store.find(name)                  // current snapshot, read-only
        switch {
        case rev == 0 && ok:
            return errExists
        case rev > 0 && !ok:
            return errNotFound
        case rev > 0 && cur.Rev != rev:
            return newStale(cur.Rev)
        }
        next, doc := plan(cur, body)                    // on COPIES; seq+1, rev stamped per 11.2; may return last_admin etc.
        if err := h.seal.stageDoc(tx, roleUsers, h.usersPath, doc); err != nil {
            return err
        }
        tx.onPublish(func() { h.store.swap(next) })     // swap memory; takes the store's own lock inside
        tx.afterCommit(func() { h.audit.record(entryOK) /* wrote: users.yaml seq */; h.sockets.closeNoAccess() })
        return nil
    })
    if code, ok := writeStoreError(w, err); ok {
        h.auditRefused(r, code) // client_gone: skip
        return
    }
    if err != nil { h.serverError(...); return }        // 422/409 last_admin etc keep their own mapping
    writeJSON(w, http.StatusOK, map[string]any{"rev": newRev})

(b) three-file import (users + connections + config.yaml), basis already decoded:

    err := h.wr.Do(r.Context(), func(tx *txn) error {
        if err := tx.check(usersPath, connsPath, configPath); err != nil { return err }
        if cur := h.basis(); cur != basisSent { return newStaleBasis(cur) }   // only for sections not skipped
        tx.stage(configPath, cfgBytes, 0o644, nil)                           // config.yaml: 0o644, no sealed verify
        if err := h.seal.stageDoc(tx, roleUsers, usersPath, usersDoc); err != nil { return err }
        if err := h.seal.stageDoc(tx, roleConns, connsPath, connsDoc); err != nil { return err }
        tx.onPublish(func() { h.store.swapAll(users, conns); h.live.apply(cfg) }) // ONE critical section for all three
        tx.afterCommit(func() { audit; dropSessions; closeSockets })
        return nil
    })
    // settings rev after the commit: h.wr.rev(configPath)

Backup/export/scheduled run: wrap the read of users+connections+settings in h.wr.snapshot(func(){ ... }).

## Removed old symbols
fileTx (type, stage, commit, putBack, abort, fields staged/done/rename), stagedFile, priorFile, old sealer.stageDoc(tx *fileTx, ...) (same name,
new signature taking *txn), old writeFileAtomic internals (function kept, now temp+fsync+rename+dir fsync via writeTemp/syncDir).
Test helpers renameFailing and readOr/assertNoTempFiles stay in fileutil_test.go (renameFailing and readOr are used by writer_test.go and main_test.go).
Callers that must migrate: settings.go (fileTx at settings.go:166-202), backup_api.go (:287, :366-370), store.go (replaceStores(tx *fileTx...) :809,
writeDoc uses at :640 :671 :702 :751 :796 :905), backup.go:556 (writeDoc), store_test.go:1129,1159,1172 (&fileTx{}). configfile.go:627
still calls writeFileAtomic (one-time seed of config.yaml at start, before any writer: left as is, documented in its comment).

## Deviations from the spec
- Journal is dir-scoped: all staged files must be in the writer's dir. txn stores base names (a planted journal cannot point elsewhere).
- Extra: Do re-checks the disk for every staged path before committing (spec only said the op checks).
- Extra: errNotFound/clientGone helper and statusClientGone 499 (not in the list, but 11.1 needs not_found shared and client-gone needs a status).
- Extra: a stale <target>.bak is deleted in prepare (before txn), and every .bak is written temp+rename so a half copy can never exist.
- Sweep deletes .bak only for the 4 known store file names (an operator's own copies of other files survive). Operators must not keep their own
  config.yaml.bak / users.yaml.bak / connections.yaml.bak / backup.yaml.bak in the data dir (they are overwritten/deleted). Docs agent: say so.
- The post-commit directory fsync failure (step 7) and a failed backup delete are logged, not errors: the commit stands (txn is already gone).
- A damaged txn (unparseable, unknown field/version, no files, bad name) STOPS the start with instructions; it is not guessed at.
- Windows: syncDir is a no-op (a directory cannot be opened for sync there).
- writeDoc kept (not in the task) so fixtures and first-start bootstrap compile; it is a lock-free journaled commit.
- verify error text from yaml is replaced by a fixed message (yaml errors can quote values).

## NEEDED FROM OTHERS
- store/settings/backup agents: call sums.rememberDisk / remember at load (see above) with the store key; construct ONE writer for the data dir
  and share it (settings, store, backup_api); set w.gate from the audit refuse state; migrate the callers listed under "Removed".
- Whoever builds the audit "wrote" list: tx has paths() and w.rev; the seq values are the caller's.
- Docs agent (docs/): txn/.bak/.tmp-* files, recovery at start, reserved .bak names, store_write_failed / store_changed_on_disk codes.

## Unfinished / unverified
- Nothing compiled, vetted or run. Tests added: fileutil_test.go (journal, recovery, crash after each of 8 steps, rollback, panics, round trip),
  writer_test.go (writer, errors map, disk check, overlap, ctx, gate, panics, snapshot), storecrypt_test.go (checksums, verifier, stageDoc,
  writeDoc), main_test.go (recovery before config read; damaged journal stops the start).
- Uncovered by design (Go total only): sealDoc's yaml.Marshal error branch, syncDir's windows branch, a few IO-error branches in writeTemp.
