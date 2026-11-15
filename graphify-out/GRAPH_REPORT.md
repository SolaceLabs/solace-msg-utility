# Graph Report - smu-dirty  (2026-11-15)

## Corpus Check
- 331 files · ~682,966 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: .css 23, (none) 6, .dockerignore 1)

## Summary
- 4583 nodes · 13741 edges · 180 communities (149 shown, 31 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 1720 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `abd6601c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- queue-copy/ui.ts
- connections/module.ts
- tests
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- relay_test.go
- service-verify.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- broker/store.ts
- scripts
- newWFix
- managed-service.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- createGateway
- Kernel.installModule
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- ui-modal.ts
- createManagedPanel
- backup.ts
- demo-flow.test.ts
- connections/module.ts
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- access_test.go
- MockEmitter
- tls_test.go
- net/http.ResponseWriter
- throttle
- row-list/index.ts
- managed-panel.test.ts
- ui-modal.test.ts
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- Queue Discovery Screenshot
- Categories of Ignored Code
- SolaceMessageUtility — Test Suite Technical Report
- router.ts
- tests variants
- queue-source.ts
- dest-provisioned.test.ts
- testing.T
- Test Infrastructure and Configuration
- queue-discovery module
- Forward Message Dialog Screenshot
- runDirectChecks
- log/slog.Logger
- Managed Variant (RBAC)
- store_test.go
- rbac.test.ts
- loadStore
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
- backup_api.go
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
- main.go
- newFakeClock
- proxy.go
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- createConnTabs
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- provisioned-connection/index.ts
- user-management/module.test.ts
- createUiEvents
- Deployment Options
- gateway-settings/module.test.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- rbac.ts
- routes.test.ts
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- createPages
- registry.test.ts
- Managed mode rework: direction and decisions
- go_pkg_path_filepath
- managed-api.ts
- testing.T
- Developer Guide
- Module 2: Queue Browser
- queue-subscription-explorer parse
- server/index.ts
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
- checksums
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Provisioned Mode
- wireUiEvents
- backup_api_test.go
- demo-flow.test.ts
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
- go-web-proxy main (gateway entrypoint)
- npm-audit-gate.mjs
- module-registry-plugin.mjs
- correctness
- ConnectionsModule Test Suite
- cicd
- observability
- panel.ts
- managed-api.ts
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- resilience
- go_pkg_strings
- Findings by area
- settings_test.go
- quality
- defaultConfig
- go_pkg_net_http
- runChecks
- tsconfig.test.json
- expectLogged
- compose.ts
- smf.go

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 132 edges
2. `vitest` - 111 edges
3. `store` - 88 edges
4. `quietLogger()` - 78 edges
5. `AppContext` - 65 edges
6. `loadModuleDOM()` - 62 edges
7. `writeFile()` - 53 edges
8. `managedHandler` - 52 edges
9. `completeContext()` - 50 edges
10. `createEventBus()` - 49 edges

## Surprising Connections (you probably didn't know these)
- `CR-0116 [nit] [new] tests/core/logger.test.ts: 2 weak assertions -- default-arg test passes either way; constant self-check` --references--> `readLogLevelFromUrl()`  [INFERRED]
  docs/review/2026-11-10-critical-review.md → src/core/logger.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Test Architecture` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts
- `Auditing an action` --references--> `Outcome`  [INFERRED]
  docs/developer-guide.md → tests/mock-broker/gateway/routes.test.ts
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

## Communities (180 total, 31 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.06
Nodes (57): 7. Phases, adminHandler, hostedInfo, TestRecoverPanics_LogsAndAnswers500(), TestRootHandler_RedirectsInGatewayMode(), accessLog(), appIndexFile(), contextWithTarget() (+49 more)

### Community 1 - "queue-copy/ui.ts"
Cohesion: 0.10
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets() (+34 more)

### Community 2 - "connections/module.ts"
Cohesion: 0.07
Nodes (36): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+28 more)

