# B-browser: the admin console sends and keeps versions

Nothing was compiled or run. All of it is checked by reading only.

## Names others rely on

`src/core/services/managed-api.ts`
- `ManagedError` gains `rev?: number | string` and `basis?: unknown` (read from the error body by `managedRequest`).
- New stock messages (keys of `MESSAGES`, so also in `MANAGED_ERROR_CODES`): `stale`, `exists`, `rev_required`, `store_changed_on_disk`, `store_write_failed`, `audit_unavailable`.

New `src/core/admin-conflict.ts` (shared by the four modules):
- `STALE_IMPORT_MESSAGE`, `staleMessage(subject)`, `goneMessage(subject)`.
- `askReload(subject): Promise<boolean>` (confirmDialog, confirm button "Reload"; true on Reload).
- `handleConflict(err, subject, reload): Promise<boolean>`: `stale` -> askReload, reload on yes; `not_found` -> toast "<subject> was deleted by someone else." then reload; returns true when it handled, false for any other code.
- Test: `tests/core/admin-conflict.test.ts`.

Service signatures (what `tests/mock-broker/gateway/routes.test.ts` calls):
- user-management: `ManagedUser.rev: number`; `UserPayload extends ManagedUser` (so carries `rev`, 0 = create); `saveUser(payload): ManagedResult<{ rev: number }>`; `deleteUser(username, rev)` -> `DELETE ...?rev=N`.
- connection-management: `ManagedConnRecord.rev: number`; `saveConnection(record): ManagedResult<{ rev: number }>`; `deleteConnection(broker, rev)`.
- gateway-settings: `GatewaySettings.audit.onFailure: string`; `SettingsView.rev: string`; `save(settings, rev: string): ManagedResult<{ restartRequired: string[]; rev: string }>` (rev sent at top level of the body, after the settings keys).
- backup: `BackupStatus.schedule.rev: number`; `ImportPreview.basis: unknown`; `saveSchedule({ ...schedule, keep, passphrase, rev })` -> `{ rev }`; `removeSchedule(rev)`; `importFile(source, passphrase, choices, basis)` (basis sent as `basis` in the body).

## Behaviour
- Users / connections: the form keeps `editingRev` (row's rev, 0 on Add); save sends it, adopts `res.data.rev`; delete sends the row's rev.
  - 409 exists -> existing "already exists" message in the form.
  - 409 stale / 404 not_found -> `handleConflict` with subjects "This user" / "This connection". Save reload = `applyGate()` (reloads the list, closes the form); delete reload = `loadList`. Cancel in the stale dialog keeps the form and the typed values.
- Settings: `loadedRev` from `view.rev`, sent with save, replaced by the answer's rev (then the usual reload). stale -> `askReload('This settings page')`; Reload runs `load()`. The audit.onFailure select is `#gw-set-audit-onFailure` (data-key `audit.onFailure`), a FIELDS row of kind text.
- Backup: `scheduleRev` (0 when no schedule) set in `renderStatus`; save/delete send it; save adopts the answer's rev. stale / not_found -> `handleConflict(res, 'This schedule', load)`. 409 exists on save (a schedule appeared) -> own message in the schedule error plus a reload. Import: `basis` kept from the preview and sent untouched; stale import -> STALE_IMPORT_MESSAGE in the import error, preview hidden, basis cleared (file and passphrase stay).

## Deviations from the spec
- Stale dialog has Reload (confirm) and Cancel (default label): Cancel keeps the form and the admin's edits instead of forcing a reload. Spec only names Reload.
- No new component under core/components: the dialog is `confirmDialog` with the label "Reload", wrapped in `src/core/admin-conflict.ts`.
- Settings subject is "This settings page" (so the sentence reads "This settings page was changed by someone else since you opened it.").
- The adopted rev after a successful user / connection / schedule save is stored in a form variable that the immediate reload replaces; it is not separately observable, so no test asserts it (the retry-after-refusal tests assert the rev that IS kept).
- Schedule `exists` (rev 0 but a schedule is present) gets its own message, since the stock `exists` text talks about names.

## Edits to files that are not mine
- `tests/integration/admin-session.test.ts` (admin modules appear there): rev on the USERS fixture, saveUser mocks answer `{ rev: 2 }`. Owned by me per the task (tests/integration).
- Nothing else.

## NEEDED FROM OTHERS
- Whoever owns `tests/mock-broker/demo-flow.test.ts`: the test "loads signed out under connModes both..." PUTs `/managed/settings` with `{ ...first.gateway.settings.current(), connModes: 'both' }` and no rev; the fake now answers 400 rev_required. Add `rev: first.gateway.settings.rev()` to that body. I did not edit it (not mine, not C-fake's tree).
- `tests/mock-broker/gateway/routes.test.ts` rows: my signatures match C-fake's guesses (see above). `ManagedUser.rev`, `ManagedConnRecord.rev`, `SettingsView.rev: string` and `GatewaySettings.audit.onFailure: string` exist.
- Docs agent: user-guide (stale dialog, deleted-meanwhile message, stale import wording, the audit.onFailure select), test-report (new tests/core/admin-conflict.test.ts and versions describes in the four module test files), architecture (admin-conflict helper).

## Unfinished / not verifiable by reading
- Everything is uncompiled and unrun. Likeliest risks: timing in the new module tests (answerConfirm followed by the reload; I used vi.waitFor on a changed row text to avoid races), jsdom close-event timing when two confirm dialogs are answered in sequence (stale delete tests wait for the service call between them), and the 100% coverage claim (not measured).
