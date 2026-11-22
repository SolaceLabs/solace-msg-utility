// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT } from '../helpers/sources';
import { DEMO_MARKERS, MANAGED_MARKERS, VENDOR_MARKERS, findMarkers } from '../../scripts/check-bundles.mjs';
import {
    activeModuleEntries,
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

/** A module's chapter files: `help.html`, and `help.<entry>.html` for an entry that adds a chapter. */
const helpFiles = (id: string) => fs.readdirSync(path.join(root, 'src/modules', id)).filter(file => /^help(\.[\w-]+)?\.html$/.test(file));

/** The module ids of the repo that hold a chapter. */
const WITH_HELP = fs.readdirSync(path.join(root, 'src/modules')).filter(id => helpFiles(id).length > 0);

/** The titles of the chapters in a piece of HTML, in order. */
const titlesOf = (html: string | null) => [...(html ?? '').matchAll(/<article class="manual-chapter">\s*<h2>([^<]+)<\/h2>/g)].map(m => m[1]);

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
    // Every variant a bundle is built from. Each manual has more than one chapter, so its pager always has somewhere to go.
    it.each(['standard', 'min', 'no-queue-copy', 'managed', 'admin'])('of %s is the chapters of its modules, in the order the variant lists them', (variant) => {
        const entries = activeModuleEntries(root, variant);
        const want = activeModuleIds(root, variant).flatMap((id: string) => titlesOf(readModuleHelp(root, id, entries[id])));
        const view = readModuleView(root, 'about', undefined, { variant })!;
        expect(titlesOf(view)).toEqual(want);
        expect(count(view, CHAPTER)).toBe(want.length);
        expect(want.length).toBeGreaterThan(1);
        expect(view).not.toContain(MODULE_HELP_MARKER);
    });

    it('gets the Provisioned chapter from the managed entry of connections, after the Connections one, and only there', () => {
        const direct = titlesOf(readModuleHelp(root, 'connections'));
        expect(direct).toHaveLength(1);
        expect(titlesOf(readModuleHelp(root, 'connections', 'managed'))).toEqual([...direct, 'Provisioned connections']);
        expect(titlesOf(moduleHelp(root, 'standard'))).not.toContain('Provisioned connections');
    });

    it('writes each figure into the page as a data: URL of its SVG file, in the order the chapters name them', () => {
        const variant = 'managed';
        const entries = activeModuleEntries(root, variant);
        const files = activeModuleIds(root, variant).flatMap((id: string) =>
            [...(readModuleHelp(root, id, entries[id]) ?? '').matchAll(/<img\b[^>]*\bsrc="(help\/[^"]+)"/g)].map(m => path.join(root, 'src/modules', id, m[1])));
        const view = readModuleView(root, 'about', undefined, { variant })!;
        expect(view).not.toMatch(/<img\b[^>]*\bsrc="help\//);
        const written = [...view.matchAll(/<img\b[^>]*\bsrc="data:image\/svg\+xml;base64,([^"]+)"/g)].map(m => Buffer.from(m[1], 'base64').toString('utf-8'));
        expect(files.length).toBeGreaterThan(0);
        expect(written.length).toBe(files.length);
        written.forEach((svg, i) => expect(svg === fs.readFileSync(files[i], 'utf-8'), files[i]).toBe(true));
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
        const chapters = helpFiles(id).map(name => fs.readFileSync(path.join(root, 'src/modules', id, name), 'utf-8')).join('\n');
        expect(chapters).toContain(`src="help/${file}"`);
    });
});

// scripts/check-bundles.mjs proves the same on the built files; here a chapter
// that names such a string fails before any build.
describe('a chapter keeps the bundles apart', () => {
    it.each(['standard', 'min', 'no-queue-copy'])('the %s manual names nothing of the Provisioned sign-in and nothing of a demo', (variant) => {
        expect(findMarkers(moduleHelp(root, variant), [...MANAGED_MARKERS, ...DEMO_MARKERS])).toEqual([]);
    });

    it('the admin manual names none of the vendor files the admin bundle carries none of', () => {
        expect(findMarkers(moduleHelp(root, 'admin'), VENDOR_MARKERS)).toEqual([]);
    });
});
