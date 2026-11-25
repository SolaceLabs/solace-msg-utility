# Graph Report - smu-dirty  (2026-11-25)

## Corpus Check
- 380 files · ~776,766 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5557 nodes · 18049 edges · 195 communities (158 shown, 37 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2409 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a67b41f3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- queue-subscription-explorer/service.ts
- managed-panel.ts
- tls_test.go
- relay_test.go
- semp-client Test Suite
- Architecture
- queue-copy/module.ts
- core event-bus
- loadModuleDOM
- tlsManager
- createGateway
- journal
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- loadOrGenerateServerCert
- connections/module.ts
- scripts
- writer_test.go
- backup_test.go
- Git Workflow & Release Process
- vite.config.ts
- restart.go
- writeError
- totp.go
- pages_test.go
- error-codes.test.ts
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- queue-source.ts
- access.go
- backup.ts
- gateway-settings/module.test.ts
- file-kind.ts
- Developer Guide
- connections/module.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- boot.managed.ts
- tls.go
- net/http.ResponseWriter
- time.Time
- loadStore
- demo-flow.test.ts
- backup_test.go
- ui.selectMessage
- connection-management/module.ts
- newFakeClock
- authPages
- storecrypt_test.go
- queue-discovery index.html
- server/index.ts
- MockEmitter
- gateway/store.ts
- tests variants
- backup/module.test.ts
- gateway/index.ts
- secret
- fileutil_test.go
- queue-discovery module
- trustHolder
- Direct demo (`demo.html`)
- state.ts
- Managed Variant (RBAC)
- store_test.go
- audit_test.go
- runDirectChecks
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- writer
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
- createUiEvents
- contract.test.ts
- ui-modal.test.ts
- Provisioned Mode
- panel.ts
- keyfile_test.go
- manual-to-md.mjs
- broker/store.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- semp-client.ts
- managed-api.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- user-management/module.ts
- dest-provisioned.test.ts
- row-list/index.ts
- dom.ts
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- managed-profile.ts
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
- tls-certificates/module.test.ts
- shell-loader.test.ts
- user-management/module.test.ts
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
- tlsWriteError
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
- quietLogger
- connection-management/module.test.ts
- connections module.ts
- Queue Browser
- backup_api.go
- solace-client.ts
- Provisioned connections
- Deployment Options
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- picker.test.ts
- tls-certificates/module.ts
- Key Concepts
- parseSetCookie
- testing.T
- queue-copy/service.ts
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- runChecks
- tsconfig.test.json
- Certificates
- User Mgmt.
- compose.ts
- Code Standards
- csp.mjs
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- System Overview
- issueCert
- CSS Organization
- Module Isolation
- Kernel.installModule
- SEMP v1 Pagination (Queue Subscription Explorer)

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 132 edges
3. `quietLogger()` - 101 edges
4. `store` - 100 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
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

## Communities (195 total, 37 thin omitted)

### Community 0 - "queue-subscription-explorer/service.ts"
Cohesion: 0.08
Nodes (32): createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), extractNextPath(), fetchPaged (generator), fetchQueues, fetchVpns (+24 more)

### Community 1 - "managed-panel.ts"
Cohesion: 0.10
Nodes (44): managedErrorMessage(), isSessionEnded(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails() (+36 more)

### Community 2 - "tls_test.go"
Cohesion: 0.08
Nodes (60): writeFile(), testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), formatFingerprint(), loadStandardRoots() (+52 more)

