/**
 * The fake gateway's Backup & Restore (go-web-proxy/backup.go, backup_api.go):
 * the same routes, refusals and file format. A file is JSON:
 *
 *   {"format":"smu-backup","version":1,
 *    "kdf":{"name":"pbkdf2-sha256","iter":N,"salt":"<base64>"},
 *    "data":"<base64 of "SMUS" | 1 | role 4 | nonce | AES-256-GCM(JSON) | tag>"}
 *
 * sealed here with WebCrypto exactly as the gateway's `sealer` seals it, so
 * go-web-proxy/testdata/contract/backup.json opens in both. The fake keeps
 * passwords in plain text, so a demo backup carries them that way: it imports
 * into the demo, and a real gateway refuses its users.
 *
 * Not simulated: the backup directory is in memory, and the schedule runs
 * only through Back up now (the demo keeps no timer).
 *
 * Mock-only.
 */
import { BadRequest, boolean, integer, list, nullableList, object, parseBody, string } from './strict';
import { connectionProblem, moduleIdsProblem, passwordOk, PASSWORD_MAX, PASSWORD_MIN, quote, validUsername } from './validate';
import { settingsFromBackup } from './settings';
import type { GatewaySessions, Session } from './sessions';
import type { GatewaySettingsFile } from './settings';
import type { GatewayStore } from './store';
import type { ConnRec, GatewayRequest, GatewayResponse, GatewaySettings, UserRec } from './types';
import type { QGlob } from '../../core/types';

const FORMAT = 'smu-backup';
const KDF = 'pbkdf2-sha256';
const ROLE_BACKUP = 4;
const SALT_BYTES = 16;
const MAX_ITER = 10_000_000;
const KEEP_MAX = 365;
const DIR = '/backup';
/** passwordIter in password.go. */
export const BACKUP_ITER = 600_000;
const NAME = /^smu-backup-[0-9]{8}T[0-9]{6}Z\.json$/;
const HOST_KEYS = ['tls.certFile', 'tls.keyFile', 'tls.trustDir', 'usersFile', 'connectionsFile'];

// ----- refusals ----------------------------------------------------------------------

/** backupProblem: the request field it concerns and why. */
export class BackupProblem extends Error {
    constructor(readonly field: string, readonly reason: string) {
        super(`${field}: ${reason}`);
    }
}

const NOT_BACKUP = new BackupProblem('file', 'This is not a Solace Message Utility backup file.');
const DAMAGED = new BackupProblem('file', 'This backup file is damaged.');
const WRONG_PASS = new BackupProblem('passphrase', 'The passphrase does not open this file, or the file is damaged.');
const PASS_RULE = new BackupProblem('passphrase', `The passphrase must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`);

const ok = (json: unknown): GatewayResponse => ({ status: 200, json });
const noContent: GatewayResponse = { status: 204 };
const error = (status: number, code: string): GatewayResponse => ({ status, json: { error: code } });
const invalid = (field: string, reason: string): GatewayResponse => ({ status: 422, json: { error: 'invalid', field, reason } });

// ----- bytes ---------------------------------------------------------------------------

const enc = new TextEncoder();

/** The stores' header: "SMUS", format version 1, the role. */
const header = (role: number) => new Uint8Array([0x53, 0x4d, 0x55, 0x53, 1, role]);

export function toBase64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

/** base64.StdEncoding.DecodeString: padded, nothing else; null when it is not. */
export function fromBase64(s: string): Uint8Array<ArrayBuffer> | null {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) return null;
    return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
};

// ----- the format ------------------------------------------------------------------------

/** A passphrase-derived key and what derives it. */
export interface BackupKey { iter: number; salt: Uint8Array<ArrayBuffer>; key: CryptoKey }

async function deriveKey(passphrase: string, iter: number, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
}

export async function newBackupKey(passphrase: string, iter: number): Promise<BackupKey> {
    if (!passwordOk(passphrase)) throw PASS_RULE;
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    return { iter, salt, key: await deriveKey(passphrase, iter, salt) };
}

/** What a backup holds. */
export interface BackupDoc {
    created: string;
    gateway: string;
    users: UserRec[];
    connections: ConnRec[];
    settings: GatewaySettings;
}

