/**
 * Connection-mode deployment config: which connection tabs the app offers
 * (Direct / Managed) and which is shown first. Distinct from the form-level
 * `ConnectionConfig` defaults in `./defaults.ts` — this is per-deployment UI
 * config, not broker credentials.
 *
 * Source of truth by deployment context:
 *   - Non-hosted (static HTML, no gateway): no `/hosted` → `DEFAULT_CONN_CONFIG`
 *     applies → **Direct only**. Managed never shows without `/hosted`.
 *   - Hosted: the gateway resolves `CONN_MODES` / `DEFAULT_CONN` from its
 *     container ENV and returns them in the `/hosted` JSON; the app applies that
 *     over the default (see `core/hosted.ts` `probeDeployment`).
 *
 * A single enum (`connModes`) structurally prevents a "no tabs" state and makes
 * "managed only" (RBAC-enforced) just `connModes: 'managed'`.
 */

/** A single connection tab/mode. */
export type ConnMode = 'direct' | 'managed';
/** Which tabs a deployment offers. */
export type ConnModes = 'direct' | 'managed' | 'both';

export interface ConnDeploymentConfig {
    connModes: ConnModes;
    /** Which tab is active first — only meaningful when `connModes === 'both'`. */
    defaultConn: ConnMode;
}

/** App default when no `/hosted` config is available: Direct only. */
export const DEFAULT_CONN_CONFIG: ConnDeploymentConfig = {
    connModes: 'direct',
    defaultConn: 'direct',
};

const CONN_MODES_VALUES: readonly ConnModes[] = ['direct', 'managed', 'both'];
const CONN_MODE_VALUES: readonly ConnMode[] = ['direct', 'managed'];

/**
 * Coerce an untrusted object (parsed from the `/hosted` JSON) into a valid
 * `ConnDeploymentConfig`, falling back to the default for any missing/invalid
 * field. Never throws — a malformed gateway response degrades to Direct only.
 */
export function coerceConnConfig(raw: unknown): ConnDeploymentConfig {
    const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
    const connModes = CONN_MODES_VALUES.includes(obj.connModes as ConnModes)
        ? obj.connModes as ConnModes
        : DEFAULT_CONN_CONFIG.connModes;
    const defaultConn = CONN_MODE_VALUES.includes(obj.defaultConn as ConnMode)
        ? obj.defaultConn as ConnMode
        : DEFAULT_CONN_CONFIG.defaultConn;
    return { connModes, defaultConn };
}

/**
 * Resolve which connection tabs to render, in order. `tabs[0]` is the active
 * (default) tab. The result is never empty. Pass `null` when there is no
 * `/hosted` config (non-hosted / static) → Direct only.
 */
export function resolveConnTabs(cfg: ConnDeploymentConfig | null): ConnMode[] {
    const c = cfg ?? DEFAULT_CONN_CONFIG;
    if (c.connModes === 'direct') return ['direct'];
    if (c.connModes === 'managed') return ['managed'];
    // 'both' — order by defaultConn (Managed first only when explicitly asked).
    return c.defaultConn === 'managed' ? ['managed', 'direct'] : ['direct', 'managed'];
}

/**
 * Credential sources a deployment permits for a **secondary** connection
 * (queue-copy's destination), derived from the very same enum that drives the
 * primary's tabs so the two can never drift:
 *   `direct` ⇒ manual only · `managed` ⇒ provisioned only · `both` ⇒ both.
 *
 * Ordering matches `resolveConnTabs`, so `[0]` is the deployment's default.
 */
export function resolveDestCredModes(cfg: ConnDeploymentConfig | null): ('provisioned' | 'manual')[] {
    return resolveConnTabs(cfg).map(t => (t === 'managed' ? 'provisioned' : 'manual'));
}
