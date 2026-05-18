import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ui } from '../../../src/modules/queue-discovery/ui.js';

describe('queue-discovery/ui', () => {
    describe('setupSearchableSelect', () => {
        it('filters options on input (synchronous mode via debounceMs=0)', () => {
            const input = document.createElement('input');
            const list = document.createElement('div');
            list.innerHTML = `
                <div class="dropdown-option">Apple</div>
                <div class="dropdown-option">Banana</div>
                <div class="dropdown-option">Avocado</div>
            `;
            document.body.appendChild(input);
            document.body.appendChild(list);

            // debounceMs=0 → filter runs synchronously on input (test convenience).
            ui.setupSearchableSelect(input, list, vi.fn(), null, 0);

            input.value = 'app';
            input.dispatchEvent(new Event('input'));
            expect(list.classList.contains('show')).toBe(true);

            const options = list.querySelectorAll('.dropdown-option');
            expect((options[0] as HTMLElement).style.display).toBe('block'); // Apple
            expect((options[1] as HTMLElement).style.display).toBe('none');  // Banana
            expect((options[2] as HTMLElement).style.display).toBe('none');  // Avocado
        });

        it('debounces filter — runs once after the delay, not per keystroke', () => {
            vi.useFakeTimers();
            const input = document.createElement('input');
            const list = document.createElement('div');
            list.innerHTML = `
                <div class="dropdown-option">Apple</div>
                <div class="dropdown-option">Banana</div>
            `;
            document.body.appendChild(input);
            document.body.appendChild(list);

            // 200ms debounce for the test (exact value doesn't matter, just > 0).
            ui.setupSearchableSelect(input, list, vi.fn(), null, 200);

            // Three rapid keystrokes within the debounce window.
            input.value = 'a';
            input.dispatchEvent(new Event('input'));
            vi.advanceTimersByTime(50);
            input.value = 'ap';
            input.dispatchEvent(new Event('input'));
            vi.advanceTimersByTime(50);
            input.value = 'app';
            input.dispatchEvent(new Event('input'));

            // Filter has NOT run yet — options are still in their initial (visible) state.
            const banana = list.querySelectorAll('.dropdown-option')[1] as HTMLElement;
            expect(banana.style.display).toBe('');

            // After the debounce window, filter runs once with the final value.
            vi.advanceTimersByTime(200);
            expect(banana.style.display).toBe('none');
            const apple = list.querySelectorAll('.dropdown-option')[0] as HTMLElement;
            expect(apple.style.display).toBe('block');

            vi.useRealTimers();
        });

        it('uses INPUT_DEBOUNCE_MS when no debounce arg is given', () => {
            // Smoke check: the default delay is not 0 (would defeat the purpose).
            // We verify behavior, not the literal value, so the constant can move
            // without breaking the test.
            vi.useFakeTimers();
            const input = document.createElement('input');
            const list = document.createElement('div');
            list.innerHTML = `<div class="dropdown-option">Apple</div>`;
            document.body.appendChild(input);
            document.body.appendChild(list);

            ui.setupSearchableSelect(input, list, vi.fn());
            input.value = 'zzz';
            input.dispatchEvent(new Event('input'));

            const opt = list.querySelector('.dropdown-option') as HTMLElement;
            // Hasn't filtered yet — debounce in effect.
            expect(opt.style.display).toBe('');

            // After a generous wait, the filter has committed.
            vi.advanceTimersByTime(2000);
            expect(opt.style.display).toBe('none');

            vi.useRealTimers();
        });

        it('shows all options on focus with empty input', () => {
            const input = document.createElement('input');
            const list = document.createElement('div');
            list.innerHTML = `<div class="dropdown-option" style="display:none">Item</div>`;
            document.body.appendChild(input);
            document.body.appendChild(list);

            ui.setupSearchableSelect(input, list, vi.fn());

            input.value = '';
            input.dispatchEvent(new Event('focus'));
            expect(list.classList.contains('show')).toBe(true);
            expect((list.querySelector('.dropdown-option') as HTMLElement).style.display).toBe('block');
        });

        it('focus does not show all options when input has value', () => {
            const input = document.createElement('input');
            const list = document.createElement('div');
            list.innerHTML = `<div class="dropdown-option" style="display:none">Item</div>`;
            document.body.appendChild(input);
            document.body.appendChild(list);

            ui.setupSearchableSelect(input, list, vi.fn());

            input.value = 'something';
            input.dispatchEvent(new Event('focus'));
            // List should show (becomes visible) but options remain as they were (not reset to block)
            expect(list.classList.contains('show')).toBe(true);
            expect((list.querySelector('.dropdown-option') as HTMLElement).style.display).toBe('none');
        });

        it('hides list on outside click', () => {
            const input = document.createElement('input');
            const list = document.createElement('div');
            document.body.appendChild(input);
            document.body.appendChild(list);

            ui.setupSearchableSelect(input, list, vi.fn());

            list.classList.add('show');
            document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(list.classList.contains('show')).toBe(false);
        });
    });

    describe('renderOptions', () => {
        it('renders items as dropdown options', () => {
            const list = document.createElement('div');
            const onSelect = vi.fn();

            ui.renderOptions(list, ['VPN-1', 'VPN-2'], onSelect);

            const options = list.querySelectorAll('.dropdown-option');
            expect(options.length).toBe(2);
            expect(options[0].textContent).toBe('VPN-1');
        });

        it('calls onSelect callback on click', () => {
            const list = document.createElement('div');
            const onSelect = vi.fn();

            ui.renderOptions(list, ['VPN-1'], onSelect);

            const option = list.querySelector('.dropdown-option') as HTMLElement;
            option.click();
            expect(onSelect).toHaveBeenCalledWith('VPN-1');
        });

        it('shows empty message when no items', () => {
            const list = document.createElement('div');
            ui.renderOptions(list, [], vi.fn());
            expect(list.textContent).toContain('No items found');
        });

        it('shows empty message when items is null', () => {
            const list = document.createElement('div');
            ui.renderOptions(list, null, vi.fn());
            expect(list.textContent).toContain('No items found');
        });
    });

    describe('updateVisibility', () => {
        it('shows warning and hides content when not connected', () => {
            const warning = document.createElement('div');
            warning.classList.add('hidden');
            const content = document.createElement('div');

            ui.updateVisibility(warning, content, false);
            expect(warning.classList.contains('hidden')).toBe(false);
            expect(content.classList.contains('hidden')).toBe(true);
        });

        it('hides warning and shows content when connected', () => {
            const warning = document.createElement('div');
            const content = document.createElement('div');
            content.classList.add('hidden');

            ui.updateVisibility(warning, content, true);
            expect(warning.classList.contains('hidden')).toBe(true);
            expect(content.classList.contains('hidden')).toBe(false);
        });

    });

    describe('clearInputs', () => {
        it('clears VPN and queue inputs, disables button', () => {
            const vpnInput = document.createElement('input');
            vpnInput.value = 'test';
            const queueInput = document.createElement('input');
            queueInput.value = 'queue';
            const btn = document.createElement('button');

            ui.clearInputs(vpnInput, queueInput, btn);
            expect(vpnInput.value).toBe('');
            expect(queueInput.value).toBe('');
            expect(queueInput.disabled).toBe(true);
            expect(btn.disabled).toBe(true);
        });

        it('handles null vpnInput (production shape — refresh-queues passes null vpnInput, real queue/btn)', () => {
            // Production callers at queue-discovery/module.ts:192, 222, 270 pass
            // `null` for vpnInput but always pass real `required()` elements for
            // queueInput and btnCopy. This test exercises that real call shape.
            const queueInput = document.createElement('input');
            queueInput.value = 'stale';
            const btnCopy = document.createElement('button');
            btnCopy.disabled = false;

            ui.clearInputs(null, queueInput, btnCopy);

            // vpnInput=null short-circuited (no throw); the other two were touched.
            expect(queueInput.value).toBe('');
            expect(queueInput.disabled).toBe(true);
            expect(btnCopy.disabled).toBe(true);
        });
    });
});
