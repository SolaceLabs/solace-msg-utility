# Graph Report - smu-dirty  (2026-11-25)

## Corpus Check
- 379 files · ~841,589 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5648 nodes · 18080 edges · 205 communities (170 shown, 35 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2405 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0ed0b97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- go_pkg_strings
- managed-panel.ts
- writeFile
- quietLogger
- semp-client Test Suite
- Architecture
- semp-v1.ts
- core event-bus
- vitest
- go_pkg_sync
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
- fileutil.go
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
- currentUser
- ui-modal.test.ts
- ui.selectMessage
- session.ts
- newFakeClock
- authPages
- proxy.go
- queue-discovery index.html
- setup.ts
- gateway-settings/module.test.ts
- gateway/store.ts
- tests variants
- backup/module.test.ts
- gateway/index.ts
- connection-management/service.ts
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- newStoreFixture
- audit_test.go
- runDirectChecks
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- managed-panel.ts
- SEMP v2 Paged Discovery (core library)
- broker-hosts.test.ts
- Gateway Settings
- tls.ts
- state.ts
- createQueuePicker
- DOM Template System
- Cross-Module Event Flow
- queue-copy/ui.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- mustHash
- queue-subscription-explorer/service.ts
- contract.test.ts
- ui-modal.ts
- wireUiEvents
- createGateway
- storecrypt_test.go
- manual-to-md.mjs
- broker/store.ts
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
- validateConn
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- showToast
- demo-flow.test.ts
- configfile.go
- createPages
- sdt.ts
- createSegmented
- rbac.ts
- user-management/module.test.ts
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- SempContext
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
- session-activity.ts
- routes.test.ts
- relay_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Audit trail
- settingsFile
- createUiEvents
- Queue Browser
- sealer
- utils.ts
- Provisioned connections
- csp.mjs
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- tls-certificates/module.test.ts
- Deployment Options
- Setup
- testing.T
- smf_test.go
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
- about/module.test.ts
- Code Standards
- backup_api.go
- net.Conn
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- auditMissing
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- Configure
- SEMP v1 Pagination (Queue Subscription Explorer)
- fileConfigFromConfig
- Audit trail
- entitled
- TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 131 edges
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

## Communities (205 total, 35 thin omitted)

### Community 0 - "go_pkg_strings"
Cohesion: 0.07
Nodes (21): fileSum, createExclusive(), existingStore(), loadStoreKey(), parseStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+13 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.19
Nodes (27): managedErrorMessage(), isSessionEnded(), createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), closeLive() (+19 more)

### Community 2 - "writeFile"
Cohesion: 0.11
Nodes (50): writeFile(), testCertPair, testCertSpec, encodeCertificates(), loadStandardRoots(), recoverTLSPair(), equalCertJSON(), fingerprintOf() (+42 more)

### Community 3 - "quietLogger"
Cohesion: 0.11
Nodes (28): TestSweepLeftovers_ADataDirectoryThatIsAFile(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport_VerifiesThroughTheTrustHolder() (+20 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "semp-v1.ts"
Cohesion: 0.37
Nodes (13): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), esc(), executeError(), handleSempV1() (+5 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "vitest"
Cohesion: 0.04
Nodes (74): PickerCache, PickQueueOptions, PickQueueResult, QueuePicker, Refs, PROVISIONED_SDK_CONNECT, SolaceConfig, createEventBus() (+66 more)

### Community 9 - "go_pkg_sync"
Cohesion: 0.07
Nodes (24): setForwarded(), bodyDeadline(), dropAuthChallenge(), dropSessionCookie(), dropSessionSetCookie(), TestDropSessionCookie(), TestDropSessionSetCookie(), isShowRPC() (+16 more)

### Community 10 - "queue-source.ts"
Cohesion: 0.06
Nodes (31): ProvisionedConnectionCard, ProvisionedTarget, State, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn() (+23 more)

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
Nodes (67): DOM Access, Laying out an admin page, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), createRowList() (+59 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.09
Nodes (34): changedOnDiskError, clientGoneError, staleError, txn, wfix, writeFailedError, writer, classifyStoreError() (+26 more)

### Community 19 - "backup_test.go"
Cohesion: 0.20
Nodes (20): backupFixtureFrom(), newBackupFixture(), TestBackup_SessionEndersNameTwoFactorChanges(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_FailedWriteChangesNothing(), TestBackupService_LoopRunsOnScheduleAndStops(), TestBackupService_PruneLogsAFileItCannotDelete() (+12 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "fileutil.go"
Cohesion: 0.10
Nodes (19): Layout of tests, checkJournalName(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers(), sweepLeftoversOf() (+11 more)

### Community 24 - "totp.go"
Cohesion: 0.09
Nodes (32): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), recoveryIndex(), loadTOTPVectors() (+24 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (82): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+74 more)

### Community 26 - "boot.managed.ts"
Cohesion: 0.07
Nodes (36): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+28 more)

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
Cohesion: 0.10
Nodes (38): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+30 more)

### Community 32 - "backup.ts"
Cohesion: 0.04
Nodes (122): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+114 more)

### Community 33 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+17 more)

### Community 34 - "samples.test.ts"
Cohesion: 0.11
Nodes (27): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+19 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.04
Nodes (70): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+62 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.07
Nodes (49): adminHandler, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), appIndexFile(), firstSegment(), hostedHandler (/hosted endpoint) (+41 more)

