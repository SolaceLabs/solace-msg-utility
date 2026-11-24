import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { createEventBus } from '../../../src/core/event-bus';
import type { AppContext, AppState, ManagedSession } from '../../../src/core/types';
import type { BackupStatus, ImportPreview } from '../../../src/modules/backup/service';

const svc = vi.hoisted(() => ({
    status: vi.fn(), download: vi.fn(), saveSchedule: vi.fn(), removeSchedule: vi.fn(), runNow: vi.fn(),
    exportFile: vi.fn(), preview: vi.fn(), importFile: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ showToast: vi.fn() }));
const downloadMock = vi.hoisted(() => ({ downloadBlob: vi.fn() }));

vi.mock('../../../src/core/toast', () => ({ showToast: toastMock.showToast }));
vi.mock('../../../src/core/download', () => ({ downloadBlob: downloadMock.downloadBlob }));
vi.mock('../../../src/modules/backup/service', () => ({ createBackupService: () => svc }));

import { BackupModule, describeSchedule, diffLines, MAX_IMPORT_BYTES } from '../../../src/modules/backup/module';
import { formatUtc } from '../../../src/core/utils';
import { completeContext } from '../../helpers/appContext';
import { answerConfirm, confirmOpen } from '../../helpers/confirmDialog';

const ADMIN: ManagedSession = { admin: true, username: 'admin', broker: '', vpns: [], operate: [], readOnly: [], modules: [] };
const NONE: BackupStatus = { schedule: null, nextRun: null, lastRun: null, dirProblem: '', files: [] };
const WEEKLY: BackupStatus = {
    schedule: { kind: 'weekly', minute: 15, hour: 2, weekday: 1, day: 0, keep: 14, rev: 4 },
    nextRun: '2026-11-16T02:15:00Z',
    lastRun: { at: '2026-11-09T02:15:00Z', file: 'smu-backup-20261109T021500Z.json', error: '' },
    dirProblem: '',
    files: [
        { name: 'smu-backup-20261109T021500Z.json', size: 2048, created: '2026-11-09T02:15:00Z' },
        { name: 'smu-backup-20261102T021500Z.json', size: 1024, created: '2026-11-02T02:15:00Z' },
    ],
};
const PREVIEW: ImportPreview = {
    created: '2026-11-09T02:15:00Z', gateway: 'v3.7.0',
    users: { added: ['newbie'], changed: ['admin'], removed: ['operator'] },
    connections: { added: [], changed: [], removed: [] },
    settings: ['logLevel'],
    signsOutCaller: { replace: true, merge: false },
    basis: { users: 3, connections: 2, settings: 'cfg-1' },
};
const ok = <T>(data?: T) => ({ ok: true, data });
const refused = (code: string, reason?: string, field?: string) => ({ ok: false, status: 422, code, reason, field });

const el = <T extends HTMLElement>(c: HTMLElement, sel: string) => c.querySelector(sel) as T;
const hidden = (c: HTMLElement, sel: string) => el(c, sel).classList.contains('hidden');
const text = (c: HTMLElement, sel: string) => el(c, sel).textContent;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const click = async (c: HTMLElement, sel: string) => {
    el<HTMLButtonElement>(c, sel).click();
    await flush();
};
/** Answer the open confirm dialog, then let the handler finish (the call, the reload, the toast). */
const answer = async (yes: boolean) => {
    const question = await answerConfirm(yes);
    await flush();
    return question;
};
const type = (c: HTMLElement, sel: string, v: string) => {
    el<HTMLInputElement>(c, sel).value = v;
};
const choose = (c: HTMLElement, sel: string, v: string) => {
    el<HTMLSelectElement>(c, sel).value = v;
    el(c, sel).dispatchEvent(new Event('change'));
};

function makeCtx(container: HTMLElement, managed: ManagedSession | null): AppContext {
    const eventBus = createEventBus();
    const appState: AppState = {
        activeModuleId: null, isConnected: false, selectedVpn: null,
        solaceConnection: null, sempCredentials: null, isSempConnected: false, managed,
    };
    return completeContext({
        container, appState, eventBus,
        setState: (k, v) => { (appState as any)[k] = v; },
        loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(),
    });
}

async function setup(status: BackupStatus = NONE, managed: ManagedSession | null = ADMIN) {
    const c = loadModuleDOM('backup');
    const ctx = makeCtx(c, managed);
    svc.status.mockResolvedValue(ok(status));
    await BackupModule.install(ctx);
    await flush();
    return { c, ctx };
}

