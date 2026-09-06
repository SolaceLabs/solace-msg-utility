# Deployment Guide

This guide covers **deploying** the prebuilt application. To build from source, see [developer-guide.md](developer-guide.md).

---

## Deployment Options

### Hosted PWA (zero install)

Open <https://solacelabs.github.io/solace-msg-utility/> in a browser. Hosted from this repo via the tag workflow and redeployed on every `v*` tag that passes every gate.

The app talks to your broker directly from the browser — there is no broker proxy in this path. Your broker must be:

- **Network-reachable** from wherever the browser runs.
- **Configured to allow CORS** for SEMP requests from `https://solacelabs.github.io` (WebSocket connections are not subject to CORS).

If your broker uses a self-signed certificate, the app's SSL Trust dialog walks you through trusting it. See [TLS/SSL](#tlsssl) below.

### Containerised Gateway

The published image at `ghcr.io/solacelabs/solace-msg-utility:latest` ships the PWA together with a single-binary Go HTTPS gateway that:

1. Serves the PWA bundle.
2. Reverse-proxies `/{http|https|ws|wss}/{port}/{host}/{rest...}` to broker SEMP/SMF endpoints — so the browser only needs to trust the gateway's certificate, not every broker.
3. Exposes `/hosted` as an in-memory probe returning `200` with JSON `{hosted, connModes, defaultConn}` when `HOSTED=true` (the PWA uses this to detect that it is running behind the gateway **and** to learn which connection modes the deployment offers).

The image ships `FROM scratch` — only the static Go binary and the PWA assets, no shell, no libc, no `/etc/passwd`. The gateway listens on **`:9443`** (an unprivileged port) and runs as **UID `65532`** (the conventional non-root UID used by distroless).

**Run with `docker run`:**

```bash
docker run --rm -p 9443:9443 \
  -e HOSTED=true \
  -v solace-tls:/tls \
  ghcr.io/solacelabs/solace-msg-utility:latest
```

Then open <https://localhost:9443/>.

`/tls` is baked into the image as an empty directory owned by UID `65532`, so a **named volume** (`solace-tls` above) inherits that ownership and works out of the box. A **bind mount** does NOT inherit image ownership — the host directory must already be owned by UID `65532`, or pre-populated with `tls.crt` / `tls.key` so the gateway never needs to write.

