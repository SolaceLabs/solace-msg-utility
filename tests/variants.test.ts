// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
 * Membership invariants of the variant manifests (`{ moduleId: priority }`):
 * what a variant must never carry, and how the variants relate to each other.
 */
describe('variants', () => {
    it('every module a variant lists has its own directory with an entry file, at a priority no other module in that variant shares', () => {
        const variants = [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT, ADMIN_VARIANT, ALL_VARIANT, MANAGED_VARIANT, DEMO_VARIANT];
        for (const v of variants) {
            for (const id of Object.keys(v)) {
                expect(existsSync(path.join(REPO, 'src/modules', id, 'module.ts')), `src/modules/${id}/module.ts`).toBe(true);
            }
            const priorities = Object.values(v);
            expect(new Set(priorities).size).toBe(priorities.length);
        }
    });

    it('no-queue-copy variant leaves queue-copy out and keeps the other standard modules', () => {
        expect(NO_QUEUE_COPY_VARIANT).not.toHaveProperty('queue-copy');
        for (const id of Object.keys(STANDARD_VARIANT).filter(id => id !== 'queue-copy')) {
            expect(NO_QUEUE_COPY_VARIANT).toHaveProperty(id);
        }
    });

    it('no shipping variant carries the admin modules — they live at /solAdmin', () => {
        // The entitlement editors are their own app, so an everyday bundle
        // must not carry them even hidden: the surface should not exist. The
        // managed demo is the one exception, below.
        [STANDARD_VARIANT, MIN_VARIANT, NO_QUEUE_COPY_VARIANT, MANAGED_VARIANT].forEach((v) => {
            expect(Object.keys(v)).not.toContain('user-management');
            expect(Object.keys(v)).not.toContain('connection-management');
            expect(Object.keys(v)).not.toContain('gateway-settings');
            expect(Object.keys(v)).not.toContain('tls-certificates');
            expect(Object.keys(v)).not.toContain('backup');
            expect(Object.keys(v)).not.toContain('admin-login');
        });
    });

    it('admin variant ships no messaging modules: admin-login opens no broker connection for them to attach to', () => {
        for (const id of ['connections', 'queue-browser', 'queue-copy', 'queue-subscription-explorer']) {
            expect(ADMIN_VARIANT).not.toHaveProperty(id);
        }
    });

    it('all variant runs connections on its managed entry, which covers both connection modes', () => {
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
        const editors = ['backup', 'connection-management', 'gateway-settings', 'tls-certificates', 'user-management'];
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
