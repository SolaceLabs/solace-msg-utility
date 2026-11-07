/**
 * Demo entry point (`mock.html`, the Direct demo). Redirected in for
 * `src/core/boot.ts` when Vite builds with `--mode mock`, so production never
 * imports anything in this tree. The managed demo has its own
 * (`boot.managed.ts`; `mockRedirects` in vite.config.ts picks by variant).
 *
 * Installing the SDK ourselves means the demo no longer needs `solclient.js`
 * beside the HTML: we satisfy the shell's vendor loader directly, including the
 * version gate it now enforces.
 *
 * It never reaches a network, like the managed demo: `./network` refuses a
 * request the mock server does not answer, and the server answers SEMP only for
 * the demo host, so a real broker typed into the form is refused, never
 * reached.
 *
 * Mock-only.
 */
import './controls/styles.css';
import { installMockServer } from './server';
import { mountControlPanel } from './controls/panel';
import { seed } from './broker/store';
import { blockNetworkApis, refuseNetwork } from './network';
import { installSdk, removeVendorBanner, whenReady } from './shell';

export function boot(): void {
    seed();
    installSdk();
    installMockServer({ passthrough: refuseNetwork });
    blockNetworkApis();

    // Both touch the document, which may not be parsed yet when the bundle
    // executes from <head>.
    whenReady(() => {
        removeVendorBanner();
        mountControlPanel();
    });
}
