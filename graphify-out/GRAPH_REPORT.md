# Graph Report - smu-dirty  (2026-11-18)

## Corpus Check
- 364 files · ~730,722 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5249 nodes · 17151 edges · 187 communities (147 shown, 40 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2340 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e5603c13`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- .saveUser
- provisioned-connect.ts
- backup_api.go
- gateway/index.ts
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- storecrypt_test.go
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- openBackup
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- ManagedProfileStore
- managed-api.ts
- pages_test.go
- completeContext
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- broker/store.ts
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- backup.go
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- tlsManager
- net/http.ResponseWriter
- time.Time
- tls.ts
- newCapturingLogger
- createManagedPanel
- ui.selectMessage
- quietLogger
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- trustHolder
- contract.test.ts
- gateway/types.ts
- tests variants
- user-management/module.test.ts
- createUiEvents
- Developer Guide
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- Writing tests
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- collectDetails
- session
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- dial.go
- Administration (`/solAdmin`)
- connection-management/service.ts
- .ServeHTTP
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- keyfile_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Audit trail
- Queue Browser Internal Architecture
- rbac.ts
- CSS Organization
- Writing to the store
- configfile_test.go
- ProvisionedConnectionCard
- Setup
- Direct demo (`demo.html`)
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- initDetails
- Two-factor sign-in
- ui-modal.test.ts
- Deployment Options
- fixtures.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- tls_api.go
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- row-list/index.ts
- parseSetCookie
- tls-certificates/service.test.ts
- createPages
- managed-panel.ts
- tlsWriteError
- ManagedDialer
- auditMissing
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- clientGoneError
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- queue-copy/module.ts
- backup_api_test.go
- writeFailedError
- connections/module.ts
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- restart.go
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- .serveIndex
- vite-build.mjs
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- tls_test.go
- testing.T
- User Guide
- Security model
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- main
- sealer
- Certificates from the console
- csp.mjs
- settings_test.go
- crypto/tls.Certificate
- provisioned-connection/index.ts
- tls_test.go
- Configure
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- compose.ts
- verifyViaSempV1
- ManagedPanel
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- issueCert

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 180 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 100 edges
4. `store` - 96 edges
5. `managedHandler` - 69 edges
6. `AppContext` - 69 edges
7. `writeFile()` - 65 edges
8. `loadModuleDOM()` - 64 edges
9. `runChecks()` - 61 edges
10. `completeContext()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts
- `Defensive-guard tests` --references--> `required()`  [INFERRED]
  docs/testing.md → src/core/dom.ts
- `Web suite` --references--> `EventBus`  [INFERRED]
  docs/testing.md → src/core/types.ts
- `AppContext (Dependency Injection)` --references--> `AppContext`  [INFERRED]
  docs/developer-guide.md → src/core/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kernel module installation pipeline** — src_core_kernel_start, src_core_kernel_installmodule, src_core_types_appcontext, src_core_types_pwamodule, src_core_types_registeredmodule [EXTRACTED 0.95]
- **Dual-path queue verification (SEMP vs QueueBrowser fallback)** — queue_copy_verifySource, queue_copy_verifyViaSempV1, queue_copy_verifyViaQueueBrowserAccumulate, queue_copy_normalizeAccessType [EXTRACTED 0.95]
- **SEMP path-only fetch pattern (URL assembled by closure)** — src_core_services_semp_client_createservicesemp, src_core_kernel_sempfetch, src_core_connections_types_sempcontext, src_core_services_semp_discovery_extractnextpath [EXTRACTED 0.95]
- **Containerised gateway: distroless image + named volume + proxy paths** — readme_containerGateway, dockercompose_doc, deploymentdoc_scratchDistroless, deploymentdoc_proxyPathScheme, deploymentdoc_selfSignedCert [EXTRACTED 1.00]
- **Two independent broker connections (Solace client + SEMP REST) sharing one host** — readme_dualConnection, connhtml_brokerHost, connmoduletest_bridgingHooks [INFERRED 0.85]
- **Path-only fetch closure invariant (broker-direct URLs cannot reach the wire)** — sempclienttest_pathOnlyClosure, sempdiscoverytest_nextPageUriStripping, kerneltest_hostedSempFetch, deploymentdoc_proxyPathScheme [INFERRED 0.95]

## Communities (187 total, 40 thin omitted)

### Community 0 - ".saveUser"
Cohesion: 0.30
Nodes (4): checkRev(), countAdmins(), TestStore_PersistErrorLeavesMemoryUnchanged(), txn

### Community 1 - "provisioned-connect.ts"
Cohesion: 0.19
Nodes (15): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+7 more)

