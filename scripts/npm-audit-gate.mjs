/**
 * npm audit gate -- the npm half of the `scan` task.
 *
 * Fatal on fixable HIGH/CRITICAL advisories; unfixable ones warn and pass
 * (the dev-script contract, see docs/git.md "Why scans block the release").
 * A bare `npm audit --audit-level=high` cannot make that split: it fails on
 * advisories nobody can fix yet, and its own `fixAvailable` counts "downgrade
 * the parent a major until the dependency disappears" as a fix -- which is how
 * `npm audit fix --force` once swapped vite-plugin-singlefile 2.x for a
 * vite-2-only 0.9.0 that `npm ci` then refused.
 *
 * An advisory is UNFIXABLE when the vulnerable package's latest published
 * version still falls inside the advisory's range -- the same meaning as
 * trivy's --ignore-unfixed. Anything else is FIXABLE, including a fix that
 * needs a parent's major bump or an `overrides` entry. Unfixable advisories are
 * re-checked on every scan, so one turns fatal the day a patched release ships.
 *
 * npm runs as `node <npm-cli.js>` with no shell, so the `<`/`>` in an advisory
 * range never reach cmd.exe. That path comes from npm_execpath, which only
 * `npm run` sets -- hence the npm script.
 *
 * No `#!` line, on purpose: tests import this file, and Vite's SSR transform
 * only recognises an LF-terminated hashbang. On a CRLF (Windows) checkout it
 * hoists the imports above the `#!`, and the file fails to parse.
 *
 * Usage: npm run audit:gate
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Severities that gate, matching the `--audit-level=high` this replaces. */
const GATED = new Set(['high', 'critical']);

/** npm package-name grammar (legacy upper case allowed); never starts with `-`. */
const NAME_RE = /^(@[a-z0-9][a-z0-9._~-]*\/)?[A-Za-z0-9][A-Za-z0-9._~-]*$/;

/** Semver range characters; anything else is not a range npm can mean. */
const RANGE_RE = /^[\w.<>=|~^*+ -]+$/;

/**
 * @typedef {{ name: string, range: string, severity: string, title: string, url: string }} Advisory
 */

/**
 * Split an `npm audit --json` report into fatal and unfixable advisories.
 *
 * @param {unknown} report  parsed `npm audit --json` output
 * @param {(name: string, range: string) => boolean} isLatestVulnerable
 *        true when the package's latest published version is inside `range`
 * @returns {{ fatal: Advisory[], unfixable: Advisory[] }}
 */
export function classify(report, isLatestVulnerable) {
    const r = /** @type {any} */ (report);
    if (r && r.error) {
        const e = r.error;
        throw new Error(
            `npm audit failed: ${e.code || 'unknown code'} ${e.summary || ''}`.trim() +
            '. Check registry access (npm ping) and re-run the scan.',
        );
    }
    if (!r || typeof r.vulnerabilities !== 'object' || r.vulnerabilities === null) {
        throw new Error(
            'npm audit report has no "vulnerabilities" object -- not an `npm audit --json` v2 report. ' +
            'Run the scan with the pinned npm (see .tool-versions).',
        );
    }

    const seen = new Set();
    const fatal = [];
    const unfixable = [];
    for (const vuln of Object.values(r.vulnerabilities)) {
        for (const via of vuln.via || []) {
            // A string entry names the dependency the advisory arrives through;
            // the advisory itself is listed as an object under that package.
            if (typeof via !== 'object' || !GATED.has(via.severity)) continue;
            const key = via.url || `${via.name}@${via.range}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (!NAME_RE.test(via.name) || !RANGE_RE.test(via.range)) {
                throw new Error(
                    `npm audit advisory ${key} has an unexpected package name or range ` +
                    `(${JSON.stringify(via.name)}, ${JSON.stringify(via.range)}); refusing to pass it to npm view.`,
                );
            }
            const adv = { name: via.name, range: via.range, severity: via.severity, title: via.title, url: via.url };
            (isLatestVulnerable(adv.name, adv.range) ? unfixable : fatal).push(adv);
        }
    }
    return { fatal, unfixable };
}

/** Run npm with fixed argv and no shell; returns stdout. */
function npm(args, { allowFailure = false } = {}) {
    const cli = process.env.npm_execpath;
    if (!cli) {
        throw new Error('npm_execpath is not set -- run this as `npm run audit:gate`, not with node directly.');
    }
    const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.error) throw new Error(`could not run npm ${args[0]}: ${res.error.message}`, { cause: res.error });
    if (res.status !== 0 && !allowFailure) {
        throw new Error(`npm ${args.join(' ')} exited ${res.status}: ${res.stderr.trim()}`);
    }
    return res.stdout;
}

/** Parse `npm view ... --json` output: a string, an array of strings, or nothing. */
function versions(stdout) {
    const text = stdout.trim();
    if (!text) return [];
    const v = JSON.parse(text);
    return Array.isArray(v) ? v : [v];
}

function isLatestVulnerable(name, range) {
    const [latest] = versions(npm(['view', name, 'version', '--json']));
    if (!latest) throw new Error(`npm view ${name} returned no latest version; check registry access and re-run.`);
    return versions(npm(['view', `${name}@${range}`, 'version', '--json'])).includes(latest);
}

function main() {
    // npm audit exits non-zero whenever it finds anything; the JSON decides.
    const out = npm(['audit', '--json'], { allowFailure: true });
    let report;
    try {
        report = JSON.parse(out);
    } catch (err) {
        throw new Error('npm audit --json did not print JSON; re-run `npm audit` to see why.', { cause: err });
    }

    const { fatal, unfixable } = classify(report, isLatestVulnerable);
    const line = a => `${a.name} ${a.range} (${a.severity}) ${a.title} -- ${a.url}`;
    unfixable.forEach(a => console.log(`WARN unfixable: ${line(a)}`));
    fatal.forEach(a => console.error(`FATAL: ${line(a)}`));

    if (fatal.length) {
        console.error(
            `npm audit gate FAILED: ${fatal.length} fixable high/critical advisory(ies). A release outside ` +
            'the range exists: `npm update <pkg>` for an in-range fix, else bump the parent or add an ' +
            '`overrides` entry. Never `npm audit fix --force` -- it downgrades parents to drop the package.',
        );
        process.exitCode = 1;
        return;
    }
    console.log(`npm audit gate passed (${unfixable.length} unfixable high/critical advisory(ies) warned).`);
}

// Basename, not full-path, comparison: a drive-letter case or symlink mismatch
// on Windows must never make the gate silently skip itself and pass.
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) {
    try {
        main();
    } catch (err) {
        console.error(`npm audit gate ERROR: ${err.message}`);
        process.exitCode = 1;
    }
}
