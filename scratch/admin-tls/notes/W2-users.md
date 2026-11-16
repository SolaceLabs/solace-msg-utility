# W2-users: User Management layout and module pills (nothing was run)

Files: src/modules/user-management/{module.ts,index.html,styles.css}, tests/modules/user-management/module.test.ts. service.ts, access-test.ts unchanged.

## Layout
- Every section is `.card.user-mgmt-card`: list (`#user-mgmt-list-view`), form cards Account / Modules / Entitlements, Permission test (`#user-mgmt-test-view`).
- `#user-mgmt-form-view` is now a plain wrapper (no `.card`) holding the three form cards plus an actions block (Save, Cancel, form error) styled `.user-mgmt-card` without `.card`.
- `.user-mgmt-card` is now `width:100%; margin:0 0 1rem` (was max-width 720px, margin 2rem auto).
- Uses `.form-cols` (NOT defined by me; src/css/components.css must carry it) for username+password and for the permission test's User/Broker/VPN/Queue.

## Modules editor
- `#user-mgmt-modules-default` is now a RADIO (was checkbox), same id; new radio `#user-mgmt-modules-choose` (same `name`).
- `#user-mgmt-modules-default-hint` holds the names the default grants ("Queue Browser, Queue Copy") or "no modules".
- `#user-mgmt-modules`: pills `span.user-mgmt-pill[data-module]`, optional `span.user-mgmt-pill-tag` ("not offered"), optional `button.user-mgmt-pill-remove` (aria-label "Remove <Name>"); empty -> `p` "No modules.".
- `#user-mgmt-module-add` wrapper (hidden under the default), `#btn-user-mgmt-add-module` (aria-expanded), `#user-mgmt-module-menu` (role=menu) holding `button.user-mgmt-menu-item[data-module]`; Escape closes it.
- Saved: `modules: null` for the default, else the chosen list. No other id changed or removed. Removed: the per-module checkboxes (`#user-mgmt-modules input`); module.ts `checkedModules()`.

## Next agents
- e2e (scripts/e2e.mjs) and tests/integration/admin-session.test.ts, tests/mock-broker/demo-flow.test.ts mention user-mgmt ids: none of them touch the modules checkboxes (grep showed no hits), but re-check if they do.
- Docs: user-guide.md (cards, pills, Add module menu, "not offered"), test-report.md.
