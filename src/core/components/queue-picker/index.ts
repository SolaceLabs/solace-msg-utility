import { required, attachBackdropClose } from '../../dom';
import { INPUT_DEBOUNCE_MS } from '../../timing';
import type { QueueSource } from '../../services/queue-source';

/**
 * Reusable queue picker — a `<dialog>` that lets the user pick a `{VPN, queue}`
 * pair against a given `QueueSource`. Self-contained: owns its DOM, its CSS, and
 * its lifecycle. Callers invoke `pickQueue(source)` and await the chosen
 * queue name (or `null` on cancel).
 *
 * The picker is RBAC- and transport-agnostic: it consumes a `QueueSource`
 * (`listVpns` / `listQueues`) and never runs its own SEMP discovery, so it
 * behaves identically in every variant — the connection that owns the source
 * decides where VPN/queue names come from (provisioned set vs live broker).
 *
 * Streams queues incrementally as source pages arrive (mirrors queue-discovery's
 * `for await` re-render-on-each-page pattern), so users get usable results
 * even on VPNs with thousands of queues. Filter is a CSS `display:none` toggle
 * applied on top of a static option list, also matching queue-discovery —
 * that lets the filter persist across page-arrival re-renders.
 *
 * A module-level cache keyed by `source.key` survives across pickQueue
 * invocations (and across module installs of the consuming feature). VPN
 * lists and per-VPN queue lists are cached on first fetch and reused on
 * subsequent opens; the user invalidates with the refresh icons, and a changed
 * `key` (e.g. an RBAC/provisioning edit) invalidates it automatically.
 *
 * Concurrency: only one picker instance at a time. Subsequent calls while
 * open reject with an error. The dialog DOM is lazily created on first use
 * and reused across calls (state resets per call).
 */

export interface PickQueueOptions {
    /** Pre-select this VPN once the VPN list loads. */
    defaultVpn?: string;
    /** Modal title. Defaults to "Pick a queue". */
    title?: string;
}

/** Picker resolution. Both fields are populated on Confirm; null on cancel. */
export interface PickQueueResult {
    vpn: string;
    queue: string;
}

interface Refs {
    dialog: HTMLDialogElement;
    title: HTMLElement;
    btnClose: HTMLButtonElement;
    vpnInput: HTMLInputElement;
    vpnList: HTMLDivElement;
    btnVpnRefresh: HTMLButtonElement;
    queueInput: HTMLInputElement;
    queueList: HTMLDivElement;
    btnQueueRefresh: HTMLButtonElement;
    status: HTMLDivElement;
    btnCancel: HTMLButtonElement;
    btnConfirm: HTMLButtonElement;
}

interface State {
    source: QueueSource;
    selectedVpn: string | null;
    selectedQueue: string | null;
    vpns: string[] | null;
    queueCache: Map<string, string[]>;
    vpnFilterTimer: ReturnType<typeof setTimeout> | null;
    queueFilterTimer: ReturnType<typeof setTimeout> | null;
    vpnFetchGen: number;
    queueFetchGen: number;
}

/**
 * Module-level cache keyed by the source's `key`. Survives across pickQueue
 * calls so reopening the picker is instant when the source is unchanged. The
 * user invalidates with the refresh icons; opening against a different source
 * `key` (different broker, or a managed RBAC/provisioning change) replaces the
 * cache automatically.
 */
interface PickerCache {
    key: string;
    vpns: string[] | null;
    queues: Map<string, string[]>;
}
let cache: PickerCache | null = null;

function ensureCache(source: QueueSource): PickerCache {
    if (cache?.key !== source.key) {
        cache = { key: source.key, vpns: null, queues: new Map() };
    }
    return cache;
}

let refs: Refs | null = null;
let state: State | null = null;
let pendingResolve: ((v: PickQueueResult | null) => void) | null = null;

