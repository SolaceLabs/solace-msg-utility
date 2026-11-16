# F-fake notes (the in-browser fake gateway, Demo controls, their tests). Nothing was compiled or run.

## Files
New: src/mock-broker/gateway/authenticator.ts, tickets.ts; src/mock-broker/controls/authenticator.ts.
Edited: gateway/{types,store,settings,backup,router,sessions,index,pages,seed}.ts, pages.css; controls/managed.ts.
boot.managed.ts is unchanged (Page union grew; SNAPSHOT_VERSION stays 2, new snapshot fields are optional).
Tests: new gateway/{authenticator,tickets,two-factor}.test.ts, controls/authenticator.test.ts; edited gateway/{pages,backup,routes}.test.ts,
controls/managed.test.ts, boot.managed.test.ts, demo-flow.test.ts.

## Exports other agents may use
- gateway/authenticator.ts: TWO_FACTOR_MODES, type TwoFactorMode, isTwoFactorMode, twoFactorNeed(mode, admin, enrolled) -> 'none'|'code'|'enrol',
  STEP_MS (30000), stepOf(ms), **mockCode(secret, step) -> 6 digits (FNV-1a 32 of "<secret>:<step>" mod 1e6, zero padded)**,
  acceptedStep(secret, code, nowMs, lastStep|undefined) -> step|null (window step-1..step+1, replay: step must be > last),
  base32, newSecret, groupSecret, newRecoveryCodes (10, 'XXXX-XXXX-XXXX-XXXX'), normalizeRecovery, sha256Hex (sync), hashRecovery,
  SECRET_RULE, HASH_RULE, RECOVERY_COUNT.
- A test derives the current code: `mockCode(secret, stepOf(Date.now()))`.
- types.ts: ManagedProfile (= service profile & { twoFactor: { mode, enrolled } }), GatewaySettings (login gains twoFactor: TwoFactorMode),
  ListedUser (gains twoFactor: boolean), UserRec.totp?: { secret, recovery: string[] (sha256 hex) }, UserTotp, TwoFactorState.
  These are intersections over the service types, so they compile whether or not the service types already carry the fields.

## Gateway API (createGateway result)
- signIn(user, pw) -> PageResult | { ok: true; step: 'code' | 'enrol' } (step: no session opened, a ticket is).
- submitCode(code) -> PageResult (ok: mustChange | not ok: error, signedOut?). codePending() -> boolean.
- twoFactorPage() -> { kind: 'enrol'; secret } | { kind: 'setup'; enrolled } | { kind: 'off' } | { kind: 'login' }.
- verifyTwoFactor(password, code) -> { ok: true; secret } | { ok: false; error; signedOut? }  (step=verify, makes a `setup` ticket).
- confirmTwoFactor(code) -> { ok: true; mustChange; recovery: string[] } | { ok: false; error; signedOut? }  (step=confirm).
- ticket() -> live Ticket | null; tickets (the table); now (the clock, a () => Date); authenticators() -> { user, secret, pending }[].
- snapshot/restore carry tickets, ticketCookie, lastSteps (all optional when restoring).
- store: setTotp(name, totp, expectPassword) 'ok'|'not_found'|'account_changed'; useRecovery(name, hash) -> left|null; clearTotp(name) -> {rev, removed}|null;
  totpOf(name); listTotp(). sessions.dropOthers(user, keepId). Any user-wide sessions.dropUser also ends that user's tickets.
- Router: DELETE /managed/users/{name}/totp (admin only): 404 not_found; 200 {rev}; ends the user's sessions and tickets only when it removed something.
  /managed/me gains twoFactor {mode, enrolled}; /managed/users rows gain twoFactor; PUT /managed/users/{name} still refuses twoFactor/totp (400, strict body).
- Settings: login.twoFactor ('off' default; also for a seed, snapshot or backup without it); bad value -> 422 invalid, field "login.twoFactor",
  reason: key "login.twoFactor" has invalid value "x": must be "off", "optional", "admins" or "mandatory".
- Backup: sealed users carry `totp: { secret, recovery }` (read: absent or null = none; a secret not 32 base32 or a hash not 64 hex = damaged file);
  sessionEnders also names a user whose secret was added, removed or replaced.

## Pages (pages.ts; the fake mirrors the design)
- Page = 'app' | 'login' | 'password' | 'code' | 'two-factor' (what a snapshot/reload restores; the recovery page counts as 'app').
- Paths caught by the link capture: /login, /login/password, /login/code, /login/two-factor.
- Field ids (name = id without "mgw-"): #mgw-username, #mgw-password, #mgw-code; hidden inputs name="step" (value confirm on the enrol page, verify on set-up).
- Stable ids as in the design: <code id="two-factor-secret"> (groups of four, single spaces), <ol id="recovery-codes"> with 10 <li>, <a id="two-factor-continue">.
- Enrol page: placeholder div.mgw-qr (role="img") instead of the QR, and "In this demo, open Demo controls > Authenticator for the code." (also on the code page).
- Copy used (not pinned by the design; the Go pages may align): code page h1 "Two-factor sign-in", button "Verify"; enrol h1 "Set up two-factor sign-in", button "Confirm";
  set-up page h1 "Set up two-factor sign-in" (or "... again" when enrolled), button "Continue", "Code or recovery code"; recovery h1 "Recovery codes";
  off page h1 "Two-factor sign-in" with "Two-factor sign-in is not in use.".
- Messages: "The code is not correct." / "The password or the code is not correct." / sign-in failed text for an account changed meanwhile (back to /login).

## Demo controls
- managedSections now returns [Demo accounts, Authenticator, Gateway events]; the Authenticator lists each enrolled account and each pending ticket secret
  ("<user> (setting up)") with the click-to-copy mock code and "N s" left; a 1 s interval refreshes it only while it is on the page.
- "Sign in as X" lands on navigate('code') or navigate('two-factor') when the setting asks for a step.

## Decisions where the design is silent (also in the result's deviations)
- Enrol/confirm does not record a step (the code that confirmed can sign in in the same 30 s); sign-in, the set-up verify step and a recovery code do. Confirm success clears the user's last step.
- Confirm applies the sign-in throttle (blocked -> the throttle message); failures count per user as for sign-in.
- Ticket field `password` holds the plain password the check saw (the fake keeps plain passwords); the design's `hash`.
- The fake writes no audit lines (it has no audit), so none of the audit actions exist here.

## Must do by others
- routes.test.ts: the row for DELETE /managed/users/{name}/totp calls fetch directly. When the user-management service gets its reset helper, change the row's call to the service.
- Docs (demo.md: the Authenticator and mock codes; test-report.md; architecture.md fake section) are not in this agent's files.
- scripts/check-bundles.mjs is untouched: the new pages have no form action, no script and no external URL.
