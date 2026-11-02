import { describe, it, expect } from 'vitest';
import { createManagedService } from '../../../src/core/services/managed-service';

describe('core/services/managed-service', () => {
    it('me() GETs /managed/me on the session cookie and returns the profile', async () => {
        const profile = { username: 'alice', admin: false, operate: [], readOnly: [], brokers: [] };
        (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200, json: async () => profile });

        expect(await createManagedService().me()).toEqual({ ok: true, data: profile });
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/me', { method: 'GET', credentials: 'same-origin' });
    });

    it('me() hands back the gateway code when there is no session', async () => {
        (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthenticated' }) });
        expect(await createManagedService().me()).toEqual(expect.objectContaining({ ok: false, status: 401, code: 'unauthenticated' }));
    });

    it('logout() POSTs /managed/logout with no body', async () => {
        (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 204 });
        expect(await createManagedService().logout()).toEqual({ ok: true, data: undefined });
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/logout', { method: 'POST', credentials: 'same-origin' });
    });

    it('dial() POSTs the broker and VPN and returns the VPN credential', async () => {
        const answer = { smfPath: '/managed/smf/b1/v1', vpn: 'v1', user: 'u1', pass: 'p1' };
        (globalThis.fetch as any).mockResolvedValue({ ok: true, status: 200, json: async () => answer });
        expect(await createManagedService().dial('b1', 'v1')).toEqual({ ok: true, data: answer });
        expect(globalThis.fetch).toHaveBeenCalledWith('/managed/dial', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ broker: 'b1', vpn: 'v1' }),
        });
    });

    it('relayBase() is the SEMP relay path of a broker, its name escaped', () => {
        expect(createManagedService().relayBase('b1')).toBe('/managed/relay/b1');
        expect(createManagedService().relayBase('a b/c')).toBe('/managed/relay/a%20b%2Fc');
    });
});
