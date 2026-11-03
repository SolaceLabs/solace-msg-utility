# Managed Connections (RBAC) — Design & Threat Model

> **Status: shipped.** This document describes managed mode as built. For the mechanics see
> [architecture.md](architecture.md) (§ Managed Connections) and for running it see
> [deployment.md](deployment.md) (§ Managed mode). An earlier external-repo / capability-proxy
> design was considered and rejected; this is the design that shipped.

## What it is

The default app is a pure browser tool: the user types broker SMF + SEMP credentials into the
`connections` module and the browser connects directly. **Managed mode** is for users who must NOT
hold broker credentials. The same `connections` module offers a second tab: the user signs in on the
gateway's own page, picks
from the **brokers and Message VPNs they are entitled to**, and the gateway connects them without
handing over the broker's credentials: SEMP goes through the gateway's read-only relay, which adds
the stored SEMP account, and SMF through the gateway's socket gate, with the VPN's client password
fetched (`POST /managed/dial`) at the moment the SDK logs in. Two admin-only modules
(`user-management`, `connection-management`) manage the entitlement data.

**It ships only in the managed image's bundle.** `managed.html` (the `managed` variant) carries both
paths and is served as that image's `index.html`; every Release bundle is Direct-only. Within
`managed.html`, which tabs the app offers is decided by the gateway's `/hosted` response (`CONN_MODES` / `DEFAULT_CONN` — see
[deployment.md](deployment.md)). With no gateway there is no `/hosted`, so Managed never appears.
Managed mode only works behind the [go-web-proxy](../go-web-proxy) in `MANAGED=true HOSTED=true`
mode, and only in the managed image, which serves the `managed` variant (`managed.html`) as its `index.html`; the standard bundle and every Release bundle are Direct-only. The entitlement editors live in their own `admin` variant, served at `/solAdmin` (see [architecture.md](architecture.md) — The admin app).

## Topology

```text
 Browser (managed.html, served by go-web-proxy in managed mode)
   /login (gateway page) -- password -> session cookie (HttpOnly, SameSite=Lax)
   connections -- Managed tab: GET /managed/me on the cookie
        +- profile (broker + VPN NAMES only) -> core managed profile; on Connect:
             SEMP -- /managed/relay/{broker}/SEMP/...   (no Authorization header)
             SMF  -- POST /managed/dial {broker, vpn} -> {smfPath, user, pass}
                     -> SDK opens wss://{page host}/managed/smf/{broker}/{vpn}
   queue-browser -- entitlement-filtered queue-picker; read-only rows downgrade Delete
   queue-copy -- source filtered as above; destination may use a provisioned broker + VPN
   (administration is a SEPARATE app at /solAdmin: admin-login + user-management +
    connection-management, on /managed/{users,connections,settings}. Served only to an
    admin session; it opens NO broker connection.)
        | every request -> same origin, same session cookie
        v
 go-web-proxy (MANAGED mode)
   /hosted {hosted, connModes, defaultConn}, SPA
   Direct relay /{scheme}/{port}/{host}/... -- 404 under CONN_MODES=managed (open under both)
   + users.yaml + connections.yaml sealed whole with the store key (STORE_KEY_FILE),
     loaded strictly; bootstraps an admin who must change the password if absent
   + /login, /login/password -> slow per-user password hash, throttle, session cookie
   + GET /managed/me -> entitled broker/VPN names + queue globs + modules; POST /managed/logout
   + /managed/relay/{broker}/SEMP... -> reads only; adds the stored SEMP account
   + POST /managed/dial -> one VPN's client credential to an entitled user
   + /managed/smf/{broker}/{vpn} -> own-origin WebSocket joined to the broker's SMF port (TLS);
     closed on revocation
   + /managed/{users,connections,settings} (admin-only, on the session cookie)
        v
 Solace broker (SEMP + SMF/WebSocket) -- use a READ-ONLY / least-privilege SEMP account
```

## Locked decisions

- **Enforcement = gateway custody and gating per broker and VPN, client guardrails per queue.**
  The gateway holds every broker credential and relays SEMP (reads only) and SMF only for a signed-in
  user entitled to the broker and VPN; per-queue globs filter discovery and guardrail the UI in the
  client (see Threat model).
- **The gateway owns sign-in and the session.** Passwords are sent over TLS to the gateway's own
  `/login` page and checked there against a slow per-user password hash with a constant-time
  compare; the gateway throttles guessing and issues an `HttpOnly` `Secure` `SameSite=Lax` session
  cookie (10 minutes idle, 30 absolute, in `config.yaml`). Every `/managed/*` call, admin CRUD
  included, authenticates by that cookie. Nothing in the browser can read it.
