# Architecture

## System Overview

```text
+------------------------------------------------------------------+
|                        Browser (Single Page)                      |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |                         Kernel                               | |
|  |  - Module lifecycle (install, navigate)                      | |
|  |  - Global state (AppState)                                   | |
|  |  - Sidebar navigation                                        | |
|  |  - SEMP auth injection                                       | |
|  |  - Clipboard helper                                          | |
|  +---------------------------+----------------------------------+ |
|                              |                                    |
|  +---------------------------v----------------------------------+ |
|  |                    Typed EventBus                             | |
|  |  on(event, handler)  emit(event, payload)  off(event, handler)| |
|  +---+------------------+-------------------+-------------------+ |
|      |                  |                   |                     |
|  +---+-------+   +----------+-----+   +--------+---+   +------+-----------+ |
|  |Connections|   | Queue Browser |   | Queue Copy |   | Queue Subscription| |
|  |  P=100    |   |    P=80       |   |   P=70     |   |  Explorer  P=45   | |
|  +-----+-----+   +-------+-------+   +------+-----+   +------+------------+ |
|        |                 |                  |                |               |
|        v                 v                  v                v               |
|  +---------------------------------------------------------------+|
|  |               src/core/ (libraries — imported, not navigated) ||
|  |                                                                ||
|  |  services/        connections/      components/                ||
|  |  - solace-client  - types          - queue-picker              ||
|  |  - solace-publisher  - defaults                                ||
|  |  - semp-client                                                 ||
|  |  - semp-discovery                                              ||
|  |  - sempContext                                                 ||
|  +---------------------------------------------------------------+|
|                                                                   |
+------------------------------------------------------------------+
        |                    |
        v                    v
  +-----------+      +-------------+
  |  Solace   |      |  SEMP API   |
  |  Broker   |      |  (REST)     |
  |  (WS/WSS) |      |  (HTTP/S)   |
  +-----------+      +-------------+
```

The broker-side service factories live in `src/core/services/` as **pure libraries** — they take lifecycle hooks (no AppContext, no UI, no global bus). The connections module (priority 100) is the *primary specialist*: its `module.ts` defines `solaceHooks` / `sempHooks` that bridge factory lifecycle events to global AppState + bus events that other modules consume. This pattern lets a future module (queue-copy) own a *secondary* connection by passing different hooks to the same factories — module symmetry, no cross-module imports.

### Publishing pipeline (`solace-publisher`)

`src/core/services/solace-publisher.ts` is the single home for the "clone an SDK message + force PERSISTENT delivery + stamp a `{ Solace_Msg_Utility_Seq_Num, Original_Msg_ID }` correlation key + send + await ACK/REJECT with a 30-s timeout" pipeline. The factory `createSolacePublisher(session, opts?)` returns `{ send(orig, dest, opts?), rejectAllPending(reason), dispose(reason?), isPending(key) }`. `send()` resolves with `{ ok: true } | { ok: false; error }` (never rejects) and also accepts optional `onAck` / `onReject` / `onTimeout` callbacks for fire-many-then-update-on-resolution patterns. ACK/REJECT listeners attach on construction; `dispose()` detaches them and resolves any in-flight publishes with the supplied reason — used by callers to surface user-friendly errors like `'Client disconnected.'` end-to-end without writing per-module sweep code.

Two callers today:

- **queue-browser** owns its publisher inside `service.ts`, lifecycle-managed via `client:connected` / `client:disconnected`. `forwardMessage` returns the publisher's `Promise<SendResult>`; `handleForwardSend` fires all sends concurrently and updates UI status from `.then` / `.catch`. `hasInFlightForward` delegates to `publisher.isPending` so the forward modal still detects UUID collisions across modal sessions.
- **queue-copy** stores `state.destPublisher` and `state.primaryPublisher` (one per Solace session), created in the corresponding hooks/bus subscribers. `service-copy.ts runCopyJob` picks `state.destPublisher ?? state.primaryPublisher` and awaits each `send()` sequentially.

