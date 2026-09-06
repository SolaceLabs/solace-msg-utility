/**
 * `/hosted` and the `/managed/*` RBAC surface.
 *
 * The profile's credentials are packed with the **real** transform from
 * `src/core/encode.ts` against a demo seed, so the managed session store's
 * just-in-time unpack runs for real rather than being bypassed. If that path
 * ever breaks, the demo breaks with it — which is the point.
 *
 * Only the endpoints the Managed tab needs are served. The `/solAdmin` admin
 * app is out of scope for the demo, so its CRUD endpoints return the same
 * opaque 400 the real proxy uses for a refused call.
 *
 * Mock-only.
 */
import { pack, importSeed, fromB64 } from '../../core/encode';
import { DEMO_SITE_SEED, MANAGED_BROKER, ROLE, ROLE_ENTITLEMENTS, VPNS, scenario } from '../fixtures';

/** `/hosted` — advertises both connection tabs so Managed is demoable. */
export function hostedResponse(): unknown {
    return { hosted: true, connModes: 'both', defaultConn: 'direct' };
}

/**
 * `/managed/getConnections`. Returns null when nobody is signed in, which the
 * client renders as an invalid-credentials refusal — the same opaque failure
 * the real proxy gives.
 */
export async function getConnectionsResponse(): Promise<unknown | null> {
    if (scenario.role === ROLE.SIGNED_OUT) return null;

    const entitlements = ROLE_ENTITLEMENTS[scenario.role];
    const seed = await importSeed(fromB64(DEMO_SITE_SEED));

    // Every VPN in the topology is offered; the entitlement globs above are what
    // narrow what the signed-in identity can actually see and operate on.
    const msgVpns = await Promise.all(VPNS.map(async v => ({
        name: v.name,
        client: {
            port: MANAGED_BROKER.clientPort,
            user: MANAGED_BROKER.clientUser,
            pass: await pack(`demo-client-secret-${v.name}`, seed),
        },
    })));

    return {
        admin: entitlements.admin,
        siteSeed: DEMO_SITE_SEED,
        operate: entitlements.operate,
        readOnly: entitlements.readOnly,
        brokers: [{
            broker: MANAGED_BROKER.broker,
            hostname: MANAGED_BROKER.hostname,
            semp: {
                port: MANAGED_BROKER.sempPort,
                user: MANAGED_BROKER.sempUser,
                pass: await pack('demo-semp-secret', seed),
            },
            msgVpns,
        }],
    };
}
