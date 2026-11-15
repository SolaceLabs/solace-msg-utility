import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway, responseHeaders } from '../../../src/mock-broker/gateway';
import {
    CLIENT_SCHEMES, moduleIdsProblem, passwordOk, portProblem, schemeOk, SEMP_SCHEMES, validBroker, validHost, validUsername,
} from '../../../src/mock-broker/gateway/validate';
import { matchGlob } from '../../../src/core/rbac';
import type { UpstreamAnswer } from '../../../src/mock-broker/gateway/relay';
import { scenario } from '../../../src/mock-broker/fixtures';
import type { GatewaySeed } from '../../../src/mock-broker/gateway/types';

/**
 * The fake gateway against the real gateway's contract. The files in
 * go-web-proxy/testdata/contract/ are the ones go-web-proxy/contract_test.go
 * proves the real gateway answers exactly; this suite proves the fake gives
 * the same answers from the same seed. A gateway change that alters an answer
 * fails the Go test first (its -update rewrites cases.json), then this one,
 * until the fake follows. A step compares the status, the body, the headers it
 * lists ("" for one that must be absent) and, where it reaches a broker, the
 * URL the relay asked the scripted broker for.
 */
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../go-web-proxy/testdata/contract');
const read = (name: string) => JSON.parse(readFileSync(path.join(DIR, name), 'utf-8'));

interface Step {
    as?: string;
    mustChange?: boolean;
    method: string;
    path: string;
    body?: unknown;
    raw?: string;
    upstream?: UpstreamAnswer & { url: string };
    status: number;
    headers?: Record<string, string>;
    response: unknown;
}

/** A header by name, any case; "" when absent. */
const header = (h: Record<string, string>, name: string): string =>
    Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? '';

const seed: GatewaySeed = read('seed.json');
const cases: { name: string; steps: Step[] }[] = read('cases.json').cases;

/**
 * contractNormalize in contract_test.go: a backup's next run, an export, and a
 * settings rev (the real gateway's keyed checksum, the fake's counter), which
 * is any non-empty string.
 */
function normalize(v: any): any {
    if (v && typeof v === 'object' && typeof v.nextRun === 'string') v.nextRun = '<time>';
    for (const k of ['filename', 'content']) if (v && typeof v === 'object' && k in v) v[k] = '<file>';
    normalizeRevs(v);
    return v;
}

/**
 * contractNormalizeRevs in contract_test.go: every string "rev" and the settings
 * entry of a "basis" becomes "<rev>"; an empty one stays, so it fails to match.
 * A numeric rev is compared as it is.
 */
function normalizeRevs(v: any): void {
    if (Array.isArray(v)) {
        v.forEach(normalizeRevs);
        return;
    }
    if (!v || typeof v !== 'object') return;
    for (const [k, e] of Object.entries<any>(v)) {
        if (k === 'rev' && typeof e === 'string' && e !== '') {
            v[k] = '<rev>';
            continue;
        }
        if (k === 'basis' && e && typeof e === 'object' && typeof e.settings === 'string' && e.settings !== '') e.settings = '<rev>';
        normalizeRevs(e);
    }
}

/** A request body names the settings rev with a token (contractRevToken in contract_test.go): the rev now, and the rev the case began with. */
const REV_NOW = '"<settings-rev>"';
const REV_START = '"<settings-rev-at-start>"';

beforeEach(() => {
    scenario.latencyMs = 0;
});

