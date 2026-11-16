export const meta = {
  name: 'admin-tls-restart-build',
  description: 'Build the admin console polish (cards, columns, module tiles and pills), console-managed live TLS, environment-only TLS paths and the in-place restart',
  phases: [
    { title: 'Gateway', detail: 'live TLS, environment-only paths, TLS API, restart (Go)' },
    { title: 'Cross-check', detail: 'read the Go change as a compiler' },
    { title: 'Fake and console', detail: 'fake gateway, demo controls, Gateway Settings, User Management, Certificates' },
    { title: 'Contract, e2e, docs', detail: 'goldens, e2e checks 28-31, compose, documentation' },
  ],
}

const ROOT = '/opt/claude-workspace/projects/smu-dirty'
const SCRATCH = '/opt/claude-workspace/projects/smu-dirty/tmp/admin-tls'
const DESIGN = `${SCRATCH}/decisions.md`
const NOTES = `${SCRATCH}/notes`

const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
    unfinished: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'filesChanged', 'deviations', 'unfinished', 'risks'],
}

const base = (id, owns) => `You are agent ${id} in a team building one change in the repository ${ROOT} (branch feature/rbac): admin console polish, console-managed live TLS, environment-only TLS paths and an in-place restart, for the Go gateway (go-web-proxy), its in-browser fake (src/mock-broker/gateway) and the admin console modules.

READ FIRST, in full: ${DESIGN}. It is the pinned design; build exactly what it says. Where it is silent, follow the pattern of the existing code and say what you chose under deviations. Then read every note already in ${NOTES}/ (create the directory's file for your own note when you finish), and the docs that describe the code you extend (docs/architecture.md and docs/developer-guide.md; for the console, the module conventions in CLAUDE.md and docs/developer-guide.md's module walkthrough).

RULES
- You own ONLY these files (create them if new): ${owns}. Do not edit any other file. If another file must change, list it under unfinished with the exact change needed. Other agents are editing the rest of the tree at the same time, to the same design.
- The working tree already holds one small uncommitted change (unknown paths answer 404 in go-web-proxy/proxy.go, with its tests, e2e check D1 and docs). Keep it exactly as it is.
- Never run a gate or anything that builds, tests, lints, formats or mutates state: no go, gofmt, npm, npx, tsc, vitest, eslint, docker, graphify update, and no git command that changes anything. Read-only inspection is fine. A hook requires \`graphify query "<question>"\` before any raw grep.
- Nothing you write will have been compiled or run when you finish, so check it by reading: every call against its definition, every import used, nothing declared twice, nothing left unused by what you removed, Go formatted as gofmt would, TypeScript strict-clean (no implicit any, no unused variable), ESLint house rules (no alert or confirm, no document.getElementById outside the shell, no console outside the logger).
- Plain ASCII only. Match the surrounding naming and comment style. Comments say what and why, never ticket numbers.
- A private key never reaches a response, a log line, an audit entry, an error text, a test name or a fixture file that is not clearly a throwaway test key.
- Tests ship in the same change, mirror the source layout and describe real scenarios: every refusal code, every fallback, the security boundaries (bad input is refused AND nothing is written or swapped). Web code you touch stays at 100% statements, branches, functions and lines (no v8 ignore for a reachable branch; required() for module-owned elements; loadModuleDOM in tests). The Go total must not fall below 98.7%: do not add error branches no test can reach, and cover the ones you add (injectable seams for disk and process faults, as fileutil.go and writer.go have).
- A test that refers to another test names it by file and test name.
- When done, write ${NOTES}/${id}.md: exact signatures, types, field names, route and body shapes, element ids and class names other agents need, what you removed or renamed, and what the next agents must do. Keep it short and exact.
- Return the structured result: summary (what is built, plainly, and that nothing was run), filesChanged, deviations, unfinished, risks (what is most likely to fail at the first compile or test run).`

