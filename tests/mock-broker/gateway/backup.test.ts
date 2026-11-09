import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createGateway } from '../../../src/mock-broker/gateway';
import {
    BackupProblem, diffByName, fromBase64, mergeByName, newBackupKey, nextRun, openBackup, scheduleProblem,
    sealBackup, sessionEnders, settingsChanges, toBase64, withHostPaths, type BackupDoc, type BackupSchedule,
} from '../../../src/mock-broker/gateway/backup';
import { settingsFromBackup } from '../../../src/mock-broker/gateway/settings';
import { CONTRACT_DIR, contractSeed } from './helpers';
import type { UserRec } from '../../../src/mock-broker/gateway/types';

/**
 * The fake gateway's Backup & Restore (src/mock-broker/gateway/backup.ts):
 * the file format against the shared vector the real gateway also opens
 * (go-web-proxy/backup_test.go TestBackup_SharedVector), every refusal, the
 * schedule arithmetic, and the routes. The answers both gateways must agree
 * on are in contract.test.ts.
 */
const PASS = 'a long passphrase';
const vector = JSON.parse(readFileSync(path.join(CONTRACT_DIR, 'backup.json'), 'utf-8'));
const NOW = new Date(Date.UTC(2026, 10, 9, 9, 0, 0)); // Monday 2026-11-09 09:00 UTC

afterEach(() => {
    vi.restoreAllMocks();
});

const enc = new TextEncoder();

/** A file sealed exactly as the gateway seals one, around any plaintext. */
async function sealRaw(plain: string, passphrase = PASS): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, base,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const head = new Uint8Array([0x53, 0x4d, 0x55, 0x53, 1, 4]);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: head }, key, enc.encode(plain)));
    const data = new Uint8Array([...head, ...nonce, ...sealed]);
    return JSON.stringify({ format: 'smu-backup', version: 1, kdf: { name: 'pbkdf2-sha256', iter: 1000, salt: toBase64(salt) }, data: toBase64(data) });
}

const settings = () => contractSeed().settings;
const user = (username: string, password: string, admin = false): UserRec =>
    ({ username, password, admin, mustChangePassword: false, operate: [], readOnly: [], modules: null });

function doc(over: Partial<BackupDoc> = {}): BackupDoc {
    return {
        created: '2026-11-09T02:00:00Z', gateway: 'demo',
        users: [{ ...user('admin', 'admin-password-1', true), mustChangePassword: true, modules: ['queue-browser'] }],
        connections: [{ broker: 'b1', hostname: 'host1', semp: { port: '1943', username: 'mon', password: 's' }, client: { port: '1443', msgVpns: [] } }],
        settings: settings(),
        ...over,
    };
}

async function problem(p: Promise<unknown>): Promise<[string, string]> {
    try {
        await p;
    } catch (e) {
        expect(e).toBeInstanceOf(BackupProblem);
        return [(e as BackupProblem).field, (e as BackupProblem).reason];
    }
    throw new Error('no refusal');
}

const NOT_BACKUP: [string, string] = ['file', 'This is not a Solace Message Utility backup file.'];
const DAMAGED: [string, string] = ['file', 'This backup file is damaged.'];
const WRONG: [string, string] = ['passphrase', 'The passphrase does not open this file, or the file is damaged.'];
const RULE: [string, string] = ['passphrase', 'The passphrase must be 12 to 128 characters.'];

