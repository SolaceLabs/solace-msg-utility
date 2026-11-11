/**
 * The managed demo's entry point (`provisioned-demo.html`). Redirected in for
 * `src/core/boot.ts` by `demoRedirects` in vite.config.ts for the
 * `managed-demo` variant only, so demo.html never carries what this adds:
 * the fake gateway (`./gateway`) over the demo's brokers and accounts, its
 * sign-in pages, and the SMF socket gate.
 *
 * It must not reach a network, like demo.html: `./network` refuses a request
 * nobody answers and makes the other ways a page could send something throw.
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
import { managedSections } from './controls/managed';
import { dumpStore, loadStore, seed, type StoreSnapshot } from './broker/store';
import { dumpScenario, loadScenario, resetScenario, setBrokers, type ScenarioSnapshot } from './fixtures';
import { installSdk, removeVendorBanner, whenReady } from './shell';
import { setSocketGate } from './sdk/session';
import { blockNetworkApis, refuseNetwork } from './network';
import { createGateway, type Gateway, type GatewaySnapshot } from './gateway';
import { createPages, type GatewayPages, type Page } from './gateway/pages';
import { DEMO_TOPOLOGY, demoSeed } from './gateway/seed';
import { showToast } from '../core/toast';

export const SNAPSHOT_KEY = 'smu-managed-demo';
/** Set on the tab's first load, so the panel opens once; Reset demo data keeps it. */
export const PANEL_SEEN_KEY = 'smu-managed-demo-panel-seen';
const BANNER = 'Demo gateway and broker: nothing leaves this page, and no real gateway or broker is reached.';
/** Bumped when the snapshot's shape changes: an older one is ignored, and the tab starts from the seed. */
const SNAPSHOT_VERSION = 2;
const RESTORE_FAILED = 'Saved demo state could not be restored; the demo was reset.';
const RESTORE_NOTICE_MS = 8000;

interface DemoSnapshot {
    v: typeof SNAPSHOT_VERSION;
    gateway: GatewaySnapshot;
    broker: StoreSnapshot;
    scenario: ScenarioSnapshot;
    page: Page;
}

function readSnapshot(): DemoSnapshot | null {
    try {
        const raw = sessionStorage.getItem(SNAPSHOT_KEY);
        const s = raw ? JSON.parse(raw) : null;
        return s?.v === SNAPSHOT_VERSION ? s : null;
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
    let snap = readSnapshot();

    setBrokers(DEMO_TOPOLOGY);
    let gateway = createGateway({ seed: demoSeed() });
    let restoreFailed = false;
    if (snap) {
        try {
            loadScenario(snap.scenario);
            loadStore(snap.broker);
            gateway.restore(snap.gateway);
        } catch {
            // Same version but a damaged shape: session storage outlives the reload, so
            // drop it and start over, or the tab could never get past this boot.
            clearSnapshot();
            snap = null;
            restoreFailed = true;
            resetScenario();
            gateway = createGateway({ seed: demoSeed() });
        }
    }
    if (!snap) seed();

    installSdk();
    setSocketGate(gateway.sockets.gate);
    installMockServer({ passthrough: refuseNetwork, routes: gateway.route });
    blockNetworkApis();

    let keep = true;
    const save = () => {
        if (!keep) return;
        writeSnapshot({ v: SNAPSHOT_VERSION, gateway: gateway.snapshot(), broker: dumpStore(), scenario: dumpScenario(), page: pages.current() });
    };
    /** Land on `page` through a reload, as a sign-in does: what the demo holds rides across. */
    const navigate = (page: Page) => {
        pages.hide();
        writeSnapshot({ v: SNAPSHOT_VERSION, gateway: gateway.snapshot(), broker: dumpStore(), scenario: dumpScenario(), page });
        keep = false;   // the pagehide of this reload must not overwrite it
        reload();
    };
    const pages = createPages({ gateway, navigate });

    // Where the browser lands: the page it was on, or, while connModes is
    // provisioned, the sign-in (or the forced change) the gateway sends a load
    // without a session to (gateApp in pages.go).
    let page: Page = snap?.page ?? 'app';
    const s = gateway.session();
    if (page === 'app' && gateway.settings.current().connModes === 'provisioned' && (!s || s.mustChange)) {
        page = s ? 'password' : 'login';
    }

    let undoNav = () => { /* until the document is ready */ };
    const reset = () => {
        keep = false;
        clearSnapshot();
        reload();
    };

    whenReady(() => {
        removeVendorBanner();
        mountControlPanel({ sections: managedSections({ gateway, navigate }), reset, banner: BANNER, visitKey: PANEL_SEEN_KEY });
        undoNav = pages.installNav();
        pages.show(page);
        window.addEventListener('pagehide', save);
        if (restoreFailed) showToast(RESTORE_FAILED, 'warn', RESTORE_NOTICE_MS);
    });

    return {
        gateway,
        pages,
        save,
        reset,
        dispose() {
            undoNav();
            window.removeEventListener('pagehide', save);
        },
    };
}
