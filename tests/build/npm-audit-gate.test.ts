import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classify } from '../../scripts/npm-audit-gate.mjs';

// The gate's npm calls, for the CLI cases at the end; classify never spawns.
const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
// The mock sits on both faces of the builtin: its named export, and the
// CommonJS object on `default`, which the module runner's interop reads a
// named import from when it is present. Everything else stays real.
vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process') & { default: typeof import('node:child_process') }>();
    return { ...actual, spawnSync, default: { ...actual.default, spawnSync } };
});

const BRACES = {
    source: 1101234,
    name: 'braces',
    title: 'braces vulnerable to stack-exhaustion denial of service through deeply nested patterns',
    url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
    severity: 'high',
    range: '<=3.0.3',
};

/** An `npm audit --json` v2 report: braces reached through micromatch. */
function report(advisory: Record<string, unknown> = BRACES) {
    return {
        auditReportVersion: 2,
        vulnerabilities: {
            braces: { name: 'braces', severity: advisory.severity, via: [advisory] as unknown[] },
            micromatch: { name: 'micromatch', severity: advisory.severity, via: ['braces'] as unknown[] },
        },
    };
}

describe('npm-audit-gate -- classify', () => {
    it('is fatal when a release outside the advisory range exists', () => {
        const lookup = vi.fn(() => false);
        const { fatal, unfixable } = classify(report(), lookup);
        expect(fatal.map(a => a.name)).toEqual(['braces']);
        expect(unfixable).toEqual([]);
        expect(lookup).toHaveBeenCalledWith('braces', '<=3.0.3');
    });

    it('warns instead when the latest release is still inside the range', () => {
        const { fatal, unfixable } = classify(report(), () => true);
        expect(fatal).toEqual([]);
        expect(unfixable).toEqual([{
            name: 'braces', range: '<=3.0.3', severity: 'high', title: BRACES.title, url: BRACES.url,
        }]);
    });

    it('ignores advisories below high, matching --audit-level=high', () => {
        const lookup = vi.fn(() => false);
        expect(classify(report({ ...BRACES, severity: 'moderate' }), lookup)).toEqual({ fatal: [], unfixable: [] });
        expect(lookup).not.toHaveBeenCalled();
    });

    it('counts an advisory reached through two packages once', () => {
        const r = report();
        r.vulnerabilities.micromatch.via = [BRACES];
        const lookup = vi.fn(() => false);
        expect(classify(r, lookup).fatal).toHaveLength(1);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('passes a clean report', () => {
        expect(classify({ auditReportVersion: 2, vulnerabilities: {} }, () => false))
            .toEqual({ fatal: [], unfixable: [] });
    });

    it('fails loud on an npm audit error report', () => {
        const r = { error: { code: 'ENOAUDIT', summary: 'Your configured registry does not support audit requests.' } };
        expect(() => classify(r, () => false)).toThrow(/ENOAUDIT.*registry access/);
    });

    it('fails loud on an error report that names no code or summary', () => {
        expect(() => classify({ error: {} }, () => false))
            .toThrow('npm audit failed: unknown code. Check registry access (npm ping) and re-run the scan.');
    });

    it('keys an advisory with no URL by name and range, and skips a package with no via list', () => {
        const { url: _url, ...noUrl } = BRACES;
        const r = report(noUrl);
        r.vulnerabilities.micromatch.via = [noUrl];
        const vulnerabilities = { ...r.vulnerabilities, bare: { name: 'bare', severity: 'high' } };
        const lookup = vi.fn(() => false);
        expect(classify({ ...r, vulnerabilities }, lookup).fatal).toEqual([
            { name: 'braces', range: '<=3.0.3', severity: 'high', title: BRACES.title, url: undefined },
        ]);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('fails loud on output that is not an audit v2 report', () => {
        expect(() => classify({ advisories: {} }, () => false)).toThrow(/no "vulnerabilities" object/);
    });

    it('rejects a package name that could read as an npm flag and never looks it up', () => {
        const lookup = vi.fn(() => false);
        expect(() => classify(report({ ...BRACES, name: '--registry=http://evil' }), lookup))
            .toThrow(/unexpected package name or range/);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('rejects a range carrying characters outside semver grammar', () => {
        const lookup = vi.fn(() => false);
        expect(() => classify(report({ ...BRACES, range: '<=3.0.3 && calc' }), lookup))
            .toThrow(/unexpected package name or range/);
        expect(lookup).not.toHaveBeenCalled();
    });
});

// The CLI: npm audit, then npm view for each gated advisory, through
// node:child_process spawnSync (mocked here), never a shell.
describe('npm-audit-gate -- run as a script', () => {
    type Answers = Record<string, { status?: number; stdout?: string; stderr?: string; error?: Error }>;
    const CLI = '/opt/npm/bin/npm-cli.js';
    const argv = process.argv;
    const exitCode = process.exitCode;
    const execpath = process.env.npm_execpath;
    let out: string[];

    /** The npm answers by argv after the cli path; a call with none fails the test. */
    function npm(answers: Answers) {
        spawnSync.mockImplementation((_node: string, args: string[]) => {
            const key = args.slice(1).join(' ');
            if (!(key in answers)) throw new Error(`unexpected npm ${key}`);
            return { status: 0, stdout: '', stderr: '', ...answers[key] };
        });
    }
    async function gate(script = 'npm-audit-gate.mjs') {
        process.argv = [process.execPath, script];
        vi.resetModules();
        await import('../../scripts/npm-audit-gate.mjs');
    }
    const AUDIT = JSON.stringify(report());

    beforeEach(() => {
        spawnSync.mockReset();
        process.env.npm_execpath = CLI;
        out = [];
        vi.spyOn(console, 'log').mockImplementation((line: string) => { out.push(`log ${line}`); });
        vi.spyOn(console, 'error').mockImplementation((line: string) => { out.push(`error ${line}`); });
    });
    afterEach(() => {
        process.argv = argv;
        process.exitCode = exitCode;
        if (execpath === undefined) delete process.env.npm_execpath;
        else process.env.npm_execpath = execpath;
    });

    it('passes a clean audit, running npm through node with fixed argv and no shell', async () => {
        npm({ 'audit --json': { stdout: '{"auditReportVersion":2,"vulnerabilities":{}}' } });
        await gate();
        expect(out).toEqual(['log npm audit gate passed (0 unfixable high/critical advisory(ies) warned).']);
        expect(process.exitCode).toBe(exitCode);
        expect(spawnSync).toHaveBeenCalledWith(process.execPath, [CLI, 'audit', '--json'], expect.not.objectContaining({ shell: expect.anything() }));
    });

    it('fails on a fixable advisory: a release outside its range exists', async () => {
        npm({
            'audit --json': { status: 1, stdout: AUDIT },
            'view braces version --json': { stdout: '"3.0.4"\n' },
            'view braces@<=3.0.3 version --json': { stdout: '["3.0.2","3.0.3"]' },
        });
        await gate();
        expect(out[0]).toBe(`error FATAL: braces <=3.0.3 (high) ${BRACES.title} -- ${BRACES.url}`);
        expect(out[1]).toMatch(/^error npm audit gate FAILED: 1 fixable high\/critical advisory\(ies\)\. .*Never `npm audit fix --force`/);
        expect(process.exitCode).toBe(1);
    });

    it('warns and passes on an unfixable one: the latest release is still in range', async () => {
        npm({
            'audit --json': { status: 1, stdout: AUDIT },
            'view braces version --json': { stdout: '"3.0.3"' },
            'view braces@<=3.0.3 version --json': { stdout: '"3.0.3"' },
        });
        await gate();
        expect(out).toEqual([
            `log WARN unfixable: braces <=3.0.3 (high) ${BRACES.title} -- ${BRACES.url}`,
            'log npm audit gate passed (1 unfixable high/critical advisory(ies) warned).',
        ]);
        expect(process.exitCode).toBe(exitCode);
    });

    const FAILURES: [string, string | null, Answers, string][] = [
        ['npm_execpath is unset', null, {}, 'npm_execpath is not set -- run this as `npm run audit:gate`, not with node directly.'],
        ['npm cannot be started', CLI, { 'audit --json': { error: new Error('spawn EACCES') } }, 'could not run npm audit: spawn EACCES'],
        ['npm audit prints no JSON', CLI, { 'audit --json': { status: 1, stdout: 'npm ERR! network' } },
            'npm audit --json did not print JSON; re-run `npm audit` to see why.'],
        ['npm view fails', CLI, { 'audit --json': { stdout: AUDIT }, 'view braces version --json': { status: 1, stderr: 'npm ERR! 404 \n' } },
            'npm view braces version --json exited 1: npm ERR! 404'],
        ['npm view names no latest version', CLI, { 'audit --json': { stdout: AUDIT }, 'view braces version --json': { stdout: '  ' } },
            'npm view braces returned no latest version; check registry access and re-run.'],
    ];

    it.each(FAILURES)('fails, saying what to do, when %s', async (_why, cli, answers, message) => {
        if (cli === null) delete process.env.npm_execpath;
        npm(answers);
        await gate();
        expect(out).toEqual([`error npm audit gate ERROR: ${message}`]);
        expect(process.exitCode).toBe(1);
    });

    it('does nothing when imported, or when node runs another file', async () => {
        process.argv = [process.execPath];
        vi.resetModules();
        await import('../../scripts/npm-audit-gate.mjs');
        await gate('vitest.mjs');
        expect(spawnSync).not.toHaveBeenCalled();
        expect(out).toEqual([]);
        expect(process.exitCode).toBe(exitCode);
    });
});
