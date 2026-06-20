# SolaceMessageUtility — Test Suite Technical Report

> **Recent hardening (April 2026):** defensive-guard tests across ~12 files were strengthened so that `.not.toThrow()` is paired with a state-snapshot or DOM-snapshot assertion proving the guarded body did not run. The 4 `document.getElementById` stub sites in `ui-details.test.ts` were migrated to `vi.spyOn(...).mockReturnValue(...)` so they are auto-restored by `vi.restoreAllMocks()` in the global `afterEach` and can no longer leak across tests. See Priority 6.1 and 6.4 in [improvement-plan.md](improvement-plan.md) for details. The philosophy below remains unchanged; the implementation simply now matches it.
>
> **Post-April 2026 tightening:**
> - **Cross-module integration tests:** [`tests/integration/module-events.test.ts`](../tests/integration/module-events.test.ts) installs real `ConnectionsModule` / `QueueBrowserModule` against `loadModuleDOM` containers with a shared `EventBus`, then drives cross-module event flows: `config:max-messages-changed` cap propagation, `client:disconnected` triggering `service.disconnectAll` + forward-queue FAILED marking. Service factories are mocked at the module level via `vi.mock`.
> - **End-to-end message pipeline test:** new file [`tests/integration/message-pipeline.test.ts`](../tests/integration/message-pipeline.test.ts) fires real broker-shaped messages through `service-events.onMessage`, letting `ingestMessage`, `shouldShowMessage`, and `ui.addMessageRow` run through the full pipeline. Four scenarios: content filter gates DOM rows, filter cleared mid-stream does not retroactively re-render, messages for a non-current queue still ingest but don't hit the DOM, destination-type filter works via `window.solace` enum.
> - **Toast lifecycle tests:** new file [`tests/core/toast.test.ts`](../tests/core/toast.test.ts) exercises the auto-dismiss timer chain (`durationMs` → `toast--leaving` → `FADE_OUT_MS` → remove) with `vi.useFakeTimers()`. Previously the `setTimeout` callbacks fired zero times under test.
> - **Fresh independent audit — 2026-04-24:** source + test scan flagged 2 BUGs (S1 `activeFilters` shape drift across 4 reset sites; S7 required-element guards on elements missing from the `required()` list), 2 SMELLs, 2 CEREMONIAL tests, 2 WEAK-ASSERT tests, 2 DUPLICATEs/FRAGILEs, and 7 coverage-driven GAPs. Shipped: 10 of those items plus `_originalMsg`-null defensive code reversal after confirming the data model forbids that state. See [improvement-plan.md](improvement-plan.md) Fresh Audit section for the residual open items (S6 two-button forward modal, T6 throwing-listener EventBus test, T11 registry branch tests, T12 Enter-key handlers, T13 SEMP-disconnect guards).
> - **Error-path hardening (6.3, 5.13):** eight new tests plus three real bug fixes — null-`URL.createObjectURL` abort, save-failure error toast, `deleteMessages` race guard, dead sempFetch try/catch removed. The previously-ceremonial ACK/REJECT wiring test was strengthened to capture handlers by `SessionEventCode`, fire them with realistic correlation-key events, and assert the downstream `ui.updateForwardItemStatus` call — catching wrong-event-code, wrong-handler, and wrong-UI-method regressions. (Note: the 6.3.1 `_originalMsg`-null fallback in `service.ts forwardMessage` was later reversed — `_originalMsg` is always set by `onMessage` delivery, so per CLAUDE.md "don't validate scenarios that can't happen" the guard was removed along with the five tests that exercised it.)
> - **Test isolation hardening (6.9):** global `beforeEach`/`afterEach` in [`tests/setup.ts`](../tests/setup.ts) now re-installs default `localStorage` mock implementations and unconditionally calls `vi.useRealTimers()` so a prior test's `mockReturnValue()` or `useFakeTimers()` cannot leak into the next. A shared [`tests/helpers/resetQueueBrowserState.ts`](../tests/helpers/resetQueueBrowserState.ts) helper replaces every hand-rolled (and mutually inconsistent) `state.js` reset across the queue-browser test suite. Wrapped around `defaultActiveFilters()` exported from `state.js` — the S1 fix consolidated four reset sites behind one factory.
> - **Mock fidelity hardening (6.6):** `createSessionMock().on` and `createBrowserMock().on` now validate the event code against the relevant `SessionEventCode`/`QueueBrowserEventName` values in the current `window.solace` mock and throw on unknown codes — catches production typos like registering `'UP_NOTICE'` on a browser (real code: `'UP'`). All `createMessageMock()` setters now use `.mockReturnThis()` so future chained-setter refactors in `forwardMessage` work transparently. The 6.9 "reset default implementations" pattern was extended to `confirm`, `alert`, `URL.createObjectURL`, `URL.revokeObjectURL`, and `navigator.clipboard.writeText`; and `(window as any).solace = createSolaceMock()` is now re-created every test so stale `_handlers` entries cannot leak.
> - **v8 ignore policy:** long-tail defensive sites on SDK-never-throws catches and unreachable-in-jsdom branches now carry `/* v8 ignore */` blocks with multi-option justification — each one lists at least two ways the branch could be tested and explains why each was rejected. CLAUDE.md still forbids using ignores to skip real business logic; the contracts inside these ignores are all SDK-boundary or reachability issues.
> - **Fresh Audit phase closed:** the last four remaining items (T6, T11, T12, T13) landed in one pass. T6 was stale (`tests/core/event-bus.test.ts` *"catches and logs errors in handlers without breaking other handlers"* already covered it). T11 extracted `checkModuleIdInvariant()` as a testable export from `src/registry.ts` and added four `tests/registry.test.ts` cases (baseline, missing, extra, both-sides-wrong composite). T12 unified the bind input's deprecated `'keypress'` to `'keydown'` and strengthened three module-level tests with `event.defaultPrevented === true` assertions proving the whole handler body ran. T13 strengthened two `tests/modules/queue-discovery/service.test.ts` disconnect tests with `expect(ctx.sempFetch).not.toHaveBeenCalled()` + generator exhaustion — catches regressions that move the SEMP guard below the first network call. See [improvement-plan.md](improvement-plan.md) Fresh Audit "Closed during this audit" for per-test detail.
> - **Required-element DOM policy:** module-owned elements (every element declared in a module's own `<template>`) are captured via `required<T>(container, selector)` from [`src/core/dom.ts`](../src/core/dom.ts). The helper throws at install time if a selector yields null, which removes the nullable type and eliminates every "DOM null-guard on an element that's always present" v8 ignore from the codebase. See CLAUDE.md for the policy.
> - **Real-template test DOM:** tests no longer hand-roll a `container.innerHTML = '<long HTML string>'` setup. The [`loadModuleDOM`](../tests/helpers/loadModuleDOM.ts) helper reads each module's `src/modules/<id>/index.html` at test time, so the test DOM can never drift from the HTML that actually ships. The `moduleId` parameter is typed against `MODULE_IDS` so typos fail at compile time.
> - **MODULE_IDS registry:** [`src/module-ids.ts`](../src/module-ids.ts) is now the single source of truth for which modules exist. The Vite build plugin, the registry invariant block, and the `loadModuleDOM` helper all consume it; any drift between them fails fast (at build time or import time).
> - **CSS split:** `src/css/styles.css` (1,232 lines) was split into five design-system files (`variables`, `reset`, `layout`, `components`, `utilities`) plus three per-module `styles.css` under `src/modules/<id>/`. `src/css/main.css` is the aggregator imported by `main.ts`. This closed Priority 7.1.
> - **Connection-libraries-to-core refactor (May 2026):** four-stage lift to enable a future `queue-copy` module without violating module isolation. Stage A added [`src/core/connections/types.ts`](../src/core/connections/types.ts) (`ConnectionConfig`, `SolaceConfig`, `SempConfig`, `SempContext`) and [`defaults.ts`](../src/core/connections/defaults.ts) (`DEFAULT_CONFIG`, `validateConfig`); plus [`tests/core/connections/defaults.test.ts`](../tests/core/connections/defaults.test.ts) and [`persistence-compat.test.ts`](../tests/core/connections/persistence-compat.test.ts) (legacy-shape round-trip). Stage B lifted the broker factories to [`src/core/services/`](../src/core/services/) and refactored their APIs from `(ctx)` to **pure factories taking lifecycle hooks** (`onConnected/onDisconnected/onConnectFailed/onError` for Solace; `onConnected/onDisconnected/onAuthFailed/onError` for SEMP); the connections module's `module.ts` now defines bridging hooks that route factory events to `ctx.setState` + `eventBus.emit` + form UI updates. Tests migrated to [`tests/core/services/solace-client.test.ts`](../tests/core/services/solace-client.test.ts) and [`semp-client.test.ts`](../tests/core/services/semp-client.test.ts); a new `Solace bridging hooks` / `SEMP bridging hooks` describe block in [`tests/modules/connections/module.test.ts`](../tests/modules/connections/module.test.ts) covers the bridging side (helpUrl construction, button transitions, error text, AppState writes, bus emits). Stage C lifted SEMP discovery to [`src/core/services/semp-discovery.ts`](../src/core/services/semp-discovery.ts) parameterized by `SempContext`; queue-discovery's `service.ts` is now a thin wrapper that builds primary `SempContext` via the new [`primarySempContextFrom`](../src/core/services/sempContext.ts) helper. Stage D added a reusable [`pickQueue(sempCtx, opts?)`](../src/core/components/queue-picker/index.ts) component with full coverage in [`tests/core/components/queue-picker/picker.test.ts`](../tests/core/components/queue-picker/picker.test.ts). All four stages held at 100% coverage; no module other than connections needed any changes (the bus contract `client:connected` / `semp:connected` was preserved end-to-end).
> - **May 2026 audit sweep — 100% coverage achieved.** A fresh 4-axis audit (bugs / dead-code / v8 ignores / ceremonial tests) produced two rounds of source cleanup followed by a coverage closure pass. Round 1 (DEAD-1, DEAD-2, IGNORE-1, IGNORE-2, B1, B2): collapsed `keypress` → `keydown` in connections, removed the dead `properties &&` guard from `applyFilters`, deleted the misplaced `if (els.selectBound)` and filter-input null-guards on module-owned elements, removed two over-broad `/* v8 ignore */` blocks, and dropped a dead `msg.content || ''` fallback. Round 2 (DEAD-1, DEAD-1b, IGNORE-1, COV-6, CER-3): bulk-removed `if (els.X)` guards on 23 module-owned selectors across `queue-browser/{ui-core, ui-table, ui-details, ui-forward}` plus `connections/ui.openSslModal`, dropped sibling-module `if (els.btnSemp)` / `if (els.btnSolace)` / NodeList-never-null `if (!els.radiosAuth)` guards (4 sites), expanded the queue-browser required-list to 67 selectors, deleted ~21 dead-guard null-stub tests across 5+ files, and added a new race-test for the stale-session `removeListener` catch in `queue-browser/module.ts`. Coverage closure (COV-1..16 + late-discovered ui-forward.js + queue-browser/module.ts gaps): 11 new tests in 5 files plus 10 `firstPage()` → `allPages()` swaps in `queue-discovery/service.test.ts` to lock in the single-page-then-stop generator contract; new file [`tests/core/dom.test.ts`](../tests/core/dom.test.ts) covers `required()` and `attachBackdropClose` (the modal backdrop helper used by every dialog). Ceremonial-test sweep (CER-1, CER-2, CER-4, CER-5): replaced bare `// Should not throw` and `vi.spyOn(button, 'click')` patterns with real `dispatchEvent` calls plus state/log assertions; deleted two duplicate `describe('... additional')` blocks in `service-events.test.ts`. COV-16 was an investigation-first item — diagnosed as a v8 basic-block instrumentation false-negative on chained `else if (method() === X)` patterns (DA shows line 167 reached 3x with line 168 reached 2x, meaning the falsy branch IS exercised; v8 just didn't propagate the BRDA count) and resolved by adding an explicit "unknown type fallthrough" test that gives v8 its cleanest signal. **Result:** Statements / Branches / Functions / Lines all now report 100% with all four `vitest.config.ts` thresholds met. See [improvement-plan.md](improvement-plan.md) Historical Ledger for the per-item shipped narrative.
> - **`queue-subscription-explorer` module added (May 2026):** new SEMP-only module that lists every `(VPN, queue, topic-subscription)` triple visible to the SEMP user with three column-filter inputs (substring + `*` for VPN/Queue, bidirectional Solace topic intersection for the Subscription column). Built around four new test files — `parse.test.ts` (XML edge cases including `<more-cookie>` extraction), `service.test.ts` (SEMP v1 paged async-generator + `<more-cookie>` continuation + error paths), `ui.test.ts` (renderRows / updateVisibility), `module.test.ts` (install, debounced filter, Load gating via `disabled`, SEMP disconnect cache invalidation). Two utilities lifted to core for cross-module reuse: `escapeXml` from queue-copy/service-verify into [`src/core/utils.ts`](../src/core/utils.ts), `deriveSempV1Url` into [`src/core/services/sempContext.ts`](../src/core/services/sempContext.ts) — their tests moved alongside; `tests/core/utils.test.ts` and `tests/core/services/sempContext.test.ts` cover the new homes. `topicsIntersect(a, b)` is also new in `src/core/utils.ts` (pure helper, fully unit-tested). The SEMP v1 + `<more-cookie>` pagination contract is described in [architecture.md](architecture.md) — separate section from the existing v2 generator contract.
> - **Module priority centralized in registry (May 2026):** dropped `priority` from the `PwaModule` interface and from each module's exported object; introduced `RegisteredModule` (`{ module, priority }`) in [`src/core/types.ts`](../src/core/types.ts) and changed [`src/registry.ts`](../src/registry.ts) to a list of these tuples. Kernel constructor now takes `RegisteredModule[]`, builds a `priorities: Map<string, number>` keyed by module id, and sorts the install + sidebar lists from it. Per-module test files no longer assert `MODULE.priority`. The registry test was rewritten to be **behavioral, not ceremonial**: it spies the install of every real registered module and feeds the lot to the kernel, then asserts (1) every registered module installs and (2) install order matches the priority-descending order — including a case where the registry array is shuffled, to prove the kernel's sort is what enforces ordering rather than the array layout. The test never names a specific module or priority, so adding/removing a module or changing a number doesn't touch this test. The structural-shape test asserts every entry has `{ module: PwaModule, priority: number }` + unique ids, again module-agnostic. Kernel + integration tests gained a small `reg(module, priority)` helper to wrap mocks for the new constructor shape; ~40 `new Kernel([...])` call sites were rewritten with `replace_all`. Architecture, developer-guide, and test-report docs updated to describe the new shape.
> - **Queue-copy SEMP v1 newest-msg-id workaround (May 2026):** the broker's `show queue … detail` RPC returns `0` for `<info>/<newest-msg-id>` (`soltr/10_25_0VMR`); the same bug surfaces in SEMP v2 as `highestMsgId`. [`verifyViaSempV1`](../src/modules/queue-copy/service-verify.ts) now issues a **second** SEMP v1 POST per verify call (`<show queue … messages newest count num-elements=1>`) and parses the real ID from `spooled-messages/spooled-message/message-id`. The original `<newest-msg-id>` parse line in `parseSempV1Response` is preserved-but-commented-out with a `BROKER BUG:` note for traceability if the broker is ever fixed. The supplementary call is best-effort: non-2xx, parse error, fail execute-result, or non-numeric ID leave `newestMsgId=null` without failing verification (the consumer engine treats `null` as "no boundary, drain via idle"). Both verify entrypoints — initial verify and the continue-beyond re-probe in `promptContinueBeyond` — route through one wiring point. New `describe('SEMP v1 newest-msg-id supplementary call')` block in [`tests/modules/queue-copy/service-verify.test.ts`](../tests/modules/queue-copy/service-verify.test.ts) adds 16 cases covering success, empty queue, non-2xx, fetch throw, non-ok execute-result, malformed XML, DOMParser throw, non-numeric ID, empty ID text, abort between the two calls, abort during the post-fetch text() resolve, supplementary fetch AbortError, detail-call short-circuit, and the "info-block missing but supplementary still runs" branch. The QueueBrowser-accumulate fallback (no-SEMP path) is unaffected — it tracks `max(seenIds)` itself. Existing `verifySource`-through-SEMP tests required no updates: `SAMPLE_RESPONSE` has no `<spooled-message>` so the supplementary call returns `null` gracefully. Architecture impact documented in [architecture.md](architecture.md) under "Queue Copy: Verify Flow & Broker Bug Workaround".
> - **Tier 3 v8-ignore reductions (May 2026):** three redundant defensive blocks dropped after the 2026-05-13 audit. (1) `applyVpnFilter` / `applyQueueFilter` in [`src/core/components/queue-picker/index.ts`](../src/core/components/queue-picker/index.ts) replaced `opt.textContent?.toLowerCase() ?? ''` with `(opt.textContent || '').toLowerCase()` — the `||` collapses the spec-impossible null and the spec-allowed empty string into one observable path. (2) `renderQueueList` dropped `?? []` on `s.queueCache.get(s.selectedVpn!)` in favour of a non-null assertion `!`; both callers (`fetchQueues` writes the entry before calling, `switchToVpn` is guarded by `queueCache.has`) gate on cache-hit, so the assertion documents the contract executably and would surface a louder error on regression. (3) `handleModalStart` in [`src/modules/queue-copy/ui-modal.ts`](../src/modules/queue-copy/ui-modal.ts) replaced `state.verify?.result?.messageCount ?? null` with `state.verify!.result!.messageCount` — the button is only enabled after `renderVerifyResult` populates both refs, `renderRunPhase`'s `total: number | null` signature is unchanged because `messageCount` itself is still nullable. Zero test churn — all three branches were architecturally unreachable through any public API.
> - **Queue-copy run-engine simplification + SEMP/QB parity (2026-05-15):** replaced the pause-at-newest / continue-beyond control flow with a clean two-phase engine. Phase 1 detects one of seven first-wins `StopReason`s (`cancel | source-drift | max-consumed | reached-max | idle | publish-error | browser-error`) and halts the source `QueueBrowser`; Phase 2 drains in-flight publishes and produces `status: 'completed' | 'cancelled' | 'error'` exactly once. The `IDLE_DRAIN_MS=2s` + `NO_PROGRESS_MS=60s` dual-timer scheme was replaced with a single configurable `IDLE_TIMEOUT_MS=60_000`. `CopyHooks` slimmed from seven callbacks to two (`onProgress`, `onComplete`); the run's final classification flows entirely through `onComplete(job)` where `job.status` and `job.lastError` are populated by Phase 2. Move-mode `removeMessageFromQueue` is still called per-message-after-ACK (not batched). Access type for the source queue is now captured at verify time via the existing SEMP `<info>/<others-permission>` field (prefix match `Read-Only…` / `No-Access…` → `'read-only'`) on the SEMP path, or `_messageConsumer._permissions` on the QueueBrowser-fallback path — no extra RPCs, no extra binds. The modal gates Start with `evaluateStartGate` for empty-queue and move-on-read-only; the engine itself contains no permission logic. Tests: `tests/modules/queue-copy/service-copy.test.ts` rewritten from scratch around the seven-`StopReason` × Phase-2 outcome matrix (one describe per stop reason + first-wins, cancel-during-drain upgrade, per-message-after-ACK move ordering, `IDLE_TIMEOUT_MS` configurability, total-0 + null-publisher fast-paths); `tests/modules/queue-copy/ui-modal.test.ts` lost the three continue-beyond pause-prompt tests, gained an `evaluateStartGate` describe (verify-fail, empty-queue, move-on-read-only, copy-on-read-only, mode-toggle, null-permissive); `tests/modules/queue-copy/ui.test.ts` lost the pause/stale helper tests + `renderProgress` continuation-suffix tests, gained `setEmptyQueueIndicator` / `setReadOnlyIndicator` show/hide tests + an explicit "renderVerifyResult does NOT toggle btnModalStart on success" anchor; `tests/modules/queue-copy/service-verify.test.ts` gained `normalizeAccessType` unit tests + SEMP `<others-permission>` parse tests + QB-fallback `_messageConsumer._permissions` capture tests; `tests/modules/queue-copy/state.test.ts` updated for the slimmed `CopyJob` (`{ total, copied, cancelRequested, lastError, status }`); `tests/modules/queue-copy/service-copy-mock.test.ts` aligned with the new hook shape. `docs/queue-copy-plan.md` flagged as SUPERSEDED with a pointer to `architecture.md` § "Run engine: two-phase model" (the live algorithm doc).
> - **2026-05-17 audit ship #1 + #2 (CER-1 + six XS coverage gaps):** seven test-only changes across five files, no source touched. **CER-1** rewrote the two click-wiring tests in [`tests/modules/queue-browser/module.test.ts`](../tests/modules/queue-browser/module.test.ts) to spy the distinguishing downstream effect — `ui.showForwardModal` for the forward button, `window.confirm` for delete — instead of the shared `ui.getSelectedMessageIds` anchor; each test also asserts the OTHER button's downstream was NOT invoked, so a forward/delete wire-swap regression now fails BOTH tests instead of passing silently. The pattern (assert on the distinguishing downstream, not the shared anchor, and cross-assert the sibling) is the recommended shape for click-wiring tests on modules that share a selection helper. **COV-5** added a "client name identifier validation" describe in [`tests/modules/connections/module.test.ts`](../tests/modules/connections/module.test.ts) covering the >100-char early-return path. **COV-6** added two [`tests/core/kernel.test.ts`](../tests/core/kernel.test.ts) tests covering the `?logLevel=` URL override (truthy + falsy-anchor branches) by stubbing `window.location.search` via `Object.defineProperty`. **COV-10** added a `btnBindPick` click-wiring test against a `pickQueue` spy. **COV-11** added a `<execute-result/>` with neither reason nor code test to [`tests/modules/queue-subscription-explorer/parse.test.ts`](../tests/modules/queue-subscription-explorer/parse.test.ts) confirming the `?? 'error'` fallback. **COV-12** added an empty-`textContent` filtering test in [`tests/core/components/queue-picker/picker.test.ts`](../tests/core/components/queue-picker/picker.test.ts) covering the `|| ''` fallback at `applyVpnFilter`/`applyQueueFilter`. **COV-13** added a `topicsIntersect('**', '**')` memoization test in [`tests/core/utils.test.ts`](../tests/core/utils.test.ts) exercising the memo cache-check branch. See [improvement-plan.md](improvement-plan.md) Historical Ledger 2026-05-17 entry for the per-test detail.
> - **Variant-aware single-line activation (May 2026):** collapsed the registry/`MODULE_IDS`/disk three-source-of-truth design into a **variant manifest** living at [`src/variants/<name>.ts`](../src/variants/full.ts) (one record per shippable variation, mapping module id → priority). [`src/variants/_active.ts`](../src/variants/_active.ts) is a one-line re-export from one specific variant; [`src/registry.ts`](../src/registry.ts) imports `ACTIVE_MODULES` from it and resolves each id to a `PwaModule` via `import.meta.glob('./modules/*/module.ts', { eager: true })` — no hand-maintained import section. Disabling a module = comment one line in the variant. `src/module-ids.ts` deleted; `checkModuleIdInvariant` removed (the registry now throws at module-eval time with a clearer message if a manifest entry has no matching `module.ts` on disk). [`vite.config.ts`](../vite.config.ts)'s `injectModuleTemplates` plugin now scans `src/modules/` for available templates (alphabetized for stable diffs) — orphan check removed; a directory not listed in the active variant just sits inert in the DOM (`<template>`-wrapped, no installer). A new `variant-redirect` Vite plugin honors `VITE_VARIANT=<name>` to rewrite `_active`'s import target at build time, enabling future per-variant builds without touching source. [`tests/helpers/loadModuleDOM.ts`](../tests/helpers/loadModuleDOM.ts) widened from `ModuleId` to `string` (typos surface as ENOENT at read time). [`tests/registry.test.ts`](../tests/registry.test.ts) dropped the `checkModuleIdInvariant` `describe` block — the shape + kernel-integration blocks remain. Kernel's missing-template console error sharpened to point at the variant manifest. CLAUDE.md anchor #6, architecture/developer-guide/contributing/test-report docs updated.
>
> The v8 ignore categories table further down has been trimmed to reflect which of the old justifications still apply.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Architecture Overview](#project-architecture-overview)
3. [Testing Methodology](#testing-methodology)
4. [Test Infrastructure and Configuration](#test-infrastructure-and-configuration)
5. [Unit Testing — What Is Tested and How](#unit-testing--what-is-tested-and-how)
6. [Integration Testing — How Cross-Module Flows Are Tested](#integration-testing--how-cross-module-flows-are-tested)
7. [The v8 Coverage Ignore Strategy](#the-v8-coverage-ignore-strategy)
8. [Coverage Results](#coverage-results)
9. [Key Technical Challenges and Solutions](#key-technical-challenges-and-solutions)

---

## Executive Summary

The SolaceMessageUtility PWA is a modular web application for managing Solace PubSub+ Event Broker message queues. It is built on a custom micro-kernel architecture with four feature modules (connections, queue-browser, queue-copy, queue-subscription-explorer), a typed event bus, and dependency injection via an `AppContext` object.

The test suite consists of **27 test files** covering 26 source files (one-to-one for source modules plus a dedicated test for the shared [`src/core/dom.ts`](../src/core/dom.ts) helpers added in the May 2026 sweep). Coverage thresholds in `vitest.config.ts` are set to **100%** across all four metrics (Statements, Branches, Functions, Lines); as of the May 2026 sweep the target is met across the board. Tests are split between dedicated unit tests per source file and three integration test files: `full-flow.test.ts` (Kernel mechanics with stub modules), `module-events.test.ts` (real cross-module event flows), and `message-pipeline.test.ts` (end-to-end `onMessage → ingest → filter → DOM`).

**Coverage summary (last measured run, post June 2026 no-payload-flavor work):**
```
Statements : 100% (4024/4024)
Branches   : 100% (1783/1783)
Functions  : 100%  (627/627)
Lines      : 100% (3645/3645)
```

Every source file in the coverage scope reports 100% across all four metrics — the per-file gap table that earlier revisions of this report carried is no longer needed. The remaining `/* v8 ignore */` blocks are limited to CLAUDE.md's sanctioned categories (jsdom-readyState branch, SDK-callback paths the harness can't fire, defensive catches around contracts that never throw); each is documented inline at its source site.

---

## Project Architecture Overview

Understanding the architecture is prerequisite to understanding the test strategy.

### Micro-Kernel with Dependency Injection

The application is structured as a kernel (`src/core/kernel.ts`) that owns all global infrastructure — the event bus, application state, DOM orchestration, and SEMP API authentication — and injects these capabilities into each module via an `AppContext` object:

```
src/
├── core/
│   ├── kernel.ts          # Orchestrator — installs modules, manages state, navigation
│   ├── event-bus.ts       # Typed publish/subscribe system
│   └── types.ts           # Shared interfaces (AppContext, AppState, BusEvents, PwaModule)
├── main.ts                # Bootstrap — waits for DOM and Solace SDK, calls kernel.start()
├── variants/              # Variant manifests — id → priority maps for build variants
└── modules/
    ├── connections/                   # Priority 100 — Solace client + SEMP connection management
    ├── queue-browser/                 # Priority 80  — Message browsing, filtering, forwarding, deletion
    ├── queue-copy/                    # Priority 70  — Cross-broker queue copy/move
    └── queue-subscription-explorer/   # Priority 45  — (VPN, queue, topic) subscription table
```

Each module is a plain object implementing `PwaModule`:
```ts
interface PwaModule {
    name: string;         // Display name for sidebar
    id: string;           // Unique slug
    icon?: string;        // SVG markup
    install(app: AppContext): Promise<void>;  // The module entry point
}
```

Priority (install order + sidebar position) is set in the active variant manifest under [`src/variants/`](../src/variants/) — an `id → priority` map. The kernel constructor takes `RegisteredModule[]` (assembled by `src/registry.ts` via `import.meta.glob` against the manifest) and sorts descending by priority before installing.

The `AppContext` received by each module's `install()` includes:
- `container` — The module's private DOM subtree (cloned from an HTML `<template>`)
- `appState` — Read-only reference to global state
- `eventBus` — The shared typed event bus
- `setState(key, value)` — Triggers state change and emits `app:state-change`
- `loadSelf()` — Navigates to this module's view
- `sempFetch(url, opts)` — HTTP fetch with auto-injected SEMP Basic auth
- `copyToClipboard(text, btn?)` — Writes to clipboard with optional button feedback
- `config` — Application-level configuration flags

This architecture is the cornerstone of testability: every module is instantiated by passing a mock `AppContext`, eliminating any dependency on global variables, browser APIs, or other modules.

### Internal Module Decomposition

The largest module (queue-browser) is further decomposed into single-responsibility units:

| File | Responsibility |
|------|---------------|
| `module.ts` | DOM wiring — registers all click handlers and EventBus listeners |
| `service.ts` | Broker operations — create browser, forward message, delete message |
| `service-events.ts` | Broker event callbacks — onMessage, onBrowserUp, onConnectFailed |
| `state.js` | Local state — message store, active browsers, filter state |
| `ui-core.js` | DOM queries — element caching, visibility, counts |
| `ui-events.ts` | User action logic — bind/unbind, bulk delete, filter application |
| `ui-table.ts` | Message table rendering, row attachment, ZIP download |
| `ui-details.ts` | Detail panel rendering, property display, filter row management |
| `ui-forward.js` | Forward modal state and ACK/REJECT status rendering |

This decomposition means each file has a narrow contract, making it straightforward to test in isolation.

---

## Testing Methodology

### Approach: Isolation-First with Shared Infrastructure

The test strategy is **black-box unit testing at the module boundary**, with each source file tested through its exported API. Tests do not reach into internal implementation details; they exercise exported functions, observe DOM state mutations, and verify EventBus events.

The key constraint is that this is a browser application relying on:
1. The Solace SDK (`window.solace`) — a commercial third-party library that cannot run in Node.js
2. A rich DOM (100+ elements per module) — managed via jsdom
3. External APIs (SEMP over HTTPS) — mocked via `vi.fn()`

These three constraints shape every decision in the test design.

### Core Philosophy: Mock the Platform, Test the Logic

The tests mock the **platform layer** (Solace SDK, DOM APIs, HTTPS) but exercise real **application logic** in full. The Solace SDK mock replicates the entire API surface: session factory, browser factory, message construction, event codes, delivery modes, and message types. Because the mock is faithful to the API shape, the application code under test runs without modification.

### Testing Stack

| Concern | Tool |
|---------|------|
| Test runner | Vitest 4.x |
| DOM environment | jsdom (via `environment: 'jsdom'` in vitest config) |
| Code coverage | `@vitest/coverage-v8` with v8 provider |
| Mocking | Vitest's built-in `vi.fn()`, `vi.spyOn()` |
| Multi-file stability | `--pool=threads --maxWorkers=8` (configured in `package.json` npm scripts) |

---

## Test Infrastructure and Configuration

### vitest.config.ts

```ts
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'html', 'lcov'],
            reportsDirectory: './coverage',
            all: true,
            thresholds: {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100
            },
            include: ['src/**/*.{ts,js}'],
            exclude: ['src/css/**', 'src/index.html']
        }
    }
});
```

The `all: true` directive is significant — it forces coverage to be reported even for source files that have no corresponding test file at all. Without this, a file could be silently excluded from coverage. Combined with 100% thresholds, any file missing from test coverage causes the build to fail.

### tests/setup.ts — The Global Test Environment

The setup file runs before every test file and establishes the simulated browser environment. It has three categories of responsibility:

#### 1. Browser API Stubs

These replace browser globals that jsdom either omits or provides incompletely:

```ts
// localStorage — in-memory Map with the standard API
const localStorageMock = { getItem: vi.fn(), setItem: vi.fn(), ... };
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Clipboard API
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) }
});

// fetch — global mock for SEMP HTTP calls
global.fetch = vi.fn();

// Blob URL generation (for ZIP downloads)
URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Confirm/alert — required for delete confirmations
global.confirm = vi.fn().mockReturnValue(true);
global.alert = vi.fn();
```

#### 2. The Solace SDK Mock (`createSolaceMock`)

The most complex piece of infrastructure. The Solace SDK is a large commercial JavaScript library (`solclient.js`) that cannot execute in Node.js. The mock reproduces its full API shape:

```ts
function createSolaceMock() {
    return {
        SolclientFactory: {
            init: vi.fn(),
            createSession: vi.fn(() => createSessionMock()),
            createMessage: vi.fn(() => ({ ... message methods ... })),
            createTopicDestination: vi.fn(name => ({ name })),
            createDurableQueueDestination: vi.fn(name => ({ name })),
        },
        SessionProperties: vi.fn(),
        QueueBrowserProperties: vi.fn(),
        SessionEventCode: {
            UP_NOTICE: 'UP_NOTICE',
            CONNECT_FAILED_ERROR: 'CONNECT_FAILED_ERROR',
            DISCONNECTED: 'DISCONNECTED',
            ACKNOWLEDGED_MESSAGE: 'ACKNOWLEDGED_MESSAGE',
            REJECTED_MESSAGE_ERROR: 'REJECTED_MESSAGE_ERROR',
        },
        MessageType:     { TEXT: 0, BINARY: 1, MAP: 2, STREAM: 3 },
        MessageDeliveryModeType: { DIRECT: 0, PERSISTENT: 1, NON_PERSISTENT: 2 },
        DestinationType: { TOPIC: 0, QUEUE: 1 },
        SDTFieldType:    { STRING: 0, MAP: 1, STREAM: 2 },
        AuthenticationScheme: { BASIC: 'BASIC', OAUTH2: 'OAUTH2' },
    };
}
```

The session mock separately handles queue browser creation with proper event callback wiring:

```ts
function createSessionMock() {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        dispose: vi.fn(),
        send: vi.fn(),
        on: vi.fn(),
        createQueueBrowser: vi.fn(() => createBrowserMock()),
    };
}

function createBrowserMock() {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        dispose: vi.fn(),
        on: vi.fn(),   // Event registration
        removeMessageFromQueue: vi.fn().mockReturnValue(true),
    };
}
```

#### 3. Per-Test Reset Hooks

```ts
beforeEach(() => {
    vi.clearAllMocks();       // Resets call counts/return values on all mocks
    localStorageMock.clear(); // Empties the in-memory localStorage
    document.body.innerHTML = ''; // Tears down the entire DOM
});

afterEach(() => {
    vi.restoreAllMocks();     // Restores original implementations of spied functions
});
```

This ensures complete isolation between tests. DOM teardown is critical because modules cache DOM element references — if a previous test's DOM elements leaked into the next test, element lookups would produce stale or duplicate references.

### Pool Configuration

The npm scripts run `vitest` with `--pool=threads --maxWorkers=8`. The thread pool is faster than the fork pool and is currently stable for this codebase (23 files, ~16 s end-to-end). If multi-file instability returns (`"Vitest failed to find the runner"` and similar), `--pool=forks` is the documented fallback — it spawns each file in its own OS process at the cost of higher startup overhead.

---

## Unit Testing — What Is Tested and How

### Pattern: DOM Container Construction + Module Installation

Every module test begins with the same setup ritual:

1. **Build a complete DOM container** matching what the Kernel would inject from the HTML template
2. **Construct a mock `AppContext`** with `vi.fn()` stubs for all injectable services
3. **Call `module.install(ctx)`** to run the real initialization code
4. **Interact with DOM elements** (click buttons, dispatch events, change input values)
5. **Assert DOM mutations, mock call counts, and state changes**

```ts
// Typical beforeEach in a module test — uses the real per-module template
// via loadModuleDOM, so the test DOM cannot drift from the production HTML.
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

beforeEach(async () => {
    container = loadModuleDOM('connections');   // reads src/modules/connections/index.html

    ctx = {
        container,
        appState: { isConnected: false, isSempConnected: false, ... },
        eventBus: createEventBus(),   // Real EventBus — not mocked
        setState: vi.fn(),
        loadSelf: vi.fn(),
        sempFetch: vi.fn(),
        copyToClipboard: vi.fn(),
        config: {}
    } as AppContext;

    await ConnectionsModule.install(ctx);
});
```

The hand-rolled `container.innerHTML = '<long HTML string>'` pattern that earlier
revisions of this report described has been removed across all module-level
tests. Inline `innerHTML` is still acceptable for tests that **deliberately**
exercise a partial or malformed DOM (verifying defensive paths) — those should
keep an inline literal with only the elements they need.

The **real EventBus** is used (not mocked) because many tests verify cross-module communication by asserting that events were emitted and received. Mocking the EventBus would require asserting `emit()` was called with the right arguments — but using the real EventBus lets tests register listeners and verify they fire, which is both more realistic and more thorough.

### Core Module Tests

#### `tests/core/event-bus.test.ts`

Tests the fundamental guarantees of the pub/sub system:

- `on()` registers handlers; `emit()` calls all registered handlers for that event
- `off()` removes a specific handler without affecting others
- Duplicate handler registration is idempotent (Set-based storage)
- An error thrown inside one handler does not prevent other handlers from running
- Typed events: `void` events and complex payload objects both work
- Handlers receive the exact payload passed to `emit()`

#### `tests/core/kernel.test.ts`

The Kernel is the most complex component to test because it manages the entire DOM and module lifecycle. Tests build a minimal HTML structure matching what `index.html` provides:

```ts
beforeEach(() => {
    document.body.innerHTML = `
        <nav id="sidebar-nav"></nav>
        <div id="module-container">
            <template data-module-id="mod-a"><div class="module-view"></div></template>
            <template data-module-id="mod-b"><div class="module-view"></div></template>
        </div>
        <span id="status-indicator-client"></span>
        <span id="status-indicator-semp"></span>
        ...
    `;
});
```

Key test categories:
- **Priority ordering**: Two mock modules with priorities 50 and 100 — verified that the priority-100 module installs first
- **State propagation**: `kernel.setState('isConnected', true)` triggers `app:state-change` on the EventBus with the correct payload
- **Navigation**: `kernel.navigateTo('mod-b')` adds `.active` to `mod-b`'s nav item and removes `.hidden` from its view
- **SEMP auth injection**: `sempFetch()` adds the correct `Authorization: Basic <base64>` header from stored credentials
- **401 handling**: SEMP 401 response triggers SEMP disconnect and state update
- **Template validation**: Module with missing template is skipped gracefully — other modules still install
- **JSZip bridging**: `window.dispatchEvent(new Event('jszip:loaded'))` causes the Kernel to emit `jszip:loaded` on the EventBus

#### `tests/core/services/solace-client.test.ts`

Pure-factory tests for the Solace SDK wrapper. After the connection-libraries-to-core refactor, the factory takes lifecycle hooks instead of `AppContext` — tests stub the hooks with `vi.fn()` and assert they're invoked at the right SDK lifecycle moment. No DOM or EventBus is needed: bridging from factory hooks to `ctx.setState` + bus emits is tested separately in [tests/modules/connections/module.test.ts](../tests/modules/connections/module.test.ts) under the "Solace bridging hooks" describe block.

```ts
it('fires onConnected with session and vpn on UP_NOTICE', () => {
    const hooks = makeHooks();
    const service = createServiceSolace(hooks);
    service.init();
    service.connect(baseCfg({ vpn: 'my-vpn' }), 'broker.test', 'admin');

    const sessionMock = solaceMock.SolclientFactory.createSession.mock.results[0].value;
    const upHandler = sessionMock.on.mock.calls.find((c) => c[0] === 'UP_NOTICE')[1];
    upHandler();

    expect(hooks.onConnected).toHaveBeenCalledWith(sessionMock, 'my-vpn');
});
```

The pattern of extracting the registered callback from `mock.calls` is used throughout the service tests. This directly tests the event wiring that the production code establishes with the Solace SDK. The companion file `tests/core/services/semp-client.test.ts` follows the same pattern for the SEMP factory, with hooks for `onConnected(sempCtx, creds)`, `onAuthFailed`, and `onError({ message, isNetworkError, isTimeout, baseUrl })`.

#### `tests/modules/queue-browser/service-events.test.ts`

This is the most complex service test file because `onMessage()` handles many variations:

- **Message type detection**: TEXT (0), BINARY (1), MAP (2), STREAM (3)
- **Content extraction priority**: SDT container → binary attachment → XML → empty
- **Binary decoding**: String → Uint8Array (TextDecoder) → ArrayBuffer → unknown object
- **SDT types**: STRING, MAP (→ `[SDT Map Data]`), STREAM (→ `[SDT Stream Data]`), unknown
- **Timestamp handling**: numeric timestamp, `{ toNumber() }` object, null (→ `'(No Timestamp)'`)
- **Property extraction**: getUserPropertyMap keys with getValue() vs raw values
- **Filter application**: message stored but not displayed when active filters reject it
- **Non-active queue**: message stored in `messageStore` but UI not updated

Each of these represents a real production scenario that affects what the user sees in the UI.

#### Queue Browser No-Payload Flavor Tests

The no-payload build flavor (`VITE_SHOW_PAYLOAD=false`, see [developer-guide.md → Build-time feature flags](developer-guide.md#build-time-feature-flags)) gates payload behavior on `showPayload()`. Two files cover it:

- `tests/modules/queue-browser/features.test.ts` mirrors `features.ts` — the flag defaults to `true`, returns `false` only for the exact string `'false'`, and `true` otherwise (driven via `vi.stubEnv`).
- `tests/modules/queue-browser/no-payload.test.ts` is a cohesive flag-off spec rather than a per-source mirror, because the flavor is cross-cutting: it stubs the env, installs the real module against `loadModuleDOM('queue-browser')`, and asserts the flag-off branch of each gated function — DOM removal of `[data-payload]` nodes, `service-events` never putting `content` on the stored message, `createRowHtml` omitting the download buttons, and the filter/reset/detail/forward handlers running without touching the removed elements. The payload-on (default) branches stay covered by the per-source-file suites.

Gates were added only to code that runs in **both** flavors, so both branches are reachable; leaf functions reachable only via removed buttons (e.g. `downloadMessagesZip`, `getFullMessageJson`) are left unguarded and stay covered by the default suites — adding an off-branch guard there would create an uncovered branch.

### Queue Browser State Tests

#### `tests/modules/queue-browser/state.test.ts`

`state.js` contains `shouldShowMessage()`, a pure function implementing the multi-criteria filter logic. Because it is pure (takes input, returns boolean), it is exceptionally straightforward to test with a matrix of inputs:

```ts
describe('shouldShowMessage() filter logic', () => {
    it('returns true when no filters are active (all ANY)', ...)
    it('filters by content substring (case-insensitive)', ...)
    it('filters by content with wildcard (* glob)', ...)
    it('filters by message ID', ...)
    it('filters by destination name', ...)
    it('filters by message type (Text, Binary, Map, Stream)', ...)
    it('applies OR criteria: passes if any condition matches', ...)
    it('applies AND criteria: requires all conditions to match', ...)
    it('filters by standard property (case-insensitive key)', ...)
    it('filters by app property', ...)
    it('returns false when property filter fails in AND mode', ...)
});
```

The filter function is one of the most business-critical pieces of logic in the application — it determines what messages a user sees when browsing a queue. Testing the full combinatorial space of filter criteria, including wildcard matching and property-level filtering, ensures correctness.

### UI Handler Tests

The UI handler files (`ui-events.ts`, `ui-table.ts`, `ui-details.ts`) are tested by verifying that user interactions produce the correct service calls and DOM mutations.

A typical pattern from `ui-events.test.ts`:

```ts
describe('handleBulkDelete()', () => {
    it('deletes all selected messages and shows success', async () => {
        // Arrange: render messages and check some
        state.displayedMessages = [
            { id: 'msg-1', ... },
            { id: 'msg-2', ... }
        ];
        ui.renderList();
        document.querySelectorAll('.msg-check').forEach(cb => cb.checked = true);

        (globalThis.confirm as any).mockReturnValue(true);
        service.deleteMessages.mockReturnValue({ ok: true, count: 2 });

        // Act
        await uiEvents.handleBulkDelete();

        // Assert
        expect(service.deleteMessages).toHaveBeenCalledWith('q1', ['msg-1', 'msg-2']);
        expect(globalThis.alert).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('does nothing when user cancels confirmation', async () => {
        (globalThis.confirm as any).mockReturnValue(false);
        await uiEvents.handleBulkDelete();
        expect(service.deleteMessages).not.toHaveBeenCalled();
    });
});
```

Every user-facing action is tested from both the "happy path" and the "cancelled/failed" angles. The `confirm` mock is used to test confirmation dialogs without any browser UI.

---

## Integration Testing — How Cross-Module Flows Are Tested

Three files live under `tests/integration/`, with different scopes.

### `tests/integration/full-flow.test.ts` — Kernel mechanics

Narrow and focused on one thing: **verifying that the Kernel plus two installed modules share EventBus identity and propagate state through it**. Uses lightweight stub modules (not the real `modules` array from `registry.ts`) and exercises 3 scenarios:

1. Two modules installed by the same Kernel receive the same `EventBus` instance through `AppContext`.
2. A `setState` call during `install()` reaches a same-module EventBus subscriber via the emitted `app:state-change` event.
3. An event emitted on one module's `ctx.eventBus` is delivered to a handler registered on another module's `ctx.eventBus` (proving the bus is shared, not duplicated per module).

### `tests/integration/module-events.test.ts` — Real cross-module flows

Installs the real `ConnectionsModule` and `QueueBrowserModule` against `loadModuleDOM` containers with a shared `EventBus`, then drives cross-module event sequences. Service factories (`queue-browser/service` and the lifted `core/services/solace-client` + `core/services/semp-client`) are mocked at the top of the file via `vi.mock` so tests are deterministic and free of broker/network I/O. Scenarios:

1. **VPN-switch handoff.** Emit `connection:check-connection` with Connections pre-set to connected-same-VPN; asserts Connections synchronously emits `browser:browse-queue`, QueueBrowser calls `loadSelf()`, the 200 ms auto-bind timer fires, and `service.createBrowser('test-queue-1')` is invoked.
2. **`config:max-messages-changed` propagation.** Emit the event with `{ value: 5 }`; asserts `state.maxMessagesPerQueue = 5` and that six subsequent `ingestMessage()` calls leave only five messages (oldest shifted).
3. **Disconnect wiring.** Emit `client:disconnected` with `forwardQueue` seeded with SENDING + QUEUED + DONE items; asserts `service.disconnectAll` fires once and `ui.updateForwardItemStatus` is called for SENDING and QUEUED only (DONE left alone).

### `tests/integration/message-pipeline.test.ts` — End-to-end message ingestion

Installs `QueueBrowserModule` with real services and fires broker-shaped Solace messages through `service-events.onMessage`. No module mocking — the full pipeline runs: `onMessage` unwraps payload → `ingestMessage` enforces moving-window cap → `shouldShowMessage` evaluates active filters → `ui.addMessageRow` renders a DOM row. Four scenarios:

1. **Content filter gates DOM rows.** With `state.activeFilters.content = 'alpha'`, two messages arrive ('alpha payload' matches, 'beta payload' does not). Store holds both; DOM has exactly one `<tr>`.
2. **Filter cleared mid-stream does not retroactively re-render.** Filter is evaluated at arrival, not render — a design choice this test locks in.
3. **Messages for a non-current queue ingest but don't touch the DOM.** `state.currentQueue` gates DOM updates.
4. **Destination-type filter uses `window.solace.DestinationType`.** Locks in the S3 cleanup that removed the `if (window.solace)` guard.

### What Is NOT Covered

The full connect→browser lifecycle with a stub session driving `BROWSER_UP_NOTICE` (covered adequately by queue-browser unit tests), and `EventBus.hold/release` with real modules (no event currently uses hold/release in production). The real user journey of typing credentials → clicking Connect → receiving messages is not exercised end-to-end either; those behaviors are individually verified by per-module unit tests.

### Why These Count As Integration Tests

All three files use the **real `EventBus` factory** and exercise **multiple modules simultaneously** through shared infrastructure. `module-events.test.ts` verifies that each module's actual `eventBus.on(...)` subscriptions fire when a peer module emits — the one class of bug unit tests cannot catch (wrong event name, mismatched payload shape, missing subscription). `message-pipeline.test.ts` goes further still, running the data pipeline end-to-end with real state + real filtering + real DOM rendering.

### What Integration Testing Does NOT Cover

The integration tests deliberately do not test the Solace SDK broker connection, which would require a live Solace broker. The `window.solace` mock from `setup.ts` is in scope throughout all tests, including integration tests. The integration tests focus on **module coordination** — whether the modules talk to each other correctly — not on the fidelity of the broker connection itself. Broker behaviour is covered by the service-level unit tests using the detailed Solace SDK mock.

---

## The v8 Coverage Ignore Strategy

### Why 100% Coverage Requires Selective Exclusions

When enforcing 100% branch coverage, every `if` statement must have both its true and false paths exercised. In a browser application driving DOM manipulation, many conditional branches protect against states that are architecturally impossible to reproduce in a test environment. Forcing tests to manufacture these impossible states would produce either:

1. **Fragile tests** that set up contrived DOM configurations just to hit a one-line guard
2. **False coverage** — covering the line but not the actual user-facing behaviour
3. **Test maintenance burden** — these null-guard tests break when surrounding code changes

In all three cases, the test adds no value. The v8 coverage ignore directives are the principled alternative.

### The Key Technical Finding: `/* v8 ignore next */` vs `/* v8 ignore start/stop */`

During development, a critical discovery was made:

> **`/* v8 ignore next N */` suppresses statement and line coverage but does NOT reliably suppress branch coverage.**

This is a subtle but important distinction. Branch coverage tracks every decision point — the true path and the false path of every `if`, every `||`, every `&&`. When v8 instruments the bytecode, it creates separate coverage ranges for the "skipped" side of a branch. The `/* v8 ignore next N */` directive tells the instrumenter to skip the next N *source lines*, but the "false path" branch jump is represented as a bytecode range with no explicit source line — it may not map cleanly to the N lines being ignored.

The `/* v8 ignore start */` ... `/* v8 ignore stop */` form wraps an entire source section and excludes ALL coverage ranges within it — statements, lines, functions, AND branch transitions — regardless of how the bytecode is structured. This is the only reliable form for suppressing branch coverage in this codebase.

**All `/* v8 ignore next */` usages were converted to `/* v8 ignore start/stop */` blocks** during the final coverage pass.

### Categories of Ignored Code

#### Category 1 (obsolete): DOM Element Null Guards on Module-Owned Elements

Earlier revisions of the codebase wrapped every `if (els.foo) els.foo.addEventListener(...)`
guard around module-owned elements in a `/* v8 ignore start -- button always exists
in module container */` block. That entire category has been **eliminated**.

Module-owned elements (every element declared inside the module's own `<template>`)
are now captured with the `required<T>(container, selector)` helper in
[`src/core/dom.ts`](../src/core/dom.ts), which throws at install time if the
selector yields null. Downstream code can treat the return value as non-null,
so the `if (els.foo)` guard (and the accompanying ignore) simply isn't written:

```ts
const btnSave = required<HTMLButtonElement>(container, '#btn-save');
btnSave.addEventListener('click', () => { ... });   // no null-guard, no ignore
```

Only genuinely optional elements (e.g. `.btn-delete-row`, which is conditionally
rendered for non-read-only queues) still use nullable `querySelector` + an
`if (el)` guard, and those carry real tests for both branches rather than
ignoring the falsy path.

**Anti-pattern reminder:** DOM null-guards on required elements are no longer
a valid v8 ignore category. If you find one, convert it to `required()`.

#### Category 2 (obsolete): Disabled Button Wiring in Queue Browser

The queue-browser bulk action buttons (Forward, Delete, Download Content/Full)
used to wrap their registration in a `/* v8 ignore start -- buttons disabled
in jsdom */` block because jsdom doesn't honour the `disabled` attribute for
click events. That ignore was **removed** — the solution was to add 5 narrow
wiring tests in `module.test.ts` that set `btn.disabled = false` and click
the button, asserting the matching `ui.*` / `ctx.copyToClipboard` was called.
The handler bodies continue to be tested separately and thoroughly in
`ui-events.test.ts`; the wiring tests now prove the click routes through
to them.

#### Category 3: DOMContentLoaded in jsdom (`main.ts`)

```ts
/* v8 ignore start -- jsdom readyState is always 'complete', can't test this branch */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
/* v8 ignore stop */
    boot();
}
```

In jsdom, `document.readyState` is always `'complete'` at test execution time — there is no way to simulate the browser's loading lifecycle where the DOM is partially parsed. This branch is a standard web development guard pattern (`readyState === 'loading'`) that is untestable in jsdom by design.

#### Category 4: Solace Callback Null Guards

```ts
/* v8 ignore start -- null guard inside Solace event callback; button always exists at event time */
if (btn) {
    btn.textContent = 'Connected';
    btn.disabled = false;
}
/* v8 ignore stop */
```

Event callbacks registered with the Solace SDK fire asynchronously from within the SDK's internal event loop. At the time the callback fires, the button is always present in the DOM (the module is fully initialized before any broker event can arrive). Testing the null path would require manually triggering the SDK callback after the button has been removed from the DOM — an artificial state that cannot occur in normal operation.

#### Category 5: Redundant Safety Guards

```ts
} else {
    state.allMessages = [];
    /* v8 ignore start -- redundant check; both branches result in allMessages = [] */
    if (!ctx.config.useMocks && !state.messageStore.has(qName)) {
        state.allMessages = [];
    }
    /* v8 ignore stop */
}
```

This guard was written defensively — the outer `else` already handles the no-store case, making the inner check redundant. Both the true and false paths of the inner `if` result in `state.allMessages = []`. The false path (when `ctx.config.useMocks` is true) would only produce different observable behaviour if the surrounding logic were changed — it has no effect as currently written.

#### Category 6: safeSet Inner Function — historical

> **Status:** the v8 ignore around `safeSet` was lifted in the post-April 2026 tightening (see the "removed categories" list below). `safeSet` now also returns `boolean` so the SDT/XML/Binary content-fallback chain can short-circuit with `safeSet(A) || safeSet(B) || safeSet(C)` instead of a `contentSet` sentinel. This section is retained for context on why the ignore existed.

```ts
const safeSet = (setter: string, getter: string): boolean => {
    try {
        if (typeof originalMsg._originalMsg[getter] === 'function') {
            const val = originalMsg._originalMsg[getter]();
            if (val !== null && val !== undefined) {
                newMsg[setter](val);
                return true;
            }
        }
    } catch (e) {
        console.warn(`Failed to set ${setter}`, e);
    }
    return false;
};
```

v8 originally counted this inner arrow function as a separate function entity in its coverage ledger, independent from the `forwardMessage` function that contains it. Despite the tests exercising `forwardMessage` with real getter functions (covering the inner logic), v8's function-level tracking reported `safeSet` as a distinct uncovered function. Once the ignore was lifted, the existing `forwardMessage` tests were sufficient to register the branches — no new tests needed.

#### Category 7 (obsolete): `else if` Chain Bytecode Artifacts

> **Status:** removed in the May 2026 sweep (COV-16). The artifact was diagnosed by reading lcov directly: `DA:165=42 → DA:166=5 → DA:167=3 → DA:168=2`, which mathematically proves the falsy branch of `else if (getType() === MAP)` IS being exercised (line 168 can only be reached when line 167 evaluates falsy). v8's basic-block instrumentation collapses some block IDs on chained `else if (method() === X)` patterns and doesn't propagate the BRDA hit count, but the underlying logic is fully tested. Resolution: added an explicit "unknown message type" test in [`tests/modules/queue-browser/service-events.test.ts`](../tests/modules/queue-browser/service-events.test.ts) that returns a non-enum value from `getType()` so v8 sees an unambiguous fallthrough path. The previously-ignored block now reports 100% branch coverage without any `/* v8 ignore */` markers.

### Summary of v8 Ignore Philosophy

| Scenario | Why Ignored | Alternative Considered | Why Rejected |
|----------|-------------|----------------------|--------------|
| DOMContentLoaded branch | jsdom readyState always `'complete'` | Manipulate jsdom internals | Unsupported by jsdom API |
| Defensive SDK catch (session already disposed) | SDK can legitimately throw on a stale reference; catch exists for this | Force the SDK to throw from the test | Already tested via mock where tractable; remainder is environmental |
| Solace `DestinationType` enum branches in ui-details | `window.solace` is mocked but certain type-code paths require specific SDK internals | Stub more of the SDK type machinery | Mock fidelity gap tracked as Priority 6.6 |

Categories **removed** from this table after the post-April 2026 tightening (and extended in the May 2026 sweep):
- *"DOM element null guards"* — converted to `required()`.
- *"Disabled button handlers"* — wiring tests added in `module.test.ts`.
- *"Redundant inner checks with `useMocks: true`"* — `useMocks` config was removed when mocks moved to file-level service swaps.
- *"`safeSet` function entity"* — ignore removed; branches are covered by existing tests once the marker was lifted.
- *"`else if` chain artifacts"* (May 2026, COV-16) — diagnosed as a v8 instrumentation false-negative on chained `else if (method() === X)` patterns and resolved with an explicit unknown-type fallthrough test rather than an ignore.

---

## Coverage Results

### Most Recent Run (post May 2026 sweep)

```
=============================== Coverage summary ===============================
Statements   : 100% ( 2229/2229 )
Branches     : 100%  ( 862/862 )
Functions    : 100%  ( 347/347 )
Lines        : 100% ( 2006/2006 )
================================================================================
```

Every source file in the coverage scope (`src/**/*.{ts,js}` minus `src/css/**`, `src/index.html`) reports 100% / 100% / 100% / 100%. Re-running `npm run test:coverage` after any change is the canonical way to confirm — the snapshot above is from the May 2026 sweep close-out run.

### Test Counts by File

| Test File | Tests |
|-----------|-------|
Current files in the test tree:

- **core/** — `dom.test.ts`, `event-bus.test.ts`, `kernel.test.ts`, `toast.test.ts`, `utils.test.ts`
- **core/connections/** — `defaults.test.ts`, `persistence-compat.test.ts`
- **core/services/** — `solace-client.test.ts`, `solace-publisher.test.ts`, `semp-client.test.ts`, `semp-discovery.test.ts`, `sempContext.test.ts`
- **core/components/queue-picker/** — `picker.test.ts`
- **connections/** — `config.test.ts`, `module.test.ts`, `ui.test.ts`
- **queue-browser/** — `module.test.ts`, `service.test.ts`, `service-events.test.ts`, `state.test.ts`, `ui-core.test.ts`, `ui-details.test.ts`, `ui-events.test.ts`, `ui-forward.test.ts`, `ui-table.test.ts`
- **queue-copy/** — `module.test.ts`, `service.test.ts`, `service-copy.test.ts`, `service-copy-mock.test.ts`, `service-verify.test.ts`, `service-verify-mock.test.ts`, `state.test.ts`, `ui-events.test.ts`, `ui-modal.test.ts`, `ui.test.ts`
- **queue-subscription-explorer/** — `module.test.ts`, `service.test.ts`, `parse.test.ts`, `ui.test.ts`
- **integration/** — `full-flow.test.ts`, `module-events.test.ts`, `message-pipeline.test.ts`
- **top-level** — `main.test.ts`, `registry.test.ts`

Per-file counts shift with every audit pass (tests added for coverage, tests deleted when their guard was removed, ceremonial tests replaced with substantive ones); re-run `npm test` for up-to-the-minute numbers rather than relying on a static table.

---

## Key Technical Challenges and Solutions

### Challenge 1: Testing a Commercial SDK Without the SDK

The Solace SDK cannot run in Node.js. It relies on WebSocket and browser-specific networking APIs. The solution is the `createSolaceMock()` factory in `tests/setup.ts`, which replicates the full API surface using `vi.fn()` stubs. The mock is exposed as `window.solace` (matching production), so module code that declares `declare const solace: any` and references `solace.MessageType.TEXT` reads from the mock transparently.

The critical insight is that the mock must be *structurally faithful* — not just present. The `createSessionMock()` returns an object whose `on()` method can be interrogated for registered callback handlers:

```ts
const upHandler = sessionMock.on.mock.calls
    .find(call => call[0] === solace.SessionEventCode.UP_NOTICE)[1];
upHandler({ sessionProperties: { ... } }); // Simulates broker event
```

This allows testing the full event-driven connection lifecycle without a real broker.

### Challenge 2: Shared Singleton State Between Tests

Several modules (`state.js`, `ui-core.js`) export singleton objects that accumulate state across calls. Without proper reset between tests, mutations from one test contaminate the next.

The solution is twofold:
1. `document.body.innerHTML = ''` in `beforeEach` clears the DOM, which forces `ui.initElements()` to rebuild the element cache on next call
2. `state.messageStore.clear()`, `state.currentQueue = ''`, etc. are called explicitly in `beforeEach` blocks in each test file that uses the state module

Where singleton state couldn't be cleanly reset (rare cases), the tests follow the "install, null specific property, trigger event, restore" pattern:

```ts
it('checkAll handler with null msgList does not throw', async () => {
    await QueueBrowserModule.install(ctx);         // Full install with real DOM
    const cached = ui.getElements();
    const savedMsgList = cached.msgList;
    cached.msgList = null;                         // Simulate the guard condition
    cached.checkAll.dispatchEvent(new Event('change'));  // Trigger the handler
    cached.msgList = savedMsgList;                 // Restore for cleanup
});
```

### Challenge 3: Worker Instability With 23 Parallel Test Files (Historical)

Early in development, `npx vitest run --coverage` on the default thread pool occasionally produced `"Vitest failed to find the runner"` crashes. The team switched to `--pool=forks` for stability at the cost of startup overhead.

Subsequent Vitest 4.x releases stabilized thread-pool behaviour for this workload, and the current configuration is `--pool=threads --maxWorkers=8`. `--pool=forks` remains available as a fallback if regressions appear.

### Challenge 4: `/* v8 ignore next */` Not Suppressing Branch Coverage

The standard single-line ignore directive suppresses statement and line coverage metrics but leaves branch coverage intact. v8's coverage instrumentor tracks branch transitions as bytecode ranges that may not map cleanly to source line numbers. Only the `start/stop` block form excludes all coverage range types — including the implicit "branch not taken" ranges that have no corresponding source line.

Every instance of `/* v8 ignore next N */` in the codebase was audited and converted to an equivalent `/* v8 ignore start */` ... `/* v8 ignore stop */` block before the final 100% coverage target was reached.
