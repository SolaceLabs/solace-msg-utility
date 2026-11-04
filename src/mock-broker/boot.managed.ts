/**
 * The managed demo's entry point (`managed-demo.html`). Redirected in for
 * `src/core/boot.ts` by `mockRedirects` in vite.config.ts for the
 * `managed-demo` variant only, so mock.html never carries what this adds.
 *
 * It must not reach a network: a request nobody answers is refused, never
 * passed to the real `fetch`, which this file never references.
 *
 * Mock-only.
 */
import './controls/styles.css';
import { installMockServer } from './server';
import { mountControlPanel } from './controls/panel';
import { seed } from './broker/store';
import { installSdk, removeVendorBanner, whenReady } from './shell';

/** The refusal's message; `check-bundles.mjs` requires it in the demo bundle. */
export const NETWORK_DISABLED = 'demo: network disabled';

/** The passthrough: whatever the demo does not answer fails like a dead network. */
export function refuseNetwork(): Promise<Response> {
    return Promise.reject(new TypeError(NETWORK_DISABLED));
}

export function boot(): void {
    seed();
    installSdk();
    installMockServer({ passthrough: refuseNetwork });

    whenReady(() => {
        removeVendorBanner();
        mountControlPanel();
    });
}
