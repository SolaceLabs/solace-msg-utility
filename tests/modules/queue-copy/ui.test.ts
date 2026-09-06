import { describe, it, expect, beforeEach } from 'vitest';
import {
    cacheElements,
    applyDestPrefill,
    applyDestType,
    applySourceReadonly,
    setSourcePickVisible,
    setDestPickVisible,
    setStartEnabled,
    setFormDisabled,
    setDestSempStatus,
    setDestSolStatus,
    setDestSempError,
    setDestSolError,
    setDestSempFormLocked,
    setDestSolFormLocked,
    setDestBrokerLocked,
    renderModalInitial,
    renderDestSummary,
    renderVerifyProgress,
    renderVerifyResult,
    renderRunPhase,
    resetVerifyDisplay,
    renderProgress,
    renderRunError,
    renderRunComplete,
    setEmptyQueueIndicator,
    setReadOnlyIndicator,
    setNoAccessIndicator,
} from '../../../src/modules/queue-copy/ui';
import type { PrimarySnapshot, SourceSummary, DestSummary } from '../../../src/modules/queue-copy/ui';
import { loadModuleDOM } from '../../helpers/loadModuleDOM';

function setup() {
    const container = loadModuleDOM('queue-copy');
    return { container, els: cacheElements(container) };
}

const PRIMARY: PrimarySnapshot = {
    host: 'broker.solace.com',
    solace: { protocol: 'wss', port: '443', urlPath: '', vpn: 'default', user: 'admin', pass: 'sol-secret' },
    semp: { protocol: 'https', port: '1943', urlPath: '/SEMP/v2', user: 'admin', pass: 'semp-secret' },
};

const SRC: SourceSummary = { broker: 'broker.example:1943', vpn: 'default', queueName: 'src-q' };
const DST: DestSummary = { broker: 'broker.example:1943', vpn: 'default', type: 'queue', targetName: 'dst-q' };

