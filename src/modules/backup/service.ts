/**
 * Backup & Restore service -- the gateway's `/managed/backup*` API
 * (go-web-proxy/backup_api.go), authenticated by the session cookie (see
 * `src/core/services/managed-api.ts`).
 */
import { managedRequest } from '../../core/services/managed-api';

export type ScheduleKind = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** When scheduled backups run, in UTC. A field the kind does not use is 0. */
export interface BackupSchedule {
    kind: ScheduleKind;
    minute: number;
    hour: number;
    /** 0 (Sunday) to 6: weekly only. */
    weekday: number;
    /** 1 to 31: monthly only; a shorter month runs on its last day. */
    day: number;
}

export interface BackupFile {
    name: string;
    size: number;
    /** RFC 3339, UTC. */
    created: string;
}

/** The GET /managed/backup body. */
export interface BackupStatus {
    schedule: (BackupSchedule & { keep: number }) | null;
    nextRun: string | null;
    lastRun: { at: string; file: string; error: string } | null;
    /** Why the gateway cannot write to its backup directory; "" when it can. */
    dirProblem: string;
    /** Newest first. */
    files: BackupFile[];
}

export interface NameDiff {
    added: string[];
    changed: string[];
    removed: string[];
}

/** The POST /managed/backup/preview body. */
export interface ImportPreview {
    created: string;
    gateway: string;
    users: NameDiff;
    connections: NameDiff;
    /** Settings keys an import would change. */
    settings: string[];
    /** Whether importing the users that way ends the requester's own session. */
    signsOutCaller: { replace: boolean; merge: boolean };
}

/** A file to import: its content, or the name of a saved backup. */
export type ImportSource = { file: string } | { backup: string };

export type SectionChoice = 'replace' | 'merge' | 'skip';

export interface ImportChoices {
    users: SectionChoice;
    connections: SectionChoice;
    settings: 'replace' | 'skip';
}

export interface ImportResult {
    restartRequired: string[];
    signedOut: boolean;
}

export function createBackupService() {
    return {
        status: () => managedRequest<BackupStatus>('GET', '/managed/backup'),
        /** `passphrase` "" keeps the current schedule's. */
        saveSchedule: (s: BackupSchedule & { keep: number; passphrase: string }) => managedRequest('PUT', '/managed/backup/schedule', s),
        removeSchedule: () => managedRequest('DELETE', '/managed/backup/schedule'),
        runNow: () => managedRequest<{ file: string }>('POST', '/managed/backup/run'),
        exportFile: (passphrase: string) => managedRequest<{ filename: string; content: string }>('POST', '/managed/backup/export', { passphrase }),
        preview: (source: ImportSource, passphrase: string) => managedRequest<ImportPreview>('POST', '/managed/backup/preview', { ...source, passphrase }),
        importFile: (source: ImportSource, passphrase: string, choices: ImportChoices) =>
            managedRequest<ImportResult>('POST', '/managed/backup/import', { ...source, passphrase, ...choices }),
    };
}

export type BackupService = ReturnType<typeof createBackupService>;
