# Graph Report - solabs-msg-utility  (2026-09-05)

## Corpus Check
- 200 files · ~344,785 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2164 nodes · 4515 edges · 158 communities (131 shown, 27 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 268 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e6a3f47b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy.go
- queue-copy/ui.ts
- core/types.ts
- store.ts
- semp-client Test Suite
- Architecture
- queue-copy/module.test.ts
- core event-bus
- tls_test.go
- logger.ts
- connections/module.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- store
- scripts
- semp-v1.ts
- rbac.ts
- Git Workflow & Release Process
- createServiceSolace
- Results Table (VPN, Queue, Subscription columns)
- ui-modal.ts
- managed-panel.test.ts
- newTestHandler
- 2. Design specification
- Step 3b — Provisioned destination (queue-copy)
- Amendments to the implementation brief — responses to repo review
- loadModuleDOM
- managed-service.ts
- vite.config.ts
- Kernel
- testing.T
- panel.ts
- Filter Messages Dialog
- D4 — The `/solAdmin` administration app
- D5 — The `managed` variant retired; packaging tightened
- Amendments, round 2 — responses to findings A–D
- encode.ts
- check-docs-secrecy.mjs
- Step 5 — Docs folded in + a secrecy check
- Step 4 — Module capability gating + the raw-SEMP seam named
- queue-browser/module.ts
- enums.ts
- Step 1 — Managed session store (core-owned credentials)
- ui.selectMessage
- Step 2 — Typed entitlement on discovery sources
- Step 3a — Entitlement gate pipeline (security-critical)
- Amendments, round 3 — A replaced, B's follow-ons decided
- utils.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- module-events.test.ts
- tests variants
- hosted.ts
- connection-management/module.ts
- service-verify.ts
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- solace-publisher.ts
- User Guide
- Managed Variant (RBAC)
- queue-source.test.ts
- vite-build.mjs
- Vendor loader + SDK version gate (post-audit fix)
- Deployment Guide
- proxy_test.go
- dev.sh
- compilerOptions
- Contributing
- Unit Testing — What Is Tested and How
- SEMP v2 Paged Discovery (core library)
- Core Module Tests
- Key Technical Challenges and Solutions
- Integration Testing — How Cross-Module Flows Are Tested
- browser.ts
- queue-picker/index.ts
- DOM Template System
- Cross-Module Event Flow
- Micro-Kernel with Dependency Injection
- Kernel Test Suite
- queue-subscription-explorer/module.ts
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- CSS Organization
- Module Isolation
- Coverage Results
- loadConfig
- user-management/module.ts
- dest-provisioned.test.ts
- createUiEvents
- sempContext Test Suite
- dev.ps1
- Features
- RowList
- user-management/module.test.ts
- server/index.ts
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- Managed Connections (RBAC) — Design & Threat Model
- managed-session-store.ts
- createManagedPanel
- Deployment Options
- The demo build gets a real broker (`mock.html`)
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- picker.test.ts
- required
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- queue-browser/service.test.ts
- ui-modal.test.ts
- fixtures.ts
- Demo Mode (`mock.html`)
- The SDK error-field split (audit + fix)
- Testing
- Developer Guide
- module-gate/index.ts
- queue-subscription-explorer parse
- Kernel.installModule
- tests core/event-bus
- tests core/hosted
- tests core/logger
- state.js
- createSempDiscovery
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- MockEmitter
- ManagedPanel
- UserMgmtService
- variants.test.ts
- queue-source.ts
- wireUiEvents
- Module 2: Queue Browser
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- Change catalogue — connections merge, managed session store, entitlement gates
- SolaceClient
- ConnMgmtService
- ConnectionsModule Test Suite
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)

