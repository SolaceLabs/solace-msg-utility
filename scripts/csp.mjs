/**
 * The Content-Security-Policy every bundle carries, and the check that a built
 * bundle carries the right one.
 *
 * The policy is a `<meta http-equiv>` tag, the first element in `<head>` after
 * the charset, so it holds wherever the file runs: from disk, from any web
 * server, or from the gateway, which adds as a header what a meta tag cannot
 * hold (`frame-ancestors`) and narrows the connections to its own origin. The
 * policy allows:
 *
 *   - scripts: the page's own inline scripts, each by its SHA-256 hash, and,
 *     for a bundle with the shell's vendor loader, the scripts those add
 *     ('strict-dynamic': the loader adds solclient.js and jszip.min.js); no
 *     other script, no inline event handler and no eval;
 *   - styles: the inlined stylesheet by its hash; no style attribute and no
 *     other `<style>` (writes through the CSSOM, `el.style.x = ...`, are not
 *     affected);
 *   - images: `data:` URLs (the favicon);
 *   - connections and frames: what the bundle's kind needs (CSP_KINDS);
 *   - nothing else: no `<base>`, no form submission, no plugin, no worker.
 *
 * vite.config.ts applies it to every build (`applyCsp`) once
 * vite-plugin-singlefile has inlined the scripts and the stylesheet, so the
 * hashes are of the final text. scripts/check-bundles.mjs proves it on the
 * built files (`cspProblems`).
 */
import { createHash } from 'node:crypto';

/**
 * What each kind of bundle may connect to and frame.
 *
 * - `direct`: the Direct bundles, run from disk, from any web server or from
 *   the gateway, connecting to any broker (`http:`/`https:` for SEMP, `ws:`/
 *   `wss:` for messaging; the gateway's header narrows these to its own
 *   origin). The TLS probe loads the broker's https address in a hidden frame
 *   (src/core/services/solace-client.ts), hence `frame-src https:`.
 * - `gateway`: the bundles only the gateway serves (provisioned.html,
 *   solAdmin.html): their own origin only.
 * - `demo`: both demos, which answer every request in the page: no network.
 *
 * @type {Readonly<Record<'direct' | 'gateway' | 'demo', { connect: string[], frame: string[] }>>}
 */
export const CSP_KINDS = Object.freeze({
    direct: { connect: ['http:', 'https:', 'ws:', 'wss:'], frame: ['https:'] },
    gateway: { connect: ["'self'"], frame: [] },
    demo: { connect: ["'none'"], frame: [] },
});

/** @typedef {keyof typeof CSP_KINDS} CspKind */

/**
 * Comments, and each `<script>` and `<style>` element with its raw text, in
 * document order. A comment is matched so that a tag inside it is skipped, as
 * the browser skips it; the text of a script is consumed whole, so a `<style`
 * inside a JavaScript string is never taken for an element.
 */
const BLOCK = /<!--[\s\S]*?-->|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;

/** The policy tag `applyCsp` writes, with the policy in group 1. */
const CSP_META = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi;

/** The charset tag the policy tag follows. */
const CHARSET_META = /<meta\s+charset=[^>]*>/i;

/**
 * The inline `<script>` and `<style>` elements of a page, with where each
 * starts. A script with a `src` is not inline and is left out.
 *
 * @param {string} html
 * @returns {{ tag: 'script' | 'style', text: string, at: number }[]}
 */
export function inlineBlocks(html) {
    const blocks = [];
    for (const m of html.matchAll(BLOCK)) {
        if (!m[1]) continue;
        const tag = /** @type {'script' | 'style'} */ (m[1].toLowerCase());
        if (tag === 'script' && /\bsrc\s*=/i.test(m[2])) continue;
        blocks.push({ tag, text: m[3], at: /** @type {number} */ (m.index) });
    }
    return blocks;
}

/**
 * The CSP hash source of an element's text. The browser hashes the text after
 * the HTML parser has turned every CRLF and lone CR into LF, so a build made
 * from CRLF sources must hash the same way.
 *
 * @param {string} text
 * @returns {string}
 */
export function hashSource(text) {
    const normalized = text.replace(/\r\n?/g, '\n');
    return `'sha256-${createHash('sha256').update(normalized, 'utf8').digest('base64')}'`;
}

/**
 * The policy for a page of `kind` whose inline elements hash to `scripts` and
 * `styles`. `vendor`: the page has the shell's vendor loader, whose scripts
 * 'strict-dynamic' lets in.
 *
 * @param {{ kind: CspKind, vendor: boolean, scripts: string[], styles: string[] }} input
 * @returns {string}
 */
