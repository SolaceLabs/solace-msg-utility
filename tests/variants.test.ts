import { describe, it, expect } from 'vitest';
import { ACTIVE_MODULES as FULL_VARIANT } from '../src/variants/full';
import { ACTIVE_MODULES as MIN_VARIANT } from '../src/variants/min';
import { ACTIVE_MODULES as ACTIVE_VARIANT } from '../src/variants/_active';

/**
 * Each variant manifest is a flat record of `{ moduleId: priority }`. Loading
 * each at least once locks in the shape and gives v8 a chance to instrument
 * the constant declarations. The `_active` variant re-exports whatever the
 * default build picks (currently `./full`), so it transitively covers that
 * file too.
 */
describe('variants', () => {
    it('full variant lists the four shipped modules at non-overlapping priorities', () => {
        const ids = Object.keys(FULL_VARIANT);
        expect(ids).toEqual(expect.arrayContaining([
            'connections',
            'queue-browser',
            'queue-copy',
            'queue-subscription-explorer',
        ]));
        const priorities = Object.values(FULL_VARIANT);
        expect(new Set(priorities).size).toBe(priorities.length);
        priorities.forEach(p => expect(Number.isFinite(p)).toBe(true));
    });

    it('min variant ships only connections + queue-browser', () => {
        // Locks the slim demo build's contents — adding a module here without
        // intent would surface in this assertion before reaching prod.
        expect(Object.keys(MIN_VARIANT).sort()).toEqual(['connections', 'queue-browser']);
        expect(MIN_VARIANT['connections']).toBeGreaterThan(MIN_VARIANT['queue-browser']);
    });

    it('_active re-exports a populated manifest', () => {
        expect(Object.keys(ACTIVE_VARIANT).length).toBeGreaterThan(0);
    });
});
