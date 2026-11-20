// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createGateway } from '../../../src/mock-broker/gateway';
import { demoSeed } from '../../../src/mock-broker/gateway/seed';
import { openBackup, sealBackup, newBackupKey, type BackupDoc } from '../../../src/mock-broker/gateway/backup';
import { bodyRev, queryRev } from '../../../src/mock-broker/gateway/versions';
import { contractSeed } from './helpers';

/**
 * The fake gateway's versions (src/mock-broker/gateway/versions.ts and the
 * rules in store.ts, settings.ts, backup.ts): one seq per list and one rev
 * per record, a rev per settings file and per schedule, the refusals a wrong
 * one earns and the order they come in, and the basis an import carries.
 * What the real gateway answers for the same saves is pinned by
 * go-web-proxy/testdata/contract/cases.json (contract.test.ts).
 */
const gateway = (seed = contractSeed()) => createGateway({ seed, backupIter: 1000 });
type Gw = ReturnType<typeof gateway>;

/** `p` may end in `?query`, as a delete's `?rev=N` does. */
const call = async (gw: Gw, method: string, p: string, body?: unknown) => {
    const [path, query = ''] = p.split('?');
    const res = await gw.handle({ method, path, query, body: body === undefined ? '' : JSON.stringify(body), session: gw.openSession('admin', false) });
    return { status: res.status, json: res.json as any };
};

const PASS = 'a long passphrase';
const REFUSED = (error: string, status: number, extra: object = {}) => ({ status, json: { error, ...extra } });

describe('mock-broker/gateway/versions -- the rev a save carries', () => {
    it('reads a body rev as a whole number from 0 up, and nothing else', () => {
        expect([0, 1, 41].map(bodyRev)).toEqual([0, 1, 41]);
        for (const v of [undefined, null, -1, 1.5, '1', true, [1], {}, Infinity]) expect({ v, rev: bodyRev(v) }).toEqual({ v, rev: null });
    });

    it('reads a delete rev from the query as a whole number from 1 up, the first one given', () => {
        expect(queryRev('rev=3')).toBe(3);
        expect(queryRev('x=1&rev=2&rev=7')).toBe(2);
        for (const q of ['', 'x=1', 'rev=', 'rev=0', 'rev=-1', 'rev=1.5', 'rev=abc', 'rev=%2B1', 'rev=99999999999999999999']) {
            expect({ q, rev: queryRev(q) }).toEqual({ q, rev: null });
        }
    });
});

