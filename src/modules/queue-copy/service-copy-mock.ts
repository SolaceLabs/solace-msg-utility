import type { QueueCopyState, CopyJob } from './state';

// Re-export the production tuning constant so any consumer probing the mock
// for parity (e.g. service-copy-mock.test.ts) sees the same value as the
// real engine. The previous standalone `IDLE_TIMEOUT_MS = 60_000` here had
// drifted from the production 30_000 in service-copy.ts.
export { IDLE_TIMEOUT_MS } from './constants';

export interface CopyHooks {
    onProgress: (job: CopyJob) => void;
    onComplete: (job: CopyJob) => void;
}

/**
 * Mock copy engine for the demo bundle. Runs through the verified message
 * count emitting onProgress every 80 ms, then onComplete with status set per
 * the run's final state. Honors `cancelRequested` so Cancel mid-run terminates
 * the loop. Does not touch any SDK objects — the demo bundle's mock Solace
 * session has no QueueBrowser.
 *
 * The hook surface matches the real engine in service-copy.ts so the modal's
 * call site type-checks against either implementation.
 */
export async function runCopyJob(
    state: QueueCopyState,
    _primarySession: any,
    hooks: CopyHooks,
): Promise<void> {
    const total = state.verify?.result?.messageCount ?? 15;
    state.job = {
        total,
        copied: 0,
        cancelRequested: false,
        lastError: null,
        status: 'running',
    };

    try {
        for (let i = 0; i < total; i++) {
            if (state.job.cancelRequested) break;
            await new Promise<void>((resolve) => setTimeout(resolve, 80));
            if (state.job.cancelRequested) break;
            state.job.copied++;
            hooks.onProgress(state.job);
        }
    } finally {
        state.job.status = state.job.cancelRequested ? 'cancelled' : 'completed';
        hooks.onComplete(state.job);
    }
}
