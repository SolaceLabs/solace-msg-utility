# Solace Message Utility

A browser-based tool for managing Solace PubSub+ Event Brokers. Browse queues, inspect messages, forward, delete, copy across brokers, and search subscriptions — all from a single self-contained HTML page. No installer, no backend.

![Queue Browser](images/browser.png)

## Quick Start

1. **Get the app.** Drop `index.html`, `solclient.js`, and `jszip.min.js` into any folder served over HTTP. The build produces only `index.html` — the two vendor scripts (`solclient.js` and `jszip.min.js`) are **not bundled** and must be downloaded separately and placed alongside `index.html` (or in a sibling `js/` folder). See [deployment.md](docs/deployment.md#external-runtime-dependencies) for download sources. Opening the file directly works for the UI, but SEMP calls will fail due to CORS — use a tiny local server instead.
2. **Open it in a browser.** The Connections screen loads first.
3. **Fill in two connections** (both share the same Broker Host):
   - **Solace Client** (WebSocket, for message operations) — VPN, username, password, port `8008` (ws) or `1443` (wss).
   - **SEMP** (REST, for management operations) — admin username, password, port `8080` (http) or `1943` (https).
4. **Click Connect** on each. The two dots in the sidebar turn green when ready.
5. **Save All Config** — your settings persist in the browser for next time.
6. **Use the sidebar** to switch between Queue Browser, Queue Copy, and Queue Subscriptions.

> **Try it without a broker:** open `mock.html` instead. Use Broker Host `broker.solace.com` and any non-empty credentials — every module works against deterministic mock data. See [Demo Mode](docs/user-guide.md#demo-mode-mockhtml) for details.

> **Self-signed TLS certificates:** if `wss://` connection is blocked, the app shows a helper dialog with one-click instructions to trust the broker certificate.

## Features

### Connections
- Two independent connections (Solace Web Messaging + SEMP REST), shared broker host.
- **Basic** or **OAuth2** authentication for the Solace client.
- **Save / Load / Reset** connection profiles (localStorage).
- **Advanced settings** — connect/reconnect retries, timeouts, per-queue message cap (1–10 000).
- Live status dots in the sidebar for both connections.
- SSL trust helper for self-signed broker certificates.

### Queue Browser
- Bind up to **3 queues simultaneously** and switch between them; each keeps its own message history.
- Real-time message arrival into a sortable, scrollable table.
- Per-message **details panel** — properties, application properties, destination, payload preview, raw dump.
- One-click **copy** for destination, replication-group ID, and content.
- **Filter modal** with AND/OR matching across Message ID, type, destination, body content, and standard or application properties. Supports `*` wildcards; body filter is auto-substring.
- **Forward** one or many messages to a topic, queue, or each message's original destination. Per-message status (QUEUED → SENDING → SUCCESS / FAILED) with retry-only-failed.
- **Delete** single or bulk messages (read-write queues only; hidden on read-only).
- **Download** as ZIP — payload-only or full JSON (properties + payload).
- Keyboard shortcuts: **Enter** to bind, **Enter** to send forward.
- Modals dismiss on **Escape** or backdrop click.

### Queue Copy
- Copy or **move** messages between queues, on the same broker or **across brokers**.
- Two-column form — read-only Source mirror + editable Destination with **Same Broker** / **Same VPN** shortcuts.
- Destination can be a **queue** (with SEMP-driven picker) or a **topic**.
- Bounded runs — snapshots the source before starting so the run has a defined end.
- Pre-flight verification (count, size, quota, oldest/newest message ID) via SEMP, with QueueBrowser fallback if SEMP is unavailable.
- Live progress with per-message ACK and a **Continue beyond** prompt for messages that arrive during the run.
- Stops on the first error (quota, permission, rejection) so partial state is visible.

### Queue Subscriptions
- Lists every `(VPN, queue, topic-subscription)` triple visible to your SEMP user — answer "which queues subscribe to topic X?" without walking each queue manually.
- Three column filters, AND-combined.
- VPN / Queue filters: case-insensitive substring by default; `*` switches to anchored wildcard (`def*`, `*ult`, `def*ult`).
- Subscription filter uses **Solace topic-set intersection** (`*` = one level, `>` = trailing levels) — typing `orders/new` matches a stored `orders/*`.
- Loaded list is cached in memory; **Refresh** re-fetches.

### Cross-cutting
- **SEMP queue picker** — used by Browser, Copy, and Subscriptions to select queues without leaving the current module.
- **Toasts** for every success / failure.
- **Single-file build** — `dist/index.html` is fully self-contained for the app code; the two vendor scripts `solclient.js` and `jszip.min.js` must be downloaded separately (see [deployment.md](docs/deployment.md#external-runtime-dependencies)) and placed alongside it.
- **Demo bundle** (`dist/mock.html`) — every module exercised against mock data, no broker required.
- **Containerised gateway** ([`go-web-proxy/`](go-web-proxy/)) — optional single-binary Go HTTPS gateway serves the PWA, exposes a `/hosted` probe, and reverse-proxies SEMP/SMF traffic so browsers only need to trust one cert. Distroless image; see [deployment.md](docs/deployment.md#option-d-containerised-gateway-go-web-proxy).

## Documentation

| Document | Description |
|----------|-------------|
| [user-guide.md](docs/user-guide.md) | Full UI walkthrough, every field, every screen |
| [deployment.md](docs/deployment.md) | Build, hosting options, network requirements, TLS |
| [architecture.md](docs/architecture.md) | System diagrams, module structure (developers) |
| [developer-guide.md](docs/developer-guide.md) | Setup, testing, adding modules, code conventions |
| [contributing.md](docs/contributing.md) | PR workflow, coding standards, test requirements |
| [test-report.md](docs/test-report.md) | Test methodology, coverage strategy |
| [improvement-plan.md](docs/improvement-plan.md) | Prioritized backlog |

## License

[GNU GPLv3](LICENSE)