/** Pick a file in the import's file input. */
async function pick(c: HTMLElement, file: File | null) {
    const input = el<HTMLInputElement>(c, '#backup-import-file');
    Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : null });
    input.dispatchEvent(new Event('change'));
    await flush();
    await flush();
}

beforeEach(() => {
    for (const fn of Object.values(svc)) fn.mockReset();
    toastMock.showToast.mockReset();
    downloadMock.downloadBlob.mockReset();
});

describe('backup -- helpers', () => {
    it('describes each kind of schedule in UTC', () => {
        expect(describeSchedule({ kind: 'hourly', minute: 5, hour: 0, weekday: 0, day: 0 })).toBe('Hourly at 05 minutes past the hour');
        expect(describeSchedule({ kind: 'daily', minute: 0, hour: 2, weekday: 0, day: 0 })).toBe('Daily at 02:00 UTC');
        expect(describeSchedule({ kind: 'weekly', minute: 15, hour: 2, weekday: 1, day: 0 })).toBe('Weekly on Monday at 02:15 UTC');
        expect(describeSchedule({ kind: 'monthly', minute: 30, hour: 23, weekday: 0, day: 31 })).toBe('Monthly on day 31 at 23:30 UTC');
    });

    it('lists a section as additions, changes and removals, or no change', () => {
        expect(diffLines({ added: ['a', 'b'], changed: ['c'], removed: ['d'] }, 'Remove')).toEqual(['Add: a, b', 'Change: c', 'Remove: d']);
        expect(diffLines({ added: [], changed: [], removed: [] }, 'Remove')).toEqual(['No change.']);
    });
});

describe('backup -- gate and status', () => {
    it('shows the gate, not the page, without an administrator session, and loads once one arrives', async () => {
        const { c, ctx } = await setup(NONE, null);
        expect(hidden(c, '#backup-view')).toBe(true);
        ctx.appState.managed = { ...ADMIN, admin: false };
        ctx.eventBus.emit('rbac:changed');
        expect(hidden(c, '#backup-view')).toBe(true);
        expect(svc.status).not.toHaveBeenCalled();
        ctx.appState.managed = ADMIN;
        ctx.eventBus.emit('rbac:changed');
        await flush();
        expect(hidden(c, '#backup-view')).toBe(false);
        expect(svc.status).toHaveBeenCalledTimes(1);
    });

    it('without a schedule: says so, asks for a passphrase, and offers neither Back up now nor Remove', async () => {
        const { c } = await setup();
        expect(text(c, '#backup-schedule-status')).toBe('No schedule: the gateway writes no backups until you save one.');
        expect(text(c, '#backup-sched-pass-hint')).toContain('Required');
        expect(el<HTMLButtonElement>(c, '#btn-backup-run').disabled).toBe(true);
        expect(el<HTMLButtonElement>(c, '#btn-backup-remove-schedule').disabled).toBe(true);
        expect(text(c, '#backup-rows')).toBe('No saved backups yet.');
        expect(hidden(c, '#backup-dir-problem')).toBe(true);
    });

    it('with a schedule: describes it, fills the form, lists the files with a download and a restore button each', async () => {
        const { c } = await setup(WEEKLY);
        expect(text(c, '#backup-schedule-status')).toBe(
            'Weekly on Monday at 02:15 UTC; keeps the last 14. Next backup: 2026-11-16 02:15 UTC. '
            + 'Last backup: smu-backup-20261109T021500Z.json, 2026-11-09 02:15 UTC.');
        expect([el<HTMLSelectElement>(c, '#backup-kind').value, el<HTMLSelectElement>(c, '#backup-weekday').value,
            el<HTMLInputElement>(c, '#backup-time').value, el<HTMLInputElement>(c, '#backup-keep').value]).toEqual(['weekly', '1', '02:15', '14']);
        expect(text(c, '#backup-sched-pass-hint')).toBe('Leave blank to keep the current passphrase.');
        expect(el<HTMLButtonElement>(c, '#btn-backup-run').disabled).toBe(false);
        const rows = [...c.querySelectorAll('#backup-rows tr')];
        expect(rows.map(r => [...r.querySelectorAll('td')].slice(0, 3).map(td => td.textContent))).toEqual([
            ['smu-backup-20261109T021500Z.json', '2026-11-09 02:15 UTC', '2 KB'],
            ['smu-backup-20261102T021500Z.json', '2026-11-02 02:15 UTC', '1 KB'],
        ]);
        expect([...rows[0].querySelectorAll('.data-table-actions button')].map(b => b.getAttribute('aria-label'))).toEqual([
            'Download "smu-backup-20261109T021500Z.json"', 'Restore "smu-backup-20261109T021500Z.json"',
        ]);
        // Only the weekly fields show.
        expect(hidden(c, '[data-kinds="weekly"]')).toBe(false);
        expect(hidden(c, '[data-kinds="monthly"]')).toBe(true);
        expect(hidden(c, '[data-kinds="hourly"]')).toBe(true);
        expect(hidden(c, '[data-kinds="daily weekly monthly"]')).toBe(false);
    });

    it('shows a failed last run with its reason, and the directory problem', async () => {
        const { c } = await setup({
            ...NONE,
            schedule: { kind: 'monthly', minute: 0, hour: 3, weekday: 0, day: 31, keep: 3, rev: 1 },
            nextRun: '2026-11-30T03:00:00Z',
            lastRun: { at: '2026-11-09T03:00:00Z', file: '', error: '/backup is not writable' },
            dirProblem: '/backup does not exist. Mount a directory there.',
        });
        expect(text(c, '#backup-schedule-status')).toContain('Last backup, 2026-11-09 03:00 UTC, failed: /backup is not writable');
        expect(el<HTMLInputElement>(c, '#backup-day').value).toBe('31');
        expect(hidden(c, '#backup-dir-problem')).toBe(false);
        expect(text(c, '#backup-dir-problem')).toBe('/backup does not exist. Mount a directory there.');
        expect(text(c, '#backup-rows')).toBe('The backup directory cannot be read.');
    });

    it('downloads a saved backup as the gateway holds it, under its own name', async () => {
        const { c } = await setup(WEEKLY);
        svc.download.mockResolvedValue(ok({ filename: 'smu-backup-20261102T021500Z.json', content: '{"format":"smu-backup"}' }));
        c.querySelectorAll<HTMLButtonElement>('#backup-rows .backup-download')[1].click();
        await flush();
        expect(svc.download).toHaveBeenCalledWith('smu-backup-20261102T021500Z.json');
        const [blob, name] = downloadMock.downloadBlob.mock.calls[0] as [Blob, string];
        expect([name, blob.type, await blob.text()]).toEqual(['smu-backup-20261102T021500Z.json', 'application/json', '{"format":"smu-backup"}']);
        expect(hidden(c, '#backup-error')).toBe(true);
    });

    it('shows why a download failed: the file was pruned meanwhile', async () => {
        const { c } = await setup(WEEKLY);
        svc.download.mockResolvedValue({ ok: false, status: 404, code: 'not_found' });
        await click(c, '#backup-rows .backup-download');
        expect(text(c, '#backup-error')).toBe('Not found. It may already have been removed.');
        expect(downloadMock.downloadBlob).not.toHaveBeenCalled();
    });

    it('shows a failed load, and Reload asks again', async () => {
        const c = loadModuleDOM('backup');
        svc.status.mockResolvedValue(refused('server_error'));
        await BackupModule.install(makeCtx(c, ADMIN));
        await flush();
        expect(hidden(c, '#backup-error')).toBe(false);
        expect(text(c, '#backup-error')).toContain('could not complete the request');
        svc.status.mockResolvedValue(ok(NONE));
        await click(c, '#btn-backup-reload');
        expect(hidden(c, '#backup-error')).toBe(true);
    });
});