describe('mock-broker/gateway/backup -- the file format', () => {
    it('opens the shared vector the real gateway opens', async () => {
        const d = await openBackup(vector.file, vector.passphrase);
        expect([d.created, d.gateway, d.users.map(u => u.username), d.connections.map(c => c.broker), d.settings.connModes])
            .toEqual([vector.expect.created, vector.expect.gateway, vector.expect.users, vector.expect.connections, vector.expect.connModes]);
        expect(d.settings.usersFile).toBe(''); // the file's own version key is not a setting
    });

    it('seals and opens a document, carrying every user and connection field', async () => {
        const original = doc();
        const file = await sealBackup(await newBackupKey(PASS, 1000), original);
        expect(file).not.toContain('admin-password-1');
        expect(JSON.parse(file).kdf).toEqual({ name: 'pbkdf2-sha256', iter: 1000, salt: expect.any(String) });
        expect(await openBackup(file, PASS)).toEqual(original);
    });

    it('refuses a new key for a passphrase outside the password length', async () => {
        expect(await problem(newBackupKey('short', 1000))).toEqual(RULE);
    });

    it('refuses what is not a backup, or not one it reads', async () => {
        const good = JSON.parse(await sealBackup(await newBackupKey(PASS, 1000), doc()));
        const edit = (f: (e: any) => void) => {
            const e = JSON.parse(JSON.stringify(good));
            f(e);
            return JSON.stringify(e);
        };
        const cases: [string, string, [string, string]][] = [
            ['not JSON', 'users: []', NOT_BACKUP],
            ['an unknown key', edit(e => { e.extra = 1; }), NOT_BACKUP],
            ['a mistyped key', edit(e => { e.version = '1'; }), NOT_BACKUP],
            ['another format', edit(e => { e.format = 'zip'; }), NOT_BACKUP],
            ['another kdf', edit(e => { e.kdf.name = 'scrypt'; }), DAMAGED],
            ['no iterations', edit(e => { e.kdf.iter = 0; }), DAMAGED],
            ['too many iterations', edit(e => { e.kdf.iter = 10_000_001; }), DAMAGED],
            ['a salt that is not base64', edit(e => { e.kdf.salt = '!'; }), DAMAGED],
            ['a short salt', edit(e => { e.kdf.salt = 'AAAA'; }), DAMAGED],
            ['data that is not base64', edit(e => { e.data = 'AAA'; }), DAMAGED],
            ['data shorter than the header', edit(e => { e.data = 'U01VUw=='; }), DAMAGED],
            ['a store file\'s header', edit(e => { e.data = toBase64(new Uint8Array([0x53, 0x4d, 0x55, 0x53, 1, 1, 0, 0])); }), DAMAGED],
            ['a passphrase outside the rule', JSON.stringify(good), RULE],
        ];
        for (const [name, file, want] of cases) {
            const pass = want === RULE ? 'short' : PASS;
            expect([name, ...(await problem(openBackup(file, pass)))]).toEqual([name, ...want]);
        }
        expect(await problem(openBackup(edit(e => { e.version = 2; }), PASS)))
            .toEqual(['file', 'This backup has format version 2, which this gateway does not read.']);
        expect(await problem(openBackup(JSON.stringify(good), 'not the passphrase'))).toEqual(WRONG);
    });

    it('refuses content the gateway would not have written, and reads ports written as numbers', async () => {
        for (const plain of ['{"version":2}', '{"version":1,"extra":true}', 'not JSON', '{"version":1,"settings":[]}']) {
            expect(await problem(openBackup(await sealRaw(plain), PASS))).toEqual(DAMAGED);
        }
        const d = await openBackup(await sealRaw(JSON.stringify({
            version: 1,
            'msg-utility-connections': [{ broker: 'b9', hostname: 'h', semp: { port: 1943 }, client: { port: '1443', msgVpns: [{ name: 'v' }] } }],
            'msg-utility-users': [{ username: 'u', password: 'p', 'read-only': [{ brokers: 'b', msgVpns: 'v', queues: 'q' }], modules: null }],
            settings: { version: 1, appDir: '/old', connModes: 'both' },
        })), PASS);
        expect(d.connections[0]).toEqual({ broker: 'b9', hostname: 'h', semp: { port: '1943', username: '', password: '' }, client: { port: '1443', msgVpns: [{ name: 'v', username: '', password: '' }] } });
        expect(d.users[0]).toEqual({ ...user('u', 'p'), readOnly: [{ brokers: 'b', msgVpns: 'v', queues: 'q' }] });
        expect([d.created, d.gateway, d.settings.connModes, d.settings.hosted]).toEqual(['', '', 'both', false]);
    });

    it('reads base64 as the gateway does: padded, nothing else', () => {
        expect(fromBase64('AAAA')).toEqual(new Uint8Array([0, 0, 0]));
        expect(fromBase64('AA==')).toEqual(new Uint8Array([0]));
        expect(fromBase64('AA')).toBeNull();
        expect(fromBase64('AA AA')).toBeNull();
        expect(toBase64(new Uint8Array(70_000)).length).toBe(93_336);
    });

    it('decodes settings onto a zero file: missing ones are zero, mistyped ones refused', () => {
        expect(settingsFromBackup(undefined).connModes).toBe('');
        expect(settingsFromBackup(null).session).toEqual({ idleMinutes: 0, absoluteMinutes: 0 });
        expect(() => settingsFromBackup({ hosted: 'yes' })).toThrow();
    });
});

