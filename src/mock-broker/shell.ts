/**
 * What both demo boots do to the shell: install the SDK emulator where the
 * real SDK cannot undo it, and clear the missing-vendor banner. Shared here,
 * not in `boot.ts`, so the managed demo's boot never imports demo.html's (and
 * its fall-through to the real `fetch`).
 *
 * Mock-only.
 */
import { buildSolaceSdk } from './sdk';

/**
 * Install the emulator as `window.solace`, in a way the real SDK cannot undo.
 *
 * The shell's vendor loader races us. It appends `solclient.js` from `<head>`
 * while the bundle is a deferred module, so `boot()` normally runs first -- and
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
export function installSdk(): void {
    const sdk = buildSolaceSdk();
    Object.freeze(sdk.SolclientFactory);
    Object.freeze(sdk);

    Object.defineProperty(window, 'solace', {
        configurable: true,
        get: () => sdk,
        set: () => { /* ignore the vendor script -- the emulator owns this global */ },
    });

    (window as any).solaceLibLoaded = true;
    (window as any).solaceLibState = 'loaded';
    window.dispatchEvent(new CustomEvent('Solclient:loaded'));
}

/**
 * Remove the shell's missing-vendor banner outright rather than hiding it.
 * Hiding is not enough: if `solclient.js` is absent the loader's `onerror` fires
 * *after* boot and calls `showBanner` again. `showBanner` no-ops when the
 * element is gone, so removal is what actually holds.
 */
export function removeVendorBanner(): void {
    document.getElementById('missing-lib-banner')?.remove();
}

/** Run once the document is parsed; the bundle may execute from `<head>`. */
export function whenReady(fn: () => void): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn);
    } else {
        fn();
    }
}
