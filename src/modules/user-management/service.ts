/**
 * User-management service — admin CRUD over /managed/users* on the go-web-proxy.
 *
 * Same-origin plain `fetch` (NOT sempFetch — these endpoints are served by the
 * proxy that serves the SPA). Every call carries the caller's admin
 * {username, token} in the JSON body (resend-token auth — there is no session
 * layer). Passwords are sent already one-way-stamped by the caller; a blank
 * password on edit means "keep the stored one" (the proxy never sends tokens
 * back, so the list response omits them).
 *
 * Contract: list → 200 with body, else null. save/delete → 204 on success,
 * else false. Transport errors reject (the module's try/catch surfaces them).
 */
import type { QGlob } from '../../core/types';

export interface ManagedUser {
    username: string;
    admin: boolean;
    operate: QGlob[];
    readOnly: QGlob[];
}

/** A user as written back: `password` is the client-side stamp, or '' to keep. */
export interface UserPayload extends ManagedUser {
    password: string;
}

export interface UserMgmtService {
    listUsers(username: string, token: string): Promise<ManagedUser[] | null>;
    saveUser(username: string, token: string, user: UserPayload): Promise<boolean>;
    deleteUser(username: string, token: string, target: string): Promise<boolean>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function createUserMgmtService(): UserMgmtService {
    async function listUsers(username: string, token: string): Promise<ManagedUser[] | null> {
        const res = await fetch('/managed/listUsers', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token }),
        });
        if (res.status === 200) {
            const json = (await res.json()) as { users: ManagedUser[] };
            return json.users;
        }
        return null;
    }

    async function saveUser(username: string, token: string, user: UserPayload): Promise<boolean> {
        const res = await fetch('/managed/saveUser', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token, user }),
        });
        return res.status === 204;
    }

    async function deleteUser(username: string, token: string, target: string): Promise<boolean> {
        const res = await fetch('/managed/deleteUser', {
            method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ username, token, target }),
        });
        return res.status === 204;
    }

    return { listUsers, saveUser, deleteUser };
}
