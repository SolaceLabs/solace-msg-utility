/**
 * User-management service — admin CRUD over the gateway's `/managed/users`
 * endpoints, authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 *
 * The password travels as typed, over TLS; the gateway hashes it and never
 * sends a hash back, so the list carries none and a blank password on edit
 * keeps the stored one.
 */
import { managedRequest, type ManagedResult } from '../../core/services/managed-api';
import type { QGlob } from '../../core/types';

export interface ManagedUser {
    username: string;
    admin: boolean;
    operate: QGlob[];
    readOnly: QGlob[];
}

/** A user as written back: `password` as typed, or '' to keep the stored one. */
export interface UserPayload extends ManagedUser {
    password: string;
}

export interface UserMgmtService {
    listUsers(): Promise<ManagedResult<ManagedUser[]>>;
    /** PUT /managed/users/{username}: create, or edit an existing user. */
    saveUser(user: UserPayload): Promise<ManagedResult<void>>;
    deleteUser(username: string): Promise<ManagedResult<void>>;
}

const userPath = (username: string) => `/managed/users/${encodeURIComponent(username)}`;

export function createUserMgmtService(): UserMgmtService {
    return {
        async listUsers() {
            const res = await managedRequest<{ users: ManagedUser[] }>('GET', '/managed/users');
            return res.ok ? { ok: true, data: res.data.users } : res;
        },
        saveUser: ({ username, ...body }) => managedRequest('PUT', userPath(username), body),
        deleteUser: (username) => managedRequest('DELETE', userPath(username)),
    };
}