export function pickQueue(source: QueueSource, opts: PickQueueOptions = {}): Promise<PickQueueResult | null> {
    if (pendingResolve) {
        return Promise.reject(new Error('Queue picker is already open'));
    }
    if (!refs) {
        refs = createDialogDOM();
        document.body.appendChild(refs.dialog);
        attachHandlers(refs);
    }

    return new Promise<PickQueueResult | null>((resolve) => {
        pendingResolve = resolve;
        const c = ensureCache(source);
        state = {
            source,
            selectedVpn: opts.defaultVpn ?? null,
            selectedQueue: null,
            vpns: c.vpns ? [...c.vpns] : null,
            queueCache: new Map(c.queues),
            vpnFilterTimer: null,
            queueFilterTimer: null,
            vpnFetchGen: 0,
            queueFetchGen: 0,
        };

        const r = refs!;
        r.title.textContent = opts.title ?? 'Pick a queue';
        r.vpnInput.value = state.selectedVpn ?? '';
        r.vpnInput.disabled = false;
        r.btnVpnRefresh.disabled = false;
        r.queueInput.value = '';
        r.queueInput.disabled = true;
        r.btnQueueRefresh.disabled = true;
        r.btnConfirm.disabled = true;
        r.vpnList.innerHTML = '';
        r.queueList.innerHTML = '';
        r.vpnList.classList.remove('show');
        r.queueList.classList.remove('show');
        setStatus('');

        r.dialog.showModal();

        if (state.vpns) {
            // Cache hit — render the cached VPN list immediately so the user
            // sees options on first click. Skip the network round-trip.
            renderVpnList();
            applyVpnFilter();
            setStatus(`${state.vpns.length} VPN${state.vpns.length === 1 ? '' : 's'} loaded.`);
            if (state.selectedVpn && state.vpns.includes(state.selectedVpn)) {
                selectVpn(state.selectedVpn);
            }
        } else {
            void fetchVpns();
        }
    });
}

function setStatus(msg: string): void {
    refs!.status.textContent = msg;
}

function resolveAndClose(value: PickQueueResult | null): void {
    const resolve = pendingResolve!;
    if (state!.vpnFilterTimer !== null) clearTimeout(state!.vpnFilterTimer);
    if (state!.queueFilterTimer !== null) clearTimeout(state!.queueFilterTimer);
    pendingResolve = null;
    state = null;
    if (refs!.dialog.hasAttribute('open')) refs!.dialog.close();
    resolve(value);
}

async function fetchVpns(): Promise<void> {
    const source = state!.source;
    const gen = ++state!.vpnFetchGen;
    setStatus('Loading VPNs…');
    const accumulated: string[] = [];
    try {
        for await (const page of source.listVpns()) {
            if (!state || state.vpnFetchGen !== gen) return;
            if (!page.ok) {
                setStatus(`Failed to load VPNs: ${page.error}`);
                return;
            }
            accumulated.push(...page.data);
            accumulated.sort((a, b) => a.localeCompare(b));
            state.vpns = [...accumulated];
            renderVpnList();
            applyVpnFilter();
            setStatus(`Loading VPNs… (${accumulated.length} so far)`);
        }
        /* v8 ignore start -- defensive race guard against state/gen changing
         * between the last loop iteration's body and this check. The for-await
         * mechanism runs synchronously between iterations, so this window does
         * not exist in normal use. */
        if (!state || state.vpnFetchGen !== gen) return;
        /* v8 ignore stop */
        // Persist the just-fetched list to the module cache so the next
        // pickQueue() invocation against the same source gets instant render.
        ensureCache(source).vpns = [...accumulated];
        setStatus(`${accumulated.length} VPN${accumulated.length === 1 ? '' : 's'} loaded.`);

        if (state.selectedVpn && accumulated.includes(state.selectedVpn)) {
            selectVpn(state.selectedVpn);
        }
    /* v8 ignore start -- defensive catch. The source generators catch every
     * fetch / json / mapper error internally and yield `{ok:false}` pages (the
     * provisioned-VPN source yields a static list that can't throw), so errors
     * never escape the for-await loop. */
    } catch (err: any) {
        if (state && state.vpnFetchGen === gen) {
            setStatus(`Failed to load VPNs: ${err?.message ?? 'unknown error'}`);
        }
    }
    /* v8 ignore stop */
}

