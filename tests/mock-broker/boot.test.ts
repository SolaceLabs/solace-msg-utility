import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { boot } from '../../src/mock-broker/boot';

/**
 * Regression cover for the race that made the demo fail with the real SDK's
 * "Profile binding not initialized. Call solace.SolclientFactory.init".
 *
 * `dist/solclient.js` sits beside `mock.html`, so the shell's vendor loader
 * fetches it. The bundle is a deferred module and normally runs first, then the
 * real SDK lands and reassigns `window.solace` — leaving the app driving a real
 * factory it never initialised, because it had initialised ours.
 */
let realFetch: typeof window.fetch;

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
});

afterEach(() => {
    window.fetch = realFetch;
    // boot() defines `solace` as a configurable accessor; hand the global back to
    // the suite's own SDK mock so later tests are unaffected.
    delete (window as any).solace;
});

describe('mock-broker/boot — the vendor race', () => {
    it('keeps the emulator installed when the real SDK loads afterwards', () => {
        boot();
        const emulator = (window as any).solace;
        expect(emulator.Version.version).toBe('10.99.0-mock');

        // Exactly what solclient.js does when it finishes loading.
        (window as any).solace = { SolclientFactory: { init: () => {} }, Version: { version: '10.25.0' } };

        expect((window as any).solace).toBe(emulator);
        expect((window as any).solace.Version.version).toBe('10.99.0-mock');
    });

    it('resists a UMD bundle that augments the global instead of replacing it', () => {
        boot();
        const emulator = (window as any).solace;
        const ourFactory = emulator.SolclientFactory;

        // A frozen object drops these writes rather than grafting the real
        // factory onto ours, which would resurrect the same failure.
        try {
            (window as any).solace.SolclientFactory = { init: () => {} };
            (window as any).solace.somethingNew = 1;
        } catch {
            /* strict-mode callers throw instead; either outcome is fine */
        }

        expect(emulator.SolclientFactory).toBe(ourFactory);
        expect((window as any).solace.somethingNew).toBeUndefined();
    });

    it('satisfies the shell version gate so connecting is not refused', () => {
        boot();
        // solace-client.ts refuses to open a session unless this is set, and the
        // shell only sets it when a real SDK clears the version floor.
        expect((window as any).solaceLibLoaded).toBe(true);
    });

    it('removes the missing-vendor banner so a later onerror cannot resurrect it', () => {
        const banner = document.createElement('div');
        banner.id = 'missing-lib-banner';
        document.body.appendChild(banner);

        boot();

        // Hiding it would not survive the loader's onerror calling showBanner
        // again; showBanner no-ops only when the element is gone.
        expect(document.getElementById('missing-lib-banner')).toBeNull();
    });

    it('installs the HTTP interceptor, so /hosted answers without a gateway', async () => {
        boot();
        const body = await (await fetch('/hosted')).json();
        expect(body.hosted).toBe(true);
    });

    it('mounts the demo control panel', () => {
        boot();
        expect(document.getElementById('mock-controls')).not.toBeNull();
    });
});
