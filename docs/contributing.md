# Contributing

This page is for anyone who changes this repository: the web app in `src/` and the Go gateway in `go-web-proxy/`. It covers how to get started, the loop to follow while you work, the dev-script tasks that check your change, and the checklist for a pull request. The rules for writing code are in [developer-guide.md](developer-guide.md), and the rules for writing tests are in [testing.md](testing.md).

## Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
  - [Dev-script tasks](#dev-script-tasks)
- [Pull Request Checklist](#pull-request-checklist)
- [Where to Read Next](#where-to-read-next)

---

## Getting Started

[developer-guide.md](developer-guide.md) has the full setup: `npm install`, the dev server and the project structure.

To check a fresh clone:

```bash
./scripts/dev.sh all
```

On Windows, use `./scripts/dev.ps1 all`. The two scripts are mirrors and take the same task names.

---

## Development Workflow

1. Create a branch for your change.
2. Make your changes in `src/` (or `go-web-proxy/`).
3. Write or update tests in `tests/` (or the `_test.go` files) in the same change. Documentation that describes the behavior you changed is updated in the same change too.
4. Run `./scripts/dev.sh all`: `build vet test mock`, the fast inner loop. CI runs `all cov scan`.
5. Run `./scripts/dev.sh cov`. The coverage policy is in [testing.md](testing.md#coverage-policy).
6. Run `./scripts/dev.sh scan` before you open the PR if you touched a dependency, the Dockerfile or `go-web-proxy/`.
7. Run `./scripts/dev.sh e2e` before a tag that touches the gateway or the app (see [testing.md](testing.md)).
8. Open a pull request with a clear description.

`scripts/dev.sh` and `scripts/dev.ps1` are the only place that knows how to build, test, lint or scan this repo. CI calls the same task names, so local runs and CI match by construction. Do not add a build command to a workflow; add it to both scripts. Task names are matched exactly and case-sensitively (`BUILD` and `b*` fail with `unknown task`). `dev.ps1` streams each task's output into its log line by line, as `dev.sh` does, so a log fills while the task runs.

While you fix a failure, rerun only the task that failed (for example `./scripts/dev.sh cov` after a web test fix, or `./scripts/dev.sh vet`). Run `full` once at the end.

### Dev-script tasks

| Task | What it runs |
| --- | --- |
| `build` | `npm run build` (every variant), then `npm run check:bundles` (no Direct bundle carries Provisioned UI; the demo bundles have no way out to a network), plus the gateway binary, version-stamped, into `dist/`. The binary is a compile check: it ships only inside the image |
| `vet` | `npm run typecheck` (`src/`, its `.js` modules included: `checkJs`), `npm run typecheck:tests` (`tests/` and the vite/vitest configs, through `tsconfig.test.json`), `npm run lint` (ESLint, rules in [developer-guide.md](developer-guide.md)), `go vet ./...`, and `gofmt -l` on `go-web-proxy/` (any file it lists fails the task) |
| `test` | `npm run test:app` (the web suite without `tests/mock-broker/`), then the Go suite with `go test -race` (`CGO_ENABLED=1`; with no `gcc` on PATH it runs without `-race` and `test.log` says so). When `cov` is in the same invocation (`full`, `all cov`), `test` skips both suites and says so in `test.log`: `cov` runs each once |
| `mock` | `npm run test:mock:coverage`: `tests/mock-broker/`, the suites behind the two demos, the gateway contract included. It prints the coverage of `src/mock-broker/` (reported, no threshold). Skipped when `cov` is in the same invocation |
| `cov` | `npm run test:coverage` (the whole web suite, `tests/mock-broker/` included, with the 100% thresholds), then the Go suite with `-race` and a coverage profile (the same run `test` would make, with `CGO_ENABLED=1` and the same fallback). Prints both totals and writes HTML reports under `coverage/` |
| `scan` | `npm run audit:gate` (`npm audit`: fatal on fixable HIGH or CRITICAL advisories, a warning on unfixable ones), `go tool govulncheck ./...`, then a Trivy scan of the freshly built image with the pinned Trivy container (never a `trivy` on PATH; see [git.md](git.md#keeping-the-workflow-pins-current)) |
| `image` | Builds the container image through `docker/docker-compose.yaml` |
| `up` / `down` | Brings the compose stack up or down |
| `graphify` | Refreshes the knowledge graph. Local only: skipped when `CI` is set |
| `e2e` | The gateway image in Gateway and Provisioned mode against an existing Solace broker you name: builds the image, then runs `node scripts/e2e.mjs` over `docker/docker-compose.e2e.yaml`. Local only and standalone: skipped when `CI` is set or without a Linux-container Docker, and never part of `all` or `full`. Setup, broker details and the list of checks are in [testing.md](testing.md) |
| `all` | `build vet test mock` |
| `full` | `all` + `cov image scan graphify`: the pre-tag sweep |

Every task name is checked before any task runs, so a typo fails at once. Each task writes `scripts/logs/<task>.log` with a timestamped footer, and a run of more than one task ends with a console-only `timing:` line giving each task's seconds.

CI runs `all cov scan`. What `cov` holds you to, and which part only you can check locally, is in [testing.md](testing.md#coverage-policy).

The image half of `image` and `scan` skips with a warning when Docker is absent or runs Windows containers, since a Linux image cannot be built there. The Linux CI leg still enforces it.

The web suite runs most test files in jsdom. Test files that need no DOM start with a `// @vitest-environment node` line and run in Node; 45 files do today. [testing.md](testing.md) says which kind a new file should be.

---

## Pull Request Checklist

- [ ] `./scripts/dev.sh all` is green (build, vet, test with both the web and Go halves, and mock)
- [ ] New and changed code has tests in the same change, and the web coverage thresholds hold (`./scripts/dev.sh cov`: 100% on all four metrics; the Go total is not below the last total in `scripts/logs/cov.log`)
- [ ] `vet` passes: both type-checks (the build uses esbuild and does **not** type-check, so `tsc` over `src/` and over `tests/` plus the configs is a separate gate), `npm run lint`, `go vet` and `gofmt -l`
- [ ] If you changed a build command, it went into **both** `scripts/dev.sh` and `scripts/dev.ps1`, never into workflow YAML
- [ ] No new `any` types (except at the Solace SDK interface)
- [ ] DOM access is scoped to the module's container; module-owned elements use `required()`
- [ ] SDK and exception text goes through `solaceErrorText(e, fallback)` (`src/core/utils.ts`): the SDK splits the reason across `.message` (QueueBrowser `OperationError`) and `.infoStr` (Session events), and reading one loses the other
- [ ] Modules talk through the EventBus, with no cross-module imports
- [ ] Each new log line has the right level, names its component and holds no secret (see the Logging standard in [developer-guide.md](developer-guide.md#logging-standard))
- [ ] Each `v8 ignore` has an inline comment saying why the code cannot be tested, and falls in a sanctioned category (see [testing.md](testing.md))
- [ ] Provisioned mode (if touched): module gating goes through `MODULE_REQUIREMENTS` (`rbac.ts`); the managed profile stays in `managedProfile` (names only), never in `AppState`; a dialled password goes straight to the SDK inside the `dial` callback and is never stored; the gateway endpoint paths (`/managed/dial`, `/managed/relay/`) stay in Provisioned-only files (`npm run check:bundles` checks this)
- [ ] Docs that describe the changed behavior are updated in the same change
- [ ] The commit message describes the change clearly

---

## Where to Read Next

Before you change a subsystem, read:

- [architecture.md](architecture.md) for the system diagrams, data flow and the rules that keep modules apart
- [developer-guide.md](developer-guide.md) for setup, code conventions and the walkthrough for adding a module
- [testing.md](testing.md) for how the tests are organized, the coverage and `v8 ignore` policy, and how to run each suite
- [git.md](git.md) for branching, tags and releases
