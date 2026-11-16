# G-contract notes (contract data, fake-side tests, e2e). Nothing was compiled or run.

## Contract data (go-web-proxy/testdata/contract/)
- seed.json: settings.login gains "twoFactor": "off" (must equal both gateways' default; TestContract_SeedSettingsAreTheGateways and
  tests/mock-broker/gateway/contract.test.ts prove it).
- cases.json (edited by a script on the text, formatting kept; 69 -> 73 cases):
  - every /managed/me body gains "twoFactor": { "mode": "off", "enrolled": false } (8 bodies, one in the expanded style);
  - every user row of GET /managed/users gains "twoFactor": false (7 rows); both GET /managed/settings bodies that show login
    (3, one expanded) gain "twoFactor": "off".
  - new cases (all at the end of the file):
    1. "users: a reset of two-factor is for administrators, and an unknown user is not_found": no session 401 unauthenticated;
       viewer 403 forbidden; admin on ghost 404 not_found. (DELETE /managed/users/<name>/totp)
    2. "users: a reset for a user without two-factor changes nothing, the rev and the sessions included": admin DELETE viewer/totp
       -> 200 {"rev":1}; viewer /managed/me still 200; admin PUT viewer at rev 1 still saves (rev 2).
    3. "settings: each login.twoFactor mode is saved and applies to the next profile": PUT optional, admins, mandatory, off each
       200 {"restartRequired":[],"rev":"<rev>"}, each followed by admin /managed/me showing twoFactor.mode.
    4. "settings: a login.twoFactor that is not a mode is refused with its field, and nothing is saved": "sometimes" and "on" ->
       422 {"error":"invalid","field":"login.twoFactor","reason":"key \"login.twoFactor\" has invalid value \"<v>\": must be \"off\", \"optional\", \"admins\" or \"mandatory\""};
       then /managed/me still shows mode off.
- contract_test.go and contract.test.ts needed NO change (both are data driven).
- If a golden disagrees, look first at: (a) the 422 reason text and field of a bad login.twoFactor (go: settings.go checkSettings +
  totp.go checkTwoFactor; fake: settings.ts ~line 278); (b) whether the reset of a user WITHOUT two-factor answers 200 {"rev": current
  rev} with no rev move and keeps sessions (go: store.go clearTOTP + managed.go resetTwoFactor; fake: router.ts resetTotp);
  (c) key placement does not matter (DeepEqual), only presence: me.twoFactor, users[].twoFactor, settings.login.twoFactor.
  Regenerate with `go test -run Contract -update .` in go-web-proxy only after confirming the fake agrees with the Go change.

## Fake-side tests
- routes.test.ts: the DELETE /managed/users/{name}/totp row now calls createUserMgmtService().resetTwoFactor('viewer') (the route scan
  reads `${userPath(username)}/totp` from the service; needs W-browser's resetTwoFactor as is).
- error-codes.test.ts: new test "answers a reset of an unknown user's two-factor with a code the app has a message for" (404 not_found in
  MANAGED_ERROR_CODES). No new error code exists (bad_code is audit-only), so the placement lists are unchanged.
- seed.test.ts: new test "starts with two-factor sign-in off and nobody enrolled..." (seed login.twoFactor off, gw.settings.current(),
  no listed user twoFactor, gw.store.listTotp() empty, every demo account signs in to a session, no step).

## e2e-lib.mjs (new exports)
- SIGNIN_COOKIE ('__Host-smu-signin'); signinCookieProblems(lines) (one cookie, Secure, HttpOnly, SameSite=Strict, Path=/, no Domain,
  no Max-Age/Expires); sessionCookieProblems keeps its text (now built on the same internal cookieProblems).
- listedRow(text, list, key, name) -> row | null.
- base32Decode(text) -> Buffer; totpStep(ms); totpCode(secret, step); totpAt(secret, seconds); TOTP_STEP_SECONDS;
  freshTotp(secret, nowMs, lastStep = -1) -> { code, step } | null (null: wait for the clock); wrongTotp(secret, nowMs) -> 6 digits
  that are none of the codes of steps now-2..now+2.
- twoFactorSecretFromPage(html) -> 32-char secret | null (reads <code id="two-factor-secret">, 8 groups of 4, single spaces);
  recoveryCodesFromPage(html) -> string[] (<li> of <ol id="recovery-codes">); recoveryCodeProblems(codes) -> '' | reason (10 distinct
  XXXX-XXXX-XXXX-XXXX, alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789; never repeats a code); continueLinkFromPage(html) -> href | null.
- auditMissing(entries, { user, settingsKeys, twoFactorUser? }): with twoFactorUser it also wants an ok twofactor.enrol (target = that
  user, wrote users.yaml with seq), an ok user.twofactor.reset (actor 'admin', target = that user, wrote users.yaml with seq) and a
  refused signin with code bad_code. parseAuditLog is unchanged (it never limited the action names).
- tests/build/e2e-lib.test.ts reads go-web-proxy/testdata/contract/totp.json ({secret, vectors[{time,code}]}).

## e2e.mjs: checks 24-27 (after 23, before 19), on the scratch user
- 24 optional: set up on /login/two-factor (wrong password refused with no secret and no ticket; secret read off the page; wrong code
  refused with the same secret and nothing stored; right code -> recovery page: 10 codes, Continue = '/'; other session 401, this one
  200 with me.twoFactor.enrolled; GET /login/two-factor again asks for a code and lists none).
- 25: password sign-in -> 303 /login/code, no session cookie, ticket cookie attributes; wrong code 401 "The code is not correct.";
  right code 303 / with a session cookie; ticket cookie gone; the same code from a second sign-in 401.
- 26: recovery code[0] signs in once, again 401.
- 27 mandatory: recovery code[1] signs in; DELETE .../totp without a session 401; admin reset 200 with a rev above the listed rev, list
  shows twoFactor false at that rev, the user's session 401, a second reset 200 at the same rev, unknown user 404 not_found; a new
  password sign-in -> 303 /login/two-factor with a ticket and no session; the page shows a secret. Mode back to off in its finally.
- Outer finally: mode back to off (only when the harness last saved something else) and the scratch user removed.
- Masking: values learned (secret, grouped secret, recovery codes formatted and plain) live in `twoFactor`, masked by say() and swept in
  check 17 (gateway log and audit log); NOT in check 13's sweep, which runs earlier. Sign-in ticket cookie values are masked and swept
  in check 17 like session cookies. signIn() is unchanged and still right for users without two-factor.
- Check 19 passes twoFactorUser: SCRATCH to auditMissing; check 17 and 19 titles name the new content; header comment says 1-27.
- Real-gateway assumptions the first e2e run tests: sign-in at password step answers 303 Location /login/code (query only when next is
  not /); set-up verify answers 200 with a Set-Cookie for the ticket; bad set-up password is 401 and sets no ticket; the confirm
  recovery page carries href="/".

## Next agents / owner
- docs/contributing.md (not mine): checks 24-27 in the End-to-end run section; test-report.md ledger.
- scripts/dev.* need nothing.
