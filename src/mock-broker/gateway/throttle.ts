/**
 * The sign-in throttle (go-web-proxy/throttle.go), for the demo's single
 * client. Failures count per account and, unless `login.perClient` is off, for
 * the client; a sign-in waits for the larger block of the two. After
 * `login.maxFailures` failures an account blocks (the client after
 * `login.clientMaxFailures`) for `login.backoffSeconds`, doubling with each
 * further failure up to `login.maxBackoffSeconds`. A success clears that
 * account's count and nothing else: the client's count ages out. A count with
 * no new failure for `login.resetMinutes` starts again.
 *
 * Beside it, the two request limits: the client's budget for requests without
 * a session (`createRequestBudget`, `login.unauthenticatedPerMinute`) and each
 * user's connect window (`createConnectWindow`, `session.connectsPerMinute`).
 * Both start empty on a restart, as in a new process, and are not carried
 * across a page reload.
 *
 * Not simulated: the cap on tracked keys (one client cannot fill the table),
 * and the sign-in pages' share of the request budget (the gateway charges them
 * too; the budget here is charged by `/managed/*` alone).
 *
 * Mock-only.
 */

export interface LoginLimits {
    maxFailures: number;
    backoffSeconds: number;
    maxBackoffSeconds: number;
    perClient: boolean;
    clientMaxFailures: number;
    resetMinutes: number;
}

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

    /** recordFailure: a stale count starts again; at `limit` the key blocks. */
    function record(prev: Failures | null | undefined, l: LoginLimits, limit: number, t: number): Failures {
        const resetMs = l.resetMinutes * 60_000;
        const stale = prev && t >= prev.blockedUntil && t - prev.last > resetMs;
        const f: Failures = prev && !stale ? { ...prev } : { count: 0, blockedUntil: prev?.blockedUntil ?? 0, last: 0 };
        f.count++;
        f.last = t;
        if (f.count < limit) return f;
        let backoff = l.backoffSeconds * 1000;
        for (let i = limit; i < f.count && backoff < l.maxBackoffSeconds * 1000; i++) backoff *= 2;
        f.blockedUntil = t + Math.min(backoff, l.maxBackoffSeconds * 1000);
        return f;
    }

    return {
        /** How long a sign-in for `user` must wait, in ms; 0 when it may go ahead. */
        wait(user: string): number {
            const t = now();
            const byUser = waitOf(users.get(userKey(user)), t);
            return limits().perClient ? Math.max(byUser, waitOf(client, t)) : byUser;
        },
        failed(user: string): void {
            const l = limits();
            const t = now();
            const k = userKey(user);
            users.set(k, record(users.get(k), l, l.maxFailures, t));
            if (l.perClient) client = record(client, l, l.clientMaxFailures, t);
        },
        /** loginSucceeded: this account's count; the client's is left to age out. */
        succeeded(user: string): void {
            users.delete(userKey(user));
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

/**
 * The client's budget for requests without a session (allowUnauthenticated in
 * throttle.go): a bucket of `perMinute()` tokens, refilled evenly over the
 * minute and full at first. Each request without a session takes one; an empty
 * bucket is a 429 that waits for the next token. The limit is read at each
 * request, so a changed setting applies at once.
 */
export function createRequestBudget(perMinute: () => number, now: () => number) {
    let bucket: { tokens: number; last: number } | null = null;
    return {
        /** Takes one token: 0, or the ms until the next one when the bucket is empty. */
        take(): number {
            const t = now();
            const capacity = perMinute();
            const perMs = capacity / 60_000;
            const b = bucket ?? { tokens: capacity, last: t };
            b.tokens = Math.min(capacity, b.tokens + (t - b.last) * perMs);
            b.last = t;
            bucket = b;
            if (b.tokens >= 1) {
                b.tokens--;
                return 0;
            }
            return (1 - b.tokens) / perMs;
        },
        clear(): void {
            bucket = null;
        },
    };
}

/** connectWindow in dial.go. */
const CONNECT_WINDOW_MS = 60_000;

/**
 * The connect window (rateWindow in dial.go): `perMinute()` connects per user
 * in each minute from the first. Dial and the SMF socket share it, so a
 * reconnect loop cannot open sockets faster than it could fetch passwords. The
 * limit is read at each connect, so a changed setting applies at once.
 */
export function createConnectWindow(perMinute: () => number, now: () => number) {
    let byUser = new Map<string, { start: number; n: number }>();
    return {
        /** Counts one connect for `user`: 0, or the ms until their window starts again. */
        take(user: string): number {
            const t = now();
            const prev = byUser.get(user);
            const c = prev && t - prev.start < CONNECT_WINDOW_MS ? prev : { start: t, n: 0 };
            if (c.n >= perMinute()) return c.start + CONNECT_WINDOW_MS - t;
            c.n++;
            byUser.set(user, c);
            return 0;
        },
        clear(): void {
            byUser = new Map();
        },
    };
}

export type ConnectWindow = ReturnType<typeof createConnectWindow>;
