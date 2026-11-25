// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createSessionActivity, keepSessionAlive, KEEPALIVE_INTERVAL_MS } from '../../../src/core/services/session-activity';

let target: EventTarget;
const input = (type = 'keydown') => target.dispatchEvent(new Event(type));
/** Let a request that was sent be answered. */
const answered = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('core/services/session-activity -- createSessionActivity', () => {
    function started(stands = true) {
        const ping = vi.fn(async () => stands);
        const onEnded = vi.fn();
        const activity = createSessionActivity({ target, ping, onEnded });
        activity.start();
        return { activity, ping, onEnded };
    }

    it('sends nothing while nobody touches the page, however long the session lasts', () => {
        const { ping } = started();
        vi.advanceTimersByTime(60 * 60_000);
        expect(ping).not.toHaveBeenCalled();
    });

    it('answers input at once when the last request is older than the interval', () => {
        const { ping } = started();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        expect(ping).toHaveBeenCalledTimes(1);
    });

    it('holds input inside the interval until the interval is up: the request that began the session counts as the last one', () => {
        const { ping } = started();
        vi.advanceTimersByTime(10_000);
        input();
        expect(ping).not.toHaveBeenCalled();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS - 10_000 - 1);
        expect(ping).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(ping).toHaveBeenCalledTimes(1);
    });

    it('sends one request for a burst of input, and the next one an interval later', () => {
        const { ping } = started();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        for (let i = 0; i < 20; i++) input();
        expect(ping).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        // The burst after the first request made one more due; with no input since, that is all.
        expect(ping).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(10 * KEEPALIVE_INTERVAL_MS);
        expect(ping).toHaveBeenCalledTimes(2);
    });

    it.each(['keydown', 'pointerdown', 'wheel'])('counts %s as the user at work', (type) => {
        const { ping } = started();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input(type);
        expect(ping).toHaveBeenCalledTimes(1);
    });

    it('does not count what happens without the user: a pointer that only moves, a timer, a message', () => {
        const { ping } = started();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        for (const type of ['pointermove', 'mousemove', 'message', 'load']) input(type);
        expect(ping).not.toHaveBeenCalled();
    });

    it('watches nothing before it starts, and starting twice is one start', () => {
        const ping = vi.fn(async () => true);
        const activity = createSessionActivity({ target, ping, onEnded: vi.fn() });
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        activity.stop(); // a stop before any start changes nothing
        expect(ping).not.toHaveBeenCalled();

        activity.start();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        activity.start(); // the session that began is the one that counts
        input();
        expect(ping).toHaveBeenCalledTimes(1);
    });

    it('stops with the session: no request that was due is sent, and later input sends none', () => {
        const { activity, ping } = started();
        vi.advanceTimersByTime(10_000);
        input();
        activity.stop();
        vi.advanceTimersByTime(10 * KEEPALIVE_INTERVAL_MS);
        input();
        expect(ping).not.toHaveBeenCalled();
    });

    it('says the session ended when the gateway answers that none stands', async () => {
        const { onEnded } = started(false);
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        await answered();
        expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('says nothing while the session stands, nor about an answer that arrives after the session was ended here', async () => {
        const standing = started(true);
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        await answered();
        expect(standing.onEnded).not.toHaveBeenCalled();
        standing.activity.stop();

        const signedOut = started(false);
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        signedOut.activity.stop(); // the user signed out while the request was on its way
        await answered();
        expect(signedOut.onEnded).not.toHaveBeenCalled();
    });
});

describe('core/services/session-activity -- keepSessionAlive', () => {
    async function pinged(answer: unknown) {
        const me = vi.fn(async () => answer as never);
        const onEnded = vi.fn();
        keepSessionAlive(target, me, onEnded).start();
        vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
        input();
        await answered();
        return { me, onEnded };
    }

    it('marks the session used with the owner\'s request, and leaves a standing session alone', async () => {
        const { me, onEnded } = await pinged({ ok: true, data: { username: 'alice' } });
        expect(me).toHaveBeenCalledTimes(1);
        expect(onEnded).not.toHaveBeenCalled();
    });

    it('tells the owner the session ended when the gateway answers that nobody is signed in', async () => {
        const { onEnded } = await pinged({ ok: false, status: 401, code: 'unauthenticated' });
        expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('leaves any other failure to the next request the user makes', async () => {
        const { onEnded } = await pinged({ ok: false, status: 0, code: 'network' });
        expect(onEnded).not.toHaveBeenCalled();
    });
});
