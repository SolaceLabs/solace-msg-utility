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
    /** App modules this user may open; null = the deployment default. */
    modules: string[] | null;
}

/** What the modules editor offers: config.yaml's `modules.*` and the catalog. */
export interface ModuleChoices {
    /** Every module an administrator can grant. */
    catalog: string[];
    /** The deployment's ceiling (`modules.offered`); a grant outside it has no effect. */
    offered: string[];
    /** What a user without a list of their own gets. */
    userDefault: 'all' | 'none';
}

export interface UserList {
    users: ManagedUser[];
    modules: ModuleChoices;
}

/** A user as written back: `password` as typed, or '' to keep the stored one. */
export interface UserPayload extends ManagedUser {
    password: string;
}

export interface UserMgmtService {
    listUsers(): Promise<ManagedResult<UserList>>;
    /** PUT /managed/users/{username}: create, or edit an existing user. */
    saveUser(user: UserPayload): Promise<ManagedResult<void>>;
    deleteUser(username: string): Promise<ManagedResult<void>>;
}

const userPath = (username: string) => `/managed/users/${encodeURIComponent(username)}`;

export function createUserMgmtService(): UserMgmtService {
    return {
        listUsers: () => managedRequest<UserList>('GET', '/managed/users'),
        saveUser: ({ username, ...body }) => managedRequest('PUT', userPath(username), body),
        deleteUser: (username) => managedRequest('DELETE', userPath(username)),
    };
}
