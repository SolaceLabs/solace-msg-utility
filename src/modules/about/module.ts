/**
 * About Module -- what the app is, its version and where the project lives,
 * and the manual.
 *
 * A static page: it reads nothing but the build's version and talks to no
 * broker and no gateway. Every variant lists it last, so it closes the sidebar.
 *
 * The Help tab is the manual: one chapter per module of the bundle, each
 * written in that module's own `help.html` and put into this module's template
 * by the build (`readModuleView` in scripts/module-registry-plugin.mjs). One
 * chapter shows at a time, like a manual opened at a chapter; the Contents
 * list beside it turns to a chapter or to one of its sections, and marks the
 * section being read as the reader scrolls. A demo build,
 * and a bundle none of whose modules has a chapter, ships no Help tab: the
 * template then holds the About card alone.
 */
import { required } from '../../core/dom';
import type { AppContext } from '../../core/types';

/** A Contents entry: a button, so the keyboard reaches it and no URL changes. */
function contentsButton(label: string, className: string, onClick: () => void): HTMLLIElement {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    item.appendChild(button);
    return item;
}

/**
 * How far down the pane the reading line sits, as the share of the pane below
 * it: a section counts as being read once its heading is above the line.
 */
const BELOW_READING_LINE = '60%';

/**
 * The pane an element is read in: its nearest ancestor that scrolls its
 * content, or null where the window itself scrolls.
 */
function scrollPaneOf(el: Element): Element | null {
    for (let pane = el.parentElement; pane; pane = pane.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(pane).overflowY)) return pane;
    }
    return null;
}

/**
 * Mark, in Contents, the section being read: the last heading the reader has
 * scrolled past. The observer's box is the pane the sheet scrolls in, stretched
 * far above it and cut off at the reading line, so a heading is in the box
 * exactly while it is past the line, on screen or scrolled away above. The box
 * has to be that pane's: measured against the window, a pane hides a heading
 * it has scrolled away, and the mark would last only while the heading shows.
 * A heading of a chapter that is not on show, or of a page that is not, is
 * never in the box, so nothing is marked for it.
 *
 * @param sheet   the sheet the chapters are on
 * @param entries each section heading, with its entry in Contents
 */
function followReading(sheet: HTMLElement, entries: Map<Element, HTMLElement>): void {
    const headings = Array.from(entries.keys());
    const passed = new Set<Element>();
    const observer = new IntersectionObserver((changes) => {
        for (const change of changes) {
            if (change.isIntersecting) passed.add(change.target);
            else passed.delete(change.target);
        }
        const reading = headings.filter(heading => passed.has(heading)).at(-1);
        entries.forEach((entry, heading) => entry.classList.toggle('is-reading', heading === reading));
    }, { root: scrollPaneOf(sheet), rootMargin: `100000px 0px -${BELOW_READING_LINE} 0px` });
    headings.forEach(heading => observer.observe(heading));
}

/** The two tabs: the one pressed shows its panel and hides the other. */
function installTabs(container: HTMLElement): void {
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.tab'));
    const panelOf = (tab: HTMLButtonElement) => required<HTMLElement>(container, `#${tab.getAttribute('aria-controls')}`);
    for (const tab of tabs) {
        tab.addEventListener('click', () => {
            for (const other of tabs) {
                const selected = other === tab;
                other.classList.toggle('is-active', selected);
                other.setAttribute('aria-selected', String(selected));
                panelOf(other).classList.toggle('hidden', !selected);
            }
        });
    }
}

/**
 * The manual: number the chapters, build the Contents list from their titles
 * and section headings, and show one chapter at a time.
 */
function installManual(container: HTMLElement): void {
    const sheet = required<HTMLElement>(container, '#manual-sheet');
    const list = required<HTMLElement>(container, '#manual-contents-list');
    const prev = required<HTMLButtonElement>(container, '#btn-manual-prev');
    const next = required<HTMLButtonElement>(container, '#btn-manual-next');
    const chapters = Array.from(sheet.querySelectorAll<HTMLElement>('.manual-chapter'));
    /** Each section heading, with its entry in Contents. */
    const sectionEntries = new Map<Element, HTMLElement>();
    let current = 0;

    /** Show one chapter and mark it in the Contents list. */
    function show(index: number): void {
        current = index;
        chapters.forEach((chapter, i) => chapter.classList.toggle('hidden', i !== index));
        Array.from(list.children).forEach((item, i) => item.classList.toggle('is-current', i === index));
        prev.disabled = index === 0;
        next.disabled = index === chapters.length - 1;
    }

    /** Turn to a chapter, at its top or at one of its headings. */
    function turnTo(index: number, heading: HTMLElement = sheet): void {
        show(index);
        heading.scrollIntoView({ block: 'start' });
    }

    chapters.forEach((chapter, index) => {
        chapter.dataset.number = String(index + 1);
        const title = required<HTMLElement>(chapter, 'h2');
        const entry = contentsButton(`${index + 1}. ${title.textContent}`, 'manual-contents-chapter', () => turnTo(index));
        const sections = document.createElement('ol');
        sections.className = 'manual-contents-sections';
        chapter.querySelectorAll<HTMLElement>('h3').forEach((heading) => {
            const section = contentsButton(String(heading.textContent), 'manual-contents-section', () => turnTo(index, heading));
            sectionEntries.set(heading, section);
            sections.appendChild(section);
        });
        entry.appendChild(sections);
        list.appendChild(entry);
    });

    // A link out of the manual (the guides on GitHub) opens beside the app, never in its place.
    sheet.querySelectorAll<HTMLAnchorElement>('.manual-chapter a').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    });

    prev.addEventListener('click', () => turnTo(current - 1));
    next.addEventListener('click', () => turnTo(current + 1));

    // Opened at the first chapter without scrolling: the page is not on screen yet.
    show(0);
    followReading(sheet, sectionEntries);
}

export const AboutModule = {
    name: 'About',
    id: 'about',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',

    async install(app: AppContext) {
        const { container } = app;
        required<HTMLElement>(container, '#about-version').textContent = __APP_VERSION__;
        // The Help tab is in the template only when the build gave it a manual.
        if (container.querySelector('#about-panel-help')) {
            installTabs(container);
            installManual(container);
        }
    },
};
