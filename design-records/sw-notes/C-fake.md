# C-fake: the in-browser fake gateway (src/mock-broker/gateway/**, tests/mock-broker/gateway/**)

Nothing was compiled or run. All of it is checked by reading only.

## Names others rely on

New file `src/mock-broker/gateway/versions.ts`:
- `revRequired`, `exists`, `notFound` (GatewayResponse constants), `stale(rev: number | string)`.
- `bodyRev(v: unknown): number | null` (whole number >= 0, else null), `queryRev(query: string): number | null` (`?rev=N`, whole number >= 1, else null).

`store.ts` (`createStore`):
- `upsertUser(rec, password, rev?)` -> `{ ok: true; rev; dropSessions } | { ok: false; error: 'exists'|'not_found'|'stale'|'blank_password'|'last_admin' }`. Without `rev` it is the unconditional edit the control panel and tests use (unchanged call sites keep working).
- `deleteUser(name, rev?)` -> `'deleted'|'not_found'|'stale'|'last_admin'`. `upsertConnection(c, rev?)` -> `{ ok: true; rev } | { ok: false; error: 'exists'|'not_found'|'stale' }`. `deleteConnection(broker, rev?)` -> `'deleted'|'not_found'|'stale'` (was boolean; now fires onChange only when something was deleted).
- `userRev(name)`, `connRev(broker)`, `seqs()` -> `{ users, connections }`.
- `listUsers()` / `listConnections()` carry `rev`. `dump()` returns `StoreDump` (adds `versions`), `load(StoreDump)`.
- `setPassword` bumps seq, moves rev only if mustChangePassword flipped. `replaceUsers` / `replaceConnections` bump seq and restamp every record.
- revs live in side maps (not in `UserRec` / `ConnRec`), because a backup serialises those records and its strict reader refuses a `rev` key.

`settings.ts`: `settings.rev()` (string), `settings.diskRefusal()`, `settings.save(patch, rev: string)` (rev '' = none), `settings.load(s, rev)`, `splitRev(body)`, `refusalBody(r)`, type `SettingsViewRev = SettingsView & { rev: string }`. `Refusal` gains `rev?: string`. `SaveResult` ok carries `rev`.

`backup.ts`: `BackupsState` gains `seq?: number`; `Basis` type exported. `index.ts`: `GatewaySnapshot` gains required `settingsRev: string`, and `store` is now `StoreDump` (old-build snapshots throw in `restore`, which `boot.managed.ts` already catches as a damaged snapshot; its `SNAPSHOT_VERSION` could be bumped to 3 to skip that, not mine).

## Behaviour (all per section 11)
- Seed: users seq 1 and every user rev 1; connections seq 1 and every connection rev 1; settings rev "1" (a counter written as text); no schedule (schedule seq 0, shown rev = seq of the last save, null schedule when absent). A first create after the seed therefore answers rev 2.
- Settings order in the fake: merge/decode (400 bad_request) -> rev_required (missing, empty, null; a non-string rev is 400 bad_request) -> unreadable / config_changed_on_disk -> stale (current rev string) -> host path / 422 validation -> direct -> would_lock_out -> commit. A refused save moves nothing.
- Schedule: rev is backup.yaml's seq: every save and delete moves it, delete keeps the counter, GET shows `schedule.rev`. Order: schedule/keep/passphrase-rule 422 -> rev_required -> exists (rev 0 and present) / not_found (rev > 0 and absent) -> stale -> "A new schedule needs a passphrase" 422 -> commit. Delete: rev_required -> 404 -> stale -> 204.
- Import: choices 422 -> open file 422 -> basis missing/null = 400 rev_required (wrong shape = 400 bad_request, a missing inner field reads 0) -> if settings imported, the disk check (config_unreadable / config_changed_on_disk) -> stale (only non-skipped sections compared; body `{error:"stale", basis:{users,connections,settings}}`) -> content validation -> settings save -> restamp. Import answer unchanged (`{restartRequired, signedOut}`).
- Users PUT: 422 checks on the body alone -> rev_required -> exists / not_found -> stale -> blank_password 422 / last_admin. DELETE: rev_required (missing, junk or 0) -> not_found -> stale -> last_admin.
- audit.onFailure: in the schema, ZERO, the demo seed (`seed.ts`), validation (`key "audit.onFailure" has invalid value "x": must be "continue" or "refuse"`, strict, no case folding), and defaulted to "continue" when a seed, snapshot or backup lacks it (so an older backup imports with continue).

