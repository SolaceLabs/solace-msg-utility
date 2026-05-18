/**
 * Level-aware logger. Drop-in replacement for `console.*`:
 *
 *     import { logger } from './core/logger';
 *     logger.info('[Kernel] Starting');
 *
 * The current level is a module-scoped variable, set once at boot by the
 * Kernel after parsing the `?logLevel=…` URL parameter. Defaults to
 * `DEFAULT_LOG_LEVEL` from `./constants`.
 *
 * Each method delegates to the matching `console.*` channel so DevTools'
 * severity filtering, source line, and object-expansion all work, and so
 * existing `vi.spyOn(console, 'warn')` test instrumentation keeps working.
 */
import { LogLevel, DEFAULT_LOG_LEVEL } from './constants';

let currentLevel: LogLevel = DEFAULT_LOG_LEVEL;

export const logger = {
    debug: (...args: unknown[]): void => {
        if (currentLevel <= LogLevel.DEBUG) console.debug(...args);
    },
    info: (...args: unknown[]): void => {
        if (currentLevel <= LogLevel.INFO) console.info(...args);
    },
    warn: (...args: unknown[]): void => {
        if (currentLevel <= LogLevel.WARN) console.warn(...args);
    },
    error: (...args: unknown[]): void => {
        if (currentLevel <= LogLevel.ERROR) console.error(...args);
    },
};

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

export function getLogLevel(): LogLevel {
    return currentLevel;
}

/**
 * Case-insensitive enum lookup. Returns `null` for unknown / empty input so
 * callers can decide on a fallback. Rejects numeric strings ('0', '1') to keep
 * the URL surface tidy — only the enum names are accepted.
 */
export function parseLogLevel(raw: string | null | undefined): LogLevel | null {
    if (!raw) return null;
    const key = raw.toUpperCase();
    if (!(key in LogLevel)) return null;
    const value = LogLevel[key as keyof typeof LogLevel];
    return typeof value === 'number' ? value : null;
}

/**
 * Reads `?logLevel=…` from a URL search string. Returns `null` if absent or
 * invalid — caller stays at the default in that case.
 */
export function readLogLevelFromUrl(search: string = window.location.search): LogLevel | null {
    const params = new URLSearchParams(search);
    return parseLogLevel(params.get('logLevel'));
}
