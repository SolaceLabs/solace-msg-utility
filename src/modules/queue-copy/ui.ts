import { required } from '../../core/dom';
import { formatBytes } from '../../core/utils';
import type { CopyJob, VerifyResult, DestType, CopyMode } from './state';

export interface CopyUiElements {
    container: HTMLElement;

    // Top-level visibility
    warning: HTMLElement;
    content: HTMLElement;

    // Source read-only connection mirror (populated from AppState.solaceConnection
    // + AppState.sempCredentials via applySourceReadonly)
    sourceHost: HTMLInputElement;
    sourceSempProtocol: HTMLSelectElement;
    sourceSempPort: HTMLInputElement;
    sourceSempUrlPath: HTMLInputElement;
    sourceSempUser: HTMLInputElement;
    sourceSempPass: HTMLInputElement;
    sourceSolProtocol: HTMLSelectElement;
    sourceSolPort: HTMLInputElement;
    sourceSolUrlPath: HTMLInputElement;
    sourceSolVpn: HTMLInputElement;
    sourceSolUser: HTMLInputElement;
    sourceSolPass: HTMLInputElement;
    /** All "Edit in Connections" buttons — one in each source card header. */
    sourceEditButtons: NodeListOf<HTMLButtonElement>;

    // Source queue (editable)
    sourceInput: HTMLInputElement;
    btnSourcePick: HTMLButtonElement;
    sourceError: HTMLElement;

    // Destination Broker (host + toggles)
    toggleSameBroker: HTMLInputElement;
    toggleSameVpn: HTMLInputElement;
    destHost: HTMLInputElement;

    // Destination SEMP (Management) card
    destSempProtocol: HTMLSelectElement;
    destSempPort: HTMLInputElement;
    destSempUrlPath: HTMLInputElement;
    destSempUser: HTMLInputElement;
    destSempPass: HTMLInputElement;

    // Destination Solace (Client) card
    destSolProtocol: HTMLSelectElement;
    destSolPort: HTMLInputElement;
    destSolUrlPath: HTMLInputElement;
    destSolVpn: HTMLInputElement;
    destSolUser: HTMLInputElement;
    destSolPass: HTMLInputElement;

    // Destination Connect buttons + status + error panes. The two rows
    // toggle visibility via the `.hidden` class based on the Same-broker /
    // Same-VPN checkboxes — mirrors the connections module's per-card
    // Connect / Disconnect button lifecycle.
    destSempConnectRow: HTMLElement;
    btnDestSempConnect: HTMLButtonElement;
    destSempStatus: HTMLElement;
    destSempError: HTMLElement;
    destSolConnectRow: HTMLElement;
    btnDestSolConnect: HTMLButtonElement;
    destSolStatus: HTMLElement;
    destSolError: HTMLElement;

    // Destination target — slide toggle (unchecked = queue, checked = topic).
    destTypeToggle: HTMLInputElement;
    destTypeLabelQueue: HTMLElement;
    destTypeLabelTopic: HTMLElement;
    destNameLabel: HTMLElement;
    destInput: HTMLInputElement;
    btnDestPick: HTMLButtonElement;
    destError: HTMLElement;

    // Mode (lives inside Destination card now)
    modeRadios: NodeListOf<HTMLInputElement>;

    // Footer action
    btnStart: HTMLButtonElement;

    // Modal
    modal: HTMLDialogElement;
    modalTitle: HTMLElement;
    sectionVerify: HTMLElement;
    modalSourceBroker: HTMLElement;
    modalSourceVpn: HTMLElement;
    modalSourceName: HTMLElement;
    modalSourceUsage: HTMLElement;
    modalSourceCount: HTMLElement;
    modalSourceMaxSizeLabel: HTMLElement;
    modalSourceMaxSize: HTMLElement;
    modalSourceOldestId: HTMLElement;
    modalSourceNewestId: HTMLElement;
    modalSourceStatus: HTMLElement;
    /** "Refresh" button in the modal's Source-block header — re-runs verifySource()
     *  without closing the modal. Enabled after each verify probe completes; hidden
     *  once the run phase begins. */
    btnModalSourceRefresh: HTMLButtonElement;
    modalVerifyError: HTMLElement;
    /** Red banner under the verify section. Shown when verify returns
     *  `messageCount === 0` so the user understands why Start is disabled. */
    modalSourceEmpty: HTMLElement;
    /** Red banner under the verify section. Shown when verify returns
     *  `accessType === 'read-only'` AND the user has selected Move mode —
     *  Move requires consume permission. Toggled via setReadOnlyIndicator. */
    modalSourceReadonly: HTMLElement;
    /** Red banner under the verify section. Shown when verify returns
     *  `accessType === 'no-access'` (SEMP `<others-permission>` is `No-Access*`
     *  AND the user is not the queue owner). Both Copy and Move are blocked.
     *  Toggled via setNoAccessIndicator. */
    modalSourceNoAccess: HTMLElement;

