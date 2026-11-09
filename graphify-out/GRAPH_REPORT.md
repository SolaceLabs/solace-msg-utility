# Graph Report - smu-dirty  (2026-11-10)

## Corpus Check
- 298 files · ~486,185 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 28 file(s) not represented in the graph (top: .css 21, (none) 6, .dockerignore 1)

## Summary
- 3546 nodes · 9713 edges · 167 communities (138 shown, 29 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 1051 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fb31ea7a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- connections/module.ts
- entitled
- semp-client Test Suite
- Architecture
- managed-panel.ts
- core event-bus
- rbac.ts
- smf_test.go
- store
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- time.Time
- scripts
- tls.go
- store_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- sockets.test.ts
- pages_test.go
- backup.go
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- contract_test.go
- relay_test.go
- backup.ts
- configfile.go
- core/types.ts
- Filter Messages Dialog
- access_test.go
- required
- expect
- session.ts
- installDirect
- net/http.ResponseWriter
- logger.ts
- vitest
- managed-panel.test.ts
- runDirectChecks
- ui.selectMessage
- backup/module.ts
- access-test.ts
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- pipe
- tests variants
- sealer
- runChecks
- service-verify.ts
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- router.ts
- Module 2: Queue Browser
- Managed Variant (RBAC)
- demo-flow.test.ts
- vite-build.mjs
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
- createRowList
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
- gateway-settings/module.ts
- Kernel.installModule
- sempContext Test Suite
- dev.ps1
- Features
- ui-modal.test.ts
- backup_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- server.test.ts
- log/slog.Logger
- createManagedPanel
- Deployment Options
- queue-subscription-explorer/service.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- queue-source.ts
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- pages.test.ts
- user-management/module.test.ts
- Managed mode rework: direction and decisions
- gateway/types.ts
- loadStore
- routes.test.ts
- Developer Guide
- relay.ts
- queue-subscription-explorer parse
- broker/store.ts
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
- Module 3: Queue Copy
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Provisioned Mode
- module-registry-plugin.mjs
- managed-service.ts
- variants.test.ts
- signsIn
- vitest.config.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- scripts/vite-build.mjs wrapper
- backupService
- Data Store: Planning Brief
- ConnectionsModule Test Suite
- live
- boot
- panel.ts
- gateway/index.ts
- connection-management/module.test.ts
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- state.ts
- userRec

## God Nodes (most connected - your core abstractions)
1. `vitest` - 98 edges
2. `newManagedEnv()` - 67 edges
3. `expect()` - 67 edges
4. `AppContext` - 64 edges
5. `store` - 63 edges
6. `loadModuleDOM()` - 60 edges
7. `quietLogger()` - 53 edges
8. `createEventBus()` - 47 edges
9. `managedHandler` - 38 edges
10. `Architecture` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `The Module Contract` --references--> `PwaModule`  [INFERRED]
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

## Communities (167 total, 29 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.05
Nodes (70): adminHandler, hostedInfo, createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures() (+62 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.09
Nodes (39): formatBytes(), DestType, applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), DestConnStatus, DestSummary (+31 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.09
Nodes (34): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+26 more)

### Community 3 - "entitled"
Cohesion: 0.39
Nodes (6): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance(), TestMatchGlob_NoOverlap()

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "managed-panel.ts"
Cohesion: 0.13
Nodes (17): ConnectionCredentials, SempConfig, SempContext, MANAGED_ERROR_CODES, ManagedError, managedErrorMessage(), MESSAGES, Method (+9 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "rbac.ts"
Cohesion: 0.12
Nodes (30): Locked decisions, filterSempFetch(), isListedVpn(), SempFetch, ALWAYS_VISIBLE, canOperate(), explainAccess(), findQueueRow() (+22 more)

### Community 9 - "smf_test.go"
Cohesion: 0.16
Nodes (16): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation(), TestSMF_JoinsTheSocketToTheBroker() (+8 more)

### Community 10 - "store"
Cohesion: 0.11
Nodes (25): 7. Phases, connName(), brokerTarget, clientRec, connRec, connsDoc, flexStr, permsToRows() (+17 more)

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

### Community 16 - "time.Time"
Cohesion: 0.11
Nodes (20): monthSlot(), nextRun(), TestBackup_NextRun(), bucket, newDialer(), newRateWindow(), smfPathFor(), dialer (+12 more)

### Community 17 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+12 more)

### Community 18 - "tls.go"
Cohesion: 0.15
Nodes (17): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+9 more)

### Community 19 - "store_test.go"
Cohesion: 0.19
Nodes (13): countAdmins(), newStoreWithFixtures(), TestStore_CRUD_RaceSafe(), TestStore_DeleteConnection(), TestStore_DeleteUser_LastAdmin(), TestStore_IsAdmin(), TestStore_ListConnections_ReturnsDeepCopy(), TestStore_ListUsers_ReturnsDeepCopy() (+5 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.12
Nodes (10): modules, MOCK_REDIRECTS table, ADMIN_CSS_VARIANTS, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "routes.test.ts"
Cohesion: 0.09
Nodes (32): Fault, QUEUE_STATE, QueueFixture, QueueState, resetScenario(), ScenarioState, seedState(), setBrokers() (+24 more)

### Community 24 - "sockets.test.ts"
Cohesion: 0.09
Nodes (27): buildMessage(), AuthenticationScheme, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName, QueueType (+19 more)

### Community 25 - "pages_test.go"
Cohesion: 0.17
Nodes (24): managedEnv, expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), TestAuthPages_UnauthenticatedBudget() (+16 more)

### Community 26 - "backup.go"
Cohesion: 0.05
Nodes (30): diffByName(), sameRecord(), sealBackup(), mustSealer(), yamlAsJSON(), backupEnvelope, backupFileInfo, backupKDF (+22 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (41): playwright-core, ALIAS, askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+33 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.09
Nodes (34): RFC-5280, bitString(), bool(), BROKER_FIELDS, certificate(), commonName(), derLength(), derTime() (+26 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.13
Nodes (16): RFC-2606, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES, findMarkers() (+8 more)

### Community 30 - "contract_test.go"
Cohesion: 0.14
Nodes (16): checkModuleIDs(), contractNormalize(), decodeAny(), loadContractSeed(), newContractEnv(), readContract(), TestContract_Cases(), TestContract_SeedSettingsAreTheGateways() (+8 more)

### Community 31 - "relay_test.go"
Cohesion: 0.15
Nodes (20): errReader, fakeBroker, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+12 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (60): BackupKey, BackupProblem, BackupSchedule, canonConn(), canonRows(), canonUser(), concat(), connName() (+52 more)

### Community 33 - "configfile.go"
Cohesion: 0.06
Nodes (67): TestParseCIDRs(), flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeysAndSkipsHostPaths(), TestBackup_WithHostPathsCoversTheHostOnlyKeys(), withHostPaths(), configPath() (+59 more)

### Community 34 - "core/types.ts"
Cohesion: 0.04
Nodes (62): SolaceConfig, createEventBus(), createManagedProfile(), DialConn, SempTarget, SolaceDial, SolaceTarget, AppState (+54 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "access_test.go"
Cohesion: 0.14
Nodes (30): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+22 more)

### Community 37 - "required"
Cohesion: 0.19
Nodes (10): pickQueue() reusable picker, attachBackdropClose(), required(), AccountControl, AccountUser, createAccountControl(), createConnTabs(), render() (+2 more)

### Community 38 - "expect"
Cohesion: 0.10
Nodes (59): decodeTo(), expectInvalid(), managedEnv, jsonBody(), TestBackupAPI_AdminsOnly(), TestBackupAPI_Export(), TestBackupAPI_ImportMergeAndTheCallersOwnSession(), TestBackupAPI_ImportRefusals() (+51 more)

### Community 39 - "session.ts"
Cohesion: 0.10
Nodes (20): getQueue(), removeMessage(), createEmitter(), MockEmitter, DIRECT_BROKER, scenario, createQueueBrowser(), interval() (+12 more)

### Community 40 - "installDirect"
Cohesion: 0.06
Nodes (17): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, 4. Shape after the rework, ManagedProfileStore, AppContext (+9 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (14): mergeByName(), decodeJSON(), decodeJSONLimit(), writeError(), writeInvalid(), writeJSON(), writeRateLimited(), managedHandler (+6 more)

### Community 42 - "logger.ts"
Cohesion: 0.08
Nodes (22): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+14 more)

### Community 43 - "vitest"
Cohesion: 0.09
Nodes (15): vitest, BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), INPUT_DEBOUNCE_MS, config, ui, QueueDiscoveryModule, ui (+7 more)

### Community 44 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (16): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx(), NO_SESSION (+8 more)

### Community 45 - "runDirectChecks"
Cohesion: 0.14
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "backup/module.ts"
Cohesion: 0.07
Nodes (43): BackupModule, describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad(), RFC-3339, WEEKDAYS (+35 more)

### Community 48 - "access-test.ts"
Cohesion: 0.11
Nodes (23): AccessExplanation, AccessLevel, QGlob, moduleLabel(), SeedUser, ACCESS_PROMPT, AccessTest, createAccessTest() (+15 more)

### Community 49 - "authPages"
Cohesion: 0.10
Nodes (21): clientOf(), activeSession, authPages, pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+13 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.20
Nodes (21): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+13 more)

### Community 51 - "Queue Discovery Screenshot"
Cohesion: 0.24
Nodes (13): Queue Discovery Header, Message VPN Selector (default), Open in Browser Button, Queue List Dropdown (test), Queue List Refresh Button, Queue Discovery Screenshot, Sidebar Navigation (Connections, Queue Discovery, Queue Browser), Status Footer (Client / SEMP indicators) (+5 more)

### Community 52 - "Categories of Ignored Code"
Cohesion: 0.15
Nodes (13): Categories of Ignored Code, Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements, Category 2 (obsolete): Disabled Button Wiring in Queue Browser, Category 3: DOMContentLoaded in jsdom (`main.ts`), Category 4: Solace Callback Null Guards, Category 5: Redundant Safety Guards, Category 6: safeSet Inner Function — historical, Category 7 (obsolete): `else if` Chain Bytecode Artifacts (+5 more)

### Community 53 - "SolaceMessageUtility — Test Suite Technical Report"
Cohesion: 0.17
Nodes (12): Approach: Isolation-First with Shared Infrastructure, code:block1 (Statements : 100% (4024/4024)), Core Philosophy: Mock the Platform, Test the Logic, Executive Summary, SolaceMessageUtility — Test Suite Technical Report, Summary of v8 Ignore Philosophy, Table of Contents, Testing Methodology (+4 more)

### Community 56 - "sealer"
Cohesion: 0.26
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeRole, usersDoc

### Community 57 - "runChecks"
Cohesion: 0.19
Nodes (19): configureGateway(), errorCode(), createCookieJar(), jsonFindings(), parseSetCookie(), sealedHeaderProblem(), sessionCookieProblems(), sweepSecrets() (+11 more)

### Community 58 - "service-verify.ts"
Cohesion: 0.10
Nodes (26): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+18 more)

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
Cohesion: 0.23
Nodes (21): docOf(), glob(), port(), createRouter(), handle(), match(), error(), glob() (+13 more)

