import { describe, it, expect, vi } from 'vitest';
import { ICONS, iconButton } from '../../src/core/icons';

describe('core/icons -- iconButton', () => {
    it('builds a non-submitting icon button named by its label, wired to onClick', () => {
        const onClick = vi.fn();
        const btn = iconButton(ICONS.delete, 'Delete user "bob"', 'btn-icon-danger x-delete', onClick);
        expect(btn.type).toBe('button'); // never submits an enclosing form
        expect(btn.className).toBe('btn-icon btn-icon-danger x-delete');
        expect(btn.title).toBe('Delete user "bob"');
        expect(btn.getAttribute('aria-label')).toBe('Delete user "bob"');
        expect(btn.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        expect(btn.textContent).toBe('');
        btn.click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
