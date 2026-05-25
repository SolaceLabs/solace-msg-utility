import type { SempConfig } from '../connections/types';
import type { SempConnectionHooks, SempClient } from './semp-client';
import { logger } from '../logger';

/**
 * Mock SEMP client factory.
 * Mirrors the hook-based API of the real factory; simulates broker.solace.com.
 */
export function createServiceSemp(hooks: SempConnectionHooks): SempClient {
    async function connect(cfg: SempConfig, host: string, pass: string): Promise<void> {
        const baseUrl = `${cfg.protocol}://${host}:${cfg.port}`;

        try {
            // Simulate untrusted certificate
            if (host.includes('untrust.com')) {
                throw new Error('Certificate Not Trusted (Mock)');
            }

            // Only broker.solace.com succeeds
            if (host !== 'broker.solace.com') {
                hooks.onError?.({
                    message: `Unable to connect to ${host}`,
                    isNetworkError: false,
                    isTimeout: false,
                    baseUrl,
                });
                return;
            }

            logger.info('[Mock] SEMP Connection Established');

            // Mock fetch — caller can ignore or stub further. Tests typically
            // don't actually exercise this fetch in mock build. Signature
            // matches the real client: path-only, closure assembles the URL.
            const sempFetch = (path: string, opts: RequestInit = {}) =>
                fetch(`${baseUrl}${path}`, opts);

            hooks.onConnected({ fetch: sempFetch, baseUrl }, { user: cfg.user, pass });

        } catch (err: any) {
            const isNetworkError = !!(
                err.message && err.message.includes('Certificate')
            );
            hooks.onError?.({
                message: err.message,
                isNetworkError,
                isTimeout: false,
                baseUrl,
            });
        }
    }

    async function disconnect(): Promise<void> {
        logger.info('[Mock] Disconnecting SEMP...');
        hooks.onDisconnected();
    }

    return { connect, disconnect };
}