describe('backup -- export', () => {
    it('refuses passphrases that differ, before asking the gateway', async () => {
        const { c } = await setup();
        type(c, '#backup-export-pass', 'one long passphrase');
        type(c, '#backup-export-confirm', 'another passphrase');
        await click(c, '#btn-backup-export');
        expect(text(c, '#backup-export-error')).toBe('The passphrases do not match.');
        expect(svc.exportFile).not.toHaveBeenCalled();
    });

    it("shows the gateway's refusal", async () => {
        const { c } = await setup();
        svc.exportFile.mockResolvedValue(refused('invalid', 'The passphrase must be 12 to 128 characters.', 'passphrase'));
        await click(c, '#btn-backup-export');
        expect(text(c, '#backup-export-error')).toBe('The passphrase must be 12 to 128 characters.');
        expect(downloadMock.downloadBlob).not.toHaveBeenCalled();
    });

    it('downloads the file under its name and clears the passphrase', async () => {
        const { c } = await setup();
        type(c, '#backup-export-pass', 'one long passphrase');
        type(c, '#backup-export-confirm', 'one long passphrase');
        svc.exportFile.mockResolvedValue(ok({ filename: 'smu-backup-20261109T020000Z.json', content: '{"format":"smu-backup"}' }));
        await click(c, '#btn-backup-export');
        expect(svc.exportFile).toHaveBeenCalledWith('one long passphrase');
        const [blob, name] = downloadMock.downloadBlob.mock.calls[0] as [Blob, string];
        expect([name, blob.type, await blob.text()]).toEqual(['smu-backup-20261109T020000Z.json', 'application/json', '{"format":"smu-backup"}']);
        expect(el<HTMLInputElement>(c, '#backup-export-pass').value).toBe('');
        expect(el<HTMLInputElement>(c, '#backup-export-confirm').value).toBe('');
        expect(toastMock.showToast).toHaveBeenCalledWith('Exported smu-backup-20261109T020000Z.json', 'ok');
    });
});

