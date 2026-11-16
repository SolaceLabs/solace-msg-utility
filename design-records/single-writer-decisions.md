# Single writer with per-record versions: design decisions

Date: 2026-11-14
Scope: SolaceMessageUtility gateway, Provisioned mode store (review findings CR-0013, CR-0014, and last-writer-wins between admins).
Status: decided with the owner, except the items marked OPEN in section 7.

Names marked (suggested) were chosen during the discussion and can be renamed freely.

---

## 1. Decision record

### 1.1 HTTP style: house style
- Decided: the rev travels in the JSON body. A stale save is 409 with error "stale" and the current rev.
- PUT only, no POST. A PUT with rev 0 is a create. DELETE carries the rev as `?rev=N`.
- Why: a list GET must carry one rev per record in the body anyway, so ETag would add a second mechanism. A compressing reverse proxy can weaken or rewrite an ETag, and If-Match needs a strong match. The browser already branches on the JSON error code (config_changed_on_disk), so "stale" is one more code.
- Given up: standard If-Match tooling; 409 now covers several cases told apart by the error code.

### 1.2 Writer shape: one gateway-wide lock
- Decided: one lock for all store files, held around each full transaction, behind a single entry point `writer.Do(ctx, op)` (suggested). The lock is a one-slot channel, so a waiting request can give up when its client goes away.
- Why: same one-at-a-time guarantee as a queue goroutine, with no start, drain or stop code, no result channels, and panics handled in the request's own goroutine.
- Given up: strict FIFO order. Not relevant at rare-to-daily edits.

### 1.3 Where rev lives: inside the record; seq per file
- Decided: each user and connection record has a `rev` field. `seq` is a counter at the top of each sealed file (users.yaml, connections.yaml, backup.yaml).
- seq is stored, never derived from the highest rev. After a delete the highest rev can be lower than seq.
- Why: a rev inside the record cannot drift from it. A side map can drift on delete or import. Per-file seq keeps a user save from touching connections.yaml.

### 1.4 A save without a rev: refused
- Decided: 400 "rev_required". It violates the contract.
- No "overwrite anyway" flag.
- Why: accepting it keeps the last-writer-wins back door, and a form that forgets its rev would overwrite silently.

### 1.5 Granularity: per record
- Decided: one rev per record. No field revs. No three-way merge.
- Why: almost every record is made of groups that must move together (username with password, hostname with ports, the two grant lists). A merge can commit a record no admin reviewed, and it would have to be built twice (real and fake gateway).
- Given up: two admins changing different fields of one record cannot both save. The second reloads and redoes the edit.

### 1.6 Two kinds of write
- Whole-record save (admin PUT and DELETE): carries the rev.
- Field-scoped change (own password, TOTP enrolment, admin removes TOTP): carries no rev. Inside the lock it sets only its own fields on the current record and keeps the rest.
- An admin password reset stays in the PUT, with the rev, as a non-blank password.

### 1.7 When the rev moves
- Decided: seq moves on every commit. A record's rev moves only when the record changes as the admin console sees it (the GET view).
- A password change alone: seq moves, rev stays. The hash is never returned.
- mustChangePassword flips: rev moves.
- TOTP added or removed: rev moves.
- A new record always gets a rev. An import stamps every record in the sections it imports.
- Why it is safe: a PUT cannot overwrite a hash by accident, because a blank password means "keep" and that is resolved inside the lock against the current record.

### 1.8 Import guard
- Decided: the preview returns the versions it saw (users seq, connections seq, settings rev). The import sends them back. If any chosen section moved, the import is refused with 409 "stale".
- Why: without it, the import applies to a state the admin did not preview. Because seq moves on every commit, a password change after the preview also invalidates it.

### 1.9 File layout: single files stay
- Decided: no file per record.
- Why: one sealed file vouches for the whole list. Per-record files would allow deleting, restoring or rolling back one record undetected, would leak names and activity through file names and timestamps, and would lose the single atomic commit.

