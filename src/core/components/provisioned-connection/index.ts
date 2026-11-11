/**
 * Provisioned connection card -- pick a provisioned broker and Message VPN and
 * connect to it, for any module that opens a provisioned (managed) connection:
 * the connections module's Provisioned panel (the primary connection) and
 * queue-copy's provisioned destination.
 *
 * The card owns its DOM (title, Broker and Message VPN selects, one
 * Connect/Disconnect button, a status line, an error line, an empty state when
 * the account has no connections), its events and its lifecycle. It never
 * dials and holds no credential: the host connects in `onConnect` (through
 * `ctx.managedProfile.dial`) and reports the outcome back with `setStatus`.
 *
 * API:
 *
 *     const card = createProvisionedConnectionCard(host, {
 *         profile: ctx.managedProfile,               // where the names come from
 *         onConnect: async ({ broker, vpn }) => {},  // start the connect; a rejection shows as an error
 *         onDisconnect: () => {},                    // the button while connected
 *         title: 'Destination',                      // optional, default 'Connect to a broker'
 *         headerActions: refreshButton,              // optional, placed at the right of the header
 *         ids: { broker: 'my-broker-select' },       // optional ids for the parts (see CardPart)
 *     });
 *     card.setChoices();                  // (re)read brokers + VPNs from the profile; keeps a still-provisioned selection
 *     card.setStatus('connected', 'Broker "b1", VPN "v1"');   // 'disconnected' | 'connecting' | 'connected' | 'error'
 *     card.status();                      // the status last set
 *     card.lock(true);                    // freeze every control (e.g. while a copy runs)
 *     card.destroy();                     // remove the card's DOM
 *
 * Clicking Connect sets the status to 'connecting' at once, which disables the
 * button, so a second click cannot start a second connect while the first is
 * in flight. Styles: ./styles.css (`.prov-conn-*`), imported by
 * src/css/main.css.
 */
import { errMessage } from '../../utils';
import type { ManagedProfileStore } from '../../services/managed-profile';

export type ProvisionedStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** A provisioned connect target: names only, never an address. */
export interface ProvisionedTarget {
    broker: string;
    vpn: string;
}

/** The parts a host may give ids to (stable hooks for its own tests and labels). */
export type CardPart = 'broker' | 'vpn' | 'action' | 'error' | 'empty' | 'controls';

export interface ProvisionedConnectionCardDeps {
    /** The provisioned names: `ctx.managedProfile`. */
    profile: Pick<ManagedProfileStore, 'brokers' | 'vpnsFor'>;
    /** Start connecting to `target`. A rejection is shown as the card's error. */
    onConnect(target: ProvisionedTarget): Promise<void>;
    /** The button was clicked while connected. */
    onDisconnect(): void;
    /** Card heading; default 'Connect to a broker'. */
    title?: string;
    /** An element the card places at the right of its header (e.g. a Refresh button). */
    headerActions?: HTMLElement;
    /** Ids for the card's parts, for a host that instantiates it once. */
    ids?: Partial<Record<CardPart, string>>;
}

export interface ProvisionedConnectionCard {
    /** (Re)read the provisioned brokers and VPNs from `deps.profile`. */
    setChoices(): void;
    /** Show where the connection stands; `detail` is the status line, or the error for 'error'. */
    setStatus(status: ProvisionedStatus, detail?: string): void;
    /** The status last set. */
    status(): ProvisionedStatus;
    /** Disable every control while `locked`, whatever the status. */
    lock(locked: boolean): void;
    /** Remove the card's DOM from its host. */
    destroy(): void;
}

const DEFAULT_TITLE = 'Connect to a broker';
const EMPTY_TEXT = 'No connections are available for your account. Ask an administrator to grant access.';

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function fillSelect(select: HTMLSelectElement, names: string[], keep: string): void {
    select.replaceChildren(...names.map(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        return opt;
    }));
    if (names.includes(keep)) select.value = keep;
}

