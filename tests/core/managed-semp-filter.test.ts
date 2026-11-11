import { describe, it, expect, vi } from 'vitest';
import { filterSempFetch, visibleQueueRows } from '../../src/core/managed-semp-filter';
import type { ManagedSession } from '../../src/core/types';

function managed(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false, username: 'u', broker: 'b1',
        vpns: [], operate: [], readOnly: [], modules: [],
        ...over,
    };
}
function jsonResponse(obj: unknown, status = 200): Response {
    return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

describe('core/managed-semp-filter', () => {
    it('bounds the VPN list to the PROVISIONED set, overriding a broad entitlement glob', async () => {
        // The picker shows provisioned VPNs (connections.yaml ∩ entitled), NOT
        // everything a broad `msgVpns: '*'` glob would admit — the regression
        // behind "the picker shows all VPNs". `vpns` is the provisioned set.
        const m = managed({ vpns: ['vpn1'], operate: [{ brokers: '*', msgVpns: '*', queues: '*' }] });
        const raw = vi.fn(async () => jsonResponse({ data: [{ msgVpnName: 'vpn1' }, { msgVpnName: 'vpn2' }], meta: { count: 2 } }));
        const res = await filterSempFetch(raw, m)('/SEMP/v2/monitor/msgVpns?count=100');
        const json = await res.json();
        expect(json.data.map((v: any) => v.msgVpnName)).toEqual(['vpn1']); // vpn2 dropped despite the '*' glob
        expect(json.meta).toEqual({ count: 2 }); // pagination/meta preserved
    });

    it('intersects the provisioned set with the live broker list (drops provisioned VPNs absent from the broker)', async () => {
        const m = managed({ vpns: ['vpn1', 'vpn-gone'] });
        const raw = vi.fn(async () => jsonResponse({ data: [{ msgVpnName: 'vpn1' }, { msgVpnName: 'vpn3' }] }));
        const res = await filterSempFetch(raw, m)('/SEMP/v2/monitor/msgVpns?count=100');
        const json = await res.json();
        expect(json.data.map((v: any) => v.msgVpnName)).toEqual(['vpn1']); // vpn-gone not on broker, vpn3 not provisioned
    });

    it('falls back to the entitlement-glob check for the VPN list before a provisioned set is published', async () => {
        const m = managed({ operate: [{ brokers: 'b1', msgVpns: 'vpn1', queues: '*' }] }); // vpns: [] (default)
        const raw = vi.fn(async () => jsonResponse({ data: [{ msgVpnName: 'vpn1' }, { msgVpnName: 'vpn2' }], meta: { count: 2 } }));
        const res = await filterSempFetch(raw, m)('/SEMP/v2/monitor/msgVpns?count=100');
        const json = await res.json();
        expect(json.data.map((v: any) => v.msgVpnName)).toEqual(['vpn1']);
        expect(json.meta).toEqual({ count: 2 });
    });

    it('filters the queue list using the VPN parsed from the path', async () => {
        const m = managed({ readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'orders.*' }] });
        const raw = vi.fn(async () => jsonResponse({ data: [{ queueName: 'orders.new' }, { queueName: 'audit.x' }] }));
        const res = await filterSempFetch(raw, m)('/SEMP/v2/monitor/msgVpns/vpn1/queues?count=100');
        const json = await res.json();
        expect(json.data.map((q: any) => q.queueName)).toEqual(['orders.new']);
    });

    it('filters paginated queue pages (substring match, cursor preserved path)', async () => {
        const m = managed({ operate: [{ brokers: '*', msgVpns: '*', queues: 'keep*' }] });
        const raw = vi.fn(async () => jsonResponse({ data: [{ queueName: 'keep1' }, { queueName: 'drop1' }] }));
        const res = await filterSempFetch(raw, m)('/SEMP/v2/monitor/msgVpns/myvpn/queues?count=100&cursor=abc');
        const json = await res.json();
        expect(json.data.map((q: any) => q.queueName)).toEqual(['keep1']);
    });

    it('drops a row whose name is missing or not text, as no named entitlement matches it', async () => {
        const m = managed({ vpns: ['vpn1'], readOnly: [{ brokers: 'b1', msgVpns: 'vpn1', queues: 'orders.*' }] });
        const queues = vi.fn(async () => jsonResponse({ data: [{ queueName: 'orders.new' }, {}, null, { queueName: 7 }] }));
        const q = await (await filterSempFetch(queues, m)('/SEMP/v2/monitor/msgVpns/vpn1/queues')).json();
        expect(q.data).toEqual([{ queueName: 'orders.new' }]);

        const vpns = vi.fn(async () => jsonResponse({ data: [{ msgVpnName: 'vpn1' }, { msgVpnName: 1 }, 'vpn1'] }));
        const v = await (await filterSempFetch(vpns, m)('/SEMP/v2/monitor/msgVpns')).json();
        expect(v.data).toEqual([{ msgVpnName: 'vpn1' }]);
    });

    it('passes a non-discovery call (v1 RPC) through untouched', async () => {
        const original = jsonResponse({ rpc: 'reply' });
        const res = await filterSempFetch(vi.fn(async () => original), managed())('/SEMP', { method: 'POST' });
        expect(res).toBe(original);
    });

    it('passes a non-200 response through', async () => {
        const err = jsonResponse({ data: [] }, 401);
        const res = await filterSempFetch(vi.fn(async () => err), managed())('/SEMP/v2/monitor/msgVpns');
        expect(res).toBe(err);
    });

    it('passes through when the body is not JSON', async () => {
        const notJson = new Response('<<not json>>', { status: 200 });
        const res = await filterSempFetch(vi.fn(async () => notJson), managed())('/SEMP/v2/monitor/msgVpns');
        expect(res).toBe(notJson);
    });

    it('passes through when there is no data array', async () => {
        const noData = jsonResponse({ meta: {} });
        const res = await filterSempFetch(vi.fn(async () => noData), managed())('/SEMP/v2/monitor/msgVpns/v1/queues');
        expect(res).toBe(noData);
    });
});

describe('core/managed-semp-filter -- visibleQueueRows', () => {
    // A cross-VPN listing (the subscription explorer's SEMP v1 rows).
    const ROWS = [
        { vpn: 'orders', queue: 'orders.new', topic: 'a' },
        { vpn: 'orders', queue: 'audit.x', topic: 'b' },
        { vpn: 'payments', queue: 'orders.new', topic: 'c' },
    ];

    it('passes every row when there is no managed session', () => {
        expect(visibleQueueRows(null, ROWS)).toBe(ROWS);
    });

    it('keeps rows in a provisioned VPN whose queue is visible, dropping other VPNs even under a broad glob', () => {
        const m = managed({ vpns: ['orders'], operate: [{ brokers: 'b1', msgVpns: '*', queues: 'orders.*' }] });
        expect(visibleQueueRows(m, ROWS).map(r => r.topic)).toEqual(['a']);
    });

    it('counts read-only rows, and falls back to the entitlement globs before a provisioned set is published', () => {
        const m = managed({ readOnly: [{ brokers: 'b1', msgVpns: 'payments', queues: '*' }] }); // vpns: []
        expect(visibleQueueRows(m, ROWS).map(r => r.topic)).toEqual(['c']);
    });

    it('checks the rows against the connected broker', () => {
        const m = managed({ broker: 'b2', vpns: ['orders'], operate: [{ brokers: 'b1', msgVpns: '*', queues: '*' }] });
        expect(visibleQueueRows(m, ROWS)).toEqual([]);
    });
});
