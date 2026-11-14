# Graph Report - smu-dirty  (2026-11-14)

## Corpus Check
- 325 files · ~622,756 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: .css 23, (none) 6, .dockerignore 1)

## Summary
- 4209 nodes · 11872 edges · 195 communities (165 shown, 30 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 1301 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `06f7d5d7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- testing.T
- queue-copy/ui.ts
- connections/module.ts
- tests
- semp-client Test Suite
- Architecture
- contract_test.go
- core event-bus
- notification-center/index.ts
- relay_test.go
- state.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- broker/store.ts
- scripts
- ManagedResult
- user-management/module.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- fixtures.ts
- Kernel.installModule
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- ui-modal.ts
- design
- backup.ts
- demo-flow.test.ts
- module-events.test.ts
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- access_test.go
- copy-flow.test.ts
- tls_test.go
- net/http.ResponseWriter
- throttle
- row-list/index.ts
- managed-panel.test.ts
- ui-modal.test.ts
- ui.selectMessage
- audit_test.go
- dest-provisioned.test.ts
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- contract.test.ts
- tests variants
- queue-source.ts
- runChecks
- testing.T
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- Data Store: Planning Brief
- log/slog.Logger
- Managed Variant (RBAC)
- testing.T
- rbac.test.ts
- go_pkg_path_filepath
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
- backup.go
- solace-publisher.ts
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
- main_test.go
- newFakeClock
- proxy.go
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- createManagedPanel
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- provisioned-connection/index.ts
- socketRegistry
- createVpnSwitch
- Deployment Options
- router.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- rbac.ts
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- pages.ts
- user-management/module.test.ts
- Managed mode rework: direction and decisions
- gateway/index.ts
- semp-discovery.ts
- testing.T
- Developer Guide
- Module 2: Queue Browser
- queue-subscription-explorer parse
- relay.ts
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
- solace-client.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Provisioned Mode
- queue-copy/ui-events.ts
- backup_api_test.go
- variants.test.ts
- build
- backup_test.go
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- settings.ts
- store
- CR-0068 [minor] [new] The copy/move engine is never run against a realistic SDK (neither the demo broker nor the real SDK); its tests hand-drive mock handlers
- service-verify.ts
- module-registry-plugin.mjs
- correctness
- ConnectionsModule Test Suite
- fixtures.ts
- observability
- createUiEvents
- panel.ts
- registry.ts
- managed-api.ts
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- resilience
- backup.go
- fileutil_test.go
- Findings by area
- settings_test.go
- quality
- access-test.ts
- mustPWA
- newReverseProxy
- access.go
- net/http.Handler
- Cutting a release
- request
- tsconfig.test.json
- semp-v1.ts
- serve
- pipe
- compose.ts
- .ServeHTTP
- dial_test.go
- queue-subscription-explorer/ui.ts
- Managed Connections (RBAC) — Design & Threat Model
- optional-field.test.ts
- interfaces
- createConnTabs

## God Nodes (most connected - your core abstractions)
1. `vitest` - 109 edges
2. `newManagedEnv()` - 90 edges
3. `store` - 69 edges
4. `AppContext` - 65 edges
5. `loadModuleDOM()` - 62 edges
6. `quietLogger()` - 60 edges
7. `completeContext()` - 50 edges
8. `createEventBus()` - 49 edges
9. `tests` - 49 edges
10. `managedHandler` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Threat model (honest, documented)` --references--> `filterSempFetch()`  [INFERRED]
  docs/rbac-variant-plan.md → src/core/managed-semp-filter.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
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

## Communities (195 total, 30 thin omitted)

### Community 0 - "testing.T"
Cohesion: 0.08
Nodes (39): TestRecoverPanics_LetsAbortHandlerThrough(), TestRecoverPanics_LogsAndAnswers500(), gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), validateConnModes(), accessLog(), contextWithTarget() (+31 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (40): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DestConnStatus (+32 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.05
Nodes (67): 7. Phases, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG (+59 more)

### Community 3 - "tests"
Cohesion: 0.04
Nodes (45): CR-0065 [minor] [new] The 100% web coverage thresholds are never enforced by CI or the tag pipeline; only a local `cov` run checks them, CR-0066 [minor] [new] The Go race detector is never run, so the gateway's only race test asserts nothing, CR-0067 [major] [new] Verify and copy are never tested with createQueueBrowser throwing; the call is unguarded and the modal drops the rejection, CR-0069 [minor] [new] The global fetch mock keeps its implementation and unconsumed *Once values across tests; setup.ts re-installs every other global but this one, CR-0071 [minor] [new] The gateway contract pins only refusals and admin CRUD: no successful relay, no 429/5xx, no sign-in, no headers, CR-0072 [minor] [new] The RBAC glob conformance vector is copied by hand into two tables and has already drifted, CR-0074 [minor] [new] Two shipped code sets are outside any coverage measurement: the demo tree (Release bundles) and the gate scripts, CR-0094 [minor] [new] queue-browser hides untested SDK event wiring behind a v8 ignore the house rules ban (+37 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "contract_test.go"
Cohesion: 0.13
Nodes (21): contractNormalize(), decodeAny(), managedEnv, loadContractSeed(), newContractEnv(), readContract(), readContractVectors(), TestContract_Cases() (+13 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.09
Nodes (28): Auditing an action, Audit trail, clock(), createNotificationCenter(), changed(), defaultStorage(), el(), isEntry() (+20 more)

### Community 9 - "relay_test.go"
Cohesion: 0.11
Nodes (23): errReader, fakeBroker, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+15 more)

### Community 10 - "state.ts"
Cohesion: 0.11
Nodes (21): SolacePublisher, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), selectPublisher(), StopReason (+13 more)

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

### Community 16 - "broker/store.ts"
Cohesion: 0.07
Nodes (48): BINARY_SAMPLE, buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, MockQueue, PAYLOAD_TEMPLATES, publish(), publishRejection() (+40 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "ManagedResult"
Cohesion: 0.13
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 19 - "user-management/module.ts"
Cohesion: 0.07
Nodes (41): managedRequest(), createManagedService(), DialResponse, ManagedConnection, ManagedProfile, ManagedVpn, QGlob, BackupDoc (+33 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.10
Nodes (12): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+4 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "fixtures.ts"
Cohesion: 0.05
Nodes (42): MANAGED_ERROR_CODES, DIRECT_BANNER, resetScenario(), seedState(), setBrokers(), createGateway(), changePassword(), signIn() (+34 more)

### Community 24 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 25 - "pages_test.go"
Cohesion: 0.14
Nodes (35): newClientWatch(), expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm(), slowHasher() (+27 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (80): Factory Pattern, 4. Shape after the rework, vitest, DeploymentConfig, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionConfig (+72 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (41): playwright-core, ALIAS, askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+33 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.08
Nodes (39): RFC-5280, AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), bitString(), BROKER_FIELDS, certificate(), commonName() (+31 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.12
Nodes (18): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES (+10 more)

### Community 30 - "ui-modal.ts"
Cohesion: 0.29
Nodes (13): ManagedSession, resetTransientState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate(), failedVerifyResult() (+5 more)

### Community 31 - "design"
Cohesion: 0.29
Nodes (7): CR-0018 [minor] [new] docs/architecture.md (and matching code comments) describe mechanisms the code no longer has, CR-0019 [minor] [new] Core keeps runtime-written module-level singletons (hosted mode, queue-picker cache/state) instead of AppContext state, CR-0020 [minor] [new] Module CSS selection is a hand-kept list separate from the variant manifests; the kitchen-sink build ships the admin modules unstyled, CR-0021 [minor] [new] The variant manifest is parsed by a regex stricter than TypeScript; an unquoted module id compiles but is never bundled, CR-0025 [nit] [new] AppContext.config is an untyped, unused field sourced from a global that nothing sets, CR-0027 [nit] [new] Live vs restart-only config keys are two independent hand lists with no check that every key is in one of them, design

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (60): BackupKey, BackupProblem, BackupSchedule, canonConn(), canonRows(), canonUser(), concat(), connName() (+52 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.05
Nodes (56): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), BackupModule, describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad() (+48 more)

### Community 34 - "module-events.test.ts"
Cohesion: 0.09
Nodes (17): ConnectionsModule, log, QueueDiscoveryModule, ui, mockCreateBrowser, mockDeleteMessages, mockDisconnectAll, mockDisconnectBrowser (+9 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.07
Nodes (32): AppContext (Dependency Injection), Circular Dependency Resolution, EventBus (Cross-Module Communication), Key Concepts, The Module Contract, CR-0116 [nit] [new] tests/core/logger.test.ts: 2 weak assertions -- default-arg test passes either way; constant self-check, boot(), DEFAULT_LOG_LEVEL (+24 more)

### Community 38 - "access_test.go"
Cohesion: 0.17
Nodes (25): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+17 more)

### Community 39 - "copy-flow.test.ts"
Cohesion: 0.08
Nodes (24): getQueue(), removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser (+16 more)

### Community 40 - "tls_test.go"
Cohesion: 0.13
Nodes (22): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+14 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.17
Nodes (12): auditCall, auditWriter, mergeByName(), decodeJSON(), decodeJSONLimit(), userSaveAction(), writeError(), writeInvalid() (+4 more)

### Community 42 - "throttle"
Cohesion: 0.14
Nodes (15): bucket, newRateWindow(), smfPathFor(), dialRequest, dialResponse, failures, fakeAfter, rateWindow (+7 more)

### Community 43 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 44 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (15): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, NO_SESSION, OK() (+7 more)

### Community 45 - "ui-modal.test.ts"
Cohesion: 0.10
Nodes (27): ACCUMULATE_IDLE_MS, createInitialState(), cacheElements(), tests main, provisionedSecondary(), setup(), makeCtx(), PRIMARY (+19 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.13
Nodes (27): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_FailedWriteIsLoggedAndNotFatal(), TestAudit_MessageCannotBreakTheLine() (+19 more)

### Community 48 - "dest-provisioned.test.ts"
Cohesion: 0.10
Nodes (17): DEST_TARGET_LOCKED_TITLE, connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling(), dialMock (+9 more)

### Community 49 - "authPages"
Cohesion: 0.09
Nodes (26): clientOf(), activeSession, auditFor(), authPages, clientWatch, clientLogger(), clientString(), setRequestUser() (+18 more)

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

### Community 54 - "contract.test.ts"
Cohesion: 0.15
Nodes (19): UpstreamAnswer, BROKER_RULE, CATALOG, CLIENT_SCHEMES, connectionProblem(), hasControl(), isIPv4(), isIPv6() (+11 more)

### Community 56 - "queue-source.ts"
Cohesion: 0.10
Nodes (15): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+7 more)

### Community 57 - "runChecks"
Cohesion: 0.14
Nodes (26): bcheck(), bindInQueueBrowser(), bindQueue(), check(), cookies, directSempPath(), drain(), expect() (+18 more)

### Community 58 - "testing.T"
Cohesion: 0.07
Nodes (66): TestParseCIDRs(), checkModuleIDs(), checkRenamedEnv(), decodeConfigFile(), defaultFileConfig(), defaultSecretPaths(), encodeConfigFile(), envOverrides() (+58 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Data Store: Planning Brief"
Cohesion: 0.17
Nodes (11): Code to read, Constraints, Contents, Data Store: Planning Brief, Ground rules for the session, How the store works today, Options to compare, Questions to settle with the user first (+3 more)

### Community 63 - "log/slog.Logger"
Cohesion: 0.08
Nodes (23): auditCategory, auditEntry, auditor, configSource, newDialer(), dialer, live, newManagedHandler() (+15 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "testing.T"
Cohesion: 0.14
Nodes (43): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), envOf(), newStoreFixture(), newStoreWithFixtures(), signsIn(), storedHash() (+35 more)

### Community 66 - "rbac.test.ts"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 67 - "go_pkg_path_filepath"
Cohesion: 0.14
Nodes (11): mustSealer(), parseStoreKey(), sealer, newSealer(), storeHeader(), TestNewSealer_TakesOnlyA32ByteKey(), testSealer(), TestSealer_OpenRefusesWhatItCannotTrust() (+3 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.12
Nodes (23): apiError, auditPre, clientJSON, clientSeenJSON, connJSON, connSaveJSON, connectionNamed(), connectionSaveAction() (+15 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (32): APP_VERSION, c(), ensure_deps(), expand(), finish(), has_linux_docker(), host_arch(), host_os() (+24 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

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

### Community 78 - "backup.go"
Cohesion: 0.06
Nodes (41): backupName(), connName(), diffByName(), flattenSettings(), monthSlot(), newBackupService(), nextRun(), sameRecord() (+33 more)

### Community 79 - "solace-publisher.ts"
Cohesion: 0.13
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS, DestTarget (+6 more)

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

### Community 92 - "main_test.go"
Cohesion: 0.11
Nodes (33): hostedEnv(), insecureEnv(), showAuditEnv(), envOr(), loadConfig(), parseHosted(), parseInsecureSkipVerify(), parseLogLevel() (+25 more)

### Community 93 - "newFakeClock"
Cohesion: 0.21
Nodes (29): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+21 more)

### Community 94 - "proxy.go"
Cohesion: 0.14
Nodes (7): adminHandler, fileResolvable(), hasExt(), newPWAHandler(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 95 - "newManagedEnv"
Cohesion: 0.21
Nodes (31): auditLog, TestBuildManagedRoutes_GatesByMode(), newManagedEnv(), newTestAuditor(), TestManagedAPI_AdminOnly(), TestManagedAPI_AuditNeverHoldsASecret(), TestManagedAPI_AuditTargetIsCut(), TestManagedAPI_ChangesAreLoggedWithActorAndTarget() (+23 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (25): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image() (+17 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "createManagedPanel"
Cohesion: 0.18
Nodes (16): createManagedPanel(), adopt(), clearSession(), connectError(), connectFailed(), connectSemp(), connectSolace(), doConnect() (+8 more)

### Community 100 - "smf_test.go"
Cohesion: 0.16
Nodes (18): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation(), TestSMF_JoinsTheSocketToTheBroker() (+10 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "provisioned-connection/index.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 105 - "socketRegistry"
Cohesion: 0.31
Nodes (4): openSocket, socketRegistry, newSocketRegistry(), TestSocketRegistry_ClosesOnlyWhatWasRevoked()

### Community 106 - "createVpnSwitch"
Cohesion: 0.23
Nodes (8): CR-0016 [minor] [new] The VPN-switch flow is implemented twice and the managed copy has already drifted from the documented navigation contract, connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "router.ts"
Cohesion: 0.18
Nodes (27): docOf(), glob(), openBackup(), port(), RELAY_PREFIX, createRouter(), handle(), match() (+19 more)

### Community 111 - "rbac.ts"
Cohesion: 0.16
Nodes (19): Locked decisions, filterSempFetch(), isListedVpn(), rowField(), SempFetch, AccessExplanation, ALWAYS_VISIBLE, canOperate() (+11 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "pages.ts"
Cohesion: 0.11
Nodes (26): ManagedDemo, ManagedPanelDeps, Gateway, createPages(), field(), frame(), hide(), open() (+18 more)

### Community 119 - "user-management/module.test.ts"
Cohesion: 0.21
Nodes (14): ADMIN, CHOICES, clickRow(), el(), hidden(), listed(), makeCtx(), rowCount() (+6 more)

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.18
Nodes (10): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 8. Constraints that stay, 9. Risks (+2 more)

### Community 121 - "gateway/index.ts"
Cohesion: 0.08
Nodes (29): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+21 more)

### Community 122 - "semp-discovery.ts"
Cohesion: 0.10
Nodes (29): visibleQueueRows(), createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues (+21 more)

### Community 123 - "testing.T"
Cohesion: 0.16
Nodes (27): newBackupKey(), openBackup(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_GivesUpWhenTheRequestGoesAway(), TestBackup_PassphraseRule() (+19 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (18): Build commands, Build-time feature flags, Code Conventions, Contents, Coverage Requirements, Developer Guide, DOM Access, Error Handling (+10 more)

### Community 125 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 127 - "relay.ts"
Cohesion: 0.11
Nodes (34): listQueues(), listVpns(), brokerVpns(), delay(), Fault, MOCK_HOST, scenario, VPNS (+26 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.05
Nodes (77): Writing Tests for a New Module, DEFAULT_MAX_MESSAGES_PER_QUEUE, escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, showPayload(), log (+69 more)

### Community 132 - "solace-client.ts"
Cohesion: 0.12
Nodes (17): gatewayWsUrl(), CONNECT_IN_PROGRESS, ConnectStart, createServiceSolace(), cleanup(), cleanupAll(), connect(), disconnect() (+9 more)

### Community 136 - "Provisioned Mode"
Cohesion: 0.12
Nodes (16): Administer, Audit settings, Back up and restore, Configure, Connection modes, Contents, Environment variables, How it works (+8 more)

### Community 137 - "queue-copy/ui-events.ts"
Cohesion: 0.14
Nodes (17): ProvisionedConnectionCard, ProvisionedTarget, syncDestFormFromSnapshot(), CopyUiElements, CopyUiApi, CopyUiServices, wireUiEvents(), deriveDestMode() (+9 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.24
Nodes (21): decodeTo(), expectInvalid(), managedEnv, jsonBody(), TestBackupAPI_ActionsAreAudited(), TestBackupAPI_AdminsOnly(), TestBackupAPI_Download(), TestBackupAPI_Export() (+13 more)

### Community 139 - "variants.test.ts"
Cohesion: 0.17
Nodes (11): ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES, MODULE_ENTRIES (+3 more)

### Community 140 - "build"
Cohesion: 0.29
Nodes (7): build, CR-0078 [major] [new] Compose posture tests do not forbid every widening token, let extra security_opt entries through, and leave the e2e `gateway` service unpinned, CR-0081 [minor] [new] Dockerfile base images and syntax frontend are pinned by tag, not digest, CR-0083 [minor] [new] vite-build.mjs exits 0 when vite is killed by a signal, and emptyOutDir:false keeps a stale bundle for check:bundles to pass on, CR-0084 [minor] [new] The `vet` gate type-checks src/**/*.ts only: tests/, vite/vitest configs and the src .js files are never type-checked, so test fixtures typed as production types drift silently, CR-0085 [nit] [new] dev.ps1 buffers each command's output until it exits and validates task names with wildcard-tolerant, case-insensitive Get-Command -- both prescribed by the dev-script contract, so a cancelled Windows run can lose its log and `dev.ps1 b*` passes the upfront check, CR-0086 [minor] [new] setup.sh is an unreferenced, unhardened script that downloads an unpinned SDK with no checksum and reports success even when nothing was extracted

### Community 141 - "backup_test.go"
Cohesion: 0.22
Nodes (19): backupFixtureFrom(), newBackupFixture(), TestBackup_ScheduleDocYAML(), TestBackupService_DirProblem(), TestBackupService_LoadRefusesADamagedSchedule(), TestBackupService_LoopRunsOnScheduleAndStops(), TestBackupService_PruneLogsAFileItCannotDelete(), TestBackupService_PruneSkipsAnUnreadableDirectory() (+11 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.14
Nodes (26): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+18 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 153 - "settings.ts"
Cohesion: 0.16
Nodes (21): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), ipv6Groups(), ipv6String(), Kind (+13 more)

### Community 154 - "store"
Cohesion: 0.08
Nodes (39): brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation(), flexStr, permsToRows(), passwordCheck (+31 more)

### Community 156 - "service-verify.ts"
Cohesion: 0.27
Nodes (13): escapeXml(), BIND_PROBE_TIMEOUT_MS, compareMsgIds(), emptyResult(), fetchNewestMsgIdViaSempV1(), msgIdToString(), normalizeAccessType(), parseSempV1Response() (+5 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Build internals, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 158 - "correctness"
Cohesion: 0.12
Nodes (16): correctness, CR-0001 [major] [new] Sign-in throttle is check-then-act: parallel guesses all pass loginWait before any failure is recorded, CR-0007 [minor] [new] A session created after a concurrent revocation (password reset, demotion, deletion) survives it; for a deleted user /solAdmin loops, CR-0008 [minor] [new] SEMP relay forwards If-None-Match/If-Match but turns the broker's 304 into a 502 upstream_unavailable, CR-0013 [nit] [new] Import merge reads the stores outside their lock, so a concurrent admin edit before replaceUsers/replaceConnections is lost, CR-0014 [nit] [new] Concurrent schedule saves can leave the in-memory schedule different from backup.yaml, CR-0015 [minor] [new] solace-client: a connect() on a client with a session lets the old session's DISCONNECTED handler dispose the new session, CR-0017 [minor] [new] The production SEMP client contains a hard-coded demo branch that rejects any host containing 'untrust.com' (+8 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "fixtures.ts"
Cohesion: 0.15
Nodes (17): QUEUE_STATE, QueueFixture, QueueState, ScenarioState, VpnFixture, connection(), DEMO_ACCOUNTS, DEMO_TOPOLOGY (+9 more)

### Community 161 - "observability"
Cohesion: 0.12
Nodes (16): CR-0042 [major] [new] net/http server errors, handler panics included, are logged at INFO and dropped at the default WARN level, CR-0043 [minor] [new] User and connection changes in the admin API leave no log line naming who did it or to what, unlike settings, backups and imports, CR-0044 [minor] [new] At the default WARN level the gateway logs none of its effective configuration, not even its version, and the access list is never logged at any level, CR-0045 [minor] [new] WARN serves as the 'always show' audit level for routine successes, while equivalent security events stay at INFO, CR-0046 [minor] [new] Gateway refusal logging differs across equivalent paths: some denials and rate limits are silent, and some error lines omit the user and client, CR-0047 [minor] [new] The access log names the TCP peer instead of the resolved client, and records hijacked sockets as status 200 with 0 bytes, CR-0048 [minor] [new] The documented health probe (/hosted) answers 200 while the app bundle cannot be served, and a missing index file returns 404 without a log line, CR-0049 [minor] [new] The sign-in and unauthenticated-request throttles fail closed silently when their tracking tables are full (+8 more)

### Community 162 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 163 - "panel.ts"
Cohesion: 0.22
Nodes (21): managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_PANEL_SEEN_KEY, el(), fillDirectForm() (+13 more)

### Community 164 - "registry.ts"
Cohesion: 0.20
Nodes (5): src/main.ts application bootstrap, modules, ACTIVE_MODULES, loadRegistry(), injectModuleTemplates plugin

### Community 165 - "managed-api.ts"
Cohesion: 0.04
Nodes (53): Adding a New Module, pickQueue() reusable picker, confirmDialog(), ConfirmOptions, createGate(), GateOptions, ModuleGate, attachBackdropClose() (+45 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Administration (`/solAdmin`), Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax (+17 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.18
Nodes (6): CR-0070 [nit] [new] resetQueueBrowserState() misses runtime-added state fields, and ui-forward.test.ts hand-resets instead of calling it, fire(), GLOBALS, pending(), shell, state()

### Community 170 - "resilience"
Cohesion: 0.13
Nodes (15): CR-0002 [minor] [new] A half-supplied TLS pair (only tls.key or only tls.crt) is overwritten by a generated pair: deliberate in code and pinned by a test, but docs/deployment.md:154 says a pair is generated only 'With neither', CR-0003 [major] [new] Backup directory check cannot tell an unmounted /backup: scheduled backups silently land in the container layer, CR-0004 [minor] [new] A full throttle table refuses every legitimate sign-in, and the table is filled by attacker-chosen usernames, CR-0005 [minor] [new] Hasher concurrency is runtime.NumCPU(), so a burst of sign-ins can take every CPU, contrary to its stated purpose, CR-0006 [minor] [new] Import that fails after an earlier section was written answers a bare 500, so the admin cannot tell what was applied, CR-0009 [minor] [new] Shutdown ignores hijacked SMF/Direct WebSockets, waits on the backup loop with no deadline, and ignores a second signal, CR-0011 [minor] [new] Generated self-signed certificate expires after 365 days and is never renewed or warned about, CR-0012 [minor] [new] A missing app bundle starts the gateway anyway and serves 404s, and serveIndex logs nothing (+7 more)

### Community 171 - "backup.go"
Cohesion: 0.06
Nodes (25): partialName(), hostedInfo, createExclusive(), loadStoreKey(), ownershipHint(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+17 more)

### Community 172 - "fileutil_test.go"
Cohesion: 0.24
Nodes (13): fileTx, assertNoTempFiles(), readOr(), renameFailing(), TestFileTx_AllOrNothing(), TestFileTx_UnreadableTargetChangesNothing(), TestWriteFileAtomic_ModeIsCallerChosen(), TestWriteFileAtomic_ParentIsAFile() (+5 more)

### Community 173 - "Findings by area"
Cohesion: 0.14
Nodes (13): cicd, conventions, CR-0075 [major] [new] docs-links test fails on a fresh checkout because docs/improvement-plan.md is git-ignored, so the next tag's gates go red on both runners, CR-0076 [major] [new] Tag format is never validated: any v* tag (pre-release or malformed) moves `latest`, is marked the Latest GitHub release and redeploys Pages; the no-tags guard can never fire, CR-0077 [major] [new] SCA workflow calls a reusable workflow at mutable `@main`, handing it FOSSA_API_KEY and broad top-level write and OIDC permissions; runner is ubuntu-latest, CR-0079 [minor] [new] README and deployment.md quick starts give operators commands that fail or skip a required step (no SMU_VERSION, wrong file path, no backup dir, `:latest`), CR-0080 [minor] [new] Release artifacts are rebuilt in each stage instead of promoted; the image's own index.html and provisioned.html never pass check:bundles, CR-0087 [minor] [new] Per-machine graphify artifacts and a stale nested graph are tracked in git (+5 more)

### Community 174 - "settings_test.go"
Cohesion: 0.21
Nodes (16): errorCode(), expect(), logLine(), managedEnv, TestSettings_AccessListThatAdmitsTheAdmin(), TestSettings_AuditKeysApplyLive(), TestSettings_GetReportsTheFile(), TestSettings_LockOutWhenClientUnresolved() (+8 more)

### Community 175 - "quality"
Cohesion: 0.15
Nodes (13): CR-0038 [minor] [new] alert() is used for user-facing errors and results, against the error-handling rule, and one message tells the user to check the console, CR-0057 [minor] [new] queue-browser's forward modal reaches the DOM through document.getElementById instead of its container, because the module keeps module-scoped singletons, CR-0058 [minor] [new] Dead production code: an unused config module, a probe only tests call, an unused cap constant and unreachable branches, CR-0059 [minor] [new] Commented-out defensive guards from the 2026-05-26 audit are still in three services, CR-0060 [minor] [new] Admin list plumbing is copy-pasted between connection-management and user-management, and setError exists six times, CR-0061 [minor] [new] Protocol limits and connection defaults are repeated as literals in several places, CR-0062 [nit] [new] Comments point at files, lines or siblings that no longer exist, CR-0063 [minor] [new] No linter or formatter is configured or gated, and the .js modules are not type-checked (+5 more)

### Community 176 - "access-test.ts"
Cohesion: 0.15
Nodes (14): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+6 more)

### Community 177 - "mustPWA"
Cohesion: 0.20
Nodes (18): CR-0073 [minor] [new] routes.test.ts completeness check keys on the first path segment, so new routes under an existing segment need no row, newRootHandler(), route(), stubHandler(), TestRootHandler_RedirectsInGatewayMode(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_WithManagedRouting(), TestRootHandler_WithoutManagedRouting() (+10 more)

### Community 178 - "newReverseProxy"
Cohesion: 0.15
Nodes (14): dropSessionCookie(), dropSessionSetCookie(), newReverseProxy(), newUpstreamTransport(), TestDropSessionCookie(), TestDropSessionSetCookie(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400() (+6 more)

### Community 179 - "access.go"
Cohesion: 0.19
Nodes (12): clientIP(), normalizeAddr(), prefixContains(), accessConfig, auditSettings, clientCtxKey, config, liveSettings (+4 more)

### Community 180 - "net/http.Handler"
Cohesion: 0.17
Nodes (12): withClient(), TestAuditFor_ActorAndClient(), recoverPanics(), requestLogger(), requestUser(), TestRequestLogger_OutsideTheChain(), withRequestInfo(), connChanges() (+4 more)

### Community 181 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 182 - "request"
Cohesion: 0.20
Nodes (15): configureGateway(), errorCode(), createCookieJar(), parseSetCookie(), noteCookies(), openContext(), rawHeaderText(), recordResponse() (+7 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "semp-v1.ts"
Cohesion: 0.38
Nodes (13): allQueues(), findQueueAnyVpn(), spoolUsage(), vpnOn(), queueStateOf(), esc(), executeError(), handleSempV1() (+5 more)

### Community 185 - "serve"
Cohesion: 0.21
Nodes (8): logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), main(), printVersionIfRequested(), serve(), TestPrintVersionIfRequested(), process

### Community 186 - "pipe"
Cohesion: 0.20
Nodes (4): acceptWatch, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 188 - ".ServeHTTP"
Cohesion: 0.22
Nodes (4): writeRateLimited(), isWebSocketUpgrade(), sameOriginSocket(), userCounter

### Community 189 - "dial_test.go"
Cohesion: 0.36
Nodes (7): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt()

### Community 190 - "queue-subscription-explorer/ui.ts"
Cohesion: 0.36
Nodes (6): SubscriptionRow, CounterCounts, EMPTY_MESSAGES, renderCounter(), renderRows(), uniqueQueues()

### Community 191 - "Managed Connections (RBAC) — Design & Threat Model"
Cohesion: 0.29
Nodes (7): Contents, Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app)

### Community 192 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 193 - "interfaces"
Cohesion: 0.40
Nodes (5): CR-0022 [minor] [new] Docs instruct operators to set CONN_MODES=managed, a value the gateway rejects at startup, CR-0023 [minor] [new] Provisioned broker connections are hard-wired to TLS (https SEMP, wss SMF), but the connection record and the docs never say so, CR-0024 [minor] [new] SSL_INSECURE_SKIP_VERIFY is parsed leniently while HOSTED and LOG_LEVEL are strict; a typo is silently ignored, CR-0026 [nit] [new] The SSL_CERT_FILE name collides with Go's own trust-store variable, so 'env var ignored, config.yaml wins' is not true for it, interfaces

### Community 194 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **163 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1250 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Adding a New Module` connect `managed-api.ts` to `Developer Guide`, `testing.T`, `logger.ts`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Are the 60 inferred relationships involving `newManagedEnv()` (e.g. with `TestBackupAPI_ActionsAreAudited()` and `TestBackupAPI_AdminsOnly()`) actually correct?**
  _`newManagedEnv()` has 60 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `testing.T` be split into smaller, more focused modules?**
  _Cohesion score 0.080338266384778 - nodes in this community are weakly interconnected._
- **Why does `7. Phases` connect `connections/module.ts` to `loadModuleDOM`, `store`, `newReverseProxy`, `Managed mode rework: direction and decisions`, `testing.T`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Should `queue-copy/ui.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10359408033826638 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._