# Graph Report - smu-dirty  (2026-11-08)

## Corpus Check
- 280 files · ~448,589 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 27 file(s) not represented in the graph (top: .css 20, (none) 6, .dockerignore 1)

## Summary
- 3216 nodes · 8523 edges · 165 communities (135 shown, 30 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 857 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a9b3e69f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- connections/module.ts
- go_pkg_testing
- semp-client Test Suite
- Architecture
- managed-panel.test.ts
- core event-bus
- rbac.ts
- smf_test.go
- store
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- secret
- scripts
- tls.go
- store_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- contract_test.go
- createConnTabs
- go_pkg_log_slog
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- log/slog.Logger
- relay_test.go
- solace-publisher.ts
- configfile.go
- core/types.ts
- Filter Messages Dialog
- sockets.test.ts
- runChecks
- expect
- session.ts
- access_test.go
- net/http.ResponseWriter
- logger.ts
- vitest
- loadModuleDOM
- pages.ts
- ui.selectMessage
- queue-source.test.ts
- user-management/module.ts
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- .ServeHTTP
- tests variants
- sealer
- pages_test.go
- service-verify.ts
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- router.ts
- User Guide
- Managed Variant (RBAC)
- installDirect
- ref_node_path
- utils.ts
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
- RowList
- settings.ts
- DOM Template System
- Cross-Module Event Flow
- Micro-Kernel with Dependency Injection
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- CSS Organization
- Module Isolation
- Coverage Results
- main.go
- newFakeClock
- demo-flow.test.ts
- Kernel.installModule
- sempContext Test Suite
- dev.ps1
- Features
- setup.ts
- go_pkg_context
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- server.test.ts
- live
- createManagedPanel
- Deployment Options
- utils.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- queue-source.ts
- createPages
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- createSempDiscovery
- wireUiEvents
- Managed mode rework: direction and decisions
- gateway/types.ts
- loadStore
- state.ts
- Developer Guide
- validate.ts
- queue-subscription-explorer parse
- semp-v1.ts
- tests core/event-bus
- tests core/hosted
- tests core/logger
- state.js
- Module 3: Queue Copy
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Provisioned Mode
- module-registry-plugin.mjs
- ManagedResult
- variants.test.ts
- relay.ts
- Managed Connections (RBAC) — Design & Threat Model
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- SolaceClient
- keyfile_test.go
- seed.ts
- connection-management/service.ts
- unfilteredPrimarySempContext
- ConnectionsModule Test Suite
- throttle
- modules
- panel.ts
- gateway/index.ts
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)