export function createProvisionedConnectionCard(
    host: HTMLElement,
    deps: ProvisionedConnectionCardDeps,
): ProvisionedConnectionCard {
    const root = make('div', 'card prov-conn');

    const header = make('div', 'prov-conn-header');
    header.append(make('h2', 'prov-conn-title', deps.title ?? DEFAULT_TITLE));
    if (deps.headerActions) header.append(deps.headerActions);

    const empty = make('div', 'prov-conn-empty text-secondary hidden', EMPTY_TEXT);

    const controls = make('div', 'prov-conn-controls');
    const brokerSelect = make('select', 'form-control prov-conn-broker');
    const vpnSelect = make('select', 'form-control prov-conn-vpn');
    const brokerLabel = make('label', 'prov-conn-field', 'Broker');
    brokerLabel.append(brokerSelect);
    const vpnLabel = make('label', 'prov-conn-field', 'Message VPN');
    vpnLabel.append(vpnSelect);
    const fields = make('div', 'form-group prov-conn-fields');
    fields.append(brokerLabel, vpnLabel);
    const action = make('button', 'btn btn-primary prov-conn-action', 'Connect');
    action.type = 'button';
    const statusLine = make('div', 'prov-conn-status text-secondary hidden');
    const errorLine = make('div', 'prov-conn-error text-error hidden');
    controls.append(fields, action, statusLine, errorLine);

    root.append(header, empty, controls);
    host.append(root);

    const parts: Record<CardPart, HTMLElement> = {
        broker: brokerSelect, vpn: vpnSelect, action, error: errorLine, empty, controls,
    };
    for (const [part, id] of Object.entries(deps.ids ?? {})) {
        parts[part as CardPart].id = id as string;
    }

    let current: ProvisionedStatus = 'disconnected';
    let locked = false;

    function populateVpns(): void {
        const vpns = deps.profile.vpnsFor(brokerSelect.value);
        fillSelect(vpnSelect, vpns, vpnSelect.value);
        render();
    }

    /** Enable, label and show every control for the status, lock and selection. */
    function render(): void {
        const busy = current === 'connecting' || current === 'connected';
        brokerSelect.disabled = locked || busy;
        vpnSelect.disabled = locked || busy || vpnSelect.options.length === 0;
        const connected = current === 'connected';
        action.textContent = current === 'connecting' ? 'Connecting...' : connected ? 'Disconnect' : 'Connect';
        action.classList.toggle('btn-primary', !connected);
        action.classList.toggle('btn-danger', connected);
        action.disabled = locked || current === 'connecting' || (!connected && !(brokerSelect.value && vpnSelect.value));
    }

    function setStatus(status: ProvisionedStatus, detail?: string): void {
        current = status;
        const line = status === 'error' ? '' : (detail ?? '');
        statusLine.textContent = line;
        statusLine.classList.toggle('hidden', !line);
        const error = status === 'error' ? (detail || 'Connection failed.') : '';
        errorLine.textContent = error;
        errorLine.classList.toggle('hidden', !error);
        render();
    }

    brokerSelect.addEventListener('change', populateVpns);
    vpnSelect.addEventListener('change', render);
    action.addEventListener('click', () => {
        if (current === 'connected') {
            deps.onDisconnect();
            return;
        }
        const target = { broker: brokerSelect.value, vpn: vpnSelect.value };
        if (!target.broker || !target.vpn) return;
        setStatus('connecting', `Connecting to broker "${target.broker}", VPN "${target.vpn}"...`);
        deps.onConnect(target).catch((e: unknown) => setStatus('error', errMessage(e)));
    });

    render();

    return {
        setChoices(): void {
            const brokers = deps.profile.brokers();
            empty.classList.toggle('hidden', brokers.length > 0);
            controls.classList.toggle('hidden', brokers.length === 0);
            fillSelect(brokerSelect, brokers, brokerSelect.value);
            populateVpns();
        },
        setStatus,
        status: () => current,
        lock(next: boolean): void {
            locked = next;
            render();
        },
        destroy(): void {
            root.remove();
        },
    };
}
