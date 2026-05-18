import type { VerifyResult } from './state';

// Re-export from ./constants so mock + production stay aligned.
export { ACCUMULATE_IDLE_MS } from './constants';
export type VerifyProgress = (count: number, sizeBytes: number) => void;

/**
 * Mock verifier for the demo bundle. Returns a canned "found" result with
 * deterministic numbers regardless of source queue name — the demo doesn't
 * have a real broker to query and the modal is the same shape either way.
 * The signal still aborts the in-flight delay so Cancel during verify
 * behaves as in production.
 */
export async function verifySource(input: {
    sempCtx: any;
    primarySession: any;
    vpn: string;
    queue: string;
    signal: AbortSignal;
    onProgress?: VerifyProgress;
}): Promise<VerifyResult> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            input.signal.removeEventListener('abort', onAbort);
            resolve({
                sourceOk: true,
                via: 'semp',
                errors: [],
                messageVpn: input.vpn || 'default',
                messageCount: 15,
                spoolUsageBytes: 3072,
                quotaBytes: 5_000 * 1024 * 1024,
                maxMessageSize: 10_000_000,
                oldestMsgId: '1000',
                // The newest-msg-id=0 broker bug (worked around in service-verify.ts
                // via a supplementary SEMP v1 call) only affects the real path.
                // The mock returns a deterministic non-zero value directly.
                newestMsgId: '1014',
                accessType: 'read-write',
                owner: '',
            });
        }, 400);

        const onAbort = () => {
            clearTimeout(timer);
            resolve({
                sourceOk: false,
                via: 'semp',
                errors: ['Verification cancelled.'],
                messageVpn: null,
                messageCount: null,
                spoolUsageBytes: null,
                quotaBytes: null,
                maxMessageSize: null,
                oldestMsgId: null,
                newestMsgId: null,
                accessType: null,
                owner: null,
            });
        };
        input.signal.addEventListener('abort', onAbort);
    });
}
