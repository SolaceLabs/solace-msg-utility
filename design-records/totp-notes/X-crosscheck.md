# X-crosscheck notes (Go side read as compiler and reviewer). Nothing was compiled or run.

## Fixed
- pages.go submitLogin: an `enrol` ticket was created WITHOUT a secret, so GET /login/two-factor drew a QR for "" and confirm
  would have stored an empty secret. The ticket now gets `newTOTPSecret()` at the password step when stage == stageEnrol.
- totp_test.go: last function closed with `\t}}` on one line (not gofmt); split. Comment "mid-step" for 1700000010 corrected.
- proxy.go: dropSessionCookie and dropSessionSetCookie now also strip `signinCookie` (A1's open item); proxy_test.go rows added
  ("the sign-in ticket too", "a replacement sign-in ticket").
- logging.go: startup line now logs `login.twoFactor` (Provisioned only, with the other login.* keys); logging_test.go wants it
  in the provisioned case and never in the gateway case.

## Checked by reading, no change needed
- Every call vs definition (pages.go, session.go, store.go, managed.go, totp.go, tests), imports, no duplicate top-level name in
  package main (script over all *.go incl. tests), gofmt alignment on changed lines, RFC vectors and the recovery-hash constant
  recomputed with a read-only python script (match).
- Lock order: writer -> store.mu (hooks call sessions.create and store.seqs under the writer lock; ifUnchanged takes store.mu
  then sessions.mu; nothing takes the writer while holding store.mu or sessions.mu).
- Security: no session before the last step; tickets only read by /login/code and /login/two-factor; secret, recovery codes and
  typed codes appear in no log/audit/error (tests assert it); constant-time compares; replay guard; throttle counted on every wrong
  code (code, verify, confirm); saveUser keeps TOTP; every write is writer.Do with tx.check.

## Remaining for other agents (not .go files, so not mine)
- go-web-proxy/testdata/contract/seed.json and cases.json: login gains "twoFactor": "off"; user list rows `"twoFactor": false`;
  /managed/me `"twoFactor": {"mode":"off","enrolled":false}`; reset cases (unknown user 404 not_found, user without 2FA 200 with the
  rev unchanged); settings save of each value and 422 for a bad one. contract_test.go (Go) replays them and will fail until updated.
- go.sum already holds rsc.io/qr v0.2.0 lines (h1 and go.mod); the owner still runs `go mod tidy` to confirm.
- Sign-in page copy/ids are pinned in B-pages.md; the fake (pages.ts) must match texts, statuses, ids and audit lines.

## Risks at first compile or test run
- pages_test.go and store_test.go are large and were read, not compiled: most likely failures are a mismatch in a helper's exact
  text (e.g. "Try again in 30 seconds.", "cannot record changes", "restart the gateway") or a fixture seq/rev assumption (seq 2 at start).
- meJSON embeds the unexported *profileResponse: encoding is fine, decoding into meJSON would fail (nothing decodes it).
