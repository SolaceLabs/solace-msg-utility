import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { buildSolaceSdk } from '../../../src/mock-broker/sdk';
import { setSocketGate } from '../../../src/mock-broker/sdk/session';
import { SessionEventCode } from '../../../src/mock-broker/sdk/enums';
import { createMessage, createTopicDestination } from '../../../src/mock-broker/sdk/message';
import { getQueue } from '../../../src/mock-broker/broker/store';
import { resetScenario, scenario, setBrokers } from '../../../src/mock-broker/fixtures';
import { contractSeed, seedContractBrokers } from './helpers';

/**
 * The SMF socket gate (go-web-proxy/smf.go, sockets.go) through the SDK
 * emulator: what opens a socket, and the revocations that close it. Sessions
 * are opened as solace-client.ts opens them, on the URL gatewayWsUrl builds
 * from dial's smfPath.
 */
let gw: ReturnType<typeof createGateway>;

beforeEach(() => {
    resetScenario();
    scenario.latencyMs = 0;
    seedContractBrokers();
    gw = createGateway({ seed: contractSeed() });
    setSocketGate(gw.sockets.gate);
});

afterEach(() => {
    setSocketGate(null);
    setBrokers({});
});

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/** A session as the viewer's dial would set it up; `over` changes one property. */
async function open(over: Record<string, unknown> = {}) {
    const sdk = buildSolaceSdk();
    const events: { code: string; info?: string }[] = [];
    const session = sdk.SolclientFactory.createSession({
        // On file:// the page has no host: gatewayWsUrl gives ws:///managed/smf/...
        url: 'ws:///managed/smf/b1/v1', vpnName: 'v1', userName: 'u1', password: 'cli-b1v1-pw', ...over,
    });
    for (const code of [SessionEventCode.UP_NOTICE, SessionEventCode.CONNECT_FAILED_ERROR, SessionEventCode.DISCONNECTED]) {
        session.on(code, (e: any) => events.push({ code: String(code), info: e?.infoStr }));
    }
    session.connect();
    await tick();
    return { session, events };
}

const codes = (events: { code: string }[]) => events.map(e => e.code);
const UP = String(SessionEventCode.UP_NOTICE);
const FAILED = String(SessionEventCode.CONNECT_FAILED_ERROR);
const DOWN = String(SessionEventCode.DISCONNECTED);

describe('mock-broker/gateway/sockets -- opening', () => {
    it('opens for the page\'s session with the dialled credential, on any page host', async () => {
        gw.setCookie(gw.openSession('viewer', false));
        expect(codes((await open()).events)).toEqual([UP]);
        expect(codes((await open({ url: 'wss://gw.example/managed/smf/b1/v1' })).events)).toEqual([UP]);
        expect(gw.sockets.list()).toEqual([
            { user: 'viewer', broker: 'b1', vpn: 'v1' }, { user: 'viewer', broker: 'b1', vpn: 'v1' },
        ]);
    });

    it.each([
        ['no session', null, {}, '401 unauthenticated'],
        ['a forced password change', 'mustChange', {}, '403 password_change_required'],
        ['a VPN the user may not reach', 'viewer', { url: 'ws:///managed/smf/b2/v9', vpnName: 'v9' }, '404 not_found'],
        ['an unknown broker', 'viewer', { url: 'ws:///managed/smf/nope/v1' }, '404 not_found'],
    ])('refuses %s before the broker', async (_what, who, over, status) => {
        if (who) gw.setCookie(gw.openSession('viewer', who === 'mustChange'));
        const { events } = await open(over);
        expect(events).toEqual([{ code: FAILED, info: `Connection error: the gateway refused the SMF socket (${status})` }]);
        expect(gw.sockets.list()).toEqual([]);
    });

    it.each([
        ['a wrong password', { password: 'guess' }],
        ['another VPN\'s user', { userName: 'u2' }],
        ['a login to another VPN than the socket\'s', { vpnName: 'v2' }],
    ])('passes the broker\'s refusal of %s', async (_what, over) => {
        gw.setCookie(gw.openSession('viewer', false));
        const { events } = await open(over);
        expect(codes(events)).toEqual([FAILED]);
        expect(events[0].info).toMatch(/^Login failure: 401 Unauthorized/);
    });

    it('leaves a socket path an unknown host when no gate is set (mock.html)', async () => {
        setSocketGate(null);
        const { events } = await open();
        expect(events).toEqual([{ code: FAILED, info: 'Connection error: Unable to connect to ws:///managed/smf/b1/v1' }]);
    });

    it('publishes to the socket\'s broker only', async () => {
        gw.setCookie(gw.openSession('viewer', false));
        const { session } = await open();
        const before = getQueue('v1', 'q1')!.messages.length;
        const msg = createMessage();
        msg.setDestination(createTopicDestination('q1/a'));
        session.send(msg);
        expect(getQueue('v1', 'q1')!.messages).toHaveLength(before + 1);
    });
});

