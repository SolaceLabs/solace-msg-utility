import { describe, it, expect } from 'vitest';
import { parseSubscriptionsResponse } from '../../../src/modules/queue-subscription-explorer/parse';

const TWO_QUEUES_TWO_SUBS = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues>
          <queue>
            <name>BULKQ-001</name>
            <info>
              <message-vpn>default</message-vpn>
            </info>
            <subscriptions>
              <subscription><topic>BULKQ/TEST</topic></subscription>
              <subscription><topic>BULKQ/AUDIT</topic></subscription>
            </subscriptions>
          </queue>
          <queue>
            <name>orders-new</name>
            <info>
              <message-vpn>default</message-vpn>
            </info>
            <subscriptions>
              <subscription><topic>orders/new/&gt;</topic></subscription>
            </subscriptions>
          </queue>
        </queues>
      </queue>
    </show>
  </rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

const QUEUE_WITH_NO_SUBS = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues>
          <queue>
            <name>empty-queue</name>
            <info>
              <message-vpn>default</message-vpn>
            </info>
            <subscriptions></subscriptions>
          </queue>
        </queues>
      </queue>
    </show>
  </rpc>
  <execute-result code="ok"/>
</rpc-reply>`;

const PAGE_WITH_MORE_COOKIE = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <rpc>
    <show>
      <queue>
        <queues>
          <queue>
            <name>q-page-1</name>
            <info><message-vpn>default</message-vpn></info>
            <subscriptions>
              <subscription><topic>x/y</topic></subscription>
            </subscriptions>
          </queue>
        </queues>
      </queue>
    </show>
  </rpc>
  <more-cookie>
    <rpc semp-version="soltr/10_25_0VMR">
      <show><queue><name>*</name><vpn-name>*</vpn-name>
        <subscriptions/><count/><num-elements>70</num-elements>
        <vpn-id-index-param>0</vpn-id-index-param>
      </queue></show>
    </rpc>
  </more-cookie>
  <execute-result code="ok"/>
</rpc-reply>`;

const ERROR_RESPONSE = `<rpc-reply semp-version="soltr/10_25_0VMR">
  <execute-result code="fail" reason="Permission denied"/>
</rpc-reply>`;

describe('queue-subscription-explorer/parse', () => {
    describe('parseSubscriptionsResponse', () => {
        it('extracts one row per (queue, topic) tuple across multiple queues', () => {
            const r = parseSubscriptionsResponse(TWO_QUEUES_TWO_SUBS);
            expect(r.ok).toBe(true);
            if (!r.ok) return; // type-narrow
            expect(r.page.rows).toEqual([
                { vpn: 'default', queue: 'BULKQ-001', topic: 'BULKQ/TEST' },
                { vpn: 'default', queue: 'BULKQ-001', topic: 'BULKQ/AUDIT' },
                { vpn: 'default', queue: 'orders-new', topic: 'orders/new/>' },
            ]);
            expect(r.page.nextPageBody).toBeNull();
        });

        it('omits queues that have zero topic subscriptions', () => {
            const r = parseSubscriptionsResponse(QUEUE_WITH_NO_SUBS);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.page.rows).toEqual([]);
            expect(r.page.nextPageBody).toBeNull();
        });

        it('extracts the more-cookie inner <rpc> as the next-page body', () => {
            const r = parseSubscriptionsResponse(PAGE_WITH_MORE_COOKIE);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.page.rows).toEqual([
                { vpn: 'default', queue: 'q-page-1', topic: 'x/y' },
            ]);
            expect(r.page.nextPageBody).not.toBeNull();
            // Body must be a serialized <rpc>… element, ready to POST as-is.
            expect(r.page.nextPageBody!.startsWith('<rpc')).toBe(true);
            expect(r.page.nextPageBody).toContain('<num-elements>70</num-elements>');
        });

        it('returns an error when execute-result code != ok', () => {
            const r = parseSubscriptionsResponse(ERROR_RESPONSE);
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.error).toContain('Permission denied');
        });

        it('falls back to "error" when <execute-result/> has neither reason nor code (closes COV-11)', () => {
            // Defensive parse — broker quirk where execute-result has no
            // attributes. Without the `?? 'error'` tail of the fallback chain
            // the error message would render the misleading literal "null".
            const xml = `<rpc-reply>
              <rpc><show><queue><queues></queues></queue></show></rpc>
              <execute-result/>
            </rpc-reply>`;
            const r = parseSubscriptionsResponse(xml);
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.error).toBe('SEMP v1 execute failed: error');
        });

        it('returns an error for malformed XML', () => {
            const r = parseSubscriptionsResponse('<not-xml<<<');
            expect(r.ok).toBe(false);
        });

        it('skips queues missing <info><message-vpn>', () => {
            // Defensive parse — broker quirk where <info> is absent. We can't
            // attribute the queue to a VPN, so the whole queue is dropped
            // rather than emitting rows with blank vpn.
            const xml = `<rpc-reply>
              <rpc><show><queue><queues>
                <queue><name>x</name>
                  <subscriptions><subscription><topic>a</topic></subscription></subscriptions>
                </queue>
              </queues></queue></show></rpc>
              <execute-result code="ok"/>
            </rpc-reply>`;
            const r = parseSubscriptionsResponse(xml);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.page.rows).toEqual([]);
        });

        it('skips a <topic> element that is empty', () => {
            const xml = `<rpc-reply>
              <rpc><show><queue><queues>
                <queue><name>x</name><info><message-vpn>v</message-vpn></info>
                  <subscriptions>
                    <subscription><topic></topic></subscription>
                    <subscription><topic>real/topic</topic></subscription>
                  </subscriptions>
                </queue>
              </queues></queue></show></rpc>
              <execute-result code="ok"/>
            </rpc-reply>`;
            const r = parseSubscriptionsResponse(xml);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.page.rows).toEqual([{ vpn: 'v', queue: 'x', topic: 'real/topic' }]);
        });

        it('treats execute-result with no reason and no code attribute as a generic error', () => {
            const xml = `<rpc-reply><execute-result code="fail"/></rpc-reply>`;
            const r = parseSubscriptionsResponse(xml);
            expect(r.ok).toBe(false);
            if (r.ok) return;
            expect(r.error).toContain('fail');
        });

        it('returns ok with empty rows when the broker has no queues at all', () => {
            const xml = `<rpc-reply>
              <rpc><show><queue><queues></queues></queue></show></rpc>
              <execute-result code="ok"/>
            </rpc-reply>`;
            const r = parseSubscriptionsResponse(xml);
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.page.rows).toEqual([]);
            expect(r.page.nextPageBody).toBeNull();
        });
    });
});
