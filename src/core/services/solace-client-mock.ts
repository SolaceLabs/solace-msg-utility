import type { SolaceConfig } from '../connections/types';
import type { SolaceConnectionHooks, SolaceClient } from './solace-client';
import { logger } from '../logger';

/**
 * Mock Solace session factory.
 * Mirrors the hook-based API of the real factory; simulates broker.solace.com.
 */
export function createServiceSolace(hooks: SolaceConnectionHooks): SolaceClient {
    function init() {
        logger.info('[Mock] SolClientFactory init (no-op)');
    }

    function connect(cfg: SolaceConfig, host: string, _pass: string) {
        // Simulate untrusted certificate
        if (host.includes('untrust.com')) {
            hooks.onError?.(new Error('Certificate Not Trusted (Mock)'));
            return;
        }

        // Only broker.solace.com succeeds
        if (host !== 'broker.solace.com') {
            hooks.onConnectFailed?.({ infoStr: `Connection error: Unable to connect to ${host}` });
            return;
        }

        logger.info('[Mock] Solace Session UP');
        hooks.onConnected({ _mock: true }, cfg.vpn);
    }

    function disconnect() {
        cleanup();
        hooks.onDisconnected();
    }

    function cleanup() {
        // No SDK session to dispose in the mock; hook-based architecture
        // means the caller resets its own UI/state in onDisconnected.
    }

    return { init, connect, disconnect, cleanup };
}
