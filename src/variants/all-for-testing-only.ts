/**
 * Kitchen-sink variant -- every module a variant can ship (all but
 * queue-discovery, which no variant activates), for test/QA builds only.
 *
 * `connections` uses its managed entry (`MODULE_ENTRIES` below), so the build
 * carries both connection modes (Direct + Managed tabs), offered at runtime from
 * the gateway's `/hosted` response.
 *
 * Built via `node scripts/vite-build.mjs --variant=all-for-testing-only --out-filename=all-test.html`.
 * The admin-only `user-management`, `connection-management`,
 * `gateway-settings`, `tls-certificates` and `backup` modules ship at `/solAdmin` in production (the `admin`
 * variant); they are listed here, with
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
    'gateway-settings': 10,        // admin-only
    'tls-certificates': 8,         // admin-only
    'backup': 5,                   // admin-only
    'about': 1,
};

/** Module id -> entry name: the connections module's managed entry. */
export const MODULE_ENTRIES: Record<string, string> = {
    'connections': 'managed',
};
