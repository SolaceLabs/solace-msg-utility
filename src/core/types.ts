/**
 * PwaModule Contract
 *
 * Every module in the application must implement this interface.
 * Modules and their priorities are listed in the active variant's manifest
 * (`src/variants/<name>.ts`), which `src/registry.ts` resolves; the Kernel
 * receives `{ module, priority }` tuples and installs in descending priority
 * order. `priority` is intentionally NOT on the module itself -- it is a
 * variant-level decision so the full ordering is visible in one file.
 */

// Re-export connection-domain types so consumers can import them alongside
// AppContext / AppState without needing to know the deeper path.
export type {
    SolaceConfig,
    SempConfig,
    ConnectionConfig,
    ConnectionCredentials,
    SempContext,
} from './connections/types';

// Type-only (erased at build time, so no runtime import cycle) — AppContext
// carries the managed profile defined alongside the managed API client.
import type { ManagedProfileStore } from './services/managed-profile';
import type { NotificationCenter } from './components/notification-center';
import type { DeploymentConfig } from './connections/conn-modes';

/* ------------------------------------------------------------------ */
/*  Managed (RBAC) session                                             */
/* ------------------------------------------------------------------ */

/**
 * A single permission row from the managed RBAC profile. Each field is a glob
 * (`*` = match-all; leading/middle/trailing supported, case-sensitive). A row
 * grants only when broker AND msgVpns AND queues all match the candidate.
 */
export interface QGlob {
    brokers: string;
    msgVpns: string;
    queues: string;
}

/**
 * The current user's managed session, adopted from the gateway session
 * (`GET /managed/me`) by the connections module's Managed panel or admin-login. `null`/absent whenever no managed login is active
 * (including every Direct-mode session), where RBAC helpers degrade to allow-all.
 *
 * This carries only **matcher inputs**. The provisioned broker and VPN names
 * live in `AppContext.managedProfile` -- see
 * `src/core/services/managed-profile.ts` for the ownership split. No broker
 * credential is held in the browser for a managed session.
 */
export interface ManagedSession {
    /** Whether the user may see the admin-only management modules. */
    admin: boolean;
    /**
     * The signed-in username, so a module can tell a change to the session's
     * own account. The gateway's HttpOnly cookie is the credential; nothing
     * here authenticates.
     */
    username: string;
    /** Connected broker NAME — the source of the `broker` argument to matchers. */
    broker: string;
    /**
     * Provisioned VPN names for the connected `broker`, published by the
     * connections module from `/managed/me` (`connections.yaml` ∩ entitled).
     * `[]` until connected. This is what bounds the queue-picker's VPN list in
     * managed mode (via `queueSourceFrom`) so it matches the Connections dropdown
     * — provisioning, not the broader entitlement globs.
     */
    vpns: string[];
    /** Queues the user may forward/delete on (operate ⊇ read-only). */
    operate: QGlob[];
    /** Queues the user may only view. */
    readOnly: QGlob[];
    /**
     * App modules the gateway lets this user open (`/managed/me`'s `modules`).
     * Connections and the admin modules are not governed by it — see
     * `isModuleVisible` in `rbac.ts`.
     */
    modules: string[];
}

/* ------------------------------------------------------------------ */
/*  Application State                                                  */
/* ------------------------------------------------------------------ */

