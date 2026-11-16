# F-fake: the fake gateway, TLS routes, restart, Demo controls (nothing was run)

## Routes (src/mock-broker/gateway/tls.ts, router.ts), all admin only (401 no session, 403 not admin), same gates as the rest
- `GET /managed/tls` -> 200 `{ certificate, certificateWritable, trustWritable, trust: [{ name, certificates: [cert], problem: "" }] }`
  cert = `{ subject, issuer, names: [], notBefore, notAfter, sha256, selfSigned: true, expired: false }`.
  Demo values: subject = issuer = `CN=demo certificate` (exported `DEMO_SUBJECT`); notBefore = time added (RFC 3339, no ms),
  notAfter one year later; sha256 = real SHA-256 of the decoded bytes, upper-case pairs joined by `:`.
  Start: one cert (sha256 of the bytes `START_CERTIFICATE_BYTES`), both flags true, `trust: []`. `problem` is always "" in the fake.
- `POST /managed/tls/certificate/check` `{ certificate, key }` -> 200 `{ certificate: <leaf cert> }`, writes nothing.
- `PUT /managed/tls/certificate` same body -> 200 `{ certificate }`, swapped at once.
- `POST /managed/tls/trust` `{ name?, certificate }` -> 200 GET body. No name -> `demo-certificate.crt` (the fake's CN is fixed), so a
  second unnamed add is 409 `exists`.
- `DELETE /managed/tls/trust/{name}` -> 200 GET body.
- `POST /managed/restart` -> 202 `{ restarting: true }`.
- Refusals: 422 `invalid` field `certificate` | `key` | `name` with a plain-words `reason` (never the key); 409 `tls_read_only`;
  409 `exists`; 404 `not_found` (unknown CA file); 400 `bad_request` (not strict JSON / unknown field / wrong type).
  Order: body (400), input (422), writability (409 tls_read_only), then file (409 exists / 404 not_found). The check route never
  gives tls_read_only. `tls_write_failed` is NOT simulated (no disk): error-codes.test.ts must list it under NOT_SIMULATED and
  tls_read_only under FAULTS (`gw.faults.tlsReadOnly = true`, then `PUT /managed/tls/certificate` with a valid pair).
- PEM accepted: well-formed armour + base64 that decodes. certificate field: one or more CERTIFICATE blocks and nothing else
  (a PRIVATE KEY block there is 422 on `certificate`). key field: exactly one block whose label ends `PRIVATE KEY`. The pair is
  taken to match; the fake never expires a certificate (so no "expired" refusal).
- Name rule `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(crt|pem)$` (422 `name` on POST, DELETE).

## Restart (index.ts)
- `RESTART_PAUSE_MS = 1500` exported from `gateway/index.ts`. At the POST the gateway immediately ends every session (`sessions.dropAll`),
  every ticket (`tickets.clear`) and every socket (`sockets.closeAll`), clears both cookies, and applies pending settings
  (`settings.applyRestart`). Then for RESTART_PAUSE_MS `fetch` to `/hosted` and `/managed/*` REJECTS with `TypeError('Failed to fetch')`
  (a stopped gateway); `gateway.handle` is not gated. After the pause the `gateway.onRestart(fn)` listeners run; boot.managed.ts
  registers one that calls `navigate('login')` (snapshot with page `login`, then reload). So the console's "wait for /hosted to answer"
  loop sees rejections, then the page is reloaded onto the sign-in by the boot. Console code should treat a rejected fetch as "not back yet".

## Settings in the fake
- tls keys: only `tls.insecureSkipVerify`. `certFile` `keyFile` `trustDir` are gone from SCHEMA, ZERO, seed.ts, view and backups.
  A PUT naming one is 400 `bad_request` (unknown key). A seed, snapshot or backup that still holds them is read and the keys are dropped.
- View: `restartOnly: ["hosted"]`, NO `hostOnly` field (type `SettingsViewRev = Omit<SettingsView, 'hostOnly'> & { rev }`).
  `tls.insecureSkipVerify` is live: save/import answer `restartRequired: []`.
- `backup.ts`: `withHostPaths`, `HOST_KEYS`, `NO_PATHS` removed (exports gone). `settingsChanges` no longer filters host keys.
- `GatewaySettings` (gateway/types.ts) = `Omit<ServiceSettings,'login'|'tls'> & { login..., tls: Pick<ServiceSettings['tls'],'insecureSkipVerify'> }`.

## Gateway API for other agents (`createGateway(...)` result)
- new: `tls` (`{ routes, view(): TlsView, dump(), load() }`), `onRestart(fn)`; `faults.tlsReadOnly: boolean` (GatewayFaults now also `TlsFaults`).
- `snapshot()` gains optional `tls: TlsState`; `restore` accepts snapshots without it.
- `sessions.dropAll()`, `tickets.clear()`, `sockets.closeAll()`, `settings.applyRestart()` are new.
- Exports of `gateway/tls.ts`: `createTls, parsePem, DEMO_SUBJECT, START_CERTIFICATE_BYTES`, types `CertInfo, TrustFile, TlsView, TlsState, TlsFaults, GatewayTls`.

## Demo control
- A `select` in the "Gateway events" section, id `mockctl-tls-readonly` (exported `TLS_READ_ONLY_ID` from `controls/managed.ts`),
  options `writable` ("TLS files: writable", default) and `readonly` ("TLS files: read-only"). Sets `gateway.faults.tlsReadOnly`;
  both `...Writable` flags go false and the writes answer 409 `tls_read_only`. The panel now has four selects in that section
  (the queue-state select moved from index 3 to 4 in managed.test.ts).

## Tests I added or changed (tests/mock-broker/)
- new: gateway/tls.test.ts, gateway/restart.test.ts, demo-flow-tls.test.ts (boot + panel + fetch: replace certificate, add/delete CA,
  switch, restart, sign-in, state kept). Changed: gateway/backup.test.ts, gateway/gateway.test.ts (hostOnly line), gateway/sockets.test.ts,
  gateway/tickets.test.ts, controls/managed.test.ts.

## What the next agents must do
- Console/service (gateway-settings): remove `tls.certFile|keyFile|trustDir` and `hostOnly` from `GatewaySettings`/`SettingsView` in
  src/modules/gateway-settings/service.ts, or the fake's types fail tsc (it emits `tls: { insecureSkipVerify }` and no `hostOnly`).
- Contract agent: seed.json loses the three keys (the fake tolerates either); restart case: the fake answers 202 and the session is gone after.
- demo-flow.test.ts (mine, left untouched): its MODULES map must gain the `tls-certificates` module (`src/modules/tls-certificates/module.ts`
  export, as named by the console agent) once src/variants/managed-demo.ts lists it, or "covers every module of the managed-demo variant" fails.
  Add one line there; a console walk (replace certificate, add/delete CA, restart) through the real module belongs in that file too.
- docs/demo.md: the "TLS files" switch, the restart pause, the demo certificate values.
