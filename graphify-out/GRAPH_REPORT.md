# Graph Report - smu-dirty  (2026-11-01)

## Corpus Check
- 227 files · ~374,989 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .css 18, (none) 6, .dockerignore 1)

## Summary
- 2526 nodes · 6386 edges · 158 communities (126 shown, 32 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 679 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `260b26a1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- core/types.ts
- live
- semp-client Test Suite
- Architecture
- managed-session-store.ts
- core event-bus
- tls.go
- logger.ts
- loadModuleDOM
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- store
- scripts
- store.ts
- ui-modal.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- state.ts
- Kernel
- testing.T
- queue-browser/service.test.ts
- go_pkg_time
- main.ts
- npm-audit-gate.mjs
- managed-service.ts
- scripts/vite-build.mjs wrapper
- password.go
- testing.T
- panel.ts
- Filter Messages Dialog
- utils.ts
- Kernel.installModule
- newManagedEnv
- dest-provisioned.test.ts
- check-docs-secrecy.mjs
- net/http.ResponseWriter
- Module 3: Queue Copy
- configfile.go
- enums.ts
- Module 2: Queue Browser
- ui.selectMessage
- throttle
- access_test.go
- .submitLogin
- connections/types.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- module-events.test.ts
- tests variants
- connections/module.ts
- user-management/module.ts
- service-verify.ts
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- solace-publisher.ts
- User Guide
- Managed Variant (RBAC)
- user-management/module.test.ts
- vite-build.mjs
- gateway-settings/module.test.ts
- Deployment Guide
- managed.go
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
- createSempDiscovery
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- CSS Organization
- Module Isolation
- Coverage Results
- main.go
- newFakeClock
- session
- createUiEvents
- sempContext Test Suite
- dev.ps1
- Features
- gateway-settings/module.ts
- installDirect
- server/index.ts
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- quietLogger
- solace-client.ts
- createManagedPanel
- Deployment Options
- access.go
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- permRow
- required
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- state.js
- defaultConfig
- fixtures.ts
- Managed mode rework: direction and decisions
- check-bundles.mjs
- ManagedResult
- Developer Guide
- module-gate/index.ts
- queue-subscription-explorer parse
- ui-modal.test.ts
- tests core/event-bus
- tests core/hosted
- tests core/logger
- queue-source.test.ts
- queue-source.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- admin-session.test.ts
- Demo Mode (`mock.html`)
- createService
- variants.test.ts
- Managed Connections (RBAC) — Design & Threat Model
- picker.test.ts
- MockEmitter
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- parse.ts
- RowList
- ConnectionsModule Test Suite
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)

## God Nodes (most connected - your core abstractions)
1. `vitest` - 78 edges
2. `AppContext` - 61 edges
3. `newManagedEnv()` - 59 edges
4. `store` - 59 edges
5. `loadModuleDOM()` - 51 edges
6. `createEventBus()` - 45 edges
7. `quietLogger()` - 38 edges
8. `Architecture` - 37 edges
9. `logger` - 34 edges
10. `expect()` - 33 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Adding a New Module` --references--> `moduleCatalog()`  [INFERRED]
  docs/developer-guide.md → go-web-proxy/configfile.go
- `7. Phases` --references--> `moduleCatalog()`  [INFERRED]
  docs/rbac-rework-plan.md → go-web-proxy/configfile.go

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (158 total, 32 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.10
Nodes (26): hostedInfo, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), contextWithTarget(), fileResolvable(), firstSegment(), hostedHandler (/hosted endpoint) (+18 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (36): formatBytes(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), DestConnStatus, renderDestSummary(), renderModalInitial() (+28 more)

### Community 2 - "core/types.ts"
Cohesion: 0.07
Nodes (31): 4. Shape after the rework, vitest, createEventBus(), AppContext, AppState, BusEvents, EventBus, AdminLoginModule (+23 more)

### Community 3 - "live"
Cohesion: 0.15
Nodes (11): configSource, live, newLive(), restartOnlyKeyNames(), buildManagedRoutes(), newManagedRouting(), newManagedRouting(), TestNewManagedRouting_Enabled() (+3 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "managed-session-store.ts"
Cohesion: 0.09
Nodes (15): SempConfig, SolaceConfig, createManagedService(), ManagedConnection, ManagedProfile, ManagedVpn, DialConn, ManagedStore (+7 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "tls.go"
Cohesion: 0.11
Nodes (17): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+9 more)

### Community 9 - "logger.ts"
Cohesion: 0.15
Nodes (14): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+6 more)

### Community 10 - "loadModuleDOM"
Cohesion: 0.11
Nodes (21): htmlCache, loadModuleDOM(), ROOT, ADMIN, CONNS, el(), hidden(), makeCtx() (+13 more)

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
Cohesion: 0.10
Nodes (31): clientRec, connRec, connsDoc, flexStr, moduleSettings, permRow, profileResponse, respBroker (+23 more)

### Community 17 - "scripts"
Cohesion: 0.11
Nodes (18): scripts, audit:gate, build, build:admin, build:all, build:managed, build:mock, build:no-payload (+10 more)

### Community 18 - "store.ts"
Cohesion: 0.19
Nodes (22): allQueues(), CONTENT_TYPES, findQueueAnyVpn(), getQueue(), key(), MockQueue, PAYLOAD_TEMPLATES, publish() (+14 more)

### Community 19 - "ui-modal.ts"
Cohesion: 0.17
Nodes (22): Locked decisions, ALWAYS_VISIBLE, canOperate(), isModuleVisible(), isQueueVisible(), isVpnVisible(), matchesAny(), matchGlob() (+14 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.13
Nodes (16): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, moduleRegistryPlugin(), readModuleTemplate(), readVariant() (+8 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "state.ts"
Cohesion: 0.10
Nodes (25): SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, DestType, QueueCopyState (+17 more)

### Community 24 - "Kernel"
Cohesion: 0.13
Nodes (8): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Kernel, PwaModule, RegisteredModule

### Community 25 - "testing.T"
Cohesion: 0.19
Nodes (23): expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), TestAuthPages_UnauthenticatedBudget(), TestAuthPages_UnknownPathIs404() (+15 more)

### Community 26 - "queue-browser/service.test.ts"
Cohesion: 0.11
Nodes (25): Coverage Requirements, Running Tests, Test Architecture, Test Setup (`tests/setup.ts`), Testing, Writing Tests for a New Module, tests main, createTestContext() (+17 more)

### Community 27 - "go_pkg_time"
Cohesion: 0.13
Nodes (8): assertNoTempFiles(), TestWriteFileAtomic_ModeIsCallerChosen(), TestWriteFileAtomic_ParentIsAFile(), TestWriteFileAtomic_RenameOntoDirectoryFails(), TestWriteFileAtomic_WritesWithModeAndLeavesNoTemp(), writeFileAtomic(), TestBuildManagedRoutes_GatesByMode(), settingsJSON

### Community 28 - "main.ts"
Cohesion: 0.18
Nodes (9): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), src/main.ts application bootstrap, modules, MOCK_REDIRECTS table, injectModuleTemplates plugin, serviceMockRedirect plugin (+1 more)

### Community 29 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 30 - "managed-service.ts"
Cohesion: 0.15
Nodes (12): allowScripts, esbuild@0.25.12, name, private, type, version, jsdom, @types/node (+4 more)

### Community 32 - "password.go"
Cohesion: 0.14
Nodes (12): hasher, newHasher(), parsePasswordHash(), TestCheckPasswordPolicy(), TestHasher_CostIsReadFromStoredHash(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches(), TestHasher_RoundTripAndFormat() (+4 more)

### Community 33 - "testing.T"
Cohesion: 0.16
Nodes (36): TestBuildManagedRoutes_StoreErrorIsReturned(), blockWrites(), bootstrapFixture(), envOf(), newStoreFixture(), newStoreWithFixtures(), signsIn(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged() (+28 more)

### Community 34 - "panel.ts"
Cohesion: 0.25
Nodes (15): requireActive(), boot(), installSdk(), removeVendorBanner(), seed(), button(), connectionReference(), copyable() (+7 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.15
Nodes (22): escapeHtml(), generateUuid(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchString(), matchStringRegexCache, matchTopicLevels() (+14 more)

### Community 37 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 38 - "newManagedEnv"
Cohesion: 0.15
Nodes (33): errorCode(), expect(), managedEnv, named(), newManagedEnv(), TestManagedAPI_AdminOnly(), TestManagedAPI_CrossOriginStateChangeRefused(), TestManagedAPI_DeleteConnection() (+25 more)

### Community 39 - "dest-provisioned.test.ts"
Cohesion: 0.07
Nodes (35): 2. Decisions taken, dec, enc, fromB64(), importSeed(), pack(), toB64(), unpack() (+27 more)

### Community 40 - "check-docs-secrecy.mjs"
Cohesion: 0.27
Nodes (7): ALLOWED, collect(), main(), RULES, scanDocs(), scanText(), TARGETS

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.15
Nodes (9): pendingRestart(), decodeJSON(), newManagedHandler(), writeError(), writeInvalid(), writeJSON(), managedHandler, serveIndex() (+1 more)

### Community 42 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination credentials (managed sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 43 - "configfile.go"
Cohesion: 0.08
Nodes (43): checkModuleIDs(), configPath(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), envOverrides(), fileConfigFromConfig(), intInRange() (+35 more)

### Community 44 - "enums.ts"
Cohesion: 0.10
Nodes (25): buildMessage(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName (+17 more)

### Community 45 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "throttle"
Cohesion: 0.51
Nodes (6): bucket, failures, throttle, failureWait(), hasRoom(), recordFailure()

### Community 48 - "access_test.go"
Cohesion: 0.25
Nodes (19): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+11 more)

### Community 49 - ".submitLogin"
Cohesion: 0.12
Nodes (18): clientOf(), authPages, writeRateLimited(), pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+10 more)

### Community 50 - "connections/types.ts"
Cohesion: 0.19
Nodes (8): DEFAULT_CONFIG, validateConfig(), ConnectionConfig, ConnectionCredentials, isValidHost(), isValidPort(), config, ui

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
Cohesion: 0.13
Nodes (14): QueueDiscoveryModule, mockCreateBrowser, mockDeleteMessages, mockDisconnectAll, mockDisconnectBrowser, mockFetchQueues, mockFetchVpns, mockForwardMessage (+6 more)

### Community 56 - "connections/module.ts"
Cohesion: 0.14
Nodes (23): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+15 more)

### Community 57 - "user-management/module.ts"
Cohesion: 0.10
Nodes (27): ManagedError, managedErrorMessage(), managedRequest(), MESSAGES, Method, reportManagedFailure(), SIGNED_OUT_TOAST_MS, showToast() (+19 more)

### Community 58 - "service-verify.ts"
Cohesion: 0.10
Nodes (25): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+17 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "solace-publisher.ts"
Cohesion: 0.15
Nodes (13): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+5 more)

### Community 63 - "User Guide"
Cohesion: 0.11
Nodes (17): Administration (`/solAdmin`), Caching, Connection Profiles, Filter syntax, Managed Connections, Module 1: Connections, Module 4: Queue Subscriptions, Overview (+9 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "user-management/module.test.ts"
Cohesion: 0.17
Nodes (13): ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden(), listed(), makeCtx() (+5 more)

### Community 66 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 67 - "gateway-settings/module.test.ts"
Cohesion: 0.12
Nodes (17): filterSempFetch(), SempFetch, ManagedSession, GatewaySettingsModule, ADMIN, clickSave(), el(), errorText() (+9 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.25
Nodes (14): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), permsToRows(), rowsToPerms(), userToOutput() (+6 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (30): APP_VERSION, c(), ensure_deps(), expand(), finish(), has_linux_docker(), host_arch(), host_os() (+22 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, baseUrl, esModuleInterop, module, moduleResolution, outDir, paths (+9 more)

### Community 72 - "Contributing"
Cohesion: 0.12
Nodes (10): Test Report, Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist, Solace Sandbox HTML (+2 more)

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
Cohesion: 0.15
Nodes (14): createEmitter(), Fault, QUEUE_STATE, scenario, createQueueBrowser(), interval(), pump(), MockQueueBrowser (+6 more)

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
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "createSempDiscovery"
Cohesion: 0.17
Nodes (14): createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues, fetchVpns (+6 more)

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

### Community 92 - "main.go"
Cohesion: 0.11
Nodes (24): envOr(), gateway config struct + loadConfig, loadConfig(), main(), newRootHandler(), parseLogLevel(), printVersionIfRequested(), serve() (+16 more)

### Community 93 - "newFakeClock"
Cohesion: 0.29
Nodes (19): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+11 more)

### Community 94 - "session"
Cohesion: 0.23
Nodes (10): activeSession, session, clearSessionCookie(), expired(), sessionOf(), TestSessionOf_ContextRoundTrip(), withSession(), sessionCtxKey (+2 more)

### Community 95 - "createUiEvents"
Cohesion: 0.13
Nodes (4): createUiEvents(), applyFilters(), handleBindPickClick(), makeUiEvents()

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (22): Add-LogText(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image(), Task-build() (+14 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "gateway-settings/module.ts"
Cohesion: 0.12
Nodes (11): createGate(), GateOptions, ModuleGate, FIELDS, Input, Kind, Tree, createSettingsService() (+3 more)

### Community 100 - "installDirect"
Cohesion: 0.16
Nodes (5): DirectConnection, installDirect(), checkConnection(), validateClientNameId(), validateSolace()

### Community 101 - "server/index.ts"
Cohesion: 0.25
Nodes (14): listQueues(), listVpns(), delay(), handleSemp(), hostedResponse(), installMockServer(), json(), readBody() (+6 more)

### Community 104 - "quietLogger"
Cohesion: 0.17
Nodes (19): adminHandler, newAdminHandler(), newPWAHandler(), newReverseProxy(), TestAdminHandler_DisabledIs404(), TestAdminHandler_DoesNotFallBackToTheSPA(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_ServesBundle() (+11 more)

### Community 105 - "solace-client.ts"
Cohesion: 0.18
Nodes (9): createServiceSolace(), cleanup(), connect(), disconnect(), init(), SolaceClient, SolaceConnectionHooks, tlsHandshakeProbe() (+1 more)

### Community 106 - "createManagedPanel"
Cohesion: 0.17
Nodes (19): errMessage(), createManagedPanel(), adopt(), clearSession(), connectSemp(), connectSolace(), doConnect(), doLogout() (+11 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "access.go"
Cohesion: 0.20
Nodes (10): clientIP(), normalizeAddr(), prefixContains(), accessConfig, clientCtxKey, config, prefixStrings(), liveSettings (+2 more)

### Community 111 - "permRow"
Cohesion: 0.33
Nodes (6): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance(), TestMatchGlob_NoOverlap()

### Community 112 - "required"
Cohesion: 0.09
Nodes (15): pickQueue() reusable picker, createRowList(), readRows(), RowField, attachBackdropClose(), required(), INPUT_DEBOUNCE_MS, ConnectionManagementModule (+7 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "state.js"
Cohesion: 0.11
Nodes (31): BLOB_URL_REVOKE_DELAY_MS, DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, showPayload(), QueueBrowserModule, createServiceEvents() (+23 more)

### Community 119 - "defaultConfig"
Cohesion: 0.23
Nodes (12): hostedHandler, liveWith(), TestLive_ApplySwapsEveryLiveKey(), TestPendingRestart(), TestRestartOnlyKeys_EachReadsItsField(), defaultConfig(), TestNewManagedRouting_DisabledIsNil(), newHostedHandler() (+4 more)

### Community 120 - "fixtures.ts"
Cohesion: 0.19
Nodes (12): MOCK_HOST, QueueFixture, QueueState, resetScenario(), ScenarioState, seedState(), VpnFixture, VPNS (+4 more)

### Community 121 - "Managed mode rework: direction and decisions"
Cohesion: 0.22
Nodes (9): 10. Next step, 1. Goal, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 7. Phases, 8. Constraints that stay, 9. Risks (+1 more)

### Community 122 - "check-bundles.mjs"
Cohesion: 0.28
Nodes (6): checkBundles(), findMarkers(), main(), MANAGED_BUNDLE, MANAGED_MARKERS, RELEASE_BUNDLES

### Community 123 - "ManagedResult"
Cohesion: 0.20
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 124 - "Developer Guide"
Cohesion: 0.15
Nodes (13): Adding a New Module, Build commands, Build internals, Build-time feature flags, Code Conventions, Developer Guide, DOM Access, Error Handling (+5 more)

### Community 125 - "module-gate/index.ts"
Cohesion: 0.25
Nodes (8): devDependencies, jsdom, @types/node, typescript, vite, vite-plugin-singlefile, vitest, @vitest/coverage-v8

### Community 127 - "ui-modal.test.ts"
Cohesion: 0.22
Nodes (12): createInitialState(), SourceAccess, provisionedSecondary(), DIRECT, mAccess(), makeCtx(), managed(), openFor() (+4 more)

### Community 131 - "queue-source.test.ts"
Cohesion: 0.17
Nodes (5): State, QueueSource, FetchPage, ALLOW_ALL, SCOPED

### Community 132 - "queue-source.ts"
Cohesion: 0.35
Nodes (10): Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope, sempQueueSource() (+2 more)

### Community 136 - "admin-session.test.ts"
Cohesion: 0.27
Nodes (10): UserManagementModule, CHOICES, expectSignedOut(), hidden(), installAdminApp(), { me, logout, umSvc, showToast }, openAdminApp(), q() (+2 more)

### Community 137 - "Demo Mode (`mock.html`)"
Cohesion: 0.33
Nodes (6): Connecting, Demo controls, Demo Mode (`mock.html`), Opening the demo, The demo topology, What is not in the demo

### Community 138 - "createService"
Cohesion: 0.24
Nodes (6): Circular Dependency Resolution, createService(), createBrowser(), disconnectBrowser(), wire(), deleteBrowser()

### Community 139 - "variants.test.ts"
Cohesion: 0.16
Nodes (9): ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, ACTIVE_MODULES (+1 more)

### Community 140 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.25
Nodes (7): Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (managed by the admin modules; never hand-edit in production), SubscriptionSource

### Community 152 - "parse.ts"
Cohesion: 0.36
Nodes (6): extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), createService(), fetchAllSubscriptions()

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **152 isolated node(s):** `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8`, `jsdom` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 823 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `moduleCatalog()` connect `configfile.go` to `newManagedEnv`, `net/http.ResponseWriter`, `defaultConfig`, `Managed mode rework: direction and decisions`, `Developer Guide`?**
  _High betweenness centrality (0.316) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppContext` (e.g. with `AppContext (Dependency Injection)` and `Factory Pattern`) actually correct?**
  _`AppContext` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.10084033613445378 - nodes in this community are weakly interconnected._
- **Why does `Adding a New Module` connect `Developer Guide` to `required`, `Kernel`, `configfile.go`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **Are the 37 inferred relationships involving `newManagedEnv()` (e.g. with `TestBuildManagedRoutes_GatesByMode()` and `clientACL()`) actually correct?**
  _`newManagedEnv()` has 37 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._