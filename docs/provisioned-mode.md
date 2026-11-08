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
  - [Environment variables](#environment-variables)
- [Administer](#administer)
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

---

## Start it

You need Docker with Compose, and a host your users' browsers can reach on port 9443.

1. Download [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml) from the release you are deploying.
2. Put the first administrator's password, 12 to 128 characters, in a file named `admin-password` beside it. Make it readable by the gateway's user only:

   ```bash
   sudo chown 65532 admin-password && chmod 400 admin-password
   ```

3. Start it, pinning the release:

   ```bash
   SMU_VERSION=3.6.0 docker compose -f compose.provisioned.yaml up -d
   ```

4. Open `https://<host>:9443/`, sign in as `admin` with that password, and choose a new one. Nothing else works until you do.
5. **Back up the store key.** The gateway created it on the first start:

   ```bash
   docker compose -f compose.provisioned.yaml cp gateway:/data/store.key ./store.key.backup
   ```

   Keep the copy somewhere safe and secret. Without it, the users and connections cannot be read, and there is no recovery.

Then open the admin console at `https://<host>:9443/solAdmin` to add brokers and users.

**Without the password file**, the gateway generates a password for `admin` and prints it **once** in its log (`docker compose logs gateway`). Lost it before signing in? Delete `/data/users.yaml` and restart.

**Using `docker run` instead:** set `CONN_MODES=provisioned` and mount `/tls` and `/data`:

```bash
docker run -d -p 9443:9443 \
  -e CONN_MODES=provisioned \
  -e ADMIN_PASSWORD_FILE=/run/secrets/admin-password \
  -v "$PWD/admin-password:/run/secrets/admin-password:ro" \
  -v solace-tls:/tls -v solace-data:/data \
  ghcr.io/solacelabs/solace-msg-utility:3.6.0
```

---

## Configure

The gateway's settings live in `config.yaml` on the `/data` volume. An administrator edits most of them on the admin console's **Gateway Settings** page; they apply at once. The rest change in the file on the host, followed by a restart.

### Connection modes

| `CONN_MODES` | What users see | Recommended |
| --- | --- | --- |
| `provisioned` | Sign-in only | **Yes.** Grants are binding: no one reaches a broker they were not given. |
| `both` | Sign-in, plus the Direct form for typing broker details | Only for mixed audiences or a migration period. Anyone can connect through the Direct form with credentials they happen to know, outside their grants. |
| `direct` | The Direct form only | This is Gateway mode: no sign-in and no admin console. |

`DEFAULT_CONN` (`direct` or `provisioned`) picks which tab opens first under `both`.

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
| `modules.offered` | `[queue-browser, queue-copy]` | Both, unless no one should copy or move messages. Queue Subscriptions is never offered in Provisioned mode. |
| `modules.userDefault` | `all` | `all` for a small team; `none` if each user should get modules explicitly on their account. |

### Environment variables

These seed `config.yaml` on the first start only, except `STORE_KEY_FILE` and the two password variables, which are never written to it.

| Variable | Default | Recommended |
| --- | --- | --- |
| `CONN_MODES` | `direct` | `provisioned` |
| `STORE_KEY_FILE` | `/data/store.key` | A separate secret or mount, so the key does not sit beside the stores it unlocks. |
| `ADMIN_PASSWORD_FILE` | unset | A secret file, as in the compose file. Read only on the first start. |
| `ADMIN_PASSWORD` | unset | Avoid: an environment value is visible to anyone who can inspect the container. Set this or `ADMIN_PASSWORD_FILE`, not both. |
| `USERS_FILE`, `CONNECTIONS_FILE` | `/data/users.yaml`, `/data/connections.yaml` | Keep. |

The rest (TLS, log level) are the same as in Gateway mode: see [Settings](deployment.md#settings).

---

## Administer

The admin console is at `https://<host>:9443/solAdmin`, for administrator accounts only.

- **User Management:** add users, reset passwords, make someone an administrator, and grant brokers, VPNs and queues. A grant can use `*` wildcards, for example queues `orders.*`.
- **Connection Management:** add brokers, their SEMP account and their VPNs' client credentials. Leave a password blank to keep the stored one.
- **Gateway Settings:** the settings above. Each save is logged with the administrator's name.

Changes apply at once. Revoking a user's access closes their broker connections. A restart signs everyone out.

---

## Security checklist

Provisioned mode is meant for **trusted internal** networks. Before exposing it:

- **Set `CONN_MODES=provisioned`** unless you really need the Direct form beside it.
- **Give each broker a read-only SEMP account**, scoped to what its users may see: a user granted one VPN on a broker can read whatever that account can.
- **Give each VPN a client username** scoped to what its users may do. A signed-in browser receives its password to connect, and the password works outside the app too. Keep the brokers' own ports off networks users can reach.
- **Change the `admin` password** at the first sign-in (the gateway insists), and remove `ADMIN_PASSWORD` from the environment if you used it.
- **Back up the store key, and keep it apart** from the stores where you can.
- **Restrict who can reach the gateway** with `access.allow`, and list your reverse proxy in `access.trustedProxies`.
- **Treat administrator accounts as privileged.** They edit grants, the access list and sign-in itself.

---

## Troubleshooting

The gateway refuses to start, saying which file and why, when the stores and their key do not match:

| Message | Fix |
| --- | --- |
| The key is missing beside an existing store | Restore the key, or delete both store files to start over. |
| The key is unreadable, or not 64 hex characters | Restore the right file. On a fresh volume, make one with `head -c 32 /dev/urandom \| xxd -p -c 64`. `EACCES` means UID `65532` cannot read it. |
| A store is unencrypted, from an earlier release | Stores are not migrated: start on a fresh `/data` volume and enter the users and connections again. |
| A store cannot be decrypted, or is damaged | The wrong key, or a damaged store: restore the matching pair from a backup. |

A key file other users can read is only warned about, because Docker secrets are mounted `0444`.

Other refusals at start:

- **`connModes=... offers Provisioned sign-in but hosted is false`:** remove `HOSTED=false`, or set `hosted: true` in `config.yaml`.
- **`invalid config file ... field managed not found`:** a `config.yaml` from a pre-release build. Delete the `managed:` line.
