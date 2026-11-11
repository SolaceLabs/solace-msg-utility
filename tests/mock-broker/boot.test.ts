import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readSource } from '../helpers/sources';
import { boot } from '../../src/mock-broker/boot';
import { NETWORK_DISABLED } from '../../src/mock-broker/network';
import { DIRECT_BANNER } from '../../src/mock-broker/controls/panel';
import { scenario } from '../../src/mock-broker/fixtures';

/**
 * Regression cover for the race that made the demo fail with the real SDK's
 * "Profile binding not initialized. Call solace.SolclientFactory.init".
 *
 * `dist/solclient.js` sits beside `demo.html`, so the shell's vendor loader
 * fetches it. The bundle is a deferred module and normally runs first, then the
 * real SDK lands and reassigns `window.solace` — leaving the app driving a real
 * factory it never initialised, because it had initialised ours.
 */
let realFetch: typeof window.fetch;
const saved = {
    WebSocket: window.WebSocket,
    EventSource: (window as any).EventSource,
    open: XMLHttpRequest.prototype.open,
};

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
    sessionStorage.clear();
});

afterEach(() => {
    window.fetch = realFetch;
    // boot() defines `solace` as a configurable accessor; hand the global back to
    // the suite's own SDK mock so later tests are unaffected.
    delete (window as any).solace;
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: saved.WebSocket });
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: saved.EventSource });
    XMLHttpRequest.prototype.open = saved.open;
    delete (navigator as any).sendBeacon;
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
        // ... and a Connect never defers waiting for a loader that does not run here.
        expect((window as any).solaceLibState).toBe('loaded');
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

    // The shell's real loader runs first (it is in <head>), then boot() removes the banner;
    // whatever the loader does afterwards must find no banner and throw nothing.
    function bootAfterLoader(): HTMLScriptElement[] {
        vi.useFakeTimers();
        const loader = readSource('src/index.html').match(/<!-- Solace Library Loader -->\s*<script>([\s\S]*?)<\/script>/)![1];
        const appended: HTMLScriptElement[] = [];
        vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
            appended.push(node as HTMLScriptElement);
            return node;
        }) as typeof document.head.appendChild);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const banner = document.createElement('div');
        banner.id = 'missing-lib-banner';
        document.body.appendChild(banner);
        new Function(loader)();
        boot();
        return appended;
    }

    it('keeps the banner gone, and throws nothing, when solclient.js turns out to be absent after boot', () => {
        const appended = bootAfterLoader();
        const fail = (src: string) => (appended.find((x) => x.getAttribute('src') === src)!.onerror as unknown as () => void)();

        expect(() => { fail('solclient.js'); fail('js/solclient.js'); }).not.toThrow();

        expect(document.getElementById('missing-lib-banner')).toBeNull();
    });

    it('keeps the banner gone, and throws nothing, when the loader hears nothing and its watchdog fires', () => {
        bootAfterLoader();

        expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();

        expect(document.getElementById('missing-lib-banner')).toBeNull();
    });

    it('installs the HTTP interceptor, so /hosted answers without a gateway', async () => {
        boot();
        const body = await (await fetch('/hosted')).json();
        expect(body.hosted).toBe(true);
    });

    it('mounts the demo control panel, open on the tab\'s first load and saying nothing leaves the page', () => {
        boot();
        const panel = document.getElementById('mock-controls')!;
        expect(panel.classList.contains('mockctl-open')).toBe(true);
        expect(panel.querySelector('.mockctl-banner')!.textContent).toBe(DIRECT_BANNER);
    });
});

// Like the managed demo (tests/mock-broker/boot.managed.test.ts), demo.html
// must never reach a network, whatever host is typed into the Direct form.
describe('mock-broker/boot -- no network', () => {
    it('refuses a request the demo does not answer, without calling the fetch it replaced', async () => {
        let replaced = 0;
        window.fetch = (() => { replaced++; return Promise.resolve(new Response('real')); }) as typeof window.fetch;
        boot();

        await expect(fetch('https://example.com/anything')).rejects.toThrow(NETWORK_DISABLED);
        expect(replaced).toBe(0);
    });

    it('refuses SEMP to a real broker, and answers the demo host', async () => {
        boot();
        scenario.latencyMs = 0;
        const v2 = '/SEMP/v2/monitor/msgVpns';
        await expect(fetch(`http:///https/943/prod-broker.example.com${v2}`)).rejects.toThrow(NETWORK_DISABLED);
        expect((await fetch(`http:///https/943/broker.solace.com${v2}`)).status).toBe(200);
    });

    it('makes every other way to send something throw', () => {
        boot();
        expect(() => new (window as any).WebSocket('wss://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => new (window as any).EventSource('https://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => new XMLHttpRequest().open('GET', 'https://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => navigator.sendBeacon('https://example.com', 'x')).toThrow(NETWORK_DISABLED);
    });
});
