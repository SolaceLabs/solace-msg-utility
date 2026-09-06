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

        resetQueueBrowserState();
    });

    describe('initElements()', () => {
        it('caches all elements', () => {
            const cached = ui.getElements();
            expect(cached.container).toBe(container);
            expect(cached.inputBind).toBeTruthy();
            expect(cached.btnBind).toBeTruthy();
            expect(cached.selectBound).toBeTruthy();
            expect(cached.msgList).toBeTruthy();
            expect(cached.detailId).toBeTruthy();
            expect(cached.modalForward).toBeTruthy();
            expect(cached.btnFilter).toBeTruthy();
        });
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

    describe('formatBytes()', () => {
        it('formats bytes correctly', () => {
            expect(ui.formatBytes(0)).toBe('0 B');
            expect(ui.formatBytes(500)).toBe('500 B');
            expect(ui.formatBytes(1024)).toBe('1 KB');
            expect(ui.formatBytes(1048576)).toBe('1 MB');
            expect(ui.formatBytes(1073741824)).toBe('1 GB');
        });

        it('handles NaN', () => {
            expect(ui.formatBytes(NaN)).toBe('0 B');
            expect(ui.formatBytes('not a number')).toBe('0 B');
        });

        it('respects decimal places', () => {
            expect(ui.formatBytes(1536, 1)).toBe('1.5 KB');
        });
    });

    describe('generateUuid()', () => {
        it('returns a UUID-like string', () => {
            const uuid = ui.generateUuid();
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        });

        it('generates unique values', () => {
            const a = ui.generateUuid();
            const b = ui.generateUuid();
            expect(a).not.toBe(b);
        });
    });

    describe('updateVisibility()', () => {
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

            // Need renderList and clearDetails to be defined
            ui.renderList = vi.fn();
            ui.clearDetails = vi.fn();

            ui.resetQueueSelection();

            expect(state.currentQueue).toBe('');
            expect(state.allMessages).toEqual([]);
            expect(state.displayedMessages).toEqual([]);
            expect(state.currentQueuePermissions).toBeNull();
            expect(els.btnFilter.disabled).toBe(true);
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

    describe('resetQueueSelection edge cases', () => {
        // The previous "handles missing filter elements gracefully" test exercised the
        // dead defensive guards on hdrQueueName / hdrPermissions / filter inputs / btnFilter
        // and was deleted when those guards were dropped (all are required elements per
        // the queue-browser/module.ts required() list).

        it('handles missing renderList and clearDetails — state still reset', () => {
            const savedRender = ui.renderList;
            const savedClear = ui.clearDetails;
            ui.renderList = null;
            ui.clearDetails = null;

            state.currentQueue = 'q1';
            state.allMessages = [{ id: 'm1' } as any];
            expect(() => ui.resetQueueSelection()).not.toThrow();
            expect(state.currentQueue).toBe('');
            expect(state.allMessages).toEqual([]);

            ui.renderList = savedRender;
            ui.clearDetails = savedClear;
        });
    });

    describe('formatBytes edge cases', () => {
        it('handles TB range', () => {
            expect(ui.formatBytes(1099511627776)).toBe('1 TB');
        });
    });
});
