# Graph Report - smu-dirty  (2026-11-19)

## Corpus Check
- 364 files · ~731,996 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5270 nodes · 17204 edges · 202 communities (165 shown, 37 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2338 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1352ab62`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- quietLogger
- createManagedPanel
- backup_api.go
- createGateway
- semp-client Test Suite
- Architecture
- backupService
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- storecrypt_test.go
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
- createVpnSwitch
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- tls.go
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tlsManager
- net/http.ResponseWriter
- time.Time
- tls.ts
- sealer
- contract.test.ts
- ui.selectMessage
- quietLogger
- fileutil_test.go
- authPages
- router.ts
- queue-discovery index.html
- backup/module.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- user-management/module.ts
- gateway/index.ts
- Developer Guide
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- go_pkg_os
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
- samples.test.ts
- SEMP v2 Paged Discovery (core library)
- relay_test.go
- Administration (`/solAdmin`)
- connection-management/service.ts
- dial.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- writer
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- backup_test.go
- Queue Browser Internal Architecture
- queue-subscription-explorer/module.ts
- CSS Organization
- Writing to the store
- configfile.go
- queue-source.ts
- ui-modal.test.ts
- session.ts
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
- Two-factor sign-in
- service-copy.ts
- Deployment Options
- server.test.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- fixtures.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- required
- parseSetCookie
- file-kind.ts
- createPages
- utils.ts
- ui-modal.ts
- settings.ts
- auditMissing
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- backup.go
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- queue-copy/module.ts
- backup_api_test.go
- trustHolder
- managed-api.ts
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- access_test.go
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- service-verify.ts
- vite-build.mjs
- registry.test.ts
- queue-discovery ui.js
- ConnectionsModule Test Suite
- createQueuePicker
- configfile_test.go
- net.Conn
- settingsFile
- logStartup
- runDirectChecks
- User Guide
- two-factor.test.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- solace-publisher.ts
- tls.test.ts
- End-to-end run
- scripts/vite-build.mjs wrapper
- settings_test.go
- defaultConfig
- buildTrustPool
- provisioned-connection/index.ts
- tls_test.go
- defaultFileConfig
- Configure
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- decodeConfigFile
- compose.ts
- Setup
- Kernel.installModule
- verifyViaSempV1
- tlsPathsFromEnv
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- issueCert
- Module 3: Queue Copy
- newRootHandler
- secret
- ManagedPanel
- createConnTabs
- ManagedDialer

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 180 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 100 edges
4. `store` - 96 edges
5. `AppContext` - 71 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 65 edges
8. `loadModuleDOM()` - 64 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 54 edges

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

## Communities (202 total, 37 thin omitted)

### Community 0 - "quietLogger"
Cohesion: 0.10
Nodes (34): newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), serve(), serveUntilStopped(), TestBuildManagedRoutes_StoreErrorIsReturned(), TestBuildManagedRoutes_UnreadableScheduleIsReturned(), TestNewManagedRouting_AuditLogErrorIsReturned(), TestNewManagedRouting_Enabled() (+26 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.12
Nodes (35): isSessionEnded(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines() (+27 more)

### Community 2 - "backup_api.go"
Cohesion: 0.23
Nodes (10): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+2 more)

### Community 3 - "createGateway"
Cohesion: 0.15
Nodes (28): acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes(), newSecret() (+20 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backupService"
Cohesion: 0.09
Nodes (19): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem() (+11 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (23): changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell(), row() (+15 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (27): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+19 more)

### Community 10 - "storecrypt_test.go"
Cohesion: 0.21
Nodes (15): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer(), TestSealer_ADocumentThatDoesNotEncodeIsAFailedWrite(), TestSealer_DocVerifier() (+7 more)

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
Cohesion: 0.09
Nodes (46): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+38 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (34): Writing to the store, checkRev(), countAdmins(), TestStore_ReplacedConnectionsFileRefusesItsWrites(), txn, wfix, classifyStoreError(), newStaleBasis() (+26 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (21): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, moduleRegistryPlugin(), readModuleTemplate() (+13 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.16
Nodes (26): signedInRecoveryMsg(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+18 more)

### Community 24 - "createVpnSwitch"
Cohesion: 0.25
Nodes (9): createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode (+1 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (83): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+75 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (104): Event Handling, Integration tests, vitest, QueuePicker, CONN_MODE_VALUES, CONN_MODES_VALUES, ConnMode, ConnModes (+96 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (51): playwright-core, abort(), aliasLookup(), alive(), askLine(), askSecret(), basic(), broker (+43 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (62): RFC-5280, RFC-6238, freshCode(), aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), basisMoved() (+54 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.09
Nodes (28): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+20 more)

### Community 30 - "message.ts"
Cohesion: 0.09
Nodes (36): PAYLOAD_SAMPLES, PayloadSample, BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS, MockQueue (+28 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (60): Global hooks, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_TLS_REQUEST_BYTES, namesList() (+52 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.13
Nodes (15): QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+7 more)

### Community 34 - "tls.go"
Cohesion: 0.06
Nodes (28): auditCategory, smfPathFor(), dialRequest, hostedInfo, TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), main(), printVersionIfRequested() (+20 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.07
Nodes (43): The Module Contract, boot(), createNotificationCenter(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO (+35 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.08
Nodes (45): TestRecoverPanics_LetsAbortHandlerThrough(), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie(), firstSegment(), isProxyPath() (+37 more)

### Community 39 - "contract_test.go"
Cohesion: 0.10
Nodes (26): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+18 more)

### Community 40 - "tlsManager"
Cohesion: 0.12
Nodes (16): parseCertificatePEM(), parseKeyPEM(), pemCertificates(), readableName(), TestReadableName(), TestTrustFileName(), TestWritePEM_PartialThenRename(), trustFileName() (+8 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (18): auditCall, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+10 more)

### Community 42 - "time.Time"
Cohesion: 0.14
Nodes (16): bucket, clientWatch, newRateWindow(), failures, fakeAfter, newClientWatch(), rateWindow, expired() (+8 more)

### Community 43 - "tls.ts"
Cohesion: 0.12
Nodes (36): docOf(), glob(), openBackup(), port(), totpDoc(), glob(), BadRequest, boolean() (+28 more)

### Community 44 - "sealer"
Cohesion: 0.25
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeOptions, storeRole

### Community 45 - "contract.test.ts"
Cohesion: 0.08
Nodes (42): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+34 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "quietLogger"
Cohesion: 0.14
Nodes (45): fakeClock, fixed(), newTestAuditor(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+37 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.09
Nodes (46): Adding a New Module, Layout of tests, commitStep, commitJournal(), newJournal(), recoverDataDir(), syncDir(), crashAfter() (+38 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (35): Adding a sign-in step, Changing the TLS files, Gateway and Admin How-tos, clientOf(), activeSession, auditFor(), signedInMsg(), TestAuditFor_ActorAndClient() (+27 more)

### Community 50 - "router.ts"
Cohesion: 0.13
Nodes (24): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+16 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+40 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.05
Nodes (56): MANAGED_ERROR_CODES, Fault, resetScenario(), scenario, seedState(), setBrokers(), DEMO_GATEWAY_MARKER, RESTART_PAUSE_MS (+48 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.08
Nodes (30): DialResponse, TwoFactorMode, BackupDoc, BrokerTarget, cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+22 more)

### Community 56 - "user-management/module.ts"
Cohesion: 0.06
Nodes (42): explainAccess(), QGlob, SeedUser, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note() (+34 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.07
Nodes (37): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+29 more)

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

### Community 62 - "go_pkg_os"
Cohesion: 0.11
Nodes (17): createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+9 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.08
Nodes (90): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), importStaged, savedUser, sectionImport, loadStore(), bootstrapFixture(), currentConn(), currentUser() (+82 more)

### Community 66 - "panel.ts"
Cohesion: 0.16
Nodes (30): authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS (+22 more)

### Community 67 - "session"
Cohesion: 0.13
Nodes (12): activeTicket, gatedWriter, session, clearSigninCookie(), setSigninCookie(), TestSessionOf_ContextRoundTrip(), TestSigninCookie_Attributes(), withSession() (+4 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.10
Nodes (22): auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+14 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "samples.test.ts"
Cohesion: 0.08
Nodes (42): The payload samples queue, AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName (+34 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "relay_test.go"
Cohesion: 0.13
Nodes (23): errReader, fakeBroker, newManagedEnvWith(), isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+15 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 78 - "dial.go"
Cohesion: 0.09
Nodes (13): adminHandler, openSocket, setAppPageHeaders(), recordingResponseWriter, headerHasToken(), isWebSocketUpgrade(), newSMFGate(), parseSMFPath() (+5 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "writer"
Cohesion: 0.07
Nodes (20): changedOnDiskError, clientGoneError, checkJournalName(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers() (+12 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 86 - "backup_test.go"
Cohesion: 0.19
Nodes (23): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocYAML(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing() (+15 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "queue-subscription-explorer/module.ts"
Cohesion: 0.07
Nodes (41): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), createSempDiscovery(), fetchPaged(), fetchQueues() (+33 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 91 - "configfile.go"
Cohesion: 0.12
Nodes (21): flattenSettings(), checkModuleIDs(), checkRenamedEnv(), envOverrides(), intInRange(), moduleCatalog(), removedInUse(), configLoad (+13 more)

### Community 92 - "queue-source.ts"
Cohesion: 0.08
Nodes (29): ProvisionedConnectionCard, ProvisionedTarget, isVpnVisible(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn() (+21 more)

### Community 93 - "ui-modal.test.ts"
Cohesion: 0.08
Nodes (39): Cross-references, Defensive-guard tests, Module tests, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM (+31 more)

### Community 94 - "session.ts"
Cohesion: 0.10
Nodes (20): publishRejection(), removeMessage(), createEmitter(), MockEmitter, queueStateOf(), createQueueBrowser(), interval(), pump() (+12 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (68): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv(), raced() (+60 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.14
Nodes (26): groupSecret(), newTOTPGuard(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestGroupSecret(), TestNeed_RuleOverEveryModeAdminAndEnrolment(), TestQRSVG_DrawsTheCodeWithItsQuietZone() (+18 more)

### Community 100 - "smf_test.go"
Cohesion: 0.11
Nodes (29): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+21 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "gateway-settings/module.ts"
Cohesion: 0.18
Nodes (16): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), pressed() (+8 more)

### Community 105 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 106 - "service-copy.ts"
Cohesion: 0.10
Nodes (23): SolacePublisher, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), selectPublisher() (+15 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "server.test.ts"
Cohesion: 0.10
Nodes (40): allQueues(), findQueueAnyVpn(), getQueue(), listQueues(), listVpns(), spoolUsage(), vpnOn(), brokerVpns() (+32 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.08
Nodes (27): clientACL(), withClient(), openAuditor(), auditor, configSource, newDialer(), dialer, hostedHandler (+19 more)

### Community 112 - "fixtures.ts"
Cohesion: 0.08
Nodes (29): DemoSnapshot, ManagedDemo, StoreSnapshot, ManagedPanelDeps, QUEUE_STATE, QueueFixture, QueueState, ScenarioSnapshot (+21 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "required"
Cohesion: 0.04
Nodes (56): DOM Access, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), AccountControl (+48 more)

### Community 119 - "parseSetCookie"
Cohesion: 0.25
Nodes (8): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems(), noteCookies(), recordResponse(), tag()

### Community 120 - "file-kind.ts"
Cohesion: 0.13
Nodes (23): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+15 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "utils.ts"
Cohesion: 0.07
Nodes (35): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, generateUuid(), isValidHost(), isValidPort(), levelsIntersect() (+27 more)

### Community 123 - "ui-modal.ts"
Cohesion: 0.15
Nodes (23): AccessExplanation, AccessLevel, ALWAYS_VISIBLE, canOperate(), findQueueRow(), findVpnRow(), isQueueVisible(), matchesAny() (+15 more)

### Community 124 - "settings.ts"
Cohesion: 0.11
Nodes (27): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+19 more)

### Community 125 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 127 - "tls_api_test.go"
Cohesion: 0.19
Nodes (24): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+16 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (92): Circular Dependency Resolution, Laying out an admin page, DEFAULT_MAX_MESSAGES_PER_QUEUE, showToast(), escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS (+84 more)

### Community 132 - "backup.go"
Cohesion: 0.11
Nodes (8): diffByName(), mergeByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders(), TestBackup_DiffShowsTwoFactor(), withoutRev(), nameDiff

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (43): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets() (+35 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (35): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+27 more)

### Community 139 - "trustHolder"
Cohesion: 0.14
Nodes (5): certHolder, newCertHolder(), newTLSManager(), trustHolder, trustState

### Community 140 - "managed-api.ts"
Cohesion: 0.04
Nodes (80): coerceConnConfig(), ConnDeploymentConfig, DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionCredentials, SempConfig (+72 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (31): boot(), boot(), clearSnapshot(), PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot(), dumpStore() (+23 more)

### Community 148 - "access_test.go"
Cohesion: 0.20
Nodes (21): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+13 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (61): connName(), sessionEnders(), userName(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv() (+53 more)

### Community 155 - "service-verify.ts"
Cohesion: 0.20
Nodes (15): escapeXml(), ACCUMULATE_IDLE_MS, compareMsgIds(), emptyResult(), fetchNewestMsgIdViaSempV1(), msgIdToString(), normalizeAccessType(), parseSempV1Response() (+7 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.13
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "registry.test.ts"
Cohesion: 0.15
Nodes (8): src/main.ts application bootstrap, modules, ACTIVE_MODULES, loadRegistry(), MOCK_REDIRECTS table, injectModuleTemplates plugin, serviceMockRedirect plugin, variantRedirect plugin

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 161 - "configfile_test.go"
Cohesion: 0.26
Nodes (21): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+13 more)

### Community 162 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 163 - "settingsFile"
Cohesion: 0.13
Nodes (13): Gateway contract cases, clientIP(), normalizeAddr(), prefixContains(), accessConfig, apiError, clientCtxKey, resolvedClient (+5 more)

### Community 164 - "logStartup"
Cohesion: 0.14
Nodes (13): levelName(), TestLevelName(), logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), parseLogLevel(), TestParseLogLevel(), validateConnModes() (+5 more)

### Community 165 - "runDirectChecks"
Cohesion: 0.15
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "two-factor.test.ts"
Cohesion: 0.15
Nodes (14): clock(), createTickets(), GatewayTickets, Ticket, TICKET_TTL_MS, TicketStage, badCode(), codeNow() (+6 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+6 more)

### Community 171 - "tls.test.ts"
Cohesion: 0.14
Nodes (12): DEMO_SUBJECT, START_CERTIFICATE_BYTES, CA, call(), gateway(), get(), Gw, KEY (+4 more)

### Community 172 - "End-to-end run"
Cohesion: 0.18
Nodes (10): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+2 more)

### Community 174 - "settings_test.go"
Cohesion: 0.08
Nodes (62): assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), logLine(), rawExchange() (+54 more)

### Community 175 - "defaultConfig"
Cohesion: 0.20
Nodes (12): TestBackup_SettingsChangesNamesDottedKeys(), config, fileConfigFromConfig(), onFailureOrDefault(), seedConfigFile(), TestEncodeConfigFile_HeaderNoSecretsRoundTrip(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestSeedConfigFile_GoesThroughTheJournal() (+4 more)

### Community 176 - "buildTrustPool"
Cohesion: 0.15
Nodes (15): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value, appendPEMCerts() (+7 more)

### Community 177 - "provisioned-connection/index.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 178 - "tls_test.go"
Cohesion: 0.07
Nodes (58): testCertPair, testCertSpec, browserKeyProblem(), encodeCertificates(), fileExists(), formatFingerprint(), loadOrGenerateServerCert(), probeWritable() (+50 more)

### Community 179 - "defaultFileConfig"
Cohesion: 0.20
Nodes (14): TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), parseCIDRs(), prefixStrings(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated() (+6 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.19
Nodes (26): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), certFingerprint(), createCookieJar() (+18 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.11
Nodes (42): acceptWatch, boolEnv(), envOr(), loadConfig(), parseStrictBool(), expectLogged(), gatewayClient(), gatewayDir() (+34 more)

### Community 186 - "decodeConfigFile"
Cohesion: 0.19
Nodes (13): Writing a config.yaml by hand (development only), configVerifier(), decodeConfigFile(), encodeConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten() (+5 more)

### Community 188 - "Setup"
Cohesion: 0.17
Nodes (12): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, End-to-end run (+4 more)

### Community 189 - "Kernel.installModule"
Cohesion: 0.20
Nodes (7): createService (subscription-explorer), fetchAllSubscriptions, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), primarySempContextFrom

### Community 190 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 191 - "tlsPathsFromEnv"
Cohesion: 0.25
Nodes (8): Adding a gateway config.yaml setting, defaultSecretPaths(), removedTLSPaths(), TestRemovedTLSPaths_AgreeingKeysAreSilent(), TestTLSPathsFromEnv(), tlsPathsFromEnv(), secretPaths, tlsPaths

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 194 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 195 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 196 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 197 - "newRootHandler"
Cohesion: 0.57
Nodes (7): newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), TestRootHandler_WithManagedRouting(), TestRootHandler_WithoutManagedRouting()

### Community 200 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1253 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `backupService`, `store`, `net/http.ResponseWriter`, `log/slog.Logger`, `authPages`, `required`, `Writing to the store`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `quietLogger` be split into smaller, more focused modules?**
  _Cohesion score 0.1039136302294197 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `required` to `user-management/module.ts`, `writer_test.go`, `vitest`, `backup/module.ts`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._