export interface AppState {
    activeModuleId: string | null;
    isConnected: boolean;
    selectedVpn: string | null;
    /**
     * Live primary Solace connection info — including the password the user
     * typed into the form (Direct; a managed session leaves it '' and puts the
     * broker name in `host`). Populated by the connections module on
     * `client:connected`, cleared on `client:disconnected`. Consumers
     * (e.g. queue-copy) use this to prefill destination forms and to mirror
     * the source-side connection read-only panel. The SolClientJS Session
     * does not expose these properties back from the session object itself,
     * so the connections module captures them at click time and publishes
     * here. Parallel to `sempCredentials` which has been doing the same for
     * the SEMP side since day one.
     */
    solaceConnection: {
        host: string;
        protocol: string;
        port: string;
        urlPath: string;
        vpn: string;
        user: string;
        pass: string;
    } | null;
    /**
     * Live primary SEMP connection info. `baseUrl` is the wire URL the
     * client must POST against (gateway-prefixed in hosted mode), while
     * `protocol`/`host`/`port`/`urlPath` carry the ORIGINAL values the user
     * typed — useful for UI that needs to display or reuse the broker
     * identity without reverse-engineering the wire URL. A managed session sets
     * `relay` (the gateway's SEMP relay base, also `baseUrl`), puts the broker
     * name in `host`, and leaves `user`/`pass` '': the gateway holds them.
     */
    sempCredentials: {
        user: string;
        pass: string;
        baseUrl: string;
        protocol: string;
        host: string;
        port: string;
        urlPath: string;
        relay?: string;
    } | null;
    isSempConnected: boolean;
    /**
     * Current managed (RBAC) session -- a runtime posture, not a variant: set
     * after login by the connections module's Managed tab (or by admin-login in
     * the admin app) and cleared on logout. Optional so unmanaged sessions (and
     * AppContext test literals) need not set it; absent/null => RBAC helpers in
     * `./rbac` degrade to allow-all.
     */
    managed?: ManagedSession | null;
    /**
     * The deployment's connection-mode config and `/hosted` verdict, published
     * once by the connections module from its probe -- the single home of the
     * hosted flag (`isHostedDeployment` in `core/hosted.ts`). Other modules read
     * it to route a secondary connection's URLs (`SolaceConfig.hosted` /
     * `SempConfig.hosted`) rather than probing the gateway again; a secondary
     * connection's mode follows the primary's (queue-copy's destination).
     */
    connConfig?: DeploymentConfig;
}

/* ------------------------------------------------------------------ */
/*  Event Bus                                                          */
/* ------------------------------------------------------------------ */

/** All cross-module events and their payload types. */
export interface BusEvents {
    'app:state-change':            { key: keyof AppState; value: AppState[keyof AppState] };
    'client:connected':            { session: unknown };
    'client:disconnected':         void;
    'semp:connected':              void;
    'semp:disconnected':           void;
    /**
     * Ask the connections module to ensure the primary session is bound to
     * the requested VPN, then forward the user to the appropriate downstream
     * module. `returnTo` selects the follow-up event the connections module
     * emits once the VPN is live: `'queue-browser'` (default) emits
     * `browser:browse-queue`, `'queue-copy'` emits `copy:vpn-switched`.
     */
    'connection:check-connection': { vpn: string; queue: string; returnTo?: 'queue-browser' | 'queue-copy' };
    /** Navigate to the connections form. Emitted by "Edit in Connections" buttons. */
    'connection:edit-requested':   void;
    /**
     * The managed RBAC session changed (login / logout / re-fetch entitlements).
     * The kernel re-renders the sidebar (module visibility) on this. Emitted by
     * the connections Managed tab, admin-login and user-management (self-
     * demote); never fires in an unmanaged session.
     */
    'rbac:changed':                void;
    /**
     * Ask the module that owns the managed login to end the session with its
     * ordinary sign-out (`POST /managed/logout`, drop any managed broker
     * connection, clear `managedProfile` + `AppState.managed`, emit
     * `rbac:changed`, show its signed-out view). Emitted by user-management
     * when a change to the signed-in admin's own account (new password,
     * administrator flag, deletion) ended the session at the gateway, and by
     * any admin module on a 401: the session cannot be patched in place.
     * Answered by admin-login (while it holds the session) and by the
     * connections module (routed to the Managed panel when `appState.managed`
     * is set).
     */
    'rbac:sign-out-requested':     void;
    'browser:available':           void;
    'browser:browse-queue':        { queue: string };
    /** Connections module finished switching VPN on a queue-copy origin request. */
    'copy:vpn-switched':           { vpn: string; queue: string };
    'app:message-delete':          { id: string };
    'config:max-messages-changed': { value: number };
    'jszip:loaded':                void;
}