**Image tags:** `ghcr.io/solacelabs/solace-msg-utility` is published multi-arch (`linux/amd64`, `linux/arm64`) with `:latest`, `:<major>`, `:<major>.<minor>`, and `:<major>.<minor>.<patch>` tags on every release; the Release notes quote the exact digest. Pin to a specific tag for production. The same release also publishes a [managed](#managed-mode-rbac) image under the `managed-` prefixed tags (`:managed-latest`, `:managed-<major>`, `:managed-<major>.<minor>`, `:managed-<version>`).

**Environment variables** (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOSTED` | unset | When `"true"`, `/hosted` returns `200` + the JSON config below; otherwise it returns `404`. |
| `CONN_MODES` | `direct` | Which connection tabs the app offers: `direct` \| `managed` \| `both`. Anything else fails startup. |
| `DEFAULT_CONN` | `direct` | Which tab opens first when `CONN_MODES=both`: `direct` \| `managed`. |
| `APP_DIR` | `/SolaceMsgUtility` | Directory containing `index.html` + assets. May be read-only. |
| `SSL_CERT_FILE` | `/tls/tls.crt` | TLS server certificate (PEM). |
| `SSL_KEY_FILE` | `/tls/tls.key` | TLS private key (PEM). |
| `SSL_TRUST_DIR` | `/tls/trust` | Directory of additional CA bundles (`*.crt`, `*.pem`, non-recursive). Added to the system pool for upstream verification. |
| `SSL_INSECURE_SKIP_VERIFY` | `false` | When `"true"`, the gateway does NOT verify upstream broker certificates. Logged as a warning at startup. Lab use only. |
| `LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error`. |

**TLS material:** if `SSL_CERT_FILE` and `SSL_KEY_FILE` both exist, the gateway loads them and refuses to start if either fails to parse (so it never silently overwrites a user-supplied keypair). If either is missing, it generates a self-signed ECDSA P-256 keypair valid for 365 days with `CN=localhost` and SANs `DNS:localhost, IP:::1, IP:127.0.0.1`, writing the cert (`0644`) and key (`0600`) at the configured paths. The SHA-256 fingerprint of the generated cert is logged at startup so operators can pin it.

**Proxy paths:** the gateway parses `/{scheme}/{port}/{host}/{rest...}` from the URL and forwards the request transparently. `{host}` accepts hostnames, IPv4, IPv6 (bare `::1` or bracketed `[::1]`), and FQDNs. `ws` / `wss` paths handle the WebSocket upgrade end-to-end. No `X-Forwarded-*` headers are added — headers pass through verbatim.

**Routes:**

| Path | Behaviour |
| --- | --- |
| `/hosted` | `200` + `{"hosted":true,"connModes":"…","defaultConn":"…"}` (`application/json`, `Cache-Control: no-store`) when `HOSTED=true`; else `404`. Skipped from access logs. |
| `/solAdmin` | The administration app (`solAdmin.html`, `no-store`) when the gateway is **hosted AND managed**; else `404` — indistinguishable from a wrong URL. |
| `/managed/*` | The RBAC API (`getConnections`, `reload`, `listUsers`, `saveUser`, `deleteUser`, `listConnections`, `saveConnection`, `deleteConnection`) when `MANAGED=true` on a gateway built with the `managed` tag; otherwise the path falls through to the SPA. |
| `/{http\|https}/{port}/{host}/{rest...}` | Reverse-proxy to `http(s)://{host}:{port}/{rest}` with the query string preserved. |
| `/{ws\|wss}/{port}/{host}/{rest...}` | WebSocket reverse-proxy to `ws(s)://{host}:{port}/{rest}`. |
| anything else | Served from `APP_DIR`; SPA history-mode fallback to `/index.html` when the path has no file extension. |

**Mounts:**

| Path | Purpose |
| --- | --- |
| `/tls` | TLS material: `tls.crt`, `tls.key`, and `trust/*.{crt,pem}` for upstream CA validation. Baked into the image as an empty directory owned by UID `65532`. Named volumes inherit that ownership automatically; bind mounts must already be owned by UID `65532` (or pre-populated with the keypair so no writes are needed). |
| `/SolaceMsgUtility` (or override via `APP_DIR`) | PWA bundle. Baked into the image by default; mount to override at runtime. |
| `/managed` | Writable RBAC store (`users.yaml`, `connections.yaml`, `site.seed`) — only used in [managed mode](#managed-mode-rbac) (`MANAGED=true`). Baked as an empty directory owned by UID `65532`, so a named volume inherits write access automatically; bind mounts must already be owned by UID `65532`. With no mount the store lives in the container's writable layer and is lost when the container is removed. |

**Shutdown:** `SIGINT` / `SIGTERM` triggers graceful shutdown with a 10-second drain.

> **Building the image locally** (for developers iterating on the gateway): `docker compose -f docker/docker-compose.yaml up --build` rebuilds from source. Note it starts **both** services — `gateway` on host port `19443` and `gateway-managed` on `29443` — since no profile restricts the default `up`; pass a service name (`up --build gateway`) to start just one. Production users should pull the published image above. See [developer-guide.md](developer-guide.md) for the full build workflow.

**Vendor scripts in compose:** both compose services bind-mount `../dist/solclient.js` and `../dist/jszip.min.js` read-only into `/SolaceMsgUtility/`, so those two files must exist in your local `dist/` before `docker compose up` — they are deliberately not baked into the image (see [External Runtime Dependencies](#external-runtime-dependencies)).

**No `HEALTHCHECK`:** the `scratch` image has no shell or `curl`, so the image deliberately declares none. Use an external check (a Kubernetes liveness probe, a swarm healthcheck, a monitoring agent) against `https://<host>:9443/hosted` with the certificate pinned or verification disabled.

### Managed Mode (RBAC)

**Managed mode** abstracts broker credentials from users: instead of typing SMF/SEMP credentials, users log in and pick from the brokers/VPNs they are entitled to. It is a **runtime posture, not a separate bundle** — every bundle carries both connection paths, and the gateway decides which the app offers. It **only runs behind the gateway** with managed mode enabled, because it relies on the gateway both to relay broker traffic *and* to serve the `/managed/*` RBAC endpoints. For the design and threat model see [rbac-variant-plan.md](rbac-variant-plan.md); for the internals see [architecture.md](architecture.md) § Managed Connections.

The managed image's gateway binary is compiled with the RBAC store + `/managed/*` handler built in (`-tags managed`); the standard image's gateway binary stays stdlib-only (no `/managed/*` support). Use the `managed-` tagged image for managed deployments — setting `MANAGED=true` on the standard image only logs a "built without managed support" warning.

**Deploying it (prebuilt image — recommended):** pull `ghcr.io/solacelabs/solace-msg-utility:managed-latest` (or a pinned `:managed-<version>`). This image bakes `MANAGED=true`, `HOSTED=true` and `CONN_MODES=managed` as defaults, so it runs as a managed deployment out of the box — just mount a writable `/managed` volume (and `/tls`).

#### Choosing which connection modes to offer

`CONN_MODES` decides what the Connections module shows, and it is the **only** control that makes the entitlement model binding:

| `CONN_MODES` | Connections module | Queue Copy destination credentials | Entitlements are… |
| --- | --- | --- | --- |
| `direct` (default) | Direct tab only | typed by the user | not in play — no managed session exists |
| `managed` | Managed tab only | **provisioned only** (pick a broker/VPN you are entitled to) | **binding** — this is the lockdown setting |
| `both` | both tabs, `DEFAULT_CONN` first | user chooses provisioned **or** typed | **advisory** — see the warning below |

> **`CONN_MODES=both` is a documented bypass.** A user can switch to the Direct tab and connect with any credentials they happen to know, entirely outside their entitlements — and a typed-credential Queue Copy destination is likewise ungated. Offer `both` only where that is acceptable (mixed audiences, migration periods). **If the entitlement model must hold, set `CONN_MODES=managed`.**

The gateway **fails to start** if `CONN_MODES` advertises managed without `HOSTED=true`, `MANAGED=true`, and a binary built with the `managed` tag — a half-configured deployment stops at boot instead of showing a tab that cannot work. With `MANAGED` unset the gateway behaves exactly as the standard gateway above and `/managed/*` falls through to the SPA. With no gateway at all (static hosting) there is no `/hosted`, so the app is Direct-only and the Managed tab never appears.

**Managed-mode environment variables** (in addition to the gateway variables above):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANAGED` | unset | When `"true"`, the gateway loads the RBAC store and serves `/managed/*`. Otherwise none of the managed code path runs. |
| `USERS_FILE` | `/managed/users.yaml` | User + entitlement store. Created with a default admin if missing (see below). |
| `CONNECTIONS_FILE` | `/managed/connections.yaml` | Broker connection store (credentials stored obfuscated, never in plaintext). |
| `SITE_SEED_FILE` | `/managed/site.seed` | Per-deployment key material. **Critical persistent state** — see below. |

The default paths put all three files under **`/managed/`**, so mount a **writable** volume there (the gateway writes the bootstrap admin and the site seed on first run). Using the prebuilt managed image, `MANAGED` / `HOSTED` / `CONN_MODES` are already baked in:

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  -v solace-managed:/managed \
  ghcr.io/solacelabs/solace-msg-utility:managed-latest
```

**First-run bootstrap:** if `USERS_FILE` is missing, the gateway writes a default admin — username `admin`, password `msgutility`, with **no** broker access. This password is public in this repo, so **log in and change it immediately via the User Management module** (and grant yourself entitlements there or in Connection Management). Do not edit the YAML files by hand in production — use the admin modules so the credential obfuscation stays consistent. (Out-of-band edits are still picked up without a restart: the **Refresh** button in the Managed panel makes the gateway re-read both YAML files from disk.)

**Site seed:** the gateway generates `SITE_SEED_FILE` with random bytes on first run and uses it to obfuscate/reveal broker credentials. **Back it up and treat it as a secret.** Losing or replacing it orphans every stored broker credential (they can no longer be revealed) — re-seeding then requires re-entering every connection's credentials via Connection Management. Keep it on the same persistent volume as the YAML stores.

#### Administration app (`/solAdmin`)

User Management and Connection Management are **not in the everyday bundles**. They ship as a separate app at `https://<gateway>:9443/solAdmin`, served only when the gateway is hosted **and** managed. Sign in there with an administrator account; a valid non-admin account is refused at the login screen. The admin app opens no broker connection at all — it exists to edit `users.yaml` and `connections.yaml` through the proxy.

The managed image ships `solAdmin.html` alongside the main bundle. If you assemble `APP_DIR` yourself, copy it too, or `/solAdmin` will 404 (the gateway logs "admin app requested but not deployed" so the cause is visible).

#### Managed-mode security checklist

Managed mode is fit for **trusted-internal** use only; the broker relay itself stays ungated, so the client-side guardrails are UX, not a security boundary. Before exposing it:

- **Set `CONN_MODES=managed`** unless you have a specific reason to offer Direct alongside it. Under `both`, none of the entitlement guarantees hold.
- **Use a read-only / least-privilege SEMP account** for each broker connection (never broker-admin) so a captured credential's blast radius is bounded.
- **Change the default `admin` / `msgutility` password** immediately.
- **Protect the store files** (`USERS_FILE`, `CONNECTIONS_FILE`, `SITE_SEED_FILE`) with filesystem permissions — the users file holds replayable login tokens and the seed is shared key material.
- **Always serve over TLS** (the gateway does by default) — login tokens and the site seed traverse the wire.
- **Treat `/solAdmin` as privileged.** It is the only surface that edits entitlements. It is reachable by anyone who can reach the gateway, so its protection is the administrator password — change the bootstrap one and use network controls if you need more.
- **Expect two modules to be missing.** Queue Subscription Explorer and Queue Discovery are hidden in every managed session (including for admins) because they read over a SEMP path that cannot be entitlement-filtered. That is deliberate; see [rbac-variant-plan.md](rbac-variant-plan.md) § Threat model.

### Self-host the static files

The simplest deployment without Docker. `index.html` is attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) (alongside the other bundle variants, the `go-web-proxy` binaries and a `SHA256SUMS.txt` to verify them). The two vendor libraries are not release assets — they are not committed to `main` — so take those from the `dist` branch of this repo:

```text
your-server/
  index.html         # PWA
  solclient.js       # Solace SDK (see External Runtime Dependencies below)
  jszip.min.js       # JSZip library
```

Serve with any static HTTP server:

```bash
# Node.js
npx http-server .

# Python
python -m http.server 8000

# Nginx, Apache, IIS — just point the document root to the folder
```

Then open the served URL in a browser.

### Embed in Solace Broker Web UI

Some Solace broker deployments allow hosting custom web pages. Place the three files in the broker's web server directory.

### Local file (dev exploration only)

You can open `index.html` directly in a browser via `file:///…`, but **SEMP API calls will fail** under the `file://` origin due to CORS. Use a local HTTP server (above) for actual use. This is a debugging shortcut, not a deployment path.

---

## External Runtime Dependencies

The PWA loads two external scripts via `<script>` tags. They are not bundled into the HTML and must be mounted alongside it at the deployment location. The same requirement applies to `min.html`, `mock.html`, `no-payload.html`, and `no-queue-copy.html`; every variant of the PWA expects the two vendor files next to it. `solAdmin.html` uses none of what those files provide (it never opens a broker connection and has no ZIP export), but it is built from the same shell, so it still runs the vendor loader and will show the "not found" banner if they are absent. The managed image ships them alongside it.

The shell tries each file in two locations, in order:

1. The same directory as the HTML (e.g. `solclient.js` next to `index.html`).
2. A sibling `js/` subfolder (e.g. `js/solclient.js`).

The first file that loads wins; if both 404 the shell shows a "vendor file not found" banner at the top of the page. Only those two names are tried — rename a debug build to `solclient.js` rather than dropping it in as `solclient-debug.js`.

### 1. Solace JavaScript SDK (`solclient.js`)

**What it is:** The Solace PubSub+ Web Messaging API for JavaScript. Provides WebSocket-based communication with Solace brokers.

**Where to get it:**

- Download from the [Solace Developer Portal](https://solace.com/downloads/)
- [Solace Customer Portal](https://products.solace.com/) > Products > APIs > Javascript
- Or from the Solace PubSub+ broker's built-in web interface (typically at `http://<broker>:8080/`)
- NPM: `npm install solclientjs` (then copy `node_modules/solclientjs/lib/solclient.js`)

**Version compatibility:** **10.18.3 or newer is enforced.** The shell reads `window.solace.Version.version` after load; below that floor it shows an "Outdated Library" banner and leaves `solaceLibLoaded` false, and the connection factory then refuses to open a session — Connect reports the version error on the connection card instead of failing obscurely deeper in the SDK. A build that reports **no** version at all cannot be checked, so it is allowed through with a console warning rather than blocked. The app accesses `window.solace` as a global.

**Placement:** Place `solclient.js` in the same directory as `index.html` (or under a sibling `js/` folder). The shell auto-detects both locations. Other filenames are not picked up — rename a debug build to `solclient.js`.

### 2. JSZip (`jszip.min.js`)

**What it is:** A JavaScript library for creating ZIP files in the browser. Used by the Queue Browser's "Download" feature.

**Where to get it:**

- CDN: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- NPM: `npm install jszip` (then copy `node_modules/jszip/dist/jszip.min.js`)
- Download from [https://stuk.github.io/jszip/](https://stuk.github.io/jszip/)

**Version compatibility:** **3.10.1 or newer is enforced.** An older build loads but is treated as not-loaded, so the Queue Browser's ZIP download stays disabled; everything else works.

**Placement:** Same as `solclient.js` — place alongside the HTML file or under a sibling `js/` folder.

### Graceful Degradation

- If `solclient.js` is not found, the app boots in "limited mode" with a console warning. Connection features will not work.
- If `jszip.min.js` is not found, message download (ZIP export) will not work. All other features function normally.

---

## Network Requirements

The application makes the following network connections from the user's browser:

| Connection | Protocol | Default Ports | Purpose |
| --- | --- | --- | --- |
| Solace Client | WebSocket (`ws://` or `wss://`) | 8008 (ws), 1443 (wss) | Message operations |
| SEMP API | HTTP/HTTPS | 8080 (http), 1943 (https) | Management operations |

In the Hosted PWA and Self-host paths, both connections go directly from the browser to the broker — there is no backend server. In the Containerised Gateway path, both connections go through the gateway's reverse proxy on `:9443`.

### CORS

If the Solace broker and the web app are served from different origins, the broker must allow CORS for SEMP requests. WebSocket connections are not subject to CORS restrictions. The Containerised Gateway sidesteps this entirely by proxying SEMP through the same origin as the PWA.

### TLS/SSL

For `wss://` connections with self-signed certificates, the browser must trust the certificate. The app includes a helper dialog that guides the user through the trust process (Connections module > SSL Trust Modal).

---

## Configuration

All configuration is done at runtime through the UI. There are no environment variables or config files for the PWA itself. (Container-side environment variables for the gateway are listed under [Containerised Gateway](#containerised-gateway) above.)

Connection profiles are stored in the browser's `localStorage`. They persist across browser sessions but are specific to the origin (protocol + host + port) where the app is served.

---

## Updating

To update a deployed instance:

- **Hosted PWA** — nothing to do; redeployed automatically on every published Release.
- **Container** — pull the new tag and recreate the container:

  ```bash
  docker pull ghcr.io/solacelabs/solace-msg-utility:latest
  # then restart your container (e.g. docker compose up -d, or docker run again)
  ```

  Pin to a specific tag (`:3.4.0`, `:3.4`, `:3`) instead of `:latest` for production stability. For managed deployments, use the `managed-` prefixed tags (`:managed-3.4.0`, `:managed-3.4`, `:managed-3`, `:managed-latest`).
- **Self-host** — download the new `index.html` from the latest [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) and replace the file on your server; `SHA256SUMS.txt` on the same Release verifies it. The `solclient.js` and `jszip.min.js` files come from the `dist` branch and only need updating if you want a newer version of those libraries.
