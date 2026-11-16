# Graph Report - smu-dirty  (2026-11-17)

## Corpus Check
- 352 files · ~689,436 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .css 24, (none) 6, .dockerignore 1)

## Summary
- 5037 nodes · 16479 edges · 200 communities (162 shown, 38 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2293 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c219ed93`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- currentUser
- createGateway
- backup_api.go
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- optional-field.test.ts
- settings.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- sdk.test.ts
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- fixtures.ts
- managed-api.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- fileConfigFromConfig
- tls-certificates/module.test.ts
- backup.ts
- storecrypt_test.go
- log/slog.Logger
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- live
- log/slog.Logger
- tls.go
- net/http.ResponseWriter
- time.Time
- gateway/index.ts
- session.ts
- panel.ts
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- Writing to the store
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
- settingsFile
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
- configfile_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- row-list/index.ts
- CSS Organization
- runDirectChecks
- loadConfig
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
- createManagedPanel
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- parseSetCookie
- createVpnSwitch
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- pages.ts
- logStartup
- session
- trustHolder
- rbac.ts
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
- createUiEvents
- utils.ts
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
- net.Conn
- throttle.test.ts
- defaultConfig
- managed.test.ts
- routes.test.ts
- crypto/tls.Certificate
- User Guide
- picker.test.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- secret
- contract_test.go
- Audit trail
- net/http.Handler
- settings_test.go
- connection-management/service.ts
- Configure
- wireUiEvents
- loadOrGenerateServerCert
- verifyViaSempV1
- Kernel.installModule
- npm-audit-gate.mjs
- runChecks
- tsconfig.test.json
- checkedAlias
- main_test.go
- net/http.Header
- compose.ts
- ref_node_path
- queue-source.test.ts
- Two-factor sign-in
- clientGoneError
- tls_api.go
- writeFailedError
- ManagedDialer
- issueCert
- QueueSource
- tls-certificates/service.test.ts
- restart.go
- createConnTabs

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 177 edges
2. `vitest` - 120 edges
3. `quietLogger()` - 99 edges
4. `store` - 96 edges
5. `managedHandler` - 69 edges
6. `AppContext` - 69 edges
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

## Communities (200 total, 38 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.05
Nodes (62): TestAudit_ReopenFailureLosesTheRecordLoudly(), newLive(), liveWith(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplySwapsEveryLiveKey(), TestLive_TwoFactorIsLive(), yamlLeaves() (+54 more)

### Community 1 - "currentUser"
Cohesion: 0.14
Nodes (29): savedConn, savedUser, currentConn(), currentUser(), newStoreWithFixtures(), putConn(), putUser(), TestStore_CRUD_RaceSafe() (+21 more)

### Community 2 - "createGateway"
Cohesion: 0.09
Nodes (46): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+38 more)

### Community 3 - "backup_api.go"
Cohesion: 0.15
Nodes (16): diffByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo, backupRunJSON, backupScheduleJSON (+8 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.07
Nodes (19): Architecture, code:block1 (+-----------------------------------------------------------), code:block10 (Solace Broker), code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';) (+11 more)

### Community 6 - "backup_test.go"
Cohesion: 0.10
Nodes (16): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem() (+8 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (23): changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell(), row() (+15 more)

### Community 9 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 10 - "settings.ts"
Cohesion: 0.08
Nodes (44): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+36 more)

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

### Community 16 - "sdk.test.ts"
Cohesion: 0.11
Nodes (28): buildMessage(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueType (+20 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (35): apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), txn, wfix, classifyStoreError(), newRefusal() (+27 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "fixtures.ts"
Cohesion: 0.09
Nodes (35): MANAGED_ERROR_CODES, Fault, QUEUE_STATE, resetScenario(), scenario, ScenarioState, seedState(), setBrokers() (+27 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (85): Adding a New Module, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog() (+77 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (80): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+72 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (127): Event Handling, Integration tests, Module tests, vitest, createNotificationCenter(), createEventBus(), createManagedProfile(), AppContext (+119 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (37): askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn(), closers, collectDetails() (+29 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (54): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), base32Decode() (+46 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.12
Nodes (18): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES (+10 more)

### Community 30 - "fileConfigFromConfig"
Cohesion: 0.11
Nodes (29): Writing a config.yaml by hand (development only), checkAuditOnFailure(), configVerifier(), decodeConfigFile(), defaultFileConfig(), encodeConfigFile(), fileConfigFromConfig(), onFailureOrDefault() (+21 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.15
Nodes (20): confirmOpen(), ADMIN, answer(), CA(), cert(), click(), el(), flush() (+12 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (58): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+50 more)

### Community 33 - "storecrypt_test.go"
Cohesion: 0.13
Nodes (18): checksums, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev() (+10 more)

### Community 34 - "log/slog.Logger"
Cohesion: 0.06
Nodes (27): auditCategory, auditor, configSource, newDialer(), dialer, live, liveSettings, buildManagedRoutes() (+19 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.04
Nodes (42): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel (+34 more)

### Community 38 - "live"
Cohesion: 0.15
Nodes (27): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+19 more)

### Community 39 - "log/slog.Logger"
Cohesion: 0.09
Nodes (21): Layout of tests, checkJournalName(), commitJournal(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers() (+13 more)

### Community 40 - "tls.go"
Cohesion: 0.15
Nodes (13): encodeCertificates(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), readableName(), equalCertJSON(), TestReadableName(), trustFileName() (+5 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.11
Nodes (21): auditCall, auditEntry, auditWriter, auditWrote, smfPathFor(), connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+13 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (18): bucket, clientWatch, newRateWindow(), failures, fakeAfter, lockedClock, rateWindow, expired() (+10 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.07
Nodes (32): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+24 more)

### Community 44 - "session.ts"
Cohesion: 0.10
Nodes (17): createEmitter(), MockEmitter, DIRECT_BROKER, createQueueBrowser(), interval(), pump(), MockQueueBrowser, QueueBrowserEventName (+9 more)

### Community 45 - "panel.ts"
Cohesion: 0.19
Nodes (26): authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS (+18 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.16
Nodes (26): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+18 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.19
Nodes (35): commitStep, newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter(), newJFix() (+27 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (33): clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), authPages (+25 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.26
Nodes (19): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+11 more)

### Community 52 - "Writing to the store"
Cohesion: 0.19
Nodes (11): Writing to the store, mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), importStaged, changeUsersBehindTheWriter(), sectionImport, checkRev() (+3 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.05
Nodes (45): BackupModule, QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+37 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.07
Nodes (37): DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore() (+29 more)

### Community 56 - "newTestCert"
Cohesion: 0.13
Nodes (32): testCertPair, testCertSpec, recoverTLSPair(), fingerprintOf(), keyBodyLine(), newTestCert(), newTLSFix(), pemOf() (+24 more)

### Community 57 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 58 - "configfile.go"
Cohesion: 0.10
Nodes (28): Adding a gateway config.yaml setting, config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog() (+20 more)

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

### Community 63 - "settingsFile"
Cohesion: 0.29
Nodes (3): settingsRig(), settingsFile, stagedSettings

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (60): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), enrolViewer(), envOf(), err2s(), mustHash(), newStoreFixture() (+52 more)

### Community 66 - "queue-source.ts"
Cohesion: 0.38
Nodes (10): Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope, sempQueueSource() (+2 more)

### Community 67 - "sealer"
Cohesion: 0.25
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeOptions, storeRole

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (26): Adding a sign-in step, Changing the TLS files, Gateway and Admin How-tos, Laying out an admin page, auditPre, bodyRev, clientJSON, clientSeenJSON (+18 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.10
Nodes (14): Architecture Notes, Code Standards, code:bash (npm install && npm test), code:ts (import { required } from '../../core/dom';), Contributing, Development Workflow, DOM Access, Error Handling (+6 more)

### Community 73 - "router.ts"
Cohesion: 0.13
Nodes (33): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+25 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "backup_test.go"
Cohesion: 0.21
Nodes (22): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocYAML(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing() (+14 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.09
Nodes (44): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key(), listQueues() (+36 more)

### Community 78 - "backup.go"
Cohesion: 0.07
Nodes (16): changedOnDiskError, dialRequest, fileSum, hostedInfo, parseRelayPath(), safeSegment(), relayPath, TestRestartInPlace_AFailedExecNamesTheProgramAndKeepsTheCause() (+8 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "configfile_test.go"
Cohesion: 0.24
Nodes (22): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+14 more)

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

### Community 88 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "runDirectChecks"
Cohesion: 0.15
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 91 - "loadConfig"
Cohesion: 0.10
Nodes (20): hostedEnv(), insecureEnv(), levelName(), showAuditEnv(), TestLevelName(), envOr(), loadConfig(), parseHosted() (+12 more)

### Community 92 - "tls.ts"
Cohesion: 0.08
Nodes (33): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+25 more)

### Community 93 - "newFakeClock"
Cohesion: 0.19
Nodes (21): fakeClock, newSessions(), newSigninTickets(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+13 more)

### Community 94 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (69): Auditing an action, auditLog, connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv(), newManagedEnvFrom() (+61 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.13
Nodes (26): groupSecret(), need(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestGroupSecret(), TestNeed_RuleOverEveryModeAdminAndEnrolment(), TestQRSVG_DrawsTheCodeWithItsQuietZone() (+18 more)

### Community 100 - "smf_test.go"
Cohesion: 0.12
Nodes (24): fakeAnswer, fakeSMFBroker, postTo(), sessionFromResponse(), signInBootstrapAdmin(), newFakeSMFBroker(), newSMFEnv(), TestParseSMFPath() (+16 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.07
Nodes (44): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad(), RFC-3339 (+36 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (92): Solace mock, SempContext, canOperate(), cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending() (+84 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "createManagedPanel"
Cohesion: 0.19
Nodes (16): isSessionEnded(), createManagedPanel(), adopt(), clearSession(), connectError(), connectFailed(), connectSemp(), connectSolace() (+8 more)

### Community 111 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 112 - "createVpnSwitch"
Cohesion: 0.22
Nodes (9): createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode (+1 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.13
Nodes (14): account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, NO_SESSION, OK() (+6 more)

### Community 118 - "pages.ts"
Cohesion: 0.27
Nodes (19): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+11 more)

### Community 119 - "logStartup"
Cohesion: 0.22
Nodes (9): logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), validateConnModes(), TestLoadConfig_ConnModeDefaults(), TestValidateConnModes(), checkTwoFactor(), TestCheckTwoFactor() (+1 more)

### Community 120 - "session"
Cohesion: 0.20
Nodes (10): activeTicket, session, clearSessionCookie(), clearSigninCookie(), setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions (+2 more)

### Community 121 - "trustHolder"
Cohesion: 0.12
Nodes (22): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+14 more)

### Community 122 - "rbac.ts"
Cohesion: 0.05
Nodes (58): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, AccessLevel, ALWAYS_VISIBLE (+50 more)

### Community 123 - "backup_test.go"
Cohesion: 0.10
Nodes (42): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+34 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (18): Build commands, Build internals, Build-time feature flags, Building variants, Code Conventions, Contents, CSS, Developer Guide (+10 more)

### Community 125 - "relay_test.go"
Cohesion: 0.08
Nodes (46): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+38 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.22
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+14 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.05
Nodes (59): Circular Dependency Resolution, DOM Access, SendResult, showToast(), escapeHtml(), icons, MAX_BROWSER_BINDINGS, showPayload() (+51 more)

### Community 132 - "settings.ts"
Cohesion: 0.13
Nodes (23): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+15 more)

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.05
Nodes (62): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+54 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (34): decodeTo(), expectInvalid(), expectRev(), managedEnv, jsonBody(), scheduleBody(), staleBasis(), TestBackupAPI_ActionsAreAudited() (+26 more)

### Community 139 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 140 - "utils.ts"
Cohesion: 0.03
Nodes (107): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+99 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (31): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+23 more)

### Community 148 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (54): connName(), TestBackup_SharedVector(), userName(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation() (+46 more)

### Community 155 - "keyfile_test.go"
Cohesion: 0.19
Nodes (13): createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey() (+5 more)

### Community 156 - "quietLogger"
Cohesion: 0.19
Nodes (35): adminHandler, fixed(), newTestAuditor(), newAdminHandler(), TestAdminHandler_DisabledIs404(), TestAdminHandler_DoesNotFallBackToTheSPA(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_ServesBundle() (+27 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 161 - "throttle.test.ts"
Cohesion: 0.18
Nodes (8): createThrottle(), Failures, LoginLimits, retrySeconds(), CONTRACT_DIR, LIMITS, VECTORS, VectorStep

### Community 162 - "defaultConfig"
Cohesion: 0.18
Nodes (12): flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), seedConfigFile(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable() (+4 more)

### Community 163 - "managed.test.ts"
Cohesion: 0.10
Nodes (22): ManagedDemo, ManagedPanelDeps, TLS_READ_ONLY_ID, QueueFixture, Gateway, GatewayPages, LOGIN_PATHS, Page (+14 more)

### Community 164 - "routes.test.ts"
Cohesion: 0.11
Nodes (25): delay(), handleSemp(), hostedResponse(), installMockServer(), json(), MockRoute, MockServerOptions, readBody() (+17 more)

### Community 165 - "crypto/tls.Certificate"
Cohesion: 0.27
Nodes (5): certHolder, newCertHolder(), newTLSManager(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 167 - "picker.test.ts"
Cohesion: 0.18
Nodes (4): __resetForTest(), src(), tailSource(), listing()

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 171 - "contract_test.go"
Cohesion: 0.13
Nodes (24): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+16 more)

### Community 172 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 173 - "net/http.Handler"
Cohesion: 0.44
Nodes (8): newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), TestRootHandler_WithManagedRouting(), TestRootHandler_WithoutManagedRouting(), managedEndpoints

### Community 174 - "settings_test.go"
Cohesion: 0.13
Nodes (34): expectStale(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, mustRead() (+26 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 176 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 177 - "wireUiEvents"
Cohesion: 0.42
Nodes (9): wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability(), renderDestMode() (+1 more)

### Community 178 - "loadOrGenerateServerCert"
Cohesion: 0.08
Nodes (31): appendPEMCerts(), browserKeyProblem(), buildTrustPool(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert(), probeWritable() (+23 more)

### Community 179 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 180 - "Kernel.installModule"
Cohesion: 0.20
Nodes (7): createService (subscription-explorer), fetchAllSubscriptions, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), primarySempContextFrom

### Community 181 - "npm-audit-gate.mjs"
Cohesion: 0.46
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (40): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+32 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

### Community 185 - "main_test.go"
Cohesion: 0.23
Nodes (23): acceptWatch, expectLogged(), gatewayClient(), gatewayDir(), startServe(), TestServe_AnOldConfigWithTLSPathKeysStartsAndWarnsOnce(), TestServe_FailuresStopTheStart(), TestServe_FilesOnlyRefusesTheRelay() (+15 more)

### Community 186 - "net/http.Header"
Cohesion: 0.25
Nodes (6): dropSessionCookie(), dropSessionSetCookie(), TestDropSessionCookie(), TestDropSessionSetCookie(), headerHasToken(), writeSwitch()

### Community 188 - "ref_node_path"
Cohesion: 0.23
Nodes (5): moduleRegistryPlugin(), ALL, REPO_ROOT, TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 190 - "Two-factor sign-in"
Cohesion: 0.20
Nodes (10): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+2 more)

### Community 192 - "tls_api.go"
Cohesion: 0.33
Nodes (5): clip(), TestClip(), tlsCertAnswerJSON, tlsPairJSON, tlsTrustAddJSON

### Community 195 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 196 - "QueueSource"
Cohesion: 0.50
Nodes (3): State, QueueSource, FetchPage

### Community 197 - "tls-certificates/service.test.ts"
Cohesion: 0.60
Nodes (4): answer(), CERT, fetchMock(), sent()

### Community 198 - "restart.go"
Cohesion: 0.50
Nodes (3): restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), restartJSON

### Community 199 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1190 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `Writing to the store` to `storecrypt_test.go`, `log/slog.Logger`, `currentUser`, `managed.go`, `backup_test.go`, `net/http.ResponseWriter`, `writer_test.go`, `managed-api.ts`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 121 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 121 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.05225225225225225 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `loadModuleDOM`, `Writing to the store`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._