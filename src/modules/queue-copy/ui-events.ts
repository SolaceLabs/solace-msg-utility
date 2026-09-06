import type { AppContext } from '../../core/types';
import { queueSourceFrom, sempQueueSource, type QueueSource } from '../../core/services/queue-source';
import { resolveDestCredModes } from '../../core/connections/conn-modes';
import type { DestCredMode } from './state';
import { pickQueue } from '../../core/components/queue-picker';
import * as ui from './ui';
import type { CopyUiElements, PrimarySnapshot } from './ui';
import type { QueueCopyState, CopyMode, DestType } from './state';
import { syncDestFormFromSnapshot } from './state';
import { openCopyModal, cancelCopyModal } from './ui-modal';

/**
 * Surface provided by `module.ts` so `ui-events` stays free of session /
 * factory details. The primary snapshot is computed fresh each call so the
 * toggle-prefill path always reflects the live primary connection.
 */
export interface CopyUiServices {
    /** Return a snapshot of primary connection fields for toggle prefill, or null. */
    getPrimarySnapshot: () => PrimarySnapshot | null;
    /** Return the live primary Solace session (used by the modal). */
    getPrimarySession: () => any | null;
    /** Open the destination SEMP connection from the form values. */
    connectDestSemp: () => void;
    /** Tear down the destination SEMP connection. */
    disconnectDestSemp: () => void;
    /** Open the destination Solace (Client) connection from the form values. */
    connectDestSol: () => void;
    /** Tear down the destination Solace (Client) connection. */
    disconnectDestSol: () => void;
    /** Re-derive the Next button's enabled state. Owned by module.ts. */
    refreshStartEnabled: () => void;
    /** Re-derive the destination picker icon's visibility. Owned by module.ts. */
    refreshDestPickVisible: () => void;
}

