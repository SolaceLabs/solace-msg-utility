# A1-tls-core: what is built (nothing was compiled or run)

## Removed / renamed
- Gone: `fileTLS.CertFile/KeyFile/TrustDir` (now `RemovedCertFile/RemovedKeyFile/RemovedTrustDir *string`, yaml
  `certFile|keyFile|trustDir,omitempty`, `json:"-"`), the three `seedVars` rows, `restartOnlyKeys[].hostOnly`,
  `hostOnlyKeyNames()`, `settingsJSON.HostOnly` (json `hostOnly`), the hostOnly refusal in `checkSettings`,
  `withHostPaths` (backup.go), `identity()`, the three `tls.*` attrs of the start-up log, `newUpstreamTransport(pool, bool)`.
- `restartOnlyKeys` is now just `hosted`. `tls.insecureSkipVerify` is live.
- A settings PUT body that names `tls.certFile|keyFile|trustDir` is 400 `bad_request` (unknown field). GET has none of them.
- `config` keeps `certFile/keyFile/trustDir`, filled from env by `tlsPathsFromEnv()` (configfile.go); `secretPaths` has `tls tlsPaths`;
  `config.secretPaths()` rebuilds it. New consts `defaultCertFile/defaultKeyFile/defaultTrustDir`.
- `configLoad.tlsPathsIgnored []string`; serve logs ONE warn "config.yaml holds TLS paths that differ ..." with `keys=`.
- `fileutil.go`: `recoverDir(dir, bakNames, logger)` and `sweepLeftoversOf(dir, names, logger)`; `recoverDataDir`/`sweepLeftovers` wrap them.

## tls.go (all package main)
- `certHolder`: `newCertHolder(tls.Certificate)`, `.set`, `.get() *tls.Certificate`, `.getCertificate` (the listener's GetCertificate).
- `trustHolder`: `newTrustHolder(pool, skip, logger)` (warns when skip starts true), `.get() trustState{pool,skip}`, `.onChange(func())`,
  `.setPool`, `.setSkip` (warns on false->true, no-op when same), `.verifyConnection`.
- `newUpstreamTransport(trust *trustHolder) *http.Transport` (verification in VerifyConnection; idle conns closed on change). The SEMP relay,
  Direct relay and SMF gate already share that one transport, so all three are live.
- `live.bindTrust(*trustHolder)`; `live.apply` calls `trust.setSkip(cfg.insecureSkipVerify)` (settings save and import both go through it).
- `recoverTLSPair(certFile, keyFile, logger)` runs in serve before the pair loads (only when both are in one directory).
- `tlsManager` built in serve: `tm := newTLSManager(certFile, keyFile, trustDir, certHolder, trustHolder, logger)`; fields `tm.cert`, `tm.trust`.
  Methods (all the API agent needs):
  - `state() tlsStateJSON` = the GET /managed/tls body (`certificate`, `certificateWritable`, `trustWritable`, `trust`).
  - `checkCertificate(certPEM, keyPEM string) (tlsCertJSON, error)` (writes nothing; also fine when read-only).
  - `replaceCertificate(certPEM, keyPEM string) (tlsCertJSON, error)`; audit message: subject + NotAfter from the result, never the key.
  - `addTrust(name, certPEM string) (fileName string, err error)`; `name == ""` derives it. Audit target = returned fileName.
  - `removeTrust(name string) error`. After add/remove the answer is `tm.state()` (200).
  - JSON types: `tlsCertJSON{subject,issuer,names,notBefore,notAfter,sha256,selfSigned,expired}`, `tlsTrustFileJSON{name,certificates,problem}`,
    `tlsStateJSON`. `names`, `certificates`, `trust` are never null.
  - Errors to map: `*tlsInvalidError{Field,Reason}` -> 422 `invalid` (use errors.As; Field is `certificate`, `key` or `name`);
    `errTLSReadOnly` -> 409 `tls_read_only`; `errTLSExists` -> 409 `exists`; `errTLSNotFound` -> 404 `not_found`;
    `*tlsWriteError` -> 500 `tls_write_failed` (no cause in the body). The manager already logs every write failure with its cause
    and the replace/add/remove successes at info; the API need not log them again.
  - One internal mutex serialises the three writers; verification (422) happens before the lock and before the read-only check.
  - Name rule `trustNameRE`; derived name = CN lower-cased, every run of chars other than a-z0-9 becomes one `-`, trim `-`, empty -> `ca`, cut to 64, + `.crt`
    (the fake: its fixed subject "CN=demo certificate" gives `demo-certificate.crt`).

## What the next agents must do
- API agent (managed_routing.go, managed.go, tls_api.go): `serve` now calls
  `newManagedRouting(cfg, lv, configSource{...}, upstream, tm, auditOut, logger)`. Add the parameter `tm *tlsManager` right after `upstream`
  in `newManagedRouting`, pass it through `buildManagedRoutes` as you see fit, and update the callers in managed_routing_test.go.
  No other file of mine calls either function.
- Restart: serve has no restart hook yet (it needs a channel beside `p.signals`, in main.go, which is mine); an orchestrator step must add it
  or give me the shape. Session/ticket reset is the restart agent's.
- Contract goldens (non-Go, `testdata/contract/`): `seed.json` still holds the three keys; `cases.json` bodies of GET /managed/settings carry
  `hostOnly` and the three keys and `restartOnly` is now `["hosted"]`; both gateways must drop them. `TestContract_SeedSettingsAreTheGateways`
  fails until seed.json is edited.
- Fake gateway/TS: settings lose `hostOnly`, `restartOnly` is `["hosted"]`, `tls.insecureSkipVerify` is not pending; the Gateway Settings page
  loses its path fields, the host-only legend, and the "restart" mark on skip-verify.
- Docs/compose/e2e per design A7. e2e `/tls` must be writable; the e2e gateway config must not rely on the three config.yaml keys (use the env vars).

## Tests (all .go, mirroring source)
- tls_test.go: holders, live cert swap on a real listener (open connection keeps its certificate), chain/name verification, skip flag live,
  relay with CA delete/add and no restart, describe/state shape, writable flags and probes, listing, every verify refusal (and no key text in
  errors/logs), replace success/read-only/failed write/failed rollback, crash recovery (between the two files; after the commit), add/remove trust
  (derived name, bundle, every refusal, never overwrite, read-only, each failure, only regular files), `trustFileName`.
- configfile_test.go (removed keys ignored, one warning list, dropped on write; `tlsPathsFromEnv`; rebuilt config keeps paths), live_test.go
  (skip applies through apply; classification test updated), settings_test.go (skip live on save, path keys refused, removed keys dropped when
  staged), backup_test.go / backup_api_test.go (a backup holding the keys opens/previews/imports, nothing listed, dropped from the file; skip live
  on import), main_test.go (env paths in `gatewayDir`, old config warning, rollback before the pair loads, recovery failure stops the start),
  proxy_test.go (transport), logging_test.go (no tls path attrs).
- Removed tests: `TestBackup_WithHostPathsCoversTheHostOnlyKeys`, `TestSettings_PathKeysChangeOnlyOnTheHost` (replaced by
  `TestSettings_PathKeysAreNotSettings`), `TestSettings_RestartOnlyKeysAreSavedAndFlagged` (replaced by `TestSettings_SkipVerifyAppliesAtOnce`), the
  "path key" row of `TestStageSettings_RefusalsComeBackAsErrors`.