### Community 3 - "tests"
Cohesion: 0.04
Nodes (48): CR-0065 [minor] [new] The 100% web coverage thresholds are never enforced by CI or the tag pipeline; only a local `cov` run checks them, CR-0066 [minor] [new] The Go race detector is never run, so the gateway's only race test asserts nothing, CR-0067 [major] [new] Verify and copy are never tested with createQueueBrowser throwing; the call is unguarded and the modal drops the rejection, CR-0068 [minor] [new] The copy/move engine is never run against a realistic SDK (neither the demo broker nor the real SDK); its tests hand-drive mock handlers, CR-0069 [minor] [new] The global fetch mock keeps its implementation and unconsumed *Once values across tests; setup.ts re-installs every other global but this one, CR-0071 [minor] [new] The gateway contract pins only refusals and admin CRUD: no successful relay, no 429/5xx, no sign-in, no headers, CR-0072 [minor] [new] The RBAC glob conformance vector is copied by hand into two tables and has already drifted, CR-0074 [minor] [new] Two shipped code sets are outside any coverage measurement: the demo tree (Release bundles) and the gate scripts (+40 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.06
Nodes (33): backupName(), diffByName(), fileOfSchedule(), mergeByName(), monthSlot(), newBackupService(), nextRun(), partialName() (+25 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): clock(), createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log (+17 more)

### Community 9 - "relay_test.go"
Cohesion: 0.08
Nodes (30): errReader, fakeBroker, named(), newManagedEnvFrom(), newManagedEnvWith(), isShowRPC(), newUserCounter(), answerJSON() (+22 more)