export interface EventBus {
    /** Subscribe to an event */
    on<K extends keyof BusEvents>(
        event: K,
        handler: BusEvents[K] extends void ? () => void : (payload: BusEvents[K]) => void,
    ): void;
    /** Unsubscribe from an event */
    off<K extends keyof BusEvents>(
        event: K,
        handler: BusEvents[K] extends void ? () => void : (payload: BusEvents[K]) => void,
    ): void;
    /** Emit an event to all subscribers */
    emit<K extends keyof BusEvents>(
        event: K,
        ...args: BusEvents[K] extends void ? [] : [payload: BusEvents[K]]
    ): void;
    /**
     * Begin buffering emit()s. Subsequent emits are queued (in order) until
     * release() is called. Intended for the kernel's install phase so later-
     * installing modules can subscribe before any initial events fire.
     * Kernel-only — modules should not call this.
     */
    hold(): void;
    /**
     * Flush every emit queued since hold() was called, in order, then resume
     * normal synchronous delivery. Kernel-only.
     */
    release(): void;
}

/* ------------------------------------------------------------------ */
/*  App Context (injected into every module by the Kernel)             */
/* ------------------------------------------------------------------ */

export interface AppContext {
    /** The DOM wrapper element for this module's view */
    container: HTMLElement;
    /** Reference to the global application state object */
    appState: AppState;
    /** Shared event bus for decoupled inter-module communication */
    eventBus: EventBus;
    /** Update a key in the global application state */
    setState<K extends keyof AppState>(key: K, value: AppState[K]): void;
    /** Helper to navigate to this module's view */
    loadSelf: () => void;
    /**
     * Helper for SEMP API requests. `path` is the endpoint + query string only
     * (e.g. '/SEMP/v2/monitor/msgVpns?count=100' or '/SEMP' for v1 RPC); the
     * kernel assembles the full URL from `appState.sempCredentials` on every
     * call, applies hosted-mode gateway routing, and injects Basic auth (a
     * managed session's relay instead: no Authorization header).
     */
    sempFetch: (path: string, options?: RequestInit) => Promise<Response>;
    /**
     * The managed session's provisioned profile, owned by core so any module
     * can open a provisioned connection (`dial`) without reaching into the
     * module that owns the login. Inert -- and `isActive() === false` -- outside
     * a managed session.
     */
    managedProfile: ManagedProfileStore;
    /**
     * The app's notification record, behind the header bell. Every ok / warn /
     * error toast and the connection lifecycle are recorded automatically; a
     * module records something without a toast with
     * `ctx.notifications.add(level, module, text)` (`module` as the sidebar
     * names it). See src/core/components/notification-center/.
     */
    notifications: NotificationCenter;
    /** Helper for clipboard copy with visual feedback */
    copyToClipboard: (text: string, btnElement?: HTMLElement) => Promise<void>;
    /**
     * Place a module's account control in the sidebar footer, above the
     * Client and SEMP status lights, where it stays visible on every page.
     * The module builds and owns the element (its visibility included); the
     * shell only holds it. One at a time: a later call replaces it. Only the
     * connections module's managed entry uses it.
     */
    mountSidebarAccount: (el: HTMLElement) => void;
}

/* ------------------------------------------------------------------ */
/*  Module Interface                                                   */
/* ------------------------------------------------------------------ */

export interface PwaModule {
    /** Human-readable display name shown in sidebar */
    name: string;
    /** Unique module identifier (used for DOM IDs, template lookup, etc.) */
    id: string;
    /** SVG icon markup for the sidebar nav item (optional) */
    icon?: string;
    /** Called by the Kernel to initialize this module */
    install(app: AppContext): Promise<void>;
}

/**
 * Registry entry — pairs a module with its initialization priority. Higher
 * priority installs first and renders higher in the sidebar. Registered via
 * `modules` in `src/registry.ts`.
 */
export interface RegisteredModule {
    module: PwaModule;
    priority: number;
}