async function fetchQueues(): Promise<void> {
    const source = state!.source;
    const vpn = state!.selectedVpn!;
    const gen = ++state!.queueFetchGen;
    setStatus(`Loading queues for ${vpn}…`);
    const accumulated: string[] = [];
    state!.queueCache.delete(vpn);
    try {
        for await (const page of source.listQueues(vpn)) {
            if (!state || state.queueFetchGen !== gen) return;
            if (!page.ok) {
                setStatus(`Failed to load queues: ${page.error}`);
                return;
            }
            accumulated.push(...page.data);
            accumulated.sort((a, b) => a.localeCompare(b));
            state.queueCache.set(vpn, [...accumulated]);
            renderQueueList();
            applyQueueFilter();
            setStatus(`Loading queues for ${vpn}… (${accumulated.length} so far)`);
        }
        /* v8 ignore start -- same rationale as fetchVpns post-loop guard. */
        if (!state || state.queueFetchGen !== gen) return;
        /* v8 ignore stop */
        // Persist this VPN's queue list to the module cache.
        ensureCache(source).queues.set(vpn, [...accumulated]);
        setStatus(
            accumulated.length === 0
                ? `No queues found in ${vpn}.`
                : `${accumulated.length} queue${accumulated.length === 1 ? '' : 's'} loaded.`
        );
    /* v8 ignore start -- defensive catch, same rationale as fetchVpns above. */
    } catch (err: any) {
        if (state && state.queueFetchGen === gen) {
            setStatus(`Failed to load queues: ${err?.message ?? 'unknown error'}`);
        }
    }
    /* v8 ignore stop */
}

function renderVpnList(): void {
    const r = refs!;
    const vpns = state!.vpns!;
    r.vpnList.innerHTML = '';
    if (vpns.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'picker-dropdown-option picker-dropdown-empty';
        empty.textContent = 'No VPNs available';
        r.vpnList.appendChild(empty);
        return;
    }
    for (const v of vpns) {
        const opt = document.createElement('div');
        opt.className = 'picker-dropdown-option';
        opt.textContent = v;
        opt.addEventListener('click', () => selectVpn(v));
        r.vpnList.appendChild(opt);
    }
}

function renderQueueList(): void {
    const r = refs!;
    const s = state!;
    // Both callers gate on cache-hit: fetchQueues writes the entry before
    // calling, and switchToVpn is guarded by `queueCache.has(vpn)`. The
    // non-null assertion documents that contract; if a future caller breaks
    // it, the resulting TypeError is louder than the `?? []` swallow it.
    const queues = s.queueCache.get(s.selectedVpn!)!;
    r.queueList.innerHTML = '';
    if (queues.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'picker-dropdown-option picker-dropdown-empty';
        empty.textContent = 'No queues available';
        r.queueList.appendChild(empty);
        return;
    }
    for (const q of queues) {
        const opt = document.createElement('div');
        opt.className = 'picker-dropdown-option';
        opt.textContent = q;
        opt.addEventListener('click', () => selectQueue(q));
        r.queueList.appendChild(opt);
    }
}

function applyVpnFilter(): void {
    const r = refs!;
    const term = r.vpnInput.value.toLowerCase();
    const opts = r.vpnList.querySelectorAll<HTMLElement>('.picker-dropdown-option:not(.picker-dropdown-empty)');
    opts.forEach((opt) => {
        const text = (opt.textContent || '').toLowerCase();
        opt.style.display = text.includes(term) ? '' : 'none';
    });
}

