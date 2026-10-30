import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleTemplate } from '../../scripts/module-registry-plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const htmlCache = new Map<string, string>();

/**
 * Build a test container from the real template of `src/modules/<id>/` and
 * append it to `document.body`. Tests should prefer this over hand-written
 * `container.innerHTML = '...'` literals so the test DOM never drifts from the
 * template that actually ships in the build.
 *
 * `entry` selects a variant entry template, exactly as `MODULE_ENTRIES` does in
 * a build: `loadModuleDOM('connections', 'managed')` loads
 * `index.managed.html` with the base `index.html` spliced in at its
 * `<!-- @module-base -->` marker. Composition is the registry plugin's own
 * `readModuleTemplate`, so tests and the build cannot disagree.
 *
 * Returns the container element; callers can still mutate it (e.g. to simulate
 * a malformed or partial template for defensive-path tests).
 *
 * `moduleId` is a plain `string`. A module with no template throws, so a typo
 * is loud. Compile-time enumeration was dropped along with
 * `src/module-ids.ts` when the registry became the single source of truth via
 * the variant manifests in `src/variants/`.
 */
export function loadModuleDOM(moduleId: string, entry?: string): HTMLElement {
    const key = `${moduleId}:${entry ?? ''}`;
    let html = htmlCache.get(key);
    if (html === undefined) {
        const read = readModuleTemplate(ROOT, moduleId, entry);
        if (read === null) {
            throw new Error(`loadModuleDOM: src/modules/${moduleId}/ has no index.html template`);
        }
        html = read;
        htmlCache.set(key, html);
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
}