    modalDestBroker: HTMLElement;
    modalDestVpn: HTMLElement;
    modalDestType: HTMLElement;
    modalDestNameLabel: HTMLElement;
    modalDestName: HTMLElement;

    sectionRun: HTMLElement;
    progressFill: HTMLElement;
    progressText: HTMLElement;
    modalRunError: HTMLElement;

    btnModalCancel: HTMLButtonElement;
    btnModalStart: HTMLButtonElement;
}

export function cacheElements(container: HTMLElement): CopyUiElements {
    return {
        container,
        warning: required(container, '#copy-warning'),
        content: required(container, '#copy-content'),

        sourceHost: required<HTMLInputElement>(container, '#copy-source-host'),
        sourceSempProtocol: required<HTMLSelectElement>(container, '#copy-source-semp-protocol'),
        sourceSempPort: required<HTMLInputElement>(container, '#copy-source-semp-port'),
        sourceSempUrlPath: required<HTMLInputElement>(container, '#copy-source-semp-urlpath'),
        sourceSempUser: required<HTMLInputElement>(container, '#copy-source-semp-user'),
        sourceSempPass: required<HTMLInputElement>(container, '#copy-source-semp-pass'),
        sourceSolProtocol: required<HTMLSelectElement>(container, '#copy-source-sol-protocol'),
        sourceSolPort: required<HTMLInputElement>(container, '#copy-source-sol-port'),
        sourceSolUrlPath: required<HTMLInputElement>(container, '#copy-source-sol-urlpath'),
        sourceSolVpn: required<HTMLInputElement>(container, '#copy-source-sol-vpn'),
        sourceSolUser: required<HTMLInputElement>(container, '#copy-source-sol-user'),
        sourceSolPass: required<HTMLInputElement>(container, '#copy-source-sol-pass'),
        sourceEditButtons: container.querySelectorAll<HTMLButtonElement>('.copy-source-edit-btn'),

        sourceInput: required<HTMLInputElement>(container, '#copy-source-input'),
        btnSourcePick: required<HTMLButtonElement>(container, '#copy-btn-source-pick'),
        sourceError: required(container, '#copy-source-error'),

        toggleSameBroker: required<HTMLInputElement>(container, '#copy-toggle-same-broker'),
        toggleSameVpn: required<HTMLInputElement>(container, '#copy-toggle-same-vpn'),
        destHost: required<HTMLInputElement>(container, '#copy-dest-host'),

        destSempProtocol: required<HTMLSelectElement>(container, '#copy-dest-semp-protocol'),
        destSempPort: required<HTMLInputElement>(container, '#copy-dest-semp-port'),
        destSempUrlPath: required<HTMLInputElement>(container, '#copy-dest-semp-urlpath'),
        destSempUser: required<HTMLInputElement>(container, '#copy-dest-semp-user'),
        destSempPass: required<HTMLInputElement>(container, '#copy-dest-semp-pass'),

        destSolProtocol: required<HTMLSelectElement>(container, '#copy-dest-sol-protocol'),
        destSolPort: required<HTMLInputElement>(container, '#copy-dest-sol-port'),
        destSolUrlPath: required<HTMLInputElement>(container, '#copy-dest-sol-urlpath'),
        destSolVpn: required<HTMLInputElement>(container, '#copy-dest-sol-vpn'),
        destSolUser: required<HTMLInputElement>(container, '#copy-dest-sol-user'),
        destSolPass: required<HTMLInputElement>(container, '#copy-dest-sol-pass'),

        destSempConnectRow: required(container, '#copy-dest-semp-connect-row'),
        btnDestSempConnect: required<HTMLButtonElement>(container, '#copy-btn-dest-semp-connect'),
        destSempStatus: required(container, '#copy-dest-semp-status'),
        destSempError: required(container, '#copy-dest-semp-error'),
        destSolConnectRow: required(container, '#copy-dest-sol-connect-row'),
        btnDestSolConnect: required<HTMLButtonElement>(container, '#copy-btn-dest-sol-connect'),
        destSolStatus: required(container, '#copy-dest-sol-status'),
        destSolError: required(container, '#copy-dest-sol-error'),

        destTypeToggle: required<HTMLInputElement>(container, '#copy-dest-type-toggle'),
        destTypeLabelQueue: required(container, '#copy-dest-type-label-queue'),
        destTypeLabelTopic: required(container, '#copy-dest-type-label-topic'),
        destNameLabel: required(container, '#copy-dest-name-label'),
        destInput: required<HTMLInputElement>(container, '#copy-dest-input'),
        btnDestPick: required<HTMLButtonElement>(container, '#copy-btn-dest-pick'),
        destError: required(container, '#copy-dest-error'),

        modeRadios: container.querySelectorAll<HTMLInputElement>('input[name="copy-mode"]'),

        btnStart: required<HTMLButtonElement>(container, '#copy-btn-start'),

        modal: required<HTMLDialogElement>(container, '#copy-modal'),
        modalTitle: required(container, '#copy-modal-title'),
        sectionVerify: required(container, '#copy-modal-verify'),
        modalSourceBroker: required(container, '#copy-modal-source-broker'),
        modalSourceVpn: required(container, '#copy-modal-source-vpn'),
        modalSourceName: required(container, '#copy-modal-source-name'),
        modalSourceUsage: required(container, '#copy-modal-source-usage'),
        modalSourceCount: required(container, '#copy-modal-source-count'),
        modalSourceMaxSizeLabel: required(container, '#copy-modal-source-max-size-label'),
        modalSourceMaxSize: required(container, '#copy-modal-source-max-size'),
        modalSourceOldestId: required(container, '#copy-modal-source-oldest-id'),
        modalSourceNewestId: required(container, '#copy-modal-source-newest-id'),
        modalSourceStatus: required(container, '#copy-modal-source-status'),
        btnModalSourceRefresh: required<HTMLButtonElement>(container, '#copy-modal-source-refresh'),
        modalVerifyError: required(container, '#copy-modal-verify-error'),
        modalSourceEmpty: required(container, '#copy-modal-source-empty'),
        modalSourceReadonly: required(container, '#copy-modal-source-readonly'),
        modalSourceNoAccess: required(container, '#copy-modal-source-noaccess'),

        modalDestBroker: required(container, '#copy-modal-dest-broker'),
        modalDestVpn: required(container, '#copy-modal-dest-vpn'),
        modalDestType: required(container, '#copy-modal-dest-type'),
        modalDestNameLabel: required(container, '#copy-modal-dest-name-label'),
        modalDestName: required(container, '#copy-modal-dest-name'),

        sectionRun: required(container, '#copy-modal-run'),
        progressFill: required(container, '#copy-progress-fill'),
        progressText: required(container, '#copy-progress-text'),
        modalRunError: required(container, '#copy-run-error'),

        btnModalCancel: required<HTMLButtonElement>(container, '#copy-modal-cancel'),
        btnModalStart: required<HTMLButtonElement>(container, '#copy-modal-start'),
    };
}