describe('mock-broker/gateway/versions -- users', () => {
    const body = { password: '', admin: false, operate: [], readOnly: [{ brokers: 'b1', msgVpns: 'v1', queues: '*' }], modules: ['queue-browser'] };
    const put = (gw: Gw, name: string, over: object) => call(gw, 'PUT', `/managed/users/${name}`, { ...body, ...over });
    const revs = async (gw: Gw) => Object.fromEntries((await call(gw, 'GET', '/managed/users')).json.users.map((u: any) => [u.username, u.rev]));

    it('starts every seeded user at a valid rev', async () => {
        const gw = gateway();
        const seq = gw.store.seqs().users;
        const list = Object.values(await revs(gw)) as number[];
        expect(list).toHaveLength(3);
        for (const rev of list) expect({ rev, ok: Number.isInteger(rev) && rev >= 1 && rev <= seq }).toEqual({ rev, ok: true });
    });

    it('creates with rev 0 at the new seq, and a taken name is exists even without a password', async () => {
        const gw = gateway();
        expect(await put(gw, 'newbie', { password: 'newbie-password-1', rev: 0 })).toEqual({ status: 200, json: { rev: 2 } });
        expect(await revs(gw)).toEqual({ admin: 1, viewer: 1, operator: 1, newbie: 2 });
        expect(await put(gw, 'newbie', { rev: 0 })).toEqual(REFUSED('exists', 409));
        expect(gw.store.seqs().users).toBe(2);
        expect(gw.signIn('newbie', 'newbie-password-1').ok).toBe(true);
    });

    it('refuses a new user with no password, and leaves seq alone', async () => {
        const gw = gateway();
        const res = await put(gw, 'newbie', { rev: 0 });
        expect([res.status, res.json.error, res.json.field]).toEqual([422, 'invalid', 'password']);
        expect(gw.store.seqs().users).toBe(1);
    });

    it('answers 404 for a rev above 0 on a missing user, and stale with the current rev for a wrong one', async () => {
        const gw = gateway();
        expect(await put(gw, 'ghost', { rev: 1 })).toEqual(REFUSED('not_found', 404));
        await put(gw, 'viewer', { readOnly: [], rev: 1 });   // viewer is now at rev 2
        expect(await put(gw, 'viewer', { rev: 1 })).toEqual(REFUSED('stale', 409, { rev: 2 }));
        expect(await put(gw, 'viewer', { rev: 3 })).toEqual(REFUSED('stale', 409, { rev: 2 }));
        expect(gw.store.seqs().users).toBe(2);
    });

    it('asks for a rev: a missing, negative, fractional or non-numeric one is rev_required, after the checks on the body alone', async () => {
        const gw = gateway();
        for (const rev of [undefined, null, -1, 1.5, '1']) {
            expect(await put(gw, 'viewer', { rev })).toEqual(REFUSED('rev_required', 400));
        }
        expect((await put(gw, 'bad%20name', { rev: 0 })).status).toBe(422);
        expect((await put(gw, 'bad%20name', {})).status).toBe(422);
        expect((await put(gw, 'viewer', { password: 'short' })).status).toBe(422);
        expect(gw.store.seqs().users).toBe(1);
    });

    it('moves the rev only when the record changed as the console sees it: a password alone keeps it, seq still moves', async () => {
        const gw = gateway();
        expect(await put(gw, 'viewer', { password: 'a new viewer password', rev: 1 })).toEqual({ status: 200, json: { rev: 1 } });
        expect(gw.store.seqs().users).toBe(2);
        expect(await put(gw, 'viewer', { rev: 1 })).toEqual({ status: 200, json: { rev: 1 } });   // nothing changed at all
        expect(gw.store.seqs().users).toBe(3);
        expect(await put(gw, 'viewer', { modules: null, rev: 1 })).toEqual({ status: 200, json: { rev: 4 } });
        expect(await revs(gw)).toEqual({ admin: 1, viewer: 4, operator: 1 });
    });

    it('keeps a password the user set meanwhile when an admin saves with a blank one', async () => {
        const gw = gateway();
        gw.setCookie(gw.openSession('viewer', false));
        expect(gw.changePassword('viewer-password-1', 'viewer-password-2', 'viewer-password-2')).toEqual({ ok: true, mustChange: false });
        expect(await revs(gw)).toEqual({ admin: 1, viewer: 1, operator: 1 });   // an own password keeps the rev
        expect(gw.store.seqs().users).toBe(2);
        expect(await put(gw, 'viewer', { rev: 1 })).toEqual({ status: 200, json: { rev: 1 } });
        expect(gw.signIn('viewer', 'viewer-password-2').ok).toBe(true);
    });

    it('moves the rev when the forced password change is cleared, by the user or by an admin reset', async () => {
        const gw = gateway(demoSeed());
        const before = await revs(gw);
        gw.setCookie(gw.openSession('newadmin', true));
        expect(gw.changePassword('demo-change-me-01', 'a new long password', 'a new long password').ok).toBe(true);
        const after = await revs(gw);
        expect([after.newadmin, after.admin]).toEqual([gw.store.seqs().users, before.admin]);
        expect(after.newadmin).toBeGreaterThan(before.newadmin);

        const reset = gateway(demoSeed());
        const reset0 = await revs(reset);
        const res = await call(reset, 'PUT', '/managed/users/newadmin', {
            password: 'an admin set password', admin: true, operate: [{ brokers: '*', msgVpns: '*', queues: '*' }], readOnly: [], modules: null, rev: reset0.newadmin,
        });
        expect(res.json.rev).toBeGreaterThan(reset0.newadmin);
        expect(res.json.rev).toBe(reset.store.seqs().users);
    });

    it('deletes with ?rev=N, and asks for it: missing, 0 and junk are rev_required, a wrong one stale, a gone one 404', async () => {
        const gw = gateway();
        for (const q of ['', '?rev=0', '?rev=x']) expect(await call(gw, 'DELETE', `/managed/users/viewer${q}`)).toEqual(REFUSED('rev_required', 400));
        expect(await call(gw, 'DELETE', '/managed/users/viewer?rev=7')).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect(await call(gw, 'DELETE', '/managed/users/ghost?rev=1')).toEqual(REFUSED('not_found', 404));
        expect(gw.store.seqs().users).toBe(1);
        expect(await call(gw, 'DELETE', '/managed/users/viewer?rev=1')).toEqual({ status: 204, json: undefined });
        expect(gw.store.seqs().users).toBe(2);
    });

    it('never reuses a rev: a deleted and re-created user gets a new one, and no record holds the deleted one', async () => {
        const gw = gateway();
        await put(gw, 'newbie', { password: 'newbie-password-1', rev: 0 });             // rev 2
        await call(gw, 'DELETE', '/managed/users/newbie?rev=2');                        // seq 3, no record at 3
        expect(Object.values(await revs(gw))).toEqual([1, 1, 1]);
        expect(await put(gw, 'newbie', { password: 'newbie-password-1', rev: 0 })).toEqual({ status: 200, json: { rev: 4 } });
    });

    it('checks the rev before the last-administrator rule', async () => {
        const gw = gateway();
        expect(await call(gw, 'DELETE', '/managed/users/admin?rev=5')).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect(await call(gw, 'DELETE', '/managed/users/admin?rev=1')).toEqual(REFUSED('last_admin', 409));
        expect(await put(gw, 'admin', { admin: false, rev: 5 })).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect(await put(gw, 'admin', { admin: false, rev: 1 })).toEqual(REFUSED('last_admin', 409));
        expect(gw.store.seqs().users).toBe(1);
    });

    it('lets the control panel edit without a rev, and moves the versions as any save does', async () => {
        const gw = gateway();
        expect(gw.store.upsertUser({ username: 'viewer', admin: false, operate: [], readOnly: [], modules: null }, '')).toMatchObject({ ok: true, rev: 2 });
        expect(gw.store.deleteUser('operator')).toBe('deleted');
        expect(gw.store.seqs().users).toBe(3);
        expect(gw.store.userRev('viewer')).toBe(2);
        expect(gw.store.userRev('operator')).toBeUndefined();
    });
});

