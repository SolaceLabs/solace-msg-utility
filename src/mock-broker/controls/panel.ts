/**
 * The demo scenario switcher.
 *
 * Mounts itself into `document.body` from `boot()`. It lives inside the
 * mock-broker tree, which production never imports, so this UI cannot leak into
 * a shipped bundle — no build flag and no dead code to tree-shake.
 *
 * Role switching deliberately drives the app's **real** refresh path: it sets
 * the scenario role, then clicks the Managed panel's own Refresh button. That
 * is exactly what happens in production when an administrator changes someone's
 * entitlements, so the sidebar, pickers and Queue Copy destination all re-derive
 * through the code that ships.
 *
 * Mock-only.
 */
import {
    FAULT, MOCK_HOST, QUEUE_STATE, ROLE, VPNS, resetScenario, scenario,
    type Fault, type QueueState, type Role,
} from '../fixtures';
import { seed } from '../broker/store';
import { dropAllSessions } from '../sdk';

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function section(title: string): HTMLElement {
    const wrap = el('div', 'mockctl-section');
    wrap.appendChild(el('h4', 'mockctl-title', title));
    return wrap;
}

function select(options: { value: string; label: string }[], onChange: (v: string) => void): HTMLSelectElement {
    const sel = el('select', 'mockctl-select');
    options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
    });
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', 'mockctl-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}

/** Every `vpn/queue` pair, for the per-queue state control. */
function queueOptions(): { value: string; label: string }[] {
    return VPNS.flatMap(v => v.queues.map(q => ({
        value: `${v.name}/${q.name}`,
        label: `${v.name} / ${q.name}`,
    })));
}

/**
 * A value the demo accepts, rendered click-to-copy. Without this the only way
 * to know `broker.solace.com` is the magic host is to read the source or the
 * user guide — which is exactly the friction a demo should not have.
 */
function copyable(value: string): HTMLElement {
    const code = el('code', 'mockctl-copy', value);
    code.title = 'Click to copy';
    code.addEventListener('click', () => {
        void navigator.clipboard?.writeText(value);
        const previous = code.textContent;
        code.textContent = 'copied';
        code.classList.add('mockctl-copied');
        setTimeout(() => {
            code.textContent = previous;
            code.classList.remove('mockctl-copied');
        }, 700);
    });
    return code;
}

/** One `label: value(s)` row in the connection reference. */
function kv(label: string, values: string[]): HTMLElement {
    const row = el('div', 'mockctl-kv');
    row.appendChild(el('span', 'mockctl-key', label));
    const vals = el('span', 'mockctl-vals');
    values.forEach(v => vals.appendChild(copyable(v)));
    row.appendChild(vals);
    return row;
}

/**
 * What the demo will actually accept. Only the host and the VPN are
 * constrained — the broker emulator ignores ports and credentials — so say that
 * plainly rather than leaving people guessing which field rejected them.
 */
function connectionReference(): HTMLElement {
    const wrap = section('Connection values');
    wrap.appendChild(kv('Host', [MOCK_HOST.OK]));
    wrap.appendChild(kv('Message VPNs', VPNS.map(v => v.name)));
    wrap.appendChild(kv('Cert error', [MOCK_HOST.UNTRUSTED]));
    wrap.appendChild(el('p', 'mockctl-hint',
        'Username, password, ports and URL paths are all accepted as typed — only the host '
        + 'is checked. Any other host reports a connection failure, and a host containing '
        + 'the cert-error value simulates an untrusted certificate.'));
    wrap.appendChild(el('p', 'mockctl-hint',
        'The VPN you connect with decides which queues the pickers list. On the Managed tab '
        + 'any username and password sign in — the entitlements come from the identity below.'));
    return wrap;
}

