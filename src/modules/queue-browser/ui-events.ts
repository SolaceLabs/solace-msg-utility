import { state, shouldShowMessage, defaultActiveFilters } from './state.js';
import { ui } from './ui-core.js';
import { showPayload } from './features.js';
import { pickQueue } from '../../core/components/queue-picker';
import { primarySempContextFrom } from '../../core/services/sempContext';
import type { AppContext } from '../../core/types';

/**
 * Queue Browser UI event handlers.
 * Factory receives AppContext and service — no window.App references.
 */
export function createUiEvents(ctx: AppContext, service: any) {

    async function handleCopyContent() {
        const els = ui.getElements();
        if (!state.selectedMessage) return;

        const content = state.selectedMessage.content || '';
        await ctx.copyToClipboard(content, els.btnCopyContent);
    }

    async function handleForwardSend() {
        const els = ui.getElements();
        const destName = els.inputForwardDestName.value.trim();
        const destType = els.inputForwardDestType.value;
        const useOriginalDest = destType === 'Original';

        if (!state.forwardQueue || state.forwardQueue.length === 0) {
            ui.onForwardFailure('No messages to forward.');
            return;
        }

        // Original Destination resolves per-message from the source broker
        // event, so the shared Name input is intentionally empty and not required.
        if (!useOriginalDest && !destName) {
            ui.onForwardFailure('Destination Name is required.');
            return;
        }

        // Reset UI State — disable destination controls so they can't be edited
        // mid-flight; checkForwardCompletion re-enables them on completion.
        els.btnForwardSend.disabled = true;
        els.btnForwardSend.textContent = 'Sending...';
        els.elForwardError.style.display = 'none';
        els.btnForwardSend.classList.add('btn-secondary');
        els.btnForwardSend.classList.remove('btn-primary');
        els.inputForwardDestType.disabled = true;
        els.inputForwardDestName.disabled = true;

        // Iterate
        for (const item of state.forwardQueue) {
            // Skip already-succeeded items so a Resend click only retries
            // FAILED/QUEUED entries — preserves the green checks for items
            // the broker already confirmed.
            if (item.status === 'SUCCESS') continue;

            // Resolve per-item destination when Type is Original. The original
            // broker message carries its own destination object (Topic or Queue);
            // we read both name and type from it so each item targets exactly
            // where it came from. `_originalMsg` is guaranteed present (set by
            // service-events.onMessage on delivery); `getDestination()` can still
            // return null for certain SDK message states — that inner guard stays.
            let itemDestName = destName;
            let itemDestType = destType;
            if (useOriginalDest) {
                const origDest = item.originalMsg._originalMsg.getDestination();
                if (!origDest) {
                    ui.updateForwardItemStatus(item.correlationValue, 'FAILED', 'No original destination on message.');
                    continue;
                }
                itemDestName = origDest.getName();
                itemDestType = origDest.getType() === (window as any).solace.DestinationType.TOPIC ? 'Topic' : 'Queue';
            }

            ui.updateForwardItemStatus(item.correlationValue, 'SENDING');

            // Fire the publish but do NOT await its ACK — we want the batch
            // to issue back-to-back sends with a tiny pacing delay, not
            // serialize on broker round-trips. The Promise resolves (or
            // times out at 30 s) later; .then drives the per-item status
            // update on its own schedule. `.catch` covers the async-throw
            // case where the service has no live publisher.
            service.forwardMessage(item.originalMsg, itemDestName, itemDestType, item.correlationValue)
                .then((result) => {
                    if (result.ok) {
                        ui.updateForwardItemStatus(item.correlationValue, 'SUCCESS');
                    } else {
                        ui.updateForwardItemStatus(item.correlationValue, 'FAILED', result.error);
                    }
                })
                .catch(() => {
                    ui.updateForwardItemStatus(item.correlationValue, 'FAILED', 'Unable to send message.');
                });

            // Tiny delay to allow UI to breathe between fires.
            await new Promise(r => setTimeout(r, 50));
        }
    }

    function handleBulkForward() {
        const selectedIds = ui.getSelectedMessageIds();
        if (selectedIds.length === 0) return;

        const messages = selectedIds.map((id: string) => state.displayedMessages.find((m: any) => m.id === id)).filter(Boolean);
        if (messages.length > 0) {
            ui.showForwardModal(messages);
        }
    }

    async function handleBindPickClick() {
        const els = ui.getElements();
        const sempCtx = primarySempContextFrom(ctx);
        if (!sempCtx) return;
        const picked = await pickQueue(sempCtx, {
            title: 'Pick a queue to bind',
            defaultVpn: ctx.appState.selectedVpn ?? undefined,
        });
        if (picked === null) return;

        // Same-VPN: populate the input and trigger bind directly. Cross-VPN:
        // hand off to connections via `connection:check-connection`. The
        // connections module switches the primary VPN and emits
        // `browser:browse-queue`, which the existing module.ts listener
        // handles by writing the queue name and clicking Bind.
        if (picked.vpn === ctx.appState.selectedVpn) {
            els.inputBind.value = picked.queue;
            els.btnBind.click();
        } else {
            ctx.eventBus.emit('connection:check-connection', {
                vpn: picked.vpn,
                queue: picked.queue,
                returnTo: 'queue-browser',
            });
        }
    }

    function handleBindClick() {
        const els = ui.getElements();
        const queueName = els.inputBind.value.trim();

        // Clear previous errors
        ui.showBindError(null);

        if (queueName) {
            if (state.browserInstances.has(queueName)) {
                ui.showBindError(`Queue "${queueName}" is already bound.`);
                return;
            }

            const result = service.createBrowser(queueName);
            if (!result.ok) {
                ui.showBindError(result.error || 'Failed to create browser.');
            }
        }
    }

    function handleUnbindClick() {
        const els = ui.getElements();
        const selectedIndex = els.selectBound.selectedIndex;
        if (selectedIndex > 0) {
            const qName = els.selectBound.value;

            // Disconnect
            service.disconnectBrowser(qName);

            els.selectBound.remove(selectedIndex);

            // Reset state
            if (els.selectBound.options.length > 1) {
                els.selectBound.selectedIndex = 1;
                els.selectBound.dispatchEvent(new Event('change'));
            } else {
                ui.resetQueueSelection();
                els.selectBound.selectedIndex = 0;
            }
        }
    }

    function handleDropdownChange() {
        const els = ui.getElements();
        const qName = els.selectBound.value;
        state.currentQueue = qName;
        els.hdrQueueName.textContent = qName;
        // Note: do NOT clear the browser error banner here. The error belongs to
        // the queue that produced it (set by service-events.onConnectFailed /
        // onBrowserDown / onGmDisabled), and clearing on every dropdown change
        // discards diagnostic info the user needs while looking at that queue.
        // The banner is replaced by the next setError or when the user re-binds.
        // (Improvement plan 4.4 — Option A.)

        if (qName) {
            ui.updatePermissionUI(qName);
            if (state.messageStore.has(qName)) {
                state.allMessages = state.messageStore.get(qName);
            } else {
                state.allMessages = [];
            }
        } else {
            els.hdrPermissions.classList.add('hidden');
            state.allMessages = [];
        }

        // Clear Details Panel on Queue Change
        ui.clearDetails();

        // Reset filters
        state.activeFilters = defaultActiveFilters();
        if (showPayload()) els.inputFilterContent.value = '';
        els.inputFilterId.value = '';
        els.inputFilterDest.value = '';
        els.inputFilterType.value = 'ANY';
        els.inputFilterMsgType.value = 'ANY';
        // Reset Radio (Default OR) — NodeList from querySelectorAll, never null.
        els.radFilterCriteria.forEach((r: any) => r.checked = (r.value === 'OR'));

        state.displayedMessages = state.allMessages;

        // Reset Filter Button State
        els.btnFilter.classList.remove('filter-active');
        els.btnFilter.disabled = !qName;

        ui.renderList();
    }

    function removeFilterRow(btn: HTMLElement) {
        if (btn && btn.parentElement) btn.parentElement.remove();
    }

    function clearFilters() {
        const els = ui.getElements();
        // Reset inputs
        if (showPayload()) els.inputFilterContent.value = '';
        els.inputFilterId.value = '';
        els.inputFilterDest.value = '';
        els.inputFilterType.value = 'ANY';
        els.inputFilterMsgType.value = 'ANY';
        els.inputFilterNewerThan.value = '';
        els.inputFilterOlderThan.value = '';
        els.radFilterCriteria.forEach((r: any) => r.checked = (r.value === 'OR'));

        // Clear Properties — installed by initDetails (which initElements depends on at install time).
        if (ui.clearPropertyFilters) ui.clearPropertyFilters();

        // Reset State
        state.activeFilters = defaultActiveFilters();
        state.displayedMessages = state.allMessages;

        // Update UI
        els.btnFilter.classList.remove('filter-active');

        ui.renderList();
    }

    function applyFilters() {
        const els = ui.getElements();
        // Update active filters from Inputs. The body-content input is absent in the
        // no-payload flavor, so leave activeFilters.content at its '' default.
        if (showPayload()) state.activeFilters.content = els.inputFilterContent.value;
        state.activeFilters.msgId = els.inputFilterId.value;
        state.activeFilters.dest = els.inputFilterDest.value;
        state.activeFilters.type = els.inputFilterType.value;
        state.activeFilters.msgType = els.inputFilterMsgType.value;

        // Sender timestamp range — datetime-local returns "YYYY-MM-DDTHH:MM:SS" in the
        // user's local timezone (or "" if unset). Parsing via `new Date(str).getTime()`
        // resolves that local wall-clock to absolute epoch ms, matching the broker's
        // sender timestamp. NaN guards against malformed values.
        const newerStr: string = els.inputFilterNewerThan.value;
        const olderStr: string = els.inputFilterOlderThan.value;
        const newerMs = newerStr ? new Date(newerStr).getTime() : NaN;
        const olderMs = olderStr ? new Date(olderStr).getTime() : NaN;
        state.activeFilters.newerThanMs = Number.isFinite(newerMs) ? newerMs : null;
        state.activeFilters.olderThanMs = Number.isFinite(olderMs) ? olderMs : null;

        // Properties — installed by initDetails (initElements has already run at this point).
        if (ui.getPropertyFilters) {
            state.activeFilters.properties = ui.getPropertyFilters();
        }

        // Logic
        els.radFilterCriteria.forEach((r: any) => {
            if (r.checked) state.activeFilters.criteria = r.value;
        });

        // Use shared filter logic
        state.displayedMessages = state.allMessages.filter(shouldShowMessage);

        // Update Filter Button State
        const hasActiveFilter = !!(
            state.activeFilters.content ||
            state.activeFilters.msgId ||
            state.activeFilters.dest ||
            (state.activeFilters.type !== 'ANY') ||
            (state.activeFilters.msgType !== 'ANY') ||
            state.activeFilters.properties.length > 0 ||
            state.activeFilters.olderThanMs != null ||
            state.activeFilters.newerThanMs != null
        );
        if (hasActiveFilter) {
            els.btnFilter.classList.add('filter-active');
        } else {
            els.btnFilter.classList.remove('filter-active');
        }

        // Clear Details and Selection
        ui.clearDetails();

        ui.renderList();
        els.modalFilter.close();
    }

    function handleBulkDownloadContent() {
        ui.downloadMessagesZip('content');
    }

    function handleBulkDownloadFull() {
        ui.downloadMessagesZip('full');
    }

    async function handleDelete(msgId: string) {
        if (!msgId) return;
        const confirmed = window.confirm(`Are you sure you want to delete message ${msgId}?`);
        if (confirmed) {
            const result = service.deleteMessages(state.currentQueue, [msgId]);
            if (!result.ok) {
                window.alert(result.error || 'Delete failed.');
            } else if (result.count > 0) {
                window.alert(`Successfully deleted ${result.count} message(s).`);
            }
        }
    }

    async function handleBulkDelete() {
        const selectedIds = ui.getSelectedMessageIds();
        if (selectedIds.length === 0) return;

        const confirmed = window.confirm(`Are you sure you want to delete ${selectedIds.length} selected message(s)?`);
        if (confirmed) {
            const result = service.deleteMessages(state.currentQueue, selectedIds);
            if (!result.ok) {
                window.alert(result.error || 'Delete failed.');
            } else if (result.count > 0) {
                window.alert(`Successfully deleted ${result.count} message(s).`);
            } else {
                window.alert('No messages were deleted. Check console for errors.');
            }
        }
    }

    // Pre-fill an empty datetime-local input with today's date at 00:00:00 so the
    // native picker opens at midnight rather than the current time. Triggered on
    // first interaction (mousedown/focus) — leaves the field empty until the user
    // actually engages it so the filter doesn't silently activate.
    function prefillDateInputMidnight(input: HTMLInputElement) {
        if (input.value) return;
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        input.value =
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
    }

    return {
        handleCopyContent,
        handleForwardSend,
        handleBulkForward,
        handleBindPickClick,
        handleBindClick,
        handleUnbindClick,
        handleDropdownChange,
        removeFilterRow,
        clearFilters,
        applyFilters,
        prefillDateInputMidnight,
        handleBulkDownloadContent,
        handleBulkDownloadFull,
        handleDelete,
        handleBulkDelete
    };
}
