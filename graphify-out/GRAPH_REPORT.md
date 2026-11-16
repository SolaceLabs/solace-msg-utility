# Graph Report - smu-dirty  (2026-11-16)

## Corpus Check
- 352 files · ~679,454 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .css 24, (none) 6, .dockerignore 1)

## Summary
- 5004 nodes · 16275 edges · 197 communities (159 shown, 38 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2231 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5cbdc2d9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- connections/types.ts
- createGateway
- backup_api.go
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- connections/module.ts
- settings.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- broker/store.ts
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- user-management/module.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- ui-modal.ts
- tls-certificates/module.ts
- backup.ts
- storecrypt_test.go
- auditor
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- live
- log/slog.Logger
- tls.go
- net/http.ResponseWriter
- time.Time
- gateway/index.ts
- user-management/module.test.ts
- fixtures.ts
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- ui-modal.test.ts
- variants.test.ts
- gateway/types.ts
- tests variants
- newTestCert
- vite-build.mjs
- configfile.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- pwaHandler
- defaultConfig
- Managed Variant (RBAC)
- store_test.go
- queue-source.ts
- sealer
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- router.ts
- SEMP v2 Paged Discovery (core library)
- backup_test.go
- Administration (`/solAdmin`)
- broker/store.ts
- backup.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- checksums
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- CSS Organization
- Module Isolation
- .checkSettings
- tls.ts
- newFakeClock
- entitled
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- backup/module.ts
- Provisioned Mode
- ui-modal.test.ts
- Deployment Options
- core/types.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- parseSetCookie
- createVpnSwitch
- <!-- @module-templates --> marker
- README
- Code Standards
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- pages.ts
- serveUntilStopped
- auditMissing
- trustHolder
- queue-source.ts
- backup_test.go
- Developer Guide
- relay_test.go
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
- settings.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- tlsWriteError
- queue-copy/module.ts
- backup_api_test.go
- utils.ts
- managed-profile.ts
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- Writing tests
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- keyfile_test.go
- quietLogger
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- dest-provisioned.test.ts
- provisioned-connection/index.ts
- writeError
- managed.test.ts
- server/index.ts
- managed-api.ts
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- dial.go
- contract_test.go
- Audit trail
- Cutting a release
- settings_test.go
- connection-management/service.ts
- Configure
- Module 3: Queue Copy
- loadOrGenerateServerCert
- verifyViaSempV1
- Kernel.installModule
- gateway-settings/module.test.ts
- runChecks
- tsconfig.test.json
- main
- main_test.go
- net/http.Header
- compose.ts
- vitest.config.ts
- How the tests are organized
- Two-factor sign-in
- clientGoneError
- importInvalidError
- writeFailedError
- ManagedDialer
- issueCert
- Setup

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 171 edges
2. `vitest` - 120 edges
3. `store` - 96 edges
4. `quietLogger()` - 91 edges
5. `AppContext` - 69 edges
6. `managedHandler` - 68 edges
7. `loadModuleDOM()` - 64 edges
8. `writeFile()` - 63 edges
9. `runChecks()` - 61 edges
10. `completeContext()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `Test DOM` --references--> `readModuleTemplate()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
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

## Communities (197 total, 38 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.08
Nodes (41): gateway config struct + loadConfig, root mux (hosted/proxy/pwa routing), validateConnModes(), accessLog(), appIndexFile(), contextWithTarget(), firstSegment(), hostedHandler (/hosted endpoint) (+33 more)

### Community 1 - "connections/types.ts"
Cohesion: 0.33
Nodes (3): ConnectionConfig, ConnectionCredentials, config

### Community 2 - "createGateway"
Cohesion: 0.10
Nodes (39): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+31 more)

