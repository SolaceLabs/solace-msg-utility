import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway } from '../../../src/mock-broker/gateway';
import {
    moduleIdsProblem, passwordOk, portProblem, validBroker, validHost, validUsername,
} from '../../../src/mock-broker/gateway/validate';
import { scenario } from '../../../src/mock-broker/fixtures';
import type { GatewaySeed } from '../../../src/mock-broker/gateway/types';

/**
 * The fake gateway against the real gateway's contract. The files in
 * go-web-proxy/testdata/contract/ are the ones go-web-proxy/contract_test.go
 * proves the real gateway answers exactly; this suite proves the fake gives
 * the same answers from the same seed. A gateway change that alters an answer
 * fails the Go test first (its -update rewrites cases.json), then this one,
 * until the fake follows.
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
    status: number;
    response: unknown;
}

const seed: GatewaySeed = read('seed.json');
const cases: { name: string; steps: Step[] }[] = read('cases.json').cases;

/** contractNormalize in contract_test.go: store paths, a backup's next run, an export. */
function normalize(v: any): any {
    if (v && typeof v === 'object' && v.settings && typeof v.settings === 'object') {
        for (const k of ['usersFile', 'connectionsFile']) if (k in v.settings) v.settings[k] = '<path>';
    }
    if (v && typeof v === 'object' && typeof v.nextRun === 'string') v.nextRun = '<time>';
    for (const k of ['filename', 'content']) if (v && typeof v === 'object' && k in v) v[k] = '<file>';
    return v;
}

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
            const gw = createGateway({ seed: JSON.parse(JSON.stringify(seed)), backupIter: 1000 });
            // Every session the case names is open before its first step.
            const sid = new Map<string, string>();
            for (const s of c.steps) {
                const key = `${s.as}/${!!s.mustChange}`;
                if (s.as && !sid.has(key)) sid.set(key, gw.openSession(s.as, !!s.mustChange));
            }
            for (const [i, s] of c.steps.entries()) {
                const [p, q = ''] = s.path.split('?');
                const res = await gw.handle({
                    method: s.method,
                    path: p,
                    query: q,
                    body: s.raw ?? (s.body === undefined ? '' : JSON.stringify(s.body)),
                    session: s.as ? sid.get(`${s.as}/${!!s.mustChange}`)! : null,
                });
                const got = res.json === undefined ? null : normalize(JSON.parse(JSON.stringify(res.json)));
                expect({ step: i + 1, status: res.status, body: got })
                    .toEqual({ step: i + 1, status: s.status, body: s.response });
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
});
