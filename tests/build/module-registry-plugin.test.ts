import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    extractModuleIds,
    extractModuleEntries,
    activeModuleIds,
    activeModuleEntries,
    readModuleTemplate,
    moduleRegistryPlugin,
    MODULE_BASE_MARKER,
} from '../../scripts/module-registry-plugin.mjs';

const root = process.cwd();
const byName = (a: string, b: string) => a.localeCompare(b);

/** Throwaway project roots for the failure paths: `files` maps a root-relative path to its content. */
const tmpRoots: string[] = [];
function fakeRoot(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-registry-'));
    tmpRoots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return dir;
}
afterEach(() => {
    while (tmpRoots.length) fs.rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

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

describe('moduleRegistryPlugin — extractModuleEntries', () => {
    it('reads id -> entry pairs, quoted or not', () => {
        const src = `export const ACTIVE_MODULES = { 'connections': 100, 'queue-copy': 70 };
            export const MODULE_ENTRIES: Record<string, string> = {
                'connections': 'managed',
                queue-copy: "lite",
            };`;
        expect(extractModuleEntries(src)).toEqual({ connections: 'managed', 'queue-copy': 'lite' });
    });

    it('ignores commented-out overrides', () => {
        const src = `export const MODULE_ENTRIES = {
            // 'connections': 'managed',
            /* 'queue-copy': 'lite', */
        };`;
        expect(extractModuleEntries(src)).toEqual({});
    });

    it('maps nothing when the manifest has no MODULE_ENTRIES', () => {
        expect(extractModuleEntries(`export const ACTIVE_MODULES = { 'connections': 100 };`)).toEqual({});
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

describe('moduleRegistryPlugin — activeModuleEntries', () => {
    it('reads the managed variant override', () => {
        expect(activeModuleEntries(root, 'managed')).toEqual({ connections: 'managed' });
    });

    it('overrides nothing for the variants a Release ships', () => {
        for (const variant of ['standard', 'min', 'no-queue-copy']) {
            expect(activeModuleEntries(root, variant)).toEqual({});
        }
    });

    it('rejects an override for a module the variant does not list', () => {
        const fake = fakeRoot({
            'src/variants/typo.ts': `export const ACTIVE_MODULES = { 'connections': 100 };
                export const MODULE_ENTRIES = { 'conections': 'managed' };`,
        });
        expect(() => activeModuleEntries(fake, 'typo')).toThrow(/MODULE_ENTRIES\["conections"\].*does not list "conections"/);
    });
});

describe('moduleRegistryPlugin — readModuleTemplate', () => {
    const connectionsBase = () => fs.readFileSync(path.join(root, 'src/modules/connections/index.html'), 'utf-8');

    it('returns the base template without an entry', () => {
        expect(readModuleTemplate(root, 'connections')).toBe(connectionsBase());
    });

    it('splices the base into the managed entry, inside the Direct tab panel', () => {
        const html = readModuleTemplate(root, 'connections', 'managed')!;
        expect(html).not.toContain(MODULE_BASE_MARKER);
        expect(html.match(/id="conn-tabs"/g)).toHaveLength(1);
        expect(html.match(/id="conn-host"/g)).toHaveLength(1);   // the Direct markup, once
        const panelDirect = html.indexOf('id="conn-panel-direct"');
        const host = html.indexOf('id="conn-host"');
        const panelManaged = html.indexOf('id="conn-panel-managed"');
        expect(panelDirect).toBeLessThan(host);
        expect(host).toBeLessThan(panelManaged);
    });

    it('keeps the Release base free of the tab bar and the Managed panel', () => {
        const html = connectionsBase();
        expect(html).not.toContain('conn-tabs');
        expect(html).not.toContain('conn-panel-managed');
    });

    it('falls back to the base when the entry has no template of its own', () => {
        expect(readModuleTemplate(root, 'queue-browser', 'managed'))
            .toBe(fs.readFileSync(path.join(root, 'src/modules/queue-browser/index.html'), 'utf-8'));
    });

    it('returns null for a module without a template', () => {
        const fake = fakeRoot({ 'src/modules/plain/module.ts': '' });
        expect(readModuleTemplate(fake, 'plain')).toBeNull();
        expect(readModuleTemplate(fake, 'plain', 'managed')).toBeNull();
    });

    it('uses an entry template without the marker as it is', () => {
        const fake = fakeRoot({
            'src/modules/m/index.html': 'BASE',
            'src/modules/m/index.e.html': 'ENTRY',
        });
        expect(readModuleTemplate(fake, 'm', 'e')).toBe('ENTRY');
    });

    it('splices the base literally, even when it contains replacement patterns', () => {
        // String.replace would expand `$&` and `$'` in a replacement string.
        const fake = fakeRoot({
            'src/modules/m/index.html': '<p>costs $& and $\'</p>\n',
            'src/modules/m/index.e.html': `<div>${MODULE_BASE_MARKER}</div>`,
        });
        expect(readModuleTemplate(fake, 'm', 'e')).toBe('<div><p>costs $& and $\'</p></div>');
    });

    it('fails when an entry template asks for a base that does not exist', () => {
        const fake = fakeRoot({ 'src/modules/m/index.e.html': MODULE_BASE_MARKER });
        expect(() => readModuleTemplate(fake, 'm', 'e')).toThrow(/index\.html does not exist/);
    });
});

describe('moduleRegistryPlugin — virtual module', () => {
    it('resolves only the virtual id', () => {
        const p = moduleRegistryPlugin({ root });
        expect(p.resolveId('virtual:module-registry')).toBe('\0virtual:module-registry');
        expect(p.resolveId('something-else')).toBeNull();
    });

    it('emits static imports + a moduleFiles map keyed by id, for exactly the variant modules', () => {
        const p = moduleRegistryPlugin({ root, variant: 'min' });
        const code = p.load(p.resolveId('virtual:module-registry'));
        expect(code).toContain('export const moduleFiles');
        // Keys are emitted via JSON.stringify → double-quoted.
        expect(code).toContain('"connections": m0');
        expect(code).toContain('"queue-browser": m1');
        expect(code).toMatch(/import \* as m0 from ".*\/connections\/module\.ts";/);
        // min excludes queue-copy — it must not be imported.
        expect(code).not.toContain('queue-copy');
        // Two modules → two namespace imports.
        expect(code.match(/import \* as m\d+ from/g)?.length).toBe(2);
    });

    it('imports the managed entry, and never the Release entry, for an overridden module', () => {
        const p = moduleRegistryPlugin({ root, variant: 'managed' });
        const code = p.load(p.resolveId('virtual:module-registry'));
        expect(code).toMatch(/import \* as m0 from ".*\/connections\/module\.managed\.ts";/);
        expect(code).not.toMatch(/\/connections\/module\.ts"/);
        expect(code).toContain('"connections": m0');
    });

    it('fails the build when an entry file is missing, naming it', () => {
        const fake = fakeRoot({
            'src/variants/v.ts': `export const ACTIVE_MODULES = { 'm': 1 };
                export const MODULE_ENTRIES = { 'm': 'e' };`,
            'src/modules/m/module.ts': '',
        });
        const p = moduleRegistryPlugin({ root: fake, variant: 'v' });
        expect(() => p.load(p.resolveId('virtual:module-registry'))).toThrow(/Create src\/modules\/m\/module\.e\.ts/);
    });

    it('load() ignores non-virtual ids', () => {
        const p = moduleRegistryPlugin({ root });
        expect(p.load('some/other/id')).toBeNull();
    });
});
