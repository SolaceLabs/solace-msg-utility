// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bundleSources, readSource } from '../helpers/sources';

/**
 * Every bundle's Content-Security-Policy (scripts/csp.mjs) allows its one
 * stylesheet by hash and no inline style or script: the browser ignores a
 * `style` attribute and blocks an inline event handler or a `javascript:`
 * URL, in a template and in markup built from a string alike. The built
 * check (tests/build/check-bundles.test.ts > "the Content-Security-Policy")
 * sees the templates; this one also sees the markup in code, demos
 * included. Writes through the CSSOM (`el.style.width = ...`) are allowed and
 * not matched.
 */
const FORBIDDEN: { what: string; re: RegExp }[] = [
    { what: 'a style attribute (use a class in the module\'s styles.css)', re: /<[A-Za-z][^>]*\sstyle\s*=/g },
    { what: 'setAttribute(\'style\') (use a class, or el.style.<property>)', re: /setAttribute\(\s*['"]style['"]/g },
    { what: 'an inline event handler (add the listener in code)', re: /<[A-Za-z][^>]*\son[a-z]+\s*=/g },
    { what: 'a javascript: URL (add a listener in code)', re: /=\s*\\?["']?\s*javascript:/g },
];

/** `file:line: what` for each forbidden use in `text`. */
function uses(file: string, text: string): string[] {
    return FORBIDDEN.flatMap(({ what, re }) => [...text.matchAll(re)].map(m => {
        const line = text.slice(0, m.index).split('\n').length;
        return `${file}:${line}: ${what}`;
    }));
}

describe('no inline style, handler or javascript: URL in the source', () => {
    it('scans every file a bundle compiles, the demos included', () => {
        const files = bundleSources();
        expect(files).toContain('src/index.html');
        expect(files).toContain('src/modules/queue-browser/ui-forward.js');
        expect(files.some(f => f.startsWith('src/mock-broker/'))).toBe(true);
    });

    it('finds none', () => {
        expect(bundleSources().flatMap(f => uses(f, readSource(f)))).toEqual([]);
    });

    it('recognises each forbidden use, across lines too, and leaves the CSSOM alone', () => {
        const sample = [
            '<div class="a"',
            '     style="width: 1px">',
            'el.innerHTML = `<b style="x">`;',
            'node.setAttribute("style", s);',
            '<button onclick="go()">',
            '<a href="javascript:void 0">',
            'el.style.width = "1px"; el.style.cssText = "display:none"; el.onclick = go;',
            '<div data-onhold="1" title="style=">turn on=off</div>',
        ].join('\n');
        expect(uses('f.ts', sample)).toEqual([
            'f.ts:1: a style attribute (use a class in the module\'s styles.css)',
            'f.ts:3: a style attribute (use a class in the module\'s styles.css)',
            'f.ts:4: setAttribute(\'style\') (use a class, or el.style.<property>)',
            'f.ts:5: an inline event handler (add the listener in code)',
            'f.ts:6: a javascript: URL (add a listener in code)',
        ]);
    });
});
