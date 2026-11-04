/**
 * The control panel's managed-demo sections, in place of the Direct
 * connection reference: the demo accounts (click to copy, or sign in as one),
 * and the gateway events a real deployment would produce on its own (a
 * session ended or expired, an entitlement revoked, a lockout, a broker the
 * relay cannot reach, the dial window, a hand edit of config.yaml).
 *
 * Mock-only.
 */
import { DEMO_ACCOUNTS } from '../gateway/seed';
import type { Gateway } from '../gateway';
import type { Page } from '../gateway/pages';
import { button, copyable, el, section, select } from './panel';

export interface ManagedPanelDeps {
    gateway: Gateway;
    /** Land on a page through a reload, as a sign-in does. */
    navigate: (page: Page) => void;
}

export function managedSections({ gateway, navigate }: ManagedPanelDeps): HTMLElement[] {
    const who = el('p', 'mockctl-hint');
    const refresh = () => {
        const s = gateway.session();
        who.textContent = s ? `Signed in as ${s.user}${s.mustChange ? ', who must change the password' : ''}.` : 'Signed out.';
    };

    /* ---- accounts ---- */
    const accounts = section('Demo accounts');
    accounts.appendChild(who);
    for (const a of DEMO_ACCOUNTS) {
        const row = el('div', 'mockctl-account');
        row.append(copyable(a.username), copyable(a.password), button(`Sign in as ${a.username}`, () => {
            const r = gateway.signIn(a.username, a.password);
            if (r.ok) navigate(r.mustChange ? 'password' : 'app');
            else who.textContent = r.error;   // the lockout
        }));
        row.appendChild(el('p', 'mockctl-hint', a.role));
        accounts.appendChild(row);
    }
    accounts.appendChild(button('Sign out', () => {
        const id = gateway.cookie();
        if (id) gateway.sessions.drop(id);
        gateway.setCookie(null);
        navigate('app');
    }));
    accounts.appendChild(el('p', 'mockctl-hint',
        'Signing in reloads the page, as the gateway does. Queues, users and settings carry over in this tab; a new tab starts afresh.'));
    accounts.addEventListener('pointerenter', refresh);

    /* ---- gateway events ---- */
    const events = section('Gateway events');
    const mine = (fn: (id: string) => void) => () => {
        const id = gateway.cookie();
        if (id) fn(id);
        refresh();
    };
    events.append(
        button('End my session', mine(id => gateway.sessions.drop(id))),
        button('Expire my session', mine(id => gateway.sessions.expire(id))),
        button('Revoke my VPN access', () => {
            const u = gateway.store.findUser(gateway.session()?.user ?? '');
            if (u) gateway.store.upsertUser({ username: u.username, admin: u.admin, operate: [], readOnly: [], modules: u.modules }, '');
        }),
        button('Clear the sign-in lockout', () => gateway.throttle.clear()),
    );
    events.appendChild(el('p', 'mockctl-hint',
        'Ending a session or revoking access closes its broker connections; an expiry does not, as in the gateway. The app notices at its next call.'));

    const f = gateway.faults;
    const relay = select([
        { value: 'ok', label: 'Relay: broker reachable' },
        { value: 'down', label: 'Relay: broker unreachable (502)' },
    ], v => { f.relayUnreachable = v === 'down'; });
    relay.value = f.relayUnreachable ? 'down' : 'ok';
    const dial = select([
        { value: 'ok', label: 'Dial: allowed' },
        { value: 'limited', label: 'Dial: rate limited (429)' },
    ], v => { f.dialRateLimited = v === 'limited'; });
    dial.value = f.dialRateLimited ? 'limited' : 'ok';
    const file = select([
        { value: 'ok', label: 'config.yaml: as loaded' },
        { value: 'changed', label: 'config.yaml: edited on the host' },
        { value: 'unreadable', label: 'config.yaml: unreadable' },
    ], v => {
        f.changedOnDisk = v === 'changed';
        f.unreadable = v === 'unreadable';
    });
    file.value = f.unreadable ? 'unreadable' : f.changedOnDisk ? 'changed' : 'ok';
    events.append(relay, dial, file);
    events.appendChild(el('p', 'mockctl-hint',
        'A broker refusing the gateway\'s SEMP account: arm "SEMP 401 unauthorized" below, which the relay answers with 502 upstream_auth.'));

    refresh();
    return [accounts, events];
}
