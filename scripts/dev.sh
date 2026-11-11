#!/usr/bin/env bash
# Dev tasks. The only place that knows how to build/test/lint/scan this repo.
# CI calls task names only. Keep dev.ps1 behaviourally identical.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
DIST="$REPO_ROOT/dist"
GO_DIR="$REPO_ROOT/go-web-proxy"
COV_DIR="$REPO_ROOT/coverage"
COMPOSE_FILE="$REPO_ROOT/docker/docker-compose.yaml"
E2E_COMPOSE="$REPO_ROOT/docker/docker-compose.e2e.yaml"
IMAGE_REPO="ghcr.io/solacelabs/solace-msg-utility"
# The image scanner is pinned like any other dependency: a newer trivy can turn
# the same image red on its own. The digest is the multi-arch index. Bump the
# version and digest together with dev.ps1 and tag.yml's trivy-action
# `version:` -- see docs/git.md, "Keeping the workflow pins current". A trivy on
# PATH is deliberately not used: it cannot be pinned, and CI runners have none.
TRIVY_IMAGE="aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c"
mkdir -p "$LOG_DIR"
cd "$REPO_ROOT"

export NO_COLOR=1

# --- version ----------------------------------------------------------------
# The git tag is the single source of version truth. CI exports VERSION from
# the tag ref, so the release path never depends on `git describe` seeing
# history through a shallow checkout.
VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"
IMAGE_TAG="${VERSION#v}"
# Reaches vite (__APP_VERSION__) and the Dockerfile build-arg. The gateway's
# ldflags take $VERSION as-is; the PWA strips the leading `v` in vite.config.ts
# because the kernel log line already prints one.
export APP_VERSION="$VERSION"

# --- output helpers ---------------------------------------------------------
c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
step() { c '1;36' "==> $*"; }
ok()   { c '1;32' "ok: $*"; }
warn() { c '1;33' "warn: $*"; }
die()  { c '1;31' "error: $*"; exit 1; }

now() { date +%Y-%m-%dT%H:%M:%S%z; }

# Truncate this task's log with a header, then everything tees onto it.
log_begin() {
  printf '=== %s | %s | version %s ===\n' "$(now)" "$1" "$VERSION" > "$LOG_DIR/$1.log"
}

# finish <task> <exit-code> <elapsed-seconds>
finish() {
  local task=$1 code=$2 secs=$3 status
  if [ "$code" -eq 0 ]; then status=OK; else status="FAILED (exit $code)"; fi
  printf '%s | %s | %ss | %s\n' "$(now)" "$task" "$secs" "$status" \
    | tee -a "$LOG_DIR/$task.log"
}

# Strip ANSI/CSI so logs stay readable plain text.
strip_csi() { sed -E $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g'; }

# run <task> <cmd...> -- tees combined output, returns the command's code.
run() {
  local task=$1; shift
  "$@" 2>&1 | strip_csi | tee -a "$LOG_DIR/$task.log"
  return "${PIPESTATUS[0]}"
}

# note <task> <text> -- a line of our own onto the console and the log.
note() {
  local task=$1; shift
  printf '%s\n' "$*" | tee -a "$LOG_DIR/$task.log"
}

# --- target resolution ------------------------------------------------------
# CI sets TARGET_OS/TARGET_ARCH; unset means host.
# Git Bash / MSYS report MINGW64_NT-10.0-26200, which is not a GOOS. Normalise
# so a bash run on Windows names its output the same way dev.ps1 does.
host_os() {
  local s; s="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$s" in
    mingw*|msys*|cygwin*) echo windows ;;
    *)                    echo "$s" ;;
  esac
}
host_arch() { case "$(uname -m)" in x86_64|amd64) echo amd64;; aarch64|arm64) echo arm64;; *) uname -m;; esac; }
T_OS="${TARGET_OS:-$(host_os)}"
T_ARCH="${TARGET_ARCH:-$(host_arch)}"
# The literal gateway name, never `basename $REPO_ROOT`: the local clone and the
# CI checkout have different directory names, and the release job merges every
# leg into one directory where a name collision overwrites silently.
BIN_BASE="go-web-proxy"
BIN_SUFFIX="-$T_OS-$T_ARCH"
[ "$T_OS" = "windows" ] && BIN_SUFFIX="$BIN_SUFFIX.exe"

