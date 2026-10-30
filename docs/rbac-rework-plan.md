# Managed mode rework: direction and decisions

Status: walked through end to end on 2026-10-29, all decisions settled. Branch `feature/rbac`. This is the plan for
the plan: what was decided and the phases. Detailed per-phase plans follow. Supersedes the "Open
hardening items" section of [rbac-variant-plan.md](rbac-variant-plan.md) when adopted.

## 1. Goal

- Managed code ships only in the managed container image. The Release HTML (`index.html`,
  `min.html`, ...) carries none of it.
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
| Store encryption | `users.yaml` and `connections.yaml` are stored encrypted as whole files with a key file only the gateway reads. The gateway generates the key on first run if absent (path from env, replaces `SITE_SEED_FILE`, owner-only permissions). SEMP: gateway injects the credential. SMF: one-shot `POST /managed/dial` returns the connection once | Site seed and `unpack` leave the browser. SEMP password never reaches it. No operator step for the key; losing it means re-provisioning users and connections. Encrypted store present but key missing: the gateway refuses to start and says so. `config.yaml` stays readable because the standard image has no admin UI and is hand-edited. The key file and its path never live in `config.yaml`: `SITE_SEED_FILE` (later `KEY_FILE`) stays environment-only, so the settings file can never redirect the gateway to another secret. |
| SEMP relay | Gateway only injects the credential and forwards; no path parsing | VPN/queue filtering stays in the PWA (`managed-semp-filter.ts`), so queue globs remain a UI filter on both planes. Protection is credential custody plus a session-bound relay keyed by broker name: an entitled user can reach any VPN/queue on a provisioned broker, not other brokers. |
| Bundle delivery | New `managed` variant builds `dist/managed.html`; the managed image copies it over `index.html`. The Release uploads an explicit list (`index`, `min`, `no-payload`, `no-queue-copy`, `mock`), never `solAdmin.html` or `managed.html` | Build-time registry, nothing loads at runtime. Release bundles lose the managed code; `tag.yml` stops uploading `dist/*`. |
| `CONN_MODES=both` | Kept in the managed image | The Direct relay stays present there; its exposure is handled by the client access list below. |
| Relay exposure | Relay stays open to any host. New client access list, CIDR-based, default allow-all | Applies to every route, not only the relay. Behind a reverse proxy the client IP comes from `X-Forwarded-For` only when the proxy is listed as trusted. |
| Docs-secrecy policy | Retired in Phase 3, once the browser transform is deleted | `CLAUDE.md` section, `check-docs-secrecy.mjs` and its tests removed; docs become specific. |
| Managed demo | A separate one-time mini app that mimics managed behaviour; not shared code | Phase 4. `mock.html` stays a Direct-only demo. |
| SEMP v1 RPC | Not parsed by the gateway (follows from the SEMP relay decision) | Which modules a managed session sees is decided by module control, below. |
| Module control | Deployment ceiling in `config.yaml` (modules the image offers) plus a per-user `modules` list in `users.yaml` within it, editable in `/solAdmin`; `/managed/me` returns the result. A user without a list gets the deployment default, itself a `config.yaml` setting (`all` or `none`, default `all`). Admin-only modules still require `admin` | Replaces the hard-coded table in `src/core/rbac.ts`. The SEMP v1 modules become ordinary entries the operator may or may not offer. |
| Module scope | Show/hide only. Read-only vs operate stays per queue | A read-only queue admits no operate action in any module, e.g. `queue-copy` cannot copy into it. No per-module level. |
| Config editing | `config.yaml` holds every setting: connection modes, default tab, hosted flag, paths, TLS, log level, timeouts, throttle limits, module ceiling and default, client access list, trusted proxies. Env vars are read only on first start, to seed the file when it does not exist; the path to the file itself and the key file path stay env vars, never in the file. Admin-editable in `/solAdmin` via a settings page and endpoint | One more admin surface; same cookie auth, same validation as the other writers. The startup checks on connection modes run on load and on every write. A changed env var after first start has no effect until the file is removed. The standard image, with no admin UI, is hand-edited. The endpoint refuses an access list that would exclude the requesting client. |
| Login guessing | Constant-time compare plus in-memory per-user and per-client back-off, limits in `config.yaml` | Item 1. |
| Request bodies | Size cap on every `/managed/*` route, unknown JSON fields rejected | Item 2. |
| Bootstrap admin | Random password generated and logged on first run; only the password change is allowed until it is changed | Item 3. |
| Reload | `/managed/reload` dropped | Item 5. The gateway is the only writer and applies every change at once; a hand edit on the volume needs a restart. The Reload button and the reload call in `managed-service.ts` go. |
| Stored shapes | Gateway is the only writer and validates every file on load. Fixed store path on the `/managed` volume, no hidden or random location | Item 6. Persistence across upgrades needs a mountable path; protection comes from the store encryption above, not from where the files sit. |
| Browser namespacing | Plaintext stays inside the dial callback, never in `AppState` or form fields | Raises effort, is not a boundary. Item 8. |

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
  SMF connect  ---- POST /managed/dial ----->  check broker/VPN entitlement, decrypt, return once
  SDK session  ---- WSS /managed/smf/{broker}/{vpn} -> cookie + entitlement checked on upgrade
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
  managed UI, `managed.html` does. The core managed store still ships everywhere until Phase 3.
