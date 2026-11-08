import { describe, it, expect, vi } from 'vitest';
import { createManagedProfile, isSessionEnded, type ManagedDialer } from '../../../src/core/services/managed-profile';
import type { ManagedProfile } from '../../../src/core/services/managed-service';

/**
 * The core managed profile: provisioned names in, connection payloads out.
 * The gateway calls are a stub dialer; the connection callbacks record what
 * they receive, which is all a consumer ever sees.
 */
const PROFILE: ManagedProfile = {
    username: 'alice', admin: false, modules: [],
    operate: [], readOnly: [{ brokers: '*', msgVpns: '*', queues: '*' }],
    brokers: [
        { broker: 'b1', msgVpns: [{ name: 'v1' }, { name: 'v2' }] },
        { broker: 'b2', msgVpns: [] },
    ],
};

function dialer(over: Partial<ManagedDialer> = {}): ManagedDialer {
    return {
        dial: vi.fn(async (broker: string, vpn: string) => ({
            ok: true as const, data: { smfPath: `/managed/smf/${broker}/${vpn}`, vpn, user: `u-${vpn}`, pass: `pw-${vpn}` },
        })),
        relayBase: (broker: string) => `/managed/relay/${broker}`,
        ...over,
    };
}

function signedIn(d: ManagedDialer = dialer()) {
    const p = createManagedProfile();
    p.attachDialer(d);
    p.setProfile(PROFILE);
    return p;
}

describe('core/services/managed-profile -- names', () => {
    it('is inert until a profile is set, and again after clear()', () => {
        const p = createManagedProfile();
        expect(p.isActive()).toBe(false);
        expect(p.brokers()).toEqual([]);
        expect(p.vpnsFor('b1')).toEqual([]);
        p.setProfile(PROFILE);
        expect(p.isActive()).toBe(true);
        p.clear();
        expect(p.isActive()).toBe(false);
        expect(p.brokers()).toEqual([]);
    });

    it('lists provisioned broker and VPN names only', () => {
        const p = signedIn();
        expect(p.brokers()).toEqual(['b1', 'b2']);
        expect(p.vpnsFor('b1')).toEqual(['v1', 'v2']);
        expect(p.vpnsFor('b2')).toEqual([]);
        expect(p.vpnsFor('nope')).toEqual([]);
    });
});

describe('core/services/managed-profile -- dial', () => {
    it('SEMP: hands back the relay config for the broker, with no credential and no gateway call', async () => {
        const d = dialer();
        const connect = vi.fn();
        await signedIn(d).dial({ broker: 'b1', kind: 'semp' }, { connect });
        expect(connect).toHaveBeenCalledWith({
            kind: 'semp', broker: 'b1',
            cfg: { protocol: 'https', port: '', urlPath: '', user: '', relayBase: '/managed/relay/b1' },
        });
        expect(d.dial).not.toHaveBeenCalled();
    });

    it('Solace: dials the gateway and hands the credential and socket path to connect only', async () => {
        const d = dialer();
        const connect = vi.fn();
        const p = signedIn(d);
        await p.dial({ broker: 'b1', vpn: 'v2', kind: 'solace' }, { connect });

        expect(d.dial).toHaveBeenCalledWith('b1', 'v2');
        const conn = connect.mock.calls[0][0];
        expect(conn).toMatchObject({ kind: 'solace', broker: 'b1', pass: 'pw-v2' });
        expect(conn.cfg).toMatchObject({
            protocol: 'wss', vpn: 'v2', user: 'u-v2', authMode: 'basic', smfPath: '/managed/smf/b1/v2',
        });
        // The clientName embeds the cfg's own id, so the two always match.
        expect(conn.clientName).toMatch(new RegExp(`^SolMsgUtil/\\d{14}/${conn.cfg.clientNameId}$`));
        // Nothing is kept: a second connect dials again.
        await p.dial({ broker: 'b1', vpn: 'v2', kind: 'solace' }, { connect });
        expect(d.dial).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['no session', (p: ReturnType<typeof createManagedProfile>) => p.clear(), { broker: 'b1', vpn: 'v1' }, /requires a sign-in session/],
        ['an unknown broker', () => {}, { broker: 'nope', vpn: 'v1' }, /Broker "nope" is not provisioned/],
        ['an unknown VPN', () => {}, { broker: 'b1', vpn: 'v9' }, /VPN "v9" is not provisioned on broker "b1"/],
    ])('refuses %s before calling the gateway', async (_what, arrange, target, message) => {
        const d = dialer();
        const p = signedIn(d);
        arrange(p);
        const connect = vi.fn();
        await expect(p.dial({ ...target, kind: 'solace' }, { connect })).rejects.toThrow(message);
        expect(d.dial).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it('refuses with no gateway calls attached', async () => {
        const p = createManagedProfile();
        p.setProfile(PROFILE);
        await expect(p.dial({ broker: 'b1', kind: 'semp' }, { connect: vi.fn() })).rejects.toThrow(/requires a sign-in session/);
    });

    it("rejects with the gateway's refusal as text, carrying its code", async () => {
        const p = signedIn(dialer({ dial: vi.fn(async () => ({ ok: false as const, status: 401, code: 'unauthenticated' })) }));
        const err = await p.dial({ broker: 'b1', vpn: 'v1', kind: 'solace' }, { connect: vi.fn() }).catch(e => e);
        expect(err.message).toBe('Your session has ended. Sign in again.');
        expect(isSessionEnded(err)).toBe(true);

        const q = signedIn(dialer({ dial: vi.fn(async () => ({ ok: false as const, status: 404, code: 'not_found' })) }));
        const other = await q.dial({ broker: 'b1', vpn: 'v1', kind: 'solace' }, { connect: vi.fn() }).catch(e => e);
        expect(other.message).toBe('Not found. It may already have been removed.');
        expect(isSessionEnded(other)).toBe(false);
    });

    it('never connects once signed out while the gateway answered', async () => {
        let answer!: () => void;
        const d = dialer({
            dial: vi.fn(() => new Promise<any>(resolve => {
                answer = () => resolve({ ok: true, data: { smfPath: '/managed/smf/b1/v1', vpn: 'v1', user: 'u', pass: 'p' } });
            })),
        });
        const p = signedIn(d);
        const connect = vi.fn();
        const pending = p.dial({ broker: 'b1', vpn: 'v1', kind: 'solace' }, { connect });
        p.clear();
        answer();
        await expect(pending).rejects.toThrow(/ended while connecting/);
        expect(connect).not.toHaveBeenCalled();
    });

    it('refuses a socket path outside the SMF gate', async () => {
        const p = signedIn(dialer({
            dial: vi.fn(async () => ({ ok: true as const, data: { smfPath: '/https/443/evil.example/', vpn: 'v1', user: 'u', pass: 'p' } })),
        }));
        const connect = vi.fn();
        await expect(p.dial({ broker: 'b1', vpn: 'v1', kind: 'solace' }, { connect })).rejects.toThrow(/unexpected socket path/);
        expect(connect).not.toHaveBeenCalled();
    });
});

describe('core/services/managed-profile -- isSessionEnded', () => {
    it('is true only for a refusal coded unauthenticated', () => {
        expect(isSessionEnded(Object.assign(new Error('x'), { code: 'unauthenticated' }))).toBe(true);
        expect(isSessionEnded(new Error('x'))).toBe(false);
        expect(isSessionEnded(undefined)).toBe(false);
        expect(isSessionEnded('unauthenticated')).toBe(false);
    });
});
