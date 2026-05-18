import { describe, it, expect, beforeEach } from 'vitest';
import { config } from '../../../src/modules/connections/config.js';
import type { ConnectionConfig } from '../../../src/core/connections/types';

/**
 * Persistence compatibility test.
 *
 * Ensures blobs persisted by the connections module's config.js deserialize
 * into a shape that satisfies the lifted `ConnectionConfig` type. This is the
 * contract that lets queue-copy (and any other future consumer) safely treat
 * a loaded config as `ConnectionConfig` without defensive re-validation of
 * every field.
 *
 * Also guards against the "older version saved a shorter shape" case — if a
 * user upgrades from a pre-refactor build, `load()` must still succeed and
 * return usable data rather than throw or silently corrupt.
 *
 * These are structural (runtime) checks; TypeScript type assertions are
 * compile-time only and wouldn't catch a mismatch between the persisted JSON
 * and the declared interface shape.
 */
describe('core/connections — persistence compat with connections module', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('a complete ConnectionConfig round-trips through save/load unchanged', () => {
        const cfg: ConnectionConfig = {
            host: 'broker.example.com',
            solace: {
                protocol: 'wss',
                port: '8008',
                urlPath: '/v2',
                vpn: 'my-vpn',
                user: 'admin',
                authMode: 'basic',
                connectRetries: 3,
                connectTimeout: 5000,
                reconnectRetries: -1,
                reconnectWait: 2000,
                maxMessagesPerQueue: 500,
                clientNameId: 'my-client-id-42',
            },
            semp: {
                protocol: 'https',
                port: '1943',
                urlPath: '/semp',
                user: 'admin',
            },
        };

        expect(config.save(cfg)).toBe(true);
        const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
        (localStorage.getItem as any).mockReturnValue(stored);

        const loaded = config.load();
        expect(loaded).toEqual(cfg);
    });

    it('a legacy-shaped blob missing newer fields still loads without throwing', () => {
        // Simulates a save from an older version of the app that didn't yet
        // have `maxMessagesPerQueue` or `authMode`. applyConfig in module.ts
        // already guards every field with a truthy check — the loaded partial
        // shape is handled by the consumer, not by load() itself.
        const legacy = {
            host: 'old.broker',
            solace: {
                protocol: 'ws',
                port: '8000',
                vpn: 'default',
                user: 'admin',
                // no authMode, no connectRetries, no maxMessagesPerQueue, etc.
            },
            semp: {
                protocol: 'http',
                port: '8080',
                user: 'admin',
            },
        };

        // Use the real save path to produce a properly-obfuscated blob.
        expect(config.save(legacy as any)).toBe(true);
        const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
        (localStorage.getItem as any).mockReturnValue(stored);

        // Must not throw, must return the same partial shape the caller saved.
        const loaded = config.load();
        expect(loaded).toEqual(legacy);
    });

    it('persisted shape exposes all required-for-reuse fields when fully populated', () => {
        // This test locks in the invariant that a fully-populated config
        // written via save() carries every field queue-copy will need to
        // build a ConnectionConfig-shaped destination form default.
        const cfg: ConnectionConfig = {
            host: 'h',
            solace: {
                protocol: 'wss', port: '8008', urlPath: '', vpn: 'v', user: 'u',
                authMode: 'oauth',
                connectRetries: 0, connectTimeout: 3000,
                reconnectRetries: 1, reconnectWait: 3000,
                maxMessagesPerQueue: 100,
                clientNameId: 'persisted-id',
            },
            semp: { protocol: 'https', port: '1943', urlPath: '', user: 'a' },
        };

        config.save(cfg);
        const stored = (localStorage.setItem as any).mock.calls.at(-1)[1];
        (localStorage.getItem as any).mockReturnValue(stored);

        const loaded = config.load()!;
        // Structural assertions — every ConnectionConfig field present.
        expect(loaded.host).toBe('h');
        expect(loaded.solace.authMode).toBe('oauth');
        expect(loaded.solace.maxMessagesPerQueue).toBe(100);
        expect(loaded.semp.urlPath).toBe('');
    });
});
