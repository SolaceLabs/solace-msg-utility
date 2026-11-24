# Demos

This page is for anyone who wants to try the app, or show it, without a broker or a gateway. It covers what the two
demos hold, what they accept and what they simulate. Two downloads attached to every
[GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) run the app with no broker and no gateway:

- [`demo.html`](#direct-demo-demohtml) -- Standalone and Gateway mode: the Direct connection form and every module,
  against a broker inside the page.
- [`provisioned-demo.html`](#provisioned-demo-provisioned-demohtml) -- Provisioned mode: the sign-in and the
  administration pages, against a fake gateway inside the page.

Open either straight from disk; no server is needed. Neither works with a real broker, and neither makes a network
request. For what each module does, see the [User Guide](user-guide.md): a demo's About page says what the app is
and shows its version, and the manual (the Help tab) is in the real app only.

---

## Contents

- [Direct demo (`demo.html`)](#direct-demo-demohtml)
  - [Opening the demo](#opening-the-demo)
  - [Connecting](#connecting)
  - [The demo topology](#the-demo-topology)
  - [The payload samples queue](#the-payload-samples-queue)
  - [Demo controls](#demo-controls)
  - [What is not in the demo](#what-is-not-in-the-demo)
- [Provisioned demo (`provisioned-demo.html`)](#provisioned-demo-provisioned-demohtml)
  - [Demo accounts](#demo-accounts)
  - [Trying two-factor sign-in](#trying-two-factor-sign-in)
  - [The demo brokers](#the-demo-brokers)
  - [How it differs from a real gateway](#how-it-differs-from-a-real-gateway)
  - [Demo controls](#demo-controls-1)

---

## Direct demo (`demo.html`)

`demo.html` runs the **whole** application against an in-browser mock broker. It is not a set of canned
screens: the broker holds real queues and messages, so actions compose. Delete a message and the depth drops. Copy
a queue and the destination genuinely receives it -- browse it afterwards and the same messages are there.

It needs nothing alongside it. The demo installs its own Solace SDK, so unlike the other
variants (see [deployment.md](deployment.md)) you do **not** need `solclient.js` next to the HTML. (`jszip.min.js` is
still required for the Queue Browser's ZIP download; every other export works without it.)

It never works with a real broker. It makes no network request: anything it does not answer itself fails as if the
network were down, and only the demo host connects, so a real broker typed into the form is refused, never reached.

### Opening the demo

`demo.html` is attached to every GitHub Release. Download it and open it directly in a browser -- no server
required.

(For developers building from source, `npm run build:demo` produces `dist/demo.html`; `npm run build` produces
every variant in one pass, including `provisioned-demo.html` and the image-only `provisioned.html` and `solAdmin.html`. See
[developer-guide.md](developer-guide.md) for the build workflow.)

### Connecting

Use host **`broker.solace.com`** with any non-empty credentials, or let **Fill the connection form** in the Demo
controls type them for you. Any other hostname is refused on both cards, and a hostname containing `untrust.com`
simulates an untrusted certificate on the messaging connection, so the error paths are demoable too.

To try a broker with two addresses, choose **Appliance** in the **Solace Event Broker Type** card. Keep
`broker.solace.com` as the Management Host and give the Messaging Host a name that contains it, such as
`msg.broker.solace.com`: the demo's messaging connection accepts any such name.

`demo.html` is Direct-only. To try the Provisioned sign-in without a gateway, open [`provisioned-demo.html`](#provisioned-demo-provisioned-demohtml).

### The demo topology

| VPN | Queues |
| --- | --- |
| `default` | `test-queue-1`, `test-queue-2`, `Q/EMPTY`, `demo/payload-samples` |
| `vpn-prod` | `Q/ORDER/NEW`, `Q/ORDER/PROCESS`, `Q/ORDER/ARCHIVE`, `Q/LOGS/AUDIT`, `Q/DENIED` |
| `vpn-dev` | `dev-scratch`, `Q/BULK` |
| `vpn-finance` | `payments-Q`, `reports-daily` |

Six of those are shaped to exercise a specific path rather than to look realistic:

- **`Q/LOGS/AUDIT`** is read-only -- Delete is hidden and the read-only badge shows.
- **`Q/DENIED`** refuses to bind, so the bind-error path is visible.
- **`Q/EMPTY`** binds and delivers nothing.
- **`Q/BULK`** holds several hundred messages, enough for paging and for the copy engine's backpressure to engage.
- **`Q/ORDER/ARCHIVE`** starts empty and is the natural destination for a Queue Copy demo.
- **`demo/payload-samples`** holds one message of each kind the details pane tells apart; see [The payload samples queue](#the-payload-samples-queue).

Two messages in `test-queue-1` and in `Q/ORDER/PROCESS` (the 5th and 6th) exercise payload handling. The 5th is UTF-8 text with non-ASCII characters and shows decoded in the details pane. The 6th is a 12-byte binary payload that is not valid UTF-8, so the details pane shows the placeholder `[Binary payload, looks like PNG image: 12 bytes]` with the binary type badge: it starts with a PNG's signature but holds no image, so a line says it is not shown. The demo SDK hands payloads back the way the real SDK does under its version10 profile (a Latin-1 string, one character per byte) and a copy or move stores them byte for byte, so the binary message arrives in the destination unchanged. At Small volume (a quarter of the seed) `test-queue-1` keeps both messages, but `Q/ORDER/PROCESS` holds only 4 messages, so it loses both; use Normal volume or larger to see them there.

Queues carry topic subscriptions, so a forward to a topic really fans out to the subscribed queues of the
connected Message VPN, as on a real broker: connected to `vpn-prod`, publishing to `orders/new/uk` lands in
`Q/ORDER/NEW`, because that queue subscribes to `orders/new/>`; `test-queue-1` in `default` subscribes to it too,
and stays as it was.

### The payload samples queue

`demo/payload-samples` holds fourteen small messages, one of each kind of body Queue Browser can show. Each message's correlation ID and its `sample` user property name it. The queue always holds all fourteen: the volume setting does not change it. Browse it and select each message in turn:

| Sample | What the details pane offers |
| --- | --- |
| `png-16x16`, `jpeg-16x16`, `gif-1x1`, `webp-16x16` | The image's kind and **Show content**. Press it to see the picture in place of the Content Preview box. |
| `png-too-large` | 33 bytes: only a PNG's signature and the header chunk, which declares 10000 x 10000 pixels (100 megapixels). There is no **Show content**, and a line says why: the app decodes nothing whose header declares more than 40 megapixels, whatever the file's own size. |
| `pdf`, `gzip`, `zip` | The kind. **Show Raw Content** shows the bytes in hex. |
| `elf-header` | "ELF executable or library". It is only the 64-byte header of an executable; nothing in it runs, and the download is named `.bin`. |
| `unknown-bytes` | No kind, since the bytes match no known file type: the placeholder gives the size only. |
| `json-text` | Text. Its publisher's Content-Type is `application/json`, so **Download Content** suggests `.json`. |
| `xml-text` | Text with no Content-Type. It starts with `<?xml`, so **Download Content** suggests `.xml`. |
| `sdt-map` | A map message shown as YAML: every scalar kind (text, whole numbers of several sizes, one beyond 2^53 that keeps all its digits, decimals, true or false, bytes, a topic and a queue, null), a map inside the map and a stream inside it. |
| `sdt-stream` | A stream message shown as YAML, one `-` line per item, with a map and a stream among the items. |

**Download Content** saves a binary sample's bytes as they are, under the name the kind suggests (`solace-message-<id>.png`, `.pdf`, `.gz`, `.zip`; `.bin` for the ELF header and the unknown bytes). The binary samples are generated, and none is larger than 600 bytes. The WebP is a plain orange square.

The map and stream messages are the one place the demo is not exact. A real broker holds them in Solace's binary encoding, which the demo cannot produce. Their **Download Content** therefore saves a stand-in: a first line reading "SDT demo stand-in (not the Solace SDT encoding)" and the message's contents as JSON. The file is named `.bin`, the size shown is the stand-in's, and the YAML in the pane is decoded from the same contents, so it is what a real map or stream would show. Copy or forward either message and it arrives as a map or stream again, as it would on a real broker.

### Demo controls

A **Demo controls** panel sits at the bottom-right. It opens on the first load in a browser tab and stays collapsed after that; click its header to open or close it. Its first line says that nothing leaves the page. It both tells you what the demo accepts and drives the broker live:

- **Connection values** -- the accepted host, every Message VPN, and the host that simulates a certificate error. Click any value to copy it. Usernames, passwords, ports and URL paths are accepted as typed -- only the host is checked -- and the list is generated from the broker's own topology, so it can never disagree with what the pickers show. Pick a VPN and press **Fill the connection form** to type the host, that VPN and a demo username and password (`demo` / `demo`) into the form; then press **Connect** on each card.
- **Queue state** -- switch any queue between normal, read-only, bind-denied, empty and publish-rejected. Applies on the next bind. **Publish rejected** keeps the queue browsable but refuses every publish to it, including a topic publish that fans out to it, with `REJECTED_MESSAGE_ERROR` on the publishing session and nothing spooled. It stays set until you switch the queue back. Use it to show a Queue Copy or Move stopping at the broker rejection with the source untouched.
- **Connection faults** -- fail the next connect, simulate SEMP `401` or `500`, or drop a live session to show the
  disconnect path. The connect failure is one-shot; the SEMP faults stay armed until you clear them.
- **Latency and volume** -- tune the artificial response delay and the seeded message count, then **Reset demo
  data** to rebuild everything from scratch.

Nothing is persisted: reloading the page reseeds the broker, so a reload is always a clean reset.

### What is not in the demo

The Provisioned sign-in and the administration pages are not part of `demo.html`. The
[Provisioned demo](#provisioned-demo-provisioned-demohtml) runs both offline against a fake gateway. Everything else is
exercisable in `demo.html`.

---

## Provisioned demo (`provisioned-demo.html`)

`provisioned-demo.html` is Provisioned mode without a gateway or a broker. It is the real Provisioned sign-in, Connections, Queue
Browser, Queue Copy, Queue Subscriptions and the five administration pages, running against a fake gateway and the demo broker inside the
page. It makes no network request: anything it does not answer itself fails as if the network were down. Like
`demo.html`, it needs no `solclient.js` (`jszip.min.js` is still needed for the ZIP download).

It is attached to every GitHub Release; open it from disk. It starts on the gateway's sign-in page.
(`npm run build:provisioned-demo` builds `dist/provisioned-demo.html`.) For Provisioned mode itself, see
[Provisioned Connections](user-guide.md#provisioned-connections) and [provisioned-mode.md](provisioned-mode.md).

### Demo accounts

| Account | Password | What it shows |
| --- | --- | --- |
| `admin` | `demo-admin-0001` | An administrator: every broker, and the administration pages in the sidebar |
| `operator` | `demo-operator-01` | Operates `orders.*` on `east-prod` / `orders`, reads the rest of `east-prod` and `lab`, never sees `west-dr`; Queue Browser, Queue Copy and Queue Subscriptions |
| `viewer` | `demo-viewer-0001` | Reads `east-prod` / `orders` only; no Queue Copy. Queue Subscriptions leaves out `east-prod`'s `payments` VPN |
| `newadmin` | `demo-change-me-01` | An administrator who must change the password before anything else |

The passwords are fake. The **Demo controls** panel lists them too: click one to copy it, or use **Sign in as**. The
panel opens on the first load in a browser tab, as in `demo.html`.

In the Provisioned demo Queue Copy shows one Destination Connection card instead of the typed destination cards: sign in as operator, connect to east-prod / orders, press Another VPN on the Copy to button, pick the payments VPN and press Connect; the fake gateway dials the VPN's client credential and the demo broker answers. Operator may only write to `orders.*` on east-prod/orders, so the run gate refuses the other VPN's queues. The Direct demo (`demo.html`) keeps the typed destination cards.

### Trying two-factor sign-in

Two-factor sign-in is always on offer: the seed's setting is *Optional* and nobody is enrolled. Set yourself up:

1. Sign in as `admin`. (**Gateway Settings** holds **Two-factor sign-in (code from an authenticator app)**, at *Optional* in the seed; *Administrators must use it* and *Everyone must use it* are the other two choices.)
2. Press the lock icon (**Two-factor sign-in**) at the top of the sidebar, enter the password, and you reach the enrol page: a grey placeholder where the QR code would be, the secret in groups of four, and "In this demo, open Demo controls > Authenticator for the code."
3. In **Demo controls > Authenticator**, the account shows as "admin (setting up)" with its current code and the seconds left. Click the code to copy it, type it into the page and confirm. The ten recovery codes appear once; they are real random codes and work once each.
4. Sign out and sign in again: the password now leads to the code page, which wants the Authenticator's code (or a recovery code) and refuses a used one until the next step.
5. In **User Management**, **Reset two-factor** on a row that is On removes it and signs that user out.

With the setting at *Administrators must use it* or *Everyone must use it*, a sign-in of an account without two-factor goes straight to the enrol page. **Sign in as** in the panel lands on the code or enrol page when the setting asks for a step. The state, including a half-finished sign-in and the last accepted code, carries over a sign-in reload in this tab.

### The demo brokers

| Broker | Message VPN | Queues |
| --- | --- | --- |
| `east-prod` | `orders` | `orders.new`, `orders.process`, `orders.archive` (empty), `audit.orders` (read-only on the broker), `scratch.orders`, `payload-samples` |
| `east-prod` | `payments` | `payments.settled`, `payments.reversal`, `audit.payments` |
| `west-dr` | `orders-dr` | `orders.new`, `orders.replay` (empty) |
| `lab` | `sandbox` | `sandbox.scratch`, `sandbox.bulk` (300 messages) |

Their hosts end in `.demo.invalid`, a name that never resolves.

`payload-samples` is the same set of messages as `demo/payload-samples` in the Direct demo (see [The payload samples queue](#the-payload-samples-queue)). Every account that may browse `east-prod` / `orders` can open it; it is not a queue the operator can write to, because the operator's write rights are `orders.*` only.

### How it differs from a real gateway

- **Administration is in the sidebar.** The product serves the five administration pages at `/solAdmin`; here an
  administrator finds them as sidebar entries.
- **Backup & Restore keeps its backups in the page.** Export downloads a real backup file, and Import opens it, with
  the same encryption as the gateway's. The backup directory is held in this tab (it carries over a sign-in reload,
  the schedule does not), a saved backup's download icon saves it as held, and scheduled backups run only through
  **Back up now**: the demo keeps no timer. The
  demo's accounts keep plain-text passwords, so its backups do too; import one into the demo, not a real gateway,
  which refuses those users.
- **The authenticator codes are mock numbers.** The demo does not compute TOTP: a code is a hash of the account's secret and the 30-second step, accepted for the step before, this one and the next, and once only, like the gateway's. No real authenticator app can produce one; the panel's **Authenticator** shows them. The enrol page draws a placeholder instead of a QR code and says where to find the code; otherwise the pages read as the gateway's do. The demo writes no audit lines for two-factor events.
- **Sign-in reloads the page,** as the gateway's redirect does. The users, connections, settings, sessions, queues and
  panel settings carry over in this tab. A new tab starts from the seed, and **Reset demo data** starts over.
- **A damaged saved state does not lock the tab.** If the saved state has the current version but cannot be loaded,
  the demo clears it, starts from the seed with a fresh fake gateway, still mounts the Demo controls (so **Reset demo
  data** is there) and shows the warning "Saved demo state could not be restored; the demo was reset." for 8 seconds.
  A snapshot of a different version, or one that cannot be read at all, is ignored without a message.
- **Changes apply at once,** to the signed-in user too. Change your own password or Administrator flag, or delete
  your account, and you are signed out. Revoke a user's access and that user's broker connection closes.
- **Versions and stale saves are simulated.** Each user, connection, the settings and the schedule carry a version,
  and a save made from an out-of-date read is refused as in the product, with the same codes: *changed by someone else*
  with Reload, *deleted by someone else*, a name that already exists, and an import refused after a change since the
  preview. Nothing else edits the demo's data while a form is open, so a stale save appears only when a test or
  a second session in the same page changes the record first.
  The rules (a password-only change keeps a record's version, an import restamps every record it imports) follow the
  gateway's.
- **Not simulated (storage and recovery):** a write that fails (full disk; a certificate or CA write that fails, `tls_write_failed`), a store file changed on the host
  (`store_changed_on_disk`), an audit log that cannot be written (`audit_unavailable`, with `audit.onFailure` set to
  `refuse`), and the journal and its recovery after a crash: the demo has no disk. The **Demo controls** can still make
  `config.yaml` read as edited on the host or unreadable.
- **Request limits are simulated in part.** The lockouts after wrong passwords, per account and per client, follow
  the gateway's. A request to the gateway's API without a session draws from the request budget
  (`login.unauthenticatedPerMinute`) and, past it, answers `429` with the wait. A user's dials and broker connections
  share one window of `session.connectsPerMinute` a minute, and one more answers `429`. Both limits start again on a
  restart, and also on a page reload.
- **Not simulated (request limits):**
  - the cross-site request check;
  - the request size limit;
  - the sign-in pages' share of the request budget: in the product every sign-in attempt also draws from it;
  - the cap on open sockets (20 per user, 1000 in all), though the **Demo controls** can make the dial answer `429`
    whatever the count;
  - the limit on concurrent requests.
- **The audit options are saved, no audit trail is written.** Gateway Settings shows the two Audit trail checkboxes (`audit.stdout`, `audit.access`, both off at first) and the `audit.onFailure` choice (`continue` at first) and saves them, but the demo keeps no audit log and has no Audit page, as the real gateway has none in the console.
- **The Certificates page holds a demo certificate, not a parsed one.** The fake gateway cannot read X.509, so it accepts PEM that is well formed (the armour lines and base64 that decodes) and describes what it was given with fixed demo values: subject and issuer `CN=demo certificate`, no names, valid from the moment it was added to one year later, self-signed, never expired. The fingerprint is the real SHA-256 of the decoded bytes. A key is any single `PRIVATE KEY` block, and the pair is taken to match, so the page's "does not match" and "expired" refusals never appear. It starts with one certificate, both files writable and no trusted CA; an unnamed CA is saved as `demo-certificate.crt` (a second unnamed one is refused as already existing). Its Standard root CAs card lists three demo stand-ins for the list the image carries, trusted while **Trust the standard root CAs** is on in Gateway Settings. A replace, add or delete, or that setting, changes what the page shows and nothing else: the demo makes no TLS connection.
- **Restart gateway ends every session, then the page reloads onto the sign-in.** The fake drops every session, ticket and open socket at once, and for about 1.5 seconds answers nothing, as a stopped gateway would; then the page returns to the sign-in. The users, connections, settings and the demo certificate stay, as they do over any sign-in reload.
- **The client access list** is saved and checked against the demo's own address, `192.0.2.10`, so a list that would
  lock you out is refused. A saved list is never enforced.

### Demo controls

The panel is the one in `demo.html`, with the Direct connection values replaced by two sections:

- **Demo accounts:** every account and password (click to copy), **Sign in as** each, and **Sign out**.
- **Authenticator:** every account that has a two-factor secret, enrolled or being set up (shown as "name (setting up)"), with its current mock code (click to copy) and the seconds left in the step. It refreshes every second while it is on the page, and says how to get a secret while nobody has one.
- **Gateway events:**
  - **End my session** closes its broker connections, as a sign-out does; **Expire my session** does not, as an
    expiry does not.
  - **Revoke my VPN access** removes every row of the signed-in user.
  - **Clear the sign-in lockout.**
  - The relay (the broker unreachable: `502`), the dial (rate limited: `429`) and `config.yaml` (edited on the host,
    or unreadable). Both faults show on a Connect, which opens SEMP and messaging together: with the relay down the
    card reads "SEMP (management): broker not reachable" and "Messaging (client): connected, closed because SEMP
    failed"; with the dial rate limited it reads "Messaging (client): too many attempts, wait a minute" and "SEMP
    (management): connected, closed because messaging failed". The full texts are in the notification bell. See
    [Signing in](user-guide.md#signing-in).
  - **TLS files:** *writable* (the start) or *read-only*. Read-only turns both writable flags off, so the Certificates page disables replace, add and delete and says the files are read-only on the gateway host, and the writes answer `409 tls_read_only`, as a read-only mount of `/tls` does.

**Queue state**, **Connection faults** and **Latency and volume** work as in `demo.html`, across every broker. A SEMP
`401` there reaches the app as the relay's `502 upstream_auth`, as a broker refusing the gateway's account does, and a Connect shows "SEMP (management): broker refused the gateway's account".
