/**
 * Module Registry
 *
 * The active variant's `ACTIVE_MODULES` manifest (see `src/variants/`) is the
 * single source of truth for which modules are loaded and at what priority.
 * This file resolves each id in the manifest to its `PwaModule` object using
 * `moduleFiles` from the `virtual:module-registry` module, which the
 * `moduleRegistryPlugin` (scripts/module-registry-plugin.mjs) generates from the
 * SAME active variant — so only the variant's modules are bundled, and there's
 * no hand-maintained import section to keep in sync.
 *
 * To add or remove a module from a variant: edit `src/variants/<name>.ts`.
 * To create a new module: drop `src/modules/<id>/` (with `module.ts` and
 * `index.html`) and add a line to the variant manifest. Nothing else here
 * needs touching.
 */

import type { PwaModule, RegisteredModule } from './core/types';
import { ACTIVE_MODULES } from './variants/_active';
// Generated per active variant by moduleRegistryPlugin: a map of
// './modules/<id>/module.ts' → that module's namespace, for exactly the
// variant's modules. Non-active modules are never imported, so they never
// enter the bundle (stronger than tree-shaking).
import { moduleFiles } from 'virtual:module-registry';

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
