/**
 * Keeps a gateway session from idling out while its user is at work.
 *
 * The gateway counts a session idle from its last request
 * (`session.idleMinutes`), and much of what a user does sends none: reading
 * messages over an open broker connection, typing, moving between pages. This
 * watches for the user's own input (a key, a click or a tap, the wheel) and
 * answers it with one small request, at most one every
 * KEEPALIVE_INTERVAL_MS: at once when the last one is older than that, else
 * when that time is up. Input is the only thing that sends one, so a session
 * nobody touches still idles out, and the session's absolute limit is the
 * gateway's alone.
 *
 * `createSessionActivity` is pure: the caller gives the target to watch, the
 * request and what to do when the gateway says the session has ended.
 * `keepSessionAlive` is that for a session owner (the connections module's
 * Provisioned panel, admin-login), over its `GET /managed/me`.
 */
import type { ManagedResult } from './managed-api';

/** The least time between two requests: half the shortest idle limit the gateway takes, one minute. */
export const KEEPALIVE_INTERVAL_MS = 30_000;

/** The user's own input. */
const INPUTS = ['keydown', 'pointerdown', 'wheel'] as const;

export interface SessionActivityOptions {
    /** Where the user's input is seen: the page's document. */
    target: EventTarget;
    /** The request that marks the session used. Resolves false when the gateway says no session stands. */
    ping: () => Promise<boolean>;
    /** The session ended under a user at work. Not called once `stop` has run. */
    onEnded: () => void;
}

export interface SessionActivity {
    /** A session began: answer input from now on. A second start changes nothing. */
    start(): void;
    /** The session ended: watch no more, and send nothing that was due. */
    stop(): void;
}

export function createSessionActivity({ target, ping, onEnded }: SessionActivityOptions): SessionActivity {
    let running = false;
    // When the last request went out; the request that began the session counts.
    let last = 0;
    let due: ReturnType<typeof setTimeout> | undefined;

    function send(): void {
        due = undefined;
        last = Date.now();
        void ping().then((stands) => {
            if (!stands && running) onEnded();
        });
    }

    function onInput(): void {
        if (due !== undefined) return; // a request is already due
        const wait = last + KEEPALIVE_INTERVAL_MS - Date.now();
        if (wait <= 0) send();
        else due = setTimeout(send, wait);
    }

    return {
        start() {
            if (running) return;
            running = true;
            last = Date.now();
            for (const type of INPUTS) target.addEventListener(type, onInput, { capture: true, passive: true });
        },
        stop() {
            if (!running) return;
            running = false;
            for (const type of INPUTS) target.removeEventListener(type, onInput, { capture: true });
            clearTimeout(due);
            due = undefined;
        },
    };
}

/**
 * The keep-alive of a session owner: `me` is its `GET /managed/me`, whose
 * answer is not used. When the gateway answers that nobody is signed in, the
 * owner's `onEnded` shows the ended session as it does after any request the
 * gateway refused. Any other failure is left to the next request the user
 * makes.
 */
export function keepSessionAlive(target: EventTarget, me: () => Promise<ManagedResult<unknown>>, onEnded: () => void): SessionActivity {
    return createSessionActivity({
        target,
        ping: async () => {
            const res = await me();
            return res.ok || res.code !== 'unauthenticated';
        },
        onEnded,
    });
}
