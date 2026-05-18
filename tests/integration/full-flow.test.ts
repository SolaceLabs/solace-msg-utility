/**
 * Integration Tests — Cross-Module Communication
 *
 * Tests that verify multiple modules coordinate correctly
 * through the shared Kernel and EventBus. Unit-level Kernel
 * behaviour is covered in core/kernel.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kernel } from '../../src/core/kernel';
import type { PwaModule, EventBus, AppContext } from '../../src/core/types';

// ---- Test helpers ----

function createAppShell() {
    document.body.innerHTML = `
        <div id="sidebar-nav"></div>
        <button id="btn-sidebar-toggle"></button>
        <div id="main-sidebar"></div>
        <div id="module-container"></div>
        <span id="page-title"></span>
        <span id="status-indicator-client"></span>
        <span id="status-indicator-semp"></span>
    `;
}

function createModuleTemplate(id: string, html: string) {
    const tpl = document.createElement('template');
    tpl.setAttribute('data-module-id', id);
    tpl.innerHTML = html;
    document.body.appendChild(tpl);
}

describe('Integration: cross-module communication', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('modules share a single EventBus instance through AppContext', async () => {
        createAppShell();

        let busA: EventBus | null = null;
        let busB: EventBus | null = null;

        const modA: PwaModule = {
            name: 'A', id: 'mod-a',
            async install(ctx) { busA = ctx.eventBus; }
        };
        const modB: PwaModule = {
            name: 'B', id: 'mod-b',
            async install(ctx) { busB = ctx.eventBus; }
        };

        createModuleTemplate('mod-a', '<div>A</div>');
        createModuleTemplate('mod-b', '<div>B</div>');

        const kernel = new Kernel([{ module: modA, priority: 10 }, { module: modB, priority: 5 }]);
        await kernel.start();

        expect(busA).toBe(busB);
    });

    it('setState during install is visible to same-module EventBus subscriber', async () => {
        createAppShell();

        const received: any[] = [];

        const mod: PwaModule = {
            name: 'Mod', id: 'mod-a',
            async install(ctx) {
                ctx.eventBus.on('app:state-change', (payload) => received.push(payload));
                ctx.setState('isConnected', true);
            }
        };

        createModuleTemplate('mod-a', '<div>A</div>');

        const kernel = new Kernel([{ module: mod, priority: 10 }]);
        await kernel.start();

        expect(received.length).toBe(1);
        expect(received[0]).toEqual({ key: 'isConnected', value: true });
    });

    it('module A emits event, module B receives it', async () => {
        createAppShell();

        let receivedQueue: string | null = null;
        let emitCtx: AppContext | null = null;

        const modA: PwaModule = {
            name: 'A', id: 'mod-a',
            async install(ctx) { emitCtx = ctx; }
        };
        const modB: PwaModule = {
            name: 'B', id: 'mod-b',
            async install(ctx) {
                ctx.eventBus.on('browser:browse-queue', ({ queue }) => {
                    receivedQueue = queue;
                });
            }
        };

        createModuleTemplate('mod-a', '<div>A</div>');
        createModuleTemplate('mod-b', '<div>B</div>');

        const kernel = new Kernel([{ module: modA, priority: 10 }, { module: modB, priority: 5 }]);
        await kernel.start();

        emitCtx!.eventBus.emit('browser:browse-queue', { queue: 'test-queue' });
        expect(receivedQueue).toBe('test-queue');
    });
});
