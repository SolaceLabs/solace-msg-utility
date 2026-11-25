/**
 * The control panel's Authenticator: the demo's stand-in for a phone app.
 * It lists every account that has a two-factor secret, enrolled or pending
 * in a sign-in ticket, with the code for the current 30-second step (click to
 * copy) and the seconds left in it. The codes are the demo's mock numbers
 * (`mockCode`), so nothing here is a real authenticator. The list follows
 * the clock: the seconds count down, and the codes turn with the step.
 *
 * Mock-only.
 */
import { mockCode, STEP_MS, stepOf } from '../gateway/authenticator';
import type { Gateway } from '../gateway';
import { copyable, el, section } from './panel';

const TICK_MS = 1000;

export function authenticatorSection(gateway: Gateway): HTMLElement {
    const box = section('Authenticator');
    const list = el('div');
    let clocks: HTMLElement[] = [];
    let shown = '';

    function rebuild(rows: ReturnType<Gateway['authenticators']>, step: number): void {
        list.replaceChildren();
        clocks = [];
        if (rows.length === 0) {
            list.appendChild(el('p', 'mockctl-hint', 'No account has two-factor yet. Open Two-factor sign-in from the account controls to set it up.'));
            return;
        }
        for (const r of rows) {
            const row = el('div', 'mockctl-account');
            const clock = el('span', 'mockctl-value');
            clocks.push(clock);
            row.append(el('span', 'mockctl-key', r.pending ? `${r.user} (setting up)` : r.user), copyable(mockCode(r.secret, step)), clock);
            list.appendChild(row);
        }
    }

    /** Rebuild when the accounts or the step changed; always bring the countdown up to date. */
    function refresh(): void {
        const ms = gateway.now().getTime();
        const step = stepOf(ms);
        const rows = gateway.authenticators();
        const key = JSON.stringify([step, rows]);
        if (key !== shown) {
            shown = key;
            rebuild(rows, step);
        }
        const left = Math.ceil(((step + 1) * STEP_MS - ms) / 1000);
        clocks.forEach(c => { c.textContent = `${left} s`; });
    }

    box.append(list, el('p', 'mockctl-hint',
        'The code for each account that has a secret, for the sign-in code page and the set-up page. Codes are mock numbers valid for about a minute; one cannot be used twice.'));
    refresh();
    box.addEventListener('pointerenter', refresh);
    // Only while the panel is on the page: a detached section has nobody to show it to.
    setInterval(() => {
        if (box.isConnected) refresh();
    }, TICK_MS);
    return box;
}
