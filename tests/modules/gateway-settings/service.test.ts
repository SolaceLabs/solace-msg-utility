import { describe, it, expect } from 'vitest';
import { createSettingsService, type GatewaySettings } from '../../../src/modules/gateway-settings/service';

const SETTINGS: GatewaySettings = {
    hosted: true, connModes: 'both', defaultConn: 'direct', appDir: '/SolaceMsgUtility',
    tls: { certFile: '/tls/tls.crt', keyFile: '/tls/tls.key', trustDir: '/tls/trust', insecureSkipVerify: false },
    logLevel: 'warn', usersFile: '/data/users.yaml', connectionsFile: '/data/connections.yaml',
    access: { allow: [], trustedProxies: [] },
    session: { idleMinutes: 10, absoluteMinutes: 30 },
    login: { maxFailures: 5, backoffSeconds: 30, maxBackoffSeconds: 900, unauthenticatedPerMinute: 60 },
    modules: { offered: ['queue-browser'], userDefault: 'all' },
};

const fetchMock = () => globalThis.fetch as any;

describe('gateway-settings/service', () => {
    it('load GETs /managed/settings', async () => {
        const view = { settings: SETTINGS, restartOnly: ['appDir'], pendingRestart: [], changedOnDisk: false, catalog: ['queue-browser'] };
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => view });

        expect(await createSettingsService().load()).toEqual({ ok: true, data: view });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/settings', { method: 'GET', credentials: 'same-origin' });
    });

    it('save PUTs the whole file and returns the keys that wait for a restart', async () => {
        fetchMock().mockResolvedValue({ ok: true, status: 200, json: async () => ({ restartRequired: ['appDir'] }) });

        expect(await createSettingsService().save(SETTINGS)).toEqual({ ok: true, data: { restartRequired: ['appDir'] } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/settings', expect.objectContaining({
            method: 'PUT', body: JSON.stringify(SETTINGS),
        }));
    });
});
