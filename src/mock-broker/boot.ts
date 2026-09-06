/**
 * Demo entry point. Redirected in for `src/core/boot.ts` when Vite builds with
 * `--mode mock`, so production never imports anything in this tree.
 *
 * Installing the SDK ourselves means the demo no longer needs `solclient.js`
 * beside the HTML: we satisfy the shell's vendor loader directly, including the
 * version gate it now enforces.
 *
 * Mock-only.
 */
import './controls/styles.css';
import { buildSolaceSdk } from './sdk';
import { installMockServer } from './server';
import { mountControlPanel } from './controls/panel';
import { seed } from './broker/store';

/**
 * Install the emulator as `window.solace`, in a way the real SDK cannot undo.
 *
 * The shell's vendor loader races us. It appends `solclient.js` from `<head>`
 * while the bundle is a deferred module, so `boot()` normally runs first — and
 * then the real SDK lands and **reassigns `window.solace`**. The app had already
 * initialised our factory (a no-op), so the next `createSession` ran against the
 * real, uninitialised factory and failed with *"Profile binding not initialized.
 * Call solace.SolclientFactory.init"*.
 *
 * A plain assignment cannot win that race in either order, so install through an
 * accessor whose setter ignores writes. The object is frozen too: some UMD
 * bundles augment an existing global rather than replacing it, which would
 * otherwise graft the real `SolclientFactory` onto ours.
 */
function installSdk(): void {
    const sdk = buildSolaceSdk();
    Object.freeze(sdk.SolclientFactory);
    Object.freeze(sdk);

    Object.defineProperty(window, 'solace', {
        configurable: true,
        get: () => sdk,
        set: () => { /* ignore the vendor script — the emulator owns this global */ },
    });

    (window as any).solaceLibLoaded = true;
    window.dispatchEvent(new CustomEvent('Solclient:loaded'));
}

/**
 * Remove the shell's missing-vendor banner outright rather than hiding it.
 * Hiding is not enough: if `solclient.js` is absent the loader's `onerror` fires
 * *after* boot and calls `showBanner` again. `showBanner` no-ops when the
 * element is gone, so removal is what actually holds.
 */
function removeVendorBanner(): void {
    document.getElementById('missing-lib-banner')?.remove();
}

export function boot(): void {
    seed();
    installSdk();
    installMockServer();

    // Both touch the document, which may not be parsed yet when the bundle
    // executes from <head>.
    const onReady = () => {
        removeVendorBanner();
        mountControlPanel();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
}
