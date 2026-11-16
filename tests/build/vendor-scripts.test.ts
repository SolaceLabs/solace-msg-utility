// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';

/**
 * The images ship solclient.js and jszip.min.js from the npm packages
 * package.json pins, copied by docker/Dockerfile's pwa-builder stage, so no
 * deployment mounts them. Each pin must be one exact version the shell's own
 * check in src/index.html accepts, and the Dockerfile must copy files that
 * exist in the installed packages, licence notices included: a wrong path
 * fails only late, in the image build on the runner. The gateway binary's Go
 * code travels with its notices too: Go's own and one per direct requirement in
 * go-web-proxy/go.mod, copied beside the JavaScript ones.
 */
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
const pkg = JSON.parse(read('package.json'));
const shell = read('src/index.html');
const dockerfile = read('docker/Dockerfile');
const goMod = read('go-web-proxy/go.mod');

/** Each vendor package, the script the shell loads, and where the shell sets its floor. */
const VENDOR = [
    { name: 'solclientjs', script: 'lib-browser/solclient.js', floor: /Version Check \(>= [\d.]+\)\. solaceLibLoaded[\s\S]*?const MIN_VERSION = '([\d.]+)'/ },
    { name: 'jszip', script: 'dist/jszip.min.js', floor: /if \(window\.JSZip\) \{\s*const MIN_VERSION = '([\d.]+)'/ },
];

/** A licence or notice file at a package's root; licenses.xls is the SDK's spreadsheet copy of licenses.txt. */
const NOTICE = /^(?:licen[cs]es?|copyright|notice|copying)(?:\.(?:txt|md|markdown))?$/i;

const atLeast = (version: string, floor: string) => {
    const [a, b] = [version, floor].map((v) => v.split('.').map(Number));
    const i = a.findIndex((n, k) => n !== b[k]);
    return i < 0 || a[i] > b[i];
};

/** The modules go.mod requires directly: a require line (single or in a block) not marked indirect. */
const directModules = goMod
    .split('\n')
    .map((l) => l.match(/^(?:require\s+|\t)(\S+)\s+v\S+\s*(\/\/.*)?$/))
    .filter((m): m is RegExpMatchArray => m !== null && !/indirect/.test(m[2] ?? ''))
    .map((m) => m[1]);

const copied = [...dockerfile.matchAll(/node_modules\/[^\s\\]+/g)].map((m) => m[0]);

describe('vendor scripts in the images', () => {
    it.each(VENDOR)('pins $name to one exact version the shell accepts', ({ name, floor }) => {
        const pin: string = pkg.dependencies?.[name];
        expect(pin, `package.json dependencies.${name}`).toMatch(/^\d+\.\d+\.\d+$/);
        const m = shell.match(floor);
        expect(m, `src/index.html's MIN_VERSION check for ${name}`).not.toBeNull();
        expect(atLeast(pin, m![1]), `${name} ${pin} is below the shell's ${m![1]}`).toBe(true);
    });

    it.each(VENDOR)('copies the $name script and every licence file its package carries', ({ name, script }) => {
        const root = path.join(REPO_ROOT, 'node_modules', name);
        const notices = fs.readdirSync(root).filter((f) => NOTICE.test(f)).map((f) => `node_modules/${name}/${f}`);
        expect(notices.length).toBeGreaterThan(0);
        expect(copied.filter((p) => p.startsWith(`node_modules/${name}/`)).sort())
            .toEqual([`node_modules/${name}/${script}`, ...notices].sort());
    });

    it('copies only files that exist in the installed packages', () => {
        expect(copied.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)))).toEqual([]);
    });

    it('reads the direct requirements out of go.mod', () => {
        expect(directModules).toEqual(expect.arrayContaining(['gopkg.in/yaml.v3', 'rsc.io/qr']));
        expect(directModules).not.toContain('golang.org/x/sys');
    });

    it("copies Go's own licence and that of every direct Go requirement into licenses/", () => {
        expect(dockerfile, "Go's own LICENSE").toContain('"$(go env GOROOT)/LICENSE" /staging/licenses/go/');
        for (const mod of directModules) {
            expect(dockerfile, `the Dockerfile copies the LICENSE of ${mod}`)
                .toContain(`"$(go list -m -f '{{.Dir}}' ${mod})/LICENSE"`);
            expect(dockerfile, `the Dockerfile stages ${mod} under licenses/`)
                .toContain(`/staging/licenses/${mod.replace(/\//g, '-')}/`);
        }
        expect(dockerfile, 'the yaml.v3 NOTICE (Apache-2.0 asks for it)')
            .toContain(`"$(go list -m -f '{{.Dir}}' gopkg.in/yaml.v3)/NOTICE"`);
    });

    it('lands the Go notices beside the JavaScript ones in the final image', () => {
        expect(dockerfile).toMatch(
            /^COPY --chown=65532:65532 --from=gateway-builder \/staging\/licenses\/ \/SolaceMsgUtility\/licenses\/$/m);
    });

    it('compares versions part by part', () => {
        expect([atLeast('10.18.3', '10.18.3'), atLeast('10.18.10', '10.18.3'), atLeast('10.9.9', '10.18.3'), atLeast('3.10.2', '3.10.1')])
            .toEqual([true, true, false, true]);
    });
});
