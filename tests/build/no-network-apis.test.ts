import { describe, it, expect } from 'vitest';
import { productSources, readSource } from '../helpers/sources';

/**
 * The app reaches the network through `fetch` and the Solace SDK only. That is
 * what lets the managed demo stay offline with two seams: its fetch
 * interceptor answers every request, and src/mock-broker/boot.managed.ts makes
 * the remaining APIs throw. A new XHR, beacon, event stream, socket, window or
 * scripted navigation in the app's source would be a request neither seam
 * sees. src/mock-broker/ is the demo itself (its shims name these APIs on
 * purpose) and is not scanned.
 *
 * tests/build/check-bundles.test.ts > "fails a demo that holds %s" is the same
 * guard on the built provisioned-demo.html.
 */
const FORBIDDEN: { api: string; re: RegExp }[] = [
    { api: 'XMLHttpRequest', re: /\bXMLHttpRequest\b/ },
    { api: 'navigator.sendBeacon', re: /\bsendBeacon\b/ },
    { api: 'EventSource', re: /\bEventSource\b/ },
    { api: 'new WebSocket', re: /\bnew\s+(?:window\.)?WebSocket\b/ },
    { api: 'window.open', re: /\bwindow\.open\s*\(/ },
    { api: 'location.assign / replace', re: /\blocation\.(?:assign|replace)\s*\(/ },
    { api: 'location.href assignment', re: /\blocation\.href\s*=(?!=)/ },
];

/** `file:line: api` for each line of `text` that uses a forbidden API. */
function uses(file: string, text: string): string[] {
    return text.split('\n').flatMap((line, i) =>
        FORBIDDEN.filter(f => f.re.test(line)).map(f => `${file}:${i + 1}: ${f.api}`));
}

describe('no network API but fetch in the app source', () => {
    it('scans the app, not the demo', () => {
        const files = productSources();
        expect(files).toContain('src/core/kernel.ts');
        expect(files).toContain('src/index.html');
        expect(files.some(f => f.startsWith('src/mock-broker/'))).toBe(false);
    });

    it('finds no XHR, beacon, event stream, socket, window.open or scripted navigation', () => {
        const hits = productSources().flatMap(f => uses(f, readSource(f)));
        expect(hits, 'route the request through fetch, which the demo intercepts, or add a shim to boot.managed.ts').toEqual([]);
    });

    it('recognises each forbidden use', () => {
        const sample = [
            'const x = new XMLHttpRequest();',
            'navigator.sendBeacon("/t", b);',
            'new EventSource("/s");',
            'const ws = new window.WebSocket(u);',
            'window.open(u);',
            'location.assign(u); location.replace(u);',
            'location.href = u;',
            'if (location.href === u) {}',
        ].join('\n');
        expect(uses('f.ts', sample)).toEqual([
            'f.ts:1: XMLHttpRequest',
            'f.ts:2: navigator.sendBeacon',
            'f.ts:3: EventSource',
            'f.ts:4: new WebSocket',
            'f.ts:5: window.open',
            'f.ts:6: location.assign / replace',
            'f.ts:7: location.href assignment',
        ]);
    });
});
