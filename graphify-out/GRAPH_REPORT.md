# Graph Report - smu-dirty  (2026-11-26)

## Corpus Check
- 381 files · ~777,535 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5563 nodes · 18059 edges · 202 communities (164 shown, 38 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2410 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f1fbdfaf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- broker/store.ts
- createManagedPanel
- tls_test.go
- relay_test.go
- semp-client Test Suite
- Architecture
- provisioned-connection/index.ts
- core event-bus
- vitest
- tlsManager
- createGateway
- panel.ts
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- live
- connections/module.ts
- scripts
- writer_test.go
- backup_test.go
- Git Workflow & Release Process
- vite.config.ts
- tls.ts
- two-factor.test.ts
- totp.go
- pages_test.go
- fixtures.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- rbac.ts
- .checkSettings
- backup.ts
- settings.ts
- file-kind.ts
- Developer Guide
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- serveUntilStopped
- boot.managed.ts
- tls.go
- net/http.ResponseWriter
- time.Time
- sealer
- writer
- backup_test.go
- ui.selectMessage
- gateway-settings/module.ts
- newFakeClock
- authPages
- checksums
- queue-discovery index.html
- server/index.ts
- copy-flow.test.ts
- gateway/store.ts
- tests variants
- backup/module.ts
- gateway/index.ts
- .ServeHTTP
- fileutil_test.go
- queue-discovery module
- serveUntilStopped
- Direct demo (`demo.html`)
- state.ts
- Managed Variant (RBAC)
- store_test.go
- testing.T
- request
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- router.ts
- SEMP v2 Paged Discovery (core library)
- session
- Gateway Settings
- broker-hosts.test.ts
- pwaHandler
- createQueuePicker
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- mustHash
- auditor
- contract.test.ts
- ui-modal.test.ts
- net.Conn
- panel.ts
- keyfile_test.go
- manual-to-md.mjs
- broker/store.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- queue-copy/ui-events.ts
- managed-panel.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- user-management/module.ts
- dest-provisioned.test.ts
- BrokerHosts
- service-verify.ts
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- loadOrGenerateServerCert
- notification-center/index.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- vpn-switch.ts
- demo-flow.test.ts
- configfile_test.go
- createPages
- newCapturingLogger
- provisioned-connect.ts
- routes.test.ts
- newManagedHandler
- queue-subscription-explorer parse
- main_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- ui-modal.ts
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Testing
- User Guide
- backup_api_test.go
- tls.test.ts
- Connections
- queue-discovery module.ts
- tls_api_test.go
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
- session-activity.ts
- vite-build.mjs
- smf_test.go
- queue-discovery ui.js
- ConnectionsModule Test Suite
- relay.ts
- proxy_test.go
- connections module.ts
- Queue Browser
- trustHolder
- Two-factor sign-in
- Provisioned connections
- Deployment Options
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- Provisioned Mode
- tls-certificates/module.test.ts
- Audit trail
- connection-management/service.ts
- testing.T
- queue-copy/service.ts
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- parseSetCookie
- go-web-proxy main (gateway entrypoint)
- runChecks
- tsconfig.test.json
- Certificates
- ManagedPanel
- User Mgmt.
- compose.ts
- Configure
- Code Standards
- csp.mjs
- RowList
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- Security Policy
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- verifyViaSempV1
- SEMP v1 Pagination (Queue Subscription Explorer)
- openMessaging

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 132 edges
3. `quietLogger()` - 101 edges
4. `store` - 100 edges
5. `AppContext` - 72 edges
6. `writeFile()` - 70 edges
7. `managedHandler` - 69 edges
8. `loadModuleDOM()` - 69 edges
9. `runChecks()` - 63 edges
10. `required()` - 57 edges

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

## Communities (202 total, 38 thin omitted)

### Community 0 - "broker/store.ts"
Cohesion: 0.10
Nodes (34): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn() (+26 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.25
Nodes (20): outcomeDetails(), createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), closeLive(), doConnect() (+12 more)

### Community 2 - "tls_test.go"
Cohesion: 0.10
Nodes (58): mustRead(), writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), loadStandardRoots(), recoverTLSPair() (+50 more)

