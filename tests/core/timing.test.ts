import { describe, it, expect, vi } from 'vitest';
import { deadlineSignal, isTimeoutError, raceDeadline, REQUEST_TIMEOUT_MS } from '../../src/core/timing';

describe('core/timing deadlineSignal', () => {
    it('times out after REQUEST_TIMEOUT_MS by default, and after the given ms otherwise', () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        deadlineSignal();
        deadlineSignal(null, 5);
        expect(timeout.mock.calls).toEqual([[REQUEST_TIMEOUT_MS], [5]]);
    });

    it("aborts with the caller's reason when the caller's signal aborts first", () => {
        const caller = new AbortController();
        const signal = deadlineSignal(caller.signal);
        expect(signal.aborted).toBe(false);
        caller.abort(new Error('cancelled'));
        expect(signal.aborted).toBe(true);
        expect((signal.reason as Error).message).toBe('cancelled');
    });

    it('aborts with a TimeoutError when the deadline passes', async () => {
        const signal = deadlineSignal(new AbortController().signal, 1);
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve()));
        expect(isTimeoutError(signal.reason)).toBe(true);
    });
});

describe('core/timing raceDeadline', () => {
    it('settles with the promise when it settles in time', async () => {
        await expect(raceDeadline(Promise.resolve('answer'))).resolves.toBe('answer');
        await expect(raceDeadline(Promise.reject(new Error('refused')), 50)).rejects.toThrow('refused');
    });

    it('rejects with a TimeoutError naming the deadline when the promise does not settle', async () => {
        vi.useFakeTimers();
        const pending = raceDeadline(new Promise(() => { }));
        const outcome = expect(pending).rejects.toMatchObject({ name: 'TimeoutError', message: `No answer within ${REQUEST_TIMEOUT_MS / 1000} s.` });
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
        await outcome;
    });
});

describe('core/timing isTimeoutError', () => {
    it('tells a timeout from other failures', () => {
        expect(isTimeoutError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
        expect(isTimeoutError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(false);
        expect(isTimeoutError(new Error('Failed to fetch'))).toBe(false);
        expect(isTimeoutError(undefined)).toBe(false);
    });
});
