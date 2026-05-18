/**
 * Numeric severity ordering — a log call fires when `currentLevel <= callLevel`.
 * SILENT is higher than every real call's level, so it suppresses all output.
 */
export enum LogLevel {
    DEBUG  = 0,
    INFO   = 1,
    WARN   = 2,
    ERROR  = 3,
    SILENT = 4,
}

export const DEFAULT_LOG_LEVEL: LogLevel = LogLevel.INFO;