Two publishers can coexist on the same session (e.g. queue-copy's sameVpn case, where the primary session also hosts the secondary publisher) — each maintains its own pending-key map, and the listener pair only resolves entries it owns. The publisher knows nothing about AppContext, bus events, or modules; modules know nothing about ACK correlation, timer management, or the property-copy chain. This is the same module-symmetry split as solace-client / semp-client.

### Hosted mode (gateway tunnelling)

The PWA can run standalone (talking directly to brokers) OR behind the Go gateway in `go-web-proxy/`, which serves the same bundle and also reverse-proxies SEMP HTTP and Solace WebSocket traffic. In the gateway deployment, the broker is internal and unreachable from the browser; every broker URL must be tunnelled through the gateway's path scheme `{pageOrigin}/{scheme}/{port}/{host}{urlPath}`, where `scheme ∈ { http, https, ws, wss }`.

The connections module probes the gateway-only `/hosted` endpoint at the very start of its `install(app)`. A 200 response carrying JSON `{hosted, connModes, defaultConn}` flips the singleton in `src/core/hosted.ts` **and** resolves the deployment's connection modes (see [Connection modes](#connection-modes)); a gateway older than that contract answers with the plaintext `'true'`, which is still accepted and means *hosted, Direct only*. Any other outcome (404 from a standalone deployment, unrecognised body, network error) leaves hosted mode off and the app Direct-only. The probe is awaited before any service factory is created so a Connect click can't race the flag.

`buildBrokerUrl(scheme, host, port, urlPath, isWebSocket)` in `src/core/hosted.ts` is the single rewrite point. In direct mode it returns the original `${scheme}://${host}:${port}${urlPath}` shape; in hosted mode it returns `${wireScheme}://${pageHost}/${scheme}/${port}/${host}${urlPath}`, with `wireScheme` upgraded to `wss`/`ws` for WebSocket (matching the page's https/http) and `https`/`http` for plain HTTP. Both `solace-client` and `semp-client` route through this builder, so every downstream URL (SEMP v2 fetches, SEMP v1 RPC via `deriveSempV1Url`, the queue-discovery paged fetches, queue-subscription-explorer's RPC POSTs, the queue-picker's caches) inherits the rewrite transparently — they all append paths onto the captured `sempCtx.baseUrl`.

Two related details:

- `deriveSempV1Url` strips path/query/fragment in direct mode (SEMP v1 lives at the broker root `/SEMP`, regardless of any user-supplied urlPath on v2) but preserves the gateway proxy prefix in hosted mode so the v1 POST still routes via the gateway.
- The wss TLS handshake probe in `solace-client.ts` is skipped in hosted mode. The browser only sees the gateway's TLS endpoint (already trusted by the PWA load); probing the internal broker would be wrong. Same reasoning suppresses the "click to trust this URL" help link in connection-error toasts.

`AppState.sempCredentials` carries the user-typed `protocol/host/port/urlPath` alongside the rewritten `baseUrl`, so UI code (queue-copy source/dest readout, modal summary) displays the broker the user reached for — not the gateway-prefixed wire URL.

---

## Module Isolation

Modules have **zero cross-module imports**. Each module is a self-contained directory with its own service layer, UI management, and state. The only shared code is in `src/core/`.

```text
src/core/                          Shared infrastructure
  types.ts                         Interfaces only — no runtime code
  event-bus.ts                     Pub/sub factory
  kernel.ts                        Orchestrator (module lifecycle, state, navigation, SEMP auth)
  dom.ts                           `required()` helper — fail-fast required-element assertion
  utils.ts                         Pure utilities (escapeHtml, escapeXml, formatBytes, generateUuid, matchString,
                                   topicsIntersect, topicFilterMatches, normalizeUrlPath, errMessage, isValidHost, isValidPort)

src/modules/connections/                  Module — primary connection setup (Direct + Managed tabs)
src/modules/queue-browser/                Module — queue-browser session + message table
src/modules/queue-copy/                   Module — cross-broker queue copy
src/modules/queue-subscription-explorer/  Module — flat (vpn, queue, topic) table (SEMP v1)
src/modules/queue-discovery/              Module — vestigial; no shipping variant activates it
src/modules/admin-login/                  Module — /solAdmin entry point (admin variant only)
src/modules/user-management/              Module — admin-only user + entitlement CRUD (admin variant only)
src/modules/connection-management/        Module — admin-only broker-connection CRUD (admin variant only)

Install order + sidebar order are set in [src/registry.ts](../src/registry.ts) — each registry entry is a `{ module, priority }` tuple, so the entire ordering decision lives in one file.
```

Each module directory additionally contains a `service-*-mock.ts` sibling for the mock build (`vite build --mode mock`) — see the **Build Modes** section in [CLAUDE.md](../CLAUDE.md).

All module coordination goes through the EventBus:

```text
              EventBus
                 |
     +-----------+-----------+
     |           |           |
  Module A    Module B    Module C
```

### Install-phase buffering (`hold` / `release`)

Modules install in priority order, so an earlier module that emits during its `install()` could reach later-installing modules that haven't subscribed yet. The kernel wraps the install loop in `eventBus.hold()` / `eventBus.release()` — emits fired while held are queued FIFO and flushed (in order) once every module has finished install. Subscriptions made during install are honoured when the flush runs.

No module emits during install today (the currently live cross-module configs are propagated at user-action time — e.g. Connect — not at install time), so the buffer is a no-op in practice. It's retained as a capability: future initial-state events that need to reach later-priority modules can emit during install and rely on the FIFO flush. No `setTimeout`, no sticky-event semantics — just a single install-phase gate.

These methods are kernel-only. Modules never call `hold()`/`release()`.

---

## Cross-Module Event Flow

### VPN-switch handoff (Queue Copy / Queue Browser → Connections)

A module that needs the primary connection on a specific VPN emits `connection:check-connection` with `{vpn, queue, returnTo}`. Connections either confirms it's already on that VPN (fires the finish event synchronously and the caller resumes) or prompts the user, reconnects, and fires the finish event once the new session is up. This is the same conditional-reconnect flow queue-copy and queue-browser both use when a picked queue lives in a different VPN than the current primary.

**Navigation contract — single source of truth.** The connections module navigates the user to its own screen **only when there is actual connection work to do**, and only at the moment the work is committed:

| Path | Navigates? |
| --- | --- |
| Auto-connect (not yet connected) | yes — before initiating connect |
| Already on the target VPN | no — nothing to do |
| VPN switch, user confirms | yes — *after* confirm |
| VPN switch, user cancels | no — caller stays put |

The `returnTo` field only selects which finish event fires (`browser:browse-queue` for `'queue-browser'` and the default, `copy:vpn-switched` for `'queue-copy'`) — it does **not** alter navigation. Future modules using this handshake inherit the policy automatically: pick a `returnTo`, add a finish-event branch in [connections/module.ts](../src/modules/connections/module.ts), don't reintroduce per-caller navigation differences. Tests in [tests/modules/connections/module.test.ts](../tests/modules/connections/module.test.ts) lock the four rows above in place.

**Why the picker does not own the confirm.** The reusable `pickQueue()` core component resolves a `{vpn, queue}` tuple and nothing more. Whether that VPN matches the consumer's "current" VPN (different concept across consumers — primary for queue-browser, destination form for queue-copy's dest picker) and whether to disrupt the primary session are app-layer decisions. Keeping them in the consumer + connections module lets the picker stay generic across all current and future callers.

```text
Queue Copy                         Connections                       Queue Copy
     |                                  |                                |
     | emit('connection:check-         |                                |
     |       connection',              |                                |
     |       {vpn, queue,              |                                |
     |        returnTo:'queue-copy'})  |                                |
     |------------------------------->  |                                |
     |                                  |                                |
     |                          [Is VPN the same?]                      |
     |                           /            \                         |
     |                         YES             NO                       |
     |                          |         [confirm() dialog]            |
     |                          |          /          \                 |
     |                          |        YES          NO                |
     |                          |         |        (abort)              |
     |                          |    [reconnect]                        |
     |                          |         |                             |
     |                          |   emit('client:connected')           |
     |                          |         |                             |
     |                          +---------+                             |
     |                                |                                 |
     |                          emit('copy:vpn-switched',               |
     |                                {queue})                          |
     |                                |------------------------------->  |
     |                                |                                 |
     |                                |                          [loadSelf()]
     |                                |                          [apply queue]
```

### State Change Propagation

```text
Any Module                     Kernel                         All Modules
     |                            |                                |
     | ctx.setState(              |                                |
     |   'isConnected', true)     |                                |
     |------------------------->  |                                |
     |                            | state.isConnected = true       |
     |                            |                                |
     |                            | eventBus.emit(                 |
     |                            |   'app:state-change',          |
     |                            |   {key:'isConnected',          |
     |                            |    value: true})               |
     |                            |------------------------------> |
     |                            |                                |
     |                            | updateGlobalUI()               |
     |                            | (status indicators)            |
```

---

## Dependency Injection

The Kernel builds an `AppContext` for each module, injecting all shared services:

```text
                    Kernel
                      |
          +-----------+-----------+
          |           |           |
    AppContext A  AppContext B  AppContext C
    {                {                {
     container: A    container: B    container: C
     appState: *     appState: *     appState: *     <-- same reference
     eventBus: *     eventBus: *     eventBus: *     <-- same instance
     setState: fn    setState: fn    setState: fn    <-- bound to Kernel
     loadSelf: fn    loadSelf: fn    loadSelf: fn    <-- navigateTo(A/B/C)
     sempFetch: fn   sempFetch: fn   sempFetch: fn   <-- same function
     ...             ...             ...
    }                }                }
```

Each module gets its own `container` (isolated DOM subtree) and `loadSelf` (bound to its ID), but shares the same `appState`, `eventBus`, and helper functions.

---

## Logging

Every runtime log goes through the singleton `logger` in [src/core/logger.ts](../src/core/logger.ts) — a drop-in replacement for `console.*` with a level filter:

```ts
import { logger } from '../../core/logger';
logger.debug('[Module] fine-grained trace');
logger.info ('[Module] lifecycle event');
logger.warn ('[Module] recoverable mismatch');
logger.error('[Module] failure', err);
```

Levels (numeric severity, defined in [src/core/constants.ts](../src/core/constants.ts)): `DEBUG=0`, `INFO=1`, `WARN=2`, `ERROR=3`, `SILENT=4`. A call fires when the current level is `<=` the call's level; `SILENT` mutes everything.

The current level is module-scoped state, set once at boot in `Kernel.start()` from the `?logLevel=<NAME>` URL parameter (case-insensitive). Invalid values fall back to `DEFAULT_LOG_LEVEL` (`INFO`). The logger is **not** routed through `AppContext` — it's set-once boot configuration, not application state, and forcing every service factory to take a `logger` argument purely for delegation would be high churn for no reuse benefit.

Each `logger.*` method delegates to the matching `console.*` channel so DevTools severity filtering keeps working and existing test instrumentation (`vi.spyOn(console, 'warn')`) is unchanged.

Inside [src/core/services/solace-client.ts](../src/core/services/solace-client.ts), `connect()` registers a generic `logger.debug` listener for every value of `solace.SessionEventCode` (in addition to the typed handlers that drive the lifecycle hooks). This means the full Solace SDK event stream is observable with `?logLevel=DEBUG` without per-event wiring, and any new codes the SDK adds are picked up automatically.

The 10 raw `console.*` calls in [src/index.html](../src/index.html) (the inline `<script>` that loads `solclient.js` and `JSZip`) are intentionally not routed through the logger — they fire before any module imports complete.

---

## Queue Browser Internal Architecture

The largest module is decomposed into single-responsibility files:

```text
queue-browser/
  module.ts          Orchestrator — wires DOM events to handlers
       |
       +--- service.ts           Broker operations + publisher lifecycle
       |      createBrowser()       Create queue browser
       |      forwardMessage()      Delegate to core/services/solace-publisher
       |      hasInFlightForward()  Delegate to publisher.isPending
       |      deleteMessages()      Remove from queue + UI
       |
       +--- service-events.ts    Broker event callbacks
       |      onMessage()           Parse incoming messages
       |      onBrowserUp()         Queue connected
       |      onConnectFailed()     Connection error
       |      (ACK/REJECT handlers moved into core/services/solace-publisher)
       |
       +--- state.js             Local state (not shared via EventBus)
       |      messageStore          Map<queueName, Message[]>
       |      browserInstances      Map<queueName, QueueBrowser>
       |      shouldShowMessage()   Filter evaluation engine
       |
       +--- ui-core.js           DOM management
       |      initElements()        Cache all DOM references
       |      updateVisibility()    Show/hide based on connection state
       |      updateCounts()        Refresh Total/Displayed/Selected
       |
       +--- ui-events.ts         User action handlers
       |      handleBindClick()     Bind queue
       |      handleBulkForward()   Forward selected messages
       |      handleBulkDelete()    Delete selected messages
       |      applyFilters()        Apply filter criteria
       |
       +--- ui-table.ts          Table rendering
       |      renderList()          Full table re-render
       |      addMessageRow()       Append single row (real-time)
       |      downloadMessagesZip() ZIP export
       |
       +--- ui-details.ts        Detail panel
       |      showDetails()         Render message details
       |      addPropertyFilterRow() Dynamic filter rows
       |
       +--- ui-forward.js        Forward modal
       |      openForwardModal()    Prepare modal with messages
       |      updateForwardStatus() Update ACK/REJECT status
       |
       +--- constants.js         Module-scoped SVG icon strings (downloadContent, forward, delete, copy …)
```

Queue-browser has no `service-mock.ts` — its production `service.ts` runs in both real and mock builds, with the SDK calls flowing through the mocked Solace session created by `solace-client-mock.ts`. Publish-with-ACK is delegated to the core `solace-publisher` (also mock-redirected) so the demo bundle resolves forwards via the no-op publisher mock.

### Circular Dependency Resolution

`service-events.ts` needs `disconnectBrowser` from `service.ts`, but `service.ts` passes `serviceEvents` callbacks to the Solace SDK. This circular dependency is broken by the `wire()` pattern:

```text
module.ts (install):
  1. const serviceEvents = createServiceEvents();     // No deps yet
  2. const service = createService(app, serviceEvents); // Receives serviceEvents
  3. serviceEvents.wire({ disconnectBrowser: service.disconnectBrowser }); // Late binding
```

`onConnectFailed` throws `wire() not called before onConnectFailed` if step 3 was ever skipped — surfaces the missing-wiring regression at first failure instead of silently no-oping.

---

## Data Flow: Message Lifecycle

```text
Solace Broker
     |
     | (WebSocket message)
     v
service.ts: browser.on(MESSAGE, ...)
     |
     v
service-events.ts: onMessage(queueName, msg)
     |
     | 1. Extract type (Text/Binary/Map/Stream)
     | 2. Extract content (SDT > Binary > XML)
     | 3. Parse timestamp
     | 4. Extract properties + user properties
     | 5. Build message object
     |
     v
state.js: messageStore.get(queueName).push(msg)
     |
     | [Is this the active queue?]
     |   YES --> state.allMessages.push(msg)
     |           shouldShowMessage(msg, filters)?
     |             YES --> state.displayedMessages.push(msg)
     |                     ui-table.ts: addMessageRow(msg)
     |             NO  --> (stored but not displayed)
     |   NO  --> (stored in messageStore only)
     |
     v
ui-table.ts: row appears in table
     |
     | (user clicks row)
     v
ui-details.ts: showDetails(msg)
     |
     v
Detail panel renders message properties, content, destination
```

---

## SEMP v2 Paged Discovery (core library)

SEMPv2 monitor endpoints page their results — the `meta.paging.nextPageUri` field on a response carries an absolute URL for the next page. Brokers in production frequently host hundreds of VPNs/queues, so the discovery service streams pages instead of accumulating them.

### Service contract

The paged-fetch generator lives in **core** at `src/core/services/semp-discovery.ts` and is parameterized by a `SempContext` (a `{ fetch, baseUrl }` pair scoped to a specific broker). This decouples the pagination logic from any particular connection so a module can drive the same generator against a *primary* OR *secondary* broker by passing its own SempContext.

```ts
// src/core/services/semp-discovery.ts
export function createSempDiscovery(sempCtx: SempContext): {
    fetchVpns(maxCount?: number): AsyncGenerator<FetchPage>;
    fetchQueues(vpn: string, maxCount?: number): AsyncGenerator<FetchPage>;
};

type FetchPage = { ok: true; data: string[] } | { ok: false; error: string };
```

A primary `SempContext` is built via `unfilteredPrimarySempContext(ctx)` from `src/core/services/sempContext.ts` (named for what it does NOT do — see [Enforcement points](#enforcement-points)); secondary SempContexts (queue-copy's destination broker) are built directly from the secondary `createServiceSemp` factory's `onConnected` hook.

A shared `fetchPaged()` helper drives the pagination loop:

```text
while (url) {
    if (pageNum > 0) await sleep(PAGE_DELAY_MS);   // 370ms throttle between pages
    sempCtx.fetch(url) → yield { ok: true, data: [...] }
    url = json.meta?.paging?.nextPageUri || null
}
```

The first error terminates the stream — the generator yields `{ok: false, error}` and returns. Any pages already yielded remain valid for the caller. The throttle protects the broker from a burst of back-to-back requests when paging through hundreds of items.

### Consumers — the `QueueSource` seam

Discovery is a capability **of a connection**, owned by whoever owns that connection — never by the reusable consumer. Components receive a `QueueSource` (the discovery analog of `SempContext`) and call `listVpns()` / `listQueues(vpn)`; they never run their own SEMP discovery:

```ts
// src/core/services/queue-source.ts
export interface QueueSource {
    key: string;                                  // cache identity
    listVpns(): AsyncGenerator<FetchPage>;
    listQueues(vpn: string): AsyncGenerator<FetchPage>;
}
export type Scope  = 'browse' | 'operate';
export type Access = { session: ManagedSession; broker: string; scope: Scope } | 'unmanaged';

export function sempQueueSource(sempCtx: SempContext, access: Access): QueueSource;    // live SEMP, filtered by access
export function queueSourceFrom(ctx: AppContext, scope: Scope): QueueSource | null;   // primary
```

`queueSourceFrom(ctx, scope)` is the single place that branches managed-vs-direct. `scope` says what the list is FOR: `browse` filters by `isQueueVisible`, `operate` by `canOperate` — so a destination picker (copying into a queue is a write) cannot offer a queue the user may only read.

- **VPNs** — managed yields the **provisioned set** (`appState.managed.vpns`, published by the connections module from `getConnections`) with no SEMP call; standard does live SEMP discovery. This is why the managed queue-picker lists exactly the VPNs the Connections dropdown shows, instead of every VPN a broad entitlement glob (`msgVpns: '*'`) would admit.
- **Queues** — always live SEMP (no provisioned queue inventory exists anywhere; RBAC specifies queue *globs*, applied by `filterSempFetch`). The asymmetry is in the *data*, not the handling — both are `QueueSource` methods.
- **`key`** — managed folds in the provisioned set + entitlement rows, so a permission/provisioning change (e.g. via Refresh) flips it and the picker's cache (keyed by `key`, not `baseUrl`) misses → re-reads. Standard uses the `baseUrl`.

The reusable [`pickQueue(source, opts?)`](../src/core/components/queue-picker/index.ts) component consumes a `QueueSource` with `for await`, accumulating + sorting + re-rendering after every yielded page:

```ts
for await (const page of source.listVpns()) {
    if (page.ok) {
        currentVpnList = [...currentVpnList, ...page.data].sort();
        renderOptions(vpnList, currentVpnList);   // incremental render
    } else {
        vpnInput.placeholder = page.error;
        return;
    }
}
```

The user sees results populate progressively rather than waiting for every page. queue-browser builds its source with `queueSourceFrom(ctx)`; queue-copy uses `queueSourceFrom(ctx)` for the source / same-broker destination and `sempQueueSource(state.destSempCtx)` for a different-broker destination. The picker behaves identically in every variant — the connection's source decides where the names come from, and the picker never calls SEMP itself.

### Mock service

`semp-discovery-mock.ts` matches the same generator signature but yields exactly one page — pagination logic isn't exercised in mock mode, but the consumer code path is identical.

---

## SEMP v1 Pagination (Queue Subscription Explorer)

Subscription listing uses SEMP **v1** — the `<rpc><show><queue><subscriptions/>` endpoint — not the v2 monitor REST API. The two pagination protocols differ:

| | SEMP v2 (core paged discovery) | SEMP v1 (queue-subscription-explorer) |
| --- | --- | --- |
| Transport | `GET /SEMP/v2/...?count=100` | `POST /SEMP` with raw `<rpc>` XML body |
| Continuation | `meta.paging.nextPageUri` (full URL) | `<more-cookie>` block with the next-page `<rpc>` body |
| Page-size knob | `count` query param | `<num-elements>` element |
| Auth | `Authorization` header (same as v2) | `Authorization` header (same as v2) |

Callers pass the literal path `'/SEMP'` to `sempCtx.fetch`; the kernel's `sempFetch` assembles the wire URL from `appState.sempCredentials` (via `normalizeUrlPath` + `buildBrokerUrl`) on every call, so the v1 RPC inherits hosted-mode routing exactly like a v2 request.

The subscription service (`src/modules/queue-subscription-explorer/service.ts`) follows the same async-generator shape as `createSempDiscovery` — same `{ ok, data | error }` envelope, same `PAGE_DELAY_MS = 370ms` throttle between pages — so the consumer code in `module.ts` looks structurally identical:

```ts
let body: string | null = INITIAL_BODY;       // <rpc>…<num-elements>100</num-elements>…</rpc>
while (body) {
    if (pageNum > 0) await sleep(PAGE_DELAY_MS);
    res = await sempCtx.fetch(url, { method: 'POST', headers, body });
    text = await res.text();
    parsed = parseSubscriptionsResponse(text);   // SubscriptionRow[] + nextPageBody
    yield { ok: true, data: parsed.page.rows };
    body = parsed.page.nextPageBody;             // null when broker has no more pages
}
```

The XML→`SubscriptionRow[]` parser is split into its own `parse.ts` module so the pure logic (queue/topic extraction, more-cookie inner-`<rpc>` serialization via `XMLSerializer`) is unit-testable without mocking `fetch`. Queues with zero topic subscriptions are intentionally omitted from the dataset — the user opted to drop them rather than render blank-subscription rows.

### Topic intersection filter

The Subscription column filter uses **`topicFilterMatches(filter, topic)`** — an intentionally *asymmetric* wrapper (the user's pattern is matched loosely; the broker-stored topic follows Solace's stricter wildcard rule), which normalizes onto the symmetric intersection primitive: both the user-typed pattern and the stored subscription may carry `*` (single-level) or `>` (multi-level trailing) wildcards, and the filter matches when the topic-sets overlap. The pure helper lives in core at `src/core/utils.ts` as `topicsIntersect(a, b)` so both sides are split on `/` and matched level-by-level — this is symmetric in `a` and `b` by design.

VPN and Queue column filters use a different rule (per user spec): plain substring match by default, escalating to anchored wildcard via `matchString()` when the input contains `*`. The shared `matchString` helper lives in `src/core/utils.ts`.

---

## Queue Copy: Verify Flow & Broker Bug Workaround

The queue-copy module's verify phase snapshots the source queue (count, oldest-msg-id, newest-msg-id, access-type) before the run phase begins. The snapshot is **immutable for the duration of the run**: the engine copies oldest → newest in one pass and stops. New arrivals after verify are explicitly out of scope. The newest-msg-id is the **hard stop boundary** for the copy engine; the access-type gates the modal's Move button when the source queue is read-only.

### Two-call SEMP v1 workaround

The broker SEMP v1 `show queue … detail` RPC has a bug (`soltr/10_25_0VMR`): `<info>/<newest-msg-id>` always returns `0`. The same bug surfaces in SEMP v2 as `highestMsgId`. To recover the real value, [`verifyViaSempV1`](../src/modules/queue-copy/service-verify.ts) issues a **second** SEMP v1 POST per verify call:

1. **Detail call** — `<rpc><show><queue><name>…</name><vpn-name>…</vpn-name><detail/></queue></show></rpc>` → populates count, size, quota, max-msg-size, oldest-msg-id from `<info>/*`. The `<newest-msg-id>` field is intentionally ignored (parse line commented out for traceability).
2. **Supplementary call** — `<rpc><show><queue><name>…</name><vpn-name>…</vpn-name><messages/><newest/><count/><num-elements>1</num-elements></queue></show></rpc>` → returns one spooled-message record; `result.newestMsgId` is taken from `spooled-messages/spooled-message/message-id`.

The supplementary call is best-effort: on non-2xx, parse error, fail execute-result, or non-numeric ID, `newestMsgId` stays `null` without failing verification. An empty queue legitimately yields `null`. The signal is checked between the two calls so Cancel-during-verify still aborts promptly.

The QueueBrowser-accumulate fallback (no-SEMP path) is unaffected — it tracks max(seenIds) directly from the browsed messages.

### Access-type capture (gate for Copy and Move)

Both verify paths populate `result.accessType: 'no-access' | 'read-only' | 'read-write' | null`:

- **SEMP path:** the existing detail RPC's `<info>/<others-permission>` value is parsed in `parseSempV1Response` via [`normalizeAccessType`](../src/modules/queue-copy/service-verify.ts). Format examples: `Read-Only (1000)`, `No-Access (1001)`, `Consume (1100)`, `Modify-Topic (1110)`, `Delete (1111)`. Match by prefix (the trailing `(NNNN)` is broker-version-dependent and ignored). Mapping: `No-Access*` → `'no-access'`; `Read-Only*` → `'read-only'`; `Consume*` / `Modify-Topic*` / `Delete*` → `'read-write'`. The SEMP RPC also returns `<info>/<owner>`, captured into `result.owner`.
- **QueueBrowser fallback:** the temp browser's `_messageConsumer._permissions` (same SDK property queue-browser reads) is captured on UP and normalized. SDK returns `'READ_ONLY'` or `'READ_WRITE'`. The SDK has already evaluated the user's effective access from the client's perspective — owner status is baked in — so `result.owner` is left null and the gate trusts `accessType` directly.

**Modal owner override (SEMP path only).** SEMP queue metadata reports `<owner>` and `<others-permission>` independently — the broker's actual access-control rule "owners have full access regardless of others-permission" is the application's responsibility to apply. After `verifySource` returns, `runVerify` in [`ui-modal.ts`](../src/modules/queue-copy/ui-modal.ts) performs a **case-sensitive strict equals** between `result.owner` and `clientUser` (from `ctx.appState.solaceConnection?.user`, defaulting to `''`). On match: lift `result.accessType` to `'read-write'`. On mismatch: fall through to the others-permission gate downstream. The only guard is `result.owner !== null` — null means SEMP didn't surface owner (element missing) or the path was QB-fallback (where owner is not extracted because the SDK's `_permissions` already factored it in). Empty owner is a legitimate value (server-created queue) and is compared with strict equals like any other string.

**Gate matrix.** `evaluateStartGate`:

| `accessType` | `mode === 'copy'` | `mode === 'move'` |
| --- | --- | --- |
| `'no-access'` | blocked (no-access banner) | blocked (no-access banner) |
| `'read-only'` | enabled | blocked (read-only banner) |
| `'read-write'` | enabled | enabled |
| `null` | enabled (permissive — let broker enforce) | enabled |

Move requires consume-or-higher because it deletes from the source after publishing to the destination. The engine itself contains no permission check; gating is entirely a verify-phase + modal concern.

### Run engine: two-phase model

The copy engine separates **stop detection** (Phase 1) from **outcome evaluation** (Phase 2). MESSAGE handlers, the idle timer, browser-event handlers, and the cancel-check together set a single first-wins `stopReason` and call `browser.stop()`; in-flight publishes settle naturally (cancel rejects them via `publisher.rejectAllPending`). Once `inFlight` drains to zero, `evaluateAndFinish` consumes the `stopReason` plus `cancelRequested` and produces a `status` of `'completed' | 'cancelled' | 'error'`, calling `onComplete` exactly once.

Stop reasons: `cancel`, `source-drift` (first msg id ≠ recorded oldest), `max-consumed` (msg id > recorded newest AND we never saw the recorded newest — see below), `reached-max` (processed the recorded newest), `idle` ([`IDLE_TIMEOUT_MS`](../src/modules/queue-copy/constants.ts) = 30 s with no MESSAGE), `publish-error`, `browser-error`. `reached-max` and `idle` produce `completed` only when `copied === total` — otherwise `error` with a count-mismatch message. Cancel always upgrades the final classification.

All five tunable knobs (`IDLE_TIMEOUT_MS`, `PUBLISH_CONCURRENCY_HIGH=20`, `PUBLISH_CONCURRENCY_LOW=10`, `BIND_PROBE_TIMEOUT_MS`, `ACCUMULATE_IDLE_MS`) live in [`queue-copy/constants.ts`](../src/modules/queue-copy/constants.ts) — single source of truth between production and mock builds, motivated by an earlier 30s/60s drift between `service-copy.ts` and `service-copy-mock.ts`. `service-copy.ts` / `service-verify.ts` re-export them via barrel lines for existing test imports.

**`msgId > maxMsgId` is disambiguated by a `seenMaxMsgId` flag, not blindly fatal.** Same-broker copy/move creates a feedback loop: our own published clones land back on the source queue and may be re-delivered as MESSAGE events while the originals' ACKs are still in flight. To distinguish "benign clone" from "the recorded max was consumed externally", the engine sets `seenMaxMsgId = true` synchronously (before the publish await) when a MESSAGE matches the recorded max. The pre-process gate then branches:

- `msgId > maxMsgId` AND `seenMaxMsgId === true` → silent drop. The maxMsgId message is somewhere in our in-flight set, and the post-process gate will end the run when its ACK lands.
- `msgId > maxMsgId` AND `seenMaxMsgId === false` → `triggerStop('max-consumed')`. Solace delivers QB messages in spool-ID order, so a strictly-greater id without ever having seen the recorded max means the max is gone from the queue.

**Phase 1 calls `browser.disconnect()`, not `browser.stop()`.** Disconnect is permanent — no further MESSAGE events can be delivered, even speculatively, while Phase 2 waits for in-flight publishes to settle. This is the cut that prevents same-queue clones from racing the ACK drain.

**Backpressure: source browser pauses at `PUBLISH_CONCURRENCY_HIGH`, resumes at `PUBLISH_CONCURRENCY_LOW`.** The Solace SDK enforces a per-session publish window (default ~50 unACK'd messages); exceeding it makes the next `session.send` return "Guaranteed Message Window Closed". To stay safely under the broker limit even with messages already buffered in the SDK transport window, the engine calls `browser.stop()` when in-flight reaches HIGH and `browser.start()` when it drops to LOW. Hysteresis between the two prevents flapping. Pause is reversible (the SDK's transport buffer holds undelivered messages and re-flushes them on `start()`); separate from the permanent `disconnect()` used by `triggerStop`.

**The idle timer is suspended for the duration of a pause.** Idle's semantics is "no MESSAGE arrived in `IDLE_TIMEOUT_MS`" — but during pause no MESSAGE *can* arrive, because we asked the broker to stop sending them. Leaving the timer armed would erroneously fire `'idle'` whenever the pause exceeds the timeout while in-flight publishes are still settling. So when pausing: `clearTimeout(idleTimer); idleTimer = null`. When resuming: `resetIdleTimer()`. The `finally` block's idle-reset is gated on `!browserPaused` so ACKs landing during pause don't re-arm the suspended timer.

A late cancel detected during pause triggers stop on the next ACK landing — no need to wait for the idle timer.

**In-flight publishes that ACK after a stop still count toward `copied`.** When a stop fires (e.g. `max-consumed` because a brand-new msg arrived after the recorded max was consumed externally), publishes that were already in flight to the destination continue to settle. Their successful ACKs increment `copied` — the messages truly made it, so the user-facing count must reflect that. Phase 2's `copied` vs `total` comparison then produces the right outcome (`error` with "Sent N of M expected" rather than the misleading "Sent 0 of M"). For move mode, the per-message `removeMessageFromQueue` is skipped when the source browser is already disconnected, so the source-queue copy of a successful publish remains and will be re-delivered to the next consumer (best-effort: we'd rather leave a duplicate than lose a message). Only failed in-flight publishes (e.g. `publisher.rejectAllPending` resolutions on cancel) are skipped — and only the FIRST publish failure escalates to `publish-error` (subsequent failures land with `stopReason` already set and are no-ops).

In move mode, `browser.removeMessageFromQueue(msg)` is called per message immediately after that message's publish ACK lands — never batched.

---

## DOM Template System

Each module owns its own `index.html` next to its code:

```text
src/modules/<id>/index.html   ← canonical per-module HTML
src/modules/<id>/module.ts
src/modules/<id>/...
```

The repo-root `index.html` is a generic PWA shell — sidebar, header, `#module-container`, status bar — and contains a single marker comment where module templates get injected at build time:

```html
<!-- index.html (repo root) — shell only -->
<div id="module-container"></div>
...
<!-- @module-templates -->
```

The `inject-module-templates` Vite plugin in `vite.config.ts` reads each `src/modules/<id>/index.html` at build time, wraps each in `<template data-module-id="<id>">...</template>`, and replaces the `@module-templates` marker with the concatenated blocks. The output single-file bundle has all module templates inline, ready for the Kernel to find at startup.

```text
build flow:
  vite.config.ts plugin (transformIndexHtml)
       reads src/modules/<id>/index.html for every module dir
       wraps each in <template data-module-id="<id>">
       splices into src/index.html at <!-- @module-templates -->
       → single dist/index.html with all templates embedded
```

At startup, the Kernel:

1. Finds `<template data-module-id="X">` for each module
2. Creates a wrapper `<div id="module-view-X" class="module-view hidden">`
3. Clones the template content into the wrapper
4. Passes the wrapper as `container` in AppContext
5. Calls `module.install(ctx)`

Navigation toggles the `.hidden` class on module wrappers — no routing, no page reloads.

**Editing rule:** Module HTML changes go in `src/modules/<id>/index.html` only. Don't edit the shell `src/index.html` for module markup — those edits won't survive the next build (the marker gets re-expanded). The shell itself (sidebar layout, header, status bar) stays in `src/index.html`.

### Module registration — variant manifests

Active modules are listed in **variant manifest** files under [src/variants/](../src/variants/). Each manifest is a small file exporting `ACTIVE_MODULES: Record<string, number>` — id → priority. To disable a module in a variant, comment one line. To enable, uncomment. To create a new module, drop `src/modules/<id>/{module.ts, index.html}` and add a line to the variant. No second list to maintain.

```ts
// src/variants/standard.ts — every module the default build ships
export const ACTIVE_MODULES: Record<string, number> = {
    'connections':                 100,
    'queue-browser':                80,
    'queue-copy':                   70,
    'queue-subscription-explorer':  45,
};

// src/variants/min.ts — minimal: connections + queue-browser only
export const ACTIVE_MODULES: Record<string, number> = {
    'connections':                 100,
    'queue-browser':                80,
};

// src/variants/admin.ts — the standalone /solAdmin app (no messaging modules)
export const ACTIVE_MODULES: Record<string, number> = {
    'admin-login':                 100,
    'user-management':              20,    // admin-only (gated by isModuleVisible)
    'connection-management':        15,    // admin-only
};
```

[src/variants/_active.ts](../src/variants/_active.ts) is a one-line re-export from one variant (default `./standard`). The registry imports `ACTIVE_MODULES` from `_active`, so the registry never changes when variants do. To ship a different variant, either edit the re-export OR set `VITE_VARIANT=<name>` at build time — `vite.config.ts`'s variant-redirect resolver rewrites `_active` to the chosen variant file. The `scripts/vite-build.mjs` wrapper surfaces this as `--variant=<name>` and `--out-filename=<name>` flags, since Vite's CLI parser rejects unknown options directly.

A module directory may exist on disk but not appear in any variant (e.g. [`src/modules/queue-discovery/`](../src/modules/queue-discovery/)). The `inject-module-templates` plugin still scans it and injects its `<template>` block into the shell HTML, but the **module registry only bundles the active variant's modules** (see below), so its code never enters the bundle and the kernel never installs it. This is the intentional "carry the code, ship the bundle without it" shape — stronger than tree-shaking, because the unlisted module's `module.ts` is never imported.

**Manifest-driven registry (manifest is authoritative for bundling, not just activation).** [src/registry.ts](../src/registry.ts) reads `ACTIVE_MODULES` from `_active` for the id→priority map and resolves each id to its `PwaModule` via `moduleFiles` from the **`virtual:module-registry`** module. That virtual module is generated per build by the `moduleRegistryPlugin` ([scripts/module-registry-plugin.mjs](../scripts/module-registry-plugin.mjs)) — it transpiles the active `src/variants/<name>.ts`, then emits literal `import * as` statements for **exactly** the listed ids. So a module absent from the active variant is never imported and never reaches the bundle (verified by an isolation grep over the built variants). If a manifest lists an id with no matching `module.ts`, or a `module.ts` whose exported `.id` doesn't match its directory, the registry throws a clear error — boot fails fast. (vitest registers the same plugin so tests resolve `virtual:module-registry`, defaulting to the `full` variant.)

The `inject-module-templates` Vite plugin scans `src/modules/` for every directory containing an `index.html` and injects each as a `<template data-module-id="<id>">…</template>` block. The disk scan is informational: a directory not in the active variant just sits inert in the DOM (no kernel installs it). A module in the active variant whose `index.html` is missing on disk surfaces a kernel console error at startup.

**To add a new module**: create `src/modules/<id>/` with `module.ts` and `index.html`, then add a line to whichever variant should ship it. The build plugin and the registry pick it up automatically.

**To ship a build variant**: drop a new `src/variants/<name>.ts` listing the desired subset, then `VITE_VARIANT=<name> npm run build`.

### Build flavors vs variants

A **variant** decides *which modules* ship (the `ACTIVE_MODULES` manifest). A **flavor** decides *how a module behaves* at build time, via a build-time feature flag — orthogonal to the variant. The two compose: any variant can be built in any flavor.

The first flavor is the queue-browser **no-payload** build. [src/modules/queue-browser/features.ts](../src/modules/queue-browser/features.ts) exports `showPayload()`, which reads `import.meta.env.VITE_SHOW_PAYLOAD` (default `'true'`). The flag is module-local — only queue-browser consumes it, and "payload" is a queue-browser concept (cross-module RBAC gating is a separate mechanism — see [§ Managed Connections](#managed-connections-rbac)). When `VITE_SHOW_PAYLOAD='false'`:

- **The body is never decoded onto state.** `service-events.onMessage` skips the SDT/binary/XML decode and never sets `content` on the stored message object, so the payload is completely inaccessible through app state. The raw SDK message (`_originalMsg`) is retained only because Forward/Delete need it.
- **Payload DOM is removed at install.** Every payload-bearing element in [index.html](../src/modules/queue-browser/index.html) carries a `data-payload` attribute (the single source of truth for "what is payload"); `module.ts` removes `[data-payload]` nodes up-front, and the `required()` assertion list is conditional so the removed elements aren't asserted. Removed: Content Preview, Copy Content, Show Raw + Raw modal, Download Content, Download Full, and the Body-Content filter. **Kept**: Forward, Delete, all metadata, and every other filter.
- **The build plumbs the flag** through `scripts/vite-build.mjs` (`--show-payload=false` → `__VITE_SHOW_PAYLOAD`) into a `vite.config.ts` `define` of `import.meta.env.VITE_SHOW_PAYLOAD`. Because `showPayload()` then folds to a constant, Rollup dead-code-eliminates the payload branches from `dist/no-payload.html` (the inert `data-payload` markup stays in the injected `<template>`, but the live nodes are removed at install and the decode/wiring JS is gone). Emitted by `npm run build:no-payload`.

---

## Managed Connections (RBAC)

**Managed** is a connection *mode*, not a build. Every bundle contains both the manual (**Direct**) and login-gated (**Managed**) paths; which of the two the app offers is resolved at runtime from the gateway. Managed abstracts broker credentials away from the user: they sign in with an app account, and the deployment holds the broker credentials and grants each account a scoped set of brokers, VPNs and queues. It runs only behind the [go-web-proxy](../go-web-proxy) in `MANAGED=true HOSTED=true` mode. The user-facing design, locked decisions, and **threat model** live in [rbac-variant-plan.md](rbac-variant-plan.md); operations in [deployment.md](deployment.md). This section is the *how*.

On the gateway side the RBAC store + `/managed/*` handler are gated behind the `managed` **Go build tag** (`store.go`, `managed.go`, `rbac.go` carry `//go:build managed`; `main.go` reaches them through `newManagedRouting`, with a `//go:build !managed` stub for the default build). So the gateway ships as **two binaries**: the standard/hosted image's binary is stdlib-only (no `gopkg.in/yaml.v3`), and the managed image builds the gateway with `-tags managed` (the `GO_TAGS=managed` Docker build arg). Running the stdlib-only binary with `MANAGED=true` logs a "built without managed support" warning and leaves `/managed/*` falling through to the SPA.

Enforcement is **proxy connection-gating + client guardrails**: the proxy returns only the connections a user is entitled to (plus per-queue permission globs); the client filters discovery and guardrails the UI. The broker relay itself stays ungated, so the client guardrails are UX, not a security boundary.

### Connection modes

[src/core/connections/conn-modes.ts](../src/core/connections/conn-modes.ts) holds a single enum, `connModes: 'direct' | 'managed' | 'both'`, plus `defaultConn` (which tab opens first when both are offered). `resolveConnTabs(cfg)` turns it into the ordered tab list — never empty, so a "no connection UI at all" state is structurally impossible.

The config reaches the app through the gateway probe only:

- **No `/hosted`** (static file, any web server, `dist/index.html` opened from disk) ⇒ `DEFAULT_CONN_CONFIG` ⇒ **Direct only**. Managed can never appear without a gateway, because without one there is nothing to authenticate against.
- **Hosted** ⇒ the gateway resolves `CONN_MODES` / `DEFAULT_CONN` from container env and returns them in the `/hosted` JSON (`{hosted, connModes, defaultConn}`); [core/hosted.ts](../src/core/hosted.ts)'s `probeDeployment` applies it over the default. A gateway older than this contract answers with the plaintext `true`, which is still accepted and means *hosted, Direct only*. `coerceConnConfig` never throws — a malformed response degrades to Direct only.
- The gateway **refuses to start** when it advertises managed without `HOSTED=true`, `MANAGED=true`, and the `managed` build tag (`validateConnModes`), so a half-configured deployment fails at boot rather than showing a tab that cannot work.

The resolved config is published once to `AppState.connConfig` by the connections module, so no other module probes the gateway again. `resolveDestCredModes(cfg)` derives what a **secondary** connection may offer from the very same enum (`direct` ⇒ manual only, `managed` ⇒ provisioned only, `both` ⇒ both) — one source of truth, so the primary's tabs and the secondary's credential sources cannot drift apart.

### The connections module — two tabs, one owner

[src/modules/connections/](../src/modules/connections/) owns the primary connection in both modes. The Direct form lives in `ui.js` / `config.js`; the managed flow lives in [managed-panel.ts](../src/modules/connections/managed-panel.ts) and the `/managed/*` client in [core/services/managed-service.ts](../src/core/services/managed-service.ts). Both drive the *same* pure core factories and produce the same AppState writes and bus emits — the module is still the one place that bridges factory hooks to global state (Anchor #4).

Three consequences of the merge are load-bearing:

- **Mode interlock.** Only one mode may be live. Connecting on Managed tears down a Direct session; connecting on Direct clears `appState.managed`. Without this, RBAC — which keys entirely off that field — would keep filtering a session it knows nothing about. Switching *tabs* is non-destructive; teardown happens at connect time.
- **Single cross-module router.** `connection:check-connection` and `connection:edit-requested` route to the Managed panel when `appState.managed` is set, else run the Direct form's VPN-switch dance. Callers stay mode-agnostic.
- **The Managed tab is offered only when the deployment offers it** — tab visibility *is* the availability signal, which is why the old "Deployment Gateway Required" gate card was removed.

On login the panel `POST`s `{username, token}` to `/managed/getConnections` and hands the returned profile to the managed session store (below). The **Refresh** button first calls `POST /managed/reload` (auth'd as any logged-in user), which makes the proxy re-read `users.yaml` + `connections.yaml` from disk into its in-memory store under the write lock — so out-of-band edits take effect without a restart — then re-fetches `getConnections`; a reload that fails only server-side leaves the in-memory store intact and surfaces a soft warning while still showing last-known data. A browser refresh ends the session (token and seed are in-memory only).

### Managed session store (core-owned credentials)

[src/core/services/managed-session-store.ts](../src/core/services/managed-session-store.ts) is the **sole owner** of the provisioned profile and the site seed, and the only importer of the credential transform's pack/unpack helpers. The kernel creates one per app and passes it on every `AppContext` as `managedStore` — so credential-bearing state is injected, never global (Anchor #2).

```ts
interface ManagedStore {
  setProfile(p: ManagedProfile): Promise<void>;  // imports p.siteSeed internally
  clear(): void;
  isActive(): boolean;
  brokers(): { broker: string; hostname: string }[];   // names + hostnames only
  vpnsFor(broker: string): string[];
  packSecret(plaintext: string): Promise<string>;
  connect(t: SolaceTarget, dial: { connect(c: SolaceDial): void | Promise<void> }): Promise<void>;
  connect(t: SempTarget,   dial: { connect(c: SempDial):   void | Promise<void> }): Promise<void>;
}
```

The **dial interface** is what makes this shareable without leaking anything. A caller names a *target* (`{broker, vpn, kind:'solace'}` or `{broker, kind:'semp'}`) and supplies a callback; the store validates the target against the provisioned set, unpacks the credential just-in-time, synthesizes the config fields the YAML omits, and invokes the callback with a ready-to-dial `{cfg, host, pass, clientName}`. The caller never sees the packed value, never sees the seed, and cannot enumerate credentials — it can only ask for a connection to something it is provisioned for. An inactive session or an unprovisioned target is refused with an actionable error (`Broker "x" is not provisioned for this account.`). `connect` is **overloaded on target kind**, so a Solace target requires a `vpn` and a SEMP target cannot supply one — the mismatch is a type error, not a runtime guard.

Because the store composes the connection identity, the `clientName` it produces always matches the `clientNameId` inside the config it hands over.

### RBAC state + matchers

One optional field is added to `AppState` ([src/core/types.ts](../src/core/types.ts)): `managed?: ManagedSession | null`. `null`/absent ⇒ allow-all (every Direct session), so the helpers below are safe to call unconditionally.

```ts
interface ManagedSession {
  admin: boolean;      // gates the admin-only modules
  username: string;    // resent (with token) to authenticate admin CRUD
  token: string;       // one-way login token; in-memory only
  broker: string;      // connected broker NAME — the `broker` arg to matchers
  vpns: string[];      // PROVISIONED VPN names for that broker (names only)
  operate: QGlob[];    // queues the user may browse + delete on (operate ⊇ read-only)
  readOnly: QGlob[];   // queues the user may only browse
}
```

**Matcher inputs only.** The packed broker credentials and the site seed are deliberately *not* here — they live in the store above. Nothing that could dial a broker ever enters `AppState`.

[src/core/rbac.ts](../src/core/rbac.ts) holds **stateless, case-sensitive** matchers — `matchGlob(pattern, value)` (multi / leading / middle / trailing `*`), `isModuleVisible(s, id)`, `isVpnVisible(s, broker, vpn)`, `isQueueVisible(s, broker, vpn, queue)` (union of operate + read-only), and `canOperate(s, broker, vpn, queue)` (operate only). The same glob/entitlement logic is mirrored in the proxy's `rbac.go`, pinned by a shared TS↔Go conformance vector.

Module visibility is a **requirement map**, `MODULE_REQUIREMENTS: Record<string, 'admin' | 'unfiltered-semp'>`:

| Requirement | Modules | Rule |
| --- | --- | --- |
| `admin` | `user-management`, `connection-management` | visible only when `session.admin` |
| `unfiltered-semp` | `queue-subscription-explorer`, `queue-discovery` | visible when there is **no** managed session; hidden in **every** managed session, admin included |

`unfiltered-semp` exists because those modules read exclusively over **SEMP v1 RPC**, which the discovery filter deliberately never rewrites (below) — so their listings would be entirely unfiltered under RBAC. Hiding them is the honest answer until they consume an entitlement-filtered source; the fixed target for that migration (`SubscriptionSource`) is declared as types in `queue-source.ts`. A module absent from the map has no requirement and is always visible.

### Kernel gating

`renderSidebar()` filters entries through `isModuleVisible(state.managed, id)` and re-applies `.active` after rebuilding; first-module activation skips hidden modules. The kernel subscribes once to the `rbac:changed` bus event → re-renders and, if the active module is now hidden, navigates to the highest-priority visible module. All of this no-ops when `managed` is null. Three modules emit `rbac:changed`: the connections module's Managed panel (login / logout / refresh, and the Direct-connect interlock), `user-management` (when an admin edits their own admin flag), and `admin-login` (the `/solAdmin` sign-in and sign-out).

### Credential transform (posture only — algorithm is code-only)

[src/core/encode.ts](../src/core/encode.ts) provides a one-way, deterministic **login token** derived from the username and password, and a reversible **pack/unpack** for broker credentials keyed by the per-deployment **site seed** (imported non-extractable). Every output carries a neutral version tag so the transform is **swappable** behind a stable interface. It ships in **every** bundle: connection posture is now a runtime decision (see [Connection modes](#connection-modes)), so there is no build in which the managed path is absent. This is obfuscation — it protects a leaked YAML file from offline reversal, not a legitimately entitled user. The algorithm and identifiers are deliberately neutral and are **not documented** anywhere; see the threat model in [rbac-variant-plan.md](rbac-variant-plan.md) for what it does and does not protect.

### Enforcement points

Five seams do the work. Everything else in the app calls the ordinary APIs and inherits the filtering.

**1. Discovery — the `QueueSource` seam.** The queue-picker never touches SEMP; it consumes a `QueueSource` (see the *QueueSource seam* section above). `sempQueueSource(sempCtx, access)` takes a typed **`Access`**:

```ts
type Scope  = 'browse' | 'operate';
type Access = { session: ManagedSession; broker: string; scope: Scope } | 'unmanaged';
```

`'unmanaged'` is not an absence of information — it is an explicit, greppable declaration that this list is deliberately unfiltered, so the audited bypasses can be enumerated. `queueSourceFrom(ctx, scope)` builds the primary's source and is the **one** managed-vs-direct branch point: in a managed session VPNs come from the provisioned set (`appState.managed.vpns`, no SEMP call at all) and queues come from live SEMP filtered by `scope`. `browse` filters by `isQueueVisible`, `operate` by `canOperate` — so a *destination* picker (copying into a queue is a write) cannot offer a queue the user may only read.

The source's `key` — the picker's cache identity — folds in scope, broker and an entitlement fingerprint, so a cached list can never be served across a change of identity, scope or permissions.

**2. Fetch-layer backstop.** `unfilteredPrimarySempContext(ctx)` ([src/core/services/sempContext.ts](../src/core/services/sempContext.ts)) wraps `ctx.sempFetch` with `filterSempFetch` ([src/core/managed-semp-filter.ts](../src/core/managed-semp-filter.ts)) whenever `appState.managed` is set: it bounds the `…/monitor/msgVpns` list to the provisioned set (falling back to the `isVpnVisible` glob before a set is published), drops non-entitled queues from `…/msgVpns/{vpn}/queues`, and preserves `meta` so pagination still works.

The name is a warning, not a description: **only those two SEMP v2 monitor list shapes are rewritten.** Single-object GETs, non-200s, non-JSON, and **every SEMP v1 RPC (`POST /SEMP`)** pass through untouched. Treat a context obtained this way as unfiltered unless the call is one of those two shapes. Its docstring lists the sanctioned consumers; a new one needs design sign-off.

**3. Bind + read-only gating.** On connect, the connections module's managed panel monkey-patches the SDK session's `createQueueBrowser`: binding a non-entitled queue **throws** (queue-browser's existing `createBrowser` try/catch surfaces it via `showBindError`), and on the browser's `UP` event the perceived `_messageConsumer._permissions` is overwritten per `canOperate`, so queue-browser's existing badge + Delete-hide logic gates by entitlement with no change to that module. Read-only blocks **Delete** only; Forward stays allowed (broker-consistent). This couples to SDK internals and is validated only by a real-broker E2E.

**4. Module requirements.** `isModuleVisible` + `MODULE_REQUIREMENTS` (above) keep whole modules out of a managed session when they cannot be filtered.

**5. The queue-copy gate pipeline.** Queue Copy reaches the broker over paths the seams above do not cover — verify is SEMP v1 RPC, and publishing is not a read at all — so it carries its own gates, in order:

| Stage | Where | Refuses |
| --- | --- | --- |
| Source gate | `runVerify`, **before** the probe is spawned | a source queue failing `isQueueVisible` — otherwise a managed user could type any queue name and read back its depth, size and message IDs over v1 RPC |
| Verify | `service-verify` | (unchanged; broker truth) |
| Start gate | `evaluateStartGate` | intersects the broker's verdict with RBAC: `effectiveSourceAccess` downgrades read-write → read-only when `canOperate` is false, and → no-access when `isQueueVisible` is false, so **move** on a browse-only queue is blocked |
| Destination gate | `destinationRefusal`, last check before any publish | a **topic** on a provisioned publish path (entitlements are per queue; a topic fans out to every queue subscribed to it, so it cannot be checked), and a destination queue failing `canOperate` |
| Run | engine | — |

`destinationRefusal` resolves *where the publish will actually land* — the primary's broker/VPN when the destination reuses it, or `destForm.provisioned` when a secondary was dialled with provisioned credentials — and checks that. A **typed-credential** destination is ungated, which is the documented bypass; it is reachable only where the deployment offers Direct alongside Managed (`CONN_MODES=both`).

### Provisioned secondary connections

Queue Copy's destination is a *secondary* connection: its hooks write only module-local state, never AppState and never the bus (Anchor #4). It can now be opened two ways, and which are offered comes from `resolveDestCredModes` (above):

- **Manual** — the user types host + credentials, exactly as before.
- **Provisioned** — the user picks a broker and VPN from `managedStore.brokers()` / `vpnsFor(broker)`; there are no password fields. `module.ts` calls `managedStore.connect(target, { connect })` and dials its own factory pair inside the callback, so the store's ownership of the credential is preserved while the connection's lifecycle stays entirely in the module.

This is the payoff of the dial interface: a second module opens a provisioned connection **without importing the connections module** (Anchor #1) and **without credential-bearing globals** (Anchor #2).

When entitlements change under a live run (`rbac:changed`), the module halts the run through the engine's ordinary halt path — the same one Cancel uses, deliberately reported as `cancelled` because the treatment is mechanically identical and `rbac:changed` only ever fires downstream of a user action. Teardown applies to the **destination only**: the source rides the app-wide primary connection, which the connections module owns, so revoking one queue must never disconnect it.

### The admin app (`/solAdmin`)

The entitlement editors do not ship in the everyday bundles. They live in their own variant ([src/variants/admin.ts](../src/variants/admin.ts) -> `dist/solAdmin.html`) served by the gateway at **`/solAdmin`**, and only when it is running **hosted AND managed** — there is no point offering an editor for a store the deployment does not have. The route is a dedicated handler rather than a file in the SPA tree for two reasons: the SPA's history-mode fallback would otherwise answer `/solAdmin` with the ordinary `index.html`, and a disabled deployment must 404 exactly like a wrong URL.

[admin-login](../src/modules/admin-login/module.ts) is its entry point: the same managed-login intent as the Managed tab (`stamp` -> `getConnections` -> adopt the profile into `managedStore` -> emit `rbac:changed`) **minus the broker** — it opens no Solace or SEMP connection, so `isConnected` / `isSempConnected` stay false for the app's whole lifetime. A valid but non-admin account is **refused at login**, before anything is adopted, so an ordinary user who finds the URL gets an error rather than a signed-in shell with an empty sidebar. Adopting the profile still matters with no broker in play: `connection-management` seals credentials through `managedStore.packSecret`, and the store is the only holder of the site seed.

### The demo broker (`mock.html`)

The demo build does not stub the app's services. It stands up an **in-browser broker** at the transport boundary
and lets the real code run against it.

`src/main.ts` calls `boot()` from [src/core/boot.ts](../src/core/boot.ts), a no-op seam. In mock mode the single
`MOCK_REDIRECTS` entry resolves that import to [src/mock-broker/boot.ts](../src/mock-broker/boot.ts) instead,
which installs three things before any module installs:

1. **`window.solace`** — a full SDK emulation (factory, constructors, enums, session, queue browser, message).
2. **A `window.fetch` interceptor** answering `/hosted`, `/managed/*`, the SEMP v2 monitor endpoints and SEMP v1
   RPCs, falling through to the real `fetch` for anything else.
3. **The demo control panel**, which drives queue state, connection faults, the signed-in managed identity, and
   latency/volume.

Because both seams present the real contract, `solace-client`, `semp-client`, `solace-publisher`,
`semp-discovery`, queue-copy's verify and copy engines and the subscription parser all run **unmodified** in the
demo. That is the point of the design: the demo exercises shipping code paths, so it cannot drift from them. It
replaced seven hand-written `*-mock` files, two of which had already drifted into disagreeing with each other
about which queues exist.

**Isolation** is structural, not tree-shaking: `serviceMockRedirect` is only registered when `mode === 'mock'`
([vite.config.ts](../vite.config.ts)), so a production build has no import edge into `src/mock-broker/` and Rollup
never parses it. The control-panel UI lives inside that tree for the same reason.

**Statefulness is the feature.** The broker holds queues and messages, so actions compose: deleting drops the
depth, a copy run really moves messages, and a topic publish fans out to subscribed queues. The SEMP layer reports
depth and spool usage by reading the same store, so verify's numbers always agree with what browsing shows.

Fidelity details that are load-bearing rather than decorative, each covered by a test in `tests/mock-broker/`:
the session's `createQueueBrowser` is a **reassignable own property** (the managed panel patches it at runtime to
enforce entitlements — a class method would silently disable RBAC); the event emitter is **synchronous and
FIFO** (that patch's `UP` handler must run before queue-browser's); publish acks round-trip through
`ACKNOWLEDGED_MESSAGE` with the correlation key nested exactly where the publisher looks; the queue browser
delivers in **spool-ID order** and its `stop()`/`start()` genuinely suspend delivery (the copy engine's drift
detection and backpressure depend on both). The SEMP v1 detail response even reproduces the broker bug the product
works around — `newest-msg-id` of `0` — so the two-call workaround is exercised rather than bypassed.

### Admin modules + the Go store

`user-management` and `connection-management` (shipped only in the `admin` variant) are admin-only CRUD over the proxy store (`POST /managed/{listUsers,saveUser,deleteUser,listConnections,saveConnection,deleteConnection}`), authenticating by resending the admin `username`+`token` per call. Each renders a full-view **gate** card (the shared "… Required" pattern) whenever `!appState.managed?.admin` — not logged in, or logged in as a non-admin — and only shows its list/form for an admin session; the gate re-evaluates on every `rbac:changed` (login / logout / self-demote), so it appears and clears reactively. They import only from `src/core/*` and their own `service.ts` (no cross-module imports). Both share two reusable core components: [row-list](../src/core/components/row-list/) (`createRowList`) for the dynamic entitlement / VPN row editors, and [module-gate](../src/core/components/module-gate/) (`createGate`) for the admin "… Required" gate card. `createGate` is the shared implementation of the full-view gate pattern used across the app — `queue-browser` / `queue-copy` (primary-connection-required) and `queue-subscription-explorer` (SEMP-connection-required) all create their gate via `createGate` rather than hand-rolled markup (the connections module needs none: the Managed tab is simply not offered when the deployment does not advertise it); each module owns the mutual exclusion between the gate and its own views (e.g. queue-browser injects the gate into its `ui` layer via `ui.setGate`, since its `updateVisibility` also drives header fields). `connection-management` packs broker credentials with the site seed client-side before they leave the browser; `user-management` sends one-way login tokens. The proxy ([go-web-proxy/](../go-web-proxy): `store.go`, `managed.go`, `rbac.go`) loads the two YAML files under an `RWMutex`, persists mutations atomically (temp + fsync + rename, then in-memory swap), and bootstraps a default admin + site seed on first run. Server-side invariants: every endpoint returns an **opaque 400** for unknown-user / bad-token / non-admin (indistinguishable); **list responses strip stored secrets**; a blank password on edit keeps the stored one while creating a user with a blank password is rejected; and deleting the **last admin** is refused (409) to prevent lockout.

---

## CSS Organization

Styles are split by responsibility — design system vs. per-module — and aggregated by one entry point per build (`main.css`, or `main-admin.css` for the admin app).

```text
src/css/
  variables.css     :root design tokens (colors, spacing, radii, shadows)
  reset.css         *, body, box-sizing resets
  layout.css        shell — app container, sidebar, top bar, nav, status footer
  components.css    generic UI — buttons, cards, forms, modals, tables, badges,
                    display outputs, scrollbar, spinner
  utilities.css     Tailwind-ish atomics — flex, gap, spacing, sizing, text
  main.css          @import all of the above + each module's styles.css in order
  main-admin.css    Second entry point — imports main.css plus the admin modules' styles.
                    The css-variant-redirect plugin substitutes it for main.css when
                    building --variant=admin, so admin CSS ships only in solAdmin.html

src/modules/<id>/
  styles.css        module-specific selectors only (e.g. `.browser-*`, `.detail-*`)
```

`src/main.ts` imports `./css/main.css` (rewritten to `./css/main-admin.css` for the admin build). Vite + `vite-plugin-singlefile` inline everything into `dist/index.html` at build time — no runtime fetch.

**Editing rule:** rules belong to the file whose selectors they match.

- A selector shaped like `.browser-*`, `.detail-*`, `.filter-*`, `.searchable-*` → module's `styles.css`.
- A selector shared across modules (generic `.btn-*`, `.modal-*`, `.badge-*`, `.form-*`) → `components.css`.
- A Tailwind-style atomic (`.mt-4`, `.flex-row`, `.hidden`) → `utilities.css`.
- Shell chrome (anything the user sees *outside* a module's content area) → `layout.css`.

If a rule needs `!important` to beat another file's rule, something is probably in the wrong file — fix the placement rather than fighting specificity.

### Required-Element Invariant

Since each module's template is authored alongside its code, the DOM contract is known at install time. Rather than defensively null-checking every access, modules assert that their contracted elements exist up-front using the [`required()`](../src/core/dom.ts) helper:

```ts
import { required } from '../../core/dom';

const btnCopy = required<HTMLButtonElement>(container, '#btn-copy-config');
btnCopy.disabled = false;  // non-null after required()
```

If a template drifts and a selector doesn't match, `install()` throws `Required element missing: <selector>` immediately — a loud fail-fast signal that beats silent partial wiring. Downstream code can rely on the element being present and skips null-guards.

Optional elements (conditionally rendered — e.g. `.btn-delete-row` only present for non-read-only queues) stay nullable and retain `if (el)` guards. The distinction is: "authored in my template" vs "may or may not exist depending on data."

---

## Technology Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| No framework | Vanilla TS/JS | Single-file output, no runtime overhead, full DOM control |
| Single-file bundle | vite-plugin-singlefile | Easy deployment (one HTML file) |
| Micro-kernel | Custom Kernel class | Modules can be added/removed without touching core |
| Typed EventBus | Map + Set with generics | Compile-time safety, zero dependencies |
| Factory functions | Not classes | Closure-scoped state, no `this` binding issues |
| jsdom for tests | Not Playwright/Cypress | Fast unit tests (run in seconds), no browser needed |
| v8 coverage | Not Istanbul | Native coverage, no instrumentation overhead |