describe('backup -- import', () => {
    async function previewed(status: BackupStatus = NONE) {
        const s = await setup(status);
        await pick(s.c, new File(['{"format":"smu-backup"}'], 'mine.json'));
        type(s.c, '#backup-import-pass', 'the passphrase!');
        svc.preview.mockResolvedValue(ok(PREVIEW));
        await click(s.c, '#btn-backup-preview');
        return s;
    }

    it('asks for a file before a preview', async () => {
        const { c } = await setup();
        await click(c, '#btn-backup-preview');
        expect(text(c, '#backup-import-error')).toBe('Choose a backup file, or a saved backup below.');
        expect(svc.preview).not.toHaveBeenCalled();
    });

    it('reads a picked file, refuses one too large to be a backup, and forgets a cleared pick', async () => {
        const { c } = await setup();
        await pick(c, new File(['{}'], 'mine.json'));
        expect(text(c, '#backup-import-source')).toBe('File: mine.json');
        const big = new File(['x'], 'big.json');
        Object.defineProperty(big, 'size', { value: MAX_IMPORT_BYTES + 1 });
        await pick(c, big);
        expect(text(c, '#backup-import-error')).toBe('big.json is larger than the 8 MiB the gateway accepts in one import.');
        expect(hidden(c, '#backup-import-source')).toBe(true);
        await pick(c, null);
        await click(c, '#btn-backup-preview');
        expect(svc.preview).not.toHaveBeenCalled();
    });

    it('measures a picked file as the JSON string it travels in: one under 8 MiB that escapes past it is refused', async () => {
        const { c } = await setup();
        // Every quote is sent as two bytes, so 5 MiB of them is 10 MiB on the wire.
        await pick(c, new File(['"'.repeat(5 << 20)], 'quotes.json'));
        await vi.waitFor(() => expect(text(c, '#backup-import-error')).toBe('quotes.json is larger than the 8 MiB the gateway accepts in one import.'));
        expect(hidden(c, '#backup-import-source')).toBe(true);
        await click(c, '#btn-backup-preview');
        expect(svc.preview).not.toHaveBeenCalled();
    });

    it('previews a saved backup chosen from the list, by name', async () => {
        const { c } = await setup(WEEKLY);
        c.querySelector<HTMLButtonElement>('#backup-rows .backup-restore')!.click();
        expect(text(c, '#backup-import-source')).toBe('Saved backup: smu-backup-20261109T021500Z.json');
        expect(el<HTMLInputElement>(c, '#backup-import-file').value).toBe('');
        type(c, '#backup-import-pass', 'the passphrase!');
        svc.preview.mockResolvedValue(ok({ ...PREVIEW, settings: [] }));
        await click(c, '#btn-backup-preview');
        expect(svc.preview).toHaveBeenCalledWith({ backup: 'smu-backup-20261109T021500Z.json' }, 'the passphrase!');
        expect(text(c, '#backup-diff-settings')).toBe('No change.');
    });

    it('shows what each section would change, every choice at Skip, and warns when the chosen users mode signs this admin out', async () => {
        const { c } = await previewed();
        expect(svc.preview).toHaveBeenCalledWith({ file: '{"format":"smu-backup"}' }, 'the passphrase!');
        expect(hidden(c, '#backup-preview')).toBe(false);
        expect(text(c, '#backup-preview-meta')).toBe('Backup made 2026-11-09 02:15 UTC by gateway v3.7.0. Choose what to import:');
        expect([...c.querySelectorAll('#backup-diff-users li')].map(li => li.textContent))
            .toEqual(['Add: newbie', 'Change: admin', 'Remove (Replace only): operator']);
        expect(text(c, '#backup-diff-connections')).toBe('No change.');
        expect(text(c, '#backup-diff-settings')).toBe('Change: logLevel');
        expect(['users', 'connections', 'settings'].map(s => el<HTMLSelectElement>(c, `#backup-choice-${s}`).value)).toEqual(['skip', 'skip', 'skip']);
        expect(hidden(c, '#backup-signout')).toBe(true);
        choose(c, '#backup-choice-users', 'replace');
        expect(hidden(c, '#backup-signout')).toBe(false);
        choose(c, '#backup-choice-users', 'merge');
        expect(hidden(c, '#backup-signout')).toBe(true);
    });

    it('hides a stale preview when the gateway refuses the next one', async () => {
        const { c } = await previewed();
        svc.preview.mockResolvedValue(refused('invalid', 'The passphrase does not open this file, or the file is damaged.', 'passphrase'));
        await click(c, '#btn-backup-preview');
        expect(hidden(c, '#backup-preview')).toBe(true);
        expect(text(c, '#backup-import-error')).toBe('The passphrase does not open this file, or the file is damaged.');
    });

    it('asks before importing and sends nothing when declined', async () => {
        const { c } = await previewed();
        choose(c, '#backup-choice-users', 'merge');
        await click(c, '#btn-backup-import');
        expect(await answer(false)).toBe('Import users (merge) from this backup? The gateway applies it at once.');
        expect(svc.importFile).not.toHaveBeenCalled();
    });

    it("leaves an all-Skip import to the gateway's refusal", async () => {
        const { c } = await previewed();
        svc.importFile.mockResolvedValue(refused('invalid', 'Choose at least one section to import.', 'sections'));
        await click(c, '#btn-backup-import');
        expect(confirmOpen()).toBe(false);
        expect(text(c, '#backup-import-error')).toBe('Choose at least one section to import.');
    });

    it('imports the chosen sections and resets the form', async () => {
        const { c } = await previewed();
        choose(c, '#backup-choice-connections', 'replace');
        choose(c, '#backup-choice-settings', 'replace');
        svc.importFile.mockResolvedValue(ok({ signedOut: false }));
        await click(c, '#btn-backup-import');
        await answer(true);
        expect(svc.importFile).toHaveBeenCalledWith({ file: '{"format":"smu-backup"}' }, 'the passphrase!',
            { users: 'skip', connections: 'replace', settings: 'replace' }, PREVIEW.basis);
        expect(toastMock.showToast).toHaveBeenCalledWith('Imported', 'ok');
        expect(hidden(c, '#backup-preview')).toBe(true);
        expect(el<HTMLInputElement>(c, '#backup-import-pass').value).toBe('');
        expect(hidden(c, '#backup-import-source')).toBe(true);
        expect(svc.status).toHaveBeenCalledTimes(2);
    });

    it('signs out when the import ended this administrator\'s own session', async () => {
        const { c, ctx } = await previewed();
        const signOut = vi.fn();
        ctx.eventBus.on('rbac:sign-out-requested', signOut);
        choose(c, '#backup-choice-users', 'replace');
        svc.importFile.mockResolvedValue(ok({ signedOut: true }));
        await click(c, '#btn-backup-import');
        await answer(true);
        expect(signOut).toHaveBeenCalled();
        expect(toastMock.showToast).toHaveBeenCalledWith('Imported. Your own account changed: sign in again.', 'ok', expect.any(Number));
        // The page keeps neither the passphrase nor the backup it read.
        expect(el<HTMLInputElement>(c, '#backup-import-pass').value).toBe('');
        expect(hidden(c, '#backup-import-source')).toBe(true);
        svc.preview.mockClear();
        await click(c, '#btn-backup-preview');
        expect(svc.preview).not.toHaveBeenCalled();
    });

    it('a sign-out leaves no passphrase or loaded backup in the hidden page', async () => {
        const { c, ctx } = await previewed(WEEKLY);
        for (const sel of ['#backup-export-pass', '#backup-export-confirm', '#backup-sched-pass', '#backup-sched-confirm']) type(c, sel, 'typed');
        ctx.appState.managed = null;
        ctx.eventBus.emit('rbac:changed');
        expect(['#backup-export-pass', '#backup-export-confirm', '#backup-sched-pass', '#backup-sched-confirm', '#backup-import-pass']
            .map(sel => el<HTMLInputElement>(c, sel).value)).toEqual(['', '', '', '', '']);
        expect(hidden(c, '#backup-import-source')).toBe(true);
    });

    it("shows the gateway's refusal of an import", async () => {
        const { c } = await previewed();
        choose(c, '#backup-choice-users', 'replace');
        svc.importFile.mockResolvedValue({ ok: false, status: 409, code: 'last_admin' });
        await click(c, '#btn-backup-import');
        await answer(true);
        expect(text(c, '#backup-import-error')).toBe('At least one administrator must remain.');
    });
});