### Community 3 - "backup_api.go"
Cohesion: 0.16
Nodes (16): diffByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo, backupRunJSON, backupScheduleJSON (+8 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.10
Nodes (15): backupName(), fileOfSchedule(), newBackupService(), partialName(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem(), TestBackupService_LoadRefusesADamagedSchedule(), backupRun (+7 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "connections/module.ts"
Cohesion: 0.07
Nodes (42): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+34 more)

### Community 10 - "settings.ts"
Cohesion: 0.07
Nodes (48): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+40 more)

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
Cohesion: 0.05
Nodes (57): buildMessage(), getQueue(), removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump() (+49 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.13
Nodes (29): txn, wfix, classifyStoreError(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestTxn_StagingAPathTwiceKeepsTheLast() (+21 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "routes.test.ts"
Cohesion: 0.06
Nodes (32): productSources(), readSource(), REPO_ROOT, bootAfterLoader(), call(), CLIENT, FAULTS, GOLDEN (+24 more)

### Community 24 - "user-management/module.ts"
Cohesion: 0.05
Nodes (48): Adding a New Module, DOM Access, Laying out an admin page, pickQueue() reusable picker, ConfirmOptions, AdminTableOptions, createRowList(), addRow() (+40 more)

### Community 25 - "pages_test.go"
Cohesion: 0.13
Nodes (72): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, isEnrolled() (+64 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (85): Event Handling, Integration tests, vitest, createEventBus(), createManagedProfile(), AppContext, AppState, BusEvents (+77 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (43): basic(), bcheck(), bindInQueueBrowser(), bindQueue(), broker, brokerSecrets, check(), closers (+35 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (50): RFC-5280, RFC-6238, aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString(), BROKER_FIELDS (+42 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.12
Nodes (18): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES (+10 more)

### Community 30 - "ui-modal.ts"
Cohesion: 0.08
Nodes (34): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+26 more)

### Community 31 - "tls-certificates/module.ts"
Cohesion: 0.07
Nodes (42): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList(), TlsCertificatesModule (+34 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (60): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+52 more)

### Community 33 - "storecrypt_test.go"
Cohesion: 0.19
Nodes (15): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer(), TestSealer_ADocumentThatDoesNotEncodeIsAFailedWrite(), TestSealer_DocVerifier() (+7 more)

### Community 34 - "auditor"
Cohesion: 0.08
Nodes (24): auditor, configSource, newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), TestRootHandler_WithManagedRouting() (+16 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.05
Nodes (35): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel (+27 more)

### Community 38 - "live"
Cohesion: 0.10
Nodes (37): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+29 more)

### Community 39 - "log/slog.Logger"
Cohesion: 0.08
Nodes (26): Layout of tests, checkJournalName(), commitJournal(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers() (+18 more)

### Community 40 - "tls.go"
Cohesion: 0.13
Nodes (15): clip(), parseCertificatePEM(), pemCertificates(), readableName(), TestReadableName(), TestTrustFileName(), trustFileName(), tlsCertAnswerJSON (+7 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (16): Changing the TLS files, auditCall, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), userSaveAction() (+8 more)

### Community 42 - "time.Time"
Cohesion: 0.08
Nodes (30): activeTicket, monthSlot(), nextRun(), TestBackup_NextRun(), bucket, clientWatch, failures, fakeAfter (+22 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.06
Nodes (35): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewaySnapshot, PageResult, responseHeaders(), SignInResult (+27 more)

### Community 44 - "user-management/module.test.ts"
Cohesion: 0.14
Nodes (18): NO_OPERATE, NO_READ_ONLY, ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden() (+10 more)

### Community 45 - "fixtures.ts"
Cohesion: 0.12
Nodes (33): listQueues(), listVpns(), DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm(), firstVisit(), PanelOptions (+25 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.22
Nodes (21): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+13 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.19
Nodes (35): commitStep, newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter(), newJFix() (+27 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (38): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+30 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 52 - "ui-modal.test.ts"
Cohesion: 0.09
Nodes (31): SolacePublisher, ManagedSession, CopyMode, createInitialState(), DestCredMode, DestForm, DestPrefillSnapshot, DestTarget (+23 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.10
Nodes (26): QueueCopyModule, ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES (+18 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.07
Nodes (39): TwoFactorState, createManagedService(), DialResponse, ManagedConnection, ManagedProfile, ManagedVpn, QGlob, TwoFactorMode (+31 more)

### Community 56 - "newTestCert"
Cohesion: 0.10
Nodes (40): testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), probeWritable(), equalCertJSON(), fingerprintOf(), keyBodyLine() (+32 more)

### Community 57 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 58 - "configfile.go"
Cohesion: 0.05
Nodes (85): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), checkAuditOnFailure(), checkModuleIDs(), checkRenamedEnv(), configVerifier(), decodeConfigFile() (+77 more)

### Community 59 - "Testing"
Cohesion: 0.14
Nodes (13): Broker details, Contents, Coverage policy, End-to-end run, Gateway contract cases, Requirements, Running the tests, Testing (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "pwaHandler"
Cohesion: 0.11
Nodes (7): deadHijacker, fileResolvable(), TestRecordingResponseWriter_DefaultStatus(), TestRecordingResponseWriter_HijackWithoutSupport(), pwaHandler, recordingResponseWriter, pipe()

### Community 63 - "defaultConfig"
Cohesion: 0.09
Nodes (26): flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), newLive(), pendingRestart(), restartOnlyKeyNames(), TestFileConfig_EveryKeyIsClassifiedOnce() (+18 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.08
Nodes (91): newCapturingLogger(), savedUser, loadStore(), bootstrapFixture(), currentConn(), currentUser(), enrolViewer(), envOf() (+83 more)

### Community 66 - "queue-source.ts"
Cohesion: 0.12
Nodes (25): ProvisionedTarget, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+17 more)

### Community 67 - "sealer"
Cohesion: 0.20
Nodes (9): mustSealer(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), newSealer(), storeHeader(), TestNewSealer_TakesOnlyA32ByteKey() (+1 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (29): auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+21 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "router.ts"
Cohesion: 0.17
Nodes (30): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+22 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "backup_test.go"
Cohesion: 0.17
Nodes (25): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocYAML(), TestBackup_SessionEndersNameTwoFactorChanges(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor() (+17 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.15
Nodes (27): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), MockQueue, PAYLOAD_TEMPLATES, publish() (+19 more)

### Community 78 - "backup.go"
Cohesion: 0.07
Nodes (13): changedOnDiskError, hostedInfo, parseRelayPath(), safeSegment(), relayPath, TestRestartInPlace_ExitsWithStatusZero(), TestRestartInPlace_AFailedExecNamesTheProgramAndKeepsTheCause(), TestRestartInPlace_AnUnknownExecutableIsNotExecd() (+5 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

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

### Community 91 - ".checkSettings"
Cohesion: 0.33
Nodes (5): apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 92 - "tls.ts"
Cohesion: 0.09
Nodes (31): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+23 more)

### Community 93 - "newFakeClock"
Cohesion: 0.15
Nodes (37): fakeClock, fixed(), newSessions(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+29 more)

### Community 94 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+63 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.10
Nodes (31): checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestCheckTwoFactor() (+23 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (28): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt(), fakeAnswer (+20 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), managedRequest(), describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad() (+40 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.15
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.11
Nodes (28): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+20 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "core/types.ts"
Cohesion: 0.14
Nodes (21): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, canOperate() (+13 more)

### Community 111 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 112 - "createVpnSwitch"
Cohesion: 0.08
Nodes (21): confirmDialog(), MAX_MESSAGES_PER_QUEUE, TaggedLogger, ui, createVpnSwitch(), connectTo(), fail(), finish() (+13 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "pages.ts"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 119 - "serveUntilStopped"
Cohesion: 0.10
Nodes (17): logStartup(), modeName(), recoverPanics(), TestLogStartup_ShowsAtEveryLevel(), TestRecoverPanics_LetsAbortHandlerThrough(), withRequestInfo(), main(), printVersionIfRequested() (+9 more)

### Community 120 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 121 - "trustHolder"
Cohesion: 0.13
Nodes (9): certHolder, dialUpstreamTLS(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), newCertHolder(), newTLSManager(), newTrustHolder(), TestTrustHolder_ChangesRunTheHooksOnlyWhenSomethingChanged(), trustHolder (+1 more)

### Community 122 - "queue-source.ts"
Cohesion: 0.10
Nodes (31): createService (subscription-explorer), fetchAllSubscriptions, SempContext, createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath() (+23 more)

### Community 123 - "backup_test.go"
Cohesion: 0.12
Nodes (34): newBackupKey(), openBackup(), sealBackup(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_ABackupWithTheRemovedTLSPathKeysOpensAndTheyAreNotChanges() (+26 more)

### Community 124 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 125 - "relay_test.go"
Cohesion: 0.13
Nodes (23): errReader, fakeBroker, isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers() (+15 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.21
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle() (+14 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.04
Nodes (75): Circular Dependency Resolution, send(), escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, showPayload(), log (+67 more)

### Community 132 - "settings.ts"
Cohesion: 0.12
Nodes (25): cidrList(), clone(), connModesProblem(), createSettings(), fileDefaults(), ipv6Groups(), ipv6String(), Kind (+17 more)

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (41): DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DEST_TARGET_LOCKED_TITLE, DestConnStatus (+33 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (35): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+27 more)

### Community 139 - "utils.ts"
Cohesion: 0.14
Nodes (22): formatBytes(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains() (+14 more)

### Community 140 - "managed-profile.ts"
Cohesion: 0.05
Nodes (64): DEFAULT_MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, SempConfig, SolaceConfig, buildBrokerUrl(), gatewayWsUrl(), managedErrorMessage() (+56 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.10
Nodes (29): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+21 more)

### Community 148 - "Writing tests"
Cohesion: 0.20
Nodes (9): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+1 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.07
Nodes (52): Writing to the store, connName(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), userName(), brokerTarget, clientRec (+44 more)

### Community 155 - "keyfile_test.go"
Cohesion: 0.40
Nodes (10): createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey() (+2 more)

### Community 156 - "quietLogger"
Cohesion: 0.16
Nodes (25): adminHandler, dropSessionCookie(), newAdminHandler(), newReverseProxy(), newUpstreamTransport(), TestAdminHandler_DisabledIs404(), TestAdminHandler_DoesNotFallBackToTheSPA(), TestAdminHandler_EnabledButNotDeployed() (+17 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "dest-provisioned.test.ts"
Cohesion: 0.10
Nodes (17): destinationRefusal(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling(), dialMock (+9 more)

### Community 161 - "provisioned-connection/index.ts"
Cohesion: 0.12
Nodes (13): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+5 more)

### Community 162 - "writeError"
Cohesion: 0.16
Nodes (9): writeError(), writeRateLimited(), isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), TestParseSMFPath(), upgradeScheme(), smfPath (+1 more)

### Community 163 - "managed.test.ts"
Cohesion: 0.09
Nodes (42): ManagedDemo, authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), button(), connectionReference() (+34 more)

### Community 164 - "server/index.ts"
Cohesion: 0.20
Nodes (16): delay(), RESTART_PAUSE_MS, handleSemp(), hostedResponse(), installMockServer(), json(), MockRoute, MockServerOptions (+8 more)

### Community 165 - "managed-api.ts"
Cohesion: 0.04
Nodes (51): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), createGate(), GateOptions, ModuleGate (+43 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "dial.go"
Cohesion: 0.19
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 171 - "contract_test.go"
Cohesion: 0.13
Nodes (24): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+16 more)

### Community 172 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 173 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 174 - "settings_test.go"
Cohesion: 0.10
Nodes (52): assertNoTempFiles(), TestRecoverPanics_LogsAndAnswers500(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), logLine() (+44 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 176 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 177 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 178 - "loadOrGenerateServerCert"
Cohesion: 0.09
Nodes (24): go-web-proxy main (gateway entrypoint), appendPEMCerts(), browserKeyProblem(), buildTrustPool(), fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), parseKeyPEM() (+16 more)

### Community 179 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 180 - "Kernel.installModule"
Cohesion: 0.29
Nodes (4): Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start()

### Community 181 - "gateway-settings/module.test.ts"
Cohesion: 0.16
Nodes (18): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx() (+10 more)

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (38): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), createCookieJar() (+30 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "main"
Cohesion: 0.09
Nodes (27): playwright-core, aliasLookup(), askLine(), askSecret(), browserOn(), checkedAlias(), collectDetails(), COMPOSE (+19 more)

### Community 185 - "main_test.go"
Cohesion: 0.12
Nodes (37): acceptWatch, levelName(), TestLevelName(), envOr(), loadConfig(), parseLogLevel(), expectLogged(), gatewayClient() (+29 more)

### Community 186 - "net/http.Header"
Cohesion: 0.33
Nodes (4): dropSessionSetCookie(), TestDropSessionSetCookie(), headerHasToken(), writeSwitch()

### Community 188 - "vitest.config.ts"
Cohesion: 0.33
Nodes (3): moduleRegistryPlugin(), TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 189 - "How the tests are organized"
Cohesion: 0.40
Nodes (5): Demo and fake gateway suite, Go suite, How the tests are organized, Type check and lint, Web suite

### Community 190 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 195 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 202 - "Setup"
Cohesion: 0.33
Nodes (6): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint`, `jsdom` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1187 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed.go`, `backup_test.go`, `managed-api.ts`, `net/http.ResponseWriter`, `checksums`, `writer_test.go`, `configfile.go`, `newManagedEnv`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Are the 116 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 116 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.07770582793709528 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `user-management/module.ts`, `store`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Should `createGateway` be split into smaller, more focused modules?**
  _Cohesion score 0.0966183574879227 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._