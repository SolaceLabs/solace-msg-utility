# Graph Report - smu-dirty  (2026-11-22)

## Corpus Check
- 364 files · ~738,797 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5298 nodes · 17362 edges · 186 communities (150 shown, 36 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2384 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `10d9bccf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totpCode
- provisioned-connect.ts
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backupService
- core event-bus
- notification-center/index.ts
- connections/module.test.ts
- queue-copy/module.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- routes.test.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- showToast
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- demo-flow.test.ts
- backup.ts
- demo-flow.test.ts
- backup.go
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
- user-management/module.test.ts
- newFakeClock
- authPages
- tls.ts
- queue-discovery index.html
- backup/module.ts
- fixtures.ts
- gateway/types.ts
- tests variants
- controls/managed.ts
- gateway/index.ts
- Developer Guide
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- managed.test.ts
- queue-source.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- copy-flow.test.ts
- SEMP v2 Paged Discovery (core library)
- tls_api_test.go
- Administration (`/solAdmin`)
- samples.test.ts
- log/slog.Logger
- service-verify.ts
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- fileConfigFromConfig
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- utils.ts
- CSS Organization
- configfile_test.go
- configfile.go
- Kernel.installModule
- ui-modal.ts
- session.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- fileConfig
- testing.T
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- defaultFileConfig
- dest-provisioned.test.ts
- file-kind.ts
- Deployment Options
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- defaultConfig
- serveUntilStopped
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- ManagedResult
- runDirectChecks
- relay.ts
- createPages
- storecrypt_test.go
- log/slog.Logger
- createQueuePicker
- rbac.ts
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- sealer
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- Module 2: Queue Browser
- backup_api_test.go
- serveUntilStopped
- decodeConfigFile
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
- Two-factor sign-in
- vite-build.mjs
- createManagedPanel
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Module 3: Queue Copy
- csp.mjs
- vitest.config.ts
- Testing
- RowList
- auditor
- User Guide
- wireUiEvents
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- writeFailedError
- verifyViaSempV1
- End-to-end run
- settings_test.go
- ManagedPanel
- Setup
- createConnTabs
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
1. `newManagedEnv()` - 181 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 102 edges
4. `store` - 99 edges
5. `AppContext` - 71 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 64 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 54 edges

## Surprising Connections (you probably didn't know these)
- `What applies at once` --references--> `standardRoots`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/tls.go
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `Test DOM` --references--> `readModuleTemplate()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
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

## Communities (186 total, 36 thin omitted)

### Community 0 - "totpCode"
Cohesion: 0.32
Nodes (16): newTOTPGuard(), loadTOTPVectors(), TestTOTP_NewSecretRoundTripsThroughVerify(), TestTOTPCode_RefusesASecretThatIsNotBase32(), TestTOTPCode_RFC6238Vectors(), TestTOTPGuard_AWrongCodeRecordsNothing(), TestTOTPGuard_ConcurrentUseOfOneCodePassesOnce(), TestTOTPGuard_ForgetStartsAgain() (+8 more)

### Community 1 - "provisioned-connect.ts"
Cohesion: 0.19
Nodes (15): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+7 more)

### Community 2 - "writeFile"
Cohesion: 0.10
Nodes (58): mustRead(), writeFile(), testCertPair, testCertSpec, encodeCertificates(), loadStandardRoots(), recoverTLSPair(), brokerFixture() (+50 more)

