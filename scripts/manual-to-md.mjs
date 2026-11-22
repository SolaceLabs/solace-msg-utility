/**
 * The manual as Markdown: turns one chapter of the manual (a module's
 * `help.html`, see scripts/module-registry-plugin.mjs) into the Markdown the
 * user guide on GitHub is made of.
 *
 * The app shows a chapter as the HTML its author wrote. A chapter is written
 * with a small fixed set of parts so that the same text reads well as
 * Markdown: `chapterMarkdown` knows each part, and refuses anything else by
 * name instead of dropping it. docs/developer-guide.md lists the parts.
 *
 *   block parts   <h2> (the chapter title, first), <h3>, <h4>, <p>, <ul>, <ol>,
 *                 <table>, <figure> (an <img> and a <figcaption>),
 *                 <aside data-kind="note | tip | important | warning">,
 *                 <pre><code data-lang="..."></code></pre>
 *   inline parts  <strong>, <em>, <code>, <kbd>, <a href="https://...">
 *
 * It works on DOM nodes and imports nothing, so a test hands it a parsed
 * chapter directly. No `#!` line, on purpose: tests import this file.
 */

/** Where the guides live on GitHub. A link under it becomes a relative link in the guide. */
export const DOCS_URL = 'https://github.com/SolaceLabs/solace-msg-utility/blob/main/docs/';

/** An aside's `data-kind`, and the GitHub alert it becomes. Without the attribute an aside is a note. */
const NOTE_KINDS = { note: 'NOTE', tip: 'TIP', important: 'IMPORTANT', warning: 'WARNING' };

/** The elements that start a block. Inside a list item, whatever comes before the first one is the item's own line. */
const BLOCK_TAGS = ['P', 'H3', 'H4', 'UL', 'OL', 'TABLE', 'FIGURE', 'ASIDE', 'PRE'];

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Refuse a part the guide cannot carry, naming it.
 * @param {Element} el
 * @param {string} why
 * @returns {never}
 */
function refuse(el, why) {
    throw new Error(`[manual] <${el.tagName.toLowerCase()}> ${why}: ${el.outerHTML.replace(/\s+/g, ' ').slice(0, 120)}`);
}

