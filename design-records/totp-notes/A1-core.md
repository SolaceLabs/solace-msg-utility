# A1-core notes (Go core: totp.go, tickets, setting, audit names). Nothing was compiled or run.

## totp.go (package main, go-web-proxy)
- Modes: consts twoFactorOff/Optional/Admins/Mandatory = "off"/"optional"/"admins"/"mandatory".
  checkTwoFactor(v) (string, error) ("" -> "off"; bad value -> error naming key, value, choices).
  twoFactorOrDefault(v) string ("" -> "off").
- Stages (also ticket stages): stageCode="code", stageEnrol="enrol", stageSetup="setup".
- need(mode string, isAdmin, enrolled bool) string -> "" (nothing) | stageCode | stageEnrol.
- totpStepAt(time.Time) int64; totpShaped(s) bool (exactly 6 ASCII digits: route code vs recovery).
- totpCode(secret string, step int64) (string, error); totpVerify(secret, code string, now time.Time) (step int64, ok bool).
- Replay guard: g := newTOTPGuard() (*totpGuard, one per gateway, hold it in authPages);
  g.check(user, secret, code string, now time.Time) bool  (verify + record in one lock; use it for sign-in AND for the
  enrol/setup confirm; the step is used up even if a later store write fails); g.forget(user) (call after a secret is
  replaced or removed so the new secret's steps are not compared with the old one's). Key by the stored username.
- newTOTPSecret() string (32 chars base32); totpURI(user, secret) string; groupSecret(secret) string ("ABCD EFGH ...").
- Recovery: recoveryCount=10; newRecoveryCodes() []string (normalised, 16 chars); formatRecoveryCode(c) "XXXX-XXXX-XXXX-XXXX";
  normaliseRecoveryCode(s); hashRecoveryCode(s) (normalises first; lower hex sha256); hashRecoveryCodes([]string) []string;
  recoveryIndex(stored []string, hash string) int (-1 when absent; constant time over the list).
- qrSVG(text string) (template.HTML, error). Inline <svg viewBox="0 0 S S" width/height=S*6 role="img" aria-label=...>,
  S = modules + 8. Error only from qr.Encode (text too long).

## Setting login.twoFactor
- fileLogin.TwoFactor (yaml/json `twoFactor`), config.twoFactor (string, "" reads as off), liveSettings.twoFactor,
  reader: lv.twoFactor() string (call at each sign-in). loginLimits is unchanged.
- Start: toConfig refuses a bad value (error text names "login.twoFactor", the value, the choices).
  Settings save: 422 invalid, field "login.twoFactor" (checkSettings, before toConfig).
- defaultConfig().twoFactor = "off"; loadConfig copies it; no env var. config.yaml header comment lists the key.
- Routing: newRootHandler (main.go) now sends /login/code and /login/two-factor to managedRoutes.pages.

## Tickets (session.go)
- const signinCookie = "__Host-smu-signin"; ticketTTL = 10 min (from create, a lookup does not extend it).
- type ticket{ user, stage, hash string; mustChange bool; secret string; created time.Time }.
- type signinTickets; the table is s.tickets on *sessions (made by newSessions, so no signature changed):
  id := p.sessions.tickets.create(ticket{...})  (sets created, sweeps expired, replaces nothing: the caller drops the
  browser's old ticket first with tickets.drop(oldID));
  tickets.lookup(id) (ticket, bool); tickets.drop(id); tickets.dropUser(user);
  tickets.fromRequest(r) (activeTicket{id string; ticket}, bool).
- Cookie helpers: setSigninCookie(w, id), clearSigninCookie(w) (HttpOnly, Secure, SameSite=Strict, Path=/, no Max-Age).
- sessions.dropUser and sessions.dropOthers(user, keep) now ALSO drop that user's tickets (one call revokes both).
  dropOthers drops ALL the user's tickets, the caller's own included.

## audit.go
- consts auditTwoFactorEnrol = "twofactor.enrol" (category auth), auditTwoFactorReset = "user.twofactor.reset"
  (category admin), auditBadCode = "bad_code" (the Code on refused signin / twofactor.enrol).
- Messages: signedInMsg(user), signedInRecoveryMsg(user, left int), twoFactorEnrolMsg(user string, again bool).
- The reset message comes from the auditPhrases table in managed.go (not mine): see "must do" below.

## Test helpers added (do not redeclare)
- totp_test.go: totpVectors, loadTOTPVectors(t), qrRun. session_test.go: newTestTickets().
- testdata/contract/totp.json shape: {"_comment", "secret": "<base32>", "vectors": [{"time": N, "code": "NNNNNN"}]}.

## Removed or renamed: nothing. configfile_test.go fullConfigYAML gained `twoFactor: admins` (and the want in
TestDecodeConfigFile_Valid); main_test.go routing map gained the two new paths.

## Next agents must do
- go.mod now requires rsc.io/qr v0.2.0; go.sum is missing it: the owner runs `go mod tidy` in go-web-proxy.
- managed.go auditPhrases: add auditTwoFactorReset: {"reset two-factor sign-in for {t}", "reset two-factor sign-in for {t}"}
  (and route DELETE /managed/users/{name}/totp through h.audited(fixedAction(auditTwoFactorReset), ...)).
- backup.go readBackup: after the onFailure line add `doc.Settings.Login.TwoFactor = twoFactorOrDefault(doc.Settings.Login.TwoFactor)`
  so an old backup previews as no change (settingsChanges is reflect-based and needs nothing else).
- proxy.go: the Direct relay's dropSessionCookie (Cookie, line ~313) and the Set-Cookie filter (~338) must also strip
  signinCookie (`name == sessionCookie || name == signinCookie`), plus their tests.
- logging.go (~line 148) startup settings log: add "login.twoFactor", cfg.twoFactor.
- contract seed.json / cases.json: login gains "twoFactor": "off" (GET settings answers carry it).
- Pages: respond to /login/code and /login/two-factor in authPages.ServeHTTP.
