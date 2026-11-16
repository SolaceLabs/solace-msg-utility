# H-docs: documentation for the admin console, live TLS and restart (nothing was run)

Files edited (only docs and README): docs/provisioned-mode.md, user-guide.md, architecture.md, developer-guide.md, deployment.md, demo.md,
contributing.md, test-report.md, README.md.

## New headings (Contents lists updated; checked with a read-only script, all eight docs match)
- provisioned-mode.md: `## Certificates from the console` with `### Letting the console manage them`, `### Locking them`, `### What applies at once`,
  `### Restart gateway`, `### Paths come from the environment` (anchor `#certificates-from-the-console`).
- architecture.md: `### Live TLS and restart` (anchor `#live-tls-and-restart`), before "Admin modules + the Go store".
- developer-guide.md: `### Changing the TLS files` and `### Laying out an admin page`, after "Adding a sign-in step".

## What changed in content
- deployment.md: the three SMU_SSL_* rows left the Settings table (a sentence below it names them); TLS section says they are read at every start,
  what an old config.yaml does, console management vs read-only mount; `tls.insecureSkipVerify` is live; "Restarting from the console" bullet;
  Updating gets a note. Mounts row for /tls says writable vs read-only.
- provisioned-mode.md: Administer bullets (Certificates, Gateway Settings cards, Restart), audit table gains `tls.certificate.replace`,
  `tls.trust.add`, `tls.trust.remove`, `gateway.restart`; security checklist item; troubleshooting entries (`TLS directory recovery failed`,
  read-only, `tls_write_failed`, the old-config warning); "Changed on disk" no longer says the TLS paths are host edits.
- user-guide.md: Administration lists five modules; Settings renamed Gateway Settings (cards, tiles, Broker trust, restart tag, banner text,
  Go to Restart gateway); user form pills; new Certificates bullet; Restart gateway paragraph; the two new stock messages. Labels and messages
  were copied from src/modules/{tls-certificates,gateway-settings,user-management}.
- architecture.md: removed host-only and withHostPaths text; live settings include `tls.insecureSkipVerify`; path keys refused as unknown fields
  (400); routes table (`tls/...`, `restart`); container image /tls row; holders, tlsManager, API, restart sequence, fake (all as shipped, including
  X-crosscheck's dialUpstreamTLS fix: the transport dials its own TLS and verifies with ServerName = host).
- demo.md: five admin pages; Certificates demo values; Restart pause; "TLS files" select (writable / read-only); `tls_write_failed` not simulated.
- contributing.md / test-report.md: 44 checks, 31 numbered, 34 with E2E_BROWSER=0; checks 28-31 described; ledger entry added (Results: not run).
- README.md: one paragraph and the image bullet.

## What the next agents must check (docs follow the code as read, not as run)
- If e2e checks 28-31 in scripts/e2e.mjs differ from the paragraph in contributing.md ("Checks 28-31 run after check 27 and before check 19"),
  align the paragraph (it says the Provisioned gateway's /tls is writable in the e2e stack and the paths come through the environment).
- The contract cases are described generally in test-report.md; if their names matter, name them there.
- docker/compose.*.yaml comments about writable vs read-only /tls are not mine (provisioned-mode.md says a named volume `tls:/tls` is writable and
  `:ro` locks it); the compose comment should say the same, and to mount the directory, not a single file.
- docs/improvement-plan.md still lists this work as PAUSED/OPEN; closing it (ledger entry) is the orchestrator's.
