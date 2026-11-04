import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { boot, NETWORK_DISABLED } from '../../src/mock-broker/boot.managed';

/**
 * The managed demo's boot. It shares the shell work with mock.html's boot
 * (tests/mock-broker/boot.test.ts covers the vendor race) but must never reach
 * a network: whatever the demo does not answer is refused, and the fetch it
 * replaced is never called.
 */
let realFetch: typeof window.fetch;

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
});

afterEach(() => {
    window.fetch = realFetch;
    delete (window as any).solace;
});

describe('mock-broker/boot.managed', () => {
    it('installs the emulator, the interceptor and the control panel', async () => {
        boot();

        expect((window as any).solace.Version.version).toBe('10.99.0-mock');
        expect((await (await fetch('/hosted')).json()).hosted).toBe(true);
        expect(document.getElementById('mock-controls')).not.toBeNull();
    });

    it('refuses a request the demo does not answer, without calling the replaced fetch', async () => {
        let reached = 0;
        window.fetch = (() => { reached++; return Promise.resolve(new Response('real')); }) as typeof window.fetch;

        boot();

        await expect(fetch('https://example.com/anything')).rejects.toThrow(NETWORK_DISABLED);
        await expect(fetch('/not-the-demo')).rejects.toBeInstanceOf(TypeError);
        expect(reached).toBe(0);
    });
});
