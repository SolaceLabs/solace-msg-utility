import type { PwaModule, RegisteredModule, AppContext, AppState, EventBus } from './types';
import { createEventBus } from './event-bus';
import { escapeHtml } from './utils';
import { logger, setLogLevel, getLogLevel, readLogLevelFromUrl } from './logger';
import { LogLevel } from './constants';

/**
 * Application Kernel
 *
 * Orchestrates module loading with priority-based ordering. Priority is set
 * in `src/registry.ts` (not on the module itself) so the entire ordering is
 * visible in one place; the kernel sorts by it before installing.
 *
 * Provides AppContext (eventBus, appState, setState, sempFetch, copyToClipboard)
 * as the shared platform for all modules.
 */
export class Kernel {
    /** Modules in install order (priority descending). */
    private modules: PwaModule[];
    /** Priority lookup keyed by module id, populated from the registry input. */
    private priorities: Map<string, number>;
    private loadedModules: Map<string, { mod: PwaModule; container: HTMLElement }> = new Map();
    private eventBus: EventBus;
    private state: AppState;
    private config: Record<string, any> = (window as any).APP_CONFIG || { useMocks: false };
    private moduleContainer: HTMLElement | null = null;
    private sidebarNav: HTMLElement | null = null;
    private pageTitle: HTMLElement | null = null;
    // Guard against accidental double-start — otherwise window listeners (5.3)
    // and module install() calls (5.4) would accumulate duplicates. The invariant
    // is "start() runs exactly once per Kernel instance". Enforcing it here keeps
    // modules simple: they don't each need to defend against being installed twice.
    private started = false;

    constructor(registered: RegisteredModule[]) {
        // Sort by priority descending (higher priority initializes first).
        const sorted = [...registered].sort((a, b) => b.priority - a.priority);
        this.modules = sorted.map(r => r.module);
        this.priorities = new Map(sorted.map(r => [r.module.id, r.priority]));
        this.eventBus = createEventBus();

        this.state = {
            activeModuleId: null,
            isConnected: false,
            selectedVpn: null,
            solaceConnection: null,
            sempCredentials: null,
            isSempConnected: false
        };
    }

    /**
     * Bootstrap the application.
     * Called once after DOMContentLoaded + external libraries are loaded.
     * Idempotent: a second call is a no-op that logs a warning — usually a sign
     * main.ts was re-imported (HMR) or start() was invoked programmatically.
     */
    async start(): Promise<void> {
        if (this.started) {
            logger.warn('[Kernel] start() called more than once — ignoring. '
                + 'This usually means main.ts was re-imported (HMR) or start() was invoked programmatically.');
            return;
        }
        this.started = true;

        // Apply URL-overridden log level before any other kernel logging so the
        // very first banner respects the user's choice.
        const fromUrl = readLogLevelFromUrl();
        if (fromUrl !== null) setLogLevel(fromUrl);

        logger.info(`[Kernel] Starting Solace Message Utility v3.0.0 (logLevel=${LogLevel[getLogLevel()]})`);
        logger.info(`[Kernel] ${this.modules.length} module(s) registered, sorted by priority:`);
        this.modules.forEach(m => logger.info(`  → ${m.name} (priority: ${this.priorities.get(m.id)})`));

        // Cache DOM references
        this.sidebarNav = document.getElementById('sidebar-nav');
        this.moduleContainer = document.getElementById('module-container');
        this.pageTitle = document.getElementById('page-title');

        // Clear initial static content
        if (this.moduleContainer) this.moduleContainer.innerHTML = '';

        // Sidebar toggle
        const mainSidebar = document.getElementById('main-sidebar');
        const btnToggle = document.getElementById('btn-sidebar-toggle');
        if (btnToggle && mainSidebar) {
            btnToggle.addEventListener('click', () => {
                mainSidebar.classList.toggle('collapsed');
            });
        }

        // Install all modules in priority order. Hold the EventBus during install
        // so any module that emits in its install() (e.g. Connections seeding the
        // message-cap from saved config) reaches later-priority modules that haven't
        // subscribed yet. release() flushes the buffered emits in FIFO order once
        // every module has finished install().
        this.eventBus.hold();
        for (const mod of this.modules) {
            await this.installModule(mod);
        }
        this.eventBus.release();

        // Bridge: HTML bootstrap script fires window 'jszip:loaded' — forward to EventBus
        window.addEventListener('jszip:loaded', () => this.eventBus.emit('jszip:loaded'));
        // If JSZip already loaded before we registered the listener, emit now
        if ((window as any).jszipLoaded) {
            this.eventBus.emit('jszip:loaded');
        }

        // Render sidebar navigation
        this.renderSidebar();

        // Activate the first module that actually installed. If `modules[0]`
        // failed (template missing, install() threw), it isn't in `loadedModules`
        // and `navigateTo` would silently return early — leaving an empty view.
        // Fall through to the next-priority module so the user still sees something.
        const firstInstalled = this.modules.find(m => this.loadedModules.has(m.id));
        if (firstInstalled) {
            this.navigateTo(firstInstalled.id);
        } else if (this.modules.length > 0) {
            logger.error('[Kernel] No modules installed successfully — nothing to navigate to.');
        }

        logger.info('[Kernel] All modules installed. Application ready.');
    }

