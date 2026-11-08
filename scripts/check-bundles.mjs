/**
 * Bundle isolation check: the Direct bundles carry no Provisioned UI, the
 * Provisioned bundle does, and the two demos (demo.html, the Direct demo, and
 * the Provisioned demo) run with no way out to a network.
 *
 * The Provisioned sign-in (the Provisioned tab, its panel and its `/managed/*`
 * client) ships in `dist/provisioned.html`, which the gateway serves at / in
 * Provisioned mode, and in `dist/provisioned-demo.html`, the Release asset that
 * runs it against the in-browser fake gateway (`src/mock-broker/gateway/`). Every other bundle
 * a GitHub Release publishes installs the Direct-only connections entry
 * (`src/modules/connections/module.ts`), which never imports the managed files.
 * This check proves it on the built output:
 *
 *   - each DIRECT_BUNDLES file exists and contains none of MANAGED_MARKERS
 *     (a hit means a Direct entry imported a managed file) and not
 *     GATEWAY_MARKER (a hit means a Direct build pulled in the fake gateway);
 *     the production ones (all but DEMO_BUNDLE) carry no NETWORK_MARKER
 *     either (a hit means demo code reached a production build);
 *   - DEMO_BUNDLE carries NETWORK_MARKER and holds nothing that reaches past
 *     the page, as PROVISIONED_DEMO_BUNDLE (below);
 *   - PROVISIONED_BUNDLE exists, contains every managed marker (a miss means the
 *     `managed` variant's MODULE_ENTRIES override did not apply, or a marker
 *     went stale after a rename -- either way the first half proved nothing)
 *     and no demo marker (the product would answer from the fake gateway);
 *   - PROVISIONED_DEMO_BUNDLE exists, contains every managed and every demo
 *     marker, and holds nothing that reaches past the page: no DEMO_FORBIDDEN call, no
 *     `<form action=...>`, and no URL literal whose host is not in
 *     ALLOWED_HOSTS.
 *
 * The managed markers are DOM ids from `index.managed.html` and endpoint paths
 * from `managed-service.ts` (sign-in, sign-out, dial and the SEMP relay):
 * strings minification keeps verbatim. The core managed profile ships
 * everywhere and carries none of them: the managed entry attaches the gateway
 * calls to it. The demo markers are the fake gateway's response header value
 * and both demos' network refusal, kept equal to their sources by
 * tests/build/check-bundles.test.ts.
 *
 * RELEASE_BUNDLES is also the Release upload list: `.github/workflows/tag.yml`
 * repeats it in its `release` step, and tests/build/check-bundles.test.ts
 * fails if the two drift.
 *
 * Run by the `build` task of scripts/dev.sh and dev.ps1, after `npm run build`.
 * No `#!` line, on purpose: tests import this file.
 *
 * Usage: npm run check:bundles (any working directory: the root comes from this file's location)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The Release bundles that install the Direct-only connections entry. */
export const DIRECT_BUNDLES = ['index.html', 'min.html', 'no-payload.html', 'no-queue-copy.html', 'demo.html'];

/** The Direct demo: a Direct bundle against the in-browser broker, with no network. */
export const DEMO_BUNDLE = 'demo.html';

/** The Provisioned demo: the Provisioned modules against the in-browser fake gateway. */
export const PROVISIONED_DEMO_BUNDLE = 'provisioned-demo.html';

/** The bundles a GitHub Release uploads. Never solAdmin.html or provisioned.html. */
export const RELEASE_BUNDLES = [...DIRECT_BUNDLES, PROVISIONED_DEMO_BUNDLE];

/** The bundle the gateway serves at / in Provisioned mode. */
export const PROVISIONED_BUNDLE = 'provisioned.html';

/** Strings only the Provisioned connections entry (`module.managed.ts`) puts into a bundle. */
export const MANAGED_MARKERS = ['conn-panel-managed', 'btn-managed-login', '/managed/me', '/managed/logout', '/managed/dial', '/managed/relay/'];

/** The fake gateway's `X-Demo-Gateway` value (`DEMO_GATEWAY_MARKER`, src/mock-broker/gateway): the Provisioned demo only. */
export const GATEWAY_MARKER = 'smu-demo-gateway/1';

/** The refusal both demos' passthrough rejects with (`NETWORK_DISABLED`, src/mock-broker/network.ts). */
export const NETWORK_MARKER = 'demo: network disabled';

/** Strings demo code puts into a bundle; the managed demo carries both. */
export const DEMO_MARKERS = [GATEWAY_MARKER, NETWORK_MARKER];

/**
 * Calls a demo bundle must not hold: a captured real `fetch` (what demo.html's
 * passthrough once was) and the network APIs the demos' shims refuse. A
 * tripwire on the built text; tests/build/no-network-apis.test.ts keeps them
 * out of the app's source.
 */
export const DEMO_FORBIDDEN = ['fetch.bind(', 'new WebSocket(', 'new EventSource(', 'new XMLHttpRequest('];

/**
 * The hosts a URL literal in a demo bundle may name, all of them inert: the
 * SVG and XML namespace host, and the reserved `.invalid` TLD (RFC 2606), which
 * never resolves -- the mock server's route base and the demo brokers.
 */
export const ALLOWED_HOSTS = [/^www\.w3\.org$/, /\.invalid$/];

