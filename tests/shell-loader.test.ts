import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readSource } from './helpers/sources';

/**
 * The shell's inline Solace library loader and its banner (src/index.html, the
 * `@vendor` blocks). Nothing bundles them, so the test reads the real scripts
 * out of the shell, evaluates them in jsdom with `document.head.appendChild`
 * stubbed to capture each script the loader adds, and fires `load` / `error` on
 * those scripts the way a browser would.
 */
const shell = readSource('src/index.html');
const LOADER = shell.match(/<!-- Solace Library Loader -->\s*<script>([\s\S]*?)<\/script>/)![1];
const BANNER = shell.match(/<div id="missing-lib-banner"[^>]*>[\s\S]*?<\/div>/)![0];
const AFTER_BANNER = shell.match(/<div id="missing-lib-banner"[^>]*>[\s\S]*?<\/div>\s*<script>([\s\S]*?)<\/script>/)![1];

const PENDING_TEXT = 'Loading the Solace library...';
const WATCHDOG_TEXT = 'The Solace library did not finish loading. Check that solclient.js is next to this page.';
const GLOBALS = ['solaceLibState', 'solaceLibApplyBanner', 'compareVersions', 'jszipLoaded'];

let appended: HTMLScriptElement[];
let settled: string[];
const onSettled = (e: Event) => settled.push((e as CustomEvent).detail.state);

const runLoader = () => new Function(LOADER)();
const runAfterBanner = () => new Function(AFTER_BANNER)();
const pending = (src: string) => appended.find((s) => s.getAttribute('src') === src)!;
const fire = (src: string, event: 'onload' | 'onerror') => (pending(src)[event] as unknown as () => void)();
const defineSolace = (version?: string) => {
    (window as any).solace = version === undefined ? {} : { Version: { version } };
};
const banner = () => document.getElementById('missing-lib-banner')!;
const state = () => (window as any).solaceLibState;

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    appended = [];
    settled = [];
    delete (window as any).solace;
    document.body.innerHTML = BANNER;
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
        appended.push(node as HTMLScriptElement);
        return node;
    }) as typeof document.head.appendChild);
    window.addEventListener('Solclient:settled', onSettled);
});

afterEach(() => {
    window.removeEventListener('Solclient:settled', onSettled);
    GLOBALS.forEach((g) => delete (window as any)[g]);
});

describe('shell loader -- the banner before any outcome', () => {
    it('ships visible with neutral text, and the loader leaves it alone while it works', () => {
        expect(banner().textContent).toBe(PENDING_TEXT);
        expect(banner().style.display).toBe('');
        expect(banner().classList.contains('is-pending')).toBe(true);

        runLoader();

        expect(state()).toBe('loading');
        expect(settled).toEqual([]);
        expect(banner().textContent).toBe(PENDING_TEXT);
        expect(banner().style.display).toBe('');
    });
});

describe('shell loader -- the SDK loads', () => {
    it('hides the banner and settles loaded when the first candidate defines a current SDK', () => {
        runLoader();
        expect(appended.map((s) => s.getAttribute('src'))).not.toContain('js/solclient.js');

        defineSolace('10.18.3');
        fire('solclient.js', 'onload');

        expect(state()).toBe('loaded');
        expect((window as any).solaceLibLoaded).toBe(true);
        expect(settled).toEqual(['loaded']);
        expect(banner().style.display).toBe('none');
    });

    it('proceeds as loaded when the SDK build reports no version', () => {
        runLoader();
        defineSolace();
        fire('solclient.js', 'onload');

        expect(state()).toBe('loaded');
        expect((window as any).solaceLibLoaded).toBe(true);
        expect(banner().style.display).toBe('none');
    });

    it('falls back to js/solclient.js when the first candidate fails to load', () => {
        runLoader();
        fire('solclient.js', 'onerror');

        expect(state()).toBe('loading');
        expect(settled).toEqual([]);
        expect(banner().textContent).toBe(PENDING_TEXT);

        defineSolace('10.20.0');
        fire('js/solclient.js', 'onload');

        expect(state()).toBe('loaded');
        expect(settled).toEqual(['loaded']);
        expect(banner().style.display).toBe('none');
    });
});

