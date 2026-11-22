import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';
import { readModuleHelp } from '../../scripts/module-registry-plugin.mjs';
import { chapterMarkdown } from '../../scripts/manual-to-md.mjs';
import { GUIDE_FILE, GUIDE_LAYOUT, guideMarkdown, guideParts, userGuide } from '../../scripts/user-guide.mjs';

/**
 * The user guide on GitHub as the manual's chapters make it: its layout, the
 * chapters it takes from the variants, and the committed file itself.
 */

/** The chapters of a module's chapter HTML, parsed as the browser parses a template. */
const parse = (html: string) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('article'));
const CHAPTER = '<article class="manual-chapter">';

/** Throwaway project roots: `files` maps a root-relative path to its content. */
const tmpRoots: string[] = [];
function fakeRoot(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-guide-'));
    tmpRoots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return dir;
}
const argv = process.argv;
afterEach(() => {
    process.argv = argv;
    while (tmpRoots.length) fs.rmSync(tmpRoots.pop()!, { recursive: true, force: true });
});

describe('the guide\'s layout', () => {
    it('is the title, the introduction, a Contents list by part with the anchors GitHub gives, then each chapter after a rule', () => {
        const guide = guideMarkdown({
            title: 'Guide',
            intro: ['Intro one.', 'Intro two.'],
            parts: [
                {
                    title: 'First', about: 'the app.', chapters: [
                        // A sub-heading takes an anchor without being listed, and a line of #s inside a code block is no heading.
                        { markdown: '## Alpha & Beta\n\n### Setup\n\n#### Setup\n\n```text\n## not a heading\n```\n' },
                        { markdown: '## Gamma\n\n1. Step:\n\n   ```text\n   ### nor this\n   ```\n\n### Setup\n' },
                    ],
                },
                // The guide's own Contents heading comes first, so a chapter of that name is the second.
                { title: 'Second', about: 'the rest.', chapters: [{ markdown: '## Contents\n' }] },
            ],
        });
        const [note, ...rest] = guide.split('\n\n');
        expect(note).toMatch(/^<!-- [^\n]*src\/modules\/<id>\/help\.html[^\n]*npm run guide[^\n]* -->$/);
        expect(rest.join('\n\n')).toBe([
            '# Guide',
            'Intro one.',
            'Intro two.',
            '## Contents',
            '**First** -- the app.',
            '- [Alpha & Beta](#alpha--beta)\n  - [Setup](#setup)\n- [Gamma](#gamma)\n  - [Setup](#setup-2)',
            '**Second** -- the rest.',
            '- [Contents](#contents-1)',
            '---',
            '## Alpha & Beta\n\n### Setup\n\n#### Setup\n\n```text\n## not a heading\n```',
            '---',
            '## Gamma\n\n1. Step:\n\n   ```text\n   ### nor this\n   ```\n\n### Setup',
            '---',
            '## Contents\n',
        ].join('\n\n'));
    });
});

describe('the guide\'s chapters', () => {
    it('are those of each part\'s variant, in its order, each once: a module without one is skipped, and an entry adds its own after the base', () => {
        const root = fakeRoot({
            'src/variants/one.ts': `export const ACTIVE_MODULES = { 'first': 3, 'second': 2, 'bare': 1 };`,
            'src/variants/two.ts': `export const ACTIVE_MODULES = { 'second': 2, 'third': 1 };\nexport const MODULE_ENTRIES = { 'second': 'extra' };`,
            'src/modules/first/help.html': `${CHAPTER}<h2>First</h2><figure class="manual-figure"><img src="help/a.svg" alt="A"><figcaption>Cap.</figcaption></figure></article>`,
            'src/modules/second/help.html': `${CHAPTER}<h2>Second</h2><p>Two.</p></article>\n`,
            'src/modules/second/help.extra.html': `<!-- @module-base -->\n${CHAPTER}<h2>Second, extra</h2><p>More.</p></article>\n`,
            'src/modules/third/help.html': `${CHAPTER}<h2>Third</h2></article>`,
        });
        const layout = { title: 'G', intro: [], parts: [{ variant: 'one', title: 'One', about: 'a.' }, { variant: 'two', title: 'Two', about: 'b.' }] };
        expect(guideParts(root, parse, layout)).toEqual([
            {
                title: 'One', about: 'a.', chapters: [
                    { id: 'first', markdown: '## First\n\n![A](../src/modules/first/help/a.svg)\n\n*Figure 1. Cap.*\n' },
                    { id: 'second', markdown: '## Second\n\nTwo.\n' },
                ],
            },
            {
                title: 'Two', about: 'b.', chapters: [
                    { id: 'second', markdown: '## Second, extra\n\nMore.\n' },
                    { id: 'third', markdown: '## Third\n' },
                ],
            },
        ]);
        expect(userGuide(root, parse, layout)).toBe(guideMarkdown({ ...layout, parts: guideParts(root, parse, layout) }));
    });

    it('hold every chapter file of the repo, each chapter once, whatever bundles carry it', () => {
        const modules = path.join(REPO_ROOT, 'src/modules');
        const titleOf = (markdown: string) => markdown.split('\n', 1)[0];
        const written = fs.readdirSync(modules).flatMap(id => fs.readdirSync(path.join(modules, id))
            .filter(file => /^help(\.[\w-]+)?\.html$/.test(file))
            .flatMap(file => parse(readModuleHelp(REPO_ROOT, id, file.split('.').length === 3 ? file.split('.')[1] : undefined) as string))
            .map(chapter => `${id}: ${titleOf(chapterMarkdown(chapter, { figures: '' }))}`));
        const held = guideParts(REPO_ROOT, parse, GUIDE_LAYOUT).flatMap(part => part.chapters.map(({ id, markdown }) => `${id}: ${titleOf(markdown)}`));
        expect(held.length).toBeGreaterThan(0);
        expect(new Set(held).size).toBe(held.length);
        expect(new Set(held)).toEqual(new Set(written));
    });
});

describe('docs/user-guide.md', () => {
    // The file is written by `npm run guide`, never by hand: a chapter changed without it fails here.
    it('is what the chapters of the manual make: after changing a chapter, run npm run guide', () => {
        const committed = fs.readFileSync(path.join(REPO_ROOT, GUIDE_FILE), 'utf-8').split('\n');
        const made = userGuide(REPO_ROOT, parse, GUIDE_LAYOUT).split('\n');
        const at = made.findIndex((line, i) => line !== committed[i]);
        expect(at === -1 ? 'the same' : `line ${at + 1} should be: ${made[at]}`).toBe('the same');
        expect(committed.length).toBe(made.length);
    });

    it('is written by the script when it is started as a command', async () => {
        const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.argv = [process.execPath, path.join(REPO_ROOT, 'scripts/user-guide.mjs')];
        vi.resetModules();
        await import('../../scripts/user-guide.mjs');
        expect(write).toHaveBeenCalledTimes(1);
        const [file, text] = write.mock.calls[0];
        expect(path.relative(REPO_ROOT, String(file))).toBe(path.normalize(GUIDE_FILE));
        expect(text).toBe(userGuide(REPO_ROOT, parse, GUIDE_LAYOUT));
        expect(log).toHaveBeenCalledWith(`Wrote ${GUIDE_FILE} from the chapters of the manual.`);
    });
});
