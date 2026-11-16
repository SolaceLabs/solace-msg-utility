# Two-factor sign-in (TOTP): pinned design, 2026-11-15

Owner decisions (question batch, 2026-11-15):
- TOTP only. Passkeys are dropped from the plan.
- One app-wide setting, default off: `off | optional | admins | mandatory`.
- The QR code is drawn by the gateway with the pinned Go library `rsc.io/qr` v0.2.0.
- Lost device: an administrator can reset a user's two-factor, and every user gets 10 one-time recovery codes at enrolment.
- A signed-in user can set two-factor up again (new phone) with their password and a current code or a recovery code.
- Enrolling, or setting up again, ends the user's other sessions.
- Demo: full behaviour, but the codes are mock numbers; the Demo controls panel gets an "Authenticator" that shows them.

Everything below is pinned. Every agent builds exactly this. Where it is silent, follow the existing code's pattern
(own password change in pages.go, the single writer in writer.go and store.go, the audited wrapper in managed.go).
House rules: plain ASCII in everything written; secrets (the TOTP secret, recovery codes, codes typed) are never logged
and never appear in an audit line or an error; no gate is ever run by an agent (no go, npm, tsc, vitest, docker, git
mutations); `graphify query "<question>"` before raw grep (a hook enforces it).

## T1. The setting
- Key `login.twoFactor` (fileLogin gains `TwoFactor string` with yaml/json tag `twoFactor`). Values `off` (default, and
  the value of a config.yaml or backup without the key), `optional`, `admins`, `mandatory`. Live: read at each sign-in.
  No environment variable. A bad value is refused like `audit.onFailure` (start: the key and value named; settings
  save: 422 invalid, field `login.twoFactor`).
- One rule, used by both gateways: need(mode, isAdmin, enrolled) is
  - `off`: none (enrolled or not; stored secrets are kept, nobody is asked)
  - `optional`: `code` when enrolled, else none
  - `admins`: `code` when enrolled; `enrol` when not enrolled and an administrator; else none
  - `mandatory`: `code` when enrolled, else `enrol`

## T2. TOTP
- RFC 6238: HMAC-SHA-1, 6 digits, 30 s step, T0 = 0. Accepts the steps now-1, now, now+1.
- Replay: a step at or below the user's last accepted step is refused. The last step is kept in memory per user and is
  lost on restart. Compare in constant time.
- Secret: 20 random bytes, shown and stored as base32 (RFC 4648 alphabet, upper case, no padding: 32 characters).
- otpauth URI: `otpauth://totp/Solace%20Message%20Utility:<username>?secret=<S>&issuer=Solace%20Message%20Utility&algorithm=SHA1&digits=6&period=30`
  (username percent-encoded).
- Shared vectors file `go-web-proxy/testdata/contract/totp.json`: the RFC 6238 SHA-1 vectors, ASCII secret
  `12345678901234567890`, as `[{ "time": 59, "code": "287082" }, { "time": 1111111109, "code": "081804" },
  { "time": 1111111111, "code": "050471" }, { "time": 1234567890, "code": "005924" },
  { "time": 2000000000, "code": "279037" }, { "time": 20000000000, "code": "353130" }]` plus the secret in base32
  (`GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`). The Go tests and the e2e helper tests both read it.

## T3. Recovery codes
- 10 per enrolment. Each is 16 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, shown as `XXXX-XXXX-XXXX-XXXX`.
- Normalise before hashing: upper case, hyphens and spaces removed. Stored as lower-case hex SHA-256 of the normalised
  code. Shown once, on the page that follows enrolment; never again.
- One use each: a used code is removed from the record (a commit: seq moves, rev stays).
- The `code` field at sign-in takes either: exactly 6 digits is a TOTP code, anything else is tried as a recovery code.
- Setting up again replaces the secret and all recovery codes in one commit.

## T4. Store (users.yaml) and the rev rule
- `userRec` gains `TOTP *userTOTP` with yaml tag `totp,omitempty`; `userTOTP{ Secret string (yaml secret);
  Recovery []string (yaml recovery) }`.
- Load check: a secret must be 32 base32 characters and every recovery entry 64 lower-case hex characters, else the
  gateway refuses to start, naming the user and the rule (never the value).
- The user list view gains `twoFactor` (true when TOTP is set), so `sameUserView` compares `TOTP != nil`.
  - enrol (off to on) and an administrator's reset (on to off): rev moves
  - set up again (on to on) and a used recovery code: seq moves, rev stays
