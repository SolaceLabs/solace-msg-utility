import { describe, it, expect } from 'vitest';
import {
    extractModuleIds,
    activeModuleIds,
    moduleRegistryPlugin,
} from '../../scripts/module-registry-plugin.mjs';

const root = process.cwd();
const byName = (a: string, b: string) => a.localeCompare(b);

describe('moduleRegistryPlugin — extractModuleIds', () => {
    it('extracts the keys of an ACTIVE_MODULES literal', () => {
        const src = `export const ACTIVE_MODULES: Record<string, number> = {
            'connections': 100,
            "queue-browser": 80,
        };`;
        expect(extractModuleIds(src)).toEqual(['connections', 'queue-browser']);
    });

    it('ignores commented-out lines and quotes/colons inside comments', () => {
        const src = `export const ACTIVE_MODULES: Record<string, number> = {
            'connections': 100, // sidebar label "Connections": shown here
            /* 'disabled': 0, */
            'queue-browser': 80,
        };`;
        expect(extractModuleIds(src)).toEqual(['connections', 'queue-browser']);
    });

    it('throws when no ACTIVE_MODULES literal is present', () => {
        expect(() => extractModuleIds('export const NOPE = 1;')).toThrow(/ACTIVE_MODULES/);
    });
});

describe('moduleRegistryPlugin — activeModuleIds', () => {
    it('reads the standard variant manifest', () => {
        expect(activeModuleIds(root, 'standard').sort(byName)).toEqual([
            'connections', 'queue-browser', 'queue-copy', 'queue-subscription-explorer',
        ]);
    });

    it('reads the min variant manifest', () => {
        expect(activeModuleIds(root, 'min').sort(byName)).toEqual(['connections', 'queue-browser']);
    });

    it('defaults to the standard variant when none is given', () => {
        expect(activeModuleIds(root, undefined).sort(byName)).toEqual(activeModuleIds(root, 'standard').sort(byName));
    });

    it('throws for an unknown variant', () => {
        expect(() => activeModuleIds(root, 'does-not-exist')).toThrow(/does not exist/);
    });
});

describe('moduleRegistryPlugin — virtual module', () => {
    it('resolves only the virtual id', () => {
        const p = moduleRegistryPlugin({ root });
        expect(p.resolveId('virtual:module-registry')).toBe('\0virtual:module-registry');
        expect(p.resolveId('something-else')).toBeNull();
    });

    it('emits static imports + a moduleFiles map for exactly the variant modules', () => {
        const p = moduleRegistryPlugin({ root, variant: 'min' });
        const resolved = p.resolveId('virtual:module-registry');
        const code = p.load(resolved);
        expect(code).toContain('export const moduleFiles');
        // Keys are emitted via JSON.stringify → double-quoted.
        expect(code).toContain('"./modules/connections/module.ts": m0');
        expect(code).toContain('"./modules/queue-browser/module.ts": m1');
        // min excludes queue-copy — it must not be imported.
        expect(code).not.toContain('queue-copy');
        // Two modules → two namespace imports.
        expect(code.match(/import \* as m\d+ from/g)?.length).toBe(2);
    });

    it('load() ignores non-virtual ids', () => {
        const p = moduleRegistryPlugin({ root });
        expect(p.load('some/other/id')).toBeNull();
    });
});
