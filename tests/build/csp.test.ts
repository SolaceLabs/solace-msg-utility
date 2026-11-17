// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CSP_KINDS, inlineBlocks, hashSource, buildPolicy, policyFor, applyCsp, cspProblems } from '../../scripts/csp.mjs';
import { variantGatewayOnly } from '../../scripts/module-registry-plugin.mjs';
import { REPO_ROOT } from '../helpers/sources';

/** SHA-256 of `alert(1)`, as a CSP hash source (computed independently of the code under test). */
const ALERT_HASH = "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='";
/** SHA-256 of `body{color:red}`. */
const STYLE_HASH = "'sha256-FcQqt3aNlV7AZnGV4zkQRVeCeJOxbMPnQSx258L803E='";

/** A built page in miniature: the charset, a stylesheet, the module script, and markup after them. */
const PAGE = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{color:red}</style></head>' +
    '<body><div class="x">hi</div><script type="module">alert(1)</script></body></html>';

const DIRECT = { kind: 'direct' as const, vendor: true };

describe('csp -- inlineBlocks', () => {
    it('lists the inline scripts and styles in document order, with where each starts', () => {
        expect(inlineBlocks(PAGE)).toEqual([
            { tag: 'style', text: 'body{color:red}', at: PAGE.indexOf('<style>') },
            { tag: 'script', text: 'alert(1)', at: PAGE.indexOf('<script') },
        ]);
    });

    it('skips a script with a src, and anything inside a comment, as the browser does', () => {
        const html = '<script src="solclient.js"></script><!-- <script>old()</script> <style>p{}</style> -->';
        expect(inlineBlocks(html)).toEqual([]);
    });

    it('takes a script\'s text whole: a <style> inside a JavaScript string is not an element', () => {
        const html = '<SCRIPT>const s = "<style>p{}</style>";</SCRIPT>';
        expect(inlineBlocks(html)).toEqual([{ tag: 'script', text: 'const s = "<style>p{}</style>";', at: 0 }]);
    });
});

describe('csp -- hashSource', () => {
    it('is the base64 SHA-256 of the text, as a quoted hash source', () => {
        expect(hashSource('alert(1)')).toBe(ALERT_HASH);
    });

    // The HTML parser turns CRLF and lone CR into LF before the browser hashes,
    // so a build from CRLF sources (a Windows checkout) must hash the same.
    it('hashes CRLF and lone CR line ends as LF', () => {
        const lf = "'sha256-fhj3NzEbLcOy8mndeDlrA1HxT7Zu+oefdoyyMYGIPHg='";
        expect(hashSource('a\r\nb')).toBe(lf);
        expect(hashSource('a\rb')).toBe(lf);
    });
});

describe('csp -- buildPolicy', () => {
    it('writes the Direct policy: hashed scripts and those they load, the hashed stylesheet, any broker, the TLS probe frame', () => {
        expect(buildPolicy({ ...DIRECT, scripts: [ALERT_HASH], styles: [STYLE_HASH] })).toBe(
            `default-src 'none'; script-src 'strict-dynamic' ${ALERT_HASH}; style-src ${STYLE_HASH}; img-src data:; ` +
            "connect-src http: https: ws: wss:; frame-src https:; base-uri 'none'; form-action 'none'",
        );
    });

    it('lets a gateway-only bundle connect to its own origin, a demo nowhere, and neither frame anything', () => {
        const of = (kind: 'gateway' | 'demo') => buildPolicy({ kind, vendor: true, scripts: [ALERT_HASH], styles: [STYLE_HASH] });
        expect(of('gateway')).toContain("connect-src 'self'; base-uri");
        expect(of('demo')).toContain("connect-src 'none'; base-uri");
        expect(of('gateway')).not.toContain('frame-src');
        expect(of('demo')).not.toContain('frame-src');
    });

    it('trusts loaded scripts only for a bundle with the vendor loader, and never allows inline code or eval', () => {
        const policy = buildPolicy({ kind: 'gateway', vendor: false, scripts: [ALERT_HASH], styles: [] });
        expect(policy).toContain(`script-src ${ALERT_HASH}; style-src 'none';`);
        expect(policy).not.toMatch(/unsafe-|strict-dynamic|\*/);
    });

    it('lists a repeated hash once, and writes \'none\' for an empty list', () => {
        expect(buildPolicy({ kind: 'demo', vendor: false, scripts: [ALERT_HASH, ALERT_HASH], styles: [] }))
            .toContain(`script-src ${ALERT_HASH}; style-src 'none';`);
    });

    it('refuses a kind it does not know, naming the ones it does', () => {
        expect(() => buildPolicy({ kind: 'other' as never, vendor: false, scripts: [], styles: [] }))
            .toThrow(`Unknown CSP kind "other": use one of ${Object.keys(CSP_KINDS).join(', ')}`);
    });
});

