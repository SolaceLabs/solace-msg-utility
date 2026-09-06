#requires -Version 5.1
# Dev tasks. Behaviourally identical to dev.sh -- same task names, same gating,
# same footer format. CI calls task names only.
[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Tasks)

$ErrorActionPreference = 'Continue'
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot    = Split-Path -Parent $ScriptDir
$LogDir      = Join-Path $ScriptDir 'logs'
$Dist        = Join-Path $RepoRoot 'dist'
$GoDir       = Join-Path $RepoRoot 'go-web-proxy'
$CovDir      = Join-Path $RepoRoot 'coverage'
$ComposeFile = Join-Path $RepoRoot 'docker/docker-compose.yaml'
$ImageRepo   = 'ghcr.io/solacelabs/solace-msg-utility'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Set-Location $RepoRoot
$env:NO_COLOR = '1'

# Toolchain parity with CI: go.mod carries the `toolchain` directive and
# GOTOOLCHAIN makes any go binary honour it exactly. Set only when unset, so an
# exported value wins. Note the module lives in go-web-proxy/, not the root.
$goMod = Join-Path $GoDir 'go.mod'
if (-not $env:GOTOOLCHAIN -and (Test-Path $goMod)) {
  $m = Select-String -Path $goMod -Pattern '^toolchain (\S+)' | Select-Object -First 1
  if ($m) { $env:GOTOOLCHAIN = $m.Matches[0].Groups[1].Value }
}

# --- version ----------------------------------------------------------------
# The git tag is the single source of version truth. CI exports VERSION from
# the tag ref, so the release path never depends on `git describe` seeing
# history through a shallow checkout.
$Version = if ($env:VERSION) { $env:VERSION }
           else {
             $d = (git describe --tags --always --dirty 2>$null)
             if ($LASTEXITCODE -eq 0 -and $d) { "$d".Trim() } else { 'dev' }
           }
$ImageTag = $Version -replace '^v', ''
# Reaches vite (__APP_VERSION__) and the Dockerfile build-arg. The gateway's
# ldflags take $Version as-is; the PWA strips the leading `v` in vite.config.ts
# because the kernel log line already prints one.
$env:APP_VERSION = $Version

