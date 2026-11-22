# Graph Report - smu-dirty  (2026-11-22)

## Corpus Check
- 363 files · ~730,253 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5260 nodes · 17228 edges · 179 communities (144 shown, 35 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2335 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4506c7ec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp.go
- managed-panel.ts
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- gateway-settings/module.ts
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
- modules
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- showToast
- pages_test.go
- core/types.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- demo-flow.test.ts
- backup.ts
- variants.test.ts
- writer
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
- demo-flow.test.ts
- fixtures.ts
- gateway/types.ts
- tests variants
- panel.ts
- gateway/index.ts
- relay_test.go
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- two-factor.test.ts
- rbac.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- copy-flow.test.ts
- SEMP v2 Paged Discovery (core library)
- testing.T
- Administration (`/solAdmin`)
- settings.ts
- log/slog.Logger
- ui-modal.test.ts
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- backup_api.go
- CSS Organization
- run
- configfile_test.go
- tls.test.ts
- dial.go
- session.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- backup.go
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- net.Conn
- dest-provisioned.test.ts
- file-kind.ts
- Deployment Options
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- defaultConfig
- quietLogger
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- utils.ts
- connection-management/service.ts
- Configure
- createPages
- checksums
- log/slog.Logger
- createQueuePicker
- restart.go
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- scripts/vite-build.mjs wrapper
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- Module 2: Queue Browser
- backup_api_test.go
- serveUntilStopped
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- .checkSettings
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- Two-factor sign-in
- vite-build.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Module 3: Queue Copy
- csp.mjs
- vitest.config.ts
- Testing
- RowList
- live
- User Guide
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- End-to-end run
- settings_test.go
- Setup
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
2. `vitest` - 125 edges
3. `store` - 99 edges
4. `quietLogger()` - 99 edges
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

## Communities (179 total, 35 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.13
Nodes (29): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor() (+21 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.05
Nodes (57): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), CardPart, createProvisionedConnectionCard(), populateVpns(), render() (+49 more)

### Community 2 - "writeFile"
Cohesion: 0.08
Nodes (66): go-web-proxy main (gateway entrypoint), writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists() (+58 more)

### Community 3 - "createGateway"
Cohesion: 0.14
Nodes (29): acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes() (+21 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.08
Nodes (34): backupName(), fileOfSchedule(), newBackupService(), partialName(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocProblem() (+26 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "gateway-settings/module.ts"
Cohesion: 0.09
Nodes (27): FIELDS, GatewaySettingsModule, GatewaySettingsOptions, Input, Kind, MODULE_DESCRIPTIONS, Tree, ClientSeen (+19 more)

### Community 10 - "queue-copy/module.ts"
Cohesion: 0.03
Nodes (79): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+71 more)

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
Cohesion: 0.07
Nodes (49): Adding a New Module, DOM Access, The Module Contract, boot(), AdminSessionHandlers, applyGate(), DEFAULT_LOG_LEVEL, LogLevel (+41 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (35): Writing to the store, importStaged, savedConn, sectionImport, checkRev(), countAdmins(), txn, wfix (+27 more)

### Community 19 - "routes.test.ts"
Cohesion: 0.13
Nodes (22): listQueues(), listVpns(), brokerVpns(), delay(), handleSemp(), hostedResponse(), installMockServer(), json() (+14 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "modules"
Cohesion: 0.25
Nodes (6): src/main.ts application bootstrap, modules, MOCK_REDIRECTS table, injectModuleTemplates plugin, serviceMockRedirect plugin, variantRedirect plugin

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.18
Nodes (24): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+16 more)

### Community 24 - "showToast"
Cohesion: 0.07
Nodes (34): Code Conventions, CSS, Error Handling, File Organization, Linting, Logging standard, Modals, TypeScript (+26 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (82): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+74 more)

### Community 26 - "core/types.ts"
Cohesion: 0.04
Nodes (60): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, createGate(), gateOnAdminSession(), GateOptions (+52 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): askLine(), askSecret(), basic(), bcheck(), bindInQueueBrowser(), bindQueue(), broker, brokerSecrets (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (65): RFC-5280, RFC-6238, Browser and harness notes, aliasLookup(), checkedAlias(), freshCode(), aliasAddress(), AUDIT_FIELDS (+57 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "message.ts"
Cohesion: 0.10
Nodes (34): buildMessage(), buildSample(), DestinationType, MessageType, SDTFieldType, buildSolaceSdk(), dropAllSessions(), sessions (+26 more)

### Community 31 - "demo-flow.test.ts"
Cohesion: 0.07
Nodes (41): formatUtc(), EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesOptions (+33 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "variants.test.ts"
Cohesion: 0.13
Nodes (14): ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES (+6 more)

### Community 34 - "writer"
Cohesion: 0.04
Nodes (46): changedOnDiskError, clientGoneError, checkJournalName(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers() (+38 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.05
Nodes (58): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+50 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (67): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+59 more)

### Community 39 - "contract_test.go"
Cohesion: 0.12
Nodes (16): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), goString(), contractCase (+8 more)

### Community 40 - "tls.go"
Cohesion: 0.08
Nodes (22): browserKeyProblem(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem(), TestProbeWritable() (+14 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (16): auditCall, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), userSaveAction() (+8 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, activeTicket, bucket, clientWatch, failures (+16 more)

### Community 43 - "router.ts"
Cohesion: 0.09
Nodes (38): DialResponse, QGlob, TwoFactorMode, BackupDoc, createRouter(), handle(), match(), error() (+30 more)

### Community 44 - "loadStore"
Cohesion: 0.12
Nodes (26): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), TestBuildManagedRoutes_StoreErrorIsReturned(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture() (+18 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.07
Nodes (45): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+37 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "user-management/module.test.ts"
Cohesion: 0.13
Nodes (18): NO_OPERATE, NO_READ_ONLY, ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden() (+10 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (43): fakeClock, fixed(), newTestAuditor(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+35 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (35): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+27 more)

### Community 50 - "tls.ts"
Cohesion: 0.12
Nodes (37): docOf(), glob(), openBackup(), port(), totpDoc(), glob(), BadRequest, boolean() (+29 more)

### Community 52 - "demo-flow.test.ts"
Cohesion: 0.04
Nodes (83): Global hooks, BackupModule, describeSchedule(), diffLines(), MAX_IMPORT_BYTES, pad(), WEEKDAYS, BackupFile (+75 more)

### Community 53 - "fixtures.ts"
Cohesion: 0.05
Nodes (51): BROKERS, resetScenario(), scenario, ScenarioState, seedState(), setBrokers(), VpnFixture, RESTART_PAUSE_MS (+43 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.11
Nodes (17): anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult, DeleteUserResult, entitled(), ListVersions (+9 more)

### Community 56 - "panel.ts"
Cohesion: 0.17
Nodes (29): authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS (+21 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (42): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+34 more)

### Community 58 - "relay_test.go"
Cohesion: 0.15
Nodes (20): errReader, fakeBroker, answerJSON(), newRelayEnv(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers(), TestRelay_InFlightCapPerUser(), TestRelay_IsAuditedOnlyWhileAccessIsOn() (+12 more)

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
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (69): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn() (+61 more)

### Community 66 - "two-factor.test.ts"
Cohesion: 0.06
Nodes (42): clock(), ManagedDemo, ManagedPanelDeps, TLS_READ_ONLY_ID, QueueFixture, mockCode(), STEP_MS, stepOf() (+34 more)

### Community 67 - "rbac.ts"
Cohesion: 0.05
Nodes (52): ProvisionedConnectionCard, ProvisionedTarget, State, filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows() (+44 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.10
Nodes (15): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+7 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (32): Changing the TLS files, Gateway and Admin How-tos, auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON (+24 more)

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
Cohesion: 0.10
Nodes (39): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn() (+31 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "testing.T"
Cohesion: 0.08
Nodes (54): waitFor(), decodeAny(), managedEnv, loadContractSeed(), readContract(), readContractVectors(), sentErrorCodes(), TestContract_Cases() (+46 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "settings.ts"
Cohesion: 0.13
Nodes (24): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+16 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.07
Nodes (26): setForwarded(), adminHandler, bodyDeadline(), writeRateLimited(), openSocket, newPWAHandler(), setAppPageHeaders(), pwaHandler (+18 more)

### Community 79 - "ui-modal.test.ts"
Cohesion: 0.03
Nodes (102): Cross-references, Defensive-guard tests, Module tests, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM (+94 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.08
Nodes (52): formatBytes(), QueueCopyModule, DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements() (+44 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.12
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.10
Nodes (45): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+37 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "backup_api.go"
Cohesion: 0.13
Nodes (17): monthSlot(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleProblem(), backupFileInfo, backupRunJSON, backupSchedule, backupScheduleJSON (+9 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "run"
Cohesion: 0.18
Nodes (17): playwright-core, abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets() (+9 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (85): Writing a config.yaml by hand (development only), config, checkModuleIDs(), checkRenamedEnv(), configVerifier(), decodeConfigFile(), defaultFileConfig(), defaultSecretPaths() (+77 more)

### Community 92 - "tls.test.ts"
Cohesion: 0.15
Nodes (12): DEMO_SUBJECT, STANDARD_ROOTS_MISSING, CA, call(), gateway(), get(), Gw, KEY (+4 more)

### Community 93 - "dial.go"
Cohesion: 0.20
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 94 - "session.ts"
Cohesion: 0.07
Nodes (26): createEmitter(), MockEmitter, DIRECT_BROKER, createQueueBrowser(), interval(), pump(), MockQueueBrowser, AuthenticationScheme (+18 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (69): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv(), newManagedEnvFrom() (+61 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "backup.go"
Cohesion: 0.05
Nodes (38): checkAuditOnFailure(), auditCategory, connName(), diffByName(), flattenSettings(), mergeByName(), sameRecord(), TestBackup_DiffIgnoresRev() (+30 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (25): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+17 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.06
Nodes (52): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+44 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (18): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+10 more)

### Community 111 - "defaultConfig"
Cohesion: 0.08
Nodes (25): Adding a gateway config.yaml setting, TestBackup_SettingsChangesNamesDottedKeys(), configSource, newLive(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), TestLive_ApplySwapsEveryLiveKey() (+17 more)

### Community 112 - "quietLogger"
Cohesion: 0.14
Nodes (30): serveUntilStopped(), dialUpstreamTLS(), newAdminHandler(), newReverseProxy(), newUpstreamTransport(), TestAdminHandler_DisabledIs404(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_TrailingSlashRedirects() (+22 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.09
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "utils.ts"
Cohesion: 0.05
Nodes (62): pickQueue() reusable picker, ConfirmOptions, PickerCache, PickQueueOptions, PickQueueResult, Refs, AdminTableOptions, createRowList() (+54 more)

### Community 119 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 120 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 123 - "log/slog.Logger"
Cohesion: 0.15
Nodes (7): Layout of tests, syncDir(), TestSyncDir_ReportsAMissingDirectory(), writeTemp(), journal, atomicWrite(), tlsSeams

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "restart.go"
Cohesion: 0.50
Nodes (3): restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), restartJSON

### Community 127 - "main_test.go"
Cohesion: 0.08
Nodes (52): acceptWatch, boolEnv(), envOr(), loadConfig(), main(), newRootHandler(), parseStrictBool(), printVersionIfRequested() (+44 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (111): Circular Dependency Resolution, Laying out an admin page, Integration tests, vitest, DEFAULT_MAX_MESSAGES_PER_QUEUE, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob() (+103 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.13
Nodes (38): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+30 more)

### Community 139 - "serveUntilStopped"
Cohesion: 0.15
Nodes (6): certHolder, standardRoots, newCertHolder(), newTLSManager(), trustHolder, trustState

### Community 142 - "boot.managed.ts"
Cohesion: 0.10
Nodes (29): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+21 more)

### Community 148 - ".checkSettings"
Cohesion: 0.29
Nodes (6): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (53): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), TestContract_Validation(), contractStores (+45 more)

### Community 155 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

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
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 165 - "live"
Cohesion: 0.09
Nodes (12): clientACL(), auditor, gatedWriter, hostedHandler, live, liveSettings, buildManagedRoutes(), gateDirect() (+4 more)

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 172 - "End-to-end run"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.13
Nodes (37): assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, mustRead() (+29 more)

### Community 176 - "Setup"
Cohesion: 0.17
Nodes (12): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, End-to-end run (+4 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (43): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), issuesSession(), basisMoved() (+35 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1246 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `backup_test.go`, `store`, `live`, `net/http.ResponseWriter`, `showToast`, `checksums`, `newManagedEnv`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp.go` be split into smaller, more focused modules?**
  _Cohesion score 0.12941176470588237 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `showToast` to `writer_test.go`, `demo-flow.test.ts`, `utils.ts`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._