describe('csp -- applyCsp', () => {
    it('puts the policy right after the charset, before every script and style, built from the page\'s own elements', () => {
        const out = applyCsp(PAGE, DIRECT);
        const tag = `<meta http-equiv="Content-Security-Policy" content="${policyFor(PAGE, DIRECT)}">`;
        expect(out).toBe(PAGE.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${tag}`));
        expect(policyFor(PAGE, DIRECT)).toContain(`script-src 'strict-dynamic' ${ALERT_HASH}; style-src ${STYLE_HASH};`);
        expect(cspProblems('p.html', out, DIRECT)).toEqual([]);
    });

    it('fails a page with no charset tag to follow', () => {
        expect(() => applyCsp('<html><script>alert(1)</script></html>', DIRECT)).toThrow(/no <meta charset> tag.*src\/index\.html/);
    });

    it('fails a page that has a policy already: the build owns it', () => {
        expect(() => applyCsp(applyCsp(PAGE, DIRECT), DIRECT)).toThrow(/carries a Content-Security-Policy tag already/);
    });
});

describe('csp -- cspProblems', () => {
    const good = applyCsp(PAGE, DIRECT);

    it('fails a page with no policy, or with two', () => {
        expect(cspProblems('p.html', PAGE, DIRECT)).toEqual([expect.stringMatching(/^p\.html: carries no Content-Security-Policy tag/)]);
        const twice = good.replace('<style>', `${good.match(/<meta http-equiv[^>]*>/)![0]}<style>`);
        expect(cspProblems('p.html', twice, DIRECT)).toEqual(['p.html: carries 2 Content-Security-Policy tags; the build writes one.']);
    });

    it('fails a page whose script changed after the policy was built, saying so', () => {
        const problems = cspProblems('p.html', good.replace('alert(1)', 'alert(2)'), DIRECT);
        expect(problems).toEqual([expect.stringMatching(/^p\.html: the policy's script-src is .*A hash that does not match means the text changed/)]);
    });

    it('names each directive that differs from the kind\'s, and one the page lacks', () => {
        const asGateway = applyCsp(PAGE, { kind: 'gateway', vendor: true });
        expect(cspProblems('p.html', asGateway, DIRECT)).toEqual([
            `p.html: the policy's connect-src is "'self'", expected "http: https: ws: wss:".`,
            `p.html: the policy's frame-src is "(missing)", expected "https:".`,
        ]);
    });

    it('fails a script that comes before the policy: the policy does not cover it', () => {
        const early = good.replace('<meta charset="UTF-8">', '<meta charset="UTF-8"><script>alert(1)</script>');
        expect(cspProblems('p.html', early, DIRECT)).toContain('p.html: a <script> comes before the Content-Security-Policy tag, so the policy does not cover it.');
    });

    it('counts the style attributes, inline handlers and javascript: URLs in the markup, which the policy refuses', () => {
        const bad = good.replace('<div class="x">hi</div>',
            '<div style="color:red">a</div><svg style="display:none"></svg><button onclick="go()">b</button><a href="javascript:go()">c</a>');
        expect(cspProblems('p.html', bad, DIRECT)).toEqual([
            expect.stringMatching(/^p\.html: 2 element\(s\) with a style attribute.*styles\.css/),
            expect.stringMatching(/^p\.html: 1 element\(s\) with an inline event handler/),
            expect.stringMatching(/^p\.html: 1 javascript: URL\(s\)/),
        ]);
    });

    it('does not count those words inside a script, a data- attribute or text', () => {
        const fine = good.replace('alert(1)', 'el.innerHTML = "<b style=x onclick=y>";')
            .replace('<div class="x">hi</div>', '<div data-onhold="1" title="style=">turn on=off</div>');
        expect(cspProblems('p.html', applyCsp(fine.replace(/<meta http-equiv[^>]*>\n? */, ''), DIRECT), DIRECT)).toEqual([]);
    });
});

/** The variant manifest flag that makes a bundle's policy the gateway kind. */
describe('csp -- variantGatewayOnly', () => {
    const roots: string[] = [];
    const fakeRoot = (src: string) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-variant-'));
        roots.push(root);
        fs.mkdirSync(path.join(root, 'src', 'variants'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'variants', 'v.ts'), src);
        return root;
    };
    afterEach(() => {
        while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    });
    const MODULES = `export const ACTIVE_MODULES: Record<string, number> = { 'a': 1 };\n`;

    it('is true only for a manifest that exports GATEWAY_ONLY = true, not in a comment', () => {
        expect(variantGatewayOnly(fakeRoot(`${MODULES}export const GATEWAY_ONLY: boolean = true;\n`), 'v')).toBe(true);
        expect(variantGatewayOnly(fakeRoot(`${MODULES}export const GATEWAY_ONLY = false;\n`), 'v')).toBe(false);
        expect(variantGatewayOnly(fakeRoot(MODULES), 'v')).toBe(false);
        expect(variantGatewayOnly(fakeRoot(`${MODULES}// export const GATEWAY_ONLY = true;\n`), 'v')).toBe(false);
    });

    it('marks the two bundles only the gateway serves, and no bundle that may run anywhere', () => {
        const only = (v: string) => variantGatewayOnly(REPO_ROOT, v);
        expect(['managed', 'admin'].filter(only)).toEqual(['managed', 'admin']);
        expect(['standard', 'min', 'no-queue-copy', 'all-for-testing-only', 'managed-demo'].filter(only)).toEqual([]);
    });
});