### 1.10 Commit protocol: txn file plus backup copies
- Decided: every write (one file or several) uses the same journaled path: a `txn` file, a backup copy of each target, temp files, rename, then delete `txn` as the commit point. Copy, not hard link. fsync and rename are kept.
- Why: several renames are not atomic as a group. With one commit-point file, a crash or a failure half way is rolled back. One path for every write means every save tests the recovery code.
- Why fsync: without it a power loss or node failure can leave an empty or partial file. Why rename: a copy over the original can be torn; a rename is old or new, never half.

### 1.11 Reads and the changed-on-disk refusal
- Decided: reads stay served from memory. The on-disk check runs at write time only.
- A "changed on disk" refusal stays in force for that file until a restart, because the cause does not go away.
- Principle noted by the owner: disk is the truth and memory is a cache of the last read. A freshness check on every read is parked with the HA plan.

### 1.12 Checksum
- Decided: a keyed checksum, HMAC-SHA-256 over the stored bytes (nonce, ciphertext and tag for sealed files), with a key derived from the store key (HKDF, fixed label). It lives in memory only and is recomputed at load.
- Not stored on disk: it can always be recomputed, and a stored copy adds a file and no protection.
- The fresh nonce only means the checksum changes on every write. Never compare by encrypting again.
- Dropped: a guard against an older file restored while the gateway is stopped. Baseline: system files are never touched by hand; changes go through the GUI. The one expected hand edit is config.yaml for restart-only keys, covered by config_changed_on_disk.

### 1.13 Rev for the single documents
- Settings (config.yaml): the rev is the keyed checksum, as an opaque string. No counter in a hand-editable file.
- Schedule (backup.yaml): the rev comes from a `seq` inside backup.yaml. Deleting the schedule keeps the file with the counter and no schedule. No schedule means rev 0.

### 1.14 Audit line fails after a commit
- Decided: the owner of the deployment chooses. Config key `audit.onFailure: continue | refuse` (suggested), default `continue`.
- continue: log LOUDLY to stderr or stdout for every lost audit record and carry on.
- refuse: refuse further changes with 503 until the audit log is writable again. Sign-ins and reads continue. The gateway does not exit, because a restart does not cure a full disk.
- The committed change always stands.

### 1.15 Sockets
- Confirmed by the owner: the socket list is in memory only.
- Decided: add a new socket to the list first, then check access against the current snapshot. The hook closes every listed socket whose user has no access under the new snapshot (level-triggered, safe to repeat).
- Why: a socket that checks access on the old snapshot and is listed after the hook ran would stay open.

### 1.16 Mesh
- Parked with the multi-instance and HA plan. See section 6.

---

## 2. Stored format (plaintext before sealing)

    # users.yaml
    seq: 42
    msg-utility-users:
      - username: alice
        rev: 42
        ...

    # connections.yaml
    seq: 7
    msg-utility-connections:
      - broker: prod-sg-1
        rev: 7
        ...

    # backup.yaml
    seq: 3
    schedule: { ... }     # absent after a delete; seq stays

- rev is per user and per broker. A change to one VPN entry moves the rev of its broker.
- Load check: every rev is at least 1 and at most seq, else the gateway refuses to start.
- A backup import ignores any seq or rev in the backup and stamps fresh ones.
- No migration: Provisioned mode has not shipped.

---

## 3. API shape

All bodies are JSON. Refusals use `{"error": "<code>", ...}`.

### 3.1 Reads
| Endpoint | Change |
|---|---|
| GET /managed/users | each user carries `rev` (integer) |
| GET /managed/connections | each connection carries `rev` (integer) |
| GET /managed/settings | carries `rev` (opaque string) |
| GET /managed/backup | the schedule carries `rev` (integer, 0 when there is no schedule) |
| POST /managed/backup/preview | carries `basis` (suggested): `{"users": N, "connections": N, "settings": "..."}`, opaque to the browser |

