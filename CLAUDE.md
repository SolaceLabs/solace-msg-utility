# Project Conventions for Claude

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## API to Backend LLM server

Do not include `context_management` variable — extra inputs are not permitted in the custom LLM endpoint.

## DOM Access (Required-Element Policy)

Module-owned DOM elements — those declared inside the module's own `<template>` — are captured via the `required()` helper in [src/core/dom.ts](src/core/dom.ts):

```ts
import { required } from '../../core/dom';

const btnCopy = required<HTMLButtonElement>(container, '#btn-copy-config');
// downstream code accesses `btnCopy` directly — no null-guard, no `!`
btnCopy.disabled = false;
```

- **Why:** the helper throws `Required element missing: <selector>` at install time, giving a loud, clear signal instead of silent partial wiring. Downstream code treats the return value as non-null.
- **Where it applies:** every element the module *owns* (its buttons, inputs, modals, lists). This includes elements accessed through shared `cacheElements`/`initElements` caches.
- **Where it does NOT apply:** genuinely optional elements — e.g., `.btn-delete-row` which is conditionally rendered for non-read-only queues. Those stay as `querySelector` with a nullable guard.
- **Anti-patterns banned:**
  - `if (els.foo) els.foo.xyz()` on required elements — use `required()` and drop the guard.
  - `/* v8 ignore */` around null-guards on required elements — not allowed. If the element is required, assert it; if it's optional, write a test for the missing-element path.
  - Non-null assertions (`els.foo!`) as a shortcut — `required()` is preferred because it fails with a descriptive error instead of a generic `Cannot read properties of null`.

## Coverage Policy

- **Target is 100%** on statements, branches, functions, and lines. `vitest.config.ts` sets the thresholds to 100 so `./scripts/dev.sh cov` emits an `ERROR: Coverage for … does not meet global threshold (100%)` whenever a metric slips. **The suite currently meets it on all four metrics** — keep it there. The target applies to the lines you add or change: code you touch must be fully covered by tests in the same change.
- **The previous total in `scripts/logs/cov.log` is the local floor.** `cov` prints and logs the web and Go totals. CI is a fresh checkout with no prior log, so it cannot catch a coverage regression — that check only exists locally.
- **v8 ignores are a last resort.** Valid categories only: jsdom environment limitations (e.g., `document.readyState === 'loading'`), SDK callbacks the test harness can't fire, defensive `catch` around contracts that never throw. DOM null-guards on required elements are NOT a valid category — convert them to `required()`.
- Every `/* v8 ignore */` must have an inline comment explaining why the code is architecturally untestable.
- Tests should be solid and reflective of real-world scenario. It should not be ceremonial. Don't add tests that don't add value. Reviewers are expected to point out where tests can be removed or improved.

## The Credential Transform Is Undocumented By Policy

The construction behind [src/core/encode.ts](src/core/encode.ts) must never be described in `docs/`, `README.md`, or `CLAUDE.md`. Say what a value **is** ("packed with the deployment site seed") and what the posture guarantees (just-in-time unpack, non-extractable key, plaintext never stored) — never how it is built. `npm run check:docs` ([scripts/check-docs-secrecy.mjs](scripts/check-docs-secrecy.mjs)) enforces this and runs in CI. It is a guard against accidental documentation, not a security boundary.

## Tests and Documentation Stay In Sync With Code

When you change behavior, **update the relevant tests and documentation in the same change** — don't leave them for later.

- **Tests** — add or update tests in `tests/` for any new behavior, contract change, or removed code path. Keep mirrored layout (`src/foo/bar.ts` → `tests/foo/bar.test.ts`). If you remove an `if`/guard/branch, also remove or repurpose the test that exercised it. If you add a new branch (new error code, new fallback, new event), add the test that covers it.
- **Documentation** — when behavior crosses into the architecture (new pattern, new convention, new module-level invariant, new build mode), update the relevant doc:
  - `docs/architecture.md` — system diagrams, module decomposition, data flow, new architectural patterns (e.g. async-generator pagination, required-element invariant).
  - `docs/contributing.md` — coding standards, test patterns, test-isolation hooks, v8 ignore policy, PR checklist items.
  - `docs/developer-guide.md` — module-creation walkthrough, test-authoring conventions a new contributor needs to follow.
  - `docs/test-report.md` — when a test file is added/removed, the total count shifts noticeably, or the test infrastructure itself changes (new helper, new global hook, new v8-ignore category). Also update the "Post-April 2026 tightening" ledger when hardening work ships.
  - `docs/user-guide.md` — when user-facing behavior changes (new button, renamed action, new toast, changed keyboard shortcut). A bug fix whose only visible effect is "now works" doesn't need a note; a bug fix that changes what the user sees (e.g. an error toast where there used to be silence) does.
  - `CLAUDE.md` (this file) — only for project-wide conventions Claude should apply across every task. Per-feature mechanics belong in `docs/`.