### Community 3 - "createGateway"
Cohesion: 0.09
Nodes (46): authenticatorSection(), rebuild(), refresh(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery() (+38 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backupService"
Cohesion: 0.09
Nodes (17): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem() (+9 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): clock(), createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log (+17 more)

### Community 9 - "connections/module.test.ts"
Cohesion: 0.09
Nodes (11): ConnectionConfig, ConnectionCredentials, INPUT_DEBOUNCE_MS, config, ui, ui, createConnectionsDOM(), createTestContext() (+3 more)

### Community 10 - "queue-copy/module.ts"
Cohesion: 0.03
Nodes (91): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), CardPart, createProvisionedConnectionCard(), populateVpns(), render() (+83 more)

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
Nodes (40): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+32 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.10
Nodes (35): Writing to the store, pipe(), checkRev(), txn, wfix, classifyStoreError(), newStale(), newStaleBasis() (+27 more)

### Community 19 - "routes.test.ts"
Cohesion: 0.10
Nodes (26): delay(), handleSemp(), hostedResponse(), installMockServer(), json(), MockServerOptions, readBody(), routePath() (+18 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.19
Nodes (25): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+17 more)

### Community 24 - "showToast"
Cohesion: 0.06
Nodes (34): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, TaggedLogger (+26 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (151): Event Handling, Laying out an admin page, Cross-references, Defensive-guard tests, Integration tests, Module tests, Node test files, Shared state (+143 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): playwright-core, abort(), aliasLookup(), alive(), askLine(), askSecret(), basic(), broker (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (62): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), issuesSession(), aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED (+54 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "message.ts"
Cohesion: 0.12
Nodes (30): buildMessage(), buildSample(), key(), loadStore(), seed(), buildSolaceSdk(), sessions, attachmentOf() (+22 more)

### Community 31 - "demo-flow.test.ts"
Cohesion: 0.06
Nodes (45): Global hooks, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_TLS_REQUEST_BYTES, namesList() (+37 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (34): BackupModule, ConnectionsModule, QueueBrowserModule, QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS (+26 more)

### Community 34 - "backup.go"
Cohesion: 0.03
Nodes (63): diffByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo, backupRunJSON, backupScheduleJSON (+55 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.05
Nodes (58): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES (+50 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (59): TestSweepLeftovers_ADataDirectoryThatIsAFile(), gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), appIndexFile(), firstSegment(), hostedHandler (/hosted endpoint) (+51 more)

### Community 39 - "contract_test.go"
Cohesion: 0.08
Nodes (26): contractNormalize(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv, goString(), loadContractSeed(), readContract() (+18 more)

### Community 40 - "tls.go"
Cohesion: 0.07
Nodes (23): browserKeyProblem(), formatFingerprint(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem() (+15 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (19): Changing the TLS files, auditCall, auditWriter, auditWrote, bodyDeadline(), decodeJSON(), decodeJSONLimit(), pathTarget() (+11 more)

### Community 42 - "time.Time"
Cohesion: 0.08
Nodes (27): activeTicket, bucket, clientWatch, newRateWindow(), failures, fakeAfter, loginLimits, rateWindow (+19 more)

### Community 43 - "router.ts"
Cohesion: 0.13
Nodes (39): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+31 more)

### Community 44 - "loadStore"
Cohesion: 0.15
Nodes (31): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures() (+23 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.06
Nodes (50): connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS (+42 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "user-management/module.test.ts"
Cohesion: 0.13
Nodes (19): NO_OPERATE, NO_READ_ONLY, UserManagementModule, ADMIN, answerSignOut(), CHOICES, clickRow(), el() (+11 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (44): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+36 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (36): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+28 more)

### Community 50 - "tls.ts"
Cohesion: 0.08
Nodes (35): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+27 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+40 more)

### Community 53 - "fixtures.ts"
Cohesion: 0.07
Nodes (48): MANAGED_ERROR_CODES, DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm(), firstVisit(), PanelOptions, BROKERS (+40 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.09
Nodes (29): QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+21 more)

### Community 56 - "controls/managed.ts"
Cohesion: 0.19
Nodes (17): ManagedDemo, ManagedPanelDeps, managedSections(), button(), connectionReference(), copyable(), el(), kv() (+9 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.05
Nodes (44): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+36 more)

### Community 58 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

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
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.12
Nodes (17): Administer, Audit settings, Back up and restore, Configure, Connection modes, Contents, Environment variables, How it works (+9 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (73): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+65 more)

### Community 66 - "managed.test.ts"
Cohesion: 0.09
Nodes (20): QueueFixture, connection(), DEMO_ACCOUNTS, DEMO_STANDARD_ROOTS, DEMO_TOPOLOGY, demoSeed(), everything, pw() (+12 more)

### Community 67 - "queue-source.ts"
Cohesion: 0.08
Nodes (20): State, canOperate(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), QueueSource (+12 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (28): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connChanges() (+20 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "copy-flow.test.ts"
Cohesion: 0.12
Nodes (36): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), listQueues(), listVpns() (+28 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "tls_api_test.go"
Cohesion: 0.19
Nodes (24): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+16 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "samples.test.ts"
Cohesion: 0.08
Nodes (39): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, DestinationType, MessageType, SDTFieldType, MessageFields, SDT_WIRE_HEADER (+31 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.04
Nodes (37): setForwarded(), adminHandler, newDialer(), smfPathFor(), dialer, dialRequest, dialResponse, hostedHandler (+29 more)

### Community 79 - "service-verify.ts"
Cohesion: 0.08
Nodes (37): SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+29 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (41): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DEST_TARGET_LOCKED_TITLE (+33 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "fileConfigFromConfig"
Cohesion: 0.14
Nodes (15): fileConfigFromConfig(), levelName(), onFailureOrDefault(), prefixStrings(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestLevelName(), logStartup(), modeName() (+7 more)

### Community 86 - "testing.T"
Cohesion: 0.07
Nodes (65): newBackupKey(), openBackup(), sealBackup(), backupFixtureFrom(), envelope(), mustSealer(), newBackupFixture(), reseal() (+57 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "utils.ts"
Cohesion: 0.06
Nodes (47): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+39 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "configfile_test.go"
Cohesion: 0.26
Nodes (21): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+13 more)

### Community 91 - "configfile.go"
Cohesion: 0.13
Nodes (19): config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), moduleCatalog(), removedInUse(), removedTLSPaths() (+11 more)

### Community 92 - "Kernel.installModule"
Cohesion: 0.20
Nodes (7): createService (subscription-explorer), fetchAllSubscriptions, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), primarySempContextFrom

### Community 93 - "ui-modal.ts"
Cohesion: 0.14
Nodes (16): ProvisionedConnectionCard, ProvisionedTarget, CopyMode, CopyUiElements, CopyUiApi, CopyUiServices, buildDestSummary(), buildSourceSummary() (+8 more)

### Community 94 - "session.ts"
Cohesion: 0.07
Nodes (27): removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, AuthenticationScheme (+19 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (72): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+64 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "fileConfig"
Cohesion: 0.13
Nodes (16): Adding a gateway config.yaml setting, Gateway and Admin How-tos, flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), fileAccess, fileAudit (+8 more)

### Community 100 - "testing.T"
Cohesion: 0.05
Nodes (77): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+69 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "defaultFileConfig"
Cohesion: 0.16
Nodes (16): Writing a config.yaml by hand (development only), checkAuditOnFailure(), defaultFileConfig(), intInRange(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated(), TestToConfig_BoundsNameTheOtherKey() (+8 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.11
Nodes (27): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+19 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 111 - "defaultConfig"
Cohesion: 0.16
Nodes (21): seedConfigFile(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), configSource, newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), defaultConfig() (+13 more)

### Community 112 - "serveUntilStopped"
Cohesion: 0.11
Nodes (17): certHolder, serveUntilStopped(), appendPEMCerts(), fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), newCertHolder(), newTLSManager() (+9 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "ManagedResult"
Cohesion: 0.05
Nodes (31): Audit trail, AccessLevel, ManagedResult, ManagedService, ConnMgmtService, connPath(), createConnMgmtService(), ManagedConnRecord (+23 more)

### Community 119 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 120 - "relay.ts"
Cohesion: 0.19
Nodes (17): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+9 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "storecrypt_test.go"
Cohesion: 0.13
Nodes (19): checksums, fileSum, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory() (+11 more)

### Community 123 - "log/slog.Logger"
Cohesion: 0.12
Nodes (12): Demo and fake gateway suite, Go suite, How the tests are organized, Layout of tests, Type check and lint, Web suite, syncDir(), TestSyncDir_ReportsAMissingDirectory() (+4 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "rbac.ts"
Cohesion: 0.15
Nodes (19): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, explainAccess() (+11 more)

### Community 127 - "main_test.go"
Cohesion: 0.06
Nodes (59): Security model, What it does not enforce, What the gateway enforces, acceptWatch, boolEnv(), deadHijacker, envOr(), loadConfig() (+51 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (105): Adding a New Module, Circular Dependency Resolution, DOM Access, pickQueue() reusable picker, AdminSessionHandlers, createGate(), gateOnAdminSession(), applyGate() (+97 more)

### Community 132 - "sealer"
Cohesion: 0.28
Nodes (5): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeRole

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (35): decodeTo(), expectInvalid(), expectRev(), managedEnv, jsonBody(), mustBody(), scheduleBody(), staleBasis() (+27 more)

### Community 139 - "serveUntilStopped"
Cohesion: 0.15
Nodes (9): dialUpstreamTLS(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), standardRoots, newTrustHolder(), TestTrustHolder_ChangesRunTheHooksOnlyWhenSomethingChanged(), TestTrustHolder_StandardRoots(), trustHolder (+1 more)

### Community 140 - "decodeConfigFile"
Cohesion: 0.21
Nodes (12): configVerifier(), decodeConfigFile(), encodeConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten(), TestDecodeConfigFile_TwoFactorDefaultsAndIsWritten() (+4 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (29): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+21 more)

### Community 148 - "go_pkg_strings"
Cohesion: 0.07
Nodes (49): Gateway contract cases, clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine() (+41 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (63): connName(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), userName(), brokerTarget, clientRec, connRec (+55 more)

### Community 155 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.09
Nodes (22): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+14 more)

### Community 157 - "createManagedPanel"
Cohesion: 0.25
Nodes (19): createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), connectSolace(), doConnect(), doLogout() (+11 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 161 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "vitest.config.ts"
Cohesion: 0.33
Nodes (3): moduleRegistryPlugin(), TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 163 - "Testing"
Cohesion: 0.18
Nodes (11): Contents, Coverage policy, End-to-end run, Requirements, Running the tests, Testing, Thresholds and floors, v8 ignore policy (+3 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "wireUiEvents"
Cohesion: 0.38
Nodes (10): syncDestFormFromSnapshot(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability() (+2 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 171 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 172 - "End-to-end run"
Cohesion: 0.25
Nodes (8): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks, restart()

### Community 174 - "settings_test.go"
Cohesion: 0.13
Nodes (34): expectStale(), assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv (+26 more)

### Community 176 - "Setup"
Cohesion: 0.25
Nodes (8): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, up()

### Community 179 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

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
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1257 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `fileConfig`, `managed.go`, `store`, `net/http.ResponseWriter`, `go_pkg_strings`, `showToast`, `storecrypt_test.go`, `newManagedEnv`?**
  _High betweenness centrality (0.178) - this node is a cross-community bridge._
- **Are the 125 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 125 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `writeFile` be split into smaller, more focused modules?**
  _Cohesion score 0.10023310023310024 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `showToast` to `writer_test.go`, `vitest`, `backup/module.ts`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 84 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._