### Community 39 - "backupService"
Cohesion: 0.06
Nodes (35): backupName(), connName(), diffByName(), fileOfSchedule(), flattenSettings(), mergeByName(), monthSlot(), newBackupService() (+27 more)

### Community 40 - "tls.go"
Cohesion: 0.05
Nodes (39): certHolder, serveUntilStopped(), appendPEMCerts(), browserKeyProblem(), fileExists(), formatFingerprint(), generateSelfSigned(), loadOrGenerateServerCert() (+31 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (20): Changing the TLS files, Gateway and Admin How-tos, Writing to the store, auditCall, auditWriter, connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+12 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (19): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, failures, fakeAfter (+11 more)

### Community 43 - "loadStore"
Cohesion: 0.19
Nodes (24): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), envOf(), err2s(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(), TestLoadStore_BootstrapPasswordIsCheckedAgainstTheConfiguredMinimum() (+16 more)

### Community 44 - "currentUser"
Cohesion: 0.14
Nodes (29): savedUser, sameUserView(), currentConn(), currentUser(), newStoreWithFixtures(), putUser(), TestSameUserView_TwoFactor(), TestStore_DeleteUser_Refusals() (+21 more)

### Community 45 - "ui-modal.test.ts"
Cohesion: 0.14
Nodes (26): canOperate(), rbacReadOnly(), createInitialState(), resetTransientState(), buildDestSummary(), buildSourceSummary(), cancelCopyModal(), destinationRefusal() (+18 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "session.ts"
Cohesion: 0.08
Nodes (23): createEmitter(), MockEmitter, BackupDeps, Upstream, RouterDeps, GatewaySessions, GatewaySettingsFile, createSockets() (+15 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (33): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), TestAuditFor_ActorAndClient(), authPages, clientWatch (+25 more)

### Community 50 - "proxy.go"
Cohesion: 0.07
Nodes (19): signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), auditCategory, auditEntry, auditWrote, hostedHandler, hostedInfo (+11 more)

### Community 52 - "setup.ts"
Cohesion: 0.09
Nodes (30): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send() (+22 more)

### Community 53 - "gateway-settings/module.test.ts"
Cohesion: 0.10
Nodes (31): BackupModule, GatewaySettingsModule, UserManagementModule, CHOICES, expectSignedOut(), hidden(), { me, logout, umSvc, connSvc, settingsSvc, tlsSvc, backupSvc, showToast }, openAdminApp() (+23 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.08
Nodes (31): DialResponse, TwoFactorMode, BackupDoc, anyMatch(), clientHost(), cloneConn(), connView(), createStore() (+23 more)

### Community 56 - "backup/module.test.ts"
Cohesion: 0.13
Nodes (24): diffLines(), MAX_IMPORT_BYTES, ADMIN, answer(), choose(), click(), downloadMock, el() (+16 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (42): delay(), BACKUP_ITER, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+34 more)

### Community 58 - "connection-management/service.ts"
Cohesion: 0.31
Nodes (6): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, VpnLookup, CONN

### Community 59 - "fileutil_test.go"
Cohesion: 0.18
Nodes (36): commitStep, commitJournal(), newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter() (+28 more)

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
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "newStoreFixture"
Cohesion: 0.16
Nodes (35): enrolViewer(), mustHash(), newStoreFixture(), putConn(), signsIn(), storedHash(), TestStore_ClearTOTP(), TestStore_ClearTOTP_Refusals() (+27 more)

### Community 66 - "audit_test.go"
Cohesion: 0.20
Nodes (24): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+16 more)

### Community 67 - "runDirectChecks"
Cohesion: 0.25
Nodes (14): basic(), bindQueue(), closeOpened(), directSempPath(), drain(), sempPreflightProblem(), smfPreflightProblem(), unreachableHint() (+6 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.07
Nodes (35): auditPre, bodyRev, brokerTarget, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+27 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "managed-panel.ts"
Cohesion: 0.17
Nodes (18): provisionedNames(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines() (+10 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (18): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+10 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.07
Nodes (38): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+30 more)

### Community 78 - "state.ts"
Cohesion: 0.11
Nodes (13): SolacePublisher, SlideChoice, CopyMode, DEST_SCOPES, DestCredMode, DestForm, destMessagingHost(), DestPrefillSnapshot (+5 more)

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
Cohesion: 0.10
Nodes (45): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceMode(), applySourceReadonly(), cacheElements() (+37 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.19
Nodes (4): ManagedResult, ManagedService, ConnMgmtService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.11
Nodes (38): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+30 more)

### Community 87 - "queue-subscription-explorer/service.ts"
Cohesion: 0.16
Nodes (16): sempFailureText(), extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse(), SubscriptionRow, createService(), fetchAllSubscriptions() (+8 more)

### Community 88 - "contract.test.ts"
Cohesion: 0.07
Nodes (48): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+40 more)

### Community 89 - "ui-modal.ts"
Cohesion: 0.10
Nodes (29): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+21 more)

### Community 90 - "wireUiEvents"
Cohesion: 0.42
Nodes (9): syncDestFormFromSnapshot(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), refreshDestTarget(), refreshSource(), renderDestMode() (+1 more)

### Community 91 - "createGateway"
Cohesion: 0.06
Nodes (70): clock(), authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable() (+62 more)

### Community 92 - "storecrypt_test.go"
Cohesion: 0.14
Nodes (17): checksums, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), TestNewSealer_TakesOnlyA32ByteKey(), testSealer() (+9 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.04
Nodes (123): PAYLOAD_SAMPLES, PayloadSample, BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS, dumpStore() (+115 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+63 more)

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
Nodes (104): Adding a New Module, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog() (+96 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "managed-service.ts"
Cohesion: 0.14
Nodes (8): AccessExplanation, TwoFactorState, ManagedProfileStore, createManagedService(), ManagedConnection, ManagedProfile, ManagedVpn, QGlob

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (30): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+22 more)

### Community 106 - "run"
Cohesion: 0.17
Nodes (17): playwright-core, askLine(), askSecret(), bcheck(), browserOn(), check(), collectDetails(), COMPOSE (+9 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.15
Nodes (14): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+6 more)

### Community 112 - "validateConn"
Cohesion: 0.13
Nodes (15): TestContract_Validation(), profileResponse, respBroker, respPerm, respVpn, schemeOK(), TestStore_ClientHostname(), TestStore_ConnectionSchemes() (+7 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (25): account(), activityMock, clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect() (+17 more)

### Community 118 - "showToast"
Cohesion: 0.07
Nodes (30): AppContext (Dependency Injection), Circular Dependency Resolution, Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Integration tests (+22 more)

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (31): ConnectionsModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+23 more)

### Community 120 - "configfile.go"
Cohesion: 0.12
Nodes (25): Adding a gateway config.yaml setting, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog(), removedInUse() (+17 more)

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "sdt.ts"
Cohesion: 0.21
Nodes (16): attachmentBytes(), block(), decodeSdt(), hasChildren(), inline(), integer(), INTEGER_TYPES, SdtEnums (+8 more)

### Community 123 - "createSegmented"
Cohesion: 0.15
Nodes (14): Code Conventions, CSS, Error Handling, File Organization, Linting, Logging standard, Modals, TypeScript (+6 more)

### Community 124 - "rbac.ts"
Cohesion: 0.19
Nodes (16): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), ALWAYS_VISIBLE, explainAccess(), findQueueRow() (+8 more)

