/**
 * Permission test card for User Management: pick a saved user, type a broker,
 * Message VPN and queue, and see what that user gets there -- operate,
 * read-only, the VPN without the queue, or nothing -- with the row that grants
 * it, and the modules the user may open.
 *
 * The verdict comes from `explainAccess` in `src/core/rbac.ts`, built on the
 * same predicates a session is filtered by, so the card cannot disagree with
 * what the user gets. It tests the users from the module's last list load
 * (`setData`), never unsaved form edits. Every value is written as text.
 */
import { required } from '../../core/dom';
import { explainAccess, type AccessLevel } from '../../core/rbac';
import { moduleLabel } from '../../core/utils';
import type { ManagedUser, ModuleChoices } from './service';

export interface AccessTest {
    /** The users and module choices of a list load; keeps the picked user while they still exist. */
    setData(users: ManagedUser[], choices: ModuleChoices): void;
}

/** Shown until a user is picked and the broker, VPN and queue are all filled in. */
export const ACCESS_PROMPT = 'Pick a user and enter a broker, Message VPN and queue.';

const LEVELS: Record<AccessLevel, { badge: string; label: string; text: string }> = {
    operate: {
        badge: 'badge-outline-success',
        label: 'Operate',
        text: 'Browse, forward and delete messages, and copy into this queue.',
    },
    'read-only': {
        badge: 'badge-outline-warning',
        label: 'Read-only',
        text: 'Browse and forward messages; no delete, no copy into this queue.',
    },
    'vpn-only': {
        badge: 'badge-outline-info',
        label: 'Queue hidden',
        text: "Reaches this Message VPN, but no row's queue pattern matches this queue.",
    },
    none: {
        badge: 'text-error',
        label: 'No access',
        text: 'No row matches this broker and Message VPN.',
    },
};

/**
 * The app modules a user may open: their own list (`own`), or the deployment
 * default when null, within what the deployment offers -- the gateway never
 * grants a module outside `offered`.
 */
export function grantedModules(own: string[] | null, choices: ModuleChoices): string[] {
    const wanted = own ?? (choices.userDefault === 'all' ? choices.offered : []);
    return wanted.filter(id => choices.offered.includes(id));
}

export function createAccessTest(container: HTMLElement): AccessTest {
    const els = {
        user: required<HTMLSelectElement>(container, '#user-mgmt-test-user'),
        broker: required<HTMLInputElement>(container, '#user-mgmt-test-broker'),
        vpn: required<HTMLInputElement>(container, '#user-mgmt-test-vpn'),
        queue: required<HTMLInputElement>(container, '#user-mgmt-test-queue'),
        result: required<HTMLElement>(container, '#user-mgmt-test-result'),
    };

    let users: ManagedUser[] = [];
    let choices: ModuleChoices = { catalog: [], offered: [], userDefault: 'all' };

    function note(text: string): HTMLParagraphElement {
        const p = document.createElement('p');
        p.className = 'text-secondary';
        p.textContent = text;
        return p;
    }

    function renderOptions(): void {
        const picked = els.user.value;
        els.user.replaceChildren(new Option('Select a user...', ''));
        users.forEach(u => els.user.add(new Option(u.username, u.username)));
        els.user.value = users.some(u => u.username === picked) ? picked : '';
    }

    function evaluate(): void {
        const user = users.find(u => u.username === els.user.value);
        const broker = els.broker.value.trim();
        const vpn = els.vpn.value.trim();
        const queue = els.queue.value.trim();
        if (!user || !broker || !vpn || !queue) {
            els.result.replaceChildren(note(ACCESS_PROMPT));
            return;
        }
        // A record the gateway sent without its row lists has none.
        const { level, row } = explainAccess(
            { operate: user.operate ?? [], readOnly: user.readOnly ?? [] }, broker, vpn, queue);
        const cfg = LEVELS[level];
        const verdict = document.createElement('p');
        const badge = document.createElement('span');
        badge.className = `badge ${cfg.badge}`;
        badge.textContent = cfg.label;
        verdict.append(badge, ` ${cfg.text}`);
        const out = [verdict];
        if (row) out.push(note(`Matching row: ${row.brokers} / ${row.msgVpns} / ${row.queues}`));
        const modules = grantedModules(user.modules ?? null, choices).map(moduleLabel);
        out.push(note(`Modules: ${modules.length ? modules.join(', ') : 'none'}`));
        els.result.replaceChildren(...out);
    }

    els.user.addEventListener('change', evaluate);
    [els.broker, els.vpn, els.queue].forEach(input => input.addEventListener('input', evaluate));

    renderOptions();
    evaluate();

    return {
        setData(nextUsers, nextChoices) {
            users = nextUsers;
            choices = nextChoices;
            renderOptions();
            evaluate();
        },
    };
}
