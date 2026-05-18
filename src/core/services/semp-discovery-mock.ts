import type { SempContext } from '../connections/types';
import type { FetchPage } from './semp-discovery';

/**
 * Mock SEMP Discovery factory.
 * Returns hardcoded VPN and queue lists in a single page (no pagination needed).
 * Matches the real factory's signature so the mock-redirect plugin can swap
 * it in transparently. The SempContext parameter is accepted but ignored —
 * the mock always returns the same canned data regardless of which broker
 * was asked.
 */
export function createSempDiscovery(_sempCtx: SempContext) {

    async function* fetchVpns(_maxCount = 100): AsyncGenerator<FetchPage> {
        yield {
            ok: true,
            data: ['default', 'vpn-dev', 'vpn-prod', 'vpn-test-1', 'vpn-test-2', 'vpn-finance']
        };
    }

    async function* fetchQueues(_vpnName: string, _maxCount = 100): AsyncGenerator<FetchPage> {
        yield {
            ok: true,
            data: ['test-queue-1', 'test-queue-2', 'Q/ORDER/NEW', 'Q/ORDER/PROCESS', 'Q/LOGS/AUDIT']
        };
    }

    return { fetchVpns, fetchQueues };
}
