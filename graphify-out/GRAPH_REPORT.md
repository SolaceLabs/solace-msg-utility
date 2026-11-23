# Graph Report - smu-dirty  (2026-11-23)

## Corpus Check
- 371 files · ~821,613 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 34 file(s) not represented in the graph (top: .css 26, (none) 7, .dockerignore 1)

## Summary
- 5522 nodes · 17648 edges · 183 communities (148 shown, 35 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 2353 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `24911792`
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
- smf.go
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
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- boot.managed.ts
- storecrypt_test.go
- pages_test.go
- createEventBus
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- Testing
- tls-certificates/module.test.ts
- backup.ts
- demo-flow.test.ts
- checksums
- Filter Messages Dialog
- utils.ts
- dist/js/solclient.js (Solace JS SDK)
- quietLogger
- backup.go
- tls.go
- net/http.ResponseWriter
- time.Time
- sealer
- session
- contract.test.ts
- ui.selectMessage
- settingsFile
- newFakeClock
- authPages
- tls.ts
- queue-discovery index.html
- backup/module.ts
- routes.test.ts
- gateway/types.ts
- tests variants
- relay.ts
- gateway/index.ts
- installDirect
- fileutil_test.go
- queue-discovery module
- Forward Message Dialog Screenshot
- Direct demo (`demo.html`)
- Provisioned Mode
- Managed Variant (RBAC)
- store_test.go
- seed.ts
- samples.test.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- run
- SEMP v2 Paged Discovery (core library)
- broker-hosts.test.ts
- Gateway Settings
- passwordForm
- queue-copy/ui-events.ts
- ui-modal.test.ts
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
- Deployment Options
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- decodeConfigFile
- dest-provisioned.test.ts
- file-kind.ts
- Two-factor sign-in
- module-registry-plugin.mjs
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- user-management/module.test.ts
- about/module.test.ts
- configfile.go
- createPages
- journal
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
- Connections
- queue-discovery module.ts
- setup.sh
- github.com/solace/go-web-proxy
- vite-env.d.ts
- live
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- Configure
- vite-build.mjs
- testing.T
- queue-discovery ui.js
- ConnectionsModule Test Suite
- .toConfig
- csp.mjs
- access-test.ts
- Queue Browser
- user-management/module.ts
- Provisioned connections
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- RowList
- issueCert
- settings_test.go
- connection-management/service.ts
- contract_test.go
- Administration
- Backup & Restore
- Queue Copy
- Code Standards
- runChecks
- tsconfig.test.json
- Certificates
- User Mgmt.
- compose.ts
- config
- Queue Copy: Verify Flow & Broker Bug Workaround
- System Overview
- SEMP v1 Pagination (Queue Subscription Explorer)
- user-management/service.ts

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 179 edges
2. `vitest` - 128 edges
3. `store` - 100 edges
4. `quietLogger()` - 99 edges
5. `AppContext` - 72 edges
6. `managedHandler` - 69 edges
7. `writeFile()` - 69 edges
8. `loadModuleDOM()` - 68 edges
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

## Communities (183 total, 35 thin omitted)

### Community 0 - "totp.go"
Cohesion: 0.10
Nodes (31): TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), checkTwoFactor(), groupSecret(), newTOTPGuard(), normaliseRecoveryCode(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor() (+23 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.09
Nodes (37): isSessionEnded(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines() (+29 more)

### Community 2 - "writeFile"
Cohesion: 0.06
Nodes (78): newUpstreamTransport(), testCertPair, testCertSpec, appendPEMCerts(), browserKeyProblem(), buildTrustPool(), encodeCertificates(), fileExists() (+70 more)

### Community 3 - "createGateway"
Cohesion: 0.09
Nodes (42): Restart gateway, The checks, clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE (+34 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.12
Nodes (31): diffByName(), mergeByName(), sameRecord(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffIgnoresRev(), TestBackup_DiffMergeAndSessionEnders() (+23 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.09
Nodes (23): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, row() (+15 more)

### Community 9 - "smf.go"
Cohesion: 0.09
Nodes (21): setForwarded(), newDialer(), newRateWindow(), smfPathFor(), dialer, dialRequest, dialResponse, writeRateLimited() (+13 more)

### Community 10 - "rbac.ts"
Cohesion: 0.04
Nodes (63): ProvisionedConnectionCard, PickerCache, PickQueueOptions, PickQueueResult, Refs, State, filterSempFetch(), isListedVpn() (+55 more)

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
Cohesion: 0.05
Nodes (55): Adding a New Module, pickQueue() reusable picker, boot(), AccountControl, AccountControlOptions, AccountUser, createAccountControl(), AdminSessionHandlers (+47 more)

### Community 17 - "scripts"
Cohesion: 0.08
Nodes (24): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+16 more)

### Community 18 - "writer_test.go"
Cohesion: 0.12
Nodes (32): Writing to the store, withRequestInfo(), checkRev(), recoveryIndex(), txn, wfix, classifyStoreError(), newStaleBasis() (+24 more)

### Community 19 - "connections/module.ts"
Cohesion: 0.03
Nodes (114): createService (subscription-explorer), fetchAllSubscriptions, coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes (+106 more)

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.08
Nodes (15): moduleRegistryPlugin(), scripts/vite-build.mjs wrapper, src/main.ts application bootstrap, modules, TS path aliases (@core, @modules), MOCK_REDIRECTS table, appVersion, DEMO_BOOTS (+7 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "boot.managed.ts"
Cohesion: 0.05
Nodes (93): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+85 more)

### Community 24 - "storecrypt_test.go"
Cohesion: 0.15
Nodes (19): checksumRev(), newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory(), TestChecksums_WithoutAKeyThereIsNoCheckAndNoRev() (+11 more)

### Community 25 - "pages_test.go"
Cohesion: 0.13
Nodes (75): pagePolicy(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv (+67 more)

### Community 26 - "createEventBus"
Cohesion: 0.05
Nodes (56): createEventBus(), createManagedProfile(), BackupModule, GatewaySettingsModule, makeCtx(), completeContext(), CHOICES, expectSignedOut() (+48 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (47): askLine(), askSecret(), basic(), bcheck(), bindInQueueBrowser(), bindQueue(), broker, brokerSecrets (+39 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (65): RFC-5280, RFC-6238, Browser and harness notes, aliasLookup(), checkedAlias(), freshCode(), aliasAddress(), AUDIT_FIELDS (+57 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.10
Nodes (21): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+13 more)

### Community 30 - "Testing"
Cohesion: 0.12
Nodes (16): Contents, Coverage policy, Demo and fake gateway suite, End-to-end run, Go suite, How the tests are organized, Requirements, Running the tests (+8 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.07
Nodes (41): formatUtc(), EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), markElement(), MAX_TLS_REQUEST_BYTES, namesList(), TlsCertificatesModule (+33 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (94): BACKUP_ITER, BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser() (+86 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.10
Nodes (17): QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES (+9 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "utils.ts"
Cohesion: 0.07
Nodes (41): createSegmented(), SegmentedOptions, isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains() (+33 more)

### Community 38 - "quietLogger"
Cohesion: 0.04
Nodes (114): clientACL(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient() (+106 more)

### Community 39 - "backup.go"
Cohesion: 0.07
Nodes (26): backupName(), connName(), fileOfSchedule(), flattenSettings(), monthSlot(), newBackupService(), nextRun(), partialName() (+18 more)

### Community 40 - "tls.go"
Cohesion: 0.05
Nodes (37): A chapter, Build commands, Build-time feature flags, Building variants, Figures, Maintaining dependencies, Setup, The guide on GitHub (+29 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (18): auditCall, auditEntry, auditWriter, auditWrote, decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+10 more)

### Community 42 - "time.Time"
Cohesion: 0.13
Nodes (18): clientIP(), normalizeAddr(), prefixContains(), accessConfig, bucket, clientCtxKey, clientWatch, failures (+10 more)

### Community 43 - "sealer"
Cohesion: 0.35
Nodes (3): sealer, storeHeader(), storeRole

### Community 44 - "session"
Cohesion: 0.18
Nodes (11): activeTicket, session, clearSessionCookie(), clearSigninCookie(), setSigninCookie(), TestSigninCookie_Attributes(), withSession(), sessionCtxKey (+3 more)

### Community 45 - "contract.test.ts"
Cohesion: 0.06
Nodes (56): clientUsernameOk(), sempUsernameOk(), connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem() (+48 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "settingsFile"
Cohesion: 0.17
Nodes (8): Gateway contract cases, apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), settingsFile, stagedSettings, newRefusal()

### Community 48 - "newFakeClock"
Cohesion: 0.15
Nodes (42): fakeClock, fixed(), newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry() (+34 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (34): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), twoFactorEnrolMsg() (+26 more)

### Community 50 - "tls.ts"
Cohesion: 0.08
Nodes (37): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+29 more)

### Community 52 - "backup/module.ts"
Cohesion: 0.05
Nodes (58): Cross-references, Defensive-guard tests, Global hooks, Module tests, Node test files, Shared state, Stubbing globals, Test DOM (+50 more)

### Community 53 - "routes.test.ts"
Cohesion: 0.06
Nodes (34): LoginLimits, bundleSources(), productSources(), REPO_ROOT, call(), CLIENT, FAULTS, GOLDEN (+26 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.06
Nodes (39): AccessExplanation, ManagedDialer, DialResponse, QGlob, TwoFactorMode, BackupDoc, anyMatch(), clientHost() (+31 more)

### Community 56 - "relay.ts"
Cohesion: 0.09
Nodes (39): listQueues(), listVpns(), brokerVpns(), delay(), DEMO_GATEWAY_MARKER, declRefused(), forward(), headerOf() (+31 more)

### Community 57 - "gateway/index.ts"
Cohesion: 0.07
Nodes (36): BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders(), SignInResult (+28 more)

### Community 58 - "installDirect"
Cohesion: 0.08
Nodes (23): AppContext (Dependency Injection), Circular Dependency Resolution, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, clientUsernameError(), sdkClientName() (+15 more)

### Community 59 - "fileutil_test.go"
Cohesion: 0.11
Nodes (51): commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir(), recoverDir() (+43 more)

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
Nodes (18): Administer, Back up and restore, Certificates from the console, Contents, How it works, Letting the console manage them, Locking them, Paths come from the environment (+10 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.09
Nodes (88): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), savedUser, loadStore(), bootstrapFixture(), currentConn(), currentUser(), enrolViewer(), envOf() (+80 more)

### Community 66 - "seed.ts"
Cohesion: 0.13
Nodes (14): QueueFixture, VpnFixture, connection(), DEMO_STANDARD_ROOTS, DEMO_TOPOLOGY, demoSeed(), everything, pw() (+6 more)

### Community 67 - "samples.test.ts"
Cohesion: 0.13
Nodes (27): attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), PayloadFileSource, TEXT_TYPE_EXT, textExtension() (+19 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.09
Nodes (29): Changing the TLS files, Gateway and Admin How-tos, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON (+21 more)

### Community 70 - "dev.sh"
Cohesion: 0.15
Nodes (33): APP_VERSION, c(), ensure_deps(), expand(), finish(), go_test(), has_linux_docker(), host_arch() (+25 more)

### Community 71 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, baseUrl, checkJs, esModuleInterop, module, moduleResolution, outDir (+10 more)

### Community 72 - "Contributing"
Cohesion: 0.17
Nodes (6): Architecture Notes, code:bash (npm install && npm test), Contributing, Development Workflow, Getting Started, Pull Request Checklist

### Community 73 - "run"
Cohesion: 0.18
Nodes (17): playwright-core, abort(), alive(), browserOn(), COMPOSE, describeBroker(), insecure(), maskSecrets() (+9 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "broker-hosts.test.ts"
Cohesion: 0.09
Nodes (18): BROKER_HOSTS_TEXT, BrokerHosts, BrokerHostsElements, BrokerHostsLocks, BrokerHostsOptions, BrokerHostsText, BrokerHostValues, BrokerType (+10 more)

### Community 76 - "Gateway Settings"
Cohesion: 0.10
Nodes (21): A number the page cannot read, A value the gateway refuses, Access, An allow list that would lock you out, Audit trail, Broker trust, Connections, Gateway Settings (+13 more)

### Community 77 - "passwordForm"
Cohesion: 0.17
Nodes (12): usersWrote(), newClientWatch(), passwordForm(), TestClientWatch(), TestLogin_ParallelGuessesForOneAccountQueue(), TestLogin_QueuedRequestThatGoesAwayIs503(), TestLogin_WarnsWhenEverySignInLooksLikeOneClient(), TestPasswordChange_Rejections() (+4 more)

### Community 78 - "queue-copy/ui-events.ts"
Cohesion: 0.11
Nodes (12): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+4 more)

### Community 79 - "ui-modal.test.ts"
Cohesion: 0.04
Nodes (99): DOM Access, Solace mock, cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener() (+91 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "queue-copy/module.ts"
Cohesion: 0.09
Nodes (45): ProvisionedTarget, DESTINATION_SDK_CONNECT, formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly() (+37 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "ManagedResult"
Cohesion: 0.13
Nodes (6): Audit trail, ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 86 - "testing.T"
Cohesion: 0.11
Nodes (39): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+31 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "pwaHandler"
Cohesion: 0.22
Nodes (3): setAppPageHeaders(), pwaHandler, recordingResponseWriter

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "tls_api_test.go"
Cohesion: 0.19
Nodes (23): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+15 more)

### Community 91 - "configfile_test.go"
Cohesion: 0.25
Nodes (20): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+12 more)

### Community 92 - "Developer Guide"
Cohesion: 0.17
Nodes (12): Code Conventions, Contents, CSS, Developer Guide, Error Handling, File Organization, Linting, Logging standard (+4 more)

### Community 93 - "manual-to-md.mjs"
Cohesion: 0.32
Nodes (15): BLOCK_TAGS, blocks(), chapterMarkdown(), codeSpan(), DOCS_URL, escapeText(), fenced(), figure() (+7 more)

### Community 94 - "message.ts"
Cohesion: 0.04
Nodes (100): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS (+92 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.10
Nodes (75): Auditing an action, auditLog, connChanges(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named() (+67 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "go_pkg_strings"
Cohesion: 0.05
Nodes (31): backupRunJSON, backupScheduleJSON, backupStatusJSON, changedOnDiskError, clientGoneError, hostedInfo, importBasis, importJSON (+23 more)

### Community 100 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "decodeConfigFile"
Cohesion: 0.21
Nodes (12): Writing a config.yaml by hand (development only), decodeConfigFile(), encodeConfigFile(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten(), TestDecodeConfigFile_TwoFactorDefaultsAndIsWritten(), TestDecodeConfigFile_UnknownFieldFails() (+4 more)

### Community 105 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 106 - "file-kind.ts"
Cohesion: 0.11
Nodes (27): detectKind(), FileKind, FTYP_BRANDS, has(), imageSize(), JPEG_SOF, jpegSize(), kind() (+19 more)

### Community 107 - "Two-factor sign-in"
Cohesion: 0.22
Nodes (9): A lost phone, Backups and two-factor, Choosing a mode, Recovery codes, Setting it up, Signing in with a code, The gateway's clock, Troubleshooting (+1 more)

### Community 108 - "module-registry-plugin.mjs"
Cohesion: 0.13
Nodes (27): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), inlineFigures(), MODULE_BASE_MARKER, MODULE_HELP_MARKER (+19 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (22): ConnectionsModule, account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed() (+14 more)

### Community 118 - "user-management/module.test.ts"
Cohesion: 0.17
Nodes (15): ADMIN, CHOICES, clickRow(), el(), hidden(), listed(), makeCtx(), rowCount() (+7 more)

### Community 119 - "about/module.test.ts"
Cohesion: 0.08
Nodes (33): AboutModule, contentsButton(), followReading(), installManual(), show(), turnTo(), installTabs(), scrollPaneOf() (+25 more)

### Community 120 - "configfile.go"
Cohesion: 0.10
Nodes (27): boolEnv(), checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog(), removedInUse() (+19 more)

### Community 121 - "createPages"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 122 - "journal"
Cohesion: 0.10
Nodes (19): Layout of tests, syncDir(), TestSyncDir_ReportsAMissingDirectory(), writeTemp(), journal, createExclusive(), existingStore(), loadStoreKey() (+11 more)

### Community 124 - "createQueuePicker"
Cohesion: 0.38
Nodes (16): createQueuePicker(), applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues() (+8 more)

### Community 125 - "fileConfigFromConfig"
Cohesion: 0.23
Nodes (7): Adding a gateway config.yaml setting, fileConfigFromConfig(), onFailureOrDefault(), liveSettings, loginLimits, expired(), sessionLimits

### Community 127 - "main_test.go"
Cohesion: 0.08
Nodes (55): acceptWatch, envOr(), loadConfig(), main(), newRootHandler(), parseLogLevel(), parseStrictBool(), printVersionIfRequested() (+47 more)

### Community 131 - "vitest"
Cohesion: 0.03
Nodes (109): Event Handling, Laying out an admin page, vitest, QueuePicker, AppContext, AppState, BusEvents, EventBus (+101 more)

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

### Community 140 - "Connections"
Cohesion: 0.09
Nodes (22): Advanced Settings, Basic and OAuth2, Client Name Identifier, Connecting SEMP, Connecting the Solace client, Connections, Finding your way around, Max Messages per Queue (+14 more)

### Community 148 - "live"
Cohesion: 0.10
Nodes (17): openAuditor(), auditCategory, auditor, configSource, live, bodyDeadline(), buildManagedRoutes(), gateDirect() (+9 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (65): sessionEnders(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation(), flexStr, importInvalidError (+57 more)

### Community 155 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 156 - "vite-build.mjs"
Cohesion: 0.14
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "testing.T"
Cohesion: 0.05
Nodes (47): deadHijacker, errReader, fakeAnswer, fakeBroker, fakeSMFBroker, gatedWriter, openSocket, isShowRPC() (+39 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - ".toConfig"
Cohesion: 0.20
Nodes (14): TestParseCIDRs(), checkAuditOnFailure(), defaultFileConfig(), parseCIDRs(), prefixStrings(), TestFileConfig_CloneIsIndependent(), TestToConfig_Audit(), TestToConfig_AuditOnFailureIsValidated() (+6 more)

### Community 161 - "csp.mjs"
Cohesion: 0.31
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 162 - "access-test.ts"
Cohesion: 0.15
Nodes (15): AccessLevel, ACCESS_PROMPT, AccessTest, createAccessTest(), evaluate(), note(), grantedModules(), LEVELS (+7 more)

### Community 163 - "Queue Browser"
Cohesion: 0.12
Nodes (16): Binding to a queue, Deleting messages, Download Content, Download Full, Downloading messages, Filtering messages, Forwarding messages, If your page shows no payloads (+8 more)

### Community 164 - "user-management/module.ts"
Cohesion: 0.04
Nodes (68): Integration tests, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions (+60 more)

### Community 166 - "Provisioned connections"
Cohesion: 0.12
Nodes (16): Changing your password, Connecting to a broker, Disconnecting and signing out, Other messages, Provisioned connections, Refreshing your list, Setting it up, Signing in (+8 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 173 - "issueCert"
Cohesion: 0.33
Nodes (7): keyLine(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride(), rsaKeyPair(), writeMaterial()

### Community 174 - "settings_test.go"
Cohesion: 0.07
Nodes (69): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+61 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 176 - "contract_test.go"
Cohesion: 0.07
Nodes (36): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+28 more)

### Community 177 - "Administration"
Cohesion: 0.11
Nodes (19): A password that must be changed first, Administration, Confirm dialogs, Finding your way around, Messages about the gateway's files, Other messages, Row buttons and rows of boxes, Saving at the same time as another administrator (+11 more)

### Community 178 - "Backup & Restore"
Cohesion: 0.11
Nodes (19): Any action, Backup & Restore, Export and import, Exporting a backup, Refusals and messages, Removing the schedule, Restoring from a file, Running a backup now (+11 more)

### Community 179 - "Queue Copy"
Cohesion: 0.11
Nodes (19): Before you move messages, Copy or Move, How a run ends, How the check works, Picking a queue, Queue Copy, Running a copy or a move, Starting (+11 more)

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (43): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), issuesSession(), basisMoved() (+35 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Certificates"
Cohesion: 0.11
Nodes (18): Adding a trusted CA, Before anything is sent, Certificates, Deleting a trusted CA, Expiry marks, From the certificate checks, From the file name and the files, From the session and the gateway (+10 more)

### Community 186 - "User Mgmt."
Cohesion: 0.12
Nodes (16): Adding a user, Deleting a user, Editing a user, Entitlements, Finding a user, Forcing a password change, How the wildcard matches, Modules (+8 more)

### Community 188 - "config"
Cohesion: 0.25
Nodes (6): config, levelName(), TestLevelName(), logStartup(), modeName(), validateConnModes()

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
Cohesion: 0.43
Nodes (4): createUserMgmtService(), userPath(), UserPayload, PAYLOAD

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **166 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1393 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `checksums`, `user-management/module.ts`, `managed.go`, `backup.go`, `net/http.ResponseWriter`, `live`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `totp.go` be split into smaller, more focused modules?**
  _Cohesion score 0.10121951219512196 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `user-management/module.ts` to `writer_test.go`, `backup/module.ts`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._