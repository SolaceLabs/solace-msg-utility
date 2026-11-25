# Graph Report - smu-dirty  (2026-11-25)

## Corpus Check
- 380 files · ~848,536 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5663 nodes · 18158 edges · 205 communities (168 shown, 37 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2429 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aea36a93`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- go_pkg_strings
- createManagedPanel
- tls_test.go
- quietLogger
- semp-client Test Suite
- Architecture
- broker/store.ts
- core event-bus
- vitest
- tlsManager
- queue-source.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- backup_test.go
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- fileutil.go
- totp.go
- pages_test.go
- fixtures.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- managed-api.ts
- defaultConfig
- backup.ts
- quietLogger
- samples.test.ts
- Filter Messages Dialog
- connections/module.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- boot.managed.ts
- backup.go
- net/http.ResponseWriter
- time.Time
- loadStore
- demo-flow.test.ts
- connection-management/module.test.ts
- ui.selectMessage
- createSession
- newFakeClock
- authPages
- .serveIndex
- queue-discovery index.html
- setup.ts
- gateway-settings/module.test.ts
- gateway/store.ts
- tests variants
- backup/module.test.ts
- gateway/index.ts
- routes.test.ts
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
- checksums
- SEMP v2 Paged Discovery (core library)
- tls-certificates/module.test.ts
- Gateway Settings
- tls.ts
- createSlideChoice
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
- ui-modal.test.ts
- checkedAlias
- createGateway
- storecrypt_test.go
- manual-to-md.mjs
- broker/store.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- session
- backup/module.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- collectDetails
- dest-provisioned.test.ts
- run
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
- access_test.go
- gateway/authenticator.ts
- settings.ts
- loadModuleDOM
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
- router.ts
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
- relay_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Audit trail
- settingsFile
- writeFile
- Queue Browser
- utils.ts
- solace-client.ts
- Provisioned connections
- seed.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- rbac.ts
- Deployment Options
- Developer Guide
- settings_test.go
- smf_test.go
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- writeFailedError
- Developer Guide
- runChecks
- tsconfig.test.json
- Certificates
- createUiEvents
- User Mgmt.
- compose.ts
- about/module.test.ts
- Code Standards
- sockets.ts
- net.Conn
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- about/module.ts
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- Kernel.installModule
- SEMP v1 Pagination (Queue Subscription Explorer)
- Configure
- logStartup
- ManagedService
- clientGoneError

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 180 edges
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

## Communities (205 total, 37 thin omitted)

### Community 0 - "go_pkg_strings"
Cohesion: 0.09
Nodes (27): partialName(), checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), createExclusive(), existingStore(), loadStoreKey() (+19 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.08
Nodes (46): managedErrorMessage(), isSessionEnded(), provisionedNames(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf() (+38 more)

### Community 2 - "tls_test.go"
Cohesion: 0.11
Nodes (48): testCertPair, testCertSpec, formatFingerprint(), loadStandardRoots(), brokerFixture(), equalCertJSON(), fingerprintOf(), keyBodyLine() (+40 more)

### Community 3 - "quietLogger"
Cohesion: 0.14
Nodes (10): certHolder, serveUntilStopped(), standardRoots, newCertHolder(), newTLSManager(), newTrustHolder(), TestTrustHolder_ChangesRunTheHooksOnlyWhenSomethingChanged(), TestTrustHolder_StandardRoots() (+2 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "broker/store.ts"
Cohesion: 0.12
Nodes (38): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key(), listQueues() (+30 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "vitest"
Cohesion: 0.04
Nodes (65): vitest, DeploymentConfig, DEFAULT_MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, createEventBus(), createManagedProfile(), DialConn, ManagedDialer (+57 more)

### Community 9 - "tlsManager"
Cohesion: 0.08
Nodes (22): browserKeyProblem(), encodeCertificates(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem() (+14 more)

### Community 10 - "queue-source.ts"
Cohesion: 0.05
Nodes (44): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, pickQueue() reusable picker, ProvisionedConnectionCard, ProvisionedTarget (+36 more)

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

### Community 16 - "required"
Cohesion: 0.06
Nodes (43): Adding a New Module, DOM Access, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), DEFAULT_LOG_LEVEL (+35 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.09
Nodes (39): Writing to the store, changedOnDiskError, refusalError, staleError, checkRev(), countAdmins(), recoveryIndex(), txn (+31 more)

### Community 19 - "backup_test.go"
Cohesion: 0.08
Nodes (32): backupName(), fileOfSchedule(), newBackupService(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+24 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (21): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+13 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "fileutil.go"
Cohesion: 0.14
Nodes (8): Layout of tests, syncDir(), TestSyncDir_ReportsAMissingDirectory(), writeTemp(), journal, atomicWrite(), TestAtomicWrite(), tlsSeams

### Community 24 - "totp.go"
Cohesion: 0.14
Nodes (28): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor() (+20 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (83): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+75 more)

### Community 26 - "fixtures.ts"
Cohesion: 0.07
Nodes (49): seed(), delay(), Fault, MOCK_HOST, QUEUE_STATE, resetScenario(), scenario, ScenarioState (+41 more)

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
Cohesion: 0.06
Nodes (55): createService (subscription-explorer), fetchAllSubscriptions, DEFAULT_CONNECT_TIMEOUT_MS, DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, SEMP_PROBE_TIMEOUT_MS, ConnectionCredentials, SempConfig (+47 more)

### Community 31 - "defaultConfig"
Cohesion: 0.11
Nodes (24): TestAudit_ReopenFailureLosesTheRecordLoudly(), TestAuditFor_ActorAndClient(), hostedHandler, live, newLive(), liveWith(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder() (+16 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (70): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+62 more)

### Community 33 - "quietLogger"
Cohesion: 0.15
Nodes (25): go-web-proxy main (gateway entrypoint), dialUpstreamTLS(), dropAuthChallenge(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport_VerifiesThroughTheTrustHolder() (+17 more)

### Community 34 - "samples.test.ts"
Cohesion: 0.06
Nodes (60): MessageType, SDTFieldType, detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF (+52 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.06
Nodes (43): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+35 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (57): adminHandler, hostedInfo, TestRecoverPanics_LogsAndAnswers500(), gateway config struct + loadConfig, root mux (hosted/proxy/pwa routing), newRootHandler(), route(), stubHandler() (+49 more)

### Community 39 - "boot.managed.ts"
Cohesion: 0.09
Nodes (30): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+22 more)

### Community 40 - "backup.go"
Cohesion: 0.04
Nodes (41): diffByName(), flattenSettings(), sameRecord(), settingsChanges(), sortedKeys(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), TestBackup_SettingsChangesNamesDottedKeys() (+33 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (19): auditCall, auditEntry, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+11 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (17): monthSlot(), nextRun(), TestBackup_NextRun(), bucket, failures, fakeAfter, loginLimits, expired() (+9 more)

### Community 43 - "loadStore"
Cohesion: 0.12
Nodes (27): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+19 more)

### Community 44 - "demo-flow.test.ts"
Cohesion: 0.14
Nodes (20): ManagedDemo, GatewayPages, ACTIVE_MODULES, MODULE_ENTRIES, connect(), expectSignedOut(), MODULES, navItems() (+12 more)

### Community 45 - "connection-management/module.test.ts"
Cohesion: 0.18
Nodes (17): ConnectionManagementModule, NO_VPNS, ADMIN, CONNS, el(), hidden(), makeCtx(), saveAppliance() (+9 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "createSession"
Cohesion: 0.10
Nodes (17): createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, browserError(), MOCK_SUBCODE (+9 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (40): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+32 more)

### Community 50 - ".serveIndex"
Cohesion: 0.15
Nodes (4): fileResolvable(), setAppPageHeaders(), recordingResponseWriter, reverseProxy

### Community 52 - "setup.ts"
Cohesion: 0.07
Nodes (32): Circular Dependency Resolution, Solace mock, createService(), deleteMessages(), disconnectBrowser(), wire(), destNameProblem(), getOriginalIdHint() (+24 more)

### Community 53 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (20): ADMIN, chosen(), clickSave(), el(), errorText(), hidden(), makeCtx(), parts() (+12 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.08
Nodes (28): TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult, entitled() (+20 more)

### Community 56 - "backup/module.test.ts"
Cohesion: 0.13
Nodes (25): diffLines(), MAX_IMPORT_BYTES, ADMIN, answer(), choose(), click(), downloadMock, el() (+17 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (48): acceptedStep(), hashRecovery(), newRecoveryCodes(), newSecret(), twoFactorNeed, BACKUP_ITER, BackupsState, createGateway() (+40 more)

### Community 58 - "routes.test.ts"
Cohesion: 0.07
Nodes (31): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, VpnLookup, CertificateBody, CertInfo, createTlsService() (+23 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.18
Nodes (37): commitStep, commitJournal(), newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter() (+29 more)

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

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (67): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn() (+59 more)

### Community 66 - "audit_test.go"
Cohesion: 0.19
Nodes (23): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+15 more)

### Community 67 - "runDirectChecks"
Cohesion: 0.22
Nodes (16): basic(), bcheck(), bindQueue(), check(), closeOpened(), directSempPath(), drain(), sempPreflightProblem() (+8 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (31): Changing the TLS files, Gateway and Admin How-tos, Laying out an admin page, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON (+23 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "tls-certificates/module.test.ts"
Cohesion: 0.08
Nodes (37): BackupModule, GatewaySettingsModule, EXPIRY_WARN_DAYS, MAX_TLS_REQUEST_BYTES, TlsCertificatesModule, UserManagementModule, answerConfirm(), confirmOpen() (+29 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.08
Nodes (35): parseBody(), CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error() (+27 more)

### Community 78 - "createSlideChoice"
Cohesion: 0.11
Nodes (17): Code Conventions, CSS, Error Handling, File Organization, Linting, Logging standard, Modals, TypeScript (+9 more)

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
Cohesion: 0.04
Nodes (73): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+65 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.19
Nodes (4): ManagedResult, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.10
Nodes (43): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+35 more)

### Community 87 - "queue-subscription-explorer/service.ts"
Cohesion: 0.15
Nodes (19): unfilteredPrimarySempContext(), createService(), fetchQueues(), fetchVpns(), extractMoreCookieBody(), ParsedSubPage, ParseResult, parseSubscriptionsResponse() (+11 more)

### Community 88 - "contract.test.ts"
Cohesion: 0.06
Nodes (58): sempUsernameOk(), connsProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+50 more)

### Community 89 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (77): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+69 more)

### Community 90 - "checkedAlias"
Cohesion: 0.25
Nodes (9): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), machineLookup() (+1 more)

### Community 91 - "createGateway"
Cohesion: 0.11
Nodes (42): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+34 more)

### Community 92 - "storecrypt_test.go"
Cohesion: 0.18
Nodes (17): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), TestNewSealer_TakesOnlyA32ByteKey() (+9 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.07
Nodes (45): PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType (+37 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (73): Auditing an action, auditLog, connChanges(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named() (+65 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "session"
Cohesion: 0.17
Nodes (10): activeTicket, gatedWriter, session, clearSigninCookie(), setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions (+2 more)

### Community 100 - "backup/module.ts"
Cohesion: 0.03
Nodes (77): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, AdminSessionHandlers (+69 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "collectDetails"
Cohesion: 0.29
Nodes (8): askLine(), askSecret(), collectDetails(), detailsFileText(), fileValue(), parseDetailsFile(), resolveDetails(), unquoted()

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (29): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+21 more)

### Community 106 - "run"
Cohesion: 0.19
Nodes (16): abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets(), loadPlaywright() (+8 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.08
Nodes (20): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+12 more)

### Community 112 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+17 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.07
Nodes (28): account(), activityMock, clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect() (+20 more)

### Community 118 - "showToast"
Cohesion: 0.16
Nodes (13): TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+5 more)

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.11
Nodes (15): QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+7 more)

### Community 120 - "configfile_test.go"
Cohesion: 0.06
Nodes (84): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), accessConfig, checkAuditOnFailure(), auditSettings, config, boolEnv(), checkModuleIDs() (+76 more)

### Community 121 - "createPages"
Cohesion: 0.27
Nodes (19): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+11 more)

### Community 122 - "access_test.go"
Cohesion: 0.16
Nodes (26): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+18 more)

### Community 123 - "gateway/authenticator.ts"
Cohesion: 0.12
Nodes (24): clock(), base32(), frac32(), groupSecret(), HASH_RULE, normalizeRecovery(), PRIMES, RECOVERY_COUNT (+16 more)

### Community 124 - "settings.ts"
Cohesion: 0.13
Nodes (27): isTwoFactorMode(), usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults() (+19 more)

### Community 125 - "loadModuleDOM"
Cohesion: 0.05
Nodes (41): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+33 more)

### Community 127 - "main_test.go"
Cohesion: 0.12
Nodes (40): acceptWatch, envOr(), loadConfig(), parseLogLevel(), expectLogged(), gatewayClient(), gatewayDir(), startServe() (+32 more)

### Community 131 - "vitest"
Cohesion: 0.06
Nodes (58): Event Handling, Integration tests, QueuePicker, AppContext, BusEvents, EventBus, escapeHtml(), icons (+50 more)

### Community 132 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.09
Nodes (22): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+14 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.09
Nodes (57): waitFor(), decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody() (+49 more)

### Community 139 - "router.ts"
Cohesion: 0.13
Nodes (23): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+15 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.05
Nodes (38): setForwarded(), auditCategory, auditor, configSource, newDialer(), newRateWindow(), smfPathFor(), dialer (+30 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (62): connName(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), userName(), brokerTarget, clientRec, connRec (+54 more)

### Community 155 - "session-activity.ts"
Cohesion: 0.20
Nodes (12): createSessionActivity(), onInput(), send(), INPUTS, KEEPALIVE_INTERVAL_MS, keepSessionAlive(), SessionActivity, SessionActivityOptions (+4 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.08
Nodes (21): moduleRegistryPlugin(), classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv (+13 more)

### Community 157 - "relay_test.go"
Cohesion: 0.12
Nodes (38): errReader, fakeBroker, logLine(), isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+30 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 161 - "settingsFile"
Cohesion: 0.19
Nodes (9): Gateway contract cases, apiError, invalidRefusal(), newSettingsFile(), settingsRig(), TestRefusalError_IsAnsweredAsItSays(), settingsFile, stagedSettings (+1 more)

### Community 162 - "writeFile"
Cohesion: 0.11
Nodes (24): journalTargetNames(), sweepLeftovers(), sweepLeftoversOf(), TestSweepLeftovers_ADataDirectoryThatIsAFile(), TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal(), TestAdminHandler_EnabledButNotDeployed(), TestPWAHandler_UnusableBundleStopsTheStart(), writeFile() (+16 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "utils.ts"
Cohesion: 0.13
Nodes (22): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, clientUsernameOk(), isValidHost(), isValidPort() (+14 more)

### Community 165 - "solace-client.ts"
Cohesion: 0.13
Nodes (18): SolaceConfig, gatewayWsUrl(), SolaceDial, CONNECT_IN_PROGRESS, ConnectStart, createServiceSolace(), cleanup(), connect() (+10 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 167 - "seed.ts"
Cohesion: 0.16
Nodes (12): QueueFixture, connection(), DEMO_ACCOUNTS, DEMO_APPLIANCE_MESSAGING_HOST, DEMO_STANDARD_ROOTS, DEMO_TOPOLOGY, demoSeed(), everything (+4 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "rbac.ts"
Cohesion: 0.07
Nodes (41): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, AccessLevel, ALWAYS_VISIBLE (+33 more)

### Community 172 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 173 - "Developer Guide"
Cohesion: 0.40
Nodes (5): A chapter, Figures, The guide on GitHub, What checks a chapter, Writing the Manual

### Community 174 - "settings_test.go"
Cohesion: 0.14
Nodes (34): assertNoTempFiles(), errorCode(), expect(), saveAnswer, decodeSave(), managedEnv, mustRead(), TestSettings_AccessListThatAdmitsTheAdmin() (+26 more)

### Community 175 - "smf_test.go"
Cohesion: 0.10
Nodes (33): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+25 more)

### Community 176 - "contract_test.go"
Cohesion: 0.10
Nodes (25): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+17 more)

### Community 177 - "Administration"
Cohesion: 0.11
Nodes (19): A password that must be changed first, Administration, Confirm dialogs, Finding your way around, Messages about the gateway's files, Other messages, Row buttons and rows of boxes, Saving at the same time as another administrator (+11 more)

### Community 178 - "Backup & Restore"
Cohesion: 0.11
Nodes (19): Any action, Backup & Restore, Export and import, Exporting a backup, Refusals and messages, Removing the schedule, Restoring from a file, Running a backup now (+11 more)

### Community 179 - "Queue Copy"
Cohesion: 0.11
Nodes (19): Before you move messages, Copy or Move, How a run ends, How the check works, Picking a queue, Queue Copy, Running a copy or a move, Starting (+11 more)

### Community 181 - "Developer Guide"
Cohesion: 0.12
Nodes (16): Build commands, Build internals, Build-time feature flags, Building variants, Contents, Developer Guide, Maintaining dependencies, Project Structure (+8 more)

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (37): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+29 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 185 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "about/module.test.ts"
Cohesion: 0.17
Nodes (10): chapters(), current(), entries(), hidden(), install(), onShow(), pager(), q() (+2 more)

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "sockets.ts"
Cohesion: 0.20
Nodes (12): BackupDeps, Upstream, RouterDeps, GatewaySessions, GatewaySettingsFile, createSockets(), GatewaySockets, OpenSocket (+4 more)

### Community 191 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 194 - "about/module.ts"
Cohesion: 0.33
Nodes (8): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf()

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

### Community 199 - "Kernel.installModule"
Cohesion: 0.29
Nodes (4): Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start()

### Community 200 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 201 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 202 - "logStartup"
Cohesion: 0.38
Nodes (5): logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), validateConnModes(), TestValidateConnModes()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1415 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `settingsFile`, `store_test.go`, `backup/module.ts`, `managed.go`, `checksums`, `net/http.ResponseWriter`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `go_pkg_strings` be split into smaller, more focused modules?**
  _Cohesion score 0.09176788124156546 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `backup/module.ts` to `writer_test.go`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **Are the 83 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 83 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._