- **Improvement-plan ledger discipline.** When closing an item in `docs/improvement-plan.md`, append a specific description of what shipped (file paths, the actual approach taken, and any notable scope decisions — e.g. "scenario #5 skipped because no live producer") to the comma-separated ledger at the top of the file, and remove the item's body. Don't leave items in the ledger as bare item numbers — future readers need to know what was actually done without running `git log`.
- **After completing a group of changes, audit all docs.** Don't rely on "I'll remember to update the doc for that one." When a chunk of work wraps up (e.g. closing an improvement-plan section), scan every file in `docs/` for references to the changed behavior or removed code, and update or delete them in the same commit. Launch an Explore agent for this audit when the change touches many files.
- **Don't add docs for trivial changes.** A bug fix or local refactor doesn't need a doc update. Update docs when the change affects how someone *uses* or *extends* the code.
- **Don't let docs drift.** If you remove a feature or rename a public symbol, grep for it in `docs/` and `CLAUDE.md` and remove the stale references.

## Architecture Anchors

1. **No cross-module imports** — communicate via the typed `EventBus` (`src/core/types.ts` → `BusEvents`). Modules MAY import freely from `src/core/` (services, components, types, utilities) — that's the library layer, the second axis added by the May 2026 connection-libraries-to-core refactor.
2. **No global state** — everything flows through `AppContext`. Credential-bearing state is not an exception: the managed profile + site seed live in `ctx.managedStore` ([src/core/services/managed-session-store.ts](src/core/services/managed-session-store.ts)), never in `AppState` and never in a module-level variable. `AppState.managed` carries matcher inputs only (names, globs, the login token).
3. **No `document.getElementById()`** — always scope to the module's `container`.
4. **Factory functions, not classes** — state lives in closures. Two factory shapes coexist: module-level factories take `AppContext` (e.g. queue-browser's `createService(ctx)`); core service factories in `src/core/services/` are **pure** — they take lifecycle hooks (`onConnected`/`onDisconnected`/etc.) so the same factory can power the connections module's primary connection AND another module's secondary connection (queue-copy's destination). The connections module's `module.ts` is the one place that bridges factory hooks to global AppState + bus events; a secondary connection's hooks must write only module-local state. To open a *provisioned* secondary, ask `ctx.managedStore.connect(target, { connect })` and build the client inside the callback — never move a credential across a module boundary.
5. **Required elements use `required()`, optional ones use nullable checks** — see DOM Access policy above.
6. **Modules register in `src/variants/<name>.ts`** — each variant is a small `ACTIVE_MODULES: Record<id, priority>` manifest. The active variant is selected via `src/variants/_active.ts` (default re-exports `./standard`) or the `VITE_VARIANT=<name>` env var at build time. `src/registry.ts` resolves each id to its `module.ts` via `import.meta.glob` — no separate import section. Adding a module = create `src/modules/<id>/{module.ts, index.html}` + add one line to the variant. Disabling = comment one line. Shipping a different module mix = drop a new variant file.
7. **Module HTML lives in `src/modules/<id>/index.html`** — never in the shell. The shell `src/index.html` has a `<!-- @module-templates -->` marker and the `inject-module-templates` Vite plugin splices each module's HTML in at build time.
8. **CSS is split by responsibility** — `src/css/{variables,reset,layout,components,utilities}.css` for the design system, `src/modules/<id>/styles.css` for module-scoped rules, `src/core/components/<name>/styles.css` for reusable components, and `src/css/main.css` aggregates them via `@import`. Module-prefixed selectors (`.browser-*`, `.detail-*`, etc.) belong in the module's own `styles.css`; component-prefixed selectors (`.picker-*`, `.toast-*`) belong in the component's. Shared primitives stay in `components.css` / `utilities.css`. Don't reach for `!important` to beat cross-file specificity — the rule is in the wrong file.
9. **Reusable UI components live in `src/core/components/<name>/`** with a function API (e.g. `pickQueue(source, opts?)` — components take a `QueueSource`, never a `SempContext`, and never run their own discovery). The component owns its DOM creation, event wiring, and lifecycle internally. Qualifies for core only if reusable across ≥2 features. One-off UI stays inside the consuming module.

