# RBAC Variant — Backend-Proxied, Capability-Driven Harness

## Context

Today this app is a **pure client-side browser tool**: the user types their own Solace
(SMF) + SEMP credentials into the `connections` module, and the browser connects
*directly* to the broker — solclient.js over WebSocket for messaging, `fetch` for SEMP.
There is no backend, no users, no roles. The only thing resembling permissions is the
*reactive* access-type detection in queue-copy (`normalizeAccessType` →
`no-access`/`read-only`/`read-write`, which gates the Move button).

We want a **variation for users who do not have broker credentials**. Per the decisions
made while planning:

- A **backend proxy** (separate repo) holds the real broker credentials, authenticates
  RBAC users (backend-managed local accounts first; pluggable for SSO/OAuth/OIDC later),
  and **enforces RBAC server-side**. The browser never holds broker credentials.
- **Both channels are proxied through the backend**: SEMP (REST, bearer token) and —
  critically — **SMF messaging is *fully* proxied** (browse/publish/delete happen on the
  backend via its own Solace connection; the browser does **not** use solclient.js in this
  variant).
- The browser renders **GUI guardrails** (hidden modules/buttons, read-only vs read-write,
  filtered discovery) driven by a **capability set** the backend returns. Server is the
  source of truth; client gating is UX only.
- The RBAC system is "built **on top of** the core app as an additional module/harness."
  **All new code lives in a separate git repo.** This repo (the core) only receives
  **explicit, minimal, additive extension seams** so the external repo can layer on
  without forking.

**Intended outcome:** this repo becomes an extensible *core* with clean seams; a separate
repo ships the `rbac` variant + gateway module + proxy service implementations + backend,
and the existing `full`/`min` variants behave exactly as they do today.

### Topology decision (Shape 1 — core stays pristine)

We keep the core a **standalone browser SPA** so the existing zero-backend, single-HTML
browser tool (`full`/`min`) keeps shipping unchanged; RBAC is layered as an **external
submodule repo + a separate Node proxy backend**. We explicitly rejected converging into a
full-stack Node monorepo (Shape 2): a Node server is required either way, but folding it
into core would dilute the no-server, single-file property that makes the browser tool
valuable, and forking the whole app would permanently duplicate the (UI-heavy) frontend.

**Why Node/TS for the backend is now confirmed (not "Node or Go"):** Solace's
`solclientjs` is **one isomorphic package** — the same `SolclientFactory` / `Session` /
`QueueBrowser` / publisher object model runs in the browser *and* in Node.js; only the
load mechanism (`require('solclientjs')` vs. browser script/Webpack) and transport
environment differ. That means the backend's messaging layer can **reuse the existing
browse/publish/delete/verify logic almost verbatim** from `queue-browser/service.ts`,
`solace-publisher.ts`, and the QueueBrowser-accumulate path in `service-verify.ts`, plus
share TS types / SEMP parsing / `normalizeAccessType` across both halves. In the RBAC
variant the **browser's `solclientjs` is removed entirely** (replaced by proxy calls); the
Node `solclientjs` lives only on the server.
Refs: <https://docs.solace.com/Solace-PubSub-Messaging-APIs/NodeJS-API/node-js-home.htm>,
<https://www.npmjs.com/package/solclientjs>,
<https://docs.solace.com/API/API-Developer-Guide/Browsing-Guaranteed-Mess.htm>

---

## Architecture

