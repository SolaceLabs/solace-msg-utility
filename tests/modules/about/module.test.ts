import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/**
 * jsdom lays nothing out and has no IntersectionObserver. This one keeps what
 * the page watches and lets a test say which headings crossed the reading line.
 */
class ReadingLine {
    readonly watched: Element[] = [];
    constructor(private readonly report: IntersectionObserverCallback) { readingLines.push(this); }
    observe(el: Element): void { this.watched.push(el); }
    /** Headings that went past the line (true) or came back below it (false), as one report. */
    cross(...changes: [Element, boolean][]): void {
        const entries = changes.map(([target, isIntersecting]) => ({ target, isIntersecting }) as IntersectionObserverEntry);
        this.report(entries, this as unknown as IntersectionObserver);
    }
}
let readingLines: ReadingLine[];

beforeEach(() => {
    scrolledTo = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolledTo.push(this); };
    readingLines = [];
    vi.stubGlobal('IntersectionObserver', ReadingLine);
});
afterEach(() => {
    vi.unstubAllGlobals();
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

    it('marks in Contents the section being read: the last heading scrolled past, and none above the first', async () => {
        await install();
        const [line] = readingLines;
        const headings = Array.from(chapters()[0].querySelectorAll('h3'));
        const reading = () => all('.manual-contents-sections > li.is-reading').map(entry => entry.textContent);
        expect(line.watched).toHaveLength(all('.manual-chapter h3').length);
        expect(reading()).toEqual([]);

        line.cross([headings[0], true]);
        expect(reading()).toEqual([headings[0].textContent]);

        // A fast scroll takes two headings past the line at once: the later one is being read.
        line.cross([headings[2], true], [headings[1], true]);
        expect(reading()).toEqual([headings[2].textContent]);

        // Scrolling back up brings the third heading below the line again.
        line.cross([headings[2], false]);
        expect(reading()).toEqual([headings[1].textContent]);

        line.cross([headings[0], false], [headings[1], false]);
        expect(reading()).toEqual([]);
    });

    it('opens a link out of a chapter in a tab of its own, which cannot reach back into the app', async () => {
        await install();
        const links = all<HTMLAnchorElement>('.manual-chapter a');
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect([link.href.startsWith('https://'), link.target, link.rel]).toEqual([true, '_blank', 'noopener noreferrer']);
    });

    it('shows the About card alone in a demo build, which ships no manual', async () => {
        await install({ variant: 'standard', demo: true });
        expect(q('#about-version').textContent).toBe(__APP_VERSION__);
        expect(hidden(q('#about-panel-about'))).toBe(false);
        expect(all('.about-tab, .manual-chapter, #about-panel-help')).toEqual([]);
    });
});
