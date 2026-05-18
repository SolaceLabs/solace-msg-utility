import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.resolve(HERE, '../../src/modules');

const htmlCache = new Map<string, string>();

/**
 * Build a test container from the real `src/modules/<id>/index.html` template
 * and append it to `document.body`. Tests should prefer this over hand-written
 * `container.innerHTML = '...'` literals so the test DOM never drifts from the
 * template that actually ships in the build.
 *
 * Returns the container element; callers can still mutate it (e.g. to simulate
 * a malformed or partial template for defensive-path tests).
 *
 * `moduleId` is a plain `string`. A typo throws ENOENT at `fs.readFileSync`
 * time — loud enough for tests. Compile-time enumeration was dropped along
 * with `src/module-ids.ts` when the registry became the single source of truth
 * via the variant manifests in `src/variants/`.
 */
export function loadModuleDOM(moduleId: string): HTMLElement {
    const htmlPath = path.join(MODULES_DIR, moduleId, 'index.html');
    let html = htmlCache.get(htmlPath);
    if (html === undefined) {
        html = fs.readFileSync(htmlPath, 'utf-8');
        htmlCache.set(htmlPath, html);
    }

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    return container;
}
