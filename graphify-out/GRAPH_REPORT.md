# Graph Report - smu-dirty  (2026-11-18)

## Corpus Check
- 364 files · ~727,295 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5243 nodes · 17135 edges · 196 communities (159 shown, 37 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2340 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e3e7db7c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- settings.ts
- createManagedPanel
- createGateway
- gateway/index.ts
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- quietLogger
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
- tlsManager
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
- contract.test.ts
- gateway/types.ts
- tests variants
- rbac.ts
- fixtures.ts
- relay_test.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- queue-copy/ui-events.test.ts
- vpn-switch.ts
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
- router.ts
- Administration (`/solAdmin`)
- session.ts
- socketRegistry
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- keyfile_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- initDetails
- Queue Browser Internal Architecture
- queue-source.ts
- CSS Organization
- checksums
- configfile.go
- seed.ts
- Setup
- session_test.go
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
- server.test.ts
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
- configfile_test.go
- createPages
- managed-panel.ts
- runDirectChecks
- user-management/service.ts
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
- main.go
- queue-browser ui-forward tests
- queue-discovery ui tests
- parse.ts
- devDependencies
- queue-discovery service.ts
- store
- logging.go
- vite-build.mjs
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- loadOrGenerateServerCert
- fileConfigFromConfig
- decodeConfigFile
- settingsFile
- defaultConfig
- .checkSettings
- User Guide
- net.Conn
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- main
- sealer
- End-to-end run
- csp.mjs
- settings_test.go
- crypto/tls.Certificate
- logStartup
- queue-copy/ui-events.ts
- tls_test.go
- .ServeHTTP
- Configure
- Code Standards
- runChecks
- tsconfig.test.json
- Cutting a release
- main_test.go
- buildTrustPool
- compose.ts
- Module 3: Queue Copy
- go_pkg_testing
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
- `Test DOM` --references--> `readModuleTemplate()`  [INFERRED]
  docs/testing.md → scripts/module-registry-plugin.mjs
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

## Communities (196 total, 37 thin omitted)

### Community 0 - "settings.ts"
Cohesion: 0.13
Nodes (26): usersProblem(), cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS, fileDefaults(), ipv6Groups() (+18 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.12
Nodes (35): managedErrorMessage(), ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeDetails(), outcomeLines() (+27 more)

### Community 2 - "createGateway"
Cohesion: 0.09
Nodes (44): clock(), acceptedStep(), base32(), frac32(), HASH_RULE, hashRecovery(), isTwoFactorMode(), mockCode() (+36 more)

### Community 3 - "gateway/index.ts"
Cohesion: 0.06
Nodes (42): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+34 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.08
Nodes (35): backupName(), fileOfSchedule(), mergeByName(), newBackupService(), backupFixtureFrom(), newBackupFixture(), slicesIndexUser(), TestBackup_DiffMergeAndSessionEnders() (+27 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (26): cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling() (+18 more)

### Community 10 - "quietLogger"
Cohesion: 0.31
Nodes (25): fixed(), newTestAuditor(), newFakeClock(), newThrottle(), addr(), TestRetrySeconds(), TestThrottle_BackoffGrowsDoublesAndCaps(), TestThrottle_ClientLimitIsSeparateFromTheAccountLimit() (+17 more)

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
Nodes (43): newBackupKey(), openBackup(), sealBackup(), envelope(), mustSealer(), reseal(), sampleBackup(), sealed() (+35 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.09
Nodes (40): Writing to the store, changedOnDiskError, refusalError, staleError, checkRev(), countAdmins(), TestSealer_ADocumentThatDoesNotEncodeIsAFailedWrite(), txn (+32 more)

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

### Community 23 - "managed-panel.ts"
Cohesion: 0.04
Nodes (32): MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionConfig, ConnectionCredentials, SolaceConfig, TwoFactorState, DialConn (+24 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (91): Code Conventions, CSS, DOM Access, Error Handling, File Organization, Laying out an admin page, Linting, Logging standard (+83 more)

### Community 25 - "pages_test.go"
Cohesion: 0.11
Nodes (86): usersWrote(), newClientWatch(), beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect() (+78 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (98): Event Handling, Integration tests, Module tests, vitest, DeploymentConfig, createEventBus(), createManagedProfile(), AppContext (+90 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (34): aliasLookup(), askLine(), askSecret(), basic(), broker, brokerSecrets, checkedAlias(), closers (+26 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (50): RFC-5280, RFC-6238, freshCode(), AUDIT_FIELDS, AUDIT_REQUIRED, base32Decode(), bitString(), BROKER_FIELDS (+42 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "broker/store.ts"
Cohesion: 0.07
Nodes (59): PAYLOAD_SAMPLES, PayloadSample, allQueues(), BINARY_SAMPLE, buildMessage(), buildSample(), CONTENT_TYPES, DESTINATION_FIELDS (+51 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.05
Nodes (52): Cross-references, Defensive-guard tests, Global hooks, Node test files, Shared state, Stubbing globals, Test DOM, Writing tests (+44 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "demo-flow.test.ts"
Cohesion: 0.08
Nodes (33): ManagedDemo, GatewayPages, QueueCopyModule, QueueSubscriptionExplorerModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES (+25 more)

### Community 34 - "backup.go"
Cohesion: 0.05
Nodes (38): auditCategory, diffByName(), sameRecord(), TestBackup_DiffIgnoresRev(), TestBackup_DiffShowsTwoFactor(), withoutRev(), backupFileInfo, backupRunJSON (+30 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.04
Nodes (54): Adding a New Module, AppContext (Dependency Injection), EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL (+46 more)

### Community 38 - "proxy_test.go"
Cohesion: 0.05
Nodes (66): hostedInfo, gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), newRootHandler(), route(), stubHandler(), TestRootHandler_RobotsOnEveryResponse() (+58 more)

### Community 39 - "contract_test.go"
Cohesion: 0.11
Nodes (25): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), decodeAny(), managedEnv (+17 more)

### Community 40 - "tlsManager"
Cohesion: 0.15
Nodes (13): parseCertificatePEM(), pemCertificates(), readableName(), TestReadableName(), TestTrustFileName(), trustFileName(), trustListedName(), warnIfExpiring() (+5 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.13
Nodes (18): auditCall, auditWriter, auditWrote, bodyDeadline(), connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget() (+10 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (24): clientIP(), normalizeAddr(), prefixContains(), accessConfig, monthSlot(), nextRun(), TestBackup_NextRun(), backupSchedule (+16 more)

### Community 43 - "tls.ts"
Cohesion: 0.08
Nodes (34): CertInfo, clone(), createTls(), pair(), decode(), DEMO_SUBJECT, error(), fingerprint() (+26 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.29
Nodes (16): TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), loadStore(), bootstrapFixture(), envOf(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange(), TestLoadStore_BootstrapPasswordIsCheckedAgainstTheConfiguredMinimum(), TestLoadStore_BootstrapPasswordOutsideThePolicyIsReplacedByAGeneratedOne() (+8 more)

### Community 45 - "panel.ts"
Cohesion: 0.12
Nodes (39): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+31 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.19
Nodes (23): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+15 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.08
Nodes (55): Layout of tests, commitStep, checkJournalName(), commitJournal(), journalTargetNames(), newJournal(), parseTxn(), recoverDataDir() (+47 more)

### Community 49 - "authPages"
Cohesion: 0.11
Nodes (24): clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient(), twoFactorEnrolMsg() (+16 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.19
Nodes (23): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+15 more)

### Community 52 - "trustHolder"
Cohesion: 0.11
Nodes (23): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+15 more)

### Community 53 - "contract.test.ts"
Cohesion: 0.08
Nodes (40): connsProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk() (+32 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.08
Nodes (32): QGlob, TwoFactorMode, BackupDoc, anyMatch(), BrokerTarget, cloneConn(), createStore(), DeleteConnResult (+24 more)

### Community 56 - "rbac.ts"
Cohesion: 0.18
Nodes (15): AccessExplanation, AccessLevel, ALWAYS_VISIBLE, explainAccess(), findQueueRow(), findVpnRow(), isVpnVisible(), matchesAny() (+7 more)

### Community 57 - "fixtures.ts"
Cohesion: 0.06
Nodes (49): MANAGED_ERROR_CODES, QUEUE_STATE, QueueState, resetScenario(), scenario, ScenarioState, seedState(), setBrokers() (+41 more)

### Community 58 - "relay_test.go"
Cohesion: 0.10
Nodes (25): errReader, fakeBroker, gatedWriter, isShowRPC(), newUserCounter(), answerJSON(), newRelayEnv(), TestIsShowRPC() (+17 more)

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
Cohesion: 0.11
Nodes (25): Solace mock, DEFAULT_PUBLISH_ACK_TIMEOUT_MS, DestTarget, createInitialState(), cacheElements(), session(), tests main, makeOriginal() (+17 more)

### Community 63 - "vpn-switch.ts"
Cohesion: 0.14
Nodes (13): TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+5 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.10
Nodes (76): savedUser, currentConn(), currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), newStoreWithFixtures() (+68 more)

### Community 66 - "access_test.go"
Cohesion: 0.16
Nodes (26): aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed(), TestClientACL_BadPeerFailsClosed(), TestClientACL_DeniedIsOpaque403(), TestClientACL_EmptyAllowListAdmitsEveryClient(), TestClientACL_FollowsLiveSettings() (+18 more)

### Community 67 - "session"
Cohesion: 0.14
Nodes (13): activeTicket, session, clearSigninCookie(), expired(), setSigninCookie(), TestSessionOf_ContextRoundTrip(), TestSigninCookie_Attributes(), withSession() (+5 more)

### Community 68 - "Deployment Guide"
Cohesion: 0.10
Nodes (15): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+7 more)

### Community 69 - "managed.go"
Cohesion: 0.07
Nodes (34): Adding a sign-in step, Changing the TLS files, Gateway and Admin How-tos, auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON (+26 more)

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
Cohesion: 0.13
Nodes (28): attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), contentFileName(), PayloadFileSource, TEXT_TYPE_EXT (+20 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "router.ts"
Cohesion: 0.14
Nodes (35): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+27 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "session.ts"
Cohesion: 0.06
Nodes (34): removeMessage(), createEmitter(), MockEmitter, createQueueBrowser(), interval(), pump(), MockQueueBrowser, AuthenticationScheme (+26 more)

### Community 78 - "socketRegistry"
Cohesion: 0.19
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
Cohesion: 0.21
Nodes (14): partialName(), createExclusive(), existingStore(), loadStoreKey(), ownershipHint(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode() (+6 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.13
Nodes (15): Connecting, Contents, Demo accounts, Demo controls, Demo controls, Demos, Direct demo (`demo.html`), How it differs from a real gateway (+7 more)

### Community 86 - "initDetails"
Cohesion: 0.11
Nodes (30): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, hexDump(), imageSize(), JPEG_SOF (+22 more)

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "queue-source.ts"
Cohesion: 0.09
Nodes (18): __resetForTest(), canOperate(), Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom() (+10 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 91 - "configfile.go"
Cohesion: 0.10
Nodes (29): Adding a gateway config.yaml setting, config, checkModuleIDs(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), intInRange(), moduleCatalog() (+21 more)

### Community 92 - "seed.ts"
Cohesion: 0.11
Nodes (15): QueueFixture, connection(), DEMO_ACCOUNTS, demoSeed(), everything, pw(), GatewaySeed, error() (+7 more)

### Community 93 - "Setup"
Cohesion: 0.29
Nodes (7): Build commands, Build internals, Build-time feature flags, Building variants, Maintaining dependencies, Setup, up()

### Community 94 - "session_test.go"
Cohesion: 0.19
Nodes (21): fakeClock, newSessions(), newSigninTickets(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired(), TestSessions_DropAndDropUser() (+13 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.11
Nodes (70): Auditing an action, auditLog, changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter(), named(), newManagedEnv() (+62 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.16
Nodes (25): groupSecret(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestGroupSecret(), TestNeed_RuleOverEveryModeAdminAndEnrolment(), TestQRSVG_DrawsTheCodeWithItsQuietZone(), TestQRSVG_SameTextSameDrawing() (+17 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (30): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+22 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.06
Nodes (48): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+40 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.11
Nodes (19): A lost phone, Administer, Back up and restore, Backups and two-factor, Choosing a mode, Contents, How it works, Provisioned Mode (+11 more)

### Community 106 - "ui-modal.test.ts"
Cohesion: 0.06
Nodes (50): SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+42 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "server.test.ts"
Cohesion: 0.17
Nodes (19): listQueues(), listVpns(), brokerVpns(), delay(), handleSemp(), hostedResponse(), installMockServer(), json() (+11 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.07
Nodes (29): clientACL(), withClient(), openAuditor(), auditor, configSource, newDialer(), newRateWindow(), smfPathFor() (+21 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.18
Nodes (16): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), pressed() (+8 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): ConnectionsModule, account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed() (+15 more)

### Community 119 - "parseSetCookie"
Cohesion: 0.40
Nodes (5): issuesSession(), cookieProblems(), parseSetCookie(), sessionCookieProblems(), signinCookieProblems()

### Community 120 - "configfile_test.go"
Cohesion: 0.26
Nodes (21): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+13 more)

### Community 121 - "createPages"
Cohesion: 0.44
Nodes (16): groupSecret(), createPages(), codeField(), field(), frame(), hidden(), hide(), open() (+8 more)

### Community 122 - "managed-panel.ts"
Cohesion: 0.04
Nodes (77): createService (subscription-explorer), fetchAllSubscriptions, SempConfig, SempContext, buildBrokerUrl(), Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch() (+69 more)

### Community 123 - "runDirectChecks"
Cohesion: 0.15
Nodes (21): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+13 more)

### Community 124 - "user-management/service.ts"
Cohesion: 0.15
Nodes (14): ACCESS_PROMPT, AccessTest, LEVELS, createUserMgmtService(), ManagedUser, ModuleChoices, userPath(), UserPayload (+6 more)

### Community 125 - "auditMissing"
Cohesion: 0.50
Nodes (4): Browser and harness notes, auditMissing(), parseAuditLog(), wroteFile()

### Community 127 - "tls_api_test.go"
Cohesion: 0.19
Nodes (24): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+16 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.05
Nodes (60): Circular Dependency Resolution, DEFAULT_MAX_MESSAGES_PER_QUEUE, showToast(), escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, showPayload() (+52 more)

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), clearDestTypedSecrets(), DEST_TARGET_LOCKED_TITLE (+34 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.09
Nodes (60): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+52 more)

### Community 140 - "connections/module.ts"
Cohesion: 0.04
Nodes (71): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+63 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.09
Nodes (30): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+22 more)

### Community 148 - "main.go"
Cohesion: 0.13
Nodes (11): boolEnv(), main(), parseStrictBool(), printVersionIfRequested(), serve(), serveUntilStopped(), TestPrintVersionIfRequested(), process (+3 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.05
Nodes (57): connName(), sessionEnders(), userName(), brokerTarget, clientRec, connRec, connsDoc, newContractEnv() (+49 more)

### Community 155 - "logging.go"
Cohesion: 0.11
Nodes (14): adminHandler, clientLogger(), clientString(), recoverPanics(), requestLogger(), requestUser(), TestRecoverPanics_LogsAndAnswers500(), TestRequestLogger_OutsideTheChain() (+6 more)

### Community 156 - "vite-build.mjs"
Cohesion: 0.13
Nodes (15): classify(), GATED, isLatestVulnerable(), main(), npm(), versions(), argv, child (+7 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "loadOrGenerateServerCert"
Cohesion: 0.11
Nodes (16): browserKeyProblem(), fileExists(), formatFingerprint(), loadOrGenerateServerCert(), parseKeyPEM(), TestBrowserKeyProblem(), TestFileExists(), TestFormatFingerprint() (+8 more)

### Community 161 - "fileConfigFromConfig"
Cohesion: 0.17
Nodes (18): checkAuditOnFailure(), defaultFileConfig(), fileConfigFromConfig(), onFailureOrDefault(), prefixStrings(), TestFileConfig_CloneIsIndependent(), TestFileConfigFromConfig_NewFieldsUnsetGiveTheDefaults(), TestToConfig_Audit() (+10 more)

### Community 162 - "decodeConfigFile"
Cohesion: 0.19
Nodes (14): Writing a config.yaml by hand (development only), configVerifier(), decodeConfigFile(), encodeConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten() (+6 more)

### Community 163 - "settingsFile"
Cohesion: 0.19
Nodes (8): flattenSettings(), settingsChanges(), sortedKeys(), TestBackup_SettingsChangesNamesDottedKeys(), TestSettingsChanges_ListsAuditOnFailure(), TestSettingsChanges_ListsTwoFactor(), settingsFile, stagedSettings

### Community 164 - "defaultConfig"
Cohesion: 0.22
Nodes (12): seedConfigFile(), TestSeedConfigFile_GoesThroughTheJournal(), TestSeedConfigFile_WriteFailureIsActionable(), newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), defaultConfig(), TestConfig_InDataDir(), TestBuildManagedRoutes_StoreErrorIsReturned() (+4 more)

### Community 165 - ".checkSettings"
Cohesion: 0.40
Nodes (5): Gateway contract cases, apiError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.13
Nodes (9): ALL, bundleSources(), productSources(), REPO_ROOT, rows(), fire(), GLOBALS, pending() (+1 more)

### Community 170 - "main"
Cohesion: 0.17
Nodes (16): playwright-core, browserOn(), COMPOSE, describeBroker(), insecure(), certFingerprint(), hostRootBundle(), maskSecrets() (+8 more)

### Community 171 - "sealer"
Cohesion: 0.30
Nodes (3): sealer, storeHeader(), storeRole

### Community 172 - "End-to-end run"
Cohesion: 0.15
Nodes (13): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, Broker details, End-to-end run (+5 more)

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.13
Nodes (36): assertNoTempFiles(), errorCode(), expect(), logLine(), saveAnswer, decodeSave(), managedEnv, mustRead() (+28 more)

### Community 175 - "crypto/tls.Certificate"
Cohesion: 0.31
Nodes (4): certHolder, newCertHolder(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 176 - "logStartup"
Cohesion: 0.24
Nodes (7): levelName(), TestLevelName(), logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), parseLogLevel(), TestParseLogLevel()

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.10
Nodes (25): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+17 more)

### Community 178 - "tls_test.go"
Cohesion: 0.10
Nodes (43): testCertPair, testCertSpec, encodeCertificates(), probeWritable(), recoverTLSPair(), equalCertJSON(), fingerprintOf(), keyBodyLine() (+35 more)

### Community 179 - ".ServeHTTP"
Cohesion: 0.28
Nodes (4): isWebSocketUpgrade(), parseSMFPath(), sameOriginSocket(), smfPath

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "Code Standards"
Cohesion: 0.25
Nodes (8): Code Standards, code:ts (import { required } from '../../core/dom';), DOM Access, Error Handling, Event Handling, File Organization, Modals, TypeScript / JavaScript

### Community 182 - "runChecks"
Cohesion: 0.13
Nodes (34): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), basisMoved(), createCookieJar(), jsonFindings() (+26 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "Cutting a release"
Cohesion: 0.25
Nodes (8): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch), Cutting a release

### Community 185 - "main_test.go"
Cohesion: 0.12
Nodes (38): acceptWatch, envOr(), loadConfig(), expectLogged(), gatewayClient(), gatewayDir(), startServe(), TestEnvOr() (+30 more)

### Community 186 - "buildTrustPool"
Cohesion: 0.25
Nodes (8): appendPEMCerts(), buildTrustPool(), TestAppendPEMCerts_CountsCertsSkipsNonCert(), TestBuildTrustPool_AddsCerts(), TestBuildTrustPool_NoDir(), TestBuildTrustPool_RejectsFile(), TestBuildTrustPool_SkipsFilesWithoutACertificate(), TestBuildTrustPool_UnreadableDirStopsTheStart()

### Community 188 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 189 - "go_pkg_testing"
Cohesion: 0.10
Nodes (11): TestFileConfig_EveryKeyIsClassifiedOnce(), TestLive_ApplySwapsEveryLiveKey(), TestLive_TwoFactorIsLive(), yamlLeaves(), TestRecoverPanics_LetsAbortHandlerThrough(), TestEntitled(), TestMatchGlob_Conformance(), TestRestartInPlace_ExitsWithStatusZero() (+3 more)

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
Cohesion: 0.22
Nodes (10): keyLine(), dnsRule(), dnsServers(), ipRule(), issueCert(), issueExpiredCert(), makeCA(), resolutionOverride() (+2 more)

## Ambiguous Edges - Review These
- `queue-copy ui-modal` → `tests core/dom`  [AMBIGUOUS]
  tests/core/dom.test.ts · relation: conceptually_related_to

## Knowledge Gaps
- **167 isolated node(s):** `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node`, `@vitest/coverage-v8`, `eslint` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1245 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `store`, `net/http.ResponseWriter`, `log/slog.Logger`, `managed-api.ts`, `checksums`, `newManagedEnv`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `settings.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13227513227513227 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `writer_test.go`, `loadModuleDOM`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Are the 82 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 82 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._