## God Nodes (most connected - your core abstractions)
1. `vitest` - 92 edges
2. `AppContext` - 62 edges
3. `store` - 61 edges
4. `expect()` - 55 edges
5. `loadModuleDOM()` - 55 edges
6. `newManagedEnv()` - 54 edges
7. `quietLogger()` - 50 edges
8. `createEventBus()` - 45 edges
9. `Architecture` - 37 edges
10. `logger` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `2. Decisions taken` --references--> `AppState`  [INFERRED]
  docs/rbac-rework-plan.md → src/core/types.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `The Module Contract` --references--> `PwaModule`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (165 total, 30 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.08
Nodes (41): configPath(), TestConfigPath(), gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), main(), printVersionIfRequested(), serve() (+33 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (35): formatBytes(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), DestConnStatus, renderDestSummary(), renderModalInitial() (+27 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.07
Nodes (46): Locked decisions, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG (+38 more)

### Community 3 - "go_pkg_testing"
Cohesion: 0.17
Nodes (13): assertNoTempFiles(), TestWriteFileAtomic_ModeIsCallerChosen(), TestWriteFileAtomic_ParentIsAFile(), TestWriteFileAtomic_RenameOntoDirectoryFails(), TestWriteFileAtomic_WritesWithModeAndLeavesNoTemp(), writeFileAtomic(), anyMatch(), entitled() (+5 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (16): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx(), NO_SESSION (+8 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "rbac.ts"
Cohesion: 0.12
Nodes (27): filterSempFetch(), SempFetch, ALWAYS_VISIBLE, canOperate(), isQueueVisible(), isVpnVisible(), matchesAny(), matchGlob() (+19 more)

### Community 9 - "smf_test.go"
Cohesion: 0.16
Nodes (16): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation(), TestSMF_JoinsTheSocketToTheBroker() (+8 more)

### Community 10 - "store"
Cohesion: 0.11
Nodes (29): 7. Phases, brokerTarget, clientRec, connRec, connsDoc, flexStr, permRow, profileResponse (+21 more)

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

### Community 17 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+12 more)

### Community 18 - "tls.go"
Cohesion: 0.15
Nodes (17): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+9 more)

### Community 19 - "store_test.go"
Cohesion: 0.16
Nodes (22): newStoreWithFixtures(), signsIn(), TestStore_CheckPassword(), TestStore_CRUD_RaceSafe(), TestStore_DeleteConnection(), TestStore_DeleteUser(), TestStore_DeleteUser_LastAdmin(), TestStore_DeleteUser_PersistError() (+14 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.12
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, ADMIN_CSS_VARIANTS, appVersion, DEMO_BOOTS, DemoRedirect, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "routes.test.ts"
Cohesion: 0.09
Nodes (33): MANAGED_ERROR_CODES, resetScenario(), scenario, ScenarioState, seedState(), setBrokers(), VpnFixture, DEMO_GATEWAY_MARKER (+25 more)

### Community 24 - "contract_test.go"
Cohesion: 0.16
Nodes (18): contractNormalize(), decodeAny(), managedEnv, loadContractSeed(), newContractEnv(), readContract(), TestContract_Cases(), TestContract_SeedSettingsAreTheGateways() (+10 more)

### Community 25 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 26 - "go_pkg_log_slog"
Cohesion: 0.07
Nodes (13): dialRequest, hostedInfo, ownershipHint(), contextWithTarget(), parseRelayPath(), safeSegment(), relayPath, session (+5 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (42): playwright-core, ALIAS, askLine(), askSecret(), broker, brokerSecrets, browserOn(), check() (+34 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.09
Nodes (34): RFC-5280, bitString(), bool(), BROKER_FIELDS, certificate(), commonName(), derLength(), derTime() (+26 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.13
Nodes (16): RFC-2606, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES, findMarkers() (+8 more)

### Community 30 - "log/slog.Logger"
Cohesion: 0.10
Nodes (24): adminHandler, configSource, newDialer(), newRateWindow(), dialer, warnLooseKeyMode(), buildManagedRoutes(), newManagedRouting() (+16 more)

### Community 31 - "relay_test.go"
Cohesion: 0.10
Nodes (25): errReader, fakeBroker, dropSessionCookie(), dropSessionSetCookie(), TestDropSessionCookie(), TestDropSessionSetCookie(), isShowRPC(), answerJSON() (+17 more)

### Community 32 - "solace-publisher.ts"
Cohesion: 0.15
Nodes (13): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+5 more)

### Community 33 - "configfile.go"
Cohesion: 0.07
Nodes (50): checkModuleIDs(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), envOverrides(), fileConfigFromConfig(), intInRange(), levelName() (+42 more)

### Community 34 - "core/types.ts"
Cohesion: 0.04
Nodes (70): 4. Shape after the rework, ConnectionCredentials, createEventBus(), createManagedProfile(), AppContext, AppState, AdminLoginModule, ConnectionsModule (+62 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "sockets.test.ts"
Cohesion: 0.09
Nodes (34): buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, key(), loadStore(), PAYLOAD_TEMPLATES, publish(), queues (+26 more)

### Community 37 - "runChecks"
Cohesion: 0.14
Nodes (26): bindQueue(), configureGateway(), cookies, errorCode(), createCookieJar(), findTokens(), jsonFindings(), parseSetCookie() (+18 more)

### Community 38 - "expect"
Cohesion: 0.13
Nodes (42): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt(), errorCode(), expect() (+34 more)

### Community 39 - "session.ts"
Cohesion: 0.08
Nodes (25): getQueue(), createEmitter(), MockEmitter, QUEUE_STATE, createQueueBrowser(), interval(), pump(), MockQueueBrowser (+17 more)

### Community 40 - "access_test.go"
Cohesion: 0.11
Nodes (38): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+30 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.18
Nodes (11): smfPathFor(), decodeJSON(), writeError(), writeInvalid(), writeJSON(), writeRateLimited(), managedHandler, clearSessionCookie() (+3 more)

### Community 42 - "logger.ts"
Cohesion: 0.07
Nodes (25): Adding a New Module, EventBus (Cross-Module Communication), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT (+17 more)

### Community 43 - "vitest"
Cohesion: 0.05
Nodes (43): pickQueue() reusable picker, vitest, createGate(), GateOptions, ModuleGate, createRowList(), addRow(), clear() (+35 more)

### Community 44 - "loadModuleDOM"
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 45 - "pages.ts"
Cohesion: 0.21
Nodes (11): ManagedPanelDeps, Gateway, LOGIN_PATHS, Page, PagesDeps, PASSWORD_MAX, PASSWORD_MIN, error() (+3 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "queue-source.test.ts"
Cohesion: 0.17
Nodes (5): State, QueueSource, FetchPage, ALLOW_ALL, SCOPED

### Community 48 - "user-management/module.ts"
Cohesion: 0.21
Nodes (12): ADMIN, CHOICES, clickRow(), el(), hidden(), listed(), makeCtx(), rowCount() (+4 more)

### Community 49 - "authPages"
Cohesion: 0.13
Nodes (16): clientOf(), activeSession, authPages, pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+8 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.26
Nodes (19): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+11 more)

### Community 51 - "Queue Discovery Screenshot"
Cohesion: 0.24
Nodes (13): Queue Discovery Header, Message VPN Selector (default), Open in Browser Button, Queue List Dropdown (test), Queue List Refresh Button, Queue Discovery Screenshot, Sidebar Navigation (Connections, Queue Discovery, Queue Browser), Status Footer (Client / SEMP indicators) (+5 more)

### Community 52 - "Categories of Ignored Code"
Cohesion: 0.15
Nodes (13): Categories of Ignored Code, Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements, Category 2 (obsolete): Disabled Button Wiring in Queue Browser, Category 3: DOMContentLoaded in jsdom (`main.ts`), Category 4: Solace Callback Null Guards, Category 5: Redundant Safety Guards, Category 6: safeSet Inner Function — historical, Category 7 (obsolete): `else if` Chain Bytecode Artifacts (+5 more)

### Community 53 - "SolaceMessageUtility — Test Suite Technical Report"
Cohesion: 0.17
Nodes (12): Approach: Isolation-First with Shared Infrastructure, code:block1 (Statements : 100% (4024/4024)), Core Philosophy: Mock the Platform, Test the Logic, Executive Summary, SolaceMessageUtility — Test Suite Technical Report, Summary of v8 Ignore Philosophy, Table of Contents, Testing Methodology (+4 more)

### Community 54 - ".ServeHTTP"
Cohesion: 0.13
Nodes (8): deadHijacker, fileResolvable(), hasExt(), serveIndex(), TestRecordingResponseWriter_DefaultStatus(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 56 - "sealer"
Cohesion: 0.13
Nodes (11): parseStoreKey(), sealer, bootstrapUsers(), newSealer(), storeHeader(), TestNewSealer_TakesOnlyA32ByteKey(), testSealer(), TestSealer_OpenRefusesWhatItCannotTrust() (+3 more)

### Community 57 - "pages_test.go"
Cohesion: 0.14
Nodes (36): TestBuildManagedRoutes_GatesByMode(), TestWriteJSON_EncodeFailureKeepsStatus(), expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm() (+28 more)

### Community 58 - "service-verify.ts"
Cohesion: 0.10
Nodes (26): escapeXml(), solaceErrorText(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+18 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "router.ts"
Cohesion: 0.22
Nodes (20): createRouter(), handle(), match(), error(), glob(), Handler, invalid(), noContent (+12 more)

### Community 63 - "User Guide"
Cohesion: 0.07
Nodes (27): Administration (`/solAdmin`), Binding to a Queue, Caching, Connection Profiles, Contents, Deleting Messages, Downloading Messages, Filter syntax (+19 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "installDirect"
Cohesion: 0.08
Nodes (15): AppContext (Dependency Injection), Circular Dependency Resolution, Factory Pattern, Key Concepts, The Module Contract, DirectConnection, installDirect(), checkConnection() (+7 more)

### Community 66 - "ref_node_path"
Cohesion: 0.11
Nodes (18): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+10 more)

### Community 67 - "utils.ts"
Cohesion: 0.09
Nodes (23): DEFAULT_CONFIG, validateConfig(), INPUT_DEBOUNCE_MS, generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec() (+15 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.18
Nodes (16): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), newManagedHandler(), permsToRows(), rowsToPerms() (+8 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (32): APP_VERSION, c(), ensure_deps(), expand(), finish(), has_linux_docker(), host_arch(), host_os() (+24 more)

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

### Community 79 - "settings.ts"
Cohesion: 0.16
Nodes (20): cidrList(), clone(), connModesProblem(), createSettings(), GatewaySettingsFile, ipv6Groups(), ipv6String(), Kind (+12 more)

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

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.15
Nodes (13): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+5 more)

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
Cohesion: 0.15
Nodes (20): config, hostedEnv(), loadConfig(), newRootHandler(), parseHosted(), parseLogLevel(), route(), stubHandler() (+12 more)

### Community 93 - "newFakeClock"
Cohesion: 0.26
Nodes (21): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessionOf_ContextRoundTrip(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+13 more)

### Community 94 - "demo-flow.test.ts"
Cohesion: 0.13
Nodes (21): ConnectionManagementModule, NO_VPNS, connect(), expectSignedOut(), MODULES, navItems(), openOwnRow(), panelButton() (+13 more)

### Community 95 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (24): Add-LogText(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image(), Task-build() (+16 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "setup.ts"
Cohesion: 0.12
Nodes (26): createInitialState(), tests main, makeOriginal(), sessionWithBrowser(), msg(), setup(), makeCtx(), PRIMARY (+18 more)

### Community 100 - "go_pkg_context"
Cohesion: 0.20
Nodes (12): hasher, newHasher(), parsePasswordHash(), TestHasher_CostIsReadFromStoredHash(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches(), TestHasher_RoundTripAndFormat(), TestHasher_UnknownUserUsesDummy() (+4 more)

### Community 101 - "package.json"
Cohesion: 0.11
Nodes (17): allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name, private, type (+9 more)

### Community 104 - "server.test.ts"
Cohesion: 0.17
Nodes (19): listQueues(), listVpns(), brokerVpns(), delay(), handleSemp(), hostedResponse(), installMockServer(), json() (+11 more)

### Community 105 - "live"
Cohesion: 0.15
Nodes (10): accessConfig, live, hostOnlyKeyNames(), restartOnlyKeyNames(), liveSettings, loginLimits, gateDirect(), expired() (+2 more)

### Community 106 - "createManagedPanel"
Cohesion: 0.15
Nodes (21): isSessionEnded(), errMessage(), createManagedPanel(), adopt(), clearSession(), connectFailed(), connectSemp(), connectSolace() (+13 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "utils.ts"
Cohesion: 0.17
Nodes (14): extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), SubscriptionRow, createService(), fetchAllSubscriptions(), PAGE_SIZE (+6 more)

### Community 111 - "queue-source.ts"
Cohesion: 0.17
Nodes (12): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+4 more)

### Community 112 - "createPages"
Cohesion: 0.53
Nodes (9): createPages(), field(), frame(), hide(), open(), showLogin(), showPassword(), submitted() (+1 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "createSempDiscovery"
Cohesion: 0.19
Nodes (10): createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues, fetchVpns (+2 more)

### Community 119 - "wireUiEvents"
Cohesion: 0.35
Nodes (11): syncDestFormFromSnapshot(), wireUiEvents(), disposeDestSempConnection(), disposeDestSolConnection(), offeredCredModes(), publishesProvisioned(), refreshDestCredUi(), refreshDestProvisionedVpns() (+3 more)

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.18
Nodes (10): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 8. Constraints that stay, 9. Risks (+2 more)

### Community 121 - "gateway/types.ts"
Cohesion: 0.12
Nodes (22): ManagedProfile, QGlob, anyMatch(), cloneConn(), createStore(), DeleteUserResult, entitled(), ModuleSettings (+14 more)

### Community 122 - "loadStore"
Cohesion: 0.27
Nodes (15): loadStore(), bootstrapFixture(), envOf(), newStoreFixture(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(), TestLoadStore_BootstrapRefusesBadSources(), TestLoadStore_EmptyOrMissingConnectionsFileYieldsNoBrokers() (+7 more)

### Community 123 - "state.ts"
Cohesion: 0.13
Nodes (14): SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, DestType, QueueCopyState (+6 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (18): Build commands, Build internals, Build-time feature flags, Code Conventions, Contents, Coverage Requirements, Developer Guide, DOM Access (+10 more)

### Community 125 - "validate.ts"
Cohesion: 0.20
Nodes (14): BROKER_RULE, connectionProblem(), hasControl(), isIPv4(), isIPv6(), portProblem(), USERNAME_RULE, validBroker() (+6 more)

### Community 127 - "semp-v1.ts"
Cohesion: 0.34
Nodes (14): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), queueStateOf(), esc(), executeError() (+6 more)

### Community 131 - "state.js"
Cohesion: 0.06
Nodes (54): Writing Tests for a New Module, escapeHtml(), BLOB_URL_REVOKE_DELAY_MS, DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, showPayload() (+46 more)

### Community 132 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination credentials (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 136 - "Provisioned Mode"
Cohesion: 0.14
Nodes (14): Administer, Configure, Connection modes, Contents, Environment variables, How it works, Provisioned Mode, Security checklist (+6 more)

### Community 137 - "module-registry-plugin.mjs"
Cohesion: 0.20
Nodes (12): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, moduleRegistryPlugin(), readModuleTemplate(), readVariant() (+4 more)

### Community 138 - "ManagedResult"
Cohesion: 0.10
Nodes (11): ManagedResult, ManagedDialer, DialResponse, ManagedService, ConnMgmtService, createSettingsService(), GatewaySettings, SettingsService (+3 more)

### Community 139 - "variants.test.ts"
Cohesion: 0.14
Nodes (11): ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, MODULE_ENTRIES, ACTIVE_MODULES (+3 more)

### Community 140 - "relay.ts"
Cohesion: 0.22
Nodes (13): declRefused(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse(), relay(), RELAY_PREFIX (+5 more)

### Community 141 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.22
Nodes (8): Contents, Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app), SubscriptionSource

### Community 142 - "boot.managed.ts"
Cohesion: 0.11
Nodes (28): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+20 more)

### Community 152 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, jsdom, playwright-core, @types/node, typescript, vite, vite-plugin-singlefile, vitest (+1 more)

### Community 154 - "keyfile_test.go"
Cohesion: 0.33
Nodes (11): createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey() (+3 more)

### Community 155 - "seed.ts"
Cohesion: 0.22
Nodes (10): QueueFixture, connection(), DEMO_ACCOUNTS, DEMO_TOPOLOGY, demoSeed(), everything, pw(), GatewaySeed (+2 more)

### Community 156 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 157 - "unfilteredPrimarySempContext"
Cohesion: 0.83
Nodes (4): unfilteredPrimarySempContext(), createService(), fetchQueues(), fetchVpns()

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "throttle"
Cohesion: 0.51
Nodes (6): bucket, failures, throttle, failureWait(), hasRoom(), recordFailure()

### Community 162 - "modules"
Cohesion: 0.16
Nodes (8): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), boot(), src/main.ts application bootstrap, kernel, modules, injectModuleTemplates plugin

### Community 163 - "panel.ts"
Cohesion: 0.15
Nodes (29): managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, el() (+21 more)

### Community 164 - "gateway/index.ts"
Cohesion: 0.09
Nodes (25): createGateway(), changePassword(), signIn(), GatewayFaults, GatewaySnapshot, PageResult, toResponse(), RouterDeps (+17 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **157 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 982 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Adding a New Module` connect `logger.ts` to `configfile.go`, `vitest`, `Developer Guide`?**
  _High betweenness centrality (0.219) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppContext` (e.g. with `AppContext (Dependency Injection)` and `Factory Pattern`) actually correct?**
  _`AppContext` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.07585568917668825 - nodes in this community are weakly interconnected._
- **Why does `moduleCatalog()` connect `configfile.go` to `expect`, `access_test.go`, `net/http.ResponseWriter`, `logger.ts`, `store`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Are the 34 inferred relationships involving `expect()` (e.g. with `TestDial_ConnectsAreRateLimitedPerUser()` and `TestDial_IssuesTheVPNCredential()`) actually correct?**
  _`expect()` has 34 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._