### 3.2 Whole-record saves
| Endpoint | Request | Success |
|---|---|---|
| PUT /managed/users/{name} | record plus `rev`; rev 0 creates | existing success status; body carries the record's rev |
| DELETE /managed/users/{name}?rev=N | rev in the query | existing success status |
| PUT /managed/connections/{broker} | record plus `rev`; rev 0 creates | as above |
| DELETE /managed/connections/{broker}?rev=N | rev in the query | as above |
| PUT /managed/settings | settings plus `rev` (string) | body carries the new rev |
| PUT /managed/backup/schedule | schedule plus `rev`; rev 0 creates | body carries the new rev |
| DELETE /managed/backup/schedule?rev=N | rev in the query | existing success status |
| POST /managed/backup/import | existing body plus `basis` from the preview | existing success status |

Go detail: decode `rev` as a pointer, so a missing rev is not read as 0.

### 3.3 Field-scoped changes (no rev sent)
| Action | Fields touched | Rev of the user |
|---|---|---|
| Own password (existing route) | password; clears mustChangePassword | moves only if the flag flipped |
| TOTP enrolment (own) | TOTP group | moves |
| Admin removes TOTP (suggested: DELETE /managed/users/{name}/totp) | TOTP group | moves; response carries the new rev |

- Own password: check the old password and hash the new one before the lock. Inside the lock, confirm the stored hash is still the one that was checked; if not, refuse as a wrong current password.
- The PUT never carries or clears the TOTP secret.

### 3.4 Status and error codes
| Status | error | When |
|---|---|---|
| 400 | rev_required | PUT without rev, DELETE without ?rev, import without basis |
| 404 | (existing not-found) | rev above 0 and the record is gone (deleted meanwhile) |
| 409 | stale | rev sent is not the current rev; body carries the current `rev` (or current `basis` for an import) |
| 409 | exists | rev 0 and the name exists |
| 409 | store_changed_on_disk (suggested) | users.yaml, connections.yaml or backup.yaml changed outside the gateway; restart to load |
| 409 | config_changed_on_disk | existing; config.yaml changed outside the gateway |
| 409 | would_lock_out | existing |
| 409 | (existing last-admin code) | deleting or demoting the last admin |
| 422 | invalid | existing validation refusal |
| 500 | store_write_failed (suggested) | the write failed and was rolled back; nothing changed |
| 503 | audit_unavailable (suggested) | audit.onFailure is refuse and the audit log cannot be written |
| existing | existing auth refusal | the caller is no longer an admin when the lock is acquired |

### 3.5 Browser messages
- Stale: "This user was changed by someone else since you opened it" with a Reload button. Same wording for connection, settings and schedule.
- Deleted meanwhile: a clear message and a return to the list.
- Stale import: ask the admin to run the preview again.
- Changed on disk: tell the admin the gateway must be restarted.

---

## 4. Writer transaction

### 4.1 Before the lock
- Authenticate the session and decode the body.
- Do all slow, input-only work: password hashing, checking the old password, backup decryption and key derivation, schedule passphrase derivation.

### 4.2 Inside the lock
1. Acquire the lock. If the request context ends while waiting, return; nothing happened.
2. Check the request context once. If the client is gone, return with no change.
3. If audit.onFailure is refuse and the audit log is failing, refuse with 503.
4. Re-check the caller against the current snapshot (admin flag; for own password, the stored hash).
5. Disk check: for each file the change will write, the keyed checksum of the bytes on disk must equal the one in memory. Else refuse (store_changed_on_disk or config_changed_on_disk).
6. Plan, on a copy, never on live memory:
   - the record exists, else 404; rev 0 on an existing name is "exists";
   - the rev sent equals the current rev, else "stale" with the current rev;
   - validate, including the cross-record rules (last admin, would_lock_out) and "blank means keep" for write-only fields;
   - build the candidate state; add 1 to seq of each file written; stamp rev per rule 1.7.
7. Commit, the same path for one file or several:
   1. write `txn` naming the targets and which of them did not exist; fsync;
   2. copy each target to its backup; fsync;
   3. seal the new content with a fresh nonce, write each temp, fsync;
   4. rename each temp over its target; fsync the directory;
   5. delete `txn` (the commit point); fsync the directory;
   6. delete the backups.
