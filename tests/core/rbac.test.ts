import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { matchGlob, isModuleVisible, isVpnVisible, isQueueVisible, canOperate, explainAccess } from '../../src/core/rbac';
import type { ManagedSession, QGlob } from '../../src/core/types';
import { REPO_ROOT } from '../helpers/sources';

/**
 * Cross-language conformance vector for matchGlob, kept once: the `glob` rows
 * of go-web-proxy/testdata/contract/validation.json, which
 * go-web-proxy/rbac_test.go reads too. So the client re-filter, the demo's fake
 * gateway (src/mock-broker/gateway/store.ts, which uses this matchGlob) and the
 * gateway's entitlement filter agree byte-for-byte. Globs are case-sensitive.
 */
const SHARED = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'go-web-proxy/testdata/contract/validation.json'), 'utf-8')).glob;
const GLOB_CONFORMANCE: [pattern: string, value: string, expected: boolean][] = Array.isArray(SHARED) ? SHARED : [];

function session(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false,
        username: 'u',
        broker: 'b1',
        vpns: [],
        operate: [],
        readOnly: [],
        modules: [],
        ...over,
    };
}

const ALL: QGlob = { brokers: '*', msgVpns: '*', queues: '*' };

describe('core/rbac — matchGlob', () => {
    it('reads the shared vector: [pattern, value, expected] rows, matches and misses alike', () => {
        expect(SHARED, 'validation.json carries the "glob" rows go-web-proxy/rbac_test.go reads too').toBeInstanceOf(Array);
        expect(GLOB_CONFORMANCE.length).toBeGreaterThan(0);
        for (const row of GLOB_CONFORMANCE) {
            expect([row.length, typeof row[0], typeof row[1], typeof row[2]]).toEqual([3, 'string', 'string', 'boolean']);
        }
        expect(new Set(GLOB_CONFORMANCE.map(([, , expected]) => expected))).toEqual(new Set([true, false]));
    });

    it.each(GLOB_CONFORMANCE)('matchGlob(%j, %j) === %j', (pattern, value, expected) => {
        expect(matchGlob(pattern, value)).toBe(expected);
    });
});

describe('core/rbac — isModuleVisible', () => {
    it('allows everything when there is no managed session', () => {
        expect(isModuleVisible(null, 'user-management')).toBe(true);
        expect(isModuleVisible(undefined, 'connection-management')).toBe(true);
    });

    it('gates admin-only modules on the admin flag, whatever the granted modules', () => {
        for (const id of ['user-management', 'connection-management', 'gateway-settings', 'backup']) {
            expect(isModuleVisible(session({ admin: false, modules: [id] }), id)).toBe(false);
            expect(isModuleVisible(session({ admin: true }), id)).toBe(true);
        }
    });

    // Module control: past the requirements, a managed user sees the sign-in
    // surfaces and exactly the modules the gateway granted (/managed/me).
    it('shows the sign-in surfaces in every managed session', () => {
        expect(isModuleVisible(session(), 'connections')).toBe(true);
        expect(isModuleVisible(session(), 'admin-login')).toBe(true);
    });

    it('shows any other module only when the session was granted it', () => {
        const s = session({ modules: ['queue-browser'] });
        expect(isModuleVisible(s, 'queue-browser')).toBe(true);
        expect(isModuleVisible(s, 'queue-copy')).toBe(false);
        // The admin flag does not widen module control.
        expect(isModuleVisible(session({ admin: true }), 'queue-browser')).toBe(false);
    });

    // A module that reaches the broker over SEMP v1 RPC with nothing filtering
    // its rows (`filterSempFetch` only rewrites the v2 monitor list shapes) is
    // denied in EVERY managed session -- admin included. With no session it
    // behaves as before.
    describe("'unfiltered-semp' requirement", () => {
        const UNFILTERED = ['queue-discovery'];

        it('is allowed when no managed session is in force', () => {
            for (const id of UNFILTERED) {
                expect(isModuleVisible(null, id)).toBe(true);
                expect(isModuleVisible(undefined, id)).toBe(true);
            }
        });

        it('is denied in any managed session, admin or not, even if granted', () => {
            for (const id of UNFILTERED) {
                expect(isModuleVisible(session({ admin: false, modules: [id] }), id)).toBe(false);
                expect(isModuleVisible(session({ admin: true, modules: [id] }), id)).toBe(false);
            }
        });
    });

    // Full matrix: requirement × session shape.
    it('resolves the whole requirement matrix', () => {
        const cases: ReadonlyArray<[id: string, sess: ManagedSession | null, expected: boolean]> = [
            ['user-management', null, true],
            ['user-management', session({ admin: true }), true],
            ['user-management', session({ admin: false }), false],
            ['queue-discovery', null, true],
            ['queue-discovery', session({ admin: true, modules: ['queue-discovery'] }), false],
            // Filters its own rows (visibleQueueRows), so it is granted like any module.
            ['queue-subscription-explorer', session({ modules: ['queue-subscription-explorer'] }), true],
            ['queue-subscription-explorer', session({ admin: true }), false],
            ['queue-browser', null, true],
            ['queue-browser', session({ modules: ['queue-browser'] }), true],
            ['queue-browser', session({ admin: true }), false],
            ['connections', session({ admin: false }), true],
        ];
        for (const [id, sess, expected] of cases) {
            expect(isModuleVisible(sess, id), `${id} / session=${sess ? 'yes' : 'no'}`).toBe(expected);
        }
    });
});

