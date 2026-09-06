/**
 * Connection-management service — admin CRUD over /managed/listConnections,
 * /managed/saveConnection, /managed/deleteConnection on the go-web-proxy.
 *
 * Same-origin plain `fetch`; resend-token auth in the JSON body (see
 * user-management/service.ts for the shared rationale). Broker credentials are
 * packed client-side (WebCrypto, the per-deployment siteSeed) BEFORE they reach
 * this service — the proxy stores the opaque blobs and never unpacks them. The
 * list response omits the packed blobs, so editing a connection with blank
 * password fields keeps the stored secrets.
 *
 * Contract: list → 200 with body, else null. save/delete → 204 on success,
 * else false. Transport errors reject.
 */
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
    listConnections(username: string, token: string): Promise<ManagedConnRecord[] | null>;
    saveConnection(username: string, token: string, connection: ManagedConnRecord): Promise<boolean>;
    deleteConnection(username: string, token: string, target: string): Promise<boolean>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createConnMgmtService(): ConnMgmtService {
    async function listConnections(username: string, token: string): Promise<ManagedConnRecord[] | null> {
        const res = await fetch('/managed/listConnections', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token }),
        });
        if (res.status === 200) {
            const json = (await res.json()) as { connections: ManagedConnRecord[] };
            return json.connections;
        }
        return null;
    }

    async function saveConnection(username: string, token: string, connection: ManagedConnRecord): Promise<boolean> {
        const res = await fetch('/managed/saveConnection', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token, connection }),
        });
        return res.status === 204;
    }

    async function deleteConnection(username: string, token: string, target: string): Promise<boolean> {
        const res = await fetch('/managed/deleteConnection', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token, target }),
        });
        return res.status === 204;
    }

    return { listConnections, saveConnection, deleteConnection };
}
