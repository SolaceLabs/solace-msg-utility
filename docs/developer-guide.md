# Developer Guide

## Setup

```bash
git clone <repository-url>
cd SolaceMessageUtility
npm install
npm run dev          # Dev server at http://localhost:5173
```

The dev server hot-reloads on file changes. TypeScript compilation errors appear in the terminal and browser console.

### Build commands

| Command | Outputs in `dist/` |
|---|---|
| `npm run build:prod` | `index.html` (production, full variant) |
| `npm run build:mock` | `mock.html` (interactive demo with canned mocks) |
| `npm run build` | `mock.html`, `index.html`, AND `min.html` (full variant + minimal variant in one pass) |

Custom variants are built via the `scripts/vite-build.mjs` wrapper, which surfaces `--variant=<name>` and `--out-filename=<name>` because Vite's CLI parser (CAC) rejects unknown flags. The wrapper forwards them to `vite.config.ts` via private env vars. Example: `node scripts/vite-build.mjs --variant=min --out-filename=min.html`.

---

## Project Structure

```
src/
  core/
    types.ts           # Shared interfaces (AppContext, AppState, BusEvents, PwaModule).
                       # Re-exports ConnectionConfig + SempContext from connections/types.ts.
    event-bus.ts       # Typed pub/sub implementation
    kernel.ts          # Module orchestrator, state, navigation, SEMP auth
    dom.ts             # required() helper — fail-fast required-element assertion
    utils.ts           # Pure utilities (escapeHtml, formatBytes, generateUuid, matchString, isValidHost, isValidPort)
    timing.ts          # Shared INPUT_DEBOUNCE_MS for input-driven feedback
    toast.ts           # Toast notification system
    services/                  # Pure broker-side factories — no AppContext, no UI.
      solace-client.ts         # createServiceSolace(hooks) → Solace session lifecycle
      solace-client-mock.ts    # Mock for `vite build --mode mock`
      semp-client.ts           # createServiceSemp(hooks) → SEMP cred validation; returns SempContext
      semp-client-mock.ts      # Mock for mock build
      semp-discovery.ts        # createSempDiscovery(sempCtx) → paginated VPN + queue fetchers
      semp-discovery-mock.ts   # Mock for mock build (canned VPN/queue lists)
      sempContext.ts           # primarySempContextFrom(ctx) → builds a SempContext from primary AppState
    connections/               # Connection-domain library (types only — no orchestration here).
      types.ts                 # SolaceConfig, SempConfig, ConnectionConfig, ConnectionCredentials, SempContext
      defaults.ts              # DEFAULT_CONFIG + validateConfig (data-shape validator)
    components/                # Reusable UI components with function APIs.
      queue-picker/
        index.ts               # pickQueue(sempCtx, opts?): Promise<string | null>
        styles.css             # Component-scoped .picker-* styles
  css/                 # Split by responsibility; aggregated by main.css
    variables.css      # :root design tokens
    reset.css          # * resets
    layout.css         # Shell chrome — app container, sidebar, top bar, status
    components.css     # Generic UI — buttons, cards, forms, modals, tables, badges
    utilities.css      # Atomic helpers — flex, gap, spacing, sizing
    main.css           # @import entry — imported by main.ts (also imports core/components/queue-picker/styles.css)
  modules/
    connections/       # Priority 100. Owns the PRIMARY connection lifecycle.
      module.ts        # Orchestrator — defines solaceHooks/sempHooks that bridge factory
                       # lifecycle events (onConnected/onDisconnected/etc.) to ctx.setState +
                       # eventBus.emit + the connections form's UI updates.
      config.js        # localStorage persistence (XOR+base64 obfuscation)
      ui.js            # Element caching, auth mode, visual feedback
      styles.css       # Module-scoped styles
      index.html       # Module HTML template (injected by build plugin)
    queue-browser/     # Priority 80
      module.ts        # Event listener wiring
      service.ts       # Browser create, forward, delete
      service-mock.ts  # Mock for mock build (queue-browser keeps a local mock — its
                       # canned data is browser-specific, not a SEMP/Solace plumbing concern)
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
  variants/
    full.ts            # Default variant — every module the app ships with
    min.ts             # Minimal variant — connections + queue-browser only
    _active.ts         # One-line re-export from one variant (default ./full)
  main.ts              # Bootstrap (imports ./css/main.css and ./registry)
  registry.ts          # Resolves variant manifest → PwaModule via import.meta.glob
  index.html           # App shell with <!-- @module-templates --> marker
tests/
  setup.ts             # Global mocks (Solace SDK, browser APIs)
  helpers/             # loadModuleDOM, resetQueueBrowserState
  core/                # Kernel, EventBus, toast, utils tests (dom.ts is exercised transitively by module tests)
  modules/             # Per-module test files
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
    copyToClipboard(text, btn?): Promise<void>;  // Clipboard + feedback
    config: Record<string, any>;
}
```

### EventBus (Cross-Module Communication)

All inter-module coordination goes through typed events:

| Event | Payload | Flow |
|-------|---------|------|
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

**Core service factories** in `src/core/services/` are **pure** — no AppContext, no UI access, no global bus. Lifecycle is communicated through caller-supplied hooks. This decouples the broker plumbing from any particular module so the same factory can power the connections module's primary connection AND a future module's secondary connection (e.g. queue-copy):

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

The connections module owns the **primary** connection: its `module.ts` defines `solaceHooks`/`sempHooks` that bridge factory events to `ctx.setState` + `eventBus.emit('client:connected'…)` + the connections form's UI updates. Other modules subscribe to those bus events as they always have. A future secondary-connection caller (queue-copy) will define different hooks that target module-scoped state instead of global state — same factory, different bridging.

The same shape applies to SEMP: `createServiceSemp(hooks)` and the discovery generator `createSempDiscovery(sempCtx)` (from `src/core/services/semp-discovery.ts`) which is parameterized by a `SempContext` — a `{ fetch, baseUrl }` pair scoped to a specific broker. Build a primary SempContext via `primarySempContextFrom(ctx)` from `src/core/services/sempContext.ts`.

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
   ```
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

4. **Activate in a variant manifest** under [src/variants/](../src/variants/). Add one line to whichever variant(s) should ship the module — for the default build, edit `src/variants/full.ts`:
   ```ts
   export const ACTIVE_MODULES: Record<string, number> = {
       'connections':                 100,
       'queue-browser':                80,
       'queue-copy':                   70,
       'queue-subscription-explorer':  45,
       'your-module':                  20,   // ← new line
   };
   ```
   Pick a priority that slots into the existing list (higher installs first, renders higher in the sidebar). [src/registry.ts](../src/registry.ts) resolves each id in the manifest to the `PwaModule` exported by `src/modules/<id>/module.ts` via `import.meta.glob`, so no import section needs touching. To **disable** a module in a variant, comment its line. To **ship a different variant**, drop a new `src/variants/<name>.ts` and build with `VITE_VARIANT=<name> npm run build`.

5. **Import the module's CSS** (if you added `styles.css`) from `src/css/main.css`:
   ```css
   @import '../modules/your-module/styles.css';
   ```

6. **Write tests** in `tests/modules/your-module/module.test.ts`. Use `loadModuleDOM('your-module')` from `tests/helpers/loadModuleDOM.ts` to load the real template in tests.

---

## Testing

### Running Tests

```bash
npm test                # Single run (all 707 tests, ~16s)
npm run test:watch      # Watch mode (re-runs on file changes)
npm run test:coverage   # With 100% coverage enforcement
```

All commands use `--pool=threads --maxWorkers=8` (configured in `package.json`).

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
