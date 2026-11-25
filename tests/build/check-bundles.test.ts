// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RELEASE_BUNDLES,
    DIRECT_BUNDLES,
    PROVISIONED_DEMO_BUNDLE,
    DEMO_BUNDLE,
    PROVISIONED_BUNDLE,
    ADMIN_BUNDLE,
    VENDOR_MARKERS,
    MANUAL_MARKER,
    MANUAL_BUNDLES,
    MANAGED_MARKERS,
    DEMO_MARKERS,
    GATEWAY_MARKER,
    NETWORK_MARKER,
    DEMO_FORBIDDEN,
    BUNDLE_CSP,
    findMarkers,
    strayHosts,
    checkBundles,
    main,
    repoRoot,
} from '../../scripts/check-bundles.mjs';
import { applyCsp } from '../../scripts/csp.mjs';
import { DEMO_GATEWAY_MARKER } from '../../src/mock-broker/gateway';
import { NETWORK_DISABLED } from '../../src/mock-broker/network';

/**
 * What a clean provisioned-demo.html holds: both marker sets, a form that submits
 * in-process, and only the inert URL literals the real build carries (the SVG
 * namespace, the mock server's `.invalid` route base, a URL built from a
 * variable).
 */
const PROVISIONED_DEMO_CLEAN = `<html>${[...MANAGED_MARKERS, ...DEMO_MARKERS, ...VENDOR_MARKERS].join(' ')}` +
    '<form class="login-form"></form><svg xmlns="http://www.w3.org/2000/svg"></svg>' +
    '<script>const b="https://mock.invalid/";const u=`https://${a.host}:${a.port}`;</script></html>';

/** What the shell's vendor blocks leave in a bundle that needs the Solace SDK: the loaders' paths and the banner id. */
const VENDOR = VENDOR_MARKERS.join(' ');

/** What the About template leaves in a bundle with the manual: a chapter's opening tag. */
const MANUAL = MANUAL_MARKER;

/** What a clean demo.html holds: the network refusal, the vendor blocks, the Direct form and an inert namespace URL. */
const DEMO_CLEAN = `<html>${NETWORK_MARKER} ${VENDOR}<div id="conn-host"></div><svg xmlns="http://www.w3.org/2000/svg"></svg></html>`;

/** A bundle's content as the build writes it: a charset tag, then the policy of its kind (scripts/csp.mjs). */
const built = (name: string, content: string) => applyCsp(`<meta charset="UTF-8">${content}`, BUNDLE_CSP[name]);

/**
 * A fake project root whose dist/ holds a clean build: Direct-only bundles
 * (demo.html the offline demo), a provisioned.html carrying every managed marker,
 * and a clean provisioned-demo.html, each with its policy. Every app bundle
 * holds the manual; neither demo does.
 * `overrides` replaces a file's content, or omits it with `null`; a file named
 * in `raw` is written as given, with no policy added.
 */
