import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { getLogLevel, setLogLevel } from '../../src/core/logger';
import { REQUEST_TIMEOUT_MS } from '../../src/core/timing';
import { showToast } from '../../src/core/toast';
import { LogLevel, DEFAULT_LOG_LEVEL } from '../../src/core/constants';
import type { PwaModule, RegisteredModule, AppContext, ManagedSession } from '../../src/core/types';

function managedSession(over: Partial<ManagedSession> = {}): ManagedSession {
    return {
        admin: false, username: 'u', broker: 'b',
        vpns: [], operate: [], readOnly: [], modules: ['queue-browser'],
        ...over,
    };
}

function createMockModule(overrides: Partial<PwaModule> = {}): PwaModule {
    return {
        name: overrides.name ?? 'Test Module',
        id: overrides.id ?? 'test-module',
        icon: overrides.icon,
        install: overrides.install ?? vi.fn(async () => {})
    };
}

/**
 * Wrap a module in a {module, priority} tuple for the Kernel constructor.
 * Priority defaults to 50 — tests that care about ordering pass an explicit
 * value (`reg(modA, 100)`).
 */
function reg(module: PwaModule, priority = 50): RegisteredModule {
    return { module, priority };
}

function setupDOM(moduleIds: string[]) {
    document.body.innerHTML = `
        <div id="main-sidebar">
            <button id="btn-sidebar-toggle"></button>
        </div>
        <nav id="sidebar-nav"></nav>
        <div id="module-container"></div>
        <h1 id="page-title"></h1>
        <div id="status-indicator-client"></div>
        <div id="status-indicator-semp"></div>
        ${moduleIds.map(id => `
            <template data-module-id="${id}">
                <div class="module-content">${id} content</div>
            </template>
        `).join('')}
    `;
}

