/**
 * PwaModule Contract
 *
 * Every module in the application must implement this interface.
 * Modules are registered in `src/registry.ts` alongside their priority; the
 * Kernel receives `{ module, priority }` tuples and installs in descending
 * priority order. `priority` is intentionally NOT on the module itself — it's
 * a registry-level decision so the full ordering is visible in one file.
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
// carries the managed session store defined alongside the managed API client.
import type { ManagedStore } from './services/managed-session-store';
import type { ConnDeploymentConfig } from './connections/conn-modes';

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
 * The current user's managed session, populated by the connections module's
 * Managed panel after login. `null`/absent whenever no managed login is active
 * (including every Direct-mode session), where RBAC helpers degrade to allow-all.
 *
 * This carries only **matcher inputs**. The packed broker credentials and the
 * deployment seed live in `AppContext.managedStore` — see
 * `src/core/services/managed-session-store.ts` for the ownership split.
 */
export interface ManagedSession {
    /** Whether the user may see the admin-only management modules. */
    admin: boolean;
    /** Username, resent (with `token`) to authenticate admin CRUD calls. */
    username: string;
    /** Login bearer (the one-way `stamp` of the password); in-memory only. */
    token: string;
    /** Connected broker NAME — the source of the `broker` argument to matchers. */
    broker: string;
    /**
     * Provisioned VPN names for the connected `broker`, published by the
     * connections module from `getConnections` (`connections.yaml` ∩ entitled).
     * `[]` until connected. This is what bounds the queue-picker's VPN list in
     * managed mode (via `queueSourceFrom`) so it matches the Connections dropdown
     * — provisioning, not the broader entitlement globs.
     */
    vpns: string[];
    /** Queues the user may forward/delete on (operate ⊇ read-only). */
    operate: QGlob[];
    /** Queues the user may only view. */
    readOnly: QGlob[];
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
     * typed into the form. Populated by the connections module on
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
     * identity without reverse-engineering the wire URL.
     */
    sempCredentials: {
        user: string;
        pass: string;
        baseUrl: string;
        protocol: string;
        host: string;
        port: string;
        urlPath: string;
    } | null;
    isSempConnected: boolean;
    /**
     * Current managed (RBAC) session — present only in the `managed` variant,
     * set by managed-connections after login and cleared on logout. Optional so
     * non-managed variants (and their AppContext test literals) need not set it;
     * absent/null ⇒ RBAC helpers in `./rbac` degrade to allow-all.
     */
    managed?: ManagedSession | null;
    /**
     * The deployment's connection-mode config, published once by the connections
     * module from its `/hosted` probe. Other modules read it to derive what they
     * may offer for a SECONDARY connection (see `resolveDestCredModes`) rather
     * than probing the gateway again.
     */
    connConfig?: ConnDeploymentConfig;
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
     * The kernel re-renders the sidebar (module visibility) on this. Emitted only
     * by managed-connections; never fires in non-managed variants.
     */
    'rbac:changed':                void;
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
     * call, applies hosted-mode gateway routing, and injects Basic auth.
     */
    sempFetch: (path: string, options?: RequestInit) => Promise<Response>;
    /**
     * The managed session's provisioned profile + deployment seed, owned by core
     * so any module can open a provisioned connection (or seal a credential)
     * without reaching into the module that owns the login. Inert — and
     * `isActive() === false` — outside a managed session.
     */
    managedStore: ManagedStore;
    /** Helper for clipboard copy with visual feedback */
    copyToClipboard: (text: string, btnElement?: HTMLElement) => Promise<void>;
    /** Global app config */
    config: Record<string, any>;
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
