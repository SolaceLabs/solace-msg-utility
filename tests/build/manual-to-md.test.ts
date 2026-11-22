import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';
import { readModuleHelp } from '../../scripts/module-registry-plugin.mjs';
import { chapterMarkdown, DOCS_URL } from '../../scripts/manual-to-md.mjs';

/**
 * A chapter of the manual as the Markdown of the user guide: each part a
 * chapter may be written with, and the refusal of anything else.
 */
const FIGURES = '../src/modules/x/';

/** The chapters of an HTML fragment, parsed as the browser parses a template. */
const chapters = (html: string) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('article'));

/** The Markdown of a chapter titled T whose body is `body`, without the title. */
function md(body: string): string {
    const out = chapterMarkdown(chapters(`<article class="manual-chapter"><h2>T</h2>${body}</article>`)[0], { figures: FIGURES });
    expect(out.startsWith('## T\n\n') && out.endsWith('\n')).toBe(true);
    return out.slice('## T\n\n'.length, -1);
}

describe('a chapter as Markdown', () => {
    it('writes the title as a ## heading and ends with one newline', () => {
        const [chapter] = chapters('<article class="manual-chapter">\n    <h2>Queue <code>Browser</code></h2>\n    <p>One.</p>\n</article>');
        expect(chapterMarkdown(chapter, { figures: FIGURES })).toBe('## Queue `Browser`\n\nOne.\n');
    });

    it('writes headings and paragraphs, a blank line between blocks, and drops comments', () => {
        expect(md('<h3>Binding</h3>\n<p>Type the\n    name.</p><!-- a note to authors --><h4>Then</h4><p>a<!-- c -->b</p>'))
            .toBe('### Binding\n\nType the name.\n\n#### Then\n\nab');
    });

    it('writes the inline parts: bold, emphasis, code, a key cap', () => {
        expect(md('<p>Press <strong>Bind</strong> or <kbd>Enter</kbd>, <em>then</em> read <code>a|b</code>.</p>'))
            .toBe('Press **Bind** or <kbd>Enter</kbd>, *then* read `a|b`.');
    });

    it('escapes what Markdown would read as markup, and leaves code as written', () => {
        expect(md('<p>Use * and _x_ with [a] &lt;b&gt; | c &amp; d \\ e, not <code>&lt;name&gt; * _</code></p>'))
            .toBe('Use \\* and \\_x\\_ with \\[a\\] \\<b\\> \\| c &amp; d \\\\ e, not `<name> * _`');
    });

    it('links a guide by its file, and any other https address in full', () => {
        expect(md(`<p>See <a href="${DOCS_URL}deployment.md#vendor-libraries">Vendor <strong>libraries</strong></a> and <a href="https://solace.com/">Solace</a>.</p>`))
            .toBe('See [Vendor **libraries**](deployment.md#vendor-libraries) and [Solace](https://solace.com/).');
    });

    it('numbers an ordered list and nests the blocks of an item under its own line', () => {
        const html = `<ol class="manual-steps">
            <li>First.</li>
            <li>Choose a type:
                <ul>
                    <li><strong>Topic</strong>: a.</li>
                    <li>Queue.</li>
                </ul>
                <p>Then go on.</p>
            </li>
            <li>Last.</li>
        </ol>`;
        expect(md(html)).toBe([
            '1. First.',
            '2. Choose a type:',
            '',
            '   - **Topic**: a.',
            '   - Queue.',
            '',
            '   Then go on.',
            '3. Last.',
        ].join('\n'));
    });

    it('writes an item that is only a block under its marker', () => {
        expect(md('<ul><li><p>Alone.</p></li></ul>')).toBe('- Alone.');
    });

    it('writes a table with its first row as the heading row, a | escaped in text and in code', () => {
        const html = '<table><thead><tr><th>Key</th><th>Does</th></tr></thead>' +
            '<tbody><tr><td><kbd>Esc</kbd></td><td>Closes <code>a|b</code> | all</td></tr></tbody></table>';
        expect(md(html)).toBe('| Key | Does |\n| --- | --- |\n| <kbd>Esc</kbd> | Closes `a\\|b` \\| all |');
    });

    it('links a figure to the module\'s file and numbers its caption, from 1 in each chapter', () => {
        const figure = (name: string) => `<figure class="manual-figure"><img src="help/${name}.svg" alt="The [${name}]"><figcaption>The <strong>${name}</strong>.</figcaption></figure>`;
        const [one, two] = chapters(`<article><h2>A</h2>${figure('page')}${figure('filter')}</article><article><h2>B</h2>${figure('page')}</article>`);
        expect(chapterMarkdown(one, { figures: FIGURES })).toBe(
            '## A\n\n![The \\[page\\]](../src/modules/x/help/page.svg)\n\n*Figure 1. The **page**.*\n\n' +
            '![The \\[filter\\]](../src/modules/x/help/filter.svg)\n\n*Figure 2. The **filter**.*\n',
        );
        expect(chapterMarkdown(two, { figures: '../y/' })).toBe('## B\n\n![The \\[page\\]](../y/help/page.svg)\n\n*Figure 1. The **page**.*\n');
    });

    it('writes an aside as a GitHub alert of its kind, a note when it names none', () => {
        expect(md('<aside class="manual-note"><p>One.</p><p>Two.</p></aside>')).toBe('> [!NOTE]\n> One.\n>\n> Two.');
        expect(md('<aside class="manual-note" data-kind="tip"><p>T.</p></aside>')).toBe('> [!TIP]\n> T.');
        expect(md('<aside class="manual-note" data-kind="important"><p>I.</p></aside>')).toBe('> [!IMPORTANT]\n> I.');
        expect(md('<aside class="manual-note" data-kind="warning"><ul><li>W.</li></ul></aside>')).toBe('> [!WARNING]\n> - W.');
    });

    it('writes a code block as a fence in its language, the text as written', () => {
        expect(md('<pre><code data-lang="json">{\n  "a": [1, 2],\n  "b": "*"\n}\n</code></pre>'))
            .toBe('```json\n{\n  "a": [1, 2],\n  "b": "*"\n}\n```');
    });
});