/** Show/hide the warning vs content panels based on primary connection. */
export function setPrimaryConnected(els: CopyUiElements, isConnected: boolean): void {
    if (isConnected) {
        els.warning.classList.add('hidden');
        els.content.classList.remove('hidden');
    } else {
        els.warning.classList.remove('hidden');
        els.content.classList.add('hidden');
    }
}

/**
 * Snapshot of the primary connection used to prefill destination fields and
 * populate the source-side read-only mirror. Includes passwords so the source
 * card can show a non-empty password field mirroring what the user entered in
 * the connections form.
 */
export interface PrimarySnapshot {
    host: string;
    solace: { protocol: string; port: string; urlPath: string; vpn: string; user: string; pass: string };
    semp: { protocol: string; port: string; urlPath: string; user: string; pass: string };
}

/**
 * Populate the read-only Source cards with the live primary connection values,
 * including passwords. Passwords come from AppState (solaceConnection.pass +
 * sempCredentials.pass), which the connections module publishes on connect.
 */
export function applySourceReadonly(els: CopyUiElements, primary: PrimarySnapshot | null): void {
    const v = (x: string | undefined) => x ?? '';
    els.sourceHost.value = v(primary?.host);
    if (primary?.semp.protocol) els.sourceSempProtocol.value = primary.semp.protocol;
    els.sourceSempPort.value = v(primary?.semp.port);
    els.sourceSempUrlPath.value = v(primary?.semp.urlPath);
    els.sourceSempUser.value = v(primary?.semp.user);
    els.sourceSempPass.value = v(primary?.semp.pass);
    if (primary?.solace.protocol) els.sourceSolProtocol.value = primary.solace.protocol;
    els.sourceSolPort.value = v(primary?.solace.port);
    els.sourceSolUrlPath.value = v(primary?.solace.urlPath);
    els.sourceSolVpn.value = v(primary?.solace.vpn);
    els.sourceSolUser.value = v(primary?.solace.user);
    els.sourceSolPass.value = v(primary?.solace.pass);
}

