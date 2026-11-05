/**
 * The sign-in throttle (go-web-proxy/throttle.go), for the demo's single
 * client. Failures count per user and for the client; a sign-in waits for the
 * larger block of the two. After `login.maxFailures` failures a key blocks for
 * `login.backoffSeconds`, doubling with each further failure up to
 * `login.maxBackoffSeconds`. A success clears that user's count and the
 * client's, and no other user's; a count quiet for longer than the longest
 * back-off starts again.
 *
 * Not simulated: the cap on tracked keys (one client cannot fill the table).
 *
 * Mock-only.
 */

export interface LoginLimits { maxFailures: number; backoffSeconds: number; maxBackoffSeconds: number }

interface Failures { count: number; blockedUntil: number; last: number }

export interface ThrottleState { users: [string, Failures][]; client: Failures | null }

/** retrySeconds: whole seconds, at least one. */
export function retrySeconds(ms: number): number {
    return Math.max(Math.ceil(ms / 1000), 1);
}

export function throttledText(ms: number): string {
    return `Too many attempts. Try again in ${retrySeconds(ms)} seconds.`;
}

/** userKey: the first 64 bytes of the typed name, as Go slices the string. */
function userKey(user: string): string {
    return String.fromCharCode(...new TextEncoder().encode(user).slice(0, 64));
}

export function createThrottle(limits: () => LoginLimits, now: () => number = () => Date.now()) {
    let users = new Map<string, Failures>();
    let client: Failures | null = null;

    const waitOf = (f: Failures | null | undefined, t: number) => (f ? Math.max(f.blockedUntil - t, 0) : 0);

    /** recordFailure: a stale count starts again; at the limit the key blocks. */
    function record(prev: Failures | null | undefined, l: LoginLimits, t: number): Failures {
        const stale = prev && t >= prev.blockedUntil && t - prev.last > l.maxBackoffSeconds * 1000;
        const f: Failures = prev && !stale ? { ...prev } : { count: 0, blockedUntil: prev?.blockedUntil ?? 0, last: 0 };
        f.count++;
        f.last = t;
        if (f.count < l.maxFailures) return f;
        let backoff = l.backoffSeconds * 1000;
        for (let i = l.maxFailures; i < f.count && backoff < l.maxBackoffSeconds * 1000; i++) backoff *= 2;
        f.blockedUntil = t + Math.min(backoff, l.maxBackoffSeconds * 1000);
        return f;
    }

    return {
        /** How long a sign-in for `user` must wait, in ms; 0 when it may go ahead. */
        wait(user: string): number {
            const t = now();
            return Math.max(waitOf(users.get(userKey(user)), t), waitOf(client, t));
        },
        failed(user: string): void {
            const l = limits();
            const t = now();
            const k = userKey(user);
            users.set(k, record(users.get(k), l, t));
            client = record(client, l, t);
        },
        /** loginSucceeded: this user's count and the client's. */
        succeeded(user: string): void {
            users.delete(userKey(user));
            client = null;
        },
        /** The control panel's "clear the lockout": every count. */
        clear(): void {
            users = new Map();
            client = null;
        },
        dump: (): ThrottleState => ({ users: Array.from(users, ([k, f]) => [k, { ...f }]), client: client && { ...client } }),
        load(s: ThrottleState): void {
            users = new Map(s.users.map(([k, f]) => [k, { ...f }]));
            client = s.client && { ...s.client };
        },
    };
}
