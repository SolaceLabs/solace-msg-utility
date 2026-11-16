# A2-store notes (store.go, backup.go and their tests). Nothing was compiled or run.

## Types and readers (store.go)
- userRec.TOTP *userTOTP (yaml `totp,omitempty`); userTOTP{Secret string `secret`; Recovery []string `recovery`} (recovery = lower hex SHA-256 hashes).
  Stored values are never mutated in place; listUsers() deep-copies TOTP.
- Load check: validateUsers (so also imports) -> `user "x": two-factor <rule>`; consts totpSecretRule, recoveryHashRule; validateTOTP(userTOTP) error. Never quotes a value.
- userRec.twoFactorOn() bool -- the user list flag (`twoFactor` in GET /managed/users rows; the handler/userToOutput must add it).
- s.twoFactorOf(user) (enrolled, exists bool); s.totpSecret(user) (secret string, ok bool) -- ok false when gone or not enrolled.
- secretOf(*userTOTP) string (backup.go sessionEnders uses it).
- sameUserView compares twoFactorOn(); saveUser sets rec.TOTP = old.TOTP (existing: keeps; new: nil). The PUT body's twoFactor/totp must stay unknown fields (managed.go decode, not mine).

## Writes (all via s.wr.Do; no rev sent)
- s.setTOTP(ctx, username, secret string, recovery []string, expect string, committed func()) error
  recovery = HASHES (caller runs hashRecoveryCodes). Order: disk, errUserNotFound, errAccountChanged (expect = passwordCheck.hash).
  enrol (was off): rev = new seq; set up again: rev stays. seq always moves. committed (single func, must be non-nil) runs under the writer lock after publish.
  Does NOT call s.changed (like setPassword). Caller: end other sessions, g.forget(user), drop tickets.
- s.useRecoveryCode(ctx, username, hash string) (used bool, left int, err error)
  hash = hashRecoveryCode(typed). Order: disk, errUserNotFound. Not present / not enrolled: (false, left, nil), no commit. Used: seq moves, rev stays. No hooks.
- s.clearTOTP(ctx, caller, username string, committed ...func()) (rev int, removed bool, err error)
  Order: checkCaller (errCallerGone/errCallerNotAdmin), disk, errNotFound. Nothing to remove: (current rev, false, nil), NO commit and committed hooks do NOT run
  (the audited wrapper writes its own ok entry then, as when a hook did not run). Removed: rev = seq = new seq, s.changed + committed run under the lock.
  Handler: on removed, drop that user's sessions and tickets (sessions.dropUser does both) and g.forget(user).
  Hook pattern: h.committed(r, call, h.wroteUsers) as the other user mutators.

## Backup (backup.go)
- Export/import need no code: userRec's yaml carries `totp`; stageImport stamps records as before and the load check applies.
- sessionEnders also names users whose secret differs (added, removed, replaced); recovery-only changes do not.
- openBackup: doc.Settings.Login.TwoFactor = twoFactorOrDefault(...) (A1's "readBackup" line; the function is openBackup).
- diffByName/preview: sameRecord yaml-compares the whole record (without rev), so a user whose totp differs is already "changed".

## Test helpers added (do not redeclare)
store_test.go: storeTOTPSecret, storeTOTPSecret2, writerHeld(s), enrolViewer(t, s, secret) []string, usersWithTOTP(t, f, secret, recovery...), err2s(err).
backup_test.go: slicesIndexUser(users, name).

## Removed or renamed: nothing.
## Next agents
- userToOutput / users list handler (managed.go): add `twoFactor: u.twoFactorOn()`; /managed/me twoFactor.enrolled via s.twoFactorOf.
- Tests of other agents that build userRec literals compare with reflect.DeepEqual: TOTP is a pointer, nil by default.