const roots: string[] = [];
function fakeBuild(overrides: Record<string, string | null> = {}, raw: string[] = []): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundles-'));
    roots.push(root);
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist);
    const files: Record<string, string | null> = {
        ...Object.fromEntries(DIRECT_BUNDLES.map((f: string) => [f, `<html>${VENDOR}<div id="conn-host"></div>${MANUAL}</html>`])),
        [DEMO_BUNDLE]: DEMO_CLEAN,
        [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')} ${VENDOR}${MANUAL}</html>`,
        [PROVISIONED_DEMO_BUNDLE]: PROVISIONED_DEMO_CLEAN,
        [ADMIN_BUNDLE]: `<html><div id="admin-login"></div>${MANUAL}</html>`,
        ...overrides,
    };
    for (const [name, content] of Object.entries(files)) {
        if (content !== null) fs.writeFileSync(path.join(dist, name), raw.includes(name) ? content : built(name, content));
    }
    return root;
}
afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('check-bundles — checkBundles', () => {
    it('passes a clean build: Direct bundles without markers, provisioned.html with the Provisioned ones, the demo with both', () => {
        expect(checkBundles(path.join(fakeBuild(), 'dist'))).toEqual([]);
    });

    it('fails a Direct bundle that carries a managed marker, naming the file and the marker', () => {
        const root = fakeBuild({ 'min.html': `<html>${VENDOR}${MANUAL} fetch("/managed/logout")</html>` });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^min\.html: contains the managed marker "\/managed\/logout"/);
        expect(problems[0]).toContain('module.ts');
    });

    // The broker-facing calls are managed-only too: a Direct bundle that could
    // dial or reach the SEMP relay has imported the managed entry.
    it.each(['/managed/dial', '/managed/relay/'])('fails a Direct bundle that carries %s', (marker) => {
        const problems = checkBundles(path.join(fakeBuild({ 'index.html': `<html>${VENDOR}${MANUAL} fetch("${marker}b1")</html>` }), 'dist'));
        expect(problems).toEqual([expect.stringContaining(`index.html: contains the managed marker "${marker}"`)]);
    });

    it('fails when a Release bundle is missing, so an incomplete build never passes', () => {
        const problems = checkBundles(path.join(fakeBuild({ 'min.html': null }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(/^min\.html: missing/)]);
    });

    it('fails when provisioned.html is missing', () => {
        const problems = checkBundles(path.join(fakeBuild({ [PROVISIONED_BUNDLE]: null }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(/^provisioned\.html: missing.*--variant=managed/)]);
    });

    it('fails when provisioned.html lacks a marker: the override did not apply, or the marker went stale', () => {
        const root = fakeBuild({ [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.slice(1).join(' ')} ${VENDOR}${MANUAL}</html>` });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toEqual([expect.stringContaining(`lacks the managed marker "${MANAGED_MARKERS[0]}"`)]);
    });

    // Either marker in a production bundle means demo code reached it.
    it.each(DEMO_MARKERS)('fails a production Direct bundle that carries the demo marker %s', (marker) => {
        const problems = checkBundles(path.join(fakeBuild({ 'index.html': `<html>${VENDOR}${MANUAL} ${marker}</html>` }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(new RegExp(`^index\\.html: contains the demo marker "${marker}"\\. Only `))]);
    });

    it('fails provisioned.html when it carries the fake gateway', () => {
        const root = fakeBuild({ [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')} ${VENDOR}${MANUAL} ${DEMO_MARKERS[0]}</html>` });
        expect(checkBundles(path.join(root, 'dist'))).toEqual([
            expect.stringContaining(`provisioned.html: contains the demo marker "${DEMO_MARKERS[0]}"`),
        ]);
    });
});

// demo.html is the other demo-mode build: the one most likely to pull in the
// fake gateway by a wrong redirect, and, like the Provisioned demo, it must not
// reach a network.
describe('check-bundles -- the Direct demo', () => {
    const demoProblems = (text: string) => checkBundles(path.join(fakeBuild({ [DEMO_BUNDLE]: text }), 'dist'));

    it('fails when demo.html lacks the network refusal: its boot passes requests on again', () => {
        expect(demoProblems(DEMO_CLEAN.replace(NETWORK_MARKER, ''))).toEqual([
            expect.stringMatching(new RegExp(`^demo\\.html: lacks the demo marker "${NETWORK_MARKER}".*refuses the network`)),
        ]);
    });

    it('fails demo.html when it carries the fake gateway', () => {
        expect(demoProblems(`${DEMO_CLEAN}${GATEWAY_MARKER}`)).toEqual([
            expect.stringMatching(new RegExp(`^demo\\.html: contains the demo marker "${GATEWAY_MARKER}".*demoRedirects`)),
        ]);
    });

    it.each(DEMO_FORBIDDEN)('fails demo.html when it holds %s', (call) => {
        expect(demoProblems(`${DEMO_CLEAN}<script>${call}x)</script>`)).toEqual([
            expect.stringContaining(`demo.html: contains "${call}". A demo must not reach a network`),
        ]);
    });

    it('fails demo.html with a form that submits somewhere, or a URL to a real host', () => {
        expect(demoProblems(`${DEMO_CLEAN}<form action="/x">"https://broker.example.com/SEMP"`)).toEqual([
            expect.stringContaining('demo.html: contains a <form> with an action'),
            expect.stringContaining('demo.html: names the host "broker.example.com" in a URL'),
        ]);
    });
});

describe('check-bundles -- the Provisioned demo', () => {
    const provisionedDemoProblems = (text: string | null) => checkBundles(path.join(fakeBuild({ [PROVISIONED_DEMO_BUNDLE]: text }), 'dist'));

    it('fails when provisioned-demo.html is missing', () => {
        expect(provisionedDemoProblems(null)).toEqual([expect.stringMatching(/^provisioned-demo\.html: missing.*--variant=managed-demo/)]);
    });

    it('fails when the demo lacks a managed marker: the connections entry override did not apply', () => {
        expect(provisionedDemoProblems(PROVISIONED_DEMO_CLEAN.replace(MANAGED_MARKERS[0], ''))).toEqual([
            expect.stringMatching(new RegExp(`lacks the managed marker "${MANAGED_MARKERS[0]}".*managed-demo variant`)),
        ]);
    });

    it.each(DEMO_MARKERS)('fails when the demo lacks the demo marker %s: built without the managed boot', (marker) => {
        expect(provisionedDemoProblems(PROVISIONED_DEMO_CLEAN.replace(marker, ''))).toEqual([
            expect.stringMatching(new RegExp(`lacks the demo marker "${marker}".*--mode demo`)),
        ]);
    });

    it.each(DEMO_FORBIDDEN)('fails a demo that holds %s', (call) => {
        expect(provisionedDemoProblems(`${PROVISIONED_DEMO_CLEAN}<script>${call}x)</script>`)).toEqual([
            expect.stringContaining(`provisioned-demo.html: contains "${call}". A demo must not reach a network`),
        ]);
    });

    it('fails a demo with a form that submits somewhere', () => {
        expect(provisionedDemoProblems(`${PROVISIONED_DEMO_CLEAN}<FORM method="post" action="/login">`)).toEqual([
            expect.stringContaining('contains a <form> with an action'),
        ]);
    });

    it('fails a demo that names a real host, once per host', () => {
        const text = `${PROVISIONED_DEMO_CLEAN}"wss://broker.example.com:443" "https://broker.example.com/SEMP"`;
        expect(provisionedDemoProblems(text)).toEqual([expect.stringContaining('names the host "broker.example.com" in a URL')]);
    });
});

// The SDK and JSZip loaders and the library banner are the shell's `@vendor` blocks:
// in every bundle whose modules may use the SDK, and in none of the admin one.
describe('check-bundles -- the vendor loaders', () => {
    const problemsFor = (overrides: Record<string, string | null>) => checkBundles(path.join(fakeBuild(overrides), 'dist'));

    it('fails a Direct bundle that lost a loader marker, naming the file and the marker', () => {
        expect(problemsFor({ 'min.html': `<html>js/solclient.js missing-lib-banner${MANUAL}</html>` })).toEqual([
            expect.stringMatching(/^min\.html: lacks the vendor marker "jszip\.min\.js"\. The shell's @vendor blocks/),
        ]);
    });

    it.each([
        { name: PROVISIONED_BUNDLE, text: `<html>${MANAGED_MARKERS.join(' ')}${MANUAL}</html>` },
        { name: PROVISIONED_DEMO_BUNDLE, text: PROVISIONED_DEMO_CLEAN.replace(VENDOR, '') },
    ])('fails $name without the vendor blocks, once per marker', ({ name, text }) => {
        const problems = problemsFor({ [name]: text });
        expect(problems).toHaveLength(VENDOR_MARKERS.length);
        VENDOR_MARKERS.forEach((marker: string, i: number) => {
            expect(problems[i]).toContain(`${name}: lacks the vendor marker "${marker}"`);
        });
    });

    it('fails when solAdmin.html is missing', () => {
        expect(problemsFor({ [ADMIN_BUNDLE]: null })).toEqual([expect.stringMatching(/^solAdmin\.html: missing.*--variant=admin/)]);
    });

    it.each(VENDOR_MARKERS)('fails solAdmin.html when it carries %s: the admin variant lost its flag', (marker: string) => {
        expect(problemsFor({ [ADMIN_BUNDLE]: `<html>${marker}${MANUAL}</html>` })).toEqual([
            expect.stringMatching(new RegExp(`^solAdmin\\.html: contains the vendor marker "${marker}".*NEEDS_VENDOR_SCRIPTS = false`)),
        ]);
    });
});

// The manual is the About page's Help tab: in every app bundle, and in neither
// demo, which ship the About card alone.
describe('check-bundles -- the manual', () => {
    const problemsFor = (name: string, text: string) => checkBundles(path.join(fakeBuild({ [name]: text }), 'dist'));

    it('expects the manual in every bundle that is not a demo and holds a module with a chapter', () => {
        expect([...MANUAL_BUNDLES].sort()).toEqual(['index.html', 'min.html', 'no-payload.html', 'no-queue-copy.html', 'provisioned.html', 'solAdmin.html']);
    });

    it('fails an app bundle that lost the manual, naming the file and the template to check', () => {
        expect(problemsFor('no-payload.html', `<html>${VENDOR}</html>`)).toEqual([
            expect.stringMatching(/^no-payload\.html: lacks the manual marker "<article class=\"manual-chapter\">"\..*src\/modules\/about\/index\.html/),
        ]);
    });

    it.each([
        { name: DEMO_BUNDLE, text: `${DEMO_CLEAN}${MANUAL}` },
        { name: PROVISIONED_DEMO_BUNDLE, text: `${PROVISIONED_DEMO_CLEAN}${MANUAL}` },
    ])('fails $name when it carries the manual: a demo ships the About page alone', ({ name, text }) => {
        expect(problemsFor(name, text)).toEqual([
            expect.stringContaining(`${name}: contains the manual. A demo ships the About page without the Help tab`),
        ]);
    });
});

// Each bundle's own policy is built and checked by scripts/csp.mjs
// (tests/build/csp.test.ts); here, that the check runs on every bundle with the
// kind its build gives it.
describe('check-bundles -- the Content-Security-Policy', () => {
    const write = (root: string, name: string, content: string) => fs.writeFileSync(path.join(root, 'dist', name), content);

    it('names a policy for every bundle the build emits, and only those', () => {
        expect(Object.keys(BUNDLE_CSP).sort()).toEqual([...RELEASE_BUNDLES, PROVISIONED_BUNDLE, ADMIN_BUNDLE].sort());
    });

    it.each(Object.keys(BUNDLE_CSP))('fails %s without a policy, pointing at the build step', (name: string) => {
        const problems = checkBundles(path.join(fakeBuild({}, [name]), 'dist'));
        expect(problems).toEqual([expect.stringMatching(new RegExp(`^${name.replace('.', '\\.')}: carries no Content-Security-Policy tag.*content-security-policy plugin`))]);
    });

    it('fails provisioned.html built with the Direct policy: it would connect beyond its gateway', () => {
        const root = fakeBuild();
        write(root, PROVISIONED_BUNDLE, applyCsp(`<meta charset="UTF-8"><html>${MANAGED_MARKERS.join(' ')} ${VENDOR}${MANUAL}</html>`, { kind: 'direct', vendor: true }));
        expect(checkBundles(path.join(root, 'dist'))).toEqual([
            `provisioned.html: the policy's connect-src is "http: https: ws: wss:", expected "'self'".`,
            `provisioned.html: the policy's frame-src is "https:", expected "(none)".`,
        ]);
    });
});

describe('check-bundles -- strayHosts', () => {
    it('keeps only literal hosts outside the allow-list, each once', () => {
        expect(strayHosts('http://www.w3.org/2000/svg https://east-prod.demo.invalid ws://10.0.0.1:8008 ws://10.0.0.1 https://${h} https://'))
            .toEqual(['10.0.0.1']);
    });

    it('does not take a look-alike for the namespace host', () => {
        expect(strayHosts('http://www.w3.org.example.com/x')).toEqual(['www.w3.org.example.com']);
    });

    it("allows the project's home, which the About page links to, and no other GitHub host", () => {
        expect(strayHosts('https://github.com/SolaceLabs/solace-msg-utility https://raw.github.com/x https://github.com.example.net/x'))
            .toEqual(['raw.github.com', 'github.com.example.net']);
    });
});

describe('check-bundles -- the demo markers', () => {
    it('are the fake gateway\'s header value and both demos\' refusal, as their sources define them', () => {
        expect([GATEWAY_MARKER, NETWORK_MARKER]).toEqual([DEMO_GATEWAY_MARKER, NETWORK_DISABLED]);
        expect(DEMO_MARKERS).toEqual([GATEWAY_MARKER, NETWORK_MARKER]);
    });
});

describe('check-bundles — findMarkers', () => {
    it('returns only the markers present', () => {
        expect(findMarkers('x conn-panel-managed y', ['conn-panel-managed', '/managed/logout'])).toEqual(['conn-panel-managed']);
        expect(findMarkers('plain direct bundle')).toEqual([]);
    });
});

// A verdict of 0 goes with the success line and no error output; a verdict of
// 1 goes with the FAILED header and no success line.
function verdictAgreesWithReport(verdict: number, log: { mock: { calls: unknown[][] } }, err: { mock: { calls: unknown[][] } }): boolean {
    const passed = log.mock.calls.some(([m]) => String(m).startsWith('Bundle check passed'));
    const failed = err.mock.calls.some(([m]) => /^Bundle check FAILED: \d+ problem\(s\)\.$/.test(String(m)));
    return verdict === 0 ? passed && !failed : verdict === 1 && failed && !passed;
}

describe('check-bundles — main', () => {
    it('returns 0 and says so for a clean build', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(main(fakeBuild())).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Bundle check passed \(5 Direct bundles carry no Provisioned UI; provisioned\.html does; provisioned-demo\.html runs it.*both demos have no network/));
    });

    it('returns 1 and lists every problem', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(main(fakeBuild({ 'index.html': `btn-managed-login ${VENDOR}${MANUAL}`, [PROVISIONED_BUNDLE]: null }))).toBe(1);
        expect(err).toHaveBeenCalledWith('Bundle check FAILED: 2 problem(s).');
        expect(err).toHaveBeenCalledWith(expect.stringContaining('index.html: contains the managed marker'));
    });

    it("checks the repo's own dist/ when given no root, as npm run check:bundles does", () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        // The verdict must agree with what main() itself reports, not with a
        // second run of the checker over the same directory.
        expect(verdictAgreesWithReport(main(), log, err)).toBe(true);
    });
});

