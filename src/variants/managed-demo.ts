/**
 * Managed demo variant -- `dist/provisioned-demo.html`, a Release asset: the real
 * Provisioned modules against the demo's fake gateway and in-browser broker
 * (`src/mock-broker/boot.managed.ts`, picked by `demoRedirects` in
 * vite.config.ts).
 *
 * Built via `node scripts/vite-build.mjs --mode demo --variant=managed-demo --out-filename=provisioned-demo.html`.
 *
 * The managed variant's messaging modules plus the three admin editors, which
 * the product serves at /solAdmin: here they are sidebar entries, shown to an
 * administrator only (`isModuleVisible`). No `admin-login`: the connections
 * module's Provisioned panel owns the session, as in provisioned.html, and a second
 * owner would race it. No queue-subscription-explorer: every managed session
 * hides it.
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'connections': 100,
    'queue-browser': 80,
    'queue-copy': 70,
    'user-management': 20,         // admin-only
    'connection-management': 15,   // admin-only
    'gateway-settings': 10,        // admin-only: config.yaml
};

/** Module id -> entry name (`module.<entry>.ts`, `index.<entry>.html`). */
export const MODULE_ENTRIES: Record<string, string> = {
    'connections': 'managed',
};