describe('mock-broker/gateway/backup -- import planning', () => {
    const canon = (u: UserRec) => JSON.stringify(u);

    it('diffs, merges and lists the sessions an import ends', () => {
        const cur = [user('admin', 'a', true), user('ops', 'o'), user('gone', 'g')];
        const file = [user('admin', 'a', false), user('ops', 'o'), user('new', 'n')];
        expect(diffByName(cur, file, u => u.username, canon)).toEqual({ added: ['new'], changed: ['admin'], removed: ['gone'] });
        expect(mergeByName(cur, file, u => u.username).map(u => u.username)).toEqual(['admin', 'ops', 'gone', 'new']);
        expect(sessionEnders(cur, file)).toEqual(['admin', 'gone']);
        expect(sessionEnders(cur, [user('admin', 'a2', true), ...cur.slice(1)])).toEqual(['admin']);
    });

    it('names the settings an import changes, never a host path', () => {
        const cur = settings();
        const next = { ...cur, logLevel: 'info', usersFile: '/elsewhere', access: { allow: ['10.0.0.0/8'], trustedProxies: [] } };
        expect(settingsChanges(cur, next)).toEqual(['access.allow', 'logLevel']);
        expect(withHostPaths(next, cur).usersFile).toBe(cur.usersFile);
    });
});

describe('mock-broker/gateway/backup -- the schedule', () => {
    const s = (over: Partial<BackupSchedule>): BackupSchedule => ({ kind: 'daily', minute: 0, hour: 0, weekday: 0, day: 0, ...over });

    it("refuses what the gateway's schedule check refuses, with its reasons", () => {
        expect(scheduleProblem(s({ kind: 'yearly' }))).toBe('Choose hourly, daily, weekly or monthly.');
        expect(scheduleProblem(s({ minute: 60 }))).toBe('The minute must be 0 to 59.');
        expect(scheduleProblem(s({ minute: -1 }))).toBe('The minute must be 0 to 59.');
        expect(scheduleProblem(s({ hour: 24 }))).toContain('The hour must be 0 to 23');
        expect(scheduleProblem(s({ hour: -1 }))).toContain('The hour must be 0 to 23');
        expect(scheduleProblem(s({ kind: 'hourly', hour: 1 }))).toContain('an hourly schedule takes none');
        expect(scheduleProblem(s({ kind: 'weekly', weekday: 7 }))).toContain('The day of the week');
        expect(scheduleProblem(s({ weekday: -1 }))).toContain('The day of the week');
        expect(scheduleProblem(s({ weekday: 1 }))).toContain('only a weekly schedule takes one');
        expect(scheduleProblem(s({ kind: 'monthly' }))).toContain('The day of the month');
        expect(scheduleProblem(s({ kind: 'monthly', day: 32 }))).toContain('The day of the month');
        expect(scheduleProblem(s({ kind: 'monthly', day: -1 }))).toContain('The day of the month');
        expect(scheduleProblem(s({ day: 3 }))).toContain('only a monthly schedule takes one');
        expect(scheduleProblem(s({ kind: 'monthly', day: 31, hour: 23, minute: 59 }))).toBeNull();
    });

    it('finds the next run as the gateway does', () => {
        const at = (iso: string) => new Date(iso);
        const cases: [string, Partial<BackupSchedule>, string][] = [
            ['2026-11-09T09:10:00Z', { kind: 'hourly', minute: 30 }, '2026-11-09T09:30:00.000Z'],
            ['2026-11-09T09:30:00Z', { kind: 'hourly', minute: 30 }, '2026-11-09T10:30:00.000Z'],
            ['2026-11-09T01:00:00Z', { kind: 'daily', hour: 2 }, '2026-11-09T02:00:00.000Z'],
            ['2026-12-31T23:59:00Z', { kind: 'daily', minute: 30 }, '2027-01-01T00:30:00.000Z'],
            ['2026-11-09T09:00:00Z', { kind: 'weekly', weekday: 1, hour: 10 }, '2026-11-09T10:00:00.000Z'],
            ['2026-11-09T11:00:00Z', { kind: 'weekly', weekday: 1, hour: 10 }, '2026-11-16T10:00:00.000Z'],
            ['2026-11-09T11:00:00Z', { kind: 'weekly', weekday: 0, hour: 3 }, '2026-11-15T03:00:00.000Z'],
            ['2026-11-09T11:00:00Z', { kind: 'monthly', day: 15, hour: 2 }, '2026-11-15T02:00:00.000Z'],
            ['2026-12-20T00:00:00Z', { kind: 'monthly', day: 1 }, '2027-01-01T00:00:00.000Z'],
            ['2027-02-01T00:00:00Z', { kind: 'monthly', day: 31, hour: 2 }, '2027-02-28T02:00:00.000Z'],
            ['2028-02-01T00:00:00Z', { kind: 'monthly', day: 30 }, '2028-02-29T00:00:00.000Z'],
        ];
        for (const [now, over, want] of cases) expect([now, nextRun(at(now), s(over)).toISOString()]).toEqual([now, want]);
    });
});

