import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui, els } from '../../../src/modules/queue-browser/ui-core.js';
import { state } from '../../../src/modules/queue-browser/state.js';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';

function createBrowserDOM() {
    const container = loadModuleDOM('queue-browser');
    // ui-core tests depend on a bound-queues option being present.
    const select = container.querySelector('#browser-bound-queues') as HTMLSelectElement;
    const opt = document.createElement('option');
    opt.value = 'q1';
    opt.textContent = 'q1';
    select.appendChild(opt);
    return container;
}

describe('queue-browser/ui-core', () => {
    let container: HTMLElement;
    // The gate is the module-gate component, injected at install. These ui-core
    // tests drive ui.updateVisibility directly (no Module.install), so inject a
    // stub gate and assert against its show()/hide().
    let gateStub: { show: ReturnType<typeof vi.fn>; hide: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        container = createBrowserDOM();
        document.body.appendChild(container);
        ui.initElements(container);
        gateStub = { show: vi.fn(), hide: vi.fn() };
        ui.setGate(gateStub);
        // Installed by initTable / initDetails at module install; stubbed here.
        ui.renderList = vi.fn();
        ui.clearDetails = vi.fn();

        resetQueueBrowserState();
    });

    describe('showBrowserError()', () => {
        it('shows error message', () => {
            ui.showBrowserError('Test error');
            expect(els.elBrowserError.textContent).toBe('Test error');
            expect(els.elBrowserError.style.display).toBe('block');
        });

        it('hides error when null', () => {
            ui.showBrowserError('error');
            ui.showBrowserError(null);
            expect(els.elBrowserError.style.display).toBe('none');
        });
    });

    describe('showBindError()', () => {
        it('shows bind error and highlights input', () => {
            ui.showBindError('Already bound');
            expect(els.elBindError.textContent).toBe('Already bound');
            expect(els.elBindError.style.display).toBe('block');
            expect(els.inputBind.classList.contains('is-invalid')).toBe(true);
        });

        it('clears bind error', () => {
            ui.showBindError('error');
            ui.showBindError(null);
            expect(els.elBindError.style.display).toBe('none');
            expect(els.inputBind.classList.contains('is-invalid')).toBe(false);
        });
    });

    describe('updateVisibility()', () => {
        it('names the missing ui.setGate() wiring instead of dereferencing null', () => {
            // module.ts wires the gate at install; a module that forgot would
            // otherwise die with "Cannot read properties of null".
            ui.setGate(null);
            els.hdrVpnName.textContent = 'vpn-before';
            expect(() => ui.updateVisibility(false))
                .toThrow('queue-browser: ui.setGate() must run before ui.updateVisibility()');
            // Refused before touching the view.
            expect(els.hdrVpnName.textContent).toBe('vpn-before');
        });

        it('shows gate and hides view when disconnected', () => {
            ui.updateVisibility(false);
            expect(gateStub.show).toHaveBeenCalled();
            expect(els.elActiveView.classList.contains('hidden')).toBe(true);
        });

        it('hides gate and shows view when connected', () => {
            ui.updateVisibility(true);
            expect(gateStub.hide).toHaveBeenCalled();
            expect(els.elActiveView.classList.contains('hidden')).toBe(false);
        });

        it('shows queue name when connected with queue selected', () => {
            els.selectBound.value = 'q1';
            ui.updateVisibility(true);
            expect(els.hdrQueueName.textContent).toBe('q1');
        });

        it('clears queue name when connected with no queue selected', () => {
            els.selectBound.value = '';
            ui.updateVisibility(true);
            expect(els.hdrQueueName.textContent).toBe('');
            expect(els.hdrPermissions.classList.contains('hidden')).toBe(true);
        });
    });

    describe('resetUI()', () => {
        it('removes all bound queue options and resets', () => {
            // Add extra options
            const opt = document.createElement('option');
            opt.value = 'q2';
            opt.textContent = 'q2';
            els.selectBound.appendChild(opt);
            expect(els.selectBound.options.length).toBe(3);

            ui.resetUI();
            expect(els.selectBound.options.length).toBe(1);
            expect(els.selectBound.selectedIndex).toBe(0);
        });
    });

    describe('resetQueueSelection()', () => {
        it('clears queue state and filters', () => {
            state.currentQueue = 'q1';
            state.allMessages = [{ id: '1' }];
            state.displayedMessages = [{ id: '1' }];

            ui.resetQueueSelection();

            expect(state.currentQueue).toBe('');
            expect(state.allMessages).toEqual([]);
            expect(state.displayedMessages).toEqual([]);
            expect(state.currentQueuePermissions).toBeNull();
            expect(els.btnFilter.disabled).toBe(true);
            expect(ui.renderList).toHaveBeenCalledTimes(1);
            expect(ui.clearDetails).toHaveBeenCalledTimes(1);
        });
    });

    describe('addQueueToDropdown()', () => {
        it('adds new queue option and auto-selects', () => {
            ui.addQueueToDropdown('new-queue');
            expect(els.selectBound.value).toBe('new-queue');
        });

        it('does not duplicate existing queue', () => {
            ui.addQueueToDropdown('q1');
            const count = Array.from(els.selectBound.options).filter((o: any) => o.value === 'q1').length;
            expect(count).toBe(1);
        });

    });

    describe('removeBoundQueue()', () => {
        // The template DOM here holds the placeholder and q1; add q2 as a second bound queue.
        function bindSecondQueue() {
            const opt = document.createElement('option');
            opt.value = 'q2';
            opt.textContent = 'q2';
            els.selectBound.appendChild(opt);
        }
        const values = () => Array.from(els.selectBound.options).map((o: any) => o.value);

        it('removing the queue on screen moves the view to the next bound queue', () => {
            bindSecondQueue();
            els.selectBound.value = 'q1';
            const onChange = vi.fn();
            els.selectBound.addEventListener('change', onChange);

            ui.removeBoundQueue('q1');

            expect(values()).toEqual(['', 'q2']);
            expect(els.selectBound.value).toBe('q2');
            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('removing the last bound queue clears the view', () => {
            els.selectBound.value = 'q1';
            state.currentQueue = 'q1';

            ui.removeBoundQueue('q1');

            expect(values()).toEqual(['']);
            expect(els.selectBound.selectedIndex).toBe(0);
            expect(state.currentQueue).toBe('');
        });

        it('removing a queue off screen leaves the view as it is', () => {
            bindSecondQueue();
            els.selectBound.value = 'q1';
            state.currentQueue = 'q1';
            const onChange = vi.fn();
            els.selectBound.addEventListener('change', onChange);

            ui.removeBoundQueue('q2');

            expect(values()).toEqual(['', 'q1']);
            expect([els.selectBound.value, state.currentQueue]).toEqual(['q1', 'q1']);
            expect(onChange).not.toHaveBeenCalled();
        });
    });
});
