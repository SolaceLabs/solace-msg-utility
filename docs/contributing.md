# Contributing

## Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
  - [End-to-end run](#end-to-end-run)
- [Code Standards](#code-standards)
  - [TypeScript / JavaScript](#typescript--javascript)
  - [Linting](#linting)
  - [DOM Access](#dom-access)
  - [Modals](#modals)
  - [Event Handling](#event-handling)
  - [Error Handling](#error-handling)
  - [Logging standard](#logging-standard)
  - [File Organization](#file-organization)
- [Testing Requirements](#testing-requirements)
  - [Coverage Threshold](#coverage-threshold)
  - [Writing Tests](#writing-tests)
  - [Test Pattern](#test-pattern)
  - [Defensive-Guard Tests](#defensive-guard-tests)
  - [Cross-Module Integration Tests](#cross-module-integration-tests)
  - [Test Isolation: Global Hooks](#test-isolation-global-hooks)
  - [Solace Mock Behaviour](#solace-mock-behaviour)
  - [Gateway Contract](#gateway-contract)
  - [Stubbing Globals](#stubbing-globals)
  - [v8 Coverage Ignores](#v8-coverage-ignores)
  - [Running Tests](#running-tests)
- [Pull Request Checklist](#pull-request-checklist)
- [Architecture Notes](#architecture-notes)

---

## Getting Started

See [developer-guide.md](developer-guide.md) for full setup instructions (`npm install`, dev server, project structure).

Quick verification after cloning:

```bash
npm install && npm test
```

---

## Development Workflow

1. Create a branch for your change
2. Make your changes in `src/`
3. Write or update tests in `tests/`
4. Run `./scripts/dev.sh all` (or `./scripts/dev.ps1 all` on Windows) -- `build vet test mock`, the fast inner loop (CI runs `all cov scan`)
5. Run `./scripts/dev.sh cov` — coverage must not regress; target is 100% on all four metrics, and `vitest.config.ts` fails the run below that
6. Run `./scripts/dev.sh scan` before opening the PR if you touched a dependency, the Dockerfile, or `go-web-proxy/`
7. Open a pull request with a clear description

`scripts/dev.sh` and `scripts/dev.ps1` are the only place that knows how to build, test, lint or scan this repo -- CI calls the same task names, which is what keeps local and CI identical structurally rather than by discipline. Don't add a build command to a workflow; add it to both scripts. Both match task names exactly and case-sensitively (`BUILD` and `b*` die with `unknown task`), and `dev.ps1` streams each task's output line by line into its log, as `dev.sh` does, so a log fills while the task runs.

| Task | What it runs |
| --- | --- |
| `build` | `npm run build` (every variant), `npm run check:bundles` (no Direct bundle carries Provisioned UI; the Provisioned demo has no way out to a network), plus the gateway binary, version-stamped, into `dist/` (a compile check: it ships only inside the image) |
| `vet` | `npm run typecheck` (`src/`, its `.js` modules included: `checkJs`), `npm run typecheck:tests` (`tests/` and the vite/vitest configs, through `tsconfig.test.json`), `npm run lint` (ESLint, see [Linting](#linting)), `go vet ./...`, and `gofmt -l` on `go-web-proxy/` (any file it lists fails the task) |
| `test` | `npm run test:app` (the web suite without `tests/mock-broker/`), `go test -race ./...` (`CGO_ENABLED=1`; without gcc on PATH it runs without `-race` and `test.log` says so). When `cov` is in the same invocation (`full`, `all cov`), the web suite runs once, in `cov`, and `test.log` says so |
| `mock` | `npm run test:mock:coverage`: `tests/mock-broker/`, the suites behind `demo.html` and the Provisioned demo, the gateway contract included, with the coverage of `src/mock-broker/` printed (reported, no threshold). Skipped, like `test`'s web suite, when `cov` is in the same invocation |
| `cov` | `npm run test:coverage` plus a Go coverage profile; prints both totals |
| `scan` | `npm run audit:gate` (`npm audit`, fatal on fixable HIGH/CRITICAL advisories, warns on unfixable ones), `go tool govulncheck ./...`, then a Trivy scan of the freshly-built image with the pinned Trivy container (never a `trivy` on PATH; see [git.md](git.md#keeping-the-workflow-pins-current)) |
| `image` | Builds the container image via `docker/docker-compose.yaml` |
| `up` / `down` | Brings the compose stack up or down |
| `graphify` | Refreshes the knowledge graph (local only — skipped when `CI` is set) |
| `e2e` | The gateway image in Gateway and Provisioned mode against an existing Solace broker: builds the image, then runs `node scripts/e2e.mjs` over `docker/docker-compose.e2e.yaml`, which asks only for the broker details that `docker/e2e-broker.env` and the `E2E_*` variables do not give (see [End-to-end run](#end-to-end-run)). Local only and standalone: skipped when `CI` is set or without a Linux-container Docker, and never part of `all` or `full` |
| `all` | `build vet test mock` |
| `full` | `all` + `cov image scan graphify` — the pre-tag sweep |

Every task name is checked before any task runs, so a typo fails at once. Each task writes `scripts/logs/<task>.log` with a timestamped footer, and a run of more than one task ends with a console-only `timing:` line giving each task's seconds. CI runs `all cov scan`, so the 100% thresholds in `vitest.config.ts` gate every release. `logs/cov.log` holds the previous coverage totals, which are the local floor for what has no threshold (the Go total) -- CI is a fresh checkout with no prior log, so that comparison is yours.

The image half of `image` and `scan` warn-skips when Docker is absent or running Windows containers, since a Linux image cannot be built there. The `ubuntu-24.04` CI leg still enforces it.

### End-to-end run

`./scripts/dev.sh e2e` (or `./scripts/dev.ps1 e2e`) checks the gateway image in both of its server modes the way a browser uses them, against an existing Solace broker you name. It builds the image (as `scan` does), then [`scripts/e2e.mjs`](../scripts/e2e.mjs) starts [`docker/docker-compose.e2e.yaml`](../docker/docker-compose.e2e.yaml): the image twice, as `gateway` with `SMU_CONN_MODES=provisioned` and as `direct` in Gateway mode (the image's default, no `SMU_CONN_MODES`), and a Chromium browser in the official Playwright image, all three with the hardened posture (non-root, read-only root, every capability dropped, no new privileges). Run it before a tag that touches the gateway or the app; it takes a minute or two.

**Nothing on the broker is created or changed.** The run reads it through the gateway's read-only relay and browses an existing queue, which consumes nothing; in Gateway mode it does the same through the Direct relay with the broker credentials you gave. The one write it sends, the `PATCH` of check 4, must be refused by the gateway; were it to get through, it names a queue that does not exist, so the broker would refuse it too. What the run does change is the Provisioned gateway itself: check 11 takes the e2e user's grant away and gives it back, and check 12 and `B3` change settings and restore them.

Needs: a Linux-container Docker; the npm packages installed (`npm ci`: the SMF check logs in with the pinned `solclientjs`, the SDK the image ships, and the browser checks drive Chromium with the pinned `playwright-core`); the loopback ports `39443`, `39444` and `39445` free (the Provisioned gateway's, the browser's Playwright server and the Gateway-mode gateway's, all bound to `127.0.0.1`); a one-time pull of the Playwright image, over 1 GB, which the first run does on its own; and a broker both gateway containers can reach over TLS, with SEMP over TLS and secured web transport (wss) enabled.

**Broker details.** Each comes from its `E2E_*` environment variable, else from `docker/e2e-broker.env`, a `KEY=value` file that is git-ignored and kept out of the image build context (`docker/Dockerfile.dockerignore`, with `scripts/logs/`): never commit it. The harness asks only for what neither gives, on the terminal, then writes those answers to the file (creating it at mode `600` with a header), so the next run asks nothing. It never writes a password there: add `E2E_SEMP_PASSWORD` and `E2E_CLIENT_PASSWORD` yourself to skip those prompts, and keep the file private (the harness warns when other users can read a file holding one). Without a terminal, a missing detail fails the run, naming the variables to set. An unknown key, a repeated key, or a value the gateway would refuse fails it too, naming the line.

| Key | Default | What |
|-----|---------|------|
| `E2E_BROKER_HOST` | | The host both gateway containers dial. It must match a name in the broker's TLS certificate (an IP address must be an IP SAN), unless `E2E_INSECURE=1`. A broker on this machine is `host.docker.internal`. For `D4` it must be a name or an IPv4 address, as the Direct form requires. |
| `E2E_BROKER_IP` | | Optional host alias: both gateway containers map `E2E_BROKER_HOST` to this address, as an `/etc/hosts` entry would, for a certificate name that no DNS the containers use resolves (a container does not read this machine's `/etc/hosts`). `E2E_BROKER_HOST` must then be a name, not an address. The harness writes the mapping as a compose override under `scripts/logs/e2e/` for the run only. Never asked for. |
| `E2E_BROKER_CA` | | A PEM file with the CA that signed the broker's certificate, or that certificate itself. Required; only its certificates are used. The image ships no system roots, so the harness also mounts the host's standard root bundle where Go looks for one (the first of Go's Linux bundle paths, else Node's bundled roots, as on Windows), and prints which. The gateway verifies each broker port against both: a port that presents a public chain, such as SEMP behind a proxy, needs nothing in this file. |
| `E2E_SEMP_PORT` | `1943` | SEMP over TLS. |
| `E2E_SEMP_USER` | `admin` | Read-only access is enough. |
| `E2E_SEMP_PASSWORD` | | Asked without echo. |
| `E2E_SMF_PORT` | `1443` | Secured web transport. |
| `E2E_VPN` | `default` | Like the queue name, it must pass the relay's path-segment rule: no `\`, `%` or `;`. |
| `E2E_CLIENT_USER` | | A client username in that VPN. |
| `E2E_CLIENT_PASSWORD` | | Asked without echo. |
| `E2E_QUEUE` | | An existing queue in that VPN the client username may browse. A `/` is fine; `\`, `%`, `;` and an empty, `.` or `..` part between slashes are not, since the relay refuses them. |
| `E2E_INSECURE` | `0` | `1` starts both e2e gateways with `SMU_SSL_SKIP_CERT_VERIFY=true`, for a broker whose certificate does not name the host it is dialled by. Never asked for; any value but `0` or `1` fails the run. The run warns at the start and its summary says the broker's certificate was not verified: checks 3, 4, 6, 11, 12 and `D2`-`D4` then pass without proving that the broker's TLS is trusted, so do not rely on such a run before a tag. |
| `E2E_BROWSER` | `1` | `0` skips the browser checks `B1`-`B9` and `D4` and does not start the browser container, for a machine that cannot pull the Playwright image. Never asked for; any value but `0` or `1` fails the run. The summary says the browser checks were skipped. |

The harness generates the gateway's TLS material and every gateway password (the gateway makes its own store key in `/data`), writes them only under `scripts/logs/e2e/`, and masks them in all it prints; it masks the broker passwords at any length. A broker password shorter than 8 characters cannot be looked for by checks 2, 13, 14, 17 and `B6` without matching ordinary text, and the run says so. It always ends with `docker compose down -v` and deletes that directory; the task runs `down -v` again as a backstop. The task runs the harness on the real terminal rather than through the log capture, so that it can ask; the harness appends its own masked output to `scripts/logs/e2e.log`. The SMF check uses the real SDK under Node through a loopback bridge, which adds the session cookie and a same-origin `Origin` the way a browser would; the bytes reach the gateway's `/managed/smf` socket unchanged. In Gateway mode the same bridge adds only an `Origin` and dials the Direct relay's `/wss/<port>/<host>`, which forwards the bytes to the broker.

Each check prints `PASS <id>.` or `FAIL <id>.`: 32 in a full run, 22 with `E2E_BROWSER=0`. Any failure exits 1, followed by the tail of the gateway log, and of the `direct` service's when a `D` check or the setup failed:

1. A wrong password is refused, and sign-in issues `__Host-smu-session` as `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, with no `Domain` and no lifetime.
2. `/managed/me` names the entitled broker and VPN only, with no address, port or credential.
3. A relayed SEMP v2 `GET` returns the queue you named; a forged `Authorization` header is not used.
4. A SEMP v1 `<show>` passes the relay; a v2 `PATCH` gets `403 read_only`.
5. `dial` returns the SMF path and the VPN credential, with `Cache-Control: no-store`.
6. A real SMF login through `/managed/smf` binds a queue browser to that queue.
7. The socket refuses a foreign `Origin`, a missing `Origin`, and a request without a session.
8. A broker the user is not entitled to is a `404` on relay, dial and socket, the same as an unknown one.
9. Signing out closes the open SMF session, and the old cookie gets `401`.
10. In Provisioned mode the Direct relay is closed: `/https/<port>/<host>/...` and `/wss/<port>/<host>` are plain `404`s, with or without a session.
11. Taking the e2e user's grant away (the administrator saves the user without a password and with `readOnly: []`) closes their open SMF socket at once. The session stays: `/managed/me` lists no broker, and the relay and `dial` for it are `404`s. The grant is then restored.
12. Settings apply to the next request. `modules.userDefault: none` empties the user's modules in `/managed/me`. `connModes: direct` is refused with `422`, and the saved value stays `provisioned`. `connModes: both` opens the Direct relay (a SEMP `GET` with the broker's own credentials returns the queue) and the app without a session. Restoring `provisioned` and `all` closes both again.

   The browser checks run here, before the sweep of check 13 and the restart of check 15. They use the app as a person does, in Chromium, at `https://gateway:9443` on the stack's network:

   - `B1` signs in through the gateway's own pages (one wrong password first) and lands in the app. The session cookie passes the rules of check 1, the browser holds it `HttpOnly`, and `document.cookie` is empty.
   - `B2` checks that the Provisioned panel offers only the entitled broker and VPN, and that the sidebar shows Connections, Queue Browser, Queue Copy and Queue Subscriptions (a fresh `config.yaml` offers all three).
   - `B3` changes `modules.userDefault` to `none` as the administrator; **Refresh** in the Provisioned panel re-reads `/managed/me` and the sidebar keeps only Connections. Restoring `all` and Refresh bring the three modules back. The app re-reads `/managed/me` only on load, on sign-in and on Refresh.
   - `B4` connects. The browser opens its own WebSocket to `/managed/smf/<broker>/<vpn>`, sending the cookie, `Origin` and `Sec-Fetch-Site` itself, and the page shows no broker address.
   - `B5` binds the queue in Queue Browser. The queue is `Read-Only`, with no Delete.
   - `B6` checks that browser storage holds no password, store key or session cookie.
   - `B7` checks `/solAdmin`: it refuses the e2e user with the 403 page, and the administrator signs in there and sees both users, both connections, and Backup & Restore with no schedule and a writable backup directory.
   - `B8` signs out from the sidebar. The browser's SMF socket closes, `/managed/me` gets `401`, and `/` goes to sign-in.
   - `B9` checks that no request or socket went to another origin and that no page threw.

   Then the Gateway-mode checks run, against the `direct` service at `https://127.0.0.1:39445` from the harness and `https://direct:9443` from the browser:

   - `D1`: `/hosted` says `{"hosted":true,"connModes":"direct","defaultConn":"direct"}`; `/` and `/login` serve the Direct app (the `#conn-host` form, no Provisioned panel); `/managed/me`, `/solAdmin`, `/provisioned.html` and `/solAdmin.html` are plain `404`s; the log says `conn_modes=direct`.
   - `D2`: the Direct relay forwards a SEMP `GET` with the caller's own `Authorization` and returns the queue; without it, the broker's `401` passes through; a malformed path is a `400` and an unknown host a `502`.
   - `D3`: a real SMF login through `/wss/<port>/<host>`, with the SDK under Node, binds a queue browser to the queue.
   - `D4`: in Chromium, fills the Direct form, connects SEMP and the client, and binds the queue in Queue Browser. The browser's WebSocket goes to `wss://direct:9443/wss/<port>/<host>`, the SEMP calls go through `https://direct:9443/https/...`, and nothing goes to another origin. The queue's badge is the broker's own permission for the client username, `Read-Only` or `Read-Write`. The app never reads the body of its SEMP connect probe, so that response is reported as not swept.

13. No response from either gateway carries a credential, except the body of the `dial` answer. This includes every response the browser received and every Gateway-mode response.
14. Both stores are sealed at rest (`SMUS` header, no plaintext).

    Check 19 runs here too: `/data/audit.log` is copied out of the gateway container and read as the audit trail: every line is a JSON object with the decided fields in order, an RFC 3339 UTC `time` and an `outcome` of `ok` or `refused`, and the log holds the refused sign-in (`bad_credentials`), the e2e user's sign-in, a `settings.update` naming `connModes` and `modules.userDefault`, and the `backup.export` and `backup.import` entries. It runs before check 17 reads the copy.

    Check 18 runs here, while the administrator's session and the gateway are up: an export holds no credential, host or hash in clear and previews as no change; a schedule's **Back up now** writes a file into the `/backup` volume, also sealed, which `GET /managed/backup/files/{name}` returns as written; a **Merge** import of that file, settings included, leaves the administrator signed in; the schedule is then removed.
15. After a restart the stores still open: old sessions are gone, and the administrator signs in again.
16. A missing key file beside an existing store refuses to start, naming both files (the check mounts a host copy of `users.yaml`, with no key, over `/data`).
17. Neither gateway log (both at `debug`), nor the audit log copied out by check 19, holds a password, store key (read from the gateway's `/data/store.key` with `compose cp`) or session cookie, the browser's included.

The browser trusts the gateways' throwaway certificate (both serve the same one) by ignoring certificate errors; the Node checks verify that certificate against the run's CA. The harness aborts any browser request to an origin other than the gateway its page was opened on, so nothing leaves the stack. Chromium runs without its own sandbox (Playwright's default in a container); the container's posture is the boundary, and its Playwright server takes one client at a time, the harness, which connects once for `B1`-`B9` and again for `D4`. The server is the `playwright-core` that `npm ci` installed, mounted read-only, so the image's tag must equal that version, and the image is pinned by digest; `tests/build/e2e-lib.test.ts` holds both. To move to a new version, bump `playwright-core` and the image tag and digest together. A failed browser check saves a screenshot to `scripts/logs/e2e-<check>.png` (git-ignored); no page the run opens shows a password.

The pure helpers (certificate issuing and reading, the broker details and their file, the cookie rules, the sealed-store header, masking and the secret sweep, and `parseAuditLog` and `auditMissing` for check 19) live in [`scripts/e2e-lib.mjs`](../scripts/e2e-lib.mjs) and are covered by `tests/build/e2e-lib.test.ts`, which runs in the ordinary suite without Docker.

---

## Code Standards

### TypeScript / JavaScript

- **Strict mode** is enabled. No `any` unless interfacing with the Solace SDK (`declare const solace: any`).
- **ES modules** (`import`/`export`). No CommonJS.
- **Factory functions** over classes for services. State lives in closure scope.
- **No global variables**. Modules receive dependencies via `AppContext`.
- Mixed TS/JS codebase: new files should be TypeScript. Existing `.js` files are acceptable, and `tsc` checks them (`checkJs`): give a parameter a JSDoc type where it cannot be inferred.

### Linting

`npm run lint` ([eslint.config.mjs](../eslint.config.mjs), run by `vet`) holds the rules above that a linter can see, and nothing else: type errors are `tsc`'s, and there are no style rules.

| Rule | Where | Why |
| --- | --- | --- |
| `@typescript-eslint/no-unused-vars` | `src/`, `tests/`, `scripts/`, the configs | Dead code hides intent and drifts. A leading `_` marks a parameter kept for its position. |
| `no-alert` | `src/` | `alert()`, `confirm()` and `prompt()` block the page; use the app's toast, or `confirmDialog()` from `src/core/components/confirm-dialog` for a yes/no question. |
| `no-restricted-properties`: `document.getElementById` | `src/`, except the shell (`core/kernel.ts`, `core/toast.ts`, `mock-broker/shell.ts`) | Module code reaches only its own container (see [DOM Access](#dom-access)). |
| `no-restricted-properties`: `console.*` | `src/`, except `core/logger.ts` | Logs go through `logger.withTag(<component>)`, which applies the level and the tag. `src/index.html`'s inline script is not linted. |
| `no-restricted-syntax`: `e.message \|\| fallback` | `src/` | The SDK puts the reason in `.message` or `.infoStr`; `solaceErrorText(e, fallback)` reads both (see [Error Handling](#error-handling)). |

A finding is fixed, not silenced. Where one must stay for now, an `// eslint-disable-next-line <rule> -- <date>: <reason>` comment names it; ESLint reports a disable comment that no longer suppresses anything.

### DOM Access

- Always scope queries to the module's `container` — never `document.getElementById()`.
- Cache element references at install time.
- **Required elements** (anything the module owns in its own `<template>`) are captured with `required()` from `src/core/dom.ts`:

  ```ts
  import { required } from '../../core/dom';
  const btnCopy = required<HTMLButtonElement>(container, '#btn-copy-config');
  btnCopy.disabled = false;  // no null-guard, no `!`
  ```

  Missing required elements throw `Required element missing: <selector>` at install time — no silent partial wiring.
- **Optional elements** (conditionally rendered, e.g. `.btn-delete-row` that only appears for non-read-only queues) stay as nullable `container.querySelector()` with an `if (el)` guard.
- Do **not** wrap null-guards on required elements with `/* v8 ignore */` — convert them to `required()` instead.

### Modals

- Use the native `<dialog>` element. Open with `dialog.showModal()`, close with `dialog.close()`. Visibility is driven by the `[open]` attribute, not a `.hidden` class.
- Wire backdrop-click-to-close via `attachBackdropClose(dialog)` from `src/core/dom.ts` — clicks where `e.target === dialog` mean the backdrop was hit; child clicks have `target !== dialog` and are ignored.
- Add `aria-labelledby` pointing at the dialog's title element so screen readers announce the modal name.
- The native browser handles Escape, focus trap, top-layer rendering, and `role="dialog"` + `aria-modal="true"` for free.
- Tests assert on `dialog.open` (boolean reflecting the `[open]` attribute), not `classList.contains('hidden')`. The `HTMLDialogElement.prototype.{showModal,show,close}` polyfill in `tests/setup.ts` covers jsdom's missing implementation by toggling the attribute.

### Event Handling

- Cross-module: use the typed `EventBus` exclusively.
- Intra-module: direct DOM `addEventListener`.
- Always provide both the event name and the typed payload from `BusEvents`.

### Error Handling

- Services return `{ ok: boolean; error?: string }` result objects.
- Wrap external calls (Solace SDK, fetch) in try/catch.
- Show user-facing errors in dedicated error elements, not `alert()`.
- Log developer-facing diagnostics through `logger.*` from [src/core/logger.ts](../src/core/logger.ts) — never raw `console.*`. The only exception is the inline `<script>` in `src/index.html`, which runs before any module loads. Pick the level by intent: `debug` for fine-grained internal trace, `info` for lifecycle/state-change banners, `warn` for recoverable mismatches, `error` for failures. The default boot level is `INFO`; override at runtime with `?logLevel=DEBUG` (or `WARN`, `ERROR`, `SILENT`).

### Logging standard

The full text is in [developer-guide.md -> Logging standard](developer-guide.md#logging-standard); a reviewer checks that each new log line:

- has the level its meaning calls for: `error` needs attention, `warn` is a recoverable problem, `info` a lifecycle, state-change or audit event, `debug` trace;
- names its component (a `logger.withTag(...)` tag in the app; `requestLogger(base, r)` attributes in the gateway) and the user, client, broker, VPN, queue or path it concerns;
- carries operations, error codes and counts as attributes (the gateway) or `key=value` after a fixed phrase (the app), not woven into prose;
- holds no secret at any level: no password, passphrase, store key, session cookie or `Authorization` header.

### File Organization

- One concern per file (not one class per file — there are no classes).
- Services: `service.ts`, `service-*.ts`. Never add a `service-*-mock.ts` sibling: the demo build runs the real services against the in-browser broker, so new demo behaviour goes in `src/mock-broker/` and is covered in `tests/mock-broker/`.
- UI: `ui.js`, `ui-*.ts`, `ui-*.js`
- State: `state.js`
- Orchestrator: `module.ts`
- Template: `index.html` (lives next to the code; the build plugin injects it into the shell)
- Styles: `styles.css` (module-scoped; the registry plugin imports it for every variant that lists the module, never `src/css/main.css`)
- Constants / icons: `constants.js`

---

## Testing Requirements

### Coverage Threshold

`vitest.config.ts` sets a **100% threshold** on all four metrics (Statements, Branches, Functions, Lines), over `src/` (the demo tree `src/mock-broker/` aside: `mock` reports its coverage without a threshold) and the four gate scripts `scripts/check-bundles.mjs`, `module-registry-plugin.mjs`, `npm-audit-gate.mjs` and `e2e-lib.mjs`. When coverage drops below 100% on any metric, `npm run test:coverage` reports `ERROR: Coverage for ... does not meet global threshold (100%)` at the end of the run. As of the May 2026 sweep the target is met (100% / 100% / 100% / 100%) -- see [test-report.md](test-report.md) for the per-file confirmation.

A PR should not regress coverage. A PR that restores a previously-covered file or branch is always welcome.

### Writing Tests

Every source file must have a corresponding test file in `tests/` mirroring the source directory structure:

```text
src/core/services/solace-client.ts
  -> tests/core/services/solace-client.test.ts

src/core/components/queue-picker/index.ts
  -> tests/core/components/queue-picker/picker.test.ts

src/modules/queue-browser/service.ts
  -> tests/modules/queue-browser/service.test.ts
```

The mirror works for both module-owned files (`src/modules/<id>/…` ↔ `tests/modules/<id>/…`) and the core layer (`src/core/…` ↔ `tests/core/…`).

### Test Pattern

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

describe('ModuleName', () => {
    let ctx: any;

    beforeEach(async () => {
        // 1. Load the real per-module HTML template so the test DOM cannot drift
        //    from what ships in the build. Pass the module's directory name
        //    under src/modules/.
        const container = loadModuleDOM('your-module-id');

        // 2. Construct mock AppContext
        ctx = {
            container,
            appState: { /* initial state */ },
            eventBus: createEventBus(),  // Use REAL EventBus
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: {}
        };

        // 3. Install module
        await YourModule.install(ctx);
    });

    it('handles user action', () => {
        // 4. Interact with DOM
        container.querySelector('#my-button').click();

        // 5. Assert results
        expect(ctx.setState).toHaveBeenCalledWith('key', 'value');
    });
});
```

- **Always use `loadModuleDOM(moduleId, entry?)`** ([tests/helpers/loadModuleDOM.ts](../tests/helpers/loadModuleDOM.ts)) for module-level tests instead of hand-rolling an `innerHTML` literal. The helper reads the real `src/modules/<id>/index.html` (or, with `entry`, the composed `index.<entry>.html`) and appends a container to `document.body` — so when a template grows a new element, every test picks it up automatically.
- The `moduleId` parameter is a plain `string` (the directory name under `src/modules/`); a typo throws at read time. The compile-time enumeration was dropped along with `src/module-ids.ts` when active modules moved to the variant manifests under [src/variants/](../src/variants/).
- **Inline shell scripts are tested by reading them out of the shell.** The loader in `src/index.html` has no module to import, so `tests/shell-loader.test.ts` extracts the real inline script text from the file and runs it in jsdom (fake timers for its 30 s watchdog), instead of copying the logic into the test. `tests/build/vendor-blocks.test.ts` pins the `@vendor` blocks against `VENDOR_MARKERS`.
- For tests that explicitly need a partial or malformed DOM (e.g. to verify a defensive path with a missing element), keep the inline `innerHTML` — that's a legitimate exception.

### Defensive-Guard Tests

When a function has a null/missing-element guard (e.g. `if (!els.modalRaw) return;`) and the test exists to cover the guard's early-return branch, **pair `.not.toThrow()` with a state or DOM snapshot assertion**. A bare `.not.toThrow()` passes whether the guard correctly short-circuits OR the function silently corrupts state — the test can't tell the difference.

```ts
// Weak — only proves "no crash"
it('returns early when modal is missing', () => {
    els.modalRaw = null;
    expect(() => ui.showRawContent({ _originalMsg: { dump: () => 'x' } })).not.toThrow();
});

// Strong — also proves the guarded body didn't run
it('returns early when modal is missing — rawContentText not written', () => {
    els.modalRaw = null;
    els.rawContentText.textContent = 'preserved';
    expect(() => ui.showRawContent({ _originalMsg: { dump: () => 'x' } })).not.toThrow();
    expect(els.rawContentText.textContent).toBe('preserved');
});
```

Skip this only for **pure-parameter** functions where the params themselves are the complete observable surface (e.g. `clearInputs(null, null, null)` — the function takes its targets as arguments and mutates nothing else).

### Cross-Module Integration Tests

Tests under `tests/integration/` exercise events and data flow that cross module (or layer) boundaries — where a bug can only surface if two modules agree on an event name and payload shape, or where a pipeline runs end-to-end. Three reference files, each with a distinct scope:

- `tests/integration/full-flow.test.ts` — Kernel mechanics with stub modules (EventBus sharing, `setState` during install, cross-module event delivery).
- `tests/integration/module-events.test.ts` — real `ConnectionsModule` and `QueueBrowserModule` installs with `vi.mock`-d service factories, asserting far-end reactions (ACK/REJECT wiring, config propagation, disconnect cleanup).
- `tests/integration/message-pipeline.test.ts` — broker-shaped messages through `serviceEvents.onMessage` → `ingestMessage` → `shouldShowMessage` → DOM, asserting filter gating and the live render path.

The pattern for the first two files:

- **Share one `EventBus` across modules.** Construct a single `AppContext` with `createEventBus()` and spread it into each `install()` call with a module-specific `container`: `await QueueBrowserModule.install({ ...ctx, container: browserContainer })`. Modules mutate the shared `appState` through the shared `setState`, so a `setState('isSempConnected', false)` on the context is visible to every installed module.
- **Mock service factories at the top of the file with `vi.mock`.** Hoisting means module imports must come *below* the mock declarations. Keep factory stubs minimal (`{ ok: true }` return for `createBrowser`, no-op `vi.fn()` for I/O methods) — unit tests cover the service internals.
- **Emit `app:state-change` from `setState`.** The helper `makeCtx` wraps `setState` so it both mutates `appState` and emits the event — modules that subscribe to `isSempConnected`/`isConnected` transitions need this to fire.
- **Reset the `state.js` singleton in `beforeEach`.** Call `resetQueueBrowserState()` from [tests/helpers/resetQueueBrowserState.ts](../tests/helpers/resetQueueBrowserState.ts) -- it resets every field `state.js` declares on the singleton (`browserInstances`, `messageStore`, `currentQueue`, `currentQueuePermissions`, `allMessages`, `displayedMessages`, `forwardQueue`, `selectedMessage`, `activeFilters`, `maxMessagesPerQueue`), so a field a UI file starts to use belongs in `state.js` with a default, never added to `state` at runtime. Every queue-browser test file (unit + integration) uses this helper so partial-reset drift cannot leak mutations across files.
- **Assert the far-end effect, not the event emission.** The integration value is proving the other module *reacted* — e.g. `mockCreateBrowser` was called with the queue name, `ui.updateForwardItemStatus` was called with the correlation value. Asserting only that the event was emitted duplicates unit-test coverage.

### Test Isolation: Global Hooks

[tests/setup.ts](../tests/setup.ts) installs global `beforeEach`/`afterEach` hooks that absorb several common isolation bugs so individual tests don't have to:

- **Default mock implementations are re-installed every test.** `vi.clearAllMocks()` only clears call history, not `.mockReturnValue()` / `.mockImplementation()` / `.mockReturnValueOnce()` overrides. The global `beforeEach` explicitly re-installs defaults for `localStorage` (all five methods), `confirm` (returns `true`), `alert` (no-op), `URL.createObjectURL` (returns `'blob:mock-url'`), `URL.revokeObjectURL` (no-op), and `navigator.clipboard.writeText` (resolves `undefined`). You can still override any of these within a test via `mockReturnValue` / `mockImplementation` / `mockReturnValueOnce`; the default is restored before the next test runs.
- **A fresh Solace SDK mock every test.** The global `beforeEach` calls `(window as any).solace = createSolaceMock()`. This prevents stale `_handlers` entries (e.g. from `mockSession._handlers[UP_NOTICE] = …`) from firing in subsequent tests. Test files that create their own mock in their own `beforeEach` simply overwrite this default.
- **Fake timers are always reverted.** The global `afterEach` unconditionally calls `vi.useRealTimers()`. Tests that call `vi.useFakeTimers()` do not need a matching `useRealTimers()` — if a test throws before its own cleanup line, the global hook still brings the next test back to real timers so `setTimeout`-based code doesn't hang.

### Solace Mock Behaviour

Two fidelity guards help catch production bugs early:

- **`session.on` / `browser.on` validate the event code.** Both mocks call `validateEventCode` against the relevant enum (`SessionEventCode` / `QueueBrowserEventName`) on the current `window.solace` object and throw with a diagnostic message if an unknown code is registered. A production bug like `browser.on('UP_NOTICE', …)` (the browser's correct code is `'UP'`) will fail fast in tests instead of silently passing.
- **Message setters return `this` for chaining.** All `createMessageMock()` setters use `.mockReturnThis()`, so `msg.setDestination(x).setBinaryAttachment(y)` works in tests the same way it works against the real SDK. Keeps future refactors safe.

### Gateway Contract

[go-web-proxy/testdata/contract/](../go-web-proxy/testdata/contract) is what the Provisioned demo's fake gateway is held to:
- `seed.json`: users, connections, the settings the gateway starts with, and the client address.
- `cases.json`: request steps, each with the status and body the real gateway answers.
- `validation.json`: vectors for the checks behind a `422`, and the glob vectors `rbac_test.go` runs.
- `throttle.json`: sign-in throttle vectors (fail, succeed, advance the clock, the wait a sign-in must get), run by `throttle_test.go` and `tests/mock-broker/gateway/throttle.test.ts`.
- `backup.json`: one encrypted backup file with its passphrase, which both gateways must open; `backup_test.go` and `tests/mock-broker/gateway/backup.test.ts` open it, and `cases.json` previews and imports it against `seed.json`.

[`contract_test.go`](../go-web-proxy/contract_test.go) proves that the real gateway gives exactly the `seed.json`, `cases.json` and `validation.json` answers, and [`tests/mock-broker/gateway/contract.test.ts`](../tests/mock-broker/gateway/contract.test.ts) proves the fake gives the same ones from the same files. A gateway change that alters one fails the Go test first, then the fake's, until the fake follows.

When the change is deliberate, rewrite the answers in `cases.json` from the real gateway (the other files are written by hand), review the diff, then bring the fake in line:

```bash
cd go-web-proxy && go test -run Contract -update .
```

Each case runs on a fresh gateway over the seed. A case's sessions are opened before its first step, so a step after a revocation still uses the cookie the user held. Usage: put `as` (a username) on a step to send it signed in, `mustChange: true` for a session held at the password page, `body` for JSON and `raw` for an XML body. Store paths in a settings body read `<path>`.

Three suites hold the Provisioned demo to the app as well:
- `tests/mock-broker/gateway/routes.test.ts`: every gateway route through the service that ships, keyed by method + path template (for example `PUT /managed/users/{name}`); a route with no row, or a row no helper calls, fails. A new route under an existing segment needs its own row.
- `tests/mock-broker/gateway/error-codes.test.ts`: a new error code in `managed-api.ts` needs a place. It is a contract golden, a fault the demo panel arms, a code the app makes itself, or a code the demo does not simulate.
- `tests/mock-broker/demo-flow.test.ts`: whole sessions through the real Kernel, the `managed-demo` variant's modules and the demo's boot.

### Stubbing Globals

Prefer `vi.spyOn(target, 'prop').mockReturnValue(...)` / `.mockImplementation(...)` over direct reassignment (`target.prop = vi.fn(...)`). The spy form is auto-restored by `vi.restoreAllMocks()` in the global `afterEach` in [tests/setup.ts](../tests/setup.ts), so a test body that throws before a manual restore line runs cannot leak the stub into the next test.

```ts
// Avoid — manual restoration is skipped on failure, leaks into next test
const orig = document.getElementById;
document.getElementById = vi.fn(() => null);
// ...assertions...
document.getElementById = orig;  // never runs if an expect() above fails

// Prefer
vi.spyOn(document, 'getElementById').mockReturnValue(null);
// ...assertions... (auto-restored after the test)
```

### v8 Coverage Ignores

Use `/* v8 ignore start */` / `/* v8 ignore stop */` **only** for code that is architecturally untestable in jsdom. Valid categories:

| Category | Example |
| --- | --- |
| jsdom limitations | A browser API jsdom does not implement |
| SDK callback branches | Error paths inside Solace SDK callbacks the test harness can't deterministically fire |
| Defensive `catch` on trusted contracts | Services return `{ok, error}` and never throw, but a `catch` guards against SDK misbehavior |
| Redundant safety checks | Both branches produce identical results |

**Not valid categories** (convert instead of ignoring):

- **DOM null-guards on required elements** — use `required()` from `src/core/dom.ts`. The helper throws with a clear message and removes the nullable type, so no guard is needed.
- **`|| 'fallback'` on values the service always sets** — drop the fallback or push the default into the service.
- **Registering SDK callbacks that are covered by dedicated tests** — wire the mock to invoke the handler directly; `.on.mock.calls` gives you the registered function.
- **Setup throws and race guards that a test can reach** -- `vi.doMock` of a module (the registry's `virtual:module-registry`) or a source whose listing awaits a deferred (the queue picker's `source tail` tests) reaches them. A catch around a call the mock can be made to throw from (the publisher's `safeSet`, the client's stale `disconnect()`) is tested with that throw, not ignored.

**Never** use v8 ignore to skip testing real business logic. Every `/* v8 ignore */` must have an inline comment explaining why the code is architecturally untestable.

### Running Tests

```bash
./scripts/dev.sh test  # Web (without tests/mock-broker/, which `mock` runs) + Go
./scripts/dev.sh cov   # With coverage report (text + HTML in coverage/)
npm run test:watch     # Watch mode — the one case where the npm script is the right entry point
```

The `--pool=threads` flag is included in the npm scripts the tasks call; the worker count is left to Vitest.

---

## Pull Request Checklist

- [ ] `./scripts/dev.sh all` is green (build, vet, test — both the web and Go halves — and mock)
- [ ] New code has corresponding tests
- [ ] Coverage does not regress (`./scripts/dev.sh cov`); targets 100% per `vitest.config.ts` thresholds
- [ ] `vet` passes: both type-checks (the build uses esbuild and does **not** type-check, so `tsc` over `src/` and over `tests/` + the configs is a separate gate), `npm run lint`, `go vet` and `gofmt -l`
- [ ] If you changed a build command, it went into **both** `scripts/dev.sh` and `scripts/dev.ps1` — never into workflow YAML
- [ ] No new `any` types (except Solace SDK interface)
- [ ] DOM access is container-scoped
- [ ] SDK/exception text goes through `solaceErrorText(e, fallback)` (core/utils.ts) — the SDK splits the reason across `.message` (QueueBrowser `OperationError`) and `.infoStr` (Session events); reading one loses it
- [ ] Cross-module communication uses EventBus (no direct imports)
- [ ] v8 ignores have explanatory comments
- [ ] Provisioned mode / RBAC (if touched): module gating goes through `MODULE_REQUIREMENTS` (rbac.ts); the managed profile stays in `managedProfile` (names only), never `AppState`; a dialled password goes straight to the SDK inside the `dial` callback and is never stored; the gateway endpoint paths (`/managed/dial`, `/managed/relay/`) stay in Provisioned-only files (`npm run check:bundles`)
- [ ] Commit message describes the change clearly

---

## Architecture Notes

Before making changes, read:

- [architecture.md](architecture.md) — System diagrams and data flow
- [developer-guide.md](developer-guide.md) — Setup, conventions, module creation guide
- [test-report.md](test-report.md) — Testing methodology and v8 ignore rationale

Key rules:

1. **No cross-module imports** — use EventBus
2. **No global state** — use AppContext or module-scoped closures
3. **No `document.getElementById()`** — use `container.querySelector()` or `required()`
4. **Required elements use `required()`, optional ones use nullable checks** — no null-guard + v8-ignore pairs on module-owned elements
5. **Factory functions, not classes** — state in closures
6. **Test coverage target is 100%** — enforced via `vitest.config.ts` thresholds; met as of the May 2026 sweep across all four metrics (see `test-report.md`)
