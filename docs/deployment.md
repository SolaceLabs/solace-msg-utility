# Deployment Guide

For operators who run the prebuilt app: on a web server, on GitHub Pages, or from the container image. It helps you pick a mode, then covers each one: what to run, what to mount, which variables and keys the gateway reads, what the network must allow, and how to update. To build from source, see [developer-guide.md](developer-guide.md). For Provisioned mode in depth (sign-in, users, backups, the audit trail), see [provisioned-mode.md](provisioned-mode.md).

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
  - [Trusting the host's CA store](#trusting-the-hosts-ca-store)
  - [Settings](#settings)
  - [Variables and keys the gateway refuses or ignores](#variables-and-keys-the-gateway-refuses-or-ignores)
  - [In production](#in-production)
  - [Serving your own build](#serving-your-own-build)
  - [Client addresses behind Docker and proxies](#client-addresses-behind-docker-and-proxies)
  - [Logs](#logs)
- [Provisioned mode](#provisioned-mode)
- [Files you can download](#files-you-can-download)
- [Vendor libraries](#vendor-libraries)
  - [solclient.js](#solclientjs)
  - [jszip.min.js](#jszipminjs)
  - [Graceful degradation](#graceful-degradation)
- [Network Requirements](#network-requirements)
  - [CORS](#cors)
  - [TLS/SSL](#tlsssl)
- [Configuration](#configuration)
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

One image serves both container modes: Gateway mode by default, Provisioned mode when you set `SMU_CONN_MODES`. The demos are offline: see [demo.md](demo.md).

---

## Standalone mode

The app talks to your broker directly from the browser; there is no proxy in this path. Your broker must be:

- **Network-reachable** from wherever the browser runs.
- **Configured to allow CORS** for SEMP requests from the page's origin (WebSocket connections are not subject to CORS).

If your broker uses a self-signed certificate, the app's SSL Trust dialog walks you through trusting it. See [TLS/SSL](#tlsssl).

### GitHub Pages (zero install)

Open <https://solacelabs.github.io/solace-msg-utility/> in a browser. It is published from this repo by the tag workflow and always serves the newest release: it is redeployed once that release's GitHub Release is published, and a fix released for an older version leaves it as it is. Allow CORS for SEMP from `https://solacelabs.github.io`.

### Self-host the static files

The simplest deployment without Docker. `index.html` is attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) the tag pipeline creates (alongside the other bundle variants, listed under [Files you can download](#files-you-can-download), and a `SHA256SUMS.txt` to verify them). The newest is always at a stable URL, so a script can fetch it directly -- keep `-f`, so a failed download is an error instead of a saved error page:

```bash
curl -fLO https://github.com/SolaceLabs/solace-msg-utility/releases/latest/download/index.html
```

The two vendor libraries are not release assets -- they are not committed to `main` -- so take those from the `dist` branch of this repo:

```text
your-server/
  index.html         # PWA
  solclient.js       # Solace SDK (see [Vendor libraries](#vendor-libraries))
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

Each page carries its own Content-Security-Policy: it runs only its own scripts and the two vendor libraries beside it, and connects only to brokers. If your web server adds a `Content-Security-Policy` header, the browser enforces it as well, so a header can narrow the page but never widen it. Keep a header to what the page leaves open, such as `frame-ancestors` or a `connect-src` that names your brokers: a header that limits scripts or styles stops the page. Do not edit a page either: its policy names its scripts by their hashes, and an edited script does not run.

### Embed in Solace Broker Web UI

Some Solace broker deployments allow hosting custom web pages. Place the three files in the broker's web server directory.

### Local file (dev exploration only)

You can open `index.html` directly in a browser via `file:///...`, but **SEMP API calls will fail** under the `file://` origin due to CORS. Use a local HTTP server (above) for actual use. This is a debugging shortcut, not a deployment path.

### From the container

The image can also serve the files alone: with `SMU_HOSTED=false` it serves the app over HTTPS and nothing else (the relay paths answer `403`), and browsers connect to brokers themselves, as with any web server. The page being HTTPS, the app then offers only `wss://` and `https://`: a browser blocks unencrypted connections from an HTTPS page. Provisioned mode needs `SMU_HOSTED` left at its default, `true`.

---

## Gateway mode

The image serves the app over HTTPS and connects to your brokers for it: browsers reach and trust only the gateway, never the brokers. Users type their broker's details, as in Standalone mode. It listens on `:9443` and runs as UID `65532`.

### Quick start

[`compose.gateway.yaml`](../docker/compose.gateway.yaml) is a ready-made deployment, locked down (non-root, read-only, no capabilities). Download it from the [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) you deploy (`SHA256SUMS.txt` on the same Release verifies it), or use `docker/` in a checkout of that release's tag, and run it from its folder:

```bash
SMU_VERSION=4.0.0 docker compose -f compose.gateway.yaml up -d
```

Or with `docker run`:

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  ghcr.io/solacelabs/solace-msg-utility:4.0.0
```

Then open <https://localhost:9443/>.

### Image and tags

`ghcr.io/solacelabs/solace-msg-utility` serves every container mode. Every release publishes `:<major>.<minor>.<patch>`, `:<major>.<minor>` and `:<major>`, for `linux/amd64` and `linux/arm64`; `:latest` moves only to the highest release, so a fix released for an older version leaves it. Pin a full version in production. The Release notes quote the image's digest, and a tag only ever moves to an image that passed the vulnerability scan.

The image includes the two scripts the app loads, `solclient.js` (Solace's JavaScript messaging API) and `jszip.min.js`, with their licences. It also carries the licence notices of the Go code compiled into the gateway binary: Go's own (BSD-3-Clause), `gopkg.in/yaml.v3` (Apache-2.0 and MIT, with its `NOTICE`) and `rsc.io/qr` (BSD-3-Clause), and the notice of the standard root CA list (MPL-2.0). All of them sit under `/SolaceMsgUtility/licenses/` (`solclientjs/`, `jszip/`, `go/`, `gopkg.in-yaml.v3/`, `rsc.io-qr/`, `ca-certificates/`); the build copies them from the toolchain's module cache and fails if one is missing, and `tests/build/vendor-scripts.test.ts` fails when a direct requirement in `go.mod` has no licence copied.

The image is built `FROM scratch` and runs as UID `65532`. It holds:

| Path | Holds |
| --- | --- |
| `/gateway` | The version-stamped gateway binary, the entrypoint, listening on `:9443`. |
| `/tls` | The certificate, key and trusted CAs; see [Mounts](#mounts). |
| `/data` | `config.yaml` in every mode. In Provisioned mode also the encrypted `users.yaml`, `connections.yaml` and `backup.yaml`, `store.key`, and the audit trail `audit.log` with its rotated `audit.log.1` to `.50`. The compose files mount a named volume here; a `docker run` without one keeps it inside the container, and the next container seeds `config.yaml` from the environment again. |
| `/backup` | Provisioned mode: the scheduled backups. |
| `/etc/ssl/certs/ca-certificates.crt` | The standard root CAs, read-only; see [TLS and trusted CAs](#tls-and-trusted-cas). |
| `/SolaceMsgUtility` | The bundles the gateway serves (`index.html`, `provisioned.html`, `solAdmin.html`), `solclient.js`, `jszip.min.js` and the licences under `licenses/`. |

Which bundle is served at `/`: `index.html` in Gateway mode, `provisioned.html` in Provisioned mode. `solAdmin.html` is reached only at `/solAdmin`, behind the admin gate; asking for `solAdmin.html` or `provisioned.html` by name answers `404`.

### Mounts

| Path | What |
| --- | --- |
| `/tls` | `tls.crt` and `tls.key`, the gateway's own certificate, and `trust/`, the CAs it trusts for broker connections. Mount it writable and an administrator can replace the certificate and add or delete CA files from the admin console (Provisioned mode); mount it read-only and the console only shows them. See [TLS and trusted CAs](#tls-and-trusted-cas). |
| `/etc/ssl/certs/ca-certificates.crt` | Optional, read-only: the host's CA bundle, in place of the standard root CAs the image carries. See [Trusting the host's CA store](#trusting-the-hosts-ca-store). |
| `/backup` | Provisioned mode only: the scheduled backups, each encrypted with its own passphrase. Mount a host directory owned by UID `65532` to keep them; see [Back up and restore](provisioned-mode.md#back-up-and-restore). |

Use named volumes: they take the image's UID `65532` ownership. A bind-mounted directory must already be owned by UID `65532`, or hold its files ready so the gateway never needs to write.

### TLS and trusted CAs

- **The gateway's certificate:** put yours at `/tls/tls.crt` and `/tls/tls.key`. A pair that does not load stops the start, and so does half a pair (only the key, or only the certificate): the gateway never writes over a file it did not make. Add the missing file, or remove the one that is there. With neither, the gateway generates a self-signed **bootstrap** pair (`CN=localhost`, valid **7 days**) on its first start and logs its SHA-256 fingerprint. It is a convenience for the first sign-in only: it is never renewed, and once it expires browsers refuse it, so put your own certificate in place before then. Every start warns (at `warn`, with the date) about a certificate that has expired or expires within 30 days, the bootstrap pair included.
- **Brokers' certificates:** the gateway verifies every broker it connects to. The image carries the standard root CAs (Mozilla's list, as Alpine packages it) at `/etc/ssl/certs/ca-certificates.crt`, and trusts them while `SMU_SSL_STANDARD_ROOTS` (the `tls.standardRoots` setting) is `true`, the default: a broker whose certificate comes from a public CA needs nothing more. The list is the one the release was built with and changes only with a new image, unless you mount the host's list in its place (see [Trusting the host's CA store](#trusting-the-hosts-ca-store)). Put every other CA your brokers' certificates chain to (a private CA, or a public root when the standard roots are off) in `/tls/trust/` as a `*.crt` or `*.pem` file (`SMU_SSL_TRUSTDIR`). The directory is read at start and again after every add or delete made from the admin console; a file you drop in by hand is picked up at the next start, or at the next add or delete. `SMU_SSL_SKIP_CERT_VERIFY=true` turns verification off: lab use only.
- **The three paths are environment only.** `SMU_SSL_CERTFILE` (default `/tls/tls.crt`), `SMU_SSL_CERTKEYFILE` (default `/tls/tls.key`) and `SMU_SSL_TRUSTDIR` (default `/tls/trust`) are read at every start. They are not settings: `config.yaml` has no key for them, the admin console shows no field for them, and changing one takes a restart of the container. A `config.yaml` that holds `tls.certFile`, `tls.keyFile` or `tls.trustDir` still starts; see [Variables and keys the gateway refuses or ignores](#variables-and-keys-the-gateway-refuses-or-ignores).
- **Managing them from the console (Provisioned mode).** The admin console's **Certificates** page shows the gateway's certificate and the trusted CA files, and can replace the certificate and add or delete CA files, if the gateway can write them: a writable `/tls`, the certificate and its key in one directory (a bind-mounted single file cannot be replaced, so mount the directory). A certificate and key are verified before anything is written. Every change applies at once with no restart: new connections to the gateway present the new certificate (open ones keep the old), and the next connection to a broker uses the new CA list. To lock it, mount `/tls` read-only (`:ro`): the page still shows everything and its actions are disabled. See [Certificates from the console](provisioned-mode.md#certificates-from-the-console).

### Trusting the host's CA store

To trust the CAs the host trusts, its distribution's list and any private CA its administrator added to it, mount the host's CA bundle read-only over the image's, at `/etc/ssl/certs/ca-certificates.crt`. The path is fixed; no variable moves it. The gateway then uses the host's list in place of the image's:

- It is read at every start, the admin console's **Restart gateway** included. A change on the host (a new private CA, an updated list) applies at the next start.
- It counts only while `SMU_SSL_STANDARD_ROOTS` (`tls.standardRoots`) is `true`, the default. The CA files in `/tls/trust/` are trusted as well.
- In Provisioned mode the Certificates page lists what was read, in its **Standard root CAs** card. A file the gateway cannot read, or one with no certificate in it, does not stop the start: the card and the start log say so, and only `/tls/trust/` is trusted.
- The file must be PEM certificates, readable by UID `65532`. The hosts' own bundles are both.

Where the host keeps its bundle:

| Host | Bundle |
| --- | --- |
| Debian, Ubuntu, Alpine | `/etc/ssl/certs/ca-certificates.crt` |
| RHEL, Fedora, Rocky, AlmaLinux, Amazon Linux | `/etc/pki/tls/certs/ca-bundle.crt` |
| openSUSE, SLES | `/etc/ssl/ca-bundle.pem` |
| macOS, Windows (Docker Desktop) | No single file. Export the CAs you need into one PEM file and mount that. |

With `docker run`, use `--mount`: it stops with an error when the host file does not exist, where `-v` creates a directory in its place.

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  --mount type=bind,src=/etc/ssl/certs/ca-certificates.crt,dst=/etc/ssl/certs/ca-certificates.crt,readonly \
  ghcr.io/solacelabs/solace-msg-utility:4.0.0
```

With `compose.gateway.yaml` or `compose.provisioned.yaml`, add an entry to the gateway service's `volumes:`:

```yaml
      - type: bind
        source: /etc/ssl/certs/ca-certificates.crt
        target: /etc/ssl/certs/ca-certificates.crt
        read_only: true
        bind:
          create_host_path: false
```

Use your host's path from the table as `src` or `source`.

### Settings

The gateway keeps its settings in `/data/config.yaml`, a file it writes itself: never write or edit it by hand. On the first start, when the file does not exist, the gateway writes it from the variables below (a path it cannot write stops the start). From then on the file wins, and each start logs a warning for every variable that differs from it. To apply a changed variable in Gateway mode, remove `/data/config.yaml` and start again, and the gateway seeds it from the variables. (A volume that has only ever run Gateway mode holds nothing else, so removing the volume does the same. One that has run Provisioned mode also holds the users, the connections, the store key and the audit trail: remove only the file there.) In Provisioned mode an administrator changes the settings on the admin console's Gateway Settings page and carries them between deployments with Backup & Restore: see [provisioned-mode.md](provisioned-mode.md#configure). A value the gateway cannot use stops the start, naming the key and the value. Three more variables are read at every start, never seeded into the file: `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE` and `SMU_SSL_TRUSTDIR`, the gateway's certificate, its key and the trusted CA directory (defaults `/tls/tls.crt`, `/tls/tls.key`, `/tls/trust`; see [TLS and trusted CAs](#tls-and-trusted-cas)). Every gateway variable except `LOG_LEVEL` carries the `SMU_` prefix.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMU_HOSTED` | `true` | `true` sends the app's broker connections through the gateway (Gateway and Provisioned mode). `false` serves the files only, and browsers connect to brokers themselves, over `wss://` and `https://` only; the gateway refuses to relay (`403`). Any other value stops the start. |
| `SMU_CONN_MODES` | `direct` | Which connection tabs the app offers: `direct` (Gateway mode), `provisioned` or `both` (Provisioned mode; see [provisioned-mode.md](provisioned-mode.md)). |
| `SMU_DEFAULT_CONN` | `direct` | Which tab opens first under `both`: `direct` or `provisioned`. |
| `SMU_SSL_STANDARD_ROOTS` | `true` | `true` also trusts the standard root CAs the image carries when it verifies a broker (the `tls.standardRoots` setting); `false` trusts only the CA files in `/tls/trust`. A live setting: in Provisioned mode it changes on Gateway Settings and applies at once, with no restart. Any value other than `true` or `false` stops the start. |
| `SMU_SSL_SKIP_CERT_VERIFY` | `false` | `true` skips verifying brokers' certificates (the `tls.insecureSkipVerify` setting), with a warning whenever it becomes true. Lab use only. A live setting: in Provisioned mode it changes on Gateway Settings and applies at once, with no restart. Any value other than `true` or `false` stops the start. |
| `SMU_SHOW_AUDIT` | `false` | Provisioned mode: `true` also copies each audit line to standard output (the `audit.stdout` setting). The audit trail itself is always written to `/data/audit.log` and never filtered by `LOG_LEVEL`; see [provisioned-mode.md](provisioned-mode.md#audit-trail). Any value other than `true` or `false` stops the start. |
| `LOG_LEVEL` | `warn` | `debug`, `info`, `warn` or `error`. See [Logs](#logs). |

The client access list and the trusted reverse proxies have no variable: an administrator sets them on Gateway Settings, in Provisioned mode. Gateway mode has no page to set them on, so limit who can reach a Gateway-mode gateway with your network (a firewall, or a reverse proxy in front of it). A list the gateway's settings already hold is enforced in either mode.

### Variables and keys the gateway refuses or ignores

Some names an older deployment may still carry are not settings. Each one is handled the same way every time, so a deployment that carries one knows what happens:

| Name | What happens | What to do |
| --- | --- | --- |
| Environment variables `SSL_CERT_FILE`, `SSL_KEY_FILE`, `SSL_TRUST_DIR`, `SSL_INSECURE_SKIP_VERIFY`, `HOSTED`, `CONN_MODES`, `DEFAULT_CONN`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_FILE` | Refused. The start stops with one error that lists each of these found and the name to use instead, never a value. (Go itself reads `SSL_CERT_FILE` as its CA bundle, so an unprefixed name would silently replace the gateway's trust pool.) | Set the `SMU_` name with the same value: `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE`, `SMU_SSL_TRUSTDIR`, `SMU_SSL_SKIP_CERT_VERIFY`, `SMU_HOSTED`, `SMU_CONN_MODES`, `SMU_DEFAULT_CONN`, `SMU_ADMIN_PASSWORD`, `SMU_ADMIN_PASSWORD_FILE`. |
| `CONFIG_FILE` naming a file other than `/data/config.yaml` | Refused: the start stops and the log names where `config.yaml` lives, so that file's settings (the access list among them) are never dropped unseen. | Move the file to `/data/config.yaml` and remove the variable. Naming that same file only logs a warning. |
| `APP_DIR` (variable) or `appDir` (key) | The gateway starts, logs a warning naming it, and ignores it. A settings save from the console drops the key from the file. | To serve your own build, mount it at `/SolaceMsgUtility` ([Serving your own build](#serving-your-own-build)). |
| `USERS_FILE`, `CONNECTIONS_FILE`, `STORE_KEY_FILE` (variables), `usersFile`, `connectionsFile` (keys) | The gateway starts, logs a warning naming it, and ignores it. The key is dropped the next time the gateway writes the file. The stores and the key are always `/data/users.yaml`, `/data/connections.yaml` and `/data/store.key`. | To move data, use Backup and Restore ([provisioned-mode.md](provisioned-mode.md#back-up-and-restore)). |
| `tls.certFile`, `tls.keyFile`, `tls.trustDir` in `config.yaml` | The file loads and the keys are ignored; one warning at start names each whose value differs from the path in use. The next settings save drops them. A backup that holds them imports, and they are ignored there too. | Set `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE` and `SMU_SSL_TRUSTDIR` instead. |
| Any other unknown key, an empty `config.yaml`, a version other than `1`, or a value out of range | Refused: the start stops, naming the key and the value. | Remove the file so the gateway seeds it again from the variables. In Provisioned mode the settings made in the console then start again at their defaults: see [Stored files and recovery](provisioned-mode.md#stored-files-and-recovery). |

### In production

- **Health check:** the image has no shell, so it declares no `HEALTHCHECK`. Probe `https://<host>:9443/hosted` from outside (`200` while `SMU_HOSTED=true`; `503` once the app bundle cannot be served, say a mounted build went away), with the certificate pinned or verification off. In Provisioned mode, a client access list must allow the prober.
- **Paths the gateway does not serve:** there is no history-mode fallback, because the app has no client-side routes and the bundle's relative vendor paths (`solclient.js`, `jszip.min.js`) only resolve at `/` and `/solAdmin`. An unknown path (`/a/b`, a missing file, or `/login/` and `/login` in Gateway mode) answers `404` and is never redirected, so a browser cannot keep a redirect for a path the gateway serves later. `/solAdmin/` is the one alias: it answers `308` to `/solAdmin` where the admin route is enabled (`404` where it is not). A directory under the app directory without an `index.html` (for example `/licenses/`) is never listed: `404`. In Provisioned mode the session gate still answers first: a visitor without a session is sent to `/login` whatever the path.
- **Headers:** with the app pages (`/`, `/solAdmin`) the gateway sends a Content-Security-Policy on top of the page's own, `frame-ancestors 'none'; connect-src 'self'`: no other site can frame the app, and the page connects only to the gateway. It also sends `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff` with every file. A reverse proxy may add headers, but must pass these through.
- **Behind a reverse proxy:** pass the original `Host` header through, allow WebSocket upgrades, pass the request path through as it came (in nginx, a `proxy_pass` with no path after the address: one with a path decodes `%2F`, and a Message VPN or queue whose name holds a `/` then cannot be reached), and in Provisioned mode list the proxy under Trusted reverse proxies on Gateway Settings (`access.trustedProxies`) so the gateway sees each client's own address. See [Client addresses behind Docker and proxies](#client-addresses-behind-docker-and-proxies).
- **Network:** browsers need to reach only the gateway; the gateway needs the brokers' SEMP and web messaging ports. In Gateway mode the user picks `https`/`wss` or `http`/`ws` per connection; in Provisioned mode each stored connection uses TLS (`https` for SEMP, `wss` for messaging) unless an administrator gave it the plain scheme (`http`, `ws`).
- **Stopping:** on `SIGTERM` the gateway finishes requests in flight for up to 10 seconds. A restart signs every Provisioned user out.
- **Restarting from the console:** in Provisioned mode an administrator can press **Restart gateway** on Gateway Settings. The gateway shuts down as for `SIGTERM` and starts its own program again in the same container, with the same arguments and environment, so the container and its volumes stay. If it cannot start itself again it logs why and exits with status 1, and the container's restart policy (`restart: unless-stopped` in the compose files) takes over. A platform that has no in-place start (a non-Unix build) exits with status 0 instead.

### Serving your own build

Mount it over `/SolaceMsgUtility`, with the bundles the mode serves (`index.html` in Gateway mode, `provisioned.html` in Provisioned mode, and `solAdmin.html` for the admin console) and both vendor scripts beside them, as the build wrote them: each bundle's policy names its scripts by their hashes, so an edited bundle does not run. The mount may be read-only. The path is not configurable. Without the mode's bundle the gateway does not start, and the log names the file.

### Client addresses behind Docker and proxies

The gateway keys three things on the client's address: the access list (`access.allow`), the per-client sign-in failure count and the per-client budget for requests without a session (`login.*`). It takes that address from the TCP connection, unless the connection comes from a proxy listed in `access.trustedProxies`; then it takes the rightmost address in `X-Forwarded-For` that is not itself a listed proxy. When something between the browsers and the gateway hides their addresses, every user looks like that one address: the access list can only allow or deny all of them, and one user's failed sign-ins throttle everyone. The failure count and the request budget exist only in Provisioned mode, which is also where an administrator sets the access list and the trusted proxies, on Gateway Settings. A Gateway-mode gateway whose settings hold no access list uses the address only in its log and in what it tells the brokers.

The gateway passes that address on to the brokers. Every SEMP request and messaging socket it relays, through the Direct relay or the Provisioned relay, carries it in `X-Forwarded-For` and in the `Forwarded` header (`for=192.0.2.10`; an IPv6 address as `for="[2001:db8::1]"`). An address the gateway could not read is sent as `Forwarded: for=unknown`, with no `X-Forwarded-For`. Whatever the browser sent in `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host` or `X-Forwarded-Proto` is dropped, so a browser cannot name another address to a broker.

- **A reverse proxy** (nginx, Traefik, a load balancer): list its address, or its network, under Trusted reverse proxies on Gateway Settings (`access.trustedProxies`), and have it set `X-Forwarded-For`. Never list a range browsers can connect from: a listed address can claim to be any client.
- **Docker's port forwarding:** depending on how the port is published, the container may see one address for every client. Docker Desktop (Mac, Windows), rootless Docker with its builtin port driver, and Docker's userland proxy (`docker-proxy`, which carries connections to `localhost` on the host, and every connection when Docker does not manage the host's firewall rules) hand the gateway each connection from their own address, such as the bridge gateway `172.17.0.1`. A Linux host where Docker forwards the port through its firewall rules keeps the browsers' addresses, and so does `--network host`. Do not list that address in `access.trustedProxies` to work around it: no `X-Forwarded-For` comes through these, so nothing changes, and anything else on that network could then claim to be any client.
- **Podman:** how it publishes a port decides it, as with Docker. Rootful Podman forwards through netavark's firewall rules and keeps the browsers' addresses. Rootless Podman on a bridge network, which is what the compose files create, shows one address for every client: its `rootlessport` forwarder relays each connection, so the gateway sees the forwarder's address. Rootless Podman with `--network pasta` keeps the addresses of connections that come from other machines, and `--network host` keeps them too. As with Docker, listing the forwarder's address in `access.trustedProxies` changes nothing, because no `X-Forwarded-For` comes through it. For a deployment that cannot keep the addresses, turn off `login.perClient` (see [Sessions and sign-in](provisioned-mode.md#sessions-and-sign-in)), so one user's failed sign-ins do not slow everyone down.
- **How to check:** in Provisioned mode the admin console's Gateway Settings page, under Access, shows one line: "Your address as the gateway sees it: <ip>" (the page reads it from `GET /managed/client`). It ends in one of three ways. `(the TCP peer)`: the gateway took the connection's own address. `(from X-Forwarded-For, sent by the trusted proxy <peer>)`: a proxy listed in `access.trustedProxies` decided it. `unknown`: the connection came from <peer> and its X-Forwarded-For header could not be read. If the line shows a proxy's or Docker's address (for example the bridge gateway 172.17.0.1) instead of your own, every user looks like that address. Behind a reverse proxy: list the proxy in `access.trustedProxies` (Gateway Settings, Trusted reverse proxies) and have it pass `X-Forwarded-For`, then reload the page; the line should now show your address and the proxy as the sender. Behind Docker's port forwarding no header comes through, so listing the address does not help: publish the port so Docker or Podman keeps the client address (see above). With `LOG_LEVEL=info` each request line names the client, and when the last 50 sign-ins all came from one private address the gateway logs a warning that says so.

### Logs

The gateway logs to standard error, one `key=value` line per event, at the level `LOG_LEVEL` sets (the `logLevel` setting, which in Provisioned mode changes live on Gateway Settings):

- **error:** something failed and needs attention: a start that cannot proceed, a request the gateway could not serve (a handler that crashed is answered `500` and logged here, with its stack trace on the same line), a failed backup.
- **warn:** a recoverable problem: a denied client, a burst of failed sign-ins, a broker the relay could not reach, a full throttle table, a setting that is ignored.
- **info:** what happened: each request (with the resolved client and the signed-in user), sign-ins, dials, every administrator's change to users, connections and settings, backups written, imports and exports.
- **debug:** traces.

Provisioned mode also keeps an [audit trail](provisioned-mode.md#audit-trail) of who did what, in `/data/audit.log`, apart from this log and never filtered by `LOG_LEVEL`; `SMU_SHOW_AUDIT=true` copies it to standard output.

Each line names its `component` and what it concerns (`user`, `client`, `broker`, `vpn`, `path`, `target`); no password or key is ever logged, except the first administrator's generated password, once, in Provisioned mode (see [provisioned-mode.md -> Start it](provisioned-mode.md#start-it); the standard is in [developer-guide.md -> Logging standard](developer-guide.md#logging-standard)). One line, `gateway starting`, is written at every level: the version, the mode, the files, the access list, the trusted proxies, the TLS settings and, in Provisioned mode, the sign-in and session limits the gateway runs with.

---

## Provisioned mode

Users sign in and get only the brokers and Message VPNs an administrator granted. It is the same image with `SMU_CONN_MODES=provisioned`, and everything under [Gateway mode](#gateway-mode) applies to it too. The ready-made deployment is [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml); how it works, how to configure it and the recommended values are in [provisioned-mode.md](provisioned-mode.md).

---

## Files you can download

Every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) carries these HTML files, each self-contained for the app code (CSS and JS inlined). All are Direct-only (Standalone and Gateway mode) except `provisioned-demo.html`. `index.html` is also what GitHub Pages and the image serve in Gateway mode. In Provisioned mode the image serves its own bundle, `provisioned.html` (standard plus the Provisioned sign-in), at `/` and `solAdmin.html` at `/solAdmin`; neither is a Release download. A Release also carries the two ready-made deployments of the image, `compose.gateway.yaml` ([Gateway mode](#gateway-mode)) and `compose.provisioned.yaml` ([provisioned-mode.md](provisioned-mode.md#start-it)), and `SHA256SUMS.txt` over every file.

| File | Variant | Use |
| --- | --- | --- |
| `index.html` | Standard (default) | Production: every module (Connections, Queue Browser, Queue Copy, Queue Subscriptions). |
| `min.html` | Minimal | Connections and Queue Browser only. A smaller bundle where copy, move and the subscription browser are not needed. |
| `no-payload.html` | No-payload | Standard, except the Queue Browser never shows or exports a message body: Content Preview, Show Raw Content, Copy Content, Download Content, Download Full and the Body-Content filter are removed. Forward, Delete, all metadata and the other filters remain. For deployments where operators must not see message bodies. |
| `no-queue-copy.html` | No Queue Copy | Standard, minus Queue Copy. For deployments where operators may browse and forward but never bulk-copy between queues. |
| `demo.html` | Standard plus demo broker | Interactive demo ([demo.md](demo.md#direct-demo-demohtml)). |
| `provisioned-demo.html` | Provisioned, admin pages and demo gateway | Provisioned mode with no gateway and no broker; it makes no network request ([demo.md](demo.md#provisioned-demo-provisioned-demohtml)). |

Every variant needs the two [vendor libraries](#vendor-libraries) next to it. To build a variant yourself, see [developer-guide.md](developer-guide.md).

---

## Vendor libraries

The app loads two external scripts through `<script>` tags. They are not bundled into the HTML: wherever you host an HTML file yourself, put both next to it. The image already includes both, from the exact versions `package.json` pins, with their licence files under `licenses/`. The same applies to every variant above and to `provisioned.html`. `solAdmin.html` uses neither (it never opens a broker connection and has no ZIP export), so `/solAdmin` needs neither file.

The shell tries each file in two locations, in order:

1. The same directory as the HTML (for example `solclient.js` next to `index.html`).
2. A sibling `js/` subfolder (for example `js/solclient.js`).

The first file that loads wins. The shell shows a banner at the top of the page: a neutral "Loading the Solace library..." from the start, gone when the SDK loads; if nothing settles within 30 seconds it reads "The Solace library did not finish loading. Check that solclient.js is next to this page." A `solclient.js` that loads but defines no `window.solace` is treated as not found (the `js/` location is then tried). Only these two names are tried: rename a debug build to `solclient.js` rather than dropping it in as `solclient-debug.js`. The same two files serve every variant; no separate copy per variant.

### solclient.js

The Solace PubSub+ Web Messaging API for JavaScript, which carries the WebSocket traffic to the brokers. Required for any broker connection.

**Where to get it:**

- Download from the [Solace Developer Portal](https://solace.com/downloads/)
- [Solace Customer Portal](https://products.solace.com/) > Products > APIs > Javascript
- The Solace PubSub+ broker's built-in web interface (typically `http://<broker>:8080/`)
- NPM: `npm install solclientjs`, then copy `node_modules/solclientjs/lib-browser/solclient.js`, the browser build

**Version:** 10.18.3 or newer is enforced. The shell reads `window.solace.Version.version` after load; below that floor it shows an "Outdated Library" banner and the connection factory refuses to open a session, so Connect reports the version error on the connection card. A build that reports no version at all cannot be checked: it is allowed through with a console warning.

### jszip.min.js

A library for creating ZIP files in the browser, used by the Queue Browser's download feature.

**Where to get it:**

- CDN: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- NPM: `npm install jszip`, then copy `node_modules/jszip/dist/jszip.min.js`
- <https://stuk.github.io/jszip/>

**Version:** 3.10.1 or newer is enforced. An older build loads but is treated as not loaded, so the ZIP download stays disabled; everything else works.

### Graceful degradation

- If `solclient.js` is missing or too old, the app still starts and the banner explains why. The content area shows "Loading..." until the first module's view appears. **Connect** reports the missing or outdated library on the connection card; nothing else needs the SDK. A Connect pressed while the file is still downloading waits for the shell loader (up to 30 s) instead of failing.
- If `jszip.min.js` is missing, ZIP download does not work. Every other feature works.

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

---

## Configuration

All PWA configuration is done at runtime through the UI. There are no environment variables or config files for the PWA itself. (The gateway's own settings are under [Settings](#settings).)

Connection profiles are stored in the browser's `localStorage`. They persist across browser sessions but are specific to the origin (protocol + host + port) where the app is served.

---

## Updating

- **GitHub Pages:** nothing to do; it is redeployed with each newest release.
- **Container:** change the tag and recreate the container:

  ```bash
  SMU_VERSION=4.0.1 docker compose -f docker/compose.gateway.yaml up -d
  ```

  Pin a full version (`:4.0.0`) in production rather than `:4.0`, `:4` or `:latest`. Provisioned mode uses the same tags. A restart signs every Provisioned user out. Before you update a deployment that carries older variable or key names, check [Variables and keys the gateway refuses or ignores](#variables-and-keys-the-gateway-refuses-or-ignores). A container with no `SMU_HOSTED` connects to brokers for the browsers, so put your brokers' CAs in `/tls/trust/` first, or set `SMU_HOSTED=false` to serve the files only.
- **Self-host:** download the new `index.html` from the latest [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) and replace the file on your server; `SHA256SUMS.txt` on the same Release verifies it. `solclient.js` and `jszip.min.js` come from the `dist` branch and need updating only if you want a newer version of those libraries.
