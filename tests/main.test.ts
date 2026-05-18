import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('main.ts entry point', () => {
    beforeEach(() => {
        vi.resetModules();
        // Provide minimal DOM for kernel
        document.body.innerHTML = `
            <nav id="sidebar-nav"></nav>
            <div id="module-container"></div>
            <h1 id="page-title"></h1>
            <div id="status-indicator-client"></div>
            <div id="status-indicator-semp"></div>
        `;
    });

    it('boots immediately when solace is available and DOM is ready', async () => {
        (window as any).solace = {
            SolclientFactoryProperties: vi.fn(() => ({})),
            SolclientFactoryProfiles: { version10: 'version10' },
            LogLevel: { WARN: 'WARN' },
            SolclientFactory: { init: vi.fn() }
        };

        // Mock the modules import to return empty array
        vi.doMock('../src/registry', () => ({ modules: [] }));

        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        await import('../src/main');

        // Allow microtask queue to flush
        await new Promise(r => setTimeout(r, 10));

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Kernel]'));
    });

    it('boots in limited mode when no solace script found', async () => {
        (window as any).solace = undefined;

        vi.doMock('../src/registry', () => ({ modules: [] }));

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await import('../src/main');

        await new Promise(r => setTimeout(r, 10));

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('limited mode'));
    });

    it('boots when solclient script loads after main.ts imports', async () => {
        (window as any).solace = undefined;

        const script = document.createElement('script');
        script.src = 'https://example.com/solclient.js';
        document.body.appendChild(script);

        vi.doMock('../src/registry', () => ({ modules: [] }));

        const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        await import('../src/main');

        // Simulate solclient.js finishing load
        (window as any).solace = {
            SolclientFactoryProperties: vi.fn(() => ({})),
            SolclientFactoryProfiles: { version10: 'version10' },
            LogLevel: { WARN: 'WARN' },
            SolclientFactory: { init: vi.fn() }
        };
        script.dispatchEvent(new Event('load'));

        await new Promise(r => setTimeout(r, 10));

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Kernel]'));
    });

});
