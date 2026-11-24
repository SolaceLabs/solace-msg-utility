# Graph Report - smu-dirty  (2026-11-24)

## Corpus Check
- 371 files · ~826,449 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5543 nodes · 17719 edges · 206 communities (170 shown, 36 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2359 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c8e2baff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- totp.go
- createManagedPanel
- writeFile
- two-factor.test.ts
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- .ServeHTTP
- rbac.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- queue-copy/module.ts
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- panel.ts
- storecrypt_test.go
- pages_test.go
- boot.managed.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- Kernel.installModule
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- checksums
- Filter Messages Dialog
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- quietLogger
- backup_test.go
- tls.go
- net/http.ResponseWriter
- time.Time
- loadStore
- quietLogger
- router.ts
- ui.selectMessage
- .checkSettings
- newFakeClock
- authPages
- defaultConfig
- queue-discovery index.html
- ui-modal.test.ts
- vitest
- gateway/store.ts
- tests variants
- relay_test.go
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
- request
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
- trustHolder
- service-verify.ts
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- recordingResponseWriter
- CSS Organization
- tls_api_test.go
- solace-publisher.ts
- Developer Guide
- manual-to-md.mjs
- broker/store.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- writer
- session
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- ui-modal.test.ts
- dest-provisioned.test.ts
- file-kind.ts
- Two-factor sign-in
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- provisioned-connection/index.ts
- net.Conn
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- managed-api.ts
- about/module.test.ts
- configfile.go
- createPages
- state.ts
- go_pkg_strings
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
- fileutil.go
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
- fixtures.ts
- smf_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- gateway-settings/module.test.ts
- Changing the TLS files
- logStartup
- Queue Browser
- backup/module.ts
- End-to-end run
- Provisioned connections
- csp.mjs
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- connection-management/module.ts
- errMessage
- Testing
- settings_test.go
- defaultConfig
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- .toConfig
- Code Standards
- runChecks
- tsconfig.test.json
- Certificates
- main.go
- User Mgmt.
- compose.ts
- settingsFile
- wireUiEvents
- dial.go
- socketRegistry
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- Writing tests
- issueCert
- user-guide.mjs
- restart.go
- Configure
- optional-field.test.ts
- parseSetCookie
- queue-copy/service.ts
- qrSVG
- createConnTabs
- writeFailedError

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 128 edges
3. `store` - 100 edges
4. `quietLogger()` - 100 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 68 edges
9. `runChecks()` - 63 edges
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

## Communities (206 total, 36 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.15
Nodes (21): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), groupSecret(), newTOTPGuard(), loadTOTPVectors(), TestGroupSecret(), TestNeed_RuleOverEveryModeAdminAndEnrolment(), TestTOTPCode_RefusesASecretThatIsNotBase32(), TestTOTPCode_RFC6238Vectors() (+13 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.09
Nodes (36): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+28 more)

### Community 2 - "writeFile"
Cohesion: 0.08
Nodes (68): go-web-proxy main (gateway entrypoint), writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists() (+60 more)

