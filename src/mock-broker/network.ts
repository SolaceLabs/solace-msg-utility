/**
 * Both demos' network block. demo.html and provisioned-demo.html answer what the
 * app asks from the in-browser broker (and the managed demo's fake gateway);
 * nothing they do may leave the page, so a real broker or gateway is never
 * reached, whatever is typed into a form.
 *
 * `refuseNetwork` is the mock server's passthrough: a request the demo does
 * not answer fails like a dead network, and the real `fetch` is never
 * referenced. `blockNetworkApis` makes the other ways a page could send
 * something throw. The app uses none of them; the SDK emulator replaces the
 * one WebSocket user.
 *
 * Mock-only.
 */

/** The refusal's message; `check-bundles.mjs` requires it in both demo bundles and forbids it elsewhere. */
export const NETWORK_DISABLED = 'demo: network disabled';

/** The passthrough: whatever the demo does not answer fails like a dead network. */
export function refuseNetwork(): Promise<Response> {
    return Promise.reject(new TypeError(NETWORK_DISABLED));
}

/** The page APIs that could send something, made to throw. */
export function blockNetworkApis(): void {
    const refuse = function refused(): never {
        throw new TypeError(NETWORK_DISABLED);
    };
    for (const name of ['WebSocket', 'EventSource'] as const) {
        Object.defineProperty(window, name, { configurable: true, writable: true, value: refuse });
    }
    XMLHttpRequest.prototype.open = refuse;
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: refuse });
}
