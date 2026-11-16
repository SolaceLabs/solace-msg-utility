# G-contract note: contract goldens, both replays, end-to-end checks

Nothing compiled or run (only `node --check` on the two .mjs files, syntax only). ASCII only.

## What changed
- go-web-proxy/testdata/contract/seed.json: settings.audit gains "onFailure": "continue".
- go-web-proxy/testdata/contract/cases.json (hand-edited in the file's own compact style, answers worked out by reading both gateways; NOT produced by `-update`):
  every PUT/DELETE/import step carries rev / ?rev= / basis; PUT users/connections/schedule answer 200 {"rev": N}; list answers carry rev; GET settings
  carries "rev": "<rev>" and audit.onFailure; preview carries basis. 69 cases now (23 new cases): users (stale, exists, not_found, rev_required,
  delete rev/no rev/stale, password-only keeps rev, re-create never reuses a rev), connections (same set), settings (save, stale at start rev, stale before
  validation, rev_required missing/empty), schedule (create rev 0, exists, stale, rev_required, delete stale/no rev, 404 after delete, re-create at seq 3),
  import (stale users basis names current basis; skipped section not compared; stale settings basis; no basis = rev_required).
- Request tokens (both replays): a JSON string value "<settings-rev>" in a request body = the settings rev now; "<settings-rev-at-start>" = the rev when the case began.
  Reason: the real rev is a keyed checksum, the fake's a counter, so no file can hold it.
- Normalisation (both replays): every string "rev" (any depth) and basis.settings becomes "<rev>" when non-empty; empty stays and fails the golden. Numeric revs compare exactly.
- go-web-proxy/contract_test.go: contractNormalizeRevs, contractRevToken/contractRevStartToken, (e *managedEnv) contractSettingsRev, contractResolveBody; loop sends a copy of the step.
- tests/mock-broker/gateway/contract.test.ts: normalizeRevs, REV_NOW/REV_START, settingsRev() through gw.handle as a fresh admin session.
- scripts/e2e-lib.mjs: AUDIT_FIELDS gains 'wrote' (after changed); new exports wroteFile(entry, file), listedRev(text, list, key, name), refusalProblem(res, want), basisMoved(seen, now);
  auditMissing also requires: ok user.create of the user wrote users.yaml with a seq, an ok settings.update wrote config.yaml (no seq), an ok backup.import wrote users.yaml + connections.yaml + config.yaml.
- scripts/e2e.mjs: helpers readRev, saveUser, saveSettings, adminSession, createScratch, removeScratch; SCRATCH user and secrets.scratchPassword/scratchNewPassword.
  Fixed to send rev/basis: configureGateway (rev 0, 200), check 11 (saveUser), 12 and B3 (saveSettings), 18 (schedule rev 0 -> keeps its rev for the DELETE ?rev=, import takes the basis of a fresh preview of the saved file).
  New checks 20 (two sessions, stale with current rev, reload then saves), 21 (delete in one session, other's save and delete are not_found), 22 (preview, other session creates a user, import stale naming users as moved, new preview then applies),
  23 (own password change while admin holds the rev: admin save 200, rev unchanged, new password signs in, old does not). They run between 18 and 19 so 19's audit check sees their writes.
- tests/build/e2e-lib.test.ts: tests for wrote in audit parsing/auditMissing, wroteFile, listedRev, refusalProblem, basisMoved.

## Edits to files that are not mine
- tests/mock-broker/gateway/error-codes.test.ts (C-fake): the backup_unavailable FAULTS row PUT the schedule without rev (would be 400 rev_required, so no schedule and the row would get 404). Added `rev: 0` to that body.
  Also: stale/exists/rev_required are now pinned by the goldens, so the test's "placed once" rule takes them from GOLDEN (their FAULTS rows stay as "sends once armed" tests). No change needed there.

## Deviations
- cases.json was edited textually (a script, kept in the scratchpad), not regenerated: the owner may run `go test -run Contract .` first; if it fails, the diff names the step. Do not run `-update` blindly: it would reflow the whole file and bake in whatever the real gateway answers.
- Spec 5.3 "Remove TOTP" case omitted (TOTP out of scope).
- Settings stale-after-save uses the start-of-case token (a genuine "read before another admin saved") rather than a literal.
- Basis users/connections are literal numbers (seed seq 1), settings is the token; skipped-section case deliberately sends a stale users basis.

## Both-gateway order facts used (all agree, no gateway edit needed)
422 body checks -> rev_required -> (gate, caller, disk) -> exists/not_found -> stale -> cross-record. Settings: decode -> rev_required -> disk -> stale -> validation. Import: choices -> file/passphrase 422 -> basis rev_required -> disk -> stale (non-skipped only).
Fake users PUT answers for a rev the body leaves as a string/negative/fraction: rev_required (same as Go bodyRev).

## Unfinished / unverifiable by reading
- Not compiled/run. Most likely first-run failures: a golden step where the real and fake gateways differ in a corner I did not trace (e.g. restartRequired for settings-only import, schedule PUT 422 ordering with rev 0);
  e2e check 22/23 assumptions (a merge import of a fresh export reports signedOut false; an admin-created user signs in with 303 to /).
- docs mention check counts (contributing.md says checks 1-19 style lists): docs agent.

## NEEDED FROM OTHERS
- Docs agent: e2e checks 20-23 and the scratch user e2e-scratch; contract tokens "<settings-rev>" / "<settings-rev-at-start>" and the "<rev>" normalisation (docs/developer-guide or contributing: how to add a contract case).
