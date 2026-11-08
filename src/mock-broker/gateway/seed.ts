/**
 * The managed demo's fixed, fake assets: three brokers, their queues in the
 * demo broker, and four accounts that show the differences between roles.
 * Every password here is a demo value the control panel lists; none is a
 * credential for anything.
 *
 * - `admin` operates everything and sees the admin pages.
 * - `operator` operates `orders.*` on east-prod/orders, reads the rest of
 *   east-prod and lab, and never sees west-dr.
 * - `viewer` reads east-prod/orders only, and has no Queue Copy.
 * - `newadmin` must change the password at first sign-in.
 *
 * Mock-only.
 */
import { QUEUE_STATE, type QueueFixture, type VpnFixture } from '../fixtures';
import type { GatewaySeed } from './types';

const q = (name: string, seed: number, subscriptions: string[], state: QueueFixture['state'] = QUEUE_STATE.NORMAL): QueueFixture =>
    ({ name, seed, subscriptions, state });

/** The demo broker's view of each provisioned broker. VPN names are unique across the demo. */
export const DEMO_TOPOLOGY: Record<string, VpnFixture[]> = {
    'east-prod': [
        {
            name: 'orders',
            queues: [
                q('orders.new', 24, ['orders/new/>']),
                q('orders.process', 12, ['orders/process/*']),
                q('orders.archive', 0, []),
                q('audit.orders', 9, ['audit/orders/>'], QUEUE_STATE.READ_ONLY),
                q('scratch.orders', 3, ['scratch/>']),
            ],
        },
        {
            name: 'payments',
            queues: [
                q('payments.settled', 18, ['payments/*/settled']),
                q('payments.reversal', 4, ['payments/reversal/>']),
                q('audit.payments', 6, ['audit/payments/>']),
            ],
        },
    ],
    'west-dr': [
        { name: 'orders-dr', queues: [q('orders.new', 7, ['orders/new/>']), q('orders.replay', 0, [])] },
    ],
    lab: [
        { name: 'sandbox', queues: [q('sandbox.scratch', 5, ['sandbox/>']), q('sandbox.bulk', 300, ['bulk/>'])] },
    ],
};

/** The demo accounts, listed by the control panel. */
export const DEMO_ACCOUNTS = [
    { username: 'admin', password: 'demo-admin-0001', role: 'Administrator: every broker, the admin pages' },
    { username: 'operator', password: 'demo-operator-01', role: 'Operates orders.* on east-prod/orders, reads east-prod and lab' },
    { username: 'viewer', password: 'demo-viewer-0001', role: 'Reads east-prod/orders only; no Queue Copy' },
    { username: 'newadmin', password: 'demo-change-me-01', role: 'Administrator who must change the password first' },
] as const;

const everything = [{ brokers: '*', msgVpns: '*', queues: '*' }];
const pw = (user: string) => DEMO_ACCOUNTS.find(a => a.username === user)!.password;

const connection = (broker: string, vpns: string[]) => ({
    broker,
    hostname: `${broker}.demo.invalid`,
    semp: { port: '1943', username: 'demo-monitor', password: 'demo-semp-password' },
    client: { port: '1443', msgVpns: vpns.map(name => ({ name, username: `${name}-client`, password: `demo-${name}-password` })) },
});

export function demoSeed(): GatewaySeed {
    return {
        'msg-utility-users': [
            { username: 'admin', password: pw('admin'), admin: true, operate: everything, 'read-only': [] },
            {
                username: 'operator', password: pw('operator'), admin: false,
                operate: [{ brokers: 'east-prod', msgVpns: 'orders', queues: 'orders.*' }],
                'read-only': [{ brokers: 'east-prod', msgVpns: '*', queues: '*' }, { brokers: 'lab', msgVpns: '*', queues: '*' }],
                modules: ['queue-browser', 'queue-copy'],
            },
            {
                username: 'viewer', password: pw('viewer'), admin: false, operate: [],
                'read-only': [{ brokers: 'east-prod', msgVpns: 'orders', queues: '*' }],
                modules: ['queue-browser'],
            },
            { username: 'newadmin', password: pw('newadmin'), admin: true, mustChangePassword: true, operate: everything, 'read-only': [] },
        ],
        'msg-utility-connections': [
            connection('east-prod', ['orders', 'payments']),
            connection('west-dr', ['orders-dr']),
            connection('lab', ['sandbox']),
        ],
        settings: {
            hosted: true,
            connModes: 'provisioned',
            defaultConn: 'provisioned',
            appDir: '/SolaceMsgUtility',
            tls: { certFile: '/tls/tls.crt', keyFile: '/tls/tls.key', trustDir: '/tls/trust', insecureSkipVerify: false },
            logLevel: 'warn',
            usersFile: '/data/users.yaml',
            connectionsFile: '/data/connections.yaml',
            access: { allow: [], trustedProxies: [] },
            session: { idleMinutes: 10, absoluteMinutes: 30 },
            login: { maxFailures: 5, backoffSeconds: 30, maxBackoffSeconds: 900, unauthenticatedPerMinute: 60 },
            modules: { offered: ['queue-browser', 'queue-copy'], userDefault: 'all' },
        },
        // TEST-NET-1: the address the fake gateway sees the browser at.
        client: '192.0.2.10',
    };
}