describe('mock-broker/gateway/sockets -- revocation', () => {
    let sid: string;
    beforeEach(() => {
        sid = gw.openSession('viewer', false);
        gw.setCookie(sid);
    });

    const admin = (method: string, path: string, body?: unknown) => gw.handle({
        method, path, query: '', body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession('admin', false),
    });
    const viewerRow = { brokers: 'b1', msgVpns: 'v1', queues: '*' };

    it.each([
        ['sign-out', async () => { await gw.handle({ method: 'POST', path: '/managed/logout', query: '', body: '', session: sid }); }],
        ['a new password', async () => {
            await admin('PUT', '/managed/users/viewer', { password: 'viewer-password-9', admin: false, operate: [], readOnly: [viewerRow], modules: null });
        }],
        ['a changed administrator flag', async () => {
            await admin('PUT', '/managed/users/viewer', { password: '', admin: true, operate: [], readOnly: [viewerRow], modules: null });
        }],
        ['the user deleted', async () => { await admin('DELETE', '/managed/users/viewer'); }],
        ['the entitlement removed', async () => {
            await admin('PUT', '/managed/users/viewer', { password: '', admin: false, operate: [], readOnly: [], modules: null });
        }],
        ['the VPN removed from the broker', async () => {
            await admin('PUT', '/managed/connections/b1', {
                hostname: 'host1', semp: { port: '1943', user: 'mon', pass: '' }, client: { port: '1443', msgVpns: [{ name: 'v2', user: 'u2', pass: '' }] },
            });
        }],
        ['the broker deleted', async () => { await admin('DELETE', '/managed/connections/b1'); }],
    ])('closes the socket on %s', async (_what, revoke) => {
        const { events } = await open();
        await revoke();
        expect(codes(events)).toEqual([UP, DOWN]);
        expect(gw.sockets.list()).toEqual([]);
    });

    it('keeps it open across an edit that leaves the VPN reachable', async () => {
        const { events } = await open();
        await admin('PUT', '/managed/users/viewer', { password: '', admin: false, operate: [], readOnly: [viewerRow, { brokers: 'b2', msgVpns: '*', queues: '*' }], modules: null });
        expect(codes(events)).toEqual([UP]);
    });

    it('keeps it open when its session expires, as the gateway sets no timer', async () => {
        const { events } = await open();
        gw.sessions.expire(sid);
        expect(codes(events)).toEqual([UP]);
    });

    it('still closes on a password change after the session expired', async () => {
        const { events } = await open();
        gw.sessions.expire(sid);
        await admin('PUT', '/managed/users/viewer', { password: 'viewer-password-9', admin: false, operate: [], readOnly: [viewerRow], modules: null });
        expect(codes(events)).toEqual([UP, DOWN]);
    });

    it('forgets a socket the app disconnects itself', async () => {
        const { session } = await open();
        session.disconnect();
        expect(gw.sockets.list()).toEqual([]);
    });
});
