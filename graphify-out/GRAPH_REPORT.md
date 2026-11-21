# Graph Report - smu-dirty  (2026-11-21)

## Corpus Check
- 364 files · ~738,946 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5298 nodes · 17361 edges · 190 communities (155 shown, 35 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2384 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `68b4e1c2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totpCode
- provisioned-connect.ts
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- ui-modal.test.ts
- vitest
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- gateway-settings/module.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- showToast
- pages_test.go
- createEventBus
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
- demo-flow.test.ts
- backup.ts
- demo-flow.test.ts
- backup.go
- Filter Messages Dialog
- core/types.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tls_test.go
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
- fixtures.ts
- gateway/types.ts
- tests variants
- panel.ts
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
- relay_test.go
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
- smf_test.go
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
- settings.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- ManagedResult
- tlsManager
- initDetails
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
- net.Conn
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
- quietLogger
- vite-build.mjs
- createManagedPanel
- queue-discovery ui.js
- ConnectionsModule Test Suite
- Configure
- csp.mjs
- run
- Testing
- restartServe
- auditor
- User Guide
- wireUiEvents
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- reverseProxy (transparent upstream)
- verifyViaSempV1
- End-to-end run
- optional-field.test.ts
- settings_test.go
- ManagedPanel
- Setup
- provisioned-connection/index.ts
- syncBuffer
- createConnTabs
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- expectLogged
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

## Communities (190 total, 35 thin omitted)

### Community 0 - "totpCode"
Cohesion: 0.32
Nodes (16): newTOTPGuard(), loadTOTPVectors(), TestTOTP_NewSecretRoundTripsThroughVerify(), TestTOTPCode_RefusesASecretThatIsNotBase32(), TestTOTPCode_RFC6238Vectors(), TestTOTPGuard_AWrongCodeRecordsNothing(), TestTOTPGuard_ConcurrentUseOfOneCodePassesOnce(), TestTOTPGuard_ForgetStartsAgain() (+8 more)

### Community 1 - "provisioned-connect.ts"
Cohesion: 0.19
Nodes (15): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+7 more)

### Community 2 - "writeFile"
Cohesion: 0.08
Nodes (65): mustRead(), testCertPair, testCertSpec, clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames() (+57 more)

### Community 3 - "createGateway"
Cohesion: 0.08
Nodes (50): authenticatorSection(), rebuild(), refresh(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery() (+42 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.05
Nodes (42): backupName(), connName(), diffByName(), fileOfSchedule(), mergeByName(), monthSlot(), newBackupService(), nextRun() (+34 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): clock(), createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log (+17 more)

### Community 9 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (56): DOM Access, Cross-references, Defensive-guard tests, Module tests, Node test files, Shared state, Solace mock, Stubbing globals (+48 more)

### Community 10 - "vitest"
Cohesion: 0.06
Nodes (45): vitest, Exchange, log, managedErrorMessage(), managedRequest(), MESSAGES, Method, reportManagedFailure() (+37 more)

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
Nodes (42): pickQueue() reusable picker, boot(), PickerCache, PickQueueOptions, PickQueueResult, Refs, required(), buildBrokerUrl() (+34 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.08
Nodes (40): Writing to the store, changedOnDiskError, clientGoneError, savedConn, staleError, checkRev(), txn, wfix (+32 more)

### Community 19 - "gateway-settings/module.ts"
Cohesion: 0.06
Nodes (36): Adding a New Module, AdminSessionHandlers, createGate(), gateOnAdminSession(), applyGate(), GateOptions, ModuleGate, setError() (+28 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "audit_test.go"
Cohesion: 0.18
Nodes (25): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+17 more)

### Community 24 - "showToast"
Cohesion: 0.05
Nodes (48): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Key Concepts, The Module Contract, Integration tests, askReload(), goneMessage() (+40 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "createEventBus"
Cohesion: 0.04
Nodes (67): createEventBus(), createManagedProfile(), DialConn, ManagedDialer, SempDial, SempTarget, SolaceDial, SolaceTarget (+59 more)

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
Cohesion: 0.08
Nodes (37): PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), publish(), AuthenticationScheme, DestinationType, LogLevel (+29 more)

### Community 31 - "demo-flow.test.ts"
Cohesion: 0.06
Nodes (46): Global hooks, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_TLS_REQUEST_BYTES, namesList() (+38 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (58): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+50 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (31): ConnectionsModule, QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+23 more)

### Community 34 - "backup.go"
Cohesion: 0.04
Nodes (36): fileSum, existingStore(), warnLooseKeyMode(), TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), TestRecoverPanics_LetsAbortHandlerThrough(), parseRelayPath(), relayPath (+28 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "core/types.ts"
Cohesion: 0.04
Nodes (87): Factory Pattern, AccountControl, AccountControlOptions, AccountUser, createAccountControl(), QueuePicker, coerceConnConfig(), CONN_MODE_VALUES (+79 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.10
Nodes (36): accessLog(), appIndexFile(), firstSegment(), isProxyPath(), joinHostPort(), newAdminHandler(), parseProxyPath(), recordingResponseWriter (status/bytes/hijack) (+28 more)

### Community 39 - "contract_test.go"
Cohesion: 0.08
Nodes (32): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+24 more)

### Community 40 - "tls_test.go"
Cohesion: 0.07
Nodes (33): go-web-proxy main (gateway entrypoint), appendPEMCerts(), browserKeyProblem(), buildTrustPool(), fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), parseKeyPEM() (+25 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (19): Changing the TLS files, auditCall, auditWriter, auditWrote, bodyDeadline(), decodeJSON(), decodeJSONLimit(), pathTarget() (+11 more)

### Community 42 - "time.Time"
Cohesion: 0.08
Nodes (27): activeTicket, bucket, clientWatch, newRateWindow(), failures, fakeAfter, loginLimits, rateWindow (+19 more)

### Community 43 - "router.ts"
Cohesion: 0.15
Nodes (34): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+26 more)

### Community 44 - "loadStore"
Cohesion: 0.10
Nodes (37): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), createExclusive(), loadStoreKey(), parseStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+29 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.07
Nodes (45): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+37 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "user-management/module.ts"
Cohesion: 0.07
Nodes (34): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+26 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (44): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+36 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (36): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+28 more)

### Community 50 - "tls.ts"
Cohesion: 0.07
Nodes (36): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+28 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.07
Nodes (43): describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad(), RFC-3339, WEEKDAYS, BackupFile (+35 more)

### Community 53 - "fixtures.ts"
Cohesion: 0.05
Nodes (59): MANAGED_ERROR_CODES, delay(), Fault, MOCK_HOST, QUEUE_STATE, QueueState, resetScenario(), scenario (+51 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.09
Nodes (30): QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult (+22 more)

### Community 56 - "panel.ts"
Cohesion: 0.22
Nodes (21): managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS, DIRECT_PANEL_SEEN_KEY, el(), fillDirectForm() (+13 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (43): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+35 more)

### Community 58 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.15
Nodes (42): commitStep, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers(), crashAfter(), damageTemps() (+34 more)

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
Cohesion: 0.11
Nodes (19): A lost phone, Administer, Back up and restore, Backups and two-factor, Choosing a mode, Contents, How it works, Provisioned Mode (+11 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (73): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+65 more)

### Community 66 - "managed.test.ts"
Cohesion: 0.08
Nodes (26): ManagedPanelDeps, QueueFixture, Gateway, LOGIN_PATHS, Page, PagesDeps, connection(), DEMO_ACCOUNTS (+18 more)

### Community 67 - "queue-source.ts"
Cohesion: 0.07
Nodes (24): ProvisionedConnectionCard, ProvisionedTarget, State, canOperate(), Access, accessKey(), filterPages(), permitsQueue() (+16 more)

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
Nodes (35): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), listQueues(), listVpns(), MockQueue (+27 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "relay_test.go"
Cohesion: 0.14
Nodes (23): errReader, fakeBroker, isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers() (+15 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "samples.test.ts"
Cohesion: 0.12
Nodes (29): getQueue(), attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), contentFileName(), PayloadFileSource (+21 more)

### Community 78 - "log/slog.Logger"
Cohesion: 0.04
Nodes (37): setForwarded(), adminHandler, newDialer(), smfPathFor(), dialer, dialRequest, dialResponse, hostedHandler (+29 more)

### Community 79 - "service-verify.ts"
Cohesion: 0.11
Nodes (28): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob() (+20 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DEST_TARGET_LOCKED_TITLE (+34 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "fileConfigFromConfig"
Cohesion: 0.14
Nodes (15): fileConfigFromConfig(), levelName(), onFailureOrDefault(), prefixStrings(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestLevelName(), logStartup(), modeName() (+7 more)

### Community 86 - "testing.T"
Cohesion: 0.08
Nodes (56): newBackupKey(), openBackup(), backupFixtureFrom(), envelope(), newBackupFixture(), reseal(), sampleBackup(), sealed() (+48 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "utils.ts"
Cohesion: 0.07
Nodes (43): clientUsernameError(), clientUsernameOk(), escapeHtml(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec() (+35 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "configfile_test.go"
Cohesion: 0.26
Nodes (21): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+13 more)

### Community 91 - "configfile.go"
Cohesion: 0.11
Nodes (22): config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog(), removedInUse() (+14 more)

### Community 92 - "Kernel.installModule"
Cohesion: 0.20
Nodes (7): createService (subscription-explorer), fetchAllSubscriptions, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), primarySempContextFrom

### Community 93 - "ui-modal.ts"
Cohesion: 0.13
Nodes (20): SolacePublisher, CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget, QueueCopyState, resetTransientState() (+12 more)

### Community 94 - "session.ts"
Cohesion: 0.07
Nodes (31): createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, SessionEventCode, browserError() (+23 more)

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
Cohesion: 0.15
Nodes (14): flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), fileAccess, fileAudit, fileConfig, fileTLS (+6 more)

### Community 100 - "smf_test.go"
Cohesion: 0.11
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "defaultFileConfig"
Cohesion: 0.20
Nodes (15): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), checkAuditOnFailure(), defaultFileConfig(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated() (+7 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.13
Nodes (23): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+15 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 111 - "defaultConfig"
Cohesion: 0.16
Nodes (21): seedConfigFile(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), configSource, newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), defaultConfig() (+13 more)

### Community 112 - "settings.ts"
Cohesion: 0.13
Nodes (23): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+15 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "ManagedResult"
Cohesion: 0.05
Nodes (31): Audit trail, AccessLevel, ManagedResult, ManagedService, ConnMgmtService, connPath(), createConnMgmtService(), ManagedConnRecord (+23 more)

### Community 119 - "tlsManager"
Cohesion: 0.18
Nodes (12): encodeCertificates(), parseCertificatePEM(), pemCertificates(), TestTrustFileName(), trustFileName(), warnIfExpiring(), tlsCertJSON, tlsManager (+4 more)

### Community 120 - "initDetails"
Cohesion: 0.21
Nodes (14): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, errMessage(), hexDump(), initDetails() (+6 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "storecrypt_test.go"
Cohesion: 0.14
Nodes (18): checksums, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev() (+10 more)

### Community 123 - "log/slog.Logger"
Cohesion: 0.09
Nodes (20): Demo and fake gateway suite, Go suite, How the tests are organized, Layout of tests, Type check and lint, Web suite, checkJournalName(), parseTxn() (+12 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "rbac.ts"
Cohesion: 0.15
Nodes (19): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, explainAccess() (+11 more)

### Community 127 - "main_test.go"
Cohesion: 0.16
Nodes (23): boolEnv(), envOr(), loadConfig(), newRootHandler(), parseLogLevel(), parseStrictBool(), route(), stubHandler() (+15 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (81): Circular Dependency Resolution, Laying out an admin page, solaceErrorText(), icons, MAX_BROWSER_BINDINGS, MAX_STORED_BYTES_PER_QUEUE, showPayload(), log (+73 more)

### Community 132 - "net.Conn"
Cohesion: 0.12
Nodes (11): Security model, What it does not enforce, What the gateway enforces, acceptWatch, deadHijacker, main(), printVersionIfRequested(), serve() (+3 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (36): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+28 more)

### Community 139 - "serveUntilStopped"
Cohesion: 0.10
Nodes (15): certHolder, serveUntilStopped(), dialUpstreamTLS(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), standardRoots, newCertHolder(), newTLSManager() (+7 more)

### Community 140 - "decodeConfigFile"
Cohesion: 0.21
Nodes (13): configVerifier(), decodeConfigFile(), encodeConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten(), TestDecodeConfigFile_TwoFactorDefaultsAndIsWritten() (+5 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.07
Nodes (36): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+28 more)

### Community 148 - "go_pkg_strings"
Cohesion: 0.07
Nodes (49): Gateway contract cases, clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine() (+41 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (54): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation(), flexStr, importInvalidError (+46 more)

### Community 155 - "quietLogger"
Cohesion: 0.21
Nodes (19): newUpstreamTransport(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip(), TestReverseProxy_NeverForwardsTheSessionCookie(), TestReverseProxy_UpstreamCannotSetTheSessionCookie(), TestReverseProxy_UpstreamDown_502(), recoverTLSPair() (+11 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "createManagedPanel"
Cohesion: 0.25
Nodes (19): createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), connectSolace(), doConnect(), doLogout() (+11 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 161 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "run"
Cohesion: 0.18
Nodes (17): playwright-core, abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets() (+9 more)

### Community 163 - "Testing"
Cohesion: 0.14
Nodes (14): Build internals, Broker details, Contents, Coverage policy, End-to-end run, Requirements, Running the tests, Testing (+6 more)

### Community 164 - "restartServe"
Cohesion: 0.27
Nodes (8): noRedirects(), postTo(), restartServe(), sessionFromResponse(), signInBootstrapAdmin(), TestServe_RestartDrainsRequestsInFlightThenCallsTheHookOnce(), TestServe_RestartWhoseDrainOverrunsClosesWhatIsLeftAndRestarts(), TestServe_RestartWhoseHookFailsLogsWhyAndReturnsTheError()

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 167 - "wireUiEvents"
Cohesion: 0.36
Nodes (10): wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability(), renderDestMode() (+2 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "reverseProxy (transparent upstream)"
Cohesion: 0.29
Nodes (6): gateway config struct + loadConfig, root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value

### Community 171 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 172 - "End-to-end run"
Cohesion: 0.25
Nodes (8): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks, restart()

### Community 173 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 174 - "settings_test.go"
Cohesion: 0.08
Nodes (57): assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect(), logLine(), rawExchange() (+49 more)

### Community 176 - "Setup"
Cohesion: 0.40
Nodes (5): Build commands, Build-time feature flags, Building variants, Maintaining dependencies, Setup

### Community 177 - "provisioned-connection/index.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 179 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

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

### Community 185 - "expectLogged"
Cohesion: 0.42
Nodes (16): expectLogged(), gatewayClient(), gatewayDir(), startServe(), TestServe_AnOldConfigWithTLSPathKeysStartsAndWarnsOnce(), TestServe_FailuresStopTheStart(), TestServe_FilesOnlyRefusesTheRelay(), TestServe_GatewayModeStartsAndShutsDownOnASignal() (+8 more)

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
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `backup.go`, `store`, `defaultFileConfig`, `net/http.ResponseWriter`, `go_pkg_strings`, `showToast`, `storecrypt_test.go`, `newManagedEnv`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Are the 125 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 125 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `writeFile` be split into smaller, more focused modules?**
  _Cohesion score 0.0763963963963964 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `showToast` to `writer_test.go`, `backup/module.ts`, `user-management/module.ts`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 84 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._