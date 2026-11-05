import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The app's own source files: everything under `src/` that a bundle compiles
 * (`.ts`, `.js`, `.mjs`, `.html`), outside `src/mock-broker/`, which only the
 * demo bundles carry. For the suites that scan the source for a pattern
 * (tests/build/no-network-apis.test.ts, tests/mock-broker/gateway/routes.test.ts).
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SCANNED = /\.(ts|mjs|js|html)$/;

/** Repo-relative paths (`src/...`, forward slashes). */
export function productSources(): string[] {
    return fs.readdirSync(path.join(REPO_ROOT, 'src'), { recursive: true, encoding: 'utf-8' })
        .map(rel => rel.split(path.sep).join('/'))
        .filter(rel => SCANNED.test(rel) && !rel.startsWith('mock-broker/'))
        .map(rel => `src/${rel}`);
}

/** A source file's text, by its repo-relative path. */
export function readSource(file: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8');
}
