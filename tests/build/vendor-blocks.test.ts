import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { variantNeedsVendorScripts, stripVendorBlocks } from '../../scripts/module-registry-plugin.mjs';
import { VENDOR_MARKERS } from '../../scripts/check-bundles.mjs';
import { REPO_ROOT, readSource } from '../helpers/sources';

/**
 * The shell's `@vendor:start` / `@vendor:end` blocks (src/index.html) hold the
 * Solace SDK and JSZip loaders and the library banner. A variant whose manifest
 * exports `NEEDS_VENDOR_SCRIPTS = false` is built without them.
 */
const roots: string[] = [];
function fakeRoot(variantSrc: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-blocks-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'variants'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'variants', 'v.ts'), variantSrc);
    return root;
}
afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

const MODULES = `export const ACTIVE_MODULES: Record<string, number> = { 'a': 1 };\n`;

describe('variantNeedsVendorScripts', () => {
    it('is false only for a manifest that exports NEEDS_VENDOR_SCRIPTS = false', () => {
        expect(variantNeedsVendorScripts(fakeRoot(`${MODULES}export const NEEDS_VENDOR_SCRIPTS = false;\n`), 'v')).toBe(false);
    });

    it('is true when the manifest says so, or says nothing', () => {
        expect(variantNeedsVendorScripts(fakeRoot(`${MODULES}export const NEEDS_VENDOR_SCRIPTS: boolean = true;\n`), 'v')).toBe(true);
        expect(variantNeedsVendorScripts(fakeRoot(MODULES), 'v')).toBe(true);
    });

    it('ignores the flag in a comment', () => {
        const src = `${MODULES}// export const NEEDS_VENDOR_SCRIPTS = false;\n/* NEEDS_VENDOR_SCRIPTS = false */\n`;
        expect(variantNeedsVendorScripts(fakeRoot(src), 'v')).toBe(true);
    });

    it('is false for the admin variant and true for every Direct and Provisioned one', () => {
        const needs = (v: string) => variantNeedsVendorScripts(REPO_ROOT, v);
        expect(needs('admin')).toBe(false);
        expect(['standard', 'min', 'no-queue-copy', 'all-for-testing-only', 'managed', 'managed-demo'].filter((v) => !needs(v))).toEqual([]);
    });
});

describe('stripVendorBlocks', () => {
    it('removes each block with its own lines and leaves the rest', () => {
        const html = 'a\n    <!-- @vendor:start -->\n    <script>x</script>\n    <!-- @vendor:end -->\nb\n<!-- @vendor:start -->y<!-- @vendor:end -->c';
        expect(stripVendorBlocks(html)).toBe('a\nb\nc');
    });

    it('returns a page without the markers unchanged', () => {
        expect(stripVendorBlocks('<html>\n<body></body>\n</html>')).toBe('<html>\n<body></body>\n</html>');
    });
});

describe('the shell\'s @vendor blocks', () => {
    const shell = readSource('src/index.html');

    it('pair up: the loader in <head> and the banner with its script in <body>', () => {
        expect(shell.match(/<!-- @vendor:start -->/g)).toHaveLength(2);
        expect(shell.match(/<!-- @vendor:end -->/g)).toHaveLength(2);
    });

    it('hold every VENDOR_MARKERS string that check-bundles looks for, and nothing outside them does', () => {
        for (const marker of VENDOR_MARKERS) expect(shell, marker).toContain(marker);
        const stripped = stripVendorBlocks(shell);
        for (const marker of VENDOR_MARKERS) expect(stripped, marker).not.toContain(marker);
    });

    it('leave the shell\'s placeholder and template marker in a stripped page', () => {
        const stripped = stripVendorBlocks(shell);
        expect(stripped).toContain('id="app-loading"');
        expect(stripped).toContain('<!-- @module-templates -->');
        expect(stripped).not.toContain('Solclient:settled');
    });
});
