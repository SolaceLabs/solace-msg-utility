/**
 * Managed session store — the single owner of the signed-in user's provisioned
 * profile and the per-deployment seed.
 *
 * Why it exists: a managed session's broker credentials arrive PACKED inside the
 * `getConnections` profile, and more than one module needs to open a connection
 * with them (the connections module's primary connection, queue-copy's
 * provisioned destination). Anchor 1 forbids reaching into another module, and
 * the packed credentials are deliberately kept out of `AppState`, so the profile
 * lives here in core and is reached through `AppContext.managedStore`.
 *
 * State ownership line:
 *   - `AppState.managed`  = matcher inputs (admin, username, token, broker, vpns, operate, readOnly)
 *   - this store          = connection inputs (the seed + the packed profile)
 *
 * Credential posture: the seed and the packed passwords never leave this
 * closure. Consumers do not receive a secret — they hand in a `dial` callback
 * and the store invokes it with a ready-to-use connection payload, then drops
 * the plaintext. `packSecret` is the sealing counterpart, for the admin module
 * that must pack a credential before it leaves the browser.
 *
 * The writer is whichever module owns the managed login (today the connections
 * module; the standalone admin app once it exists). Writer moments are login,
 * refresh, and clear — see docs/architecture.md.
 */
import { fromB64, importSeed, pack, unpack } from '../encode';
import { generateUuid } from '../utils';
import type { ManagedProfile } from './managed-service';
// Straight from the connection-domain source rather than the `../types` barrel,
// which re-exports these and also imports this file's `ManagedStore`.
import type { SolaceConfig, SempConfig } from '../connections/types';

/** Target of a Solace (SMF) dial — a provisioned broker + VPN. */
export interface SolaceTarget { broker: string; vpn: string; kind: 'solace' }
/** Target of a SEMP dial — provisioned per broker, so no VPN. */
export interface SempTarget { broker: string; kind: 'semp' }

/**
 * The ready-to-use payloads handed to the caller's `dial`. `connect` is
 * overloaded on the target's `kind`, so a caller receives exactly one of these
 * already narrowed — no runtime discriminant check, and the Solace branch
 * carries its composed `clientName` without SEMP needing a nullable field.
 */
export interface SolaceDial { kind: 'solace'; cfg: SolaceConfig; host: string; pass: string; clientName: string }
export interface SempDial { kind: 'semp'; cfg: SempConfig; host: string; pass: string }
export type DialConn = SolaceDial | SempDial;

export interface ManagedStore {
    // --- writer side (the module owning the managed login) ---
    /** Adopt a profile; imports its seed internally. Called on login AND refresh. */
    setProfile(profile: ManagedProfile): Promise<void>;
    /** Drop the profile + seed (logout, or the Direct-connect interlock). */
    clear(): void;

    // --- consumer side ---
    isActive(): boolean;
    /** Provisioned brokers — names + hostnames only, never credentials. */
    brokers(): { broker: string; hostname: string }[];
    /** Provisioned VPN names for a broker; `[]` when unknown. */
    vpnsFor(broker: string): string[];
    /** Seal a plaintext secret with the deployment seed (admin save path). */
    packSecret(plaintext: string): Promise<string>;
    /**
     * Open a connection to a provisioned target. Unpacks the credential
     * just-in-time, invokes `dial.connect` with the assembled payload, and drops
     * the plaintext. Throws when the store is inactive or the target is not
     * provisioned — which also closes the connect-click-vs-logout race.
     */
    connect(target: SolaceTarget, dial: { connect(conn: SolaceDial): void | Promise<void> }): Promise<void>;
    connect(target: SempTarget, dial: { connect(conn: SempDial): void | Promise<void> }): Promise<void>;
}

/** Local-time YYYYMMDDHHMMSS stamp for the SDK clientName. */
function formatConnectTimestamp(d: Date): string {
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function createManagedSessionStore(): ManagedStore {
    // Inert until a managed login populates it, so non-managed deployments pay
    // nothing and every consumer sees `isActive() === false`.
    let profile: ManagedProfile | null = null;
    let seed: CryptoKey | null = null;

    function requireActive(op: string): { profile: ManagedProfile; seed: CryptoKey } {
        if (!profile || !seed) {
            throw new Error(`${op} requires a managed session; none is active.`);
        }
        return { profile, seed };
    }

    function connFor(p: ManagedProfile, broker: string) {
        const conn = p.brokers.find(b => b.broker === broker);
        if (!conn) {
            throw new Error(`Broker "${broker}" is not provisioned for this account.`);
        }
        return conn;
    }

    return {
        async setProfile(next: ManagedProfile): Promise<void> {
            // Import first: a bad seed leaves the previous state untouched
            // rather than half-adopting a profile we can't unpack.
            const nextSeed = await importSeed(fromB64(next.siteSeed));
            profile = next;
            seed = nextSeed;
        },

        clear(): void {
            profile = null;
            seed = null;
        },

        isActive(): boolean {
            return profile !== null && seed !== null;
        },

        brokers(): { broker: string; hostname: string }[] {
            return (profile?.brokers ?? []).map(b => ({ broker: b.broker, hostname: b.hostname }));
        },

        vpnsFor(broker: string): string[] {
            const conn = profile?.brokers.find(b => b.broker === broker);
            return conn ? conn.msgVpns.map(v => v.name) : [];
        },

        async packSecret(plaintext: string): Promise<string> {
            const active = requireActive('Packing a credential');
            return pack(plaintext, active.seed);
        },

        async connect(
            target: { broker: string; vpn?: string; kind: 'solace' | 'semp' },
            dial: { connect(conn: DialConn): void | Promise<void> },
        ): Promise<void> {
            const active = requireActive('Connecting');
            const conn = connFor(active.profile, target.broker);

            if (target.kind === 'semp') {
                const pass = await unpack(conn.semp.pass, active.seed);
                const cfg: SempConfig = {
                    protocol: 'https', port: conn.semp.port, urlPath: '', user: conn.semp.user,
                };
                await dial.connect({ kind: 'semp', cfg, host: conn.hostname, pass });
                return;
            }

            const vpn = conn.msgVpns.find(v => v.name === target.vpn);
            if (!vpn) {
                throw new Error(`VPN "${target.vpn}" is not provisioned on broker "${target.broker}".`);
            }
            const pass = await unpack(vpn.client.pass, active.seed);
            // Connection identity is owned here so the clientName always matches
            // the clientNameId inside the cfg it is composed from.
            const clientNameId = generateUuid();
            const cfg: SolaceConfig = {
                protocol: 'wss', port: vpn.client.port, urlPath: '', vpn: vpn.name, user: vpn.client.user,
                authMode: 'basic', connectRetries: 1, connectTimeout: 3000, reconnectRetries: 1, reconnectWait: 3000,
                maxMessagesPerQueue: 100, clientNameId,
            };
            const clientName = `SolMsgUtil/${formatConnectTimestamp(new Date())}/${clientNameId}`;
            await dial.connect({ kind: 'solace', cfg, host: conn.hostname, pass, clientName });
        },
    };
}