- **Broker credentials live in the gateway.** `users.yaml` and `connections.yaml` are sealed whole
  with AES-256-GCM under a 32-byte store key the gateway generates on a fresh volume
  (`STORE_KEY_FILE`, environment-only); a 6-byte header (`SMUS`, version, role) is the associated
  data, so neither file can stand in for the other. Admins send broker passwords as typed, over TLS.
  `/managed/me` carries names only.
- **SEMP never reaches the browser.** The relay adds the broker's stored SEMP account to each request
  and forwards **reads only**: `GET`/`HEAD` under `/SEMP/v2/` and a SEMP v1 `<rpc>` whose one command
  is `<show>`; anything else is `403 read_only`. A broker `401`/`407` or redirect is a `502`, so a
  wrong stored credential never looks like an ended session.
- **SMF needs the password in the browser, once.** The SDK must log in itself, so `POST
  /managed/dial` returns the VPN's client username and password to an entitled user, and the browser
  passes it straight to the SDK inside the dial callback; it is never stored in `AppState`, and a
  reconnect dials again. Dial is stateless (no ticket), so the SDK's own reconnects keep working.
- **The SMF socket is gated and revocable.** `/managed/smf/{broker}/{vpn}` upgrades only with the
  session, an `Origin` equal to the gateway's own `https` address, and the entitlement. The gateway
  sets no timer on an open socket (the SMF API's keep-alive owns its lifetime); it closes it on
  sign-out, a password change, the user deleted or their administrator flag changed, the entitlement
  or the VPN removed, or the broker deleted.
- **Bootstrap admin.** If the users file is missing, the gateway writes one admin (`admin`, no broker
  access) whose password comes from `ADMIN_PASSWORD` / `ADMIN_PASSWORD_FILE`, or is generated and
  logged once; the first sign-in must change it before anything else is reachable.
- **RBAC semantics.** `operate ⊇ read-only`; dropdowns show the union. Globs are **case-sensitive**
  and support multiple / leading / middle / trailing `*`. A row matches only when its `brokers` AND
  `msgVpns` AND `queues` all match the currently-connected broker + VPN + candidate queue. The
  matchers live in [src/core/rbac.ts](../src/core/rbac.ts) (`matchGlob`, `isModuleVisible`,
  `isVpnVisible`, `isQueueVisible`, `canOperate`) and are mirrored in the proxy's `rbac.go`, pinned by
  a shared conformance vector.
- **Admin modules are gated by `admin: true`** via `isModuleVisible` (the kernel re-renders the
  sidebar on `rbac:changed`).
- **Module control.** Every other module of the managed app is shown only if the gateway granted
  it: `/managed/me` returns `modules`, the user's own list in `users.yaml` or the deployment
  default (`modules.userDefault`), always within `modules.offered` in `config.yaml`. Connections is
  always shown. The catalog an admin can grant from is Queue Browser and Queue Copy.
- **Connection posture is one enum.** `CONN_MODES` (`direct` | `managed` | `both`) plus
  `DEFAULT_CONN` reach the app through `/hosted`; `resolveConnTabs` turns them into the tab list and
  `resolveDestCredModes` derives what a *secondary* connection may offer. One source of truth, so the
  primary's tabs and a module's secondary credential options cannot drift apart. No `/hosted` ⇒
  Direct only, always.
- **Managed is a convenience unless the deployment makes it exclusive.** Under `CONN_MODES=both` a
  user may simply switch to the Direct tab and type any credentials they happen to know — every
  entitlement guarantee in this document holds **only** under `CONN_MODES=managed`. `both` is
  supported deliberately (mixed audiences), and is a documented bypass, not an oversight.
- **The provisioned profile is core-owned and injected.** The broker and VPN names live in
  [managed-profile.ts](../src/core/services/managed-profile.ts), reached via
  `AppContext.managedProfile`. `AppState.managed` carries **matcher inputs only** (names, globs).
  Callers ask the profile to *dial a target they name* and receive a ready config in a callback (the
  relay base for SEMP, the dialled credential for SMF). This is what lets a second module (queue-copy)
  open a provisioned connection without importing the connections module and without
  credential-bearing globals.
- **Modules that cannot be filtered are hidden, not trusted.** `MODULE_REQUIREMENTS` in
  [rbac.ts](../src/core/rbac.ts) marks `queue-subscription-explorer` and `queue-discovery` as
  requiring unfiltered SEMP; both are hidden in **every** managed session, admin included, because
  they read over SEMP v1 RPC which the discovery filter does not rewrite (see Threat model). The
  gateway's module catalog leaves them out too, so module control cannot grant them.
- **Writes are gated where they happen.** Copying *into* a queue is a write, so queue-copy's
  destination picker lists at `operate` scope and a final destination gate refuses a target the user
  cannot operate on. **Topic destinations are refused on any provisioned publish path** — entitlements
  are expressed per queue and a topic fans out to every queue subscribed to it, so it cannot be
  checked. It is refused rather than guessed.

## Threat model (honest, documented)

- **The gateway checks the broker and the VPN, not the queue.** SEMP and SMF reach a broker only
  for a signed-in user entitled to it (SEMP: to any of its VPNs; SMF: to that VPN). Within that, the
  per-queue globs and read-only rows are applied in the client: they filter discovery, refuse a bind
  to a non-entitled queue, and downgrade Delete, but the SMF session itself could do whatever the
  VPN's client username allows. Queue rules are therefore **UX, not a security boundary**; scope each
  VPN's client username to what its users may do.
- **The relay reads what the SEMP account can see.** A user entitled to one VPN on a broker can
  read, through the relay, every VPN the broker's stored SEMP account can. Provision brokers per
  audience and give each a SEMP account scoped to them.
- **The dialled password works outside the app.** An entitled user receives their VPN's client
  password from `dial` and can use it against the broker from anywhere that reaches it directly.
  Keep the broker's own ports off networks users can reach.
- **A socket outlives its sign-in session.** By design it closes on revocation, not on the session's
  idle or absolute limit.
- **`CONN_MODES=both` is a full bypass** of everything in this document: the Direct tab and its open
  relay accept any credentials the user can supply. Deployments that need the entitlement model to
  *hold* must set `CONN_MODES=managed`, under which the Direct relay answers `404`.
- **The filter is per-transport, not per-capability.** `filterSempFetch` rewrites exactly two SEMP
  **v2 monitor list** shapes. Every **SEMP v1 RPC** (`POST /SEMP`), every single-object GET, and every
  non-JSON response passes through untouched. Any code path that reaches the broker another way is
  unprotected by construction. Two consequences are handled explicitly, and the pattern is the thing
  to remember when adding features:
  - `queue-subscription-explorer` / `queue-discovery` read only over v1 RPC ⇒ **hidden** in managed
    sessions rather than shipped unfiltered.
  - queue-copy's verify also uses v1 RPC ⇒ a **source gate** refuses a non-entitled queue *before*
    the probe is spawned, so a managed user cannot type an arbitrary queue name and read back its
    depth, size and message IDs.
- **The store key opens both stores.** A stolen `users.yaml` or `connections.yaml` is useless
  without it, so keep `STORE_KEY_FILE` on a separate mount or secret where you can; it shares the
  `/managed` volume by default. Losing it means re-provisioning users and connections.
- **No managed code or gateway call ships outside `managed.html`.** `scripts/check-bundles.mjs`
  proves on the build that no Release bundle carries the managed UI or the `/managed/dial` and
  `/managed/relay/` calls; the core managed profile in every bundle holds names only.
- The **session cookie is a bearer credential** for its lifetime (`HttpOnly`, `Secure`,
  `SameSite=Lax`, ended by idle and absolute limits, sign-out, a restart, or an admin change to the
  account). The users file holds slow password hashes, not replayable bearers. Mitigations:
  filesystem permissions + TLS. (The admin CRUD list endpoints never return password hashes or
  broker passwords.)
- **Required mitigation:** configure per-broker **read-only / least-privilege SEMP accounts** (never
  broker-admin) as the second line behind the read-only relay, and least-privilege VPN client
  usernames. Managed mode is fit for **trusted-internal** use.

## Open hardening items (input to the connections rework)

Found in the October 2026 branch review and parked here for the Managed connections / Connections module rework ([rbac-rework-plan.md](rbac-rework-plan.md) section 5 gives each item's phase). Phase 2 closed items 1, 2, 3, 5, 10, 11 and 12 and part of 6; Phase 3 closed 4, 6, 8 and 9. Each says what shipped. Items the threat model above already accepts are not repeated.

**Gateway (`go-web-proxy/`)**

1. **Login guessing.** *Closed in Phase 2.* The gateway checks passwords against a slow per-user hash with a constant-time compare ([password.go](../go-web-proxy/password.go)); an unknown user costs the same. [throttle.go](../go-web-proxy/throttle.go) backs off per username and per client after `login.maxFailures` failures and refuses a blocked attempt before the password is checked, and every request without a session draws from a per-client budget (`login.*` in `config.yaml`).
2. **Unbounded bodies before auth.** *Closed in Phase 2.* The session is checked before any body is read, and every `/managed/*` body is capped at 64 KiB with unknown fields and trailing data rejected ([managed.go](../go-web-proxy/managed.go)); the sign-in forms share the cap.
3. **Bootstrap admin.** *Closed in Phase 2.* No fixed password: the bootstrap admin takes `ADMIN_PASSWORD` / `ADMIN_PASSWORD_FILE` or a generated password logged once, and must change it at first sign-in before anything else is reachable ([store.go](../go-web-proxy/store.go), [pages.go](../go-web-proxy/pages.go)).
4. **Site seed to every user.** *Closed in Phase 3:* the site seed is gone. `/managed/me` names brokers and VPNs only, and the gateway keeps every credential in its encrypted store.
5. **`/managed/reload` is open to any user.** *Closed in Phase 2:* the endpoint and the Refresh button's reload are gone; the gateway is the files' only writer and a hand edit needs a restart.
6. **No shape check on stored secrets.** *Closed in Phases 2 and 3.* Passwords are hashed by the gateway, both files are validated strictly on load (unknown keys, duplicates, names, ports, hash format, a bare hostname, the ports a connection uses, no control characters in a credential), and both are sealed whole with the store key.
7. **Queue entitlement is client-side only.** *Open, accepted for now.* Since Phase 3 the gateway gates SEMP and SMF per broker and VPN, but queue globs are still enforced only in the browser (see the threat model). Gateway-side queue filtering is out of the rework's scope.

**Browser (`src/`)**

8. **Plaintext outlives the dial.** *Closed in Phase 3:* no SEMP credential reaches the browser (relay), and the dialled SMF password goes straight to the SDK inside `managedProfile.dial`'s callback; `AppState` carries blank passwords, so Queue Copy's source mirror shows none.
9. **Permission upgrade on browse.** *Closed in Phase 3:* the panel no longer writes `_messageConsumer._permissions`; Queue Browser's `updatePermissionUI` (`ui-table.ts`) makes a queue read-only when the broker says so **or** a managed read-only row covers it, never the other way.
10. **Two session owners.** *Closed in Phase 2:* the gateway cookie is the one session; the Managed panel and `admin-login` both read it back (`GET /managed/me`) and sign out through `POST /managed/logout`, and `rbac:sign-out-requested` keeps its contract. (The panel's sign-out still disconnects SEMP unconditionally; with the Direct-connect interlock that only ever drops the managed connection's own SEMP.)
11. **Self-demotion in `/solAdmin`.** *Closed in Phase 2:* a changed administrator flag ends that user's sessions at the gateway, and `user-management` signs the admin app out when it is the admin's own.
12. **Generic admin errors and in-memory sessions.** *Closed in Phase 2:* the gateway answers `{"error": code}` and [managed-api.ts](../src/core/services/managed-api.ts) maps every code to a message (a rejected field shows the gateway's reason); the session is the cookie, so a page reload keeps it.

**Also for the rework**

- Queue Subscription Explorer and Queue Discovery are hidden in every managed session (admins included) because they read over unfiltered SEMP v1 RPC; `SubscriptionSource` exists as types only.
- `src/css/main.css` still imports the stylesheets of modules the variant registry no longer bundles (queue-discovery everywhere; queue-copy and the subscription explorer in `min.html`).

## YAML schemas (as sealed in the store files; edited only through the admin app)

```yaml
# users.yaml
msg-utility-users:
  - username: admin
    password: <password hash>    # written by the gateway; the password never leaves it
    mustChangePassword: true     # bootstrap admin only, until the first password change
    admin: true
    operate:   [{ brokers: '*', msgVpns: vpn1, queues: queue1 }]
    read-only: [{ brokers: '*', msgVpns: '*',  queues: '*' }]
    modules:   [queue-browser]   # optional: absent = modules.userDefault, [] = none
# connections.yaml  (use a READ-ONLY SEMP account)
msg-utility-connections:
  - broker: broker-name
    hostname: www.example.com
    semp:   { port: 1943, username: monitor, password: <password> }   # added to relayed SEMP requests
    client: { port: 1443, msgVpns: [ { name: vpn-name, username: default, password: <password> } ] }   # handed out by dial
```

See [architecture.md](architecture.md) for the module/registry/RBAC mechanics and
[deployment.md](deployment.md) for the environment variables, bootstrap, the store key, and the
operational security checklist.
