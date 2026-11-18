import { describe, it, expect, vi } from 'vitest';
import { createGate, gateOnAdminSession } from '../../../../src/core/components/module-gate';
import { createEventBus } from '../../../../src/core/event-bus';
import type { AppState, ManagedSession } from '../../../../src/core/types';

function container(): HTMLElement {
    return document.createElement('div');
}

describe('core/components/module-gate', () => {
    it('builds a hidden gate card from the shared classes, prepended to the container', () => {
        const c = container();
        c.appendChild(document.createElement('section')); // pre-existing module view
        createGate(c, { id: 'x-gate', title: 'Access Required', message: 'Please do the thing.' });

        const gate = c.querySelector('#x-gate') as HTMLElement;
        expect(gate).not.toBeNull();
        expect(c.firstElementChild).toBe(gate); // prepended ahead of existing content
        expect(gate.classList.contains('card')).toBe(true);
        expect(gate.classList.contains('text-center')).toBe(true);
        expect(gate.classList.contains('p-6')).toBe(true);
        expect(gate.classList.contains('hidden')).toBe(true); // hidden by default
        expect(gate.querySelector('h2')!.textContent).toBe('Access Required');
        expect(gate.querySelector('p')!.textContent).toBe('Please do the thing.');
    });

    it('show() reveals and hide() conceals the gate', () => {
        const c = container();
        const gate = createGate(c, { id: 'x-gate', title: 'T', message: 'M' });
        const el = c.querySelector('#x-gate') as HTMLElement;

        gate.show();
        expect(el.classList.contains('hidden')).toBe(false);
        gate.hide();
        expect(el.classList.contains('hidden')).toBe(true);
    });
});

describe('gateOnAdminSession', () => {
    const session = (username: string, admin: boolean) => ({ username, admin } as ManagedSession);

    function setup(managed: ManagedSession | null) {
        const appState = { managed } as AppState;
        const eventBus = createEventBus();
        const onAdmin = vi.fn();
        const onNoAdmin = vi.fn();
        const applyGate = gateOnAdminSession({ appState, eventBus }, { onAdmin, onNoAdmin });
        return { appState, eventBus, onAdmin, onNoAdmin, applyGate };
    }

    it('runs nothing until applyGate, which picks the handler for the session as it is', () => {
        const t = setup(null);
        expect(t.onNoAdmin).not.toHaveBeenCalled();

        t.applyGate();
        expect(t.onNoAdmin).toHaveBeenCalledTimes(1);

        t.appState.managed = session('alice', true);
        t.applyGate();
        expect(t.onAdmin).toHaveBeenCalledTimes(1);

        t.appState.managed = session('bob', false);
        t.applyGate();
        expect(t.onNoAdmin).toHaveBeenCalledTimes(2);
    });

    it('re-runs on an rbac:changed that changes the user or the admin flag, and not on a replay', () => {
        const t = setup(session('alice', true));
        t.applyGate();
        t.onAdmin.mockClear();

        t.eventBus.emit('rbac:changed'); // same session: a replay
        expect(t.onAdmin).not.toHaveBeenCalled();
        expect(t.onNoAdmin).not.toHaveBeenCalled();

        t.appState.managed = session('alice', false); // admin rights lost
        t.eventBus.emit('rbac:changed');
        expect(t.onNoAdmin).toHaveBeenCalledTimes(1);

        t.appState.managed = session('carol', false); // another user, still no admin
        t.eventBus.emit('rbac:changed');
        expect(t.onNoAdmin).toHaveBeenCalledTimes(2);

        t.appState.managed = null; // signed out
        t.eventBus.emit('rbac:changed');
        expect(t.onNoAdmin).toHaveBeenCalledTimes(3);
        expect(t.onAdmin).not.toHaveBeenCalled();
    });
});
