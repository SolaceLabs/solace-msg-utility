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
IMAGE_REPO="ghcr.io/solacelabs/solace-msg-utility"
mkdir -p "$LOG_DIR"
cd "$REPO_ROOT"

export NO_COLOR=1

# Toolchain parity with CI: go.mod carries the `toolchain` directive and
# GOTOOLCHAIN makes any go binary honour it exactly. Set only when unset, so an
# exported value wins. Note the module lives in go-web-proxy/, not the root.
if [ -z "${GOTOOLCHAIN:-}" ] && [ -f "$GO_DIR/go.mod" ]; then
  t="$(sed -n 's/^toolchain //p' "$GO_DIR/go.mod")"
  [ -n "$t" ] && export GOTOOLCHAIN="$t"
fi

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
# npm ci when node_modules is absent or the lockfile has moved on.
ensure_deps() {
  local task=$1 stamp="$REPO_ROOT/node_modules/.package-lock.json"
  if [ -f "$stamp" ] && [ "$stamp" -nt "$REPO_ROOT/package-lock.json" ]; then
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

# trivy natively when it is on PATH, otherwise the container. --pull=always
# matters more than the tag: without it docker reuses whatever :latest resolved
# to months ago -- unpinned AND stale.
trivy_image() {
  local task=$1 ref=$2
  if command -v trivy >/dev/null 2>&1; then
    run "$task" trivy image --quiet --exit-code 1 \
      --severity HIGH,CRITICAL --ignore-unfixed "$ref"
  else
    run "$task" docker run --rm --pull=always -e NO_COLOR=1 \
      aquasec/trivy:latest image --quiet --exit-code 1 \
      --severity HIGH,CRITICAL --ignore-unfixed "$ref"
  fi
}

# --- tasks ------------------------------------------------------------------
task_build() {
  mkdir -p "$DIST"
  ensure_deps build || return $?

  # The PWA bundles are target-independent, so every cross-compile leg emits an
  # identical copy; merge-multiple in the release job collapses them.
  run build npm run build || return $?

  # Both gateway variants: the stdlib-only hosted binary and the managed one
  # (RBAC store + /managed/* handler + the yaml dep behind `-tags managed`).
  local tag out
  local -a args
  for tag in "" "managed"; do
    args=(-trimpath -ldflags "-s -w -X main.version=$VERSION")
    # -tags is omitted, never passed empty: PowerShell 5.1 drops empty string
    # arguments to a native command, which would silently shift `-o` into the
    # -tags slot. Same shape both sides.
    if [ -n "$tag" ]; then
      args+=(-tags "$tag")
      out="$DIST/$BIN_BASE-$tag$BIN_SUFFIX"
    else
      out="$DIST/$BIN_BASE$BIN_SUFFIX"
    fi
    run build env CGO_ENABLED=0 GOOS="$T_OS" GOARCH="$T_ARCH" \
      go -C "$GO_DIR" build "${args[@]}" -o "$out" . || return $?
    note build "built $out"
  done
}

task_vet() {
  ensure_deps vet || return $?
  # The build strips types without checking them, so tsc --noEmit is the only
  # thing that catches a type error.
  run vet npm run typecheck || return $?
  # Guards against a doc that starts explaining the credential transform.
  run vet npm run check:docs || return $?
  # Both ways: the RBAC backend is behind the `managed` tag, so an untagged run
  # never compiles it at all.
  run vet go -C "$GO_DIR" vet ./... || return $?
  run vet go -C "$GO_DIR" vet -tags managed ./... || return $?
}

task_test() {
  ensure_deps test || return $?
  run test npm test || return $?
  run test go -C "$GO_DIR" test -count=1 ./... || return $?
  run test go -C "$GO_DIR" test -tags managed -count=1 ./... || return $?
}

task_cov() {
  ensure_deps cov || return $?

  # vitest.config.ts sets 100% thresholds on all four metrics, so a slip fails
  # the run here rather than needing a floor comparison.
  run cov npm run test:coverage || return $?

  # After vitest, not before: it empties coverage/ on every run.
  mkdir -p "$COV_DIR/go"
  run cov go -C "$GO_DIR" test -tags managed \
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
# a standalone `scan` never appends to a stale image.log. Compose builds both
# services (gateway, gateway-managed) into :latest and :managed-latest; we then
# tag the versioned names the scan and the release refer to.
build_image() {
  local task=$1
  run "$task" docker compose -f "$COMPOSE_FILE" --progress plain build || return $?
  run "$task" docker tag "$IMAGE_REPO:latest" "$IMAGE_REPO:$IMAGE_TAG" || return $?
  run "$task" docker tag "$IMAGE_REPO:managed-latest" "$IMAGE_REPO:managed-$IMAGE_TAG" || return $?
  note "$task" "tagged $IMAGE_REPO:$IMAGE_TAG and $IMAGE_REPO:managed-$IMAGE_TAG"
}

task_image() {
  has_linux_docker || { warn "no linux-container docker daemon; skipping image"; return 0; }
  build_image image
}

# One task, every applicable check. FATAL on fixable CVEs.
task_scan() {
  local code=0
  ensure_deps scan || return $?

  run scan npm audit --audit-level=high || return $?

  # The managed superset: go-web-proxy's only third-party dependency
  # (gopkg.in/yaml.v3) is compiled in behind `-tags managed`, so an untagged
  # scan would never compile those files and would silently skip yaml.
  # `go tool`, never `go run pkg@version` -- the latter runs module-less and
  # ignores go.mod's toolchain pin.
  run scan go -C "$GO_DIR" tool govulncheck -tags=managed ./... || return $?

  # Image half: never against a stale image, so build first -- `image` is not
  # part of `all`.
  if has_linux_docker; then
    build_image scan || return $?
    trivy_image scan "$IMAGE_REPO:$IMAGE_TAG" || code=$?
    [ "$code" -eq 0 ] || return $code
    trivy_image scan "$IMAGE_REPO:managed-$IMAGE_TAG" || code=$?
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

# --- dispatch ---------------------------------------------------------------
ALL="build vet test"
FULL="build vet test cov image scan graphify"

usage() {
  cat <<EOF
usage: $(basename "$0") <task>...

  build vet test cov scan image up down graphify
  all   = $ALL            (what CI runs, as: all scan)
  full  = $FULL           (pre-tag sweep)
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

FAILED=0
for task in $TASKS; do
  type "task_$task" >/dev/null 2>&1 || die "unknown task: $task"
  step "$task"
  log_begin "$task"
  start=$SECONDS
  code=0
  "task_$task" || code=$?
  finish "$task" "$code" "$((SECONDS - start))"
  if [ "$code" -ne 0 ]; then
    FAILED=1
    warn "$task failed; stopping"
    break   # build/vet/test/scan are all fatal
  fi
  ok "$task"
done
exit "$FAILED"
