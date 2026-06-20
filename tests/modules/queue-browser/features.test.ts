import { describe, it, expect, vi, afterEach } from 'vitest';
import { showPayload } from '../../../src/modules/queue-browser/features';

describe('queue-browser/features', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('showPayload()', () => {
        it('defaults to true when VITE_SHOW_PAYLOAD is unset', () => {
            expect(showPayload()).toBe(true);
        });

        it('returns false only for the exact string "false"', () => {
            vi.stubEnv('VITE_SHOW_PAYLOAD', 'false');
            expect(showPayload()).toBe(false);
        });

        it('returns true for any value other than "false"', () => {
            vi.stubEnv('VITE_SHOW_PAYLOAD', 'true');
            expect(showPayload()).toBe(true);
        });
    });
});
