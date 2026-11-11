/**
 * The fake gateway's users and connections (go-web-proxy/store.go): the
 * profile `/me` returns, the targets the relay and dial use, and the admin
 * edits with their refusals. Entitlement is `matchGlob` from the app's own
 * `rbac.ts`, the function the Go side is held equal to.
 *
 * Mock-only.
 */
import { matchGlob } from '../../core/rbac';
import type { QGlob } from '../../core/types';
import type { ConnRec, GatewaySeed, ListedConn, ListedUser, ManagedProfile, UserRec } from './types';

/** The modules block a profile is computed with (configfile.go moduleSettings). */
export interface ModuleSettings {
    offered: string[];
    userDefault: string;
}

/** forUser: the user's own list, or the default, never beyond what is offered. */
export function modulesFor(ms: ModuleSettings, granted: string[] | null): string[] {
    return ms.offered.filter(id => (granted === null ? ms.userDefault === 'all' : granted.includes(id)));
}

const rows = (rs: QGlob[] | undefined): QGlob[] =>
    (rs ?? []).map(r => ({ brokers: r.brokers, msgVpns: r.msgVpns, queues: r.queues }));

function anyMatch(rs: QGlob[], broker: string, vpn: string): boolean {
    return rs.some(r => matchGlob(r.brokers, broker) && matchGlob(r.msgVpns, vpn));
}

/** entitled (rbac.go): an operate or read-only row names the broker and VPN. */
export function entitled(u: UserRec, broker: string, vpn: string): boolean {
    return anyMatch(u.operate, broker, vpn) || anyMatch(u.readOnly, broker, vpn);
}

const cloneConn = (c: ConnRec): ConnRec => ({
    broker: c.broker,
    hostname: c.hostname,
    semp: { ...c.semp },
    client: { ...c.client, msgVpns: c.client.msgVpns.map(v => ({ ...v })) },
});

export type UpsertUserResult = { ok: true; dropSessions: boolean } | { ok: false; error: 'blank_password' | 'last_admin' };
export type DeleteUserResult = 'deleted' | 'not_found' | 'last_admin';

/** A broker address, the scheme to reach it with (https or http, wss or ws) and the credential. */
export interface BrokerTarget { scheme: string; host: string; port: string; user: string; pass: string }

