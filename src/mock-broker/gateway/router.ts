/**
 * The fake gateway's `/managed/*` API (go-web-proxy/managed.go, dial.go),
 * behind the same gates in the same order:
 *
 *   1. no session: the same `401 unauthenticated` on every path;
 *   2. a session held at the password page: `403 password_change_required`
 *      everywhere but logout;
 *   3. the relay prefix goes to the relay; anything without a route, or with
 *      the wrong method, is `404 not_found`, never `405`;
 *   4. admin routes read the flag on every call: `401` for a deleted user,
 *      `403 forbidden` for a non-admin;
 *   5. a body that is not strict JSON is `400 bad_request`.
 *
 * Whole-record saves carry a version (versions.ts, store.ts): a PUT's `rev`
 * (0 creates) and a DELETE's `?rev=`, refused as 400 rev_required, 404
 * not_found, 409 exists or 409 stale in the gateway's order: what the body
 * alone settles (422, then rev_required), then the record, then its rev, then
 * the rules that need the rest of the store.
 *
 * Two-factor: `me` carries the setting and whether the caller is enrolled, the
 * user list a flag per user, and `DELETE /managed/users/{name}/totp` is an
 * administrator's reset (no rev is sent; the answer carries the user's rev,
 * moved only when there was two-factor to remove, which also ends that
 * user's sessions and tickets). A user's PUT never carries or clears it.
 *
 * TLS and restart: `/managed/tls/*` (tls.ts) and `POST /managed/restart`, administrators
 * only like the rest. A restart answers `202 { restarting: true }` and then,
 * through `restart` (index.ts), ends every session and ticket.
 *
 * Not simulated: the cross-site write check, the body cap and the
 * unauthenticated throttle, and the refusals of a store that cannot be
 * written (store_changed_on_disk, store_write_failed, audit_unavailable).
 *
 * Mock-only.
 */
import { BadRequest, boolean, list, nullableList, object, parseBody, string } from './strict';
import { canonScheme, CATALOG, connectionProblem, moduleIdsProblem, passwordOk, PASSWORD_MAX, USERNAME_RULE, validUsername } from './validate';
import { relay, RELAY_PREFIX, type Upstream } from './relay';
import type { GatewayStore } from './store';
import type { GatewaySessions, Session } from './sessions';
import { refusalBody, splitRev, type GatewaySettingsFile, type Refusal } from './settings';
import { bodyRev, exists, notFound, queryRev, revRequired, stale } from './versions';
import type { ClientSeen, ConnRec, DialResponse, GatewayRequest, GatewayResponse, ManagedProfile, UserList } from './types';
import type { QGlob } from '../../core/types';

/** The control panel's gateway faults. */
export interface RouterFaults {
    /** The relay cannot reach the broker. */
    relayUnreachable: boolean;
    /** Dial is over its per-minute window. */
    dialRateLimited: boolean;
}

export interface RouterDeps {
    store: GatewayStore;
    sessions: GatewaySessions;
    settings: GatewaySettingsFile;
    faults: () => RouterFaults;
    /** Backup & Restore's routes (backup.ts), admin only like the editors'. */
    backupRoutes: [string, string, Handler][];
    /** The TLS console's routes (tls.ts), admin only too. */
    tlsRoutes: [string, string, Handler][];
    /** The gateway restarts: sessions, tickets and sockets end. */
    restart: () => void;
    /** The browser's address as the gateway sees it (the seed's `client`). */
    client: string;
    /** The broker behind the relay, when a test scripts one; the demo broker otherwise. */
    upstream?: Upstream;
}

const ok = (json: unknown): GatewayResponse => ({ status: 200, json });
const noContent: GatewayResponse = { status: 204 };
const error = (status: number, code: string): GatewayResponse => ({ status, json: { error: code } });
const invalid = (field: string, reason: string): GatewayResponse => ({ status: 422, json: { error: 'invalid', field, reason } });

/** url.PathEscape: what dial puts in smfPath. */
export function pathEscape(s: string): string {
    return Array.from(new TextEncoder().encode(s), b => {
        const c = String.fromCharCode(b);
        return /[A-Za-z0-9\-_.~$&+:=@]/.test(c) ? c : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    }).join('');
}

const glob = (x: unknown): QGlob => {
    const o = object(x, ['brokers', 'msgVpns', 'queues']);
    return { brokers: string(o.brokers), msgVpns: string(o.msgVpns), queues: string(o.queues) };
};

export type Handler = (req: GatewayRequest, s: Session, sid: string, params: string[]) => GatewayResponse | Promise<GatewayResponse>;

