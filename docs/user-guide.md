# User Guide

## Overview

Solace Message Utility is a browser-based tool for managing Solace PubSub+ Event Brokers. It runs as a single HTML page — no installation required beyond a web browser and network access to your broker.

The interface has a **sidebar** on the left for navigation and a **main content area** on the right. Three modules are available:

1. **Connections** — Configure and manage broker connections
2. **Queue Discovery** — Browse VPNs and queues via the SEMP management API
3. **Queue Browser** — Inspect, filter, forward, delete, and download messages

---

## Module 1: Connections

This is the first screen you see. It manages two independent connections:

### Solace Client Connection (Web Messaging)

This connection uses the Solace Web Messaging protocol (WebSocket) to communicate with the broker for message operations (browsing, forwarding, deleting).

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Broker Host | IP address or hostname of your broker | `my-broker.solace.cloud`, `192.168.0.10` |
| Protocol | `ws://` (unencrypted) or `wss://` (TLS) | `wss://` (recommended) |
| Port | WebSocket port | `8008` (ws) or `1443` (wss) |
| Message VPN | The Solace VPN to connect to | `default` |
| Username | Client username | `default` |
| Password | Client password or OAuth2 token | |

**Auth Modes:**
- **Basic** — Standard username/password authentication
- **OAuth2** — Token-based authentication (the Username field becomes "Client ID" and Password becomes "Access Token")

**Advanced Settings** (gear icon):
| Setting | Default | Description |
|---------|---------|-------------|
| Connect Retries | 0 | Number of times to retry initial connection |
| Connect Timeout | 3000ms | How long to wait for connection |
| Reconnect Retries | 1 | Retries after disconnect (-1 = infinite) |
| Reconnect Wait | 3000ms | Delay between reconnect attempts |
| Max Messages per Queue | 100 | Per-queue message cap (1–10 000). When a queue exceeds this, the oldest message is silently dropped from the in-memory store and the UI as new messages arrive. Increasing this lets you keep more history at the cost of browser memory; decreasing it limits memory use during long browse sessions. The cap takes effect when you click **Connect** (the live input is read at connect time — no Save required). |

**SSL/TLS Certificate Trust:**
If connecting over `wss://` to a broker with a self-signed certificate, the browser will block the connection. A helper dialog appears with instructions to trust the certificate:
1. Click "Open Broker URL" to open the broker in a new tab
2. Accept the certificate warning in that tab
3. Close the tab and reconnect

### SEMP Connection (Management API)

This connection uses the SEMP v2 REST API for management operations (discovering VPNs and queues).

**Fields:**
| Field | Description | Example |
|-------|-------------|---------|
| Protocol | `http://` or `https://` | `https://` |
| Port | SEMP port | `8080` (http) or `1943` (https) |
| Username | SEMP admin username | `admin` |
| Password | SEMP admin password | |

The SEMP connection shares the same Broker Host as the Solace client connection.

### Connection Profiles

- **Save All Config** — Saves all connection fields to browser localStorage. If localStorage is unavailable or its quota is exceeded, an error toast is shown instead of a success toast.
- **Load All Config** — Restores previously saved fields
- **Reset Form** — Clears all fields back to defaults

### Status Indicators

The sidebar shows two colored dots:
- **Client** indicator — green when Solace client is connected
- **SEMP** indicator — green when SEMP management API is connected

---

## Module 2: Queue Discovery

Requires an active **SEMP connection**. If SEMP is not connected, a "Connection Required" message is shown.

### Workflow

1. **Select a VPN** — Click the VPN dropdown or type to search. The list is fetched from the broker via SEMP. Click "Refresh" to re-fetch.

2. **Select a Queue** — After selecting a VPN, the queue dropdown populates with all queues in that VPN. Type to search. Click "Refresh" to re-fetch.

3. **Open in Browser** — Click this button to navigate directly to the Queue Browser and start browsing the selected queue. This triggers a cross-module flow:
   - If the Solace client is already connected to the same VPN, it navigates immediately
   - If connected to a different VPN, a confirmation dialog asks whether to switch
   - If not connected, it initiates the connection first

### Keyboard Shortcuts

- **Enter** in the VPN input — triggers VPN refresh
- **Enter** in the Queue input — triggers Queue refresh

### Validation

Typing a queue or VPN name that doesn't exist in the fetched list and then clicking away (blur) will clear the input and show a warning in the console.

---

## Module 3: Queue Browser

Requires an active **Solace Client connection**. If disconnected, a "Connection Required" message is shown.

### Binding to a Queue

1. Enter a queue name in the "Queue Name" input
2. Click **Bind** (or press Enter)
3. A `Queue "<name>" bound` toast confirms the bind, the queue appears in the "Bound Queues" dropdown, and messages begin arriving in real-time

You can bind up to **3 queues simultaneously**. Switch between them using the dropdown. Each queue maintains its own message store independently. The per-queue moving-window cap is set by **Max Messages per Queue** in the Connections module's Advanced Settings.

To stop receiving messages, select a queue and click **Unbind**.

### Message Table

Messages are displayed in a scrollable table:

| Column | Description |
|--------|-------------|
| Checkbox | Select individual messages for bulk operations |
| Message ID | The Guaranteed Message ID assigned by the broker |
| Date | Sender timestamp (or "No Timestamp" if not set) |
| Size | Message size in bytes |
| Actions | Per-row buttons: Download Content, Download Full, Forward, Delete |

