import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import { getLogLevel, setLogLevel } from '../../src/core/logger';
import { LogLevel, DEFAULT_LOG_LEVEL } from '../../src/core/constants';
import type { PwaModule, RegisteredModule, AppContext } from '../../src/core/types';

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

        it('applies ?logLevel= URL override before any kernel logging (closes COV-6)', async () => {
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

        it('provides sempFetch with auth injection', async () => {
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

            const result = await capturedCtx!.sempFetch('http://test:8080/SEMP');
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'http://test:8080/SEMP',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: `Basic ${btoa('admin:admin')}`
                    })
                })
            );
            expect(result).toBe(mockResponse);
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

            (globalThis.fetch as any).mockResolvedValue({ status: 401, ok: false });
            await capturedCtx!.sempFetch('http://test/SEMP');

            expect(capturedCtx!.appState.isSempConnected).toBe(false);
            expect(capturedCtx!.appState.sempCredentials).toBe(null);
            expect(disconnectHandler).toHaveBeenCalled();
        });

        it('sempFetch without credentials does not add auth header', async () => {
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            (globalThis.fetch as any).mockResolvedValue({ status: 200, ok: true });
            await capturedCtx!.sempFetch('http://test/SEMP');

            const callArgs = (globalThis.fetch as any).mock.calls[0];
            expect(callArgs[1].headers.Authorization).toBeUndefined();
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
            await expect(capturedCtx!.sempFetch('http://test/SEMP')).rejects.toThrow('Network error');
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
            await expect(capturedCtx!.sempFetch('http://test/\0bad')).rejects.toThrow(TypeError);
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

        it('provides config from window.APP_CONFIG', async () => {
            (window as any).APP_CONFIG = { useMocks: true, custom: 'value' };
            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            expect(capturedCtx!.config.useMocks).toBe(true);
            expect(capturedCtx!.config.custom).toBe('value');

            // Restore
            (window as any).APP_CONFIG = { useMocks: false };
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

        it('uses default config when APP_CONFIG is missing', async () => {
            const saved = (window as any).APP_CONFIG;
            delete (window as any).APP_CONFIG;

            let capturedCtx: AppContext | null = null;
            const mod = createMockModule({
                id: 'test-module',
                install: vi.fn(async (ctx: AppContext) => { capturedCtx = ctx; })
            });
            setupDOM(['test-module']);
            const kernel = new Kernel([reg(mod)]);
            await kernel.start();

            expect(capturedCtx!.config.useMocks).toBe(false);
            (window as any).APP_CONFIG = saved;
        });
    });
});
