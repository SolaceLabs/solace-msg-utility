import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RELEASE_BUNDLES,
    DIRECT_BUNDLES,
    DEMO_BUNDLE,
    MANAGED_BUNDLE,
    MANAGED_MARKERS,
    DEMO_MARKERS,
    DEMO_FORBIDDEN,
    findMarkers,
    strayHosts,
    checkBundles,
    main,
    repoRoot,
} from '../../scripts/check-bundles.mjs';
import { DEMO_GATEWAY_MARKER } from '../../src/mock-broker/gateway';
import { NETWORK_DISABLED } from '../../src/mock-broker/boot.managed';

/**
 * What a clean managed-demo.html holds: both marker sets, a form that submits
 * in-process, and only the inert URL literals the real build carries (the SVG
 * namespace, the mock server's `.invalid` route base, a URL built from a
 * variable).
 */
const DEMO_CLEAN = `<html>${[...MANAGED_MARKERS, ...DEMO_MARKERS].join(' ')}` +
    '<form class="login-form"></form><svg xmlns="http://www.w3.org/2000/svg"></svg>' +
    '<script>const b="https://mock.invalid/";const u=`https://${a.host}:${a.port}`;</script></html>';

/**
 * A fake project root whose dist/ holds a clean build: Direct-only bundles, a
 * managed.html carrying every managed marker, and a clean managed-demo.html.
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
        [MANAGED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')}</html>`,
        [DEMO_BUNDLE]: DEMO_CLEAN,
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
    it('passes a clean build: Direct bundles without markers, managed.html with the managed ones, the demo with both', () => {
        expect(checkBundles(path.join(fakeBuild(), 'dist'))).toEqual([]);
    });

    it('fails a Direct bundle that carries a managed marker, naming the file and the marker', () => {
        const root = fakeBuild({ 'mock.html': '<html>fetch("/managed/logout")</html>' });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^mock\.html: contains the managed marker "\/managed\/logout"/);
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

    it('fails when managed.html is missing', () => {
        const problems = checkBundles(path.join(fakeBuild({ [MANAGED_BUNDLE]: null }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(/^managed\.html: missing.*--variant=managed/)]);
    });

    it('fails when managed.html lacks a marker: the override did not apply, or the marker went stale', () => {
        const root = fakeBuild({ [MANAGED_BUNDLE]: `<html>${MANAGED_MARKERS.slice(1).join(' ')}</html>` });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toEqual([expect.stringContaining(`lacks the managed marker "${MANAGED_MARKERS[0]}"`)]);
    });

    // mock.html is the other mock-mode build: the one most likely to pull in
    // the fake gateway by a wrong redirect.
    it.each(DEMO_MARKERS)('fails a Direct bundle that carries the demo marker %s', (marker) => {
        const problems = checkBundles(path.join(fakeBuild({ 'mock.html': `<html>${marker}</html>` }), 'dist'));
        expect(problems).toEqual([expect.stringMatching(new RegExp(`^mock\\.html: contains the demo marker "${marker}".*mockRedirects`))]);
    });

    it('fails managed.html when it carries the fake gateway', () => {
        const root = fakeBuild({ [MANAGED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')} ${DEMO_MARKERS[0]}</html>` });
        expect(checkBundles(path.join(root, 'dist'))).toEqual([
            expect.stringContaining(`managed.html: contains the demo marker "${DEMO_MARKERS[0]}"`),
        ]);
    });
});

describe('check-bundles -- the managed demo', () => {
    const demoProblems = (text: string | null) => checkBundles(path.join(fakeBuild({ [DEMO_BUNDLE]: text }), 'dist'));

    it('fails when managed-demo.html is missing', () => {
        expect(demoProblems(null)).toEqual([expect.stringMatching(/^managed-demo\.html: missing.*--variant=managed-demo/)]);
    });

    it('fails when the demo lacks a managed marker: the connections entry override did not apply', () => {
        expect(demoProblems(DEMO_CLEAN.replace(MANAGED_MARKERS[0], ''))).toEqual([
            expect.stringMatching(new RegExp(`lacks the managed marker "${MANAGED_MARKERS[0]}".*managed-demo variant`)),
        ]);
    });

    it.each(DEMO_MARKERS)('fails when the demo lacks the demo marker %s: built without the managed boot', (marker) => {
        expect(demoProblems(DEMO_CLEAN.replace(marker, ''))).toEqual([
            expect.stringMatching(new RegExp(`lacks the demo marker "${marker}".*--mode mock`)),
        ]);
    });

    it.each(DEMO_FORBIDDEN)('fails a demo that holds %s', (call) => {
        expect(demoProblems(`${DEMO_CLEAN}<script>${call}x)</script>`)).toEqual([
            expect.stringContaining(`managed-demo.html: contains "${call}". The managed demo must not reach a network`),
        ]);
    });

    it('fails a demo with a form that submits somewhere', () => {
        expect(demoProblems(`${DEMO_CLEAN}<FORM method="post" action="/login">`)).toEqual([
            expect.stringContaining('contains a <form> with an action'),
        ]);
    });

    it('fails a demo that names a real host, once per host', () => {
        const text = `${DEMO_CLEAN}"wss://broker.example.com:443" "https://broker.example.com/SEMP"`;
        expect(demoProblems(text)).toEqual([expect.stringContaining('names the host "broker.example.com" in a URL')]);
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
    it('are the fake gateway\'s header value and the demo\'s refusal, as their sources define them', () => {
        expect(DEMO_MARKERS).toEqual([DEMO_GATEWAY_MARKER, NETWORK_DISABLED]);
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
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Bundle check passed \(5 Direct bundles .*managed-demo\.html runs it/));
    });

    it('returns 1 and lists every problem', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(main(fakeBuild({ 'index.html': 'btn-managed-login', [MANAGED_BUNDLE]: null }))).toBe(1);
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
        expect(RELEASE_BUNDLES).not.toContain(MANAGED_BUNDLE);
        expect(RELEASE_BUNDLES).not.toContain('solAdmin.html');
    });

    it('is the Direct bundles plus the managed demo', () => {
        expect(RELEASE_BUNDLES).toEqual([...DIRECT_BUNDLES, DEMO_BUNDLE]);
    });

    it('uploads no gateway binary: the gateway ships only inside the images', () => {
        const yml = fs.readFileSync(path.join(repoRoot(), '.github/workflows/tag.yml'), 'utf-8');
        expect(yml).not.toMatch(/dist\/go-web-proxy/);
    });
});
