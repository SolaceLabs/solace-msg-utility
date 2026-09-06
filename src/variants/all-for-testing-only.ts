/**
 * Kitchen-sink variant — every module, for test/QA builds only.
 *
 * `connections` carries both connection modes (Direct + Managed tabs), selected
 * at runtime from the gateway's `/hosted` response rather than by the variant,
 * so there is no separate managed connection module to list here.
 *
 * Built via `node scripts/vite-build.mjs --variant=all-for-testing-only --out-filename=all-test.html`.
 * The admin-only `user-management` + `connection-management` modules ship at
 * `/solAdmin` in production (the `admin` variant); they are listed here, with
 * `admin-login`, so a single build exercises every module. `isModuleVisible`
 * (rbac.ts's MODULE_REQUIREMENTS) still hides them for non-admin sessions.
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'connections': 100,
    'queue-browser': 80,
    'queue-copy': 70,
    'queue-subscription-explorer': 45,
    'admin-login': 25,             // /solAdmin entry point
    'user-management': 20,         // admin-only
    'connection-management': 15,   // admin-only
};
