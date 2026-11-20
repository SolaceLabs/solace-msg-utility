# Graph Report - smu-dirty  (2026-11-20)

## Corpus Check
- 364 files · ~738,261 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5290 nodes · 17315 edges · 187 communities (151 shown, 36 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2376 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0d31c1cf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp_test.go
- createManagedPanel
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- state.ts
- queue-source.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- user-management/module.test.ts
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- request
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- demo-flow.test.ts
- backup.ts
- demo-flow.test.ts
- backup.go
- Filter Messages Dialog
- connections/module.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tlsManager
- net/http.ResponseWriter
- time.Time
- router.ts
- loadStore
- contract.test.ts
- ui.selectMessage
- row-list/index.ts
- fileutil_test.go
- authPages
- tls.ts
- queue-discovery index.html
- managed-api.ts
- fixtures.ts
- gateway/types.ts
- tests variants
- panel.ts
- gateway/index.ts
- Developer Guide
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- samples.test.ts
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- panel.ts
- session
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- copy-flow.test.ts
- SEMP v2 Paged Discovery (core library)
- relay_test.go
- Administration (`/solAdmin`)
- sdt.ts
- log/slog.Logger
- pwaHandler
- DOM Template System
- Cross-Module Event Flow
- backup/module.test.ts
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- utils.ts
- CSS Organization
- checksums
- configfile_test.go
- verifyViaSempV1
- keyfile.go
- session.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- rbac.ts
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- Setup
- dest-provisioned.test.ts
- file-kind.ts
- Deployment Options
- broker/store.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- defaultConfig
- settings.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- user-management/service.ts
- runDirectChecks
- crypto/tls.Certificate
- createPages
- writer
- fileutil.go
- createQueuePicker
- socketRegistry
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- Two-factor sign-in
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- Module 2: Queue Browser
- backup_api_test.go
- trustHolder
- optional-field.test.ts
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- go_pkg_strings
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- .checkSettings
- vite-build.mjs
- connection-management/service.ts
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Configure
- issueCert
- Module 3: Queue Copy
- backup_api.go
- entitled
- createConnTabs
- User Guide
- auditMissing
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- testCertSpec
- importInvalidError
- End-to-end run
- tlsWriteError
- settings_test.go
- managed-profile.ts
- tls_test.go
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- compose.ts
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- checkedAlias

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 102 edges
4. `store` - 96 edges
5. `AppContext` - 71 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 64 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 54 edges

## Surprising Connections (you probably didn't know these)
- `What applies at once` --references--> `standardRoots`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/tls.go
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts
- `Defensive-guard tests` --references--> `required()`  [INFERRED]
  docs/testing.md → src/core/dom.ts
- `Web suite` --references--> `EventBus`  [INFERRED]
  docs/testing.md → src/core/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (187 total, 36 thin omitted)

### Community 0 - "totp_test.go"
Cohesion: 0.12
Nodes (31): checkTwoFactor(), groupSecret(), need(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor() (+23 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.10
Nodes (35): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+27 more)

### Community 2 - "writeFile"
Cohesion: 0.10
Nodes (43): mustRead(), writeFile(), testCertPair, encodeCertificates(), loadStandardRoots(), recoverTLSPair(), equalCertJSON(), fingerprintOf() (+35 more)

### Community 3 - "createGateway"
Cohesion: 0.08
Nodes (47): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), mockCode() (+39 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.07
Nodes (38): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), backupFixtureFrom(), newBackupFixture() (+30 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+17 more)

### Community 9 - "state.ts"
Cohesion: 0.03
Nodes (155): Solace mock, CardPart, ProvisionedConnectionCard, ProvisionedStatus, ProvisionedTarget, canOperate(), cloneMessage(), createSolacePublisher() (+147 more)

### Community 10 - "queue-source.ts"
Cohesion: 0.05
Nodes (44): ConnectionConfig, ConnectionCredentials, managedErrorMessage(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn() (+36 more)

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

### Community 16 - "user-management/module.test.ts"
Cohesion: 0.15
Nodes (16): NO_OPERATE, NO_READ_ONLY, ADMIN, CHOICES, clickRow(), el(), hidden(), listed() (+8 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.17
Nodes (25): TestStageSettings_RefusalsComeBackAsErrors(), wfix, classifyStoreError(), newStale(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler() (+17 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (26): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, moduleRegistryPlugin(), readVariant() (+18 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.12
Nodes (31): checkAuditOnFailure(), openAuditor(), signedInRecoveryMsg(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines() (+23 more)

### Community 24 - "request"
Cohesion: 0.25
Nodes (7): connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "vitest"
Cohesion: 0.02
Nodes (111): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Integration tests, createService (subscription-explorer) (+103 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (42): playwright-core, abort(), alive(), askLine(), askSecret(), basic(), broker, brokerSecrets (+34 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (54): RFC-5280, RFC-6238, freshCode(), issuesSession(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString() (+46 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.09
Nodes (28): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+20 more)

### Community 30 - "message.ts"
Cohesion: 0.10
Nodes (34): buildMessage(), buildSample(), publish(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode (+26 more)

### Community 31 - "demo-flow.test.ts"
Cohesion: 0.04
Nodes (68): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Writing tests (+60 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (59): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+51 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.10
Nodes (17): src/main.ts application bootstrap, modules, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+9 more)

### Community 34 - "backup.go"
Cohesion: 0.04
Nodes (38): diffByName(), flattenSettings(), mergeByName(), sameRecord(), settingsChanges(), sortedKeys(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders() (+30 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.03
Nodes (106): boot(), coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG (+98 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (49): hostedInfo, gateway config struct + loadConfig, root mux (hosted/proxy/pwa routing), validateConnModes(), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie() (+41 more)

### Community 39 - "contract_test.go"
Cohesion: 0.10
Nodes (27): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+19 more)

### Community 40 - "tlsManager"
Cohesion: 0.18
Nodes (11): parseCertificatePEM(), pemCertificates(), TestTrustFileName(), trustFileName(), warnIfExpiring(), tlsCertJSON, tlsManager, tlsStandardJSON (+3 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (16): auditCall, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+8 more)

### Community 42 - "time.Time"
Cohesion: 0.14
Nodes (16): clientIP(), normalizeAddr(), prefixContains(), bucket, clientWatch, failures, fakeAfter, loginLimits (+8 more)

### Community 43 - "router.ts"
Cohesion: 0.09
Nodes (44): docOf(), glob(), port(), totpDoc(), DEMO_GATEWAY_MARKER, createRouter(), handle(), match() (+36 more)

### Community 44 - "loadStore"
Cohesion: 0.13
Nodes (25): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+17 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.07
Nodes (43): connsProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk() (+35 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.05
Nodes (99): Layout of tests, commitStep, fakeClock, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers() (+91 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (33): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), TestAuditFor_ActorAndClient(), auditEntry, authPages (+25 more)

### Community 50 - "tls.ts"
Cohesion: 0.08
Nodes (35): parseBody(), CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error() (+27 more)

### Community 52 - "managed-api.ts"
Cohesion: 0.03
Nodes (102): Adding a New Module, DOM Access, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage() (+94 more)

### Community 53 - "fixtures.ts"
Cohesion: 0.06
Nodes (44): MANAGED_ERROR_CODES, DIRECT_BANNER, Fault, QUEUE_STATE, QueueState, resetScenario(), scenario, ScenarioState (+36 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.08
Nodes (31): QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult (+23 more)

### Community 56 - "panel.ts"
Cohesion: 0.18
Nodes (27): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), button(), connectionReference(), copyable() (+19 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.05
Nodes (48): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, Gateway, GatewayFaults, GatewaySnapshot, PageResult (+40 more)

### Community 58 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 59 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "samples.test.ts"
Cohesion: 0.13
Nodes (14): Connecting, Demo controls, Direct demo (`demo.html`), Opening the demo, The demo topology, The payload samples queue, What is not in the demo, PAYLOAD_SAMPLES (+6 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.15
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (71): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn() (+63 more)

### Community 66 - "panel.ts"
Cohesion: 0.15
Nodes (14): TLS_READ_ONLY_ID, QueueFixture, VpnFixture, connection(), DEMO_ACCOUNTS, DEMO_STANDARD_ROOTS, DEMO_TOPOLOGY, demoSeed() (+6 more)

### Community 67 - "session"
Cohesion: 0.28
Nodes (4): activeTicket, sessions, signinTickets, ticket

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (31): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connChanges() (+23 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "copy-flow.test.ts"
Cohesion: 0.12
Nodes (24): listQueues(), listVpns(), brokerVpns(), delay(), MOCK_HOST, handleSemp(), hostedResponse(), installMockServer() (+16 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "relay_test.go"
Cohesion: 0.12
Nodes (23): errReader, fakeBroker, isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers() (+15 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "sdt.ts"
Cohesion: 0.23
Nodes (13): block(), hasChildren(), inline(), integer(), INTEGER_TYPES, SdtEnums, SdtNode, toYaml() (+5 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.06
Nodes (29): setForwarded(), auditor, brokerTarget, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest (+21 more)

### Community 79 - "pwaHandler"
Cohesion: 0.18
Nodes (5): adminHandler, setAppPageHeaders(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "backup/module.test.ts"
Cohesion: 0.13
Nodes (22): diffLines(), formatUtc(), MAX_IMPORT_BYTES, ADMIN, answer(), choose(), click(), downloadMock (+14 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.25
Nodes (8): Contents, Demo accounts, Demo controls, Demos, How it differs from a real gateway, Provisioned demo (`provisioned-demo.html`), The demo brokers, Trying two-factor sign-in

### Community 86 - "testing.T"
Cohesion: 0.10
Nodes (44): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+36 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "utils.ts"
Cohesion: 0.08
Nodes (35): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, generateUuid(), isValidHost(), isValidPort() (+27 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (88): Adding a gateway config.yaml setting, Changing the TLS files, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), config, checkModuleIDs(), checkRenamedEnv(), configVerifier() (+80 more)

### Community 92 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

### Community 93 - "keyfile.go"
Cohesion: 0.24
Nodes (12): createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+4 more)

### Community 94 - "session.ts"
Cohesion: 0.07
Nodes (29): createEmitter(), MockEmitter, DIRECT_BROKER, createQueueBrowser(), interval(), pump(), MockQueueBrowser, SessionEventCode (+21 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv(), newManagedEnvFrom() (+63 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "rbac.ts"
Cohesion: 0.18
Nodes (16): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, explainAccess() (+8 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "Setup"
Cohesion: 0.17
Nodes (12): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, End-to-end run (+4 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.13
Nodes (23): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+15 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "broker/store.ts"
Cohesion: 0.14
Nodes (30): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), key(), MockQueue, PAYLOAD_TEMPLATES (+22 more)

### Community 111 - "defaultConfig"
Cohesion: 0.09
Nodes (23): configSource, hostedHandler, live, newLive(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), TestLive_ApplySwapsEveryLiveKey() (+15 more)

### Community 112 - "settings.ts"
Cohesion: 0.14
Nodes (22): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups() (+14 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "user-management/service.ts"
Cohesion: 0.11
Nodes (20): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+12 more)

### Community 119 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 120 - "crypto/tls.Certificate"
Cohesion: 0.27
Nodes (5): certHolder, newCertHolder(), newTLSManager(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "writer"
Cohesion: 0.06
Nodes (27): changedOnDiskError, clientGoneError, newSettingsFile(), settingsRig(), settingsBody, settingsFile, stagedSettings, staleError (+19 more)

### Community 123 - "fileutil.go"
Cohesion: 0.27
Nodes (9): checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftoversOf(), rollbackFailedError, stepPanic, txnRecord (+1 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "socketRegistry"
Cohesion: 0.21
Nodes (6): openSocket, socketRegistry, newSocketRegistry(), TestNewSocketRegistry_StartsAtTheCeilings(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked()

### Community 127 - "tls_api_test.go"
Cohesion: 0.21
Nodes (25): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+17 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (105): Circular Dependency Resolution, Laying out an admin page, Test DOM, vitest, readModuleTemplate(), escapeHtml(), solaceErrorText(), ui (+97 more)

### Community 132 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (34): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+26 more)

### Community 139 - "trustHolder"
Cohesion: 0.12
Nodes (24): serveUntilStopped(), dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400() (+16 more)

### Community 140 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (29): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+21 more)

### Community 148 - "go_pkg_strings"
Cohesion: 0.15
Nodes (29): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+21 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (55): Writing to the store, connName(), sessionEnders(), userName(), clientRec, connRec, connsDoc, TestContract_Validation() (+47 more)

### Community 155 - ".checkSettings"
Cohesion: 0.29
Nodes (6): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 156 - "vite-build.mjs"
Cohesion: 0.10
Nodes (20): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+12 more)

### Community 157 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 161 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 162 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 163 - "backup_api.go"
Cohesion: 0.23
Nodes (10): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+2 more)

### Community 164 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 165 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 172 - "End-to-end run"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.08
Nodes (58): TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect() (+50 more)

### Community 177 - "managed-profile.ts"
Cohesion: 0.06
Nodes (23): createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps, DEFAULT_MAX_MESSAGES_PER_QUEUE (+15 more)

### Community 178 - "tls_test.go"
Cohesion: 0.07
Nodes (38): TestRecoverPanics_LetsAbortHandlerThrough(), go-web-proxy main (gateway entrypoint), newCapturingLogger(), appendPEMCerts(), browserKeyProblem(), buildTrustPool(), fileExists(), formatFingerprint() (+30 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (42): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+34 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.07
Nodes (56): acceptWatch, boolEnv(), deadHijacker, envOr(), loadConfig(), main(), newRootHandler(), parseStrictBool() (+48 more)

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 194 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 195 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1256 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed.go`, `backup.go`, `net/http.ResponseWriter`, `defaultConfig`, `writer_test.go`, `managed-api.ts`, `checksums`, `configfile_test.go`, `newManagedEnv`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Are the 125 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 125 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.12462462462462462 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `store`?**
  _High betweenness centrality (0.161) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 84 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._