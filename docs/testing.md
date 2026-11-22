# Testing

## Contents

- [Who this is for](#who-this-is-for)
- [Running the tests](#running-the-tests)
- [How the tests are organized](#how-the-tests-are-organized)
  - [Layout of tests](#layout-of-tests)
  - [Web suite](#web-suite)
  - [Demo and fake gateway suite](#demo-and-fake-gateway-suite)
  - [Go suite](#go-suite)
  - [Integration tests](#integration-tests)
  - [Type check and lint](#type-check-and-lint)
- [Gateway contract cases](#gateway-contract-cases)
- [Coverage policy](#coverage-policy)
  - [Thresholds and floors](#thresholds-and-floors)
  - [v8 ignore policy](#v8-ignore-policy)
- [Writing tests](#writing-tests)
  - [Module tests](#module-tests)
  - [Test DOM](#test-dom)
  - [Global hooks](#global-hooks)
  - [Solace mock](#solace-mock)
  - [Stubbing globals](#stubbing-globals)
  - [Defensive-guard tests](#defensive-guard-tests)
  - [Shared state](#shared-state)
  - [Node test files](#node-test-files)
  - [Cross-references](#cross-references)
- [End-to-end run](#end-to-end-run)
  - [What it does](#what-it-does)
  - [What it changes](#what-it-changes)
  - [Requirements](#requirements)
  - [Broker details](#broker-details)
  - [The checks](#the-checks)
  - [Browser and harness notes](#browser-and-harness-notes)

## Who this is for

Developers who change the app (TypeScript) or the gateway (Go) and need to know how the tests are built, how to run them, what coverage the project holds you to, and how to write a new test that fits. It covers every suite: the web suite, the demo and fake-gateway suite, the Go suite, the contract cases both gateways share, and the end-to-end run against a real broker.

It does not cover the dev-script tasks as a whole or the pull request checklist (see [contributing.md](contributing.md)), nor the code conventions the tests check (see [developer-guide.md](developer-guide.md)).

## Running the tests

Every gate is a task in `scripts/dev.sh` (and the mirrored `scripts/dev.ps1`). CI calls the same task names, so a local run and a CI run agree.

| Task | What it runs |
|---|---|
| `./scripts/dev.sh test` | The web suite without `tests/mock-broker/`, then the Go suite. When `cov` is queued in the same invocation, both are skipped here and `cov` runs them once. |
| `./scripts/dev.sh mock` | `tests/mock-broker/` with coverage reported over `src/mock-broker/` (no threshold). Skipped when `cov` is queued. |
| `./scripts/dev.sh cov` | The whole web suite with the 100% thresholds, then the Go suite with `-race` and a coverage profile. Prints the web and Go totals. |
| `./scripts/dev.sh vet` | Type check, lint and Go vet: see [Type check and lint](#type-check-and-lint). |
| `./scripts/dev.sh e2e` | The end-to-end run: see [End-to-end run](#end-to-end-run). Local only, never in `all` or `full`. |
| `./scripts/dev.sh all` | `build vet test mock`. CI runs `all cov scan`. |

Each task writes `scripts/logs/<task>.log`. While fixing a failure, rerun only the task that failed.

For a tight loop on one file, use the npm scripts directly:

```bash
npm run test:watch                                  # watch mode, the one case where the npm script is the right entry point
npx vitest run --pool=threads tests/core/dom.test.ts   # one file
npm run test:mock:coverage                          # the demo suite with its coverage report
```

All npm test scripts pass `--pool=threads` and leave the worker count to Vitest (one less than the CPU count in a run, half of it in watch mode). If multi-file instability ever appears (`Vitest failed to find the runner` and similar), `--pool=forks` is the fallback: each file runs in its own process, at the cost of start-up time.

The Go suite runs with the race detector (`CGO_ENABLED=1 go test -race`) wherever `gcc` is on the path, on both CI runners included. Without `gcc` it runs without `-race` and says so in the task log; in CI a missing `gcc` fails the task instead, because the concurrency tests only fail under the detector. Run it directly from the gateway directory with `go test ./...`.

## How the tests are organized

### Layout of tests

The test tree mirrors the source tree. `src/foo/bar.ts` is tested by `tests/foo/bar.test.ts`, for module-owned files (`src/modules/<id>/...` to `tests/modules/<id>/...`) and for the shared layer (`src/core/...` to `tests/core/...`). Every source file in the coverage scope has a test file.

| Directory | Holds |
|---|---|
| `tests/core/` | The kernel, event bus, toast, utilities, RBAC matchers, the services (`services/`), the reusable components (`components/<name>/`) and the connection-mode persistence (`connections/`). |
| `tests/modules/<id>/` | One directory per module, including the admin modules (`user-management`, `connection-management`, `gateway-settings`, `backup`, `tls-certificates`) and the `admin-login` entry point. |
| `tests/integration/` | Flows that cross modules: see [Integration tests](#integration-tests). |
| `tests/mock-broker/` | The in-browser demo broker and the fake gateway: see [Demo and fake gateway suite](#demo-and-fake-gateway-suite). |
| `tests/build/` | The build and gate scripts: the module registry plugin, `check-bundles`, the Content-Security-Policy (`csp`, and `no-inline-styles`, which scans the source for what the policy refuses), `no-network-apis` (the app's source reaches the network through `fetch` and the Solace SDK only), `npm-audit-gate`, `vite-build`, the e2e helpers, the workflow and compose files, vendor scripts and blocks, and the docs links. |
| `tests/helpers/` | Shared helpers, not test files: `loadModuleDOM.ts`, `appContext.ts` (a complete `AppContext` from the fields a test cares about), `confirmDialog.ts` (answers the core confirm dialog), `resetQueueBrowserState.ts`, `sources.ts` (the app's source files, for tests that scan them), `savePicker.ts` (a stand-in for the browser's save dialog, `showSaveFilePicker`, which jsdom lacks) and `compose.ts` (compose files read as text). |
| `tests/` root | `main.test.ts` (bootstrap), `registry.test.ts`, `variants.test.ts` (every variant manifest resolves and keeps its shape, and the gateway's module catalog equals the Provisioned variant's module-controlled modules) and `shell-loader.test.ts`. |
| `tests/setup.ts` | The global setup every file runs: see [Global hooks](#global-hooks). |

The inline script in the shell (`src/index.html`) has no module to import, so `tests/shell-loader.test.ts` reads the real script text out of the file and runs it in jsdom with fake timers for its watchdog, rather than copying the logic into the test. `tests/build/vendor-blocks.test.ts` pins the `@vendor` blocks against the markers `check:bundles` looks for.

### Web suite

Vitest 4 with the jsdom environment, the v8 coverage provider and `tests/setup.ts` as the global setup, configured in `vitest.config.ts`. It runs every `tests/**/*.test.ts` file. The tests are black-box at the module boundary: each source file is tested through its exported API by driving the DOM and checking state, bus events and mock calls, not internals.

The shape rests on one rule: mock the platform, test the logic. The Solace SDK (`window.solace`, a commercial library that cannot run in Node), the DOM APIs jsdom lacks and the network are mocked. The application code runs unmodified over them. The real `EventBus` is used, not a mock, because many tests verify cross-module communication by registering listeners and checking that they fire.

### Demo and fake gateway suite

`tests/mock-broker/` tests the in-browser demo broker behind `demo.html` and the fake gateway behind the Provisioned demo (`src/mock-broker/`; see [demo.md](demo.md)). It is where new demo behaviour is covered: extend `src/mock-broker/` and add the test here, never a separate `*-mock` service.

`src/mock-broker/` is outside the 100% gate, because it is mock-only code that never enters a production bundle, but its coverage is reported. `./scripts/dev.sh mock` runs `npm run test:mock:coverage`, which uses `vitest.mock.config.ts` (the base config with coverage over `src/mock-broker/` only, no thresholds, written to `coverage/mock-broker/` so it never wipes the report `cov` wrote to `coverage/`) and prints the total.

Three suites hold the Provisioned demo to the app as well:

- `tests/mock-broker/gateway/routes.test.ts`: every gateway route through the service that ships, keyed by method and path template (for example `PUT /managed/users/{name}`). A route with no row, or a row no helper calls, fails. A new route under an existing segment needs its own row.
- `tests/mock-broker/gateway/error-codes.test.ts`: a new error code in `managed-api.ts` needs a place. It is a contract golden, a fault the demo panel arms, a code the app makes itself, or a code the demo does not simulate.
- `tests/mock-broker/demo-flow.test.ts`: whole sessions through the real kernel, the Provisioned demo variant's modules and the demo's boot.

### Go suite

The gateway lives in [go-web-proxy/](../go-web-proxy). It is one binary for every container mode, so `go test ./...` from that directory runs all of it. Test files sit beside the code they test (`*_test.go`). The areas they cover:

| Area | Test files |
|---|---|
| Proxy, relay and sockets | `main_test.go`, `proxy_test.go` (including which bundle `/` serves per mode), `relay_test.go`, `sockets_test.go`, `smf_test.go`, `dial_test.go` |
| Configuration | `configfile_test.go` (`config.yaml` seeding, strict decoding, environment overrides), `live_test.go` (live settings and restart-only keys), `settings_test.go`, `logging_test.go` |
| TLS and restart | `tls_test.go`, `tls_api_test.go`, `restart_test.go` and its platform variants |
| Client access | `access_test.go` (access list, `X-Forwarded-For` trust, the forwarding headers sent to brokers, hijack pass-through) |
| Stores | `store_test.go`, `writer_test.go`, `storecrypt_test.go`, `keyfile_test.go`, `fileutil_test.go`, `backup_test.go`, `backup_api_test.go` |
| Provisioned API and pages | `managed_test.go` (the `/managed/*` API behind its session gate: uniform 401, every error code, body cap, cross-origin refusal, no secret leak), `managed_routing_test.go`, `pages_test.go`, `audit_test.go` |
| Sign-in | `password_test.go`, `session_test.go` (sessions and sign-in tickets), `throttle_test.go`, `totp_test.go` (RFC 6238 vectors, replay guard, recovery codes, QR drawing) |
| RBAC | `rbac_test.go` (globs, entitlement and the TypeScript/Go conformance vectors) |
| Contract | `contract_test.go`: see [Gateway contract cases](#gateway-contract-cases) |

The store tests include concurrent readers and writers that only the race detector can fail, so they mean something only under `-race`. The Go suite is not part of the Vitest coverage scope: the 100% gate applies to the front end, and the Go total is held to a floor instead (see [Thresholds and floors](#thresholds-and-floors)).

### Integration tests

`tests/integration/` exercises events and data flow that cross module boundaries, where a bug only shows if two modules disagree on an event name or payload shape, or where a pipeline runs end to end. Three files, each with its own scope:

| File | Scope |
|---|---|
| `module-events.test.ts` | The real Connections and Queue Browser modules on one shared bus, with service factories mocked via `vi.mock`: the VPN-switch handoff, `config:max-messages-changed` propagation, and `client:disconnected` cleanup of in-flight forward items. |
| `message-pipeline.test.ts` | Broker-shaped messages through `service-events.onMessage`, ingest, filtering and DOM rendering with no module mocked: a content filter gates rows, a filter cleared mid-stream does not re-render, messages for a non-current queue ingest without touching the DOM, the destination-type filter reads `window.solace.DestinationType`. |
| `admin-session.test.ts` | The `/solAdmin` session lifecycle with the real admin-login and user-management modules: changing or deleting your own account signs the admin app out, an edit without a password keeps the session. |

How to write one:

- **Share one `EventBus`.** Build a single `AppContext` with `createEventBus()` and spread it into each `install()` with a module-specific container: `await QueueBrowserModule.install({ ...ctx, container: browserContainer })`. Modules mutate the shared `appState` through the shared `setState`.
- **Mock service factories at the top of the file with `vi.mock`.** Hoisting means module imports go below the mock declarations. Keep the stubs minimal; unit tests cover service internals.
- **Emit `app:state-change` from `setState`.** The `makeCtx` helper wraps `setState` so it both mutates `appState` and emits the event, which modules watching `isSempConnected` or `isConnected` need.
- **Assert the far-end effect, not the emission.** The value is proving the other module reacted (for example, `createBrowser` was called with the queue name). Asserting only that an event was emitted repeats the unit tests.

Integration tests never reach a broker. `window.solace` is the mock throughout. They test that modules coordinate, not the fidelity of the broker connection; broker behaviour through the real SDK and the gateway is covered only by the [end-to-end run](#end-to-end-run). The typed-credentials-to-bound-queue journey is also only in the end-to-end run. Receiving live messages is covered by neither suite: the end-to-end run only browses an existing queue.

### Type check and lint

The build (Vite and esbuild) and Vitest strip TypeScript types without checking them, so a type error never fails a build or a test. `tsc` is the only thing that catches one, and it runs in `./scripts/dev.sh vet`: `npm run typecheck` (`tsc --noEmit` over `src/`, its `.js` modules included through `checkJs`), `npm run typecheck:tests` (`tsc -p tsconfig.test.json --noEmit` over `tests/` and the vite and vitest configs, so a fixture typed as a production type fails when that type changes), `npm run lint` (ESLint with the house rules in `eslint.config.mjs`), `go vet` and `gofmt -l`. CI runs it through `all cov scan`. Code you touch must pass `vet` clean, the same bar as the coverage rule.

## Gateway contract cases

[go-web-proxy/testdata/contract/](../go-web-proxy/testdata/contract) is what the Provisioned demo's fake gateway is held to. Both gateways read the same files:

| File | Holds | Read by |
|---|---|---|
| `seed.json` | Users, connections, the settings the gateway starts with, and the client address. | `contract_test.go`, `tests/mock-broker/gateway/contract.test.ts` |
| `cases.json` | Request steps, each with the status, the body and, where a step lists them, the headers the real gateway answers (`""` for a header that must be absent). | the same two |
| `error-codes.json` | Every error code the real gateway can send, read from its source: each `writeError` call and each `apiError` literal. | `contract_test.go`, `tests/mock-broker/gateway/error-codes.test.ts` |
| `validation.json` | Vectors for the checks behind a `422`, and the glob vectors. | `contract_test.go`, `rbac_test.go`, `tests/core/rbac.test.ts` |
| `throttle.json` | Sign-in throttle vectors: fail, succeed, advance the clock, the wait a sign-in must get. | `throttle_test.go`, `tests/mock-broker/gateway/throttle.test.ts` |
| `totp.json` | The RFC 6238 SHA-1 vectors (the ASCII secret `12345678901234567890`, as base32 too). The fake gateway's codes are not TOTP, so it does not read it. | `totp_test.go`, `tests/build/e2e-lib.test.ts` |
| `backup.json` | One encrypted backup file with its passphrase, which both gateways must open. | `backup_test.go`, `tests/mock-broker/gateway/backup.test.ts`; `cases.json` previews and imports it against `seed.json` |

`contract_test.go` proves the real gateway gives exactly the `seed.json`, `cases.json` and `validation.json` answers, and `tests/mock-broker/gateway/contract.test.ts` proves the fake gives the same ones from the same files. A gateway change that alters one answer fails the Go test first, then the fake's, until the fake follows. `contract_test.go` also proves `error-codes.json` lists exactly the codes the gateway's source can send, and `tests/mock-broker/gateway/error-codes.test.ts` proves the app has a message for each of them and for no other gateway code.

When a change is deliberate, rewrite the answers in `cases.json` and the list in `error-codes.json` from the real gateway (the other files are written by hand), review the diff, then bring the fake and the app's messages in line:

```bash
cd go-web-proxy && go test -run Contract -update .
```

Each case runs on a fresh gateway over the seed. A case's sessions are opened before its first step, so a step after a revocation still uses the cookie the user held. To write a step, put `as` (a username) on it to send it signed in, `mustChange: true` for a session held at the password page, `body` for JSON and `raw` for an XML body. Store paths in a settings body read `<path>`.

The cases cover the JSON API, `/managed/*`:

- **Headers.** One read and one write of each family pin `Cache-Control: no-store` and `Content-Type` (`application/json` on a body, none on a `204`); the relay's cases pin the headers it passes on and the ones it drops.
- **Rate limits.** Past `login.unauthenticatedPerMinute`, a request without a session is `429 rate_limited` with `Retry-After`, and a signed-in request is not charged. Past `session.connectsPerMinute`, a dial is the same `429`, after the entitlement check, and each user has their own count.
- **Two-factor:** the `twoFactor` flag on user rows and in `me`, the reset (`404` for an unknown user, `200` with the rev unchanged for a user without two-factor), and a settings save of each of the three `login.twoFactor` values (`optional`, `admins`, `mandatory`) and of bad ones, `off` among them (`422`, the mode unchanged). The seed and every recorded `me` body hold `optional`.

The sign-in and two-factor pages are not in the cases, because the fake draws them in the page instead of serving them. They, and the enrolled paths, which need codes, are covered by each gateway's own tests (`pages_test.go`; `tests/mock-broker/gateway/pages.test.ts` and `two-factor.test.ts`) and by the end-to-end run.

## Coverage policy

### Thresholds and floors

`vitest.config.ts` sets a 100% threshold on statements, branches, functions and lines. The suite meets it on all four metrics, and the policy is to keep it there. When a metric slips, `./scripts/dev.sh cov` ends with `ERROR: Coverage for ... does not meet global threshold (100%)`.

- **What is measured:** `src/**/*.ts` and `src/**/*.js`, plus five scripts: `scripts/check-bundles.mjs` (the bundle-isolation gate), `scripts/csp.mjs` (each bundle's Content-Security-Policy, and its check), `scripts/module-registry-plugin.mjs` (the module registry the build generates), `scripts/npm-audit-gate.mjs` and `scripts/e2e-lib.mjs` (the end-to-end run's helpers). Each is also driven through its command-line path in `tests/build/`. The other scripts are thin wrappers (`vite-build.mjs`, tested in `tests/build/vite-build.test.ts`) or the end-to-end harness itself.
- **Why the include list matters:** Vitest 4 has no `all` option and reports every file matched by `include`, even one no test imports. A file with no test therefore fails the threshold instead of being silently left out.
- **What is excluded:** `src/css/**`, `src/index.html`, `src/modules/queue-browser/constants.js` (icon constants) and `src/mock-broker/**` (reported by `mock`, see [Demo and fake gateway suite](#demo-and-fake-gateway-suite)).
- **Code you touch must be fully covered** by tests in the same change. Branch added, test added; branch removed, test removed or repurposed. Security and error boundaries are always covered: bad input is rejected and the downstream call is not made, every error code, every fallback path.
- **The Go total has no threshold.** The floor is the previous total in `scripts/logs/cov.log`, which `cov` prints and logs. A new total below it needs either the missing tests or a stated reason (deleting dead code can legitimately lower it). CI is a fresh checkout with no prior log, so that comparison only exists locally. The 100% web thresholds do gate every release, because CI runs `all cov scan`.
- **No number is recorded here.** Run `cov` for the current totals and file and test counts.

Tests should reflect real scenarios, not ceremony. A test that adds no value can be removed; if it covered live behaviour, replace it so coverage of that behaviour does not drop.

### v8 ignore policy

v8 ignores are a last resort. Use `/* v8 ignore start */` ... `/* v8 ignore stop */` only for code that cannot be tested, and give every block an inline comment saying why.

Use the start and stop form, never `/* v8 ignore next */`. The single-line form suppresses statement and line coverage but does not reliably suppress branch coverage: v8 tracks the untaken side of a branch as a range with no source line, which the next-N-lines directive may not map to. The start and stop form excludes every coverage range inside it.

Sanctioned categories:

| Category | Example in the tree |
|---|---|
| jsdom limitations | A page reload in `gateway-settings/module.ts`, which jsdom does not implement. |
| SDK callbacks the harness cannot fire | A guard inside an SDK event callback that needs state the SDK never produces. |
| Defensive `catch` around a contract that never throws | `Session.dispose()` in `solace-client.ts` and `removeListener` in `solace-publisher.ts`, which the SDK documents as non-throwing; the queue picker's and subscription explorer's `for await` loops over sources that catch every error and yield `{ok:false}`. |

Not valid, so convert instead of ignoring:

- **DOM null-guards on required elements.** Use `required()` from `src/core/dom.ts`: it throws a clear message at install time and removes the nullable type, so no guard is written. Only genuinely optional elements (for example `.btn-delete-row`, rendered only for non-read-only queues) keep a nullable `querySelector` and an `if`, and those get tests for both branches.
- **`|| 'fallback'` on values a service always sets.** Drop the fallback or move the default into the service.
- **Registering SDK callbacks.** Wire the mock to invoke the handler directly; `.on.mock.calls` gives you the registered function.
- **Setup throws and race guards a test can reach.** `vi.doMock` of a module (the registry's `virtual:module-registry`) or a source whose first listing awaits a deferred (the queue picker's `source tail` tests) reaches them. A `catch` around a call the mock can be made to throw from is tested with that throw, not ignored.
- **A v8 branch artifact on a chained `else if`.** v8 can miss a branch hit on `else if (method() === X)` chains. Add an explicit test of the fall-through (for example `getType()` returning a value outside the enum) instead of an ignore.

Never use an ignore to skip real business logic.

## Writing tests

### Module tests

A module test follows one pattern: load the module's real DOM, build an `AppContext`, install the module, drive the DOM, assert state, bus events and mock calls.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { completeContext } from '../../helpers/appContext';

describe('ModuleName', () => {
    let ctx: AppContext;
    let container: HTMLElement;

    beforeEach(async () => {
        container = loadModuleDOM('your-module-id');
        ctx = completeContext({
            container,
            appState: { /* initial state */ },
            eventBus: createEventBus(),   // the real EventBus
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: {}
        });
        await YourModule.install(ctx);
    });

    it('handles user action', () => {
        container.querySelector<HTMLButtonElement>('#my-button')!.click();
        expect(ctx.setState).toHaveBeenCalledWith('key', 'value');
    });
});
```

`completeContext` fills the three kernel-owned services a module rarely exercises (an unsigned managed profile, a notification center that keeps nothing in storage, a no-op sidebar mount). A test that asserts against one passes its own.

A feature flag is tested in both states: stub the environment in a flag-off suite with `vi.stubEnv` and `vi.unstubAllEnvs`, and let the default suites cover flag-on (see [developer-guide.md](developer-guide.md)). A module that reacts to `rbac:changed` gets one case for an unchanged session (no request) and one for a real change (sign-out and in, another admin, a demotion).

### Test DOM

Use `loadModuleDOM(moduleId, entry?)` ([tests/helpers/loadModuleDOM.ts](../tests/helpers/loadModuleDOM.ts)) for module-level tests instead of a hand-written `container.innerHTML` literal. It reads the real `src/modules/<id>/index.html` through the registry plugin's own `readModuleTemplate` and appends a container to `document.body`, so a template that grows an element is picked up by every test and the test DOM cannot drift from the build. With `entry`, it loads the composed `index.<entry>.html`, for example `loadModuleDOM('connections', 'managed')` for the Provisioned entry of the connections module.

The `moduleId` is a plain string, the directory name under `src/modules/`. A module with no template throws at read time, so a typo is loud.

The exception: a test that deliberately exercises a partial or malformed DOM (to verify a defensive path with a missing element) keeps an inline literal holding only the elements it needs.

### Global hooks

`tests/setup.ts` runs before every test file and absorbs the common isolation mistakes, so individual tests do not have to.

It installs these stubs for what jsdom omits or implements partly:

| Stub | Behaviour |
|---|---|
| `localStorage` | An in-memory store behind `vi.fn()` methods (only where a page exists). |
| `navigator.clipboard.writeText` | Resolves `undefined`. |
| `fetch` | A bare `vi.fn()` that every test starts from. |
| `URL.createObjectURL` / `revokeObjectURL` | `'blob:mock-url'` and a no-op, for downloads. |
| `alert` | A no-op. There is no `confirm` stub: source code never calls `confirm()` (ESLint forbids it). A yes or no question is the core confirm dialog, answered in tests with `answerConfirm()` from `tests/helpers/confirmDialog.ts`. |
| `HTMLDialogElement` | `show`, `showModal` and `close` polyfilled with attribute toggles, since jsdom does not implement them. `close` fires the `close` event. No focus trap or top layer, which the tests do not need. |
| `window.solace` | A fresh [Solace mock](#solace-mock). `window.solaceLibLoaded` is set `true`. |

Before each test the hooks:

- clear call history on every mock and re-install the default implementations of the `localStorage` methods, `alert`, `URL.createObjectURL`, `URL.revokeObjectURL` and `clipboard.writeText`. `vi.clearAllMocks()` clears only history, not `mockReturnValue` or `mockImplementation` overrides, so without the re-install one test's override would leak into the next. A test may still override any of them; the default returns before the next test;
- empty `localStorage`;
- reset `fetch` and put it back over whatever a test assigned, so no test passes on another's stub;
- install a fresh `window.solace`, so stale `_handlers` entries cannot fire in a later test (a file that builds its own mock in its own `beforeEach` simply overwrites the default);
- empty `document.body`. DOM teardown matters because modules cache element references, and elements leaking from an earlier test would give stale or duplicate lookups.

After each test they call `vi.restoreAllMocks()` and, unconditionally, `vi.useRealTimers()`. A test that calls `vi.useFakeTimers()` needs no matching cleanup, and a test that throws before its own cleanup cannot leave fake timers behind to hang a `setTimeout`.

### Solace mock

The Solace SDK (`solclient.js`) cannot run in Node, so `tests/setup.ts` exports `createSolaceMock`, `createSessionMock`, `createBrowserMock` and `createMessageMock`. The mock is structurally faithful, not merely present: it reproduces the factory, session, queue browser and message surface, the event-code, delivery-mode, message-type and destination-type enums, and `start` and `stop` on the browser for the copy engine's one-message-at-a-time backpressure. Because it is exposed as `window.solace` as in production, application code reads it unmodified.

Two guards catch production bugs early:

- **`session.on`, `session.removeListener` and `browser.on` validate the event code** against the matching enum (`SessionEventCode` or `QueueBrowserEventName`) on the current `window.solace`, and throw naming the valid codes. A bug such as `browser.on('UP_NOTICE', ...)` (the browser's code is `'UP'`) fails fast in a test.
- **Message setters return `this`**, as the real SDK does, so chaining such as `msg.setDestination(x).setBinaryAttachment(y)` works in a test.

Registered handlers are reachable, which is how a test simulates a broker event:

```ts
const upHandler = sessionMock.on.mock.calls
    .find(call => call[0] === solace.SessionEventCode.UP_NOTICE)[1];
upHandler({ sessionProperties: { /* ... */ } });
```

### Stubbing globals

Prefer `vi.spyOn(target, 'prop').mockReturnValue(...)` over direct reassignment. A spy is restored by `vi.restoreAllMocks()` in the global `afterEach`, so a test that throws before a manual restore line cannot leak the stub into the next test.

```ts
// Avoid: the restore line is skipped when an expect() above it fails
const orig = document.getElementById;
document.getElementById = vi.fn(() => null);
// ...assertions...
document.getElementById = orig;

// Prefer: restored after the test whatever happens
vi.spyOn(document, 'getElementById').mockReturnValue(null);
```

### Defensive-guard tests

When a function has a missing-element guard and the test exists to cover its early return, pair `.not.toThrow()` with a state or DOM assertion. A bare `.not.toThrow()` passes whether the guard short-circuited or the function silently corrupted state.

```ts
// Weak: proves only "no crash"
expect(() => ui.showRawContent(msg)).not.toThrow();

// Strong: proves the guarded body did not run
els.modalRaw = null;
els.rawContentText.textContent = 'preserved';
expect(() => ui.showRawContent(msg)).not.toThrow();
expect(els.rawContentText.textContent).toBe('preserved');
```

Skip the pairing only for pure-parameter functions whose arguments are their whole observable surface (for example `clearInputs(null, null, null)`, which mutates nothing else).

A guard on a module-owned element is not tested at all: the element is captured with `required()`, so a missing element fails at install and there is no branch to cover.

### Shared state

Queue Browser keeps its own state in one module-level object (`queue-browser/state.js`) that accumulates state across calls. Reset it in `beforeEach`.

For Queue Browser, call `resetQueueBrowserState()` from [tests/helpers/resetQueueBrowserState.ts](../tests/helpers/resetQueueBrowserState.ts). It resets every field `state.js` declares on the singleton, and every Queue Browser test file, unit and integration, uses it so a partial reset cannot leak mutations across files. A field a UI file starts to use belongs in `state.js` with a default, never added to the state object at runtime.

Where a singleton cannot be reset cleanly, use install, null the one property, trigger the event, restore it, and assert on state as in [Defensive-guard tests](#defensive-guard-tests).

### Node test files

A test file that needs no page (no `document`, `window`, `localStorage`, DOM events, `DOMParser` or `loadModuleDOM`, directly or through the code it calls) starts with this line and runs in Node, which starts much faster than jsdom:

```ts
// @vitest-environment node
```

`tests/setup.ts` still runs there, and installs `localStorage`, `window.solace` and the DOM reset only where a page exists. A file that turns out to need a page fails loudly, so take the line out. Use it for every new DOM-free file.

### Cross-references

When a test refers to another test, in a comment or a `describe` or `it` title, it names the target by file and test name, for example `tests/foo/bar.test.ts > "rejects empty payload"`. Never use ticket, pull request or commit numbers: the file path and test name stay valid as long as the test exists.

## End-to-end run

### What it does

`./scripts/dev.sh e2e` (or `./scripts/dev.ps1 e2e`) checks the gateway image in both of its server modes, the way a browser uses them, against an existing Solace broker you name. It is local only and standalone: never in CI, never in `all` or `full`, because it needs Docker and a broker. Run it before a tag that touches the gateway or the app; it takes a minute or two.

The task builds the image (as `scan` does), then [`scripts/e2e.mjs`](../scripts/e2e.mjs) starts [`docker/docker-compose.e2e.yaml`](../docker/docker-compose.e2e.yaml):

- the image as `gateway`, with `SMU_CONN_MODES=provisioned` (Provisioned mode);
- the image as `direct`, in Gateway mode (the image's default, no `SMU_CONN_MODES`);
- a Chromium browser in the official Playwright image.

All three run with the hardened posture: non-root, read-only root, every capability dropped, no new privileges.

### What it changes

Nothing on the broker is created or changed. The run reads the broker through the gateway's read-only relay and browses an existing queue, which consumes nothing. In Gateway mode it does the same through the Direct relay with the broker credentials you gave. The one write it sends, the `PATCH` of check 4, must be refused by the gateway; were it to get through, it names a queue that does not exist, so the broker would refuse it too.

What the run does change is the Provisioned gateway itself, inside the throwaway container: check 11 takes the e2e user's grant away and gives it back, check 12 and `B3` change settings and restore them, checks 20 to 27 create a user `e2e-scratch` and remove it (checks 24 to 27 also switch `login.twoFactor` and put it back to `optional`), and checks 28 to 31 replace the gateway's certificate and the broker CA file and restart the gateway.

### Requirements

- A Linux-container Docker.
- The npm packages installed (`npm ci`): the SMF check logs in with the pinned `solclientjs`, the SDK the image ships, and the browser checks drive Chromium with the pinned `playwright-core`.
- The loopback ports `39443`, `39444` and `39445` free: the Provisioned gateway's, the browser's Playwright server and the Gateway-mode gateway's, all bound to `127.0.0.1`.
- A one-time pull of the Playwright image, over 1 GB, which the first run does on its own.
- A broker both gateway containers can reach over TLS, with SEMP over TLS and secured web transport (wss) enabled.

### Broker details

Each detail comes from its `E2E_*` environment variable, else from `docker/e2e-broker.env`, a `KEY=value` file that is git-ignored and kept out of the image build context (`docker/Dockerfile.dockerignore`, with `scripts/logs/`). Never commit it. The harness asks on the terminal only for what neither gives, then writes those answers to the file, creating it at mode `600` with a header, so the next run asks nothing.

It never writes a password there. Add `E2E_SEMP_PASSWORD` and `E2E_CLIENT_PASSWORD` yourself to skip those prompts, and keep the file private (the harness warns when other users can read a file holding one). Without a terminal, a missing detail fails the run, naming the variables to set. An unknown key, a repeated key, a value the gateway would refuse, or the key `E2E_BROKER_IP` (named in the error as `E2E_BROKER_ADDR`) fails it too, naming the line.

| Key | Default | What |
|-----|---------|------|
| `E2E_BROKER_HOST` | | The host both gateway containers dial. It must match a name in the broker's TLS certificate (an IP address must be an IP SAN), unless `E2E_INSECURE=1`. A broker on this machine is `host.docker.internal`. For `D4` it must be a name or an IPv4 address, as the Direct form requires. |
| `E2E_BROKER_ADDR` | | Optional host alias: both containers map `E2E_BROKER_HOST` to this address, as an `/etc/hosts` entry would, for a certificate name that no DNS the containers use resolves (a container does not read this machine's `/etc/hosts`). An IP address, or a DNS name the harness resolves once at the start of the run, through `E2E_DNS` when set and this machine's resolver otherwise; a name that does not resolve stops the run. `E2E_BROKER_HOST` must then be a name, not an address. The harness writes the mapping as a compose override under `scripts/logs/e2e/` for the run only. Never asked for. |
| `E2E_DNS` | | Optional DNS servers: one or more IP addresses, separated by commas. Both containers resolve through them (compose `dns`, in the same override as the alias), so `E2E_BROKER_HOST` can be a name only those servers know, with no alias; the harness also asks them, not this machine's resolver, for an `E2E_BROKER_ADDR` name. The run prints the servers. Never asked for. |
| `E2E_BROKER_CA` | | A PEM file with the CA that signed the broker's certificate, or that certificate itself. Required; only its certificates are used. The gateways also trust the standard root CAs the image carries, so a port that presents a public chain, such as SEMP behind a proxy, needs nothing in this file. |
| `E2E_SEMP_PORT` | `1943` | SEMP over TLS. |
| `E2E_SEMP_USER` | `admin` | Read-only access is enough. Up to 32 characters from `A-Z a-z 0-9 _ -`. |
| `E2E_SEMP_PASSWORD` | | Asked without echo. |
| `E2E_SMF_PORT` | `1443` | Secured web transport. |
| `E2E_VPN` | `default` | Like the queue name, it must pass the relay's path-segment rule: no `\`, `%` or `;`. |
| `E2E_CLIENT_USER` | | A client username in that VPN: up to 189 printable ASCII characters, without `?` or `*`. |
| `E2E_CLIENT_PASSWORD` | | Asked without echo. |
| `E2E_QUEUE` | | An existing queue in that VPN the client username may browse. A `/` is fine; `\`, `%`, `;` and an empty, `.` or `..` part between slashes are not, since the relay refuses them. |
| `E2E_INSECURE` | `0` | `1` starts both e2e gateways with `SMU_SSL_SKIP_CERT_VERIFY=true`, for a broker whose certificate does not name the host it is dialled by. Never asked for; any value but `0` or `1` fails the run. The run warns at the start and its summary says the broker's certificate was not verified: checks 3, 4, 6, 11, 12 and `D2` to `D4` then pass without proving that the broker's TLS is trusted, and check 30 is skipped, so do not rely on such a run before a tag. |
| `E2E_BROWSER` | `1` | `0` skips the browser checks `B1` to `B9` and `D4` and does not start the browser container, for a machine that cannot pull the Playwright image. Never asked for; any value but `0` or `1` fails the run. The summary says the browser checks were skipped. |

The harness generates the gateways' TLS material, every gateway password and the backup passphrases (each gateway makes its own store key in `/data`), writes them only under `scripts/logs/e2e/`, and masks them in all it prints. It masks the broker passwords at any length; a broker password shorter than 8 characters cannot be looked for by checks 2, 13, 14, 17 and `B6` without matching ordinary text, and the run says so. It ends with `docker compose down -v` and deletes that directory, also when it is interrupted (Ctrl-C, `SIGTERM`, `SIGHUP`) or stops on an error nothing caught; the task runs `down -v` again as a backstop. Only a run killed outright (`SIGKILL`) leaves the directory behind, and the next run clears it. Every `docker compose` command the harness runs has a time limit (10 minutes for `up`, which may pull the Playwright image, 2 minutes for the rest), so a Docker that stops answering ends the run with a message rather than hanging it. One run at a time: the stack's project name and ports are fixed, so the harness holds `smu-e2e.lock` in the system temp directory while it runs, and a second run, from any checkout, stops at once and names the process that holds it. A lock left by a run that has ended is taken over. The task runs the harness on the real terminal rather than through the log capture, so that it can ask; the harness appends its own masked output to `scripts/logs/e2e.log`.

### The checks

Each check prints `PASS <id>.`, `FAIL <id>.` or `SKIP <id>.` (the check proved less than its title says, and the line says why): 44 in a full run (31 numbered, `B1` to `B9` in the browser, `D1` to `D4` in Gateway mode) and 34 with `E2E_BROWSER=0`. The summary line counts each outcome and names the failed and skipped checks. A skip does not fail the run. Any failure exits 1, followed by the tail of the gateway log, and of the `direct` service's log when a `D` check or the setup failed.

The numbered checks run in this order. Checks and groups described under a number run at that point in the sequence.

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
   - `B9` checks that no request or socket went to another origin, that no page threw, and that the browser refused nothing under a page's Content-Security-Policy.

   Then the Gateway-mode checks run, against the `direct` service at `https://127.0.0.1:39445` from the harness and `https://direct:9443` from the browser:

   - `D1`: `/hosted` says `{"hosted":true,"connModes":"direct","defaultConn":"direct"}`; `/` serves the Direct app (the `#conn-host` form, no Provisioned panel); `/login`, an unknown path, `/managed/me`, `/solAdmin`, `/provisioned.html` and `/solAdmin.html` are plain `404`s; the log says `conn_modes=direct`.
   - `D2`: the Direct relay forwards a SEMP `GET` with the caller's own `Authorization` and returns the queue; without it, the broker's `401` passes through; a malformed path is a `400` and an unknown host a `502`.
   - `D3`: a real SMF login through `/wss/<port>/<host>`, with the SDK under Node, binds a queue browser to the queue.
   - `D4`: in Chromium, fills the Direct form, connects SEMP and the client, and binds the queue in Queue Browser. The browser's WebSocket goes to `wss://direct:9443/wss/<port>/<host>`, the SEMP calls go through `https://direct:9443/https/...`, nothing goes to another origin, and the browser refuses nothing under the page's policy. The queue's badge is the broker's own permission for the client username, `Read-Only` or `Read-Write`. The app never reads the body of its SEMP connect probe, so that response is reported as not swept.

13. No response from either gateway carries a credential, except the body of the `dial` answer. This includes every response the browser received and every Gateway-mode response. Check 13 runs after check 15, the last check that sends a request, so it sweeps every response of the run.
14. Both stores are sealed at rest (`SMUS` header, no plaintext).

    Check 18 runs here, while the administrator's session and the gateway are up: an export holds no credential, host or hash in clear and previews as no change; a schedule's **Back up now** writes a file into the `/backup` volume, also sealed, which `GET /managed/backup/files/{name}` returns as written; a **Merge** import of that file, settings included, leaves the administrator signed in; the schedule is then removed.

    Checks 20 to 23 run after check 18, with two administrator sessions and the scratch user `e2e-scratch`. They prove the versions over real HTTP: (20) both sessions open one user, the first save wins, the second is refused `409 stale` with the current `rev` and succeeds once it sends that rev; (21) one session deletes the user, and the other's save and delete are refused `404 not_found`; (22) an import whose preview is older than another session's user change is refused `409 stale`, and applies after a new preview; (23) the user changes their own password while an administrator holds that user's `rev`: the administrator's save still succeeds and the new password still signs in.

    Checks 24 to 27 run after check 23, on the same scratch user, to prove two-factor over real HTTP. The harness has its own TOTP helper (HMAC-SHA-1, in `scripts/e2e-lib.mjs`), tested against the shared vectors in `go-web-proxy/testdata/contract/totp.json`, and reads the secret and the recovery codes out of the gateway's own pages (`#two-factor-secret`, `#recovery-codes`). (24) With `login.twoFactor` at `optional` the user sets two-factor up on `/login/two-factor`, gets ten recovery codes, and their other session ends. (25) The next sign-in stops at `/login/code` with no session cookie; a wrong code is refused, the right one signs in, and the same code again is refused. (26) A recovery code signs in once and not twice. (27) With `mandatory`, a user without two-factor is sent to set it up; an administrator's reset shows Off in the user list and ends the user's sessions; the mode goes back to `optional`. No check saves `off`, which is not a value.

    Checks 28 to 31 run after check 27, as the administrator, to prove live TLS and the in-place restart over real HTTP. They need the Provisioned gateway's `/tls` writable, so the e2e stack mounts it writable; the three TLS paths reach the gateway through its environment, never through `config.yaml`. (28) `GET /managed/tls` shows the run's certificate by its SHA-256 fingerprint, with both writable flags true, and lists the broker CA file with its certificate and the image's standard root CAs, trusted and at least 100 of them, which proves the image carries the bundle; no path or key is in the answer. (29) `POST /managed/tls/certificate/check` refuses a key that does not match (`422 invalid`, field `key`) and an expired certificate (field `certificate`), writing nothing; a certificate the harness issues is then replaced with `PUT`, and a new TLS connection from the harness sees the new fingerprint with no restart, while the old fingerprint is gone. The private key the run uploads is masked and swept like the other secrets. (30) Deleting the broker's CA file through `DELETE /managed/tls/trust/{name}` makes the SEMP relay fail to verify the broker (a `502`), and adding the same file back with `POST /managed/tls/trust` makes it work, with no restart. It is a `SKIP` under `E2E_INSECURE=1`, where verification is off, and when the broker's certificate also verifies against the standard root CAs the image carries, where deleting the file changes nothing (adding it back is still checked). (31) `POST /managed/restart` is refused without a session and for a user who is not an administrator; for the administrator it answers `202 {"restarting":true}` and the gateway starts again in place with the container still running, the old sessions refused (`401`) and the administrator signing in again.

15. After a restart the stores still open: old sessions are gone, and the administrator signs in again.
16. A missing key file beside an existing store refuses to start, naming both files (the check mounts a host copy of `users.yaml`, with no key, over `/data`).
17. Neither gateway log (both at `debug`), nor the audit log copied out by check 19, holds a password, backup passphrase, store key (read from the gateway's `/data/store.key` with `compose cp`), session cookie (the browser's included), two-factor secret, recovery code, or the private key a check uploaded.
Check 18 (Backup and Restore) and checks 19 to 31 are described under the numbers above, because they run in the middle of the sequence. The run order is 1 to 12, 14, 18, 20 to 23, 24 to 27, 28 to 31, 19, 15, 13, 16, 17.

Check 19 reads the audit trail: `/data/audit.log` is copied out of the gateway container. Every line is a JSON object with the decided fields in order, an RFC 3339 UTC `time` and an `outcome` of `ok` or `refused`. The log holds the refused sign-in (`bad_credentials`), the e2e user's sign-in, a `settings.update` naming `connModes` and `modules.userDefault`, the `backup.export` and `backup.import` entries, the `wrote` list on the `user.create`, `settings.update` and `backup.import` entries, the `twofactor.enrol` and `user.twofactor.reset` entries, and the certificate replace, CA file add and delete, and `gateway.restart` entries. It runs after checks 28 to 31, and before check 17 reads the copy.

### Browser and harness notes

- **Certificates.** The browser trusts the gateways' throwaway certificate (both serve the same one) by ignoring certificate errors; the Node checks verify that certificate against the run's CA.
- **Isolation.** The harness aborts any browser request to an origin other than the gateway its page was opened on, so nothing leaves the stack. No page the run opens shows a password.
- **Sandbox.** Chromium runs without its own sandbox (Playwright's default in a container); the container's posture is the boundary.
- **Playwright version.** The Playwright server takes one client at a time, the harness, which connects once for `B1` to `B9` and again for `D4`. The server is the `playwright-core` that `npm ci` installed, mounted read-only, so the image's tag must equal that version, and the image is pinned by digest; `tests/build/e2e-lib.test.ts` holds both. To move to a new version, bump `playwright-core` and the image tag and digest together.
- **The SMF check.** It uses the real SDK under Node through a loopback bridge. In Provisioned mode the bridge adds the session cookie and a same-origin `Origin` the way a browser would, and the bytes reach the gateway's `/managed/smf` socket unchanged. In Gateway mode it adds only an `Origin` and dials the Direct relay's `/wss/<port>/<host>`, which forwards the bytes to the broker.
- **Failures.** A failed browser check saves a screenshot to `scripts/logs/e2e-<check>.png` (git-ignored).
- **Helpers.** The pure helpers (certificate issuing and reading, the broker details and their file, the cookie rules, the sealed-store header, masking and the secret sweep, and `parseAuditLog` and `auditMissing` for check 19) live in [`scripts/e2e-lib.mjs`](../scripts/e2e-lib.mjs) and are covered by `tests/build/e2e-lib.test.ts`, which runs in the ordinary suite without Docker. The run itself is not part of the coverage scope.
