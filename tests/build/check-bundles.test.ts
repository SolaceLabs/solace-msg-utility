import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RELEASE_BUNDLES,
    MANAGED_BUNDLE,
    MANAGED_MARKERS,
    findMarkers,
    checkBundles,
    main,
    repoRoot,
} from '../../scripts/check-bundles.mjs';

/**
 * A fake project root whose dist/ holds a clean build: Direct-only Release
 * bundles and a managed.html carrying every marker. `overrides` replaces a
 * file's content, or omits it with `null`.
 */
const roots: string[] = [];
function fakeBuild(overrides: Record<string, string | null> = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundles-'));
    roots.push(root);
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist);
    const files: Record<string, string | null> = {
        ...Object.fromEntries(RELEASE_BUNDLES.map((f: string) => [f, '<html><div id="conn-host"></div></html>'])),
        [MANAGED_BUNDLE]: `<html>${MANAGED_MARKERS.join(' ')}</html>`,
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
    it('passes a clean build: Release bundles without markers, managed.html with all of them', () => {
        expect(checkBundles(path.join(fakeBuild(), 'dist'))).toEqual([]);
    });

    it('fails a Release bundle that carries a managed marker, naming the file and the marker', () => {
        const root = fakeBuild({ 'mock.html': '<html>fetch("/managed/reload")</html>' });
        const problems = checkBundles(path.join(root, 'dist'));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^mock\.html: contains the managed marker "\/managed\/reload"/);
        expect(problems[0]).toContain('module.ts');
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
});

describe('check-bundles — findMarkers', () => {
    it('returns only the markers present', () => {
        expect(findMarkers('x conn-panel-managed y', ['conn-panel-managed', '/managed/reload'])).toEqual(['conn-panel-managed']);
        expect(findMarkers('plain direct bundle')).toEqual([]);
    });
});

describe('check-bundles — main', () => {
    it('returns 0 and says so for a clean build', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(main(fakeBuild())).toBe(0);
        expect(log).toHaveBeenCalledWith(expect.stringContaining('Bundle check passed'));
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
});
