# W-browser notes (admin console + app, T8). Nothing was compiled or run.

## Types and signatures
- src/core/services/managed-api.ts: `TwoFactorMode`, `TwoFactorState { mode, enrolled }`, `twoFactorInUse(state | undefined): boolean` (true when defined and mode != 'off').
- src/modules/user-management/service.ts: `ManagedUser.twoFactor: boolean`; `UserPayload = Omit<ManagedUser,'twoFactor'> & { password }` (a PUT never carries it);
  `resetTwoFactor(username): Promise<ManagedResult<{rev:number}>>` = DELETE /managed/users/{enc name}/totp, no body, no rev.
- gateway-settings service: `GatewaySettings.login.twoFactor: string`.
- connections/account.ts: `AccountUser.twoFactor?: TwoFactorState`; `show(user)` toggles `a.conn-account-twofactor` (href /login/two-factor).
- admin-login: `a#admin-two-factor` (href /login/two-factor?next=/solAdmin) in the signed-in view, hidden unless me.twoFactor.mode != off.
- User Management: column "Two-factor" (On/Off), `button.user-mgmt-reset-2fa` prepended to the actions of rows that are On (added in module.ts after renderAdminRows).
  Own account reset -> toast + rbac:sign-out-requested (gateway ended the sessions).
- Gateway Settings: `select#gw-set-login-twoFactor` (off/optional/admins/mandatory), inside its own h3 "Two-factor sign-in".

## Removed/renamed: nothing.

## Must be done by others (files I do not own)
- src/core/services/managed-service.ts: `ManagedProfile` gains `twoFactor: TwoFactorState` (import type from './managed-api'). I read it as optional so nothing breaks before this.
  Once required, typed ManagedProfile fixtures (tests/modules/connections/*, tests/integration/module-events.test.ts, tests/core/services/managed-profile.test.ts,
  queue-copy dest-provisioned, provisioned-connection) need `twoFactor: { mode: 'off', enrolled: false }`.
- src/modules/connections/managed-panel.ts line ~283: `account.show({ username: p.username, admin: p.admin, twoFactor: p.twoFactor })`; add a test there.
- tests/mock-broker/gateway/routes.test.ts: the DELETE totp row can call `createUserMgmtService().resetTwoFactor(name)`.
- Docs: user-guide.md (Two-factor column, Reset two-factor, settings select, account link), developer-guide/architecture as needed.
