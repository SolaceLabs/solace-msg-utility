import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MANAGED_ERROR_CODES } from '../../../src/core/services/managed-api';
import { createGateway } from '../../../src/mock-broker/gateway';
import { FAULT, resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { CONTRACT_DIR, contractSeed, seedContractBrokers } from './helpers';

/**
 * Every error code the app has a message for, against the managed demo: the
 * fake gateway sends it (a contract golden, or a fault the control panel
 * arms), the app makes it itself, or it is named here as not simulated. A
 * code added to managed-api.ts's messages fails this suite until it is placed.
 */
type Gw = ReturnType<typeof createGateway>;

const cases: { steps: { response: unknown }[] }[] = JSON.parse(readFileSync(path.join(CONTRACT_DIR, 'cases.json'), 'utf-8')).cases;

/** The codes go-web-proxy/testdata/contract/cases.json pins, for both gateways. */
const GOLDEN = new Set(cases.flatMap(c => c.steps)
    .map(s => (s.response as { error?: string } | null)?.error)
    .filter((e): e is string => typeof e === 'string'));

/** `invalid` always carries the gateway's reason, which the app shows instead of a stock line. */
const REASON_ONLY = 'invalid';

const call = (gw: Gw, method: string, p: string, body?: unknown) => gw.handle({
    method, path: p, query: '', body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession('admin', false),
});
const relayed = (gw: Gw) => call(gw, 'GET', '/managed/relay/b1/SEMP/v2/monitor/msgVpns');
const savedSettings = async (gw: Gw) => {
    const view = await call(gw, 'GET', '/managed/settings');
    return call(gw, 'PUT', '/managed/settings', (view.json as { settings: unknown }).settings);
};

/**
 * Codes the fake sends in a state the contract cannot pin: once a
 * control-panel fault is armed, or (backup_unavailable) for a second backup
 * in the same second, which a fixed clock makes certain. Each row sets the
 * state and asks. The relay's upstream_* codes are pinned by the contract
 * too (the broker's own odd answers); the switches here stand for a broker
 * the gateway cannot reach or that refuses its credential.
 */
const FAULTS: Record<string, { status: number; ask: (gw: Gw) => ReturnType<Gw['handle']> }> = {
    backup_unavailable: { status: 409, ask: async () => {
        const gw = createGateway({ seed: contractSeed(), backupIter: 1000, now: () => new Date(Date.UTC(2026, 10, 9, 2)) });
        await call(gw, 'PUT', '/managed/backup/schedule', { kind: 'daily', hour: 2, keep: 7, passphrase: 'a long passphrase' });
        await call(gw, 'POST', '/managed/backup/run');
        return call(gw, 'POST', '/managed/backup/run');
    } },
    rate_limited: { status: 429, ask: gw => { gw.faults.dialRateLimited = true; return call(gw, 'POST', '/managed/dial', { broker: 'b1', vpn: 'v1' }); } },
    upstream_unavailable: { status: 502, ask: gw => { gw.faults.relayUnreachable = true; return relayed(gw); } },
    upstream_auth: { status: 502, ask: gw => { scenario.fault = FAULT.SEMP_UNAUTHORIZED; return relayed(gw); } },
    config_unreadable: { status: 500, ask: gw => { gw.faults.unreadable = true; return call(gw, 'GET', '/managed/settings'); } },
    config_changed_on_disk: { status: 409, ask: gw => { gw.faults.changedOnDisk = true; return savedSettings(gw); } },
};

/** Made by managedRequest itself: no gateway sends them. */
const CLIENT = ['network', 'bad_response'];

/**
 * Sent by the real gateway, never by the demo's: a cross-site request and an
 * oversized body cannot come from the page itself, and the fake has no
 * failure of its own to report as a server error.
 */
const NOT_SIMULATED = ['cross_origin', 'too_large', 'server_error'];

beforeEach(() => {
    resetScenario();
    scenario.latencyMs = 0;
    seedContractBrokers();
});

afterEach(() => {
    setBrokers({});
});

describe('mock-broker/gateway -- the error codes', () => {
    it('places every code the app has a message for exactly once', () => {
        // A code the contract pins is placed by the contract, switch or not.
        const armedOnly = Object.keys(FAULTS).filter(c => !GOLDEN.has(c));
        const groups = [[...GOLDEN].filter(c => c !== REASON_ONLY), armedOnly, CLIENT, NOT_SIMULATED];
        const placed = groups.flat();
        expect([...placed].sort()).toEqual([...MANAGED_ERROR_CODES].sort());
        expect(new Set(placed).size).toBe(placed.length);
    });

    it('has a message for every code the contract pins, but the reason-only one', () => {
        expect(GOLDEN.has(REASON_ONLY)).toBe(true);
        expect(MANAGED_ERROR_CODES).not.toContain(REASON_ONLY);
    });

    for (const [code, f] of Object.entries(FAULTS)) {
        it(`sends ${code} once its fault is armed`, async () => {
            const res = await f.ask(createGateway({ seed: contractSeed() }));
            expect([res.status, (res.json as { error?: string }).error]).toEqual([f.status, code]);
        });
    }
});