/**
 * Apply toggle state to the destination form: when "Same broker" is on, every
 * broker-level field is disabled and prefilled with the primary's value
 * (passwords stay blank — we don't surface the primary password in a visible
 * field). When "Same VPN" is on (only meaningful with Same broker), the
 * Client-side VPN/user/pass fields are also disabled-and-synced.
 *
 * Forced sameVpn=false when sameBroker=false (different broker → different
 * VPN by definition).
 */
export function applyDestPrefill(
    els: CopyUiElements,
    sameBroker: boolean,
    sameVpn: boolean,
    primary: PrimarySnapshot | null,
): void {
    if (!sameBroker) {
        els.toggleSameVpn.checked = false;
        els.toggleSameVpn.disabled = true;
    } else {
        els.toggleSameVpn.disabled = false;
    }

    const setVal = (input: HTMLInputElement | HTMLSelectElement, val: string) => {
        input.value = val;
    };

    // Broker-level fields driven by Same broker
    const lockBroker = sameBroker;
    if (lockBroker && primary) {
        setVal(els.destHost, primary.host);
        setVal(els.destSempProtocol, primary.semp.protocol);
        setVal(els.destSempPort, primary.semp.port);
        setVal(els.destSempUrlPath, primary.semp.urlPath);
        setVal(els.destSempUser, primary.semp.user);
        setVal(els.destSolProtocol, primary.solace.protocol);
        setVal(els.destSolPort, primary.solace.port);
        setVal(els.destSolUrlPath, primary.solace.urlPath);
    }
    els.destHost.disabled = lockBroker;
    els.destSempProtocol.disabled = lockBroker;
    els.destSempPort.disabled = lockBroker;
    els.destSempUrlPath.disabled = lockBroker;
    els.destSempUser.disabled = lockBroker;
    els.destSempPass.disabled = lockBroker;
    els.destSolProtocol.disabled = lockBroker;
    els.destSolPort.disabled = lockBroker;
    els.destSolUrlPath.disabled = lockBroker;

    // VPN-level fields driven by Same VPN (only meaningful when Same broker)
    const lockVpn = sameBroker && sameVpn;
    if (lockVpn && primary) {
        setVal(els.destSolVpn, primary.solace.vpn);
        setVal(els.destSolUser, primary.solace.user);
    }
    els.destSolVpn.disabled = lockVpn;
    els.destSolUser.disabled = lockVpn;
    els.destSolPass.disabled = lockVpn;

    // Connect-row visibility:
    //   - SEMP needs its own Connect when "Same broker" is unchecked.
    //     With Same broker checked the destination reuses the primary SEMP,
    //     so no extra connect step is required.
    //   - Client needs its own Connect when EITHER toggle is unchecked.
    //     Same-broker + Same-VPN reuses the primary session entirely.
    els.destSempConnectRow.classList.toggle('hidden', sameBroker);
    els.destSolConnectRow.classList.toggle('hidden', sameBroker && sameVpn);
}

