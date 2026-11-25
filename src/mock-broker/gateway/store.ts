/**
 * The fake gateway's users and connections (go-web-proxy/store.go): the
 * profile `/me` returns, the targets the relay and dial use, and the admin
 * edits with their refusals. Entitlement is `matchGlob` from the app's own
 * `rbac.ts`, the function the Go side is held equal to.
 *
 * Versions, in memory instead of in the sealed files: each list has a `seq`
 * that moves by 1 on every commit, and each record a `rev`. A record's rev
 * becomes the new seq only when the record changed as the admin console sees
 * it (`userView`, `connView`: no password), so a save that only sets a
 * password moves seq and keeps rev. A create always takes the new seq, and an
 * import restamps every record of the list it replaces. A rev is never
 * reused: a delete moves seq and leaves no record holding it. A save that
 * passes a rev is checked against it (exists, not_found, stale); one that
 * passes none is the control panel's or a test's own edit and is not.
 *
 * Two-factor (store.go `userRec.TOTP`) is part of the admin view as a flag
 * (`twoFactor`), so enrolling and an administrator's reset move the rev while
 * setting it up again, or a used recovery code, moves only the seq. A save
 * through `upsertUser` never carries or clears it: it keeps the stored record,
 * as a blank password keeps the hash.
 *
 * Mock-only.
 */
import { matchGlob } from '../../core/rbac';
import type { QGlob } from '../../core/types';
import type { ConnRec, GatewaySeed, ListedConn, ListedUser, ManagedProfile, UserRec, UserTotp } from './types';

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

/** What `GET /managed/users` shows of a record, but its rev: the rev moves when this does. */
const userView = (u: UserRec): Omit<ListedUser, 'rev'> => ({
    username: u.username,
    admin: u.admin,
    mustChangePassword: u.mustChangePassword,
    operate: rows(u.operate),
    readOnly: rows(u.readOnly),
    modules: u.modules ? [...u.modules] : null,
    twoFactor: u.totp !== undefined,
});

/** The user's two-factor record copied, or nothing for a user without one (a spread). */
const cloneTotp = (u: UserRec): { totp?: UserTotp } =>
    (u.totp ? { totp: { secret: u.totp.secret, recovery: [...u.totp.recovery] } } : {});

/** clientHost: the host the broker's messaging answers on, the client part's own or the record's. */
const clientHost = (c: ConnRec): string => c.client.hostname || c.hostname;

/** A record's SEMP address and credential. */
const sempAddress = (c: ConnRec): BrokerTarget =>
    ({ scheme: c.semp.scheme || 'https', host: c.hostname, port: c.semp.port, path: c.semp.urlPath ?? '', user: c.semp.username, pass: c.semp.password });

/** What `GET /managed/connections` shows of a record, but its rev: no password, both schemes named. */
const connView = (c: ConnRec): Omit<ListedConn, 'rev'> => ({
    broker: c.broker,
    hostname: c.hostname,
    semp: { scheme: c.semp.scheme || 'https', port: c.semp.port, ...(c.semp.urlPath ? { urlPath: c.semp.urlPath } : {}), user: c.semp.username, pass: '' },
    client: {
        ...(c.client.hostname ? { hostname: c.client.hostname } : {}),
        scheme: c.client.scheme || 'wss',
        port: c.client.port,
        ...(c.client.urlPath ? { urlPath: c.client.urlPath } : {}),
        msgVpns: c.client.msgVpns.map(v => ({ name: v.name, user: v.username, pass: '' })),
    },
});

const sameView = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const cloneConn = (c: ConnRec): ConnRec => ({
    broker: c.broker,
    hostname: c.hostname,
    semp: { ...c.semp },
    client: { ...c.client, msgVpns: c.client.msgVpns.map(v => ({ ...v })) },
});

