/**
 * Managed variant -- the bundle the gateway serves at / in Provisioned mode
 * (`dist/provisioned.html`). The variant id stays `managed`.
 *
 * Built via `node scripts/vite-build.mjs --variant=managed --out-filename=provisioned.html`.
 * Never a Release asset: the sign-in only works behind a gateway in
 * Provisioned mode.
 *
 * Same modules and priorities as `standard`. The difference is the connections
 * entry: `MODULE_ENTRIES` installs `src/modules/connections/module.managed.ts`
 * (Direct form plus the Provisioned tab) with `index.managed.html`, where every
 * Release bundle installs the Direct-only `module.ts`.
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'connections': 100,
    'queue-browser': 80,
    'queue-copy': 70,
    'queue-subscription-explorer': 45,
};

/** Module id -> entry name (`module.<entry>.ts`, `index.<entry>.html`). */
export const MODULE_ENTRIES: Record<string, string> = {
    'connections': 'managed',
};