8. Publish: swap the in-memory snapshot; store the new keyed checksums.
9. After the commit: write the audit line (outcome ok, with file and seq); close the sockets of users without access under the new snapshot; sign out an admin whose own change ended their access (existing behaviour).
10. Release the lock and respond with the rev.

### 4.3 Failure handling
| Where | What happens |
|---|---|
| Steps 2 to 6 refuse | No side effects: no seq change, no file write, no socket closed. An audit line with outcome refused is written. The next waiter proceeds. |
| Error in 7.1 to 7.4 | Roll back in the running process: restore the backups, remove temps, remove `txn`. Respond 500 store_write_failed. Memory was never swapped. |
| The rollback itself fails | Log and exit. The restart runs recovery. |
| Panic before the commit point | Roll back as above; the request fails; nothing changed. |
| Panic after the commit point | Log and exit. The restart loads the committed state from disk. |
| Crash or power loss at any point | Recovery at start (4.4). The client got no answer; a retry with the old rev gets "stale" if the change committed. |
| Audit line fails | The change stands. Loud line on stderr or stdout. Then continue or refuse further changes, per audit.onFailure. |
| Client leaves after step 7 started | The transaction runs to the end. |

### 4.4 Start-up
1. If `txn` exists: restore every backup over its target, remove targets recorded as not existing before, remove temps, remove `txn`.
2. If `txn` does not exist: sweep stray backups and temps (a completed change).
3. Load the files, compute the keyed checksums (after the store key is loaded), and run the load check on seq and rev.

### 4.5 Rules for every write path
- Every write to a store file goes through `writer.Do`. No other code writes these files.
- The read path never holds the writer lock. Memory is locked only for the swap.
- One lock covers all store files.
- Scheduled and manual backups read one snapshot. Saved backup files are outside the writer.

---

## 5. Test list

### 5.1 Gateway unit tests
- seq and rev: create stamps rev = seq; update; delete moves seq and no record holds it; re-create gets a new rev, never a reused one; a refusal leaves seq unchanged.
- Rev rule: password-only change keeps rev and moves seq; mustChangePassword flip moves rev; TOTP add and remove move rev; admin PUT with a blank password keeps a hash the user set meanwhile.
- Own password: an admin reset landing between the check and the lock is refused.
- Every refusal code in 3.4, on every endpoint it applies to (PUT, DELETE, settings, schedule, import).
- Load check: rev 0 or rev above seq refuses to start.
- modules: absent, empty and listed survive the JSON round trip.
- Schedule: delete keeps the counter; re-create gets a new rev; rev 0 when absent.
- Settings rev: same file gives the same rev across a restart; a different store key gives a different rev; nothing is written to disk for it.
- Import: every record in an imported section is restamped; matching basis passes; a moved basis is stale; a missing basis is rev_required; a password change after the preview makes the import stale.
- Commit protocol: a simulated crash after each step of 4.2 step 7 (rolled back before the commit point, kept after it); a target that did not exist before; failure at rename 2 of 3 rolls back and leaves memory unchanged; a failed rollback calls the exit hook.
- Panic before the commit point changes nothing; panic after it calls the exit hook.
- Audit: ok line carries file and seq; refused line on each refusal; failure with continue keeps the change and logs loudly; failure with refuse makes the next change 503 while sign-in and reads still work.
- Context: client gone while waiting means no change; client gone after the commit started still commits.
- Caller re-check: an admin demoted while waiting for the lock is refused.
- Sockets: listed before the access check; a socket opened during a commit is refused or closed; the hook is safe to run twice.
- A hand edit of config.yaml is refused with config_changed_on_disk; a replaced sealed file with store_changed_on_disk, on every later save until restart.

### 5.2 Race-style tests (run with the race detector)
- Two saves of one record: exactly one wins, the other is stale.
- Two saves of different records in one file: both land.
- Two creates of one name: one gets exists.
- Delete racing a save: the save gets 404.
- Import racing a user save, in both orders.
- Two schedule saves: disk and memory agree afterwards.
- Two admins demoting each other: one is refused by the last-admin rule.
- Own password change racing an admin save of the same user.
- Readers during writes never see a half-applied state.

