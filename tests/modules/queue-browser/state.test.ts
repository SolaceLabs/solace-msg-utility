import { describe, it, expect, beforeEach } from 'vitest';
import { state, getBrowser, setBrowser, deleteBrowser, getMessages, setMessages, addMessage, clearStore, shouldShowMessage, ingestMessage, wireIngestUi } from '../../../src/modules/queue-browser/state.js';
import { DEFAULT_MAX_MESSAGES_PER_QUEUE } from '../../../src/modules/queue-browser/constants.js';
import { resetQueueBrowserState } from '../../helpers/resetQueueBrowserState';

describe('queue-browser/state', () => {
    beforeEach(() => {
        resetQueueBrowserState();
        wireIngestUi(null);
    });

    describe('browser accessors', () => {
        it('setBrowser / getBrowser / deleteBrowser', () => {
            const browser = { id: 'test' };
            setBrowser('q1', browser);
            expect(getBrowser('q1')).toBe(browser);

            deleteBrowser('q1');
            expect(getBrowser('q1')).toBeUndefined();
        });
    });

    describe('message store', () => {
        it('setMessages / getMessages', () => {
            const msgs = [{ id: '1' }];
            setMessages('q1', msgs);
            expect(getMessages('q1')).toBe(msgs);
        });

        it('addMessage pushes to existing store', () => {
            setMessages('q1', []);
            addMessage('q1', { id: '1' });
            expect(getMessages('q1')!.length).toBe(1);
        });

        it('addMessage does nothing for nonexistent queue', () => {
            addMessage('nonexistent', { id: '1' });
            expect(getMessages('nonexistent')).toBeUndefined();
        });

        it('clearStore clears all messages', () => {
            setMessages('q1', [{ id: '1' }]);
            setMessages('q2', [{ id: '2' }]);
            clearStore();
            expect(state.messageStore.size).toBe(0);
        });
    });

    describe('ingestMessage() — moving window', () => {
        it('pushes message when under cap', () => {
            setMessages('q1', []);
            state.maxMessagesPerQueue = 5;
            ingestMessage('q1', { id: 'a' });
            ingestMessage('q1', { id: 'b' });
            expect(getMessages('q1')!.map((m: any) => m.id)).toEqual(['a', 'b']);
        });

        it('drops oldest and pushes newest when at cap', () => {
            setMessages('q1', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
            state.maxMessagesPerQueue = 3;
            ingestMessage('q1', { id: 'd' });
            expect(getMessages('q1')!.map((m: any) => m.id)).toEqual(['b', 'c', 'd']);
            expect(getMessages('q1')!.length).toBe(3);
        });

        it('does nothing for nonexistent queue', () => {
            ingestMessage('nonexistent', { id: '1' });
            expect(getMessages('nonexistent')).toBeUndefined();
        });

        it('calls wired removeRow with dropped id when current queue is active', () => {
            const removed: string[] = [];
            wireIngestUi((id: string) => removed.push(id));
            const a = { id: 'a' };
            const b = { id: 'b' };
            setMessages('q1', [a, b]);
            state.allMessages = getMessages('q1')!;
            state.displayedMessages = state.allMessages;
            state.currentQueue = 'q1';
            state.maxMessagesPerQueue = 2;
            ingestMessage('q1', { id: 'c' });
            expect(removed).toEqual(['a']);
        });

        it('does not call removeRow when ingesting for a non-active queue', () => {
            const removed: string[] = [];
            wireIngestUi((id: string) => removed.push(id));
            setMessages('q2', [{ id: 'a' }, { id: 'b' }]);
            state.currentQueue = 'q1'; // viewing q1, message arrives on q2
            state.maxMessagesPerQueue = 2;
            ingestMessage('q2', { id: 'c' });
            expect(removed).toEqual([]);
        });

        it('removes dropped message from filtered displayedMessages', () => {
            const a = { id: 'a' };
            const b = { id: 'b' };
            setMessages('q1', [a, b]);
            state.allMessages = getMessages('q1')!;
            // Filtered view: separate array reference, both messages visible
            state.displayedMessages = [a, b];
            state.currentQueue = 'q1';
            state.maxMessagesPerQueue = 2;
            ingestMessage('q1', { id: 'c' });
            expect(state.displayedMessages.map((m: any) => m.id)).toEqual(['b']);
        });

        it('skips removeRow safely when no UI is wired', () => {
            wireIngestUi(null);
            setMessages('q1', [{ id: 'a' }]);
            state.allMessages = getMessages('q1')!;
            state.displayedMessages = state.allMessages;
            state.currentQueue = 'q1';
            state.maxMessagesPerQueue = 1;
            expect(() => ingestMessage('q1', { id: 'b' })).not.toThrow();
            expect(getMessages('q1')!.map((m: any) => m.id)).toEqual(['b']);
        });
    });

    describe('shouldShowMessage()', () => {
        const baseMsg = {
            id: 'msg-123',
            content: 'Hello World Order',
            type: 'Text',
            _originalMsg: {
                getDestination: () => ({
                    getName: () => 'test/topic',
                    getType: () => 0 // TOPIC
                })
            },
            msgProperties: { 'Corr Id': 'abc-123', Priority: 5 },
            appProperties: { customKey: 'customValue' }
        };

        it('returns true when no filters are active', () => {
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('filters by content (contains)', () => {
            state.activeFilters.content = 'World';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.content = 'xyz';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('filters by message ID (wildcard)', () => {
            state.activeFilters.msgId = 'msg*';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.msgId = 'other*';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('filters by message type', () => {
            state.activeFilters.msgType = 'Text';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.msgType = 'Binary';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('filters by destination name', () => {
            state.activeFilters.dest = 'test*';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.dest = 'other*';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('filters by destination type', () => {
            (window as any).solace = {
                DestinationType: { TOPIC: 0, QUEUE: 1 }
            };
            state.activeFilters.type = 'Topic';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.type = 'Queue';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('handles message with no destination', () => {
            const msgNoDest = { ...baseMsg, _originalMsg: { getDestination: () => null } };
            state.activeFilters.dest = 'test*';
            expect(shouldShowMessage(msgNoDest)).toBe(false);
        });

        it('filters by properties (standard)', () => {
            state.activeFilters.properties = [{ key: 'Corr Id', value: 'abc*' }];
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.properties = [{ key: 'Corr Id', value: 'xyz*' }];
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('filters by properties (application)', () => {
            state.activeFilters.properties = [{ key: 'customKey', value: 'customValue' }];
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('property filter case-insensitive key match', () => {
            state.activeFilters.properties = [{ key: 'corr id', value: 'abc*' }];
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('AND criteria requires all filters to match', () => {
            state.activeFilters.content = 'World';
            state.activeFilters.msgId = 'msg*';
            state.activeFilters.criteria = 'AND';
            expect(shouldShowMessage(baseMsg)).toBe(true);

            state.activeFilters.msgId = 'other*';
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('OR criteria requires any filter to match', () => {
            state.activeFilters.content = 'xyz';
            state.activeFilters.msgId = 'msg*';
            state.activeFilters.criteria = 'OR';
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('handles destination type filtering with dest name only', () => {
            state.activeFilters.dest = 'test/topic';
            state.activeFilters.type = 'ANY';
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('filters by Queue destination type', () => {
            const queueMsg = {
                ...baseMsg,
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'my-queue',
                        getType: () => 1 // QUEUE
                    })
                }
            };
            (window as any).solace = {
                DestinationType: { TOPIC: 0, QUEUE: 1 }
            };
            state.activeFilters.type = 'Queue';
            expect(shouldShowMessage(queueMsg)).toBe(true);

            state.activeFilters.type = 'Topic';
            expect(shouldShowMessage(queueMsg)).toBe(false);
        });

        it('filters by properties with value-only match', () => {
            state.activeFilters.properties = [{ key: 'customKey', value: '' }];
            expect(shouldShowMessage(baseMsg)).toBe(true);
        });

        it('filters with empty property key (no match)', () => {
            state.activeFilters.properties = [{ key: '', value: 'val' }];
            expect(shouldShowMessage(baseMsg)).toBe(false);
        });

        it('matches property filter from appProperties', () => {
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'appKey', value: 'appVal' }]
            };
            const msg = {
                id: '1', content: '', type: 'Text',
                msgProperties: {},
                appProperties: { appKey: 'appVal' }
            };
            expect(shouldShowMessage(msg)).toBe(true);
        });

        it('matches destination name and type filter with solace global', () => {
            const solace = (window as any).solace;
            state.activeFilters = {
                content: '', msgId: '', dest: 'my-topic', type: 'Topic', msgType: 'ANY', properties: [], criteria: 'AND'
            };
            const msg = {
                id: '1', content: '', type: 'Text',
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'my-topic',
                        getType: () => solace.DestinationType.TOPIC
                    })
                }
            };
            expect(shouldShowMessage(msg)).toBe(true);
        });

        it('matches Queue destination type', () => {
            const solace = (window as any).solace;
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'Queue', msgType: 'ANY', properties: [], criteria: 'OR'
            };
            const msg = {
                id: '1', content: '', type: 'Text',
                _originalMsg: {
                    getDestination: () => ({
                        getName: () => 'my-queue',
                        getType: () => solace.DestinationType.QUEUE
                    })
                }
            };
            expect(shouldShowMessage(msg)).toBe(true);
        });

        it('property filter ignores message that has no msgProperties field', () => {
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'AppId', value: 'foo' }]
            };
            // No msgProperties key at all (not even empty object) — exercises the falsy outer guard
            const msg = { id: '1', content: '', type: 'Text', appProperties: {} };
            expect(shouldShowMessage(msg)).toBe(false);
        });

        it('property filter coerces null msgProperty value to empty string', () => {
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'Corr Id', value: '' }]
            };
            // msgProperty value is null — String(null || '') === '' which matches the empty value filter
            const msg = { id: '1', content: '', type: 'Text', msgProperties: { 'Corr Id': null }, appProperties: {} };
            expect(shouldShowMessage(msg)).toBe(true);
        });

        it('property filter coerces null appProperty value to empty string', () => {
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'region', value: '' }]
            };
            // appProperty value is null — String(null || '') === '' which matches the empty value filter
            const msg = { id: '1', content: '', type: 'Text', msgProperties: {}, appProperties: { region: null } };
            expect(shouldShowMessage(msg)).toBe(true);
        });

        it('property filter ignores message that has no appProperties field', () => {
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'something', value: 'val' }]
            };
            // No appProperties field — exercises the falsy outer guard on the second branch
            const msg = { id: '1', content: '', type: 'Text', msgProperties: {} };
            expect(shouldShowMessage(msg)).toBe(false);
        });

        it('property filter rejects when appProperty value mismatches', () => {
            // Covers the falsy branch of `if (matchString(val, fVal)) matchProp = true`
            // at state.js:191 — the appProperty matched the filter KEY (case-insensitive
            // 'region') but the VALUE 'eu-west' didn't match the filter value 'us-east'.
            // No msgProperties so the !matchProp short-circuit at state.js:187 doesn't
            // skip the appProperties block. A regression that flipped the boolean
            // (`if (!matchString(...))`) would invert every property filter — every
            // mismatched message would appear to match.
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'ANY', msgType: 'ANY', criteria: 'OR',
                properties: [{ key: 'region', value: 'us-east' }]
            };
            const msg = { id: '1', content: '', type: 'Text', appProperties: { region: 'eu-west' } };
            expect(shouldShowMessage(msg)).toBe(false);
        });

        it('property-filter dest with empty getName() coerces to empty string and rejects', () => {
            // Covers the falsy branch of `dest.getName() || ''` at state.js:152.
            // Without the `|| ''` fallback, `matchString(undefined, 'something')` would
            // throw `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`
            // — the test's hard-failure-on-regression is the actual contract being locked
            // in. Filter pattern is intentionally non-wildcard so matchString takes the
            // `text.toLowerCase()` path (the throwing one), not the regex path.
            (window as any).solace = { DestinationType: { TOPIC: 0, QUEUE: 1 } };
            const msg = {
                id: '1', content: '', type: 'Text',
                _originalMsg: {
                    getDestination: () => ({ getName: () => '', getType: () => 0 })
                }
            };
            state.activeFilters = {
                content: '', msgId: '', dest: 'something', type: 'ANY', msgType: 'ANY', properties: [], criteria: 'AND'
            };
            expect(shouldShowMessage(msg)).toBe(false);
        });

        describe('sender timestamp range', () => {
            // Fixed reference timestamp so the tests don't depend on Date.now().
            const T = Date.UTC(2026, 4, 17, 12, 0, 0); // 2026-05-17T12:00:00Z
            const msgWithTs = (ms: number | null) => ({
                id: 'm1',
                content: '',
                type: 'Text',
                msgProperties: {},
                appProperties: {},
                _originalMsg: { getDestination: () => ({ getName: () => 't', getType: () => 0 }) },
                dateMs: ms
            });

            it('passes message strictly newer than the newerThanMs bound', () => {
                state.activeFilters.newerThanMs = T;
                expect(shouldShowMessage(msgWithTs(T + 1000))).toBe(true);
            });

            it('passes message equal to the newerThanMs bound (inclusive)', () => {
                state.activeFilters.newerThanMs = T;
                expect(shouldShowMessage(msgWithTs(T))).toBe(true);
            });

            it('fails message older than the newerThanMs bound', () => {
                state.activeFilters.newerThanMs = T;
                expect(shouldShowMessage(msgWithTs(T - 1000))).toBe(false);
            });

            it('passes message strictly older than the olderThanMs bound', () => {
                state.activeFilters.olderThanMs = T;
                expect(shouldShowMessage(msgWithTs(T - 1000))).toBe(true);
            });

            it('passes message equal to the olderThanMs bound (inclusive)', () => {
                state.activeFilters.olderThanMs = T;
                expect(shouldShowMessage(msgWithTs(T))).toBe(true);
            });

            it('fails message newer than the olderThanMs bound', () => {
                state.activeFilters.olderThanMs = T;
                expect(shouldShowMessage(msgWithTs(T + 1000))).toBe(false);
            });

            it('passes message inside the [newer, older] range', () => {
                state.activeFilters.newerThanMs = T;
                state.activeFilters.olderThanMs = T + 60_000;
                expect(shouldShowMessage(msgWithTs(T + 30_000))).toBe(true);
            });

            it('fails message outside the range on the newer side', () => {
                state.activeFilters.newerThanMs = T;
                state.activeFilters.olderThanMs = T + 60_000;
                expect(shouldShowMessage(msgWithTs(T - 1))).toBe(false);
            });

            it('fails message outside the range on the older side', () => {
                state.activeFilters.newerThanMs = T;
                state.activeFilters.olderThanMs = T + 60_000;
                expect(shouldShowMessage(msgWithTs(T + 60_001))).toBe(false);
            });

            it('excludes messages without a numeric dateMs when a bound is set', () => {
                state.activeFilters.newerThanMs = T;
                expect(shouldShowMessage(msgWithTs(null))).toBe(false);
                expect(shouldShowMessage({ ...msgWithTs(0), dateMs: undefined })).toBe(false);
            });

            it('does not affect messages when no bound is set', () => {
                // Sanity: when both bounds are null, dateMs absence is irrelevant.
                expect(shouldShowMessage(msgWithTs(null))).toBe(true);
            });

            it('AND criteria: datetime range must hold alongside content filter', () => {
                state.activeFilters.criteria = 'AND';
                state.activeFilters.content = 'hello';
                state.activeFilters.newerThanMs = T;
                const m = { ...msgWithTs(T + 1000), content: 'hello world' };
                expect(shouldShowMessage(m)).toBe(true);

                // In-range but content mismatch → fails AND.
                expect(shouldShowMessage({ ...m, content: 'goodbye' })).toBe(false);

                // Content matches but out of range → fails AND.
                expect(shouldShowMessage({ ...m, dateMs: T - 1 })).toBe(false);
            });

            it('OR criteria: out-of-range message still passes when another filter matches', () => {
                state.activeFilters.criteria = 'OR';
                state.activeFilters.content = 'hello';
                state.activeFilters.newerThanMs = T;
                const m = { ...msgWithTs(T - 1000), content: 'hello world' };
                // Datetime fails but content matches → passes OR.
                expect(shouldShowMessage(m)).toBe(true);
            });
        });

        it('destination type filter rejects messages with unknown destination type', () => {
            // Covers the falsy branch of `else if (t === QUEUE)` at state.js:157 —
            // for any DestinationType that's neither TOPIC nor QUEUE (e.g. a future
            // SDK enum value), msgDestType must stay '' rather than crash. A regression
            // that added `else throw new Error(...)` would break installs on newer
            // SDKs; this test surfaces the throw before reaching the assertion.
            (window as any).solace = { DestinationType: { TOPIC: 0, QUEUE: 1 } };
            const msg = {
                id: '1', content: '', type: 'Text',
                _originalMsg: {
                    getDestination: () => ({ getName: () => 'foo', getType: () => 99 })
                }
            };
            state.activeFilters = {
                content: '', msgId: '', dest: '', type: 'Topic', msgType: 'ANY', properties: [], criteria: 'AND'
            };
            // msgDestType stays '' — '' !== 'Topic' so the destination block rejects.
            expect(shouldShowMessage(msg)).toBe(false);
        });
    });
});
