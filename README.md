# Solace Message Utility

A modular PWA for managing Solace PubSub+ Event Brokers. Browse queues, inspect messages, forward, delete, filter, and download — all from a single-page interface built on a micro-kernel architecture.

## Quick Start

```bash
npm install
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Production build → dist/index.html (single file)
npm test             # Run all 658 tests
npm run test:coverage # Run tests with coverage; fails the gate if below vitest.config.ts thresholds
```

**Prerequisites:** Node.js 20+. The Solace SDK (`solclient.js`) and JSZip (`jszip.min.js`) are loaded at runtime via `<script>` tags in `index.html`.

## Modules

### Connections (Priority 100)
Dual connection management for Solace Web Messaging (Client) and SEMP (Management API). Supports Basic and OAuth2 authentication, connection profiles via localStorage, and advanced settings (retries, timeouts, reconnect strategies).

### Queue Discovery (Priority 50)
SEMP-driven hierarchical browsing: select a VPN, then a queue. Real-time search/filter on both lists. "Open in Browser" triggers a cross-module flow that auto-connects and navigates to the Queue Browser.

### Queue Browser (Priority 30)
Bind up to 3 (configurable via global settings) queues simultaneously. Inspect message headers, properties, and payloads. Bulk operations: delete, forward (to queue or topic with ACK tracking), and download as ZIP (content-only or full JSON with headers). Advanced filtering by content, message ID, destination, type, and custom properties with AND/OR criteria.

## Architecture

Micro-kernel with typed EventBus and dependency injection. See [architecture.md](docs/architecture.md) for diagrams and details.

```
src/
  core/           Kernel, EventBus, type system, required() helper
  css/            Split design system (variables, reset, layout, components, utilities)
  modules/
    connections/      Solace client + SEMP connection management
    queue-discovery/  VPN and queue discovery via SEMP (async-generator pagination)
    queue-browser/    Message browsing, filtering, forwarding, deletion
  module-ids.ts   Canonical module-id list (build plugin + registry both key off it)
  registry.ts     Module registry (ordered)
  main.ts         Bootstrap
```

Modules are isolated — zero cross-module imports. All coordination flows through the typed EventBus. Each module receives an `AppContext` with injected services (state management, SEMP auth, clipboard, navigation). Each module owns its own `index.html` template (injected at build time by a Vite plugin) and an optional `styles.css`.

## Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](docs/architecture.md) | System diagrams, data flow, module structure |
| [developer-guide.md](docs/developer-guide.md) | Setup, testing, adding modules, code conventions |
| [user-guide.md](docs/user-guide.md) | UI workflows, feature reference |
| [deployment.md](docs/deployment.md) | Build, hosting, external dependencies |
| [contributing.md](docs/contributing.md) | PR workflow, coding standards, test requirements |
| [test-report.md](docs/test-report.md) | Test methodology, coverage strategy, v8 ignore rationale |
| [improvement-plan.md](docs/improvement-plan.md) | Prioritized backlog: security, bugs, accessibility, performance |

## Testing

658 tests across 23 test files. `vitest.config.ts` sets **100% thresholds** on all four coverage metrics (statements, branches, functions, lines); the current run is slightly below (Statements 99.61%, Branches 98.06%, Functions 98.99%, Lines 99.72%) and the gate is failing. See [test-report.md](docs/test-report.md) for the per-file breakdown and methodology.

## Tech Stack

| Concern | Tool |
|---------|------|
| Language | TypeScript + JavaScript (ES modules) |
| Bundler | Vite 6 + vite-plugin-singlefile |
| Test runner | Vitest 4 + jsdom |
| Coverage | @vitest/coverage-v8 |
| Runtime deps | Solace SDK (solclient.js), JSZip |

## License

Private / Internal Use
