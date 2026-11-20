import type { PwaModule, RegisteredModule, AppContext, AppState, EventBus } from './types';
import { createEventBus } from './event-bus';
import { basicAuthHeader, escapeHtml, normalizeUrlPath } from './utils';
import { buildBrokerUrl, isHostedDeployment } from './hosted';
import { deadlineSignal } from './timing';
import { isModuleVisible } from './rbac';
import { createManagedProfile, type ManagedProfileStore } from './services/managed-profile';
import { logger, setLogLevel, getLogLevel, readLogLevelFromUrl } from './logger';
import { LogLevel } from './constants';
import { TOAST_EVENT, showToast, type ToastEventDetail } from './toast';
import { createNotificationCenter, mountNotificationBell, type NotificationCenter } from './components/notification-center';
import { createQueuePicker } from './components/queue-picker';
import { required } from './dom';

/** The elements of the shell (src/index.html) the kernel wires; start() requires every one. */
const SHELL_IDS = [
    'main-sidebar', 'btn-sidebar-toggle', 'sidebar-account', 'sidebar-nav', 'page-title', 'module-container',
    'app-loading', 'toast-container', 'notification-bell-slot', 'status-indicator-client', 'status-indicator-semp',
] as const;

/** The kernel `createKernel` returns: `start()` boots the app, `navigateTo()` shows one module's view. */
export interface Kernel {
    start(): Promise<void>;
    navigateTo(id: string): void;
}

/**
 * Application Kernel
 *
 * Orchestrates module loading with priority-based ordering. Priority is set
 * in the active variant's manifest (`src/variants/<name>.ts`, read by
 * `src/registry.ts`), not on the module itself, so the entire ordering is
 * visible in one place; the kernel sorts by it before installing.
 *
 * Provides AppContext (eventBus, appState, setState, sempFetch, queuePicker, copyToClipboard)
 * as the shared platform for all modules. Its state lives in this closure.
 */
