import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot, NETWORK_DISABLED, SNAPSHOT_KEY } from '../../src/mock-broker/boot.managed';
import { getQueue, removeMessage } from '../../src/mock-broker/broker/store';
import { BROKERS, resetScenario, scenario, setBrokers } from '../../src/mock-broker/fixtures';
import { setSocketGate } from '../../src/mock-broker/sdk/session';

/**
 * The managed demo's boot. It shares the shell work with mock.html's boot
 * (tests/mock-broker/boot.test.ts covers the vendor race) but must never reach
 * a network, starts on the gateway's sign-in while connModes is managed, and
 * carries everything across the reloads a sign-in causes.
 */
let realFetch: typeof window.fetch;
let reloads: number;
let demos: ReturnType<typeof boot>[];
const saved = {
    WebSocket: window.WebSocket,
    EventSource: (window as any).EventSource,
    open: XMLHttpRequest.prototype.open,
};

beforeEach(() => {
    realFetch = window.fetch;
    document.body.innerHTML = '';
    sessionStorage.clear();
    resetScenario();
    reloads = 0;
    demos = [];
});

afterEach(() => {
    demos.forEach(d => d.dispose());
    window.fetch = realFetch;
    delete (window as any).solace;
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: saved.WebSocket });
    Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: saved.EventSource });
    XMLHttpRequest.prototype.open = saved.open;
    delete (navigator as any).sendBeacon;
    setSocketGate(null);
    setBrokers({});
    vi.restoreAllMocks();
});

const start = () => {
    const demo = boot({ reload: () => { reloads++; } });
    demos.push(demo);
    scenario.latencyMs = 0;
    return demo;
};
const layerTitle = () => document.querySelector('.mgw-page h1')?.textContent ?? null;

function signInThroughThePage(username: string, password: string): void {
    (document.querySelector('#mgw-username') as HTMLInputElement).value = username;
    (document.querySelector('#mgw-password') as HTMLInputElement).value = password;
    document.querySelector('.mgw-page form')!.dispatchEvent(new Event('submit', { cancelable: true }));
}

describe('mock-broker/boot.managed -- what it installs', () => {
    it('installs the emulator, the fake gateway, the demo brokers and the control panel', async () => {
        start();

        expect((window as any).solace.Version.version).toBe('10.99.0-mock');
        expect(await (await fetch('/hosted')).json()).toEqual({ hosted: true, connModes: 'managed', defaultConn: 'managed' });
        expect(Array.from(BROKERS.keys())).toEqual(['direct', 'east-prod', 'west-dr', 'lab']);
        expect(getQueue('orders', 'orders.new')!.messages).toHaveLength(24);
        expect(document.getElementById('mock-controls')).not.toBeNull();
    });

    it('refuses a request the demo does not answer, without calling the replaced fetch', async () => {
        let reached = 0;
        window.fetch = (() => { reached++; return Promise.resolve(new Response('real')); }) as typeof window.fetch;

        start();

        await expect(fetch('https://example.com/anything')).rejects.toThrow(NETWORK_DISABLED);
        await expect(fetch('/not-the-demo')).rejects.toBeInstanceOf(TypeError);
        expect(reached).toBe(0);
    });

    it('makes every other way to send something throw', () => {
        start();

        expect(() => new (window as any).WebSocket('wss://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => new (window as any).EventSource('https://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => new XMLHttpRequest().open('GET', 'https://example.com')).toThrow(NETWORK_DISABLED);
        expect(() => navigator.sendBeacon('https://example.com', 'x')).toThrow(NETWORK_DISABLED);
    });
});

describe('mock-broker/boot.managed -- the sign-in and the reloads', () => {
    it('starts on the sign-in while connModes is managed, as the gateway redirects a load without a session', () => {
        start();
        expect(layerTitle()).toBe('Sign in');
    });

    it('carries the session, the gateway, the queues and the page across a sign-in\'s reload', () => {
        start();
        removeMessage('orders', 'orders.new', String(getQueue('orders', 'orders.new')!.messages[0].id));
        signInThroughThePage('operator', 'demo-operator-01');
        expect(reloads).toBe(1);

        // The reload: a fresh boot over what sessionStorage kept.
        document.body.innerHTML = '';
        resetScenario();
        const demo = start();
        expect(layerTitle()).toBeNull();
        expect(demo.gateway.session()).toEqual({ user: 'operator', mustChange: false });
        expect(getQueue('orders', 'orders.new')!.messages).toHaveLength(23);
    });

    it('lands a forced change on the password page after the reload', () => {
        start();
        signInThroughThePage('newadmin', 'demo-change-me-01');
        document.body.innerHTML = '';
        start();
        expect(layerTitle()).toBe('Change password');
    });

    it('keeps what changed on an ordinary reload, through pagehide', () => {
        const demo = start();
        demo.gateway.faults.dialRateLimited = true;
        window.dispatchEvent(new Event('pagehide'));

        document.body.innerHTML = '';
        expect(start().gateway.faults.dialRateLimited).toBe(true);
    });

    it('forgets everything on Reset demo data, and the reload\'s pagehide cannot bring it back', () => {
        const demo = start();
        demo.gateway.signIn('viewer', 'demo-viewer-0001');
        demo.save();
        demo.reset();
        expect(reloads).toBe(1);
        window.dispatchEvent(new Event('pagehide'));
        expect(sessionStorage.getItem(SNAPSHOT_KEY)).toBeNull();

        document.body.innerHTML = '';
        expect(start().gateway.session()).toBeNull();
    });

    it('mounts the managed panel, whose Reset demo data is the boot\'s', () => {
        const demo = start();
        demo.gateway.signIn('viewer', 'demo-viewer-0001');
        demo.save();
        expect(document.querySelector('#mock-controls .mockctl-title')!.textContent).toBe('Demo accounts');

        Array.from(document.querySelectorAll<HTMLButtonElement>('#mock-controls .mockctl-btn'))
            .find(b => b.textContent === 'Reset demo data')!.click();
        expect(reloads).toBe(1);
        expect(sessionStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    });

    it('starts from the seed when the storage refuses or holds an older snapshot', () => {
        // v1 kept one throttle counter; its shape cannot be loaded.
        sessionStorage.setItem(SNAPSHOT_KEY, '{"v":1,"gateway":{"throttle":{"count":5,"blockedUntil":0}}}');
        expect(start().gateway.session()).toBeNull();

        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
        document.body.innerHTML = '';
        const demo = start();
        expect(() => demo.save()).not.toThrow();
        expect(layerTitle()).toBe('Sign in');
    });
});