describe('mock-broker/gateway/versions -- connections', () => {
    const listed = async (gw: Gw, broker: string) =>
        (await call(gw, 'GET', '/managed/connections')).json.connections.find((c: any) => c.broker === broker);
    const putConn = async (gw: Gw, broker: string, over: object, edit: (c: any) => void = () => {}) => {
        const c = await listed(gw, broker);
        edit(c);
        return call(gw, 'PUT', `/managed/connections/${broker}`, { hostname: c.hostname, semp: c.semp, client: c.client, ...over });
    };
    const revs = async (gw: Gw) => Object.fromEntries((await call(gw, 'GET', '/managed/connections')).json.connections.map((c: any) => [c.broker, c.rev]));

    it('starts every seeded connection at a valid rev', async () => {
        const gw = gateway();
        expect(await revs(gw)).toEqual({ b1: 1, b2: 1, b3: 1 });
        expect(gw.store.seqs().connections).toBe(1);
    });

    it('creates with rev 0, refuses a taken name as exists, and a rev above 0 on a missing one as 404', async () => {
        const gw = gateway();
        const fresh = { hostname: 'host9', semp: { port: '1943', user: 'mon', pass: 'p' }, client: { port: '1443', msgVpns: [] } };
        expect(await call(gw, 'PUT', '/managed/connections/b9', { ...fresh, rev: 0 })).toEqual({ status: 200, json: { rev: 2 } });
        expect(await call(gw, 'PUT', '/managed/connections/b9', { ...fresh, rev: 0 })).toEqual(REFUSED('exists', 409));
        expect(await call(gw, 'PUT', '/managed/connections/b8', { ...fresh, rev: 1 })).toEqual(REFUSED('not_found', 404));
        expect(gw.store.seqs().connections).toBe(2);
    });

    it('answers stale with the current rev, and rev_required for a body without one, after the checks on the body alone', async () => {
        const gw = gateway();
        expect(await putConn(gw, 'b1', { rev: 4 })).toEqual(REFUSED('stale', 409, { rev: 1 }));
        for (const rev of [undefined, null, -1, '1']) expect(await putConn(gw, 'b1', { rev })).toEqual(REFUSED('rev_required', 400));
        expect((await putConn(gw, 'b1', { hostname: 'http://x', rev: undefined })).status).toBe(422);
        expect(gw.store.seqs().connections).toBe(1);
    });

    it('moves the rev only when the console would see a change: a password alone keeps it, seq still moves', async () => {
        const gw = gateway();
        expect(await putConn(gw, 'b1', { rev: 1 }, c => { c.semp.pass = 'a new semp password'; c.client.msgVpns[0].pass = 'a new vpn password'; }))
            .toEqual({ status: 200, json: { rev: 1 } });
        expect(gw.store.seqs().connections).toBe(2);
        expect(await putConn(gw, 'b1', { rev: 1 }, c => { c.hostname = 'host1b'; })).toEqual({ status: 200, json: { rev: 3 } });
        expect(await revs(gw)).toEqual({ b1: 3, b2: 1, b3: 1 });
    });

    it('deletes with ?rev=N as a user is deleted', async () => {
        const gw = gateway();
        for (const q of ['', '?rev=0', '?rev=x']) expect(await call(gw, 'DELETE', `/managed/connections/b3${q}`)).toEqual(REFUSED('rev_required', 400));
        expect(await call(gw, 'DELETE', '/managed/connections/b3?rev=9')).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect(await call(gw, 'DELETE', '/managed/connections/b9?rev=1')).toEqual(REFUSED('not_found', 404));
        expect(gw.store.seqs().connections).toBe(1);
        expect((await call(gw, 'DELETE', '/managed/connections/b3?rev=1')).status).toBe(204);
        expect(gw.store.seqs().connections).toBe(2);
        expect(await revs(gw)).toEqual({ b1: 1, b2: 1 });
        expect(gw.store.connRev('b3')).toBeUndefined();
    });

    it('lets the control panel edit without a rev', () => {
        const gw = gateway();
        const rec = { broker: 'b9', hostname: 'host9', semp: { port: '', username: '', password: '' }, client: { port: '', msgVpns: [] } };
        expect(gw.store.upsertConnection(rec)).toEqual({ ok: true, rev: 2 });
        expect(gw.store.deleteConnection('b2')).toBe('deleted');
        expect(gw.store.deleteConnection('b2')).toBe('not_found');
        expect(gw.store.seqs().connections).toBe(3);
        expect(gw.store.connRev('b9')).toBe(2);
    });
});