const globRows = (rs: QGlob[]) => rs.map(r => ({ brokers: r.brokers, msgVpns: r.msgVpns, queues: r.queues }));

/** The sealed text: JSON under the store files' YAML names, as the gateway writes it. */
function plainOf(d: BackupDoc): string {
    return JSON.stringify({
        version: 1,
        created: d.created,
        gateway: d.gateway,
        'msg-utility-users': d.users.map(u => ({
            username: u.username,
            password: u.password,
            ...(u.mustChangePassword ? { mustChangePassword: true } : {}),
            admin: u.admin,
            operate: globRows(u.operate),
            'read-only': globRows(u.readOnly),
            ...(u.modules ? { modules: [...u.modules] } : {}),
        })),
        'msg-utility-connections': d.connections,
        settings: { version: 1, ...d.settings },
    });
}

export async function sealBackup(k: BackupKey, d: BackupDoc): Promise<string> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const head = header(ROLE_BACKUP);
    const sealed = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: head }, k.key, enc.encode(plainOf(d)),
    ));
    const env = { format: FORMAT, version: 1, kdf: { name: KDF, iter: k.iter, salt: toBase64(k.salt) }, data: toBase64(concat(head, nonce, sealed)) };
    return `${JSON.stringify(env, null, 2)}\n`;
}

const glob = (x: unknown): QGlob => {
    const o = object(x, ['brokers', 'msgVpns', 'queues']);
    return { brokers: string(o.brokers), msgVpns: string(o.msgVpns), queues: string(o.queues) };
};

/** flexStr: a port written as a number or a string. */
const port = (v: unknown): string => (typeof v === 'number' && Number.isInteger(v) ? String(v) : string(v));

/** The sealed text, read as strictly as the gateway reads it; throws BadRequest. */
function docOf(raw: unknown): BackupDoc {
    const o = object(raw, ['version', 'created', 'gateway', 'msg-utility-users', 'msg-utility-connections', 'settings']);
    if (integer(o.version, 0) !== 1) throw new BadRequest('version');
    return {
        created: string(o.created),
        gateway: string(o.gateway),
        users: list(o['msg-utility-users'], x => {
            const u = object(x, ['username', 'password', 'mustChangePassword', 'admin', 'operate', 'read-only', 'modules']);
            return {
                username: string(u.username), password: string(u.password), admin: boolean(u.admin),
                mustChangePassword: boolean(u.mustChangePassword),
                operate: list(u.operate, glob), readOnly: list(u['read-only'], glob), modules: nullableList(u.modules, string),
            };
        }),
        connections: list(o['msg-utility-connections'], x => {
            const c = object(x, ['broker', 'hostname', 'semp', 'client']);
            const semp = object(c.semp, ['port', 'username', 'password']);
            const client = object(c.client, ['port', 'msgVpns']);
            return {
                broker: string(c.broker), hostname: string(c.hostname),
                semp: { port: port(semp.port), username: string(semp.username), password: string(semp.password) },
                client: {
                    port: port(client.port),
                    msgVpns: list(client.msgVpns, v => {
                        const r = object(v, ['name', 'username', 'password']);
                        return { name: string(r.name), username: string(r.username), password: string(r.password) };
                    }),
                },
            };
        }),
        settings: settingsFromBackup(o.settings),
    };
}

