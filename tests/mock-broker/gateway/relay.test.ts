import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { isShowRpc, parseRelayPath } from '../../../src/mock-broker/gateway/relay';
import { FAULT, resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { contractSeed, seedContractBrokers } from './helpers';

/**
 * The relay's own rules (go-web-proxy/relay.go), beyond the refusals the
 * contract pins: the path table, the show-RPC check, and what the demo
 * broker answers once a request is let through.
 */
describe('mock-broker/gateway/relay -- the path', () => {
    const ok = (p: string) => parseRelayPath(`/managed/relay/${p}`);

    it('takes a broker, then exactly SEMP or SEMP/v2/...', () => {
        expect(ok('b1/SEMP')).toEqual({ broker: 'b1', rawTail: '/SEMP', v1: true });
        expect(ok('b1/SEMP/v2/monitor/msgVpns')).toEqual({ broker: 'b1', rawTail: '/SEMP/v2/monitor/msgVpns', v1: false });
        // An encoded slash inside a segment is one name, kept escaped for the broker.
        expect(ok('b1/SEMP/v2/monitor/msgVpns/v1/queues/a%2Fb')?.rawTail).toBe('/SEMP/v2/monitor/msgVpns/v1/queues/a%2Fb');
        // An escape that is not UTF-8 is a byte to url.PathUnescape, not a refusal.
        expect(ok('b1/SEMP/v2/monitor/msgVpns/v1/queues/q%FF')?.rawTail).toBe('/SEMP/v2/monitor/msgVpns/v1/queues/q%FF');
    });

    it.each([
        ['b1/SEMPx'], ['b1/x'], ['b1/SEMP/v1/x'], ['b1/SEMP/v2'], ['b1'], ['.../SEMP'], ['b%20x/SEMP'],
        ['b1/SEMP/v2/%2e%2e/x'], ['b1/SEMP/v2/a%2F..%2Fb'], ['b1/SEMP/v2/%5c'], ['b1/SEMP/v2/%252e'],
        ['b1/SEMP/v2//x'], ['b1/SEMP/v2/a%00'], ['b1/SEMP/v2/a%3Bb'], ['b1/SEMP/v2/%zz'],
    ])('refuses %s', (p) => {
        expect(ok(p)).toBeNull();
    });

    it('refuses a path outside the relay prefix', () => {
        expect(parseRelayPath('/managed/relays/b1/SEMP')).toBeNull();
    });
});

describe('mock-broker/gateway/relay -- the show check', () => {
    it.each([
        ['<rpc><show><queue><name>*</name></queue></show></rpc>'],
        ['<?xml version="1.0"?>\n<rpc>\n  <show><queue/></show>\n</rpc>'],
        ['<rpc><!-- a note --><show><client/></show></rpc>'],
        ['<rpc><show><queue><name><![CDATA[q1]]></name></queue></show></rpc>'],
        ['<?xml version="1.0" encoding="UTF-8"?><rpc><show/></rpc>'],
    ])('passes %s', (body) => {
        expect(isShowRpc(body)).toBe(true);
    });

    it.each([
        [''], ['<rpc/>'], ['<rpc><admin/></rpc>'], ['<rpc><show/><show/></rpc>'], ['<rpc>text<show/></rpc>'],
        ['<x:rpc xmlns:x="urn:x"><show/></x:rpc>'], ['<rpc><show><x:q xmlns:x="urn:x"/></show></rpc>'],
        ['<!DOCTYPE rpc><rpc><show/></rpc>'], ['<rpc><show></rpc>'], ['<show/>'],
        ['<rpc><![CDATA[x]]><show/></rpc>'],
        ['<?xml version="1.0" encoding="ISO-8859-1"?><rpc><show/></rpc>'], ['<?xml version="1.1"?><rpc><show/></rpc>'],
    ])('refuses %s', (body) => {
        expect(isShowRpc(body)).toBe(false);
    });
});

describe('mock-broker/gateway/relay -- through to the demo broker', () => {
    let gw: ReturnType<typeof createGateway>;
    let viewer: string;

    beforeEach(() => {
        resetScenario();
        scenario.latencyMs = 0;
        seedContractBrokers();
        gw = createGateway({ seed: contractSeed() });
        viewer = gw.openSession('viewer', false);
    });

    afterEach(() => {
        setBrokers({});
    });

    const get = (path: string, query = '', method = 'GET', body = '') =>
        gw.handle({ method, path: `/managed/relay/b1${path}`, query, body, session: viewer });

    it('lists the broker\'s VPNs and pages its queues like a broker', async () => {
        const vpns: any = (await get('/SEMP/v2/monitor/msgVpns')).json;
        expect(vpns.data).toEqual([{ msgVpnName: 'v1' }, { msgVpnName: 'v2' }]);

        const page: any = (await get('/SEMP/v2/monitor/msgVpns/v1/queues', 'count=3')).json;
        expect(page.data.map((d: any) => d.queueName)).toEqual(['q1', 'q2', 'q3']);
        // Absolute and broker-shaped, as the real relay passes the broker's own.
        expect(page.meta.paging.nextPageUri).toBe('https://host1:1943/SEMP/v2/monitor/msgVpns/v1/queues?count=3&cursor=3');
    });

    it('answers a v1 show from the broker\'s store', async () => {
        const res = await get('/SEMP', '', 'POST',
            '<rpc><show><queue><name>q1</name><vpn-name>v1</vpn-name><detail/></queue></show></rpc>');
        expect(res.status).toBe(200);
        expect(res.contentType).toBe('application/xml');
        expect(res.text).toContain('<num-messages-spooled>2</num-messages-spooled>');
    });

    it('answers HEAD without a body', async () => {
        const res = await get('/SEMP/v2/monitor/msgVpns', '', 'HEAD');
        expect(res).toEqual({ status: 200, contentType: 'application/json' });
    });

    it('refuses a query the gateway cannot parse', async () => {
        expect((await get('/SEMP/v2/monitor/msgVpns', 'a=1;b=2')).status).toBe(400);
        expect((await get('/SEMP/v2/monitor/msgVpns', 'a=%zz')).status).toBe(400);
        expect((await get('/SEMP/v2/monitor/msgVpns', 'a=%')).status).toBe(400);
        // url.ParseQuery takes an escape that is not UTF-8.
        expect((await get('/SEMP/v2/monitor/msgVpns', 'where=x%FF')).status).toBe(200);
    });

    it('forwards a path escape that is not UTF-8, which names nothing the broker holds', async () => {
        expect(await get('/SEMP/v2/monitor/msgVpns/v%FF/queues')).toEqual({ status: 200, json: { data: [], meta: {} } });
    });

    it('maps the broker\'s refusal of the stored credential to 502, never 401', async () => {
        scenario.fault = FAULT.SEMP_UNAUTHORIZED;
        expect((await get('/SEMP/v2/monitor/msgVpns')).json).toEqual({ error: 'upstream_auth' });
        expect((await get('/SEMP/v2/monitor/msgVpns')).status).toBe(502);
    });

    it('passes a broker 500 through, and reports an unreachable broker', async () => {
        scenario.fault = FAULT.SEMP_ERROR;
        expect((await get('/SEMP/v2/monitor/msgVpns')).status).toBe(500);
        scenario.fault = FAULT.NONE;
        gw.faults.relayUnreachable = true;
        expect(await get('/SEMP/v2/monitor/msgVpns')).toEqual({ status: 502, json: { error: 'upstream_unavailable' } });
    });

    it('applies a revoked entitlement on the next call', async () => {
        expect((await get('/SEMP/v2/monitor/msgVpns')).status).toBe(200);
        gw.store.upsertUser({ username: 'viewer', admin: false, operate: [], readOnly: [], modules: null }, '');
        expect(await get('/SEMP/v2/monitor/msgVpns')).toEqual({ status: 404, json: { error: 'not_found' } });
    });
});
