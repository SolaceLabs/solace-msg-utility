import { INPUT_DEBOUNCE_MS } from '../../core/timing';

/** @type {any} */
export const ui = {};

/**
 * Wires an `<input>` + list element into a searchable dropdown with debounced filtering.
 *
 * @param {HTMLInputElement} inputEl - The search-input field.
 * @param {HTMLElement} listEl - Container holding `.dropdown-option` children to filter.
 * @param {(item: string) => void} onSelectCallback - Fired when the user clicks an option.
 * @param {Document|HTMLElement} [closeScope] - Scope for outside-click-closes behaviour.
 *   Defaults to `document` (clicks anywhere outside the input+list dismiss the dropdown).
 *   Pass a narrower element only if the caller expects to be uninstalled and needs the
 *   outside-click listener garbage-collected with the scope.
 * @param {number} [debounceMs] - Milliseconds to wait after the last keystroke before
 *   filtering. Defaults to the shared {@link INPUT_DEBOUNCE_MS} (500). Pass `0` to filter
 *   on every keystroke (used by tests for synchronous assertions). Negative or non-finite
 *   values fall through to the synchronous path same as `0`. Values above a few seconds
 *   are not recommended — the dropdown will appear unresponsive while users type.
 */
ui.setupSearchableSelect = function (inputEl, listEl, onSelectCallback, closeScope, debounceMs) {
    const delay = typeof debounceMs === 'number' ? debounceMs : INPUT_DEBOUNCE_MS;

    // Filter Logic — debounced. Each keystroke resets the timer; the filter runs
    // `delay` ms after the last keystroke. Per-keystroke filtering on large lists
    // (hundreds of queues) was causing noticeable keystroke-to-paint latency.
    let filterTimer = null;
    function runFilter() {
        const term = inputEl.value.toLowerCase();
        const options = listEl.querySelectorAll('.dropdown-option');
        options.forEach(opt => {
            const text = opt.textContent.toLowerCase();
            opt.style.display = text.includes(term) ? 'block' : 'none';
        });
        listEl.classList.add('show');
    }
    inputEl.addEventListener('input', () => {
        // Keep the list visible during typing even before the filter commits —
        // the `show` class is cheap to add and the user expects to see *something*.
        listEl.classList.add('show');
        if (filterTimer) clearTimeout(filterTimer);
        // delay=0 is a valid override for "filter immediately" (tests, small lists).
        if (delay > 0) {
            filterTimer = setTimeout(runFilter, delay);
        } else {
            runFilter();
        }
    });

    // Show on focus
    inputEl.addEventListener('focus', () => {
        if (inputEl.value === '') {
            listEl.querySelectorAll('.dropdown-option').forEach(o => o.style.display = 'block');
        }
        listEl.classList.add('show');
    });

    // Hide on outside click. Default scope is `document` so clicks anywhere outside
    // the input + list (sidebar, top-bar, other modules) close the dropdown — that's
    // the behaviour users expect. A caller can pass `closeScope` to bind the listener
    // to a narrower DOM subtree, useful only if the module would ever uninstall and
    // need the listener collected. Not currently exercised, but kept as an option.
    const scope = closeScope || document;
    scope.addEventListener('click', (e) => {
        if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
            listEl.classList.remove('show');
        }
    });
};

ui.renderOptions = function (listEl, items, onSelect) {
    listEl.innerHTML = '';
    if (!items || items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-option';
        empty.textContent = 'No items found';
        empty.style.fontStyle = 'italic';
        listEl.appendChild(empty);
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'dropdown-option';
        div.textContent = item;
        div.addEventListener('click', () => {
            onSelect(item);
            listEl.classList.remove('show');
        });
        listEl.appendChild(div);
    });
};

ui.updateVisibility = function (elWarning, elContent, isConnected) {
    if (!isConnected) {
        elWarning.classList.remove('hidden');
        elContent.classList.add('hidden');
    } else {
        elWarning.classList.add('hidden');
        elContent.classList.remove('hidden');
    }
};

ui.clearInputs = function (vpnInput, queueInput, btnCopy) {
    // vpnInput is intentionally nullable — production callers pass null
    // when they want to clear queue + button without touching the VPN input.
    if (vpnInput) vpnInput.value = '';
    queueInput.value = '';
    queueInput.disabled = true;
    btnCopy.disabled = true;
};
