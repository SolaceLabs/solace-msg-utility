# Graph Report - smu-dirty  (2026-11-19)

## Corpus Check
- 364 files · ~735,763 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5286 nodes · 17277 edges · 182 communities (149 shown, 33 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2361 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f9c8b22e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- quietLogger
- createManagedPanel
- .saveUser
- createGateway
- semp-client Test Suite
- Architecture
- backupService
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- newStoreWithFixtures
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- openBackup
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- connections/module.test.ts
- pages_test.go
- loadModuleDOM
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- backup.go
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tlsManager
- net/http.ResponseWriter
- time.Time
- row-list/index.ts
- sealer
- contract.test.ts
- ui.selectMessage
- quietLogger
- fileutil_test.go
- authPages
- auditFor
- queue-discovery index.html
- download.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- access-test.ts
- gateway/index.ts
- Developer Guide
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- testHasher
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
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- relay_test.go
- Administration (`/solAdmin`)
- module-registry-plugin.mjs
- dial.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- journal
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- backup_test.go
- Queue Browser Internal Architecture
- utils.ts
- CSS Organization
- Writing to the store
- configfile_test.go
- rbac.ts
- backupService
- MockEmitter
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- gateway-settings/module.ts
- createUiEvents
- newSealer
- Deployment Options
- broker/store.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- .serveIndex
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- managed-api.ts
- parseSetCookie
- user-management/service.ts
- createPages
- tls_api.go
- auditMissing
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- queue-copy/module.ts
- backup_api_test.go
- serveUntilStopped
- managed-api.ts
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
- vite-build.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- createQueuePicker
- net.Conn
- settingsFile
- runDirectChecks
- User Guide
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- csp.mjs
- End-to-end run
- settings_test.go
- newCapturingLogger
- provisioned-connection/index.ts
- tls_test.go
- Configure
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- compose.ts
- Setup
- verifyViaSempV1
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- checkedAlias
- Module 3: Queue Copy

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 102 edges
4. `store` - 96 edges
5. `AppContext` - 71 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 68 edges
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

## Communities (182 total, 33 thin omitted)

### Community 0 - "quietLogger"
Cohesion: 0.11
Nodes (24): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestPWAHandler_UnusableBundleStopsTheStart(), TestReverseProxy_BadPathReturns400() (+16 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.08
Nodes (43): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), isSessionEnded(), ConnectOutcome, ConnectPart, connectProvisioned() (+35 more)

### Community 2 - ".saveUser"
Cohesion: 0.27
Nodes (6): checkRev(), TestStore_OnChangeFiresAfterACommittedEdit(), TestStore_PersistErrorLeavesMemoryUnchanged(), TestStore_ReplacedConnectionsFileRefusesItsWrites(), TestStore_SaveUser_RevMovesOnlyWhenTheConsoleViewChanges(), txn

### Community 3 - "createGateway"
Cohesion: 0.07
Nodes (55): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+47 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backupService"
Cohesion: 0.16
Nodes (12): fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem(), TestBackupService_LoadRefusesADamagedSchedule() (+4 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+17 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.03
Nodes (125): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send() (+117 more)

### Community 10 - "newStoreWithFixtures"
Cohesion: 0.13
Nodes (21): passwordCheck, savedConn, savedUser, currentConn(), newStoreWithFixtures(), putConn(), putUser(), TestStore_CRUD_RaceSafe() (+13 more)

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

### Community 16 - "openBackup"
Cohesion: 0.21
Nodes (20): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), sampleBackup(), sealed() (+12 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.14
Nodes (31): wfix, classifyStoreError(), newStale(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestStoreErrors_UnwrapToTheirCause() (+23 more)

### Community 19 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.19
Nodes (23): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+15 more)

### Community 24 - "connections/module.test.ts"
Cohesion: 0.08
Nodes (21): DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, SEMP_PROBE_TIMEOUT_MS, TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish() (+13 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (83): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+75 more)

### Community 26 - "loadModuleDOM"
Cohesion: 0.03
Nodes (105): Cross-references, Defensive-guard tests, Module tests, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests (+97 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (48): playwright-core, abort(), alive(), askLine(), askSecret(), basic(), broker, brokerSecrets (+40 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (52): RFC-5280, RFC-6238, freshCode(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString(), BROKER_FIELDS (+44 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "message.ts"
Cohesion: 0.07
Nodes (45): PayloadSample, buildMessage(), buildSample(), AuthenticationScheme, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType (+37 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.04
Nodes (67): Global hooks, diffLines(), formatUtc(), MAX_IMPORT_BYTES, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc() (+59 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (94): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+86 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.09
Nodes (29): ConnectionsModule, QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+21 more)

### Community 34 - "backup.go"
Cohesion: 0.03
Nodes (71): auditCategory, connName(), diffByName(), flattenSettings(), mergeByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders() (+63 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.06
Nodes (42): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+34 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (55): hostedInfo, validateConnModes(), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie(), fileResolvable() (+47 more)

### Community 39 - "contract_test.go"
Cohesion: 0.10
Nodes (28): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+20 more)

### Community 40 - "tlsManager"
Cohesion: 0.08
Nodes (21): browserKeyProblem(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem(), TestProbeWritable() (+13 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (20): auditCall, auditEntry, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+12 more)

### Community 42 - "time.Time"
Cohesion: 0.11
Nodes (21): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientWatch, newRateWindow(), failures (+13 more)

### Community 43 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 44 - "sealer"
Cohesion: 0.25
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeOptions, storeRole

### Community 45 - "contract.test.ts"
Cohesion: 0.05
Nodes (66): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+58 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "quietLogger"
Cohesion: 0.14
Nodes (44): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+36 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.16
Nodes (41): commitStep, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers(), crashAfter(), damageTemps() (+33 more)

### Community 49 - "authPages"
Cohesion: 0.11
Nodes (23): Adding a sign-in step, clientOf(), activeSession, signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), authPages (+15 more)

### Community 50 - "auditFor"
Cohesion: 0.21
Nodes (15): withClient(), auditFor(), TestAuditFor_ActorAndClient(), clientLogger(), clientString(), recoverPanics(), requestLogger(), requestUser() (+7 more)

### Community 52 - "download.ts"
Cohesion: 0.36
Nodes (6): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, Writable

### Community 53 - "routes.test.ts"
Cohesion: 0.04
Nodes (47): MANAGED_ERROR_CODES, VpnFixture, DEMO_GATEWAY_MARKER, pathEscape(), createConnectWindow(), createRequestBudget(), createThrottle(), Failures (+39 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.07
Nodes (35): AccessExplanation, QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore() (+27 more)

### Community 56 - "access-test.ts"
Cohesion: 0.15
Nodes (15): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+7 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.04
Nodes (69): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+61 more)

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

### Community 62 - "testHasher"
Cohesion: 0.21
Nodes (15): TestBackup_SharedVector(), checkPasswordPolicy(), newHasher(), parsePasswordHash(), passwordRuleError(), TestCheckPassphrase_FixedRule(), TestCheckPasswordPolicy(), TestHasher_CostIsReadFromStoredHash() (+7 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.11
Nodes (19): A lost phone, Administer, Back up and restore, Backups and two-factor, Choosing a mode, Contents, How it works, Provisioned Mode (+11 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (64): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), currentUser(), enrolViewer(), envOf(), err2s(), mustHash() (+56 more)

### Community 66 - "panel.ts"
Cohesion: 0.09
Nodes (44): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+36 more)

### Community 67 - "session"
Cohesion: 0.16
Nodes (10): activeTicket, gatedWriter, session, setSessionCookie(), TestSessionOf_ContextRoundTrip(), withSession(), sessionCtxKey, sessions (+2 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (27): Changing the TLS files, Gateway and Admin How-tos, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON (+19 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "file-kind.ts"
Cohesion: 0.07
Nodes (47): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+39 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "relay_test.go"
Cohesion: 0.14
Nodes (23): errReader, fakeBroker, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+15 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "module-registry-plugin.mjs"
Cohesion: 0.25
Nodes (13): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readVariant(), stripComments() (+5 more)

### Community 78 - "dial.go"
Cohesion: 0.13
Nodes (12): newDialer(), dialer, openSocket, rateWindow, isWebSocketUpgrade(), newSMFGate(), parseSMFPath(), sameOriginSocket() (+4 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "journal"
Cohesion: 0.11
Nodes (15): Layout of tests, checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftoversOf(), syncDir(), TestSyncDir_ReportsAMissingDirectory() (+7 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 86 - "backup_test.go"
Cohesion: 0.18
Nodes (22): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocYAML(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing() (+14 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "utils.ts"
Cohesion: 0.08
Nodes (36): generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString() (+28 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "Writing to the store"
Cohesion: 0.20
Nodes (9): Writing to the store, checksums, fileSum, connToOutput(), rowsToPerms(), userToOutput(), sameUserView(), TestSameUserView_TwoFactor() (+1 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (85): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), checkAuditOnFailure(), TestBackup_SettingsChangesNamesDottedKeys(), config, checkModuleIDs(), checkRenamedEnv(), configVerifier() (+77 more)

### Community 92 - "rbac.ts"
Cohesion: 0.03
Nodes (69): pickQueue() reusable picker, createService (subscription-explorer), ProvisionedConnectionCard, PickerCache, PickQueueOptions, PickQueueResult, Refs, State (+61 more)

### Community 93 - "backupService"
Cohesion: 0.19
Nodes (5): backupName(), partialName(), backupRun, backupService, ownershipHint()

### Community 95 - "newManagedEnv"
Cohesion: 0.08
Nodes (86): Auditing an action, auditLog, TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), changeUsersBehindTheWriter(), connsWrote(), managedEnv (+78 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.11
Nodes (32): checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret() (+24 more)

### Community 100 - "smf_test.go"
Cohesion: 0.11
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "gateway-settings/module.ts"
Cohesion: 0.20
Nodes (15): GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), pressed(), SETTINGS (+7 more)

### Community 105 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 106 - "newSealer"
Cohesion: 0.20
Nodes (9): mustSealer(), reseal(), TestBackup_RefusesContentItDoesNotRead(), wantProblem(), backupEnvelope, backupKDF, backupProblem, parseStoreKey() (+1 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "broker/store.ts"
Cohesion: 0.05
Nodes (90): The payload samples queue, PAYLOAD_SAMPLES, allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, dumpStore(), findQueueAnyVpn() (+82 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.08
Nodes (20): clientACL(), openAuditor(), auditor, configSource, hostedHandler, live, liveSettings, bodyDeadline() (+12 more)

### Community 112 - ".serveIndex"
Cohesion: 0.29
Nodes (3): adminHandler, setAppPageHeaders(), recordingResponseWriter

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "managed-api.ts"
Cohesion: 0.04
Nodes (77): Adding a New Module, DOM Access, Laying out an admin page, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage() (+69 more)

### Community 119 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), parseSetCookie(), noteCookies(), recordResponse(), tag()

### Community 120 - "user-management/service.ts"
Cohesion: 0.36
Nodes (5): createUserMgmtService(), UserList, userPath(), UserPayload, PAYLOAD

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "tls_api.go"
Cohesion: 0.33
Nodes (5): clip(), TestClip(), tlsCertAnswerJSON, tlsPairJSON, tlsTrustAddJSON

### Community 125 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 127 - "tls_api_test.go"
Cohesion: 0.22
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+14 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (102): AppContext (Dependency Injection), Circular Dependency Resolution, Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Integration tests (+94 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (43): ProvisionedTarget, formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets() (+35 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.13
Nodes (40): Build internals, Broker details, decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody() (+32 more)

### Community 139 - "serveUntilStopped"
Cohesion: 0.21
Nodes (6): certHolder, serveUntilStopped(), newCertHolder(), newTLSManager(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 140 - "managed-api.ts"
Cohesion: 0.04
Nodes (86): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+78 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.08
Nodes (32): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+24 more)

### Community 148 - "go_pkg_strings"
Cohesion: 0.07
Nodes (42): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+34 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.07
Nodes (51): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), contractStores, flexStr (+43 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 162 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 163 - "settingsFile"
Cohesion: 0.20
Nodes (7): Gateway contract cases, apiError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), settingsFile, stagedSettings, newRefusal()

### Community 165 - "runDirectChecks"
Cohesion: 0.15
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 171 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 172 - "End-to-end run"
Cohesion: 0.17
Nodes (12): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, End-to-end run, Requirements (+4 more)

### Community 174 - "settings_test.go"
Cohesion: 0.10
Nodes (55): TestSeedConfigFile_GoesThroughTheJournal(), assertNoTempFiles(), logLine(), saveAnswer, decodeSave(), managedEnv, mustRead(), settingsRig() (+47 more)

### Community 176 - "newCapturingLogger"
Cohesion: 0.07
Nodes (33): TestRecoverPanics_LetsAbortHandlerThrough(), gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value (+25 more)

### Community 177 - "provisioned-connection/index.ts"
Cohesion: 0.12
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 178 - "tls_test.go"
Cohesion: 0.12
Nodes (45): testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), loadStandardRoots(), recoverTLSPair(), equalCertJSON(), fingerprintOf() (+37 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.13
Nodes (32): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), createCookieJar() (+24 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.10
Nodes (47): acceptWatch, envOr(), loadConfig(), newRootHandler(), expectLogged(), gatewayClient(), gatewayDir(), route() (+39 more)

### Community 188 - "Setup"
Cohesion: 0.40
Nodes (5): Build commands, Build-time feature flags, Building variants, Maintaining dependencies, Setup

### Community 190 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

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
Cohesion: 0.15
Nodes (15): aliasLookup(), checkedAlias(), keyLine(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule() (+7 more)

### Community 196 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1256 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `Writing to the store` to `store_test.go`, `.saveUser`, `managed.go`, `backupService`, `net/http.ResponseWriter`, `newStoreWithFixtures`, `log/slog.Logger`, `writer_test.go`, `managed-api.ts`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Are the 125 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 125 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `quietLogger` be split into smaller, more focused modules?**
  _Cohesion score 0.11153846153846154 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `Writing to the store`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 84 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._