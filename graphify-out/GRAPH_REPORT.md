# Graph Report - smu-dirty  (2026-11-07)

## Corpus Check
- 279 files · ~445,725 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 27 file(s) not represented in the graph (top: .css 20, (none) 6, .dockerignore 1)

## Summary
- 3191 nodes · 8484 edges · 171 communities (142 shown, 29 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 848 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0037a27a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- connections/module.ts
- go_pkg_strings
- semp-client Test Suite
- Architecture
- managed-panel.test.ts
- core event-bus
- core/types.ts
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
- newStoreWithFixtures
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- contract_test.go
- createConnTabs
- go_pkg_net_http
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- broker/store.ts
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
- password.go
- loadModuleDOM
- fixtures.ts
- ui.selectMessage
- store_test.go
- user-management/module.ts
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- pipe
- tests variants
- managed-panel.ts
- pages_test.go
- service-verify.ts
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- service-copy.ts
- User Guide
- Managed Variant (RBAC)
- installDirect
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
- settings.ts
- server/index.ts
- DOM Template System
- Cross-Module Event Flow
- Micro-Kernel with Dependency Injection
- Kernel Test Suite
- demo-flow.test.ts
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- CSS Organization
- Module Isolation
- Coverage Results
- live
- newFakeClock
- required
- Kernel.installModule
- sempContext Test Suite
- dev.ps1
- Features
- setup.ts
- ui-modal.test.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- relay.ts
- session
- createManagedPanel
- Deployment Options
- utils.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- solace-client.ts
- pages.test.ts
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- sealer
- wireUiEvents
- Managed mode rework: direction and decisions
- gateway/types.ts
- dest-provisioned.test.ts
- state.ts
- Developer Guide
- ManagedPanel
- queue-subscription-explorer parse
- Demo Mode (`mock.html`)
- tests core/event-bus
- tests core/hosted
- tests core/logger
- state.js
- router.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- createUiEvents
- module-registry-plugin.mjs
- ManagedResult
- variants.test.ts
- Module 2: Queue Browser
- Managed Connections (RBAC) — Design & Threat Model
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- managed-profile.ts
- npm-audit-gate.mjs
- createGateway
- entitled
- connections/module.test.ts
- ref_node_path
- ConnectionsModule Test Suite
- throttle
- managed-api.ts
- modules
- panel.ts
- gateway/index.ts
- main
- collectDetails
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- gateway-settings/service.ts
- Module 1: Connections

## God Nodes (most connected - your core abstractions)
1. `vitest` - 92 edges
2. `AppContext` - 62 edges
3. `store` - 61 edges
4. `expect()` - 56 edges
5. `newManagedEnv()` - 55 edges
6. `loadModuleDOM()` - 55 edges
7. `quietLogger()` - 48 edges
8. `createEventBus()` - 45 edges
9. `Architecture` - 37 edges
10. `logger` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `2. Decisions taken` --references--> `AppState`  [INFERRED]
  docs/rbac-rework-plan.md → src/core/types.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Setup (`tests/setup.ts`)` --references--> `createSolaceMock()`  [INFERRED]
  docs/developer-guide.md → tests/setup.ts
- `Adding a New Module` --references--> `moduleCatalog()`  [INFERRED]
  docs/developer-guide.md → go-web-proxy/configfile.go

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (171 total, 29 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.06
Nodes (62): adminHandler, hostedInfo, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), serve(), validateConnModes(), accessLog() (+54 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (34): formatBytes(), applyDestPrefill(), applyDestType(), applySourceReadonly(), DestConnStatus, renderDestSummary(), renderModalInitial(), renderProgress() (+26 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.20
Nodes (16): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+8 more)

### Community 3 - "go_pkg_strings"
Cohesion: 0.08
Nodes (28): assertNoTempFiles(), TestWriteFileAtomic_ModeIsCallerChosen(), TestWriteFileAtomic_ParentIsAFile(), TestWriteFileAtomic_RenameOntoDirectoryFails(), TestWriteFileAtomic_WritesWithModeAndLeavesNoTemp(), writeFileAtomic(), createExclusive(), loadStoreKey() (+20 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (17): ConnectionsModule, account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx() (+9 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "core/types.ts"
Cohesion: 0.06
Nodes (44): Locked decisions, filterSempFetch(), SempFetch, ALWAYS_VISIBLE, canOperate(), isQueueVisible(), isVpnVisible(), matchesAny() (+36 more)

### Community 9 - "smf_test.go"
Cohesion: 0.16
Nodes (16): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation(), TestSMF_JoinsTheSocketToTheBroker() (+8 more)

### Community 10 - "store"
Cohesion: 0.11
Nodes (27): 7. Phases, brokerTarget, clientRec, connRec, connsDoc, flexStr, permRow, profileResponse (+19 more)

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
Cohesion: 0.20
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 17 - "scripts"
Cohesion: 0.10
Nodes (20): scripts, audit:gate, build, build:admin, build:all, build:managed, build:managed-demo, build:mock (+12 more)

### Community 18 - "tls.go"
Cohesion: 0.11
Nodes (17): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+9 more)

### Community 19 - "newStoreWithFixtures"
Cohesion: 0.17
Nodes (22): countAdmins(), newStoreWithFixtures(), signsIn(), TestStore_CheckPassword(), TestStore_CRUD_RaceSafe(), TestStore_DeleteConnection(), TestStore_DeleteUser(), TestStore_DeleteUser_LastAdmin() (+14 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.12
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, ADMIN_CSS_VARIANTS, appVersion, DEMO_BOOTS, MockRedirect, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "routes.test.ts"
Cohesion: 0.11
Nodes (27): MANAGED_ERROR_CODES, Fault, QueueState, resetScenario(), scenario, ScenarioState, seedState(), setBrokers() (+19 more)

### Community 24 - "contract_test.go"
Cohesion: 0.20
Nodes (14): contractNormalize(), decodeAny(), loadContractSeed(), newContractEnv(), readContract(), TestContract_Cases(), TestContract_SeedSettingsAreTheGateways(), TestContract_Validation() (+6 more)

### Community 25 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 26 - "go_pkg_net_http"
Cohesion: 0.08
Nodes (19): openSocket, isShowRPC(), newSEMPRelay(), newUserCounter(), parseRelayPath(), safeSegment(), relayPath, sempRelay (+11 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.08
Nodes (27): ALIAS, broker, brokerSecrets, connectBrowser(), cookies, DETAILS_FILE, GATEWAY, findTokens() (+19 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.09
Nodes (34): RFC-5280, bitString(), bool(), BROKER_FIELDS, certificate(), commonName(), derLength(), derTime() (+26 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.13
Nodes (16): RFC-2606, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES, findMarkers() (+8 more)

### Community 30 - "broker/store.ts"
Cohesion: 0.13
Nodes (34): allQueues(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), listQueues(), listVpns(), MockQueue (+26 more)

### Community 31 - "relay_test.go"
Cohesion: 0.17
Nodes (19): errReader, fakeBroker, answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers(), TestRelay_InFlightCapPerUser() (+11 more)

### Community 32 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+6 more)

### Community 33 - "configfile.go"
Cohesion: 0.07
Nodes (59): checkModuleIDs(), configPath(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), envOverrides(), fileConfigFromConfig(), intInRange() (+51 more)

### Community 34 - "core/types.ts"
Cohesion: 0.04
Nodes (50): AppContext (Dependency Injection), Circular Dependency Resolution, Factory Pattern, Key Concepts, 4. Shape after the rework, vitest, createEventBus(), ManagedProfileStore (+42 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "sockets.test.ts"
Cohesion: 0.09
Nodes (28): buildMessage(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueType (+20 more)

### Community 37 - "runChecks"
Cohesion: 0.20
Nodes (18): bindQueue(), configureGateway(), errorCode(), createCookieJar(), jsonFindings(), sealedHeaderProblem(), sweepSecrets(), noteCookies() (+10 more)

### Community 38 - "expect"
Cohesion: 0.12
Nodes (43): managedEnv, dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), errorCode(), expect() (+35 more)

### Community 39 - "session.ts"
Cohesion: 0.10
Nodes (19): removeMessage(), createEmitter(), MockEmitter, MOCK_HOST, createQueueBrowser(), interval(), pump(), MockQueueBrowser (+11 more)

### Community 40 - "access_test.go"
Cohesion: 0.17
Nodes (24): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+16 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.17
Nodes (11): decodeJSON(), newManagedHandler(), writeError(), writeInvalid(), writeJSON(), writeRateLimited(), managedEndpoints, managedHandler (+3 more)

### Community 42 - "logger.ts"
Cohesion: 0.07
Nodes (26): EventBus (Cross-Module Communication), The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO (+18 more)

### Community 43 - "password.go"
Cohesion: 0.14
Nodes (14): hasher, checkPasswordPolicy(), newHasher(), parsePasswordHash(), TestCheckPasswordPolicy(), TestHasher_CostIsReadFromStoredHash(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches() (+6 more)

### Community 44 - "loadModuleDOM"
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 45 - "fixtures.ts"
Cohesion: 0.22
Nodes (11): QueueFixture, VpnFixture, connection(), DEMO_TOPOLOGY, demoSeed(), everything, pw(), btn() (+3 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "store_test.go"
Cohesion: 0.24
Nodes (16): loadStore(), bootstrapFixture(), envOf(), newStoreFixture(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(), TestLoadStore_BootstrapRefusesBadSources(), TestLoadStore_EmptyOrMissingConnectionsFileYieldsNoBrokers() (+8 more)

### Community 48 - "user-management/module.ts"
Cohesion: 0.12
Nodes (21): GLOB_FIELDS, NO_OPERATE, NO_READ_ONLY, createUserMgmtService(), ManagedUser, ModuleChoices, userPath(), UserPayload (+13 more)

### Community 49 - "authPages"
Cohesion: 0.14
Nodes (13): clientOf(), activeSession, authPages, pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+5 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.10
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 51 - "Queue Discovery Screenshot"
Cohesion: 0.24
Nodes (13): Queue Discovery Header, Message VPN Selector (default), Open in Browser Button, Queue List Dropdown (test), Queue List Refresh Button, Queue Discovery Screenshot, Sidebar Navigation (Connections, Queue Discovery, Queue Browser), Status Footer (Client / SEMP indicators) (+5 more)

### Community 52 - "Categories of Ignored Code"
Cohesion: 0.15
Nodes (13): Categories of Ignored Code, Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements, Category 2 (obsolete): Disabled Button Wiring in Queue Browser, Category 3: DOMContentLoaded in jsdom (`main.ts`), Category 4: Solace Callback Null Guards, Category 5: Redundant Safety Guards, Category 6: safeSet Inner Function — historical, Category 7 (obsolete): `else if` Chain Bytecode Artifacts (+5 more)

### Community 53 - "SolaceMessageUtility — Test Suite Technical Report"
Cohesion: 0.17
Nodes (12): Approach: Isolation-First with Shared Infrastructure, code:block1 (Statements : 100% (4024/4024)), Core Philosophy: Mock the Platform, Test the Logic, Executive Summary, SolaceMessageUtility — Test Suite Technical Report, Summary of v8 Ignore Philosophy, Table of Contents, Testing Methodology (+4 more)

### Community 56 - "managed-panel.ts"
Cohesion: 0.13
Nodes (14): ConnectionCredentials, SempConfig, SempContext, buildBrokerUrl(), createServiceSemp(), connect(), relayErrorText(), SempClient (+6 more)

### Community 57 - "pages_test.go"
Cohesion: 0.20
Nodes (23): expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), TestAuthPages_UnauthenticatedBudget(), TestAuthPages_UnknownPathIs404() (+15 more)

### Community 58 - "service-verify.ts"
Cohesion: 0.17
Nodes (16): escapeXml(), ACCUMULATE_IDLE_MS, compareMsgIds(), emptyResult(), fetchNewestMsgIdViaSempV1(), msgIdToString(), normalizeAccessType(), parseSempV1Response() (+8 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "service-copy.ts"
Cohesion: 0.22
Nodes (9): BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), StopReason, getOriginalIdHint() (+1 more)

### Community 63 - "User Guide"
Cohesion: 0.08
Nodes (24): Administration (`/solAdmin`), Caching, Confirm Queue Copy modal, Demo accounts, Demo controls, Destination credentials (managed sessions), Destination target, Filter syntax (+16 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "installDirect"
Cohesion: 0.11
Nodes (9): DirectConnection, installDirect(), checkConnection(), validateClientNameId(), validateSolace(), createOptionalField(), OptionalField, OptionalFieldElements (+1 more)

### Community 66 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 67 - "utils.ts"
Cohesion: 0.14
Nodes (19): DEFAULT_CONFIG, validateConfig(), ConnectionConfig, errMessage(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect() (+11 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.25
Nodes (14): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), permsToRows(), rowsToPerms(), userToOutput() (+6 more)

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

### Community 78 - "settings.ts"
Cohesion: 0.17
Nodes (19): cidrList(), clone(), connModesProblem(), createSettings(), ipv6Groups(), ipv6String(), Kind, normalize() (+11 more)

### Community 79 - "server/index.ts"
Cohesion: 0.29
Nodes (12): delay(), handleSemp(), hostedResponse(), installMockServer(), json(), MockRoute, MockServerOptions, readBody() (+4 more)

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

### Community 84 - "demo-flow.test.ts"
Cohesion: 0.18
Nodes (15): ManagedDemo, GatewayPages, connect(), expectSignedOut(), MODULES, navItems(), openDemo(), openOwnRow() (+7 more)

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

### Community 92 - "live"
Cohesion: 0.06
Nodes (41): clientIP(), normalizeAddr(), prefixContains(), withClient(), accessConfig, clientCtxKey, config, configSource (+33 more)

### Community 93 - "newFakeClock"
Cohesion: 0.26
Nodes (21): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessionOf_ContextRoundTrip(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+13 more)

### Community 94 - "required"
Cohesion: 0.05
Nodes (35): pickQueue() reusable picker, createGate(), GateOptions, ModuleGate, createRowList(), addRow(), clear(), count() (+27 more)

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
Cohesion: 0.16
Nodes (19): cacheElements(), tests main, makeOriginal(), sessionWithBrowser(), msg(), setup(), makeCtx(), PRIMARY (+11 more)

### Community 100 - "ui-modal.test.ts"
Cohesion: 0.17
Nodes (20): createInitialState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate(), handleModalStart(), openCopyModal() (+12 more)

### Community 101 - "package.json"
Cohesion: 0.11
Nodes (17): allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name, private, type (+9 more)

### Community 104 - "relay.ts"
Cohesion: 0.12
Nodes (26): declRefused(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse(), relay(), RELAY_PREFIX (+18 more)

### Community 105 - "session"
Cohesion: 0.36
Nodes (5): session, expired(), sessionCtxKey, sessionLimits, sessions

### Community 106 - "createManagedPanel"
Cohesion: 0.22
Nodes (20): isSessionEnded(), createManagedPanel(), adopt(), clearSession(), connectFailed(), connectSemp(), connectSolace(), doConnect() (+12 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "utils.ts"
Cohesion: 0.13
Nodes (20): matchString(), QueueSubscriptionExplorerModule, subMatch(), vpnQueueMatch(), extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse() (+12 more)

### Community 111 - "solace-client.ts"
Cohesion: 0.24
Nodes (10): gatewayWsUrl(), isHosted(), createServiceSolace(), cleanup(), connect(), disconnect(), init(), SolaceClient (+2 more)

### Community 112 - "pages.test.ts"
Cohesion: 0.19
Nodes (18): ManagedPanelDeps, Gateway, createPages(), field(), frame(), hide(), open(), showLogin() (+10 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "sealer"
Cohesion: 0.26
Nodes (5): sealer, bootstrapUsers(), storeHeader(), storeRole, usersDoc

### Community 119 - "wireUiEvents"
Cohesion: 0.35
Nodes (11): resolveDestCredModes(), wireUiEvents(), disposeDestSempConnection(), disposeDestSolConnection(), offeredCredModes(), publishesProvisioned(), refreshDestCredUi(), refreshDestProvisionedVpns() (+3 more)

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.20
Nodes (9): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 8. Constraints that stay, 9. Risks (+1 more)

### Community 121 - "gateway/types.ts"
Cohesion: 0.14
Nodes (18): QGlob, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteUserResult, entitled(), ModuleSettings (+10 more)

### Community 122 - "dest-provisioned.test.ts"
Cohesion: 0.12
Nodes (13): { destSempConnect, destSolConnect }, { destSempHooks }, DIALER, dialMock, El, { pickQueueMock }, PROFILE, provisionedSecondary() (+5 more)

### Community 123 - "state.ts"
Cohesion: 0.13
Nodes (15): SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, DestType, QueueCopyState (+7 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (18): Adding a New Module, Build commands, Build internals, Build-time feature flags, Code Conventions, Coverage Requirements, Developer Guide, DOM Access (+10 more)

### Community 127 - "Demo Mode (`mock.html`)"
Cohesion: 0.33
Nodes (6): Connecting, Demo controls, Demo Mode (`mock.html`), Opening the demo, The demo topology, What is not in the demo

### Community 131 - "state.js"
Cohesion: 0.08
Nodes (49): Writing Tests for a New Module, escapeHtml(), BLOB_URL_REVOKE_DELAY_MS, DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, showPayload() (+41 more)

### Community 132 - "router.ts"
Cohesion: 0.21
Nodes (21): createRouter(), handle(), match(), error(), glob(), Handler, invalid(), noContent (+13 more)

### Community 136 - "createUiEvents"
Cohesion: 0.14
Nodes (3): createUiEvents(), handleBindPickClick(), makeUiEvents()

### Community 137 - "module-registry-plugin.mjs"
Cohesion: 0.35
Nodes (9): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant(), stripComments() (+1 more)

### Community 138 - "ManagedResult"
Cohesion: 0.17
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 139 - "variants.test.ts"
Cohesion: 0.14
Nodes (11): ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, MODULE_ENTRIES, ACTIVE_MODULES (+3 more)

### Community 140 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 141 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.25
Nodes (7): Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app), SubscriptionSource

### Community 142 - "boot.managed.ts"
Cohesion: 0.13
Nodes (27): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+19 more)

### Community 152 - "devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, jsdom, playwright-core, @types/node, typescript, vite, vite-plugin-singlefile, vitest (+1 more)

### Community 153 - "managed-profile.ts"
Cohesion: 0.11
Nodes (16): SolaceConfig, createManagedProfile(), DialConn, ManagedDialer, SempDial, SempTarget, SolaceDial, SolaceTarget (+8 more)

### Community 154 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 155 - "createGateway"
Cohesion: 0.13
Nodes (14): createGateway(), changePassword(), signIn(), toResponse(), DEMO_ACCOUNTS, createThrottle(), Failures, LoginLimits (+6 more)

### Community 156 - "entitled"
Cohesion: 0.39
Nodes (6): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance(), TestMatchGlob_NoOverlap()

### Community 157 - "connections/module.test.ts"
Cohesion: 0.18
Nodes (6): config, ConnectionsModule, createConnectionsDOM(), createTestContext(), setupConnectedFlow(), setupSempInstall()

### Community 158 - "ref_node_path"
Cohesion: 0.18
Nodes (6): moduleRegistryPlugin(), productSources(), readSource(), REPO_ROOT, TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "throttle"
Cohesion: 0.29
Nodes (9): bucket, failures, throttle, clientKey(), failureWait(), hasRoom(), recordFailure(), TestClientKey() (+1 more)

### Community 161 - "managed-api.ts"
Cohesion: 0.16
Nodes (15): ManagedError, managedErrorMessage(), managedRequest(), MESSAGES, Method, reportManagedFailure(), SIGNED_OUT_TOAST_MS, connPath() (+7 more)

### Community 162 - "modules"
Cohesion: 0.25
Nodes (6): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), src/main.ts application bootstrap, modules, injectModuleTemplates plugin

### Community 163 - "panel.ts"
Cohesion: 0.20
Nodes (23): managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, el() (+15 more)

### Community 164 - "gateway/index.ts"
Cohesion: 0.12
Nodes (19): DEMO_GATEWAY_MARKER, GatewayFaults, GatewaySnapshot, PageResult, RouterDeps, RouterFaults, createSessions(), GatewaySessions (+11 more)

### Community 165 - "main"
Cohesion: 0.20
Nodes (14): playwright-core, browserOn(), check(), COMPOSE, describeBroker(), insecure(), hostRootBundle(), maskSecrets() (+6 more)

### Community 166 - "collectDetails"
Cohesion: 0.25
Nodes (9): askLine(), askSecret(), checkedAlias(), collectDetails(), expect(), detailsFileText(), hostAliasProblem(), parseDetailsFile() (+1 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "gateway-settings/service.ts"
Cohesion: 0.40
Nodes (3): createSettingsService(), SettingsView, SETTINGS

### Community 170 - "Module 1: Connections"
Cohesion: 0.40
Nodes (5): Connection Profiles, Module 1: Connections, SEMP Connection (Management API), Solace Client Connection (Web Messaging), Status Indicators

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **157 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 966 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `moduleCatalog()` connect `configfile.go` to `net/http.ResponseWriter`, `store`, `Developer Guide`, `expect`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppContext` (e.g. with `AppContext (Dependency Injection)` and `Factory Pattern`) actually correct?**
  _`AppContext` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `managedEnv` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.05727605727605728 - nodes in this community are weakly interconnected._
- **Why does `Adding a New Module` connect `Developer Guide` to `configfile.go`, `logger.ts`, `required`?**
  _High betweenness centrality (0.213) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `expect()` (e.g. with `TestDial_ConnectsAreRateLimitedPerUser()` and `TestDial_IssuesTheVPNCredential()`) actually correct?**
  _`expect()` has 35 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._