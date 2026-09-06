/**
 * SEMP v1 RPC responses.
 *
 * The real parsers run against these — `queue-copy/service-verify.ts` and
 * `queue-subscription-explorer/parse.ts` are not mocked any more — so the
 * element nesting has to match what those `querySelector` paths expect exactly.
 *
 * One deliberate piece of un-tidiness: the `<detail/>` response reports
 * `newest-msg-id` as `0`. That is the broker bug the product works around with
 * a second `<messages/><newest/>` RPC. Reporting the true value here would mean
 * the demo never exercises the workaround that ships.
 *
 * Mock-only.
 */
import { allQueues, findQueueAnyVpn, getQueue, spoolUsage, type MockQueue } from '../broker/store';
import { QUEUE_STATE, queueStateOf } from '../fixtures';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textOf(xml: string, tag: string): string | null {
    const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
    return m ? m[1] : null;
}

function executeError(reason: string): string {
    return `<rpc-reply><execute-result code="fail" reason="${esc(reason)}"/></rpc-reply>`;
}

/** `<show><queue><detail/>` — the queue-copy verify probe. */
function queueDetail(body: string): string {
    const name = textOf(body, 'name') ?? '';
    const vpnName = textOf(body, 'vpn-name') ?? '*';
    const q = vpnName === '*' ? findQueueAnyVpn(name) : getQueue(vpnName, name);
    if (!q) return executeError(`Unknown Queue '${name}'`);

    const state = queueStateOf(q.vpn, q.name);
    const permission = state === QUEUE_STATE.READ_ONLY ? 'Read-Only' : 'Consume';
    const oldest = q.messages.length ? q.messages[0].id : 0;

    return `<rpc-reply>
  <rpc><show><queue><queues><queue>
    <name>${esc(q.name)}</name>
    <info>
      <message-vpn>${esc(q.vpn)}</message-vpn>
      <num-messages-spooled>${q.messages.length}</num-messages-spooled>
      <current-spool-usage-in-bytes>${spoolUsage(q)}</current-spool-usage-in-bytes>
      <quota>${Math.round(q.quotaBytes / 1024 / 1024)}</quota>
      <max-message-size>${q.maxMessageSize}</max-message-size>
      <oldest-msg-id>${oldest}</oldest-msg-id>
      <newest-msg-id>0</newest-msg-id>
      <others-permission>${permission}</others-permission>
      <owner>demo</owner>
    </info>
  </queue></queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;
}

/** `<show><queue><messages/><newest/>` — the newest-id workaround probe. */
function newestMessageId(body: string): string {
    const name = textOf(body, 'name') ?? '';
    const vpnName = textOf(body, 'vpn-name') ?? '*';
    const q = vpnName === '*' ? findQueueAnyVpn(name) : getQueue(vpnName, name);
    if (!q) return executeError(`Unknown Queue '${name}'`);
    const newest = q.messages.length ? q.messages[q.messages.length - 1].id : 0;

    return `<rpc-reply>
  <rpc><show><queue><queues><queue>
    <name>${esc(q.name)}</name>
    <spooled-messages><spooled-message>
      <message-id>${newest}</message-id>
    </spooled-message></spooled-messages>
  </queue></queues></queue></show></rpc>
  <execute-result code="ok"/>
</rpc-reply>`;
}

/**
 * `<show><queue><subscriptions/>` — the subscription explorer.
 * Paged through `<more-cookie>`: page one returns half the queues and a cookie,
 * page two returns the rest with none, so the continuation path is exercised.
 */
function subscriptions(body: string): string {
    const isContinuation = body.includes('<mock-page>2</mock-page>');
    const withSubs = allQueues().filter(q => q.subscriptions.length > 0);
    const half = Math.ceil(withSubs.length / 2);
    const page = isContinuation ? withSubs.slice(half) : withSubs.slice(0, half);

    const queueXml = page.map((q: MockQueue) => `    <queue>
      <name>${esc(q.name)}</name>
      <info><message-vpn>${esc(q.vpn)}</message-vpn></info>
      <subscriptions>
${q.subscriptions.map(t => `        <subscription><topic>${esc(t)}</topic></subscription>`).join('\n')}
      </subscriptions>
    </queue>`).join('\n');

    const cookie = isContinuation ? '' : `
  <more-cookie><rpc><show><queue><name>*</name><vpn-name>*</vpn-name><subscriptions/><mock-page>2</mock-page></queue></show></rpc></more-cookie>`;

    return `<rpc-reply>
  <rpc><show><queue><queues>
${queueXml}
  </queues></queue></show></rpc>${cookie}
  <execute-result code="ok"/>
</rpc-reply>`;
}

/** Route a SEMP v1 POST body to the right response. */
export function handleSempV1(body: string): string {
    if (body.includes('<subscriptions/>')) return subscriptions(body);
    if (body.includes('<newest/>')) return newestMessageId(body);
    if (body.includes('<detail/>')) return queueDetail(body);
    return executeError('Unsupported RPC in the demo broker');
}