/**
 * Lock or unlock the destination SEMP form fields. Called from module.ts's
 * SEMP factory hooks: `onConnected` → lock, `onDisconnected`/`onAuthFailed`/
 * `onError` → unlock. Mirrors the connections module's "fields disabled while
 * bound" pattern so the user can't change creds out from under a live session.
 *
 * Host stays under the broker-level lock — see `setDestBrokerLocked` — because
 * SEMP and Client share the same host field.
 */
export function setDestSempFormLocked(els: CopyUiElements, locked: boolean): void {
    els.destSempProtocol.disabled = locked;
    els.destSempPort.disabled = locked;
    els.destSempUrlPath.disabled = locked;
    els.destSempUser.disabled = locked;
    els.destSempPass.disabled = locked;
}

/**
 * Lock or unlock the destination Client form fields (Solace messaging side).
 * Called from module.ts's Solace factory hooks. VPN/User/Pass are part of this
 * lock; protocol/port/urlPath are part of the broker-level set the dest SEMP
 * connect also has authority over.
 */
export function setDestSolFormLocked(els: CopyUiElements, locked: boolean): void {
    els.destSolProtocol.disabled = locked;
    els.destSolPort.disabled = locked;
    els.destSolUrlPath.disabled = locked;
    els.destSolVpn.disabled = locked;
    els.destSolUser.disabled = locked;
    els.destSolPass.disabled = locked;
}

/**
 * Lock or unlock the destination broker host field. The host is shared between
 * SEMP and Client, so it should be locked whenever EITHER connection is live.
 * Pass `eitherConnected` = (destSempCtx !== null) || (destSession !== null).
 */
export function setDestBrokerLocked(els: CopyUiElements, eitherConnected: boolean): void {
    if (eitherConnected) {
        els.destHost.disabled = true;
    }
    // Note: when both disconnect, the unlock decision is owned by
    // applyDestPrefill (which considers the Same-broker toggle). We don't
    // unlock here — applyDestPrefill is called from the hook side too.
}

/** Possible destination connect status. */
export type DestConnStatus = 'connected' | 'connecting' | 'disconnected';

/** Render the SEMP-side connect row's status + button label. Mirrors the
 *  connections module's Connect ↔ Disconnect button toggle. */
export function setDestSempStatus(els: CopyUiElements, status: DestConnStatus, detail?: string): void {
    setConnRow(els.btnDestSempConnect, els.destSempStatus, status, detail);
}
/** Render the Client-side connect row's status + button label. */
export function setDestSolStatus(els: CopyUiElements, status: DestConnStatus, detail?: string): void {
    setConnRow(els.btnDestSolConnect, els.destSolStatus, status, detail);
}

function setConnRow(btn: HTMLButtonElement, statusEl: HTMLElement, status: DestConnStatus, detail?: string): void {
    if (status === 'connected') {
        statusEl.textContent = `Connected${detail ? ` (${detail})` : ''}`;
        statusEl.style.color = 'var(--status-connected)';
        btn.textContent = 'Disconnect';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');
        btn.disabled = false;
    } else if (status === 'connecting') {
        statusEl.textContent = 'Connecting…';
        statusEl.style.color = '';
        btn.textContent = 'Connecting…';
        btn.disabled = true;
    } else {
        statusEl.textContent = 'Not connected';
        statusEl.style.color = '';
        btn.textContent = 'Connect';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
        btn.disabled = false;
    }
}

/** Show/hide the SEMP error pane under the Connect row. */
export function setDestSempError(els: CopyUiElements, message: string | null): void {
    setErrorPane(els.destSempError, message);
}
/** Show/hide the Client error pane under the Connect row. */
export function setDestSolError(els: CopyUiElements, message: string | null): void {
    setErrorPane(els.destSolError, message);
}

function setErrorPane(el: HTMLElement, message: string | null): void {
    if (message) {
        el.textContent = message;
        el.classList.remove('hidden');
    } else {
        el.textContent = '';
        el.classList.add('hidden');
    }
}

/** Update the dest-name field label + the slide-toggle's active-side
 *  highlight based on dest type. */
export function applyDestType(els: CopyUiElements, type: DestType): void {
    const isTopic = type === 'topic';
    els.destTypeToggle.checked = isTopic;
    els.destTypeLabelQueue.classList.toggle('active', !isTopic);
    els.destTypeLabelTopic.classList.toggle('active', isTopic);
    if (isTopic) {
        els.destNameLabel.textContent = 'Topic';
        els.destInput.placeholder = 'Destination topic (e.g. orders/created)';
    } else {
        els.destNameLabel.textContent = 'Queue name';
        els.destInput.placeholder = 'Destination queue name';
    }
}

