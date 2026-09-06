import { describe, it, expect } from 'vitest';
import { matchGlob, isModuleVisible, isVpnVisible, isQueueVisible, canOperate } from '../../src/core/rbac';
import type { ManagedSession, QGlob } from '../../src/core/types';

/**
 * Cross-language conformance vector for matchGlob. This MUST stay in lockstep
 * with go-web-proxy/rbac_test.go's equivalent table so the client re-filter and
 * the proxy entitlement filter agree byte-for-byte. Globs are case-sensitive.
 */
const GLOB_CONFORMANCE: ReadonlyArray<[pattern: string, value: string, expected: boolean]> = [
    ['*', 'anything', true],
    ['*', '', true],
    ['', '', true],
    ['', 'x', false],
    ['queue1', 'queue1', true],
    ['queue1', 'queue2', false],
    ['broker-group*', 'broker-group-prod', true],
    ['broker-group*', 'other', false],
    ['*prod', 'us-prod', true],
    ['*prod', 'prod-us', false],
    ['orders.*', 'orders.new', true],
    ['orders.*', 'ordersXnew', false],   // '.' is literal, not regex-any
    ['a*b*c', 'aXXbYYc', true],
    ['a*b*c', 'aXXc', false],
    ['Order*', 'order-secret', false],   // case-sensitive: must not leak
    ['Order*', 'Order-1', true],
];

function session(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false,
        username: 'u',
        token: 't',
        broker: 'b1',
        vpns: [],
        operate: [],
        readOnly: [],
        ...over,
    };
}

const ALL: QGlob = { brokers: '*', msgVpns: '*', queues: '*' };

describe('core/rbac — matchGlob', () => {
    it.each(GLOB_CONFORMANCE)('matchGlob(%j, %j) === %j', (pattern, value, expected) => {
        expect(matchGlob(pattern, value)).toBe(expected);
    });
});

describe('core/rbac — isModuleVisible', () => {
    it('allows everything when there is no managed session', () => {
        expect(isModuleVisible(null, 'user-management')).toBe(true);
        expect(isModuleVisible(undefined, 'connection-management')).toBe(true);
    });

    it('gates admin-only modules on the admin flag', () => {
        expect(isModuleVisible(session({ admin: false }), 'user-management')).toBe(false);
        expect(isModuleVisible(session({ admin: false }), 'connection-management')).toBe(false);
        expect(isModuleVisible(session({ admin: true }), 'user-management')).toBe(true);
        expect(isModuleVisible(session({ admin: true }), 'connection-management')).toBe(true);
    });

    it('always shows non-admin modules', () => {
        expect(isModuleVisible(session({ admin: false }), 'queue-browser')).toBe(true);
    });

    // Modules that reach the broker over SEMP v1 RPC cannot be entitlement-
    // filtered (`filterSempFetch` only rewrites the v2 monitor list shapes), so
    // they are denied in EVERY managed session — admin included — until they
    // consume a filtered source. With no session they behave as before.
    describe("'unfiltered-semp' requirement", () => {
        const UNFILTERED = ['queue-subscription-explorer', 'queue-discovery'];

        it('is allowed when no managed session is in force', () => {
            for (const id of UNFILTERED) {
                expect(isModuleVisible(null, id)).toBe(true);
                expect(isModuleVisible(undefined, id)).toBe(true);
            }
        });

        it('is denied in any managed session, admin or not', () => {
            for (const id of UNFILTERED) {
                expect(isModuleVisible(session({ admin: false }), id)).toBe(false);
                expect(isModuleVisible(session({ admin: true }), id)).toBe(false);
            }
        });
    });

    // Full matrix: requirement × session shape.
    it('resolves the whole requirement matrix', () => {
        const cases: ReadonlyArray<[id: string, sess: ManagedSession | null, expected: boolean]> = [
            ['user-management', null, true],
            ['user-management', session({ admin: true }), true],
            ['user-management', session({ admin: false }), false],
            ['queue-subscription-explorer', null, true],
            ['queue-subscription-explorer', session({ admin: true }), false],
            ['queue-browser', null, true],
            ['queue-browser', session({ admin: false }), true],
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