function applyQueueFilter(): void {
    const r = refs!;
    const term = r.queueInput.value.toLowerCase();
    const opts = r.queueList.querySelectorAll<HTMLElement>('.picker-dropdown-option:not(.picker-dropdown-empty)');
    opts.forEach((opt) => {
        const text = (opt.textContent || '').toLowerCase();
        opt.style.display = text.includes(term) ? '' : 'none';
    });
}

function selectVpn(vpn: string): void {
    const s = state!;
    const r = refs!;
    s.selectedVpn = vpn;
    s.selectedQueue = null;
    r.vpnInput.value = vpn;
    r.vpnList.classList.remove('show');
    r.queueInput.value = '';
    r.queueInput.disabled = false;
    r.btnQueueRefresh.disabled = false;
    r.btnConfirm.disabled = true;
    r.queueList.innerHTML = '';

    if (s.queueCache.has(vpn)) {
        renderQueueList();
        applyQueueFilter();
        const queues = s.queueCache.get(vpn)!;
        setStatus(
            queues.length === 0
                ? `No queues found in ${vpn}.`
                : `${queues.length} queue${queues.length === 1 ? '' : 's'} loaded.`
        );
    } else {
        void fetchQueues();
    }
}

function selectQueue(queue: string): void {
    state!.selectedQueue = queue;
    refs!.queueInput.value = queue;
    refs!.queueList.classList.remove('show');
    refs!.btnConfirm.disabled = false;
}

