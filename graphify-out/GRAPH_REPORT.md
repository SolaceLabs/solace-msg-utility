# Graph Report - smu-dirty  (2026-11-19)

## Corpus Check
- 364 files · ~737,607 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5288 nodes · 17293 edges · 184 communities (151 shown, 33 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2369 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6a3d3d9b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- quietLogger
- createManagedPanel
- .saveUser
- createGateway
- semp-client Test Suite
- Architecture
- backup.go
- core event-bus
- notification-center/index.ts
- state.ts
- managed-api.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- loadModuleDOM
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- audit_test.go
- connections/module.test.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- message.ts
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
- router.ts
- loadStore
- contract.test.ts
- ui.selectMessage
- quietLogger
- fileutil_test.go
- authPages
- tls.ts
- queue-discovery index.html
- backup/module.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- access-test.ts
- gateway/index.ts
- Developer Guide
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- queue-source.ts
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- panel.ts
- session
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- relay_test.go
- Administration (`/solAdmin`)
- module-registry-plugin.mjs
- writeError
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- journal
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- testing.T
- Queue Browser Internal Architecture
- queue-subscription-explorer/service.ts
- CSS Organization
- checksums
- configfile_test.go
- SempContext
- keyfile.go
- session.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- ui-modal.ts
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- gateway-settings/module.ts
- dest-provisioned.test.ts
- initDetails
- Deployment Options
- broker/store.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- settings.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- utils.ts
- storecrypt_test.go
- user-management/service.ts
- createPages
- tls_api.go
- solace-publisher.ts
- run
- socketRegistry
- queue-subscription-explorer parse
- tls_api_test.go
- tests core/event-bus
- tests core/hosted
- tests core/logger
- vitest
- newManagedHandler
- solace-message-utility (package)
- ui.openSslModal
- queue-browser service-events Test Suite
- Module Isolation
- queue-copy/module.ts
- backup_api_test.go
- trustHolder
- managed-api.ts
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
- Two-factor sign-in
- vite-build.mjs
- QueueSource
- queue-discovery ui.js
- ConnectionsModule Test Suite
- connection-management/service.ts
- issueCert
- net.Conn
- queue-copy/service.ts
- User Guide
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- csp.mjs
- End-to-end run
- settings_test.go
- newCapturingLogger
- provisioned-connection/index.ts
- tls_test.go
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- compose.ts
- Setup
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- checkedAlias

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 181 edges
2. `vitest` - 126 edges
3. `quietLogger()` - 102 edges
4. `store` - 96 edges
5. `AppContext` - 71 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 68 edges
8. `loadModuleDOM()` - 64 edges
9. `runChecks()` - 62 edges
10. `createEventBus()` - 54 edges

## Surprising Connections (you probably didn't know these)
- `What applies at once` --references--> `standardRoots`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/tls.go
- `Stored files and recovery` --references--> `txn`  [INFERRED]
  docs/provisioned-mode.md → go-web-proxy/writer.go
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

## Communities (184 total, 33 thin omitted)

### Community 0 - "quietLogger"
Cohesion: 0.15
Nodes (25): serveUntilStopped(), dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400() (+17 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.06
Nodes (60): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+52 more)

### Community 2 - ".saveUser"
Cohesion: 0.26
Nodes (6): Writing to the store, checkRev(), countAdmins(), TestStore_ReplacedConnectionsFileRefusesItsWrites(), txn, newStale()

### Community 3 - "createGateway"
Cohesion: 0.08
Nodes (49): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), mockCode() (+41 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup.go"
Cohesion: 0.06
Nodes (31): backupName(), connName(), diffByName(), fileOfSchedule(), flattenSettings(), mergeByName(), monthSlot(), newBackupService() (+23 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "state.ts"
Cohesion: 0.07
Nodes (42): SolacePublisher, escapeXml(), solaceErrorText(), deleteMessages(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH (+34 more)

### Community 10 - "managed-api.ts"
Cohesion: 0.05
Nodes (60): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, SempConfig (+52 more)

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

### Community 16 - "loadModuleDOM"
Cohesion: 0.06
Nodes (40): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests (+32 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.13
Nodes (31): TestSettings_TheCallerIsCheckedAgainWhenTheLockIsHeld(), wfix, classifyStoreError(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestStoreErrors_UnwrapToTheirCause() (+23 more)

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

### Community 23 - "audit_test.go"
Cohesion: 0.19
Nodes (24): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+16 more)

### Community 24 - "connections/module.test.ts"
Cohesion: 0.07
Nodes (26): Solace mock, ConnectionConfig, ConnectionCredentials, config, SWITCH_CONNECT_TIMEOUT_MS, SWITCH_DISCONNECT_TIMEOUT_MS, tests main, createConnectionsDOM() (+18 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (86): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+78 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (97): Event Handling, Integration tests, Module tests, vitest, QueuePicker, DeploymentConfig, createEventBus(), createManagedProfile() (+89 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): basic(), bcheck(), bindInQueueBrowser(), bindQueue(), broker, brokerSecrets, check(), closers (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (56): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing(), base32Decode() (+48 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "message.ts"
Cohesion: 0.06
Nodes (47): PAYLOAD_SAMPLES, PayloadSample, buildMessage(), buildSample(), publish(), AuthenticationScheme, DestinationType, LogLevel (+39 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.06
Nodes (44): EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesModule (+36 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.09
Nodes (29): QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+21 more)

### Community 34 - "backup.go"
Cohesion: 0.03
Nodes (65): auditCategory, changedOnDiskError, clientCtxKey, clientGoneError, checkJournalName(), journalTargetNames(), parseTxn(), recoverDir() (+57 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.07
Nodes (40): boot(), DEFAULT_LOG_LEVEL, LogLevel, DEBUG, ERROR, INFO, SILENT, WARN (+32 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.08
Nodes (42): validateConnModes(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie(), firstSegment(), isProxyPath(), joinHostPort() (+34 more)

### Community 39 - "contract_test.go"
Cohesion: 0.07
Nodes (34): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+26 more)

### Community 40 - "tlsManager"
Cohesion: 0.08
Nodes (21): browserKeyProblem(), parseCertificatePEM(), parseKeyPEM(), pemCertificates(), probeWritable(), readableName(), TestBrowserKeyProblem(), TestProbeWritable() (+13 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (17): auditCall, auditEntry, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+9 more)

### Community 42 - "time.Time"
Cohesion: 0.10
Nodes (20): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientWatch, failures, fakeAfter (+12 more)

### Community 43 - "router.ts"
Cohesion: 0.12
Nodes (37): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+29 more)

### Community 44 - "loadStore"
Cohesion: 0.14
Nodes (22): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), sealer, adminSeed(), bootstrapUsers(), loadStore(), bootstrapFixture(), envOf(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged() (+14 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.07
Nodes (44): connsProblem(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+36 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "quietLogger"
Cohesion: 0.14
Nodes (44): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+36 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.17
Nodes (39): commitStep, commitJournal(), newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter() (+31 more)

### Community 49 - "authPages"
Cohesion: 0.09
Nodes (31): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+23 more)

### Community 50 - "tls.ts"
Cohesion: 0.08
Nodes (35): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+27 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+40 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.05
Nodes (68): MANAGED_ERROR_CODES, seed(), delay(), Fault, MOCK_HOST, QUEUE_STATE, resetScenario(), scenario (+60 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.09
Nodes (29): QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+21 more)

### Community 56 - "access-test.ts"
Cohesion: 0.15
Nodes (15): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+7 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.06
Nodes (41): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+33 more)

### Community 58 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 59 - "Testing"
Cohesion: 0.17
Nodes (12): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Running the tests, Testing, Thresholds and floors (+4 more)

### Community 60 - "queue-discovery module"
Cohesion: 0.29
Nodes (8): queue-copy ui, queue-copy ui-modal, queue-discovery module, queue-discovery service, queue-discovery ui, queue-subscription-explorer module, queue-subscription-explorer ui, tests core/dom

### Community 61 - "Forward Message Dialog Screenshot"
Cohesion: 0.18
Nodes (10): Cancel Button, Close (X) Button, Destination Name Input Field, Destination Type Selector (Topic/Queue), Forward Message Modal Dialog, Per-Message Preview Row (id + payload snippet), Messages to Forward List (11 selected), Forward Message Dialog Screenshot (+2 more)

### Community 62 - "queue-source.ts"
Cohesion: 0.10
Nodes (29): ProvisionedTarget, canOperate(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom() (+21 more)

### Community 63 - "Provisioned Mode"
Cohesion: 0.12
Nodes (17): Administer, Audit settings, Back up and restore, Configure, Connection modes, Contents, Environment variables, How it works (+9 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (72): currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures(), putConn() (+64 more)

### Community 66 - "panel.ts"
Cohesion: 0.10
Nodes (38): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+30 more)

### Community 67 - "session"
Cohesion: 0.17
Nodes (11): activeTicket, session, clearSigninCookie(), setSigninCookie(), TestSessionOf_ContextRoundTrip(), TestSigninCookie_Attributes(), withSession(), sessionCtxKey (+3 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.14
Nodes (23): bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connChanges(), connectionNamed() (+15 more)

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
Cohesion: 0.12
Nodes (30): getQueue(), MAX_PREVIEW_PIXELS, attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), contentFileName() (+22 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "relay_test.go"
Cohesion: 0.11
Nodes (24): errReader, fakeBroker, gatedWriter, rawExchange(), TestLoginPost_ABodyThatStopsArrivingIsRefusedAtTheDeadline(), isShowRPC(), answerJSON(), newRelayEnv() (+16 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "module-registry-plugin.mjs"
Cohesion: 0.25
Nodes (13): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readVariant(), stripComments() (+5 more)

### Community 78 - "writeError"
Cohesion: 0.07
Nodes (29): setForwarded(), newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, bodyDeadline() (+21 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "journal"
Cohesion: 0.14
Nodes (8): Layout of tests, syncDir(), TestSyncDir_ReportsAMissingDirectory(), writeTemp(), journal, atomicWrite(), TestAtomicWrite(), tlsSeams

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.13
Nodes (15): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+7 more)

### Community 86 - "testing.T"
Cohesion: 0.07
Nodes (72): newBackupKey(), openBackup(), sealBackup(), backupFixtureFrom(), envelope(), mustSealer(), newBackupFixture(), reseal() (+64 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "queue-subscription-explorer/service.ts"
Cohesion: 0.12
Nodes (26): visibleQueueRows(), createSempDiscovery(), fetchPaged(), fetchQueues(), fetchVpns(), sempFailureText(), unfilteredPrimarySempContext(), createService() (+18 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 91 - "configfile_test.go"
Cohesion: 0.05
Nodes (94): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), checkAuditOnFailure(), config, checkModuleIDs(), checkRenamedEnv(), configVerifier(), decodeConfigFile() (+86 more)

### Community 92 - "SempContext"
Cohesion: 0.06
Nodes (26): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, createService (subscription-explorer) (+18 more)

### Community 93 - "keyfile.go"
Cohesion: 0.22
Nodes (14): partialName(), createExclusive(), existingStore(), loadStoreKey(), ownershipHint(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+6 more)

### Community 94 - "session.ts"
Cohesion: 0.09
Nodes (20): createEmitter(), MockEmitter, DIRECT_BROKER, createQueueBrowser(), interval(), pump(), MockQueueBrowser, QueueBrowserEventName (+12 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.09
Nodes (79): Auditing an action, auditLog, TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), changeUsersBehindTheWriter(), connsWrote(), managedEnv (+71 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "ui-modal.ts"
Cohesion: 0.11
Nodes (28): filterSempFetch(), isListedVpn(), rowField(), SempFetch, AccessExplanation, ALWAYS_VISIBLE, explainAccess(), findQueueRow() (+20 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "gateway-settings/module.ts"
Cohesion: 0.18
Nodes (16): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), pressed() (+8 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (25): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+17 more)

### Community 106 - "initDetails"
Cohesion: 0.12
Nodes (29): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, hexDump(), imageSize(), JPEG_SOF (+21 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "broker/store.ts"
Cohesion: 0.12
Nodes (35): allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), key(), listQueues(), listVpns() (+27 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.05
Nodes (24): Gateway contract cases, adminHandler, apiError, auditor, configSource, hostedHandler, live, recoverPanics() (+16 more)

### Community 112 - "settings.ts"
Cohesion: 0.11
Nodes (27): cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups(), ipv6String() (+19 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+14 more)

### Community 118 - "utils.ts"
Cohesion: 0.03
Nodes (79): Adding a New Module, DOM Access, Laying out an admin page, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE (+71 more)

### Community 119 - "storecrypt_test.go"
Cohesion: 0.17
Nodes (17): newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev(), testSealer() (+9 more)

### Community 120 - "user-management/service.ts"
Cohesion: 0.36
Nodes (5): createUserMgmtService(), UserList, userPath(), UserPayload, PAYLOAD

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "tls_api.go"
Cohesion: 0.33
Nodes (5): clip(), TestClip(), tlsCertAnswerJSON, tlsPairJSON, tlsTrustAddJSON

### Community 123 - "solace-publisher.ts"
Cohesion: 0.15
Nodes (13): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+5 more)

### Community 124 - "run"
Cohesion: 0.19
Nodes (16): abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets(), loadPlaywright() (+8 more)

### Community 125 - "socketRegistry"
Cohesion: 0.21
Nodes (8): openSocket, socketRegistry, newSocketRegistry(), TestNewSocketRegistry_StartsAtTheCeilings(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked(), TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed()

### Community 127 - "tls_api_test.go"
Cohesion: 0.22
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+14 more)

### Community 131 - "vitest"
Cohesion: 0.04
Nodes (67): Circular Dependency Resolution, DEFAULT_MAX_MESSAGES_PER_QUEUE, escapeHtml(), icons, MAX_BROWSER_BINDINGS, MAX_STORED_BYTES_PER_QUEUE, showPayload(), log (+59 more)

### Community 132 - "newManagedHandler"
Cohesion: 0.28
Nodes (5): Changing the TLS files, Gateway and Admin How-tos, auditPre, fixedAction(), newManagedHandler()

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (43): DESTINATION_SDK_CONNECT, formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets() (+35 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.13
Nodes (40): Build internals, Broker details, decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody() (+32 more)

### Community 139 - "trustHolder"
Cohesion: 0.16
Nodes (6): certHolder, standardRoots, newCertHolder(), newTLSManager(), trustHolder, trustState

### Community 140 - "managed-api.ts"
Cohesion: 0.05
Nodes (59): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+51 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.07
Nodes (36): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+28 more)

### Community 148 - "go_pkg_strings"
Cohesion: 0.08
Nodes (52): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+44 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (52): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), TestContract_Validation(), contractStores (+44 more)

### Community 155 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "QueueSource"
Cohesion: 0.22
Nodes (7): AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, State, QueueSource

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 161 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 162 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 163 - "queue-copy/service.ts"
Cohesion: 0.60
Nodes (3): destNameProblem(), getOriginalIdHint(), RESERVED_PREFIXES

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 171 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 172 - "End-to-end run"
Cohesion: 0.17
Nodes (12): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, End-to-end run, Requirements (+4 more)

### Community 174 - "settings_test.go"
Cohesion: 0.15
Nodes (31): logLine(), saveAnswer, decodeSave(), managedEnv, mustRead(), TestSettings_AccessListThatAdmitsTheAdmin(), TestSettings_AFileThatIsGoneIsAChangeOnDisk(), TestSettings_AHandEditIsFoundAtWriteTimeAndStaysRefused() (+23 more)

### Community 176 - "newCapturingLogger"
Cohesion: 0.09
Nodes (27): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), hostedHandler (/hosted endpoint), pwaHandler (SPA static + fallback), reverseProxy (transparent upstream), targetURLKey context value, appendPEMCerts() (+19 more)

### Community 177 - "provisioned-connection/index.ts"
Cohesion: 0.08
Nodes (14): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+6 more)

### Community 178 - "tls_test.go"
Cohesion: 0.12
Nodes (47): testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), loadStandardRoots(), equalCertJSON(), fingerprintOf(), keyBodyLine() (+39 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.11
Nodes (37): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+29 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.08
Nodes (55): acceptWatch, boolEnv(), envOr(), loadConfig(), main(), newRootHandler(), parseStrictBool(), printVersionIfRequested() (+47 more)

### Community 188 - "Setup"
Cohesion: 0.40
Nodes (5): Build commands, Build-time feature flags, Building variants, Maintaining dependencies, Setup

### Community 192 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 193 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 194 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 195 - "checkedAlias"
Cohesion: 0.15
Nodes (14): aliasLookup(), askLine(), askSecret(), checkedAlias(), collectDetails(), aliasAddress(), detailsFileText(), dnsRule() (+6 more)

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1256 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **33 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `.saveUser` to `store_test.go`, `newManagedHandler`, `managed.go`, `store`, `net/http.ResponseWriter`, `log/slog.Logger`, `writer_test.go`, `utils.ts`, `checksums`, `newManagedEnv`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Are the 125 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 125 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createManagedPanel` be split into smaller, more focused modules?**
  _Cohesion score 0.06140350877192982 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `utils.ts` to `.saveUser`, `backup/module.ts`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Are the 84 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 84 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._