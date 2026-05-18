# Architecture

## System Overview

```
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

The connections module probes the gateway-only `/hosted` endpoint at the very start of its `install(app)`. A 200 response with body (trimmed, lowercased) `'true'` flips the singleton in `src/core/hosted.ts`; any other outcome (404 from a standalone deployment, non-`true` body, network error) leaves it off. The probe is awaited before any service factory is created so a Connect click can't race the flag.

`buildBrokerUrl(scheme, host, port, urlPath, isWebSocket)` in `src/core/hosted.ts` is the single rewrite point. In direct mode it returns the original `${scheme}://${host}:${port}${urlPath}` shape; in hosted mode it returns `${wireScheme}://${pageHost}/${scheme}/${port}/${host}${urlPath}`, with `wireScheme` upgraded to `wss`/`ws` for WebSocket (matching the page's https/http) and `https`/`http` for plain HTTP. Both `solace-client` and `semp-client` route through this builder, so every downstream URL (SEMP v2 fetches, SEMP v1 RPC via `deriveSempV1Url`, the queue-discovery paged fetches, queue-subscription-explorer's RPC POSTs, the queue-picker's caches) inherits the rewrite transparently — they all append paths onto the captured `sempCtx.baseUrl`.

Two related details:

- `deriveSempV1Url` strips path/query/fragment in direct mode (SEMP v1 lives at the broker root `/SEMP`, regardless of any user-supplied urlPath on v2) but preserves the gateway proxy prefix in hosted mode so the v1 POST still routes via the gateway.
- The wss TLS handshake probe in `solace-client.ts` is skipped in hosted mode. The browser only sees the gateway's TLS endpoint (already trusted by the PWA load); probing the internal broker would be wrong. Same reasoning suppresses the "click to trust this URL" help link in connection-error toasts.

`AppState.sempCredentials` carries the user-typed `protocol/host/port/urlPath` alongside the rewritten `baseUrl`, so UI code (queue-copy source/dest readout, modal summary) displays the broker the user reached for — not the gateway-prefixed wire URL.

---

## Module Isolation

Modules have **zero cross-module imports**. Each module is a self-contained directory with its own service layer, UI management, and state. The only shared code is in `src/core/`.

```
src/core/                          Shared infrastructure
  types.ts                         Interfaces only — no runtime code
  event-bus.ts                     Pub/sub factory
  kernel.ts                        Orchestrator (module lifecycle, state, navigation, SEMP auth)
  dom.ts                           `required()` helper — fail-fast required-element assertion
  utils.ts                         Pure utilities (escapeHtml, escapeXml, formatBytes, generateUuid, matchString, topicsIntersect, isValidHost, isValidPort)

src/modules/connections/                  Module — primary connection setup
src/modules/queue-browser/                Module — queue-browser session + message table
src/modules/queue-copy/                   Module — cross-broker queue copy
src/modules/queue-subscription-explorer/  Module — flat (vpn, queue, topic) table (SEMP v1)

Install order + sidebar order are set in [src/registry.ts](../src/registry.ts) — each registry entry is a `{ module, priority }` tuple, so the entire ordering decision lives in one file.
```

Each module directory additionally contains a `service-*-mock.ts` sibling for the mock build (`vite build --mode mock`) — see the **Build Modes** section in [CLAUDE.md](../CLAUDE.md).

All module coordination goes through the EventBus:

