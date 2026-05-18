import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    verifySource,
    parseSempV1Response,
    msgIdToString,
    compareMsgIds,
    ACCUMULATE_IDLE_MS,
    normalizeAccessType,
} from '../../../src/modules/queue-copy/service-verify';
import { createSessionMock, createBrowserMock } from '../../setup';
import type { SempContext } from '../../../src/core/connections/types';
import type { VerifyResult } from '../../../src/modules/queue-copy/state';

function makeSempCtx(fetchImpl: any, baseUrl = 'https://broker.example:1943/SEMP/v2'): SempContext {
    return { fetch: fetchImpl, baseUrl };
}

function textRes(text: string, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: init.statusText ?? 'OK',
        text: async () => text,
    } as unknown as Response;
}

function emptyResult(via: 'semp' | 'queue-browser'): VerifyResult {
    return {
        sourceOk: false, via, errors: [],
        messageVpn: null, messageCount: null, spoolUsageBytes: null,
        quotaBytes: null, maxMessageSize: null,
        oldestMsgId: null, newestMsgId: null, accessType: null, owner: null,
    };
}

const SAMPLE_RESPONSE = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues>
          <queue>
            <name>test-all</name>
            <info>
              <message-vpn>vpn-01</message-vpn>
              <num-messages-spooled>18</num-messages-spooled>
              <current-spool-usage-in-bytes>2937</current-spool-usage-in-bytes>
              <quota>5000</quota>
              <max-message-size>10000000</max-message-size>
            </info>
          </queue>
        </queues>
      </queue>
    </show>
  </rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

const NOT_FOUND_RESPONSE = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues></queues>
      </queue>
    </show>
  </rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