/** openBackup: the envelope, the passphrase, then the content; throws BackupProblem. */
export async function openBackup(file: string, passphrase: string): Promise<BackupDoc> {
    let env: { format: string; version: number; kdf: { name: string; iter: number; salt: string }; data: string };
    try {
        const o = object(parseBody(file), ['format', 'version', 'kdf', 'data']);
        const kdf = object(o.kdf, ['name', 'iter', 'salt']);
        env = { format: string(o.format), version: integer(o.version, 0), kdf: { name: string(kdf.name), iter: integer(kdf.iter, 0), salt: string(kdf.salt) }, data: string(o.data) };
    } catch {
        throw NOT_BACKUP;
    }
    if (env.format !== FORMAT) throw NOT_BACKUP;
    if (env.version !== 1) throw new BackupProblem('file', `This backup has format version ${env.version}, which this gateway does not read.`);
    if (env.kdf.name !== KDF || env.kdf.iter < 1 || env.kdf.iter > MAX_ITER) throw DAMAGED;
    const salt = fromBase64(env.kdf.salt);
    const blob = fromBase64(env.data);
    const head = header(ROLE_BACKUP);
    if (!salt || salt.length < SALT_BYTES || !blob || blob.length < head.length || !head.every((b, i) => blob[i] === b)) throw DAMAGED;
    if (!passwordOk(passphrase)) throw PASS_RULE;
    const key = await deriveKey(passphrase, env.kdf.iter, salt);
    let plain: string;
    try {
        plain = new TextDecoder().decode(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: blob.subarray(head.length, head.length + 12), additionalData: head }, key, blob.subarray(head.length + 12),
        ));
    } catch {
        throw WRONG_PASS;
    }
    try {
        return docOf(JSON.parse(plain));
    } catch {
        throw DAMAGED;
    }
}

/** withHostPaths: the host-only path keys from `host`. */
export function withHostPaths(s: GatewaySettings, host: Pick<GatewaySettings, 'tls' | 'usersFile' | 'connectionsFile'>): GatewaySettings {
    return {
        ...s,
        tls: { ...s.tls, certFile: host.tls.certFile, keyFile: host.tls.keyFile, trustDir: host.tls.trustDir },
        usersFile: host.usersFile,
        connectionsFile: host.connectionsFile,
    };
}

const NO_PATHS = { tls: { certFile: '', keyFile: '', trustDir: '', insecureSkipVerify: false }, usersFile: '', connectionsFile: '' };

// ----- import planning --------------------------------------------------------------------

export interface NameDiff { added: string[]; changed: string[]; removed: string[] }

const canonRows = (rs: QGlob[]) => rs.map(r => [r.brokers, r.msgVpns, r.queues]);
const canonUser = (u: UserRec) => JSON.stringify([u.username, u.password, u.mustChangePassword, u.admin, canonRows(u.operate), canonRows(u.readOnly), u.modules]);
const canonConn = (c: ConnRec) => JSON.stringify([c.broker, c.hostname, c.semp.port, c.semp.username, c.semp.password, c.client.port,
    c.client.msgVpns.map(v => [v.name, v.username, v.password])]);

/** diffByName with sameRecord: the records as the store file holds them. */
export function diffByName<T>(cur: T[], next: T[], name: (x: T) => string, canon: (x: T) => string): NameDiff {
    const d: NameDiff = { added: [], changed: [], removed: [] };
    for (const n of next) {
        const c = cur.find(x => name(x) === name(n));
        if (!c) d.added.push(name(n));
        else if (canon(c) !== canon(n)) d.changed.push(name(n));
    }
    for (const c of cur) if (!next.some(n => name(n) === name(c))) d.removed.push(name(c));
    return d;
}

export function mergeByName<T>(cur: T[], file: T[], name: (x: T) => string): T[] {
    const out = [...cur];
    for (const f of file) {
        const i = out.findIndex(x => name(x) === name(f));
        if (i >= 0) out[i] = f;
        else out.push(f);
    }
    return out;
}

const userName = (u: UserRec) => u.username;
const connName = (c: ConnRec) => c.broker;

/** sessionEnders: removed, or a new password or admin flag. */
export function sessionEnders(cur: UserRec[], next: UserRec[]): string[] {
    return cur.filter(c => {
        const n = next.find(x => x.username === c.username);
        return !n || n.password !== c.password || n.admin !== c.admin;
    }).map(c => c.username);
}

function flatten(v: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (x && typeof x === 'object' && !Array.isArray(x)) flatten(x, `${prefix}${k}.`, out);
        else out[prefix + k] = JSON.stringify(x);
    }
    return out;
}

/** settingsChanges: dotted keys, sorted, never a host path. */
export function settingsChanges(cur: GatewaySettings, next: GatewaySettings): string[] {
    const a = flatten(cur);
    const b = flatten(next);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
        .filter(k => !HOST_KEYS.includes(k) && a[k] !== b[k]);
}