describe('a chapter the guide cannot carry is refused by name', () => {
    it.each([
        { what: 'a block that is not a part', body: '<div>x</div>', error: /<div> is not a part a chapter is written with: <div>x<\/div>/ },
        { what: 'an inline element that is not a part', body: '<p>a <span>b</span></p>', error: /<span> is not an inline part of a chapter/ },
        { what: 'a block inside a table cell', body: '<table><tr><th><p>x</p></th></tr></table>', error: /<p> is not an inline part of a chapter/ },
        { what: 'text outside a paragraph', body: 'loose words', error: /text outside a paragraph: "loose words"\. Wrap it in <p>/ },
        { what: 'a link that is not https', body: '<p><a href="#binding">x</a></p>', error: /<a> must link to an https:\/\/ address/ },
        { what: 'a link without an address', body: '<p><a>x</a></p>', error: /<a> must link to an https:\/\/ address/ },
        { what: 'a backtick in code', body: '<p><code>a`b</code></p>', error: /<code> holds a backtick/ },
        { what: 'a figure without a caption', body: '<figure><img src="help/a.svg" alt=""></figure>', error: /<figure> needs an <img> and a <figcaption>/ },
        { what: 'a figure without a picture', body: '<figure><figcaption>x</figcaption></figure>', error: /<figure> needs an <img> and a <figcaption>/ },
        { what: 'an aside of an unknown kind', body: '<aside data-kind="danger"><p>x</p></aside>', error: /<aside> has a data-kind that is not one of note, tip, important, warning/ },
        { what: 'a code block without a language', body: '<pre><code>x</code></pre>', error: /<pre> needs a <code data-lang="\.\.\."> inside it/ },
        { what: 'a code block without code', body: '<pre>x</pre>', error: /<pre> needs a <code data-lang="\.\.\."> inside it/ },
    ])('$what', ({ body, error }) => {
        expect(() => md(body)).toThrow(error);
    });

    it('a chapter that does not open with its title', () => {
        const [untitled, late] = chapters('<article><p>x</p></article><article><p>x</p><h2>T</h2></article>');
        expect(() => chapterMarkdown(untitled, { figures: FIGURES })).toThrow(/<article> must open with its <h2> title/);
        expect(() => chapterMarkdown(late, { figures: FIGURES })).toThrow(/<article> must open with its <h2> title/);
    });
});

// The guide on GitHub is made from these same files, so each must stay within
// the parts above: a part outside them fails here, naming it.
describe('the chapters of the manual', () => {
    // help.html, and help.<entry>.html for an entry that adds a chapter (read with its base, as a build composes it).
    const files = fs.readdirSync(path.join(REPO_ROOT, 'src/modules')).flatMap(id =>
        fs.readdirSync(path.join(REPO_ROOT, 'src/modules', id))
            .filter(file => /^help(\.[\w-]+)?\.html$/.test(file))
            .map(file => ({ id, file, entry: file.split('.').length === 3 ? file.split('.')[1] : undefined })));

    it.each(files)('$id/$file: every chapter is one the guide can carry, and its figures exist where the guide links them', ({ id, entry }) => {
        const found = chapters(readModuleHelp(REPO_ROOT, id, entry) as string);
        expect(found.length).toBeGreaterThan(0);
        for (const chapter of found) {
            expect(chapter.className).toBe('manual-chapter');
            const markdown = chapterMarkdown(chapter, { figures: `../src/modules/${id}/` });
            for (const [, target] of markdown.matchAll(/^!\[[^\n]*\]\(([^)\s]+)\)$/gm)) {
                expect(fs.existsSync(path.join(REPO_ROOT, 'docs', target)), target).toBe(true);
            }
        }
    });
});