- An administrator's PUT never carries or clears it: `saveUser` keeps the stored TOTP of an existing user, as a blank
  password keeps the hash. A PUT body with `twoFactor` or `totp` is an unknown field (400, as the strict decode does).
- Field-scoped writes (no rev sent; inside the lock they set only their own fields; all through `writer.Do`):
  - `setTOTP(ctx, username, secret, recovery, expect, committed)`: `expect` is the password hash the password check
    saw, as `setPassword`; `errUserNotFound`, `errAccountChanged`. `committed` runs under the lock (session, audit).
  - `useRecoveryCode(ctx, username, hash) (used bool, left int, err)`: removes the hash when present.
  - `clearTOTP(ctx, caller, username, committed ...func()) (rev int, removed bool, err)`: administrator; caller
    re-check; `errNotFound`. No commit when there was nothing to remove.
- Backup: an export carries `totp` (the file is passphrase-sealed), an import restores it, and `sessionEnders` also
  names a user whose two-factor was added, removed or replaced.

## T5. Sign-in tickets (never sessions)
- A half-finished sign-in is a ticket, not a session: no session exists until every step has passed, so nothing that
  checks sessions needs to learn a new state.
- In-memory table beside the sessions (same file, same style): id of 32 random bytes; fields user, stage
  (`code` | `enrol` | `setup`), hash (the password hash that was checked), mustChange, secret (the pending new secret
  for `enrol` and `setup`), created. TTL 10 minutes, swept on create. `dropUser` also drops that user's tickets.
- Cookie `__Host-smu-signin`: HttpOnly, Secure, SameSite=Strict, Path=/, no Max-Age. Cleared when the ticket ends.
- A ticket grants nothing but its own page.

## T6. Pages (go-web-proxy/pages.go, pages/login.html; the fake's pages.ts)
The page content policy stays as it is (no script, no image source): the QR code is inline SVG markup.

- POST /login, after the password matched: `need` (T1) decides.
  - none: exactly as today.
  - `code`: no session. The previous session of this browser ends. Create a ticket (stage code), set its cookie,
    303 to `/login/code` (keeping `next`). No audit line yet; the throttle's failure count is not cleared yet.
  - `enrol`: the same with stage enrol and `/login/two-factor`.
- GET /login/code: needs a `code` ticket, else 303 to /login. Form: field `code`, hidden `next`.
- POST /login/code: the sign-in throttle applies as for a password (same counters; 429 with Retry-After when blocked).
  - valid TOTP (not replayed) or a recovery code: create the session through `ifUnchanged(user, ticket.hash)` (an
    account that changed meanwhile is refused as today), set the session cookie, end the ticket, clear the throttle
    count, audit `signin` ok (message `<user> signed in`, or `<user> signed in with a recovery code (N left)`), then
    303 to the password page when mustChange, else to `next`.
  - else: count a failure, audit `signin` refused with code `bad_code`, 401, the form again with
    "The code is not correct."
- GET /login/two-factor:
  - an `enrol` ticket: the enrol page (QR, the secret in groups of four, field `code`, hidden `step=confirm`).
  - a session (not mustChange) while the mode is not `off`: the setup page: field `password`, and field `code` when
    the user is already enrolled, hidden `step=verify`.
  - a session while the mode is `off`: 404 message page "Two-factor sign-in is not in use."
  - neither: 303 to /login.
- POST /login/two-factor, `step=verify` (signed in): check the password (and the code or a recovery code when
  enrolled) with the throttle of the own-password change; wrong: 401 with the form again and one message for either
  ("The password or the code is not correct."). Right: create a `setup` ticket with a new secret and answer 200 with
  the enrol page (QR, `step=confirm`).
- POST /login/two-factor, `step=confirm` (an `enrol` or `setup` ticket): the code must be a valid TOTP for the
  ticket's secret. Wrong: failure counted, audit `twofactor.enrol` refused `bad_code`, 401, the same page and secret
  again. Right: make 10 recovery codes, `setTOTP`, and in its committed hook open the session (enrol) and write the
  audit line; then end the user's other sessions (keep this browser's), end the ticket, and answer 200 with the
  recovery page: the 10 codes, a sentence that they are shown once, and a Continue link (to the password page when
  mustChange, else `next`).
- Page modes of the template: `login`, `password`, `message` (today), plus `code`, `enrol`, `setup`, `recovery`.
- QR: `qr.Encode(uri, qr.M)` from `rsc.io/qr`; inline SVG, one unit per module, a 4-module quiet zone, black on white,
  `shape-rendering="crispEdges"`, `role="img"`, `aria-label="QR code for your authenticator app"`.