## For the contract agent (goldens to update)
- `seed.json` settings.audit: add `"onFailure": "continue"` (the fake tolerates its absence by defaulting).
- GET /managed/users: every user gains `"rev"` (seed: 1 each, users seq 1). GET /managed/connections: every connection gains `"rev"` (1 each). The Go harness must stamp the seed the same way (seq 1, rev 1) or the numbers differ.
- GET /managed/settings gains top-level `"rev"` (string) and `settings.audit.onFailure: "continue"`. The fake's rev is "1" then "2", ...; the real one is a checksum, so the golden must normalise it (like `nextRun`), and so must the `rev` in PUT /managed/settings answers and in the settings `stale` body.
- PUT users/connections: 200 `{"rev": N}` (was 204). PUT settings: 200 `{"restartRequired": [...], "rev": "<opaque>"}`. PUT schedule: 200 `{"rev": N}` (was 204). DELETE answers stay 204.
- GET /managed/backup: `schedule` gains `"rev"`. POST /managed/backup/preview: gains `"basis": {"users": N, "connections": N, "settings": "<opaque>"}`. Import requires `"basis"`.
- New refusals: 400 `{"error":"rev_required"}`, 404 `{"error":"not_found"}`, 409 `{"error":"exists"}`, 409 `{"error":"stale","rev":N}` (settings: string; import: `"basis":{...}` instead of rev). Import and settings goldens that send no basis/rev must now add it.
- The fake's order of checks where 11.1 is silent (the Go side must match, or the goldens must avoid the overlap): 422 on the body alone comes BEFORE rev_required; for settings, config_unreadable / config_changed_on_disk come after rev_required and before stale; a non-numeric / fractional / negative body rev is rev_required (not bad_request) for users, connections and schedule, but a non-string settings rev is bad_request.

## Edits to files that are not mine
None.

## Tests (tests/mock-broker/gateway/)
- New `versions.test.ts`: bodyRev/queryRev; users, connections, settings, schedule and import-basis rules, each refusal, ordering, password-only keeps rev, forced-change flip moves rev, never-reused revs, restamping, reload carrying seq/rev, seeded revs, older-snapshot/backup defaults.
- Updated for the new contract: `gateway.test.ts` (settings saves carry rev; audit.onFailure test), `backup.test.ts` (schedule rev, `?rev=` deletes, import basis), `sockets.test.ts` (rev 1 on PUT/DELETE), `error-codes.test.ts` (stale, exists, rev_required placed as sent via FAULTS rows, the other three in NOT_SIMULATED), `seed.test.ts` (valid revs, onFailure), `routes.test.ts`.

## NEEDED FROM OTHERS
- B-browser: `routes.test.ts` rows call the services with my GUESSED signatures. Adjust the rows if B's differ: `users.saveUser({ ..., rev })` and `users.deleteUser(name, rev)` (rev read from `list.data.users[i].rev`, so `ManagedUser.rev: number` is assumed), `conns.deleteConnection(broker, rev)` (`ManagedConnRecord.rev` assumed, saveConnection sends the listed record's rev), `settings.save(settings, rev)` with `SettingsView.rev: string`, `backup.saveSchedule({ ..., rev })` answering `{ rev }` in `data`, `backup.removeSchedule(rev)`, `backup.preview(...)` data carrying `basis`, `backup.importFile(source, pass, choices, basis)`. Also `GatewaySettings.audit.onFailure` must exist in `src/modules/gateway-settings/service.ts` (seed.ts, settings.ts and my tests use it). Tests outside my folder that drive the fake through the services (tests/mock-broker/demo-flow.test.ts, tests/integration/admin-session.test.ts, tests/mock-broker/controls/managed.test.ts) were not touched and may need rev too.
- contract agent: see the list above; `contract.test.ts` and `error-codes.test.ts` (GOLDEN) read cases.json and will fail until it is regenerated.

## Unfinished / not verifiable by reading
- Everything is uncompiled. Likeliest compile risks: `GatewaySettings.audit.onFailure` missing in B's type; `Omit<ListedUser, 'rev'>` against B's `ManagedUser`; the `as const` tuples in the `Map` constructors; `delete ... as Partial<...>` casts in tests.
