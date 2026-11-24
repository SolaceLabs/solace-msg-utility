# Developer Guide

This guide is for developers who build, change or extend the project: the TypeScript app (the browser side) and the Go gateway (`go-web-proxy`). It covers how to set up and build, how the code is laid out, the ideas every module relies on, how to add a module, the one set of code conventions, and how-tos for the gateway and the admin pages. For how the system fits together, read [architecture.md](architecture.md); for the workflow, task table and pull request checklist, [contributing.md](contributing.md); for writing and running tests, [testing.md](testing.md).

## Contents

- [Setup](#setup)
  - [Build commands](#build-commands)
  - [Building variants](#building-variants)
  - [Build-time feature flags](#build-time-feature-flags)
  - [Build internals](#build-internals)
  - [Vendor scripts](#vendor-scripts)
  - [Maintaining dependencies](#maintaining-dependencies)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
  - [The Module Contract](#the-module-contract)
  - [AppContext (Dependency Injection)](#appcontext-dependency-injection)
  - [EventBus (Cross-Module Communication)](#eventbus-cross-module-communication)
  - [Factory Pattern](#factory-pattern)
  - [Circular Dependency Resolution](#circular-dependency-resolution)
- [Adding a New Module](#adding-a-new-module)
- [Writing the Manual](#writing-the-manual)
  - [A chapter](#a-chapter)
  - [Figures](#figures)
  - [The guide on GitHub](#the-guide-on-github)
  - [What checks a chapter](#what-checks-a-chapter)
- [Testing](#testing)
- [Code Conventions](#code-conventions)
  - [File Organization](#file-organization)
  - [TypeScript](#typescript)
  - [Linting](#linting)
  - [DOM Access](#dom-access)
  - [Modals](#modals)
  - [CSS](#css)
  - [Event Handling](#event-handling)
  - [Error Handling](#error-handling)
  - [Logging standard](#logging-standard)
- [Gateway and Admin How-tos](#gateway-and-admin-how-tos)
  - [Adding a gateway config.yaml setting](#adding-a-gateway-configyaml-setting)
  - [Writing a config.yaml by hand (development only)](#writing-a-configyaml-by-hand-development-only)
  - [Auditing an action](#auditing-an-action)
  - [Writing to the store](#writing-to-the-store)
  - [Adding a sign-in step](#adding-a-sign-in-step)
  - [Changing the TLS files](#changing-the-tls-files)
  - [Laying out an admin page](#laying-out-an-admin-page)

---

## Setup

You need Node.js and npm for the app, and Go for the gateway (the toolchain version is pinned in [go-web-proxy/go.mod](../go-web-proxy/go.mod)). Docker is needed only for the image tasks.

```bash
git clone <repository-url>
cd solace-msg-utility
npm install
npm run dev          # Dev server at http://localhost:5173
npm run preview      # Serve an already-built dist/ bundle
```

The dev server hot-reloads on file changes. TypeScript compilation errors appear in the terminal and browser console.

### Build commands

| Command | Variant id | Outputs in `dist/` |
| --- | --- | --- |
| `npm run build:prod` | `standard` | `index.html` (production) |
| `npm run build:demo` | `standard`, demo mode | `demo.html` (interactive demo backed by the in-browser mock broker) |
| `npm run build:no-payload` | `standard`, `--show-payload=false` | `no-payload.html` (queue-browser with the message body hidden; see [Build-time feature flags](#build-time-feature-flags)) |
| `npm run build:no-queue-copy` | `no-queue-copy` | `no-queue-copy.html` (standard minus the Queue Copy module) |
| `npm run build:all` | `all-for-testing-only` | `all-test.html` (kitchen-sink QA build: every module a variant ships, including the admin ones) |
| `npm run build:admin` | `admin` | `solAdmin.html` (the standalone administration app; see [architecture.md -> The admin app](architecture.md#the-admin-app-soladmin)) |
| `npm run build:provisioned` | `managed` | `provisioned.html` (standard plus the Provisioned sign-in; the gateway serves it at `/` in Provisioned mode) |
| `npm run build:provisioned-demo` | `managed-demo`, demo mode | `provisioned-demo.html` (the Provisioned modules and the admin pages against the demo's fake gateway and broker; see [architecture.md -> The demo broker](architecture.md#the-demo-broker-demohtml-provisioned-demohtml)) |
| `npm run build` | all of the above except `all-test.html`, plus `min` | `demo.html`, `index.html`, `min.html`, `no-payload.html`, `no-queue-copy.html`, `solAdmin.html`, `provisioned.html` and `provisioned-demo.html` in one pass |
| `npm run check:bundles` | -- | Checks `dist/`: no Direct bundle carries Provisioned UI or the fake gateway, `provisioned.html` carries the Provisioned UI only, `provisioned-demo.html` carries both with no way out to a network, and every bundle carries the Content-Security-Policy of its kind. The `build` task runs it after `npm run build` |

`dist/` is git-ignored build output; nothing in it is committed. Tagged Releases publish the Direct-only bundles and the offline Provisioned demo (`provisioned-demo.html`), never `solAdmin.html` or `provisioned.html`, which ship only inside the image (see [git.md -> Release assets](git.md#release-assets)).

**The gates are `scripts/dev.sh` and `scripts/dev.ps1`, not the npm scripts.** The table above is the variant reference: reach for an individual `build:*` script when iterating on one variant. For anything you would call a gate, use the task: `./scripts/dev.sh all` (`build vet test mock`; CI runs `all cov scan`), `cov`, `scan`, `image`, or `full` for the pre-tag sweep. The tasks call the npm scripts plus the Go halves, and they are the only place a build command lives; see [contributing.md](contributing.md#development-workflow) for the task table and [git.md](git.md) for how a tag turns into a release.

The npm scripts the tasks wrap:

- `typecheck` (`tsc --noEmit` over `src/`) and `typecheck:tests` (`tsc -p tsconfig.test.json --noEmit`: `tests/`, `vite.config.ts`, `vitest.config.ts`).
- `lint`: ESLint with the house rules ([eslint.config.mjs](../eslint.config.mjs)).
- `check:bundles`: [scripts/check-bundles.mjs](../scripts/check-bundles.mjs), run by `build`.
- `audit:gate`: the npm half of `scan`. [scripts/npm-audit-gate.mjs](../scripts/npm-audit-gate.mjs) runs `npm audit` and fails only on fixable HIGH and CRITICAL advisories.
- `test`, `test:app`, `test:mock`, `test:mock:coverage`, `test:coverage` and `build`.

The `image` and `scan` tasks run their commands directly (`docker compose build`, `go tool govulncheck`, and the pinned Trivy container, see [git.md](git.md#keeping-the-workflow-pins-current)). There are deliberately no `image:*` or `scan:*` npm scripts, so each gate has one definition. `scan` runs `go tool govulncheck`, which resolves through the `tool` directive pinned in [go-web-proxy/go.mod](../go-web-proxy/go.mod) -- never `go run pkg@version`, which runs module-less and ignores the toolchain pin.

### Building variants

A **variant** is the set of modules one bundle ships. Each is a manifest in `src/variants/<name>.ts`; the standard one is what `index.html` is built from. Variants are built through the `scripts/vite-build.mjs` wrapper, which surfaces `--variant=<name>`, `--out-filename=<name>`, `--show-payload=<bool>` and `--mode demo` because Vite's CLI parser (CAC) rejects unknown flags. The wrapper forwards them to `vite.config.ts` through private environment variables. Example:

```bash
node scripts/vite-build.mjs --variant=min --out-filename=min.html
```

The dev server reads the same variant from the environment: `__VITE_VARIANT=managed npm run dev` serves the Provisioned bundle (it needs a Provisioned gateway behind `/hosted` and `/managed/*` to sign in).

To ship a new variant, add `src/variants/<name>.ts`, add a matching `build:<name>` npm script and a pass in `build` if it should ship, and keep `src/variants/_active.ts` re-exporting `./standard`. [Adding a New Module](#adding-a-new-module) shows what a manifest holds. [deployment.md](deployment.md) lists which files an operator runs and what each is for.

### Build-time feature flags

A **flavor** is a build-time toggle of *how a module behaves*, orthogonal to which modules a *variant* ships. The pattern:

1. **Declare the flag where it is used.** Add a tiny module-local helper (do not put one-off, single-module flags in `src/core/`; see [architecture.md -> Build flavors vs variants](architecture.md#build-flavors-vs-variants)). Example: [src/modules/queue-browser/features.ts](../src/modules/queue-browser/features.ts):

   ```ts
   export function showPayload(): boolean {
       return import.meta.env.VITE_SHOW_PAYLOAD !== 'false';
   }
   ```

   Read it as a **function call at each use site**, not a module-level `const`, so `vi.stubEnv('VITE_SHOW_PAYLOAD', ...)` controls it per test.
2. **Plumb the flag through the build.** Add the CLI alias to `CUSTOM_FLAGS` in [scripts/vite-build.mjs](../scripts/vite-build.mjs), and a `define` in [vite.config.ts](../vite.config.ts): `'import.meta.env.VITE_SHOW_PAYLOAD': JSON.stringify(input ?? 'true')`. The `define` makes the flag a compile-time constant, so Rollup dead-code-eliminates the disabled branches from that bundle.
3. **Add an npm script** that calls the wrapper with the flag and `--out-filename`, and append it to the aggregate `build`.
4. **Test both states.** Stub the env in a flag-off suite (`vi.stubEnv` / `vi.unstubAllEnvs`); the default suites cover flag-on. Every `if (flag())` branch must be hit in both states to keep coverage at 100%. Gate only code that *runs in both flavors*: a guard on a function that is unreachable when the flag is off creates an uncovered off-branch (let unreachable leaf code stay covered by the flag-on suites instead).

### Build internals

`vite.config.ts` uses [vite-plugin-singlefile](https://github.com/nicolo-ribaudo/vite-plugin-singlefile) to inline all JS and CSS into a single HTML per variant. Settings of note:

- **Target**: ESNext
- **CSS**: inlined (no code splitting)
- **Dynamic imports**: forced inline (`inlineDynamicImports: true`)
- **emptyOutDir**: `false`, which preserves pre-placed files in `dist/` (vendor scripts, other variants) across builds.
- **Content-Security-Policy**: the `content-security-policy` plugin runs after `vite-plugin-singlefile` and writes each bundle's policy, with the hashes of its inline scripts and stylesheet, into a meta tag ([architecture.md -> Content-Security-Policy](architecture.md#content-security-policy)). A variant whose bundle only the gateway serves exports `GATEWAY_ONLY = true` from its manifest (`managed` and `admin` do), which limits its connections to its own origin; add the variant's bundle to `BUNDLE_CSP` in `scripts/check-bundles.mjs`.

`./scripts/dev.sh image up` builds the image from source and starts it twice with [docker/docker-compose.yaml](../docker/docker-compose.yaml): Gateway mode on host port `19443`, Provisioned mode on `29443` (`docker compose -f docker/docker-compose.yaml up --build gateway` starts one). The image takes both vendor scripts from the npm packages `package.json` pins (`solclientjs`, `jszip`), so `up` needs nothing in `dist/`.

### Vendor scripts

The two vendor scripts (`solclient.js`, `jszip.min.js`) are intentionally **not** bundled; the shell loads them at runtime from beside the HTML or from a sibling `js/` folder. For local runs, drop both in beside the bundles in `dist/`. The demo build installs its own SDK, so `demo.html` needs no `solclient.js` (only `jszip.min.js`, for ZIP export). Where an operator gets them, and what the app does when one is missing, is in [deployment.md -> Vendor libraries](deployment.md#vendor-libraries).

A variant that needs neither script (the `admin` variant: no broker, no ZIP export) exports `NEEDS_VENDOR_SCRIPTS = false` from its manifest, declared after `ACTIVE_MODULES`. `injectModuleTemplates` in `vite.config.ts` then strips the shell's two `<!-- @vendor:start -->` ... `<!-- @vendor:end -->` blocks (the head loader, and the library banner with its after-banner script) using `stripVendorBlocks` from `scripts/module-registry-plugin.mjs`; every other variant keeps them. Keep both blocks' content to what the loader needs: `VENDOR_MARKERS` in `scripts/check-bundles.mjs` names the strings `check:bundles` looks for. The loader is an inline script, so `tests/shell-loader.test.ts` reads it out of `src/index.html` and runs it in jsdom; extend that file for a loader change. The kernel half of startup (the `#app-loading` placeholder) is described in [architecture.md](architecture.md) under "Startup placeholder and install failures".

To change either script's version, bump it with `npm install --save-exact`, at or above the shell's `MIN_VERSION` in `src/index.html`. [tests/build/vendor-scripts.test.ts](../tests/build/vendor-scripts.test.ts) holds both rules and checks the Dockerfile's copy paths.

### Maintaining dependencies

- **npm and Go requirements are pinned exactly.** A fixable CVE that `scan` reports is fixed as its own change, with the gates re-run.
- **Go requirements carry licences into the image.** The Dockerfile copies the licence of Go and of each direct `go.mod` requirement (`gopkg.in/yaml.v3`, `rsc.io/qr`) from the module cache into `/SolaceMsgUtility/licenses/`, and the build fails if one is missing. `tests/build/vendor-scripts.test.ts` fails when a direct requirement has no licence copied. When you add or remove a direct Go requirement, update the Dockerfile's staging step and the list in [deployment.md](deployment.md), and call out that the image must be redeployed.
- **Vendor scripts** are pinned by `package.json`; see [Vendor scripts](#vendor-scripts).

---

## Project Structure

```text
src/
  core/
    types.ts           # Shared interfaces (AppContext, AppState, BusEvents, PwaModule).
                       # Re-exports ConnectionConfig + SempContext from connections/types.ts.
    event-bus.ts       # Typed pub/sub implementation
    kernel.ts          # Module orchestrator, state, navigation, SEMP auth
    boot.ts            # Starts the app; the demo build swaps it for mock-broker/boot
    dom.ts             # required() fail-fast required-element assertion, setError(el, msg) error banner,
                       # attachBackdropClose(dialog)
    segmented.ts       # createSegmented(): wires a .segmented group of joined buttons (the broker type, Queue Copy's Copy to,
                       # the Direct form's Basic / OAuth2, Conn. Mgmt's schemes); the pressed button is the choice
    slide-choice.ts    # createSlideChoice(): wires a .slide-choice, a switch with an answer on either side (Queue Copy's
                       # Queue / Topic and Copy / Move, User Management's Modules); off is the first answer, on the second
    utils.ts           # Pure utilities (escapeHtml, escapeXml, formatBytes, generateUuid, matchString,
                       # matchContains, topicsIntersect, topicFilterMatches, normalizeUrlPath, errMessage,
                       # solaceErrorText, isValidHost, isValidPort)
    icons.ts           # Shared inline SVG icons (ICONS) + iconButton() -- labelled icon-only buttons
    download.ts        # downloadBlob(): save a Blob as a named file (queue-browser, backup); saveBlob(): the save dialog where the browser has one
    timing.ts          # Shared INPUT_DEBOUNCE_MS for input-driven feedback
    toast.ts           # Toast notification system
    logger.ts          # Leveled logger every module writes through (?logLevel= URL override)
    hosted.ts          # /hosted probe + buildBrokerUrl -- the single gateway-rewrite point
    constants.ts       # App-wide constants
    admin-conflict.ts  # handleConflict: the shared "changed by someone else" answer of the admin editors
    rbac.ts            # Stateless RBAC matchers -- matchGlob, isModuleVisible, isVpnVisible, isQueueVisible, canOperate,
                       # explainAccess (which level a row set grants, and the row)
    managed-semp-filter.ts # filterSempFetch -- scopes SEMP discovery to entitled VPNs/queues (Provisioned)
    services/                  # Pure broker-side factories -- no AppContext, no UI.
      solace-client.ts         # createServiceSolace(hooks) -> Solace session lifecycle
      solace-publisher.ts      # createSolacePublisher(session) -> publish/ACK tracking
      semp-client.ts           # createServiceSemp(hooks) -> SEMP cred validation (or the gateway relay); returns SempContext
      semp-discovery.ts        # createSempDiscovery(sempCtx) -> paginated VPN + queue fetchers
      sempContext.ts           # unfilteredPrimarySempContext(ctx) -> SempContext from primary AppState.
                               # Named for what it does NOT do: only two SEMP v2 list shapes are filtered
      queue-source.ts          # QueueSource + typed Access/scope -- the discovery seam components consume
      semp-errors.ts           # One error text for a SEMP answer (relay refusal code, or the HTTP status); relayRefusal also returns the code
      provisioned-connect.ts   # connectProvisioned(steps) -- SEMP then messaging, both or neither; the card's short reasons
      managed-profile.ts       # Provisioned broker/VPN names; dial(target, {connect}): relay config or a dialled SMF credential
      managed-api.ts           # managedRequest() -- /managed/* on the gateway session cookie; error codes -> text
      managed-service.ts       # createManagedService() -> /managed/me, /managed/logout, /managed/dial, the relay base
    connections/               # Connection-domain library (types and config coercion -- no orchestration here).
      types.ts                 # SolaceConfig, SempConfig, ConnectionConfig, ConnectionCredentials, SempContext
      defaults.ts              # DEFAULT_CONFIG + validateConfig (data-shape validator)
      conn-modes.ts            # ConnDeploymentConfig + DEFAULT_CONN_CONFIG + coerceConnConfig +
                               # resolveConnTabs (fed by SMU_CONN_MODES/SMU_DEFAULT_CONN)
      broker-hosts.ts          # createBrokerHosts(): the broker-type control and the two host boxes of a
                               # connection form (one host, or an appliance's management and messaging hosts)
    components/                # Reusable UI components with function APIs.
      queue-picker/
        index.ts               # createQueuePicker() -> ctx.queuePicker.pick(source, opts?) -- takes a QueueSource, never SEMP directly
        styles.css             # Component-scoped .picker-* styles
      row-list/
        index.ts               # createRowList(container, fields) -- dynamic add/remove row editor (admin forms);
                               # renderAdminRows(tbody, shown, total, query, opts) -- the admin table body
      provisioned-connection/
        index.ts               # createProvisionedConnectionCard -- Broker + Message VPN pickers, Connect, status (or read-only); used by connections and queue-copy
        styles.css             # Component-scoped styles
      account-control/
        index.ts               # createAccountControl(onSignOut, { next }) -- the sidebar's account actions; used by connections and admin-login
        styles.css             # Component-scoped .account-control-* styles
      confirm-dialog/
        index.ts               # confirmDialog(message, opts) -- the yes/no question, in place of confirm()
      notification-center/
        index.ts               # The bell in the header: a record of toasts and the connection lifecycle
      module-gate/
        index.ts               # createGate(container, {id,title,message}) -- full-view "... Required" gate card; gateOnAdminSession(app, handlers) for admin modules
  css/                 # Split by responsibility; aggregated by main.css
    variables.css      # :root design tokens
    reset.css          # * resets
    layout.css         # Shell chrome -- app container, sidebar, top bar, status
    components.css     # Generic UI -- buttons, cards, forms, tabs, switches, modals, tables, badges
    utilities.css      # Atomic helpers -- flex, gap, spacing, sizing
    main.css           # @import entry, imported by main.ts: the design system and the core components' styles.css
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
      optional-field.ts # The URL Path of a card: a small "+ URL path" button until a path is added
      config.js        # localStorage persistence (values obfuscated at rest)
      ui.js            # Element caching, auth mode, visual feedback
      styles.css       # Module-scoped styles
      index.html       # Module HTML template (injected by build plugin) -- the Direct form
      index.managed.html # Provisioned entry template: tab bar + index.html (at <!-- @module-base -->) + Provisioned panel
    queue-browser/     # Priority 80
      module.ts        # Event listener wiring
      service.ts       # Browser create, forward, delete
      features.ts      # Build-time flavor flag -- showPayload() reads VITE_SHOW_PAYLOAD
      payload.ts       # Payload helpers: attachmentBytes, classifyAttachment (text vs size-only placeholder), contentFileName
      file-kind.ts     # A binary payload's kind from its first bytes, image size
      sdt.ts           # Map and stream bodies decoded: YAML for the pane, JSON for Download Full
      service-events.ts # onMessage, onBrowserUp/Down, ACK/REJECT
      state.js         # Message store, filter logic
      ui-core.js       # Element cache, visibility, counts
      ui-events.ts     # User action handlers
      ui-table.ts      # Table rendering, ZIP download
      ui-details.ts    # Detail panel, property display, an image payload's Show content
      ui-forward.js    # Forward modal + ACK tracking
      constants.js     # SVG icon strings used in rendered rows
      styles.css       # Module-scoped styles
      index.html       # Module HTML template
    queue-copy/        # Priority 70 -- cross-broker copy/move with verify+run phases
      constants.ts     # Single source of truth for IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH/LOW,
                       # BIND_PROBE_TIMEOUT_MS, ACCUMULATE_IDLE_MS
      service*.ts      # service.ts, service-copy.ts, service-verify.ts: the copy engines
      ui*.ts           # ui.ts, ui-events.ts, ui-modal.ts
    queue-subscription-explorer/  # Priority 45 -- SEMP v1 (vpn, queue, topic) browser
    queue-discovery/   # On disk but in no variant manifest, so no bundle ships it and the kernel never installs it
    admin-login/           # /solAdmin entry point -- restores the gateway session, opens no broker connection
    user-management/       # Admin-only (/solAdmin) -- user + entitlement CRUD
    connection-management/ # Admin-only (/solAdmin) -- broker connection CRUD
    gateway-settings/      # Admin-only (/solAdmin) -- config.yaml editor, as cards; Restart gateway
    tls-certificates/      # Admin-only (/solAdmin) -- the gateway's certificate and the trusted broker CAs
    backup/                # Admin-only (/solAdmin) -- encrypted export/import and scheduled backups
  variants/
    standard.ts        # Default variant -- the everyday bundle (no admin modules)
    min.ts             # Minimal variant -- connections + queue-browser only
    no-queue-copy.ts   # Standard variant minus the Queue Copy module
    admin.ts           # The /solAdmin app -- admin-login, the two entitlement editors, gateway settings, certificates, backup
    managed.ts         # provisioned.html, served in Provisioned mode -- standard + connections' managed entry (MODULE_ENTRIES)
    managed-demo.ts    # provisioned-demo.html -- the Provisioned modules and the admin pages against the fake gateway
    all-for-testing-only.ts  # Kitchen-sink QA build -- every module a variant ships, incl. the admin ones
    _active.ts         # One-line re-export from one variant (default ./standard)
  mock-broker/         # DEMO ONLY -- entered solely via the demo-mode import redirect,
                       # so no production bundle contains it.
    boot.ts            # Installs window.solace, the fetch interceptor and the panel (boot.managed.ts: the Provisioned demo)
    fixtures.ts        # THE demo dataset + scenario enums -- single source of truth
    emitter.ts         # Synchronous FIFO emitter, as in the real SDK
    network.ts         # Blocks the network APIs the demo does not answer
    shell.ts           # The demo's shell pieces
    sdk/               # enums, session, browser, message -- the solace global
    broker/store.ts    # Queues, messages, seeding, publish routing, deletes
    server/            # fetch router: SEMP v2 + v1, /hosted (Direct only)
    gateway/           # The fake gateway of the Provisioned demo (same routes, codes and rev rule as go-web-proxy)
    controls/          # The demo scenario switcher (.mockctl-* only)
  main.ts              # Bootstrap (imports ./css/main.css and ./registry)
  registry.ts          # Resolves variant manifest -> PwaModule via virtual:module-registry (moduleRegistryPlugin)
  index.html           # App shell with <!-- @module-templates --> marker
go-web-proxy/          # The Go gateway: proxy, Provisioned store, sign-in, relay, TLS, audit (see architecture.md)
  testdata/contract/   # Contract cases both the real and the fake gateway must answer alike
tests/                 # Mirrors src/; see testing.md
  setup.ts             # Global mocks (Solace SDK, browser APIs)
  helpers/             # loadModuleDOM, resetQueueBrowserState, sources (the app source files, for scans), ...
  core/                # Kernel, EventBus, toast, utils and other core tests
  modules/             # Per-module test files
  build/               # scripts/*.mjs tests -- module-registry-plugin, check-bundles, npm-audit-gate, docs links
  mock-broker/         # The demo broker, the fake gateway and the contract cases
  integration/         # Cross-module and end-to-end tests
  variants.test.ts     # Every variant manifest resolves and keeps its shape invariants
  registry.test.ts     # Registry resolution + kernel integration
  main.test.ts         # Bootstrap
  shell-loader.test.ts # The shell's inline vendor loader
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
    sempFetch(path, opts): Promise<Response>;  // SEMP with auto-injected auth (Provisioned: the gateway relay)
    managedProfile: ManagedProfileStore;  // Provisioned names; dials targets on request
    notifications: NotificationCenter;    // The record behind the header bell
    queuePicker: QueuePicker;             // The queue picker dialog: pick(source, opts?)
    copyToClipboard(text, btn?): Promise<void>;  // Clipboard + feedback
    mountSidebarAccount(el): void;        // Place an account control at the top of the sidebar
}
```

Each module gets its own `container` (an isolated DOM subtree) and its own `loadSelf` (bound to its id). All modules share the same `appState` reference, the same `eventBus` instance and the same helper functions. The exact shape is the `AppContext` interface in `src/core/types.ts`; [architecture.md](architecture.md) shows where the kernel builds it.

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
| `rbac:changed` | void | Connections (Provisioned panel) / User Management / Admin Login -> Kernel (sidebar re-render) + any module holding entitlement-derived state |
| `rbac:sign-out-requested` | void | User Management / Connection Management -> Admin Login / Connections (Provisioned panel): end the Provisioned session (own password or administrator flag changed, own account deleted, or a `401` from the gateway) |
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

The connections module owns the **primary** connection: `installDirect` in its `module.ts` (shared by the Release entry and the Provisioned entry) defines `solaceHooks`/`sempHooks` that bridge factory events to `ctx.setState` + `eventBus.emit('client:connected'...)` + the connections form's UI updates. Other modules subscribe to those bus events as they always have. queue-copy is the secondary-connection caller: it defines different hooks that target module-scoped state instead of global state -- same factory, different bridging. When the primary connection is Provisioned its destination is the shared provisioned connection card (`src/core/components/provisioned-connection/`) and, on Connect, it asks `ctx.managedProfile.dial(target, { connect })` and creates the client inside that callback: SEMP gets the gateway's relay base (`SempConfig.relayBase`, no credential at all), and SMF gets the VPN's dialled password and socket path (`SolaceConfig.smfPath`), which go straight to the SDK and are never stored. Both Connects (the primary's and the destination's) run SEMP and messaging through `connectProvisioned` in `src/core/services/provisioned-connect.ts`: both connections or neither, each held until both are up ([architecture.md](architecture.md#provisioned-connect-sequence)).

The same shape applies to SEMP: `createServiceSemp(hooks)` and the discovery generator `createSempDiscovery(sempCtx)` (from `src/core/services/semp-discovery.ts`) which is parameterized by a `SempContext` -- a `{ fetch, baseUrl }` pair scoped to a specific broker. Build a primary SempContext via `unfilteredPrimarySempContext(ctx)` from `src/core/services/sempContext.ts` -- read its docstring before adding a consumer, because only two SEMP v2 list shapes are entitlement-filtered. For discovery, prefer `queueSourceFrom(ctx, scope)` from `src/core/services/queue-source.ts`; components take a `QueueSource` and never run their own SEMP calls.

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

// module.ts -- wiring happens at install time
const serviceEvents = createServiceEvents();
const service = createService(app, serviceEvents);
serviceEvents.wire({ disconnectBrowser: service.disconnectBrowser });
```

A browser event that arrives before step 3 throws `wire() not called before a browser event`, so a missing wiring fails at the first event instead of silently doing nothing.

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
           // Capture required DOM elements -- `required()` throws at install time
           // if the selector doesn't match, so downstream code treats results as non-null.
           const btn = required<HTMLButtonElement>(container, '#my-button');
           // Wire event listeners
           // Subscribe to EventBus events
       }
   };
   ```

   Note: priority (install order + sidebar position) is set in the variant manifest alongside the module id, not on the module itself.

   Any element the module's own template is expected to contain should go through `required()`. Elements that may or may not exist (conditionally rendered) stay on nullable `querySelector` with an `if (el)` guard. See [DOM Access](#dom-access) for the rule.

3. **Author the HTML template** at `src/modules/your-module/index.html`. The build plugin reads this file and injects it into the shell HTML as `<template data-module-id="your-module">...</template>` at the `<!-- @module-templates -->` marker. Do **not** edit module markup directly in the shell `src/index.html` -- those edits don't survive a rebuild.

4. **Activate in a variant manifest** under [src/variants/](../src/variants/). Add one line to whichever variant(s) should ship the module -- for the default build, edit `src/variants/standard.ts`:

   ```ts
   export const ACTIVE_MODULES: Record<string, number> = {
       'connections':                 100,
       'queue-browser':                80,
       'queue-copy':                   70,
       'queue-subscription-explorer':  45,
       'your-module':                  20,   // <- new line
   };
   ```

   Pick a priority that slots into the existing list (higher installs first, renders higher in the sidebar). [src/registry.ts](../src/registry.ts) resolves each id in the manifest to the `PwaModule` exported by `src/modules/<id>/module.ts` via the `virtual:module-registry` module (generated per variant by `scripts/module-registry-plugin.mjs`), so no import section needs touching and only the active variant's modules enter the bundle. To **disable** a module in a variant, comment its line. To **ship a different variant**, drop a new `src/variants/<name>.ts` and build it with `node scripts/vite-build.mjs --variant=<name> --out-filename=<name>.html` (add a matching `build:<name>` npm script, and a pass in `build`, if it should ship). To give one variant a different **entry** for a module, export `MODULE_ENTRIES = { '<id>': '<entry>' }` from the manifest and add `src/modules/<id>/module.<entry>.ts` (and optionally `index.<entry>.html`, which can pull the base `index.html` in at a `<!-- @module-base -->` marker). The connections module does this for the `managed` variant; its `module.ts` must never import the managed entry's files.

   > **Gating a module in Provisioned deployments:** a module in the `managed` variant is under module control: a signed-in user sees it only if an administrator grants it, so add its id to `moduleCatalog()` in [go-web-proxy/configfile.go](../go-web-proxy/configfile.go) (`tests/variants.test.ts` fails until you do). To keep it out of Provisioned sessions instead, add it to `MODULE_REQUIREMENTS` in [src/core/rbac.ts](../src/core/rbac.ts): `'admin'` for admin-only CRUD (like the editors, which ship only in `src/variants/admin.ts`), or `'unfiltered-semp'` for a module that reaches the broker over a path RBAC cannot filter, which hides it in **every** Provisioned session and keeps it out of the catalog. The kernel hides the sidebar entry and re-evaluates on `rbac:changed`. See [architecture.md -> Provisioned Connections](architecture.md#provisioned-connections-rbac).

5. **Nothing to import for the module's CSS.** If you added `styles.css`, the registry plugin imports it into every variant that lists the module (and no other), after the design system. Never `@import` a module stylesheet from `src/css/main.css`: it would ship in every bundle, the variants without the module included.

   **Admin list modules:** an admin CRUD list calls `renderAdminRows(tbody, shown, total, query, { plural, noun, classPrefix, cells, label, onEdit, onDelete })` from `core/components/row-list` for its rows and filter feedback, and `setError(el, msg)` from `core/dom` for banners. Do not write a local `setError` or a hand-built row and actions cell.

   **Install renders from current state; an event handler acts only on a real change of the state it depends on.** The kernel replays a held `rbac:changed` to every module after install, so a handler that refetches or re-gates on every `rbac:changed` repeats the work `install` just did. The admin modules (`user-management`, `connection-management`, `gateway-settings`, `tls-certificates`, `backup`) gate through `gateOnAdminSession(app, { onAdmin, onNoAdmin })` in `src/core/components/module-gate/`: it keeps a session key (`JSON.stringify([username, admin])`, `null` when signed out), and its `rbac:changed` handler returns early when the key equals the one last applied. The `applyGate()` it returns is unconditional: the module calls it at the end of install and after a save or Refresh, so a module that emits `rbac:changed` for others about its own change (User Management saving its own entitlements) also calls `applyGate()` itself. Test it with one case for the unchanged session (no request) and one for a real change (sign-out and in, another admin, a demotion).

6. **Write tests** in `tests/modules/your-module/module.test.ts`, mirroring the source path. Load the real template with `loadModuleDOM('your-module')` from `tests/helpers/loadModuleDOM.ts`. [testing.md](testing.md) has the conventions, the shared helpers and the coverage rules.

7. **Write the module's chapter of the manual** in `src/modules/your-module/help.html`. The build puts it into the Help tab of the About page in every variant that lists the module. [Writing the Manual](#writing-the-manual) has the rules.

---

## Writing the Manual

The manual is the Help tab of the About page. Each module owns one chapter of it, `src/modules/<id>/help.html`, and the build composes the chapters of a variant's modules into that variant's bundle ([architecture.md](architecture.md#dom-template-system)). The same files are the source of the user guide on GitHub ([The guide on GitHub](#the-guide-on-github)). When a change alters what a page shows or does, change its chapter in the same commit.

A module that has an entry (`MODULE_ENTRIES`) may add a chapter for it in `help.<entry>.html`: the file opens with the `<!-- @module-base -->` marker, where the build puts the module's base chapter, and holds the extra chapter after it. The connections module does this for the Provisioned sign-in (`help.managed.html`).

### A chapter

A chapter is one `<article class="manual-chapter">` that opens with its `<h2>` title. Write for a reader who is looking at the page: say what a thing is for, then how to use it, in short plain sentences. Name a button or a field as the page labels it, in `<strong>`.

Use only these parts. The app styles each one (`src/modules/about/styles.css`), and `chapterMarkdown` in [scripts/manual-to-md.mjs](../scripts/manual-to-md.mjs) refuses anything else by name.

| Part | Markup | Use it for |
| --- | --- | --- |
| Title | `<h2>` | The chapter's name: the page's name in the sidebar. First in the chapter, once. |
| Lead | `<p class="manual-lead">` | One or two sentences under the title: what the page is for. |
| Section | `<h3>` | A task or a part of the page. Each is listed in the manual's Contents. |
| Sub-heading | `<h4>` | A topic inside a section. |
| Paragraph | `<p>` | Running text. |
| Steps | `<ol class="manual-steps">` | What the reader does, in order. One action in each `<li>`. |
| List | `<ul>`, `<ol>` | Choices, or facts of the same kind. An item may hold a nested list or a paragraph. |
| Table | `<table>` with a heading row | Columns, fields, options: anything a reader looks up. Cells hold text and inline parts only. |
| Figure | `<figure class="manual-figure">` with an `<img>` and a `<figcaption>` | A drawing of the page. The app and the guide number it ("Figure 1"), from 1 in each chapter. |
| Legend | `<ol class="manual-callouts">` | Right after a figure: one `<li>` for each numbered disc in the drawing, in order. |
| Aside | `<aside class="manual-note">`, with `data-kind="tip"`, `"important"` or `"warning"` for those kinds | A boxed remark. Write the text only: the app and the guide add the label. Keep `warning` for what cannot be undone. |
| Code block | `<pre><code data-lang="json">` | A file's shape, or text to copy. Name the language. |
| Inline | `<strong>`, `<em>`, `<code>`, `<kbd>`, `<a href="https://...">` | A label on the page, emphasis, literal text, a key, a link. |

A link goes to an `https://` address. Link another guide by its address on GitHub (`https://github.com/SolaceLabs/solace-msg-utility/blob/main/docs/<file>.md#<anchor>`): the app opens it in a new tab, and the guide turns it into a relative link.

### Figures

A figure is an SVG file in `src/modules/<id>/help/`, named in the chapter as `<img src="help/<name>.svg" width="..." height="..." alt="...">`. The `alt` says what the drawing shows, for a reader who cannot see it.

- Draw the page as a simplified diagram, not a screenshot: the real labels, example values, and a numbered disc on each part the legend explains.
- Use presentation attributes only (`fill`, `stroke`, `font-size`). No `style` attribute, `<style>`, script, link or foreign object: the page's policy ignores or blocks them, and GitHub shows the same file.
- Give the drawing its own background, so it reads on any page, and keep the file plain ASCII.
- Keep to the look of the existing figures: the same colours, fonts and discs.

The build writes each figure into the bundle, so every picture adds to every bundle that carries its chapter. A missing file, or a figure that is not an SVG file in the module's `help/` folder, fails the build.

### The guide on GitHub

[user-guide.md](user-guide.md) is the manual as one Markdown file, and nobody edits it: [scripts/user-guide.mjs](../scripts/user-guide.mjs) writes it from the chapters. After changing a chapter, run:

```bash
npm run guide
```

and commit the guide with the chapter. `./scripts/dev.sh guide` runs the same command, and `full` starts with it, so a pre-tag sweep never tests a stale guide; the task is skipped in CI, where the committed guide is what gets tested. The guide holds every chapter once, in parts: the chapters of the `standard` variant, then what the `managed` variant adds, then those of the `admin` variant, each in the order its variant lists the modules. `GUIDE_LAYOUT` in the script holds the parts, and the introduction above the Contents list, which is the one piece of the guide written there and not in a chapter. A chapter's sections become `###` headings, so their anchors (`user-guide.md#filtering-messages`) are what other docs link to; a section title used by more than one chapter gets a numbered anchor (`#the-page-at-a-glance-3`), so link such a section by its chapter.

### What checks a chapter

- `tests/build/manual-to-md.test.ts > "the chapters of the manual"` converts every chapter, so a part outside the table fails by name.
- `tests/build/user-guide.test.ts > "is what the chapters of the manual make: after changing a chapter, run npm run guide"` fails while the committed guide differs from what the chapters make, and `> "hold every chapter file of the repo, each chapter once, whatever bundles carry it"` fails for a chapter no part of the guide takes.
- `tests/build/module-help.test.ts` composes the manual of the real variants and holds every figure file to the rules above.
- `scripts/check-bundles.mjs` proves on the built files that the manual is in every app bundle and in neither demo.

---

## Testing

Every change comes with its tests, and the tests mirror the source tree (`src/foo/bar.ts` is tested in `tests/foo/bar.test.ts`). [testing.md](testing.md) is the reference: the suites, the coverage policy (100% on all four metrics for the web code), the v8-ignore policy, the test conventions and how to run each suite. [contributing.md](contributing.md#development-workflow) has the dev-script task table. The short version:

```bash
./scripts/dev.sh all     # build vet test mock: the fast inner loop
./scripts/dev.sh cov     # coverage; the web thresholds fail the run below 100%
```

---

## Code Conventions

One set of conventions for the whole codebase. Where a rule can be checked by a tool, the tool holds it ([Linting](#linting), `tsc`); the rest a reviewer holds. Code you touch passes `./scripts/dev.sh vet` clean.

### File Organization

- One concern per file (not one class per file: there are no classes).
- Factory functions over classes. State the app shares across modules goes through `AppContext`; a module's own state stays inside the module, in a factory closure for new code. A core component that keeps state is created once per app and handed out on the context, as the queue picker is (`ctx.queuePicker`). Modules receive their dependencies through `AppContext`.
- Services: `service.ts`, `service-*.ts`. Never add a `service-*-mock.ts` sibling: the demo build runs the real services against the in-browser broker, so new demo behaviour goes in `src/mock-broker/` and is covered in `tests/mock-broker/`.
- UI: `ui.js`, `ui-*.ts`, `ui-*.js`
- State: `state.js`
- Orchestrator: `module.ts`
- Template: `index.html` (next to the code; the build plugin injects it into the shell)
- Styles: `styles.css` (module-scoped; the registry plugin imports it for every variant that lists the module, never `src/css/main.css`)
- Constants and icons: `constants.js`

### TypeScript

- Strict mode (`strict: true` in tsconfig). No `any` except to talk to the Solace SDK (`declare const solace: any` in files that use the global SDK).
- ES modules (`import` / `export`), never CommonJS.
- New files are TypeScript. The existing `.js` files stay, and `tsc` checks them (`allowJs` with `checkJs`): give a parameter a JSDoc type where it cannot be inferred.
- `tsconfig.test.json` extends the base for `tests/**` and the vite and vitest configs (`vitest/globals` and Node types): a test fixture typed as a production type breaks `vet` when the type changes, instead of running on stale fields.
- Run `npm run typecheck` and `npm run typecheck:tests` to check types. The build (Vite and esbuild) and vitest strip types **without** checking them, so `tsc` is the only thing that catches a type error. Both are part of `vet`, a separate gate from `build`, enforced in CI.

### Linting

`npm run lint` ([eslint.config.mjs](../eslint.config.mjs), run by `vet`) holds the rules a linter can see, and nothing else: type errors are `tsc`'s, and there are no style rules.

| Rule | Where | Why |
| --- | --- | --- |
| `@typescript-eslint/no-unused-vars` | `src/`, `tests/`, `scripts/`, the configs | Dead code hides intent and drifts. A leading `_` marks a parameter kept for its position. |
| `no-alert` | `src/` | `alert()`, `confirm()` and `prompt()` block the page; use the app's toast, or `confirmDialog()` from `src/core/components/confirm-dialog` for a yes/no question. |
| `no-restricted-properties`: `document.getElementById` | `src/`, except the shell (`core/kernel.ts`, `core/toast.ts`, `mock-broker/shell.ts`) | Module code reaches only its own container (see [DOM Access](#dom-access)). |
| `no-restricted-properties`: `console.*` | `src/`, except `core/logger.ts` | Logs go through `logger.withTag(<component>)`, which applies the level and the tag. `src/index.html`'s inline script is not linted. |
| `no-restricted-syntax`: `e.message \|\| fallback` | `src/` | The SDK puts the reason in `.message` or `.infoStr`; `solaceErrorText(e, fallback)` reads both (see [Error Handling](#error-handling)). |

A finding is fixed, not silenced. Where a disable must stay, an `// eslint-disable-next-line <rule> -- <reason>` comment names the rule and says why; ESLint reports a disable comment that suppresses nothing.

### DOM Access

- Scope every query to the module's `container`. Never `document.getElementById()`; use `container.querySelector()`.
- Cache element references at install time and reach them through the cache object.
- **Required elements** are everything the module owns in its own `<template>`: its buttons, inputs, modals and lists, including those held in a shared `cacheElements` or `initElements` cache. Capture them with `required()` from `src/core/dom.ts`:

  ```ts
  import { required } from '../../core/dom';
  const btnCopy = required<HTMLButtonElement>(container, '#btn-copy-config');
  btnCopy.disabled = false;  // no null-guard, no `!`
  ```

  A template is authored next to its code, so its DOM contract is known at install time. A missing element throws `Required element missing: <selector>` at install, a loud failure instead of silent partial wiring, and downstream code treats the result as non-null.
- **Optional elements** are those that may or may not exist depending on data (a `.btn-delete-row` rendered only for non-read-only queues). They stay as a nullable `container.querySelector()` with an `if (el)` guard, and a test covers the missing-element path.
- Banned on a required element: an `if (els.foo)` guard, a non-null assertion (`els.foo!`), and a `/* v8 ignore */` around a null-guard. Use `required()` instead.
- `setError(el, msg)` from `core/dom` shows `msg` in an error banner (and unhides it), or clears and hides it for a null or empty message. Import it; do not keep a local copy.

### Modals

- Use the native `<dialog>` element. Open with `dialog.showModal()`, close with `dialog.close()`. Visibility is driven by the `[open]` attribute, not a `.hidden` class.
- Wire backdrop-click-to-close with `attachBackdropClose(dialog)` from `src/core/dom.ts`: a click where `e.target === dialog` hit the backdrop; a click in a child has another target and is ignored.
- Add `aria-labelledby` pointing at the dialog's title so screen readers announce the modal's name.
- The browser handles Escape, the focus trap, top-layer rendering, and `role="dialog"` with `aria-modal="true"`.
- Tests assert on `dialog.open`, not on a class. The polyfill for `HTMLDialogElement.prototype.{showModal,show,close}` in `tests/setup.ts` stands in for what jsdom lacks, by toggling the attribute.

### CSS

Styles are split by responsibility ([architecture.md -> CSS Organization](architecture.md#css-organization) shows the layout). A rule belongs in the file whose selectors it matches:

- A selector shaped like `.browser-*`, `.detail-*`, `.filter-*` or `.searchable-*` goes in the module's `styles.css`; component-prefixed selectors (`.picker-*`, `.toast-*`) go in the component's `styles.css`.
- A selector shared across modules (generic `.btn-*`, `.modal-*`, `.badge-*`, `.form-*`) goes in `src/css/components.css`.
- A Tailwind-style atomic (`.mt-4`, `.flex-row`, `.hidden`) goes in `utilities.css`.
- **One look, one class.** Before writing a module rule, look for the primitive in `components.css`; a module's `styles.css` holds only what no other page has. Two modules that need the same rule get one shared class, not a copy each. The primitives a page is built from:
  - `.card` (it fills its column, up to 2048px), `.card-narrow` for a sign-in box, `.card-title` on every card's heading and `.card-subtitle` on the heading of a part within a card.
  - `.form-cols` for fields side by side, `.input-with-search` and `.input-search-btn` for a text box with a pick button, `.banner-warning` for a warning inside a card.
  - `.btn` with `.btn-primary`, `.btn-secondary` or `.btn-danger`; `.btn-compact` for a button beside a sub-title or under a short list.
  - `.tabs` and `.tab` (the open one is `is-active`) for a strip of tabs, `.segmented` for a choice between a few options (wired by `createSegmented`).
  - A choice between exactly two named answers can be a `.segmented` or a `.slide-choice` (a switch with an answer on either side, wired by `createSlideChoice`); the admin pages use one of the two for every such setting. Both helpers give the same `value()`, `set()`, `setDisabled()` and `onChange()`. Inside a `.form-group` the switch of a slide choice is a `span.switch`, not a `label`, so the field's label rule leaves it alone.
  - An on/off setting is a `.switch` (inside a `label.switch-field` when it has text). A tick box is for a row of a table and a radio for one choice of a few; both are styled by element, so they need no class. A `select.form-control` draws the queue picker's chevron.
  - `.data-table`, `.data-table-frame` and `.data-table-actions` (the column of a row's buttons).
- Shell chrome (anything the user sees outside a module's content area) goes in `layout.css`.
- Never `@import` a module stylesheet from `main.css`, and never reach for `!important` to beat another file's rule: if a rule needs it, the rule is in the wrong file.
- No `style` attribute, in a template or in markup built from a string, and no `setAttribute('style', ...)`: every bundle's Content-Security-Policy makes the browser ignore them. Give the element a class. Setting a property through the CSSOM (`el.style.display = 'none'`) is fine. For the same reason, no inline event handler (`onclick="..."`) and no `javascript:` URL: add a listener in code. `tests/build/no-inline-styles.test.ts` fails on any of them.

### Event Handling

- Between modules, use the typed `EventBus` only, always with the event name and the payload type from `BusEvents`.
- Within a module, use direct DOM `addEventListener`.
- Clean up listeners when disconnecting or unbinding.

### Error Handling

- Services return `{ ok: boolean; error?: string }` result objects.
- Wrap external calls (the Solace SDK, `fetch`) in try/catch.
- Show user-facing errors in dedicated error elements, never `alert()`. Read an SDK error with `solaceErrorText(e, fallback)`.
- Log developer-facing diagnostics through the tagged logger (see [Logging standard](#logging-standard)), never raw `console.*`.
- An error says what failed, why (the offending value, with secrets masked) and what to do next, and keeps its cause when it wraps one.

### Logging standard

One standard for the web app and the gateway, so a line can be read, filtered and tied to the others for the same user or request without the source at hand. A reviewer checks that each new log line follows it.

- **Levels by meaning.** `error`: something failed and needs attention (a request answered with a 5xx, a store that will not load, a run that ended in error). `warn`: a recoverable problem the code handled (a refused request, a fallback taken, a value ignored). `info`: lifecycle, state changes and audit events (start and stop, connect and disconnect, a sign-in, an administrator's change, a setting applied). `debug`: trace for a developer (each step, each message, request detail).
- **Every line names its component and what it concerns.** The component is the tag (`[Connections]`, `[Copy]`, `[queue-browser]`, `[queue-discovery]`) in the web app and the logger's attributes in the gateway; then the identifiers the event is about, as they apply: user, client, broker, VPN, queue, path.
- **Facts as attributes, not prose.** In the gateway an operation, an error code or a count is a key-value attribute (`"code", "read_only"`), and the message stays a fixed sentence, so a line filters without a regular expression. In the web app the values follow a fixed phrase, as `key=value` where there are several.
- **No secrets, at any level.** Never a password, a passphrase, a store key, a session cookie or an `Authorization` header: leave it out or mask it. A broker's address is not a secret; its credential is. One exception, deliberate and tested: on a first start with no users file and no `SMU_ADMIN_PASSWORD`, the gateway logs the bootstrap administrator's generated password once, at `warn`, because the log is the only place an operator can read it. That account must change it at its first sign-in.
- **Web app.** `const log = logger.withTag('<Component>')` from [src/core/logger.ts](../src/core/logger.ts), never `console.*`: ESLint holds it, and the inline script in `src/index.html`, which runs before any module, is the one exception. The default boot level is `INFO`; `?logLevel=DEBUG` (or `WARN`, `ERROR`, `SILENT`) overrides it.
- **Gateway.** A request's lines go through `requestLogger(base, r)` ([go-web-proxy/logging.go](../go-web-proxy/logging.go)), which carries the client, the method, the path and, once a gate has recorded one, the user. `LOG_LEVEL` sets the level, and one summary line at startup is always written whatever the level: the version, the mode and the settings in force, never a secret.

---

## Gateway and Admin How-tos

Recipes for extending the Go gateway and the admin pages. Each links the design (architecture.md) and the operator's view (provisioned-mode.md), so this guide holds only what you do.

### Adding a gateway config.yaml setting

Classify the new key as live (a field of `liveSettings`, applied by `apply`) or restart-only (`restartOnlyKeys`, a `[]string` that only the classification test reads; the only one is `hosted`). The settings API reports no restart state, so a new restart-only key needs its own documentation wherever it applies. `TestFileConfig_EveryKeyIsClassifiedOnce` in `go-web-proxy/live_test.go` fails until it is exactly one. Add the key to the table in [Writing a config.yaml by hand](#writing-a-configyaml-by-hand-development-only) too.

A location the console must never be able to change (a file path to a secret or a certificate) is not a setting at all: read it from an `SMU_` variable at every start, as `tlsPathsFromEnv` does for the three TLS paths, and keep it out of `fileConfig`, the settings API, the page and the fake.

A key that leaves the file stays in `fileConfig` as a removed key (see `fileTLS.RemovedCertFile`), so a `config.yaml` that still holds it loads, and the key is dropped at the next write. A variable that seeds a setting takes the `SMU_` prefix (only `LOG_LEVEL` keeps its bare name); never reuse a name Go or another tool reads itself, such as `SSL_CERT_FILE`.

### Writing a config.yaml by hand (development only)

Nobody who runs or uses the product writes or edits one of the gateway's files. An operator sets the variables at the first start, an administrator uses the console, and settings move between deployments through Backup & Restore. The reader-facing docs (README.md, user-guide.md, demo.md, deployment.md, provisioned-mode.md) therefore never tell a reader to open one, and neither does text the product shows: the header the gateway writes into `config.yaml`, its log and console messages, and the comments in the compose files. Keep it that way when you change them.

A developer sometimes does need a hand-written `config.yaml`: for a Go test, to reproduce a refused start, or for a local run in a state the variables cannot seed. This section is the reference for that. The sealed stores cannot be written by hand at all; their shapes are in [architecture.md -> Stored file schemas](architecture.md#stored-file-schemas).

The file is plain YAML, parsed strictly (`decodeConfigFile` in [configfile.go](../go-web-proxy/configfile.go)): `version: 1` is required, an unknown key or an empty file stops the start, and a missing key takes its built-in default (`defaultFileConfig`), never an environment value. The gateway writes the file with a comment header and a `key <- variable` table generated from `seedVars`; a hand-written file needs neither.

| Key | Default | Seeded by | Applies |
| --- | --- | --- | --- |
| `version` | none | none | Required, always `1`; the gateway stamps it on every write |
| `hosted` | `true` | `SMU_HOSTED` | At restart. Must be `true` unless `connModes` is `direct` |
| `connModes` | `direct` | `SMU_CONN_MODES` | At once. The settings API and an import refuse `direct` |
| `defaultConn` | `direct` | `SMU_DEFAULT_CONN` | At once |
| `tls.insecureSkipVerify` | `false` | `SMU_SSL_SKIP_CERT_VERIFY` | At once |
| `tls.standardRoots` | `true` | `SMU_SSL_STANDARD_ROOTS` | At once |
| `logLevel` | `warn` | `LOG_LEVEL` | At once |
| `access.allow`, `access.trustedProxies` | `[]` | none | At once, in every mode |
| `session.idleMinutes`, `session.absoluteMinutes` | `10`, `30` | none | At once. Provisioned mode only |
| `session.connectsPerMinute` | `20` (`1` to `1000`) | none | At once. Provisioned mode only |
| `login.maxFailures`, `login.backoffSeconds`, `login.maxBackoffSeconds`, `login.unauthenticatedPerMinute` | `5`, `30`, `900`, `60` | none | At once. Provisioned mode only. `maxFailures` is the per-account limit |
| `login.perClient` | `true` | none | At once. Provisioned mode only. `false` counts failures per account only |
| `login.clientMaxFailures` | `10` (`1` to `1000`) | none | At once. Provisioned mode only. The per-client limit |
| `login.resetMinutes` | `15` (`1` to `1440`) | none | At once. Provisioned mode only. A count is forgotten after this long without a failure |
| `login.passwordMinLength` | `12` (`12` to `128`) | none | At once, for the next password set. Provisioned mode only |
| `login.twoFactorMinutes` | `10` (`1` to `60`) | none | At once: a shorter value also ends sign-in tickets already issued. Provisioned mode only |
| `login.twoFactor` | `optional` | none | At the next sign-in. Provisioned mode only |
| `modules.offered`, `modules.userDefault` | every catalog module, `all` | none | At once. Provisioned mode only |
| `audit.stdout` | `false` | `SMU_SHOW_AUDIT` | At the next audited event. Provisioned mode only |
| `audit.access`, `audit.onFailure` | `false`, `continue` | none | At the next audited event. Provisioned mode only |

What each setting means to an operator is in [provisioned-mode.md -> Configure](provisioned-mode.md#configure); `toConfig` holds every range and check.

Two things follow from the file being the gateway's:

- **A hand-written file is read at start only.** While the gateway runs, the writer compares the file with what it last read or wrote before every save, so a change made behind it turns every settings save into `409 config_changed_on_disk` until a restart loads the file (see [Writing to the store](#writing-to-the-store)). A Go test passes its own path to `resolveConfig`; for a local container, put the file in the data volume before the gateway starts.
- **A setting with no variable and no console field has no supported route.** In Gateway mode that is `access.allow` and `access.trustedProxies`: the mode has no console and no variable seeds them, so the operator docs present the access list as a Provisioned-mode setting. The gateway still enforces a list it finds in the file, in every mode (`clientACL` in [access.go](../go-web-proxy/access.go)).

### Auditing an action

The gateway's audit trail (design: [architecture.md -> The audit trail](architecture.md#the-audit-trail); operator view: [provisioned-mode.md -> Audit trail](provisioned-mode.md#audit-trail)) is separate from logging: log what the program does, audit what a person did to it. Add an event when a new route changes configuration or access, or a new sign-in path appears.

- **An admin route.** Register it with `h.audited(pre, fn)` in `managed.go` instead of `h.adminOnly(...)`. `pre` names the action and target from the request (before the handler runs, so a refusal by `adminOnly` is recorded too); `fn` receives a `*auditCall` to override the action, set the target, and list `changed` (names only). Add the action constant to the `audit.go` list, its phrase to `auditPhrases` (`done` and `attempt`), and tests for one `ok` and one `refused` entry.
- **Anything else.** `e := auditFor(r, auditX)` gives actor and client; set `Target`, `Outcome` (`auditOK` or `auditRefused`), `Code` (the code the API answers), `Changed` and `Msg`, then `h.audit.record(category, e)`. Set `e.Actor` yourself where the actor is not the session user (a sign-in names the account tried). Do not nil-check `h.audit`.
- **Naming.** `noun.verb` in lower case (`user.update`, `schedule.remove`); a single word for an event with no noun (`signin`, `dial`). Categories: `auditAdmin` and `auditAuth` are always written, `auditAccess` only while `audit.access` is on, so use it for high-volume broker traffic. `msg` is a plain sentence naming actor, verb and target.
- **Names, never values.** `changed` lists parts (`password`, `grants`, `vpn prod`, a settings key such as `modules.userDefault`), never what they were set to. An entry never holds a password or hash, store or backup key, passphrase, session cookie or token, a VPN or SEMP credential, a settings value or backup content. A target that came from the requester (a path segment, a file name, a username) is cut to 64 bytes (`userKey`) so it cannot flood the line.
- **Tests.** A test that looks at the trail sets `e.api.audit` (`env.setAudit` in [managed_test.go](../go-web-proxy/managed_test.go) opens an auditor over a temp file with a fixed clock and the `auditLog` helper reads it back). Cover the entry for the new event, its refusal, and keep `TestManagedAPI_AuditNeverHoldsASecret` (`managed_test.go`, the secret sweep) passing: it submits known secrets through every audited route and fails if any appears in the file.

### Writing to the store

The gateway's store files (`users.yaml`, `connections.yaml`, `backup.yaml`, `config.yaml`) have one writer. Design: [architecture.md -> The single writer](architecture.md#the-single-writer); operator view: [provisioned-mode.md -> Stored files and recovery](provisioned-mode.md#stored-files-and-recovery).

**The rules for every write path**, for every store file and any future file or data store:

- Every write to a store file goes through `writer.Do(ctx, op)` ([writer.go](../go-web-proxy/writer.go)). No other code writes these files. The two exceptions run before a writer exists and use the same journal: the bootstrap admin on a fresh volume and the one-time seed of `config.yaml`. Saved backup files, the TLS files and the store key are outside the writer by design.
- One lock covers all store files. Do not add a second lock or a second writer for a new file; stage it in the same `Do`.
- The read path never takes the writer lock. Readers use memory, which is replaced only at publish, in one critical section. Code that must read several things as one state (a backup) does it inside `writer.snapshot`; that lock is not re-entrant, so do not call `Do` or another snapshot inside it.
- Plan on copies. The `op` returns an error before it stages anything, and live memory changes only in a function you hand to `tx.onPublish`.
- Slow and input-only work (hashing, key derivation, decoding) is done before `Do`, never while holding the lock.
- A new file lives in the data directory (the journal covers one directory), gets a `seq` and is remembered in `checksums` at load (`rememberDisk`), so the disk check covers it.

**Shape of a write.** Decode the body, do every check that needs no store state (`invalid`, `rev_required`), then:

```go
err := h.store.wr.Do(r.Context(), func(tx *txn) error {
    // re-check the caller against the current snapshot (401 or 403)
    if err := tx.check(path); err != nil { // store_changed_on_disk
        return err
    }
    // existence: errExists, errNotFound; rev: newStale(cur.Rev)
    // validate on a copy (last_admin, would_lock_out, ...), stamp seq and rev
    seal.stageDoc(tx, role, path, doc) // a document that does not encode fails the transaction
    tx.onPublish(func() { /* swap memory */ })
    tx.afterCommit(func() { /* close sockets that lost access, write the audit line */ })
    return nil
})
if code, ok := writeStoreError(w, err); ok { /* audit the refusal with code; return */ }
// sign out the users the change calls for, then answer
```

The ok audit line of a change is an after-commit hook: pass `h.committed(r, call, wrote)` to the store method (its last, optional argument) or to `tx.afterCommit`, where `wrote` names the files the commit wrote and their seq. The line is then written while the lock is held, so the lines follow the order of the commits, and with `audit.onFailure: refuse` a lost record refuses the very next change. A refusal's line is still written by the `audited` wrapper once the handler has answered. An administrator's sign-outs are not hooks: every request reads the store again, so they follow once `Do` has returned.

In practice call the store's methods (`saveUser`, `deleteConnection`, `setSchedule`, `stageImport`) rather than writing a `Do` in a handler. A test double of the writer is not needed: `newManagedEnv` and the helpers in [store_test.go](../go-web-proxy/store_test.go) (`putUser`, `putConn`, `currentUser`) and [managed_test.go](../go-web-proxy/managed_test.go) (`holdWriter`, `raced`, `withRev`) run the real one over a temp directory.

**The two kinds of write.**

- A **whole-record save** (a `PUT` or `DELETE` of a user, connection, the settings or the schedule, and an import) carries the rev the administrator read. `PUT` carries it in the JSON body, `DELETE` as `?rev=N`, an import as `basis`; rev 0 on a `PUT` creates. A missing or malformed rev is `400 rev_required`: there is no way to save without one.
- A **field-scoped change** carries no rev. Inside the lock it sets only its own fields on the current record and keeps the rest. There are four: a user's own password (`setPassword`: check the old password and hash the new one before the lock, then inside the lock confirm the stored hash is still the one you checked) and the two-factor writes `setTOTP` (same `expect` check, a `committed` hook under the lock), `useRecoveryCode` (removes one hash, reports how many are left) and `clearTOTP` (an administrator's reset; no commit and no hook when there is nothing to remove). Add another only for a field no administrator form sends back, and say so in a comment. `saveUser` copies the stored `TOTP` onto the record it writes, so a whole-record save can neither carry nor clear a field of this kind.

**The rev rule.** `seq` of a file moves by one on every commit. A record's `rev` becomes the new seq only when the record changes as the admin console sees it (what `userToOutput` or `connToOutput` returns, compared by `sameUserView` and `sameConnView`), otherwise it stays; a create and an import always stamp it. So a password-only change moves seq and not rev. Two-factor is the worked example: the console shows one bit (`twoFactor`), so the first set-up and a reset move the rev, while setting up again and a used recovery code move only seq. If you add a field to a record, decide whether the console shows it: if it does, add it to the view, to the `same...View` function and to the parity test (`TestStore_SameViewAgreesWithTheOutput`), or a change to it will not move the rev. The settings rev is the file's keyed checksum and the schedule's is `backup.yaml`'s seq, so neither needs this.

**Error codes, and how a handler maps them.** A transaction returns typed errors; the handler hands them to `writeStoreError`, which answers the ones below and returns the audit code, and keeps its own mapping (`storeFailed`, `backupFailed`) for the rest.

| Status | `error` | When |
| --- | --- | --- |
| 400 | `rev_required` | no rev, a rev that is not a whole number, a `DELETE` without `?rev=` or with 0, an import without `basis` |
| 404 | `not_found` | rev above 0 and the record is gone |
| 409 | `exists` | rev 0 and the name exists (a schedule is already set) |
| 409 | `stale` | the rev is not the current one; the body carries the current `rev` (or `basis` for an import) |
| 409 | `store_changed_on_disk`, `config_changed_on_disk` | a store file or `config.yaml` changed outside the gateway; sticky until restart |
| 500 | `store_write_failed` | the write failed and was rolled back; nothing changed. The answer and the audit entry carry this code, not `server_error` |
| 503 | `audit_unavailable` | `audit.onFailure` is `refuse` and the audit log cannot be written |

`last_admin`, `would_lock_out`, `invalid`, `forbidden` and `unauthenticated` keep their meaning. A new error that a transaction can return gets a type in `writer.go` and one case in `classifyStoreError`, so every handler answers it alike; do not map it in one handler only. Order of checks: input without store state, the lock, the audit gate, the caller, the disk, existence, the rev, cross-record rules, the commit. The fake gateway ([src/mock-broker/gateway/](../src/mock-broker/gateway)) must keep the same order and the same codes, and the contract cases ([go-web-proxy/testdata/contract/](../go-web-proxy/testdata/contract)) hold both to it.

**The browser side.** A module keeps the `rev` from its load and sends it on save and delete (0 on Add). A `409 stale` or `404 not_found` goes to `handleConflict` in [src/core/admin-conflict.ts](../src/core/admin-conflict.ts), which shows "changed by someone else" with a Reload button, or says the record was deleted by someone else, and reloads. A stale import clears the preview and asks for a new one. Add a module's own message only for a case that function does not cover (the schedule's `exists`).

**Tests.** Every refusal above, on every endpoint it applies to, with the files, seq and memory unchanged afterwards; a race test (the `test` task runs with `-race` where gcc is available) for a new write path: two saves of one record, a delete against a save, an import against a save; and a crash test through the journal's hooks for anything that changes the commit steps. Test cross-references use the file and test name.

### Adding a sign-in step

Two-factor sign-in is the pattern to copy (design: [architecture.md -> Two-factor sign-in](architecture.md#two-factor-sign-in); operator view: [provisioned-mode.md -> Two-factor sign-in](provisioned-mode.md#two-factor-sign-in)).

- **No session until the last step passes.** A half-finished sign-in is a ticket (`session.go`, cookie `__Host-smu-signin`), never a session in a new state. Do not teach the gate, the relay or `/managed/*` about it; a ticket opens only its own pages. Give the ticket a stage, and let `need` in `totp.go` (and `twoFactorNeed` in the fake's `authenticator.ts`) say when a step is due, so both gateways answer by one rule.
- **Count wrong answers.** Every step that checks a secret goes through the sign-in throttle (`takeTurn`), and a refusal writes its audit entry with a code (`bad_code`). A replayable proof (a code) is recorded under the same lock as its check (`totpGuard.check`), never after.
- **Write through the writer.** A step that stores something is a field-scoped write (`setTOTP`): the proof it relied on is re-checked inside the lock (`expect`), and the session and the audit line are created in its `committed` hook, so the session cannot exist without the change.
- **Keep secrets out of everything you write down.** The secret, recovery codes and typed codes are never in a log line, an audit entry, an error or a test name. Tests assert it with a sweep, as `TestManagedAPI_AuditNeverHoldsASecret` does for the admin routes.
- **Stable hooks for tests and the e2e.** The form field names (`code`, `password`, `step`, `next`) and the ids `two-factor-secret`, `recovery-codes` and `two-factor-continue` are the same in `pages/login.html` and in the fake's `pages.ts`. Change one and the other, and `scripts/e2e.mjs` reads them.
- **Mirror it in the fake and the Demo controls.** The fake follows the real pages' statuses, texts (where the two differ, the real gateway wins and the difference is listed in [demo.md](demo.md#how-it-differs-from-a-real-gateway)), ids and rev rule, and the Authenticator section of the panel shows the mock codes. The contract cases cover the JSON API, not the sign-in pages; each gateway's own tests and the e2e cover the pages and the enrolled paths.

### Changing the TLS files

The gateway's certificate and trusted CAs are live ([architecture.md -> Live TLS and restart](architecture.md#live-tls-and-restart); operator view: [provisioned-mode.md -> Certificates from the console](provisioned-mode.md#certificates-from-the-console)). When you extend them:

- **Take the current value from a holder, never from `config`.** A new outbound TLS user takes `trustHolder.get()` when it connects, or uses `newUpstreamTransport(trust)`; a new listener takes `certHolder.getCertificate`. A value copied at start would miss the next console change.
- **A new write goes through `tlsManager`.** Verify before the lock and before the read-only test (a refusal is `*tlsInvalidError{Field, Reason}`, `422 invalid`, and must hold no key text), take the manager's mutex, write through the journal or a temp file and a rename, then swap the holder. Return `errTLSReadOnly`, `errTLSExists`, `errTLSNotFound` or a `*tlsWriteError` and let `writeTLSFailure` in `tls_api.go` map them. A new code needs a message in `MESSAGES` in `src/core/services/managed-api.ts` and a line in `go-web-proxy/testdata/contract/error-codes.json` (`go test -run TestContract_ErrorCodes -update .` rewrites the file from the source). Seams for disk faults (`tlsManager.seams`, the journal's) are what the tests inject; do not add a failure branch no test can reach.
- **Register the route with `adminOnly`, and audit a write.** The handler writes the ok line itself once the write happened (`recordOK`, with `auditCall.detail` for the bracketed text), so the line follows the change and names the subject, expiry or file, never the key. A write to the private key's text is the one thing to keep out of every log, error, audit entry and test name.
- **The restart hook is a seam.** `process.restart` is `restartInPlace` in `main`, a counter in tests, which assert the audit line, the `202`, the shutdown and the call without exec'ing. A test of the exec itself replaces `execProgram` in `restart_unix_test.go`.
- **The fake follows.** Answer the same route with the same status and code in `src/mock-broker/gateway/tls.ts`, add a switch to `GatewayFaults` if the real one has a fault the demo should show, and list any code the fake cannot raise under `NOT_SIMULATED` in `tests/mock-broker/gateway/error-codes.test.ts`. The contract cases in `go-web-proxy/testdata/contract/` hold what both must answer alike.

### Laying out an admin page

- **Every section is its own `.card`.** Cards stack at the full width of the page and are never side by side; give the card a heading with `.card-title`, and the heading of a part within it `.card-subtitle`. The card needs no class of the module's own. A view that holds several cards is a plain wrapper, not a card itself.
- **Fields that belong together share a row with `.form-cols`** (in `src/css/components.css`: a grid of `repeat(auto-fit, minmax(180px, 1fr))` columns): numbers, selects, a username and a password, a passphrase and its confirmation. Each `.form-group` in it is three rows of that grid (label, control, one line under it), so the controls of a row sit level whatever its labels and hints take; a field there holds no more than those three. Lists and tables keep the full width.
- **An on/off setting is a switch on a line of its own**, outside `.form-cols`: `<label class="switch-field"><span class="switch"><input type="checkbox" id="..."><span class="switch-slider"></span></span> Text</label>`. The input keeps the state, so code and tests read `checked` as before.
- **A choice from a short fixed list is tiles or pills, not a column of checkboxes.** Gateway Settings' offered modules are `button.gw-set-tile[aria-pressed]` (one per catalog module, with a name and a line of description; an unknown module falls back to its name alone). A user's own modules are pills (`span.user-mgmt-pill[data-module]`, a remove button each) with a **+ Add module** menu of the offered ones not yet chosen; a module that is not offered stays as a pill marked *not offered* so it can be removed. Under the deployment default the pills show what the default gives, without remove buttons.
- **A list of rows has a bar above it and no spacing class of its own.** The bar is a `.row-list-bar` holding the list's title (`.row-list-title`, bold) and its buttons right after it, each a `.btn.btn-compact`. `createRowList` makes the container a `.row-list`, which sets the space between the column labels and the rows, so the container gets no `flex-col` or margin class.
- **A card's opening paragraph carries `mb-3`**, so the first control under it does not touch it.
- **A module-owned element comes from `required()`**, as everywhere (see [DOM Access](#dom-access)); tests build the DOM with `loadModuleDOM`.
