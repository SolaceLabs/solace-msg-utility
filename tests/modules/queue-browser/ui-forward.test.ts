import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui } from '../../../src/modules/queue-browser/ui-core.js';
import { wireForward } from '../../../src/modules/queue-browser/ui-forward.js';
import { state } from '../../../src/modules/queue-browser/state.js';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

function createBrowserDOM() {
    return loadModuleDOM('queue-browser');
}

describe('queue-browser/ui-forward', () => {
    beforeEach(() => {
        const container = createBrowserDOM();
        document.body.appendChild(container);
        ui.initElements(container);
        state.forwardQueue = [];
        // Spy (not direct reassign) so vi.restoreAllMocks() in the global afterEach
        // puts the real generateUuid back even if a test throws before its own
        // cleanup line would run. Counter is local per-test so there's no
        // between-test carryover of the "next UUID" value.
        let counter = 0;
        vi.spyOn(ui, 'generateUuid').mockImplementation(() => `uuid-${counter++}`);
    });

    describe('getStatusIcon()', () => {
        it('returns gray circle for QUEUED', () => {
            expect(ui.getStatusIcon('QUEUED')).toContain('svg');
            expect(ui.getStatusIcon('QUEUED')).toContain('circle');
        });

        it('returns spinner for SENDING', () => {
            expect(ui.getStatusIcon('SENDING')).toContain('icon-spin');
        });

        it('returns checkmark for SUCCESS', () => {
            expect(ui.getStatusIcon('SUCCESS')).toContain('polyline');
        });

        it('returns red circle for FAILED', () => {
            expect(ui.getStatusIcon('FAILED')).toContain('disconnected');
        });

        it('returns empty for unknown status', () => {
            expect(ui.getStatusIcon('UNKNOWN')).toBe('');
        });
    });

    describe('showForwardModal()', () => {
        it('shows modal with single message', () => {
            const msg = { id: 'msg-1', content: 'Hello World' };
            ui.showForwardModal(msg);

            expect(state.forwardQueue.length).toBe(1);
            expect(state.forwardQueue[0].id).toBe('msg-1');
            expect(state.forwardQueue[0].status).toBe('QUEUED');
            expect(ui.getElements().modalForward.open).toBe(true);
        });

        it('shows modal with array of messages', () => {
            const msgs = [
                { id: 'msg-1', content: 'First' },
                { id: 'msg-2', content: 'Second' }
            ];
            ui.showForwardModal(msgs);

            expect(state.forwardQueue.length).toBe(2);
            // Counter shows "done / total" — zero completed at modal open.
            expect(ui.getElements().elForwardQueueCount.textContent).toBe('0 / 2');
        });

        it('resets modal state', () => {
            const els = ui.getElements();
            els.inputForwardDestName.value = 'old-dest';
            els.elForwardError.style.display = 'block';

            ui.showForwardModal({ id: 'msg-1', content: 'test' });

            expect(els.inputForwardDestName.value).toBe('');
            expect(els.elForwardError.style.display).toBe('none');
            expect(els.btnForwardSend.disabled).toBe(false);
        });

        it('regenerates correlationValue when generated UUID collides within the batch', () => {
            // Force the first two generateUuid() calls to return the same value, then
            // a unique one. The batch-internal Set check must catch the collision and
            // regenerate so every item in state.forwardQueue ends up with a unique
            // correlationValue.
            const seq = ['dup-cv', 'dup-cv', 'unique-cv', 'cv-3'];
            let i = 0;
            (ui.generateUuid as any).mockImplementation(() => seq[i++]);

            ui.showForwardModal([
                { id: 'msg-1', content: 'a' },
                { id: 'msg-2', content: 'b' }
            ]);

            const cvs = state.forwardQueue.map((q: any) => q.correlationValue);
            expect(new Set(cvs).size).toBe(2);
            expect(cvs).toEqual(['dup-cv', 'unique-cv']);
        });

        it('regenerates correlationValue when generated UUID collides with an in-flight forward', () => {
            // Wire a hasInFlightForward that reports 'in-flight-cv' as already alive
            // (simulating a prior modal that closed mid-flight, leaving its publish
            // entry in the core publisher's pending map). The first generateUuid()
            // returns the colliding value; the modal must regenerate.
            wireForward({ hasInFlightForward: (cv: string) => cv === 'in-flight-cv' });

            const seq = ['in-flight-cv', 'fresh-cv'];
            let i = 0;
            (ui.generateUuid as any).mockImplementation(() => seq[i++]);

            ui.showForwardModal({ id: 'msg-1', content: 'a' });

            expect(state.forwardQueue[0].correlationValue).toBe('fresh-cv');

            // Restore the default no-op so other tests aren't affected.
            wireForward({ hasInFlightForward: () => false });
        });
    });

    describe('renderForwardList()', () => {
        it('renders forward queue items', () => {
            state.forwardQueue = [
                { originalMsg: { content: 'Hello World' }, id: 'msg-1', correlationValue: 'cv-1', status: 'QUEUED', error: null },
                { originalMsg: { content: 'A very long content string that exceeds the max length limit for display' }, id: 'msg-2', correlationValue: 'cv-2', status: 'FAILED', error: 'Error reason' }
            ];

            ui.renderForwardList();

            const list = ui.getElements().listForwardMsgs;
            expect(list.innerHTML).toContain('msg-1');
            expect(list.innerHTML).toContain('msg-2');
            expect(list.innerHTML).toContain('Error reason');
        });

        it('truncates long content', () => {
            state.forwardQueue = [
                { originalMsg: { content: 'A'.repeat(50) }, id: 'msg-1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            ui.renderForwardList();

            const list = ui.getElements().listForwardMsgs;
            expect(list.innerHTML).toContain('...');
        });

        it('handles empty content', () => {
            state.forwardQueue = [
                { originalMsg: { content: '' }, id: 'msg-1', correlationValue: 'cv-1', status: 'QUEUED', error: null }
            ];
            ui.renderForwardList();
            expect(ui.getElements().listForwardMsgs.innerHTML).toContain('msg-1');
        });

    });

    describe('closeForwardModal()', () => {
        it('hides modal and clears state', () => {
            ui.showForwardModal({ id: 'msg-1', content: 'test' });
            ui.closeForwardModal();

            expect(ui.getElements().modalForward.open).toBe(false);
            expect(state.selectedForwardMsg).toBeNull();
        });
    });

    describe('onForwardSuccess()', () => {
        it('closes modal', () => {
            ui.showForwardModal({ id: 'msg-1', content: 'test' });
            ui.onForwardSuccess();
            expect(ui.getElements().modalForward.open).toBe(false);
        });
    });

    describe('onForwardFailure()', () => {
        it('shows error message string', () => {
            ui.onForwardFailure('Something went wrong');
            expect(ui.getElements().elForwardError.style.display).toBe('block');
            expect(ui.getElements().elForwardError.textContent).toContain('Something went wrong');
        });

        it('shows error from Error object', () => {
            ui.onForwardFailure({ message: 'Error message' });
            expect(ui.getElements().elForwardError.textContent).toContain('Error message');
        });
    });

    describe('updateForwardItemStatus()', () => {
        it('updates item status and icon', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'QUEUED', originalMsg: { content: '' }, id: '1' }];

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            ui.updateForwardItemStatus('cv-1', 'SUCCESS');
            expect(state.forwardQueue[0].status).toBe('SUCCESS');
            expect(statusEl.innerHTML).toContain('svg');
        });

        it('shows error message on FAILED', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'SENDING', originalMsg: { content: '' }, id: '1' }];

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            const errorEl = document.createElement('div');
            errorEl.id = 'error-cv-1';
            errorEl.classList.add('hidden');
            document.body.appendChild(errorEl);

            ui.updateForwardItemStatus('cv-1', 'FAILED', 'Rejected');
            expect(errorEl.textContent).toBe('Rejected');
            expect(errorEl.classList.contains('hidden')).toBe(false);
        });

        it('hides error on non-FAILED status', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'SENDING', originalMsg: { content: '' }, id: '1' }];

            const errorEl = document.createElement('div');
            errorEl.id = 'error-cv-1';
            document.body.appendChild(errorEl);

            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);

            ui.updateForwardItemStatus('cv-1', 'SUCCESS');
            expect(errorEl.classList.contains('hidden')).toBe(true);
        });

        it('increments the "done / total" counter as items reach terminal state', () => {
            // beforeEach already mounted queue-browser DOM and called initElements.
            ui.showForwardModal([
                { id: 'm1', content: 'a' },
                { id: 'm2', content: 'b' },
                { id: 'm3', content: 'c' }
            ]);
            const countEl = ui.getElements().elForwardQueueCount;
            expect(countEl.textContent).toBe('0 / 3');

            // Capture the auto-generated correlation values so we can address each item.
            const [i1, i2, i3] = state.forwardQueue;

            ui.updateForwardItemStatus(i1.correlationValue, 'SUCCESS');
            expect(countEl.textContent).toBe('1 / 3');

            ui.updateForwardItemStatus(i2.correlationValue, 'FAILED', 'Rejected');
            expect(countEl.textContent).toBe('2 / 3');

            // A non-terminal status (SENDING) does NOT increment the counter.
            ui.updateForwardItemStatus(i3.correlationValue, 'SENDING');
            expect(countEl.textContent).toBe('2 / 3');

            ui.updateForwardItemStatus(i3.correlationValue, 'SUCCESS');
            expect(countEl.textContent).toBe('3 / 3');
        });

        it('does nothing with null correlationValue — forwardQueue items unchanged', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'SENDING', originalMsg: { content: '' }, id: '1' }];
            const snapshot = JSON.stringify(state.forwardQueue);
            expect(() => ui.updateForwardItemStatus(null, 'SUCCESS')).not.toThrow();
            expect(JSON.stringify(state.forwardQueue)).toBe(snapshot);
        });

        it('does nothing with null forwardQueue — state stays null', () => {
            state.forwardQueue = null;
            expect(() => ui.updateForwardItemStatus('cv-1', 'SUCCESS')).not.toThrow();
            // Guard must not coerce a null queue into an array.
            expect(state.forwardQueue).toBeNull();
        });
    });

    describe('checkForwardCompletion()', () => {
        it('all SUCCESS → "Send Complete" disabled', () => {
            state.forwardQueue = [
                { correlationValue: 'cv-1', status: 'SUCCESS' },
                { correlationValue: 'cv-2', status: 'SUCCESS' }
            ];

            ui.checkForwardCompletion();

            const btn = ui.getElements().btnForwardSend;
            expect(btn.textContent).toBe('Send Complete');
            expect(btn.disabled).toBe(true);
        });

        it('any FAILED (with no pending) → "Resend failed messages (N)" enabled', () => {
            state.forwardQueue = [
                { correlationValue: 'cv-1', status: 'SUCCESS' },
                { correlationValue: 'cv-2', status: 'FAILED' },
                { correlationValue: 'cv-3', status: 'FAILED' }
            ];

            ui.checkForwardCompletion();

            const btn = ui.getElements().btnForwardSend;
            expect(btn.textContent).toBe('Resend failed messages (2)');
            expect(btn.disabled).toBe(false);
            // Re-enables destination controls so the user can target a different
            // destination on retry.
            expect(ui.getElements().inputForwardDestType.disabled).toBe(false);
            expect(ui.getElements().inputForwardDestName.disabled).toBe(false);
        });

        it('type=Original on completion keeps Name input disabled (respects the per-type rule)', () => {
            ui.getElements().inputForwardDestType.value = 'Original';
            state.forwardQueue = [
                { correlationValue: 'cv-1', status: 'FAILED' }
            ];

            ui.checkForwardCompletion();

            // Type is re-enabled (so user can switch away from Original), but
            // Name stays disabled because Original implies per-message targeting.
            expect(ui.getElements().inputForwardDestType.disabled).toBe(false);
            expect(ui.getElements().inputForwardDestName.disabled).toBe(true);
        });

        it('does not touch button or inputs while items are still SENDING/QUEUED', () => {
            const btn = ui.getElements().btnForwardSend;
            btn.disabled = false;
            btn.textContent = 'Sending...';

            state.forwardQueue = [
                { correlationValue: 'cv-1', status: 'SUCCESS' },
                { correlationValue: 'cv-2', status: 'SENDING' }
            ];

            ui.checkForwardCompletion();
            expect(btn.textContent).toBe('Sending...');
            expect(btn.disabled).toBe(false);
        });

        it('does nothing when forwardQueue is null — button untouched', () => {
            // Covers the truthy branch of `if (!state.forwardQueue || !els.btnForwardSend)
            // return;` at ui-forward.js:194. forwardQueue is reset to null after
            // the forward modal closes; if checkForwardCompletion runs against
            // that state (e.g. late ACK arrival after close), the guard must
            // short-circuit before reading `.length` / `.filter` on null.
            const btn = ui.getElements().btnForwardSend;
            btn.textContent = 'untouched';
            btn.disabled = false;
            state.forwardQueue = null;

            expect(() => ui.checkForwardCompletion()).not.toThrow();
            // A regression that dropped the guard would throw on .filter(null);
            // with the guard, button text/state are preserved.
            expect(btn.textContent).toBe('untouched');
            expect(btn.disabled).toBe(false);
        });

    });

    describe('updateForwardCount() null-forwardQueue guard', () => {
        it('does nothing when forwardQueue is null — count element untouched', () => {
            // Covers the truthy branch of `if (!state.forwardQueue) return;` at
            // ui-forward.js:179. Late status updates or test-isolation scenarios
            // can hit updateForwardCount after forwardQueue has been reset; the
            // guard prevents a throw on `state.forwardQueue.length`.
            const els = ui.getElements();
            els.elForwardQueueCount.textContent = 'untouched';
            state.forwardQueue = null;

            expect(() => ui.updateForwardCount()).not.toThrow();
            expect(els.elForwardQueueCount.textContent).toBe('untouched');
        });
    });

    describe('updateForwardNameInputState()', () => {
        it('type=Original disables Name input and clears value', () => {
            const els = ui.getElements();
            els.inputForwardDestName.value = 'stale';
            els.inputForwardDestName.disabled = false;
            els.inputForwardDestType.value = 'Original';

            ui.updateForwardNameInputState();

            expect(els.inputForwardDestName.disabled).toBe(true);
            expect(els.inputForwardDestName.value).toBe('');
            expect(els.inputForwardDestName.placeholder).toContain('each message');
        });

        it('type=Topic or Queue enables Name input with default placeholder', () => {
            const els = ui.getElements();
            els.inputForwardDestName.disabled = true;
            els.inputForwardDestType.value = 'Topic';

            ui.updateForwardNameInputState();

            expect(els.inputForwardDestName.disabled).toBe(false);
            expect(els.inputForwardDestName.placeholder).toBe('Queue Or Topic Name');
        });
    });

    describe('updateForwardItemStatus edge cases', () => {
        it('does nothing when item not found in forwardQueue — existing items unchanged', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'QUEUED', originalMsg: { content: '' }, id: '1' }];
            const snapshot = JSON.stringify(state.forwardQueue);
            expect(() => ui.updateForwardItemStatus('nonexistent', 'SUCCESS')).not.toThrow();
            expect(JSON.stringify(state.forwardQueue)).toBe(snapshot);
        });

        it('handles missing icon container', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'QUEUED', originalMsg: { content: '' }, id: '1' }];
            // No status-cv-1 element in DOM
            ui.updateForwardItemStatus('cv-1', 'SUCCESS');
            expect(state.forwardQueue[0].status).toBe('SUCCESS');
        });

        it('handles missing error container', () => {
            state.forwardQueue = [{ correlationValue: 'cv-1', status: 'QUEUED', originalMsg: { content: '' }, id: '1' }];
            const statusEl = document.createElement('div');
            statusEl.id = 'status-cv-1';
            document.body.appendChild(statusEl);
            // No error-cv-1 element
            ui.updateForwardItemStatus('cv-1', 'FAILED', 'error msg');
            expect(state.forwardQueue[0].status).toBe('FAILED');
        });
    });

});
