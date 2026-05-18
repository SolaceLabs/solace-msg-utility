import { createSempDiscovery, type FetchPage } from '../../core/services/semp-discovery';
import { primarySempContextFrom } from '../../core/services/sempContext';
import type { AppContext } from '../../core/types';

// Re-export so existing consumers (the queue-discovery module + its tests)
// can keep their `import { FetchPage } from './service'` paths unchanged.
export type { FetchPage };

/**
 * Queue Discovery SEMP service — thin wrapper around the lifted core
 * `createSempDiscovery`, scoped to the primary SEMP connection.
 *
 * Guards calls before SEMP is connected by yielding a single
 * "SEMP Not Connected" error page (preserving the contract the
 * queue-discovery module's UI relies on); the underlying core service
 * presumes a valid SempContext.
 */
export function createService(ctx: AppContext) {

    async function* fetchVpns(maxCount = 100): AsyncGenerator<FetchPage> {
        const sempCtx = primarySempContextFrom(ctx);
        if (!sempCtx) {
            yield { ok: false, error: 'SEMP Not Connected' };
            return;
        }
        yield* createSempDiscovery(sempCtx).fetchVpns(maxCount);
    }

    async function* fetchQueues(vpnName: string, maxCount = 100): AsyncGenerator<FetchPage> {
        const sempCtx = primarySempContextFrom(ctx);
        if (!sempCtx) {
            yield { ok: false, error: 'SEMP Not Connected' };
            return;
        }
        yield* createSempDiscovery(sempCtx).fetchQueues(vpnName, maxCount);
    }

    return { fetchVpns, fetchQueues };
}