### 5.3 Contract cases (real and fake gateway, goldens updated together)
- GET users, connections, settings and schedule carry rev (schedule rev 0 when absent); preview carries basis.
- PUT create with rev 0; update; stale; exists; not found; rev_required.
- DELETE with rev; without rev; stale.
- Settings: save; stale; rev_required.
- Schedule: create; update; delete; stale.
- Import: with basis; stale basis; without basis.
- Remove TOTP returns the new rev.

### 5.4 Browser side
- managedRequest: map stale, exists, not found, rev_required, store_changed_on_disk and audit_unavailable.
- user-management, connection-management: keep the rev from the load; send it on save and delete; send 0 on create; adopt the rev from the response; show the stale dialog with Reload; show the deleted-meanwhile message.
- gateway-settings: the same with the string rev.
- backup: the same for the schedule; keep basis from the preview and send it on import; on a stale import ask for a new preview.
- Fake gateway: seq and rev by the same rules, same codes.
- Tests mirror src; web coverage stays at 100 percent on all four metrics.

### 5.5 End-to-end checks (scripts/e2e.mjs)
- Two admin sessions open one user. The first saves. The second save shows the refusal message; Reload; the save then works.
- One session deletes a user; the other saves it and sees the deleted-meanwhile message.
- A preview, then a change in another session, then the import: the admin is asked to preview again.
- A user changes their own password while an admin has that user open: the admin save succeeds.
- A user enrols TOTP while an admin has that user open: the admin save is refused.

---

## 6. Parked with the multi-instance and HA plan
- A freshness check on every read (disk is the truth, memory is a cache of the last read).
- Run the socket hook on "snapshot published", so followers run it too.
- config.yaml mixes host-local keys (tls paths, hosted) with shared ones and would need splitting.
- Already in place for it: every write enters through one entry point, Plan has no side effects, and seq tells a follower it is behind.

---

## 7. OPEN items for the coding session
1. Round-trip check: decrypt and parse each temp before the rename, and refuse the commit if it fails. Proposed, not confirmed.
2. Should an admin password reset or a TOTP removal end that user's open sessions? Not discussed. It would belong in step 9.
3. Confirm the suggested names: `writer.Do`, `basis`, `store_changed_on_disk`, `store_write_failed`, `audit_unavailable`, `audit.onFailure`, and the remove-TOTP route.
4. The routes for own password and TOTP enrolment were not in the reference used here. Apply 3.3 to the existing routes.
5. fsync and rename (1.10) were recommended and not objected to. Confirm.

---

## 8. Docs that change
- architecture.md: the writer, the commit protocol and recovery, seq and rev, the read path, the socket order.
- developer-guide.md: the write-path rule for future files and data stores (4.5), the two kinds of write, the rev rule, the error codes.
- provisioned-mode.md: the stored format, behaviour with several admins, changed-on-disk, recovery after a crash, audit.onFailure.
- user-guide.md: the refusal messages and Reload; previewing an import again.
- The config.yaml reference: audit.onFailure.
- docs/db.md: record the outcome against its requirements.
- test-report.md: ledger entry.
- docs/improvement-plan.md (local): move "Single writer with per-record versions" out of Future; add section 6 to the HA entry.
- Contract goldens in go-web-proxy/testdata/contract and the fake gateway, updated together.

---

## 9. Findings from the code check (2026-11-14, coding session)
- 1.15 is already in place: go-web-proxy/smf.go registers the socket first and checks access second.
- 7.2 is already answered for passwords: managed.go calls sessions.dropUser when an admin sets a user's password, changes the admin flag or deletes the user. TOTP removal follows the same rule when TOTP is built.
- Existing codes: 422 invalid, 404 not_found, 409 last_admin, 409 would_lock_out, 409 config_changed_on_disk, 500 server_error (a failed save, audited as refused), 403 forbidden.
- Today a PUT is an upsert; "Add refuses an existing name" is a browser-side check only. rev 0 with 409 exists moves it to the gateway.
- fileutil.go has fileTx (stage, commit, put back from memory, no journal, no directory fsync). The txn journal replaces it.
- The own-password route is the gateway page POST /login/password (pages.go), not a /managed route. TOTP does not exist yet.

