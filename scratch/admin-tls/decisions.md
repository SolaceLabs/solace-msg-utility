# Admin console, live TLS and restart: pinned design, 2026-11-15

Owner decisions (2026-11-15):
- A "Restart gateway" action in the admin console; the gateway restarts in place (it starts its own program again).
- The nav entry "Settings" is "Gateway Settings".
- Each settings section is its own card; the same for User Management. Cards are never side by side: they stack,
  full width. Fields inside a card may sit side by side; short fields (numbers, selects) do.
- Modules: toggle tiles in Gateway Settings (modules on offer); pills in the user form (a user's modules).
- TLS: the certificate, key and CA directory paths are environment variables only, read at every start, and leave
  config.yaml and the page. The console shows the gateway's certificate and lists the trusted CA certificates, and can
  replace the certificate and add or delete CA files when the files are writable. A certificate and key are verified
  before anything is written. Every TLS change applies at once, with no restart: the certificate, the CA list and
  "skip broker certificate checks".

Everything below is pinned; every agent builds exactly this. Where it is silent, follow the existing code's patterns
(the single writer and journal in writer.go and fileutil.go, the audited wrapper and committed hook in managed.go, the
settings file in settings.go, the fake gateway mirroring the real one, the module conventions in CLAUDE.md).
House rules: plain ASCII; a private key never reaches a response, a log line, an audit entry or an error text; no
agent runs a gate (no go, gofmt, npm, npx, tsc, vitest, eslint, docker, graphify update, no git mutation);
`graphify query "<question>"` before raw grep. The working tree also holds one small uncommitted change (unknown paths
answer 404 in go-web-proxy/proxy.go, with its tests, e2e check D1 and docs): leave it as it is.

## A1. TLS paths are environment only
- `tls.certFile`, `tls.keyFile` and `tls.trustDir` leave config.yaml, the settings API, the settings page, the fake and
  the contract seed. The gateway reads `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE` and `SMU_SSL_TRUSTDIR` at every start
  (defaults `/tls/tls.crt`, `/tls/tls.key`, `/tls/trust`).
- An existing config.yaml that still holds any of the three starts as before: they are removed keys (handled like the
  earlier removed keys `appDir`, `usersFile`, `connectionsFile`), ignored, dropped at the next settings save, and each
  one whose value differs from the path in use is named in one WARN line at start. A backup that holds them imports;
  they are ignored.
- If no other key is "edit on host" once these are gone, the host-only tag, its refusal and its page legend go too
  (no dead code); if others remain, they stay as they are.
- `tls.insecureSkipVerify` stays in config.yaml (seeded by `SMU_SSL_SKIP_CERT_VERIFY`) and becomes a live key (A2).

## A2. Live TLS in the gateway
- Server certificate: the listener's `tls.Config` uses `GetCertificate`, which returns the current pair from one holder.
  Replacing the pair swaps the holder; new handshakes use the new pair, open connections carry on.
- Broker trust: one holder for the CA pool and the skip flag. Every outbound TLS connection (the SEMP relay, the
  Direct relay, the SMF gate) takes the current value when it connects. On a change, idle upstream connections are
  closed so the next request handshakes under the new trust; open connections and sockets carry on.
- `tls.insecureSkipVerify` applies on a settings save and on an import through the same holder. It leaves the
  restart-only list; the WARN line about skipped verification is logged whenever it becomes true.
- The trust pool is still the system roots plus every certificate in `*.crt` and `*.pem` files directly in the trust
  directory; it is rebuilt from the directory after every add or delete.

## A3. TLS API (Provisioned mode, administrators only, same origin, audited)
- `GET /managed/tls` answers
  `{ "certificate": <cert>, "certificateWritable": bool, "trustWritable": bool, "trust": [ <file> ... ] }` with
  `<cert>` = `{ "subject", "issuer", "names": [..], "notBefore", "notAfter", "sha256", "selfSigned": bool, "expired": bool }`
  (times RFC 3339 UTC; `sha256` as upper-case hex pairs joined by `:`; `names` the DNS names and IP addresses) and
  `<file>` = `{ "name", "certificates": [ <cert> ... ], "problem": "" }` (`problem` says why a file gave none:
  unreadable, or no certificate in it). Files sorted by name. Paths are never in the answer.
- `POST /managed/tls/certificate/check` body `{ "certificate": "<PEM>", "key": "<PEM>" }`: verifies and answers
  200 `{ "certificate": <cert> }` (the leaf). Nothing is written.
- `PUT /managed/tls/certificate` same body: verifies, writes, swaps, answers 200 `{ "certificate": <cert> }`.
  Audit action `tls.certificate.replace`, the message naming the subject and the expiry, never the key.
- Verification (422 `invalid`, field `certificate` or `key`, reason in plain words): the certificate holds at least
  one CERTIFICATE block and nothing that is not one; the key holds exactly one private key; the pair matches
  (`tls.X509KeyPair`); the leaf is already valid and not expired.
- Writing the pair: both files in one journaled commit (fileutil.go's journal, in the certificate's directory), key
  mode 0600, certificate 0644, so a crash never leaves half a pair; that directory's recovery runs at start before
  the pair is loaded. The certificate and its key must be in one directory to be replaced from the console.
- `POST /managed/tls/trust` body `{ "name": "<file name, optional>", "certificate": "<PEM>" }`: the PEM must hold one or
  more CERTIFICATE blocks and nothing else (a private key is refused, 422 `invalid`, field `certificate`). The name
  must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(crt|pem)$` (422 `invalid`, field `name`); without one it is derived
  from the first certificate's subject common name (lower case, every run of other characters one `-`, `.crt`
  added; `ca.crt` when that leaves nothing). An existing name is 409 `exists`. Written with a temp file and a rename.
  Answers 200 with the same body as `GET /managed/tls`. Audit action `tls.trust.add`, target the file name.
- `DELETE /managed/tls/trust/{name}`: the name rule above (422), 404 `not_found` when no such regular file is directly
  in the directory (never a path outside it, never a directory or a link), else the file is removed and the answer
  is 200 with the `GET` body. Audit action `tls.trust.remove`.
- Not writable (a read-only mount, or the pair split over two directories): 409 `tls_read_only` on the writes, and the
  `...Writable` flags false on the GET. A write that fails otherwise: 500 `tls_write_failed`, nothing changed, the
  cause in the log.
- One lock serialises the TLS writes. No rev is sent: the last write wins.
- Body cap: the existing JSON cap. The key is read from the body only; it is never echoed.

## A4. Restart
- `POST /managed/restart` (administrator, same origin, audited as `gateway.restart`): writes its audit line, answers
  202 `{ "restarting": true }`, then the gateway shuts down as it does for SIGTERM (requests drain, files close) and
  starts its own program again in place with the same arguments and environment (`syscall.Exec` of the running
  executable; build tags keep the non-Unix build compiling, where it exits with status 0 instead). If the exec fails
  the gateway logs why and exits with status 1, so the platform's restart policy takes over.
- Every session and ticket is gone afterwards, open sockets close, and anything waiting for a restart is applied.
- The process hook that performs the exec is injectable, so tests assert the shutdown and the call without exec.

## A5. Fake gateway and demo
- The fake answers the same routes with the same statuses, codes and shapes. It cannot read X.509: it accepts PEM that
  is well formed (the armour lines and base64 that decodes) and describes a certificate with fixed demo values for
  the fields it cannot read (`subject` `"CN=demo certificate"`, `issuer` the same, `names` `[]`, `notBefore` the time
  it was added, `notAfter` one year later, `selfSigned` true, `expired` false) and a real `sha256` of the decoded
  bytes. A key is any single PRIVATE KEY block; the pair is taken to match.
- It starts with one certificate, both writable flags true and an empty trust list. The Demo controls gain a switch
  "TLS files read-only" that turns both flags false and makes the writes answer 409 `tls_read_only`.
- Restart in the fake: 202, then every session and ticket ends, settings waiting for a restart take effect, and the
  page returns to the sign-in after a short pause, as it would once the real gateway is back.
- The three path keys leave the fake's settings and seed.

## A6. Admin console
- Naming: the module's nav name is "Gateway Settings" (it was "Settings"); the sign-in module's hint text follows.
- Layout, Gateway Settings and User Management: every section is a `.card`; cards stack full width and are never side
  by side. Inside a card, short fields sit in columns using the shared class `.form-cols`
  (`display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem 1rem;` in
  src/css/components.css); long fields (text areas, lists, tables) keep the full width.
- Modules on offer (Gateway Settings): toggle tiles, one per catalog module: a `button` with `aria-pressed`, the
  module's name and one line of description; a click or the keyboard toggles it. Descriptions: Queue Browser
  "Browse, inspect and delete queued messages."; Queue Copy "Copy or move messages between queues."; Queue
  Subscriptions "See which topics each queue subscribes to."; any other module falls back to its name alone.
- A user's modules (user form): the choice "Deployment default: <names>" or "Choose for this user"; when choosing,
  the chosen modules are pills, each with a remove button, and an "Add module" menu lists the offered modules not yet
  chosen. A module in the user's list that is no longer offered is a pill marked "not offered" that can be removed.
  With the default selected the pills show what the default gives, without remove buttons.
- Gateway Settings loses the three path fields. "Skip broker certificate checks (insecure)" stays, in the card that
  now holds broker trust settings, and applies on Save with no restart.
- Gateway Settings gains a card "Gateway" with the "Restart gateway" button: a confirm dialog ("Restart the gateway?
  Everyone is signed out and open broker connections close. It is back in a few seconds."), then the POST, then the
  page says it is restarting, waits for `/hosted` to answer again and goes to the sign-in. The notice that lists
  settings waiting for a restart points at the same button.
- A new admin module `tls-certificates`, nav name "Certificates", in every variant that carries the admin modules
  (after Gateway Settings): a card "Gateway certificate" (subject, names, issuer, valid from and to with an expired or
  expires-within-30-days mark, fingerprint, a note when it is the self-signed bootstrap one; "Replace certificate"
  takes a certificate file and a key file, or pasted PEM, runs the check, shows what will be installed and asks to
  confirm) and a card "Trusted broker CAs" (each file with its certificates' subject, expiry and fingerprint, a
  Delete button with a confirm dialog, and "Add CA certificate" taking a file or pasted PEM and an optional file
  name). When a flag says not writable, the actions are disabled with a sentence saying the files are read-only on
  the gateway host. The key field is cleared after every attempt.
- New stock messages for `tls_read_only` and `tls_write_failed`; the code list and its test follow.

## A7. Contract, e2e, compose, docs
- Contract cases (both gateways): the refusals of the new routes that need no certificate parsing (no session, not an
  administrator, a body that is not PEM, a bad or duplicate or unknown CA file name, a private key sent as a CA) and
  the shape of `GET /managed/tls` with every certificate field normalised; the settings bodies without the three
  path keys; restart answered 202 for an administrator and refused otherwise. `seed.json` loses the three keys.
- e2e: the gateway's `/tls` must be writable in the e2e stack for these checks. New checks after 27: (28) `GET
  /managed/tls` shows the run's certificate by fingerprint and the broker CA file; (29) the check route refuses a
  mismatched key and an expired certificate, and after a replace a new TLS connection sees the new fingerprint with
  no restart; (30) deleting the broker CA makes the relay fail to verify the broker and adding it back makes it work,
  with no restart (skipped with a note under `E2E_INSECURE=1`); (31) `POST /managed/restart` brings the gateway back
  with the old session gone and the administrator signing in again. The private key the run uploads is masked and
  swept like the other secrets. Check counts in the docs follow (44 checks, 31 numbered; 34 with `E2E_BROWSER=0`).
- Shipped compose files: say in a comment how to let the console manage `/tls` (a writable mount) and how to lock it
  (a read-only mount); keep every posture test green.
- Docs in the same change: provisioned-mode.md (certificates from the console, read-only mounts, live changes, the
  restart button, the environment-only paths and what happens to an old config.yaml), deployment.md (the three
  variables are read at every start; the settings table loses the three rows; `tls.insecureSkipVerify` is live),
  user-guide.md (the new page, the tiles, the pills, the cards, Gateway Settings' name, Restart), architecture.md
  (the holders, the API, the restart), developer-guide.md, demo.md, contributing.md (checks 28-31), test-report.md
  (a ledger entry), README.md. Each doc's Contents list must equal its headings.