/** validateUsers, as far as the fake keeps users: names, duplicates, a password, modules. */
function usersProblem(users: UserRec[]): string | null {
    const seen = new Set<string>();
    for (const [i, u] of users.entries()) {
        if (!validUsername(u.username)) return `user ${i + 1}: username ${quote(u.username)} is not valid`;
        if (seen.has(u.username)) return `user ${quote(u.username)} appears more than once`;
        seen.add(u.username);
        if (u.password === '') return `user ${quote(u.username)} has no password`;
        const m = u.modules && moduleIdsProblem('modules', u.modules);
        if (m) return `user ${quote(u.username)}: ${m}`;
    }
    return null;
}

/** validateConns. */
function connsProblem(conns: ConnRec[]): string | null {
    const seen = new Set<string>();
    for (const [i, c] of conns.entries()) {
        const p = connectionProblem(c);
        if (p) return `connection ${i + 1}: ${p}`;
        if (seen.has(c.broker)) return `broker ${quote(c.broker)} appears more than once`;
        seen.add(c.broker);
    }
    return null;
}

// ----- the schedule ------------------------------------------------------------------------

export interface BackupSchedule { kind: string; minute: number; hour: number; weekday: number; day: number }

/** backupSchedule.problem, with its reasons. */
export function scheduleProblem(s: BackupSchedule): string | null {
    const kinds = ['hourly', 'daily', 'weekly', 'monthly'];
    if (!kinds.includes(s.kind)) return 'Choose hourly, daily, weekly or monthly.';
    if (s.minute < 0 || s.minute > 59) return 'The minute must be 0 to 59.';
    if (s.hour < 0 || s.hour > 23 || (s.kind === 'hourly' && s.hour !== 0)) return 'The hour must be 0 to 23, and an hourly schedule takes none.';
    if (s.weekday < 0 || s.weekday > 6 || (s.kind !== 'weekly' && s.weekday !== 0)) {
        return 'The day of the week must be 0 (Sunday) to 6, and only a weekly schedule takes one.';
    }
    if ((s.kind === 'monthly') !== (s.day !== 0) || s.day < 0 || s.day > 31) {
        return 'The day of the month must be 1 to 31, and only a monthly schedule takes one.';
    }
    return null;
}

/** nextRun: the first time strictly after now that s names, UTC. */
export function nextRun(now: Date, s: BackupSchedule): Date {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const at = (day: number) => new Date(Date.UTC(y, m, day, s.hour, s.minute));
    const monthSlot = (month: number) => {
        const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
        return new Date(Date.UTC(y, month, Math.min(s.day, last), s.hour, s.minute));
    };
    let t: Date;
    switch (s.kind) {
        case 'hourly':
            t = new Date(Date.UTC(y, m, d, now.getUTCHours(), s.minute));
            if (t <= now) t = new Date(t.getTime() + 3_600_000);
            return t;
        case 'daily':
            t = at(d);
            return t <= now ? at(d + 1) : t;
        case 'weekly':
            t = at(d + ((s.weekday - now.getUTCDay() + 7) % 7));
            return t <= now ? new Date(t.getTime() + 7 * 86_400_000) : t;
        default:
            t = monthSlot(m);
            return t <= now ? monthSlot(m + 1) : t;
    }
}

const rfc3339 = (t: Date) => t.toISOString().replace(/\.\d{3}Z$/, 'Z');
const nameAt = (t: Date) => `smu-backup-${rfc3339(t).replace(/[-:]/g, '')}.json`;
const createdOf = (name: string) => {
    const s = name.slice('smu-backup-'.length, -'.json'.length);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
};

interface ScheduleState { schedule: BackupSchedule; keep: number; key: BackupKey }

/** What a reload carries: the directory and the outcome of the last run (the key cannot be exported). */
export interface BackupsState {
    files: [string, string][];
    lastRun: { at: string; file: string; error: string } | null;
}

// ----- the service and its routes ----------------------------------------------------------

export interface BackupDeps {
    store: GatewayStore;
    settings: GatewaySettingsFile;
    sessions: GatewaySessions;
    /** PBKDF2 iterations for new keys (BACKUP_ITER; tests pass fewer). */
    iter: number;
    now: () => Date;
}

