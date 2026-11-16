# Critical review - SolaceMessageUtility

Date: 2026-11-16
Commit: 5cbdc2d on feature/rbac
Previous report: docs/review/2026-11-10-critical-review.md
Scope: all areas, plus one requested evaluation (the appendix on binary payload previews)
Stacks: Go (go-web-proxy/go.mod), bash (scripts/dev.sh, setup.sh), Node/TypeScript (package.json), GitHub Actions (.github/workflows/*.yml), containers (docker/Dockerfile, docker/*.yaml); checklists core + go + bash + node + github-actions + containers. PowerShell (scripts/dev.ps1): core checklist only.
Graph: reused; 5003 nodes, 16269 links, 181 communities (built by the owner's `./scripts/dev.sh graphify` at 11:48 from the tree later committed as 5cbdc2d)
Dynamic checks: none run by the review; the owner's `./scripts/dev.sh full` and `./scripts/dev.sh e2e` runs on this tree are cited, see Dynamic checks

## Summary

| Severity | New | Still open | Fixed since last | Total open |
|---|---|---|---|---|
| Blocker | 0 | 0 | 2 | 0 |
| Major | 1 | 0 | 12 | 1 |
| Minor | 34 | 8 | 77 | 42 |
| Nit | 31 | 6 | 21 | 37 |
| Suspected (uncounted) | 3 | 0 | 2 | 3 |

The project is in clearly better shape than six days ago. Of the 128 findings left open by the last review, 114 are fixed, including both Blockers and 12 of the 13 open Majors; the thirteenth (CR-0003) remains, re-rated Minor because the docs now state the limitation. The gates the owner ran on this tree are green: web coverage 100%, Go 98.8% under the race detector, and 44 of 44 end-to-end checks. The code added since then (the single writer, two-factor sign-in, live TLS and restart) held up under a close read: no Blocker was found, and the one Major is in the web app, where the Provisioned connect flow carries on after its SEMP step fails and then hides the error (CR-0137). The gateway findings that matter most are gaps at the edges of sound designs: any account holder can reset the per-client sign-in throttle (CR-0139), `audit.onFailure: refuse` does not cover certificate, trusted-CA or restart requests (CR-0143), and the app is served without a Content-Security-Policy (CR-0136). The rest is small: 42 Minors and 37 Nits, many of them docs that slipped in the rewrite or comments that still tell history. The trend is strongly better.

## Top risks

1. CR-0137 [major] A failed SEMP connect in the Provisioned panel does not stop the Solace connect, and the SEMP error is then overwritten by 'connected' - src/modules/connections/managed-panel.ts:196-203. A broker whose SEMP relay is down (a 5xx or an unreachable broker) yields a 'connected' session with no SEMP.

## Findings by area

### design

#### CR-0019 [minor] [open] Queue-picker and queue-browser keep module-level mutable state that the no-global-state rule does not except

Location: src/core/components/queue-picker/index.ts:89, src/core/components/queue-picker/index.ts:98-100, src/modules/queue-browser/state.js:33, src/modules/queue-browser/state.js:95, src/modules/queue-browser/ui-core.js:7-20
Confidence: verified
Evidence:

    src/core/components/queue-picker/index.ts:89: let cache: PickerCache | null = null;
    src/core/components/queue-picker/index.ts:98: let refs: Refs | null = null;
    src/core/components/queue-picker/index.ts:99: let state: State | null = null;
    src/core/components/queue-picker/index.ts:100: let pendingResolve: ((v: PickQueueResult | null) => void) | null = null;
    src/modules/queue-browser/state.js:33: export const state = {
    src/modules/queue-browser/ui-core.js:20: let gate = null;

CLAUDE.md anchor 2: 'No global state -- everything flows through AppContext.' developer-guide.md:501: 'module-scoped state lives in closures, not global singletons.' pickQueue keeps its cache, DOM refs, state and pending promise in four module-level `let`s shared by every caller (queue-copy and queue-discovery both use it), so a second picker cannot be open (`Queue picker is already open`) and a cache outlives any one AppContext. queue-browser keeps its whole state in an exported singleton (state.js:33), a wire-in hook (state.js:95) and a gate (ui-core.js:20). docs/testing.md:338-340 acknowledges the singletons ('Reset them in beforeEach') but no doc records them as an accepted exception. Second check: Module-level lets exist at queue-picker/index.ts:89,98-100, queue-browser/state.js:33 (exported singleton), ui-core.js:20 (gate=null), and CLAUDE.md anchor 2 says no global state. docs/testing.md:340 acknowledges the singletons only as a test reset note. However the picker cache has an explanatory docblock (index.ts:80-83) stating its keyed, deliberate design (replaced on a different source key), so 'a cache outlives any AppContext' is intended and keyed by source, and the 'one picker open at a time' behaviour is a deliberate guard. The rule violation is real, the harm claim is overstated. This is the part of CR-0019 that remains: the hosted flag moved into AppState, but the picker's cache and dialog state and the queue-browser state object are still module-level. If the owner accepts that, the rule in CLAUDE.md should name the exception.

Why it matters: State that survives across installs is what the rule forbids, and it forces the resetQueueBrowserState helper and per-test cache resets; a second app context in one page would share it.

Change: Either move the picker's state into a createQueuePicker() closure that the module creates and holds, and make queue-browser's state a createState() result held by the module, or state the exception in CLAUDE.md and the developer guide with the reason (reopen-instantly cache).

#### CR-0136 [minor] [new] The app bundles and the administration console are served with no Content-Security-Policy and no frame-ancestors

Location: go-web-proxy/proxy.go:109-111, go-web-proxy/proxy.go:199-200
Confidence: verified
Evidence:

    go-web-proxy/proxy.go:109: 	w.Header().Set("Content-Type", "text/html; charset=utf-8")
    go-web-proxy/proxy.go:110: 	w.Header().Set("Cache-Control", "no-store")
    go-web-proxy/proxy.go:111: 	_, _ = w.Write(data)
    go-web-proxy/proxy.go:199: 	w.Header().Set("Content-Type", "text/html; charset=utf-8")
    go-web-proxy/proxy.go:200: 	_, _ = w.Write(data)

1. Only the sign-in pages (pages.go:26, `frame-ancestors 'none'`) and the SEMP relay answers (relay.go:208-209) carry a CSP or nosniff; grep finds no X-Frame-Options anywhere in non-test Go. 2. adminHandler.ServeHTTP serves solAdmin.html, whose actions are destructive (delete users, replace the certificate, restart), and serveIndex serves the app, both with only Content-Type and Cache-Control. 3. The session cookie is SameSite=Lax (session.go:155), which a cross-site iframe does not carry, so a foreign site cannot frame a signed-in console. A page on any same-site host (a sibling subdomain) can, and framing needs no cookie to be set. docs/provisioned-mode.md:434 states the frame ban for 'Pages' (the sign-in pages), which is accurate but easy to read as the whole gateway. Also checked by the orchestrator: a search of go-web-proxy/*.go, src/index.html and docker/ finds a Content-Security-Policy only at pages.go:26 and pages.go:96 (the sign-in pages) and relay.go:209 (relay answers). The bundles render broker- and gateway-supplied text. Every sink the reviewers found uses textContent or escapeHtml, so nothing is exploitable today, but one future innerHTML mistake would run script in the origin that holds the Provisioned session. A static host needs the policy as a meta tag with script hashes generated at build time, because the single-file build inlines its scripts.

Why it matters: Clickjacking of the admin console is blocked only by the cookie's SameSite mode; one header closes it for same-site attackers too.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/proxy.go
+++ b/go-web-proxy/proxy.go
@@ -109,3 +109,4 @@
 	w.Header().Set("Content-Type", "text/html; charset=utf-8")
 	w.Header().Set("Cache-Control", "no-store")
+	w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
 	_, _ = w.Write(data)
```

#### CR-0018 [nit] [open] Module header comments give priorities the variant manifests no longer hold, and architecture.md points at connections/module.ts for code that now lives in vpn-switch.ts

Location: src/modules/queue-copy/module.ts:20-21, src/modules/queue-browser/module.ts:5, src/variants/standard.ts:16-17, docs/architecture.md:198, src/modules/connections/vpn-switch.ts:89-97
Confidence: verified
Evidence:

    src/modules/queue-copy/module.ts:20: * Priority 20: below queue-browser (30) so it appears beneath it in the
    src/modules/queue-browser/module.ts:5: * Priority 30: Depends on Solace session from Connections module.
    src/variants/standard.ts:16:     'queue-browser': 80,
    src/variants/standard.ts:17:     'queue-copy': 70,
    docs/architecture.md:198: The `returnTo` field only selects which finish event fires (`browser:browse-queue` for `'queue-browser'` and the default, `copy:vpn-switched` for `'queue-copy'`) -- it does **not** alter navigation. Future modules using this handshake inherit the policy automatically: pick a `returnTo`, add a finish-event branch in [connections/module.ts](../src/modules/connections/module.ts), don't reintroduce per-caller navigation differences. Tests in [tests/modules/connections/module.test.ts](../tests/modules/connections/module.test.ts) lock the four rows above in place.
    src/modules/connections/vpn-switch.ts:89: function finish(req: CheckConnectionRequest): void {
    src/modules/connections/vpn-switch.ts:90:     if (req.returnTo === 'queue-copy') {

The docs, kernel.ts and types.ts now say priority lives in the variant manifest, and architecture.md:175-177 was rewritten, so the other parts of the old finding are fixed. Two module headers were missed. They state priorities 30 and 20, but src/variants/standard.ts sets 80 and 70, and docs/developer-guide.md:225 and :240 say 80 and 70. Priority is documented as 'not a module property', so a number in the module header can only drift. docs/architecture.md:198 still tells contributors to add a finish-event branch in connections/module.ts; the switch is in src/modules/connections/vpn-switch.ts.

Why it matters: A reader of the module header gets an ordering that contradicts the manifest and the developer guide.

Change: Drop the numbers from both headers and keep the dependency sentence.

### correctness

#### CR-0137 [major] [new] A failed SEMP connect in the Provisioned panel does not stop the Solace connect, and the SEMP error is then overwritten by 'connected'

Location: src/modules/connections/managed-panel.ts:196-203, src/modules/connections/managed-panel.ts:368-376, src/modules/connections/managed-panel.ts:186-186
Confidence: verified
Evidence:

    src/modules/connections/managed-panel.ts:186:         onError: ({ message }) => card.setStatus('error', `SEMP error: ${message}`),
    src/modules/connections/managed-panel.ts:369:             await connectSemp(brokerName);
    src/modules/connections/managed-panel.ts:370:             // A relay 401 (the gateway session ended) has already signed out.
    src/modules/connections/managed-panel.ts:371:             if (!signedIn()) return;
    src/modules/connections/managed-panel.ts:372:             await connectSolace(brokerName, vpnName);
    src/modules/connections/managed-panel.ts:200:                 await serviceSemp.connect(c.cfg, c.broker, '');

1. serviceSemp.connect() never rejects. On a relay answer that is neither ok nor 401, and on a network error, it calls hooks.onError and returns (semp-client.ts, the 'SEMP connect refused' and 'SEMP connect failed' branches). 2. In the panel, sempHooks.onError calls card.setStatus('error', 'SEMP error: ...') (L186), so connectSemp resolves normally. 3. doConnect only checks signedIn() (L371), so it goes on to connectSolace (L372). 4. While the dial and the SDK connect run, the card is in status 'error', not 'connecting'. The Connect button and both selects are enabled again, so a second click starts a second doConnect. 5. When the Solace session comes up, onConnected calls card.setStatus('connected', summary), which clears the error line. The user sees 'Connected' with isSempConnected false. Queue Browser, Queue Copy and the discovery modules then fail on their SEMP calls with no link to the cause. The test at tests/modules/connections/managed-panel.test.ts 'SEMP onDisconnected / onError' only calls the hook. No test says what the connect flow does after a SEMP failure.

Why it matters: A broker whose SEMP relay is down (a 5xx or an unreachable broker) yields a 'connected' session with no SEMP. The failure is shown for a moment and then erased. Double-click races open while the Solace dial is in flight.

Change: Make a SEMP failure end the connect. Have connectSemp return a boolean, or check appState.isSempConnected after the await in doConnect. If SEMP is not up, return without calling connectSolace and leave the card on the SEMP error. Alternatively keep the card in 'connecting' until both finish. Add a managed-panel test: sempMock.connect fires onError, then solaceMock.connect must not be called and the error line must stay.

#### CR-0138 [minor] [new] The sign-in tickets are read before the account's turn and not re-checked inside it, so parallel requests on one ticket can open two sessions or re-confirm a set-up; submitSetup also reads the enrolled state before the turn

Location: go-web-proxy/pages.go:609-669, go-web-proxy/pages.go:728-749, go-web-proxy/pages.go:784-815
Confidence: verified
Evidence:

    go-web-proxy/pages.go:609: 	at, ok := p.sessions.tickets.fromRequest(r)
    go-web-proxy/pages.go:633: 	release, ok := p.takeTurn(w, r, user, client, resolved, stepAnswers{
    go-web-proxy/pages.go:644: 	defer release()
    go-web-proxy/pages.go:728: 	secret, enrolled := p.store.totpSecret(as.user)
    go-web-proxy/pages.go:738: 	release, ok := p.takeTurn(w, r, as.user, client, resolved, stepAnswers{
    go-web-proxy/pages.go:784: 	at, ok := p.sessions.tickets.fromRequest(r)
    go-web-proxy/pages.go:815: 	release, ok := p.takeTurn(w, r, user, client, resolved, stepAnswers{

1) submitCode looks the ticket up at line 609, then waits for the account's turn (633). Two requests carrying the same ticket cookie both hold a valid copy of `at`; the first finishes, calls endTicket (dropping the ticket) and opens a session. 2) The second gets its turn, still holds the stale `at`, and never re-checks that the ticket exists. If it carries a different acceptable code (a recovery code, or a TOTP code of a later step than the first one used), spendCode accepts it and line 664 ifUnchanged (password hash only) creates a second session from the already-spent ticket, so a ticket is not strictly single use under parallelism. 3) submitSetup reads `secret, enrolled` at line 728 before the turn; if a confirm for the same user completes while it queues, it still runs with enrolled=false, so only the password is asked and it can issue a setup ticket that replaces the new authenticator without a current code. 4) submitConfirm for a setup ticket has the same stale ticket (784) and re-stores a second secret with fresh recovery codes. The windows need a concurrent request for the same account, and the party involved already holds the password or the ticket, so the gain is small, but the code's own comments promise one-at-a-time checking and a one-use ticket. Second check: Re-read pages.go. submitCode reads the ticket at 609 before takeTurn (633) and never re-checks it, and ifUnchanged(user, at.hash, ...) checks only the password hash, so a second parallel request holding the same ticket copy and a different valid code (recovery code, or a later TOTP step) can open a second session. That part holds. But the claim that submitCode reads the user's two-factor state before the turn is wrong: totpSecret is read after takeTurn (line 645, inside the turn). submitConfirm also re-reads twoFactorOf inside the turn (line ~826), and an enrol ticket cannot replace an existing secret there. What survives: stale ticket in submitCode and submitConfirm (a stageSetup ticket can be confirmed twice with the same code, re-storing the same secret with fresh recovery codes, requires the signed-in browser), and stale secret/enrolled in submitSetup (728 before takeTurn at 738). Impact needs a concurrent request by a party already holding the ticket/codes or session, so minor.

Why it matters: The single-use ticket and the 'set up again needs the current code' rules hold only for sequential requests; concurrent requests on one account can get a second session from one ticket or skip the code check. Impact is limited to someone who already holds the ticket plus codes, or the password plus a racing owner.

Change: Take the turn first, then read the ticket (tickets.lookup by cookie id) and the totpSecret/twoFactorOf state inside it, treating a missing ticket as 'ticket gone' (redirect to /login). In submitCode do the lookup after takeTurn succeeds; in submitSetup read secret/enrolled after takeTurn; in submitConfirm re-read the ticket after takeTurn. Add a test next to TestLogin_ParallelGuessesForOneAccountQueue (pages_test.go) that submits one ticket twice in parallel with two valid recovery codes and expects one session.

#### CR-0139 [minor] [new] Any successful sign-in clears the client's failure record, and requests with a valid session skip the unauthenticated bucket, so an account holder can launder the per-client throttle while spraying other accounts.

Location: go-web-proxy/throttle.go:273-278, go-web-proxy/pages.go:172-177, go-web-proxy/pages.go:344-346
Confidence: verified
Evidence:

    go-web-proxy/throttle.go:273: func (t *throttle) loginSucceeded(user string, client netip.Addr, ok bool) {
    go-web-proxy/throttle.go:276: 	delete(t.users, userKey(user))
    go-web-proxy/throttle.go:277: 	delete(t.clients, clientKey(client, ok))
    go-web-proxy/pages.go:172: 	as, signedIn := p.sessions.fromRequest(r)
    go-web-proxy/pages.go:173: 	if signedIn {
    go-web-proxy/pages.go:175: 	} else if !p.allowAnon(w, r) {
    go-web-proxy/pages.go:345: 	p.throttle.loginSucceeded(user, client, resolved)

1) A user with one valid account signs in and keeps the session cookie. 2) POST /login with other usernames: ServeHTTP sees signedIn and skips allowAnon (172-177), so the 60-per-minute bucket does not apply. 3) Each wrong guess calls loginFailed, adding one failure to users[victim] and to clients[prefix]. 4) After maxFailures-1 (4) wrong guesses the attacker signs in as themselves; sessionOpened calls loginSucceeded, which deletes clients[prefix] (277). 5) The client count restarts at zero, so the per-client back-off never starts, while each victim account only sees 4 failures per quiet window. The attacker can spray a password list across all usernames at about 4 guesses per account per 15 minutes without ever being blocked as a client. The per-user limit still caps guessing against one named account.

Why it matters: The per-client failure limit exists to stop one address trying many accounts; any holder of a low-privilege account can neutralise it, so spraying other accounts (including administrators) with common passwords is limited only by the per-user back-off.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/throttle.go
+++ b/go-web-proxy/throttle.go
@@ -270,9 +270,10 @@ func recordFailure[K comparable](t *throttle, m map[K]*failures, k K, now time.Time, kind, label string) (started bool) {
-// loginSucceeded clears both keys' failure counts.
+// loginSucceeded clears the account's failure count. The client's record is
+// left to age out: a sign-in to one's own account must not reset the count of
+// guesses made against others from the same address.
 func (t *throttle) loginSucceeded(user string, client netip.Addr, ok bool) {
 	t.mu.Lock()
 	defer t.mu.Unlock()
 	delete(t.users, userKey(user))
-	delete(t.clients, clientKey(client, ok))
 }
```

#### CR-0140 [minor] [new] A sign-in with a recovery code goes through writer.Do, so audit.onFailure refuse refuses it although the docs say sign-ins are never refused

Location: go-web-proxy/writer.go:118-122, go-web-proxy/pages.go:548-554, go-web-proxy/managed_routing.go:65, docs/architecture.md:1004, go-web-proxy/pages.go:552, go-web-proxy/store.go:1058-1059, go-web-proxy/pages.go:622-626, docs/provisioned-mode.md:414, docs/provisioned-mode.md:168, docs/deployment.md:343, docs/user-guide.md:602
Confidence: verified
Evidence:

    go-web-proxy/writer.go:118: 	if w.gate != nil {
    go-web-proxy/writer.go:119: 		if gerr := w.gate(); gerr != nil {
    go-web-proxy/pages.go:552: 	valid, left, err = p.store.useRecoveryCode(ctx, user, hashRecoveryCode(code))
    go-web-proxy/managed_routing.go:65: 	h.store.wr.gate = a.gate

setAuditor installs a.gate as the gate of the one writer. Do runs the gate for every transaction, before the op. spendCode calls store.useRecoveryCode, which is a wr.Do. With audit.onFailure=refuse and the last audit write failed, the gate returns errAuditUnavailable, useRecoveryCode returns it, submitCode (pages.go:650-654) calls unavailable(err) and the user gets 503 audit_unavailable. The recovery code is not spent (the op never ran). architecture.md:1004 and audit.go:134-135 say 'Sign-ins and reads are never refused'. The own-password change and two-factor set-up (setPassword, setTOTP) are refused the same way; those are changes, but the recovery-code sign-in is a sign-in. docs/deployment.md:343 and docs/provisioned-mode.md:168 tell operators that sign-ins carry on under refuse.

Why it matters: During an audit-disk outage in refuse mode, an admin whose only working second factor is a recovery code cannot sign in to fix the outage, and the docs promise otherwise.

Change: Either document that a recovery-code sign-in is refused while the audit log is failing (and that refuse mode can lock out a user who has only recovery codes), or let useRecoveryCode bypass the gate (a writer option for the gate-exempt transaction) and audit the loss as usual.

#### CR-0141 [minor] [new] The upstream dialer offers h2, and with a custom TLS dialer net/http no longer forces HTTP/1.1 for WebSocket upgrades, so SMF fails through any upstream that selects h2

Location: go-web-proxy/proxy.go:275-280, go-web-proxy/proxy.go:249, go-web-proxy/smf.go:127-139
Confidence: verified
Evidence:

    go-web-proxy/proxy.go:249: 		ForceAttemptHTTP2:     true,
    go-web-proxy/proxy.go:277: 		NextProtos:         []string{"h2", "http/1.1"},
    go-web-proxy/smf.go:127: 	resp, err := g.upstream.RoundTrip(out)
    go-web-proxy/smf.go:134: 	if resp.StatusCode != http.StatusSwitchingProtocols || !isConn || !strings.EqualFold(resp.Header.Get("Upgrade"), "websocket") {

1. newUpstreamTransport (proxy.go:242) installs DialTLSContext, so every wss/https connection to a broker comes from dialUpstreamTLS, which sets NextProtos to {h2, http/1.1} (proxy.go:277). 2. net/http marks a WebSocket upgrade request requiresHTTP1 and, for the stock dialer, clears NextProtos in persistConn.addTLS (transport.go:1787-1789: `if pconn.cacheKey.onlyH1 { cfg.NextProtos = nil }`). That code is not run when a custom TLS dialer is set (dialConn takes the customDialTLS branch, transport.go:1886 onward), so cacheKey.onlyH1 is never applied. 3. After the dial, dialConn takes over with TLSNextProto[NegotiatedProtocol] whenever the broker's TLS server selected h2 (transport.go:2109-2117), whatever the request asked for. 4. The SMF gate (smf.go:127) and the Direct relay's ws/wss path (ReverseProxy over the same transport) send `Connection: Upgrade` / `Upgrade: websocket`. On an h2 connection the request is refused client-side (Connection is not allowed in HTTP/2), so RoundTrip fails and the user gets 502 upstream_unavailable (smf.go:129-131) with no 101. Whether it hits depends only on whether the broker's TLS port (or a load balancer or ingress in front of it) advertises h2 in ALPN. A broker that speaks only HTTP/1.1 hides the problem, which is why the real-broker e2e run would still pass. Checked by the orchestrator in the Go 1.27.4 source on this machine: net/http/transport.go:1787-1789 clears NextProtos for an upgrade request only inside addTLS, which a transport with DialTLSContext does not use (transport.go:1888); transport.go:2108-2117 then hands a connection that negotiated h2 to the HTTP/2 round tripper, which rejects an Upgrade header (net/http/internal/httpcommon/httpcommon.go:451). A Solace broker's own TLS ports do not offer h2, which is why the end-to-end run passes; a TLS-terminating proxy or ingress in front of the broker that offers h2 triggers it.

Why it matters: Where the broker sits behind a TLS terminator that offers h2, SEMP works and every SMF connection fails with 502 upstream_unavailable, in both gateway modes, with nothing in the answer naming the cause. HTTP/2 buys nothing here.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/proxy.go
+++ b/go-web-proxy/proxy.go
@@ -275,4 +275,4 @@
 	conn := tls.Client(raw, &tls.Config{
 		ServerName:         host,
-		NextProtos:         []string{"h2", "http/1.1"},
+		NextProtos:         []string{"http/1.1"},
 		InsecureSkipVerify: true,
```

#### CR-0142 [minor] [new] A CA file the pool trusts can be listed in the console with a Delete button that always fails (name rule and link rule differ from the pool's)

Location: go-web-proxy/tls.go:464, go-web-proxy/tls.go:956-967, go-web-proxy/tls.go:670-675, go-web-proxy/tls.go:224-227, src/modules/tls-certificates/module.ts:170-178
Confidence: verified
Evidence:

    go-web-proxy/tls.go:224: 		ext := strings.ToLower(filepath.Ext(name))
    go-web-proxy/tls.go:464: var trustNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(crt|pem)$`)
    go-web-proxy/tls.go:957: 	if !trustNameRE.MatchString(name) {
    go-web-proxy/tls.go:966: 	if info, err := os.Lstat(path); err != nil || !info.Mode().IsRegular() {
    src/modules/tls-certificates/module.ts:178:                 del.addEventListener('click', () => void removeTrust(file.name));

1. buildTrustPool (tls.go:224-233) and trustFiles (tls.go:671-675) accept any file whose extension lower-cases to .crt or .pem, of any name, and follow symlinks (os.ReadFile; a link is not IsDir). 2. removeTrust accepts only names matching trustNameRE (lower-case extension, starts with a letter or digit, only [A-Za-z0-9._-], at most 64 before the extension) and only a regular file (tls.go:966). 3. A host-supplied CA such as Corp-Root.CRT, my ca.pem, _root.crt, a name over 64 characters, or a symlinked file is trusted by the pool and listed by GET /managed/tls. module.ts:170-178 gives every listed file an enabled Delete button. 4. Delete answers 422 invalid (name rule) or 404 not_found (link). For a 404 the UI reloads and the file is still listed. The admin cannot remove a CA the console shows.

Why it matters: A trusted CA that the console shows but will not delete cannot be revoked from the console; the admin has to reach the host, which is what the page exists to avoid.

Change: Make the list and the delete agree: either list a file with a Deletable flag that is true only when trustNameRE matches and it is a regular file (the UI disables Delete otherwise and says why), or let removeTrust accept the names the pool reads (case-insensitive extension, a plain base name with no separator) and the link case. Add a tls_test.go case with an upper-case extension.

#### CR-0143 [minor] [new] audit.onFailure refuse does not cover certificate, trusted-CA and restart requests: only store transactions pass the gate

Location: go-web-proxy/tls_api.go:104-112, go-web-proxy/restart.go:26-31, go-web-proxy/audit.go:131-135, go-web-proxy/tls_api_test.go:126-166
Confidence: verified
Evidence:

    go-web-proxy/audit.go:133: // not be written. continue (the default) logs the lost record loudly and goes
    go-web-proxy/audit.go:134: // on; refuse also refuses every change (503 audit_unavailable) until a record
    go-web-proxy/tls_api.go:105:	cert, err := h.tls.replaceCertificate(in.Certificate, in.Key)
    go-web-proxy/tls_api.go:111:	h.recordOK(r, call)
    go-web-proxy/restart.go:27:	h.recordOK(r, call)
    go-web-proxy/restart.go:30:	h.restart()

The gate that implements refuse is auditor.gate, installed only as writer.gate (writer.go:118-119), so it runs only for transactions through the store writer. Users, connections, settings, backup schedule and import all go through the writer, and each has an audit_unavailable test (managed_test.go:1028-1043, settings_test.go:846-862, backup_api_test.go:293-301). The TLS routes (PUT /managed/tls/certificate, POST and DELETE /managed/tls/trust) and POST /managed/restart use h.audited, which only records after the fact; tlsManager has its own mutex and journal and never calls the gate (grep 'gate' in tls.go finds nothing). With audit.onFailure refuse and a failing audit file, an administrator can still swap the served certificate, add or remove trusted CAs, or restart the gateway, each answered 200 or 202 and its audit line lost. tls_api_test.go and restart_test.go contain no audit_unavailable or onFailure case. The audit.go comment says refuse refuses 'every change', while the docs (provisioned-mode.md, deployment.md) list only users, connections, settings and the backup schedule, so the exemption, if intended, is not stated as a decision anywhere nor held by a test. Checked by the orchestrator: the gate is consulted only in writer.Do (writer.go:118-122). docs/deployment.md:343 and docs/provisioned-mode.md:168 list users, connections, settings and the backup schedule as what refuse stops, so the docs describe the code, but nothing says the TLS routes and restart are exempt, and the comment at audit.go:132-135 says every change. The lost line is still logged as AUDIT RECORD LOST in the application log. The first reviewer rated this major; with the docs listing the covered changes it is a gap in scope, not a broken promise.

Why it matters: An operator who sets refuse so that no administrative change goes unrecorded can still have the served certificate replaced, a trusted CA added or removed, and the gateway restarted while the audit log is failing. Trusted CAs decide which brokers the gateway believes, so these are among the changes the policy exists for.

Change: Decide and pin it. Either call auditor.gate (return 503 audit_unavailable through writeTLSFailure and the restart handler) before replaceCertificate, addTrust, removeTrust and restart, and add a case per route to tls_api_test.go and restart_test.go modelled on managed_test.go's 'audit unavailable' subtest; or state in audit.go and the two docs that these four routes are exempt, and add a test that they still succeed while the gate is closed.

#### CR-0144 [minor] [new] The SEMP client claims the connection forms reject non-ASCII credentials, but the queue-copy destination SEMP form does not validate them, so a non-ASCII password reaches btoa and gives a raw browser error.

Location: src/core/services/semp-client.ts:93-96, src/modules/queue-copy/module.ts:317-325, src/core/utils.ts:284-286
Confidence: verified
Evidence:

    src/core/services/semp-client.ts:95:            // forms reject non-ASCII credentials before this (sempAccountError).
    src/core/services/semp-client.ts:96:            const authHeader = relay ? '' : basicAuthHeader(cfg.user, pass);
    src/modules/queue-copy/module.ts:325:            void destSempClient.connect(cfg, f.host, state.destSempPass);
    src/core/utils.ts:285:    return `Basic ${btoa(`${user}:${pass}`)}`;

sempAccountError is called only from src/modules/connections/module.ts (grep of src finds no other caller). queue-copy's destination SEMP connect (module.ts:317-325) takes state.destSempPass and f.semp.user straight from the inputs and calls destSempClient.connect with no check. connect builds the header with basicAuthHeader, which is plain btoa. (1) A destination SEMP password with a character above U+00FF makes btoa throw. (2) The catch in semp-client connect passes errMessage(err) to onError. (3) queue-copy shows 'SEMP error: Failed to execute btoa on Window: The string to be encoded contains characters outside of the Latin1 range.' (module.ts:283-285). A Latin-1 character is sent as one Latin-1 byte instead of UTF-8, so the broker answers 401 and the user sees 'authentication failed' with no hint about the encoding. The comment at semp-client.ts:93-95 is therefore untrue for this caller.

Why it matters: The primary form gives an actionable rule message, but the second SEMP entry point gives a browser internals message or a misleading 401. The comment hides that the validation gap exists.

Change: Call sempAccountError(user, pass) in the queue-copy destination SEMP connect path (module.ts, before destSempClient.connect) and show its message in the destination SEMP error slot, with a test that the client is not called. Alternatively validate inside createServiceSemp.connect for the non-relay case so every caller gets it. Either way, correct the comment in semp-client.ts.

#### CR-0145 [minor] [new] Download Content, ZIP and Copy Content of an SDT map or stream message write the placeholder text as if it were the payload

Location: src/modules/queue-browser/service-events.ts:70-74, src/modules/queue-browser/ui-details.ts:33-34, src/modules/queue-browser/ui-table.ts:245, src/modules/queue-browser/ui-events.ts:23
Confidence: verified
Evidence:

    src/modules/queue-browser/service-events.ts:70: content = '[SDT Map Data - Not Supported Yet]';
    src/modules/queue-browser/ui-details.ts:34: ui.triggerDownload(filename, msg.content);
    src/modules/queue-browser/ui-table.ts:245: zip.file(filename, msg.bytes ?? msg.content);
    src/modules/queue-browser/ui-events.ts:23: const content = state.selectedMessage.content;

extractPayload returns { content: '[SDT Map Data - Not Supported Yet]', binary: false } with no bytes for MAP, STREAM and unknown SDT containers. Because binary is false and bytes is undefined, the details pane enables Copy Content, downloadMessageContent saves the placeholder through triggerDownload, the bulk ZIP stores msg.bytes ?? msg.content, and Download Full puts it in the payload field. The body filter also matches the placeholder text. The user gets a file named like a message payload that holds a sentence, with no marking.

Why it matters: A MAP or STREAM message exported for analysis silently yields a placeholder file; the user may believe the export succeeded.

Change: Mark these messages (for example placeholder: true or binary: true semantics) so Copy Content is disabled, Download Content and the ZIP skip or label them, and the body filter does not match the placeholder; or export a JSON rendering of the map/stream.

#### CR-0146 [minor] [new] Refresh VPNs (or Enter in the VPN box) while a VPN fetch is in flight starts a second unguarded stream that appends into the same list, giving duplicate VPNs and letting a superseded fetch write the cache

Location: src/modules/queue-discovery/module.ts:76-99, src/modules/queue-discovery/module.ts:213-228, src/modules/queue-discovery/module.ts:253-253
Confidence: verified
Evidence:

    src/modules/queue-discovery/module.ts:88:             for await (const page of service.fetchVpns()) {
    src/modules/queue-discovery/module.ts:90:                     currentVpnList = [...currentVpnList, ...page.data].sort();
    src/modules/queue-discovery/module.ts:98:             vpnCache = [...currentVpnList];
    src/modules/queue-discovery/module.ts:217:             vpnCache = null;
    src/modules/queue-discovery/module.ts:221:             currentVpnList = [];
    src/modules/queue-discovery/module.ts:227:             fetchVpns();
    src/modules/queue-discovery/module.ts:253:         vpnInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); btnRefreshVpns.click(); } });

fetchQueues has a generation counter (fetchQueuesGen) but fetchVpns has none. Step 1: the first fetchVpns() loop is awaiting its page. Step 2: the admin clicks Refresh VPNs, or presses Enter in the VPN input (line 253 forwards Enter to the Refresh button), which resets currentVpnList = [] and calls fetchVpns() again. Step 3: both loops are alive and both do currentVpnList = [...currentVpnList, ...page.data] on the one shared variable, so when the old answer lands the list holds its VPNs and when the new answer lands it holds them twice. Step 4: each loop ends with vpnCache = [...currentVpnList], so the cache keeps the duplicates until the next Refresh. The same hole exists across a SEMP disconnect and reconnect to another broker: the old generator (bound to the old SEMP context) keeps yielding pages that merge into the new broker's list. No test covers it (grep of tests/modules/queue-discovery finds no duplicate or double-refresh case).

Why it matters: The dropdown shows repeated VPN names and the cache keeps them for the session, and after a reconnect it can offer VPNs of the previous broker.

Change: Give fetchVpns a generation counter like fetchQueuesGen: capture `const myGen = ++fetchVpnsGen` at the start, bump it in the Refresh handler and in the SEMP-disconnect branch, and return without touching currentVpnList, the UI or vpnCache when `myGen !== fetchVpnsGen` (after each page and after the loop). Add a test that clicks Refresh twice before the first page resolves.

#### CR-0147 [minor] [new] Run now reloads the status and overwrites the schedule form, discarding the admin's unsaved edits

Location: src/modules/backup/module.ts:423-431, src/modules/backup/module.ts:149-161
Confidence: verified
Evidence:

    src/modules/backup/module.ts:430:             await load(); // the last run, failed or not, and the files
    src/modules/backup/module.ts:156:                 els.kind.value = s.kind;
    src/modules/backup/module.ts:160:                 els.minute.value = String(s.minute);
    src/modules/backup/module.ts:161:                 els.keep.value = String(s.keep);

renderStatus both describes the status and writes the saved schedule into the form fields (kind, weekday, day, time, minute, keep). runNow calls load() to refresh the last-run line and file list, so an admin who has changed the schedule form (say daily to weekly) and presses Back up now sees the form snap back to the saved values, with no message. The same happens on the Reload button. Only the passphrase fields survive.

Why it matters: Pressing an unrelated button silently discards typed changes.

Change: Split renderStatus: keep the form fill for the initial load, Reload and after a save, and have runNow refresh only the status line, last run and file list (for example renderStatus(st, { fillForm: false })).

#### CR-0148 [minor] [new] The fake gateway lets the code that confirmed two-factor enrolment sign in again, and its test pins the opposite of the real gateway

Location: src/mock-broker/gateway/index.ts:305, go-web-proxy/pages.go:871-872, tests/mock-broker/gateway/two-factor.test.ts:280-286, go-web-proxy/pages_test.go:1178
Confidence: verified
Evidence:

    src/mock-broker/gateway/index.ts:305:         lastStep.delete(t.user);   // a new secret starts its own history (forget in totp.go)
    go-web-proxy/pages.go:871: 	p.totp.forget(user)
    go-web-proxy/pages.go:872: 	p.totp.check(user, at.secret, code, p.sessions.now())
    tests/mock-broker/gateway/two-factor.test.ts:280:     it('does not bring the code that confirmed it back as a sign-in replay: the new secret starts its own history', () => {
    go-web-proxy/pages_test.go:1178: 	// The code that confirmed cannot also sign in; the next one can.

1. Real gateway, submitConfirm: after the secret is stored it calls totp.forget(user) and then totp.check(user, at.secret, code, now), which records the confirming code's step. A sign-in with the same code in the same step window is refused ('The code is not correct.'); pages_test.go:1178 asserts exactly that. 2. Fake gateway, confirmTwoFactor: it only does lastStep.delete(t.user). Nothing records the step of the code that confirmed. 3. So in the demo a user who enrols, signs out and signs in again with the code still showing in Demo controls > Authenticator is let in; the real gateway refuses until the next 30 s step. 4. tests/mock-broker/gateway/two-factor.test.ts:280 asserts that this sign-in succeeds, so the divergence is pinned as intended and no contract case covers it.

Why it matters: A UI test or a demo walkthrough of enrol -> sign out -> sign in with the same code passes against the fake and fails against the real gateway; the test title documents the wrong rule.

Change: In confirmTwoFactor keep the step acceptedStep returns for t.secret and, after lastStep.delete(t.user), set lastStep(t.user) to it (forget, then record, as pages.go does). Flip the test at two-factor.test.ts:280 to expect a refusal ('The code is not correct.') and a sign-in with the next step's code to succeed. Add a contract case so both sides run it.

#### CR-0149 [minor] [new] The demo broker's topic publish stores the same message object in every matching queue, so the first queue's messages carry another queue's id

Location: src/mock-broker/broker/store.ts:196-201, src/mock-broker/sdk/browser.ts:101-104, tests/mock-broker/broker/store.test.ts:67-76
Confidence: verified
Evidence:

    src/mock-broker/broker/store.ts:196:     for (const q of targets) {
    src/mock-broker/broker/store.ts:198:         // Re-stamp identity: the broker owns spool ids, not the publisher.
    src/mock-broker/broker/store.ts:199:         const stored = msg;
    src/mock-broker/broker/store.ts:200:         stored.setGuaranteedMessageId(String(id));
    src/mock-broker/broker/store.ts:201:         q.messages.push({ id, msg: stored, sizeBytes: payloadByteLength(stored._fields) + 120 });

1. publish() fans a topic out to every queue whose subscription matches (publishTargets). The demo's Direct broker has two such queues for orders/new/> (default/test-queue-1 and vpn-prod/Q/ORDER/NEW, fixtures.ts:103,111). 2. For each target the loop sets stored = msg (no copy) and calls setGuaranteedMessageId(String(id)). Both queues therefore hold the same object, whose guaranteed id is the last id assigned; the first queue's SpooledMessage.id differs from its message's getGuaranteedMessageId(). 3. Browsing the first queue and deleting that message calls removeMessageFromQueue, which reads the id off the message and calls removeMessage(vpn, queue, id); no entry with that id exists in that queue, so it returns false and nothing is removed (the void method says nothing). 4. store.test.ts only publishes to a topic reaching one queue (toBe(1)), so the fan-out to two or more is not exercised.

Why it matters: Copying or forwarding to a topic that two demo queues subscribe to leaves messages that show the wrong id and cannot be deleted from the first queue, a failure the real broker would not show.

Suggested patch (not applied):

```diff
--- a/src/mock-broker/broker/store.ts
+++ b/src/mock-broker/broker/store.ts
@@ -196,5 +196,5 @@
     for (const q of targets) {
         const id = nextId++;
         // Re-stamp identity: the broker owns spool ids, not the publisher.
-        const stored = msg;
+        const stored = createMessage(msg._fields);
         stored.setGuaranteedMessageId(String(id));
```

#### CR-0150 [minor] [new] A sign-in code typed with the space authenticator apps display is treated as a recovery code, refused, and counted as a failed sign-in

Location: go-web-proxy/pages.go:548-554, go-web-proxy/totp.go:115-125, go-web-proxy/pages/login.html:76
Confidence: verified
Evidence:

    go-web-proxy/pages.go:549: 	if totpShaped(code) {
    go-web-proxy/pages.go:552: 	valid, left, err = p.store.useRecoveryCode(ctx, user, hashRecoveryCode(code))
    go-web-proxy/pages.go:614: 	user, code := at.user, r.PostFormValue("code")
    go-web-proxy/totp.go:116: 	if len(s) != totpDigits {
    go-web-proxy/pages/login.html:76:     <input id="code" name="code" autocomplete="one-time-code" required autofocus maxlength="32">

The code step reads the field as typed (pages.go:614) and spendCode sends anything that is not exactly six digits to the recovery-code path (pages.go:549-552; totpShaped, totp.go:115-125). Most authenticator apps show a code as '123 456'. Typed that way it is seven characters, so it is hashed as a recovery code, matches nothing, and submitCode counts a failed sign-in (pages.go:656). The field allows it: maxlength is 32 and there is no pattern (login.html:76), unlike the enrolment form, which has pattern [0-9]{6} (login.html:107). Five such entries start the account's back-off. Recovery codes are normalised for spaces and hyphens (normaliseRecoveryCode, totp.go:269-271); six-digit codes are not.

Why it matters: A user with a correct code is told it is wrong and moves toward a lockout. Each such attempt also takes the store writer for a recovery-code lookup.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/pages.go
+++ b/go-web-proxy/pages.go
@@ -548,4 +548,6 @@
 func (p *authPages) spendCode(ctx context.Context, user, secret, code string) (valid, byRecovery bool, left int, err error) {
-	if totpShaped(code) {
-		return p.totp.check(user, secret, code, p.sessions.now()), false, 0, nil
+	// Authenticator apps show a code as "123 456": typed with its space it is
+	// still a code, not a recovery code.
+	if digits := strings.ReplaceAll(code, " ", ""); totpShaped(digits) {
+		return p.totp.check(user, secret, digits, p.sessions.now()), false, 0, nil
 	}
```

#### CR-0152 [nit] [new] The browser's RBAC glob matcher uses a regex '.*', which does not match line terminators, so it decides differently from the Go matcher for values containing a newline.

Location: src/core/rbac.ts:47-53, src/core/utils.ts:45-54, go-web-proxy/rbac.go:10-36
Confidence: verified
Evidence:

    src/core/rbac.ts:51:    const body = pattern.split('*').map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    src/core/rbac.ts:52:    return new RegExp(`^${body}$`).test(value);

rbac.ts says its algorithm is mirrored exactly by go-web-proxy/rbac.go. The Go matcher uses strings.HasPrefix, Index and HasSuffix, so '*' matches any run of bytes, newlines included. The TS matcher joins the segments with '.*' and builds the RegExp without the 's' flag, so '.' does not match \n, \r, or . Take the row queues:'*' and a queue named 'a\nb'. Go matchGlob('*', 'a\nb') is true. TS matchGlob('*', 'a\nb') is false, so the row grants nothing to that queue in the browser. The same holds for any pattern with a '*' that has to span a line terminator. The shared contract vectors say they hold the two in lockstep, but they evidently have no such value.

Why it matters: The two implementations disagree on a class of inputs, and the brief treats any disagreement as a correctness finding. The TS side fails closed (a queue is hidden), so the damage is a hidden queue and not a bypass. The UI filter and the gateway relay can disagree about entitlement.

Suggested patch (not applied):

```diff
--- a/src/core/rbac.ts
+++ b/src/core/rbac.ts
@@ -48,8 +48,9 @@
     // Split on '*', escape each literal segment, rejoin with '.*'. Splitting
     // first means '*' is never escaped; empty edge segments yield leading/
     // trailing '.*' naturally.
-    const body = pattern.split('*').map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
-    return new RegExp(`^${body}$`).test(value);
+    // The 's' flag lets '.' span line terminators, as the Go matcher does.
+    const body = pattern.split('*').map(seg => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
+    return new RegExp(`^${body}$`, 's').test(value);
 }
```

#### CR-0153 [nit] [new] Typed passwords and the loaded backup file stay in the hidden admin forms after Cancel, sign-out or an import that signs the caller out, until the next form opens

Location: src/modules/user-management/module.ts:442-442, src/modules/user-management/module.ts:137-142, src/modules/connection-management/module.ts:273-273, src/modules/backup/module.ts:347-351, src/modules/backup/module.ts:256-256
Confidence: verified
Evidence:

    src/modules/user-management/module.ts:364:             els.password.value = '';
    src/modules/user-management/module.ts:442:         els.btnCancel.addEventListener('click', () => showView('list'));
    src/modules/connection-management/module.ts:273:         els.btnCancel.addEventListener('click', () => showView('list'));
    src/modules/backup/module.ts:347:             if (res.data.signedOut) {
    src/modules/backup/module.ts:349:                 eventBus.emit('rbac:sign-out-requested');

saveForm in user-management clears the typed password after a successful save (comment: 'Don't leave the typed password in the hidden form'), so the project treats this as a concern. The other exits do not: Cancel only hides the form, showGate (a 401 or sign-out mid-edit) only hides the views, and connection-management never clears its SEMP or VPN password inputs on save or cancel. In backup, an import that signs the caller out returns before importPass.value and `source` (the whole backup file text, from pickFile) are cleared. doLogout does not reload the page (loadSelf only navigates inside the app), so these values stay in the DOM and closure until the next form opens, possibly under another admin on a shared tab. Second check: The facts hold: Cancel (user-management:442, connection-management:273) only calls showView('list'), showGate only hides the views, and the backup signedOut early return (347-350) skips the importPass/source clear at 355-356. connection-management never clears sempPass after a save. doLogout (admin-login:93-101) does not reload the page. But the 'until the next form opens' wording overreaches: openCreate/openEdit in user-management (294, 310) and connection-management (168, 188) reset the password fields, and vpnList.clear() resets the VPN rows. So the values survive only in a hidden form until the next open, and the data is the admin's own, in a same-origin page with no cross-origin exposure. Hygiene gap, not a defect that bites.

Why it matters: Broker passwords, user passwords and backup passphrases are kept in the page longer than needed.

Change: Clear the password inputs (and VPN row passwords) in Cancel and in showGate, clear importPass and `source` before the signedOut early return, and clear the connection form's password inputs after a successful save.

#### CR-0154 [nit] [new] A fake gateway restart or backup import does not reset the in-memory sign-in lockout and code-replay state the real gateway resets

Location: src/mock-broker/gateway/index.ts:155-167, src/mock-broker/gateway/backup.ts:612-613, go-web-proxy/managed_routing.go:99-100, go-web-proxy/backup_api.go:500-503
Confidence: verified
Evidence:

    src/mock-broker/gateway/index.ts:156:         sessions.dropAll();
    src/mock-broker/gateway/index.ts:157:         tickets.clear();
    src/mock-broker/gateway/index.ts:161:         settings.applyRestart();
    src/mock-broker/gateway/backup.ts:613:             store.replaceUsers(users);
    go-web-proxy/managed_routing.go:100: 	th := newThrottle(lv.loginLimits, now, logger.With("component", "throttle"))
    go-web-proxy/backup_api.go:502: 		h.totp.forget(name) // an imported secret is not compared with the old one's steps

1. The real gateway restarts by starting the program again (restart.go); managed_routing.go builds a new throttle and sessions table, and the totp guard is created with the handler, so a restart clears every lockout and every replay record. 2. The fake restart() drops sessions, tickets and sockets and applies settings, but leaves `throttle` and `lastStep` alone (both are also written into the reload snapshot). A user locked out before Restart gateway is still locked out after it; a code accepted before it is still a replay. 3. The real import calls h.totp.forget(name) for each user whose sessions end; the fake importFile calls sessions.dropUser only, so an imported secret is compared with the old secret's last step.

Why it matters: Tests of the lockout and replay paths around a restart or an import see state the real gateway has already discarded.

Change: In createGateway's restart() call throttle.clear() and lastStep.clear(). Expose a forget(user) on the gateway (or pass lastStep into createBackups) and call it for each name in `drop` in importFile. Add one test for each.

#### CR-0155 [nit] [new] The fake gateway checks login.twoFactor after every other settings rule, the real gateway checks it first

Location: src/mock-broker/gateway/settings.ts:265-294, go-web-proxy/settings.go:228-232
Confidence: verified
Evidence:

    src/mock-broker/gateway/settings.ts:267:     const level = parseLogLevel(f.logLevel);
    src/mock-broker/gateway/settings.ts:289:     if (!isTwoFactorMode(l.twoFactor)) {
    go-web-proxy/settings.go:230: 	if _, err := checkTwoFactor(body.Login.TwoFactor); err != nil {
    go-web-proxy/settings.go:231: 		return config{}, invalidRefusal("login.twoFactor", err.Error())

1. checkSettings in Go validates login.twoFactor before toConfig runs any other check. 2. normalize() in the fake runs logLevel, access lists, session, login limits, modules, audit.onFailure and only then login.twoFactor. 3. A save with a bad login.twoFactor and any other invalid value is refused 422 on field 'login.twoFactor' by the gateway and on 'settings' (or another message) by the fake. The contract case only sets one invalid value at a time, so nothing fails.

Why it matters: The settings page marks the select named in `field`; with two mistakes the demo marks a different control than the real gateway.

Change: Move the isTwoFactorMode check to the top of normalize() and add a contract case with two invalid values.

### resilience

#### CR-0003 [minor] [open] dirProblem cannot tell that /backup is not a mount, so the Backup & Restore page reports healthy while scheduled backups land in the container layer

Location: go-web-proxy/backup.go:876-893, go-web-proxy/backup_api.go:91-103, docs/provisioned-mode.md:103
Confidence: verified
Evidence:

    go-web-proxy/backup.go:877: 	info, err := os.Stat(b.dir)
    go-web-proxy/backup.go:883: 	case !info.IsDir():
    go-web-proxy/backup.go:886: 	f, err := os.CreateTemp(b.dir, ".probe-*")
    go-web-proxy/backup.go:891: 	_ = os.Remove(f.Name())
    go-web-proxy/backup.go:892: 	return ""
    go-web-proxy/backup_api.go:91: 	out := backupStatusJSON{DirProblem: b.dirProblem(), Files: []backupFileInfo{}}

1. The image bakes /backup owned by 65532 (docker/Dockerfile:107-110, 179), so the directory exists in the container layer even when the operator mounted nothing. 2. dirProblem only runs Stat, an IsDir test and a CreateTemp probe; all three succeed on that layer directory, so it returns "". 3. backupStatus (backup_api.go:91) puts that "" in DirProblem and lists files, so the page shows a healthy state; run() and writeNew then write every scheduled backup into the layer. 4. Recreating the container (an upgrade, compose down/up) deletes them. 5. The docker run path has no --read-only, so the compose file's EROFS protection does not apply. 6. docs/provisioned-mode.md:103 now says exactly this ('the Backup & Restore page still looks healthy'), so it is a documented limitation, not an accident, but the page itself still gives no hint. The owner's plan records the page's silence as accepted, and docs/provisioned-mode.md:103 now states the limitation, but the ledger still lists the finding as open. Marking it accepted in docs/review/findings.json stops it being reported again.

Why it matters: An administrator who sets a schedule on a docker run deployment gets a healthy page and 'backup written' log lines, and loses every backup together with the container, the event backups exist for. Documentation lowers it from major to minor.

Change: Make dirProblem report a /backup that is not a mount point (compare the device id of /backup with that of its parent, from a small file with a linux build tag and a no-op fallback for the other GOOS values the dev scripts cross-compile for), and word it as 'is not a mounted directory: backups would be lost when the container is recreated'. Keep the docs sentence only as a pointer to that message.

#### CR-0010 [minor] [open] Key file, backup file and self-signed PEM are still created or renamed without a directory fsync, and the key file is written in place rather than atomically

Location: go-web-proxy/keyfile.go:96-110, go-web-proxy/backup.go:786-792, go-web-proxy/tls.go:154-176, go-web-proxy/tls.go:154-174, go-web-proxy/tls.go:537-547, go-web-proxy/fileutil.go:553-577, go-web-proxy/tls.go:93-125
Confidence: verified
Evidence:

    go-web-proxy/keyfile.go:105: 	if err := errors.Join(werr, f.Sync(), f.Close()); err != nil {
    go-web-proxy/backup.go:789: 	if err := os.Rename(partial, path); err != nil {
    go-web-proxy/tls.go:169: 		err = os.Rename(partial, path)

The journal (fileutil.go syncDir at steps 1,2,5,7) and tls.go atomicWrite now sync the directory, and writePEM now syncs and checks Close, so the store, config and TLS-replace parts are fixed. What remains: createExclusive syncs the file but not its directory; backup.go writeNew renames .partial to the final name and returns success with no syncDir; writePEM renames without syncDir. (1) Power loss after a backup run reports ok: the directory may still show only the complete .partial, which removePartials deletes at the next run, and prune may already have removed older backups. (2) createExclusive writes the key file in place: a crash between create and write leaves an empty or short store.key, and the next start refuses with 'has N characters' without saying the file is safe to delete on a fresh volume. The store key itself is covered in practice because the bootstrap commit syncs the same /data directory. The bootstrap certificate writer also writes the certificate and the key as two separate files (tls.go:131 and tls.go:140), so a crash between them on a fresh volume's first start leaves half a pair; the next start stops with a message that names the fix.

Why it matters: A backup the operator was told succeeded can vanish after a host crash, and a crash during first start can leave a key file that needs hand repair. Both need power or host loss to hit.

Change: Call syncDir(dir) after the rename in backupService.writeNew (backup.go:789) and in writePEM (tls.go:169), and after the create in createExclusive (keyfile.go:105). Optionally make the 'has N characters' key error say that on a volume with no store files the key file can be deleted.

#### CR-0011 [minor] [open] A loaded server certificate is never checked for expiry or near-expiry at start, and the bootstrap pair now lives only 7 days

Location: go-web-proxy/tls.go:51-61, go-web-proxy/tls.go:35
Confidence: verified
Evidence:

    go-web-proxy/tls.go:35: const bootstrapCertValidity = 7 * 24 * time.Hour
    go-web-proxy/tls.go:52: 		cert, err := tls.LoadX509KeyPair(certFile, keyFile)
    go-web-proxy/tls.go:56: 		logger.Info("loaded TLS server certificate", "cert_file", certFile, "key_file", keyFile)
    go-web-proxy/tls.go:61: 		return cert, nil

1. The generation path warns that the pair expires and is never renewed (tls.go:81) and deployment.md:171 documents 7 days, so the first-start half of the old finding is addressed. 2. On every later start both files exist, so tls.go:51-61 loads the pair, logs at Info (below the default Warn level) and checks only browserKeyProblem. Nothing compares cert.Leaf.NotAfter with now. 3. A bootstrap deployment restarted on day 8 (or an operator certificate that ran out) is served expired with no line in the default log. Only the console's `expired` flag shows it, and that needs a browser that will click through. 4. The 7-day life makes this likely: any container restart after the first week hits it.

Why it matters: The operator learns of an expired gateway certificate from browsers, not from the gateway. The warning that exists fires once, at generation, and is gone from the log by the time it matters.

Suggested patch (not applied):

```diff
--- a/go-web-proxy/tls.go
+++ b/go-web-proxy/tls.go
@@ -59,3 +59,6 @@
 			logger.Warn("browsers cannot connect with this TLS server certificate", "cert_file", certFile, "reason", problem)
 		}
+		if time.Until(cert.Leaf.NotAfter) < 30*24*time.Hour {
+			logger.Warn("TLS server certificate is expired or expires within 30 days", "cert_file", certFile, "not_after", cert.Leaf.NotAfter.UTC().Format(time.RFC3339))
+		}
 		return cert, nil
```

#### CR-0157 [minor] [new] A console Restart whose shutdown overruns the deadline exits the gateway instead of starting it again

Location: go-web-proxy/main.go:391-403, go-web-proxy/main.go:585-593
Confidence: verified
Evidence:

    go-web-proxy/main.go:393: 	if err := serveUntilStopped(p, &restart); err != nil || !restart {
    go-web-proxy/main.go:587: 	err = srv.Shutdown(ctx)
    go-web-proxy/main.go:590: 	if err != nil {
    go-web-proxy/main.go:591: 		logger.Error("graceful shutdown failed", "err", err)
    go-web-proxy/main.go:592: 		return err

1. POST /managed/restart sets *restart and falls into srv.Shutdown with the 10 s deadline (main.go:581-587). 2. If a regular connection is still busy at the deadline (a long relayed response, a slow upload), Shutdown returns context.DeadlineExceeded, serveUntilStopped returns that error, and serve returns it at main.go:393 without calling p.restart. 3. main exits 1. restart.go promises that a failed restart exits for the platform's policy, but here the program was never asked to start again. A bare `docker run` with no restart policy, or a plain process, stays down after the admin pressed Restart. The exec would have dropped those connections anyway. (Hijacked SMF sockets are not waited for, which is the accepted CR-0009.)

Why it matters: A restart the admin asked for turns into an outage when any request is slow at that moment, on deployments that rely on the gateway restarting itself.

Change: When *restart is set and Shutdown returned only a deadline error, log it and carry on to p.restart (the exec closes what is left); keep returning the error for signals and for every other Shutdown failure. Test it by holding a request open past a short process.shutdown with restart requested.

#### CR-0158 [minor] [new] Open SMF sockets per user are capped only by an open rate (20 a minute) and nothing bounds how many stay open

Location: go-web-proxy/sockets.go:23, go-web-proxy/smf.go:82-103, go-web-proxy/dial.go:18
Confidence: verified
Evidence:

    go-web-proxy/dial.go:18: 	connectsPerWindow = 20          // dials plus SMF upgrades per user
    go-web-proxy/sockets.go:23: 	open map[uint64]openSocket
    go-web-proxy/smf.go:84: 	remove := g.sockets.add(openSocket{session: as.id, user: as.user, broker: p.broker, vpn: p.vpn, cancel: cancel})

1. smfGate.ServeHTTP admits a socket after the entitlement check and the shared rateWindow (smf.go:92-103). The window counts opens, not sockets alive. 2. Each open socket holds two goroutines, two file descriptors and a registry entry, and has no idle or absolute timer (sockets.go header: the gateway sets no timer; the session's limits do not apply). 3. A signed-in, entitled user (or a script with a stolen session) can keep 20 new sockets a minute open indefinitely: 1200 an hour per user, with no per-user or global ceiling, until the process hits its descriptor limit and every other accept fails. The SEMP relay does bound concurrency (relayMaxInFlight, relay.go:33); the socket path has no equivalent.

Why it matters: One low-privilege account can exhaust the gateway's descriptors and goroutines for everyone. It needs a valid session, so the bar is low but real in a shared deployment.

Change: Add a per-user (and a total) cap on open sockets to socketRegistry.add, refuse with 429 rate_limited once reached, and log it. Test by opening cap+1 sockets for one user and closing one.

#### CR-0159 [minor] [new] http.Server has no read deadline, so a client that sends headers and then dribbles a request body holds its goroutine indefinitely

Location: go-web-proxy/main.go:538-550, go-web-proxy/pages.go:129, go-web-proxy/relay.go:116
Confidence: verified
Evidence:

    go-web-proxy/main.go:540: 		ReadHeaderTimeout: 10 * time.Second,
    go-web-proxy/main.go:541: 		IdleTimeout:       120 * time.Second,
    go-web-proxy/relay.go:116: 			body, err = io.ReadAll(http.MaxBytesReader(w, r.Body, relayMaxBody))

1. The server sets ReadHeaderTimeout and IdleTimeout only; no ReadTimeout, and no SetReadDeadline anywhere in the Go sources (grep). 2. The unauthenticated sign-in POST (pages.go:129) and the authenticated JSON and relay bodies read through MaxBytesReader, which caps size but not time. 3. A client that opens a connection, sends valid headers and then one byte every few seconds keeps the handler blocked for as long as it likes. The cost per connection is small and ReadTimeout cannot be set globally because the Direct relay streams bodies, so the fix is per handler.

Why it matters: Unbounded slow-body connections wear down descriptors and goroutines, most easily on the sign-in endpoint that needs no session.

Change: In the sign-in page handlers and decodeJSONLimit, call http.NewResponseController(w).SetReadDeadline(now+30s) before reading the body (the SEMP v1 body in relay.go too). Leave the Direct relay and SMF alone.

#### CR-0161 [minor] [new] A write that times out after 30 s is reported as "The gateway could not be reached" although it may have been committed

Location: src/core/services/managed-api.ts:81-88, src/core/services/managed-api.ts:123-123, src/core/timing.ts:57-63
Confidence: verified
Evidence:

    src/core/services/managed-api.ts:84:         ans = await raceDeadline(exchange(method, path, body));
    src/core/services/managed-api.ts:85:     } catch (e) {
    src/core/services/managed-api.ts:86:         log.warn(`${method} ${path} got no answer from the gateway (network error or ${REQUEST_TIMEOUT_MS / 1000} s timeout):`, e);
    src/core/services/managed-api.ts:87:         return { ok: false, status: 0, code: 'network' };

managedRequest races every call, reads and writes alike, against a 30 s deadline; raceDeadline leaves the request running in the browser (timing.ts says so). A PUT/DELETE/POST (save user, save settings, import, replace certificate) that waits on the single writer or a slow key derivation past 30 s is turned into code 'network', whose text is 'The gateway could not be reached.' The gateway may well finish the commit afterwards. The form keeps the old rev, so the admin's natural retry of a create answers 'exists' (user and connection modules) or an update answers 'stale', with no hint that the first attempt may have applied. An import is the worst case: it can replace users and connections.

Why it matters: For a mutating call the outcome is unknown, but the admin is told nothing happened.

Change: Give timeouts their own code (for example 'timeout') with a message that says the gateway did not answer in time and, for writes, that the change may have been applied and the page should be reloaded; or have mutating callers reload after a timeout.

#### CR-0162 [minor] [new] The subscription explorer renders every matching row at once with no cap, so a broad filter on a large broker builds one huge innerHTML

Location: src/modules/queue-subscription-explorer/ui.ts:24-40, src/modules/queue-subscription-explorer/module.ts:112-119
Confidence: verified
Evidence:

    src/modules/queue-subscription-explorer/ui.ts:24: export function renderRows(tbody: HTMLElement, rows: SubscriptionRow[], emptyHtml: string): void {
    src/modules/queue-subscription-explorer/ui.ts:32:     const html = rows.map(r =>
    src/modules/queue-subscription-explorer/ui.ts:39:     tbody.innerHTML = html;

module.ts rerender() shows nothing until a filter is typed (the 'type to start searching' state), which shows the authors worried about dumping thousands of rows, but any one-character filter (or `*`) matches most rows and renderRows then builds all of them into one string and one innerHTML assignment. allRows also keeps every row of every page in memory. There is no limit, 'showing first N' line or virtual list. With tens of thousands of subscriptions each keystroke re-render (debounced) freezes the tab.

Why it matters: On a large broker the page can freeze on a broad filter, and the admin cannot tell why.

Change: Render at most a fixed number of rows (for example 500) and add a line under the table or in the counter saying 'Showing the first 500 of N; narrow the filter', keeping the counts over the full match set.

#### CR-0163 [nit] [new] deadlineSignal uses AbortSignal.any with no documented browser floor or fallback

Location: src/core/timing.ts:44-48, src/core/services/queue-source.ts:92-96, src/core/kernel.ts:397
Confidence: verified
Evidence:

    src/core/timing.ts:47:    return caller ? AbortSignal.any([caller, timeout]) : timeout;
    src/core/kernel.ts:397:            signal: deadlineSignal(options.signal),

deadlineSignal joins the caller's signal with the timeout through AbortSignal.any. withSignal in queue-source.ts puts the picker's signal on every discovery request, and queue-copy's verify passes its cancel signal. On an engine without AbortSignal.any (Safari before 17.4, Firefox before 124, Chrome before 116), the call throws TypeError before fetch. Discovery catches it and yields a page error whose text is the TypeError message, so the picker's VPN and queue lists never load. vite.config.ts sets target 'esnext' and no document names a minimum browser, so nothing shows that the floor was chosen. Second check: timing.ts:46-47 does call AbortSignal.any when a caller signal is given, with no fallback; no browser floor found in docs (grep for support/browser versions finds nothing relevant). So the code claim holds. But the affected engines (Chrome <116, Safari <17.4, Firefox <124) are 2023-24 vintage, only caller-signal requests are affected, and the finding itself is a documentation-gap-or-defect depending on unstated policy. Unsettled: the project's supported browsers.

Why it matters: Any request made with a cancel signal would fail on an older but still common browser, with an unhelpful message, and only in the pickers and verify.

Change: Either state the minimum browser versions in the user guide and refuse to start below them, or fall back in deadlineSignal: when AbortSignal.any is not a function, build an AbortController that aborts on the caller's signal and on a setTimeout, and clear the timer on completion.

#### CR-0164 [nit] [new] The browser message cap counts messages, not bytes, and each text message is stored with its decoded text and a byte copy

Location: src/modules/queue-browser/payload.ts:46-56, src/modules/queue-browser/state.js:116
Confidence: verified
Evidence:

    src/modules/queue-browser/payload.ts:55: return { content: text, bytes, binary: false };
    src/modules/queue-browser/state.js:116: if (store.length >= state.maxMessagesPerQueue) {

For a valid-UTF-8 attachment the stored message holds _originalMsg (the SDK's buffer), content (the decoded string) and bytes (a Uint8Array built from the Latin-1 string), and each of up to 3 bound queues keeps up to maxMessagesPerQueue of them. The window is bounded by count only (default 100); a queue of multi-megabyte messages with a raised cap grows the heap by roughly three times the payload size per message. Second check: The mechanism is real. payload.ts:55 returns content, bytes and binary together, and _originalMsg is also stored, so a text message is held several times. The cap is a count (state.js:116). But docs/user-guide.md:117 already says 'A higher cap keeps more history at the cost of browser memory', and the cap is limited to 1 to 10 000 and defaults to 100. The multiplier is not documented, and the 'three times' figure and the memory exhaustion claim are unmeasured. The SDK buffer and the bytes may share storage, and the guide already warns about memory. So the impact is overstated and only a minor documentation gap remains.

Why it matters: A large-payload queue can exhaust browser memory without any warning.

Change: Document the multiplier next to the cap, or bound the stored bytes (drop bytes for text that re-encodes identically, and decode lazily when a message is selected).

#### CR-0165 [nit] [new] A SIGTERM or SIGHUP skips the e2e harness's teardown and leaves the stack and scripts/logs/e2e secret files behind, against the documented 'always'

Location: scripts/e2e.mjs:2120-2121, docs/testing.md:411, scripts/dev.sh:296-307
Confidence: verified
Evidence:

    scripts/e2e.mjs:2120:         process.on('SIGINT', () => { say('interrupted; tearing the stack down'); teardown(); process.exit(130); });
    scripts/e2e.mjs:2134:             compose(['logs', '--no-color', '--tail', '60', 'gateway']);
    scripts/e2e.mjs:2140:         teardown();
    scripts/e2e.mjs:2149: process.exit(await main());
    scripts/e2e.mjs:879:             // the timeout as an unhandled rejection that kills the run.
    scripts/e2e.mjs:2099:     fs.rmSync(WORK, { recursive: true, force: true });
    scripts/dev.sh:305:   run e2e docker compose -f "$E2E_COMPOSE" down -v --remove-orphans || true

1. The only handler is SIGINT (line 2120); there is no SIGTERM, SIGHUP, uncaughtException or unhandledRejection handler (grep finds none), and it is installed only after collectDetails and the CA read. 2. The harness's own comments (879, 1674) state that an unhandled rejection 'kills the run'. 3. The code after the try/catch (2131-2141) is not itself guarded: compose() throws when spawnSync reports r.error (334), so a failing 'logs' call at 2134/2137 rejects main(), and top-level await at 2149 ends the process with a stack trace before teardown() and before the summary line. 4. dev.sh and dev.ps1 run only 'docker compose down -v' afterwards (and only if the shell survives; dev.sh has no trap). Nothing deletes scripts/logs/e2e, which holds tls.key, admin-password, the copied-out store.key (at-rest-store.key), users.yaml/connections.yaml copies and the audit log. 5. docs/testing.md line 411 says the run 'always ends with docker compose down -v and deletes that directory'. Second check: Only a SIGINT handler exists (grep finds no SIGTERM, SIGHUP, uncaughtException or unhandledRejection handler) and it is installed after collectDetails and the CA read. So a SIGTERM during the run skips teardown() and leaves scripts/logs/e2e behind, and docs/testing.md says the run 'always ends with docker compose down -v and deletes that directory'. That part holds, and the dev task's down -v backstop removes the containers but not the directory. The 'thrown error after the try' and 'unhandled rejection' routes are weak. runChecks and setup sit inside the try/catch, and check() catches every check failure. compose() throws only when spawnSync reports r.error, meaning the docker binary cannot run, which is rare and would already have failed earlier. The stranded files are throwaway keys on a local dev machine and the next run clears them (writeMaterial does rmSync(WORK)). The doc wording is slightly absolute, but the impact is small.

Why it matters: After a killed or crashed run, the throwaway gateway private key, bootstrap password file and a copy of the gateway's store key plus sealed stores stay on disk under scripts/logs/e2e (most files mode 0644, directories 0777) until the next run clears them. The documented guarantee does not hold, and the exit code on SIGTERM is the signal's, with no 'e2e:' summary.

Change: Install the signal handlers at the top of main (SIGINT, SIGTERM, SIGHUP) and add process.on('uncaughtException'/'unhandledRejection') that print the masked error, run teardown() and exit 1. Wrap the post-run log dump in try/catch so teardown() and the summary always run. Have the dev.sh and dev.ps1 e2e task also remove scripts/logs/e2e after its down -v, and reword the doc to say what the backstop covers.

#### CR-0166 [nit] [new] compose() uses spawnSync with no timeout, so a wedged docker command is outside waitFor's time bound

Location: scripts/e2e.mjs:333, scripts/e2e.mjs:556-559, scripts/e2e.mjs:718-726
Confidence: verified
Evidence:

    scripts/e2e.mjs:333:     const r = spawnSync('docker', ['compose', ...files, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env });
    scripts/e2e.mjs:557:     const r = compose(['ps', '--status', 'running', '--quiet', service], { quiet: true });
    scripts/e2e.mjs:562: async function waitFor(what, seconds, ready, service) {

1. Every HTTP, SDK and browser wait has a timeout, but compose() calls spawnSync with no `timeout` option. 2. waitFor() promises a bound of `seconds`, yet calls running() (spawnSync) on every iteration, so a stuck `docker compose ps` is outside that bound. 3. spawnSync blocks Node's event loop, so no JS timer (withTimeout, request timeouts) can fire while it hangs. 4. The same call runs compose cp, logs, restart, stop, run and the final down -v. A first-run `compose up` that pulls the Playwright image is also unbounded. Second check: compose() at line 333 calls spawnSync with no timeout, and running() inside waitFor() at 557 is therefore outside waitFor's seconds bound. That holds, and so does the point that spawnSync blocks the JS event loop. The impact is overstated. A hung docker daemon on a local dev task is hypothetical, and a user's Ctrl-C reaches the docker child through the terminal, so spawnSync returns even though the JS SIGINT handler cannot run in the meantime. A first-run image pull is slow rather than hung. The finding rests on a speculative failure, so it is at most a nit.

Why it matters: A wedged Docker daemon or a stalled image pull hangs the e2e task forever instead of failing with a message; the harness cannot be interrupted cleanly because its SIGINT handler is a JS callback that waits for the blocked loop.

Change: Pass a timeout to spawnSync per call (for example 120000, 600000 for `up`) and treat r.signal/ETIMEDOUT as an error naming the command.

#### CR-0167 [nit] [new] The fixed compose project name and host ports mean the harness's opening `down -v` destroys any other smu-e2e stack on the machine, and a second concurrent run shares the work directory

Location: scripts/e2e.mjs:718-721, scripts/e2e.mjs:347-349, docker/docker-compose.e2e.yaml:26
Confidence: verified
Evidence:

    scripts/e2e.mjs:719:     compose(['down', '-v', '--remove-orphans'], { quiet: true });
    scripts/e2e.mjs:348:     fs.rmSync(WORK, { recursive: true, force: true });
    docker/docker-compose.e2e.yaml:26: name: smu-e2e

1. The project is always `smu-e2e` and the ports are 39443-39445 on loopback. 2. A second run (another checkout, or two shells) first removes WORK and runs `down -v` on the same project name, tearing down the first run's containers and volumes under it; its checks then fail with confusing connection errors. 3. A port held by an unrelated process makes `up` fail with docker's message, which is reported, so that case is acceptable.

Why it matters: Parallel or overlapping runs corrupt each other with errors that do not say why.

Change: Take a lock file (for example scripts/logs/e2e.lock with the pid) at the start of main and refuse to run with a clear message when it names a live process.

### quality

#### CR-0060 [minor] [open] The admin session key, applyGate and rbac:changed block is still copy-pasted in five admin modules (setError and the list rows are now shared)

Location: src/modules/user-management/module.ts:170-188, src/modules/connection-management/module.ts:126-144, src/modules/gateway-settings/module.ts:302-320, src/modules/tls-certificates/module.ts:328-346, src/modules/backup/module.ts:436-454
Confidence: verified
Evidence:

    src/modules/user-management/module.ts:170: const sessionKey = (): string | null => {
    src/modules/user-management/module.ts:172:             return m ? JSON.stringify([m.username, m.admin]) : null;
    src/modules/connection-management/module.ts:126:         const sessionKey = (): string | null => {
    src/modules/connection-management/module.ts:128:             return m ? JSON.stringify([m.username, m.admin]) : null;
    src/modules/gateway-settings/module.ts:302:         const sessionKey = (): string | null => {
    src/modules/tls-certificates/module.ts:328:         const sessionKey = (): string | null => {
    src/modules/backup/module.ts:436:         const sessionKey = (): string | null => {

The setError copies and the list rendering named in the old finding are gone: setError lives in src/core/dom.ts (imported by user-management, connection-management, backup, tls-certificates and managed-panel) and the user and connection lists go through renderAdminRows in src/core/components/row-list/index.ts. What remains is the session-tracking block: an identical sessionKey, appliedKey, applyGate (appliedKey = sessionKey(); gate when !admin; else show and load) and `eventBus.on('rbac:changed', () => { if (sessionKey() !== appliedKey) applyGate(); })` in five modules, each with only its show/hide of views differing. gateway-settings keeps a one-argument setError wrapper, and queue-copy/ui.ts keeps setErrorPane.

Why it matters: A change to when an admin module re-gates must be made five times and the copies will drift.

Change: Add a core helper, for example createAdminGate(app, { gate, onAdmin, onNoAdmin }) in src/core/components/module-gate, that owns sessionKey, appliedKey, the rbac:changed subscription and applyGate, and have the five modules pass their view toggles and loader.

#### CR-0061 [nit] [open] queue-copy's destination SolaceConfig still repeats the connect timeout, reconnect wait and message cap as inline literals.

Location: src/modules/queue-copy/module.ts:363-368
Confidence: verified
Evidence:

    src/modules/queue-copy/module.ts:365:                connectTimeout: 3000,
    src/modules/queue-copy/module.ts:367:                reconnectWait: 3000,
    src/modules/queue-copy/module.ts:368:                maxMessagesPerQueue: 100,

The cap, its default and the probe timeout now live in src/core/connections/defaults.ts (MAX_MESSAGES_PER_QUEUE, DEFAULT_MAX_MESSAGES_PER_QUEUE, SEMP_PROBE_TIMEOUT_MS), and the Provisioned dial uses PROVISIONED_SDK_CONNECT. The queue-copy destination form builds its SolaceConfig with 3000, 3000 and 100 written out, so a change to the default cap there is missed.

Why it matters: A small residue of the original repeated-literals finding. Harmless today because the values agree.

Change: Use DEFAULT_MAX_MESSAGES_PER_QUEUE from core/connections/defaults for maxMessagesPerQueue, and add named connect and reconnect defaults beside PROVISIONED_SDK_CONNECT for the other two.

#### CR-0062 [nit] [open] Comments cite source line numbers and places that have moved

Location: tests/core/kernel.test.ts:71, tests/core/kernel.test.ts:1068-1070, tests/modules/connections/module.test.ts:103, tests/modules/connections/module.test.ts:211, tests/modules/queue-browser/module.test.ts:386, tests/modules/queue-browser/service-events.test.ts:486, tests/modules/queue-browser/service-events.test.ts:766-770, tests/core/components/queue-picker/picker.test.ts:686, tests/core/components/queue-picker/picker.test.ts:717, tests/mock-broker/sdk.test.ts:90, tests/modules/queue-discovery/module.test.ts:852, src/modules/queue-discovery/module.ts:5-5, src/modules/queue-discovery/module.ts:259-259, src/modules/queue-subscription-explorer/module.ts:7-8, src/modules/gateway-settings/module.ts:70-71, tests/setup.ts:180-184, src/modules/queue-copy/service-copy.ts:447-449, tests/modules/queue-discovery/module.test.ts:996-1010, tests/modules/queue-discovery/module.test.ts:1068-1069, tests/modules/queue-subscription-explorer/module.test.ts:476-486
Confidence: verified
Evidence:

    tests/core/kernel.test.ts:71: // `if (fromUrl !== null) setLogLevel(fromUrl)` at kernel.ts:69
    tests/core/kernel.test.ts:1068: // installModule bails when moduleContainer is null (kernel.ts:119),
    tests/modules/connections/module.test.ts:103: // applyConfig (module.ts:42, 44, 62) guards each top-level field individually
    tests/modules/queue-browser/module.test.ts:386: // Covers the two arrow wrappers at module.ts:125-126 that bridge
    src/modules/queue-discovery/module.ts:5:  * from the Connections module -- priority is configured in `src/registry.ts`.
    src/modules/queue-subscription-explorer/module.ts:7:  * topic intersection (* and > on either side). Priority is configured in
    src/modules/gateway-settings/module.ts:70: /** Where the gateway's own sign-in page sends an administrator back to this app. */
    src/modules/gateway-settings/module.ts:71: const RESTART_QUESTION = 'Restart the gateway? Everyone is signed out and open broker connections close. It is back in a few seconds.';
    tests/setup.ts:181: // after each MESSAGE event we stop() the browser, process the message
    tests/setup.ts:183: // This bounds memory at one in-flight message rather than letting the
    src/modules/queue-copy/service-copy.ts:447: if (!browserPaused && inFlight >= PUBLISH_CONCURRENCY_HIGH) {
    tests/modules/queue-discovery/module.test.ts:997:             // The race window is narrow: line 153 only fires when the gen bump
    tests/modules/queue-discovery/module.test.ts:1068:             // ASSERTION: line 153 returned for call #1, so its cache write at
    tests/modules/queue-discovery/module.test.ts:1069:             // line 155 was skipped. Re-trigger fetchQueues for vpn-a -- since the
    tests/modules/queue-subscription-explorer/module.test.ts:476:             // Disconnect mid-fetch -- per the fix, this bumps loadGen, resets

27 comment lines under tests/ cite `<file>:<line>` of a source file (a grep for `\.(ts|js):[0-9]+` in test comments). I opened several targets: kernel.ts:69 is a blank line, kernel.ts:119 is a comment about the install loop, kernel.ts:157 is a closing brace, queue-picker/index.ts:297 is a comment in the SEMP-refusal code of another file region, solace-client.ts:185 is unrelated, service-events.ts:154 is a comment, connections/module.ts:71 is `const hosted = isHostedDeployment(appState);`. None points at the code named. The earlier review's version of this problem in src comments is fixed, but it persists in tests. The same kind of stale pointer was reported on 2026-11-10 (CR-0062). The comments named then are fixed; these are others, so the finding stays open.

Why it matters: A reader following the pointer lands on unrelated code; the project already bans cross-references that rot.

Change: Replace each `file:line` with the function or branch name (for example 'the logLevel override in Kernel.start'), keeping the file name only.

#### CR-0064 [nit] [open] Two redundant !important flags remain (tr.selected:hover td, .btn-icon:disabled)

Location: src/modules/queue-browser/styles.css:70-72, src/css/components.css:216-222, src/css/components.css:266-268
Confidence: verified
Evidence:

    src/modules/queue-browser/styles.css:71: background-color: var(--solace-mint) !important;
    src/css/components.css:219: background-color: transparent !important;
    src/css/components.css:266: .data-table tbody tr:hover {
    src/css/components.css:267: background-color: rgba(255, 255, 255, 0.02);

The main part is fixed: .hover-danger and .hover-success moved into src/modules/queue-browser/styles.css:53-63 with no !important, and the .data-table tr.selected td rule has none. What remains: (1) `.data-table tr.selected:hover td` is !important, but the only hover rule in the shared sheet targets the tr (components.css:266), not the td, so nothing competes with it. (2) `.btn-icon:disabled` sets `background-color: transparent !important`, but the same rule sets `pointer-events: none`, so `.btn-icon:hover` (same specificity, earlier in the file) never matches a disabled button. CLAUDE.md anchor 8 says not to use !important to beat specificity.

Why it matters: Needless !important makes later overrides harder and signals a specificity fight that does not exist.

Suggested patch (not applied):

```diff
--- a/src/modules/queue-browser/styles.css
+++ b/src/modules/queue-browser/styles.css
@@ -70,3 +70,3 @@
 .data-table tr.selected:hover td {
-    background-color: var(--solace-mint) !important;
+    background-color: var(--solace-mint);
 }
```

#### CR-0168 [nit] [new] Three byte-identical strict parsers and three mirror functions encode one boolean env rule

Location: go-web-proxy/main.go:224-260, go-web-proxy/configfile.go:287-312, go-web-proxy/configfile.go:245-252
Confidence: verified
Evidence:

    go-web-proxy/main.go:224: func parseHosted(raw string) (bool, error) {
    go-web-proxy/main.go:238: func parseInsecureSkipVerify(raw string) (bool, error) {
    go-web-proxy/main.go:252: func parseShowAudit(raw string) (bool, error) {
    go-web-proxy/configfile.go:289: func insecureEnv(raw string) string {
    go-web-proxy/configfile.go:297: func showAuditEnv(raw string) string {
    go-web-proxy/configfile.go:307: func hostedEnv(raw string) string {

parseInsecureSkipVerify and parseShowAudit have the same body (unset or false is false, true is true, else the same error text); parseHosted differs only in the default. hostedEnv, insecureEnv and showAuditEnv each wrap their parser to format a bool as a string for envOverrides. A fourth boolean seed variable needs a parser, a mirror, a seedVars row and a test, and strictness is the one thing that must stay in step. Other seed variables are lenient (LOG_LEVEL and SMU_CONN_MODES are lower-cased), so the 'strict like parseHosted' comment is true only for the booleans.

Why it matters: Copy-paste invites drift between the strict rules, and each new boolean setting repeats five touch points.

Change: Add one parseStrictBool(raw string, def bool) (bool, error) and one boolEnv helper, express the three parsers as thin calls (keeping their names where tests use them), and let seedVar carry the default so the mirror functions disappear.

#### CR-0169 [nit] [new] The demo SDK keeps every session it ever created in a module-level array that is never pruned

Location: src/mock-broker/sdk/index.ts:16, src/mock-broker/sdk/index.ts:44
Confidence: verified
Evidence:

    src/mock-broker/sdk/index.ts:16: const sessions: MockSession[] = [];
    src/mock-broker/sdk/index.ts:44:                 sessions.push(session);

createSession pushes each new session; nothing removes one when it is disposed, so every reconnect, VPN switch and queue-copy destination connection leaves a session (with its emitter and listener closures) reachable for the life of the page, and dropAllSessions() calls _mockDrop on all of them.

Why it matters: Small, bounded by page lifetime, but the list only needs live sessions.

Change: Remove a session from the array in its dispose() (or hold a Set and delete in end()).

### tests

#### CR-0071 [minor] [open] The shared contract still leaves sign-in, the two-factor pages, 429 and Retry-After, and almost all response headers unpinned

Location: go-web-proxy/contract_test.go:386-403, go-web-proxy/testdata/contract/cases.json, tests/mock-broker/gateway/contract.test.ts:108-140
Confidence: verified
Evidence:

    go-web-proxy/contract_test.go:387:				if k := (contractSession{s.As, s.MustChange}); s.As != "" && cookies[k] == nil {
    go-web-proxy/contract_test.go:388:					cookies[k] = e.cookie(s.As, s.MustChange)
    go-web-proxy/contract_test.go:421:					for k, v := range s.Headers {

Since the last review the contract gained relay 200/500/502 steps with scripted brokers, a headers map, throttle.json vectors, TLS and restart cases. What remains: every case opens its sessions with e.cookie (contract_test.go:388), so no step touches /login, /login/code, /login/two-factor, /login/password or setup; a script over cases.json finds 268 steps, none with a path outside /managed/, and no 429 status (the rate_limited answer and its Retry-After set at managed.go:348 and pages.go:116 are unpinned; the fake sets it at router.ts:118 independently). Only 7 of 268 steps list headers (Content-Type and Cache-Control on /managed/me, and the relay pass-through set), so Cache-Control no-store, X-Content-Type-Options and the page Content-Security-Policy are pinned on at most two routes. The TS side has its own hand-written pages.test.ts, two-factor.test.ts and tickets.test.ts instead of running the Go side's cases.

Why it matters: The demo's sign-in and two-factor behaviour (the part added since the last review) can drift from the real gateway with every suite green; a header dropped from an admin route is caught nowhere.

Change: Add sign-in and two-factor cases to cases.json (form posts with a scripted clock and a seeded authenticator secret; steps would need a 'form' flag and the ticket cookie carried between steps), a 429 case with Retry-After for dial and login, and a Headers pin for Cache-Control on one read and one write route per handler family.

#### CR-0170 [minor] [new] tlsManager's serialised writes have no concurrent-writer test, although the suite runs under -race

Location: go-web-proxy/tls.go:486-498, go-web-proxy/tls_test.go:1159-1207, go-web-proxy/tls_api_test.go:327-353
Confidence: verified
Evidence:

    go-web-proxy/tls.go:486: // lock serialises the writes; the last write wins (no rev). The certificate
    go-web-proxy/tls.go:497: 	mu     sync.Mutex // serialises the writes

tlsManager claims a mutex serialises certificate replacement and trust add/remove, and these writes do not go through the store writer, so writer_test.go's TestWriter_TwoTransactionsNeverOverlap does not cover them. tls_test.go and tls_api_test.go contain no sync usage and no goroutine other than the TLS server at tls_test.go:644; every replace, add and remove test is sequential. Two simultaneous replaceCertificate or addTrust calls (journal in one directory, pool rebuild, holder swap) are never exercised, so a lock removed or narrowed would pass the suite even with -race.

Why it matters: The live TLS swap is a new, security-relevant write path with its own locking and its own journal; the one concurrency property it states is untested.

Change: Add a test that starts N goroutines calling replaceCertificate with distinct pairs and addTrust with distinct names, then asserts the served pair equals exactly one of the pairs written, certFile and keyFile are a matching pair on disk, every trust file is present, and no journal or backup is left.

#### CR-0171 [minor] [new] A rejected fourth queue binding leaves an orphan message store entry, and the cap test neither asserts it nor that a freed slot can be rebound

Location: src/modules/queue-browser/service.ts:57-66, tests/modules/queue-browser/service.test.ts:139-150
Confidence: verified
Evidence:

    src/modules/queue-browser/service.ts:57: // Init Store
    src/modules/queue-browser/service.ts:58: if (!state.messageStore.has(queueName)) {
    src/modules/queue-browser/service.ts:59: state.messageStore.set(queueName, []);
    src/modules/queue-browser/service.ts:63: if (state.browserInstances.size >= MAX_BROWSER_BINDINGS) {
    tests/modules/queue-browser/service.test.ts:147: const result = service.createBrowser('q4');

createBrowser creates messageStore[queueName] before the binding-limit check. At the cap the function returns the error but never deletes the entry, so 'q4' stays in messageStore with no browser. The sibling test 'cleans up on synchronous connect error' asserts messageStore is cleaned, showing the invariant is intended, but 'enforces MAX_BROWSER_BINDINGS limit' only checks result.ok and the error text. It also never asserts session.createQueueBrowser was not called a fourth time, nor that after disconnectBrowser the slot frees and a new bind succeeds.

Why it matters: A leaked store entry per refused bind is a small state leak and the cap's real contract (no browser created, nothing left behind, slot reusable) is untested.

Change: Move the limit check above the store init in createBrowser (or delete the entry on refusal), and extend the cap test to assert messageStore.has('q4') is false, createQueueBrowser called 3 times, and that disconnectBrowser('q1') then createBrowser('q4') succeeds.

#### CR-0172 [minor] [new] A v8 ignore on the post-loop supersession check in queue-subscription-explorer claims the case cannot be reproduced in jsdom, while a sibling module's test reproduces the same window

Location: src/modules/queue-subscription-explorer/module.ts:159-168, tests/modules/queue-discovery/module.test.ts:991-1010
Confidence: verified
Evidence:

    src/modules/queue-subscription-explorer/module.ts:159: /* v8 ignore start -- post-loop supersession check. The
    src/modules/queue-subscription-explorer/module.ts:165:                 * from real SDK callbacks but not robustly reproducible in
    src/modules/queue-subscription-explorer/module.ts:166:                 * jsdom. */
    src/modules/queue-subscription-explorer/module.ts:167:                if (myGen !== loadGen) return;
    src/modules/queue-subscription-explorer/module.ts:168:                /* v8 ignore stop */
    tests/modules/queue-discovery/module.test.ts:1002:            // for-await's `{done: true}` resolves. The trick used here: spy

1. CLAUDE.md allows a v8 ignore only for jsdom environment limits, SDK callbacks the harness cannot fire, and defensive catches around contracts that never throw. 2. The ignore at module.ts:159-168 covers a plain generation check. Its stated reason is that the one-microtask window between the last yield and the generator's done is not reproducible in jsdom. 3. That window is ordinary async-generator timing, not a jsdom gap. tests/modules/queue-discovery/module.test.ts:991-1010 reproduces the same shape for queue-discovery's post-loop check. It bumps the generation from the body of the last iteration, then asserts on the cache. 4. The explorer test (module.test.ts:448-505) only covers the in-loop check at module.ts:145. The post-loop branch has no test. 5. A test that mocks the service with a generator, or emits the disconnect while the generator resumes after its last yield, would cover it.

Why it matters: The ignore sits outside the sanctioned categories and hides a real branch. A regression there would let a superseded load write rows and show a Loaded toast after a disconnect, and no gate would catch it.

Change: Cover the post-loop check with a test in the style of queue-discovery/module.test.ts's 'older fetchQueues skips cache-write...' test, then remove the v8 ignore start/stop pair at module.ts:159 and 168. If it is truly untestable, rewrite the reason to say why. The current reason is inaccurate.

#### CR-0173 [minor] [new] The contract runner silently ignores any field of a case or step that it does not read, though the Go runner rejects unknown fields

Location: tests/mock-broker/gateway/contract.test.ts:27-38, tests/mock-broker/gateway/contract.test.ts:149-170, go-web-proxy/contract_test.go:366-372
Confidence: verified
Evidence:

    tests/mock-broker/gateway/contract.test.ts:27: interface Step {
    tests/mock-broker/gateway/contract.test.ts:34:     upstream?: UpstreamAnswer & { url: string };
    tests/mock-broker/gateway/contract.test.ts:45: const cases: { name: string; steps: Step[] }[] = read('cases.json').cases;
    go-web-proxy/contract_test.go:369: 	dec.DisallowUnknownFields()

1. go-web-proxy/contract_test.go decodes cases.json with DisallowUnknownFields, so a new field on a step or case makes the Go runner fail until its struct knows it. 2. contract.test.ts reads cases.json with JSON.parse and a TypeScript interface that is erased at runtime. Nothing checks keys. 3. Suppose a step gains a field the Go runner learns, for example a clock, a second session, or a header to send. The fake then runs the step without it and the case can pass or fail for the wrong reason. 4. The same holds for new keys beside 'cases' and for new fields in the upstream object. 5. The file's header says the fake is proven to give the same answers, so a field only Go honours silently weakens that claim.

Why it matters: The fake gateway can drift from the real one on exactly the cases that grow new inputs, with a green suite. The drift protection is only as strong as the TS runner's knowledge of the schema.

Change: After reading cases.json, assert that every step has only the keys of Step (as, mustChange, method, path, body, raw, upstream, status, headers, response), that upstream has only url, status, headers, body and error, and that the top level has only 'cases'. A step with an unknown key then fails with its case name.

#### CR-0174 [minor] [new] Nothing ties the real gateway's error codes to MANAGED_ERROR_CODES, so a Go code that no contract case pins gets no stock message with no test noticing

Location: tests/mock-broker/gateway/error-codes.test.ts:21, tests/mock-broker/gateway/error-codes.test.ts:98-103, src/core/services/managed-api.ts:134
Confidence: verified
Evidence:

    tests/mock-broker/gateway/error-codes.test.ts:21: const GOLDEN = new Set(cases.flatMap(c => c.steps)
    tests/mock-broker/gateway/error-codes.test.ts:102:         expect([...placed].sort()).toEqual([...MANAGED_ERROR_CODES].sort());
    src/core/services/managed-api.ts:134: export const MANAGED_ERROR_CODES: readonly string[] = Object.keys(MESSAGES);

1. The suite builds its set of known codes from the codes that appear in cases.json responses, plus hand-listed groups, and compares that with the keys of MESSAGES. 2. A code in cases.json that lacks a message fails the suite, so the contract path is guarded. 3. A code the Go handlers send that no case pins, such as a new writeError(w, status, "x") in a handler, appears in neither set. The suite stays green. 4. No Go test enumerates the codes either. grep over go-web-proxy for the Go test files finds no reference to the app's message list. 5. In the page the code falls through to a generic http_<status> fallback in place of the stock text. Second check: The substance holds. error-codes.test.ts:21 builds GOLDEN from the contract cases, and line 102 compares the placed groups with MANAGED_ERROR_CODES. That guards a message with no placement but not a Go writeError code absent from the contract. No Go test references MANAGED_ERROR_CODES or enumerates the codes, and about 44 writeError literals exist in non-test Go files. The cited locations are wrong: error-codes.test.ts has 124 lines, so 233-238 and 311-319 do not exist. The real lines are about 21 and 98-103. managed-api.ts:134 is correct. The impact is mild: managed-api.ts:94 falls back to http_<status> only for a body with no code. A real code with no stock message would show a generic text.

Why it matters: The comment says an added message fails until it is placed, but the opposite direction, a gateway code with no message, is unguarded. The error-code list can rot as the gateway grows.

Change: Add a Go test, or a TS test that reads go-web-proxy/*.go, listing every code literal passed to writeError or apiError and comparing it with MANAGED_ERROR_CODES plus a short named exemption list (client_gone and invalid, which the app handles by reason or never sees). Alternatively require every code the Go side can send to have a contract case.

#### CR-0175 [minor] [new] The three places that pin trivy (dev.sh, dev.ps1, tag.yml) must be kept equal by hand and no test checks that they are

Location: scripts/dev.sh:20, scripts/dev.ps1:22, .github/workflows/tag.yml:273, tests/build/workflows.test.ts:172-189
Confidence: verified
Evidence:

    scripts/dev.sh:20: TRIVY_IMAGE="aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c"
    scripts/dev.ps1:22: $TrivyImage = 'aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c'
    .github/workflows/tag.yml:273:           version: v0.76.1

The comments at dev.sh:15-19 and tag.yml:265-267 say the version must be bumped in all three places together, and Dependabot moves none of them for the scripts. tests/build/workflows.test.ts pins the tag rules, the gate invocation and action SHAs but has no case comparing the three versions (grep for trivy in tests/build finds nothing). A bump of one file passes every test and leaves the local scan and the release gate on different trivy databases or rules, so the same image can be green locally and red in the tag pipeline (or the reverse).

Why it matters: The divergence the pin exists to prevent can come back through a partial bump with no gate noticing.

Change: Add a case to tests/build/workflows.test.ts that reads TRIVY_IMAGE, $TrivyImage and both `version:` lines in tag.yml and asserts the same version, and that the two scripts carry the same digest.

#### CR-0176 [minor] [new] Check 13 sweeps responses only up to check 12 and the browser/direct checks, so every admin, backup, two-factor and TLS response of checks 18-31 is never swept for credentials

Location: scripts/e2e.mjs:980-988, scripts/e2e.mjs:1430-1431, docs/testing.md:454
Confidence: verified
Evidence:

    scripts/e2e.mjs:980:         await check(13, 'no response from either gateway carries a credential except the dial answer\'s body', async () => {
    scripts/e2e.mjs:981:             const sweep = sweepable();
    scripts/e2e.mjs:984:             const hits = sweepSecrets(records, sweep,
    scripts/e2e.mjs:1430:                 const hits = sweepSecrets(records, tlsKeys);

1. request() pushes every response onto `records` (line 418). 2. Check 13 runs at line 980, before checks 14, 18, 20-31, 19, 15, 16 and 17 in the actual run order, and sweeps `records` as it stands then. 3. The responses of the later checks (GET /managed/users with the scratch user, backup export/preview/import bodies, the /login/two-factor and recovery pages, /managed/tls, the second sign-ins with scratchPassword and scratchNewPassword) are appended afterwards and no later code sweeps them for the generated passwords; only check 29 re-sweeps, and only for tlsKeys. 4. The check title and docs/testing.md present check 13 as covering 'no response from either gateway'.

Why it matters: A regression that echoes a password or the bootstrap password in an admin or backup response, or the scratch user's passwords in a sign-in answer, passes the gate; the newest and most sensitive routes are the ones left out of the sweep.

Change: Run the same sweep again after check 31 (a second assertion inside check 17, or a final check using the same allowance), or move check 13 after check 31 so it sees the whole `records` array. Keep the dial allowance. Update the docs text to say when the sweep happens.

#### CR-0177 [nit] [new] One writer test uses a fixed 50 ms sleep, so a regression can pass on a slow runner, and waitForWaiters depends on the writer.Do function name in the goroutine dump

Location: go-web-proxy/writer_test.go:657-682, go-web-proxy/managed_test.go:1070-1086
Confidence: verified
Evidence:

    go-web-proxy/writer_test.go:670:		time.Sleep(50 * time.Millisecond) // long enough for the commit to reach its publish
    go-web-proxy/managed_test.go:1079:		if strings.Count(string(buf[:runtime.Stack(buf, true)]), ".(*writer).Do(") >= n+1 {

TestWriter_SnapshotWaitsForAPublishInProgress asserts 'no publish yet' after 50 ms. If snapshot stopped blocking Do, the test still passes whenever the goroutine has not reached onPublish within 50 ms (a loaded -race runner), so the failure it guards is detectable only on a fast machine. waitForWaiters in managed_test.go counts occurrences of the text '.(*writer).Do(' in a 1 MiB goroutine dump every 5 ms; renaming the receiver or inlining Do silently makes it wait out its 5 s deadline, and the buffer truncates a large dump. The fake clock the rest of the suite uses does not apply here, but a hook would: tx.stage accepts a verify function, and the writer has exit, gate and journal hooks. Second check: The 50 ms sleep at writer_test.go:670 is real: on a slow runner a regression could pass, so the false-pass claim holds. For waitForWaiters (managed_test.go:1079) the claim that a rename 'silently' makes it wait is overstated. It calls t.Fatalf after the 5 s deadline, so it fails loudly. The coupling to the function name and the 1 MiB buffer truncation are true but fragile-test maintainability only.

Why it matters: A race-sensitive property (a backup read never sees a half-published change) is checked by a timing guess, and a deadline-failing helper is coupled to a function name.

Change: Signal the commit's arrival from a verify callback on the staged file (it runs just before the renames and publish), then wait on that channel instead of sleeping; for waitForWaiters add a counter the writer increments before taking its lock (or a test hook there) rather than reading the stack.

#### CR-0178 [nit] [new] Queue-picker test comments claim to hit the picker's v8-ignored catch but are caught earlier in semp-discovery

Location: tests/core/components/queue-picker/picker.test.ts:202-217, tests/core/components/queue-picker/picker.test.ts:1374-1390
Confidence: verified
Evidence:

    src/core/components/queue-picker/index.ts:216:    /* v8 ignore start -- defensive catch around a contract that never throws:
    tests/core/components/queue-picker/picker.test.ts:203:            // Throw synchronously from the mock to bypass the async-generator
    tests/core/components/queue-picker/picker.test.ts:204:            // try/catch in the discovery factory and hit the picker's outer catch.

fetchVpns and fetchQueues wrap their for-await loops in a catch marked 'v8 ignore start' with the reason that sources never throw. The test 'surfaces a thrown SempContext.fetch rejection in the status line' says it throws from the mock to hit 'the picker's outer catch'. A second test ('VPN fetch that throws after close ...') targets the catch's generation guard. So the code is reachable and the tests aim at it, which contradicts the ignore reason. The catch is also not in the 'never throws' category if a custom QueueSource can throw. Second check: The claim that tests make the v8-ignored catch run does not hold. In semp-discovery.ts:58-77 the await sempCtx.fetch(path) sits inside try/catch, so the synchronous throw in picker.test.ts:205-207 and the rejection in the line 1374 test are caught there and turned into { ok:false } pages; the picker's own catch at index.ts:222-226 is never reached. The test at 202 passes through the page.ok false branch, and its comment ('bypass the async-generator try/catch ... hit the picker's outer catch') is wrong. So the ignore reason (sources never throw) is accurate for the real sources, and the coverage gate is not hiding a reachable path. What survives: those test comments (and the title of the 1374 test, which targets the catch's generation guard) are misleading.

Why it matters: A false reason on a coverage ignore hides the catch from the 100% gate: if a test stops reaching it, coverage will not fail. It also breaks the project rule that every ignore has an accurate reason.

Change: Remove both v8 ignore start/stop pairs if the tests do reach the catch, so coverage measures it. Otherwise make the tests drive the catch and fix the reason text.

#### CR-0179 [nit] [new] The move-mode unit test's ordering bookkeeping asserts nothing; removal-after-acknowledgement is pinned only by the demo-broker suite

Location: tests/modules/queue-copy/service-copy.test.ts:999-1038, tests/mock-broker/copy-flow.test.ts:121-135
Confidence: verified
Evidence:

    tests/modules/queue-copy/service-copy.test.ts:1006:             const sentBefore: number[] = [];
    tests/modules/queue-copy/service-copy.test.ts:1009:                 removedAfter.push(removedAfter.length + 1);
    tests/modules/queue-copy/service-copy.test.ts:1037:             expect(removedAfter).toEqual([1, 2]);
    tests/mock-broker/copy-flow.test.ts:121:     it('stops a move at the broker\'s rejection, with its reason, and the source keeps every message', async () => {

The test titled 'calls browser.removeMessageFromQueue immediately after each ACK, in order' pushes to sentBefore and never reads it, and removedAfter counts its own calls, so [1, 2] holds for any call order. It does not assert that nothing is removed while a publish is pending. The property itself is held elsewhere: tests/mock-broker/copy-flow.test.ts runs the engine against the demo broker in move mode with a rejecting destination and asserts the source keeps every message (lines 121-135), which fails if removal moved ahead of the acknowledgement. The first reviewer rated this major on the belief that no test would fail; the demo-broker test refutes that.

Why it matters: The unit test reads as if it proves the ordering and does not. The safety property is covered, but one suite away from the engine's own tests.

Change: In the move-mode test, assert removeMessageFromQueue has not been called after fireMessage and before ackLast, then called once with that message after it; delete sentBefore and removedAfter.

#### CR-0180 [nit] [new] Forward and browser message-id tests use only low bytes and small ids, though ingest-level tests cover high bytes

Location: tests/modules/queue-browser/service.test.ts:371-387, tests/modules/queue-browser/ui-table.test.ts:431-455, tests/modules/queue-browser/service-events.test.ts:254, src/modules/queue-browser/service-events.ts:208
Confidence: verified
Evidence:

    tests/modules/queue-browser/service.test.ts:371: const binary = new Uint8Array([1, 2, 3]);
    tests/modules/queue-browser/service.test.ts:387: expect(sentMsg.setBinaryAttachment).toHaveBeenCalledWith(binary);
    tests/modules/queue-browser/ui-table.test.ts:449:             expect(fileFn.mock.calls[0][1]).toBe(bytes);

High-byte payloads are asserted only at the ingest/download unit level (payload.test.ts, service-events.test.ts latin1 cases). The forward test uses a Uint8Array [1,2,3] (all below 0x80) although payload.ts documents that the real SDK returns a Latin-1 string, and asserts only reference identity. The ZIP test mocks JSZip and checks the object passed is the same reference, so generated ZIP bytes are never read. The copy engine tests publish a mock message with no attachment at all. Browser message ids are tested only with small numbers (12345, 100..999); the 64-bit case exists only for compareMsgIds in queue-copy. Second check: The test gap is real: forward test uses [1,2,3], browser ids use small numbers, and the copy tests have no attachment (grep of tests/modules/queue-copy for BinaryAttachment found nothing). The claimed regression risk is overstated. High bytes are covered at the ingest and download level in payload.test.ts and service-events.test.ts (0x89, 0xFF, latin1 cases). solace-publisher.ts:150 copies the attachment through safeSet('setBinaryAttachment','getBinaryAttachment'), so it is passed by reference with no re-encoding step to regress. The id is a plain toString() at service-events.ts:208. Only the end-to-end forward and 64-bit id cases are missing, and no code on those paths transforms the value.

Why it matters: A regression that re-encodes a Latin-1 string payload through UTF-8 on forward, or drops precision in the browser id, would pass the whole suite.

Change: Add a forward test whose getBinaryAttachment returns a Latin-1 string with 0x89/0xFF characters and assert setBinaryAttachment receives the identical string; add a service-events onMessage test with a Long-like id (toString returning '9007199254740993'); optionally read the ZIP blob with real JSZip once.

#### CR-0181 [nit] [new] The backup passphrases checks 18 and 22 send are literals outside `secrets`, so check 17 does not look for them in the gateway log or the audit log

Location: scripts/e2e.mjs:1008, scripts/e2e.mjs:1101, scripts/e2e.mjs:1595-1599
Confidence: verified
Evidence:

    scripts/e2e.mjs:127: const secrets = {
    scripts/e2e.mjs:1008:             const pass = 'e2e backup passphrase';
    scripts/e2e.mjs:1101:             const pass = 'e2e import passphrase';
    scripts/e2e.mjs:1595:             const found = Object.entries({ ...sweepable(), storeKey, ...cookies, ...twoFactor, ...tlsKeys }).filter(([, v]) => text.includes(v)).map(([name]) => name);

1. `secrets` (127-133) holds only the five generated passwords. 2. Checks 18 and 22 post two fixed passphrases in request bodies to /managed/backup/export, preview, schedule and import. 3. say() masks only `secrets`, cookies, twoFactor, tlsKeys and brokerSecrets (155), so these are printed in clear in a failure message that echoes a body. 4. Check 17 builds its search list from sweepable(), storeKey, cookies, twoFactor and tlsKeys (1595, 1599); the passphrases are not in it, so the claim 'neither gateway log nor the audit log holds a password' does not cover them although a debug-level gateway log and the audit log are exactly where a passphrase could leak (the schedule PUT stores one). Second check: The literals at 1008 and 1101 are outside `secrets` (127-133), and check 17's search list (1595, 1599) is built from sweepable(), storeKey, cookies, twoFactor and tlsKeys, so the passphrases are not looked for in the gateway log or the audit log. That coverage gap holds. The masking claim does not: these are fixed strings written in the public source, so masking them in console output protects nothing. Whether the gateway logs or audits a passphrase is speculative, and the code does not suggest it does. The fix, generating them with token() and adding them to `secrets`, is cheap and sound.

Why it matters: Check 17 says the logs hold no password, but the one secret an operator types for backups (and the schedule stores) is not searched for; a leak of it into the debug log or the audit message would pass.

Change: Generate the two passphrases with token() and add them to `secrets` (backupPassphrase, importPassphrase), use them in checks 18 and 22, so they are masked and swept by check 17.

#### CR-0182 [nit] [new] Check 30's skip and its dropped failure half count as PASS and the summary has no skip count, though each PASS line names the skip in its detail

Location: scripts/e2e.mjs:1436, scripts/e2e.mjs:1452-1455, scripts/e2e.mjs:759-768, scripts/e2e.mjs:2142-2144
Confidence: verified
Evidence:

    scripts/e2e.mjs:762:         results.push({ n, ok: true });
    scripts/e2e.mjs:763:         say(`PASS ${n}. ${title}${detail ? ` (${detail})` : ''}`);
    scripts/e2e.mjs:1436:                 if (insecure()) return 'skipped: E2E_INSECURE=1 turns broker verification off, so the CA file proves nothing';
    scripts/e2e.mjs:1454:                         detail = "failure half skipped: the broker's certificate also verifies against the host's standard roots";
    scripts/e2e.mjs:2142:     say(`e2e: ${results.length - failed.length} passed, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}${setupError ? ', setup failed' : ''}`

1. check() treats any returned value as success: results gets ok: true and the line starts with PASS. 2. Under E2E_INSECURE=1 check 30 returns at 1436 without asserting anything. 3. When the broker chain also verifies against host roots, the relay still answers 200 after the CA file is deleted, so the half that proves the CA file matters is dropped (1452-1454) and the check passes on the 'add back' half alone. 4. The final summary adds the E2E_INSECURE note but does not name check 30, and a run with the host-roots case prints a plain 'N passed, 0 failed' with no skip count; docs/testing.md line 408 lists the insecure-affected checks without 30. Second check: check() records ok: true for any fn that returns (762-763), so check 30's early return at 1436 and its dropped failure half at 1452-1455 both count as passed. The summary at 2142 does not count skips. The 'silently' claim overreaches, though. The insecure return string is printed on the PASS line as '(skipped: ...)', because the string becomes `detail`, and so is the host-roots text, 'failure half skipped: ...'. The summary also adds the E2E_INSECURE note when insecure() is true. The remaining gap is that a skip is not counted in the totals. It is cosmetic, because the run states what was skipped on the line itself.

Why it matters: A green run can mean check 30 asserted nothing or only half of what its title says, visible only by reading that one PASS line.

Change: Give check() a skipped outcome (return { skipped: reason }) that prints SKIP, is counted separately, and appears in the summary line ('1 skipped (30)'); use it for both the insecure case and the host-roots half.

### cicd

#### CR-0183 [minor] [new] The pages job deploys any tag, so a hotfix tag on an older line overwrites the public site with the older bundle while the image and the Latest Release stay on the newer one

Location: .github/workflows/tag.yml:445-452, .github/workflows/tag.yml:209, .github/workflows/tag.yml:569, docs/git.md:145, docs/deployment.md:73
Confidence: verified
Evidence:

    .github/workflows/tag.yml:446:     needs: [plan, gates, image, binaries, publish]
    .github/workflows/tag.yml:447:     if: >-
    .github/workflows/tag.yml:448:       always()
    .github/workflows/tag.yml:449:       && needs.gates.result == 'success'
    .github/workflows/tag.yml:209:       type=raw,value=latest,enable=${{ needs.plan.outputs.latest == 'true' }}
    .github/workflows/tag.yml:569:             --latest="$LATEST" \

plan computes latest=true only for the highest vX.Y.Z tag, and the image tag (209) and the GitHub Release (569) honour it. The pages condition (447-452) never reads needs.plan.outputs.latest. Push v3.4.1 after v3.5.0: plan sets latest=false, publish leaves latest on 3.5.0, release is not marked Latest, but pages still copies the 3.4.1 index.html into the dist branch and pushes it, so the Pages site goes back to the older line. The plan comment (103-107) says the release process treats Pages as the current release, which this contradicts. pages and release are also independent jobs, so Pages can be redeployed and then release can still fail, although the header says a failure anywhere leaves no release.

Why it matters: A routine hotfix on an older line silently downgrades the public Direct-connection site; nothing in the run shows it.

Suggested patch (not applied):

```diff
--- a/.github/workflows/tag.yml
+++ b/.github/workflows/tag.yml
@@ -449,4 +449,5 @@
       && needs.gates.result == 'success'
+      && needs.plan.outputs.latest == 'true'
       && needs.image.result != 'failure' && needs.image.result != 'cancelled'
       && needs.publish.result != 'failure' && needs.publish.result != 'cancelled'
```

#### CR-0080 [nit] [open] The released bundles are a separate build from the one the gates checked and from the one inside the image (the image now runs check:bundles itself)

Location: .github/workflows/tag.yml:355, .github/workflows/ci.yml:76-83, docker/Dockerfile:140-145
Confidence: verified
Evidence:

    .github/workflows/tag.yml:355:         run: ./scripts/dev.sh build
    docker/Dockerfile:140: RUN APP_VERSION="$APP_VERSION" npm run build
    docker/Dockerfile:145: RUN npm run check:bundles

The gates job builds and checks the bundles and uploads only logs; the binaries job builds them again (355, check:bundles runs there too through dev.sh build); the image builds them a third time. The earlier gap, an image build with no bundle check, is closed (Dockerfile:145, and check-bundles.mjs:253-257 covers solAdmin.html). What remains is that the Release assets and the Pages index.html come from the binaries build, not from the artifact the gates or the image checked; the inputs are the same commit, lockfile and node 26.8.1 pin, so the risk is low.

Why it matters: Reproducibility, not identity, ties the three builds together; low impact.

Change: Optional: have binaries (or release) compare the sha256 of index.html with the image's, or accept the three builds as designed and say so in docs/git.md.

#### CR-0184 [nit] [new] With no gcc on a runner the Go suite runs without -race and the gate stays green; one log line is the only trace

Location: scripts/dev.sh:193-198, scripts/dev.ps1:257-268
Confidence: verified
Evidence:

    scripts/dev.sh:193:  if command -v gcc >/dev/null 2>&1; then
    scripts/dev.sh:194:    run "$task" env CGO_ENABLED=1 go -C "$GO_DIR" test -race -count=1 "$@" ./...
    scripts/dev.sh:196:    note "$task" "go test: -race skipped, no gcc on PATH"

CR-0066 is fixed by adding -race, but with a guard that falls back to a plain run and a note in the task log. docs/testing.md:67 and :122 rely on -race for the store, writer and totp concurrency tests (store_test.go:2027-2048 only fail under the detector). If a runner image stops shipping gcc, `all cov scan` stays green with no race coverage and the only trace is one log line. The dev-script contract allows this fallback and the log says so, so it is a deliberate local convenience; the gap is only that CI does not treat it as a failure.

Why it matters: The concurrency tests that guard the single writer and the replay guard become non-failing without anyone being told by a red build.

Change: When CI is set (the CI or GITHUB_ACTIONS variable the scripts already read for the tag version), make a missing gcc a failure instead of a note, in both dev.sh and dev.ps1.

### build

#### CR-0185 [minor] [new] dev.ps1 turns any exception thrown inside a task into a bare exit 1 with no message on the console or in the log

Location: scripts/dev.ps1:442, scripts/dev.ps1:91-106
Confidence: verified
Evidence:

    scripts/dev.ps1:442:   try { $code = & "Task-$task" } catch { $code = 1 }

A native tool that is missing from PATH (go, npm, docker) makes `& $Exe @CmdArgs` in Invoke-Logged raise CommandNotFoundException; its finally only disposes the writer. The exception reaches the dispatch loop at 442, which sets $code = 1 and discards the error record. Write-Finish then prints 'FAILED (exit 1)' and the task log holds only the header and the footer. dev.sh prints bash's 'command not found' through the same run() path, so the two scripts differ on this path and the Windows operator is not told what failed or what to do.

Why it matters: A runner or laptop with a missing or mis-installed tool fails with no cause in the console or in the uploaded logs artifact, which breaks the actionable-errors rule and the scripts' behavioural parity.

Suggested patch (not applied):

```diff
--- a/scripts/dev.ps1
+++ b/scripts/dev.ps1
@@ -439,5 +439,5 @@
   Start-TaskLog $task
   $sw = [Diagnostics.Stopwatch]::StartNew()
   $code = 0
-  try { $code = & "Task-$task" } catch { $code = 1 }
+  try { $code = & "Task-$task" } catch { Write-Note $task "error: $($_.Exception.Message)"; $code = 1 }
   if ($null -eq $code) { $code = 0 }
```

#### CR-0186 [nit] [new] Dockerfile.dockerignore does not exclude the git-ignored cert/ directory, which holds a private key; no COPY reads it today

Location: docker/Dockerfile.dockerignore:23-28, docker/docker-compose.yaml:31-32, .gitignore:34
Confidence: verified
Evidence:

    docker/Dockerfile.dockerignore:27: scripts/logs/
    docker/Dockerfile.dockerignore:28: docker/e2e-broker.env
    docker/docker-compose.yaml:31:       context: ..
    docker/docker-compose.yaml:32:       dockerfile: docker/Dockerfile
    .gitignore:34: cert

1. The repo root holds cert/ (ca.crt, server.crt, server.csr, server.key), git-ignored at .gitignore:34. 2. docker-compose.yaml builds with context `..`, the repo root, and BuildKit reads docker/Dockerfile.dockerignore. 3. That file excludes dist, node_modules, tests, docs, graphify-out, .env, scripts/logs and docker/e2e-broker.env, but not cert/, *.key or *.pem. 4. The Dockerfile's COPY lines name explicit paths (go-web-proxy, package.json, scripts, src), so no key reaches an image layer today. 5. The whole context, cert/server.key included, is still sent to the daemon, or to a remote or cloud builder if the engine is not local. Checked by the orchestrator: every COPY in docker/Dockerfile names its sources (lines 90-92 and 132-136), so no layer receives cert/. With BuildKit only the paths a COPY names are transferred; the classic builder sends the whole context to the daemon.

Why it matters: A private key leaves the working tree on every build, and one broad COPY added later would put it in a published image. The ignore file already lists the secrets-like paths it knows (.env, e2e-broker.env), so cert/ is an omission.

Suggested patch (not applied):

```diff
--- a/docker/Dockerfile.dockerignore
+++ b/docker/Dockerfile.dockerignore
@@ -26,5 +26,10 @@
 # otherwise carry the first into a build layer.
 scripts/logs/
 docker/e2e-broker.env
+
+# Local TLS material (git-ignored): never part of a build context.
+cert/
+*.key
+*.pem
 
 # Editor scratch.
```

#### CR-0187 [nit] [new] The Go stage resolves modules inside the same layer as the source build, so every .go change re-downloads the dependencies

Location: docker/Dockerfile:90-96
Confidence: verified
Evidence:

    docker/Dockerfile:90: COPY go-web-proxy/go.mod go-web-proxy/go.sum ./
    docker/Dockerfile:91: COPY go-web-proxy/*.go ./
    docker/Dockerfile:94: RUN CGO_ENABLED=0 GOOS=linux go build \

1. go.mod and go.sum are copied first, but no `go mod download` follows. 2. COPY go-web-proxy/*.go (which includes the *_test.go files) comes next, then `go build`, which fetches the modules. 3. Any edit to a .go file or a test file invalidates the COPY layer and the RUN layer. 4. The module download therefore repeats on every code change. The PWA stage does the reverse and runs `npm ci` before copying src/ (Dockerfile:132-136).

Why it matters: Slower local image builds and one more registry fetch per build. The checklist asks for manifests to be resolved before the source tree is copied.

Suggested patch (not applied):

```diff
--- a/docker/Dockerfile
+++ b/docker/Dockerfile
@@ -88,5 +88,6 @@
 WORKDIR /src
 # pages/ holds the sign-in page the binary embeds (go:embed).
 COPY go-web-proxy/go.mod go-web-proxy/go.sum ./
+RUN go mod download
 COPY go-web-proxy/*.go ./
 COPY go-web-proxy/pages/ ./pages/
```

### interfaces

#### CR-0188 [minor] [new] A duplicate CA file name is reported as "That name already exists. Use Edit to change it.", though the Certificates page has no Edit

Location: src/core/services/managed-api.ts:110-110, src/modules/tls-certificates/module.ts:296-301, go-web-proxy/tls_api.go:64-65
Confidence: verified
Evidence:

    go-web-proxy/tls_api.go:64: 	case errors.Is(err, errTLSExists):
    go-web-proxy/tls_api.go:65: 		writeError(w, http.StatusConflict, "exists")
    src/core/services/managed-api.ts:110:     exists: 'That name already exists. Use Edit to change it.',
    src/modules/tls-certificates/module.ts:300:                 reportManagedFailure(res, eventBus, fail(els.caError));

POST /managed/tls/trust answers 409 {error:"exists"} with no reason when a CA file of that name is present. addTrust passes the failure to reportManagedFailure, and managedErrorMessage falls through to MESSAGES.exists, a line written for users and connections. The user and connection modules and the backup schedule special-case 'exists' themselves; the trust form does not. The admin sees an instruction that cannot be followed (a CA file has no Edit, only Delete and add).

Why it matters: The one error an admin can reasonably hit when re-adding a CA gives a wrong next step.

Change: In addTrust, handle res.code === 'exists' before reportManagedFailure and show 'A CA file with that name already exists. Delete it first, or choose another name.', as the user and connection modules do; or have the gateway send a reason with this 409.

#### CR-0189 [minor] [new] The page's file-size checks (256 KiB for PEM, 8 MiB for an import) do not match the gateway's real body caps (64 KiB for TLS bodies, 8 MiB for the whole JSON body of an import)

Location: src/modules/tls-certificates/module.ts:229-233, go-web-proxy/managed.go:18-18, go-web-proxy/tls_api.go:87-87, src/modules/backup/module.ts:269-273, go-web-proxy/backup_api.go:37-37
Confidence: verified
Evidence:

    src/modules/tls-certificates/module.ts:229:             if (file.size > MAX_PEM_BYTES) {
    src/modules/tls-certificates/module.ts:231:                 setError(errorEl, `${file.name} is larger than 256 KiB, so it is not a certificate or a key.`);
    go-web-proxy/managed.go:18: const maxBodyBytes = 64 << 10
    go-web-proxy/tls_api.go:87: 	if !decodeJSON(w, r, &in) {
    src/modules/backup/module.ts:269:             if (file.size > MAX_IMPORT_BYTES) {
    go-web-proxy/backup_api.go:37: const maxImportBytes = maxStoreFile

Every TLS route uses decodeJSON, which caps the body at maxBodyBytes (64 KiB), and newlines in PEM become two bytes each in JSON. The page lets a file up to 256 KiB into the textarea and sends it; a 100 KiB CA bundle passes the page check and comes back 413 too_large, shown only as 'The request is too large.', while the page's own message claims anything under 256 KiB is a plausible certificate. For backups the page compares the raw file size with 8 MiB, but the file travels as a JSON string inside a body the gateway caps at 8 MiB (maxStoreFile), so a file a little under 8 MiB (quotes escaped) is refused after upload. The fake gateway does not simulate the cap (src/mock-broker/gateway/strict.ts says so), so no test sees it.

Why it matters: The page's guard gives false assurance and the real refusal arrives after the upload with a message that names no limit.

Change: Set MAX_PEM_BYTES to what fits the 64 KiB body (about 48 KiB) and name the real limit in the message; give MAX_IMPORT_BYTES headroom for JSON escaping (or have the gateway cap the file field, not the whole body). Add a `too_large` line that says the limit, or have the gateway send a reason.

#### CR-0190 [nit] [new] Backup download wraps file bytes in a JSON string, which would rewrite non-UTF-8 content in a hand-edited file

Location: go-web-proxy/backup_api.go:122
Confidence: verified
Evidence:

    go-web-proxy/backup_api.go:122: 		writeJSON(w, http.StatusOK, map[string]string{"filename": name, "content": string(data)})
    go-web-proxy/backup_api.go:260: 	writeJSON(w, http.StatusOK, map[string]string{"filename": backupName(h.backups.now()), "content": string(data)})
    go-web-proxy/backup.go:863: 	f, err := os.Open(filepath.Join(b.dir, name))
    go-web-proxy/backup.go:868: 	data, err := io.ReadAll(io.LimitReader(f, maxStoreFile+1))

1. read() returns the raw bytes of a file named smu-backup-<time>.json and downloadBackup converts them with string(data). 2. encoding/json replaces every invalid UTF-8 sequence with U+FFFD when it encodes a string. 3. For gateway-written backups the bytes are valid JSON text, so nothing changes today. 4. A file that was edited, truncated or copied through a tool that left binary bytes is returned altered with a 200, and the browser saves a different file than the one on disk. 5. The same transport (JSON string in, 8 MiB read cap, no content type or length in the answer) is the obvious template for a later feature that shows or downloads binary files (png, jpg, pdf), where it would corrupt every byte above 0x7f. Second check: backup_api.go:122 and :260 do wrap bytes in a JSON string, and encoding/json would rewrite invalid UTF-8. But the files are gateway-written sealed JSON text, backupName and the read cap constrain what is read, and no binary route exists. The 'silently rewrites' claim needs an edited or corrupt file. The rest is a speculative warning about future reuse. It is a nit at most.

Why it matters: No current failure, but the API has no byte-exact download path and no content-type or size contract, so a binary-file feature built by copying this handler would be lossy. The names and sizes are already capped (backupNamePattern, maxStoreFile), which is the right basis for a proper streaming route.

Change: If binary downloads are ever added, give them their own route that streams with Content-Type and Content-Length from an explicit allow-list keyed by file name pattern, with X-Content-Type-Options: nosniff and Content-Disposition: attachment, rather than reusing the {filename, content} JSON string. For the backup route, either document that content is text, or return a 422 when the bytes are not valid UTF-8 instead of rewriting them.

### observability

#### CR-0191 [minor] [new] A cross-origin refusal on the authenticated admin API is neither logged nor audited, although the same refusal on the SMF socket is a WARN with the user

Location: go-web-proxy/managed.go:98-102, go-web-proxy/smf.go:64-65
Confidence: verified
Evidence:

    go-web-proxy/managed.go:98: 	if err := h.cop.Check(r); err != nil {
    go-web-proxy/managed.go:99: 		writeError(w, http.StatusForbidden, "cross_origin")
    go-web-proxy/managed.go:102: 	setRequestUser(r, as.user)
    go-web-proxy/smf.go:65: 		g.logger.Warn("smf refused a cross-origin socket", "user", as.user, "origin", r.Header.Get("Origin"), "host", r.Host)

A request carrying a valid session cookie reaches managedHandler.ServeHTTP, passes fromRequest, and then h.cop.Check(r) fails for a cross-site state-changing request. The handler writes 403 cross_origin and returns at line 99-100. It never calls h.logger or h.audit.record, and setRequestUser (line 102) has not run yet, so the INFO access-log line has no user either. The admin routes are wrapped in audited() only after this point, so the refusal never reaches recordAdmin. The SMF gate, which refuses the same condition for a socket, logs a WARN naming the user, origin and host.

Why it matters: A forged cross-site request against a signed-in administrator is exactly the event an operator wants to see, and it leaves no trace naming the account. The two gates disagree on whether the refusal is worth a line.

Change: In ServeHTTP, on a cop.Check failure, log a WARN through requestLogger after setting the request user (move setRequestUser above the check, or pass as.user), with the Origin and Sec-Fetch-Site headers as attributes. Optionally record an auth-category refused audit entry with code cross_origin.

#### CR-0192 [nit] [new] A refused sign-in records the typed username (cut to 64 bytes), so a password typed into the username field lands in the audit trail and the log

Location: go-web-proxy/pages.go:140-145, go-web-proxy/pages.go:253, go-web-proxy/pages.go:617, go-web-proxy/store.go:296, go-web-proxy/pages.go:140-146, go-web-proxy/throttle.go:89-96, go-web-proxy/pages.go:250
Confidence: verified
Evidence:

    go-web-proxy/pages.go:142: 	e.Actor, e.Target = "", userKey(user)
    go-web-proxy/pages.go:144: 	e.Msg = "sign-in refused for " + e.Target + ": " + strings.ReplaceAll(code, "_", " ")
    go-web-proxy/pages.go:253: 	log := clientLogger(p.logger, r).With("user", userKey(user))
    go-web-proxy/store.go:296: 	usernamePattern = regexp.MustCompile(`^[A-Za-z0-9._@-]{1,64}$`)

submitLogin takes user from the form, builds log with userKey(user) (pages.go:253) and, on failure, signinRefused writes it as the audit Target and into Msg (pages.go:142-144). userKey only cuts to 64 bytes (throttle.go:91-96); it does not check the usernamePattern the store enforces (store.go:296). A person who types or pastes their password into the username box therefore has up to 64 bytes of it written to the WARN 'sign-in failed' line and to audit.log (retained, up to about 500 MB, and optionally copied to stdout and log shipping). The throttle also keys on it. The byte cut can also split a UTF-8 rune. The comment on signinRefused (pages.go:135-138) shows the choice is deliberate: the audit line must name the account tried.

Why it matters: Credentials that land in the wrong field are persisted in plain text in logs that are written to be kept and shipped, contrary to the logging standard's 'no secrets, at any level'.

Change: Add a helper (for example loggedUser) that returns the name when validName(usernamePattern, name) holds and a fixed token such as "(invalid username)" otherwise, and use it for the log attribute, the audit Target and Msg at pages.go:142, 253 and 617. Keep userKey for the throttle map key only.

#### CR-0193 [nit] [new] The documented, tested one-time logging of the generated bootstrap admin password is not listed as an exception in the Logging standard's 'no secrets, at any level' rule

Location: go-web-proxy/store.go:1469-1470, docs/developer-guide.md:588
Confidence: verified
Evidence:

    go-web-proxy/store.go:1469: 		logger.Warn("users file missing: bootstrap admin created with a generated password; sign in and change it now (shown once; delete the users file to bootstrap again)",
    go-web-proxy/store.go:1470: 			"path", opts.usersPath, "username", bootstrapAdminName, "password", password)

On a first start with no users file and no SMU_ADMIN_PASSWORD, bootstrapUsers generates a password with rand.Text() and passes it as the attribute "password" to the logger. That logger is the store's component logger, so the line goes wherever the container log goes (json-file, journald, a shipper). store_test.go asserts the password is logged, so this is deliberate. The standard in logging.go (line 124) and docs/developer-guide.md (Logging standard) says 'Secrets are never logged' and 'No secrets, at any level... a password'. The account stays valid until its first sign-in. Second check: The generated password is indeed logged at WARN (store.go:1469-1470), but this is deliberate and documented: docs/architecture.md:676 says it 'is generated and logged once', and store_test.go:317 and :414 assert it must be logged; the account has MustChangePassword and the message says change it now. What survives is the inconsistency with the developer-guide 'No secrets, at any level' line (docs/developer-guide.md:588), which does not state this exception. Documented deliberate behaviour, so at most a nit about the standard needing the exception.

Why it matters: A valid admin credential persists in log storage that is usually readable by more people and retained longer than /data; anyone with log access can sign in until the first change. The standard and the code contradict each other.

Change: Either write the generated password to a 0600 file under /data (and log only its path), or print it once to stdout as a one-off banner kept out of the structured log, and state the exception in the Logging standard. If the log line stays, document it there as the one allowed secret.

#### CR-0194 [nit] [new] A recovered handler panic logs only the panic value at ERROR; the stack is at DEBUG, so at the default level it cannot be located

Location: go-web-proxy/logging.go:99-100, go-web-proxy/writer.go:132, go-web-proxy/writer.go:177
Confidence: verified
Evidence:

    go-web-proxy/logging.go:99: 			log.Error("handler panicked; answered 500", "panic", fmt.Sprint(v))
    go-web-proxy/logging.go:100: 			log.Debug("handler panic stack", "stack", string(debug.Stack()))
    go-web-proxy/writer.go:132: 			w.logger.Error("panic after the commit point; exiting so the restart loads the committed state", "panic", r, "stack", string(debug.Stack()))

recoverPanics catches a handler panic at the default level (WARN) and emits one ERROR line with fmt.Sprint(v), for example 'runtime error: index out of range'. The stack goes to a DEBUG line that the default handler drops. The panic is a one-off bug, so the operator must raise the level and reproduce it to learn where it happened. The writer's panic paths log the stack at ERROR (writer.go:132, 177), so the two panic reports differ. Second check: Facts are right (logging.go:99-100: ERROR with fmt.Sprint(v), stack at DEBUG; writer.go:132 and :177 put the stack on ERROR). But the DEBUG placement is deliberate: the doc comment at logging.go:82-83 states 'with the stack at DEBUG' and logging_test.go:35-36 asserts 'the stack goes to debug'. The ERROR line also carries client, method, path and user from requestLogger. The operational argument (stack unavailable at default level) is a fair design critique, but it contradicts an explicit, tested choice, so it is a nit-level suggestion rather than a defect.

Why it matters: A panic value without its location is rarely actionable, and the first occurrence on a default deployment cannot be diagnosed from the log.

Change: Log the stack as an attribute of the ERROR line in recoverPanics (as writer.go does), keeping it out of the access-log path. The stack holds no request body.

#### CR-0195 [nit] [new] Refusals are logged at INFO on the entitlement paths and at WARN on their siblings, while the standard files a refused request under WARN

Location: go-web-proxy/dial.go:69, go-web-proxy/dial.go:74, go-web-proxy/smf.go:94, go-web-proxy/smf.go:99, go-web-proxy/relay.go:134, go-web-proxy/relay.go:140, go-web-proxy/relay.go:145
Confidence: verified
Evidence:

    go-web-proxy/dial.go:69: 		d.logger.Info("dial denied", "user", user, "broker", body.Broker, "vpn", body.Vpn)
    go-web-proxy/dial.go:74: 		d.logger.Warn("dial rate limited", "user", user, "broker", body.Broker, "vpn", body.Vpn)
    go-web-proxy/relay.go:134: 		rl.logger.Warn("semp relay refused a write", "user", user, "broker", p.broker, "method", r.Method)
    go-web-proxy/relay.go:140: 		rl.logger.Info("semp relay denied", "user", user, "broker", p.broker)
    go-web-proxy/relay.go:145: 		rl.logger.Info("semp relay limited: too many requests in flight", "user", user, "broker", p.broker, "max_in_flight", relayMaxInFlight)

The Logging standard says 'warn: ... a refused request'. dial denied, smf denied and semp relay denied are refusals (404 not_found) logged at INFO, so they vanish at the default WARN. The relay's 'refused a write' (403), dial's and smf's 'rate limited' (429) and the relay's in-flight limit (429, INFO at line 145 versus WARN for the rate limit on the sibling paths) are the same kind of refusal at WARN. The audit trail covers them when audit.access is on, but the application log is inconsistent.

Why it matters: Filtering the default log for refusals returns some and silently misses others, and the level does not predict whether a refusal shows.

Change: Pick one level for refusals (WARN, per the standard) and use it at dial.go:69, smf.go:94, relay.go:140 and relay.go:145, or amend the standard to say entitlement denials are INFO because the audit trail holds them.

#### CR-0196 [nit] [new] Start-up and shutdown lines in serveUntilStopped carry no component attribute, contrary to the standard

Location: go-web-proxy/main.go:437, go-web-proxy/main.go:412, go-web-proxy/main.go:440, go-web-proxy/main.go:577, go-web-proxy/main.go:594
Confidence: verified
Evidence:

    go-web-proxy/main.go:412: 	boot := slog.New(slog.NewTextHandler(p.log, nil))
    go-web-proxy/main.go:437: 	logger := slog.New(slog.NewTextHandler(p.log, &slog.HandlerOptions{Level: &lv.level}))
    go-web-proxy/main.go:440: 		logger.Info("config file seeded from the environment; it is authoritative from now on", "path", configFile)
    go-web-proxy/main.go:594: 	logger.Info("shutdown complete")

logging.go:121-123 requires every line to carry a 'component' attribute set once per handler with logger.With. The root logger built at main.go:437 and the bootstrap logger at main.go:412 have none, and serveUntilStopped logs directly through them: config seeded, env var ignored, removed settings, listener failed, shutdown signal, shutdown complete and the fatal 'configuration failed' / 'data directory recovery failed' lines. Every other call site uses logger.With("component", ...). recoverDataDir also takes boot, so its warnings have no component.

Why it matters: The lifecycle lines that matter most when a start fails cannot be selected with the filter that works for all other lines.

Change: Create lifecycle := logger.With("component", "gateway") (and the same for boot) and use it for these lines, matching the logStartup component.

### conventions

#### CR-0079 [minor] [open] provisioned-mode.md tells operators to download the compose file from the Release, which does not carry it, and deployment.md's compose commands never say where docker/ comes from

Location: docs/provisioned-mode.md:82, .github/workflows/tag.yml:82, docs/deployment.md:126-129
Confidence: verified
Evidence:

    docs/provisioned-mode.md:82: 1. Download [`docker/compose.provisioned.yaml`](../docker/compose.provisioned.yaml) from the release you are deploying.
    .github/workflows/tag.yml:82:   RELEASE_BUNDLES: "index.html min.html no-payload.html no-queue-copy.html demo.html provisioned-demo.html"

The rest of CR-0079 is fixed (README.md:27-28, :60 and :64-71 and deployment.md:51 now carry SMU_VERSION, the docker/ path, the backup directory and the admin-password permissions). What remains: provisioned-mode.md:82 says to download the file 'from the release', but the release step uploads only RELEASE_BUNDLES plus SHA256SUMS.txt (tag.yml:541-552), so no compose file is on the Release page. README.md:60 gets it right ('from a checkout of that release'); deployment.md:126-129 runs `-f docker/compose.gateway.yaml` and never says it needs a checkout of the release either. provisioned-mode.md:93 then runs `-f compose.provisioned.yaml` from the download directory, so the steps only work if the reader found the file some other way.

Why it matters: A first-time operator following the Provisioned quick start looks for the file on the Release page and cannot find it.

Change: In provisioned-mode.md:82 say 'Take docker/compose.provisioned.yaml from a checkout (or the source archive) of the release you are deploying', and add the same clause before the command at deployment.md:128.

#### CR-0091 [minor] [open] `any` is used outside the Solace SDK boundary for DOM nodes, config objects and the jszipLoaded window global in queue-browser, connections and kernel

Location: src/modules/queue-browser/ui-table.ts:78-99, src/modules/queue-browser/ui-details.ts:79, src/modules/queue-browser/ui-events.ts:210, src/modules/queue-browser/module.ts:173, src/modules/connections/module.ts:231, src/modules/connections/module.ts:558-561, src/modules/queue-browser/service.ts:187-215, src/core/kernel.ts:133
Confidence: verified
Evidence:

    src/modules/queue-browser/ui-table.ts:78: const msg = state.displayedMessages.find((m: any) => m.id === (tr as any).dataset.id);
    src/modules/queue-browser/ui-table.ts:99: eventBus.emit('app:message-delete', { id: (tr as any).dataset.id! });
    src/modules/queue-browser/ui-details.ts:79: els.msgList.querySelectorAll('tr').forEach((tr: any) => {
    src/modules/queue-browser/ui-events.ts:210: els.radFilterCriteria.forEach((r: any) => r.checked = (r.value === 'OR'));
    src/modules/queue-browser/module.ts:173: els.msgList.querySelectorAll('.msg-check').forEach((cb: any) => cb.checked = checked);
    src/modules/connections/module.ts:231: function applyConfig(cfg: any) {
    src/core/kernel.ts:133: if ((window as any).jszipLoaded) {

The specific `any` uses the old finding named (managed-semp-filter.ts, event-bus.ts, queue-picker/index.ts, semp-discovery.ts, semp-client.ts) are gone; a grep of those five files finds no `any` type. The same mistake is still widespread in modules. `querySelectorAll('tr')` already returns HTMLTableRowElement, yet callbacks type it `any`. `(tr as any).dataset.id!` combines `any` with a non-null assertion, which CLAUDE.md also discourages. `cfg: any` is a parsed config object. `(window as any).jszipLoaded` is a page global, not the SDK. contributing.md:77 allows `any` only 'at the Solace SDK interface'. Counting message rows typed `(m: any)` as SDK is arguable; the DOM and config cases are not. Second check: All quoted lines exist at the cited numbers (ui-table.ts:78,99, ui-details.ts:79, ui-events.ts:210, queue-browser/module.ts:173, connections/module.ts:231, kernel.ts:133). docs/contributing.md:77 says 'No new any types (except at the Solace SDK interface)', so DOM-node and config 'any' do violate it. But the rule is about NEW any, the reviewer did not show these were added since the baseline, and the message-row 'm: any' is arguably SDK-adjacent (state.js types StoredMessage as Record<string, any>). The core (DOM and config any outside the SDK) survives; the 'widespread' framing is slightly overreaching.

Why it matters: The PR checklist rule is not held, and `any` on DOM nodes hides real typos from the tsc gate.

Change: Drop the annotations where the DOM type is inferred (querySelectorAll callbacks), type `dataset.id` as `string | undefined` with one local, give applyConfig a `Partial<SavedConfig>` or `unknown` plus a guard, and declare a `Window` augmentation for jszipLoaded and solace. Leave the SDK-facing `any`.

#### CR-0197 [minor] [new] provisioned-mode.md says every gateway variable carries the SMU_ prefix and an unprefixed name is refused, but LOG_LEVEL, USERS_FILE, CONNECTIONS_FILE, STORE_KEY_FILE, APP_DIR and CONFIG_FILE are unprefixed and are read or only warned about

Location: docs/provisioned-mode.md:174, docs/provisioned-mode.md:183, go-web-proxy/main.go:183, go-web-proxy/configfile.go:257-268, docs/deployment.md:178, docs/deployment.md:198
Confidence: verified
Evidence:

    go-web-proxy/main.go:183: 	level, err := parseLogLevel(envOr("LOG_LEVEL", levelName(d.logLevel)))
    go-web-proxy/configfile.go:267: 	{"ADMIN_PASSWORD", "SMU_ADMIN_PASSWORD"},
    go-web-proxy/configfile.go:268: 	{"ADMIN_PASSWORD_FILE", "SMU_ADMIN_PASSWORD_FILE"},

provisioned-mode.md:174 ends 'Every variable carries the `SMU_` prefix; a start with an unprefixed name set is refused'. 1. LOG_LEVEL is read unprefixed and applied (main.go:183), and provisioned-mode.md:183 itself says the log level is 'the same as in Gateway mode'; deployment.md:178 correctly says 'Every gateway variable except LOG_LEVEL carries the SMU_ prefix'. 2. The refused set is only the nine names in renamedEnv (configfile.go:257-268). 3. The same paragraph says a deployment that sets USERS_FILE, CONNECTIONS_FILE or STORE_KEY_FILE 'starts with a warning', which contradicts 'refused' for unprefixed names (deployment.md:198 and configfile.go removedInUse agree with the warning).

Why it matters: An operator reading this page sets LOG_LEVEL=SMU_... or believes any unprefixed name stops the start, and a stale USERS_FILE that only warns is mistaken for a refusal.

Change: In provisioned-mode.md:174 replace the last sentence with: 'Every variable except `LOG_LEVEL` carries the `SMU_` prefix; the nine old unprefixed names are refused, and the other retired names only warn: see deployment.md#variables-and-keys-the-gateway-refuses-or-ignores.'

#### CR-0198 [minor] [new] provisioned-mode.md says every gateway request body is capped at 64 KiB, but a backup import body may be up to 8 MiB

Location: docs/provisioned-mode.md:435, go-web-proxy/backup_api.go:36-37, go-web-proxy/backup_api.go:336, go-web-proxy/backup_api.go:400, go-web-proxy/storecrypt.go:38, go-web-proxy/managed.go:359-361
Confidence: verified
Evidence:

    docs/provisioned-mode.md:435: | Request size | The session is checked before any body is read. Every gateway request body is capped at 64 KiB, with unknown fields and trailing data rejected; a relayed SEMP v1 request is capped at 1 MiB. |
    go-web-proxy/backup_api.go:37: const maxImportBytes = maxStoreFile
    go-web-proxy/backup_api.go:336: 	if !decodeJSONLimit(w, r, &body, maxImportBytes) {
    go-web-proxy/storecrypt.go:38: 	maxStoreFile   = 8 << 20 // read cap, checked before decrypting

The import preview and import handlers decode with decodeJSONLimit(..., maxImportBytes) (backup_api.go:336 and :400), and maxImportBytes is maxStoreFile = 8 MiB (storecrypt.go:38), the one body that 'carries a file' (managed.go:359-360). The security-model row states 64 KiB for 'every' body.

Why it matters: A reviewer sizing a reverse-proxy body limit or a DoS budget from this table is off by 128 times for the import endpoints.

Change: Reword provisioned-mode.md:435 to 'Every gateway request body is capped at 64 KiB, except a backup import (and its preview), which may carry a backup file of up to 8 MiB; unknown fields and trailing data are rejected; a relayed SEMP v1 request is capped at 1 MiB.'

#### CR-0199 [minor] [new] README Gateway try-out does not mention that a wss or https broker needs its CA mounted in /tls/trust because the image ships no root CAs

Location: README.md:53-58, docs/deployment.md:172, go-web-proxy/tls.go:193-198
Confidence: verified
Evidence:

    README.md:53: The image includes the Solace JavaScript API and JSZip, so nothing else is needed. To try the newest release:
    go-web-proxy/tls.go:194: 	pool, err := x509.SystemCertPool()
    go-web-proxy/tls.go:197: 		pool = x509.NewCertPool()

The README try-out runs the image with only a /tls volume. The runtime stage is FROM scratch with no ca-certificates, so SystemCertPool is empty and buildTrustPool starts from an empty pool (tls.go:194-198); deployment.md:172 says 'the gateway verifies every broker it connects to, and the image ships no root CAs. Put each CA ... in /tls/trust/'. A user who follows the README, opens the page and connects to a broker over wss/https gets a certificate verification failure; only plain ws/http works out of the box. README.md:60 and the Gateway section do not point at the trust directory. Second check: The omission is real: the README try-out runs :latest with only a /tls volume; the runtime stage is FROM scratch and a grep of docker/Dockerfile finds no ca-certificates copy; tls.go:194-198 starts from an empty pool; deployment.md:172 says the image ships no root CAs and CAs go in /tls/trust. A wss/https broker would fail verification. Overreach: 'nothing else is needed' at README.md:53 is scoped to the Solace JS API and JSZip libraries, not to broker trust, so the sentence itself is not false; and the README never claims TLS brokers work out of the box. The gap is a missing hint, not a wrong statement.

Why it matters: The first thing a new user tries fails for any TLS broker, and the README gives no hint of the one extra step the deployment guide documents.

Change: In README.md after line 58 add one sentence: 'To connect to a broker over wss or https, mount its CA into /tls/trust (see deployment.md#tls-and-trusted-cas); for a lab, add -e SMU_SSL_SKIP_CERT_VERIFY=true.' Also soften 'nothing else is needed' at README.md:53 to refer to the libraries only.

#### CR-0092 [nit] [open] Non-ASCII glyphs were added on lines changed since d2751b1 (CLAUDE.md, two test comments)

Location: CLAUDE.md:41, CLAUDE.md:66, CLAUDE.md:84, tests/mock-broker/gateway/throttle.test.ts:11, tests/setup.ts:265
Confidence: verified
Evidence:

    tests/mock-broker/gateway/throttle.test.ts:11:  * side runs the same file: go-web-proxy/throttle_test.go >
    tests/setup.ts:265:     // true so suites exercise the normal path -- the refusal branch is driven by the

The docs part of the old finding is fixed: no tracked file under docs/ (except the untracked improvement-plan.md) has a non-ASCII byte now. A scan of `git diff d2751b1..HEAD` for added lines with bytes above 0x7F finds CLAUDE.md lines 41, 66 and 84 (an em dash each), tests/mock-broker/gateway/throttle.test.ts:11 (U+203A) and tests/setup.ts:265 (an em dash). The rule is 'plain ASCII ... convert only what you are already editing'. These lines were edited and kept the glyphs.

Why it matters: Style only; the glyphs survive badly in logs and PowerShell 5.1, which is the stated reason for the rule.

Change: Replace with `--` and `>` on the five lines. Leave the older CLAUDE.md lines alone (they were not edited).

#### CR-0200 [nit] [new] User guide says Save All Config saves all connection fields without saying passwords are not saved

Location: docs/user-guide.md:150, src/modules/connections/module.ts:387-409
Confidence: verified
Evidence:

    docs/user-guide.md:150: - **Save All Config** -- saves all connection fields to browser localStorage. If localStorage is unavailable or its quota is exceeded, an error toast appears instead of a success toast.
    src/modules/connections/config.js:17: // Obfuscation -- NOT encryption. Browser storage is inherently untrusted;
    src/modules/connections/module.ts:394:                 user: els.elSolUser.value,
    src/modules/connections/module.ts:407:                 user: els.elSempUser.value

The Save handler builds the config from host, protocol, port, urlPath, vpn, user, auth mode, retry settings, max messages, client name id and the SEMP user. It reads no password field (module.ts:387-409). config.save writes OBF1: plus base64(XOR(json)) with a fixed key under 'solace_utility_config' (config.js:80-83). That is good behaviour, but the guide's 'all connection fields' wording makes a reader think passwords are saved, or that the file is private. In OAuth mode the Access Token is the 'user' field and is saved in the obfuscated blob (the cfg.user assignment at module.ts:394 holds the access token when authMode is oauth). The guide does not say so. Second check: The Save handler (module.ts:387-409) reads no password field, and config.js:17 says the blob is obfuscation, not encryption; docs/user-guide.md:150 says 'saves all connection fields' without saying passwords are not saved. That small wording gap holds. The OAuth claim is wrong. docs/user-guide.md:107 says in OAuth mode the Username field becomes 'Client ID' and Password becomes 'Access Token'. So cfg.user (module.ts:394) holds the Client ID, and the access token sits in the password field, which is never saved. No bearer token reaches localStorage. docs/developer-guide.md:220 already notes values are 'obfuscated at rest'. What survives is a one-line doc clarification that passwords are not saved.

Why it matters: Users cannot tell whether a password sits in localStorage. In OAuth mode a bearer access token is saved under a reversible fixed-key XOR that the docs never mention.

Change: In docs/user-guide.md:150 state that passwords and the SEMP password are never saved and must be retyped, and that the stored value is obfuscated, not encrypted. Decide whether the OAuth Access Token (held in the user field) should be excluded from the saved config when authMode is oauth, and document that decision.

#### CR-0201 [nit] [new] History wording, a plan reference and misplaced comment blocks remain in code comments and test titles

Location: src/modules/queue-copy/service-copy.ts:376, src/modules/queue-copy/service-copy.ts:451, src/modules/queue-copy/service-copy.ts:18, src/modules/queue-copy/ui-modal.ts:285-297, src/modules/queue-copy/module.ts:516-521, src/mock-broker/gateway/index.ts:85-92, src/mock-broker/gateway/backup.ts:400, src/mock-broker/gateway/settings.ts:56, src/mock-broker/gateway/settings.ts:125, src/mock-broker/gateway/settings.ts:341, tests/mock-broker/gateway/restart.test.ts:134-142, tests/mock-broker/gateway/restart.test.ts:9-12, src/modules/queue-browser/ui-events.ts:185, tests/core/components/queue-picker/picker.test.ts:732-733
Confidence: verified
Evidence:

    src/modules/queue-copy/service-copy.ts:376:             // for a debug log; the `?? '(no-id)'` fallback was cosmetic.
    src/modules/queue-copy/service-copy.ts:451:                 // (idleTimer !== null) was purely cosmetic -- every pause path
    src/modules/queue-copy/service-copy.ts:18:  * `./service-copy` continue to work. The value definitions live in
    src/modules/queue-copy/ui-modal.ts:285: /**
    src/modules/queue-copy/ui-modal.ts:286:  * Modal Start (Copy/Move) click handler. Reuses the primary session when the
    src/modules/queue-copy/ui-modal.ts:297: /**
    src/modules/queue-copy/module.ts:516:         // After the connections module switches the primary VPN at queue-copy's
    src/modules/queue-copy/module.ts:521:         /**
    src/mock-broker/gateway/index.ts:85:     /** Absent in a snapshot from a build before Backup & Restore. */
    src/mock-broker/gateway/index.ts:87:     /** Absent in a snapshot from a build before two-factor sign-in. */
    src/mock-broker/gateway/index.ts:92:     /** Absent in a snapshot from a build before the TLS console. */
    src/mock-broker/gateway/backup.ts:400:     /** Absent in a snapshot from a build before the schedule had a version. */
    src/mock-broker/gateway/settings.ts:56: /** The tls keys earlier releases kept in config.yaml; the paths are environment variables now, so a file that holds one is read and the key dropped. */
    tests/mock-broker/gateway/restart.test.ts:11:  * Also the settings file without the TLS paths, which are environment
    tests/mock-broker/gateway/restart.test.ts:12:  * variables now, and tls.insecureSkipVerify, which applies at once.

CLAUDE.md bans 'was / no longer / previously' wording in code comments. service-copy.ts:376 and :451 describe removed code ('fallback was cosmetic', 'guard was purely cosmetic'); :18 explains a re-export kept so older imports 'continue to work'. Separately, ui-modal.ts:285-296 is the JSDoc of handleModalStart but sits directly above the DESTINATION GATE JSDoc of destinationRefusal (two stacked blocks, the first attached to the wrong function), and module.ts:516-520 is the description of the copy:vpn-switched handler but sits above the rbac:changed JSDoc.

Why it matters: Comments mislead a reader about which function they describe and carry history that git already holds; both break the written comment rules.

Change: Reword service-copy.ts:376 and :450-452 to state the current behaviour only (or drop them), reword :18 to say what the re-export is for, move the handleModalStart JSDoc down onto handleModalStart (ui-modal.ts:329), and move the module.ts:516-520 comment onto the copy:vpn-switched handler.

#### CR-0202 [nit] [new] Four small errors in the operator docs: a table row cut off by a blank line, a bullet printed twice, ':latest' said to move on every release, and a link said to be conditional that is always shown

Location: docs/provisioned-mode.md:166-168, docs/user-guide.md:463, src/modules/connections/account.ts:46-50, docs/provisioned-mode.md:209, docs/provisioned-mode.md:189, docs/deployment.md:209-210, docs/deployment.md:144, docs/git.md:145, .github/workflows/tag.yml:209
Confidence: verified
Evidence:

    docs/provisioned-mode.md:167:
    docs/provisioned-mode.md:168: | `audit.onFailure` | `continue` | `continue` unless losing an audit record is worse for you than refusing changes. `refuse` stops every change to users, connections, settings and the backup schedule (`503 audit_unavailable`) while the audit log cannot be written, until it can; sign-ins and reads carry on.
    docs/user-guide.md:463: While you are signed in, the sidebar footer shows your username (tagged *admin* for an administrator) above the Client and SEMP lights, with three controls: **Change password** (the key icon: the gateway's password page), **Two-factor sign-in** (the lock icon, shown only while your gateway uses two-factor sign-in) and **Sign out** (the exit icon). They stay there on every page and while you are connected; signing out while connected disconnects first. In a collapsed sidebar only the icons show.
    src/modules/connections/account.ts:47: 			element.classList.toggle('hidden', !user);
    src/modules/connections/account.ts:50: 			role.classList.toggle('hidden', !user?.admin);
    docs/deployment.md:209: - **Restarting from the console:** in Provisioned mode an administrator can press **Restart gateway** on Gateway Settings. The gateway shuts down as for `SIGTERM` and starts its own program again in the same container, with the same arguments and environment, so the container and its volumes stay. If it cannot start itself again it logs why and exits with status 1, and the container's restart policy (`restart: unless-stopped` in the compose files) takes over. A platform that has no in-place start (a non-Unix build) exits with status 0 instead.
    docs/deployment.md:210: - **Restarting from the console:** in Provisioned mode an administrator can press **Restart gateway** on Gateway Settings. The gateway shuts down as for `SIGTERM` and starts its own program again in the same container, with the same arguments and environment, so the container and its volumes stay. If it cannot start itself again it logs why and exits with status 1, and the container's restart policy (`restart: unless-stopped` in the compose files) takes over. A platform that has no in-place start (a non-Unix build) exits with status 0 instead.
    docs/deployment.md:144: `ghcr.io/solacelabs/solace-msg-utility` serves every container mode. Every release publishes `:<major>.<minor>.<patch>`, `:<major>.<minor>`, `:<major>` and `:latest`, for `linux/amd64` and `linux/arm64`. Pin a full version in production. The Release notes quote the image's digest, and a tag only ever moves to an image that passed the vulnerability scan.
    .github/workflows/tag.yml:209:             type=raw,value=latest,enable=${{ needs.plan.outputs.latest == 'true' }}

1. docs/provisioned-mode.md:167 is a blank line inside the Audit settings table, so the audit.onFailure row at line 168 renders as a paragraph of pipes. 2. docs/deployment.md:209-210 prints the Restarting-from-the-console bullet twice. 3. docs/deployment.md:144 says every release publishes :latest; the tag workflow moves it only for the highest release (.github/workflows/tag.yml:209). 4. docs/user-guide.md:463 says the Two-factor link is shown only while the gateway uses two-factor; two-factor has no off mode and the link is always rendered, as docs/provisioned-mode.md:209 says.

Why it matters: Small, but the first two are visible on the rendered page and the last two contradict the code.

Change: Remove the blank line at provisioned-mode.md:167; delete one of the two bullets at deployment.md:209-210; say :latest follows the highest release; say the link is always shown.

#### CR-0203 [nit] [new] Kernel is a class although the house rule and the developer guide say there are no classes

Location: src/core/kernel.ts:24, docs/developer-guide.md:500, docs/architecture.md:1077
Confidence: verified
Evidence:

    src/core/kernel.ts:24: export class Kernel {
    docs/developer-guide.md:500: - One concern per file (not one class per file: there are no classes).
    docs/developer-guide.md:501: - Factory functions over classes; module-scoped state lives in closures, not global singletons. Modules receive their dependencies through `AppContext`.
    docs/architecture.md:1077: | Micro-kernel | Custom Kernel class | Modules can be added/removed without touching core |

CLAUDE.md anchor 4: 'Factory functions, not classes -- state lives in closures.' developer-guide.md:500 states there are no classes. src/core/kernel.ts:24 declares `export class Kernel` (instantiated with `new Kernel(...)` in tests/core/kernel.test.ts and src/main.ts) and architecture.md:1077 calls it a 'Kernel class'. The two docs disagree with each other and with the tree. The only other classes in src/ are Error subclasses in src/mock-broker/gateway (strict.ts:11, backup.ts:52), which are not a problem.

Why it matters: Either the rule or the Kernel is wrong, and a contributor reading the guide gets a false statement about the codebase.

Change: Either convert Kernel to a createKernel() factory or record the exception: say in CLAUDE.md anchor 4 and developer-guide.md:500 that Kernel is the one class and why, and fix the 'there are no classes' sentence.

#### CR-0204 [nit] [new] A variant header cites a doc heading that does not exist, and the kitchen-sink variant is documented as 'every module' while omitting queue-discovery

Location: src/variants/no-queue-copy.ts:5-6, docs/architecture.md:566, src/variants/all-for-testing-only.ts:2, docs/developer-guide.md:260
Confidence: verified
Evidence:

    src/variants/no-queue-copy.ts:5: * module is never installed. See architecture.md -> "Module registration --
    src/variants/no-queue-copy.ts:6: * variant manifests".
    docs/architecture.md:566: ### Module registration: variant manifests
    src/variants/all-for-testing-only.ts:2: * Kitchen-sink variant -- every module, for test/QA builds only.
    docs/developer-guide.md:260:     all-for-testing-only.ts  # Kitchen-sink QA build -- every module, incl. the admin ones

The heading is 'Module registration: variant manifests' (colon), the comment quotes it with an em dash, so a search for the quoted title finds nothing. Separately, src/variants/all-for-testing-only.ts lists ten modules and not queue-discovery (grep of src/variants for queue-discovery has no hit), while its header and developer-guide.md:260 say 'every module'. architecture.md:156 and :603 do say queue-discovery is in no variant, so the docs contradict each other.

Why it matters: Minor doc drift; a QA build that is described as complete is not.

Change: Quote the heading as written, and say 'every module a variant can ship, except queue-discovery' (or add the module).

## Suspected (needs confirmation)

#### CR-0151 [minor] [new] Download Content types the saved file by the publisher's HTTP Content-Type and gives it no extension, so the sender of a message chooses the file type

Area: correctness
Location: src/modules/queue-browser/ui-details.ts:26-36, src/core/download.ts:12-25
Confidence: suspected
Evidence:

    src/modules/queue-browser/ui-details.ts:28:         const filename = `solace-message-${msg.id.replace(/[^a-zA-Z0-9-_]/g, '')}`;
    src/modules/queue-browser/ui-details.ts:31:             const type = msg.msgProperties['HTTP Type'] || 'application/octet-stream';
    src/modules/queue-browser/ui-details.ts:32:             ui.triggerDownloadBlob(new Blob([msg.bytes], { type }), filename);
    src/core/download.ts:20:     a.download = filename;

Download Content saves the payload under a name with no extension (ui-details.ts:28) in a Blob whose type is whatever the publisher put in the message's HTTP Content-Type (ui-details.ts:31-32); download.ts:18-22 clicks an anchor with that name. This applies to every attachment payload, text included, because msg.bytes is set for all of them. When a suggested file name has no extension, browsers add one from the MIME type, so a publisher who sets text/html, or a type the operating system maps to an executable, decides what kind of file lands in the user's downloads folder. The code path is confirmed; the browser behaviour is not tested here. docs/user-guide.md describes downloads as typed with the publisher's content type, so the typing is deliberate; the risk it carries is not stated.

Why it matters: The person downloading expects message data. Anyone able to publish to the queue chooses the type the browser and the operating system will treat it as.

Change: Always use application/octet-stream for the Blob and give the file a fixed neutral extension (for example .bin, or .txt when the payload is text); keep the publisher's content type as a line in the details pane and in Download Full. If payload previews are built (see the appendix), take the type and the extension from the detected kind instead.

To confirm: Publish one message with HTTP Content-Type text/html and one with application/x-msdownload, use Download Content in Chrome, Edge and Firefox, and note the extension of each saved file.

#### CR-0156 [minor] [new] The audit copy to stdout is written while holding the audit mutex, which is taken under the writer lock, so a blocked stdout stalls every change and recovery-code sign-in

Area: resilience
Location: go-web-proxy/audit.go:243-257, go-web-proxy/writer.go:36-40
Confidence: suspected
Evidence:

    go-web-proxy/audit.go:243: 	a.mu.Lock()
    go-web-proxy/audit.go:244: 	defer a.mu.Unlock()
    go-web-proxy/audit.go:255: 	if set.stdout {
    go-web-proxy/audit.go:256: 		_, _ = a.stdout.Write(line)

record holds a.mu for the file write and the stdout write. The ok audit line of a change is an afterCommit hook, so it runs under the writer slot. If stdout is a pipe whose reader is slow or stuck (a log driver under back-pressure), Write blocks with a.mu and the slot held. Every later Do waits on the slot (it gives up only when its client goes away) and every other audit record waits on a.mu, including access lines on the dial and relay paths. The stdout error is also discarded.

Why it matters: A stuck log pipe turns into a gateway-wide stall of admin writes and recovery-code sign-ins, rather than a lost copy.

Change: Write the stdout copy after releasing a.mu (or through a bounded channel with a drop-and-count policy), and keep the file write as the only thing done under the lock.

To confirm: Whether stdout can block in the deployed log setup (container log driver with a full buffer); not run.

#### CR-0160 [minor] [new] Messages re-delivered after the SDK re-binds a browser are ingested again with the same id (no de-duplication), inflating the list and evicting real messages from the moving window

Area: resilience
Location: src/modules/queue-browser/state.js:111-129, src/modules/queue-browser/service-events.ts:261, src/modules/queue-browser/service-events.ts:15-30
Confidence: suspected
Evidence:

    src/modules/queue-browser/state.js:116: if (store.length >= state.maxMessagesPerQueue) {
    src/modules/queue-browser/state.js:129: store.push(message);
    src/modules/queue-browser/service-events.ts:261: ingestMessage(queueName, m);

ingestMessage pushes every MESSAGE event. onBrowserUp does not clear the store, and the code relies on the SDK re-binding by itself on retryable conditions and firing UP again. A re-bound queue browser starts browsing again from the head of the queue, so the same guaranteed message ids arrive a second time and are appended next to the first copies; the table gets duplicate data-id rows, the counts double and the oldest entries leave the window.

Why it matters: After a broker-side rebind the list may show each message twice and lose older ones; selection and delete by id then act on both copies.

Change: In onBrowserUp, when the store for the queue is non-empty (a re-UP), clear the store, displayedMessages and the table before messages arrive; or skip an id that is already in the store in ingestMessage.

To confirm: Check in the SDK flow FSM whether a rebound QueueBrowser restarts from the first message, or run a real-broker test that forces QUEUE_SHUTDOWN or an admin disable/enable of egress and watch the count.

## Dynamic checks

None run by this review. The owner ran the project's own gates on this tree shortly before it; their logs are in scripts/logs/.

- `./scripts/dev.sh full`, 2026-11-16 11:46 to 11:48 +0800, every task OK: build; vet (tsc over src and tests, ESLint, go vet, gofmt); test and mock (both left to cov in the same invocation, as their logs say); cov (web 100% on all four metrics; `go test -race -count=1` with coverage, total 98.8%); image; scan (0 findings); graphify.
- `./scripts/dev.sh e2e`, 11:59 +0800: 44 passed, 0 failed.

The tree at those runs is the tree committed as 5cbdc2d. shellcheck, actionlint, hadolint, staticcheck and golangci-lint are not installed on this machine, so no further check was offered.

## Fixed since last report

- CR-0001 Sign-in throttle is check-then-act: parallel guesses all pass loginWait before any failure is recorded - Sign-ins for one account now run one at a time: throttle.go:113-146 loginTurn holds a per-user token until the failure is recorded (callers defer release, pages.go:275, 411, 644, 749, 826), and checkTurn (pages.go:216-226) takes the turn before loginWait, so queued guesses meet the first failure's block. Pinned by pages_test.go TestLogin_ParallelGuessesForOneAccountQueue and throttle_test.go...
- CR-0002 A half-supplied TLS pair (only tls.key or only tls.crt) is overwritten by a generated pair: deliberate in code and pinned by a test, but docs/deployment.md:154 says a pair is generated only 'With neither' - loadOrGenerateServerCert now refuses to start when exactly one of the two files exists, naming both (go-web-proxy/tls.go:63-69). Pinned by tls_test.go TestLoadOrGenerateServerCert_RefusesHalfAPair. docs/deployment.md:171 says half a pair stops the start.
- CR-0005 Hasher concurrency is runtime.NumCPU(), so a burst of sign-ins can take every CPU, contrary to its stated purpose - managed_routing.go:153-155 now sizes the hasher as max(runtime.GOMAXPROCS(0)/2, 1), which honours the container CPU quota and leaves half for the relay and sockets; password.go:368-370 documents it.
- CR-0006 Import that fails after an earlier section was written answers a bare 500, so the admin cannot tell what was applied - importBackup now stages users, connections and settings in ONE writer.Do (go-web-proxy/backup_api.go:442-486 calling stageImport at :467 and stageSettings at :473); the journaled commit writes all files together or none, and memory is swapped in one publish. A failure answers store_write_failed with 'nothing was imported' (backup_api.go:391-394 comment, writeStoreError), and sessions are dropped only after Do...
- CR-0007 A session created after a concurrent revocation (password reset, demotion, deletion) survives it; for a deleted user /solAdmin loops - Sessions are created through store.ifUnchanged (store.go:676-684, pages.go:234-239 and 664, 851) under the store read lock while publish takes the write lock (store.go:796-805), and dropUser runs after the commit (managed.go:704, 771, 790), so a sign-in either refuses on the changed hash or its new session is dropped. gateAdmin now drops the session and cookie of a deleted user (pages.go:942-947), ending the...
- CR-0008 SEMP relay forwards If-None-Match/If-Match but turns the broker's 304 into a 502 upstream_unavailable - The allow-list is now only Accept (go-web-proxy/relay.go:45) and the header comment at relay.go:37-44 says no conditional header passes and no ETag is handed out, so the relay never sends a conditional request and a broker 304 cannot arise from it.
- CR-0012 A missing app bundle starts the gateway anyway and serves 404s, and serveIndex logs nothing - newPWAHandler returns an error and stops the start when the mode's bundle cannot be read (go-web-proxy/proxy.go:135-139, ready at 146-157), main.go:513-517 logs and returns it, /hosted answers 503 (proxy.go:55-58), and serveIndex logs a warn line naming the file (proxy.go:195). Pinned by proxy_test.go TestPWAHandler_UnusableBundleStopsTheStart and TestPWAHandler_BundleGoneAtRequestTimeIsLogged.
- CR-0013 Import merge reads the stores outside their lock, so a concurrent admin edit before replaceUsers/replaceConnections is lost - Import now runs entirely in one writer transaction: backup_api.go:442 Do, tx.check of the paths, basis compare against the current seqs at 459-465 (stale basis refused), and stageImport (store.go:1349-1403) merges on usersNow/connsNow read inside the lock. replaceUsers/replaceConnections no longer exist, and saveUser/saveConnection take the same writer slot, so a concurrent edit makes the basis stale instead of...
- CR-0014 Concurrent schedule saves can leave the in-memory schedule different from backup.yaml - setSchedule and removeSchedule now run inside b.store.wr.Do (go-web-proxy/backup.go:639 and :697); the file is staged and the memory swap happens in tx.onPublish (backup.go:671-675 and :713-717) under the single writer lock, so two saves cannot leave disk and memory different.
- CR-0015 solace-client: a connect() on a client with a session lets the old session's DISCONNECTED handler dispose the new session - solace-client.ts:134-137 refuses a connect while one is in flight (CONNECT_IN_PROGRESS). Each handler is registered through own() (261-270) which compares session !== s and only disposes the replaced session, so an old DISCONNECTED cannot dispose the new one or fire its hooks.
- CR-0016 The VPN-switch flow is implemented twice and the managed copy has already drifted from the documented navigation contract - Both entries now create one shared switch through createVpnSwitch (src/modules/connections/vpn-switch.ts:75-209). It is used at module.ts:632 and managed-panel.ts:398. finish, waitFor and the disconnect-then-connect block each exist once (vpn-switch.ts:89-122, 188-206). The managed failure path now navigates and shows the reason: switchFrom calls loadSelf at L195 after the confirm, and fail() calls mode.showError...
- CR-0017 The production SEMP client contains a hard-coded demo branch that rejects any host containing 'untrust.com' - grep of src/ for 'untrust' finds nothing outside src/mock-broker; semp-client.ts connect (probe at lines 96-122) has no host-substring branch.
- CR-0020 Module CSS selection is a hand-kept list separate from the variant manifests; the kitchen-sink build ships the admin modules unstyled - vite.config.ts no longer has ADMIN_CSS_VARIANTS or cssVariantRedirect. scripts/module-registry-plugin.mjs:245-246 imports each active module's styles.css from the manifest. src/css/main.css:16-26 imports only the design system and core component sheets, and no admin or queue-discovery sheet. all-for-testing-only therefore gets the admin modules' CSS from its own manifest.
- CR-0021 The variant manifest is parsed by a regex stricter than TypeScript; an unquoted module id compiles but is never bundled - scripts/module-registry-plugin.mjs:103 now reads ids with `/['"]?([\w-]+)['"]?\s*:/g`, quotes optional like the entries regex at :118. The doc comment at :93-96 states this. An unquoted id is bundled instead of failing at run time.
- CR-0022 Docs instruct operators to set CONN_MODES=managed, a value the gateway rejects at startup - docs/rbac-variant-plan.md no longer exists and no doc or code names CONN_MODES=managed (grep). docs/architecture.md:710 and :777 now say `SMU_CONN_MODES=provisioned`, and the value main.go:287-289 (validateConnModes) accepts is direct, provisioned or both; deployment.md:183, :195 and provisioned-mode.md:123-127, :453, :467 use the accepted values.
- CR-0023 Provisioned broker connections are hard-wired to TLS (https SEMP, wss SMF), but the connection record and the docs never say so - Connection records carry semp.scheme and client.scheme (go-web-proxy/store.go sempTarget/smfTarget use orTLS), the relay and gate build the URL from target.scheme (relay.go:151-157, smf.go:119-125), and docs/user-guide.md:579-587 documents the Scheme fields. Pinned by relay_test.go TestRelay_UsesTheConnectionsScheme and smf_test.go TestSMF_UsesTheConnectionsScheme.
- CR-0024 SSL_INSECURE_SKIP_VERIFY is parsed leniently while HOSTED and LOG_LEVEL are strict; a typo is silently ignored - The variable is now SMU_SSL_SKIP_CERT_VERIFY and is parsed strictly: parseInsecureSkipVerify accepts only unset, false or true (go-web-proxy/main.go:238-246), loadConfig refuses anything else at first start with the variable named (main.go:191-194), and the override comparison mirrors it (configfile.go:289-294). The old SSL_INSECURE_SKIP_VERIFY name stops the start (configfile.go:263, 665-667).
- CR-0025 AppContext.config is an untyped, unused field sourced from a global that nothing sets - AppContext in types.ts has no `config` field and kernel.ts builds the context (190-203) without one; APP_CONFIG appears nowhere in src.
- CR-0026 The SSL_CERT_FILE name collides with Go's own trust-store variable, so 'env var ignored, config.yaml wins' is not true for it - The gateway's certificate variable is renamed SMU_SSL_CERTFILE (configfile.go:118, 260) and a start with SSL_CERT_FILE set is refused by checkRenamedEnv (configfile.go:259-285, called first in resolveConfig at :665), so Go's own SSL_CERT_FILE can no longer silently replace the upstream trust pool and the 'env var ignored' log can no longer be wrong for it.
- CR-0027 Live vs restart-only config keys are two independent hand lists with no check that every key is in one of them - go-web-proxy/live_test.go:181 TestFileConfig_EveryKeyIsClassifiedOnce reflects over fileConfig and liveSettings and fails unless each key is exactly one of live or restartOnlyKeys (live.go:75-80, now only hosted); docs/developer-guide.md 'Adding a gateway config.yaml setting' names it.
- CR-0028 Kernel.sempFetch encodes Basic auth differently from the semp-client probe (a second SEMP client): non-Latin-1 credentials throw, Latin-1 ones change bytes after connect, and its 401 teardown bypasses the connections module - Both the probe (semp-client.ts:96) and Kernel.sempFetch (kernel.ts:386) call basicAuthHeader (utils.ts:284), so they send the same bytes. The Direct form rejects non-ASCII with sempAccountError. On a kernel 401 the connections module listens for semp:disconnected and runs resetSempUi (module.ts:621-624). The queue-copy destination form is not validated, which is reported as a new finding.
- CR-0029 Queue-browser decodes binary payloads as Latin-1 strings (SDK version10 profile): UTF-8 text is garbled, the body filter misses non-ASCII terms, and every download of a payload with bytes >= 0x80 (PDF, PNG, UTF-8 text) is corrupted - payload.ts:28-39 attachmentBytes turns the Latin-1 string back into bytes and classifyAttachment (46-56) decodes UTF-8 with fatal:true; the stored bytes reach Blob (ui-details.ts:32), ZIP (ui-table.ts:245) and base64 JSON (ui-details.ts:48); tests/modules/queue-browser/payload.test.ts and service-events.test.ts:355 use 0x89 plus a multi-byte character.
- CR-0030 publisher.send throws synchronously on an invalid destination instead of settling { ok:false }; queue-copy then browses the whole queue and reports 'drained mid-run' - solace-publisher.ts:210-224 now wraps cloneMessage, setCorrelationKey and beforeSend in try/catch and returns { ok:false, error } via solaceErrorText; the form also refuses names the SDK would refuse (destNameProblem in service.ts, used by module.ts refreshStartEnabled), so a bad name never reaches a run.
- CR-0031 QueueBrowser-fallback verify fails any queue that takes over 10 s to browse: the bind timer is never cleared on UP - service-verify.ts:420-424 clears bindTimer on UP; bindTimer (477-479) now fires only while unbound; the v8 ignore and the commented guard are gone.
- CR-0032 Esc closes the Confirm Queue Copy dialog without cancelling: a running copy/move continues with no visible Cancel, and an un-aborted verify can overwrite a later one - ui-events.ts:273-276 adds a 'cancel' listener that calls preventDefault and cancelCopyModal, so Esc aborts a verify (ui-modal.ts:435-440, state.verify nulled so the stale .then returns at :151) or flags cancelRequested on a run (:442-446); the in-modal Refresh is disabled while a verify runs (:103), so no verify is superseded.
- CR-0033 Copy engine publishes through whichever destination session exists, not the one the form names: a connect that lands after the target changed redirects the run and dodges the destination gate - service-copy.ts:67-71 selectPublisher uses primaryPublisher only for Same broker + Same VPN and otherwise destPublisher only when destSessionTarget equals destTargetKey(form); module.ts destSolHooks.onConnected (inner lines ~190-205 of the module) discards a late session when destSolPending no longer matches the form, disposeDestSolConnection cancels a pending connect (ui-events.ts:137), and handleModalStart...
- CR-0034 SEMP and gateway requests after the connect probe have no deadline; startup awaits /hosted and /managed/me serially with the event bus held - kernel.sempFetch uses deadlineSignal (kernel.ts:397), semp-client later calls use it (semp-client.ts:126), managedRequest wraps the exchange in raceDeadline (managed-api.ts:84), and the /hosted probe uses raceDeadline with HOSTED_PROBE_TIMEOUT_MS (hosted.ts:68). Startup is bounded to about 10 s plus 30 s instead of unbounded; a stall ends in the inconclusive or signed-out view.
- CR-0035 Queue picker's fetch generation counters reset on every open, so a fetch from a closed picker writes into the next one - The picker now aborts the old listing on close and on a newer fetch (queue-picker/index.ts:170-171, 182-184, 232-234) and guards every write with abort.signal.aborted as well as the generation (L191, 207, 240, 253). An old fetch's controller was aborted by resolveAndClose, so it cannot write into a later picker even if the generation numbers repeat. The stale-state write and the cache eviction can no longer happen.
- CR-0037 queue-copy `state.job` is never reset (resetTransientState is dead code), so after the first run the rbac:changed destination teardown never runs - resetTransientState is now called on modal open (ui-modal.ts:65), on onComplete (:406) and in the runCopyJob catch (:419), so state.job is null once a run settles and the module.ts rbac:changed teardown (state.job check) runs again.
- CR-0038 alert() is used for user-facing errors and results, against the error-handling rule, and one message tells the user to check the console - grep for alert( over src returns no hit; ui-events.ts:297-302 reportDelete and ui-table.ts:220,261 use showToast; no message points at the console.
- CR-0039 Delete converts 64-bit guaranteed message IDs to Number before acking them; at or above 2^32 the SDK's ack encoder mangles a Number, so the ack targets a non-existent ID while the row disappears and the UI reports success - service.ts:195-199 acks with target._originalMsg.getGuaranteedMessageId() (the SDK's own id object), no Number() conversion.
- CR-0040 A browser that goes DOWN after UP stays registered: it holds one of the 3 binding slots and blocks re-binding the queue - service-events.ts:370-387 onBrowserDown calls dropBrowser (frees the slot and store), ui.removeBoundQueue and shows a warn toast naming the queue and reason; stale DOWN for an unbound queue returns early at :374.
- CR-0042 net/http server errors, handler panics included, are logged at INFO and dropped at the default WARN level - go-web-proxy/logging.go:189-206 recoverPanics logs 'handler panicked; answered 500' at ERROR and answers 500; main.go:536 wires it inside accessLog, main.go:546-548 documents that a panic no longer reaches ErrorLog; tests TestRecoverPanics_LogsAndAnswers500 and _LetsAbortHandlerThrough. The stack is DEBUG-only; reported as a separate new finding.
- CR-0043 User and connection changes in the admin API leave no log line naming who did it or to what, unlike settings, backups and imports - go-web-proxy/managed.go:65-72 wrap user, connection, settings and restart writes in audited(); recordOK (managed.go:282-295) writes an admin audit entry with actor, target and changed parts inside the commit; saveUser/deleteUser/saveConnection/deleteConnection log INFO lines with target (managed.go:377, 443, 464, 509, 569) via h.log(r), which carries user and client; serverError logs op and target as attributes...
- CR-0044 At the default WARN level the gateway logs none of its effective configuration, not even its version, and the access list is never logged at any level - go-web-proxy/logging.go:223-256 logStartup writes one INFO line on its own handler at every level, with version, mode, conn_modes, log_level, access.allow, access.trustedProxies, insecureSkipVerify, store key path and the login limits; called at main.go:455 (TestLogStartup_ShowsAtEveryLevel); tls.go:330 names both config.yaml and SMU_SSL_SKIP_CERT_VERIFY.
- CR-0045 WARN serves as the 'always show' audit level for routine successes, while equivalent security events stay at INFO - The standard was rewritten (logging.go:113-125, developer-guide Logging standard) so INFO is lifecycle, state changes and audit events; settings saved is INFO (settings.go:174), backup written INFO (backup.go:773); the always-on audit trail (audit.go, auth and admin categories never filtered) now carries sign-ins, changes, backups and exports regardless of LOG_LEVEL. Remaining inconsistency between INFO and WARN...
- CR-0046 Gateway refusal logging differs across equivalent paths: some denials and rate limits are silent, and some error lines omit the user and client - relay.go:140 and :145 now log the entitlement miss and the in-flight limit; pages.go:253/396 use clientLogger/requestLogger, which carry client and user; pages.go:420 logs a wrong current password; managed.go:65 puts op in an attribute and adds target and the acting user.
- CR-0047 The access log names the TCP peer instead of the resolved client, and records hijacked sockets as status 200 with 0 bytes - go-web-proxy/main.go:536 puts accessLog inside withClient, so proxy.go:131 logs through requestLogger with the resolved client and user; recordingResponseWriter.Hijack (proxy.go:164-174) sets status 101 and hijacked=true, shown as attribute hijacked (proxy.go:128-130).
- CR-0048 The documented health probe (/hosted) answers 200 while the app bundle cannot be served, and a missing index file returns 404 without a log line - go-web-proxy/proxy.go:49-58 hostedHandler answers 503 when pwa.ready() fails (TestHostedHandler_UnusableBundleIs503); serveIndex logs 'app bundle missing; answered 404' at WARN (proxy.go:195, proxy_test.go:447); newPWAHandler refuses to start without the mode's bundle (proxy.go:135-142).
- CR-0049 The sign-in and unauthenticated-request throttles fail closed silently when their tracking tables are full - All three full-table refusals now log: tableFull (throttle.go:183-189, at most one WARN per minute per table) is called from failureWait (174), recordFailure (248), allowUnauthenticated (300) and loginTurn (120).
- CR-0050 Failed SEMP list calls drop the HTTP status and the gateway's error code, and non-OK SEMP responses are rendered four different ways - semp-errors.ts:315-344 gives one text path. semp-discovery (231), QSE service (67) and queue-copy verify (174) all call sempErrorText, which uses the gateway code or 'HTTP <status>' without relying on statusText.
- CR-0051 SDK error text bypasses solaceErrorText in the queue browser and in parts of queue-copy and the publisher - service-events.ts:356,384 and service.ts:94 use solaceErrorText; ui-forward.js has no err.message path; queue-copy service-copy.ts and service-verify.ts no longer have e?.message hits in grep.
- CR-0053 Several failure paths swallow the cause without a developer log, or fall back silently - managed-api.ts:86 logs method, path and cause. hosted.ts logs each fallback. queue-browser ui-events.ts:92 logs the forward failure with message id and destination. The appProperties getter catch is a deliberate documented skip and config.js deobfuscate is documented as treating bad values as missing.
- CR-0054 Open-in-Browser and VPN-switch timeouts end with no signal to the user - waitFor arms a timer that calls fail() with a reason (vpn-switch.ts:115-122). fail() logs a warning, shows the reason on the Connections page unless the mode already did, and shows a 5 s warn toast (L104-112). This covers the 10 s disconnect wait and the 30 s connect wait (L132-133, 199-203). A failed connect ends the switch through connectFailed in both modes (module.ts:170, 179; managed-panel.ts:220). The...
- CR-0055 Bulk delete reports a partial failure as full success, and its failure text sends the user to the console - service.ts:19-24,220 DeleteResult carries requested, failed and the first reason; ui-events.ts:297-302 reportDelete reports both counts and the reason in an error toast; no console reference remains.
- CR-0056 Browser log lines have no consistent module tag and often omit the broker, VPN or queue they concern - solace-client.ts and semp-client.ts use logger.withTag and put the URL and VPN (target) in every lifecycle line (solace-client.ts:274-286, semp-client.ts:97-122); queue-browser and queue-discovery use tagged loggers with queue= and vpn= identifiers.
- CR-0057 queue-browser's forward modal reaches the DOM through document.getElementById instead of its container, because the module keeps module-scoped singletons - ui-forward.js:464 and :469 use els.listForwardMsgs.querySelector with data-cv attributes; no document.getElementById remains in queue-browser.
- CR-0058 Dead production code: an unused config module, a probe only tests call, an unused cap constant and unreachable branches - defaults.ts is now imported by semp-client, managed-profile, connections and queue-browser; probeHosted, MAX_MESSAGES_PER_QUEUE_LIMIT and the bulk-delete alert branch are gone and onForwardFailure takes a string. The plaintext 'true' branch (hosted.ts:82) remains but is documented in architecture.md and pinned by tests/core/hosted.test.ts, so it is deliberate.
- CR-0059 Commented-out defensive guards from the 2026-05-26 audit are still in three services - No commented-out guards remain in service-copy.ts, service-verify.ts or solace-publisher.ts (grep for commented if/let/return finds only a documented broker-bug line at service-verify.ts:346); the live invariants are stated in short comments (service-copy.ts:329-335, solace-publisher.ts:228-230).
- CR-0063 No linter or formatter is configured or gated, and the .js modules are not type-checked - task_vet now runs typecheck, typecheck:tests, eslint (npm run lint) and go vet plus a gofmt -l check that fails on any listed file (scripts/dev.sh:156-171, mirrored in scripts/dev.ps1:219-237); eslint.config.mjs exists; tsconfig.json:8 sets checkJs true.
- CR-0065 The 100% web coverage thresholds are never enforced by CI or the tag pipeline; only a local `cov` run checks them - ci.yml:78 and :83 run `all cov scan` on both runners and tag.yml gates calls ci.yml (tag.yml:162); tests/build/workflows.test.ts:158-164 pins the exact invocations; the tag.yml:9 header comment now lists mock and cov.
- CR-0066 The Go race detector is never run, so the gateway's only race test asserts nothing - scripts/dev.sh:193-194 and scripts/dev.ps1:263 run `go test -race -count=1` with CGO_ENABLED=1 (cov runs it, test skips when cov is queued, dev.sh:181); docs/testing.md:67 and :122 describe it as requiring the detector; store_test.go:2045-2047 now asserts seq 12 and 12 users after ten concurrent saves, and writer_test.go:396, totp_test.go:201 and pages_test.go:447 are concurrent tests with assertions. Residual:...
- CR-0067 Verify and copy are never tested with createQueueBrowser throwing; the call is unguarded and the modal drops the rejection - createQueueBrowser is wrapped in try/catch in service-verify.ts:370-379 and service-copy.ts:254-265, ui-modal.ts:144-149 and :408-420 add .catch handlers, and tests exist: service-copy.test.ts ('a createQueueBrowser throw completes the run with status=error and the reason') and service-verify.test.ts ('a createQueueBrowser throw resolves a failed verify result with the reason').
- CR-0068 The copy/move engine is never run against a realistic SDK (neither the demo broker nor the real SDK); its tests hand-drive mock handlers - tests/mock-broker/copy-flow.test.ts:1-130 runs verifySource and runCopyJob against the demo SDK and broker in copy mode, move mode and a PUBLISH_REJECTED case, asserting depths, payloads and onComplete status.
- CR-0069 The global fetch mock keeps its implementation and unconsumed *Once values across tests; setup.ts re-installs every other global but this one - tests/setup.ts:46-47 keeps fetchMock, and tests/setup.ts:295-296 calls fetchMock.mockReset() and reinstalls it on globalThis in the global beforeEach.
- CR-0070 resetQueueBrowserState() misses runtime-added state fields, and ui-forward.test.ts hand-resets instead of calling it - tests/helpers/resetQueueBrowserState.ts:21 now clears selectedMessage and state.js:41 declares it. selectedForwardMsg no longer appears in src or tests. tests/modules/queue-browser/ui-forward.test.ts:6,17 imports and calls the helper.
- CR-0072 The RBAC glob conformance vector is copied by hand into two tables and has already drifted - The glob table is a `glob` array in go-web-proxy/testdata/contract/validation.json:36-55 (including the a*a no-overlap rows), read by rbac_test.go:11-27 via readContractVectors (contract_test.go:477, DisallowUnknownFields satisfied by the Glob field) and by tests/core/rbac.test.ts:16 and :44; no hand-copied table remains.
- CR-0073 routes.test.ts completeness check keys on the first path segment, so new routes under an existing segment need no row - tests/mock-broker/gateway/routes.test.ts:76-97 routeKeys extracts method plus path template from managedRequest calls. :241-246 compares called and covered sets keyed by norm(key), and a call count mismatch throws.
- CR-0074 Two shipped code sets are outside any coverage measurement: the demo tree (Release bundles) and the gate scripts - vitest.config.ts:34-44 now includes scripts/check-bundles.mjs, module-registry-plugin.mjs, npm-audit-gate.mjs and e2e-lib.mjs in coverage, under the 100% thresholds at :56-61. src/mock-broker stays out of the gate (:54), but vitest.mock.config.ts:86-91 measures and reports it in the `mock` task, which is the remedy the ledger suggested.
- CR-0075 docs-links test fails on a fresh checkout because docs/improvement-plan.md is git-ignored, so the next tag's gates go red on both runners - tests/build/docs-links.test.ts:17-20 lists docs through `git ls-files --cached --others --exclude-standard`, so the git-ignored docs/improvement-plan.md (.gitignore:42) is not checked; no tracked .md links it (grep of *.md found no link) and docs/test-report.md no longer exists.
- CR-0076 Tag format is never validated: any v* tag (pre-release or malformed) moves `latest`, is marked the Latest GitHub release and redeploys Pages; the no-tags guard can never fire - plan validates the tag with grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' (tag.yml:111-114) before the shape step; latest is computed from the highest vX.Y.Z tag (117-120); metadata-action uses flavor latest=false and type=raw,value=latest,enable=<plan latest> (199-209); gh release create passes --latest="$LATEST" (569); workflows.test.ts:139-154 pins all of it. A residual pages gap is reported as a new finding.
- CR-0078 Compose posture tests do not forbid every widening token, let extra security_opt entries through, and leave the e2e `gateway` service unpinned - tests/helpers/compose.ts:27-32 WIDENING now covers sysctls, unconfined, label disable, uts, cgroup, cgroup_parent, device_cgroup_rules, userns_mode and docker.sock. securityOpt() at :35-37 pins security_opt to exactly no-new-privileges=true (compose-files.test.ts:44). SERVICES (compose-files.test.ts:30-36) now includes the e2e gateway, and e2e-lib.test.ts:400-401 and :442-443 apply the same helpers to browser and...
- CR-0081 Dockerfile base images and syntax frontend are pinned by tag, not digest - docker/Dockerfile:1 is `docker/dockerfile:1.6@sha256:...`, :87 is golang:1.27.4-alpine@sha256:..., :129 is node:26.8.1-alpine@sha256:.... All three references are digest-pinned, and the comment at :84-86 names Dependabot as the mover.
- CR-0082 Every compose file uses the deprecated `no-new-privileges:true` colon form instead of `no-new-privileges=true` - All seven services now use `- no-new-privileges=true` (docker-compose.yaml:45,91; compose.gateway.yaml:26; compose.provisioned.yaml:44; docker-compose.e2e.yaml:38,81,120). compose-files.test.ts:23 and :122-124 pin the = form and forbid the colon form.
- CR-0083 vite-build.mjs exits 0 when vite is killed by a signal, and emptyOutDir:false keeps a stale bundle for check:bundles to pass on - scripts/vite-build.mjs:300-303 exits 1 on a signal (`signal ? 1 : (code ?? 1)`) and prints why. :306-309 handles a spawn 'error' event. tests/build/vite-build.test.ts covers the signal and spawn-failure cases. emptyOutDir stays false (vite.config.ts:220), but the && chain in package.json:8 now stops at the failed pass, so check:bundles does not run on a killed build.
- CR-0084 The `vet` gate type-checks src/**/*.ts only: tests/, vite/vitest configs and the src .js files are never type-checked, so test fixtures typed as production types drift silently - task_vet runs `npm run typecheck:tests` (dev.sh:157, dev.ps1:220) over tsconfig.test.json, which includes tests/**/*.ts, vite.config.ts, vitest.config.ts and vitest.mock.config.ts (tsconfig.test.json:11-17); tsconfig.json:8 sets checkJs true for the src .js files.
- CR-0085 dev.ps1 buffers each command's output until it exits and validates task names with wildcard-tolerant, case-insensitive Get-Command -- both prescribed by the dev-script contract, so a cancelled Windows run can lose its log and `dev.ps1 b*` passes the upfront check - Invoke-Logged streams each line through one StreamWriter with AutoFlush and writes before the command exits (dev.ps1:91-106); task names are checked with -cnotcontains against $KnownTasks (dev.ps1:430-432), not Get-Command, so wildcards and wrong case are rejected as in dev.sh.
- CR-0087 Per-machine graphify artifacts and a stale nested graph are tracked in git - git ls-files lists only graphify-out/.graphify_labels.json, .graphify_root, GRAPH_REPORT.md, graph.html, graph.json and manifest.json, and nothing under go-web-proxy/. .graphify_python and .graphify_step_ast.py are untracked and ignored (.gitignore:56-57). go-web-proxy/graphify-out/ is ignored (:61), and the tracked .graphify_root now holds the relative `.`.
- CR-0088 Stale developer docs: contributing.md describes Go build-tag test variants that no longer exist; developer-guide.md says priority is set in src/registry.ts - docs/contributing.md:60 describes test as the web suite without tests/mock-broker plus Go once, no build-tag text (no `//go:build` except restart_unix/other); docs/developer-guide.md:310 and :451 put priority in the variant manifest read by src/registry.ts.
- CR-0089 test-report.md's 'Current files in the test tree' list is stale after the backup, icons, download and access-test suites were added - docs/test-report.md is gone (git ls-files docs); docs/testing.md carries no per-file inventory, and its count claim (45 Node-environment files, contributing.md:92) matches `grep -rl '^// @vitest-environment node' tests` = 45.
- CR-0090 Test titles and comments cite improvement-plan item IDs and plan scenario numbers (COV-5/6/10/11/12, scenario #n) - grep for COV-n, 'Scenario #', 'closes COV' over tests/ and src/ finds none; tests/integration/module-events.test.ts:133,172,202,225 describe titles are descriptive only; picker.test.ts:686 no longer cites COV-12. One unrelated plan reference in src/modules/queue-browser/ui-events.ts:185 is reported as a new finding.
- CR-0093 Property filter turns 0 and false values into '' so they never match - state.js:314 String(msg.msgProperties[foundStdKey]) and :323 String(msg.appProperties[foundKey] ?? '') keep 0 and false; tests/modules/queue-browser/state.test.ts:211 'matches a Priority 0 standard property'.
- CR-0094 queue-browser hides untested SDK event wiring behind a v8 ignore the house rules ban - src/modules/queue-browser/service.ts:73-77 area has no v8 ignore around the five browser.on registrations. tests/modules/queue-browser/service.test.ts:153-179 fires each handler through _handlers and asserts the queue name routing.
- CR-0095 solace-client ignores two SDK catches over test cost; the sibling catch is tested with the same mock - The connect() catch ignore is gone and covered by tests/core/services/solace-client.test.ts:603-620 'reconnect proceeds when the stale session.disconnect() throws'. The one remaining ignore, solace-client.ts:345-352 on disposeSession, now cites a sanctioned category ('SDK Session.dispose() does not throw; defensive catch on a trusted contract') and the reason is accurate.
- CR-0096 solace-publisher safeSet catch is ignored but reachable; the comment is stale and test-report says the ignore is gone - solace-publisher.ts safeSet (line 110 onward) has no v8 ignore. The remaining one at :273-279 is for removeListener with a sanctioned reason. tests/core/services/solace-publisher.test.ts:333-348 'a throwing content setter falls through to the next content source' covers the catch.
- CR-0097 registry setup checks are ignored with an unsanctioned category but can be reached with vi.doMock - src/registry.ts:27-50 has no v8 ignores, only comments pointing to tests. tests/registry.test.ts:95-120 'setup guardrails' proves both throws with vi.doMock of _active and virtual:module-registry.
- CR-0098 main.ts readyState branch is dead in every build, not just untestable in jsdom - src/main.ts:20-26 calls kernel.start() directly with no readyState branch and no v8 ignore. A grep for readyState in src/main.ts, CLAUDE.md and docs/contributing.md finds nothing.
- CR-0099 queue-picker post-loop supersession guards are reachable through its QueueSource input; the ignore comment is wrong - The post-loop guards at src/core/components/queue-picker/index.ts:207 and :256-ish no longer sit inside v8 ignore blocks. The comment at :203-206 is accurate. tests/core/components/queue-picker/picker.test.ts:1392 'source tail' describe holds cancel, Refresh and cancel-and-reopen tests for both VPNs and queues. The remaining ignore (:219-224) wraps the catch, which the ledger said to keep.
- CR-0100 ui-modal rAF guard is dead, and its ignore also hides the covered renderProgress call - src/modules/queue-copy/ui-modal.ts:377 now declares `let latestJob!: import('./state').CopyJob;` and :386 calls ui.renderProgress(els, latestJob) unconditionally with no ignore.
- CR-0101 DOMParser try/catch: ignored in parse.ts, but service-verify's copies are kept green by impossible throwing-parser stubs - All three try/catch blocks are gone: src/modules/queue-subscription-explorer/parse.ts:43, src/modules/queue-copy/service-verify.ts:254 and :297 call DOMParser directly. Grep of tests/modules/queue-copy and tests/modules/queue-subscription-explorer finds no DOMParser stub tests.
- CR-0102 try/catch around SDK message getters that only read fields: ignored in one helper, tested with a throwing fake in its sibling - src/modules/queue-copy/service.ts:10-16 getOriginalIdHint has no try/catch and no ignore. src/modules/queue-copy/service-verify.ts:497-503 msgIdToString has no try/catch. The 'returns null when getGuaranteedMessageId throws' test is gone. Only the optional `?.` calls and the 'handles missing getters' test (service.test.ts:40) remain, which the ledger marked optional.
- CR-0103 Dead fallbacks and presence guards on stored-message fields that ingest always sets - state.js:255 uses msg.content directly, :283 dest.getName() without fallback, :310 and :320 read msgProperties and appProperties without presence guards; ui-events.ts:23, ui-details.ts:129 and ui-forward.js:401 drop the '' fallbacks.
- CR-0104 Kept ignores carry stale or inaccurate justification text - src/modules/queue-subscription-explorer/module.ts:160-161 now says 'in-loop supersession check above'. src/core/services/solace-publisher.ts:273-275 now says 'SDK removeListener does not throw; defensive catch on a trusted contract' and the stale queue-browser precedent is gone.
- CR-0105 tests/modules/queue-copy/ui-modal.test.ts: 6 weak tests -- destination-gate wiring never proves the run did not start; closed-modal tests assert a value they set - tests/modules/queue-copy/ui-modal.test.ts: 'is wired into Start' (:1386) completes a verify and asserts runCopyJob not called, state.job null and sourceInput enabled. 'progress updates ignored after the modal is closed' (:247) asserts modalSourceCount stays '--'. 'verify result ignored' (:270) asserts status 'Checking...' and Start disabled. 'lets an entitled source through' (:1327) and 'direct mode never...
- CR-0106 tests/modules/queue-browser/ui-table.test.ts: 8 weak tests -- three have no expect; ZIP tests check that calls happened, not their arguments - ui-table.test.ts: 'returns checked message IDs' now toEqual(['1']) (57-66); 'appends a row and animates' asserts style.animation and countTotal (176-187); 'clears details if selected message is removed' has expect (201-210); 'creates content ZIP' asserts file name/payload, generateAsync args and download filename (401-424); 'handles ZIP generation error' asserts the error toast text (479-498); 'returns early if...
- CR-0107 tests/modules/queue-browser/ui-details.test.ts: 10 weak or duplicate tests -- download and copy tests check calls only; 3 duplicate its - ui-details.test.ts: blob/createObjectURL tests replaced by 'wraps the text in a blob...' asserting filename, blob.type and bytes (43-53); 'handles empty content' asserts filename and payload '' (62-70; the old || '' fallback no longer exists, ui-details.ts:34); downloadMessageFull bare test removed, only the null-guard test remains (206-211); copy tests assert toHaveBeenCalledWith('dest', btn) and ('rmid', btn)...
- CR-0108 tests/modules/queue-browser/ui-events.test.ts: 12 weak or duplicate tests -- one no-expect, half-asserted titles, 5 duplicates, numeral substring alerts - ui-events.test.ts: 'clears previous errors before checking' has expects on text, display and is-invalid (428-441); 'unbinds selected queue and selects next' asserts selectBound.value q2 (508-520); 'opens forward modal' asserts modalForward.open, restores generateUuid in finally (353-375); 'applies message type filter' asserts displayed ids (764-774) and the edge-case namesake has two messages (1016-1025);...
- CR-0109 tests/modules/queue-browser/ui-core.test.ts: 6 ceremonial tests -- formatBytes/generateUuid re-test core aliases; cache test checks truthiness only - ui-core.test.ts: 'caches all elements' uses toBe identity against querySelector (37-47); formatBytes/generateUuid re-tests collapse to one alias identity test (80-86); 'clears queue state and filters' asserts renderList and clearDetails called once and restores both (142-168).
- CR-0110 tests/modules/queue-browser/module.test.ts: 7 weak tests -- 5 wiring tests with no expect, relying on a throw that click()/emit never surface - module.test.ts: 'bind button click triggers bind' asserts the 'No active Solace session.' error (71-82); 'unbind button click triggers unbind' asserts option removed and selectedIndex 0 (304-318); 'filter apply'/'filter clear' assert activeFilters.msgId and input value (350-372); 'listens for app:message-delete events' asserts dialog open and message text (540-551); 'browser:browse-queue handles missing loadSelf'...
- CR-0111 tests/modules/queue-browser/service-events.test.ts: 3 weak tests -- one no-expect, two check only that a warning was logged - service-events.test.ts: 'adds to displayed when filter matches' asserts displayed ids and the rendered row (786-799); 'handles message type detection errors' asserts the stored type 'Message' (519-533); 'handles timestamp extraction error' asserts date 'N/A' and dateMs null (536-551).
- CR-0112 tests/modules/queue-browser/no-payload.test.ts: 6 weak tests -- bare or default-state assertions on stateful flag-off handlers - no-payload.test.ts: filter handler tests seed state and assert msgId/currentQueue effects, not just .not.toThrow() (204-243); 'clearDetails...' selects the message first and asserts detailId then '' (180-192); 'renderList wires Forward... updateCounts' asserts countTotal '1' after resetting it (137-153); 'renders the message id with an empty body preview' seeds a content and asserts it is not rendered plus...
- CR-0113 tests/core/kernel.test.ts: 8 weak tests -- 2 with no expect, install-failure path checks only the log, 1 duplicate - tests/core/kernel.test.ts: 'starts with no sidebar toggle' (1096-1109) now asserts install calledTimes(1) and the view is not hidden; 'starts with no module container' is gone (grep finds no match; 'navigates when moduleContainer is missing' at 1056 remains); 'idempotency prevents window listener accumulation' (470-488) now subscribes to jszip:loaded and expects one call after extra start()s; 'handles module...
- CR-0114 tests/core/event-bus.test.ts: 4 ceremonial tests -- type-guarantee check and 3 duplicates - tests/core/event-bus.test.ts: the 'creates an event bus with on, off, emit' test and the void/complex-payload duplicates are gone (file starts at 6 with 'calls handler when event is emitted'); the Set-cleanup test is now 're-subscribing after off() delivers exactly once' (87-96) with the re-subscribe and calledTimes(1) assertion.
- CR-0115 tests/core/utils.test.ts: 2 weak tests -- the regex-escaping test passes with escaping removed - tests/core/utils.test.ts:59-66 'escapes regex special characters' now asserts matchString('testXvalue','test.*') false and ('test1x','test[1]*') false, which fail without escaping; :451-455 uses toBe('fallback') for the object and number cases.
- CR-0116 tests/core/logger.test.ts: 2 weak assertions -- default-arg test passes either way; constant self-check - tests/core/logger.test.ts:198-207 redefines window.location.search to '?logLevel=WARN' and expects LogLevel.WARN; :31-33 'defaults to INFO' keeps only the DEFAULT_LOG_LEVEL constant pin.
- CR-0117 tests/main.test.ts: 2 weak tests -- the deferred boot is not shown to wait for script load; limited mode not shown to start the kernel - tests/main.test.ts was rewritten; the deferred-boot and limited-mode tests no longer exist. The current tests (28-72) assert kernel start via a Kernel.prototype.start spy: starts at once when solace exists, at once while the script is still loading (36-48), at once after a script error (62-72), and a rejected start is logged (50-60).
- CR-0118 tests/variants.test.ts: 1 weak test -- _active is not pinned to the standard variant - tests/variants.test.ts:174-178 '_active re-exports the standard variant manifest' asserts expect(ACTIVE_VARIANT).toBe(STANDARD_VARIANT); :33-43 now uses an exact sorted toEqual of the four module ids.
- CR-0119 tests/registry.test.ts: 1 duplicate test -- priority ordering re-tests the kernel sort - tests/registry.test.ts: the kernel-sort duplicate is gone; the 'kernel integration' describe now has 'every registered module is installed when the kernel starts' (77-82) and 'registry ids and priorities equal the standard variant manifest' (85-93, toEqual(STANDARD_MANIFEST)), which is the registry-specific check the ledger proposed.
- CR-0120 tests/modules/queue-copy/ui.test.ts: 4 weak tests -- toBeDefined on required() elements and loose byte/count matches - tests/modules/queue-copy/ui.test.ts: 'caches every required element' (:60) has no toBeDefined (count is 0 in the file). 'shows live count + size' (:481) asserts exact strings with formatBytes(1024). 'SEMP success with all fields' (:505) asserts the exact '{used} / {quota}' and max-size strings. 'spool present, quota null' (:546) asserts toBe(formatBytes(500)).
- CR-0121 tests/modules/queue-copy/service-copy.test.ts: 2 weak tests and dead code -- a title claims a lastError guarantee nothing asserts - tests/modules/queue-copy/service-copy.test.ts:1166 now asserts lastError 'first failure' for the 'second browser-event triggerStop' test (:1136), and the code keeps the first reason. The cancel test (:1110) asserts lastError null at :1133. The `(state as any);` no-op anchor is gone.
- CR-0122 tests/modules/queue-copy/ui-events.test.ts: 2 weak tests -- the dest picker's queue source is never checked - tests/modules/queue-copy/ui-events.test.ts:306-314 asserts the pick source key is the primary SEMP baseUrl, and :316-331 asserts the key is 'http://d' for cross-broker.
- CR-0123 tests/modules/connections/ui.test.ts: 6 weak or duplicate tests -- a phantom-fallback test, missing precondition, 3 duplicates - tests/modules/connections/ui.test.ts: the getElements-fallback test is gone (only 'caches element references that survive DOM mutation' at 19-45 remains). 'wires SSL modal close' (58-66) now calls ui.openSslModal and asserts open true before the close click. The updateAuthUI describe with the two duplicate label tests and the misfiled 'throws when cacheElements has not been given required elements' are deleted;...
- CR-0124 tests/modules/connections/module.test.ts: 8 weak tests -- 2 no-expect, 2 vacuous bus no-throw checks, call-only connect/save checks - tests/modules/connections/module.test.ts: the no-expect auto-connect cleanup test is now 990-1013, with real assertions (error text, warn toast, browseHandler not called, createSession called twice). 'enter key on semp inputs' (830-846) fills the SEMP fields and awaits fetch toHaveBeenCalledWith the msgVpns URL. The null-loadSelf test (1860-1875) and the loadSelf-undefined test (1153-1177) spy console.error and...
- CR-0125 tests/modules/connections/managed-panel.test.ts: 3 weak tests -- entitlement-wrap tests run under operate '*', so name resolution is never tested - tests/modules/connections/managed-panel.test.ts: 'reads the queue name via getName() when .name is absent' (679-687) uses a restrictive readOnly profile for 'q-getname', asserts the browser is returned for it and /not entitled/ for getName 'other'. Empty descriptors are pinned at 689-694 (toBe(browser) under operate '*') and 696-701 (fail closed under a restrictive profile). The allow side of 658-665 asserts...
- CR-0126 tests/core/components/queue-picker/picker.test.ts: 1 vacuous guard test -- not.toThrow around dispatchEvent cannot fail - tests/core/components/queue-picker/picker.test.ts:1683-1733 'handlers gracefully no-op when dispatched after the picker closes' now collects window 'error' events and asserts none (1727) and asserts the SEMP fetch call count is unchanged since close (1728); the COV-12 comment and title are gone (grep for COV finds nothing).
- CR-0127 tests/modules/queue-discovery/module.test.ts: 7 weak tests -- 5 have no expect; the copy-button test ignores the payload - tests/modules/queue-discovery/module.test.ts: 'ignores non-isSempConnected state changes' (187-202) asserts sempFetch not called. 'refresh queues button fetches queues' (299-334) asserts the second queue fetch and the re-rendered options. 'refresh queues does nothing without selected VPN' (336-351) asserts sempFetch not called. 'copy button emits connection:check-connection' (353-385) asserts...
- CR-0128 tests/modules/user-management/module.test.ts: 2 weak tests -- reload paths check that the list was fetched, not re-rendered - tests/modules/user-management/module.test.ts: 'Refresh re-fetches the list' and 'reloads the list on rbac:changed' are gone. The rbac:changed reload is now covered with rendered rows by 'reloads when the admin signs out and in again, or another admin signs in' (162-185, asserts carol and dave rows render) and 'clears the gate and loads the list when an admin logs in' (195-204). Refresh is covered by 'keeps the...
- CR-0129 tests/integration/message-pipeline.test.ts: 2 weak tests -- one checks only that assigning a variable does not re-render; one cannot see the filter - tests/integration/message-pipeline.test.ts:127-150 sends a third message after clearing the filter and asserts row ids ['10','12']; :162-177 sends a TOPIC-destination message and asserts only ['50'] renders; the 'S3 cleanup' and '6.3.6 guard' comments are gone (grep finds none). The title still says 'previously-hidden' but describes state, not history.
- CR-0130 tests/integration/full-flow.test.ts: 1 ceremonial test -- asserts event delivery only - tests/integration/full-flow.test.ts: the 'module A emits event, module B receives it' test is deleted; only 'modules share a single EventBus instance through AppContext' (40) and 'setState during install is visible to same-module EventBus subscriber' (64) remain.
- CR-0131 tests/modules/queue-subscription-explorer/module.test.ts: 1 weak test -- its wait does not gate on the late page, so the no-clobber checks run too early - tests/modules/queue-subscription-explorer/module.test.ts:448-506: after resolveFetch the test gates on the late page with vi.waitFor(() => expect(late.text).toHaveBeenCalledTimes(1)) (492), then a macrotask (493), then asserts the button is 'Load', the rows are absent, and toasts.querySelector('.toast') is null (498-502).
- CR-0132 tests/core/services/solace-publisher.test.ts: 2 weak tests -- binary payload not checked; correlation-before-beforeSend order not proven - tests/core/services/solace-publisher.test.ts:371-390 asserts setBinaryAttachment calledWith(new Uint8Array([1,2,3])) and that the SDT and XML setters were not called; :128-148 compares invocationCallOrder of setDestination and setCorrelationKey against beforeSend, and of beforeSend against session.send.
- CR-0133 tests/core/services/solace-client.test.ts: 1 weak test -- the factory init profile is never checked - tests/core/services/solace-client.test.ts:57-65 reads the SolclientFactoryProperties result, asserts init is calledWith(props), props.profile is version10 and props.logLevel is WARN.
- CR-0134 tests/modules/connections/config.test.ts: 1 test's comment claims silence it does not assert - tests/modules/connections/config.test.ts:72-81: the corrupted-OBF1 test now has expect(consoleSpy).not.toHaveBeenCalled() at line 79, backing the 'silently' comment.
- CR-0135 tests/mock-broker/sdk.test.ts: 1 ceremonial test -- 'above the shell floor' compares a literal with itself - tests/mock-broker/sdk.test.ts:321-331: the test reads MIN_VERSION from src/index.html (324-326) and compares the mock's Version.version against it component-wise (327-330), failing with a message naming both versions.

## Accepted (not re-litigated)

- CR-0004 A full throttle table refuses every legitimate sign-in, and the table is filled by attacker-chosen usernames - 2026-11-11: Documented fail-closed design; attack needs ~170-1,000 client /64s because each address is also blocked after 5 failures. Follow-up question from the user on client-IP correctness in container deployments recorded under CR-0004 (see notes in plan).
- CR-0009 Shutdown ignores hijacked SMF/Direct WebSockets, waits on the backup loop with no deadline, and ignores a second signal - 2026-11-11: Process exit tears the hijacked sockets down the same way on the wire; the backup wait only stalls on a hung mount; second-signal handling not needed. Accepted.
- CR-0036 Move mode counts a message as moved when removeMessageFromQueue throws, and still reports 'completed' - 2026-11-11: The SDK's removeMessageFromQueue is a fire-and-forget client ack the broker never confirms, so a broker-side removal failure cannot be detected; accepted. Docs: user-guide note under Move that removal is a client acknowledgement the broker does not confirm and that the source queue's count should be checked afterwards.
- CR-0041 matchString caches one compiled RegExp per distinct pattern with no bound - 2026-11-11: Accepted by the owner. The cache grows by one compiled RegExp per distinct filter string typed in a session; the growth is a few bytes per pattern, so no cap.
- CR-0052 Error and warning toasts disappear after the 1-second default, and for several failures the toast is the only signal - 2026-11-11: Keep the 1 s toast default; the notification panel (NEW-3) keeps every toast, which is the persistent signal. Accepted.
- CR-0077 SCA workflow calls a reusable workflow at mutable `@main`, handing it FOSSA_API_KEY and broad top-level write and OIDC permissions; runner is ubuntu-latest - 2026-11-11: Accept the org decision to track the reusable SCA workflow by branch (commit bb300f7, org ticket): mark accepted in docs/review/findings.json with that note; correct docs/git.md:194 to state the exception; pin the update_manifest runner to ubuntu-24.04; scope the top-level permissions to the sca_scan job.
- CR-0086 setup.sh is an unreferenced, unhardened script that downloads an unpinned SDK with no checksum and reports success even when nothing was extracted - 2026-11-11: User: ignore. setup.sh stays as is; recorded as accepted.

## Coverage

- Areas reviewed: design, correctness, resilience, quality, tests, cicd, build, interfaces, observability, conventions; skipped: none.
- Read closely: go-web-proxy/*.go (all 32 non-test files) and go-web-proxy/pages/login.html; src/core/**, src/modules/** (all eleven modules), src/mock-broker/**, src/main.ts, src/registry.ts, src/variants/*; scripts/*; .github/**; docker/**; README.md, docs/*.md (the ten docs) and CLAUDE.md; tests/setup.ts and the vitest configs; the Go tests for code added since the last review (writer, journal, totp, tls, tls_api, restart, audit, settings, pages, session, throttle, contract); tests/modules/queue-copy/service-copy.test.ts; the fake-gateway contract, routes and error-code tests. The orchestrator also read pages.go, totp.go, session.go, throttle.go, access.go and the sign-in and two-factor parts of store.go in full.
- Sampled: the remaining Go test files; most of tests/** (43,600 lines), where the review read the tests added or changed since d2751b1 and every test the previous review had named; src/css/*; package-lock.json (shape only).
- Not read: dist/, node_modules/, solclient.js and jszip (vendor), graphify-out/, images/, LICENSE; cert/ and docker/e2e-broker.env (private material, by rule); docs/improvement-plan.md except to look up the owner's recorded decisions on three findings.
- Stacks with core checklist only: PowerShell (scripts/dev.ps1).
- Dynamic checks not run: shellcheck, actionlint, hadolint, staticcheck, golangci-lint (not installed); `go mod tidy -diff`, `npm ls --all` and `docker compose config` (not offered: the owner's full run built the image and ran the scan the same morning).
- Limits: the first pass was 26 Sonnet reviewers, one per slice of the tree, and every finding they reported went through a second, sceptical check by a different reviewer; the orchestrator verified the Major, re-rated or rewrote the findings where the two passes disagreed, and machine-checked every quoted line against the tree. Fourteen findings were merged into others, one was dropped and two were added by the orchestrator. All 128 previously open findings were re-checked one by one, and a sample of 14 'fixed' verdicts was confirmed by hand. Nothing was executed: the end-to-end harness, the browser behaviours named in the appendix and in the suspected findings, and the h2 case in CR-0141 were reasoned from source, not run. Non-ASCII characters in quoted source lines are shown as ASCII equivalents. Suggested patches are included only where `git apply --check` accepts them.

## Appendix: binary payload preview (evaluation requested during this review)

Question: what could go wrong if the Queue Browser showed binary payloads (PNG, JPG, PDF and similar),
with the file type detected from the bytes and a fixed list of supported types. This is a design
evaluation of a feature that does not exist yet, so nothing here is in the ledger. Two things it turned
up in today's code are filed as findings: CR-0136 and CR-0151.

### What the code does today

- The SDK runs with the version10 profile (src/core/services/solace-client.ts:117), so
  getBinaryAttachment() returns one character per byte. src/modules/queue-browser/payload.ts:29-39
  turns that back into the original bytes once, at ingest, and keeps them on the stored message
  (`bytes`). Download Content, the ZIP and forward are byte-exact. The corruption the last review
  reported as CR-0029 is gone.
- payload.ts:47-56 decides text or binary: valid UTF-8 without control characters is text; anything
  else is binary and the details pane shows only `[Binary payload: N bytes]`
  (payload.ts:58-65, ui-details.ts:129, set with textContent). Copy Content is disabled for binary
  (ui-details.ts:132) and the body filter skips it (state.js:159).
- There is no type detection from the bytes, no hex view and no preview. The only type information is
  the publisher's HTTP Content-Type, which Download Content uses unchecked as the file's type
  (ui-details.ts:31); the saved name has no extension (ui-details.ts:28).
- A payload inside an SDT map or stream is not decoded at all (service-events.ts:70-74), so it has no
  bytes to preview.
- The app bundles are served with no Content-Security-Policy. Only the gateway's own sign-in pages
  (go-web-proxy/pages.go:26) and SEMP relay answers (go-web-proxy/relay.go:209) carry one.
- Each stored message holds the SDK message, the bytes and the decoded text: up to three copies of
  the payload. The window is 100 messages per queue by default and up to 10,000
  (src/core/connections/defaults.ts:12-15), for up to three queues. Nothing limits payload size.
- Every bundle is one HTML file (vite.config.ts:210). The product code has no worker and no wasm.
  The demo bundles may not contain a URL to a real host (scripts/check-bundles.mjs:105), and
  window.open and scripted navigation are banned (tests/build/no-network-apis.test.ts:22-23).
- The demo broker's one binary message is a PNG signature followed by four junk bytes
  (src/mock-broker/broker/store.ts:61): it is not an image a browser can decode.

### Verdict

Images are a small, safe feature if three rules hold: the type comes only from the bytes, images are
drawn only through an `<img>` element, and SVG and HTML are never on the list. PDF is the hard part:
there is no way to show one that is both safe by construction and small, so it needs a decision of
its own (see issue 2). Neither should ship before the app has a Content-Security-Policy, because
today any mistake in this area runs script in the app's origin, where the Provisioned session can
ask the gateway to dial a broker.

### Issues, most serious first

1. Script execution in the app's origin (security).
   A payload is attacker-supplied input: anyone who can publish to a queue chooses the bytes and the
   HTTP Content-Type. If a preview ever hands those bytes to the browser as a document (an iframe,
   embed, object or a new tab on a blob: URL) with a type the publisher chose, an HTML or SVG payload
   runs as script in the app's origin. In Provisioned mode that script can call /managed/dial and the
   SEMP relay with the user's session.
   Rules that close it:
   - The supported list is a closed table. SVG and HTML are never in it: an SVG payload is valid
     UTF-8, so it keeps showing as text, which is the safe outcome.
   - The Blob's type comes from the table entry the bytes matched, never from HTTP Content-Type.
     Download Content should follow the same rule (finding CR-0151).
   - Images are rendered only as `<img src="blob:...">`. An image element does not run script even
     for a hostile file.
   - Add a test that a payload starting with `<svg` or `<html` and declared as image/png never reaches
     an element that could render it.

2. PDF has no good renderer here (design decision needed).
   - The browser's own viewer needs an iframe, embed or object on a blob: URL. Chrome has
     historically refused to load its PDF viewer inside a sandboxed frame, so the frame cannot be
     sandboxed; the safety then rests on rule 1 (type from the table) and on the browser's viewer.
     Mobile browsers often have no inline viewer and offer a download instead. Confirm both in the
     browsers the product supports before choosing this.
   - A bundled renderer (pdf.js) is well over 1 MB with its worker, several times today's 280 KB
     bundle; the worker is a second file or a blob: worker, and the library's source carries URL
     strings that check-bundles rejects in the demo bundles.
   - A link that opens the blob in a new tab is allowed (window.open is banned, an anchor is not)
     and keeps the page itself simple, but the new tab is still the app's origin: rule 1 is what
     keeps it safe.
   Recommendation: ship images first. For PDF start with detection only: show "PDF document, N bytes" and make Download Content save it as `.pdf`. Add the inline viewer later
   if users ask, after the browser checks above.

3. No Content-Security-Policy on the app (precondition; finding CR-0136).
   With no policy, the only thing between a mistake in issue 1 and script execution is the code
   being right. A policy also has to be designed with the preview in mind: it must allow
   `img-src blob:` (and `frame-src blob:` if the PDF viewer is used) and should set
   `object-src 'none'`. The single-file build means inline scripts, so the policy needs hashes
   generated at build time (a meta tag for static hosting, a header from the gateway).

4. Decompression bombs and memory.
   - A few kilobytes of PNG can declare 30,000 x 30,000 pixels; decoding it needs gigabytes and
     kills the tab. Read the width and height from the header (PNG IHDR, JPEG SOF, GIF and WebP
     headers) and refuse to decode above a pixel budget.
   - Build the Blob only when a message is selected, never per row, and keep at most one. Each
     stored message already holds up to three copies of its payload; a preview adds a fourth plus
     the decoded bitmap.
   - Set a byte limit above which the preview waits for a click.
   - Revoke the object URL on every way out: selecting another row, a filter that hides the
     selected message, the window dropping the oldest message (state.js:117), unbind, disconnect,
     and module teardown. Today the only revoke is the one-second timer in src/core/download.ts:24,
     which does not fit a preview that stays on screen.

5. Detection details.
   - Check the signature before the text test, not after it. A PDF made only of ASCII is valid
     UTF-8 and would otherwise be shown as text.
   - Match at offset 0 only, and require the full signature (PNG: 8 bytes; JPEG: FF D8 FF; GIF:
     GIF87a or GIF89a; WebP: RIFF....WEBP; PDF: %PDF-). A signature is a claim, not proof: the
     decode can still fail, so the `<img>` error event must fall back to the size-only line. That
     path is also what today's demo sample would exercise.
   - HTTP Content-Type is at most a hint for a mismatch note ("declared image/png, looks like a
     PDF"); it never selects the renderer.
   - Compressed payloads are the commonest "binary" in messaging. gzip (1F 8B) is likely to be the
     next request; decompressing it brings its own bomb problem. Decide now whether the table has
     room for a "known, not previewed" outcome so gzip, zip and friends can at least be named.

6. The supported-type list.
   - One `as const` table should drive everything: signature, kind, MIME type, file extension,
     renderer (image or none). Unknown bytes map to no entry and keep today's placeholder. Follow
     the existing pattern in src/core/connections/defaults.ts.
   - It belongs in src/modules/queue-browser/ beside payload.ts. No second feature needs it, so by
     the project's own rule it does not go to src/core/.
   - Do not call it "type": the Type filter already means the Solace message type (Text, Binary,
     Map, Stream). "Payload kind" avoids two meanings on one screen.
   - A hex view of the first bytes is a cheap, safe fallback for every unlisted kind and would make
     the feature useful on day one for payloads that will never get a renderer.

7. Builds and variants.
   - The no-payload bundles must not carry the preview: put the markup under `data-payload` and the
     code behind showPayload() (src/modules/queue-browser/features.ts:20). check-bundles does not
     assert that payload code is absent today; add a marker check so this cannot regress silently.
   - The details pane needs new elements in the module template, captured with required().
   - Standalone pages opened from a file: URL can use blob: URLs; no change needed there.

8. Tests.
   - jsdom cannot decode an image or show a PDF. Unit tests can cover detection (pure functions,
     node environment), the wiring, the fallback (dispatch the error event by hand) and revocation.
     The 100% gate makes the error and revoke paths mandatory, which is the right pressure here.
   - Real rendering can only be proven in the end-to-end run: publish a real PNG and assert the
     image has a natural width.
   - The demo broker needs real fixtures (a valid PNG and JPEG of under 200 bytes each, a minimal
     PDF) as byte arrays, with tests under tests/mock-broker.

### Decisions for the owner

- Which kinds are on the first list (suggested: PNG, JPEG, GIF, WebP as images; PDF detected and
  named, downloaded with its extension, not rendered inline yet).
- The byte limit for automatic preview and the pixel budget.
- Whether a hex view ships with it.
- Whether the Content-Security-Policy work (finding CR-0136) comes first. This review recommends
  that it does.
