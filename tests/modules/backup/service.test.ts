import { describe, it, expect } from 'vitest';
import { createBackupService } from '../../../src/modules/backup/service';

const fetchMock = () => globalThis.fetch as any;
const answer = (status: number, json?: unknown) =>
    fetchMock().mockResolvedValue({ ok: status < 300, status, json: async () => json });
const sent = () => fetchMock().mock.calls[0] as [string, RequestInit];

describe('backup/service', () => {
    it('status GETs /managed/backup', async () => {
        const st = { schedule: null, nextRun: null, lastRun: null, dirProblem: '', files: [] };
        answer(200, st);
        expect(await createBackupService().status()).toEqual({ ok: true, data: st });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/backup', { method: 'GET', credentials: 'same-origin' });
    });

    it('download GETs one saved backup by its name, escaped', async () => {
        answer(200, { filename: 'smu-backup-20261109T020000Z.json', content: '{}' });
        expect(await createBackupService().download('smu-backup-20261109T020000Z.json'))
            .toEqual({ ok: true, data: { filename: 'smu-backup-20261109T020000Z.json', content: '{}' } });
        expect(fetchMock()).toHaveBeenCalledWith('/managed/backup/files/smu-backup-20261109T020000Z.json', { method: 'GET', credentials: 'same-origin' });
        fetchMock().mockClear();
        answer(404, { error: 'not_found' });
        await createBackupService().download('../users.yaml');
        expect(sent()[0]).toBe('/managed/backup/files/..%2Fusers.yaml');
    });

    it('saveSchedule PUTs the schedule, the keep count and the passphrase', async () => {
        answer(204);
        const body = { kind: 'weekly' as const, minute: 15, hour: 2, weekday: 1, day: 0, keep: 14, passphrase: '' };
        expect(await createBackupService().saveSchedule(body)).toEqual({ ok: true, data: undefined });
        expect(sent()).toEqual(['/managed/backup/schedule', expect.objectContaining({ method: 'PUT', body: JSON.stringify(body) })]);
    });

    it('removeSchedule DELETEs it, and runNow POSTs a run', async () => {
        answer(204);
        await createBackupService().removeSchedule();
        expect(sent()[0]).toBe('/managed/backup/schedule');
        expect(sent()[1].method).toBe('DELETE');
        fetchMock().mockClear();
        answer(200, { file: 'smu-backup-20261109T020000Z.json' });
        expect(await createBackupService().runNow()).toEqual({ ok: true, data: { file: 'smu-backup-20261109T020000Z.json' } });
        expect(sent()[0]).toBe('/managed/backup/run');
        expect(sent()[1].method).toBe('POST');
    });

    it('exportFile POSTs the passphrase', async () => {
        answer(200, { filename: 'f.json', content: '{}' });
        expect(await createBackupService().exportFile('a long passphrase')).toEqual({ ok: true, data: { filename: 'f.json', content: '{}' } });
        expect(sent()).toEqual(['/managed/backup/export', expect.objectContaining({ method: 'POST', body: JSON.stringify({ passphrase: 'a long passphrase' }) })]);
    });

    it('preview and importFile send the source, the passphrase and, for an import, the choices', async () => {
        answer(200, {});
        await createBackupService().preview({ backup: 'smu-backup-20261109T020000Z.json' }, 'pp');
        expect(sent()).toEqual(['/managed/backup/preview', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ backup: 'smu-backup-20261109T020000Z.json', passphrase: 'pp' }),
        })]);
        fetchMock().mockClear();
        answer(200, { restartRequired: [], signedOut: false });
        await createBackupService().importFile({ file: '{}' }, 'pp', { users: 'merge', connections: 'skip', settings: 'replace' });
        expect(sent()).toEqual(['/managed/backup/import', expect.objectContaining({
            method: 'POST', body: JSON.stringify({ file: '{}', passphrase: 'pp', users: 'merge', connections: 'skip', settings: 'replace' }),
        })]);
    });
});