// The file is both the gate's CLI and a module the tests import: it runs only
// when node started it, and then the exit code is the verdict.
describe('check-bundles -- run as a script', () => {
    const argv = process.argv;
    const exitCode = process.exitCode;
    afterEach(() => {
        process.argv = argv;
        process.exitCode = exitCode;
    });
    async function load(script?: string) {
        process.argv = script === undefined ? [process.execPath] : [process.execPath, script];
        vi.resetModules();
        return import('../../scripts/check-bundles.mjs');
    }

    it("checks the repo's dist/ and sets the exit code when node runs it, by any path", async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        await load(path.join('.', 'scripts', 'check-bundles.mjs'));
        expect(typeof process.exitCode).toBe('number');
        expect(verdictAgreesWithReport(process.exitCode as number, log, err)).toBe(true);
    });

    it('does nothing when imported, or when node runs another file', async () => {
        const log = vi.spyOn(console, 'log');
        const err = vi.spyOn(console, 'error');
        await load();
        await load(path.join('node_modules', 'vitest', 'vitest.mjs'));
        expect(process.exitCode).toBe(exitCode);
        expect(log).not.toHaveBeenCalled();
        expect(err).not.toHaveBeenCalled();
    });
});

describe('check-bundles -- the image', () => {
    // The image builds its own bundles (docker/Dockerfile's pwa-builder stage),
    // so the check must run there too, on the files the image copies.
    it('checks the bundles it builds before it copies them into the image', () => {
        const dockerfile = fs.readFileSync(path.join(repoRoot(), 'docker/Dockerfile'), 'utf-8');
        const build = dockerfile.indexOf('RUN APP_VERSION="$APP_VERSION" npm run build\n');
        const check = dockerfile.indexOf('RUN npm run check:bundles\n');
        const copy = dockerfile.indexOf('cp /pwa/dist/index.html /pwa/dist/provisioned.html');
        expect(build).toBeGreaterThan(-1);
        expect(check).toBeGreaterThan(build);
        expect(copy).toBeGreaterThan(check);
    });
});

