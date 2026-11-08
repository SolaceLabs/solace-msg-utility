// End-to-end run of the gateway in Provisioned mode against an existing Solace
// broker, over docker/docker-compose.e2e.yaml. Run it through
// `./scripts/dev.sh e2e` (or dev.ps1), which builds the image first;
// this file drives the gateway. It may have to ask for the broker's details
// on the terminal, so the task runs it on the real console and it appends its
// own output to the task log ($E2E_LOG).
//
// The broker's details come from E2E_* environment variables, then
// docker/e2e-broker.env (git-ignored), and only what neither gives is asked
// for; the harness writes what it asked for back to that file, except the
// passwords. Nothing on the broker is created or changed: the run reads it
// through the gateway's read-only relay and browses an existing queue.
//
// E2E_BROKER_IP maps E2E_BROKER_HOST to that address inside the gateway
// container (a host alias, through a compose override under scripts/logs/e2e/),
// so the host can be the name in the broker's certificate even where no DNS
// resolves it.
//
// The gateway verifies the broker's certificate unless E2E_INSECURE=1, which
// starts the e2e gateway with SSL_INSECURE_SKIP_VERIFY=true for a broker whose
// certificate does not name the host it is dialled by. The run then says so
// at the start and in its summary: checks 3, 4 and 6 pass without proving the
// broker's TLS is trusted.
//
// Every check prints PASS or FAIL with its number. Any FAIL, or a setup step
// that cannot complete, exits 1. The gateway's passwords, its store key and
// its TLS material are generated per run, written only under scripts/logs/e2e/
// (git-ignored, deleted at the end) and masked in everything printed here; so
// are the broker's passwords.
//
// The SMF half uses the real SDK under Node: the browser build of the
// solclientjs version package.json pins, the one the images ship. Node's
// WebSocket cannot send the session cookie or an Origin, which a browser adds
// on its own, so the SDK connects to a loopback bridge that adds both and
// pipes the bytes to the gateway's /managed/smf socket unchanged.
//
// Checks B1-B8 then use the app as a person does: Chromium in the compose
// file's `browser` container, driven through playwright-core (a devDependency
// only), opens https://gateway:9443 on the stack's network, signs in through
// the gateway's own pages, connects, browses the queue and signs out. That
// browser sends the cookie and Origin itself. It trusts the gateway's
// throwaway certificate by ignoring certificate errors; the Node checks verify
// that certificate against the run's CA. Every response it receives joins the
// sweep of check 10, and its session cookies are masked and swept for like the
// others. E2E_BROWSER=0 skips them and the container.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import {
    MIN_MASKED, SESSION_COOKIE, createCookieJar, detailsFileText, findTokens, hostRootBundle, issueCert, jsonFindings,
    hostAliasOverride, hostAliasProblem, makeCA, maskSecrets, parseDetailsFile, parseSetCookie, pemCertificates, resolveDetails, sealedHeaderProblem,
    sessionCookieProblems, sweepSecrets,
} from './e2e-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = path.join(REPO, 'docker', 'docker-compose.e2e.yaml');
const DETAILS_NAME = 'docker/e2e-broker.env';
const DETAILS_FILE = path.join(REPO, DETAILS_NAME);
const WORK = path.join(REPO, 'scripts', 'logs', 'e2e');
const ALIAS = path.join(WORK, 'host-alias.yaml');
const SOLCLIENT = path.join(REPO, 'node_modules', 'solclientjs', 'lib-browser', 'solclient.js');
const LOGS = path.join(REPO, 'scripts', 'logs');
const LOG = process.env.E2E_LOG ?? '';

// The gateway's host port, bound to 127.0.0.1 by docker/docker-compose.e2e.yaml.
const GATEWAY = { host: '127.0.0.1', port: 39443 };
const ORIGIN = `https://${GATEWAY.host}:${GATEWAY.port}`;
// The browser container's Playwright server on the host, and the gateway as
// that browser reaches it on the stack's network.
const BROWSER_SERVER = 'ws://127.0.0.1:39444/';
const APP = 'https://gateway:9443';

const BROKER = 'b1';            // the connection the user is entitled to
const OTHER = 'b2';             // the same broker under a name the user is not entitled to
const USER = 'e2e-user';

const token = () => randomBytes(18).toString('base64url');
// Generated for this run, so always long enough to mask and look for.
const secrets = {
    bootstrapPassword: token(),
    adminPassword: token(),
    userPassword: token(),
    storeKey: randomBytes(32).toString('hex'),
};
// The broker's details (see BROKER_FIELDS in e2e-lib.mjs), and its two
// passwords apart: those are masked at any length.
let broker = {};
const brokerSecrets = {};
// Session cookie values as they are issued: masked like the secrets, and
// swept for in the gateway log.
const cookies = {};

function say(text) {
    const line = maskSecrets(maskSecrets(text, { ...secrets, ...cookies }), brokerSecrets, { min: 1 });
    console.log(line);
    if (LOG) fs.appendFileSync(LOG, `${line}\n`);
}

/** The secrets long enough to look for in text: every generated one, a broker password only from MIN_MASKED characters. */
const sweepable = () => Object.fromEntries(Object.entries({ ...secrets, ...brokerSecrets }).filter(([, v]) => v.length >= MIN_MASKED));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

function expect(ok, message) {
    if (!ok) throw new Error(message);
}

function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// --- broker details --------------------------------------------------------------

function askLine(label, offer) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Without a listener, readline only pauses on Ctrl-C and the run would hang.
    rl.on('SIGINT', () => { process.stdout.write('\n'); process.exit(130); });
    return new Promise((resolve) => rl.question(`${label}${offer ? ` [${offer}]` : ''}: `, (answer) => {
        rl.close();
        resolve(answer.trim() || offer);
    }));
}

/** A line read with the terminal's echo off (raw mode: Enter ends it, Backspace edits, Ctrl-C quits). */
function askSecret(label) {
    const stdin = process.stdin;
    process.stdout.write(`${label} (not shown): `);
    return new Promise((resolve) => {
        let value = '';
        const done = () => {
            stdin.off('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            process.stdout.write('\n');
            resolve(value);
        };
        const onData = (chunk) => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n') return done();
                if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
                if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
                else value += ch;
            }
        };
        stdin.setEncoding('utf8');
        stdin.setRawMode(true);
        stdin.on('data', onData);
        stdin.resume();
    });
}