**Select All** checkbox in the header selects/deselects all visible messages.

The info bar shows counts: **Total** (all messages in store), **Displayed** (after filtering), **Selected** (checked messages).

### Message Details

Click any row to see its details in the panel below:

- **Message ID** — Guaranteed message ID
- **Destination** — Topic or queue name with a badge showing the type
- **Replication Group Message ID** — If available from the broker
- **Message Properties** — Standard Solace properties (Delivery Mode, TTL, Priority, Correlation ID, etc.)
- **Application Properties** — User-defined key/value properties set by the publisher
- **Content Preview** — The message payload (text, binary, SDT)
- **Show Raw Content** — Opens a modal with the full raw message dump

Copy buttons next to Destination, Repl Grp Msg Id, and Content allow one-click clipboard copy.

### Filtering Messages

Click the **filter icon** in the header bar to open the filter modal.

**Filter Criteria:**
| Field | Description |
|-------|-------------|
| Search Criteria | **Match ANY (OR)** or **Match ALL (AND)** |
| Message ID | Filter by message ID (contains) |
| Message Type | Any, Text, Binary, Map, or Stream |
| Destination Name | Filter by destination (contains, supports `*` wildcard) |
| Destination Type | Any, Topic, or Queue |
| Body Content | Filter by payload content (contains, supports `*` wildcard) |
| Properties Filter | Add key/value rows to filter by standard or application properties |

The property filter supports autocomplete for standard Solace properties (App Msg Id, Cache Id, Corr Id, Delivery Count, Delivery Mode, HTTP Encoding, HTTP Type, Priority, Reply To, Sender Id, SeqNumber, TTL, TopicSeqNum).

- **Apply Filter** — Filters the displayed messages (original data is preserved)
- **Clear Filter** — Removes all filters and shows all messages
- **Cancel** — Closes the modal without applying

Modals (filter, forward, raw content, settings, certificate trust helper) can also be dismissed by pressing **Escape** or clicking outside the modal box.

### Forwarding Messages

Forward one or more messages to a different destination:

1. Select messages using checkboxes, then click **Forward** in the toolbar (bulk forward), OR click the forward button on an individual row
2. The Forward modal opens showing the messages queued for forwarding
3. Choose a **Destination Type** and (where applicable) enter a **Destination Name**:
   - **Topic** — fan-out to subscribers of the named topic
   - **Queue** — point-to-point delivery to the named queue
   - **Original Destination** — each message is forwarded to the destination it was originally received on. The Destination Name input is disabled in this mode (the per-message destination is read from each message's broker metadata)
4. Click **Send**

While the send is running, both the type and name inputs are locked and the button shows **Sending...**. They re-enable when the batch reaches a terminal state.

Each message shows a status indicator:
- **QUEUED** — Waiting to be sent
- **SENDING** — In transit
- **SUCCESS** — Broker acknowledged receipt
- **FAILED** — Broker rejected the message (reason shown), the client disconnected mid-send, or the broker did not acknowledge within 30 seconds ("Timed out waiting for broker acknowledgement.")

If any messages fail, the **Send** button changes to **Resend failed messages (N)** with N being the failure count. Clicking it retries only the failed items — successful messages keep their green check and aren't re-forwarded. You can switch the destination type or name (or to/from Original Destination) before clicking resend, so retries can target a different destination than the initial send.

Forwarded messages preserve all original properties (application message ID, correlation ID, delivery mode, priority, TTL, reply-to, user properties, etc.).

> **Note:** Closing the Forward modal (Close button, X, Escape, or backdrop click) discards the in-modal queue. Reopening from the message list rebuilds it with new tracking IDs — pending ACKs from the previous attempt won't update the new view.

### Deleting Messages

- **Single delete**: Click the delete button on a message row. A confirmation dialog appears.
- **Bulk delete**: Select messages with checkboxes, then click **Delete** in the toolbar. A confirmation dialog shows the count.

Deleted messages are removed from the broker queue and the UI immediately.

### Downloading Messages

Two download formats are available:

- **Download Content** — Exports only the message payload. Each message becomes a separate file in a ZIP archive named `solace-message-{id}`.
- **Download Full** — Exports the complete message as JSON including all properties, headers, destination, timestamp, and content. Each message becomes `solace-message-{id}-full.json` in a ZIP archive.

Both are available as per-row buttons and as bulk toolbar buttons (when messages are selected).

Requires JSZip to be loaded (included in the standard deployment).

### Keyboard Shortcuts

- **Enter** in the Queue Name input — triggers Bind
- **Enter** in the Forward Destination input — triggers Send

---

## Tips

- **Cross-module flow**: The fastest way to start browsing is: connect both Client and SEMP in Connections, switch to Queue Discovery, select a VPN and queue, click "Open in Browser". The app handles navigation and binding automatically.

- **Connection profiles**: Save your connection settings before closing the browser. They persist in localStorage and can be restored with one click.

- **Multiple queues**: Bind up to 3 queues and switch between them. Messages accumulate independently per queue. Unbinding a queue removes its messages from the UI but the data stays in memory until you bind again or disconnect.

- **Filtering is non-destructive**: Filters only change what is displayed. All messages remain in memory. Clear the filter to see everything again.

- **Wildcard search**: Use `*` in content and destination filters for glob-style matching (e.g., `order*` matches "orderCreated", "orderUpdated").