/**
 * Show or hide the source picker icon. Shown only when the primary SEMP
 * connection is live (the only source SempContext available).
 */
export function setSourcePickVisible(els: CopyUiElements, visible: boolean): void {
    els.btnSourcePick.classList.toggle('hidden', !visible);
}

/**
 * Show or hide the destination picker icon. Topic destinations have no
 * broker-side list, so it stays hidden then. Otherwise visibility tracks
 * whether a SempContext is reachable for the chosen destination.
 */
export function setDestPickVisible(els: CopyUiElements, visible: boolean): void {
    els.btnDestPick.classList.toggle('hidden', !visible);
}

/**
 * Enable/disable the footer "Next" button. The disabled visual is driven by
 * the standard button styles (disabled attribute → opacity dim).
 */
export function setStartEnabled(els: CopyUiElements, enabled: boolean): void {
    els.btnStart.disabled = !enabled;
}

/** Disable form inputs while a copy is running so the user can't change settings mid-flight.
 *  Source-side connection fields are always disabled (they mirror connections);
 *  this function only toggles user-editable controls. */
export function setFormDisabled(els: CopyUiElements, disabled: boolean): void {
    const inputs: (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[] = [
        els.sourceInput, els.btnSourcePick,
        els.toggleSameBroker, els.toggleSameVpn,
        els.destHost,
        els.destSempProtocol, els.destSempPort, els.destSempUrlPath, els.destSempUser, els.destSempPass,
        els.destSolProtocol, els.destSolPort, els.destSolUrlPath,
        els.destSolVpn, els.destSolUser, els.destSolPass,
        els.destTypeToggle,
        els.destInput, els.btnDestPick,
        els.btnStart,
    ];
    for (const el of inputs) el.disabled = disabled;
    els.modeRadios.forEach(r => r.disabled = disabled);
    els.sourceEditButtons.forEach(b => b.disabled = disabled);
}

/**
 * Source summary fields the modal renders before/during/after verification.
 */
export interface SourceSummary {
    broker: string;
    vpn: string;
    queueName: string;
}

/**
 * Render the modal in its initial verifying state. Populates the
 * unconditional fields (broker/VPN/queue + dest summary) and parks the
 * SEMP-derived fields on placeholders.
 */
export function renderModalInitial(
    els: CopyUiElements,
    source: SourceSummary,
    dest: DestSummary,
    mode: CopyMode,
): void {
    els.modalTitle.textContent = 'Confirm Queue Copy';
    els.sectionVerify.classList.remove('hidden');
    els.sectionRun.classList.add('hidden');

    els.modalSourceBroker.textContent = source.broker;
    els.modalSourceVpn.textContent = source.vpn;
    els.modalSourceName.textContent = source.queueName;
    els.modalSourceUsage.textContent = '—';
    els.modalSourceCount.textContent = '—';
    els.modalSourceMaxSize.textContent = '—';
    els.modalSourceOldestId.textContent = '—';
    els.modalSourceNewestId.textContent = '—';
    // Reset the max-size row to visible — renderVerifyResult will re-hide it
    // if verification falls back to the QueueBrowser path (no SEMP available).
    els.modalSourceMaxSizeLabel.classList.remove('hidden');
    els.modalSourceMaxSize.classList.remove('hidden');
    els.modalSourceStatus.textContent = 'Checking…';
    els.modalSourceStatus.className = 'text-secondary';
    els.modalVerifyError.classList.add('hidden');
    els.modalVerifyError.textContent = '';

    // Hide all verify-section banners on initial open; evaluateStartGate
    // (in ui-modal) will reveal them based on the verify result + mode.
    els.modalSourceEmpty.classList.add('hidden');
    els.modalSourceReadonly.classList.add('hidden');
    els.modalSourceNoAccess.classList.add('hidden');

    // Reset the in-modal Refresh button so a prior run's hidden+disabled
    // state doesn't leak into the next open. renderVerifyResult re-enables
    // it once the probe completes; renderRunPhase hides it for the run.
    els.btnModalSourceRefresh.classList.remove('hidden');
    els.btnModalSourceRefresh.disabled = true;

    renderDestSummary(els, dest);

    els.btnModalStart.disabled = true;
    els.btnModalStart.classList.remove('hidden');
    els.btnModalStart.textContent = mode === 'move' ? 'Move' : 'Copy';
    els.btnModalCancel.textContent = 'Cancel';
}

/**
 * Reset the verify-phase display back to "Checking…" placeholders. Called
 * from the in-modal Refresh button before re-firing verifySource so the user
 * sees a clean transition while the new probe is in flight. Cheaper than
 * re-running renderModalInitial because the destination block + buttons keep
 * their current state.
 */
export function resetVerifyDisplay(els: CopyUiElements): void {
    els.modalSourceUsage.textContent = '—';
    els.modalSourceCount.textContent = '—';
    els.modalSourceMaxSize.textContent = '—';
    els.modalSourceMaxSizeLabel.classList.remove('hidden');
    els.modalSourceMaxSize.classList.remove('hidden');
    els.modalSourceOldestId.textContent = '—';
    els.modalSourceNewestId.textContent = '—';
    els.modalSourceStatus.textContent = 'Checking…';
    els.modalSourceStatus.className = 'text-secondary';
    els.modalVerifyError.classList.add('hidden');
    els.modalVerifyError.textContent = '';
    els.modalSourceEmpty.classList.add('hidden');
    els.modalSourceReadonly.classList.add('hidden');
    els.modalSourceNoAccess.classList.add('hidden');
}

/** Destination summary block content. */
export interface DestSummary {
    broker: string;
    vpn: string;
    type: DestType;
    targetName: string;
}
export function renderDestSummary(els: CopyUiElements, dest: DestSummary): void {
    els.modalDestBroker.textContent = dest.broker;
    els.modalDestVpn.textContent = dest.vpn;
    els.modalDestType.textContent = dest.type === 'queue' ? 'Queue' : 'Topic';
    els.modalDestNameLabel.textContent = dest.type === 'queue' ? 'Name' : 'Topic';
    els.modalDestName.textContent = dest.targetName;
}

/** Live count + size updates while QueueBrowser-accumulate verification runs. */
export function renderVerifyProgress(els: CopyUiElements, count: number, sizeBytes: number): void {
    els.modalSourceCount.textContent = `${count} (loading…)`;
    els.modalSourceUsage.textContent = `${formatBytes(sizeBytes)} (loading…)`;
}

/**
 * Render the verification result into the modal. Status text follows
 * the user's spec: "Found via SEMP" / "Found via QueueBrowser" / "Not Found".
 */
export function renderVerifyResult(els: CopyUiElements, result: VerifyResult): void {
    if (result.sourceOk) {
        els.modalSourceStatus.textContent = result.via === 'semp' ? 'Found via SEMP' : 'Found via QueueBrowser';
        els.modalSourceStatus.className = 'text-success';

        // Message VPN — SEMP supplies it from the response; QueueBrowser
        // fallback leaves it null, in which case the modal already showed the
        // primary VPN from the initial render.
        if (result.messageVpn) els.modalSourceVpn.textContent = result.messageVpn;

        els.modalSourceCount.textContent =
            result.messageCount !== null ? String(result.messageCount) : '(unavailable)';

        // Usage display rules:
        //   - SEMP path: "{used} / {quota}" when both are known.
        //   - Either path with usage but no quota (SEMP omitted, or
        //     QueueBrowser-accumulate's running total): show cumulative bytes only.
        if (result.spoolUsageBytes !== null && result.quotaBytes !== null) {
            els.modalSourceUsage.textContent =
                `${formatBytes(result.spoolUsageBytes)} / ${formatBytes(result.quotaBytes)}`;
        } else if (result.spoolUsageBytes !== null) {
            els.modalSourceUsage.textContent = formatBytes(result.spoolUsageBytes);
        } else {
            els.modalSourceUsage.textContent = '(unavailable)';
        }

        // Max message size: SEMP path always shows the row (formatted bytes
        // when the broker reported it, "(unavailable)" when the broker
        // omitted the field). QueueBrowser-accumulate fallback hides the row
        // entirely — the broker doesn't expose max-size via the message stream.
        if (result.via === 'semp') {
            els.modalSourceMaxSize.textContent =
                result.maxMessageSize !== null ? formatBytes(result.maxMessageSize) : '(unavailable)';
            els.modalSourceMaxSizeLabel.classList.remove('hidden');
            els.modalSourceMaxSize.classList.remove('hidden');
        } else {
            els.modalSourceMaxSizeLabel.classList.add('hidden');
            els.modalSourceMaxSize.classList.add('hidden');
        }

        els.modalSourceOldestId.textContent = result.oldestMsgId ?? '(unavailable)';
        els.modalSourceNewestId.textContent = result.newestMsgId ?? '(unavailable)';

        // Note: Start-button enablement is owned by ui-modal's
        // evaluateStartGate, which considers messageCount + accessType + mode
        // beyond just sourceOk. We intentionally do NOT toggle btnModalStart
        // here — doing so would override the gate's decisions (e.g. flipping
        // Start back on when the queue is empty or read-only).
    } else {
        els.modalSourceStatus.textContent = 'Not Found';
        els.modalSourceStatus.className = 'text-error';
        els.btnModalStart.disabled = true;
    }
    if (result.errors.length > 0) {
        els.modalVerifyError.textContent = result.errors.join('; ');
        els.modalVerifyError.classList.remove('hidden');
    }
    // Verify probe is settled (success or failure) — let the user re-run it
    // before clicking Copy/Move if they want fresh stats.
    els.btnModalSourceRefresh.disabled = false;
}

/**
 * Toggle the empty-queue red banner under the verify section. Shown when
 * `verifyResult.messageCount === 0` so the user understands why the Start
 * button is disabled. Driven by ui-modal's evaluateStartGate.
 */
export function setEmptyQueueIndicator(els: CopyUiElements, on: boolean): void {
    els.modalSourceEmpty.classList.toggle('hidden', !on);
}

/**
 * Toggle the read-only red banner under the verify section. Shown when the
 * source queue's `accessType === 'read-only'` AND the user has selected Move
 * mode — Move requires consume permission. Switching to Copy clears it.
 */
export function setReadOnlyIndicator(els: CopyUiElements, on: boolean): void {
    els.modalSourceReadonly.classList.toggle('hidden', !on);
}

/**
 * Toggle the no-access red banner under the verify section. Shown when the
 * source queue's `accessType === 'no-access'` — the client user is not the
 * owner and the queue's `<others-permission>` is `No-Access*`. Both Copy and
 * Move are blocked since the user can't read the queue at all.
 */
export function setNoAccessIndicator(els: CopyUiElements, on: boolean): void {
    els.modalSourceNoAccess.classList.toggle('hidden', !on);
}

/** Switch the modal from verify to run phase. */
export function renderRunPhase(els: CopyUiElements, total: number, mode: CopyMode): void {
    els.modalTitle.textContent = mode === 'move' ? 'Moving…' : 'Copying…';
    els.sectionVerify.classList.add('hidden');
    els.sectionRun.classList.remove('hidden');
    els.btnModalStart.disabled = true;
    els.btnModalStart.classList.add('hidden');
    els.btnModalCancel.textContent = mode === 'move' ? 'Cancel move' : 'Cancel copy';
    els.modalRunError.classList.add('hidden');
    // Refresh has no role during the run phase; hide it so it can't be
    // clicked from a screen-reader or keyboard tab path.
    els.btnModalSourceRefresh.classList.add('hidden');
    els.btnModalSourceRefresh.disabled = true;
    els.progressFill.classList.remove('indeterminate');
    els.progressFill.style.width = '0%';
    els.progressText.textContent = `0 / ${total}`;
}

export function renderProgress(els: CopyUiElements, job: CopyJob): void {
    const pct = job.total === 0 ? 100 : Math.min(100, Math.round((job.copied / job.total) * 100));
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `${job.copied} / ${job.total}`;
}

export function renderRunError(els: CopyUiElements, msg: string): void {
    els.modalRunError.textContent = `Error: ${msg}`;
    els.modalRunError.classList.remove('hidden');
}

export function renderRunComplete(els: CopyUiElements, job: CopyJob): void {
    if (job.status === 'cancelled') {
        els.modalTitle.textContent = 'Cancelled';
    } else if (job.status === 'error') {
        els.modalTitle.textContent = 'Failed';
    } else {
        els.modalTitle.textContent = 'Completed';
    }
    els.btnModalCancel.textContent = 'Close';
}