/**
 * The broker's details: the environment first, then the details file, then a
 * prompt for whatever is still missing. What was asked for, passwords aside,
 * is written back to the file so the next run does not ask again.
 */
async function collectDetails() {
    let fileText = null;
    try {
        fileText = fs.readFileSync(DETAILS_FILE, 'utf8');
    } catch (e) {
        if (e.code !== 'ENOENT') throw new Error(`${DETAILS_NAME}: ${e.message}`);
    }
    const file = fileText === null ? undefined : parseDetailsFile(fileText, DETAILS_NAME);
    if (file && process.platform !== 'win32' && (file.values.E2E_SEMP_PASSWORD || file.values.E2E_CLIENT_PASSWORD)
        && (fs.statSync(DETAILS_FILE).mode & 0o077)) {
        say(`warning: ${DETAILS_NAME} holds a password and other users can read it; run chmod 600 ${DETAILS_NAME}`);
    }
    const { values, missing, errors } = resolveDetails(process.env, file, DETAILS_NAME);
    expect(errors.length === 0, `broker details refused:\n  ${errors.join('\n  ')}`);
    if (!missing.length) return checkedAlias(values);

    expect(process.stdin.isTTY && process.stdout.isTTY,
        `broker details missing: set ${missing.map((f) => f.env).join(', ')} in ${DETAILS_NAME} or the environment, or run in a terminal to be asked`);
    say(`${fileText === null ? `${DETAILS_NAME} does not exist yet` : `${DETAILS_NAME} lacks ${missing.length} detail(s)`}; asking (Enter takes the [offer])`);
    const additions = {};
    for (const f of missing) {
        for (;;) {
            const answer = f.secret ? await askSecret(f.label) : await askLine(f.label, f.offer);
            const problem = f.check(answer);
            if (!problem) {
                values[f.key] = answer;
                if (!f.secret) additions[f.env] = answer;
                break;
            }
            say(`  ${f.env} ${problem}; try again`);
        }
    }
    if (Object.keys(additions).length) {
        fs.writeFileSync(DETAILS_FILE, detailsFileText(fileText, additions));
        if (fileText === null) fs.chmodSync(DETAILS_FILE, 0o600);
        say(`saved ${Object.keys(additions).join(', ')} to ${DETAILS_NAME} (git-ignored); passwords are not saved`);
    }
    return checkedAlias(values);
}

/** The details, once the host alias (if any) is known to name a host; checked after the prompts, which may supply the host. */
function checkedAlias(values) {
    const problem = hostAliasProblem(values.host, values.brokerIp);
    expect(!problem, `broker details refused:\n  ${problem}`);
    return values;
}

/** The certificates in the broker CA file; a leading ~ is the home directory and a relative path is from the repo. */
function readBrokerCA(file) {
    const abs = path.resolve(REPO, file.replace(/^~(?=$|[\\/])/, os.homedir()));
    let text;
    try {
        text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
        throw new Error(`E2E_BROKER_CA ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`);
    }
    try {
        return pemCertificates(text);
    } catch (e) {
        throw new Error(`E2E_BROKER_CA ${file} ${e.message}`);
    }
}

function describeBroker(certs) {
    const alias = broker.brokerIp ? ` (${broker.brokerIp} in the gateway container)` : '';
    say(`broker: ${broker.host}${alias}, SEMP port ${broker.sempPort} as ${broker.sempUser}, wss port ${broker.smfPort}, `
        + `VPN ${broker.vpn}, client username ${broker.clientUser}, queue ${broker.queue}`);
    for (const c of certs) say(`trusting ${c.subject.replace(/\n/g, ', ')} (valid until ${c.validTo}) from ${broker.caFile}`);
    if (insecure()) say("warning: E2E_INSECURE=1: the gateway does not verify the broker's certificate (SSL_INSECURE_SKIP_VERIFY=true)");
    say(browserOn()
        ? `browser: Chromium in the compose file's browser container, at ${APP} (the first run pulls the image)`
        : 'note: E2E_BROWSER=0: the browser checks B1-B8 are skipped');
    for (const [name, label] of [['sempPassword', 'the SEMP password'], ['clientPassword', 'the client password']]) {
        if (brokerSecrets[name].length < MIN_MASKED) {
            say(`note: ${label} is shorter than ${MIN_MASKED} characters: it is masked, but checks 2, 10, 11, 14 and B5 cannot look for it without matching ordinary text`);
        }
    }
}

// --- docker ------------------------------------------------------------------

const insecure = () => broker.insecure === '1';
const browserOn = () => broker.browser !== '0';

function compose(args, { quiet = false } = {}) {
    // Always set, so a value inherited from the shell never reaches the gateway.
    const env = { ...process.env, E2E_GATEWAY_SKIP_VERIFY: insecure() ? 'true' : '' };
    // The host alias override exists only from writeMaterial to teardown.
    const files = ['-f', COMPOSE, ...(fs.existsSync(ALIAS) ? ['-f', ALIAS] : [])];
    const r = spawnSync('docker', ['compose', ...files, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env });
    if (r.error) throw new Error(`docker compose ${args[0]}: ${r.error.message}`);
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!quiet && out.trim()) say(out.trimEnd());
    return { code: r.status, out };
}

let caPem = '';

function writeMaterial(brokerCerts, roots) {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(path.join(WORK, 'trust'), { recursive: true });
    const ca = makeCA('smu-e2e CA');
    // `gateway` is the name the browser container reaches it by.
    const gateway = issueCert(ca, { cn: 'localhost', dns: ['localhost', 'gateway'], ip: [GATEWAY.host] });
    caPem = ca.certPem;
    // Read by the gateway's own user (65532), so world-readable: throwaway
    // material for one run. The gateway warns that the store key is readable
    // by others; that is expected here. chmod, not the write's mode, which a
    // restrictive umask would narrow.
    fs.chmodSync(path.join(WORK, 'trust'), 0o755);
    const put = (name, text) => {
        const file = path.join(WORK, name);
        fs.writeFileSync(file, text);
        fs.chmodSync(file, 0o644);
    };
    // Only the certificates from the CA file, whatever else it holds.
    put('trust/broker-ca.crt', brokerCerts.map((c) => c.toString()).join(''));
    // The host's standard roots, mounted where Go looks for the system bundle:
    // the image ships none, and a broker port may present a public chain.
    put('system-roots.crt', roots.text);
    put('gateway.crt', gateway.certPem);
    put('gateway.key', gateway.keyPem);
    put('admin-password', `${secrets.bootstrapPassword}\n`);
    put('store.key', `${secrets.storeKey}\n`);
    if (broker.brokerIp) put(path.basename(ALIAS), hostAliasOverride(broker.host, broker.brokerIp));
    // The repo's package.json says "type": "module", so the SDK's UMD bundle
    // is loaded from a .cjs copy.
    fs.copyFileSync(SOLCLIENT, path.join(WORK, 'solclient.cjs'));
}

