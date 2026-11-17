# Graph Report - smu-dirty  (2026-11-18)

## Corpus Check
- 363 files · ~723,603 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5230 nodes · 17086 edges · 183 communities (148 shown, 35 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2338 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a0f97c78`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- loadConfig
- createManagedPanel
- createGateway
- connections/module.test.ts
- semp-client Test Suite
- Architecture
- backupService
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- quietLogger
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- backup_test.go
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- utils.ts
- managed-api.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- broker/store.ts
- tls-certificates/module.test.ts
- backup.ts
- ui-modal.test.ts
- backup.go
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- contract_test.go
- log/slog.Logger
- net/http.ResponseWriter
- time.Time
- gateway/index.ts
- newCapturingLogger
- panel.ts
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- newUpstreamTransport
- fileConfigFromConfig
- gateway/types.ts
- tests variants
- ui-modal.ts
- routes.test.ts
- configfile_test.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- Code Standards
- createVpnSwitch
- Managed Variant (RBAC)
- store_test.go
- storecrypt_test.go
- session
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- writeError
- Administration (`/solAdmin`)
- broker/store.ts
- socketRegistry
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- defaultConfig
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- user-management/module.test.ts
- CSS Organization
- error-codes.test.ts
- configfile.go
- download.ts
- Cutting a release
- .stage
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- testing.T
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- demo-flow.test.ts
- Provisioned Mode
- state.ts
- Deployment Options
- newRootHandler
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- live
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- How the tests are organized
- parseSetCookie
- MockEmitter
- createPages
- semp-client.ts
- backup_test.go
- Developer Guide
- auditMissing
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
- System Overview
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- queue-copy/module.ts
- backup_api_test.go
- SEMP v1 Pagination (Queue Subscription Explorer)
- connections/module.ts
- queue-discovery module.ts
- boot.managed.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- solace-publisher.ts
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
- syncBuffer
- connection-management/service.ts
- .checkSettings
- User Guide
- verifyViaSempV1
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- main
- Writing tests
- Audit trail
- csp.mjs
- settings_test.go
- queue-copy/ui-events.ts
- tls_test.go
- service-verify.ts
- Configure
- runChecks
- tsconfig.test.json
- main_test.go
- compose.ts
- entitled
- Two-factor sign-in
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
- `Test DOM` --references--> `readModuleTemplate()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
- `Linting` --references--> `confirmDialog()`  [INFERRED]
  docs/developer-guide.md → src/core/components/confirm-dialog/index.ts
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

## Communities (183 total, 35 thin omitted)

### Community 0 - "loadConfig"
Cohesion: 0.08
Nodes (26): hostedEnv(), insecureEnv(), levelName(), showAuditEnv(), TestLevelName(), logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel() (+18 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.08
Nodes (42): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, ConnectOutcome, ConnectPart (+34 more)

### Community 2 - "createGateway"
Cohesion: 0.10
Nodes (38): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+30 more)

### Community 3 - "connections/module.test.ts"
Cohesion: 0.10
Nodes (12): ConnectionConfig, ConnectionCredentials, TaggedLogger, config, SWITCH_CONNECT_TIMEOUT_MS, SWITCH_DISCONNECT_TIMEOUT_MS, VpnSwitch, createConnectionsDOM() (+4 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backupService"
Cohesion: 0.09
Nodes (21): backupName(), newBackupService(), partialName(), backupRun, backupService, createExclusive(), existingStore(), loadStoreKey() (+13 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+18 more)

### Community 10 - "quietLogger"
Cohesion: 0.11
Nodes (54): adminHandler, fakeClock, fixed(), newTestAuditor(), newAdminHandler(), TestAdminHandler_DisabledIs404(), TestAdminHandler_DoesNotFallBackToTheSPA(), TestAdminHandler_EnabledButNotDeployed() (+46 more)

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

### Community 16 - "backup_test.go"
Cohesion: 0.11
Nodes (32): fileOfSchedule(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleDocYAML(), TestBackup_ScheduleProblem(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual() (+24 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (33): changeUsersBehindTheWriter(), checkRev(), countAdmins(), txn, wfix, classifyStoreError(), newStaleBasis(), newWFix() (+25 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.09
Nodes (12): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+4 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "utils.ts"
Cohesion: 0.09
Nodes (30): formatBytes(), generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains() (+22 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (96): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, createGate() (+88 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (85): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+77 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (78): AppContext (Dependency Injection), Factory Pattern, Key Concepts, Module tests, createService (subscription-explorer), fetchAllSubscriptions, SempContext, createEventBus() (+70 more)

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
Cohesion: 0.05
Nodes (87): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key(), listQueues() (+79 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.07
Nodes (41): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList(), TlsCertificatesModule (+33 more)

### Community 32 - "backup.ts"
Cohesion: 0.03
Nodes (142): BackupDeps, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser() (+134 more)

### Community 33 - "ui-modal.test.ts"
Cohesion: 0.15
Nodes (24): ManagedSession, createInitialState(), resetTransientState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate() (+16 more)

### Community 34 - "backup.go"
Cohesion: 0.04
Nodes (41): diffByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo, backupRunJSON, backupScheduleJSON (+33 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.04
Nodes (54): Event Handling, EventBus (Cross-Module Communication), The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR (+46 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (81): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+73 more)

### Community 39 - "contract_test.go"
Cohesion: 0.15
Nodes (21): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), decodeAny(), managedEnv, loadContractSeed() (+13 more)

### Community 40 - "log/slog.Logger"
Cohesion: 0.06
Nodes (27): certHolder, browserKeyProblem(), newCertHolder(), newTLSManager(), newTrustHolder(), parseCertificatePEM(), parseKeyPEM(), pemCertificates() (+19 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (16): Changing the TLS files, auditCall, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), userSaveAction() (+8 more)

### Community 42 - "time.Time"
Cohesion: 0.11
Nodes (22): clientIP(), normalizeAddr(), prefixContains(), accessConfig, monthSlot(), nextRun(), TestBackup_NextRun(), backupSchedule (+14 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.04
Nodes (66): BACKUP_ITER, BackupsState, EnrolResult, GatewaySnapshot, PageResult, responseHeaders(), SignInResult, toResponse() (+58 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.11
Nodes (30): mustSealer(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture() (+22 more)

### Community 45 - "panel.ts"
Cohesion: 0.08
Nodes (49): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+41 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.12
Nodes (26): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+18 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (53): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+45 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (37): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+29 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.05
Nodes (49): pickQueue() reusable picker, applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+41 more)

### Community 52 - "newUpstreamTransport"
Cohesion: 0.14
Nodes (17): dialUpstreamTLS(), dropSessionCookie(), dropSessionSetCookie(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestDropSessionCookie() (+9 more)

### Community 53 - "fileConfigFromConfig"
Cohesion: 0.15
Nodes (20): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), checkAuditOnFailure(), defaultFileConfig(), fileConfigFromConfig(), onFailureOrDefault(), prefixStrings() (+12 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.04
Nodes (57): TwoFactorMode, BackupDoc, declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+49 more)

### Community 56 - "ui-modal.ts"
Cohesion: 0.16
Nodes (19): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), ALWAYS_VISIBLE, canOperate(), explainAccess() (+11 more)

### Community 57 - "routes.test.ts"
Cohesion: 0.08
Nodes (31): delay(), DEMO_GATEWAY_MARKER, RESTART_PAUSE_MS, handleSemp(), hostedResponse(), installMockServer(), json(), MockRoute (+23 more)

### Community 58 - "configfile_test.go"
Cohesion: 0.16
Nodes (33): decodeConfigFile(), encodeConfigFile(), resolveConfig(), clearSeedEnv(), removedNames(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten() (+25 more)

### Community 59 - "Testing"
Cohesion: 0.15
Nodes (13): Broker details, Contents, Coverage policy, End-to-end run, Gateway contract cases, Requirements, Running the tests, Testing (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 63 - "createVpnSwitch"
Cohesion: 0.21
Nodes (10): Integration tests, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (69): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn() (+61 more)

### Community 66 - "storecrypt_test.go"
Cohesion: 0.19
Nodes (14): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer(), TestSealer_ADocumentThatDoesNotEncodeIsAFailedWrite(), TestSealer_DocVerifier() (+6 more)

### Community 67 - "session"
Cohesion: 0.24
Nodes (7): activeTicket, session, setSigninCookie(), sessionCtxKey, sessions, signinTickets, ticket

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (23): auditPre, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+15 more)

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
Nodes (44): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+36 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "writeError"
Cohesion: 0.16
Nodes (9): writeError(), writeRateLimited(), headerHasToken(), isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), upgradeScheme(), writeSwitch() (+1 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.07
Nodes (43): PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType (+35 more)

### Community 78 - "socketRegistry"
Cohesion: 0.26
Nodes (6): openSocket, socketRegistry, newSocketRegistry(), TestNewSocketRegistry_StartsAtTheCeilings(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked()

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "defaultConfig"
Cohesion: 0.24
Nodes (12): TestBackup_SettingsChangesNamesDottedKeys(), configVerifier(), seedConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), defaultConfig() (+4 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.13
Nodes (15): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+7 more)

### Community 86 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "user-management/module.test.ts"
Cohesion: 0.14
Nodes (18): NO_OPERATE, NO_READ_ONLY, UserManagementModule, ADMIN, CHOICES, clickRow(), el(), hidden() (+10 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "error-codes.test.ts"
Cohesion: 0.20
Nodes (11): call(), CLIENT, FAULTS, GOLDEN, Gw, NOT_SIMULATED, PAIR, relayed() (+3 more)

### Community 91 - "configfile.go"
Cohesion: 0.09
Nodes (29): config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog(), removedInUse() (+21 more)

### Community 92 - "download.ts"
Cohesion: 0.36
Nodes (6): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, Writable

### Community 93 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 95 - "newManagedEnv"
Cohesion: 0.12
Nodes (67): Auditing an action, auditLog, connsWrote(), managedEnv, holdWriter(), newManagedEnv(), raced(), runRevCases() (+59 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.12
Nodes (25): groupSecret(), newTOTPGuard(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestGroupSecret(), TestQRSVG_DrawsTheCodeWithItsQuietZone(), TestQRSVG_SameTextSameDrawing() (+17 more)

### Community 100 - "testing.T"
Cohesion: 0.05
Nodes (75): waitFor(), dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate() (+67 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "demo-flow.test.ts"
Cohesion: 0.07
Nodes (45): BackupModule, diffLines(), formatUtc(), MAX_IMPORT_BYTES, ACTIVE_MODULES, MODULE_ENTRIES, answerConfirm(), confirmOpen() (+37 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.14
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 106 - "state.ts"
Cohesion: 0.10
Nodes (21): SolacePublisher, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), selectPublisher() (+13 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "newRootHandler"
Cohesion: 0.57
Nodes (7): newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), TestRootHandler_WithManagedRouting(), TestRootHandler_WithoutManagedRouting()

### Community 111 - "live"
Cohesion: 0.05
Nodes (38): configSource, newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, hostedHandler (+30 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.18
Nodes (17): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx() (+9 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (21): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+13 more)

### Community 118 - "How the tests are organized"
Cohesion: 0.40
Nodes (5): Demo and fake gateway suite, Go suite, How the tests are organized, Type check and lint, Web suite

### Community 119 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "semp-client.ts"
Cohesion: 0.05
Nodes (56): MAX_MESSAGES_PER_QUEUE, SEMP_PROBE_TIMEOUT_MS, buildBrokerUrl(), managedErrorMessage(), createServiceSemp(), connect(), log, SempClient (+48 more)

### Community 123 - "backup_test.go"
Cohesion: 0.10
Nodes (43): flattenSettings(), newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), reseal() (+35 more)

### Community 124 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 125 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 127 - "tls_api_test.go"
Cohesion: 0.19
Nodes (24): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+16 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.04
Nodes (86): Circular Dependency Resolution, Laying out an admin page, vitest, send(), escapeHtml(), solaceErrorText(), ui, icons (+78 more)

### Community 132 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (41): DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets(), DestConnStatus (+33 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (35): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+27 more)

### Community 139 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 140 - "connections/module.ts"
Cohesion: 0.04
Nodes (75): Adding a New Module, DOM Access, AccountControl, AccountControlOptions, AccountUser, createAccountControl(), coerceConnConfig(), CONN_MODE_VALUES (+67 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.08
Nodes (31): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+23 more)

### Community 148 - "solace-publisher.ts"
Cohesion: 0.09
Nodes (30): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+22 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (64): Writing to the store, connName(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), userName(), brokerTarget, checksums (+56 more)

### Community 155 - ".serveIndex"
Cohesion: 0.12
Nodes (7): deadHijacker, fileResolvable(), setAppPageHeaders(), TestRecordingResponseWriter_DefaultStatus(), TestRecordingResponseWriter_HijackWithoutSupport(), recordingResponseWriter, pipe()

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 164 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 165 - ".checkSettings"
Cohesion: 0.33
Nodes (5): apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 167 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "main"
Cohesion: 0.09
Nodes (27): playwright-core, aliasLookup(), askLine(), askSecret(), browserOn(), checkedAlias(), collectDetails(), COMPOSE (+19 more)

### Community 171 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 172 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.12
Nodes (38): assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, mustRead() (+30 more)

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.08
Nodes (28): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+20 more)

### Community 178 - "tls_test.go"
Cohesion: 0.07
Nodes (70): testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint(), generateSelfSigned() (+62 more)

### Community 179 - "service-verify.ts"
Cohesion: 0.22
Nodes (14): escapeXml(), ACCUMULATE_IDLE_MS, compareMsgIds(), emptyResult(), fetchNewestMsgIdViaSempV1(), msgIdToString(), normalizeAccessType(), parseSempV1Response() (+6 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (38): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), createCookieJar() (+30 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 185 - "main_test.go"
Cohesion: 0.21
Nodes (26): acceptWatch, expectLogged(), gatewayClient(), gatewayDir(), startServe(), TestServe_AnOldConfigWithTLSPathKeysStartsAndWarnsOnce(), TestServe_FailuresStopTheStart(), TestServe_FilesOnlyRefusesTheRelay() (+18 more)

### Community 189 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 190 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 195 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1236 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed.go`, `net/http.ResponseWriter`, `live`, `backup_test.go`, `writer_test.go`, `fileConfigFromConfig`, `managed-api.ts`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `loadConfig` be split into smaller, more focused modules?**
  _Cohesion score 0.07881773399014778 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `store`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._