describe('queue-copy/ui', () => {
    let elsHolder: ReturnType<typeof setup>;
    beforeEach(() => {
        elsHolder = setup();
    });

    describe('cacheElements', () => {
        it('caches every required element including the source-side mirror', () => {
            const els = elsHolder.els;
            expect(els.modal.tagName.toLowerCase()).toBe('dialog');
            expect(els.btnStart).toBeDefined();
            expect(els.btnStart.disabled).toBe(true);
            expect(els.destTypeToggle).toBeDefined();
            expect(els.destTypeLabelQueue).toBeDefined();
            expect(els.destTypeLabelTopic).toBeDefined();
            expect(els.modeRadios.length).toBe(2);
            expect(els.destSempUrlPath).toBeDefined();
            expect(els.destSolUrlPath).toBeDefined();
            expect(els.modalSourceBroker).toBeDefined();
            expect(els.modalSourceUsage).toBeDefined();
            expect(els.modalSourceMaxSize).toBeDefined();
            // Source-side read-only mirror.
            expect(els.sourceHost).toBeDefined();
            expect(els.sourceSempProtocol).toBeDefined();
            expect(els.sourceSolVpn).toBeDefined();
            expect(els.sourceEditButtons.length).toBe(3);
        });
    });

    describe('applySourceReadonly', () => {
        it('populates every source field from the snapshot, including passwords', () => {
            applySourceReadonly(elsHolder.els, PRIMARY);
            expect(elsHolder.els.sourceHost.value).toBe('broker.solace.com');
            expect(elsHolder.els.sourceSempProtocol.value).toBe('https');
            expect(elsHolder.els.sourceSempPort.value).toBe('1943');
            expect(elsHolder.els.sourceSempUrlPath.value).toBe('/SEMP/v2');
            expect(elsHolder.els.sourceSempUser.value).toBe('admin');
            expect(elsHolder.els.sourceSempPass.value).toBe('semp-secret');
            expect(elsHolder.els.sourceSolProtocol.value).toBe('wss');
            expect(elsHolder.els.sourceSolPort.value).toBe('443');
            expect(elsHolder.els.sourceSolUrlPath.value).toBe('');
            expect(elsHolder.els.sourceSolVpn.value).toBe('default');
            expect(elsHolder.els.sourceSolUser.value).toBe('admin');
            expect(elsHolder.els.sourceSolPass.value).toBe('sol-secret');
        });

        it('null snapshot blanks scalar fields without throwing; protocol selects keep their default', () => {
            // First populate, then re-apply with null to verify the clear path.
            applySourceReadonly(elsHolder.els, PRIMARY);
            applySourceReadonly(elsHolder.els, null);
            expect(elsHolder.els.sourceHost.value).toBe('');
            expect(elsHolder.els.sourceSempPort.value).toBe('');
            expect(elsHolder.els.sourceSempUser.value).toBe('');
            expect(elsHolder.els.sourceSolVpn.value).toBe('');
            // Protocol selects only re-set when the snapshot supplies a value;
            // a null snapshot leaves them at whatever the user last saw
            // (the HTML default `selected`).
            expect(elsHolder.els.sourceSempProtocol.value).toBe('https');
            expect(elsHolder.els.sourceSolProtocol.value).toBe('wss');
        });
    });

    // The connection gate (#copy-warning) is now created + toggled via the
    // shared module-gate component inside install; its show/hide-vs-content
    // behaviour is covered by module.test.ts ("installs without primary
    // connection…" / "installs with primary connected…"), and the component's
    // own show()/hide() in tests/core/components/module-gate.

    describe('applyDestPrefill', () => {
        it('sameBroker=true & sameVpn=true: disables every dest field, prefills with primary values', () => {
            applyDestPrefill(elsHolder.els, true, true, PRIMARY);
            expect(elsHolder.els.destHost.disabled).toBe(true);
            expect(elsHolder.els.destHost.value).toBe('broker.solace.com');
            expect(elsHolder.els.destSolVpn.disabled).toBe(true);
            expect(elsHolder.els.destSolVpn.value).toBe('default');
            expect(elsHolder.els.destSolUser.disabled).toBe(true);
            expect(elsHolder.els.destSolPass.disabled).toBe(true);
            expect(elsHolder.els.destSempUser.value).toBe('admin');
        });

        it('sameBroker=true & sameVpn=false: broker fields locked, VPN fields editable', () => {
            applyDestPrefill(elsHolder.els, true, false, PRIMARY);
            expect(elsHolder.els.destHost.disabled).toBe(true);
            expect(elsHolder.els.destSolVpn.disabled).toBe(false);
            expect(elsHolder.els.destSolUser.disabled).toBe(false);
            expect(elsHolder.els.destSolPass.disabled).toBe(false);
        });

        it('sameBroker=false: forces sameVpn off + disables that toggle, leaves all fields editable', () => {
            applyDestPrefill(elsHolder.els, false, true, PRIMARY);
            expect(elsHolder.els.toggleSameVpn.checked).toBe(false);
            expect(elsHolder.els.toggleSameVpn.disabled).toBe(true);
            expect(elsHolder.els.destHost.disabled).toBe(false);
            expect(elsHolder.els.destSolVpn.disabled).toBe(false);
        });

        it('null primary leaves disabled flags applied but does not blank values', () => {
            elsHolder.els.destHost.value = 'leftover';
            applyDestPrefill(elsHolder.els, true, true, null);
            expect(elsHolder.els.destHost.disabled).toBe(true);
            expect(elsHolder.els.destHost.value).toBe('leftover');
        });
    });

    describe('applyDestType', () => {
        it('queue: toggle unchecked, Queue label active, queue placeholder', () => {
            applyDestType(elsHolder.els, 'queue');
            expect(elsHolder.els.destTypeToggle.checked).toBe(false);
            expect(elsHolder.els.destTypeLabelQueue.classList.contains('active')).toBe(true);
            expect(elsHolder.els.destTypeLabelTopic.classList.contains('active')).toBe(false);
            expect(elsHolder.els.destNameLabel.textContent).toContain('Queue');
            expect(elsHolder.els.destInput.placeholder).toContain('queue');
        });

        it('topic: toggle checked, Topic label active, topic placeholder', () => {
            applyDestType(elsHolder.els, 'topic');
            expect(elsHolder.els.destTypeToggle.checked).toBe(true);
            expect(elsHolder.els.destTypeLabelTopic.classList.contains('active')).toBe(true);
            expect(elsHolder.els.destTypeLabelQueue.classList.contains('active')).toBe(false);
            expect(elsHolder.els.destNameLabel.textContent).toContain('Topic');
            expect(elsHolder.els.destInput.placeholder).toContain('topic');
        });
    });

    describe('Connect-row visibility (applyDestPrefill side effect)', () => {
        it('sameBroker=true & sameVpn=true: both Connect rows hidden (reuse primary)', () => {
            applyDestPrefill(elsHolder.els, true, true, PRIMARY);
            expect(elsHolder.els.destSempConnectRow.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.destSolConnectRow.classList.contains('hidden')).toBe(true);
        });

        it('sameBroker=true & sameVpn=false: SEMP row hidden, Client row visible', () => {
            applyDestPrefill(elsHolder.els, true, false, PRIMARY);
            expect(elsHolder.els.destSempConnectRow.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.destSolConnectRow.classList.contains('hidden')).toBe(false);
        });

        it('sameBroker=false: both Connect rows visible', () => {
            applyDestPrefill(elsHolder.els, false, false, PRIMARY);
            expect(elsHolder.els.destSempConnectRow.classList.contains('hidden')).toBe(false);
            expect(elsHolder.els.destSolConnectRow.classList.contains('hidden')).toBe(false);
        });
    });

    describe('setDestSempStatus / setDestSolStatus', () => {
        it('connected → "Disconnect" label, danger style, status text with detail', () => {
            setDestSempStatus(elsHolder.els, 'connected', 'vpn-x');
            expect(elsHolder.els.btnDestSempConnect.textContent).toBe('Disconnect');
            expect(elsHolder.els.btnDestSempConnect.classList.contains('btn-danger')).toBe(true);
            expect(elsHolder.els.btnDestSempConnect.disabled).toBe(false);
            expect(elsHolder.els.destSempStatus.textContent).toContain('vpn-x');
        });

        it('connected without detail still shows "Connected"', () => {
            setDestSolStatus(elsHolder.els, 'connected');
            expect(elsHolder.els.destSolStatus.textContent).toBe('Connected');
        });

        it('connecting → button disabled, label "Connecting…"', () => {
            setDestSempStatus(elsHolder.els, 'connecting');
            expect(elsHolder.els.btnDestSempConnect.disabled).toBe(true);
            expect(elsHolder.els.btnDestSempConnect.textContent).toBe('Connecting…');
        });

        it('disconnected → "Connect" label, primary style', () => {
            // First connect, then back to disconnected to exercise both transitions.
            setDestSolStatus(elsHolder.els, 'connected');
            setDestSolStatus(elsHolder.els, 'disconnected');
            expect(elsHolder.els.btnDestSolConnect.textContent).toBe('Connect');
            expect(elsHolder.els.btnDestSolConnect.classList.contains('btn-primary')).toBe(true);
            expect(elsHolder.els.btnDestSolConnect.classList.contains('btn-danger')).toBe(false);
            expect(elsHolder.els.btnDestSolConnect.disabled).toBe(false);
            expect(elsHolder.els.destSolStatus.textContent).toBe('Not connected');
        });
    });

    describe('setDestSempFormLocked / setDestSolFormLocked / setDestBrokerLocked', () => {
        it('SEMP form lock disables every SEMP field; unlock re-enables', () => {
            setDestSempFormLocked(elsHolder.els, true);
            expect(elsHolder.els.destSempProtocol.disabled).toBe(true);
            expect(elsHolder.els.destSempPort.disabled).toBe(true);
            expect(elsHolder.els.destSempUrlPath.disabled).toBe(true);
            expect(elsHolder.els.destSempUser.disabled).toBe(true);
            expect(elsHolder.els.destSempPass.disabled).toBe(true);
            setDestSempFormLocked(elsHolder.els, false);
            expect(elsHolder.els.destSempProtocol.disabled).toBe(false);
            expect(elsHolder.els.destSempPass.disabled).toBe(false);
        });

        it('Solace (Client) form lock disables every Client field; unlock re-enables', () => {
            setDestSolFormLocked(elsHolder.els, true);
            expect(elsHolder.els.destSolProtocol.disabled).toBe(true);
            expect(elsHolder.els.destSolVpn.disabled).toBe(true);
            expect(elsHolder.els.destSolUser.disabled).toBe(true);
            expect(elsHolder.els.destSolPass.disabled).toBe(true);
            setDestSolFormLocked(elsHolder.els, false);
            expect(elsHolder.els.destSolVpn.disabled).toBe(false);
        });

        it('broker host lock disables host when either dest connection is live; no-op when neither', () => {
            // Start with host enabled.
            elsHolder.els.destHost.disabled = false;
            setDestBrokerLocked(elsHolder.els, true);
            expect(elsHolder.els.destHost.disabled).toBe(true);
            // Calling with `false` is a no-op — applyDestPrefill owns the unlock decision.
            setDestBrokerLocked(elsHolder.els, false);
            expect(elsHolder.els.destHost.disabled).toBe(true);
        });
    });

    describe('in-modal Refresh button lifecycle', () => {
        it('renderModalInitial resets the Refresh button to visible+disabled', () => {
            // Simulate prior-run state: hidden + enabled
            elsHolder.els.btnModalSourceRefresh.classList.add('hidden');
            elsHolder.els.btnModalSourceRefresh.disabled = false;
            renderModalInitial(
                elsHolder.els,
                { broker: 'b', vpn: 'v', queueName: 'q' },
                { broker: 'b', vpn: 'v', type: 'queue', targetName: 'q' },
                'copy',
            );
            expect(elsHolder.els.btnModalSourceRefresh.classList.contains('hidden')).toBe(false);
            expect(elsHolder.els.btnModalSourceRefresh.disabled).toBe(true);
        });

        it('renderVerifyResult enables the Refresh button (success path)', () => {
            elsHolder.els.btnModalSourceRefresh.disabled = true;
            renderVerifyResult(elsHolder.els, {
                sourceOk: true, via: 'semp', errors: [],
                messageVpn: 'v', messageCount: 5, spoolUsageBytes: 1024, quotaBytes: 1024 * 1024 * 1024,
                maxMessageSize: 10_000_000, oldestMsgId: '1', newestMsgId: '5',
            });
            expect(elsHolder.els.btnModalSourceRefresh.disabled).toBe(false);
        });

        it('renderVerifyResult enables the Refresh button (failure path so user can retry)', () => {
            elsHolder.els.btnModalSourceRefresh.disabled = true;
            renderVerifyResult(elsHolder.els, {
                sourceOk: false, via: 'queue-browser', errors: ['not found'],
                messageVpn: null, messageCount: null, spoolUsageBytes: null, quotaBytes: null,
                maxMessageSize: null, oldestMsgId: null, newestMsgId: null,
            });
            expect(elsHolder.els.btnModalSourceRefresh.disabled).toBe(false);
        });

        it('renderRunPhase hides and disables the Refresh button', () => {
            elsHolder.els.btnModalSourceRefresh.classList.remove('hidden');
            elsHolder.els.btnModalSourceRefresh.disabled = false;
            renderRunPhase(elsHolder.els, 10, 'copy');
            expect(elsHolder.els.btnModalSourceRefresh.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.btnModalSourceRefresh.disabled).toBe(true);
        });

        it('resetVerifyDisplay parks the source dd values back to placeholders', () => {
            elsHolder.els.modalSourceCount.textContent = '42';
            elsHolder.els.modalSourceUsage.textContent = '1 KiB';
            elsHolder.els.modalSourceOldestId.textContent = '100';
            elsHolder.els.modalSourceNewestId.textContent = '200';
            elsHolder.els.modalSourceStatus.textContent = 'Found via SEMP';
            elsHolder.els.modalSourceStatus.className = 'text-success';
            elsHolder.els.modalVerifyError.classList.remove('hidden');
            elsHolder.els.modalVerifyError.textContent = 'prior error';

            resetVerifyDisplay(elsHolder.els);

            expect(elsHolder.els.modalSourceCount.textContent).toBe('—');
            expect(elsHolder.els.modalSourceUsage.textContent).toBe('—');
            expect(elsHolder.els.modalSourceOldestId.textContent).toBe('—');
            expect(elsHolder.els.modalSourceNewestId.textContent).toBe('—');
            expect(elsHolder.els.modalSourceStatus.textContent).toBe('Checking…');
            expect(elsHolder.els.modalSourceStatus.className).toBe('text-secondary');
            expect(elsHolder.els.modalVerifyError.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.modalVerifyError.textContent).toBe('');
        });
    });

    describe('setDestSempError / setDestSolError', () => {
        it('shows + hides the SEMP error pane', () => {
            setDestSempError(elsHolder.els, 'auth fail');
            expect(elsHolder.els.destSempError.classList.contains('hidden')).toBe(false);
            expect(elsHolder.els.destSempError.textContent).toBe('auth fail');
            setDestSempError(elsHolder.els, null);
            expect(elsHolder.els.destSempError.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.destSempError.textContent).toBe('');
        });

        it('shows + hides the Client error pane', () => {
            setDestSolError(elsHolder.els, 'oops');
            expect(elsHolder.els.destSolError.classList.contains('hidden')).toBe(false);
            setDestSolError(elsHolder.els, null);
            expect(elsHolder.els.destSolError.classList.contains('hidden')).toBe(true);
        });
    });

    describe('setSourcePickVisible / setDestPickVisible', () => {
        it('toggles the source pick icon', () => {
            setSourcePickVisible(elsHolder.els, true);
            expect(elsHolder.els.btnSourcePick.classList.contains('hidden')).toBe(false);
            setSourcePickVisible(elsHolder.els, false);
            expect(elsHolder.els.btnSourcePick.classList.contains('hidden')).toBe(true);
        });

        it('toggles the dest pick icon', () => {
            setDestPickVisible(elsHolder.els, true);
            expect(elsHolder.els.btnDestPick.classList.contains('hidden')).toBe(false);
            setDestPickVisible(elsHolder.els, false);
            expect(elsHolder.els.btnDestPick.classList.contains('hidden')).toBe(true);
        });
    });

    describe('setStartEnabled', () => {
        it('toggles the Next button disabled state', () => {
            setStartEnabled(elsHolder.els, true);
            expect(elsHolder.els.btnStart.disabled).toBe(false);
            setStartEnabled(elsHolder.els, false);
            expect(elsHolder.els.btnStart.disabled).toBe(true);
        });
    });

    describe('setFormDisabled', () => {
        it('disables every form control + toggle + radios + source-edit buttons', () => {
            setFormDisabled(elsHolder.els, true);
            expect(elsHolder.els.sourceInput.disabled).toBe(true);
            expect(elsHolder.els.destSempPort.disabled).toBe(true);
            expect(elsHolder.els.destSolPort.disabled).toBe(true);
            expect(elsHolder.els.btnStart.disabled).toBe(true);
            expect(elsHolder.els.destTypeToggle.disabled).toBe(true);
            elsHolder.els.modeRadios.forEach(r => expect(r.disabled).toBe(true));
            elsHolder.els.sourceEditButtons.forEach(b => expect(b.disabled).toBe(true));
        });

        it('re-enables when false', () => {
            setFormDisabled(elsHolder.els, true);
            setFormDisabled(elsHolder.els, false);
            expect(elsHolder.els.sourceInput.disabled).toBe(false);
        });
    });

    describe('renderModalInitial', () => {
        it('populates source + dest summaries and sets Copy/Move button text from mode', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            expect(elsHolder.els.modalTitle.textContent).toBe('Confirm Queue Copy');
            expect(elsHolder.els.modalSourceBroker.textContent).toBe('broker.example:1943');
            expect(elsHolder.els.modalSourceVpn.textContent).toBe('default');
            expect(elsHolder.els.modalSourceName.textContent).toBe('src-q');
            expect(elsHolder.els.modalSourceUsage.textContent).toBe('—');
            expect(elsHolder.els.modalSourceCount.textContent).toBe('—');
            expect(elsHolder.els.modalSourceMaxSize.textContent).toBe('—');
            expect(elsHolder.els.modalSourceStatus.textContent).toBe('Checking…');
            expect(elsHolder.els.modalDestName.textContent).toBe('dst-q');
            expect(elsHolder.els.btnModalStart.textContent).toBe('Copy');
            expect(elsHolder.els.btnModalStart.disabled).toBe(true);
        });

        it('mode=move shows "Move" on the Start button', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'move');
            expect(elsHolder.els.btnModalStart.textContent).toBe('Move');
        });
    });

    describe('renderDestSummary', () => {
        it('topic dest renames the target label to "Topic"', () => {
            renderDestSummary(elsHolder.els, { broker: 'b', vpn: 'v', type: 'topic', targetName: 'orders/new' });
            expect(elsHolder.els.modalDestType.textContent).toBe('Topic');
            expect(elsHolder.els.modalDestNameLabel.textContent).toBe('Topic');
            expect(elsHolder.els.modalDestName.textContent).toBe('orders/new');
        });

        it('queue dest sets type + target label to "Queue" / "Name"', () => {
            renderDestSummary(elsHolder.els, { broker: 'b', vpn: 'v', type: 'queue', targetName: 'q-out' });
            expect(elsHolder.els.modalDestType.textContent).toBe('Queue');
            expect(elsHolder.els.modalDestNameLabel.textContent).toBe('Name');
        });
    });

    describe('renderVerifyProgress', () => {
        it('shows live count + size with loading hint', () => {
            renderVerifyProgress(elsHolder.els, 7, 1024);
            expect(elsHolder.els.modalSourceCount.textContent).toContain('7');
            expect(elsHolder.els.modalSourceCount.textContent).toContain('loading');
            expect(elsHolder.els.modalSourceUsage.textContent).toContain('loading');
        });
    });

    describe('renderVerifyResult', () => {
        const baseOk = (overrides: Partial<import('../../../src/modules/queue-copy/state').VerifyResult> = {}) => ({
            sourceOk: true,
            via: 'semp' as const,
            errors: [],
            messageVpn: null,
            messageCount: null,
            spoolUsageBytes: null,
            quotaBytes: null,
            maxMessageSize: null,
            oldestMsgId: null,
            newestMsgId: null,
            accessType: 'read-write' as const,
            owner: null,
            ...overrides,
        });

        it('SEMP success with all fields renders count, "{used} / {quota}" usage, max size', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({
                messageVpn: 'vpn-01', messageCount: 18, spoolUsageBytes: 2937,
                quotaBytes: 5000 * 1024 * 1024, maxMessageSize: 10_000_000,
            }));
            expect(elsHolder.els.modalSourceStatus.textContent).toBe('Found via SEMP');
            expect(elsHolder.els.modalSourceVpn.textContent).toBe('vpn-01');
            expect(elsHolder.els.modalSourceCount.textContent).toBe('18');
            expect(elsHolder.els.modalSourceUsage.textContent).toContain('/');
            expect(elsHolder.els.modalSourceMaxSize.textContent).toMatch(/MB|KB|B/);
        });

        it('on success, renderVerifyResult does NOT toggle btnModalStart — that gate lives in ui-modal', () => {
            // Pre-disable Start (mirrors renderModalInitial); successful
            // verify must leave it alone so evaluateStartGate can apply the
            // empty-queue / read-only / mode checks.
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            elsHolder.els.btnModalStart.disabled = true;
            renderVerifyResult(elsHolder.els, baseOk({ messageCount: 5 }));
            expect(elsHolder.els.btnModalStart.disabled).toBe(true);
        });

        it('queue-browser success uses "Found via QueueBrowser" and leaves vpn untouched (null in result)', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({
                via: 'queue-browser', messageCount: 3, spoolUsageBytes: 100,
            }));
            expect(elsHolder.els.modalSourceStatus.textContent).toBe('Found via QueueBrowser');
            // Initial render had vpn = "default"; verify result with null vpn preserves it.
            expect(elsHolder.els.modalSourceVpn.textContent).toBe('default');
        });

        it('null spool/quota shows "(unavailable)" in usage', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({ messageCount: 1 }));
            expect(elsHolder.els.modalSourceUsage.textContent).toContain('unavailable');
            expect(elsHolder.els.modalSourceMaxSize.textContent).toContain('unavailable');
        });

        it('spool present, quota null: usage shows just used bytes', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({ spoolUsageBytes: 500 }));
            expect(elsHolder.els.modalSourceUsage.textContent).toMatch(/B|KB|MB/);
            expect(elsHolder.els.modalSourceUsage.textContent).not.toContain('/');
        });

        it('null count shows "(unavailable)"', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({ messageCount: null }));
            expect(elsHolder.els.modalSourceCount.textContent).toContain('unavailable');
        });

        it('failure: "Not Found" status, Start disabled, errors surfaced', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, {
                sourceOk: false, via: 'semp', errors: ['no perms'],
                messageVpn: null, messageCount: null, spoolUsageBytes: null,
                quotaBytes: null, maxMessageSize: null,
                oldestMsgId: null, newestMsgId: null, accessType: null, owner: null,
            });
            expect(elsHolder.els.modalSourceStatus.textContent).toBe('Not Found');
            expect(elsHolder.els.btnModalStart.disabled).toBe(true);
            expect(elsHolder.els.modalVerifyError.textContent).toBe('no perms');
            expect(elsHolder.els.modalVerifyError.classList.contains('hidden')).toBe(false);
        });

        it('success with errors still surfaces the errors (e.g. soft-warn paths)', () => {
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            renderVerifyResult(elsHolder.els, baseOk({ errors: ['warn'] }));
            expect(elsHolder.els.modalVerifyError.textContent).toBe('warn');
        });
    });

    describe('renderRunPhase / progress / complete', () => {
        // CopyJob factory — runs default to the 'running' status that the
        // engine assigns at entry. Tests that check post-run UI override
        // `status` to 'completed' / 'cancelled' / 'error' as appropriate.
        const job = (over: Partial<import('../../../src/modules/queue-copy/state').CopyJob> = {}) => ({
            total: 0,
            copied: 0,
            cancelRequested: false,
            lastError: null,
            status: 'running' as const,
            ...over,
        });

        it('renderRunPhase copy mode → "Copying…" title, "Cancel copy" button', () => {
            renderRunPhase(elsHolder.els, 5, 'copy');
            expect(elsHolder.els.modalTitle.textContent).toBe('Copying…');
            expect(elsHolder.els.btnModalCancel.textContent).toBe('Cancel copy');
            expect(elsHolder.els.progressFill.classList.contains('indeterminate')).toBe(false);
            expect(elsHolder.els.progressText.textContent).toBe('0 / 5');
        });

        it('renderRunPhase move mode → "Moving…" title, "Cancel move" button', () => {
            renderRunPhase(elsHolder.els, 5, 'move');
            expect(elsHolder.els.modalTitle.textContent).toBe('Moving…');
            expect(elsHolder.els.btnModalCancel.textContent).toBe('Cancel move');
        });

        it('renderProgress updates fill width + text', () => {
            renderRunPhase(elsHolder.els, 10, 'copy');
            renderProgress(elsHolder.els, job({ total: 10, copied: 3 }));
            expect(elsHolder.els.progressFill.style.width).toBe('30%');
            expect(elsHolder.els.progressText.textContent).toBe('3 / 10');
        });

        it('renderProgress with total=0 reports 100% (avoids div-by-zero)', () => {
            renderRunPhase(elsHolder.els, 0, 'copy');
            renderProgress(elsHolder.els, job({ total: 0, copied: 0 }));
            expect(elsHolder.els.progressFill.style.width).toBe('100%');
        });

        it('renderProgress caps at 100% when copied > total', () => {
            renderRunPhase(elsHolder.els, 5, 'copy');
            renderProgress(elsHolder.els, job({ total: 5, copied: 7 }));
            expect(elsHolder.els.progressFill.style.width).toBe('100%');
        });

        it('renderRunError reveals modal error pane', () => {
            renderRunError(elsHolder.els, 'broker rejected');
            expect(elsHolder.els.modalRunError.classList.contains('hidden')).toBe(false);
            expect(elsHolder.els.modalRunError.textContent).toContain('broker rejected');
        });

        it('renderRunComplete cancelled shows "Cancelled" title', () => {
            renderRunComplete(elsHolder.els, job({ total: 5, copied: 2, status: 'cancelled' }));
            expect(elsHolder.els.modalTitle.textContent).toBe('Cancelled');
            expect(elsHolder.els.btnModalCancel.textContent).toBe('Close');
        });

        it('renderRunComplete success shows "Completed"', () => {
            renderRunComplete(elsHolder.els, job({ total: 5, copied: 5, status: 'completed' }));
            expect(elsHolder.els.modalTitle.textContent).toBe('Completed');
        });

        it('renderRunComplete error shows "Failed"', () => {
            renderRunComplete(elsHolder.els, job({ total: 5, copied: 2, status: 'error', lastError: 'broker said no' }));
            expect(elsHolder.els.modalTitle.textContent).toBe('Failed');
        });
    });

    describe('setEmptyQueueIndicator / setReadOnlyIndicator / setNoAccessIndicator', () => {
        it('setEmptyQueueIndicator(true) reveals the banner; false hides it', () => {
            setEmptyQueueIndicator(elsHolder.els, true);
            expect(elsHolder.els.modalSourceEmpty.classList.contains('hidden')).toBe(false);
            setEmptyQueueIndicator(elsHolder.els, false);
            expect(elsHolder.els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
        });

        it('setReadOnlyIndicator(true) reveals the banner; false hides it', () => {
            setReadOnlyIndicator(elsHolder.els, true);
            expect(elsHolder.els.modalSourceReadonly.classList.contains('hidden')).toBe(false);
            setReadOnlyIndicator(elsHolder.els, false);
            expect(elsHolder.els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
        });

        it('setNoAccessIndicator(true) reveals the banner; false hides it', () => {
            setNoAccessIndicator(elsHolder.els, true);
            expect(elsHolder.els.modalSourceNoAccess.classList.contains('hidden')).toBe(false);
            setNoAccessIndicator(elsHolder.els, false);
            expect(elsHolder.els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
        });

        it('all banners hidden after renderModalInitial', () => {
            setEmptyQueueIndicator(elsHolder.els, true);
            setReadOnlyIndicator(elsHolder.els, true);
            setNoAccessIndicator(elsHolder.els, true);
            renderModalInitial(elsHolder.els, SRC, DST, 'copy');
            expect(elsHolder.els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
        });

        it('all banners hidden after resetVerifyDisplay', () => {
            setEmptyQueueIndicator(elsHolder.els, true);
            setReadOnlyIndicator(elsHolder.els, true);
            setNoAccessIndicator(elsHolder.els, true);
            resetVerifyDisplay(elsHolder.els);
            expect(elsHolder.els.modalSourceEmpty.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.modalSourceReadonly.classList.contains('hidden')).toBe(true);
            expect(elsHolder.els.modalSourceNoAccess.classList.contains('hidden')).toBe(true);
        });
    });
});