export type RevRefusal = 'exists' | 'not_found' | 'stale';
export type UpsertUserResult =
    | { ok: true; rev: number; dropSessions: boolean }
    | { ok: false; error: RevRefusal | 'blank_password' | 'last_admin' };
export type DeleteUserResult = 'deleted' | 'not_found' | 'stale' | 'last_admin';
export type UpsertConnResult = { ok: true; rev: number } | { ok: false; error: RevRefusal };
export type DeleteConnResult = 'deleted' | 'not_found' | 'stale';

/** One list's version state as a reload carries it. */
export interface ListVersions { seq: number; revs: Record<string, number> }

/** Everything the store holds, for the snapshot a reload restores. */
export interface StoreDump { users: UserRec[]; conns: ConnRec[]; versions: { users: ListVersions; connections: ListVersions } }

/** A broker address, the scheme to reach it with (https or http, wss or ws), the URL path its own paths sit under ('' for none) and the credential. */
export interface BrokerTarget { scheme: string; host: string; port: string; path: string; user: string; pass: string }

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
    // A seed carries no revs: the first start stamps every record with the first seq.
    let usersSeq = 1;
    let userRevs = new Map<string, number>(users.map(u => [u.username, 1] as const));
    let connsSeq = 1;
    let connRevs = new Map<string, number>(conns.map(c => [c.broker, 1] as const));

    const findUser = (name: string) => users.find(u => u.username === name);
    const countAdmins = (list: UserRec[]) => list.filter(u => u.admin).length;
    const entitledVpns = (u: UserRec, c: ConnRec) => c.client.msgVpns.filter(v => entitled(u, c.broker, v.name));

    return {
        findUser,

        /** profile: names only, recomputed on every call; null for a deleted user. The router adds the two-factor state. */
        profile(name: string, ms: ModuleSettings): Omit<ManagedProfile, 'twoFactor'> | null {
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
            return sempAddress(c);
        },

        /** A saved connection's SEMP address and credential, whoever asks: what the Message VPN lookup compares a form with (vpns.ts). */
        sempOf(broker: string): BrokerTarget | null {
            const c = conns.find(x => x.broker === broker);
            return c ? sempAddress(c) : null;
        },

        /** smfTarget: the VPN's client credential when the user may reach it. */
        smfTarget(name: string, broker: string, vpn: string): BrokerTarget | null {
            const u = findUser(name);
            const c = conns.find(x => x.broker === broker);
            const v = u && c ? entitledVpns(u, c).find(x => x.name === vpn) : undefined;
            return c && v
                ? { scheme: c.client.scheme || 'wss', host: clientHost(c), port: c.client.port, path: c.client.urlPath ?? '', user: v.username, pass: v.password }
                : null;
        },

        /** isAdmin: null for a deleted user. */
        isAdmin(name: string): boolean | null {
            const u = findUser(name);
            return u ? u.admin : null;
        },

        listUsers(): ListedUser[] {
            return users.map(u => ({ ...userView(u), rev: userRevs.get(u.username)! }));
        },

        /** The current rev of a user; undefined when there is none. */
        userRev: (name: string) => userRevs.get(name),

        /**
         * upsertUser: a blank password keeps the stored one on an edit and refuses a new user.
         * With a `rev` (the gateway's PUT): 0 creates and refuses a taken name, above 0 updates
         * and refuses a missing name or any rev but the current one, in that order, before the
         * rules about the record. Without one, an unconditional edit.
         */
        upsertUser(rec: Omit<UserRec, 'password' | 'mustChangePassword' | 'totp'>, password: string, rev?: number): UpsertUserResult {
            const old = findUser(rec.username);
            if (rev !== undefined) {
                if (old && rev === 0) return { ok: false, error: 'exists' };
                if (!old && rev > 0) return { ok: false, error: 'not_found' };
                if (old && rev !== userRevs.get(old.username)) return { ok: false, error: 'stale' };
            }
            if (!old && password === '') return { ok: false, error: 'blank_password' };
            if (old && old.admin && !rec.admin && countAdmins(users) <= 1) return { ok: false, error: 'last_admin' };
            const next: UserRec = {
                ...rec,
                password: password !== '' ? password : old!.password,
                mustChangePassword: password !== '' ? false : (old?.mustChangePassword ?? false),
                ...(old ? cloneTotp(old) : {}),
            };
            users = old ? users.map(u => (u === old ? next : u)) : [...users, next];
            usersSeq += 1;
            if (!old || !sameView(userView(old), userView(next))) userRevs.set(next.username, usersSeq);
            onChange();
            return { ok: true, rev: userRevs.get(next.username)!, dropSessions: !!old && (password !== '' || old.admin !== rec.admin) };
        },

        /** setPassword: the user's own change, which also clears the forced change. The rev moves only if that flag flipped. */
        setPassword(name: string, password: string): boolean {
            const u = findUser(name);
            if (!u) return false;
            const next = { ...u, password, mustChangePassword: false };
            users = users.map(x => (x === u ? next : x));
            usersSeq += 1;
            if (!sameView(userView(u), userView(next))) userRevs.set(name, usersSeq);
            return true;
        },

        /** The user's two-factor record; undefined when there is none (or no such user). */
        totpOf: (name: string): UserTotp | undefined => findUser(name)?.totp,

        /** Every user that has two-factor, with the secret, for the Demo controls' Authenticator. */
        listTotp(): { user: string; secret: string }[] {
            return users.flatMap(u => (u.totp ? [{ user: u.username, secret: u.totp.secret }] : []));
        },

        /**
         * setTOTP: set two-factor up, or up again, replacing the secret and every recovery code in one
         * commit. `expect` is the password the check saw, as setPassword's. The rev moves only when the
         * user had none (the admin view's flag flipped).
         */
        setTotp(name: string, totp: UserTotp, expect: string): 'ok' | 'not_found' | 'account_changed' {
            const u = findUser(name);
            if (!u) return 'not_found';
            if (u.password !== expect) return 'account_changed';
            const next: UserRec = { ...u, totp: { secret: totp.secret, recovery: [...totp.recovery] } };
            users = users.map(x => (x === u ? next : x));
            usersSeq += 1;
            if (!sameView(userView(u), userView(next))) userRevs.set(name, usersSeq);
            return 'ok';
        },

        /** useRecoveryCode: remove a used code's hash; the number left, or null when the user has no such code. The rev stays. */
        useRecovery(name: string, hash: string): number | null {
            const u = findUser(name);
            const t = u?.totp;
            if (!u || !t || !t.recovery.includes(hash)) return null;
            const recovery = t.recovery.filter(h => h !== hash);
            users = users.map(x => (x === u ? { ...u, totp: { secret: t.secret, recovery } } : x));
            usersSeq += 1;
            return recovery.length;
        },

        /**
         * clearTOTP (an administrator's reset): null for an unknown user, else the user's rev, which
         * moves only when there was two-factor to remove (`removed`).
         */
        clearTotp(name: string): { rev: number; removed: boolean } | null {
            const u = findUser(name);
            if (!u) return null;
            if (!u.totp) return { rev: userRevs.get(name)!, removed: false };
            const next: UserRec = { ...u };
            delete next.totp;
            users = users.map(x => (x === u ? next : x));
            usersSeq += 1;
            userRevs.set(name, usersSeq);
            return { rev: usersSeq, removed: true };
        },

        /** deleteUser; with a `rev`, a rev other than the current one is 'stale' (after 'not_found', before the last-admin rule). */
        deleteUser(name: string, rev?: number): DeleteUserResult {
            const u = findUser(name);
            if (!u) return 'not_found';
            if (rev !== undefined && rev !== userRevs.get(name)) return 'stale';
            if (u.admin && countAdmins(users) <= 1) return 'last_admin';
            users = users.filter(x => x !== u);
            userRevs.delete(name);
            usersSeq += 1;
            onChange();
            return 'deleted';
        },

        /** The list the admin app shows: no password, the schemes named. */
        listConnections(): ListedConn[] {
            return conns.map(c => ({ ...connView(c), rev: connRevs.get(c.broker)! }));
        },

        /** The current rev of a connection; undefined when there is none. */
        connRev: (broker: string) => connRevs.get(broker),

        /** The counters an import's basis holds: the seq of each list. */
        seqs: () => ({ users: usersSeq, connections: connsSeq }),

        /**
         * upsertConnection with mergeConnSecrets: a blank password keeps the stored one, VPNs matched by name.
         * The `rev` is checked as upsertUser's is.
         */
        upsertConnection(c: ConnRec, rev?: number): UpsertConnResult {
            const old = conns.find(x => x.broker === c.broker);
            if (rev !== undefined) {
                if (old && rev === 0) return { ok: false, error: 'exists' };
                if (!old && rev > 0) return { ok: false, error: 'not_found' };
                if (old && rev !== connRevs.get(c.broker)) return { ok: false, error: 'stale' };
            }
            const next = cloneConn(c);
            if (old) {
                if (next.semp.password === '') next.semp.password = old.semp.password;
                for (const v of next.client.msgVpns) {
                    if (v.password === '') v.password = old.client.msgVpns.find(o => o.name === v.name)?.password ?? '';
                }
            }
            conns = old ? conns.map(x => (x === old ? next : x)) : [...conns, next];
            connsSeq += 1;
            if (!old || !sameView(connView(old), connView(next))) connRevs.set(next.broker, connsSeq);
            onChange();
            return { ok: true, rev: connRevs.get(next.broker)! };
        },

        /** deleteConnection; with a `rev`, a rev other than the current one is 'stale' (after 'not_found'). */
        deleteConnection(broker: string, rev?: number): DeleteConnResult {
            if (!conns.some(c => c.broker === broker)) return 'not_found';
            if (rev !== undefined && rev !== connRevs.get(broker)) return 'stale';
            conns = conns.filter(c => c.broker !== broker);
            connRevs.delete(broker);
            connsSeq += 1;
            onChange();
            return 'deleted';
        },

        /** replaceUsers (an import): the whole list, already validated; every record is restamped. */
        replaceUsers(next: UserRec[]): void {
            users = next.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly), modules: u.modules ? [...u.modules] : null, ...cloneTotp(u) }));
            usersSeq += 1;
            userRevs = new Map<string, number>(users.map(u => [u.username, usersSeq] as const));
            onChange();
        },

        /** replaceConnections (an import): the whole list, already validated; every record is restamped. */
        replaceConnections(next: ConnRec[]): void {
            conns = next.map(cloneConn);
            connsSeq += 1;
            connRevs = new Map<string, number>(conns.map(c => [c.broker, connsSeq] as const));
            onChange();
        },

        /** Everything, for the snapshot a reload restores. */
        dump(): StoreDump {
            return {
                users: users.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly), ...cloneTotp(u) })),
                conns: conns.map(cloneConn),
                versions: {
                    users: { seq: usersSeq, revs: Object.fromEntries(userRevs) },
                    connections: { seq: connsSeq, revs: Object.fromEntries(connRevs) },
                },
            };
        },
        load(d: StoreDump): void {
            users = d.users.map(u => ({ ...u, operate: rows(u.operate), readOnly: rows(u.readOnly), ...cloneTotp(u) }));
            conns = d.conns.map(cloneConn);
            usersSeq = d.versions.users.seq;
            userRevs = new Map(Object.entries(d.versions.users.revs));
            connsSeq = d.versions.connections.seq;
            connRevs = new Map(Object.entries(d.versions.connections.revs));
        },
    };
}

export type GatewayStore = ReturnType<typeof createStore>;