export function createRouter({ store, sessions, settings, faults, backupRoutes, tlsRoutes, restart, client, upstream }: RouterDeps) {
    const adminOnly = (fn: Handler): Handler => (req, s, sid, params) => {
        const admin = store.isAdmin(s.user);
        if (admin === null) return error(401, 'unauthenticated');
        if (!admin) return error(403, 'forbidden');
        return fn(req, s, sid, params);
    };

    const me: Handler = (_req, s) => {
        const p = store.profile(s.user, settings.current().modules);
        if (!p) return error(401, 'unauthenticated');
        const body: ManagedProfile = { ...p, twoFactor: { mode: settings.current().login.twoFactor, enrolled: store.totpOf(s.user) !== undefined } };
        return ok(body);
    };

    const logout: Handler = (_req, _s, sid) => {
        sessions.drop(sid);
        return noContent;
    };

    const dial: Handler = (req, s) => {
        const b = object(parseBody(req.body), ['broker', 'vpn']);
        const broker = string(b.broker);
        const vpn = string(b.vpn);
        const t = store.smfTarget(s.user, broker, vpn);
        if (!t) return error(404, 'not_found');
        if (faults().dialRateLimited) return { ...error(429, 'rate_limited'), headers: { 'Retry-After': '60' } };
        const body: DialResponse = { smfPath: `/managed/smf/${pathEscape(broker)}/${pathEscape(vpn)}`, vpn, user: t.user, pass: t.pass };
        return ok(body);
    };

    const listUsers: Handler = () => {
        const ms = settings.current().modules;
        const body: UserList = {
            users: store.listUsers(),
            modules: { catalog: [...CATALOG], offered: [...ms.offered], userDefault: ms.userDefault as 'all' | 'none' },
        };
        return ok(body);
    };

    /** The user's PUT: 200 with the record's rev after the save. */
    const saveUser: Handler = (req, _s, _sid, [name]) => {
        const b = object(parseBody(req.body), ['password', 'admin', 'operate', 'readOnly', 'modules', 'rev']);
        const password = string(b.password);
        const modules = nullableList(b.modules, string);
        const rec = { username: name, admin: boolean(b.admin), operate: list(b.operate, glob), readOnly: list(b.readOnly, glob), modules };
        if (!validUsername(name)) return invalid('username', `Username ${USERNAME_RULE}.`);
        const least = settings.current().login.passwordMinLength;
        if (password !== '' && !passwordOk(password, least)) {
            return invalid('password', `Password must be ${least} to ${PASSWORD_MAX} characters.`);
        }
        const modulesProblem = modules && moduleIdsProblem('modules', modules);
        if (modulesProblem) return invalid('modules', modulesProblem);
        const rev = bodyRev(b.rev);
        if (rev === null) return revRequired;
        const r = store.upsertUser(rec, password, rev);
        if (!r.ok) {
            switch (r.error) {
                case 'exists': return exists;
                case 'not_found': return notFound;
                case 'stale': return stale(store.userRev(name)!);
                case 'last_admin': return error(409, 'last_admin');
                default: return invalid('password', 'A new user needs a password.');
            }
        }
        if (r.dropSessions) sessions.dropUser(name);
        return ok({ rev: r.rev });
    };

    const deleteUser: Handler = (req, _s, _sid, [name]) => {
        const rev = queryRev(req.query);
        if (rev === null) return revRequired;
        const r = store.deleteUser(name, rev);
        if (r === 'last_admin') return error(409, 'last_admin');
        if (r === 'not_found') return notFound;
        if (r === 'stale') return stale(store.userRev(name)!);
        sessions.dropUser(name);
        return noContent;
    };

    /** An administrator's reset of a user's two-factor: 200 with the user's rev; 404 for an unknown user. */
    const resetTotp: Handler = (_req, _s, _sid, [name]) => {
        const r = store.clearTotp(name);
        if (!r) return notFound;
        if (r.removed) sessions.dropUser(name);
        return ok({ rev: r.rev });
    };

    const listConnections: Handler = () => ok({ connections: store.listConnections() });

    /** saveConnection: a scheme left out, or the TLS one, is stored as the default (canonScheme). */
    const saveConnection: Handler = (req, _s, _sid, [broker]) => {
        const b = object(parseBody(req.body), ['hostname', 'semp', 'client', 'rev']);
        const semp = object(b.semp, ['scheme', 'port', 'user', 'pass']);
        const cl = object(b.client, ['scheme', 'port', 'msgVpns']);
        const sempScheme = canonScheme(string(semp.scheme), 'https');
        const clientScheme = canonScheme(string(cl.scheme), 'wss');
        const rec: ConnRec = {
            broker,
            hostname: string(b.hostname),
            semp: { ...(sempScheme ? { scheme: sempScheme } : {}), port: string(semp.port), username: string(semp.user), password: string(semp.pass) },
            client: {
                ...(clientScheme ? { scheme: clientScheme } : {}),
                port: string(cl.port),
                msgVpns: list(cl.msgVpns, x => {
                    const v = object(x, ['name', 'user', 'pass']);
                    return { name: string(v.name), username: string(v.user), password: string(v.pass) };
                }),
            },
        };
        const problem = connectionProblem(rec);
        if (problem) return invalid('connection', problem);
        const rev = bodyRev(b.rev);
        if (rev === null) return revRequired;
        const r = store.upsertConnection(rec, rev);
        if (r.ok) return ok({ rev: r.rev });
        return r.error === 'exists' ? exists : r.error === 'not_found' ? notFound : stale(store.connRev(broker)!);
    };

    const deleteConnection: Handler = (req, _s, _sid, [broker]) => {
        const rev = queryRev(req.query);
        if (rev === null) return revRequired;
        const r = store.deleteConnection(broker, rev);
        if (r === 'not_found') return notFound;
        return r === 'stale' ? stale(store.connRev(broker)!) : noContent;
    };

    const refusal = (r: Refusal): GatewayResponse => ({ status: r.status, json: refusalBody(r) });

    const getSettings: Handler = () => {
        const v = settings.view();
        return v.ok ? ok(v.view) : refusal(v);
    };

    const saveSettings: Handler = (req) => {
        const { patch, rev } = splitRev(parseBody(req.body));
        const r = settings.save(patch, rev);
        return r.ok ? ok({ rev: r.rev }) : refusal(r);
    };

    /** clientSeen: the demo has one browser, seen directly. */
    const clientSeen: Handler = () => {
        const body: ClientSeen = { address: client, peer: client, viaProxy: false };
        return ok(body);
    };

    /** `POST /managed/restart`: 202, with the restart already done in the fake (the page returns to the sign-in after a pause). */
    const restartGateway: Handler = () => {
        restart();
        return { status: 202, json: { restarting: true } };
    };

    /** The mux (managedHandler's routes); `{}` is one path segment, unescaped. */
    const ROUTES: [string, string, Handler][] = [
        ['GET', '/managed/me', me],
        ['POST', '/managed/logout', logout],
        ['POST', '/managed/dial', dial],
        ['GET', '/managed/users', adminOnly(listUsers)],
        ['PUT', '/managed/users/{}', adminOnly(saveUser)],
        ['DELETE', '/managed/users/{}', adminOnly(deleteUser)],
        ['DELETE', '/managed/users/{}/totp', adminOnly(resetTotp)],
        ['GET', '/managed/connections', adminOnly(listConnections)],
        ['PUT', '/managed/connections/{}', adminOnly(saveConnection)],
        ['DELETE', '/managed/connections/{}', adminOnly(deleteConnection)],
        ['GET', '/managed/settings', adminOnly(getSettings)],
        ['PUT', '/managed/settings', adminOnly(saveSettings)],
        ['GET', '/managed/client', adminOnly(clientSeen)],
        ['POST', '/managed/restart', adminOnly(restartGateway)],
        ...tlsRoutes.map(([m, p, fn]): [string, string, Handler] => [m, p, adminOnly(fn)]),
        ...backupRoutes.map(([m, p, fn]): [string, string, Handler] => [m, p, adminOnly(fn)]),
    ];

    function match(method: string, path: string): { fn: Handler; params: string[] } | null {
        const segs = path.split('/');
        for (const [m, pattern, fn] of ROUTES) {
            const want = pattern.split('/');
            if (m !== method || want.length !== segs.length) continue;
            const params: string[] = [];
            const fits = want.every((w, i) => {
                if (w !== '{}') return w === segs[i];
                if (segs[i] === '') return false;
                try {
                    params.push(decodeURIComponent(segs[i]));
                    return true;
                } catch {
                    return false;
                }
            });
            if (fits) return { fn, params };
        }
        return null;
    }

    /** One request through the gates. */
    async function handle(req: GatewayRequest): Promise<GatewayResponse> {
        const s = sessions.get(req.session);
        if (!s || !req.session) return error(401, 'unauthenticated');
        if (s.mustChange && req.path !== '/managed/logout') return error(403, 'password_change_required');
        if (req.path.startsWith(RELAY_PREFIX)) {
            return relay(req, broker => store.sempTarget(s.user, broker), faults().relayUnreachable, upstream);
        }
        const route = match(req.method.toUpperCase(), req.path);
        if (!route) return error(404, 'not_found');
        try {
            return await route.fn(req, s, req.session, route.params);
        } catch (e) {
            if (e instanceof BadRequest) return error(400, 'bad_request');
            throw e;
        }
    }

    return { handle };
}