---

## 10. Open items closed with the owner (2026-11-14)
- 7.1 Round-trip check: YES. After sealing each temp and before the rename, decrypt and parse it; on failure roll back and answer 500.
- 7.2 Sessions: already the behaviour for an admin password reset (sessions.dropUser). TOTP removal follows when TOTP is built.
- 7.3 Names: ALL suggested names are used: writer.Do, basis, stale, exists, rev_required, store_changed_on_disk, store_write_failed (500, replaces server_error for a failed and rolled-back store write, in the audit code too), audit_unavailable, audit.onFailure.
- 7.4 Scope: the writer only. Own password (POST /login/password, pages.go) is the one field-scoped write. Every TOTP row (enrolment, DELETE /managed/users/{name}/totp, "TOTP moves the rev", the TOTP tests, contract case and e2e check) is deferred to the two-factor wave.
- 7.5 Durability: fsync and rename kept as today; NEW: fsync the directory after the renames and after deleting txn.

---

## 11. PINNED CONTRACT (coding session, 2026-11-14). Every agent builds exactly this.

Where sections 1 to 8 are vague, this section decides. TOTP is out of scope (section 10).

### 11.1 Error body
`{"error": "<code>", "field"?: string, "reason"?: string, "rev"?: number|string, "basis"?: {...}}`
- 400 rev_required: no rev (PUT body without `rev`, DELETE without `?rev=`, a rev that is not a whole number >= 0, DELETE with rev 0, settings PUT with a missing or empty rev, import without `basis`).
- 404 not_found: rev > 0 and the record (or the schedule) does not exist.
- 409 stale: carries `rev` = the current rev (number, or string for settings). For an import it carries `basis` = the current basis instead.
- 409 exists: rev 0 and the name (or a schedule) already exists.
- 409 store_changed_on_disk: users.yaml, connections.yaml or backup.yaml changed outside the gateway. Sticky for that file until restart.
- 409 config_changed_on_disk: existing code, same meaning for config.yaml. Sticky until restart. It wins over stale (the disk check runs first).
- 500 store_write_failed: a store write failed and was rolled back; nothing changed. This REPLACES server_error for failed store writes, in the HTTP answer and in the audit code. server_error stays for every other 500.
- 503 audit_unavailable: audit.onFailure is refuse and the audit log is failing.
- Existing codes keep their status: 422 invalid, 409 last_admin, 409 would_lock_out, 403 forbidden, 401 unauthenticated.
- Order of checks for a whole-record save: decode and input validation that needs no store state (422 invalid, 400 rev_required) -> lock -> 503 audit_unavailable -> caller re-check (403/401) -> disk check (409 *_changed_on_disk) -> existence (404 not_found / 409 exists) -> rev (409 stale) -> cross-record validation (409 last_admin, 409 would_lock_out, 422 invalid) -> commit (500 store_write_failed).

### 11.2 Users and connections
- GET /managed/users: each user gains `"rev": <integer >= 1>`. GET /managed/connections: each connection gains `"rev"`.
- PUT /managed/users/{name} and PUT /managed/connections/{broker}: the existing body plus `"rev": <integer>` (required). rev 0 = create. rev > 0 = update.
  Success is now **200 `{"rev": <the record's rev after the save>}`** (was 204).
- DELETE /managed/users/{name}?rev=N and DELETE /managed/connections/{broker}?rev=N: success stays 204.
- Rev rule (1.7), one rule for both record kinds: seq of the file moves by 1 on every commit. The record's rev becomes the new seq only when the record's GET view changed (userToOutput / connToOutput, ignoring rev); otherwise the rev stays. So a save that only sets a password (user password, SEMP password, VPN password) moves seq and keeps rev. A create always stamps rev = new seq. An import stamps every record of each imported section with that file's new seq.
- "Add refuses an existing name" is now the gateway's 409 exists. The browser keeps its own early check.