type Route = [string, string, (req: GatewayRequest, s: Session) => GatewayResponse | Promise<GatewayResponse>];

export function createBackups({ store, settings, sessions, iter, now }: BackupDeps) {
    const files = new Map<string, string>();
    let sched: ScheduleState | null = null;
    let lastRun: BackupsState['lastRun'] = null;

    const snapshot = (): BackupDoc => {
        const d = store.dump();
        return { created: rfc3339(now()), gateway: 'demo', users: d.users, connections: d.conns, settings: withHostPaths(settings.current(), NO_PATHS) };
    };

    const list = () => [...files.entries()]
        .map(([name, content]) => ({ name, size: enc.encode(content).length, created: createdOf(name) }))
        .sort((a, b) => (a.name < b.name ? 1 : -1));

    async function run(): Promise<{ ok: true; file: string } | { ok: false; reason: string }> {
        const s = sched!;
        const name = nameAt(now());
        if (files.has(name)) {
            const reason = `${DIR}/${name} already exists; wait a second and run it again`;
            lastRun = { at: rfc3339(now()), file: '', error: reason };
            return { ok: false, reason };
        }
        files.set(name, await sealBackup(s.key, snapshot()));
        lastRun = { at: rfc3339(now()), file: name, error: '' };
        for (const old of list().slice(s.keep)) files.delete(old.name);
        return { ok: true, file: name };
    }

    const respond = (e: unknown): GatewayResponse => {
        if (e instanceof BackupProblem) return invalid(e.field, e.reason);
        throw e;
    };

    const status: Route[2] = () => ok({
        schedule: sched ? { ...sched.schedule, keep: sched.keep } : null,
        nextRun: sched ? rfc3339(nextRun(now(), sched.schedule)) : null,
        lastRun,
        dirProblem: '',
        files: list(),
    });

    const saveSchedule: Route[2] = async req => {
        const b = object(parseBody(req.body), ['kind', 'minute', 'hour', 'weekday', 'day', 'keep', 'passphrase']);
        const schedule: BackupSchedule = {
            kind: string(b.kind), minute: integer(b.minute, 0), hour: integer(b.hour, 0), weekday: integer(b.weekday, 0), day: integer(b.day, 0),
        };
        const keep = integer(b.keep, 0);
        const passphrase = string(b.passphrase);
        const problem = scheduleProblem(schedule);
        if (problem) return invalid('schedule', problem);
        if (keep < 1 || keep > KEEP_MAX) return invalid('keep', `Keep 1 to ${KEEP_MAX} backups.`);
        if (passphrase === '' && !sched) return invalid('passphrase', 'A new schedule needs a passphrase.');
        try {
            const key = passphrase !== '' ? await newBackupKey(passphrase, iter) : sched!.key;
            sched = { schedule, keep, key };
        } catch (e) {
            return respond(e);
        }
        return noContent;
    };

    const deleteSchedule: Route[2] = () => {
        if (!sched) return error(404, 'not_found');
        sched = null;
        return noContent;
    };

    const runNow: Route[2] = async () => {
        if (!sched) return error(404, 'not_found');
        const r = await run();
        return r.ok ? ok({ file: r.file }) : { status: 409, json: { error: 'backup_unavailable', reason: r.reason } };
    };

    const exportFile: Route[2] = async req => {
        const passphrase = string(object(parseBody(req.body), ['passphrase']).passphrase);
        try {
            const content = await sealBackup(await newBackupKey(passphrase, iter), snapshot());
            return ok({ filename: nameAt(now()), content });
        } catch (e) {
            return respond(e);
        }
    };

    /** openSource: the upload or a file in the directory, opened. */
    async function openSource(file: string, backup: string, passphrase: string): Promise<BackupDoc> {
        if ((file === '') === (backup === '')) throw new BackupProblem('file', 'Choose one file to import: an upload or a saved backup.');
        let data = file;
        if (backup !== '') {
            const found = NAME.test(backup) ? files.get(backup) : undefined;
            if (found === undefined) throw new BackupProblem('backup', `There is no backup named ${quote(backup)}.`);
            data = found;
        }
        return openBackup(data, passphrase);
    }

    const preview: Route[2] = async (req, s) => {
        const b = object(parseBody(req.body), ['file', 'backup', 'passphrase']);
        let doc: BackupDoc;
        try {
            doc = await openSource(string(b.file), string(b.backup), string(b.passphrase));
        } catch (e) {
            return respond(e);
        }
        const { users, conns } = store.dump();
        return ok({
            created: doc.created,
            gateway: doc.gateway,
            users: diffByName(users, doc.users, userName, canonUser),
            connections: diffByName(conns, doc.connections, connName, canonConn),
            settings: settingsChanges(settings.current(), doc.settings),
            signsOutCaller: {
                replace: sessionEnders(users, doc.users).includes(s.user),
                merge: sessionEnders(users, mergeByName(users, doc.users, userName)).includes(s.user),
            },
        });
    };

    const importFile: Route[2] = async (req, s) => {
        const b = object(parseBody(req.body), ['file', 'backup', 'passphrase', 'users', 'connections', 'settings']);
        const choice = { users: string(b.users), connections: string(b.connections), settings: string(b.settings) };
        for (const f of ['users', 'connections'] as const) {
            if (!['replace', 'merge', 'skip'].includes(choice[f])) return invalid(f, 'Choose replace, merge or skip.');
        }
        if (!['replace', 'skip'].includes(choice.settings)) return invalid('settings', 'Choose replace or skip.');
        if (choice.users === 'skip' && choice.connections === 'skip' && choice.settings === 'skip') {
            return invalid('sections', 'Choose at least one section to import.');
        }
        let doc: BackupDoc;
        try {
            doc = await openSource(string(b.file), string(b.backup), string(b.passphrase));
        } catch (e) {
            return respond(e);
        }
        const cur = store.dump();
        const users = choice.users === 'replace' ? doc.users : choice.users === 'merge' ? mergeByName(cur.users, doc.users, userName) : null;
        if (users) {
            if (!users.some(u => u.admin)) return error(409, 'last_admin');
            const p = usersProblem(users);
            if (p) return invalid('file', `The backup's users cannot be imported: ${p}`);
        }
        const conns = choice.connections === 'replace' ? doc.connections
            : choice.connections === 'merge' ? mergeByName(cur.conns, doc.connections, connName) : null;
        if (conns) {
            const p = connsProblem(conns);
            if (p) return invalid('file', `The backup's connections cannot be imported: ${p}`);
        }
        // The fake's settings save checks and commits in one step, so it goes
        // first: its refusals then leave everything as it was, as the gateway's do.
        let restartRequired: string[] = [];
        if (choice.settings === 'replace') {
            const r = settings.save(withHostPaths(doc.settings, settings.current()));
            if (!r.ok) {
                return { status: r.status, json: { error: r.error, ...(r.field ? { field: r.field } : {}), ...(r.reason ? { reason: r.reason } : {}) } };
            }
            restartRequired = r.restartRequired;
        }
        let signedOut = false;
        if (users) {
            const drop = sessionEnders(cur.users, users);
            store.replaceUsers(users);
            for (const name of drop) sessions.dropUser(name);
            signedOut = drop.includes(s.user);
        }
        if (conns) store.replaceConnections(conns);
        return ok({ restartRequired, signedOut });
    };

    const routes: Route[] = [
        ['GET', '/managed/backup', status],
        ['PUT', '/managed/backup/schedule', saveSchedule],
        ['DELETE', '/managed/backup/schedule', deleteSchedule],
        ['POST', '/managed/backup/run', runNow],
        ['POST', '/managed/backup/export', exportFile],
        ['POST', '/managed/backup/preview', preview],
        ['POST', '/managed/backup/import', importFile],
    ];

    return {
        routes,
        dump(): BackupsState {
            return { files: [...files.entries()], lastRun };
        },
        load(st: BackupsState): void {
            files.clear();
            for (const [k, v] of st.files) files.set(k, v);
            lastRun = st.lastRun;
        },
    };
}

export type GatewayBackups = ReturnType<typeof createBackups>;
