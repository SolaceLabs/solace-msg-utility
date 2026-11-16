# Provisioned Mode

Provisioned mode is for teams whose users should not handle broker credentials. Users sign in to the gateway with their own account and see only the brokers and Message VPNs an administrator granted them. They never see or type a broker's address or password.

This page is for the people who run a Provisioned gateway: operators who deploy and configure it, and administrators who look after its users and connections. It covers setup, every setting, two-factor sign-in, certificates, backup and restore, the files the gateway keeps, the audit trail, what the security model does and does not guarantee, and what to do when the gateway will not start. The screens an administrator clicks through are in [user-guide.md](user-guide.md#administration-soladmin). The design of the gateway is in [architecture.md](architecture.md).

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
- [Two-factor sign-in](#two-factor-sign-in)
  - [Choosing a mode](#choosing-a-mode)
  - [Setting it up](#setting-it-up)
  - [Signing in with a code](#signing-in-with-a-code)
  - [Recovery codes](#recovery-codes)
  - [A lost phone](#a-lost-phone)
  - [The gateway's clock](#the-gateways-clock)
  - [Backups and two-factor](#backups-and-two-factor)
- [Administer](#administer)
  - [Two administrators at once](#two-administrators-at-once)
- [Certificates from the console](#certificates-from-the-console)
  - [Letting the console manage them](#letting-the-console-manage-them)
  - [Locking them](#locking-them)
  - [What applies at once](#what-applies-at-once)
  - [Restart gateway](#restart-gateway)
  - [Paths come from the environment](#paths-come-from-the-environment)
- [Back up and restore](#back-up-and-restore)
- [Stored files and recovery](#stored-files-and-recovery)
- [Audit trail](#audit-trail)
- [Security model](#security-model)
  - [What the gateway enforces](#what-the-gateway-enforces)
  - [What it does not enforce](#what-it-does-not-enforce)
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

**Queue Copy's destination** follows the primary connection: a Provisioned user has no manual destination and cannot type a broker address, and the gateway checks the destination against the user's grants like the primary. What the user sees is in [user-guide.md](user-guide.md).

---

## Start it

You need Docker with Compose, and a host your users' browsers can reach on port 9443.

1. Download [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml) from the release you are deploying.
2. Beside it, put the first administrator's password, 12 to 128 characters, in a file named `admin-password` (a password outside that length is ignored with a warning, and the gateway generates one as below), and make the directory for scheduled backups. Give both to the gateway's user only (left to Docker, the directory would be root's and take no backups):

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

**Without the password file**, or with a password outside 12 to 128 characters, the gateway generates a password for `admin` and prints it **once** in its log (`docker compose logs gateway`); a rejected password is named by its variable in a warning, never shown. Lost it before signing in? Delete `users.yaml` and restart.

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
| `login.twoFactor` | `optional` | `optional` while people set up, then `mandatory`; at least `admins`. See [Two-factor sign-in](#two-factor-sign-in). |

A wrong code at the two-factor step counts as a wrong password and brings the same waits. The waits apply to the account as well as the client, so someone guessing at a known username can keep that user waiting for up to `login.maxBackoffSeconds`. The access list below, or a VPN in front of the gateway, is the answer.

### Who can reach the gateway

| Key | Default | Recommended |
| --- | --- | --- |
| `access.allow` | `[]` (everyone) | Your users' networks, for example `[10.0.0.0/8]`. The page refuses a list that would lock out your own browser. |
| `access.trustedProxies` | `[]` | The address of your reverse proxy, if there is one, so the gateway sees each user's own address. |

### What users may open

| Key | Default | Recommended |
| --- | --- | --- |
| `modules.offered` | `[queue-browser, queue-copy, queue-subscription-explorer]` | All three, unless no one should copy or move messages (drop `queue-copy`), or queue and topic names in VPNs a user is not granted must stay hidden from them (drop `queue-subscription-explorer`, see the [security checklist](#security-checklist)). A `config.yaml` whose list names only the first two offers only those: add Queue Subscriptions in Gateway Settings to offer it. |
| `modules.userDefault` | `all` | `all` for a small team; `none` if each user should get modules explicitly on their account. |

### Audit settings

| Key | Default | Recommended |
| --- | --- | --- |
| `audit.stdout` | `false` | `true` if a log shipper reads the container's output and should carry the audit lines too; the file is written either way. Seeded by `SMU_SHOW_AUDIT`. |
| `audit.access` | `false` | Leave off unless you need to know who opened which broker: it adds a line for every dial, socket and SEMP relay request, which is a high volume (see [Audit trail](#audit-trail)). No environment variable. |

| `audit.onFailure` | `continue` | `continue` unless losing an audit record is worse for you than refusing changes. `refuse` stops every change to users, connections, settings and the backup schedule (`503 audit_unavailable`) while the audit log cannot be written, until it can; sign-ins and reads carry on. The one change that met the failure stands; every change after it is refused, one that was already waiting included. Use `refuse` only with something watching the gateway's log for `AUDIT RECORD LOST` and the disk holding `/data`. No environment variable. See [If a line cannot be written](#audit-trail). |

All three are on the Gateway Settings page (`audit.onFailure` is a select beside the two checkboxes) and apply at the next audited event, with no restart.

### Environment variables

These seed `config.yaml` on the first start only, except the two `SMU_ADMIN_PASSWORD` variables, which are never written to it. The users store, the connections store and the store key are not settings: they always live at `/data/users.yaml`, `/data/connections.yaml` and `/data/store.key`, and you move data with Backup & Restore. A deployment that still sets `USERS_FILE`, `CONNECTIONS_FILE` or `STORE_KEY_FILE` (or the `usersFile` / `connectionsFile` keys in `config.yaml`) starts with a warning that the value is ignored. Every variable carries the `SMU_` prefix; a start with an unprefixed name set is refused, see [deployment.md](deployment.md#settings).

| Variable | Default | Recommended |
| --- | --- | --- |
| `SMU_CONN_MODES` | `direct` | `provisioned` |
| `SMU_ADMIN_PASSWORD_FILE` | unset | A secret file, as in the compose file. Read only on the first start. |
| `SMU_ADMIN_PASSWORD` | unset | Avoid: an environment value is visible to anyone who can inspect the container. Set this or `SMU_ADMIN_PASSWORD_FILE`, not both. |
| `SMU_SHOW_AUDIT` | `false` | `true` or `false` (anything else stops the start). Seeds `audit.stdout`: copy each audit line to the container's standard output. Read on the first start only; after that `config.yaml` wins and a differing value is reported like the other `SMU_` variables. |

The rest (log level, and the three TLS path variables, which are read at every start and never seeded into `config.yaml`) are the same as in Gateway mode: see [Settings](deployment.md#settings) and [Paths come from the environment](#paths-come-from-the-environment).

---

## Two-factor sign-in

Two-factor sign-in asks for a second proof after the password: a six-digit code from an authenticator app on the user's phone. Any app that makes standard time-based codes (TOTP, RFC 6238) will do. It covers every way in: the app's sign-in and `/solAdmin`. It cannot be switched off: every user can set it up, and the setting decides who must. Only an administrator can take it away from a user.

### Choosing a mode

One setting, `login.twoFactor`, on the Gateway Settings page (the select **Two-factor sign-in (code from an authenticator app)**) or in `config.yaml`. It is read at each sign-in, so a change applies to the next one, with no restart. A session already open is not asked again. There is no environment variable.

| Value | Who is asked | Use it |
| --- | --- | --- |
| `optional` | Users who have set it up are asked for a code. Nobody has to set it up. | The default. While people enrol. |
| `admins` | The same, and an administrator without it must set it up at the next sign-in. | The least you should run once enrolment is done. |
| `mandatory` | Everyone who has set it up is asked for a code, and everyone else must set it up at the next sign-in. | **Recommended** as the end state. |

**Recommended.** Run `optional` while people enrol, then switch to `mandatory`; if you cannot move everyone, at least `admins`, because administrators edit grants, the access list and sign-in itself. Under `admins` and `mandatory` a user without two-factor cannot reach the app until it is set up, so tell people first, and enrol the administrators first. Keep at least two administrators, and tell everyone to keep their recovery codes safe (see [A lost phone](#a-lost-phone)).

Two-factor cannot be turned off for everyone: there is no value for it, and no switch on the host. A `config.yaml` without the key reads as `optional`. Any other value, `off` included, stops the start, naming the key and the value and the three to choose from; Gateway Settings refuses it with `422`.

### Setting it up

When the mode requires it, the sign-in goes on to **Set up two-factor sign-in** after the password: a QR code, the same key as text (in groups of four), and a field for the six-digit code the app shows. Entering it and pressing **Turn on two-factor sign-in** finishes the sign-in. No session exists before that, so a user who stops here is not signed in. The next page, **Recovery codes**, shows [ten codes](#recovery-codes) once.

Under `optional`, or to set it up again, a signed-in user opens **Two-factor sign-in**: the lock icon in the sidebar footer of the app, or the **Two-factor sign-in** button on the Administration page of `/solAdmin`. The link is always there. The page asks for the password, and for a current code or a recovery code when two-factor is already on, then shows the new QR code. Setting it up again replaces the secret and all recovery codes at once, for a new phone or a lost one. Setting up, or setting up again, ends the user's other sessions; the browser doing it stays signed in.

A user cannot turn two-factor off. Only an administrator can reset it (see [A lost phone](#a-lost-phone)).

### Signing in with a code

After a correct password the gateway shows **Two-factor sign-in**: "Enter the 6-digit code from your authenticator app, or one of your recovery codes." No session exists until the code passes, and the gateway keeps the half-finished sign-in for 10 minutes. **Start again** goes back to the password.

- A wrong code answers "The code is not correct." and counts as a failed sign-in, with the same waits as a wrong password.
- A code works once. A code at or below the last step accepted for that user is refused, so wait for the app's next code. The gateway keeps that step in memory only, and forgets it at a restart.
- With a forced password change, the two-factor step comes first; the password page follows.

### Recovery codes

Each user gets ten at setup, shown once, as `XXXX-XXXX-XXXX-XXXX`. Each works one time, typed in the same **Code** field: anything that is not exactly six digits is read as a recovery code, and case and hyphens do not matter. The gateway stores only a hash of each. The audit line of a sign-in with one says how many are left. Setting up again makes ten new ones and voids the rest. Tell users to keep them somewhere other than the phone.

### A lost phone

- **The user has a recovery code.** They sign in with it, then open **Two-factor sign-in** and set it up again with the password and another recovery code.
- **The user has none.** An administrator opens **User Management**, finds the user (the **Two-factor** column says On), presses **Reset two-factor** on the row and confirms. The user's sessions and half-finished sign-ins end. The next sign-in needs only the password under `optional`, and goes to set-up under `admins` (administrators) or `mandatory`. The reset does not change the password and does not show anyone the old secret.
- **A lone administrator** has no one to reset them. They sign in with a recovery code, then set it up again. If the codes are gone too, nothing in the console can help, and the gateway has no switch on the host that turns two-factor off or skips it: `login.twoFactor` has no `off`, and a stopped gateway cannot reset a user. The one way back that the gateway supports starts the users store again, and costs whatever was changed since your last backup:
  1. Stop the gateway. Move `users.yaml` out of `/data` (keep it; do not delete it). Leave `connections.yaml`, `backup.yaml` and `store.key` where they are, and have a backup file ready: a saved one from `/backup`, or an exported one, and its passphrase.
  2. Start the gateway. With no `users.yaml` it creates the first administrator, named `admin`, again. Its password is the one in `SMU_ADMIN_PASSWORD` or `SMU_ADMIN_PASSWORD_FILE` if that is set and meets the policy; otherwise the gateway logs a generated one, once, as a warning (see [Start it](#start-it)). The connections and the settings are untouched. Every session ends with the restart.
  3. Sign in as `admin` and change the password, as the gateway asks. If `login.twoFactor` is `admins` or `mandatory`, set two-factor up on this account too.
  4. Create a second administrator under a name that is not in the backup, for example `recovery`.
  5. Open **Backup & Restore**, choose the backup, preview it, and import the users with **Merge**. (**Replace** would remove `recovery` and sign you out with nobody to reset the locked administrator. If the locked account is itself named `admin`, **Merge** replaces the new `admin` with it, which is why step 4 matters.) The import brings every user back as the backup holds them, the locked administrator's two-factor included: it does not unlock anything by itself.
  6. Sign in as `recovery` (set up two-factor if the mode asks), open **User Management**, press **Reset two-factor** on the locked administrator and confirm. Then sign in as that administrator with the password, set two-factor up again, and delete `recovery`.

  What is lost: every user, password, grant and two-factor change made after the backup was written, and every user created since. A user the backup does not hold must be created again. A backup made before the administrator first set two-factor up brings them back without it, which also ends the lock. With no backup at all the users cannot be brought back: the moved `users.yaml` can only be opened by this gateway, and it still holds the locked administrator, so recreate the users by hand. The audit trail is not touched. So keep the recovery codes where you can find them, and keep two administrators, so a lost phone is a **Reset two-factor** click and never this.

### The gateway's clock

Codes come from the time. The gateway accepts the code of the current 30-second step and of the step on each side, so a clock that is up to about 30 seconds out still works. Beyond that every code is refused, the right ones too. Keep the gateway's host synchronised (NTP); a container uses its host's clock. Phones set their own. If every user is refused at once, compare the gateway host's time with a trusted clock before anything else.

### Backups and two-factor

A backup carries each user's two-factor secret and the hashes of the unused recovery codes, inside the passphrase-sealed file. Treat the file and its passphrase as you do broker credentials: with both, someone holds the secrets that make the codes. An import restores them. It replaces a user with the file's record, so a user whose record in the file has no two-factor ends up without it, and **Preview** lists a user whose two-factor differs as changed. Users whose two-factor an import adds, removes or replaces are signed out. A backup that holds no `login.twoFactor` reads as `optional`: importing its settings with **Replace** sets the mode to `optional`, which is looser than `mandatory`, so check the mode afterwards. Import restores two-factor as the file holds it, and nothing else.

---

## Administer

The admin console is at `https://<host>:9443/solAdmin`, for administrator accounts only. Its pages, click by click, are in [user-guide.md](user-guide.md#administration-soladmin); this section gives the facts an operator needs.

- **User Management:** add users, reset passwords, make someone an administrator, and grant brokers, VPNs and queues. A grant can use `*` wildcards, for example queues `orders.*`. The **Two-factor** column shows On or Off, and **Reset two-factor** on an On row removes it (see [A lost phone](#a-lost-phone)); a save never carries or clears it.
- **Connection Management:** add brokers, their SEMP account and their VPNs' client credentials. Leave a password blank to keep the stored one. The gateway reaches each broker over TLS (`https` for SEMP, `wss` for messaging), so the ports are the broker's TLS ports, unless the connection's `scheme` names the plain one (`http` for SEMP, `ws` for messaging; each side set on its own). A connection with no scheme, or a blank one, uses TLS. Pick `http` or `ws` only for a broker on a trusted network that does not serve TLS on that port: the gateway then reaches it unencrypted, and the SEMP and SMF credentials cross that hop in clear text. Set the scheme in Connections -> Add or Edit connection.
- **Gateway Settings:** the settings above, one card each (the two-factor mode is under its own heading, **Two-factor sign-in**; the offered modules are toggle tiles under **Modules**), **Skip broker certificate checks (insecure)** under **Broker trust**, the **Restart gateway** button in the **Gateway** card, and a line under Access, "Your address as the gateway sees it", saying whether the address is the TCP peer or came from `X-Forwarded-For` through a trusted proxy. If it shows your proxy's address rather than yours, see [Client addresses behind Docker and proxies](deployment.md#client-addresses-behind-docker-and-proxies).

Every change to a user, a connection or the settings is also logged at `info` with the administrator's name and what changed (never a password), but the record to keep is the [audit trail](#audit-trail): it is always written, whatever `LOG_LEVEL` says.
- **Certificates:** the gateway's own certificate and the CA certificates it trusts for brokers; replace the certificate, add and delete CA files. See [Certificates from the console](#certificates-from-the-console).
- **Backup & Restore:** export the configuration to a file, import one, and schedule backups. See [Back up and restore](#back-up-and-restore).

Changes apply at once, certificates included. Revoking a user's access closes their broker connections. A restart signs everyone out.

### Two administrators at once

Each user, connection, the settings and the backup schedule carry a version that the console reads with them and sends back with a save. If someone else saved the same thing after you opened it, your save is refused, not merged: the console says it was changed by someone else since you opened it and offers **Reload**. Reload shows the current values and you redo your edit. If someone deleted it meanwhile, the console says so and returns to the list. The unit is the whole record, so two administrators changing different fields of one user cannot both save: the second reloads and repeats the edit. Two changes to different users, or to a user and a connection, both go through.

A few details:

- Adding a user or connection whose name already exists is refused by the gateway (`exists`), whoever got there first.
- Setting up two-factor for the first time, or an administrator's reset, changes what the console shows and moves the user's version; setting it up again, or using a recovery code, does not, and neither does an administrator's save overwrite a user's two-factor.
- A user changing their own password does not make an administrator's open form stale unless it flips the forced-change flag, and the administrator's save does not overwrite that new password: a blank password on a save means "keep what is stored now".
- **Import** is checked the same way. **Preview** notes the version of each list and of the settings it saw, and **Import** is refused ("The gateway's data changed since the preview. Run the preview again.") if a section you are importing has changed since, even by one password change. Skipped sections are not compared. Preview again and choose again.
- Changes are applied one at a time, in the order the gateway receives them, so the gateway's own state is always whole.

---

## Certificates from the console

The admin console's **Certificates** page shows the gateway's own certificate (subject, names, issuer, validity, SHA-256 fingerprint) and every trusted broker CA file, and can replace the certificate and add or delete CA files. Whether it may is decided by the mount, not by a setting: the gateway can change these files only where it can write them.

### Letting the console manage them

Mount `/tls` writable, which a named volume is (`tls:/tls` in `compose.provisioned.yaml`, `-v solace-tls:/tls` in the `docker run` above). The gateway then offers every action:

- **Replace certificate** takes a certificate file and a key file, or pasted PEM (the certificate may carry its chain, leaf first). The gateway verifies them first: the certificate holds only certificate blocks, the key is exactly one private key, the pair matches, the certificate is valid now, and its key is one browsers can use: RSA of at least 2048 bits, or ECDSA on P-256 or P-384. An ECDSA P-521 or Ed25519 certificate is refused, because Chrome and Edge cannot complete a handshake with it, and since a replacement is served at once it would lock you out of this page. A refusal names the field and the reason, and nothing is written. The page shows what will be installed and asks you to confirm. The two files are written together as one journaled change (key `0600`, certificate `0644`), so a crash never leaves half a pair.
- **Add CA certificate** takes a file or pasted PEM and an optional file name (`.crt` or `.pem`, letters, digits, `.`, `_`, `-`, up to 64 characters; left empty it is named after the certificate's subject). It accepts certificates only: a private key is refused. It never overwrites an existing file (`exists`).
- **Delete** removes one CA file from the trust directory after a confirmation. Only regular files directly in the directory are touched.
- **A certificate browsers cannot use, placed on the host,** is still served (the gateway does not second-guess files you put there), and the start logs a warning naming why. Every browser connection then fails with the gateway logging `tls: peer doesn't support any of the certificate's signature algorithms`. To get back in, put a usable pair in `/tls` and restart the gateway, or delete `tls.crt` and `tls.key` there and restart, which makes the gateway create a new self-signed pair.
- The page shows each subject and issuer as `openssl` prints them, every attribute in the certificate's order (`CN=..., O=..., emailAddress=...`), and the certificate's names one per line.

The certificate and its key must sit in one directory to be replaced from the console, so mount the directory, not a single file (a bind-mounted file cannot be swapped and the replace fails with `tls_write_failed`, nothing changed). The private key is read from the request only and is never echoed, logged, audited or put in an error. Each change is audited (`tls.certificate.replace`, `tls.trust.add`, `tls.trust.remove`; see [Audit trail](#audit-trail)): the line names the subject and expiry or the file name, never the key.

### Locking them

To keep certificates out of the console's hands, mount `/tls` read-only (`:ro`). The page still shows the certificate and the CA files, says that the files are read-only on the gateway host, and disables **Replace certificate**, **Add CA certificate** and **Delete**; a request that tries anyway is refused with `409 tls_read_only`. The same happens when the certificate and its key sit in two different directories (the certificate then cannot be replaced, though CAs still can if their directory is writable). Certificates then change on the host: replace the files and restart the container. A write that fails for another reason (a full disk, a permission problem) is `500 tls_write_failed`: nothing changed, the cause is in the gateway's log.

### What applies at once

Every TLS change takes effect with no restart:

- **A new certificate:** connections to the gateway made from then on present it; connections already open keep the old one until they close.
- **CA changes:** the trust pool is rebuilt from the directory after every add or delete, and the next connection to a broker uses it. Idle connections to brokers are closed so the next request handshakes under the new pool; requests and sockets in use carry on. Deleting the CA a broker relies on therefore makes new connections to that broker fail to verify at once, and adding it back makes them work.
- **Skip broker certificate checks (insecure)** on Gateway Settings (`tls.insecureSkipVerify`) applies on Save and on a backup import, and the gateway logs a warning whenever it turns on.

A file you drop into the trust directory by hand is read at the next start, or at the next add or delete from the console. Everyone else's settings are unchanged. A restart is needed only for what is still restart-only (the `hosted` setting) and for the three path variables.

### Restart gateway

**Restart gateway**, in the **Gateway** card at the foot of Gateway Settings, makes the gateway start its own program again in place: it asks for confirmation, writes the audit line `gateway.restart`, answers `202`, shuts down as it does for `SIGTERM` (requests in flight are given up to 10 seconds; the stores and the audit log close) and executes itself again with the same arguments and environment. The container keeps running, so its mounts and name stay. Every user and administrator is signed out, open broker connections and sockets close, and any setting that was waiting for a restart (the notice on Gateway Settings lists them and points at the button) is applied. The console says it is restarting, waits for the gateway to answer again and goes to the sign-in; if nothing answers within a minute it says so.

You rarely need it: settings, certificates and trusted CAs apply without one. Use it to apply a restart-only setting or to load a `config.yaml` edited on the host. It restarts with the environment the container already has, so a changed variable (the three TLS paths included) still needs the container recreated. If the gateway cannot start itself again it logs `gateway restart failed` with the cause and exits with status 1, and the platform's restart policy (`restart: unless-stopped` in the compose files) brings it back; on a platform without an in-place start it exits with status 0 instead, so the policy must restart on any exit.

### Paths come from the environment

The certificate, its key and the trust directory are set by `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE` and `SMU_SSL_TRUSTDIR`, never by `config.yaml` or the settings page (a request that names one is refused, `400 bad_request`, and no path appears in any answer). Changing one means recreating the container. The defaults, and what happens to a `config.yaml` that still holds `tls.certFile`, `tls.keyFile` or `tls.trustDir`, are in [TLS and trusted CAs](deployment.md#tls-and-trusted-cas) and [Variables and keys the gateway refuses or ignores](deployment.md#variables-and-keys-the-gateway-refuses-or-ignores).

---

## Back up and restore

The admin console's **Backup & Restore** page keeps copies of the configuration: the users, the connections and the settings.

**What a backup holds.** The users with their password hashes (never the passwords) and their two-factor secrets and recovery-code hashes (see [Backups and two-factor](#backups-and-two-factor)), the connections with their SEMP and VPN credentials, and the gateway settings except the file paths (`tls.certFile`, `tls.keyFile`, `tls.trustDir`), which belong to each host. A backup is one JSON file, encrypted with AES-256-GCM under a key derived from a passphrase (PBKDF2-SHA256, 600,000 iterations, the cost of a user password). It does not use the store key, so it restores on any deployment. **Without the passphrase it cannot be opened**: keep the passphrase somewhere other than the backups.

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

The gateway checks everything before it writes anything: an import that would leave no administrator is refused, and imported settings get the same checks as a save on Gateway Settings (an access list that would lock you out, or `connModes: direct`, is refused). The chosen sections are then written together as one change: if any file cannot be written, none is changed and the page reports `store_write_failed`, so nothing was imported. If the data changed after the preview, the import is refused and you preview again (see [Two administrators at once](#two-administrators-at-once)). Users removed, or whose password, administrator flag or two-factor changed, are signed out, you included: the page warns you before you import. A setting that applies only at restart is reported.

To move a deployment: export (or copy a file from `/backup`), start the new gateway, sign in with its bootstrap admin, and import with **Replace**. The imported users sign in with their old passwords.

---

## Stored files and recovery

The gateway keeps its state in a few files on the `/data` volume: `users.yaml`, `connections.yaml` and `backup.yaml` (sealed with the store key), `config.yaml` (plain), the key itself and the audit log. Treat them as the gateway's: change them through the console, never by hand, and do not copy one in or out while the gateway runs.

**Versions in the files.** Each sealed file begins with a counter, `seq`, that goes up by one on every change written to that file. Each user and each connection also holds a `rev`, the value of `seq` when that record last changed in a way the console shows; the console sends it back with a save. A password change moves `seq` but not `rev`, because the console never shows a password. Two-factor is shown as On or Off: setting it up the first time and an administrator's reset move `rev`; setting it up again and spending a recovery code move only `seq`. The schedule's version is the `seq` of `backup.yaml`; removing the schedule keeps the file with its counter, so a schedule created later gets a number nobody holds. `config.yaml` has no counter, because people may edit it: its version is a checksum of the file, which the gateway computes in memory and never stores. At start the gateway refuses to run if any `rev` is zero or above its file's `seq` (a file restored from somewhere else), and says which. A backup does not carry versions: an import gives every record in the sections it imports a fresh one.

**Every write is one journaled change.** The gateway writes the new content to temporary files, checks that it can read each one back, and swaps them in, with a small journal file called `txn` that says what is in flight. Saving a user changes one file; an import changes three, and they change together or not at all. The data directory may therefore briefly hold `txn`, `<name>.bak` copies of the files being replaced and `.tmp-*` files. Do not keep your own `config.yaml.bak`, `users.yaml.bak`, `connections.yaml.bak` or `backup.yaml.bak` in `/data`: the gateway overwrites or deletes those names.

**A write that fails** (full disk, a read-only volume, a permissions problem) is rolled back at once: the console shows `store_write_failed`, nothing changed, and the cause is in the gateway's log. Fix the cause and save again.

**After a crash or power loss.** The gateway settles any change that was in flight before it reads anything else at start. If the journal shows a change that had not finished, it puts back the previous files, as if the change had never happened, and the administrator whose save was lost gets no answer; saving again with the version they read works. If the change had finished, the new files stand and a retry with the old version is refused as changed by someone else, which is the cue to reload. No action is needed. The gateway logs a warning when it rolls a change back. If `txn` is unreadable (damaged, or it names something it should not), the gateway stops the start and says so rather than guess: restore `/data` from your volume backup, or import a backup into a fresh volume.

**Changed on disk.** Before each write the gateway checks that the file on disk is still the one it last read or wrote. If a store file is replaced behind its back, or `config.yaml` was edited by hand, the save is refused with `store_changed_on_disk` or `config_changed_on_disk` and the console says the gateway must be restarted. The refusal stays for that file, on every later save, until the restart, because the file is not what the gateway holds in memory; restarting loads what is on disk. Reads keep working from memory meanwhile, so the console may show data that does not match the file. Editing `config.yaml` on the host is expected only for what the console cannot change (leaving Provisioned mode with `connModes: direct`, and the restart-only `hosted`); stop or restart the gateway afterwards (**Restart gateway** does it).

---

## Audit trail

The gateway keeps a record of who did what, apart from its log. It is written in Provisioned mode only, always, and never filtered by `LOG_LEVEL`. It answers questions such as who deleted a user, who changed the access list, whose sign-ins were refused, and which address they came from. It is for people to read and for a log shipper to collect: the gateway never reads it back, and nothing is rebuilt from it.

**What is recorded.** Each event is one line, in a category:

| Category | Recorded | Actions |
| --- | --- | --- |
| `admin` | Always | `user.create`, `user.update`, `user.delete`, `user.twofactor.reset`, `connection.create`, `connection.update`, `connection.delete`, `settings.update`, `backup.export`, `backup.import`, `schedule.set`, `schedule.remove`, `tls.certificate.replace`, `tls.trust.add`, `tls.trust.remove` (the target is the CA file name; the message names the certificate's subject and expiry, never the key), `gateway.restart` |
| `auth` | Always | `signin`, `signout`, `password.change` (a user's own change, the forced first one included), `twofactor.enrol` (a user set two-factor up, or set it up again), `lockout` (the sign-in throttle starts refusing an account or a client) |
| `access` | Only while `audit.access` is `true` | `dial` (a VPN credential issued), `smf.open` and `smf.close` (the gateway's socket to a broker), `relay` (each SEMP request through the gateway) |

Refusals are recorded as well, with `outcome` `refused` and the code the gateway answered: a user form that did not validate (`invalid`), a request by someone who is not an administrator (`forbidden`), removing the last administrator (`last_admin`), an unknown name (`not_found`), a save made from an out-of-date version (`stale`), a store file changed outside the gateway (`store_changed_on_disk`, `config_changed_on_disk`), a write that failed and was rolled back (`store_write_failed`), a change refused because the audit log is down (`audit_unavailable`), a wrong password (`bad_credentials`), a wrong two-factor code at sign-in or set-up (`bad_code`), a throttled sign-in (`throttled`). Three things are not recorded: a forged cross-site form post (refused before the form is read, so no account is known), the refused access events (a denied dial, socket or relay request), and a backup run, download or preview.

**What is never recorded.** No password or password hash, no store key or backup key, no backup passphrase, no session cookie or token, no VPN client or SEMP credential, no two-factor secret, recovery code or typed code, no settings value (only the names of the keys changed) and no backup file content. Where an entry says what changed, it names the parts (`password`, `grants`, `vpn prod`, `modules.userDefault`), never what they were set to.

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
| `wrote` | On an `ok` entry that changed a store file: one element per file written, `{"file": "users.yaml", "seq": 43}` (`config.yaml` has no `seq`). Left out otherwise |
| `msg` | The event as a sentence |

```json
{"time":"2026-11-12T09:30:01Z","actor":"alice","client":"10.1.2.3","action":"user.update","target":"bob","outcome":"ok","changed":["vpn prod"],"wrote":[{"file":"users.yaml","seq":43}],"msg":"alice updated user bob: vpn prod"}
{"time":"2026-11-12T09:31:40Z","actor":"","client":"10.1.2.9","action":"signin","target":"bob","outcome":"refused","code":"bad_credentials","msg":"sign-in refused for bob: bad credentials"}
```

**Rotation.** The gateway rotates the file itself, by size: a write that would take `audit.log` past 10 MB first renames it to `audit.log.1`, moving `.1` to `.2` and so on up to `audit.log.50`; the oldest beyond that is deleted. The trail therefore holds at most about 500 MB. There is no logrotate in the image, and none is needed. If a rotation fails (a file cannot be renamed), the gateway logs an error and keeps writing to the current file, which then grows past 10 MB until the cause is fixed.

**A copy on standard output.** Off by default. Set `SMU_SHOW_AUDIT=true` for the first start, or `audit.stdout` on Gateway Settings later, and each line is also written, unchanged, to the container's standard output, apart from the gateway's log (which goes to standard error), so a shipper can take the audit stream alone.

**Broker access.** `audit.access` adds the `access` category. Expect one line for each dial and each SMF socket (two lines, open and close) and one for every SEMP request the app makes through the gateway, which is a steady stream while someone browses queues. Turn it on when you need to show who opened which broker, and plan for the rotation to cover less time.

**If a line cannot be written.** The change that was already made stands: the gateway never undoes it because the line was lost. What happens next is yours to choose with `audit.onFailure`:

- `continue` (the default): for every lost record the gateway logs an error, `AUDIT RECORD LOST`, in its own log (standard error), with the fields of the entry (who, what, when, never a secret) and the cause, so the record can be rebuilt from the log. Requests carry on and the next event tries the file again.
- `refuse`: while the last audit write failed, every change to users, connections, settings or the backup schedule is refused with `503 audit_unavailable`, before anything is checked or written. Sign-ins, sign-outs and reads are not refused. The gateway does not exit, because a restart does not cure a full disk. The first audit write that succeeds ends the refusal. A refused change tries to write its own audit line, so once the log is writable again the next refused attempt writes it and ends the refusal, and the attempt after that goes through.

**Recommendation.** Keep `continue` for most deployments, and ship the gateway's standard error to a log store you watch for `AUDIT RECORD LOST`. Choose `refuse` when your policy says no administrative change may happen without a record, and then also alert on free space for the `/data` volume, since a full disk is the usual cause and the console stops accepting changes until you free it.

**Keep it.** The audit trail is not part of a backup, and a backup restore does not bring it back. To keep it, copy `/data/audit.log` and `/data/audit.log.*` off the volume (a scheduled copy, or a shipper reading the standard output copy), and keep the copies for as long as your policy and any dispute need: the 500 MB cap can be a few weeks on a busy deployment. Anyone who can read the volume can read the trail, and it names users and client addresses, so give the copies the same care as the gateway's logs. The gateway's user can also rewrite the file, so for evidence you must rely on, ship it off the host as it is written.

---

## Security model

This section says what the gateway checks and what it leaves to you, so you can decide whether Provisioned mode fits your network. It is written for operators and security reviewers. Provisioned mode is meant for **trusted internal** networks.

### What the gateway enforces

| Area | What the gateway does |
| --- | --- |
| Broker and VPN access | SEMP and messaging reach a broker only for a signed-in user entitled to it: for SEMP, to any of its VPNs; for messaging, to that VPN. An unknown broker or VPN and one the user is not entitled to get the same `404`. Grants are read from the store on every request, so an edit applies at once. |
| Sessions | A session is 32 random bytes in the `__Host-smu-session` cookie (`Secure`, `HttpOnly`, `SameSite=Lax`, no `Domain`, no `Max-Age`). It ends on idle or absolute timeout (`session.*`), sign-out, a restart (the table is in memory), or a change to the account: password, administrator flag, deletion or two-factor drop every session of that user. |
| Passwords | Stored as PBKDF2-SHA256 hashes (600,000 iterations, a salt per user) and compared in constant time; an unknown user costs the same as a wrong password. Length is 12 to 128 characters. The bootstrap administrator has no fixed password and must change it at the first sign-in before anything else is reachable. |
| Guessing | Wrong passwords and wrong two-factor codes are counted per account and per client (IPv6 by its /64). After `login.maxFailures` the key waits `login.backoffSeconds`, doubling up to `login.maxBackoffSeconds`; a blocked attempt is refused before the password is checked, and sign-ins for one account are checked one at a time. Every request without a session also draws from a per-client budget (`login.unauthenticatedPerMinute`). The tables are capped, so a flood of new names costs the attacker a `429`, not the gateway its memory. |
| Cross-site requests | A change request from another site is refused (`403 cross_origin`; the sign-in forms say "Request refused"). The relay refuses a cross-site read too, and the messaging socket needs an `Origin` that names this gateway over `https`. The half-finished sign-in's cookie is `SameSite=Strict`. Pages are served with `Cache-Control: no-store`, a restrictive Content-Security-Policy (`frame-ancestors 'none'`) and `nosniff`. |
| Request size | The session is checked before any body is read. Every gateway request body is capped at 64 KiB, with unknown fields and trailing data rejected; a relayed SEMP v1 request is capped at 1 MiB. |
| The SEMP relay | Read-only by rule: `GET` and `HEAD` under `/SEMP/v2/`, and `POST /SEMP` only when the body is one `<rpc>` holding one `<show>` command. Everything else is `403 read_only`. Of the browser's headers only `Accept` reaches the broker, so the session cookie never does; of the broker's, only a short list comes back, never `Set-Cookie`. At most 16 relayed requests per user run at once. |
| Messaging sockets | Opened only for an entitled user, at most 20 dials and socket opens per user per minute. The gateway forwards bytes to the broker with the VPN's stored credential; the socket closes when the user's session is revoked, or their access to that broker or VPN is. |
| Broker credentials | SEMP credentials stay on the gateway. The one credential the browser receives is the client password of a VPN the user is granted, from `dial`, and it is masked in every gateway log line. A Provisioned session holds no other. |
| The Direct relay | Under `provisioned` it answers `404`. Under `both` it works, and it strips the gateway's own cookies from what it forwards, so a Direct connection to any host never carries a gateway session. |
| Stored files | The users, connections and backup-schedule files are sealed whole with AES-256-GCM under the store key, with the file's role in the authenticated header, so one file cannot stand in for another. Backups use a key derived from their own passphrase (PBKDF2-SHA256, 600,000 iterations). See [Stored files and recovery](#stored-files-and-recovery). |
| Transport | The gateway serves TLS 1.2 or later only. It reaches brokers over TLS unless a connection's scheme says `http` or `ws`; the trusted broker CAs and **Skip broker certificate checks (insecure)** are described in [Certificates from the console](#certificates-from-the-console). |
| What is written down | Every administrator change and every sign-in is in the [audit trail](#audit-trail), never with a secret in it. |
| Code that ships | The Release bundles carry no Provisioned UI and no gateway call; the build checks that on the built files. |

### What it does not enforce

- **Queue rules are not a security boundary.** The gateway checks the broker and the VPN, not the queue. The per-queue patterns and the read-only rows filter what the app shows, refuse a bind to a queue the user may not use, and withhold Delete, but they run in the browser. A messaging session can do whatever the VPN's client username allows. Scope each VPN's client username to what its users may do.
- **The relay reads whatever the SEMP account can see.** A user granted one VPN on a broker can read, through the relay, every VPN that broker's stored SEMP account can. The gateway rewrites no SEMP response: the app narrows the lists, so a user with the browser's developer tools sees the rest. Give each audience its own broker entry and a SEMP account scoped to it.
- **The password a user is given works outside the app.** An entitled user receives their VPN's client password and can use it against the broker from anywhere that reaches it. Keep the brokers' own ports off networks users can reach.
- **Offered modules are a menu, not a lock.** `modules.offered` and a user's module list decide what the app shows. They do not stop a user from sending the same read requests to the relay. Queue Subscriptions reads every queue's subscriptions on the connected broker; leave it out where queue and topic names must stay hidden between teams.
- **A messaging socket outlives the session's timeouts.** It closes on revocation (sign-out, a change to the account, loss of the grant), not when the session idles out or reaches its absolute limit.
- **The session cookie is a bearer credential** while the session lives. TLS and the access list protect it; the gateway cannot tell its owner from someone who copied it.
- **`SMU_CONN_MODES=both` bypasses all of this.** The Direct tab accepts any credentials the user can type. Only `provisioned` makes the grants hold.
- **A lockout can be used against a known user.** Failures count against the account as well as the client, so someone guessing a known username keeps that user waiting. Restrict who reaches the gateway.
- **The store key opens the stores.** A stolen `users.yaml` or `connections.yaml` is useless without `/data/store.key`; with both, the stores open. Keep the key on a separate mount or secret where you can.
- **The audit trail is only as good as the gateway's user.** The gateway's user can rewrite its own audit file; ship the lines off the host if you need evidence you can rely on.
- **Administrators are trusted.** They edit grants, the access list, sign-in settings and, with a writable `/tls`, the certificate and the trusted CAs.

Each of these has a line in the [security checklist](#security-checklist).

---

## Security checklist

Provisioned mode is meant for **trusted internal** networks. Before exposing it:

- **Set `SMU_CONN_MODES=provisioned`** unless you really need the Direct form beside it.
- **Give each broker a read-only SEMP account**, scoped to what its users may see: a user granted one VPN on a broker can read whatever that account can.
- **Offer Queue Subscriptions only where that is acceptable.** It reads every queue's subscriptions on the connected broker, across all its VPNs, and narrows them to the user's queues in the browser; anyone with the browser's developer tools can see the rest. Leave `queue-subscription-explorer` out of `modules.offered` where queue and topic names must stay hidden between teams.
- **Give each VPN a client username** scoped to what its users may do. A signed-in browser receives its password to connect, and the password works outside the app too. Keep the brokers' own ports off networks users can reach.
- **Change the `admin` password** at the first sign-in (the gateway insists), and remove `SMU_ADMIN_PASSWORD` from the environment if you used it.
- **Keep the store key apart** from the stores where you can: its path is fixed at `/data/store.key`, so mount a volume or secret there. It is not what restores a lost deployment: the scheduled backups are.
- **Keep backup passphrases secret, and apart from the backups.** A backup holds every broker credential, every password hash and every two-factor secret; anyone with a file and its passphrase has them. Make `/backup` readable by the gateway's UID only.
- **Decide who may change certificates.** A writable `/tls` lets any administrator replace the gateway's certificate and trust a new CA for broker connections: a CA added there is trusted for every broker the gateway reaches. Mount `/tls` read-only (see [Locking them](#locking-them)) where certificate changes should stay with the host. The private key is never shown again once uploaded, but keep it out of chat and tickets like any key.
- **Restrict who can reach the gateway** with `access.allow`, and list your reverse proxy in `access.trustedProxies`.
- **Treat administrator accounts as privileged.** They edit grants, the access list and sign-in itself.
- **Turn on two-factor sign-in.** `optional` while people enrol, then `mandatory`; `admins` at the least (see [Two-factor sign-in](#two-factor-sign-in)). Keep the gateway's clock right and a second administrator.
- **Keep the audit trail.** It is not in backups: copy `/data/audit.log*` off the volume on a schedule, and keep the copies as long as your policy needs (see [Audit trail](#audit-trail)).

---

## Troubleshooting

The gateway refuses to start, saying which file and why, when the stores and their key do not match:

| Message | Fix |
| --- | --- |
| The key is missing beside an existing store (or `backup.yaml`) | Restore the key, or delete the store files and `backup.yaml` to start over, then import a backup. |
| The key is unreadable, or not 64 hex characters | Restore the right file. On a fresh volume, make one with `head -c 32 /dev/urandom \| xxd -p -c 64`. `EACCES` means UID `65532` cannot read it. |
| A store file is not encrypted | Plain stores are not read: delete them and enter the users and connections again, or import a backup. |
| A store cannot be decrypted, or is damaged | The wrong key, or a damaged store: restore the matching pair from a backup. |

A key file other users can read is only warned about, because Docker secrets are mounted `0444`.

Other refusals at start:

- **`login.twoFactor` has an invalid value:** the key is not `optional`, `admins` or `mandatory` (`off` is not a value). Fix `config.yaml`.
- **A user's two-factor secret or recovery code is malformed:** `users.yaml` was damaged or replaced; the message names the user and the rule, never the value. Restore the matching file from your volume backup.
- **`connModes=... offers Provisioned sign-in but hosted is false`:** remove `SMU_HOSTED=false`, or set `hosted: true` in `config.yaml`.
- **`invalid config file ... field managed not found`:** the `config.yaml` holds a `managed:` key, which is not a setting. Delete the `managed:` line.
- **`TLS directory recovery failed`:** a certificate replacement was interrupted and its journal in the certificate's directory cannot be read. The log names the file and the cause; the start stops rather than load a pair that may be half written. Restore the certificate and key from your copy and see [Stored files and recovery](#stored-files-and-recovery) for how the journal is settled.
- **Certificates page: `tls_read_only` or the read-only notes:** `/tls` is mounted read-only, or the certificate and key are in two directories. See [Locking them](#locking-them) and [Letting the console manage them](#letting-the-console-manage-them).
- **Certificates page: `tls_write_failed`:** the write failed and was rolled back (a full disk, a permission problem, or a single-file bind mount of the certificate). The log has the cause; nothing changed.
- **`config.yaml holds TLS paths that differ ...` at start:** a `config.yaml` names TLS paths, which are not read. Set `SMU_SSL_CERTFILE`, `SMU_SSL_CERTKEYFILE` or `SMU_SSL_TRUSTDIR` instead; the next settings save drops the keys. See [Paths come from the environment](#paths-come-from-the-environment).
- **`data directory recovery failed` or a message about the `txn` journal:** a change was interrupted and the journal cannot be read. The log names the file and the cause. See [Stored files and recovery](#stored-files-and-recovery).
- **A file's `rev` is above its `seq`, or is zero:** the store file is from another deployment, or was edited. Restore the matching file from your volume backup, or delete the stores and import a backup.
- **`read backup schedule ...` or `backup schedule ...: ...; delete it and set the schedule again`:** `backup.yaml` cannot be opened with this key, or is damaged. Delete it, start the gateway, and set the schedule again on Backup & Restore; the backups already in `/backup` are not affected.

**What an administrator sees.** The console words these refusals in plain text, and the gateway's log has the cause of each:

| The console says | The gateway's code | What it means |
| --- | --- | --- |
| A data file was edited on the gateway host since the gateway loaded it (and the same for the settings file) | `store_changed_on_disk`, `config_changed_on_disk` | Nothing for that file saves until a restart. See [Stored files and recovery](#stored-files-and-recovery). |
| The gateway could not write its data files, so nothing was changed | `store_write_failed` | The write failed and was rolled back. Fix the cause (a full disk, a permission) and save again. |
| The gateway cannot write its audit log and is set to refuse changes | `audit_unavailable` | `audit.onFailure` is `refuse` and the audit log is failing. See [Audit trail](#audit-trail). |
| The certificate or trust files are read-only on the host | `tls_read_only` | See [Locking them](#locking-them). |
| The gateway could not write its certificate or trust files | `tls_write_failed` | Rolled back; the old files stand. The log has the cause. |

If every user's code is refused, including right ones, the gateway's clock is out by more than about 30 seconds: see [The gateway's clock](#the-gateways-clock).
