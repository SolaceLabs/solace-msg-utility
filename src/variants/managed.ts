/**
 * Managed variant -- the bundle the managed container image serves
 * (`dist/managed.html`, copied over the image's `index.html`).
 *
 * Built via `node scripts/vite-build.mjs --variant=managed --out-filename=managed.html`.
 * Never a Release asset: managed sign-in only works behind the managed gateway.
 *
 * Same modules and priorities as `standard`. The difference is the connections
 * entry: `MODULE_ENTRIES` installs `src/modules/connections/module.managed.ts`
 * (Direct form plus the Managed tab) with `index.managed.html`, where every
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