export function createKernel(registered: RegisteredModule[]): Kernel {
    // Sort by priority descending (higher priority initializes first).
    const sorted = [...registered].sort((a, b) => b.priority - a.priority);
    /** Modules in install order (priority descending). */
    const modules: PwaModule[] = sorted.map(r => r.module);
    /** Priority lookup keyed by module id, populated from the registry input. */
    const priorities = new Map<string, number>(sorted.map(r => [r.module.id, r.priority]));
    const loadedModules = new Map<string, { mod: PwaModule; container: HTMLElement }>();
    const eventBus: EventBus = createEventBus();
    const state: AppState = {
        activeModuleId: null,
        isConnected: false,
        selectedVpn: null,
        solaceConnection: null,
        sempCredentials: null,
        isSempConnected: false
    };
    /**
     * Managed profile handed to every module via AppContext. Created once per
     * kernel and inert until a managed login populates it, so non-managed
     * deployments are unaffected.
     */
    const managedProfile: ManagedProfileStore = createManagedProfile();
    /**
     * The app's notification record (AppContext.notifications), one per
     * kernel, fed by every ok/warn/error toast and the connection lifecycle
     * (`wireNotifications`) and shown by the header bell.
     */
    const notifications: NotificationCenter = createNotificationCenter();
    /** The queue picker every module opens (AppContext.queuePicker), so its cache is shared. */
    const queuePicker = createQueuePicker();
    // One start per kernel: a second would add the window listeners and
    // install every module again. Enforcing it here keeps modules simple:
    // none has to defend against being installed twice.
    let started = false;

    /**
     * Bootstrap the application.
     * Called once after DOMContentLoaded + external libraries are loaded.
     * Idempotent: a second call is a no-op that logs a warning -- usually a sign
     * main.ts was re-imported (HMR) or start() was invoked programmatically.
     */
    async function start(): Promise<void> {
        if (started) {
            logger.warn('[Kernel] start() called more than once -- ignoring. '
                + 'This usually means main.ts was re-imported (HMR) or start() was invoked programmatically.');
            return;
        }
        started = true;

        // Apply URL-overridden log level before any other kernel logging so the
        // very first banner respects the user's choice.
        const fromUrl = readLogLevelFromUrl();
        if (fromUrl !== null) setLogLevel(fromUrl);

        logger.info(`[Kernel] Starting Solace Message Utility v${__APP_VERSION__} (logLevel=${LogLevel[getLogLevel()]})`);
        logger.info(`[Kernel] ${modules.length} module(s) registered, sorted by priority:`);
        modules.forEach(m => logger.info(`  -> ${m.name} (priority: ${priorities.get(m.id)})`));

        // The shell (src/index.html) always holds these elements; a missing one
        // fails the start here, not in a half-wired page.
        SHELL_IDS.forEach(id => required(document, `#${id}`));

        // #module-container's only initial child is the shell's #app-loading
        // placeholder. It stays until the first module view is shown
        // (navigateTo) or is replaced by the no-modules message below.
        const loading = required(document, '#app-loading');

        // Before any module installs, so a toast or a connection event raised
        // during install is recorded too.
        wireNotifications();

        // Sidebar toggle
        const mainSidebar = required(document, '#main-sidebar');
        required(document, '#btn-sidebar-toggle').addEventListener('click', () => {
            mainSidebar.classList.toggle('collapsed');
        });

        // Install all modules in priority order. Hold the EventBus during install
        // so any module that emits in its install() (e.g. Connections seeding the
        // message-cap from saved config) reaches later-priority modules that haven't
        // subscribed yet. release() flushes the buffered emits in FIFO order once
        // every module has finished install().
        // try/finally: the bus must never stay held, whatever an install path throws.
        eventBus.hold();
        try {
            for (const mod of modules) {
                await installModule(mod);
            }
        } finally {
            eventBus.release();
        }

        // Bridge: HTML bootstrap script fires window 'jszip:loaded' -- forward to EventBus
        window.addEventListener('jszip:loaded', () => eventBus.emit('jszip:loaded'));
        // If JSZip already loaded before we registered the listener, emit now
        if (window.jszipLoaded) {
            eventBus.emit('jszip:loaded');
        }

        // Render sidebar navigation
        renderSidebar();

        // Re-render the sidebar (and navigate away from a now-hidden view) when
        // the managed RBAC session changes. No-op in non-managed variants, which
        // never emit this event. Registered once per kernel.
        eventBus.on('rbac:changed', () => handleRbacChanged());

        // Activate the first module that actually installed AND is visible under
        // the current session. If `modules[0]` failed (template missing, install()
        // threw) it isn't in `loadedModules`; if it's hidden by RBAC it's skipped.
        // Fall through to the next module so the user still sees something.
        const firstInstalled = modules.find(
            m => loadedModules.has(m.id) && isModuleVisible(state.managed, m.id)
        );
        if (firstInstalled) {
            navigateTo(firstInstalled.id);
        } else {
            if (modules.length > 0) {
                logger.error('[Kernel] No modules installed successfully -- nothing to navigate to.');
            }
            // Replace the shell's "Loading..." with a visible reason.
            loading.textContent = 'No modules are available. Check the browser console.';
        }

        logger.info('[Kernel] All modules installed. Application ready.');
    }

    /**
     * Install a single module: create its DOM container, clone template, call install().
     */
    async function installModule(mod: PwaModule): Promise<void> {
        logger.info(`[Kernel] Installing module: ${mod.name} (${mod.id})`);

        // Find the module's HTML template
        const tpl = document.querySelector(`template[data-module-id="${mod.id}"]`) as HTMLTemplateElement | null;
        if (!tpl) {
            logger.error(
                `[Kernel] Template for module "${mod.name}" (data-module-id="${mod.id}") not found. ` +
                `Make sure src/modules/${mod.id}/index.html exists if "${mod.id}" is in the active variant manifest (src/variants/).`
            );
            return;
        }

        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.id = `module-view-${mod.id}`;
        wrapper.className = 'module-view hidden';
        wrapper.appendChild(document.importNode(tpl.content, true));
        required(document, '#module-container').appendChild(wrapper);

        // Build the AppContext for this module
        const appContext: AppContext = {
            container: wrapper,
            appState: state,
            eventBus,
            setState: appSetState,
            loadSelf: () => navigateTo(mod.id),
            sempFetch,
            // One profile shared by every module: the module owning the managed
            // login writes it, others read provisioned names and dial through it.
            managedProfile,
            notifications,
            queuePicker,
            copyToClipboard,
            mountSidebarAccount
        };

        try {
            await mod.install(appContext);
            loadedModules.set(mod.id, { mod, container: wrapper });
            logger.info(`[Kernel] ✓ Module "${mod.name}" installed successfully`);
        } catch (err) {
            logger.error(`[Kernel] ✗ Failed to install module "${mod.name}":`, err);
            showToast(`Module "${mod.name}" failed to install. See the browser console for details.`, 'error', 8000);
        }
    }

    /**
     * Feed the notification center and mount its bell. Toasts arrive as
     * `TOAST_EVENT` on the shell's `#toast-container` (info toasts are not
     * recorded) and are tagged with the module the user is on. The connection
     * lifecycle comes from the bus: the connections module sets
     * `solaceConnection` before it emits `client:connected`, and clears it
     * before `client:disconnected`, so the identity is remembered at connect.
     */
    function wireNotifications(): void {
        const center = notifications;
        required(document, '#toast-container').addEventListener(TOAST_EVENT, (e) => {
            const { message, type } = (e as CustomEvent<ToastEventDetail>).detail;
            if (type === 'info') return;
            const active = loadedModules.get(state.activeModuleId ?? '');
            center.add(type, active?.mod.name ?? 'App', message);
        });
        mountNotificationBell(required(document, '#notification-bell-slot'), center);

        let last = { host: '', vpn: '' };
        eventBus.on('client:connected', () => {
            const conn = state.solaceConnection;
            last = { host: conn?.host ?? '', vpn: conn?.vpn ?? '' };
            center.noteConnected({ broker: last.host, provisioned: !!state.managed });
            center.add('info', 'Connections', `Connected to broker "${last.host}", VPN "${last.vpn}".`);
        });
        eventBus.on('client:disconnected', () => {
            center.add('info', 'Connections', `Disconnected from broker "${last.host}", VPN "${last.vpn}".`);
        });
        eventBus.on('semp:connected', () => {
            center.add('info', 'Connections', `SEMP connected to "${state.sempCredentials?.host ?? ''}".`);
        });
        eventBus.on('semp:disconnected', () => {
            center.add('info', 'Connections', 'SEMP disconnected.');
        });
    }

    /**
     * Navigate to a module view (show its container, hide others).
     */
    function navigateTo(id: string): void {
        const entry = loadedModules.get(id);
        if (!entry) return;

        state.activeModuleId = id;

        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => {
            (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.moduleId === id);
        });

        // Update page title
        required(document, '#page-title').textContent = entry.mod.name;

        // Show this view and hide the others. A view whose install failed was
        // created hidden and stays so. The shell's "Loading..." placeholder
        // goes with the first view shown.
        for (const { container } of loadedModules.values()) {
            container.classList.toggle('hidden', container !== entry.container);
        }
        document.getElementById('app-loading')?.remove();
    }

    /**
     * Render sidebar navigation items from loaded modules.
     */
    function renderSidebar(): void {
        const nav = required(document, '#sidebar-nav');
        nav.innerHTML = '';

        // Default icon for modules without a custom one
        const defaultIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';

        // Sort by priority descending for consistent ordering. `priorities`
        // is populated from the registry for every loaded module -- the `!`
        // assertion makes the contract executable. Then filter by RBAC
        // visibility (allow-all when there's no managed session, so
        // non-managed variants render every module).
        const visible = [...loadedModules.values()]
            .sort((a, b) => {
                const pa = priorities.get(a.mod.id)!;
                const pb = priorities.get(b.mod.id)!;
                return pb - pa;
            })
            .filter(({ mod }) => isModuleVisible(state.managed, mod.id));

        visible.forEach(({ mod }) => {
            const item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.moduleId = mod.id;
            item.title = mod.name;

            // mod.name is developer-controlled (registry), but escape for defense-in-depth.
            // mod.icon is intentionally raw SVG markup from the module -- not escaped.
            item.innerHTML = `
        <span class="nav-icon">${mod.icon || defaultIcon}</span>
        <span class="nav-text">${escapeHtml(mod.name)}</span>
      `;

            item.onclick = () => navigateTo(mod.id);
            nav.appendChild(item);
        });

        // Re-apply the active highlight after rebuilding -- navigateTo is the only
        // other place that sets it, so a re-render (e.g. on rbac:changed) would
        // otherwise drop the highlight on the currently-viewed module.
        if (state.activeModuleId) {
            nav.querySelectorAll('.nav-item').forEach(el => {
                (el as HTMLElement).classList.toggle(
                    'active',
                    (el as HTMLElement).dataset.moduleId === state.activeModuleId
                );
            });
        }
    }

    /**
     * React to a managed RBAC session change: re-render the sidebar (module
     * visibility), then -- if the active module is now hidden -- navigate to the
     * highest-priority module that is still installed AND visible. No-op in
     * non-managed variants, where this event never fires.
     */
    function handleRbacChanged(): void {
        renderSidebar();
        if (state.activeModuleId && !isModuleVisible(state.managed, state.activeModuleId)) {
            const firstVisible = modules.find(
                m => loadedModules.has(m.id) && isModuleVisible(state.managed, m.id)
            );
            if (firstVisible) navigateTo(firstVisible.id);
        }
    }

    /**
     * Typed state updater exposed to modules via AppContext.setState().
     */
    function appSetState<K extends keyof AppState>(key: K, value: AppState[K]): void {
        state[key] = value;
        updateGlobalUI();
        eventBus.emit('app:state-change', { key, value });
    }

    /**
     * SEMP API fetch helper. Takes a `path` (the SEMP endpoint + query string,
     * e.g. '/SEMP/v2/monitor/msgVpns?count=100' or '/SEMP' for v1 RPC) and
     * assembles the full URL from `appState.sempCredentials` on every call:
     * the connection-form values (protocol/host/port/urlPath) are the single
     * source of truth, run through `buildBrokerUrl()` so hosted-mode gateway
     * routing is applied uniformly. Broker-emitted URLs (e.g. nextPageUri)
     * never reach the wire -- callers extract pathname+search from them
     * before calling here. Basic auth is auto-injected, built by the same
     * `basicAuthHeader` as the connect probe so both send the same bytes.
     * Every request has a deadline (`REQUEST_TIMEOUT_MS`), joined to the
     * caller's own signal when it passes one; a timeout rejects with a
     * `TimeoutError` like any other fetch failure.
     *
     * A managed session (`sempCredentials.relay`) goes to the gateway's SEMP
     * relay instead, with no Authorization header: the gateway adds the
     * broker's stored account. A 401 from the relay means the gateway session
     * ended, so the session owner is also asked to sign out; the relay's own
     * refusals (403 read_only, 502 upstream_*) leave the connection as it is.
     */
    async function sempFetch(path: string, options: RequestInit = {}): Promise<Response> {
        const defaults: RequestInit = { headers: {} };
        const creds = state.sempCredentials;

        let url = path;
        if (creds?.relay) {
            url = creds.relay + path;
        } else if (creds) {
            const { user, pass, protocol, host, port, urlPath } = creds;
            (defaults.headers as Record<string, string>)['Authorization'] = basicAuthHeader(user, pass);
            const fullPath = normalizeUrlPath(urlPath) + path;
            url = buildBrokerUrl(protocol, host, port, fullPath, false, isHostedDeployment(state));
        }

        const finalOptions: RequestInit = {
            ...options,
            headers: {
                ...(defaults.headers as Record<string, string>),
                ...(options.headers as Record<string, string>)
            },
            signal: deadlineSignal(options.signal),
        };

        // Errors (network failures, timeouts, synchronous URL construction throws, etc.)
        // propagate to the caller unchanged -- no local logging or transformation adds value here.
        const response = await fetch(url, finalOptions);
        if (response.status === 401) {
            logger.warn(`[Kernel] SEMP 401 Unauthorized from ${url} -- terminating connection`);
            appSetState('isSempConnected', false);
            appSetState('sempCredentials', null);
            eventBus.emit('semp:disconnected');
            if (creds?.relay) eventBus.emit('rbac:sign-out-requested');
        }
        return response;
    }

    /**
     * Clipboard copy helper with visual feedback on button.
     */
    async function copyToClipboard(text: string, btnElement?: HTMLElement): Promise<void> {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            if (btnElement) {
                const originalHtml = btnElement.innerHTML;
                btnElement.textContent = 'Copied!';
                btnElement.classList.remove('btn-secondary');
                btnElement.classList.add('btn-success');
                setTimeout(() => {
                    btnElement.innerHTML = originalHtml;
                    btnElement.classList.remove('btn-success');
                    btnElement.classList.add('btn-secondary');
                }, 2000);
            }
        } catch (err) {
            logger.error('[Kernel] Failed to copy to clipboard:', err);
        }
    }

    /** The shell's account slot at the top of the sidebar, above the page items (AppContext.mountSidebarAccount). */
    function mountSidebarAccount(el: HTMLElement): void {
        required(document, '#sidebar-account').replaceChildren(el);
    }

    /**
     * Update global status indicators in the sidebar footer.
     */
    function updateGlobalUI(): void {
        required(document, '#status-indicator-client').classList.toggle('status-connected', !!state.isConnected);
        required(document, '#status-indicator-semp').classList.toggle('status-connected', !!state.isSempConnected);
    }

    return { start, navigateTo };
}
