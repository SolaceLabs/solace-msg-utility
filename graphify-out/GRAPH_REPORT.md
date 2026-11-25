# Graph Report - smu-dirty  (2026-11-25)

## Corpus Check
- 380 files · ~853,461 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5665 nodes · 18173 edges · 198 communities (161 shown, 37 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2433 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `28c7bb52`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- connection-management/module.test.ts
- managed-panel.ts
- tls_test.go
- file-kind.ts
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- createEventBus
- tlsManager
- two-factor.test.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- connections/module.ts
- scripts
- writer_test.go
- backup_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- router.ts
- totp.go
- pages_test.go
- fixtures.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- managed-api.ts
- settingsFile
- backup.ts
- password_test.go
- file-kind.ts
- Filter Messages Dialog
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- boot.managed.ts
- go_pkg_path_filepath
- net/http.ResponseWriter
- time.Time
- loadStore
- demo-flow.test.ts
- backup_test.go
- ui.selectMessage
- broker-hosts.test.ts
- newFakeClock
- authPages
- backupSchedule
- queue-discovery index.html
- broker/store.ts
- session.ts
- gateway/store.ts
- tests variants
- tls-certificates/module.test.ts
- gateway/index.ts
- secret
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
- writer
- SEMP v2 Paged Discovery (core library)
- settings.ts
- Gateway Settings
- tls.ts
- Queue Subscriptions
- createQueuePicker
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- mustHash
- row-list/index.ts
- contract.test.ts
- ui-modal.test.ts
- TestPagePolicy_StyleBlockOrNone
- panel.ts
- createGateway
- manual-to-md.mjs
- message.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- run
- backup/module.test.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- user-management/module.ts
- dest-provisioned.test.ts
- ref_node_path
- Two-factor sign-in
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- provisioned-connection/index.ts
- notification-center/index.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- showToast
- demo-flow.test.ts
- configfile_test.go
- createPages
- newCapturingLogger
- Writing tests
- checkedAlias
- user-management/module.test.ts
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- connection-management/service.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Testing
- User Guide
- backup_api_test.go
- connectedWithTarget
- Connections
- queue-discovery module.ts
- tls_api_test.go
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
- session-activity.ts
- vite-build.mjs
- smf_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Audit trail
- collectDetails
- ManagedPanel
- Queue Browser
- npm-audit-gate.mjs
- connections/module.test.ts
- Provisioned connections
- gateway-settings/service.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- routes.test.ts
- tls-certificates/service.test.ts
- createConnTabs
- backup_api.go
- testing.T
- TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- ManagedDialer
- .release
- runChecks
- tsconfig.test.json
- Certificates
- User Mgmt.
- compose.ts
- Code Standards
- csp.mjs
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- verifyViaSempV1
- SEMP v1 Pagination (Queue Subscription Explorer)
- Configure

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 132 edges
3. `quietLogger()` - 101 edges
4. `store` - 100 edges
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
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (198 total, 37 thin omitted)

### Community 0 - "connection-management/module.test.ts"
Cohesion: 0.19
Nodes (16): ConnectionManagementModule, ADMIN, CONNS, el(), hidden(), makeCtx(), saveAppliance(), saved() (+8 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.09
Nodes (49): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), managedErrorMessage(), isSessionEnded(), ConnectOutcome, ConnectPart (+41 more)

### Community 2 - "tls_test.go"
Cohesion: 0.07
Nodes (73): writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint() (+65 more)

### Community 3 - "file-kind.ts"
Cohesion: 0.11
Nodes (27): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+19 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.12
Nodes (18): backupName(), connName(), diffByName(), mergeByName(), partialName(), sameRecord(), sealBackup(), sortedKeys() (+10 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "createEventBus"
Cohesion: 0.04
Nodes (75): Module tests, PROVISIONED_SDK_CONNECT, SempConfig, createEventBus(), TwoFactorState, createManagedProfile(), DialConn, provisionedNames() (+67 more)

### Community 9 - "tlsManager"
Cohesion: 0.04
Nodes (40): A chapter, Build commands, Build-time feature flags, Building variants, Figures, Maintaining dependencies, Setup, The guide on GitHub (+32 more)

### Community 10 - "two-factor.test.ts"
Cohesion: 0.10
Nodes (25): clock(), QueueFixture, mockCode(), STEP_MS, stepOf(), connection(), DEMO_APPLIANCE_MESSAGING_HOST, DEMO_STANDARD_ROOTS (+17 more)

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

### Community 16 - "connections/module.ts"
Cohesion: 0.05
Nodes (65): DOM Access, The Module Contract, boot(), DEFAULT_CONNECT_TIMEOUT_MS, DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, SEMP_PROBE_TIMEOUT_MS, DEFAULT_LOG_LEVEL (+57 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (36): Writing to the store, fileOfSchedule(), withRequestInfo(), checkRev(), countAdmins(), recoveryIndex(), txn, wfix (+28 more)

### Community 19 - "backup_test.go"
Cohesion: 0.14
Nodes (7): newBackupService(), TestBackup_ScheduleDocProblem(), backupRun, backupService, ownershipHint(), scheduleDoc, scheduleFile

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "router.ts"
Cohesion: 0.12
Nodes (37): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+29 more)

### Community 24 - "totp.go"
Cohesion: 0.08
Nodes (34): Adding a sign-in step, TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), need(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG() (+26 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): usersWrote(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "fixtures.ts"
Cohesion: 0.06
Nodes (54): listQueues(), listVpns(), brokerVpns(), DIRECT_BROKER, Fault, MOCK_HOST, resetScenario(), scenario (+46 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (40): bindInQueueBrowser(), broker, brokerSecrets, closers, connectBrowser(), cookies, DETAILS_FILE, DIRECT (+32 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (55): RFC-5280, RFC-6238, Browser and harness notes, APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), base32Decode() (+47 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "managed-api.ts"
Cohesion: 0.03
Nodes (85): createService (subscription-explorer), fetchAllSubscriptions, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), State (+77 more)

### Community 31 - "settingsFile"
Cohesion: 0.19
Nodes (9): Gateway contract cases, apiError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), settingsBody, settingsFile, settingsJSON, stagedSettings (+1 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (58): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+50 more)

### Community 33 - "password_test.go"
Cohesion: 0.24
Nodes (11): checkPasswordPolicy(), parsePasswordHash(), passwordRuleError(), TestCheckPassphrase_FixedRule(), TestCheckPasswordPolicy(), TestHasher_GivesUpWhenRequestGoesAway(), TestHasher_MalformedStoredValueNeverMatches(), TestHasher_RoundTripAndFormat() (+3 more)

### Community 34 - "file-kind.ts"
Cohesion: 0.08
Nodes (42): AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName, QueueType (+34 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.04
Nodes (78): pickQueue() reusable picker, confirmDialog(), ConfirmOptions, PickerCache, PickQueueOptions, PickQueueResult, Refs, coerceConnConfig() (+70 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (61): hostedInfo, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), appIndexFile(), contextWithTarget(), dialUpstreamTLS(), dropAuthChallenge() (+53 more)

### Community 39 - "boot.managed.ts"
Cohesion: 0.08
Nodes (34): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+26 more)

### Community 40 - "go_pkg_path_filepath"
Cohesion: 0.12
Nodes (13): fileSum, createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures() (+5 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.10
Nodes (23): setForwarded(), adminHandler, auditCall, auditWriter, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON() (+15 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, activeTicket, bucket, clientCtxKey, failures (+16 more)

### Community 43 - "loadStore"
Cohesion: 0.13
Nodes (25): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture() (+17 more)

### Community 44 - "demo-flow.test.ts"
Cohesion: 0.12
Nodes (18): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+10 more)

### Community 45 - "backup_test.go"
Cohesion: 0.18
Nodes (22): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing(), TestBackupService_LoadRefusesADamagedSchedule() (+14 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (17): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+9 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (39): clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), auditEntry (+31 more)

### Community 50 - "backupSchedule"
Cohesion: 0.33
Nodes (5): monthSlot(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleProblem(), backupSchedule

### Community 52 - "broker/store.ts"
Cohesion: 0.11
Nodes (31): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), MockQueue (+23 more)

### Community 53 - "session.ts"
Cohesion: 0.10
Nodes (20): getQueue(), key(), removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump() (+12 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.07
Nodes (32): DialResponse, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult (+24 more)

### Community 56 - "tls-certificates/module.test.ts"
Cohesion: 0.07
Nodes (40): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesModule, TlsCertificatesOptions (+32 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (42): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+34 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.07
Nodes (57): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+49 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Direct demo (`demo.html`)"
Cohesion: 0.13
Nodes (15): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+7 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.14
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (71): savedConn, savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture() (+63 more)

### Community 66 - "audit_test.go"
Cohesion: 0.20
Nodes (22): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+14 more)

### Community 67 - "runDirectChecks"
Cohesion: 0.22
Nodes (16): basic(), bcheck(), bindQueue(), check(), closeOpened(), directSempPath(), drain(), sempPreflightProblem() (+8 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.07
Nodes (22): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, Containerised Gateway (+14 more)

### Community 69 - "managed.go"
Cohesion: 0.12
Nodes (20): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, fixedAction() (+12 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "writer"
Cohesion: 0.10
Nodes (8): changedOnDiskError, checksums, clientGoneError, refusalError, staleError, writeFailedError, writer, newStaleBasis()

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "settings.ts"
Cohesion: 0.11
Nodes (30): isTwoFactorMode(), connsProblem(), usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS (+22 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.08
Nodes (34): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+26 more)

### Community 78 - "Queue Subscriptions"
Cohesion: 0.40
Nodes (5): Examples, Finding a subscription, Keeping the list up to date, Queue Subscriptions, What you can type

### Community 79 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.05
Nodes (83): ProvisionedTarget, createBrokerHosts(), createSegmented(), SegmentedOptions, formatBytes(), CopyMode, DEST_SCOPES, DestCredMode (+75 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.19
Nodes (24): newBackupKey(), openBackup(), settingsChanges(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_ABackupWithoutTheSignInKeysReadsThemAsTheDefaults() (+16 more)

### Community 87 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 88 - "contract.test.ts"
Cohesion: 0.06
Nodes (59): clientUsernameOk(), sempUsernameOk(), delay(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath() (+51 more)

### Community 89 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (96): Solace mock, AccessExplanation, AccessLevel, ALWAYS_VISIBLE, canOperate(), explainAccess(), findQueueRow(), findVpnRow() (+88 more)

### Community 91 - "panel.ts"
Cohesion: 0.12
Nodes (38): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+30 more)

### Community 92 - "createGateway"
Cohesion: 0.15
Nodes (27): acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), newRecoveryCodes(), newSecret(), normalizeRecovery() (+19 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "message.ts"
Cohesion: 0.10
Nodes (33): buildMessage(), buildSample(), publish(), buildSolaceSdk(), dropAllSessions(), sessions, attachmentOf(), BODY_TYPE (+25 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.10
Nodes (77): Auditing an action, auditLog, connChanges(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named() (+69 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "run"
Cohesion: 0.19
Nodes (16): abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets(), loadPlaywright() (+8 more)

### Community 100 - "backup/module.test.ts"
Cohesion: 0.06
Nodes (50): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), MAX_IMPORT_BYTES (+42 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "user-management/module.ts"
Cohesion: 0.04
Nodes (52): Adding a New Module, Code Conventions, CSS, Error Handling, File Organization, Linting, Logging standard, Modals (+44 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (21): cardError(), cardStatus(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialMock, disconnectByChoice(), El (+13 more)

### Community 106 - "ref_node_path"
Cohesion: 0.29
Nodes (7): GUIDE_FILE, GUIDE_LAYOUT, guideMarkdown(), guideParts(), headings(), slugger(), userGuide()

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.18
Nodes (20): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+12 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.08
Nodes (17): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+9 more)

### Community 112 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 114 - "README"
Cohesion: 0.22
Nodes (7): Contents, Developer Guide, Project Structure, Testing, Contents, User Guide, README

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (26): account(), activityMock, clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect() (+18 more)

### Community 118 - "showToast"
Cohesion: 0.25
Nodes (7): connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (31): QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+23 more)

### Community 120 - "configfile_test.go"
Cohesion: 0.05
Nodes (88): Adding a gateway config.yaml setting, Changing the TLS files, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), auditSettings, flattenSettings(), config, checkModuleIDs() (+80 more)

### Community 121 - "createPages"
Cohesion: 0.26
Nodes (20): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+12 more)

### Community 122 - "newCapturingLogger"
Cohesion: 0.06
Nodes (61): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+53 more)

### Community 123 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 124 - "checkedAlias"
Cohesion: 0.25
Nodes (9): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), machineLookup() (+1 more)

### Community 125 - "user-management/module.test.ts"
Cohesion: 0.13
Nodes (20): NO_OPERATE, NO_READ_ONLY, ADMIN, answerSignOut(), CHOICES, chooseForUser(), clickRow(), el() (+12 more)

### Community 127 - "main_test.go"
Cohesion: 0.09
Nodes (49): acceptWatch, loadConfig(), newRootHandler(), expectLogged(), gatewayClient(), gatewayDir(), route(), startServe() (+41 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (116): AppContext (Dependency Injection), Circular Dependency Resolution, Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, Laying out an admin page, Integration tests (+108 more)

### Community 132 - "connection-management/service.ts"
Cohesion: 0.31
Nodes (6): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, VpnLookup, CONN

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.13
Nodes (15): Adding a connection, Client (messaging), Conn. Mgmt, Deleting a connection, Editing a connection, Finding a connection, Message VPNs, Passwords (+7 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.13
Nodes (40): Build internals, Broker details, decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody() (+32 more)

### Community 139 - "connectedWithTarget"
Cohesion: 0.31
Nodes (9): connectBtn(), connectedWithTarget(), dialling(), installed(), messagingStarted(), needSecondary(), sessionUp(), setupProvisioned() (+1 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "tls_api_test.go"
Cohesion: 0.21
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle() (+14 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.03
Nodes (60): clientACL(), checkAuditOnFailure(), openAuditor(), auditCategory, auditor, boolEnv(), configSource, newDialer() (+52 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (67): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation(), flexStr, importInvalidError (+59 more)

### Community 155 - "session-activity.ts"
Cohesion: 0.20
Nodes (12): createSessionActivity(), onInput(), send(), INPUTS, KEEPALIVE_INTERVAL_MS, keepSessionAlive(), SessionActivity, SessionActivityOptions (+4 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 157 - "smf_test.go"
Cohesion: 0.06
Nodes (62): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, logLine(), newManagedEnvWith(), answerJSON() (+54 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Audit trail"
Cohesion: 0.17
Nodes (12): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, End-to-end run, Requirements (+4 more)

### Community 161 - "collectDetails"
Cohesion: 0.29
Nodes (8): askLine(), askSecret(), collectDetails(), detailsFileText(), fileValue(), parseDetailsFile(), resolveDetails(), unquoted()

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 165 - "connections/module.test.ts"
Cohesion: 0.06
Nodes (26): ConnectionConfig, ConnectionCredentials, SolaceConfig, gatewayWsUrl(), SolaceDial, CONNECT_IN_PROGRESS, ConnectStart, createServiceSolace() (+18 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (17): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+9 more)

### Community 167 - "gateway-settings/service.ts"
Cohesion: 0.38
Nodes (4): ClientSeen, createSettingsService(), GatewaySettings, SETTINGS

### Community 169 - "routes.test.ts"
Cohesion: 0.08
Nodes (19): bundleSources(), productSources(), REPO_ROOT, backup, conns, DAILY, managed, norm() (+11 more)

### Community 170 - "tls-certificates/service.test.ts"
Cohesion: 0.60
Nodes (4): answer(), CERT, fetchMock(), sent()

### Community 172 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 173 - "backup_api.go"
Cohesion: 0.23
Nodes (11): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+3 more)

### Community 174 - "testing.T"
Cohesion: 0.06
Nodes (72): TestSeedConfigFile_GoesThroughTheJournal(), dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate() (+64 more)

### Community 175 - "TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline"
Cohesion: 0.67
Nodes (4): rawExchange(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline(), TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline()

### Community 176 - "contract_test.go"
Cohesion: 0.10
Nodes (27): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+19 more)

### Community 177 - "Administration"
Cohesion: 0.11
Nodes (19): A password that must be changed first, Administration, Confirm dialogs, Finding your way around, Messages about the gateway's files, Other messages, Row buttons and rows of boxes, Saving at the same time as another administrator (+11 more)

### Community 178 - "Backup & Restore"
Cohesion: 0.11
Nodes (19): Any action, Backup & Restore, Export and import, Exporting a backup, Refusals and messages, Removing the schedule, Restoring from a file, Running a backup now (+11 more)

### Community 179 - "Queue Copy"
Cohesion: 0.11
Nodes (19): Before you move messages, Copy or Move, How a run ends, How the check works, Picking a queue, Queue Copy, Running a copy or a move, Starting (+11 more)

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (37): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+29 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 195 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 196 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 197 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 198 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 199 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 200 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 201 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1415 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `writer`, `net/http.ResponseWriter`, `log/slog.Logger`, `configfile_test.go`, `store`, `managed-api.ts`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `managed-panel.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08521303258145363 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `vitest`, `backup/module.test.ts`, `utils.ts`, `user-management/module.ts`, `writer_test.go`, `tls-certificates/module.test.ts`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Are the 83 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 83 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._