describe('backup -- schedule', () => {
    it('shows only the fields the chosen frequency uses', async () => {
        const { c } = await setup();
        choose(c, '#backup-kind', 'hourly');
        expect(hidden(c, '[data-kinds="hourly"]')).toBe(false);
        expect(hidden(c, '[data-kinds="daily weekly monthly"]')).toBe(true);
        choose(c, '#backup-kind', 'monthly');
        expect(hidden(c, '[data-kinds="monthly"]')).toBe(false);
        expect(hidden(c, '[data-kinds="weekly"]')).toBe(true);
    });

    it('sends each kind with the fields it uses and zeros for the rest', async () => {
        const { c } = await setup();
        svc.saveSchedule.mockResolvedValue(ok({ rev: 2 }));
        const save = async (kind: string, fill: () => void) => {
            choose(c, '#backup-kind', kind);
            fill();
            type(c, '#backup-keep', '7');
            type(c, '#backup-sched-pass', 'a long passphrase');
            type(c, '#backup-sched-confirm', 'a long passphrase');
            await click(c, '#btn-backup-save-schedule');
            return svc.saveSchedule.mock.calls.at(-1)![0];
        };
        expect(await save('hourly', () => type(c, '#backup-minute', '45')))
            .toEqual({ kind: 'hourly', minute: 45, hour: 0, weekday: 0, day: 0, keep: 7, passphrase: 'a long passphrase', rev: 0 });
        expect(await save('daily', () => type(c, '#backup-time', '23:05')))
            .toEqual({ kind: 'daily', minute: 5, hour: 23, weekday: 0, day: 0, keep: 7, passphrase: 'a long passphrase', rev: 0 });
        expect(await save('weekly', () => { el<HTMLSelectElement>(c, '#backup-weekday').value = '6'; }))
            .toEqual({ kind: 'weekly', minute: 5, hour: 23, weekday: 6, day: 0, keep: 7, passphrase: 'a long passphrase', rev: 0 });
        expect(await save('monthly', () => type(c, '#backup-day', '31')))
            .toEqual({ kind: 'monthly', minute: 5, hour: 23, weekday: 0, day: 31, keep: 7, passphrase: 'a long passphrase', rev: 0 });
        expect(toastMock.showToast).toHaveBeenCalledWith('Schedule saved', 'ok');
        expect(el<HTMLInputElement>(c, '#backup-sched-pass').value).toBe('');
    });

    it('refuses a form it cannot send: no time, a number that is not whole, passphrases that differ', async () => {
        const { c } = await setup();
        const refusal = async () => {
            await click(c, '#btn-backup-save-schedule');
            return text(c, '#backup-schedule-error');
        };
        type(c, '#backup-time', '');
        expect(await refusal()).toBe('Enter a time.');
        type(c, '#backup-time', '02:00');
        type(c, '#backup-keep', '');
        expect(await refusal()).toBe('Enter whole numbers.');
        type(c, '#backup-keep', '7');
        type(c, '#backup-sched-pass', 'one');
        type(c, '#backup-sched-confirm', 'two');
        expect(await refusal()).toBe('The passphrases do not match.');
        expect(svc.saveSchedule).not.toHaveBeenCalled();
    });

    it("shows the gateway's refusal of a schedule", async () => {
        const { c } = await setup();
        svc.saveSchedule.mockResolvedValue(refused('invalid', 'A new schedule needs a passphrase.', 'passphrase'));
        await click(c, '#btn-backup-save-schedule');
        expect(text(c, '#backup-schedule-error')).toBe('A new schedule needs a passphrase.');
    });

    it('removes the schedule once confirmed', async () => {
        const { c } = await setup(WEEKLY);
        await click(c, '#btn-backup-remove-schedule');
        expect(await answer(false)).toBe('Remove the backup schedule? The saved backups stay.');
        expect(svc.removeSchedule).not.toHaveBeenCalled();
        svc.removeSchedule.mockResolvedValue({ ok: false, status: 500, code: 'store_write_failed' });
        await click(c, '#btn-backup-remove-schedule');
        await answer(true);
        expect(text(c, '#backup-schedule-error')).toBe('The gateway could not write its data files, so nothing was changed. Its log has the cause.');
        svc.removeSchedule.mockResolvedValue(ok());
        await click(c, '#btn-backup-remove-schedule');
        await answer(true);
        expect(svc.removeSchedule).toHaveBeenLastCalledWith(4);
        expect(toastMock.showToast).toHaveBeenCalledWith('Schedule removed', 'ok');
    });

    it('backs up now and reloads, whether the run worked or not', async () => {
        const { c } = await setup(WEEKLY);
        svc.runNow.mockResolvedValue(ok({ file: 'smu-backup-20261109T090000Z.json' }));
        await click(c, '#btn-backup-run');
        expect(toastMock.showToast).toHaveBeenCalledWith('Backup written: smu-backup-20261109T090000Z.json', 'ok');
        svc.runNow.mockResolvedValue({ ok: false, status: 409, code: 'backup_unavailable', reason: 'cannot write /backup/x' });
        await click(c, '#btn-backup-run');
        expect(text(c, '#backup-schedule-error')).toBe('cannot write /backup/x');
        expect(svc.status).toHaveBeenCalledTimes(3);
    });

    it('Back up now refreshes the last run and the files but keeps unsaved schedule edits, and the rev they were made against', async () => {
        const { c } = await setup(WEEKLY);
        choose(c, '#backup-kind', 'daily');
        type(c, '#backup-keep', '5');
        // Meanwhile the run wrote a file and someone else saved the schedule.
        const later = '2026-11-10T09:00:00Z';
        svc.status.mockResolvedValue(ok({
            ...WEEKLY,
            schedule: { ...WEEKLY.schedule!, keep: 30, rev: 9 },
            lastRun: { at: later, file: 'smu-backup-20261110T090000Z.json', error: '' },
        }));
        svc.runNow.mockResolvedValue(ok({ file: 'smu-backup-20261110T090000Z.json' }));
        await click(c, '#btn-backup-run');
        expect(text(c, '#backup-schedule-status')).toContain(`Last backup: smu-backup-20261110T090000Z.json, ${formatUtc(later)}.`);
        expect([el<HTMLSelectElement>(c, '#backup-kind').value, el<HTMLInputElement>(c, '#backup-keep').value]).toEqual(['daily', '5']);
        // A save of those edits still names the rev they were made against, so the gateway can answer stale.
        svc.saveSchedule.mockResolvedValue(ok({ rev: 10 }));
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls[0][0]).toMatchObject({ kind: 'daily', keep: 5, rev: 4 });
    });

    it('Reload writes the saved schedule back into the form', async () => {
        const { c } = await setup(WEEKLY);
        type(c, '#backup-keep', '5');
        await click(c, '#btn-backup-reload');
        expect(el<HTMLInputElement>(c, '#backup-keep').value).toBe('14');
    });
});