function chevronSvg(): string {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>`;
}

function createDialogDOM(): Refs {
    const dialog = document.createElement('dialog') as HTMLDialogElement;
    dialog.className = 'picker-dialog';
    dialog.innerHTML = `
      <div class="picker-header">
        <h3 class="picker-title">Pick a queue</h3>
        <button class="picker-close btn-icon" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="picker-body">
        <div class="picker-field">
          <label>Message VPN</label>
          <div class="picker-searchable">
            <div class="picker-input-wrap">
              <input class="picker-vpn-input form-control" type="text" placeholder="Type or select a VPN…">
              <span class="picker-select-icon">${chevronSvg()}</span>
            </div>
            <button class="picker-vpn-refresh btn btn-secondary" type="button" title="Refresh VPNs">↻</button>
          </div>
          <div class="picker-vpn-list picker-dropdown-list"></div>
        </div>
        <div class="picker-field">
          <label>Queue</label>
          <div class="picker-searchable">
            <div class="picker-input-wrap">
              <input class="picker-queue-input form-control" type="text" placeholder="Select a VPN first" disabled>
              <span class="picker-select-icon">${chevronSvg()}</span>
            </div>
            <button class="picker-queue-refresh btn btn-secondary" type="button" title="Refresh queues" disabled>↻</button>
          </div>
          <div class="picker-queue-list picker-dropdown-list"></div>
        </div>
        <div class="picker-status" aria-live="polite"></div>
      </div>
      <div class="picker-footer">
        <button class="picker-cancel btn btn-secondary" type="button">Cancel</button>
        <button class="picker-confirm btn btn-primary" type="button" disabled>Confirm</button>
      </div>
    `;
    return {
        dialog,
        title: required(dialog, '.picker-title'),
        btnClose: required(dialog, '.picker-close'),
        vpnInput: required(dialog, '.picker-vpn-input'),
        vpnList: required(dialog, '.picker-vpn-list'),
        btnVpnRefresh: required(dialog, '.picker-vpn-refresh'),
        queueInput: required(dialog, '.picker-queue-input'),
        queueList: required(dialog, '.picker-queue-list'),
        btnQueueRefresh: required(dialog, '.picker-queue-refresh'),
        status: required(dialog, '.picker-status'),
        btnCancel: required(dialog, '.picker-cancel'),
        btnConfirm: required(dialog, '.picker-confirm'),
    };
}

function attachHandlers(r: Refs): void {
    attachBackdropClose(r.dialog);

    r.dialog.addEventListener('close', () => {
        if (pendingResolve) resolveAndClose(null);
    });
    r.btnClose.addEventListener('click', () => r.dialog.close());
    r.btnCancel.addEventListener('click', () => r.dialog.close());
    r.btnConfirm.addEventListener('click', () => {
        if (!state || !state.selectedQueue || !state.selectedVpn) return;
        resolveAndClose({ vpn: state.selectedVpn, queue: state.selectedQueue });
    });

    // VPN input: debounced filter on type, show full list on focus.
    r.vpnInput.addEventListener('input', () => {
        if (!state || !state.vpns) return;
        r.vpnList.classList.add('show');
        if (state.vpnFilterTimer !== null) clearTimeout(state.vpnFilterTimer);
        state.vpnFilterTimer = setTimeout(() => {
            state!.vpnFilterTimer = null;
            applyVpnFilter();
        }, INPUT_DEBOUNCE_MS);
    });
    r.vpnInput.addEventListener('focus', () => {
        if (!state || !state.vpns) return;
        r.vpnList.classList.add('show');
        // The user clicking the field expects to see the full list of VPNs
        // (or at least everything that doesn't start matching their prior
        // selection). Match queue-discovery: when the input value is the
        // currently-selected VPN OR is empty, reset the filter to show
        // every option. Otherwise leave the existing filter as the user typed.
        if (r.vpnInput.value === '' || r.vpnInput.value === state.selectedVpn) {
            // Force the filter to consider an empty term so all options become
            // visible without rewriting the input value.
            const opts = r.vpnList.querySelectorAll<HTMLElement>(
                '.picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            opts.forEach((opt) => { opt.style.display = ''; });
        }
    });
    r.btnVpnRefresh.addEventListener('click', () => {
        if (!state) return;
        // Drop the module cache for this broker's VPN list; the next fetch
        // will repopulate it.
        ensureCache(state.source).vpns = null;
        state.vpns = null;
        r.vpnInput.value = '';
        r.vpnList.innerHTML = '';
        void fetchVpns();
    });

    r.queueInput.addEventListener('input', () => {
        if (!state || !state.selectedVpn || !state.queueCache.has(state.selectedVpn)) return;
        r.queueList.classList.add('show');
        if (state.queueFilterTimer !== null) clearTimeout(state.queueFilterTimer);
        state.queueFilterTimer = setTimeout(() => {
            state!.queueFilterTimer = null;
            applyQueueFilter();
        }, INPUT_DEBOUNCE_MS);
    });
    r.queueInput.addEventListener('focus', () => {
        if (!state || !state.selectedVpn) return;
        if (!state.queueCache.has(state.selectedVpn)) return;
        r.queueList.classList.add('show');
        if (r.queueInput.value === '' || r.queueInput.value === state.selectedQueue) {
            const opts = r.queueList.querySelectorAll<HTMLElement>(
                '.picker-dropdown-option:not(.picker-dropdown-empty)',
            );
            opts.forEach((opt) => { opt.style.display = ''; });
        }
    });
    r.btnQueueRefresh.addEventListener('click', () => {
        if (!state || !state.selectedVpn) return;
        ensureCache(state.source).queues.delete(state.selectedVpn);
        state.queueCache.delete(state.selectedVpn);
        r.queueInput.value = '';
        r.queueList.innerHTML = '';
        void fetchQueues();
    });

    r.dialog.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!r.vpnInput.contains(target) && !r.vpnList.contains(target) && !r.btnVpnRefresh.contains(target)) {
            r.vpnList.classList.remove('show');
        }
        if (!r.queueInput.contains(target) && !r.queueList.contains(target) && !r.btnQueueRefresh.contains(target)) {
            r.queueList.classList.remove('show');
        }
    });
}

// Test-only reset hook. Clears the module-scoped dialog/state AND the cache
// so tests can drive the lazy-create + cache-miss paths on every run.
export function __resetForTest(): void {
    refs?.dialog.remove();
    refs = null;
    state = null;
    pendingResolve = null;
    cache = null;
}
