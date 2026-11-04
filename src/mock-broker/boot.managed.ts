/**
 * The managed demo's entry point (`managed-demo.html`). Redirected in for
 * `src/core/boot.ts` by `mockRedirects` in vite.config.ts for the
 * `managed-demo` variant only, so mock.html never carries what this adds:
 * the fake gateway (`./gateway`) over the demo's brokers and accounts, its
 * sign-in pages, and the SMF socket gate.
 *
 * It must not reach a network: a request nobody answers is refused, never
 * passed to the real `fetch`, which this file never references, and the other
 * ways a page could send something (WebSocket, XMLHttpRequest, sendBeacon,
 * EventSource) throw. The app uses none of them; the SDK emulator replaces
 * the one WebSocket user.
 *
 * Sign-in and password changes reload the page, as the gateway's redirect
 * does. What the demo holds (the gateway's users, connections, settings and
 * sessions, the page's cookie, the broker's queues and the panel's scenario)
 * rides across in sessionStorage, so a reload keeps it and a new tab starts
 * from the seed. A browser that refuses the storage gets a fresh demo on each
 * load; nothing else changes.
 *
 * Mock-only.
 */
import './controls/styles.css';
import { installMockServer } from './server';
import { mountControlPanel } from './controls/panel';
import { dumpStore, loadStore, seed, type StoreSnapshot } from './broker/store';
import { dumpScenario, loadScenario, setBrokers, type ScenarioSnapshot } from './fixtures';
import { installSdk, removeVendorBanner, whenReady } from './shell';
import { setSocketGate } from './sdk/session';
import { createGateway, type Gateway, type GatewaySnapshot } from './gateway';
import { createPages, type GatewayPages, type Page } from './gateway/pages';
import { DEMO_TOPOLOGY, demoSeed } from './gateway/seed';

/** The refusal's message; `check-bundles.mjs` requires it in the demo bundle. */
export const NETWORK_DISABLED = 'demo: network disabled';

/** The passthrough: whatever the demo does not answer fails like a dead network. */
export function refuseNetwork(): Promise<Response> {
    return Promise.reject(new TypeError(NETWORK_DISABLED));
}

export const SNAPSHOT_KEY = 'smu-managed-demo';

interface DemoSnapshot {
    v: 1;
    gateway: GatewaySnapshot;
    broker: StoreSnapshot;
    scenario: ScenarioSnapshot;
    page: Page;
}

function readSnapshot(): DemoSnapshot | null {
    try {
        const raw = sessionStorage.getItem(SNAPSHOT_KEY);
        const s = raw ? JSON.parse(raw) : null;
        return s?.v === 1 ? s : null;
    } catch {
        return null;   // storage refused or a damaged entry: start from the seed
    }
}

function writeSnapshot(s: DemoSnapshot): void {
    try {
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
    } catch {
        // Storage refused: the next load starts from the seed.
    }
}

function clearSnapshot(): void {
    try {
        sessionStorage.removeItem(SNAPSHOT_KEY);
    } catch {
        // Nothing stored to clear.
    }
}

/** The page APIs that could send something, made to throw. */
function blockNetworkApis(): void {
    const refuse = function refused(): never {
        throw new TypeError(NETWORK_DISABLED);
    };
    for (const name of ['WebSocket', 'EventSource'] as const) {
        Object.defineProperty(window, name, { configurable: true, writable: true, value: refuse });
    }
    XMLHttpRequest.prototype.open = refuse;
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, writable: true, value: refuse });
}

export interface ManagedDemo {
    gateway: Gateway;
    pages: GatewayPages;
    /** Write the snapshot now (the boot also does on `pagehide`). */
    save(): void;
    /** The control panel's "Reset demo data": forget the snapshot and load the seed. */
    reset(): void;
    /** Take back the document and window listeners (a page only ever has one boot; tests have many). */
    dispose(): void;
}

export function boot(opts: { reload?: () => void } = {}): ManagedDemo {
    const reload = opts.reload ?? (() => location.reload());
    const snap = readSnapshot();

    setBrokers(DEMO_TOPOLOGY);
    const gateway = createGateway({ seed: demoSeed() });
    if (snap) {
        loadScenario(snap.scenario);
        loadStore(snap.broker);
        gateway.restore(snap.gateway);
    } else {
        seed();
    }

    installSdk();
    setSocketGate(gateway.sockets.gate);
    installMockServer({ passthrough: refuseNetwork, routes: gateway.route });
    blockNetworkApis();

    let keep = true;
    const save = () => {
        if (!keep) return;
        writeSnapshot({ v: 1, gateway: gateway.snapshot(), broker: dumpStore(), scenario: dumpScenario(), page: pages.current() });
    };
    const pages = createPages({
        gateway,
        navigate: (page) => {
            pages.hide();
            writeSnapshot({ v: 1, gateway: gateway.snapshot(), broker: dumpStore(), scenario: dumpScenario(), page });
            keep = false;   // the pagehide of this reload must not overwrite it
            reload();
        },
    });

    // Where the browser lands: the page it was on, or, while connModes is
    // managed, the sign-in (or the forced change) the gateway sends a load
    // without a session to (gateApp in pages.go).
    let page: Page = snap?.page ?? 'app';
    const s = gateway.session();
    if (page === 'app' && gateway.settings.current().connModes === 'managed' && (!s || s.mustChange)) {
        page = s ? 'password' : 'login';
    }

    let undoNav = () => { /* until the document is ready */ };
    whenReady(() => {
        removeVendorBanner();
        mountControlPanel();
        undoNav = pages.installNav();
        pages.show(page);
        window.addEventListener('pagehide', save);
    });

    return {
        gateway,
        pages,
        save,
        reset() {
            keep = false;
            clearSnapshot();
            reload();
        },
        dispose() {
            undoNav();
            window.removeEventListener('pagehide', save);
        },
    };
}
