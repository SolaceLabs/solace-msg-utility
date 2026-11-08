import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The docs' internal links and tables of contents. A renamed heading changes
 * its anchor, and nothing else notices: every `(#anchor)` and
 * `(file.md#anchor)` link in README.md and docs/*.md must name a heading that
 * exists, and every doc in docs/ opens with a `## Contents` list equal to its
 * `##` and `###` headings. docs/improvement-plan.md is left out of the
 * contents rule: the audit-improvement-plan skill rewrites it whole.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = fs.readdirSync(path.join(REPO_ROOT, 'docs')).filter(f => f.endsWith('.md')).map(f => `docs/${f}`);
const FILES = ['README.md', ...DOCS];
const NO_CONTENTS = new Set(['docs/improvement-plan.md']);

interface Heading { level: number; text: string; slug: string }

/** GitHub's heading anchor: lower case, punctuation dropped, each space a hyphen, repeats numbered. */
function slugger(): (text: string) => string {
    const seen = new Map<string, number>();
    return (text: string) => {
        const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M} _-]/gu, '').replace(/ /g, '-');
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return n === 0 ? base : `${base}-${n}`;
    };
}

/** The headings of a Markdown file, outside fenced code. */
function headings(text: string): Heading[] {
    const slug = slugger();
    const out: Heading[] = [];
    let fenced = false;
    for (const line of text.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        const m = !fenced && line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (m) out.push({ level: m[1].length, text: m[2], slug: slug(m[2]) });
    }
    return out;
}

const cache = new Map<string, Heading[]>();
function headingsOf(rel: string): Heading[] {
    if (!cache.has(rel)) cache.set(rel, headings(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8')));
    return cache.get(rel)!;
}

/** Every relative Markdown link with an anchor, or to another .md file, outside fenced code. */
function links(text: string): string[] {
    const out: string[] = [];
    let fenced = false;
    for (const line of text.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        if (fenced) continue;
        for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
            const target = m[1];
            if (/^[a-z]+:/i.test(target)) continue; // https:, mailto: ...
            if (target.startsWith('#') || /\.md(#|$)/.test(target)) out.push(target);
        }
    }
    return out;
}

describe('docs -- links', () => {
    it('slugs headings as GitHub does', () => {
        const slug = slugger();
        expect(slug('Demo Mode (`demo.html`)')).toBe('demo-mode-demohtml');
        expect(slug('Unit Testing \u2014 What Is Tested and How')).toBe('unit-testing--what-is-tested-and-how');
        expect(slug('Administration app (`/solAdmin`)')).toBe('administration-app-soladmin');
        expect([slug('Demo controls'), slug('Demo controls')]).toEqual(['demo-controls', 'demo-controls-1']);
    });

    it.each(FILES)('every anchor and .md link in %s resolves', (rel) => {
        const broken = links(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8')).filter((target) => {
            const [file, anchor] = target.split('#');
            const doc = file ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), file)) : rel;
            if (!fs.existsSync(path.join(REPO_ROOT, doc))) return true;
            return anchor !== undefined && !headingsOf(doc).some(h => h.slug === anchor);
        });
        expect(broken).toEqual([]);
    });
});

describe('docs -- contents', () => {
    it.each(DOCS.filter(d => !NO_CONTENTS.has(d)))('%s opens with a Contents list of its ## and ### headings', (rel) => {
        const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
        const all = headingsOf(rel);
        const first = all.findIndex(h => h.level === 2);
        expect(all[first]?.text, 'the first ## heading').toBe('Contents');
        const listed = text.split(/^## Contents$/m)[1].split(/^#{1,6} /m)[0]
            .split('\n').filter(l => /^\s*- \[/.test(l));
        const want = all.filter(h => (h.level === 2 || h.level === 3) && h.text !== 'Contents')
            .map(h => `${'  '.repeat(h.level - 2)}- [${h.text}](#${h.slug})`);
        expect(listed).toEqual(want);
    });
});
