# Graph Report - smu-dirty  (2026-11-22)

## Corpus Check
- 366 files · ~784,560 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: .css 26, (none) 7, .dockerignore 1)

## Summary
- 5314 nodes · 17342 edges · 188 communities (153 shown, 35 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2338 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3b1900c5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp.go
- createManagedPanel
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- loadOrGenerateServerCert
- managed-api.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- managed-panel.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- boot.managed.ts
- errMessage
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- Testing
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- storecrypt_test.go
- Filter Messages Dialog
- connections/module.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tls.go
- net/http.ResponseWriter
- time.Time
- router.ts
- loadStore
- contract.test.ts
- ui.selectMessage
- user-management/module.ts
- newFakeClock
- authPages
- tls.ts
- queue-discovery index.html
- backup/module.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- broker/store.ts
- gateway/index.ts
- context.Context
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- two-factor.test.ts
- settings.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- fixtures.ts
- SEMP v2 Paged Discovery (core library)
- dial_test.go
- Administration (`/solAdmin`)
- runDirectChecks
- log/slog.Logger
- ui-modal.test.ts
- DOM Template System
- Cross-Module Event Flow
- provisioned-connection/index.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- serveUntilStopped
- CSS Organization
- tls_api_test.go
- configfile_test.go
- Developer Guide
- manual-to-md.mjs
- samples.test.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- go_pkg_strings
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- session
- dest-provisioned.test.ts
- file-kind.ts
- Deployment Options
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- access_test.go
- quietLogger
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- rbac.ts
- about/module.test.ts
- Configure
- createPages
- keyfile_test.go
- user-management/module.test.ts
- createQueuePicker
- provisioned-connect.ts
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- Kernel.installModule
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- gateway-settings/module.test.ts
- backup_api_test.go
- live
- hashRecoveryCode
- queue-discovery module.ts
- session.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- newManagedHandler
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- Two-factor sign-in
- vite-build.mjs
- Writing to the store
- queue-discovery ui.js
- ConnectionsModule Test Suite
- End-to-end run
- csp.mjs
- createConnTabs
- Module 2: Queue Browser
- row-list/index.ts
- .connect
- User Guide
- Setup
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- .checkSettings
- End-to-end run
- checkedAlias
- testing.T
- connection-management/service.ts
- entitled
- secret
- ManagedPanel
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- compose.ts
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- issueCert

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 178 edges
2. `vitest` - 126 edges
3. `store` - 99 edges
4. `quietLogger()` - 99 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 66 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 56 edges

## Surprising Connections (you probably didn't know these)
- `What applies at once` --references--> `standardRoots`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/tls.go
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `A chapter` --references--> `chapterMarkdown()`  [INFERRED]
  docs/developer-guide.md → scripts/manual-to-md.mjs
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts
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

## Communities (188 total, 35 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.13
Nodes (25): checkTwoFactor(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret(), TestQRSVG_DrawsTheCodeWithItsQuietZone() (+17 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.23
Nodes (21): isSessionEnded(), createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), connectSolace(), doConnect() (+13 more)

### Community 2 - "writeFile"
Cohesion: 0.10
Nodes (55): writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), loadStandardRoots(), equalCertJSON() (+47 more)

### Community 3 - "createGateway"
Cohesion: 0.10
Nodes (39): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+31 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.04
Nodes (48): backupName(), connName(), diffByName(), fileOfSchedule(), flattenSettings(), monthSlot(), newBackupService(), nextRun() (+40 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "loadOrGenerateServerCert"
Cohesion: 0.15
Nodes (12): certHolder, fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), newCertHolder(), TestGenerateSelfSigned_CreatesValidKeypair(), TestLoadOrGenerateServerCert_GeneratedPairIsABootstrap(), TestLoadOrGenerateServerCert_LoadsExisting() (+4 more)

### Community 10 - "managed-api.ts"
Cohesion: 0.04
Nodes (75): pickQueue() reusable picker, PickerCache, PickQueueOptions, PickQueueResult, Refs, State, visibleQueueRows(), Exchange (+67 more)

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
Nodes (59): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+51 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.15
Nodes (28): wfix, classifyStoreError(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestStoreErrors_UnwrapToTheirCause(), TestTxn_StagingAPathTwiceKeepsTheLast() (+20 more)

### Community 19 - "managed-panel.ts"
Cohesion: 0.05
Nodes (40): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), DEFAULT_MAX_MESSAGES_PER_QUEUE, DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT (+32 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "boot.managed.ts"
Cohesion: 0.09
Nodes (31): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+23 more)

### Community 24 - "errMessage"
Cohesion: 0.26
Nodes (9): errMessage(), createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+1 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (85): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+77 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (90): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, Integration tests, Module tests (+82 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (41): abort(), alive(), askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+33 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (59): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), issuesSession(), AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing() (+51 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (49): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Writing tests, EXPIRY_WARN_DAYS (+41 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (61): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+53 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.07
Nodes (34): ManagedDemo, GatewayPages, QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES (+26 more)

### Community 34 - "storecrypt_test.go"
Cohesion: 0.12
Nodes (19): newSettingsFile(), settingsRig(), settingsFile, stagedSettings, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused() (+11 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.05
Nodes (62): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+54 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.12
Nodes (21): go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie(), firstSegment(), hostedHandler (/hosted endpoint), isProxyPath() (+13 more)

### Community 39 - "contract_test.go"
Cohesion: 0.09
Nodes (27): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+19 more)

### Community 40 - "tls.go"
Cohesion: 0.08
Nodes (23): browserKeyProblem(), formatFingerprint(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem() (+15 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (20): auditCall, auditWriter, auditWrote, mergeByName(), smfPathFor(), decodeJSON(), decodeJSONLimit(), pathTarget() (+12 more)

### Community 42 - "time.Time"
Cohesion: 0.08
Nodes (27): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, clientWatch, newDialer() (+19 more)

### Community 43 - "router.ts"
Cohesion: 0.14
Nodes (35): docOf(), glob(), port(), totpDoc(), createRouter(), handle(), match(), error() (+27 more)

### Community 44 - "loadStore"
Cohesion: 0.14
Nodes (23): backupFixtureFrom(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+15 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.07
Nodes (44): connsProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk() (+36 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "user-management/module.ts"
Cohesion: 0.06
Nodes (38): Adding a New Module, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions (+30 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (41): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+33 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (34): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+26 more)

### Community 50 - "tls.ts"
Cohesion: 0.08
Nodes (34): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+26 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.07
Nodes (41): BackupModule, describeSchedule(), diffLines(), MAX_IMPORT_BYTES, pad(), WEEKDAYS, BackupFile, BackupSchedule (+33 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.06
Nodes (36): resetScenario(), seedState(), setBrokers(), bundleSources(), productSources(), call(), CLIENT, FAULTS (+28 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.08
Nodes (29): DialResponse, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+21 more)

### Community 56 - "broker/store.ts"
Cohesion: 0.13
Nodes (32): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), listQueues(), listVpns(), MockQueue (+24 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (43): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+35 more)

### Community 58 - "context.Context"
Cohesion: 0.23
Nodes (7): checkRev(), countAdmins(), TestStore_OnChangeFiresAfterACommittedEdit(), TestStore_SaveUser_RevMovesOnlyWhenTheConsoleViewChanges(), txn, newStale(), TestWriter_OneFileSaveCommitsAndPublishesInOrder()

### Community 59 - "fileutil_test.go"
Cohesion: 0.10
Nodes (43): Layout of tests, commitStep, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), syncDir(), crashAfter() (+35 more)

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
Nodes (65): TestBackupService_ExportAndImportRoundTripTwoFactor(), currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+57 more)

### Community 66 - "two-factor.test.ts"
Cohesion: 0.11
Nodes (43): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+35 more)

### Community 67 - "settings.ts"
Cohesion: 0.13
Nodes (26): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups() (+18 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.10
Nodes (27): bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, bodyDeadline(), connChanges() (+19 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "fixtures.ts"
Cohesion: 0.09
Nodes (30): delay(), Fault, MOCK_HOST, QUEUE_STATE, QueueFixture, QueueState, scenario, ScenarioState (+22 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "dial_test.go"
Cohesion: 0.29
Nodes (9): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+1 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.09
Nodes (22): auditor, configSource, recoverDir(), sweepLeftovers(), sweepLeftoversOf(), TestSweepLeftovers_ADataDirectoryThatIsAFile(), TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal(), buildManagedRoutes() (+14 more)

### Community 79 - "ui-modal.test.ts"
Cohesion: 0.02
Nodes (158): DOM Access, Solace mock, ProvisionedConnectionCard, ProvisionedTarget, filterSempFetch(), isListedVpn(), rowField(), SempFetch (+150 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "provisioned-connection/index.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.08
Nodes (54): newBackupKey(), openBackup(), envelope(), mustSealer(), newBackupFixture(), reseal(), sampleBackup(), sealed() (+46 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "serveUntilStopped"
Cohesion: 0.14
Nodes (25): recoverPanics(), TestRecoverPanics_LetsAbortHandlerThrough(), newRootHandler(), serveUntilStopped(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode() (+17 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "tls_api_test.go"
Cohesion: 0.21
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle() (+14 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (91): Writing a config.yaml by hand (development only), checkAuditOnFailure(), config, checkModuleIDs(), checkRenamedEnv(), configVerifier(), decodeConfigFile(), defaultFileConfig() (+83 more)

### Community 92 - "Developer Guide"
Cohesion: 0.12
Nodes (16): A chapter, Code Conventions, Contents, CSS, Developer Guide, Error Handling, Figures, File Organization (+8 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "samples.test.ts"
Cohesion: 0.05
Nodes (60): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), getQueue(), key(), seed() (+52 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+63 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "go_pkg_strings"
Cohesion: 0.05
Nodes (26): changedOnDiskError, clientGoneError, dialRequest, checkJournalName(), parseTxn(), restoreFiles(), hostedInfo, TestFileConfig_EveryKeyIsClassifiedOnce() (+18 more)

### Community 100 - "smf_test.go"
Cohesion: 0.06
Nodes (47): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, TestRecordingResponseWriter_HijackWithoutSupport(), isShowRPC(), newUserCounter() (+39 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "session"
Cohesion: 0.13
Nodes (12): activeTicket, session, clearSessionCookie(), clearSigninCookie(), expired(), setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey (+4 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.06
Nodes (51): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+43 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.18
Nodes (19): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+11 more)

### Community 111 - "access_test.go"
Cohesion: 0.12
Nodes (39): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+31 more)

### Community 112 - "quietLogger"
Cohesion: 0.17
Nodes (23): adminHandler, newAdminHandler(), newReverseProxy(), newUpstreamTransport(), TestAdminHandler_DisabledIs404(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_ServesBundle(), TestAdminHandler_TrailingSlashRedirects() (+15 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.09
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "rbac.ts"
Cohesion: 0.08
Nodes (35): AccessExplanation, AccessLevel, ALWAYS_VISIBLE, canOperate(), explainAccess(), findQueueRow(), findVpnRow(), isVpnVisible() (+27 more)

### Community 119 - "about/module.test.ts"
Cohesion: 0.13
Nodes (16): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), chapters() (+8 more)

### Community 120 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 121 - "createPages"
Cohesion: 0.27
Nodes (19): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+11 more)

### Community 122 - "keyfile_test.go"
Cohesion: 0.27
Nodes (12): createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+4 more)

### Community 123 - "user-management/module.test.ts"
Cohesion: 0.16
Nodes (16): ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden(), listed(), makeCtx() (+8 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "provisioned-connect.ts"
Cohesion: 0.19
Nodes (15): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+7 more)

### Community 127 - "main_test.go"
Cohesion: 0.08
Nodes (50): acceptWatch, boolEnv(), envOr(), gateway config struct + loadConfig, loadConfig(), main(), parseStrictBool(), printVersionIfRequested() (+42 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (92): Circular Dependency Resolution, Test DOM, readModuleView(), BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow (+84 more)

### Community 132 - "Kernel.installModule"
Cohesion: 0.09
Nodes (19): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+11 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "gateway-settings/module.test.ts"
Cohesion: 0.19
Nodes (16): GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx(), pressed() (+8 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.13
Nodes (40): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+32 more)

### Community 139 - "live"
Cohesion: 0.09
Nodes (19): hostedHandler, live, newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), TestBuildManagedRoutes_StoreErrorIsReturned(), TestBuildManagedRoutes_UnreadableScheduleIsReturned(), TestNewManagedRouting_AuditLogErrorIsReturned() (+11 more)

### Community 140 - "hashRecoveryCode"
Cohesion: 0.47
Nodes (6): hashRecoveryCode(), hashRecoveryCodes(), normaliseRecoveryCode(), recoveryIndex(), TestRecoveryCode_HashListAndIndex(), TestRecoveryCode_NormaliseAndHash()

### Community 142 - "session.ts"
Cohesion: 0.09
Nodes (21): publish(), publishRejection(), publishTargets(), removeMessage(), topicMatches(), createEmitter(), MockEmitter, createQueueBrowser() (+13 more)

### Community 148 - "newManagedHandler"
Cohesion: 0.21
Nodes (8): Adding a gateway config.yaml setting, Changing the TLS files, Gateway and Admin How-tos, Laying out an admin page, auditPre, liveSettings, fixedAction(), newManagedHandler()

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (52): sessionEnders(), slicesIndexUser(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation(), flexStr (+44 more)

### Community 155 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "Writing to the store"
Cohesion: 0.23
Nodes (8): Writing to the store, checksums, fileSum, connToOutput(), sameConnView(), sameUserView(), TestSameUserView_TwoFactor(), TestStore_SameViewAgreesWithTheOutput()

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "End-to-end run"
Cohesion: 0.22
Nodes (8): Audit trail, Restart gateway, End-to-end run, Requirements, The checks, What it changes, What it does, restart()

### Community 161 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 163 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 164 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 165 - ".connect"
Cohesion: 0.11
Nodes (11): setForwarded(), setAppPageHeaders(), recordingResponseWriter, headerHasToken(), isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), TestParseSMFPath() (+3 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (26): About and Help, Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax (+18 more)

### Community 167 - "Setup"
Cohesion: 0.25
Nodes (8): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, up()

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - ".checkSettings"
Cohesion: 0.29
Nodes (6): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 172 - "End-to-end run"
Cohesion: 0.40
Nodes (5): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, What applies at once

### Community 173 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

### Community 174 - "testing.T"
Cohesion: 0.06
Nodes (80): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+72 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 176 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

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

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1259 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `Writing to the store` to `store_test.go`, `managed.go`, `net/http.ResponseWriter`, `user-management/module.ts`, `authPages`, `writer_test.go`, `newManagedHandler`, `context.Context`, `newManagedEnv`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp.go` be split into smaller, more focused modules?**
  _Cohesion score 0.13368983957219252 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `user-management/module.ts` to `vitest`, `backup/module.ts`, `Writing to the store`?**
  _High betweenness centrality (0.134) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._