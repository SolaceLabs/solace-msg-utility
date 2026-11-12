import { describe, it, expect, vi, afterEach } from 'vitest';
import { modules } from '../src/registry';
import { Kernel } from '../src/core/kernel';
import { ACTIVE_MODULES as STANDARD_MANIFEST } from '../src/variants/standard';
import type { RegisteredModule } from '../src/core/types';

/**
 * The registry's job is to (a) register the modules the app ships with and
 * (b) hand them to the kernel in a shape that yields the intended install +
 * sidebar ordering. These tests prove both without hardcoding which modules
 * are present or what priority numbers they carry — adding, removing, or
 * reordering a module is a one-line edit in `src/registry.ts` and does not
 * require touching this test file.
 */
describe('registry', () => {
    describe('shape', () => {
        it('every entry pairs a PwaModule with a numeric priority', () => {
            // Registered modules must have the minimum shape the kernel needs;
            // this catches a typo in the registry (e.g. forgetting to wrap a
            // module in { module, priority }) without depending on how many
            // or which modules exist.
            expect(modules.length).toBeGreaterThan(0);
            modules.forEach(r => {
                expect(typeof r.module.id).toBe('string');
                expect(typeof r.module.name).toBe('string');
                expect(typeof r.module.install).toBe('function');
                expect(typeof r.priority).toBe('number');
                expect(Number.isFinite(r.priority)).toBe(true);
            });
        });

        it('module ids are unique', () => {
            // Duplicate ids would make the build's template-injection map
            // ambiguous and break navigateTo(). Generic — holds for any set
            // of registered modules.
            const ids = modules.map(r => r.module.id);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });

    describe('kernel integration — the registry\'s actual job', () => {
        /**
         * Build a sibling registry where every real module's `install()` is
         * replaced with a spy that records the id. Preserves the priorities
         * declared in `src/registry.ts` so the kernel's sort exercises the
         * real ordering, but isolates the test from each module's DOM/service
         * wiring (which would need a full shell to succeed).
         */
        function spyRegistry(): { spied: RegisteredModule[]; order: string[] } {
            const order: string[] = [];
            const spied: RegisteredModule[] = modules.map(r => ({
                module: {
                    name: r.module.name,
                    id: r.module.id,
                    icon: r.module.icon,
                    install: vi.fn(async () => { order.push(r.module.id); }),
                },
                priority: r.priority,
            }));
            return { spied, order };
        }

        function shellDOM(entries: RegisteredModule[]): void {
            document.body.innerHTML = `
                <div id="main-sidebar"><button id="btn-sidebar-toggle"></button></div>
                <nav id="sidebar-nav"></nav>
                <div id="module-container"></div>
                <h1 id="page-title"></h1>
                <div id="status-indicator-client"></div>
                <div id="status-indicator-semp"></div>
                ${entries.map(r => `<template data-module-id="${r.module.id}"><div></div></template>`).join('')}
            `;
        }

        it('every registered module is installed when the kernel starts', async () => {
            const { spied, order } = spyRegistry();
            shellDOM(spied);

            await new Kernel(spied).start();

            expect(order.length).toBe(spied.length);
            expect(new Set(order)).toEqual(new Set(spied.map(r => r.module.id)));
        });

        it('registry ids and priorities equal the standard variant manifest', () => {
            // The registry resolves the active variant (the registry plugin builds
            // `standard` under vitest). Swapped, dropped or collapsed priorities
            // would change install and sidebar order. The kernel's sort itself is
            // tests/core/kernel.test.ts > "installs modules in priority order".
            const resolved = Object.fromEntries(modules.map(r => [r.module.id, r.priority]));
            expect(resolved).toEqual(STANDARD_MANIFEST);
        });
    });

    describe('setup guardrails', () => {
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
