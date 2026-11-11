import { describe, it, expect } from 'vitest';
import { createSettingsService, type GatewaySettings } from '../../../src/modules/gateway-settings/service';

const SETTINGS: GatewaySettings = {
    hosted: true, connModes: 'both', defaultConn: 'direct',
    tls: { certFile: '/tls/tls.crt', keyFile: '/tls/tls.key', trustDir: '/tls/trust', insecureSkipVerify: false },
    logLevel: 'warn',
    access: { allow: [], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30 },
    login: { maxFailures: 5, backoffSeconds: 30, maxBackoffSeconds: 900, unauthenticatedPerMinute: 60 },
    modules: { offered: ['queue-browser'], userDefault: 'all' },
};

const fetchMock = () => globalThis.fetch as any;

describe('gateway-settings/service', () => {
    it('load GETs /managed/settings', async () => {
        const view = { settings: SETTINGS, restartOnly: ['tls.keyFile'], pendingRestart: [], changedOnDisk: false, catalog: ['queue-browser'] };
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

    it('save PUTs the whole file and returns the keys that wait for a restart', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ restartRequired: ['tls.keyFile'] }) });

        expect(await createSettingsService().save(SETTINGS)).toEqual({ ok: true, data: { restartRequired: ['tls.keyFile'] } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/settings', expect.objectContaining({
            method: 'PUT', body: JSON.stringify(SETTINGS),
        }));
    });
});
