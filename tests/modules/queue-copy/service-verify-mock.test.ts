import { describe, it, expect, vi } from 'vitest';
import { verifySource } from '../../../src/modules/queue-copy/service-verify-mock';

describe('queue-copy/service-verify-mock', () => {
    it('resolves canned success after delay', async () => {
        vi.useFakeTimers();
        const promise = verifySource({
            sempCtx: null, primarySession: null,
            vpn: '', queue: 'q', signal: new AbortController().signal,
        });
        await vi.advanceTimersByTimeAsync(400);
        const result = await promise;
        expect(result.sourceOk).toBe(true);
        expect(result.messageCount).toBe(15);
        expect(result.spoolUsageBytes).toBe(3072);
        expect(result.quotaBytes).toBe(5_000 * 1024 * 1024);
        expect(result.maxMessageSize).toBe(10_000_000);
        vi.useRealTimers();
    });

    it('honors abort signal — resolves with cancelled', async () => {
        vi.useFakeTimers();
        const ctrl = new AbortController();
        const promise = verifySource({
            sempCtx: null, primarySession: null,
            vpn: '', queue: 'q', signal: ctrl.signal,
        });
        ctrl.abort();
        const result = await promise;
        expect(result.sourceOk).toBe(false);
        expect(result.errors).toContain('Verification cancelled.');
        vi.useRealTimers();
    });
});