- Docs: variants, build modes, Dockerfile and `tag.yml` comments ("same bundle" is no longer true).

**Phase 2: Gateway sessions and auth.**
- `/login` page, `/managed/logout`, `/managed/me`; cookie sessions with the 10/30 min defaults;
  bundle served only with a session under `CONN_MODES=managed`; password hashing; throttle; body
  caps; random bootstrap with forced change; session invalidation; uniform responses; module
  control (config ceiling, per-user list, deployment default); `/managed/settings` with the
  lock-out refusal; `/managed/reload` removed.
- Browser: `stamp()` and resend-token removed; admin modules on cookie auth with error mapping;
  a settings page and a per-user modules editor in `/solAdmin`; `rbac.ts` reads the module list
  from the profile instead of its hard-coded table.
- Deletes: `bootstrapAdminToken`, the bearer tokens in `users.yaml`, the Reload button and call.

**Phase 3: Credentials and relay server-side.**
- Key file generated on first run; `users.yaml` and `connections.yaml` encrypted whole; refuse to
  start on an encrypted store without its key; `/managed/relay/{broker}` with credential
  injection; `dial` endpoint; WebSocket upgrade gating.
- Browser deletes: `encode.ts`, `managed-session-store.ts`, the `_permissions` write.
  `managed-semp-filter.ts` stays. `queue-copy` provisioned destination uses `dial`.
- Docs-secrecy policy retired; `rbac-variant-plan.md` rewritten.

**Phase 4:** separate managed demo mini app; anything deferred from section 3.

## 8. Constraints that stay

`FROM scratch`, CGO off, stdlib plus `yaml.v3`; 100% web coverage and the Go floor; mirrored
`dev.sh`/`dev.ps1` with CI calling task names; module anchors (no cross-module imports, no global
state, factories); tests and docs in the same change; no `v*` tag from this branch.

## 9. Risks

- Gateway tests run without a broker: credential injection and WebSocket gating are tested against
  `httptest` fakes. The first real check is a scripted run against a local Docker broker at the
  end of Phase 3 (compose file, one provisioned user, one queue).
- One Go process holds all sessions; a restart signs everyone out. Acceptable for this tool.
- With SEMP unparsed by the gateway, the threat-model line "guardrails are UX, not a boundary"
  stays true for queues. Document it; do not imply otherwise.
- `tag.yml`'s publish flow is still untested until the first `v*` tag on `main`.

## 10. Next step

Detailed Phase 0 and Phase 1 plans. Before Phase 2 and 3 code: an adversarial design review
(ultracode) of the auth, settings-writer and relay designs.
