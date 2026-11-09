/**
 * Backup & Restore Module (managed/RBAC variant, admin-only).
 *
 * Exports the gateway's configuration (users, connections, settings) as a
 * passphrase-encrypted file, previews and imports one section by section,
 * and manages the scheduled backups the gateway writes into its backup
 * directory (go-web-proxy/backup.go, backup_api.go). Ships in the standalone
 * `/solAdmin` app and the Provisioned demo; the id maps to `'admin'` in
 * rbac.ts's MODULE_REQUIREMENTS, and it is never in the module catalog.
 *
 * The page holds no passphrase: each action sends the one typed for it, and
 * the fields are cleared after it succeeds. Preview and import send the file
 * (or a saved backup's name) each time. Imports only from `src/core/*` and
 * its own service.
 */
import { required } from '../../core/dom';
import { createGate } from '../../core/components/module-gate';
import { downloadBlob } from '../../core/download';
import { iconButton } from '../../core/icons';
import { logger } from '../../core/logger';
import { showToast } from '../../core/toast';
import { formatBytes } from '../../core/utils';
import { reportManagedFailure, SIGNED_OUT_TOAST_MS } from '../../core/services/managed-api';
import {
    createBackupService, type BackupSchedule, type BackupStatus, type ImportPreview, type ImportSource,
    type NameDiff, type ScheduleKind, type SectionChoice,
} from './service';
import type { AppContext } from '../../core/types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A file larger than the gateway's import cap is not a backup; refused before it is sent. */
export const MAX_IMPORT_BYTES = 8 << 20;

const RESTORE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';

const pad = (n: number) => String(n).padStart(2, '0');

/** A schedule in words: "Weekly on Monday at 02:15 UTC". */
export function describeSchedule(s: BackupSchedule): string {
    const at = `${pad(s.hour)}:${pad(s.minute)} UTC`;
    switch (s.kind) {
        case 'hourly': return `Hourly at ${pad(s.minute)} minutes past the hour`;
        case 'daily': return `Daily at ${at}`;
        case 'weekly': return `Weekly on ${WEEKDAYS[s.weekday]} at ${at}`;
        default: return `Monthly on day ${s.day} at ${at}`;
    }
}

/** An RFC 3339 UTC time as the page shows it: "2026-11-09 02:00 UTC". */
export function formatUtc(iso: string): string {
    return iso.replace('T', ' ').replace(/:\d{2}Z$/, ' UTC');
}

/** One section's preview: what it adds, changes and, under Replace, removes. */
export function diffLines(d: NameDiff, removedNote: string): string[] {
    const lines: string[] = [];
    if (d.added.length) lines.push(`Add: ${d.added.join(', ')}`);
    if (d.changed.length) lines.push(`Change: ${d.changed.join(', ')}`);
    if (d.removed.length) lines.push(`${removedNote}: ${d.removed.join(', ')}`);
    return lines.length ? lines : ['No change.'];
}

