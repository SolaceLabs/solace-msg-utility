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

The gateway image serves the app over HTTPS and connects to your brokers for it: browsers reach and trust only the gateway, never the brokers. It listens on `:9443` and runs as UID `65532`.

#### Choosing an image

| | Standard | Managed |
| --- | --- | --- |
| Image | `ghcr.io/solacelabs/solace-msg-utility:<tag>` | `ghcr.io/solacelabs/solace-msg-utility:managed-<tag>` |
| Connecting | Users type the broker's details (Direct) | Users sign in and pick from the brokers and Message VPNs an administrator granted ([Managed Mode](#managed-mode-rbac)) |
| Administration | None: settings live in `config.yaml` | Users, connections and settings in the admin app at `/solAdmin` |
| Kept on `/managed` | `config.yaml` | `config.yaml`, the users and connections stores, the store key |

**Tags.** Every release publishes `:<major>.<minor>.<patch>`, `:<major>.<minor>`, `:<major>` and `:latest`, and the managed image the same with a `managed-` prefix, for `linux/amd64` and `linux/arm64`. Pin a full version in production. The Release notes quote each image's digest, and a tag only ever moves to an image that passed the vulnerability scan.

#### Running the gateway

Both images include the two scripts the app loads, `solclient.js` (Solace's JavaScript messaging API) and `jszip.min.js`, with their licences under `/SolaceMsgUtility/licenses/`.

```bash
docker run --rm -p 9443:9443 \
  -e HOSTED=true \
  -v solace-tls:/tls \
  -v solace-config:/managed \
  ghcr.io/solacelabs/solace-msg-utility:latest
```

Then open <https://localhost:9443/>. For the managed image, see [Managed Mode](#managed-mode-rbac).

**Mounts:**

| Path | What |
| --- | --- |
| `/tls` | `tls.crt` and `tls.key`, the gateway's own certificate, and `trust/`, the CAs it trusts for broker connections. |
| `/managed` | Writable: `config.yaml`, and on the managed image the stores and the store key. Without a volume they are lost when the container is recreated. |
| `/SolaceMsgUtility` | The app and its two vendor scripts, baked in. Mount over it only to serve your own build, with both scripts beside it (`APP_DIR` moves it). |

Use named volumes: they take the image's UID `65532` ownership. A bind-mounted directory must already be owned by UID `65532`, or hold its files ready so the gateway never needs to write.

#### TLS and trusted CAs

- **The gateway's certificate:** put yours at `/tls/tls.crt` and `/tls/tls.key`. With neither, the gateway generates a self-signed one (`CN=localhost`, valid 365 days) on its first start and logs its SHA-256 fingerprint. A pair that does not load stops the start.
- **Brokers' certificates:** the gateway verifies every broker it connects to, and the image ships no root CAs. Put each CA your brokers' certificates chain to, a public root included, in `/tls/trust/` as a `*.crt` or `*.pem` file (`SSL_TRUST_DIR`). They are read at start, so restart after adding one. `SSL_INSECURE_SKIP_VERIFY=true` turns verification off: lab use only.

#### Settings

The gateway keeps its settings in `config.yaml` on the `/managed` volume. The variables below seed it on the first start, when the file does not exist; from then on the file wins, and each start logs a warning for every variable that differs from it. Edit the file and restart, or delete it to seed it again. A value the gateway cannot use stops the start, naming the key and the value. The keys with no variable are under [Gateway configuration file](#gateway-configuration-file).

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONFIG_FILE` | `/managed/config.yaml` | Where `config.yaml` lives. Read on every start, never stored in the file. |
| `HOSTED` | unset | `true` sends the app's broker connections through the gateway. Set it on the standard image; the managed image sets it. |
| `CONN_MODES` | `direct` | Which connection tabs the app offers: `direct`, `managed` or `both` (see [Managed Mode](#managed-mode-rbac)). |
| `DEFAULT_CONN` | `direct` | Which tab opens first under `both`: `direct` or `managed`. |
| `APP_DIR` | `/SolaceMsgUtility` | Where the app's files are. May be read-only. |
| `SSL_CERT_FILE` | `/tls/tls.crt` | The gateway's TLS certificate (PEM). Go also reads this variable to find a system CA bundle, so a container that sets it ignores any bundle mounted at Go's default path: add CAs through `SSL_TRUST_DIR`. |
| `SSL_KEY_FILE` | `/tls/tls.key` | Its private key (PEM). |
| `SSL_TRUST_DIR` | `/tls/trust` | The CAs trusted for broker connections (`*.crt`, `*.pem`); see [TLS and trusted CAs](#tls-and-trusted-cas). |
| `SSL_INSECURE_SKIP_VERIFY` | `false` | `true` skips verifying brokers' certificates, with a warning at start. Lab use only. |
| `LOG_LEVEL` | `warn` | `debug`, `info`, `warn` or `error`. |

#### In production

- **Health check:** the image has no shell, so it declares no `HEALTHCHECK`. Probe `https://<host>:9443/hosted` from outside (`200` while `HOSTED=true`), with the certificate pinned or verification off. A client access list must allow the prober.
- **Behind a reverse proxy:** pass the original `Host` header through, allow WebSocket upgrades, and list the proxy in `access.trustedProxies` so the gateway sees each client's own address.
- **Network:** browsers need to reach only the gateway; the gateway needs the brokers' SEMP and secured web messaging (`wss`) ports.
- **Stopping:** on `SIGTERM` the gateway finishes requests in flight for up to 10 seconds. A restart signs every managed user out.

### Managed Mode (RBAC)

Managed mode signs users in and gives them only the brokers and Message VPNs an administrator granted; they never see or type a broker's address or credentials. It runs only on the managed image. Every Release HTML file is Direct-only, except `managed-demo.html`, an offline demo with nothing to deploy.

The managed image already sets `HOSTED=true`, `MANAGED=true` and `CONN_MODES=managed`. Mount a writable `/managed` volume, and `/tls`:

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  -v solace-managed:/managed \
  ghcr.io/solacelabs/solace-msg-utility:managed-latest
```

#### Choosing which connection modes to offer

`CONN_MODES` decides what the Connections module shows, and it is the **only** control that makes the entitlement model binding:

| `CONN_MODES` | Connections module | Queue Copy destination credentials | Entitlements are... |
| --- | --- | --- | --- |
| `direct` (default) | Direct tab only | typed by the user | not in play: no managed session exists |
| `managed` | Managed tab only | **provisioned only** (pick a broker/VPN you are entitled to) | **binding**: this is the lockdown setting |
| `both` | both tabs, `DEFAULT_CONN` first | user chooses provisioned **or** typed | **advisory**: see the warning below |

> **`CONN_MODES=both` is a documented bypass.** A user can switch to the Direct tab and connect with any credentials they happen to know, entirely outside their entitlements, and a typed-credential Queue Copy destination is likewise ungated. Offer `both` only where that is acceptable (mixed audiences, migration periods). **If the entitlement model must hold, set `CONN_MODES=managed`.**

The gateway refuses to start when `CONN_MODES` offers managed sign-in on the standard image, or with `HOSTED` or `MANAGED` off.

**Managed variables** (they seed `config.yaml` on the first start like the ones above, except `STORE_KEY_FILE` and the two admin password variables, which are never written to it):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANAGED` | unset | `true` turns managed mode on. The managed image sets it. |
| `USERS_FILE` | `/managed/users.yaml` | The users store, encrypted with the store key. |
| `CONNECTIONS_FILE` | `/managed/connections.yaml` | The broker connections store, encrypted with the store key. |
| `STORE_KEY_FILE` | `/managed/store.key` | The key for both stores. Read on every start. |
| `ADMIN_PASSWORD` | unset | The first administrator's password, 12 to 128 characters. Read only on the first start; never logged. |
| `ADMIN_PASSWORD_FILE` | unset | A file holding that password (a Docker or Kubernetes secret). Set this or `ADMIN_PASSWORD`, not both. |

**First start:** the gateway creates one administrator, `admin`, with no broker access. Its password is `ADMIN_PASSWORD` (or the file's content); with neither, a generated one is printed **once** in the log. The first sign-in must change it, and nothing else works until then. Lost the generated one before signing in? Delete `users.yaml` and restart. Afterwards remove the variable; later starts warn while it is still set.

**Store key:** on a fresh `/managed` volume the gateway generates `store.key` and logs its path. **Back it up and keep it secret**: without it the users and connections cannot be read, and there is no recovery. The default puts it on the same volume as the stores; for more, point `STORE_KEY_FILE` at a separate mount or a secret (it may be read-only). The stores change only through the admin app. The gateway refuses to start, saying which file and why, when:

| Condition | Fix |
| --- | --- |
| The key is missing beside an existing store | Restore the key, or delete both store files to start over. |
| The key is unreadable, or not 64 hex characters | Restore the right file. On a fresh volume, make one with `head -c 32 /dev/urandom \| xxd -p -c 64`. `EACCES` means UID `65532` cannot read it. |
| A store is unencrypted, from an earlier release | Stores are not migrated: start on a fresh `/managed` volume and enter the users and connections again. |
| A store cannot be decrypted, or is damaged | The wrong key, or a damaged store: restore the matching pair from a backup. |

A key file other users can read is only warned about, because Docker secrets are mounted `0444`.

#### Administration app (`/solAdmin`)

Administrators manage users, broker connections and the gateway's settings at `https://<host>:9443/solAdmin`; other accounts are refused. Most settings apply at once; `hosted`, `managed` and `tls.insecureSkipVerify` apply at the next restart. The file paths change only by editing `config.yaml` on the host and restarting, and after any hand edit, restart before saving from the page.

To serve your own build of the managed app, put `managed.html` (as `index.html`) and `solAdmin.html` in `APP_DIR`. Neither is a Release asset.

#### Managed-mode security checklist

Managed mode is fit for **trusted-internal** use. Before exposing it:

- **Set `CONN_MODES=managed`** unless you need Direct alongside it (see above).
- **Give each broker a read-only SEMP account** scoped to what its users may see: a user entitled to one Message VPN on a broker can read whatever that account can.
- **Give each Message VPN a client username** scoped to what its users may do: an entitled user's browser receives its password to connect, and it works outside the app too. Keep the brokers' own ports off networks users can reach.
- **Change the `admin` password right after the first start**, and remove `ADMIN_PASSWORD` from the environment.
- **Protect the stores and the store key** with filesystem permissions, and keep the key on a separate mount or secret where you can.
- **Restrict who can reach the gateway** with `access.allow`, and behind a reverse proxy set `access.trustedProxies` (see [Gateway configuration file](#gateway-configuration-file)). Someone guessing at a known username can lock it out for up to `login.maxBackoffSeconds`; the access list or a VPN in front is the answer.
- **Treat administrator accounts as privileged.** They edit entitlements, the access list and sign-in itself; each settings save logs a warning naming the administrator.

### Self-host the static files

The simplest deployment without Docker. `index.html` is attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) the tag pipeline creates (alongside the other bundle variants and a `SHA256SUMS.txt` to verify them); releases up to v3.3.4 predate the pipeline and carry no assets. The newest is always at a stable URL, so a script can fetch it directly — keep `-f`, so a failed download is an error instead of a saved error page:

```bash
curl -fLO https://github.com/SolaceLabs/solace-msg-utility/releases/latest/download/index.html
```

The two vendor libraries are not release assets — they are not committed to `main` — so take those from the `dist` branch of this repo:

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

The PWA loads two external scripts via `<script>` tags. They are not bundled into the HTML: wherever you host an HTML file yourself, put both next to it. The container images already include both, from the exact versions `package.json` pins, with their licence files under `licenses/`. The same requirement applies to `min.html`, `mock.html`, `no-payload.html`, and `no-queue-copy.html`; every variant of the PWA expects the two vendor files next to it. `managed.html` (the managed image's `index.html`) needs them too. `solAdmin.html` uses none of what those files provide (it never opens a broker connection and has no ZIP export), but it is built from the same shell, so it still runs the vendor loader and will show the "not found" banner if they are absent.

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
- NPM: `npm install solclientjs` (then copy `node_modules/solclientjs/lib-browser/solclient.js`, the browser build)

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

In the Hosted PWA and Self-host paths, both connections go directly from the browser to the broker. Behind the [gateway](#containerised-gateway), the browser connects only to the gateway on `:9443`, and the gateway to the broker.

### CORS

If the Solace broker and the web app are served from different origins, the broker must allow CORS for SEMP requests. WebSocket connections are not subject to CORS restrictions. Behind the gateway, the broker needs no CORS setting.

### TLS/SSL

For `wss://` connections with self-signed certificates, the browser must trust the certificate. The app includes a helper dialog that guides the user through the trust process (Connections module > SSL Trust Modal).

---

## Configuration

All PWA configuration is done at runtime through the UI. There are no environment variables or config files for the PWA itself. (The gateway's own settings live in `config.yaml`, below.)

Connection profiles are stored in the browser's `localStorage`. They persist across browser sessions but are specific to the origin (protocol + host + port) where the app is served.

### Gateway configuration file

`config.yaml` (default `/managed/config.yaml`) holds every gateway setting. The variables under [Settings](#settings) seed it on the first start; the header it is written with maps every key to its variable. Keys that have no variable:

| Key | Default | Purpose |
| --- | --- | --- |
| `access.allow` | `[]` | CIDR list of clients allowed to reach the gateway at all. Empty means everyone. A denied client gets `403`, and the log names its address. |
| `access.trustedProxies` | `[]` | CIDR list of your reverse proxies. From one of them the client's address is taken from `X-Forwarded-For`; from any other peer that header is ignored. |
| `session.idleMinutes` | `10` | Managed sign-in: a session ends after this long without a request to the gateway. 1 to `session.absoluteMinutes`. |
| `session.absoluteMinutes` | `30` | Managed sign-in: a session ends this long after sign-in, however busy. 1 to 1440. |
| `login.maxFailures` | `5` | Failed sign-ins per username, and per client, before the back-off starts. 1 to 1000. |
| `login.backoffSeconds` | `30` | First back-off; it doubles with each further failure. 1 to `login.maxBackoffSeconds`. |
| `login.maxBackoffSeconds` | `900` | Longest back-off. 1 to 86400. |
| `login.unauthenticatedPerMinute` | `60` | Requests without a session that one client may make per minute. 1 to 10000. |
| `modules.offered` | `[queue-browser, queue-copy]` | Managed: the app modules a managed user may be given; only those two can be. Queue Subscription Explorer and Queue Discovery are hidden in every managed session. `[]` offers none, leaving Connections alone. |
| `modules.userDefault` | `all` | Managed: what a user without a `modules` list of their own in `users.yaml` gets, `all` (every offered module) or `none`. |

`session.*`, `login.*` and `modules.*` apply only to a managed gateway, where the admin app's Gateway Settings page edits this file too (see [Administration app](#administration-app-soladmin)). Missing keys take the built-in defaults, never an environment value; an unknown key, an empty file, a missing `version: 1` or a value out of range stops the start, naming the key and the value. `CONFIG_FILE` and `STORE_KEY_FILE` are never in the file. The managed image sets `MANAGED`, `HOSTED` and `CONN_MODES` in its environment, so once those keys are changed in the file, each start reports the image's values as ignored, which is expected.

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
