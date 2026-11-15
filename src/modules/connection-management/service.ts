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
 */
import { managedRequest, type ManagedResult } from '../../core/services/managed-api';

export interface ManagedConnVpn {
    name: string;
    user: string;
    pass: string; // as typed on write; '' from list / '' = keep on edit
}

/** A blank or missing scheme is TLS: https for SEMP, wss for SMF. */
export interface ManagedConnRecord {
    /** The record's version, as listed; a save sends it back (0 = a new connection). */
    rev: number;
    broker: string;
    hostname: string;
    semp: { scheme?: 'https' | 'http'; port: string; user: string; pass: string };
    client: { scheme?: 'wss' | 'ws'; port: string; msgVpns: ManagedConnVpn[] };
}

export interface ConnMgmtService {
    listConnections(): Promise<ManagedResult<ManagedConnRecord[]>>;
    /** PUT /managed/connections/{broker}: create (rev 0), or edit an existing broker. Answers the new rev. */
    saveConnection(connection: ManagedConnRecord): Promise<ManagedResult<{ rev: number }>>;
    /** DELETE /managed/connections/{broker}?rev=N. */
    deleteConnection(broker: string, rev: number): Promise<ManagedResult<void>>;
}

const connPath = (broker: string) => `/managed/connections/${encodeURIComponent(broker)}`;

export function createConnMgmtService(): ConnMgmtService {
    return {
        async listConnections() {
            const res = await managedRequest<{ connections: ManagedConnRecord[] }>('GET', '/managed/connections');
            return res.ok ? { ok: true, data: res.data.connections } : res;
        },
        saveConnection: ({ broker, ...body }) => managedRequest<{ rev: number }>('PUT', connPath(broker), body),
        deleteConnection: (broker, rev) => managedRequest('DELETE', `${connPath(broker)}?rev=${rev}`),
    };
}
