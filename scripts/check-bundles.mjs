/**
 * Bundle isolation check: Release bundles carry no managed UI, and the managed
 * bundle does.
 *
 * The managed sign-in (the Managed tab, its panel and its `/managed/*` client)
 * ships only in `dist/managed.html`, which the managed container image serves
 * as its index. Every bundle a GitHub Release publishes installs the Direct-only
 * connections entry (`src/modules/connections/module.ts`), which never imports
 * the managed files. This check proves both halves on the built output:
 *
 *   - each RELEASE_BUNDLES file exists and contains none of MANAGED_MARKERS
 *     (a hit means a Release entry imported a managed file);
 *   - MANAGED_BUNDLE exists and contains every marker (a miss means the
 *     `managed` variant's MODULE_ENTRIES override did not apply, or a marker
 *     went stale after a rename -- either way the first half proved nothing).
 *
 * The markers are DOM ids from `index.managed.html` and endpoint paths from
 * `managed-service.ts`: strings minification keeps verbatim. The core managed
 * session store still ships everywhere until it is removed; it carries none
 * of these strings.
 *
 * RELEASE_BUNDLES is also the Release upload list: `.github/workflows/tag.yml`
 * repeats it in its `release` step, and tests/build/check-bundles.test.ts
 * fails if the two drift.
 *
 * Run by the `build` task of scripts/dev.sh and dev.ps1, after `npm run build`.
 * No `#!` line, on purpose: tests import this file (see check-docs-secrecy.mjs).
 *
 * Usage: npm run check:bundles (any working directory: the root comes from this file's location)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The bundles a GitHub Release uploads. Never solAdmin.html or managed.html. */
export const RELEASE_BUNDLES = ['index.html', 'min.html', 'no-payload.html', 'no-queue-copy.html', 'mock.html'];

/** The managed image's bundle, served as its index.html. */
export const MANAGED_BUNDLE = 'managed.html';

/** Strings only the managed connections entry puts into a bundle. */
export const MANAGED_MARKERS = ['conn-panel-managed', 'btn-managed-login', '/managed/getConnections', '/managed/reload'];

/** The repo root: this file lives in `<root>/scripts/`. */
export function repoRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/**
 * The markers that occur in a bundle's text.
 *
 * @param {string} text
 * @param {string[]} [markers]
 * @returns {string[]}
 */
export function findMarkers(text, markers = MANAGED_MARKERS) {
    return markers.filter(m => text.includes(m));
}

/**
 * Check the built bundles in `distDir`. One message per problem, empty when
 * clean.
 *
 * @param {string} distDir
 * @returns {string[]}
 */
export function checkBundles(distDir) {
    const problems = [];
    const read = name => {
        const file = path.join(distDir, name);
        return existsSync(file) ? readFileSync(file, 'utf-8') : null;
    };
    for (const name of RELEASE_BUNDLES) {
        const text = read(name);
        if (text === null) {
            problems.push(`${name}: missing from ${distDir}. Run \`npm run build\` (or the dev script's build task) first.`);
            continue;
        }
        for (const marker of findMarkers(text)) {
            problems.push(
                `${name}: contains the managed marker "${marker}". A Release bundle must install the ` +
                'Direct-only connections entry; check that src/modules/connections/module.ts (and anything it ' +
                'imports) does not import module.managed.ts or managed-panel.ts.',
            );
        }
    }
    const managed = read(MANAGED_BUNDLE);
    if (managed === null) {
        problems.push(`${MANAGED_BUNDLE}: missing from ${distDir}. The build must emit it with --variant=managed.`);
    } else {
        const found = findMarkers(managed);
        for (const marker of MANAGED_MARKERS.filter(m => !found.includes(m))) {
            problems.push(
                `${MANAGED_BUNDLE}: lacks the managed marker "${marker}". Either the managed variant's ` +
                'MODULE_ENTRIES override did not apply, or the marker was renamed; update MANAGED_MARKERS ' +
                'in scripts/check-bundles.mjs to a string the managed entry still emits.',
            );
        }
    }
    return problems;
}

/**
 * The CLI: check `<root>/dist`, report, and return the exit code.
 *
 * @param {string} [root]
 * @returns {0 | 1}
 */
export function main(root = repoRoot()) {
    const problems = checkBundles(path.join(root, 'dist'));
    if (problems.length) {
        console.error(`Bundle check FAILED: ${problems.length} problem(s).`);
        problems.forEach(p => console.error(`  ${p}`));
        return 1;
    }
    console.log(`Bundle check passed (${RELEASE_BUNDLES.length} Release bundles carry no managed UI; ${MANAGED_BUNDLE} does).`);
    return 0;
}

// Basename, not full-path, comparison (as in check-docs-secrecy.mjs).
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