export function mountControlPanel(): void {
    const root = el('div', 'mockctl-root');
    root.id = 'mock-controls';

    const header = el('button', 'mockctl-header', 'Demo controls');
    header.type = 'button';
    const body = el('div', 'mockctl-body');
    header.addEventListener('click', () => root.classList.toggle('mockctl-open'));

    /* ---- queue state ---- */
    const queueSection = section('Queue state');
    let selectedQueue = queueOptions()[0].value;
    const queuePick = select(queueOptions(), v => {
        selectedQueue = v;
        statePick.value = scenario.queueState.get(selectedQueue) ?? QUEUE_STATE.NORMAL;
    });
    const statePick = select([
        { value: QUEUE_STATE.NORMAL, label: 'Normal' },
        { value: QUEUE_STATE.READ_ONLY, label: 'Read-only' },
        { value: QUEUE_STATE.BIND_DENIED, label: 'Bind denied' },
        { value: QUEUE_STATE.EMPTY, label: 'Empty' },
    ], v => scenario.queueState.set(selectedQueue, v as QueueState));
    statePick.value = scenario.queueState.get(selectedQueue) ?? QUEUE_STATE.NORMAL;
    queueSection.append(queuePick, statePick);
    queueSection.appendChild(el('p', 'mockctl-hint',
        'Applies on the next bind. Empty takes effect after Reset.'));

    /* ---- connection faults ---- */
    const faultSection = section('Connection faults');
    const faultPick = select([
        { value: FAULT.NONE, label: 'No fault' },
        { value: FAULT.CONNECT_FAILS, label: 'Fail next connect' },
        { value: FAULT.SEMP_UNAUTHORIZED, label: 'SEMP 401 unauthorized' },
        { value: FAULT.SEMP_ERROR, label: 'SEMP 500 error' },
    ], v => { scenario.fault = v as Fault; });
    faultSection.append(faultPick, button('Drop session now', () => dropAllSessions()));
    faultSection.appendChild(el('p', 'mockctl-hint',
        'Connect failure is one-shot; SEMP faults stay armed until cleared.'));

    /* ---- RBAC ---- */
    const rbacSection = section('Managed identity');
    const rolePick = select([
        { value: ROLE.SIGNED_OUT, label: 'Signed out' },
        { value: ROLE.ADMIN, label: 'admin — full entitlements' },
        { value: ROLE.OPERATOR, label: 'operator — operate on Q/ORDER/* in vpn-prod' },
        { value: ROLE.READ_ONLY, label: 'readonly — browse only' },
    ], v => {
        scenario.role = v as Role;
        // Drive the product's own refresh, exactly as an entitlement change does.
        const refresh = document.querySelector<HTMLButtonElement>('#btn-managed-refresh');
        if (refresh && refresh.offsetParent !== null) refresh.click();
    });
    rbacSection.appendChild(rolePick);
    rbacSection.appendChild(el('p', 'mockctl-hint',
        'Sign in on the Managed tab with any username and password. Switching while '
        + 'signed in clicks Refresh for you.'));

    /* ---- latency + volume ---- */
    const tuneSection = section('Latency and volume');
    const latency = el('input', 'mockctl-range');
    latency.type = 'range';
    latency.min = '0';
    latency.max = '1000';
    latency.step = '20';
    latency.value = String(scenario.latencyMs);
    const latencyLabel = el('span', 'mockctl-value', `${scenario.latencyMs} ms`);
    latency.addEventListener('input', () => {
        scenario.latencyMs = Number(latency.value);
        latencyLabel.textContent = `${scenario.latencyMs} ms`;
    });
    const volumePick = select([
        { value: '0.25', label: 'Small (¼ seed)' },
        { value: '1', label: 'Normal' },
        { value: '5', label: 'Large (5× seed)' },
    ], v => { scenario.volume = Number(v); seed(); });
    volumePick.value = '1';

    tuneSection.append(latency, latencyLabel, volumePick,
        button('Reset demo data', () => {
            resetScenario();
            seed();
            latency.value = String(scenario.latencyMs);
            latencyLabel.textContent = `${scenario.latencyMs} ms`;
            faultPick.value = scenario.fault;
            rolePick.value = scenario.role;
            volumePick.value = '1';
            statePick.value = scenario.queueState.get(selectedQueue) ?? QUEUE_STATE.NORMAL;
        }));

    body.append(connectionReference(), queueSection, faultSection, rbacSection, tuneSection);
    root.append(header, body);
    document.body.appendChild(root);
}
