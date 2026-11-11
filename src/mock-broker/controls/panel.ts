/**
 * The demo scenario switcher.
 *
 * Mounts itself into `document.body` from `boot()`. It lives inside the
 * mock-broker tree, which production never imports, so this UI cannot leak into
 * a shipped bundle — no build flag and no dead code to tree-shake.
 *
 * The managed demo mounts it with `PanelOptions`: its own sections in place of
 * the Direct connection reference (`managed.ts`), a Reset that reloads, and its
 * own banner and first-visit key.
 *
 * Both demos open it on the tab's first load, so a newcomer finds the guidance
 * without hunting for it, and say at its top that nothing leaves the page.
 *
 * Mock-only.
 */
import {
    BROKERS, DIRECT_BROKER, FAULT, MOCK_HOST, QUEUE_STATE, VPNS, resetScenario, scenario,
    type Fault, type QueueState,
} from '../fixtures';
import { seed } from '../broker/store';
import { dropAllSessions } from '../sdk';
import { required } from '../../core/dom';

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

export function section(title: string): HTMLElement {
    const wrap = el('div', 'mockctl-section');
    wrap.appendChild(el('h4', 'mockctl-title', title));
    return wrap;
}

export function select(options: { value: string; label: string }[], onChange: (v: string) => void): HTMLSelectElement {
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

export function button(label: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', 'mockctl-btn', label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}

/** Every `vpn/queue` pair on every broker, for the per-queue state control. */
function queueOptions(): { value: string; label: string }[] {
    return Array.from(BROKERS).flatMap(([broker, vpns]) => vpns.flatMap(v => v.queues.map(q => ({
        value: `${v.name}/${q.name}`,
        label: broker === DIRECT_BROKER ? `${v.name} / ${q.name}` : `${broker} / ${v.name} / ${q.name}`,
    }))));
}

/**
 * A value the demo accepts, rendered click-to-copy. Without this the only way
 * to know `broker.solace.com` is the magic host is to read the source or the
 * user guide — which is exactly the friction a demo should not have.
 */
export function copyable(value: string): HTMLElement {
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
export function kv(label: string, values: string[]): HTMLElement {
    const row = el('div', 'mockctl-kv');
    row.appendChild(el('span', 'mockctl-key', label));
    const vals = el('span', 'mockctl-vals');
    values.forEach(v => vals.appendChild(copyable(v)));
    row.appendChild(vals);
    return row;
}

/** The credentials "Fill the connection form" types; the emulator accepts any. */
export const DEMO_CREDENTIALS = { username: 'demo', password: 'demo' };

/**
 * Type the demo's values into the Direct form, as a visitor would: the host,
 * both cards' credentials and `vpn`. Each field gets the input and change
 * events typing raises, so the form reacts as it does to the keyboard. Ports,
 * protocols and URL paths keep what they hold; the emulator ignores them.
 */
export function fillDirectForm(vpn: string, root: ParentNode = document): void {
    const type = (selector: string, value: string) => {
        const input = required<HTMLInputElement>(root, selector);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    type('#conn-host', MOCK_HOST.OK);
    type('#semp-username', DEMO_CREDENTIALS.username);
    type('#semp-password', DEMO_CREDENTIALS.password);
    type('#solace-vpn', vpn);
    type('#solace-username', DEMO_CREDENTIALS.username);
    type('#solace-password', DEMO_CREDENTIALS.password);
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
    let fillVpn = VPNS[0].name;
    const vpnPick = select(VPNS.map(v => ({ value: v.name, label: `VPN ${v.name}` })), v => { fillVpn = v; });
    wrap.append(vpnPick, button('Fill the connection form', () => fillDirectForm(fillVpn)));
    wrap.appendChild(el('p', 'mockctl-hint',
        'Fill writes the host, that VPN and a demo username and password into the form; '
        + 'then press Connect on each card.'));
    wrap.appendChild(el('p', 'mockctl-hint',
        'Username, password, ports and URL paths are all accepted as typed; only the host '
        + 'is checked. Any other host is refused, never reached, and a host containing '
        + 'the cert-error value simulates an untrusted certificate on the messaging connection.'));
    wrap.appendChild(el('p', 'mockctl-hint',
        'The VPN you connect with decides which queues the pickers list.'));
    return wrap;
}

/** The Direct demo's banner and first-visit key; the managed demo passes its own. */
export const DIRECT_BANNER = 'Demo broker: nothing leaves this page, and a real broker is refused, never reached.';
export const DIRECT_PANEL_SEEN_KEY = 'smu-mock-panel-seen';

/**
 * True on the tab's first load of this demo, which it then remembers. A
 * browser that refuses the storage gets the panel open on every load: the
 * guidance shows rather than hides.
 */
export function firstVisit(key: string): boolean {
    try {
        if (sessionStorage.getItem(key)) return false;
        sessionStorage.setItem(key, '1');
        return true;
    } catch {
        return true;
    }
}

export interface PanelOptions {
    /** Sections in place of the Direct connection reference. */
    sections?: HTMLElement[];
    /** What Reset demo data does, in place of reseeding where it stands. */
    reset?: () => void;
    /** The note at the top of the panel, in place of the Direct demo's. */
    banner?: string;
    /** The sessionStorage key that marks the tab's first load, in place of the Direct demo's. */
    visitKey?: string;
}

export function mountControlPanel(opts: PanelOptions = {}): void {
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
        { value: QUEUE_STATE.PUBLISH_REJECTED, label: 'Publish rejected' },
    ], v => scenario.queueState.set(selectedQueue, v as QueueState));
    statePick.value = scenario.queueState.get(selectedQueue) ?? QUEUE_STATE.NORMAL;
    queueSection.append(queuePick, statePick);
    queueSection.appendChild(el('p', 'mockctl-hint',
        'Applies on the next bind. Empty takes effect after Reset. Publish rejected refuses every publish to the queue until set back.'));

    /* ---- connection faults ---- */
    const faultSection = section('Connection faults');
    const faultPick = select([
        { value: FAULT.NONE, label: 'No fault' },
        { value: FAULT.CONNECT_FAILS, label: 'Fail next connect' },
        { value: FAULT.SEMP_UNAUTHORIZED, label: 'SEMP 401 unauthorized' },
        { value: FAULT.SEMP_ERROR, label: 'SEMP 500 error' },
    ], v => { scenario.fault = v as Fault; });
    faultPick.value = scenario.fault;   // the managed demo restores an armed fault across its reload
    faultSection.append(faultPick, button('Drop session now', () => dropAllSessions()));
    faultSection.appendChild(el('p', 'mockctl-hint',
        'Connect failure is one-shot; SEMP faults stay armed until cleared.'));

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
    volumePick.value = String(scenario.volume);

    tuneSection.append(latency, latencyLabel, volumePick,
        button('Reset demo data', () => {
            if (opts.reset) {
                opts.reset();
                return;
            }
            resetScenario();
            seed();
            latency.value = String(scenario.latencyMs);
            latencyLabel.textContent = `${scenario.latencyMs} ms`;
            faultPick.value = scenario.fault;
            volumePick.value = String(scenario.volume);
            statePick.value = scenario.queueState.get(selectedQueue) ?? QUEUE_STATE.NORMAL;
        }));

    body.append(el('p', 'mockctl-banner', opts.banner ?? DIRECT_BANNER),
        ...(opts.sections ?? [connectionReference()]), queueSection, faultSection, tuneSection);
    root.append(header, body);
    if (firstVisit(opts.visitKey ?? DIRECT_PANEL_SEEN_KEY)) root.classList.add('mockctl-open');
    document.body.appendChild(root);
}
