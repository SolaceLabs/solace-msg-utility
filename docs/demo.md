# Demos

Two downloads attached to every [GitHub Release](https://github.com/SolaceLabs/solace-msg-utility/releases) run the
app with no broker and no gateway:

- [`demo.html`](#direct-demo-demohtml) -- Standalone and Gateway mode: the Direct connection form and every module,
  against a broker inside the page.
- [`provisioned-demo.html`](#provisioned-demo-provisioned-demohtml) -- Provisioned mode: the sign-in and the
  administration pages, against a fake gateway inside the page.

Open either straight from disk; no server is needed. Neither works with a real broker, and neither makes a network
request. For what each module does, see the [User Guide](user-guide.md).

---

## Contents

- [Direct demo (`demo.html`)](#direct-demo-demohtml)
  - [Opening the demo](#opening-the-demo)
  - [Connecting](#connecting)
  - [The demo topology](#the-demo-topology)
  - [Demo controls](#demo-controls)
  - [What is not in the demo](#what-is-not-in-the-demo)
- [Provisioned demo (`provisioned-demo.html`)](#provisioned-demo-provisioned-demohtml)
  - [Demo accounts](#demo-accounts)
  - [The demo brokers](#the-demo-brokers)
  - [How it differs from a real gateway](#how-it-differs-from-a-real-gateway)
  - [Demo controls](#demo-controls-1)

---

## Direct demo (`demo.html`)

`demo.html` runs the **whole** application against an in-browser mock broker. It is not a set of canned
screens: the broker holds real queues and messages, so actions compose. Delete a message and the depth drops. Copy
a queue and the destination genuinely receives it -- browse it afterwards and the same messages are there.

It needs nothing alongside it. The demo installs its own Solace SDK, so unlike the other
[variants](user-guide.md#shipped-variants) you do **not** need `solclient.js` next to the HTML. (`jszip.min.js` is
still required for the Queue Browser's ZIP download; every other export works without it.)

It never works with a real broker. It makes no network request: anything it does not answer itself fails as if the
network were down, and only the demo host connects, so a real broker typed into the form is refused, never reached.

### Opening the demo

`demo.html` is attached to every GitHub Release. Download it and open it directly in a browser -- no server
required.

(For developers building from source, `npm run build:demo` produces `dist/demo.html`; `npm run build` produces
every variant in one pass, including `provisioned-demo.html` and the image-only `provisioned.html` and `solAdmin.html`. See [developer-guide.md](developer-guide.md) for the full build workflow.)

### Connecting

Use host **`broker.solace.com`** with any non-empty credentials, or let **Fill the connection form** in the Demo
controls type them for you. Any other hostname is refused on both cards, and a hostname containing `untrust.com`
simulates an untrusted certificate on the messaging connection, so the error paths are demoable too.

`demo.html` is Direct-only. To try the Provisioned sign-in without a gateway, open [`provisioned-demo.html`](#provisioned-demo-provisioned-demohtml).

### The demo topology

| VPN | Queues |
| --- | --- |
| `default` | `test-queue-1`, `test-queue-2`, `Q/EMPTY` |
| `vpn-prod` | `Q/ORDER/NEW`, `Q/ORDER/PROCESS`, `Q/ORDER/ARCHIVE`, `Q/LOGS/AUDIT`, `Q/DENIED` |
| `vpn-dev` | `dev-scratch`, `Q/BULK` |
| `vpn-finance` | `payments-Q`, `reports-daily` |

Five of those are shaped to exercise a specific path rather than to look realistic:

- **`Q/LOGS/AUDIT`** is read-only -- Delete is hidden and the read-only badge shows.
- **`Q/DENIED`** refuses to bind, so the bind-error path is visible.
- **`Q/EMPTY`** binds and delivers nothing.
- **`Q/BULK`** holds several hundred messages, enough for paging and for the copy engine's backpressure to engage.
- **`Q/ORDER/ARCHIVE`** starts empty and is the natural destination for a Queue Copy demo.

Queues carry topic subscriptions, so a forward to a topic really fans out: publishing to `orders/new/uk` lands in
`Q/ORDER/NEW`, because that queue subscribes to `orders/new/>`.

### Demo controls

A **Demo controls** panel sits at the bottom-right. It opens on the first load in a browser tab and stays collapsed after that; click its header to open or close it. Its first line says that nothing leaves the page. It both tells you what the demo accepts and drives the broker live:

- **Connection values** -- the accepted host, every Message VPN, and the host that simulates a certificate error. Click any value to copy it. Usernames, passwords, ports and URL paths are accepted as typed -- only the host is checked -- and the list is generated from the broker's own topology, so it can never disagree with what the pickers show. Pick a VPN and press **Fill the connection form** to type the host, that VPN and a demo username and password (`demo` / `demo`) into the form; then press **Connect** on each card.
- **Queue state** -- switch any queue between normal, read-only, bind-denied and empty. Applies on the next bind.
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
Browser, Queue Copy, Queue Subscriptions and the three administration pages, running against a fake gateway and the demo broker inside the
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

### The demo brokers

| Broker | Message VPN | Queues |
| --- | --- | --- |
| `east-prod` | `orders` | `orders.new`, `orders.process`, `orders.archive` (empty), `audit.orders` (read-only on the broker), `scratch.orders` |
| `east-prod` | `payments` | `payments.settled`, `payments.reversal`, `audit.payments` |
| `west-dr` | `orders-dr` | `orders.new`, `orders.replay` (empty) |
| `lab` | `sandbox` | `sandbox.scratch`, `sandbox.bulk` (300 messages) |

Their hosts end in `.demo.invalid`, a name that never resolves.

### How it differs from a real gateway

- **Administration is in the sidebar.** The product serves the three administration pages at `/solAdmin`; here an
  administrator finds them as sidebar entries.
- **Sign-in reloads the page,** as the gateway's redirect does. The users, connections, settings, sessions, queues and
  panel settings carry over in this tab. A new tab starts from the seed, and **Reset demo data** starts over.
- **Changes apply at once,** to the signed-in user too. Change your own password or Administrator flag, or delete
  your account, and you are signed out. Revoke a user's access and that user's broker connection closes.
- **Not simulated:**
  - the cross-site request check;
  - the request size limit;
  - the sign-in limit for clients without a session (the per-account lockout after five wrong passwords is
    simulated);
  - the limit on concurrent requests.
- **The client access list** is saved and checked against the demo's own address, `192.0.2.10`, so a list that would
  lock you out is refused. A saved list is never enforced.

### Demo controls

The panel is the one in `demo.html`, with the Direct connection values replaced by two sections:

- **Demo accounts:** every account and password (click to copy), **Sign in as** each, and **Sign out**.
- **Gateway events:**
  - **End my session** closes its broker connections, as a sign-out does; **Expire my session** does not, as an
    expiry does not.
  - **Revoke my VPN access** removes every row of the signed-in user.
  - **Clear the sign-in lockout.**
  - The relay (the broker unreachable: `502`), the dial (rate limited: `429`) and `config.yaml` (edited on the host,
    or unreadable).

**Queue state**, **Connection faults** and **Latency and volume** work as in `demo.html`, across every broker. A SEMP
`401` there reaches the app as the relay's `502 upstream_auth`, as a broker refusing the gateway's account does.