## Test DOM

- Use [`loadModuleDOM(moduleId)`](tests/helpers/loadModuleDOM.ts) in test files instead of hand-rolled `container.innerHTML = '...'` literals. The helper reads the real `src/modules/<id>/index.html` so the test DOM can never drift from the build output.
- The `moduleId` param is a plain `string` (the directory name under `src/modules/`). A typo throws ENOENT at read time — loud enough for tests.
- Exception: tests that *intentionally* exercise a partial or malformed DOM (e.g. to verify a defensive fallback) should keep an inline literal with only the elements they need.

## Test Cross-References

When a test references another test — in a comment, a `describe`/`it` title, or anywhere else — it MUST identify the target by **filename and test name** (e.g. `tests/foo/bar.test.ts › "rejects empty payload"`). Do NOT reference external artifacts like improvement-plan item numbers, PR numbers, ticket IDs, or commit hashes. Those rot; the file path and test name remain valid as long as the test exists, and they let a reader jump straight to the referenced behavior.

## Build Modes

- `npm run build:prod` — production bundle (`dist/index.html`, real services, no mock code).
- `npm run build:mock` — interactive demo bundle (`dist/mock.html`) backed by an in-browser broker. `MOCK_REDIRECTS` in `vite.config.ts` now holds a **single** entry: `./core/boot` → `./mock-broker/boot`. That seam installs `window.solace`, a `fetch` interceptor (SEMP v2/v1, `/hosted`, `/managed/*`) and the demo control panel, so every real service runs unmodified against it. **Do not add `*-mock` service siblings** — extend `src/mock-broker/` instead, and cover new behaviour in `tests/mock-broker/`. The tree is mock-only: the redirect plugin is registered only when `mode === 'mock'`, so production never imports it.
- `npm run build:no-payload` / `build:no-queue-copy` / `build:admin` / `build:all` — the remaining variants (`no-payload.html`, `no-queue-copy.html`, `solAdmin.html`, `all-test.html`).
- `npm run build` — emits every shipped variant in one pass: `mock.html`, `index.html`, `min.html`, `no-payload.html`, `no-queue-copy.html`, `solAdmin.html`. `emptyOutDir: false` is set in `vite.config.ts`, so no pass wipes another's output nor pre-placed files in `dist/` (like `solclient.js` / `jszip.min.js`).
- `./scripts/dev.sh build` is the **gate**, and what CI calls: `npm run build` plus both version-stamped gateway binaries (`go-web-proxy[-managed]-<os>-<arch>`), honouring `TARGET_OS`/`TARGET_ARCH` for cross-compilation. The npm scripts above are the pieces it calls; reach for them directly only when iterating on one variant. A build command belongs in **both** `scripts/dev.sh` and `scripts/dev.ps1`, never in workflow YAML.
- **Version comes from the git tag, not `package.json`.** `dev.sh` derives it (`git describe`, or `VERSION` from the tag ref in CI) and exports `APP_VERSION`, which `vite.config.ts` reads into `__APP_VERSION__` and the `-ldflags` stamp into the gateway's `version`. `docker/Dockerfile` takes the same value as a build-arg because git is unavailable inside the image build. `package.json`'s `0.0.0-dev` is a deliberately implausible placeholder — see [docs/git.md](docs/git.md).

## Type Checking

- `./scripts/dev.sh vet` is the **static-analysis gate**: `tsc --noEmit`, the doc-secrecy check, and `go vet` both with and without the `managed` tag. The build does **not** type-check — Vite/esbuild transpiles by *stripping* types without checking them, so a type error never fails `dev.sh build` or the dev server. `tsc` is the only thing that catches it.
- **Code you touch must pass `vet` clean** — same expectation as the 100% coverage rule. Don't leave type errors behind a green build.
- CI enforces it by calling the same task: `.github/workflows/ci.yml` runs `./scripts/dev.sh all scan` on Linux and `./scripts/dev.ps1 all scan` on Windows.