// --- HTTP ----------------------------------------------------------------------

// Every gateway response, for the secret sweep (check 10).
const records = [];
const rawHeaderText = (res) => res.rawHeaders.reduce((s, v, i) => s + (i % 2 ? `${v}\r\n` : `${v}: `), '');

function noteCookies(lines) {
    for (const line of lines) {
        const c = parseSetCookie(line);
        if (c?.name === SESSION_COOKIE && c.value) cookies[`session cookie ${Object.keys(cookies).length + 1}`] = c.value;
    }
}

function request(method, pathname, { jar, form, json, body, headers = {} } = {}) {
    const h = { ...headers };
    let payload = body;
    if (form) { payload = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (json) { payload = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    if (jar?.header()) h.Cookie = jar.header();
    if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);
    return new Promise((resolve, reject) => {
        const req = https.request({ ...GATEWAY, path: pathname, method, headers: h, ca: caPem, agent: false }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                const setCookie = res.headers['set-cookie'] ?? [];
                noteCookies(setCookie);
                jar?.store(setCookie);
                records.push({ label: `${method} ${pathname} -> ${res.statusCode}`, headers: rawHeaderText(res), body: text });
                resolve({ status: res.statusCode, headers: res.headers, body: text, setCookie });
            });
        });
        req.on('error', reject);
        req.setTimeout(30_000, () => req.destroy(new Error(`${method} ${pathname}: no answer in 30s`)));
        req.end(payload);
    });
}

function errorCode(res) {
    try { return JSON.parse(res.body).error ?? ''; } catch { return ''; }
}

const signIn = (jar, username, password) => request('POST', '/login', { jar, form: { username, password } });

/** False once the compose service has no running container. A failed `ps` counts as running. */
function running(service) {
    const r = compose(['ps', '--status', 'running', '--quiet', service], { quiet: true });
    return r.code !== 0 || /^[0-9a-f]{12,64}$/m.test(r.out);
}

/** Polls ready() every 2s; gives up at once if the service's container has stopped. */
async function waitFor(what, seconds, ready, service) {
    const until = Date.now() + seconds * 1000;
    for (;;) {
        if (await ready().catch(() => false)) return;
        if (service && !running(service)) throw new Error(`${what} not ready: the ${service} container stopped (its log is below)`);
        if (Date.now() > until) throw new Error(`${what} not ready after ${seconds}s`);
        await sleep(2_000);
    }
}

/** A raw WebSocket upgrade to the gateway, for the refusals: { status, error }. */
function upgrade(pathname, { cookie, origin } = {}) {
    const headers = {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'), 'Sec-WebSocket-Protocol': 'smf.solacesystems.com',
    };
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    return new Promise((resolve, reject) => {
        const req = https.request({ ...GATEWAY, path: pathname, method: 'GET', headers, ca: caPem, agent: false });
        req.on('upgrade', (_res, socket) => { socket.destroy(); resolve({ status: 101, error: '' }); });
        req.on('response', (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                records.push({ label: `GET ${pathname} (upgrade) -> ${res.statusCode}`, headers: rawHeaderText(res), body: text });
                resolve({ status: res.statusCode, error: errorCode({ body: text }) });
            });
        });
        req.on('error', reject);
        req.setTimeout(30_000, () => req.destroy(new Error(`upgrade ${pathname}: no answer in 30s`)));
        req.end();
    });
}

// --- SMF -----------------------------------------------------------------------

const WS_HEADERS = ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions'];

/**
 * A loopback WebSocket bridge: the SDK connects to ws://127.0.0.1:<port>/..., and
 * each upgrade is replayed to the gateway over TLS with the session cookie and
 * a same-origin Origin added, then both sockets are piped together.
 */