describe('core/rbac — isVpnVisible', () => {
    it('allows everything when there is no managed session', () => {
        expect(isVpnVisible(null, 'b1', 'v1')).toBe(true);
    });

    it('matches a broker/vpn regardless of the queue glob (operate or read-only)', () => {
        const op = session({ operate: [{ brokers: 'b1', msgVpns: 'v1', queues: 'only-this-queue' }] });
        expect(isVpnVisible(op, 'b1', 'v1')).toBe(true); // queue glob ignored for vpn visibility
        const ro = session({ readOnly: [{ brokers: '*', msgVpns: 'audit*', queues: '*' }] });
        expect(isVpnVisible(ro, 'bX', 'audit-1')).toBe(true);
    });

    it('denies when no row matches the broker/vpn', () => {
        const s = session({ operate: [{ brokers: 'b1', msgVpns: 'v1', queues: '*' }] });
        expect(isVpnVisible(s, 'b1', 'v2')).toBe(false);
        expect(isVpnVisible(s, 'b2', 'v1')).toBe(false);
        expect(isVpnVisible(session(), 'b1', 'v1')).toBe(false); // no rows at all
    });
});

describe('core/rbac — isQueueVisible', () => {
    it('allows everything when there is no managed session', () => {
        expect(isQueueVisible(null, 'b1', 'v1', 'q1')).toBe(true);
    });

    it('matches via an operate row', () => {
        const s = session({ operate: [{ brokers: 'b1', msgVpns: 'v1', queues: 'q*' }] });
        expect(isQueueVisible(s, 'b1', 'v1', 'q1')).toBe(true);
    });

    it('matches via a read-only row', () => {
        const s = session({ readOnly: [{ brokers: '*', msgVpns: '*', queues: 'audit.*' }] });
        expect(isQueueVisible(s, 'b1', 'v1', 'audit.x')).toBe(true);
    });

    it('denies when neither set matches (broker/vpn/queue are AND-ed)', () => {
        const s = session({ operate: [{ brokers: 'b1', msgVpns: 'v1', queues: 'q1' }] });
        expect(isQueueVisible(s, 'b1', 'v2', 'q1')).toBe(false); // vpn mismatch
        expect(isQueueVisible(s, 'b2', 'v1', 'q1')).toBe(false); // broker mismatch
        expect(isQueueVisible(s, 'b1', 'v1', 'q2')).toBe(false); // queue mismatch
    });
});

describe('core/rbac — canOperate', () => {
    it('allows everything when there is no managed session', () => {
        expect(canOperate(null, 'b1', 'v1', 'q1')).toBe(true);
    });

    it('only consults operate rows, not read-only', () => {
        const readOnlyAll = session({ readOnly: [ALL] });
        expect(canOperate(readOnlyAll, 'b1', 'v1', 'q1')).toBe(false);
        const operateAll = session({ operate: [ALL] });
        expect(canOperate(operateAll, 'b1', 'v1', 'q1')).toBe(true);
    });
});

describe('core/rbac -- explainAccess', () => {
    const OPS_ROW: QGlob = { brokers: 'prod', msgVpns: 'vpn-*', queues: 'orders.*' };
    const RO_ROW: QGlob = { brokers: 'prod', msgVpns: 'vpn-a', queues: '*' };
    const rows = { operate: [OPS_ROW], readOnly: [RO_ROW] };

    it('operate: an operate row matching all three wins over a matching read-only row', () => {
        expect(explainAccess(rows, 'prod', 'vpn-a', 'orders.new')).toEqual({ level: 'operate', row: OPS_ROW });
    });

    it('read-only: only a read-only row matches the queue', () => {
        expect(explainAccess(rows, 'prod', 'vpn-a', 'payments')).toEqual({ level: 'read-only', row: RO_ROW });
    });

    it('vpn-only: a row reaches broker and VPN but no queue pattern matches, from either list', () => {
        expect(explainAccess(rows, 'prod', 'vpn-b', 'payments')).toEqual({ level: 'vpn-only', row: OPS_ROW });
        const readOnlyOnly = { operate: [], readOnly: [{ brokers: '*', msgVpns: 'audit', queues: 'audit.*' }] };
        expect(explainAccess(readOnlyOnly, 'b1', 'audit', 'orders')).toEqual({ level: 'vpn-only', row: readOnlyOnly.readOnly[0] });
    });

    it('none: no row matches broker and VPN; globs are case-sensitive', () => {
        expect(explainAccess(rows, 'PROD', 'vpn-a', 'orders.new')).toEqual({ level: 'none', row: null });
        expect(explainAccess({ operate: [], readOnly: [] }, 'prod', 'vpn-a', 'q')).toEqual({ level: 'none', row: null });
    });

    // The permission test must never disagree with what a session is filtered by.
    it.each([
        ['prod', 'vpn-a', 'orders.new'],
        ['prod', 'vpn-a', 'payments'],
        ['prod', 'vpn-b', 'payments'],
        ['prod', 'vpn-b', 'orders.x'],
        ['PROD', 'vpn-a', 'orders.new'],
        ['dev', 'vpn-a', 'q'],
    ])('agrees with canOperate / isQueueVisible / isVpnVisible on %s / %s / %s', (broker, vpn, queue) => {
        const s = session(rows);
        const { level } = explainAccess(rows, broker, vpn, queue);
        expect(level === 'operate').toBe(canOperate(s, broker, vpn, queue));
        expect(level === 'operate' || level === 'read-only').toBe(isQueueVisible(s, broker, vpn, queue));
        expect(level !== 'none').toBe(isVpnVisible(s, broker, vpn));
    });
});