# --- output helpers ---------------------------------------------------------
function Step { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Ok   { param($m) Write-Host "ok: $m"    -ForegroundColor Green }
function Warn { param($m) Write-Host "warn: $m"  -ForegroundColor Yellow }
function Die  { param($m) Write-Host "error: $m" -ForegroundColor Red; exit 1 }

function Get-Now { (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') }
function Get-Log { param($Task) Join-Path $LogDir "$Task.log" }

function Start-TaskLog {
  param($Task)
  Set-Content -Path (Get-Log $Task) -Encoding utf8 `
    -Value ("=== {0} | {1} | version {2} ===" -f (Get-Now), $Task, $Version)
}

function Write-Finish {
  param([string]$Task, [int]$Code, [int]$Seconds)
  $status = if ($Code -eq 0) { 'OK' } else { "FAILED (exit $Code)" }
  $line = '{0} | {1} | {2}s | {3}' -f (Get-Now), $Task, $Seconds, $status
  # Add-Content, never Tee-Object: Tee doubles lines and writes UTF-16.
  Add-Content -Path (Get-Log $Task) -Value $line -Encoding utf8
  Write-Host $line
}

# Capture once, write once. "$_" flattens stderr ErrorRecords; -Width stops
# column wrap; the CSI strip keeps the file readable plain text.
function Invoke-Logged {
  # NB: $CmdArgs, not $Args -- $Args is a PowerShell automatic variable, so a
  # param named $Args binds empty and `& $Exe @Args` runs $Exe with no args.
  param([string]$Task, [string]$Exe, [string[]]$CmdArgs)
  $out = (& $Exe @CmdArgs 2>&1 | ForEach-Object { "$_" } | Out-String -Width 4096)
  $code = $LASTEXITCODE
  $out = $out -replace "\x1b\[[0-9;?]*[a-zA-Z]", ""
  Add-Content -Path (Get-Log $Task) -Value $out -Encoding utf8
  Write-Host $out
  return $code
}

# A line of our own onto the console and the log.
function Write-Note {
  param([string]$Task, [string]$Text)
  Add-Content -Path (Get-Log $Task) -Value $Text -Encoding utf8
  Write-Host $Text
}

# --- target resolution ------------------------------------------------------
function Get-HostArch {
  switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { 'amd64' } 'ARM64' { 'arm64' } default { 'amd64' }
  }
}
$TOs   = if ($env:TARGET_OS)   { $env:TARGET_OS }   else { 'windows' }
$TArch = if ($env:TARGET_ARCH) { $env:TARGET_ARCH } else { Get-HostArch }
# The literal gateway name, never the repo directory name: the local clone and
# the CI checkout differ, and the release job merges every leg into one
# directory where a name collision overwrites silently.
$BinBase   = 'go-web-proxy'
$BinSuffix = "-$TOs-$TArch"
if ($TOs -eq 'windows') { $BinSuffix = "$BinSuffix.exe" }

# --- shared helpers ---------------------------------------------------------
# npm ci when node_modules is absent or the lockfile has moved on.
function Install-Deps {
  param([string]$Task)
  $stamp = Join-Path $RepoRoot 'node_modules/.package-lock.json'
  $lock  = Join-Path $RepoRoot 'package-lock.json'
  if ((Test-Path $stamp) -and
      ((Get-Item $stamp).LastWriteTimeUtc -ge (Get-Item $lock).LastWriteTimeUtc)) {
    return 0
  }
  return (Invoke-Logged $Task 'npm' @('ci','--no-audit','--no-fund','--no-progress'))
}

# Docker can only build this project's Linux images when the daemon is running
# Linux containers. GitHub's windows runners are Windows-container only, and so
# are plenty of laptops, so the image half of `image`/`scan` warn-skips there.
# Same rule in both scripts -- this is not an OS special-case.
function Test-LinuxDocker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  $t = (docker info --format '{{.OSType}}' 2>$null)
  return ("$t".Trim() -eq 'linux')
}

# trivy natively when it is on PATH, otherwise the container. --pull=always
# matters more than the tag: without it docker reuses whatever :latest resolved
# to months ago -- unpinned AND stale.
function Invoke-TrivyImage {
  param([string]$Task, [string]$Ref)
  if (Get-Command trivy -ErrorAction SilentlyContinue) {
    return (Invoke-Logged $Task 'trivy' @(
      'image','--quiet','--exit-code','1',
      '--severity','HIGH,CRITICAL','--ignore-unfixed',$Ref))
  }
  return (Invoke-Logged $Task 'docker' @(
    'run','--rm','--pull=always','-e','NO_COLOR=1','aquasec/trivy:latest','image',
    '--quiet','--exit-code','1','--severity','HIGH,CRITICAL','--ignore-unfixed',$Ref))
}

# --- tasks ------------------------------------------------------------------
# PowerShell returns EVERY uncaptured pipeline value, not just `return`: a bare
# external command inside a task turns $code into an array. Route commands
# through Invoke-Logged, or pipe anything you don't return to Out-Null.
function Task-build {
  New-Item -ItemType Directory -Force -Path $Dist | Out-Null
  $c = Install-Deps 'build'; if ($c -ne 0) { return $c }

  # The PWA bundles are target-independent, so every cross-compile leg emits an
  # identical copy; merge-multiple in the release job collapses them.
  $c = Invoke-Logged 'build' 'npm' @('run','build'); if ($c -ne 0) { return $c }

  # Both gateway variants: the stdlib-only hosted binary and the managed one
  # (RBAC store + /managed/* handler + the yaml dep behind `-tags managed`).
  $env:CGO_ENABLED = '0'; $env:GOOS = $TOs; $env:GOARCH = $TArch
  try {
    foreach ($tag in @('', 'managed')) {
      $out = if ($tag) { Join-Path $Dist "$BinBase-$tag$BinSuffix" }
             else      { Join-Path $Dist "$BinBase$BinSuffix" }
      # -tags is omitted, never passed empty: PowerShell 5.1 DROPS an empty
      # string argument to a native command, so `-tags '' -o $out` reaches go as
      # `-tags -o` and $out becomes a package path. Same shape in dev.sh.
      $goArgs = @('-C', $GoDir, 'build', '-trimpath',
                  '-ldflags', "-s -w -X main.version=$Version")
      if ($tag) { $goArgs += @('-tags', $tag) }
      $goArgs += @('-o', $out, '.')
      $c = Invoke-Logged 'build' 'go' $goArgs
      if ($c -ne 0) { return $c }
      Write-Note 'build' "built $out"
    }
  } finally {
    Remove-Item Env:CGO_ENABLED, Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue
  }
  return 0
}

function Task-vet {
  $c = Install-Deps 'vet'; if ($c -ne 0) { return $c }
  # The build strips types without checking them, so tsc --noEmit is the only
  # thing that catches a type error.
  $c = Invoke-Logged 'vet' 'npm' @('run','typecheck'); if ($c -ne 0) { return $c }
  # Guards against a doc that starts explaining the credential transform.
  $c = Invoke-Logged 'vet' 'npm' @('run','check:docs'); if ($c -ne 0) { return $c }
  # Both ways: the RBAC backend is behind the `managed` tag, so an untagged run
  # never compiles it at all.
  $c = Invoke-Logged 'vet' 'go' @('-C',$GoDir,'vet','./...'); if ($c -ne 0) { return $c }
  return (Invoke-Logged 'vet' 'go' @('-C',$GoDir,'vet','-tags','managed','./...'))
}

function Task-test {
  $c = Install-Deps 'test'; if ($c -ne 0) { return $c }
  $c = Invoke-Logged 'test' 'npm' @('test'); if ($c -ne 0) { return $c }
  $c = Invoke-Logged 'test' 'go' @('-C',$GoDir,'test','-count=1','./...'); if ($c -ne 0) { return $c }
  return (Invoke-Logged 'test' 'go' @('-C',$GoDir,'test','-tags','managed','-count=1','./...'))
}

function Task-cov {
  $c = Install-Deps 'cov'; if ($c -ne 0) { return $c }
  $covProfile = Join-Path $CovDir 'go/coverage.out'

  # vitest.config.ts sets 100% thresholds on all four metrics, so a slip fails
  # the run here rather than needing a floor comparison.
  $c = Invoke-Logged 'cov' 'npm' @('run','test:coverage'); if ($c -ne 0) { return $c }

  # After vitest, not before: it empties coverage/ on every run.
  New-Item -ItemType Directory -Force -Path (Join-Path $CovDir 'go') | Out-Null
  $c = Invoke-Logged 'cov' 'go' @(
    '-C',$GoDir,'test','-tags','managed',"-coverprofile=$covProfile",'./...')
  if ($c -ne 0) { return $c }
  $c = Invoke-Logged 'cov' 'go' @(
    '-C',$GoDir,'tool','cover',"-html=$covProfile",'-o',(Join-Path $CovDir 'go/coverage.html'))
  if ($c -ne 0) { return $c }
  $c = Invoke-Logged 'cov' 'go' @('-C',$GoDir,'tool','cover',"-func=$covProfile")
  if ($c -ne 0) { return $c }

  # Print the totals last so the footer captures them: the previous run's
  # numbers in logs/cov.log are the floor (local only -- CI is a fresh
  # checkout with no prior log).
  $log = Get-Log 'cov'
  $web = (Select-String -Path $log -Pattern 'All files' | Select-Object -First 1)
  $got = (Select-String -Path $log -Pattern '^total:'   | Select-Object -First 1)
  $webText = if ($web) { ($web.Line -replace '\s+',' ').Trim() } else { 'unavailable' }
  $gotText = if ($got) { ($got.Line -replace '\s+',' ').Trim() } else { 'unavailable' }
  Write-Note 'cov' "coverage total (web):  $webText"
  Write-Note 'cov' "coverage total (go):   $gotText"
  return 0
}

# The actual build, logged under the calling task so a standalone `scan` never
# appends to a stale image.log. Compose builds both services (gateway,
# gateway-managed) into :latest and :managed-latest; we then tag the versioned
# names the scan and the release refer to.
function Build-Image {
  param([string]$Task)
  $c = Invoke-Logged $Task 'docker' @(
    'compose','-f',$ComposeFile,'--progress','plain','build')
  if ($c -ne 0) { return $c }
  $c = Invoke-Logged $Task 'docker' @('tag',"${ImageRepo}:latest","${ImageRepo}:$ImageTag")
  if ($c -ne 0) { return $c }
  $c = Invoke-Logged $Task 'docker' @('tag',"${ImageRepo}:managed-latest","${ImageRepo}:managed-$ImageTag")
  if ($c -ne 0) { return $c }
  Write-Note $Task "tagged ${ImageRepo}:$ImageTag and ${ImageRepo}:managed-$ImageTag"
  return 0
}

function Task-image {
  if (-not (Test-LinuxDocker)) {
    Warn 'no linux-container docker daemon; skipping image'; return 0
  }
  return (Build-Image 'image')
}

# One task, every applicable check. FATAL on fixable CVEs.
function Task-scan {
  $c = Install-Deps 'scan'; if ($c -ne 0) { return $c }

  $c = Invoke-Logged 'scan' 'npm' @('audit','--audit-level=high'); if ($c -ne 0) { return $c }

  # The managed superset: go-web-proxy's only third-party dependency
  # (gopkg.in/yaml.v3) is compiled in behind `-tags managed`, so an untagged
  # scan would never compile those files and would silently skip yaml.
  # `go tool`, never `go run pkg@version` -- the latter runs module-less and
  # ignores go.mod's toolchain pin.
  $c = Invoke-Logged 'scan' 'go' @('-C',$GoDir,'tool','govulncheck','-tags=managed','./...')
  if ($c -ne 0) { return $c }

  # Image half: never against a stale image, so build first -- `image` is not
  # part of `all`.
  if (Test-LinuxDocker) {
    $c = Build-Image 'scan'; if ($c -ne 0) { return $c }
    $c = Invoke-TrivyImage 'scan' "${ImageRepo}:$ImageTag"; if ($c -ne 0) { return $c }
    return (Invoke-TrivyImage 'scan' "${ImageRepo}:managed-$ImageTag")
  }
  Warn 'no linux-container docker daemon; skipping the image scan'
  return 0
}

function Task-up   { Invoke-Logged 'up'   'docker' @('compose','-f',$ComposeFile,'up','-d') }
function Task-down { Invoke-Logged 'down' 'docker' @('compose','-f',$ComposeFile,'down') }

# Local only: the graph is a developer artifact, not a CI output.
function Task-graphify {
  if ($env:CI) { Warn 'graphify is local-only; skipping in CI'; return 0 }
  if (-not (Get-Command graphify -ErrorAction SilentlyContinue)) {
    Warn 'graphify not on PATH; skipping'; return 0
  }
  return (Invoke-Logged 'graphify' 'graphify' @('update','.'))
}

# --- dispatch ---------------------------------------------------------------
$All  = @('build','vet','test')
$Full = @('build','vet','test','cov','image','scan','graphify')

function Show-Usage {
  @"
usage: dev.ps1 <task>...

  build vet test cov scan image up down graphify
  all   = $($All -join ' ')            (what CI runs, as: all scan)
  full  = $($Full -join ' ')           (pre-tag sweep)
"@ | Write-Host
}

if (-not $Tasks -or $Tasks[0] -in @('-h','--help','help')) { Show-Usage; exit 0 }

$queue = @()
foreach ($t in $Tasks) {
  switch ($t) { 'all' { $queue += $All } 'full' { $queue += $Full } default { $queue += $t } }
}

$failed = 0
foreach ($task in $queue) {
  if (-not (Get-Command "Task-$task" -ErrorAction SilentlyContinue)) { Die "unknown task: $task" }
  Step $task
  Start-TaskLog $task
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $code = 0
  try { $code = & "Task-$task" } catch { $code = 1 }
  if ($null -eq $code) { $code = 0 }
  $sw.Stop()
  Write-Finish -Task $task -Code $code -Seconds ([int]$sw.Elapsed.TotalSeconds)
  if ($code -ne 0) { $failed = 1; Warn "$task failed; stopping"; break }
  Ok $task
}
exit $failed
