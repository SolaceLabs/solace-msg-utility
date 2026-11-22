// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createSettingsService, type GatewaySettings } from '../../../src/modules/gateway-settings/service';

const SETTINGS: GatewaySettings = {
    hosted: true, connModes: 'both', defaultConn: 'direct',
    tls: { insecureSkipVerify: false, standardRoots: true },
    logLevel: 'warn',
    access: { allow: [], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30, connectsPerMinute: 20 },
    login: {
        maxFailures: 5, perClient: true, clientMaxFailures: 10, resetMinutes: 15, backoffSeconds: 30, maxBackoffSeconds: 900,
        unauthenticatedPerMinute: 60, passwordMinLength: 12, twoFactor: 'optional', twoFactorMinutes: 10,
    },
    modules: { offered: ['queue-browser'], userDefault: 'all' },
    audit: { stdout: false, access: false, onFailure: 'continue' },
};

const fetchMock = () => globalThis.fetch as any;

describe('gateway-settings/service', () => {
    it('load GETs /managed/settings', async () => {
        const view = { rev: 'abc', settings: SETTINGS, changedOnDisk: false, catalog: ['queue-browser'] };
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => view });

        expect(await createSettingsService().load()).toEqual({ ok: true, data: view });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/settings', { method: 'GET', credentials: 'same-origin' });
    });

    it('client GETs /managed/client', async () => {
        const seen = { address: '203.0.113.9', peer: '192.0.2.10', viaProxy: true };
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => seen });

        expect(await createSettingsService().client()).toEqual({ ok: true, data: seen });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/client', { method: 'GET', credentials: 'same-origin' });
    });

    it('save PUTs the whole file with the rev at top level, and returns the new rev', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 'next' }) });

        expect(await createSettingsService().save(SETTINGS, 'abc')).toEqual({ ok: true, data: { rev: 'next' } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/settings', expect.objectContaining({
            method: 'PUT', body: JSON.stringify({ ...SETTINGS, rev: 'abc' }),
        }));
    });

    it('restart POSTs /managed/restart with no body and returns the 202 answer', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 202, json: async () => ({ restarting: true }) });

        expect(await createSettingsService().restart()).toEqual({ ok: true, data: { restarting: true } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/restart', { method: 'POST', credentials: 'same-origin' });
    });

    it('ping is true while /hosted answers, read fresh from the network', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200 });
        expect(await createSettingsService().ping()).toBe(true);
        expect(fetchMock()).toHaveBeenCalledWith('/hosted', { method: 'GET', cache: 'no-store' });
    });

    it.each([
        ['a gateway still starting answers with an error', () => fetchMock().mockResolvedValue({ ok: false, status: 502 })],
        ['a stopped gateway refuses the connection', () => fetchMock().mockRejectedValue(new TypeError('Failed to fetch'))],
    ])('ping is false when %s', async (_, arrange) => {
        arrange();
        expect(await createSettingsService().ping()).toBe(false);
    });
});
