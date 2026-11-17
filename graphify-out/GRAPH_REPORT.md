# Graph Report - smu-dirty  (2026-11-18)

## Corpus Check
- 363 files · ~723,811 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5226 nodes · 17082 edges · 179 communities (141 shown, 38 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2338 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6395e2e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings.ts
- createManagedPanel
- createGateway
- connections/module.test.ts
- semp-client Test Suite
- Architecture
- backup.go
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
- managed-panel.ts
- managed-api.ts
- pages_test.go
- vitest
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
- log/slog.Logger
- net/http.ResponseWriter
- time.Time
- tls.ts
- newCapturingLogger
- panel.ts
- ui.selectMessage
- audit_test.go
- fileutil_test.go
- authPages
- queue-picker/index.ts
- queue-discovery index.html
- trustHolder
- context.Context
- gateway/index.ts
- tests variants
- ui-modal.ts
- routes.test.ts
- relay_test.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- queue-copy/ui-events.test.ts
- showToast
- Managed Variant (RBAC)
- store_test.go
- access_test.go
- session
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- backup_api.go
- Administration (`/solAdmin`)
- broker/store.ts
- socketRegistry
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- keyfile_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- go_pkg_encoding_json
- Queue Browser Internal Architecture
- user-management/module.test.ts
- CSS Organization
- checksums
- configfile_test.go
- Kernel.installModule
- Setup
- secret
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totp_test.go
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- backup/module.ts
- Provisioned Mode
- ui-modal.test.ts
- Deployment Options
- Certificates from the console
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- RowList
- parseSetCookie
- MockEmitter
- createPages
- semp-client.ts
- testHasher
- Developer Guide
- auditMissing
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- loadModuleDOM
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
- solace-publisher.ts
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- pwaHandler
- vite-build.mjs
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- live
- User Guide
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- main
- Writing tests
- End-to-end run
- csp.mjs
- settings_test.go
- queue-copy/ui-events.ts
- tls_test.go
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

## Communities (179 total, 38 thin omitted)

### Community 0 - "settings.ts"
Cohesion: 0.07
Nodes (51): connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS (+43 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.10
Nodes (35): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines(), PART_LABEL (+27 more)

### Community 2 - "createGateway"
Cohesion: 0.05
Nodes (65): QueueFixture, acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+57 more)

### Community 3 - "connections/module.test.ts"
Cohesion: 0.07
Nodes (19): MAX_MESSAGES_PER_QUEUE, ConnectionConfig, ConnectionCredentials, TaggedLogger, config, SWITCH_CONNECT_TIMEOUT_MS, SWITCH_DISCONNECT_TIMEOUT_MS, VpnSwitch (+11 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.07
Nodes (19): Access-type capture (gate for Copy and Move), Architecture, code:block1 (+-----------------------------------------------------------), code:block10 (Solace Broker), code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle (+11 more)

### Community 6 - "backup.go"
Cohesion: 0.08
Nodes (25): backupName(), connName(), diffByName(), flattenSettings(), newBackupService(), partialName(), sameRecord(), sealBackup() (+17 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (25): clock(), createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log (+17 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (25): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+17 more)

### Community 10 - "quietLogger"
Cohesion: 0.14
Nodes (46): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+38 more)

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
Cohesion: 0.09
Nodes (46): newBackupKey(), openBackup(), backupFixtureFrom(), envelope(), mustSealer(), newBackupFixture(), reseal(), sampleBackup() (+38 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.13
Nodes (32): TestStageSettings_RefusalsComeBackAsErrors(), wfix, classifyStoreError(), newStale(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler() (+24 more)

### Community 19 - "ManagedResult"
Cohesion: 0.12
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "managed-panel.ts"
Cohesion: 0.04
Nodes (40): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), DEFAULT_MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SempConfig, SolaceConfig (+32 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (77): Adding a New Module, DOM Access, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage() (+69 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (83): usersWrote(), newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect() (+75 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (83): Event Handling, Integration tests, Module tests, vitest, createEventBus(), INPUT_DEBOUNCE_MS, AppContext, AppState (+75 more)

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
Nodes (104): The payload samples queue, PAYLOAD_SAMPLES, allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, dumpStore(), findQueueAnyVpn() (+96 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.07
Nodes (43): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList(), TlsCertificatesModule (+35 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (73): BACKUP_ITER, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser() (+65 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.09
Nodes (30): QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+22 more)

### Community 34 - "backup.go"
Cohesion: 0.05
Nodes (35): auditCategory, changedOnDiskError, smfPathFor(), dialRequest, TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), pagePolicy(), TestPagePolicy_StyleBlockOrNone() (+27 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.05
Nodes (39): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL, LogLevel (+31 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.04
Nodes (82): TestAudit_ReopenFailureLosesTheRecordLoudly(), hostedInfo, newLive(), liveWith(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), TestRecoverPanics_LetsAbortHandlerThrough(), TestRecoverPanics_LogsAndAnswers500(), go-web-proxy main (gateway entrypoint) (+74 more)

### Community 39 - "contract_test.go"
Cohesion: 0.12
Nodes (23): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+15 more)

### Community 40 - "log/slog.Logger"
Cohesion: 0.07
Nodes (23): certHolder, browserKeyProblem(), newCertHolder(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName() (+15 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (17): auditCall, auditEntry, auditWriter, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+9 more)

### Community 42 - "time.Time"
Cohesion: 0.13
Nodes (18): monthSlot(), nextRun(), backupSchedule, bucket, clientWatch, newRateWindow(), failures, fakeAfter (+10 more)

### Community 43 - "tls.ts"
Cohesion: 0.08
Nodes (32): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+24 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.14
Nodes (23): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged() (+15 more)

### Community 45 - "panel.ts"
Cohesion: 0.12
Nodes (33): ManagedDemo, authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button() (+25 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.18
Nodes (24): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+16 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (53): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+45 more)

### Community 49 - "authPages"
Cohesion: 0.10
Nodes (25): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+17 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (27): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+19 more)

### Community 52 - "trustHolder"
Cohesion: 0.12
Nodes (21): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+13 more)

### Community 53 - "context.Context"
Cohesion: 0.20
Nodes (9): fileOfSchedule(), mergeByName(), sessionEnders(), TestBackup_DiffMergeAndSessionEnders(), TestBackupService_LoadRefusesADamagedSchedule(), checkRev(), countAdmins(), recoveryIndex() (+1 more)

### Community 54 - "gateway/index.ts"
Cohesion: 0.04
Nodes (94): DialResponse, QGlob, TwoFactorMode, BackupDeps, BackupDoc, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult (+86 more)

### Community 56 - "ui-modal.ts"
Cohesion: 0.17
Nodes (18): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, ALWAYS_VISIBLE, explainAccess() (+10 more)

### Community 57 - "routes.test.ts"
Cohesion: 0.05
Nodes (34): MANAGED_ERROR_CODES, createThrottle(), Failures, LoginLimits, retrySeconds(), bundleSources(), productSources(), REPO_ROOT (+26 more)

### Community 58 - "relay_test.go"
Cohesion: 0.12
Nodes (22): errReader, fakeBroker, gatedWriter, isShowRPC(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+14 more)

### Community 59 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "queue-copy/ui-events.test.ts"
Cohesion: 0.18
Nodes (20): Solace mock, syncDestFormFromSnapshot(), cacheElements(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned() (+12 more)

### Community 63 - "showToast"
Cohesion: 0.09
Nodes (20): showToast(), createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+12 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (75): TestBackupService_ExportAndImportRoundTripTwoFactor(), savedConn, savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash() (+67 more)

### Community 66 - "access_test.go"
Cohesion: 0.24
Nodes (18): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+10 more)

### Community 67 - "session"
Cohesion: 0.16
Nodes (12): activeTicket, session, clearSigninCookie(), expired(), setSigninCookie(), TestSessionOf_ContextRoundTrip(), TestSigninCookie_Attributes(), withSession() (+4 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (30): Changing the TLS files, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON (+22 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.10
Nodes (14): Architecture Notes, Code Standards, code:bash (npm install && npm test), code:ts (import { required } from '../../core/dom';), Contributing, Development Workflow, DOM Access, Error Handling (+6 more)

### Community 73 - "file-kind.ts"
Cohesion: 0.07
Nodes (47): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+39 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "backup_api.go"
Cohesion: 0.23
Nodes (10): backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON, importSourceJSON (+2 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.07
Nodes (40): PayloadSample, buildMessage(), buildSample(), AuthenticationScheme, LogLevel, MessageDeliveryModeType, MessagePublisherAcknowledgeMode, MessageType (+32 more)

### Community 78 - "socketRegistry"
Cohesion: 0.21
Nodes (8): openSocket, socketRegistry, newSocketRegistry(), TestNewSocketRegistry_StartsAtTheCeilings(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked(), TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed()

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
Cohesion: 0.14
Nodes (14): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+6 more)

### Community 86 - "go_pkg_encoding_json"
Cohesion: 0.26
Nodes (9): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+1 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "user-management/module.test.ts"
Cohesion: 0.14
Nodes (17): NO_OPERATE, NO_READ_ONLY, ADMIN, answerSignOut(), CHOICES, clickRow(), el(), hidden() (+9 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 91 - "configfile_test.go"
Cohesion: 0.04
Nodes (108): Adding a gateway config.yaml setting, Gateway and Admin How-tos, Writing a config.yaml by hand (development only), checkAuditOnFailure(), auditSettings, TestBackup_SettingsChangesNamesDottedKeys(), config, boolEnv() (+100 more)

### Community 92 - "Kernel.installModule"
Cohesion: 0.29
Nodes (4): Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start()

### Community 93 - "Setup"
Cohesion: 0.29
Nodes (7): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, up()

### Community 95 - "newManagedEnv"
Cohesion: 0.08
Nodes (84): Auditing an action, auditLog, TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), changeUsersBehindTheWriter() (+76 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.10
Nodes (30): checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret() (+22 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (26): Security model, What it does not enforce, What the gateway enforces, deadHijacker, fakeAnswer, fakeSMFBroker, pipe(), newFakeSMFBroker() (+18 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+40 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.05
Nodes (66): canOperate(), SolacePublisher, escapeXml(), solaceErrorText(), rbacReadOnly(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS (+58 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "Certificates from the console"
Cohesion: 0.40
Nodes (5): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, What applies at once

### Community 111 - "log/slog.Logger"
Cohesion: 0.07
Nodes (28): auditor, newDialer(), dialer, clientLogger(), clientString(), recoverPanics(), requestLogger(), requestUser() (+20 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.21
Nodes (15): ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx(), pressed(), SETTINGS (+7 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.31
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 119 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "semp-client.ts"
Cohesion: 0.07
Nodes (45): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+37 more)

### Community 123 - "testHasher"
Cohesion: 0.14
Nodes (16): hasher, checkPassphrase(), checkPasswordPolicy(), newHasher(), parsePasswordHash(), passwordRuleError(), TestCheckPassphrase_FixedRule(), TestCheckPasswordPolicy() (+8 more)

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
Cohesion: 0.05
Nodes (80): Circular Dependency Resolution, Laying out an admin page, escapeHtml(), icons, MAX_BROWSER_BINDINGS, showPayload(), hexDump(), log (+72 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DEST_TARGET_LOCKED_TITLE (+34 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.15
Nodes (35): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+27 more)

### Community 140 - "connections/module.ts"
Cohesion: 0.05
Nodes (67): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, DeploymentConfig (+59 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (29): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+21 more)

### Community 148 - "solace-publisher.ts"
Cohesion: 0.09
Nodes (27): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+19 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.07
Nodes (48): Writing to the store, slicesIndexUser(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), contractStores (+40 more)

### Community 155 - "pwaHandler"
Cohesion: 0.12
Nodes (8): adminHandler, hostedHandler, setAppPageHeaders(), pwaHandler, recordingResponseWriter, headerHasToken(), isWebSocketUpgrade(), writeSwitch()

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 165 - "live"
Cohesion: 0.10
Nodes (20): clientACL(), clientIP(), normalizeAddr(), prefixContains(), withClient(), apiError, clientCtxKey, live (+12 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "main"
Cohesion: 0.09
Nodes (27): playwright-core, aliasLookup(), askLine(), askSecret(), browserOn(), checkedAlias(), collectDetails(), COMPOSE (+19 more)

### Community 171 - "Writing tests"
Cohesion: 0.22
Nodes (8): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests

### Community 172 - "End-to-end run"
Cohesion: 0.20
Nodes (9): Audit trail, Restart gateway, Broker details, End-to-end run, Requirements, The checks, What it changes, What it does (+1 more)

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.14
Nodes (39): assertNoTempFiles(), logLine(), rawExchange(), shortBodyDeadline(), TestDecodeJSON_WaitsForTheBodyOnlyUntilTheDeadline(), TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline(), saveAnswer, decodeSave() (+31 more)

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.07
Nodes (28): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+20 more)

### Community 178 - "tls_test.go"
Cohesion: 0.07
Nodes (75): TestSweepLeftovers_ADataDirectoryThatIsAFile(), TestSweepLeftovers_ALeftoverThatCannotBeRemovedIsLoggedNotFatal(), writeFile(), newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory() (+67 more)

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
Cohesion: 0.10
Nodes (43): acceptWatch, newRootHandler(), expectLogged(), gatewayClient(), gatewayDir(), route(), startServe(), stubHandler() (+35 more)

### Community 189 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 190 - "Two-factor sign-in"
Cohesion: 0.20
Nodes (10): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+2 more)

### Community 195 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1236 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `live`, `managed.go`, `net/http.ResponseWriter`, `writer_test.go`, `context.Context`, `managed-api.ts`, `checksums`, `configfile_test.go`, `newManagedEnv`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06766917293233082 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `store`, `showToast`?**
  _High betweenness centrality (0.153) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._