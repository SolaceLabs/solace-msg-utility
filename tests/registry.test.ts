import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * The registry resolves each id of the active variant's manifest to its
 * module, and refuses a manifest id it cannot resolve.
 */
describe('registry', () => {
    describe('resolution and setup guardrails', () => {
        afterEach(() => {
            vi.doUnmock('../src/variants/_active');
            vi.doUnmock('virtual:module-registry');
            vi.resetModules();
        });

        /** Load a fresh registry against a hand-written manifest and entry-file map. */
        async function loadRegistry(manifest: Record<string, number>, files: Record<string, unknown>) {
            vi.resetModules();
            vi.doMock('../src/variants/_active', () => ({ ACTIVE_MODULES: manifest }));
            vi.doMock('virtual:module-registry', () => ({ moduleFiles: files }));
            return import('../src/registry');
        }

        it('resolves each manifest id to the module its entry file exports, with its priority', async () => {
            const alpha = { id: 'alpha', name: 'Alpha', install: vi.fn() };
            const beta = { id: 'beta', name: 'Beta', install: vi.fn() };
            const { modules } = await loadRegistry({ alpha: 10, beta: 20 }, { alpha: { alpha }, beta: { default: beta } });
            expect(modules).toEqual([{ module: alpha, priority: 10 }, { module: beta, priority: 20 }]);
        });

        it('throws when a manifest id has no entry file', async () => {
            await expect(loadRegistry({ ghost: 1 }, {})).rejects.toThrow(
                /"ghost" is in the active variant manifest but the module registry has no entry file/
            );
        });

        it('throws when the entry file exports no object with the matching id', async () => {
            await expect(loadRegistry({ ghost: 1 }, { ghost: { default: { id: 'other' } } })).rejects.toThrow(
                /entry file for "ghost" does not export an object with id="ghost"/
            );
        });
    });
});
