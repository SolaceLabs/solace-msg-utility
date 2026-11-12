import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isModuleVisible } from '../src/core/rbac';
import { moduleLabel } from '../src/core/utils';
import { QueueBrowserModule } from '../src/modules/queue-browser/module';
import { QueueCopyModule } from '../src/modules/queue-copy/module';
import { QueueSubscriptionExplorerModule } from '../src/modules/queue-subscription-explorer/module';
import { ACTIVE_MODULES as STANDARD_VARIANT } from '../src/variants/standard';
import { ACTIVE_MODULES as MIN_VARIANT } from '../src/variants/min';
import { ACTIVE_MODULES as NO_QUEUE_COPY_VARIANT } from '../src/variants/no-queue-copy';
import { ACTIVE_MODULES as ADMIN_VARIANT } from '../src/variants/admin';
import { ACTIVE_MODULES as ALL_VARIANT, MODULE_ENTRIES as ALL_ENTRIES } from '../src/variants/all-for-testing-only';
import { ACTIVE_MODULES as MANAGED_VARIANT, MODULE_ENTRIES as MANAGED_ENTRIES } from '../src/variants/managed';
import { ACTIVE_MODULES as DEMO_VARIANT, MODULE_ENTRIES as DEMO_ENTRIES } from '../src/variants/managed-demo';
import { ACTIVE_MODULES as ACTIVE_VARIANT } from '../src/variants/_active';
import * as standardManifest from '../src/variants/standard';
import * as minManifest from '../src/variants/min';
import * as noQueueCopyManifest from '../src/variants/no-queue-copy';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each variant manifest is a flat record of `{ moduleId: priority }`. Loading
 * each at least once locks in the shape and gives v8 a chance to instrument
 * the constant declarations. The `_active` variant re-exports whatever the
 * default build picks (currently `./standard`), so it transitively covers that
 * file too.
 */