export function buildPolicy({ kind, vendor, scripts, styles }) {
    const k = CSP_KINDS[kind];
    if (!k) {
        throw new Error(`Unknown CSP kind "${kind}": use one of ${Object.keys(CSP_KINDS).join(', ')} (scripts/csp.mjs).`);
    }
    const listOrNone = (/** @type {string[]} */ sources) => (sources.length ? [...new Set(sources)] : ["'none'"]);
    /** @type {[string, string[]][]} */
    const directives = [
        ['default-src', ["'none'"]],
        ['script-src', listOrNone([...(vendor ? ["'strict-dynamic'"] : []), ...scripts])],
        ['style-src', listOrNone(styles)],
        ['img-src', ['data:']],
        ['connect-src', k.connect],
        ...(k.frame.length ? [/** @type {[string, string[]]} */ (['frame-src', k.frame])] : []),
        ['base-uri', ["'none'"]],
        ['form-action', ["'none'"]],
    ];
    return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/**
 * The policy `html` should carry: built from its own inline elements.
 *
 * @param {string} html
 * @param {{ kind: CspKind, vendor: boolean }} opts
 * @returns {string}
 */
export function policyFor(html, { kind, vendor }) {
    const blocks = inlineBlocks(html);
    const of = (/** @type {'script' | 'style'} */ tag) => blocks.filter(b => b.tag === tag).map(b => hashSource(b.text));
    return buildPolicy({ kind, vendor, scripts: of('script'), styles: of('style') });
}

/**
 * Put the policy tag into a built page, right after its charset tag, so it
 * comes before every script and style. A page with no charset tag, or with a
 * policy already, is a build fault and fails the build.
 *
 * @param {string} html
 * @param {{ kind: CspKind, vendor: boolean }} opts
 * @returns {string}
 */
export function applyCsp(html, opts) {
    if (!CHARSET_META.test(html)) {
        throw new Error('The page has no <meta charset> tag to put the Content-Security-Policy after: check src/index.html.');
    }
    if ([...html.matchAll(CSP_META)].length) {
        throw new Error('The page carries a Content-Security-Policy tag already: remove it from src/index.html, the build writes it.');
    }
    const policy = policyFor(html, opts);
    return html.replace(CHARSET_META, m => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

/**
 * The page's markup with comments, scripts and styles cut out: where an
 * attribute the policy refuses would sit.
 *
 * @param {string} html
 * @returns {string}
 */
function markupOf(html) {
    return html.replace(BLOCK, '');
}

/** An element with a style attribute. */
const STYLE_ATTR = /<[A-Za-z][^>]*\sstyle\s*=/g;
/** An element with an inline event handler (`onclick=` and the like). */
const HANDLER_ATTR = /<[A-Za-z][^>]*\son[a-z]+\s*=/gi;
/** A `javascript:` URL in an attribute. */
const JS_URL = /=\s*["']?\s*javascript:/gi;

/**
 * What is wrong with a built page's policy, one message per problem, empty
 * when it is right: exactly one policy tag, before every script and style,
 * equal to the policy built from the page's own elements, and no style
 * attribute, inline handler or `javascript:` URL, which the policy would
 * refuse.
 *
 * @param {string} name the file name, for the messages
 * @param {string} html
 * @param {{ kind: CspKind, vendor: boolean }} opts
 * @returns {string[]}
 */
export function cspProblems(name, html, opts) {
    const problems = [];
    const tags = [...html.matchAll(CSP_META)];
    if (tags.length !== 1) {
        problems.push(tags.length
            ? `${name}: carries ${tags.length} Content-Security-Policy tags; the build writes one.`
            : `${name}: carries no Content-Security-Policy tag. Check that vite.config.ts runs the content-security-policy plugin after viteSingleFile.`);
        return problems;
    }
    const tag = tags[0];
    const first = inlineBlocks(html)[0];
    if (first && first.at < /** @type {number} */ (tag.index)) {
        problems.push(`${name}: a <${first.tag}> comes before the Content-Security-Policy tag, so the policy does not cover it.`);
    }
    const expected = policyFor(html, opts);
    if (tag[1] !== expected) {
        const directives = (/** @type {string} */ p) => new Map(p.split(';').map(d => {
            const [key, ...sources] = d.trim().split(/\s+/);
            return [key, sources.join(' ')];
        }));
        const want = directives(expected);
        const have = directives(tag[1]);
        for (const key of new Set([...want.keys(), ...have.keys()])) {
            if (want.get(key) === have.get(key)) continue;
            const hint = key === 'script-src' || key === 'style-src'
                ? ' A hash that does not match means the text changed after the policy was built.'
                : '';
            problems.push(`${name}: the policy's ${key} is "${have.get(key) ?? '(missing)'}", expected "${want.get(key) ?? '(none)'}".${hint}`);
        }
    }
    const markup = markupOf(html);
    const count = (/** @type {RegExp} */ re) => [...markup.matchAll(re)].length;
    const styles = count(STYLE_ATTR);
    if (styles) {
        problems.push(`${name}: ${styles} element(s) with a style attribute, which the policy ignores. Move the declarations to a class in the module's styles.css.`);
    }
    const handlers = count(HANDLER_ATTR);
    if (handlers) {
        problems.push(`${name}: ${handlers} element(s) with an inline event handler, which the policy blocks. Add the listener in code.`);
    }
    const jsUrls = count(JS_URL);
    if (jsUrls) {
        problems.push(`${name}: ${jsUrls} javascript: URL(s), which the policy blocks. Add a listener in code instead.`);
    }
    return problems;
}
