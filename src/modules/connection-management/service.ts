/**
 * Connection-management service — admin CRUD over the gateway's
 * `/managed/connections` endpoints, authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 *
 * Broker credentials are packed client-side (WebCrypto, the per-deployment
 * siteSeed) BEFORE they reach this service — the gateway stores the opaque
 * blobs and never unpacks them. The list response omits the packed blobs, so
 * editing a connection with blank password fields keeps the stored secrets.
 */
import { managedRequest, type ManagedResult } from '../../core/services/managed-api';

export interface ManagedConnVpn {
    name: string;
    user: string;
    pass: string; // packed (V1:) on write; '' from list / '' = keep on edit
}

export interface ManagedConnRecord {
    broker: string;
    hostname: string;
    semp: { port: string; user: string; pass: string };
    client: { port: string; msgVpns: ManagedConnVpn[] };
}

export interface ConnMgmtService {
    listConnections(): Promise<ManagedResult<ManagedConnRecord[]>>;
    /** PUT /managed/connections/{broker}: create, or edit an existing broker. */
    saveConnection(connection: ManagedConnRecord): Promise<ManagedResult<void>>;
    deleteConnection(broker: string): Promise<ManagedResult<void>>;
}

const connPath = (broker: string) => `/managed/connections/${encodeURIComponent(broker)}`;

export function createConnMgmtService(): ConnMgmtService {
    return {
        async listConnections() {
            const res = await managedRequest<{ connections: ManagedConnRecord[] }>('GET', '/managed/connections');
            return res.ok ? { ok: true, data: res.data.connections } : res;
        },
        saveConnection: ({ broker, ...body }) => managedRequest('PUT', connPath(broker), body),
        deleteConnection: (broker) => managedRequest('DELETE', connPath(broker)),
    };
}