describe('variants', () => {
    it('standard variant lists exactly the four shipped modules at non-overlapping priorities', () => {
        expect(Object.keys(STANDARD_VARIANT).sort()).toEqual([
            'connections',
            'queue-browser',
            'queue-copy',
            'queue-subscription-explorer',
        ]);
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
        // must not carry them even hidden: the surface should not exist. The
        // managed demo is the one exception, below.
        [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT, MANAGED_VARIANT].forEach((v) => {
            expect(Object.keys(v)).not.toContain('user-management');
            expect(Object.keys(v)).not.toContain('connection-management');
            expect(Object.keys(v)).not.toContain('gateway-settings');
            expect(Object.keys(v)).not.toContain('backup');
            expect(Object.keys(v)).not.toContain('admin-login');
        });
    });

    it('admin variant ships the login plus the three editors and Backup & Restore, and no messaging modules', () => {
        // admin-login authenticates but opens no broker connection, so there is
        // nothing for the messaging modules to attach to.
        expect(Object.keys(ADMIN_VARIANT).sort()).toEqual([
            'admin-login',
            'backup',
            'connection-management',
            'gateway-settings',
            'user-management',
        ]);
        expect(ADMIN_VARIANT['admin-login']).toBeGreaterThan(ADMIN_VARIANT['user-management']);
        expect(ADMIN_VARIANT['user-management']).toBeGreaterThan(ADMIN_VARIANT['connection-management']);
        expect(ADMIN_VARIANT['connection-management']).toBeGreaterThan(ADMIN_VARIANT['gateway-settings']);
        expect(ADMIN_VARIANT['gateway-settings']).toBeGreaterThan(ADMIN_VARIANT['backup']);
    });

    it('all variant ships the all modules for visual testing purpose', () => {
        // Kitchen-sink build. `connections` runs its managed entry, which covers
        // both connection modes, so no separate managed connection module appears.
        expect(Object.keys(ALL_VARIANT).sort()).toEqual([
            'admin-login',
            'backup',
            'connection-management',
            'connections',
            'gateway-settings',
            'queue-browser',
            'queue-copy',
            'queue-subscription-explorer',
            'user-management',
        ]);
        expect(ALL_ENTRIES).toEqual({ connections: 'managed' });
    });

    it("the gateway's module catalog is the managed variant's module-controlled modules", () => {
        // An administrator grants modules from moduleCatalog() in
        // go-web-proxy/configfile.go; the browser shows them through
        // isModuleVisible. A module is module-controlled when granting it is
        // what makes it visible: not connections (always shown), not one
        // rbac.ts denies in every managed session (queue-discovery).
        const go = readFileSync(path.join(REPO, 'go-web-proxy/configfile.go'), 'utf-8');
        const literal = go.match(/^func moduleCatalog\(\) \[\]string \{\s*return \[\]string\{([^}]*)\}\s*\}/m);
        expect(literal, 'moduleCatalog() must stay a literal []string{...}').not.toBeNull();
        const catalog = literal![1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));

        const base = { admin: false, username: 'u', broker: '', vpns: [], operate: [], readOnly: [] };
        const controlled = Object.keys(MANAGED_VARIANT).filter(id =>
            isModuleVisible({ ...base, modules: [id] }, id) && !isModuleVisible({ ...base, modules: [] }, id));
        expect(catalog).toEqual(controlled);
        // It filters its own rows in the browser, so an administrator can grant it.
        expect(catalog).toContain('queue-subscription-explorer');
        // The admin pages (moduleLabel) name each one as the sidebar does.
        const names = Object.fromEntries([QueueBrowserModule, QueueCopyModule, QueueSubscriptionExplorerModule].map(m => [m.id, m.name]));
        expect(catalog.map(moduleLabel)).toEqual(catalog.map(id => names[id]));
    });

    it('managed variant ships the standard modules, with connections on its managed entry', () => {
        // provisioned.html is what the gateway serves at / in Provisioned mode: the everyday app plus
        // the Managed sign-in, and nothing else. Same modules, same order.
        expect(MANAGED_VARIANT).toEqual(STANDARD_VARIANT);
        expect(MANAGED_ENTRIES).toEqual({ connections: 'managed' });
    });

    it('no Release variant overrides an entry, so none installs the managed connections entry', () => {
        // Release bundles (index/min/no-payload/no-queue-copy/mock) build from
        // these manifests; scripts/check-bundles.mjs proves the result on the
        // built files. The managed sign-in is never a separate module either.
        [standardManifest, minManifest, noQueueCopyManifest].forEach((m) => {
            expect(m).not.toHaveProperty('MODULE_ENTRIES');
            expect(Object.keys(m.ACTIVE_MODULES)).not.toContain('managed-connections');
        });
    });

    it('managed demo ships the managed variant\'s messaging modules and the admin pages, on the managed entry', () => {
        // The one shipped bundle with the admin pages: a demo, against a fake
        // gateway. No admin-login (the Managed panel owns the session).
        const editors = ['backup', 'connection-management', 'gateway-settings', 'user-management'];
        const messaging = Object.keys(MANAGED_VARIANT);
        expect(Object.keys(DEMO_VARIANT).sort()).toEqual([...messaging, ...editors].sort());
        expect(DEMO_VARIANT).not.toHaveProperty('admin-login');
        for (const id of messaging) expect(DEMO_VARIANT[id]).toBe(MANAGED_VARIANT[id]);
        for (const id of editors) expect(DEMO_VARIANT[id]).toBe(ADMIN_VARIANT[id]);
        expect(DEMO_ENTRIES).toEqual({ connections: 'managed' });
    });

    it('connections outranks queue-copy in every variant that lists both', () => {
        // queue-copy reads the gateway verdict at install, so connections must have
        // installed first. The kernel installs by priority, highest first.
        const variants = [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT, ADMIN_VARIANT, ALL_VARIANT, MANAGED_VARIANT, DEMO_VARIANT];
        const both = variants.filter(v => 'connections' in v && 'queue-copy' in v);
        expect(both.length).toBeGreaterThan(0);
        for (const v of both) expect(v['connections']).toBeGreaterThan(v['queue-copy']);
    });

    it('_active re-exports the standard variant manifest', () => {
        // index/demo/no-payload build without --variant, so a subset or other
        // variant here would silently change what the default bundles ship.
        expect(ACTIVE_VARIANT).toBe(STANDARD_VARIANT);
    });
});
