import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

describe('main.ts entry point', () => {
    let startSpy: MockInstance;

    beforeEach(async () => {
        vi.resetModules();
        // Provide minimal DOM for kernel
        document.body.innerHTML = `
            <nav id="sidebar-nav"></nav>
            <div id="module-container"></div>
            <h1 id="page-title"></h1>
            <div id="status-indicator-client"></div>
            <div id="status-indicator-semp"></div>
        `;
        vi.doMock('../src/registry', () => ({ modules: [] }));
        // Import the Kernel after the reset: main.ts then gets this same module
        // instance, so a spy on its prototype sees the kernel main.ts builds.
        const { Kernel } = await import('../src/core/kernel');
        startSpy = vi.spyOn(Kernel.prototype, 'start').mockResolvedValue(undefined);
    });

    afterEach(() => {
        startSpy.mockRestore();
        document.body.innerHTML = '';
    });

    it('starts the kernel at once when solace is available', async () => {
        (window as any).solace = {};

        await import('../src/main');

        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('starts the kernel at once while the solclient script is still loading', async () => {
        (window as any).solace = undefined;
        const script = document.createElement('script');
        script.src = 'https://example.com/solclient.js';
        document.body.appendChild(script);

        await import('../src/main');

        // No load event has fired: the start did not wait for one.
        expect(startSpy).toHaveBeenCalledTimes(1);
        script.dispatchEvent(new Event('load'));
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('starts the kernel at once when the solclient script has failed', async () => {
        (window as any).solace = undefined;
        const script = document.createElement('script');
        script.src = 'https://example.com/solclient.js';
        document.body.appendChild(script);
        script.dispatchEvent(new Event('error'));

        await import('../src/main');

        expect(startSpy).toHaveBeenCalledTimes(1);
    });
});
