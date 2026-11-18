import type { AppContext } from '../../types';

/**
 * Module gate -- a full-view "… Required" card a module shows in place of its UI
 * until a precondition is met (e.g. broker connected, hosted mode, admin
 * session). It standardises the gate the modules share: a
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

/** What `gateOnAdminSession` runs for the current session. */
export interface AdminSessionHandlers {
    /** Signed out, or signed in without admin rights: show the gate. */
    onNoAdmin(): void;
    /** An administrator is signed in: show the module's view and (re)load it. */
    onAdmin(): void;
}

/**
 * Gate an admin module on the managed session. Subscribes to `rbac:changed`
 * and returns `applyGate`, which runs `onAdmin` or `onNoAdmin` for the
 * session as it is now: the module calls it at the end of install, and for
 * Refresh or to go back to its list. On `rbac:changed` it runs again only
 * when the session changed (sign-in, sign-out, another user, admin rights
 * gained or lost). A replayed or unrelated `rbac:changed` (the kernel's held
 * replay at start, a broker connect) leaves the user and the admin flag
 * equal and runs nothing.
 */
export function gateOnAdminSession(
    app: Pick<AppContext, 'appState' | 'eventBus'>,
    handlers: AdminSessionHandlers,
): () => void {
    // The session as the module last applied it: signed-in user and admin
    // flag, null when signed out.
    const sessionKey = (): string | null => {
        const m = app.appState.managed;
        return m ? JSON.stringify([m.username, m.admin]) : null;
    };
    let appliedKey = sessionKey();

    function applyGate(): void {
        appliedKey = sessionKey();
        if (app.appState.managed?.admin) handlers.onAdmin();
        else handlers.onNoAdmin();
    }

    app.eventBus.on('rbac:changed', () => {
        if (sessionKey() !== appliedKey) applyGate();
    });
    return applyGate;
}
