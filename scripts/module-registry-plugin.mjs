/**
 * Manifest-driven module registry plugin (shared by vite.config.ts and
 * vitest.config.ts).
 *
 * The eager `import.meta.glob('./modules/*​/module.ts')` the registry used to
 * use bundled EVERY module on disk into every build, regardless of the active
 * variant manifest (verified: a module in no variant still landed in min.html).
 * This plugin instead emits a `virtual:module-registry` module that statically
 * imports ONLY the active variant's modules, so non-active modules (and their
 * transitive imports) never enter the graph for a build that doesn't list them.
 *
 * Exclusion here is by NON-import (the files are simply never imported), which
 * is stronger than tree-shaking and unaffected by `inlineDynamicImports`.
 *
 * Entry overrides: a manifest may also export `MODULE_ENTRIES`, mapping a
 * module id to an entry name. `{ connections: 'managed' }` installs
 * `src/modules/connections/module.managed.ts` and uses `index.managed.html` as
 * its template. That is how the `managed` variant adds the Managed tab while
 * every Release bundle installs the Direct-only `module.ts`, which never
 * imports the managed files.
 *
 * The emitted `moduleFiles` map is keyed by module id; `src/registry.ts` finds
 * the module object in each namespace by its `.id`.
 */
import fs from 'node:fs';
import path from 'node:path';

const VIRTUAL_ID = 'virtual:module-registry';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

/** Marker an entry template uses to pull in the module's base `index.html`. */
export const MODULE_BASE_MARKER = '<!-- @module-base -->';

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
}

/**
 * Extract the module ids declared in a variant manifest's `ACTIVE_MODULES`
 * object literal. Comments are stripped first so commented-out lines or quotes
 * inside comments can't pollute the result. Manifests are a controlled, flat
 * `Record<string, number>`, so a tolerant key scan is reliable.
 */
export function extractModuleIds(src) {
    const block = stripComments(src).match(/ACTIVE_MODULES[^=]*=\s*\{([\s\S]*?)\}/);
    if (!block) {
        throw new Error('[module-registry] could not locate the ACTIVE_MODULES object literal');
    }
    const ids = [];
    const re = /['"]([\w-]+)['"]\s*:/g;
    let m;
    while ((m = re.exec(block[1])) !== null) ids.push(m[1]);
    return ids;
}

/**
 * Extract the optional `MODULE_ENTRIES` literal (`'id': 'entry'` pairs) from a
 * variant manifest. A manifest without one maps nothing: every module uses its
 * `module.ts` and `index.html`.
 */
export function extractModuleEntries(src) {
    const block = stripComments(src).match(/MODULE_ENTRIES[^=]*=\s*\{([\s\S]*?)\}/);
    const entries = {};
    if (!block) return entries;
    const re = /['"]?([\w-]+)['"]?\s*:\s*['"]([\w-]+)['"]/g;
    let m;
    while ((m = re.exec(block[1])) !== null) entries[m[1]] = m[2];
    return entries;
}

function readVariant(root, variant) {
    const name = variant || 'standard';
    const variantPath = path.resolve(root, 'src/variants', `${name}.ts`);
    if (!fs.existsSync(variantPath)) {
        throw new Error(`[module-registry] variant "${name}" requested but ${variantPath} does not exist.`);
    }
    return { name, src: fs.readFileSync(variantPath, 'utf-8') };
}

/** Resolve the active variant's module ids from its manifest file on disk. */
export function activeModuleIds(root, variant) {
    return extractModuleIds(readVariant(root, variant).src);
}

/**
 * Resolve the active variant's entry overrides. An override for a module the
 * variant does not list is a typo, so it fails the build instead of being
 * silently ignored.
 */
export function activeModuleEntries(root, variant) {
    const { name, src } = readVariant(root, variant);
    const ids = extractModuleIds(src);
    const entries = extractModuleEntries(src);
    for (const id of Object.keys(entries)) {
        if (!ids.includes(id)) {
            throw new Error(
                `[module-registry] variant "${name}" sets MODULE_ENTRIES["${id}"] but does not list "${id}" ` +
                `in ACTIVE_MODULES. Add the module or remove the entry override.`
            );
        }
    }
    return entries;
}

/** Absolute path of the module file a variant installs for `id`. */
export function moduleEntryFile(root, id, entry) {
    const file = entry ? `module.${entry}.ts` : 'module.ts';
    return path.resolve(root, 'src/modules', id, file);
}

/**
 * The template the build injects for a module, or `null` when it has none.
 * With an entry, `index.<entry>.html` is used when present; its
 * `<!-- @module-base -->` marker is replaced by the base `index.html`, so markup
 * shared by both entries lives in one file. Shared by the Vite template
 * injector and the tests' `loadModuleDOM`, so tests see exactly what ships.
 */
export function readModuleTemplate(root, id, entry) {
    const dir = path.resolve(root, 'src/modules', id);
    const basePath = path.join(dir, 'index.html');
    const base = fs.existsSync(basePath) ? fs.readFileSync(basePath, 'utf-8') : null;
    const entryPath = entry ? path.join(dir, `index.${entry}.html`) : null;
    if (!entryPath || !fs.existsSync(entryPath)) return base;
    const html = fs.readFileSync(entryPath, 'utf-8');
    if (!html.includes(MODULE_BASE_MARKER)) return html;
    if (base === null) {
        throw new Error(
            `[module-registry] ${entryPath} uses ${MODULE_BASE_MARKER} but ${basePath} does not exist. ` +
            `Create the base template or remove the marker.`
        );
    }
    return html.replace(MODULE_BASE_MARKER, () => base.replace(/\n$/, ''));
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
            const entries = activeModuleEntries(projectRoot, variant);
            const imports = [];
            const map = [];
            ids.forEach((mid, i) => {
                const abs = moduleEntryFile(projectRoot, mid, entries[mid]).replace(/\\/g, '/');
                if (!fs.existsSync(abs)) {
                    const file = path.basename(abs);
                    throw new Error(
                        `[module-registry] variant lists "${mid}" but ${abs} does not exist. ` +
                        `Create src/modules/${mid}/${file} or remove it from the variant manifest.`
                    );
                }
                imports.push(`import * as m${i} from ${JSON.stringify(abs)};`);
                map.push(`  ${JSON.stringify(mid)}: m${i},`);
            });
            return `${imports.join('\n')}\nexport const moduleFiles = {\n${map.join('\n')}\n};\n`;
        },
    };
}