```text
 ┌─────────────── EXTERNAL REPO ───────────────┐        ┌──────────── EXTERNAL REPO ────────────┐
 │ Browser: rbac variant (consumes core as     │        │ Backend proxy (Node/TS)               │
 │ submodule)                                   │        │  - auth (local accounts → SSO later)  │
 │  • gateway module (login, holds token+caps)  │  HTTP  │  - holds real broker creds            │
 │  • semp-client-proxy   ── bearer token ──────┼───────▶│  - RBAC enforcement (server of truth) │
 │  • messaging-transport-proxy ── WS/SSE ──────┼───────▶│  - SEMP proxy  /semp/*                │
 │  • CapabilityProvider (from /auth/capabilities)│      │  - Messaging proxy /msg/* (own Solace │
 └──────────────────────────────────────────────┘        │    connection: browse/publish/delete) │
            ▲ builds on                                   └───────────────────────────────────────┘
            │ submodule + createCoreViteConfig()
 ┌──────────┴─────────────── THIS REPO (core) ───────────────┐
 │ + MessagingTransport interface + SDK adapter (default)    │
 │ + SempTransport interface + Basic-auth impl (default)     │
 │ + CapabilityProvider interface + allow-all default        │
 │ + config-driven Vite plugins (extra module/variant roots, │
 │   injectable redirect map, virtual module registry)       │
 └────────────────────────────────────────────────────────────┘
```

The whole design rides on **three pluggability axes this repo already has**: pure
factory+hooks services, build-time resolve redirects (`serviceMockRedirect`/`MOCK_REDIRECTS`),
and the path-only `SempContext.fetch(path, opts)` contract. We extend those rather than
invent new mechanisms. The default for every new seam is **the current behavior**, so
`full`/`min` stay green.

---

## Changes to THIS repo (explicit — new impls live in the external repo)

Tagged **ADDITIVE** (no behavior change) or **REFACTOR** (touches existing code/tests).

### Phase 0 — Config & type plumbing (ADDITIVE) — prerequisite for all

- **`src/core/types.ts`**
  - Add `AppContext.capabilities: CapabilityProvider` (defaulted by the kernel → allow-all).
  - Add bus event `messaging:transport-ready: { transport: MessagingTransport }`
    (symmetric with the existing `client:connected: { session }`).
- **`src/core/capabilities/types.ts`** (new) — extensible permission model:
  ```ts
  export type Operation = 'browse'|'publish'|'delete'|'move'|string;
  export interface ResourceRef { kind: 'vpn'|'queue'|'module'|'tool'|string; vpn?: string; name?: string; }
  export interface CapabilityQuery { operation: Operation; resource: ResourceRef; factors?: Record<string, unknown>; }
  export interface CapabilityDecision { allowed: boolean; reason?: string; visibility?: 'visible'|'hidden'|'disabled'; }
  export interface CapabilityProvider {
    can(q: CapabilityQuery): CapabilityDecision;
    isModuleVisible(moduleId: string): boolean;
    refresh?(): Promise<void>;
  }
  ```
  The `factors` bag + open string unions are the fine-grained extensibility hook.
- **`src/core/capabilities/allow-all.ts`** (new) — `createAllowAllProvider()` returns
  `{ allowed:true, visibility:'visible' }` and `isModuleVisible → true`.