### Community 2 - "backup_api.go"
Cohesion: 0.12
Nodes (18): diffByName(), mergeByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo (+10 more)

### Community 3 - "gateway/index.ts"
Cohesion: 0.04
Nodes (82): Restart gateway, The checks, clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery() (+74 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.07
Nodes (39): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), backupFixtureFrom(), newBackupFixture() (+31 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 10 - "storecrypt_test.go"
Cohesion: 0.17
Nodes (17): checksumRev(), newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev() (+9 more)

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

### Community 16 - "openBackup"
Cohesion: 0.09
Nodes (45): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+37 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.12
Nodes (33): TestSettings_TheCallerIsCheckedAgainWhenTheLockIsHeld(), TestStageSettings_RefusalsComeBackAsErrors(), wfix, classifyStoreError(), newStale(), newStaleBasis(), newWFix(), recoverValue() (+25 more)

### Community 19 - "ManagedResult"
Cohesion: 0.20
Nodes (4): ManagedResult, ManagedService, ConnMgmtService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (89): Adding a New Module, DOM Access, Laying out an admin page, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE (+81 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (83): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+75 more)

### Community 26 - "completeContext"
Cohesion: 0.05
Nodes (66): createEventBus(), createManagedProfile(), createManagedService(), AdminLoginModule, BackupModule, ConnectionManagementModule, NO_VPNS, makeCtx() (+58 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (43): basic(), bcheck(), bindInQueueBrowser(), bindQueue(), broker, brokerSecrets, check(), closers (+35 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (50): RFC-5280, RFC-6238, aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString(), BROKER_FIELDS (+42 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "broker/store.ts"
Cohesion: 0.04
Nodes (106): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES (+98 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (61): diffLines(), formatUtc(), MAX_IMPORT_BYTES, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement() (+53 more)

### Community 32 - "backup.ts"
Cohesion: 0.04
Nodes (134): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+126 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.09
Nodes (30): QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+22 more)

### Community 34 - "backup.go"
Cohesion: 0.07
Nodes (16): auditCategory, changedOnDiskError, clientCtxKey, refusalError, parseRelayPath(), safeSegment(), relayPath, resolvedClient (+8 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.05
Nodes (43): AppContext (Dependency Injection), Circular Dependency Resolution, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, createService (subscription-explorer), fetchAllSubscriptions (+35 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (57): hostedInfo, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie() (+49 more)

### Community 39 - "contract_test.go"
Cohesion: 0.10
Nodes (27): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+19 more)

### Community 40 - "tlsManager"
Cohesion: 0.14
Nodes (14): parseCertificatePEM(), pemCertificates(), readableName(), equalCertJSON(), TestReadableName(), TestTrustFileName(), trustFileName(), trustListedName() (+6 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.11
Nodes (20): auditCall, auditWriter, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+12 more)

### Community 42 - "time.Time"
Cohesion: 0.10
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientWatch, newRateWindow(), failures (+16 more)

### Community 43 - "tls.ts"
Cohesion: 0.08
Nodes (35): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+27 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.26
Nodes (19): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), TestRecoverPanics_LetsAbortHandlerThrough(), newCapturingLogger(), loadStore(), bootstrapFixture(), envOf(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange() (+11 more)

### Community 45 - "createManagedPanel"
Cohesion: 0.25
Nodes (19): createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), connectSolace(), doConnect(), doLogout() (+11 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "quietLogger"
Cohesion: 0.06
Nodes (97): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+89 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (54): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+46 more)

### Community 49 - "authPages"
Cohesion: 0.09
Nodes (34): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+26 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 52 - "trustHolder"
Cohesion: 0.12
Nodes (22): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+14 more)

### Community 53 - "contract.test.ts"
Cohesion: 0.07
Nodes (28): MANAGED_ERROR_CODES, UpstreamAnswer, CLIENT_SCHEMES, SEMP_SCHEMES, ALL, bundleSources(), productSources(), REPO_ROOT (+20 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.04
Nodes (55): TwoFactorState, DialResponse, ManagedConnection, ManagedProfile, ManagedVpn, QGlob, TwoFactorMode, BackupDoc (+47 more)

### Community 56 - "user-management/module.test.ts"
Cohesion: 0.16
Nodes (15): ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden(), listed(), rowCount() (+7 more)

### Community 57 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 58 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 59 - "Testing"
Cohesion: 0.12
Nodes (17): Broker details, Contents, Coverage policy, Demo and fake gateway suite, End-to-end run, Go suite, How the tests are organized, Requirements (+9 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Writing tests"
Cohesion: 0.18
Nodes (10): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+2 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.08
Nodes (79): brokerTarget, savedUser, TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(), entitledVPNs(), currentConn(), currentUser(), enrolViewer() (+71 more)

### Community 66 - "collectDetails"
Cohesion: 0.20
Nodes (10): aliasLookup(), askLine(), askSecret(), checkedAlias(), collectDetails(), detailsFileText(), hostAliasProblem(), parseDetailsFile() (+2 more)

### Community 67 - "session"
Cohesion: 0.21
Nodes (10): activeTicket, session, setSigninCookie(), TestSessionOf_ContextRoundTrip(), TestSigninCookie_Attributes(), withSession(), sessionCtxKey, sessions (+2 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (28): Changing the TLS files, Gateway and Admin How-tos, Gateway contract cases, apiError, auditPre, bodyRev, clientJSON, clientSeenJSON (+20 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "file-kind.ts"
Cohesion: 0.07
Nodes (47): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+39 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "dial.go"
Cohesion: 0.25
Nodes (4): smfPathFor(), dialRequest, dialResponse, secret

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 78 - ".ServeHTTP"
Cohesion: 0.17
Nodes (8): openSocket, isWebSocketUpgrade(), newSMFGate(), parseSMFPath(), sameOriginSocket(), smfGate, smfPath, socketRegistry

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "keyfile_test.go"
Cohesion: 0.31
Nodes (12): createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+4 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.25
Nodes (8): Contents, Demo accounts, Demo controls, Demos, How it differs from a real gateway, Provisioned demo (`provisioned-demo.html`), The demo brokers, Trying two-factor sign-in

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "rbac.ts"
Cohesion: 0.05
Nodes (59): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, AccessLevel, ALWAYS_VISIBLE (+51 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "Writing to the store"
Cohesion: 0.18
Nodes (12): Writing to the store, checksums, fileSum, connToOutput(), userToOutput(), orTLS(), sameConnView(), sameUserView() (+4 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (87): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), checkAuditOnFailure(), flattenSettings(), TestBackup_SettingsChangesNamesDottedKeys(), config, boolEnv(), checkRenamedEnv() (+79 more)

### Community 93 - "Setup"
Cohesion: 0.29
Nodes (7): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, up()

### Community 94 - "Direct demo (`demo.html`)"
Cohesion: 0.33
Nodes (6): Connecting, Demo controls, Direct demo (`demo.html`), Opening the demo, The demo topology, What is not in the demo

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+63 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.11
Nodes (30): groupSecret(), need(), newTOTPGuard(), newTOTPSecret(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestGroupSecret() (+22 more)

### Community 100 - "smf_test.go"
Cohesion: 0.06
Nodes (45): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, TestRecordingResponseWriter_HijackWithoutSupport(), isShowRPC(), answerJSON() (+37 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "initDetails"
Cohesion: 0.22
Nodes (13): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, hexDump(), initDetails(), note() (+5 more)

### Community 105 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (107): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send() (+99 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "fixtures.ts"
Cohesion: 0.05
Nodes (70): listQueues(), listVpns(), brokerVpns(), delay(), Fault, MOCK_HOST, QUEUE_STATE, QueueFixture (+62 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.06
Nodes (37): clientACL(), withClient(), openAuditor(), auditEntry, auditor, configSource, newDialer(), dialer (+29 more)

### Community 112 - "tls_api.go"
Cohesion: 0.33
Nodes (5): clip(), TestClip(), tlsCertAnswerJSON, tlsPairJSON, tlsTrustAddJSON

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.07
Nodes (24): ConnectionsModule, account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed() (+16 more)

### Community 118 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 119 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 120 - "tls-certificates/service.test.ts"
Cohesion: 0.60
Nodes (4): answer(), CERT, fetchMock(), sent()

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "managed-panel.ts"
Cohesion: 0.05
Nodes (63): SempConfig, SempContext, buildBrokerUrl(), managedErrorMessage(), createServiceSemp(), connect(), log, SempClient (+55 more)

### Community 125 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 127 - "tls_api_test.go"
Cohesion: 0.22
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+14 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (93): Event Handling, Integration tests, vitest, DEFAULT_MAX_MESSAGES_PER_QUEUE, AppContext, AppState, BusEvents, EventBus (+85 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (46): ProvisionedTarget, formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements() (+38 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (34): decodeTo(), expectInvalid(), expectRev(), managedEnv, jsonBody(), scheduleBody(), staleBasis(), TestBackupAPI_ActionsAreAudited() (+26 more)

### Community 140 - "connections/module.ts"
Cohesion: 0.03
Nodes (79): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+71 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.05
Nodes (74): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+66 more)

### Community 148 - "restart.go"
Cohesion: 0.50
Nodes (3): restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), restartJSON

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (51): connName(), sessionEnders(), userName(), clientRec, checkModuleIDs(), connRec, connsDoc, newContractEnv() (+43 more)

### Community 155 - ".serveIndex"
Cohesion: 0.25
Nodes (3): adminHandler, setAppPageHeaders(), recordingResponseWriter

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.25
Nodes (13): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readVariant(), stripComments() (+5 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "tls_test.go"
Cohesion: 0.07
Nodes (30): appendPEMCerts(), browserKeyProblem(), buildTrustPool(), fileExists(), loadOrGenerateServerCert(), parseKeyPEM(), probeWritable(), TestAppendPEMCerts_CountsCertsSkipsNonCert() (+22 more)

### Community 164 - "testing.T"
Cohesion: 0.04
Nodes (68): levelName(), TestLevelName(), TestSeedConfigFile_GoesThroughTheJournal(), dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn() (+60 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 167 - "Security model"
Cohesion: 0.50
Nodes (3): Security model, What it does not enforce, What the gateway enforces

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "main"
Cohesion: 0.17
Nodes (16): browserOn(), COMPOSE, describeBroker(), insecure(), certFingerprint(), dnsServers(), hostRootBundle(), maskSecrets() (+8 more)

### Community 171 - "sealer"
Cohesion: 0.28
Nodes (5): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeRole

### Community 172 - "Certificates from the console"
Cohesion: 0.40
Nodes (5): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, What applies at once

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.14
Nodes (26): expectStale(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, TestSettings_AccessListThatAdmitsTheAdmin() (+18 more)

### Community 175 - "crypto/tls.Certificate"
Cohesion: 0.27
Nodes (5): certHolder, newCertHolder(), newTLSManager(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 177 - "provisioned-connection/index.ts"
Cohesion: 0.18
Nodes (11): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+3 more)

### Community 178 - "tls_test.go"
Cohesion: 0.11
Nodes (41): mustRead(), TestSettings_ASaveWithoutARevIsRefused(), TestStageSettings_AppliesOnlyWhenTheTransactionCommits(), TestStageSettings_DropsTheRemovedPathKeys(), testCertPair, testCertSpec, encodeCertificates(), formatFingerprint() (+33 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (38): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), createCookieJar() (+30 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.13
Nodes (34): acceptWatch, main(), printVersionIfRequested(), serve(), serveUntilStopped(), expectLogged(), gatewayClient(), gatewayDir() (+26 more)

### Community 190 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1247 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `Writing to the store` to `.saveUser`, `store_test.go`, `managed.go`, `backup_test.go`, `net/http.ResponseWriter`, `log/slog.Logger`, `writer_test.go`, `managed-api.ts`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backup_api.go` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `Writing to the store`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._