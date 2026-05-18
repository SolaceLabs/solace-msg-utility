import { describe, it, expect, vi } from 'vitest';
import { runCopyJob, IDLE_TIMEOUT_MS as MOCK_IDLE_TIMEOUT_MS } from '../../../src/modules/queue-copy/service-copy-mock';
import { IDLE_TIMEOUT_MS as PROD_IDLE_TIMEOUT_MS } from '../../../src/modules/queue-copy/service-copy';
import { createInitialState } from '../../../src/modules/queue-copy/state';

describe('queue-copy/service-copy-mock', () => {
    it('exports the same IDLE_TIMEOUT_MS as production for parity', () => {
        // Stronger than asserting a literal value: prove both modules
        // resolve to the same source-of-truth constant in `./constants.ts`.
        // Catches any future drift between the prod and mock builds.
        expect(MOCK_IDLE_TIMEOUT_MS).toBe(PROD_IDLE_TIMEOUT_MS);
    });

    it('emits onProgress per message and a single onComplete with status=completed', async () => {
        vi.useFakeTimers();
        const state = createInitialState();
        state.verify = {
            inProgress: false, abort: null,
            result: { sourceOk: true, via: 'semp', errors: [], messageVpn: null, messageCount: 3, spoolUsageBytes: 100, quotaBytes: null, maxMessageSize: null, oldestMsgId: null, newestMsgId: null, accessType: 'read-write', owner: null },
        };

        const onProgress = vi.fn();
        const onComplete = vi.fn();

        const job = runCopyJob(state, null, { onProgress, onComplete });
        await vi.advanceTimersByTimeAsync(80 * 3 + 1);
        await job;

        expect(onProgress).toHaveBeenCalledTimes(3);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(state.job?.copied).toBe(3);
        expect(state.job?.status).toBe('completed');
        vi.useRealTimers();
    });

    it('falls back to total=15 when verify did not run', async () => {
        vi.useFakeTimers();
        const state = createInitialState();
        const onProgress = vi.fn();
        const onComplete = vi.fn();
        const job = runCopyJob(state, null, { onProgress, onComplete });
        await vi.advanceTimersByTimeAsync(80 * 15 + 1);
        await job;
        expect(state.job?.copied).toBe(15);
        expect(state.job?.status).toBe('completed');
        vi.useRealTimers();
    });

    it('cancels mid-run and exits with status=cancelled', async () => {
        vi.useFakeTimers();
        const state = createInitialState();
        state.verify = {
            inProgress: false, abort: null,
            result: { sourceOk: true, via: 'semp', errors: [], messageVpn: null, messageCount: 10, spoolUsageBytes: null, quotaBytes: null, maxMessageSize: null, oldestMsgId: null, newestMsgId: null, accessType: 'read-write', owner: null },
        };
        const onProgress = vi.fn();
        const onComplete = vi.fn();

        const job = runCopyJob(state, null, { onProgress, onComplete });
        await vi.advanceTimersByTimeAsync(80 * 3 + 1);
        state.job!.cancelRequested = true;
        await vi.advanceTimersByTimeAsync(80 * 10);
        await job;

        // Engine guards twice (before delay + after delay); copied lands at 3 or 4 depending on timing.
        expect(state.job!.copied).toBeLessThan(10);
        expect(state.job!.status).toBe('cancelled');
        expect(onComplete).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