### Community 63 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "demo-flow.test.ts"
Cohesion: 0.18
Nodes (15): ManagedDemo, GatewayPages, connect(), expectSignedOut(), MODULES, navItems(), openDemo(), openOwnRow() (+7 more)

### Community 66 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 67 - "utils.ts"
Cohesion: 0.10
Nodes (28): DEFAULT_CONFIG, validateConfig(), ConnectionConfig, isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL (+20 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.19
Nodes (15): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), newManagedHandler(), rowsToPerms(), userToOutput() (+7 more)

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

### Community 78 - "createRowList"
Cohesion: 0.15
Nodes (10): createRowList(), addRow(), clear(), count(), readRows(), sync(), RowField, RowList (+2 more)

### Community 79 - "settings.ts"
Cohesion: 0.14
Nodes (23): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), ipv6Groups(), ipv6String(), Kind (+15 more)

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
Cohesion: 0.11
Nodes (26): config, hostedEnv(), levelName(), loadConfig(), main(), newRootHandler(), parseHosted(), parseLogLevel() (+18 more)

### Community 93 - "newFakeClock"
Cohesion: 0.24
Nodes (21): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+13 more)

### Community 94 - "gateway-settings/module.ts"
Cohesion: 0.14
Nodes (8): createGate(), GateOptions, ModuleGate, FIELDS, GatewaySettingsModule, Input, Kind, Tree

