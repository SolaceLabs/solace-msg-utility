import { describe, it, expect, vi } from 'vitest';
import { filterSempFetch } from '../../src/core/managed-semp-filter';
import type { ManagedSession } from '../../src/core/types';

function managed(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false, username: 'u', token: 't', broker: 'b1',
        vpns: [], operate: [], readOnly: [],
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
