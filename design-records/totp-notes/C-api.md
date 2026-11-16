# C-api notes (managed.go, managed_routing.go, backup_api.go + tests). Nothing was compiled or run.

## API shapes
- GET /managed/users rows: userListJSON gains `TwoFactor bool json:"twoFactor"` (u.twoFactorOn()). userJSON/userToOutput unchanged.
- GET /managed/me: now answers meJSON{ *profileResponse (embedded, fields promoted); TwoFactor twoFactorJSON `twoFactor` }.
  twoFactorJSON{ Mode string `mode`; Enrolled bool `enrolled` } (Mode = h.live.twoFactor(), Enrolled from store.twoFactorOf).
  profileResponse itself (store.go) is untouched.
- DELETE /managed/users/{name}/totp: h.audited(fixedAction(auditTwoFactorReset), h.resetTwoFactor). 200 {"rev":N}; 404 not_found;
  the usual write refusals via storeFailed (op "resetTwoFactor"). On removed: sessions.dropUser(name) (ends tickets too) + h.totp.forget(name).
  Ok line: via committed hook (wrote users.yaml+seq) when removed; else recordAdmin writes it without wrote.
- auditPhrases gained auditTwoFactorReset: "reset two-factor sign-in for {t}" (done and attempt).
- PUT /managed/users/{name} untouched: twoFactor/totp stay unknown fields (400 bad_request).

## Wiring
- managedHandler.totp *totpGuard: newManagedHandler makes its own; buildManagedRoutes then sets `api.totp = pages.totp` (one shared guard).
- Import (backup_api.go): the loop over staged.drop also calls h.totp.forget(name). Tickets already end via sessions.dropUser.

## Removed/renamed: nothing.
## Tests added (do not redeclare)
managed_test.go: TestManagedAPI_ListAndMeCarryTwoFactor, _ResetTwoFactor, _ResetTwoFactorRefusals, _ResetTwoFactorStopsTheNextChangeWhenItsAuditLineIsLost, _SaveUserCannotCarryTwoFactor.
managed_routing_test.go: TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard. backup_api_test.go: TestBackupAPI_ImportThatChangesTwoFactorEndsThatUsersSessions.
## Next agents
- Other tests that unmarshal /managed/me strictly or compare the users list JSON exactly must allow `twoFactor`.
- Contract cases (cases.json/seed.json) and the TS service types need the new fields (not mine).
