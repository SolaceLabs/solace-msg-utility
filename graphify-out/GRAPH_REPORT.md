# Graph Report - smu-dirty  (2026-11-23)

## Corpus Check
- 369 files · ~820,847 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: .css 26, (none) 7, .dockerignore 1)

## Summary
- 5509 nodes · 17623 edges · 199 communities (159 shown, 40 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2352 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6804ff99`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp.go
- createManagedPanel
- writeFile
- createGateway
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- audit_test.go
- rbac.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- connections/module.ts
- Git Workflow & Release Process
- modules
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
- checksums
- Filter Messages Dialog
- queue-subscription-explorer/module.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- backup.go
- tls.go
- net/http.ResponseWriter
- time.Time
- loadStore
- settings.ts
- contract.test.ts
- ui.selectMessage
- ui-modal.ts
- newFakeClock
- authPages
- tls.ts
- queue-discovery index.html
- backup/module.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- server.test.ts
- gateway/index.ts
- installDirect
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- two-factor.test.ts
- samples.test.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- runDirectChecks
- SEMP v2 Paged Discovery (core library)
- broker-hosts.test.ts
- Gateway Settings
- router.ts
- queue-copy/ui-events.ts
- service-verify.ts
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- pwaHandler
- CSS Organization
- tls_api_test.go
- configfile_test.go
- Developer Guide
- manual-to-md.mjs
- message.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- go_pkg_strings
- tls.test.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- decodeConfigFile
- dest-provisioned.test.ts
- file-kind.ts
- user-guide.mjs
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- access_test.go
- BrokerHosts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- user-management/module.test.ts
- about/module.test.ts
- configfile.go
- createPages
- keyfile_test.go
- ui-modal.test.ts
- createQueuePicker
- fileConfigFromConfig
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
- User Guide
- backup_api_test.go
- checkedAlias
- Connections
- queue-discovery module.ts
- session.ts
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
- Configure
- ref_node_path
- testing.T
- queue-discovery ui.js
- ConnectionsModule Test Suite
- .toConfig
- csp.mjs
- access-test.ts
- Queue Browser
- user-management/module.ts
- npm-audit-gate.mjs
- Provisioned connections
- solace-publisher.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- RowList
- End-to-end run
- issueCert
- settings_test.go
- connection-management/service.ts
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- setup.ts
- Code Standards
- runChecks
- tsconfig.test.json
- Certificates
- gateway-settings/module.test.ts
- User Mgmt.
- compose.ts
- Gateway and Admin How-tos
- wireUiEvents
- copy-flow.test.ts
- clientGoneError
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- writeFailedError
- user-management/service.ts
- scripts/vite-build.mjs wrapper
- TestPagePolicy_StyleBlockOrNone

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 127 edges
3. `store` - 100 edges
4. `quietLogger()` - 99 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 67 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 56 edges

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

## Communities (199 total, 40 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.12
Nodes (28): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), groupSecret(), newTOTPGuard(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestGroupSecret(), TestNeed_RuleOverEveryModeAdminAndEnrolment() (+20 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.09
Nodes (36): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+28 more)

### Community 2 - "writeFile"
Cohesion: 0.08
Nodes (72): writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint() (+64 more)

### Community 3 - "createGateway"
Cohesion: 0.15
Nodes (28): acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes(), newSecret() (+20 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.13
Nodes (29): diffByName(), mergeByName(), sameRecord(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders() (+21 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "audit_test.go"
Cohesion: 0.18
Nodes (24): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+16 more)

### Community 10 - "rbac.ts"
Cohesion: 0.07
Nodes (22): ProvisionedConnectionCard, ProvisionedTarget, State, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn() (+14 more)

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
Nodes (49): DOM Access, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), DEFAULT_LOG_LEVEL, LogLevel (+41 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.08
Nodes (42): Writing to the store, fileOfSchedule(), changedOnDiskError, importStaged, savedConn, sectionImport, TestStageSettings_RefusalsComeBackAsErrors(), staleError (+34 more)

### Community 19 - "connections/module.ts"
Cohesion: 0.03
Nodes (101): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+93 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "modules"
Cohesion: 0.25
Nodes (6): src/main.ts application bootstrap, modules, MOCK_REDIRECTS table, injectModuleTemplates plugin, serviceMockRedirect plugin, variantRedirect plugin

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "boot.managed.ts"
Cohesion: 0.08
Nodes (36): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+28 more)

### Community 24 - "errMessage"
Cohesion: 0.08
Nodes (22): TaggedLogger, showToast(), createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom() (+14 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): usersWrote(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (81): Event Handling, Integration tests, Module tests, QueuePicker, SolaceConfig, createEventBus(), createManagedProfile(), DialConn (+73 more)

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
Cohesion: 0.07
Nodes (42): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesModule, TlsCertificatesOptions (+34 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (32): BackupModule, QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+24 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "queue-subscription-explorer/module.ts"
Cohesion: 0.07
Nodes (41): createService (subscription-explorer), fetchAllSubscriptions, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), visibleQueueRows(), createSempDiscovery() (+33 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (65): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), main(), printVersionIfRequested(), serve(), serveUntilStopped(), TestPrintVersionIfRequested() (+57 more)

### Community 39 - "backup.go"
Cohesion: 0.07
Nodes (25): backupName(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+17 more)

### Community 40 - "tls.go"
Cohesion: 0.05
Nodes (28): certHolder, standardRoots, browserKeyProblem(), newCertHolder(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable() (+20 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.10
Nodes (22): Changing the TLS files, auditCall, auditWriter, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+14 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, activeTicket, bucket, clientCtxKey, failures (+16 more)

### Community 43 - "loadStore"
Cohesion: 0.13
Nodes (25): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+17 more)

### Community 44 - "settings.ts"
Cohesion: 0.13
Nodes (24): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+16 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.10
Nodes (30): connsProblem(), usersProblem(), UpstreamAnswer, range(), BROKER_RULE, brokerUsernamesProblem(), CATALOG, CLIENT_SCHEMES (+22 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "ui-modal.ts"
Cohesion: 0.14
Nodes (29): filterSempFetch(), isListedVpn(), rowField(), SempFetch, ALWAYS_VISIBLE, canOperate(), explainAccess(), findQueueRow() (+21 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (45): fakeClock, TestSweepLeftovers_ADataDirectoryThatIsAFile(), fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+37 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (36): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), TestAuditFor_ActorAndClient(), auditEntry, authPages (+28 more)

### Community 50 - "tls.ts"
Cohesion: 0.12
Nodes (37): docOf(), glob(), openBackup(), port(), totpDoc(), glob(), BadRequest, boolean() (+29 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.08
Nodes (41): describeSchedule(), diffLines(), MAX_IMPORT_BYTES, pad(), WEEKDAYS, BackupFile, BackupSchedule, BackupService (+33 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.06
Nodes (56): DEMO_CREDENTIALS, DIRECT_BANNER, DIRECT_PANEL_SEEN_KEY, fillDirectForm(), firstVisit(), PanelOptions, queueOptions(), Fault (+48 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.06
Nodes (49): AccessExplanation, QGlob, TwoFactorMode, BackupDoc, declRefused(), forward(), headerOf(), isShowRpc() (+41 more)

### Community 56 - "server.test.ts"
Cohesion: 0.12
Nodes (34): allQueues(), findQueueAnyVpn(), listQueues(), listVpns(), spoolUsage(), vpnOn(), brokerVpns(), delay() (+26 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.05
Nodes (44): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+36 more)

### Community 58 - "installDirect"
Cohesion: 0.09
Nodes (19): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, createBrokerHosts(), sempAccountError(), hosted() (+11 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.07
Nodes (56): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+48 more)

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
Cohesion: 0.11
Nodes (19): A lost phone, Administer, Back up and restore, Backups and two-factor, Choosing a mode, Contents, How it works, Provisioned Mode (+11 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (70): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn() (+62 more)

### Community 66 - "two-factor.test.ts"
Cohesion: 0.07
Nodes (47): clock(), authenticatorSection(), rebuild(), refresh(), managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+39 more)

### Community 67 - "samples.test.ts"
Cohesion: 0.12
Nodes (29): The payload samples queue, getQueue(), attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), contentFileName() (+21 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.07
Nodes (22): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, Containerised Gateway (+14 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (31): Gateway contract cases, apiError, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON (+23 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "broker-hosts.test.ts"
Cohesion: 0.20
Nodes (15): BROKER_HOSTS_TEXT, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType, button() (+7 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "router.ts"
Cohesion: 0.15
Nodes (21): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+13 more)

### Community 78 - "queue-copy/ui-events.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 79 - "service-verify.ts"
Cohesion: 0.08
Nodes (33): SolacePublisher, escapeXml(), BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, StopReason (+25 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (44): DESTINATION_SDK_CONNECT, formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements() (+36 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.10
Nodes (45): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+37 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "pwaHandler"
Cohesion: 0.18
Nodes (5): adminHandler, hostedHandler, setAppPageHeaders(), pwaHandler, recordingResponseWriter

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "tls_api_test.go"
Cohesion: 0.22
Nodes (21): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+13 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.25
Nodes (20): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+12 more)

### Community 92 - "Developer Guide"
Cohesion: 0.09
Nodes (22): A chapter, Build commands, Build-time feature flags, Building variants, Code Conventions, Contents, CSS, Developer Guide (+14 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "message.ts"
Cohesion: 0.06
Nodes (57): PAYLOAD_SAMPLES, PayloadSample, BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS, key() (+49 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.10
Nodes (77): auditLog, TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv() (+69 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "go_pkg_strings"
Cohesion: 0.04
Nodes (41): setForwarded(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), auditCategory, hostedInfo, warnLooseKeyMode(), recoverPanics() (+33 more)

### Community 100 - "tls.test.ts"
Cohesion: 0.14
Nodes (13): DEMO_SUBJECT, STANDARD_ROOTS_MISSING, START_CERTIFICATE_BYTES, CA, call(), gateway(), get(), Gw (+5 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "decodeConfigFile"
Cohesion: 0.21
Nodes (13): configVerifier(), decodeConfigFile(), encodeConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten(), TestDecodeConfigFile_TwoFactorDefaultsAndIsWritten() (+5 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.11
Nodes (27): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+19 more)

### Community 107 - "user-guide.mjs"
Cohesion: 0.31
Nodes (6): GUIDE_FILE, GUIDE_LAYOUT, guideMarkdown(), headings(), slugger(), userGuide()

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.11
Nodes (26): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+18 more)

### Community 111 - "access_test.go"
Cohesion: 0.08
Nodes (54): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+46 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.09
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "user-management/module.test.ts"
Cohesion: 0.13
Nodes (18): NO_OPERATE, NO_READ_ONLY, UserManagementModule, ADMIN, answerSignOut(), CHOICES, clickRow(), el() (+10 more)

### Community 119 - "about/module.test.ts"
Cohesion: 0.12
Nodes (17): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+9 more)

### Community 120 - "configfile.go"
Cohesion: 0.12
Nodes (22): flattenSettings(), boolEnv(), checkModuleIDs(), checkRenamedEnv(), envOverrides(), moduleCatalog(), removedInUse(), configLoad (+14 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "keyfile_test.go"
Cohesion: 0.44
Nodes (9): existingStore(), loadStoreKey(), keyDir(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey(), TestLoadStoreKey_RefusesAMissingKeyBesideAStore() (+1 more)

### Community 123 - "ui-modal.test.ts"
Cohesion: 0.17
Nodes (15): ACCUMULATE_IDLE_MS, createInitialState(), cancelCopyModal(), SourceAccess, run(), provisionedSecondary(), DIRECT, mAccess() (+7 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "fileConfigFromConfig"
Cohesion: 0.10
Nodes (18): config, fileConfigFromConfig(), intInRange(), levelName(), onFailureOrDefault(), prefixStrings(), TestLevelName(), logStartup() (+10 more)

### Community 127 - "main_test.go"
Cohesion: 0.10
Nodes (47): acceptWatch, TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal(), envOr(), loadConfig(), newRootHandler(), expectLogged(), gatewayClient(), gatewayDir() (+39 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (84): Circular Dependency Resolution, Laying out an admin page, vitest, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow (+76 more)

### Community 132 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "User Guide"
Cohesion: 0.10
Nodes (21): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+13 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.12
Nodes (41): Build internals, Broker details, decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody() (+33 more)

### Community 139 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "session.ts"
Cohesion: 0.07
Nodes (29): createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, SessionEventCode, browserError() (+21 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.05
Nodes (33): openAuditor(), auditor, configSource, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest (+25 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (59): connName(), sessionEnders(), userName(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv() (+51 more)

### Community 155 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 156 - "ref_node_path"
Cohesion: 0.10
Nodes (15): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+7 more)

### Community 157 - "testing.T"
Cohesion: 0.05
Nodes (56): Security model, What it does not enforce, What the gateway enforces, deadHijacker, dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive() (+48 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - ".toConfig"
Cohesion: 0.26
Nodes (12): Writing a config.yaml by hand (development only), checkAuditOnFailure(), defaultFileConfig(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated(), TestToConfig_BoundsNameTheOtherKey(), TestToConfig_CrossCheckAndConversion() (+4 more)

### Community 161 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "access-test.ts"
Cohesion: 0.15
Nodes (15): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+7 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "user-management/module.ts"
Cohesion: 0.04
Nodes (73): Adding a New Module, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog() (+65 more)

### Community 165 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 167 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (13): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS, DestTarget (+5 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 172 - "End-to-end run"
Cohesion: 0.17
Nodes (12): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, End-to-end run, Requirements (+4 more)

### Community 173 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 174 - "settings_test.go"
Cohesion: 0.09
Nodes (58): seedConfigFile(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), assertNoTempFiles(), logLine(), rawExchange(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline() (+50 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

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

### Community 180 - "setup.ts"
Cohesion: 0.10
Nodes (24): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM (+16 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (42): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+34 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 185 - "gateway-settings/module.test.ts"
Cohesion: 0.08
Nodes (29): ManagedSession, ConnectionManagementModule, NO_VPNS, GatewaySettingsModule, GatewaySettingsOptions, ADMIN, CONNS, el() (+21 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "Gateway and Admin How-tos"
Cohesion: 0.20
Nodes (10): Adding a gateway config.yaml setting, Auditing an action, Gateway and Admin How-tos, defaultSecretPaths(), removedTLSPaths(), TestRemovedTLSPaths_AgreeingKeysAreSilent(), tlsPathsFromEnv(), secretPaths (+2 more)

### Community 189 - "wireUiEvents"
Cohesion: 0.38
Nodes (10): syncDestFormFromSnapshot(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability() (+2 more)

### Community 190 - "copy-flow.test.ts"
Cohesion: 0.50
Nodes (3): payloads(), sempCtx, spooled()

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 194 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 196 - "user-management/service.ts"
Cohesion: 0.36
Nodes (5): createUserMgmtService(), UserList, userPath(), UserPayload, PAYLOAD

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1388 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `checksums`, `user-management/module.ts`, `managed.go`, `net/http.ResponseWriter`, `log/slog.Logger`, `store`, `Gateway and Admin How-tos`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp.go` be split into smaller, more focused modules?**
  _Cohesion score 0.11561561561561562 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `user-management/module.ts` to `errMessage`, `writer_test.go`, `backup/module.ts`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._