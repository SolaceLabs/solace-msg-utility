/**
 * The managed demo's fixed, fake assets: three brokers (one of them, `lab`, an
 * appliance with a messaging host of its own), their queues in the demo
 * broker, and four accounts that show the differences between roles.
 * Every password here is a demo value the control panel lists; none is a
 * credential for anything.
 *
 * - `admin` operates everything and sees the admin pages.
 * - `operator` operates `orders.*` on east-prod/orders, reads the rest of
 *   east-prod and lab, and never sees west-dr.
 * - `viewer` reads east-prod/orders only, and has no Queue Copy; its Queue
 *   Subscriptions list leaves out east-prod's payments VPN.
 * - `newadmin` must change the password at first sign-in.
 *
 * Mock-only.
 */
import { QUEUE_STATE, type QueueFixture, type VpnFixture } from '../fixtures';
import type { GatewaySeed } from './types';

const q = (name: string, seed: number, subscriptions: string[], state: QueueFixture['state'] = QUEUE_STATE.NORMAL): QueueFixture =>
    ({ name, seed, subscriptions, state });

/** The queue of fixed payload samples (images, files, maps, streams); reads like any queue the account may browse. */
const samples = (name: string): QueueFixture => ({ name, seed: 0, subscriptions: [], state: QUEUE_STATE.NORMAL, samples: true });

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
                samples('payload-samples'),
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

/** A saved connection; with `messagingHost`, an appliance whose messaging answers on that host. */
const connection = (broker: string, vpns: string[], messagingHost?: string) => ({
    broker,
    hostname: `${broker}.demo.invalid`,
    semp: { port: '1943', username: 'demo-monitor', password: 'demo-semp-password' },
    client: {
        ...(messagingHost ? { hostname: messagingHost } : {}),
        port: '1443',
        msgVpns: vpns.map(name => ({ name, username: `${name}-client`, password: `demo-${name}-password` })),
    },
});

/** The messaging host of the demo's one appliance, `lab`. */
export const DEMO_APPLIANCE_MESSAGING_HOST = 'lab-msg.demo.invalid';

/** A standard root CA as the demo describes it: fixed demo values, since the demo cannot read X.509. */
const demoRoot = (subject: string, sha256: string) => ({
    subject, issuer: subject, names: [], notBefore: '2015-01-01T00:00:00Z', notAfter: '2040-01-01T00:00:00Z',
    sha256, selfSigned: true, expired: false,
});

/** The standard root CAs the demo gateway's image carries: a few stand-ins for Mozilla's list. */
const DEMO_STANDARD_ROOTS = [
    demoRoot('CN=Demo Root CA R1, O=Demo Trust Services, C=GB',
        '3A:1F:7C:52:9E:04:B6:D1:88:2C:5F:E0:13:A7:6B:94:C2:0D:F8:31:5E:A9:72:46:BB:18:E3:0F:65:D7:9C:24'),
    demoRoot('CN=Demo ECC Root, O=Demo Trust Services, C=GB',
        'C7:52:0B:E9:34:6D:A1:F0:2E:98:47:BC:15:63:D2:8A:7F:06:E4:39:C1:5B:20:9D:F6:83:4A:17:E8:62:B0:5C'),
    demoRoot('CN=Example Global Root, O=Example Certificate Authority, C=US',
        '91:E4:26:7B:D3:08:5A:C2:6F:B1:40:9E:17:F5:83:2C:6A:D9:0E:B7:54:31:8C:F2:A6:1D:69:C0:3B:E5:72:08'),
];

export function demoSeed(): GatewaySeed {
    return {
        'msg-utility-users': [
            { username: 'admin', password: pw('admin'), admin: true, operate: everything, 'read-only': [] },
            {
                username: 'operator', password: pw('operator'), admin: false,
                operate: [{ brokers: 'east-prod', msgVpns: 'orders', queues: 'orders.*' }],
                'read-only': [{ brokers: 'east-prod', msgVpns: '*', queues: '*' }, { brokers: 'lab', msgVpns: '*', queues: '*' }],
                modules: ['queue-browser', 'queue-copy', 'queue-subscription-explorer'],
            },
            {
                username: 'viewer', password: pw('viewer'), admin: false, operate: [],
                'read-only': [{ brokers: 'east-prod', msgVpns: 'orders', queues: '*' }],
                modules: ['queue-browser', 'queue-subscription-explorer'],
            },
            { username: 'newadmin', password: pw('newadmin'), admin: true, mustChangePassword: true, operate: everything, 'read-only': [] },
        ],
        'msg-utility-connections': [
            connection('east-prod', ['orders', 'payments']),
            connection('west-dr', ['orders-dr']),
            connection('lab', ['sandbox'], DEMO_APPLIANCE_MESSAGING_HOST),
        ],
        settings: {
            hosted: true,
            connModes: 'provisioned',
            defaultConn: 'provisioned',
            tls: { insecureSkipVerify: false, standardRoots: true },
            logLevel: 'warn',
            access: { allow: [], trustedProxies: [] },
            session: { idleMinutes: 10, absoluteMinutes: 30, connectsPerMinute: 20 },
            login: {
                maxFailures: 5, perClient: true, clientMaxFailures: 10, resetMinutes: 15, backoffSeconds: 30, maxBackoffSeconds: 900,
                unauthenticatedPerMinute: 60, passwordMinLength: 12, twoFactorMinutes: 10, twoFactor: 'optional',
            },
            modules: { offered: ['queue-browser', 'queue-copy', 'queue-subscription-explorer'], userDefault: 'all' },
            audit: { stdout: false, access: false, onFailure: 'continue' },
        },
        standardRoots: DEMO_STANDARD_ROOTS,
        // TEST-NET-1: the address the fake gateway sees the browser at.
        client: '192.0.2.10',
    };
}
