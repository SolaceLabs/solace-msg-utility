/**
 * Connection-management service — admin CRUD over the gateway's
 * `/managed/connections` endpoints, authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 *
 * Broker passwords travel as typed, over TLS; the gateway keeps them in its
 * encrypted connections file. The list response omits them, so editing a
 * connection with blank password fields keeps the stored ones.
 *
 * Every listed connection carries its `rev`: a save sends the rev of the record
 * the form opened (0 creates) and gets the new rev back; a delete sends it as
 * `?rev=N`. The gateway refuses a rev that is no longer current (`stale`).
 *
 * A Message VPN lookup sends the form's SEMP details, saved or not, and gets
 * the broker's Message VPN names back: the gateway asks the broker.
 */
import { managedRequest, type ManagedResult } from '../../core/services/managed-api';

export interface ManagedConnVpn {
    name: string;
    user: string;
    pass: string; // as typed on write; '' from list / '' = keep on edit
}

/**
 * A blank or missing scheme is TLS: https for SEMP, wss for SMF. `hostname`
 * serves SEMP and messaging alike unless the record is an appliance: then
 * `client.hostname` names the messaging host, which may be the same host.
 * A `urlPath` is the path a broker behind a reverse proxy sits under, between
 * the port and the broker's own paths; left out, there is none.
 */
export interface ManagedConnRecord {
    /** The record's version, as listed; a save sends it back (0 = a new connection). */
    rev: number;
    broker: string;
    hostname: string;
    semp: { scheme?: 'https' | 'http'; port: string; urlPath?: string; user: string; pass: string };
    client: { hostname?: string; scheme?: 'wss' | 'ws'; port: string; urlPath?: string; msgVpns: ManagedConnVpn[] };
}

/** What a Message VPN lookup sends: the SEMP details in the form, saved or not. */
export interface VpnLookup {
    /** The saved connection the form edits, '' for a new one: a blank password stands for its stored one. */
    broker: string;
    hostname: string;
    semp: { scheme: 'https' | 'http'; port: string; urlPath?: string; user: string; pass: string };
}

export interface ConnMgmtService {
    /** GET /managed/connections: the gateway's list, as it sends it. */
    listConnections(): Promise<ManagedResult<{ connections: ManagedConnRecord[] }>>;
    /** PUT /managed/connections/{broker}: create (rev 0), or edit an existing broker. Answers the new rev. */
    saveConnection(connection: ManagedConnRecord): Promise<ManagedResult<{ rev: number }>>;
    /** DELETE /managed/connections/{broker}?rev=N. */
    deleteConnection(broker: string, rev: number): Promise<ManagedResult<void>>;
    /** POST /managed/connections/vpns: the Message VPN names of the broker the form describes, which the gateway reads over SEMP. */
    lookupVpns(lookup: VpnLookup): Promise<ManagedResult<{ vpns: string[] }>>;
}

const connPath = (broker: string) => `/managed/connections/${encodeURIComponent(broker)}`;

export function createConnMgmtService(): ConnMgmtService {
    return {
        listConnections: () => managedRequest<{ connections: ManagedConnRecord[] }>('GET', '/managed/connections'),
        saveConnection: ({ broker, ...body }) => managedRequest<{ rev: number }>('PUT', connPath(broker), body),
        deleteConnection: (broker, rev) => managedRequest('DELETE', `${connPath(broker)}?rev=${rev}`),
        lookupVpns: lookup => managedRequest<{ vpns: string[] }>('POST', '/managed/connections/vpns', lookup),
    };
}
