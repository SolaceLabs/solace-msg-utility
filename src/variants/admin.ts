/**
 * Admin variant — the standalone administration app served at `/solAdmin`.
 *
 * Built via `node scripts/vite-build.mjs --variant=admin --out-filename=solAdmin.html`.
 * The gateway serves it only in Provisioned mode, so the entitlement editors
 * are not reachable from a deployment that has no user list to edit.
 *
 * It ships NO messaging modules: `admin-login` authenticates against the managed
 * user list and adopts the profile, but opens no broker connection, so there is
 * nothing for queue-browser or queue-copy to attach to. Keeping the admin
 * surface out of the main bundles also keeps the everyday app's sidebar free of
 * modules almost nobody may use.
 */
export const ACTIVE_MODULES: Record<string, number> = {
    'admin-login': 100,
    'user-management': 20,         // admin-only
    'connection-management': 15,   // admin-only
    'gateway-settings': 10,        // admin-only: config.yaml
};