# --- shared helpers ---------------------------------------------------------
# npm ci when node_modules is absent or the lockfile has moved on. A stamp as
# new as the lockfile is current, the same test dev.ps1 makes.
ensure_deps() {
  local task=$1 stamp="$REPO_ROOT/node_modules/.package-lock.json"
  if [ -f "$stamp" ] && ! [ "$REPO_ROOT/package-lock.json" -nt "$stamp" ]; then
    return 0
  fi
  run "$task" npm ci --no-audit --no-fund --no-progress
}

# Docker can only build this project's Linux images when the daemon is running
# Linux containers. GitHub's windows runners are Windows-container only, and so
# are plenty of laptops, so the image half of `image`/`scan` warn-skips there.
# Same rule in both scripts -- this is not an OS special-case.
has_linux_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  [ "$(docker info --format '{{.OSType}}' 2>/dev/null)" = "linux" ]
}

# Always the pinned container ($TRIVY_IMAGE), never a trivy on PATH -- see the
# pin for why. Docker is there: every caller sits behind has_linux_docker.
# --pull=missing, not always: a digest cannot move, so it is fetched once per
# bump. The docker.sock mount is what lets the containerised trivy see the
# image `image` just built locally; without it trivy falls back to pulling the
# never-pushed tag from the registry and fails.
trivy_image() {
  local task=$1 ref=$2
  run "$task" docker run --rm --pull=missing -e NO_COLOR=1 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "$TRIVY_IMAGE" image --quiet --exit-code 1 \
    --severity HIGH,CRITICAL --ignore-unfixed "$ref"
}

# --- tasks ------------------------------------------------------------------
task_build() {
  mkdir -p "$DIST"
  ensure_deps build || return $?

  # The PWA bundles are target-independent, so every cross-compile leg emits an
  # identical copy; merge-multiple in the release job collapses them.
  run build npm run build || return $?
  # Direct bundles carry no Provisioned UI, provisioned.html does, and
  # provisioned-demo.html carries it with no network -- proven on the output
  # just built, so a wrong import fails the gate, not a review.
  run build npm run check:bundles || return $?

  # The gateway: one binary for every container mode. A compile check -- it
  # ships only inside the image.
  local out="$DIST/$BIN_BASE$BIN_SUFFIX"
  run build env CGO_ENABLED=0 GOOS="$T_OS" GOARCH="$T_ARCH" \
    go -C "$GO_DIR" build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o "$out" . || return $?
  note build "built $out"
}

task_vet() {
  ensure_deps vet || return $?
  # The build strips types without checking them, so tsc is the only thing that
  # catches a type error: src/ with its .js modules (checkJs), then tests/ and
  # the vite/vitest configs (tsconfig.test.json).
  run vet npm run typecheck || return $?
  run vet npm run typecheck:tests || return $?
  # The house rules a linter can hold (eslint.config.mjs).
  run vet npm run lint || return $?
  run vet go -C "$GO_DIR" vet ./... || return $?
  # gofmt -l lists the files gofmt would rewrite and exits 0 either way, so a
  # listed file is the failure. The selected toolchain's own gofmt (its
  # GOROOT), like every other Go tool here.
  local goroot unformatted
  goroot="$(go -C "$GO_DIR" env GOROOT)" || return $?
  unformatted="$("$goroot/bin/gofmt" -l "$GO_DIR" 2>&1)" || { note vet "$unformatted"; return 1; }
  if [ -n "$unformatted" ]; then
    note vet "gofmt would rewrite these (gofmt -w <file>):"
    note vet "$unformatted"
    return 1
  fi
}