describe('Kernel', () => {
    describe('start()', () => {
        it('installs modules and renders sidebar', async () => {
            const mod = createMockModule({ id: 'test-module', name: 'Test' });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);

            await kernel.start();

            expect(mod.install).toHaveBeenCalled();
            const nav = document.getElementById('sidebar-nav');
            expect(nav?.innerHTML).toContain('Test');
        });

        it('applies ?logLevel= URL override before any kernel logging', async () => {
            // The kernel parses `?logLevel=DEBUG` from window.location.search
            // at start time and calls setLogLevel(...) BEFORE the first
            // banner log fires. Without this test, the truthy branch of
            // `if (fromUrl !== null) setLogLevel(fromUrl)` at kernel.ts:69
            // is unexercised — regression would silently strand users at
            // INFO level even when they pass ?logLevel=DEBUG in the URL.
            const priorLevel = getLogLevel();
            const priorSearch = window.location.search;
            // jsdom doesn't allow direct assignment to .search; redefine.
            Object.defineProperty(window, 'location', {
                value: { ...window.location, search: '?logLevel=DEBUG' },
                writable: true,
                configurable: true,
            });
            try {
                const mod = createMockModule({ id: 'test-module', name: 'Test' });
                setupDOM(['test-module']);
                const kernel = new Kernel([reg(mod)]);
                await kernel.start();
                expect(getLogLevel()).toBe(LogLevel.DEBUG);
            } finally {
                // Restore the original location.search + log level for test isolation.
                Object.defineProperty(window, 'location', {
                    value: { ...window.location, search: priorSearch },
                    writable: true,
                    configurable: true,
                });
                setLogLevel(priorLevel);
            }
        });

        it('does NOT change log level when ?logLevel= is absent', async () => {
            // Falsy-branch anchor for the same gate. Default search is ''.
            const priorLevel = getLogLevel();
            setLogLevel(DEFAULT_LOG_LEVEL);
            try {
                const mod = createMockModule({ id: 'test-module', name: 'Test' });
                setupDOM(['test-module']);
                const kernel = new Kernel([reg(mod)]);
                await kernel.start();
                expect(getLogLevel()).toBe(DEFAULT_LOG_LEVEL);
            } finally {
                setLogLevel(priorLevel);
            }
        });

        it('installs modules in priority order', async () => {
            const order: string[] = [];
            const modA = createMockModule({
                id: 'a', name: 'A',
                install: vi.fn(async () => { order.push('a'); })
            });
            const modB = createMockModule({
                id: 'b', name: 'B',
                install: vi.fn(async () => { order.push('b'); })
            });

            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 10), reg(modB, 100)]);
            await kernel.start();

            expect(order).toEqual(['b', 'a']);
        });

        it('activates the first module after install', async () => {
            const mod = createMockModule({ id: 'test-module', name: 'Test Module' });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const pageTitle = document.getElementById('page-title');
            expect(pageTitle?.textContent).toBe('Test Module');

            const wrapper = document.getElementById('module-view-test-module');
            expect(wrapper?.classList.contains('hidden')).toBe(false);
        });

        it('sets up sidebar toggle', async () => {
            const mod = createMockModule({ id: 'test-module' });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const sidebar = document.getElementById('main-sidebar')!;
            const toggle = document.getElementById('btn-sidebar-toggle')!;
            toggle.click();
            expect(sidebar.classList.contains('collapsed')).toBe(true);
            toggle.click();
            expect(sidebar.classList.contains('collapsed')).toBe(false);
        });

        it('mounts a module\'s account control in the sidebar footer slot, one at a time', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            document.body.insertAdjacentHTML('beforeend', '<div id="sidebar-account"></div>');
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const first = document.createElement('span');
            const second = document.createElement('span');
            capturedCtx!.mountSidebarAccount(first);
            capturedCtx!.mountSidebarAccount(second);
            expect(Array.from(document.getElementById('sidebar-account')!.children)).toEqual([second]);
        });

        it('leaves an account control unplaced when the shell has no slot', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            await new Kernel([reg(mod)]).start();
            const el = document.createElement('span');
            expect(() => capturedCtx!.mountSidebarAccount(el)).not.toThrow();
            expect(el.isConnected).toBe(false);
        });

        it('bridges jszip:loaded window event to EventBus', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const handler = vi.fn();
            capturedCtx!.eventBus.on('jszip:loaded', handler);
            window.dispatchEvent(new Event('jszip:loaded'));
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('emits jszip:loaded when jszipLoaded was set before start', async () => {
            const handler = vi.fn();
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => {
                    ctx.eventBus.on('jszip:loaded', handler);
                })
            });
            setupDOM(['test-module']);
            (window as any).jszipLoaded = true;
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            expect(handler).toHaveBeenCalledTimes(1);
            delete (window as any).jszipLoaded;
        });

        it('clears module container on start', async () => {
            setupDOM(['test-module']);
            document.getElementById('module-container')!.innerHTML = '<div>old stuff</div>';
            const mod = createMockModule({ id: 'test-module' });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            // Old content should be gone
            expect(document.getElementById('module-container')!.innerHTML).not.toContain('old stuff');
        });

        it('handles missing template gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const mod = createMockModule({ id: 'nonexistent' });
            setupDOM([]); // No templates
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Template for module'));
        });

        it('handles module install failure gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const mod = createMockModule({
                id: 'failing',
                install: vi.fn(async () => { throw new Error('install failed'); })
            });
            setupDOM(['failing']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to install'), expect.any(Error));
        });

        it('works with no modules', async () => {
            setupDOM([]);
            const kernel = new Kernel([]);
            await kernel.start();
            const nav = document.getElementById('sidebar-nav');
            expect(nav?.innerHTML).toBe('');
        });

        it('skips failed-to-install first module and activates the next', async () => {
            // Higher priority installs first. The template for `a` is deliberately
            // missing so installModule() fails to load it and leaves it out of
            // loadedModules. navigateTo must fall through to `b`.
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });

            // setupDOM only registers a template for 'b' — 'a' has no template.
            setupDOM(['b']);
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            // `a` never installed (no template). `b` should be active.
            const pageTitle = document.getElementById('page-title');
            expect(pageTitle?.textContent).toBe('B');
            expect(document.getElementById('module-view-b')?.classList.contains('hidden')).toBe(false);
            consoleSpy.mockRestore();
        });

        it('logs an error and navigates nowhere when every module fails to install', async () => {
            const modA = createMockModule({ id: 'a', name: 'A' });
            setupDOM([]); // no templates at all → nothing installs
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const kernel = new Kernel([reg(modA)]);
            await kernel.start();

            expect(errSpy).toHaveBeenCalledWith(
                expect.stringContaining('No modules installed successfully')
            );
            errSpy.mockRestore();
        });

        it('is idempotent — second start() is a no-op that logs a warning', async () => {
            const mod = createMockModule({ id: 'test-module' });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);

            await kernel.start();
            expect(mod.install).toHaveBeenCalledTimes(1);

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await kernel.start();
            // install() must NOT run a second time — the guard's whole point.
            expect(mod.install).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('called more than once'));
            warnSpy.mockRestore();
        });

        it('idempotency prevents window listener accumulation across start() calls', async () => {
            const mod = createMockModule({ id: 'test-module' });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            // Snapshot the current jszip:loaded listener count via a probe: calling
            // start() again and dispatching the event should not cause the EventBus
            // to emit twice. We can observe this via the bus — but the bus isn't
            // exposed, so instead we rely on the fact that install() is gated.
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await kernel.start();
            await kernel.start();
            // install stays at 1 call — transitively proves no second window
            // listener was registered either (both happen inside the same start() block).
            expect(mod.install).toHaveBeenCalledTimes(1);
            warnSpy.mockRestore();
        });
    });

    describe('navigateTo()', () => {
        it('shows target module and hides others', async () => {
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });
            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            kernel.navigateTo('b');
            expect(document.getElementById('module-view-a')?.classList.contains('hidden')).toBe(true);
            expect(document.getElementById('module-view-b')?.classList.contains('hidden')).toBe(false);
            expect(document.getElementById('page-title')?.textContent).toBe('B');
        });

        it('does nothing for unknown module id', async () => {
            const mod = createMockModule({ id: 'a', name: 'A' });
            setupDOM(['a']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            kernel.navigateTo('nonexistent');
            // Should not throw, module A should still be visible
            expect(document.getElementById('module-view-a')?.classList.contains('hidden')).toBe(false);
        });

        it('updates sidebar active state', async () => {
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });
            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            kernel.navigateTo('b');
            const navItems = document.querySelectorAll('.nav-item');
            const activeItems = Array.from(navItems).filter(el => el.classList.contains('active'));
            expect(activeItems.length).toBe(1);
            expect((activeItems[0] as HTMLElement).dataset.moduleId).toBe('b');
        });
    });

    describe('AppContext', () => {
        it('provides setState that emits app:state-change', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const handler = vi.fn();
            capturedCtx!.eventBus.on('app:state-change', handler);
            capturedCtx!.setState('isConnected', true);

            expect(capturedCtx!.appState.isConnected).toBe(true);
            expect(handler).toHaveBeenCalledWith({ key: 'isConnected', value: true });
        });

        it('setState updates global UI indicators', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const indClient = document.getElementById('status-indicator-client')!;
            const indSemp = document.getElementById('status-indicator-semp')!;

            capturedCtx!.setState('isConnected', true);
            expect(indClient.classList.contains('status-connected')).toBe(true);

            capturedCtx!.setState('isSempConnected', true);
            expect(indSemp.classList.contains('status-connected')).toBe(true);

            capturedCtx!.setState('isConnected', false);
            expect(indClient.classList.contains('status-connected')).toBe(false);
        });

        it('provides loadSelf that navigates to the module', async () => {
            let capturedCtx: AppContext | null = null;
            const modA = createMockModule({
                id: 'a', name: 'A',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            const modB = createMockModule({ id: 'b', name: 'B' });
            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            kernel.navigateTo('b');
            expect(document.getElementById('module-view-a')?.classList.contains('hidden')).toBe(true);

            capturedCtx!.loadSelf();
            expect(document.getElementById('module-view-a')?.classList.contains('hidden')).toBe(false);
        });

        it('provides sempFetch that assembles the broker URL from credentials and injects auth', async () => {
            // Path-only contract: caller passes the SEMP endpoint suffix, the
            // kernel assembles {protocol}://{host}:{port}{urlPath}{path} from
            // appState.sempCredentials so broker-direct URLs never leak in
            // from callers (the whole point of the hosted-mode safety design).
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const mockResponse = { status: 200, ok: true };
            (globalThis.fetch as any).mockResolvedValue(mockResponse);

            capturedCtx!.setState('sempCredentials', {
                user: 'admin', pass: 'admin', baseUrl: 'http://test:8080',
                protocol: 'http', host: 'test', port: '8080', urlPath: '',
            });

            const result = await capturedCtx!.sempFetch('/SEMP/v2/monitor/msgVpns?count=1');
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'http://test:8080/SEMP/v2/monitor/msgVpns?count=1',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Basic ${btoa('admin:admin')}`
                    })
                })
            );
            expect(result).toBe(mockResponse);
        });

        it('sempFetch prepends the credential urlPath before the caller-supplied path', async () => {
            // When the user typed a reverse-proxy prefix into the Connection
            // form (e.g. urlPath='/api'), every SEMP request must carry that
            // prefix. The kernel reads it from sempCredentials and prepends
            // it to the caller's path, so callers stay oblivious.
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });

            capturedCtx!.setState('sempCredentials', {
                user: 'admin', pass: 'admin', baseUrl: 'https://broker:1943/api',
                protocol: 'https', host: 'broker', port: '1943', urlPath: '/api',
            });

            await capturedCtx!.sempFetch('/SEMP');
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://broker:1943/api/SEMP',
                expect.anything(),
            );
        });

        it('sempFetch routes through the gateway proxy path scheme in hosted mode', async () => {
            // The bug this design fixes: when the PWA is served by the Go
            // gateway, every broker-bound request must go to
            // {pageOrigin}/{scheme}/{port}/{host}{path} or it will not route.
            // The kernel applies this transformation uniformly for every
            // SEMP call, regardless of which path the caller asked for —
            // including paths extracted from a broker-emitted nextPageUri.
            // The hosted verdict's one home is AppState.connConfig, which the
            // connections module publishes from its /hosted probe.
            {
                let capturedCtx: AppContext | null = null;
                const mod = createMockModule({
                    id: 'test-module',
                    install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
                });
                setupDOM(['test-module']);
                const kernel = new Kernel([reg(mod)]);
                await kernel.start();

                (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });

                capturedCtx!.setState('connConfig', { connModes: 'direct', defaultConn: 'direct', hosted: true });
                capturedCtx!.setState('sempCredentials', {
                    user: 'admin', pass: 'admin', baseUrl: '(diagnostic)',
                    protocol: 'https', host: 'broker-internal', port: '943', urlPath: '',
                });

                await capturedCtx!.sempFetch('/SEMP/v2/monitor/msgVpns?cursor=xyz');

                // window.location in jsdom is http://localhost:3000 by default;
                // hosted wire scheme follows the page scheme (https→wss for ws,
                // http→ws or http for fetch). Match the shape rather than the
                // exact host so the assertion is robust to test-runner config.
                const calledWith = (globalThis.fetch as any).mock.calls[0][0] as string;
                expect(calledWith).toMatch(/^https?:\/\/[^/]+\/https\/943\/broker-internal\/SEMP\/v2\/monitor\/msgVpns\?cursor=xyz$/);
            }
        });

        describe('sempFetch deadline', () => {
            async function directCtx(): Promise<AppContext> {
                let capturedCtx: AppContext | null = null;
                const mod = createMockModule({
                    id: 'test-module',
                    install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
                });
                setupDOM(['test-module']);
                await new Kernel([reg(mod)]).start();
                capturedCtx!.setState('sempCredentials', {
                    user: 'admin', pass: 'admin', baseUrl: 'http://test:8080',
                    protocol: 'http', host: 'test', port: '8080', urlPath: '',
                });
                return capturedCtx!;
            }

            it("gives every request a REQUEST_TIMEOUT_MS deadline joined to the caller's own signal", async () => {
                const ctx = await directCtx();
                const timeout = vi.spyOn(AbortSignal, 'timeout');
                const cancel = new AbortController();
                (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });

                await ctx.sempFetch('/SEMP', { method: 'POST', signal: cancel.signal });

                expect(timeout).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
                const { signal } = (globalThis.fetch as any).mock.calls[0][1];
                expect(signal.aborted).toBe(false);
                cancel.abort();
                expect(signal.aborted).toBe(true);
            });

            it('a broker that never answers rejects the request with a TimeoutError', async () => {
                const ctx = await directCtx();
                const deadline = new AbortController();
                vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
                (globalThis.fetch as any).mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
                    init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
                }));

                const pending = ctx.sempFetch('/SEMP/v2/monitor/msgVpns');
                deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'));

                await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
                expect(ctx.appState.sempCredentials).not.toBeNull();
            });
        });

        it('sempFetch handles 401 by disconnecting SEMP', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            capturedCtx!.setState('sempCredentials', {
                user: 'admin', pass: 'admin', baseUrl: 'http://test:8080',
                protocol: 'http', host: 'test', port: '8080', urlPath: '',
            });
            capturedCtx!.setState('isSempConnected', true);

            const disconnectHandler = vi.fn();
            capturedCtx!.eventBus.on('semp:disconnected', disconnectHandler);

            const signOut = vi.fn();
            capturedCtx!.eventBus.on('rbac:sign-out-requested', signOut);

            (globalThis.fetch as any).mockResolvedValue({ status: 401, ok: false });
            await capturedCtx!.sempFetch('/SEMP');

            expect(capturedCtx!.appState.isSempConnected).toBe(false);
            expect(capturedCtx!.appState.sempCredentials).toBe(null);
            expect(disconnectHandler).toHaveBeenCalled();
            // A broker refusing a Direct credential is not a gateway sign-out.
            expect(signOut).not.toHaveBeenCalled();
        });

        // A managed session's SEMP goes to the gateway relay, which adds the
        // broker's stored account; the browser holds no SEMP credential.
        describe('sempFetch in a managed session (relay)', () => {
            async function relayCtx(): Promise<AppContext> {
                let capturedCtx: AppContext | null = null;
                const mod = createMockModule({
                    id: 'test-module',
                    install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
                });
                setupDOM(['test-module']);
                await new Kernel([reg(mod)]).start();
                capturedCtx!.setState('sempCredentials', {
                    user: '', pass: '', baseUrl: '/managed/relay/b1', protocol: 'https', host: 'b1', port: '', urlPath: '',
                    relay: '/managed/relay/b1',
                });
                capturedCtx!.setState('isSempConnected', true);
                return capturedCtx!;
            }

            it('sends to the relay base with no Authorization header', async () => {
                const ctx = await relayCtx();
                (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });
                await ctx.sempFetch('/SEMP/v2/monitor/msgVpns?count=10', { headers: { Accept: 'application/json' } });
                const [url, opts] = (globalThis.fetch as any).mock.calls[0];
                expect(url).toBe('/managed/relay/b1/SEMP/v2/monitor/msgVpns?count=10');
                expect(opts.headers).toEqual({ Accept: 'application/json' });
            });

            it('a relay 401 (the gateway session ended) also asks the session owner to sign out', async () => {
                const ctx = await relayCtx();
                const signOut = vi.fn();
                ctx.eventBus.on('rbac:sign-out-requested', signOut);
                (globalThis.fetch as any).mockResolvedValue({ status: 401, ok: false });
                await ctx.sempFetch('/SEMP');
                expect(ctx.appState.sempCredentials).toBeNull();
                expect(signOut).toHaveBeenCalledTimes(1);
            });

            it.each([403, 502])("a relay %i (read_only, upstream_*) leaves the connection up", async (status) => {
                const ctx = await relayCtx();
                const signOut = vi.fn();
                ctx.eventBus.on('rbac:sign-out-requested', signOut);
                (globalThis.fetch as any).mockResolvedValue({ status, ok: false });
                await ctx.sempFetch('/SEMP');
                expect(ctx.appState.isSempConnected).toBe(true);
                expect(signOut).not.toHaveBeenCalled();
            });
        });

        it('sempFetch without credentials does not assemble or add auth header', async () => {
            // Defensive path: a caller invoking sempFetch before connecting
            // shouldn't crash. With no creds we have nothing to assemble from,
            // so the path is passed to fetch unchanged and no Authorization
            // header is added. The downstream fetch will fail naturally with
            // whatever error a bare path produces — that's the caller's
            // responsibility to handle.
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });
            await capturedCtx!.sempFetch('/SEMP');

            const callArgs = (globalThis.fetch as any).mock.calls[0];
            expect(callArgs[0]).toBe('/SEMP');
            expect(callArgs[1].headers.Authorization).toBeUndefined();

            // A 401 with nothing connected tears down and asks nobody to sign out.
            const signOut = vi.fn();
            capturedCtx!.eventBus.on('rbac:sign-out-requested', signOut);
            (globalThis.fetch as any).mockResolvedValue({ status: 401, ok: false });
            await capturedCtx!.sempFetch('/SEMP');
            expect(signOut).not.toHaveBeenCalled();
        });

        it('sempFetch propagates fetch errors', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (globalThis.fetch as any).mockRejectedValue(new Error('Network error'));
            await expect(capturedCtx!.sempFetch('/SEMP')).rejects.toThrow('Network error');
        });

        it('sempFetch propagates synchronous URL construction TypeError', async () => {
            // fetch() can throw synchronously (not via a rejected Promise) when the URL
            // is unparseable — e.g. contains a NUL byte. The wrapper must let that throw
            // propagate so the caller can handle it, same as it does for rejections.
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (globalThis.fetch as any).mockImplementation(() => {
                throw new TypeError("Failed to construct 'URL': Invalid URL");
            });
            await expect(capturedCtx!.sempFetch('/\0bad')).rejects.toThrow(TypeError);
        });

        it('provides copyToClipboard that writes to clipboard', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            await capturedCtx!.copyToClipboard('test text');
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
        });

        it('copyToClipboard with button element shows feedback', async () => {
            vi.useFakeTimers();
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const btn = document.createElement('button');
            btn.innerHTML = '<svg>icon</svg>';
            btn.classList.add('btn-secondary');

            await capturedCtx!.copyToClipboard('test text', btn);

            expect(btn.textContent).toBe('Copied!');
            expect(btn.classList.contains('btn-success')).toBe(true);
            expect(btn.classList.contains('btn-secondary')).toBe(false);

            vi.advanceTimersByTime(2000);
            expect(btn.innerHTML).toBe('<svg>icon</svg>');
            expect(btn.classList.contains('btn-secondary')).toBe(true);
            expect(btn.classList.contains('btn-success')).toBe(false);

            vi.useRealTimers();
        });

        it('copyToClipboard does nothing for empty text', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            await capturedCtx!.copyToClipboard('');
            expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
        });

        it('copyToClipboard handles clipboard errors', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (navigator.clipboard.writeText as any).mockRejectedValueOnce(new Error('denied'));
            await capturedCtx!.copyToClipboard('text');
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('clipboard'), expect.any(Error));
        });
    });

    describe('renderSidebar', () => {
        it('renders modules with custom icons', async () => {
            const mod = createMockModule({
                id: 'test-module', name: 'Test',
                icon: '<svg class="custom-icon"></svg>'
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const nav = document.getElementById('sidebar-nav')!;
            expect(nav.innerHTML).toContain('custom-icon');
        });

        it('renders default icon when module has no icon', async () => {
            const mod = createMockModule({ id: 'test-module', name: 'Test' });
            // Explicitly no icon
            delete (mod as any).icon;
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            const nav = document.getElementById('sidebar-nav')!;
            expect(nav.innerHTML).toContain('circle');
        });

        it('sidebar item click navigates to module', async () => {
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });
            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            const navItems = document.querySelectorAll('.nav-item');
            const navB = Array.from(navItems).find(el => (el as HTMLElement).dataset.moduleId === 'b') as HTMLElement;
            navB.click();

            expect(document.getElementById('page-title')?.textContent).toBe('B');
        });

        it('does nothing if sidebarNav is missing', async () => {
            document.body.innerHTML = `
                <div id="module-container"></div>
                <h1 id="page-title"></h1>
                <template data-module-id="test-module"><div>content</div></template>
            `;
            const mod = createMockModule({ id: 'test-module' });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            // Despite the missing sidebar nav, the module pipeline must not
            // short-circuit: install() runs, the wrapper is mounted, and the
            // first module is activated by navigateTo (hidden class removed).
            expect(mod.install).toHaveBeenCalled();
            const wrapper = document.getElementById('module-view-test-module');
            expect(wrapper).not.toBeNull();
            expect(wrapper?.classList.contains('hidden')).toBe(false);
        });
    });

    describe('updateGlobalUI', () => {
        it('handles missing status indicators gracefully', async () => {
            document.body.innerHTML = `
                <nav id="sidebar-nav"></nav>
                <div id="module-container"></div>
                <h1 id="page-title"></h1>
                <template data-module-id="test-module"><div>content</div></template>
            `;
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            // Should not throw even without status indicators, and state should still update
            expect(() => capturedCtx!.setState('isConnected', true)).not.toThrow();
            expect(capturedCtx!.appState.isConnected).toBe(true);
        });
    });

    describe('navigateTo edge cases', () => {
        it('navigates when pageTitle is missing', async () => {
            document.body.innerHTML = `
                <nav id="sidebar-nav"></nav>
                <div id="module-container"></div>
                <template data-module-id="a"><div>A</div></template>
                <template data-module-id="b"><div>B</div></template>
            `;
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            kernel.navigateTo('b');
            expect(document.getElementById('module-view-a')?.classList.contains('hidden')).toBe(true);
            expect(document.getElementById('module-view-b')?.classList.contains('hidden')).toBe(false);
        });

        it('navigates when moduleContainer is missing', async () => {
            document.body.innerHTML = `
                <nav id="sidebar-nav"></nav>
                <h1 id="page-title"></h1>
                <template data-module-id="a"><div>A</div></template>
            `;
            const mod = createMockModule({ id: 'a', name: 'A' });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            kernel.navigateTo('a');

            // installModule bails when moduleContainer is null (kernel.ts:119),
            // so 'a' is never added to loadedModules — navigateTo must early-return
            // at kernel.ts:157 WITHOUT mutating page title or DOM.
            expect(document.getElementById('page-title')?.textContent).toBe('');
            expect(document.getElementById('module-view-a')).toBeNull();
        });

        it('navigates when moduleContainer is removed after start', async () => {
            const modA = createMockModule({ id: 'a', name: 'A' });
            const modB = createMockModule({ id: 'b', name: 'B' });
            setupDOM(['a', 'b']);
            const kernel = new Kernel([reg(modA, 100), reg(modB, 50)]);
            await kernel.start();

            // Remove module-container from DOM after modules are loaded
            const mc = document.getElementById('module-container')!;
            mc.parentNode!.removeChild(mc);

            // Forcibly null out the private moduleContainer reference
            (kernel as any).moduleContainer = null;

            // navigateTo should still work without throwing when moduleContainer is null
            kernel.navigateTo('b');
            expect(document.getElementById('page-title')?.textContent).toBe('B');
        });
    });

    describe('start() edge cases', () => {
        it('starts with no sidebar toggle', async () => {
            document.body.innerHTML = `
                <nav id="sidebar-nav"></nav>
                <div id="module-container"></div>
                <h1 id="page-title"></h1>
                <template data-module-id="test-module"><div>content</div></template>
            `;
            const mod = createMockModule({ id: 'test-module' });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();
            // No toggle button, should not throw
        });

        it('starts with no module container', async () => {
            document.body.innerHTML = `
                <nav id="sidebar-nav"></nav>
                <h1 id="page-title"></h1>
                <template data-module-id="test-module"><div>content</div></template>
            `;
            const mod = createMockModule({ id: 'test-module' });
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();
        });
    });

    describe('managed RBAC visibility', () => {
        const nav = () => document.getElementById('sidebar-nav')!;

        it('hides admin-only modules from the sidebar for a non-admin session', async () => {
            let ctx: AppContext | null = null;
            const qb = createMockModule({ id: 'queue-browser', name: 'Browser', install: vi.fn(async c => { ctx = c; }) });
            const mgr = createMockModule({ id: 'user-management', name: 'Users' });
            setupDOM(['queue-browser', 'user-management']);
            const kernel = new Kernel([reg(qb, 80), reg(mgr, 20)]);
            await kernel.start();

            // No managed session yet → both visible.
            expect(nav().innerHTML).toContain('Users');

            ctx!.setState('managed', managedSession({ admin: false }));
            ctx!.eventBus.emit('rbac:changed');

            expect(nav().innerHTML).toContain('Browser');
            expect(nav().innerHTML).not.toContain('Users');
        });

        it('shows admin-only modules for an admin session', async () => {
            let ctx: AppContext | null = null;
            const qb = createMockModule({ id: 'queue-browser', name: 'Browser', install: vi.fn(async c => { ctx = c; }) });
            const mgr = createMockModule({ id: 'user-management', name: 'Users' });
            setupDOM(['queue-browser', 'user-management']);
            const kernel = new Kernel([reg(qb, 80), reg(mgr, 20)]);
            await kernel.start();

            ctx!.setState('managed', managedSession({ admin: true }));
            ctx!.eventBus.emit('rbac:changed');

            expect(nav().innerHTML).toContain('Users');
            // Active module (queue-browser) keeps its highlight across the re-render.
            const active = Array.from(document.querySelectorAll('.nav-item')).filter(el => el.classList.contains('active'));
            expect(active.length).toBe(1);
            expect((active[0] as HTMLElement).dataset.moduleId).toBe('queue-browser');
            // Active module still visible → no navigation away.
            expect(document.getElementById('page-title')?.textContent).toBe('Browser');
        });

        it('navigates away from a now-hidden active module on rbac:changed', async () => {
            let ctx: AppContext | null = null;
            const qb = createMockModule({ id: 'queue-browser', name: 'Browser', install: vi.fn(async c => { ctx = c; }) });
            const mgr = createMockModule({ id: 'user-management', name: 'Users' });
            setupDOM(['queue-browser', 'user-management']);
            const kernel = new Kernel([reg(qb, 80), reg(mgr, 20)]);
            await kernel.start();

            kernel.navigateTo('user-management');
            expect(document.getElementById('page-title')?.textContent).toBe('Users');

            ctx!.setState('managed', managedSession({ admin: false }));
            ctx!.eventBus.emit('rbac:changed');

            // user-management hidden → kernel falls back to the highest-priority visible module.
            expect(document.getElementById('page-title')?.textContent).toBe('Browser');
            expect(document.getElementById('module-view-user-management')?.classList.contains('hidden')).toBe(true);
            expect(document.getElementById('module-view-queue-browser')?.classList.contains('hidden')).toBe(false);
        });

        it('skips a hidden module when choosing the first module to activate at start', async () => {
            // user-management installs first (priority 100) and sets a non-admin
            // session during install; first-activation must skip it and land on
            // queue-browser.
            const mgr = createMockModule({
                id: 'user-management', name: 'Users',
                install: vi.fn(async (c: AppContext) => { c.setState('managed', managedSession({ admin: false })); })
            });
            const qb = createMockModule({ id: 'queue-browser', name: 'Browser' });
            setupDOM(['user-management', 'queue-browser']);
            const kernel = new Kernel([reg(mgr, 100), reg(qb, 80)]);
            await kernel.start();

            expect(document.getElementById('page-title')?.textContent).toBe('Browser');
            expect(nav().innerHTML).not.toContain('Users');
        });

        it('hides a module the managed session was not granted', async () => {
            let ctx: AppContext | null = null;
            const qb = createMockModule({ id: 'queue-browser', name: 'Browser', install: vi.fn(async c => { ctx = c; }) });
            const qc = createMockModule({ id: 'queue-copy', name: 'Copy' });
            setupDOM(['queue-browser', 'queue-copy']);
            const kernel = new Kernel([reg(qb, 80), reg(qc, 70)]);
            await kernel.start();
            expect(nav().innerHTML).toContain('Copy');

            ctx!.setState('managed', managedSession({ modules: ['queue-browser'] }));
            ctx!.eventBus.emit('rbac:changed');

            expect(nav().innerHTML).toContain('Browser');
            expect(nav().innerHTML).not.toContain('Copy');
        });

        it('does not navigate when no module is visible after the session changes', async () => {
            let ctx: AppContext | null = null;
            const mgr = createMockModule({ id: 'user-management', name: 'Users', install: vi.fn(async c => { ctx = c; }) });
            setupDOM(['user-management']);
            const kernel = new Kernel([reg(mgr, 100)]);
            await kernel.start();
            expect(document.getElementById('page-title')?.textContent).toBe('Users');

            ctx!.setState('managed', managedSession({ admin: false }));
            ctx!.eventBus.emit('rbac:changed');

            // The only module is now hidden; sidebar empties and there's nowhere
            // to navigate — the kernel leaves the (now-hidden) view as-is without throwing.
            expect(nav().innerHTML).toBe('');
        });
    });

    // The notification center behind the header bell (AppContext.notifications).
    describe('notification center', () => {
        beforeEach(() => {
            sessionStorage.clear();
        });

        /** setupDOM plus the shell's toast container and, optionally, the bell slot. */
        function setupShell(moduleIds: string[], withSlot = true) {
            setupDOM(moduleIds);
            document.body.insertAdjacentHTML('beforeend',
                `${withSlot ? '<div id="notification-bell-slot"></div>' : ''}<div id="toast-container"></div>`);
        }

        it('mounts the bell into #notification-bell-slot and hands every module the same center', async () => {
            const seen: AppContext[] = [];
            const a = createMockModule({ id: 'a', name: 'A', install: vi.fn(async c => { seen.push(c); }) });
            const b = createMockModule({ id: 'b', name: 'B', install: vi.fn(async c => { seen.push(c); }) });
            setupShell(['a', 'b']);
            await new Kernel([reg(a), reg(b)]).start();

            expect(document.querySelector('#notification-bell-slot .notif-bell')).not.toBeNull();
            expect(document.querySelector('dialog.notif-drawer')).not.toBeNull();
            expect(seen[0].notifications).toBe(seen[1].notifications);
            seen[0].notifications.add('warn', 'A', 'from a module, no toast');
            expect(document.querySelector('.notif-badge')!.textContent).toBe('1');
        });

        it('mounts no bell when the shell has no slot', async () => {
            setupShell(['a'], false);
            await new Kernel([reg(createMockModule({ id: 'a' }))]).start();
            expect(document.querySelector('.notif-bell')).toBeNull();
            expect(document.querySelector('dialog.notif-drawer')).toBeNull();
        });

        it('records ok/warn/error toasts tagged with the module the user is on (App during install), and skips info toasts', async () => {
            let ctx: AppContext | null = null;
            const mod = createMockModule({
                id: 'queue-browser', name: 'Queue Browser',
                install: vi.fn(async c => { ctx = c; showToast('Saved scheme moved to wss', 'warn'); }),
            });
            setupShell(['queue-browser']);
            await new Kernel([reg(mod)]).start();

            showToast('Queue "orders" bound', 'ok');
            showToast('Loading saved config', 'info');
            showToast('Broker rejected message', 'error');

            expect(ctx!.notifications.entries().map(e => [e.level, e.module, e.text])).toEqual([
                ['warn', 'App', 'Saved scheme moved to wss'],
                ['ok', 'Queue Browser', 'Queue "orders" bound'],
                ['error', 'Queue Browser', 'Broker rejected message'],
            ]);
        });

        it('records the connection lifecycle from the bus, naming broker and VPN', async () => {
            let ctx: AppContext | null = null;
            const mod = createMockModule({ id: 'connections', install: vi.fn(async c => { ctx = c; }) });
            setupShell(['connections']);
            await new Kernel([reg(mod)]).start();
            const c = ctx!;

            // Events with no published identity still read sensibly. First, so
            // the empty broker is not a "new broker" that clears the list.
            c.eventBus.emit('client:connected', { session: {} });
            c.eventBus.emit('semp:connected');
            c.setState('solaceConnection', { host: 'b1', protocol: 'wss', port: '443', urlPath: '', vpn: 'v1', user: 'u', pass: 'p' });
            c.eventBus.emit('client:connected', { session: {} });
            c.setState('solaceConnection', null);
            c.eventBus.emit('client:disconnected');
            c.setState('sempCredentials', { user: 'u', pass: 'p', baseUrl: 'https://b1:943', protocol: 'https', host: 'b1', port: '943', urlPath: '' });
            c.eventBus.emit('semp:connected');
            c.setState('sempCredentials', null);
            c.eventBus.emit('semp:disconnected');

            expect(c.notifications.entries().map(e => [e.level, e.module, e.text])).toEqual([
                ['info', 'Connections', 'Connected to broker "", VPN "".'],
                ['info', 'Connections', 'SEMP connected to "".'],
                ['info', 'Connections', 'Connected to broker "b1", VPN "v1".'],
                ['info', 'Connections', 'Disconnected from broker "b1", VPN "v1".'],
                ['info', 'Connections', 'SEMP connected to "b1".'],
                ['info', 'Connections', 'SEMP disconnected.'],
            ]);
        });

        it('a Direct connect to a new broker starts a fresh list; a Provisioned session keeps it', async () => {
            let ctx: AppContext | null = null;
            const mod = createMockModule({ id: 'connections', install: vi.fn(async c => { ctx = c; }) });
            setupShell(['connections']);
            await new Kernel([reg(mod)]).start();
            const c = ctx!;
            const connect = (host: string) => {
                c.setState('solaceConnection', { host, protocol: 'wss', port: '443', urlPath: '', vpn: 'v1', user: 'u', pass: '' });
                c.eventBus.emit('client:connected', { session: {} });
            };

            connect('b1');
            c.notifications.add('ok', 'Queue Browser', 'bound on b1');
            c.setState('managed', managedSession({ broker: 'b2' }));
            connect('b2');
            expect(c.notifications.entries().map(e => e.text)).toContain('bound on b1');

            c.setState('managed', null);
            connect('b3');
            expect(c.notifications.entries().map(e => e.text)).toEqual(['Connected to broker "b3", VPN "v1".']);
        });
    });
});