describe('check-bundles — the Release upload list', () => {
    it('matches the RELEASE_BUNDLES list in tag.yml, so the check guards what is actually published', () => {
        // tag.yml's workflow-level env holds its own copy of the list; if the
        // two drift, a bundle could ship unchecked or a checked one never ship.
        const yml = fs.readFileSync(path.join(repoRoot(), '.github/workflows/tag.yml'), 'utf-8');
        const m = yml.match(/RELEASE_BUNDLES:\s*"([^"]+)"/);
        expect(m, 'tag.yml must set RELEASE_BUNDLES in its workflow-level env').not.toBeNull();
        expect(m![1].trim().split(/\s+/)).toEqual(RELEASE_BUNDLES);
    });

    it('never lists the image-only bundles', () => {
        expect(RELEASE_BUNDLES).not.toContain(PROVISIONED_BUNDLE);
        expect(RELEASE_BUNDLES).not.toContain('solAdmin.html');
    });

    // The gateway ships only inside the images. On a public repo a workflow
    // artifact is a download too, so uploading dist/ would ship the binaries
    // (and the image-only bundles) after all.
    it('lets no gateway binary leave the pipeline: the bundles artifact holds only the Release bundles', () => {
        const yml = fs.readFileSync(path.join(repoRoot(), '.github/workflows/tag.yml'), 'utf-8');
        expect(yml).not.toMatch(/dist\/go-web-proxy/);
        const uploads = [...yml.matchAll(/uses: actions\/upload-artifact@.*\n(?:[ \t]+\S.*\n)*?[ \t]+path: *(.*)/g)].map((m) => m[1].trim());
        expect(uploads).toContain('release-bundles/');
        expect(uploads.filter((p) => /^\.?\/?dist\b/.test(p))).toEqual([]);
        const stage = yml.slice(yml.indexOf('- name: Stage the Release bundles'), yml.indexOf('path: release-bundles/'));
        expect(stage).toContain('for f in $RELEASE_BUNDLES; do');
        expect(stage).toContain('cp "dist/$f" release-bundles/');
    });
});
