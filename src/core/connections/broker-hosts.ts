/**
 * The broker-type control of a connection form and the two host boxes it
 * governs: the Direct form (connections), Queue Copy's destination, and the
 * broker form of Conn. Mgmt.
 *
 * A software or cloud broker answers SEMP and messaging on one host. An
 * appliance answers SEMP on its management host and messaging on another.
 * The form holds a host box in its SEMP part and one in its Messaging part:
 *
 *   - Software / Cloud: the SEMP part's box is the one host. The Messaging
 *     part's box is locked and shows the same value.
 *   - Appliance: the SEMP part's box is the management host, and the
 *     Messaging part's box is free. It starts from the host already typed.
 *
 * The markup is each form's own (its template); this file wires it. A form's
 * hosts are saved as `BrokerHostValues`: `messagingHost` is there only for an
 * appliance whose messaging host is another host, so a record with one host
 * has one spelling and opens as Software / Cloud.
 */
import { required } from '../dom';

export type BrokerType = 'software' | 'appliance';

/** A form's hosts as it saves them. */
export interface BrokerHostValues {
    /** The one host, or the management (SEMP) host of an appliance. */
    host: string;
    /** An appliance's messaging host, when it is typed and is not `host`. */
    messagingHost?: string;
}

export interface BrokerHostsElements {
    /** The type control: one button per type, each naming it in `data-broker-type`. */
    typeGroup: HTMLElement;
    /** One line by the control, saying what the chosen type means. */
    typeHint: HTMLElement;
    /** The host box of the SEMP part, and its label. */
    host: HTMLInputElement;
    hostLabel: HTMLElement;
    /** The host box of the Messaging part, and the note shown while it follows the other. */
    messagingHost: HTMLInputElement;
    messagingHint: HTMLElement;
}

/** The words that change with the type. */
export interface BrokerHostsText {
    hostLabel: Record<BrokerType, string>;
    typeHint: Record<BrokerType, string>;
}

export const BROKER_HOSTS_TEXT: BrokerHostsText = {
    hostLabel: {
        software: 'Broker Host (IP or Hostname)',
        appliance: 'Management Host (IP or Hostname)',
    },
    typeHint: {
        software: 'One host serves both management and messaging.',
        appliance: 'Management and messaging each take their own host.',
    },
};

export interface BrokerHostsOptions {
    /** A form's own words, in place of `BROKER_HOSTS_TEXT`. */
    text?: BrokerHostsText;
    /** Runs after a click on the control changed the type. */
    onTypeChange?: (type: BrokerType) => void;
}

/** Which parts of the form may not change now: a live connection, or values that are not the user's to edit. */
export interface BrokerHostsLocks {
    management: boolean;
    messaging: boolean;
}

export interface BrokerHosts {
    type(): BrokerType;
    /** Choose the type in code (a loaded record, a reset). */
    setType(type: BrokerType): void;
    /** The host messaging connects to: the Messaging part's box for an appliance, else the one host. */
    messagingHost(): string;
    /** The hosts as the form saves them. */
    values(): BrokerHostValues;
    /** Show saved hosts: Appliance when they hold a messaging host of their own, else Software / Cloud. */
    write(values: BrokerHostValues): void;
    /** Lock the boxes and the control for the parts given. The type cannot change while either part is locked. */
    lock(locks: BrokerHostsLocks): void;
    /** Show the form again after the host box was written in code. */
    sync(): void;
}

export function createBrokerHosts(els: BrokerHostsElements, opts: BrokerHostsOptions = {}): BrokerHosts {
    const text = opts.text ?? BROKER_HOSTS_TEXT;
    const buttons: Record<BrokerType, HTMLButtonElement> = {
        software: required<HTMLButtonElement>(els.typeGroup, 'button[data-broker-type="software"]'),
        appliance: required<HTMLButtonElement>(els.typeGroup, 'button[data-broker-type="appliance"]'),
    };
    const types = Object.keys(buttons) as BrokerType[];
    let type: BrokerType = 'software';
    let locks: BrokerHostsLocks = { management: false, messaging: false };

    function render(): void {
        const appliance = type === 'appliance';
        const either = locks.management || locks.messaging;
        for (const t of types) {
            buttons[t].setAttribute('aria-pressed', String(t === type));
            buttons[t].disabled = either;
        }
        els.hostLabel.textContent = text.hostLabel[type];
        els.typeHint.textContent = text.typeHint[type];
        els.messagingHint.classList.toggle('hidden', appliance);
        // One host: the Messaging part shows it and cannot change it.
        if (!appliance) els.messagingHost.value = els.host.value;
        els.host.disabled = appliance ? locks.management : either;
        els.messagingHost.disabled = appliance ? locks.messaging : true;
    }

    for (const t of types) {
        buttons[t].addEventListener('click', () => {
            if (t === type) return;
            type = t;
            render();
            opts.onTypeChange?.(type);
        });
    }
    els.host.addEventListener('input', render);

    render();
    return {
        type: () => type,
        setType(next) {
            type = next;
            render();
        },
        messagingHost: () => (type === 'appliance' ? els.messagingHost.value : els.host.value),
        values() {
            const host = els.host.value;
            const messagingHost = els.messagingHost.value;
            return type === 'appliance' && messagingHost && messagingHost !== host ? { host, messagingHost } : { host };
        },
        write({ host, messagingHost }) {
            els.host.value = host;
            type = messagingHost ? 'appliance' : 'software';
            if (messagingHost) els.messagingHost.value = messagingHost;
            render();
        },
        lock(next) {
            locks = { ...next };
            render();
        },
        sync: render,
    };
}
