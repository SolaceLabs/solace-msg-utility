# Contributing

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
4. Run `./scripts/dev.sh all` (or `./scripts/dev.ps1 all` on Windows) — `build vet test`, the fast inner loop and exactly what CI runs
5. Run `./scripts/dev.sh cov` — coverage must not regress; target is 100% on all four metrics, and `vitest.config.ts` fails the run below that
6. Run `./scripts/dev.sh scan` before opening the PR if you touched a dependency, the Dockerfile, or `go-web-proxy/`
7. Open a pull request with a clear description

`scripts/dev.sh` and `scripts/dev.ps1` are the only place that knows how to build, test, lint or scan this repo — CI calls the same task names, which is what keeps local and CI identical structurally rather than by discipline. Don't add a build command to a workflow; add it to both scripts.

| Task | What it runs |
| --- | --- |
| `build` | `npm run build` (every variant) plus both gateway binaries, version-stamped, into `dist/` |
| `vet` | `npm run typecheck`, `npm run check:docs`, `go vet ./...` **and** `go vet -tags managed ./...` |
| `test` | `npm test`, `go test ./...` **and** `go test -tags managed ./...` |
| `cov` | `npm run test:coverage` plus a Go coverage profile; prints both totals |
| `scan` | `npm audit`, `go tool govulncheck -tags=managed ./...`, then a Trivy scan of both freshly-built images |
| `image` | Builds both container images via `docker/docker-compose.yaml` |
| `up` / `down` | Brings the compose stack up or down |
| `graphify` | Refreshes the knowledge graph (local only — skipped when `CI` is set) |
| `all` | `build vet test` |
| `full` | `all` + `cov image scan graphify` — the pre-tag sweep |

The Go gates run **both** ways because the RBAC backend is behind the `managed` build tag; an untagged run does not compile it at all.

Each task writes `scripts/logs/<task>.log` with a timestamped footer. `logs/cov.log` holds the previous coverage totals, which are the local floor — CI is a fresh checkout with no prior log, so it cannot catch a coverage regression.

The image half of `image` and `scan` warn-skips when Docker is absent or running Windows containers, since a Linux image cannot be built there. The `ubuntu-24.04` CI leg still enforces it.

---

## Code Standards

### TypeScript / JavaScript

- **Strict mode** is enabled. No `any` unless interfacing with the Solace SDK (`declare const solace: any`).
- **ES modules** (`import`/`export`). No CommonJS.
- **Factory functions** over classes for services. State lives in closure scope.
- **No global variables**. Modules receive dependencies via `AppContext`.
- Mixed TS/JS codebase: new files should be TypeScript. Existing `.js` files are acceptable.

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

### File Organization

- One concern per file (not one class per file — there are no classes).
- Services: `service.ts`, `service-*.ts` (with a `service-*-mock.ts` sibling for the `vite build --mode mock` bundle when the service talks to an external system)
- UI: `ui.js`, `ui-*.ts`, `ui-*.js`
- State: `state.js`
- Orchestrator: `module.ts`
- Template: `index.html` (lives next to the code; the build plugin injects it into the shell)
- Styles: `styles.css` (module-scoped; imported from `src/css/main.css`)
- Constants / icons: `constants.js`

---

## Testing Requirements

### Coverage Threshold

`vitest.config.ts` sets a **100% threshold** on all four metrics (Statements, Branches, Functions, Lines). When coverage drops below 100% on any metric, `npm run test:coverage` reports `ERROR: Coverage for … does not meet global threshold (100%)` at the end of the run. As of the May 2026 sweep the target is met (100% / 100% / 100% / 100%) — see [test-report.md](test-report.md) for the per-file confirmation.

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

- **Always use `loadModuleDOM(moduleId)`** ([tests/helpers/loadModuleDOM.ts](../tests/helpers/loadModuleDOM.ts)) for module-level tests instead of hand-rolling an `innerHTML` literal. The helper reads the real `src/modules/<id>/index.html` and appends a container to `document.body` — so when a template grows a new element, every test picks it up automatically.
- The `moduleId` parameter is a plain `string` (the directory name under `src/modules/`); a typo throws ENOENT at `fs.readFileSync` time. The compile-time enumeration was dropped along with `src/module-ids.ts` when active modules moved to the variant manifests under [src/variants/](../src/variants/).
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
- **Reset the `state.js` singleton in `beforeEach`.** Call `resetQueueBrowserState()` from [tests/helpers/resetQueueBrowserState.ts](../tests/helpers/resetQueueBrowserState.ts) — it resets all nine fields on the singleton (`browserInstances`, `messageStore`, `currentQueue`, `currentQueuePermissions`, `allMessages`, `displayedMessages`, `forwardQueue`, `activeFilters`, `maxMessagesPerQueue`). Every queue-browser test file (unit + integration) uses this helper so partial-reset drift cannot leak mutations across files.
- **Assert the far-end effect, not the event emission.** The integration value is proving the other module *reacted* — e.g. `mockCreateBrowser` was called with the queue name, `ui.updateForwardItemStatus` was called with the correlation value. Asserting only that the event was emitted duplicates unit-test coverage.

