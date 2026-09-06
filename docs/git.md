# Git Workflow & Release Process

This project ships in four forms:

1. A **container image** at `ghcr.io/solacelabs/solace-msg-utility` (produced by [docker/Dockerfile](../docker/Dockerfile)), in a standard and a `managed-` prefixed variant.
2. A **public PWA** hosted on GitHub Pages at `https://solacelabs.github.io/solace-msg-utility/`.
3. The **PWA bundles** (`index.html` and its variants) attached to the GitHub Release.
4. The **gateway binaries** (`go-web-proxy`), cross-compiled and attached to the same Release.

All four are produced by [`.github/workflows/tag.yml`](../.github/workflows/tag.yml), which fires when you **push a `v*` tag**. Nothing is built or pushed on an ordinary branch push or pull request.

The tag itself is the single source of version truth. There is no version field to bump: the binaries report the tag as-is (`v3.4.0`), the image tags and the PWA's `__APP_VERSION__` take it with the leading `v` stripped (`3.4.0`), and `package.json` carries the deliberately implausible placeholder `0.0.0-dev` so a build that lost the injection looks wrong rather than merely out of date.

---

## Day-to-day branching

- `main` is the integration branch. It must stay releasable at all times.
- Feature work happens on short-lived branches off `main` and lands via pull request.
- `main` is protected — direct pushes should be avoided. Merge via PR after review.
- The repo uses `pull.ff = only` locally; keep `main` linear by rebasing feature branches before merging.

There is **no** `develop`, `release/*`, or long-lived staging branch. The tag workflow runs only against the commit the tag points at, so whatever is on `main` at tag time is what ships.

**Nothing runs on push or PR by design** — the one exception is a PR that touches `.github/workflows/**`, `.github/dependabot.yml`, or the dev scripts, which gets the full gate so Dependabot's action bumps are verified before merging. This means `main` can sit broken between releases, which is exactly why the pre-tag sweep below matters.

---

## Pre-release checklist (local)

`scripts/dev.sh` (and its behaviourally identical `scripts/dev.ps1`) is the only place that knows how to build, test, lint or scan this repo. CI calls the same task names, so a clean local run is the strongest possible signal that the tag will pass.

```bash
./scripts/dev.sh full     # build vet test cov image scan graphify
```

```powershell
./scripts/dev.ps1 full    # the same, on Windows
```

Run it on a **clean checkout**. Nothing else catches a file you built against locally but never committed — there is no CI on push to find it for you.

Then confirm the version actually got stamped:

```bash
git describe --tags --always --dirty          # e.g. v3.4.0
./dist/go-web-proxy-linux-amd64 --version     # must match
```

A binary reporting `dev` means the `-ldflags` injection is not reaching the build, and the release would ship a wrongly-labelled artifact.

Individual tasks are available when you only need one: `build`, `vet`, `test`, `cov`, `scan`, `image`, `up`, `down`, `graphify`. `all` (= `build vet test`) is the fast inner loop and what CI runs, as `all scan`.

Each task truncates `scripts/logs/<task>.log`, tees everything into it, and closes with a footer line:

```text
2026-09-05T18:21:00+0800 | scan | 45s | OK
```

The previous run's coverage totals in `logs/cov.log` are the local floor. CI is a fresh checkout with no prior log, so it cannot catch a coverage regression — that check is yours.

---

## Cutting a release

### 1. Merge to `main`

Land the work as usual. There is no version bump commit.

### 2. Tag and push

```bash
git checkout main
git pull --ff-only
git tag -a v3.4.0 -m "Release 3.4.0"
git push origin v3.4.0
```

Tag format **must** be `vX.Y.Z`. `docker/metadata-action` semver parsing expects the leading `v`.

That push is the whole release. The workflow creates the GitHub Release itself, last, and only if every job passed — so a failure anywhere leaves no Release and nothing to clean up. Read the logs artifact, push a fix, tag again.

```bash
gh run watch
```

> Do **not** also create a Release by hand, and never add an `on: release` trigger to a workflow: the Release this pipeline creates would re-fire the whole pipeline.

---

## What the workflow does