    /**
     * Install a single module: create its DOM container, clone template, call install().
     */
    private async installModule(mod: PwaModule): Promise<void> {
        logger.info(`[Kernel] Installing module: ${mod.name} (${mod.id})`);

        // Find the module's HTML template
        const tpl = document.querySelector(`template[data-module-id="${mod.id}"]`) as HTMLTemplateElement | null;
        if (!tpl || !this.moduleContainer) {
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
        this.moduleContainer.appendChild(wrapper);

        // Build the AppContext for this module
        const appContext: AppContext = {
            container: wrapper,
            appState: this.state,
            eventBus: this.eventBus,
            setState: this.appSetState.bind(this),
            loadSelf: () => this.navigateTo(mod.id),
            sempFetch: this.sempFetch.bind(this),
            copyToClipboard: this.copyToClipboard.bind(this),
            config: this.config
        };

        try {
            await mod.install(appContext);
            this.loadedModules.set(mod.id, { mod, container: wrapper });
            logger.info(`[Kernel] ✓ Module "${mod.name}" installed successfully`);
        } catch (err) {
            logger.error(`[Kernel] ✗ Failed to install module "${mod.name}":`, err);
        }
    }

    /**
     * Navigate to a module view (show its container, hide others).
     */
    navigateTo(id: string): void {
        const entry = this.loadedModules.get(id);
        if (!entry) return;

        this.state.activeModuleId = id;

        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => {
            (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.moduleId === id);
        });

        // Update page title
        if (this.pageTitle) this.pageTitle.textContent = entry.mod.name;

        // Toggle visibility
        if (this.moduleContainer) {
            this.moduleContainer.querySelectorAll('.module-view').forEach(v => v.classList.add('hidden'));
        }
        entry.container.classList.remove('hidden');
    }

    /**
     * Render sidebar navigation items from loaded modules.
     */
    private renderSidebar(): void {
        if (!this.sidebarNav) return;
        this.sidebarNav.innerHTML = '';

        // Default icon for modules without a custom one
        const defaultIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';

        // Sort by priority descending for consistent ordering. `priorities`
        // is populated from the registry in the constructor for every loaded
        // module — the `!` assertion makes the contract executable.
        const sorted = [...this.loadedModules.values()].sort((a, b) => {
            const pa = this.priorities.get(a.mod.id)!;
            const pb = this.priorities.get(b.mod.id)!;
            return pb - pa;
        });

        sorted.forEach(({ mod }) => {
            const item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.moduleId = mod.id;
            item.title = mod.name;

            // mod.name is developer-controlled (registry), but escape for defense-in-depth.
            // mod.icon is intentionally raw SVG markup from the module — not escaped.
            item.innerHTML = `
        <span class="nav-icon">${mod.icon || defaultIcon}</span>
        <span class="nav-text">${escapeHtml(mod.name)}</span>
      `;

            item.onclick = () => this.navigateTo(mod.id);
            this.sidebarNav!.appendChild(item);
        });
    }

    /**
     * Typed state updater exposed to modules via AppContext.setState().
     */
    private appSetState<K extends keyof AppState>(key: K, value: AppState[K]): void {
        this.state[key] = value;
        this.updateGlobalUI();
        this.eventBus.emit('app:state-change', { key, value });
    }

    /**
     * SEMP API fetch helper with auto-injected Basic Auth.
     */
    private async sempFetch(url: string, options: RequestInit = {}): Promise<Response> {
        const defaults: RequestInit = { headers: {} };

        if (this.state.sempCredentials) {
            const { user, pass } = this.state.sempCredentials;
            const token = btoa(`${user}:${pass}`);
            (defaults.headers as Record<string, string>)['Authorization'] = `Basic ${token}`;
        }

        const finalOptions: RequestInit = {
            ...options,
            headers: {
                ...(defaults.headers as Record<string, string>),
                ...(options.headers as Record<string, string>)
            }
        };

        // Errors (network failures, synchronous URL construction throws, etc.) propagate
        // to the caller unchanged — no local logging or transformation adds value here.
        const response = await fetch(url, finalOptions);
        if (response.status === 401) {
            logger.warn('[Kernel] SEMP 401 Unauthorized — terminating connection');
            this.appSetState('isSempConnected', false);
            this.appSetState('sempCredentials', null);
            this.eventBus.emit('semp:disconnected');
        }
        return response;
    }

    /**
     * Clipboard copy helper with visual feedback on button.
     */
    private async copyToClipboard(text: string, btnElement?: HTMLElement): Promise<void> {
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

    /**
     * Update global status indicators in the sidebar footer.
     */
    private updateGlobalUI(): void {
        const indClient = document.getElementById('status-indicator-client');
        const indSemp = document.getElementById('status-indicator-semp');

        if (indClient) {
            indClient.classList.toggle('status-connected', !!this.state.isConnected);
        }
        if (indSemp) {
            indSemp.classList.toggle('status-connected', !!this.state.isSempConnected);
        }
    }
}