### Community 10 - "service-verify.ts"
Cohesion: 0.22
Nodes (14): escapeXml(), ACCUMULATE_IDLE_MS, compareMsgIds(), emptyResult(), fetchNewestMsgIdViaSempV1(), msgIdToString(), normalizeAccessType(), parseSempV1Response() (+6 more)

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
Cohesion: 0.04
Nodes (94): BINARY_SAMPLE, buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, getQueue(), key(), listQueues(), listVpns() (+86 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "newWFix"
Cohesion: 0.08
Nodes (40): changedOnDiskError, clientGoneError, refusalError, staleError, checkRev(), txn, wfix, writeFailedError (+32 more)

### Community 19 - "managed-service.ts"
Cohesion: 0.09
Nodes (12): Audit trail, ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, connPath(), createConnMgmtService(), ManagedConnRecord (+4 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.10
Nodes (12): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+4 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "createGateway"
Cohesion: 0.08
Nodes (24): MANAGED_ERROR_CODES, createGateway(), changePassword(), signIn(), createThrottle(), Failures, LoginLimits, retrySeconds() (+16 more)

### Community 24 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 25 - "pages_test.go"
Cohesion: 0.17
Nodes (37): newManagedEnv(), usersWrote(), expectPage(), expectRedirect(), managedEnv, issuedCookie(), passwordForm(), signInForm() (+29 more)

### Community 26 - "vitest"
Cohesion: 0.05
Nodes (72): 4. Shape after the rework, vitest, createEventBus(), createManagedProfile(), AppContext, AppState, AdminLoginModule, ConnectionManagementModule (+64 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (43): playwright-core, aliasLookup(), askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+35 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.07
Nodes (42): RFC-5280, AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), bitString(), BROKER_FIELDS, certificate(), commonName() (+34 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.12
Nodes (18): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES (+10 more)

### Community 30 - "ui-modal.ts"
Cohesion: 0.08
Nodes (34): SolacePublisher, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), selectPublisher() (+26 more)

### Community 31 - "createManagedPanel"
Cohesion: 0.07
Nodes (34): CR-0016 [minor] [new] The VPN-switch flow is implemented twice and the managed copy has already drifted from the documented navigation contract, CR-0018 [minor] [new] docs/architecture.md (and matching code comments) describe mechanisms the code no longer has, CR-0019 [minor] [new] Core keeps runtime-written module-level singletons (hosted mode, queue-picker cache/state) instead of AppContext state, CR-0020 [minor] [new] Module CSS selection is a hand-kept list separate from the variant manifests; the kitchen-sink build ships the admin modules unstyled, CR-0021 [minor] [new] The variant manifest is parsed by a regex stricter than TypeScript; an unquoted module id compiles but is never bundled, CR-0025 [nit] [new] AppContext.config is an untyped, unused field sourced from a global that nothing sets, CR-0027 [nit] [new] Live vs restart-only config keys are two independent hand lists with no check that every key is in one of them, design (+26 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (92): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+84 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.05
Nodes (60): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), BackupModule, describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad() (+52 more)

### Community 34 - "connections/module.ts"
Cohesion: 0.03
Nodes (54): DEFAULT_MAX_MESSAGES_PER_QUEUE, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionConfig, ConnectionCredentials, SempConfig, SolaceConfig (+46 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.07
Nodes (31): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG (+23 more)

### Community 38 - "access_test.go"
Cohesion: 0.28
Nodes (17): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+9 more)

### Community 40 - "tls_test.go"
Cohesion: 0.10
Nodes (22): appendPEMCerts(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts() (+14 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.16
Nodes (14): auditCall, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), queryRev(), userSaveAction(), writeError(), writeInvalid() (+6 more)

### Community 42 - "throttle"
Cohesion: 0.11
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, apiError, bucket, clientCtxKey, newRateWindow() (+16 more)

### Community 43 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 44 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (15): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, NO_SESSION, OK() (+7 more)

### Community 45 - "ui-modal.test.ts"
Cohesion: 0.12
Nodes (23): createInitialState(), SourceAccess, tests main, connectedDest(), setup(), PRIMARY, setup(), DIRECT (+15 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.21
Nodes (21): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+13 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (52): CR-0073 [minor] [new] routes.test.ts completeness check keys on the first path segment, so new routes under an existing segment need no row, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+44 more)

### Community 49 - "authPages"
Cohesion: 0.09
Nodes (24): clientOf(), activeSession, auditFor(), authPages, clientWatch, clientLogger(), clientString(), setRequestUser() (+16 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.18
Nodes (23): Factory Pattern, applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+15 more)

### Community 51 - "Queue Discovery Screenshot"
Cohesion: 0.24
Nodes (13): Queue Discovery Header, Message VPN Selector (default), Open in Browser Button, Queue List Dropdown (test), Queue List Refresh Button, Queue Discovery Screenshot, Sidebar Navigation (Connections, Queue Discovery, Queue Browser), Status Footer (Client / SEMP indicators) (+5 more)

### Community 52 - "Categories of Ignored Code"
Cohesion: 0.15
Nodes (13): Categories of Ignored Code, Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements, Category 2 (obsolete): Disabled Button Wiring in Queue Browser, Category 3: DOMContentLoaded in jsdom (`main.ts`), Category 4: Solace Callback Null Guards, Category 5: Redundant Safety Guards, Category 6: safeSet Inner Function — historical, Category 7 (obsolete): `else if` Chain Bytecode Artifacts (+5 more)

### Community 53 - "SolaceMessageUtility — Test Suite Technical Report"
Cohesion: 0.17
Nodes (12): Approach: Isolation-First with Shared Infrastructure, code:block1 (Statements : 100% (4024/4024)), Core Philosophy: Mock the Platform, Test the Logic, Executive Summary, SolaceMessageUtility — Test Suite Technical Report, Summary of v8 Ignore Philosophy, Table of Contents, Testing Methodology (+4 more)

### Community 54 - "router.ts"
Cohesion: 0.04
Nodes (92): DialResponse, BACKUP_ITER, BackupDeps, BackupDoc, BackupsState, connsProblem(), GatewayFaults, GatewaySnapshot (+84 more)

### Community 56 - "queue-source.ts"
Cohesion: 0.10
Nodes (16): __resetForTest(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+8 more)

### Community 57 - "dest-provisioned.test.ts"
Cohesion: 0.10
Nodes (18): DEST_TARGET_LOCKED_TITLE, connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling(), dialMock (+10 more)

### Community 58 - "testing.T"
Cohesion: 0.06
Nodes (69): TestParseCIDRs(), checkAuditOnFailure(), flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeysAndSkipsHostPaths(), checkModuleIDs(), checkRenamedEnv() (+61 more)

### Community 59 - "Test Infrastructure and Configuration"
Cohesion: 0.15
Nodes (13): 1. Browser API Stubs, 2. The Solace SDK Mock (`createSolaceMock`), 3. Per-Test Reset Hooks, code:ts (beforeEach(() => {), code:ts (export default defineConfig({), code:ts (// localStorage — in-memory Map with the standard API), code:ts (function createSolaceMock() {), code:ts (function createSessionMock() {) (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "runDirectChecks"
Cohesion: 0.14
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 63 - "log/slog.Logger"
Cohesion: 0.07
Nodes (24): auditCategory, auditEntry, auditor, auditWrote, configSource, newDialer(), dialer, live (+16 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.14
Nodes (49): savedUser, currentConn(), currentUser(), newStoreFixture(), newStoreWithFixtures(), putConn(), putUser(), runImport() (+41 more)

### Community 66 - "rbac.test.ts"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 67 - "loadStore"
Cohesion: 0.12
Nodes (23): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+15 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (29): auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+21 more)

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

### Community 78 - "backup_api.go"
Cohesion: 0.29
Nodes (9): backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON, importSourceJSON (+1 more)

### Community 79 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+6 more)

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
Cohesion: 0.07
Nodes (33): acceptWatch, config, hostedEnv(), insecureEnv(), prefixStrings(), showAuditEnv(), logStartup(), modeName() (+25 more)

### Community 93 - "newFakeClock"
Cohesion: 0.20
Nodes (30): fakeClock, fixed(), newSessions(), newFakeClock(), TestSessionCookie_FlagsAndRequestLookup(), TestSessionOf_ContextRoundTrip(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+22 more)

### Community 94 - "proxy.go"
Cohesion: 0.13
Nodes (8): deadHijacker, hostedHandler, fileResolvable(), hasExt(), TestRecordingResponseWriter_DefaultStatus(), TestRecordingResponseWriter_HijackWithoutSupport(), pwaHandler, recordingResponseWriter

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (57): Auditing an action, auditLog, moduleCatalog(), connsWrote(), managedEnv, holdWriter(), newTestAuditor(), raced() (+49 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (25): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-Logged(), Invoke-TrivyImage(), Build-Image() (+17 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 100 - "smf_test.go"
Cohesion: 0.11
Nodes (25): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt(), fakeAnswer (+17 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "provisioned-connection/index.ts"
Cohesion: 0.11
Nodes (17): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+9 more)

### Community 105 - "user-management/module.test.ts"
Cohesion: 0.15
Nodes (16): NO_OPERATE, NO_READ_ONLY, ADMIN, CHOICES, clickRow(), el(), hidden(), listed() (+8 more)

### Community 106 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), HOST_ONLY, makeCtx(), offeredBoxes() (+6 more)

### Community 111 - "rbac.ts"
Cohesion: 0.10
Nodes (31): Contents, Locked decisions, Managed Connections (RBAC) — Design & Threat Model, Open hardening items (input to the connections rework), Threat model (honest, documented), Topology, What it is, YAML schemas (as sealed in the store files; edited only through the admin app) (+23 more)

### Community 112 - "routes.test.ts"
Cohesion: 0.12
Nodes (14): ClientSeen, createSettingsService(), SettingsView, backup, conns, DAILY, managed, norm() (+6 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "createPages"
Cohesion: 0.53
Nodes (9): createPages(), field(), frame(), hide(), open(), showLogin(), showPassword(), submitted() (+1 more)

### Community 119 - "registry.test.ts"
Cohesion: 0.20
Nodes (5): src/main.ts application bootstrap, modules, ACTIVE_MODULES, loadRegistry(), injectModuleTemplates plugin

### Community 120 - "Managed mode rework: direction and decisions"
Cohesion: 0.18
Nodes (10): 10. Next step, 1. Goal, 2. Decisions taken, 3. Still open, 5. Open items: disposition, 6. Surface hygiene (bots, scanners), 8. Constraints that stay, 9. Risks (+2 more)

### Community 121 - "go_pkg_path_filepath"
Cohesion: 0.22
Nodes (5): hostOnlyKeyNames(), settingsBody, settingsFile, settingsJSON, stagedSettings

### Community 122 - "managed-api.ts"
Cohesion: 0.05
Nodes (69): SempContext, buildBrokerUrl(), managedErrorMessage(), createServiceSemp(), connect(), log, SempConnectionHooks, sempErrorText (+61 more)

### Community 123 - "testing.T"
Cohesion: 0.19
Nodes (23): newBackupKey(), openBackup(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_GivesUpWhenTheRequestGoesAway(), TestBackup_PassphraseRule() (+15 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (18): Build commands, Build-time feature flags, Code Conventions, Contents, Coverage Requirements, Developer Guide, DOM Access, Error Handling (+10 more)

### Community 125 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 127 - "server/index.ts"
Cohesion: 0.14
Nodes (28): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), delay(), DEMO_GATEWAY_MARKER, pathEscape() (+20 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.05
Nodes (77): Circular Dependency Resolution, Writing Tests for a New Module, escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, showPayload(), log (+69 more)

### Community 136 - "Provisioned Mode"
Cohesion: 0.07
Nodes (31): Code to read, Constraints, Contents, Data Store: Planning Brief, Ground rules for the session, How the store works today, Options to compare, Outcome so far (+23 more)

### Community 137 - "wireUiEvents"
Cohesion: 0.33
Nodes (11): syncDestFormFromSnapshot(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability() (+3 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (32): decodeTo(), expectInvalid(), expectRev(), managedEnv, jsonBody(), scheduleBody(), staleBasis(), TestBackupAPI_ActionsAreAudited() (+24 more)

### Community 139 - "demo-flow.test.ts"
Cohesion: 0.16
Nodes (12): QueueCopyModule, ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES (+4 more)

### Community 140 - "build"
Cohesion: 0.29
Nodes (7): build, CR-0078 [major] [new] Compose posture tests do not forbid every widening token, let extra security_opt entries through, and leave the e2e `gateway` service unpinned, CR-0081 [minor] [new] Dockerfile base images and syntax frontend are pinned by tag, not digest, CR-0083 [minor] [new] vite-build.mjs exits 0 when vite is killed by a signal, and emptyOutDir:false keeps a stale bundle for check:bundles to pass on, CR-0084 [minor] [new] The `vet` gate type-checks src/**/*.ts only: tests/, vite/vitest configs and the src .js files are never type-checked, so test fixtures typed as production types drift silently, CR-0085 [nit] [new] dev.ps1 buffers each command's output until it exits and validates task names with wildcard-tolerant, case-insensitive Get-Command -- both prescribed by the dev-script contract, so a cancelled Windows run can lose its log and `dev.ps1 b*` passes the upfront check, CR-0086 [minor] [new] setup.sh is an unreferenced, unhardened script that downloads an unpinned SDK with no checksum and reports success even when nothing was extracted

### Community 141 - "backup_test.go"
Cohesion: 0.21
Nodes (21): backupFixtureFrom(), newBackupFixture(), TestBackup_ScheduleDocYAML(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_FailedWriteChangesNothing(), TestBackupService_LoopRunsOnScheduleAndStops(), TestBackupService_PruneLogsAFileItCannotDelete() (+13 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (32): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+24 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 153 - "settings.ts"
Cohesion: 0.14
Nodes (23): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), ipv6Groups(), ipv6String(), Kind (+15 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (57): Writing to the store, connName(), TestBackup_SharedVector(), userName(), brokerTarget, clientRec, connRec, connsDoc (+49 more)

### Community 155 - "go-web-proxy main (gateway entrypoint)"
Cohesion: 0.32
Nodes (7): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value

### Community 156 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Build internals, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 158 - "correctness"
Cohesion: 0.12
Nodes (16): correctness, CR-0001 [major] [new] Sign-in throttle is check-then-act: parallel guesses all pass loginWait before any failure is recorded, CR-0007 [minor] [new] A session created after a concurrent revocation (password reset, demotion, deletion) survives it; for a deleted user /solAdmin loops, CR-0008 [minor] [new] SEMP relay forwards If-None-Match/If-Match but turns the broker's 304 into a 502 upstream_unavailable, CR-0013 [nit] [new] Import merge reads the stores outside their lock, so a concurrent admin edit before replaceUsers/replaceConnections is lost, CR-0014 [nit] [new] Concurrent schedule saves can leave the in-memory schedule different from backup.yaml, CR-0015 [minor] [new] solace-client: a connect() on a client with a session lets the old session's DISCONNECTED handler dispose the new session, CR-0017 [minor] [new] The production SEMP client contains a hard-coded demo branch that rejects any host containing 'untrust.com' (+8 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "cicd"
Cohesion: 0.40
Nodes (5): cicd, CR-0075 [major] [new] docs-links test fails on a fresh checkout because docs/improvement-plan.md is git-ignored, so the next tag's gates go red on both runners, CR-0076 [major] [new] Tag format is never validated: any v* tag (pre-release or malformed) moves `latest`, is marked the Latest GitHub release and redeploys Pages; the no-tags guard can never fire, CR-0077 [major] [new] SCA workflow calls a reusable workflow at mutable `@main`, handing it FOSSA_API_KEY and broad top-level write and OIDC permissions; runner is ubuntu-latest, CR-0080 [minor] [new] Release artifacts are rebuilt in each stage instead of promoted; the image's own index.html and provisioned.html never pass check:bundles

### Community 161 - "observability"
Cohesion: 0.12
Nodes (16): CR-0042 [major] [new] net/http server errors, handler panics included, are logged at INFO and dropped at the default WARN level, CR-0043 [minor] [new] User and connection changes in the admin API leave no log line naming who did it or to what, unlike settings, backups and imports, CR-0044 [minor] [new] At the default WARN level the gateway logs none of its effective configuration, not even its version, and the access list is never logged at any level, CR-0045 [minor] [new] WARN serves as the 'always show' audit level for routine successes, while equivalent security events stay at INFO, CR-0046 [minor] [new] Gateway refusal logging differs across equivalent paths: some denials and rate limits are silent, and some error lines omit the user and client, CR-0047 [minor] [new] The access log names the TCP peer instead of the resolved client, and records hijacked sockets as status 200 with 0 bytes, CR-0048 [minor] [new] The documented health probe (/hosted) answers 200 while the app bundle cannot be served, and a missing index file returns 404 without a log line, CR-0049 [minor] [new] The sign-in and unauthenticated-request throttles fail closed silently when their tracking tables are full (+8 more)

### Community 163 - "panel.ts"
Cohesion: 0.09
Nodes (40): ManagedPanelDeps, managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_PANEL_SEEN_KEY, el() (+32 more)

### Community 165 - "managed-api.ts"
Cohesion: 0.04
Nodes (64): Adding a New Module, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog() (+56 more)

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

### Community 171 - "go_pkg_strings"
Cohesion: 0.05
Nodes (41): contractNormalize(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv, loadContractSeed(), readContract(), readContractVectors() (+33 more)

### Community 173 - "Findings by area"
Cohesion: 0.14
Nodes (13): conventions, CR-0022 [minor] [new] Docs instruct operators to set CONN_MODES=managed, a value the gateway rejects at startup, CR-0023 [minor] [new] Provisioned broker connections are hard-wired to TLS (https SEMP, wss SMF), but the connection record and the docs never say so, CR-0024 [minor] [new] SSL_INSECURE_SKIP_VERIFY is parsed leniently while HOSTED and LOG_LEVEL are strict; a typo is silently ignored, CR-0026 [nit] [new] The SSL_CERT_FILE name collides with Go's own trust-store variable, so 'env var ignored, config.yaml wins' is not true for it, CR-0079 [minor] [new] README and deployment.md quick starts give operators commands that fail or skip a required step (no SMU_VERSION, wrong file path, no backup dir, `:latest`), CR-0087 [minor] [new] Per-machine graphify artifacts and a stale nested graph are tracked in git, CR-0088 [minor] [new] Stale developer docs: contributing.md describes Go build-tag test variants that no longer exist; developer-guide.md says priority is set in src/registry.ts (+5 more)

### Community 174 - "settings_test.go"
Cohesion: 0.09
Nodes (56): expectStale(), TestToConfig_CrossCheckAndConversion(), assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), logLine() (+48 more)

### Community 175 - "quality"
Cohesion: 0.15
Nodes (13): CR-0038 [minor] [new] alert() is used for user-facing errors and results, against the error-handling rule, and one message tells the user to check the console, CR-0057 [minor] [new] queue-browser's forward modal reaches the DOM through document.getElementById instead of its container, because the module keeps module-scoped singletons, CR-0058 [minor] [new] Dead production code: an unused config module, a probe only tests call, an unused cap constant and unreachable branches, CR-0059 [minor] [new] Commented-out defensive guards from the 2026-05-26 audit are still in three services, CR-0060 [minor] [new] Admin list plumbing is copy-pasted between connection-management and user-management, and setError exists six times, CR-0061 [minor] [new] Protocol limits and connection defaults are repeated as literals in several places, CR-0062 [nit] [new] Comments point at files, lines or siblings that no longer exist, CR-0063 [minor] [new] No linter or formatter is configured or gated, and the .js modules are not type-checked (+5 more)

### Community 179 - "defaultConfig"
Cohesion: 0.10
Nodes (25): TestAudit_ReopenFailureLosesTheRecordLoudly(), TestAuditFor_ActorAndClient(), newLive(), pendingRestart(), restartOnlyKeyNames(), liveWith(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplySwapsEveryLiveKey() (+17 more)

### Community 180 - "go_pkg_net_http"
Cohesion: 0.12
Nodes (12): smfPathFor(), dialRequest, dialResponse, recoverPanics(), requestLogger(), requestUser(), TestRecoverPanics_LetsAbortHandlerThrough(), TestRequestLogger_OutsideTheChain() (+4 more)

### Community 182 - "runChecks"
Cohesion: 0.14
Nodes (30): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), basisMoved(), createCookieJar(), jsonFindings() (+22 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 185 - "expectLogged"
Cohesion: 0.21
Nodes (21): expectLogged(), gatewayClient(), gatewayDir(), route(), startServe(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_WithManagedRouting() (+13 more)

### Community 188 - "smf.go"
Cohesion: 0.17
Nodes (8): headerHasToken(), isWebSocketUpgrade(), parseSMFPath(), pipe(), sameOriginSocket(), upgradeScheme(), writeSwitch(), smfPath

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **162 isolated node(s):** `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint`, `jsdom` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1278 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `checksums`, `managed.go`, `backup.go`, `managed-api.ts`, `Provisioned Mode`, `net/http.ResponseWriter`, `newWFix`, `pages_test.go`, `Developer Guide`, `newManagedEnv`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 84 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.06247086247086247 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `queue-copy/ui.ts`, `connections/module.ts`, `loadModuleDOM`, `notification-center/index.ts`, `service-verify.ts`, `demo-flow.test.ts`, `boot.managed.ts`, `broker/store.ts`, `managed-service.ts`, `vite.config.ts`, `createGateway`, `ui-modal.ts`, `backup.ts`, `demo-flow.test.ts`, `connections/module.ts`, `panel.ts`, `logger.ts`, `managed-api.ts`, `shell-loader.test.ts`, `row-list/index.ts`, `managed-panel.test.ts`, `ui-modal.test.ts`, `router.ts`, `queue-source.ts`, `dest-provisioned.test.ts`, `solace-publisher.ts`, `package.json`, `provisioned-connection/index.ts`, `user-management/module.test.ts`, `gateway-settings/module.test.ts`, `rbac.ts`, `routes.test.ts`, `registry.test.ts`, `managed-api.ts`, `server/index.ts`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Are the 68 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 68 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._