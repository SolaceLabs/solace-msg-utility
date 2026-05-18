# Git Workflow & Release Process

This project ships in two forms:

1. A **container image** at `ghcr.io/solacelabs/solace-msg-utility` (produced by [docker/Dockerfile](../docker/Dockerfile)).
2. A **public PWA** hosted on GitHub Pages at `https://solacelabs.github.io/solace-msg-utility/`.

Both are produced by a single workflow ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) that fires when you **publish a GitHub Release**. Neither artifact is built or pushed on regular branch pushes — releases are the only release channel.

---

## Day-to-day branching

- `main` is the integration branch. It must stay releasable at all times.
- Feature work happens on short-lived branches off `main` and lands via pull request.
- `main` is protected — direct pushes should be avoided. Merge via PR after review.
- The repo uses `pull.ff = only` locally; keep `main` linear by rebasing feature branches before merging.

There is **no** `develop`, `release/*`, or long-lived staging branch. The release workflow runs only against the commit pointed to by the release tag, so whatever is on `main` at tag time is what ships.

---

## Pre-release checklist (local)

Before publishing a release, validate the commit locally so you don't burn a release tag on a broken build.

```bash
npm ci
npm run test:coverage     # all tests + 100% coverage policy
npm run build             # mock.html, index.html, min.html all produce
npm run scan              # govulncheck + npm audit + Trivy on the local image
```

`npm run scan` is the same set of scanners the workflow runs, so a clean local result is the strongest signal that the workflow will pass.

If any HIGH/CRITICAL finding appears, fix it (upgrade the dependency, patch the Go module, rebuild the base image) before tagging. The release job will hard-fail otherwise.

---

## Cutting a release

The release tag is the single source of truth for the version. There is **no separate version field to update in CI** — the image tag, GHCR tag, and Pages deploy are all driven from the GitHub Release's tag name.

### 1. Bump `package.json`

Edit `version` in [`package.json`](../package.json) to the new semver (e.g. `3.4.0`). Commit on a PR.

```bash
git checkout -b release/3.4.0
# edit package.json: "version": "3.4.0"
git add package.json
git commit -m "Release 3.4.0"
git push -u origin release/3.4.0
gh pr create --fill --base main
```

Merge the PR once CI is green.

### 2. Tag the release commit

On `main`, fast-forwarded to include the version bump:

```bash
git checkout main
git pull --ff-only
git tag -a v3.4.0 -m "Release 3.4.0"
git push origin v3.4.0
```

Tag format **must** be `vX.Y.Z`. The workflow uses `docker/metadata-action` semver parsing, which expects the leading `v`.

### 3. Publish the GitHub Release

The workflow trigger is `release: published`. Creating a *draft* release does not fire it.

```bash
gh release create v3.4.0 \
  --title "v3.4.0" \
  --generate-notes
```

Or via the GitHub UI: Releases → *Draft a new release* → choose the existing `v3.4.0` tag → *Publish release*.

The workflow starts within seconds. Watch it with:

```bash
gh run watch
```

---

## What the workflow does

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs four jobs:

| Job              | Depends on                | What it does                                                                                                        | Fails the release if…                          |
|------------------|---------------------------|----------------------------------------------------------------------------------------------------------------------|------------------------------------------------|
| `scan-app`       | —                         | `npm audit --audit-level=high` and `govulncheck ./...` in `go-web-proxy/`.                                          | Any HIGH/CRITICAL npm advisory, or any Go vuln. |
| `build-pwa`      | `scan-app`                | `npm run build`, then uploads `dist/` as a workflow artifact named `pwa-bundle`.                                    | Build error.                                   |
| `build-image`    | `scan-app`                | `docker buildx build` with [docker/Dockerfile](../docker/Dockerfile), then Trivy scan on the locally-loaded image. If clean, pushes all computed tags to GHCR. | Any HIGH/CRITICAL OS or library vuln in the image. |
| `deploy-pages`   | `build-pwa`, `build-image` | Checks out the `dist` branch, downloads `pwa-bundle`, copies *only* `index.html` into the branch root (vendor files and everything else on `dist` are left untouched), commits, and pushes. Pages auto-redeploys from the branch. | Only runs if both upstream jobs succeeded.     |

### Image tags

`docker/metadata-action` derives the following tags from a release tag of `v3.4.0`:

- `ghcr.io/solacelabs/solace-msg-utility:3.4.0`
- `ghcr.io/solacelabs/solace-msg-utility:3.4`
- `ghcr.io/solacelabs/solace-msg-utility:3`
- `ghcr.io/solacelabs/solace-msg-utility:latest`

All four point to the same digest. Trivy scans the `:3.4.0` tag locally; if it passes, all four are pushed.

### Why scans block the release

Both `scan-app` and the Trivy step in `build-image` use the same severity threshold as the local [`npm run scan`](../package.json) script: **fail on HIGH/CRITICAL**, ignoring un-fixable vulns. This keeps "passes locally" and "passes in CI" identical, so a contributor never gets surprised by a CI-only finding.

### Pages deploy

Pages is fed from the **`dist` branch**, not from a workflow-uploaded Pages artifact. The release workflow copies the freshly-built `index.html` into the branch root, commits, and pushes. Pages auto-redeploys from the new branch tip.

The published URL is:

- `https://solacelabs.github.io/solace-msg-utility/` → `index.html` (production bundle)