### Community 95 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (24): Add-LogText(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image(), Task-build() (+16 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (50): Coverage Requirements, Running Tests, Test Architecture, Test Setup (`tests/setup.ts`), Testing, Writing Tests for a New Module, cloneMessage(), createSolacePublisher() (+42 more)

### Community 100 - "backup_test.go"
Cohesion: 0.10
Nodes (44): newBackupKey(), openBackup(), backupFixtureFrom(), envelope(), newBackupFixture(), reseal(), sampleBackup(), sealed() (+36 more)

### Community 101 - "package.json"
Cohesion: 0.11
Nodes (17): allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name, private, type (+9 more)

### Community 104 - "server.test.ts"
Cohesion: 0.17
Nodes (19): listQueues(), listVpns(), brokerVpns(), MOCK_HOST, VPNS, handleSemp(), hostedResponse(), installMockServer() (+11 more)

### Community 105 - "log/slog.Logger"
Cohesion: 0.14
Nodes (12): configSource, buildManagedRoutes(), newManagedRouting(), managedRoutes, openSocket, newSEMPRelay(), sempRelay, newSMFGate() (+4 more)

### Community 106 - "createManagedPanel"
Cohesion: 0.15
Nodes (21): isSessionEnded(), errMessage(), createManagedPanel(), adopt(), clearSession(), connectFailed(), connectSemp(), connectSolace() (+13 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "queue-subscription-explorer/service.ts"
Cohesion: 0.15
Nodes (16): Contents, Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app), visibleQueueRows() (+8 more)

