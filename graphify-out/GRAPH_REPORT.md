# Graph Report - smu-dirty  (2026-11-09)

## Corpus Check
- 285 files · ~458,470 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 27 file(s) not represented in the graph (top: .css 20, (none) 6, .dockerignore 1)

## Summary
- 3271 nodes · 8681 edges · 172 communities (144 shown, 28 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 863 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `95ef2b99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- connections/module.ts
- entitled
- semp-client Test Suite
- Architecture
- user-management/module.ts
- core event-bus
- rbac.ts
- smf_test.go
- store
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- dial.go
- scripts
- tls.go
- store_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- Key Concepts
- pages_test.go
- go_pkg_strings
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- testing.T
- relay_test.go
- setup.ts
- configfile.go
- core/types.ts
- Filter Messages Dialog
- go_pkg_testing
- runChecks
- expect
- session.ts
- access_test.go
- net/http.ResponseWriter
- logger.ts
- vitest
- managed-panel.test.ts
- runDirectChecks
- ui.selectMessage
- dest-provisioned.test.ts
- access-test.ts
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- .ServeHTTP
- tests variants
- sealer
- session
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
- connection-management/module.ts
- Kernel.installModule
- sempContext Test Suite
- dev.ps1
- Features
- ui-modal.test.ts
- go_pkg_context
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
- core/types.ts
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- connection-management/service.ts
- user-management/module.test.ts
- Managed mode rework: direction and decisions
- gateway/types.ts
- loadStore
- state.ts
- Developer Guide
- validate.ts
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
- ManagedResult
- variants.test.ts
- relay.ts
- dial_test.go
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- SolaceClient
- go_pkg_os
- seed.ts
- main
- Data Store: Planning Brief
- ref_node_path
- ConnectionsModule Test Suite
- throttle
- user-management/module.ts
- main.ts
- panel.ts
- gateway/index.ts
- npm-audit-gate.mjs
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- user-management/service.ts
- sockets.ts
- newManagedEnvFrom

## God Nodes (most connected - your core abstractions)
1. `vitest` - 94 edges
2. `AppContext` - 62 edges
3. `store` - 61 edges
4. `loadModuleDOM()` - 58 edges
5. `expect()` - 55 edges
6. `newManagedEnv()` - 54 edges
7. `quietLogger()` - 50 edges
8. `createEventBus()` - 45 edges
9. `Architecture` - 37 edges
10. `logger` - 34 edges

## Surprising Connections (you probably didn't know these)
- `2. Decisions taken` --references--> `AppState`  [INFERRED]
  docs/rbac-rework-plan.md → src/core/types.ts
- `Open hardening items (input to the connections rework)` --references--> `AppState`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/types.ts
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

## Communities (172 total, 28 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.09
Nodes (42): serve(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie(), firstSegment(), isProxyPath(), joinHostPort() (+34 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.09
Nodes (39): formatBytes(), DestType, applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), DestConnStatus, DestSummary (+31 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.07
Nodes (37): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, buildBrokerUrl() (+29 more)

### Community 3 - "entitled"
Cohesion: 0.39
Nodes (6): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance(), TestMatchGlob_NoOverlap()

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "user-management/module.ts"
Cohesion: 0.06
Nodes (32): SempConfig, SempContext, SolaceConfig, MANAGED_ERROR_CODES, ManagedError, managedErrorMessage(), MESSAGES, Method (+24 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "rbac.ts"
Cohesion: 0.11
Nodes (28): Contents, Locked decisions, Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app) (+20 more)

### Community 9 - "smf_test.go"
Cohesion: 0.16
Nodes (16): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation(), TestSMF_JoinsTheSocketToTheBroker() (+8 more)

### Community 10 - "store"
Cohesion: 0.11
Nodes (29): brokerTarget, clientRec, connRec, connsDoc, contractStores, flexStr, permsToRows(), permRow (+21 more)

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

### Community 16 - "dial.go"
Cohesion: 0.18
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 17 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+12 more)

### Community 18 - "tls.go"
Cohesion: 0.09
Nodes (24): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value, appendPEMCerts() (+16 more)

### Community 19 - "store_test.go"
Cohesion: 0.14
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
Cohesion: 0.10
Nodes (31): Fault, resetScenario(), scenario, ScenarioState, seedState(), setBrokers(), VpnFixture, call() (+23 more)

### Community 24 - "Key Concepts"
Cohesion: 0.25
Nodes (7): AppContext (Dependency Injection), Circular Dependency Resolution, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, wire()

### Community 25 - "pages_test.go"
Cohesion: 0.23
Nodes (21): expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), TestAuthPages_UnauthenticatedBudget(), TestGateAdmin() (+13 more)

### Community 26 - "go_pkg_strings"
Cohesion: 0.06
Nodes (16): clientCtxKey, contractCase, contractCases, contractEnv, contractSession, contractStep, hostedInfo, main() (+8 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (28): ALIAS, askLine(), askSecret(), basic(), broker, brokerSecrets, checkedAlias(), closers (+20 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.09
Nodes (34): RFC-5280, bitString(), bool(), BROKER_FIELDS, certificate(), commonName(), derLength(), derTime() (+26 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.13
Nodes (16): RFC-2606, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES, findMarkers() (+8 more)

### Community 30 - "testing.T"
Cohesion: 0.16
Nodes (21): contractNormalize(), decodeAny(), managedEnv, loadContractSeed(), readContract(), TestContract_Cases(), TestContract_SeedSettingsAreTheGateways(), assertNoTempFiles() (+13 more)

### Community 31 - "relay_test.go"
Cohesion: 0.14
Nodes (21): errReader, fakeBroker, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+13 more)

### Community 32 - "setup.ts"
Cohesion: 0.08
Nodes (31): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+23 more)

### Community 33 - "configfile.go"
Cohesion: 0.08
Nodes (47): checkModuleIDs(), configPath(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), envOverrides(), fileConfigFromConfig(), intInRange() (+39 more)

### Community 34 - "core/types.ts"
Cohesion: 0.05
Nodes (48): 4. Shape after the rework, ConnectionCredentials, createEventBus(), createManagedProfile(), AppContext, AppState, BusEvents, EventBus (+40 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "go_pkg_testing"
Cohesion: 0.14
Nodes (15): TestSeedConfigFile_WriteFailureIsActionable(), hostedHandler, newLive(), liveWith(), TestLive_ApplySwapsEveryLiveKey(), defaultConfig(), TestBuildManagedRoutes_StoreErrorIsReturned(), TestNewManagedRouting_DisabledIsNil() (+7 more)

### Community 37 - "runChecks"
Cohesion: 0.16
Nodes (21): configureGateway(), errorCode(), createCookieJar(), findTokens(), jsonFindings(), parseSetCookie(), sealedHeaderProblem(), sessionCookieProblems() (+13 more)

### Community 38 - "expect"
Cohesion: 0.20
Nodes (32): errorCode(), expect(), newManagedEnv(), TestManagedAPI_AdminOnly(), TestManagedAPI_CrossOriginStateChangeRefused(), TestManagedAPI_DeleteConnection(), TestManagedAPI_DeleteUser(), TestManagedAPI_ListConnectionsNeverSendsSecrets() (+24 more)

### Community 39 - "session.ts"
Cohesion: 0.07
Nodes (29): createEmitter(), MockEmitter, QUEUE_STATE, createQueueBrowser(), interval(), pump(), MockQueueBrowser, AuthenticationScheme (+21 more)

### Community 40 - "access_test.go"
Cohesion: 0.16
Nodes (27): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+19 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.18
Nodes (10): decodeJSON(), writeError(), writeInvalid(), writeJSON(), writeRateLimited(), managedHandler, clearSessionCookie(), sessionOf() (+2 more)

### Community 42 - "logger.ts"
Cohesion: 0.10
Nodes (20): DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN, Kernel (+12 more)

### Community 43 - "vitest"
Cohesion: 0.07
Nodes (20): pickQueue() reusable picker, vitest, attachBackdropClose(), required(), INPUT_DEBOUNCE_MS, AccountControl, AccountUser, createAccountControl() (+12 more)

### Community 44 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (16): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx(), NO_SESSION (+8 more)

### Community 45 - "runDirectChecks"
Cohesion: 0.16
Nodes (20): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+12 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "dest-provisioned.test.ts"
Cohesion: 0.12
Nodes (14): QueueCopyModule, { destSempConnect, destSolConnect }, { destSempHooks }, DIALER, dialMock, El, { pickQueueMock }, PROFILE (+6 more)

### Community 48 - "access-test.ts"
Cohesion: 0.15
Nodes (14): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+6 more)

### Community 49 - "authPages"
Cohesion: 0.17
Nodes (12): clientOf(), activeSession, authPages, pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+4 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.19
Nodes (22): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+14 more)

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
Cohesion: 0.14
Nodes (7): deadHijacker, fileResolvable(), hasExt(), serveIndex(), TestRecordingResponseWriter_DefaultStatus(), recordingResponseWriter, pipe()

### Community 56 - "sealer"
Cohesion: 0.16
Nodes (11): TestContract_Validation(), parseStoreKey(), checkPasswordPolicy(), TestCheckPasswordPolicy(), sealer, adminSeed(), bootstrapUsers(), newSealer() (+3 more)

### Community 57 - "session"
Cohesion: 0.19
Nodes (6): session, expired(), sessionCtxKey, sessionLimits, sessions, userCounter

### Community 58 - "service-verify.ts"
Cohesion: 0.11
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
Cohesion: 0.16
Nodes (25): createRouter(), handle(), match(), error(), glob(), Handler, invalid(), noContent (+17 more)

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
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 67 - "utils.ts"
Cohesion: 0.10
Nodes (29): DEFAULT_CONFIG, validateConfig(), ConnectionConfig, generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec() (+21 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.26
Nodes (13): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), rowsToPerms(), userToOutput(), modulesJSON (+5 more)

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
Cohesion: 0.18
Nodes (18): cidrList(), clone(), connModesProblem(), createSettings(), ipv6Groups(), ipv6String(), Kind, normalize() (+10 more)

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
Cohesion: 0.13
Nodes (24): config, hostedEnv(), levelName(), TestLevelName(), envOr(), loadConfig(), newRootHandler(), parseHosted() (+16 more)

### Community 93 - "newFakeClock"
Cohesion: 0.24
Nodes (22): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessionOf_ContextRoundTrip(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+14 more)

### Community 94 - "connection-management/module.ts"
Cohesion: 0.08
Nodes (22): createGate(), GateOptions, ModuleGate, showToast(), ToastType, ConnectionManagementModule, NO_VPNS, VPN_FIELDS (+14 more)

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
Cohesion: 0.17
Nodes (20): createInitialState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate(), handleModalStart(), openCopyModal() (+12 more)

### Community 100 - "go_pkg_context"
Cohesion: 0.22
Nodes (12): newContractEnv(), hasher, newHasher(), parsePasswordHash(), TestHasher_CostIsReadFromStoredHash(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches(), TestHasher_RoundTripAndFormat() (+4 more)

### Community 101 - "package.json"
Cohesion: 0.11
Nodes (17): allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name, private, type (+9 more)

### Community 104 - "server.test.ts"
Cohesion: 0.16
Nodes (21): listQueues(), listVpns(), brokerVpns(), delay(), MOCK_HOST, VPNS, handleSemp(), hostedResponse() (+13 more)

### Community 105 - "log/slog.Logger"
Cohesion: 0.07
Nodes (26): accessConfig, adminHandler, configSource, live, hostOnlyKeyNames(), restartOnlyKeyNames(), liveSettings, loginLimits (+18 more)

### Community 106 - "createManagedPanel"
Cohesion: 0.14
Nodes (21): errMessage(), createManagedPanel(), adopt(), clearSession(), connectFailed(), connectSemp(), connectSolace(), doConnect() (+13 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "queue-subscription-explorer/service.ts"
Cohesion: 0.27
Nodes (8): extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), createService(), fetchAllSubscriptions(), PAGE_SIZE, SubFetchPage

### Community 111 - "core/types.ts"
Cohesion: 0.07
Nodes (27): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+19 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.16
Nodes (15): GatewaySettingsModule, ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx() (+7 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "connection-management/service.ts"
Cohesion: 0.18
Nodes (10): managedRequest(), connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, createSettingsService(), GatewaySettings, SettingsView (+2 more)

### Community 119 - "user-management/module.test.ts"
Cohesion: 0.21
Nodes (14): ADMIN, CHOICES, clickRow(), el(), hidden(), listed(), makeCtx(), rowCount() (+6 more)

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.18
Nodes (11): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 7. Phases, 8. Constraints that stay (+3 more)

### Community 121 - "gateway/types.ts"
Cohesion: 0.18
Nodes (15): AccessExplanation, QGlob, anyMatch(), cloneConn(), createStore(), DeleteUserResult, entitled(), ModuleSettings (+7 more)

### Community 122 - "loadStore"
Cohesion: 0.24
Nodes (17): loadStore(), bootstrapFixture(), envOf(), newStoreFixture(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(), TestLoadStore_BootstrapRefusesBadSources(), TestLoadStore_EmptyOrMissingConnectionsFileYieldsNoBrokers() (+9 more)

### Community 123 - "state.ts"
Cohesion: 0.11
Nodes (24): resolveConnTabs(), resolveDestCredModes(), SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget (+16 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (19): Adding a New Module, Build commands, Build internals, Build-time feature flags, Code Conventions, Contents, Coverage Requirements, Developer Guide (+11 more)

### Community 125 - "validate.ts"
Cohesion: 0.18
Nodes (15): GatewaySeed, BROKER_RULE, connectionProblem(), hasControl(), isIPv4(), isIPv6(), portProblem(), USERNAME_RULE (+7 more)

### Community 127 - "broker/store.ts"
Cohesion: 0.11
Nodes (40): allQueues(), buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key(), loadStore() (+32 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.06
Nodes (54): Writing Tests for a New Module, readModuleTemplate(), escapeHtml(), BLOB_URL_REVOKE_DELAY_MS, DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT (+46 more)

### Community 132 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination credentials (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 136 - "Provisioned Mode"
Cohesion: 0.14
Nodes (14): Administer, Configure, Connection modes, Contents, Environment variables, How it works, Provisioned Mode, Security checklist (+6 more)

### Community 137 - "module-registry-plugin.mjs"
Cohesion: 0.38
Nodes (8): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readVariant(), stripComments(), injectModuleTemplates()

### Community 138 - "ManagedResult"
Cohesion: 0.17
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 139 - "variants.test.ts"
Cohesion: 0.14
Nodes (11): ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, MODULE_ENTRIES, ACTIVE_MODULES (+3 more)

### Community 140 - "relay.ts"
Cohesion: 0.22
Nodes (13): declRefused(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse(), relay(), RELAY_PREFIX (+5 more)

### Community 141 - "dial_test.go"
Cohesion: 0.25
Nodes (9): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt(), parseSMFPath(), TestParseSMFPath() (+1 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.12
Nodes (27): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+19 more)

### Community 152 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, jsdom, playwright-core, @types/node, typescript, vite, vite-plugin-singlefile, vitest (+1 more)

### Community 154 - "go_pkg_os"
Cohesion: 0.17
Nodes (12): createExclusive(), loadStoreKey(), ownershipHint(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+4 more)

### Community 155 - "seed.ts"
Cohesion: 0.19
Nodes (13): QueueFixture, connection(), DEMO_ACCOUNTS, DEMO_TOPOLOGY, demoSeed(), everything, pw(), btn() (+5 more)

### Community 156 - "main"
Cohesion: 0.22
Nodes (13): playwright-core, browserOn(), COMPOSE, describeBroker(), insecure(), hostRootBundle(), maskSecrets(), loadPlaywright() (+5 more)

### Community 157 - "Data Store: Planning Brief"
Cohesion: 0.17
Nodes (11): Code to read, Constraints, Contents, Data Store: Planning Brief, Ground rules for the session, How the store works today, Options to compare, Questions to settle with the user first (+3 more)

### Community 158 - "ref_node_path"
Cohesion: 0.18
Nodes (6): moduleRegistryPlugin(), productSources(), readSource(), REPO_ROOT, TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "throttle"
Cohesion: 0.29
Nodes (9): bucket, failures, throttle, clientKey(), failureWait(), hasRoom(), recordFailure(), TestClientKey() (+1 more)

### Community 161 - "user-management/module.ts"
Cohesion: 0.33
Nodes (6): iconButton(), ICONS, GLOB_FIELDS, NO_OPERATE, NO_READ_ONLY, UserManagementModule

### Community 162 - "main.ts"
Cohesion: 0.16
Nodes (8): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), boot(), src/main.ts application bootstrap, kernel, modules, injectModuleTemplates plugin

### Community 163 - "panel.ts"
Cohesion: 0.21
Nodes (22): managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_PANEL_SEEN_KEY, el(), fillDirectForm() (+14 more)

### Community 164 - "gateway/index.ts"
Cohesion: 0.07
Nodes (40): ManagedPanelDeps, createGateway(), changePassword(), signIn(), DEMO_GATEWAY_MARKER, Gateway, GatewayFaults, GatewaySnapshot (+32 more)

### Community 165 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Administration (`/solAdmin`), Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview (+10 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "user-management/service.ts"
Cohesion: 0.33
Nodes (6): createUserMgmtService(), ManagedUser, UserList, userPath(), UserPayload, PAYLOAD

### Community 170 - "sockets.ts"
Cohesion: 0.33
Nodes (5): createSockets(), GatewaySockets, OpenSocket, refused(), SocketGate

### Community 171 - "newManagedEnvFrom"
Cohesion: 0.53
Nodes (4): managedEnv, named(), newManagedEnvFrom(), newManagedEnvWith()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **157 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 998 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `7. Phases` connect `Managed mode rework: direction and decisions` to `proxy_test.go`, `configfile.go`, `connections/module.ts`, `loadModuleDOM`, `store`?**
  _High betweenness centrality (0.191) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppContext` (e.g. with `AppContext (Dependency Injection)` and `Factory Pattern`) actually correct?**
  _`AppContext` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.09250693802035152 - nodes in this community are weakly interconnected._
- **Why does `Adding a New Module` connect `Developer Guide` to `configfile.go`, `logger.ts`, `vitest`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `loadModuleDOM()` (e.g. with `Writing Tests for a New Module` and `7. Phases`) actually correct?**
  _`loadModuleDOM()` has 2 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._