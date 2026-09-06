import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * managed-session-store — the single owner of the provisioned profile + seed.
 *
 * The credential transform is mocked with deterministic stand-ins so the suite
 * asserts the store's CONTRACT (what it brokers, what it refuses, what it never
 * exposes) without depending on the transform itself.
 */
vi.mock('../../../src/core/encode', () => ({
    fromB64: () => new Uint8Array([1]),
    importSeed: vi.fn(async () => ({ key: 'SEED' })),
    pack: vi.fn(async (v: string) => `PACKED(${v})`),
    unpack: vi.fn(async (blob: string) => `PLAIN(${blob})`),
}));

import { createManagedSessionStore, type DialConn } from '../../../src/core/services/managed-session-store';
import { importSeed, unpack } from '../../../src/core/encode';
import type { ManagedProfile } from '../../../src/core/services/managed-service';

const PROFILE: ManagedProfile = {
    admin: false,
    siteSeed: 'c2VlZA==',
    operate: [],
    readOnly: [],
    brokers: [
        {
            broker: 'b1', hostname: 'host1',
            semp: { port: '1943', user: 'mon', pass: 'PK-semp-b1' },
            msgVpns: [{ name: 'v1', client: { port: '1443', user: 'u1', pass: 'PK-cli-v1' } }],
        },
        { broker: 'b2', hostname: 'host2', semp: { port: '1943', user: 'mon', pass: 'PK-semp-b2' }, msgVpns: [] },
    ],
};

/** Collects whatever the store dials so tests can assert the payload. */
function recorder() {
    const calls: DialConn[] = [];
    return { calls, connect: (c: DialConn) => { calls.push(c); } };
}

beforeEach(() => {
    (importSeed as any).mockClear();
    (unpack as any).mockClear();
    (importSeed as any).mockImplementation(async () => ({ key: 'SEED' }));
});

describe('core/services/managed-session-store — inactive (no managed session)', () => {
    it('reports inactive and yields nothing', () => {
        const store = createManagedSessionStore();
        expect(store.isActive()).toBe(false);
        expect(store.brokers()).toEqual([]);
        expect(store.vpnsFor('b1')).toEqual([]);
    });

    it('refuses to seal a secret', async () => {
        const store = createManagedSessionStore();
        await expect(store.packSecret('s3cret')).rejects.toThrow(/requires a managed session/i);
    });

    // Closes the connect-click-vs-logout race: a click that lands after the
    // session is gone must fail loudly rather than dial with stale material.
    it('refuses to connect', async () => {
        const store = createManagedSessionStore();
        await expect(store.connect({ broker: 'b1', vpn: 'v1', kind: 'solace' }, recorder()))
            .rejects.toThrow(/requires a managed session/i);
    });
});

describe('core/services/managed-session-store — adopting a profile', () => {
    it('becomes active and exposes provisioned identities WITHOUT credentials', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);

        expect(store.isActive()).toBe(true);
        // Names + hostnames only — no semp/msgVpns/pass fields may escape.
        expect(store.brokers()).toEqual([
            { broker: 'b1', hostname: 'host1' },
            { broker: 'b2', hostname: 'host2' },
        ]);
        expect(store.vpnsFor('b1')).toEqual(['v1']);
        expect(store.vpnsFor('b2')).toEqual([]);
        expect(store.vpnsFor('nope')).toEqual([]);
        expect(importSeed).toHaveBeenCalledTimes(1);
    });

    it('re-adopting on refresh re-imports the seed (so a rotated seed is picked up)', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        await store.setProfile({ ...PROFILE, brokers: [PROFILE.brokers[1]] });

        expect(importSeed).toHaveBeenCalledTimes(2);
        expect(store.brokers()).toEqual([{ broker: 'b2', hostname: 'host2' }]);
    });

    it('a seed that will not import leaves the previous session untouched', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);

        (importSeed as any).mockRejectedValueOnce(new Error('bad seed'));
        await expect(store.setProfile({ ...PROFILE, brokers: [] })).rejects.toThrow('bad seed');

        // Still the ORIGINAL profile — no half-adopted state.
        expect(store.isActive()).toBe(true);
        expect(store.brokers()).toEqual([
            { broker: 'b1', hostname: 'host1' },
            { broker: 'b2', hostname: 'host2' },
        ]);
    });

    it('clear() drops the session', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        store.clear();
        expect(store.isActive()).toBe(false);
        expect(store.brokers()).toEqual([]);
    });
});

