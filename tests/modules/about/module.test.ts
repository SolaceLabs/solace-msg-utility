import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventBus } from '../../../src/core/event-bus';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';
import { completeContext } from '../../helpers/appContext';
import { AboutModule } from '../../../src/modules/about/module';
import type { AppState } from '../../../src/core/types';

/**
 * The About page: the About card with the build's version, and the Help tab's
 * manual, one chapter on show at a time. The template is the one a build
 * ships: the chapters of the standard variant unless a test names another
 * build.
 */
let container: HTMLElement;
/** Every element the page scrolled to, in order (jsdom has no scrollIntoView of its own). */
let scrolledTo: Element[];

beforeEach(() => {
    scrolledTo = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolledTo.push(this); };
});

async function install(build: { variant?: string; demo?: boolean } = {}): Promise<void> {
    container = loadModuleDOM('about', undefined, build);
    const appState: AppState = {
        activeModuleId: null, isConnected: false, isSempConnected: false,
        selectedVpn: null, solaceConnection: null, sempCredentials: null, managed: null,
    };
    await AboutModule.install(completeContext({
        container, appState, eventBus: createEventBus(),
        setState: vi.fn(), loadSelf: vi.fn(), sempFetch: vi.fn(), copyToClipboard: vi.fn(),
    }));
}

const q = <T extends HTMLElement>(sel: string) => container.querySelector<T>(sel)!;
const all = <T extends HTMLElement>(sel: string) => Array.from(container.querySelectorAll<T>(sel));
const hidden = (el: Element) => el.classList.contains('hidden');
const chapters = () => all('.manual-chapter');
const titleOf = (chapter: Element) => chapter.querySelector('h2')!.textContent;
/** The titles of the chapters on show: one, in a manual that works. */
const onShow = () => chapters().filter(c => !hidden(c)).map(titleOf);
const entries = () => all<HTMLButtonElement>('.manual-contents-chapter');
const current = () => entries().map(e => e.parentElement!.classList.contains('is-current'));
const pager = () => [q<HTMLButtonElement>('#btn-manual-prev'), q<HTMLButtonElement>('#btn-manual-next')];
/** What the page scrolled to, in order: the sheet (the top of a chapter) or a heading, by its text. */
const scrolls = () => scrolledTo.map(el => (el.id === 'manual-sheet' ? 'sheet' : el.textContent));

describe('About module', () => {
    it('shows the version of the build on the About card', async () => {
        await install();
        expect(__APP_VERSION__).toMatch(/\d/);
        expect(q('#about-version').textContent).toBe(__APP_VERSION__);
    });

    it('opens on the About card; Help swaps it for the manual, and About swaps back', async () => {
        await install();
        const [about, help] = all<HTMLButtonElement>('.about-tab');
        const panels = () => [hidden(q('#about-panel-about')), hidden(q('#about-panel-help'))];
        const selected = () => [about, help].map(t => [t.getAttribute('aria-selected'), t.classList.contains('is-active')]);
        expect(panels()).toEqual([false, true]);

        help.click();
        expect(panels()).toEqual([true, false]);
        expect(selected()).toEqual([['false', false], ['true', true]]);

        about.click();
        expect(panels()).toEqual([false, true]);
        expect(selected()).toEqual([['true', true], ['false', false]]);
    });

    it('opens the manual at its first chapter, without scrolling, and lists every chapter by number with the sections of each', async () => {
        await install();
        const titles = chapters().map(titleOf);
        expect(titles.length).toBeGreaterThan(1);
        expect(onShow()).toEqual([titles[0]]);
        expect(scrolls()).toEqual([]);

        expect(entries().map(e => e.textContent)).toEqual(titles.map((title, i) => `${i + 1}. ${title}`));
        expect(chapters().map(c => c.dataset.number)).toEqual(titles.map((_title, i) => String(i + 1)));
        expect(current()).toEqual(titles.map((_title, i) => i === 0));
        chapters().forEach((chapter, i) => {
            const listed = Array.from(entries()[i].parentElement!.querySelectorAll('.manual-contents-section'), s => s.textContent);
            expect(listed).toEqual(Array.from(chapter.querySelectorAll('h3'), h => h.textContent));
            expect(listed.length).toBeGreaterThan(0);
        });
    });

    it('turns to the chapter of a Contents entry, at the top of the sheet; Previous and Next step through and stop at the ends', async () => {
        await install();
        const titles = chapters().map(titleOf);
        const last = titles.length - 1;
        const [prev, next] = pager();
        expect([prev.disabled, next.disabled]).toEqual([true, false]);
        expect(hidden(q('#manual-pager'))).toBe(false);

        entries()[last].click();
        expect(onShow()).toEqual([titles[last]]);
        expect(current()).toEqual(titles.map((_title, i) => i === last));
        expect([prev.disabled, next.disabled]).toEqual([false, true]);
        expect(scrolls()).toEqual(['sheet']);

        prev.click();
        expect(onShow()).toEqual([titles[last - 1]]);
        next.click();
        expect(onShow()).toEqual([titles[last]]);
        expect(scrolls()).toEqual(['sheet', 'sheet', 'sheet']);
    });

    it('turns to a section: its chapter comes on show and the page scrolls to that heading', async () => {
        await install();
        const last = chapters().length - 1;
        const heading = chapters()[last].querySelectorAll('h3')[1];
        const section = entries()[last].parentElement!.querySelectorAll<HTMLButtonElement>('.manual-contents-section')[1];
        expect(section.textContent).toBe(heading.textContent);

        section.click();
        expect(onShow()).toEqual([titleOf(chapters()[last])]);
        expect(scrolls()).toEqual([heading.textContent]);
    });

    it('opens a link out of a chapter in a tab of its own, which cannot reach back into the app', async () => {
        await install();
        const links = all<HTMLAnchorElement>('.manual-chapter a');
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect([link.href.startsWith('https://'), link.target, link.rel]).toEqual([true, '_blank', 'noopener noreferrer']);
    });

    it('shows no pager in a manual of one chapter', async () => {
        await install({ variant: 'min' });
        expect(chapters()).toHaveLength(1);
        expect(onShow()).toEqual([titleOf(chapters()[0])]);
        expect(hidden(q('#manual-pager'))).toBe(true);
        expect(pager().map(b => b.disabled)).toEqual([true, true]);
    });

    it('shows the About card alone in a demo build, which ships no manual', async () => {
        await install({ variant: 'standard', demo: true });
        expect(q('#about-version').textContent).toBe(__APP_VERSION__);
        expect(hidden(q('#about-panel-about'))).toBe(false);
        expect(all('.about-tab, .manual-chapter, #about-panel-help')).toEqual([]);
    });
});