### Community 125 - "user-management/module.test.ts"
Cohesion: 0.08
Nodes (32): ManagedSession, NO_OPERATE, NO_READ_ONLY, ADMIN, CONNS, el(), hidden(), saveAppliance() (+24 more)

### Community 127 - "main_test.go"
Cohesion: 0.07
Nodes (57): acceptWatch, boolEnv(), envOr(), loadConfig(), main(), newRootHandler(), parseStrictBool(), printVersionIfRequested() (+49 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (90): vitest, DEFAULT_MAX_MESSAGES_PER_QUEUE, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, escapeHtml() (+82 more)

### Community 132 - "SempContext"
Cohesion: 0.07
Nodes (23): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+15 more)

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.09
Nodes (22): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+14 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (36): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+28 more)

### Community 139 - "fileConfigFromConfig"
Cohesion: 0.15
Nodes (17): Writing a config.yaml by hand (development only), configVerifier(), decodeConfigFile(), encodeConfigFile(), seedConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults() (+9 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "configfile_test.go"
Cohesion: 0.25
Nodes (20): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+12 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.07
Nodes (26): auditor, configSource, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse (+18 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.09
Nodes (34): sessionEnders(), slicesIndexUser(), TestBackupService_ExportAndImportRoundTripTwoFactor(), clientRec, connRec, connsDoc, flexStr, importInvalidError (+26 more)

### Community 155 - "session-activity.ts"
Cohesion: 0.20
Nodes (12): createSessionActivity(), onInput(), send(), INPUTS, KEEPALIVE_INTERVAL_MS, keepSessionAlive(), SessionActivity, SessionActivityOptions (+4 more)

### Community 156 - "routes.test.ts"
Cohesion: 0.04
Nodes (51): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+43 more)

### Community 157 - "relay_test.go"
Cohesion: 0.12
Nodes (37): errReader, fakeBroker, logLine(), newManagedEnvWith(), answerJSON(), newRelayEnv(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers() (+29 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Audit trail"
Cohesion: 0.25
Nodes (8): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks, restart()

### Community 161 - "settingsFile"
Cohesion: 0.10
Nodes (15): Gateway contract cases, apiError, recoverPanics(), TestRecoverPanics_LetsAbortHandlerThrough(), TestRecoverPanics_LogsAndAnswers500(), refusalError, requestInfo, requestInfoKey (+7 more)

### Community 162 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "sealer"
Cohesion: 0.25
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeRole, usersDoc

### Community 165 - "utils.ts"
Cohesion: 0.11
Nodes (28): clientUsernameError(), clientUsernameOk(), formatUtc(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec() (+20 more)

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
Cohesion: 0.05
Nodes (51): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+43 more)

### Community 172 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 173 - "Setup"
Cohesion: 0.10
Nodes (21): A chapter, Build commands, Build internals, Build-time feature flags, Building variants, Contents, Developer Guide, Figures (+13 more)

### Community 174 - "testing.T"
Cohesion: 0.07
Nodes (75): assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), TestWriteJSON_EncodeFailureKeepsStatus(), pagePolicy(), TestAuthPages_UnknownPathIs404() (+67 more)

### Community 175 - "smf_test.go"
Cohesion: 0.11
Nodes (29): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+21 more)

### Community 176 - "contract_test.go"
Cohesion: 0.09
Nodes (28): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+20 more)

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
Cohesion: 0.21
Nodes (13): TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), parseCIDRs(), prefixStrings(), TestFileConfig_CloneIsIndependent(), TestToConfig_AuditOnFailureIsValidated(), TestToConfig_BoundsNameTheOtherKey() (+5 more)

