import { describe, it, expect } from 'vitest';
import { ACTIVE_MODULES as STANDARD_VARIANT } from '../src/variants/standard';
import { ACTIVE_MODULES as MIN_VARIANT } from '../src/variants/min';
import { ACTIVE_MODULES as NO_QUEUE_COPY_VARIANT } from '../src/variants/no-queue-copy';
import { ACTIVE_MODULES as ADMIN_VARIANT } from '../src/variants/admin';
import { ACTIVE_MODULES as ALL_VARIANT } from '../src/variants/all-for-testing-only';
import { ACTIVE_MODULES as ACTIVE_VARIANT } from '../src/variants/_active';

/**
 * Each variant manifest is a flat record of `{ moduleId: priority }`. Loading
 * each at least once locks in the shape and gives v8 a chance to instrument
 * the constant declarations. The `_active` variant re-exports whatever the
 * default build picks (currently `./standard`), so it transitively covers that
 * file too.
 */
describe('variants', () => {
    it('standard variant lists the four shipped modules at non-overlapping priorities', () => {
        const ids = Object.keys(STANDARD_VARIANT);
        expect(ids).toEqual(expect.arrayContaining([
            'connections',
            'queue-browser',
            'queue-copy',
            'queue-subscription-explorer',
        ]));
        const priorities = Object.values(STANDARD_VARIANT);
        expect(new Set(priorities).size).toBe(priorities.length);
        priorities.forEach(p => expect(Number.isFinite(p)).toBe(true));
    });

    it('min variant ships only connections + queue-browser', () => {
        // Locks the slim demo build's contents — adding a module here without
        // intent would surface in this assertion before reaching prod.
        expect(Object.keys(MIN_VARIANT).sort()).toEqual(['connections', 'queue-browser']);
        expect(MIN_VARIANT['connections']).toBeGreaterThan(MIN_VARIANT['queue-browser']);
    });

    it('no-queue-copy variant ships everything except queue-copy', () => {
        // Locks the "standard minus Queue Copy" build's contents — the whole point
        // of this variant is that queue-copy never appears, so assert that
        // directly. The other three modules should match the standard variant.
        expect(Object.keys(NO_QUEUE_COPY_VARIANT).sort()).toEqual([
            'connections',
            'queue-browser',
            'queue-subscription-explorer',
        ]);
        expect(NO_QUEUE_COPY_VARIANT).not.toHaveProperty('queue-copy');
    });

    it('no shipping variant carries the admin modules — they live at /solAdmin', () => {
        // The entitlement editors moved to their own app, so an everyday bundle
        // must not carry them even hidden: the surface should not exist.
        [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT].forEach((v) => {
            expect(Object.keys(v)).not.toContain('user-management');
            expect(Object.keys(v)).not.toContain('connection-management');
            expect(Object.keys(v)).not.toContain('admin-login');
        });
    });

    it('admin variant ships the login plus both editors, and no messaging modules', () => {
        // admin-login authenticates but opens no broker connection, so there is
        // nothing for the messaging modules to attach to.
        expect(Object.keys(ADMIN_VARIANT).sort()).toEqual([
            'admin-login',
            'connection-management',
            'user-management',
        ]);
        expect(ADMIN_VARIANT['admin-login']).toBeGreaterThan(ADMIN_VARIANT['user-management']);
        expect(ADMIN_VARIANT['user-management']).toBeGreaterThan(ADMIN_VARIANT['connection-management']);
    });

    it('all variant ships the all modules for visual testing purpose', () => {
        // Kitchen-sink build. `connections` covers both connection modes, so no
        // separate managed connection module appears here either.
        expect(Object.keys(ALL_VARIANT).sort()).toEqual([
            'admin-login',
            'connection-management',
            'connections',
            'queue-browser',
            'queue-copy',
            'queue-subscription-explorer',
            'user-management',
        ]);
    });

    it('no variant ships a separate managed connection module', () => {
        // Both connection modes live in the one `connections` module; which tabs
        // it offers is decided at runtime from /hosted, not by the variant. There
        // is therefore no `managed` variant either — a managed deployment ships
        // the standard bundle and switches posture through CONN_MODES.
        [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT, ALL_VARIANT].forEach((v) => {
            expect(Object.keys(v)).not.toContain('managed-connections');
        });
    });

    it('_active re-exports a populated manifest', () => {
        expect(Object.keys(ACTIVE_VARIANT).length).toBeGreaterThan(0);
    });
});
