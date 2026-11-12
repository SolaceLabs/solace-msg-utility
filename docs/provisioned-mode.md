# Provisioned Mode

Provisioned mode is for teams whose users should not handle broker credentials. Users sign in to the gateway with their own account and see only the brokers and Message VPNs an administrator granted them. They never see or type a broker's address or password.

It is the same container image as [Gateway mode](deployment.md#gateway-mode), with one setting changed. Everything in the deployment guide about the image, TLS and mounts applies here too.

---

## Contents

- [When to use it](#when-to-use-it)
- [How it works](#how-it-works)
- [Start it](#start-it)
- [Configure](#configure)
  - [Connection modes](#connection-modes)
  - [Sessions and sign-in](#sessions-and-sign-in)
  - [Who can reach the gateway](#who-can-reach-the-gateway)
  - [What users may open](#what-users-may-open)
  - [Audit settings](#audit-settings)
  - [Environment variables](#environment-variables)
- [Administer](#administer)
- [Back up and restore](#back-up-and-restore)
- [Audit trail](#audit-trail)
- [Security checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

---

## When to use it

Choose Provisioned mode when:

- several people need the tool, and you would rather not hand each of them broker passwords;
- different people should see different brokers, VPNs or queues;
- you want one place to grant and revoke access.

Stay with Gateway mode when every user already has their own broker credentials and should be able to use them freely.

To see it without deploying anything, open `provisioned-demo.html` from any Release: see [demo.md](demo.md#provisioned-demo-provisioned-demohtml).

---

## How it works

1. **An administrator adds the brokers.** For each broker they enter its address, a SEMP account the gateway uses to read it, and a client username and password for each Message VPN. These live only on the gateway, encrypted.
2. **The administrator adds users** and grants each one brokers, VPNs and queues, either read-only or with permission to operate (delete, move, copy into).
3. **A user signs in** at the gateway and picks a broker and VPN from the ones they were granted. The gateway connects to the broker for them.
4. **What the browser gets:** the broker's management data passes through the gateway, which uses its own SEMP account and filters what the user may see. To open a messaging connection, the browser is given the client password of a VPN the user is granted, and nothing else.
5. **Signing out**, an expired session, or an administrator revoking access closes the user's broker connections.

Because the browser receives a VPN's client password while it is connected, give each VPN a client username scoped to what its users may do (see the [security checklist](#security-checklist)).

**Queue Copy's destination** follows the primary connection. In a Provisioned session it is one shared connection card (Broker and Message VPN pickers from the signed-in profile, one Connect, Disconnect, a status line); the typed Broker URL, SEMP and Client cards and the Provisioned/Manual radio are not shown, so a Provisioned user has no manual destination and no way to type a broker address. Connect calls `ctx.managedProfile.dial(target, { connect })` and builds the destination client inside that callback: the VPN's client credential goes straight to the SDK and is never stored, and destination SEMP goes through the gateway's relay (`/managed/relay/{broker}/SEMP...`), opened only when the destination broker differs from the primary's. Both dials are checked against the user's entitlements by the gateway as for the primary. The card is locked while a connect is in flight, a refresh that withdraws the connected VPN cancels the connect or closes the destination, and typed-credential destinations exist only with a Direct primary connection (Standalone or Gateway mode). For operators: with `SMU_CONN_MODES=both` the manual destination bypass that previously existed beside Provisioned is gone; a Provisioned session can write only where its entitlements allow.

---

## Start it

You need Docker with Compose, and a host your users' browsers can reach on port 9443.

1. Download [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml) from the release you are deploying.
2. Beside it, put the first administrator's password, 12 to 128 characters, in a file named `admin-password`, and make the directory for scheduled backups. Give both to the gateway's user only (left to Docker, the directory would be root's and take no backups):

   ```bash
   chmod 400 admin-password && sudo chown 65532 admin-password
   mkdir -p backup && chmod 700 backup && sudo chown 65532 backup
   ```

3. Start it, pinning the release:

   ```bash
   SMU_VERSION=3.6.0 docker compose -f compose.provisioned.yaml up -d
   ```

4. Open `https://<host>:9443/`, sign in as `admin` with that password, and choose a new one. Nothing else works until you do.
5. **Set up backups.** On the admin console's **Backup & Restore** page, set a schedule and its passphrase (see [Back up and restore](#back-up-and-restore)). A backup restores the users and connections on any deployment; keep the passphrase secret and apart from the backups.

Then open the admin console at `https://<host>:9443/solAdmin` to add brokers and users.

**Without the password file**, the gateway generates a password for `admin` and prints it **once** in its log (`docker compose logs gateway`). Lost it before signing in? Delete `users.yaml` and restart.

**Using `docker run` instead:** set `SMU_CONN_MODES=provisioned`, and mount a host directory at `/backup` (prepared as in step 2) so scheduled backups outlive the container. Without that mount they are written inside the container and the Backup & Restore page still looks healthy, but recreating the container (an upgrade) deletes them. The users and connections stay with the container too: before replacing it, export a backup and import it into the new one. The compose file keeps both across upgrades.

```bash
docker run -d -p 9443:9443 \
  -e SMU_CONN_MODES=provisioned \
  -e SMU_ADMIN_PASSWORD_FILE=/run/secrets/admin-password \
  -v "$PWD/admin-password:/run/secrets/admin-password:ro" \
  -v "$PWD/backup:/backup" \
  -v solace-tls:/tls \
  ghcr.io/solacelabs/solace-msg-utility:3.6.0
```

---

## Configure

The gateway's settings live in `config.yaml`. An administrator edits most of them on the admin console's **Gateway Settings** page; they apply at once. The rest change in the file, followed by a restart.

### Connection modes

| `SMU_CONN_MODES` | What users see | Recommended |
| --- | --- | --- |
| `provisioned` | Sign-in only | **Yes.** Grants are binding: no one reaches a broker they were not given. |
| `both` | Sign-in, plus the Direct form for typing broker details | Only for mixed audiences or a migration period. Anyone can connect through the Direct form with credentials they happen to know, outside their grants. |
| `direct` | The Direct form only | This is Gateway mode: no sign-in and no admin console. |

`SMU_DEFAULT_CONN` (`direct` or `provisioned`) picks which tab opens first under `both`.

The Gateway Settings page switches between `provisioned` and `both`. Leaving Provisioned mode (`direct`) also turns off the admin console, so it is done in `config.yaml` on the host, followed by a restart.

### Sessions and sign-in

| Key | Default | Recommended |
| --- | --- | --- |
| `session.idleMinutes` | `10` | Keep. A session ends after this long without a request. |
| `session.absoluteMinutes` | `30` | Keep, or raise for long copy jobs, up to `1440` (a day). |
| `login.maxFailures` | `5` | Keep. Wrong passwords allowed per account, and per client, before sign-in slows down. |
| `login.backoffSeconds` | `30` | Keep. The first wait; it doubles with each further failure. |
| `login.maxBackoffSeconds` | `900` | Keep. The longest wait. |
| `login.unauthenticatedPerMinute` | `60` | Keep, unless many users share one address (a NAT or proxy you have not listed in `access.trustedProxies`). |

The waits apply to the account as well as the client, so someone guessing at a known username can keep that user waiting for up to `login.maxBackoffSeconds`. The access list below, or a VPN in front of the gateway, is the answer.

### Who can reach the gateway

| Key | Default | Recommended |
| --- | --- | --- |
| `access.allow` | `[]` (everyone) | Your users' networks, for example `[10.0.0.0/8]`. The page refuses a list that would lock out your own browser. |
| `access.trustedProxies` | `[]` | The address of your reverse proxy, if there is one, so the gateway sees each user's own address. |

### What users may open

| Key | Default | Recommended |
| --- | --- | --- |
| `modules.offered` | `[queue-browser, queue-copy, queue-subscription-explorer]` | All three, unless no one should copy or move messages (drop `queue-copy`), or queue and topic names in VPNs a user is not granted must stay hidden from them (drop `queue-subscription-explorer`, see the [security checklist](#security-checklist)). A `config.yaml` written by an earlier version lists only the first two: add Queue Subscriptions in Gateway Settings to offer it. |
| `modules.userDefault` | `all` | `all` for a small team; `none` if each user should get modules explicitly on their account. |

### Audit settings

| Key | Default | Recommended |
| --- | --- | --- |
| `audit.stdout` | `false` | `true` if a log shipper reads the container's output and should carry the audit lines too; the file is written either way. Seeded by `SMU_SHOW_AUDIT`. |
| `audit.access` | `false` | Leave off unless you need to know who opened which broker: it adds a line for every dial, socket and SEMP relay request, which is a high volume (see [Audit trail](#audit-trail)). No environment variable. |

Both are on the Gateway Settings page and apply at the next audited event, with no restart.

### Environment variables

These seed `config.yaml` on the first start only, except the two `SMU_ADMIN_PASSWORD` variables, which are never written to it. The users store, the connections store and the store key are not settings: they always live at `/data/users.yaml`, `/data/connections.yaml` and `/data/store.key`, and you move data with Backup & Restore. A deployment that still sets `USERS_FILE`, `CONNECTIONS_FILE` or `STORE_KEY_FILE` (or the `usersFile` / `connectionsFile` keys in `config.yaml`) starts with a warning that the value is ignored. Gateways renamed their variables with an `SMU_` prefix; a start with an old name set is refused, see [deployment.md](deployment.md#settings).

| Variable | Default | Recommended |
| --- | --- | --- |
| `SMU_CONN_MODES` | `direct` | `provisioned` |
| `SMU_ADMIN_PASSWORD_FILE` | unset | A secret file, as in the compose file. Read only on the first start. |
| `SMU_ADMIN_PASSWORD` | unset | Avoid: an environment value is visible to anyone who can inspect the container. Set this or `SMU_ADMIN_PASSWORD_FILE`, not both. |
| `SMU_SHOW_AUDIT` | `false` | `true` or `false` (anything else stops the start). Seeds `audit.stdout`: copy each audit line to the container's standard output. Read on the first start only; after that `config.yaml` wins and a differing value is reported like the other `SMU_` variables. |

The rest (TLS, log level) are the same as in Gateway mode: see [Settings](deployment.md#settings).

---

## Administer

The admin console is at `https://<host>:9443/solAdmin`, for administrator accounts only.

- **User Management:** add users, reset passwords, make someone an administrator, and grant brokers, VPNs and queues. A grant can use `*` wildcards, for example queues `orders.*`.
- **Connection Management:** add brokers, their SEMP account and their VPNs' client credentials. Leave a password blank to keep the stored one. The gateway reaches each broker over TLS (`https` for SEMP, `wss` for messaging), so the ports are the broker's TLS ports, unless the connection's `scheme` names the plain one (`http` for SEMP, `ws` for messaging; each side set on its own). A connection stored before the field existed stays on TLS: an absent or blank scheme means TLS, so no record needs a migration. Pick `http` or `ws` only for a broker on a trusted network that does not serve TLS on that port: the gateway then reaches it unencrypted, and the SEMP and SMF credentials cross that hop in clear text. Set the scheme in Connections -> Add or Edit connection.
- **Gateway Settings:** the settings above, and a line under Access, "Your address as the gateway sees it", saying whether the address is the TCP peer or came from `X-Forwarded-For` through a trusted proxy. If it shows your proxy's address rather than yours, see [Client addresses behind Docker and proxies](deployment.md#client-addresses-behind-docker-and-proxies).

Every change to a user, a connection or the settings is also logged at `info` with the administrator's name and what changed (never a password), but the record to keep is the [audit trail](#audit-trail): it is always written, whatever `LOG_LEVEL` says.
- **Backup & Restore:** export the configuration to a file, import one, and schedule backups. See [Back up and restore](#back-up-and-restore).

Changes apply at once. Revoking a user's access closes their broker connections. A restart signs everyone out.

---

## Back up and restore

The admin console's **Backup & Restore** page keeps copies of the configuration: the users, the connections and the settings.

**What a backup holds.** The users with their password hashes (never the passwords), the connections with their SEMP and VPN credentials, and the gateway settings except the file paths (`tls.certFile`, `tls.keyFile`, `tls.trustDir`), which belong to each host. A backup is one JSON file, encrypted with AES-256-GCM under a key derived from a passphrase (PBKDF2-SHA256, 600,000 iterations, the cost of a user password). It does not use the store key, so it restores on any deployment. **Without the passphrase it cannot be opened**: keep the passphrase somewhere other than the backups.

**Export** downloads a backup to the browser, encrypted with the passphrase you type for it (12 to 128 characters).

**Scheduled backups** are written by the gateway itself, into `/backup` in the container: the image has no cron. Mount a host directory there to keep them outside the container:

```bash
mkdir -p backup && chmod 700 backup && sudo chown 65532 backup
# compose.provisioned.yaml mounts it: - ./backup:/backup
# docker run: -v "$PWD/backup:/backup"
```

The path is fixed; no setting moves it. On the page, choose how often (hourly at a minute, daily at a time, weekly on a day, or monthly on a day, all in UTC; a month without the chosen day backs up on its last day), how many files to keep, and the passphrase. The gateway keeps a key derived from that passphrase, encrypted with the store key in `backup.yaml` beside the stores, so it can write backups unattended; it never stores the passphrase. A backup is written as `smu-backup-<UTC time>.partial` and renamed to `.json` only once all of it is on disk, so anything that copies `*.json` from the directory never takes a half-written file; a `.partial` that a crash or a full disk left behind is deleted by the next run. After each backup it deletes the oldest beyond the number to keep, and only files it named (`smu-backup-<UTC time>.json`). **Back up now** writes one at once. A backup missed while the gateway was down is not caught up. The page shows the next and last backup, and why `/backup` cannot be written to when it cannot (most often: the host directory is not owned by UID `65532`). Each backup is logged at `info`, each failure at `error`.

Each saved backup's download icon saves the file as the gateway wrote it, to keep a copy off the host; it opens with the schedule's passphrase.

**Import** takes an uploaded file or one of the saved backups, and the passphrase it was made with. **Preview** lists, for each section, what the import would add, change and remove; then choose, per section:

| Section | Choices |
| --- | --- |
| Users | **Skip**, **Merge** (add the file's users and replace those with the same name; keep the rest), **Replace** (exactly the file's users) |
| Connections | **Skip**, **Merge**, **Replace**, by broker name |
| Settings | **Skip**, **Replace** (the file paths stay this deployment's own) |

The gateway checks everything before it writes anything: an import that would leave no administrator is refused, and imported settings get the same checks as a save on Gateway Settings (an access list that would lock you out, or `connModes: direct`, is refused). The chosen sections are then written together: if any file cannot be written, none is changed and the page reports a server error, so nothing was imported. Users removed, or whose password or administrator flag changed, are signed out, you included: the page warns you before you import. A setting that applies only at restart is reported.

To move a deployment: export (or copy a file from `/backup`), start the new gateway, sign in with its bootstrap admin, and import with **Replace**. The imported users sign in with their old passwords.

---

## Audit trail

The gateway keeps a record of who did what, apart from its log. It is written in Provisioned mode only, always, and never filtered by `LOG_LEVEL`. It answers questions such as who deleted a user, who changed the access list, whose sign-ins were refused, and which address they came from. It is for people to read and for a log shipper to collect: the gateway never reads it back, and nothing is rebuilt from it.

**What is recorded.** Each event is one line, in a category:

| Category | Recorded | Actions |
| --- | --- | --- |
| `admin` | Always | `user.create`, `user.update`, `user.delete`, `connection.create`, `connection.update`, `connection.delete`, `settings.update`, `backup.export`, `backup.import`, `schedule.set`, `schedule.remove` |
| `auth` | Always | `signin`, `signout`, `password.change` (a user's own change, the forced first one included), `lockout` (the sign-in throttle starts refusing an account or a client) |
| `access` | Only while `audit.access` is `true` | `dial` (a VPN credential issued), `smf.open` and `smf.close` (the gateway's socket to a broker), `relay` (each SEMP request through the gateway) |

Refusals are recorded as well, with `outcome` `refused` and the code the gateway answered: a user form that did not validate (`invalid`), a request by someone who is not an administrator (`forbidden`), removing the last administrator (`last_admin`), an unknown name (`not_found`), a wrong password (`bad_credentials`), a throttled sign-in (`throttled`). Three things are not recorded: a forged cross-site form post (refused before the form is read, so no account is known), the refused access events (a denied dial, socket or relay request), and a backup run, download or preview.

**What is never recorded.** No password or password hash, no store key or backup key, no backup passphrase, no session cookie or token, no VPN client or SEMP credential, no settings value (only the names of the keys changed) and no backup file content. Where an entry says what changed, it names the parts (`password`, `grants`, `vpn prod`, `modules.userDefault`), never what they were set to.

**Where it is.** `/data/audit.log`, mode `0600`, owned by the gateway's user (UID `65532`), appended one JSON object per line. The gateway cannot start in Provisioned mode if it cannot open the file, and says why; check that `/data` is writable by UID `65532`. Gateway mode writes none.

| Field | Holds |
| --- | --- |
| `time` | When the gateway wrote the line, RFC 3339, UTC |
| `actor` | The user who acted; empty for a sign-in that failed and for a lockout, where no one is signed in |
| `client` | The client address, as the access list sees it (behind a trusted proxy, the address from `X-Forwarded-For`) |
| `action` | One of the actions above |
| `target` | What it was done to: a user, a connection, a `broker/vpn`, a broker, or the account a sign-in tried (cut to 64 bytes). Left out when there is none |
| `outcome` | `ok` or `refused` |
| `code` | The refusal or error code. Left out for `ok` |
| `changed` | The names of the parts changed. Left out when there are none |
| `msg` | The event as a sentence |

```json
{"time":"2026-11-12T09:30:01Z","actor":"alice","client":"10.1.2.3","action":"user.update","target":"bob","outcome":"ok","changed":["vpn prod"],"msg":"alice updated user bob: vpn prod"}
{"time":"2026-11-12T09:31:40Z","actor":"","client":"10.1.2.9","action":"signin","target":"bob","outcome":"refused","code":"bad_credentials","msg":"sign-in refused for bob: bad credentials"}
```

**Rotation.** The gateway rotates the file itself, by size: a write that would take `audit.log` past 10 MB first renames it to `audit.log.1`, moving `.1` to `.2` and so on up to `audit.log.50`; the oldest beyond that is deleted. The trail therefore holds at most about 500 MB. There is no logrotate in the image, and none is needed. If a rotation fails (a file cannot be renamed), the gateway logs an error and keeps writing to the current file, which then grows past 10 MB until the cause is fixed.

**A copy on standard output.** Off by default. Set `SMU_SHOW_AUDIT=true` for the first start, or `audit.stdout` on Gateway Settings later, and each line is also written, unchanged, to the container's standard output, apart from the gateway's log (which goes to standard error), so a shipper can take the audit stream alone.

**Broker access.** `audit.access` adds the `access` category. Expect one line for each dial and each SMF socket (two lines, open and close) and one for every SEMP request the app makes through the gateway, which is a steady stream while someone browses queues. Turn it on when you need to show who opened which broker, and plan for the rotation to cover less time.

**If a line cannot be written.** The request goes ahead: the gateway never refuses a user's action because the trail failed. It logs an error in its own log (the file and the cause, never the entry) and tries again with the next event.

**Keep it.** The audit trail is not part of a backup, and a backup restore does not bring it back. To keep it, copy `/data/audit.log` and `/data/audit.log.*` off the volume (a scheduled copy, or a shipper reading the standard output copy), and keep the copies for as long as your policy and any dispute need: the 500 MB cap can be a few weeks on a busy deployment. Anyone who can read the volume can read the trail, and it names users and client addresses, so give the copies the same care as the gateway's logs. The gateway's user can also rewrite the file, so for evidence you must rely on, ship it off the host as it is written.

---

## Security checklist

Provisioned mode is meant for **trusted internal** networks. Before exposing it:

- **Set `SMU_CONN_MODES=provisioned`** unless you really need the Direct form beside it.
- **Give each broker a read-only SEMP account**, scoped to what its users may see: a user granted one VPN on a broker can read whatever that account can.
- **Offer Queue Subscriptions only where that is acceptable.** It reads every queue's subscriptions on the connected broker, across all its VPNs, and narrows them to the user's queues in the browser; anyone with the browser's developer tools can see the rest. Leave `queue-subscription-explorer` out of `modules.offered` where queue and topic names must stay hidden between teams.
- **Give each VPN a client username** scoped to what its users may do. A signed-in browser receives its password to connect, and the password works outside the app too. Keep the brokers' own ports off networks users can reach.
- **Change the `admin` password** at the first sign-in (the gateway insists), and remove `SMU_ADMIN_PASSWORD` from the environment if you used it.
- **Keep the store key apart** from the stores where you can: its path is fixed at `/data/store.key`, so mount a volume or secret there. It is not what restores a lost deployment: the scheduled backups are.
- **Keep backup passphrases secret, and apart from the backups.** A backup holds every broker credential and every password hash; anyone with a file and its passphrase has them. Make `/backup` readable by the gateway's UID only.
- **Restrict who can reach the gateway** with `access.allow`, and list your reverse proxy in `access.trustedProxies`.
- **Treat administrator accounts as privileged.** They edit grants, the access list and sign-in itself.
- **Keep the audit trail.** It is not in backups: copy `/data/audit.log*` off the volume on a schedule, and keep the copies as long as your policy needs (see [Audit trail](#audit-trail)).

---

## Troubleshooting

The gateway refuses to start, saying which file and why, when the stores and their key do not match:

| Message | Fix |
| --- | --- |
| The key is missing beside an existing store (or `backup.yaml`) | Restore the key, or delete the store files and `backup.yaml` to start over, then import a backup. |
| The key is unreadable, or not 64 hex characters | Restore the right file. On a fresh volume, make one with `head -c 32 /dev/urandom \| xxd -p -c 64`. `EACCES` means UID `65532` cannot read it. |
| A store is unencrypted, from an earlier release | Stores are not migrated: delete them and enter the users and connections again. |
| A store cannot be decrypted, or is damaged | The wrong key, or a damaged store: restore the matching pair from a backup. |

A key file other users can read is only warned about, because Docker secrets are mounted `0444`.

Other refusals at start:

- **`connModes=... offers Provisioned sign-in but hosted is false`:** remove `SMU_HOSTED=false`, or set `hosted: true` in `config.yaml`.
- **`invalid config file ... field managed not found`:** a `config.yaml` from a pre-release build. Delete the `managed:` line.
- **`read backup schedule ...` or `backup schedule ...: ...; delete it and set the schedule again`:** `backup.yaml` cannot be opened with this key, or is damaged. Delete it, start the gateway, and set the schedule again on Backup & Restore; the backups already in `/backup` are not affected.