## God Nodes (most connected - your core abstractions)
1. `AppContext` - 52 edges
2. `loadModuleDOM()` - 43 edges
3. `createEventBus()` - 38 edges
4. `Architecture` - 37 edges
5. `store` - 36 edges
6. `newTestHandler()` - 33 edges
7. `logger` - 31 edges
8. `quietLogger()` - 30 edges
9. `post()` - 25 edges
10. `newStoreWithFixtures()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `Queue Discovery Screenshot` --references--> `queue-discovery index.html`  [INFERRED]
  images/discovery.png → src/modules/queue-discovery/index.html
- `connection:check-connection cross-module dispatch` --conceptually_related_to--> `Two-connection model (Solace + SEMP)`  [INFERRED]
  tests/modules/connections/module.test.ts → README.md
- `SSL modal shows CORS origin hint` --rationale_for--> `Broker CORS requirement for hosted PWA`  [INFERRED]
  tests/modules/connections/ui.test.ts → docs/deployment.md
- `Hosted-mode sempFetch URL rewrite` --rationale_for--> `Gateway proxy path scheme {scheme}/{port}/{host}/{rest}`  [INFERRED]
  tests/core/kernel.test.ts → docs/deployment.md
- `URL Path append (reverse-proxy support)` --conceptually_related_to--> `Gateway proxy path scheme {scheme}/{port}/{host}/{rest}`  [INFERRED]
  tests/core/services/semp-client.test.ts → docs/deployment.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (158 total, 27 thin omitted)

### Community 0 - "proxy.go"
Cohesion: 0.07
Nodes (31): bufio.ReadWriter, context.Context, log/slog.Logger, net.Conn, net/http.Handler, net/http/httputil.ReverseProxy, net/url.URL, adminHandler (+23 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (35): formatBytes(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), DestConnStatus, renderDestSummary(), renderModalInitial() (+27 more)

### Community 2 - "core/types.ts"
Cohesion: 0.07
Nodes (30): createEventBus(), AppContext, AppState, BusEvents, EventBus, ConnectionManagementModule, ui.cacheElements, ui.updateInputState (+22 more)

### Community 3 - "store.ts"
Cohesion: 0.18
Nodes (15): CONTENT_TYPES, key(), listQueues(), listVpns(), MockQueue, PAYLOAD_TEMPLATES, publish(), queues (+7 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (14): Gateway proxy path scheme {scheme}/{port}/{host}/{rest}, Hosted-mode sempFetch URL rewrite, more-cookie SEMP v1 pagination, queue-subscription-explorer service Test Suite, 15s connect timeout with AbortController, makeHooks (test helper), Path-only fetch closure guarantee, semp-client Test Suite (+6 more)

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (29): AppContext (Dependency Injection), AppState (Global State), Architecture Anchors, Circular Dependency Resolution (wire pattern), CSS Organization (split by responsibility), DOM Template Injection (per-module HTML), EventBus, Factory Pattern (no classes) (+21 more)

### Community 6 - "queue-copy/module.test.ts"
Cohesion: 0.09
Nodes (23): createManagedSessionStore(), requireActive(), QueueCopyModule, VerifyResult, makeCtx(), tests main, sessionWithBrowser(), { destSempConnect, destSolConnect, capturedSempHooks, capturedSolHooks } (+15 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "tls_test.go"
Cohesion: 0.17
Nodes (22): crypto/tls.Certificate, crypto/x509.CertPool, encoding/pem.Block, os.FileMode, appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint() (+14 more)

### Community 9 - "logger.ts"
Cohesion: 0.17
Nodes (13): DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN, getLogLevel() (+5 more)

### Community 10 - "connections/module.ts"
Cohesion: 0.16
Nodes (11): ConnectionConfig, ConnectionCredentials, SempConfig, SempContext, SolaceConfig, createServiceSemp(), SempClient, SempConnectionHooks (+3 more)

### Community 11 - "Solace Messaging (Client) Section"
Cohesion: 0.08
Nodes (33): Basic Auth Radio, OAuth2 Auth Radio, Broker Configuration Section, Broker Host (IP or Hostname) Input, Client Connection Status, Load All Config Button, Message VPN Input (default), Messaging Connect Button (+25 more)

### Community 12 - "Testing Requirements"
Cohesion: 0.12
Nodes (16): code:block3 (src/core/services/solace-client.ts), code:ts (import { describe, it, expect, vi, beforeEach } from 'vitest), code:ts (// Weak — only proves "no crash"), code:ts (// Avoid — manual restoration is skipped on failure, leaks i), code:bash (npm test              # Full run (23 files, ~16s)), Coverage Threshold, Cross-Module Integration Tests, Defensive-Guard Tests (+8 more)

### Community 13 - "QueueBrowserModule (priority 30)"
Cohesion: 0.14
Nodes (27): BusEvent app:message-delete, BusEvent app:state-change, BusEvent browser:available, BusEvent browser:browse-queue, BusEvent client:connected, BusEvent client:disconnected, BusEvent config:max-messages-changed, BusEvent connection:check-connection (+19 more)

### Community 14 - "Queue Browser Screenshot"
Cohesion: 0.15
Nodes (13): App Header (solace Msg Utility / Queue Browser title), Content Preview (JSON payload viewer with copy button), Details Header Fields (Message ID, Destination + TOPIC badge, Repl Grp Msg Id), Message Details Panel (BINARY badge, Show Raw Content), Message Properties chips (Delivery Mode, Sender Id), Message Table (Message ID, Date, Size, Actions, row selection, highlighted row), QB Session Panel (Queue Name input, Bind, Bound Queues picker, Unbind), Queue Header (vpn::queue, READ-ONLY badge, filter, Total/Displayed/Selected counts, Download Content / Download Full / Forward) (+5 more)

### Community 15 - "Modal Source Section"
Cohesion: 0.08
Nodes (29): Confirm Queue Copy Modal, Destination Topic (test topic), Destination Panel, Queue/Topic Toggle, Modal Cancel Button, Modal Copy Confirm Button, Modal Destination Section, Modal Refresh Button (+21 more)

### Community 16 - "store"
Cohesion: 0.07
Nodes (43): net/http.Request, net/http.ResponseWriter, sync.RWMutex, clientRec, connJSON, connRec, connsDoc, flexStr (+35 more)

### Community 17 - "scripts"
Cohesion: 0.05
Nodes (42): jsdom, allowScripts, esbuild@0.25.12, devDependencies, jsdom, @types/node, typescript, vite (+34 more)

### Community 18 - "semp-v1.ts"
Cohesion: 0.40
Nodes (12): allQueues(), findQueueAnyVpn(), getQueue(), spoolUsage(), queueStateOf(), esc(), executeError(), handleSempV1() (+4 more)

### Community 19 - "rbac.ts"
Cohesion: 0.16
Nodes (16): filterSempFetch(), SempFetch, canOperate(), isQueueVisible(), isVpnVisible(), matchesAny(), matchGlob(), MODULE_REQUIREMENTS (+8 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (26): Pages dist branch deployment, Release Process (tag-driven), 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main) (+18 more)

### Community 21 - "createServiceSolace"
Cohesion: 0.52
Nodes (7): isHosted(), createServiceSolace(), cleanup(), connect(), disconnect(), init(), tlsHandshakeProbe()

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "ui-modal.ts"
Cohesion: 0.11
Nodes (23): SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, DestType, QueueCopyState (+15 more)

### Community 24 - "managed-panel.test.ts"
Cohesion: 0.18
Nodes (13): ConnectionsModule, connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, login(), makeCtx() (+5 more)

### Community 25 - "newTestHandler"
Cohesion: 0.18
Nodes (29): net/http/httptest.ResponseRecorder, newTestHandler(), post(), TestManaged_CRUD_BadBodyReturns400(), TestManaged_CRUD_MethodNotAllowed(), TestManaged_CRUD_NonAdminRejected(), TestManaged_DeleteConnection_OKAndNotFound(), TestManaged_DeleteConnection_PersistError500() (+21 more)

### Community 26 - "2. Design specification"
Cohesion: 0.14
Nodes (13): 1. Decisions resolved, 2.1 Managed session store (`src/core/services/managed-session-store.ts`), 2.2 Typed entitlement on discovery sources (`src/core/services/queue-source.ts`), 2.3 queue-copy provisioned destination (D6), 2.4 Module capability gating (`src/core/rbac.ts`), 2.5 Docs-side algorithm check, 2.6 Docs to update in the same change, 2. Design specification (+5 more)

### Community 27 - "Step 3b — Provisioned destination (queue-copy)"
Cohesion: 0.15
Nodes (13): Behaviour, Gate, Modified — `src/core/connections/conn-modes.ts`, Modified — `src/core/types.ts` + `src/modules/connections/module.ts`, Modified — `src/modules/queue-copy/{index.html, ui.ts}`, Modified — `src/modules/queue-copy/module.ts`, Modified — `src/modules/queue-copy/module.ts` — `rbac:changed` lifecycle, Modified — `src/modules/queue-copy/state.ts` (+5 more)

### Community 28 - "Amendments to the implementation brief — responses to repo review"
Cohesion: 0.17
Nodes (11): 1. `packSecret` joins the store API (blocking — fixed), 2. Reset-hook grep scoped (blocking — fixed), 3. Topic destinations under managed credentials: **blocked** (escalation — decided), 4. Source picker scope: **`'browse'`**, move enforcement stays per-run, 5. Raw SEMP seam: **designated, not typed** (deferred to the capability layer), 6. Dial payload object; the store owns connection identity, 7. Destination sessions are publish-only — now an invariant, not an accident, 8. Writer rule rephrased for D4 (+3 more)

### Community 29 - "loadModuleDOM"
Cohesion: 0.12
Nodes (16): ui, HERE, htmlCache, loadModuleDOM(), MODULES_DIR, createConnectionsDOM(), createTestContext(), setupConnectedFlow() (+8 more)

### Community 30 - "managed-service.ts"
Cohesion: 0.22
Nodes (4): createManagedService(), ManagedConnection, ManagedService, ManagedVpn

### Community 31 - "vite.config.ts"
Cohesion: 0.09
Nodes (20): activeModuleIds(), extractModuleIds(), moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), ACTIVE_MODULES variant manifest pattern, MOCK_REDIRECTS table, appVersion (+12 more)

### Community 32 - "Kernel"
Cohesion: 0.11
Nodes (11): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), Kernel, isModuleVisible(), PwaModule, RegisteredModule, boot() (+3 more)

### Community 33 - "testing.T"
Cohesion: 0.19
Nodes (33): testing.T, loadStore(), store, newStoreWithFixtures(), TestGetConnections_AuthAndEntitlement(), TestGetConnections_RaceSafe(), TestLoadStore_BootstrapsAdminWhenUsersFileMissing(), TestLoadStore_MalformedUsersYAML() (+25 more)

### Community 34 - "panel.ts"
Cohesion: 0.29
Nodes (14): boot(), installSdk(), removeVendorBanner(), seed(), button(), connectionReference(), copyable(), el() (+6 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "D4 — The `/solAdmin` administration app"
Cohesion: 0.25
Nodes (8): Added — `go-web-proxy`: the `/solAdmin` route, Added — `src/modules/admin-login/{module.ts, index.html, styles.css}`, Added — `src/variants/admin.ts` + `npm run build:admin` → `dist/solAdmin.html`, D4 — The `/solAdmin` administration app, Docs, Gate, Removed — admin modules from the shipping variants, Tests

### Community 37 - "D5 — The `managed` variant retired; packaging tightened"
Cohesion: 0.25
Nodes (8): Changed — compose + release workflow, Changed — CSS variant swap now targets `admin`, Changed — image packaging (`docker/Dockerfile`), D5 — The `managed` variant retired; packaging tightened, Docs, Gate, Removed, Tests

### Community 38 - "Amendments, round 2 — responses to findings A–D"
Cohesion: 0.25
Nodes (7): A. Move gating: explicit RBAC intersection at `evaluateStartGate`, Amendments, round 2 — responses to findings A–D, B. Two gates, correct order — the source leak is real, C. Confinement claim rescoped to the seed-dependent surface, Consolidated deltas (supersedes round-1 list where overlapping), D. Refresh is a writer moment — and the signature change that removes the bug class, Minors — both accepted

### Community 39 - "encode.ts"
Cohesion: 0.22
Nodes (15): b32(), dec, enc, fin(), fromB64(), importSeed(), pack(), rotl() (+7 more)

### Community 40 - "check-docs-secrecy.mjs"
Cohesion: 0.25
Nodes (6): ALLOWED, files, ROOT, RULES, TARGETS, violations

### Community 41 - "Step 5 — Docs folded in + a secrecy check"
Cohesion: 0.29
Nodes (7): Added — `scripts/check-docs-secrecy.mjs` + `npm run check:docs`, Gate, Rewritten — `docs/architecture.md`, Rewritten — `docs/rbac-variant-plan.md`, `docs/deployment.md`, `docs/user-guide.md`, Step 5 — Docs folded in + a secrecy check, Updated — `docs/developer-guide.md`, `docs/contributing.md`, `CLAUDE.md`, Updated — `docs/test-report.md`

### Community 42 - "Step 4 — Module capability gating + the raw-SEMP seam named"
Cohesion: 0.29
Nodes (7): Added — `src/core/services/queue-source.ts`, Behaviour, Gate, Modified — `src/core/rbac.ts`, Renamed — `primarySempContextFrom` → `unfilteredPrimarySempContext` (8 files, zero runtime change), Step 4 — Module capability gating + the raw-SEMP seam named, Tests — `tests/core/rbac.test.ts`

### Community 43 - "queue-browser/module.ts"
Cohesion: 0.23
Nodes (14): escapeHtml(), BLOB_URL_REVOKE_DELAY_MS, showPayload(), QueueBrowserModule, STANDARD_PROPERTY_GETTERS, defaultActiveFilters(), state, els (+6 more)

### Community 44 - "enums.ts"
Cohesion: 0.11
Nodes (20): buildMessage(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName (+12 more)

### Community 45 - "Step 1 — Managed session store (core-owned credentials)"
Cohesion: 0.33
Nodes (6): Added, Confinement achieved (acceptance grep), Gate, Incidental fixes, Modified, Step 1 — Managed session store (core-owned credentials)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "Step 2 — Typed entitlement on discovery sources"
Cohesion: 0.40
Nodes (5): Audit grep, Call sites scoped, Gate, Modified — `src/core/services/queue-source.ts`, Step 2 — Typed entitlement on discovery sources

### Community 48 - "Step 3a — Entitlement gate pipeline (security-critical)"
Cohesion: 0.40
Nodes (5): Behaviour, Gate, Modified — `src/modules/queue-copy/ui-modal.ts`, Step 3a — Entitlement gate pipeline (security-critical), Tests — `tests/modules/queue-copy/ui-modal.test.ts`

### Community 49 - "Amendments, round 3 — A replaced, B's follow-ons decided"
Cohesion: 0.40
Nodes (4): A (final) — downgrade-only intersection, with the source re-check folded in, Amendments, round 3 — A replaced, B's follow-ons decided, B follow-on 2 — mid-run source revocation halts the run, Delta summary

### Community 50 - "utils.ts"
Cohesion: 0.20
Nodes (13): DEFAULT_CONFIG, validateConfig(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), LITERAL_STAR_SENTINEL, matchStringRegexCache (+5 more)

### Community 51 - "Queue Discovery Screenshot"
Cohesion: 0.24
Nodes (13): Queue Discovery Header, Message VPN Selector (default), Open in Browser Button, Queue List Dropdown (test), Queue List Refresh Button, Queue Discovery Screenshot, Sidebar Navigation (Connections, Queue Discovery, Queue Browser), Status Footer (Client / SEMP indicators) (+5 more)

### Community 52 - "Categories of Ignored Code"
Cohesion: 0.15
Nodes (13): Categories of Ignored Code, Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements, Category 2 (obsolete): Disabled Button Wiring in Queue Browser, Category 3: DOMContentLoaded in jsdom (`main.ts`), Category 4: Solace Callback Null Guards, Category 5: Redundant Safety Guards, Category 6: safeSet Inner Function — historical, Category 7 (obsolete): `else if` Chain Bytecode Artifacts (+5 more)

### Community 53 - "SolaceMessageUtility — Test Suite Technical Report"
Cohesion: 0.17
Nodes (12): Approach: Isolation-First with Shared Infrastructure, code:block1 (Statements : 100% (4024/4024)), Core Philosophy: Mock the Platform, Test the Logic, Executive Summary, SolaceMessageUtility — Test Suite Technical Report, Summary of v8 Ignore Philosophy, Table of Contents, Testing Methodology (+4 more)

### Community 54 - "module-events.test.ts"
Cohesion: 0.14
Nodes (13): mockCreateBrowser, mockDeleteMessages, mockDisconnectAll, mockDisconnectBrowser, mockFetchQueues, mockFetchVpns, mockForwardMessage, mockSempConnect (+5 more)

### Community 56 - "hosted.ts"
Cohesion: 0.19
Nodes (16): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+8 more)

### Community 57 - "connection-management/module.ts"
Cohesion: 0.16
Nodes (8): showToast(), ToastType, VPN_FIELDS, createConnMgmtService(), JSON_HEADERS, ManagedConnRecord, ManagedConnVpn, CONN

### Community 58 - "service-verify.ts"
Cohesion: 0.13
Nodes (23): escapeXml(), solaceErrorText(), BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+15 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (11): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+3 more)

### Community 62 - "solace-publisher.ts"
Cohesion: 0.15
Nodes (13): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+5 more)

### Community 63 - "User Guide"
Cohesion: 0.08
Nodes (24): Administration (`/solAdmin`), Caching, Confirm Queue Copy modal, Connection Profiles, Destination credentials (managed sessions), Destination target, Filter syntax, Important considerations (+16 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "queue-source.test.ts"
Cohesion: 0.12
Nodes (6): State, QueueSource, FetchPage, PAGE_DELAY_MS, ALLOW_ALL, SCOPED

### Community 66 - "vite-build.mjs"
Cohesion: 0.20
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 67 - "Vendor loader + SDK version gate (post-audit fix)"
Cohesion: 0.33
Nodes (6): Fixed — a version gate with no teeth, Fixed — four silently discarded fallback candidates, Gate, Not done, Tests, Vendor loader + SDK version gate (post-audit fix)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (16): /hosted probe endpoint, FROM scratch distroless container, Self-signed ECDSA P-256 cert generation, Named tls volume inherits UID 65532, No Docker HEALTHCHECK (scratch image), 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest) (+8 more)

### Community 69 - "proxy_test.go"
Cohesion: 0.09
Nodes (37): io.Writer, hostedHandler, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), firstSegment(), hostedHandler (/hosted endpoint) (+29 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (30): APP_VERSION, c(), ensure_deps(), expand(), finish(), has_linux_docker(), host_arch(), host_os() (+22 more)

### Community 71 - "compilerOptions"
Cohesion: 0.08
Nodes (24): dist, node_modules, src/core/*, src/**/*.js, src/modules/*, src/**/*.ts, vite/client, compilerOptions (+16 more)

### Community 72 - "Contributing"
Cohesion: 0.12
Nodes (16): Coverage Policy (100% target), Defensive-Guard Tests Pattern, Native <dialog> Modal Convention, loadModuleDOM helper, Test Isolation Global Hooks, v8 Coverage Ignore Policy, Test Report, Architecture Notes (+8 more)

### Community 73 - "Unit Testing — What Is Tested and How"
Cohesion: 0.25
Nodes (8): code:ts (describe('shouldShowMessage() filter logic', () => {), code:ts (describe('handleBulkDelete()', () => {), code:ts (// Typical beforeEach in a module test — uses the real per-m), Pattern: DOM Container Construction + Module Installation, Queue Browser State Tests, `tests/modules/queue-browser/state.test.ts`, UI Handler Tests, Unit Testing — What Is Tested and How

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "Core Module Tests"
Cohesion: 0.33
Nodes (6): code:ts (it('fires onConnected with session and vpn on UP_NOTICE', ()), Core Module Tests, Queue Browser No-Payload Flavor Tests, `tests/core/event-bus.test.ts`, `tests/core/services/solace-client.test.ts`, `tests/modules/queue-browser/service-events.test.ts`

### Community 76 - "Key Technical Challenges and Solutions"
Cohesion: 0.29
Nodes (7): Challenge 1: Testing a Commercial SDK Without the SDK, Challenge 2: Shared Singleton State Between Tests, Challenge 3: Worker Instability With 23 Parallel Test Files (Historical), Challenge 4: `/* v8 ignore next */` Not Suppressing Branch Coverage, code:ts (const upHandler = sessionMock.on.mock.calls), code:ts (it('checkAll handler with null msgList does not throw', asyn), Key Technical Challenges and Solutions

### Community 77 - "Integration Testing — How Cross-Module Flows Are Tested"
Cohesion: 0.29
Nodes (7): Integration Testing — How Cross-Module Flows Are Tested, `tests/integration/full-flow.test.ts` — Kernel mechanics, `tests/integration/message-pipeline.test.ts` — End-to-end message ingestion, `tests/integration/module-events.test.ts` — Real cross-module flows, What Integration Testing Does NOT Cover, What Is NOT Covered, Why These Count As Integration Tests

### Community 78 - "browser.ts"
Cohesion: 0.12
Nodes (18): createEmitter(), QUEUE_STATE, scenario, createQueueBrowser(), interval(), pump(), MockQueueBrowser, browserError() (+10 more)

### Community 79 - "queue-picker/index.ts"
Cohesion: 0.26
Nodes (19): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+11 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "Micro-Kernel with Dependency Injection"
Cohesion: 0.40
Nodes (5): code:block2 (src/), code:ts (interface PwaModule {), Internal Module Decomposition, Micro-Kernel with Dependency Injection, Project Architecture Overview

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (5): copyToClipboard button feedback test, createMockModule (test helper), Kernel start() idempotency contract, setupDOM (test helper), Kernel Test Suite

### Community 84 - "queue-subscription-explorer/module.ts"
Cohesion: 0.25
Nodes (11): matchString(), vpnQueueMatch(), SubscriptionRow, createService(), PAGE_SIZE, SubFetchPage, CounterCounts, EMPTY_MESSAGES (+3 more)

### Community 86 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 91 - "Coverage Results"
Cohesion: 0.33
Nodes (6): code:block19 (=============================== Coverage summary ===========), Coverage Results, Go proxy tests (separate suite), Most Recent Run (post May 2026 sweep), Test Counts by File, Type-check gate (separate from coverage)

### Community 92 - "loadConfig"
Cohesion: 0.18
Nodes (18): log/slog.Level, config, envOr(), loadConfig(), main(), parseLogLevel(), printVersionIfRequested(), serve() (+10 more)

### Community 93 - "user-management/module.ts"
Cohesion: 0.26
Nodes (7): QGlob, GLOB_FIELDS, createUserMgmtService(), JSON_HEADERS, ManagedUser, UserPayload, PAYLOAD

### Community 94 - "dest-provisioned.test.ts"
Cohesion: 0.15
Nodes (10): { destSempConnect, destSolConnect }, { destSempHooks }, El, { pickQueueMock }, { runCopyJobMock, captured }, SECRET, SESSION, setupProvisioned() (+2 more)

### Community 95 - "createUiEvents"
Cohesion: 0.12
Nodes (6): createUiEvents(), applyFilters(), clearFilters(), handleBindPickClick(), handleDropdownChange(), makeUiEvents()

### Community 96 - "sempContext Test Suite"
Cohesion: 0.67
Nodes (3): Defensive null guard on inconsistent state, makeCtx (test helper), sempContext Test Suite

### Community 97 - "dev.ps1"
Cohesion: 0.18
Nodes (20): Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image(), Task-build(), Task-cov() (+12 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 100 - "user-management/module.test.ts"
Cohesion: 0.25
Nodes (10): UserManagementModule, ADMIN, el(), hidden(), makeCtx(), rowCount(), setup(), svcMock (+2 more)

### Community 101 - "server/index.ts"
Cohesion: 0.42
Nodes (10): delay(), handleManaged(), handleSemp(), installMockServer(), json(), readBody(), routePath(), sempFault() (+2 more)

### Community 104 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.33
Nodes (6): Locked decisions, Managed Connections (RBAC) — Design & Threat Model, Threat model (honest, documented), Topology, What it is, YAML schemas (managed by the admin modules; never hand-edit in production)

### Community 105 - "managed-session-store.ts"
Cohesion: 0.12
Nodes (8): ManagedProfile, DialConn, ManagedStore, SempDial, SempTarget, SolaceDial, SolaceTarget, PROFILE

### Community 106 - "createManagedPanel"
Cohesion: 0.26
Nodes (15): errMessage(), createManagedPanel(), connectSemp(), connectSolace(), doConnect(), doLogin(), doLogout(), doRefresh() (+7 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "The demo build gets a real broker (`mock.html`)"
Cohesion: 0.18
Nodes (11): Fidelity, which is where the work actually was, Gate, Scenario switcher, Tests, The demo build gets a real broker (`mock.html`), The `file://` route bug (found in demo testing), The problem underneath, The split error-field contract (found in demo testing) (+3 more)

