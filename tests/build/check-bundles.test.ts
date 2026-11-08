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
    MANAGED_MARKERS,
    DEMO_MARKERS,
    GATEWAY_MARKER,
    NETWORK_MARKER,
    DEMO_FORBIDDEN,
    findMarkers,
    strayHosts,
    checkBundles,
    main,
    repoRoot,
} from '../../scripts/check-bundles.mjs';
import { DEMO_GATEWAY_MARKER } from '../../src/mock-broker/gateway';
import { NETWORK_DISABLED } from '../../src/mock-broker/network';

/**
 * What a clean provisioned-demo.html holds: both marker sets, a form that submits
 * in-process, and only the inert URL literals the real build carries (the SVG
 * namespace, the mock server's `.invalid` route base, a URL built from a
 * variable).
 */
const PROVISIONED_DEMO_CLEAN = `<html>${[...MANAGED_MARKERS, ...DEMO_MARKERS].join(' ')}` +
    '<form class="login-form"></form><svg xmlns="http://www.w3.org/2000/svg"></svg>' +
    '<script>const b="https://mock.invalid/";const u=`https://${a.host}:${a.port}`;</script></html>';

/** What a clean demo.html holds: the network refusal, the Direct form and an inert namespace URL. */
const DEMO_CLEAN = `<html>${NETWORK_MARKER}<div id="conn-host"></div><svg xmlns="http://www.w3.org/2000/svg"></svg></html>`;

/**
 * A fake project root whose dist/ holds a clean build: Direct-only bundles
 * (demo.html the offline demo), a provisioned.html carrying every managed marker,
 * and a clean provisioned-demo.html.
 * `overrides` replaces a file's content, or omits it with `null`.
 */
const roots: string[] = [];
function fakeBuild(overrides: Record<string, string | null> = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundles-'));
    roots.push(root);
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist);
    const files: Record<string, string | null> = {
        ...Object.fromEntries(DIRECT_BUNDLES.map((f: string) => [f, '<html><div id="conn-host"></div></html>'])),
        [DEMO_BUNDLE]: DEMO_CLEAN,
        [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')}</html>`,
        [PROVISIONED_DEMO_BUNDLE]: PROVISIONED_DEMO_CLEAN,
        ...overrides,
    };
    for (const [name, content] of Object.entries(files)) {
        if (content !== null) fs.writeFileSync(path.join(dist, name), content);
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
        const root = fakeBuild({ 'min.html': '<html>fetch("/managed/logout")</html>' });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^min\.html: contains the managed marker "\/managed\/logout"/);
        expect(problems[0]).toContain('module.ts');
    });

    // The broker-facing calls are managed-only too: a Direct bundle that could
    // dial or reach the SEMP relay has imported the managed entry.
    it.each(['/managed/dial', '/managed/relay/'])('fails a Direct bundle that carries %s', (marker) => {
        const problems = checkBundles(path.join(fakeBuild({ 'index.html': `<html>fetch("${marker}b1")</html>` }), 'dist'));
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
        const root = fakeBuild({ [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.slice(1).join(' ')}</html>` });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toEqual([expect.stringContaining(`lacks the managed marker "${MANAGED_MARKERS[0]}"`)]);
    });

    // Either marker in a production bundle means demo code reached it.
    it.each(DEMO_MARKERS)('fails a production Direct bundle that carries the demo marker %s', (marker) => {
        const problems = checkBundles(path.join(fakeBuild({ 'index.html': `<html>${marker}</html>` }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(new RegExp(`^index\\.html: contains the demo marker "${marker}"\\. Only `))]);
    });

    it('fails provisioned.html when it carries the fake gateway', () => {
        const root = fakeBuild({ [PROVISIONED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')} ${DEMO_MARKERS[0]}</html>` });
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

describe('check-bundles -- strayHosts', () => {
    it('keeps only literal hosts outside the allow-list, each once', () => {
        expect(strayHosts('http://www.w3.org/2000/svg https://east-prod.demo.invalid ws://10.0.0.1:8008 ws://10.0.0.1 https://${h} https://'))
            .toEqual(['10.0.0.1']);
    });

    it('does not take a look-alike for the namespace host', () => {
        expect(strayHosts('http://www.w3.org.example.com/x')).toEqual(['www.w3.org.example.com']);
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

describe('check-bundles — main', () => {
    it('returns 0 and says so for a clean build', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(main(fakeBuild())).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Bundle check passed \(5 Direct bundles carry no Provisioned UI; provisioned\.html does; provisioned-demo\.html runs it.*both demos have no network/));
    });

    it('returns 1 and lists every problem', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(main(fakeBuild({ 'index.html': 'btn-managed-login', [PROVISIONED_BUNDLE]: null }))).toBe(1);
        expect(err).toHaveBeenCalledWith('Bundle check FAILED: 2 problem(s).');
        expect(err).toHaveBeenCalledWith(expect.stringContaining('index.html: contains the managed marker'));
    });

    it('resolves the repo root from its own location', () => {
        expect(fs.existsSync(path.join(repoRoot(), 'scripts', 'check-bundles.mjs'))).toBe(true);
    });
});

describe('check-bundles — the Release upload list', () => {
    it('matches the RELEASE_BUNDLES list in tag.yml, so the check guards what is actually published', () => {
        // tag.yml's release step uploads its own copy of the list; if the two
        // drift, a bundle could ship unchecked or a checked one never ship.
        const yml = fs.readFileSync(path.join(repoRoot(), '.github/workflows/tag.yml'), 'utf-8');
        const m = yml.match(/RELEASE_BUNDLES:\s*"([^"]+)"/);
        expect(m, 'tag.yml must set RELEASE_BUNDLES in its release step').not.toBeNull();
        expect(m![1].trim().split(/\s+/)).toEqual(RELEASE_BUNDLES);
    });

    it('never lists the image-only bundles', () => {
        expect(RELEASE_BUNDLES).not.toContain(PROVISIONED_BUNDLE);
        expect(RELEASE_BUNDLES).not.toContain('solAdmin.html');
    });

    it('is the Direct bundles plus the Provisioned demo', () => {
        expect(RELEASE_BUNDLES).toEqual([...DIRECT_BUNDLES, PROVISIONED_DEMO_BUNDLE]);
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
