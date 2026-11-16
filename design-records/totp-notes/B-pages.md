# B-pages notes (go-web-proxy/pages.go, pages/login.html, pages_test.go). Nothing was compiled or run.

## Routes (authPages.ServeHTTP; main.go routing is A1's)
- POST /login: after the password matched, signinNeed(user) = need(live.twoFactor(), isAdmin, enrolled).
  "" -> as before. stageCode -> ticket, 303 /login/code[?next=]. stageEnrol -> ticket, 303 /login/two-factor[?next=].
  The browser's old session is dropped (and its cookie cleared); its old ticket is replaced. No audit line, failure count kept.
- GET /login/code: code ticket else 303 /login. POST /login/code: form fields `code`, `next`.
- GET /login/two-factor: enrol ticket -> enrol page; signed in (not mustChange) -> setup page; mode off -> 404 "Two-factor sign-in is not in use."; else 303 /login.
- POST /login/two-factor: fields `step` (verify | confirm; anything else 400), `next`; verify: `password`, `code` (only when enrolled); confirm: `code`.
  verify answers 200 with the enrol page and a setup ticket (cookie __Host-smu-signin). confirm answers 200 with the recovery page.
- Stable ids: `<code id="two-factor-secret">` (8 groups of 4), `<ol id="recovery-codes">` with `<li>` (XXXX-XXXX-XXXX-XXXX), `<a id="two-factor-continue">`.
- Template modes added: code, setup, enrol, recovery. pageData gained Enrolled, Secret, Note, QR (template.HTML), Codes, Continue.

## Types and helpers added (pages.go; do not redeclare)
- authPages.totp *totpGuard (made in newAuthPages). The reset handler (managed.go) must call `forget(user)` on THIS guard:
  managed_routing.go buildManagedRoutes has `pages` and the api handler; wire it (e.g. a field on managedHandler set from pages.totp).
- codeURL, twoFactorURL, twoFactorTitle; (p) startTicket, enrolRefused, takeTurn + stepAnswers, spendCode, twoFactorInUse, enrolData,
  showCode, submitCode, showTwoFactor, submitTwoFactor, submitSetup, submitConfirm, signinNeed, onwardURL, sessionOpened;
  func twoFactorRefusal(err) (status, code, msg).
- submitLogin's tail now uses sessionOpened (throttle.loginSucceeded, session cookie, signin ok audit, log, client watch) and onwardURL; behaviour unchanged.

## Behaviour pinned
- Code step: a replayed or wrong code, or a recovery code not in the list: 401 "The code is not correct.", failure counted, audit signin refused bad_code (no actor). Ticket stays (retry).
  Ok: ifUnchanged(user, ticket.hash) opens the session, ticket ended, audit signin ok ("<u> signed in" or "... with a recovery code (N left)"; "; a password change is required" appended when forced).
  Account changed / two-factor removed since the password step: ticket ended, 401 generic login page, audit signin refused account_changed. Store failure on a recovery code: 503, audit unavailable.
- Confirm: the code is checked with totpVerify (NOT the guard: the new secret has no history); after the store write the guard is forget()+check()ed so the confirming code cannot also sign in.
  An enrol ticket is refused (409 account_changed) when the user already has two-factor; a setup ticket needs the same signed-in browser (else ticket dropped, 303 /login).
  setTOTP's committed hook: creates the session (enrol only), writes audit twofactor.enrol ok with Wrote users.yaml+seq (Actor = the user). After it: dropOthers(user, this browser's id), ticket ended, enrol stage also writes signin ok (after the commit), recovery page 200.
  Refused audit: twofactor.enrol refused with codes bad_code, bad_credentials (verify: wrong password or code), throttled, unavailable, account_changed, audit_unavailable, store_changed_on_disk, store_write_failed, server_error; msg "<u> could not set up two-factor sign-in: <code with spaces>".
- Verify (signed in): password first, then (when enrolled) the code or a recovery code (a wrong password never spends a recovery code). One message for either: "The password or the code is not correct." The throttle failure count is cleared only when confirm succeeds.
- The fake (pages.ts) should match these texts, statuses, ids and audit lines.

## Removed or renamed: nothing.
