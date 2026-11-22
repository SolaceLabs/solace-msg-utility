// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';
import {
    activeModuleIds,
    moduleHelp,
    readModuleHelp,
    readModuleTemplate,
    readModuleView,
    MODULE_HELP_MARKER,
} from '../../scripts/module-registry-plugin.mjs';

/**
 * The manual in a build: each module's chapter (`help.html`) goes into the
 * About template at its manual marker, for exactly the variant's modules, with
 * every figure written into the page.
 */
const root = REPO_ROOT;
const CHAPTER = '<article class="manual-chapter">';
const count = (text: string, part: string) => text.split(part).length - 1;

/** The module ids of the repo that hold a chapter. */
const WITH_HELP = fs.readdirSync(path.join(root, 'src/modules')).filter(id => readModuleHelp(root, id) !== null);

/** Throwaway project roots: `files` maps a root-relative path to its content. */
const tmpRoots: string[] = [];
function fakeRoot(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-help-'));
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

/** A root with a host template and two modules; `chapters` gives each module's help.html, or leaves it out. */
function manualRoot(chapters: Record<string, string>, extra: Record<string, string> = {}): string {
    return fakeRoot({
        'src/variants/v.ts': `export const ACTIVE_MODULES = { 'first': 3, 'second': 2, 'host': 1 };`,
        'src/modules/host/index.html': `<p id="card"></p>\n<!-- @help:start -->\n<div id="help">${MODULE_HELP_MARKER}</div>\n<!-- @help:end -->\n`,
        ...Object.fromEntries(Object.entries(chapters).map(([id, html]) => [`src/modules/${id}/help.html`, html])),
        ...extra,
    });
}

describe('the manual of a build', () => {
    it('is the chapters of the variant\'s modules, in the order the variant lists them', () => {
        for (const variant of ['standard', 'min', 'no-queue-copy', 'managed']) {
            const want = activeModuleIds(root, variant).filter((id: string) => WITH_HELP.includes(id));
            const view = readModuleView(root, 'about', undefined, { variant })!;
            expect(count(view, CHAPTER), variant).toBe(want.length);
            const titles = [...view.matchAll(/<article class="manual-chapter">\s*<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
            const own = want.map((id: string) => readModuleHelp(root, id)!.match(/<h2>([^<]+)<\/h2>/)![1]);
            expect(titles, variant).toEqual(own);
            expect(view).not.toContain(MODULE_HELP_MARKER);
        }
        // The smallest bundle still has a chapter, and the standard one more than one to turn between.
        expect(count(readModuleView(root, 'about', undefined, { variant: 'min' })!, CHAPTER)).toBe(1);
        expect(count(readModuleView(root, 'about')!, CHAPTER)).toBeGreaterThan(1);
    });

    it('writes each figure into the page as a data: URL of its SVG file', () => {
        const view = readModuleView(root, 'about', undefined, { variant: 'min' })!;
        expect(view).not.toMatch(/<img\b[^>]*\bsrc="help\//);
        const first = view.match(/<img\b[^>]*\bsrc="data:image\/svg\+xml;base64,([^"]+)"/)![1];
        const named = readModuleHelp(root, 'queue-browser')!.match(/<img\b[^>]*\bsrc="(help\/[^"]+)"/)![1];
        expect(Buffer.from(first, 'base64').toString('utf-8'))
            .toBe(fs.readFileSync(path.join(root, 'src/modules/queue-browser', named), 'utf-8'));
    });

    it('leaves the Help tab out of a demo build: the About card stands alone', () => {
        const view = readModuleView(root, 'about', undefined, { variant: 'standard', demo: true })!;
        expect(view).toContain('id="about-version"');
        for (const gone of ['about-tabs', 'about-panel-help', 'manual-sheet', '@help', MODULE_HELP_MARKER, CHAPTER]) {
            expect(view, gone).not.toContain(gone);
        }
    });

    it('leaves the Help tab out of a variant none of whose modules has a chapter', () => {
        const fake = manualRoot({});
        expect(moduleHelp(fake, 'v')).toBe('');
        expect(readModuleView(fake, 'host', undefined, { variant: 'v' })).toBe('<p id="card"></p>\n');
    });

    it('skips a module without a chapter and keeps the others', () => {
        const fake = manualRoot({ second: `${CHAPTER}<h2>Second</h2></article>\n` });
        expect(readModuleView(fake, 'host', undefined, { variant: 'v' })).toBe(
            `<p id="card"></p>\n<!-- @help:start -->\n<div id="help">${CHAPTER}<h2>Second</h2></article></div>\n<!-- @help:end -->\n`,
        );
    });

    it('returns a template without the manual marker as it is, and null for a module without a template', () => {
        expect(readModuleView(root, 'connections')).toBe(readModuleTemplate(root, 'connections'));
        expect(readModuleView(root, 'connections', 'managed', { demo: true })).toBe(readModuleTemplate(root, 'connections', 'managed'));
        expect(readModuleView(manualRoot({}), 'first', undefined, { variant: 'v' })).toBeNull();
    });
});

describe('a chapter\'s figures', () => {
    it('fail the build when one names a file that is not there', () => {
        const fake = manualRoot({ first: `${CHAPTER}<h2>First</h2><img src="help/gone.svg" alt=""></article>` });
        expect(() => moduleHelp(fake, 'v')).toThrow(/src\/modules\/first\/help\.html has a figure with src="help\/gone\.svg".*create the file or correct the name/);
    });

    it.each([
        'https://example.com/page.svg',
        'help/page.png',
        'help/../../../secret.svg',
        'page.svg',
    ])('fail the build when one names %s: only an SVG file of the module\'s help folder ships', (src) => {
        const fake = manualRoot(
            { first: `${CHAPTER}<h2>First</h2><img alt="" src="${src}"></article>` },
            { 'src/modules/first/help/page.png': 'x', 'src/modules/first/page.svg': '<svg/>' },
        );
        expect(() => moduleHelp(fake, 'v')).toThrow(/A figure is an SVG file in src\/modules\/first\/help\//);
    });

    // A bundle's policy ignores a style attribute and runs no script, and GitHub
    // shows the same files beside the guide: a figure draws with attributes only.
    const figures = WITH_HELP.flatMap((id) => {
        const dir = path.join(root, 'src/modules', id, 'help');
        return fs.existsSync(dir) ? fs.readdirSync(dir).map(file => ({ id, file, text: fs.readFileSync(path.join(dir, file), 'utf-8') })) : [];
    });

    it.each(figures)('$id/help/$file is a plain SVG drawing that its chapter shows', ({ id, file, text }) => {
        expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
        for (const refused of [/\sstyle\s*=/, /<style\b/, /<script\b/, /<foreignObject\b/, /\son[a-z]+\s*=/, /\bhref\s*=/]) {
            expect(text, String(refused)).not.toMatch(refused);
        }
        expect([...text].every(ch => ch.charCodeAt(0) < 128), 'plain ASCII').toBe(true);
        expect(readModuleHelp(root, id)).toContain(`src="help/${file}"`);
    });
});
