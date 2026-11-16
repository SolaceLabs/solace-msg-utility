# G-contract: contract goldens, e2e checks 28-31, compose (nothing was compiled or run)

## Contract (go-web-proxy/testdata/contract/, contract_test.go, tests/mock-broker/gateway/)
- seed.json: `settings.tls` is `{ "insecureSkipVerify": false }`. cases.json: every settings body lost the three path keys and `hostOnly`;
  `restartOnly` is `["hosted"]`. Edited by text replacement, not regenerated; parses (checked read-only).
- Changed cases: "settings: the file, its restart-only key, and the catalog" (renamed); the first step of "settings: each refusal ..." is now
  `PUT {tls:{certFile}}` -> 400 `bad_request`; "settings: a saved restart-only key is reported as pending" became "settings: skipping broker
  certificate checks applies at once and is never pending" (PUT answers `restartRequired: []`, then a GET with `pendingRestart: []`).
- New cases (end of file): "tls and restart: every route refuses no session and a non-admin ..." (6 routes x 401/403), "tls: the certificate and the CA
  files, every certificate field normalised" (GET: both flags true, `trust: []`), "tls: a certificate that is not a certificate is refused on the check and
  the replace ..." (422 certificate x2 text, private-key text, 400 unknown field x2), "tls: a CA file is added and listed, refused when taken, badly named
  or not a certificate, and deleted" (uses a throwaway CA certificate, no key kept, valid to 2126; name `contract-ca.crt`), "restart: an administrator is
  answered 202" (last step of its case: the fake ends the session after it, the real contract env keeps it, so nothing follows it).
- Normalisation, both replays (`contractNormalizeCerts` in contract_test.go, `normalizeCerts` in contract.test.ts): any object with subject+issuer+sha256:
  subject/issuer non-empty string -> "<name>", names string list -> "<names>", sha256 upper-case colon hex -> "<fingerprint>", notBefore/notAfter RFC 3339 UTC
  -> "<time>", selfSigned/expired boolean -> "<bool>". A value of another shape stays and fails to match.
- routes.test.ts: rows for the six new routes (tls service + settings.restart). error-codes.test.ts: `tls_read_only` under FAULTS (`gw.faults.tlsReadOnly`),
  `tls_write_failed` under NOT_SIMULATED. seed.test.ts: one test (no path keys; one certificate, both writable, no CA file).

## The fake must change (reason texts differ from the real gateway; cases.json holds the REAL texts)
src/mock-broker/gateway/tls.ts uses its own wording; TestContract_Cases is the truth, so the fake takes Go's strings (go-web-proxy/tls.go) exactly:
- certificate field (check, replace) and trust `certificate`, text is not PEM / holds no certificate block:
  `No certificate was found. Send the PEM text, from -----BEGIN CERTIFICATE----- to -----END CERTIFICATE-----.`
- a block whose label ends `PRIVATE KEY` in a certificate field: `A private key was found. A private key never belongs here: send only the certificate.`
- another non-CERTIFICATE block: `A "<label>" block was found. Only CERTIFICATE blocks are accepted.`; undecodable CERTIFICATE body: `A CERTIFICATE block cannot be read as a certificate.`;
  text after the last block: `There is text after the last certificate block. Send only certificate blocks.` (the last two not in the goldens).
- name (post and delete): `Use letters, digits, dots, dashes and underscores, start with a letter or digit, end in .crt or .pem, and keep the name before the extension to 64 characters.`
- key field (not in the goldens, align anyway): no key `No private key was found. Send the PEM text, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----.`,
  more than one `More than one private key was found. Send exactly one.`, mismatch `The key does not match the certificate (the first one sent).`
Until then contract.test.ts fails on exactly those four reason strings (steps 1-4 of the "not a certificate" case, steps 4-8 of the CA case).

## e2e (scripts/e2e.mjs, scripts/e2e-lib.mjs)
- Layout: the harness writes `scripts/logs/e2e/tls/{tls.crt,tls.key,trust/broker-ca.crt}` (was gateway.crt, gateway.key, trust/). Both dirs chmod 0777
  (the gateway user 65532 creates files there); teardown's rmSync removes what it wrote.
- Compose, Provisioned gateway: ONE writable mount `../scripts/logs/e2e/tls:/tls` replaces the three `:ro` file/dir mounts. User, read_only, cap_drop, no-new-privileges
  are untouched. `direct` mounts the same dir `:ro`. tests/build/compose-files.test.ts: the gateway row's writable list is
  `['data:/data','backup:/backup','../scripts/logs/e2e/tls:/tls']`, plus one test that pins the directory mount and forbids single-file /tls mounts.
- e2e-lib.mjs: `issueExpiredCert(ca, {cn,dns,ip,now})`, `certFingerprint(pemText)` (first certificate, `AB:CD:..`), `tlsFingerprint({host,port,servername?,timeoutMs?})`
  (unverified handshake, rejects on refusal or timeout; the file now imports node:tls), and `auditMissing(..., { tls: { trustFile? } })` (ok tls.certificate.replace by
  admin with subject and expiry and no PEM, ok gateway.restart, and with `trustFile` ok tls.trust.add/remove of it). A second certificate is `issueCert` again.
- Checks 28-31 sit after 27 and before 19, in their own try/finally (restores the administrator session, the original certificate, the CA file). 28: GET /managed/tls by
  fingerprint, names, both flags, CA file, no path/key text, 401 and 403. 29: mismatched key and expired certificate refused on check and PUT with nothing swapped, 403/401
  on PUT, a good check installs nothing, PUT is served by a new connection and the admin session survives, original put back, keys swept in `records`. 30: DELETE the
  broker CA -> relay 502 (or "failure half skipped" when host roots also trust the broker), POST it back -> 200, session survives; returns a skip note under E2E_INSECURE=1
  (still a PASS, so the counts stay 44 / 34). 31: 401/403 refusals, 202, old session 401, same container id (in-place), admin signs in again in the same jar, certificate and
  CA file unchanged. Check 19 now also requires the TLS audit entries; check 17 sweeps `tlsKeys` (one base64 line per uploaded key) in the log and the audit log.

## Compose (shipped)
Comments only: compose.provisioned.yaml and the `provisioned` service of docker-compose.yaml say a writable /tls lets the Certificates page work, a `:ro` directory
mount locks it (changes then need the host and a restart), directory not single files, the three variables are read at every start; compose.gateway.yaml says Gateway
mode has no console. e2e compose header explains the writable mount.

## If a golden or an e2e check disagrees, look first at
- Golden: `go test -run Contract -update .` rewrites cases.json from the real gateway (review the diff: reasons, normalised certificate shapes). Then bring the fake in line.
  Suspects: the reason texts above; `GET /managed/tls` flags (real `trustWritable` probes the parent when trust/ is absent); whether `PUT {tls:{certFile}}` is 400 on both.
- e2e 28: names list (Go `describe` must list IP SANs as `127.0.0.1`). 29: reason text of the mismatch (`does not match`) and expiry (`expired`). 30: the relay's status for
  a verification failure (expected 502). 31: `waitFor` waits for 401 on the old session, so a restart that keeps sessions would time out; a stopped container (exec failed,
  restart policy "no") fails at once with the container message. Writable /tls problems (500 `tls_write_failed`, 409 `tls_read_only`): the host directory permissions
  (SELinux relabel on Linux hosts needs `:z`, not added) -- see the gateway log.
