// @vitest-environment node
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

/** One job of tag.yml, from its key to the next job's (or the end of the file). */
function job(name: string): string {
    const at = tag.indexOf(`\n  ${name}:\n`);
    if (at < 0) throw new Error(`tag.yml has no job "${name}"`);
    const next = tag.slice(at + 1).search(/\n {2}[a-z-]+:\n/);
    return next < 0 ? tag.slice(at) : tag.slice(at, at + 1 + next);
}

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

    it('deploys Pages last: for the highest release only, once its Release exists', () => {
        const pages = job('pages');
        expect(pages).toContain('needs: [plan, binaries, release]');
        expect(pages).toContain("&& needs.plan.outputs.latest == 'true'");
        expect(pages).toContain("&& needs.release.result == 'success'");
        // always() would also deploy a run cancelled after the release.
        expect(pages).toContain('!cancelled()');
        expect(pages).not.toContain('always()');
    });

    it('attaches the compose files the operator docs send a reader to, when an image shipped', () => {
        const files = tag.match(/^ {2}RELEASE_COMPOSE: "(.*)"$/m)![1].split(' ');
        expect(files).toEqual(['compose.gateway.yaml', 'compose.provisioned.yaml']);
        for (const f of files) expect(fs.existsSync(path.join(REPO_ROOT, 'docker', f))).toBe(true);
        const release = job('release');
        expect(release).toContain("IMAGE_SHIPPED: ${{ needs.publish.result == 'success' }}");
        expect(release).toContain('for f in $RELEASE_COMPOSE; do');
    });

    it("moves no tag until every platform of the image serves the Release's index.html", () => {
        const publish = job('publish');
        const check = publish.indexOf("- name: Check the image serves the Release's index.html");
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(publish.indexOf('- name: Tag the scanned digests'));
        expect(publish).toContain('pattern: bundles-*');
        expect(publish).toContain('want="$(sha256sum < bundles/index.html | cut -d\' \' -f1)"');
        expect(publish).toContain('docker create --platform "$platform" "$image@$pdigest"');
        // The path the image serves the Direct bundle from, as docker/Dockerfile stages it.
        expect(publish).toContain('docker cp "$cid:/SolaceMsgUtility/index.html" image-index.html');
        const dockerfile = read('docker/Dockerfile');
        expect(dockerfile).toMatch(/^COPY [^\n]*--from=pwa-builder +\/staging\/app\/ \/SolaceMsgUtility\/$/m);
        expect(dockerfile).toMatch(/cp \/pwa\/dist\/index\.html [^\n]*\/staging\/app\/$/m);
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

    it('fail in CI without gcc, where the race detector cannot run; locally the suite runs without it', () => {
        const sh = read('scripts/dev.sh');
        const goTest = sh.slice(sh.indexOf('go_test() {'), sh.indexOf('\n}\n', sh.indexOf('go_test() {')));
        expect(goTest).toMatch(/elif \[ -n "\$\{CI:-\}" \]; then\n {4}note "\$task" "error: go test: no gcc on PATH[^"]*"\n {4}return 1\n {2}else\n {4}note "\$task" "go test: -race skipped, no gcc on PATH"\n/);
        const ps1 = read('scripts/dev.ps1');
        const invoke = ps1.slice(ps1.indexOf('function Invoke-GoTest'), ps1.indexOf('\n}\n', ps1.indexOf('function Invoke-GoTest')));
        expect(invoke).toMatch(/ {2}if \(\$env:CI\) \{\n {4}Write-Note \$Task 'error: go test: no gcc on PATH[^']*'\n {4}return 1\n {2}\}\n {2}Write-Note \$Task 'go test: -race skipped, no gcc on PATH'\n/);
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

    // A bump of one place alone would scan the same image with different rules
    // locally and in the tag pipeline; Dependabot moves none of the three.
    it('pins one trivy: the same image in both dev scripts, and its version in every trivy-action step', () => {
        const sh = read('scripts/dev.sh').match(/^TRIVY_IMAGE="aquasec\/trivy:(\d+\.\d+\.\d+)@(sha256:[0-9a-f]{64})"$/m)?.slice(1);
        const ps = read('scripts/dev.ps1').match(/^\$TrivyImage = 'aquasec\/trivy:(\d+\.\d+\.\d+)@(sha256:[0-9a-f]{64})'$/m)?.slice(1);
        expect(sh).toHaveLength(2);
        expect(ps).toEqual(sh);
        const steps = tag.match(/uses: aquasecurity\/trivy-action@/g) ?? [];
        const versions = [...tag.matchAll(/^ +version: v(\S+)$/gm)].map(m => m[1]);
        expect(steps.length).toBeGreaterThan(0);
        expect(versions).toEqual(steps.map(() => sh![0]));
    });

    it('keeps the SCA workflow token read-only, its write and OIDC rights on the one job that needs them', () => {
        const sca = read('.github/workflows/sca-scan-and-guard.yml');
        expect(sca).toMatch(/^permissions:\n {2}contents: read\n\n/m);
        expect(sca).toMatch(/^ {2}sca_scan:\n(?: {4}#.*\n)* {4}permissions:\n(?: {6}[\w-]+: \w+\n)* {6}id-token: write\n/m);
    });
});
