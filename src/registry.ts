/**
 * Module Registry
 *
 * The active variant's `ACTIVE_MODULES` manifest (see `src/variants/`) is the
 * single source of truth for which modules are loaded and at what priority.
 * This file resolves each id in the manifest to its `PwaModule` object using
 * Vite's `import.meta.glob` over `src/modules/*​/module.ts` so the registry
 * has no hand-maintained import section that has to stay in sync.
 *
 * To add or remove a module from a variant: edit `src/variants/<name>.ts`.
 * To create a new module: drop `src/modules/<id>/` (with `module.ts` and
 * `index.html`) and add a line to the variant manifest. Nothing else here
 * needs touching.
 */

import type { PwaModule, RegisteredModule } from './core/types';
import { ACTIVE_MODULES } from './variants/_active';

// `eager: true` makes Vite resolve every match at build time so the registry
// stays synchronous (kernel construction never has to await). Files NOT in
// `ACTIVE_MODULES` still get bundled because the glob matches them — to fully
// tree-shake a module out of a shipped variant, delete its directory or split
// the glob into variant-specific patterns. Same trade-off as the previous
// hardcoded-imports design.
const moduleFiles = import.meta.glob('./modules/*/module.ts', { eager: true });

export const modules: RegisteredModule[] = Object.entries(ACTIVE_MODULES).map(([id, priority]) => {
    const file = moduleFiles[`./modules/${id}/module.ts`] as Record<string, unknown> | undefined;
    /* v8 ignore start -- developer-experience guardrail: fires only if a
     * `src/variants/<name>.ts` lists a module id that doesn't exist on disk.
     * Caught at build time for the shipped variants by `tests/variants.test.ts`,
     * which loads each variant; testing the throw itself requires mocking
     * `import.meta.glob` to return an empty map. */
    if (!file) {
        throw new Error(
            `[registry] "${id}" is in the active variant manifest but ` +
            `src/modules/${id}/module.ts does not exist. Either create the module ` +
            `or remove the entry from the variant file under src/variants/.`
        );
    }
    /* v8 ignore stop */
    const moduleObject = Object.values(file).find(
        (v): v is PwaModule => !!v && typeof v === 'object' && (v as { id?: unknown }).id === id
    );
    /* v8 ignore start -- developer-experience guardrail: fires only if a
     * `src/modules/<id>/module.ts` exports an object whose `.id` doesn't
     * match its directory name. Caught at code-review time; reproducing in a
     * test would require committing a malformed module dir into the repo. */
    if (!moduleObject) {
        throw new Error(
            `[registry] src/modules/${id}/module.ts does not export an object with id="${id}". ` +
            `Each module file must export a const whose .id matches the directory name.`
        );
    }
    /* v8 ignore stop */
    return { module: moduleObject, priority };
});
