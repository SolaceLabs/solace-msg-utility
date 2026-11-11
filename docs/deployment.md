# Deployment Guide

This guide covers **deploying** the prebuilt application. To build from source, see [developer-guide.md](developer-guide.md).

---

## Contents

- [Choosing a mode](#choosing-a-mode)
- [Standalone mode](#standalone-mode)
  - [GitHub Pages (zero install)](#github-pages-zero-install)
  - [Self-host the static files](#self-host-the-static-files)
  - [Embed in Solace Broker Web UI](#embed-in-solace-broker-web-ui)
  - [Local file (dev exploration only)](#local-file-dev-exploration-only)
  - [From the container](#from-the-container)
- [Gateway mode](#gateway-mode)
  - [Quick start](#quick-start)
  - [Image and tags](#image-and-tags)
  - [Mounts](#mounts)
  - [TLS and trusted CAs](#tls-and-trusted-cas)
  - [Settings](#settings)
  - [In production](#in-production)
  - [Client addresses behind Docker and proxies](#client-addresses-behind-docker-and-proxies)
  - [Logs](#logs)
- [Provisioned mode](#provisioned-mode)
- [External Runtime Dependencies](#external-runtime-dependencies)
  - [1. Solace JavaScript SDK (`solclient.js`)](#1-solace-javascript-sdk-solclientjs)
  - [2. JSZip (`jszip.min.js`)](#2-jszip-jszipminjs)
  - [Graceful Degradation](#graceful-degradation)
- [Network Requirements](#network-requirements)
  - [CORS](#cors)
  - [TLS/SSL](#tlsssl)
- [Configuration](#configuration)
  - [Gateway configuration file](#gateway-configuration-file)
- [Updating](#updating)

---

## Choosing a mode

The app runs in one of three modes. They differ in where the app is served from, who connects to the broker, and who holds the broker's credentials.

| | Standalone | Gateway | Provisioned |
| --- | --- | --- | --- |
| Served from | GitHub Pages, any web server, the broker's web UI | the container image | the container image |
| Connects to the broker | the browser | the gateway, for the browser | the gateway, for the browser |
| Broker credentials | each user types them | each user types them | an administrator stores them; users sign in |
| Start | open the page, or host the files | `SMU_VERSION=<release> docker compose -f docker/compose.gateway.yaml up -d` | `SMU_VERSION=<release> docker compose -f docker/compose.provisioned.yaml up -d` |
| Try it offline | `demo.html` | `demo.html` | `provisioned-demo.html` |

- **Standalone** needs nothing but a browser that can reach your broker, and a broker that allows CORS for SEMP.
- **Gateway** puts one HTTPS endpoint in front of your brokers: browsers reach and trust only the gateway.
- **Provisioned** adds sign-in on top of Gateway mode: users never see or type a broker's address or password. See [provisioned-mode.md](provisioned-mode.md).

One image serves both container modes: Gateway mode by default, Provisioned mode when you set `CONN_MODES`. The demos are offline: see [demo.md](demo.md).

---

## Standalone mode

The app talks to your broker directly from the browser; there is no proxy in this path. Your broker must be:

- **Network-reachable** from wherever the browser runs.
- **Configured to allow CORS** for SEMP requests from the page's origin (WebSocket connections are not subject to CORS).

If your broker uses a self-signed certificate, the app's SSL Trust dialog walks you through trusting it. See [TLS/SSL](#tlsssl) below.

### GitHub Pages (zero install)

Open <https://solacelabs.github.io/solace-msg-utility/> in a browser. It is published from this repo by the tag workflow and redeployed on every `v*` tag that passes every gate. Allow CORS for SEMP from `https://solacelabs.github.io`.

### Self-host the static files

The simplest deployment without Docker. `index.html` is attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) the tag pipeline creates (alongside the other bundle variants and a `SHA256SUMS.txt` to verify them); releases up to v3.3.4 predate the pipeline and carry no assets. The newest is always at a stable URL, so a script can fetch it directly -- keep `-f`, so a failed download is an error instead of a saved error page:

```bash
curl -fLO https://github.com/SolaceLabs/solace-msg-utility/releases/latest/download/index.html
```

The two vendor libraries are not release assets -- they are not committed to `main` -- so take those from the `dist` branch of this repo:

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

# Nginx, Apache, IIS -- just point the document root to the folder
```

Then open the served URL in a browser.

### Embed in Solace Broker Web UI

Some Solace broker deployments allow hosting custom web pages. Place the three files in the broker's web server directory.

### Local file (dev exploration only)

You can open `index.html` directly in a browser via `file:///...`, but **SEMP API calls will fail** under the `file://` origin due to CORS. Use a local HTTP server (above) for actual use. This is a debugging shortcut, not a deployment path.

### From the container

The image can also serve the files alone: with `HOSTED=false` it serves the app over HTTPS and nothing else (the relay paths answer `403`), and browsers connect to brokers themselves, as with any web server. The page being HTTPS, the app then offers only `wss://` and `https://`: a browser blocks unencrypted connections from an HTTPS page. Provisioned mode needs `HOSTED` left at its default, `true`.

---

## Gateway mode

The image serves the app over HTTPS and connects to your brokers for it: browsers reach and trust only the gateway, never the brokers. Users type their broker's details, as in Standalone mode. It listens on `:9443` and runs as UID `65532`.

### Quick start

[`docker/compose.gateway.yaml`](../docker/compose.gateway.yaml) is a ready-made deployment, locked down (non-root, read-only, no capabilities):

```bash
SMU_VERSION=3.6.0 docker compose -f compose.gateway.yaml up -d
```

Or with `docker run`:

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  ghcr.io/solacelabs/solace-msg-utility:3.6.0
```

Then open <https://localhost:9443/>.

### Image and tags

`ghcr.io/solacelabs/solace-msg-utility` serves every container mode. Every release publishes `:<major>.<minor>.<patch>`, `:<major>.<minor>`, `:<major>` and `:latest`, for `linux/amd64` and `linux/arm64`. Pin a full version in production. The Release notes quote the image's digest, and a tag only ever moves to an image that passed the vulnerability scan.

The image includes the two scripts the app loads, `solclient.js` (Solace's JavaScript messaging API) and `jszip.min.js`, with their licences.

### Mounts

| Path | What |
| --- | --- |
| `/tls` | `tls.crt` and `tls.key`, the gateway's own certificate, and `trust/`, the CAs it trusts for broker connections. |
| `/backup` | Provisioned mode only: the scheduled backups, each encrypted with its own passphrase. Mount a host directory owned by UID `65532` to keep them; see [Back up and restore](provisioned-mode.md#back-up-and-restore). |

Use named volumes: they take the image's UID `65532` ownership. A bind-mounted directory must already be owned by UID `65532`, or hold its files ready so the gateway never needs to write.

### TLS and trusted CAs

- **The gateway's certificate:** put yours at `/tls/tls.crt` and `/tls/tls.key`. A pair that does not load stops the start, and so does half a pair (only the key, or only the certificate): the gateway never writes over a file it did not make. Add the missing file, or remove the one that is there. With neither, the gateway generates a self-signed **bootstrap** pair (`CN=localhost`, valid **7 days**) on its first start and logs its SHA-256 fingerprint. It is a convenience for the first sign-in only: it is never renewed, and once it expires browsers refuse it, so put your own certificate in place before then.
- **Brokers' certificates:** the gateway verifies every broker it connects to, and the image ships no root CAs. Put each CA your brokers' certificates chain to, a public root included, in `/tls/trust/` as a `*.crt` or `*.pem` file (`SSL_TRUST_DIR`). They are read at start, so restart after adding one. `SSL_INSECURE_SKIP_VERIFY=true` turns verification off: lab use only.

### Settings

The gateway keeps its settings in `config.yaml`. The variables below seed it on the first start, when the file does not exist; from then on the file wins, and each start logs a warning for every variable that differs from it. Edit the file and restart, or delete it to seed it again. A value the gateway cannot use stops the start, naming the key and the value. The keys with no variable are under [Gateway configuration file](#gateway-configuration-file).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOSTED` | `true` | `true` sends the app's broker connections through the gateway (Gateway and Provisioned mode). `false` serves the files only, and browsers connect to brokers themselves, over `wss://` and `https://` only; the gateway refuses to relay (`403`). Any other value stops the start. |
| `CONN_MODES` | `direct` | Which connection tabs the app offers: `direct` (Gateway mode), `provisioned` or `both` (Provisioned mode; see [provisioned-mode.md](provisioned-mode.md)). |
| `DEFAULT_CONN` | `direct` | Which tab opens first under `both`: `direct` or `provisioned`. |
| `SSL_CERT_FILE` | `/tls/tls.crt` | The gateway's TLS certificate (PEM). Go also reads this variable to find a system CA bundle, so a container that sets it ignores any bundle mounted at Go's default path: add CAs through `SSL_TRUST_DIR`. |
| `SSL_KEY_FILE` | `/tls/tls.key` | Its private key (PEM). |
| `SSL_TRUST_DIR` | `/tls/trust` | The CAs trusted for broker connections (`*.crt`, `*.pem`); see [TLS and trusted CAs](#tls-and-trusted-cas). |
| `SSL_INSECURE_SKIP_VERIFY` | `false` | `true` skips verifying brokers' certificates (`tls.insecureSkipVerify` in `config.yaml`), with a warning at every start. Lab use only. Any value other than `true` or `false` stops the start. |
| `LOG_LEVEL` | `warn` | `debug`, `info`, `warn` or `error`. See [Logs](#logs). |

### In production

- **Health check:** the image has no shell, so it declares no `HEALTHCHECK`. Probe `https://<host>:9443/hosted` from outside (`200` while `HOSTED=true`; `503` once the app bundle can no longer be served, say a mounted build went away), with the certificate pinned or verification off. A client access list must allow the prober.
- **Your own build:** mount it at `/SolaceMsgUtility`. It must hold the mode's bundle (`index.html` in Gateway mode, `provisioned.html` in Provisioned mode): without it the gateway does not start, and the log names the file.
- **Behind a reverse proxy:** pass the original `Host` header through, allow WebSocket upgrades, and list the proxy in `access.trustedProxies` so the gateway sees each client's own address. See [Client addresses behind Docker and proxies](#client-addresses-behind-docker-and-proxies).
- **Network:** browsers need to reach only the gateway; the gateway needs the brokers' SEMP and web messaging ports. In Gateway mode the user picks `https`/`wss` or `http`/`ws` per connection; in Provisioned mode each stored connection uses TLS (`https` for SEMP, `wss` for messaging) unless an administrator gave it the plain scheme (`http`, `ws`).
- **Stopping:** on `SIGTERM` the gateway finishes requests in flight for up to 10 seconds. A restart signs every Provisioned user out.

### Client addresses behind Docker and proxies

The gateway keys three things on the client's address: the access list (`access.allow`), the per-client sign-in failure count and the per-client budget for requests without a session (`login.*`). It takes that address from the TCP connection, unless the connection comes from a proxy listed in `access.trustedProxies`; then it takes the rightmost address in `X-Forwarded-For` that is not itself a listed proxy. When something between the browsers and the gateway hides their addresses, every user looks like that one address: the access list can only allow or deny all of them, and one user's failed sign-ins throttle everyone.

- **A reverse proxy** (nginx, Traefik, a load balancer): list its address, or its network, in `access.trustedProxies`, and have it set `X-Forwarded-For`. Never list a range browsers can connect from: a listed address can claim to be any client.
- **Docker's port forwarding:** depending on how the port is published, the container may see one address for every client. Docker Desktop (Mac, Windows), rootless Docker with its builtin port driver, and Docker's userland proxy (`docker-proxy`, which carries connections to `localhost` on the host, and every connection when Docker does not manage the host's firewall rules) hand the gateway each connection from their own address, such as the bridge gateway `172.17.0.1`. A Linux host where Docker forwards the port through its firewall rules keeps the browsers' addresses, and so does `--network host`. Do not list that address in `access.trustedProxies` to work around it: no `X-Forwarded-For` comes through these, so nothing changes, and anything else on that network could then claim to be any client.
- **How to check:** in Provisioned mode the admin console's Gateway Settings page shows your address as the gateway sees it, and whether a trusted proxy decided it (`GET /managed/client`). With `LOG_LEVEL=info` each request line names the client, and when the last 50 sign-ins all came from one private address the gateway logs a warning that says so.

### Logs

The gateway logs to standard error, one `key=value` line per event, at the level `LOG_LEVEL` sets (`logLevel` in `config.yaml`, changed live in Provisioned mode from Gateway Settings):

- **error:** something failed and needs attention: a start that cannot proceed, a request the gateway could not serve (a handler that crashed is answered `500` and logged here, with a stack trace at `debug`), a failed backup.
- **warn:** a recoverable problem: a denied client, a burst of failed sign-ins, a broker the relay could not reach, a full throttle table, a setting that is ignored.
- **info:** what happened: each request (with the resolved client and the signed-in user), sign-ins, dials, every administrator's change to users, connections and settings, backups written, imports and exports.
- **debug:** traces.

Each line names its `component` and what it concerns (`user`, `client`, `broker`, `vpn`, `path`, `target`); no password or key is ever logged. One line, `gateway starting`, is written at every level: the version, the mode, the files, the access list, the trusted proxies, the TLS settings and, in Provisioned mode, the sign-in and session limits the gateway runs with.

---

## Provisioned mode

Users sign in and get only the brokers and Message VPNs an administrator granted. It is the same image with `CONN_MODES=provisioned`, and everything under [Gateway mode](#gateway-mode) applies to it too. The ready-made deployment is [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml); how it works, how to configure it and the recommended values are in [provisioned-mode.md](provisioned-mode.md).

---

## External Runtime Dependencies

The PWA loads two external scripts via `<script>` tags. They are not bundled into the HTML: wherever you host an HTML file yourself, put both next to it. The image already includes both, from the exact versions `package.json` pins, with their licence files under `licenses/`. The same requirement applies to `min.html`, `demo.html`, `no-payload.html`, and `no-queue-copy.html`; every variant of the PWA expects the two vendor files next to it. `provisioned.html` (what the image serves in Provisioned mode) needs them too. `solAdmin.html` uses none of what those files provide (it never opens a broker connection and has no ZIP export), but it is built from the same shell, so it still runs the vendor loader and will show the "not found" banner if they are absent.

The shell tries each file in two locations, in order:

1. The same directory as the HTML (e.g. `solclient.js` next to `index.html`).
2. A sibling `js/` subfolder (e.g. `js/solclient.js`).

The first file that loads wins; if both 404 the shell shows a "vendor file not found" banner at the top of the page. Only those two names are tried -- rename a debug build to `solclient.js` rather than dropping it in as `solclient-debug.js`.

### 1. Solace JavaScript SDK (`solclient.js`)

**What it is:** The Solace PubSub+ Web Messaging API for JavaScript. Provides WebSocket-based communication with Solace brokers.

**Where to get it:**

- Download from the [Solace Developer Portal](https://solace.com/downloads/)
- [Solace Customer Portal](https://products.solace.com/) > Products > APIs > Javascript
- Or from the Solace PubSub+ broker's built-in web interface (typically at `http://<broker>:8080/`)
- NPM: `npm install solclientjs` (then copy `node_modules/solclientjs/lib-browser/solclient.js`, the browser build)

**Version compatibility:** **10.18.3 or newer is enforced.** The shell reads `window.solace.Version.version` after load; below that floor it shows an "Outdated Library" banner and leaves `solaceLibLoaded` false, and the connection factory then refuses to open a session -- Connect reports the version error on the connection card instead of failing obscurely deeper in the SDK. A build that reports **no** version at all cannot be checked, so it is allowed through with a console warning rather than blocked. The app accesses `window.solace` as a global.

**Placement:** Place `solclient.js` in the same directory as `index.html` (or under a sibling `js/` folder). The shell auto-detects both locations. Other filenames are not picked up -- rename a debug build to `solclient.js`.

### 2. JSZip (`jszip.min.js`)

**What it is:** A JavaScript library for creating ZIP files in the browser. Used by the Queue Browser's "Download" feature.

**Where to get it:**

- CDN: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- NPM: `npm install jszip` (then copy `node_modules/jszip/dist/jszip.min.js`)
- Download from [https://stuk.github.io/jszip/](https://stuk.github.io/jszip/)

**Version compatibility:** **3.10.1 or newer is enforced.** An older build loads but is treated as not-loaded, so the Queue Browser's ZIP download stays disabled; everything else works.

**Placement:** Same as `solclient.js` -- place alongside the HTML file or under a sibling `js/` folder.

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

In Standalone mode, both connections go directly from the browser to the broker. In [Gateway mode](#gateway-mode) and Provisioned mode, the browser connects only to the gateway on `:9443`, and the gateway to the broker.

### CORS

If the Solace broker and the web app are served from different origins, the broker must allow CORS for SEMP requests. WebSocket connections are not subject to CORS restrictions. Behind the gateway, the broker needs no CORS setting.

### TLS/SSL

For `wss://` connections with self-signed certificates, the browser must trust the certificate. The app includes a helper dialog that guides the user through the trust process (Connections module > SSL Trust Modal).

---

## Configuration

All PWA configuration is done at runtime through the UI. There are no environment variables or config files for the PWA itself. (The gateway's own settings live in `config.yaml`, below.)

Connection profiles are stored in the browser's `localStorage`. They persist across browser sessions but are specific to the origin (protocol + host + port) where the app is served.

### Gateway configuration file

`config.yaml` holds every gateway setting. The variables under [Settings](#settings) seed it on the first start; the header it is written with maps every key to its variable. Keys that have no variable:

| Key | Default | Purpose |
| --- | --- | --- |
| `access.allow` | `[]` | CIDR list of clients allowed to reach the gateway at all. Empty means everyone. A denied client gets `403`, and the log names its address. |
| `access.trustedProxies` | `[]` | CIDR list of your reverse proxies. From one of them the client's address is taken from `X-Forwarded-For`; from any other peer that header is ignored. See [Client addresses behind Docker and proxies](#client-addresses-behind-docker-and-proxies). |
| `session.*`, `login.*`, `modules.*` | see [provisioned-mode.md](provisioned-mode.md#configure) | Provisioned mode only: session lengths, the sign-in limits and the modules users may be given. |

Missing keys take the built-in defaults, never an environment value; an unknown key, an empty file, a missing `version: 1` or a value out of range stops the start, naming the key and the value. `STORE_KEY_FILE` is never in the file. In Provisioned mode the admin console's Gateway Settings page edits this file too.

---

## Updating

To update a deployed instance:

- **GitHub Pages** -- nothing to do; redeployed automatically on every published Release.
- **Container** -- change the tag and recreate the container:

  ```bash
  SMU_VERSION=3.6.1 docker compose -f compose.gateway.yaml up -d
  ```

  Pin a full version (`:3.6.0`) in production rather than `:3.6`, `:3` or `:latest`. Provisioned mode uses the same tags.

  **From v3.3.5 or earlier:** `HOSTED` now defaults to `true`. A container started without `HOSTED=true` used to serve the files only, with browsers connecting to brokers themselves; it now connects to brokers for them, so put your brokers' CAs in `/tls/trust/` first, or set `HOSTED=false` to keep the old behaviour.

  **Files only no longer relays:** with `HOSTED=false` the gateway's relay paths (`/http/...`, `/https/...`, `/ws/...`, `/wss/...`) now answer `403`. The app never used them in that mode.

  **`APP_DIR` is no longer read:** the container always serves the app built into the image. A container that still sets `APP_DIR`, or a `config.yaml` that still has `appDir`, starts as before and logs a warning naming it; remove it. A save from the admin console's Gateway Settings drops the key from the file. If you used it to serve your own build, mount that build at `/SolaceMsgUtility` instead.

  **`CONFIG_FILE` is no longer read:** `config.yaml` has a fixed place in the container. A container that sets `CONFIG_FILE` to another file does not start, so that file's settings, the access list among them, are never dropped: the log names where `config.yaml` now lives. Move the file there and remove the variable.
- **Self-host** -- download the new `index.html` from the latest [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) and replace the file on your server; `SHA256SUMS.txt` on the same Release verifies it. The `solclient.js` and `jszip.min.js` files come from the `dist` branch and only need updating if you want a newer version of those libraries.
