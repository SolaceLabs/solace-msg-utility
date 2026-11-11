/**
 * Connection-mode deployment config: which connection tabs the app offers
 * (Direct / Provisioned) and which is shown first. Distinct from the form-level
 * `ConnectionConfig` (`./types.ts`) -- this is per-deployment UI config, not
 * broker credentials.
 *
 * Source of truth by deployment context:
 *   - Standalone (static HTML, no gateway): no `/hosted` -> `DEFAULT_CONN_CONFIG`
 *     applies -> **Direct only**. Provisioned never shows without `/hosted`.
 *   - Behind the gateway: it resolves `CONN_MODES` / `DEFAULT_CONN` from
 *     config.yaml and returns them in the `/hosted` JSON; the app applies that
 *     over the default (see `core/hosted.ts` `probeDeployment`).
 *
 * A single enum (`connModes`) structurally prevents a "no tabs" state and makes
 * "Provisioned only" (entitlements binding) just `connModes: 'provisioned'`.
 */

/** A single connection tab/mode. */
export type ConnMode = 'direct' | 'provisioned';
/** Which tabs a deployment offers. */
export type ConnModes = 'direct' | 'provisioned' | 'both';

export interface ConnDeploymentConfig {
    connModes: ConnModes;
    /** Which tab is active first -- only meaningful when `connModes === 'both'`. */
    defaultConn: ConnMode;
}

/**
 * What the connections module publishes as `AppState.connConfig` after its
 * `/hosted` probe: the tabs config plus the probe's hosted verdict, the single
 * home of that fact (read it with `isHostedDeployment` in `core/hosted.ts`).
 */
export interface DeploymentConfig extends ConnDeploymentConfig {
    hosted: boolean;
}

/** App default when no `/hosted` config is available: Direct only. */
export const DEFAULT_CONN_CONFIG: ConnDeploymentConfig = {
    connModes: 'direct',
    defaultConn: 'direct',
};

const CONN_MODES_VALUES: readonly ConnModes[] = ['direct', 'provisioned', 'both'];
const CONN_MODE_VALUES: readonly ConnMode[] = ['direct', 'provisioned'];

/**
 * Coerce an untrusted object (parsed from the `/hosted` JSON) into a valid
 * `ConnDeploymentConfig`, falling back to the default for any missing/invalid
 * field. Never throws -- a malformed gateway response degrades to Direct only.
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
 * `/hosted` config (Standalone) -> Direct only.
 */
export function resolveConnTabs(cfg: ConnDeploymentConfig | null): ConnMode[] {
    const c = cfg ?? DEFAULT_CONN_CONFIG;
    if (c.connModes === 'direct') return ['direct'];
    if (c.connModes === 'provisioned') return ['provisioned'];
    // 'both' -- order by defaultConn (Provisioned first only when explicitly asked).
    return c.defaultConn === 'provisioned' ? ['provisioned', 'direct'] : ['direct', 'provisioned'];
}
