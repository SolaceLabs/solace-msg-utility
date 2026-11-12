# Developer Guide

## Contents

- [Setup](#setup)
  - [Build commands](#build-commands)
  - [Build-time feature flags](#build-time-feature-flags)
  - [Build internals](#build-internals)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
  - [The Module Contract](#the-module-contract)
  - [AppContext (Dependency Injection)](#appcontext-dependency-injection)
  - [EventBus (Cross-Module Communication)](#eventbus-cross-module-communication)
  - [Factory Pattern](#factory-pattern)
  - [Circular Dependency Resolution](#circular-dependency-resolution)
- [Adding a New Module](#adding-a-new-module)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Test Architecture](#test-architecture)
  - [Test Setup (`tests/setup.ts`)](#test-setup-testssetupts)
  - [Writing Tests for a New Module](#writing-tests-for-a-new-module)
  - [Coverage Requirements](#coverage-requirements)
- [Code Conventions](#code-conventions)
  - [File Organization](#file-organization)
  - [DOM Access](#dom-access)
  - [Event Handling](#event-handling)
  - [Error Handling](#error-handling)
  - [Logging standard](#logging-standard)
  - [Auditing an action](#auditing-an-action)
  - [TypeScript](#typescript)

---

## Setup

```bash
git clone <repository-url>
cd solace-msg-utility
npm install
npm run dev          # Dev server at http://localhost:5173
npm run preview      # Serve an already-built dist/ bundle
```

The dev server hot-reloads on file changes. TypeScript compilation errors appear in the terminal and browser console.

### Build commands

| Command | Outputs in `dist/` |
| --- | --- |
| `npm run build:prod` | `index.html` (production, standard variant) |
| `npm run build:demo` | `demo.html` (interactive demo backed by the in-browser mock broker) |
| `npm run build:no-payload` | `no-payload.html` (queue-browser with the message body hidden — see Build-time feature flags) |
| `npm run build:no-queue-copy` | `no-queue-copy.html` (standard variant minus the Queue Copy module) |
| `npm run build:all` | `all-test.html` (kitchen-sink QA build — every module, including the admin ones) |
| `npm run build:admin` | `solAdmin.html` (the standalone administration app — see [architecture.md -> The admin app](architecture.md#the-admin-app-soladmin)) |
| `npm run build:provisioned` | `provisioned.html` (variant `managed`: standard plus the Provisioned sign-in; the gateway serves it at `/` in Provisioned mode) |
| `npm run build:provisioned-demo` | `provisioned-demo.html` (demo mode, variant `managed-demo`: the Provisioned modules and the admin pages (the three editors and Backup & Restore) against the demo's fake gateway and broker; see [architecture.md -> The demo broker](architecture.md#the-demo-broker-demohtml-provisioned-demohtml)) |
| `npm run build` | `demo.html`, `index.html`, `min.html`, `no-payload.html`, `no-queue-copy.html`, `solAdmin.html`, `provisioned.html` AND `provisioned-demo.html` in one pass |
| `npm run check:bundles` | Checks `dist/`: no Direct bundle carries Provisioned UI or the fake gateway, `provisioned.html` carries the Provisioned UI only, and `provisioned-demo.html` carries both with no way out to a network. The `build` task runs it after `npm run build` |

`dist/` is git-ignored build output; nothing in it is committed. Tagged Releases publish the Direct-only bundles, and the offline Provisioned demo (`provisioned-demo.html`), never `solAdmin.html` or `provisioned.html`, which ship only inside the image (see [git.md -> Release assets](git.md#release-assets)). For local runs, drop `solclient.js` / `jszip.min.js` in beside the bundles (see [deployment.md -> External Runtime Dependencies](deployment.md#external-runtime-dependencies)).

**The gates are `scripts/dev.sh` / `scripts/dev.ps1`, not the npm scripts.** The table above is the variant reference -- reach for an individual `build:*` script when iterating on one variant. For anything you would call a gate, use the task: `./scripts/dev.sh all` (`build vet test mock`; CI runs `all cov scan`), `cov`, `scan`, `image`, or `full` for the pre-tag sweep. The tasks call the npm scripts above plus the Go halves, and they are the only place a build command lives -- see [contributing.md](contributing.md#development-workflow) for the task table and [git.md](git.md) for how a tag turns into a release.

The npm scripts the tasks wrap: `typecheck` (`tsc --noEmit` over `src/`), `typecheck:tests` (`tsc -p tsconfig.test.json --noEmit`: `tests/`, `vite.config.ts`, `vitest.config.ts`), `lint` (ESLint with the house rules, [eslint.config.mjs](../eslint.config.mjs)), `check:bundles` (the Direct bundles carry no Provisioned UI or gateway calls, `provisioned.html` does, and `provisioned-demo.html` does against the fake gateway with no network: [scripts/check-bundles.mjs](../scripts/check-bundles.mjs), run by `build`), `audit:gate` (the npm half of `scan`: [scripts/npm-audit-gate.mjs](../scripts/npm-audit-gate.mjs) runs `npm audit` and fails only on fixable HIGH/CRITICAL advisories), `test` / `test:coverage`, and `build`. The `image` and `scan` tasks otherwise run their commands directly (`docker compose build`, `go tool govulncheck`, and the pinned Trivy container, see [git.md](git.md#keeping-the-workflow-pins-current)); there are deliberately no `image:*` / `scan:*` npm scripts, so each gate has one definition. `scan` runs `go tool govulncheck`, which resolves through the `tool` directive pinned in [go-web-proxy/go.mod](../go-web-proxy/go.mod) -- never `go run pkg@version`, which runs module-less and ignores the toolchain pin.

Custom variants are built via the `scripts/vite-build.mjs` wrapper, which surfaces `--variant=<name>`, `--out-filename=<name>`, and `--show-payload=<bool>` because Vite's CLI parser (CAC) rejects unknown flags. The wrapper forwards them to `vite.config.ts` via private env vars. Example: `node scripts/vite-build.mjs --variant=min --out-filename=min.html`. The dev server reads the same variant from the environment: `__VITE_VARIANT=managed npm run dev` serves the managed bundle (Provisioned tab included; it needs a managed gateway behind `/hosted` and `/managed/*` to sign in).

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

The two vendor scripts (`solclient.js`, `jszip.min.js`) are intentionally **not** bundled -- they're loaded at runtime from sibling locations. The demo build is the exception: it installs its own SDK, so `demo.html` needs no `solclient.js` (only `jszip.min.js`, for ZIP export). See [deployment.md -> External Runtime Dependencies](deployment.md#external-runtime-dependencies) for the placement rules the shell expects.

A variant that needs neither script (the `admin` variant: no broker, no ZIP export) exports `NEEDS_VENDOR_SCRIPTS = false` from its manifest, declared after `ACTIVE_MODULES`. `injectModuleTemplates` in `vite.config.ts` then strips the shell's two `<!-- @vendor:start -->` ... `<!-- @vendor:end -->` blocks (the head loader, and the library banner with its after-banner script) using `stripVendorBlocks` from `scripts/module-registry-plugin.mjs`; every other variant keeps them. Keep both blocks' content to what the loader needs: `VENDOR_MARKERS` in `scripts/check-bundles.mjs` names the strings `check:bundles` looks for. The loader is an inline script, so `tests/shell-loader.test.ts` reads it out of `src/index.html` and runs it in jsdom; extend that file for a loader change. The kernel half of startup (the `#app-loading` placeholder) is described in [architecture.md](architecture.md) under "Startup placeholder and install failures".

`./scripts/dev.sh image up` builds the image from source and starts it twice with [docker/docker-compose.yaml](../docker/docker-compose.yaml): Gateway mode on host port `19443`, Provisioned mode on `29443` (`docker compose -f docker/docker-compose.yaml up --build gateway` starts one). The image takes both vendor scripts from the npm packages `package.json` pins (`solclientjs`, `jszip`), so `up` needs nothing in `dist/`. Bump either with `npm install --save-exact`, at or above the shell's `MIN_VERSION` in `src/index.html`: [tests/build/vendor-scripts.test.ts](../tests/build/vendor-scripts.test.ts) holds both rules and checks the Dockerfile's copy paths.

**Adding a gateway `config.yaml` setting.** Classify the new key as live (a field of `liveSettings`, applied by `apply`), restart-only (`restartOnlyKeys`) or host-only (`hostOnly`); `TestFileConfig_EveryKeyIsClassifiedOnce` in `go-web-proxy/live_test.go` fails until it is exactly one. A variable that seeds it takes the `SMU_` prefix (only `LOG_LEVEL` keeps its bare name); never reuse a name Go or another tool reads itself, such as `SSL_CERT_FILE`.

---

## Project Structure

```text
src/
  core/
    types.ts           # Shared interfaces (AppContext, AppState, BusEvents, PwaModule).
                       # Re-exports ConnectionConfig + SempContext from connections/types.ts.
    event-bus.ts       # Typed pub/sub implementation
    kernel.ts          # Module orchestrator, state, navigation, SEMP auth
    dom.ts             # required() fail-fast required-element assertion, setError(el, msg) error banner,
                       # attachBackdropClose(dialog)
    utils.ts           # Pure utilities (escapeHtml, escapeXml, formatBytes, generateUuid, matchString,
                       # matchContains, topicsIntersect, topicFilterMatches, normalizeUrlPath, errMessage,
                       # isValidHost, isValidPort)
    icons.ts           # Shared inline SVG icons (ICONS) + iconButton() -- labelled icon-only buttons
    download.ts        # downloadBlob(): save a Blob as a named file (queue-browser, backup)
    timing.ts          # Shared INPUT_DEBOUNCE_MS for input-driven feedback
    toast.ts           # Toast notification system
    logger.ts          # Leveled logger every module writes through (?logLevel= URL override)
    hosted.ts          # /hosted probe + buildBrokerUrl — the single gateway-rewrite point
    constants.ts       # App-wide constants
    rbac.ts            # Stateless RBAC matchers -- matchGlob, isModuleVisible, isVpnVisible, isQueueVisible, canOperate,
                       # explainAccess (which level a row set grants, and the row)
    managed-semp-filter.ts # filterSempFetch — scopes SEMP discovery to entitled VPNs/queues (managed)
    services/                  # Pure broker-side factories — no AppContext, no UI.
      solace-client.ts         # createServiceSolace(hooks) → Solace session lifecycle
      solace-publisher.ts      # createSolacePublisher(session) → publish/ACK tracking
      semp-client.ts           # createServiceSemp(hooks) -> SEMP cred validation (or the gateway relay); returns SempContext
      semp-discovery.ts        # createSempDiscovery(sempCtx) → paginated VPN + queue fetchers
      sempContext.ts           # unfilteredPrimarySempContext(ctx) → SempContext from primary AppState.
                               # Named for what it does NOT do: only two SEMP v2 list shapes are filtered
      queue-source.ts          # QueueSource + typed Access/scope — the discovery seam components consume
      semp-errors.ts           # One error text for a SEMP answer (relay refusal code, or the HTTP status)
      managed-profile.ts       # Provisioned broker/VPN names; dial(target, {connect}): relay config or a dialled SMF credential
      managed-api.ts           # managedRequest() — /managed/* on the gateway session cookie; error codes → text
      managed-service.ts       # createManagedService() -> /managed/me, /managed/logout, /managed/dial, the relay base
    connections/               # Connection-domain library (types only — no orchestration here).
      types.ts                 # SolaceConfig, SempConfig, ConnectionConfig, ConnectionCredentials, SempContext
      defaults.ts              # DEFAULT_CONFIG + validateConfig (data-shape validator)
      conn-modes.ts            # ConnDeploymentConfig + DEFAULT_CONN_CONFIG + coerceConnConfig +
                               # resolveConnTabs (fed by SMU_CONN_MODES/SMU_DEFAULT_CONN)
    components/                # Reusable UI components with function APIs.
      queue-picker/
        index.ts               # pickQueue(source, opts?) — takes a QueueSource, never SEMP directly
        styles.css             # Component-scoped .picker-* styles
      row-list/
        index.ts               # createRowList(container, fields) -- dynamic add/remove row editor (managed admin forms);
                               # renderAdminRows(tbody, shown, total, query, opts) -- the admin table body (connection-management, user-management)
      provisioned-connection/
        index.ts               # createProvisionedConnectionCard -- Broker + Message VPN pickers, Connect, status; used by connections and queue-copy
        styles.css             # Component-scoped styles
      confirm-dialog/
        index.ts               # confirmDialog(message, opts) -- the yes/no question, in place of confirm()
      notification-center/
        index.ts               # The bell in the header: a record of toasts and the connection lifecycle
      module-gate/
        index.ts               # createGate(container, {id,title,message}) — full-view "… Required" gate card
  css/                 # Split by responsibility; aggregated by main.css
    variables.css      # :root design tokens
    reset.css          # * resets
    layout.css         # Shell chrome — app container, sidebar, top bar, status
    components.css     # Generic UI — buttons, cards, forms, modals, tables, badges
    utilities.css      # Atomic helpers — flex, gap, spacing, sizing
    main.css           # @import entry -- imported by main.ts: the design system and the core components' styles.css
                       # (a module's styles.css comes with its manifest line, through virtual:module-registry)
  modules/
    connections/       # Priority 100. Owns the PRIMARY connection lifecycle.
      module.ts        # Release entry (Direct only). Exports installDirect, which defines
                       # solaceHooks/sempHooks bridging factory lifecycle events
                       # (onConnected/onDisconnected/etc.) to ctx.setState + eventBus.emit +
                       # the connections form's UI updates.
      module.managed.ts # Provisioned entry (the managed variant): tab bar + installDirect + panel
      managed-panel.ts # The Provisioned tab -- gateway session restore, provisioned dropdowns, browser guardrails
      vpn-switch.ts    # The VPN switch both modes share (connection:check-connection)
      config.js        # localStorage persistence (values obfuscated at rest)
      ui.js            # Element caching, auth mode, visual feedback
      styles.css       # Module-scoped styles
      index.html       # Module HTML template (injected by build plugin) — the Direct form
      index.managed.html # Provisioned entry template: tab bar + index.html (at <!-- @module-base -->) + Provisioned panel
    queue-browser/     # Priority 80
      module.ts        # Event listener wiring
      service.ts       # Browser create, forward, delete
      features.ts      # Build-time flavor flag — showPayload() reads VITE_SHOW_PAYLOAD
      payload.ts       # Binary-attachment helpers: attachmentBytes, classifyAttachment (text vs size-only placeholder)
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
    admin-login/           # /solAdmin entry point — restores the gateway session, opens no broker connection
    user-management/       # Admin-only (/solAdmin) — user + entitlement CRUD
    connection-management/ # Admin-only (/solAdmin) — broker connection CRUD
    gateway-settings/      # Admin-only (/solAdmin) — config.yaml editor
    backup/                # Admin-only (/solAdmin) — encrypted export/import and scheduled backups
  variants/
    standard.ts        # Default variant -- the everyday bundle (no admin modules)
    min.ts             # Minimal variant — connections + queue-browser only
    no-queue-copy.ts   # Standard variant minus the Queue Copy module
    admin.ts           # The /solAdmin app — admin-login, the two entitlement editors, gateway settings
    managed.ts         # provisioned.html, served in Provisioned mode -- standard + connections' managed entry (MODULE_ENTRIES)
    all-for-testing-only.ts  # Kitchen-sink QA build — every module, incl. the admin ones
    _active.ts         # One-line re-export from one variant (default ./standard)
  mock-broker/         # DEMO ONLY -- entered solely via the demo-mode import redirect,
                       # so no production bundle contains it.
    boot.ts            # Installs window.solace, the fetch interceptor and the panel
    fixtures.ts        # THE demo dataset + scenario enums — single source of truth
    emitter.ts         # Synchronous FIFO emitter, as in the real SDK
    sdk/               # enums, session, browser, message — the solace global
    broker/store.ts    # Queues, messages, seeding, publish routing, deletes
    server/            # fetch router: SEMP v2 + v1, /hosted (Direct only)
    controls/          # The demo scenario switcher (.mockctl-* only)
  main.ts              # Bootstrap (imports ./css/main.css and ./registry)
  registry.ts          # Resolves variant manifest → PwaModule via virtual:module-registry (moduleRegistryPlugin)
  index.html           # App shell with <!-- @module-templates --> marker
tests/
  setup.ts             # Global mocks (Solace SDK, browser APIs)
  helpers/             # loadModuleDOM, resetQueueBrowserState, sources (the app source files, for scans)
  core/                # Kernel, EventBus, toast, utils tests (dom.ts is exercised transitively by module tests)
  modules/             # Per-module test files
  build/               # scripts/*.mjs tests -- module-registry-plugin (manifest -> virtual:module-registry, entry overrides), check-bundles, npm-audit-gate
  variants.test.ts     # Every variant manifest resolves and keeps its shape invariants
  registry.test.ts     # Registry resolution + kernel integration
  main.test.ts         # Bootstrap
  integration/         # Cross-module + end-to-end tests
    full-flow.test.ts        # Kernel mechanics with stub modules
    module-events.test.ts    # Real modules + shared EventBus + mocked services
    message-pipeline.test.ts # Broker message → ingest → filter → DOM, end-to-end
    admin-session.test.ts    # /solAdmin session lifecycle: real admin-login + user-management
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

Priority (install order + sidebar position) is **not** a module property -- it's the value beside the module id in the variant manifest (`src/variants/<name>.ts`), which `src/registry.ts` reads, so a variant's full ordering is visible in one file. The kernel takes `RegisteredModule[]` (`{ module, priority }` tuples) and sorts them descending before calling `install()`.

### AppContext (Dependency Injection)

Modules never import each other. The Kernel passes an `AppContext` into each module's `install()`:

```ts
interface AppContext {
    container: HTMLElement;       // Module's private DOM subtree
    appState: AppState;          // Read-only global state reference
    eventBus: EventBus;          // Typed pub/sub
    setState(key, value): void;  // Update global state + emit event
    loadSelf(): void;            // Navigate to this module's view
    sempFetch(url, opts): Promise<Response>;  // SEMP with auto-injected auth (managed: the gateway relay)
    managedProfile: ManagedProfileStore;  // Provisioned names; dials targets on request
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
| `rbac:changed` | void | Connections (Provisioned panel) / User Mgmt / Admin Login -> Kernel (sidebar re-render) + any module holding entitlement-derived state |
| `rbac:sign-out-requested` | void | User Mgmt / Connection Mgmt -> Admin Login / Connections (Provisioned panel): end the Provisioned session (own password or administrator flag changed, own account deleted, or a `401` from the gateway) |
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

**Core service factories** in `src/core/services/` are **pure** -- no AppContext, no UI access, no global bus. Lifecycle is communicated through caller-supplied hooks. This decouples the broker plumbing from any particular module so the same factory can power the connections module's primary connection AND another module's secondary connection -- queue-copy's destination, which drives its own pair of these factories and keeps every effect in module-local state. Note the connections module itself bridges TWO parallel hook sets: `module.ts` for the Direct form and `managed-panel.ts` for the Provisioned tab, both writing the same AppState keys and emitting the same bus events:

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

The connections module owns the **primary** connection: `installDirect` in its `module.ts` (shared by the Release and managed entries) defines `solaceHooks`/`sempHooks` that bridge factory events to `ctx.setState` + `eventBus.emit('client:connected'...)` + the connections form's UI updates. Other modules subscribe to those bus events as they always have. queue-copy is the secondary-connection caller: it defines different hooks that target module-scoped state instead of global state -- same factory, different bridging. When the primary connection is Provisioned its destination is the shared provisioned connection card (`src/core/components/provisioned-connection/`) and, on Connect, it asks `ctx.managedProfile.dial(target, { connect })` and creates the client inside that callback: SEMP gets the gateway's relay base (`SempConfig.relayBase`, no credential at all), and SMF gets the VPN's dialled password and socket path (`SolaceConfig.smfPath`), which go straight to the SDK and are never stored.

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
     styles.css     # Optional -- module-scoped styles, imported by the registry wherever the module is active
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

   Pick a priority that slots into the existing list (higher installs first, renders higher in the sidebar). [src/registry.ts](../src/registry.ts) resolves each id in the manifest to the `PwaModule` exported by `src/modules/<id>/module.ts` via the `virtual:module-registry` module (generated per variant by `scripts/module-registry-plugin.mjs`), so no import section needs touching and only the active variant's modules enter the bundle. To **disable** a module in a variant, comment its line. To **ship a different variant**, drop a new `src/variants/<name>.ts` and build it with `node scripts/vite-build.mjs --variant=<name> --out-filename=<name>.html` (add a matching `build:<name>` npm script, and a pass in `build`, if it should ship). To give one variant a different **entry** for a module, export `MODULE_ENTRIES = { '<id>': '<entry>' }` from the manifest and add `src/modules/<id>/module.<entry>.ts` (and optionally `index.<entry>.html`, which can pull the base `index.html` in at a `<!-- @module-base -->` marker). The connections module does this for the `managed` variant; its `module.ts` must never import the managed entry's files.

   > **Gating a module in Provisioned deployments:** a module in the `managed` variant is under module control: a signed-in user sees it only if an administrator grants it, so add its id to `moduleCatalog()` in [go-web-proxy/configfile.go](../go-web-proxy/configfile.go) (`tests/variants.test.ts` fails until you do). To keep it out of Provisioned sessions instead, add it to `MODULE_REQUIREMENTS` in [src/core/rbac.ts](../src/core/rbac.ts): `'admin'` for admin-only CRUD (like the editors, which ship only in `src/variants/admin.ts`), or `'unfiltered-semp'` for a module that reaches the broker over a path RBAC cannot filter, which hides it in **every** Provisioned session and keeps it out of the catalog. The kernel hides the sidebar entry and re-evaluates on `rbac:changed`. See [architecture.md -> Provisioned Connections](architecture.md#provisioned-connections-rbac).

5. **Nothing to import for the module's CSS.** If you added `styles.css`, the registry plugin imports it into every variant that lists the module (and no other), after the design system. Never `@import` a module stylesheet from `src/css/main.css`: it would ship in every bundle, the variants without the module included.

   **Admin list modules:** an admin CRUD list calls `renderAdminRows(tbody, shown, total, query, { plural, noun, classPrefix, cells, label, onEdit, onDelete })` from `core/components/row-list` for its rows and filter feedback, and `setError(el, msg)` from `core/dom` for banners. Do not write a local `setError` or a hand-built row and actions cell.

   **Install renders from current state; an event handler acts only on a real change of the state it depends on.** The kernel replays a held `rbac:changed` to every module after install, so a handler that refetches or re-gates on every `rbac:changed` repeats the work `install` just did. The admin modules (`user-management`, `connection-management`, `gateway-settings`, `backup`) keep a session key (`JSON.stringify([username, admin])`, `null` when signed out) and their `rbac:changed` handler returns early when the key equals the one last applied. A direct `applyGate()` after a save or Refresh stays unconditional, so a module that emits `rbac:changed` for others about its own change (User Management saving its own entitlements) also calls `applyGate()` itself. Test it with one case for the unchanged session (no request) and one for a real change (sign-out and in, another admin, a demotion).

6. **Write tests** in `tests/modules/your-module/module.test.ts`. Use `loadModuleDOM('your-module')` from `tests/helpers/loadModuleDOM.ts` to load the real template in tests.

---

## Testing

### Running Tests

```bash
npm test                # Single run (the full suite)
npm run test:watch      # Watch mode (re-runs on file changes)
npm run test:coverage   # With 100% coverage enforcement
```

All commands use `--pool=threads` (configured in `package.json`); Vitest sizes the worker pool to the machine.

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

Load the real per-module `index.html` via [`loadModuleDOM`](../tests/helpers/loadModuleDOM.ts) so the test DOM can never drift from the production template. The `moduleId` argument is a plain `string` (the directory name under `src/modules/`) — a typo throws at read time, loud enough for tests. Pass an entry to load a variant entry's composed template, exactly as the build injects it: `loadModuleDOM('connections', 'managed')`. The previous compile-time enumeration was retired along with `src/module-ids.ts` when variant manifests became the single source of truth.

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

**Shared state reset.** Queue-browser tests must call `resetQueueBrowserState()` from [tests/helpers/resetQueueBrowserState.ts](../tests/helpers/resetQueueBrowserState.ts) in `beforeEach` -- the `state.js` singleton declares every field the module uses (the helper resets all of them), and resetting only the ones a specific test touches lets mutations leak across files. Global `beforeEach`/`afterEach` hooks in [tests/setup.ts](../tests/setup.ts) also re-install default `localStorage` mock implementations and revert fake timers automatically; see [contributing.md](contributing.md) for details.

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
- Log through the tagged logger (see [Logging standard](#logging-standard)), show user-facing messages in the UI

### Logging standard

One standard for the web app and the gateway, so a line can be read, filtered and tied to the others for the same user or request without the source at hand.

- **Levels by meaning.** `error`: something failed and needs attention (a request answered with a 5xx, a store that will not load, a run that ended in error). `warn`: a recoverable problem the code handled (a refused request, a fallback taken, a value ignored). `info`: lifecycle, state changes and audit events (start and stop, connect and disconnect, a sign-in, an administrator's change, a setting applied). `debug`: trace for a developer (each step, each message, request detail).
- **Every line names its component and what it concerns.** The component is the tag (`[Connections]`, `[Copy]`, `[queue-browser]`, `[queue-discovery]`) in the web app and the logger's attributes in the gateway; then the identifiers the event is about, as they apply: user, client, broker, VPN, queue, path.
- **Facts as attributes, not prose.** In the gateway an operation, an error code or a count is a key-value attribute (`"code", "read_only"`), and the message stays a fixed sentence, so a line filters without a regular expression. In the web app the values follow a fixed phrase, as `key=value` where there are several.
- **No secrets, at any level.** Never a password, a passphrase, a store key, a session cookie or an `Authorization` header: leave it out or mask it. A broker's address is not a secret; its credential is.
- **Web app.** `const log = logger.withTag('<Component>')` from [src/core/logger.ts](../src/core/logger.ts), never `console.*`: ESLint holds it, and the inline script in `src/index.html`, which runs before any module, is the one exception. The level is set at boot; `?logLevel=DEBUG` (or `WARN`, `ERROR`, `SILENT`) overrides it.
- **Gateway.** A request's lines go through `requestLogger(base, r)` ([go-web-proxy/logging.go](../go-web-proxy/logging.go)), which carries the client, the method, the path and, once a gate has recorded one, the user. `LOG_LEVEL` sets the level, and one summary line at startup is always written whatever the level: the version, the mode and the settings in force, never a secret.

### Auditing an action

The gateway's audit trail (design: [architecture.md -> The audit trail](architecture.md#the-audit-trail); operator view: [provisioned-mode.md -> Audit trail](provisioned-mode.md#audit-trail)) is separate from logging: log what the program does, audit what a person did to it. Add an event when a new route changes configuration or access, or a new sign-in path appears.

- **An admin route.** Register it with `h.audited(pre, fn)` in `managed.go` instead of `h.adminOnly(...)`. `pre` names the action and target from the request (before the handler runs, so a refusal by `adminOnly` is recorded too); `fn` receives a `*auditCall` to override the action, set the target, and list `changed` (names only). Add the action constant to the `audit.go` list, its phrase to `auditPhrases` (`done` and `attempt`), and tests for one `ok` and one `refused` entry.
- **Anything else.** `e := auditFor(r, auditX)` gives actor and client; set `Target`, `Outcome` (`auditOK` or `auditRefused`), `Code` (the code the API answers), `Changed` and `Msg`, then `h.audit.record(category, e)`. Set `e.Actor` yourself where the actor is not the session user (a sign-in names the account tried). Do not nil-check `h.audit`.
- **Naming.** `noun.verb` in lower case (`user.update`, `schedule.remove`); a single word for an event with no noun (`signin`, `dial`). Categories: `auditAdmin` and `auditAuth` are always written, `auditAccess` only while `audit.access` is on, so use it for high-volume broker traffic. `msg` is a plain sentence naming actor, verb and target.
- **Names, never values.** `changed` lists parts (`password`, `grants`, `vpn prod`, a settings key such as `modules.userDefault`), never what they were set to. An entry never holds a password or hash, store or backup key, passphrase, session cookie or token, a VPN or SEMP credential, a settings value or backup content. A target that came from the requester (a path segment, a file name, a username) is cut to 64 bytes (`userKey`) so it cannot flood the line.
- **Tests.** A test that looks at the trail sets `e.api.audit` (`env.setAudit` in [managed_test.go](../go-web-proxy/managed_test.go) opens an auditor over a temp file with a fixed clock and the `auditLog` helper reads it back). Cover the entry for the new event, its refusal, and keep `TestManagedAPI_AuditNeverHoldsASecret` (`managed_test.go`, the secret sweep) passing: it submits known secrets through every audited route and fails if any appears in the file.

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- `allowJs: true` with `checkJs: true` -- mixed TS/JS codebase (legacy JS files coexist with new TS, and `tsc` checks them; JSDoc types where inference falls short)
- `tsconfig.test.json` extends the base for `tests/**` and the vite/vitest configs (`vitest/globals` and Node types): a test fixture typed as a production type breaks `vet` when the type changes, instead of running on stale fields
- `declare const solace: any` in files that access the global Solace SDK
- Run `npm run typecheck` (`tsc --noEmit`) and `npm run typecheck:tests` to check types -- the build (Vite/esbuild) and vitest strip types **without** checking them, so `tsc` is the only thing that catches type errors. Both are part of `vet`, a separate gate from `build`, enforced in CI.
