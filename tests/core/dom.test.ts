import { describe, it, expect } from 'vitest';
import { required, attachBackdropClose } from '../../src/core/dom';

describe('core/dom', () => {
    describe('required()', () => {
        it('returns the matched element when it exists', () => {
            const root = document.createElement('div');
            root.innerHTML = '<button id="ok">x</button>';
            const btn = required<HTMLButtonElement>(root, '#ok');
            expect(btn).not.toBeNull();
            expect(btn.tagName).toBe('BUTTON');
        });

        it('throws "Required element missing: <selector>" when the selector matches nothing', () => {
            const root = document.createElement('div');
            // The throw is the contract: install-time fast-fail with a descriptive
            // message instead of silent partial wiring downstream.
            expect(() => required(root, '#missing')).toThrow(/Required element missing: #missing/);
        });
    });

    describe('attachBackdropClose()', () => {
        // jsdom doesn't lay out elements, so getBoundingClientRect returns all
        // zeros. Stub it on each dialog to model a real on-screen box.
        const stubRect = (dialog: HTMLDialogElement, rect: { left: number; top: number; right: number; bottom: number }) => {
            dialog.getBoundingClientRect = () => ({
                ...rect,
                x: rect.left,
                y: rect.top,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
                toJSON: () => ({}),
            }) as DOMRect;
        };

        it('backdrop click (target === dialog, coords outside rect) closes the dialog', () => {
            const dialog = document.createElement('dialog');
            dialog.innerHTML = '<button id="inner">x</button>';
            document.body.appendChild(dialog);
            dialog.showModal();
            stubRect(dialog, { left: 100, top: 100, right: 500, bottom: 400 });
            expect(dialog.open).toBe(true);

            attachBackdropClose(dialog);

            // Click on ::backdrop: target bubbles up as the dialog, but the
            // coordinates lie outside the dialog's box.
            const ev = new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 });
            dialog.dispatchEvent(ev);

            expect(dialog.open).toBe(false);
            dialog.remove();
        });

        it('clicks on dialog children do NOT close the dialog (target !== dialog branch)', () => {
            const dialog = document.createElement('dialog');
            dialog.innerHTML = '<button id="inner">x</button>';
            document.body.appendChild(dialog);
            dialog.showModal();
            stubRect(dialog, { left: 100, top: 100, right: 500, bottom: 400 });
            attachBackdropClose(dialog);

            const inner = dialog.querySelector('#inner') as HTMLButtonElement;
            inner.click();

            // Inner-element click → target !== dialog → early return → stays open.
            // A regression here would dismiss modals mid-input.
            expect(dialog.open).toBe(true);
            dialog.remove();
        });

        it('click on dialog padding (target === dialog, coords inside rect) does NOT close the dialog', () => {
            // Regression: dialog has padding, so clicking the inner whitespace
            // that no child element catches bubbles up with target === dialog.
            // The hit-test against getBoundingClientRect keeps the dialog open.
            const dialog = document.createElement('dialog');
            dialog.innerHTML = '<button id="inner">x</button>';
            document.body.appendChild(dialog);
            dialog.showModal();
            stubRect(dialog, { left: 100, top: 100, right: 500, bottom: 400 });
            attachBackdropClose(dialog);

            const ev = new MouseEvent('click', { bubbles: true, clientX: 150, clientY: 150 });
            dialog.dispatchEvent(ev);

            expect(dialog.open).toBe(true);
            dialog.remove();
        });
    });
});