### Community 3 - "relay_test.go"
Cohesion: 0.13
Nodes (36): errReader, fakeBroker, logLine(), isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC() (+28 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "provisioned-connection/index.ts"
Cohesion: 0.10
Nodes (15): CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect() (+7 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "vitest"
Cohesion: 0.04
Nodes (80): vitest, createEventBus(), createManagedProfile(), unfilteredPrimarySempContext(), AppContext, AppState, AdminLoginModule, BackupModule (+72 more)

### Community 9 - "tlsManager"
Cohesion: 0.07
Nodes (24): browserKeyProblem(), encodeCertificates(), formatFingerprint(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName() (+16 more)

### Community 10 - "createGateway"
Cohesion: 0.14
Nodes (27): acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), newRecoveryCodes(), newSecret(), normalizeRecovery() (+19 more)

### Community 11 - "panel.ts"
Cohesion: 0.17
Nodes (29): authenticatorSection(), rebuild(), refresh(), managedSections(), button(), connectionReference(), copyable(), DEMO_CREDENTIALS (+21 more)

### Community 12 - "Testing Requirements"
Cohesion: 0.12
Nodes (16): code:block3 (src/core/services/solace-client.ts), code:ts (import { describe, it, expect, vi, beforeEach } from 'vitest), code:ts (// Weak — only proves "no crash"), code:ts (// Avoid — manual restoration is skipped on failure, leaks i), code:bash (npm test              # Full run (23 files, ~16s)), Coverage Threshold, Cross-Module Integration Tests, Defensive-Guard Tests (+8 more)

### Community 13 - "QueueBrowserModule (priority 30)"
Cohesion: 0.14
Nodes (27): BusEvent app:message-delete, BusEvent app:state-change, BusEvent browser:available, BusEvent browser:browse-queue, BusEvent client:connected, BusEvent client:disconnected, BusEvent config:max-messages-changed, BusEvent connection:check-connection (+19 more)

### Community 14 - "Queue Browser Screenshot"
Cohesion: 0.15
Nodes (13): App Header (solace Msg Utility / Queue Browser title), Content Preview (JSON payload viewer with copy button), Details Header Fields (Message ID, Destination + TOPIC badge, Repl Grp Msg Id), Message Details Panel (BINARY badge, Show Raw Content), Message Properties chips (Delivery Mode, Sender Id), Message Table (Message ID, Date, Size, Actions, row selection, highlighted row), QB Session Panel (Queue Name input, Bind, Bound Queues picker, Unbind), Queue Header (vpn::queue, READ-ONLY badge, filter, Total/Displayed/Selected counts, Download Content / Download Full / Forward) (+5 more)

### Community 15 - "live"
Cohesion: 0.12
Nodes (17): configSource, hostedHandler, live, newLive(), liveSettings, buildManagedRoutes(), gateDirect(), newManagedRouting() (+9 more)

### Community 16 - "connections/module.ts"
Cohesion: 0.06
Nodes (49): The Module Contract, createService (subscription-explorer), boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), mountNotificationBell() (+41 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.10
Nodes (37): fileOfSchedule(), TestBackupService_LoadRefusesADamagedSchedule(), withRequestInfo(), scheduleDoc, checkRev(), recoveryIndex(), txn, wfix (+29 more)

### Community 19 - "backup_test.go"
Cohesion: 0.10
Nodes (12): backupName(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleProblem(), backupRun (+4 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "tls.ts"
Cohesion: 0.12
Nodes (37): docOf(), glob(), openBackup(), port(), totpDoc(), glob(), BadRequest, boolean() (+29 more)

### Community 23 - "two-factor.test.ts"
Cohesion: 0.13
Nodes (21): clock(), mockCode(), STEP_MS, stepOf(), RESTART_PAUSE_MS, codeFor(), codeNow(), enrolViewer() (+13 more)

### Community 24 - "totp.go"
Cohesion: 0.12
Nodes (29): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret() (+21 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (82): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, holdTurn() (+74 more)

### Community 26 - "fixtures.ts"
Cohesion: 0.06
Nodes (53): The payload samples queue, getQueue(), seed(), QUEUE_STATE, resetScenario(), scenario, ScenarioState, seedState() (+45 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): playwright-core, abort(), aliasLookup(), alive(), askLine(), askSecret(), bindInQueueBrowser(), broker (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (66): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), aliasAddress(), APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED (+58 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "rbac.ts"
Cohesion: 0.05
Nodes (45): pickQueue() reusable picker, PickerCache, PickQueueOptions, PickQueueResult, QueuePicker, Refs, State, filterSempFetch() (+37 more)

### Community 31 - ".checkSettings"
Cohesion: 0.29
Nodes (6): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (58): BACKUP_ITER, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser() (+50 more)

### Community 33 - "settings.ts"
Cohesion: 0.12
Nodes (25): isTwoFactorMode(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups() (+17 more)

### Community 34 - "file-kind.ts"
Cohesion: 0.06
Nodes (52): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+44 more)

### Community 35 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, End-to-end run (+4 more)

### Community 36 - "utils.ts"
Cohesion: 0.06
Nodes (44): clientUsernameError(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString() (+36 more)

### Community 38 - "serveUntilStopped"
Cohesion: 0.10
Nodes (30): recoverPanics(), TestRecoverPanics_LetsAbortHandlerThrough(), newRootHandler(), serveUntilStopped(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse(), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode() (+22 more)

### Community 39 - "boot.managed.ts"
Cohesion: 0.09
Nodes (31): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+23 more)

### Community 40 - "tls.go"
Cohesion: 0.05
Nodes (39): diffByName(), flattenSettings(), sameRecord(), settingsChanges(), sortedKeys(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), TestBackup_SettingsChangesNamesDottedKeys() (+31 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (18): Writing to the store, auditCall, smfPathFor(), connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+10 more)

### Community 42 - "time.Time"
Cohesion: 0.10
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, clientWatch, newDialer() (+16 more)

### Community 43 - "sealer"
Cohesion: 0.25
Nodes (6): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeOptions, storeRole

### Community 44 - "writer"
Cohesion: 0.12
Nodes (10): changedOnDiskError, clientGoneError, newSettingsFile(), settingsBody, settingsFile, settingsJSON, stagedSettings, staleError (+2 more)

### Community 45 - "backup_test.go"
Cohesion: 0.17
Nodes (22): backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_ScheduleDocProblem(), TestBackupService_ConcurrentSavesLeaveDiskAndMemoryEqual(), TestBackupService_DirProblem(), TestBackupService_ExportAndImportRoundTripTwoFactor(), TestBackupService_FailedWriteChangesNothing() (+14 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "gateway-settings/module.ts"
Cohesion: 0.04
Nodes (57): Code Conventions, CSS, DOM Access, Error Handling, File Organization, Linting, Logging standard, Modals (+49 more)

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (41): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+33 more)

### Community 52 - "server/index.ts"
Cohesion: 0.18
Nodes (19): listQueues(), listVpns(), brokerVpns(), delay(), DIRECT_BROKER, handleSemp(), hostedResponse(), installMockServer() (+11 more)

### Community 53 - "copy-flow.test.ts"
Cohesion: 0.10
Nodes (17): createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, browserError(), MOCK_SUBCODE (+9 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.08
Nodes (30): DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult (+22 more)

### Community 56 - "backup/module.ts"
Cohesion: 0.04
Nodes (60): Adding a New Module, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions (+52 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (41): BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+33 more)

### Community 58 - ".ServeHTTP"
Cohesion: 0.14
Nodes (11): setForwarded(), brokerTarget, bodyDeadline(), sempRelay, isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), upgradeScheme() (+3 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.07
Nodes (56): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+48 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "serveUntilStopped"
Cohesion: 0.16
Nodes (27): TestSweepLeftovers_ADataDirectoryThatIsAFile(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestLive_ApplyCarriesStandardRootsIntoTheTrustHolder(), dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2() (+19 more)

### Community 62 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 63 - "state.ts"
Cohesion: 0.18
Nodes (10): SolacePublisher, DEST_SCOPES, DestCredMode, DestForm, destMessagingHost(), DestPrefillSnapshot, destScopeOf(), DestTarget (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.09
Nodes (81): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), currentUser(), enrolViewer(), envOf(), err2s(), mustHash() (+73 more)

### Community 66 - "testing.T"
Cohesion: 0.09
Nodes (50): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+42 more)

### Community 67 - "request"
Cohesion: 0.12
Nodes (31): basic(), bcheck(), bindQueue(), check(), closeOpened(), cookies, directSempPath(), drain() (+23 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.08
Nodes (20): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+12 more)

### Community 69 - "managed.go"
Cohesion: 0.13
Nodes (24): bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connToOutput(), modulesAttr() (+16 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "router.ts"
Cohesion: 0.13
Nodes (23): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+15 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "session"
Cohesion: 0.28
Nodes (4): activeTicket, sessions, signinTickets, ticket

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "broker-hosts.test.ts"
Cohesion: 0.18
Nodes (16): BROKER_HOSTS_TEXT, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType, createBrokerHosts() (+8 more)

### Community 79 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (43): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceMode(), applySourceReadonly(), clearDestTypedSecrets() (+35 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.12
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.09
Nodes (43): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+35 more)

### Community 87 - "auditor"
Cohesion: 0.13
Nodes (5): auditCategory, auditEntry, auditor, auditWrote, gatedWriter

### Community 88 - "contract.test.ts"
Cohesion: 0.08
Nodes (47): clientUsernameOk(), sempUsernameOk(), connsProblem(), usersProblem(), UpstreamAnswer, range(), BrokerTarget, BROKER_RULE (+39 more)

### Community 89 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (53): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Solace mock, Stubbing globals (+45 more)

### Community 90 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 91 - "panel.ts"
Cohesion: 0.08
Nodes (27): ManagedDemo, ManagedPanelDeps, TLS_READ_ONLY_ID, QueueFixture, VpnFixture, Gateway, GatewayPages, LOGIN_PATHS (+19 more)

### Community 92 - "keyfile_test.go"
Cohesion: 0.44
Nodes (9): existingStore(), loadStoreKey(), keyDir(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey(), TestLoadStoreKey_RefusesAMissingKeyBesideAStore() (+1 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.09
Nodes (40): buildSample(), AuthenticationScheme, DestinationType, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType, QueueBrowserEventName (+32 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.10
Nodes (75): Auditing an action, auditLog, connChanges(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named() (+67 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "queue-copy/ui-events.ts"
Cohesion: 0.15
Nodes (16): ProvisionedConnectionCard, ProvisionedTarget, destLive, syncDestFormFromSnapshot(), CopyUiApi, CopyUiServices, wireUiEvents(), deriveDestMode() (+8 more)

### Community 100 - "managed-panel.ts"
Cohesion: 0.03
Nodes (128): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+120 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "user-management/module.ts"
Cohesion: 0.05
Nodes (56): Laying out an admin page, AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync() (+48 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (30): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+22 more)

### Community 106 - "BrokerHosts"
Cohesion: 0.10
Nodes (6): BrokerHosts, Segmented, SlideChoice, CopyMode, DestScope, CopyUiElements

### Community 107 - "service-verify.ts"
Cohesion: 0.12
Nodes (23): escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, StopReason (+15 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.12
Nodes (28): Vendor scripts, Test DOM, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER (+20 more)

### Community 111 - "loadOrGenerateServerCert"
Cohesion: 0.16
Nodes (11): certHolder, fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), newCertHolder(), TestGenerateSelfSigned_CreatesValidKeypair(), TestLoadOrGenerateServerCert_GeneratedPairIsABootstrap(), TestLoadOrGenerateServerCert_LoadsExisting() (+3 more)

### Community 112 - "notification-center/index.ts"
Cohesion: 0.09
Nodes (23): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, row() (+15 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (26): account(), activityMock, clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect() (+18 more)

### Community 118 - "vpn-switch.ts"
Cohesion: 0.08
Nodes (26): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, Integration tests, TaggedLogger, showToast() (+18 more)

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.07
Nodes (39): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+31 more)

### Community 120 - "configfile_test.go"
Cohesion: 0.05
Nodes (94): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), config, checkModuleIDs(), checkRenamedEnv(), configVerifier(), decodeConfigFile(), defaultFileConfig() (+86 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "newCapturingLogger"
Cohesion: 0.15
Nodes (32): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+24 more)

### Community 123 - "provisioned-connect.ts"
Cohesion: 0.21
Nodes (13): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeLines(), PART_LABEL, PartFailure (+5 more)

### Community 124 - "routes.test.ts"
Cohesion: 0.14
Nodes (7): bundleSources(), productSources(), REPO_ROOT, fire(), GLOBALS, pending(), shell

### Community 125 - "newManagedHandler"
Cohesion: 0.19
Nodes (6): Changing the TLS files, Gateway and Admin How-tos, auditPre, auditWriter, fixedAction(), newManagedHandler()

### Community 127 - "main_test.go"
Cohesion: 0.09
Nodes (48): acceptWatch, boolEnv(), envOr(), loadConfig(), main(), parseStrictBool(), printVersionIfRequested(), serve() (+40 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (89): Circular Dependency Resolution, BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, errMessage(), escapeHtml() (+81 more)

### Community 132 - "ui-modal.ts"
Cohesion: 0.31
Nodes (13): runCopyJob(), selectPublisher(), resetTransientState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate() (+5 more)

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.09
Nodes (22): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+14 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (37): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+29 more)

### Community 139 - "tls.test.ts"
Cohesion: 0.14
Nodes (12): DEMO_SUBJECT, STANDARD_ROOTS_MISSING, CA, call(), gateway(), get(), Gw, KEY (+4 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.11
Nodes (16): adminHandler, warnLooseKeyMode(), openSocket, newAdminHandler(), TestAdminHandler_DisabledIs404(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_TrailingSlashRedirects(), newSEMPRelay() (+8 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.04
Nodes (74): connName(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), userName(), clientRec, connRec, connsDoc (+66 more)

### Community 155 - "session-activity.ts"
Cohesion: 0.20
Nodes (12): createSessionActivity(), onInput(), send(), INPUTS, KEEPALIVE_INTERVAL_MS, keepSessionAlive(), SessionActivity, SessionActivityOptions (+4 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "smf_test.go"
Cohesion: 0.12
Nodes (27): fakeAnswer, fakeSMFBroker, newManagedEnvWith(), TestRelay_GoesUnderTheConnectionsURLPath(), TestRelay_UsesTheConnectionsScheme(), withSession(), newFakeSMFBroker(), newSMFEnv() (+19 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "relay.ts"
Cohesion: 0.22
Nodes (15): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+7 more)

### Community 161 - "proxy_test.go"
Cohesion: 0.05
Nodes (41): checkAuditOnFailure(), dialRequest, dialResponse, hostedInfo, TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplySwapsEveryLiveKey(), TestLive_TwoFactorIsLive(), yamlLeaves() (+33 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "trustHolder"
Cohesion: 0.27
Nodes (3): standardRoots, trustHolder, trustState

### Community 165 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (17): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+9 more)

### Community 167 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 169 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 170 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (66): formatUtc(), diffLines(), MAX_IMPORT_BYTES, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES (+58 more)

### Community 172 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 173 - "connection-management/service.ts"
Cohesion: 0.31
Nodes (6): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, VpnLookup, CONN

### Community 174 - "testing.T"
Cohesion: 0.15
Nodes (30): errorCode(), saveAnswer, decodeSave(), managedEnv, TestSettings_AccessListThatAdmitsTheAdmin(), TestSettings_AFileThatIsGoneIsAChangeOnDisk(), TestSettings_AHandEditIsFoundAtWriteTimeAndStaysRefused(), TestSettings_ASaveWithoutARevIsRefused() (+22 more)

### Community 175 - "queue-copy/service.ts"
Cohesion: 0.60
Nodes (3): destNameProblem(), getOriginalIdHint(), RESERVED_PREFIXES

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

### Community 180 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 181 - "go-web-proxy main (gateway entrypoint)"
Cohesion: 0.32
Nodes (7): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (33): adminSession(), configureGateway(), createScratch(), expect(), invalidProblem(), basisMoved(), certFingerprint(), createCookieJar() (+25 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 194 - "Security Policy"
Cohesion: 0.50
Nodes (3): Reporting a Vulnerability, Security Policy, Supported Versions

### Community 195 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 196 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 197 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 198 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 199 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

### Community 200 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 202 - "openMessaging"
Cohesion: 0.60
Nodes (5): connectSolace(), messagingFailed(), openMessaging(), settleMessaging(), switchFailed()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **114 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1365 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `net/http.ResponseWriter` to `store_test.go`, `managed.go`, `live`, `writer_test.go`, `checksums`, `backup/module.ts`, `store`, `newManagedHandler`, `newManagedEnv`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `broker/store.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1048780487804878 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `backup/module.ts` to `user-management/module.ts`, `net/http.ResponseWriter`, `vpn-switch.ts`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Are the 83 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 83 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._