const A1 = base('A1-tls-core', 'every .go file under go-web-proxy/ EXCEPT managed.go, managed_test.go, managed_routing.go, managed_routing_test.go, audit.go, audit_test.go and the files the next agent creates (tls_api.go, tls_api_test.go, restart.go, restart_unix.go, restart_other.go, restart_test.go)') + `

YOUR PART (design sections A1 and A2, and the helpers of A3 the API agent calls)
1. Environment-only paths: remove tls.certFile, tls.keyFile and tls.trustDir from the config file model, the settings model and catalog, the seed, the header comment, the restart-only and host-only lists and the start-up log, keeping the three environment variables read at every start; treat the three as removed keys in an existing config.yaml (ignored, dropped at the next save, one WARN at start naming each that differs from the path in use) and in a backup's settings. Remove the host-only machinery if nothing else uses it.
2. Live TLS: the certificate holder behind GetCertificate; the trust holder (pool and skip flag) that every outbound TLS connection reads when it connects, in the SEMP relay, the Direct relay and the SMF gate, with idle upstream connections closed on a change; tls.insecureSkipVerify applied live on a settings save and an import, out of the restart-only list.
3. The TLS manager the API will call, in tls.go: describe a certificate (the fields of A3's <cert>), list the trust directory as A3's <file> list, verify a certificate and key pair with the refusals of A3 (typed so the API maps field and reason), write the pair as one journaled commit in the certificate's directory and swap it, add and delete a CA file by validated name with the pool rebuilt and swapped, the two writable answers, one lock around the writes, and the recovery of the certificate's directory at start before the pair is loaded. Injectable seams for the faults a test must produce (a write that fails, a directory that is read-only).
Tests for all of it, including: a new handshake sees the replaced certificate while an open connection carries on; a relay request fails verification after its CA is deleted and passes after it is added back, with no restart; the skip flag applied live; a crash between the two files of a pair is recovered at start; a config.yaml and a backup that still hold the three keys.`

const A2 = base('A2-tls-api', 'go-web-proxy/managed.go, managed_test.go, managed_routing.go, managed_routing_test.go, audit.go, audit_test.go, main.go, main_test.go (wiring only), and the new files go-web-proxy/tls_api.go, tls_api_test.go, restart.go, restart_unix.go, restart_other.go, restart_test.go') + `

YOUR PART (design sections A3 and A4)
Read ${NOTES}/A1-tls-core.md first and call its manager with its exact signatures.
1. The five TLS routes of A3 through the audited wrapper (the ok audit line for a write is written once the write has happened; refusals by the wrapper), with the body shapes, statuses, codes, field names and audit actions pinned there, the JSON body cap, and no path or key in any answer or log line.
2. POST /managed/restart exactly as A4 says: the audit line, the 202, then the same shutdown as SIGTERM followed by the injectable process hook; restart_unix.go and restart_other.go behind build tags so both builds compile; the failed-exec path logging and exiting with status 1.
3. The audit action constants and phrases for tls.certificate.replace, tls.trust.add, tls.trust.remove and gateway.restart.
Tests: every route for an administrator, a plain user and no session; every refusal of A3 with nothing written and nothing swapped; the audit entries (and that no key is in the audit log or the application log); the restart handler answering before the shutdown starts, draining a request in flight, calling the hook once, and the failed-exec path; the GET shape for a healthy state, an unreadable CA file and a read-only directory.`

const X = base('X-crosscheck', 'every .go file under go-web-proxy/, for fixes only') + `

YOUR PART
You are the compiler and the reviewer for the Go side. Read ${NOTES}/A1-tls-core.md and A2-tls-api.md, then the whole Go change (git diff for go-web-proxy/, plus the new files in full).
1. Compile by reading: every call matches its definition, every import used and every used package imported, no duplicate declaration in package main (tests included), no reference to a removed symbol (the three path keys, the host-only machinery), build tags correct for both builds, no unused variable. Fix what you find.
2. Conformance with design sections A1 to A4; fix departures.
3. Security review: a private key never in a response, log, audit entry or error; CA file names cannot leave the trust directory (no separators, no dot names, no links followed, regular files only); the pair is verified before anything is written and written as one commit; body sizes capped; every new route behind the administrator gate and the same-origin check; the restart cannot be triggered without an administrator's session; no lock held across the exec; nothing half-swapped when a write fails.
4. Concurrency: the holders are safe for concurrent handshakes and writes; closing idle connections cannot race a request in flight into a panic; lock order is consistent with the writer lock.
5. Coverage: added branches no test reaches get a test or go. gofmt by reading on the changed lines.
Write ${NOTES}/X-crosscheck.md with what you fixed and what remains.`

