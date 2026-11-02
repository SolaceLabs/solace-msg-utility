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
  -v solace-config:/managed \
  ghcr.io/solacelabs/solace-msg-utility:latest
```

Then open <https://localhost:9443/>. The `/managed` volume holds the gateway's `config.yaml` (see below); without it the file is re-seeded from the environment whenever the container is recreated.

`/tls` is baked into the image as an empty directory owned by UID `65532`, so a **named volume** (`solace-tls` above) inherits that ownership and works out of the box. A **bind mount** does NOT inherit image ownership — the host directory must already be owned by UID `65532`, or pre-populated with `tls.crt` / `tls.key` so the gateway never needs to write.

**Image tags:** `ghcr.io/solacelabs/solace-msg-utility` is published multi-arch (`linux/amd64`, `linux/arm64`) with `:latest`, `:<major>`, `:<major>.<minor>`, and `:<major>.<minor>.<patch>` tags on every release; the Release notes quote the exact digest, and a tag only ever moves to a digest that passed the Trivy gate on both architectures. Pin to a specific tag for production. The same release also publishes a [managed](#managed-mode-rbac) image under the `managed-` prefixed tags (`:managed-latest`, `:managed-<major>`, `:managed-<major>.<minor>`, `:managed-<version>`).

**Configuration file.** The gateway keeps every setting in `config.yaml` (default `/managed/config.yaml`; the path comes from the environment-only `CONFIG_FILE`). On the first start, when the file does not exist, the gateway writes it from the variables below and refuses to start if it cannot; the error names the path and the fix (a writable `/managed`, or `CONFIG_FILE` pointing somewhere writable). From then on the file is authoritative: a changed variable is not applied, and each start logs one warning per variable that disagrees with the file. Edit the file and restart, or delete it to re-seed. Unknown keys and invalid values fail startup with the key and value named. The keys that have no variable, the client access list, are described under [Gateway configuration file](#gateway-configuration-file).

**Seed variables** (all optional; read on the first start only, as described above):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CONFIG_FILE` | `/managed/config.yaml` | Where `config.yaml` lives. Environment-only: read on every start and never stored in the file. |
| `HOSTED` | unset | When `"true"`, `/hosted` returns `200` + the JSON config below; otherwise it returns `404`. |
| `CONN_MODES` | `direct` | Which connection tabs the app offers: `direct` \| `managed` \| `both`. Anything else fails startup. |
| `DEFAULT_CONN` | `direct` | Which tab opens first when `CONN_MODES=both`: `direct` \| `managed`. |
| `APP_DIR` | `/SolaceMsgUtility` | Directory containing `index.html` + assets. May be read-only. |
| `SSL_CERT_FILE` | `/tls/tls.crt` | TLS server certificate (PEM). |
| `SSL_KEY_FILE` | `/tls/tls.key` | TLS private key (PEM). |
| `SSL_TRUST_DIR` | `/tls/trust` | Directory of additional CA bundles (`*.crt`, `*.pem`, non-recursive). Added to the system pool for upstream verification. |
| `SSL_INSECURE_SKIP_VERIFY` | `false` | When `"true"`, the gateway does NOT verify upstream broker certificates. Logged as a warning at startup. Lab use only. |
| `LOG_LEVEL` | `warn` | `debug` \| `info` \| `warn` \| `error`. Anything else fails startup. |

**TLS material:** if `SSL_CERT_FILE` and `SSL_KEY_FILE` both exist, the gateway loads them and refuses to start if either fails to parse (so it never silently overwrites a user-supplied keypair). If either is missing, it generates a self-signed ECDSA P-256 keypair valid for 365 days with `CN=localhost` and SANs `DNS:localhost, IP:::1, IP:127.0.0.1`, writing the cert (`0644`) and key (`0600`) at the configured paths. The SHA-256 fingerprint of the generated cert is logged at startup so operators can pin it.

**Proxy paths:** the gateway parses `/{scheme}/{port}/{host}/{rest...}` from the URL and forwards the request transparently. `{host}` accepts hostnames, IPv4, IPv6 (bare `::1` or bracketed `[::1]`), and FQDNs. `ws` / `wss` paths handle the WebSocket upgrade end-to-end. No `X-Forwarded-*` headers are added, and headers pass through verbatim with one exception: the gateway's own sign-in cookie (`__Host-smu-session`) is removed, so a Direct connection never hands its target host a gateway session.

