/**
 * Demo entry point. Redirected in for `src/core/boot.ts` when Vite builds with
 * `--mode mock`, so production never imports anything in this tree. The
 * managed demo has its own (`boot.managed.ts`; `mockRedirects` in
 * vite.config.ts picks by variant).
 *
 * Installing the SDK ourselves means the demo no longer needs `solclient.js`
 * beside the HTML: we satisfy the shell's vendor loader directly, including the
 * version gate it now enforces.
 *
 * Mock-only.
 */
import './controls/styles.css';
import { installMockServer } from './server';
import { mountControlPanel } from './controls/panel';
import { seed } from './broker/store';
import { installSdk, removeVendorBanner, whenReady } from './shell';

export function boot(): void {
    seed();
    installSdk();
    // mock.html leaves what it does not answer to the real fetch.
    installMockServer({ passthrough: window.fetch.bind(window) });

    // Both touch the document, which may not be parsed yet when the bundle
    // executes from <head>.
    whenReady(() => {
        removeVendorBanner();
        mountControlPanel();
    });
}