describe('mock-broker/gateway -- the gateway contract', () => {
    it('reads the contract files', () => {
        expect(cases.length).toBeGreaterThan(0);
        expect(seed['msg-utility-users'].length).toBeGreaterThan(0);
    });

    for (const c of cases) {
        it(c.name, async () => {
            // The scripted broker: the step being run says what it answers.
            let script: Step['upstream'];
            let asked = '';
            const gw = createGateway({
                seed: JSON.parse(JSON.stringify(seed)),
                backupIter: 1000,
                upstream: call => {
                    asked = call.url;
                    return script ?? { error: 'contract: the step scripts no broker answer' };
                },
            });
            // The settings rev, read as the page reads it, for the steps whose body names it.
            const adminSid = gw.openSession('admin', false);
            const settingsRev = async (): Promise<string> => {
                const res = await gw.handle({ method: 'GET', path: '/managed/settings', query: '', body: '', session: adminSid });
                const rev = (res.json as { rev?: string } | undefined)?.rev;
                if (res.status !== 200 || !rev) throw new Error(`GET /managed/settings for its rev: ${res.status}`);
                return rev;
            };
            const startRev = c.steps.some(s => JSON.stringify(s.body ?? '').includes(REV_START)) ? await settingsRev() : '';
            // Every session the case names is open before its first step.
            const sid = new Map<string, string>();
            for (const s of c.steps) {
                const key = `${s.as}/${!!s.mustChange}`;
                if (s.as && !sid.has(key)) sid.set(key, gw.openSession(s.as, !!s.mustChange));
            }
            for (const [i, s] of c.steps.entries()) {
                script = s.upstream;
                asked = '';
                const [p, q = ''] = s.path.split('?');
                let body = s.raw ?? (s.body === undefined ? '' : JSON.stringify(s.body));
                if (body.includes(REV_START)) body = body.split(REV_START).join(JSON.stringify(startRev));
                if (body.includes(REV_NOW)) body = body.split(REV_NOW).join(JSON.stringify(await settingsRev()));
                const res = await gw.handle({
                    method: s.method,
                    path: p,
                    query: q,
                    body,
                    session: s.as ? sid.get(`${s.as}/${!!s.mustChange}`)! : null,
                });
                // A relayed answer is the broker's text; the contract's bodies are JSON.
                const sent = res.json !== undefined ? res.json : res.text ? JSON.parse(res.text) : undefined;
                const got = sent === undefined ? null : normalize(JSON.parse(JSON.stringify(sent)));
                const hs = responseHeaders(res);
                const headers = Object.fromEntries(Object.keys(s.headers ?? {}).map(k => [k, header(hs, k)]));
                expect({ step: i + 1, status: res.status, body: got, headers, url: s.upstream ? asked : undefined })
                    .toEqual({ step: i + 1, status: s.status, body: s.response, headers: s.headers ?? {}, url: s.upstream?.url });
            }
        });
    }
});

describe('mock-broker/gateway -- the validation vectors', () => {
    const v = read('validation.json');
    const checks: [string, (s: string) => boolean][] = [
        ['username', validUsername],
        ['broker', validBroker],
        ['host', validHost],
        ['port', s => portProblem(s) === null],
        ['password', passwordOk],
    ];

    for (const [name, okFn] of checks) {
        it(`${name}: each vector as the gateway judges it`, () => {
            expect(v[name].valid.length).toBeGreaterThan(0);
            expect(v[name].invalid.length).toBeGreaterThan(0);
            for (const s of v[name].valid) expect({ [name]: s, ok: okFn(s) }).toEqual({ [name]: s, ok: true });
            for (const s of v[name].invalid) expect({ [name]: s, ok: okFn(s) }).toEqual({ [name]: s, ok: false });
        });
    }

    it('modules: each vector as the gateway judges it', () => {
        for (const ids of v.modules.valid) expect(moduleIdsProblem('modules', ids)).toBeNull();
        for (const ids of v.modules.invalid) expect(moduleIdsProblem('modules', ids)).not.toBeNull();
    });

    for (const [side, [tls, plain]] of [['semp', SEMP_SCHEMES], ['client', CLIENT_SCHEMES]] as const) {
        it(`scheme.${side}: each vector as the gateway judges it`, () => {
            const vec: { valid: string[]; invalid: string[] } = v.scheme[side];
            expect(vec.valid.length * vec.invalid.length).toBeGreaterThan(0);
            for (const s of vec.valid) expect({ s, ok: schemeOk(s, tls, plain) }).toEqual({ s, ok: true });
            for (const s of vec.invalid) expect({ s, ok: schemeOk(s, tls, plain) }).toEqual({ s, ok: false });
        });
    }

    it('glob: the entitlement match the fake uses (src/core/rbac.ts) answers each row as the gateway does', () => {
        const rows: [string, string, boolean][] = v.glob;
        expect(rows.length).toBeGreaterThan(0);
        for (const [pattern, value, expected] of rows) {
            expect({ pattern, value, match: matchGlob(pattern, value) }).toEqual({ pattern, value, match: expected });
        }
    });
});
