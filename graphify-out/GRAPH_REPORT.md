# Graph Report - smu-dirty  (2026-11-01)

## Corpus Check
- 227 files · ~377,660 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: .css 18, (none) 6, .dockerignore 1)

## Summary
- 2538 nodes · 6429 edges · 167 communities (135 shown, 32 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 693 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `81dda2a3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- loadModuleDOM
- live
- semp-client Test Suite
- Architecture
- managed-panel.test.ts
- core event-bus
- tls.go
- logger.ts
- store
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- store_test.go
- scripts
- store.ts
- managed-panel.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- wireUiEvents
- Kernel
- testing.T
- ui-modal.test.ts
- go_pkg_strings
- main.ts
- npm-audit-gate.mjs
- managed-service.ts
- vite.config.ts
- connection-management/module.ts
- configfile.go
- panel.ts
- Filter Messages Dialog
- utils.ts
- verifyViaSempV1
- newManagedEnv
- dest-provisioned.test.ts
- check-docs-secrecy.mjs
- net/http.ResponseWriter
- parseProxyPath
- hasher
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
- SempContext
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
- createConnTabs
- managed-session-store.ts
- createManagedPanel
- Deployment Options
- managed-api.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- connections/module.ts
- required
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- state.js
- proxy.go
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
- service-copy.ts
- queue-source.test.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- core/types.ts
- Demo Mode (`mock.html`)
- state.js
- variants.test.ts
- admin-session.test.ts
- queue-source.ts
- MockEmitter
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- queue-subscription-explorer/module.ts
- registry.ts
- semp-client.ts
- managed-service.ts
- Managed Connections (RBAC) — Design & Threat Model
- module-gate/index.ts
- Kernel.installModule
- ConnectionsModule Test Suite
- Module 3: Queue Copy
- ManagedStore
- Key Concepts
- ManagedPanel
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)

## God Nodes (most connected - your core abstractions)
1. `vitest` - 78 edges
2. `newManagedEnv()` - 61 edges
3. `AppContext` - 61 edges
4. `store` - 60 edges
5. `loadModuleDOM()` - 51 edges
6. `createEventBus()` - 45 edges
7. `quietLogger()` - 40 edges
8. `Architecture` - 37 edges
9. `expect()` - 35 edges
10. `logger` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `The Module Contract` --references--> `PwaModule`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Setup (`tests/setup.ts`)` --references--> `createSolaceMock()`  [INFERRED]
  docs/developer-guide.md → tests/setup.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (167 total, 32 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.16
Nodes (24): accessLog(), dropSessionCookie(), newAdminHandler(), newPWAHandler(), newReverseProxy(), recordingResponseWriter (status/bytes/hijack), TestAccessLog_RecordsStatusAndBytes(), TestAccessLog_SkipsHosted() (+16 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (35): formatBytes(), applyDestPrefill(), applyDestType(), applySourceReadonly(), DestConnStatus, CopyUiServices, PrimarySnapshot, renderDestSummary() (+27 more)

### Community 2 - "loadModuleDOM"
Cohesion: 0.08
Nodes (26): Writing Tests for a New Module, ui, htmlCache, loadModuleDOM(), ROOT, ADMIN, CONNS, el() (+18 more)

### Community 3 - "live"
Cohesion: 0.13
Nodes (11): configSource, live, hostOnlyKeyNames(), newManagedHandler(), buildManagedRoutes(), newManagedRouting(), newManagedRouting(), managedEnv (+3 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "managed-panel.test.ts"
Cohesion: 0.16
Nodes (14): connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx(), NO_SESSION, OK() (+6 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "tls.go"
Cohesion: 0.11
Nodes (17): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+9 more)

### Community 9 - "logger.ts"
Cohesion: 0.19
Nodes (11): DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN, getLogLevel() (+3 more)

### Community 10 - "store"
Cohesion: 0.10
Nodes (30): clientRec, connRec, connsDoc, flexStr, permsToRows(), permRow, profileResponse, respBroker (+22 more)

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

### Community 16 - "store_test.go"
Cohesion: 0.13
Nodes (36): TestBuildManagedRoutes_StoreErrorIsReturned(), newCapturingLogger(), loadStore(), blockWrites(), bootstrapFixture(), envOf(), newStoreFixture(), newStoreWithFixtures() (+28 more)

### Community 17 - "scripts"
Cohesion: 0.11
Nodes (18): scripts, audit:gate, build, build:admin, build:all, build:managed, build:mock, build:no-payload (+10 more)

### Community 18 - "store.ts"
Cohesion: 0.19
Nodes (22): allQueues(), CONTENT_TYPES, findQueueAnyVpn(), getQueue(), key(), MockQueue, PAYLOAD_TEMPLATES, publish() (+14 more)

### Community 19 - "managed-panel.ts"
Cohesion: 0.16
Nodes (18): Locked decisions, filterSempFetch(), SempFetch, ALWAYS_VISIBLE, canOperate(), isQueueVisible(), isVpnVisible(), matchesAny() (+10 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.21
Nodes (11): activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, moduleRegistryPlugin(), readModuleTemplate(), readVariant() (+3 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "wireUiEvents"
Cohesion: 0.35
Nodes (11): resolveDestCredModes(), wireUiEvents(), disposeDestSempConnection(), disposeDestSolConnection(), offeredCredModes(), publishesProvisioned(), refreshDestCredUi(), refreshDestProvisionedVpns() (+3 more)

### Community 24 - "Kernel"
Cohesion: 0.26
Nodes (3): Kernel, isModuleVisible(), PwaModule

### Community 25 - "testing.T"
Cohesion: 0.24
Nodes (23): expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), TestAuthPages_UnauthenticatedBudget(), TestAuthPages_UnknownPathIs404() (+15 more)

### Community 26 - "ui-modal.test.ts"
Cohesion: 0.11
Nodes (30): createInitialState(), cacheElements(), SourceAccess, tests main, makeOriginal(), sessionWithBrowser(), msg(), setup() (+22 more)

### Community 27 - "go_pkg_strings"
Cohesion: 0.10
Nodes (14): assertNoTempFiles(), TestWriteFileAtomic_ModeIsCallerChosen(), TestWriteFileAtomic_ParentIsAFile(), TestWriteFileAtomic_RenameOntoDirectoryFails(), TestWriteFileAtomic_WritesWithModeAndLeavesNoTemp(), writeFileAtomic(), TestBuildManagedRoutes_GatesByMode(), anyMatch() (+6 more)

### Community 28 - "main.ts"
Cohesion: 0.16
Nodes (8): dist/js/solclient.js (Solace JS SDK), setup.sh solclient.js downloader, boot(), boot(), src/main.ts application bootstrap, kernel, modules, injectModuleTemplates plugin

### Community 29 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 30 - "managed-service.ts"
Cohesion: 0.15
Nodes (12): allowScripts, esbuild@0.25.12, name, private, type, version, jsdom, @types/node (+4 more)

### Community 31 - "vite.config.ts"
Cohesion: 0.12
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, MOCK_REDIRECTS, MockRedirect, vite-env.d.ts (__APP_VERSION__), readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 32 - "connection-management/module.ts"
Cohesion: 0.26
Nodes (8): managedRequest(), ConnectionManagementModule, VPN_FIELDS, connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 33 - "configfile.go"
Cohesion: 0.06
Nodes (59): TestParseCIDRs(), checkModuleIDs(), configPath(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), envOverrides(), fileConfigFromConfig() (+51 more)

### Community 34 - "panel.ts"
Cohesion: 0.25
Nodes (15): requireActive(), boot(), installSdk(), removeVendorBanner(), seed(), button(), connectionReference(), copyable() (+7 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.25
Nodes (12): generateUuid(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchString(), matchStringRegexCache, matchTopicLevels(), moduleLabel() (+4 more)

### Community 37 - "verifyViaSempV1"
Cohesion: 0.24
Nodes (10): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+2 more)

### Community 38 - "newManagedEnv"
Cohesion: 0.17
Nodes (33): errorCode(), expect(), named(), newManagedEnv(), TestManagedAPI_AdminOnly(), TestManagedAPI_CrossOriginStateChangeRefused(), TestManagedAPI_DeleteConnection(), TestManagedAPI_DeleteUser() (+25 more)

### Community 39 - "dest-provisioned.test.ts"
Cohesion: 0.09
Nodes (25): 2. Decisions taken, dec, enc, fromB64(), importSeed(), pack(), toB64(), unpack() (+17 more)

### Community 40 - "check-docs-secrecy.mjs"
Cohesion: 0.31
Nodes (7): ALLOWED, collect(), main(), RULES, scanDocs(), scanText(), TARGETS

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.20
Nodes (8): decodeJSON(), writeError(), writeInvalid(), writeJSON(), writeRateLimited(), managedHandler, clearSessionCookie(), sessionOf()

### Community 42 - "parseProxyPath"
Cohesion: 0.11
Nodes (18): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), contextWithTarget(), firstSegment(), hostedHandler (/hosted endpoint), isProxyPath(), joinHostPort() (+10 more)

### Community 43 - "hasher"
Cohesion: 0.28
Nodes (11): hasher, newHasher(), parsePasswordHash(), TestHasher_CostIsReadFromStoredHash(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches(), TestHasher_RoundTripAndFormat(), TestHasher_UnknownUserUsesDummy() (+3 more)

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
Cohesion: 0.14
Nodes (21): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, config, prefixStrings() (+13 more)

### Community 48 - "access_test.go"
Cohesion: 0.29
Nodes (17): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+9 more)

### Community 49 - ".submitLogin"
Cohesion: 0.15
Nodes (12): clientOf(), activeSession, authPages, pageData, loginURL(), newAuthPages(), passwordURL(), safeNext() (+4 more)

### Community 50 - "connections/types.ts"
Cohesion: 0.22
Nodes (7): DEFAULT_CONFIG, validateConfig(), ConnectionConfig, ConnectionCredentials, isValidHost(), isValidPort(), config

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

### Community 56 - "connections/module.ts"
Cohesion: 0.24
Nodes (13): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+5 more)

### Community 57 - "user-management/module.ts"
Cohesion: 0.28
Nodes (9): QGlob, GLOB_FIELDS, createUserMgmtService(), ManagedUser, ModuleChoices, UserList, userPath(), UserPayload (+1 more)

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

### Community 62 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+6 more)

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
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.26
Nodes (13): apiError, clientJSON, connJSON, connSaveJSON, connToOutput(), rowsToPerms(), userToOutput(), modulesJSON (+5 more)

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

### Community 84 - "SempContext"
Cohesion: 0.17
Nodes (15): SempContext, createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues (+7 more)

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
Nodes (23): envOr(), loadConfig(), main(), newRootHandler(), parseLogLevel(), printVersionIfRequested(), serve(), route() (+15 more)

### Community 93 - "newFakeClock"
Cohesion: 0.25
Nodes (20): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+12 more)

### Community 94 - "session"
Cohesion: 0.11
Nodes (9): checkPasswordPolicy(), TestCheckPasswordPolicy(), session, expired(), TestSessionOf_ContextRoundTrip(), withSession(), sessionCtxKey, sessions (+1 more)

### Community 95 - "createUiEvents"
Cohesion: 0.14
Nodes (3): createUiEvents(), applyFilters(), makeUiEvents()

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (22): Add-LogText(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image(), Task-build() (+14 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "gateway-settings/module.ts"
Cohesion: 0.18
Nodes (9): FIELDS, GatewaySettingsModule, Input, Kind, Tree, createSettingsService(), GatewaySettings, SettingsView (+1 more)

### Community 100 - "installDirect"
Cohesion: 0.16
Nodes (5): DirectConnection, installDirect(), checkConnection(), validateClientNameId(), validateSolace()

### Community 101 - "server/index.ts"
Cohesion: 0.25
Nodes (14): listQueues(), listVpns(), delay(), handleSemp(), hostedResponse(), installMockServer(), json(), readBody() (+6 more)

### Community 104 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 105 - "managed-session-store.ts"
Cohesion: 0.14
Nodes (8): SempConfig, SolaceConfig, SempDial, SempTarget, SolaceDial, SolaceTarget, SempClient, SolaceClient

### Community 106 - "createManagedPanel"
Cohesion: 0.26
Nodes (18): errMessage(), createManagedPanel(), adopt(), clearSession(), connectSemp(), connectSolace(), doConnect(), doLogout() (+10 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "managed-api.ts"
Cohesion: 0.20
Nodes (12): ManagedError, managedErrorMessage(), MESSAGES, Method, reportManagedFailure(), SIGNED_OUT_TOAST_MS, showToast(), ToastType (+4 more)

### Community 111 - "connections/module.ts"
Cohesion: 0.26
Nodes (12): isHosted(), createServiceSolace(), cleanup(), connect(), disconnect(), init(), SolaceConnectionHooks, tlsHandshakeProbe() (+4 more)

### Community 112 - "required"
Cohesion: 0.11
Nodes (10): Adding a New Module, pickQueue() reusable picker, createRowList(), readRows(), RowField, RowList, attachBackdropClose(), required() (+2 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "state.js"
Cohesion: 0.16
Nodes (15): vitest, escapeHtml(), BLOB_URL_REVOKE_DELAY_MS, showPayload(), QueueBrowserModule, defaultActiveFilters(), state, els (+7 more)

### Community 119 - "proxy.go"
Cohesion: 0.10
Nodes (15): adminHandler, hostedHandler, hostedInfo, fileResolvable(), hasExt(), newHostedHandler(), serveIndex(), TestHostedHandler_Disabled() (+7 more)

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
Cohesion: 0.24
Nodes (4): ManagedResult, ConnMgmtService, SettingsService, UserMgmtService

### Community 124 - "Developer Guide"
Cohesion: 0.12
Nodes (17): Build commands, Build internals, Build-time feature flags, Code Conventions, Coverage Requirements, Developer Guide, DOM Access, Error Handling (+9 more)

### Community 125 - "module-gate/index.ts"
Cohesion: 0.25
Nodes (8): devDependencies, jsdom, @types/node, typescript, vite, vite-plugin-singlefile, vitest, @vitest/coverage-v8

### Community 127 - "ui-modal.test.ts"
Cohesion: 0.13
Nodes (20): SolacePublisher, runCopyJob(), CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, DestType (+12 more)

### Community 131 - "service-copy.ts"
Cohesion: 0.22
Nodes (8): BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, StopReason, getOriginalIdHint(), CopyJob

### Community 132 - "queue-source.test.ts"
Cohesion: 0.17
Nodes (5): State, QueueSource, FetchPage, ALLOW_ALL, SCOPED

### Community 136 - "core/types.ts"
Cohesion: 0.07
Nodes (29): 4. Shape after the rework, createEventBus(), logger, AppContext, AppState, BusEvents, EventBus, AdminLoginModule (+21 more)

### Community 137 - "Demo Mode (`mock.html`)"
Cohesion: 0.33
Nodes (6): Connecting, Demo controls, Demo Mode (`mock.html`), Opening the demo, The demo topology, What is not in the demo

### Community 138 - "state.js"
Cohesion: 0.11
Nodes (24): Circular Dependency Resolution, DEFAULT_MAX_MESSAGES_PER_QUEUE, icons, MAX_BROWSER_BINDINGS, MAX_MESSAGES_PER_QUEUE_LIMIT, createService(), createBrowser(), disconnectBrowser() (+16 more)

### Community 139 - "variants.test.ts"
Cohesion: 0.22
Nodes (8): ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, REPO

### Community 140 - "admin-session.test.ts"
Cohesion: 0.24
Nodes (10): UserManagementModule, CHOICES, expectSignedOut(), hidden(), installAdminApp(), { me, logout, umSvc, showToast }, openAdminApp(), q() (+2 more)

### Community 141 - "queue-source.ts"
Cohesion: 0.16
Nodes (13): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+5 more)

### Community 152 - "queue-subscription-explorer/module.ts"
Cohesion: 0.16
Nodes (17): QueueSubscriptionExplorerModule, subMatch(), vpnQueueMatch(), extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), SubscriptionRow (+9 more)

### Community 154 - "semp-client.ts"
Cohesion: 0.36
Nodes (5): buildBrokerUrl(), createServiceSemp(), connect(), SempConnectionHooks, normalizeUrlPath()

### Community 155 - "managed-service.ts"
Cohesion: 0.25
Nodes (5): createManagedService(), ManagedConnection, ManagedProfile, ManagedService, ManagedVpn

### Community 156 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.25
Nodes (7): Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (managed by the admin modules; never hand-edit in production), SubscriptionSource

### Community 157 - "module-gate/index.ts"
Cohesion: 0.29
Nodes (3): createGate(), GateOptions, ModuleGate

### Community 158 - "Kernel.installModule"
Cohesion: 0.29
Nodes (4): Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start()

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination credentials (managed sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 162 - "Key Concepts"
Cohesion: 0.33
Nodes (5): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **152 isolated node(s):** `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node`, `@vitest/coverage-v8`, `jsdom` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 826 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `moduleCatalog()` connect `configfile.go` to `required`, `Managed mode rework: direction and decisions`, `newManagedEnv`, `net/http.ResponseWriter`?**
  _High betweenness centrality (0.324) - this node is a cross-community bridge._
- **Are the 39 inferred relationships involving `newManagedEnv()` (e.g. with `TestBuildManagedRoutes_GatesByMode()` and `clientACL()`) actually correct?**
  _`newManagedEnv()` has 39 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/solace/go-web-proxy`, `managedEnv`, `@types/node` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `queue-copy/ui.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09966777408637874 - nodes in this community are weakly interconnected._
- **Why does `Adding a New Module` connect `required` to `Kernel`, `configfile.go`, `Developer Guide`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `AppContext` (e.g. with `AppContext (Dependency Injection)` and `Factory Pattern`) actually correct?**
  _`AppContext` has 4 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._