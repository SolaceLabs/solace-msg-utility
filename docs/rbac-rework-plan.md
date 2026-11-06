# Managed mode rework: direction and decisions

Status: walked through end to end on 2026-10-29, all decisions settled. Branch `feature/rbac`. This is the plan for
the plan: what was decided and the phases. Detailed per-phase plans follow. Supersedes the "Open
hardening items" section of [rbac-variant-plan.md](rbac-variant-plan.md) when adopted.

## 1. Goal

- Managed code ships only in the managed container image. The Release HTML (`index.html`,
  `min.html`, ...) carries none of it, with one stated exception: `managed-demo.html` runs the real
  managed modules against a demo-only fake gateway and the in-browser broker. It holds no gateway
  or broker address and cannot open a network request; `check-bundles` proves both on every build.
- Credentials, the password check and the session live in the Go gateway. The browser keeps two
  jobs: the SMF dial (the SDK must log in to the broker itself) and SEMP response filtering.
- Managed image stays `FROM scratch`, CGO off, stdlib plus `yaml.v3`, under 20 MB (today 12.7 MB).
- No migration: managed mode has never shipped (`main` has no managed code, last Release v3.3.4).

## 2. Decisions taken

| Topic | Decision | Consequence |
|---|---|---|
| Where SMF connects | Browser, via the SDK | Server-side browsing needs Node (130+ MB), Java (35+ MB) or the C API (C parser, bundled TLS invisible to scanners). C API stays the fallback: est. 16-20 MB, needs a spike. |
| Login | Password over TLS; gateway stores a slow password hash with a per-user random value, constant-time compare, `HttpOnly` `Secure` `SameSite=Lax` cookie | `stamp()`, the resend-token scheme and the bearer token in `users.yaml` go. Nothing used to check a password leaves the gateway. `Lax`, not `Strict`: a link from another site opens the app signed in; cross-site POSTs are blocked either way, and every state change also checks `Sec-Fetch-Site`. |
| Login UI | Gateway-served page: `GET /login` form, `POST /login`, redirect to the app; `/login` with a valid session redirects to `/` | Smaller bundle; one plain HTML page to style and test in Go. Under `CONN_MODES=managed` the bundle itself is served only with a valid session (`/` redirects to `/login`), so nothing of the app reaches an unauthenticated client; under `both` the bundle loads without one, for the Direct tab. |
| Session | In memory, single replica. Defaults 10 min idle, 30 min absolute, in `config.yaml` | Gateway invalidates on password change, delete, self-demotion; browser sees 401. |
| Store encryption | `users.yaml` and `connections.yaml` are stored encrypted as whole files with a key file only the gateway reads. The gateway generates the key on first run if absent (path from env, replaces `SITE_SEED_FILE`, owner-only permissions). SEMP: gateway injects the credential. SMF: `POST /managed/dial` returns the VPN's client credential to an entitled user on each connect (see the SMF dial row) | Site seed and `unpack` leave the browser. SEMP password never reaches it. No operator step for the key; losing it means re-provisioning users and connections. Encrypted store present but key missing: the gateway refuses to start and says so. `config.yaml` stays readable because the standard image has no admin UI and is hand-edited. The key file and its path never live in `config.yaml`: `STORE_KEY_FILE` (named so to stay distinct from the TLS key's `SSL_KEY_FILE`; default `/managed/store.key`) is environment-only like `SITE_SEED_FILE`, so the settings file can never redirect the gateway to another secret. The key is generated only on a fresh volume (key and both stores absent); a plaintext store from an earlier build is refused, never converted. |
| SEMP relay | Gateway injects the credential and forwards **reads only** (decided 2026-11-01): `GET`/`HEAD` under `/SEMP/v2/`, and `POST /SEMP` only for a single `<rpc><show>`; everything else under `/SEMP` is `403 read_only`, any other path `404`. Paths are checked per decoded segment, because the router leaves encoded dot segments in place | VPN/queue filtering stays in the PWA (`managed-semp-filter.ts`), so queue globs remain a UI filter on both planes. Protection is credential custody plus a session-bound relay keyed by broker name: an entitled user can read any VPN/queue on a provisioned broker, not other brokers, and the stored SEMP account can never write through the gateway. |
| SMF dial | `POST /managed/dial {broker, vpn}` returns `{smfPath, vpn, user, pass}` to an entitled user, read-only users included. Stateless: no ticket | A ticket would break the SDK's own reconnects, which re-use the session properties. "One-shot" means the password comes only from `dial` and the browser keeps it only inside the dial callback; a reconnect after a sign-in dials again. Dials and socket upgrades share 20 per minute per user. |
| SMF socket | `GET /managed/smf/{broker}/{vpn}` upgraded behind the session, an `Origin` equal to the gateway's own `https` address and the entitlement; joined to the broker's SMF port over TLS with only the `Sec-WebSocket-*` headers passed. Closed only on revocation (decided 2026-11-01): sign-out, password change, user deleted or administrator flag changed, entitlement or VPN removed, broker deleted | No idle or absolute timer: the SMF API's keep-alive owns the connection's lifetime, so a socket can outlive its session. A Host-rewriting proxy in front fails the `Origin` check; an allowed-origins setting is out of scope. |
| Bundle delivery | New `managed` variant builds `dist/managed.html`; the managed image copies it over `index.html`. The Release uploads an explicit list (`index`, `min`, `no-payload`, `no-queue-copy`, `mock`, and from Phase 4 `managed-demo`), never `solAdmin.html` or `managed.html` | Build-time registry, nothing loads at runtime. Release bundles lose the managed code; `tag.yml` stops uploading `dist/*`. |
| `CONN_MODES=both` | Kept in the managed image; Direct stays a per-deployment switch (decided 2026-11-01) | Under `both` the Direct relay stays present and its exposure is handled by the client access list below; under `managed` it answers `404`, read live. The gateway's sign-in cookie is never forwarded by it in any mode, and an upstream `Set-Cookie` naming it is dropped. |
| Relay exposure | The Direct relay stays open to any host under `direct` and `both` (closed under `managed`). New client access list, CIDR-based, default allow-all | Applies to every route, not only the relay. Behind a reverse proxy the client IP comes from `X-Forwarded-For` only when the proxy is listed as trusted. |
| Docs-secrecy policy | Retired in Phase 3 (step 3E), with the browser transform | `CLAUDE.md` section, `check-docs-secrecy.mjs`, its test and `check:docs` removed; docs name the store format and primitive. |
| Managed demo | The real managed modules against a demo-only fake gateway and the in-browser broker, shipped as the Release asset `managed-demo.html` (decided 2026-11-04, replacing the separate mini app) | Phase 4. `mock.html` stays a Direct-only demo. The fake follows the gateway through shared contract files that both are tested against. |
| SEMP v1 RPC | Checked only for its shape: one `<rpc>` with one `<show>` command (follows from the read-only relay) | Which modules a managed session sees is decided by module control, below. |
| Module control | Deployment ceiling in `config.yaml` (modules the image offers) plus a per-user `modules` list in `users.yaml` within it, editable in `/solAdmin`; `/managed/me` returns the result. A user without a list gets the deployment default, itself a `config.yaml` setting (`all` or `none`, default `all`). Admin-only modules still require `admin` | Replaces "every other module is visible" in `src/core/rbac.ts`. The SEMP v1 modules stay out of the catalog and hidden in every managed session (decided 2026-11-01: what a managed user sees must follow the admin's queue rows, which those modules cannot honour). |
| Module scope | Show/hide only. Read-only vs operate stays per queue | A read-only queue admits no operate action in any module, e.g. `queue-copy` cannot copy into it. No per-module level. |
| Config editing | `config.yaml` holds every setting: connection modes, default tab, hosted flag, paths, TLS, log level, timeouts, throttle limits, module ceiling and default, client access list, trusted proxies. Env vars are read only on first start, to seed the file when it does not exist; the path to the file itself and the key file path stay env vars, never in the file. Admin-editable in `/solAdmin` via a settings page and endpoint | One more admin surface; same cookie auth, same validation as the other writers. The startup checks on connection modes run on load and on every write. A changed env var after first start has no effect until the file is removed. The standard image, with no admin UI, is hand-edited. The endpoint refuses an access list that would exclude the requesting client. Path keys (`appDir`, `tls.*` files, `usersFile`, `connectionsFile`) are shown but change only by a hand edit (decided 2026-11-01 after the Phase 2 review: a path the endpoint could set would let the gateway serve its own secrets or overwrite a store). |
| Login guessing | Constant-time compare plus in-memory per-user and per-client back-off, limits in `config.yaml` | Item 1. |
| Request bodies | Size cap on every `/managed/*` route, unknown JSON fields rejected | Item 2. |
| Bootstrap admin | Random password generated and logged on first run; only the password change is allowed until it is changed | Item 3. |
| Reload | `/managed/reload` dropped | Item 5. The gateway is the only writer and applies every change at once; a hand edit on the volume needs a restart. The Reload button and the reload call in `managed-service.ts` go. |
| Stored shapes | Gateway is the only writer and validates every file on load. Fixed store path on the `/managed` volume, no hidden or random location | Item 6. Persistence across upgrades needs a mountable path; protection comes from the store encryption above, not from where the files sit. |
| Browser namespacing | Plaintext stays inside the dial callback, never in `AppState` or form fields | Raises effort, is not a boundary. Item 8. |
| Distribution | Container images only (decided 2026-11-06): the Release stops attaching the gateway binaries, and the images ship `solclient.js` and `jszip.min.js` from exact-pinned npm packages | Phase 5. Trust stays explicit: the image ships no root CAs and trusts only `SSL_TRUST_DIR`, where a deployment puts its brokers' CAs, a public root included. |

## 3. Still open

Nothing. The module-control and config-editing rows above closed the last two.

## 4. Shape after the rework

```
client CIDR access list (every route; default allow-all)
                 |
managed.html (browser)                 Go gateway (managed image)
  no session   ---- GET /login ------------>  HTML form (CONN_MODES=managed: / redirects here)
  sign-in      ---- POST /login ----------->  hash check, throttle, cookie, redirect to /
  profile      <--- GET  /managed/me -------  admin, modules, brokers/VPNs, globs (UI filtering)
  SEMP calls   ---- /managed/relay/{broker}/SEMP/... -> inject credential, forward as-is
  SMF connect  ---- POST /managed/dial ----->  check broker/VPN entitlement, return the VPN credential
  SDK session  ---- WSS /managed/smf/{broker}/{vpn} -> cookie, Origin + entitlement on upgrade; closed on revocation
  sign-out     ---- POST /managed/logout --->  session dropped
  admin app    ---- /managed/{users,connections,settings} CRUD, cookie auth, JSON error codes
  Direct tab   ---- /{scheme}/{port}/{host}/... open relay, unchanged

Gateway files on /managed: users.yaml and connections.yaml (encrypted whole with the key file),
key file (generated on first run), config.yaml (readable; every setting, seeded from env on
first start, admin-editable in the managed image, hand-edited in the standard one)
```

- `connections` keeps its id, name and single sidebar entry. The directory gains a second entry,
  `module.managed.ts` with `index.managed.html`, composing the Direct form (`installDirect`,
  exported by `module.ts`; markup spliced from `index.html`) plus the Managed tab
  (`managed-panel.ts`). The `managed` and `all-for-testing-only`
  manifests name that entry; the registry plugin and template injector learn one optional
  per-variant entry override. `module.ts` never imports the managed files, so Release bundles
  carry none of them. The hook-to-`AppState` bridge stays in the module directory, shared by
  both entries (anchor 4 unchanged). Same UX as today under `both`; no new runtime rules.
- Not chosen: a separate `managed-connections` module (two sidebar entries under `both`; probe
  and mutual exclusion move to core); replacing `connections` outright in the image (keeping
  `both` would force the Direct form into a core component first, the largest refactor, for the
  same user-facing result); a runtime sidecar `managed.js` served by the gateway (two bundles
  sharing `AppContext` by contract, core code duplicated).
- `rbac:sign-out-requested` keeps its contract; sign-out now also hits `POST /managed/logout`.
- The standard image is unchanged except for `config.yaml` and the client access list.

## 5. Open items: disposition

| # | Item | Outcome | Phase |
|---|---|---|---|
| 1 | Login guessing | Throttle + constant time, config-driven | 2 |
| 2 | Unbounded bodies | Size cap, strict JSON | 2 |
| 3 | Bootstrap admin | Random, logged, forced change | 2 |
| 4 | Seed to every user | Removed | 3 |
| 5 | Reload open | Endpoint removed | 2 |
| 6 | No shape check | Gateway sole writer, validates on load | 2-3 |
| 7 | Queue globs client-side | Stays a UI filter by decision; SEMP credential never in the browser; relay bound to provisioned brokers | 3 |
| 8 | Plaintext outlives dial | SEMP never in browser; SMF inside the dial only | 3 |
| 9 | Permission upgrade on browse | Downgrade-only, without writing SDK-private state | 3 |
| 10 | Two session owners | Removed; the cookie is the session | 2 |
| 11 | Self-demotion | Gateway invalidates the session | 2 |
| 12 | Generic errors, in-memory session | JSON error codes mapped in the UI; cookie survives reload | 2 |
| new | Fast, username-only password token | Replaced by the slow per-user hash | 2 |
| new | Relay reachable by anyone | Client CIDR access list | 0 |
| new | Probe-able surface | Section 6 | 2 |

## 6. Surface hygiene (bots, scanners)

URLs cannot be hidden: the bundle names every endpoint. Make probing worthless instead.

- Client CIDR access list on every route; trusted-proxy list for `X-Forwarded-For`.
- Identical response for every unauthenticated request to `/managed/*`; no route, user or broker
  existence leaks. `/managed/*` must not fall through to the SPA.
- Throttle every unauthenticated path, not only login.
- No `Server` header, no version in `/hosted`, generic 502, `Cache-Control: no-store` on APIs,
  `X-Robots-Tag: noindex, nofollow`, `robots.txt` disallowing everything.
- CSRF: `SameSite=Lax` plus a `Sec-Fetch-Site` or custom-header check on every state change.
- Access log bursts of 401/404/429 per client.
- Deployment guidance: VPN, IP allowlist or SSO proxy in front. Never the open internet.

## 7. Phases

Each phase ends green (`./scripts/dev.sh all cov scan`) and shippable on `feature/rbac`, landing
as one commit series straight on the branch (no sub-branches; CI by `workflow_dispatch`).

**Phase 0: `config.yaml` and the client CIDR access list** (both images, independent). Code on
`feature/rbac` 2026-10-30: `configfile.go`, `access.go`, `fileutil.go` and tests.
- `config.yaml` loader with every setting, seeded from env on first start; the file wins afterwards.
- Client access list and trusted proxies on every route; the startup checks read the loaded config.

**Phase 1: Browser split, no security change.** Code on `feature/rbac` 2026-10-30.
- `connections` split into two entries, `module.ts` (Direct; exports `installDirect`) and
  `module.managed.ts` (Direct + Managed), with `index.html` / `index.managed.html` (base spliced
  in at `<!-- @module-base -->`); the registry plugin, template injector and `loadModuleDOM` learn
  the per-variant entry override (`MODULE_ENTRIES`). `mock.html` became Direct-only.
- `managed` variant, `dist/managed.html`, Dockerfile overwrite in the managed leg; `tag.yml`
  uploads an explicit Release list.
- Build check (`scripts/check-bundles.mjs`, in the `build` task): Release bundles carry no
  managed UI, `managed.html` does. Phase 3 replaced the core managed store with the names-only
  managed profile and added the `/managed/dial` and `/managed/relay/` markers.
- Docs: variants, build modes, Dockerfile and `tag.yml` comments ("same bundle" is no longer true).

**Phase 2: Gateway sessions and auth.** Step 2A (sign-in, sessions, cookie auth) code on
`feature/rbac` 2026-10-30: `password.go`, `session.go`, `throttle.go`, `pages.go`, REST
`managed.go`; browser `managed-api.ts`, `stamp()` removed. Step 2B (module control, settings) code
on `feature/rbac` 2026-11-01: `live.go` (the live keys behind an `atomic.Pointer` plus a
`slog.LevelVar`, read per request), `settings.go` (`GET`/`PUT /managed/settings`, lock-out and
on-disk refusals), `moduleCatalog()` and `modules.*` in `configfile.go`, per-user `modules` in
`store.go`; browser module control in `rbac.ts`, the modules editor in `user-management`, the new
`gateway-settings` module, and the catalog drift guard in `tests/variants.test.ts`. The catalog is
Queue Browser and Queue Copy; the SEMP v1 modules keep their `unfiltered-semp` rule.
- `/login` page, `/managed/logout`, `/managed/me`; cookie sessions with the 10/30 min defaults;
  bundle served only with a session under `CONN_MODES=managed`; password hashing; throttle; body
  caps; random bootstrap with forced change; session invalidation; uniform responses; module
  control (config ceiling, per-user list, deployment default); `/managed/settings` with the
  lock-out refusal; `/managed/reload` removed.
- Browser: `stamp()` and resend-token removed; admin modules on cookie auth with error mapping;
  a settings page and a per-user modules editor in `/solAdmin`; `rbac.ts` reads the module list
  from the profile instead of its hard-coded table.
- Deletes: `bootstrapAdminToken`, the bearer tokens in `users.yaml`, the Reload button and call.

**Phase 3: Credentials and relay server-side.** Step 3A (the Direct relay stops forwarding the
gateway's sign-in cookie; the SDK session log masks credentials) and step 3B (`keyfile.go`,
`storecrypt.go`: the store key and both store files encrypted whole; `validateConn` checks hostname,
required ports and credential characters) code on `feature/rbac` 2026-11-01. Step 3C (`relay.go`: the read-only
SEMP relay; `newUpstreamTransport` shared with the Direct relay, with a 10 s connect bound) and step 3D
(`dial.go`, `smf.go`, `sockets.go`: the dial endpoint, the SMF WebSocket gate and socket revocation)
code on `feature/rbac` 2026-11-02. Step 3E, the browser cutover, code on `feature/rbac` 2026-11-02:
`/managed/me` names brokers and VPNs only and the site seed is gone (`SITE_SEED_FILE`,
`loadOrGenerateSeed`); the Direct relay answers `404` under `CONN_MODES=managed`; the browser's
`managed-profile.ts` (`ctx.managedProfile`, names only, `dial(target, {connect})`) replaces
`encode.ts` and `managed-session-store.ts`; SEMP goes through the relay (`SempConfig.relayBase`,
no Authorization header; a relay `401` signs out) and SMF through dial and the gate
(`SolaceConfig.smfPath`, the password handed straight to the SDK); queue-copy's provisioned
destination does the same; connection-management sends passwords as typed; Queue Browser's
read-only rows became downgrade-only (`ui-table.ts`), replacing the `_permissions` write;
`check-bundles` gained the `/managed/dial` and `/managed/relay/` markers; the docs-secrecy policy
is retired and the docs name the store format. The Phase 3 review then fixed: the Direct relay
drops an upstream `Set-Cookie` naming the gateway's sign-in cookie; a relay `401` on any later
SEMP call of queue-copy's provisioned destination signs out (`semp-client.ts`); a refused dial
during a Managed VPN switch ends the switch; a signed port such as `+8080` is refused at save;
and the lines Phase 3 added are plain ASCII. Step 3F is the end-to-end run: `./scripts/dev.sh e2e`
(`docker/docker-compose.e2e.yaml`, `scripts/e2e.mjs`, fourteen numbered checks; see
contributing.md, "End-to-end run"). Its first version passed all fourteen against a local Docker
broker; against an existing broker, read-only, it passed all fourteen on 2026-11-06, which closed
Phase 3. The image ships no root CAs, so the run mounts the host's standard root bundle beside the
broker CA (that broker's SEMP port presents a chain ending in a standard root).
- Key file generated on first run; `users.yaml` and `connections.yaml` encrypted whole; refuse to
  start on an encrypted store without its key; `/managed/relay/{broker}` with credential
  injection; `dial` endpoint; WebSocket upgrade gating.
- Browser deletes: `encode.ts`, `managed-session-store.ts`, the `_permissions` write.
  `managed-semp-filter.ts` stays. `queue-copy` provisioned destination uses `dial`.
- Docs-secrecy policy retired; `rbac-variant-plan.md` rewritten.

**Phase 4: the managed demo.** Code on `feature/rbac` 2026-11-05, design per Decision "Managed
demo" (the real modules, not a mini app).
- Contract: `go-web-proxy/testdata/contract/` (seed, request cases with the real answers, validation
  vectors), proved against the real gateway by `contract_test.go` (`-update` rewrites the answers)
  and against the fake by `tests/mock-broker/gateway/contract.test.ts`.
- Boot: `mockRedirects(variant)` gives the `managed-demo` variant its own boot,
  `src/mock-broker/boot.managed.ts`. The demo broker serves several brokers (`fixtures.BROKERS`,
  `direct` for mock.html).
- Fake gateway, `src/mock-broker/gateway/`:
  - the router in the gateway's gate order;
  - `/hosted`, `me`, `logout`, `dial`, the relay, `users`, `connections` and `settings`;
  - sessions, the sign-in throttle and the SMF socket gate with its revocations;
  - the sign-in and password pages as layers.

  Not simulated: the cross-site check, the body cap, the unauthenticated throttle, the in-flight
  cap, and enforcement of a saved access list. Sign-ins reload the page; the state rides in
  sessionStorage. The page's other network APIs throw.
- Variant `managed-demo`: no `admin-login`; the admin editors are sidebar entries. Built by
  `npm run build:managed-demo`. The demo panel gains the demo accounts and the gateway events.
- Ship: `RELEASE_BUNDLES` gains `managed-demo.html`, and `check-bundles` gains a third category
  (both marker sets, no network). `tests/build/no-network-apis.test.ts` keeps the app source on
  `fetch`.
- Drift: `routes.test.ts` (every route through its shipping service), `error-codes.test.ts` (every
  error code placed), and `demo-flow.test.ts` (whole sessions through the real Kernel).
- Alongside: User Management and Connection Management lists gained column labels and empty
  notes. The managed account control moved to the sidebar footer. The sidebar shows the Solace
  Message Utility logo, and the Direct form's URL Path fields appear on demand.

**Phase 5: Container-only distribution** (decided 2026-11-06). The standard and managed images are
the only way to run the gateway; the Release stops attaching `go-web-proxy[-managed]-<os>-<arch>`.
- `tag.yml`: the `binaries` job also emits the HTML bundles the Release uploads (no `bin-*`
  artifact means no assets at all), so it stays, as one leg. `BUILD_TARGETS` becomes
  `[{"os":"linux","arch":"amd64"}]` (a repository variable, set by the user), and the `release`
  job uploads `RELEASE_BUNDLES` and `SHA256SUMS.txt` only, without `dist/go-web-proxy-*`. Deviation
  8 and the job comments say why the job keeps its name.
- `dev.sh`/`dev.ps1` `build` still compiles both gateways for the host, as a compile check; the
  images build their own in `docker/Dockerfile`.
- `tests/build/check-bundles.test.ts`: the Release step uploads no `go-web-proxy-*`.
- The images ship the two vendor scripts (decided 2026-11-06), so no deployment mounts them.
  `solclientjs` and `jszip` become exact-version dependencies (`npm install --save-exact
  solclientjs@10.18.3 jszip@3.10.2`, run by the user): the lockfile holds their hashes and `scan`
  audits them. The `pwa-builder` stage of `docker/Dockerfile` copies
  `node_modules/solclientjs/lib-browser/solclient.js` and `node_modules/jszip/dist/jszip.min.js`
  next to `index.html`, and their licence files into `licenses/`: the SDK's `LICENSE.txt`,
  `licenses.txt` and `COPYRIGHT.txt` (its API licence asks that every notice travel with it), and
  JSZip's `LICENSE.markdown` (taken under MIT). A missing file fails the image build. The Release
  HTML files are unchanged, since nothing imports either package, and the `dist` branch keeps its
  copies for Pages.
  - `docker/docker-compose.yaml` drops its vendor mounts; `scripts/e2e.mjs` logs in with the
    pinned SDK instead of `dist/solclient.js`.
  - New `tests/build/vendor-scripts.test.ts`: each pin is one exact version at or above the
    shell's `MIN_VERSION` (`src/index.html`), and each file the Dockerfile copies exists in the
    installed package.
  - Docs: deployment.md (no vendor mounts, and the SDK's browser build is `lib-browser/`, not
    `lib/`), README's `docker run`, developer-guide's `image up` note, contributing's e2e
    prerequisites, the user guide's vendor note.
- `SSL_CERT_FILE`: Go on Linux also reads it to find its root bundle, so a gateway started with it
  set ignores any system bundle. With no binaries shipped this only bites a container that sets it
  and mounts a bundle at Go's path; the `SSL_CERT_FILE` row in deployment.md says so.
- Docs: git.md (the Release contents, the `binaries` row, `BUILD_TARGETS`, the "binary reports
  `dev`" row), deployment.md ("Self-host the static files" lists the Release assets), the
  `CLAUDE.md` Build Modes (the gate's binaries are a compile check, not shipped).

## 8. Constraints that stay

`FROM scratch`, CGO off, stdlib plus `yaml.v3`; 100% web coverage and the Go floor; mirrored
`dev.sh`/`dev.ps1` with CI calling task names; module anchors (no cross-module imports, no global
state, factories); tests and docs in the same change; no `v*` tag from this branch.

## 9. Risks

- Gateway tests run without a broker: credential injection and WebSocket gating are tested against
  `httptest` fakes. The first real check is a scripted, read-only run (`./scripts/dev.sh e2e`)
  against an existing broker at the end of Phase 3; it passed on 2026-11-06.
- One Go process holds all sessions; a restart signs everyone out. Acceptable for this tool.
- With SEMP unparsed by the gateway, the threat-model line "guardrails are UX, not a boundary"
  stays true for queues. Document it; do not imply otherwise.
- `tag.yml`'s publish flow is still untested until the first `v*` tag on `main`.

## 10. Next step

Phases 0 to 4 are complete on `feature/rbac`; the end-to-end run against an existing broker
(`./scripts/dev.sh e2e`) passed on 2026-11-06. Phase 5 (container-only distribution) comes next,
then the pull request to `main` and the first managed release tag.