function startBridge(cookie) {
    const sockets = new Set();
    const closeWaiters = [];
    let lastRefusal = '';
    const server = http.createServer((_req, res) => res.writeHead(404).end());
    server.on('upgrade', (req, client, head) => {
        client.on('error', () => {});
        sockets.add(client);
        const headers = { Connection: 'Upgrade', Upgrade: 'websocket', Origin: ORIGIN, Cookie: cookie };
        for (const h of WS_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];
        const up = https.request({ ...GATEWAY, path: req.url, method: 'GET', headers, ca: caPem, agent: false });
        up.on('upgrade', (res, gw, gwHead) => {
            gw.on('error', () => {});
            sockets.add(gw);
            records.push({ label: `GET ${req.url} (bridge) -> 101`, headers: rawHeaderText(res), body: '' });
            client.write(`HTTP/1.1 101 Switching Protocols\r\n${rawHeaderText(res)}\r\n`);
            if (gwHead.length) client.write(gwHead);
            if (head.length) gw.write(head);
            gw.on('close', () => { client.destroy(); for (const done of closeWaiters.splice(0)) done(); });
            client.on('close', () => gw.destroy());
            gw.pipe(client);
            client.pipe(gw);
        });
        up.on('response', (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                lastRefusal = `${res.statusCode} ${Buffer.concat(chunks).toString('utf8').trim()}`;
                client.end(`HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
            });
        });
        up.on('error', (e) => { lastRefusal = e.message; client.destroy(); });
        up.end();
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
        port: server.address().port,
        refusal: () => lastRefusal || 'none',
        nextGatewayClose: (ms) => withTimeout(new Promise((r) => closeWaiters.push(r)), ms, `the gateway did not close the SMF socket within ${ms / 1000}s`),
        close: () => { for (const s of sockets) s.destroy(); server.close(); },
    })));
}

function loadSolace() {
    const solace = createRequire(import.meta.url)(path.join(WORK, 'solclient.cjs'));
    const fp = new solace.SolclientFactoryProperties();
    fp.profile = solace.SolclientFactoryProfiles.version10;
    fp.logLevel = solace.LogLevel.WARN;
    const sdkLog = (...a) => say(`solclient: ${a.join(' ')}`);
    fp.logger = { trace() {}, debug() {}, info: sdkLog, warn: sdkLog, error: sdkLog, fatal: sdkLog };
    solace.SolclientFactory.init(fp);
    return solace;
}

/** An SMF session through the bridge, resolved on UP_NOTICE; `down` resolves when it goes away. */
async function openSession(solace, bridge, dial) {
    const props = new solace.SessionProperties();
    props.url = `ws://127.0.0.1:${bridge.port}${dial.smfPath}`;
    props.vpnName = dial.vpn;
    props.userName = dial.user;
    props.password = dial.pass;
    props.authenticationScheme = solace.AuthenticationScheme.BASIC;
    props.connectRetries = 0;
    props.reconnectRetries = 0;
    props.connectTimeoutInMsecs = 15_000;
    const session = solace.SolclientFactory.createSession(props);
    const ev = solace.SessionEventCode;
    const down = new Promise((resolve) => {
        for (const code of [ev.DOWN_ERROR, ev.DISCONNECTED]) if (code !== undefined) session.on(code, () => resolve());
    });
    const up = new Promise((resolve, reject) => {
        session.on(ev.UP_NOTICE, resolve);
        session.on(ev.CONNECT_FAILED_ERROR, (e) => reject(new Error(`SMF connect failed: ${e.infoStr || e.message || e}`)));
    });
    session.connect();
    try {
        await withTimeout(up, 20_000, 'no SMF session within 20s');
    } catch (e) {
        // The SDK only sees a failed connect; the gateway's answer says why.
        throw new Error(`${e.message}; gateway answer: ${bridge.refusal()}`);
    }
    return { session, down };
}

function bindQueue(solace, session, queue) {
    const qp = new solace.QueueBrowserProperties();
    qp.queueDescriptor = new solace.QueueDescriptor({ name: queue, type: solace.QueueType.QUEUE });
    const browser = session.createQueueBrowser(qp);
    const bound = new Promise((resolve, reject) => {
        browser.on(solace.QueueBrowserEventName.UP, resolve);
        browser.on(solace.QueueBrowserEventName.CONNECT_FAILED_ERROR, (e) => reject(new Error(`queue bind failed: ${e.message || e}`)));
    });
    browser.connect();
    return withTimeout(bound, 15_000, `queue ${queue} not bound within 15s`);
}

// --- setup -----------------------------------------------------------------------

async function stackUp() {
    compose(['down', '-v', '--remove-orphans'], { quiet: true });
    // By name: the browser only when its checks run.
    const up = compose(['up', '-d', 'gateway', ...(browserOn() ? ['browser'] : [])]);
    expect(up.code === 0, 'docker compose up failed (output above); the gateway uses the image `./scripts/dev.sh image` builds, '
        + 'and the browser container pulls the Playwright image the compose file pins');
    await waitFor('the gateway', 60, async () => (await request('GET', '/hosted')).status === 200, 'gateway');
}

/** Signs the bootstrap admin in, changes its password, adds both connections and the user. */
async function configureGateway() {
    const admin = createCookieJar();
    const first = await signIn(admin, 'admin', secrets.bootstrapPassword);
    expect(first.status === 303 && first.headers.location === '/login/password',
        `bootstrap sign-in: want 303 to /login/password, got ${first.status} ${first.headers.location ?? ''}`);
    const changed = await request('POST', '/login/password', {
        jar: admin, form: { current: secrets.bootstrapPassword, new: secrets.adminPassword, confirm: secrets.adminPassword },
    });
    expect(changed.status === 303, `admin password change: want 303, got ${changed.status}`);
    const connection = {
        hostname: broker.host,
        semp: { port: broker.sempPort, user: broker.sempUser, pass: brokerSecrets.sempPassword },
        client: { port: broker.smfPort, msgVpns: [{ name: broker.vpn, user: broker.clientUser, pass: brokerSecrets.clientPassword }] },
    };
    for (const name of [BROKER, OTHER]) {
        const r = await request('PUT', `/managed/connections/${name}`, { jar: admin, json: connection });
        expect(r.status === 204, `PUT /managed/connections/${name}: want 204, got ${r.status} ${r.body}`);
    }
    const u = await request('PUT', `/managed/users/${USER}`, {
        jar: admin,
        json: { password: secrets.userPassword, admin: false, operate: [], readOnly: [{ brokers: BROKER, msgVpns: broker.vpn, queues: '*' }] },
    });
    expect(u.status === 204, `PUT /managed/users/${USER}: want 204, got ${u.status} ${u.body}`);
    return admin;
}

// --- checks ------------------------------------------------------------------------

const results = [];

async function check(n, title, fn) {
    try {
        const detail = await fn();
        results.push({ n, ok: true });
        say(`PASS ${n}. ${title}${detail ? ` (${detail})` : ''}`);
    } catch (e) {
        results.push({ n, ok: false });
        say(`FAIL ${n}. ${title}: ${e.message}`);
    }
}

async function runChecks(admin) {
    const user = createCookieJar();
    const { vpn, queue } = broker;
    const vpnPath = enc(vpn);
    const smfPath = `/managed/smf/${BROKER}/${vpn}`;
    let dial = null;
    let bridge = null;
    let smf = null;
    let solace = null;
    let runOutput = '';

    try {
        await check(1, 'sign-in refuses a wrong password and issues a __Host- session cookie (Secure, HttpOnly, SameSite=Lax, Path=/, session-only)', async () => {
            const wrong = createCookieJar();
            const bad = await signIn(wrong, USER, 'not-the-password');
            expect(bad.status === 401 && !wrong.get(SESSION_COOKIE), `wrong password: want 401 and no session, got ${bad.status}`);
            const ok = await signIn(user, USER, secrets.userPassword);
            expect(ok.status === 303 && ok.headers.location === '/', `want 303 to /, got ${ok.status} ${ok.headers.location ?? ''}`);
            const problems = sessionCookieProblems(ok.setCookie);
            expect(problems.length === 0, problems.join('; '));
        });

        await check(2, '/managed/me names the entitled broker and VPN and carries no address, port or credential', async () => {
            const me = await request('GET', '/managed/me', { jar: user });
            expect(me.status === 200, `want 200, got ${me.status}`);
            const { brokers } = JSON.parse(me.body);
            expect(brokers?.length === 1 && brokers[0].broker === BROKER && brokers[0].msgVpns?.map((v) => v.name).join() === vpn,
                `brokers: ${JSON.stringify(brokers)}`);
            // The host and client username are looked for as whole values, and
            // not where they equal a name /me rightly carries.
            const named = [BROKER, OTHER, USER, vpn];
            const found = [
                ...sweepSecrets([{ label: '/managed/me', headers: '', body: me.body }], sweepable()),
                ...jsonFindings(me.body, {
                    keys: ['pass', 'password', 'hostname', 'port', 'semp', 'client', 'siteSeed'],
                    values: [broker.host, broker.clientUser].filter((v) => !named.includes(v)),
                }),
            ];
            expect(found.length === 0, `carries ${found.join(', ')}`);
        });

        await check(3, `a relayed SEMP v2 GET returns queue ${queue}, and a forged Authorization header is not used`, async () => {
            const r = await request('GET', `/managed/relay/${BROKER}/SEMP/v2/monitor/msgVpns/${vpnPath}/queues/${enc(queue)}`, {
                jar: user,
                headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from('admin:forged-password').toString('base64')}` },
            });
            expect(r.status === 200, `want 200, got ${r.status} ${r.body.slice(0, 300)}`);
            expect(JSON.parse(r.body).data?.queueName === queue, `no ${queue} in ${r.body.slice(0, 300)}`);
        });

        await check(4, 'a SEMP v1 <show> passes the relay and a v2 PATCH is refused as read_only', async () => {
            const show = await request('POST', `/managed/relay/${BROKER}/SEMP`, {
                jar: user, body: '<rpc><show><version/></show></rpc>', headers: { 'Content-Type': 'application/xml' },
            });
            expect(show.status === 200 && show.body.includes('<rpc-reply'), `show: want 200 with an rpc-reply, got ${show.status} ${show.body.slice(0, 300)}`);
            // Were the relay to let it through, the PATCH names a queue that does
            // not exist, so the broker would refuse it too: nothing changes.
            const absent = `e2e-absent-${randomBytes(6).toString('hex')}`;
            const patch = await request('PATCH', `/managed/relay/${BROKER}/SEMP/v2/config/msgVpns/${vpnPath}/queues/${absent}`, {
                jar: user, json: { egressEnabled: false },
            });
            expect(patch.status === 403 && errorCode(patch) === 'read_only', `PATCH: want 403 read_only, got ${patch.status} ${patch.body}`);
        });

        await check(5, 'dial returns the SMF path and the VPN credential, not cacheable', async () => {
            const d = await request('POST', '/managed/dial', { jar: user, json: { broker: BROKER, vpn } });
            expect(d.status === 200, `want 200, got ${d.status} ${d.body}`);
            expect(/no-store/.test(d.headers['cache-control'] ?? ''), `Cache-Control: ${d.headers['cache-control'] ?? '(absent)'}`);
            dial = JSON.parse(d.body);
            const right = dial.pass === brokerSecrets.clientPassword;
            expect(decodeURIComponent(dial.smfPath ?? '') === smfPath && dial.vpn === vpn && dial.user === broker.clientUser && right,
                `answer ${JSON.stringify({ ...dial, pass: right ? '(right)' : '(wrong)' })}`);
        });

        await check(6, `a real SMF login through ${smfPath} binds a queue browser to ${queue}`, async () => {
            expect(dial, 'no dial answer (check 5)');
            bridge = await startBridge(user.header());
            solace = loadSolace();
            smf = await openSession(solace, bridge, dial);
            await bindQueue(solace, smf.session, queue);
        });

        await check(7, 'the SMF socket refuses a foreign or missing Origin, and a request without a session', async () => {
            const socketPath = `/managed/smf/${BROKER}/${vpnPath}`;
            const foreign = await upgrade(socketPath, { cookie: user.header(), origin: 'https://evil.example' });
            expect(foreign.status === 403 && foreign.error === 'cross_origin', `foreign Origin: want 403 cross_origin, got ${foreign.status} ${foreign.error}`);
            const missing = await upgrade(socketPath, { cookie: user.header() });
            expect(missing.status === 403 && missing.error === 'cross_origin', `no Origin: want 403 cross_origin, got ${missing.status} ${missing.error}`);
            const anonymous = await upgrade(socketPath, { origin: ORIGIN });
            expect(anonymous.status === 401, `no session: want 401, got ${anonymous.status} ${anonymous.error}`);
        });

        await check(8, `the broker the user is not entitled to (${OTHER}) is a 404 on relay, dial and socket, the same as an unknown one`, async () => {
            const tail = `/SEMP/v2/monitor/msgVpns/${vpnPath}`;
            const other = await request('GET', `/managed/relay/${OTHER}${tail}`, { jar: user });
            const unknown = await request('GET', `/managed/relay/no-such-broker${tail}`, { jar: user });
            expect(other.status === 404 && other.body === unknown.body, `relay: got ${other.status} ${other.body}, unknown broker ${unknown.status} ${unknown.body}`);
            const dialOther = await request('POST', '/managed/dial', { jar: user, json: { broker: OTHER, vpn } });
            const dialUnknown = await request('POST', '/managed/dial', { jar: user, json: { broker: 'no-such-broker', vpn } });
            expect(dialOther.status === 404 && dialOther.body === dialUnknown.body, `dial: got ${dialOther.status} ${dialOther.body}, unknown broker ${dialUnknown.status} ${dialUnknown.body}`);
            const socket = await upgrade(`/managed/smf/${OTHER}/${vpnPath}`, { cookie: user.header(), origin: ORIGIN });
            expect(socket.status === 404, `socket: want 404, got ${socket.status} ${socket.error}`);
        });

        await check(9, 'signing out closes the open SMF session', async () => {
            expect(smf && bridge, 'no SMF session (check 6)');
            const before = user.header();
            const gatewayClosed = bridge.nextGatewayClose(10_000);
            // Handled now, awaited below: a failure in between must not leave
            // the timeout as an unhandled rejection that kills the run.
            gatewayClosed.catch(() => {});
            const out = await request('POST', '/managed/logout', { jar: user });
            expect(out.status === 204, `logout: want 204, got ${out.status}`);
            await gatewayClosed;
            await withTimeout(smf.down, 10_000, 'the gateway closed the socket but the SDK did not report the session down within 10s');
            const stale = await request('GET', '/managed/me', { headers: { Cookie: before } });
            expect(stale.status === 401, `the signed-out cookie: want 401, got ${stale.status}`);
        });

        // Before check 10, which then sweeps what the browser received too,
        // and before the restart of check 12, which ends every session.
        if (browserOn()) await runBrowserChecks();

        await check(10, 'no gateway response carries a credential except the dial answer\'s body', async () => {
            const sweep = sweepable();
            // By value: a SEMP password equal to the client password rightly
            // appears in the dial answer too.
            const hits = sweepSecrets(records, sweep,
                (r, name, where) => where === 'body' && r.label === 'POST /managed/dial -> 200' && sweep[name] === brokerSecrets.clientPassword);
            expect(hits.length === 0, hits.join('; '));
            return `${records.length} responses`;
        });

        await check(11, 'both stores are sealed at rest (SMUS header, no plaintext)', async () => {
            // A short name could turn up in ciphertext by chance.
            const names = [broker.host, broker.clientUser, USER].filter((t) => t.length >= 4);
            for (const [file, role] of [['users.yaml', 'users'], ['connections.yaml', 'connections']]) {
                const dest = path.join(WORK, `at-rest-${file}`);
                const cp = compose(['cp', `gateway:/data/${file}`, dest], { quiet: true });
                expect(cp.code === 0, `docker compose cp ${file}: ${cp.out.trim()}`);
                const buf = fs.readFileSync(dest);
                const header = sealedHeaderProblem(buf, role);
                expect(!header, `${file}: ${header}`);
                const found = findTokens(buf.toString('latin1'), [...Object.values(sweepable()), 'pbkdf2', 'msg-utility-', ...names]);
                expect(found.length === 0, `${file} holds ${found.join(', ')} in clear`);
            }
        });

        await check(12, 'after a restart the stores still open: old sessions are gone, and the admin signs in again', async () => {
            const r = compose(['restart', 'gateway'], { quiet: true });
            expect(r.code === 0, `docker compose restart: ${r.out.trim()}`);
            await waitFor('the gateway after its restart', 60, async () => (await request('GET', '/hosted')).status === 200, 'gateway');
            const stale = await request('GET', '/managed/me', { jar: admin });
            expect(stale.status === 401, `a session from before the restart: want 401, got ${stale.status}`);
            const again = createCookieJar();
            const s = await signIn(again, 'admin', secrets.adminPassword);
            expect(s.status === 303 && s.headers.location === '/', `sign-in: want 303 to /, got ${s.status} ${s.headers.location ?? ''}`);
            const conns = await request('GET', '/managed/connections', { jar: again });
            expect(conns.status === 200 && conns.body.includes(`"${BROKER}"`), `connections: ${conns.status} ${conns.body.slice(0, 300)}`);
        });

        await check(13, 'the gateway refuses to start when its key file is missing beside an existing store', async () => {
            compose(['stop', 'gateway'], { quiet: true });
            const run = compose(['run', '--rm', '--no-deps', '-T', '-e', 'STORE_KEY_FILE=/run/secrets/absent.key', 'gateway'], { quiet: true });
            runOutput = run.out;
            expect(run.code !== 0, 'the gateway started without its key file');
            // slog quotes the error, so the inner quotes arrive escaped.
            expect(/is missing but \\?"\/data\/users\.yaml\\?" exists/.test(run.out), `exit ${run.code}; output: ${run.out.trim().slice(-400)}`);
            return `exit ${run.code}`;
        });

        await check(14, 'the gateway log holds no password, store key or session cookie', async () => {
            const logs = compose(['logs', '--no-color', 'gateway'], { quiet: true });
            const text = logs.out + runOutput;
            const found = Object.entries({ ...sweepable(), ...cookies }).filter(([, v]) => text.includes(v)).map(([name]) => name);
            expect(found.length === 0, `found ${found.join(', ')}`);
            return `${text.split('\n').length} lines`;
        });
    } finally {
        try { smf?.session.dispose(); } catch { /* already gone */ }
        bridge?.close();
    }
}

// --- browser -----------------------------------------------------------------------

/** playwright-core, loaded only when the browser checks run. */
let playwright = null;

async function loadPlaywright() {
    try {
        return await import('playwright-core');
    } catch (e) {
        throw new Error(`playwright-core cannot be loaded (${e.message}). Run npm ci: package.json pins it, at the browser image's version.`);
    }
}

/** The browser container's Chromium, once its Playwright server answers. */
async function connectBrowser() {
    let browser = null;
    let last = '';
    try {
        await waitFor('the browser', 60, async () => {
            try {
                browser = await playwright.chromium.connect(BROWSER_SERVER, { timeout: 5_000 });
                return true;
            } catch (e) {
                last = String(e.message).split('\n')[0];
                return false;
            }
        }, 'browser');
    } catch (e) {
        say('--- browser log (last 30 lines) ---');
        compose(['logs', '--no-color', '--tail', '30', 'browser']);
        throw new Error(`${e.message}; last attempt: ${last || 'none'}`);
    }
    return browser;
}

/** A gateway response the browser received, as a record for check 10; its session cookie is masked from then on. */
async function recordResponse(res) {
    const url = new URL(res.url());
    if (url.origin !== APP) return;
    const headers = await res.headersArray();
    noteCookies(headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value));
    let body = '';
    try {
        body = await res.text();
    } catch { /* a redirect, or a page closed meanwhile, has no body to read */ }
    records.push({
        label: `${res.request().method()} ${url.pathname} -> ${res.status()}`,
        headers: headers.reduce((s, h) => `${s}${h.name}: ${h.value}\r\n`, ''),
        body,
    });
}

/** A browser context on the gateway that notes what its pages do in `seen` (see runBrowserChecks). */
async function openContext(browser, seen) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: APP });
    context.setDefaultTimeout(30_000);
    // Anything but the gateway is aborted, so it never leaves the stack.
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === APP || !/^https?:$/.test(url.protocol)) return route.continue();
        seen.foreign.push(url.href);
        return route.abort('blockedbyclient');
    });
    // Caught at once: an unhandled rejection would end the run.
    context.on('response', (res) => seen.pending.push(recordResponse(res).catch(() => { seen.unread += 1; })));
    // Routes do not see WebSockets, so their URLs are noted apart.
    context.on('page', (p) => {
        p.on('websocket', (ws) => seen.sockets.push(ws.url()));
        p.on('pageerror', (e) => seen.errors.push(e.message));
    });
    return context;
}

/** Signs in on the gateway's sign-in page, which `page` shows; resolves with the POST's response. */
async function signInPage(page, username, password) {
    await page.fill('#username', username);
    await page.fill('#password', password);
    const [res] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/login'),
        page.click('form button[type=submit]'),
    ]);
    await page.waitForLoadState();
    return res;
}

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Checks B1-B8: the app in a real browser, as the e2e user and then the
 * admin. A failure saves a screenshot to scripts/logs/e2e-<id>.png
 * (git-ignored); no page the run opens shows a password.
 */