### Community 181 - "ManagedPanel"
Cohesion: 0.17
Nodes (3): ManagedPanel, DirectConnection, CheckConnectionRequest

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
Cohesion: 0.17
Nodes (10): config, levelName(), TestLevelName(), logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), parseLogLevel(), TestParseLogLevel() (+2 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "about/module.test.ts"
Cohesion: 0.12
Nodes (17): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+9 more)

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "backup_api.go"
Cohesion: 0.23
Nodes (10): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+2 more)

### Community 191 - "net.Conn"
Cohesion: 0.24
Nodes (5): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport()

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

### Community 201 - "fileConfigFromConfig"
Cohesion: 0.32
Nodes (5): fileConfigFromConfig(), onFailureOrDefault(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestToConfig_Audit(), loginLimits

### Community 203 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 204 - "TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline"
Cohesion: 0.50
Nodes (4): rawExchange(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline(), TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1414 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `net/http.ResponseWriter` to `newStoreFixture`, `managed-api.ts`, `managed.go`, `backupService`, `currentUser`, `writer_test.go`, `log/slog.Logger`, `store`, `storecrypt_test.go`, `newManagedEnv`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `go_pkg_strings` be split into smaller, more focused modules?**
  _Cohesion score 0.0746606334841629 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `net/http.ResponseWriter`, `showToast`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._