### Community 111 - "queue-source.ts"
Cohesion: 0.07
Nodes (29): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+21 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "pages.test.ts"
Cohesion: 0.28
Nodes (13): createPages(), field(), frame(), hide(), open(), showLogin(), showPassword(), submitted() (+5 more)

### Community 119 - "user-management/module.test.ts"
Cohesion: 0.16
Nodes (18): GLOB_FIELDS, NO_OPERATE, NO_READ_ONLY, UserManagementModule, ADMIN, CHOICES, clickRow(), el() (+10 more)

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.20
Nodes (10): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 8. Constraints that stay, 9. Risks (+2 more)

### Community 121 - "gateway/types.ts"
Cohesion: 0.11
Nodes (23): DialResponse, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteUserResult, entitled() (+15 more)

### Community 122 - "loadStore"
Cohesion: 0.20
Nodes (21): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), blockWrites(), bootstrapFixture(), envOf(), newStoreFixture(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange() (+13 more)

### Community 123 - "routes.test.ts"
Cohesion: 0.15
Nodes (11): productSources(), readSource(), REPO_ROOT, backup, conns, DAILY, managed, Outcome (+3 more)

### Community 124 - "Developer Guide"
Cohesion: 0.14
Nodes (14): Adding a New Module, Build commands, Build internals, Build-time feature flags, Code Conventions, Contents, Developer Guide, DOM Access (+6 more)

### Community 125 - "relay.ts"
Cohesion: 0.09
Nodes (29): delay(), connsProblem(), declRefused(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+21 more)

### Community 127 - "broker/store.ts"
Cohesion: 0.16
Nodes (26): allQueues(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), MockQueue, PAYLOAD_TEMPLATES, publish(), queues (+18 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.06
Nodes (51): Circular Dependency Resolution, escapeHtml(), DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, showPayload(), QueueBrowserModule (+43 more)

### Community 132 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination credentials (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 136 - "Provisioned Mode"
Cohesion: 0.13
Nodes (15): Administer, Back up and restore, Configure, Connection modes, Contents, Environment variables, How it works, Provisioned Mode (+7 more)

### Community 137 - "module-registry-plugin.mjs"
Cohesion: 0.35
Nodes (9): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant(), stripComments() (+1 more)

### Community 138 - "managed-service.ts"
Cohesion: 0.07
Nodes (18): managedRequest(), ManagedResult, ManagedDialer, createManagedService(), ManagedConnection, ManagedProfile, ManagedService, ManagedVpn (+10 more)

### Community 139 - "variants.test.ts"
Cohesion: 0.13
Nodes (12): QueueCopyModule, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, MODULE_ENTRIES (+4 more)

### Community 140 - "signsIn"
Cohesion: 0.33
Nodes (7): signsIn(), TestStore_CheckPassword(), TestStore_DeleteUser(), TestStore_PersistErrorLeavesMemoryUnchanged(), TestStore_SetPassword(), TestStore_UpsertUser_EditWithoutPasswordKeepsHashAndFlag(), TestStore_UpsertUser_NewPasswordOrAdminFlagDropsSessions()

### Community 141 - "vitest.config.ts"
Cohesion: 0.40
Nodes (3): moduleRegistryPlugin(), TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 142 - "boot.managed.ts"
Cohesion: 0.12
Nodes (28): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+20 more)

### Community 152 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, jsdom, playwright-core, @types/node, typescript, vite, vite-plugin-singlefile, vitest (+1 more)

### Community 154 - "backupService"
Cohesion: 0.13
Nodes (12): backupName(), newBackupService(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem(), backupRun, backupSchedule, backupService, ownershipHint() (+4 more)

### Community 157 - "Data Store: Planning Brief"
Cohesion: 0.17
Nodes (11): Code to read, Constraints, Contents, Data Store: Planning Brief, Ground rules for the session, How the store works today, Options to compare, Questions to settle with the user first (+3 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "live"
Cohesion: 0.13
Nodes (15): clientIP(), normalizeAddr(), prefixContains(), withClient(), accessConfig, clientCtxKey, live, hostOnlyKeyNames() (+7 more)

### Community 162 - "boot"
Cohesion: 0.50
Nodes (4): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), src/main.ts application bootstrap

### Community 163 - "panel.ts"
Cohesion: 0.20
Nodes (23): ManagedPanelDeps, managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_PANEL_SEEN_KEY, el() (+15 more)

### Community 164 - "gateway/index.ts"
Cohesion: 0.06
Nodes (38): BACKUP_ITER, BackupDeps, BackupsState, createGateway(), changePassword(), signIn(), DEMO_GATEWAY_MARKER, Gateway (+30 more)

### Community 165 - "connection-management/module.test.ts"
Cohesion: 0.18
Nodes (14): iconButton(), ICONS, ConnectionManagementModule, NO_VPNS, VPN_FIELDS, ADMIN, CONNS, el() (+6 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Administration (`/solAdmin`), Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview (+10 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "state.ts"
Cohesion: 0.15
Nodes (21): resolveDestCredModes(), CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, resetTransientState(), syncDestFormFromSnapshot() (+13 more)

### Community 171 - "userRec"
Cohesion: 0.22
Nodes (9): sessionEnders(), userName(), parseRelayPath(), safeSegment(), relayPath, hasControl(), validateUsers(), validName() (+1 more)

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **159 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1036 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Adding a New Module` connect `Developer Guide` to `logger.ts`, `required`, `expect`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Are the 45 inferred relationships involving `newManagedEnv()` (e.g. with `TestBackupAPI_AdminsOnly()` and `TestBackupAPI_Export()`) actually correct?**
  _`newManagedEnv()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.05335628227194492 - nodes in this community are weakly interconnected._
- **Why does `moduleCatalog()` connect `expect` to `configfile.go`, `access_test.go`, `net/http.ResponseWriter`, `store`, `Developer Guide`, `contract_test.go`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `expect()` (e.g. with `TestBackupAPI_AdminsOnly()` and `TestBackupAPI_Export()`) actually correct?**
  _`expect()` has 46 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._