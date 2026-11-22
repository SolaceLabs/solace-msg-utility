import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readModuleView } from '../../scripts/module-registry-plugin.mjs';

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
 * `readModuleView`, so tests and the build cannot disagree.
 *
 * `build` selects what the manual holds, for a template that carries one (the
 * About module): the chapters of `variant` (the standard variant when left
 * out), or none for a demo build (`demo: true`), which ships no Help tab.
 *
 * Returns the container element; callers can still mutate it (e.g. to simulate
 * a malformed or partial template for defensive-path tests).
 *
 * `moduleId` is a plain `string`. A module with no template throws, so a typo
 * is loud. The variant manifests in `src/variants/` are the single source of
 * truth for module ids, so there is no compile-time enumeration.
 */
export function loadModuleDOM(moduleId: string, entry?: string, build: { variant?: string; demo?: boolean } = {}): HTMLElement {
    const key = `${moduleId}:${entry ?? ''}:${build.variant ?? ''}:${build.demo ?? false}`;
    let html = htmlCache.get(key);
    if (html === undefined) {
        const read = readModuleView(ROOT, moduleId, entry, build);
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