export function wireUiEvents(
    ctx: AppContext,
    els: CopyUiElements,
    state: QueueCopyState,
    services: CopyUiServices,
): void {
    // ===== Source =====
    els.sourceInput.addEventListener('input', () => {
        state.sourceQueue = els.sourceInput.value.trim();
        services.refreshStartEnabled();
    });

    els.btnSourcePick.addEventListener('click', async () => {
        // Reading FROM a queue is legitimate even when it is read-only to this
        // user (move's delete half is gated separately, at run start).
        const source = queueSourceFrom(ctx, 'browse');
        if (!source) return;
        const picked = await pickQueue(source, {
            title: 'Pick source queue',
            defaultVpn: ctx.appState.selectedVpn ?? undefined,
        });
        if (picked === null) return;

        // If the picked VPN matches the current primary VPN, just update the
        // source queue locally. Otherwise hand off to the connections module:
        // emit `connection:check-connection` with returnTo='queue-copy'; the
        // connections module switches the primary's VPN, and on success fires
        // `copy:vpn-switched` (the queue-copy module navigates back and writes
        // the queue name into the input).
        if (picked.vpn === ctx.appState.selectedVpn) {
            state.sourceQueue = picked.queue;
            els.sourceInput.value = picked.queue;
            services.refreshStartEnabled();
        } else {
            ctx.eventBus.emit('connection:check-connection', {
                vpn: picked.vpn,
                queue: picked.queue,
                returnTo: 'queue-copy',
            });
        }
    });

    // ===== Destination Broker toggles =====
    // Any change to either toggle disposes BOTH live secondary connections
    // (dest SEMP + dest Client). Toggling ON makes them redundant; toggling
    // OFF means the form fields the user is about to edit no longer match
    // whatever the existing connection was bound to. Either way, drop the
    // sessions and clear the typed passwords / Connect-button state so the
    // user starts from a clean slate.
    els.toggleSameBroker.addEventListener('change', () => {
        state.destForm.sameBroker = els.toggleSameBroker.checked;
        if (!state.destForm.sameBroker) {
            state.destForm.sameVpn = false;
        }
        disposeDestSempConnection();
        disposeDestSolConnection();
        syncDestFromToggles();
    });

    els.toggleSameVpn.addEventListener('change', () => {
        state.destForm.sameVpn = els.toggleSameVpn.checked;
        disposeDestSempConnection();
        disposeDestSolConnection();
        syncDestFromToggles();
    });

    function disposeDestSempConnection(): void {
        if (state.destSempCtx) services.disconnectDestSemp();
        state.destSempPass = '';
        els.destSempPass.value = '';
        ui.setDestSempStatus(els, 'disconnected');
        ui.setDestSempError(els, null);
    }

    function disposeDestSolConnection(): void {
        if (state.destSession) services.disconnectDestSol();
        state.destSolacePass = '';
        els.destSolPass.value = '';
        ui.setDestSolStatus(els, 'disconnected');
        ui.setDestSolError(els, null);
    }

    // ===== Destination Broker host =====
    els.destHost.addEventListener('input', () => { state.destForm.host = els.destHost.value.trim(); });

    // ===== Destination Connect buttons =====
    // Same one-button toggle as the connections module: read the button's
    // current label to decide connect vs disconnect.
    els.btnDestSempConnect.addEventListener('click', () => {
        if (els.btnDestSempConnect.textContent === 'Disconnect') {
            services.disconnectDestSemp();
        } else {
            services.connectDestSemp();
        }
    });
    els.btnDestSolConnect.addEventListener('click', () => {
        if (els.btnDestSolConnect.textContent === 'Disconnect') {
            services.disconnectDestSol();
        } else {
            services.connectDestSol();
        }
    });

    // ===== Destination SEMP (Management) =====
    els.destSempProtocol.addEventListener('change', () => { state.destForm.semp.protocol = els.destSempProtocol.value; });
    els.destSempPort.addEventListener('input', () => { state.destForm.semp.port = els.destSempPort.value.trim(); });
    els.destSempUrlPath.addEventListener('input', () => { state.destForm.semp.urlPath = els.destSempUrlPath.value.trim(); });
    els.destSempUser.addEventListener('input', () => { state.destForm.semp.user = els.destSempUser.value.trim(); });
    els.destSempPass.addEventListener('input', () => { state.destSempPass = els.destSempPass.value; });

    // ===== Destination Solace (Client) =====
    els.destSolProtocol.addEventListener('change', () => { state.destForm.solace.protocol = els.destSolProtocol.value; });
    els.destSolPort.addEventListener('input', () => { state.destForm.solace.port = els.destSolPort.value.trim(); });
    els.destSolUrlPath.addEventListener('input', () => { state.destForm.solace.urlPath = els.destSolUrlPath.value.trim(); });
    els.destSolVpn.addEventListener('input', () => { state.destForm.solace.vpn = els.destSolVpn.value.trim(); });
    els.destSolUser.addEventListener('input', () => { state.destForm.solace.user = els.destSolUser.value.trim(); });
    els.destSolPass.addEventListener('input', () => { state.destSolacePass = els.destSolPass.value; });

    // Enter-to-connect: pressing Enter in any destination field triggers the
    // same click path as the Connect button on that card. Mirrors the
    // connections module's Enter bindings. The destHost field is shared so
    // it binds to the SEMP Connect (SEMP is typically established first
    // because it powers the destination queue picker).
    //
    // `keydown` (not deprecated `keypress`) for cross-layout parity.
    const onEnter = (e: KeyboardEvent, btn: HTMLButtonElement): void => {
        if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    };
    const sempFields: HTMLElement[] = [
        els.destHost,
        els.destSempPort, els.destSempUrlPath, els.destSempUser, els.destSempPass,
    ];
    sempFields.forEach((input) => {
        input.addEventListener('keydown', (e) => onEnter(e as KeyboardEvent, els.btnDestSempConnect));
    });
    const solFields: HTMLElement[] = [
        els.destSolPort, els.destSolUrlPath, els.destSolVpn, els.destSolUser, els.destSolPass,
    ];
    solFields.forEach((input) => {
        input.addEventListener('keydown', (e) => onEnter(e as KeyboardEvent, els.btnDestSolConnect));
    });

    // ===== Destination type + name =====
    // Slide toggle: unchecked = queue, checked = topic. Drives state.dest.type
    // and re-applies the label / placeholder + active-side highlight via
    // ui.applyDestType.
    els.destTypeToggle.addEventListener('change', () => {
        const type: DestType = els.destTypeToggle.checked ? 'topic' : 'queue';
        state.dest.type = type;
        ui.applyDestType(els, type);
        services.refreshDestPickVisible();
    });

    els.destInput.addEventListener('input', () => {
        state.dest.name = els.destInput.value.trim();
        services.refreshStartEnabled();
    });

    els.btnDestPick.addEventListener('click', async () => {
        const source = destQueueSource(ctx, state);
        if (!source) return;
        const defaultVpn = state.destForm.sameBroker && state.destForm.sameVpn
            ? (ctx.appState.selectedVpn ?? undefined)
            : (state.destForm.solace.vpn || undefined);
        const picked = await pickQueue(source, { title: 'Pick destination queue', defaultVpn });
        if (picked === null) return;

        // Picking from a different VPN updates the destination form's VPN
        // in-place — destination operates entirely within this module so no
        // bus handoff is needed. If the user had "Same VPN" on, that toggle
        // turns off (different VPN by definition) and the dest VPN field
        // becomes editable + reflects the picked VPN.
        if (picked.vpn !== state.destForm.solace.vpn) {
            if (state.destForm.sameBroker && state.destForm.sameVpn) {
                state.destForm.sameVpn = false;
                els.toggleSameVpn.checked = false;
            }
            state.destForm.solace.vpn = picked.vpn;
            els.destSolVpn.value = picked.vpn;
            // Re-apply prefill so toggle/disabled state matches the new VPN.
            syncDestFromToggles();
        }
        state.dest.name = picked.queue;
        els.destInput.value = picked.queue;
        services.refreshStartEnabled();
    });

    // ===== Mode =====
    els.modeRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
            if (radio.checked) state.mode = radio.value as CopyMode;
        });
    });

    // ===== Footer: Next =====
    els.btnStart.addEventListener('click', () => {
        if (!state.sourceQueue || !state.dest.name) return;
        openCopyModal(ctx, els, state, services.getPrimarySession);
    });

    // ===== Modal buttons =====
    els.btnModalCancel.addEventListener('click', () => {
        cancelCopyModal(els, state);
    });

    // Modal Start is wired inside ui-modal so it has access to the verify
    // result + dest-connection orchestration. No event listener here.

    // ===== Destination credential source =====

    /** A secondary connection is only needed when the dest isn't the primary. */
    const needsSecondary = (): boolean => !state.destForm.sameBroker || !state.destForm.sameVpn;

    /**
     * Which credential sources this deployment permits, derived from the same
     * `CONN_MODES` enum that drives the primary's tabs. Provisioned additionally
     * requires a signed-in managed session; if filtering by that would leave
     * nothing, keep the deployment's offer rather than silently falling back to
     * Manual — a managed-only deployment must never hand out a manual bypass.
     */
    function offeredCredModes(): DestCredMode[] {
        const offered = resolveDestCredModes(ctx.appState.connConfig ?? null);
        const usable = ctx.managedStore.isActive() ? offered : offered.filter(m => m !== 'provisioned');
        return usable.length ? usable : offered;
    }

    /** Re-render the credential-source control and everything gated on it. */
    function refreshDestCredUi(): void {
        const offered = offeredCredModes();
        // Pin to the deployment's default when the current choice isn't on offer.
        if (!offered.includes(state.destForm.credMode)) state.destForm.credMode = offered[0];
        const active = state.destForm.credMode;

        ui.applyDestCredMode(els, { offered, active, needsSecondary: needsSecondary() });
        ui.setDestManualFieldsEnabled(els, active === 'manual');

        if (active === 'provisioned') {
            const brokers = ctx.managedStore.brokers().map(b => b.broker);
            ui.renderDestProvisionedBrokers(els, brokers, state.destForm.provisioned.broker);
            state.destForm.provisioned.broker = els.destProvBroker.value;
            refreshDestProvisionedVpns();
        }
        // A managed session publishing provisioned credentials cannot express
        // topic entitlement, so the type is forced to Queue (the run-start gate
        // refuses topics on that path regardless — this keeps the UI honest).
        refreshDestTypeAvailability();
    }

    function refreshDestProvisionedVpns(): void {
        const vpns = ctx.managedStore.vpnsFor(state.destForm.provisioned.broker);
        ui.renderDestProvisionedVpns(els, vpns, state.destForm.provisioned.vpn);
        state.destForm.provisioned.vpn = els.destProvVpn.value;
    }

    /** True when the publish path will use provisioned managed credentials. */
    function publishesProvisioned(): boolean {
        if (!ctx.appState.managed) return false;
        return needsSecondary() ? state.destForm.credMode === 'provisioned' : true;
    }

    function refreshDestTypeAvailability(): void {
        const topicBlocked = publishesProvisioned();
        ui.setDestTopicBlocked(els, topicBlocked);
        if (topicBlocked && state.dest.type === 'topic') {
            state.dest.type = 'queue';
            ui.applyDestType(els, 'queue');
            state.dest.name = '';
            els.destInput.value = '';
            services.refreshStartEnabled();
        }
    }

    els.destCredProvisioned.addEventListener('change', () => selectCredMode('provisioned'));
    els.destCredManual.addEventListener('change', () => selectCredMode('manual'));

    /**
     * Switching credential source invalidates any live secondary connection AND
     * the chosen target (it was picked against a different broker), so both are
     * dropped — same discipline as the connection module's tab switch.
     */
    function selectCredMode(mode: DestCredMode): void {
        if (state.destForm.credMode === mode) return;
        state.destForm.credMode = mode;
        disposeDestSempConnection();
        disposeDestSolConnection();
        state.dest.name = '';
        els.destInput.value = '';
        // Re-derive prefill first (it owns manual field enablement), then let
        // refreshDestCredUi re-lock them if we've switched to provisioned.
        syncDestFromToggles();
    }

    els.destProvBroker.addEventListener('change', () => {
        state.destForm.provisioned.broker = els.destProvBroker.value;
        // A different broker means different VPNs and a different queue namespace.
        disposeDestSempConnection();
        disposeDestSolConnection();
        state.dest.name = '';
        els.destInput.value = '';
        refreshDestProvisionedVpns();
        services.refreshStartEnabled();
        services.refreshDestPickVisible();
    });

    els.destProvVpn.addEventListener('change', () => {
        state.destForm.provisioned.vpn = els.destProvVpn.value;
        disposeDestSolConnection();
        services.refreshStartEnabled();
    });

    // ===== Helpers =====
    function syncDestFromToggles(): void {
        const snap = services.getPrimarySnapshot();
        ui.applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, snap);
        // Prefill also needs to flow back into state so the modal summary +
        // any downstream consumer see the values that now live in the inputs.
        syncDestFormFromSnapshot(state, snap);
        refreshDestCredUi();
        services.refreshDestPickVisible();
        services.refreshStartEnabled();
    }

    // Initial pass — apply prefill + state syncing. Picker visibility and
    // Next-button gates are owned by module.ts and refreshed once the wiring
    // returns; the initial call from module.ts after wireUiEvents() handles it.
    {
        const snap = services.getPrimarySnapshot();
        ui.applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, snap);
        syncDestFormFromSnapshot(state, snap);
    }
    // The provisioned set and the session itself can both change under us; this
    // panel owns the credential control, so it re-derives its own UI here while
    // module.ts handles the run/connection lifecycle for the same event.
    ctx.eventBus.on('rbac:changed', () => {
        if (state.destForm.credMode === 'provisioned') {
            const stillThere = ctx.managedStore
                .vpnsFor(state.destForm.provisioned.broker)
                .includes(state.destForm.provisioned.vpn);
            if (!stillThere) {
                // The chosen identity is gone — drop the target picked against it.
                state.dest.name = '';
                els.destInput.value = '';
            }
        }
        refreshDestCredUi();
        services.refreshStartEnabled();
        services.refreshDestPickVisible();
    });

    refreshDestCredUi();
    services.refreshStartEnabled();
    services.refreshDestPickVisible();
}

/**
 * Resolve the QueueSource to use for destination discovery:
 *   - same broker: the primary connection's source (queueSourceFrom)
 *   - different broker: a SEMP-backed source over the module-local destSempCtx
 *     if the user has established one (this module no longer has an in-form
 *     Connect button, but future flows may populate it — e.g. auto-connect on
 *     picker click)
 */
function destQueueSource(ctx: AppContext, state: QueueCopyState): QueueSource | null {
    if (state.destForm.sameBroker) {
        // Copying INTO a queue is a WRITE — operate scope.
        return queueSourceFrom(ctx, 'operate');
    }
    if (!state.destSempCtx) return null;
    const session = ctx.appState.managed;
    if (state.destForm.credMode === 'provisioned' && session) {
        // Provisioned destination: entitlement-filtered against the DESTINATION
        // broker, at operate scope because copying into a queue is a write.
        return sempQueueSource(state.destSempCtx, {
            session, broker: state.destForm.provisioned.broker, scope: 'operate',
        });
    }
    // A manual-credential destination is governed by no managed session: the
    // deliberate, audited bypass (see `Access` in core/services/queue-source).
    return sempQueueSource(state.destSempCtx, 'unmanaged');
}