/** Text as Markdown: runs of white space become one space, and the characters Markdown reads as markup are escaped. */
const escapeText = text => text.replace(/\s+/g, ' ').replace(/&/g, '&amp;').replace(/[\\`*_[\]<>|]/g, '\\$&');

/** A `<code>` as a code span. A table cell also needs its `|` escaped; nowhere else may it be. */
function codeSpan(el, inTable) {
    const text = el.textContent.replace(/\s+/g, ' ');
    if (text.includes('`')) refuse(el, 'holds a backtick, which a Markdown code span cannot');
    return `\`${inTable ? text.replace(/\|/g, '\\|') : text}\``;
}

/** An `<a>` as a link: to an https address only, and relative when it points at one of the guides. */
function link(el, inTable) {
    const href = String(el.getAttribute('href'));
    if (!href.startsWith('https://')) refuse(el, 'must link to an https:// address');
    return `[${inline(el.childNodes, inTable).trim()}](${href.startsWith(DOCS_URL) ? href.slice(DOCS_URL.length) : href})`;
}

/** Text and inline parts as one run of Markdown. A comment adds nothing. */
function inline(nodes, inTable = false) {
    return Array.from(nodes, (node) => {
        if (node.nodeType === TEXT_NODE) return escapeText(node.textContent);
        if (node.nodeType !== ELEMENT_NODE) return '';
        switch (node.tagName) {
            case 'STRONG': return `**${inline(node.childNodes, inTable).trim()}**`;
            case 'EM': return `*${inline(node.childNodes, inTable).trim()}*`;
            case 'CODE': return codeSpan(node, inTable);
            case 'KBD': return `<kbd>${escapeText(node.textContent)}</kbd>`;
            case 'A': return link(node, inTable);
            default: return refuse(node, 'is not an inline part of a chapter');
        }
    }).join('');
}

/** A list. An item's nested blocks sit under its own line, indented to the text after the marker. */
function list(el, ctx) {
    return Array.from(el.children, (item, index) => {
        const marker = el.tagName === 'OL' ? `${index + 1}. ` : '- ';
        const nodes = Array.from(item.childNodes);
        const cut = nodes.findIndex(node => node.nodeType === ELEMENT_NODE && BLOCK_TAGS.includes(node.tagName));
        const own = inline(cut === -1 ? nodes : nodes.slice(0, cut)).trim();
        const nested = cut === -1 ? [] : blocks(nodes.slice(cut), ctx);
        return [own, ...nested].filter(Boolean).join('\n\n').split('\n')
            .map((line, n) => (n === 0 ? marker + line : line && ' '.repeat(marker.length) + line))
            .join('\n');
    }).join('\n');
}

/** A table: its first row is the heading row. */
function table(el) {
    const rows = Array.from(el.rows, row => `| ${Array.from(row.cells, cell => inline(cell.childNodes, true).trim()).join(' | ')} |`);
    return [rows[0], `|${' --- |'.repeat(el.rows[0].cells.length)}`, ...rows.slice(1)].join('\n');
}

/** A figure: the picture, linked where the guide finds the module's file, then its numbered caption. */
function figure(el, ctx) {
    const img = el.querySelector('img');
    const caption = el.querySelector('figcaption');
    if (!img || !caption) refuse(el, 'needs an <img> and a <figcaption>');
    ctx.figure += 1;
    return `![${escapeText(img.alt)}](${ctx.figures}${img.getAttribute('src')})\n\n*Figure ${ctx.figure}. ${inline(caption.childNodes).trim()}*`;
}

/** An aside as a GitHub alert. */
function note(el, ctx) {
    const kind = NOTE_KINDS[el.getAttribute('data-kind') || 'note'];
    if (!kind) refuse(el, `has a data-kind that is not one of ${Object.keys(NOTE_KINDS).join(', ')}`);
    return `[!${kind}]\n${blocks(el.childNodes, ctx).join('\n\n')}`.split('\n')
        .map(line => (line ? `> ${line}` : '>'))
        .join('\n');
}

/** A `<pre><code data-lang>` as a fenced block, its text as written. */
function fenced(el) {
    const code = el.querySelector('code');
    const lang = code?.getAttribute('data-lang');
    if (!lang) refuse(el, 'needs a <code data-lang="..."> inside it');
    return `\`\`\`${lang}\n${code.textContent.replace(/\n$/, '')}\n\`\`\``;
}

/** The block parts among `nodes`, each as Markdown. Loose text is refused: it would be lost. */
function blocks(nodes, ctx) {
    const out = [];
    for (const node of nodes) {
        if (node.nodeType === TEXT_NODE && node.textContent.trim()) {
            throw new Error(`[manual] text outside a paragraph: "${node.textContent.trim().slice(0, 80)}". Wrap it in <p>.`);
        }
        if (node.nodeType !== ELEMENT_NODE) continue;
        switch (node.tagName) {
            case 'P': out.push(inline(node.childNodes).trim()); break;
            case 'H3': out.push(`### ${inline(node.childNodes).trim()}`); break;
            case 'H4': out.push(`#### ${inline(node.childNodes).trim()}`); break;
            case 'UL':
            case 'OL': out.push(list(node, ctx)); break;
            case 'TABLE': out.push(table(node)); break;
            case 'FIGURE': out.push(figure(node, ctx)); break;
            case 'ASIDE': out.push(note(node, ctx)); break;
            case 'PRE': out.push(fenced(node)); break;
            default: refuse(node, 'is not a part a chapter is written with');
        }
    }
    return out;
}

/**
 * One chapter as Markdown: a `## ` heading for its title, then its parts.
 * Figures are numbered from 1 within the chapter, as the app numbers them.
 *
 * @param {Element} article the chapter, `<article class="manual-chapter">`
 * @param {{ figures: string }} opts `figures`: the path from the guide to the folder the chapter's `help/` sits in, with its closing slash
 * @returns {string}
 */
export function chapterMarkdown(article, { figures }) {
    const title = article.querySelector(':scope > h2:first-child');
    if (!title) refuse(article, 'must open with its <h2> title');
    const parts = blocks(Array.from(article.childNodes).filter(node => node !== title), { figures, figure: 0 });
    return `${[`## ${inline(title.childNodes).trim()}`, ...parts].join('\n\n')}\n`;
}
