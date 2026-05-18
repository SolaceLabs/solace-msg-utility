import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    logger,
    setLogLevel,
    getLogLevel,
    parseLogLevel,
    readLogLevelFromUrl,
} from '../../src/core/logger';
import { LogLevel, DEFAULT_LOG_LEVEL } from '../../src/core/constants';

describe('logger', () => {
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        infoSpy  = vi.spyOn(console, 'info').mockImplementation(() => {});
        warnSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        setLogLevel(DEFAULT_LOG_LEVEL);
    });

    afterEach(() => {
        setLogLevel(DEFAULT_LOG_LEVEL);
        vi.restoreAllMocks();
    });

    describe('constants & round-trip', () => {
        it('defaults to INFO', () => {
            expect(DEFAULT_LOG_LEVEL).toBe(LogLevel.INFO);
            expect(getLogLevel()).toBe(LogLevel.INFO);
        });

        it('setLogLevel/getLogLevel round-trip for every level', () => {
            for (const level of [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.SILENT]) {
                setLogLevel(level);
                expect(getLogLevel()).toBe(level);
            }
        });
    });

    describe('delegation to console.*', () => {
        it('logger.debug calls console.debug with all args', () => {
            setLogLevel(LogLevel.DEBUG);
            logger.debug('a', 1, { x: true });
            expect(debugSpy).toHaveBeenCalledWith('a', 1, { x: true });
        });

        it('logger.info calls console.info with all args', () => {
            logger.info('hello', 42);
            expect(infoSpy).toHaveBeenCalledWith('hello', 42);
        });

        it('logger.warn calls console.warn with all args', () => {
            logger.warn('oops');
            expect(warnSpy).toHaveBeenCalledWith('oops');
        });

        it('logger.error calls console.error with all args', () => {
            const err = new Error('boom');
            logger.error('failed:', err);
            expect(errorSpy).toHaveBeenCalledWith('failed:', err);
        });
    });

    describe('level filtering', () => {
        it('at DEBUG, all four methods emit', () => {
            setLogLevel(LogLevel.DEBUG);
            logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
            expect(debugSpy).toHaveBeenCalledTimes(1);
            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('at INFO, debug is suppressed but info/warn/error emit', () => {
            setLogLevel(LogLevel.INFO);
            logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
            expect(debugSpy).not.toHaveBeenCalled();
            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('at WARN, debug and info are suppressed', () => {
            setLogLevel(LogLevel.WARN);
            logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
            expect(debugSpy).not.toHaveBeenCalled();
            expect(infoSpy).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('at ERROR, only error emits', () => {
            setLogLevel(LogLevel.ERROR);
            logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
            expect(debugSpy).not.toHaveBeenCalled();
            expect(infoSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('at SILENT, nothing emits', () => {
            setLogLevel(LogLevel.SILENT);
            logger.debug('d'); logger.info('i'); logger.warn('w'); logger.error('e');
            expect(debugSpy).not.toHaveBeenCalled();
            expect(infoSpy).not.toHaveBeenCalled();
            expect(warnSpy).not.toHaveBeenCalled();
            expect(errorSpy).not.toHaveBeenCalled();
        });
    });

    describe('parseLogLevel', () => {
        it('accepts uppercase', () => {
            expect(parseLogLevel('DEBUG')).toBe(LogLevel.DEBUG);
            expect(parseLogLevel('INFO')).toBe(LogLevel.INFO);
            expect(parseLogLevel('WARN')).toBe(LogLevel.WARN);
            expect(parseLogLevel('ERROR')).toBe(LogLevel.ERROR);
            expect(parseLogLevel('SILENT')).toBe(LogLevel.SILENT);
        });

        it('accepts lowercase', () => {
            expect(parseLogLevel('debug')).toBe(LogLevel.DEBUG);
            expect(parseLogLevel('silent')).toBe(LogLevel.SILENT);
        });

        it('accepts mixed case', () => {
            expect(parseLogLevel('Debug')).toBe(LogLevel.DEBUG);
            expect(parseLogLevel('iNfO')).toBe(LogLevel.INFO);
        });

        it('returns null for unknown enum names', () => {
            expect(parseLogLevel('verbose')).toBeNull();
            expect(parseLogLevel('trace')).toBeNull();
            expect(parseLogLevel('garbage')).toBeNull();
        });

        it('returns null for empty/null/undefined', () => {
            expect(parseLogLevel('')).toBeNull();
            expect(parseLogLevel(null)).toBeNull();
            expect(parseLogLevel(undefined)).toBeNull();
        });

        it('rejects numeric strings (only enum names are accepted)', () => {
            expect(parseLogLevel('0')).toBeNull();
            expect(parseLogLevel('1')).toBeNull();
            expect(parseLogLevel('4')).toBeNull();
        });
    });

    describe('readLogLevelFromUrl', () => {
        it('parses a valid ?logLevel param', () => {
            expect(readLogLevelFromUrl('?logLevel=DEBUG')).toBe(LogLevel.DEBUG);
            expect(readLogLevelFromUrl('?logLevel=warn')).toBe(LogLevel.WARN);
        });

        it('returns null when param is absent', () => {
            expect(readLogLevelFromUrl('')).toBeNull();
            expect(readLogLevelFromUrl('?other=1')).toBeNull();
        });

        it('returns null for invalid values', () => {
            expect(readLogLevelFromUrl('?logLevel=verbose')).toBeNull();
            expect(readLogLevelFromUrl('?logLevel=')).toBeNull();
        });

        it('honours additional params alongside logLevel', () => {
            expect(readLogLevelFromUrl('?foo=bar&logLevel=ERROR&baz=1')).toBe(LogLevel.ERROR);
        });

        it('defaults search arg to window.location.search', () => {
            // jsdom default: location.search is ''
            expect(readLogLevelFromUrl()).toBeNull();
        });
    });
});
