import type { AppContext } from '../../core/types';
import { primarySempContextFrom } from '../../core/services/sempContext';
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
        const sempCtx = primarySempContextFrom(ctx);
        if (!sempCtx) return;
        const picked = await pickQueue(sempCtx, {
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
        const sempCtx = destSempContext(ctx, state);
        if (!sempCtx) return;
        const defaultVpn = state.destForm.sameBroker && state.destForm.sameVpn
            ? (ctx.appState.selectedVpn ?? undefined)
            : (state.destForm.solace.vpn || undefined);
        const picked = await pickQueue(sempCtx, { title: 'Pick destination queue', defaultVpn });
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

    // ===== Helpers =====
    function syncDestFromToggles(): void {
        const snap = services.getPrimarySnapshot();
        ui.applyDestPrefill(els, state.destForm.sameBroker, state.destForm.sameVpn, snap);
        // Prefill also needs to flow back into state so the modal summary +
        // any downstream consumer see the values that now live in the inputs.
        syncDestFormFromSnapshot(state, snap);
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
    services.refreshStartEnabled();
    services.refreshDestPickVisible();
}

/**
 * Resolve the SempContext to use for destination discovery:
 *   - same broker: primary SempContext
 *   - different broker: destSempCtx if the user has established one (this
 *     module no longer has an in-form Connect button, but future flows may
 *     populate it — e.g. auto-connect on picker click)
 */
function destSempContext(ctx: AppContext, state: QueueCopyState): import('../../core/connections/types').SempContext | null {
    if (state.destForm.sameBroker) {
        return primarySempContextFrom(ctx);
    }
    return state.destSempCtx;
}