### Community 3 - "relay_test.go"
Cohesion: 0.14
Nodes (34): errReader, fakeBroker, logLine(), isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+26 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "queue-copy/module.ts"
Cohesion: 0.07
Nodes (40): createGate(), GateOptions, ModuleGate, CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard(), populateVpns() (+32 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "loadModuleDOM"
Cohesion: 0.04
Nodes (68): Event Handling, Integration tests, vitest, QueuePicker, DeploymentConfig, createEventBus(), createManagedProfile(), AppContext (+60 more)

### Community 9 - "tlsManager"
Cohesion: 0.15
Nodes (14): parseCertificatePEM(), pemCertificates(), readableName(), TestReadableName(), TestTrustFileName(), trustFileName(), trustListedName(), warnIfExpiring() (+6 more)

### Community 10 - "createGateway"
Cohesion: 0.07
Nodes (48): Restart gateway, The checks, clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery() (+40 more)

### Community 11 - "journal"
Cohesion: 0.11
Nodes (15): Layout of tests, checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftoversOf(), syncDir(), TestSyncDir_ReportsAMissingDirectory() (+7 more)

### Community 12 - "Testing Requirements"
Cohesion: 0.12
Nodes (16): code:block3 (src/core/services/solace-client.ts), code:ts (import { describe, it, expect, vi, beforeEach } from 'vitest), code:ts (// Weak — only proves "no crash"), code:ts (// Avoid — manual restoration is skipped on failure, leaks i), code:bash (npm test              # Full run (23 files, ~16s)), Coverage Threshold, Cross-Module Integration Tests, Defensive-Guard Tests (+8 more)

### Community 13 - "QueueBrowserModule (priority 30)"
Cohesion: 0.14
Nodes (27): BusEvent app:message-delete, BusEvent app:state-change, BusEvent browser:available, BusEvent browser:browse-queue, BusEvent client:connected, BusEvent client:disconnected, BusEvent config:max-messages-changed, BusEvent connection:check-connection (+19 more)

### Community 14 - "Queue Browser Screenshot"
Cohesion: 0.15
Nodes (13): App Header (solace Msg Utility / Queue Browser title), Content Preview (JSON payload viewer with copy button), Details Header Fields (Message ID, Destination + TOPIC badge, Repl Grp Msg Id), Message Details Panel (BINARY badge, Show Raw Content), Message Properties chips (Delivery Mode, Sender Id), Message Table (Message ID, Date, Size, Actions, row selection, highlighted row), QB Session Panel (Queue Name input, Bind, Bound Queues picker, Unbind), Queue Header (vpn::queue, READ-ONLY badge, filter, Total/Displayed/Selected counts, Download Content / Download Full / Forward) (+5 more)

### Community 15 - "loadOrGenerateServerCert"
Cohesion: 0.11
Nodes (15): certHolder, browserKeyProblem(), fileExists(), generateSelfSigned(), loadOrGenerateServerCert(), newCertHolder(), parseKeyPEM(), TestBrowserKeyProblem() (+7 more)

### Community 16 - "connections/module.ts"
Cohesion: 0.09
Nodes (41): Adding a New Module, boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT (+33 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.11
Nodes (33): Writing to the store, changeUsersBehindTheWriter(), checkRev(), countAdmins(), recoveryIndex(), txn, wfix, classifyStoreError() (+25 more)

### Community 19 - "backup_test.go"
Cohesion: 0.09
Nodes (19): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem() (+11 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "restart.go"
Cohesion: 0.50
Nodes (3): restartRequester(), TestRestartRequester_RemembersOneRequestAndNeverBlocks(), restartJSON

### Community 23 - "writeError"
Cohesion: 0.12
Nodes (13): setForwarded(), smfPathFor(), writeError(), writeRateLimited(), newUserCounter(), TestUserCounter(), isWebSocketUpgrade(), parseSMFPath() (+5 more)

### Community 24 - "totp.go"
Cohesion: 0.17
Nodes (23): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestGroupSecret(), TestQRSVG_DrawsTheCodeWithItsQuietZone(), TestQRSVG_TextTooLongForACodeIsAnError() (+15 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (85): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+77 more)

### Community 26 - "error-codes.test.ts"
Cohesion: 0.12
Nodes (17): ALL, bundleSources(), productSources(), REPO_ROOT, rows(), call(), CLIENT, FAULTS (+9 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (55): playwright-core, abort(), alive(), askLine(), askSecret(), bcheck(), bindInQueueBrowser(), broker (+47 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (60): RFC-5280, RFC-6238, Browser and harness notes, APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), base32Decode() (+52 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "queue-source.ts"
Cohesion: 0.08
Nodes (30): ProvisionedConnectionCard, State, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), QueueSource (+22 more)

### Community 31 - "access.go"
Cohesion: 0.20
Nodes (12): Gateway contract cases, clientACL(), clientIP(), normalizeAddr(), prefixContains(), accessConfig, apiError, clientCtxKey (+4 more)

### Community 32 - "backup.ts"
Cohesion: 0.03
Nodes (136): isTwoFactorMode(), BACKUP_ITER, BackupDeps, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn() (+128 more)

### Community 33 - "gateway-settings/module.test.ts"
Cohesion: 0.16
Nodes (21): GatewaySettingsModule, ADMIN, chosen(), clickSave(), el(), errorText(), hidden(), makeCtx() (+13 more)

### Community 34 - "file-kind.ts"
Cohesion: 0.06
Nodes (59): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), detectKind(), FileKind, FTYP_BRANDS, has() (+51 more)

### Community 35 - "Developer Guide"
Cohesion: 0.10
Nodes (21): A chapter, Build commands, Build internals, Build-time feature flags, Building variants, Contents, Developer Guide, Figures (+13 more)

### Community 36 - "connections/module.ts"
Cohesion: 0.06
Nodes (40): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+32 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.06
Nodes (49): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), accessLog(), appIndexFile(), contextWithTarget(), dropAuthChallenge(), dropSessionCookie() (+41 more)

### Community 39 - "boot.managed.ts"
Cohesion: 0.08
Nodes (30): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+22 more)

### Community 40 - "tls.go"
Cohesion: 0.07
Nodes (13): dialRequest, hostedInfo, parseRelayPath(), safeSegment(), relayPath, rollbackFailedError, sempVpnPage, stepPanic (+5 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (18): Changing the TLS files, auditCall, auditEntry, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+10 more)

### Community 42 - "time.Time"
Cohesion: 0.11
Nodes (19): bucket, clientWatch, newRateWindow(), failures, fakeAfter, loginLimits, rateWindow, expired() (+11 more)

### Community 43 - "loadStore"
Cohesion: 0.13
Nodes (25): TestAudit_ReopenFailureLosesTheRecordLoudly(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), TestRecoverPanics_LetsAbortHandlerThrough(), newCapturingLogger(), sealer, adminSeed(), bootstrapUsers(), loadStore() (+17 more)

### Community 44 - "demo-flow.test.ts"
Cohesion: 0.12
Nodes (17): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), scrollPaneOf(), chapters() (+9 more)

### Community 45 - "backup_test.go"
Cohesion: 0.12
Nodes (29): diffByName(), mergeByName(), sameRecord(), sessionEnders(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffIgnoresRev() (+21 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "connection-management/module.ts"
Cohesion: 0.05
Nodes (39): Code Conventions, CSS, DOM Access, Error Handling, File Organization, Linting, Logging standard, Modals (+31 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (43): fakeClock, fixed(), newTestAuditor(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup() (+35 more)

### Community 49 - "authPages"
Cohesion: 0.09
Nodes (32): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+24 more)

### Community 50 - "storecrypt_test.go"
Cohesion: 0.16
Nodes (17): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), TestNewSealer_TakesOnlyA32ByteKey() (+9 more)

### Community 52 - "server/index.ts"
Cohesion: 0.14
Nodes (29): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), delay(), RESTART_PAUSE_MS, handleSemp() (+21 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.08
Nodes (29): TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+21 more)

### Community 56 - "backup/module.test.ts"
Cohesion: 0.08
Nodes (34): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+26 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.04
Nodes (62): BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders(), SignInResult (+54 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.15
Nodes (41): commitStep, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers(), crashAfter(), damageTemps() (+33 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "trustHolder"
Cohesion: 0.14
Nodes (9): dialUpstreamTLS(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), standardRoots, newTrustHolder(), TestTrustHolder_ChangesRunTheHooksOnlyWhenSomethingChanged(), TestTrustHolder_StandardRoots(), trustHolder (+1 more)

### Community 62 - "Direct demo (`demo.html`)"
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 63 - "state.ts"
Cohesion: 0.08
Nodes (36): SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+28 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.08
Nodes (84): brokerTarget, connToOutput(), savedUser, TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(), orTLS(), sameConnView(), currentConn() (+76 more)

### Community 66 - "audit_test.go"
Cohesion: 0.21
Nodes (23): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+15 more)

### Community 67 - "runDirectChecks"
Cohesion: 0.16
Nodes (24): basic(), bindQueue(), closeOpened(), directSempPath(), drain(), errorCode(), sempPreflightProblem(), smfPreflightProblem() (+16 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.10
Nodes (27): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, recoverPanics() (+19 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (34): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+26 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "writer"
Cohesion: 0.10
Nodes (9): changedOnDiskError, checksums, clientGoneError, fileSum, refusalError, staleError, writeFailedError, writer (+1 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "session"
Cohesion: 0.19
Nodes (10): activeTicket, session, clearSigninCookie(), setSigninCookie(), TestSigninCookie_Attributes(), withSession(), sessionCtxKey, sessions (+2 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (17): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+9 more)

### Community 78 - "pwaHandler"
Cohesion: 0.13
Nodes (7): adminHandler, hostedHandler, fileResolvable(), setAppPageHeaders(), pwaHandler, recordingResponseWriter, reverseProxy

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
Cohesion: 0.07
Nodes (48): SlideChoice, formatBytes(), CopyMode, DestScope, DestType, applyDestMode(), applyDestPrefill(), applyDestType() (+40 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.10
Nodes (41): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+33 more)

### Community 87 - "createUiEvents"
Cohesion: 0.15
Nodes (8): createUiEvents(), applyFilters(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 88 - "contract.test.ts"
Cohesion: 0.07
Nodes (50): clientUsernameOk(), sempUsernameOk(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+42 more)

### Community 89 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (51): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send() (+43 more)

### Community 90 - "Provisioned Mode"
Cohesion: 0.05
Nodes (37): A lost phone, Administer, Audit settings, Back up and restore, Backups and two-factor, Certificates from the console, Choosing a mode, Configure (+29 more)

### Community 91 - "panel.ts"
Cohesion: 0.06
Nodes (61): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+53 more)

### Community 92 - "keyfile_test.go"
Cohesion: 0.31
Nodes (12): createExclusive(), existingStore(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly() (+4 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "broker/store.ts"
Cohesion: 0.04
Nodes (117): The payload samples queue, PAYLOAD_SAMPLES, PayloadSample, BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS (+109 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (73): Auditing an action, auditLog, connChanges(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+65 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "semp-client.ts"
Cohesion: 0.16
Nodes (20): Factory Pattern, SEMP_PROBE_TIMEOUT_MS, SempContext, buildBrokerUrl(), sempFetch(), createServiceSemp(), connect(), log (+12 more)

### Community 100 - "managed-api.ts"
Cohesion: 0.04
Nodes (71): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), AccountControl, AccountControlOptions, AccountUser (+63 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "user-management/module.ts"
Cohesion: 0.09
Nodes (33): AccessExplanation, AccessLevel, ALWAYS_VISIBLE, explainAccess(), findQueueRow(), findVpnRow(), matchesAny(), matchGlob() (+25 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (29): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+21 more)

### Community 106 - "row-list/index.ts"
Cohesion: 0.12
Nodes (15): Laying out an admin page, AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync() (+7 more)

### Community 107 - "dom.ts"
Cohesion: 0.11
Nodes (11): pickQueue() reusable picker, ConfirmOptions, PickerCache, PickQueueOptions, PickQueueResult, Refs, attachBackdropClose(), setError() (+3 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 111 - "managed-profile.ts"
Cohesion: 0.06
Nodes (24): DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_MAX_MESSAGES_PER_QUEUE, DESTINATION_SDK_CONNECT, MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, ConnectionConfig, ConnectionCredentials, SempConfig (+16 more)

### Community 112 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.07
Nodes (28): account(), activityMock, clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect() (+20 more)

### Community 118 - "vpn-switch.ts"
Cohesion: 0.13
Nodes (18): confirmDialog(), showToast(), TOAST_EVENT, ToastEventDetail, ToastType, createVpnSwitch(), connectTo(), fail() (+10 more)

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.05
Nodes (45): BackupModule, ConnectionManagementModule, QueueCopyModule, TlsCertificatesModule, UserManagementModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS (+37 more)

### Community 120 - "configfile_test.go"
Cohesion: 0.04
Nodes (102): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), checkAuditOnFailure(), flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys() (+94 more)

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "newCapturingLogger"
Cohesion: 0.07
Nodes (54): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+46 more)

### Community 123 - "tls-certificates/module.test.ts"
Cohesion: 0.16
Nodes (20): ADMIN, answer(), CA(), cert(), click(), el(), flush(), hidden() (+12 more)

### Community 124 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 125 - "user-management/module.test.ts"
Cohesion: 0.16
Nodes (17): ADMIN, CHOICES, chooseForUser(), clickRow(), el(), hidden(), listed(), makeCtx() (+9 more)

### Community 127 - "main_test.go"
Cohesion: 0.10
Nodes (46): acceptWatch, envOr(), loadConfig(), newRootHandler(), expectLogged(), gatewayClient(), gatewayDir(), route() (+38 more)

### Community 131 - "vitest"
Cohesion: 0.05
Nodes (62): Circular Dependency Resolution, solaceErrorText(), icons, MAX_BROWSER_BINDINGS, MAX_STORED_BYTES_PER_QUEUE, showPayload(), log, QueueBrowserModule (+54 more)

### Community 132 - "ui-modal.ts"
Cohesion: 0.19
Nodes (18): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), canOperate(), isQueueVisible(), isVpnVisible() (+10 more)

### Community 136 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 137 - "User Guide"
Cohesion: 0.09
Nodes (22): Adding a connection, Client (messaging), Conn. Mgmt, Contents, Deleting a connection, Editing a connection, Examples, Finding a connection (+14 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (34): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+26 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.08
Nodes (19): auditCategory, auditor, newDialer(), dialer, gatedWriter, live, liveSettings, buildManagedRoutes() (+11 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (58): connName(), TestBackup_SharedVector(), userName(), clientRec, connRec, connsDoc, newContractEnv(), TestContract_Validation() (+50 more)

### Community 155 - "session-activity.ts"
Cohesion: 0.20
Nodes (12): createSessionActivity(), onInput(), send(), INPUTS, KEEPALIVE_INTERVAL_MS, keepSessionAlive(), SessionActivity, SessionActivityOptions (+4 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.13
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "smf_test.go"
Cohesion: 0.09
Nodes (35): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+27 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "quietLogger"
Cohesion: 0.27
Nodes (18): newReverseProxy(), newUpstreamTransport(), TestNewUpstreamTransport_VerifiesThroughTheTrustHolder(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip(), TestReverseProxy_KeepsAnEncodedSlashInAName(), TestReverseProxy_NeverForwardsTheSessionCookie(), TestReverseProxy_UpstreamCannotSetTheSessionCookie() (+10 more)

### Community 161 - "connection-management/module.test.ts"
Cohesion: 0.19
Nodes (16): NO_VPNS, ADMIN, CONNS, el(), hidden(), makeCtx(), saveAppliance(), saved() (+8 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "backup_api.go"
Cohesion: 0.23
Nodes (11): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+3 more)

### Community 165 - "solace-client.ts"
Cohesion: 0.13
Nodes (16): gatewayWsUrl(), CONNECT_IN_PROGRESS, ConnectStart, createServiceSolace(), cleanup(), connect(), disconnect(), disposeSession() (+8 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (17): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+9 more)

### Community 167 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 169 - "picker.test.ts"
Cohesion: 0.20
Nodes (3): src(), tailSource(), listing()

### Community 170 - "tls-certificates/module.ts"
Cohesion: 0.11
Nodes (21): formatUtc(), EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesOptions (+13 more)

### Community 172 - "Key Concepts"
Cohesion: 0.40
Nodes (4): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Key Concepts, The Module Contract

### Community 173 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 174 - "testing.T"
Cohesion: 0.08
Nodes (59): TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), TestModuleSettings_ForUser(), assertNoTempFiles(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode(), expect() (+51 more)

### Community 175 - "queue-copy/service.ts"
Cohesion: 0.60
Nodes (3): destNameProblem(), getOriginalIdHint(), RESERVED_PREFIXES

### Community 176 - "contract_test.go"
Cohesion: 0.09
Nodes (28): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+20 more)

### Community 177 - "Administration"
Cohesion: 0.11
Nodes (19): A password that must be changed first, Administration, Confirm dialogs, Finding your way around, Messages about the gateway's files, Other messages, Row buttons and rows of boxes, Saving at the same time as another administrator (+11 more)

### Community 178 - "Backup & Restore"
Cohesion: 0.11
Nodes (19): Any action, Backup & Restore, Export and import, Exporting a backup, Refusals and messages, Removing the schedule, Restoring from a file, Running a backup now (+11 more)

### Community 179 - "Queue Copy"
Cohesion: 0.11
Nodes (19): Before you move messages, Copy or Move, How a run ends, How the check works, Picking a queue, Queue Copy, Running a copy or a move, Starting (+11 more)

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

### Community 189 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 190 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 195 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 196 - "issueCert"
Cohesion: 0.18
Nodes (12): aliasLookup(), checkedAlias(), keyLine(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule() (+4 more)

### Community 197 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 198 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 199 - "Kernel.installModule"
Cohesion: 0.13
Nodes (14): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+6 more)

### Community 200 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **114 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1362 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed-api.ts`, `managed.go`, `writer`, `net/http.ResponseWriter`, `backup_test.go`, `log/slog.Logger`, `configfile_test.go`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `queue-subscription-explorer/service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08305647840531562 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `user-management/module.ts`, `writer_test.go`, `vpn-switch.ts`, `connection-management/module.ts`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 83 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 83 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._