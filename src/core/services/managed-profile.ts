/**
 * Managed profile -- the signed-in user's provisioned brokers and VPNs, and the
 * one way to open a provisioned connection.
 *
 * Why it exists: more than one module opens a provisioned connection (the
 * connections module's primary connection, queue-copy's provisioned
 * destination), and Anchor 1 forbids reaching into another module, so the
 * profile lives here in core and is reached through `AppContext.managedProfile`.
 *
 * State ownership line:
 *   - `AppState.managed`  = matcher inputs (admin, username, broker, vpns, operate, readOnly)
 *   - this profile        = the provisioned broker and VPN names
 *
 * Credential posture: the profile holds names only; the gateway keeps every
 * address and credential. SEMP goes through the gateway's relay, which adds the
 * broker's stored account, so no SEMP credential ever reaches the browser. For
 * SMF the SDK must log in itself: `dial` asks the gateway for the VPN's client
 * credential at the moment of connecting and hands it to the caller's
 * `connect` callback only. Nothing here keeps it, and a reconnect dials again.
 *
 * The gateway calls are attached by the managed entry (`attachDialer`, from
 * `createManagedService`), so the `/managed/*` endpoint paths stay out of every
 * bundle without the managed UI. The writer is the module owning the managed
 * login (the connections module's Managed panel). Another module that needs the
 * session ended asks that owner via `rbac:sign-out-requested` rather than
 * clearing the profile itself. See docs/architecture.md.
 */
import { generateUuid } from '../utils';
import { managedErrorMessage, type ManagedResult } from './managed-api';
import type { DialResponse, ManagedProfile } from './managed-service';
// Straight from the connection-domain source rather than the `../types` barrel,
// which re-exports these and also imports this file's `ManagedProfileStore`.
import type { SolaceConfig, SempConfig } from '../connections/types';

/** Target of a Solace (SMF) dial -- a provisioned broker + VPN. */
export interface SolaceTarget { broker: string; vpn: string; kind: 'solace' }
/** Target of a SEMP dial -- provisioned per broker, so no VPN. */
export interface SempTarget { broker: string; kind: 'semp' }

/**
 * The ready-to-use payloads handed to the caller's `connect`. `dial` is
 * overloaded on the target's `kind`, so a caller receives exactly one of these
 * already narrowed. `broker` is the provisioned name, not an address.
 */
export interface SolaceDial { kind: 'solace'; cfg: SolaceConfig; broker: string; pass: string; clientName: string }
export interface SempDial { kind: 'semp'; cfg: SempConfig; broker: string }
type DialConn = SolaceDial | SempDial;

/** The gateway calls `dial` needs; `ManagedService` provides them. */
export interface ManagedDialer {
    dial(broker: string, vpn: string): Promise<ManagedResult<DialResponse>>;
    relayBase(broker: string): string;
}

export interface ManagedProfileStore {
    // --- writer side (the module owning the managed login) ---
    /** Adopt a profile. Called on login AND refresh. */
    setProfile(profile: ManagedProfile): void;
    /** Drop the profile (logout, or the Direct-connect interlock). */
    clear(): void;
    /** Attach the gateway calls; the managed entry does this once at install. */
    attachDialer(dialer: ManagedDialer): void;

    // --- consumer side ---
    isActive(): boolean;
    /** Provisioned broker names. */
    brokers(): string[];
    /** Provisioned VPN names for a broker; `[]` when unknown. */
    vpnsFor(broker: string): string[];
    /**
     * Open a connection to a provisioned target: SEMP gets the relay config,
     * Solace the dialled credential. Invokes `cb.connect` with the payload and
     * keeps nothing. Throws when no session is active, the target is not
     * provisioned (which also closes the connect-click-vs-logout race), or the
     * gateway refuses the dial; `isSessionEnded` tells a refusal because the
     * gateway session ended.
     */
    dial(target: SolaceTarget, cb: { connect(conn: SolaceDial): void | Promise<void> }): Promise<void>;
    dial(target: SempTarget, cb: { connect(conn: SempDial): void | Promise<void> }): Promise<void>;
}

/** The only socket paths a dial may name; anything else is refused. */
const SMF_PREFIX = '/managed/smf/';

/** True when `e` is a dial the gateway refused because its session ended. */
export function isSessionEnded(e: unknown): boolean {
    return Object(e).code === 'unauthenticated';
}

/** Local-time YYYYMMDDHHMMSS stamp for the SDK clientName. */
function formatConnectTimestamp(d: Date): string {
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function createManagedProfile(): ManagedProfileStore {
    // Inert until a managed login populates it, so non-managed deployments pay
    // nothing and every consumer sees `isActive() === false`.
    let profile: ManagedProfile | null = null;
    let dialer: ManagedDialer | null = null;

    /** The dialer, once the target is known to be provisioned. */
    function provisioned(target: { broker: string; vpn?: string; kind: 'solace' | 'semp' }): ManagedDialer {
        if (!profile || !dialer) {
            throw new Error('Connecting requires a sign-in session; none is active.');
        }
        const conn = profile.brokers.find(b => b.broker === target.broker);
        if (!conn) {
            throw new Error(`Broker "${target.broker}" is not provisioned for this account.`);
        }
        if (target.kind === 'solace' && !conn.msgVpns.some(v => v.name === target.vpn)) {
            throw new Error(`VPN "${target.vpn}" is not provisioned on broker "${target.broker}".`);
        }
        return dialer;
    }

    return {
        setProfile(next: ManagedProfile): void {
            profile = next;
        },

        clear(): void {
            profile = null;
        },

        attachDialer(next: ManagedDialer): void {
            dialer = next;
        },

        isActive(): boolean {
            return profile !== null;
        },

        brokers(): string[] {
            return (profile?.brokers ?? []).map(b => b.broker);
        },

        vpnsFor(broker: string): string[] {
            const conn = profile?.brokers.find(b => b.broker === broker);
            return conn ? conn.msgVpns.map(v => v.name) : [];
        },

        async dial(
            target: { broker: string; vpn?: string; kind: 'solace' | 'semp' },
            cb: { connect(conn: DialConn): void | Promise<void> },
        ): Promise<void> {
            const d = provisioned(target);
            if (target.kind === 'semp') {
                const cfg: SempConfig = { protocol: 'https', port: '', urlPath: '', user: '', relayBase: d.relayBase(target.broker) };
                await cb.connect({ kind: 'semp', cfg, broker: target.broker });
                return;
            }
            const res = await d.dial(target.broker, target.vpn as string);
            if (!res.ok) {
                throw Object.assign(new Error(managedErrorMessage(res)), { code: res.code });
            }
            // Signed out while the gateway answered: never connect after clear().
            if (!profile) {
                throw new Error('The sign-in session ended while connecting.');
            }
            if (!res.data.smfPath.startsWith(SMF_PREFIX)) {
                throw new Error('The gateway named an unexpected socket path.');
            }
            // Connection identity is owned here so the clientName always matches
            // the clientNameId inside the cfg it is composed from.
            const clientNameId = generateUuid();
            const cfg: SolaceConfig = {
                protocol: 'wss', port: '', urlPath: '', vpn: res.data.vpn, user: res.data.user,
                authMode: 'basic', connectRetries: 1, connectTimeout: 3000, reconnectRetries: 1, reconnectWait: 3000,
                maxMessagesPerQueue: 100, clientNameId, smfPath: res.data.smfPath,
            };
            const clientName = `SolMsgUtil/${formatConnectTimestamp(new Date())}/${clientNameId}`;
            await cb.connect({ kind: 'solace', cfg, broker: target.broker, pass: res.data.pass, clientName });
        },
    };
}