// The schedule's rev goes back with a save or a delete and the preview's basis
// with the import; when the data moved on meanwhile the admin is told.
describe('backup -- versions', () => {
    const stale = (extra: object = {}) => ({ ok: false, status: 409, code: 'stale', ...extra });
    const savePass = (c: HTMLElement) => {
        type(c, '#backup-sched-pass', 'a long passphrase');
        type(c, '#backup-sched-confirm', 'a long passphrase');
    };

    it('creates a schedule with rev 0, then updates it with the rev the answer gave', async () => {
        const { c } = await setup();
        svc.saveSchedule.mockResolvedValue(ok({ rev: 5 }));
        svc.status.mockResolvedValue(ok({ ...WEEKLY, schedule: { ...WEEKLY.schedule!, rev: 5 } }));
        savePass(c);
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls[0][0].rev).toBe(0);
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls[1][0].rev).toBe(5);
    });

    it('a refused save keeps the loaded rev for the retry', async () => {
        const { c } = await setup(WEEKLY);
        svc.saveSchedule.mockResolvedValueOnce(refused('invalid', 'keep must be 1 to 365.', 'keep')).mockResolvedValue(ok({ rev: 6 }));
        await click(c, '#btn-backup-save-schedule');
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls.map(call => call[0].rev)).toEqual([4, 4]);
    });

    it('stale schedule save: the dialog says so; Reload reloads the status and its rev', async () => {
        const { c } = await setup(WEEKLY);
        svc.saveSchedule.mockResolvedValue(stale({ rev: 9 }));
        svc.status.mockResolvedValue(ok({ ...WEEKLY, schedule: { ...WEEKLY.schedule!, keep: 30, rev: 9 } }));
        await click(c, '#btn-backup-save-schedule');
        expect(await answer(true)).toBe('This schedule was changed by someone else since you opened it.');
        expect(svc.status).toHaveBeenCalledTimes(2);
        expect(el<HTMLInputElement>(c, '#backup-keep').value).toBe('30');
        svc.saveSchedule.mockResolvedValue(ok({ rev: 10 }));
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls[1][0].rev).toBe(9);
    });

    it('stale schedule save: Cancel leaves the form as typed and reloads nothing', async () => {
        const { c } = await setup(WEEKLY);
        svc.saveSchedule.mockResolvedValue(stale({ rev: 9 }));
        type(c, '#backup-keep', '3');
        await click(c, '#btn-backup-save-schedule');
        await answer(false);
        expect(svc.status).toHaveBeenCalledTimes(1);
        expect(el<HTMLInputElement>(c, '#backup-keep').value).toBe('3');
        expect(el<HTMLButtonElement>(c, '#btn-backup-save-schedule').disabled).toBe(false);
    });

    it('save over a schedule deleted meanwhile: says so and shows the reloaded status', async () => {
        const { c } = await setup(WEEKLY);
        svc.saveSchedule.mockResolvedValue({ ok: false, status: 404, code: 'not_found' });
        svc.status.mockResolvedValue(ok(NONE));
        await click(c, '#btn-backup-save-schedule');
        expect(toastMock.showToast).toHaveBeenCalledWith('This schedule was deleted by someone else.', 'error');
        expect(text(c, '#backup-schedule-status')).toMatch(/^No schedule/);
        expect(el<HTMLButtonElement>(c, '#btn-backup-remove-schedule').disabled).toBe(true);
    });

    it('a new schedule that someone else created first: says so and shows theirs, with its rev', async () => {
        const { c } = await setup();
        svc.saveSchedule.mockResolvedValue({ ok: false, status: 409, code: 'exists' });
        svc.status.mockResolvedValue(ok(WEEKLY));
        savePass(c);
        await click(c, '#btn-backup-save-schedule');
        expect(text(c, '#backup-schedule-error')).toBe('Someone else saved a schedule since you opened this page. It is shown now; change it if you still want to.');
        expect(text(c, '#backup-schedule-status')).toContain('Weekly on Monday');
        svc.saveSchedule.mockResolvedValue(ok({ rev: 5 }));
        await click(c, '#btn-backup-save-schedule');
        expect(svc.saveSchedule.mock.calls[1][0].rev).toBe(4);
    });

    it('stale schedule delete: the dialog offers Reload; a delete of a gone schedule says so', async () => {
        const { c } = await setup(WEEKLY);
        svc.removeSchedule.mockResolvedValue(stale({ rev: 8 }));
        await click(c, '#btn-backup-remove-schedule');
        await answer(true);
        expect(await answer(true)).toBe('This schedule was changed by someone else since you opened it.');
        expect(svc.removeSchedule).toHaveBeenCalledWith(4);
        expect(svc.status).toHaveBeenCalledTimes(2);

        svc.removeSchedule.mockResolvedValue({ ok: false, status: 404, code: 'not_found' });
        svc.status.mockResolvedValue(ok(NONE));
        await click(c, '#btn-backup-remove-schedule');
        await answer(true);
        expect(toastMock.showToast).toHaveBeenCalledWith('This schedule was deleted by someone else.', 'error');
        expect(svc.status).toHaveBeenCalledTimes(3);
    });

    describe('import basis', () => {
        async function previewed() {
            const s = await setup();
            await pick(s.c, new File(['{"format":"smu-backup"}'], 'mine.json'));
            type(s.c, '#backup-import-pass', 'the passphrase!');
            svc.preview.mockResolvedValue(ok(PREVIEW));
            await click(s.c, '#btn-backup-preview');
            return s;
        }

        it('sends the preview basis back untouched with the import', async () => {
            const { c } = await previewed();
            choose(c, '#backup-choice-users', 'merge');
            svc.importFile.mockResolvedValue(ok({ signedOut: false }));
            await click(c, '#btn-backup-import');
            await answer(true);
            expect(svc.importFile.mock.calls[0][3]).toBe(PREVIEW.basis);
        });

        it('stale import: asks for a new preview, clears the old one, keeps the file and passphrase', async () => {
            const { c } = await previewed();
            choose(c, '#backup-choice-users', 'replace');
            svc.importFile.mockResolvedValue(stale({ basis: { users: 4, connections: 2, settings: 'cfg-2' } }));
            await click(c, '#btn-backup-import');
            await answer(true);
            expect(text(c, '#backup-import-error')).toBe("The gateway's data changed since the preview. Run the preview again.");
            expect(hidden(c, '#backup-preview')).toBe(true);
            expect(hidden(c, '#backup-import-source')).toBe(false);
            expect(el<HTMLInputElement>(c, '#backup-import-pass').value).toBe('the passphrase!');
            expect(toastMock.showToast).not.toHaveBeenCalled();

            const fresh = { ...PREVIEW, basis: { users: 4, connections: 2, settings: 'cfg-2' } };
            svc.preview.mockResolvedValue(ok(fresh));
            await click(c, '#btn-backup-preview');
            choose(c, '#backup-choice-users', 'replace');
            svc.importFile.mockResolvedValue(ok({ signedOut: false }));
            await click(c, '#btn-backup-import');
            await answer(true);
            expect(svc.importFile.mock.calls[1][3]).toBe(fresh.basis);
        });
    });
});