describe('mock-broker/gateway/backup -- the routes', () => {
    let clock = NOW;
    const gateway = () => {
        clock = NOW;
        return createGateway({ seed: contractSeed(), backupIter: 1000, now: () => clock });
    };
    type Gw = ReturnType<typeof gateway>;
    const call = async (gw: Gw, method: string, p: string, body?: unknown, as = 'admin') => {
        const res = await gw.handle({ method, path: p, query: '', body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession(as, false) });
        return { status: res.status, json: res.json as any };
    };
    const daily = { kind: 'daily', minute: 0, hour: 2, weekday: 0, day: 0 };

    it('keeps a schedule, runs it, names each file by the clock and keeps the newest', async () => {
        const gw = gateway();
        expect((await call(gw, 'POST', '/managed/backup/run')).status).toBe(404);
        expect((await call(gw, 'DELETE', '/managed/backup/schedule')).status).toBe(404);
        expect((await call(gw, 'PUT', '/managed/backup/schedule', { ...daily, keep: 2, passphrase: PASS })).status).toBe(204);
        expect((await call(gw, 'GET', '/managed/backup')).json).toEqual({
            schedule: { ...daily, keep: 2 }, nextRun: '2026-11-10T02:00:00Z', lastRun: null, dirProblem: '', files: [],
        });
        for (const minute of [0, 1, 2]) {
            clock = new Date(Date.UTC(2026, 10, 9, 9, minute));
            expect((await call(gw, 'POST', '/managed/backup/run')).json).toEqual({ file: `smu-backup-20261109T09${String(minute).padStart(2, '0')}00Z.json` });
        }
        const st = (await call(gw, 'GET', '/managed/backup')).json;
        expect(st.files.map((f: any) => [f.name, f.created])).toEqual([
            ['smu-backup-20261109T090200Z.json', '2026-11-09T09:02:00Z'],
            ['smu-backup-20261109T090100Z.json', '2026-11-09T09:01:00Z'],
        ]);
        expect(st.files[0].size).toBeGreaterThan(100);
        expect(st.lastRun).toEqual({ at: '2026-11-09T09:02:00Z', file: 'smu-backup-20261109T090200Z.json', error: '' });

        // The same second again.
        const again = await call(gw, 'POST', '/managed/backup/run');
        expect(again).toEqual({ status: 409, json: { error: 'backup_unavailable', reason: '/backup/smu-backup-20261109T090200Z.json already exists; wait a second and run it again' } });
        expect((await call(gw, 'GET', '/managed/backup')).json.lastRun.error).toContain('already exists');

        // An edit keeps the key: the files it writes open with the first passphrase.
        expect((await call(gw, 'PUT', '/managed/backup/schedule', { ...daily, keep: 5, passphrase: '' })).status).toBe(204);
        clock = new Date(Date.UTC(2026, 10, 9, 10));
        await call(gw, 'POST', '/managed/backup/run');
        const preview = await call(gw, 'POST', '/managed/backup/preview', { backup: 'smu-backup-20261109T100000Z.json', passphrase: PASS });
        expect(preview.status).toBe(200);

        expect((await call(gw, 'DELETE', '/managed/backup/schedule')).status).toBe(204);
        expect((await call(gw, 'GET', '/managed/backup')).json.schedule).toBeNull();
    });

    it('refuses a schedule as the gateway does', async () => {
        const gw = gateway();
        const put = (body: unknown) => call(gw, 'PUT', '/managed/backup/schedule', body);
        expect((await put({ ...daily, kind: 'yearly', keep: 1, passphrase: PASS })).json.field).toBe('schedule');
        expect((await put({ ...daily, keep: 0, passphrase: PASS })).json.field).toBe('keep');
        expect((await put({ ...daily, keep: 366, passphrase: PASS })).json.field).toBe('keep');
        expect((await put({ ...daily, keep: 1 })).json).toEqual({ error: 'invalid', field: 'passphrase', reason: 'A new schedule needs a passphrase.' });
        expect((await put({ ...daily, keep: 1, passphrase: 'short' })).json.reason).toBe(RULE[1]);
        expect((await put({ ...daily, keep: 1, extra: 1 })).status).toBe(400);
    });

    it('lets a crypto failure through: it is no refusal of the request', async () => {
        const gw = gateway();
        vi.spyOn(crypto.subtle, 'deriveKey').mockRejectedValueOnce(new Error('no crypto'));
        await expect(call(gw, 'PUT', '/managed/backup/schedule', { ...daily, keep: 1, passphrase: PASS })).rejects.toThrow('no crypto');
    });

    it('exports a file the next import opens, and refuses a short passphrase', async () => {
        const gw = gateway();
        expect((await call(gw, 'POST', '/managed/backup/export', { passphrase: 'short' })).json.reason).toBe(RULE[1]);
        const ex = await call(gw, 'POST', '/managed/backup/export', { passphrase: PASS });
        expect(ex.json.filename).toBe('smu-backup-20261109T090000Z.json');
        const d = await openBackup(ex.json.content, PASS);
        expect([d.created, d.gateway, d.users.map(u => u.username), d.settings.usersFile, d.settings.tls.certFile])
            .toEqual(['2026-11-09T09:00:00Z', 'demo', ['admin', 'viewer', 'operator'], '', '']);
        expect(d.settings.logLevel).toBe('warn');
    });

    describe('import', () => {
        async function file(gw: Gw, edit: (d: BackupDoc) => void = () => {}): Promise<string> {
            const d = await openBackup((await call(gw, 'POST', '/managed/backup/export', { passphrase: PASS })).json.content, PASS);
            edit(d);
            return sealBackup(await newBackupKey(PASS, 1000), d);
        }
        const imp = (gw: Gw, f: string, users: string, connections: string, s: string) =>
            call(gw, 'POST', '/managed/backup/import', { file: f, passphrase: PASS, users, connections, settings: s });

        it('refuses a missing source, a missing saved backup and a file it cannot open', async () => {
            const gw = gateway();
            const f = await file(gw);
            expect((await imp(gw, '', 'merge', 'skip', 'skip')).json.field).toBe('file');
            expect((await call(gw, 'POST', '/managed/backup/import', { file: f, backup: 'x', passphrase: PASS, users: 'merge', connections: 'skip', settings: 'skip' })).json.field).toBe('file');
            expect((await call(gw, 'POST', '/managed/backup/preview', { backup: 'smu-backup-20261109T090000Z.json', passphrase: PASS })).json)
                .toEqual({ error: 'invalid', field: 'backup', reason: 'There is no backup named "smu-backup-20261109T090000Z.json".' });
            expect((await call(gw, 'POST', '/managed/backup/preview', { file: 'x', passphrase: PASS })).json.reason).toBe(NOT_BACKUP[1]);
        });

        it('refuses a result with no administrator, or users or connections the gateway would not keep', async () => {
            const gw = gateway();
            expect((await imp(gw, await file(gw, d => { d.users = d.users.filter(u => !u.admin); }), 'replace', 'skip', 'skip')).json).toEqual({ error: 'last_admin' });
            const usersWith = async (edit: (us: UserRec[]) => void) =>
                (await imp(gw, await file(gw, d => edit(d.users)), 'replace', 'skip', 'skip')).json;
            expect((await usersWith(us => { us[1].username = 'not valid!'; })).reason).toMatch(/^The backup's users cannot be imported: user 2: username/);
            expect((await usersWith(us => { us[1].username = 'admin'; })).reason).toContain('appears more than once');
            expect((await usersWith(us => { us[1].password = ''; })).reason).toContain('has no password');
            expect((await usersWith(us => { us[1].modules = ['nope']; })).reason).toContain('user "viewer"');
            const connsWith = async (edit: (d: BackupDoc) => void) => (await imp(gw, await file(gw, edit), 'skip', 'replace', 'skip')).json;
            expect((await connsWith(d => { d.connections[0].hostname = 'http://x'; })).reason).toMatch(/^The backup's connections cannot be imported: connection 1:/);
            expect((await connsWith(d => { d.connections[1].broker = 'b1'; })).reason).toContain('broker "b1" appears more than once');
            // Settings are refused as a save is, and nothing else is written.
            const lockOut = await imp(gw, await file(gw, d => { d.settings.access.allow = ['10.0.0.0/8']; d.users = d.users.slice(0, 1); }), 'replace', 'skip', 'replace');
            expect(lockOut.json.error).toBe('would_lock_out');
            expect(lockOut.json.field).toBe('access.allow');
            const direct = await imp(gw, await file(gw, d => { d.settings.connModes = 'direct'; }), 'skip', 'skip', 'replace');
            expect([direct.json.error, direct.json.field]).toEqual(['invalid', 'connModes']);
            gw.faults.changedOnDisk = true;
            expect((await imp(gw, await file(gw), 'skip', 'skip', 'replace')).json).toEqual({ error: 'config_changed_on_disk' });
            expect(gw.store.listUsers().map(u => u.username)).toEqual(['admin', 'viewer', 'operator']);
        });

        it('replaces and merges, ends the sessions of changed users, and applies the settings', async () => {
            const gw = gateway();
            const viewer = gw.openSession('viewer', false);
            const operator = gw.openSession('operator', false);
            const f = await file(gw, d => {
                d.users = d.users.filter(u => u.username !== 'operator');
                d.users[1].password = 'viewer password two';
                d.connections = d.connections.slice(0, 1);
                d.settings.logLevel = 'info';
            });
            expect((await imp(gw, f, 'merge', 'replace', 'replace')).json).toEqual({ restartRequired: [], signedOut: false });
            expect(gw.sessions.get(viewer)).toBeNull();
            expect(gw.sessions.get(operator)).not.toBeNull(); // merge keeps the operator
            expect(gw.store.listConnections().map(c => c.broker)).toEqual(['b1']);
            expect(gw.settings.current().logLevel).toBe('info');
            expect(gw.signIn('viewer', 'viewer password two').ok).toBe(true);

            expect((await imp(gw, f, 'replace', 'merge', 'skip')).json).toEqual({ restartRequired: [], signedOut: false });
            expect(gw.sessions.get(operator)).toBeNull();
            expect(gw.store.listUsers().map(u => u.username)).toEqual(['admin', 'viewer']);

            const own = await file(gw, d => { d.users[0].password = 'admin password two'; });
            expect((await imp(gw, own, 'merge', 'skip', 'skip')).json.signedOut).toBe(true);
        });

        it('reports a restart-only setting as pending', async () => {
            const gw = gateway();
            const f = await file(gw, d => { d.settings.tls.insecureSkipVerify = true; });
            expect((await imp(gw, f, 'skip', 'skip', 'replace')).json.restartRequired).toEqual(['tls.insecureSkipVerify']);
        });
    });

    it('carries the backup directory and the last run across a reload, but not the schedule', async () => {
        const gw = gateway();
        await call(gw, 'PUT', '/managed/backup/schedule', { ...daily, keep: 3, passphrase: PASS });
        await call(gw, 'POST', '/managed/backup/run');
        const snap = gw.snapshot();
        const next = gateway();
        next.restore(snap);
        const st = (await call(next, 'GET', '/managed/backup')).json;
        expect([st.files.length, st.lastRun.file, st.schedule]).toEqual([1, 'smu-backup-20261109T090000Z.json', null]);
        // A snapshot from a build before backups restores the rest.
        const old = { ...snap };
        delete old.backups;
        const third = gateway();
        third.restore(old);
        expect((await call(third, 'GET', '/managed/backup')).json.files).toEqual([]);
    });
});
