import { describe, it, expect } from 'vitest';
import { getOriginalIdHint } from '../../../src/modules/queue-copy/service';
import { createMessageMock } from '../../setup';

/**
 * After the May 2026 publisher lift, queue-copy/service.ts hosts only the
 * `getOriginalIdHint` helper — the publish-with-ACK pipeline now lives in
 * src/core/services/solace-publisher.ts and is exercised by
 * tests/core/services/solace-publisher.test.ts.
 */
describe('queue-copy/service.getOriginalIdHint', () => {
    it('prefers application message id', () => {
        const msg = createMessageMock();
        (msg.getApplicationMessageId as any).mockReturnValue('app-id');
        (msg.getGuaranteedMessageId as any).mockReturnValue('gm-id');
        expect(getOriginalIdHint(msg)).toBe('app-id');
    });

    it('falls back to guaranteed message id when app id missing', () => {
        const msg = createMessageMock();
        (msg.getApplicationMessageId as any).mockReturnValue(null);
        (msg.getGuaranteedMessageId as any).mockReturnValue('gm-99');
        expect(getOriginalIdHint(msg)).toBe('gm-99');
    });

    it('returns (no id) when neither getter yields a value', () => {
        const msg = createMessageMock();
        (msg.getApplicationMessageId as any).mockReturnValue(null);
        (msg.getGuaranteedMessageId as any).mockReturnValue(null);
        expect(getOriginalIdHint(msg)).toBe('(no id)');
    });

    it('coerces non-string ids to strings', () => {
        const msg = createMessageMock();
        (msg.getApplicationMessageId as any).mockReturnValue(12345);
        expect(getOriginalIdHint(msg)).toBe('12345');
    });

    it('handles missing getters (both return undefined)', () => {
        const msg: any = {};
        expect(getOriginalIdHint(msg)).toBe('(no id)');
    });
});