describe('queue-copy/service-verify', () => {
    describe('parseSempV1Response', () => {
        it('extracts every field from a successful response', () => {
            const result = parseSempV1Response(SAMPLE_RESPONSE, 'test-all', 'vpn-01', emptyResult('semp'));
            expect(result.sourceOk).toBe(true);
            expect(result.messageVpn).toBe('vpn-01');
            expect(result.messageCount).toBe(18);
            expect(result.spoolUsageBytes).toBe(2937);
            expect(result.quotaBytes).toBe(5000 * 1024 * 1024);
            expect(result.maxMessageSize).toBe(10_000_000);
        });

        it('returns sourceOk=false with "not found" when no <queue> entry', () => {
            const result = parseSempV1Response(NOT_FOUND_RESPONSE, 'missing', 'v', emptyResult('semp'));
            expect(result.sourceOk).toBe(false);
            expect(result.errors[0]).toContain('not found');
            expect(result.errors[0]).toContain('missing');
            expect(result.errors[0]).toContain('"v"');
        });

        it('"not found" message uses "any VPN" when caller omits vpn filter', () => {
            const result = parseSempV1Response(NOT_FOUND_RESPONSE, 'q', '', emptyResult('semp'));
            expect(result.errors[0]).toContain('any VPN');
        });

        it('non-ok execute-result surfaces the reason', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues></queues></queue></show></rpc>` +
                `<execute-result code="fail" reason="permission-denied"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.sourceOk).toBe(false);
            expect(result.errors[0]).toContain('permission-denied');
        });

        it('non-ok execute-result without reason falls back to code', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues></queues></queue></show></rpc>` +
                `<execute-result code="bad"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.errors[0]).toContain('bad');
        });

        it('non-ok execute-result without code OR reason falls back to "error"', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues></queues></queue></show></rpc>` +
                `<execute-result/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.errors[0]).toContain('error');
        });

        it('queue present but missing info block returns sourceOk=true with null fields', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues>` +
                `<queue><name>q</name></queue></queues></queue></show></rpc>` +
                `<execute-result code="ok"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.sourceOk).toBe(true);
            expect(result.messageCount).toBeNull();
        });

        it('handles missing individual info fields gracefully', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues>` +
                `<queue><name>q</name><info><message-vpn>v</message-vpn></info></queue></queues></queue></show></rpc>` +
                `<execute-result code="ok"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.sourceOk).toBe(true);
            expect(result.messageVpn).toBe('v');
            expect(result.messageCount).toBeNull();
            expect(result.spoolUsageBytes).toBeNull();
            expect(result.quotaBytes).toBeNull();
            expect(result.maxMessageSize).toBeNull();
        });

        it('handles non-numeric values by leaving fields null', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues>` +
                `<queue><info><num-messages-spooled>not-a-number</num-messages-spooled></info></queue>` +
                `</queues></queue></show></rpc><execute-result code="ok"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.messageCount).toBeNull();
        });

        it('handles empty info field text by leaving fields null', () => {
            const xml = `<rpc-reply><rpc><show><queue><queues>` +
                `<queue><info><num-messages-spooled></num-messages-spooled></info></queue>` +
                `</queues></queue></show></rpc><execute-result code="ok"/></rpc-reply>`;
            const result = parseSempV1Response(xml, 'q', 'v', emptyResult('semp'));
            expect(result.messageCount).toBeNull();
        });

        it('reports a parse error for malformed XML', () => {
            const result = parseSempV1Response('<not><valid>xml', 'q', 'v', emptyResult('semp'));
            expect(result.sourceOk).toBe(false);
            expect(result.errors[0]).toContain('parse error');
        });
    });

    describe('SEMP v1 verify path', () => {
        it('POSTs the SEMP v1 RPC to {host}/SEMP and parses fields on success', async () => {
            const fetchImpl = vi.fn(async () => textRes(SAMPLE_RESPONSE));
            const ctx = makeSempCtx(fetchImpl);

            const result = await verifySource({
                sempCtx: ctx, primarySession: createSessionMock(),
                vpn: 'vpn-01', queue: 'test-all', signal: new AbortController().signal,
            });

            expect(result.sourceOk).toBe(true);
            expect(result.messageCount).toBe(18);
            expect(fetchImpl).toHaveBeenCalledWith(
                'https://broker.example:1943/SEMP',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('<name>test-all</name>'),
                }),
            );
            const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as string;
            expect(body).toContain('<vpn-name>vpn-01</vpn-name>');
            expect(body).toContain('<detail/>');
        });

        it('uses vpn-name="*" when caller passes empty vpn', async () => {
            const fetchImpl = vi.fn(async () => textRes(SAMPLE_RESPONSE));
            await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as string;
            expect(body).toContain('<vpn-name>*</vpn-name>');
        });

        it('escapes XML special characters in queue and VPN names', async () => {
            const fetchImpl = vi.fn(async () => textRes(SAMPLE_RESPONSE));
            await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'a&b', queue: '<q>"x"', signal: new AbortController().signal,
            });
            const body = (fetchImpl.mock.calls[0][1] as RequestInit).body as string;
            expect(body).toContain('a&amp;b');
            expect(body).toContain('&lt;q&gt;&quot;x&quot;');
        });

        it('returns "not found" error when response has no <queue> entry', async () => {
            const fetchImpl = vi.fn(async () => textRes(NOT_FOUND_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'missing', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(false);
            expect(result.errors[0]).toContain('not found');
        });

        it('non-2xx surfaces status text', async () => {
            const fetchImpl = vi.fn(async () => textRes('', { ok: false, status: 500, statusText: 'Boom' }));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toContain('500');
            expect(result.errors[0]).toContain('Boom');
        });

        it('non-2xx without statusText still surfaces the code', async () => {
            const fetchImpl = vi.fn(async () => textRes('', { ok: false, status: 503, statusText: '' }));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toBe('SEMP v1 returned 503');
        });

        it('aborts before fetch when signal already aborted', async () => {
            const fetchImpl = vi.fn();
            const ctrl = new AbortController();
            ctrl.abort();
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: ctrl.signal,
            });
            expect(result.errors).toContain('Verification cancelled.');
            expect(fetchImpl).not.toHaveBeenCalled();
        });

        it('handles abort during in-flight fetch', async () => {
            const ctrl = new AbortController();
            const fetchImpl = vi.fn(async () => {
                ctrl.abort();
                return textRes(SAMPLE_RESPONSE);
            });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: ctrl.signal,
            });
            expect(result.errors).toContain('Verification cancelled.');
        });

        it('catches AbortError thrown by fetch', async () => {
            const fetchImpl = vi.fn(async () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                throw err;
            });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors).toContain('Verification cancelled.');
        });

        it('catches other fetch errors with a SEMP error prefix', async () => {
            const fetchImpl = vi.fn(async () => { throw new Error('net down'); });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toContain('SEMP error');
            expect(result.errors[0]).toContain('net down');
        });

        it('falls back to "unknown" when caught error has no message', async () => {
            const fetchImpl = vi.fn(async () => { throw {}; });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toBe('SEMP error: unknown');
        });
    });

    describe('SEMP v1 newest-msg-id supplementary call (broker bug workaround)', () => {
        // The broker's `show queue … detail` returns 0 for <info>/<newest-msg-id>
        // (soltr/10_25_0VMR). verifyViaSempV1 issues a second RPC to recover the
        // real newest spooled message ID. These tests cover that second call.

        const NEWEST_ID_RESPONSE = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues>
          <queue>
            <name>test-all</name>
            <message-vpn>vpn-01</message-vpn>
            <spooled-messages>
              <spooled-message>
                <message-id>92</message-id>
                <message-sent>no</message-sent>
              </spooled-message>
              <count>9</count>
            </spooled-messages>
          </queue>
        </queues>
      </queue>
    </show>
  </rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

        const NEWEST_ID_EMPTY_RESPONSE = `<rpc-reply>
  <rpc><show><queue><queues><queue><name>test-all</name></queue></queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

        it('issues a second POST and populates newestMsgId from <spooled-message>/<message-id>', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(NEWEST_ID_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'vpn-01', queue: 'test-all', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBe('92');
            expect(fetchImpl).toHaveBeenCalledTimes(2);
            const body2 = (fetchImpl.mock.calls[1][1] as RequestInit).body as string;
            expect(body2).toContain('<name>test-all</name>');
            expect(body2).toContain('<vpn-name>vpn-01</vpn-name>');
            expect(body2).toContain('<messages/>');
            expect(body2).toContain('<newest/>');
            expect(body2).toContain('<num-elements>1</num-elements>');
            // The supplementary call must NOT request <detail/> — that's the
            // buggy path; this RPC is a different shape entirely.
            expect(body2).not.toContain('<detail/>');
        });

        it('supplementary call also uses vpn-name="*" when caller omits the VPN', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(NEWEST_ID_RESPONSE));
            await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            const body2 = (fetchImpl.mock.calls[1][1] as RequestInit).body as string;
            expect(body2).toContain('<vpn-name>*</vpn-name>');
        });

        it('empty queue (no <spooled-message>) → newestMsgId null, no error', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(NEWEST_ID_EMPTY_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
            expect(result.errors).toEqual([]);
        });

        it('supplementary fetch throws non-abort → sourceOk stays true, error logged', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockRejectedValueOnce(new Error('net flaked'));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
            expect(result.errors[0]).toContain('SEMP newest-id lookup failed');
            expect(result.errors[0]).toContain('net flaked');
        });

        it('supplementary fetch throws without message → "unknown" fallback', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockRejectedValueOnce({});
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.errors[0]).toBe('SEMP newest-id lookup failed: unknown');
        });

        it('supplementary non-2xx → newestMsgId null, no error pushed (silent skip)', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes('', { ok: false, status: 500, statusText: 'Boom' }));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
            expect(result.errors).toEqual([]);
        });

        it('supplementary execute-result code != ok → newestMsgId null', async () => {
            const failXml = `<rpc-reply><rpc><show><queue><queues></queues></queue></show></rpc>` +
                `<execute-result code="permission-denied"/></rpc-reply>`;
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(failXml));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
        });

        it('supplementary malformed XML (parsererror) → newestMsgId null', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes('<not><valid>xml'));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
        });

        it('supplementary DOMParser throw → newestMsgId null', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes('<x/>'));
            const orig = (globalThis as any).DOMParser;
            // Real DOMParser must run on the detail-call parseSempV1Response;
            // the throw needs to land only on the SECOND parseFromString call.
            let callCount = 0;
            class FlakyParser {
                parseFromString(xml: string, mime: string): any {
                    callCount += 1;
                    if (callCount === 2) throw new Error('parser bomb');
                    return new orig().parseFromString(xml, mime);
                }
            }
            (globalThis as any).DOMParser = FlakyParser;
            try {
                const result = await verifySource({
                    sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                    vpn: 'v', queue: 'q', signal: new AbortController().signal,
                });
                expect(result.sourceOk).toBe(true);
                expect(result.newestMsgId).toBeNull();
            } finally {
                (globalThis as any).DOMParser = orig;
            }
        });

        it('supplementary <message-id> is non-numeric → newestMsgId null (defensive)', async () => {
            const garbageId = `<rpc-reply><rpc><show><queue><queues><queue><spooled-messages>` +
                `<spooled-message><message-id>not-a-number</message-id></spooled-message>` +
                `</spooled-messages></queue></queues></queue></show></rpc>` +
                `<execute-result code="ok"/></rpc-reply>`;
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(garbageId));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
        });

        it('supplementary <message-id> with empty text → newestMsgId null', async () => {
            const emptyId = `<rpc-reply><rpc><show><queue><queues><queue><spooled-messages>` +
                `<spooled-message><message-id></message-id></spooled-message>` +
                `</spooled-messages></queue></queues></queue></show></rpc>` +
                `<execute-result code="ok"/></rpc-reply>`;
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockResolvedValueOnce(textRes(emptyId));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBeNull();
        });

        it('signal aborted between the two calls → supplementary not issued, cancelled', async () => {
            const ctrl = new AbortController();
            // Abort INSIDE the first fetch's resolver so the post-detail
            // signal.aborted check fires before the supplementary call.
            const fetchImpl = vi.fn(async () => {
                ctrl.abort();
                return textRes(SAMPLE_RESPONSE);
            });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: ctrl.signal,
            });
            // The first-call's post-fetch abort check fires first, so verify
            // is cancelled there — supplementary never runs.
            expect(result.sourceOk).toBe(false);
            expect(result.errors).toContain('Verification cancelled.');
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });

        it('signal aborted between detail-parse and supplementary call', async () => {
            // Exercises the explicit `if (signal.aborted)` guard between the
            // detail parse and the supplementary fetch. The abort fires
            // during `await res.text()` — after the first post-fetch check
            // passed (step B) but before the between-calls check (step D).
            const ctrl = new AbortController();
            const detailRes = {
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => {
                    ctrl.abort();
                    return SAMPLE_RESPONSE;
                },
            } as unknown as Response;
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(detailRes)
                .mockResolvedValueOnce(textRes(NEWEST_ID_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: ctrl.signal,
            });
            expect(result.sourceOk).toBe(false);
            expect(result.errors).toContain('Verification cancelled.');
            // Supplementary call must not have been issued.
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });

        it('supplementary fetch throws AbortError → sourceOk flips to false, cancelled', async () => {
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(SAMPLE_RESPONSE))
                .mockImplementationOnce(async () => {
                    const e = new Error('aborted');
                    e.name = 'AbortError';
                    throw e;
                });
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(false);
            expect(result.errors).toContain('Verification cancelled.');
        });

        it('detail-call failure short-circuits — supplementary NOT issued', async () => {
            const fetchImpl = vi.fn(async () => textRes(NOT_FOUND_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'missing', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(false);
            expect(fetchImpl).toHaveBeenCalledTimes(1);
        });

        it('detail returns queue without <info> block → supplementary STILL issued', async () => {
            // The defensive "queue exists, info missing" branch should still
            // populate newestMsgId from the supplementary call.
            const noInfoXml = `<rpc-reply><rpc><show><queue><queues>` +
                `<queue><name>q</name></queue></queues></queue></show></rpc>` +
                `<execute-result code="ok"/></rpc-reply>`;
            const fetchImpl = vi.fn()
                .mockResolvedValueOnce(textRes(noInfoXml))
                .mockResolvedValueOnce(textRes(NEWEST_ID_RESPONSE));
            const result = await verifySource({
                sempCtx: makeSempCtx(fetchImpl), primarySession: createSessionMock(),
                vpn: 'v', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.sourceOk).toBe(true);
            expect(result.newestMsgId).toBe('92');
            expect(fetchImpl).toHaveBeenCalledTimes(2);
        });
    });

    describe('QueueBrowser-accumulate fallback (no SEMP)', () => {
        let session: ReturnType<typeof createSessionMock>;
        let browser: ReturnType<typeof createBrowserMock>;

        beforeEach(() => {
            browser = createBrowserMock();
            session = createSessionMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
        });

        it('UP + idle window with no MESSAGE settles with count=0', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            expect(result.via).toBe('queue-browser');
            expect(result.messageCount).toBe(0);
            expect(result.spoolUsageBytes).toBe(0);
            expect(browser.disconnect).toHaveBeenCalled();
            vi.useRealTimers();
        });

        it('accumulates count + size as MESSAGE events arrive', async () => {
            vi.useFakeTimers();
            const onProgress = vi.fn();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
                onProgress,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 100 } });
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 250 } });
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.messageCount).toBe(2);
            expect(result.spoolUsageBytes).toBe(350);
            expect(onProgress).toHaveBeenCalledTimes(2);
            vi.useRealTimers();
        });

        it('messages without smfHeader.messageLength still bump count, sizeBytes stays 0', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            (browser as any)._handlers.MESSAGE({});
            (browser as any)._handlers.MESSAGE(null);
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.messageCount).toBe(2);
            expect(result.spoolUsageBytes).toBe(0);
            vi.useRealTimers();
        });

        it('CONNECT_FAILED_ERROR settles with the infoStr', async () => {
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.CONNECT_FAILED_ERROR({ infoStr: 'denied' });
            const result = await promise;
            expect(result.sourceOk).toBe(false);
            expect(result.errors[0]).toBe('denied');
        });

        it('CONNECT_FAILED_ERROR with no infoStr falls back to a generic default', async () => {
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q-x', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.CONNECT_FAILED_ERROR({});
            const result = await promise;
            expect(result.errors[0]).toContain('q-x');
        });

        it('DOWN_ERROR before UP fails with infoStr', async () => {
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.DOWN_ERROR({ infoStr: 'Bind failed' });
            const result = await promise;
            expect(result.errors[0]).toBe('Bind failed');
        });

        it('DOWN_ERROR before UP without infoStr falls back to "Browser bind failed."', async () => {
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.DOWN_ERROR({});
            const result = await promise;
            expect(result.errors[0]).toBe('Browser bind failed.');
        });

        it('DOWN_ERROR after UP settles successfully with whatever was accumulated', async () => {
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            (browser as any)._handlers.MESSAGE({ smfHeader: { messageLength: 50 } });
            (browser as any)._handlers.DOWN_ERROR({});
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            expect(result.messageCount).toBe(1);
        });

        it('returns "no session" error when primarySession is null', async () => {
            const result = await verifySource({
                sempCtx: null, primarySession: null,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toContain('No primary Solace session');
        });

        it('aborts via signal — disconnects browser', async () => {
            const ctrl = new AbortController();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: ctrl.signal,
            });
            await Promise.resolve();
            ctrl.abort();
            const result = await promise;
            expect(result.errors).toContain('Verification cancelled.');
            expect(browser.disconnect).toHaveBeenCalled();
        });

        it('hard timeout fires before UP', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await vi.advanceTimersByTimeAsync(10_000);
            const result = await promise;
            expect(result.errors[0]).toContain('timed out');
            vi.useRealTimers();
        });

        it('hard timeout after UP is a no-op (idle takes over)', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(10_000);
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            vi.useRealTimers();
        });

        it('handles synchronous browser.connect throw', async () => {
            (browser.connect as any).mockImplementation(() => { throw new Error('sync fail'); });
            const result = await verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toBe('sync fail');
        });

        it('connect throw without message falls back to generic', async () => {
            (browser.connect as any).mockImplementation(() => { throw {}; });
            const result = await verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            expect(result.errors[0]).toBe('Failed to start verification probe.');
        });

        it('GM_DISABLED during accumulation is a no-op', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            (browser as any)._handlers.GM_DISABLED();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            vi.useRealTimers();
        });

        it('disconnect during cleanup is swallowed when it throws', async () => {
            (browser.disconnect as any).mockImplementation(() => { throw new Error('cleanup fail'); });
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            vi.useRealTimers();
        });

        it('a second event after settle is a no-op', async () => {
            vi.useFakeTimers();
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            (browser as any)._handlers.DOWN_ERROR({ infoStr: 'late' });
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            expect(result.errors).toEqual([]);
            vi.useRealTimers();
        });
    });

    describe('parseSempV1Response — DOMParser exception path', () => {
        // The try/catch around `new DOMParser().parseFromString()` covers the
        // (unlikely-but-possible) case where the parser itself throws rather
        // than embedding a `<parsererror>` node in the result. We force this
        // by stubbing DOMParser globally for the duration of the test.
        it('parser throw is reported as a SEMP v1 parse error', () => {
            const orig = (globalThis as any).DOMParser;
            class ThrowingParser { parseFromString() { throw new Error('boom'); } }
            (globalThis as any).DOMParser = ThrowingParser;
            try {
                const result = parseSempV1Response('<x/>', 'q', 'v', emptyResult('semp'));
                expect(result.sourceOk).toBe(false);
                expect(result.errors[0]).toContain('parse error');
                expect(result.errors[0]).toContain('boom');
            } finally {
                (globalThis as any).DOMParser = orig;
            }
        });

        it('parser throw without a message falls back to "unknown"', () => {
            const orig = (globalThis as any).DOMParser;
            class ThrowingParser { parseFromString() { throw {}; } }
            (globalThis as any).DOMParser = ThrowingParser;
            try {
                const result = parseSempV1Response('<x/>', 'q', 'v', emptyResult('semp'));
                expect(result.errors[0]).toContain('unknown');
            } finally {
                (globalThis as any).DOMParser = orig;
            }
        });
    });

    describe('msgIdToString', () => {
        it('returns the message id as a decimal string', () => {
            const msg = { getGuaranteedMessageId: () => 1234567890 };
            expect(msgIdToString(msg)).toBe('1234567890');
        });

        it('handles SDK Long-like objects via toString', () => {
            const msg = { getGuaranteedMessageId: () => ({ toString: () => '99999999999999' }) };
            expect(msgIdToString(msg)).toBe('99999999999999');
        });

        it('returns null when the message has no getGuaranteedMessageId', () => {
            expect(msgIdToString({})).toBeNull();
            expect(msgIdToString(null)).toBeNull();
            expect(msgIdToString(undefined)).toBeNull();
        });

        it('returns null when getGuaranteedMessageId returns null/undefined', () => {
            expect(msgIdToString({ getGuaranteedMessageId: () => null })).toBeNull();
            expect(msgIdToString({ getGuaranteedMessageId: () => undefined })).toBeNull();
        });

        it('returns null when getGuaranteedMessageId throws', () => {
            const msg = { getGuaranteedMessageId: () => { throw new Error('not bound'); } };
            expect(msgIdToString(msg)).toBeNull();
        });
    });

    describe('compareMsgIds', () => {
        it('returns negative / zero / positive for numeric ID strings', () => {
            expect(compareMsgIds('100', '200')).toBeLessThan(0);
            expect(compareMsgIds('200', '100')).toBeGreaterThan(0);
            expect(compareMsgIds('100', '100')).toBe(0);
        });

        it('compares 64-bit IDs without precision loss (BigInt path)', () => {
            // Both above 2^53 — Number comparison would lose precision here.
            expect(compareMsgIds('9007199254740993', '9007199254740994')).toBeLessThan(0);
            expect(compareMsgIds('9007199254740994', '9007199254740993')).toBeGreaterThan(0);
        });

        it('falls back to lexicographic when inputs are not numeric', () => {
            expect(compareMsgIds('abc', 'abd')).toBeLessThan(0);
            expect(compareMsgIds('xyz', 'abc')).toBeGreaterThan(0);
            expect(compareMsgIds('same', 'same')).toBe(0);
        });
    });

    describe('verifyViaQueueBrowserAccumulate — oldest / newest msg ID tracking', () => {
        it('captures min and max guaranteed message IDs from the browsed messages', async () => {
            vi.useFakeTimers();
            const session = createSessionMock();
            const browser = createBrowserMock();
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            // Fire MESSAGEs with IDs out-of-order to prove min/max tracking
            // (vs trusting browse order). Includes a non-numeric ID for the
            // lexicographic fallback path. smfHeader.messageLength contributes
            // to size accumulation.
            const m = (id: any, len = 100) => ({
                getGuaranteedMessageId: () => id,
                smfHeader: { messageLength: len },
            });
            (browser as any)._handlers.MESSAGE(m(105));
            (browser as any)._handlers.MESSAGE(m(100));
            (browser as any)._handlers.MESSAGE(m(110));
            (browser as any)._handlers.MESSAGE({ smfHeader: {} }); // no id — skipped
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.sourceOk).toBe(true);
            expect(result.oldestMsgId).toBe('100');
            expect(result.newestMsgId).toBe('110');
            expect(result.messageCount).toBe(4);
            vi.useRealTimers();
        });
    });

    describe('normalizeAccessType', () => {
        it('treats null/undefined/empty/whitespace as null (unknown)', () => {
            expect(normalizeAccessType(null)).toBeNull();
            expect(normalizeAccessType(undefined)).toBeNull();
            expect(normalizeAccessType('')).toBeNull();
            expect(normalizeAccessType('   ')).toBeNull();
        });

        it('SEMP "No-Access" prefix → no-access (not read-only — copy must also be blocked)', () => {
            expect(normalizeAccessType('No-Access')).toBe('no-access');
            expect(normalizeAccessType('No-Access (1001)')).toBe('no-access');
            expect(normalizeAccessType('No-Access12')).toBe('no-access');
        });

        it('SEMP "Read-Only" prefix → read-only (copy allowed; move blocked)', () => {
            expect(normalizeAccessType('Read-Only')).toBe('read-only');
            expect(normalizeAccessType('Read-Only (1000)')).toBe('read-only');
            expect(normalizeAccessType('Read-Only5')).toBe('read-only');
            expect(normalizeAccessType('Read-Only-XYZ')).toBe('read-only');
        });

        it('SDK "READ_ONLY" → read-only', () => {
            expect(normalizeAccessType('READ_ONLY')).toBe('read-only');
        });

        it('SEMP "Consume" / "Modify-Topic" / "Delete" → read-write (move-capable)', () => {
            expect(normalizeAccessType('Consume')).toBe('read-write');
            expect(normalizeAccessType('Consume (1100)')).toBe('read-write');
            expect(normalizeAccessType('Modify-Topic (1110)')).toBe('read-write');
            expect(normalizeAccessType('Delete (1111)')).toBe('read-write');
        });

        it('SDK "READ_WRITE" → read-write', () => {
            expect(normalizeAccessType('READ_WRITE')).toBe('read-write');
        });

        it('any other non-matching value → read-write (permissive default)', () => {
            // Defensive: rather than treat unknown brokers as locked, fall
            // back to letting the broker enforce. The modal's gate only
            // blocks explicit no-access (both modes) and read-only (move only).
            expect(normalizeAccessType('Subscribe-Only')).toBe('read-write');
        });
    });

    describe('accessType extraction from SEMP <others-permission>', () => {
        const xmlWithPermission = (perm: string, owner: string = '') =>
            `<rpc-reply><rpc><show><queue><queues>` +
            `<queue><info><message-vpn>v</message-vpn>` +
            `<owner>${owner}</owner>` +
            `<others-permission>${perm}</others-permission>` +
            `</info></queue></queues></queue></show></rpc>` +
            `<execute-result code="ok"/></rpc-reply>`;

        it('parses Read-Only (1000) as accessType=read-only', () => {
            const result = parseSempV1Response(xmlWithPermission('Read-Only (1000)'), 'q', 'v', emptyResult('semp'));
            expect(result.accessType).toBe('read-only');
        });

        it('parses No-Access (1001) as accessType=no-access', () => {
            const result = parseSempV1Response(xmlWithPermission('No-Access (1001)'), 'q', 'v', emptyResult('semp'));
            expect(result.accessType).toBe('no-access');
        });

        it('parses Consume (1100) as accessType=read-write', () => {
            const result = parseSempV1Response(xmlWithPermission('Consume (1100)'), 'q', 'v', emptyResult('semp'));
            expect(result.accessType).toBe('read-write');
        });

        it('parses Delete (1111) as accessType=read-write', () => {
            const result = parseSempV1Response(xmlWithPermission('Delete (1111)'), 'q', 'v', emptyResult('semp'));
            expect(result.accessType).toBe('read-write');
        });

        it('parses Modify-Topic (1110) as accessType=read-write', () => {
            const result = parseSempV1Response(xmlWithPermission('Modify-Topic (1110)'), 'q', 'v', emptyResult('semp'));
            expect(result.accessType).toBe('read-write');
        });

        it('SAMPLE_RESPONSE with no <others-permission> element → accessType null', () => {
            const result = parseSempV1Response(SAMPLE_RESPONSE, 'test-all', 'vpn-01', emptyResult('semp'));
            expect(result.accessType).toBeNull();
        });
    });

    describe('owner extraction from SEMP <owner>', () => {
        const xmlWithOwner = (owner: string) =>
            `<rpc-reply><rpc><show><queue><queues>` +
            `<queue><info><message-vpn>v</message-vpn>` +
            `<owner>${owner}</owner>` +
            `<others-permission>Read-Only (1000)</others-permission>` +
            `</info></queue></queues></queue></show></rpc>` +
            `<execute-result code="ok"/></rpc-reply>`;

        it('extracts a non-empty owner string', () => {
            const result = parseSempV1Response(xmlWithOwner('alice'), 'q', 'v', emptyResult('semp'));
            expect(result.owner).toBe('alice');
        });

        it('extracts an empty owner as empty string (server-created queue)', () => {
            const result = parseSempV1Response(xmlWithOwner(''), 'q', 'v', emptyResult('semp'));
            expect(result.owner).toBe('');
        });

        it('SAMPLE_RESPONSE with no <owner> element → owner null', () => {
            const result = parseSempV1Response(SAMPLE_RESPONSE, 'test-all', 'vpn-01', emptyResult('semp'));
            expect(result.owner).toBeNull();
        });
    });

    describe('accessType capture in QueueBrowser-fallback path', () => {
        it('captures READ_WRITE from _messageConsumer._permissions on UP', async () => {
            vi.useFakeTimers();
            const session = createSessionMock();
            const browser = createBrowserMock();
            (browser as any)._messageConsumer = { _permissions: 'READ_WRITE' };
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.accessType).toBe('read-write');
            vi.useRealTimers();
        });

        it('captures READ_ONLY from _messageConsumer._permissions on UP', async () => {
            vi.useFakeTimers();
            const session = createSessionMock();
            const browser = createBrowserMock();
            (browser as any)._messageConsumer = { _permissions: 'READ_ONLY' };
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.accessType).toBe('read-only');
            vi.useRealTimers();
        });

        it('missing _messageConsumer leaves accessType null', async () => {
            vi.useFakeTimers();
            const session = createSessionMock();
            const browser = createBrowserMock();
            (browser as any)._messageConsumer = undefined;
            (session.createQueueBrowser as any).mockReturnValue(browser);
            const promise = verifySource({
                sempCtx: null, primarySession: session,
                vpn: '', queue: 'q', signal: new AbortController().signal,
            });
            await Promise.resolve();
            (browser as any)._handlers.UP();
            await vi.advanceTimersByTimeAsync(ACCUMULATE_IDLE_MS);
            const result = await promise;
            expect(result.accessType).toBeNull();
            vi.useRealTimers();
        });
    });
});