### Community 111 - "picker.test.ts"
Cohesion: 0.22
Nodes (3): __resetForTest(), INPUT_DEBOUNCE_MS, src()

### Community 112 - "required"
Cohesion: 0.19
Nodes (7): pickQueue() reusable picker, createRowList(), readRows(), RowField, attachBackdropClose(), required(), FIELDS

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 114 - "README"
Cohesion: 0.30
Nodes (6): Demo mode (mock.html), README, Queue Browser feature set, Queue Copy feature set, Queue Subscriptions feature set, Quick Start (3 deployment options)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "queue-browser/service.test.ts"
Cohesion: 0.15
Nodes (8): createServiceEvents(), onBrowserUp(), setupBrowserDOM(), createTestContext(), makeOriginal(), setupBrowserDOM(), createMessageMock(), createSolaceMock()

### Community 119 - "ui-modal.test.ts"
Cohesion: 0.22
Nodes (12): ACCUMULATE_IDLE_MS, createInitialState(), provisionedSecondary(), DIRECT, mAccess(), makeCtx(), managed(), openFor() (+4 more)

### Community 120 - "fixtures.ts"
Cohesion: 0.18
Nodes (14): DEMO_SITE_SEED, Fault, MOCK_HOST, QueueFixture, QueueState, resetScenario(), Role, ScenarioState (+6 more)

