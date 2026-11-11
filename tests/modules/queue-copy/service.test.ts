import { describe, it, expect } from 'vitest';
import { getOriginalIdHint, destNameProblem } from '../../../src/modules/queue-copy/service';
import { createMessageMock } from '../../setup';

/**
 * queue-copy/service.ts hosts small pure helpers (`getOriginalIdHint`,
 * `destNameProblem`) -- the publish-with-ACK pipeline lives in
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

/**
 * The SDK throws while addressing a name it refuses (createTopicDestination /
 * createDurableQueueDestination); the form runs the same checks first.
 */
describe('queue-copy/service.destNameProblem', () => {
    it('accepts ordinary names, wildcards that end a level and a trailing ">"', () => {
        expect(destNameProblem('queue', 'orders.in')).toBeNull();
        expect(destNameProblem('topic', 'orders/created/eu')).toBeNull();
        expect(destNameProblem('topic', 'orders/*/eu')).toBeNull();
        expect(destNameProblem('topic', 'orders/ab*')).toBeNull();
        expect(destNameProblem('topic', 'orders/>')).toBeNull();
    });

    it('refuses an empty level: a leading, trailing or doubled "/"', () => {
        expect(destNameProblem('topic', '/orders')).toMatch(/Empty level at character 1/);
        expect(destNameProblem('topic', 'orders/')).toMatch(/Empty level at character 7/);
        expect(destNameProblem('queue', 'a//b')).toMatch(/Empty level at character 3/);
    });

    it('refuses a "*" that does not end its level', () => {
        expect(destNameProblem('topic', 'ord*ers/x')).toBe('"*" at character 4 may only end a level.');
    });

    it('caps a topic at 250 bytes and a queue at 241, the SDK prefix taking the rest', () => {
        expect(destNameProblem('topic', 't'.repeat(250))).toBeNull();
        expect(destNameProblem('topic', 't'.repeat(251))).toBe('Too long: at most 250 bytes.');
        expect(destNameProblem('queue', 'q'.repeat(241))).toBeNull();
        expect(destNameProblem('queue', 'q'.repeat(242))).toBe('Too long: at most 241 bytes.');
    });

    it('counts encoded bytes, not characters', () => {
        // 121 two-byte characters: 242 bytes, over the queue limit.
        expect(destNameProblem('queue', '\u00e9'.repeat(121))).toMatch(/Too long/);
    });

    it('refuses the prefixes the SDK reserves', () => {
        expect(destNameProblem('queue', '#P2P/QUE/x')).toBe('"#P2P/QUE/" is a reserved prefix.');
        expect(destNameProblem('topic', '#P2P/QTMP/x')).toBe('"#P2P/QTMP/" is a reserved prefix.');
    });
});