const F = base('F-fake', 'everything under src/mock-broker/ and the tests under tests/mock-broker/ EXCEPT these four: tests/mock-broker/gateway/contract.test.ts, seed.test.ts, routes.test.ts, error-codes.test.ts') + `

YOUR PART (design section A5, and A1 as the fake stores settings)
The Go side is being written at the same time, so the design is your contract. Build the TLS routes and the restart route in the fake with the statuses, codes, field names and shapes of A3 and A4 and the demo values of A5; remove the three path keys from the fake's settings, seed, validation and backup handling (an older backup or snapshot that holds them is read and the keys dropped); make tls.insecureSkipVerify need no restart; add the Demo controls switch "TLS files read-only" in the style of the panel's existing switches; make the restart end sessions and tickets, apply what waited for a restart and return the page to the sign-in. Tests for all of it at 100% coverage, including a demo-flow test that replaces the certificate, adds and deletes a CA, flips the read-only switch and restarts. In your note give the fake's exact API (functions, shapes, the control's id) for the console and contract agents.`

const W1 = base('W1-settings', 'everything under src/modules/gateway-settings/ and tests/modules/gateway-settings/, everything under src/modules/admin-login/ and tests/modules/admin-login/, and src/css/components.css') + `

YOUR PART (design section A6: naming, the Gateway Settings layout, module tiles, the restart card)
Read ${NOTES}/F-fake.md first for the fake's shapes.
1. The nav name "Gateway Settings" and the sign-in module's hint text.
2. Every section a card, stacked full width and never side by side; short fields in columns with the shared class .form-cols, which you add to src/css/components.css exactly as the design defines it; long fields full width. Keep every existing id that tests and the e2e use.
3. Modules on offer as toggle tiles with the descriptions the design gives (module-scoped styles in the module's styles.css).
4. Remove the three path fields and everything that only served them (the host-only tag and legend if nothing else uses them); keep "Skip broker certificate checks (insecure)" in the broker trust card, saved with the rest and no longer listed as needing a restart.
5. The card "Gateway" with Restart gateway: the confirm dialog (the existing confirm component, never window.confirm), the POST through the module's service, the restarting state, waiting for /hosted to answer again and going to the sign-in, and the pending-restart notice pointing at the same button. Timers injectable or faked in tests.
Tests for every new branch at 100% coverage with loadModuleDOM.`

const W2 = base('W2-users', 'everything under src/modules/user-management/ and tests/modules/user-management/') + `

YOUR PART (design section A6: User Management layout and the module pills)
1. The list and every section of the form in its own card, stacked full width and never side by side; short fields in columns with the shared class .form-cols (another agent adds it to src/css/components.css exactly as the design defines it: use the class, do not define it).
2. A user's modules as the design says: the choice between the deployment default (naming the modules it gives) and choosing; pills with remove buttons; the Add module menu listing offered modules not yet chosen; a module no longer offered shown as a pill marked "not offered" that can be removed; pills without remove buttons while the default is selected. What is saved is unchanged: no list for the default, the chosen list otherwise.
Keep every existing id that tests and the e2e use, or list every id you had to change in your note. Module-scoped styles in the module's styles.css. Tests for every new branch at 100% coverage with loadModuleDOM.`

const W3 = base('W3-certificates', 'the new module src/modules/tls-certificates/ and tests/modules/tls-certificates/, everything under src/variants/, src/core/services/managed-api.ts and tests/core/services/managed-api.test.ts, and the files that register or gate an admin module (src/core/rbac.ts, src/registry.ts and the tests of variants, rbac and the registry) where a new admin module needs an entry') + `

YOUR PART (design section A6: the Certificates module, and the two new stock messages)
Read ${NOTES}/F-fake.md first for the fake's shapes, then an existing admin module end to end (src/modules/backup is the closest: a service file over managedRequest, a module.ts, index.html, styles.css, and how the variants and the admin gating list it).
Build the module tls-certificates, nav name "Certificates", in every variant that carries the admin modules (after Gateway Settings), exactly as A6 describes: the two cards, file inputs and pasted PEM for the certificate, the key and a CA, the check step that shows what will be installed before the confirm, the confirm dialogs (the existing component), the read-only state, the expired and expires-within-30-days marks (the clock injectable), the key field cleared after every attempt, toasts for success and for each refusal through the stock messages (add tls_read_only and tls_write_failed to the messages and the code list). The key is held only in the field and the request, never in module state that outlives the attempt.
Tests for every branch at 100% coverage with loadModuleDOM, plus the service's tests and the variant, registry and gating tests that enumerate modules.`