**Routes:**

| Path | Behaviour |
| --- | --- |
| `/hosted` | `200` + `{"hosted":true,"connModes":"…","defaultConn":"…"}` (`application/json`, `Cache-Control: no-store`) when `HOSTED=true`; else `404`. Skipped from access logs. |
| `/robots.txt` | Disallows every crawler. Every response also carries `X-Robots-Tag: noindex, nofollow`. |
| `/solAdmin` | The administration app (`solAdmin.html`, `no-store`) when the gateway is **hosted AND managed**, to an administrator's session only (otherwise a redirect to `/login`, or `403` for a non-admin); else `404` -- indistinguishable from a wrong URL. The plain file `/solAdmin.html` is never served (`404`), so this route and its checks are the only way in. |
| `/login`, `/login/password` | Managed sign-in and password change, served by the gateway itself (see [Managed Mode](#managed-mode-rbac)). Only on a managed gateway; elsewhere they are ordinary SPA routes. |
| `/managed/*` | The managed JSON API on the session cookie when `MANAGED=true` on a gateway built with the `managed` tag: `GET me`, `POST logout`, and for administrators `GET users`, `PUT`/`DELETE users/{name}`, `GET connections`, `PUT`/`DELETE connections/{broker}`. Errors are `{"error": code}`. Without a session every path answers the same `401`. On any other gateway `/managed/*` answers `404`; it never falls through to the SPA. |
| `/{http\|https}/{port}/{host}/{rest...}` | Reverse-proxy to `http(s)://{host}:{port}/{rest}` with the query string preserved. |
| `/{ws\|wss}/{port}/{host}/{rest...}` | WebSocket reverse-proxy to `ws(s)://{host}:{port}/{rest}`. |
| anything else | Served from `APP_DIR`; SPA history-mode fallback to `/index.html` when the path has no file extension. Under `CONN_MODES=managed` only with a session (else a redirect to `/login`, or `401` for an asset). |

**Mounts:**

| Path | Purpose |
| --- | --- |
| `/tls` | TLS material: `tls.crt`, `tls.key`, and `trust/*.{crt,pem}` for upstream CA validation. Baked into the image as an empty directory owned by UID `65532`. Named volumes inherit that ownership automatically; bind mounts must already be owned by UID `65532` (or pre-populated with the keypair so no writes are needed). |
| `/SolaceMsgUtility` (or override via `APP_DIR`) | PWA bundle. Baked into the image by default; mount to override at runtime. |
| `/managed` | Writable gateway store: `config.yaml` on every image, plus `users.yaml`, `connections.yaml`, `store.key` and `site.seed` in [managed mode](#managed-mode-rbac) (`MANAGED=true`). Baked as an empty directory owned by UID `65532`, so a named volume inherits write access automatically; bind mounts must already be owned by UID `65532`. With no mount the store lives in the container's writable layer: it survives a restart but is lost when the container is recreated, and `config.yaml` is then re-seeded from the environment. |

**Shutdown:** `SIGINT` / `SIGTERM` triggers graceful shutdown with a 10-second drain.

> **Building the image locally** (for developers iterating on the gateway): `docker compose -f docker/docker-compose.yaml up --build` rebuilds from source. Note it starts **both** services — `gateway` on host port `19443` and `gateway-managed` on `29443` — since no profile restricts the default `up`; pass a service name (`up --build gateway`) to start just one. Production users should pull the published image above. See [developer-guide.md](developer-guide.md) for the full build workflow.

**Vendor scripts in compose:** both compose services bind-mount `../dist/solclient.js` and `../dist/jszip.min.js` read-only into `/SolaceMsgUtility/`, so those two files must exist in your local `dist/` before `docker compose up` — they are deliberately not baked into the image (see [External Runtime Dependencies](#external-runtime-dependencies)). `dist/` is git-ignored, so a fresh clone has none: create it and drop both files in before the first `up`. A missing file makes Docker create an empty directory in its place (root-owned on a Linux engine, and the same goes for `dist/` itself, which then makes the next build fail to write) — delete it and retry.

**No `HEALTHCHECK`:** the `scratch` image has no shell or `curl`, so the image deliberately declares none. Use an external check (a Kubernetes liveness probe, a swarm healthcheck, a monitoring agent) against `https://<host>:9443/hosted` with the certificate pinned or verification disabled.

### Managed Mode (RBAC)

**Managed mode** abstracts broker credentials from users: instead of typing SMF/SEMP credentials, users log in and pick from the brokers/VPNs they are entitled to. It ships **only in the managed image**: that image serves `managed.html`, the one bundle with the Managed sign-in, as its `index.html`, and the gateway decides which connection paths it offers. Every Release bundle (`index.html` and its variants) is Direct-only, whatever the gateway advertises. It **only runs behind the gateway** with managed mode enabled, because it relies on the gateway both to relay broker traffic *and* to serve the `/managed/*` RBAC endpoints. For the design and threat model see [rbac-variant-plan.md](rbac-variant-plan.md); for the internals see [architecture.md](architecture.md) § Managed Connections.

The managed image's gateway binary is compiled with the RBAC store + `/managed/*` handler built in (`-tags managed`); the standard image's gateway binary has no `/managed/*` support, and the standard image serves the Direct-only bundle. Use the `managed-` tagged image for managed deployments — setting `MANAGED=true` on the standard image only logs a "built without managed support" warning.

**Deploying it (prebuilt image — recommended):** pull `ghcr.io/solacelabs/solace-msg-utility:managed-latest` (or a pinned `:managed-<version>`). This image bakes `MANAGED=true`, `HOSTED=true` and `CONN_MODES=managed` as defaults, so it runs as a managed deployment out of the box — just mount a writable `/managed` volume (and `/tls`).

#### Choosing which connection modes to offer

`CONN_MODES` decides what the Connections module shows, and it is the **only** control that makes the entitlement model binding:

| `CONN_MODES` | Connections module | Queue Copy destination credentials | Entitlements are… |
| --- | --- | --- | --- |
| `direct` (default) | Direct tab only | typed by the user | not in play — no managed session exists |
| `managed` | Managed tab only | **provisioned only** (pick a broker/VPN you are entitled to) | **binding** — this is the lockdown setting |
| `both` | both tabs, `DEFAULT_CONN` first | user chooses provisioned **or** typed | **advisory** — see the warning below |

> **`CONN_MODES=both` is a documented bypass.** A user can switch to the Direct tab and connect with any credentials they happen to know, entirely outside their entitlements — and a typed-credential Queue Copy destination is likewise ungated. Offer `both` only where that is acceptable (mixed audiences, migration periods). **If the entitlement model must hold, set `CONN_MODES=managed`.**

The gateway **fails to start** if `CONN_MODES` advertises managed without `HOSTED=true`, `MANAGED=true`, and a binary built with the `managed` tag — a half-configured deployment stops at boot instead of showing a tab that cannot work. With `MANAGED` unset the gateway behaves exactly as the standard gateway above and `/managed/*` answers `404` (it never falls through to the SPA). With no gateway at all (static hosting) there is no `/hosted`, so the app is Direct-only and the Managed tab never appears.

**Managed-mode environment variables** (in addition to the seed variables above; they too seed `config.yaml` on the first start only, except `SITE_SEED_FILE` and `STORE_KEY_FILE`, which are environment-only and never written to the file):

| Variable | Default | Purpose |
| --- | --- | --- |
| `MANAGED` | unset | When `"true"`, the gateway loads the RBAC store and serves the sign-in pages and `/managed/*`. Otherwise none of the managed code path runs. |
| `USERS_FILE` | `/managed/users.yaml` | User + entitlement store, encrypted with the store key. Created with a default admin if missing (see below). |
| `CONNECTIONS_FILE` | `/managed/connections.yaml` | Broker connection store, encrypted with the store key (the credentials in it are also packed by the browser until Phase 3 of the [rework](rbac-rework-plan.md) ends). |
| `STORE_KEY_FILE` | `/managed/store.key` | The key that encrypts `USERS_FILE` and `CONNECTIONS_FILE`. **Critical persistent state** -- see below. Environment-only, like `SITE_SEED_FILE`. |
| `SITE_SEED_FILE` | `/managed/site.seed` | Per-deployment key material. **Critical persistent state** — see below. Environment-only: read on every start, never stored in `config.yaml`, so the settings file can never point the gateway at a different seed. |
| `ADMIN_PASSWORD` | unset | Password of the bootstrap admin, read only when `USERS_FILE` does not exist yet. 12 to 128 characters. Environment-only; never logged or written to `config.yaml`. |
| `ADMIN_PASSWORD_FILE` | unset | Path of a file holding that password (a Docker or Kubernetes secret); a trailing newline is ignored. Set this or `ADMIN_PASSWORD`, not both. |

The default paths put all four files under **`/managed/`**, so mount a **writable** volume there (the gateway writes the bootstrap admin, the store key and the site seed on first run). Using the prebuilt managed image, `MANAGED` / `HOSTED` / `CONN_MODES` are already baked in:

```bash
docker run --rm -p 9443:9443 \
  -v solace-tls:/tls \
  -v solace-managed:/managed \
  ghcr.io/solacelabs/solace-msg-utility:managed-latest
```

**First-run bootstrap:** if `USERS_FILE` is missing, the gateway writes one administrator, username `admin`, with **no** broker access. Its password is `ADMIN_PASSWORD` (or the content of `ADMIN_PASSWORD_FILE`); with neither set, the gateway generates one and prints it **once**, in a warning line of its log (`docker compose logs gateway-managed`). Either way the first sign-in leads straight to a password change, and nothing else is reachable until it is done: a value that sits in an environment file or `docker inspect` output stops working at once. If you lose the generated password before signing in, delete `users.yaml` and restart to bootstrap again. On later starts the two variables are ignored, with a warning to remove them. A variable that is set but invalid (both set, too short, unreadable file) stops the first start with the variable named, never its value.

The two store files are encrypted with the store key, so they cannot be edited by hand: the gateway is their only writer, and the admin modules are the way to change them. Both files are checked strictly on load: an unknown key, a duplicate user or broker, a username or broker name outside `A-Z a-z 0-9 . _ - (@ for users)` or made only of dots, a port outside 1 to 65535, a hostname that is not a bare host name or IP address (no scheme, port or path), a missing SEMP port when a SEMP username is set or a missing client port when message VPNs are listed, a SEMP username with `:`, a control character in any credential, a module id the catalog does not know, a password that is not a stored hash, or a users file with no administrator stops the start with the file and the entry named. The same rules refuse a save from Connection Management with `422`. A users file from a build before gateway sign-in (passwords stored as `S1:` tokens) is refused the same way; delete it to bootstrap again.

**Sign-in and sessions:** users sign in on the gateway's own page, `/login` (a plain form, no script), and change their password on `/login/password`. A successful sign-in sets an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie (`__Host-smu-session`); passwords are stored as a slow, per-user password hash and never leave the gateway. A session ends after `session.idleMinutes` without a request to the gateway or `session.absoluteMinutes` after sign-in (defaults 10 and 30), on Sign out, on a gateway restart, and whenever an administrator sets the user's password, changes their administrator flag or deletes them. Under `CONN_MODES=managed` the app itself is served only with a session: `/` redirects to `/login`. Under `both` the app loads without one (for the Direct tab) and its Managed tab links to `/login`. Every `/managed/*` request without a session gets the same `401`, whatever the path. **Until Phase 3 of the [rework](rbac-rework-plan.md)** the broker relay and the SMF WebSocket do not check the session, so a session that has expired is noticed at the user's next Refresh or page load, not while they browse.

**Sign-in throttling:** after `login.maxFailures` failed sign-ins (or wrong current passwords) for one username, or from one client address (an IPv6 client by its /64), further attempts are refused with `429` for `login.backoffSeconds`, doubling with each further failure up to `login.maxBackoffSeconds`; a blocked attempt is refused without the password being checked, and the first block logs one warning. Every request without a session (the sign-in pages, `/managed/*`, and the app under `CONN_MODES=managed`) also draws from a per-client budget of `login.unauthenticatedPerMinute`. A known username can be locked out by someone guessing at it for up to `login.maxBackoffSeconds`; the access list below, or a VPN in front, is the answer to that.

**SEMP relay:** the gateway relays a signed-in user's SEMP requests to a provisioned broker at `/managed/relay/{broker}/SEMP...`, adding the broker's stored SEMP account, which never reaches the browser. It relays **reads only**: `GET`/`HEAD` under `/SEMP/v2/`, and a SEMP v1 `POST /SEMP` only when it is a single `<show>`; any other method or command is refused with `403 read_only`, so the stored account cannot change a broker through the gateway even when it is an administrator. A broker is relayed to a user who is entitled to at least one of its Message VPNs. The check stops there: through the relay such a user can read every Message VPN on that broker that the stored SEMP account can, and queue-level rules and read-only rows remain a filter in the app, not a gateway check. Provision brokers per audience, and give each a SEMP account scoped to what its users may see. A broker that rejects the stored account (`401`), redirects, or cannot be reached answers `502` (`upstream_auth` or `upstream_unavailable`; the cause is in the gateway log). Use a read-only SEMP account all the same. **Until the browser switches over in Phase 3 of the [rework](rbac-rework-plan.md)**, the app still reaches brokers through the Direct relay.

**SMF sockets:** `POST /managed/dial` gives a signed-in user the client username and password of a Message VPN they are entitled to, with a gateway path, `/managed/smf/{broker}/{vpn}`, on which the gateway opens the broker's SMF port over TLS for them. It is the one place a broker credential reaches the browser; the SEMP account never does. The password works against the broker from anywhere that can reach it, so give each Message VPN a client username scoped to what its users may do. The gateway refuses a socket whose `Origin` is not its own `https://` address: behind a reverse proxy, pass the original `Host` through and allow WebSocket upgrades on `/managed/smf/`, or every socket is refused (`403 cross_origin`; the gateway's warning shows the origin and the host it saw). An open socket has no gateway timeout: it lasts as long as the SMF session keeps it alive, past the sign-in session's own limits, and the gateway closes it when access is taken away: sign-out, a password change, the user deleted or their administrator flag changed, an entitlement or the Message VPN removed, or the broker deleted. Dials and socket upgrades together are limited to 20 per minute per user (`429`). Until the browser switches over, the app still connects through the Direct relay.

**Module control:** an administrator decides which app modules each managed user sees. `config.yaml` sets the ceiling, `modules.offered` (default: Queue Browser and Queue Copy), and what a user without a list of their own gets, `modules.userDefault` (`all` or `none`, default `all`). User Management can give a user their own list; a module outside `modules.offered` is never shown, whatever the list says. Connections is always shown. Queue Subscription Explorer and Queue Discovery cannot be granted at all: they read the broker over SEMP v1, which the entitlement filter does not cover, so the gateway's module catalog leaves them out and the app hides them in every managed session. A change to a user's modules shows at their next Refresh or page load.

**Store key:** on a fresh volume, when the key file and both store files are all absent, the gateway generates `STORE_KEY_FILE` (64 hex characters, owner-only) and logs a warning with its path. It never generates one beside an existing store. **Back it up and treat it as a secret**: without it the users and connections files cannot be read, and there is no recovery; deleting both store files and the key starts over (a new bootstrap admin, every connection entered again). By default the key sits on the same `/managed` volume as the stores, which protects a leaked copy of a store file but not a copy of the whole volume; for more, point `STORE_KEY_FILE` at a separate mount or a Docker secret (a read-only key is fine: it is only written when generated). The gateway refuses to start, naming the file and the fix, when:

| Condition | Fix |
|---|---|
| The key file is missing but a store file exists | Restore the key file, or delete the store files to start over. |
| The key file is unreadable, or does not hold exactly 64 hex characters (a trailing newline is fine) | Make one with `head -c 32 /dev/urandom \| xxd -p -c 64`, or restore the right file. An `EACCES` error means the file or its directory is not readable or writable by UID `65532`. |
| A store file is not encrypted (a volume from a build before Phase 3 of the [rework](rbac-rework-plan.md)) | There is no migration: `docker compose down -v`, or delete `users.yaml`, `connections.yaml` and `site.seed`. |
| A store file cannot be decrypted, is empty, or is the other store's file | The key file is the wrong one or the store is damaged: restore the matching pair from a backup. |

A key file readable by other users (mode beyond `0600`) is only warned about, because Docker secrets are mounted `0444`.

**Site seed:** the gateway generates `SITE_SEED_FILE` with random bytes on first run and uses it to obfuscate/reveal broker credentials. **Back it up and treat it as a secret.** Losing or replacing it orphans every stored broker credential (they can no longer be revealed) — re-seeding then requires re-entering every connection's credentials via Connection Management. Keep it on the same persistent volume as the YAML stores.

#### Administration app (`/solAdmin`)

User Management, Connection Management and Gateway Settings are **not in the everyday bundles**. They ship as a separate app at `https://<gateway>:9443/solAdmin`, served only when the gateway is hosted **and** managed, and only to an administrator's session: without one `/solAdmin` redirects to the sign-in page, and a signed-in non-admin gets `403`. The admin app opens no broker connection at all — it exists to edit `users.yaml`, `connections.yaml` and `config.yaml` through the gateway.

**Gateway Settings** shows every `config.yaml` key. A save is checked exactly as at startup, written with the usual header, and applies at once for `connModes`, `defaultConn`, `logLevel`, `access.*`, `session.*`, `login.*` and `modules.*` (a shorter session limit ends older sessions at their next request). `hosted`, `managed` and `tls.insecureSkipVerify` are saved, tagged "restart" on the page and listed in a banner until the gateway restarts with them. The path keys (`appDir`, `tls.certFile`, `tls.keyFile`, `tls.trustDir`, `usersFile`, `connectionsFile`) are shown read-only, tagged "edit on host": a path an administrator could point anywhere would let the gateway serve its own secrets (an `appDir` of `/managed` publishes the seed and the stores) or overwrite a store at the next start, so they change only by editing `config.yaml` on the host and restarting. The gateway refuses these saves:

- a change to a path key (`422`, naming the key);

- an access list that would deny the administrator's own address, as resolved with the new trusted proxies (`409`, with the address);
- `connModes` offering managed sign-in while the running gateway is not hosted: save `hosted: true`, restart, then change `connModes`;
- any save after `config.yaml` was edited on the host since the gateway loaded it (`409`): restart to load the hand edit first. The page shows a banner and disables Save until then;
- any save, and the page itself, while the gateway cannot read `config.yaml` (`500`, with the cause): a deleted file is written again from the seed variables at the next start.

Every save logs one warning with the administrator's name. Saving `managed: false` removes sign-in, the admin app and this page at the next restart; to undo it, edit `config.yaml` on the host.

The managed image ships `solAdmin.html` alongside the main bundle. If you assemble `APP_DIR` yourself, use `managed.html` (built by `npm run build:managed`) as `index.html` and copy `solAdmin.html` too: a Release `index.html` has no Managed tab, and without `solAdmin.html` `/solAdmin` will 404 (the gateway logs "admin app requested but not deployed" so the cause is visible). Neither file is a Release asset.

#### Managed-mode security checklist

Managed mode is fit for **trusted-internal** use only; the broker relay itself stays ungated, so the client-side guardrails are UX, not a security boundary. Before exposing it:

- **Set `CONN_MODES=managed`** unless you have a specific reason to offer Direct alongside it. Under `both`, none of the entitlement guarantees hold.
- **Use a read-only / least-privilege SEMP account** for each broker connection (never broker-admin) so a captured credential's blast radius is bounded.
- **Sign in as `admin` right after the first start** and set the password you will keep; until then the bootstrap password (in the log, or in your environment) is all that protects the deployment. Remove `ADMIN_PASSWORD` from the environment afterwards.
- **Protect the store files** (`USERS_FILE`, `CONNECTIONS_FILE`, `STORE_KEY_FILE`, `SITE_SEED_FILE`) with filesystem permissions -- the store key opens both stores, the users file holds the password hashes and the seed is shared key material.
- **Always serve over TLS** (the gateway does by default) — passwords at sign-in, the session cookie and the site seed traverse the wire.
- **Restrict who can reach the gateway** with `access.allow` in `config.yaml` (a CIDR list; empty means everyone). Behind a reverse proxy, list the proxy in `access.trustedProxies` so the client address is taken from `X-Forwarded-For`; from any other peer that header is ignored and the peer itself is judged. See [Gateway configuration file](#gateway-configuration-file).
- **Treat `/solAdmin` as privileged.** It is the only surface that edits entitlements. It is served only to an administrator's session, so its protection is the administrator passwords and the sign-in throttle — use network controls if you need more.
- **Crawlers are told to stay out:** the gateway serves a `robots.txt` that disallows everything and sends `X-Robots-Tag: noindex, nofollow` on every response. That keeps it out of search indexes, nothing more.
- **Expect two modules to be missing.** Queue Subscription Explorer and Queue Discovery are hidden in every managed session (including for admins) and cannot be granted, because they read over a SEMP path that cannot be entitlement-filtered. That is deliberate; see [rbac-variant-plan.md](rbac-variant-plan.md) § Threat model.
- **Review Gateway Settings like any other privileged change.** It can widen the access list, lengthen sessions or turn managed sign-in off; each save leaves a warning line naming the administrator.

### Self-host the static files

The simplest deployment without Docker. `index.html` is attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) the tag pipeline creates (alongside the other bundle variants, the `go-web-proxy` binaries and a `SHA256SUMS.txt` to verify them); releases up to v3.3.4 predate the pipeline and carry no assets. The newest is always at a stable URL, so a script can fetch it directly — keep `-f`, so a failed download is an error instead of a saved error page:

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

The PWA loads two external scripts via `<script>` tags. They are not bundled into the HTML and must be mounted alongside it at the deployment location. The same requirement applies to `min.html`, `mock.html`, `no-payload.html`, and `no-queue-copy.html`; every variant of the PWA expects the two vendor files next to it. `managed.html` (the managed image's `index.html`) needs them too. `solAdmin.html` uses none of what those files provide (it never opens a broker connection and has no ZIP export), but it is built from the same shell, so it still runs the vendor loader and will show the "not found" banner if they are absent. The managed image ships them alongside it.

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

All PWA configuration is done at runtime through the UI. There are no environment variables or config files for the PWA itself. (The gateway's own settings live in `config.yaml`, below.)

Connection profiles are stored in the browser's `localStorage`. They persist across browser sessions but are specific to the origin (protocol + host + port) where the app is served.

### Gateway configuration file

`config.yaml` (default `/managed/config.yaml`) holds every gateway setting. It is written once, on the first start without a file, from the seed variables listed under [Containerised Gateway](#containerised-gateway); afterwards the file wins and the environment is only compared against it (one warning per differing variable at each start, with both values). The header the gateway writes maps every key to the variable that seeds it. Keys that have no variable:

| Key | Default | Purpose |
| --- | --- | --- |
| `access.allow` | `[]` | CIDR list of clients allowed to reach the gateway, on every route including the broker relay and its WebSocket upgrades. Empty means everyone. A denied client gets `403` with an empty body; the gateway logs one warning with the client address, method and path, and the access log records the 403. |
| `access.trustedProxies` | `[]` | CIDR list of reverse proxies whose `X-Forwarded-For` is believed. The header is walked right to left and the first address that is not itself a trusted proxy is the client. From any other peer the header is ignored. An address that does not parse is denied. The same client address drives the sign-in throttle. |
| `session.idleMinutes` | `10` | Managed sign-in: a session ends after this long without a request to the gateway. 1 to `session.absoluteMinutes`. |
| `session.absoluteMinutes` | `30` | Managed sign-in: a session ends this long after sign-in, however busy. 1 to 1440. |
| `login.maxFailures` | `5` | Failed sign-ins per username, and per client, before the back-off starts. 1 to 1000. |
| `login.backoffSeconds` | `30` | First back-off; it doubles with each further failure. 1 to `login.maxBackoffSeconds`. |
| `login.maxBackoffSeconds` | `900` | Longest back-off. 1 to 86400. |
| `login.unauthenticatedPerMinute` | `60` | Requests without a session that one client may make per minute (sign-in pages, `/managed/*`, the app under `CONN_MODES=managed`). 1 to 10000. |
| `modules.offered` | `[queue-browser, queue-copy]` | Managed: the app modules a managed user may be given. Only those two exist; an unknown id (Queue Subscription Explorer included) fails startup. `[]` offers none, leaving Connections alone. |
| `modules.userDefault` | `all` | Managed: what a user without a `modules` list of their own in `users.yaml` gets, `all` (every offered module) or `none`. |

`session.*`, `login.*` and `modules.*` are read only when `managed` is true. On a managed gateway the admin app's Gateway Settings page edits this file too (see [Administration app](#administration-app-soladmin)); it refuses to save over a hand edit it has not loaded, so after editing the file on the host, restart before using the page. Rules: unknown keys, an empty file, a missing `version: 1` and invalid values (a CIDR without a prefix length, an IPv4-mapped IPv6 prefix, an unknown log level or connection mode, a number out of its range) fail startup with the key and value named. Missing keys take the built-in defaults, never an environment value. Three values never live in the file and are read from the environment on every start: `CONFIG_FILE`, `SITE_SEED_FILE` and `STORE_KEY_FILE`. The managed image bakes `MANAGED`, `HOSTED` and `CONN_MODES` into its environment; once those keys are changed in the file, every start reports the baked values as ignored, which is expected. The file is written `0644` (it holds no secret); the managed store files stay `0600`.

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
