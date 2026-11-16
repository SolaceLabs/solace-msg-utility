# A2-tls-api: what is built (nothing was compiled or run)

## Routes (Provisioned mode, administrators only, same origin; all in go-web-proxy/tls_api.go, restart route in managed.go)
- `GET /managed/tls` -> 200 `tlsStateJSON` (A1's type). adminOnly, not audited.
- `POST /managed/tls/certificate/check` body `{certificate,key}` -> 200 `{"certificate":<cert>}`; adminOnly, not audited, writes nothing.
- `PUT /managed/tls/certificate` same body -> 200 `{"certificate":<cert>}`; audited `tls.certificate.replace`.
- `POST /managed/tls/trust` body `{name?,certificate}` -> 200 `tlsStateJSON`; audited `tls.trust.add`, target = file name (the name asked for on a refusal).
- `DELETE /managed/tls/trust/{name}` -> 200 `tlsStateJSON`; audited `tls.trust.remove`, target = name.
- `POST /managed/restart` -> 202 `{"restarting":true}`; audited `gateway.restart`.
- Statuses/codes: 422 `invalid` (field `certificate|key|name`, reason), 409 `tls_read_only`, 409 `exists`, 404 `not_found`, 500 `tls_write_failed` (no cause in
  the body), 400 `bad_request`, 413 `too_large` (64 KiB cap, decodeJSON), 401/403 from the gate. Mapping is `writeTLSFailure` (any manager error that is not
  a named refusal is 500 tls_write_failed).
- Audit msgs: ok `<actor> replaced the gateway certificate (subject <CN..>, expires <RFC3339>)`; `<actor> added the CA certificate file <f>`;
  `<actor> removed the CA certificate file <f>`; `<actor> restarted the gateway`. Refused: `<actor> could not <attempt>: <code>`. The ok line of each write is
  written by the handler (recordOK) once the write happened, before the answer. Subject cut to 200 bytes (`clip`, `auditDetailMax`).
- New `auditCall.detail` (managed.go): text the ok message appends in brackets. `auditWriter.Unwrap()` added so `http.NewResponseController(w).Flush()` works.

## Signatures changed (callers outside my files: none)
- `newManagedHandler(st, ss, th, lv, sf, bk, tm *tlsManager, ep, logger)`; `buildManagedRoutes(cfg, lv, src, h, getenv, now, upstream, tm, logger)`;
  `newManagedRouting(cfg, lv, src, upstream, tm, auditOut, logger)`. `managedHandler` gains `tls *tlsManager` and `restart func()` (default no-op).
- `(*managedRoutes).setRestart(func())`. New consts `auditTLSCertificateReplace`, `auditTLSTrustAdd`, `auditTLSTrustRemove`, `auditRestart` (audit.go).
- Test helpers: `managedEnv.tls *tlsFix` (newManagedEnvFrom builds one per env); `tlsFix` from tls_test.go is reused.

## Restart (restart.go, restart_unix.go, restart_other.go, main.go)
- `process.restart func() error` (main passes `restartInPlace`). `serve(p)` now wraps `serveUntilStopped(p, *bool)`: the old body, plus a third select case on
  the channel from `restartRequester()` (handler -> serve, non-blocking, one pending). After the same Shutdown as SIGTERM and all defers (audit log closed),
  `serve` calls `p.restart()`; a failure is logged ("gateway restart failed ...", ERROR) and returned, so main exits 1. A failed/overrun shutdown returns its
  error and never calls the hook.
- `restart_unix.go` (`//go:build unix`): `restartInPlace` = `syscall.Exec(os.Executable(), os.Args, os.Environ())`, seams `executablePath`, `execProgram`.
  `restart_other.go` (`!unix`): `exitProcess(0)`, seam `exitProcess`.

## Tests
- tls_api_test.go: every route x (no session, plain user) with a body that would succeed; malformed/oversize bodies; GET shape (healthy, unreadable and
  empty CA files, read-only); check; every verification refusal on check and PUT; replace success + audit + no key anywhere; read-only and failed write;
  add (derived name, given name + bundle, every refusal, nothing overwritten, pool unchanged); remove (success, every refusal, links, directories); `clip`.
- restart_test.go: handler order (audit, 202, flush, hook), `setRestart`, `restartRequester`, whole-gateway restart that drains a request in flight and
  calls the hook once with the listener closed, failed hook logs and returns the error.
- NEW test files beyond the list: restart_unix_test.go, restart_other_test.go (build-tagged seams tests). audit_test.go gets one test for the new actions;
  managed_test.go / managed_routing_test.go callers updated.

## What the next agents must do
- Fake gateway (F): same routes, statuses, codes, audit action names and phrases (above); `GET /managed/tls` body shape is `tlsStateJSON`.
- Console/service layer: `ManagedError` codes `tls_read_only`, `tls_write_failed` need stock messages; `exists` and `not_found` already exist or follow the list.
- Docs: audit table in provisioned-mode.md and developer-guide.md gain the four actions; architecture.md (restart sequence, TLS API); contributing/test-report.
- Contract cases for the new routes (non-Go) and e2e checks 28-31 are not mine.