### Community 121 - "Demo Mode (`mock.html`)"
Cohesion: 0.33
Nodes (6): Connecting, Demo controls, Demo Mode (`mock.html`), Opening the demo, The demo topology, What is not in the demo

### Community 122 - "The SDK error-field split (audit + fix)"
Cohesion: 0.40
Nodes (5): Also fixed: the connect boundary, Fixed, Gate, The mock was hiding it, The SDK error-field split (audit + fix)

### Community 123 - "Testing"
Cohesion: 0.33
Nodes (6): Coverage Requirements, Running Tests, Test Architecture, Test Setup (`tests/setup.ts`), Testing, Writing Tests for a New Module

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (19): Adding a New Module, AppContext (Dependency Injection), Build commands, Build internals, Build-time feature flags, Circular Dependency Resolution, Code Conventions, Developer Guide (+11 more)

### Community 125 - "module-gate/index.ts"
Cohesion: 0.29
Nodes (3): createGate(), GateOptions, ModuleGate

### Community 127 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 131 - "state.js"
Cohesion: 0.13
Nodes (20): DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, createService(), createBrowser(), disconnectBrowser(), onMessage() (+12 more)

### Community 132 - "createSempDiscovery"
Cohesion: 0.22
Nodes (13): createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues, fetchVpns (+5 more)

