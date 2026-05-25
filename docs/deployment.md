# Deployment Guide

This guide covers **deploying** the prebuilt application. To build from source, see [developer-guide.md](developer-guide.md).

---

## Deployment Options

### Hosted PWA (zero install)

Open <https://solacelabs.github.io/solace-msg-utility/> in a browser. Hosted from this repo via the release workflow and redeployed on every published Release.

The app talks to your broker directly from the browser — there is no broker proxy in this path. Your broker must be:

- **Network-reachable** from wherever the browser runs.
- **Configured to allow CORS** for SEMP requests from `https://solacelabs.github.io` (WebSocket connections are not subject to CORS).

If your broker uses a self-signed certificate, the app's SSL Trust dialog walks you through trusting it. See [TLS/SSL](#tlsssl) below.

### Containerised Gateway

The published image at `ghcr.io/solacelabs/solace-msg-utility:latest` ships the PWA together with a single-binary Go HTTPS gateway that:

1. Serves the PWA bundle.
2. Reverse-proxies `/{http|https|ws|wss}/{port}/{host}/{rest...}` to broker SEMP/SMF endpoints — so the browser only needs to trust the gateway's certificate, not every broker.
3. Exposes `/hosted` as an in-memory probe returning `200 true` when `HOSTED=true` (the PWA uses this to detect that it is running behind the gateway).

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

**Image tags:** `ghcr.io/solacelabs/solace-msg-utility` is published with `:latest`, `:<major>`, `:<major>.<minor>`, and `:<major>.<minor>.<patch>` tags on every release. Pin to a specific tag for production.

**Environment variables** (all optional):

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOSTED` | unset | When `"true"`, `/hosted` returns `200 true`; otherwise it returns `404`. |
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
|------|-----------|
| `/hosted` | `200 true` (`text/html`, `Cache-Control: no-store`) when `HOSTED=true`; else `404`. Skipped from access logs. |
| `/{http\|https}/{port}/{host}/{rest...}` | Reverse-proxy to `http(s)://{host}:{port}/{rest}` with query/fragment preserved. |
| `/{ws\|wss}/{port}/{host}/{rest...}` | WebSocket reverse-proxy to `ws(s)://{host}:{port}/{rest}`. |
| anything else | Served from `APP_DIR`; SPA history-mode fallback to `/index.html` when the path has no file extension. |

**Mounts:**

| Path | Purpose |
|------|---------|
| `/tls` | TLS material: `tls.crt`, `tls.key`, and `trust/*.{crt,pem}` for upstream CA validation. Baked into the image as an empty directory owned by UID `65532`. Named volumes inherit that ownership automatically; bind mounts must already be owned by UID `65532` (or pre-populated with the keypair so no writes are needed). |
| `/SolaceMsgUtility` (or override via `APP_DIR`) | PWA bundle. Baked into the image by default; mount to override at runtime. |

**Shutdown:** `SIGINT` / `SIGTERM` triggers graceful shutdown with a 10-second drain.

> **Building the image locally** (for developers iterating on the gateway): `docker compose -f docker/docker-compose.yaml up --build` rebuilds from source and starts a fresh container. Production users should pull the published image above. See [developer-guide.md](developer-guide.md) for the full build workflow.

### Self-host the static files

The simplest deployment without Docker. Download three files from the latest [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) (or copy them from the `dist` branch of this repo):

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

The PWA loads two external scripts via `<script>` tags. They are not bundled into the HTML and must be mounted alongside it at the deployment location. The same requirement applies to `min.html` and `mock.html`; every variant of the PWA expects the two vendor files next to it.

The shell tries each file in two locations, in order:

1. The same directory as the HTML (e.g. `solclient.js` next to `index.html`).
2. A sibling `js/` subfolder (e.g. `js/solclient.js`).

For `solclient.js`, the shell additionally tries `solclient-full.js` and `solclient-debug.js` (with the same two-folder lookup) so debug builds of the SDK can be dropped in without renaming. The first file that loads wins; if every candidate 404s the shell shows a "vendor file not found" banner at the top of the page.

### 1. Solace JavaScript SDK (`solclient.js`)

**What it is:** The Solace PubSub+ Web Messaging API for JavaScript. Provides WebSocket-based communication with Solace brokers.

**Where to get it:**
- Download from the [Solace Developer Portal](https://solace.com/downloads/)
- Or from the Solace PubSub+ broker's built-in web interface (typically at `http://<broker>:8080/`)
- NPM: `npm install solclientjs` (then copy `node_modules/solclientjs/lib/solclient.js`)

**Version compatibility:** The application uses the Solace Web Messaging API. Any recent version of `solclient.js` (10.x+) should work. The app accesses `window.solace` as a global.

**Placement:** Place `solclient.js` in the same directory as `index.html` (or under a sibling `js/` folder). The shell auto-detects both locations and also accepts the `solclient-full.js` / `solclient-debug.js` debug-build filenames.

### 2. JSZip (`jszip.min.js`)

**What it is:** A JavaScript library for creating ZIP files in the browser. Used by the Queue Browser's "Download" feature.

**Where to get it:**
- CDN: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- NPM: `npm install jszip` (then copy `node_modules/jszip/dist/jszip.min.js`)
- Download from [https://stuk.github.io/jszip/](https://stuk.github.io/jszip/)

**Version compatibility:** JSZip 3.x.

**Placement:** Same as `solclient.js` — place alongside the HTML file or under a sibling `js/` folder.

### Graceful Degradation

- If `solclient.js` is not found, the app boots in "limited mode" with a console warning. Connection features will not work.
- If `jszip.min.js` is not found, message download (ZIP export) will not work. All other features function normally.

---

## Network Requirements

The application makes the following network connections from the user's browser:

| Connection | Protocol | Default Ports | Purpose |
|------------|----------|--------------|---------|
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
  Pin to a specific tag (`:3.4.0`, `:3.4`, `:3`) instead of `:latest` for production stability.
- **Self-host** — download the new `index.html` from the latest [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) and replace the file on your server. The `solclient.js` and `jszip.min.js` files only need updating if you want a newer version of those libraries.