const G = base('G-contract', 'go-web-proxy/testdata/contract/cases.json, go-web-proxy/testdata/contract/seed.json, go-web-proxy/contract_test.go, tests/mock-broker/gateway/contract.test.ts, seed.test.ts, routes.test.ts, error-codes.test.ts (all four under tests/mock-broker/gateway/), scripts/e2e.mjs, scripts/e2e-lib.mjs, tests/build/e2e-lib.test.ts, every compose file under docker/, tests/build/compose-files.test.ts and tests/helpers/compose.ts') + `

YOUR PART (design section A7: contract, e2e, compose)
Read every note in ${NOTES}/ first, then both gateways' code for the shapes you assert.
1. Contract: seed.json and every recorded settings body lose the three path keys; new cases as A7 lists, with the certificate fields of GET /managed/tls normalised on both replays; routes.test.ts and error-codes.test.ts rows for the new routes and the two new codes. Edit cases.json carefully, keep its formatting, prove it parses with a read-only check, and do not regenerate it.
2. e2e: make the Provisioned gateway's /tls writable in the e2e stack while keeping the container posture the compose tests pin (say exactly how in your note); helpers in e2e-lib.mjs to issue a second certificate and an expired one from the run's CA and to read a server's certificate fingerprint over TLS, with tests; checks 28 to 31 as A7 describes, after 27, each restoring what it changed (the original certificate, the broker CA, a signed-in administrator after the restart), secrets masked and swept. The existing checks that restart or sign in must keep working after check 31.
3. Shipped compose files: the comments A7 asks for; keep every posture test green and extend the tests only where a mount changed.
Note in ${NOTES}/G-contract.md what the owner should look at first if a golden or an e2e check disagrees.`

const H = base('H-docs', 'docs/provisioned-mode.md, docs/user-guide.md, docs/architecture.md, docs/developer-guide.md, docs/deployment.md, docs/demo.md, docs/contributing.md, docs/test-report.md, README.md') + `

YOUR PART (design section A7: docs)
Read every note in ${NOTES}/ and the code and tests as shipped, then write the documentation in the style and voice of each file. Cover what A7 lists. In provisioned-mode.md say plainly how to let the console manage certificates (a writable /tls) and how to lock it (a read-only mount), that TLS changes apply at once, what Restart gateway does and when it is needed, that the three paths come only from the environment and what happens to an old config.yaml that still holds them. In user-guide.md describe what the administrator sees, with the exact labels and messages copied from the code. In test-report.md add a ledger entry in the format of the latest ones (one bullet per part, tests named by file and name, a Results bullet saying the gates have not been run), and update the e2e check counts wherever they are stated (44 checks, 31 numbered; 34 with E2E_BROWSER=0), contributing.md included. Every doc's Contents list must equal its ## and ### headings; verify with a read-only script.`

phase('Gateway')
const [go, web] = await parallel([
  async () => {
    const core = await agent(A1, { label: 'Go: live TLS and environment-only paths', phase: 'Gateway', schema: RESULT, model: 'sonnet' })
    if (!core) return { failed: 'A1-tls-core returned nothing' }
    const api = await agent(A2, { label: 'Go: TLS API and restart', phase: 'Gateway', schema: RESULT, model: 'sonnet' })
    const crosscheck = await agent(X, { label: 'Go cross-check', phase: 'Cross-check', schema: RESULT, model: 'sonnet' })
    return { core, api, crosscheck }
  },
  async () => {
    const [fakeThenConsole, users] = await parallel([
      async () => {
        const fake = await agent(F, { label: 'fake gateway and demo controls', phase: 'Fake and console', schema: RESULT, model: 'sonnet' })
        const [settings, certificates] = await parallel([
          () => agent(W1, { label: 'Gateway Settings: cards, tiles, restart', phase: 'Fake and console', schema: RESULT, model: 'sonnet' }),
          () => agent(W3, { label: 'Certificates module', phase: 'Fake and console', schema: RESULT, model: 'sonnet' }),
        ])
        return { fake, settings, certificates }
      },
      () => agent(W2, { label: 'User Management: cards and pills', phase: 'Fake and console', schema: RESULT, model: 'sonnet' }),
    ])
    return { ...(fakeThenConsole || {}), users }
  },
])
if (!go || go.failed) return { failed: go ? go.failed : 'the Go chain failed', web }

const [contract, docs] = await parallel([
  () => agent(G, { label: 'contract, e2e and compose', phase: 'Contract, e2e, docs', schema: RESULT, model: 'sonnet' }),
  () => agent(H, { label: 'docs', phase: 'Contract, e2e, docs', schema: RESULT, model: 'sonnet' }),
])
return { ...go, ...(web || {}), contract, docs }
