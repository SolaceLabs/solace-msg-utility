# Graph Report - smu-dirty  (2026-11-24)

## Corpus Check
- 377 files · ~839,184 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5630 nodes · 18040 edges · 201 communities (165 shown, 36 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2404 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `24a046f0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backup.go
- managed-panel.ts
- writeFile
- fixtures.ts
- semp-client Test Suite
- Architecture
- broker/store.ts
- core event-bus
- vitest
- .ServeHTTP
- queue-source.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- logger.ts
- scripts
- writer_test.go
- backup_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- managed.test.ts
- totp.go
- pages_test.go
- boot.managed.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- RowList
- quietLogger
- backup.ts
- notification-center/index.ts
- samples.test.ts
- Filter Messages Dialog
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- backupService
- tls.go
- net/http.ResponseWriter
- time.Time
- loadStore
- settings.ts
- router.ts
- ui.selectMessage
- session.ts
- newFakeClock
- authPages
- .serveIndex
- queue-discovery index.html
- ui-modal.test.ts
- gateway-settings/module.test.ts
- gateway/store.ts
- tests variants
- tls_api_test.go
- gateway/index.ts
- connection-management/service.ts
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- audit_test.go
- runDirectChecks
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- keyfile.go
- SEMP v2 Paged Discovery (core library)
- broker-hosts.test.ts
- Gateway Settings
- tls.ts
- connection-management/module.test.ts
- createQueuePicker
- DOM Template System
- Cross-Module Event Flow
- queue-copy/ui.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- mustHash
- user-management/service.ts
- contract.test.ts
- ui-modal.ts
- wireUiEvents
- createGateway
- storecrypt_test.go
- manual-to-md.mjs
- message.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- session
- managed-api.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- managed-service.ts
- dest-provisioned.test.ts
- run
- Two-factor sign-in
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- provisioned-connection/index.ts
- server/index.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- request
- demo-flow.test.ts
- configfile.go
- createPages
- relay.ts
- checksums
- rbac.ts
- user-management/module.test.ts
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- verifyViaSempV1
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Testing
- User Guide
- backup_api_test.go
- fileConfigFromConfig
- Connections
- queue-discovery module.ts
- configfile_test.go
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- log/slog.Logger
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- vite-build.mjs
- routes.test.ts
- smf_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Audit trail
- settingsFile
- ref_node_path
- Queue Browser
- .record
- utils.ts
- Provisioned connections
- csp.mjs
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- tls-certificates/module.test.ts
- Deployment Options
- Setup
- testing.T
- dial_test.go
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- .toConfig
- ManagedPanel
- runChecks
- tsconfig.test.json
- Certificates
- defaultConfig
- User Mgmt.
- compose.ts
- demo-flow.test.ts
- Code Standards
- createAccessTest
- hashRecoveryCode
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- auditMissing
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- Configure
- SEMP v1 Pagination (Queue Subscription Explorer)

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 130 edges
3. `store` - 100 edges
4. `quietLogger()` - 100 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 69 edges
9. `runChecks()` - 63 edges
10. `required()` - 57 edges

## Surprising Connections (you probably didn't know these)
- `What applies at once` --references--> `standardRoots`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/tls.go
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `A chapter` --references--> `chapterMarkdown()`  [INFERRED]
  docs/developer-guide.md → scripts/manual-to-md.mjs
- `Test DOM` --references--> `readModuleView()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
- `Defensive-guard tests` --references--> `required()`  [INFERRED]
  docs/testing.md → src/core/dom.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (201 total, 36 thin omitted)

### Community 0 - "backup.go"
Cohesion: 0.05
Nodes (32): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, changedOnDiskError, clientGoneError, hostedInfo, importBasis (+24 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.10
Nodes (45): managedErrorMessage(), isSessionEnded(), provisionedNames(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf() (+37 more)

### Community 2 - "writeFile"
Cohesion: 0.07
Nodes (74): writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint() (+66 more)

### Community 3 - "fixtures.ts"
Cohesion: 0.13
Nodes (29): listQueues(), listVpns(), DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm(), firstVisit(), PanelOptions (+21 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "broker/store.ts"
Cohesion: 0.13
Nodes (29): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), MockQueue, PAYLOAD_TEMPLATES (+21 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "vitest"
Cohesion: 0.03
Nodes (88): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Integration tests, Module tests (+80 more)

### Community 9 - ".ServeHTTP"
Cohesion: 0.12
Nodes (10): setForwarded(), openSocket, headerHasToken(), isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), upgradeScheme(), writeSwitch() (+2 more)

### Community 10 - "queue-source.ts"
Cohesion: 0.05
Nodes (38): ProvisionedConnectionCard, ProvisionedTarget, State, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn() (+30 more)

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

### Community 16 - "logger.ts"
Cohesion: 0.05
Nodes (59): Adding a New Module, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), AdminSessionHandlers, applyGate() (+51 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (32): TestStageSettings_RefusalsComeBackAsErrors(), checkRev(), countAdmins(), txn, wfix, classifyStoreError(), newStaleBasis(), newWFix() (+24 more)

### Community 19 - "backup_test.go"
Cohesion: 0.13
Nodes (29): diffByName(), mergeByName(), sameRecord(), sessionEnders(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffIgnoresRev() (+21 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.10
Nodes (12): scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin (+4 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "managed.test.ts"
Cohesion: 0.10
Nodes (36): authenticatorSection(), rebuild(), refresh(), managedSections(), TLS_READ_ONLY_ID, button(), connectionReference(), copyable() (+28 more)

### Community 24 - "totp.go"
Cohesion: 0.12
Nodes (23): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestGroupSecret(), TestQRSVG_DrawsTheCodeWithItsQuietZone(), TestQRSVG_TextTooLongForACodeIsAnError() (+15 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+76 more)

### Community 26 - "boot.managed.ts"
Cohesion: 0.09
Nodes (32): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+24 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.05
Nodes (50): abort(), aliasLookup(), alive(), bindInQueueBrowser(), broker, brokerSecrets, closers, connectBrowser() (+42 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (58): RFC-5280, RFC-6238, freshCode(), APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString() (+50 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 31 - "quietLogger"
Cohesion: 0.09
Nodes (48): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+40 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (72): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+64 more)

### Community 33 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 34 - "samples.test.ts"
Cohesion: 0.06
Nodes (52): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+44 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.03
Nodes (105): PickerCache, PickQueueOptions, PickQueueResult, Refs, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig (+97 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (71): adminHandler, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), main(), newRootHandler(), printVersionIfRequested(), serve() (+63 more)

### Community 39 - "backupService"
Cohesion: 0.10
Nodes (16): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+8 more)

### Community 40 - "tls.go"
Cohesion: 0.06
Nodes (28): certHolder, standardRoots, browserKeyProblem(), newCertHolder(), newTLSManager(), newTrustHolder(), parseCertificatePEM(), parseKeyPEM() (+20 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (21): Changing the TLS files, auditCall, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+13 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (20): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, prefixStrings(), failures (+12 more)

### Community 43 - "loadStore"
Cohesion: 0.14
Nodes (23): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), TestBuildManagedRoutes_StoreErrorIsReturned(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+15 more)

### Community 44 - "settings.ts"
Cohesion: 0.10
Nodes (28): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+20 more)

### Community 45 - "router.ts"
Cohesion: 0.13
Nodes (23): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+15 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "session.ts"
Cohesion: 0.10
Nodes (19): removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, browserError() (+11 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (42): Adding a sign-in step, clientOf(), activeSession, signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), authPages (+34 more)

### Community 50 - ".serveIndex"
Cohesion: 0.16
Nodes (5): hostedHandler, fileResolvable(), setAppPageHeaders(), pwaHandler, recordingResponseWriter

### Community 52 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (70): DOM Access, Cross-references, Defensive-guard tests, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM (+62 more)

### Community 53 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (20): GatewaySettingsModule, ADMIN, chosen(), clickSave(), el(), errorText(), hidden(), parts() (+12 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.08
Nodes (33): DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), clientHost(), cloneConn(), connView() (+25 more)

### Community 56 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (40): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewaySnapshot, PageResult, responseHeaders(), SignInResult (+32 more)

### Community 58 - "connection-management/service.ts"
Cohesion: 0.31
Nodes (6): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, VpnLookup, CONN

### Community 59 - "fileutil_test.go"
Cohesion: 0.07
Nodes (58): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+50 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.14
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (69): savedUser, TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(), currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture() (+61 more)

### Community 66 - "audit_test.go"
Cohesion: 0.19
Nodes (25): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+17 more)

### Community 67 - "runDirectChecks"
Cohesion: 0.25
Nodes (14): basic(), bindQueue(), closeOpened(), directSempPath(), drain(), sempPreflightProblem(), smfPreflightProblem(), unreachableHint() (+6 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.11
Nodes (24): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, fixedAction() (+16 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "keyfile.go"
Cohesion: 0.20
Nodes (14): partialName(), createExclusive(), existingStore(), loadStoreKey(), ownershipHint(), parseStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile() (+6 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (17): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+9 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.08
Nodes (35): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+27 more)

### Community 78 - "connection-management/module.test.ts"
Cohesion: 0.18
Nodes (14): ConnectionManagementModule, NO_VPNS, ADMIN, CONNS, el(), hidden(), saveAppliance(), schemePart() (+6 more)

### Community 79 - "createQueuePicker"
Cohesion: 0.35
Nodes (17): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+9 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/ui.ts"
Cohesion: 0.08
Nodes (48): SlideChoice, formatBytes(), CopyMode, DestScope, DestType, applyDestMode(), applyDestPrefill(), applyDestType() (+40 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.12
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.09
Nodes (47): flattenSettings(), newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer() (+39 more)

### Community 87 - "user-management/service.ts"
Cohesion: 0.17
Nodes (13): AccessLevel, ACCESS_PROMPT, AccessTest, LEVELS, createUserMgmtService(), ManagedUser, ModuleChoices, userPath() (+5 more)

### Community 88 - "contract.test.ts"
Cohesion: 0.09
Nodes (41): sempUsernameOk(), connsProblem(), usersProblem(), UpstreamAnswer, BROKER_RULE, brokerUsernamesProblem(), CLIENT_SCHEMES, connectionProblem() (+33 more)

### Community 89 - "ui-modal.ts"
Cohesion: 0.07
Nodes (49): SempContext, SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW (+41 more)

### Community 90 - "wireUiEvents"
Cohesion: 0.39
Nodes (9): wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), refreshDestTarget(), refreshSource(), renderDestMode(), syncDestFromToggles() (+1 more)

### Community 91 - "createGateway"
Cohesion: 0.10
Nodes (38): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes() (+30 more)

### Community 92 - "storecrypt_test.go"
Cohesion: 0.16
Nodes (18): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), TestNewSealer_TakesOnlyA32ByteKey() (+10 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "message.ts"
Cohesion: 0.07
Nodes (49): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), publish(), AuthenticationScheme, DestinationType (+41 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (72): auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv(), newManagedEnvFrom() (+64 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "session"
Cohesion: 0.17
Nodes (9): activeTicket, gatedWriter, session, setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions, signinTickets (+1 more)

### Community 100 - "managed-api.ts"
Cohesion: 0.03
Nodes (98): Code Conventions, CSS, Error Handling, File Organization, Laying out an admin page, Linting, Logging standard, Modals (+90 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "managed-service.ts"
Cohesion: 0.12
Nodes (9): PROVISIONED_SDK_CONNECT, TwoFactorState, ManagedProfileStore, createManagedService(), ManagedConnection, ManagedProfile, ManagedVpn, PROFILE (+1 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (30): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+22 more)

### Community 106 - "run"
Cohesion: 0.17
Nodes (17): playwright-core, askLine(), askSecret(), bcheck(), browserOn(), check(), collectDetails(), COMPOSE (+9 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.20
Nodes (10): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+2 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.12
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.15
Nodes (14): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+6 more)

### Community 112 - "server/index.ts"
Cohesion: 0.20
Nodes (16): delay(), RESTART_PAUSE_MS, handleSemp(), hostedResponse(), installMockServer(), json(), MockRoute, MockServerOptions (+8 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (25): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect(), directUp() (+17 more)

### Community 118 - "request"
Cohesion: 0.28
Nodes (8): createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.13
Nodes (14): ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES (+6 more)

### Community 120 - "configfile.go"
Cohesion: 0.10
Nodes (25): Adding a gateway config.yaml setting, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), intInRange(), moduleCatalog(), removedInUse(), removedTLSPaths() (+17 more)

### Community 121 - "createPages"
Cohesion: 0.22
Nodes (22): ManagedDemo, ManagedPanelDeps, groupSecret(), Gateway, createPages(), codeField(), field(), frame() (+14 more)

### Community 122 - "relay.ts"
Cohesion: 0.21
Nodes (15): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+7 more)

### Community 124 - "rbac.ts"
Cohesion: 0.16
Nodes (18): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, canOperate() (+10 more)

### Community 125 - "user-management/module.test.ts"
Cohesion: 0.15
Nodes (18): ADMIN, answerSignOut(), CHOICES, chooseForUser(), clickRow(), el(), hidden(), listed() (+10 more)

### Community 127 - "main_test.go"
Cohesion: 0.10
Nodes (44): acceptWatch, boolEnv(), envOr(), loadConfig(), parseStrictBool(), expectLogged(), gatewayClient(), gatewayDir() (+36 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (77): Circular Dependency Resolution, DEFAULT_MAX_MESSAGES_PER_QUEUE, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, escapeHtml() (+69 more)

### Community 132 - "verifyViaSempV1"
Cohesion: 0.24
Nodes (10): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+2 more)

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.09
Nodes (22): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+14 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (37): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+29 more)

### Community 139 - "fileConfigFromConfig"
Cohesion: 0.12
Nodes (21): configVerifier(), decodeConfigFile(), encodeConfigFile(), fileConfigFromConfig(), onFailureOrDefault(), seedConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion() (+13 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "configfile_test.go"
Cohesion: 0.27
Nodes (19): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+11 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.07
Nodes (24): auditor, configSource, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse (+16 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (68): Writing to the store, connName(), userName(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv() (+60 more)

### Community 155 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 156 - "routes.test.ts"
Cohesion: 0.06
Nodes (41): resetScenario(), seedState(), setBrokers(), VpnFixture, DEMO_GATEWAY_MARKER, SessionEventCode, call(), CLIENT (+33 more)

### Community 157 - "smf_test.go"
Cohesion: 0.06
Nodes (61): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, logLine(), TestRecordingResponseWriter_HijackWithoutSupport(), isShowRPC() (+53 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Audit trail"
Cohesion: 0.22
Nodes (8): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, restart()

### Community 161 - "settingsFile"
Cohesion: 0.15
Nodes (10): Gateway contract cases, apiError, refusalError, invalidRefusal(), newSettingsFile(), settingsRig(), TestRefusalError_IsAnsweredAsItSays(), settingsFile (+2 more)

### Community 162 - "ref_node_path"
Cohesion: 0.18
Nodes (8): moduleRegistryPlugin(), ALL, session(), bundleSources(), productSources(), REPO_ROOT, TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - ".record"
Cohesion: 0.22
Nodes (5): auditFor(), TestAuditFor_ActorAndClient(), auditCategory, auditEntry, auditWriter

### Community 165 - "utils.ts"
Cohesion: 0.08
Nodes (35): clientUsernameError(), clientUsernameOk(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains() (+27 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 167 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "tls-certificates/module.test.ts"
Cohesion: 0.04
Nodes (68): Global hooks, formatUtc(), diffLines(), MAX_IMPORT_BYTES, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement() (+60 more)

### Community 172 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 173 - "Setup"
Cohesion: 0.10
Nodes (21): A chapter, Build commands, Build internals, Build-time feature flags, Building variants, Contents, Developer Guide, Figures (+13 more)

### Community 174 - "testing.T"
Cohesion: 0.11
Nodes (47): TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), rawExchange(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline(), TestWriteJSON_EncodeFailureKeepsStatus() (+39 more)

### Community 175 - "dial_test.go"
Cohesion: 0.29
Nodes (9): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+1 more)

### Community 176 - "contract_test.go"
Cohesion: 0.11
Nodes (24): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+16 more)

### Community 177 - "Administration"
Cohesion: 0.11
Nodes (19): A password that must be changed first, Administration, Confirm dialogs, Finding your way around, Messages about the gateway's files, Other messages, Row buttons and rows of boxes, Saving at the same time as another administrator (+11 more)

### Community 178 - "Backup & Restore"
Cohesion: 0.11
Nodes (19): Any action, Backup & Restore, Export and import, Exporting a backup, Refusals and messages, Removing the schedule, Restoring from a file, Running a backup now (+11 more)

### Community 179 - "Queue Copy"
Cohesion: 0.11
Nodes (19): Before you move messages, Copy or Move, How a run ends, How the check works, Picking a queue, Queue Copy, Running a copy or a move, Starting (+11 more)

### Community 180 - ".toConfig"
Cohesion: 0.16
Nodes (17): Auditing an action, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), parseCIDRs(), TestFileConfig_CloneIsIndependent() (+9 more)

### Community 182 - "runChecks"
Cohesion: 0.13
Nodes (33): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), basisMoved(), certFingerprint(), createCookieJar() (+25 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 185 - "defaultConfig"
Cohesion: 0.13
Nodes (16): config, envOverrides(), levelName(), TestLevelName(), configLoad, envOverride, logStartup(), modeName() (+8 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "demo-flow.test.ts"
Cohesion: 0.11
Nodes (27): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+19 more)

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "createAccessTest"
Cohesion: 0.29
Nodes (6): createAccessTest(), evaluate(), note(), grantedModules(), setup(), pick()

### Community 191 - "hashRecoveryCode"
Cohesion: 0.50
Nodes (5): hashRecoveryCode(), normaliseRecoveryCode(), recoveryIndex(), TestRecoveryCode_HashListAndIndex(), TestRecoveryCode_NormaliseAndHash()

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 194 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 195 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 196 - "issueCert"
Cohesion: 0.18
Nodes (13): checkedAlias(), keyLine(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), issueCert() (+5 more)

### Community 197 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 198 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 199 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 200 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1409 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed-api.ts`, `managed.go`, `backupService`, `net/http.ResponseWriter`, `writer_test.go`, `log/slog.Logger`, `.toConfig`, `checksums`, `newManagedEnv`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backup.go` be split into smaller, more focused modules?**
  _Cohesion score 0.04929292929292929 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `logger.ts`, `store`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._