| Job | Depends on | What it does | Fails the release if… |
| --- | --- | --- | --- |
| `plan` | — | Resolves the project shape once, loudly: is there a `docker/Dockerfile`, and is the `BUILD_TARGETS` repo variable valid JSON. | `BUILD_TARGETS` is malformed, or nothing at all would ship. |
| `gates` | `plan` | Calls [`ci.yml`](../.github/workflows/ci.yml), which runs `./scripts/dev.sh all scan` on `ubuntu-24.04` and `./scripts/dev.ps1 all scan` on `windows-2025`, then uploads `scripts/logs/` as an artifact. | A build, type, doc-secrecy, test, `npm audit`, `govulncheck` or Trivy failure on either platform. |
| `image` | `plan`, `gates` | A 2-leg matrix (`standard`, `managed`) builds multi-arch (`linux/amd64,linux/arm64`) with buildx, pushes to GHCR with provenance and SBOM, then Trivy-scans the pushed digest. Both legs ship the same bundle; `managed` bakes `MANAGED`/`HOSTED`/`CONN_MODES`, adds `/solAdmin` via `WITH_ADMIN`, and builds the gateway with `GO_TAGS=managed`. | Any HIGH/CRITICAL fixable OS or library vuln in either image. |
| `binaries` | `plan`, `gates` | Runs `./scripts/dev.sh build` once per `BUILD_TARGETS` entry. Each leg emits both gateway variants named `go-web-proxy[-managed]-<os>-<arch>[.exe]`, plus the PWA bundles. | A cross-compile failure. |
| `pages` | `plan`, `gates`, `image`, `binaries` | Checks out the `dist` branch, copies *only* `index.html` into the branch root, commits, pushes. Pages auto-redeploys. | Only runs when everything upstream passed — a red scan no longer redeploys the site. |
| `release` | `plan`, `gates`, `image`, `binaries` | Merges every `bin-*` artifact into one `dist/`, writes `SHA256SUMS.txt`, generates notes, appends both image digests, and creates the Release with everything attached. | Never publishes unless at least one producer actually succeeded. |

The `binaries` matrix runs `build` per target, so each leg emits its own identical copy of the PWA bundles; `merge-multiple` collapses them. The gateway binaries carry their target in the filename and survive the merge intact — which is why the naming is load-bearing, not cosmetic.

### Repo variables

*Settings → Secrets and variables → Actions → Variables*:

| Variable | Value | Why |
| --- | --- | --- |
| `BUILD_TARGETS` | `[{"os":"linux","arch":"amd64"},{"os":"linux","arch":"arm64"},{"os":"windows","arch":"amd64"},{"os":"darwin","arch":"arm64"}]` | Drives the `binaries` matrix. Must be a non-empty JSON array of `{os, arch}`. |
| `SHIP_IMAGE` | *unset* | Unset means "is there a Dockerfile", which there is. Set `false` only if the image should stop being published. |

### Image tags

`docker/metadata-action` derives the following from a tag of `v3.4.0`. The `standard` leg produces the unprefixed tags; the `managed` leg applies `flavor: prefix=managed-,onlatest=true`:

- `ghcr.io/solacelabs/solace-msg-utility:3.4.0` / `:managed-3.4.0`
- `ghcr.io/solacelabs/solace-msg-utility:3.4` / `:managed-3.4`
- `ghcr.io/solacelabs/solace-msg-utility:3` / `:managed-3`
- `ghcr.io/solacelabs/solace-msg-utility:latest` / `:managed-latest`

Within each leg all four tags point to the same digest, which the Release notes quote in full. The two legs run in parallel with separate gha cache scopes.

### Release assets

- `index.html`, `min.html`, `mock.html`, `no-payload.html`, `no-queue-copy.html`, `solAdmin.html`
- `go-web-proxy-<os>-<arch>[.exe]` and `go-web-proxy-managed-<os>-<arch>[.exe]`, one pair per `BUILD_TARGETS` entry
- `SHA256SUMS.txt` over all of the above

The two vendor JS files (`solclient.js`, `jszip.min.js`) are **not** release assets — they are not committed to `main`. Take them from the `dist` branch. See [deployment.md](deployment.md).

### Why scans block the release

`scan` inside the dev scripts is fatal on **fixable** CVEs and warns-and-passes on unfixable ones: there is nothing to act on for the latter, and blocking on it would freeze releases on someone else's patch schedule. There is no report-only mode — local and CI behave identically, so a contributor never meets a CI-only finding.