```
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

| Path                              | Navigates? |
| --------------------------------- | ---------- |
| Auto-connect (not yet connected)  | yes — before initiating connect |
| Already on the target VPN         | no — nothing to do |
| VPN switch, user confirms         | yes — *after* confirm |
| VPN switch, user cancels          | no — caller stays put |

The `returnTo` field only selects which finish event fires (`browser:browse-queue` for `'queue-browser'` and the default, `copy:vpn-switched` for `'queue-copy'`) — it does **not** alter navigation. Future modules using this handshake inherit the policy automatically: pick a `returnTo`, add a finish-event branch in [connections/module.ts](../src/modules/connections/module.ts), don't reintroduce per-caller navigation differences. Tests in [tests/modules/connections/module.test.ts](../tests/modules/connections/module.test.ts) lock the four rows above in place.

**Why the picker does not own the confirm.** The reusable `pickQueue()` core component resolves a `{vpn, queue}` tuple and nothing more. Whether that VPN matches the consumer's "current" VPN (different concept across consumers — primary for queue-browser, destination form for queue-copy's dest picker) and whether to disrupt the primary session are app-layer decisions. Keeping them in the consumer + connections module lets the picker stay generic across all current and future callers.

```
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

```
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

```
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

The 11 raw `console.*` calls in [src/index.html](../src/index.html) (the inline `<script>` that loads `solclient.js` and `JSZip`) are intentionally not routed through the logger — they fire before any module imports complete.

---

## Queue Browser Internal Architecture

The largest module is decomposed into single-responsibility files:

```
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

```
module.ts (install):
  1. const serviceEvents = createServiceEvents();     // No deps yet
  2. const service = createService(app, serviceEvents); // Receives serviceEvents
  3. serviceEvents.wire({ disconnectBrowser: service.disconnectBrowser }); // Late binding
```

`onConnectFailed` throws `wire() not called before onConnectFailed` if step 3 was ever skipped — surfaces the missing-wiring regression at first failure instead of silently no-oping.

---

## Data Flow: Message Lifecycle

```
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