export function createStore(seed: GatewaySeed, onChange: () => void) {
    let users: UserRec[] = seed['msg-utility-users'].map(u => ({
        username: u.username,
        password: u.password,
        admin: u.admin,
        mustChangePassword: u.mustChangePassword ?? false,
        operate: rows(u.operate),
        readOnly: rows(u['read-only']),
        modules: u.modules ? [...u.modules] : null,
    }));
    let conns: ConnRec[] = seed['msg-utility-connections'].map(cloneConn);

    const findUser = (name: string) => users.find(u => u.username === name);
    const countAdmins = (list: UserRec[]) => list.filter(u => u.admin).length;
    const entitledVpns = (u: UserRec, c: ConnRec) => c.client.msgVpns.filter(v => entitled(u, c.broker, v.name));

    return {
        findUser,

        /** profile: names only, recomputed on every call; null for a deleted user. */
        profile(name: string, ms: ModuleSettings): ManagedProfile | null {
            const u = findUser(name);
            if (!u) return null;
            return {
                username: u.username,
                admin: u.admin,
                operate: rows(u.operate),
                readOnly: rows(u.readOnly),
                brokers: conns
                    .map(c => ({ broker: c.broker, msgVpns: entitledVpns(u, c).map(v => ({ name: v.name })) }))
                    .filter(b => b.msgVpns.length > 0),
                modules: modulesFor(ms, u.modules),
            };
        },

        /** sempTarget: an entitled VPN on the broker and a SEMP port. */
        sempTarget(name: string, broker: string): BrokerTarget | null {
            const u = findUser(name);
            const c = conns.find(x => x.broker === broker);
            if (!u || !c || c.semp.port === '' || entitledVpns(u, c).length === 0) return null;
            return { scheme: c.semp.scheme || 'https', host: c.hostname, port: c.semp.port, user: c.semp.username, pass: c.semp.password };
        },

        /** smfTarget: the VPN's client credential when the user may reach it. */
        smfTarget(name: string, broker: string, vpn: string): BrokerTarget | null {
            const u = findUser(name);
            const c = conns.find(x => x.broker === broker);
            const v = u && c ? entitledVpns(u, c).find(x => x.name === vpn) : undefined;
            return c && v ? { scheme: c.client.scheme || 'wss', host: c.hostname, port: c.client.port, user: v.username, pass: v.password } : null;
        },

        /** isAdmin: null for a deleted user. */
        isAdmin(name: string): boolean | null {
            const u = findUser(name);
            return u ? u.admin : null;
        },

        listUsers(): ListedUser[] {
            return users.map(u => ({
                username: u.username,
                admin: u.admin,
                mustChangePassword: u.mustChangePassword,
                operate: rows(u.operate),
                readOnly: rows(u.readOnly),
                modules: u.modules ? [...u.modules] : null,
            }));
        },

        /** upsertUser: a blank password keeps the stored one on an edit and refuses a new user. */
        upsertUser(rec: Omit<UserRec, 'password' | 'mustChangePassword'>, password: string): UpsertUserResult {
            const old = findUser(rec.username);
            if (!old && password === '') return { ok: false, error: 'blank_password' };
            if (old && old.admin && !rec.admin && countAdmins(users) <= 1) return { ok: false, error: 'last_admin' };
            const next: UserRec = {
                ...rec,
                password: password !== '' ? password : old!.password,
                mustChangePassword: password !== '' ? false : (old?.mustChangePassword ?? false),
            };
            users = old ? users.map(u => (u === old ? next : u)) : [...users, next];
            onChange();
            return { ok: true, dropSessions: !!old && (password !== '' || old.admin !== rec.admin) };
        },

        /** setPassword: the user's own change, which also clears the forced change. */
        setPassword(name: string, password: string): boolean {
            const u = findUser(name);
            if (!u) return false;
            users = users.map(x => (x === u ? { ...u, password, mustChangePassword: false } : x));
            return true;
        },

        deleteUser(name: string): DeleteUserResult {
            const u = findUser(name);
            if (!u) return 'not_found';
            if (u.admin && countAdmins(users) <= 1) return 'last_admin';
            users = users.filter(x => x !== u);
            onChange();
            return 'deleted';
        },

        /** The list the admin app shows: no password, the schemes named. */
        listConnections(): ListedConn[] {
            return conns.map(c => ({
                broker: c.broker,
                hostname: c.hostname,
                semp: { scheme: c.semp.scheme || 'https', port: c.semp.port, user: c.semp.username, pass: '' },
                client: {
                    scheme: c.client.scheme || 'wss',
                    port: c.client.port,
                    msgVpns: c.client.msgVpns.map(v => ({ name: v.name, user: v.username, pass: '' })),
                },
            }));
        },

        /** upsertConnection with mergeConnSecrets: a blank password keeps the stored one, VPNs matched by name. */
        upsertConnection(c: ConnRec): void {
            const old = conns.find(x => x.broker === c.broker);
            const next = cloneConn(c);
            if (old) {
                if (next.semp.password === '') next.semp.password = old.semp.password;
                for (const v of next.client.msgVpns) {
                    if (v.password === '') v.password = old.client.msgVpns.find(o => o.name === v.name)?.password ?? '';
                }
            }
            conns = old ? conns.map(x => (x === old ? next : x)) : [...conns, next];
            onChange();
        },

        deleteConnection(broker: string): boolean {
            const before = conns.length;
            conns = conns.filter(c => c.broker !== broker);
            onChange();
            return conns.length < before;
        },

        /** replaceUsers (an import): the whole list, already validated. */
        replaceUsers(next: UserRec[]): void {
            users = next.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly), modules: u.modules ? [...u.modules] : null }));
            onChange();
        },

        /** replaceConnections (an import): the whole list, already validated. */
        replaceConnections(next: ConnRec[]): void {
            conns = next.map(cloneConn);
            onChange();
        },

        /** Everything, for the snapshot a reload restores. */
        dump(): { users: UserRec[]; conns: ConnRec[] } {
            return { users: users.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly) })), conns: conns.map(cloneConn) };
        },
        load(d: { users: UserRec[]; conns: ConnRec[] }): void {
            users = d.users.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly) }));
            conns = d.conns.map(cloneConn);
        },
    };
}

export type GatewayStore = ReturnType<typeof createStore>;
