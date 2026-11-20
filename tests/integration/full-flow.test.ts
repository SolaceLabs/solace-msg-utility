/**
 * Integration Tests — Cross-Module Communication
 *
 * Tests that verify multiple modules coordinate correctly
 * through the shared Kernel and EventBus. Unit-level Kernel
 * behaviour is covered in core/kernel.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKernel } from '../../src/core/kernel';
import type { PwaModule, EventBus } from '../../src/core/types';

// ---- Test helpers ----

function createAppShell() {
    document.body.innerHTML = `
        <div id="sidebar-nav"></div>
        <button id="btn-sidebar-toggle"></button>
        <div id="main-sidebar"></div>
        <div id="sidebar-account"></div>
        <div id="module-container"><div id="app-loading"></div></div>
        <span id="page-title"></span>
        <div id="notification-bell-slot"></div>
        <div id="toast-container"></div>
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

        const buses: Record<string, EventBus> = {};
        const heardByB: string[] = [];

        const modA: PwaModule = {
            name: 'A', id: 'mod-a',
            async install(ctx) { buses.a = ctx.eventBus; }
        };
        const modB: PwaModule = {
            name: 'B', id: 'mod-b',
            async install(ctx) {
                buses.b = ctx.eventBus;
                ctx.eventBus.on('connection:check-connection', ({ queue }) => heardByB.push(queue));
            }
        };

        createModuleTemplate('mod-a', '<div>A</div>');
        createModuleTemplate('mod-b', '<div>B</div>');

        const kernel = createKernel([{ module: modA, priority: 10 }, { module: modB, priority: 5 }]);
        await kernel.start();

        expect(Object.keys(buses).sort()).toEqual(['a', 'b']);
        expect(buses.a).toBe(buses.b);
        // What one module emits, the other hears.
        buses.a.emit('connection:check-connection', { vpn: 'v', queue: 'q1' });
        expect(heardByB).toEqual(['q1']);
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

        const kernel = createKernel([{ module: mod, priority: 10 }]);
        await kernel.start();

        expect(received.length).toBe(1);
        expect(received[0]).toEqual({ key: 'isConnected', value: true });
    });
});
