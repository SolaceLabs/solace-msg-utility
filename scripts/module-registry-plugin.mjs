/**
 * Manifest-driven module registry plugin (shared by vite.config.ts and
 * vitest.config.ts).
 *
 * The eager `import.meta.glob('./modules/*​/module.ts')` the registry used to
 * use bundled EVERY module on disk into every build, regardless of the active
 * variant manifest (verified: a module in no variant still landed in min.html).
 * This plugin instead emits a `virtual:module-registry` module that statically
 * imports ONLY the active variant's modules — so non-active modules (and their
 * transitive imports, e.g. the managed credential transform) never enter the
 * graph for a build that doesn't list them.
 *
 * Exclusion here is by NON-import (the files are simply never imported), which
 * is stronger than tree-shaking and unaffected by `inlineDynamicImports`.
 *
 * The emitted module shape mirrors what the old eager glob produced
 * (`Record<'./modules/<id>/module.ts', namespace>`), so `src/registry.ts`'s
 * find-by-`.id` loop is unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';

const VIRTUAL_ID = 'virtual:module-registry';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/**
 * Extract the module ids declared in a variant manifest's `ACTIVE_MODULES`
 * object literal. Comments are stripped first so commented-out lines or quotes
 * inside comments can't pollute the result. Manifests are a controlled, flat
 * `Record<string, number>`, so a tolerant key scan is reliable.
 */
export function extractModuleIds(src) {
    const noComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    const block = noComments.match(/ACTIVE_MODULES[^=]*=\s*\{([\s\S]*?)\}/);
    if (!block) {
        throw new Error('[module-registry] could not locate the ACTIVE_MODULES object literal');
    }
    const ids = [];
    const re = /['"]([\w-]+)['"]\s*:/g;
    let m;
    while ((m = re.exec(block[1])) !== null) ids.push(m[1]);
    return ids;
}

/** Resolve the active variant's module ids from its manifest file on disk. */
export function activeModuleIds(root, variant) {
    const name = variant || 'standard';
    const variantPath = path.resolve(root, 'src/variants', `${name}.ts`);
    if (!fs.existsSync(variantPath)) {
        throw new Error(`[module-registry] variant "${name}" requested but ${variantPath} does not exist.`);
    }
    return extractModuleIds(fs.readFileSync(variantPath, 'utf-8'));
}

export function moduleRegistryPlugin({ root, variant } = {}) {
    const projectRoot = root || process.cwd();
    return {
        name: 'module-registry',
        enforce: 'pre',
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : null;
        },
        load(id) {
            if (id !== RESOLVED_ID) return null;
            const ids = activeModuleIds(projectRoot, variant);
            const modulesDir = path.resolve(projectRoot, 'src/modules');
            const imports = [];
            const entries = [];
            ids.forEach((mid, i) => {
                const abs = path.join(modulesDir, mid, 'module.ts').replace(/\\/g, '/');
                if (!fs.existsSync(abs)) {
                    throw new Error(
                        `[module-registry] variant lists "${mid}" but ${abs} does not exist. ` +
                        `Create src/modules/${mid}/module.ts or remove it from the variant manifest.`
                    );
                }
                imports.push(`import * as m${i} from ${JSON.stringify(abs)};`);
                entries.push(`  ${JSON.stringify(`./modules/${mid}/module.ts`)}: m${i},`);
            });
            return `${imports.join('\n')}\nexport const moduleFiles = {\n${entries.join('\n')}\n};\n`;
        },
    };
}