### Community 3 - "two-factor.test.ts"
Cohesion: 0.27
Nodes (9): clock(), badCode(), codeNow(), enrol(), enrolled(), PW, setMode(), signedInEnrolled() (+1 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.13
Nodes (18): diffByName(), mergeByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo (+10 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - ".ServeHTTP"
Cohesion: 0.16
Nodes (10): setForwarded(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline(), writeError(), writeRateLimited(), withSession(), isWebSocketUpgrade(), parseSMFPath() (+2 more)

### Community 10 - "rbac.ts"
Cohesion: 0.04
Nodes (73): pickQueue() reusable picker, PickerCache, PickQueueOptions, PickQueueResult, Refs, State, filterSempFetch(), isListedVpn() (+65 more)

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
Nodes (47): The Module Contract, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), DEFAULT_LOG_LEVEL, LogLevel (+39 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (34): Writing to the store, fileOfSchedule(), checkRev(), countAdmins(), txn, wfix, classifyStoreError(), newStale() (+26 more)

### Community 19 - "queue-copy/module.ts"
Cohesion: 0.04
Nodes (81): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+73 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "panel.ts"
Cohesion: 0.06
Nodes (57): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+49 more)

### Community 24 - "storecrypt_test.go"
Cohesion: 0.17
Nodes (17): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer() (+9 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (90): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+82 more)

### Community 26 - "boot.managed.ts"
Cohesion: 0.08
Nodes (30): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+22 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): playwright-core, abort(), aliasLookup(), alive(), askLine(), askSecret(), bindInQueueBrowser(), broker (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (66): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), aliasAddress(), APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED (+58 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "Kernel.installModule"
Cohesion: 0.22
Nodes (6): createService (subscription-explorer), Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), primarySempContextFrom

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (51): Adding a New Module, AdminSessionHandlers, createGate(), gateOnAdminSession(), applyGate(), GateOptions, ModuleGate, EXPIRY_WARN_DAYS (+43 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (78): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+70 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (33): BackupModule, QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES (+25 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.06
Nodes (49): CSS, createSegmented(), SegmentedOptions, clientUsernameError(), clientUsernameOk(), formatUtc(), generateUuid(), isValidHost() (+41 more)

### Community 38 - "quietLogger"
Cohesion: 0.06
Nodes (52): adminHandler, hostedInfo, gateway config struct + loadConfig, root mux (hosted/proxy/pwa routing), newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse() (+44 more)

### Community 39 - "backup_test.go"
Cohesion: 0.08
Nodes (33): monthSlot(), newBackupService(), nextRun(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem() (+25 more)

### Community 40 - "tls.go"
Cohesion: 0.07
Nodes (22): browserKeyProblem(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem(), TestProbeWritable() (+14 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (13): auditCall, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), writeInvalid(), writeJSON() (+5 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (19): clientIP(), normalizeAddr(), prefixContains(), accessConfig, backupName(), bucket, clientCtxKey, clientWatch (+11 more)

### Community 43 - "loadStore"
Cohesion: 0.12
Nodes (26): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture() (+18 more)

### Community 44 - "quietLogger"
Cohesion: 0.21
Nodes (20): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport_VerifiesThroughTheTrustHolder(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+12 more)

### Community 45 - "router.ts"
Cohesion: 0.04
Nodes (102): TwoFactorMode, connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath() (+94 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - ".checkSettings"
Cohesion: 0.29
Nodes (6): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (43): fakeClock, fixed(), newTestAuditor(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+35 more)

### Community 49 - "authPages"
Cohesion: 0.10
Nodes (28): clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient(), twoFactorEnrolMsg() (+20 more)

### Community 50 - "defaultConfig"
Cohesion: 0.10
Nodes (45): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+37 more)

### Community 52 - "ui-modal.test.ts"
Cohesion: 0.12
Nodes (24): DOM Access, Solace mock, createInitialState(), cacheElements(), tests main, makeOriginal(), stored(), connectedDest() (+16 more)

### Community 53 - "vitest"
Cohesion: 0.04
Nodes (78): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, Integration tests, Module tests, vitest (+70 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.12
Nodes (20): BackupDoc, anyMatch(), clientHost(), cloneConn(), connView(), createStore(), DeleteConnResult, DeleteUserResult (+12 more)

### Community 56 - "relay_test.go"
Cohesion: 0.13
Nodes (23): errReader, fakeBroker, rawExchange(), TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline(), isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC() (+15 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.05
Nodes (71): acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes() (+63 more)

### Community 58 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 59 - "fileutil_test.go"
Cohesion: 0.09
Nodes (44): Layout of tests, commitStep, commitJournal(), newJournal(), recoverDataDir(), syncDir(), crashAfter(), damageTemps() (+36 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Direct demo (`demo.html`)"
Cohesion: 0.22
Nodes (9): Connecting, Contents, Demo controls, Demos, Direct demo (`demo.html`), Opening the demo, The demo topology, The payload samples queue (+1 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (71): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+63 more)

### Community 66 - "audit_test.go"
Cohesion: 0.19
Nodes (23): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+15 more)

### Community 67 - "request"
Cohesion: 0.12
Nodes (31): basic(), bcheck(), bindQueue(), check(), closeOpened(), cookies, directSempPath(), drain() (+23 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.07
Nodes (22): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, Containerised Gateway (+14 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (30): auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+22 more)

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
Cohesion: 0.21
Nodes (14): partialName(), createExclusive(), existingStore(), loadStoreKey(), ownershipHint(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+6 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (19): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+11 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.08
Nodes (34): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+26 more)

### Community 78 - "trustHolder"
Cohesion: 0.16
Nodes (5): certHolder, standardRoots, newCertHolder(), trustHolder, trustState

### Community 79 - "service-verify.ts"
Cohesion: 0.14
Nodes (22): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, StopReason (+14 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceMode(), applySourceReadonly(), clearDestTypedSecrets() (+34 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.10
Nodes (40): newBackupKey(), openBackup(), sealBackup(), envelope(), reseal(), sampleBackup(), sealed(), TestBackup_ABackupWithoutTheSignInKeysReadsThemAsTheDefaults() (+32 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 91 - "solace-publisher.ts"
Cohesion: 0.14
Nodes (14): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+6 more)

### Community 92 - "Developer Guide"
Cohesion: 0.12
Nodes (16): A chapter, Code Conventions, Contents, Developer Guide, Error Handling, Figures, File Organization, Linting (+8 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.04
Nodes (108): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS (+100 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (69): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv(), raced() (+61 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "writer"
Cohesion: 0.07
Nodes (16): auditCategory, changedOnDiskError, clientGoneError, pagePolicy(), twoFactorRefusal(), parseRelayPath(), safeSegment(), relayPath (+8 more)

### Community 100 - "session"
Cohesion: 0.20
Nodes (10): activeTicket, session, clearSessionCookie(), clearSigninCookie(), setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions (+2 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "ui-modal.test.ts"
Cohesion: 0.15
Nodes (23): runCopyJob(), selectPublisher(), resetTransientState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate() (+15 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.06
Nodes (48): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+40 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.18
Nodes (21): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+13 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.10
Nodes (15): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+7 more)

### Community 112 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "managed-api.ts"
Cohesion: 0.04
Nodes (73): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, attachBackdropClose() (+65 more)

### Community 119 - "about/module.test.ts"
Cohesion: 0.12
Nodes (17): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+9 more)

### Community 120 - "configfile.go"
Cohesion: 0.12
Nodes (24): Adding a gateway config.yaml setting, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), moduleCatalog(), removedInUse(), removedTLSPaths(), TestRemovedTLSPaths_AgreeingKeysAreSilent() (+16 more)

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "state.ts"
Cohesion: 0.11
Nodes (15): ProvisionedConnectionCard, ProvisionedTarget, SolacePublisher, CopyMode, DestCredMode, DestForm, destMessagingHost(), DestPrefillSnapshot (+7 more)

### Community 123 - "go_pkg_strings"
Cohesion: 0.13
Nodes (10): TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), anyMatch(), entitled(), matchGlob(), TestEntitled(), TestRestartInPlace_ExitsWithStatusZero(), TestRestartInPlace_AFailedExecNamesTheProgramAndKeepsTheCause() (+2 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "fileConfigFromConfig"
Cohesion: 0.21
Nodes (6): fileConfigFromConfig(), intInRange(), onFailureOrDefault(), loginLimits, expired(), sessionLimits

### Community 127 - "main_test.go"
Cohesion: 0.13
Nodes (38): acceptWatch, envOr(), loadConfig(), expectLogged(), gatewayClient(), gatewayDir(), startServe(), TestEnvOr() (+30 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (86): Circular Dependency Resolution, showToast(), escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, MAX_STORED_BYTES_PER_QUEUE, showPayload() (+78 more)

### Community 132 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "User Guide"
Cohesion: 0.10
Nodes (21): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+13 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.09
Nodes (51): Demo accounts, Demo controls, How it differs from a real gateway, Provisioned demo (`provisioned-demo.html`), The demo brokers, Trying two-factor sign-in, Build commands, Build internals (+43 more)

### Community 139 - "fileutil.go"
Cohesion: 0.20
Nodes (13): checkJournalName(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers(), sweepLeftoversOf(), TestSweepLeftovers_ADataDirectoryThatIsAFile() (+5 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "configfile_test.go"
Cohesion: 0.17
Nodes (29): decodeConfigFile(), encodeConfigFile(), resolveConfig(), clearSeedEnv(), removedNames(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten() (+21 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.05
Nodes (36): openAuditor(), TestOpenAuditor_FailureIsActionable(), auditor, configSource, newDialer(), newRateWindow(), dialer, gatedWriter (+28 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (56): connName(), sessionEnders(), userName(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv() (+48 more)

### Community 155 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 156 - "fixtures.ts"
Cohesion: 0.04
Nodes (70): listQueues(), listVpns(), brokerVpns(), delay(), Fault, QueueState, resetScenario(), ScenarioState (+62 more)

### Community 157 - "smf_test.go"
Cohesion: 0.10
Nodes (32): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+24 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "gateway-settings/module.test.ts"
Cohesion: 0.22
Nodes (14): ADMIN, clickSave(), el(), errorText(), hidden(), pressed(), SETTINGS, setup() (+6 more)

### Community 161 - "Changing the TLS files"
Cohesion: 0.15
Nodes (8): Adding a sign-in step, Changing the TLS files, Gateway and Admin How-tos, Laying out an admin page, userSaveAction(), need(), totpGuard, GatewayFaults

### Community 162 - "logStartup"
Cohesion: 0.12
Nodes (17): config, envOverrides(), levelName(), prefixStrings(), TestLevelName(), configLoad, envOverride, logStartup() (+9 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "backup/module.ts"
Cohesion: 0.06
Nodes (47): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), MAX_IMPORT_BYTES (+39 more)

### Community 165 - "End-to-end run"
Cohesion: 0.17
Nodes (12): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, End-to-end run, Requirements (+4 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 167 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "connection-management/module.ts"
Cohesion: 0.07
Nodes (27): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+19 more)

### Community 172 - "errMessage"
Cohesion: 0.16
Nodes (13): TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+5 more)

### Community 173 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 174 - "settings_test.go"
Cohesion: 0.10
Nodes (48): TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), logLine(), TestWriteJSON_EncodeFailureKeepsStatus(), TestAuthPages_UnknownPathIs404(), TestPageCSP_HashesTheStyleBlockThePageCarries() (+40 more)

### Community 175 - "defaultConfig"
Cohesion: 0.21
Nodes (12): seedConfigFile(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), assertNoTempFiles(), TestLive_ApplySwapsEveryLiveKey(), TestLive_TwoFactorIsLive(), defaultConfig() (+4 more)

### Community 176 - "contract_test.go"
Cohesion: 0.10
Nodes (26): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+18 more)

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
Cohesion: 0.20
Nodes (15): Writing a config.yaml by hand (development only), TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), parseCIDRs(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated() (+7 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (33): adminSession(), configureGateway(), createScratch(), expect(), invalidProblem(), basisMoved(), certFingerprint(), createCookieJar() (+25 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 185 - "main.go"
Cohesion: 0.18
Nodes (7): boolEnv(), main(), parseStrictBool(), printVersionIfRequested(), serve(), TestPrintVersionIfRequested(), process

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "settingsFile"
Cohesion: 0.19
Nodes (8): flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), configVerifier(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), settingsFile, stagedSettings

### Community 189 - "wireUiEvents"
Cohesion: 0.33
Nodes (11): wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability(), refreshSource() (+3 more)

### Community 190 - "dial.go"
Cohesion: 0.22
Nodes (4): smfPathFor(), dialRequest, dialResponse, secret

### Community 191 - "socketRegistry"
Cohesion: 0.29
Nodes (5): openSocket, socketRegistry, newSocketRegistry(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked()

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 194 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 195 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 196 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 197 - "user-guide.mjs"
Cohesion: 0.36
Nodes (6): GUIDE_FILE, GUIDE_LAYOUT, guideMarkdown(), headings(), slugger(), userGuide()

### Community 198 - "restart.go"
Cohesion: 0.50
Nodes (3): restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), restartJSON

### Community 199 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 200 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 201 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 202 - "queue-copy/service.ts"
Cohesion: 0.60
Nodes (3): destNameProblem(), getOriginalIdHint(), RESERVED_PREFIXES

### Community 203 - "qrSVG"
Cohesion: 0.50
Nodes (3): qrSVG(), TestQRSVG_DrawsTheCodeWithItsQuietZone(), TestQRSVG_TextTooLongForACodeIsAnError()

### Community 204 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1393 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `Changing the TLS files`, `checksums`, `store_test.go`, `managed.go`, `net/http.ResponseWriter`, `log/slog.Logger`, `managed-api.ts`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createManagedPanel` be split into smaller, more focused modules?**
  _Cohesion score 0.09292929292929293 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `connection-management/module.ts`, `writer_test.go`, `vitest`, `backup/module.ts`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._