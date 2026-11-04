/**
 * The sign-in throttle (go-web-proxy/throttle.go), for the demo's single
 * client. The gateway counts failures per user and per client and waits for
 * the larger block; with one client the client's count is the larger, so one
 * counter is the same rule. After `login.maxFailures` failures it blocks for
 * `login.backoffSeconds`, doubling with each further failure up to
 * `login.maxBackoffSeconds`; a success clears it.
 *
 * Mock-only.
 */

export interface LoginLimits { maxFailures: number; backoffSeconds: number; maxBackoffSeconds: number }

export interface ThrottleState { count: number; blockedUntil: number }

/** retrySeconds: whole seconds, at least one. */
export function retrySeconds(ms: number): number {
    return Math.max(Math.ceil(ms / 1000), 1);
}

export function throttledText(ms: number): string {
    return `Too many attempts. Try again in ${retrySeconds(ms)} seconds.`;
}

export function createThrottle(limits: () => LoginLimits, now: () => number = () => Date.now()) {
    let state: ThrottleState = { count: 0, blockedUntil: 0 };

    return {
        /** How long a sign-in must wait, in ms; 0 when it may go ahead. */
        wait(): number {
            return Math.max(state.blockedUntil - now(), 0);
        },
        failed(): void {
            const l = limits();
            state.count++;
            if (state.count < l.maxFailures) return;
            let backoff = l.backoffSeconds * 1000;
            for (let i = l.maxFailures; i < state.count && backoff < l.maxBackoffSeconds * 1000; i++) backoff *= 2;
            state.blockedUntil = now() + Math.min(backoff, l.maxBackoffSeconds * 1000);
        },
        /** A success, or the control panel's "clear the lockout". */
        clear(): void {
            state = { count: 0, blockedUntil: 0 };
        },
        dump: (): ThrottleState => ({ ...state }),
        load(s: ThrottleState): void {
            state = { ...s };
        },
    };
}
