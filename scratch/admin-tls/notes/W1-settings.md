# W1-settings: Gateway Settings layout, tiles, restart card, naming (nothing was run)

Files: src/modules/gateway-settings/{index.html,module.ts,service.ts,styles.css}, src/modules/admin-login/index.html, src/css/components.css,
tests/modules/gateway-settings/{module,service}.test.ts, tests/modules/admin-login/module.test.ts.

## Shared CSS
- `.form-cols` added to src/css/components.css right after `.form-group` (grid, auto-fit minmax(180px,1fr), gap .75rem 1rem), as designed.

## service.ts (src/modules/gateway-settings/service.ts)
- `GatewaySettings.tls` = `{ insecureSkipVerify: boolean }` (certFile/keyFile/trustDir gone). `SettingsView.hostOnly` removed.
- `SettingsService` gains `restart(): Promise<ManagedResult<{ restarting: boolean }>>` (POST /managed/restart, no body) and
  `ping(): Promise<boolean>` (plain `fetch('/hosted', { method: 'GET', cache: 'no-store' })`; ok -> true, error status or rejection -> false).

## module.ts
- `GatewaySettingsModule.name` = 'Gateway Settings' (id unchanged). `install(app, opts?: GatewaySettingsOptions)`;
  exported `GatewaySettingsOptions = { wait?(ms): Promise<void>; navigate?(url): void }` (defaults: setTimeout, `window.location.assign`).
- Restart flow: confirmDialog (confirmLabel "Restart gateway") -> service.restart() -> banner `#gw-set-restarting` -> wait 2000 ms, then every
  1000 ms, up to 60 looks, `service.ping()` -> `navigate('/login?next=/solAdmin')`. Failure of the POST: `#gw-set-restart-error` (401 -> sign-out request).
  No answer in time: error text, button enabled again.
- Removed: the three path fields, `gw-set-host` tag and its CSS, the "edit on host" legend, `hostOnly` use, `input.disabled` by host key.

## Element ids / classes
- `#gw-set-view` is now a plain wrapper (no `.card`); every section is `.card.gw-set-card` (h3.gw-set-section) directly under it.
  Cards: title card (Reload `#btn-gw-set-reload`, banners), Connections, Access, Sessions, Sign-in throttle, Two-factor sign-in, Modules,
  Logging, Audit trail, "Broker trust" (holds `#gw-set-tls-insecureSkipVerify`), then `.gw-set-actions` (Save `#btn-gw-set-save`, `#gw-set-error`),
  then the "Gateway" card `#gw-set-restart-card` (`#btn-gw-set-restart`, `#gw-set-restarting`, `#gw-set-restart-error`).
- Pending notice: `#gw-set-pending` now holds `#gw-set-pending-text` (the text; tests read this, not #gw-set-pending) and `#btn-gw-set-goto-restart`
  (focuses `#btn-gw-set-restart`).
- Tiles: `#gw-set-modules-offered` (role=group) holds `button.gw-set-tile[data-module][aria-pressed]` with `.gw-set-tile-name` and optional `.gw-set-tile-desc`.
  The old per-module checkboxes are gone. Kept every other id (gw-set-<key with dot as dash>, gw-set-client, gw-set-disk).

## admin-login
- Hint text now names `User Mgmt.`, `Conn. Mgmt`, `Gateway Settings`, `Certificates`.

## Next agents
- Other tests that name the module 'Settings' or click the offered-module checkboxes (`#gw-set-modules-offered input`), or set tls path fields in the
  gateway-settings DOM (tests/mock-broker/demo-flow*.test.ts, tests/integration/*, scripts/e2e.mjs browser checks): re-check; I grepped tests/ for
  `'Settings'` and found none outside my files.
- The fake's boot reloads onto the sign-in itself at the end of its restart pause; the console's navigate to /login in the demo would only run if a
  poll lands after the pause but before the reload (the listeners run in the same tick, so it should not).
- Docs: user-guide.md (cards, tiles, Gateway card, name), developer-guide.md/test-report.md.
