# Graph Report - smu-dirty  (2026-11-17)

## Corpus Check
- 352 files · ~689,661 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 31 file(s) not represented in the graph (top: .css 24, (none) 6, .dockerignore 1)

## Summary
- 5038 nodes · 16494 edges · 179 communities (143 shown, 36 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2305 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2dea3922`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- newStoreWithFixtures
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
- error-codes.test.ts
- gateway-settings/module.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- fileConfigFromConfig
- tls-certificates/module.test.ts
- backup.ts
- storecrypt_test.go
- log/slog.Logger
- Filter Messages Dialog
- logger.ts
- dist/js/solclient.js (Solace JS SDK)
- live
- log/slog.Logger
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
- Writing to the store
- variants.test.ts
- gateway/types.ts
- tests variants
- ui-modal.ts
- vite-build.mjs
- configfile.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- Code Standards
- defaultConfig
- Managed Variant (RBAC)
- store_test.go
- queue-source.ts
- sealer
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- Cutting a release
- SEMP v2 Paged Discovery (core library)
- socketRegistry
- Administration (`/solAdmin`)
- broker/store.ts
- tls.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- configfile_test.go
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- user-management/module.ts
- CSS Organization
- runDirectChecks
- freshTotp
- tls.ts
- newFakeClock
- Audit trail
- newManagedEnv
- sempContext Test Suite
- dev.ps1
- Features
- totpCode
- smf_test.go
- package.json
- Blob URL deferred revoke
- SEMP v1 XML response parsing
- backup/module.ts
- Provisioned Mode
- state.ts
- Deployment Options
- managed-api.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- putConn
- Provisioned demo (`provisioned-demo.html`)
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- pages.ts
- config
- End-to-end run
- How the tests are organized
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
- keyfile_test.go
- quietLogger
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- decodeConfigFile
- User Guide
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- secret
- Audit trail
- testing.T
- connection-management/service.ts
- queue-copy/ui-events.ts
- tls_test.go
- verifyViaSempV1
- npm-audit-gate.mjs
- runChecks
- tsconfig.test.json
- main_test.go
- compose.ts
- ref_node_path
- Two-factor sign-in
- issueCert

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 177 edges
2. `vitest` - 120 edges
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

## Communities (179 total, 36 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.07
Nodes (46): gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), TestRootHandler_UnknownPathsAreNotFoundInGatewayMode(), appIndexFile(), contextWithTarget(), dropSessionCookie(), dropSessionSetCookie() (+38 more)

### Community 1 - "newStoreWithFixtures"
Cohesion: 0.15
Nodes (18): passwordCheck, savedUser, TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(), newStoreWithFixtures(), putUser(), TestStore_CheckPassword(), TestStore_CRUD_RaceSafe() (+10 more)

### Community 2 - "createGateway"
Cohesion: 0.08
Nodes (48): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), mockCode() (+40 more)

### Community 3 - "connections/module.test.ts"
Cohesion: 0.07
Nodes (14): MAX_MESSAGES_PER_QUEUE, ConnectionConfig, TaggedLogger, INPUT_DEBOUNCE_MS, config, SWITCH_CONNECT_TIMEOUT_MS, SWITCH_DISCONNECT_TIMEOUT_MS, VpnSwitch (+6 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.06
Nodes (51): backupName(), diffByName(), fileOfSchedule(), monthSlot(), newBackupService(), nextRun(), partialName(), sameRecord() (+43 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.11
Nodes (24): createNotificationCenter(), changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell() (+16 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.10
Nodes (18): DEST_TARGET_LOCKED_TITLE, connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER, dialling(), dialMock (+10 more)

### Community 10 - "settings.ts"
Cohesion: 0.06
Nodes (60): isTwoFactorMode(), usersProblem(), declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape() (+52 more)

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
Cohesion: 0.17
Nodes (20): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), AccessExplanation, AccessLevel, ALWAYS_VISIBLE (+12 more)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.15
Nodes (28): txn, wfix, classifyStoreError(), newStaleBasis(), newWFix(), recoverValue(), TestClassifyStoreError_OneMappingForEveryHandler(), TestTxn_StagingAPathTwiceKeepsTheLast() (+20 more)

### Community 19 - "ManagedResult"
Cohesion: 0.20
Nodes (4): ManagedResult, ManagedService, ConnMgmtService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.11
Nodes (16): code:bash (npm ci), code:bash (gh run rerun <run-id> --failed), code:bash (# 1. Bump version, merge to main), Day-to-day branching, Git Workflow & Release Process, Image tags, Pages deploy, Pre-release checklist (local) (+8 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "error-codes.test.ts"
Cohesion: 0.20
Nodes (11): MANAGED_ERROR_CODES, call(), CLIENT, FAULTS, GOLDEN, Gw, NOT_SIMULATED, PAIR (+3 more)

### Community 24 - "gateway-settings/module.ts"
Cohesion: 0.05
Nodes (41): askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE, staleMessage(), confirmDialog(), ConfirmOptions, createGate() (+33 more)

### Community 25 - "pages_test.go"
Cohesion: 0.13
Nodes (76): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, isEnrolled() (+68 more)

### Community 26 - "vitest"
Cohesion: 0.04
Nodes (100): Factory Pattern, Integration tests, Module tests, createService (subscription-explorer), vitest, DeploymentConfig, SempContext, createEventBus() (+92 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.06
Nodes (43): playwright-core, aliasLookup(), askLine(), askSecret(), basic(), broker, brokerSecrets, browserOn() (+35 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.06
Nodes (54): RFC-5280, RFC-6238, Browser and harness notes, issuesSession(), aliasAddress(), AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing() (+46 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.12
Nodes (18): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS, DIRECT_BUNDLES (+10 more)

### Community 30 - "fileConfigFromConfig"
Cohesion: 0.14
Nodes (20): checkAuditOnFailure(), checkModuleIDs(), defaultFileConfig(), fileConfigFromConfig(), moduleCatalog(), onFailureOrDefault(), TestDecodeConfigFile_MissingKeysKeepDefaults(), TestFileConfig_CloneIsIndependent() (+12 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.06
Nodes (44): Global hooks, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList() (+36 more)

### Community 32 - "backup.ts"
Cohesion: 0.05
Nodes (98): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+90 more)

### Community 33 - "storecrypt_test.go"
Cohesion: 0.12
Nodes (19): checksums, fileSum, newChecksums(), TestChecksums_AbsenceIsRemembered(), TestChecksums_AnUnreadableFileIsNotAChangeOnDisk(), TestChecksums_AreKeyedAndPinned(), TestChecksums_AStoreKeyOfTheWrongLengthIsRefused(), TestChecksums_CheckComparesTheDiskWithMemory() (+11 more)

### Community 34 - "log/slog.Logger"
Cohesion: 0.06
Nodes (31): withClient(), auditor, configSource, newDialer(), dialer, hostedHandler, live, liveSettings (+23 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.04
Nodes (45): Adding a New Module, AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL (+37 more)

### Community 38 - "live"
Cohesion: 0.08
Nodes (47): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+39 more)

### Community 39 - "log/slog.Logger"
Cohesion: 0.09
Nodes (21): Layout of tests, checkJournalName(), commitJournal(), journalTargetNames(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftovers() (+13 more)

### Community 40 - "tlsManager"
Cohesion: 0.06
Nodes (25): Security model, What it does not enforce, What the gateway enforces, certHolder, deadHijacker, dialUpstreamTLS(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2() (+17 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.09
Nodes (26): Changing the TLS files, auditCall, auditWriter, auditWrote, smfPathFor(), connectionSaveAction(), decodeJSON(), decodeJSONLimit() (+18 more)

### Community 42 - "time.Time"
Cohesion: 0.09
Nodes (24): activeTicket, bucket, clientWatch, newRateWindow(), failures, fakeAfter, loginLimits, rateWindow (+16 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.05
Nodes (47): BACKUP_ITER, BackupDeps, BackupsState, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult, responseHeaders() (+39 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.24
Nodes (19): TestRecoverPanics_LetsAbortHandlerThrough(), TestBuildManagedRoutes_StoreErrorIsReturned(), newCapturingLogger(), loadStore(), bootstrapFixture(), envOf(), TestLoadStore_BootstrapFromEnvironmentIsNeverLogged(), TestLoadStore_BootstrapGeneratedPasswordIsLoggedOnceAndMustChange() (+11 more)

### Community 45 - "panel.ts"
Cohesion: 0.11
Nodes (38): ManagedDemo, authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button() (+30 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.19
Nodes (23): openAuditor(), fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine() (+15 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.19
Nodes (35): commitStep, newJournal(), recoverDataDir(), crashAfter(), damageTemps(), eachTemp(), failAfter(), newJFix() (+27 more)

### Community 49 - "authPages"
Cohesion: 0.07
Nodes (41): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+33 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 52 - "Writing to the store"
Cohesion: 0.23
Nodes (11): Writing to the store, mergeByName(), importStaged, sectionImport, checkRev(), countAdmins(), runImport(), TestStore_OnChangeFiresAfterACommittedEdit() (+3 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.09
Nodes (27): QueueSubscriptionExplorerModule, ACTIVE_MODULES, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES, MODULE_ENTRIES (+19 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.04
Nodes (53): QGlob, TwoFactorMode, BackupDoc, anyMatch(), cloneConn(), createStore(), DeleteConnResult, DeleteUserResult (+45 more)

### Community 56 - "ui-modal.ts"
Cohesion: 0.30
Nodes (13): canOperate(), rbacReadOnly(), resetTransientState(), buildDestSummary(), buildSourceSummary(), destinationRefusal(), effectiveSourceAccess(), evaluateStartGate() (+5 more)

### Community 57 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 58 - "configfile.go"
Cohesion: 0.08
Nodes (32): Adding a gateway config.yaml setting, flattenSettings(), checkRenamedEnv(), defaultSecretPaths(), envOverrides(), hostedEnv(), insecureEnv(), intInRange() (+24 more)

### Community 59 - "Testing"
Cohesion: 0.22
Nodes (8): Contents, Coverage policy, Gateway contract cases, Running the tests, Testing, Thresholds and floors, v8 ignore policy, Who this is for

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
Cohesion: 0.19
Nodes (10): newLive(), TestLive_ApplyCarriesSkipVerifyIntoTheTrustHolder(), defaultConfig(), TestBuildManagedRoutes_UnreadableScheduleIsReturned(), TestNewManagedRouting_AuditLogErrorIsReturned(), TestNewManagedRouting_Enabled(), newSettingsFile(), settingsRig() (+2 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.14
Nodes (48): currentUser(), enrolViewer(), err2s(), mustHash(), newStoreFixture(), signsIn(), storedHash(), TestLoadStore_EmptyOrMissingConnectionsFileYieldsNoBrokers() (+40 more)

### Community 66 - "queue-source.ts"
Cohesion: 0.11
Nodes (25): Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom(), Scope, sempQueueSource() (+17 more)

### Community 67 - "sealer"
Cohesion: 0.25
Nodes (5): sealer, adminSeed(), bootstrapUsers(), storeHeader(), storeRole

### Community 68 - "Deployment Guide"
Cohesion: 0.12
Nodes (11): 1. Solace JavaScript SDK (`solclient.js`), 2. JSZip (`jszip.min.js`), code:bash (docker pull ghcr.io/solacelabs/solace-msg-utility:latest), Configuration, CORS, Deployment Guide, External Runtime Dependencies, Graceful Degradation (+3 more)

### Community 69 - "managed.go"
Cohesion: 0.10
Nodes (28): auditPre, bodyRev, clientJSON, clientSeenJSON, connJSON, connListJSON, connSaveJSON, connChanges() (+20 more)

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

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.04
Nodes (108): allQueues(), BINARY_SAMPLE, buildMessage(), CONTENT_TYPES, DESTINATION_FIELDS, findQueueAnyVpn(), getQueue(), key() (+100 more)

### Community 78 - "tls.go"
Cohesion: 0.03
Nodes (61): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, changedOnDiskError, clientGoneError, contractAllStrings(), contractNormalize() (+53 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "configfile_test.go"
Cohesion: 0.26
Nodes (21): resolveConfig(), clearSeedEnv(), removedNames(), TestEnvOverrides_EveryVariableAndBoolParsing(), TestModuleSettings_ForUser(), TestResolveConfig_FileWinsAndReportsOverrides(), TestResolveConfig_IgnoresTheRemovedAppDir(), TestResolveConfig_IgnoresTheRemovedStoreKeys() (+13 more)

### Community 83 - "Kernel Test Suite"
Cohesion: 0.40
Nodes (4): copyToClipboard button feedback test, createMockModule (test helper), setupDOM (test helper), Kernel Test Suite

### Community 84 - "Direct demo (`demo.html`)"
Cohesion: 0.25
Nodes (8): Connecting, Contents, Demo controls, Demos, Direct demo (`demo.html`), Opening the demo, The demo topology, What is not in the demo

### Community 86 - "Queue Copy: Verify Flow & Broker Bug Workaround"
Cohesion: 0.50
Nodes (4): Access-type capture (gate for Copy and Move), Queue Copy: Verify Flow & Broker Bug Workaround, Run engine: two-phase model, Two-call SEMP v1 workaround

### Community 87 - "Queue Browser Internal Architecture"
Cohesion: 0.50
Nodes (4): Circular Dependency Resolution, code:block8 (queue-browser/), code:block9 (module.ts (install):), Queue Browser Internal Architecture

### Community 88 - "user-management/module.ts"
Cohesion: 0.06
Nodes (46): AdminTableOptions, createRowList(), addRow(), clear(), count(), readRows(), sync(), renderAdminRows() (+38 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "runDirectChecks"
Cohesion: 0.15
Nodes (22): bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath(), drain() (+14 more)

### Community 91 - "freshTotp"
Cohesion: 0.29
Nodes (8): freshCode(), base32Decode(), freshTotp(), totpAt(), totpCode(), totpStep(), wrongTotp(), sleep()

### Community 92 - "tls.ts"
Cohesion: 0.08
Nodes (34): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+26 more)

### Community 93 - "newFakeClock"
Cohesion: 0.22
Nodes (22): fakeClock, newSessions(), newSigninTickets(), newFakeClock(), newTestTickets(), TestSessionCookie_FlagsAndRequestLookup(), TestSessions_AbsoluteExpiry(), TestSessions_CreateSweepsExpired() (+14 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.09
Nodes (78): Auditing an action, auditLog, TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), changeUsersBehindTheWriter(), connsWrote(), managedEnv (+70 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totpCode"
Cohesion: 0.32
Nodes (16): newTOTPGuard(), loadTOTPVectors(), TestTOTP_NewSecretRoundTripsThroughVerify(), TestTOTPCode_RefusesASecretThatIsNotBase32(), TestTOTPCode_RFC6238Vectors(), TestTOTPGuard_AWrongCodeRecordsNothing(), TestTOTPGuard_ConcurrentUseOfOneCodePassesOnce(), TestTOTPGuard_ForgetStartsAgain() (+8 more)

### Community 100 - "smf_test.go"
Cohesion: 0.10
Nodes (32): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+24 more)

### Community 101 - "package.json"
Cohesion: 0.09
Nodes (21): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+13 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.07
Nodes (45): BLOB_URL_REVOKE_DELAY_MS, downloadBlob(), managedRequest(), describeSchedule(), diffLines(), formatUtc(), MAX_IMPORT_BYTES, pad() (+37 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.12
Nodes (17): Administer, Audit settings, Back up and restore, Configure, Connection modes, Contents, Environment variables, How it works (+9 more)

### Community 106 - "state.ts"
Cohesion: 0.08
Nodes (35): SolacePublisher, escapeXml(), ACCUMULATE_IDLE_MS, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks (+27 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "managed-api.ts"
Cohesion: 0.04
Nodes (81): DEFAULT_MAX_MESSAGES_PER_QUEUE, PROVISIONED_SDK_CONNECT, SEMP_PROBE_TIMEOUT_MS, ConnectionCredentials, SempConfig, SolaceConfig, setError(), buildBrokerUrl() (+73 more)

### Community 111 - "putConn"
Cohesion: 0.38
Nodes (6): savedConn, currentConn(), putConn(), TestStore_ListConnections_ReturnsDeepCopy(), TestStore_SaveConnection_MergeSecretsOnEdit(), TestStore_SaveConnection_PasswordOnlyKeepsRev()

### Community 112 - "Provisioned demo (`provisioned-demo.html`)"
Cohesion: 0.33
Nodes (6): Demo accounts, Demo controls, How it differs from a real gateway, Provisioned demo (`provisioned-demo.html`), The demo brokers, Trying two-factor sign-in

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.12
Nodes (16): ConnectionsModule, account(), connectToB1Vpn1(), connectWithSession(), el(), hidden(), hostedMock, NO_SESSION (+8 more)

### Community 118 - "pages.ts"
Cohesion: 0.48
Nodes (15): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+7 more)

### Community 119 - "config"
Cohesion: 0.16
Nodes (12): config, levelName(), TestLevelName(), logStartup(), modeName(), TestLogStartup_ShowsAtEveryLevel(), parseLogLevel(), TestParseLogLevel() (+4 more)

### Community 120 - "End-to-end run"
Cohesion: 0.40
Nodes (5): Broker details, End-to-end run, Requirements, What it changes, What it does

### Community 121 - "How the tests are organized"
Cohesion: 0.40
Nodes (5): Demo and fake gateway suite, Go suite, How the tests are organized, Type check and lint, Web suite

### Community 122 - "utils.ts"
Cohesion: 0.09
Nodes (31): generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString() (+23 more)

### Community 123 - "backup_test.go"
Cohesion: 0.09
Nodes (46): newBackupKey(), openBackup(), sealBackup(), settingsChanges(), sortedKeys(), envelope(), mustSealer(), reseal() (+38 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (19): Build commands, Build internals, Build-time feature flags, Building variants, Code Conventions, Contents, CSS, Developer Guide (+11 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.15
Nodes (27): clip(), decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestClip(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals() (+19 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.04
Nodes (77): Circular Dependency Resolution, DOM Access, Laying out an admin page, pickQueue() reusable picker, attachBackdropClose(), required(), escapeHtml(), solaceErrorText() (+69 more)

### Community 132 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets() (+34 more)

### Community 138 - "backup_api_test.go"
Cohesion: 0.14
Nodes (37): decodeTo(), expectInvalid(), expectRev(), expectStale(), managedEnv, jsonBody(), scheduleBody(), staleBasis() (+29 more)

### Community 139 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 140 - "connections/module.ts"
Cohesion: 0.04
Nodes (57): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+49 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.06
Nodes (54): boot(), boot(), clearSnapshot(), DemoSnapshot, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY, writeSnapshot() (+46 more)

### Community 148 - "queue-browser/service.test.ts"
Cohesion: 0.07
Nodes (39): Cross-references, Defensive-guard tests, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM, Writing tests (+31 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (54): connName(), sessionEnders(), userName(), brokerTarget, clientRec, connRec, connsDoc, TestContract_Validation() (+46 more)

### Community 155 - "keyfile_test.go"
Cohesion: 0.35
Nodes (11): createExclusive(), loadStoreKey(), keyDir(), TestCreateExclusive_NeverReplacesAFile(), TestLoadStoreKey_AcceptsANewlineAndWarnsOnLooseMode(), TestLoadStoreKey_CreateFailures(), TestLoadStoreKey_GeneratesOnAFreshVolumeOnly(), TestLoadStoreKey_RefusesAMalformedKey() (+3 more)

### Community 156 - "quietLogger"
Cohesion: 0.16
Nodes (35): adminHandler, fixed(), newTestAuditor(), newAdminHandler(), TestAdminHandler_DisabledIs404(), TestAdminHandler_DoesNotFallBackToTheSPA(), TestAdminHandler_EnabledButNotDeployed(), TestAdminHandler_ServesBundle() (+27 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.27
Nodes (12): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+4 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 162 - "decodeConfigFile"
Cohesion: 0.17
Nodes (16): Writing a config.yaml by hand (development only), configVerifier(), decodeConfigFile(), encodeConfigFile(), seedConfigFile(), TestConfigVerifier_RefusesWhatAStartWouldRefuse(), TestDecodeConfigFile_EmptyBadYAMLBadVersion(), TestDecodeConfigFile_OnFailureDefaultsAndIsWritten() (+8 more)

### Community 166 - "User Guide"
Cohesion: 0.08
Nodes (25): Caching, Confirm Queue Copy modal, Connection Profiles, Contents, Destination connection (Provisioned sessions), Destination target, Filter syntax, Important considerations (+17 more)

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 172 - "Audit trail"
Cohesion: 0.25
Nodes (8): Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks, restart()

### Community 174 - "testing.T"
Cohesion: 0.07
Nodes (67): errReader, fakeBroker, assertNoTempFiles(), TestFileConfig_EveryKeyIsClassifiedOnce(), yamlLeaves(), logLine(), isShowRPC(), answerJSON() (+59 more)

### Community 175 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.08
Nodes (28): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCard (+20 more)

### Community 178 - "tls_test.go"
Cohesion: 0.05
Nodes (74): testCertPair, testCertSpec, appendPEMCerts(), browserKeyProblem(), buildTrustPool(), encodeCertificates(), fileExists(), formatFingerprint() (+66 more)

### Community 179 - "verifyViaSempV1"
Cohesion: 0.32
Nodes (8): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1, fetchAllSubscriptions

### Community 181 - "npm-audit-gate.mjs"
Cohesion: 0.46
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 182 - "runChecks"
Cohesion: 0.10
Nodes (40): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), invalidProblem(), basisMoved(), certFingerprint() (+32 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 185 - "main_test.go"
Cohesion: 0.09
Nodes (48): acceptWatch, envOr(), loadConfig(), main(), newRootHandler(), printVersionIfRequested(), serve(), expectLogged() (+40 more)

### Community 188 - "ref_node_path"
Cohesion: 0.29
Nodes (3): moduleRegistryPlugin(), TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1190 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `Writing to the store` to `storecrypt_test.go`, `log/slog.Logger`, `store_test.go`, `newStoreWithFixtures`, `managed.go`, `backup_test.go`, `net/http.ResponseWriter`, `putConn`, `writer_test.go`, `gateway-settings/module.ts`, `store`, `Developer Guide`, `newManagedEnv`?**
  _High betweenness centrality (0.170) - this node is a cross-community bridge._
- **Are the 121 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 121 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.06868686868686869 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `gateway-settings/module.ts` to `backup/module.ts`, `user-management/module.ts`, `Writing to the store`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._