describe('mock-broker/gateway/versions -- settings', () => {
    const view = async (gw: Gw) => (await call(gw, 'GET', '/managed/settings')).json;
    const save = (gw: Gw, patch: unknown) => call(gw, 'PUT', '/managed/settings', patch);

    it('carries a rev in the view, which changes on every save', async () => {
        const gw = gateway();
        const first = (await view(gw)).rev;
        expect(typeof first).toBe('string');
        expect(first).not.toBe('');
        const res = await save(gw, { logLevel: 'info', rev: first });
        expect(res.status).toBe(200);
        expect(res.json).toEqual({ rev: res.json.rev });
        expect(res.json.rev).not.toBe(first);
        expect((await view(gw)).rev).toBe(res.json.rev);
        const again = await save(gw, { rev: res.json.rev });   // nothing changed, still a save
        expect(again.json.rev).not.toBe(res.json.rev);
    });

    it('asks for the rev: missing, empty and null are rev_required; one that is not a string is a bad request', async () => {
        const gw = gateway();
        for (const body of [{}, { rev: '' }, { rev: null }, null]) expect(await save(gw, body)).toEqual(REFUSED('rev_required', 400));
        for (const body of [{ rev: 5 }, [], 'x']) expect((await save(gw, body)).status).toBe(400);
        expect(((await save(gw, { rev: 5 })).json)).toEqual({ error: 'bad_request' });
    });

    it('refuses a stale rev with the current one, and a refused save moves nothing', async () => {
        const gw = gateway();
        const rev = (await view(gw)).rev;
        await save(gw, { logLevel: 'info', rev });
        const now = (await view(gw)).rev;
        expect(await save(gw, { logLevel: 'debug', rev })).toEqual(REFUSED('stale', 409, { rev: now }));
        expect(gw.settings.current().logLevel).toBe('info');
        const bad: any = await save(gw, { logLevel: 'loud', rev: now });
        expect(bad.status).toBe(422);
        expect((await view(gw)).rev).toBe(now);
    });

    it('checks the disk first, then the rev, then the rules about the new content', async () => {
        const gw = gateway();
        const rev = (await view(gw)).rev;
        // A stale rev outranks a list that would lock the admin out.
        expect(await save(gw, { access: { allow: ['10.0.0.0/8'] }, rev: 'old' })).toEqual(REFUSED('stale', 409, { rev }));
        expect((await save(gw, { access: { allow: ['10.0.0.0/8'] }, rev })).json.error).toBe('would_lock_out');
        gw.faults.changedOnDisk = true;
        expect(await save(gw, { rev: 'old' })).toEqual(REFUSED('config_changed_on_disk', 409));
        gw.faults.changedOnDisk = false;
        gw.faults.unreadable = true;
        expect((await save(gw, { rev: 'old' })).json.error).toBe('config_unreadable');
        // But no rev at all is told first.
        expect((await save(gw, {})).json.error).toBe('rev_required');
    });

    it('carries the rev across a reload', async () => {
        const gw = gateway();
        await save(gw, { logLevel: 'info', rev: (await view(gw)).rev });
        const next = gateway();
        next.restore(gw.snapshot());
        expect((await view(next)).rev).toBe((await view(gw)).rev);
        expect((await save(next, { rev: (await view(next)).rev })).status).toBe(200);
    });

    it('lets a snapshot from a build before audit.onFailure restore with continue', () => {
        const gw = gateway();
        const snap = gw.snapshot();
        delete (snap.settings.audit as Partial<typeof snap.settings.audit>).onFailure;
        const next = gateway();
        next.restore(snap);
        expect(next.settings.current().audit.onFailure).toBe('continue');
    });
});