`mock.html` and `min.html` are built but **not** deployed to Pages. They remain available as files inside the `pwa-bundle` workflow artifact (downloadable from the run page for 7 days) for anyone who wants to test the mock-services demo or the minimal variant locally.

#### Why a separate branch

The PWA needs two vendor JS files at runtime — `solclient.js` (Solace SDK) and `jszip.min.js` (used by the queue browser's "Download" feature). They're not bundled by Vite, and the project has chosen not to commit them into `main`. Instead they live in the `dist` branch, where the PWA can find them as siblings of `index.html`.

#### What the workflow touches on `dist`

The `deploy-pages` job only overwrites `index.html`. **Every other file on the `dist` branch is left untouched** — including vendor files, `.nojekyll`, `CNAME`, or anything else you commit there manually. Stale files are never auto-removed; if you want to drop something from the branch, do it by hand.

> **One-time setup:** before the first release:
> 1. Create the `dist` branch with the vendor files committed at the root: `solclient.js`, `jszip.min.js`, plus an empty `.nojekyll` file. (See [docs/deployment.md](deployment.md) for where to obtain the SDK.)
> 2. Push it: `git push -u origin dist`.
> 3. In *Settings → Pages*, set **Source: Deploy from a branch → Branch: `dist` → Folder: `/` (root)**. Save.
>
> Until both are done, the first release's `deploy-pages` job will fail (no branch to push to) or succeed silently (Pages still serves nothing).

---

## Re-running a release

If the workflow fails halfway through (e.g. a transient Trivy DB download error), do **not** delete and re-publish the release — you'll get duplicate tag pushes and stale Pages deploys.

Instead, re-run only the failed jobs:

```bash
gh run rerun <run-id> --failed
```

The `concurrency:` group is keyed on the release tag, so re-runs serialize cleanly.

---

## Rollback

There is no in-place rollback. The container image and Pages site are immutable artifacts of the tag that produced them.

To revert:

1. Identify the last known-good release (e.g. `v3.3.0`).
2. On `main`, revert the offending commits via PR and merge.
3. Bump `package.json` to the next patch (e.g. `3.4.1`) and cut a new release.
4. The `:latest` tag in GHCR will move to `v3.4.1`; older immutable tags (`:3.4.0`, `:3.3.0`, …) remain available for anyone pinned to a specific version.

Do **not** retag an existing version. Image consumers cache by digest, so retagging is invisible to anyone who has already pulled.

---

## Troubleshooting

| Symptom                                                             | Likely cause                                                                                                | Fix                                                                                              |
|---------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| `scan-app` fails on `npm audit`                                     | A transitive npm dep has a new HIGH/CRITICAL advisory since last release.                                   | `npm audit --audit-level=high` locally, upgrade the offending dep, commit, re-tag.               |
| `scan-app` fails on `govulncheck`                                   | A new Go stdlib or module vuln affects `go-web-proxy/`.                                                     | Update `go-web-proxy/go.mod` (often just `go get -u` on the affected module) and re-tag.         |
| `build-image` Trivy fails on the base image                         | Alpine or distroless base has a new CVE.                                                                    | Update the `FROM` lines in [docker/Dockerfile](../docker/Dockerfile) to the latest patch tag.    |
| `build-image` push fails with `denied: permission_denied`           | The release was published from a fork, or `packages: write` is missing from repo settings.                  | Publish releases from the `SolaceLabs/solace-msg-utility` repo. Verify *Settings → Actions → Workflow permissions* allows `GITHUB_TOKEN` to write packages. |
| `deploy-pages` fails on `Check out dist branch` with `Remote branch dist not found` | The `dist` branch hasn't been created yet.                                                          | Create it once locally with the vendor files + `.nojekyll` committed and push: `git push -u origin dist`. See the one-time setup note above. |
| `deploy-pages` fails on `git push` with `Permission to ... denied`  | `contents: write` is missing, or repo settings restrict `GITHUB_TOKEN` to read-only.                        | *Settings → Actions → General → Workflow permissions: Read and write permissions*. The job already declares `contents: write`. |
| Pages serves the new HTML but the SDK fails to load (404 on `solclient.js`) | The vendor file is missing from the `dist` branch (someone wiped it, or the initial commit didn't include it). | Switch to the `dist` branch locally, commit `solclient.js` (and `jszip.min.js`), push. Re-run the release if needed. |
| Workflow does not fire at all                                       | The release is still in *Draft*. Only `released`/`published` events trigger the workflow.                   | Click *Publish release* (or `gh release edit <tag> --draft=false`).                              |
| Image is pushed but Pages didn't update                             | `deploy-pages` failed after the image push, OR Pages source isn't set to the `dist` branch.                 | Check the `deploy-pages` job log. Verify *Settings → Pages → Source: Deploy from a branch → `dist` → `/`*. Re-run with `gh run rerun <run-id> --job <job-id>`. |

---

## Quick reference

```bash
# 1. Bump version, merge to main
git checkout -b release/3.4.0
$EDITOR package.json                     # "version": "3.4.0"
git commit -am "Release 3.4.0" && git push -u origin release/3.4.0
gh pr create --fill --base main          # → merge after CI

# 2. Tag main
git checkout main && git pull --ff-only
git tag -a v3.4.0 -m "Release 3.4.0"
git push origin v3.4.0

# 3. Publish — this fires the workflow
gh release create v3.4.0 --title "v3.4.0" --generate-notes

# 4. Watch
gh run watch
```