async function runBrowserChecks() {
    const { vpn, queue } = broker;
    const smfPath = `/managed/smf/${BROKER}/${vpn}`;
    // What the pages did, for B8: response reads still running (check 10
    // waits for them) and those that failed, requests to another origin
    // (aborted), WebSocket URLs and uncaught errors.
    const seen = { pending: [], unread: 0, foreign: [], sockets: [], errors: [] };
    let browser = null;
    let user = null;
    let page = null;
    let shown = null;
    let socket = null;
    // Every response read, also those that arrive meanwhile, so check 10 sweeps all of them.
    const drain = async () => {
        for (let n = 0; n !== seen.pending.length;) {
            n = seen.pending.length;
            await Promise.allSettled(seen.pending);
        }
    };

    if (fs.existsSync(LOGS)) {
        for (const f of fs.readdirSync(LOGS)) if (/^e2e-B\d\.png$/.test(f)) fs.rmSync(path.join(LOGS, f));
    }
    const bcheck = (id, title, fn) => check(id, title, async () => {
        try {
            return await fn();
        } catch (e) {
            const shot = path.join(LOGS, `e2e-${id}.png`);
            if (shown && await shown.screenshot({ path: shot }).then(() => true, () => false)) e.message += ` (screenshot: scripts/logs/e2e-${id}.png)`;
            throw e;
        }
    });

    try {
        await bcheck('B1', "a browser signs the e2e user in through the gateway's own pages and lands in the app, with an HttpOnly session cookie", async () => {
            browser = await connectBrowser();
            user = await openContext(browser, seen);
            page = await user.newPage();
            shown = page;
            await page.goto('/');
            expect(new URL(page.url()).pathname === '/login', `/ without a session: want /login, got ${page.url()}`);
            const wrong = await signInPage(page, USER, 'not-the-password');
            expect(wrong.status() === 401, `wrong password: want 401, got ${wrong.status()}`);
            await page.locator('p.error[role=alert]').waitFor();
            const ok = await signInPage(page, USER, secrets.userPassword);
            const setCookie = (await ok.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
            noteCookies(setCookie);
            expect(ok.status() === 303, `sign-in: want 303, got ${ok.status()}`);
            const problems = sessionCookieProblems(setCookie);
            expect(problems.length === 0, problems.join('; '));
            await page.waitForURL(`${APP}/`);
            await page.locator('#managed-select-view').waitFor();
            await page.locator('.conn-account-name').waitFor();
            const name = (await page.locator('.conn-account-name').innerText()).trim();
            expect(name === USER, `the sidebar names ${name || 'nobody'}`);
            const held = (await user.cookies(APP)).find((c) => c.name === SESSION_COOKIE);
            expect(held?.httpOnly && held.secure && held.sameSite === 'Lax',
                `the browser holds ${held ? JSON.stringify({ ...held, value: '(masked)' }) : 'no session cookie'}`);
            expect(await page.evaluate(() => document.cookie) === '', 'document.cookie shows the page a cookie');
        });

        await bcheck('B2', 'the Provisioned panel and the sidebar offer only what /managed/me grants', async () => {
            expect(page, 'no signed-in page (B1)');
            await page.waitForFunction(() => document.querySelector('#managed-vpn-select')?.options.length > 0);
            const values = (sel) => page.locator(`${sel} option`).evaluateAll((os) => os.map((o) => o.value));
            const brokers = await values('#managed-broker-select');
            const vpns = await values('#managed-vpn-select');
            expect(brokers.join() === BROKER && vpns.join() === vpn, `offered brokers [${brokers.join(', ')}], VPNs [${vpns.join(', ')}]`);
            const nav = await page.locator('.nav-item[data-module-id]').evaluateAll((items) => items.map((i) => i.dataset.moduleId));
            // Connections always; Queue Browser and Queue Copy as the default
            // modules.userDefault=all grants them; never the subscription explorer.
            expect(nav.join() === 'connections,queue-browser,queue-copy', `sidebar: ${nav.join(', ')}`);
        });

        await bcheck('B3', `Connect opens the browser's own WebSocket to ${smfPath}, and the page shows no broker address`, async () => {
            expect(page, 'no signed-in page (B1)');
            const opened = page.waitForEvent('websocket', {
                timeout: 30_000, predicate: (ws) => decodeURIComponent(new URL(ws.url()).pathname) === smfPath,
            });
            opened.catch(() => {});
            await page.click('#btn-managed-connect');
            await page.locator('#managed-connected-view:visible, #managed-connect-error:visible').first().waitFor();
            const failed = page.locator('#managed-connect-error');
            if (await failed.isVisible()) throw new Error(await failed.innerText());
            const summary = await page.locator('#managed-connected-summary').innerText();
            expect(new RegExp(`Broker "${BROKER}".*VPN "${reEscape(vpn)}"`).test(summary), `summary: ${summary}`);
            socket = await opened;
            // Compared without case: innerText follows text-transform, so an
            // address in an uppercased label would otherwise slip past.
            const text = (await page.locator('body').innerText()).toLowerCase();
            const named = [BROKER, OTHER, USER, vpn];
            const found = findTokens(text, [broker.host, broker.brokerIp]
                .filter((v) => v && v.length >= 4 && !named.includes(v)).map((v) => v.toLowerCase()));
            expect(found.length === 0, `the page shows ${found.join(', ')}`);
            return new URL(socket.url()).origin;
        });

        await bcheck('B4', `the Queue Browser binds ${queue} read-only, with no delete`, async () => {
            expect(socket, 'no SMF session (B3)');
            await page.click('.nav-item[data-module-id="queue-browser"]');
            await page.locator('#browser-active-view').waitFor();
            await page.fill('#browser-bind-input', queue);
            await page.click('#btn-browser-bind');
            const outcome = await page.waitForFunction((q) => {
                const error = document.querySelector('#browser-bind-error')?.textContent?.trim();
                if (error) return `error: ${error}`;
                return [...document.querySelectorAll('#browser-bound-queues option')].some((o) => o.value === q) && 'bound';
            }, queue);
            const result = await outcome.jsonValue();
            expect(result === 'bound', `bind: ${result}`);
            await page.waitForFunction(() => document.querySelector('#browser-permissions')?.textContent === 'Read-Only').catch(() => {});
            // textContent, not innerText: the badge is text-transform: uppercase,
            // and innerText returns the rendered case.
            const shownQueue = ((await page.locator('#browser-queue-name').textContent()) ?? '').trim();
            const permissions = ((await page.locator('#browser-permissions').textContent()) ?? '').trim();
            expect(shownQueue === queue && permissions === 'Read-Only', `shows queue ${shownQueue}, permissions ${permissions || '(none)'}`);
            expect(await page.locator('#btn-browser-delete').isHidden(), 'the Delete button shows on a read-only queue');
            return `total ${await page.locator('#count-total').innerText()}`;
        });

        await bcheck('B5', 'browser storage holds no password, store key or session cookie', async () => {
            expect(page, 'no signed-in page (B1)');
            const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
            const found = Object.entries({ ...sweepable(), ...cookies }).filter(([, v]) => stored.includes(v)).map(([n]) => n);
            expect(found.length === 0, `holds ${found.join(', ')}`);
        });

        await bcheck('B6', '/solAdmin refuses the e2e user, and shows the admin both users and both connections', async () => {
            expect(user, 'no browser (B1)');
            const other = await user.newPage();
            shown = other;
            const refused = await other.goto('/solAdmin');
            expect(refused?.status() === 403, `the e2e user: want 403, got ${refused?.status()}`);
            const message = await other.locator('p.error').innerText();
            expect(message.includes(`${USER}, which is not an administrator`), `403 page says: ${message}`);
            await other.close();
            // Its own context, left open so a failure can be screenshot; the
            // browser closes it at the end.
            const ap = await (await openContext(browser, seen)).newPage();
            shown = ap;
            await ap.goto('/solAdmin');
            expect(new URL(ap.url()).pathname === '/login', `/solAdmin without a session: want /login, got ${ap.url()}`);
            const s = await signInPage(ap, 'admin', secrets.adminPassword);
            expect(s.status() === 303, `admin sign-in: want 303, got ${s.status()}`);
            await ap.waitForURL(`${APP}/solAdmin`);
            const rows = async (module, selector) => {
                await ap.click(`.nav-item[data-module-id="${module}"]`);
                await ap.locator(`${selector} tr`).first().waitFor();
                return ap.locator(`${selector} tr`).evaluateAll((trs) => trs.map((tr) => [...tr.cells].slice(0, 2).map((td) => td.textContent.trim())));
            };
            const users = (await rows('user-management', '#user-mgmt-rows')).map(([n, role]) => `${n}/${role}`).sort();
            expect(users.join() === ['admin/Admin', `${USER}/User`].sort().join(), `users: ${users.join(', ')}`);
            const conns = (await rows('connection-management', '#conn-mgmt-rows')).map(([n]) => n).sort();
            expect(conns.join() === [BROKER, OTHER].sort().join(), `connections: ${conns.join(', ')}`);
        });

        await bcheck('B7', 'Sign out in the sidebar ends the session and closes the browser\'s SMF socket', async () => {
            shown = page;
            expect(socket, 'no SMF session (B3)');
            const closed = socket.isClosed() ? Promise.resolve() : socket.waitForEvent('close', { timeout: 15_000 });
            closed.catch(() => {});
            const logout = page.waitForResponse((r) => new URL(r.url()).pathname === '/managed/logout');
            logout.catch(() => {});
            await page.click('.conn-account-signout');
            const out = await logout;
            expect(out.status() === 204, `logout: want 204, got ${out.status()}`);
            await closed;
            await page.locator('.conn-account').waitFor({ state: 'hidden' });
            const me = await page.evaluate(() => fetch('/managed/me').then((r) => r.status));
            expect(me === 401, `/managed/me after sign-out: want 401, got ${me}`);
            await page.goto('/');
            expect(new URL(page.url()).pathname === '/login', `/ after sign-out: want /login, got ${page.url()}`);
        });

        await bcheck('B8', 'nothing in the browser reached another origin, and no page threw', async () => {
            shown = null;
            expect(user, 'no browser (B1)');
            await drain();
            const problems = [
                ...seen.foreign.map((u) => `request to ${u}`),
                ...seen.sockets.filter((u) => !u.startsWith('wss://gateway:9443/')).map((u) => `socket to ${u}`),
                ...seen.errors.map((m) => `page error: ${m}`),
            ];
            expect(problems.length === 0, problems.join('; '));
            return `${seen.sockets.length} socket(s)${seen.unread ? `; ${seen.unread} response(s) closed before they could be swept` : ''}`;
        });
    } finally {
        await drain();
        await browser?.close().catch(() => {});
    }
}

// --- main ------------------------------------------------------------------------

function teardown() {
    try { compose(['down', '-v', '--remove-orphans'], { quiet: true }); } catch { /* the dev task's down -v is the backstop */ }
    fs.rmSync(WORK, { recursive: true, force: true });
}

async function main() {
    if (!fs.existsSync(SOLCLIENT)) {
        say(`error: ${SOLCLIENT} is missing. Run npm ci: package.json pins solclientjs.`);
        return 1;
    }
    let setupError = null;
    let started = false;
    try {
        broker = await collectDetails();
        brokerSecrets.sempPassword = broker.sempPassword;
        brokerSecrets.clientPassword = broker.clientPassword;
        const certs = readBrokerCA(broker.caFile);
        describeBroker(certs);
        if (browserOn()) playwright = await loadPlaywright();
        const roots = hostRootBundle((file) => {
            try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
        }, tls.rootCertificates);
        say(`trusting ${roots.count} standard roots from ${roots.from}`);
        process.on('SIGINT', () => { say('interrupted; tearing the gateway down'); teardown(); process.exit(130); });
        started = true;
        writeMaterial(certs, roots);
        await stackUp();
        const admin = await configureGateway();
        await runChecks(admin);
    } catch (e) {
        setupError = e;
        say(`error: setup failed: ${e.message}`);
    }
    const failed = results.filter((r) => !r.ok).map((r) => r.n);
    if (started) {
        if (setupError || failed.length) {
            say('--- gateway log (last 60 lines) ---');
            compose(['logs', '--no-color', '--tail', '60', 'gateway']);
        }
        teardown();
    }
    say(`e2e: ${results.length - failed.length} passed, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}${setupError ? ', setup failed' : ''}`
        + `${insecure() ? "; the broker's certificate was not verified (E2E_INSECURE=1)" : ''}`
        + `${broker.browser === '0' ? '; the browser checks were skipped (E2E_BROWSER=0)' : ''}`);
    return setupError || failed.length ? 1 : 0;
}

// process.exit, not a natural end: the SDK's timers would keep Node alive.
process.exit(await main());