- No self-service removal: only an administrator removes two-factor.
- Stable hooks for tests and the e2e, the same in both gateways: the form field names above (`code`, `password`,
  `step`, `next`); the enrol page shows the secret as `<code id="two-factor-secret">` (groups of four characters
  separated by single spaces); the recovery page lists the codes as `<li>` items of `<ol id="recovery-codes">`; the
  Continue link is `<a id="two-factor-continue">`.
- Order with a forced password change: the two-factor steps come first (they happen before the session exists), then
  the session opens with mustChange and the password page follows.

## T7. Managed API
- GET /managed/users: each row gains `"twoFactor": true|false`.
- GET /managed/me gains `"twoFactor": { "mode": "<login.twoFactor>", "enrolled": true|false }`.
- DELETE /managed/users/{name}/totp: administrators only, audited as `user.twofactor.reset`. 404 `not_found` for an
  unknown user. Otherwise 200 `{"rev": N}`: the user's current rev, moved only when two-factor was set. When it
  removed something it ends that user's sessions and tickets. No rev is sent. The other refusals are those of every
  write (the in-lock caller re-check, `store_changed_on_disk`, `store_write_failed`, `audit_unavailable`). Its ok audit
  line is written inside the transaction (the `committed` hook), with `wrote` when a commit happened.
- GET and PUT /managed/settings carry `login.twoFactor`.
- Audit actions: `twofactor.enrol` (category auth; target the user; message `<user> set up two-factor sign-in` or
  `<user> set up two-factor sign-in again`; `wrote` users.yaml and its seq), `user.twofactor.reset` (category admin;
  message `<admin> reset two-factor sign-in for <user>`), and the code `bad_code` on refused `signin` and
  `twofactor.enrol` entries.

## T8. Admin console and app
- User Management: a column "Two-factor" (On / Off). A row action "Reset two-factor", shown when On: a confirm
  dialog, then the DELETE; on success a toast and the list reloads; `not_found` shows the deleted-by-someone-else
  message (src/core/admin-conflict.ts).
- Gateway Settings: a select for `login.twoFactor`: Off / Optional / Administrators must use it / Everyone must use it.
- The account controls (src/modules/connections/account.ts, beside Change password) and the solAdmin sign-in module
  (src/modules/admin-login, with `?next=/solAdmin`): a link "Two-factor sign-in" to `/login/two-factor`, shown when
  `me.twoFactor.mode` is not `off`.
- The managed profile / me type gains `twoFactor`.

## T9. Demo (the in-browser fake gateway and the Demo controls)
- The fake answers the same routes, pages, states and audit-free rules as the real gateway.
- Its codes are mock numbers, not TOTP: `mockCode(secret, step)` is the FNV-1a 32-bit hash of the text
  `<secret>:<step>` modulo 1 000 000, zero-padded to 6 digits, with step = floor(now / 30 s). It accepts step-1,
  step and step+1 and applies the same replay rule.
- The enrol page shows a decorative placeholder where the QR code would be, the secret, and the sentence
  "In this demo, open Demo controls > Authenticator for the code."
- Demo controls gain an "Authenticator" section: every account that has a secret (enrolled, or pending in a ticket)
  with its current code and the seconds left in the step. Recovery codes are random and work as in the real gateway.
