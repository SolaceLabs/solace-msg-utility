import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showToast } from '../../src/core/toast';

/**
 * Tests for the auto-dismiss lifecycle. The happy-path "append + add class" is
 * already exercised by the module tests that call showToast on user actions.
 * These tests target the two `setTimeout` callbacks (visible → leaving → remove)
 * that were previously never fired in the suite, letting a regression remove
 * the cleanup path without any test noticing.
 */
describe('core/toast', () => {
    beforeEach(() => {
        // Host element is declared once in the real app shell; tests need it present.
        const c = document.createElement('div');
        c.id = 'toast-container';
        document.body.appendChild(c);
    });

    it('without #toast-container: returns silently, no DOM mutation', () => {
        document.body.innerHTML = '';
        expect(() => showToast('hello')).not.toThrow();
        expect(document.querySelectorAll('.toast').length).toBe(0);
    });

    it('append + requestAnimationFrame flips to toast--visible', () => {
        // rAF is fired synchronously by jsdom's polyfill after the current task.
        // Wrapping showToast and flushing rAF via Promise resolution is the cleanest
        // way to observe the "next frame: add visible class" side effect.
        const rafCallbacks: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            rafCallbacks.push(cb);
            return 1;
        });

        showToast('hi', 'ok');
        const toast = document.querySelector('.toast.toast--ok')!;
        expect(toast).toBeTruthy();
        expect(toast.classList.contains('toast--visible')).toBe(false); // not yet

        // Fire the queued rAF callback — flips to visible.
        rafCallbacks.forEach(cb => cb(0));
        expect(toast.classList.contains('toast--visible')).toBe(true);
    });

    it('after durationMs: toast--visible removed, toast--leaving added', () => {
        vi.useFakeTimers();
        showToast('hi', 'ok', 500);
        const toast = document.querySelector('.toast')!;

        // Flip to visible first (simulate the rAF) so the "visible → leaving" transition
        // has a before-state to leave from.
        toast.classList.add('toast--visible');

        vi.advanceTimersByTime(500);
        expect(toast.classList.contains('toast--visible')).toBe(false);
        expect(toast.classList.contains('toast--leaving')).toBe(true);
        // Still attached — removal happens after FADE_OUT_MS more.
        expect(toast.parentElement).not.toBeNull();
    });

    it('after durationMs + FADE_OUT_MS: toast is removed from container', () => {
        vi.useFakeTimers();
        showToast('hi', 'warn', 300);
        const container = document.getElementById('toast-container')!;
        expect(container.children.length).toBe(1);

        // Full lifecycle: advance past the outer duration AND the nested fade-out.
        // 200 ms FADE_OUT_MS is a const in toast.ts; adding a margin keeps the
        // test robust if someone bumps the fade constant by a few ms.
        vi.advanceTimersByTime(300 + 200);
        expect(container.children.length).toBe(0);
    });

    it('does not throw if the toast was manually detached before the fade-out fires', () => {
        // Covers the `if (toast.parentElement === container)` guard: a caller (or
        // a future "clear all toasts" button) could yank the toast out of the DOM
        // before the timer fires. The removeChild must not throw.
        vi.useFakeTimers();
        showToast('hi', 'error', 100);
        const toast = document.querySelector('.toast')!;

        vi.advanceTimersByTime(100); // moved to --leaving, fade-out timer queued
        toast.remove(); // simulate external detach before FADE_OUT_MS elapses
        expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    });
});