- **`src/core/kernel.ts`** — construct
  `this.capabilities = window.APP_CONFIG.capabilityProvider ?? createAllowAllProvider()`
  and thread it into the `AppContext` literal (the `appContext` object at
  [kernel.ts:152-161](../src/core/kernel.ts#L152-L161)). Likewise read
  `window.APP_CONFIG.sempTransportFactory` (see Phase 1). Reuses the existing
  `window.APP_CONFIG` read at [kernel.ts:26](../src/core/kernel.ts#L26).

### Phase 1 — SEMP transport / auth seam (REFACTOR, low risk)

The codebase already routes all SEMP through path-only `SempContext.fetch` / `ctx.sempFetch`,
so we make **auth + URL assembly** pluggable and keep Basic-auth as the default.

- **`src/core/services/semp-transport.ts`** (new) — `interface SempTransport { fetch(path, opts?): Promise<Response>; onUnauthorized?(): void }`
  and `createBasicAuthSempTransport(getCreds)` holding the current
  `btoa(user:pass)` + `buildBrokerUrl()` logic lifted verbatim from
  [kernel.ts:252-282](../src/core/kernel.ts#L252-L282).
- **`src/core/kernel.ts`** — `sempFetch` becomes a thin delegate to
  `this.sempTransport.fetch(...)`; the **401-clears-connection** wrapper stays in the kernel
  (identical for both auth modes). `this.sempTransport` defaults to the Basic-auth impl over
  `() => this.state.sempCredentials`; RBAC overrides via `window.APP_CONFIG.sempTransportFactory`.
- **`src/core/services/semp-client.ts`** — extract the `authHeader` construction into a
  passed-in `buildAuthHeader(cfg, pass)` defaulting to Basic, so an RBAC SEMP client can
  build a **bearer** `SempContext` after login. `createSempDiscovery` + the SEMP-v1 verify
  parser consume the verbatim body unchanged.

### Phase 2 — Messaging (SMF) transport seam (REFACTOR — largest test surface)

Decouple modules from the raw solclient.js `session`. Adapter now, incremental refactor.
The *server* side of this is cheap: because `solclientjs` is isomorphic, the backend's
`messaging-transport-proxy` reuses this same browse/publish/delete logic in Node almost
verbatim. The real work here is **browser-side** — the `MessagingTransport` interface and
the SDK adapter that lets the default variant stay byte-for-byte equivalent.

- **`src/core/services/messaging-transport.ts`** (new) — the interface both paths implement:
  ```ts
  export interface BrowseMessage { id: string; destination: string|null; sizeBytes: number|null; raw: unknown; }
  export interface MessagingTransport {
    browseQueue(queue: string, cb: { onMessage; onUp?({accessType}); onError?({infoStr}); onDown? }): { stop(): void };
    publishMessage(src: BrowseMessage, dest: {type:'queue'|'topic';name:string}, opts?): Promise<SendResult>;
    deleteMessage(queue: string, msgId: string): Promise<{ ok: boolean; error?: string }>;
    dispose(reason?: string): void;
  }
  ```
  `raw` is the compatibility lever: the SDK adapter stores the raw SDK message there so
  `createSolacePublisher`'s clone path keeps working; the proxy adapter sets `raw:null` and
  does its own REST publish/delete.
- **`src/core/services/messaging-transport-sdk.ts`** (new) —
  `createSolaceSdkMessagingTransport(session)` absorbs the SDK-specific code currently
  inlined (and duplicated) across:
  - `browseQueue` ← `session.createQueueBrowser(...)` wiring in
    [queue-browser/service.ts](../src/modules/queue-browser/service.ts) **and** the duplicate
    accumulate path in [queue-copy/service-verify.ts](../src/modules/queue-copy/service-verify.ts).
    The `_messageConsumer._permissions` sniff → `onUp({ accessType })` via `normalizeAccessType`.
  - `publishMessage` ← delegates to `createSolacePublisher(session).send(...)`.
  - `deleteMessage` ← the `removeMessageFromQueue` logic, one id per call.
  - plus a `-mock` sibling replacing the three current queue-related mock redirects with one.
- **`src/modules/queue-browser/service.ts`** (REFACTOR) — browse/forward/delete call
  `transport.*`; the `client:connected`/new `messaging:transport-ready` handler obtains the
  transport instead of the raw session.
- **`src/modules/queue-copy/service-verify.ts` + `module.ts`** (REFACTOR) — the
  QueueBrowser-accumulate verify path and the dest publisher go through `MessagingTransport`.
  The SEMP-v1 RPC verify path (uses `sempCtx.fetch`) is untouched.
- **Delivery:** the connection-owning module emits `messaging:transport-ready { transport }`.
  Default variant: `connections` emits the SDK adapter wrapped around the session it already
  creates. RBAC variant: `gateway` emits the proxy transport.

### Phase 3 — External module/variant/build discovery (REFACTOR, additive behavior)

`registry.ts`'s `import.meta.glob` and the Vite plugins are rooted in this repo. Make them
config-driven so the external repo (consuming this repo as a **git submodule**) contributes
modules/variants/redirects without editing core.

- **`vite.config.ts`** — export `createCoreViteConfig(opts)` + the plugin factories
  (default export stays for this repo's own builds). Add options:
  - `moduleRegistryPlugin(roots[])` emitting a `virtual:module-registry` module; change
    `registry.ts` from `import.meta.glob(...)` to `import { moduleFiles } from 'virtual:module-registry'`
    (the glob literal can't take a runtime root; the virtual module can scan N roots).
  - `variantRedirect` gains `extraVariantDirs`; `injectModuleTemplates` gains
    `extraModuleDirs`; `serviceMockRedirect` takes an injectable `redirects` map (default =
    `MOCK_REDIRECTS`) so the external repo registers an `rbac` build mode that swaps
    `messaging-transport-sdk → messaging-transport-proxy` and `semp-client → semp-client-proxy`.

### Phase 4 — Capability guardrail rendering (REFACTOR, opt-in; no-op under allow-all)

- **`src/core/kernel.ts`** — `renderSidebar` + first-module activation filter
  `capabilities.isModuleVisible(id)` (hidden-modules guardrail).
- **`src/core/capabilities/dom.ts`** (new) — `applyCapabilityVisibility(el, decision)` to
  hide/disable buttons (delete/publish), mirroring the existing queue-copy banner pattern.
- **`src/modules/queue-copy`** — generalize the Start-gate to also consult
  `ctx.capabilities.can({operation:'move'|'publish', resource:{kind:'queue', vpn, name}})`,
  keeping the broker-derived `accessType` checks as a second guardrail.

> Everything in Phases 0/4 degrades gracefully: with the allow-all provider (default
> variant), no module's behavior changes.

---

## External repo (no core changes — validates the seams)

- **Gateway module** (replaces `connections`, priority 100): login to backend → store
  token + capability set in memory only (matches the repo's "never persist passwords"
  posture). Populate AppState with **proxy-shaped** values so unchanged modules keep working:
  `isConnected:true`, `selectedVpn`, `solaceConnection`/`sempCredentials` with `baseUrl =`
  proxy, `user = rbac-username`, `pass:''`. Emit the same events downstream modules key off:
  `client:connected` (placeholder session) **+** `messaging:transport-ready { proxyTransport }`,
  and `semp:connected`. Logout mirrors the connections disconnect path.
- **`semp-client-proxy` / `messaging-transport-proxy`**: implement the core interfaces against
  the backend endpoints below.
- **`CapabilityProvider`** built from `/auth/capabilities` JSON.

### Backend API contract (stack-agnostic)

- **Auth:** `POST /auth/login {username,password}` → `{token,tokenType:"Bearer",expiresAt,user}` / `401`;
  `POST /auth/logout`; `GET /auth/capabilities` (Bearer) → capability JSON. SSO/OIDC later
  returns the same token shape via auth-code callback.
- **Capability JSON** (drives `CapabilityProvider`; most-specific rule wins; glob on queue names):
  ```jsonc
  { "version":1,
    "modules": { "queue-browser": true, "queue-copy": false },
    "defaults": { "browse":"deny","publish":"deny","delete":"deny","move":"deny" },
    "rules": [
      { "operation":"browse", "vpn":"prod", "queue":"*",        "effect":"allow" },
      { "operation":"delete", "vpn":"prod", "queue":"orders.*", "effect":"deny", "reason":"Deletes disabled on prod" }
    ] }
  ```
- **SEMP proxy:** `ALL /semp/*` (Bearer) → backend forwards to broker SEMP with real Basic
  creds, enforces RBAC, **filters discovery lists**, returns SEMP v2 JSON / v1 XML verbatim.
- **Messaging proxy:** `GET /msg/browse?vpn&queue` → WS/SSE stream of normalized
  `BrowseMessage` frames (+ close frame with `{accessType,infoStr}`); `POST /msg/publish` →
  `{ok,error?}` after broker ACK; `DELETE /msg/message` → `{ok,error?}`.
- **Backend stack:** **Node/TypeScript (confirmed).** `solclientjs` is isomorphic, so the
  backend reuses the existing browse/publish/delete/verify logic and shares TS types / SEMP
  parsing / `normalizeAccessType` with the frontend. (The contract above is still
  language-neutral, but Node/TS is the chosen stack — Go is no longer under consideration.)

---

## Critical files in THIS repo

- [src/core/kernel.ts](../src/core/kernel.ts) — `sempFetch` → `SempTransport`; capability
  default + AppContext assembly; sidebar visibility filter.
- [src/core/types.ts](../src/core/types.ts) — `AppContext.capabilities`; `messaging:transport-ready` event.
- [src/core/services/semp-client.ts](../src/core/services/semp-client.ts) — pluggable auth header.
- [src/modules/queue-browser/service.ts](../src/modules/queue-browser/service.ts) — browse/forward/delete → `MessagingTransport`.
- [src/modules/queue-copy/service-verify.ts](../src/modules/queue-copy/service-verify.ts) — accumulate verify → `MessagingTransport`; access-type sniff.
- [vite.config.ts](../vite.config.ts) — `createCoreViteConfig`, configurable redirects/roots, virtual module registry.

New core dirs: `src/core/capabilities/`, `src/core/services/messaging-transport*.ts`,
`src/core/services/semp-transport.ts`.

---

## Test & documentation impact (per CLAUDE.md 100% policy)

- Phases 1–2 **relocate SDK-callback code** into adapters — **move the event-driving tests
  in the same change** (e.g. queue-browser `service-events` tests → new
  `tests/core/services/messaging-transport-sdk.test.ts`) or coverage drops below 100%.
- Making `AppContext.capabilities` non-optional touches **every inline `AppContext` literal
  in `tests/**`** — audit and add the allow-all default (launch an Explore agent for the sweep).
- The `virtual:module-registry` change requires mocking that module in `tests/variants.test.ts`
  and the registry tests.
- New tests: `tests/core/capabilities/{allow-all,dom}.test.ts`, `tests/core/services/semp-transport.test.ts`.
- Docs: `docs/architecture.md` (transport abstractions, capability/trust model, "AppState
  contract a connection-owning module must satisfy"), `docs/contributing.md`,
  `docs/developer-guide.md` (external-repo integration guide), `docs/test-report.md` (new
  build mode + moved tests). Add the closed items to `docs/improvement-plan.md` ledger if tracked there.

---

## Phasing (dependency order — each phase ships independently, default variant stays green)

0. Config/type plumbing (ADDITIVE) — prerequisite.
1. SEMP transport seam (REFACTOR, low risk) — unblocks RBAC SEMP proxy.
2. Messaging transport seam (REFACTOR) — the "browser stops touching solclient.js" enabler.
3. Build/discovery seams (REFACTOR, additive) — the "external repo builds without forking" enabler.
4. Capability guardrails (REFACTOR, opt-in).
5. External repo: gateway module + proxy services + backend (no core changes) — end-to-end validation.

---

## Verification

- **Per phase, default variant unchanged:** `npm run test:coverage` stays at 100%;
  `npm run build` emits both bundles; manually exercise the `full` variant (connect to a
  broker, browse/forward/delete, queue-copy) to confirm the SDK adapter path is byte-for-byte
  equivalent. `npm run build:mock` still works (mock redirects intact).
- **Seam unit tests:** Basic `SempTransport` (header, URL assembly, 401-clear); SDK
  `MessagingTransport` event-driving; allow-all provider; sidebar visibility filtering with a
  stub provider.
- **External-repo integration (smoke):** build the `rbac` variant via
  `createCoreViteConfig({extraModuleDirs, extraVariantDirs, redirects})`; with a stub backend
  (returns a fixed capability JSON, an SSE browse stream, publish/delete `{ok:true}`):
  log in → modules hidden per `modules` map → browse streams via `/msg/browse` → delete button
  disabled where capability denies → SEMP discovery lists come from `/semp/*`. Confirm the
  browser bundle contains **no solclient.js** in the rbac variant.
