/**
 * User-management service — admin CRUD over the gateway's `/managed/users`
 * endpoints, authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 *
 * The password travels as typed, over TLS; the gateway hashes it and never
 * sends a hash back, so the list carries none and a blank password on edit
 * keeps the stored one.
 *
 * Every listed user carries its `rev`. A save sends the rev of the record the
 * form opened (0 creates) and gets the record's new rev back; a delete sends
 * the rev as `?rev=N`. The gateway refuses a rev that is no longer current
 * (`stale`).
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
    /** The record's version, as listed; a save sends it back (0 = a new user). */
    rev: number;
    /** Two-factor sign-in is set up for this user. Read-only: a save never carries it. */
    twoFactor: boolean;
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

/**
 * A user as written back: `password` as typed, or '' to keep the stored one; `rev` is the opened record's (0 to create).
 * Without `twoFactor`: the gateway refuses it as an unknown field, since only a reset changes it.
 */
export interface UserPayload extends Omit<ManagedUser, 'twoFactor'> {
    password: string;
}

export interface UserMgmtService {
    listUsers(): Promise<ManagedResult<UserList>>;
    /** PUT /managed/users/{username}: create (rev 0), or edit an existing user. Answers the new rev. */
    saveUser(user: UserPayload): Promise<ManagedResult<{ rev: number }>>;
    /** DELETE /managed/users/{username}?rev=N. */
    deleteUser(username: string, rev: number): Promise<ManagedResult<void>>;
    /** DELETE /managed/users/{username}/totp: removes the user's two-factor sign-in (a lost phone). Answers the user's current rev; no rev is sent. */
    resetTwoFactor(username: string): Promise<ManagedResult<{ rev: number }>>;
}

const userPath = (username: string) => `/managed/users/${encodeURIComponent(username)}`;

export function createUserMgmtService(): UserMgmtService {
    return {
        listUsers: () => managedRequest<UserList>('GET', '/managed/users'),
        saveUser: ({ username, ...body }) => managedRequest<{ rev: number }>('PUT', userPath(username), body),
        deleteUser: (username, rev) => managedRequest('DELETE', `${userPath(username)}?rev=${rev}`),
        resetTwoFactor: username => managedRequest<{ rev: number }>('DELETE', `${userPath(username)}/totp`),
    };
}
