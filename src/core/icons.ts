/**
 * Inline SVG icons shared by more than one module (16px, stroke style, the
 * same look as Queue Browser's row icons). Each value is a static markup
 * string for an icon button's `innerHTML`; label the button itself with
 * `title` and `aria-label`, since the icon carries no text.
 */
export const ICONS = {
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
    delete: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
};

/**
 * An icon-only button: `type="button"`, `btn-icon` plus `className`, and
 * `label` as both its tooltip and its accessible name.
 */
export function iconButton(icon: string, label: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-icon ${className}`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
}