### Community 139 - "variants.test.ts"
Cohesion: 0.26
Nodes (5): ACTIVE_MODULES, ACTIVE_MODULES, ACTIVE_MODULES, ACTIVE_MODULES, ACTIVE_MODULES

### Community 140 - "queue-source.ts"
Cohesion: 0.29
Nodes (9): Access, accessKey(), filterPages(), queueSourceFrom(), Scope, sempQueueSource(), SubscriptionSource, SubscriptionTriple (+1 more)

### Community 141 - "wireUiEvents"
Cohesion: 0.35
Nodes (11): syncDestFormFromSnapshot(), wireUiEvents(), disposeDestSempConnection(), disposeDestSolConnection(), offeredCredModes(), publishesProvisioned(), refreshDestCredUi(), refreshDestProvisionedVpns() (+3 more)

### Community 142 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 151 - "parse.ts"
Cohesion: 0.38
Nodes (5): extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), fetchAllSubscriptions()

### Community 152 - "Change catalogue — connections merge, managed session store, entitlement gates"
Cohesion: 0.33
Nodes (5): Change catalogue — connections merge, managed session store, entitlement gates, Follow-ups (not started), Known gap, Phase — devops alignment (September 2026), Phases 1–4 — connection merge + gateway config (earlier work, all gated)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (15): Shared Broker Host field, Connections module HTML template, Bridging: factory hooks to AppState+bus, connection:check-connection cross-module dispatch, createTestContext (test helper), Input validation debounce timer cancel, max-messages cap validation/persistence, ConnectionsModule Test Suite (+7 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **637 isolated node(s):** `github.com/solace/go-web-proxy`, `hostedInfo`, `targetURLKey`, `name`, `version` (+632 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `README` connect `README` to `Features`, `Deployment Guide`, `Developer Guide`, `User Guide`, `ConnectionsModule Test Suite`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `AppContext` connect `core/types.ts` to `queue-copy/ui.ts`, `state.js`, `queue-copy/module.test.ts`, `logger.ts`, `connections/module.ts`, `queue-source.ts`, `ui-modal.ts`, `managed-panel.test.ts`, `loadModuleDOM`, `Kernel`, `queue-browser/module.ts`, `ui.selectMessage`, `module-events.test.ts`, `connection-management/module.ts`, `queue-source.test.ts`, `queue-subscription-explorer/module.ts`, `user-management/module.ts`, `dest-provisioned.test.ts`, `user-management/module.test.ts`, `managed-session-store.ts`, `createManagedPanel`, `queue-browser/service.test.ts`, `ui-modal.test.ts`, `Kernel.installModule`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `SolaceMessageUtility — Test Suite Technical Report` connect `SolaceMessageUtility — Test Suite Technical Report` to `Test Infrastructure and Configuration`, `Unit Testing — What Is Tested and How`, `Key Technical Challenges and Solutions`, `Integration Testing — How Cross-Module Flows Are Tested`, `Micro-Kernel with Dependency Injection`, `README`, `Coverage Results`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `github.com/solace/go-web-proxy`, `hostedInfo`, `targetURLKey` to the rest of the system?**
  _637 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy.go` be split into smaller, more focused modules?**
  _Cohesion score 0.07179487179487179 - nodes in this community are weakly interconnected._
- **Should `queue-copy/ui.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10077519379844961 - nodes in this community are weakly interconnected._