/** A scheme with a literal host; a bare `https://` or `https://${host}` is not one. */
const URL_LITERAL = /\b(?:https?|wss?):\/\/([A-Za-z0-9][A-Za-z0-9.-]*)/g;

/** A `<form>` that would submit somewhere: the demo's forms submit in-process. */
const FORM_ACTION = /<form\b[^>]*\baction\s*=/i;

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
 * The hosts of the URL literals in a bundle's text that ALLOWED_HOSTS does not
 * cover, each once.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function strayHosts(text) {
    const hosts = [...text.matchAll(URL_LITERAL)].map(m => m[1]);
    return [...new Set(hosts)].filter(h => !ALLOWED_HOSTS.some(re => re.test(h)));
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
    const noDemo = (name, text, markers = DEMO_MARKERS) => {
        for (const marker of findMarkers(text, markers)) {
            problems.push(marker === GATEWAY_MARKER
                ? `${name}: contains the demo marker "${marker}". Only provisioned-demo.html may carry the fake ` +
                    'gateway; check that demoRedirects in vite.config.ts sends only the managed-demo variant to ' +
                    './mock-broker/boot.managed.'
                : `${name}: contains the demo marker "${marker}". Only the demos (${DEMO_BUNDLE}, ${PROVISIONED_DEMO_BUNDLE}) ` +
                    'may carry demo code; check that the build ran this variant in production mode.');
        }
    };
    /** A demo bundle must hold nothing that reaches past the page. */
    const offline = (name, text) => {
        for (const call of findMarkers(text, DEMO_FORBIDDEN)) {
            problems.push(
                `${name}: contains "${call}". A demo must not reach a network: answer the request from ` +
                'src/mock-broker/ (the mock server, or the fake gateway) instead.',
            );
        }
        if (FORM_ACTION.test(text)) {
            problems.push(`${name}: contains a <form> with an action. A demo's forms submit in-process.`);
        }
        for (const host of strayHosts(text)) {
            problems.push(
                `${name}: names the host "${host}" in a URL. A demo holds no real address; use a ` +
                '.invalid host, or add an inert one to ALLOWED_HOSTS in scripts/check-bundles.mjs.',
            );
        }
    };
    const lacks = (name, text, markers, why) => {
        const found = findMarkers(text, markers);
        for (const marker of markers.filter(m => !found.includes(m))) {
            problems.push(`${name}: lacks the ${why[0]} marker "${marker}". ${why[1]}`);
        }
    };
    const stale = list => `or the marker was renamed; update ${list} in scripts/check-bundles.mjs to a string ` +
        'the build still emits.';

    for (const name of DIRECT_BUNDLES) {
        const text = read(name);
        if (text === null) {
            problems.push(`${name}: missing from ${distDir}. Run \`npm run build\` (or the dev script's build task) first.`);
            continue;
        }
        for (const marker of findMarkers(text)) {
            problems.push(
                `${name}: contains the managed marker "${marker}". A Direct bundle must install the ` +
                'Direct-only connections entry; check that src/modules/connections/module.ts (and anything it ' +
                'imports) does not import module.managed.ts or managed-panel.ts.',
            );
        }
        if (name !== DEMO_BUNDLE) {
            noDemo(name, text);
            continue;
        }
        noDemo(name, text, [GATEWAY_MARKER]);
        lacks(name, text, [NETWORK_MARKER], ['demo',
            `Either it was built without --mode demo, or ./mock-broker/boot no longer refuses the network, ${stale('NETWORK_MARKER')}`]);
        offline(name, text);
    }

    const managed = read(PROVISIONED_BUNDLE);
    if (managed === null) {
        problems.push(`${PROVISIONED_BUNDLE}: missing from ${distDir}. The build must emit it with --variant=managed.`);
    } else {
        lacks(PROVISIONED_BUNDLE, managed, MANAGED_MARKERS, ['managed',
            `Either the managed variant's MODULE_ENTRIES override did not apply, ${stale('MANAGED_MARKERS')}`]);
        noDemo(PROVISIONED_BUNDLE, managed);
    }

    const demo = read(PROVISIONED_DEMO_BUNDLE);
    if (demo === null) {
        problems.push(`${PROVISIONED_DEMO_BUNDLE}: missing from ${distDir}. The build must emit it with --mode demo --variant=managed-demo.`);
    } else {
        lacks(PROVISIONED_DEMO_BUNDLE, demo, MANAGED_MARKERS, ['managed',
            `Either the managed-demo variant lost its MODULE_ENTRIES override, ${stale('MANAGED_MARKERS')}`]);
        lacks(PROVISIONED_DEMO_BUNDLE, demo, DEMO_MARKERS, ['demo',
            `Either it was built without --mode demo or without ./mock-broker/boot.managed, ${stale('DEMO_MARKERS')}`]);
        offline(PROVISIONED_DEMO_BUNDLE, demo);
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
    console.log(
        `Bundle check passed (${DIRECT_BUNDLES.length} Direct bundles carry no Provisioned UI; ${PROVISIONED_BUNDLE} does; ` +
        `${PROVISIONED_DEMO_BUNDLE} runs it against the demo gateway; both demos have no network).`,
    );
    return 0;
}

// Basename, not full-path, comparison: the path the script was started by may
// differ from this module's URL (a symlink, a relative path, Windows casing).
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(fileURLToPath(import.meta.url))) {
    process.exitCode = main();
}
