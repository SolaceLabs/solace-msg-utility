# Developer Guide

## Setup

```bash
git clone <repository-url>
cd solabs-msg-utility
npm install
npm run dev          # Dev server at http://localhost:5173
npm run preview      # Serve an already-built dist/ bundle
```

The dev server hot-reloads on file changes. TypeScript compilation errors appear in the terminal and browser console.

### Build commands

| Command | Outputs in `dist/` |
| --- | --- |
| `npm run build:prod` | `index.html` (production, full variant) |
| `npm run build:mock` | `mock.html` (interactive demo backed by the in-browser mock broker) |
| `npm run build:no-payload` | `no-payload.html` (queue-browser with the message body hidden — see Build-time feature flags) |
| `npm run build:no-queue-copy` | `no-queue-copy.html` (full variant minus the Queue Copy module) |
| `npm run build:all` | `all-test.html` (kitchen-sink QA build — every module, including the admin ones) |
| `npm run build:admin` | `solAdmin.html` (the standalone administration app — see [architecture.md -> The admin app](architecture.md#the-admin-app-soladmin)) |
| `npm run build` | `mock.html`, `index.html`, `min.html`, `no-payload.html`, `no-queue-copy.html`, AND `solAdmin.html` in one pass |

**The gates are `scripts/dev.sh` / `scripts/dev.ps1`, not the npm scripts.** The table above is the variant reference — reach for an individual `build:*` script when iterating on one variant. For anything you would call a gate, use the task: `./scripts/dev.sh all` (`build vet test`, what CI runs), `cov`, `scan`, `image`, or `full` for the pre-tag sweep. The tasks call the npm scripts above plus the Go halves, and they are the only place a build command lives — see [contributing.md](contributing.md#development-workflow) for the task table and [git.md](git.md) for how a tag turns into a release.

The npm scripts the tasks wrap: `typecheck` (`tsc --noEmit`), `check:docs` (the credential-transform secrecy check), `test` / `test:coverage`, `build`, `image:build` (both container images), and `scan:go` / `scan:npm` / `scan:image`. `scan:go` runs `go tool govulncheck`, which resolves through the `tool` directive pinned in [go-web-proxy/go.mod](../go-web-proxy/go.mod) — never `go run pkg@version`, which runs module-less and ignores the toolchain pin.

Custom variants are built via the `scripts/vite-build.mjs` wrapper, which surfaces `--variant=<name>`, `--out-filename=<name>`, and `--show-payload=<bool>` because Vite's CLI parser (CAC) rejects unknown flags. The wrapper forwards them to `vite.config.ts` via private env vars. Example: `node scripts/vite-build.mjs --variant=min --out-filename=min.html`.

### Build-time feature flags

A **flavor** is a build-time toggle of *how a module behaves*, orthogonal to which modules a *variant* ships. The pattern:

1. **Declare the flag where it's used.** Add a tiny module-local helper (don't put one-off, single-module flags in `src/core/` — see [architecture.md → Build flavors vs variants](architecture.md#build-flavors-vs-variants)). Example — [src/modules/queue-browser/features.ts](../src/modules/queue-browser/features.ts):

   ```ts
   export function showPayload(): boolean {
       return import.meta.env.VITE_SHOW_PAYLOAD !== 'false';
   }
   ```

   Read it as a **function call at each use site**, not a module-level `const`, so `vi.stubEnv('VITE_SHOW_PAYLOAD', ...)` controls it per-test.
2. **Plumb the flag through the build.** Add the CLI alias to `CUSTOM_FLAGS` in [scripts/vite-build.mjs](../scripts/vite-build.mjs), and a `define` in [vite.config.ts](../vite.config.ts): `'import.meta.env.VITE_SHOW_PAYLOAD': JSON.stringify(input ?? 'true')`. The `define` makes the flag a compile-time constant, so Rollup dead-code-eliminates the disabled branches from that bundle.
3. **Add an npm script** that calls the wrapper with the flag + `--out-filename`, and append it to the aggregate `build`.
4. **Test both states.** Stub the env in a flag-off suite (`vi.stubEnv` / `vi.unstubAllEnvs`); the default suites cover flag-on. Every `if (flag())` branch must be hit in both states to keep coverage at 100%. Gate only code that *runs in both flavors* — adding a guard to a function that's unreachable when the flag is off creates an uncovered off-branch (let unreachable leaf code stay covered by the flag-on suites instead).

### Build internals

`vite.config.ts` uses [vite-plugin-singlefile](https://github.com/nicolo-ribaudo/vite-plugin-singlefile) to inline all JS and CSS into a single HTML per variant. Settings of note:

- **Target**: ESNext
- **CSS**: inlined (no code splitting)
- **Dynamic imports**: forced inline (`inlineDynamicImports: true`)
- **emptyOutDir**: `false` — preserves pre-placed files in `dist/` (vendor scripts, prior variants) across builds.

The two vendor scripts (`solclient.js`, `jszip.min.js`) are intentionally **not** bundled — they're loaded at runtime from sibling locations. The demo build is the exception: it installs its own SDK, so `mock.html` needs no `solclient.js` (only `jszip.min.js`, for ZIP export). See [deployment.md → External Runtime Dependencies](deployment.md#external-runtime-dependencies) for the placement rules the shell expects.

---

## Project Structure

```text
src/
  core/
    types.ts           # Shared interfaces (AppContext, AppState, BusEvents, PwaModule).
                       # Re-exports ConnectionConfig + SempContext from connections/types.ts.
    event-bus.ts       # Typed pub/sub implementation
    kernel.ts          # Module orchestrator, state, navigation, SEMP auth
    dom.ts             # required() helper — fail-fast required-element assertion
    utils.ts           # Pure utilities (escapeHtml, escapeXml, formatBytes, generateUuid, matchString,
                       # topicsIntersect, topicFilterMatches, normalizeUrlPath, errMessage,
                       # isValidHost, isValidPort)
    timing.ts          # Shared INPUT_DEBOUNCE_MS for input-driven feedback
    toast.ts           # Toast notification system
    logger.ts          # Leveled logger every module writes through (?logLevel= URL override)
    hosted.ts          # /hosted probe + buildBrokerUrl — the single gateway-rewrite point
    constants.ts       # App-wide constants
    rbac.ts            # Stateless RBAC matchers — matchGlob, isModuleVisible, isVpnVisible, isQueueVisible, canOperate
    encode.ts          # Credential transform (login token + site-seed pack/unpack). Algorithm is code-only —
                       # never describe it in docs (scripts/check-docs-secrecy.mjs enforces this)
    managed-semp-filter.ts # filterSempFetch — scopes SEMP discovery to entitled VPNs/queues (managed)
    services/                  # Pure broker-side factories — no AppContext, no UI.
      solace-client.ts         # createServiceSolace(hooks) → Solace session lifecycle
      solace-publisher.ts      # createSolacePublisher(session) → publish/ACK tracking
      semp-client.ts           # createServiceSemp(hooks) → SEMP cred validation; returns SempContext
      semp-discovery.ts        # createSempDiscovery(sempCtx) → paginated VPN + queue fetchers
      sempContext.ts           # unfilteredPrimarySempContext(ctx) → SempContext from primary AppState.
                               # Named for what it does NOT do: only two SEMP v2 list shapes are filtered
      queue-source.ts          # QueueSource + typed Access/scope — the discovery seam components consume
      managed-session-store.ts # Owns the provisioned profile + site seed; dials targets on request
      managed-service.ts       # createManagedService() → the POST /managed/* client
    connections/               # Connection-domain library (types only — no orchestration here).
      types.ts                 # SolaceConfig, SempConfig, ConnectionConfig, ConnectionCredentials, SempContext
      defaults.ts              # DEFAULT_CONFIG + validateConfig (data-shape validator)
      conn-modes.ts            # ConnDeploymentConfig + DEFAULT_CONN_CONFIG + coerceConnConfig +
                               # resolveConnTabs / resolveDestCredModes (fed by CONN_MODES/DEFAULT_CONN)
    components/                # Reusable UI components with function APIs.
      queue-picker/
        index.ts               # pickQueue(source, opts?) — takes a QueueSource, never SEMP directly
        styles.css             # Component-scoped .picker-* styles
      row-list/
        index.ts               # createRowList(container, fields) — dynamic add/remove row editor (managed admin forms)
      module-gate/
        index.ts               # createGate(container, {id,title,message}) — full-view "… Required" gate card
  css/                 # Split by responsibility; aggregated by main.css
    variables.css      # :root design tokens
    reset.css          # * resets
    layout.css         # Shell chrome — app container, sidebar, top bar, status
    components.css     # Generic UI — buttons, cards, forms, modals, tables, badges
    utilities.css      # Atomic helpers — flex, gap, spacing, sizing
    main.css           # @import entry — imported by main.ts (also imports core/components/queue-picker/styles.css)
    main-admin.css     # Admin-build entry — main.css + the admin modules' styles; the
                       # css-variant-redirect plugin swaps it in for --variant=admin
  modules/
    connections/       # Priority 100. Owns the PRIMARY connection lifecycle.
      module.ts        # Orchestrator — defines solaceHooks/sempHooks that bridge factory
                       # lifecycle events (onConnected/onDisconnected/etc.) to ctx.setState +
                       # eventBus.emit + the connections form's UI updates.
      managed-panel.ts # The Managed tab — login, provisioned dropdowns, browser guardrails
      config.js        # localStorage persistence (values obfuscated at rest)
      ui.js            # Element caching, auth mode, visual feedback
      styles.css       # Module-scoped styles
      index.html       # Module HTML template (injected by build plugin)
    queue-browser/     # Priority 80
      module.ts        # Event listener wiring
      service.ts       # Browser create, forward, delete
      features.ts      # Build-time flavor flag — showPayload() reads VITE_SHOW_PAYLOAD
      service-events.ts # onMessage, onBrowserUp/Down, ACK/REJECT
      state.js         # Message store, filter logic
      ui-core.js       # Element cache, visibility, counts
      ui-events.ts     # User action handlers
      ui-table.ts      # Table rendering, ZIP download
      ui-details.ts    # Detail panel, property display
      ui-forward.js    # Forward modal + ACK tracking
      constants.js     # SVG icon strings used in rendered rows
      styles.css       # Module-scoped styles
      index.html       # Module HTML template
    queue-copy/        # Priority 70 — cross-broker copy/move with verify+run phases
                       # constants.ts is the single source of truth for IDLE_TIMEOUT_MS,
                       # PUBLISH_CONCURRENCY_HIGH/LOW, BIND_PROBE_TIMEOUT_MS, ACCUMULATE_IDLE_MS;
                       # service-copy/verify barrel-export them so existing test imports work.
    queue-subscription-explorer/  # Priority 45 — SEMP v1 (vpn, queue, topic) browser
    queue-discovery/   # Present on disk but NOT in any active variant — sits inert at runtime.
                       # Kept for code archaeology; the kernel never installs it.
    admin-login/           # /solAdmin entry point — managed auth only, opens no broker connection
    user-management/       # Admin-only (/solAdmin) — user + entitlement CRUD
    connection-management/ # Admin-only (/solAdmin) — broker connection CRUD
  variants/
    standard.ts        # Default variant — every module the app ships with
    min.ts             # Minimal variant — connections + queue-browser only
    no-queue-copy.ts   # Full variant minus the Queue Copy module
    admin.ts           # The /solAdmin app — admin-login + the two entitlement editors
    all-for-testing-only.ts  # Kitchen-sink QA build — every module, incl. the admin ones
    _active.ts         # One-line re-export from one variant (default ./standard)
  mock-broker/         # DEMO ONLY — entered solely via the mock-mode import redirect,
                       # so no production bundle contains it.
    boot.ts            # Installs window.solace, the fetch interceptor and the panel
    fixtures.ts        # THE demo dataset + scenario enums — single source of truth
    emitter.ts         # Synchronous FIFO emitter (RBAC patch ordering depends on it)
    sdk/               # enums, session, browser, message — the solace global
    broker/store.ts    # Queues, messages, seeding, publish routing, deletes
    server/            # fetch router: SEMP v2 + v1, /hosted, /managed/*
    controls/          # The demo scenario switcher (.mockctl-* only)
  main.ts              # Bootstrap (imports ./css/main.css and ./registry)
  registry.ts          # Resolves variant manifest → PwaModule via virtual:module-registry (moduleRegistryPlugin)
  index.html           # App shell with <!-- @module-templates --> marker
tests/
  setup.ts             # Global mocks (Solace SDK, browser APIs)
  helpers/             # loadModuleDOM, resetQueueBrowserState
  core/                # Kernel, EventBus, toast, utils tests (dom.ts is exercised transitively by module tests)
  modules/             # Per-module test files
  build/               # module-registry-plugin.test.ts — manifest → virtual:module-registry
  variants.test.ts     # Every variant manifest resolves and keeps its shape invariants
  registry.test.ts     # Registry resolution + kernel integration
  main.test.ts         # Bootstrap
  integration/         # Cross-module + end-to-end tests
    full-flow.test.ts        # Kernel mechanics with stub modules
    module-events.test.ts    # Real modules + shared EventBus + mocked services
    message-pipeline.test.ts # Broker message → ingest → filter → DOM, end-to-end
  main.test.ts         # Bootstrap tests
  registry.test.ts     # Registry invariant tests
```

---

## Key Concepts

### The Module Contract

Every module implements `PwaModule` from `src/core/types.ts`:

```ts
interface PwaModule {
    name: string;         // Sidebar display name
    id: string;           // Unique slug (used for DOM IDs, template lookup)
    icon?: string;        // SVG markup for sidebar
    install(app: AppContext): Promise<void>;
}
```

Priority (install order + sidebar position) is **not** a module property — it's set in `src/registry.ts` alongside the module reference, so the full ordering is visible in one file. The kernel takes `RegisteredModule[]` (`{ module, priority }` tuples) and sorts them descending before calling `install()`.

### AppContext (Dependency Injection)

Modules never import each other. The Kernel passes an `AppContext` into each module's `install()`:

```ts
interface AppContext {
    container: HTMLElement;       // Module's private DOM subtree
    appState: AppState;          // Read-only global state reference
    eventBus: EventBus;          // Typed pub/sub
    setState(key, value): void;  // Update global state + emit event
    loadSelf(): void;            // Navigate to this module's view
    sempFetch(url, opts): Promise<Response>;  // SEMP with auto-injected auth
    managedStore: ManagedStore;  // Provisioned profile + site seed; dials targets on request
    copyToClipboard(text, btn?): Promise<void>;  // Clipboard + feedback
    config: Record<string, any>;
}
```

### EventBus (Cross-Module Communication)

All inter-module coordination goes through typed events:

| Event | Payload | Flow |
| --- | --- | --- |
| `app:state-change` | `{ key, value }` | Kernel -> All modules |
| `client:connected` | `{ session }` | Connections -> Queue Browser / Queue Copy |
| `client:disconnected` | void | Connections -> All |
| `semp:connected` | void | Connections -> All |
| `semp:disconnected` | void | Connections -> All |
| `connection:check-connection` | `{ vpn, queue, returnTo? }` | Queue Copy / Queue Browser source-picker -> Connections |
| `connection:edit-requested` | void | Queue Copy -> Connections (navigate to form) |
| `browser:available` | void | Queue Browser -> All (install-phase, buffered by `hold`/`release`) |
| `browser:browse-queue` | `{ queue }` | Connections -> Queue Browser (default `returnTo`) |
| `copy:vpn-switched` | `{ vpn, queue }` | Connections -> Queue Copy (completion of VPN-switch handoff when `returnTo: 'queue-copy'`) |
| `config:max-messages-changed` | `{ value }` | Connections -> Queue Browser |
| `app:message-delete` | `{ id }` | Queue Browser row -> Queue Browser handler |
| `rbac:changed` | void | Connections (Managed panel) / User Mgmt / Admin Login -> Kernel (sidebar re-render) + any module holding entitlement-derived state |
| `jszip:loaded` | void | Window -> Queue Browser |

### Factory Pattern

The codebase uses two factory shapes, depending on layer:

**Module-level factories** receive `AppContext` and own per-module state in closure:

```ts
// e.g. src/modules/queue-browser/service.ts
export function createService(ctx: AppContext, serviceEvents: ServiceEvents) {
    // Private state lives in closure scope
    const browsers = new Map();

    return {
        createBrowser(queueName: string) { /* uses ctx, browsers */ },
        disconnectBrowser(queueName: string) { /* ... */ },
    };
}
```

**Core service factories** in `src/core/services/` are **pure** — no AppContext, no UI access, no global bus. Lifecycle is communicated through caller-supplied hooks. This decouples the broker plumbing from any particular module so the same factory can power the connections module's primary connection AND another module's secondary connection — queue-copy's destination, which drives its own pair of these factories and keeps every effect in module-local state. Note the connections module itself bridges TWO parallel hook sets: `module.ts` for the Direct form and `managed-panel.ts` for the Managed tab, both writing the same AppState keys and emitting the same bus events:

```ts
// e.g. src/core/services/solace-client.ts
export interface SolaceConnectionHooks {
    onConnected: (session: any, vpn: string) => void;
    onDisconnected: () => void;
    onConnectFailed?: (info: { infoStr: string }) => void;
    onError?: (err: Error) => void;
}
export function createServiceSolace(hooks: SolaceConnectionHooks): SolaceClient;
```

The connections module owns the **primary** connection: its `module.ts` defines `solaceHooks`/`sempHooks` that bridge factory events to `ctx.setState` + `eventBus.emit('client:connected'…)` + the connections form's UI updates. Other modules subscribe to those bus events as they always have. queue-copy is the secondary-connection caller: it defines different hooks that target module-scoped state instead of global state — same factory, different bridging. When its destination uses provisioned credentials it asks `ctx.managedStore` to dial the target and creates the client inside that callback, so the credential never leaves core.

The same shape applies to SEMP: `createServiceSemp(hooks)` and the discovery generator `createSempDiscovery(sempCtx)` (from `src/core/services/semp-discovery.ts`) which is parameterized by a `SempContext` — a `{ fetch, baseUrl }` pair scoped to a specific broker. Build a primary SempContext via `unfilteredPrimarySempContext(ctx)` from `src/core/services/sempContext.ts` — read its docstring before adding a consumer, because only two SEMP v2 list shapes are entitlement-filtered. For discovery, prefer `queueSourceFrom(ctx, scope)` from `src/core/services/queue-source.ts`; components take a `QueueSource` and never run their own SEMP calls.

### Circular Dependency Resolution

`service-events.ts` needs `service.ts`'s `disconnectBrowser` and vice versa. Solved with a `wire()` pattern:

```ts
// service-events.ts
export function createServiceEvents() {
    let disconnectBrowser: Function;
    return {
        wire(deps: { disconnectBrowser: Function }) {
            disconnectBrowser = deps.disconnectBrowser;
        },
        onConnectFailed(queue, err) { disconnectBrowser(queue); },
        // ...
    };
}

// module.ts — wiring happens at install time
const serviceEvents = createServiceEvents();
const service = createService(app, serviceEvents);
serviceEvents.wire({ disconnectBrowser: service.disconnectBrowser });
```

---

## Adding a New Module

1. **Create the module directory:**

   ```text
   src/modules/your-module/
     module.ts      # PwaModule implementation
     index.html     # Module HTML template (lives next to the code)
     styles.css     # Optional — module-scoped styles, imported via src/css/main.css
   ```

2. **Implement the module:**

   ```ts
   import type { AppContext } from '../../core/types';
   import { required } from '../../core/dom';

   export const YourModule = {
       name: 'Your Module',
       id: 'your-module',
       icon: '<svg>...</svg>',

       async install(app: AppContext) {
           const { container, eventBus, setState } = app;
           // Capture required DOM elements — `required()` throws at install time
           // if the selector doesn't match, so downstream code treats results as non-null.
           const btn = required<HTMLButtonElement>(container, '#my-button');
           // Wire event listeners
           // Subscribe to EventBus events
       }
   };
   ```

   Note: priority (install order + sidebar position) is set in the variant manifest alongside the module id, not on the module itself.

   Any element the module's own template is expected to contain should go through `required()`. Elements that may or may not exist (conditionally rendered) stay on nullable `querySelector` with an `if (el)` guard. See the **Required-Element Invariant** section of [architecture.md](architecture.md) for the rationale.

3. **Author the HTML template** at `src/modules/your-module/index.html`. The build plugin reads this file and injects it into the shell HTML as `<template data-module-id="your-module">…</template>` at the `<!-- @module-templates -->` marker. Do **not** edit module markup directly in the shell `src/index.html` — those edits don't survive a rebuild.

4. **Activate in a variant manifest** under [src/variants/](../src/variants/). Add one line to whichever variant(s) should ship the module — for the default build, edit `src/variants/standard.ts`:

   ```ts
   export const ACTIVE_MODULES: Record<string, number> = {
       'connections':                 100,
       'queue-browser':                80,
       'queue-copy':                   70,
       'queue-subscription-explorer':  45,
       'your-module':                  20,   // ← new line
   };
   ```

   Pick a priority that slots into the existing list (higher installs first, renders higher in the sidebar). [src/registry.ts](../src/registry.ts) resolves each id in the manifest to the `PwaModule` exported by `src/modules/<id>/module.ts` via the `virtual:module-registry` module (generated per variant by `scripts/module-registry-plugin.mjs`), so no import section needs touching and only the active variant's modules enter the bundle. To **disable** a module in a variant, comment its line. To **ship a different variant**, drop a new `src/variants/<name>.ts` and build with `VITE_VARIANT=<name> npm run build`.

   > **Gating a module in managed deployments:** add its id to `MODULE_REQUIREMENTS` in [src/core/rbac.ts](../src/core/rbac.ts) — `'admin'` for admin-only CRUD (like `user-management` / `connection-management`, which ship only in `src/variants/admin.ts`), or `'unfiltered-semp'` for a module that reaches the broker over a path RBAC cannot filter, which hides it in **every** managed session. The kernel hides the sidebar entry and re-evaluates on `rbac:changed`. See [architecture.md → Managed Connections](architecture.md#managed-connections-rbac).

5. **Import the module's CSS** (if you added `styles.css`) from `src/css/main.css`:

   ```css
   @import '../modules/your-module/styles.css';
   ```

6. **Write tests** in `tests/modules/your-module/module.test.ts`. Use `loadModuleDOM('your-module')` from `tests/helpers/loadModuleDOM.ts` to load the real template in tests.

---

## Testing

### Running Tests

```bash
npm test                # Single run (the full suite)
npm run test:watch      # Watch mode (re-runs on file changes)
npm run test:coverage   # With 100% coverage enforcement
```

All commands use `--pool=threads --maxWorkers=12` (configured in `package.json`).

### Test Architecture

Each source file has a corresponding test file. Tests follow a consistent pattern:

1. Build a DOM container matching the module's HTML template
2. Construct a mock `AppContext` with `vi.fn()` stubs
3. Call `module.install(ctx)` with real code
4. Interact with DOM elements (click, dispatch events, change values)
5. Assert DOM mutations, mock call counts, and state changes

The **real EventBus** is used in tests (not mocked) — tests verify events by registering listeners.

### Test Setup (`tests/setup.ts`)

Provides global mocks installed before every test:

- `localStorage` — in-memory Map
- `navigator.clipboard` — mock writeText
- `fetch` — global mock for SEMP HTTP calls
- `confirm/alert` — mock dialogs
- `window.solace` — full Solace SDK mock (`createSolaceMock()`)
- `beforeEach` clears all mocks and DOM between tests

### Writing Tests for a New Module

Load the real per-module `index.html` via [`loadModuleDOM`](../tests/helpers/loadModuleDOM.ts) so the test DOM can never drift from the production template. The `moduleId` argument is a plain `string` (the directory name under `src/modules/`) — typos throw `ENOENT` at `fs.readFileSync` time, loud enough for tests. The previous compile-time enumeration was retired along with `src/module-ids.ts` when variant manifests became the single source of truth.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YourModule } from '../../../src/modules/your-module/module';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

describe('YourModule', () => {
    let ctx: any;

    beforeEach(async () => {
        const container = loadModuleDOM('your-module');  // reads src/modules/your-module/index.html

        ctx = {
            container,
            appState: { isConnected: false, isSempConnected: false, activeModuleId: null, selectedVpn: null, sempCredentials: null },
            eventBus: createEventBus(),            // real EventBus, not mocked
            setState: vi.fn(),
            loadSelf: vi.fn(),
            sempFetch: vi.fn(),
            copyToClipboard: vi.fn(),
            config: {}
        };

        await YourModule.install(ctx);
    });

    it('does something', () => {
        // interact with DOM, assert results
    });
});
```

Hand-rolled `container.innerHTML = '...'` literals are only acceptable when a test intentionally exercises a partial or malformed DOM (e.g. to verify a defensive early-return).

**Shared state reset.** Queue-browser tests must call `resetQueueBrowserState()` from [tests/helpers/resetQueueBrowserState.ts](../tests/helpers/resetQueueBrowserState.ts) in `beforeEach` — the `state.js` singleton has nine fields, and resetting only the ones a specific test touches lets mutations leak across files. Global `beforeEach`/`afterEach` hooks in [tests/setup.ts](../tests/setup.ts) also re-install default `localStorage` mock implementations and revert fake timers automatically; see [contributing.md](contributing.md) for details.

### Coverage Requirements

`vitest.config.ts` sets **100% thresholds** on all four metrics (Statements, Branches, Functions, Lines). When coverage falls below the threshold, `npm run test:coverage` reports an `ERROR: Coverage for … does not meet global threshold (100%)` line. As of the May 2026 sweep the target is met (100% / 100% / 100% / 100%) — see [test-report.md](test-report.md) for per-file confirmation. PRs should not regress this.

Use `/* v8 ignore start */` / `/* v8 ignore stop */` only for architecturally untestable code (see [test-report.md](test-report.md) for the rationale and categories).

---

## Code Conventions

### File Organization

- One concern per file (service logic, UI state, event handlers, DOM management)
- Factory functions over classes
- Module-scoped state via closures, not global singletons

### DOM Access

- Always scope queries to the module's `container` element
- Cache elements at install time, reference via the cache object
- Never use `document.getElementById()` — use `container.querySelector()`

### Event Handling

- Use the typed EventBus for cross-module communication
- Direct DOM events for intra-module interaction
- Clean up listeners when disconnecting/unbinding

### Error Handling

- Return `{ ok: boolean; error?: string }` result objects from services
- Wrap Solace SDK calls in try/catch
- Log errors to console, show user-facing messages in the UI

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- `allowJs: true` — mixed TS/JS codebase (legacy JS files coexist with new TS)
- `declare const solace: any` in files that access the global Solace SDK
- Run `npm run typecheck` (`tsc --noEmit`) to check types — the build (Vite/esbuild) strips types **without** checking them, so `tsc` is the only thing that catches type errors. It's a separate gate from `npm run build`, enforced in CI.
