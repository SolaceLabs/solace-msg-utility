# Graph Report - smu-dirty  (2026-11-16)

## Corpus Check
- 352 files · ~678,667 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .css 24, (none) 6, .dockerignore 1)

## Summary
- 5003 nodes · 16269 edges · 181 communities (147 shown, 34 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2226 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db1a08e5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- managed-profile.ts
- gateway/index.ts
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
- fixtures.ts
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
- dial.go
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- newCapturingLogger
- journal
- tls.go
- net/http.ResponseWriter
- time.Time
- managed-panel.test.ts
- user-management/module.test.ts
- session
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- createManagedPanel
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
- registry.test.ts
- loadStore
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- net.Conn
- SEMP v2 Paged Discovery (core library)
- Changing the TLS files
- Administration (`/solAdmin`)
- crypto/tls.Certificate
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
- backup/module.test.ts
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
- fileutil.go
- auditMissing
- quietLogger
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
- download.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- tlsWriteError
- queue-copy/module.ts
- backup_api_test.go
- utils.ts
- solace-client.ts
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
- managed-panel.ts
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- dest-provisioned.test.ts
- managed.test.ts
- managed-api.ts
- User Guide
- SEMP v1 Pagination (Queue Subscription Explorer)
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- contract_test.go
- settings_test.go
- loadOrGenerateServerCert
- Kernel.installModule
- gateway-settings/module.test.ts
- runChecks
- tsconfig.test.json
- main
- main_test.go
- compose.ts
- createUiEvents
- Two-factor sign-in
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
- `Test DOM` --references--> `readModuleTemplate()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts
- `Defensive-guard tests` --references--> `required()`  [INFERRED]
  docs/testing.md → src/core/dom.ts
- `Web suite` --references--> `EventBus`  [INFERRED]
  docs/testing.md → src/core/types.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
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

## Communities (181 total, 34 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.06
Nodes (54): adminHandler, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse() (+46 more)

### Community 1 - "managed-profile.ts"
Cohesion: 0.09
Nodes (19): DEFAULT_MAX_MESSAGES_PER_QUEUE, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionConfig, ConnectionCredentials, SempConfig, SolaceConfig (+11 more)

### Community 2 - "gateway/index.ts"
Cohesion: 0.04
Nodes (76): Restart gateway, The checks, clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE (+68 more)

### Community 3 - "backup_api.go"
Cohesion: 0.10
Nodes (23): diffByName(), mergeByName(), monthSlot(), nextRun(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders(), TestBackup_DiffShowsTwoFactor() (+15 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.07
Nodes (37): backupName(), fileOfSchedule(), newBackupService(), partialName(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocProblem() (+29 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "connections/module.ts"
Cohesion: 0.07
Nodes (38): Factory Pattern, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG (+30 more)

### Community 10 - "settings.ts"
Cohesion: 0.06
Nodes (60): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+52 more)

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
Nodes (86): allQueues(), BINARY_SAMPLE, buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key() (+78 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (34): Writing to the store, importStaged, sectionImport, checkRev(), countAdmins(), txn, wfix, classifyStoreError() (+26 more)

### Community 19 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.10
Nodes (12): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+4 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "fixtures.ts"
Cohesion: 0.04
Nodes (84): MANAGED_ERROR_CODES, listQueues(), listVpns(), seed(), DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm() (+76 more)

### Community 24 - "user-management/module.ts"
Cohesion: 0.07
Nodes (35): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+27 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (75): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+67 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (76): Event Handling, Module tests, vitest, createEventBus(), createManagedProfile(), AppContext, AppState, BusEvents (+68 more)

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
Cohesion: 0.05
Nodes (51): AppContext (Dependency Injection), Circular Dependency Resolution, EventBus (Cross-Module Communication), Key Concepts, The Module Contract, Integration tests, Solace mock, cloneMessage() (+43 more)

### Community 31 - "tls-certificates/module.ts"
Cohesion: 0.11
Nodes (21): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList(), TlsCertificatesOptions (+13 more)

### Community 32 - "backup.ts"
Cohesion: 0.04
Nodes (101): BACKUP_ITER, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser() (+93 more)

### Community 33 - "storecrypt_test.go"
Cohesion: 0.16
Nodes (17): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer() (+9 more)

### Community 34 - "dial.go"
Cohesion: 0.06
Nodes (27): auditor, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, writeRateLimited() (+19 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.08
Nodes (26): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+18 more)

### Community 38 - "newCapturingLogger"
Cohesion: 0.12
Nodes (33): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+25 more)

### Community 39 - "journal"
Cohesion: 0.15
Nodes (7): Layout of tests, syncDir(), TestSyncDir_ReportsAMissingDirectory(), writeTemp(), journal, atomicWrite(), tlsSeams

### Community 40 - "tls.go"
Cohesion: 0.17
Nodes (11): parseCertificatePEM(), pemCertificates(), readableName(), TestReadableName(), TestTrustFileName(), trustFileName(), tlsCertJSON, tlsManager (+3 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.15
Nodes (15): auditCall, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), userSaveAction(), writeError() (+7 more)

### Community 42 - "time.Time"
Cohesion: 0.14
Nodes (16): clientIP(), normalizeAddr(), prefixContains(), bucket, clientWatch, failures, fakeAfter, resolvedClient (+8 more)

### Community 43 - "managed-panel.test.ts"
Cohesion: 0.12
Nodes (17): ConnectionsModule, account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, makeCtx() (+9 more)

### Community 44 - "user-management/module.test.ts"
Cohesion: 0.14
Nodes (18): NO_OPERATE, NO_READ_ONLY, ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden() (+10 more)

### Community 45 - "session"
Cohesion: 0.18
Nodes (12): activeTicket, session, clearSigninCookie(), expired(), newSigninTickets(), setSigninCookie(), TestSigninCookie_Attributes(), ticketExpired() (+4 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.20
Nodes (22): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+14 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.18
Nodes (37): commitStep, commitJournal(), newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter() (+29 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (35): clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient(), twoFactorEnrolMsg() (+27 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 52 - "createManagedPanel"
Cohesion: 0.19
Nodes (16): isSessionEnded(), createManagedPanel(), adopt(), clearSession(), connectError(), connectFailed(), connectSemp(), connectSolace() (+8 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.15
Nodes (13): QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+5 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.09
Nodes (27): TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult, entitled() (+19 more)

### Community 56 - "newTestCert"
Cohesion: 0.09
Nodes (44): mustRead(), testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), probeWritable(), recoverTLSPair(), equalCertJSON() (+36 more)

### Community 57 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 58 - "configfile.go"
Cohesion: 0.05
Nodes (86): checkAuditOnFailure(), flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), checkModuleIDs(), checkRenamedEnv(), configVerifier() (+78 more)

### Community 59 - "Testing"
Cohesion: 0.11
Nodes (17): Broker details, Contents, Coverage policy, Demo and fake gateway suite, End-to-end run, Go suite, How the tests are organized, Requirements (+9 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "pwaHandler"
Cohesion: 0.15
Nodes (6): hostedHandler, fileResolvable(), TestRecordingResponseWriter_DefaultStatus(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 63 - "defaultConfig"
Cohesion: 0.06
Nodes (46): Adding a gateway config.yaml setting, accessConfig, TestAudit_ReopenFailureLosesTheRecordLoudly(), auditSettings, config, prefixStrings(), configSource, live (+38 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (66): savedUser, currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putUser(), runImport() (+58 more)

### Community 66 - "registry.test.ts"
Cohesion: 0.20
Nodes (5): src/main.ts application bootstrap, modules, ACTIVE_MODULES, loadRegistry(), injectModuleTemplates plugin

### Community 67 - "loadStore"
Cohesion: 0.11
Nodes (28): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture() (+20 more)

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

### Community 73 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "Changing the TLS files"
Cohesion: 0.20
Nodes (8): Adding a sign-in step, Changing the TLS files, Gateway and Admin How-tos, Laying out an admin page, need(), TestNeed_RuleOverEveryModeAdminAndEnrolment(), totpGuard, GatewayFaults

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.20
Nodes (10): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Messages about the gateway's files, Opening the admin app, Restart gateway, Saving at the same time as someone else (+2 more)

### Community 77 - "crypto/tls.Certificate"
Cohesion: 0.31
Nodes (4): certHolder, newCertHolder(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 78 - "backup.go"
Cohesion: 0.06
Nodes (20): connName(), userName(), changedOnDiskError, clientCtxKey, clientGoneError, hostedInfo, restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks() (+12 more)

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
Nodes (31): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+23 more)

### Community 93 - "newFakeClock"
Cohesion: 0.15
Nodes (37): fakeClock, fixed(), newSessions(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessionOf_ContextRoundTrip(), TestSessions_AbsoluteExpiry() (+29 more)

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
Cohesion: 0.13
Nodes (27): checkTwoFactor(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret(), TestQRSVG_DrawsTheCodeWithItsQuietZone() (+19 more)

### Community 100 - "smf_test.go"
Cohesion: 0.15
Nodes (19): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestParseSMFPath(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation() (+11 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.test.ts"
Cohesion: 0.08
Nodes (42): answerConfirm(), confirmOpen(), ADMIN, answer(), choose(), click(), downloadMock, el() (+34 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.09
Nodes (24): Administer, Audit settings, Back up and restore, Certificates from the console, Configure, Connection modes, Contents, Environment variables (+16 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.06
Nodes (56): SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+48 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "core/types.ts"
Cohesion: 0.08
Nodes (37): DeploymentConfig, filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, AccessLevel (+29 more)

### Community 111 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 112 - "createVpnSwitch"
Cohesion: 0.14
Nodes (13): TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+5 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 114 - "README"
Cohesion: 0.25
Nodes (5): Contents, Developer Guide, Project Structure, Testing, README

### Community 115 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 118 - "pages.ts"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 119 - "fileutil.go"
Cohesion: 0.20
Nodes (12): checkJournalName(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers(), sweepLeftoversOf(), TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal() (+4 more)

### Community 120 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 121 - "quietLogger"
Cohesion: 0.10
Nodes (31): TestSweepLeftovers_ADataDirectoryThatIsAFile(), dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+23 more)

### Community 122 - "queue-source.ts"
Cohesion: 0.08
Nodes (44): SempContext, buildBrokerUrl(), managedErrorMessage(), createServiceSemp(), connect(), log, SempConnectionHooks, sempErrorText (+36 more)

### Community 123 - "backup_test.go"
Cohesion: 0.12
Nodes (34): newBackupKey(), openBackup(), sealBackup(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_ABackupWithTheRemovedTLSPathKeysOpensAndTheyAreNotChanges() (+26 more)

### Community 124 - "Developer Guide"
Cohesion: 0.18
Nodes (10): Code Conventions, CSS, DOM Access, Error Handling, File Organization, Linting, Logging standard, Modals (+2 more)

### Community 125 - "relay_test.go"
Cohesion: 0.13
Nodes (23): errReader, fakeBroker, isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers() (+15 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.11
Nodes (42): dialBody(), TestDial_ConnectsAreRateLimitedPerUser(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals(), TestSecret_OnlyJSONCarriesIt(), TestBuildManagedRoutes_GatesByMode() (+34 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.06
Nodes (55): icons, MAX_BROWSER_BINDINGS, showPayload(), log, QueueBrowserModule, attachmentBytes(), AttachmentPayload, binaryPayload() (+47 more)

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.05
Nodes (75): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+67 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (34): decodeTo(), expectInvalid(), expectRev(), managedEnv, jsonBody(), scheduleBody(), staleBasis(), TestBackupAPI_ActionsAreAudited() (+26 more)

### Community 139 - "utils.ts"
Cohesion: 0.13
Nodes (25): escapeHtml(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains() (+17 more)

### Community 140 - "solace-client.ts"
Cohesion: 0.12
Nodes (17): gatewayWsUrl(), CONNECT_IN_PROGRESS, ConnectStart, createServiceSolace(), cleanup(), cleanupAll(), connect(), disconnect() (+9 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.06
Nodes (45): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+37 more)

### Community 148 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (58): sessionEnders(), TestBackup_SharedVector(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), TestContract_Validation() (+50 more)

### Community 155 - "keyfile_test.go"
Cohesion: 0.35
Nodes (11): createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey() (+3 more)

### Community 156 - "managed-panel.ts"
Cohesion: 0.07
Nodes (25): Adding a New Module, pickQueue() reusable picker, confirmDialog(), ConfirmOptions, attachBackdropClose(), required(), setError(), TwoFactorState (+17 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "dest-provisioned.test.ts"
Cohesion: 0.10
Nodes (17): connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling(), dialMock, El (+9 more)

### Community 163 - "managed.test.ts"
Cohesion: 0.09
Nodes (45): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+37 more)

### Community 165 - "managed-api.ts"
Cohesion: 0.04
Nodes (65): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), createGate(), GateOptions, ModuleGate (+57 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 167 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 171 - "contract_test.go"
Cohesion: 0.15
Nodes (22): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+14 more)

### Community 174 - "settings_test.go"
Cohesion: 0.14
Nodes (33): expectStale(), assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv (+25 more)

### Community 178 - "loadOrGenerateServerCert"
Cohesion: 0.12
Nodes (14): browserKeyProblem(), fileExists(), loadOrGenerateServerCert(), parseKeyPEM(), TestBrowserKeyProblem(), TestFileExists(), TestGenerateSelfSigned_CreatesValidKeypair(), TestLoadOrGenerateServerCert_GeneratedPairIsABootstrap() (+6 more)

### Community 180 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 181 - "gateway-settings/module.test.ts"
Cohesion: 0.19
Nodes (16): ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx(), pressed(), RESTART_ONLY (+8 more)

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
Cohesion: 0.08
Nodes (48): acceptWatch, hostedEnv(), insecureEnv(), showAuditEnv(), loadConfig(), main(), parseHosted(), parseInsecureSkipVerify() (+40 more)

### Community 189 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 190 - "Two-factor sign-in"
Cohesion: 0.20
Nodes (10): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+2 more)

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
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `backup_test.go`, `managed-api.ts`, `net/http.ResponseWriter`, `Changing the TLS files`, `checksums`, `store`, `newManagedEnv`, `defaultConfig`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **Are the 116 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 116 INFERRED edges - model-reasoned connections that need verification._
- **What connects `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.05817028027498678 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `user-management/module.ts`, `writer_test.go`, `managed-panel.ts`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Should `managed-profile.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._