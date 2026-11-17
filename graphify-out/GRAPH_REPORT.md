# Graph Report - smu-dirty  (2026-11-17)

## Corpus Check
- 363 files · ~718,854 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 32 file(s) not represented in the graph (top: .css 25, (none) 6, .dockerignore 1)

## Summary
- 5204 nodes · 16948 edges · 193 communities (159 shown, 34 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 2313 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `695d945c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- proxy_test.go
- createManagedPanel
- createGateway
- connections/module.test.ts
- semp-client Test Suite
- Architecture
- backup_test.go
- core event-bus
- notification-center/index.ts
- dest-provisioned.test.ts
- relay.ts
- Solace Messaging (Client) Section
- Testing Requirements
- QueueBrowserModule (priority 30)
- Queue Browser Screenshot
- Modal Source Section
- ref_node_path
- scripts
- writer_test.go
- ManagedResult
- Git Workflow & Release Process
- vite.config.ts
- Results Table (VPN, Queue, Subscription columns)
- samples.test.ts
- managed-api.ts
- pages_test.go
- vitest
- e2e.mjs
- e2e-lib.mjs
- check-bundles.mjs
- copy-flow.test.ts
- tls-certificates/module.test.ts
- backup.ts
- tls_api.go
- backup.go
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
- fixtures.ts
- configfile_test.go
- Testing
- queue-discovery module
- Forward Message Dialog Screenshot
- Code Standards
- relay_test.go
- Managed Variant (RBAC)
- store_test.go
- queue-source.ts
- settings.ts
- Deployment Guide
- managed.go
- dev.sh
- compilerOptions
- Contributing
- file-kind.ts
- SEMP v2 Paged Discovery (core library)
- go_pkg_strings
- Administration (`/solAdmin`)
- broker/store.ts
- tls.go
- Module 2: Queue Browser
- DOM Template System
- Cross-Module Event Flow
- copy-flow.test.ts
- Kernel Test Suite
- Direct demo (`demo.html`)
- Solace Client Service
- Queue Copy: Verify Flow & Broker Bug Workaround
- Queue Browser Internal Architecture
- user-management/module.test.ts
- CSS Organization
- runDirectChecks
- serveUntilStopped
- tls.ts
- managed-service.ts
- server.test.ts
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
- state.ts
- Deployment Options
- managed-panel.ts
- queue-subscription-explorer parse
- queue-subscription-explorer ui
- log/slog.Logger
- gateway-settings/module.test.ts
- <!-- @module-templates --> marker
- README
- managed-panel.test.ts
- proxy.go (handlers)
- tls.go (server cert + trust pool)
- router.ts
- newPWAHandler
- go_pkg_os
- createPages
- utils.ts
- backup_test.go
- Developer Guide
- passwordForm
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
- testing.T
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
- net.Conn
- vite-build.mjs
- module-registry-plugin.mjs
- queue-discovery ui.js
- ConnectionsModule Test Suite
- wireUiEvents
- crypto/tls.Certificate
- ManagedPanel
- semp-v1.ts
- connection-management/service.ts
- .checkSettings
- User Guide
- verifyViaSempV1
- code:ts (for await (const page of createSempDiscovery(sempCtx).fetchV)
- shell-loader.test.ts
- checkedAlias
- setup.ts
- Audit trail
- csp.mjs
- settings_test.go
- checksums
- npm-audit-gate.mjs
- queue-copy/ui-events.ts
- tls_test.go
- service-verify.ts
- Configure
- End-to-end run
- runChecks
- tsconfig.test.json
- hashRecoveryCode
- main_test.go
- createConnTabs
- compose.ts
- Module 3: Queue Copy
- newContractEnv
- Two-factor sign-in
- TestProbeWritable
- issueCert

## God Nodes (most connected - your core abstractions)
1. `newManagedEnv()` - 178 edges
2. `vitest` - 126 edges
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

## Communities (193 total, 34 thin omitted)

### Community 0 - "proxy_test.go"
Cohesion: 0.06
Nodes (51): adminHandler, hostedInfo, logStartup(), modeName(), gateway config struct + loadConfig, go-web-proxy main (gateway entrypoint), root mux (hosted/proxy/pwa routing), validateConnModes() (+43 more)

### Community 1 - "createManagedPanel"
Cohesion: 0.22
Nodes (21): isSessionEnded(), outcomeDetails(), createManagedPanel(), adopt(), announceMessaging(), announceSemp(), clearSession(), connectSolace() (+13 more)

### Community 2 - "createGateway"
Cohesion: 0.09
Nodes (46): clock(), acceptedStep(), base32(), frac32(), groupSecret(), HASH_RULE, hashRecovery(), isTwoFactorMode() (+38 more)

### Community 3 - "connections/module.test.ts"
Cohesion: 0.09
Nodes (18): TaggedLogger, createVpnSwitch(), connectTo(), fail(), finish(), request(), switchFrom(), waitFor() (+10 more)

### Community 4 - "semp-client Test Suite"
Cohesion: 0.14
Nodes (5): queue-subscription-explorer service Test Suite, makeHooks (test helper), semp-client Test Suite, allPages async generator drain helper, semp-discovery Test Suite

### Community 5 - "Architecture"
Cohesion: 0.10
Nodes (8): Architecture, code:block10 (Solace Broker), code:block6 (Kernel), code:ts (import { logger } from '../../core/logger';), Data Flow: Message Lifecycle, Dependency Injection, Logging, Technology Decisions

### Community 6 - "backup_test.go"
Cohesion: 0.10
Nodes (14): backupName(), monthSlot(), newBackupService(), nextRun(), partialName(), TestBackup_NextRun(), TestBackup_ScheduleDocProblem(), TestBackup_ScheduleProblem() (+6 more)

### Community 7 - "core event-bus"
Cohesion: 0.08
Nodes (30): core event-bus, core solace-publisher service, loadModuleDOM helper, resetQueueBrowserState helper, queue-copy module, queue-discovery module, queue-subscription-explorer module, queue-copy service-copy (+22 more)

### Community 8 - "notification-center/index.ts"
Cohesion: 0.10
Nodes (23): changed(), defaultStorage(), el(), isEntry(), LEVELS, log, mountNotificationBell(), row() (+15 more)

### Community 9 - "dest-provisioned.test.ts"
Cohesion: 0.08
Nodes (27): DEST_TARGET_LOCKED_TITLE, cardError(), cardStatus(), connectBtn(), connectedWithTarget(), { destSempConnect, destSempDisconnect, destSolConnect, destSolDisconnect }, { destSempHooks, destSolHooks }, DIALER (+19 more)

### Community 10 - "relay.ts"
Cohesion: 0.19
Nodes (17): declRefused(), forward(), headerOf(), isShowRpc(), parseRelayPath(), pathUnescape(), queryOk(), refuse() (+9 more)

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

### Community 16 - "ref_node_path"
Cohesion: 0.18
Nodes (7): moduleRegistryPlugin(), ALL, bundleSources(), productSources(), REPO_ROOT, TS path aliases (@core, @modules), vite-env.d.ts (__APP_VERSION__)

### Community 17 - "scripts"
Cohesion: 0.09
Nodes (23): scripts, audit:gate, build, build:admin, build:all, build:demo, build:no-payload, build:no-queue-copy (+15 more)

### Community 18 - "writer_test.go"
Cohesion: 0.10
Nodes (37): Writing to the store, fileOfSchedule(), TestBackupService_LoadRefusesADamagedSchedule(), savedConn, checkRev(), txn, wfix, classifyStoreError() (+29 more)

### Community 19 - "ManagedResult"
Cohesion: 0.15
Nodes (5): ManagedResult, ManagedService, ConnMgmtService, SettingsService, UserMgmtService

### Community 20 - "Git Workflow & Release Process"
Cohesion: 0.08
Nodes (24): 1. Bump `package.json`, 2. Tag the release commit, 3. Publish the GitHub Release, code:bash (npm ci), code:bash (git checkout -b release/3.4.0), code:bash (git checkout main), code:bash (gh release create v3.4.0 \), code:bash (gh run watch) (+16 more)

### Community 21 - "vite.config.ts"
Cohesion: 0.11
Nodes (10): scripts/vite-build.mjs wrapper, MOCK_REDIRECTS table, appVersion, DEMO_BOOTS, DemoRedirect, injectModuleTemplates plugin, readBuildInput env-var bridge, renameHtmlAsset plugin (+2 more)

### Community 22 - "Results Table (VPN, Queue, Subscription columns)"
Cohesion: 0.13
Nodes (18): About Panel (description of subscription explorer), Active Nav Item: Queue Subscriptions, Filter Input: Queue, Filter Input: Subscription (wildcard-capable, e.g. test/*), Filter Input: VPN, Load Action (initial data fetch), Rows: VPN with Long Names and Spaces, Rows: VPN with Many Queues (QUEUE-000, QUEUE-001, QUEUE-002) (+10 more)

### Community 23 - "samples.test.ts"
Cohesion: 0.12
Nodes (28): The payload samples queue, attachmentBytes(), AttachmentPayload, binaryPayload(), bytesToBase64(), classifyAttachment(), PayloadFileSource, TEXT_TYPE_EXT (+20 more)

### Community 24 - "managed-api.ts"
Cohesion: 0.03
Nodes (82): Adding a New Module, DOM Access, Laying out an admin page, pickQueue() reusable picker, askReload(), goneMessage(), handleConflict(), STALE_IMPORT_MESSAGE (+74 more)

### Community 25 - "pages_test.go"
Cohesion: 0.14
Nodes (68): beginEnrol(), codeForm(), confirmForm(), cookieEnded(), expectPage(), expectRedirect(), managedEnv, isEnrolled() (+60 more)

### Community 26 - "vitest"
Cohesion: 0.03
Nodes (94): Integration tests, vitest, createNotificationCenter(), DeploymentConfig, PROVISIONED_SDK_CONNECT, createEventBus(), createManagedProfile(), DialConn (+86 more)

### Community 27 - "e2e.mjs"
Cohesion: 0.07
Nodes (37): askLine(), askSecret(), broker, brokerSecrets, browserOn(), closers, collectDetails(), COMPOSE (+29 more)

### Community 28 - "e2e-lib.mjs"
Cohesion: 0.05
Nodes (59): RFC-5280, RFC-6238, Browser and harness notes, freshCode(), issuesSession(), AUDIT_FIELDS, AUDIT_REQUIRED, auditMissing() (+51 more)

### Community 29 - "check-bundles.mjs"
Cohesion: 0.11
Nodes (19): RFC-2606, ADMIN_BUNDLE, ALLOWED_HOSTS, BUNDLE_CSP, checkBundles(), DEMO_BUNDLE, DEMO_FORBIDDEN, DEMO_MARKERS (+11 more)

### Community 30 - "copy-flow.test.ts"
Cohesion: 0.07
Nodes (33): PAYLOAD_SAMPLES, PayloadSample, BINARY_SAMPLE, CONTENT_TYPES, DESTINATION_FIELDS, PAYLOAD_TEMPLATES, publish(), publishRejection() (+25 more)

### Community 31 - "tls-certificates/module.test.ts"
Cohesion: 0.06
Nodes (45): Global hooks, EXPIRY_WARN_DAYS, expiryMark(), fillDetails(), formatUtc(), markElement(), MAX_PEM_BYTES, namesList() (+37 more)

### Community 32 - "backup.ts"
Cohesion: 0.06
Nodes (57): BackupKey, BackupProblem, BackupSchedule, Basis, canonConn(), canonRows(), canonUser(), concat() (+49 more)

### Community 33 - "tls_api.go"
Cohesion: 0.33
Nodes (5): clip(), TestClip(), tlsCertAnswerJSON, tlsPairJSON, tlsTrustAddJSON

### Community 34 - "backup.go"
Cohesion: 0.03
Nodes (42): checkAuditOnFailure(), auditCategory, connName(), userName(), backupEnvelope, backupKDF, backupProblem, changedOnDiskError (+34 more)

### Community 35 - "Filter Messages Dialog"
Cohesion: 0.16
Nodes (17): Add Property Filter Button, Apply Filter Button, Body Content Contains Filter, Cancel Button, Clear Filter Button, Destination Name Filter, Destination Type Filter, Filter Messages Dialog (+9 more)

### Community 36 - "logger.ts"
Cohesion: 0.06
Nodes (37): AppContext (Dependency Injection), Event Handling, EventBus (Cross-Module Communication), Factory Pattern, Key Concepts, The Module Contract, boot(), DEFAULT_LOG_LEVEL (+29 more)

### Community 38 - "log/slog.Logger"
Cohesion: 0.08
Nodes (47): clientACL(), clientIP(), normalizeAddr(), prefixContains(), aclChain(), prefixes(), rawStatusLine(), TestClientACL_Allowed() (+39 more)

### Community 39 - "contract_test.go"
Cohesion: 0.17
Nodes (15): contractAllStrings(), contractNormalize(), contractNormalizeCert(), contractNormalizeCerts(), contractNormalizeRevs(), contractResolveBody(), contractCase, contractCases (+7 more)

### Community 40 - "tlsManager"
Cohesion: 0.16
Nodes (12): parseCertificatePEM(), pemCertificates(), readableName(), equalCertJSON(), TestReadableName(), TestTrustFileName(), trustFileName(), tlsCertJSON (+4 more)

### Community 41 - "net/http.ResponseWriter"
Cohesion: 0.11
Nodes (20): auditCall, auditWriter, auditWrote, connectionSaveAction(), decodeJSON(), decodeJSONLimit(), pathTarget(), queryRev() (+12 more)

### Community 42 - "time.Time"
Cohesion: 0.08
Nodes (24): activeTicket, bucket, newRateWindow(), failures, fakeAfter, loginLimits, rateWindow, newUserCounter() (+16 more)

### Community 43 - "gateway/index.ts"
Cohesion: 0.05
Nodes (42): BACKUP_ITER, BackupDeps, BackupsState, DEMO_GATEWAY_MARKER, EnrolResult, GatewayFaults, GatewaySnapshot, PageResult (+34 more)

### Community 44 - "newCapturingLogger"
Cohesion: 0.11
Nodes (28): backupFixtureFrom(), TestBackupService_MissingKeyBesideAScheduleRefusesToStart(), backupFixture, parseStoreKey(), sealer, adminSeed(), bootstrapUsers(), loadStore() (+20 more)

### Community 45 - "panel.ts"
Cohesion: 0.14
Nodes (33): authenticatorSection(), rebuild(), refresh(), ManagedPanelDeps, managedSections(), TLS_READ_ONLY_ID, button(), connectionReference() (+25 more)

### Community 46 - "ui.selectMessage"
Cohesion: 0.33
Nodes (6): createServiceEvents, ui.getFullMessageJson, initDetails (ui-details), onBrowserUp handler, onMessage handler, ui.selectMessage

### Community 47 - "audit_test.go"
Cohesion: 0.21
Nodes (20): fileLines(), newAuditEnv(), TestAudit_AccessEntriesOnlyWhileEnabled(), TestAudit_ALostRecordIsLoggedLoudlyWithItsFields(), TestAudit_ConcurrentRecordsAreWholeLines(), TestAudit_EntryShapeFieldOrderAndTime(), TestAudit_MessageCannotBreakTheLine(), TestAudit_OversizedLineGoesToAnEmptyFile() (+12 more)

### Community 48 - "fileutil_test.go"
Cohesion: 0.05
Nodes (97): Layout of tests, commitStep, fakeClock, commitJournal(), journalTargetNames(), newJournal(), recoverDataDir(), sweepLeftovers() (+89 more)

### Community 49 - "authPages"
Cohesion: 0.08
Nodes (33): Adding a sign-in step, clientOf(), activeSession, auditFor(), signedInMsg(), signedInRecoveryMsg(), TestAudit_TwoFactorActionsAndMessages(), TestAuditFor_ActorAndClient() (+25 more)

### Community 50 - "queue-picker/index.ts"
Cohesion: 0.11
Nodes (26): applyQueueFilter(), applyVpnFilter(), attachHandlers(), chevronSvg(), createDialogDOM(), ensureCache(), fetchQueues(), fetchVpns() (+18 more)

### Community 52 - "trustHolder"
Cohesion: 0.12
Nodes (22): dialUpstreamTLS(), newReverseProxy(), newUpstreamTransport(), TestDialUpstreamTLS_FailsBeforeTheHandshakeWhenItCannotConnect(), TestDialUpstreamTLS_NegotiatesHTTP11OnlyEvenWhenTheServerOffersH2(), TestNewUpstreamTransport(), TestReverseProxy_BadPathReturns400(), TestReverseProxy_HTTPRoundTrip() (+14 more)

### Community 53 - "variants.test.ts"
Cohesion: 0.09
Nodes (30): QueueCopyModule, ACTIVE_MODULES, GATEWAY_ONLY, NEEDS_VENDOR_SCRIPTS, ACTIVE_MODULES, MODULE_ENTRIES, ACTIVE_MODULES, ACTIVE_MODULES (+22 more)

### Community 54 - "gateway/types.ts"
Cohesion: 0.06
Nodes (40): AccessExplanation, AccessLevel, ALWAYS_VISIBLE, findQueueRow(), findVpnRow(), matchesAny(), matchGlob(), MODULE_REQUIREMENTS (+32 more)

### Community 56 - "ui-modal.ts"
Cohesion: 0.15
Nodes (20): filterSempFetch(), isListedVpn(), rowField(), SempFetch, visibleQueueRows(), canOperate(), isQueueVisible(), isVpnVisible() (+12 more)

### Community 57 - "fixtures.ts"
Cohesion: 0.05
Nodes (52): MANAGED_ERROR_CODES, Fault, QUEUE_STATE, QueueFixture, QueueState, resetScenario(), scenario, ScenarioState (+44 more)

### Community 58 - "configfile_test.go"
Cohesion: 0.05
Nodes (85): Adding a gateway config.yaml setting, Writing a config.yaml by hand (development only), config, checkRenamedEnv(), configVerifier(), decodeConfigFile(), defaultFileConfig(), defaultSecretPaths() (+77 more)

### Community 59 - "Testing"
Cohesion: 0.15
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

### Community 63 - "relay_test.go"
Cohesion: 0.15
Nodes (20): errReader, fakeBroker, answerJSON(), newRelayEnv(), TestRelay_AddsTheStoredCredentialAndDropsTheBrowsers(), TestRelay_EntitlementIsTheBrokers(), TestRelay_InFlightCapPerUser(), TestRelay_IsAuditedOnlyWhileAccessIsOn() (+12 more)

### Community 64 - "Managed Variant (RBAC)"
Cohesion: 0.25
Nodes (8): Admin modules + the Go store, Build-time flag, Credential transform (posture only — algorithm is code-only), Discovery filtering + queue-browser guardrails (zero changes to those modules), Kernel gating, managed-connections (the bridge), Managed Variant (RBAC), RBAC state + matchers

### Community 65 - "store_test.go"
Cohesion: 0.11
Nodes (69): TestBackupService_ExportAndImportRoundTripTwoFactor(), savedUser, TestSockets_AfterCommitHookIsLevelTriggered(), TestSockets_OpenedWhileCommitsRunAreRefusedOrClosed(), currentConn(), currentUser(), enrolViewer(), err2s() (+61 more)

### Community 66 - "queue-source.ts"
Cohesion: 0.07
Nodes (28): ProvisionedConnectionCard, ProvisionedTarget, Access, accessKey(), filterPages(), permitsQueue(), permitsVpn(), queueSourceFrom() (+20 more)

### Community 67 - "settings.ts"
Cohesion: 0.07
Nodes (51): connsProblem(), usersProblem(), UpstreamAnswer, cidrList(), clone(), connModesProblem(), createSettings(), DEFAULTS (+43 more)

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

### Community 73 - "file-kind.ts"
Cohesion: 0.13
Nodes (23): detectKind(), FileKind, FTYP_BRANDS, has(), HEX_VIEW_BYTES, imageSize(), JPEG_SOF, jpegSize() (+15 more)

### Community 74 - "SEMP v2 Paged Discovery (core library)"
Cohesion: 0.33
Nodes (6): code:ts (// src/core/services/semp-discovery.ts), code:block12 (while (url) {), Consumers — the `QueueSource` seam, Mock service, SEMP v2 Paged Discovery (core library), Service contract

### Community 75 - "go_pkg_strings"
Cohesion: 0.09
Nodes (15): smfPathFor(), dialRequest, dialResponse, isShowRPC(), parseRelayPath(), safeSegment(), TestIsShowRPC(), relayPath (+7 more)

### Community 76 - "Administration (`/solAdmin`)"
Cohesion: 0.18
Nodes (11): Administration (`/solAdmin`), Backup & Restore, Certificates, Connection Management, Gateway Settings, Messages about the gateway's files, Opening the admin app, Restart gateway (+3 more)

### Community 77 - "broker/store.ts"
Cohesion: 0.09
Nodes (37): buildMessage(), buildSample(), key(), loadStore(), seed(), VPNS, AuthenticationScheme, DestinationType (+29 more)

### Community 78 - "tls.go"
Cohesion: 0.09
Nodes (21): backupFileInfo, backupRunJSON, backupScheduleJSON, backupStatusJSON, importBasis, importJSON, importPreviewJSON, importResultJSON (+13 more)

### Community 79 - "Module 2: Queue Browser"
Cohesion: 0.22
Nodes (9): Binding to a Queue, Deleting Messages, Downloading Messages, Filtering Messages, Forwarding Messages, Keyboard Shortcuts, Message Details, Message Table (+1 more)

### Community 80 - "DOM Template System"
Cohesion: 0.29
Nodes (7): Build flavors vs variants, code:block15 (src/modules/<id>/index.html   ← canonical per-module HTML), code:html (<!-- index.html (repo root) — shell only -->), code:block17 (build flow:), code:ts (// src/variants/full.ts — every module the default build shi), DOM Template System, Module registration — variant manifests

### Community 81 - "Cross-Module Event Flow"
Cohesion: 0.40
Nodes (5): code:block4 (Queue Copy                         Connections              ), code:block5 (Any Module                     Kernel                       ), Cross-Module Event Flow, State Change Propagation, VPN-switch handoff (Queue Copy / Queue Browser → Connections)

### Community 82 - "copy-flow.test.ts"
Cohesion: 0.13
Nodes (18): getQueue(), SessionEventCode, buildSolaceSdk(), sessions, createDurableQueueDestination(), createTopicDestination(), MockSession, payloads() (+10 more)

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
Cohesion: 0.14
Nodes (18): NO_OPERATE, NO_READ_ONLY, UserManagementModule, ADMIN, CHOICES, clickRow(), el(), hidden() (+10 more)

### Community 89 - "CSS Organization"
Cohesion: 0.50
Nodes (4): code:block19 (src/css/), code:ts (import { required } from '../../core/dom';), CSS Organization, Required-Element Invariant

### Community 90 - "runDirectChecks"
Cohesion: 0.10
Nodes (34): basic(), bcheck(), bindInQueueBrowser(), bindQueue(), check(), connectBrowser(), cookies, directSempPath() (+26 more)

### Community 91 - "serveUntilStopped"
Cohesion: 0.08
Nodes (22): main(), printVersionIfRequested(), serve(), serveUntilStopped(), TestPrintVersionIfRequested(), process, browserKeyProblem(), buildTrustPool() (+14 more)

### Community 92 - "tls.ts"
Cohesion: 0.08
Nodes (31): CertInfo, clone(), createTls(), decode(), DEMO_SUBJECT, error(), fingerprint(), GatewayTls (+23 more)

### Community 93 - "managed-service.ts"
Cohesion: 0.15
Nodes (6): TwoFactorState, ManagedProfileStore, createManagedService(), ManagedConnection, ManagedProfile, ManagedVpn

### Community 94 - "server.test.ts"
Cohesion: 0.17
Nodes (20): listQueues(), listVpns(), brokerVpns(), delay(), MOCK_HOST, handleSemp(), hostedResponse(), installMockServer() (+12 more)

### Community 95 - "newManagedEnv"
Cohesion: 0.09
Nodes (73): Auditing an action, auditLog, decodeTo(), moduleCatalog(), changeUsersBehindTheWriter(), connsWrote(), managedEnv, holdWriter() (+65 more)

### Community 97 - "dev.ps1"
Cohesion: 0.17
Nodes (26): Add-LogText(), Get-HostOs(), Get-Log(), Get-Now(), Install-Deps(), Invoke-GoTest(), Invoke-Logged(), Invoke-TrivyImage() (+18 more)

### Community 98 - "Features"
Cohesion: 0.13
Nodes (15): Connecting to a broker, Connections, Cross-cutting, Documentation, Features, License, Option 1 — Use the hosted version (zero install), Option 2 — Run as a container (one command) (+7 more)

### Community 99 - "totp_test.go"
Cohesion: 0.13
Nodes (29): checkTwoFactor(), groupSecret(), need(), newTOTPGuard(), qrSVG(), loadTOTPVectors(), TestCheckTwoFactor(), TestGroupSecret() (+21 more)

### Community 100 - "smf_test.go"
Cohesion: 0.11
Nodes (27): dialBody(), managedEnv, TestDial_ConnectsAreRateLimitedPerUser(), TestDial_ConnectsPerMinuteIsReadLive(), TestDial_IsAuditedOnlyWhileAccessIsOn(), TestDial_IssuesTheVPNCredential(), TestDial_PathRoundTripsThroughTheGate(), TestDial_Refusals() (+19 more)

### Community 101 - "package.json"
Cohesion: 0.08
Nodes (22): NO_CONSOLE, NO_GET_BY_ID, allowScripts, esbuild@0.25.12, dependencies, jszip, solclientjs, name (+14 more)

### Community 104 - "backup/module.ts"
Cohesion: 0.06
Nodes (49): BLOB_URL_REVOKE_DELAY_MS, createWritable(), downloadBlob(), saveBlob(), SaveFilePickerWindow, describeSchedule(), diffLines(), formatUtc() (+41 more)

### Community 105 - "Provisioned Mode"
Cohesion: 0.20
Nodes (10): Administer, Back up and restore, Contents, How it works, Provisioned Mode, Security checklist, Start it, Stored files and recovery (+2 more)

### Community 106 - "state.ts"
Cohesion: 0.10
Nodes (23): SolacePublisher, BIND_PROBE_TIMEOUT_MS, IDLE_TIMEOUT_MS, PUBLISH_CONCURRENCY_HIGH, PUBLISH_CONCURRENCY_LOW, CopyHooks, runCopyJob(), selectPublisher() (+15 more)

### Community 107 - "Deployment Options"
Cohesion: 0.18
Nodes (11): code:bash (docker run --rm -p 9443:9443 \), code:text (your-server/), code:bash (# Node.js), Containerised Gateway, Deployment Options, Embed in Solace Broker Web UI, Hosted PWA (zero install), Local file (dev exploration only) (+3 more)

### Community 108 - "managed-panel.ts"
Cohesion: 0.19
Nodes (16): ConnectOutcome, ConnectPart, connectProvisioned(), failure(), gatewayCodeOf(), outcomeLines(), PART_LABEL, PartFailure (+8 more)

### Community 111 - "log/slog.Logger"
Cohesion: 0.09
Nodes (19): openAuditor(), auditor, configSource, newDialer(), dialer, buildManagedRoutes(), newManagedRouting(), newTestAuditor() (+11 more)

### Community 112 - "gateway-settings/module.test.ts"
Cohesion: 0.18
Nodes (17): GatewaySettingsModule, GatewaySettingsOptions, ADMIN, clickSave(), el(), errorText(), hidden(), makeCtx() (+9 more)

### Community 113 - "<!-- @module-templates --> marker"
Cohesion: 0.27
Nodes (9): Queue Browser module template, Queue Copy module template, Queue Discovery module template, Queue Subscription Explorer module template, Desktop-only viewport gate, App Shell index.html, <!-- @module-templates --> marker, Sidebar (nav + status footer) (+1 more)

### Community 115 - "managed-panel.test.ts"
Cohesion: 0.08
Nodes (23): account(), clickConnect(), connectError(), connectToB1Vpn1(), connectWithSession(), el(), failed(), hidden() (+15 more)

### Community 118 - "router.ts"
Cohesion: 0.13
Nodes (34): docOf(), glob(), openBackup(), port(), totpDoc(), createRouter(), handle(), match() (+26 more)

### Community 119 - "newPWAHandler"
Cohesion: 0.18
Nodes (5): newPWAHandler(), setAppPageHeaders(), pwaHandler, recordingResponseWriter, reverseProxy

### Community 120 - "go_pkg_os"
Cohesion: 0.13
Nodes (21): checkJournalName(), parseTxn(), recoverDir(), restoreFiles(), sweepLeftoversOf(), createExclusive(), loadStoreKey(), ownershipHint() (+13 more)

### Community 121 - "createPages"
Cohesion: 0.21
Nodes (22): createPages(), codeField(), field(), frame(), hidden(), hide(), open(), showCode() (+14 more)

### Community 122 - "utils.ts"
Cohesion: 0.08
Nodes (35): generateUuid(), isValidHost(), isValidPort(), levelsIntersect(), rec(), LITERAL_STAR_SENTINEL, matchContains(), matchString() (+27 more)

### Community 123 - "backup_test.go"
Cohesion: 0.09
Nodes (52): diffByName(), flattenSettings(), newBackupKey(), openBackup(), sameRecord(), sealBackup(), settingsChanges(), sortedKeys() (+44 more)

### Community 124 - "Developer Guide"
Cohesion: 0.11
Nodes (19): Build commands, Build internals, Build-time feature flags, Building variants, Code Conventions, Contents, CSS, Developer Guide (+11 more)

### Community 125 - "passwordForm"
Cohesion: 0.15
Nodes (13): usersWrote(), newClientWatch(), passwordForm(), TestClientWatch(), TestLogin_ParallelGuessesForOneAccountQueue(), TestLogin_QueuedRequestThatGoesAwayIs503(), TestLogin_WarnsWhenEverySignInLooksLikeOneClient(), TestPasswordChange_Rejections() (+5 more)

### Community 127 - "tls_api_test.go"
Cohesion: 0.22
Nodes (22): decodeCertAnswer(), decodeState(), managedEnv, stateNames(), TestTLSAPI_AddTrustDerivesTheNameAndAudits(), TestTLSAPI_AddTrustRefusals(), TestTLSAPI_AddTrustWithANameAndABundle(), TestTLSAPI_AuditUnavailableRefusesCertificateAndTrustChanges() (+14 more)

### Community 131 - "loadModuleDOM"
Cohesion: 0.04
Nodes (90): Circular Dependency Resolution, DEFAULT_MAX_MESSAGES_PER_QUEUE, showToast(), escapeHtml(), solaceErrorText(), icons, MAX_BROWSER_BINDINGS, showPayload() (+82 more)

### Community 132 - "System Overview"
Cohesion: 0.50
Nodes (4): code:block1 (+-----------------------------------------------------------), Hosted mode (gateway tunnelling), Publishing pipeline (`solace-publisher`), System Overview

### Community 136 - "Module Isolation"
Cohesion: 0.50
Nodes (4): code:block2 (src/core/                          Shared infrastructure), code:block3 (EventBus), Install-phase buffering (`hold` / `release`), Module Isolation

### Community 137 - "queue-copy/module.ts"
Cohesion: 0.10
Nodes (42): formatBytes(), DestType, applyDestMode(), applyDestPrefill(), applyDestType(), applySourceReadonly(), cacheElements(), clearDestTypedSecrets() (+34 more)

### Community 138 - "testing.T"
Cohesion: 0.06
Nodes (82): expectInvalid(), expectRev(), managedEnv, jsonBody(), scheduleBody(), staleBasis(), TestBackupAPI_ActionsAreAudited(), TestBackupAPI_Download() (+74 more)

### Community 139 - "SEMP v1 Pagination (Queue Subscription Explorer)"
Cohesion: 0.67
Nodes (3): code:ts (let body: string | null = INITIAL_BODY;       // <rpc>…<num-), SEMP v1 Pagination (Queue Subscription Explorer), Topic intersection filter

### Community 140 - "connections/module.ts"
Cohesion: 0.04
Nodes (80): coerceConnConfig(), CONN_MODE_VALUES, CONN_MODES_VALUES, ConnDeploymentConfig, ConnMode, ConnModes, DEFAULT_CONN_CONFIG, resolveConnTabs() (+72 more)

### Community 142 - "boot.managed.ts"
Cohesion: 0.08
Nodes (31): boot(), boot(), clearSnapshot(), DemoSnapshot, ManagedDemo, PANEL_SEEN_KEY, readSnapshot(), SNAPSHOT_KEY (+23 more)

### Community 148 - "solace-publisher.ts"
Cohesion: 0.13
Nodes (15): cloneMessage(), createSolacePublisher(), ackListener(), dispose(), rejectAllPending(), rejectListener(), send(), DEFAULT_PUBLISH_ACK_TIMEOUT_MS (+7 more)

### Community 152 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, jsdom, playwright-core, @types/node, typescript, typescript-eslint, vite (+3 more)

### Community 154 - "store"
Cohesion: 0.06
Nodes (56): mergeByName(), sessionEnders(), slicesIndexUser(), TestBackup_DiffMergeAndSessionEnders(), TestBackup_SessionEndersNameTwoFactorChanges(), brokerTarget, clientRec, checkModuleIDs() (+48 more)

### Community 155 - "net.Conn"
Cohesion: 0.18
Nodes (6): Security model, What it does not enforce, What the gateway enforces, deadHijacker, TestRecordingResponseWriter_HijackWithoutSupport(), pipe()

### Community 156 - "vite-build.mjs"
Cohesion: 0.17
Nodes (9): argv, child, CUSTOM_FLAGS, env, passthrough, require, viteBin, vitePkg (+1 more)

### Community 157 - "module-registry-plugin.mjs"
Cohesion: 0.24
Nodes (14): Vendor scripts, activeModuleEntries(), activeModuleIds(), extractModuleEntries(), extractModuleIds(), MODULE_BASE_MARKER, readModuleTemplate(), readVariant() (+6 more)

### Community 159 - "ConnectionsModule Test Suite"
Cohesion: 0.14
Nodes (4): Connections module HTML template, createTestContext (test helper), ConnectionsModule Test Suite, connections/ui Test Suite

### Community 160 - "wireUiEvents"
Cohesion: 0.33
Nodes (11): syncDestFormFromSnapshot(), wireUiEvents(), deriveDestMode(), disposeDestSempConnection(), disposeDestSolConnection(), publishesProvisioned(), refreshDestTarget(), refreshDestTypeAvailability() (+3 more)

### Community 161 - "crypto/tls.Certificate"
Cohesion: 0.31
Nodes (4): certHolder, newCertHolder(), loadPair(), TestCertHolder_GetCertificateReturnsTheCurrentPair()

### Community 162 - "ManagedPanel"
Cohesion: 0.20
Nodes (3): ManagedPanel, DirectConnection, CheckConnectionRequest

### Community 163 - "semp-v1.ts"
Cohesion: 0.37
Nodes (13): allQueues(), findQueueAnyVpn(), MockQueue, spoolUsage(), vpnOn(), esc(), executeError(), handleSempV1() (+5 more)

### Community 164 - "connection-management/service.ts"
Cohesion: 0.36
Nodes (5): connPath(), createConnMgmtService(), ManagedConnRecord, ManagedConnVpn, CONN

### Community 165 - ".checkSettings"
Cohesion: 0.33
Nodes (5): apiError, refusalError, invalidRefusal(), TestRefusalError_IsAnsweredAsItSays(), newRefusal()

### Community 166 - "User Guide"
Cohesion: 0.11
Nodes (18): Caching, Connection Profiles, Contents, Filter syntax, Module 1: Connections, Module 4: Queue Subscriptions, Overview, Provisioned Connections (+10 more)

### Community 167 - "verifyViaSempV1"
Cohesion: 0.38
Nodes (7): compareMsgIds, fetchNewestMsgIdViaSempV1, normalizeAccessType, parseSempV1Response, verifySource, verifyViaQueueBrowserAccumulate, verifyViaSempV1

### Community 169 - "shell-loader.test.ts"
Cohesion: 0.20
Nodes (4): fire(), GLOBALS, pending(), shell

### Community 170 - "checkedAlias"
Cohesion: 0.29
Nodes (8): aliasLookup(), checkedAlias(), aliasAddress(), dnsRule(), dnsServers(), hostAliasProblem(), ipRule(), resolverLookup()

### Community 171 - "setup.ts"
Cohesion: 0.11
Nodes (24): Cross-references, Defensive-guard tests, Module tests, Node test files, Shared state, Solace mock, Stubbing globals, Test DOM (+16 more)

### Community 172 - "Audit trail"
Cohesion: 0.20
Nodes (9): Audit trail, Certificates from the console, Letting the console manage them, Locking them, Paths come from the environment, Restart gateway, What applies at once, The checks (+1 more)

### Community 173 - "csp.mjs"
Cohesion: 0.36
Nodes (9): applyCsp(), buildPolicy(), CSP_KINDS, cspProblems(), hashSource(), inlineBlocks(), markupOf(), policyFor() (+1 more)

### Community 174 - "settings_test.go"
Cohesion: 0.10
Nodes (45): expectStale(), TestBackupAPI_AdminsOnly(), TestBackupAPI_BackupFailedAnswersEachError(), TestBackupAPI_RunNowAndList(), TestBuildManagedRoutes_GatesByMode(), TestBuildManagedRoutes_PagesAndAPIShareTheReplayGuard(), TestBuildManagedRoutes_RemembersEveryStoreFile(), errorCode() (+37 more)

### Community 176 - "npm-audit-gate.mjs"
Cohesion: 0.57
Nodes (6): classify(), GATED, isLatestVulnerable(), main(), npm(), versions()

### Community 177 - "queue-copy/ui-events.ts"
Cohesion: 0.18
Nodes (11): CardPart, createProvisionedConnectionCard(), populateVpns(), render(), setStatus(), fillSelect(), make(), ProvisionedConnectionCardDeps (+3 more)

### Community 178 - "tls_test.go"
Cohesion: 0.10
Nodes (41): mustRead(), testCertPair, testCertSpec, encodeCertificates(), formatFingerprint(), recoverTLSPair(), fingerprintOf(), keyBodyLine() (+33 more)

### Community 179 - "service-verify.ts"
Cohesion: 0.09
Nodes (27): createService (subscription-explorer), fetchAllSubscriptions, SempContext, Kernel.appSetState(), Kernel.installModule(), Kernel.sempFetch(), Kernel.start(), SempConnectionHooks (+19 more)

### Community 180 - "Configure"
Cohesion: 0.29
Nodes (7): Audit settings, Configure, Connection modes, Environment variables, Sessions and sign-in, What users may open, Who can reach the gateway

### Community 181 - "End-to-end run"
Cohesion: 0.40
Nodes (5): Broker details, End-to-end run, Requirements, What it changes, What it does

### Community 182 - "runChecks"
Cohesion: 0.13
Nodes (28): adminSession(), configureGateway(), createScratch(), errorCode(), expect(), createCookieJar(), listedRev(), tlsFingerprint() (+20 more)

### Community 183 - "tsconfig.test.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, checkJs, types, exclude, extends, include

### Community 184 - "hashRecoveryCode"
Cohesion: 0.50
Nodes (5): hashRecoveryCode(), normaliseRecoveryCode(), recoveryIndex(), TestRecoveryCode_HashListAndIndex(), TestRecoveryCode_NormaliseAndHash()

### Community 185 - "main_test.go"
Cohesion: 0.11
Nodes (41): acceptWatch, loadConfig(), newRootHandler(), expectLogged(), gatewayClient(), gatewayDir(), route(), startServe() (+33 more)

### Community 186 - "createConnTabs"
Cohesion: 0.83
Nodes (4): createConnTabs(), render(), setTabActive(), show()

### Community 188 - "Module 3: Queue Copy"
Cohesion: 0.29
Nodes (7): Confirm Queue Copy modal, Destination connection (Provisioned sessions), Destination target, Important considerations, Module 3: Queue Copy, Refreshing source stats inside the modal, Two-column layout

### Community 189 - "newContractEnv"
Cohesion: 0.16
Nodes (14): decodeAny(), managedEnv, loadContractSeed(), newContractEnv(), readContract(), readContractVectors(), TestContract_Cases(), TestContract_SeedSettingsAreTheGateways() (+6 more)

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
- **34 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Writing to the store` connect `writer_test.go` to `store_test.go`, `managed.go`, `log/slog.Logger`, `net/http.ResponseWriter`, `settings_test.go`, `checksums`, `managed-api.ts`, `store`, `newManagedEnv`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Are the 122 inferred relationships involving `newManagedEnv()` (e.g. with `Writing to the store` and `TestBackupAPI_ActionsAreAudited()`) actually correct?**
  _`newManagedEnv()` has 122 INFERRED edges - model-reasoned connections that need verification._
- **What connects `managedEnv`, `github.com/solace/go-web-proxy`, `@types/node` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `proxy_test.go` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Why does `handleConflict()` connect `managed-api.ts` to `backup/module.ts`, `writer_test.go`, `loadModuleDOM`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Are the 81 inferred relationships involving `quietLogger()` (e.g. with `TestClientACL_Allowed()` and `TestClientACL_EmptyAllowListAdmitsEveryClient()`) actually correct?**
  _`quietLogger()` has 81 INFERRED edges - model-reasoned connections that need verification._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `queue-copy ui-modal` and `tests core/dom`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._