describe('shell loader -- the SDK is missing', () => {
    it('settles missing and shows the not-found error when both candidates fail', () => {
        runLoader();
        fire('solclient.js', 'onerror');
        fire('js/solclient.js', 'onerror');

        expect(state()).toBe('missing');
        expect((window as any).solaceLibLoaded).toBe(false);
        expect(settled).toEqual(['missing']);
        expect(banner().style.display).toBe('block');
        expect(banner().classList.contains('is-pending')).toBe(false);
        expect(banner().textContent).toContain('solclient.js not found');
    });

    it('tries the fallback when a candidate loads but defines no window.solace', () => {
        runLoader();
        fire('solclient.js', 'onload');

        expect(state()).toBe('loading');
        expect(settled).toEqual([]);
        expect(appended.map((s) => s.getAttribute('src'))).toContain('js/solclient.js');

        defineSolace('10.18.3');
        fire('js/solclient.js', 'onload');

        expect(state()).toBe('loaded');
        expect(settled).toEqual(['loaded']);
    });

    it('settles missing when the fallback loads without defining window.solace either', () => {
        runLoader();
        fire('solclient.js', 'onload');
        fire('js/solclient.js', 'onload');

        expect(state()).toBe('missing');
        expect(settled).toEqual(['missing']);
        expect(banner().style.display).toBe('block');
        expect(banner().textContent).toContain('solclient.js not found');
    });
});

describe('shell loader -- the SDK is too old', () => {
    it('settles outdated, keeps connecting disabled and names both versions in the banner', () => {
        runLoader();
        defineSolace('10.18.2');
        fire('solclient.js', 'onload');

        expect(state()).toBe('outdated');
        expect((window as any).solaceLibLoaded).toBe(false);
        expect(settled).toEqual(['outdated']);
        expect(banner().style.display).toBe('block');
        expect(banner().textContent).toContain('Outdated Library');
        expect(banner().textContent).toContain('Found Solclient 10.18.2, required 10.18.3+');
    });
});

describe('shell loader -- the outcome arrives before the banner is parsed', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('records a success and the script after the banner hides it', () => {
        runLoader();
        defineSolace('10.18.3');
        fire('solclient.js', 'onload');
        expect(state()).toBe('loaded');

        document.body.innerHTML = BANNER;
        expect(banner().style.display).toBe('');
        runAfterBanner();

        expect(banner().style.display).toBe('none');
    });

    it('records an error and the script after the banner shows it', () => {
        runLoader();
        fire('solclient.js', 'onerror');
        fire('js/solclient.js', 'onerror');

        document.body.innerHTML = BANNER;
        runAfterBanner();

        expect(banner().style.display).toBe('block');
        expect(banner().textContent).toContain('solclient.js not found');
    });

    it('leaves the banner as shipped when no outcome was recorded yet', () => {
        runLoader();
        document.body.innerHTML = BANNER;
        runAfterBanner();

        expect(banner().textContent).toBe(PENDING_TEXT);
        expect(banner().style.display).toBe('');
    });

    it('does nothing when the loader never ran, as in a shell built without it', () => {
        document.body.innerHTML = BANNER;
        expect(() => runAfterBanner()).not.toThrow();
        expect(banner().textContent).toBe(PENDING_TEXT);
    });
});

describe('shell loader -- the 30 second watchdog', () => {
    it('turns the banner into an error when no outcome arrives, without settling', () => {
        runLoader();
        vi.advanceTimersByTime(29_999);
        expect(banner().textContent).toBe(PENDING_TEXT);

        vi.advanceTimersByTime(1);

        expect(banner().textContent).toBe(WATCHDOG_TEXT);
        expect(banner().style.display).toBe('block');
        expect(banner().classList.contains('is-pending')).toBe(false);
        expect(state()).toBe('loading');
        expect(settled).toEqual([]);
    });

    it('is replaced by a late outcome', () => {
        runLoader();
        vi.advanceTimersByTime(30_000);
        defineSolace('10.18.3');
        fire('solclient.js', 'onload');

        expect(state()).toBe('loaded');
        expect(banner().style.display).toBe('none');
    });

    it('is cancelled by an outcome, so the banner stays hidden', () => {
        runLoader();
        vi.advanceTimersByTime(1_000);
        defineSolace('10.18.3');
        fire('solclient.js', 'onload');
        vi.advanceTimersByTime(60_000);

        expect(banner().style.display).toBe('none');
        expect(banner().textContent).not.toBe(WATCHDOG_TEXT);
    });

    it('is cancelled by a failure outcome, which keeps its own text', () => {
        runLoader();
        fire('solclient.js', 'onerror');
        fire('js/solclient.js', 'onerror');
        vi.advanceTimersByTime(60_000);

        expect(banner().textContent).toContain('solclient.js not found');
    });
});