### Test Isolation — Global Hooks

[tests/setup.ts](../tests/setup.ts) installs global `beforeEach`/`afterEach` hooks that absorb several common isolation bugs so individual tests don't have to:

- **Default mock implementations are re-installed every test.** `vi.clearAllMocks()` only clears call history, not `.mockReturnValue()` / `.mockImplementation()` / `.mockReturnValueOnce()` overrides. The global `beforeEach` explicitly re-installs defaults for `localStorage` (all five methods), `confirm` (returns `true`), `alert` (no-op), `URL.createObjectURL` (returns `'blob:mock-url'`), `URL.revokeObjectURL` (no-op), and `navigator.clipboard.writeText` (resolves `undefined`). You can still override any of these within a test via `mockReturnValue` / `mockImplementation` / `mockReturnValueOnce`; the default is restored before the next test runs.
- **A fresh Solace SDK mock every test.** The global `beforeEach` calls `(window as any).solace = createSolaceMock()`. This prevents stale `_handlers` entries (e.g. from `mockSession._handlers[UP_NOTICE] = …`) from firing in subsequent tests. Test files that create their own mock in their own `beforeEach` simply overwrite this default.
- **Fake timers are always reverted.** The global `afterEach` unconditionally calls `vi.useRealTimers()`. Tests that call `vi.useFakeTimers()` do not need a matching `useRealTimers()` — if a test throws before its own cleanup line, the global hook still brings the next test back to real timers so `setTimeout`-based code doesn't hang.

### Solace Mock Behaviour

Two fidelity guards help catch production bugs early:

- **`session.on` / `browser.on` validate the event code.** Both mocks call `validateEventCode` against the relevant enum (`SessionEventCode` / `QueueBrowserEventName`) on the current `window.solace` object and throw with a diagnostic message if an unknown code is registered. A production bug like `browser.on('UP_NOTICE', …)` (the browser's correct code is `'UP'`) will fail fast in tests instead of silently passing.
- **Message setters return `this` for chaining.** All `createMessageMock()` setters use `.mockReturnThis()`, so `msg.setDestination(x).setBinaryAttachment(y)` works in tests the same way it works against the real SDK. Keeps future refactors safe.

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
| jsdom limitations | `document.readyState === 'loading'` — always `'complete'` in jsdom |
| SDK callback branches | Error paths inside Solace SDK callbacks the test harness can't deterministically fire |
| Defensive `catch` on trusted contracts | Services return `{ok, error}` and never throw, but a `catch` guards against SDK misbehavior |
| Redundant safety checks | Both branches produce identical results |

**Not valid categories** (convert instead of ignoring):

- **DOM null-guards on required elements** — use `required()` from `src/core/dom.ts`. The helper throws with a clear message and removes the nullable type, so no guard is needed.
- **`|| 'fallback'` on values the service always sets** — drop the fallback or push the default into the service.
- **Registering SDK callbacks that are covered by dedicated tests** — wire the mock to invoke the handler directly; `.on.mock.calls` gives you the registered function.

**Never** use v8 ignore to skip testing real business logic. Every `/* v8 ignore */` must have an inline comment explaining why the code is architecturally untestable.

### Running Tests

```bash
./scripts/dev.sh test  # Web + Go, both build-tag variants
./scripts/dev.sh cov   # With coverage report (text + HTML in coverage/)
npm run test:watch     # Watch mode — the one case where the npm script is the right entry point
```

The `--pool=threads --maxWorkers=12` flags are included in the npm scripts the tasks call.

---

## Pull Request Checklist

- [ ] `./scripts/dev.sh all` is green (build, vet, test — both the web and Go halves)
- [ ] New code has corresponding tests
- [ ] Coverage does not regress (`./scripts/dev.sh cov`); targets 100% per `vitest.config.ts` thresholds
- [ ] Type-check passes — `vet` runs it, because the build uses esbuild and does **not** type-check, so `tsc --noEmit` is a separate gate
- [ ] If you changed a build command, it went into **both** `scripts/dev.sh` and `scripts/dev.ps1` — never into workflow YAML
- [ ] No new `any` types (except Solace SDK interface)
- [ ] DOM access is container-scoped
- [ ] SDK/exception text goes through `solaceErrorText(e, fallback)` (core/utils.ts) — the SDK splits the reason across `.message` (QueueBrowser `OperationError`) and `.infoStr` (Session events); reading one loses it
- [ ] Cross-module communication uses EventBus (no direct imports)
- [ ] v8 ignores have explanatory comments
- [ ] Managed/RBAC (if touched): module gating goes through `MODULE_REQUIREMENTS` (rbac.ts); credential-bearing state stays in `managedStore`, never `AppState`; the credential-transform algorithm stays out of the docs (`npm run check:docs`)
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