Note that a scanner or advisory-database update can turn a tag red with no code change. That is accepted deliberately: the vulnerability database already updates daily, so the gate was never deterministic, and `--ignore-unfixed` keeps it actionable.

### Pages deploy

Pages is fed from the **`dist` branch**, not from a workflow-uploaded Pages artifact. The published URL is:

- `https://solacelabs.github.io/solace-msg-utility/` → `index.html` (production bundle)

The non-default variants are built and attached to the Release but **not** deployed to Pages. Managed deployments use the same `index.html`, shipped in the `managed-` prefixed container image; that image also carries `solAdmin.html`, which the gateway serves at `/solAdmin`.

Pages is gateway-less, so it is Direct-connection-only by design.

#### Why a separate branch

The PWA needs two vendor JS files at runtime — `solclient.js` (Solace SDK) and `jszip.min.js` (used by the queue browser's "Download" feature). They're not bundled by Vite, and the project has chosen not to commit them into `main`. Instead they live in the `dist` branch, where the PWA can find them as siblings of `index.html`.

#### What the workflow touches on `dist`

The `pages` job only overwrites `index.html`. **Every other file on the `dist` branch is left untouched** — vendor files, `.nojekyll`, `CNAME`, or anything else committed there manually. Stale files are never auto-removed; drop them by hand.

> **One-time setup:** before the first release:
>
> 1. Create the `dist` branch with the vendor files committed at the root: `solclient.js`, `jszip.min.js`, plus an empty `.nojekyll` file. (See [docs/deployment.md](deployment.md) for where to obtain the SDK.)
> 2. Push it: `git push -u origin dist`.
> 3. In *Settings → Pages*, set **Source: Deploy from a branch → Branch: `dist` → Folder: `/` (root)**. Save.

---

## Keeping the workflow pins current

Every action is pinned by commit SHA, never by a mutable tag like `@v4`. [`.github/dependabot.yml`](../.github/dependabot.yml) opens weekly PRs that bump the SHA and its `# <tag>` comment together — minor/patch grouped into one PR, majors separately so a breaking change is never buried in a batch. Those PRs run the full gate because `ci.yml` carries a narrow `pull_request` trigger on the workflow and dev-script paths.

Dependabot manages **actions only, on purpose**. Language dependencies move the other way round: `scan` fails on a fixable CVE and the bump is made deliberately with gates re-run. The same goes for the manifest-pinned `govulncheck` (a `tool` directive in [go-web-proxy/go.mod](../go-web-proxy/go.mod), invoked as `go tool govulncheck`) and the toolchain pins.

Two things Dependabot cannot track:

- **Runner labels expire**, unlike action SHAs. GitHub keeps two GA images per OS and brownouts precede removal. Check [actions/runner-images](https://github.com/actions/runner-images/releases) before assuming `ubuntu-24.04` / `windows-2025` are still live.
- **The toolchain pins**: `toolchain go1.27.0` in [go-web-proxy/go.mod](../go-web-proxy/go.mod) (self-honouring — the `go` binary fetches it on your laptop and both runners) and `nodejs` in [`.tool-versions`](../.tool-versions), which `actions/setup-node` reads via `node-version-file`. Runner labels pin the OS version, not the toolchain, so without these the project is green locally and red in CI by default.

---

## Re-running a release

If the workflow fails partway (e.g. a transient Trivy DB download error), re-run the failed jobs rather than deleting and re-pushing the tag:

```bash
gh run rerun <run-id> --failed
```

The release step is idempotent — it leaves an existing Release alone — and the `concurrency:` group is keyed on the tag, so re-runs serialize cleanly.

If the `image` job pushed before a later job failed, the image is live in GHCR but no Release references it. That is by design: it is unreferenced, not published.

---

## Rollback

There is no in-place rollback. The container image, the Release assets and the Pages site are immutable artifacts of the tag that produced them.

To revert:

1. Identify the last known-good release (e.g. `v3.3.0`).
2. On `main`, revert the offending commits via PR and merge.
3. Tag the next patch (e.g. `v3.4.1`) and push.
4. The `:latest` tag in GHCR moves to `3.4.1`; older immutable tags remain available for anyone pinned to a specific version.

Do **not** retag an existing version. Image consumers cache by digest, so retagging is invisible to anyone who has already pulled.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Workflow does not fire at all | The tag doesn't match `v*`, or `tag.yml` isn't on the default branch yet. | Workflows must be merged to `main` before they can be relied on. Check the tag name. |
| `plan` fails with `BUILD_TARGETS must be a non-empty JSON array` | The repo variable is malformed. | `gh variable set BUILD_TARGETS --body '[{"os":"linux","arch":"amd64"}]'` — mind the quoting. |
| `gates` fails on `npm audit` | A transitive npm dep has a new fixable HIGH/CRITICAL advisory. | `npm update <pkg>` for an in-range fix, or bump the direct dependency. Re-run `./scripts/dev.sh scan`, commit, re-tag. |
| `gates` fails on `govulncheck` | A new Go stdlib or module vuln affects `go-web-proxy/`. | Update [go-web-proxy/go.mod](../go-web-proxy/go.mod) (often just `go get -u` on the affected module) and re-tag. |
| `gates` fails only on `windows-2025` | Usually a path or shell difference between the two dev scripts. | Reproduce with `./scripts/dev.ps1 all scan`. The two scripts must stay behaviourally identical. |
| `gates` passes locally but fails in CI on a Go build | The runner's preinstalled Go is older than yours and the toolchain pin is missing or unhonoured. | Check `toolchain` is present in [go-web-proxy/go.mod](../go-web-proxy/go.mod). Never invoke a Go tool as `go run pkg@version` — that runs module-less and ignores the pin. |
| `image` Trivy fails | The runtime image is `FROM scratch`, so there is no OS base to patch — a finding means a statically-linked Go module or a bundled asset. | Update [go-web-proxy/go.mod](../go-web-proxy/go.mod) (or the npm dep behind the bundled asset), and bump the builder-stage `FROM` tags in [docker/Dockerfile](../docker/Dockerfile) if the toolchain itself is implicated. |
| `image` push fails with `denied: permission_denied` | The tag was pushed to a fork, or `packages: write` is missing from repo settings. | Push tags on `SolaceLabs/solace-msg-utility`. Verify *Settings → Actions → Workflow permissions* allows `GITHUB_TOKEN` to write packages. |
| The first GHCR push creates a **private** package | GHCR defaults new packages to private. | A one-time repo setting: *Packages → the package → Package settings → Change visibility*. |
| A released binary reports `dev` instead of the tag | The `-ldflags` injection did not reach the build. | The injection is a linker flag — when it goes missing the binary silently reports its compiled-in default and the build stays green. Check `-X main.version=` in [scripts/dev.sh](../scripts/dev.sh) and the `APP_VERSION` build-arg in [docker/Dockerfile](../docker/Dockerfile). |
| `git describe` returns a bare SHA locally | A shallow clone, or a fetch without `--tags`. | `git fetch --tags`. The release path never depends on it — CI exports `VERSION` from the tag ref. |
| `pages` fails on `Check out dist branch` with `Remote branch dist not found` | The `dist` branch hasn't been created yet. | Create it once locally with the vendor files + `.nojekyll` committed and push: `git push -u origin dist`. See the one-time setup note above. |
| `pages` fails on `git push` with `Permission to ... denied` | Repo settings restrict `GITHUB_TOKEN` to read-only. | *Settings → Actions → General → Workflow permissions: Read and write permissions*. The job already declares `contents: write`. |
| Pages serves the new HTML but the SDK fails to load (404 on `solclient.js`) | The vendor file is missing from the `dist` branch. | Switch to the `dist` branch locally, commit `solclient.js` (and `jszip.min.js`), push. |
| `dev.sh scan` skips the image half locally | Docker is absent or running Windows containers; a Linux image cannot be built or scanned there. | Expected, and the same rule applies on the `windows-2025` runner. The ubuntu leg still enforces it. |

---

## Quick reference

```bash
# 1. Land the work on main (no version bump commit)
git checkout main && git pull --ff-only

# 2. Sweep on a clean checkout
./scripts/dev.sh full
./dist/go-web-proxy-linux-amd64 --version   # must equal git describe

# 3. Tag — this is the whole release
git tag -a v3.4.0 -m "Release 3.4.0"
git push origin v3.4.0

# 4. Watch
gh run watch
```
