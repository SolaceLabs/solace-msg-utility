# Critical review - SolaceMessageUtility

Date: 2026-11-10
Commit: d2751b1 on feature/rbac, working tree dirty
Previous report: none
Scope: all areas
Stacks: Go (go-web-proxy/go.mod), bash (scripts/dev.sh, setup.sh), Node/TypeScript (package.json), GitHub Actions (.github/workflows/*.yml), containers (docker/Dockerfile, docker/*.yaml); checklists core + go + bash + node + github-actions + containers. PowerShell (scripts/dev.ps1): core checklist only.
Graph: reused; 3595 nodes, 9930 links, 165 communities (graphify-out/, rebuilt by the user's `./scripts/dev.sh graphify` at 11:28 with no topology change)
Dynamic checks: ./scripts/dev.sh full (build vet test mock cov image scan graphify); cd go-web-proxy && go test -race -count=1 ./... -- both run by the user, see Dynamic checks

## Summary

| Severity | New | Still open | Fixed since last | Total open |
|---|---|---|---|---|
| Blocker | 2 | 0 | 0 | 2 |
| Major | 14 | 0 | 0 | 14 |
| Minor | 91 | 0 | 0 | 91 |
| Nit | 25 | 0 | 0 | 25 |
| Suspected (uncounted) | 3 | 0 | 0 | 3 |

First review of this project, so there is no trend yet. The codebase is strong where it has invested: the 100% web coverage gate is really met, the Go gateway has a clear security model (sealed stores, a read-only SEMP relay, HttpOnly sessions, a hardened compose posture) and contract tests hold the in-browser demo to the real gateway's answers. Three things matter most. First, two Blockers in the message path: queue-browser decodes binary payloads as Latin-1 (SDK version10 profile), so UTF-8 text is garbled and every download of a payload with bytes above 0x7F (PDF, PNG, non-ASCII text) is silently corrupted; and queue-copy publishes through whichever destination session exists, so a connect that lands after the user changed the target VPN sends a copy, or a move that then removes the source messages, into a VPN the destination gate never checked. Second, a cluster of queue-copy and gateway Majors around error paths that fail silently or misreport: an invalid destination name is reported as "drained mid-run", the QueueBrowser-fallback verify refuses any queue that takes over 10 s to browse, Esc does not cancel a running move, a Number-converted 64-bit message id makes Delete ack the wrong message above 2^32, the sign-in throttle is check-then-act so parallel guesses multiply the attempts an account can receive per back-off window, and handler panics are logged below the default level. Third, the release pipeline: the next v* tag fails on a fresh checkout because docs/test-report.md links to the git-ignored docs/improvement-plan.md and the docs-links test counts a missing target as broken; any v* tag, pre-release or malformed, moves `latest`, redeploys Pages and is marked the Latest release; and the compose posture tests leave sysctls, unconfined profiles and the e2e gateway unguarded. Most of the 91 Minors are observability gaps (admin changes and panics unlogged at the default level, errors that reach the user as generic text) and test-quality items from the ceremonial-test audit; the 25 Nits are comment, cross-reference and doc drift.

## Top risks

1. CR-0029 [blocker] Queue-browser decodes binary payloads as Latin-1 strings (SDK version10 profile): UTF-8 text is garbled, the body filter misses non-ASCII terms, and every download of a payload with bytes >= 0x80 (PDF, PNG, UTF-8 text) is corrupted - src/core/services/solace-client.ts:91-92. Users see wrong payload text and download byte-corrupted files for ordinary binary messages.
2. CR-0033 [blocker] Copy engine publishes through whichever destination session exists, not the one the form names: a connect that lands after the target changed redirects the run and dodges the destination gate - src/modules/queue-copy/service-copy.ts:92. Messages are copied, and in move mode removed from the source, into a VPN other than the one shown and checked.
3. CR-0001 [major] Sign-in throttle is check-then-act: parallel guesses all pass loginWait before any failure is recorded - go-web-proxy/pages.go:162-200. Parallel guesses all pass the per-account check before the first failure is recorded, so one account can receive roughly 60 x (client addresses) guesses per back-off window instead of 5.
4. CR-0003 [major] Backup directory check cannot tell an unmounted /backup: scheduled backups silently land in the container layer - go-web-proxy/backup.go:724-742. On the documented docker run path without a /backup mount, the Backup & Restore page and the logs report healthy backups that vanish with the container.
5. CR-0028 [major] Kernel.sempFetch encodes Basic auth differently from the semp-client probe (a second SEMP client): non-Latin-1 credentials throw, Latin-1 ones change bytes after connect, and its 401 teardown bypasses the connections module - src/core/kernel.ts:316-321. A user whose SEMP username or password is not plain ASCII sees 'SEMP connected', and then every SEMP feature fails or the connection drops.
6. CR-0030 [major] publisher.send throws synchronously on an invalid destination instead of settling { ok:false }; queue-copy then browses the whole queue and reports 'drained mid-run' - src/core/services/solace-publisher.ts:102-108. A mistyped topic or queue name makes a copy or move browse the entire source, wait 30 s, then blame concurrent consumers.
7. CR-0031 [major] QueueBrowser-fallback verify fails any queue that takes over 10 s to browse: the bind timer is never cleared on UP - src/modules/queue-copy/service-verify.ts:393-398. Without SEMP, copy and move cannot verify, and so cannot start, for any moderately large queue, and the error claims a bind timeout that did not happen.
8. CR-0032 [major] Esc closes the Confirm Queue Copy dialog without cancelling: a running copy/move continues with no visible Cancel, and an un-aborted verify can overwrite a later one - src/modules/queue-copy/ui-events.ts:236-239. A user who presses Esc to abort a move does not abort it and loses the means to: the dialog closes, the run keeps publishing and (in move mode) removing after each ack, and the form stays disabled until the run ends.
9. CR-0039 [major] Delete converts 64-bit guaranteed message IDs to Number before acking them; at or above 2^32 the SDK's ack encoder mangles a Number, so the ack targets a non-existent ID while the row disappears and the UI reports success - src/modules/queue-browser/service.ts:168-181. A delete of a message id at or above 2^32 acks a non-existent id: the row disappears and the UI reports success while the message stays on the queue.
10. CR-0042 [major] net/http server errors, handler panics included, are logged at INFO and dropped at the default WARN level - go-web-proxy/main.go:135-157. A handler panic leaves no line at all in the default-level log, not even the access line, so a crashing request is invisible to the operator.

The remaining 6 Majors are in their area sections.

## Findings by area

### design

#### CR-0016 [minor] [new] The VPN-switch flow is implemented twice and the managed copy has already drifted from the documented navigation contract

Location: src/modules/connections/module.ts:604-687, src/modules/connections/managed-panel.ts:415-484, src/modules/connections/managed-panel.ts:131-161, src/modules/connections/managed-panel.ts:215-224, src/modules/connections/managed-panel.ts:62, docs/architecture.md:191-198, src/modules/connections/module.ts:456-459, src/core/services/managed-profile.ts:91-94, src/modules/connections/module.ts:604-686, src/modules/connections/module.ts:63-696
Confidence: verified
Evidence:

    Direct: module.ts:658-663 `const doSwitch = confirm(...); if (doSwitch) {
    navigateToConnections(); ...`. Managed: managed-panel.ts:461 `if (!confirm(...)) return;
    opInProgress = true;`, with no app.loadSelf() anywhere on the switch path. The managed path's
    failures land on the connections view: onConnectFailed/onError -> `setError(els.connectError,
    ...); showView('select')` (L153-160), and connectFailed -> setError (L217-224). After the
    confirm, the primary is already disconnected (L483). So when a managed switch fails (dial
    refused because the VPN was deprovisioned, or the SDK connect fails), the user is still on Queue
    Browser or Queue Copy, sees the connection drop, and gets no reason, because the error was
    written into the hidden Connections view. architecture.md:191-197 calls the contract a 'single
    source of truth' ('VPN switch, user confirms | yes -- after confirm'). Further duplication: the
    payload type is retyped inline (managed-panel.ts:62, L416-417) instead of reusing
    `CheckConnectionRequest` (module.ts:38), and the clientName timestamp builder exists twice
    (module.ts:456-459, managed-profile.ts:91-94).

    Also (a4): Both files define the same `finish`, which emits copy:vpn-switched or
    browser:browse-queue (module.ts:615-623, managed-panel.ts:421-427). Both define the same
    `waitForConnect`, with listeners on client:connected and client:disconnected and
    `setTimeout(cleanup, 30_000)` (module.ts:628-642, managed-panel.ts:432-446). Both contain the
    same disconnect-then-reconnect block, with `disconnectTimer = setTimeout(..., 10_000)` and
    identical warn text (module.ts:669-684, managed-panel.ts:463-483). The only difference is how
    the reconnect starts. installDirect runs from module.ts:63 to 696 and also carries form
    persistence, validation, both connection flows, the bridging hooks and the deployment probe.

Why it matters: Any change to the switch dance or its navigation rule has to be made twice, and has already diverged: a failed managed switch fails silently from the user's point of view.

Change: Any change to the switch dance or its navigation rule has to be made twice, and has already diverged: a failed managed switch fails silently from the user's point of view.

#### CR-0018 [minor] [new] docs/architecture.md (and matching code comments) describe mechanisms the code no longer has

Location: docs/architecture.md:98-104, docs/architecture.md:132, docs/architecture.md:168, docs/architecture.md:179, docs/architecture.md:664, docs/architecture.md:783, src/core/kernel.ts:10-15, src/core/types.ts:1-9, src/modules/queue-copy/module.ts:15-16, src/core/managed-semp-filter.ts:16-18, go-web-proxy/proxy.go:435
Confidence: verified
Evidence:

    (a) architecture.md:168 says install and sidebar order 'are set in src/registry.ts -- each
    registry entry is a { module, priority } tuple'. kernel.ts:13-15 and types.ts:5-8 say the same,
    and queue-copy/module.ts:15 says 'Priority 20: below queue-browser (30)'. In fact priorities
    live in src/variants/*.ts (queue-browser 80, queue-copy 70). (b) architecture.md:179 says 'No
    module emits during install today ... so the buffer is a no-op in practice', but
    queue-browser/module.ts:267-271 emits 'browser:available' at install and relies on the
    hold/release buffer (queue-discovery subscribes at L255-260). module.managed.ts:73
    setState('connConfig') emits app:state-change, and the panel's restore() at install
    (module.managed.ts:98) emits rbac:changed. (c) architecture.md:98 and :104 describe 'SEMP v1 RPC
    via deriveSempV1Url'; the symbol exists nowhere in src. The same paragraph says consumers 'all
    append paths onto the captured sempCtx.baseUrl', which contradicts
    src/core/connections/types.ts:264-265 ('baseUrl is diagnostic only ... Do NOT use it to build
    request URLs'). (d) architecture.md:783 says the managed panel overwrites
    `_messageConsumer._permissions` on the browser's UP event. managed-panel.ts:226-247 only wraps
    createQueueBrowser to throw, and notes that read-only rows are applied by queue-browser's
    ui-table.ts. (e) architecture.md:664 ('The broker relay itself stays ungated') and
    managed-semp-filter.ts:17 ('the relay is ungated') contradict relay.go:17-28 and :134-138, which
    make the relay read-only and refuse a broker the user is not entitled to (store.sempTarget). (f)
    architecture.md:132 and proxy.go:435 say the app polls /hosted. The only callers are the two
    connections entries, once each at install (module.ts:710, module.managed.ts:71).

Why it matters: architecture.md is the documented guide for extending the system and for its security boundary. Readers will look for a function that does not exist, may remove the install buffer, or misjudge what the gateway enforces.

Change: architecture.md is the documented guide for extending the system and for its security boundary. Readers will look for a function that does not exist, may remove the install buffer, or misjudge what the gateway enforces.

#### CR-0019 [minor] [new] Core keeps runtime-written module-level singletons (hosted mode, queue-picker cache/state) instead of AppContext state

Location: src/core/hosted.ts:18-32, src/core/hosted.ts:94-96, src/core/hosted.ts:140-157, src/modules/connections/module.ts:710-719, src/modules/connections/module.managed.ts:71-73, src/core/components/queue-picker/index.ts:75-96
Confidence: verified
Evidence:

    hosted.ts:24 `let hostedMode = false;` and :30-32 `export function setHosted(v: boolean): void {
    hostedMode = v; }`. It is written by the connections module (module.ts:711,
    module.managed.ts:72) and read implicitly by buildBrokerUrl (hosted.ts:148), plainSchemesUsable
    (:95) and solace-client's isHosted(). The other half of the same /hosted probe goes to
    AppState.connConfig (module.managed.ts:73), so one probe result has two homes with two patterns.
    queue-picker/index.ts:85-96 holds `let cache`, `let refs`, `let state` and `let pendingResolve`
    at module level. CLAUDE.md anchor 2: 'No global state -- everything flows through AppContext'
    (developer-guide.md:505: 'Module-scoped state via closures, not global singletons'). The
    ordering requirement (setHosted before any URL is built) is not expressed anywhere in the types.
    A URL built earlier is silently Direct-shaped.

    Second reading (partly): The state exists as cited (hosted.ts:24-32 setHosted written at
    module.ts:711 and module.managed.ts:72, read by buildBrokerUrl 148, plainSchemesUsable 95,
    solace-client.ts:147; queue-picker/index.ts:85-96 module-level cache/refs/state/pendingResolve).
    But it is deliberate and documented: hosted.ts:18-19 cites the logger.ts precedent;
    architecture.md:96 describes 'flips the singleton in src/core/hosted.ts' and states the ordering
    ('probe is awaited before any service factory is created'), as does module.ts:706-709, so
    'ordering not expressed anywhere' is wrong. The picker's state backs a single shared dialog. The
    duplicate home (hosted flag vs AppState.connConfig) is a real inconsistency, and only that.

Why it matters: The hosted flag has two homes: a module-level singleton in src/core/hosted.ts (deliberate and documented in architecture.md:96, with the probe-before-factories ordering stated there) and AppState.connConfig. The duplication, not the singleton itself, is the inconsistency; queue-picker's module state backs a single shared dialog.

Change: Keep one home for the probe result (AppState.connConfig or a core service on AppContext) and derive the hosted flag from it.

#### CR-0020 [minor] [new] Module CSS selection is a hand-kept list separate from the variant manifests; the kitchen-sink build ships the admin modules unstyled

Location: vite.config.ts:51-74, src/variants/all-for-testing-only.ts:15-30, src/css/main-admin.css:1-22, src/css/main.css:16-22
Confidence: verified
Evidence:

    vite.config.ts:52 `const ADMIN_CSS_VARIANTS = new Set(['admin', 'managed-demo']);`.
    cssVariantRedirect (L63-74) swaps in main-admin.css, which imports row-list and the admin-login,
    user-management, connection-management, gateway-settings and backup stylesheets, only for those
    two ids. all-for-testing-only.ts lists all five admin modules but is not in the set, so `npm run
    build:all` (all-test.html) bundles their code and templates (manifest-driven) without their CSS.
    In the other direction, main.css:19 imports queue-discovery's stylesheet, which no variant
    activates, into every bundle. Code and templates follow the manifest
    (module-registry-plugin.mjs, inject-module-templates), but CSS follows two hand-maintained
    aggregator files plus this set.

Why it matters: Adding admin modules to a variant needs an unrelated edit in vite.config.ts that nothing flags, and the QA build that is meant to exercise every module renders five of them unstyled.

Suggested patch (not applied):

```diff
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -52,1 +52,1 @@
-const ADMIN_CSS_VARIANTS = new Set(['admin', 'managed-demo']);
+const ADMIN_CSS_VARIANTS = new Set(['admin', 'managed-demo', 'all-for-testing-only']);
```

#### CR-0021 [minor] [new] The variant manifest is parsed by a regex stricter than TypeScript; an unquoted module id compiles but is never bundled

Location: scripts/module-registry-plugin.mjs:46-56, scripts/module-registry-plugin.mjs:63-70, src/registry.ts:27-42
Confidence: verified
Evidence:

    Ids: module-registry-plugin.mjs:52 `const re = /['"]([\w-]+)['"]\s*:/g;` (quotes required).
    Entries: L67 `const re = /['"]?([\w-]+)['"]?\s*:\s*['"]([\w-]+)['"]/g;` (quotes optional;
    tests/build/module-registry-plugin.test.ts > 'reads id -> entry pairs, quoted or not'). The
    runtime registry imports the same file as TypeScript (registry.ts:27
    `Object.entries(ACTIVE_MODULES)`). With `export const ACTIVE_MODULES = { connections: 100, ...
    }`, which is valid TS, the plugin finds no 'connections': the virtual module never imports its
    entry file and no template is injected. At page load registry.ts:34-41 then throws '[registry]
    "connections" is in the active variant manifest but the module registry has no entry file', and
    that guard is v8-ignored and untested. The plugin tests read only the standard, min, managed and
    managed-demo variants.

    Second reading (partly): Regexes as quoted (module-registry-plugin.mjs:52 requires quotes, :67
    optional); registry.ts:34-41 v8-ignored. Qualifies 'fails only at runtime': (1)
    vitest.config.ts:13 runs the plugin on the standard variant and tests/registry.test.ts:2 imports
    src/registry.ts, so an unquoted id in standard.ts throws at import and the `test` gate goes red;
    (2) in managed, managed-demo and all-for-testing-only an unquoted 'connections' is still read by
    the entries regex and activeModuleEntries (:96-102) fails the build loudly. Only min,
    no-queue-copy, admin, and ids without an entry override fail silently.

Why it matters: A manifest edit that type-checks fails only at runtime with a blank app, and the two parsers of the same file disagree about the accepted syntax.

Suggested patch (not applied):

```diff
--- a/scripts/module-registry-plugin.mjs
+++ b/scripts/module-registry-plugin.mjs
@@ -52,1 +52,1 @@
-    const re = /['"]([\w-]+)['"]\s*:/g;
+    const re = /['"]?([\w-]+)['"]?\s*:/g;
```

#### CR-0025 [nit] [new] AppContext.config is an untyped, unused field sourced from a global that nothing sets

Location: src/core/types.ts:268-269, src/core/kernel.ts:34, src/core/kernel.ts:179
Confidence: verified
Evidence:

    types.ts:268-269 `/** Global app config */ config: Record<string, any>;`. kernel.ts:34 `private
    config: Record<string, any> = (window as any).APP_CONFIG

    { useMocks: false };`, passed to every module at L179. Nothing in src sets window.APP_CONFIG,
    and no module reads app.config or ctx.config (grep). `useMocks` is a leftover from the removed
    *-mock service pattern.

Why it matters: Accidentally public surface on the core contract that every module receives. Any future use would read an `any`-typed global, against anchor 2 and the no-`any` rule.

Change: Any future use would read an `any`-typed global, against anchor 2 and the no-`any` rule.

#### CR-0027 [nit] [new] Live vs restart-only config keys are two independent hand lists with no check that every key is in one of them

Location: go-web-proxy/live.go:8-45, go-web-proxy/live.go:52-70, go-web-proxy/configfile.go:54-72, go-web-proxy/settings.go:74-81
Confidence: verified
Evidence:

    Live keys are whatever liveSettings/apply copy (live.go:19-45). Restart-only keys are the
    separate restartOnlyKeys table (live.go:58-70). GET /managed/settings derives RestartOnly and
    PendingRestart only from restartOnlyKeys (settings.go:76-78). No test or code asserts that every
    fileConfig field (configfile.go:54-72) is in exactly one of the two. Today the split is
    complete, but a new restart-only key added to fileConfig/config and not to restartOnlyKeys would
    be shown by the settings page as applying at once (no 'restart' tag, never in pendingRestart)
    while it takes effect only after a restart.

Why it matters: The most likely next change (a new gateway setting) touches config, defaultConfig, loadConfig/seedVars, fileConfig, fileConfigFromConfig, toConfig, live or restartOnlyKeys, the TS FIELDS list and the docs. The one classification step that decides what the admin is told has no guard.

Change: The most likely next change (a new gateway setting) touches config, defaultConfig, loadConfig/seedVars, fileConfig, fileConfigFromConfig, toConfig, live or restartOnlyKeys, the TS FIELDS list and the docs. The one classification step that decides what the admin is told has no guard.

### correctness

#### CR-0029 [blocker] [new] Queue-browser decodes binary payloads as Latin-1 strings (SDK version10 profile): UTF-8 text is garbled, the body filter misses non-ASCII terms, and every download of a payload with bytes >= 0x80 (PDF, PNG, UTF-8 text) is corrupted

Location: src/core/services/solace-client.ts:91-92, src/modules/queue-browser/service-events.ts:134-160, src/modules/queue-browser/ui-details.ts:25-30, src/modules/queue-browser/state.js:125-129, src/modules/queue-browser/ui-table.ts:244, docs/user-guide.md:266
Confidence: verified
Evidence:

    solace-client.ts:92 `factoryProps.profile = solace.SolclientFactoryProfiles.version10;`. In the
    bundled solclient.js, the version10 profile has `byteArrayAsString(){return!0}`, and
    `getBinaryAttachment(){return
    this._binaryAttachment&&D.value.byteArrayAsString?this._binaryAttachment.toString("latin1"):this._binaryAttachment}`.
    service-events.ts:135 `const attachment = msg.getBinaryAttachment();` then :148-149 `if (typeof
    attachment === 'string') { contentStr = attachment;`. So the Uint8Array/TextDecoder branch at
    :150-153 never runs in production. (1) A binary message carrying UTF-8 text (JMS BytesMessage,
    MQTT, REST and most non-JS publishers) arrives as one character per byte. (2) Non-ASCII text
    shows as mojibake. (3) The body filter `content.toLowerCase().includes(...)` (state.js:129)
    misses non-ASCII terms. (4) Download Content does `new Blob([content])` (ui-details.ts:28-29 via
    triggerDownload), which UTF-8-encodes every char 0x80-0xFF as two bytes, so the saved file of
    any binary or non-ASCII payload is corrupted. Copy and forward are not affected, because
    setBinaryAttachment round-trips the Latin-1 string.

    Second reading (confirmed): solace-client.ts:92 version10; in solclient.js version10 maps to the
    profile whose byteArrayAsString returns true, and getBinaryAttachment returns
    _binaryAttachment.toString("latin1"). service-events.ts:148-149 always takes the string branch;
    the TextDecoder branch (150-153) is dead in production; no other UTF-8 decode in queue-browser.
    UTF-8 payloads display as mojibake; the filter at state.js:128-129 misses non-ASCII terms; new
    Blob([content]) UTF-8-encodes 0x80-0xFF as two bytes, corrupting downloads of any payload with
    high bytes (pure ASCII unaffected). The mock's getBinaryAttachment returns the raw payload
    string (mock-broker/sdk/message.ts:94), so tests cannot see this.

    Second reading (confirmed), blocker bar: Meets the blocker bar on the download side. Every
    exported payload byte from 0x80 to 0xFF comes out as two UTF-8 bytes, so the file is always
    corrupted: PNG (first byte 0x89), PDF and non-ASCII UTF-8, for the single and the bulk ZIP
    download. docs/user-guide.md:266 promises these files open after a rename, and the failure is
    silent. The display and filter faults are major on their own: 1) solace-client.ts:92 sets
    profile=version10; in solclient.js the profile has `get byteArrayAsString(){return!0}`
    (version10_5 returns !1) and `getBinaryAttachment(){return
    this._binaryAttachment&&D.value.byteArrayAsString?this._binaryAttachment.toString("latin1"):this._binaryAttachment}`.
    2) service-events.ts:135 then :148 stores the Latin-1 string as is; the TextDecoder branch at
    :152 is dead in production. 3) state.js:129 matches the filter against that string. 4)
    ui-details.ts:26-29 builds new Blob([content]) (UTF-8 encodes); ui-table.ts:244 calls
    zip.file(name, string), which jszip UTF-8-encodes as well. No latin1/UTF-8 re-decode anywhere in
    src. The mock SDK (mock-broker/sdk/message.ts:94) returns JS strings, so demo and tests never
    show it. TEXT (SDT STRING) and pure-ASCII binary payloads are unaffected. Forward and copy
    round-trip correctly. Copy Content and Download Full also carry the garbled text.

Why it matters: Users see wrong payload text and download byte-corrupted files for ordinary binary messages. The filter returns wrong results for non-ASCII searches.

Change: Switch the factory profile to version10_5 (byteArrayAsString false) or re-decode: keep the raw bytes on the stored message, decode for display with TextDecoder (UTF-8, fatal:false), and hand the raw Uint8Array to the Blob and to zip.file for downloads; add a test with a payload containing 0x89 and a multi-byte UTF-8 character that asserts the downloaded bytes equal the original.

#### CR-0033 [blocker] [new] Copy engine publishes through whichever destination session exists, not the one the form names: a connect that lands after the target changed redirects the run and dodges the destination gate

Location: src/modules/queue-copy/service-copy.ts:92, src/modules/queue-copy/module.ts:153-162, src/modules/queue-copy/module.ts:249-268, src/modules/queue-copy/ui-events.ts:95-116, src/modules/queue-copy/ui-events.ts:340-344, src/modules/queue-copy/ui-modal.ts:296-316
Confidence: verified
Evidence:

    service-copy.ts:92 `const publisher = state.destPublisher ?? state.primaryPublisher;`.
    destSolHooks.onConnected (module.ts:153-156) sets `state.destSession = session;
    state.destPublisher = createSolacePublisher(session);` without checking the form. Toggling Same
    VPN (ui-events.ts:95-99) or changing the provisioned VPN (:340-344) calls
    disposeDestSolConnection, which only disconnects `if (state.destSession)` (:111). While a
    connect is still in flight (provisioned: dial round trip plus SDK connect), destSession is null:
    nothing is cancelled, the status resets to 'Not connected', and the late onConnected installs a
    publisher for the old VPN X. destinationRefusal (ui-modal.ts:302-304) checks `df.sameBroker &&
    df.sameVpn ? { broker: access.broker, vpn: access.vpn } : df.credMode === 'provisioned' ?
    df.provisioned : null`, which is the primary VPN or the newly selected VPN Y. (1) Pick
    provisioned VPN X and click Connect Client. (2) Switch the VPN to Y, or switch Same VPN on,
    before UP. (3) Start: the gate runs canOperate on Y (or on the primary VPN). (4) The engine
    publishes on the X session.

    Second reading (confirmed): All cited lines check out. destSolHooks.onConnected
    (module.ts:153-162) installs the session without comparing it to the form. dial awaits the
    gateway then calls cb.connect with no cancellation (managed-profile.ts:152-172); the SDK UP is
    async. disposeDestSolConnection disconnects only if destSession is already set
    (ui-events.ts:111). handleModalStart does not cross-check. The entitlement gate CAN be bypassed:
    destinationRefusal checks the primary VPN or Y (ui-modal.ts:302-304) while the engine uses
    destPublisher from X (service-copy.ts:92). A move DOES remove source messages after acks from
    the wrong VPN (service-copy.ts:483-485). Mitigations: the status line shows X (module.ts:156);
    the doc calls client guardrails 'UX, not a security boundary' (architecture.md:664). No test for
    a late connect.

    Second reading (confirmed), blocker bar: The consequence is blocker-class (messages copied, and
    in move mode removed from the source, into a VPN the gate never checked) but it falls short of
    the bar: the trigger is an unusual timed sequence (changing the VPN or toggle during the dial
    plus SDK connect window, sub-second up to about 6 s), and the guard it slips past is documented
    as a UX guardrail, so no gateway privilege is gained. Top of major: Provisioned VPN path:
    connectDestSol dials X (module.ts:258-261); the SDK session exists from solace-client.ts:193
    (connectRetries 1, connectTimeout 3000: managed-profile.ts:168); the 'connecting' state disables
    only the button (ui.ts:481-485); destProvVpn and toggleSameVpn stay enabled. Changing the VPN
    (ui-events.ts:340-344) calls disposeDestSolConnection, which skips the disconnect because
    state.destSession is only set in onConnected (ui-events.ts:111, module.ts:154); the factory
    session lives on; UP_NOTICE installs the X publisher and Next is enabled (module.ts:153-161,
    308). destinationRefusal checks df.provisioned = Y (ui-modal.ts:302-304); runCopyJob picks
    destPublisher = X (service-copy.ts:92); Move removes each source message after X acks
    (service-copy.ts:453-485). Same VPN path: the gate checks the primary VPN; the connect row is
    hidden (ui.ts:340) and the modal names the primary VPN (ui-modal.ts:449-451), so nothing on
    screen shows the misdirection. The Same-broker toggle (:85-93), a broker change (:328-338) and a
    cred-mode switch (:316-326) race the same way. No test covers it. Compensating: the VPN path
    does show 'Connected (X)'; per-queue rules are documented UX-only (architecture.md:664;
    rbac-variant-plan.md:148) and read-only users already receive X's SMF credential
    (architecture.md:930). Fix caution: the factory's UP/DISCONNECTED handlers read the mutable
    `session` (solace-client.ts:198,209), so key a staleness check on cfg.vpn or a connect
    generation.

Why it matters: Messages are copied, and in move mode removed from the source, into a VPN other than the one shown and checked. A user with operate on Y but only read-only on X writes into X past the destination gate. The suggested patch covers only the Same VPN path; the provisioned-VPN race also needs the in-flight connect to be cancelled, or onConnected to drop a session whose VPN no longer matches the form.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/service-copy.ts
+++ b/src/modules/queue-copy/service-copy.ts
@@ -89,7 +89,11 @@
     primarySession: any,
     hooks: CopyHooks,
 ): Promise<void> {
-    const publisher = state.destPublisher ?? state.primaryPublisher;
+    // The form names the target, not whichever publisher happens to exist: a
+    // destination session that finished connecting after "Same VPN" was
+    // switched on must not receive the run.
+    const publisher = state.destForm.sameBroker && state.destForm.sameVpn
+        ? state.primaryPublisher
+        : state.destPublisher;
```

#### CR-0001 [major] [new] Sign-in throttle is check-then-act: parallel guesses all pass loginWait before any failure is recorded

Location: go-web-proxy/pages.go:162-200, go-web-proxy/pages.go:229-243, go-web-proxy/throttle.go:86-95, go-web-proxy/throttle.go:121-130
Confidence: verified
Evidence:

    pages.go:384 `if wait := p.throttle.loginWait(user, client, resolved); wait > 0 {` ->
    pages.go:390 `mustChange, ok, err := p.store.checkPassword(r.Context(), user, pw)` ->
    pages.go:396-397 `if !ok { p.throttle.loginFailed(user, client, resolved)`. loginWait
    (throttle.go:89-95) takes t.mu, reads the failure tables and releases the lock. The PBKDF2 check
    at 600k iterations then runs outside the throttle lock, queued on NumCPU hasher slots
    (password.go:100-104). The failure is recorded only afterwards (throttle.go:122-130). An
    attacker sends N sign-ins for one username at once, e.g. 60 per client (the unauthenticated
    bucket burst) times any number of clients. Every request reaches loginWait while users[name] is
    still nil or unblocked, so all get 0 and queue for the hasher. Each guess is then verified, and
    only the first maxFailures results set blockedUntil, too late to refuse the rest. After the
    back-off expires the record goes stale (throttle.go:82-84, 137-139) and the next burst repeats
    this. submitPassword (pages.go:444-456) has the same ordering.

    Second reading (confirmed): loginWait (throttle.go:89-95) only reads under mu, nothing reserved;
    checkPassword (store.go:459-468) hashes outside every lock, queued on hasher slots
    (password.go:100-104); the failure is recorded only after (pages.go:182-183 ->
    throttle.go:122-130). Every request arriving before the first maxFailures hashes finish gets 0
    and is verified. Per client the burst is capped by the 60-token bucket (main.go:153) and the
    client key blocks after it, so N clients give ~60N guesses per back-off window instead of 5.
    Slip: after the back-off ends the next burst passes because blockedUntil is in the past, not
    because the record went stale. No concurrent test in pages_test.go.

    Second reading (confirmed), blocker bar: Not a blocker. The per-user back-off is weakened, not
    removed: each window still ends in a block. Guesses per window grow from about 1 to roughly
    (per-client bucket burst x number of client addresses), with PBKDF2 throughput as the ceiling.
    With the 12-character minimum a practical compromise needs a weak password and many source
    addresses: 1) allowAnon (pages.go:130, 89-97) takes one token per request; bucket starts at 60
    (main.go:153, throttle.go:194). 2) loginWait (throttle.go:89-95) locks, reads users[u],
    releases; with no record returns 0 (97-104). 3) checkPassword (store.go:459-468) blocks on
    hasher.acquire (password.go:62-69, 100-104); NumCPU slots (managed_routing.go:26) queue but
    never refuse. 4) Only then loginFailed (throttle.go:122-130) sets blockedUntil (157). So all 60
    queued guesses get verified. No request timeout, only ReadHeaderTimeout/IdleTimeout
    (main.go:397-400). Inaccuracy: the record does not 'go stale' when the block ends (stale needs >
    maxBackoff quiet, throttle.go:82-84); once blockedUntil passes a new burst gets 0 anyway. Steady
    state ~60 x addresses guesses per 15 min vs intended ~1. Compensating: per-client bucket (an
    IPv6 /64 is one key, throttle.go:59-69), PBKDF2 600k, 12-128 char policy (password.go:22-27).
    submitPassword runs only with a session (allowAnon skipped) and needs a hijacked session. No
    concurrent sign-in test.

Why it matters: The per-user limit (5 failures, then back-off) is supposed to bound distributed guessing against one account. It bounds only sequential guessing: guesses per window are limited by how many requests arrive before the first hashes finish, not by maxFailures.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/throttle.go
+++ b/go-web-proxy/throttle.go
@@ -93,4 +93,21 @@ func (t *throttle) loginWait(user string, client netip.Addr, ok bool) time.Duration {
 	now := t.now()
 	return max(failureWait(t, t.users, userKey(user), now), failureWait(t, t.clients, clientKey(client, ok), now))
 }
 
+// beginLogin is loginWait and loginFailed under one lock: the attempt counts
+// as a failure until loginSucceeded clears it, so parallel guesses cannot all
+// pass the check before the first of them is recorded.
+func (t *throttle) beginLogin(user string, client netip.Addr, ok bool) time.Duration {
+	t.mu.Lock()
+	defer t.mu.Unlock()
+	t.lim = t.limits()
+	now := t.now()
+	ck := clientKey(client, ok)
+	if wait := max(failureWait(t, t.users, userKey(user), now), failureWait(t, t.clients, ck, now)); wait > 0 {
+		return wait
+	}
+	recordFailure(t, t.users, userKey(user), now, "user", userKey(user))
+	recordFailure(t, t.clients, ck, now, "client", ck.String())
+	return 0
+}
+
--- a/go-web-proxy/pages.go
+++ b/go-web-proxy/pages.go
@@ -383,16 +383,15 @@ func (p *authPages) submitLogin(w http.ResponseWriter, r *http.Request, prior activeSession, hadSession bool) {
 	client, resolved := clientOf(r)
-	if wait := p.throttle.loginWait(user, client, resolved); wait > 0 {
+	if wait := p.throttle.beginLogin(user, client, resolved); wait > 0 {
 		w.Header().Set("Retry-After", strconv.Itoa(retrySeconds(wait)))
 		page.Error = throttledText(wait)
 		p.render(w, http.StatusTooManyRequests, page)
 		return
 	}
 	mustChange, ok, err := p.store.checkPassword(r.Context(), user, pw)
 	if err != nil {
 		p.logger.Error("sign-in check failed", "err", err)
 		p.message(w, http.StatusServiceUnavailable, "Sign-in unavailable", "Sign-in could not be checked. Try again.")
 		return
 	}
 	if !ok {
-		p.throttle.loginFailed(user, client, resolved)
 		p.logger.Warn("sign-in failed", "user", userKey(user), "client", client.String())
```

#### CR-0028 [major] [new] Kernel.sempFetch encodes Basic auth differently from the semp-client probe (a second SEMP client): non-Latin-1 credentials throw, Latin-1 ones change bytes after connect, and its 401 teardown bypasses the connections module

Location: src/core/kernel.ts:316-321, src/core/services/semp-client.ts:88-93, src/modules/connections/module.ts:160-173, src/core/kernel.ts:309-343, src/core/services/semp-client.ts:83-93, src/core/services/semp-client.ts:121-132, src/core/services/sempContext.ts:45-52, src/modules/connections/module.ts:159-193, src/modules/connections/module.ts:585-588, src/modules/connections/ui.js:168-204
Confidence: verified
Evidence:

    semp-client.ts:88 validates with `const authHeader = 'Basic ' +
    btoa(unescape(encodeURIComponent(`${cfg.user}:${pass}`)));` (UTF-8). The connections module then
    stores the same `pass` in AppState (module.ts:165-167 `user: creds.user, pass: creds.pass`).
    Every later primary request goes through kernel.ts:318 `const token = btoa(`${user}:${pass}`);`,
    which has no UTF-8 step. (1) A password with any character above U+00FF (for example the euro
    sign or CJK) passes the probe. (2) Every ctx.sempFetch then throws InvalidCharacterError from
    btoa, so the picker, verify and subscription explorer all fail. (3) For a Latin-1 character such
    as o-umlaut, the probe sends the bytes c3 b6 and the kernel sends f6, so one of the two is wrong
    for the broker. If the broker decodes UTF-8, the first post-connect request gets a 401, and
    kernel.ts:335-340 then tears the SEMP connection down ('SEMP 401 Unauthorized -- terminating
    connection').

    Also (a1): kernel.ts:318 `const token = btoa(`${user}:${pass}`);` vs semp-client.ts:88 `const
    authHeader = 'Basic ' + btoa(unescape(encodeURIComponent(`${cfg.user}:${pass}`)));`.
    connections/module.ts:160-174 (sempHooks.onConnected) drops the validated `sempCtx.fetch` and
    publishes user/pass into AppState.sempCredentials. Every primary consumer then goes through
    `ctx.sempFetch`, i.e. the kernel (sempContext.ts:49 `fetch: managed ?
    filterSempFetch(ctx.sempFetch, managed) : ctx.sempFetch`). (1) a SEMP password containing U+00E4
    passes the semp-client probe, which sends the UTF-8 bytes C3 A4. (2) The first discovery call
    goes through Kernel.sempFetch, where btoa encodes U+00E4 as the single Latin-1 byte E4, so the
    broker answers 401. A character above U+00FF (e.g. U+20AC) makes btoa throw
    InvalidCharacterError, so every primary SEMP call rejects. (3) On that 401, kernel.ts:335-339
    sets isSempConnected=false and sempCredentials=null and emits semp:disconnected, all state the
    connections module owns. (4) The connections module reacts only with ui.updateInputState
    (module.ts:585-588), which never touches btnSemp (ui.js:196-203). sempHooks.onDisconnected
    (module.ts:184-193, which resets the button and lastSempAttempt) never runs, so the button still
    says 'Disconnect' (btn-danger) while SEMP is down. Queue-copy's secondary uses semp-client
    directly, so the same password works there.

    Second reading (confirmed): semp-client.ts:88 encodes UTF-8 then btoa; kernel.ts:318 plain btoa.
    Credentials reach AppState via module.ts:165-167; primary consumers use ctx.sempFetch
    (sempContext.ts:49). Any char above U+00FF makes btoa throw InvalidCharacterError, so every
    primary SEMP call rejects (verified). For Latin-1 chars the two sides send different bytes;
    which one the broker accepts is external, so the 401 sequence is suspected, but one side must be
    wrong. On 401 kernel.ts:335-340 clears state; module.ts:585-588 only calls updateInputState
    which never touches btnSemp (ui.js:196-203): the button stays 'Disconnect' and clicking it
    reconnects. Non-ASCII is a supported case (semp-client.test.ts has a UTF-8 credential test).

    Second reading (confirmed), blocker bar: Not a blocker. Nothing is corrupted and no guard is
    bypassed; SEMP features fail visibly (rejected fetch or 401 teardown); only non-ASCII SEMP
    credentials are affected; the stale button label is cosmetic: Probe encodes UTF-8
    (semp-client.ts:88); onConnected receives the raw pass (:132); the connections module drops
    sempCtx.fetch and stores user/pass (module.ts:165-173); every primary consumer goes through
    ctx.sempFetch (sempContext.ts:49) to kernel.ts:318 btoa with no UTF-8 step. A char above U+00FF
    makes btoa throw (standard); a Latin-1 char is sent as a different byte than the probe. On 401
    kernel.ts:335-340 clears state and emits semp:disconnected; the only listener is
    updateInputState (module.ts:585-588) and ui.js:168-204 never touches btnSemp, so the label stays
    'Disconnect' (clicking it starts a connect since module.ts:535 checks appState). The stale label
    follows any kernel 401. Strongest evidence: the project deliberately supports non-ASCII
    credentials (tests/core/services/semp-client.test.ts:195-217 'handles non-ASCII credentials',
    citing a past btoa failure); the fix covered only the probe; kernel tests pin ASCII only
    (kernel.test.ts:462). Broker-side Latin-1 outcome unconfirmed. No input validation rejects
    non-ASCII (module.ts:461-468).

Why it matters: A user whose SEMP username or password is not plain ASCII sees 'SEMP connected', and then every SEMP feature fails or the connection drops. The queue-copy destination uses semp-client's own encoding, so the same credential works there, which makes the cause hard to find.

Suggested patch (not applied):

```diff
--- a/src/core/kernel.ts
+++ b/src/core/kernel.ts
@@ -315,7 +315,9 @@
         } else if (creds) {
             const { user, pass, protocol, host, port, urlPath } = creds;
-            const token = btoa(`${user}:${pass}`);
+            // Same encoding as the connect probe (semp-client.ts): UTF-8, so a
+            // non-Latin-1 credential neither throws nor differs from the probe.
+            const token = btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
             (defaults.headers as Record<string, string>)['Authorization'] = `Basic ${token}`;
```

#### CR-0031 [major] [new] QueueBrowser-fallback verify fails any queue that takes over 10 s to browse: the bind timer is never cleared on UP

Location: src/modules/queue-copy/service-verify.ts:393-398, src/modules/queue-copy/service-verify.ts:415-430, src/modules/queue-copy/service-verify.ts:452-467, src/modules/queue-copy/service-verify.ts:472-483, src/modules/queue-copy/service-verify.ts:393-430, src/modules/queue-copy/service-verify.ts:466, tests/modules/queue-copy/service-verify.test.ts:740-764, docs/improvement-plan.md:12, tests/modules/queue-copy/service-verify.test.ts:740-750, tests/modules/queue-copy/service-verify.test.ts:752-764
Confidence: verified
Evidence:

    :472 `const bindTimer = setTimeout(() => { ... settle(false, `Verification timed out after
    ${BIND_PROBE_TIMEOUT_MS / 1000}s.`);`. The timer is cleared only in cleanup() (:396), which runs
    on settle. The UP handler (:420-430) sets `bound = true` and calls resetIdleTimer() but leaves
    bindTimer running. Each MESSAGE (:452-467) calls resetIdleTimer(), pushing the 2 s idle settle
    out again. (1) On a queue whose messages keep arriving for more than 10 s (thousands of
    messages, a slow link, the gateway relay), the 2 s idle timer never fires. (2) At 10 s the bind
    timer fires settle(false, 'Verification timed out after 10s.'). (3) The temporary browser is
    disconnected and Start stays disabled. The v8-ignore comment at :473-479 ('always fires before
    the 10s bind timer') rests on the wrong premise, so the path is hidden from coverage.

    Also (a7): service-verify.ts:420-430: the UP handler does `bound = true; ... resetIdleTimer();`
    and never clears bindTimer. bindTimer is cleared only in cleanup() at :396
    (`clearTimeout(bindTimer);`), which only settle() calls. Every MESSAGE re-arms the idle timer:
    :466 `resetIdleTimer();`, and :417 `idleTimer = setTimeout(() => settle(true),
    ACCUMULATE_IDLE_MS);`. The bind timer at :472-483 reads `/* v8 ignore start -- ... any
    QueueBrowserEventName.UP arms the idle timer (2s), which always fires before the 10s bind timer
    ... */ // if (!bound)` then `settle(false, `Verification timed out after ${BIND_PROBE_TIMEOUT_MS
    / 1000}s.`);`. BIND_PROBE_TIMEOUT_MS = 10_000 (constants.ts:42) and ACCUMULATE_IDLE_MS = 2_000
    (constants.ts:48). The comment's premise is false: the idle timer fires 2s after the LAST
    message, not 2s after UP. So when the browse keeps delivering MESSAGEs less than 2s apart past
    t=10s (a deep queue, or one that is still being fed), the bind timer fires with bound === true.
    settle(false, ...) then discards the accumulated count and reports 'Verification timed out after
    10s.' for a queue that bound fine. `git show 7922357` ('cleaned up dead code', 2026-05-26) is
    where the live `if (!bound) settle(...)` became the commented-out line. This is new evidence
    against the IGNORE-5 ledger entry (docs/improvement-plan.md:12: 'v8 ignore retained ... because
    no test fires the bind timer'). tests/modules/queue-copy/service-verify.test.ts:740-750 > 'hard
    timeout fires before UP' advances 10_000 ms with no UP and asserts
    `expect(result.errors[0]).toContain('timed out')`. Line 481 is the only place that writes that
    text, so the ignored body runs today. That also fits Functions 988/988: the arrow at :472 sits
    outside the ignore. The other test, :752-764 > 'hard timeout after UP is a no-op (idle takes
    over)', cannot catch the bug: with no MESSAGE, the idle timer settles at 2s and clears bindTimer
    first. House rules: 'Never use v8 ignore to skip testing real business logic.' 'Fail loud vs
    skip: assert what is required; null-guard only the genuinely optional.' The guard was not dead.

    Also (a8): 'hard timeout fires before UP' (740-750) reaches the bind-timer body that
    src/modules/queue-copy/service-verify.ts:473-482 wraps in `/* v8 ignore */`, whose comment says
    the body is 'defensively unreachable in tests'. The test and assertion are sound; the ignore is
    stale, so remove it and let this test cover the line. 'hard timeout after UP is a no-op (idle
    takes over)' (752-764) still pins the invariant that makes the commented `if (!bound)` guard
    unnecessary. Keep it: this is not stale ceremony.

    Second reading (confirmed): UP (service-verify.ts:420-430) arms the idle timer but never clears
    bindTimer; bindTimer is cleared only in cleanup() (:396), called only by settle(); each MESSAGE
    re-arms the 2 s idle timer (:466, :417). If MESSAGEs keep arriving < 2 s apart past t=10 s, the
    bind timer fires with bound===true and settle(false, 'Verification timed out after 10s.') (:481)
    discards the count. Deep queues are an intended input (the comment at :382-384 promises O(1)
    memory regardless of depth). Runs only when sempCtx is null (:98, :117). 'hard timeout fires
    before UP' (test:740-750) executes the body inside the v8 ignore (:481 is the only writer of
    'timed out'), so the ignore comment and the IGNORE-5 ledger entry (improvement-plan.md:12) are
    both false.

    Second reading (confirmed), blocker bar: Not a blocker. A false refusal: Start stays disabled,
    no wrong copy or data loss. It hits any queue whose browse takes more than 10 s whenever SEMP is
    absent (a supported mode), and the error misstates the cause: verifySource takes the QB path
    whenever sempCtx is null (service-verify.ts:108-117). bindTimer armed at :472-483 with
    BIND_PROBE_TIMEOUT_MS=10_000 (constants.ts:42), cleared only in cleanup() (:396) which only
    settle() calls. UP (:420-430) sets bound=true and calls resetIdleTimer but leaves bindTimer.
    Every MESSAGE (:452-467) re-arms the 2 s idle timer (ACCUMULATE_IDLE_MS=2_000). git show 7922357
    shows `-if (!bound) settle(...)` replaced by the commented guard. The v8-ignore premise is
    false; service-verify.test.ts 'hard timeout fires before UP' runs the ignored body (stale
    ignore); 'hard timeout after UP is a no-op (idle takes over)' sends no MESSAGE and cannot catch
    this. Caveat: restoring `if (!bound)` alone would leave a continuously fed queue with no cap, so
    the fix needs a separate overall cap with its own message.

Why it matters: Without SEMP, copy and move cannot verify, and so cannot start, for any moderately large queue, and the error claims a bind timeout that did not happen.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/service-verify.ts
+++ b/src/modules/queue-copy/service-verify.ts
@@ -419,6 +419,8 @@
 
         browser.on(solace.QueueBrowserEventName.UP, () => {
             bound = true;
+            // Bound: from here only the idle window ends accumulation.
+            clearTimeout(bindTimer);
             // Capture access type from the SDK's `_messageConsumer._permissions`
```

#### CR-0039 [major] [new] Delete converts 64-bit guaranteed message IDs to Number before acking them; at or above 2^32 the SDK's ack encoder mangles a Number, so the ack targets a non-existent ID while the row disappears and the UI reports success

Location: src/modules/queue-browser/service.ts:168-181, src/modules/queue-copy/service-verify.ts:456-458
Confidence: verified
Evidence:

    service.ts:169 `const sortedIds = msgIds.map(id => Number(id)).sort((a, b) => a - b);`, then
    :178 `msg.setGuaranteedMessageId(id);` and :181 `browser.removeMessageFromQueue(msg);`. The
    SDK's removeMessageFromQueue calls `applicationAck(e._guaranteedMsgId)`, which normally carries
    the SDK's Long. queue-copy explicitly avoids this: 'broker IDs are 64-bit so we compare via
    BigInt to avoid Number precision loss' (service-verify.ts). Above 2^53 a Number rounds to a
    neighbouring ID, so the ack targets a different message. Also, a Number reaching the SDK's
    ack-range encoding (`_sendAck` / `AdProtocolMessage.getAck`) may not behave as a Long. To
    confirm, check how getAck encodes the range values, or run a real-broker delete with a large ID.

    Second reading (partly): Right but understated: the failure starts at 2^32, not 2^53.
    service.ts:169 Number()s the ID and :178 sets it. SDK path: removeMessageFromQueue ->
    applicationAck(e._guaranteedMsgId) -> applicationSettle; in browser mode that builds [[e,e]] ->
    _sendAck -> AdProtocolMessage.getAck -> encoder -> int64ToStr(n), which has a branch for
    Numbers: below 2^32 it encodes correctly; at or above 2^32 it uses e>>56, e>>32 etc., which work
    on ToInt32(e), so the bytes come out as (low32<<32)|low32. The ack goes to a different ID that
    almost certainly does not exist; the message stays on the queue while the row is removed and the
    UI reports success. A Long goes through d(e.high)+d(e.low) and is correct; queue-copy move mode
    acks the received msg so it keeps the Long. Brokers that have spooled more than 4.29e9 messages
    are plausible (runtime).

Why it matters: A destructive operation could fail, or in the extreme case delete the wrong message. The two modules also handle the same identifier inconsistently.

Change: Keep the SDK's own id object (the Long from the received message) instead of Number(id) when building the ack message, as queue-copy's move path does; add a test with an ID >= 2^32 asserting the ack carries the original value.

#### CR-0093 [major] [new] Property filter turns 0 and false values into '' so they never match

Location: src/modules/queue-browser/state.js:178-195, src/modules/queue-browser/service-events.ts:32-35, src/modules/queue-browser/service-events.ts:193-222, src/core/utils.ts:42-57, tests/modules/queue-browser/state.test.ts:316-334
Confidence: verified
Evidence:

    state.js:182-184: `if (foundKey) { const val = String(msg.msgProperties[foundKey]

    ''); if (matchString(val, fVal)) matchProp = true; }`. :191-193 does the same for appProperties.
    Ingest keeps falsy values on purpose. service-events.ts:32-35: `['Priority', m => { const p =
    m.getPriority(); return p != null ? p : undefined; }]`. :197-198: `const val = getter(msg); if
    (val != null) props[key] = val;`. User properties are copied raw at :213-218 (`obj[key] =
    field.getValue();`), so SDT int 0 and boolean false arrive as 0 and false. `0

    ''` and `false

    ''` both become ''. core/utils.ts:56 `return text.toLowerCase() === pattern.toLowerCase();` then
    compares '' with '0' and returns false. So a user filtering on Priority = 0, retryCount = 0 or
    isTest = false never sees the matching messages: AND mode drops them, and in OR mode the
    condition silently fails. state.test.ts has no 0 or false value case (the only standard-property
    value is Priority: 5 at :131). Meanwhile :316-324 > 'property filter coerces null msgProperty
    value to empty string' tests a null msgProperties value, which ingest never stores
    (service-events.ts:198). House rule: 'null-guard only the genuinely optional' -- here the
    fallback treats legitimate values as missing.

    Second reading (confirmed): state.js:183 and :192 use String(x

    ''). Ingest keeps Priority 0 (service-events.ts:32-35, :197-198 val != null) and copies
    user-property values raw (:213-218), so 0 and false arrive intact, become '', and matchString
    (utils.ts:42-57) compares '' with '0' and returns false (:56). No queue-browser or integration
    test covers a 0 or false property value (state.test.ts:131 uses Priority: 5; the
    null-msgProperty test :316-324 tests a state ingest never produces). user-guide.md:207
    advertises filtering on Priority.

    Second reading (confirmed), blocker bar: Not a blocker. A display filter that wrongly hides
    matches, never wrongly includes one; no invert mode (state.js:9-20, 218-226); bulk actions act
    only on displayed selected rows (ui-events.ts:105), so no data is lost and no guard is bypassed:
    service-events.ts:17 states Priority 0 is valid and :32-35 keeps it; :197-198 stores any
    non-null value; :213-215 copies SDT values raw, so int 0 and boolean false are kept.
    state.js:183 and :192 do String(v

    ''), turning 0 and false into ''; matchString (utils.ts:43,56) then compares '' with '0' or
    'false' and returns false. The details pane shows these values (renderTags ui-details.ts:210-212
    keeps 0/false; createTag renders `Priority = 0`, ui-details.ts:172,180), so a user filtering on
    the value they can see gets no match: in AND mode the message is dropped, in OR mode the
    condition silently fails; the only workaround is the * wildcard. In msgProperties only Priority
    0 is affected; app properties hit it often (counters, boolean flags). state.test.ts:131 uses
    only Priority 5; the null-value tests at :316-334 use the filter value '' which matchString
    accepts for any text. Proposed fix and tests are sound.

Why it matters: Proposed fix: for msgProperties use `String(msg.msgProperties[foundKey])`, since ingest guarantees non-null. For appProperties use `String(msg.appProperties[foundKey] ?? '')`, since a NULL-typed SDT field gives null and is genuinely optional. Alternate: `?? ''` on both. The proposed fix is better: it adds no fallback branch for a value the producer never emits (house rule: drop `|| 'fallback'` on values the service always sets). Tests in tests/modules/queue-browser/state.test.ts: add 'matches a Priority 0 standard property' and 'matches app property values 0 and false'. Both fail on HEAD. Delete 'property filter coerces null msgProperty value to empty string' (:316-324). It would still pass, because an empty pattern matches anything, but the state it tests cannot happen. Keep 'property filter coerces null appProperty value to empty string' (:326-334); it now covers the `??` branch.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-browser/state.js
+++ b/src/modules/queue-browser/state.js
@@ -182,3 +182,5 @@
                 if (foundKey) {
-                    const val = String(msg.msgProperties[foundKey] || '');
+                    // Ingest stores only non-null values and keeps Priority 0, so
+                    // stringify as-is: '0' and 'false' must stay matchable.
+                    const val = String(msg.msgProperties[foundKey]);
                     if (matchString(val, fVal)) matchProp = true;
@@ -191,3 +193,4 @@
                 if (foundKey) {
-                    const val = String(msg.appProperties[foundKey] || '');
+                    // User-property values may be 0/false (keep) or null (SDT null field).
+                    const val = String(msg.appProperties[foundKey] ?? '');
                     if (matchString(val, fVal)) matchProp = true;
```

#### CR-0007 [minor] [new] A session created after a concurrent revocation (password reset, demotion, deletion) survives it; for a deleted user /solAdmin loops

Location: go-web-proxy/pages.go:176-193, go-web-proxy/managed.go:373-387, go-web-proxy/managed.go:391-404, go-web-proxy/session.go:94-108, go-web-proxy/pages.go:297-322, go-web-proxy/pages.go:147-157
Confidence: verified
Evidence:

    pages.go:390 `p.store.checkPassword(...)` (the hash runs outside every lock, store.go:459-468),
    then pages.go:407 `setSessionCookie(w, p.sessions.create(user, mustChange))`. Revocation is
    managed.go:385-387 `if drop { h.sessions.dropUser(name) }` (and :402 on delete), which removes
    only sessions present at that moment (session.go:231-238). A sign-in verifies the old password;
    during the few hundred ms of hashing an admin resets that user's password (or demotes or deletes
    them); dropUser finds no session; the sign-in then creates one. The reset meant to evict the
    holder of the old password is bypassed. For a deleted user, gateAdmin (pages.go:528-529) `case
    !exists: http.Redirect(w, r, loginURL(adminPath), ...)` and showLogin (pages.go:366-367) `case
    signedIn: http.Redirect(w, r, next, ...)` bounce /solAdmin <-> /login. Each hop refreshes
    lastSeen (session.go:214), so this lasts until the absolute limit.

    Second reading (partly): Race real for a password reset or deletion: the sign-in reads the
    record under RLock (store.go:460-462) then hashes; if upsertUser/deleteUser plus dropUser
    (managed.go:385-387, 402) runs in that gap it finds no session, and create (session.go:50-63)
    adds one afterwards. Demotion case is harmless: admin flag and entitlements are read live
    (session.go:12-14, pages.go:312). The deleted-user /solAdmin <-> /login loop is confirmed, but
    the browser's redirect cap ends it with an error page; each hop refreshes lastSeen
    (session.go:80).

Why it matters: The documented rule that a new password or a deletion ends the user's sessions has a race window the length of a password hash: a sign-in that verified the old password before dropUser ran creates a session afterwards. Demotion is not affected (admin flag and entitlements are read live). For a deleted user the /solAdmin <-> /login redirect loop ends at the browser's redirect cap with an error page rather than running forever.

Change: Keep a per-user generation counter in the session store (bumped by dropUser), capture it before checkPassword and refuse create() when it moved; have gateAdmin drop the session when the user no longer exists.

#### CR-0008 [minor] [new] SEMP relay forwards If-None-Match/If-Match but turns the broker's 304 into a 502 upstream_unavailable

Location: go-web-proxy/relay.go:36-48, go-web-proxy/relay.go:172-191
Confidence: verified
Evidence:

    relay.go:42 `var relayRequestHeaders = []string{"Accept", "If-Match", "If-None-Match"}` and
    relay.go:48 passes ETag back to the browser. But relay.go:181-183 `case s < 200, s >= 300 && s <
    400: code = "upstream_unavailable"` maps every 3xx, 304 included, to `writeError(w,
    http.StatusBadGateway, code)` plus a warn log. A client revalidates a SEMP v2 GET with
    If-None-Match equal to the ETag it got; the broker answers 304; the relay answers 502.
    relay_test.go has no 304 or If-None-Match case, and the app sends neither header today, so this
    is latent.

Why it matters: The allow-list advertises conditional requests whose natural success answer the relay reports as a broker outage. Either pass 304 through (it has no body or Location) or drop the conditional headers from the allow-list.

Change: Either pass 304 through (it has no body or Location) or drop the conditional headers from the allow-list.

#### CR-0015 [minor] [new] solace-client: a connect() on a client with a session lets the old session's DISCONNECTED handler dispose the new session

Location: src/core/services/solace-client.ts:102-110, src/core/services/solace-client.ts:193-211, src/core/services/solace-client.ts:264-279, src/modules/connections/module.ts:471-518, src/modules/connections/module.ts:644-650, src/modules/connections/ui.js:127-129, src/core/services/solace-client.ts:102-117, src/core/services/solace-client.ts:264-280, src/modules/connections/module.ts:471-517, src/mock-broker/sdk/session.ts:127-131
Confidence: verified
Evidence:

    connect() calls `session.disconnect()` on an existing session (L103-110), then reassigns the
    factory-level variable `session = solace.SolclientFactory.createSession(props)` (L193). Each
    session's handlers act on that shared variable rather than on their own instance: L207-211
    `session.on(DISCONNECTED, () => { ...; cleanup(); hooks.onDisconnected(); })`, and cleanup()
    (L264-279) disposes whatever `session` currently holds and sets it to null. (1) Connect is
    clicked and session A is connecting. Nothing blocks a second click: showFeedback only sets text
    (ui.js:127-129), and the handler checks only appState.isConnected (module.ts:472).
    checkConnection's auto-connect path (module.ts:644-650) also clicks btnSolace while a connect
    may be in flight. (2) The second connect() disconnects A and creates B. (3) A's asynchronous
    DISCONNECTED fires, cleanup() disposes B, and onDisconnected resets the UI to 'Connect'.
    CONNECT_FAILED_ERROR (L201-205) has the same shape. tests/core/services/solace-client.test.ts >
    'disconnects existing session before connecting new one' never fires A's DISCONNECTED after the
    second connect, so it misses this.

    Also (a2): connect() calls `session.disconnect()` on an existing session (:103-105), then
    `session = solace.SolclientFactory.createSession(props);` (:193). The handlers close over the
    factory variable: :207-211 `session.on(DISCONNECTED, () => { cleanup(); hooks.onDisconnected();
    })`, and cleanup() (:264-280) disposes whatever `session` is now. The Direct Connect button is
    only relabelled while connecting (ui.js:127-129 `btn.textContent = text;`, not disabled), and
    module.ts:472 checks `appState.isConnected`, which is still false. (1) A second click starts a
    second connect. (2) The first session's DISCONNECTED disposes the second session and fires
    onDisconnected. The same applies to the queue-copy destination after the status resets to
    'Connect' mid-connect. The mock's `disconnect(): void { if (!up) return; ...`
    (session.ts:127-131) emits nothing for a session that is not up, so tests and the demo cannot
    show this. To confirm, check that the real SDK emits DISCONNECTED after disconnect() on a
    CONNECTING session.

Why it matters: Clicking Connect twice, or clicking Connect while an 'open queue' request triggers auto-connect, ends with no session and no error message. The lifecycle contract that SolaceClient.connect implies (replace a stale session) does not hold.

Change: The lifecycle contract that SolaceClient.connect implies (replace a stale session) does not hold.

#### CR-0017 [minor] [new] The production SEMP client contains a hard-coded demo branch that rejects any host containing 'untrust.com'

Location: src/core/services/semp-client.ts:98-102, src/mock-broker/fixtures.ts:27-28, src/mock-broker/fixtures.ts:28, src/mock-broker/sdk/session.ts:114, src/mock-broker/fixtures.ts:23-28
Confidence: verified
Evidence:

    semp-client.ts:99-102 `// MOCK\n if (host.includes('untrust.com')) { throw new
    Error('Certificate Not Trusted (Mock)'); }`. The demo depends on it: fixtures.ts:27-28 `/**
    Substring match -- simulates an untrusted broker certificate. */ UNTRUSTED: 'untrust.com'`. The
    branch ships in every real bundle (index.html, provisioned.html), so a real broker whose host
    contains that substring (e.g. mq.notuntrust.com) can never be connected and gets a '(Mock)'
    certificate error. CLAUDE.md Build Modes says production is 'real services, no mock code' and
    'Do not add *-mock service siblings -- extend src/mock-broker/ instead'.

    Also (a2): semp-client.ts:99-102: `// MOCK` / `if (host.includes('untrust.com')) { throw new
    Error('Certificate Not Trusted (Mock)'); }`. This runs in every build. 'untrust.com' is the demo
    fixture MOCK_HOST.UNTRUSTED (fixtures.ts:28). Any real broker host containing that substring is
    refused with a fabricated certificate error, and no request is ever made. CLAUDE.md requires
    demo behaviour to live in src/mock-broker/ ('production never imports it').

    Also (a4): semp-client.ts:99-102 contains `// MOCK` followed by `if
    (host.includes('untrust.com')) { throw new Error('Certificate Not Trusted (Mock)'); }`. It runs
    in every build. The equivalent gate for the messaging side lives where it belongs, in the
    in-browser broker: `if (host.includes(MOCK_HOST.UNTRUSTED))` (mock-broker/sdk/session.ts:114),
    with `UNTRUSTED: 'untrust.com'` in fixtures.ts:28. A test pins the production branch:
    tests/core/services/semp-client.test.ts:183 'fires onError for the synthetic untrust.com
    Certificate trip'.

Why it matters: Mock logic in a production service can reject a legitimate broker with a fabricated certificate error. The demo does not depend on it: the demo's SEMP interceptor already refuses unknown hosts and demo.md promises the certificate error only on the messaging side.

Change: Delete the untrust.com branch in semp-client.ts:99-102 and the two tests that pin it (semp-client.test.ts:183, connections/module.test.ts:1400).

#### CR-0035 [minor] [new] Queue picker's fetch generation counters reset on every open, so a fetch from a closed picker writes into the next one

Location: src/core/components/queue-picker/index.ts:98-121, src/core/components/queue-picker/index.ts:169-198, src/core/components/queue-picker/index.ts:214-239, src/core/components/queue-picker/index.ts:274-281
Confidence: verified
Evidence:

    pickQueue builds a fresh state with `vpnFetchGen: 0, queueFetchGen: 0` (:119-120). fetchVpns
    does `const gen = ++state!.vpnFetchGen;` and guards with `if (!state

    state.vpnFetchGen !== gen) return;` (:171, :176). (1) Open the source picker, and close it while
    page 1 is in flight; the old loop holds gen 1. (2) Open the destination picker (another
    QueueSource); its fetch also gets gen 1. (3) The old loop resumes, passes the guard, and writes
    the old broker's VPNs into `state.vpns`. It then runs `ensureCache(source)` for the old source,
    which evicts the new source's single cache entry, and may selectVpn a VPN the new broker lacks.
    The queue path is the same: the old fetchQueues does `state.queueCache.set(vpn, ...)` under the
    new state, so a later selection of that VPN shows the other source's queues. renderQueueList
    (:281 `s.queueCache.get(s.selectedVpn!)!`) can throw on undefined, and the throw is swallowed by
    the v8-ignored catch. queue-discovery uses a module-level counter that never resets and does not
    have this bug.

Why it matters: The picker can list VPNs or queues from the wrong broker or scope. Later gates catch some of this, but the user can still pick a queue that does not exist on the destination.

Suggested patch (not applied):

```diff
--- a/src/core/components/queue-picker/index.ts
+++ b/src/core/components/queue-picker/index.ts
@@ -94,6 +94,9 @@
 let refs: Refs | null = null;
 let state: State | null = null;
 let pendingResolve: ((v: PickQueueResult | null) => void) | null = null;
+/** Fetch generations, never reset: a fetch from a closed picker can never match a later one's. */
+let vpnGenSeq = 0;
+let queueGenSeq = 0;
@@ -117,8 +120,8 @@
             vpnFilterTimer: null,
             queueFilterTimer: null,
-            vpnFetchGen: 0,
-            queueFetchGen: 0,
+            vpnFetchGen: vpnGenSeq,
+            queueFetchGen: queueGenSeq,
         };
@@ -170,3 +173,3 @@
     const source = state!.source;
-    const gen = ++state!.vpnFetchGen;
+    const gen = state!.vpnFetchGen = ++vpnGenSeq;
@@ -216,3 +219,3 @@
     const vpn = state!.selectedVpn!;
-    const gen = ++state!.queueFetchGen;
+    const gen = state!.queueFetchGen = ++queueGenSeq;
```

#### CR-0037 [minor] [new] queue-copy `state.job` is never reset (resetTransientState is dead code), so after the first run the rbac:changed destination teardown never runs

Location: src/modules/queue-copy/module.ts:405-441, src/modules/queue-copy/state.ts:184-195
Confidence: verified
Evidence:

    state.ts:184-191 documents resetTransientState as 'Called on module install and on a fresh
    "Start Copy" click' (`s.job = null;`), but nothing calls it (grep finds only its definition).
    service-copy.ts:101 sets `state.job = {...}` for every run and never clears it. module.ts:437
    `if (!destStillProvisioned && !state.job) { disconnectDestSemp(); disconnectDestSol(); }` is
    meant to defer the teardown only 'while a run is settling'. Because state.job stays non-null
    after any finished run, the teardown never runs again. :415 likewise sets cancelRequested on
    completed jobs.

Why it matters: After one copy, a destination whose provisioning was revoked keeps its live sessions until the user disconnects them by hand. The 'deferred while settling' logic is wrong, and the doc comment on resetTransientState is false.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/module.ts
+++ b/src/modules/queue-copy/module.ts
@@ -414,3 +414,3 @@
 
-            if (state.job && !state.job.cancelRequested) {
+            if (state.job?.status === 'running' && !state.job.cancelRequested) {
@@ -436,3 +436,3 @@
             // next refresh instead.
-            if (!destStillProvisioned && !state.job) {
+            if (!destStillProvisioned && state.job?.status !== 'running') {
```

#### CR-0013 [nit] [new] Import merge reads the stores outside their lock, so a concurrent admin edit before replaceUsers/replaceConnections is lost

Location: go-web-proxy/backup_api.go:318-347, go-web-proxy/backup_api.go:359-375, go-web-proxy/store.go:707-739
Confidence: verified
Evidence:

    backup_api.go:323 `users = mergeByName(h.store.listUsers(), doc.Users, userName)` and :340 do
    the same for connections. Both are snapshots taken under a released RLock. replaceUsers
    (store.go:715-721) then writes `next` wholesale. sf.mu (backup_api.go:315) does not serialise
    saveUser or saveConnection (managed.go:350-430 never take it). An import with users=merge is
    validating (validateUsers, checkSettings reading config.yaml) when another admin PUTs
    /managed/users/bob; replaceUsers writes the stale merge base, and bob's edit disappears without
    an error.

Why it matters: A lost update. The window is short (validation only), so impact is low.

Change: The window is short (validation only), so impact is low.

#### CR-0014 [nit] [new] Concurrent schedule saves can leave the in-memory schedule different from backup.yaml

Location: go-web-proxy/backup.go:538-581
Confidence: verified
Evidence:

    setSchedule writes the file (backup.go:557 `b.store.seal.writeDoc(roleSchedule, b.schedulePath,
    doc)`) and only then sets `b.sched = &doc` under b.mu (560-562). Nothing serialises the write
    together with the swap. Saves A and B race; A writes, B writes, B sets sched, A sets sched. Disk
    now holds B and memory holds A, so runs use A's key and keep count until the next restart, which
    loads B. removeSchedule (569-581) races the same way.

Why it matters: Admin-only and unlikely, but the running schedule and the persisted one can silently diverge. Holding one mutex across the write and the swap fixes it.

Change: Admin-only and unlikely, but the running schedule and the persisted one can silently diverge. Holding one mutex across the write and the swap fixes it.

### resilience

#### CR-0003 [major] [new] Backup directory check cannot tell an unmounted /backup: scheduled backups silently land in the container layer

Location: go-web-proxy/backup.go:724-742, go-web-proxy/backup.go:627-643, go-web-proxy/backup_api.go:80-97
Confidence: verified
Evidence:

    backup.go:726-741: `info, err := os.Stat(b.dir)` ... `f, err := os.CreateTemp(b.dir,
    ".probe-*")` ... `return ""`. The image bakes /backup owned by 65532 with mode 0700
    (docker/Dockerfile:91-94, 144) and asks the operator to mount a host directory there
    (Dockerfile:28-31). The operator runs the image without the /backup mount. Stat succeeds, the
    probe file is created, and dirProblem returns "", so GET /managed/backup (backup_api.go:82)
    reports no problem. run() -> writeNew (backup.go:629-642) then writes every scheduled backup
    into the container's writable layer, and the 'does not exist. Mount a directory there' branch
    (backup.go:728-729) can never fire in the shipped image. Recreating the container (upgrade,
    compose down/up, host loss), the event a backup exists for, deletes all of them.

    Second reading (partly): Image bakes /backup as 65532:0700 (Dockerfile:91-94,144), so without a
    mount Stat and the probe pass, dirProblem returns "" (backup.go:725-741) and writeNew writes
    into the container layer (628-642). The 'does not exist' branch is dead in the image (fixed
    backupRoot, main.go:145). Lowering: the behaviour is documented (Dockerfile:28-31,
    provisioned-mode.md:171-176 say to mount a host directory) and both shipped run paths mount it
    (compose.provisioned.yaml; the docker run -v example), so it bites only when the documented
    setup is skipped. The UI saying nothing is still a gap.

    Second reading (partly), blocker bar: Not a blocker. Nothing is lost when a backup is written;
    the backups are lost when the container is recreated, and only if the operator skipped the
    documented /backup mount. The live stores are unaffected: Holds for docker run: dirProblem
    (backup.go:725-742) checks existence, directory, probe file; the image bakes /backup owned by
    65532 (Dockerfile:91-94, 144) so on the writable layer every check passes; backupStatus reports
    DirProblem '' and lists files (backup_api.go:82, 91-95); writeNew writes into the layer
    (629-642). Partly refuted for the shipped compose: compose.provisioned.yaml:38 read_only: true,
    so without the ./backup:/backup line (:69) the probe fails with EROFS and the page shows 'is not
    writable'. Survives on the documented docker run path: provisioned-mode.md:80-86 has no
    --read-only and no /backup mount; only the separate backup section (:176) adds -v
    $PWD/backup:/backup. An admin who sets a schedule from the UI gets a healthy page and 'backup
    written' logs and loses everything on the next upgrade, the event the docs tell docker-run users
    to back up for (:78). Comparing st_dev with the parent, or warning when /backup is not a mount
    point, closes it.

Why it matters: A silent fallback: the Backup & Restore page and the logs say backups are healthy while none would survive the container. Comparing the st_dev of /backup with that of its parent (a mount has a different device) would turn it into a dirProblem.

Change: Make dirProblem detect a /backup that is not a mount point (compare the st_dev of /backup with its parent, or require a marker the operator's mount provides) and report it on the Backup & Restore page; add the same hint to the docker run instructions in provisioned-mode.md:80-86.

#### CR-0030 [major] [new] publisher.send throws synchronously on an invalid destination instead of settling { ok:false }; queue-copy then browses the whole queue and reports 'drained mid-run'

Location: src/core/services/solace-publisher.ts:102-108, src/core/services/solace-publisher.ts:206-222, src/modules/queue-copy/service-copy.ts:451-470, src/modules/queue-copy/service-copy.ts:513-546, src/modules/queue-browser/ui-events.ts:84-94
Confidence: verified
Evidence:

    The publisher documents 'Settled shape -- never rejects', but solace-publisher.ts:213 `const
    newMsg = cloneMessage(originalMsg, dest);` runs before the Promise is built.
    cloneMessage:105-107 calls `createDurableQueueDestination(dest.name)` /
    `createTopicDestination(dest.name)`, and the SDK's `createFromName(e){const
    t=s.DestinationUtil.validateAndEncode(i.TOPIC,e);if(t.error)throw t.error;...}` throws for an
    invalid name (empty level, misplaced '>', over-length). In service-copy.ts:453 `const result =
    await publisher.send(...)` sits in a try/finally with no catch. (1) The finally decrements
    inFlight and, because stopReason is still null, calls resetIdleTimer (:542-544). (2) The
    rejection escapes the async MESSAGE listener as an unhandled rejection. (3) Every following
    message does the same while the browser keeps delivering the entire source queue. (4) After
    IDLE_TIMEOUT_MS, triggerStop('idle') and evaluateAndFinish (:197-205) report 'Message count
    mismatch: sent 0, expected N. Messages were drained from the source mid-run.' The SDK's reason
    never reaches the user. In queue-browser forward (ui-events.ts:92-94), `.catch(() => ... 'Unable
    to send message.')` likewise drops it, contrary to the solaceErrorText rule.

    Second reading (confirmed): send() is not async (solace-publisher.ts:206); cloneMessage runs at
    213 outside the Promise; the try/catch at 248-256 covers only session.send. The SDK's
    createTopicDestination and createDurableQueueDestination call validateAndEncode and `throw
    t.error` for empty levels ('a//b', leading/trailing slash), an illegal '*', or more than 250
    bytes. queue-copy checks only for a non-empty name (module.ts:309). service-copy.ts:451-547
    try/finally with no catch: the rejection escapes the listener and the finally re-arms the idle
    timer; the idle path gives the 'drained mid-run' text (197-205). Moves lose no data
    (removeMessageFromQueue runs only on success, 483-486). The queue-browser forward wraps the
    throw in a rejection (service.ts:119-133) and ui-events.ts:92-94 replaces it with generic text.

    Second reading (confirmed), blocker bar: Not a blocker. In move mode nothing is deleted because
    removeMessageFromQueue runs only after a successful publish (service-copy.ts:475-490), and the
    job ends with status 'error'. An error path that reports the wrong cause after a pointless full
    browse: 1) solace-publisher.ts:213 calls cloneMessage before the Promise at :224; :105-107 call
    the SDK factories:
    `createTopicDestination=createFactory((e=>(isString("topicName",e),createFromName(e))))` and
    `createFromLocalName(e){const t=DestinationUtil.validateAndEncode(QUEUE,e);if(t.error)throw
    t.error;...}` with errors 'Empty level(s)', 'Illegal wildcard(s)', reserved prefixes, too-long
    names. 2) The destination is free text (ui-events.ts:189-191); neither verify nor
    destinationRefusal validates the name; no createXDestination outside the publisher. 3)
    service-copy.ts:451-513 is try/finally with no catch; finally decrements inFlight and calls
    resetIdleTimer (:542-544); the rejection escapes the async MESSAGE listener; no
    unhandledrejection handler in src. 4) After IDLE_TIMEOUT_MS=30_000 (constants.ts:19) the 'idle'
    stop gives copied 0 != total and :202-203 reports 'drained from the source mid-run'. Publisher
    tests pin only session.send throwing (:247-262). The forward path (ui-events.ts:92-94) shows
    FAILED with generic text (minor half).

Why it matters: A mistyped topic or queue name makes a copy or move browse the entire source, wait 30 s, then blame concurrent consumers. The real cause (an invalid destination name) is never shown.

Suggested patch (not applied):

```diff
--- a/src/core/services/solace-publisher.ts
+++ b/src/core/services/solace-publisher.ts
@@ -1,3 +1,3 @@
-import { generateUuid } from '../utils';
+import { generateUuid, solaceErrorText } from '../utils';
 import { logger } from '../logger';
@@ -210,16 +210,24 @@
             return Promise.resolve({ ok: false, error });
         }
 
-        const newMsg = cloneMessage(originalMsg, dest);
         const correlationValue = sendOpts.correlationKey ?? generateUuid();
         const timeoutMs = sendOpts.ackTimeoutMs ?? defaultTimeoutMs;
 
-        newMsg.setCorrelationKey({
-            Solace_Msg_Utility_Seq_Num: correlationValue,
-            Original_Msg_ID: sendOpts.originalIdHint ?? '',
-        });
-
-        sendOpts.beforeSend?.(newMsg);
+        let newMsg: any;
+        try {
+            newMsg = cloneMessage(originalMsg, dest);
+            newMsg.setCorrelationKey({
+                Solace_Msg_Utility_Seq_Num: correlationValue,
+                Original_Msg_ID: sendOpts.originalIdHint ?? '',
+            });
+            sendOpts.beforeSend?.(newMsg);
+        } catch (e) {
+            // e.g. an invalid topic or queue name: the SDK throws while addressing it.
+            const error = solaceErrorText(e, `Cannot send to ${dest.type} "${dest.name}".`);
+            sendOpts.onReject?.(error);
+            return Promise.resolve({ ok: false, error });
+        }
 
         return new Promise<SendResult>((resolve) => {
```

#### CR-0032 [major] [new] Esc closes the Confirm Queue Copy dialog without cancelling: a running copy/move continues with no visible Cancel, and an un-aborted verify can overwrite a later one

Location: src/modules/queue-copy/ui-events.ts:236-239, src/modules/queue-copy/ui-modal.ts:404-419, src/modules/queue-copy/ui-modal.ts:139-176, src/modules/queue-copy/ui.ts:572-587
Confidence: verified
Evidence:

    The modal is opened with `els.modal.showModal()` (ui-modal.ts:65). Cancel is wired only to the
    button: ui-events.ts:237 `els.btnModalCancel.addEventListener('click', () => {
    cancelCopyModal(els, state); });`. No 'cancel' listener exists anywhere (grep for
    addEventListener('cancel') / oncancel finds none). (1) Esc fires the native cancel event and
    closes the dialog. (2) During a run, cancelCopyModal never sets `state.job.cancelRequested`, so
    the engine keeps copying, or in move mode keeps deleting from the source. (3)
    setFormDisabled(true) (ui.ts:572-587) keeps the form and Next disabled, and the only Cancel
    control is inside the closed dialog. (4) During verify, the AbortController is never aborted. If
    the user reopens the modal, runVerify replaces state.verify, and the old verify's `.then`
    (ui-modal.ts:149-176) only checks `if (!state.verify) return;`, so its result is written into
    the new verify. That result may be for a different source queue, and handleModalStart then runs
    the engine with that total and those message IDs.

    Second reading (partly): Core claim holds: no closedby attribute (queue-copy/index.html:334),
    opened with showModal() (ui-modal.ts:65), Cancel wired only to the button
    (ui-events.ts:237-239), no cancel/close/Escape handler in src. Esc during a run closes the
    dialog, cancelRequested is never set, and the move keeps deleting; the form stays disabled
    (ui.ts:572-587) until onComplete (ui-modal.ts:388). The stale-verify part is overstated: a stale
    result can reach state.verify (:150 checks only non-null), but if it drove a run on a different
    queue the first-message drift check (service-copy.ts:375-383) stops the run with source-drift
    before anything is published (guaranteed-message IDs are unique per VPN). Likely worst case: a
    spurious error.

    Second reading (partly), blocker bar: Not a blocker. A move that keeps running after Esc still
    deletes each message only after its ACK, so nothing is lost. The stale-verify path is mostly
    caught by the first-message drift gate: Confirmed: showModal at ui-modal.ts:65; Cancel wired
    only to the button click at ui-events.ts:237; no 'cancel' listener, oncancel, Escape handler or
    closedby anywhere in src. Esc fires the native cancel event and closes the dialog; during a run
    cancelCopyModal (:404-419) never runs, so cancelRequested stays false; setFormDisabled(true)
    (ui-modal.ts:336, ui.ts:572-587) disables btnStart so the modal cannot be reopened; the run
    continues unseen until onComplete re-enables the form (:388). Partly refuted: the stale verify
    .then (:149-150, onProgress :146) does write into a newer state.verify, but a stale result for
    another queue carries that queue's oldestMsgId and service-copy.ts:375-381 stops the run with
    'source-drift' on the first message, before any publish -- a misleading error, not a wrong copy;
    the race also needs Esc, a source change and Next inside the old verify's lifetime. Esc during
    verify also leaves the temporary browser bound until idle or timeout.

Why it matters: A user who presses Esc to abort a move does not abort it and loses the means to: the dialog closes, the run keeps publishing and (in move mode) removing after each ack, and the form stays disabled until the run ends. A verify left un-aborted by Esc can also settle into a later verify; the first-message drift gate would then stop a run with a misleading 'source-drift' error rather than copy the wrong queue.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/ui-events.ts
+++ b/src/modules/queue-copy/ui-events.ts
@@ -236,6 +236,13 @@
     // ===== Modal buttons =====
     els.btnModalCancel.addEventListener('click', () => {
         cancelCopyModal(els, state);
     });
+    // Esc fires `cancel` on a modal <dialog>: route it through the same
+    // handler, so a verify is aborted and a running copy is cancelled rather
+    // than hidden behind a closed dialog.
+    els.modal.addEventListener('cancel', (e) => {
+        e.preventDefault();
+        cancelCopyModal(els, state);
+    });
```

#### CR-0002 [minor] [new] A half-supplied TLS pair (only tls.key or only tls.crt) is overwritten by a generated pair: deliberate in code and pinned by a test, but docs/deployment.md:154 says a pair is generated only 'With neither'

Location: go-web-proxy/tls.go:24-48, go-web-proxy/tls.go:104-114, go-web-proxy/tls.go:123-133
Confidence: verified
Evidence:

    tls.go:31-34 `certExists := fileExists(certFile)` / `keyExists := fileExists(keyFile)` / `if
    certExists && keyExists {`. In every other case, tls.go:48 `cert, err :=
    generateSelfSigned(certFile, keyFile)` writes both files through tls.go:124 `os.OpenFile(path,
    os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)`. An operator puts their own tls.key in the writable
    /tls volume (for example the key behind a CSR whose certificate is not issued yet), or only
    tls.crt, and starts the gateway. keyExists is true and certExists false, so generateSelfSigned
    truncates the operator's private key and writes a new one; the issued certificate will later not
    match any key. The comment at tls.go:25-26 promises 'do NOT regenerate over user-supplied
    material', but that guard covers only the case where both files are present and fail to parse.

    Second reading (partly): Overwrite is real (writePEM O_TRUNC, tls.go:124) but deliberate:
    tls.go:27 says 'If either file is missing, generate', and tls_test.go:131-147
    TestLoadOrGenerateServerCert_GeneratesWhenOnlyOneFilePresent pins it ('overwrite the stray
    cert'). The 'do NOT regenerate' promise (tls.go:25-26) covers only the both-present case. The
    real gap is docs/deployment.md:154, which says the gateway generates a pair 'With neither', so a
    lone tls.key being clobbered is undocumented. Needs an unusual half-supplied /tls; a lost CSR
    key means re-issuing the certificate.

    Second reading (partly), blocker bar: Not a blocker. A key is lost only if the operator puts
    half a pair into a volume the gateway can write and starts it; a CSR key normally stays where
    the CSR was made; a read-only mount or a file UID 65532 cannot write makes the start fail
    instead: tls.go:31-34 loads only when both exist; otherwise generateSelfSigned (48) writes both
    via writePEM O_TRUNC (104-114, 124). tls.go:27 says 'If either file is missing, generate' and
    tls_test.go:131-146 pins the overwrite on purpose. Real defect: code and docs disagree
    (deployment.md:154 'With neither'). Compensating: Warn with cert_exists/key_exists
    (tls.go:43-46) at the default level; an unwritable target stops the start (tls_test.go:283);
    bind mounts are usually :ro (docker-compose.e2e.yaml:49-50). Suggested fix: refuse to start when
    exactly one file exists.

Why it matters: Code and operator doc disagree about a destructive action: an operator who stages only a key (or only a certificate) in a writable /tls loses it on the first start, with only a warn line. Either refuse to start when exactly one file exists (naming both files), or change deployment.md:154 to say that a missing file on either side triggers generation and overwrites the other.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/tls.go
+++ b/go-web-proxy/tls.go
@@ -39,4 +39,14 @@ func loadOrGenerateServerCert(certFile, keyFile string, logger *slog.Logger) (tls.Certificate, error) {
 		logger.Info("loaded TLS server certificate", "cert_file", certFile, "key_file", keyFile)
 		return cert, nil
 	}
 
+	// Half a pair is the operator's material: generating would truncate the
+	// file that is there (writePEM opens with O_TRUNC).
+	if certExists != keyExists {
+		present, missing := certFile, keyFile
+		if keyExists {
+			present, missing = keyFile, certFile
+		}
+		return tls.Certificate{}, fmt.Errorf("TLS material incomplete: %s exists but %s does not; add the missing file, or remove both to have a self-signed pair generated", present, missing)
+	}
+
```

#### CR-0004 [minor] [new] A full throttle table refuses every legitimate sign-in, and the table is filled by attacker-chosen usernames

Location: go-web-proxy/throttle.go:11-14, go-web-proxy/throttle.go:86-119, go-web-proxy/throttle.go:135-146
Confidence: verified
Evidence:

    throttle.go:97-104 `if f := m[k]; f != nil { ... } if !hasRoom(t, m, now) { return t.lim.backoff
    }`. hasRoom (109-119) prunes only records that are stale (quiet for longer than maxBackoff,
    default 15 min). recordFailure (140-145) creates an entry for any submitted username, existing
    or not (userKey only truncates). An attacker submits one failed sign-in each for 10,000 distinct
    made-up usernames within 15 minutes (about 11/s, spread over 11 or more client /64s to stay
    under the 60/min unauthenticated bucket). t.users is now full and nothing is stale. Every real
    user with no failure record gets loginWait = backoff, i.e. a 429 'Too many attempts' before
    their password is checked, until entries age out 15 minutes after the attack stops. The comment
    at throttle.go:11-13 says the attacker pays the 429, but untracked legitimate users pay it too.

    Second reading (partly): Core claim holds (throttle.go:97-104, 109-119, 140-146). Attack cost
    wrong: every failure also counts against the client key (throttle.go:129); each address or /64
    is blocked after 5 failures, then 30s doubling to 15m (main.go:150-152), so ~10 sequential
    failures (or ~60 with the idx-0 burst) per client per 15 min; 10,000 names need roughly
    170-1,000 /64s, not 11 (cheap from an IPv6 /48, costly over IPv4). Failing closed is the stated
    design (throttle.go:11-13, 86-88): a trade-off, not an oversight.

Why it matters: Moderate effort locks every user out of sign-in for the whole gateway, and the lockout outlasts the attack by maxBackoff. Tracking per-user failures only for usernames that exist (unknown names sharing one key), or failing open for the user table while the client table still applies, would bound it.

Change: Moderate effort locks every user out of sign-in for the whole gateway, and the lockout outlasts the attack by maxBackoff. Tracking per-user failures only for usernames that exist (unknown names sharing one key), or failing open for the user table while the client table still applies, would bound it.

#### CR-0005 [minor] [new] Hasher concurrency is runtime.NumCPU(), so a burst of sign-ins can take every CPU, contrary to its stated purpose

Location: go-web-proxy/managed_routing.go:26, go-web-proxy/password.go:41-52, go-web-proxy/backup.go:126-134
Confidence: verified
Evidence:

    password.go:41-43: 'slots bounds how many run at once, so a burst of sign-ins cannot take every
    CPU'. managed_routing.go:26 `h, err := newHasher(passwordIter, runtime.NumCPU())` and
    password.go:52 `slots: make(chan struct{}, max(concurrency, 1))`. NumCPU is every logical CPU in
    the affinity mask and ignores the container's cgroup CPU quota, which GOMAXPROCS has honoured
    since Go 1.25. A burst of sign-ins, or exports and imports (deriveKey shares the slots,
    backup.go:128-133), runs NumCPU concurrent 600k-iteration PBKDF2s: at least every P the runtime
    has, so the relay, SMF pipes and static-file handlers are starved, and under a quota smaller
    than the host the process is CPU-throttled.

Why it matters: The bound meant to keep hashing from monopolising the CPU equals or exceeds the CPU, so it protects nothing. Hashing load from sign-ins then degrades every other gateway function.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/managed_routing.go
+++ b/go-web-proxy/managed_routing.go
@@ -25,3 +25,5 @@
 	}
-	h, err := newHasher(passwordIter, runtime.NumCPU())
+	// GOMAXPROCS honours the container's CPU quota (NumCPU does not); half of
+	// it leaves the rest for the relay, the sockets and the files.
+	h, err := newHasher(passwordIter, max(runtime.GOMAXPROCS(0)/2, 1))
 	if err != nil {
```

#### CR-0006 [minor] [new] Import that fails after an earlier section was written answers a bare 500, so the admin cannot tell what was applied

Location: go-web-proxy/backup_api.go:357-386, go-web-proxy/managed.go:190-193
Confidence: verified
Evidence:

    backup_api.go:360-368 `drop, err := h.store.replaceUsers(users)` ... `h.sessions.dropUser(name)`
    ... `result.SignedOut = slices.Contains(drop, caller)`, then 371-373 `if err :=
    h.store.replaceConnections(conns); err != nil { h.serverError(w, "importConnections (users
    already imported)", err); return }`, and the same at 377-380 for settings. serverError
    (managed.go:191-192) logs the op and writes `writeError(w, http.StatusInternalServerError,
    "server_error")`. An import of users + connections + settings: users are replaced and sessions
    dropped, possibly the caller's; the connections write fails (disk full, EACCES on /data). The
    browser gets 500 server_error with no field or reason. 'Users already imported' exists only in
    the server log, and result.SignedOut and RestartRequired are lost.

Why it matters: Breaks the house rule 'Errors are actionable: what failed, why ..., what to do next'. The store is left half-imported with no marker in the response, so the admin may believe nothing changed, or retry blind.

Change: Breaks the house rule 'Errors are actionable: what failed, why ..., what to do next'. The store is left half-imported with no marker in the response, so the admin may believe nothing changed, or retry blind.

#### CR-0009 [minor] [new] Shutdown ignores hijacked SMF/Direct WebSockets, waits on the backup loop with no deadline, and ignores a second signal

Location: go-web-proxy/main.go:275-291, go-web-proxy/main.go:410-450, go-web-proxy/smf.go:139-149, go-web-proxy/main.go:267-273, go-web-proxy/main.go:437-449, go-web-proxy/smf.go:139-150, go-web-proxy/sockets.go:20-83, go-web-proxy/managed_routing.go:53-58, go-web-proxy/proxy.go:362-371
Confidence: verified
Evidence:

    main.go:441-443 `err := srv.Shutdown(ctx)` / `stopBackups()` / `<-backupsDone`. net/http
    documents that Shutdown neither closes nor waits for hijacked connections. smf.go:139 hijacks
    every SMF socket, and the Direct relay's httputil.ReverseProxy hijacks WebSocket upgrades. No
    srv.RegisterOnShutdown cancels the socket registry, so serve returns while those handler
    goroutines are still in pipe(), and the process exit tears them down with no close.
    `<-backupsDone` has no timeout beyond the 10s shutdown deadline: a run blocked on a hung /backup
    mount (createExclusive fsync) stalls shutdown indefinitely. main.go:279-280 registers a buffered
    (1) channel that is read once (main.go:437), so a second SIGTERM or Ctrl-C does nothing.

    Also (a1): main.go:271-273 says shutdownTimeout 'is how long a graceful shutdown waits for open
    connections'. main.go:441 calls `srv.Shutdown(ctx)` and then logs 'shutdown complete' (L448).
    net/http's Shutdown does not close or wait for hijacked connections. The SMF gate hijacks
    (smf.go:139 `http.NewResponseController(w).Hijack()`, then pipe() until ctx is cancelled), and
    the Direct relay's ReverseProxy hijacks for WebSocket upgrades (proxy.go:370-371).
    socketRegistry has closeSession/closeUser/recheck but no close-all (sockets.go:54-83), only
    onDrop/onDropUser/onChange are wired (managed_routing.go:235-236), and nothing is registered
    with srv.RegisterOnShutdown. So on SIGTERM, Shutdown returns as soon as plain HTTP connections
    are idle, 'shutdown complete' is logged while sockets are still open, and they end only when the
    process exits. In-process tests of serve leak the pipe goroutines.

    Second reading (partly): Shutdown neither waits for nor closes hijacked connections; SMF gate
    hijacks (smf.go:139-149); no RegisterOnShutdown; 'shutdown complete' (main.go:448) can be logged
    with sockets open. Impact small: a registry cancel just closes both TCP sides with no close
    frame (smf.go:185-191), the same on the wire as process exit. <-backupsDone waits for an
    in-progress run() with no deadline (main.go:442-443), intended (main.go:410-411), hangs only on
    a hung mount until SIGKILL. Second signal ignored (main.go:279-280, 437). The test-leak claim is
    unfounded: no serve test opens a socket (main_test.go:400-588).

Why it matters: Shutdown is not bounded as its constant claims: hijacked SMF and Direct WebSocket connections are neither closed nor waited for (they end only when the process exits, which on the wire looks the same as a registry cancel), an in-progress backup run holds shutdown with no deadline, and a second signal is ignored. The serve tests do not open sockets, so no goroutine leak follows in tests.

Change: Register a socketRegistry closeAll with srv.RegisterOnShutdown, bound the wait on backupsDone with the same deadline, and make a second signal exit.

#### CR-0011 [minor] [new] Generated self-signed certificate expires after 365 days and is never renewed or warned about

Location: go-web-proxy/tls.go:30-41, go-web-proxy/tls.go:86-92
Confidence: verified
Evidence:

    tls.go:91 `NotAfter: now.Add(365 * 24 * time.Hour)`. On later starts both files exist, so
    tls.go:35-40 `cert, err := tls.LoadX509KeyPair(certFile, keyFile)` ... `logger.Info("loaded TLS
    server certificate", ...)` loads it without checking cert.Leaf.NotAfter. A deployment running on
    the generated pair reaches day 366; restarts keep loading the expired certificate; browsers
    refuse the connection; the gateway logs only an info line (below the default warn level) and TLS
    handshake errors at info.

    Second reading (partly): NotAfter is 365 days (tls.go:91); loaded with no expiry check
    (tls.go:34-40); load line at Info (tls.go:39) below the default Warn (main.go:141); handshake
    errors at Info (main.go:407). deployment.md:154 documents 'valid 365 days' and tells operators
    to supply /tls/tls.crt. No Strict-Transport-Security header anywhere, so an expired self-signed
    cert gives the usual click-through warning rather than a refused connection unless clients
    imported it as trusted; 'predictable outage' is overstated. The missing warning on an expired or
    near-expiry leaf is real.

Why it matters: A year after first start the generated certificate expires; restarts keep loading it, browsers show the usual certificate warning (a refused connection only where clients imported it as trusted), and nothing in the default-level log names the cause. deployment.md:154 documents the 365 days but the gateway never warns.

Change: Warn at startup when the loaded leaf is expired or within 30 days of expiry, and consider regenerating a pair the gateway itself generated.

#### CR-0012 [minor] [new] A missing app bundle starts the gateway anyway and serves 404s, and serveIndex logs nothing

Location: go-web-proxy/proxy.go:121-140, go-web-proxy/proxy.go:177-185, go-web-proxy/main.go:380
Confidence: verified
Evidence:

    newPWAHandler (proxy.go:123-136) only warns when appRoot is missing or empty and returns a
    handler that 404s everything. It never checks that the mode's index (provisioned.html or
    index.html) exists. serveIndex (proxy.go:178-181) `data, err := os.ReadFile(root + "/" + name)`
    / `if err != nil { http.Error(w, name+" not found", http.StatusNotFound); return }` has no log
    line. An operator mounts their own build at /SolaceMsgUtility without provisioned.html and runs
    connModes provisioned. The gateway starts healthy, and every navigation returns '404
    provisioned.html not found'. The server log has only access-log lines, at info, below the
    default warn level.

Why it matters: Breaks the house rule 'a systemic misconfiguration fails the whole start loudly': a packaging error that makes the gateway useless starts healthy and is invisible in the log.

Change: Breaks the house rule 'a systemic misconfiguration fails the whole start loudly': a packaging error that makes the gateway useless starts healthy and is invisible in the log.

#### CR-0034 [minor] [new] SEMP and gateway requests after the connect probe have no deadline; startup awaits /hosted and /managed/me serially with the event bus held

Location: src/core/kernel.ts:309-343, src/core/services/semp-client.ts:121-130, src/core/services/managed-api.ts:33-43, src/core/services/semp-discovery.ts:43-49, src/modules/queue-subscription-explorer/module.ts:134-158, src/core/kernel.ts:106-110, src/modules/connections/module.managed.ts:71-98, src/core/hosted.ts:52-55
Confidence: verified
Evidence:

    Only the validation probe has a timeout (semp-client.ts:96 `setTimeout(() => controller.abort(),
    15000)`). Requests with no signal and no deadline: kernel.ts:334 `const response = await
    fetch(url, finalOptions);`, the secondary sempFetch at semp-client.ts:121-127, managed-api.ts:36
    `res = await fetch(path, {...})`, semp-discovery.ts:49 `await sempCtx.fetch(path)`, and the
    subscription explorer's POST. (1) A broker or gateway that accepts the connection but never
    answers leaves the subscription explorer on 'Loading...' with Load disabled (module.ts:138-139)
    until SEMP is disconnected. (2) The picker shows 'Loading VPNs...' forever. (3) Admin buttons
    (export, import, save) stay disabled. (4) At startup, kernel.ts:106-110 runs
    `this.eventBus.hold(); for (const mod of this.modules) { await this.installModule(mod); }`, and
    connections install awaits probeDeployment (hosted.ts:55 `fetch('/hosted', ...)`) and then
    `await managedPanel.restore()` (module.managed.ts:98, GET /managed/me). A stalled answer, such
    as a reverse proxy holding the request, stops every later module from installing and keeps the
    bus held, so the page shows nothing and gives no error.

    Second reading (partly): The only deadline in src is the probe's AbortController
    (semp-client.ts:95-96); kernel.ts:334, semp-client.ts:121-127, managed-api.ts:36,
    semp-discovery.ts:49 pass no signal; queue-copy verify has a user-cancel AbortController, not a
    timeout. kernel.ts:106-110 installs serially with the bus held; renderSidebar only after (120);
    connections awaits probeDeployment (hosted.ts:55) and restore() (module.managed.ts:98). But the
    startup hang needs the same origin that just served the page to stall on /hosted or /managed/me
    (a static host 404s at once), and the SEMP hang needs a broker that accepts the connection and
    never answers. Unusual conditions, so major overstates it.

    Second reading (partly), blocker bar: Not a blocker. No wrong results, no data loss, no guard
    bypass. In gateway deployments the gateway's own upstream timeouts bound the broker-stall case,
    and the startup hang needs the page's own origin to stall: Mechanics verified: the only deadline
    in src/ is the probe (semp-client.ts:95-96); kernel.ts:334, semp-client.ts:121-125,
    managed-api.ts:36, semp-discovery.ts:49 pass no signal; the kernel holds the bus and awaits each
    install (kernel.ts:106-110); connections install awaits probeDeployment (module.managed.ts:71)
    then restore() -> service.me() (module.managed.ts:98, managed-panel.ts:330); installModule's
    try/catch handles throws, not hangs. Compensating control missed: every broker-bound request in
    Gateway or Provisioned mode uses newUpstreamTransport (proxy.go:219-231: dial 10 s, TLS 10 s,
    ResponseHeaderTimeout 30 s) and RoundTrip errors become 502 (relay.go:173-176, proxy.go:256), so
    a stalled broker shows as an error after ~30-50 s. /hosted and /managed/* are answered by the
    gateway itself. What remains: Direct mode with no gateway against a broker that accepts TCP and
    never answers; and something in front of the gateway stalling /hosted or /managed/me. Browser
    response timeouts may bound some cases (suspected). Queue-copy verify is cancellable
    (ui-modal.ts:144).

Why it matters: Requests after the connect probe carry no deadline, so a dependency that accepts the connection and never answers leaves the subscription explorer, the picker or the admin pages waiting indefinitely, and at startup a stalled /hosted or /managed/me (the page's own origin) keeps every later module from installing with no error. In gateway deployments the gateway's own upstream timeouts (dial 10 s, TLS 10 s, response header 30 s) turn a stalled broker into a 502, so the unbounded cases are Direct mode against a silent broker and a stalled origin.

Change: Give kernel.sempFetch, semp-client's sempFetch, managedRequest and the discovery loop an AbortSignal with a timeout (AbortSignal.timeout), and let the connections install race the probe against a timeout so the app renders with an error instead of a blank page.

#### CR-0036 [minor] [new] Move mode counts a message as moved when removeMessageFromQueue throws, and still reports 'completed'

Location: src/modules/queue-copy/service-copy.ts:477-501, src/modules/queue-copy/service-copy.ts:197-205, tests/modules/queue-copy/service-copy.test.ts:887-917, src/modules/queue-copy/service-copy.ts:484-501
Confidence: verified
Evidence:

    :483-491 `if (!browserDisconnected) { try { browser.removeMessageFromQueue(msg); ... } catch (e:
    any) { logger.warn(`[Copy] removeMessageFromQueue for id=${msgId} threw: ${e?.message}`); } }`,
    followed unconditionally by :496 `state.job!.copied++;`. evaluateAndFinish (:197-201) marks the
    run 'completed' when copied === total. (1) A remove that throws leaves the message on the
    source. (2) The message is still counted and reported as moved. (3) Only a warn line in the
    console shows that anything went wrong.

    Also (a5): service-copy.ts:485 `browser.removeMessageFromQueue(msg);` is inside a try whose
    catch (:487-491) only does `logger.warn(...)`. Then :496 `state.job!.copied++` and onProgress
    run regardless. The test at service-copy.test.ts:887 "swallows a removeMessageFromQueue throw --
    the successful publish still increments copied" makes remove throw and asserts `final.status` is
    'completed' and `final.copied` is 1. No counter or UI signal records that the source delete
    failed. The branch is covered, but the outcome asserted is the silent one.

Why it matters: The user is told the move completed while some messages remain on the source as duplicates of what was published, and the failure is logged and then ignored.

Change: The user is told the move completed while some messages remain on the source as duplicates of what was published, and the failure is logged and then ignored.

#### CR-0040 [minor] [new] A browser that goes DOWN after UP stays registered: it holds one of the 3 binding slots and blocks re-binding the queue

Location: src/modules/queue-browser/service-events.ts:105-110, src/modules/queue-browser/service.ts:46-50, src/modules/queue-browser/ui-events.ts:146-150
Confidence: verified
Evidence:

    onConnectFailed cleans up with `_disconnectBrowser(queueName)` (service-events.ts:102).
    onBrowserDown (:105-110) only logs and, if the queue is the one on screen, shows a banner. It
    never removes the dead browser from `state.browserInstances` or its store. (1) createBrowser
    still counts the dead browser against `MAX_BROWSER_BINDINGS` (service.ts:47). (2)
    handleBindClick refuses to re-bind with `Queue "${queueName}" is already bound.`
    (ui-events.ts:147-148). (3) If the queue is not the one on screen, the user sees nothing at all.

    Second reading (partly): onBrowserDown (service-events.ts:105-110) does no cleanup while
    onConnectFailed calls _disconnectBrowser (:102); the dead entry counts toward the limit
    (service.ts:47) and blocks re-binding (ui-events.ts:147-148). Qualifiers: the common broker-side
    losses never reach DOWN_ERROR (the SDK leaves reconnectAttempts at -1 and the flow FSM
    auto-rebinds on QUEUE_SHUTDOWN, TOPIC_ENDPOINT_SHUTDOWN, GM_UNAVAILABLE, REPLAY_STARTED); only
    non-retryable unbinds (a deleted queue, an admin unbind) leave a dead entry; session loss is
    cleaned by client:disconnected -> disconnectAll (module.ts:233-236). 'No indication' overstates:
    the user sees 'already bound' or 'Connection Limit Reached' and the queue stays in the dropdown
    where it can be unbound.

Why it matters: After a broker-side flow loss, the user must find and unbind the dead queue by hand before re-binding it or binding a third queue, with no indication of why binding is refused.

Change: After a broker-side flow loss, the user must find and unbind the dead queue by hand before re-binding it or binding a third queue, with no indication of why binding is refused.

#### CR-0041 [nit] [new] matchString caches one compiled RegExp per distinct pattern with no bound

Location: src/core/utils.ts:40-57, src/core/utils.ts:66-70
Confidence: verified
Evidence:

    :40 `const matchStringRegexCache = new Map<string, RegExp>();`, :51
    `matchStringRegexCache.set(pattern, regex);`, and matchContains (:69) calls `matchString(text,
    `*${q}*`)`. Every distinct search or filter string typed in a long session adds an entry that is
    never evicted.

Why it matters: The cache grows slowly and without limit over a long session; capping it or using an LRU would keep it bounded.

Change: The cache grows slowly and without limit over a long session; capping it or using an LRU would keep it bounded.

### quality

#### CR-0038 [minor] [new] alert() is used for user-facing errors and results, against the error-handling rule, and one message tells the user to check the console

Location: src/modules/queue-browser/ui-events.ts:322-350, src/modules/queue-browser/service.ts:204-208, src/modules/queue-browser/ui-table.ts:215-226, src/modules/queue-browser/ui-table.ts:255-261, src/modules/queue-browser/ui-table.ts:215-262, src/modules/queue-browser/ui-events.ts:322-349, src/modules/queue-discovery/module.ts:241-247
Confidence: verified
Evidence:

    docs/contributing.md:195 'Show user-facing errors in dedicated error elements, not `alert()`.'
    Violations: ui-events.ts:328 `window.alert(result.error

    'Delete failed.');`, :347 `window.alert('No messages were deleted. Check console for
    errors.');`, service.ts:207 `error: removedIds.size === 0 ? 'No messages were deleted. Check
    console for errors.' : undefined`, and ui-table.ts:217/224/260 `alert(...)`. The per-message SDK
    exception (service.ts:187-189) is only logged, so the user gets no reason and no next step.

    Also (a4): docs/contributing.md:195 says: 'Show user-facing errors in dedicated error elements,
    not alert().' ui-table.ts calls `alert('JSZip library not loaded. Cannot create ZIP.');` (217),
    `alert('No messages selected.');` (224) and `alert('Failed to generate ZIP file.');` (260).
    ui-events.ts calls `window.alert(result.error

    'Delete failed.')` (328, 343), reports success through alert (330, 345), and shows 'No messages
    were deleted. Check console for errors.' (347). queue-discovery calls `alert('Please select a
    VPN and Queue first.');` (246). Every other module reports outcomes with showToast or an inline
    error element.

Why it matters: This breaks a house rule, and the error is not actionable: it names neither the message nor the cause and points the user at DevTools.

Change: This breaks a house rule, and the error is not actionable: it names neither the message nor the cause and points the user at DevTools.

#### CR-0057 [minor] [new] queue-browser's forward modal reaches the DOM through document.getElementById instead of its container, because the module keeps module-scoped singletons

Location: src/modules/queue-browser/ui-forward.js:150-176, src/modules/queue-browser/ui-core.js:7-16, src/modules/queue-browser/state.js:23-35
Confidence: verified
Evidence:

    CLAUDE.md Architecture Anchor 3 says: 'No document.getElementById() -- always scope to the
    module's container.' ui-forward.js:159 has `const iconContainer =
    document.getElementById(`status-${correlationValue}`);` and 164 has `const errorContainer =
    document.getElementById(`error-${correlationValue}`);`, each followed by an `if (...)` null
    guard on a module-owned element. The root cause is that queue-browser keeps module-scoped
    singletons: `export const ui = {};` and `export const els = {};` (ui-core.js:7, 10), and `export
    const state = {...}` (state.js:24). These legacy helpers therefore have no container to query.
    It is the only feature module with module-level mutable state, against Anchors 2 and 4.

    Second reading (partly): The violation is real: document.getElementById at ui-forward.js:159 and
    :164, against CLAUDE.md Anchor 3; the singletons (ui-core.js:7,10; state.js:24) exist and
    contributing.md:316 documents the state.js singleton for tests. But the stated root cause is
    wrong: renderForwardList writes these rows into els.listForwardMsgs (ui-forward.js:101), a
    required() element reachable through ui.getElements(), so els.listForwardMsgs.querySelector(...)
    works today. The ids embed a generated unique correlationValue (ui-forward.js:37-54), so the
    duplicate-id risk is implausible. Rows rendered per item are dynamic content, not template-owned
    elements, so the null guards are arguably allowed.

Why it matters: An Anchor 3 violation. The rows live inside els.listForwardMsgs (a required() element), so a container-scoped querySelector is a one-line change; the duplicate-id risk is implausible because the ids embed a unique correlation value. The module-level singletons are the older pattern and are documented for tests, not a new defect.

Change: Replace the two document.getElementById calls in ui-forward.js:159,164 with els.listForwardMsgs.querySelector(...).

#### CR-0058 [minor] [new] Dead production code: an unused config module, a probe only tests call, an unused cap constant and unreachable branches

Location: src/core/connections/defaults.ts:1-98, src/core/hosted.ts:57-60, src/core/hosted.ts:75-82, src/modules/queue-browser/constants.js:2, src/modules/queue-browser/ui-events.ts:335-349, src/modules/queue-browser/ui-forward.js:145-149
Confidence: verified
Evidence:

    A grep across src/, scripts/ and tests/ shows that DEFAULT_CONFIG and validateConfig are
    imported only by tests/core/connections/defaults.test.ts. No production file imports
    src/core/connections/defaults.ts, although its header claims it 'match[es] the initial values
    rendered by the connections module's form'; the real validation lives in module.ts. probeHosted
    (hosted.ts:80) is used only by tests/core/hosted.test.ts. The legacy branch `if (lower ===
    'true') return { hosted: true, ... }; // legacy plaintext` (hosted.ts:59) serves a gateway the
    image no longer ships, since hostedHandler always writes JSON (proxy.go:51-59). `export const
    MAX_MESSAGES_PER_QUEUE_LIMIT = 10000;` (constants.js:2) has no reader. handleBulkDelete's final
    `else { window.alert('No messages were deleted. ...') }` (ui-events.ts:346-348) needs ok=true
    with count=0. deleteMessages returns that only for an empty id list (service.ts:142-143), and
    handleBulkDelete already returns early on an empty list (ui-events.ts:337).
    ui.onForwardFailure's `err.message

    err` (ui-forward.js:147) is dead too, because both callers pass string literals
    (ui-events.ts:30, 37).

    Second reading (partly): Holds: defaults.ts imported only by
    tests/core/connections/defaults.test.ts; probeHosted called only from tests;
    MAX_MESSAGES_PER_QUEUE_LIMIT has no reader; onForwardFailure called only with strings
    (ui-events.ts:30, :37). The 'why' is wrong: DEFAULT_CONFIG.connectRetries 0 matches the Direct
    form's value=0 (connections/index.html:144); managed-profile.ts:169 is the Provisioned dial, a
    different path. The bulk-delete else branch can also be reached when state.currentQueue is ''
    (service.ts:142 !queueName; reset at ui-core.js:166), though in practice rows are cleared along
    with it.

Why it matters: Dead production code costs tests and misleads readers: src/core/connections/defaults.ts is a validator nothing runs (its DEFAULT_CONFIG mirrors the Direct form's defaults correctly today, but nothing enforces that), probeHosted and MAX_MESSAGES_PER_QUEUE_LIMIT have no production caller, and two branches are unreachable in practice.

Change: Delete defaults.ts and its test (or wire validateConfig into the connections module), delete probeHosted and MAX_MESSAGES_PER_QUEUE_LIMIT, and remove the unreachable else branch and the string fallback with their tests.

#### CR-0059 [minor] [new] Commented-out defensive guards from the 2026-05-26 audit are still in three services

Location: src/modules/queue-copy/service-copy.ts:119-124, src/modules/queue-copy/service-copy.ts:165-171, src/modules/queue-copy/service-copy.ts:282-295, src/modules/queue-copy/service-copy.ts:322-331, src/modules/queue-copy/service-verify.ts:474-481, src/core/services/solace-publisher.ts:226-234
Confidence: verified
Evidence:

    Examples: service-copy.ts:120 `// let drainStarted = false;`, 123 `// let finished = false;`,
    170-171 `// if (finished) return; // finished = true;`, and 288-296, where a live
    `queueMicrotask(() => void drainAndFinish());` is bracketed by `// if (!drainStarted) {` ... `//
    }`. Also service-copy.ts:329-330 `// if (stopReason !== null) return; // if (inFlight > 0) {
    resetIdleTimer(); return; }`, service-verify.ts:480 `// if (!bound)` and solace-publisher.ts:234
    `// if (!entry) return;`. Each sits inside a multi-line comment explaining why it is unreachable
    and is 'kept commented in case' a future change needs it.

    Second reading (partly): All the commented guards are present (service-copy.ts:121, :124,
    :170-171, :288-295, :329-330; service-verify.ts:480; solace-publisher.ts:234). The blanket
    'delete them' advice is wrong for one: service-verify.ts:480 `// if (!bound)` is not dead
    (bindTimer can fire after UP); that guard needs to become live again or bindTimer needs clearing
    on UP. The service-copy.ts:322-328 claim that 'inFlight===0 is the only reachable state' is
    shaky: IDLE_TIMEOUT_MS and DEFAULT_PUBLISH_ACK_TIMEOUT_MS are both 30 s (constants.ts:19,
    solace-publisher.ts:7), so a slow ack can let idle fire with inFlight>0. Treat each comment as a
    claim to check, not as dead code.

Why it matters: Commented code plus its justification roughly doubles the reading cost of the hardest state machine in the app (runCopyJob), and git history already keeps the guards. They should be deleted, with one sentence stating the invariant where it matters.

Change: Delete the commented-out guards and their explanatory comments where the invariant holds (service-copy.ts:121, :124, :170-171, :288-295; solace-publisher.ts:234), replacing each with one sentence stating the invariant; treat service-verify.ts:480 and service-copy.ts:329-330 as live questions (the bind-timer finding shows the first is not dead; the 30 s idle and ack timeouts coincide for the second) and fix the code rather than delete the comment.

#### CR-0060 [minor] [new] Admin list plumbing is copy-pasted between connection-management and user-management, and setError exists six times

Location: src/modules/connection-management/module.ts:94-152, src/modules/user-management/module.ts:115-175, src/modules/backup/module.ts:126-129, src/modules/connections/managed-panel.ts:125-128, src/modules/gateway-settings/module.ts:98-101, src/modules/queue-copy/ui.ts:505-513
Confidence: verified
Evidence:

    renderList is the same 30 lines in both modules with different labels: a matchContains filter,
    an empty row (`td.colSpan = 3; td.className = 'text-secondary'; ...`), a per-row iconButton
    edit/delete pair and an actions cell. Both then define an identical applyGate (`if (!m?.admin) {
    showGate(); return; } showView('list'); void loadList();`) and an identical loadList
    (`setError(els.listError, null); const res = await service.list...(); if (!res.ok) {
    reportManagedFailure(res, eventBus, msg => setError(els.listError, msg)); return; }`). `function
    setError(el, msg) { el.textContent = msg ?? ''; el.classList.toggle('hidden', !msg); }` is
    repeated in five files, and queue-copy/ui.ts adds a sixth variant, setErrorPane. CLAUDE.md
    anchor 9 and golden rule 4b say that what is reusable across two or more features belongs in
    src/core, and to 'never fork a parallel implementation'.

    Second reading (partly): renderList (connection-management/module.ts:100-128 vs
    user-management/module.ts:121-149) and applyGate (133-141 vs 154-162) are clones apart from
    labels. loadList is not identical: the user-management one also sets choices and users and calls
    accessTest.setData (171-174). setError(el,msg) appears verbatim in four files
    (connection-management:94, user-management:115, backup:126, managed-panel:125);
    gateway-settings:98 is a one-argument variant; queue-copy/ui.ts:505 setErrorPane is a sixth
    variant. Nothing like it in src/core/dom.ts. Real duplication; 'identical' and 'five files'
    overstate.

Why it matters: The next admin-list change (a column, the empty state, an action) has to be made twice, and the copies already diverge in naming (conn-mgmt-* vs user-mgmt-*). A core admin-list helper and a setError in dom.ts would prevent that.

Change: The next admin-list change (a column, the empty state, an action) has to be made twice, and the copies already diverge in naming (conn-mgmt-* vs user-mgmt-*). A core admin-list helper and a setError in dom.ts would prevent that.

#### CR-0061 [minor] [new] Protocol limits and connection defaults are repeated as literals in several places

Location: src/modules/queue-browser/constants.js:1-2, src/modules/connections/module.ts:270-271, src/core/connections/defaults.ts:26-30, src/core/connections/defaults.ts:93-94, src/modules/connections/index.html:161, src/core/services/managed-profile.ts:167-170, src/modules/connections/module.ts:499, src/core/services/semp-client.ts:96, src/core/services/semp-client.ts:155
Confidence: verified
Evidence:

    The 1-10000 message cap appears four times: `MAX_MESSAGES_PER_QUEUE_LIMIT = 10000`
    (constants.js:2, unused), `const MAX_MESSAGES_LIMIT = 10000;` (connections/module.ts:271), `>
    10000` with 'must be 1-10000' (defaults.ts:93-94) and `max="10000"` (index.html:161). The
    default of 100 appears as DEFAULT_MAX_MESSAGES_PER_QUEUE (constants.js:1), `maxMessages ?? 100`
    (module.ts:499) and `maxMessagesPerQueue: 100` (managed-profile.ts:170, defaults.ts:30). The
    Provisioned session's SDK settings are inline literals, `connectRetries: 1, connectTimeout:
    3000, reconnectRetries: 1, reconnectWait: 3000` (managed-profile.ts:169), while DEFAULT_CONFIG
    says connectRetries 0 (defaults.ts:26). semp-client hard-codes `setTimeout(() =>
    controller.abort(), 15000)` (96) and repeats the value in prose, 'Connection timed out (15s)'
    (155).

    Second reading (partly): Every literal is where cited (constants.js:1-2,
    MAX_MESSAGES_PER_QUEUE_LIMIT referenced nowhere; connections/module.ts:271 and :499;
    defaults.ts:26-30 and :93-94; index.html:161; managed-profile.ts:169-170; semp-client.ts:96 and
    :155). Weak step: 'the copies already disagree (connectRetries 0 vs 1)' compares two different
    defaults (the Direct form's DEFAULT_CONFIG vs the Provisioned session's fixed cfg), not two
    copies of one value. Mitigation: connections cannot import queue-browser constants (cross-module
    rule), so a shared constant would have to live in core/connections/defaults.ts.

Why it matters: Changing a limit means finding every copy, and the one named constant for the 1-10000 cap is the copy nothing reads. The connectRetries values are two different defaults (Direct form vs Provisioned dial), not drift, but they are spread the same way.

Change: Keep one source for the message cap and default (src/core/connections/defaults.ts, which connections and queue-browser may both import) and read the 15 s probe timeout from one constant in both the code and the message.

#### CR-0063 [minor] [new] No linter or formatter is configured or gated, and the .js modules are not type-checked

Location: tsconfig.json:2-10, scripts/dev.sh:151-157
Confidence: verified
Evidence:

    The repo root has no ESLint or Prettier config and no .editorconfig. `task_vet` runs only `npm
    run typecheck` and `go -C "$GO_DIR" vet ./...` (dev.sh:155-156), with no `gofmt -l` check.
    tsconfig.json sets `"allowJs": true` without `checkJs`, so state.js, ui-core.js, ui-forward.js
    and constants.js (queue-browser), config.js and ui.js (connections), and queue-discovery/ui.js
    are parsed but never type-checked. Without noUnusedLocals or noUnusedParameters, an unused
    export such as MAX_MESSAGES_PER_QUEUE_LIMIT is invisible to the gate. From reading the tree, the
    TS side is consistently 4-space indented and the Go side looks gofmt'd, so consistency currently
    rests on discipline alone.

Why it matters: Several findings in this review (an unused constant, raw err.message use, alert(), document.getElementById, commented-out code) are what a lint rule set catches mechanically. ESLint rules such as no-alert and no-restricted-properties, plus gofmt -l, would enforce house rules the docs already state.

Change: Several findings in this review (an unused constant, raw err.message use, alert(), document.getElementById, commented-out code) are what a lint rule set catches mechanically. ESLint rules such as no-alert and no-restricted-properties, plus gofmt -l, would enforce house rules the docs already state.

#### CR-0101 [minor] [new] DOMParser try/catch: ignored in parse.ts, but service-verify's copies are kept green by impossible throwing-parser stubs

Location: src/modules/queue-subscription-explorer/parse.ts:40-54, src/modules/queue-copy/service-verify.ts:252-259, src/modules/queue-copy/service-verify.ts:301-313, tests/modules/queue-copy/service-verify.test.ts:443-469, tests/modules/queue-copy/service-verify.test.ts:831-861
Confidence: verified
Evidence:

    parse.ts:41-51: `/* v8 ignore start -- DOMParser does not throw in browsers or jsdom; it embeds
    parser errors as <parsererror> nodes which we check below ... */ let doc: XMLDocument; try { doc
    = new DOMParser().parseFromString(xml, 'text/xml'); } catch (e: any) { return { ok: false,
    error: ... }; }`. service-verify.ts:253-258 (`try { doc = new DOMParser().parseFromString(text,
    'text/xml'); } catch { return null; }`) and :301-307 are the same catch, not ignored. Three
    tests keep them green by replacing globalThis.DOMParser with a throwing class: :443-469 >
    'supplementary DOMParser throw -> newestMsgId null', :836-848 > 'parser throw is reported as a
    SEMP v1 parse error' and :850-860 > 'parser throw without a message falls back to "unknown"'. No
    browser produces that state. parseFromString throws only for an unsupported type argument, and
    here the type is the literal 'text/xml'. Malformed XML returns a <parsererror> document, which
    both files check on the next line. The app sets no Trusted Types CSP either (grep for
    'trusted-types' in src/, go-web-proxy/ and docker/ finds nothing). Rules: 'Don't validate
    scenarios that cannot happen'; 'Tests must be real-scenario, never ceremonial'.

Why it matters: Proposed fix: delete the try/catch in all three places (`const doc = new DOMParser().parseFromString(xml, 'text/xml');`), drop parse.ts's ignore, and delete the three DOMParser-stub tests. The parsererror tests stay. Alternate: keep all three catches and remove parse.ts's ignore by giving it a stubbed-DOMParser test too. That is consistent, but it spreads the ceremonial pattern. The proposed fix is better: the platform contract is specified, not assumed. Three catches, one ignore and three impossible-state tests go away, and coverage stays at 100%.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-subscription-explorer/parse.ts
+++ b/src/modules/queue-subscription-explorer/parse.ts
@@ -40,12 +40,5 @@
 export function parseSubscriptionsResponse(xml: string): ParseResult {
-    /* v8 ignore start -- DOMParser does not throw in browsers or jsdom; it
-     * embeds parser errors as `<parsererror>` nodes which we check below.
-     * This try/catch is defensive against engine quirks and is exercised
-     * only in the (unreachable) failure path. */
-    let doc: XMLDocument;
-    try {
-        doc = new DOMParser().parseFromString(xml, 'text/xml');
-    } catch (e: any) {
-        return { ok: false, error: `SEMP v1 parse error: ${e?.message ?? 'unknown'}` };
-    }
-    /* v8 ignore stop */
+    // parseFromString does not throw for 'text/xml'; malformed input becomes a
+    // <parsererror> document, checked next.
+    const doc = new DOMParser().parseFromString(xml, 'text/xml');
     if (doc.querySelector('parsererror')) {
--- a/src/modules/queue-copy/service-verify.ts
+++ b/src/modules/queue-copy/service-verify.ts
@@ -252,7 +252,2 @@
     const text = await res.text();
-    let doc: XMLDocument;
-    try {
-        doc = new DOMParser().parseFromString(text, 'text/xml');
-    } catch {
-        return null;
-    }
+    const doc = new DOMParser().parseFromString(text, 'text/xml');
     if (doc.querySelector('parsererror')) return null;
@@ -300,8 +295,3 @@
 ): VerifyResult {
-    let doc: XMLDocument;
-    try {
-        doc = new DOMParser().parseFromString(xml, 'text/xml');
-    } catch (e: any) {
-        result.errors.push(`SEMP v1 parse error: ${e?.message ?? 'unknown'}`);
-        return result;
-    }
+    const doc = new DOMParser().parseFromString(xml, 'text/xml');
 
```

#### CR-0103 [minor] [new] Dead fallbacks and presence guards on stored-message fields that ingest always sets

Location: src/modules/queue-browser/state.js:128, src/modules/queue-browser/state.js:154, src/modules/queue-browser/state.js:179, src/modules/queue-browser/state.js:189, src/modules/queue-browser/ui-events.ts:19, src/modules/queue-browser/ui-details.ts:28, src/modules/queue-browser/ui-forward.js:109, src/modules/queue-copy/service-verify.ts:173, tests/modules/queue-browser/ui-events.test.ts:88-92, tests/modules/queue-browser/state.test.ts:306-344
Confidence: verified
Evidence:

    service-events.ts:133 `let contentStr = '';`. Every branch assigns a string, and :229-231 does
    `if (showPayload()) { m.content = contentStr; }`. The readers run only in the payload flavor.
    handleCopyContent is wired only under `if (showPayload())` (module.ts:179-183).
    downloadMessageContent is a payload-only leaf (the download buttons are omitted in no-payload).
    ui-forward.js:108-109 sits inside `if (showPayload())`. state.js:125-128 runs only when fContent
    is set, and fContent comes from #filter-content, a data-payload element removed at
    module.ts:37-39. So `content

    ''` at state.js:128, ui-events.ts:19, ui-details.ts:28 and ui-forward.js:109 is either dead
    (undefined or null) or a no-op (`''

    ''`). state.js:154 `dest ? (dest.getName()

    '') : ''`: SDK Destination.getName returns its name string. state.js:179 `if
    (msg.msgProperties)` and :189 `if (!matchProp && msg.appProperties)`: service-events.ts:193-222
    always sets both to objects (the IIFEs return {} at minimum), and state.js:150-151 itself notes
    that shouldShowMessage only sees messages from that pipeline. service-verify.ts:173
    `${res.statusText

    ''}`: Response.statusText is typed string, and ''

    '' is ''. Impossible-state tests keep these green: ui-events.test.ts:88-92 > 'handles null
    content', state.test.ts:306-314 > 'property filter ignores message that has no msgProperties
    field' and :336-344 > 'property filter ignores message that has no appProperties field'. House
    rule (contributing.md:386): 'Not valid: `|| 'fallback'` on values the service always sets --
    drop the fallback or push the default into the service.'

Why it matters: Proposed fix: drop the fallbacks and the two presence guards, and delete the three impossible-state tests. Keep the empty-content tests (ui-events.test.ts > 'handles empty content', ui-details.test.ts > 'handles empty content'): an empty body is real, and they still pass. service-verify.test.ts > 'non-2xx without statusText still surfaces the code' (statusText '', as over HTTP/2) also stays green. Alternate: push a typed default into the stored-message shape and keep the readers as they are. The proposed fix is better: the producer already guarantees the shape. Land it after the property-filter bug fix, which touches state.js:183/192.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-browser/state.js
+++ b/src/modules/queue-browser/state.js
@@ -128 +128 @@
-        const content = msg.content || '';
+        const content = msg.content;
@@ -154 +154 @@
-        const msgDestName = dest ? (dest.getName() || '') : '';
+        const msgDestName = dest ? dest.getName() : '';
--- a/src/modules/queue-browser/ui-events.ts
+++ b/src/modules/queue-browser/ui-events.ts
@@ -19 +19 @@
-        const content = state.selectedMessage.content || '';
+        const content = state.selectedMessage.content;
--- a/src/modules/queue-copy/service-verify.ts
+++ b/src/modules/queue-copy/service-verify.ts
@@ -173 +173 @@
-            result.errors.push(`SEMP v1 returned ${res.status} ${res.statusText || ''}`.trim());
+            result.errors.push(`SEMP v1 returned ${res.status} ${res.statusText}`.trim());
--- a/src/modules/queue-browser/ui-details.ts
+++ b/src/modules/queue-browser/ui-details.ts
@@ -28 +28 @@
-        const content = msg.content || '';
+        const content = msg.content;
--- a/src/modules/queue-browser/ui-forward.js
+++ b/src/modules/queue-browser/ui-forward.js
@@ -109 +109 @@
-            cleanContent = (item.originalMsg.content || '').replace(/(\r\n|\n|\r)/gm, " ");
+            cleanContent = item.originalMsg.content.replace(/(\r\n|\n|\r)/gm, " ");
```

#### CR-0062 [nit] [new] Comments point at files, lines or siblings that no longer exist

Location: src/core/services/solace-publisher.ts:118-123, src/modules/queue-browser/service.ts:129-131, src/modules/queue-subscription-explorer/module.ts:158-165, src/modules/queue-browser/constants.js:4, src/core/connections/defaults.ts:8-11, src/css/components.css:184, scripts/vite-build.mjs:2-16, go-web-proxy/proxy.go:224
Confidence: verified
Evidence:

    solace-publisher.ts:122-123 says 'Matches the historical policy in queue-copy/message-clone.ts
    and queue-browser/service.ts', but src/modules/queue-copy/ has no message-clone.ts.
    queue-browser/service.ts:129 says '`originalMsg.id` is set in `service-events.ts:172`', but the
    assignment is at service-events.ts:187. QSE module.ts:160 refers to 'The in-loop line-122
    check', which is at line 145. constants.js:4 says 'Enforced by service.createBrowser and its
    mock sibling', but mock siblings are banned and none exists. defaults.ts:10-11 points at
    'ui.js's showError and validateSolace/validateSemp', while its own docblock at 47-48 says
    module.ts. components.css:184 says 'consolidates former duplicate at old line 414'.
    vite-build.mjs's header documents --variant and --out-filename, but CUSTOM_FLAGS also accepts
    'show-payload' (33). proxy.go:224 says '// gated by SSL_INSECURE_SKIP_VERIFY=true', but
    config.yaml's tls.insecureSkipVerify is what gates it.

    Second reading (partly): Verified stale: solace-publisher.ts:122-123 (no message-clone.ts);
    service.ts:129 ':172' vs service-events.ts:187; QSE module.ts:160 'line-122' vs :145;
    constants.js:4 'mock sibling'; defaults.ts:10-11 vs :47-48; components.css:184. Qualified:
    vite-build.mjs is an omission (show-payload at :33 used by package.json:8,11, undocumented in
    the header), not a stale pointer; proxy.go:224 is half stale (SSL_INSECURE_SKIP_VERIFY is still
    read at main.go:177 and seeds tls.insecureSkipVerify, configfile.go:23, :195).

Why it matters: Line numbers and file names rot, which is why the project's own test cross-reference rule bans them. Readers who follow these pointers land on the wrong code.

Change: Line numbers and file names rot, which is why the project's own test cross-reference rule bans them. Readers who follow these pointers land on the wrong code.

#### CR-0064 [nit] [new] Redundant !important declarations on hover rules and module-only selectors kept in the shared stylesheet

Location: src/css/components.css:222-233, src/css/components.css:139-148, src/modules/queue-browser/styles.css:52-59, src/css/components.css:469-521
Confidence: verified
Evidence:

    CLAUDE.md anchor 8 says: 'Don't reach for !important to beat cross-file specificity -- the rule
    is in the wrong file', and 'component-prefixed selectors (.picker-*, .toast-*) belong in the
    component's'. `.hover-danger:not(:disabled):hover { background-color: ... !important; color:
    white !important; border-color: ... !important; }`, and the same rule for .hover-success
    (components.css:223-233), exist to beat `.btn-secondary:hover` (145-148), and only queue-browser
    buttons use them (queue-browser/index.html:92-98). queue-browser/styles.css:52-59 `.data-table
    tr.selected td { background-color: var(--solace-mint) !important; }` overrides the shared
    .data-table rules in components.css. The .toast-* rules (components.css:469-521) sit in the
    shared file even though the rule above names .toast-* as component-prefixed.

    Second reading (partly): The !important uses are redundant but do not win any cross-file
    specificity: .hover-danger/.hover-success (components.css:223-233) and .btn-secondary:hover
    (:145) are in the same file, and `.x:not(:disabled):hover` (0,3,0) already beats (0,2,0).
    queue-browser/styles.css:52-59 overrides nothing (no shared .data-table rule sets a td
    background; tr:hover sets it on the tr) and already lives in the module's file. Only
    queue-browser uses .hover-* (index.html:92-98). .toast-* in components.css:469-521 departs from
    anchor 8's literal example, but toast is src/core/toast.ts, not a src/core/components/<name>/
    directory, so there is no component stylesheet to move it to.

Why it matters: The !important in .hover-danger/.hover-success beats nothing (same file, and the :not(:disabled):hover selector already outranks .btn-secondary:hover); queue-browser's tr.selected override also needs none. Only queue-browser uses .hover-*, so those rules belong in its styles.css. The .toast-* rules have no component directory to move to.

Change: Drop the four !important flags and move .hover-danger/.hover-success into src/modules/queue-browser/styles.css.

#### CR-0102 [nit] [new] try/catch around SDK message getters that only read fields: ignored in one helper, tested with a throwing fake in its sibling

Location: src/modules/queue-copy/service.ts:9-23, src/modules/queue-copy/service-verify.ts:501-511, tests/modules/queue-copy/service.test.ts:39-42, tests/modules/queue-copy/service-verify.test.ts:874-888
Confidence: verified
Evidence:

    queue-copy/service.ts:10-21: `try { const appId = originalMsg.getApplicationMessageId?.(); ...
    const gmId = originalMsg.getGuaranteedMessageId?.(); ... /* v8 ignore start -- defensive catch
    around SDK getter calls; the mock's getters never throw, production SDK could return malformed
    objects on rare error paths. */ } catch { /* fallthrough */ }`. The SDK contradicts that:
    dist/solclient.js has `getApplicationMessageId(){return this._applicationMessageId}` and
    `getGuaranteedMessageId(){return this._guaranteedMsgId}`, plain field reads. The demo SDK's
    versions (mock-broker/sdk/message.ts:99-106) do not throw either. getOriginalIdHint takes the
    message as an argument, so 'the mock's getters never throw' is the test's choice, not an
    architectural limit. The sibling does it the other way. msgIdToString
    (service-verify.ts:501-511) wraps the same getter in an identical try/catch with no ignore, and
    service-verify.test.ts:885-888 > 'returns null when getGuaranteedMessageId throws' keeps it
    green with a throwing fake. The `?.()` calls are dead for SDK messages too, kept green by
    service.test.ts:39-42 > 'handles missing getters (both return undefined)' (`const msg: any =
    {};`) and service-verify.test.ts:874-878. Rules: 'Don't validate scenarios that cannot happen';
    'Tests must be real-scenario, never ceremonial'.

    Second reading (partly): Both SDK getters are plain field reads
    (getApplicationMessageId(){return this._applicationMessageId}, getGuaranteedMessageId(){return
    this._guaranteedMsgId}); the demo getters do not throw either
    (mock-broker/sdk/message.ts:99-106). The inconsistency is real (service.ts:15-21 ignores the
    catch while service-verify.ts:501-511 keeps a ceremonial throwing-fake test,
    service-verify.test.ts:885-888). Overstated policy breach: project CLAUDE.md's Coverage Policy
    allows v8 ignores for a 'defensive catch around contracts that never throw', so the service.ts
    ignore is sanctioned; only its wording ('the mock's getters never throw') is weak.

Why it matters: Proposed fix: delete both try/catch blocks and the getOriginalIdHint ignore, and delete 'returns null when getGuaranteedMessageId throws'. Optional, in the same change or a separate one: drop the `?.` calls and the `{}` and null message tests. That requires service-verify.test.ts:643-658 > 'messages without smfHeader.messageLength still bump count, sizeBytes stays 0' to pass message-shaped objects instead of {} and null. Alternate: keep both catches and give both an ignore with a 'defensive catch on trusted contract' comment. The proposed fix is better: these are pure helpers over field reads, so the catch protects nothing and restores no UI state. Making the siblings agree by deleting removes an ignore and an impossible-state test.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/service.ts
+++ b/src/modules/queue-copy/service.ts
@@ -9,15 +9,7 @@
 export function getOriginalIdHint(originalMsg: any): string {
-    try {
-        const appId = originalMsg.getApplicationMessageId?.();
-        if (appId) return String(appId);
-        const gmId = originalMsg.getGuaranteedMessageId?.();
-        if (gmId) return String(gmId);
-    /* v8 ignore start -- defensive catch around SDK getter calls; the mock's
-     * getters never throw, production SDK could return malformed objects on
-     * rare error paths. */
-    } catch {
-        /* fallthrough */
-    }
-    /* v8 ignore stop */
+    // SDK message getters are plain field reads; nothing here can throw.
+    const appId = originalMsg.getApplicationMessageId?.();
+    if (appId) return String(appId);
+    const gmId = originalMsg.getGuaranteedMessageId?.();
+    if (gmId) return String(gmId);
     return '(no id)';
--- a/src/modules/queue-copy/service-verify.ts
+++ b/src/modules/queue-copy/service-verify.ts
@@ -501,11 +501,7 @@
 export function msgIdToString(msg: any): string | null {
-    try {
-        const id = msg?.getGuaranteedMessageId?.();
-        if (id === null || id === undefined) return null;
-        // SDK returns a `Long` instance with toString(); BigInt and plain
-        // number both also stringify cleanly.
-        return String(id);
-    } catch {
-        return null;
-    }
+    const id = msg?.getGuaranteedMessageId?.();
+    if (id === null || id === undefined) return null;
+    // SDK returns a `Long` instance with toString(); BigInt and plain
+    // number both also stringify cleanly.
+    return String(id);
 }
```

### tests

#### CR-0067 [major] [new] Verify and copy are never tested with createQueueBrowser throwing; the call is unguarded and the modal drops the rejection

Location: src/modules/queue-copy/service-verify.ts:377-391, src/modules/queue-copy/service-copy.ts:116, src/modules/queue-copy/service-copy.ts:250, src/modules/queue-copy/ui-modal.ts:139-176, src/modules/queue-copy/ui-modal.ts:358-391, tests/modules/queue-copy/service-copy.test.ts:547-578, tests/modules/queue-copy/service-verify.test.ts:767-776, src/modules/connections/managed-panel.ts:232-246
Confidence: verified
Evidence:

    service-verify.ts:377 `return new Promise<VerifyResult>((resolve) => {` ... :391 `const browser
    = session.createQueueBrowser(props);` with no try. service-copy.ts:116 `return new
    Promise<void>((resolve) => {` ... :250 `browser = primarySession.createQueueBrowser(props);`
    with no try. A synchronous throw in a Promise executor rejects the promise. ui-modal.ts:138
    `void verifySource({...}).then((result) => {` and the chain ends at :176 with no .catch.
    ui-modal.ts:358 `void runCopyJob(state, primarySession, {` has no catch either. So on a throw,
    `state.verify.inProgress` stays true (or onComplete never fires) and the modal stays at
    Verifying or Copying. The only throw paths the tests drive are `browser.connect`
    (service-copy.test.ts:551,567; service-verify.test.ts:767,776) and `browser.disconnect`. No test
    makes `session.createQueueBrowser` throw in either engine. By contrast,
    queue-browser/service.ts:38-75 wraps the same call in try/catch, and managed-panel.ts:237-243
    deliberately throws from a wrapped createQueueBrowser (`throw new Error(\`You are not entitled
    to browse queue ...\`)`) on the primary session. 100% coverage cannot reveal this because there
    is no catch branch to cover.

    Second reading (confirmed): createQueueBrowser is called with no guard inside a Promise executor
    in both engines (service-verify.ts:391, service-copy.ts:250); a synchronous throw rejects the
    promise; verifySource awaits it (:117); neither ui-modal chain (:139, :358) has a .catch and src
    has no unhandledrejection handler. Copy path: state.job is already 'running' (:101),
    setFormDisabled(true) (:336) never reverts, and the first Cancel only sets the flag (:412-415).
    Real triggers exist: the managed wrapper throws (managed-panel.ts:242-243) and nothing re-runs
    evaluateStartGate on rbac:changed between verify and Start; the SDK throws GM_UNAVAILABLE when
    _adDisabledReason is set. No test throws from createQueueBrowser in either engine;
    queue-browser/service.ts:38-75 does guard the call.

    Second reading (confirmed), blocker bar: Does not meet the blocker bar. The throw happens before
    any browse, publish or remove, so nothing is lost, and the user can get out through Cancel; the
    trigger is unlikely: Code path verified: service-verify.ts:391 and service-copy.ts:250 call
    createQueueBrowser inside Promise executors with no try; ui-modal.ts:139-176 and :358-390
    discard the promise with `void` and no .catch; no global unhandledrejection handler in src; no
    queue-copy test makes createQueueBrowser throw (only browser.connect at
    service-copy.test.ts:551,567; service-verify.test.ts:767,776). queue-browser/service.ts:38-75
    guards the call and managed-panel.ts:226-231 says callers are expected to catch the wrapper's
    throw, so queue-copy breaks that contract. Impact smaller than claimed: a stuck verify is closed
    by cancelCopyModal (:405-410); a stuck copy leaves job.status 'running' and two Cancel clicks
    close the modal (:412-418). Triggers: the verify fallback runs only without sempCtx
    (service-verify.ts:108-117); the managed wrapper (managed-panel.ts:237-244) reads live
    appState.managed while the gate uses a snapshot taken when the modal opens (ui-modal.ts:56-60),
    diverging only if the profile is refreshed while the modal is open; the real SDK throws
    GM_UNAVAILABLE only when _adDisabledReason is set and with a publisher configured the session
    constructor throws first. Disposed-session behaviour unconfirmed.

Why it matters: The code path and the missing test are verified. The trigger is suspected: the real SDK throwing OperationError (INVALID_OPERATION) from createQueueBrowser on a disposed or disconnected session, or the managed RBAC wrapper after a revocation between the ui-modal.ts:106 gate and Start, would leave the copy modal stuck with an unhandled rejection. Tests to add: in tests/modules/queue-copy/service-verify.test.ts, "createQueueBrowser throwing resolves a failed verify result" (arrange `session.createQueueBrowser.mockImplementation(() => { throw new Error('INVALID_OPERATION') })`, act verifySource, assert it resolves `sourceOk:false` with the message). In service-copy.test.ts, "createQueueBrowser throwing completes with status=error" (assert onComplete is called with status 'error' and lastError set). Both fail today and force the guard.

Change: Wrap createQueueBrowser in both engines so a synchronous throw settles the verify result / completes the job with status 'error' (as queue-browser/service.ts does), add .catch to the two `void` chains in ui-modal.ts, and add the two tests described (createQueueBrowser throwing in verify and in copy).

#### CR-0065 [minor] [new] The 100% web coverage thresholds are never enforced by CI or the tag pipeline; only a local `cov` run checks them

Location: scripts/dev.sh:276-277, .github/workflows/ci.yml:73-78, .github/workflows/tag.yml:9, .github/workflows/tag.yml:139, vitest.config.ts:45-50, docs/contributing.md:71
Confidence: verified
Evidence:

    dev.sh:276 `ALL="build vet test mock"`. Only FULL (277), the local pre-tag sweep, has `cov`.
    ci.yml:73 runs `./scripts/dev.sh all scan` and :78 runs `./scripts/dev.ps1 all scan`.
    tag.yml:139 `uses: ./.github/workflows/ci.yml`, and its header (line 9) describes the gates as
    "`all scan` (build vet test scan)", which also leaves out mock. vitest.config.ts:45-50 sets
    `thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }`, but those apply
    only under `--coverage`, which only `npm run test:coverage` (task_cov) passes. No workflow step
    mentions cov or coverage. contributing.md:71 says CI "cannot catch a coverage regression". That
    holds for the cov.log floor, not for the absolute 100% thresholds, which a fresh checkout can
    enforce. A contributor skips `cov` (or runs only `all`) -> pushes a tag -> gates run `test`
    (vitest without --coverage) -> green -> release ships below the project's headline 100% gate.

    Second reading (partly): Facts hold: ALL = 'build vet test mock' (dev.sh:276, dev.ps1:352);
    ci.yml:73/:78 run `all scan`; tag.yml:139 reuses ci.yml; the tag.yml:9 comment omits mock;
    thresholds (vitest.config.ts:45-50) apply only under --coverage (package.json:25). But this is
    the documented design: the init-devops contract (dev-script-contract.md:22-23) defines `all` as
    what CI runs and puts cov in `full`, the pre-tag sweep; docs/git.md:45-58 says main can sit
    broken between releases. A valid suggestion to change the contract, not a defect in this repo.

Why it matters: The 100% thresholds in vitest.config.ts gate only `./scripts/dev.sh cov`, which the init-devops contract and docs/git.md deliberately keep in the local pre-tag `full` sweep; CI runs `all scan` without coverage, so a tag cut without the sweep can publish a release below the headline 100%. A documented design choice, but one that rests on discipline when COV_QUEUED already makes `all cov scan` cheap; the change belongs in the init-devops template.

Change: In the init-devops template, run `all cov scan` in ci.yml (both legs) or add cov to ALL; fix the tag.yml:9 comment that omits mock.

#### CR-0066 [minor] [new] The Go race detector is never run, so the gateway's only race test asserts nothing

Location: scripts/dev.sh:169, scripts/dev.ps1:224, go-web-proxy/store_test.go:994-1010, docs/test-report.md:974
Confidence: verified
Evidence:

    dev.sh:171 `run test go -C "$GO_DIR" test -count=1 ./...`, dev.ps1:224 is the same, and task_cov
    has no -race either. A grep for `-race` across scripts/ and .github/ finds nothing. The only
    mention is docs/test-report.md:974, "(use `CGO_ENABLED=1` for `-race`)", a manual hint.
    store_test.go:994-1010 TestStore_CRUD_RaceSafe starts 10 goroutines calling
    profile/listUsers/checkPassword/upsertUser/listConnections, then `wg.Wait()`, with no assertion.
    Without -race it only fails on a deadlock or a runtime-detected map write. The gateway holds
    shared mutable state touched per request (session.go, throttle.go, sockets.go, live.go,
    settings.go, store.go, backup.go, relay.go, smf.go:175-180, main.go:427). test-report.md calls
    this "a writer race test", but it can never fail on a race.

    Second reading (partly): No -race anywhere in scripts/ or .github/; Go runs at dev.sh:169 and
    dev.ps1:224; task_cov has none. store_test.go:994-1010 has no assertion after wg.Wait();
    test-report.md:974 is the only hint. relay_test.go:343-371 (TestRelay_InFlightCapPerUser) is
    also concurrent but asserts behaviour. Without -race Go still detects concurrent map writes
    best-effort. No actual race is named: a gap in rigor (minor), not a likely bug.

Why it matters: A missing or misplaced lock in sessions, throttle, the socket registry or the live settings would ship. Under concurrent sign-ins or relays that crashes the gateway with `fatal error: concurrent map writes`, or silently corrupts session or throttle state. Add `-race` to the Go run in task_test on the Linux leg (CGO_ENABLED=1; gcc is present on ubuntu-24.04), mirrored in dev.ps1 with a guard where no C toolchain exists.

Change: Add -race (CGO_ENABLED=1) to the Go test run in task_test on the Linux leg, mirrored in dev.ps1 with a guard where no C toolchain exists; reword test-report.md:974 so the race test is not described as something it cannot be without the detector.

#### CR-0068 [minor] [new] The copy/move engine is never run against a realistic SDK (neither the demo broker nor the real SDK); its tests hand-drive mock handlers

Location: tests/modules/queue-copy/service-copy.test.ts:38-86, scripts/e2e.mjs:13-16, tests/mock-broker/sdk.test.ts:109-160, tests/mock-broker/sdk.test.ts:195-213, tests/mock-broker/sdk.test.ts:260-272, tests/mock-broker/demo-flow.test.ts:131-273
Confidence: verified
Evidence:

    runCopyJob and verifySource appear only in tests/modules/queue-copy/service-copy.test.ts (37
    refs) and dest-provisioned.test.ts (5). In both, every SDK event is fired by the test itself.
    service-copy.test.ts:59-62 `ackLast` reaches into `(session.send as
    any).mock.calls.at(-1)?.[0]?.setCorrelationKey ...
    mock.calls.at(-1)?.[0]?.Solace_Msg_Utility_Seq_Num` and fires `_handlers.ACKNOWLEDGED_MESSAGE`
    by hand. Synchronisation is `flush(n = 20)` microtask pumping (:84-86). The in-browser demo SDK
    already models what the engine depends on: acks with the correlation key nested
    (sdk.test.ts:110), real enqueue (130), stop()/start() backpressure (195-213),
    removeMessageFromQueue dropping depth (260-272). Yet demo-flow.test.ts only lists queue-copy in
    the nav and never runs a copy. e2e.mjs:13-16: "Nothing on the broker is created or changed: the
    run reads it ... and browses an existing queue". So Move (publish, then delete from the source)
    never meets a real or realistic SDK in any gate.

Why it matters: A change in event ordering, ack correlation or backpressure that the hand-driven harness does not reproduce would ship green, for example the engine reading the correlation key at another nesting, stop() and start() racing with SDK-side buffering, or remove-after-ack ordering. In Move mode that means messages left behind, duplicated, or removed before their publish is acknowledged. Add tests/mock-broker/copy-flow.test.ts: boot the demo broker (scenario.latencyMs=0), open a session through the demo SDK, run verifySource and then runCopyJob from a seeded source queue to a destination queue, in copy and in move mode. Assert the destination depth increased by N, the source depth is unchanged (copy) or 0 (move), and onComplete status is 'completed'. Add a REJECTED fault case asserting the source keeps the message.

Change: A change in event ordering, ack correlation or backpressure that the hand-driven harness does not reproduce would ship green, for example the engine reading the correlation key at another nesting, stop() and start() racing with SDK-side buffering, or remove-after-ack ordering. In Move mode that means messages left behind, duplicated, or removed before their publish is acknowledged. Add tests/mock-broker/copy-flow.test.ts: boot the demo broker (scenario.latencyMs=0), open a session through the demo SDK, run verifySource and then runCopyJob from a seeded source queue to a destination queue, in copy and in move mode. Assert the destination depth increased by N, the source depth is unchanged (copy) or 0 (move), and onComplete status is 'completed'. Add a REJECTED fault case asserting the source keeps the message.

#### CR-0069 [minor] [new] The global fetch mock keeps its implementation and unconsumed *Once values across tests; setup.ts re-installs every other global but this one

Location: tests/setup.ts:38, tests/setup.ts:259-300, tests/modules/connections/module.test.ts:1715-1786
Confidence: verified
Evidence:

    setup.ts:37 `(globalThis as any).fetch = vi.fn();` is created once. beforeEach calls
    `vi.clearAllMocks()` and re-installs localStorage, confirm, alert,
    URL.createObjectURL/revokeObjectURL and clipboard (setup.ts:262-279), but never fetch. In vitest
    4.1.12, `mockClear` only empties `state.calls/results/...`
    (node_modules/@vitest/spy/dist/index.js:142-149). Resetting `config.mockImplementation` and
    `onceMockImplementations` happens only in `mockReset` (151-157). `restoreAllMocks` only restores
    spyOn targets (467-471). So a test's `(globalThis.fetch as any).mockImplementation(...)` or a
    leftover `mockResolvedValueOnce` carries into the next test in the file.
    connections/module.test.ts:1715 and :1750 set `mockImplementation` on the global fetch. The
    describe at :1781-1786 then works around the leak: "the install-time probe would otherwise reset
    the flag based on the default fetch mock's behavior". That "default" is whatever the previous
    test left behind.

Why it matters: Order-dependent results. A test that should see fetch return undefined (or reject) can pass on a previous test's 200 stub, hiding a failure path, and reordering or `.only` changes outcomes. Resetting fetch in the global beforeEach removes the class. No test file sets fetch in beforeAll or at module level, so nothing relies on cross-test persistence.

Suggested patch (not applied):

```diff
--- a/tests/setup.ts
+++ b/tests/setup.ts
@@ -278,3 +278,7 @@ beforeEach(() => {
     (URL.revokeObjectURL as any).mockImplementation(() => {});
     (navigator.clipboard.writeText as any).mockResolvedValue(undefined);
+    // clearAllMocks/restoreAllMocks leave a vi.fn()'s implementation and any
+    // unconsumed *Once values in place: reset fetch so every test starts from
+    // the bare vi.fn() rather than the previous test's stub.
+    (globalThis.fetch as any).mockReset();
 
```

#### CR-0071 [minor] [new] The gateway contract pins only refusals and admin CRUD: no successful relay, no 429/5xx, no sign-in, no headers

Location: go-web-proxy/testdata/contract/cases.json, go-web-proxy/contract_test.go:191-227, tests/mock-broker/gateway/contract.test.ts:66-81, tests/mock-broker/gateway/error-codes.test.ts:36-55, tests/mock-broker/gateway/throttle.test.ts:1-11
Confidence: verified
Evidence:

    cases.json has 44 cases with step statuses {422:45, 200:30, 404:21, 204:13, 403:12, 401:10,
    400:6, 409:3}: no 429, 500 or 502. Every relay step answers 403 read_only, 404 or 400; none is a
    forwarded 200. Sessions are opened with `e.cookie(s.As, s.MustChange)`
    (contract_test.go:212-216) and `gw.openSession` (contract.test.ts:66-69), so /login,
    /login/password and the throttle are outside the contract. Both sides compare only `rec.Code`
    and the decoded JSON body (contract_test.go:224; contract.test.ts:80-81), never headers such as
    Retry-After or Content-Type. error-codes.test.ts:43-55 FAULTS (rate_limited 429,
    upstream_unavailable 502, upstream_auth 502, config_unreadable 500, config_changed_on_disk 409)
    asserts only the fake's own status. throttle.test.ts:3-11 holds the fake throttle "against
    go-web-proxy/throttle.go's rules" through a hand-copied `LIMITS = { maxFailures: 5,
    backoffSeconds: 30, maxBackoffSeconds: 900 }`.

Why it matters: A real-gateway change to a 429 or 502 body, to Retry-After, to relay success forwarding, or to throttle backoff leaves the Provisioned demo answering differently, and every suite stays green. Extend the contract: give newContractEnv a scripted upstream RoundTripper for relay 200 and 502 cases, add an optional `headers` map to contractStep (checked on both sides), and add sign-in/throttle cases (or shared throttle vectors in testdata/contract) read by throttle_test.go and tests/mock-broker/gateway/throttle.test.ts.

Change: Extend the contract: give newContractEnv a scripted upstream RoundTripper for relay 200 and 502 cases, add an optional `headers` map to contractStep (checked on both sides), and add sign-in/throttle cases (or shared throttle vectors in testdata/contract) read by throttle_test.go and tests/mock-broker/gateway/throttle.test.ts.

#### CR-0072 [minor] [new] The RBAC glob conformance vector is copied by hand into two tables and has already drifted

Location: tests/core/rbac.test.ts:6-27, go-web-proxy/rbac_test.go:5-34, go-web-proxy/rbac_test.go:36-48, go-web-proxy/contract_test.go:261-321
Confidence: verified
Evidence:

    rbac.test.ts:6-7: "This MUST stay in lockstep with go-web-proxy/rbac_test.go's equivalent
    table". rbac_test.go:5-6 says the same in reverse. Both are inline literals. The Go side has an
    extra case TS lacks: rbac_test.go:36-48 TestMatchGlob_NoOverlap (`"a*a"` must not match `"a"`),
    and grep finds no `a*a` in rbac.test.ts. The project already shares vectors through a file for
    the other cross-language rules: testdata/contract/validation.json, read by
    contract_test.go:261-321 and contract.test.ts:86-110. TS matchGlob also drives the fake
    gateway's entitlement (src/mock-broker/gateway/store.ts:9,28).

    Second reading (partly): Both tables hand-copied (rbac.test.ts:10-27, rbac_test.go:13-30) and
    identical row for row today (16 rows each), so no drift yet. The extra Go case
    TestMatchGlob_NoOverlap (rbac_test.go:37-48) guards the hand-written splitter in Go
    (rbac.go:28-32); TS uses an anchored regex (rbac.ts:47-52) where that bug cannot happen, so no
    semantic divergence now. Risk still real: per-queue gating is client-side only (rbac.go:36-38)
    and the fake gateway uses TS matchGlob (store.ts:9,28). Fix feasible: a `glob` key in
    validation.json; the Go struct needs updating because of DisallowUnknownFields at
    contract_test.go:278; the TS loop ignores extra keys.

Why it matters: A change to glob semantics on one side (anchoring, escaping, overlap) gets updated in one table only. The browser re-filter and the demo gateway then disagree with the real gateway's entitlement: the UI lists queues the relay 404s, or hides permitted ones. Move the table into testdata/contract/validation.json (a `glob` array of [pattern, value, expected], including the no-overlap rows) and read it from both rbac tests.

Change: Move the table into testdata/contract/validation.json (a `glob` array of [pattern, value, expected], including the no-overlap rows) and read it from both rbac tests.

#### CR-0073 [minor] [new] routes.test.ts completeness check keys on the first path segment, so new routes under an existing segment need no row

Location: tests/mock-broker/gateway/routes.test.ts:154-160
Confidence: verified
Evidence:

    Line 155: `productSources().flatMap(f =>
    Array.from(readSource(f).matchAll(/\/managed\/([a-z]+)/g), m => m[1]))` collects names such as
    `backup` and `users`, and :156 `covered = new Set(ROWS.map(r => r.segment))`. One `users` row
    satisfies every `/managed/users...` route. A new `POST /managed/backup/verify`, or a new method
    on `/managed/me` or `/managed/users/{name}`, used by a service passes the scan with no row
    calling it against the fake gateway.

Why it matters: The house rule is a row per route, and the scan is meant to enforce it. The test as written lets a new service call ship that provisioned-demo.html cannot answer (the fake 404s it) with the suite green. Key the scan on method plus path template: extract `{method, path}` from the service files' managedRequest calls, give each ROW a `route` key in the same form, and compare the sets.

Change: Key the scan on method plus path template: extract `{method, path}` from the service files' managedRequest calls, give each ROW a `route` key in the same form, and compare the sets.

#### CR-0074 [minor] [new] Two shipped code sets are outside any coverage measurement: the demo tree (Release bundles) and the gate scripts

Location: vitest.config.ts:34-44, scripts/check-bundles.mjs, scripts/module-registry-plugin.mjs, scripts/npm-audit-gate.mjs
Confidence: verified
Evidence:

    vitest.config.ts:34 `include: ['src/**/*.ts', 'src/**/*.js']`, and :44 excludes
    `'src/mock-broker/**'`. Judged per entry: `src/css/**` and `src/index.html` are fine (not TS/JS
    logic). `src/modules/queue-browser/constants.js` is fine (three numbers and SVG strings).
    `src/mock-broker/**` is about 4.7k lines running in the demo.html and provisioned-demo.html
    Release bundles, with no floor of its own: `mock` runs without --coverage. scripts/*.mjs are not
    in `include` at all, including check-bundles.mjs (246 lines, the bundle-content security gate),
    module-registry-plugin.mjs (166 lines, generates the production module registry) and
    npm-audit-gate.mjs (158 lines). They have unit tests in tests/build/, but nothing reports their
    uncovered branches.

    Second reading: none (no verifier covered this item); the orchestrator read
    vitest.config.ts:34-50 directly.

Why it matters: A refusal branch in check-bundles.mjs (the check that keeps Provisioned UI and gateway calls out of Direct bundles) or a fake-gateway error path can lose its test unnoticed while the 100% gate stays green. Add `scripts/check-bundles.mjs`, `scripts/module-registry-plugin.mjs`, `scripts/npm-audit-gate.mjs` and `scripts/e2e-lib.mjs` to coverage.include. For src/mock-broker, at least print its coverage in `mock` (or set a separate, lower threshold) so a drop is visible.

Change: A refusal branch in check-bundles.mjs (the check that keeps Provisioned UI and gateway calls out of Direct bundles) or a fake-gateway error path can lose its test unnoticed while the 100% gate stays green. Add `scripts/check-bundles.mjs`, `scripts/module-registry-plugin.mjs`, `scripts/npm-audit-gate.mjs` and `scripts/e2e-lib.mjs` to coverage.include. For src/mock-broker, at least print its coverage in `mock` (or set a separate, lower threshold) so a drop is visible.

#### CR-0094 [minor] [new] queue-browser hides untested SDK event wiring behind a v8 ignore the house rules ban

Location: src/modules/queue-browser/service.ts:61-68, tests/modules/queue-browser/service.test.ts:153-165, tests/setup.ts:162-167
Confidence: verified
Evidence:

    service.ts:62: `/* v8 ignore start -- callbacks registered but invoked by Solace SDK; each is
    exercised directly in tests/modules/queue-browser/service-events.test.ts under the onBrowserUp()
    / ... describe blocks */`. It wraps five one-line arrows (:63-67), e.g.
    `browser.on(solace.QueueBrowserEventName.DOWN_ERROR, (err: any) =>
    serviceEvents.onBrowserDown(queueName, err));`. docs/contributing.md:383-387 lists under 'Not
    valid categories': 'Registering SDK callbacks that are covered by dedicated tests -- wire the
    mock to invoke the handler directly; `.on.mock.calls` gives you the registered function.' The
    only wiring test, service.test.ts:153-165 > 'attaches event listeners to browser', asserts just
    `expect(browser.on).toHaveBeenCalledWith('UP', expect.any(Function))` five times. So swapping
    DOWN_ERROR and CONNECT_FAILED_ERROR, or passing the wrong queueName, would still pass every
    test. tests/setup.ts:162-167 createBrowserMock already stores `handlers[event] = handler`, yet
    no queue-browser test fires them: `_handlers` appears in tests/modules/queue-browser/ only for
    the session ACK at service.test.ts:53. The sibling module does this the other way.
    queue-copy/service-verify.ts:420-467 registers the same five QueueBrowserEventName handlers with
    no ignore, and service-verify.test.ts fires them via `(browser as any)._handlers.UP()`. The
    2026-05-26 IGNORE-1 change also lifted the same kind of ignore in service-copy.ts.

    Second reading (partly): Core claim holds: service.ts:62-68 ignores the five registrations;
    contributing.md:387 lists 'Registering SDK callbacks that are covered by dedicated tests' as not
    valid; setup.ts:162-168 exposes _handlers yet no queue-browser or integration test fires them
    (the only _handlers use is the session ACK at service.test.ts:53); service.test.ts:153-165
    checks only event-name registration with any(Function). The sibling does it properly
    (service-verify.ts:420-452 has no ignore; service-verify.test.ts:612+ fires _handlers.UP()).
    Severity lower than claimed: five trivial one-line arrows whose event names are pinned are a
    test-quality gap, not a likely normal-use bug.

Why it matters: Proposed fix: delete both ignore comment lines. Replace 'attaches event listeners to browser' with 'routes each QueueBrowser event to its serviceEvents handler with the queue name'. The new test calls each `(browser as any)._handlers[X]` and asserts onBrowserUp('test-queue'), onConnectFailed('test-queue', err), onBrowserDown('test-queue', err), onGmDisabled('test-queue') and onMessage('test-queue', msg); serviceEvents is already a set of vi.fn at service.test.ts:65-71. Alternate: keep the registration test and add the firing assertions next to it. The proposed fix is better: one test pins both the event name and the routing, and the any(Function) assertions add nothing once the handlers are fired. Coverage stays at 100%: the five arrows become covered instead of ignored.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-browser/service.ts
+++ b/src/modules/queue-browser/service.ts
@@ -61,8 +61,6 @@
             // Event Listeners
-            /* v8 ignore start -- callbacks registered but invoked by Solace SDK; each is exercised directly in `tests/modules/queue-browser/service-events.test.ts` under the onBrowserUp() / onConnectFailed() / onBrowserDown() / onGmDisabled() / onMessage() describe blocks */
             browser.on(solace.QueueBrowserEventName.UP, () => serviceEvents.onBrowserUp(queueName));
             browser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, (err: any) => serviceEvents.onConnectFailed(queueName, err));
             browser.on(solace.QueueBrowserEventName.DOWN_ERROR, (err: any) => serviceEvents.onBrowserDown(queueName, err));
             browser.on(solace.QueueBrowserEventName.GM_DISABLED, () => serviceEvents.onGmDisabled(queueName));
             browser.on(solace.QueueBrowserEventName.MESSAGE, (msg: any) => serviceEvents.onMessage(queueName, msg));
-            /* v8 ignore stop */
```

#### CR-0095 [minor] [new] solace-client ignores two SDK catches over test cost; the sibling catch is tested with the same mock

Location: src/core/services/solace-client.ts:102-117, src/core/services/solace-client.ts:264-280, src/core/services/solace-client.ts:245-252, tests/core/services/solace-client.test.ts:369-392
Confidence: verified
Evidence:

    :104-116: `try { session.disconnect(); /* v8 ignore start -- defensive catch around an SDK
    contract that does not throw in jsdom. Pre-refactor coverage analysis ... concluded driving this
    path is high-cost / low-signal ... */ } catch (e) { // Prior session may already be disposed --
    expected during reconnect. logger.warn(...) }`. :266-277: `session.dispose(); /* v8 ignore start
    -- ... driving this path requires order-of-operations coupling that makes the test brittle ...
    */ } catch (e) { // dispose() on a never-connected or already-disposed session is benign.`. Both
    justifications are about test cost, not untestability. The in-code comments call the throw
    'expected during reconnect', i.e. a real path. The identical catch in disconnect() at :247-252
    is not ignored and is covered by :369-392 > 'warns and does not propagate when
    session.disconnect() throws', using `sessionMock.disconnect.mockImplementationOnce(() => { throw
    new Error('already disposed'); });`. The same one-liner reaches the connect() catch on a second
    connect(). The SDK really does throw here: dist/solclient.js
    `disconnect(){this._operationCheck(a.DISCONNECT);...}`. docs/contributing.md:374: ignores are
    'only for code that is architecturally untestable in jsdom'. docs/test-report.md:918: 'Defensive
    SDK catch (session already disposed) ... Already tested via mock where tractable' -- and it is
    tractable.

    Second reading (partly): connect()'s ignore (solace-client.ts:106-116) can be tested cheaply:
    createSession returns a fresh mock every call (tests/setup.ts:94, :138), so the sibling test at
    :369-391 can be copied. The dispose half does not hold: SDK Session.dispose() never throws
    (`this._disposed||setTimeout(...)`), fitting 'Defensive catch on trusted contracts'
    (contributing.md:380). The cited `disconnect(){this._operationCheck(a.DISCONNECT)...}` is the
    Flow/MessageConsumer class; Session.disconnect throws via allowOperation only in NEW or DISPOSED
    states, which a non-null session in connect() can barely reach.

Why it matters: The connect() catch (solace-client.ts:106-116) is reachable and cheap to test (createSession returns a fresh mock each call, so the sibling test at :369-391 can be copied); its ignore cites test cost, not untestability. The dispose() catch (:268-277) does fit the sanctioned 'defensive catch on a trusted contract' (SDK Session.dispose never throws) and only needs its comment corrected.

Suggested patch (not applied):

```diff
--- a/src/core/services/solace-client.ts
+++ b/src/core/services/solace-client.ts
@@ -105,13 +105,7 @@
                 session.disconnect();
-                /* v8 ignore start -- defensive catch around an SDK contract that does not throw in jsdom.
-                 * Pre-refactor coverage analysis (see git history of src/modules/connections/service-client.ts)
-                 * concluded driving this path is high-cost / low-signal; that reasoning is unchanged after
-                 * the move to core/services/. The explicit disconnect() throw path is still covered by
-                 * tests/core/services/solace-client.test.ts > "warns and does not propagate when session.disconnect() throws".
-                 */
             } catch (e) {
                 // Prior session may already be disposed -- expected during reconnect.
                 logger.warn('[solace-client] disconnect() on stale session during reconnect:', e);
             }
-            /* v8 ignore stop */
         }
@@ -267,11 +261,6 @@
                 session.dispose();
-                /* v8 ignore start -- defensive catch around an SDK contract that does not throw in jsdom.
-                 * Same coverage analysis as the connect() catch above: driving this path requires
-                 * order-of-operations coupling that makes the test brittle for a one-line warn whose
-                 * downstream effect (session = null on the next line) happens regardless.
-                 */
             } catch (e) {
                 // dispose() on a never-connected or already-disposed session is benign.
                 logger.warn('[solace-client] dispose() during cleanup:', e);
             }
-            /* v8 ignore stop */
         }
```

#### CR-0096 [minor] [new] solace-publisher safeSet catch is ignored but reachable; the comment is stale and test-report says the ignore is gone

Location: src/core/services/solace-publisher.ts:110-129, src/core/services/solace-publisher.ts:154-156, tests/core/services/solace-publisher.test.ts:268-354, docs/test-report.md:886-907
Confidence: verified
Evidence:

    :119-127: `/* v8 ignore start -- defensive catch around SDK setter/getter calls. The test-suite
    mock's setters never throw; production SDK could fail on a malformed value ... Matches the
    historical policy in queue-copy/message-clone.ts and queue-browser/service.ts. */ } catch (e) {
    logger.warn(`Failed to set ${setter}`, e); }`. The catch is reachable from test-owned inputs.
    The clone tests already override getters on the original (:287-345, e.g.
    `(original.getXmlContent as any).mockReturnValue('<x/>')`) and receive the clone via
    `createMessage.mockReturnValueOnce(cloned)`, so making a getter or setter throw is one line.
    Production can also throw here: dist/solclient.js `setPriority(e){... throw new u("Invalid type
    for message priority", ...)` and setTimeToLive validate their argument the same way. The catch
    is what makes `safeSet(A)

    safeSet(B)

    safeSet(C)` (:154-156) fall through from SDT to XML to Binary when a write throws, so it decides
    which payload a copied or forwarded message carries. The cited precedents are stale:
    src/modules/queue-copy/ has no message-clone.ts, and queue-browser/service.ts no longer clones
    (it delegates to createSolacePublisher at :119-133). docs/test-report.md:886-888 > 'Category 6:
    safeSet Inner Function -- historical' says 'the v8 ignore around safeSet was lifted', yet the
    catch is still ignored. Golden rule 4a: 'a single malformed item is skipped, not
    batch-aborting'. contributing.md:389: 'Never use v8 ignore to skip testing real business logic.'

Why it matters: Proposed fix: remove the ignore. In tests/core/services/solace-publisher.test.ts > describe 'clone behavior', add 'a throwing content setter falls through to the next content source'. Setup: original.getSdtContainer returns {kind:'sdt'}, cloned.setSdtContainer throws, original.getXmlContent returns '<x/>'. Expect setXmlContent called with '<x/>' and the warn 'Failed to set setSdtContainer'. One test covers both the catch and the fallback chain. Also drop the stale precedent sentence and update test-report Category 6. Alternate: delete the try/catch, on the grounds that SDK getter output always passes SDK setter validation. The proposed fix is better: the setters do validate and throw, and the test pins user-visible payload behaviour, not a log line.

Suggested patch (not applied):

```diff
--- a/src/core/services/solace-publisher.ts
+++ b/src/core/services/solace-publisher.ts
@@ -118,10 +118,7 @@
             }
-        /* v8 ignore start -- defensive catch around SDK setter/getter calls.
-         * The test-suite mock's setters never throw; production SDK could fail
-         * on a malformed value but the contract is silent on which getter
-         * outputs trigger which setter rejections. Matches the historical
-         * policy in queue-copy/message-clone.ts and queue-browser/service.ts. */
+        // SDK setters validate and throw OperationError; skip the one property
+        // (and let the content chain fall through) rather than abort the clone.
         } catch (e) {
             logger.warn(`Failed to set ${setter}`, e);
         }
-        /* v8 ignore stop */
         return false;
```

#### CR-0098 [minor] [new] main.ts readyState branch is dead in every build, not just untestable in jsdom

Location: src/main.ts:21-28, src/index.html:279, CLAUDE.md:41, docs/contributing.md:378, docs/test-report.md:844-856, docs/test-report.md:917
Confidence: verified
Evidence:

    main.ts:22-26: `/* v8 ignore start -- jsdom readyState is always 'complete', can't test this
    branch */ if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded',
    boot); } else { /* v8 ignore stop */ boot(); }`. src/index.html:279 loads the entry as `<script
    type="module" src="/main.ts"></script>`, and the built dist/index.html carries `<script
    type="module" crossorigin>`. Module scripts without async are always deferred and run after
    parsing finishes, when readyState is 'interactive'. So `=== 'loading'` is false in every build
    and in the dev server, not just in jsdom. The 'can't test' claim is also wrong:
    tests/main.test.ts:4-5 already does `vi.resetModules()` and imports main dynamically, and
    `Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' })`
    shadows the prototype accessor. So the branch can be reached in a test, but only by faking a
    state production never has. CLAUDE.md:41 and contributing.md:378 cite this exact line as the
    canonical jsdom-limitation example. Brief and house rule: 'Don't validate scenarios that cannot
    happen'; 'if the only way to reach code is a state the system cannot produce, the fix is to
    delete the code'.

Why it matters: Proposed fix: delete the branch and call boot() directly. boot is a hoisted function declaration. No test changes: the three main.test.ts cases already cover boot(). Docs in the same change: replace the example in CLAUDE.md:41 and docs/contributing.md:378 (for example with a different jsdom gap, or drop the example), and update docs/test-report.md Category 3 (:844-856) and the Summary row at :917. Alternate: keep the branch, remove the ignore, and add a test that fakes readyState = 'loading' and dispatches DOMContentLoaded. The proposed fix is better: there is no producible state, so the alternate would be an impossible-state test kept only to justify dead code.

Suggested patch (not applied):

```diff
--- a/src/main.ts
+++ b/src/main.ts
@@ -20,9 +20,7 @@
 
-// Boot after DOM is ready
-/* v8 ignore start -- jsdom readyState is always 'complete', can't test this branch */
-if (document.readyState === 'loading') {
-    document.addEventListener('DOMContentLoaded', boot);
-} else {
-/* v8 ignore stop */
-    boot();
-}
+// main.ts is a module script (src/index.html), and module scripts are always
+// deferred: parsing has finished (readyState 'interactive') before this runs.
+boot();
```

#### CR-0099 [minor] [new] queue-picker post-loop supersession guards are reachable through its QueueSource input; the ignore comment is wrong

Location: src/core/components/queue-picker/index.ts:169-201, src/core/components/queue-picker/index.ts:214-244, src/core/services/queue-source.ts:26-36, src/modules/queue-subscription-explorer/module.ts:159-168
Confidence: verified
Evidence:

    picker :188-193: `/* v8 ignore start -- defensive race guard against state/gen changing between
    the last loop iteration's body and this check. The for-await mechanism runs synchronously
    between iterations, so this window does not exist in normal use. */ if (!state

    state.vpnFetchGen !== gen) return;`. :235-237 has the same guard for queues ('same rationale').
    The claim is inaccurate. Each next() is a promise hop, and a source that awaits after its final
    yield leaves a window open for Cancel (resolveAndClose sets `state = null`, :164) or Refresh
    (:455-462 bumps the gen through fetchVpns). queue-source.ts:26-36 defines the picker's input as
    `listVpns(): AsyncGenerator<FetchPage>; listQueues(vpn: string): AsyncGenerator<FetchPage>;`
    with no rule against that. Today's sources (semp-discovery.ts:43-68, queue-source.ts:139-143)
    happen to return synchronously after their last yield, which is why no test reaches it. Without
    the guard, `ensureCache(source).vpns = [...accumulated]` (:196) runs for a cancelled or stale
    fetch before the null deref at :199. The sibling contradicts it:
    queue-subscription-explorer/module.ts:159-166 justifies the identical post-loop check as
    'reachable from real SDK callbacks but not robustly reproducible in jsdom'. Category: none of
    the four sanctioned ones.

Why it matters: Proposed fix: keep both guards, remove both ignores, and fix the comment. Add two tests to tests/core/components/queue-picker/picker.test.ts using a hand-written QueueSource whose generator awaits a deferred after its final page. Test 1, 'a cancel during the source tail does not seed the VPN cache': cancel, release the tail, reopen, expect listVpns called twice. Test 2 is the queue analogue, triggered by the queue Refresh button. Alternate: delete the guards (using `state!`) and add to the QueueSource JSDoc that generators must not await after their final yield. The proposed fix is better: QueueSource is the reusable component's public input, so the state can be produced through its API. The guard is one line, while the alternate pushes an unenforced timing rule onto every future source. The picker's catch blocks are a different case (throwing breaks the {ok,error} contract) and keep their ignores. QSE module.ts:159-168 also keeps its ignore: its generator is module-internal and has no tail. Only its stale comment needs fixing (see the stale-justification finding).

Suggested patch (not applied):

```diff
--- a/src/core/components/queue-picker/index.ts
+++ b/src/core/components/queue-picker/index.ts
@@ -187,7 +187,6 @@
         }
-        /* v8 ignore start -- defensive race guard against state/gen changing
-         * between the last loop iteration's body and this check. The for-await
-         * mechanism runs synchronously between iterations, so this window does
-         * not exist in normal use. */
+        // A source may still await after its final page (QueueSource allows it);
+        // a Cancel or Refresh in that tail must not cache or paint a stale list.
         if (!state || state.vpnFetchGen !== gen) return;
-        /* v8 ignore stop */
         // Persist the just-fetched list to the module cache so the next
@@ -234,5 +233,4 @@
         }
-        /* v8 ignore start -- same rationale as fetchVpns post-loop guard. */
+        // Same source-tail race as the fetchVpns post-loop guard.
         if (!state || state.queueFetchGen !== gen) return;
-        /* v8 ignore stop */
         // Persist this VPN's queue list to the module cache.
```

#### CR-0100 [minor] [new] ui-modal rAF guard is dead, and its ignore also hides the covered renderProgress call

Location: src/modules/queue-copy/ui-modal.ts:355-372, tests/modules/queue-copy/ui-modal.test.ts:936-1030
Confidence: verified
Evidence:

    :356 `let latestJob: import('./state').CopyJob | null = null;`. The only assignment is :360
    `latestJob = job;`, which runs before the rAF is scheduled at :363, and latestJob is never reset
    to null. :365-371: `/* v8 ignore start -- latestJob is set on the preceding statement before the
    rAF is scheduled ... The null branch exists purely for TypeScript's nullable-narrowing and is
    unreachable at runtime. */ if (latestJob) ui.renderProgress(els, latestJob); /* v8 ignore stop
    */`. The ignore covers the whole statement, including the live call. ui-modal.test.ts:936-1028 >
    'onProgress is coalesced via requestAnimationFrame -- multiple ACKs schedule ONE paint' runs the
    captured rAF callback and asserts `expect(els.progressText.textContent).toBe('2 / 10')`. So
    tested business logic is hidden from coverage, and the actual problem is a dead guard. That is
    not a sanctioned category: 'null-guard only the genuinely optional'; 'Never use v8 ignore to
    skip testing real business logic'.

Why it matters: Proposed fix: declare `let latestJob!: import('./state').CopyJob;` (definite assignment), call `ui.renderProgress(els, latestJob);` unconditionally, and remove the ignore. Alternate: keep the nullable type and write `ui.renderProgress(els, latestJob!)`, following the IGNORE-6 precedent in solace-publisher.ts. The proposed fix is better: the impossible null is removed from the type at the declaration instead of asserted away at the read. No test changes: the existing rAF test covers the line.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-copy/ui-modal.ts
+++ b/src/modules/queue-copy/ui-modal.ts
@@ -355,3 +355,4 @@
     let pendingPaint = false;
-    let latestJob: import('./state').CopyJob | null = null;
+    // Assigned by every onProgress before it schedules the rAF that reads it.
+    let latestJob!: import('./state').CopyJob;
 
@@ -364,9 +365,3 @@
                 pendingPaint = false;
-                /* v8 ignore start -- `latestJob` is set on the preceding
-                 * statement before the rAF is scheduled, and the rAF callback
-                 * is the only reader. The null branch exists purely for
-                 * TypeScript's nullable-narrowing and is unreachable at
-                 * runtime. */
-                if (latestJob) ui.renderProgress(els, latestJob);
-                /* v8 ignore stop */
+                ui.renderProgress(els, latestJob);
             });
```

#### CR-0105 [minor] [new] tests/modules/queue-copy/ui-modal.test.ts: 6 weak tests -- destination-gate wiring never proves the run did not start; closed-modal tests assert a value they set

Location: tests/modules/queue-copy/ui-modal.test.ts:1293-1300, tests/modules/queue-copy/ui-modal.test.ts:248-267, tests/modules/queue-copy/ui-modal.test.ts:269-287, tests/modules/queue-copy/ui-modal.test.ts:1236-1248, tests/modules/queue-copy/ui-modal.test.ts:655-692, tests/modules/queue-copy/ui-modal.test.ts:223-246
Confidence: verified
Evidence:

    'is wired into Start -- a refused run renders the reason and never starts' (1293-1300) -> the
    only check is `expect(els.modalRunError.textContent).toMatch(/Topic destinations/)`, so 'never
    starts' is never asserted. Suppose the `return` after ui.renderRunError in handleModalStart
    (src/modules/queue-copy/ui-modal.ts:330-335) were dropped. In this test the run path would then
    throw inside the click listener (state.verify.result is null); DOM dispatch reports that error
    but never rethrows it, so the test still passes. With a completed verify, the run would publish
    to the refused destination. Fix: complete a verify first, then add
    `expect(state.job).toBeNull(); expect(els.sourceInput.disabled).toBe(false);
    expect(els.modalTitle.textContent).not.toBe('Copying...')`. | 'progress updates ignored after
    the modal is closed mid-flight' (248-267) -> `expect(state.verify).toBeNull()` checks a value
    the test set itself at line 261. Removing `if (!state.verify) return;` from onProgress
    (ui-modal.ts:146) still passes. Fix: `expect(els.modalSourceCount.textContent).toBe('--')` after
    the MESSAGE. | 'verify result ignored if modal was closed (state.verify=null)' (269-287) -> same
    self-set assertion. Fix: `expect(els.modalSourceStatus.textContent).toBe('Checking...');
    expect(els.btnModalStart.disabled).toBe(true)`. | 'lets an entitled source through to the probe'
    (1236-1242) and 'direct mode never refuses' (1244-1248) -> bare
    `expect(ctx.sempFetch).toHaveBeenCalled()`. Fix: assert the probe targets the requested queue,
    e.g. `expect(JSON.stringify((ctx.sempFetch as any).mock.calls[0])).toContain('ops.x')`. | 'owner
    override fires when prior accessType is null (SEMP could not determine it)' (655-692) -> its
    comment says it 'Covers the prior ?? null branch', but that branch no longer exists (ui-modal.ts
    logs ${prior}). The assertions still hold; drop the stale comment (nit). | 'live progress
    updates in the modal during accumulation' (223-246) -> `toContain('2')` on the live count;
    assert the exact rendered string (nit).

    Second reading (partly): 1293-1300 partly holds: 'never starts' is not asserted, but dropping
    the return at ui-modal.ts:334 throws at :341 (result is null) inside the click listener, and
    vitest's jsdom env re-emits window errors as uncaughtException, so the run fails rather than
    shipping green; the proposed fix is still sound. 248-267 holds (removing the guard at :146 only
    paints els; modalSourceCount '--' per ui.ts:617 is a feasible assertion). 269-287: self-set
    assertion, but removing the .then guard at :149 throws at state.verify.inProgress, an unhandled
    rejection that fails the run -- weak, not powerless. 1236-1248 refuted (both tests also assert
    state.verify.result is null at :1241, :1247). 655-692 stale-comment nit holds. 223-246 nit holds
    (exact toBe('2') at :244 exists).

    Second reading (partly), blocker bar: Not a blocker. The headline mutation (render the refusal,
    then fall through) fails the Vitest run through its unhandled-error trap. The gate is a
    browser-side UX check: the browser holds the VPN client password (provisioned-mode.md:46,49), so
    the real boundary is the broker ACL: 1293-1300 asserts only the error text, but a compensating
    control was missed: with 'ops.src' matching 'ops.*' (:55) the verify runs through QueueBrowser
    and is pending, so result is null at click; dropping the return at ui-modal.ts:334 makes :341
    throw a TypeError, and vitest 4.1.12's jsdom env re-emits window error events as
    uncaughtException (no dangerouslyIgnoreUnhandledErrors, no window error listener), failing the
    run. An explicit state.job assertion is still worth adding (fragile if setup changes). 269-287:
    removing :150 throws at :172 inside an uncaught .then (unhandled rejection fails the run),
    effectively covered. 248-267: confirmed weak (without :146 renderVerifyProgress repaints a
    closed modal untested; cosmetic since cancelCopyModal aborts first). 1236-1248 adequate.
    655-692: stale comment (:169 logs ${prior}), nit. 223-246 nit at most.

Why it matters: The destination entitlement gate is the last browser-side check before a provisioned run publishes. A handler that shows the refusal and then keeps going would publish to an unentitled queue with every test green. A closed modal being repainted by late progress or results also goes undetected.

Change: The destination entitlement gate is the last browser-side check before a provisioned run publishes. A closed modal being repainted by late progress or results also goes undetected.

#### CR-0106 [minor] [new] tests/modules/queue-browser/ui-table.test.ts: 8 weak tests -- three have no expect; ZIP tests check that calls happened, not their arguments

Location: tests/modules/queue-browser/ui-table.test.ts:186-193, tests/modules/queue-browser/ui-table.test.ts:453-467, tests/modules/queue-browser/ui-table.test.ts:566-582, tests/modules/queue-browser/ui-table.test.ts:386-409, tests/modules/queue-browser/ui-table.test.ts:434-451, tests/modules/queue-browser/ui-table.test.ts:163-172, tests/modules/queue-browser/ui-table.test.ts:584-598, tests/modules/queue-browser/ui-table.test.ts:44-52
Confidence: verified
Evidence:

    'clears details if selected message is removed' (186-193) -> no expect at all. Removing
    ui.clearDetails() from removeMessageRow (ui-table.ts:148-151) still passes. Fix:
    `expect(ui.getElements().detailId.textContent).toBe('')`. | 'returns early if no matching
    messages after filter' (453-467) -> no expect. Fix: `expect((window as
    any).JSZip).not.toHaveBeenCalled(); expect(globalThis.alert).not.toHaveBeenCalled()`. |
    'downloadMessagesZip with full type includes properties' (566-582) -> no expect. Delete --
    duplicate of tests/modules/queue-browser/ui-table.test.ts > 'creates full JSON ZIP for selected
    messages' (411-432); or assert the zipped JSON carries { key: 'val' }. | 'creates content ZIP
    for selected messages' (386-409) -> `expect(fileFn).toHaveBeenCalled()` passes even with a wrong
    name or payload. Fix: `expect(fileFn).toHaveBeenCalledWith('solace-message-1', 'Hello')`, and
    spy triggerDownloadBlob for `expect.stringMatching(/^solace-messages-content-/)`. | 'handles ZIP
    generation error' (434-451) -> bare `expect(consoleSpy).toHaveBeenCalled()`, but the
    user-visible effect is the alert. Fix: `expect(globalThis.alert).toHaveBeenCalledWith('Failed to
    generate ZIP file.')`. | 'appends a row and animates' (163-172) -> only
    `expect(row).toBeTruthy()`; 'animates' is never checked. Fix: `expect((row as
    HTMLElement).style.animation).toBe('highlight-fade 2s');
    expect(ui.getElements().countTotal.textContent).toBe('1')`. | 'forward button opens modal'
    (584-598) -> asserts forwardQueue length, not the modal, and overwrites ui.generateUuid without
    restoring it. Fix: `expect(ui.getElements().modalForward.open).toBe(true);
    expect(state.forwardQueue[0].id).toBe('1')`, and restore generateUuid. | 'returns checked
    message IDs' (44-52) -> `toContain('1')` tolerates extra IDs; use `toEqual(['1'])` (nit).

Why it matters: These regressions ship with the suite green: details not cleared when the selected row is removed, a ZIP failure with no alert, wrong ZIP entry names or payloads, a broken no-match early return, and the forward modal not opening.

Change: These regressions ship with the suite green: details not cleared when the selected row is removed, a ZIP failure with no alert, wrong ZIP entry names or payloads, a broken no-match early return, and the forward modal not opening.

#### CR-0107 [minor] [new] tests/modules/queue-browser/ui-details.test.ts: 10 weak or duplicate tests -- download and copy tests check calls only; 3 duplicate its

Location: tests/modules/queue-browser/ui-details.test.ts:44-65, tests/modules/queue-browser/ui-details.test.ts:70-85, tests/modules/queue-browser/ui-details.test.ts:187-191, tests/modules/queue-browser/ui-details.test.ts:315-346, tests/modules/queue-browser/ui-details.test.ts:348-352, tests/modules/queue-browser/ui-details.test.ts:640-676
Confidence: verified
Evidence:

    'creates blob and defers URL revocation' (44-52) and 'creates download link from blob and defers
    URL revocation' (56-65) -> bare createObjectURL/revokeObjectURL `toHaveBeenCalled()`.
    ui.triggerDownloadBlob only delegates to downloadBlob, which tests/core/download.test.ts >
    'clicks a temporary download link for the blob, removes it, and revokes the URL a moment later'
    already pins with arguments. Fix: delete the blob test; for triggerDownload, spy
    ui.triggerDownloadBlob and assert the filename and `blob.type === 'text/plain'`. | 'downloads
    message content' (70-74) -> bare createObjectURL. Delete -- superseded by 'sanitizes filename
    from message id' (87-97). | 'handles empty content' (81-85) -> with content '' the `msg.content

    ''` fallback cannot be told apart. Fix: pass a message with no content and assert
    `triggerSpy.mock.calls[0][1]).toBe('')` (catches an 'undefined' payload). | 'downloads full
    message as JSON' (187-191) -> bare createObjectURL. Fix: spy triggerDownload and
    `toHaveBeenCalledWith('solace-message-msg-1-full.json', expect.any(String),
    'application/json')`. | 'enables copy dest button and wires onclick' (315-329) and 'enables copy
    repl-msg-id button and wires onclick' (331-346) ->
    `expect(ctx.copyToClipboard).toHaveBeenCalled()` passes even if the wrong field is copied. Fix:
    `toHaveBeenCalledWith('dest', els.btnCopyDest)` / `toHaveBeenCalledWith('rmid',
    els.btnCopyReplMsgId)`. | 'non-Enter key on filter row does not trigger apply' (640-646) ->
    delete -- duplicate of 'non-Enter key does not trigger apply' (588-595). | 'shows TOPIC label
    when destType matches solace.DestinationType.TOPIC' (650-662) and 'shows Queue label when
    destType matches solace.DestinationType.QUEUE' (664-676) -> delete -- duplicates of 'highlights
    row and populates detail panel' (200-227) and 'handles Queue destination type' (246-258). |
    'does nothing if message not found' (348-352) -> asserts detailId '', which is the fresh state.
    Fix: select 'msg-1' first, then after selectMessage('nonexistent')
    `expect(els.detailId.textContent).toBe('msg-1')`.

    Second reading (partly): Hold: 44-52 and 56-65 (redundant with tests/core/download.test.ts
    'clicks a temporary download link...'); 70-74, 81-85 (content '' cannot exercise the

    '' at ui-details.ts:28); 315-346 (swapping detailDest and detailReplMsgId at :127/:129 passes);
    640-646 duplicates 588-595, 650-662 duplicates 200-227, 664-676 duplicates 246-258. 187-191:
    weak, but the 'why' is wrong on filename/MIME (ui-table.test.ts 'download full button triggers
    download' already asserts /-full\.json$/ and 'application/json'), so delete rather than
    strengthen. 348-352 partly: removing the if (msg) guard (:77) throws on a direct call, so the
    test has guard power; the select-first variant only adds a wrongly-clearing-details check.

Why it matters: Copying the wrong field to the clipboard, a wrong full-download filename or MIME type, and an 'undefined' payload in empty downloads would all pass.

Change: Copying the wrong field to the clipboard, a wrong full-download filename or MIME type, and an 'undefined' payload in empty downloads would all pass.

#### CR-0108 [minor] [new] tests/modules/queue-browser/ui-events.test.ts: 12 weak or duplicate tests -- one no-expect, half-asserted titles, 5 duplicates, numeral substring alerts

Location: tests/modules/queue-browser/ui-events.test.ts:427-437, tests/modules/queue-browser/ui-events.test.ts:504-515, tests/modules/queue-browser/ui-events.test.ts:360-375, tests/modules/queue-browser/ui-events.test.ts:755-765, tests/modules/queue-browser/ui-events.test.ts:1027-1034, tests/modules/queue-browser/ui-events.test.ts:1001-1006, tests/modules/queue-browser/ui-events.test.ts:1038-1045, tests/modules/queue-browser/ui-events.test.ts:1115-1126, tests/modules/queue-browser/ui-events.test.ts:870-880, tests/modules/queue-browser/ui-events.test.ts:922-938, tests/modules/queue-browser/ui-events.test.ts:1049-1067, tests/modules/queue-browser/ui-events.test.ts:1130-1140, tests/modules/queue-browser/ui-events.test.ts:669-674, tests/modules/queue-browser/ui-events.test.ts:138-152
Confidence: verified
Evidence:

    'clears previous errors before checking' (427-437) -> no expect; the comment describes the
    assertion instead of making it. Fix: `expect(els.elBindError.style.display).toBe('none');
    expect(els.inputBind.classList.contains('is-invalid')).toBe(false)`. | 'unbinds selected queue
    and selects next' (504-515) -> 'selects next' is not asserted. Fix:
    `expect(els.selectBound.value).toBe('q2')` and check the q1 option is gone. | 'opens forward
    modal with selected messages' (360-375) -> asserts forwardQueue length only, and overwrites
    ui.generateUuid without restoring it. Fix: `expect(els.modalForward.open).toBe(true)`. |
    'applies message type filter' (755-765) -> checks only activeFilters.msgType. Fix:
    `expect(state.displayedMessages.map(m => m.id)).toEqual(['1'])`. Its edge-case namesake
    (1027-1034) holds a single matching message, so it passes with the filter ignored; add a
    non-matching message. | 'applies filters with no active criteria (removes filter-active class)'
    (1001-1006) -> delete -- duplicate of 'removes filter-active class when no filters' (746-753). |
    'does nothing when delete count > 0 (shows success)' (1038-1045; the title contradicts the body)
    and 'shows success alert when deletion count > 0' (1115-1126; handleDelete not awaited) ->
    delete -- duplicates of 'confirms and deletes message' (870-880). That test's
    `toHaveBeenCalledWith(expect.stringContaining('1'))` matches any text containing '1'; use
    `toHaveBeenCalledWith('Successfully deleted 1 message(s).')`. Likewise 'confirms and deletes
    selected messages' (922-938): use `'Successfully deleted 2 message(s).'`. | 'handles
    whitespace-only input' (1049-1053) -> asserts error display 'none', which is the initial state.
    Fix: `expect(service.createBrowser).not.toHaveBeenCalled()`. | 'resets to placeholder when last
    queue unbound' (1057-1067) -> delete -- duplicate of 'resets queue selection when last queue
    unbound' (517-526). | 'initializes empty allMessages when queue not in messageStore' (1130-1140)
    -> duplicate of 'initializes empty allMessages when no messageStore entry and not mocks'
    (600-604). Both pass trivially because the reset already leaves []; keep one and seed
    `state.allMessages = [{ id: 'stale' }]` first. | 'calls clearPropertyFilters' (669-674) -> swaps
    in a spy and checks only that it was called. Fix: assert the effect: add a property row, call
    clearFilters, `expect(els.filterPropsRows.children.length).toBe(0)`. | 'skips already successful
    messages' (138-152) -> calledTimes(1) only. Fix: add `toHaveBeenCalledWith(expect.anything(),
    'dest', expect.anything(), 'cv-2')`.

    Second reading (partly): Hold: 427-437 (no expect), 504-515, 360-375, 1027-1034, 1001-1006
    (never pre-adds the class), 1038-1045 and 1115-1126 (duplicates; handleDelete is synchronous so
    the missing await is harmless), 870-880 and 922-938 (substring nit), 1057-1067 and 517-526,
    1130-1140 with 600-604. Do not hold: 1049-1053 (the template has no inline display,
    index.html:28, so 'none' is written by showBindError(null) at ui-core.js:128); 669-674 (dropping
    the call at ui-events.ts:244 fails it; initDetails resets the spy); 755-765 (pins the
    input-to-activeFilters wiring; the msgType match is pinned at state.test.ts:154-160). 138-152
    weak, but 'Resend click retries only FAILED items' (328-356) already asserts cv-2 by argument;
    delete it.

Why it matters: Unbind not selecting the next queue, the forward modal not opening, a message-type filter that is ignored, a wrong delete count in the success alert, and stale bind errors all go undetected; five duplicates inflate the count.

Change: Unbind not selecting the next queue, the forward modal not opening, a message-type filter that is ignored, a wrong delete count in the success alert, and stale bind errors all go undetected; five duplicates inflate the count.

#### CR-0109 [minor] [new] tests/modules/queue-browser/ui-core.test.ts: 6 ceremonial tests -- formatBytes/generateUuid re-test core aliases; cache test checks truthiness only

Location: tests/modules/queue-browser/ui-core.test.ts:36-46, tests/modules/queue-browser/ui-core.test.ts:79-109, tests/modules/queue-browser/ui-core.test.ts:210-214, tests/modules/queue-browser/ui-core.test.ts:154-170
Confidence: verified
Evidence:

    'caches all elements' (36-46) -> seven `toBeTruthy()`; swapping two cache keys (inputBind <->
    btnBind) still passes. Fix: identity, e.g.
    `expect(cached.inputBind).toBe(container.querySelector('#browser-bind-input'))`. | describe
    'formatBytes()' its 'formats bytes correctly' / 'handles NaN' / 'respects decimal places'
    (79-96), 'handles TB range' (210-214), and describe 'generateUuid()' (98-109) -> ui.formatBytes
    and ui.generateUuid are plain aliases of the core functions (ui-core.js:19-21). Delete --
    duplicates of tests/core/utils.test.ts > 'formatBytes()' / 'generateUuid()'; at most keep
    `expect(ui.formatBytes).toBe(formatBytes)`. | 'clears queue state and filters' (154-170) ->
    replaces ui.renderList/ui.clearDetails with vi.fn(), never asserts they ran and never restores
    them. Fix: `expect(ui.renderList).toHaveBeenCalledTimes(1);
    expect(ui.clearDetails).toHaveBeenCalledTimes(1)`, then restore.

Why it matters: Five tests add count without any power; resetQueueSelection could stop re-rendering the list or clearing details with the suite green.

Change: Five tests add count without any power; resetQueueSelection could stop re-rendering the list or clearing details with the suite green.

#### CR-0110 [minor] [new] tests/modules/queue-browser/module.test.ts: 7 weak tests -- 5 wiring tests with no expect, relying on a throw that click()/emit never surface

Location: tests/modules/queue-browser/module.test.ts:82-93, tests/modules/queue-browser/module.test.ts:320-333, tests/modules/queue-browser/module.test.ts:364-380, tests/modules/queue-browser/module.test.ts:677-688, tests/modules/queue-browser/module.test.ts:548-558, tests/modules/queue-browser/module.test.ts:49-58, tests/modules/queue-browser/module.test.ts:197
Confidence: verified
Evidence:

    'bind button click triggers bind' (82-93) -> no expect; it relies on 'the handler should not
    throw', but DOM dispatch never rethrows listener errors. Fix:
    `expect(els.elBindError.textContent).toBe('No active Solace session.')`. | 'unbind button click
    triggers unbind' (320-333) -> no expect. Fix:
    `expect(els.selectBound.querySelector('option[value=q1]')).toBeNull();
    expect(els.selectBound.selectedIndex).toBe(0)`. | 'filter apply button triggers applyFilters'
    (364-371) and 'filter clear button triggers clearFilters' (373-380) -> no expect. Fix: set
    `els.inputFilterId.value = 'm1'` and assert `state.activeFilters.msgId` becomes 'm1' or ''
    respectively. | 'browser:browse-queue handles missing loadSelf' (677-688) -> no expect, and the
    bus catches handler errors (src/core/event-bus.ts deliver). Fix:
    `expect(els.inputBind.value).toBe('my-queue')`. | 'listens for app:message-delete events'
    (548-558) -> `expect(globalThis.confirm).toHaveBeenCalled()`. Fix: `toHaveBeenCalledWith('Are
    you sure you want to delete message msg-1?')`. | 'initializes module and caches DOM elements'
    (49-58) -> toBeTruthy on two cached elements; delete -- duplicate of
    tests/modules/queue-browser/ui-core.test.ts > 'caches all elements'. | comment at 197 'Closes
    COV-10' -> name the behaviour instead of the plan item (nit).

    Second reading (partly): Hold: 320-333, 364-371, 373-380 have no expect and the
    module.ts:124/145/146 wiring is unasserted anywhere; 677-688 (the bus swallows the error,
    event-bus.ts:31-34; the inputBind assertion is feasible since loadSelf runs before the timer,
    module.ts:243-247); 548-558 (confirm text at ui-events.ts:324); 197 nit (the comment's
    'module.ts:89' reference is also stale). Partly: 82-93 has no expect, but bind wiring
    (module.ts:116) is covered by tests/integration/module-events.test.ts
    'connection:check-connection on same VPN emits browser:browse-queue -> bind fires', so
    'unhooking bind ships green' is refuted; the rethrow claim is inaccurate (vitest's jsdom env
    fails the run on listener exceptions). 49-58 is not a pure duplicate (proves install calls
    initElements with ctx.container, :54); low value.

Why it matters: Unhooking the bind, unbind, filter apply/clear listeners or the browse-queue bind in module.ts would leave these tests green.

Change: Unhooking the bind, unbind, filter apply/clear listeners or the browse-queue bind in module.ts would leave these tests green.

#### CR-0111 [minor] [new] tests/modules/queue-browser/service-events.test.ts: 3 weak tests -- one no-expect, two check only that a warning was logged

Location: tests/modules/queue-browser/service-events.test.ts:671-682, tests/modules/queue-browser/service-events.test.ts:415-441
Confidence: verified
Evidence:

    'adds to displayed when filter matches' (671-682) -> no expect. Fix:
    `expect(state.displayedMessages).toHaveLength(1)` and check a row rendered. | 'handles message
    type detection errors' (415-427) -> bare `expect(consoleSpy).toHaveBeenCalled()`; the meaningful
    effect is the fallback type. Fix:
    `expect(state.messageStore.get('q1')![0].type).toBe('Message')`. | 'handles timestamp extraction
    error' (429-441) -> same. Fix: `expect(state.messageStore.get('q1')![0].date).toBe('N/A');
    expect(state.messageStore.get('q1')![0].dateMs).toBeNull()`.

Why it matters: A message that throws in getType/getSenderTimestamp could be dropped or stored with garbage while the warning still logs; filter-matched messages could stop reaching displayedMessages.

Change: A message that throws in getType/getSenderTimestamp could be dropped or stored with garbage while the warning still logs; filter-matched messages could stop reaching displayedMessages.

#### CR-0112 [minor] [new] tests/modules/queue-browser/no-payload.test.ts: 6 weak tests -- bare or default-state assertions on stateful flag-off handlers

Location: tests/modules/queue-browser/no-payload.test.ts:176-197, tests/modules/queue-browser/no-payload.test.ts:160-163, tests/modules/queue-browser/no-payload.test.ts:119-133, tests/modules/queue-browser/no-payload.test.ts:201-214
Confidence: verified
Evidence:

    House rule (docs/contributing.md Defensive-Guard Tests): 'pair .not.toThrow() with a state or
    DOM snapshot assertion'. 'handleDropdownChange does not throw with the body input removed'
    (188-191) and 'does not throw with the body input removed' (195-197) -> bare `.not.toThrow()`.
    The throw does catch removal of the showPayload() guard, but an early return in flag-off mode
    would pass. Fix: seed state.currentQueue = 'q1' and `els.inputFilterId.value = 'x'`, then assert
    they are reset. | 'applyFilters leaves the body-content filter at its default and does not
    throw' (176-180) and 'clearFilters does not throw with the body input removed' (182-186) ->
    `activeFilters.content === ''` is the default either way. Fix: set `els.inputFilterId.value =
    'm1'` and assert `state.activeFilters.msgId` is 'm1' (apply) or '' (clear, after seeding),
    proving the handler ran past the removed input. | 'clearDetails clears metadata without touching
    the removed payload nodes' (160-163) -> detailId '' is the fresh state. Fix: call selectMessage
    first. | 'renderList wires Forward (no download buttons) and updateCounts does not throw'
    (119-133) -> the effect of updateCounts is unasserted. Fix:
    `expect(els.countTotal.textContent).toBe('1')`. | 'renders the message id with an empty body
    preview' (201-214) -> only `toContain('m1')`; the 'empty preview' is unchecked. Fix:
    `expect(listHtml).not.toContain('undefined')` plus the preview element's text being ''.

    Second reading (partly): House-rule quote accurate (contributing.md:281-285). 188-191 and
    195-197 are bare .not.toThrow(), breaking the rule as written, though they catch the realistic
    regression (a dropped showPayload guard reaching a null element). 176-186: content '' is the
    default, so the msgId fix is feasible. 160-163: guard removal throws on a null detailContent, so
    it has power; selecting first is a good addition. 119-133: dropping the updateCounts guard
    (ui-table.ts:167) throws, so it has power. 201-214 holds as weak but the proposed fix is
    ineffective: with the guard removed (content

    '') still renders '' (ui-forward.js:109) and no 'undefined' appears; seed originalMsg.content
    and assert it is not rendered instead.

Why it matters: In the no-payload flavour, a handler that silently skips its remaining work, or a forward list that renders 'undefined' as the preview, passes.

Change: In the no-payload flavour, a handler that silently skips its remaining work, or a forward list that renders 'undefined' as the preview, passes.

#### CR-0113 [minor] [new] tests/core/kernel.test.ts: 8 weak tests -- 2 with no expect, install-failure path checks only the log, 1 duplicate

Location: tests/core/kernel.test.ts:912-934, tests/core/kernel.test.ts:315-332, tests/core/kernel.test.ts:243-254, tests/core/kernel.test.ts:233-241, tests/core/kernel.test.ts:285-297, tests/core/kernel.test.ts:1048-1062, tests/core/kernel.test.ts:66
Confidence: verified
Evidence:

    'starts with no sidebar toggle' (912-923) -> no expect. Fix:
    `expect(mod.install).toHaveBeenCalledTimes(1);
    expect(document.getElementById('module-view-test-module')!.classList.contains('hidden')).toBe(false)`.
    | 'starts with no module container' (925-934) -> no expect. Delete -- duplicate of 'navigates
    when moduleContainer is missing' (872-889). | 'idempotency prevents window listener accumulation
    across start() calls' (315-332) -> the test admits it cannot observe the listener and re-asserts
    install calledTimes(1). That is a duplicate of 'is idempotent -- second start() is a no-op that
    logs a warning' (299-313). Fix: capture ctx, subscribe to 'jszip:loaded', call start() twice
    more, dispatch the window event, `expect(handler).toHaveBeenCalledTimes(1)`; or delete. |
    'handles module install failure gracefully' (243-254) -> only
    `expect(consoleSpy).toHaveBeenCalledWith(...'Failed to install'...)`. Moving `loadedModules.set`
    ahead of `await mod.install` (kernel.ts:182-188) would pass. Fix: register a second module and
    assert page-title is that module and the nav lacks 'failing'. | 'handles missing template
    gracefully' (233-241) -> log only. Fix: add `expect(mod.install).not.toHaveBeenCalled()`. |
    'logs an error and navigates nowhere when every module fails to install' (285-297) -> 'navigates
    nowhere' is unasserted. Fix:
    `expect(document.getElementById('page-title')!.textContent).toBe('')`. | 'does not navigate when
    no module is visible after the session changes' (1048-1062) -> asserts the sidebar only. Fix:
    `expect(document.getElementById('page-title')!.textContent).toBe('Users')`. | title at 66
    '(closes COV-6)' -> drop the plan-item reference (nit).

    Second reading (partly): HOLDS: 243-254 is the only test with an install() that throws; moving
    loadedModules.set ahead of the await (kernel.ts:182-184) still passes and the proposed fix
    catches it. 315-332 asserts exactly what 299-313 asserts. 925-934 has the same DOM as 872-889
    but asserts less. 912-923 has no expect (removing the guard would reject start() at
    kernel.ts:95-96 and fail, but it is the bare 'no crash' shape contributing.md:283 rejects).
    Title 66 is a nit. DOES NOT HOLD: 233-241 (dropping the early return makes tpl.content throw
    outside the try, kernel.ts:151-163; 262-282 covers the fall-through); 285-297 (the log is
    reachable only in the else-if, kernel.ts:134-138); 1048-1062 (the proposed page-title check
    cannot fail with one module; the real gap, dropping `if (firstVisible)` at kernel.ts:280, throws
    a TypeError the bus swallows, event-bus.ts:31-35; only a console.error spy would catch it).

Why it matters: A module whose install() throws could be marked loaded and navigated to; shell-less boots could silently install nothing.

Change: A module whose install() throws could be marked loaded and navigated to; shell-less boots could silently install nothing.

#### CR-0114 [minor] [new] tests/core/event-bus.test.ts: 4 ceremonial tests -- type-guarantee check and 3 duplicates

Location: tests/core/event-bus.test.ts:5-10, tests/core/event-bus.test.ts:93-101, tests/core/event-bus.test.ts:103-118
Confidence: verified
Evidence:

    'creates an event bus with on, off, emit methods' (5-10) -> `expect(bus.on).toBeDefined()` x3
    restates the TypeScript type, and every other test calls them. Delete. | 'cleans up empty
    listener Set on off()' (93-101) -> body identical to 'does not call handler after off()'
    (39-46); the Set cleanup (event-bus.ts:51) is not observable this way. Delete, or after off()
    re-subscribe and `expect(handler).toHaveBeenCalledTimes(1)` on emit. | 'handles void events with
    no args' (103-109) -> delete -- duplicate of 'calls handler when event is emitted' (12-18). |
    'handles events with complex payloads' (111-118) -> delete -- duplicate of 'passes payload to
    handler' (20-26).

Why it matters: None of the four can fail for a bug the other tests miss; they only inflate the count.

Change: None of the four can fail for a bug the other tests miss; they only inflate the count.

#### CR-0115 [minor] [new] tests/core/utils.test.ts: 2 weak tests -- the regex-escaping test passes with escaping removed

Location: tests/core/utils.test.ts:58-61, tests/core/utils.test.ts:446-450
Confidence: verified
Evidence:

    'escapes regex special characters' (58-61) -> `matchString('test.value', 'test.*')` also matches
    with an unescaped '.', and 'test*' contains no special character, so deleting escapeRegex
    (utils.ts:48) passes. Fix: `expect(matchString('testXvalue', 'test.*')).toBe(false);
    expect(matchString('test[1]x', 'test[1]*')).toBe(true); expect(matchString('test1x',
    'test[1]*')).toBe(false)`. | 'never stringifies the object, so [object Object] cannot reach a
    user' (446-450) -> `.not.toContain('object')`; use `.toBe('fallback')` (nit).

Why it matters: Message filters with dots or brackets could silently turn into regex wildcards and match the wrong messages.

Change: Message filters with dots or brackets could silently turn into regex wildcards and match the wrong messages.

#### CR-0117 [minor] [new] tests/main.test.ts: 2 weak tests -- the deferred boot is not shown to wait for script load; limited mode not shown to start the kernel

Location: tests/main.test.ts:49-73, tests/main.test.ts:36-47
Confidence: verified
Evidence:

    'boots when solclient script loads after main.ts imports' (47-71 in file; it starts at line 47)
    -> asserts '[Kernel]' info after the load event, but never that the kernel had NOT started
    before it. A main.ts that ignores the script and boots at once passes. Fix: after `await
    import('../src/main')` and before dispatching load,
    `expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('[Kernel]'))`. | 'boots in
    limited mode when no solclient script found' (34-45) -> asserts the warning only; dropping
    kernel.start() in that branch (main.ts:41-42) passes. Fix: also spy console.info and expect a
    '[Kernel]' line.

Why it matters: The app could boot before the SDK loads (racing window.solace), or never boot in limited mode, with the suite green.

Change: The app could boot before the SDK loads (racing window.solace), or never boot in limited mode, with the suite green.

#### CR-0118 [minor] [new] tests/variants.test.ts: 1 weak test -- _active is not pinned to the standard variant

Location: tests/variants.test.ts:161-163
Confidence: verified
Evidence:

    '_active re-exports a populated manifest' (161-163) ->
    `expect(Object.keys(ACTIVE_VARIANT).length).toBeGreaterThan(0)` passes for any manifest,
    although CLAUDE.md requires src/variants/_active.ts to keep re-exporting ./standard. Fix:
    `expect(ACTIVE_VARIANT).toBe(STANDARD_VARIANT)` (same module binding). Also 'standard variant
    lists the four shipped modules at non-overlapping priorities' (32-43) uses arrayContaining; an
    exact sorted toEqual like its siblings would be stricter (nit).

    Second reading (partly): variants.test.ts:161-163 does only length > 0;
    expect(ACTIVE_VARIANT).toBe(STANDARD_VARIANT) works (export * re-exports the same binding,
    _active.ts:13). The 'why' example is wrong: under vitest the registry plugin reads 'standard'
    regardless of _active (module-registry-plugin.mjs:74), so pointing _active at admin or
    all-for-testing-only makes registry.ts:34-41 throw when tests/registry.test.ts imports it and
    the suite goes red. What slips through is a subset variant (min, no-queue-copy): no throw, every
    test passes, and index.html/demo.html/no-payload.html (built without --variant, package.json:8;
    vite.config.ts:91 skips the redirect) would ship missing modules; check-bundles only checks
    Provisioned/network rules. The arrayContaining nit at :32-43 holds.

Why it matters: _active left pointing at all-for-testing-only or admin would change what the default build and dev server load, with this test green.

Change: _active left pointing at all-for-testing-only or admin would change what the default build and dev server load, with this test green.

#### CR-0120 [minor] [new] tests/modules/queue-copy/ui.test.ts: 4 weak tests -- toBeDefined on required() elements and loose byte/count matches

Location: tests/modules/queue-copy/ui.test.ts:55-74, tests/modules/queue-copy/ui.test.ts:424-429, tests/modules/queue-copy/ui.test.ts:449-460, tests/modules/queue-copy/ui.test.ts:489-494
Confidence: verified
Evidence:

    'caches every required element including the source-side mirror' (55-74) -> 12 `toBeDefined()`
    on elements cacheElements fetches with required(), which throws if any is missing. Delete those
    lines and keep the tagName/disabled/length checks. | 'shows live count + size with loading hint'
    (424-429) -> `toContain('7')`, and the 1024-byte size is never checked. Fix: exact strings for
    modalSourceCount and modalSourceUsage (containing formatBytes(1024)). | 'SEMP success with all
    fields renders count, "{used} / {quota}" usage, max size' (449-460) -> usage `toContain('/')`,
    max size `toMatch(/MB|KB|B/)`; swapping used and quota passes. Fix: `toBe(formatBytes(2937) + '
    / ' + formatBytes(5000*1024*1024))` and `toBe(formatBytes(10_000_000))`. | 'spool present, quota
    null: usage shows just used bytes' (489-494) -> `/B|KB|MB/`. Fix: `toBe('500 B')`.

Why it matters: Wrong usage/quota rendering in the copy confirmation, which users rely on to judge capacity, would pass.

Change: Wrong usage/quota rendering in the copy confirmation, which users rely on to judge capacity, would pass.

#### CR-0122 [minor] [new] tests/modules/queue-copy/ui-events.test.ts: 2 weak tests -- the dest picker's queue source is never checked

Location: tests/modules/queue-copy/ui-events.test.ts:304-326
Confidence: verified
Evidence:

    'dest pick uses destSempCtx when cross-broker' (313-326) -> bare
    `expect(pickQueue).toHaveBeenCalled()`; picking from the primary broker instead passes. Fix:
    `expect((pickQueue as any).mock.calls.at(-1)[0].key).toBe('http://d')` (as
    tests/modules/queue-copy/dest-provisioned.test.ts > 'picks unfiltered when the destination uses
    typed credentials' does). | 'dest pick uses primary SEMP when sameBroker' (304-311) -> asserts
    the picked name, not that the source was the primary. Fix: assert the source key equals the
    primary baseUrl.

    Second reading (partly): 313-326 holds: a bare pickQueue toHaveBeenCalled still passes if
    destQueueSource (ui-events.ts:398-415) returned the primary source on cross-broker; the fix is
    valid (accessKey('unmanaged') is '' per queue-source.ts:80, so the key is exactly 'http://d');
    that bug is still caught by dest-provisioned.test.ts 'picks unfiltered when the destination uses
    typed credentials' (400-410), so the 'why' is overstated. 304-311 does not hold: destSempCtx is
    null in that test, so routing sameBroker to the dest branch returns null, pickQueue is never
    called and the test fails; it already distinguishes the branch.

Why it matters: Cross-broker copy could list queues from the wrong broker, so the user picks a destination that does not exist where the copy publishes.

Change: Cross-broker copy could list queues from the wrong broker, so the user picks a destination that does not exist where the copy publishes.

#### CR-0124 [minor] [new] tests/modules/connections/module.test.ts: 8 weak tests -- 2 no-expect, 2 vacuous bus no-throw checks, call-only connect/save checks

Location: tests/modules/connections/module.test.ts:926-941, tests/modules/connections/module.test.ts:776-784, tests/modules/connections/module.test.ts:1691-1703, tests/modules/connections/module.test.ts:1030-1049, tests/modules/connections/module.test.ts:571-585, tests/modules/connections/module.test.ts:109-128, tests/modules/connections/module.test.ts:691-697, tests/modules/connections/module.test.ts:256-271, tests/modules/connections/module.test.ts:153
Confidence: verified
Evidence:

    'connection:check-connection auto-connect registers failure cleanup' (926-941) -> no expect; the
    final comment states the invariant without asserting it. Fix:
    `expect(browseHandler).not.toHaveBeenCalled()`, as its twin 'connection:check-connection VPN
    switch failure cleans up (reconnect fails after teardown)' (972-992) does. | 'enter key on semp
    inputs triggers connect' (776-784) -> no expect. Fix: `await vi.waitFor(() =>
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/SEMP/v2/monitor/msgVpns'),
    expect.anything()))`. | 'connection:check-connection with null loadSelf does not throw'
    (1691-1703) -> `.not.toThrow()` wraps eventBus.emit, which catches and logs every handler error
    (src/core/event-bus.ts deliver), so it can never fail. Fix: spy console.error, assert it was not
    called with '[EventBus] Error in handler', and `expect(#solace-vpn.value).toBe('target-vpn')`. |
    'connection:edit-requested with loadSelf undefined is a no-op AND leaves the bus functional for
    downstream emits' (1030-1049) -> the probe always fires because the bus isolates each handler
    throw. Fix: the same console.error assertion. | 'solace connect button validates and connects'
    (571-585) -> bare createSession `toHaveBeenCalled()`. Fix: assert the SessionProperties built
    from the form (url host:port, vpnName 'default', userName 'admin'). | 'save button persists
    config and shows success toast' (118-128) -> `expect(localStorage.setItem).toHaveBeenCalled()`.
    Fix: `toHaveBeenCalledWith(<storage key>, expect.stringMatching(/^OBF1:/))`. | 'handles
    connection:check-connection when not connected' (691-697) -> loadSelf only. Fix: also assert
    #solace-vpn is 'target-vpn' (as module.managed.test.ts does). | 'blocks save and shows inline
    error when value exceeds 10000' (256-271) -> `toMatch(/10000/)`; use the exact message (nit). |
    comment at 153 'Closes COV-5' -> name the behaviour (nit).

    Second reading (partly): Holding: 926-941 (no expect); 1691-1703 and 1030-1049 (deliver catches
    handler throws, event-bus.ts:30-35, breaking the Defensive-Guard rule); 571-585 (only clientName
    is pinned, at 1593); 153 'Closes COV-5' (nit). 776-784 holds but the fix fails as written: SEMP
    fields are empty so validateSemp (module.ts:461-467) returns before any fetch; populate them
    first (pattern at 636-638) or assert #conn-host is-invalid. Save test ('save button saves config
    to localStorage and shows a toast', 109-128): weak; the OBF1 fix repeats config.test.ts:10-16;
    round-trip host/vpn/user via config.load() as at 232-236. 691-697 weak, but filling the VPN is
    pinned through the shared installDirect.checkConnection by module.managed.test.ts:148-159.
    256-271: /10000/ already singles out that branch (module.ts:276-282); nit.

Why it matters: A stale auto-connect onSuccess firing a browse on a later manual connect, the SEMP Enter shortcut breaking, and form fields mapped to the wrong session properties all pass.

Change: A stale auto-connect onSuccess firing a browse on a later manual connect, the SEMP Enter shortcut breaking, and form fields mapped to the wrong session properties all pass.

#### CR-0125 [minor] [new] tests/modules/connections/managed-panel.test.ts: 3 weak tests -- entitlement-wrap tests run under operate '*', so name resolution is never tested

Location: tests/modules/connections/managed-panel.test.ts:654-665, tests/modules/connections/managed-panel.test.ts:634-640
Confidence: verified
Evidence:

    'reads the queue name via getName() when .name is absent' (654-659) -> under PROFILE operate '*'
    every name, including '', is allowed, so the test cannot see whether getName() is consulted; the
    comment admits 'just assert no throw'. Fix: a restrictive profile (readOnly queues 'q-getname'),
    then `{ getName: () => 'q-getname' }` returns the browser and `{ getName: () => 'other' }`
    throws /not entitled/. | 'tolerates an empty/unknown queue descriptor (queue name "")' (661-665)
    -> bare `.not.toThrow()`. Fix: `expect(session.createQueueBrowser({ queueDescriptor: {}
    })).toBe(browser)`, plus a restrictive-profile case pinning the fail-closed result. | 'throws
    when binding a non-entitled queue, allows an entitled one' (634-640) -> the deny side is strong;
    the allow side is bare. Fix: `expect(session.createQueueBrowser({ queueDescriptor: { name:
    'allowed' } })).toBe(browser)`.

    Second reading (partly): 654-659 holds: PROFILE operate '*' (managed-panel.test.ts:82) admits
    every name, so `qd.name ?? qd.getName?.() ?? ''` (managed-panel.ts:240) is never exercised; the
    comment at 657 says 'just assert no throw'; the restrictive-profile fix works (pattern at 635).
    661-665 holds: a bare not.toThrow breaks the Defensive-Guard rule and the fail-closed '' result
    is never pinned. 634-640 allow side does not hold as a gap: returning realCreate's browser is
    pinned by .toBe(browser) at 650 and 676. A name-resolution bug fails closed (wrongly deny), not
    open.

Why it matters: The browser-side entitlement wrap could resolve getName-style descriptors to the wrong name (wrongly denying, or matching another pattern) with these tests green.

Change: The browser-side entitlement wrap could resolve getName-style descriptors to the wrong name (wrongly denying, or matching another pattern) with these tests green.

#### CR-0127 [minor] [new] tests/modules/queue-discovery/module.test.ts: 7 weak tests -- 5 have no expect; the copy-button test ignores the payload

Location: tests/modules/queue-discovery/module.test.ts:188-197, tests/modules/queue-discovery/module.test.ts:295-328, tests/modules/queue-discovery/module.test.ts:377-397, tests/modules/queue-discovery/module.test.ts:471-486, tests/modules/queue-discovery/module.test.ts:330-361
Confidence: verified
Evidence:

    'ignores non-isSempConnected state changes' (188-197) -> no expect. Fix:
    `expect(ctx.sempFetch).not.toHaveBeenCalled()`. | 'refresh queues does nothing without selected
    VPN' (318-328) -> no expect ('// Should do nothing'). Fix: the same negative. | 'refresh queues
    button fetches queues for selected VPN' (295-316) -> ends at the click without asserting a queue
    fetch. Fix: waitFor queue options, or sempFetch called with the queues path for the selected
    VPN. | 'enter key on VPN input triggers refresh' (377-386) and 'enter key on queue input
    triggers refresh' (388-397) -> no expect. Fix: assert the refresh fetch fired. | 'handles
    fetchQueues error' (471-486) -> no expect, and it actually exercises the initial VPN fetch
    failing. Fix: retitle and assert the error state shown in the VPN input/list. | 'copy button
    emits connection:check-connection' (330-361) -> bare `expect(handler).toHaveBeenCalled()`. Fix:
    `toHaveBeenCalledWith({ vpn: <first fixture VPN>, queue: <first fixture queue> })`.

    Second reading (partly): Holding: 188-197 (no expect; dropping the key check at module.ts:264
    would fetch on isConnected); 318-328 (no expect); 377-386 and 388-397 (no expect; Enter handlers
    at module.ts:251-252; spy on the click as 772-808 do); 330-361 (no test pins the payload;
    fixtures give {vpn:'default', queue:'test-queue-1'}). 295-316 ceremonial but delete rather than
    fix ('refresh-queues click invalidates cache for current VPN and refetches', 901-922, already
    asserts the refetch). 471-486 ceremonial and mis-titled (queue-fetch errors pinned at 537-561,
    VPN errors at 121-157). Missed: 'handles fetchQueues with error that has custom message'
    (563-583) has no expect either.

Why it matters: Refresh and Enter shortcuts can break, error states can disappear, and Discover->Browse can hand the wrong VPN or queue to Connections, all with the suite green.

Change: Refresh and Enter shortcuts can break, error states can disappear, and Discover->Browse can hand the wrong VPN or queue to Connections, all with the suite green.

#### CR-0129 [minor] [new] tests/integration/message-pipeline.test.ts: 2 weak tests -- one checks only that assigning a variable does not re-render; one cannot see the filter

Location: tests/integration/message-pipeline.test.ts:127-141, tests/integration/message-pipeline.test.ts:156-167
Confidence: verified
Evidence:

    'filter cleared mid-stream: previously-hidden messages do not retroactively appear' (127-141) ->
    after `state.activeFilters = defaultActiveFilters()` nothing can re-render, so `toHaveLength(1)`
    holds for any implementation; it does not 'lock in' arrival-time filtering. Fix: after clearing,
    send a third message and assert row ids `['10', '12']` (the new one shown, beta still absent). |
    'destination-type filter uses window.solace enum (previously guarded by if(window.solace))'
    (156-167) -> only a matching (Queue) message is sent, so a type filter that shows everything
    passes. Fix: also send a Topic-destination message and assert it is excluded. Its comments cite
    'S3 cleanup' and '6.3.6 guard' (plan-item numbers; nit).

Why it matters: The integration layer cannot catch a destination-type filter that never excludes, nor a change in when filters are evaluated.

Change: The integration layer cannot catch a destination-type filter that never excludes, nor a change in when filters are evaluated.

#### CR-0130 [minor] [new] tests/integration/full-flow.test.ts: 1 ceremonial test -- asserts event delivery only

Location: tests/integration/full-flow.test.ts:86-113
Confidence: verified
Evidence:

    House rule: integration tests 'Assert the far-end effect, not the event emission'. 'module A
    emits event, module B receives it' (86-113) -> fake modules; asserts that B's bus handler got
    the payload. That follows from 'modules share a single EventBus instance through AppContext'
    (40-62) plus tests/core/event-bus.test.ts > 'passes payload to handler'. Delete, or replace with
    real modules asserting a far-end DOM or state effect.

Why it matters: It duplicates unit coverage and cannot catch any cross-module bug.

Change: It duplicates unit coverage and cannot catch any cross-module bug.

#### CR-0131 [minor] [new] tests/modules/queue-subscription-explorer/module.test.ts: 1 weak test -- its wait does not gate on the late page, so the no-clobber checks run too early

Location: tests/modules/queue-subscription-explorer/module.test.ts:449-499
Confidence: verified
Evidence:

    'SEMP disconnect mid-load supersedes the in-flight load (no clobber + no toast)' (449-499) ->
    after `resolveFetch(textRes(PAGE_OK))`, the wait `await vi.waitFor(() =>
    expect(btn.textContent).toBe('Load'))` (486-491) waits on a condition already true at line 478,
    so it returns at once. The negatives `not.toContain('BULKQ-001')` / `toMatch(/Click/)` then run
    before the fetch->parse->yield chain can act, so removing the loadGen check (module.ts:122) can
    still pass. 'no toast' is never asserted. Fix: drain enough microtasks for the chain (or wait on
    a signal the chain produces), then assert the rows are absent and
    `document.querySelector('.toast')` is null / showToast was not called.

Why it matters: The disconnect-supersession bug the test was written for (a late page clobbering the cleared table and showing a 'Loaded N' toast) could return undetected.

Change: The disconnect-supersession bug the test was written for (a late page clobbering the cleared table and showing a 'Loaded N' toast) could return undetected.

#### CR-0070 [nit] [new] resetQueueBrowserState() misses runtime-added state fields, and ui-forward.test.ts hand-resets instead of calling it

Location: tests/helpers/resetQueueBrowserState.ts:13-23, src/modules/queue-browser/ui-details.ts:78, src/modules/queue-browser/ui-forward.js:138, src/modules/queue-browser/ui-events.ts:17, tests/modules/queue-browser/ui-forward.test.ts:11-23, tests/modules/queue-browser/module.test.ts:311
Confidence: verified
Evidence:

    House rule: "reset the queue-browser `state.js` singleton with `resetQueueBrowserState()` in
    every queue-browser test file". The helper resets the nine declared fields (lines 14-22). The
    source also assigns `state.selectedMessage = msg` (ui-details.ts:78) and
    `state.selectedForwardMsg = null` (ui-forward.js:138), and ui-events.ts:17 gates the copy action
    on `if (!state.selectedMessage) return;`. Tests set it directly (module.test.ts:311
    `state.selectedMessage = { id: 'msg-1', content: 'hello' }`), and the helper never clears it, so
    it leaks into later tests in the file. ui-forward.test.ts imports `state` (line 4) and its
    beforeEach does only `state.forwardQueue = [];` (line 16), with no helper call: grep count 0.

    Second reading (partly): Facts hold: the helper (resetQueueBrowserState.ts:13-23) never clears
    selectedMessage or selectedForwardMsg; ui-forward.test.ts:12-23 resets only forwardQueue and
    never calls the helper, contradicting contributing.md:316. No bug escapes today: the only reader
    of selectedMessage is handleCopyContent (ui-events.ts:17); ui-events.test.ts:77 sets it to null
    explicitly; module.test.ts:311 is the only setter in its file and no later test triggers copy;
    the copy button's disabled state comes from ui-details.ts:123/151, so the finding's example is
    wrong; selectedForwardMsg is written (ui-forward.js:138) and never read in src; ui-forward.js
    reads only forwardQueue; vitest keeps file isolation. The patch must also update the 'nine
    fields' wording in contributing.md:316 and developer-guide.md:489.

Why it matters: A test that expects 'no message selected' (for example copy-button disabled) passes or fails depending on whether an earlier test in the same file selected one, which is the drift the helper exists to prevent. The patch completes the helper and uses it in ui-forward.

Suggested patch (not applied):

```diff
--- a/tests/helpers/resetQueueBrowserState.ts
+++ b/tests/helpers/resetQueueBrowserState.ts
@@ -21,3 +21,6 @@ export function resetQueueBrowserState(): void {
     state.activeFilters = defaultActiveFilters();
     state.maxMessagesPerQueue = DEFAULT_MAX_MESSAGES_PER_QUEUE;
+    // Assigned at runtime (ui-details.ts, ui-forward.js), not declared in state.js.
+    (state as any).selectedMessage = null;
+    (state as any).selectedForwardMsg = null;
 }
--- a/tests/modules/queue-browser/ui-forward.test.ts
+++ b/tests/modules/queue-browser/ui-forward.test.ts
@@ -3,3 +3,4 @@
 import { wireForward } from '../../../src/modules/queue-browser/ui-forward.js';
 import { state } from '../../../src/modules/queue-browser/state.js';
 import { loadModuleDOM } from '../../helpers/loadModuleDOM';
+import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';
@@ -12,5 +13,5 @@ describe('queue-browser/ui-forward', () => {
     beforeEach(() => {
         const container = createBrowserDOM();
         document.body.appendChild(container);
         ui.initElements(container);
-        state.forwardQueue = [];
+        resetQueueBrowserState();
```

#### CR-0104 [nit] [new] Kept ignores carry stale or inaccurate justification text

Location: src/modules/queue-subscription-explorer/module.ts:159-168, src/core/services/solace-publisher.ts:274-284
Confidence: verified
Evidence:

    QSE module.ts:160 says 'The in-loop line-122 check catches all naturally-emitted disconnects',
    but the in-loop check is at :145 (`if (myGen !== loadGen) return; // superseded mid-stream`).
    solace-publisher.ts:277-280: 'the session may already be torn down by the SDK when dispose()
    runs from a disconnect handler. Mirrors the same defensive pattern used in
    connections/queue-browser session-listener teardown.' No other removeListener call exists in
    src/ (grep), and SDK Session.removeListener is
    `removeListener(e,t){this._privateEventEmitter.removeListener(e,t)}` on an emitter that is never
    nulled. So the accurate category is 'defensive catch on a never-throwing contract', not
    'torn-down session'. The `session.removeListener?.(...)` optional calls at :275-276 are dead for
    an SDK session too. CLAUDE.md: 'Every /* v8 ignore */ must have an inline comment explaining why
    the code is architecturally untestable'. The test cross-reference rule prefers file + symbol
    over line numbers, which rot.

Why it matters: Proposed fix: reword both comments. In QSE, say 'the in-loop supersession check above'. In the publisher, say 'SDK removeListener does not throw; defensive catch on a trusted contract', and drop the stale precedent. Optionally drop the `?.` on removeListener. No alternate. No test impact.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-subscription-explorer/module.ts
+++ b/src/modules/queue-subscription-explorer/module.ts
@@ -159,8 +159,8 @@
                 /* v8 ignore start -- post-loop supersession check. The
-                 * in-loop line-122 check catches all naturally-emitted
+                 * in-loop supersession check above catches all naturally-emitted
                  * disconnects (a disconnect bumps loadGen, then the next
                  * yield's iteration returns). This line covers the
                  * one-microtask window between the last yield being consumed
                  * and the generator's `{done:true}` resolution -- reachable
                  * from real SDK callbacks but not robustly reproducible in
                  * jsdom. */
--- a/src/core/services/solace-publisher.ts
+++ b/src/core/services/solace-publisher.ts
@@ -277,4 +277,4 @@
-        /* v8 ignore start -- defensive catch around SDK removeListener; the
-         * session may already be torn down by the SDK when dispose() runs from
-         * a disconnect handler. Mirrors the same defensive pattern used in
-         * connections/queue-browser session-listener teardown. */
+        /* v8 ignore start -- defensive catch on a trusted contract: SDK
+         * Session.removeListener delegates to a private emitter that is never
+         * nulled, so it does not throw even after dispose; the catch only
+         * guards against a future SDK change. */
```

#### CR-0116 [nit] [new] tests/core/logger.test.ts: 2 weak assertions -- default-arg test passes either way; constant self-check

Location: tests/core/logger.test.ts:173-176, tests/core/logger.test.ts:31-34
Confidence: verified
Evidence:

    'defaults search arg to window.location.search' (173-176) -> `readLogLevelFromUrl()` returning
    null passes whether or not the default reads location (search is ''). Fix: redefine
    location.search to '?logLevel=WARN' and `expect(readLogLevelFromUrl()).toBe(LogLevel.WARN)`. |
    'defaults to INFO' (31-34) -> the second line follows from beforeEach's
    setLogLevel(DEFAULT_LOG_LEVEL); keep only the constant pin.

Why it matters: readLogLevelFromUrl could ignore window.location with this test still green (the kernel ?logLevel test covers it end to end).

Change: readLogLevelFromUrl could ignore window.location with this test still green (the kernel ?logLevel test covers it end to end).

#### CR-0119 [nit] [new] tests/registry.test.ts: 1 duplicate test -- priority ordering re-tests the kernel sort

Location: tests/registry.test.ts:84-103
Confidence: verified
Evidence:

    'modules install in priority-descending order regardless of registry array order' (84-103) ->
    exercises Kernel's sort, already pinned by tests/core/kernel.test.ts > 'installs modules in
    priority order'. Either delete it, or replace it with a registry-specific check: `modules` ids
    and priorities equal src/variants/standard ACTIVE_MODULES.

    Second reading (partly): registry.test.ts:84-103 mostly repeats kernel.test.ts 'installs modules
    in priority order' (:113-129); its expected order is computed from the same priorities `modules`
    supplies, so swapped registry priorities go unnoticed. 'No protection' overstated: the reversed
    array (:94) plus a stable sort fails if registry.ts:57 collapsed every priority or two were
    equal. No other registry test catches priority collapse (:16-29 only checks finiteness).
    Proposed replacement (compare id->priority from `modules` with standard's ACTIVE_MODULES) is
    feasible and stricter (plugin defaults to standard, module-registry-plugin.mjs:74).

Why it matters: Adds no protection for the registry's own job (resolving variant ids to modules).

Change: Adds no protection for the registry's own job (resolving variant ids to modules).

#### CR-0121 [nit] [new] tests/modules/queue-copy/service-copy.test.ts: 2 weak tests and dead code -- a title claims a lastError guarantee nothing asserts

Location: tests/modules/queue-copy/service-copy.test.ts:1018-1057, tests/modules/queue-copy/service-copy.test.ts:993-1016, tests/modules/queue-copy/service-copy.test.ts:477
Confidence: verified
Evidence:

    'a second browser-event triggerStop hits the early-return; final lastError is the first reason'
    (1018-1057) -> the body says the second handler overwrites lastError, and nothing asserts
    lastError. A reader trusts a guarantee that does not hold. Fix: retitle and pin current
    behaviour, `expect(final.lastError).toBe('second failure')`, or make the code keep the first
    reason and assert 'first failure'. | 'cancel after a different stop reason already fired does
    not change copied/sent counts' (993-1016) -> copied is unasserted. Fix:
    `expect(final.copied).toBe(0)`. | line 477 `(state as any); // no-op anchor for readability` ->
    dead expression; delete (nit). | The guards commented out on 2026-05-26
    (service-copy.ts:165-171, 282-293, 322-330) have no remaining tests; 'idle timer is suspended
    while paused' and the first-wins tests target live code, so there is no stale ceremony here.

    Second reading (partly): 1018-1057 holds: the title promises 'final lastError is the first
    reason', but both handlers write lastError before calling triggerStop (service-copy.ts:339-349);
    the body comment at 1052-1055 admits this and nothing asserts lastError -- a misleading title,
    not a hidden bug. 993-1016: the suggested fix is vacuous (the test never calls fireMessage, so
    copied stays 0 regardless); the missing assertion is expect(final.lastError).toBeNull() (the
    cancel branch clears it, service-copy.ts:185-187, and the comment at 1011-1012 contradicts
    itself). 477 holds: `(state as any);` is a dead expression.

Why it matters: The run's reported failure reason can silently be the later event's, contradicting a documented-by-title invariant.

Change: The run's reported failure reason can silently be the later event's, contradicting a documented-by-title invariant.

#### CR-0123 [nit] [new] tests/modules/connections/ui.test.ts: 6 weak or duplicate tests -- a phantom-fallback test, missing precondition, 3 duplicates

Location: tests/modules/connections/ui.test.ts:44-49, tests/modules/connections/ui.test.ts:65-72, tests/modules/connections/ui.test.ts:257-270, tests/modules/connections/ui.test.ts:292-305
Confidence: verified
Evidence:

    'getElements falls back to document.getElementById' (44-49) -> ui.getElements has no such
    fallback (ui.js:10-12); the test only re-asserts `els.container === container`. Delete --
    covered by 'caches element references that survive DOM mutation' (19-42). | 'wires SSL modal
    close' (65-72) -> never asserts the modal opened, so a broken openSslModal passes. Fix: add
    `expect(els.elSslModal.open).toBe(true)` before the click. | describe 'updateAuthUI' its
    'updates labels for oauth mode' (258-263) and 'updates labels for basic mode' (265-270) ->
    delete -- duplicates of 'setAuthMode switches to oauth and updates UI' (169-174) and
    'setAuthMode switches back to basic' (176-182). | 'throws when cacheElements has not been given
    required elements' (300-305) -> misfiled under updateInputState, never calls it, and uses a
    weaker `.toThrow()`. Delete -- duplicate of 'throws when a required element is missing'
    (282-288). | 'does nothing with empty string message' (292-296) -> display 'none' is the initial
    state. Fix: show an error first, then call with '' and assert it is cleared.

    Second reading (partly): 44-49 holds (getElements just returns the cache, ui.js:10-12; no
    fallback). 65-72 weak only on paper: opening is pinned by 'openSslModal > shows modal with URL'
    (155-161) and a missing close listener (ui.js:78) fails this test; the precondition is a
    hardening nit. 258-263 and 265-270 hold ('ID Token' asserted at 83, 'Access Token' at 169-174;
    the basic case is vacuous since the template already reads Username/Password,
    index.html:118,123, and 176-182 covers the else branch). 300-305 holds (same body as 282-288
    with a weaker toThrow). 292-296 refuted: #solace-connect-error has no inline display
    (index.html:128), so style.display starts as '' and asserting 'none' proves the else branch
    (ui.js:116-118) ran.

Why it matters: A title-documented fallback that does not exist misleads readers; a broken SSL modal open would pass.

Change: A title-documented fallback that does not exist misleads readers; a broken SSL modal open would pass.

#### CR-0126 [nit] [new] tests/core/components/queue-picker/picker.test.ts: 1 vacuous guard test -- not.toThrow around dispatchEvent cannot fail

Location: tests/core/components/queue-picker/picker.test.ts:1498-1535, tests/core/components/queue-picker/picker.test.ts:686, tests/core/components/queue-picker/picker.test.ts:717
Confidence: verified
Evidence:

    'handlers gracefully no-op when dispatched after the picker closes' (1498-1535) -> `expect(() =>
    { refs.vpnInput.dispatchEvent(...); refs.vpnRefresh.click(); ... }).not.toThrow()`. DOM dispatch
    reports listener exceptions and never rethrows them, so removing every `!state` guard still
    passes. The follow-up `expect(getDialog().hasAttribute('open')).toBe(false)` does not depend on
    the guards. Fix: collect `window.addEventListener('error', ...)` events during the dispatches
    and assert none, and assert the source's listVpns/listQueues saw no extra calls after close. |
    comment 686 and title 717 '(closes COV-12)' -> cross-reference by plan item; name the test
    instead (nit).

    Second reading (partly): The .not.toThrow() at picker.test.ts:1522-1530 is vacuous
    (dispatchEvent never rethrows), but 'removing every !state guard still passes' is wrong: vitest
    4.1.12's jsdom env re-emits window error events as uncaughtException
    (vitest/dist/chunks/index.DC7d2Pf8.js:399-421, :524); no dangerouslyIgnoreUnhandledErrors and no
    window 'error' listener in src/tests, so a null-deref in the synchronous handlers
    (index.ts:423-486) fails the run. What remains uncaught is state not being nulled on close
    (index.ts:164) leading to silent refetches; the listVpns/listQueues call-count check fixes that.
    Adding a window-error collector would disable vitest's own catch. 686/717 cross-references hold
    (nit).

Why it matters: Null-dereferences in post-close handlers (console errors, refetches against a closed picker) would go unnoticed.

Change: Null-dereferences in post-close handlers (console errors, refetches against a closed picker) would go unnoticed.

#### CR-0128 [nit] [new] tests/modules/user-management/module.test.ts: 2 weak tests -- reload paths check that the list was fetched, not re-rendered

Location: tests/modules/user-management/module.test.ts:114-119, tests/modules/user-management/module.test.ts:149-154
Confidence: verified
Evidence:

    'Refresh re-fetches the list' (114-119) -> bare listUsers called. Delete -- covered with render
    by 'keeps the query across a Refresh' (214-220). | 'reloads the list on rbac:changed' (149-154)
    -> bare listUsers called. Fix: resolve a changed list and assert the new row renders.

    Second reading (partly): 114-119 holds: 'keeps the query across a Refresh' (214-220) clicks the
    same button and asserts the newly fetched row renders, so this test is a strictly weaker
    duplicate; delete it. 149-154: the 'why' does not hold; rbac:changed and Refresh both call
    applyGate() (user-management/module.ts:323,333), so the post-fetch repaint is already pinned by
    214-220.

Why it matters: The rbac:changed reload could fetch without repainting.

Change: The rbac:changed reload could fetch without repainting.

#### CR-0132 [nit] [new] tests/core/services/solace-publisher.test.ts: 2 weak tests -- binary payload not checked; correlation-before-beforeSend order not proven

Location: tests/core/services/solace-publisher.test.ts:321-338, tests/core/services/solace-publisher.test.ts:128-144
Confidence: verified
Evidence:

    'content priority: Binary fires when SDT and XML are null' (321-338) ->
    `expect(cloned.setBinaryAttachment).toHaveBeenCalled()`, unlike its SDT/XML siblings which use
    calledWith; cloning the wrong bytes passes. Fix: `toHaveBeenCalledWith(new Uint8Array([1, 2,
    3]))`, plus the SDT/XML setters not called. | 'runs beforeSend after destination + correlation
    are stamped, before session.send fires' (128-144) ->
    `expect(cloned.setCorrelationKey).toHaveBeenCalled()` is checked afterwards, so it does not
    prove the claimed order. Fix: compare `cloned.setCorrelationKey.mock.invocationCallOrder[0]`
    against beforeSend's (nit).

Why it matters: Copy and forward could publish a binary message with the wrong payload while the publisher tests stay green.

Change: Copy and forward could publish a binary message with the wrong payload while the publisher tests stay green.

#### CR-0133 [nit] [new] tests/core/services/solace-client.test.ts: 1 weak test -- the factory init profile is never checked

Location: tests/core/services/solace-client.test.ts:53-57
Confidence: verified
Evidence:

    'initializes SolclientFactory' (53-57) ->
    `expect(solaceMock.SolclientFactory.init).toHaveBeenCalled()`. Fix: assert the
    SolclientFactoryProperties passed (profile version10, logLevel WARN), e.g. inspect
    `solaceMock.SolclientFactoryProperties.mock.results[0].value`.

Why it matters: A wrong SDK profile (changing API semantics) would pass.

Change: A wrong SDK profile (changing API semantics) would pass.

#### CR-0134 [nit] [new] tests/modules/connections/config.test.ts: 1 test's comment claims silence it does not assert

Location: tests/modules/connections/config.test.ts:69-77
Confidence: verified
Evidence:

    'returns null on corrupted OBF1 blob (bad base64)' (69-77) -> the comment says a bad blob is
    'handled cleanly and silently', but consoleSpy is created and restored without an assertion.
    Fix: `expect(consoleSpy).not.toHaveBeenCalled()`.

Why it matters: Noisy error logging on every load with a corrupt blob would go unnoticed.

Change: Noisy error logging on every load with a corrupt blob would go unnoticed.

#### CR-0135 [nit] [new] tests/mock-broker/sdk.test.ts: 1 ceremonial test -- 'above the shell floor' compares a literal with itself

Location: tests/mock-broker/sdk.test.ts:300-302
Confidence: verified
Evidence:

    'reports a version above the shell floor' (300-302) ->
    `expect(buildSolaceSdk().Version.version).toBe('10.99.0-mock')`, and the floor is never read.
    Fix: read MIN_VERSION from src/index.html (as tests/build/vendor-scripts.test.ts > 'pins $name
    to one exact version the shell accepts' does) and assert the mock is at least that version.

    Second reading (partly): 300-302 never reads the floor, so the title promises more than it
    checks; it reads Version from mock-broker/sdk/enums.ts:88 (a change-detector, not a literal
    compared with itself). The 'why' is overstated: installSdk sets solaceLibLoaded=true itself
    (shell.ts:37); a late vendor onload against the mock only console.errors; showBanner no-ops
    after removeVendorBanner (shell.ts:41-48); no app code reads Version.version. Fix feasible: read
    MIN_VERSION ('10.18.3', src/index.html:69) with the vendor-scripts.test.ts:21 regex and compare;
    atLeast (vendor-scripts.test.ts:28-32) would need to move to tests/helpers.

Why it matters: A raised shell floor that the mock no longer meets would break the demo bundle without this test noticing.

Change: A raised shell floor that the mock no longer meets would break the demo bundle without this test noticing.

### cicd

#### CR-0075 [major] [new] docs-links test fails on a fresh checkout because docs/improvement-plan.md is git-ignored, so the next tag's gates go red on both runners

Location: .gitignore:40-42, docs/test-report.md:3-28, tests/build/docs-links.test.ts:76-84, package.json:22
Confidence: verified
Evidence:

    .gitignore:42 `improvement-plan.md` (git check-ignore -v confirms it matches
    docs/improvement-plan.md, and `git log --all -- docs/improvement-plan.md` is empty: the file has
    never been committed). docs/test-report.md links to it 5 times (lines 3, 10, 15, 22, 28:
    `](improvement-plan.md)`). tests/build/docs-links.test.ts:80 `if
    (!fs.existsSync(path.join(REPO_ROOT, doc))) return true;` counts a link to a missing file as
    broken, and :83 `expect(broken).toEqual([])`. package.json:22 `test:app` = `vitest run ...
    --exclude "tests/mock-broker/**"`, so tests/build/ runs in `test`. (1) locally the ignored file
    is on disk, so the test passes. (2) actions/checkout gives CI a fresh tree without the file. (3)
    `./scripts/dev.sh all scan` reaches `test`, and `docs-links.test.ts > "every anchor and .md link
    in docs/test-report.md resolves"` fails. (4) dev.ps1 fails the same way on windows-2025. (5)
    tag.yml `gates` fails, so image, binaries, publish and release are all skipped. The test landed
    in e26b5ad (2026-11-09); `git tag --contains e26b5ad` is empty, so no tag has run it yet.

    Second reading (confirmed): .gitignore:42 matches docs/improvement-plan.md (git check-ignore
    -v). git ls-files and git log --all for the file are empty, but it exists locally.
    HEAD:docs/test-report.md has exactly 5 `](improvement-plan.md` links (lines 3, 10, 15, 22, 28);
    no other committed .md links it. docs-links.test.ts:80 counts a missing target as broken, :83
    asserts an empty list. test:app (package.json:22) excludes only tests/mock-broker and CI never
    queues cov, so the test runs on both legs and fails on a fresh checkout. The test file has one
    commit (e26b5ad); the latest tag v3.5.0 does not contain it.

    Second reading (confirmed), blocker bar: Does not meet the blocker bar. The gate fails closed:
    CI goes red and nothing ships. Still a guaranteed outage for the next release, and the local run
    stays green while CI fails: git check-ignore -v matches .gitignore:42; git ls-files and git log
    --all are empty: never tracked. HEAD:docs/test-report.md links `](improvement-plan.md)` at 3,
    10, 15, 22, 28; the only tracked .md link target that is not tracked. docs-links.test.ts:15-16
    lists docs/, :61 collects, :79 resolves to docs/improvement-plan.md, :80 marks missing as
    broken, :83 fails. vitest.config.ts:22 includes tests/**, package.json:22 test:app excludes only
    mock-broker; dev.sh:276 ALL; :167 runs test:app because COV_QUEUED (:308-312) is set only when
    cov is queued; ci.yml:73/:78 both runners; tag.yml:139 gates and every downstream job needs
    gates. Partial compensating control: docs/git.md:49-66 says to run dev.sh full on a clean
    checkout (procedure only). e26b5ad is in no tag.

Why it matters: The next v* tag cannot release, and the local run gives no warning. CLAUDE.md's improvement-plan ledger discipline also assumes a shared, tracked file, which an ignored one is not.

Suggested patch (not applied):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -39,7 +39,6 @@
 
 # Test results
 coverage
-improvement-plan.md
 
 # Dev-script task logs (scripts/dev.sh, dev.ps1)
 scripts/logs
```

#### CR-0076 [major] [new] Tag format is never validated: any v* tag (pre-release or malformed) moves `latest`, is marked the Latest GitHub release and redeploys Pages; the no-tags guard can never fire

Location: .github/workflows/tag.yml:69-71, .github/workflows/tag.yml:174-182, .github/workflows/tag.yml:397-400, .github/workflows/tag.yml:418-458, .github/workflows/tag.yml:536-540, docs/git.md:99
Confidence: verified
Evidence:

    tag.yml:71 `tags: ["v*"]`. :178-182 `type=semver,pattern={{version}}` ...
    `type=raw,value=latest` has no `enable=` condition, so it is always emitted. :397-399 `if [
    "${#tags[@]}" -eq 0 ]; then echo "::error::$f carries no tags -- is the git tag vX.Y.Z?"` is
    dead code, because `latest` keeps the array non-empty. :536 `gh release create "$TAG"
    --verify-tag --title "$TAG"` has no `--prerelease`. docs/git.md:99: "Tag format **must** be
    `vX.Y.Z`", but nothing in `plan` checks it. Pushing `v3.7` (not semver) makes metadata-action
    skip the semver patterns but keep `latest`, and publish moves only `latest`. Pushing
    `v3.7.0-rc.1` yields `3.7.0-rc.1` plus `latest`. In both cases `pages` copies that index.html to
    GitHub Pages, and `release` creates a normal release that GitHub marks Latest.
    docs/deployment.md:75 tells self-hosters to curl `releases/latest/download/index.html`.

    Second reading (confirmed): tag.yml:71 triggers on any v*; the plan job (92-132) validates only
    SHIP_IMAGE and BUILD_TARGETS, never the tag; dev.sh:30 takes VERSION unvalidated. :182
    type=raw,value=latest has no enable condition, so the guard at :397-400 can never fire although
    its message ('is the git tag vX.Y.Z?') shows the intent. :536-540 has no --prerelease or
    --latest (GitHub marks it Latest by the API default, external behaviour). pages (418-458)
    deploys any tag. git.md:99 says the format 'must' be vX.Y.Z; deployment.md:75 points curl at
    releases/latest.

    Second reading (confirmed), blocker bar: Does not meet the blocker bar. Every artifact still
    passes the gates and trivy; the failure is a channel/labelling error (a gated pre-release or
    malformed tag published as current); needs an operator to push a tag against docs/git.md:99:
    tag.yml:71 filters only on v*; plan (:100-132) never validates github.ref_name; dev.sh:30 takes
    VERSION unchecked; :182 type=raw,value=latest has no enable=; :280-281 copies the meta tags so
    `${#tags[@]} -eq 0` at :397 can never be true (dead guard); pages (:418-425) and release
    (:465-472) have no tag condition; :536-540 has no --prerelease and no --latest=false. Side
    effect: a hotfix on an older line (v3.4.1 after v3.5.0) also moves `latest` backwards.
    deployment.md:68 says Pages redeploys on every v* tag; :75 curls releases/latest. No ruleset or
    tag protection in .github. External behaviour not run: metadata-action skips non-semver tags;
    GitHub marks a release Latest when --latest is absent.

Why it matters: One mistyped or release-candidate tag ships everywhere as the current release (the latest image, Pages and the Latest release). The guard that looks like it prevents this cannot trigger.

Suggested patch (not applied):

```diff
--- a/.github/workflows/tag.yml
+++ b/.github/workflows/tag.yml
@@ -105,6 +105,13 @@
         run: |
           set -euo pipefail
 
+          # docs/git.md: the tag format must be vX.Y.Z. metadata-action skips a
+          # non-semver tag but still emits the raw `latest`.
+          if ! printf '%s' "$GITHUB_REF_NAME" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
+            echo "::error::tag must be vX.Y.Z (docs/git.md), got '$GITHUB_REF_NAME'"
+            exit 1
+          fi
+
           case "$(printf '%s' "${SHIP_IMAGE:-}" | tr '[:upper:]' '[:lower:]')" in
             true|yes|1) img=true ;;
             false|no|0) img=false ;;
```

#### CR-0077 [major] [new] SCA workflow calls a reusable workflow at mutable `@main`, handing it FOSSA_API_KEY and broad top-level write and OIDC permissions; runner is ubuntu-latest

Location: .github/workflows/sca-scan-and-guard.yml:9-26, .github/workflows/sca-scan-and-guard.yml:36, .github/workflows/sca-scan-and-guard.yml:49
Confidence: verified
Evidence:

    :20 `uses: SolaceDev/solace-public-workflows/.github/workflows/sca-scan-and-guard.yaml@main`,
    :25-26 `secrets: FOSSA_API_KEY: ${{ secrets.FOSSA_API_KEY }}`. :9-16 top-level `id-token:
    write`, `statuses: write`, `checks: write`, `pull-requests: write` apply to every job and to
    same-repo PR runs. :36 `runs-on: ubuntu-latest`. :49 `cicd-helper@3cb0373... # main`: the
    comment is a branch, not a version tag, so Dependabot cannot bump that pin. House rule: "GitHub
    Actions pinned by commit SHA -- never a tag like `@v4`, which is mutable." A branch ref is more
    mutable than a tag. Dependabot's github-actions ecosystem does not move a branch-pinned reusable
    workflow either.

    Second reading (confirmed): All lines match (:20 @main, :25-26 FOSSA_API_KEY, :9-16 top-level
    write and id-token, :36 ubuntu-latest, :49 SHA with '# main' comment). Context: commit bb300f7
    ('track reusable workflows by branch instead of SHA', DATAGO-154170) deliberately replaced the
    earlier SHA pin, so it may be org policy. It still breaks the house rule and contradicts
    docs/git.md:194 ('Every action is pinned by commit SHA'). The Dependabot claim about the '#
    main' comment is unconfirmed; that pin is immutable either way.

    Second reading (partly), blocker bar: Does not meet the blocker bar. No gate can pass broken and
    no artifact can be injected. A supply-chain trust choice about a first-party org workflow: :20
    @main with :25-26 FOSSA_API_KEY confirmed, as are the broad top-level permissions at :9-16.
    Correction: they do not apply to every job: update_manifest declares its own block (:37-40), so
    the top-level set reaches only the reusable call, capping the callee's token. Fork PRs get no
    secrets and a read-only token, so exposure is limited to same-repo PRs and pushes to main.
    Intent: f949b6a pinned by SHA, b7b4aff bumped the digest, bb300f7 switched to @main on purpose
    ('track reusable workflows by branch instead of SHA') under an org ticket; docs/git.md:45 calls
    it the organisation's FOSSA SCA scan. b7b4aff reads like a Renovate-style digest bump,
    suggesting an org bot maintains the '# main' SHA (suspected). :36 ubuntu-latest contradicts
    ci.yml:37-39 (nit). A house-rule S3 deviation the org has accepted; record it, do not revert
    unilaterally.

Why it matters: Whoever can push to that branch of the other repository controls code that runs here with a secret and OIDC/status/PR write rights (same-repo PRs and pushes to main; fork PRs get no secrets). The repo switched from a SHA pin to @main on purpose (bb300f7, an org ticket), so this is an accepted org decision that still breaks house rule S3 and contradicts docs/git.md:194 ('Every action is pinned by commit SHA'); record it as accepted in the ledger if the org policy stands, and fix the doc either way.

Change: Pin the reusable workflow to a commit SHA with a version comment (or document the org exception in docs/git.md:194), pin the runner to ubuntu-24.04 as ci.yml does, and scope the top-level permissions to the job that needs them.

#### CR-0080 [minor] [new] Release artifacts are rebuilt in each stage instead of promoted; the image's own index.html and provisioned.html never pass check:bundles

Location: .github/workflows/tag.yml:323-328, docker/Dockerfile:110, docker/Dockerfile:131-135, scripts/dev.sh:137-141
Confidence: verified
Evidence:

    The bundles are built three times: once in `gates` (ci.yml `dev.sh all scan`, which uploads only
    logs), again in `binaries` (tag.yml:328 `run: ./scripts/dev.sh build`, the copy that is
    released), and again inside each image platform build (Dockerfile:110 `RUN
    APP_VERSION="$APP_VERSION" npm run build`). check:bundles runs only in the dev-script `build`
    task (dev.sh:141). The Dockerfile build stage runs `npm run build` and copies
    `/pwa/dist/index.html /pwa/dist/provisioned.html /pwa/dist/solAdmin.html` (:135) with no bundle
    check. So the HTML actually served from the image is a separate build from the one that was
    checked.

    Second reading (partly): tag.yml:328 rebuilds the bundles, Dockerfile:110 rebuilds again,
    Dockerfile:131-135 copies index/provisioned/solAdmin with no check:bundles although scripts/ is
    in the build context (Dockerfile:105). The title is wrong about solAdmin.html: check:bundles
    never inspects it (check-bundles.mjs:52-64 lists DIRECT_BUNDLES, provisioned.html and
    provisioned-demo.html only). Same-commit index.html and provisioned.html are checked in gates
    (dev.sh:141) and the image build runs npm ci from the same lockfile, so the risk is low.

Why it matters: Today the inputs match (same commit and lockfile), so the risk is low. But the claim that the shipped bundles were proven isolated holds only by reproducibility, not by checking the shipped artifact.

Change: But the claim that the shipped bundles were proven isolated holds only by reproducibility, not by checking the shipped artifact.

### build

#### CR-0078 [major] [new] Compose posture tests do not forbid every widening token, let extra security_opt entries through, and leave the e2e `gateway` service unpinned

Location: tests/build/compose-files.test.ts:20-42, tests/build/e2e-lib.test.ts:251-260, tests/build/e2e-lib.test.ts:293-300, docker/docker-compose.e2e.yaml:18-57
Confidence: verified
Evidence:

    compose-files.test.ts:24 `const WIDENING = /^
    {4}(?:ipc|pid|network_mode|cap_add|devices|privileged: true|userns_mode)\b/m;` has no `sysctls`
    and nothing for `unconfined` (seccomp/apparmor) or `label:disable`. :22 pins `' security_opt:\n
    - no-new-privileges:true'` by substring count (:37 `count(block, line) ... toBe(1)`), so
    `security_opt:` with `- no-new-privileges:true` followed by `- seccomp:unconfined` still counts
    1 and passes. The e2e copies (e2e-lib.test.ts:258 for browser, which also lacks `userns_mode`,
    and :299 for direct) share the gap. The e2e `gateway` service (Provisioned mode,
    docker-compose.e2e.yaml:18-57, port 127.0.0.1:39443) is in neither SERVICES
    (compose-files.test.ts:26-31) nor any e2e-lib posture test. e2e-lib only compares its `image:`
    line (:305) and its SSL_INSECURE_SKIP_VERIFY (:232), although the direct test title says "runs
    locked down like the gateway". House rule: "Each emitted negative is pinned by a golden plus a
    test forbidding the widening tokens" (tokens listed: `privileged: true`, `cap_add`, `devices:`,
    `sysctls:`, `unconfined`, `pid: host`, `ipc: host`). There is no golden file.

    Second reading (confirmed): WIDENING (compose-files.test.ts:24) has no sysctls, unconfined or
    label:disable. The substring count at :22/:37 still counts 1 when `- seccomp:unconfined` is
    appended after `- no-new-privileges:true`, and a 6-space item escapes the 4-space-anchored
    regex. The browser regex (e2e-lib.test.ts:258) lacks userns_mode. SERVICES (:26-31) omits
    docker-compose.e2e.yaml; the e2e gateway service (:18-57) is checked only for SSL_INSECURE
    (e2e-lib.test.ts:232-233), existence (:237-239) and its image line (:305), so dropping its
    cap_drop stays green. Hand-written files, so 'no golden' matters less; severity unchanged.

    Second reading (confirmed), blocker bar: Does not meet the blocker bar. Every compose service
    states all five negatives today and none carries a widening token; the files are static with no
    rendered value that could inject a key. The gap is regression protection:
    compose-files.test.ts:24 forbids, at 4-space indent only: ipc, pid, network_mode, cap_add,
    devices, privileged: true, userns_mode. Not forbidden: sysctls, unconfined
    (seccomp/apparmor/systempaths), label:disable, uts, cgroup, cgroup_parent, device_cgroup_rules,
    YAML merge keys/extends, extra bind mounts such as docker.sock. :40-41 only require /tls and
    /data despite the comment at :39. The :22/:37 substring count passes with an entry appended
    after no-new-privileges. service() at :17 stops at a 2-space comment, so a key after one escapes
    every check. Covered: SERVICES :26-31, e2e direct :293-300, browser :251-260 (also lacks
    userns_mode). Not covered: the e2e gateway (docker-compose.e2e.yaml:18-57); dev.sh scan
    (:227-247) has no compose scan. The 'no golden' sub-point does not stand: the static files are
    their own golden. Major for the shipped files; the e2e gateway gap alone is minor.

Why it matters: Someone could add a sysctls block, an unconfined seccomp/apparmor profile, or drop the e2e gateway's cap_drop and every posture test would stay green.

Suggested patch (not applied):

```diff
--- a/tests/build/compose-files.test.ts
+++ b/tests/build/compose-files.test.ts
@@ -21,7 +21,7 @@
     '    user: "65532:65532"', '    privileged: false', '    read_only: true',
     '    cap_drop:\n      - ALL', '    security_opt:\n      - no-new-privileges:true',
 ];
-const WIDENING = /^ {4}(?:ipc|pid|network_mode|cap_add|devices|privileged: true|userns_mode)\b/m;
+const WIDENING = /^ {4}(?:ipc|pid|network_mode|cap_add|devices|sysctls|privileged: true|userns_mode)\b|unconfined|label[:=]disable/m;
 
 const SERVICES: [string, string][] = [
     ['docker/compose.gateway.yaml', 'gateway'],
@@ -36,6 +36,7 @@
         expect(block, `the ${name} service`).not.toBe('');
         for (const line of POSTURE) expect(count(block, line), line).toBe(1);
         expect(block).not.toMatch(WIDENING);
+        expect(block.match(/^ {4}security_opt:\n((?: {6}- .*\n)*)/m)?.[1], 'security_opt holds no-new-privileges only').toBe('      - no-new-privileges:true\n');
         // Writable only where the gateway writes: the TLS material and its data.
         expect(block).toMatch(/^ {6}- [\w-]+:\/tls$/m);
         expect(block).toMatch(/^ {6}- [\w-]+:\/data$/m);
```

#### CR-0081 [minor] [new] Dockerfile base images and syntax frontend are pinned by tag, not digest

Location: docker/Dockerfile:1, docker/Dockerfile:71, docker/Dockerfile:99
Confidence: verified
Evidence:

    :1 `# syntax=docker/dockerfile:1.6` (a floating minor-line frontend), :71 `FROM
    golang:1.27.3-alpine AS gateway-builder`, :99 `FROM node:26.8.1-alpine AS pwa-builder`. House
    rule: "Pin exact versions (lockfiles, image digests, SHA256 for scripts, ...)". The project
    already digest-pins the Trivy and Playwright images (dev.sh:20, docker-compose.e2e.yaml:107), so
    these three references are inconsistent with that practice. Tags on Docker Hub are mutable: an
    alpine rebuild changes the builder under the same tag.

Why it matters: Release image builds are not reproducible from the repo alone, and a re-pushed builder tag (accidental or malicious) feeds straight into the shipped binary and bundles.

Change: Release image builds are not reproducible from the repo alone, and a re-pushed builder tag (accidental or malicious) feeds straight into the shipped binary and bundles.

#### CR-0083 [minor] [new] vite-build.mjs exits 0 when vite is killed by a signal, and emptyOutDir:false keeps a stale bundle for check:bundles to pass on

Location: scripts/vite-build.mjs:60-64, vite.config.ts:239, package.json:8
Confidence: verified
Evidence:

    vite-build.mjs:64 `child.on('exit', code => process.exit(code ?? 0));`. Node passes `code ===
    null` with a `signal` when the child is killed (OOM killer, SIGTERM), so `?? 0` reports success.
    package.json:8 chains eight passes with `&&`, so the chain keeps going. vite.config.ts:239
    `emptyOutDir: false` keeps the previous run's dist/*.html. Locally, check-bundles then inspects
    last run's file for a pass that never finished, and passes. A pass killed mid-write can also
    leave a truncated index.html, which passes the Direct check (that check only looks for markers
    that must be absent).

    Also (a4): Line 64 is `child.on('exit', code => process.exit(code ?? 0));`. When the child dies
    from a signal (the OOM killer's SIGKILL, or SIGINT), Node passes code=null plus a signal name,
    so the wrapper reports success. There is no `child.on('error', ...)`, so a spawn failure
    surfaces as an unhandled 'error' event. vite.config.ts sets emptyOutDir: false, so after a
    killed pass a stale bundle from an earlier run can still be in dist/ when check:bundles inspects
    it locally.

Why it matters: A build that was killed can report success, so the build gate does not reliably block.

Suggested patch (not applied):

```diff
--- a/scripts/vite-build.mjs
+++ b/scripts/vite-build.mjs
@@ -61,4 +61,10 @@
     stdio: 'inherit',
     env
 });
-child.on('exit', code => process.exit(code ?? 0));
+child.on('exit', (code, signal) => {
+    if (signal) {
+        console.error(`vite build was killed by ${signal}`);
+        process.exit(1);
+    }
+    process.exit(code ?? 1);
+});
```

#### CR-0084 [minor] [new] The `vet` gate type-checks src/**/*.ts only: tests/, vite/vitest configs and the src .js files are never type-checked, so test fixtures typed as production types drift silently

Location: tsconfig.json:7, tsconfig.json:25-28, package.json:18, tsconfig.json:25-28, scripts/dev.sh:151-157, tests/modules/queue-copy/service-copy.test.ts:17-33, tests/mock-broker/gateway/contract.test.ts:34
Confidence: verified
Evidence:

    tsconfig.json:25-28 `"include": ["src/**/*.ts", "src/**/*.js"]` and :7 `"allowJs": true` with no
    `checkJs`, so the 7 tracked src .js files compile but are not checked. `git ls-files | grep
    tsconfig` shows tsconfig.json is the only tsconfig. package.json:18 `"typecheck": "tsc
    --noEmit"`. vitest strips types without checking them. CLAUDE.md: "`tsc` is the only thing that
    catches it" and "Code you touch must pass `vet` clean". The 103 tracked test files,
    vite.config.ts and vitest.config.ts are outside that net.

    Also (a5): tsconfig.json `"include": ["src/**/*.ts", "src/**/*.js"]`, and task_vet runs `npm run
    typecheck` (= `tsc --noEmit`). vitest strips types without checking them, and CLAUDE.md says
    "tsc is the only thing that catches it". So tests/** and tests/helpers/** are never checked.
    Fixtures declared as production types, such as service-copy.test.ts:17 `function
    verifyResult(...): VerifyResult { return { sourceOk: true, via: 'semp', ... } }` and
    contract.test.ts:33 `const seed: GatewaySeed = read('seed.json')`, keep running when
    VerifyResult or GatewaySeed gains a required field or renames one. Calls to service factories
    with stale signatures also run, because the arguments are untyped at runtime.

Why it matters: Type errors in tests and build config, and any type error in the JS modules, pass every gate.

Change: Type errors in tests and build config, and any type error in the JS modules, pass every gate.

#### CR-0086 [minor] [new] setup.sh is an unreferenced, unhardened script that downloads an unpinned SDK with no checksum and reports success even when nothing was extracted

Location: setup.sh:1-20
Confidence: verified
Evidence:

    :1 `#!/bin/bash` and :2 `set -e` (no -u, no pipefail). :8 `curl -L -o "$ZIP_FILE" "$URL"` from
    `https://products.solace.com/download/JS_API` has no `-f`, no version and no SHA256 check. :15
    `find tmp_solace -type f -path "*/lib/solclient.js" -exec mv {} dist/js/ \;` exits 0 when
    nothing matches, and :20 still prints "Done! File is located at dist/js/solclient.js". The SDK
    is meanwhile pinned to `solclientjs 10.18.3` in package.json:42 and copied from node_modules by
    the Dockerfile (:132), so this is a second, unpinned source for the same dependency. grep finds
    no reference to setup.sh in docs/, README, scripts/ or .github/. Last touched c78bc2c (Feb
    2026).

    Second reading (partly): setup.sh as quoted: set -e only, curl without -f, no version or SHA256,
    unconditional 'Done'. Last commit c78bc2c; no reference outside .git, node_modules and
    graphify-out. SDK pinned at package.json:42, copied at Dockerfile:132. Narrowing: a failed or
    HTML download makes unzip fail at :11 so set -e aborts; the false 'Done' happens only when a
    valid zip lacks */lib/solclient.js. dist/js/ is still a supported fallback (src/index.html:107,
    deployment.md:194); the shell's MIN_VERSION check (index.html:81-83) blocks too-old SDKs.
    Deleting the file is the fix.

Why it matters: This violates "SHA256 for scripts" and the pinning rule, and anyone who finds and runs it gets whatever SDK version is current, possibly with a false success message.

Change: This violates "SHA256 for scripts" and the pinning rule, and anyone who finds and runs it gets whatever SDK version is current, possibly with a false success message.

#### CR-0085 [nit] [new] dev.ps1 buffers each command's output until it exits and validates task names with wildcard-tolerant, case-insensitive Get-Command -- both prescribed by the dev-script contract, so a cancelled Windows run can lose its log and `dev.ps1 b*` passes the upfront check

Location: scripts/dev.ps1:88-98, scripts/dev.ps1:376-378, scripts/dev.sh:62-67, scripts/dev.sh:309-311
Confidence: verified
Evidence:

    dev.ps1:92 `$out = (& $Exe @CmdArgs 2>&1 | ForEach-Object { "$_" } | Out-String -Width 4096)`
    then :95-96 writes the log and console only after the command exits. dev.sh:65 `"$@" 2>&1 |
    strip_csi | tee -a "$LOG_DIR/$task.log"` streams. On the windows-2025 leg a long npm/go step
    prints nothing until it ends, and if the job times out or is cancelled scripts/logs/<task>.log
    holds only the header, so the uploaded logs artifact lacks the failing output. dev.ps1:377
    `Get-Command "Task-$task"` accepts wildcards, so `dev.ps1 b*` passes the upfront check and fails
    only when run. Function lookup is case-insensitive (`BUILD` works on Windows, fails in
    dev.sh:310 `type "task_$task"`).

    Second reading (partly): dev.ps1:88-98 buffers, dev.sh:63-67 streams; dev.ps1:377 Get-Command
    accepts wildcards and is case-insensitive ('b*' passes the check, then throws, caught at :386 ->
    code 1 with a confusing message). Both choices are prescribed by the house dev-script contract
    (dev-script-contract.md:144-152 mandates capture-once/write-once for PowerShell 5.1 because
    Tee-Object breaks; the skeleton dev_ps1.skeleton:56 and :162 has the same Invoke-Logged and
    Get-Command check). The project follows its contract; the trade-off belongs to the template.

Why it matters: Both behaviours follow the house dev-script contract (capture-once/write-once for PowerShell 5.1, the Get-Command check from the skeleton), so the repo is compliant; the trade-off (lost output on a timed-out Windows leg, a weaker upfront name check) belongs to the template.

Change: In the init-devops template: stream through a PowerShell-5.1-safe tee, and match task names with an exact, case-sensitive lookup.

### interfaces

#### CR-0022 [minor] [new] Docs instruct operators to set CONN_MODES=managed, a value the gateway rejects at startup

Location: docs/architecture.md:693, docs/rbac-variant-plan.md:57, docs/rbac-variant-plan.md:122, docs/rbac-variant-plan.md:160, go-web-proxy/main.go:212-227
Confidence: verified
Evidence:

    architecture.md:693: 'under `CONN_MODES=managed` the Direct relay answers `404`'.
    rbac-variant-plan.md:122: 'entitlement guarantee in this document holds only under
    `CONN_MODES=managed`'. rbac-variant-plan.md:160: a deployment that needs it to hold 'must set
    `CONN_MODES=managed`'. architecture.md:664 points readers to rbac-variant-plan.md for the threat
    model. The gateway accepts only direct, provisioned and both (main.go:213-217: `case connDirect,
    connProvisioned, connBoth: default: return fmt.Errorf("connModes=%q ... must be one of ...")`).
    resolveConfig makes this fatal on seeding, so an operator who follows the threat-model doc gets
    a gateway that will not start.

Why it matters: The config value named in the security guidance is one the gateway refuses (fail-loud, but at the moment an operator is hardening a deployment). The correct value is `provisioned`.

Change: The config value named in the security guidance is one the gateway refuses (fail-loud, but at the moment an operator is hardening a deployment).

#### CR-0023 [minor] [new] Provisioned broker connections are hard-wired to TLS (https SEMP, wss SMF), but the connection record and the docs never say so

Location: go-web-proxy/relay.go:145-151, go-web-proxy/smf.go:117-123, go-web-proxy/managed.go:255-272, docs/user-guide.md:489
Confidence: verified
Evidence:

    relay.go:145-147 `u := &url.URL{ Scheme: "https", Host: net.JoinHostPort(target.host,
    target.port), ...`. smf.go:117-118 `u := &url.URL{ Scheme: "https", ...` for the SMF upgrade.
    The admin's connection shape carries ports only (managed.go:255-264 sempJSON{Port, User, Pass},
    clientJSON{Port, MsgVpns}), with no scheme. user-guide.md:489 describes the editor fields
    (hostname, SEMP port, client port) without saying the ports must be TLS ports, while the Direct
    form documents both plain and TLS ports (user-guide.md:74-75, :119, e.g. '8080 (http) or 1943
    (https)'). An admin who enters SEMP port 8080 gets a TLS handshake against a plain port, a
    RoundTrip error, and a 502 upstream_unavailable ('The gateway could not reach the broker...'),
    with the cause only in the gateway log.

Why it matters: A hard-coded protocol choice is part of the provisioning contract but is invisible to the person filling in the form, so a plain-port entry fails with a generic error. Either document it in the editor and docs or make it a field.

Change: Either document it in the editor and docs or make it a field.

#### CR-0024 [minor] [new] SSL_INSECURE_SKIP_VERIFY is parsed leniently while HOSTED and LOG_LEVEL are strict; a typo is silently ignored

Location: go-web-proxy/main.go:177, go-web-proxy/main.go:190-201, go-web-proxy/main.go:236-250, go-web-proxy/configfile.go:178-201
Confidence: verified
Evidence:

    main.go:177 `insecureSkipVerify: os.Getenv("SSL_INSECURE_SKIP_VERIFY") == "true",`. By contrast
    parseHosted (main.go:190-201) refuses anything but "true"/"false" ('Anything else is refused
    rather than guessed'), and parseLogLevel is strict 'so a typo must fail at startup rather than
    silently run' (L236-237). configfile.go:180-181 acknowledges 'SSL_INSECURE_SKIP_VERIFY=TRUE
    parses to false', and boolEnv (L201) mirrors it. An operator who sets SSL_INSECURE_SKIP_VERIFY=1
    or TRUE on first start to reach a self-signed broker gets `insecureSkipVerify: false` written
    into config.yaml with no message, and every relayed request then fails verification with a
    generic 502.

Why it matters: Boolean env parsing differs between keys, contrary to the project's own fail-loud rule for persisted settings. The default is safe, but the misconfiguration surfaces far from its cause.

Change: Boolean env parsing differs between keys, contrary to the project's own fail-loud rule for persisted settings.

#### CR-0026 [nit] [new] The SSL_CERT_FILE name collides with Go's own trust-store variable, so 'env var ignored, config.yaml wins' is not true for it

Location: go-web-proxy/main.go:174, go-web-proxy/configfile.go:192, go-web-proxy/tls.go:150-155, go-web-proxy/main.go:328-330, docs/deployment.md:166
Confidence: verified
Evidence:

    The gateway uses SSL_CERT_FILE for its own server certificate (main.go:174, seedVar at
    configfile.go:192). buildTrustPool starts from `x509.SystemCertPool()` (tls.go:151), and on
    Linux Go reads SSL_CERT_FILE as the system root bundle. Once config.yaml exists, a set or
    changed SSL_CERT_FILE is logged as 'env var ignored, config.yaml wins' (main.go:328-330), yet it
    still replaces the upstream root pool with that file, e.g. the gateway's own leaf cert.
    deployment.md:166 mentions the bundle side effect but not that the precedence log is wrong for
    this variable.

Why it matters: The documented precedence (the file is authoritative, env is only reported) has an exception that the startup log contradicts.

Change: The documented precedence (the file is authoritative, env is only reported) has an exception that the startup log contradicts.

### observability

#### CR-0042 [major] [new] net/http server errors, handler panics included, are logged at INFO and dropped at the default WARN level

Location: go-web-proxy/main.go:135-157, go-web-proxy/main.go:320-323, go-web-proxy/main.go:397-408
Confidence: verified
Evidence:

    main.go:141 `logLevel: slog.LevelWarn,` is the default (docs/deployment.md:170 also says
    `LOG_LEVEL | warn`). main.go:323 builds the logger with `Level: &lv.level`. main.go:405-407: `//
    net/http's own errors (a failed TLS handshake, a panicking handler) // go to the same log, at
    info. ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelInfo),`. A handler panics,
    net/http recovers and writes `http: panic serving ...` with the stack to ErrorLog. The bridge
    emits that as an INFO record, and the TextHandler drops every record below WARN. On a default
    deployment the panic and its stack never reach the container log. The client just sees a dropped
    connection.

    Second reading (confirmed): main.go:141 default LevelWarn; :323 handler Level=&lv.level;
    :405-407 ErrorLog at LevelInfo. No recover() anywhere in go-web-proxy; no test pins ErrorLog.
    net/http (and h2) recovers a handler panic and writes 'http: panic serving' through srv.ErrorLog
    -> INFO -> dropped at WARN. The comment promises only 'same log, at info', so 'opposite of what
    the comment promises' overstates slightly. Core claim holds: a panic fails silently on a default
    deployment.

    Second reading (confirmed), blocker bar: Not a blocker. It only matters once a separate bug
    makes a handler panic; the effect is lost diagnostics, not wrong behaviour; the fix is a small
    handler wrapper. Borderline major under 'an error path that fails silently': Default WARN
    (main.go:141; deployment.md:170); handler level is the live LevelVar (main.go:323;
    live.go:16,44); ErrorLog is slog.NewLogLogger(handler, LevelInfo) (main.go:405-407); the bridge
    checks handler.Enabled(level) so INFO records are dropped at WARN. net/http's conn.serve
    recovers a handler panic and logs 'http: panic serving ...' plus the stack via ErrorLog
    (ErrAbortHandler excepted) -> dropped. No recover middleware (grep of non-test Go finds only the
    main.go comment). accessLog is not deferred (proxy.go:442-450), so a panicking request leaves no
    line at all. Partial compensation: the level can be changed live from the settings page, but the
    first panic is already gone. No doc says this is intended.

Why it matters: Any gateway bug that panics is invisible unless the operator happens to run at info or debug, which is the opposite of what the comment promises. Info was chosen to keep TLS handshake noise out, so the fix needs a filter (a small handler wrapper that raises `http: panic` lines to ERROR), not a blanket level change.

Change: Any gateway bug that panics is invisible unless the operator happens to run at info or debug, which is the opposite of what the comment promises. Info was chosen to keep TLS handshake noise out, so the fix needs a filter (a small handler wrapper that raises `http: panic` lines to ERROR), not a blanket level change.

#### CR-0043 [minor] [new] User and connection changes in the admin API leave no log line naming who did it or to what, unlike settings, backups and imports

Location: go-web-proxy/managed.go:350-389, go-web-proxy/managed.go:391-405, go-web-proxy/managed.go:415-430, go-web-proxy/managed.go:432-442, go-web-proxy/managed.go:190-193, go-web-proxy/settings.go:110, go-web-proxy/backup_api.go:384-385
Confidence: verified
Evidence:

    saveUser ends `if drop { h.sessions.dropUser(name) } w.WriteHeader(http.StatusNoContent)`
    (managed.go:385-388). deleteUser ends `default: h.sessions.dropUser(name);
    w.WriteHeader(http.StatusNoContent)` (401-403). saveConnection runs
    `h.store.upsertConnection(rec)` and then `w.WriteHeader(http.StatusNoContent)` (424-429).
    deleteConnection is the same (438-440). None of these calls h.logger, and store.go logs only at
    bootstrap (store.go:180, 194, 797-801). By contrast, `h.logger.Warn("gateway settings saved",
    "by", sessionOf(r).user, ...)` (settings.go:110), `h.logger.Warn("configuration imported", "by",
    caller, "users", ...)` (backup_api.go:384) and the backup download/export/schedule lines all
    name the admin. The failure path `h.logger.Error("managed: "+op+" failed", "err", err)`
    (managed.go:191) names neither the admin nor the target. So granting admin, deleting a user, or
    replacing a broker's stored password leaves only an access-log line `PUT /managed/users/<name>
    204`. That line is at INFO (hidden at the default WARN) and carries no actor. settings.go:110
    also leaves out which keys changed.

    Second reading (partly): saveUser (350-389), deleteUser (391-405), saveConnection (415-430),
    deleteConnection (432-442) never call h.logger; ServeHTTP (76-108) and adminOnly (112-124) do
    not either; store.go logs only at 180, 194, 797-801; serverError names no actor/target;
    settings.go:110 and backup_api.go:384-385 name the admin; access log is INFO with no user.
    Severity overstated: no doc promises a user-change audit (docs/provisioned-mode.md:156, :179
    promise logging only for settings saves and backups). Inconsistency / best-practice gap.

Why it matters: In an RBAC gateway, privilege and credential changes are the events an operator most needs to reconstruct, and they are exactly the ones not recorded. Importing a users file is logged, but editing one user is not.

Change: In an RBAC gateway, privilege and credential changes are the events an operator most needs to reconstruct, and they are exactly the ones not recorded. Importing a users file is logged, but editing one user is not.

#### CR-0044 [minor] [new] At the default WARN level the gateway logs none of its effective configuration, not even its version, and the access list is never logged at any level

Location: go-web-proxy/main.go:141, go-web-proxy/main.go:335-343, go-web-proxy/main.go:357, go-web-proxy/main.go:378, go-web-proxy/main.go:428, go-web-proxy/managed_routing.go:78-79
Confidence: verified
Evidence:

    The default is `logLevel: slog.LevelWarn` (main.go:141), but every startup summary is logged at
    Info: `logger.Info("gateway starting", "version", version, "config_file", ..., "hosted", ...,
    "cert_file", ..., "trust_dir", ..., "insecure_skip_verify", ...)` (335-343),
    `logger.Info("connection modes", ...)` (378), `logger.Info("listening", "addr", ...)` (428) and
    `logger.Info("provisioned mode enabled", "users", ..., "session_idle", ...)`
    (managed_routing.go:78). None of them names the log level, key_file, store key path,
    access.allow, access.trustedProxies or the login limits. main.go:357
    `logger.Warn("SSL_INSECURE_SKIP_VERIFY=true -- upstream certificates will NOT be validated")`
    names the env var, although config.yaml's tls.insecureSkipVerify is what decides
    (configfile.go:195 maps the env var only as the seed, and the settings page can set the key).
    Compare validateConnModes, which names both sources (main.go:216). On a default deployment an
    operator sees a denied client or the wrong mode, and the log has no line saying which version,
    mode, allow list or trusted proxies are in force.

Why it matters: A misconfiguration cannot be diagnosed from the default log alone. The startup lines are emitted only once, so the operator has to raise the level and restart just to see what the gateway is running with.

Change: A misconfiguration cannot be diagnosed from the default log alone. The startup lines are emitted only once, so the operator has to raise the level and restart just to see what the gateway is running with.

#### CR-0045 [minor] [new] WARN serves as the 'always show' audit level for routine successes, while equivalent security events stay at INFO

Location: go-web-proxy/backup_api.go:112, go-web-proxy/backup_api.go:140, go-web-proxy/backup_api.go:152, go-web-proxy/backup_api.go:167, go-web-proxy/backup_api.go:191, go-web-proxy/backup.go:622, go-web-proxy/settings.go:110, go-web-proxy/pages.go:194, go-web-proxy/pages.go:263, go-web-proxy/dial.go:77, go-web-proxy/smf.go:148
Confidence: verified
Evidence:

    Successful, expected operations are logged at Warn: `h.logger.Warn("backup downloaded", "by",
    ...)` (backup_api.go:112), `Warn("backup schedule saved", ...)` (140), `Warn("configuration
    exported", ...)` (191), `b.logger.Warn("backup written", ...)` (backup.go:622) and
    `Warn("gateway settings saved", ...)` (settings.go:110). Meanwhile these stay at INFO and vanish
    at the default WARN: `p.logger.Info("signed in", "user", user, "client", ...)` (pages.go:194),
    `Info("password changed", ...)` (263), `d.logger.Info("dial issued", ...)` (dial.go:77, the
    gateway handing a broker password to a browser) and `log.Info("smf socket opened")`
    (smf.go:148). The level is encoding 'should this survive the default filter', not severity.

Why it matters: Filtering for warnings returns routine backups and admin clicks mixed in with real problems, while sign-ins and credential dials, which an incident review needs, are not recorded by default. An explicit audit attribute or a separate audit logger would separate the two concerns.

Change: Filtering for warnings returns routine backups and admin clicks mixed in with real problems, while sign-ins and credential dials, which an incident review needs, are not recorded by default. An explicit audit attribute or a separate audit logger would separate the two concerns.

#### CR-0046 [minor] [new] Gateway refusal logging differs across equivalent paths: some denials and rate limits are silent, and some error lines omit the user and client

Location: go-web-proxy/relay.go:134-142, go-web-proxy/dial.go:66-75, go-web-proxy/smf.go:90-99, go-web-proxy/pages.go:177-187, go-web-proxy/pages.go:210-243, go-web-proxy/managed.go:190-193
Confidence: verified
Evidence:

    The SEMP relay's entitlement miss and its per-user in-flight limit answer without logging:
    `target, ok := rl.store.sempTarget(user, p.broker); if !ok { writeError(w, http.StatusNotFound,
    "not_found"); return }` and `if !rl.inFlight.acquire(user) { writeRateLimited(w, time.Second);
    return }` (relay.go:133-141). The same refusals on dial and SMF are logged: `d.logger.Info("dial
    denied", ...)` and `d.logger.Warn("dial rate limited", ...)` (dial.go:68, 73),
    `g.logger.Info("smf denied", ...)` and `Warn("smf rate limited", ...)` (smf.go:92, 97). A failed
    sign-in logs `p.logger.Warn("sign-in failed", "user", userKey(user), "client", ...)`
    (pages.go:184). A wrong current password on the password page, which pages.go:211-212 says
    'counts as a failed sign-in', only calls `p.throttle.loginFailed(...)` and re-renders the page
    (240-243). `p.logger.Error("sign-in check failed", "err", err)` (178) and `"password check
    failed"` (238) carry no user or client. `h.logger.Error("managed: "+op+" failed", "err", err)`
    (managed.go:191) puts the operation into the message string instead of an attribute and names no
    actor or target.

    Second reading (partly): Relay sempTarget miss and inFlight refusal (relay.go:134-142) are
    unlogged while dial.go:68/73 and smf.go:92/97 log them; but the sibling 'denied' lines are INFO,
    hidden at the default warn too. The relay limit is a 16-concurrent cap (relay.go:32), not the
    per-user rate limiter dial uses. Change-password guessing 'leaves no trace' is refuted for
    sustained guessing: pages.go:241 calls loginFailed and recordFailure logs a WARN naming the user
    at the 5th failure (throttle.go:158-160); the guesser also needs a live session. Correct:
    pages.go:178 and :238 omit user/client; managed.go:191 puts op in the message.

Why it matters: Someone probing brokers through the SEMP relay, or guessing a password on the change-password form, leaves no trace, while the same behaviour on the sibling path does. Error lines cannot be tied to an account.

Change: Someone probing brokers through the SEMP relay, or guessing a password on the change-password form, leaves no trace, while the same behaviour on the sibling path does.

#### CR-0047 [minor] [new] The access log names the TCP peer instead of the resolved client, and records hijacked sockets as status 200 with 0 bytes

Location: go-web-proxy/proxy.go:433-452, go-web-proxy/main.go:391-395, go-web-proxy/access.go:31-36, go-web-proxy/access.go:63-67, go-web-proxy/smf.go:139-150
Confidence: verified
Evidence:

    The pipeline is `accessLog(withClient(lv, clientACL(lv, root, logger)), logger)` (main.go:395).
    accessLog sits outside withClient, which puts the resolved address only on the derived request
    it passes inward (access.go:33-34). So the access log can only record `"remote", r.RemoteAddr`
    (proxy.go:446), while the ACL line records the resolved `"client", client` (access.go:67).
    Behind a trusted proxy, every access-log line names the proxy and cannot be joined to the ACL,
    throttle or sign-in lines, which use the X-Forwarded-For client. Separately, the recorder starts
    at `status: 200` (proxy.go:441) and only changes in WriteHeader. The SMF gate hijacks the
    connection and writes the 101 itself (`http.NewResponseController(w).Hijack()` ...
    `writeSwitch(brw.Writer, resp.Header)`, smf.go:139-146). A whole socket session is therefore
    logged as `status=200 bytes=0`, with a duration equal to the socket's lifetime. The Direct
    relay's WebSocket upgrade goes through httputil.ReverseProxy's hijack in the same way.

Why it matters: Behind a reverse proxy the access log cannot attribute requests to clients, and WebSocket sessions look like tiny successful GETs.

Change: Behind a reverse proxy the access log cannot attribute requests to clients, and WebSocket sessions look like tiny successful GETs.

#### CR-0048 [minor] [new] The documented health probe (/hosted) answers 200 while the app bundle cannot be served, and a missing index file returns 404 without a log line

Location: go-web-proxy/proxy.go:46-60, go-web-proxy/proxy.go:121-145, go-web-proxy/proxy.go:177-185, go-web-proxy/proxy.go:89-95, docs/deployment.md:174
Confidence: verified
Evidence:

    docs/deployment.md:174: 'Probe https://<host>:9443/hosted from outside (200 while HOSTED=true)'.
    hostedHandler (proxy.go:46-60) writes 200 based on live settings alone. newPWAHandler only
    checks that appRoot is a non-empty directory (123-138). When that check fails it logs Warn and
    sets usable=false, after which every page is a bare 404 (143-145), yet /hosted still returns
    200. If the directory is fine but the mode's bundle (index.html or provisioned.html) is missing,
    `serveIndex` calls `http.Error(w, name+" not found", http.StatusNotFound)` (178-181) and logs
    nothing. The admin route logs `h.logger.Warn("admin app requested but not deployed", ...)` (93)
    for exactly this packaging fault. With hosted: false, /hosted is itself a 404 (47-49), so no 200
    probe exists at all.

    Second reading (partly): hostedHandler (46-60) answers 200 from settings alone; serveIndex
    (177-185) 404s with no log, unlike adminHandler (89-95). A bad appRoot directory does log a
    startup Warn (125/129/134). 'With hosted:false no 200 probe exists' is wrong: '/' still serves
    the bundle with 200 (164-166); deployment.md:174 scopes /hosted to HOSTED=true. appRoot fixed at
    main.go:50; deployment.md:292 invites mounting a custom build, which makes the missing-index
    case realistic.

Why it matters: A packaging error in the image, the very fault adminHandler anticipates, leaves an orchestrator reporting the gateway healthy while every user gets a 404, and the default log stays silent.

Change: A packaging error in the image, the very fault adminHandler anticipates, leaves an orchestrator reporting the gateway healthy while every user gets a 404, and the default log stays silent.

#### CR-0049 [minor] [new] The sign-in and unauthenticated-request throttles fail closed silently when their tracking tables are full

Location: go-web-proxy/throttle.go:97-105, go-web-proxy/throttle.go:109-119, go-web-proxy/throttle.go:140-143, go-web-proxy/throttle.go:183-192
Confidence: verified
Evidence:

    Three paths refuse without logging. In failureWait, `if !hasRoom(t, m, now) { return
    t.lim.backoff }` (101-103) refuses every untracked user or client once the table is full.
    recordFailure has `if !hasRoom(t, m, now) { return // loginWait already refuses untracked keys
    while full }` (141-143). allowUnauthenticated has `if len(t.buckets) >= t.maxTracked { return
    false, time.Minute }` (188-190). The only throttle log lines are the first-block warn (159) and
    the first-limited warn (206), and both need a key that is already tracked.

    Second reading (partly): All three fail-closed branches unlogged (throttle.go:101-103, 141-143,
    190-191), pinned by TestThrottle_FullFailureTableFailsClosed /
    TestThrottle_FullBucketTableFailsClosed with quietLogger. Tables hold 10_000 keys
    (throttle.go:14). Overstated for the failure tables: filling one takes ~10k failed sign-ins,
    each logging WARN 'sign-in failed' (pages.go:184); only the saturation itself goes unnamed. The
    unauthenticated bucket table can fill silently (in-budget requests log only at INFO).

Why it matters: Under a distributed flood, legitimate users are refused sign-in with 'try again later' and nothing in the log explains the saturation. The operator cannot tell a full table from a broken login.

Change: Under a distributed flood, legitimate users are refused sign-in with 'try again later' and nothing in the log explains the saturation. The operator cannot tell a full table from a broken login.

#### CR-0050 [minor] [new] Failed SEMP list calls drop the HTTP status and the gateway's error code, and non-OK SEMP responses are rendered four different ways

Location: src/core/services/semp-discovery.ts:58-65, src/modules/queue-subscription-explorer/service.ts:62-65, src/core/services/semp-client.ts:71-81, src/core/services/semp-client.ts:134-146, src/modules/queue-copy/service-verify.ts:173, src/modules/queue-discovery/module.ts:89-92
Confidence: verified
Evidence:

    semp-discovery yields `{ ok: false, error: res.statusText

    defaultError }` (60), and QSE yields `{ ok: false, error: res.statusText

    'Error fetching subscriptions' }` (63). The gateway serves through srv.ServeTLS, which
    negotiates HTTP/2, and over HTTP/2 fetch's statusText is always ''. Users therefore see 'Error
    fetching VPNs' or 'Error fetching Queues' with no status. Even over HTTP/1.1 they would get
    'Forbidden' rather than the relay's code. semp-client already does this correctly:
    `relayErrorText(res)` turns the code into text through `managedErrorMessage(...)` (71-81), and a
    broker error becomes `${res.status} ${res.statusText}` (140). service-verify uses a third form,
    `SEMP v1 returned ${res.status} ${res.statusText

    ''}` (173). queue-discovery then shows the bare default in an input placeholder and logs
    `logger.error('Failed to fetch VPNs', page.error)` (90), with no VPN or broker identifier.

Why it matters: In Provisioned mode, a relay refusal (read_only, upstream_auth, upstream_unavailable) on the discovery and subscription pages shows up as a generic 'Error fetching ...' with nothing to act on, although the code that explains it exists one file away.

Change: In Provisioned mode, a relay refusal (read_only, upstream_auth, upstream_unavailable) on the discovery and subscription pages shows up as a generic 'Error fetching ...' with nothing to act on, although the code that explains it exists one file away.

#### CR-0051 [minor] [new] SDK error text bypasses solaceErrorText in the queue browser and in parts of queue-copy and the publisher

Location: src/modules/queue-browser/service-events.ts:87-110, src/modules/queue-browser/service.ts:75-81, src/modules/queue-browser/ui-forward.js:145-149, src/modules/queue-copy/service-copy.ts:490, src/modules/queue-copy/service-verify.ts:485-488, src/core/services/solace-publisher.ts:249-256
Confidence: verified
Evidence:

    The PR checklist (docs/contributing.md:412) says: 'SDK/exception text goes through
    solaceErrorText(e, fallback) (core/utils.ts) -- the SDK splits the reason across .message ...
    and .infoStr ...; reading one loses it'. utils.ts:311-312 adds: 'never stringify the object
    itself, which is how [object Object] reaches a user'. These sites still read the fields
    directly. service-events.ts:91 and :95 use `Connection Failed: ${err.message

    'Unknown Error'}`. service-events.ts:108 uses `Browser connection error: ${err.message

    err}`, which stringifies the event when .message is empty. service.ts:80 uses `Error creating
    queue browser: ${e.message}`, which prints 'undefined' for a non-Error throw. ui-forward.js:147
    uses `${err.message

    err}`. service-copy.ts:490 uses `${e?.message}`. service-verify.ts:487 uses `e?.message ?? ...`
    in a file that already imports solaceErrorText (used at 434 and 444). solace-publisher.ts:252
    uses `e?.message ?? 'Send failed'`.

    Second reading (partly): The checklist item exists (contributing.md:412) and most cited sites
    bypass solaceErrorText. Errors: (1) ui-forward.js:147 is not an SDK path (onForwardFailure is
    only called with literal strings, ui-events.ts:30, :37); (2) service-copy.ts:490 is a
    logger.warn whose comment at :488-489 accepts 'undefined' and never reaches the user; (3) the
    '[object Object]' risk at service-events.ts:108 does not apply (OperationError extends Error, so
    `${err}` renders 'OperationError'); the 'undefined' at service.ts:80 needs a non-Error throw.
    The real issue is inconsistency, worst inside service-verify.ts:488 which already imports the
    helper.

Why it matters: The helper exists because the same broker failure showed a reason in one module and a generic fallback in another. These sites reintroduce that inconsistency, and two of them can show '[object Object]' or 'undefined' to the user.

Change: These sites reintroduce that inconsistency, and two of them can show '[object Object]' or 'undefined' to the user.

#### CR-0052 [minor] [new] Error and warning toasts disappear after the 1-second default, and for several failures the toast is the only signal

Location: src/core/toast.ts:25-58, src/modules/connection-management/module.ts:240-245, src/modules/user-management/module.ts:298-309, src/modules/connections/module.ts:249-251, src/modules/connections/module.ts:399, src/core/toast.ts:25-31
Confidence: verified
Evidence:

    `const DEFAULT_DURATION_MS = 1000;` (toast.ts:25) applies to every toast type unless the caller
    passes a duration, and only the sign-out toasts do (SIGNED_OUT_TOAST_MS, managed-api.ts:104).
    Several failures appear only in such a toast. removeConn calls `reportManagedFailure(res,
    eventBus, msg => showToast(msg, 'error'))` (connection-management/module.ts:244), and removeUser
    does the same (user-management/module.ts:308), so 'At least one administrator must remain.' is
    visible for one second and nowhere else. connections/module.ts:250 shows a warning of about 110
    characters for one second during install. module.ts:399 shows 'Failed to save configuration --
    storage unavailable' for one second.

    Also (a2): toast.ts:25 `const DEFAULT_DURATION_MS = 1000;`. Callers that pass no duration
    include module.ts:250 (the TLS scheme warning: '... without the gateway, a page served over
    https reaches brokers only over TLS. Check the port.') and module.ts:399 `showToast('Failed to
    save configuration -- storage unavailable', 'error');`.

Why it matters: Users can miss the only explanation of a refused delete or a moved port. Error and warning toasts need a longer default, should stay until dismissed, or should go to an inline error element as the house rule asks.

Change: Users can miss the only explanation of a refused delete or a moved port. Error and warning toasts need a longer default, should stay until dismissed, or should go to an inline error element as the house rule asks.

#### CR-0053 [minor] [new] Several failure paths swallow the cause without a developer log, or fall back silently

Location: src/core/services/managed-api.ts:33-43, src/modules/queue-browser/ui-events.ts:83-94, src/core/hosted.ts:52-73, src/modules/connections/config.js:46-64, src/modules/connections/module.ts:403-410, src/modules/queue-browser/service-events.ts:150-153, src/modules/queue-browser/service-events.ts:206-222
Confidence: verified
Evidence:

    managed-api has `} catch { return { ok: false, status: 0, code: 'network' }; }` (41-43). It
    drops the exception plus the method and path for every admin and dial call, and the file has no
    logger import. The queue-browser forward has `.catch(() => { ui.updateForwardItemStatus(...,
    'FAILED', 'Unable to send message.'); })` (ui-events.ts:92-94), which throws away the 'Not
    connected to Solace.' error from service.ts:121 without logging it. probeDeployment returns
    `notHosted` with no log on a non-2xx, malformed JSON or network error (hosted.ts:56, 64-66,
    70-72). So a Provisioned gateway whose /hosted is blocked (for example by the access list or a
    proxy) silently becomes a Direct-only app. config.js deobfuscate has `} catch { return null; }`
    (62-64), so corrupt saved settings look like 'nothing saved' and the Load button does nothing
    (`if (c) { ... }`, module.ts:405-409). In service-events, `catch (e) { contentStr = '[Binary
    Data Error]'; }` (153) and the appProperties `} catch (e) { return {}; }` (221) drop data
    without a warn, unlike the neighbouring type and timestamp catches, which call
    `logger.warn(...)` (127, 183).

    Second reading (partly): Holds: managed-api.ts:41-43 drops the exception, method and path (no
    logger); ui-events.ts:92-94 swallows the 'Not connected' throw from service.ts:125;
    service-events.ts:221 drops appProperties with no warn. Weaker: config.js:24-26 documents that
    corrupt/old values are treated as missing on purpose and JSON.parse failures are logged
    (:73-74); service-events.ts:152-153 is effectively unreachable (a non-fatal TextDecoder never
    throws on a Uint8Array/ArrayBuffer); hosted.ts:45-50 documents the fallback as intended and
    module.managed.ts:74 / module.ts:710 log the resulting mode (cause lost).

Why it matters: Each of these turns a diagnosable failure into silence or a generic message. A `logger.warn` with the identifier (path, queue, message id) at each site would keep the UI behaviour and leave the cause in the console.

Change: Each of these turns a diagnosable failure into silence or a generic message. A `logger.warn` with the identifier (path, queue, message id) at each site would keep the UI behaviour and leave the cause in the console.

#### CR-0054 [minor] [new] Open-in-Browser and VPN-switch timeouts end with no signal to the user

Location: src/modules/connections/module.ts:604-642, src/modules/connections/module.ts:666-684, src/modules/connections/managed-panel.ts:415-446, src/modules/connections/managed-panel.ts:461-483
Confidence: verified
Evidence:

    waitForConnect's 30-second timer only removes listeners: `const timer = setTimeout(cleanup,
    30_000);` (module.ts:639, managed-panel.ts:443), with no log and no UI. The disconnect wait is
    `disconnectTimer = setTimeout(() => { eventBus.off(...); opInProgress = false;
    logger.warn('[Connections] Disconnect timed out (10s); aborting VPN switch'); }, 10_000);`
    (module.ts:678-682, managed-panel.ts:478-482). A user who confirmed 'Switch to "<vpn>"?' is left
    on the connections page with nothing happening. The managed panel also returns silently on a
    duplicate request (`if (opInProgress) return;`, managed-panel.ts:419), where the Direct form
    logs a warn (module.ts:608-610).

    Second reading (partly): Quoted lines match (module.ts:639, 678-682; managed-panel.ts:443,
    478-482; silent duplicate at 419 vs module.ts:608-610). Correction: on the managed path the user
    is NOT 'left on the connections page' (the panel never navigates on a switch), they stay on the
    calling page. On the Direct path an SDK connect failure is shown by the form (module.ts:146,
    154), so the 30 s timer is silent only when the SDK neither connects nor fails within 30 s
    (connectRetries x connectTimeout > 30 s); a later success then never calls finish(). Strengthens
    the finding: CONNECT_FAILED_ERROR calls onConnectFailed and cleanup but not onDisconnected
    (solace-client.ts:201-205), so after a failed reconnect opInProgress stays true for 30 s and on
    the managed side every retry in that window is dropped without a word (L419).

Why it matters: A stalled broker leaves the user with no explanation. Only someone with DevTools open at WARN learns that the switch was aborted.

Change: A stalled broker leaves the user with no explanation. Only someone with DevTools open at WARN learns that the switch was aborted.

#### CR-0055 [minor] [new] Bulk delete reports a partial failure as full success, and its failure text sends the user to the console

Location: src/modules/queue-browser/service.ts:166-208, src/modules/queue-browser/ui-events.ts:335-349
Confidence: verified
Evidence:

    deleteMessages counts removedIds and handles each per-id failure only with
    `logger.error(`[Delete] Remove API call failed for ${idStr}`, ex)` (service.ts:187-188). It
    returns `ok: removedIds.size > 0` and sets an error only when nothing was removed (203-207). If
    3 of 5 deletes succeed, handleBulkDelete shows `window.alert(`Successfully deleted
    ${result.count} message(s).`)` (ui-events.ts:345) and the 2 failures are never mentioned. If all
    fail, the user sees 'No messages were deleted. Check console for errors.' (service.ts:206),
    which names neither the messages nor the broker's reason.

    Second reading (partly): ok is removedIds.size > 0 (service.ts:205), failures only logged
    (:187-188), total failure says 'Check console for errors.' (:207). Overstated: the success alert
    shows the real count (ui-events.ts:345, 'Successfully deleted 3' when 5 were selected) and
    failed rows stay in the table; a partial synchronous failure is unlikely (the loop :174-194 is
    synchronous and the throw conditions apply to every id alike). The bigger unreported gap:
    'success' only means the ack was sent; broker-side failures are never detected (see the 64-bit
    ID finding). Overlaps the alert() finding.

Why it matters: Messages the user believes are deleted are still on the queue. They stay in the table, but nothing says why, and the failure message gives a non-developer nothing to act on.

Change: Messages the user believes are deleted are still on the queue. They stay in the table, but nothing says why, and the failure message gives a non-developer nothing to act on.

#### CR-0056 [nit] [new] Browser log lines have no consistent module tag and often omit the broker, VPN or queue they concern

Location: src/core/services/solace-client.ts:196-209, src/core/services/semp-client.ts:107, src/core/services/semp-client.ts:134-148, src/modules/queue-browser/service.ts:39-49, src/modules/queue-browser/service.ts:97-105, src/modules/queue-discovery/module.ts:73-92
Confidence: verified
Evidence:

    solace-client logs 'Solace Session UP', 'Connection Failed:' and 'Disconnected' (197, 202, 208)
    with no URL or VPN, although the 'Creating Session:' line just above carries both. semp-client
    logs 'SEMP Connection Established', 'SEMP Auth Failed', `SEMP Error: ${res.status}` and 'SEMP
    Network Error' (107, 135, 138, 148) with no baseUrl. Within one queue-discovery function,
    'Fetching VPNs...' and 'Failed to fetch VPNs' (81, 90) are untagged while '[Discovery] Using
    cached VPN list' (75) is tagged. queue-browser mixes 'Creating Queue Browser for [q]' (untagged,
    service.ts:39), '[Limit]' (48), '[Browser]' (99), '[queue-browser]' (104), '[Delete]' (166) and
    `[${queueName}]` (service-events.ts:66).

Why it matters: With a primary session and a queue-copy destination session both open, 'Disconnected' or 'SEMP Auth Failed' cannot be attributed to a connection, and filtering DevTools by module tag misses half of a module's lines.

Change: With a primary session and a queue-copy destination session both open, 'Disconnected' or 'SEMP Auth Failed' cannot be attributed to a connection, and filtering DevTools by module tag misses half of a module's lines.

### conventions

#### CR-0079 [minor] [new] README and deployment.md quick starts give operators commands that fail or skip a required step (no SMU_VERSION, wrong file path, no backup dir, `:latest`)

Location: README.md:12-13, README.md:38-41, README.md:45-51, docs/deployment.md:46, docs/deployment.md:121-125, docs/provisioned-mode.md:57, docker/compose.gateway.yaml:19, docker/compose.provisioned.yaml:10-13,69, .github/workflows/tag.yml:82,508-540
Confidence: verified
Evidence:

    README.md:12 Start = `docker compose -f compose.gateway.yaml up -d` and :13 `docker compose -f
    compose.provisioned.yaml up -d`. deployment.md:46 repeats both. compose.gateway.yaml:19 `image:
    ...:${SMU_VERSION:?set SMU_VERSION to a release, e.g. 3.6.0}`, so without SMU_VERSION compose
    aborts. The files live in docker/, and no README or deployment step says to cd there or how to
    fetch them. provisioned-mode.md:57 says "Download docker/compose.provisioned.yaml from the
    release you are deploying", but Release assets are only RELEASE_BUNDLES (tag.yml:82: html
    files), so the file is not on the Release page. README.md:47-50 (Provisioned) says only "Put the
    first administrator's password in a file named `admin-password`, then: SMU_VERSION=<release>
    docker compose ...". It omits compose.provisioned.yaml step 2 ("mkdir -p backup && chmod 700
    backup && sudo chown 65532 backup ... left to Docker, it would be root's and take no backups"),
    which the `- ./backup:/backup` bind (compose.provisioned.yaml:69) requires. README.md:40
    `ghcr.io/solacelabs/solace-msg-utility:latest` contradicts compose.gateway.yaml:9-10 and
    deployment.md:286 ("pin a release, never `latest`").

    Second reading (partly): Confirmed: README.md:12-13 and deployment.md:44 omit SMU_VERSION and
    the docker/ path; README.md:47-50 skips the backup-directory step
    (compose.provisioned.yaml:10-12). Overstated: 'silently takes no backups' -- dirProblem
    (backup.go:725-741) reports 'not writable' on the Backup & Restore page
    (backup/module.ts:169-170) and a failed run logs at backup.go:619; the missing SMU_VERSION fails
    loudly with compose's own instruction (compose.gateway.yaml:19); README.md:40 :latest is a
    try-out and :43 sends production to a pinned release; GitHub's automatic source archives on each
    Release contain docker/. Doc gaps that fail visibly, not wrong commands.

    Second reading (partly), blocker bar: Not a blocker. Every gap fails loudly with a message that
    says what to do, and no data is lost because backups only start once a schedule is set on the
    very page that shows the directory problem: Confirmed: README.md:12-13 and deployment.md:46
    leave out SMU_VERSION; compose.gateway.yaml:19 / compose.provisioned.yaml:35 use
    `${SMU_VERSION:?set SMU_VERSION to a release, e.g. 3.6.0}`, so compose stops with a message that
    tells the operator the fix. README.md:47-51 leaves out the backup directory, the chmod/chown on
    admin-password and the schedule step (compose.provisioned.yaml:7-18); the full steps are at
    provisioned-mode.md:57-72 and README.md:53 links there. 'Backups skipped silently' refuted:
    dirProblem (backup.go:724-741) reports '/backup is not writable (the gateway runs as uid
    65532...)' (keyfile.go:87-91), shown at backup/module.ts:169-170; failed runs logged at Error
    (backup.go:619) and recorded as the last run. The compose files are not Release assets
    (tag.yml:82), but GitHub's automatic source archives contain docker/ and provisioned-mode.md:57
    links the repo path. README.md:40 :latest is a try-it command qualified at :42 and
    deployment.md:139. Wording inconsistency, not a wrong command.

Why it matters: The README and deployment summary tables give commands that stop immediately (compose refuses without SMU_VERSION, with its own instruction), name the compose files without their docker/ path, and the README's Provisioned quick start omits the backup-directory and admin-password permission steps the compose file lists (the Backup & Restore page does report the unwritable directory, so backups are not lost silently). README.md:40 shows :latest as a try-out and sends production to a pinned release two lines later.

Suggested patch (not applied):

```diff
--- a/README.md
+++ b/README.md
@@ -11,4 +11,4 @@
 | **Standalone** | The app as a single HTML file, from GitHub Pages or any web server. Your browser connects to the broker. | each user types them | open the page | `demo.html` |
-| **Gateway** | The app served by the gateway container, which connects to your brokers for it. Browsers reach and trust only the gateway. | each user types them | `docker compose -f compose.gateway.yaml up -d` | `demo.html` |
-| **Provisioned** | Gateway mode plus sign-in. An administrator stores the broker credentials and grants each user brokers, VPNs and queues. | stored on the gateway; users sign in | `docker compose -f compose.provisioned.yaml up -d` | `provisioned-demo.html` |
+| **Gateway** | The app served by the gateway container, which connects to your brokers for it. Browsers reach and trust only the gateway. | each user types them | `SMU_VERSION=<release> docker compose -f docker/compose.gateway.yaml up -d` | `demo.html` |
+| **Provisioned** | Gateway mode plus sign-in. An administrator stores the broker credentials and grants each user brokers, VPNs and queues. | stored on the gateway; users sign in | `SMU_VERSION=<release> docker compose -f docker/compose.provisioned.yaml up -d` (after the setup below) | `provisioned-demo.html` |
 
@@ -38,4 +38,4 @@
 ```bash
 docker run --rm -p 9443:9443 -v solace-tls:/tls \
-  ghcr.io/solacelabs/solace-msg-utility:latest
+  ghcr.io/solacelabs/solace-msg-utility:<release>
 ```
@@ -47,5 +47,8 @@
-Put the first administrator's password in a file named `admin-password`, then:
+From a checkout of the release tag, put the first administrator's password in `docker/admin-password` and make `docker/backup`, both for the gateway's UID only (left to Docker, the backup directory would be root's and take no backups):
 
 ```bash
+cd docker
+chmod 400 admin-password && sudo chown 65532 admin-password
+mkdir -p backup && chmod 700 backup && sudo chown 65532 backup
 SMU_VERSION=<release> docker compose -f compose.provisioned.yaml up -d
 ```
```

#### CR-0087 [minor] [new] Per-machine graphify artifacts and a stale nested graph are tracked in git

Location: graphify-out/.graphify_python, graphify-out/.graphify_step_ast.py, go-web-proxy/graphify-out/.graphify_root, .gitignore:50-55
Confidence: verified
Evidence:

    `git ls-files` includes graphify-out/.graphify_python, whose content is an absolute Windows
    interpreter path under a user profile, with a UTF-8 BOM. graphify-out/.graphify_step_ast.py also
    has a BOM.
    go-web-proxy/graphify-out/{graph.json,graph.html,GRAPH_REPORT.md,manifest.json,.graphify_root}
    is tracked too: last updated 2d9003e (2026-05-18), and .graphify_root holds an absolute Windows
    path (`C:\local\Projects\SolaceMessageUtility\go-web-proxy`). The project's graph is the root
    graphify-out/ (CLAUDE.md). .gitignore:50-55 ignores "regenerated caches, dated snapshots and
    per-machine stamps" but not these.

Why it matters: A local filesystem path is committed, and a six-month-old second graph can mislead a graph query that walks into go-web-proxy/.

Suggested patch (not applied):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -53,4 +53,6 @@
 */graphify-out/cache/
 **/cache/last_query_stamp
 graphify-out/*.sig
+graphify-out/.graphify_python
+go-web-proxy/graphify-out/
 
```

#### CR-0088 [minor] [new] Stale developer docs: contributing.md describes Go build-tag test variants that no longer exist; developer-guide.md says priority is set in src/registry.ts

Location: docs/contributing.md:394, docs/developer-guide.md:248, src/registry.ts:27, scripts/dev.sh:169
Confidence: verified
Evidence:

    contributing.md:394 `./scripts/dev.sh test # Web + Go, both build-tag variants`, but no
    go-web-proxy/*.go file carries `//go:build`, and dev.sh:169 runs `go test -count=1 ./...` once.
    developer-guide.md:248 says priority is "set in `src/registry.ts` alongside the module
    reference", but src/registry.ts:27 `Object.entries(ACTIVE_MODULES).map(([id, priority])` reads
    it from the variant manifest. The same guide's :384 says "priority ... is set in the variant
    manifest". Rule: "Don't let docs drift."

Why it matters: A new contributor gets contradictory instructions about where module ordering lives and what `test` covers.

Suggested patch (not applied):

```diff
--- a/docs/contributing.md
+++ b/docs/contributing.md
@@ -393,3 +393,3 @@
 ```bash
-./scripts/dev.sh test  # Web + Go, both build-tag variants
+./scripts/dev.sh test  # Web (without tests/mock-broker/, which `mock` runs) + Go
 ./scripts/dev.sh cov   # With coverage report (text + HTML in coverage/)
--- a/docs/developer-guide.md
+++ b/docs/developer-guide.md
@@ -248 +248 @@
-Priority (install order + sidebar position) is **not** a module property -- it's set in `src/registry.ts` alongside the module reference, so the full ordering is visible in one file. The kernel takes `RegisteredModule[]` (`{ module, priority }` tuples) and sorts them descending before calling `install()`.
+Priority (install order + sidebar position) is **not** a module property -- it's the value beside the module id in the variant manifest (`src/variants/<name>.ts`), which `src/registry.ts` reads, so a variant's full ordering is visible in one file. The kernel takes `RegisteredModule[]` (`{ module, priority }` tuples) and sorts them descending before calling `install()`.
```

#### CR-0089 [minor] [new] test-report.md's 'Current files in the test tree' list is stale after the backup, icons, download and access-test suites were added

Location: docs/test-report.md:167, docs/test-report.md:946-970
Confidence: verified
Evidence:

    The last stated total is :167 "web 95 files / 2170 tests". `git ls-files tests | grep -c
    '\.test\.ts$'` = 103. Since then 8bec504 added tests/modules/backup/{module,service}.test.ts,
    tests/core/download.test.ts and tests/mock-broker/gateway/backup.test.ts, and fb31ea7 added
    tests/core/icons.test.ts and tests/modules/user-management/access-test.test.ts. The ledger
    entries at :202-220 mention them but give no totals. The list at :948-967 has no backup/ line,
    lists user-management as only `module.test.ts`, `service.test.ts`, and its core/ line omits
    download and icons. CLAUDE.md: update test-report "when a test file is added/removed, the total
    count shifts noticeably".

    Second reading (partly): Refuted: '95 files / 2170 tests' at :167 is not the last stated total
    and the ledger gives totals: test-report.md:204 says 'Web 99 files / 2246 tests', :212 and :225
    say 'Web 103 files / ... 2338 tests', matching git ls-files tests | grep -c .test.ts = 103.
    Confirmed: the 'Current files in the test tree' list (:950-970) is stale (no backup/ line;
    user-management lists only module/service; core/ omits download and icons; mock-broker omits
    gateway/backup.test.ts).

Why it matters: The report's inventory no longer matches the tree (the totals in the ledger entries are current: 103 files / 2338 tests at :212, :225).

Change: Add backup/, user-management/access-test.test.ts, core/download.test.ts, core/icons.test.ts and mock-broker/gateway/backup.test.ts to the list at test-report.md:950-970.

#### CR-0091 [minor] [new] `any` used outside the Solace SDK boundary in core (managed-semp-filter, event-bus, queue-picker, semp-discovery, semp-client)

Location: src/core/managed-semp-filter.ts:85-86, src/core/event-bus.ts:17-19, src/core/components/queue-picker/index.ts:206, src/core/components/queue-picker/index.ts:246, src/core/services/semp-discovery.ts:38, src/core/services/semp-discovery.ts:63-82, src/core/services/semp-client.ts:147
Confidence: verified
Evidence:

    contributing.md:155 "No `any` unless interfacing with the Solace SDK (`declare const solace:
    any`)" and the :410 checklist "No new `any` types (except Solace SDK interface)". fb31ea7 added
    managed-semp-filter.ts:86 `json.data.filter((v: any) => isListedVpn(managed, v?.msgVpnName))`
    beside :85 `(q: any)`. `json.data` is a SEMP JSON body already typed `unknown[]` (:72), not the
    SDK. Older cases: event-bus.ts:17,19 `any[]`; queue-picker/index.ts:206,246 `catch (err: any)`;
    semp-discovery.ts:38 `mapper: (item: any)`, :63 `catch (e: any)`, :74/:82 `(v: any)`/`(q: any)`.

    Second reading (partly): All `any` uses present (managed-semp-filter.ts:85-86,
    event-bus.ts:17/:19, queue-picker/index.ts:206/:246, semp-discovery.ts:38/:63/:74/:82); misses
    semp-client.ts:147 catch (err: any). contributing.md:155 and :410 quoted correctly. The claim
    that fb31ea7 added a new `any` is wrong: git show fb31ea7 shows the old line was already
    `json.data.filter((v: any) => ...`; the commit only rewrote its body.

Why it matters: The rule is in the PR checklist; these are pre-existing uses (fb31ea7 only rewrote the body of an existing `(v: any)`), and narrowing `unknown` costs one type guard each.

Change: Replace each `any` with `unknown` plus a type guard (SEMP JSON rows) or with the specific event/error type.

#### CR-0090 [nit] [new] Test titles and comments cite improvement-plan item IDs and plan scenario numbers (COV-5/6/10/11/12, scenario #n)

Location: tests/core/kernel.test.ts:66, tests/core/components/queue-picker/picker.test.ts:686, tests/core/components/queue-picker/picker.test.ts:717, tests/modules/connections/module.test.ts:153, tests/modules/queue-browser/module.test.ts:197, tests/modules/queue-subscription-explorer/parse.test.ts:127, tests/integration/module-events.test.ts:133, tests/integration/module-events.test.ts:172, tests/integration/module-events.test.ts:202, tests/integration/module-events.test.ts:225
Confidence: verified
Evidence:

    kernel.test.ts:66 `it('applies ?logLevel= URL override before any kernel logging (closes
    COV-6)'`. picker.test.ts:717 `... (closes COV-12)'` and :686 `// Sibling of the queue-list
    COV-12 test below`. connections/module.test.ts:153 `// Closes COV-5:`.
    queue-browser/module.test.ts:197 `// Closes COV-10:`. parse.test.ts:127 `... (closes COV-11)'`.
    CLAUDE.md Test Cross-References: "Do NOT reference external artifacts like improvement-plan item
    numbers ... Those rot." The plan file is also untracked (see the docs-links finding), so these
    IDs resolve nowhere for anyone else.

    Also (a8): describe 'Scenario #2 -- Discover -> Browse flow', 'Scenario #3 --
    config:max-messages-changed caps ingest', 'Scenario #4 -- client:disconnected triggers
    disconnectAll', 'Scenario #6 -- SEMP disconnect resets QueueDiscovery UI' -> numbering from the
    improvement plan (CLAUDE.md's ledger example 'scenario #5 skipped'). Drop the 'Scenario #N'
    prefixes and keep the descriptive part.

    Also (a8): 'falls back to "error" when <execute-result/> has neither reason nor code (closes
    COV-11)' -> drop '(closes COV-11)'.

Why it matters: The references point at a wiped, untracked ledger. The picker sibling comment should name the test by file and title instead.

Change: The references point at a wiped, untracked ledger. The picker sibling comment should name the test by file and title instead.

#### CR-0092 [nit] [new] Lines edited in recent commits kept non-ASCII em dashes (docs)

Location: docs/user-guide.md:129, docs/architecture.md, docs/developer-guide.md
Confidence: verified
Evidence:

    d2751b1 rewrote docs/user-guide.md "- **Load All Config** <em dash> Restores previously saved
    fields. A saved `ws://` ..." and kept the em dash. fb31ea7 added or changed lines in
    docs/architecture.md ("holds **stateless, case-sensitive** matchers <em dash> `matchGlob..."),
    docs/developer-guide.md ("rbac.ts # Stateless RBAC matchers <em dash> matchGlob...") and
    docs/user-guide.md, all keeping em dashes. Rule: "Plain ASCII only ... Existing files stay as
    they are -- convert only what you are already editing."

    Also (a4): Each file was changed in the last five commits (d2751b1 touched main.go,
    connections/module.ts and queue-copy/module.ts), and each line puts a non-ASCII glyph into
    runtime output: main.go:357 has a U+2014 em dash in a log message, connections/module.ts:399 a
    U+2014 in a toast, 552 a U+231B hourglass in button HTML, 617 a U+2026 ellipsis in a log line,
    and queue-copy/module.ts:422 a U+2014 in a warn line.

    Second reading (partly): Docs part confirmed: d2751b1 rewrote user-guide.md:129 and kept its em
    dash; fb31ea7 added architecture.md and developer-guide.md lines with em dashes (git show). The
    runtime part is refuted: git blame shows main.go:357 (2d9003ec, May),
    connections/module.ts:399/552/617 (33fe38b9, Oct 30) and queue-copy/module.ts:422 (149b5f16,
    Sep) were not edited recently; the rule applies to lines, not files.

Why it matters: Style only: d2751b1 and fb31ea7 rewrote or added doc lines and kept em dashes where the house rule asks that edited lines be converted. The runtime strings first listed were not edited recently and are correctly left alone.

Change: Style only: d2751b1 and fb31ea7 rewrote or added doc lines and kept em dashes where the house rule asks that edited lines be converted. The runtime strings first listed were not edited recently and are correctly left alone.

## Suspected (needs confirmation)

#### CR-0010 [minor] [new] Store, key, backup and TLS writes are not crash-durable: no directory fsync after rename or create; writePEM ignores Close and never syncs

Location: go-web-proxy/fileutil.go:14-41, go-web-proxy/backup.go:627-643, go-web-proxy/keyfile.go:96-110, go-web-proxy/tls.go:123-133
Confidence: suspected
Evidence:

    fileutil.go:291-298 syncs the temp file, then `return os.Rename(tmpName, path)` with no fsync of
    dir. backup.go:635-641 `createExclusive(partial, ...)` then `os.Rename(partial, path)`, again
    with no dir sync, and keyfile.go:248-257 creates the key file without syncing its directory.
    tls.go:128-132 `defer f.Close()` drops the Close error and never calls Sync. (1) power loss
    after an admin edit returns 204: the rename may not be persisted, so the old store file comes
    back and the edit is silently lost. (2) Power loss after a backup run: the directory may still
    show the complete .partial, which the next run deletes (removePartials, backup.go:648-662). (3)
    A short write surfacing only at Close in writePEM is reported as success; generateSelfSigned
    then fails on reload, and every later start refuses with 'refusing to overwrite user-supplied
    material' (tls.go:37) about a file the gateway wrote itself.

    Second reading (partly): Code matches: writeFileAtomic syncs the file not the directory
    (fileutil.go:33,40); writeNew renames without a directory sync (backup.go:635-641);
    createExclusive syncs the file only (keyfile.go:105); writePEM defers Close and never calls Sync
    (tls.go:128). Whether a rename is lost depends on the filesystem (ext4 journals the rename
    within its commit interval), so the power-loss case is suspected. Docs promise only
    crash-mid-write safety (fileutil.go:9-10, provisioned-mode.md:179) and that holds. A failed
    pem.Encode on the key file (ENOSPC) also leaves a truncated file that the next start refuses at
    tls.go:37 as 'user-supplied material' -- the same crash loop with a likelier trigger.

Why it matters: The atomic-write and '.partial then .json' guarantees hold against process crashes but not power or host loss. The writePEM case turns a transient write error into a crash loop with a misleading message.

Change: The atomic-write and '.partial then .json' guarantees hold against process crashes but not power or host loss. The writePEM case turns a transient write error into a crash loop with a misleading message.
To confirm: Whether a rename without a directory fsync can be lost on the deployment's filesystem after power loss (ext4 journals it within its commit interval; other filesystems differ); the writePEM ENOSPC path can be confirmed by filling the /tls volume.

#### CR-0097 [minor] [new] registry setup checks are ignored with an unsanctioned category but can be reached with vi.doMock

Location: src/registry.ts:27-58, tests/registry.test.ts:1-106, tests/main.test.ts:4-28, vitest.config.ts:11-13
Confidence: suspected
Evidence:

    registry.ts:29-33: `/* v8 ignore start -- developer-experience guardrail: fires only if a
    src/variants/<name>.ts lists a module id that doesn't exist on disk ... testing it requires
    mocking virtual:module-registry. */` around `if (!file) { throw new Error(...) }`. :46-49: `/*
    v8 ignore start -- developer-experience guardrail: ... reproducing in a test would require
    committing a malformed module dir into the repo. */` around `if (!moduleObject) { throw ... }`.
    'Developer-experience guardrail' is not one of the sanctioned categories
    (contributing.md:374-381: jsdom limitations, SDK callback branches, defensive catch on trusted
    contracts, redundant safety checks). The module is reachable in tests: vitest.config.ts:11-13
    registers moduleRegistryPlugin, so `virtual:module-registry` resolves under vitest.
    tests/main.test.ts:4-28 already uses `vi.resetModules()` + `vi.doMock('../src/registry', ...)` +
    `await import(...)`, and the same pattern with vi.doMock('virtual:module-registry') and
    vi.doMock('../src/variants/_active') reaches both throws without committing a malformed
    directory. These are good fail-loud setup assertions (golden rule 4a: 'a systemic
    misconfiguration fails the whole operation loudly at setup'), and S5 says 'Always cover security
    and error boundaries ... every error code'.

Why it matters: Proposed fix: keep both throws, remove both ignores, and add describe 'setup guardrails' to tests/registry.test.ts with two tests. Each does vi.resetModules, doMocks _active as { ACTIVE_MODULES: { ghost: 1 } } and the virtual module, then `await expect(import('../src/registry')).rejects.toThrow(...)`. Test 1, 'throws when a manifest id has no entry file': moduleFiles is {}, expect /no entry file/. Test 2, 'throws when the entry file exports no object with the matching id': moduleFiles is { ghost: { default: { id: 'other' } } }, expect /does not export an object/. Unmock in afterEach. Alternate: keep the ignores and reword them under a sanctioned category. None fits, because the code is reachable. The proposed fix is better: the error messages are the product here, and two short tests pin them. Not run: I am confident vi.doMock handles the plugin-resolved virtual id, but the user should confirm with the cov task.

Suggested patch (not applied):

```diff
--- a/src/registry.ts
+++ b/src/registry.ts
@@ -28,7 +28,6 @@
     const file = moduleFiles[id] as Record<string, unknown> | undefined;
-    /* v8 ignore start -- developer-experience guardrail: fires only if a
-     * `src/variants/<name>.ts` lists a module id that doesn't exist on disk.
-     * The registry plugin already fails the build when the entry file is
-     * missing, so this only fires if the virtual module and the manifest
-     * disagree; testing it requires mocking `virtual:module-registry`. */
+    // Fails loud when the variant manifest and the generated registry disagree
+    // (tests/registry.test.ts mocks `virtual:module-registry` to prove it).
     if (!file) {
@@ -41,3 +40,2 @@
     }
-    /* v8 ignore stop */
     const moduleObject = Object.values(file).find(
@@ -46,5 +44,3 @@
-    /* v8 ignore start -- developer-experience guardrail: fires only if a
-     * module entry file exports an object whose `.id` doesn't
-     * match its directory name. Caught at code-review time; reproducing in a
-     * test would require committing a malformed module dir into the repo. */
+    // Fails loud when an entry file exports no object whose .id matches its directory.
     if (!moduleObject) {
@@ -55,3 +51,2 @@
     }
-    /* v8 ignore stop */
     return { module: moduleObject, priority };
```
To confirm: That vi.doMock on the plugin-resolved `virtual:module-registry` id takes effect for a dynamic import of src/registry.ts (tests/main.test.ts:5,25 uses the same resetModules + doMock + import pattern).

#### CR-0082 [nit] [new] Every compose file uses the deprecated `no-new-privileges:true` colon form instead of `no-new-privileges=true`

Location: docker/docker-compose.yaml:43-44, docker/docker-compose.yaml:89-90, docker/compose.gateway.yaml:25-26, docker/compose.provisioned.yaml:41-42, docker/docker-compose.e2e.yaml:27-28, docker/docker-compose.e2e.yaml:73-74, docker/docker-compose.e2e.yaml:114-115, tests/build/compose-files.test.ts:22
Confidence: suspected
Evidence:

    All seven services have `security_opt:\n - no-new-privileges:true`, and compose-files.test.ts:22
    pins the colon form. The house rule specifies "`no-new-privileges` (compose `security_opt: -
    no-new-privileges=true`)". The Docker daemon still accepts the colon separator but treats it as
    deprecated. Podman's `--security-opt` parser splits on `=` (suspected to reject the colon form
    outside Docker-compat mode; confirm with `podman run --security-opt no-new-privileges:true`).

    Second reading (partly): Colon form present at all seven lines and pinned by
    compose-files.test.ts:22. The user's global CLAUDE.md asks only for 'no-new-privileges' with no
    syntax; the '=' form comes from the review skill's containers checklist. Docker accepts the
    colon form (deprecation warning in the daemon log), so the posture takes effect. The Podman
    rejection claim is unverified (Podman's specgen falls back to ':' for Docker compatibility).
    Nothing in docs/ mentions Podman. Style deviation, not a broken posture.

Why it matters: This deviates from the stated posture form and relies on a deprecated separator, which matters for the rootless Podman deployments the posture rules anticipate.

Change: This deviates from the stated posture form and relies on a deprecated separator, which matters for the rootless Podman deployments the posture rules anticipate.
To confirm: Whether Podman (outside Docker-compat mode) accepts the colon form: `podman run --security-opt no-new-privileges:true`.

## Dynamic checks

Run by the user on the review host (4 CPUs, Linux) after the static pass; the reviewer read only the task logs under scripts/logs/.

- `./scripts/dev.sh full` (build vet test mock cov image scan graphify), exit 0. Footers: build 11s OK, vet 3s OK, test 3s OK, mock 0s (web suite deferred to cov) OK, cov 69s OK, image 23s OK, scan 11s OK, graphify 6s OK. vet: `tsc --noEmit` and `go vet ./...` clean (scripts/logs/vet.log). cov: web `All files | 100 | 100 | 100 | 100`, Go `total: (statements) 97.9%` (scripts/logs/cov.log; coverage/summary.txt unchanged: 5712/5712, 2441/2441, 988/988, 5152/5152). scan: `npm audit gate passed (0 unfixable high/critical advisory(ies) warned)`, `No vulnerabilities found.` (govulncheck), Trivy image scan OK (scripts/logs/scan.log). Note: the web `test` suite passed here only because the git-ignored docs/improvement-plan.md exists on this machine; see CR-0075 under cicd.
- `cd go-web-proxy && go test -race -count=1 ./...`, exit 0: `ok github.com/solace/go-web-proxy 12.924s`. No race reported by the detector on this run; the gate scripts themselves never pass -race (see the tests finding).
- Tree check: `git status --short` before = `M docs/user-guide.md`; after = `M docs/user-guide.md`, `M graphify-out/manifest.json`. The second change comes from the `graphify` task refreshing its tracked manifest (stamps only; the log says "No code-graph topology changes detected; outputs left untouched"). That task is a local-only graph refresh rather than a gate, so this is not filed as "gate mutates the tree"; the tracked per-machine graphify artifacts are a conventions finding.
- Not run (tool absent on this host or not requested): shellcheck, actionlint, hadolint, `docker compose config`, `go mod tidy -diff`, staticcheck/golangci-lint, `npm ls --all`, `quadlet -dryrun` (no quadlet units in the tree).

## Fixed since last report

First run

## Accepted (not re-litigated)

None

## Coverage

- Areas reviewed: design, correctness, resilience, quality, tests, cicd, build, interfaces, observability, conventions; skipped: none.
- Method: eight first-pass area reviewers (Opus; one each for design+interfaces, TS correctness+resilience, Go correctness+resilience, quality+observability, test strategy, cicd+build+conventions, dead-guard + v8-ignore audit, ceremonial-test audit), merged and de-duplicated by the orchestrator (154 raw -> 139 candidates), then every candidate re-read by an independent adversarial verifier (Opus; 19 file-grouped verifiers over all candidates plus 6 dedicated refuters over the 24 Blocker/Major candidates). The orchestrator opened the cited lines of every Blocker and Major itself. Refuted candidates were dropped (listed at the end of this section); "partly" verdicts were folded in as location or severity corrections.
- Read closely: go-web-proxy/*.go (all 24 non-test files, the test files for intent, testdata/contract/*); src/core/** (every .ts), src/registry.ts, src/main.ts, src/variants/*.ts; src/modules/** (every module.ts, service*.ts, ui*.ts/js, state, managed-panel, account, config.js); src/mock-broker/network.ts, boot*.ts, gateway/*.ts, sdk/session.ts, fixtures.ts; tests/setup.ts, tests/helpers/*, every file under tests/core, tests/modules, tests/integration, tests/build, tests/mock-broker (the ceremonial pass read 104 test files with an it-block scan); scripts/dev.sh, scripts/dev.ps1, setup.sh, scripts/*.mjs; .github/workflows/*.yml, dependabot.yml, workflow-config.json; docker/Dockerfile, Dockerfile.dockerignore, all four compose files; package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .gitignore, .gitattributes, .claudeignore, .tool-versions; README.md and docs/*.md for docs-vs-reality.
- Sampled: src/css/*.css and src/modules/*/styles.css (only for the `!important` and misplaced-selector rules); src/mock-broker/server/*, controls/*, shell.ts, emitter.ts (demo fidelity only where it hides a real failure); solclient.js (grepped for the SDK methods the findings depend on: byteArrayAsString, getBinaryAttachment, createFromName/validateAndEncode, disconnect/removeListener); package-lock.json (header only).
- Not read: images/, cert/, dist/ outputs, node_modules/ beyond @vitest/spy (mock semantics) and playwright-core/package.json; graphify-out/ beyond GRAPH_REPORT.md; go-web-proxy/graphify-out/* (stale nested graph, flagged).
- Stacks with core checklist only: PowerShell (scripts/dev.ps1, compared task by task against dev.sh for parity rather than against a PowerShell checklist).
- Dynamic checks not run: shellcheck, actionlint, hadolint, docker compose config, go mod tidy -diff, staticcheck, npm ls --all.
- Limits: static review; SDK-dependent claims (how solclientjs behaves at runtime) are marked suspected where the bundled minified code did not settle them. The Workflow tool was not used for the verification fan-out because this host has 4 CPUs (the tool caps concurrency at CPUs-2); the Agent tool ran the same fan-out concurrently. The first-pass Go reviewer's line numbers for go-web-proxy/pages.go were offset and were corrected from the file. docs/improvement-plan.md, which the companion audit section is written into, is git-ignored and untracked (see the cicd finding), so that deliverable exists only on this machine until the ignore rule is lifted.

- Candidate findings refuted during verification and left out: 4 (Negative assertions are synchronised by real-timer sleeps or a fixed m; Go functions below 100%: one operator-reachable start failure is untes; PR-time CI is path-filtered to workflow and dev-script files only; fil; tests/modules/connection-management/module.test.ts: 2 weak tests -- re)
