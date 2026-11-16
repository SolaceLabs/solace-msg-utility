# X-crosscheck: Go side read-through (nothing was compiled or run)

## Fixed
- Name check skipped for IP brokers (security). A1's transport verified in `tls.Config.VerifyConnection` with
  `cs.ServerName` as the name; crypto/tls leaves `ConnectionState.ServerName` empty for an IP host, so a broker reached
  by IP address was never name-checked (the chain still was). Now `newUpstreamTransport(trust)` (proxy.go) sets
  `DialTLSContext` to `dialUpstreamTLS(ctx, dialer, trust, network, addr)`, which handshakes with
  `ServerName: host` and `VerifyConnection -> trust.verify(cs, host)` (tls.go; replaces `trustHolder.verifyConnection`).
  `TLSClientConfig` and `TLSHandshakeTimeout` are no longer set (const `upstreamHandshakeTimeout` bounds the handshake);
  h2 is still offered (`NextProtos`, `ForceAttemptHTTP2`). Nothing else touched the transport's TLS fields.
- Tests: proxy_test.go `TestNewUpstreamTransport` rewritten for the above; new `TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect`
  (proxy_test.go; imports `context`, `net` added); new `TestUpstreamTransport_ChecksAnIPHostAgainstTheCertificateAddresses` (tls_test.go).

## Checked and found sound
- Every changed signature has all callers updated (newManagedHandler, buildManagedRoutes, newManagedRouting, toConfig/secretPaths,
  newUpstreamTransport, recoverDir/sweepLeftoversOf); no reference left to identity, hostOnly, HostOnly, withHostPaths,
  hostOnlyKeyNames or the three fileTLS path fields; no duplicate top-level declaration; imports of tls.go, tls_api.go, restart*.go match use;
  build tags: restart_unix.go (unix) and restart_other.go (!unix) each define `restartInPlace` once; main.go uses it in both builds.
- Test helpers used by the new tests exist (newManagedEnv, withAudit, auditLog.entries/expect/path, startServe, serveRun.base/log/done/result,
  gatewayDir, writeServeConfig, gatewayClient, mustRead, expectLogged, failAfter, crashAfter, stepTemps, stepRename, errorCode).
- Security: key never in an answer, log, audit line or error (parse errors repeat only a block type; X509KeyPair text holds no key bytes;
  the audit detail is subject and expiry, cut to 200 bytes). Pair verified (certificate field, key field, match, validity) before the lock and
  before any write, written as one journaled commit (0644 / 0600). CA names pass `trustNameRE` (no separator, no dot start, .crt/.pem) before
  any path is built; add refuses any existing entry (Lstat, so links and dirs count as taken) and writes through temp + rename; delete needs a
  regular file by Lstat (links and directories are 404). Body cap 64 KiB via decodeJSON. Every route is behind adminOnly and, as everything
  under /managed, the same-origin check in `managedHandler.ServeHTTP`; restart too, and it is audited.
- Concurrency: holders use atomic pointers; trust writers take `trustHolder.mu`, hooks (CloseIdleConnections, safe against requests in
  flight: it only closes idle connections) run after the unlock. Lock order: writer lock -> trust.mu (settings save/import via live.apply);
  tlsManager.mu -> trust.mu; the two outer locks are never nested. No lock is held across the exec: serve returns from
  serveUntilStopped (listener closed, audit log and stores closed by defers) before `p.restart()`.
- Coverage: no added branch found without a test (new dial branches covered by the new tests above).

## Remains / for the owner
- `restartGateway`'s Flush is best effort: the access-log wrapper (`recordingResponseWriter`, proxy.go) has no `Flush` or `Unwrap`, so in the
  real chain `ResponseController.Flush` returns ErrNotSupported (ignored). The 202 still goes out when the handler returns, and Shutdown waits
  for that handler, so the answer is delivered. Left alone: adding Unwrap would change how streaming flushes are logged.
- Replacing a certificate whose file is a single-file bind mount (not a directory mount) fails at the rename (500 tls_write_failed, nothing
  changed); the writable probe only tests the directory. The compose comment should say to mount the directory.
- A1's note names `.verifyConnection`; it is now `.verify(cs, host)`. Docs (architecture.md "holders") must say the transport dials its own TLS.