task_test() {
  ensure_deps test || return $?
  # The web suite without tests/mock-broker/, which `mock` runs. `cov` runs the
  # whole suite with coverage on, so when it is queued in this invocation the
  # suite runs once, there; a failure in it still fails the run.
  if [ -n "${COV_QUEUED:-}" ]; then
    note test "web suite: skipped here, cov runs it in this invocation"
  else
    run test npm run test:app || return $?
  fi
  # The race detector needs cgo, so a C compiler: gcc is on both CI runners.
  # Without one the Go suite still runs, without -race, and the log says so.
  if command -v gcc >/dev/null 2>&1; then
    run test env CGO_ENABLED=1 go -C "$GO_DIR" test -race -count=1 ./... || return $?
  else
    note test "go test: -race skipped, no gcc on PATH"
    run test go -C "$GO_DIR" test -count=1 ./... || return $?
  fi
}

# The demo broker and the Provisioned demo's fake gateway (tests/mock-broker/):
# the suites behind demo.html and provisioned-demo.html, the gateway contract
# included.
# Skipped, like test's web suite, when cov runs them in this invocation.
task_mock() {
  ensure_deps mock || return $?
  if [ -n "${COV_QUEUED:-}" ]; then
    note mock "mock suite: skipped here, cov runs it in this invocation"
    return 0
  fi
  # With coverage over src/mock-broker/ (vitest.mock.config.ts), reported and
  # not gated: the demo tree has no threshold yet, but a drop is visible.
  run mock npm run test:mock:coverage || return $?
  local total
  total="$(grep -m1 'All files' "$LOG_DIR/mock.log" | tr -s '[:blank:]' ' ')"
  note mock "coverage total (src/mock-broker, no threshold): ${total:-unavailable}"
}

task_cov() {
  ensure_deps cov || return $?

  # vitest.config.ts sets 100% thresholds on all four metrics, so a slip fails
  # the run here rather than needing a floor comparison.
  run cov npm run test:coverage || return $?

  # After vitest, not before: it empties coverage/ on every run.
  mkdir -p "$COV_DIR/go"
  run cov go -C "$GO_DIR" test \
    -coverprofile="$COV_DIR/go/coverage.out" ./... || return $?
  run cov go -C "$GO_DIR" tool cover \
    -html="$COV_DIR/go/coverage.out" -o "$COV_DIR/go/coverage.html" || return $?
  run cov go -C "$GO_DIR" tool cover -func="$COV_DIR/go/coverage.out" || return $?

  # Print the totals last so the footer captures them: the previous run's
  # numbers in logs/cov.log are the floor (local only -- CI is a fresh
  # checkout with no prior log).
  local web go_total
  web="$(grep -m1 'All files' "$LOG_DIR/cov.log" | tr -s '[:blank:]' ' ')"
  go_total="$(grep -m1 '^total:' "$LOG_DIR/cov.log" | tr -s '[:blank:]' ' ')"
  note cov "coverage total (web):  ${web:-unavailable}"
  note cov "coverage total (go):   ${go_total:-unavailable}"
}

# build_image <log-task> -- the actual build, logged under the calling task so
# a standalone `scan` never appends to a stale image.log. Compose builds the one
# image, :latest (the gateway service; the provisioned service runs the same
# image); we then tag the versioned name the scan and the release refer to.
build_image() {
  local task=$1
  run "$task" docker compose -f "$COMPOSE_FILE" --progress plain build || return $?
  run "$task" docker tag "$IMAGE_REPO:latest" "$IMAGE_REPO:$IMAGE_TAG" || return $?
  note "$task" "tagged $IMAGE_REPO:$IMAGE_TAG"
}

task_image() {
  has_linux_docker || { warn "no linux-container docker daemon; skipping image"; return 0; }
  build_image image
}