- The demo seed is unchanged: nobody enrolled, `login.twoFactor: off` (the seed must equal the gateway's defaults).
  A visitor turns it on in Gateway Settings.
- The fake's backup reader accepts `totp` on a user; its backups carry it.

## T10. Contract and e2e
- Contract cases (the JSON API only; both gateways replay them): the user list rows carry `twoFactor: false`; `me`
  carries `twoFactor`; a reset of an unknown user (404) and of a user without two-factor (200, the rev unchanged);
  a settings save of each `login.twoFactor` value and a bad value (422). `seed.json` gains `login.twoFactor: off`.
  The enrolled paths are covered by each gateway's own tests and by the e2e.
- e2e (scripts/e2e.mjs, helpers in scripts/e2e-lib.mjs with tests in tests/build/e2e-lib.test.ts): a TOTP helper for
  Node (HMAC-SHA-1), tested against the shared vectors; checks 24 to 27, run after 23 and before 19, on the scratch
  user: (24) with the mode `optional` the user sets two-factor up on /login/two-factor (the secret is read from the
  page), gets 10 recovery codes, and their other session ends; (25) the next sign-in stops at /login/code with no
  session cookie, a wrong code is refused, the right one signs in, and the same code again is refused; (26) a
  recovery code signs in once and not twice; (27) with the mode `mandatory` a user without two-factor is sent to
  enrol, an administrator's reset shows Off in the list and ends the user's sessions, and the mode goes back to `off`.
  Check 19 then also requires the `twofactor.enrol` and `user.twofactor.reset` entries.

## T11. Docs (same change)
provisioned-mode.md (a section "Two-factor sign-in": the four modes with a recommendation, enrolling, the code page,
recovery codes, a lost phone, the administrator's reset, the gateway's clock must be right, backups carry the secrets),
user-guide.md, architecture.md (tickets, TOTP, the store field, the rev rule, the field-scoped writes), developer-guide.md,
deployment.md (the setting's row; the new dependency), demo.md (the mock authenticator), contributing.md (checks 24-27),
test-report.md (a ledger entry), README.md. Each doc's Contents list must equal its headings
(tests/build/docs-links.test.ts).

## T12. The dependency
- go-web-proxy/go.mod gains `rsc.io/qr v0.2.0` in the direct require block. go.sum is the owner's to produce
  (`go mod tidy` in go-web-proxy); no agent runs it. API: `qr.Encode(text string, level qr.Level) (*qr.Code, error)`,
  levels `qr.L`, `qr.M`, `qr.Q`, `qr.H`; `Code.Size int` (modules per side) and `Code.Black(x, y int) bool`.

## T13. Owner's change after the first build (2026-11-15): there is no `off`
This section overrides every line above that mentions `off`. The first build is committed (dbe5d76); this is a
follow-up change on top of it.
- `login.twoFactor` has three values: `optional` (the default, and the value of a config.yaml or a backup without the
  key), `admins`, `mandatory`. `off` is not a value any more: at start it is refused like any other bad value (the key
  and the value named, with the three values to choose from), and on a settings save it is 422 invalid, field
  `login.twoFactor`.
- The rule: `optional`: `code` when enrolled, else none. `admins`: `code` when enrolled; `enrol` when not enrolled and
  an administrator; else none. `mandatory`: `code` when enrolled, else `enrol`.
- Two-factor is therefore always in use. Remove the "Two-factor sign-in is not in use." page, every guard for it and
  their tests (real gateway and fake). GET /login/two-factor for a session (not mustChange) always shows the set-up
  page; POST verify and confirm have no mode check.
- App: the link "Two-factor sign-in" is always shown to a signed-in user in the account controls and in the solAdmin
  sign-in module; remove the helper that hid it and the now-dead hidden state and their tests. The mode type is
  `optional | admins | mandatory`. The Gateway Settings select has three options: Optional / Administrators must use
  it / Everyone must use it. `me.twoFactor { mode, enrolled }` stays in the API and in the profile type.
- Contract: `seed.json` holds `optional`; every recorded `me` body carries mode `optional`; the settings case saves
  each of the three values, and `off` joins the bad values (422, the mode stays as it was).
- e2e: wherever the run put the mode back to `off` it now puts it back to `optional`; nothing may save `off`.
- Restore semantics are confirmed as built: an import restores two-factor as the file holds it, and a backup without
  the key reads as the default (`optional`).
- An administrator resetting their own two-factor is signed out: confirmed as built.
- Consequence to document: nobody can switch two-factor off from the host any more. A lone administrator who has lost
  both the phone and the recovery codes has no way in through the console.

## L1. Licence notices for the Go code in the image (its own small change)
- The image's gateway binary contains code from the Go standard library (BSD-3-Clause), `gopkg.in/yaml.v3`
  (Apache-2.0 and MIT, with a NOTICE file) and `rsc.io/qr` (BSD-3-Clause). The image already carries the licence files
  of the two JavaScript libraries under the app's `licenses/` directory; the Go ones join them:
  `licenses/go/LICENSE`, `licenses/gopkg.in-yaml.v3/LICENSE` and `NOTICE`, `licenses/rsc.io-qr/LICENSE`.
- In docker/Dockerfile's gateway build stage, copy them from where the toolchain has them, without hard-coding a
  module version: `$(go env GOROOT)/LICENSE` and `$(go list -m -f '{{.Dir}}' <module>)/LICENSE` (after the modules are
  downloaded). A missing file must fail the build, as it does for the JavaScript ones.
- tests/build/vendor-scripts.test.ts (or a sibling in tests/build/) gains a test: every direct requirement in
  go-web-proxy/go.mod (not marked `// indirect`) has its licence copied by the Dockerfile, and so has Go's own, so a
  dependency added later cannot ship without its notice.
- docs/deployment.md says what the image carries.
