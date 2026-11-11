import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';

/**
 * The workflows' release rules, read as text like the compose files (no YAML
 * parser in the toolchain): what a tag may publish, what the gates run, and
 * how every action is pinned. docs/git.md describes each.
 */
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const WORKFLOWS = fs.readdirSync(path.join(REPO_ROOT, '.github/workflows')).filter(f => f.endsWith('.yml'));
const tag = read('.github/workflows/tag.yml');

describe('workflows -- a tag', () => {
    it('must be vX.Y.Z: plan refuses any other tag before the shape is resolved', () => {
        const check = tag.indexOf(`grep -Eq '^v[0-9]+\\.[0-9]+\\.[0-9]+$'`);
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(tag.indexOf('- id: shape'));
        expect(tag).toContain('echo "::error::the tag must be vX.Y.Z (docs/git.md), got \'$GITHUB_REF_NAME\'"');
    });

    it('moves latest only for the highest release: the image tag and the Latest Release alike', () => {
        expect(tag).toContain('latest: ${{ steps.tag.outputs.latest }}');
        expect(tag).toContain('fetch-depth: 0 # every tag, to tell whether this one is the highest');
        // metadata-action adds its own latest to a semver tag unless told not to.
        expect(tag).toContain('flavor: |\n            latest=false\n');
        expect(tag.match(/type=raw,value=latest.*$/gm)).toEqual(["type=raw,value=latest,enable=${{ needs.plan.outputs.latest == 'true' }}"]);
        expect(tag).toContain('--latest="$LATEST"');
        expect(tag).toContain('LATEST: ${{ needs.plan.outputs.latest }}');
    });
});

describe('workflows -- the gates', () => {
    it('run all cov scan on both runners, so the coverage thresholds gate every release', () => {
        const ci = read('.github/workflows/ci.yml');
        expect(ci.match(/run: \.\/scripts\/dev\.(?:sh|ps1) .*$/gm)).toEqual([
            'run: ./scripts/dev.sh all cov scan',
            'run: ./scripts/dev.ps1 all cov scan',
        ]);
    });

    it("run on a PR that moves the Dockerfile, as Dependabot's base-image bumps do", () => {
        expect(read('.github/workflows/ci.yml')).toMatch(/^ {2}pull_request:\n {4}paths:\n(?: {6}- .*\n)*? {6}- "docker\/Dockerfile"\n/m);
        expect(read('.github/dependabot.yml')).toMatch(/^ {2}- package-ecosystem: docker\n {4}directory: \/docker\n/m);
    });
});

describe('workflows -- pins', () => {
    it.each(WORKFLOWS)('%s pins every action by commit SHA, the organisation SCA workflow aside', (file) => {
        const uses = [...read(`.github/workflows/${file}`).matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map(m => m[1]);
        const loose = uses.filter(u => !u.startsWith('./') && !/@[0-9a-f]{40}$/.test(u));
        // Tracked by branch by organisation decision (docs/git.md, "Keeping the workflow pins current").
        expect(loose.filter(u => u !== 'SolaceDev/solace-public-workflows/.github/workflows/sca-scan-and-guard.yaml@main')).toEqual([]);
    });

    it.each(WORKFLOWS)('%s runs on pinned runner images, never -latest', (file) => {
        expect(read(`.github/workflows/${file}`)).not.toMatch(/runs-on: .*-latest/);
    });

    it('keeps the SCA workflow token read-only, its write and OIDC rights on the one job that needs them', () => {
        const sca = read('.github/workflows/sca-scan-and-guard.yml');
        expect(sca).toMatch(/^permissions:\n {2}contents: read\n\n/m);
        expect(sca).toMatch(/^ {2}sca_scan:\n(?: {4}#.*\n)* {4}permissions:\n(?: {6}[\w-]+: \w+\n)* {6}id-token: write\n/m);
    });
});