A primary `SempContext` is built via `primarySempContextFrom(ctx)` from `src/core/services/sempContext.ts`; secondary SempContexts (queue-copy's destination broker) are built directly from the secondary `createServiceSemp` factory's `onConnected` hook.

A shared `fetchPaged()` helper drives the pagination loop:

```
while (url) {
    if (pageNum > 0) await sleep(PAGE_DELAY_MS);   // 370ms throttle between pages
    sempCtx.fetch(url) → yield { ok: true, data: [...] }
    url = json.meta?.paging?.nextPageUri || null
}
```

The first error terminates the stream — the generator yields `{ok: false, error}` and returns. Any pages already yielded remain valid for the caller. The throttle protects the broker from a burst of back-to-back requests when paging through hundreds of items.

### Consumers

The reusable [`pickQueue(sempCtx, opts?)`](../src/core/components/queue-picker/index.ts) component consumes the generator with `for await`, accumulating + sorting + re-rendering after every yielded page:

```ts
for await (const page of createSempDiscovery(sempCtx).fetchVpns()) {
    if (page.ok) {
        currentVpnList = [...currentVpnList, ...page.data].sort();
        renderOptions(vpnList, currentVpnList);   // incremental render
    } else {
        vpnInput.placeholder = page.error;
        return;
    }
}
```

This means the user sees results populate progressively rather than waiting for every page to arrive. Queue-copy uses `pickQueue` for both source and destination queue selection.

### Mock service

`semp-discovery-mock.ts` matches the same generator signature but yields exactly one page — pagination logic isn't exercised in mock mode, but the consumer code path is identical.

---

## SEMP v1 Pagination (Queue Subscription Explorer)

Subscription listing uses SEMP **v1** — the `<rpc><show><queue><subscriptions/>` endpoint — not the v2 monitor REST API. The two pagination protocols differ:

| | SEMP v2 (core paged discovery) | SEMP v1 (queue-subscription-explorer) |
|---|---|---|
| Transport | `GET /SEMP/v2/...?count=100` | `POST /SEMP` with raw `<rpc>` XML body |
| Continuation | `meta.paging.nextPageUri` (full URL) | `<more-cookie>` block with the next-page `<rpc>` body |
| Page-size knob | `count` query param | `<num-elements>` element |
| Auth | `Authorization` header (same as v2) | `Authorization` header (same as v2) |

The endpoint URL is derived once via `deriveSempV1Url(sempCtx.baseUrl)` (in `src/core/services/sempContext.ts`) — strips the v2 path/query and appends `/SEMP`.

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

The Subscription column filter uses **bidirectional** Solace topic intersection: both the user-typed pattern and the stored subscription may carry `*` (single-level) or `>` (multi-level trailing) wildcards, and the filter matches when the topic-sets overlap. The pure helper lives in core at `src/core/utils.ts` as `topicsIntersect(a, b)` so both sides are split on `/` and matched level-by-level — this is symmetric in `a` and `b` by design.

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
|---|---|---|
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

```
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

```
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
// src/variants/full.ts — every module the default build ships
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
```

[src/variants/_active.ts](../src/variants/_active.ts) is a one-line re-export from one variant (default `./full`). The registry imports `ACTIVE_MODULES` from `_active`, so the registry never changes when variants do. To ship a different variant, either edit the re-export OR set `VITE_VARIANT=<name>` at build time — `vite.config.ts`'s variant-redirect resolver rewrites `_active` to the chosen variant file. The `scripts/vite-build.mjs` wrapper surfaces this as `--variant=<name>` and `--out-filename=<name>` flags, since Vite's CLI parser rejects unknown options directly.

A module directory may exist on disk but not appear in any variant (e.g. [`src/modules/queue-discovery/`](../src/modules/queue-discovery/)). The build plugin still scans it and injects its `<template>` block into the shell HTML, but with no variant entry the kernel never installs it, so it sits inert. This is the intentional "carry the code, ship the bundle without it" shape.

[src/registry.ts](../src/registry.ts) resolves each id in the active manifest to its `PwaModule` via `import.meta.glob('./modules/*/module.ts', { eager: true })`. If the id has no matching `module.ts` on disk, the registry throws at module-eval time with a clear error — boot fails fast.

The `inject-module-templates` Vite plugin scans `src/modules/` for every directory containing an `index.html` and injects each as a `<template data-module-id="<id>">…</template>` block. The disk scan is informational: a directory not in the active variant just sits inert in the DOM (no kernel installs it). A module in the active variant whose `index.html` is missing on disk surfaces a kernel console error at startup.

**To add a new module**: create `src/modules/<id>/` with `module.ts` and `index.html`, then add a line to whichever variant should ship it. The build plugin and the registry pick it up automatically.

**To ship a build variant**: drop a new `src/variants/<name>.ts` listing the desired subset, then `VITE_VARIANT=<name> npm run build`.

---

## CSS Organization

Styles are split by responsibility — design system vs. per-module — and aggregated by a single entry point.

```
src/css/
  variables.css     :root design tokens (colors, spacing, radii, shadows)
  reset.css         *, body, box-sizing resets
  layout.css        shell — app container, sidebar, top bar, nav, status footer
  components.css    generic UI — buttons, cards, forms, modals, tables, badges,
                    display outputs, scrollbar, spinner
  utilities.css     Tailwind-ish atomics — flex, gap, spacing, sizing, text
  main.css          @import all of the above + each module's styles.css in order

src/modules/<id>/
  styles.css        module-specific selectors only (e.g. `.browser-*`, `.detail-*`)
```

`src/main.ts` imports `./css/main.css`. Vite + `vite-plugin-singlefile` inline everything into `dist/index.html` at build time — no runtime fetch.

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
|----------|--------|-----------|
| No framework | Vanilla TS/JS | Single-file output, no runtime overhead, full DOM control |
| Single-file bundle | vite-plugin-singlefile | Easy deployment (one HTML file) |
| Micro-kernel | Custom Kernel class | Modules can be added/removed without touching core |
| Typed EventBus | Map + Set with generics | Compile-time safety, zero dependencies |
| Factory functions | Not classes | Closure-scoped state, no `this` binding issues |
| jsdom for tests | Not Playwright/Cypress | Fast unit tests (~16s for 707 tests), no browser needed |
| v8 coverage | Not Istanbul | Native coverage, no instrumentation overhead |
