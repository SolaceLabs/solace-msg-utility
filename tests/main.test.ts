import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

describe('main.ts entry point', () => {
    let startSpy: Mock<() => Promise<void>>;
    let createKernel: Mock;

    beforeEach(() => {
        vi.resetModules();
        vi.doMock('../src/registry', () => ({ modules: [] }));
        // main.ts gets this kernel from createKernel, so its start() is the spy.
        startSpy = vi.fn(() => Promise.resolve());
        createKernel = vi.fn(() => ({ start: startSpy, navigateTo: vi.fn() }));
        vi.doMock('../src/core/kernel', () => ({ createKernel }));
    });

    afterEach(() => {
        vi.doUnmock('../src/core/kernel');
        vi.doUnmock('../src/registry');
        document.body.innerHTML = '';
    });

    it('starts the kernel at once when solace is available', async () => {
        (window as any).solace = {};

        await import('../src/main');

        expect(createKernel).toHaveBeenCalledWith([]);
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('logs a rejected kernel start instead of leaving an unhandled rejection', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const failure = new Error('start blew up');
        startSpy.mockRejectedValue(failure);

        await import('../src/main');

        await vi.waitFor(() => expect(errSpy).toHaveBeenCalledWith(
            expect.stringContaining('The kernel failed to start'), failure));
        errSpy.mockRestore();
    });
});