describe('mock-broker/gateway/versions -- the schedule', () => {
    const daily = { kind: 'daily', minute: 0, hour: 2, weekday: 0, day: 0, keep: 3 };
    const put = (gw: Gw, over: object) => call(gw, 'PUT', '/managed/backup/schedule', { ...daily, ...over });
    const status = async (gw: Gw) => (await call(gw, 'GET', '/managed/backup')).json.schedule;

    it('counts from 1: create, edit and delete each move it, and a delete keeps the counter', async () => {
        const gw = gateway();
        expect(await status(gw)).toBeNull();
        expect(await put(gw, { passphrase: PASS, rev: 0 })).toEqual({ status: 200, json: { rev: 1 } });
        expect((await status(gw)).rev).toBe(1);
        // A new passphrase alone is an edit: the rev is the file's seq, so it moves.
        expect(await put(gw, { passphrase: 'another long passphrase', rev: 1 })).toEqual({ status: 200, json: { rev: 2 } });
        expect((await call(gw, 'DELETE', '/managed/backup/schedule?rev=2')).status).toBe(204);
        expect(await status(gw)).toBeNull();
        expect(await put(gw, { passphrase: PASS, rev: 0 })).toEqual({ status: 200, json: { rev: 4 } });
    });

    it('refuses by the record: rev 0 on a schedule is exists, above 0 on none is 404, a wrong one stale', async () => {
        const gw = gateway();
        expect(await put(gw, { passphrase: PASS, rev: 1 })).toEqual(REFUSED('not_found', 404));
        expect(await put(gw, { rev: 1 })).toEqual(REFUSED('not_found', 404));   // before "a new schedule needs a passphrase"
        await put(gw, { passphrase: PASS, rev: 0 });
        expect(await put(gw, { passphrase: PASS, rev: 0 })).toEqual(REFUSED('exists', 409));
        expect(await put(gw, { passphrase: PASS, rev: 5 })).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect((await status(gw)).rev).toBe(1);
    });

    it('asks for a rev after the checks on the body alone, and a new schedule still needs its passphrase', async () => {
        const gw = gateway();
        for (const rev of [undefined, null, -1, 1.5, '0']) expect(await put(gw, { passphrase: PASS, rev })).toEqual(REFUSED('rev_required', 400));
        expect((await put(gw, { kind: 'yearly', rev: undefined })).json.field).toBe('schedule');
        expect((await put(gw, { keep: 0 })).json.field).toBe('keep');
        expect((await put(gw, { passphrase: 'short' })).json.field).toBe('passphrase');
        expect(await put(gw, { rev: 0 })).toEqual({ status: 422, json: { error: 'invalid', field: 'passphrase', reason: 'A new schedule needs a passphrase.' } });
        expect(await status(gw)).toBeNull();
    });

    it('deletes with ?rev=N: missing is rev_required before anything, then 404, stale, done', async () => {
        const gw = gateway();
        for (const q of ['', '?rev=0', '?rev=x']) expect(await call(gw, 'DELETE', `/managed/backup/schedule${q}`)).toEqual(REFUSED('rev_required', 400));
        expect(await call(gw, 'DELETE', '/managed/backup/schedule?rev=1')).toEqual(REFUSED('not_found', 404));
        await put(gw, { passphrase: PASS, rev: 0 });
        expect(await call(gw, 'DELETE', '/managed/backup/schedule?rev=3')).toEqual(REFUSED('stale', 409, { rev: 1 }));
        expect((await status(gw)).rev).toBe(1);
    });

    it('carries the counter across a reload, though not the schedule, and starts at 0 from a snapshot without it', async () => {
        const gw = gateway();
        await put(gw, { passphrase: PASS, rev: 0 });
        await put(gw, { rev: 1 });
        const next = gateway();
        next.restore(gw.snapshot());
        expect(await status(next)).toBeNull();
        expect(await put(next, { passphrase: PASS, rev: 0 })).toEqual({ status: 200, json: { rev: 3 } });

        const snap = gw.snapshot();
        delete snap.backups!.seq;
        const old = gateway();
        old.restore(snap);
        expect(await put(old, { passphrase: PASS, rev: 0 })).toEqual({ status: 200, json: { rev: 1 } });
    });
});

