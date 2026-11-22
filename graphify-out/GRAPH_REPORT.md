# Graph Report - smu-dirty  (2026-11-22)

## Corpus Check
- 366 files · ~740,515 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: .css 26, (none) 7, .dockerignore 1)

## Summary
- 5309 nodes · 17335 edges · 183 communities (146 shown, 37 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2338 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `103dfb3e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp.go
- managed-panel.ts
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backupService
- core event-bus
- notification-center/index.ts
- tls_test.go
- core/types.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- managed-api.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- showToast
- pages_test.go
- utils.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- sdtBodyOf
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
- user-management/service.ts
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
- newManagedEnv
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
- relay.ts
- SEMP v2 Paged Discovery (core library)
- testing.T
- Administration (`/solAdmin`)
- runDirectChecks
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
- samples.test.ts
- configfile_test.go
- Developer Guide
- manual-to-md.mjs
- broker/store.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- go_pkg_strings
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- net.Conn
- dest-provisioned.test.ts
- sdt.ts
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
- access-test.ts
- file-kind.ts
- Configure
- createPages
- keyfile_test.go
- log/slog.Logger
- createQueuePicker
- file-kind.test.ts
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
- Module Isolation
- samples.ts
- backup_api_test.go
- serveUntilStopped
- hashRecoveryCode
- queue-discovery module.ts
- MockEmitter
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- showBinary
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- Two-factor sign-in
- vite-build.mjs
- auditMissing
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Module 3: Queue Copy
- csp.mjs
- createConnTabs
- VpnSwitch
- row-list/index.ts
- pwaHandler
- User Guide
- TestPagePolicy_StyleBlockOrNone
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- TestTwoFactorRefusal
- End-to-end run
- settings_test.go
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

## Communities (183 total, 37 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.12
Nodes (28): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret() (+20 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.05
Nodes (56): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, Contents (+48 more)

### Community 2 - "writeFile"
Cohesion: 0.08
Nodes (60): mustRead(), testCertPair, testCertSpec, clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames() (+52 more)

### Community 3 - "createGateway"
Cohesion: 0.10
Nodes (38): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes() (+30 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backupService"
Cohesion: 0.10
Nodes (14): backupName(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+6 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+17 more)

### Community 9 - "tls_test.go"
Cohesion: 0.07
Nodes (40): TestRecoverPanics_LetsAbortHandlerThrough(), newCapturingLogger(), TestAdminHandler_EnabledButNotDeployed(), TestPWAHandler_UnusableBundleStopsTheStart(), writeFile(), appendPEMCerts(), browserKeyProblem(), buildTrustPool() (+32 more)

### Community 10 - "core/types.ts"
Cohesion: 0.03
Nodes (75): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), PickerCache, PickQueueOptions, PickQueueResult, QueuePicker (+67 more)

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
Cohesion: 0.05
Nodes (52): DOM Access, The Module Contract, createService (subscription-explorer), boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR (+44 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.10
Nodes (37): Writing to the store, fileOfSchedule(), TestBackupService_LoadRefusesADamagedSchedule(), TestStageSettings_RefusalsComeBackAsErrors(), checkRev(), countAdmins(), txn, wfix (+29 more)

### Community 19 - "managed-api.ts"
Cohesion: 0.09
Nodes (37): DESTINATION_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, buildBrokerUrl(), Exchange, log, MANAGED_ERROR_CODES, managedErrorMessage(), managedRequest() (+29 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.20
Nodes (21): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+13 more)

### Community 24 - "showToast"
Cohesion: 0.09
Nodes (21): TaggedLogger, showToast(), createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom() (+13 more)

### Community 25 - "pages_test.go"
Cohesion: 0.17
Nodes (61): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectRedirect(), managedEnv, holdTurn() (+53 more)

### Community 26 - "utils.ts"
Cohesion: 0.08
Nodes (37): isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString(), matchStringRegexCache (+29 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (51): abort(), alive(), askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+43 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (61): RFC-5280, RFC-6238, aliasLookup(), checkedAlias(), freshCode(), aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED (+53 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "sdtBodyOf"
Cohesion: 0.33
Nodes (5): Coverage policy, Thresholds and floors, v8 ignore policy, MockDestination, sdtBodyOf()

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.03
Nodes (95): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Writing tests (+87 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (101): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+93 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.05
Nodes (46): AboutModule, contentsButton(), installManual(), show(), turnTo(), installTabs(), QueueCopyModule, ACTIVE_MODULES (+38 more)

### Community 34 - "storecrypt_test.go"
Cohesion: 0.10
Nodes (21): checksums, fileSum, checksumRev(), newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused() (+13 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.04
Nodes (61): pickQueue() reusable picker, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG (+53 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.07
Nodes (45): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie() (+37 more)

### Community 39 - "contract_test.go"
Cohesion: 0.12
Nodes (16): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), goString(), contractCase (+8 more)

### Community 40 - "tls.go"
Cohesion: 0.16
Nodes (13): parseCertificatePEM(), pemCertificates(), equalCertJSON(), TestTrustFileName(), trustFileName(), trustListedName(), warnIfExpiring(), tlsCertJSON (+5 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (21): auditCall, auditEntry, auditWriter, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+13 more)

### Community 42 - "time.Time"
Cohesion: 0.07
Nodes (32): clientIP(), normalizeAddr(), prefixContains(), accessConfig, activeTicket, bucket, clientCtxKey, clientWatch (+24 more)

### Community 43 - "user-management/service.ts"
Cohesion: 0.36
Nodes (5): createUserMgmtService(), UserList, userPath(), UserPayload, PAYLOAD

### Community 44 - "loadStore"
Cohesion: 0.12
Nodes (27): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), TestBuildManagedRoutes_StoreErrorIsReturned(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+19 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.06
Nodes (52): clientUsernameOk(), sempUsernameOk(), connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem() (+44 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "user-management/module.ts"
Cohesion: 0.05
Nodes (51): Adding a New Module, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions (+43 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (42): fakeClock, fixed(), newSessions(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (34): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+26 more)

### Community 50 - "tls.ts"
Cohesion: 0.06
Nodes (38): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+30 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.07
Nodes (41): describeSchedule(), diffLines(), MAX_IMPORT_BYTES, pad(), WEEKDAYS, BackupFile, BackupSchedule, BackupService (+33 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.07
Nodes (29): ALL, bundleSources(), productSources(), REPO_ROOT, rows(), call(), CLIENT, FAULTS (+21 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.07
Nodes (35): AccessExplanation, DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore() (+27 more)

### Community 56 - "newManagedEnv"
Cohesion: 0.12
Nodes (31): TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), newManagedEnv(), shortBodyDeadline(), expectPage(), passwordForm(), slowHasher(), TestAuthPages_UnauthenticatedBudget() (+23 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (43): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+35 more)

### Community 58 - "relay_test.go"
Cohesion: 0.13
Nodes (23): errReader, fakeBroker, rawExchange(), isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+15 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.16
Nodes (40): commitStep, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers(), crashAfter(), damageTemps() (+32 more)

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
Cohesion: 0.15
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (66): TestBackupService_ExportAndImportRoundTripTwoFactor(), savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures() (+58 more)

### Community 66 - "two-factor.test.ts"
Cohesion: 0.06
Nodes (57): ManagedDemo, authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button() (+49 more)

### Community 67 - "rbac.ts"
Cohesion: 0.39
Nodes (8): ALWAYS_VISIBLE, explainAccess(), findQueueRow(), findVpnRow(), matchesAny(), matchGlob(), MODULE_REQUIREMENTS, vpnMatchesAny()

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (33): Changing the TLS files, Gateway and Admin How-tos, Gateway contract cases, apiError, auditPre, bodyRev, clientJSON, clientSeenJSON (+25 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "relay.ts"
Cohesion: 0.07
Nodes (49): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), delay(), DEMO_GATEWAY_MARKER, RESTART_PAUSE_MS (+41 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "testing.T"
Cohesion: 0.08
Nodes (43): backupFixtureFrom(), newBackupFixture(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_FailedWriteChangesNothing(), TestBackupService_LoopRunsOnScheduleAndStops(), TestBackupService_PruneLogsAFileItCannotDelete(), TestBackupService_PruneSkipsAnUnreadableDirectory() (+35 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.05
Nodes (40): setForwarded(), openAuditor(), TestAuditor_NilRecordsNothing(), TestOpenAuditor_AppendsToAnExistingFile(), auditor, configSource, newDialer(), newRateWindow() (+32 more)

### Community 79 - "ui-modal.test.ts"
Cohesion: 0.03
Nodes (107): Solace mock, createManagedProfile(), cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener() (+99 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.04
Nodes (75): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+67 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.07
Nodes (55): connName(), diffByName(), flattenSettings(), newBackupKey(), openBackup(), sameRecord(), sealBackup(), settingsChanges() (+47 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "backup_api.go"
Cohesion: 0.21
Nodes (11): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+3 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "samples.test.ts"
Cohesion: 0.20
Nodes (13): The payload samples queue, MAX_PREVIEW_PIXELS, attachmentBytes(), AttachmentPayload, binaryPayload(), classifyAttachment(), PayloadFileSource, TEXT_TYPE_EXT (+5 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.04
Nodes (96): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), checkAuditOnFailure(), config, boolEnv(), checkModuleIDs(), checkRenamedEnv(), configVerifier() (+88 more)

### Community 92 - "Developer Guide"
Cohesion: 0.12
Nodes (16): A chapter, Code Conventions, Contents, CSS, Developer Guide, Error Handling, Figures, File Organization (+8 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.03
Nodes (129): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+121 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.09
Nodes (73): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnvFrom() (+65 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "go_pkg_strings"
Cohesion: 0.05
Nodes (26): auditCategory, changedOnDiskError, clientGoneError, hostedInfo, TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), fileResolvable(), hasExt() (+18 more)

### Community 100 - "smf_test.go"
Cohesion: 0.15
Nodes (21): fakeAnswer, fakeSMFBroker, newFakeSMFBroker(), newSMFEnv(), TestParseSMFPath(), TestSMF_BrokerFailuresAre502(), TestSMF_BrowserGoneBeforeTheSwitch(), TestSMF_ClosesOnRevocation() (+13 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "net.Conn"
Cohesion: 0.28
Nodes (3): deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.05
Nodes (39): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, BusEvents, EventBus, log (+31 more)

### Community 106 - "sdt.ts"
Cohesion: 0.21
Nodes (16): bytesToBase64(), block(), decodeSdt(), hasChildren(), inline(), integer(), INTEGER_TYPES, SdtEnums (+8 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.17
Nodes (21): Vendor scripts, Test DOM, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER (+13 more)

### Community 111 - "access_test.go"
Cohesion: 0.13
Nodes (33): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+25 more)

### Community 112 - "quietLogger"
Cohesion: 0.13
Nodes (32): newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), serveUntilStopped(), TestBuildManagedRoutes_UnreadableScheduleIsReturned(), TestNewManagedRouting_AuditLogErrorIsReturned(), TestNewManagedRouting_Enabled(), dialUpstreamTLS() (+24 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.09
Nodes (21): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+13 more)

### Community 118 - "access-test.ts"
Cohesion: 0.15
Nodes (15): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+7 more)

### Community 119 - "file-kind.ts"
Cohesion: 0.24
Nodes (15): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+7 more)

### Community 120 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "keyfile_test.go"
Cohesion: 0.25
Nodes (13): createExclusive(), existingStore(), loadStoreKey(), parseStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures() (+5 more)

### Community 123 - "log/slog.Logger"
Cohesion: 0.11
Nodes (14): Layout of tests, checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftoversOf(), syncDir(), TestSyncDir_ReportsAMissingDirectory() (+6 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "file-kind.test.ts"
Cohesion: 0.28
Nodes (6): app0(), Part, png(), PNG_SIG, u32be(), zeros()

### Community 127 - "main_test.go"
Cohesion: 0.08
Nodes (52): acceptWatch, envOr(), loadConfig(), main(), newRootHandler(), parseLogLevel(), printVersionIfRequested(), serve() (+44 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (102): Circular Dependency Resolution, Laying out an admin page, Integration tests, vitest, DEFAULT_MAX_MESSAGES_PER_QUEUE, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob() (+94 more)

### Community 132 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "samples.ts"
Cohesion: 0.29
Nodes (4): PAYLOAD_SAMPLES, PayloadSample, MessageFields, SdtBody

### Community 138 - "backup_api_test.go"
Cohesion: 0.12
Nodes (40): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+32 more)

### Community 139 - "serveUntilStopped"
Cohesion: 0.12
Nodes (9): certHolder, standardRoots, newCertHolder(), newTLSManager(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair(), tlsSeams, trustHolder (+1 more)

### Community 140 - "hashRecoveryCode"
Cohesion: 0.50
Nodes (5): hashRecoveryCode(), normaliseRecoveryCode(), recoveryIndex(), TestRecoveryCode_HashListAndIndex(), TestRecoveryCode_NormaliseAndHash()

### Community 148 - "showBinary"
Cohesion: 0.70
Nodes (5): hideContent(), note(), resetBinary(), showBinary(), toggleContent()

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (58): sessionEnders(), slicesIndexUser(), TestBackup_SessionEndersNameTwoFactorChanges(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation() (+50 more)

### Community 155 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.13
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 161 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 164 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 165 - "pwaHandler"
Cohesion: 0.14
Nodes (6): adminHandler, hostedHandler, setAppPageHeaders(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 166 - "User Guide"
Cohesion: 0.07
Nodes (28): About and Help, Binding to a Queue, Caching, Connection Profiles, Contents, Deleting Messages, Downloading Messages, Filter syntax (+20 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 172 - "End-to-end run"
Cohesion: 0.25
Nodes (8): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks, restart()

### Community 174 - "settings_test.go"
Cohesion: 0.15
Nodes (30): assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, TestSettings_AccessListThatAdmitsTheAdmin() (+22 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.13
Nodes (34): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), basisMoved(), certFingerprint(), createCookieJar() (+26 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1257 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `storecrypt_test.go`, `managed.go`, `net/http.ResponseWriter`, `log/slog.Logger`, `user-management/module.ts`, `newManagedEnv`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp.go` be split into smaller, more focused modules?**
  _Cohesion score 0.11861861861861862 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `user-management/module.ts` to `showToast`, `writer_test.go`, `backup/module.ts`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._