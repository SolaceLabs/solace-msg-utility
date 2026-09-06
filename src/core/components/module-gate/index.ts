/**
 * Module gate — a full-view "… Required" card a module shows in place of its UI
 * until a precondition is met (e.g. broker connected, hosted mode, admin
 * session). It standardises the gate the modules previously hand-rolled: a
 * centered card built from the shared design-system classes
 * (`card text-center p-6`, `text-secondary`).
 *
 * The component owns the gate's DOM (created + prepended to the module's
 * container at install) and its visibility (`show()` / `hide()`). It does NOT
 * know about the module's own views, so the caller is responsible for the
 * mutual exclusion — hide the views when showing the gate, and vice-versa
 * (typically a `showView()` that calls `gate.hide()` and a `showGate()` that
 * hides the views then calls `gate.show()`).
 */
export interface GateOptions {
    /** id set on the gate element — handy for tests and debugging. */
    id: string;
    /** Heading (e.g. "Administrator Sign-in Required"). */
    title: string;
    /** Body text explaining what's required. */
    message: string;
}

export interface ModuleGate {
    /** Reveal the gate. */
    show(): void;
    /** Hide the gate. */
    hide(): void;
}

export function createGate(container: HTMLElement, opts: GateOptions): ModuleGate {
    const el = document.createElement('div');
    el.id = opts.id;
    el.className = 'card text-center p-6 hidden';

    const heading = document.createElement('h2');
    heading.className = 'mb-4 text-secondary';
    heading.textContent = opts.title;

    const body = document.createElement('p');
    body.className = 'text-secondary';
    body.textContent = opts.message;

    el.append(heading, body);
    container.prepend(el);

    return {
        show: () => el.classList.remove('hidden'),
        hide: () => el.classList.add('hidden'),
    };
}