# One task, every applicable check. FATAL on fixable CVEs.
task_scan() {
  local code=0
  ensure_deps scan || return $?

  run scan npm run audit:gate || return $?

  # The one binary and its one third-party dependency, gopkg.in/yaml.v3.
  # `go tool`, never `go run pkg@version` -- the latter runs module-less and
  # ignores go.mod's toolchain pin.
  run scan go -C "$GO_DIR" tool govulncheck ./... || return $?

  # Image half: never against a stale image, so build first -- `image` is not
  # part of `all`.
  if has_linux_docker; then
    build_image scan || return $?
    trivy_image scan "$IMAGE_REPO:$IMAGE_TAG" || code=$?
  else
    warn "no linux-container docker daemon; skipping the image scan"
  fi
  return $code
}

task_up()   { run up   docker compose -f "$COMPOSE_FILE" up -d; }
task_down() { run down docker compose -f "$COMPOSE_FILE" down; }

# Local only: the graph is a developer artifact, not a CI output.
task_graphify() {
  [ -n "${CI:-}" ] && { warn "graphify is local-only; skipping in CI"; return 0; }
  command -v graphify >/dev/null || { warn "graphify not on PATH; skipping"; return 0; }
  run graphify graphify update .
}

# Local only, and standalone: not in `all` or `full`. The image in Gateway and
# Provisioned mode against an existing broker, driven by scripts/e2e.mjs, which owns the stack's lifetime;
# the down -v here is the backstop for a run that died before its own.
task_e2e() {
  [ -n "${CI:-}" ] && { warn "e2e is local-only; skipping in CI"; return 0; }
  has_linux_docker || { warn "no linux-container docker daemon; skipping e2e"; return 0; }
  local code=0
  # Never against a stale image, as in scan.
  build_image e2e || return $?
  # Not through run: the harness may ask for the broker's details, so it needs
  # the real terminal, and it appends its own (masked) output to the log.
  E2E_LOG="$LOG_DIR/e2e.log" node scripts/e2e.mjs || code=$?
  run e2e docker compose -f "$E2E_COMPOSE" down -v --remove-orphans || true
  return $code
}

# --- dispatch ---------------------------------------------------------------
ALL="build vet test mock"
FULL="build vet test mock cov image scan graphify"

usage() {
  cat <<EOF
usage: $(basename "$0") <task>...

  build vet test mock cov scan image up down graphify e2e
  all   = $ALL       (what CI runs, as: all cov scan)
  full  = $FULL      (pre-tag sweep)
  mock  = the demo broker and fake-gateway suites (tests/mock-broker/)
  e2e   = the gateway in Gateway and Provisioned mode against an existing broker (local only, standalone)
EOF
}

expand() {
  case "$1" in
    all)  echo "$ALL" ;;
    full) echo "$FULL" ;;
    *)    echo "$1" ;;
  esac
}

[ $# -eq 0 ] && { usage; exit 0; }
case "${1:-}" in -h|--help|help) usage; exit 0 ;; esac

TASKS=""
for a in "$@"; do TASKS="$TASKS $(expand "$a")"; done

# Every name is checked before anything runs, so a typo late in the list fails
# at once rather than after the tasks ahead of it.
COUNT=0
COV_QUEUED=""
for task in $TASKS; do
  type "task_$task" >/dev/null 2>&1 || die "unknown task: $task"
  COUNT=$((COUNT + 1))
  if [ "$task" = cov ]; then COV_QUEUED=1; fi
done

FAILED=0
TIMES=""
for task in $TASKS; do
  step "$task"
  log_begin "$task"
  start=$SECONDS
  code=0
  "task_$task" || code=$?
  secs=$((SECONDS - start))
  finish "$task" "$code" "$secs"
  if [ "$code" -ne 0 ]; then
    FAILED=1
    TIMES="${TIMES:+$TIMES | }$task ${secs}s FAILED"
    warn "$task failed; stopping"
    break   # build/vet/test/scan are all fatal
  fi
  TIMES="${TIMES:+$TIMES | }$task ${secs}s"
  ok "$task"
done
# Console only: where a multi-task run spent its time, on one line.
if [ "$COUNT" -gt 1 ]; then step "timing: $TIMES"; fi
exit "$FAILED"