describe('core/services/managed-session-store — packSecret', () => {
    it('seals a plaintext with the stored seed', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        await expect(store.packSecret('s3cret')).resolves.toBe('PACKED(s3cret)');
    });
});

describe('core/services/managed-session-store — connect', () => {
    it('dials SEMP with the unpacked per-broker credential', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        const dial = recorder();

        await store.connect({ broker: 'b1', kind: 'semp' }, dial);

        expect(dial.calls).toHaveLength(1);
        const c = dial.calls[0];
        expect(c.kind).toBe('semp');
        expect(c.host).toBe('host1');
        expect(c.pass).toBe('PLAIN(PK-semp-b1)');       // unpacked just-in-time
        expect(c.cfg).toEqual({ protocol: 'https', port: '1943', urlPath: '', user: 'mon' });
    });

    it('dials Solace with the unpacked per-VPN credential and a matching clientName', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        const dial = recorder();

        await store.connect({ broker: 'b1', vpn: 'v1', kind: 'solace' }, dial);

        const c = dial.calls[0];
        if (c.kind !== 'solace') throw new Error('expected a solace dial');
        expect(c.host).toBe('host1');
        expect(c.pass).toBe('PLAIN(PK-cli-v1)');
        expect(c.cfg).toMatchObject({ protocol: 'wss', port: '1443', vpn: 'v1', user: 'u1', authMode: 'basic' });
        // Connection identity is owned by the store, so the composed clientName
        // must carry the very clientNameId that went into the cfg.
        expect(c.clientName).toBe(`SolMsgUtil/${c.clientName.split('/')[1]}/${c.cfg.clientNameId}`);
        expect(c.clientName).toMatch(/^SolMsgUtil\/\d{14}\/.+$/);
    });

    it('awaits an async dial', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        let settled = false;
        await store.connect({ broker: 'b1', kind: 'semp' }, {
            connect: async () => { await Promise.resolve(); settled = true; },
        });
        expect(settled).toBe(true);
    });

    it('refuses an unprovisioned broker', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        await expect(store.connect({ broker: 'ghost', kind: 'semp' }, recorder()))
            .rejects.toThrow(/Broker "ghost" is not provisioned/);
    });

    it('refuses an unprovisioned VPN on a provisioned broker', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        await expect(store.connect({ broker: 'b1', vpn: 'ghost', kind: 'solace' }, recorder()))
            .rejects.toThrow(/VPN "ghost" is not provisioned on broker "b1"/);
    });

    it('retains no plaintext — every connect unpacks afresh and nothing leaks through the API', async () => {
        const store = createManagedSessionStore();
        await store.setProfile(PROFILE);
        const dial = recorder();

        await store.connect({ broker: 'b1', vpn: 'v1', kind: 'solace' }, dial);
        await store.connect({ broker: 'b1', vpn: 'v1', kind: 'solace' }, dial);

        // Unpacked per call rather than memoized — no plaintext is being held.
        expect(unpack).toHaveBeenCalledTimes(2);
        // Nothing the store exposes carries the packed blob or the plaintext.
        const exposed = JSON.stringify({ brokers: store.brokers(), vpns: store.vpnsFor('b1') });
        expect(exposed).not.toContain('PK-cli-v1');
        expect(exposed).not.toContain('PLAIN(');
    });
});