describe('mock-broker/gateway/versions -- the basis of an import', () => {
    const preview = async (gw: Gw) => {
        const file = (await call(gw, 'POST', '/managed/backup/export', { passphrase: PASS })).json.content;
        return { file, res: await call(gw, 'POST', '/managed/backup/preview', { file, passphrase: PASS }) };
    };
    const imp = (gw: Gw, file: string, choice: { users?: string; connections?: string; settings?: string }, basis: unknown) =>
        call(gw, 'POST', '/managed/backup/import', { file, passphrase: PASS, users: 'skip', connections: 'skip', settings: 'skip', ...choice, basis });
    const viewerSave = (gw: Gw) => call(gw, 'PUT', '/managed/users/viewer', {
        password: '', admin: false, operate: [], readOnly: [], modules: null, rev: 1,
    });
    const connSave = (gw: Gw) => call(gw, 'PUT', '/managed/connections/b3', {
        hostname: 'host3b', semp: { port: '', user: '', pass: '' }, client: { scheme: 'ws', port: '1443', msgVpns: [{ name: 'v3', user: 'u3', pass: '' }] }, rev: 1,
    });
    const settingsSave = async (gw: Gw) => call(gw, 'PUT', '/managed/settings', { logLevel: 'info', rev: gw.settings.rev() });

    it('is returned by the preview: both seqs and the settings rev', async () => {
        const gw = gateway();
        const { res } = await preview(gw);
        expect(res.status).toBe(200);
        expect(res.json.basis).toEqual({ users: 1, connections: 1, settings: gw.settings.rev() });
        await viewerSave(gw);
        await settingsSave(gw);
        expect((await preview(gw)).res.json.basis).toEqual({ users: 2, connections: 1, settings: gw.settings.rev() });
    });

    it('is required: missing or null is rev_required, one of the wrong shape a bad request', async () => {
        const gw = gateway();
        const { file } = await preview(gw);
        expect(await imp(gw, file, { users: 'merge' }, undefined)).toEqual(REFUSED('rev_required', 400));
        expect(await imp(gw, file, { users: 'merge' }, null)).toEqual(REFUSED('rev_required', 400));
        expect((await imp(gw, file, { users: 'merge' }, 'x')).status).toBe(400);
        expect((await imp(gw, file, { users: 'merge' }, { users: '1' })).status).toBe(400);
        expect((await imp(gw, file, { users: 'merge' }, { extra: 1 })).status).toBe(400);
        // The choices are judged before it, as the other checks on the request alone.
        expect((await call(gw, 'POST', '/managed/backup/import', { file, passphrase: PASS, users: 'nope', connections: 'skip', settings: 'skip' })).json.field).toBe('users');
    });

    it('goes stale for each imported section that moved, with the current basis, and changes nothing', async () => {
        const gw = gateway();
        const { file, res } = await preview(gw);
        const seen = res.json.basis;

        await viewerSave(gw);
        const now = { users: 2, connections: 1, settings: seen.settings };
        for (const choice of [{ users: 'merge' }, { users: 'replace', connections: 'replace' }]) {
            expect(await imp(gw, file, choice, seen)).toEqual(REFUSED('stale', 409, { basis: now }));
        }
        expect(gw.store.seqs()).toEqual({ users: 2, connections: 1 });

        await connSave(gw);
        expect((await imp(gw, file, { connections: 'merge' }, seen)).json).toEqual({ error: 'stale', basis: { ...now, connections: 2 } });

        await settingsSave(gw);
        expect((await imp(gw, file, { settings: 'replace' }, seen)).json).toEqual({ error: 'stale', basis: { users: 2, connections: 2, settings: gw.settings.rev() } });
        expect(gw.settings.current().logLevel).toBe('info');

        // A basis with a field left out reads it as 0, which is never current.
        expect((await imp(gw, file, { users: 'merge' }, {})).json.error).toBe('stale');
    });

    it('compares only the sections the import touches', async () => {
        const gw = gateway();
        const { file, res } = await preview(gw);
        const seen = res.json.basis;
        await viewerSave(gw);
        await connSave(gw);
        await settingsSave(gw);
        // Everything moved, but the choice skips users and settings: only connections count, and they moved.
        expect((await imp(gw, file, { connections: 'merge' }, seen)).json.error).toBe('stale');
        // The connections' own part of the basis is current: users and settings are skipped and may be old.
        const current = { ...seen, connections: gw.store.seqs().connections };
        expect((await imp(gw, file, { connections: 'merge' }, current)).status).toBe(200);
        // Settings alone, with every other part of the basis wrong.
        expect((await imp(gw, file, { settings: 'replace' }, { users: 0, connections: 0, settings: gw.settings.rev() })).status).toBe(200);
        // Users alone.
        expect((await imp(gw, file, { users: 'merge' }, { users: gw.store.seqs().users, connections: 0, settings: '' })).status).toBe(200);
    });

    it('goes stale after a user changes their own password, because seq moves with every commit', async () => {
        const gw = gateway();
        const { file, res } = await preview(gw);
        gw.setCookie(gw.openSession('viewer', false));
        expect(gw.changePassword('viewer-password-1', 'viewer-password-2', 'viewer-password-2').ok).toBe(true);
        expect((await imp(gw, file, { users: 'merge' }, res.json.basis)).json).toEqual({
            error: 'stale', basis: { users: 2, connections: 1, settings: res.json.basis.settings },
        });
    });

    it('tells the disk first when the settings are imported, and not when they are skipped', async () => {
        const gw = gateway();
        const { file } = await preview(gw);
        gw.faults.changedOnDisk = true;
        expect(await imp(gw, file, { settings: 'replace' }, { users: 0, connections: 0, settings: 'old' })).toEqual(REFUSED('config_changed_on_disk', 409));
        expect((await imp(gw, file, { users: 'merge' }, { users: 0, connections: 0, settings: '' })).json.error).toBe('stale');
    });

    it('restamps every record of an imported section, and leaves the others', async () => {
        const gw = gateway();
        const { file, res } = await preview(gw);
        const rev = gw.settings.rev();
        expect((await imp(gw, file, { users: 'merge', settings: 'replace' }, res.json.basis)).status).toBe(200);
        // Merge stamps the whole list, the records the file does not name as well.
        const users = (await call(gw, 'GET', '/managed/users')).json.users.map((u: any) => u.rev);
        expect(users).toEqual([2, 2, 2]);
        expect(gw.store.seqs()).toEqual({ users: 2, connections: 1 });
        expect((await call(gw, 'GET', '/managed/connections')).json.connections.map((c: any) => c.rev)).toEqual([1, 1, 1]);
        expect(gw.settings.rev()).not.toBe(rev);

        const second = await preview(gw);
        expect((await imp(gw, second.file, { users: 'replace', connections: 'replace' }, second.res.json.basis)).status).toBe(200);
        expect((await call(gw, 'GET', '/managed/users')).json.users.map((u: any) => u.rev)).toEqual([3, 3, 3]);
        expect((await call(gw, 'GET', '/managed/connections')).json.connections.map((c: any) => c.rev)).toEqual([2, 2, 2]);
    });

    it('imports a backup without audit.onFailure as continue, replacing the saved refuse', async () => {
        const gw = gateway();
        const doc: BackupDoc = await openBackup((await call(gw, 'POST', '/managed/backup/export', { passphrase: PASS })).json.content, PASS);
        delete (doc.settings.audit as Partial<typeof doc.settings.audit>).onFailure;
        // The gateway's strict reader puts a missing key at the zero value of the file: here the default.
        const sealed = await sealBackup(await newBackupKey(PASS, 1000), doc);
        const put = await call(gw, 'PUT', '/managed/settings', { audit: { onFailure: 'refuse' }, rev: gw.settings.rev() });
        expect(put.status).toBe(200);
        expect(gw.settings.current().audit.onFailure).toBe('refuse');
        expect((await imp(gw, sealed, { settings: 'replace' }, { users: 1, connections: 1, settings: gw.settings.rev() })).status).toBe(200);
        expect(gw.settings.current().audit.onFailure).toBe('continue');
    });
});

describe('mock-broker/gateway/versions -- a reload', () => {
    it('carries every seq and rev, so a save made before the reload still lands after it', async () => {
        const gw = gateway();
        await call(gw, 'PUT', '/managed/users/newbie', {
            password: 'newbie-password-1', admin: false, operate: [], readOnly: [], modules: null, rev: 0,
        });
        await call(gw, 'DELETE', '/managed/connections/b3?rev=1');
        const next = gateway();
        next.restore(gw.snapshot());
        expect(next.store.seqs()).toEqual({ users: 2, connections: 2 });
        expect(next.store.userRev('newbie')).toBe(2);
        expect(next.store.connRev('b3')).toBeUndefined();
        expect((await call(next, 'DELETE', '/managed/users/newbie?rev=2')).status).toBe(204);
    });
});
