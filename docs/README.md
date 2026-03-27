- [Overview](#overview)
- [Connections](#-connections)
  - [Solace Client Connection](#solace-client-connection)
  - [SEMP Connection](#semp-connection)
- [Queue Discovery](#-queue-discovery)
- [Queue Browser](#-queue-browser)
  - [Queue Binding](#binding-to-queues)
  - [View Message(s)](#viewing-messages)
  - [Filter/Search](#-filter--search-messages)
  - [Download Message(s)](#-download-messages)
  - [Forward Message(s)](#-forward-messages)
  - [Delete Message(s)](#-delete-messages)

# Overview

This version of the **Solace Message Utility** introduces a redesigned architecture focused on modularization. This enables cleaner separation of features and easier future expansion.

The utility now supports both:

* **Queue Discovery**
* **Queue Browsing**

Refer to the sections below for detailed explanations of each feature.

---

# 🔌 Connections

This page manages the connection sessions required by the different modules.

| Connection Type | Supported Modules |
| --------------- | ----------------- |
| **SEMP**        | Queue Discovery   |
| **Client**      | Queue Browsing    |

![Connections](../images/connections.png)

> To reduce configuration errors, both connections **must use the same hostname or IP address**.
> Connection status indicators are displayed at the bottom-right of the page.

## Solace Client Connection

Supports both **Basic Authentication** and **OAuth2**.

Ensure the following fields are entered correctly:

**Common Fields**

* Protocol
* Port
* Message VPN

**Basic Authentication**

* Username
* Password

**OAuth2 Authentication**

* Access Token
* ID Token

## SEMP Connection

> [!IMPORTANT]
> SEMP connections are made over HTTP/HTTPS. Your Solace Event Broker must allow **CORS** for this to function.
> Future versions will include additional connection methods that do not require CORS.

Ensure the following fields are entered correctly:

* Protocol
* Port
* Username
* Password

> Additional SEMP connection methods (e.g., via client session or OAuth2) will be supported in future releases.

> [!NOTE]
> In this version, SEMP interactions are REST calls rather than persistent connections. Each action triggers a new HTTP request using the provided credentials. The “connection” concept is maintained for consistency with other modules.

---

# 🔍 Queue Discovery

Once a SEMP connection is established, available **Message VPNs** on the broker can be browsed. You can then select a queue directly instead of manually entering its name.

![Queue Discovery](../images/discovery.png)

---

# 📂 Queue Browser

After establishing a **Solace Client connection**, you can bind to one or more queues to browse their messages.

![Queue Browsing](../images/browser.png)

### Features

* Bind to multiple queues
* View message content
* Filter / search messages
* Download messages
* Forward (resend) messages
* Delete messages

## Binding to Queue(s)

Enter a queue name to bind. Multiple queues can be bound simultaneously. Bound queues appear in the **Bound Queues** dropdown list.

## Viewing Messages

Once a queue is bound, its messages are listed. The browser displays:

* Message headers and properties
* Application/User properties
* Message payload

### Key Properties

| Field                            | Description                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Message Id**                   | The Guaranteed Message Identifier (`msg.getGuaranteedMessageId()`), also known as the *Spooler Message Identifier*. This is an internal broker identifier and should not be used by applications for processing.  |
| **Destination**                  | The immediate destination (queue name or topic string). If a message is published to a topic and delivered to the queue through the queue’s topic subscription, this field records the **original topic string**. |
| **Replication Group Message Id** | The globally unique identifier applications should use. All copies of the same message share this ID.                                                                                                             |

### Message Properties

Displayed in the **Message Properties** section:

* Application Message Id
* Cache Request Id
* Correlation Id
* Delivery Count
* Delivery Mode
* HTTP Content Encoding
* HTTP Content Type
* Priority
* Reply To
* Sender Id
* Sequence Number
* Time to Live
* Topic Sequence Number

**Custom properties** are shown under **Application / User Properties**.

The payload is shown in the **Content Preview** section.

## 🔎 Filter / Search Messages

![Message Filtering](../images/browser-filter.png)

Messages can be filtered using the following fields:

| Field             | Description                              | Case Insensitive | Exact Match | Wildcard Support |
| ----------------- | ---------------------------------------- | ---------------- | ----------- | ---------------- |
| Message Id        | Matches Guaranteed Message Identifier    | ✔                | ✔           | ✔                |
| Message Type      | Text, Binary, Map, Stream, or Any        |                  | ✔           | ✔                |
| Destination Name  | Queue name or topic string               | ✔                | ✔           | ✔                |
| Destination Type  | Queue or Topic                           |                  | ✔           | ✔                |
| Properties Filter | Matches message + application properties | ✔                | ✔           | ✔                |
| Body Content      | Matches payload (wildcard auto-applied)  | ✔                |             |                  |

**Wildcard usage:**
`*` matches any sequence of characters (including spaces and symbols).

Fields without exact match support always operate in wildcard mode.
Example: entering `match text` behaves as `*match text*`.

### Search Logic

* **ANY** → OR logic (matches any criteria)
* **ALL** → AND logic (matches all criteria)

## ⬇ Download Messages

Two download options are available:

1. **Download Content** (payload only)
2. **Download Full Message (JSON)**

> Bulk download requires **JSZip** (`jszip.min.js` or `jszip.js`) to be available locally. Please put it in the same directory or in `js` folder

### Download Content

Downloads payload in binary form. If the content is a known format (PDF, PNG, DOCX, etc.), rename the file with the correct extension before opening.

For bulk downloads:

1. Select messages via checkboxes
2. Click **Download Content**
3. A ZIP file containing selected messages will be generated

### Download JSON

Downloads the full message as JSON:

```json
{
  "messageProperties": { ... },
  "applicationProperties": { ... },
  "payload": "..."
}
```

> [!IMPORTANT]
> This JSON structure is proprietary to this tool and may change in future releases.

For bulk downloads:

1. Select messages via checkboxes
2. Click **Download Full**
3. A ZIP file containing selected messages will be generated

## 📤 Forward Messages

![Message Forwarding](../images/browser-forward.png)

Forwards messages to a specified destination. The message is copied and sent **as a new message**, preserving all properties.

All forwarded messages are sent using **PERSISTENT** delivery mode to ensure delivery confirmation, even if the original message was DIRECT.

Bulk forwarding:

1. Select messages
2. Click **Forward**
3. Status will indicate success or failure

## 🗑 Delete Messages

> [!IMPORTANT]
> Available only if the queue binding user has **read-write** permissions (Consume, Modify, Delete, Owner).

Messages can be removed from the queue directly from the browser.

Bulk deletion:

1. Select messages
2. Click **Delete**
