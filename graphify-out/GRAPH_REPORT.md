# Graph Report - smu-dirty  (2026-11-17)

## Corpus Check
- 355 files · ~704,127 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5111 nodes · 16681 edges · 192 communities (158 shown, 34 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2312 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `acac94cb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- managed-panel.ts
- createGateway
- connections/module.test.ts
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- settings.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- rbac.ts
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- routes.test.ts
- managed-api.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- copy-flow.test.ts
- tls-certificates/module.test.ts
- backup.ts
- storecrypt_test.go
- go_pkg_net_http
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- log/slog.Logger
- contract_test.go
- tlsManager
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
- trustHolder
- variants.test.ts
- gateway/types.ts
- tests variants
- ui-modal.ts
- helpers.ts
- configfile_test.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- Code Standards
- defaultConfig
- Managed Variant (RBAC)
- store_test.go
- queue-source.ts
- settings.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- Cutting a release
- SEMP v2 Paged Discovery (core library)
- smf.go
- Administration (`/solAdmin`)
- broker/store.ts
- backup.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- backup_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- user-management/module.test.ts
- CSS Organization
- runDirectChecks
- tls.go
- tls.ts
- managed-panel.ts
- fileConfigFromConfig
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- testing.T
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- backup/module.ts
- Provisioned Mode
- state.ts
- Deployment Options
- queue-subscription-explorer/service.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- configfile.go
- access-test.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- router.ts
- main.go
- go_pkg_os
- createPages
- utils.ts
- backup_test.go
- Developer Guide
- RowList
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
- queue-browser/service.test.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- fixtures.ts
- quietLogger
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- tls.test.ts
- buildTrustPool
- createUiEvents
- broker/store.ts
- dial.go
- signinTickets
- User Guide
- sockets.ts
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- checkedAlias
- Writing tests
- Audit trail
- csp.mjs
- settings_test.go
- checksums
- createAccessTest
- queue-copy/ui-events.ts
- tls_test.go
- Kernel.installModule
- Configure
- restart_test.go
- runChecks
- tsconfig.test.json
- parseSetCookie
- main_test.go
- auditMissing
- compose.ts
- Module 3: Queue Copy
- entitled
- Two-factor sign-in
- issueCert

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 178 edges
2. `vitest` - 121 edges
3. `quietLogger()` - 99 edges
4. `store` - 96 edges
5. `managedHandler` - 69 edges
6. `AppContext` - 69 edges
7. `loadModuleDOM()` - 64 edges
8. `writeFile()` - 63 edges
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

## Communities (192 total, 34 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.06
Nodes (56): adminHandler, hostedHandler, hostedInfo, TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), accessLog(), appIndexFile(), contextWithTarget(), dropSessionCookie() (+48 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.08
Nodes (42): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, ConnectOutcome, ConnectPart (+34 more)

### Community 2 - "createGateway"
Cohesion: 0.09
Nodes (45): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+37 more)

### Community 3 - "connections/module.test.ts"
Cohesion: 0.07
Nodes (22): ConnectionConfig, ConnectionCredentials, TaggedLogger, config, ui, createVpnSwitch(), connectTo(), fail() (+14 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.11
Nodes (12): backupName(), monthSlot(), newBackupService(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem(), backupRun (+4 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+18 more)

### Community 10 - "settings.ts"
Cohesion: 0.08
Nodes (39): connsProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk() (+31 more)

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

### Community 16 - "rbac.ts"
Cohesion: 0.16
Nodes (18): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), ALWAYS_VISIBLE, explainAccess(), findQueueRow() (+10 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (34): fileOfSchedule(), checkRev(), countAdmins(), txn, wfix, classifyStoreError(), newStale(), newWFix() (+26 more)

### Community 19 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "routes.test.ts"
Cohesion: 0.15
Nodes (12): backup, conns, DAILY, managed, norm(), Outcome, PAIR, routeKeys() (+4 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.04
Nodes (68): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, createGate() (+60 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (79): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+71 more)

### Community 26 - "vitest"
Cohesion: 0.05
Nodes (66): createEventBus(), createManagedProfile(), AdminLoginModule, BackupModule, ConnectionManagementModule, NO_VPNS, ConnectionsModule, ConnectionsModule (+58 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (41): playwright-core, askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn(), closers (+33 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (50): RFC-5280, RFC-6238, freshCode(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString(), BROKER_FIELDS (+42 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "copy-flow.test.ts"
Cohesion: 0.10
Nodes (16): removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, QueueBrowserEventName (+8 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.08
Nodes (34): EXPIRY_WARN_DAYS, MAX_PEM_BYTES, TlsCertificatesModule, CertificateBody, CertInfo, createTlsService(), TlsService, TlsView (+26 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (58): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+50 more)

### Community 33 - "storecrypt_test.go"
Cohesion: 0.10
Nodes (20): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), TestNewSealer_TakesOnlyA32ByteKey() (+12 more)

### Community 34 - "go_pkg_net_http"
Cohesion: 0.06
Nodes (25): checkAuditOnFailure(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), auditCategory, recoverPanics(), TestRecoverPanics_LetsAbortHandlerThrough(), TestRecoverPanics_LogsAndAnswers500() (+17 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.05
Nodes (52): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel (+44 more)

### Community 38 - "log/slog.Logger"
Cohesion: 0.08
Nodes (34): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+26 more)

### Community 39 - "contract_test.go"
Cohesion: 0.14
Nodes (24): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+16 more)

### Community 40 - "tlsManager"
Cohesion: 0.19
Nodes (10): parseCertificatePEM(), pemCertificates(), TestTrustFileName(), trustFileName(), tlsCertAnswerJSON, tlsCertJSON, tlsManager, tlsStateJSON (+2 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.12
Nodes (19): Changing the TLS files, auditCall, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+11 more)

### Community 42 - "time.Time"
Cohesion: 0.12
Nodes (20): clientIP(), normalizeAddr(), prefixContains(), bucket, clientCtxKey, clientWatch, failures, fakeAfter (+12 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.07
Nodes (39): delay(), BACKUP_ITER, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+31 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.14
Nodes (23): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), newCapturingLogger(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf() (+15 more)

### Community 45 - "panel.ts"
Cohesion: 0.19
Nodes (26): authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS (+18 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.21
Nodes (21): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+13 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (54): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+46 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (32): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), TestAuditFor_ActorAndClient(), auditEntry, authPages (+24 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.12
Nodes (25): Factory Pattern, applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+17 more)

### Community 52 - "trustHolder"
Cohesion: 0.11
Nodes (22): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+14 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.09
Nodes (30): QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+22 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.08
Nodes (31): AccessExplanation, DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore() (+23 more)

### Community 56 - "ui-modal.ts"
Cohesion: 0.12
Nodes (21): canOperate(), SolacePublisher, rbacReadOnly(), CopyMode, DestCredMode, DestForm, DestPrefillSnapshot, DestTarget (+13 more)

### Community 57 - "helpers.ts"
Cohesion: 0.05
Nodes (41): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+33 more)

### Community 58 - "configfile_test.go"
Cohesion: 0.13
Nodes (38): configVerifier(), decodeConfigFile(), encodeConfigFile(), resolveConfig(), seedConfigFile(), clearSeedEnv(), removedNames(), TestConfigVerifier_RefusesWhatAStartWouldRefuse() (+30 more)

### Community 59 - "Testing"
Cohesion: 0.14
Nodes (13): Contents, Coverage policy, Demo and fake gateway suite, Gateway contract cases, Go suite, How the tests are organized, Running the tests, Testing (+5 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 63 - "defaultConfig"
Cohesion: 0.10
Nodes (23): TestAudit_ReopenFailureLosesTheRecordLoudly(), TestOpenAuditor_FailureIsActionable(), newLive(), liveWith(), TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplySwapsEveryLiveKey(), TestLive_TwoFactorIsLive() (+15 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (71): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+63 more)

### Community 66 - "queue-source.ts"
Cohesion: 0.12
Nodes (25): ProvisionedTarget, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope (+17 more)

### Community 67 - "settings.ts"
Cohesion: 0.12
Nodes (28): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups() (+20 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.11
Nodes (22): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connChanges() (+14 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "smf.go"
Cohesion: 0.10
Nodes (11): setAppPageHeaders(), recordingResponseWriter, safeSegment(), headerHasToken(), isWebSocketUpgrade(), parseSMFPath(), pipe(), sameOriginSocket() (+3 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.09
Nodes (35): buildMessage(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueType (+27 more)

### Community 78 - "backup.go"
Cohesion: 0.07
Nodes (29): connName(), diffByName(), flattenSettings(), mergeByName(), sameRecord(), settingsChanges(), sortedKeys(), TestBackup_DiffIgnoresRev() (+21 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "backup_test.go"
Cohesion: 0.18
Nodes (24): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocYAML(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing() (+16 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 86 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "user-management/module.test.ts"
Cohesion: 0.15
Nodes (17): NO_OPERATE, NO_READ_ONLY, ADMIN, CHOICES, clickRow(), el(), hidden(), listed() (+9 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "runDirectChecks"
Cohesion: 0.15
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 91 - "tls.go"
Cohesion: 0.05
Nodes (27): certHolder, atomicWrite(), browserKeyProblem(), fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), newCertHolder(), newTLSManager() (+19 more)

### Community 92 - "tls.ts"
Cohesion: 0.12
Nodes (34): docOf(), glob(), port(), totpDoc(), glob(), Session, BadRequest, boolean() (+26 more)

### Community 93 - "managed-panel.ts"
Cohesion: 0.05
Nodes (39): Adding a New Module, DOM Access, pickQueue() reusable picker, AccountControl, AccountControlOptions, AccountUser, createAccountControl(), MAX_MESSAGES_PER_QUEUE (+31 more)

### Community 94 - "fileConfigFromConfig"
Cohesion: 0.10
Nodes (25): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), accessConfig, config, defaultFileConfig(), fileConfigFromConfig(), intInRange() (+17 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.09
Nodes (71): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnvFrom() (+63 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.10
Nodes (31): checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), recoveryIndex(), loadTOTPVectors(), TestCheckTwoFactor() (+23 more)

### Community 100 - "testing.T"
Cohesion: 0.07
Nodes (44): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, TestRecordingResponseWriter_HijackWithoutSupport(), answerJSON(), newRelayEnv() (+36 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.06
Nodes (47): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad(), RFC-3339 (+39 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.14
Nodes (13): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Security model, Start it (+5 more)

### Community 106 - "state.ts"
Cohesion: 0.09
Nodes (33): SempContext, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+25 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "queue-subscription-explorer/service.ts"
Cohesion: 0.10
Nodes (29): createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues, fetchVpns (+21 more)

### Community 111 - "configfile.go"
Cohesion: 0.10
Nodes (26): checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), moduleCatalog(), removedInUse(), removedTLSPaths(), TestRemovedTLSPaths_AgreeingKeysAreSilent() (+18 more)

### Community 112 - "access-test.ts"
Cohesion: 0.16
Nodes (14): AccessLevel, ACCESS_PROMPT, AccessTest, LEVELS, createUserMgmtService(), ManagedUser, ModuleChoices, UserList (+6 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "router.ts"
Cohesion: 0.13
Nodes (22): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+14 more)

### Community 119 - "main.go"
Cohesion: 0.06
Nodes (34): acceptWatch, hostedEnv(), insecureEnv(), levelName(), showAuditEnv(), TestLevelName(), logStartup(), modeName() (+26 more)

### Community 120 - "go_pkg_os"
Cohesion: 0.16
Nodes (14): partialName(), createExclusive(), loadStoreKey(), ownershipHint(), parseStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+6 more)

### Community 121 - "createPages"
Cohesion: 0.15
Nodes (27): ManagedDemo, ManagedPanelDeps, Gateway, createPages(), codeField(), field(), frame(), hidden() (+19 more)

### Community 122 - "utils.ts"
Cohesion: 0.12
Nodes (25): isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString(), matchStringRegexCache (+17 more)

### Community 123 - "backup_test.go"
Cohesion: 0.12
Nodes (38): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+30 more)

### Community 124 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.13
Nodes (37): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+29 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.05
Nodes (82): Laying out an admin page, vitest, DEFAULT_MAX_MESSAGES_PER_QUEUE, AppContext, AppState, escapeHtml(), ui.cacheElements, ui.updateInputState (+74 more)

### Community 132 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (43): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets() (+35 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (35): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+27 more)

### Community 139 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 140 - "connections/module.ts"
Cohesion: 0.05
Nodes (53): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+45 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.13
Nodes (28): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+20 more)

### Community 148 - "queue-browser/service.test.ts"
Cohesion: 0.05
Nodes (56): Circular Dependency Resolution, Integration tests, Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending() (+48 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.04
Nodes (65): Writing to the store, apiError, sessionEnders(), brokerTarget, changedOnDiskError, clientGoneError, clientRec, connRec (+57 more)

### Community 155 - "fixtures.ts"
Cohesion: 0.18
Nodes (14): TLS_READ_ONLY_ID, QueueFixture, connection(), DEMO_ACCOUNTS, DEMO_TOPOLOGY, demoSeed(), everything, pw() (+6 more)

### Community 156 - "quietLogger"
Cohesion: 0.14
Nodes (46): fakeClock, fixed(), newTestAuditor(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+38 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.25
Nodes (13): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readVariant(), stripComments() (+5 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "tls.test.ts"
Cohesion: 0.08
Nodes (16): DEMO_SUBJECT, START_CERTIFICATE_BYTES, PAIR, saved, start(), contractSeed(), CA, call() (+8 more)

### Community 161 - "buildTrustPool"
Cohesion: 0.15
Nodes (15): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value, appendPEMCerts() (+7 more)

### Community 162 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 163 - "broker/store.ts"
Cohesion: 0.09
Nodes (52): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), listQueues(), listVpns() (+44 more)

### Community 164 - "dial.go"
Cohesion: 0.20
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 165 - "signinTickets"
Cohesion: 0.21
Nodes (8): activeTicket, session, setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions, signinTickets, ticket

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "sockets.ts"
Cohesion: 0.21
Nodes (11): BackupDeps, Upstream, RouterDeps, GatewaySessions, GatewaySettingsFile, createSockets(), GatewaySockets, OpenSocket (+3 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

### Community 171 - "Writing tests"
Cohesion: 0.18
Nodes (10): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+2 more)

### Community 172 - "Audit trail"
Cohesion: 0.15
Nodes (13): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, Broker details, End-to-end run (+5 more)

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.11
Nodes (45): TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), logLine(), newManagedEnv() (+37 more)

### Community 176 - "createAccessTest"
Cohesion: 0.29
Nodes (6): createAccessTest(), evaluate(), note(), grantedModules(), setup(), pick()

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.12
Nodes (13): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+5 more)

### Community 178 - "tls_test.go"
Cohesion: 0.12
Nodes (43): testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), recoverTLSPair(), equalCertJSON(), fingerprintOf(), keyBodyLine() (+35 more)

### Community 179 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "restart_test.go"
Cohesion: 0.27
Nodes (9): restartRequester(), noRedirects(), postTo(), restartServe(), sessionFromResponse(), signInBootstrapAdmin(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), TestServe_RestartDrainsRequestsInFlightThenCallsTheHookOnce() (+1 more)

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (37): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), createCookieJar() (+29 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 185 - "main_test.go"
Cohesion: 0.23
Nodes (23): expectLogged(), gatewayClient(), gatewayDir(), route(), startServe(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_WithManagedRouting() (+15 more)

### Community 186 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 188 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1211 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed.go`, `log/slog.Logger`, `net/http.ResponseWriter`, `settings_test.go`, `checksums`, `writer_test.go`, `managed-api.ts`, `fileConfigFromConfig`, `newManagedEnv`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.062003968253968256 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `store`?**
  _High betweenness centrality (0.166) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._