/**
 * The active variant — re-exports `ACTIVE_MODULES` from one specific variant
 * file. Default is `./standard`, the everyday bundle.
 *
 * Ship a different variant with the build wrapper's flag, not by editing this
 * file: `node scripts/vite-build.mjs --variant=<name> --out-filename=<name>.html`.
 * The flag drives both `vite.config.ts`'s variant-redirect resolver (which
 * rewrites this file's path to `./<name>.ts`) and the `virtual:module-registry`
 * plugin. With no flag, the plugin falls back to `standard`, so this re-export
 * must stay pointed at `./standard`: a variant listing a module outside
 * `standard` would find no bundled `module.ts` for it, and boot throws.
 */
export * from './standard';