export const BackupModule = {
    name: 'Backup & Restore',
    id: 'backup',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>',

    async install(app: AppContext) {
        const { container, appState, eventBus } = app;
        const q = <T extends HTMLElement>(sel: string) => required<T>(container, sel);
        const els = {
            view: q<HTMLElement>('#backup-view'),
            btnReload: q<HTMLButtonElement>('#btn-backup-reload'),
            error: q<HTMLElement>('#backup-error'),
            exportPass: q<HTMLInputElement>('#backup-export-pass'),
            exportConfirm: q<HTMLInputElement>('#backup-export-confirm'),
            exportError: q<HTMLElement>('#backup-export-error'),
            btnExport: q<HTMLButtonElement>('#btn-backup-export'),
            importFile: q<HTMLInputElement>('#backup-import-file'),
            importSource: q<HTMLElement>('#backup-import-source'),
            importPass: q<HTMLInputElement>('#backup-import-pass'),
            importError: q<HTMLElement>('#backup-import-error'),
            btnPreview: q<HTMLButtonElement>('#btn-backup-preview'),
            preview: q<HTMLElement>('#backup-preview'),
            previewMeta: q<HTMLElement>('#backup-preview-meta'),
            choiceUsers: q<HTMLSelectElement>('#backup-choice-users'),
            choiceConns: q<HTMLSelectElement>('#backup-choice-connections'),
            choiceSettings: q<HTMLSelectElement>('#backup-choice-settings'),
            diffUsers: q<HTMLElement>('#backup-diff-users'),
            diffConns: q<HTMLElement>('#backup-diff-connections'),
            diffSettings: q<HTMLElement>('#backup-diff-settings'),
            signout: q<HTMLElement>('#backup-signout'),
            btnImport: q<HTMLButtonElement>('#btn-backup-import'),
            dirProblem: q<HTMLElement>('#backup-dir-problem'),
            scheduleStatus: q<HTMLElement>('#backup-schedule-status'),
            kind: q<HTMLSelectElement>('#backup-kind'),
            weekday: q<HTMLSelectElement>('#backup-weekday'),
            day: q<HTMLInputElement>('#backup-day'),
            time: q<HTMLInputElement>('#backup-time'),
            minute: q<HTMLInputElement>('#backup-minute'),
            keep: q<HTMLInputElement>('#backup-keep'),
            schedPass: q<HTMLInputElement>('#backup-sched-pass'),
            schedConfirm: q<HTMLInputElement>('#backup-sched-confirm'),
            schedPassHint: q<HTMLElement>('#backup-sched-pass-hint'),
            scheduleError: q<HTMLElement>('#backup-schedule-error'),
            btnSaveSchedule: q<HTMLButtonElement>('#btn-backup-save-schedule'),
            btnRun: q<HTMLButtonElement>('#btn-backup-run'),
            btnRemoveSchedule: q<HTMLButtonElement>('#btn-backup-remove-schedule'),
            rows: q<HTMLElement>('#backup-rows'),
        };

        const service = createBackupService();
        const gate = createGate(container, {
            id: 'backup-gate',
            title: 'Administrator Sign-in Required',
            message: 'Sign in as an administrator to back up or restore the gateway configuration.',
        });

        /** What Preview and Import send: an uploaded file's content or a saved backup's name. */
        let source: ImportSource | null = null;
        /** The last preview's sign-out flags, for the warning under the users choice. */
        let signsOut: ImportPreview['signsOutCaller'] = { replace: false, merge: false };

        function setError(el: HTMLElement, msg: string | null): void {
            el.textContent = msg ?? '';
            el.classList.toggle('hidden', !msg);
        }

        const fail = (el: HTMLElement) => (msg: string) => setError(el, msg);

        // ---- status: the schedule, the directory, the saved backups ----

        function showKindFields(): void {
            const kind = els.kind.value;
            container.querySelectorAll<HTMLElement>('[data-kinds]').forEach(group => {
                group.classList.toggle('hidden', !(group.dataset.kinds as string).split(' ').includes(kind));
            });
        }

        function renderStatus(st: BackupStatus): void {
            const s = st.schedule;
            const lines: string[] = [];
            if (s) {
                lines.push(`${describeSchedule(s)}; keeps the last ${s.keep}.`);
                lines.push(`Next backup: ${formatUtc(st.nextRun as string)}.`);
                els.kind.value = s.kind;
                els.weekday.value = String(s.weekday);
                els.day.value = String(s.day || 1);
                els.time.value = `${pad(s.hour)}:${pad(s.minute)}`;
                els.minute.value = String(s.minute);
                els.keep.value = String(s.keep);
            } else {
                lines.push('No schedule: the gateway writes no backups until you save one.');
            }
            const last = st.lastRun;
            if (last) {
                lines.push(last.error
                    ? `Last backup, ${formatUtc(last.at)}, failed: ${last.error}`
                    : `Last backup: ${last.file}, ${formatUtc(last.at)}.`);
            }
            els.scheduleStatus.textContent = lines.join(' ');
            els.schedPassHint.textContent = s
                ? 'Leave blank to keep the current passphrase.'
                : 'Required: every scheduled backup is encrypted with it.';
            els.btnRun.disabled = !s;
            els.btnRemoveSchedule.disabled = !s;
            els.dirProblem.textContent = st.dirProblem;
            els.dirProblem.classList.toggle('hidden', !st.dirProblem);
            showKindFields();
            renderFiles(st);
        }

        function renderFiles(st: BackupStatus): void {
            els.rows.replaceChildren();
            if (!st.files.length) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 4;
                td.className = 'text-secondary';
                td.textContent = st.dirProblem ? 'The backup directory cannot be read.' : 'No saved backups yet.';
                tr.appendChild(td);
                els.rows.appendChild(tr);
                return;
            }
            for (const f of st.files) {
                const tr = document.createElement('tr');
                for (const text of [f.name, formatUtc(f.created), formatBytes(f.size)]) {
                    const td = document.createElement('td');
                    td.textContent = text;
                    tr.appendChild(td);
                }
                const actions = document.createElement('td');
                actions.className = 'backup-actions-col';
                actions.appendChild(iconButton(RESTORE_ICON, `Restore "${f.name}"`, 'backup-restore', () => chooseSaved(f.name)));
                tr.appendChild(actions);
                els.rows.appendChild(tr);
            }
        }

        async function load(): Promise<void> {
            setError(els.error, null);
            const res = await service.status();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.error));
                return;
            }
            renderStatus(res.data);
        }

        // ---- export ----

        async function exportFile(): Promise<void> {
            setError(els.exportError, null);
            if (els.exportPass.value !== els.exportConfirm.value) {
                setError(els.exportError, 'The passphrases do not match.');
                return;
            }
            els.btnExport.disabled = true;
            const res = await service.exportFile(els.exportPass.value);
            els.btnExport.disabled = false;
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.exportError));
                return;
            }
            downloadBlob(new Blob([res.data.content], { type: 'application/json' }), res.data.filename);
            els.exportPass.value = '';
            els.exportConfirm.value = '';
            showToast(`Exported ${res.data.filename}`, 'ok');
        }

        // ---- import ----

        function setSource(next: ImportSource | null, label: string): void {
            source = next;
            els.importSource.textContent = label;
            els.importSource.classList.toggle('hidden', !label);
            els.preview.classList.add('hidden');
            setError(els.importError, null);
        }

        async function pickFile(): Promise<void> {
            const file = els.importFile.files?.[0];
            if (!file) {
                setSource(null, '');
                return;
            }
            if (file.size > MAX_IMPORT_BYTES) {
                setSource(null, '');
                setError(els.importError, `${file.name} is larger than 8 MiB, so it is not a backup.`);
                return;
            }
            setSource({ file: await file.text() }, `File: ${file.name}`);
        }

        function chooseSaved(name: string): void {
            els.importFile.value = '';
            setSource({ backup: name }, `Saved backup: ${name}`);
            els.importPass.focus();
        }

        function fillDiff(list: HTMLElement, lines: string[]): void {
            list.replaceChildren();
            for (const line of lines) {
                const li = document.createElement('li');
                li.textContent = line;
                list.appendChild(li);
            }
        }

        function showSignOutWarning(): void {
            const users = els.choiceUsers.value as SectionChoice;
            const warn = (users === 'replace' && signsOut.replace) || (users === 'merge' && signsOut.merge);
            els.signout.classList.toggle('hidden', !warn);
        }

        async function preview(): Promise<void> {
            setError(els.importError, null);
            if (!source) {
                setError(els.importError, 'Choose a backup file, or a saved backup below.');
                return;
            }
            els.btnPreview.disabled = true;
            const res = await service.preview(source, els.importPass.value);
            els.btnPreview.disabled = false;
            if (!res.ok) {
                els.preview.classList.add('hidden');
                reportManagedFailure(res, eventBus, fail(els.importError));
                return;
            }
            const p = res.data;
            els.previewMeta.textContent = `Backup made ${formatUtc(p.created)} by gateway ${p.gateway}. Choose what to import:`;
            fillDiff(els.diffUsers, diffLines(p.users, 'Remove (Replace only)'));
            fillDiff(els.diffConns, diffLines(p.connections, 'Remove (Replace only)'));
            fillDiff(els.diffSettings, p.settings.length ? [`Change: ${p.settings.join(', ')}`] : ['No change.']);
            for (const sel of [els.choiceUsers, els.choiceConns, els.choiceSettings]) sel.value = 'skip';
            signsOut = p.signsOutCaller;
            showSignOutWarning();
            els.preview.classList.remove('hidden');
        }

        async function importFile(): Promise<void> {
            setError(els.importError, null);
            const choices = {
                users: els.choiceUsers.value as SectionChoice,
                connections: els.choiceConns.value as SectionChoice,
                settings: els.choiceSettings.value as 'replace' | 'skip',
            };
            const chosen = Object.entries(choices).filter(([, v]) => v !== 'skip').map(([k, v]) => `${k} (${v})`);
            if (chosen.length && !confirm(`Import ${chosen.join(', ')} from this backup? The gateway applies it at once.`)) return;
            els.btnImport.disabled = true;
            const res = await service.importFile(source as ImportSource, els.importPass.value, choices);
            els.btnImport.disabled = false;
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.importError));
                return;
            }
            if (res.data.signedOut) {
                showToast('Imported. Your own account changed: sign in again.', 'ok', SIGNED_OUT_TOAST_MS);
                eventBus.emit('rbac:sign-out-requested');
                return;
            }
            const restart = res.data.restartRequired;
            showToast(restart.length ? `Imported. Restart the gateway to apply: ${restart.join(', ')}.` : 'Imported', 'ok');
            els.importFile.value = '';
            els.importPass.value = '';
            setSource(null, '');
            await load();
        }

        // ---- schedule ----

        /** The form as a schedule, or the reason it cannot be sent. */
        function collectSchedule(): (BackupSchedule & { keep: number; passphrase: string }) | string {
            const kind = els.kind.value as ScheduleKind;
            const whole = (input: HTMLInputElement) => (input.value.trim() === '' ? NaN : Number(input.value));
            const s: BackupSchedule = { kind, minute: 0, hour: 0, weekday: 0, day: 0 };
            if (kind === 'hourly') {
                s.minute = whole(els.minute);
            } else {
                const m = /^(\d{2}):(\d{2})$/.exec(els.time.value);
                if (!m) return 'Enter a time.';
                s.hour = Number(m[1]);
                s.minute = Number(m[2]);
            }
            if (kind === 'weekly') s.weekday = Number(els.weekday.value);
            if (kind === 'monthly') s.day = whole(els.day);
            const keep = whole(els.keep);
            if (![s.minute, s.day, keep].every(Number.isInteger)) return 'Enter whole numbers.';
            if (els.schedPass.value !== els.schedConfirm.value) return 'The passphrases do not match.';
            return { ...s, keep, passphrase: els.schedPass.value };
        }

        async function saveSchedule(): Promise<void> {
            setError(els.scheduleError, null);
            const body = collectSchedule();
            if (typeof body === 'string') {
                setError(els.scheduleError, body);
                return;
            }
            els.btnSaveSchedule.disabled = true;
            const res = await service.saveSchedule(body);
            els.btnSaveSchedule.disabled = false;
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.scheduleError));
                return;
            }
            els.schedPass.value = '';
            els.schedConfirm.value = '';
            showToast('Schedule saved', 'ok');
            await load();
        }

        async function removeSchedule(): Promise<void> {
            setError(els.scheduleError, null);
            if (!confirm('Remove the backup schedule? The saved backups stay.')) return;
            const res = await service.removeSchedule();
            if (!res.ok) {
                reportManagedFailure(res, eventBus, fail(els.scheduleError));
                return;
            }
            showToast('Schedule removed', 'ok');
            await load();
        }

        async function runNow(): Promise<void> {
            setError(els.scheduleError, null);
            els.btnRun.disabled = true;
            const res = await service.runNow();
            els.btnRun.disabled = false;
            if (res.ok) showToast(`Backup written: ${res.data.file}`, 'ok');
            else reportManagedFailure(res, eventBus, fail(els.scheduleError));
            await load(); // the last run, failed or not, and the files
        }

        // Admin sessions only, like the other admin modules. Called at install
        // and on every rbac:changed.
        function applyGate(): void {
            if (!appState.managed?.admin) {
                els.view.classList.add('hidden');
                gate.show();
                return;
            }
            gate.hide();
            els.view.classList.remove('hidden');
            void load();
        }

        els.btnReload.addEventListener('click', () => void load());
        els.btnExport.addEventListener('click', () => void exportFile());
        els.importFile.addEventListener('change', () => void pickFile());
        els.btnPreview.addEventListener('click', () => void preview());
        els.choiceUsers.addEventListener('change', showSignOutWarning);
        els.btnImport.addEventListener('click', () => void importFile());
        els.kind.addEventListener('change', showKindFields);
        els.btnSaveSchedule.addEventListener('click', () => void saveSchedule());
        els.btnRemoveSchedule.addEventListener('click', () => void removeSchedule());
        els.btnRun.addEventListener('click', () => void runNow());
        eventBus.on('rbac:changed', () => applyGate());

        showKindFields();
        applyGate();
        logger.info('Backup Module Setup Complete');
    },
};
