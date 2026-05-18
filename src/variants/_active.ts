/**
 * The active variant — re-exports `ACTIVE_MODULES` from one specific variant
 * file. Default is `./full`, which lists every shipping module.
 *
 * Two ways to ship a different variant:
 *   1. Edit this file's re-export to point at a different variant manifest
 *      (e.g. `export * from './browser-only';`). Manual, durable.
 *   2. Set `VITE_VARIANT=<name>` at build time. Vite's resolver in
 *      `vite.config.ts` rewrites this file's path to `./<name>.ts` so the
 *      same `import { ACTIVE_MODULES } from './variants/_active'` line in
 *      the registry picks up the chosen variant. Per-build, no source edit.
 */
export * from './full';
