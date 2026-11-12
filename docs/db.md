# Data Store: Planning Brief

This is a brief for a planning session. It asks one question: should Provisioned mode keep its file-based store, or move to an embedded or external database? The session's output is a decision and a plan, not code. "Keep the files" is a valid answer.

---

## Contents

- [The question](#the-question)
- [How the store works today](#how-the-store-works-today)
- [The working hypothesis](#the-working-hypothesis)
- [Constraints](#constraints)
- [Questions to settle with the user first](#questions-to-settle-with-the-user-first)
- [Options to compare](#options-to-compare)
- [Code to read](#code-to-read)
- [What the plan must contain](#what-the-plan-must-contain)
- [Ground rules for the session](#ground-rules-for-the-session)

---

## The question

The gateway stores Provisioned mode's users and connections in encrypted files on the `/data` volume. The user asked whether this should change to SQLite or another lightweight embedded database.

Answer it from the requirements, not from the technology. Find out what the store must do, compare the options against the project's constraints, and recommend one. If the recommendation is a change, plan it. If it is not, record when to revisit.

Standalone and Gateway mode have no store. This question concerns Provisioned mode only.

---

## How the store works today

**The files.** All on the `/data` volume:

| File | Holds | Format |
| --- | --- | --- |
| `users.yaml` | accounts, the admin flag, grants, each user's modules | YAML, encrypted whole |
| `connections.yaml` | brokers, how to reach them (host, ports, and TLS or the plain scheme for SEMP and for messaging), their SEMP accounts, each Message VPN's client credentials | YAML, encrypted whole |
| `store.key` | the 32-byte key for the encrypted files (its path is fixed at `/data/store.key`; mount a secret there) | 64 hex characters |
| `backup.yaml` | the backup schedule and the key derived from its passphrase | YAML, encrypted whole |
| `config.yaml` | the gateway's settings | plain YAML |

**Backups.** Backup & Restore (`backup.go`, `backup_api.go`) exports users, connections and settings as one file sealed with a passphrase-derived key, imports the chosen sections together (all of their files are replaced, or none), and writes scheduled backups into the `/backup` mount. A store change must keep that format readable, or migrate it.

**Encryption.** `storecrypt.go` seals each store file whole with AES-256-GCM and a fresh random nonce on every write. The header is `SMUS`, a version byte and a role byte. Reads are capped at 8 MiB before decrypting. `keyfile.go` loads or generates the key and refuses to start on any mismatch between the key and the stores.

**Passwords.** Hashed with PBKDF2-SHA256 (`password.go`).

**Reads and writes.** `loadStore` (`store.go`) reads both files into memory at startup. A mutex guards them. Every edit rewrites the whole file through `writeFileAtomic` (`fileutil.go`: a temp file, then a rename), then fires `onChange`, which closes any SMF socket that lost its entitlement (`sockets.go`).

**Sessions.** Only in memory (`session.go`). A restart signs everyone out.

**Settings.** `config.yaml` is seeded from the environment on first start, then edited on the admin console's Gateway Settings page (`settings.go`). Live keys apply at once through `live.go`.

**Audit trail.** `/data/audit.log` (`audit.go`) is a separate append-only JSON-lines log of who did what, rotated by size (10 MB, up to 50 files). It is not part of the store: never read back, never backed up, never used to rebuild state, and a store change need not keep it in step. A future store should keep writing it the same way.

**One gateway.** Everything assumes a single gateway process. Two replicas would share neither sessions nor edits.

---

## The working hypothesis

Earlier in the conversation that produced this brief, the answer given was "keep the files for now". Test that conclusion; do not adopt it. The reasons given were:

- **Scale.** The data is tens to hundreds of records, served from memory.
- **Encryption.** SQLite and bbolt do not encrypt. SQLCipher needs CGO, which breaks the static build. Field-level encryption leaves names, grants and the store's structure readable on disk, which is weaker than today.
- **Size.** A pure-Go SQLite driver (`modernc.org/sqlite`) adds several MB and a large dependency to scan.
- **Replicas.** An embedded database does not enable them. Only an external database, with sessions moved out of memory too, would.

---

## Constraints

- **Static binary.** The gateway is built with `CGO_ENABLED=0` into a `FROM scratch` image (`docker/Dockerfile`). Anything needing CGO or a C library changes the build.
- **Image size.** The image was 15.7 MB against a 20 MB budget (`docs/test-report.md`, Phase 3E). Any size claim must come from a real build the user runs.
- **Encryption at rest.** Everything in the stores is encrypted today, with the key kept apart from the data. A replacement must not be weaker without an explicit decision.
- **Container posture.** Non-root UID 65532, a read-only root filesystem, and `/data` and `/tls` as the only writable paths.
- **Dependencies.** Pinned exactly, scanned by `./scripts/dev.sh scan` (govulncheck and trivy). Go tools run as `go tool` directives.
- **Shared contract.** `go-web-proxy/testdata/contract/` holds the request and response cases that both the Go tests and the TypeScript fake gateway (`src/mock-broker/gateway/`) must match. The HTTP API must not change shape because of the storage choice.
- **Tests.** Web coverage stays at 100%. The Go coverage floor is 93.7%.
- **The e2e run** reads the store files from the container to check they are sealed at rest, restarts the gateway, and checks that a missing key refuses to start (`scripts/e2e.mjs`). These checks change with the format.
- **Not shipped yet.** Provisioned mode is on `feature/rbac` only. It is not on `main` and not in any pushed tag. Changing the format before the first release that ships it needs no data migration. After that release, it does.
- **Operator docs.** `docs/provisioned-mode.md` explains backing up the store key and the start-up refusals. Any change rewrites those sections.

---

## Questions to settle with the user first

Ask these before comparing options. The answers decide most of it.

1. Must the gateway run as more than one replica, for availability or load? If yes, only an external database helps, and sessions must move out of memory too.
2. How many users and connections are expected, and how often do administrators edit them?
3. Is an audit trail or a history of administrator changes needed?
4. Should sign-in sessions survive a restart?
5. What backup is expected? Today it is two files plus the key, copied while running or stopped.
6. Must this land before the first release that ships Provisioned mode, to avoid a migration?

---

## Options to compare

| Option | In short |
| --- | --- |
| Keep the files | Today's design, possibly with small additions such as an append-only audit file or persisted sessions. |
| bbolt | Pure Go, one file, one process. No encryption, so values would be sealed individually. |
| SQLite, pure Go (`modernc.org/sqlite`) | No CGO. Larger binary, no encryption, so fields would be sealed individually. |
| SQLite with SQLCipher | Encrypts the whole database, but needs CGO and a C library, so the static `scratch` build changes. |
| External database (for example Postgres) | Allows replicas. Adds a service to deploy, its credentials and TLS, schema migrations and shared sessions. |

For each option, assess:

- encryption at rest, and what stays readable on disk;
- the binary and image size change, measured;
- CGO and the build;
- dependency and CVE surface;
- replicas, backup and restore;
- the effect on the shared contract, the fake gateway, the Go tests and the e2e run;
- the effect on the deployment (compose files, volumes, secrets) and the docs.

---

## Code to read

- **Store:** `go-web-proxy/store.go`, `storecrypt.go`, `keyfile.go`, `fileutil.go`, `password.go`
- **Callers:** `managed.go` (the users and connections API), `sockets.go`, `session.go`, `managed_routing.go`, `relay.go`, `dial.go`, `smf.go`
- **Settings:** `configfile.go`, `settings.go`, `live.go`
- **Tests:** `store_test.go`, `storecrypt_test.go`, `keyfile_test.go`, `contract_test.go`, `testdata/contract/`
- **Fake gateway:** `src/mock-broker/gateway/`
- **e2e:** `scripts/e2e.mjs`, `docker/docker-compose.e2e.yaml`
- **Docs:** `docs/provisioned-mode.md`, `docs/deployment.md`, `docs/architecture.md`

---

## What the plan must contain

- The user's answers to the questions above.
- The decision and its reasons, with the measured size change if a dependency is added.

If the decision is to change:

- the storage design: the schema or layout, the encryption scheme and the key handling;
- the seam in the Go code, so the API handlers do not change;
- migration, or why none is needed;
- the tests to add or change, including the contract cases and the e2e checks;
- the docs to rewrite;
- the order of work, and who runs each gate.

If the decision is to keep the files:

- the conditions that would reopen the question;
- any small improvements worth doing now, each as its own item.

---

## Ground rules for the session

- Read only until the user approves the plan.
- The user runs every build, test, scan and git command.
- Planning and workflow agents run on Sonnet.
- Plain ASCII in everything written.