### 11.3 Settings
- GET /managed/settings gains top-level `"rev": "<opaque string>"` (the keyed checksum of config.yaml as last read or written, base64 raw URL encoding). `changedOnDisk` stays.
- PUT /managed/settings: the body is the settings keys at top level as today PLUS a top-level `"rev": "<string>"` (required). Success: 200 with the existing body plus `"rev": "<new rev>"`.
- New key `audit.onFailure`: "continue" (default) or "refuse". A live key. In the settings document, the goldens, the fake gateway and the Gateway Settings page (a select beside the two audit checkboxes). No environment variable seeds it.

### 11.4 Backup schedule and import
- GET /managed/backup: when a schedule exists, the `schedule` object gains `"rev": <integer >= 1>` (= seq of backup.yaml). No schedule: as today; the browser then sends rev 0.
- PUT /managed/backup/schedule: existing body plus `"rev"` (required). rev 0 with a schedule present = 409 exists. rev > 0 with no schedule = 404 not_found. Success is now **200 `{"rev": N}`** (was 204).
- DELETE /managed/backup/schedule?rev=N: 204. backup.yaml stays, holding `seq` and no schedule.
- POST /managed/backup/preview: the answer gains `"basis": {"users": <users seq>, "connections": <connections seq>, "settings": "<settings rev>"}`.
- POST /managed/backup/import: the body gains `"basis"` (required, the object from the preview, sent back untouched). For every section whose choice is not skip, the basis value must equal the current one, else 409 stale with the current `basis`. Skipped sections are not compared.

### 11.5 Own password (the one field-scoped write)
- POST /login/password (pages.go) is unchanged on the wire. Before the lock: check the current password and hash the new one. Inside the lock: the stored hash must still be the one that was checked, else refuse as a wrong current password. seq moves; rev moves only if mustChangePassword flipped.

### 11.6 Audit
- auditEntry gains an optional field `"wrote": [{"file": "users.yaml", "seq": 43}, {"file": "config.yaml"}]`: one element per store file the commit wrote (base name; `seq` omitted for config.yaml). Present only on outcome ok entries that wrote a store file. Field order in the line: after `changed`, before `msg`.
- audit.onFailure continue: a failed audit write logs at ERROR, message "AUDIT RECORD LOST", with the entry's fields as attributes (the entry never holds a secret), and the request carries on.
- audit.onFailure refuse: while the last audit write failed, every writer transaction is refused 503 audit_unavailable before any other check. The refusal itself tries to write its audit line (outcome refused, code audit_unavailable); any audit write that succeeds clears the failing state. Sign-ins and reads are never refused. A change that committed before the failure stands.

### 11.7 Files on disk
- One journal file `txn` in the data directory (beside users.yaml). Backup copies are `<target>.bak`. Temps stay `.tmp-*`.
- Recovery runs once at process start, before config.yaml is read, in every mode that has a data directory.
- Keyed checksum: key = HKDF-SHA256(store key, no salt, info "smu store checksum v1"), 32 bytes; value = HMAC-SHA256 over the file's bytes. Memory only.
- Exit hook: an injectable `exit func(code int)` (os.Exit in production) so tests can observe "log and exit".
- Publishing memory after a commit happens inside one critical section for all files the commit wrote, and a backup (export, scheduled run, manual run) reads users, connections and settings under the same lock, so it never sees half of an import.

### 11.8 Browser
- ManagedError gains `rev?: number | string` and `basis?: unknown`, read from the error body.
- New stock messages for: stale, exists, rev_required, store_changed_on_disk, store_write_failed, audit_unavailable.
- Stale on a save: a dialog "This user was changed by someone else since you opened it." (connection / settings / schedule wording alike) with a Reload button that reloads the list and closes the form. not_found on a save or delete: "This user was deleted by someone else." and back to the reloaded list. Stale import: "The gateway's data changed since the preview. Run the preview again." and the preview is cleared.
- The shared pieces used by two or more admin modules live in src/core (never a cross-module import).
