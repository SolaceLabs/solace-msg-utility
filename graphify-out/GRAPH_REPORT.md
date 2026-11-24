# Graph Report - smu-dirty  (2026-11-24)

## Corpus Check
- 373 files · ~831,189 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 33 file(s) not represented in the graph (top: .css 25, (none) 7, .dockerignore 1)

## Summary
- 5594 nodes · 17848 edges · 199 communities (161 shown, 38 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2361 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `34fb5883`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- backup.go
- createManagedPanel
- writeFile
- two-factor.test.ts
- semp-client Test Suite
- Architecture
- broker/store.ts
- core event-bus
- writeFile
- writeError
- queue-source.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- required
- scripts
- writer_test.go
- managed-api.ts
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
- row-list/index.ts
- managedRequest
- backup.ts
- session
- samples.test.ts
- Filter Messages Dialog
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- proxy_test.go
- backupService
- tls.go
- net/http.ResponseWriter
- time.Time
- loadStore
- quietLogger
- router.ts
- ui.selectMessage
- session.ts
- newFakeClock
- authPages
- logging.go
- queue-discovery index.html
- ui-modal.test.ts
- gateway-settings/module.test.ts
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
- connection-management/module.test.ts
- createQueuePicker
- DOM Template System
- Cross-Module Event Flow
- queue-copy/module.ts
- Kernel Test Suite
- ManagedResult
- Solace Client Service
- mustHash
- Queue Browser Internal Architecture
- contract.test.ts
- CSS Organization
- tls_api_test.go
- createGateway
- newManagedHandler
- manual-to-md.mjs
- message.ts
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- dial.go
- backup/service.ts
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- backup_api.go
- dest-provisioned.test.ts
- relay.ts
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
- request
- demo-flow.test.ts
- configfile.go
- createPages
- socketRegistry
- checksums
- rbac.ts
- user-management/module.test.ts
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
- createUiEvents
- settingsFile
- entitled
- Queue Browser
- backup/module.ts
- Deployment Options
- Provisioned connections
- csp.mjs
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- backup/module.ts
- optional-field.test.ts
- End-to-end run
- settings_test.go
- gateway-settings/service.ts
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
- createConnTabs
- clientGoneError
- npm-audit-gate.mjs
- VpnSwitch
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- Writing tests
- issueCert
- Configure
- syncBuffer

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 129 edges
3. `store` - 100 edges
4. `quietLogger()` - 100 edges
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

## Communities (199 total, 38 thin omitted)

### Community 0 - "backup.go"
Cohesion: 0.04
Nodes (43): connName(), userName(), changedOnDiskError, hostedInfo, TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), pagePolicy(), parseRelayPath(), safeSegment() (+35 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.07
Nodes (49): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, Broker details, ConnectOutcome (+41 more)

### Community 2 - "writeFile"
Cohesion: 0.07
Nodes (70): testCertPair, testCertSpec, appendPEMCerts(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint(), generateSelfSigned() (+62 more)

### Community 3 - "two-factor.test.ts"
Cohesion: 0.15
Nodes (12): QueueFixture, VpnFixture, connection(), DEMO_ACCOUNTS, DEMO_STANDARD_ROOTS, DEMO_TOPOLOGY, demoSeed(), everything (+4 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "broker/store.ts"
Cohesion: 0.12
Nodes (31): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue() (+23 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "writeFile"
Cohesion: 0.14
Nodes (30): diffByName(), mergeByName(), sameRecord(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders() (+22 more)

### Community 9 - "writeError"
Cohesion: 0.12
Nodes (13): auditFor(), TestAuditFor_ActorAndClient(), auditCategory, auditEntry, writeError(), writeRateLimited(), isWebSocketUpgrade(), parseSMFPath() (+5 more)

### Community 10 - "queue-source.ts"
Cohesion: 0.04
Nodes (56): pickQueue() reusable picker, ProvisionedConnectionCard, ProvisionedTarget, PickerCache, PickQueueOptions, PickQueueResult, Refs, State (+48 more)

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
Cohesion: 0.04
Nodes (74): DOM Access, The Module Contract, createService (subscription-explorer), boot(), createNotificationCenter(), changed(), defaultStorage(), el() (+66 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.17
Nodes (27): wfix, classifyStoreError(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestTxn_StagingAPathTwiceKeepsTheLast(), TestWriter_ACrashPublishesNothing() (+19 more)

### Community 19 - "managed-api.ts"
Cohesion: 0.08
Nodes (41): Exchange, log, MANAGED_ERROR_CODES, managedErrorMessage(), MESSAGES, Method, reportManagedFailure(), SIGNED_OUT_TOAST_MS (+33 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (13): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, vite-env.d.ts (__APP_VERSION__) (+5 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "panel.ts"
Cohesion: 0.10
Nodes (44): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+36 more)

### Community 24 - "storecrypt_test.go"
Cohesion: 0.17
Nodes (18): checksumRev(), newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev() (+10 more)

### Community 25 - "pages_test.go"
Cohesion: 0.12
Nodes (84): newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+76 more)

### Community 26 - "boot.managed.ts"
Cohesion: 0.07
Nodes (36): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+28 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (45): playwright-core, abort(), alive(), askLine(), askSecret(), bindInQueueBrowser(), broker, brokerSecrets (+37 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (60): RFC-5280, RFC-6238, issuesSession(), APP_CONNECT_TIMEOUT_MS, AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString() (+52 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "row-list/index.ts"
Cohesion: 0.13
Nodes (14): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+6 more)

### Community 31 - "managedRequest"
Cohesion: 0.17
Nodes (13): managedRequest(), createBackupService(), CertificateBody, createTlsService(), StandardRoots, TlsService, TrustBody, TrustFile (+5 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (78): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+70 more)

### Community 33 - "session"
Cohesion: 0.21
Nodes (8): activeTicket, session, setSigninCookie(), TestSigninCookie_Attributes(), sessionCtxKey, sessions, signinTickets, ticket

### Community 34 - "samples.test.ts"
Cohesion: 0.06
Nodes (55): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+47 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.03
Nodes (117): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+109 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (74): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+66 more)

### Community 39 - "backupService"
Cohesion: 0.10
Nodes (16): backupName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+8 more)

### Community 40 - "tls.go"
Cohesion: 0.06
Nodes (28): The guide on GitHub, certHolder, standardRoots, browserKeyProblem(), newCertHolder(), parseCertificatePEM(), parseKeyPEM(), pemCertificates() (+20 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.14
Nodes (15): auditCall, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev(), userSaveAction(), writeInvalid() (+7 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (25): clientIP(), normalizeAddr(), prefixContains(), setForwarded(), accessConfig, bucket, clientCtxKey, clientWatch (+17 more)

### Community 43 - "loadStore"
Cohesion: 0.11
Nodes (27): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), parseStoreKey(), TestBuildManagedRoutes_StoreErrorIsReturned(), passwordCheck, sealer, adminSeed(), bootstrapUsers(), loadStore() (+19 more)

### Community 44 - "quietLogger"
Cohesion: 0.11
Nodes (21): dialUpstreamTLS(), dropAuthChallenge(), dropSessionCookie(), dropSessionSetCookie(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2() (+13 more)

### Community 45 - "router.ts"
Cohesion: 0.15
Nodes (23): createRouter(), handle(), match(), error(), Handler, invalid(), noContent, ok() (+15 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "session.ts"
Cohesion: 0.08
Nodes (26): removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, AuthenticationScheme (+18 more)

### Community 48 - "newFakeClock"
Cohesion: 0.14
Nodes (46): fakeClock, fixed(), newTestAuditor(), newAdminHandler(), TestAdminHandler_DisabledIs404(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_TrailingSlashRedirects(), newSessions() (+38 more)

### Community 49 - "authPages"
Cohesion: 0.10
Nodes (26): Adding a sign-in step, clientOf(), activeSession, signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg(), authPages (+18 more)

### Community 50 - "logging.go"
Cohesion: 0.14
Nodes (10): adminHandler, clientLogger(), clientString(), requestLogger(), requestUser(), TestRequestLogger_OutsideTheChain(), setAppPageHeaders(), recordingResponseWriter (+2 more)

### Community 52 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (99): Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send() (+91 more)

### Community 53 - "gateway-settings/module.test.ts"
Cohesion: 0.17
Nodes (20): ADMIN, chosen(), clickSave(), el(), errorText(), hidden(), makeCtx(), parts() (+12 more)

### Community 54 - "gateway/store.ts"
Cohesion: 0.06
Nodes (40): AccessExplanation, DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, clientHost() (+32 more)

### Community 56 - "relay_test.go"
Cohesion: 0.13
Nodes (24): errReader, fakeBroker, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers() (+16 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.05
Nodes (47): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+39 more)

### Community 58 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 59 - "fileutil_test.go"
Cohesion: 0.06
Nodes (67): Contents, Coverage policy, Demo and fake gateway suite, Go suite, How the tests are organized, Layout of tests, Running the tests, Testing (+59 more)

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
Nodes (18): Administer, Audit trail, Back up and restore, Certificates from the console, Contents, How it works, Letting the console manage them, Locking them (+10 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (70): currentConn(), currentUser(), enrolViewer(), err2s(), newStoreFixture(), newStoreWithFixtures(), putConn(), putUser() (+62 more)

### Community 66 - "audit_test.go"
Cohesion: 0.16
Nodes (24): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+16 more)

### Community 67 - "request"
Cohesion: 0.12
Nodes (31): basic(), bcheck(), bindQueue(), check(), closeOpened(), cookies, directSempPath(), drain() (+23 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.08
Nodes (19): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+11 more)

### Community 69 - "managed.go"
Cohesion: 0.08
Nodes (31): Gateway contract cases, apiError, auditWriter, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON (+23 more)

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
Nodes (17): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+9 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "tls.ts"
Cohesion: 0.08
Nodes (37): parseBody(), CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error() (+29 more)

### Community 78 - "connection-management/module.test.ts"
Cohesion: 0.18
Nodes (14): ConnectionManagementModule, NO_VPNS, ADMIN, CONNS, el(), hidden(), saveAppliance(), schemePart() (+6 more)

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
Cohesion: 0.04
Nodes (78): Code Conventions, CSS, Error Handling, File Organization, Linting, Logging standard, Modals, TypeScript (+70 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.12
Nodes (6): ManagedResult, ManagedDialer, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "mustHash"
Cohesion: 0.09
Nodes (46): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+38 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "contract.test.ts"
Cohesion: 0.07
Nodes (47): connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS (+39 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 91 - "createGateway"
Cohesion: 0.10
Nodes (38): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), newRecoveryCodes() (+30 more)

### Community 92 - "newManagedHandler"
Cohesion: 0.24
Nodes (7): Auditing an action, Changing the TLS files, Gateway and Admin How-tos, auditPre, fixedAction(), newManagedHandler(), Outcome

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "message.ts"
Cohesion: 0.10
Nodes (34): buildMessage(), buildSample(), publish(), DestinationType, MessageType, SDTFieldType, buildSolaceSdk(), sessions (+26 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (69): auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), newManagedEnv(), raced(), runRevCases() (+61 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (27): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+19 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "dial.go"
Cohesion: 0.20
Nodes (9): newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, rateWindow, secret (+1 more)

### Community 100 - "backup/service.ts"
Cohesion: 0.15
Nodes (13): BackupFile, BackupSchedule, BackupService, ImportChoices, ImportResult, ImportSource, NameDiff, ScheduleKind (+5 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup_api.go"
Cohesion: 0.21
Nodes (11): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+3 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (30): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+22 more)

### Community 106 - "relay.ts"
Cohesion: 0.25
Nodes (13): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+5 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 111 - "provisioned-connection/index.ts"
Cohesion: 0.06
Nodes (25): AccountControl, AccountControlOptions, AccountUser, createAccountControl(), CardCommonDeps, CardPart, ConnectingCardDeps, createProvisionedConnectionCard() (+17 more)

### Community 112 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (24): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), directConnect(), directSempConnect(), directUp() (+16 more)

### Community 118 - "request"
Cohesion: 0.25
Nodes (7): connectTo(), fail(), finish(), request(), switchFrom(), waitFor(), VpnSwitchMode

### Community 119 - "demo-flow.test.ts"
Cohesion: 0.05
Nodes (46): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+38 more)

### Community 120 - "configfile.go"
Cohesion: 0.08
Nodes (32): Adding a gateway config.yaml setting, flattenSettings(), config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange() (+24 more)

### Community 121 - "createPages"
Cohesion: 0.26
Nodes (20): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+12 more)

### Community 122 - "socketRegistry"
Cohesion: 0.29
Nodes (5): openSocket, socketRegistry, newSocketRegistry(), TestSocketRegistry_CeilingsRefuseAndRegisterNothing(), TestSocketRegistry_ClosesOnlyWhatWasRevoked()

### Community 124 - "rbac.ts"
Cohesion: 0.08
Nodes (34): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessLevel, ALWAYS_VISIBLE, canOperate() (+26 more)

### Community 125 - "user-management/module.test.ts"
Cohesion: 0.15
Nodes (18): ADMIN, answerSignOut(), CHOICES, chooseForUser(), clickRow(), el(), hidden(), listed() (+10 more)

### Community 127 - "main_test.go"
Cohesion: 0.17
Nodes (31): acceptWatch, main(), printVersionIfRequested(), serve(), expectLogged(), gatewayClient(), gatewayDir(), startServe() (+23 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (129): AppContext (Dependency Injection), Circular Dependency Resolution, Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, Laying out an admin page, Integration tests (+121 more)

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
Nodes (63): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), mustBody(), scheduleBody() (+55 more)

### Community 139 - "checkedAlias"
Cohesion: 0.25
Nodes (9): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), machineLookup() (+1 more)

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 142 - "configfile_test.go"
Cohesion: 0.12
Nodes (39): TestBackup_SettingsChangesNamesDottedKeys(), configVerifier(), decodeConfigFile(), encodeConfigFile(), resolveConfig(), seedConfigFile(), clearSeedEnv(), removedNames() (+31 more)

### Community 148 - "log/slog.Logger"
Cohesion: 0.06
Nodes (39): openAuditor(), TestOpenAuditor_FailureIsActionable(), auditor, configSource, live, newLive(), liveSettings, recoverPanics() (+31 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (62): Writing to the store, sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv(), TestContract_Validation() (+54 more)

### Community 155 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 156 - "fixtures.ts"
Cohesion: 0.05
Nodes (64): listQueues(), listVpns(), brokerVpns(), delay(), DIRECT_BROKER, Fault, MOCK_HOST, resetScenario() (+56 more)

### Community 157 - "smf_test.go"
Cohesion: 0.10
Nodes (31): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+23 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "createUiEvents"
Cohesion: 0.16
Nodes (7): createUiEvents(), confirmDelete(), handleBindPickClick(), handleBulkDelete(), handleDelete(), reportDelete(), makeUiEvents()

### Community 162 - "entitled"
Cohesion: 0.43
Nodes (5): anyMatch(), entitled(), matchGlob(), TestEntitled(), TestMatchGlob_Conformance()

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "backup/module.ts"
Cohesion: 0.10
Nodes (28): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, SavePickerStub, ADMIN, answer() (+20 more)

### Community 165 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 167 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.14
Nodes (7): bundleSources(), productSources(), REPO_ROOT, fire(), GLOBALS, pending(), shell

### Community 170 - "backup/module.ts"
Cohesion: 0.03
Nodes (85): Adding a New Module, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions (+77 more)

### Community 172 - "optional-field.test.ts"
Cohesion: 0.43
Nodes (3): createOptionalField(), OptionalField, OptionalFieldElements

### Community 173 - "End-to-end run"
Cohesion: 0.22
Nodes (9): Browser and harness notes, End-to-end run, Requirements, The checks, What it changes, What it does, auditMissing(), parseAuditLog() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.16
Nodes (29): assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, TestSettings_AccessListThatAdmitsTheAdmin() (+21 more)

### Community 175 - "gateway-settings/service.ts"
Cohesion: 0.38
Nodes (4): ClientSeen, createSettingsService(), GatewaySettings, SETTINGS

### Community 176 - "contract_test.go"
Cohesion: 0.10
Nodes (25): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+17 more)

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
Cohesion: 0.12
Nodes (25): Writing a config.yaml by hand (development only), TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), fileConfigFromConfig(), parseCIDRs(), prefixStrings(), TestFileConfig_CloneIsIndependent() (+17 more)

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
Cohesion: 0.11
Nodes (18): boolEnv(), levelName(), TestLevelName(), envOr(), loadConfig(), parseLogLevel(), parseStrictBool(), TestEnvOr() (+10 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 190 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

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

### Community 199 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1403 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `store` to `store_test.go`, `managed.go`, `backupService`, `net/http.ResponseWriter`, `backup/module.ts`, `writer_test.go`, `log/slog.Logger`, `checksums`, `newManagedHandler`, `newManagedEnv`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `backup.go` be split into smaller, more focused modules?**
  _Cohesion score 0.04490358126721763 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `backup/module.ts` to `store`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._