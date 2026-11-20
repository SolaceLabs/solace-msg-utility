// End-to-end run of the gateway image against an existing Solace broker, over
// docker/docker-compose.e2e.yaml, in both of its server modes: the `gateway`
// service in Provisioned mode (SMU_CONN_MODES=provisioned) and the `direct` service
// in Gateway mode, the image's default. Run it through `./scripts/dev.sh e2e`
// (or dev.ps1), which builds the image first; this file drives the gateways.
// It may have to ask for the broker's details on the terminal, so the task
// runs it on the real console and it appends its own output to the task log
// ($E2E_LOG).
//
// The broker's details come from E2E_* environment variables, then
// docker/e2e-broker.env (git-ignored), and only what neither gives is asked
// for; the harness writes what it asked for back to that file, except the
// passwords. Nothing on the broker is created or changed: the run reads it
// through the gateway's read-only relay and browses an existing queue; in
// Gateway mode it does the same through the Direct relay with the broker
// credentials it was given. What the run does change is the Provisioned
// gateway: checks 11, 12 and B3 take the e2e user's grant away or change a
// setting, and each puts back what it changed, since the checks after them
// expect the gateway as configureGateway left it. Checks 24-27 turn two-factor
// sign-in on (login.twoFactor optional, then mandatory) for a scratch user and
// put the setting back to optional and remove the user when they are done, whatever
// a check found. Checks 28-31 change the gateway's TLS from the console and
// restart it: the Provisioned gateway's /tls is a writable mount of
// scripts/logs/e2e/tls (the certificate, its key and trust/), the one writable
// mount besides /data and /backup; 29 replaces the certificate and puts the
// original back, 30 deletes the broker's CA file and adds it back, 31 restarts the
// gateway in place and signs the administrator in again, each whatever an
// earlier check found. The private keys 29 uploads are masked and swept like the
// other secrets.
//
// E2E_BROKER_ADDR maps E2E_BROKER_HOST to that address inside both gateway
// containers (a host alias, through a compose override under scripts/logs/e2e/),
// so the host can be the name in the broker's certificate even where no DNS
// resolves it. It is an IP address or a DNS name; a name is resolved once, on
// this machine, because the alias itself takes an address.
//
// E2E_DNS names DNS servers (addresses, separated by commas). Both gateway
// containers resolve through them, so E2E_BROKER_HOST may be a name only they
// know, and the harness asks them, not this machine's resolver, for an
// E2E_BROKER_ADDR name.
//
// The gateways verify the broker's certificate unless E2E_INSECURE=1, which
// starts both e2e gateways with SMU_SSL_SKIP_CERT_VERIFY=true for a broker
// whose certificate does not name the host it is dialled by. The run then says
// so at the start and in its summary: checks 3, 4, 6, 11 and 12 and D2-D4 pass
// without proving the broker's TLS is trusted.
//
// Every check prints PASS or FAIL with its id: 1-31, B1-B9 in the browser and
// D1-D4 in Gateway mode. Any FAIL, or a setup step that cannot complete, exits
// 1. The gateway's passwords and its TLS material are generated
// per run, written only under scripts/logs/e2e/ (git-ignored, deleted at the
// end) and masked in everything printed here; so are the broker's passwords.
//
// The SMF half uses the real SDK under Node: the browser build of the
// solclientjs version package.json pins, the one the images ship. Node's
// WebSocket cannot send the session cookie or an Origin, which a browser adds
// on its own, so the SDK connects to a loopback bridge that adds both and
// pipes the bytes to the gateway's /managed/smf socket unchanged. The
// Gateway-mode checks use the same bridge with no cookie, to the Direct
// relay's /wss/<port>/<host> path, which forwards the bytes to the broker.
//
// Checks B1-B9 then use the app as a person does: Chromium in the compose
// file's `browser` container, driven through playwright-core (a devDependency
// only), opens https://gateway:9443 on the stack's network, signs in through
// the gateway's own pages, sees a settings change on Refresh, connects, browses
// the queue and signs out. That browser sends the cookie and Origin itself. It
// trusts the gateways' throwaway certificate by ignoring certificate errors;
// the Node checks verify that certificate against the run's CA. Every response
// it receives joins the sweep of check 13, and its session cookies are masked
// and swept for like the others. D4 does the same in Gateway mode: its own
// browser connection opens https://direct:9443, fills the Direct form and
// binds the queue through the Direct relay. E2E_BROWSER=0 skips B1-B9, D4 and
// the container.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
    MIN_MASKED, SESSION_COOKIE, SIGNIN_COOKIE, aliasAddress, auditMissing, basisMoved, certFingerprint, continueLinkFromPage, createCookieJar, detailsFileText,
    dnsServers, findTokens, freshTotp, issueCert, issueExpiredCert, jsonFindings, hostAliasProblem, listedRev, listedRow, makeCA, maskSecrets,
    parseAuditLog, parseDetailsFile, parseSetCookie, pemCertificates, recoveryCodeProblems, recoveryCodesFromPage, refusalProblem, resolutionOverride,
    resolveDetails, resolverLookup, sealedHeaderProblem, sessionCookieProblems, signinCookieProblems, sweepSecrets, tlsFingerprint, twoFactorSecretFromPage,
    wrongTotp,
} from './e2e-lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = path.join(REPO, 'docker', 'docker-compose.e2e.yaml');
const DETAILS_NAME = 'docker/e2e-broker.env';
const DETAILS_FILE = path.join(REPO, DETAILS_NAME);
const WORK = path.join(REPO, 'scripts', 'logs', 'e2e');
const OVERRIDE = path.join(WORK, 'resolution.yaml'); // the host alias and the DNS servers, when the run has either
const SOLCLIENT = path.join(REPO, 'node_modules', 'solclientjs', 'lib-browser', 'solclient.js');
const LOGS = path.join(REPO, 'scripts', 'logs');
const LOG = process.env.E2E_LOG ?? '';

// The gateways' host ports, bound to 127.0.0.1 by docker/docker-compose.e2e.yaml:
// `gateway` in Provisioned mode, `direct` in Gateway mode (the image's default).
const GATEWAY = { host: '127.0.0.1', port: 39443 };
const DIRECT = { host: '127.0.0.1', port: 39445 };
const ORIGIN = `https://${GATEWAY.host}:${GATEWAY.port}`;
const DIRECT_ORIGIN = `https://${DIRECT.host}:${DIRECT.port}`;
// The browser container's Playwright server on the host, and the gateways as
// that browser reaches them on the stack's network.
const BROWSER_SERVER = 'ws://127.0.0.1:39444/';
const APP = 'https://gateway:9443';
const DIRECT_APP = 'https://direct:9443';

const BROKER = 'b1';            // the connection the user is entitled to
const OTHER = 'b2';             // the same broker under a name the user is not entitled to
const USER = 'e2e-user';
const SCRATCH = 'e2e-scratch';  // a user the version checks (20-23) create and remove
const TRUST_FILE = 'broker-ca.crt'; // the broker's CA file in the gateway's trust directory (writeMaterial), which check 30 deletes and adds back
// The settings endpoint's refusal of connModes direct (go-web-proxy/settings.go).
const DIRECT_REFUSAL = 'connModes "direct" would turn Provisioned mode off at the next restart, and this console with it. '
    + 'To leave Provisioned mode, remove config.yaml from the gateway\'s data volume and start the gateway with SMU_CONN_MODES=direct, '
    + 'so that it seeds its settings again.';

const token = () => randomBytes(18).toString('base64url');
// Generated for this run, so always long enough to mask and look for.
const secrets = {
    bootstrapPassword: token(),
    adminPassword: token(),
    userPassword: token(),
    scratchPassword: token(),
    scratchNewPassword: token(),
    // The passphrases checks 18 and 22 seal their backups with.
    backupPassphrase: token(),
    importPassphrase: token(),
};
// The broker's details (see BROKER_FIELDS in e2e-lib.mjs), and its two
// passwords apart: those are masked at any length.
let broker = {};
const brokerSecrets = {};
// Session cookie values as they are issued: masked like the secrets, and
// swept for in the gateway log.
const cookies = {};
// What checks 24-27 learn from the sign-in pages: the scratch user's TOTP
// secret (as one text and as the page groups it) and their recovery codes (as
// shown and without hyphens). Masked in all output and swept for in the
// gateway log and the audit log (check 17), but not in the responses (check
// 13): the pages that show them are meant to.
const twoFactor = {};
// The private keys the run sends to /managed/tls/certificate, each as one line
// of its base64 (a PEM key shows that line however it is wrapped or escaped):
// the gateway's own, and the ones check 29 issues. Masked in all output; swept
// for in the responses (check 29) and in the gateway log and the audit log (17).
const tlsKeys = {};
const keyLine = (pem) => pem.split('\n')[2];

function say(text) {
    const line = maskSecrets(maskSecrets(text, { ...secrets, ...cookies, ...twoFactor, ...tlsKeys }), brokerSecrets, { min: 1 });
    console.log(line);
    if (LOG) fs.appendFileSync(LOG, `${line}\n`);
}

/** The secrets long enough to look for in text: every generated one, a broker password only from MIN_MASKED characters. */
const sweepable = () => Object.fromEntries(Object.entries({ ...secrets, ...brokerSecrets }).filter(([, v]) => v.length >= MIN_MASKED));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
/** The record label prefix for the direct service's responses; the gateway's have none, so check 13's dial allowance never matches one. */
const tag = (direct) => (direct ? 'direct ' : '');
/** The Direct relay's path to the queue's SEMP v2 monitor object, and the broker's own SEMP credential for it. */
const directSempPath = () => `/https/${broker.sempPort}/${broker.host}/SEMP/v2/monitor/msgVpns/${enc(broker.vpn)}/queues/${enc(broker.queue)}`;
const sempAuth = () => ({ Accept: 'application/json', Authorization: basic(broker.sempUser, brokerSecrets.sempPassword) });
/** The e2e user's record as configureGateway saves it, without the password: a PUT of it keeps the password and the sessions. */
const userRecord = (granted) => ({ admin: false, operate: [], readOnly: granted ? [{ brokers: BROKER, msgVpns: broker.vpn, queues: '*' }] : [] });

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

/**
 * The details, once the host alias (if any) is known to name a host; checked
 * after the prompts, which may supply the host. `brokerIp` is the address the
 * alias maps to: E2E_BROKER_ADDR, resolved here when it is a DNS name.
 */
async function checkedAlias(values) {
    const problem = hostAliasProblem(values.host, values.brokerAddr);
    expect(!problem, `broker details refused:\n  ${problem}`);
    values.brokerIp = values.brokerAddr ? await aliasAddress(values.brokerAddr, ...aliasLookup(dnsServers(values.dns))) : '';
    return values;
}

/** Who resolves an E2E_BROKER_ADDR name, and what to call it: the E2E_DNS servers when given, else this machine's resolver. */
function aliasLookup(servers) {
    if (!servers.length) return [dns.promises.lookup];
    const resolver = new dns.promises.Resolver();
    resolver.setServers(servers);
    return [resolverLookup(resolver), `E2E_DNS ${servers.join(', ')}`];
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
    const resolved = broker.brokerAddr === broker.brokerIp ? '' : `${broker.brokerAddr} -> `;
    const alias = broker.brokerIp ? ` (${resolved}${broker.brokerIp} in both gateway containers)` : '';
    say(`broker: ${broker.host}${alias}, SEMP port ${broker.sempPort} as ${broker.sempUser}, wss port ${broker.smfPort}, `
        + `VPN ${broker.vpn}, client username ${broker.clientUser}, queue ${broker.queue}`);
    if (broker.dns) say(`DNS: both gateway containers resolve through ${dnsServers(broker.dns).join(', ')} (E2E_DNS)`);
    for (const c of certs) say(`trusting ${c.subject.replace(/\n/g, ', ')} (valid until ${c.validTo}) from ${broker.caFile}`);
    if (insecure()) say("warning: E2E_INSECURE=1: neither gateway verifies the broker's certificate (SMU_SSL_SKIP_CERT_VERIFY=true)");
    say(browserOn()
        ? `browser: Chromium in the compose file's browser container, at ${APP} and ${DIRECT_APP} (the first run pulls the image)`
        : 'note: E2E_BROWSER=0: the browser checks B1-B9 and D4 are skipped');
    for (const [name, label] of [['sempPassword', 'the SEMP password'], ['clientPassword', 'the client password']]) {
        if (brokerSecrets[name].length < MIN_MASKED) {
            say(`note: ${label} is shorter than ${MIN_MASKED} characters: it is masked, but checks 2, 13, 14, 17 and B6 cannot look for it without matching ordinary text`);
        }
    }
}

// --- docker ------------------------------------------------------------------

const insecure = () => broker.insecure === '1';
const browserOn = () => broker.browser !== '0';

// A first `up` may pull the Playwright image; every other command answers in
// seconds. The bound ends the run when docker hangs, which no JS timer can do
// while spawnSync blocks.
function compose(args, { quiet = false, seconds = args[0] === 'up' ? 600 : 120 } = {}) {
    // Always set, so a value inherited from the shell never reaches the gateway.
    const env = { ...process.env, E2E_GATEWAY_SKIP_VERIFY: insecure() ? 'true' : '' };
    // The resolution override exists only from writeMaterial to teardown.
    const files = ['-f', COMPOSE, ...(fs.existsSync(OVERRIDE) ? ['-f', OVERRIDE] : [])];
    const r = spawnSync('docker', ['compose', ...files, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env, timeout: seconds * 1000 });
    if (r.error?.code === 'ETIMEDOUT') throw new Error(`docker compose ${args[0]} did not finish within ${seconds}s: check that Docker is running and answers`);
    if (r.error) throw new Error(`docker compose ${args[0]}: ${r.error.message}`);
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    if (!quiet && out.trim()) say(out.trimEnd());
    return { code: r.status, out };
}

let caPem = '';
// The run's CA (it signs the certificates check 29 issues), the gateway's pair
// (check 29 puts it back) and the text of the broker's CA file (check 30 adds it back).
let runCA = null;
let gatewayPair = null;
let brokerCaPem = '';

function writeMaterial(brokerCerts) {
    fs.rmSync(WORK, { recursive: true, force: true });
    fs.mkdirSync(path.join(WORK, 'tls', 'trust'), { recursive: true });
    const ca = makeCA('smu-e2e CA');
    // `gateway` and `direct` are the names the browser container reaches them
    // by; both serve this certificate.
    const gateway = issueCert(ca, { cn: 'localhost', dns: ['localhost', 'gateway', 'direct'], ip: [GATEWAY.host] });
    caPem = ca.certPem;
    runCA = ca;
    gatewayPair = gateway;
    tlsKeys['gateway key'] = keyLine(gateway.keyPem);
    // tls/ is the gateway's /tls, mounted writable (docker/docker-compose.e2e.yaml)
    // so the console can replace the pair and add or delete CA files: the gateway's
    // own user (65532) has to create files in both directories, so they are
    // world-writable here, which is throwaway material for one run. chmod, not
    // the mkdir's mode, which a restrictive umask would narrow. The files the
    // gateway writes stay in these directories, where teardown removes them.
    fs.chmodSync(path.join(WORK, 'tls'), 0o777);
    fs.chmodSync(path.join(WORK, 'tls', 'trust'), 0o777);
    const put = (name, text) => {
        const file = path.join(WORK, name);
        fs.writeFileSync(file, text);
        fs.chmodSync(file, 0o644);
    };
    // Only the certificates from the CA file, whatever else it holds.
    brokerCaPem = brokerCerts.map((c) => c.toString()).join('');
    put(`tls/trust/${TRUST_FILE}`, brokerCaPem);
    put('tls/tls.crt', gateway.certPem);
    put('tls/tls.key', gateway.keyPem);
    put('admin-password', `${secrets.bootstrapPassword}\n`);
    const servers = dnsServers(broker.dns);
    if (broker.brokerIp || servers.length) put(path.basename(OVERRIDE), resolutionOverride(broker.host, broker.brokerIp, servers));
    // The repo's package.json says "type": "module", so the SDK's UMD bundle
    // is loaded from a .cjs copy.
    fs.copyFileSync(SOLCLIENT, path.join(WORK, 'solclient.cjs'));
}

// --- HTTP ----------------------------------------------------------------------

// Every gateway response, for the secret sweep (check 13).
const records = [];
const rawHeaderText = (res) => res.rawHeaders.reduce((s, v, i) => s + (i % 2 ? `${v}\r\n` : `${v}: `), '');

function noteCookies(lines) {
    for (const line of lines) {
        const c = parseSetCookie(line);
        if (c?.name === SESSION_COOKIE && c.value) cookies[`session cookie ${Object.keys(cookies).length + 1}`] = c.value;
        if (c?.name === SIGNIN_COOKIE && c.value) cookies[`sign-in ticket ${Object.keys(cookies).length + 1}`] = c.value;
    }
}

/** A request to one of the gateways (`at`: GATEWAY, the default, or DIRECT); every response joins `records`. */
function request(method, pathname, { at = GATEWAY, jar, form, json, body, headers = {} } = {}) {
    const h = { ...headers };
    let payload = body;
    if (form) { payload = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    if (json) { payload = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    if (jar?.header()) h.Cookie = jar.header();
    if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);
    return new Promise((resolve, reject) => {
        const req = https.request({ ...at, path: pathname, method, headers: h, ca: caPem, agent: false }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                const setCookie = res.headers['set-cookie'] ?? [];
                noteCookies(setCookie);
                jar?.store(setCookie);
                records.push({ label: `${tag(at === DIRECT)}${method} ${pathname} -> ${res.statusCode}`, headers: rawHeaderText(res), body: text });
                resolve({ status: res.statusCode, headers: res.headers, body: text, setCookie });
            });
        });
        req.on('error', reject);
        req.setTimeout(30_000, () => req.destroy(new Error(`${tag(at === DIRECT)}${method} ${pathname}: no answer in 30s`)));
        req.end(payload);
    });
}

function errorCode(res) {
    try { return JSON.parse(res.body).error ?? ''; } catch { return ''; }
}

const signIn = (jar, username, password) => request('POST', '/login', { jar, form: { username, password } });

// The admin console's whole-record saves carry the rev the record was read at
// (go-web-proxy: 400 rev_required without it). These read it just before the
// save, as the page does after a load.
async function readRev(jar, list, key, name) {
    const res = await request('GET', `/managed/${list}`, { jar });
    expect(res.status === 200, `GET /managed/${list}: want 200, got ${res.status} ${res.body.slice(0, 200)}`);
    return listedRev(res.body, list, key, name);
}

/** PUT of a user at the rev the list shows now, 0 (a create) when the user is not listed. */
async function saveUser(jar, name, record) {
    const rev = (await readRev(jar, 'users', 'username', name)) ?? 0;
    return request('PUT', `/managed/users/${enc(name)}`, { jar, json: { ...record, rev } });
}

/** PUT of settings keys at the rev GET /managed/settings shows now. */
async function saveSettings(jar, keys) {
    const res = await request('GET', '/managed/settings', { jar });
    const rev = res.status === 200 ? JSON.parse(res.body).rev : '';
    expect(typeof rev === 'string' && rev !== '', `GET /managed/settings: want 200 with a rev, got ${res.status} ${res.body.slice(0, 200)}`);
    return request('PUT', '/managed/settings', { jar, json: { ...keys, rev } });
}

/** GET /managed/tls: the certificate, the CA files and whether each can be changed, parsed. */
async function tlsView(jar) {
    const res = await request('GET', '/managed/tls', { jar });
    expect(res.status === 200, `GET /managed/tls: want 200, got ${res.status} ${res.body.slice(0, 300)}`);
    return JSON.parse(res.body);
}

/** The fingerprint of the certificate the Provisioned gateway presents to a new TLS connection now. */
const servedFingerprint = () => tlsFingerprint({ ...GATEWAY, servername: 'localhost' });

const pairBody = (pair) => ({ certificate: pair.certPem, key: pair.keyPem });

/**
 * Why a 422 invalid answer is not the refusal wanted ('' when it is): the
 * field it names, and a reason that matches `reason`.
 */
function invalidProblem(res, field, reason) {
    const problem = refusalProblem(res, { status: 422, error: 'invalid' });
    if (problem) return problem;
    const body = JSON.parse(res.body);
    return body.field === field && reason.test(body.reason ?? '') ? '' : `want field ${field} with a reason matching ${reason}, got ${res.body.slice(0, 300)}`;
}

/** Puts the gateway's own certificate and key back when it shows another, and checks that the next TLS connection is served it. */
async function restoreCertificate(jar) {
    const want = certFingerprint(gatewayPair.certPem);
    if ((await tlsView(jar)).certificate?.sha256 !== want) {
        const res = await request('PUT', '/managed/tls/certificate', { jar, json: pairBody(gatewayPair) });
        expect(res.status === 200, `want 200, got ${res.status} ${res.body.slice(0, 200)}`);
    }
    const served = await servedFingerprint();
    expect(served === want, `the gateway serves ${served}, want ${want}`);
}

/** Adds the broker's CA file back when the trust directory lacks it. */
async function restoreTrustFile(jar) {
    if ((await tlsView(jar)).trust.some((f) => f.name === TRUST_FILE)) return;
    const res = await request('POST', '/managed/tls/trust', { jar, json: { name: TRUST_FILE, certificate: brokerCaPem } });
    expect(res.status === 200, `want 200, got ${res.status} ${res.body.slice(0, 200)}`);
}

/** A second administrator session: its own jar, signed in as the admin. */
async function adminSession() {
    const jar = createCookieJar();
    const res = await signIn(jar, 'admin', secrets.adminPassword);
    expect(res.status === 303 && res.headers.location === '/', `a second admin sign-in: want 303 to /, got ${res.status} ${res.headers.location ?? ''}`);
    return jar;
}

/** Creates the scratch user (a create is rev 0); returns its rev. */
async function createScratch(jar, password = secrets.scratchPassword) {
    const res = await request('PUT', `/managed/users/${SCRATCH}`, { jar, json: { password, ...userRecord(false), rev: 0 } });
    expect(res.status === 200, `creating ${SCRATCH}: want 200, got ${res.status} ${res.body}`);
    const { rev } = JSON.parse(res.body);
    expect(Number.isInteger(rev) && rev >= 1, `creating ${SCRATCH}: want a rev from 1, got ${res.body}`);
    return rev;
}

/** Removes the scratch user when it is there, at the rev the list shows now. */
async function removeScratch(jar) {
    const rev = await readRev(jar, 'users', 'username', SCRATCH);
    if (rev === null) return;
    const res = await request('DELETE', `/managed/users/${SCRATCH}?rev=${rev}`, { jar });
    expect(res.status === 204, `removing ${SCRATCH}: want 204, got ${res.status} ${res.body}`);
}

/** The login.twoFactor the harness last saved: the gateway starts with optional, and the two-factor checks put it back. */
let twoFactorMode = 'optional';

/** Sets login.twoFactor (optional, admins or mandatory); the gateway reads it at each sign-in. */
async function setTwoFactorMode(jar, mode) {
    const res = await saveSettings(jar, { login: { twoFactor: mode } });
    expect(res.status === 200, `setting login.twoFactor ${mode}: want 200, got ${res.status} ${res.body.slice(0, 200)}`);
    twoFactorMode = mode;
}

/** The Set-Cookie lines that issue a session cookie with a value. */
const issuesSession = (res) => res.setCookie.some((l) => {
    const c = parseSetCookie(l);
    return c?.name === SESSION_COOKIE && c.value !== '';
});

/** Where a response redirects to, without its query: the redirect's page. */
const redirectPage = (res) => (res.status === 303 ? (res.headers.location ?? '').split('?')[0] : `${res.status}`);

/**
 * A code the gateway will take now and has not taken yet for this secret (the
 * steps at or below `last` are used up): waits for the next 30 second step when
 * both of the usable ones are spent. { code, step }.
 */
async function freshCode(secret, last) {
    for (;;) {
        const f = freshTotp(secret, Date.now(), last);
        if (f) return f;
        await sleep(1000);
    }
}

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
// Every bridge and SMF session the run opens, closed at its end (runChecks).
const closers = [];

/**
 * A loopback WebSocket bridge: the SDK connects to ws://127.0.0.1:<port>/..., and
 * each upgrade is replayed to one of the gateways (`at`) over TLS with a
 * same-origin Origin and, for the Provisioned gateway, the session cookie
 * added, then both sockets are piped together.
 */
function startBridge({ at = GATEWAY, cookie } = {}) {
    const sockets = new Set();
    const closeWaiters = [];
    let lastRefusal = '';
    const server = http.createServer((_req, res) => res.writeHead(404).end());
    server.on('upgrade', (req, client, head) => {
        client.on('error', () => {});
        sockets.add(client);
        const headers = { Connection: 'Upgrade', Upgrade: 'websocket', Origin: at === DIRECT ? DIRECT_ORIGIN : ORIGIN };
        if (cookie) headers.Cookie = cookie;
        for (const h of WS_HEADERS) if (req.headers[h]) headers[h] = req.headers[h];
        const up = https.request({ ...at, path: req.url, method: 'GET', headers, ca: caPem, agent: false });
        up.on('upgrade', (res, gw, gwHead) => {
            gw.on('error', () => {});
            sockets.add(gw);
            records.push({ label: `${tag(at === DIRECT)}GET ${req.url} (bridge) -> 101`, headers: rawHeaderText(res), body: '' });
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
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        const bridge = {
            port: server.address().port,
            refusal: () => lastRefusal || 'none',
            nextGatewayClose: (ms) => withTimeout(new Promise((r) => closeWaiters.push(r)), ms, `the gateway did not close the SMF socket within ${ms / 1000}s`),
            close: () => { for (const s of sockets) s.destroy(); server.close(); },
        };
        closers.push(bridge.close);
        resolve(bridge);
    }));
}

let solaceSdk = null;

/** The SDK under Node, initialised once: checks 6 and 11 and D3 share it. */
function loadSolace() {
    if (solaceSdk) return solaceSdk;
    const solace = createRequire(import.meta.url)(path.join(WORK, 'solclient.cjs'));
    const fp = new solace.SolclientFactoryProperties();
    fp.profile = solace.SolclientFactoryProfiles.version10;
    fp.logLevel = solace.LogLevel.WARN;
    const sdkLog = (...a) => say(`solclient: ${a.join(' ')}`);
    fp.logger = { trace() {}, debug() {}, info: sdkLog, warn: sdkLog, error: sdkLog, fatal: sdkLog };
    solace.SolclientFactory.init(fp);
    solaceSdk = solace;
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
    closers.push(() => session.dispose());
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
    const up = compose(['up', '-d', 'gateway', 'direct', ...(browserOn() ? ['browser'] : [])]);
    expect(up.code === 0, 'docker compose up failed (output above); both gateways use the image `./scripts/dev.sh image` builds, '
        + 'and the browser container pulls the Playwright image the compose file pins');
    await waitFor('the gateway', 60, async () => (await request('GET', '/hosted')).status === 200, 'gateway');
    await waitFor('the direct gateway', 60, async () => (await request('GET', '/hosted', { at: DIRECT })).status === 200, 'direct');
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
        const r = await request('PUT', `/managed/connections/${name}`, { jar: admin, json: { ...connection, rev: 0 } });
        expect(r.status === 200, `PUT /managed/connections/${name}: want 200, got ${r.status} ${r.body}`);
    }
    const u = await request('PUT', `/managed/users/${USER}`, {
        jar: admin,
        json: { password: secrets.userPassword, ...userRecord(true), rev: 0 },
    });
    expect(u.status === 200, `PUT /managed/users/${USER}: want 200, got ${u.status} ${u.body}`);
    return admin;
}

// --- checks ------------------------------------------------------------------------

const results = [];

/** What a check returns when it proved less than its title says: it counts as skipped, not passed. */
const skip = (reason) => ({ skipped: reason });

async function check(n, title, fn) {
    try {
        const detail = await fn();
        if (detail?.skipped) {
            results.push({ n, ok: true, skipped: true });
            say(`SKIP ${n}. ${title} (${detail.skipped})`);
            return;
        }
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
            bridge = await startBridge({ cookie: user.header() });
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
            const socketUnknown = await upgrade(`/managed/smf/no-such-broker/${vpnPath}`, { cookie: user.header(), origin: ORIGIN });
            expect(socket.status === socketUnknown.status && socket.error === socketUnknown.error, `socket: got ${socket.status} ${socket.error}, unknown broker ${socketUnknown.status} ${socketUnknown.error}`);
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

        await check(10, 'the Direct relay is a plain 404 in Provisioned mode, with or without a session, for HTTP and WebSocket', async () => {
            const s = await signIn(user, USER, secrets.userPassword);
            expect(s.status === 303, `signing the user in again (check 9 signed out): want 303, got ${s.status}`);
            // The broker's own credential: a relay that let the request through
            // would answer 200, not the broker's 401.
            for (const [who, jar] of [['with a session', user], ['without one', null]]) {
                const r = await request('GET', directSempPath(), { jar, headers: sempAuth() });
                expect(r.status === 404 && r.body === '404 page not found\n', `${who}: want a plain 404, got ${r.status} ${r.body.slice(0, 200)}`);
            }
            const ws = await upgrade(`/wss/${broker.smfPort}/${broker.host}`, { cookie: user.header(), origin: ORIGIN });
            expect(ws.status === 404, `a WebSocket to /wss/${broker.smfPort}/${broker.host}: want 404, got ${ws.status}`);
        });

        await check(11, "taking the user's grant away closes their open SMF socket at once and keeps their session, without the broker, until it is restored", async () => {
            expect(dial, 'no dial answer (check 5)');
            expect(user.get(SESSION_COOKIE), 'no user session (check 10)');
            const rb = await startBridge({ cookie: user.header() });
            const rs = await openSession(loadSolace(), rb, dial);
            const closed = rb.nextGatewayClose(10_000);
            closed.catch(() => {});
            let restored = null;
            try {
                // No password and the same admin flag: the sessions stay, and
                // only the sockets that lost their grant close.
                const revoked = await saveUser(admin, USER, userRecord(false));
                expect(revoked.status === 200, `revoking: want 200, got ${revoked.status} ${revoked.body}`);
                await closed;
                await withTimeout(rs.down, 10_000, 'the gateway closed the socket but the SDK did not report the session down within 10s');
                const me = await request('GET', '/managed/me', { jar: user });
                expect(me.status === 200 && JSON.parse(me.body).brokers?.length === 0,
                    `/managed/me after the revocation: want 200 with no broker, got ${me.status} ${me.body.slice(0, 300)}`);
                const relay = await request('GET', `/managed/relay/${BROKER}/SEMP/v2/monitor/msgVpns/${vpnPath}`, { jar: user });
                const dialed = await request('POST', '/managed/dial', { jar: user, json: { broker: BROKER, vpn } });
                expect(relay.status === 404 && dialed.status === 404,
                    `${BROKER} after the revocation: relay ${relay.status}, dial ${dialed.status}; want 404 for both`);
            } finally {
                restored = await saveUser(admin, USER, userRecord(true));
            }
            expect(restored.status === 200, `restoring the grant: want 200, got ${restored.status} ${restored.body}`);
            const back = await request('GET', '/managed/me', { jar: user });
            expect(back.status === 200 && JSON.parse(back.body).brokers?.map((b) => b.broker).join() === BROKER,
                `/managed/me after the restore: ${back.status} ${back.body.slice(0, 300)}`);
        });

        await check(12, 'settings apply to the next request: userDefault none empties the modules, connModes direct is refused, and both opens the Direct relay and the app', async () => {
            const put = (json) => saveSettings(admin, json);
            const fresh = (r) => {
                if (r.status !== 200) return false;
                const body = JSON.parse(r.body);
                return typeof body.rev === 'string' && body.rev !== '' && Object.keys(body).length === 1;
            };
            const modules = async () => JSON.parse((await request('GET', '/managed/me', { jar: user })).body).modules;
            let restored = null;
            try {
                const none = await put({ modules: { userDefault: 'none' } });
                expect(fresh(none), `PUT modules.userDefault none: want 200 {"rev":"..."}, got ${none.status} ${none.body}`);
                const emptied = await modules();
                expect(Array.isArray(emptied) && emptied.length === 0, `/managed/me modules: ${JSON.stringify(emptied)}`);
                const direct = await put({ connModes: 'direct' });
                const refusal = direct.status === 422 ? JSON.parse(direct.body) : {};
                expect(refusal.error === 'invalid' && refusal.field === 'connModes' && refusal.reason === DIRECT_REFUSAL,
                    `PUT connModes direct: want 422 invalid, got ${direct.status} ${direct.body}`);
                const saved = JSON.parse((await request('GET', '/managed/settings', { jar: admin })).body).settings?.connModes;
                expect(saved === 'provisioned', `connModes after the refusal: ${saved}`);
                const both = await put({ connModes: 'both' });
                expect(fresh(both), `PUT connModes both: want 200 {"rev":"..."}, got ${both.status} ${both.body}`);
                const hosted = JSON.parse((await request('GET', '/hosted')).body);
                expect(hosted.connModes === 'both', `/hosted under both: ${JSON.stringify(hosted)}`);
                const relayed = await request('GET', directSempPath(), { headers: sempAuth() });
                expect(relayed.status === 200 && JSON.parse(relayed.body).data?.queueName === queue,
                    `the Direct relay under both: want 200 naming ${queue}, got ${relayed.status} ${relayed.body.slice(0, 300)}`);
                const app = await request('GET', '/');
                expect(app.status === 200 && app.body.includes('conn-panel-managed'),
                    `/ without a session under both: want 200 with the Provisioned app, got ${app.status} ${app.headers.location ?? ''}`);
            } finally {
                restored = await put({ connModes: 'provisioned', modules: { userDefault: 'all' } });
            }
            expect(fresh(restored), `restoring provisioned and all: got ${restored.status} ${restored.body}`);
            const closedAgain = await request('GET', directSempPath(), { headers: sempAuth() });
            expect(closedAgain.status === 404, `the Direct relay after the restore: want 404, got ${closedAgain.status}`);
            const gated = await request('GET', '/');
            expect(gated.status === 303 && gated.headers.location === '/login',
                `/ without a session after the restore: want 303 to /login, got ${gated.status} ${gated.headers.location ?? ''}`);
            const back = await modules();
            expect(back?.join() === 'queue-browser,queue-copy,queue-subscription-explorer', `/managed/me modules after the restore: ${JSON.stringify(back)}`);
        });

        // Before check 13, which then sweeps what the browser received too,
        // and before the restart of check 15, which ends every session.
        if (browserOn()) await runBrowserChecks(admin);

        // Gateway mode, on the direct service: before the sweeps of checks 13
        // and 17, which cover its responses and its log.
        await runDirectChecks();

        await check(14, 'both stores are sealed at rest (SMUS header, no plaintext)', async () => {
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

        // Numbered after the rest, run here: it needs the admin's session and a
        // running gateway, which the restart (15) and the stop (16) end.
        await check(18, 'Backup & Restore: an export opens and previews as no change, a scheduled run writes a sealed file into /backup that downloads as written, and a Merge import of it keeps the admin signed in', async () => {
            const pass = secrets.backupPassphrase;
            const api = (method, pathname, json) => request(method, pathname, { jar: admin, json });
            const status = async () => JSON.parse((await api('GET', '/managed/backup')).body);
            expect((await status()).dirProblem === '', `dirProblem: ${(await status()).dirProblem}`);
            const ex = await api('POST', '/managed/backup/export', { passphrase: pass });
            expect(ex.status === 200, `export: ${ex.status} ${ex.body.slice(0, 200)}`);
            const { content } = JSON.parse(ex.body);
            // A stored hash starts pbkdf2-sha256$; the envelope names its kdf "pbkdf2-sha256".
            const clear = findTokens(content, [...Object.values(sweepable()), broker.host, 'pbkdf2-sha256$']);
            expect(clear.length === 0, `the export holds ${clear.join(', ')} in clear`);
            const pv = await api('POST', '/managed/backup/preview', { file: content, passphrase: pass });
            const p = JSON.parse(pv.body);
            const changes = [p.users, p.connections].flatMap((d) => [...d.added, ...d.changed, ...d.removed]).concat(p.settings);
            expect(pv.status === 200 && changes.length === 0, `preview of an unchanged gateway: ${pv.status} ${pv.body.slice(0, 300)}`);
            // A new schedule is rev 0; the answer carries its rev, which the delete below sends.
            const put = await api('PUT', '/managed/backup/schedule', { kind: 'daily', minute: 0, hour: 3, weekday: 0, day: 0, keep: 2, passphrase: pass, rev: 0 });
            expect(put.status === 200 && Number.isInteger(JSON.parse(put.body).rev), `schedule: want 200 with a rev, got ${put.status} ${put.body}`);
            const scheduleRev = JSON.parse(put.body).rev;
            const run = await api('POST', '/managed/backup/run');
            expect(run.status === 200, `run: ${run.status} ${run.body}`);
            const { file } = JSON.parse(run.body);
            const st = await status();
            expect(st.files.some((f) => f.name === file) && st.lastRun?.file === file && st.nextRun, `status after the run: ${JSON.stringify(st).slice(0, 300)}`);
            const dest = path.join(WORK, 'scheduled-backup.json');
            const cp = compose(['cp', `gateway:/backup/${file}`, dest], { quiet: true });
            expect(cp.code === 0, `docker compose cp ${file}: ${cp.out.trim()}`);
            const onDisk = findTokens(fs.readFileSync(dest, 'utf8'), [...Object.values(sweepable()), broker.host, 'pbkdf2-sha256$']);
            expect(onDisk.length === 0, `${file} holds ${onDisk.join(', ')} in clear`);
            const dl = await api('GET', `/managed/backup/files/${file}`);
            expect(dl.status === 200 && JSON.parse(dl.body).content === fs.readFileSync(dest, 'utf8'), `download of ${file}: ${dl.status} ${dl.body.slice(0, 200)}`);
            // The import carries the basis of a preview of the file it imports.
            const pvFile = await api('POST', '/managed/backup/preview', { backup: file, passphrase: pass });
            expect(pvFile.status === 200 && JSON.parse(pvFile.body).basis, `preview of ${file}: ${pvFile.status} ${pvFile.body.slice(0, 300)}`);
            const imp = await api('POST', '/managed/backup/import', {
                backup: file, passphrase: pass, users: 'merge', connections: 'merge', settings: 'replace', basis: JSON.parse(pvFile.body).basis,
            });
            expect(imp.status === 200 && imp.body.includes('"signedOut":false'), `import: ${imp.status} ${imp.body}`);
            expect((await api('GET', '/managed/me')).status === 200, 'the admin was signed out by an import that changed nothing');
            expect((await api('DELETE', `/managed/backup/schedule?rev=${scheduleRev}`)).status === 204, 'removing the schedule');
            return file;
        });

        // Several administrators: every whole-record save and the import carry the
        // version they were read at, so a second session cannot overwrite the
        // first without knowing. After 18 (which ends with the import) and before
        // 19, whose audit trail then holds these writes too. Each check makes and
        // removes its own scratch user.
        await check(20, 'two admin sessions open one user: the first save wins, the second is refused as stale with the current rev, and saves after a reload', async () => {
            const second = await adminSession();
            const url = `/managed/users/${SCRATCH}`;
            try {
                const made = await createScratch(admin);
                const revA = await readRev(admin, 'users', 'username', SCRATCH);
                const revB = await readRev(second, 'users', 'username', SCRATCH);
                expect(revA === made && revB === made, `both sessions read rev ${made}: got ${revA} and ${revB}`);
                const first = await request('PUT', url, { jar: admin, json: { ...userRecord(true), rev: revA } });
                expect(first.status === 200, `the first save: want 200, got ${first.status} ${first.body}`);
                const won = JSON.parse(first.body).rev;
                expect(Number.isInteger(won) && won > revA, `the first save's rev ${won} must be above ${revA}`);
                const late = await request('PUT', url, { jar: second, json: { ...userRecord(false), rev: revB } });
                const refused = refusalProblem(late, { status: 409, error: 'stale', rev: won });
                expect(refused === '', `the second save: ${refused}`);
                const reloaded = await readRev(second, 'users', 'username', SCRATCH);
                expect(reloaded === won, `after a reload the second session reads rev ${reloaded}, want ${won}`);
                const again = await request('PUT', url, { jar: second, json: { ...userRecord(false), rev: reloaded } });
                expect(again.status === 200, `the second save after a reload: want 200, got ${again.status} ${again.body}`);
                return `rev ${made} -> ${won} -> ${JSON.parse(again.body).rev}`;
            } finally {
                await removeScratch(admin);
            }
        });

        await check(21, "one admin session deletes a user: the other session's save is refused as not_found, and so is its delete", async () => {
            const second = await adminSession();
            const url = `/managed/users/${SCRATCH}`;
            try {
                const made = await createScratch(admin);
                expect(await readRev(second, 'users', 'username', SCRATCH) === made, `the second session reads rev ${made}`);
                const del = await request('DELETE', `${url}?rev=${made}`, { jar: admin });
                expect(del.status === 204, `the delete: want 204, got ${del.status} ${del.body}`);
                const save = await request('PUT', url, { jar: second, json: { ...userRecord(true), rev: made } });
                const savedRefusal = refusalProblem(save, { status: 404, error: 'not_found' });
                expect(savedRefusal === '', `the save of a deleted user: ${savedRefusal}`);
                const again = await request('DELETE', `${url}?rev=${made}`, { jar: second });
                const deletedRefusal = refusalProblem(again, { status: 404, error: 'not_found' });
                expect(deletedRefusal === '', `the delete of a deleted user: ${deletedRefusal}`);
            } finally {
                await removeScratch(admin);
            }
        });

        await check(22, 'an import is refused as stale after another session changed the users since the preview, and applies after a new preview', async () => {
            const second = await adminSession();
            const pass = secrets.importPassphrase;
            const api = (method, pathname, json) => request(method, pathname, { jar: admin, json });
            const sections = { users: 'merge', connections: 'skip', settings: 'skip' };
            try {
                const ex = await api('POST', '/managed/backup/export', { passphrase: pass });
                expect(ex.status === 200, `export: ${ex.status} ${ex.body.slice(0, 200)}`);
                const { content } = JSON.parse(ex.body);
                const preview = async () => {
                    const pv = await api('POST', '/managed/backup/preview', { file: content, passphrase: pass });
                    expect(pv.status === 200 && JSON.parse(pv.body).basis, `preview: ${pv.status} ${pv.body.slice(0, 300)}`);
                    return JSON.parse(pv.body).basis;
                };
                const seen = await preview();
                await createScratch(second);
                const late = await api('POST', '/managed/backup/import', { file: content, passphrase: pass, ...sections, basis: seen });
                const refused = refusalProblem(late, { status: 409, error: 'stale' });
                expect(refused === '', `the import after the other session's change: ${refused}`);
                const moved = basisMoved(seen, JSON.parse(late.body).basis);
                expect(moved.join() === 'users', `the stale answer should name the users as moved, and only them: ${moved.join() || 'nothing'}`);
                const again = await api('POST', '/managed/backup/import', { file: content, passphrase: pass, ...sections, basis: await preview() });
                expect(again.status === 200 && again.body.includes('"signedOut":false'), `the import after a new preview: ${again.status} ${again.body}`);
            } finally {
                await removeScratch(admin);
            }
        });

        await check(23, "a user changes their own password while an admin holds that user's rev: the admin's save still succeeds and keeps the new password", async () => {
            const person = createCookieJar();
            try {
                const made = await createScratch(admin);
                expect(await readRev(admin, 'users', 'username', SCRATCH) === made, `the admin reads rev ${made}`);
                const s = await signIn(person, SCRATCH, secrets.scratchPassword);
                expect(s.status === 303 && s.headers.location === '/', `the scratch user's sign-in: want 303 to /, got ${s.status} ${s.headers.location ?? ''}`);
                const changed = await request('POST', '/login/password', {
                    jar: person, form: { current: secrets.scratchPassword, new: secrets.scratchNewPassword, confirm: secrets.scratchNewPassword },
                });
                expect(changed.status === 303, `the own password change: want 303, got ${changed.status}`);
                // No password in the save (keep what the user set) and the same record: the rev did not move.
                const save = await request('PUT', `/managed/users/${SCRATCH}`, { jar: admin, json: { ...userRecord(false), rev: made } });
                expect(save.status === 200, `the admin's save at rev ${made}: want 200, got ${save.status} ${save.body}`);
                expect(JSON.parse(save.body).rev === made, `a password change alone must keep the rev ${made}, got ${save.body}`);
                const back = await signIn(createCookieJar(), SCRATCH, secrets.scratchNewPassword);
                expect(back.status === 303, `the new password after the admin's save: want 303, got ${back.status}`);
                const old = await signIn(createCookieJar(), SCRATCH, secrets.scratchPassword);
                expect(old.status === 401, `the old password after the admin's save: want 401, got ${old.status}`);
            } finally {
                await removeScratch(admin);
            }
        });

        // Two-factor sign-in on the scratch user, in order: 24 sets it up (the
        // secret is read off the page), 25 and 26 sign in with a code and with a
        // recovery code, 27 resets it as an administrator under `mandatory`. Each
        // sets the mode it needs; the finally puts the mode back to optional and removes
        // the user whatever a check found, because the audit check (19) and the
        // restart (15) after them expect the gateway as it was.
        const tf = { secret: '', recovery: [], last: -1 };
        try {
            await check(24, "with login.twoFactor optional the user sets two-factor up on /login/two-factor with their password and a code for the secret on the page, is shown 10 recovery codes once, and their other session ends", async () => {
                await createScratch(admin);
                await setTwoFactorMode(admin, 'optional');
                const other = createCookieJar();
                const here = createCookieJar();
                for (const jar of [other, here]) {
                    const s = await signIn(jar, SCRATCH, secrets.scratchPassword);
                    expect(s.status === 303 && s.headers.location === '/', `sign-in before set-up (optional asks nobody for a code): want 303 to /, got ${s.status} ${s.headers.location ?? ''}`);
                }
                const before = await request('GET', '/managed/me', { jar: other });
                expect(before.status === 200 && JSON.parse(before.body).twoFactor?.enrolled === false, `/managed/me before set-up: ${before.status} ${before.body.slice(0, 300)}`);
                const page = await request('GET', '/login/two-factor', { jar: here });
                expect(page.status === 200 && page.body.includes('name="step" value="verify"'), `GET /login/two-factor signed in: want the set-up page, got ${page.status}`);
                expect(!page.body.includes('name="code"'), 'a user without two-factor is asked for no code on the set-up page');
                // The wrong password stops before a secret exists.
                const wrongPassword = await request('POST', '/login/two-factor', { jar: here, form: { step: 'verify', password: secrets.scratchNewPassword, next: '/' } });
                expect(wrongPassword.status === 401 && !twoFactorSecretFromPage(wrongPassword.body) && !here.get(SIGNIN_COOKIE),
                    `a wrong password at the set-up: want 401, no secret and no ticket cookie, got ${wrongPassword.status}`);
                const verify = await request('POST', '/login/two-factor', { jar: here, form: { step: 'verify', password: secrets.scratchPassword, next: '/' } });
                expect(verify.status === 200, `the set-up password step: want 200 with the enrol page, got ${verify.status} ${verify.body.slice(0, 200)}`);
                const secret = twoFactorSecretFromPage(verify.body);
                expect(secret !== null, 'the enrol page has no <code id="two-factor-secret"> of eight groups of four base32 characters');
                twoFactor.secret = secret;
                twoFactor['secret in groups'] = secret.match(/.{4}/g).join(' ');
                const ticket = signinCookieProblems(verify.setCookie);
                expect(ticket.length === 0, `the set-up ticket cookie: ${ticket.join(', ')}`);
                // Nothing is stored until a right code arrives: the wrong one is refused with the same secret.
                const wrong = await request('POST', '/login/two-factor', { jar: here, form: { step: 'confirm', code: wrongTotp(secret, Date.now()), next: '/' } });
                expect(wrong.status === 401 && wrong.body.includes('The code is not correct.') && twoFactorSecretFromPage(wrong.body) === secret,
                    `a wrong code at the confirm step: want 401 with the same secret, got ${wrong.status}`);
                const stillOff = await request('GET', '/managed/users', { jar: admin });
                const offRow = listedRow(stillOff.body, 'users', 'username', SCRATCH);
                expect(offRow?.twoFactor === false, `the user list after a wrong code: want two-factor Off, got ${JSON.stringify(offRow)}`);
                const f = await freshCode(secret, -1);
                const confirm = await request('POST', '/login/two-factor', { jar: here, form: { step: 'confirm', code: f.code, next: '/' } });
                expect(confirm.status === 200, `the confirm step: want 200 with the recovery page, got ${confirm.status} ${confirm.body.slice(0, 200)}`);
                tf.secret = secret;
                tf.last = f.step;
                const codes = recoveryCodesFromPage(confirm.body);
                const bad = recoveryCodeProblems(codes);
                expect(bad === '', `the recovery page: ${bad}`);
                codes.forEach((c, i) => {
                    twoFactor[`recovery code ${i + 1}`] = c;
                    twoFactor[`recovery code ${i + 1} plain`] = c.replace(/-/g, '');
                });
                tf.recovery = codes;
                expect(continueLinkFromPage(confirm.body) === '/', `the Continue link: want /, got ${continueLinkFromPage(confirm.body)}`);
                expect(!here.get(SIGNIN_COOKIE), 'the ticket cookie outlived the set-up');
                // The browser that set it up stays signed in; the other session ends.
                const mine = await request('GET', '/managed/me', { jar: here });
                expect(mine.status === 200 && JSON.parse(mine.body).twoFactor?.enrolled === true, `/managed/me for the browser that set it up: ${mine.status} ${mine.body.slice(0, 300)}`);
                const ended = await request('GET', '/managed/me', { jar: other });
                expect(ended.status === 401, `the other session after the set-up: want 401, got ${ended.status}`);
                // The codes are shown once: the page that follows asks for a code and lists none.
                const again = await request('GET', '/login/two-factor', { jar: here });
                expect(again.status === 200 && again.body.includes('name="code"') && recoveryCodesFromPage(again.body).length === 0,
                    `/login/two-factor after the set-up: want the set-up-again page asking for a code and listing none, got ${again.status}`);
                const listed = await request('GET', '/managed/users', { jar: admin });
                expect(listedRow(listed.body, 'users', 'username', SCRATCH)?.twoFactor === true, 'the user list does not show two-factor On');
            });

            await check(25, 'the next sign-in stops at /login/code with no session cookie, a wrong code is refused, the right one signs in, and the same code again is refused', async () => {
                expect(tf.secret !== '', 'check 24 set no two-factor up, so there is nothing to sign in with');
                await setTwoFactorMode(admin, 'optional');
                const signedIn = async (jar) => (await request('GET', '/managed/me', { jar })).status === 200;
                const jar = createCookieJar();
                const first = await signIn(jar, SCRATCH, secrets.scratchPassword);
                expect(redirectPage(first) === '/login/code', `password sign-in of a user with two-factor: want 303 to /login/code, got ${first.status} ${first.headers.location ?? ''}`);
                expect(!issuesSession(first) && !jar.get(SESSION_COOKIE), 'a session cookie was issued before the code');
                const ticket = signinCookieProblems(first.setCookie);
                expect(ticket.length === 0, `the sign-in ticket cookie: ${ticket.join(', ')}`);
                expect(!(await signedIn(jar)), 'the half-finished sign-in already holds a session');
                const page = await request('GET', '/login/code', { jar });
                expect(page.status === 200 && page.body.includes('name="code"'), `GET /login/code with the ticket: want the code page, got ${page.status}`);
                const wrong = await request('POST', '/login/code', { jar, form: { code: wrongTotp(tf.secret, Date.now()), next: '/' } });
                expect(wrong.status === 401 && wrong.body.includes('The code is not correct.') && !issuesSession(wrong), `a wrong code: want 401 and no session, got ${wrong.status}`);
                expect(!(await signedIn(jar)), 'a wrong code opened a session');
                const f = await freshCode(tf.secret, tf.last);
                const right = await request('POST', '/login/code', { jar, form: { code: f.code, next: '/' } });
                expect(right.status === 303 && right.headers.location === '/', `the right code: want 303 to /, got ${right.status} ${right.headers.location ?? ''}`);
                const problems = sessionCookieProblems(right.setCookie);
                expect(problems.length === 0, `the session cookie after the code: ${problems.join(', ')}`);
                expect(!jar.get(SIGNIN_COOKIE), 'the ticket cookie outlived the sign-in');
                expect(await signedIn(jar), 'the right code did not open a session');
                tf.last = f.step;
                // The same code from a second, fresh sign-in is a replay.
                const replayJar = createCookieJar();
                const second = await signIn(replayJar, SCRATCH, secrets.scratchPassword);
                expect(redirectPage(second) === '/login/code', `second password sign-in: want 303 to /login/code, got ${second.status}`);
                const replay = await request('POST', '/login/code', { jar: replayJar, form: { code: f.code, next: '/' } });
                expect(replay.status === 401 && !issuesSession(replay) && !(await signedIn(replayJar)), `the same code again: want 401 and no session, got ${replay.status}`);
            });

            await check(26, 'a recovery code signs in once and not twice', async () => {
                expect(tf.recovery.length === 10, 'check 24 recorded no recovery codes');
                await setTwoFactorMode(admin, 'optional');
                const code = tf.recovery[0];
                const jar = createCookieJar();
                const first = await signIn(jar, SCRATCH, secrets.scratchPassword);
                expect(redirectPage(first) === '/login/code', `password sign-in: want 303 to /login/code, got ${first.status}`);
                const used = await request('POST', '/login/code', { jar, form: { code, next: '/' } });
                expect(used.status === 303 && used.headers.location === '/', `a recovery code: want 303 to /, got ${used.status} ${used.headers.location ?? ''}`);
                const me = await request('GET', '/managed/me', { jar });
                expect(me.status === 200, `/managed/me after a recovery code: want 200, got ${me.status}`);
                const again = createCookieJar();
                const second = await signIn(again, SCRATCH, secrets.scratchPassword);
                expect(redirectPage(second) === '/login/code', `second password sign-in: want 303 to /login/code, got ${second.status}`);
                const replay = await request('POST', '/login/code', { jar: again, form: { code, next: '/' } });
                expect(replay.status === 401 && replay.body.includes('The code is not correct.') && !issuesSession(replay),
                    `the same recovery code again: want 401 and no session, got ${replay.status}`);
                const gone = await request('GET', '/managed/me', { jar: again });
                expect(gone.status === 401, `/managed/me after the refused code: want 401, got ${gone.status}`);
            });

            await check(27, "with login.twoFactor mandatory a user without two-factor is sent to set it up, and an administrator's reset shows Off in the list, ends the user's sessions and is repeatable", async () => {
                expect(tf.recovery.length === 10, 'check 24 recorded no recovery codes');
                await setTwoFactorMode(admin, 'mandatory');
                try {
                    const jar = createCookieJar();
                    const first = await signIn(jar, SCRATCH, secrets.scratchPassword);
                    expect(redirectPage(first) === '/login/code', `mandatory, enrolled: want 303 to /login/code, got ${first.status}`);
                    const used = await request('POST', '/login/code', { jar, form: { code: tf.recovery[1], next: '/' } });
                    expect(used.status === 303, `a recovery code under mandatory: want 303, got ${used.status}`);
                    const me = await request('GET', '/managed/me', { jar });
                    const profile = me.status === 200 ? JSON.parse(me.body) : {};
                    expect(profile.twoFactor?.mode === 'mandatory' && profile.twoFactor?.enrolled === true, `/managed/me: ${me.status} ${me.body.slice(0, 300)}`);
                    // A reset needs an administrator's session: without one nothing changes.
                    const anonymous = await request('DELETE', `/managed/users/${SCRATCH}/totp`, {});
                    expect(anonymous.status === 401, `a reset without a session: want 401, got ${anonymous.status}`);
                    const listed = await request('GET', '/managed/users', { jar: admin });
                    const row = listedRow(listed.body, 'users', 'username', SCRATCH);
                    expect(row?.twoFactor === true, `the user list before the reset: ${JSON.stringify(row)}`);
                    const reset = await request('DELETE', `/managed/users/${SCRATCH}/totp`, { jar: admin });
                    const rev = reset.status === 200 ? JSON.parse(reset.body).rev : null;
                    expect(Number.isInteger(rev) && rev > row.rev, `the reset: want 200 with a rev above ${row.rev}, got ${reset.status} ${reset.body}`);
                    const after = listedRow((await request('GET', '/managed/users', { jar: admin })).body, 'users', 'username', SCRATCH);
                    expect(after?.twoFactor === false && after.rev === rev, `the user list after the reset: want Off at rev ${rev}, got ${JSON.stringify(after)}`);
                    const ended = await request('GET', '/managed/me', { jar });
                    expect(ended.status === 401, `the user's session after the reset: want 401, got ${ended.status}`);
                    // Nothing left to remove: the same answer, the rev where it was. An unknown user is not_found.
                    const repeat = await request('DELETE', `/managed/users/${SCRATCH}/totp`, { jar: admin });
                    expect(repeat.status === 200 && JSON.parse(repeat.body).rev === rev, `a second reset: want 200 at rev ${rev}, got ${repeat.status} ${repeat.body}`);
                    const unknown = await request('DELETE', '/managed/users/e2e-nobody/totp', { jar: admin });
                    const refusal = refusalProblem(unknown, { status: 404, error: 'not_found' });
                    expect(refusal === '', `a reset of an unknown user: ${refusal}`);
                    // Under mandatory the next sign-in has to set it up before any session exists.
                    const fresh = createCookieJar();
                    const next = await signIn(fresh, SCRATCH, secrets.scratchPassword);
                    expect(redirectPage(next) === '/login/two-factor', `mandatory, not enrolled: want 303 to /login/two-factor, got ${next.status} ${next.headers.location ?? ''}`);
                    expect(!issuesSession(next) && !fresh.get(SESSION_COOKIE), 'a session cookie was issued before two-factor was set up');
                    const ticket = signinCookieProblems(next.setCookie);
                    expect(ticket.length === 0, `the enrol ticket cookie: ${ticket.join(', ')}`);
                    const enrol = await request('GET', '/login/two-factor', { jar: fresh });
                    const secret = enrol.status === 200 ? twoFactorSecretFromPage(enrol.body) : null;
                    expect(secret !== null, `GET /login/two-factor with the ticket: want the enrol page with a secret, got ${enrol.status}`);
                    twoFactor['enrol secret'] = secret;
                    expect((await request('GET', '/managed/me', { jar: fresh })).status === 401, 'a half-finished set-up already holds a session');
                } finally {
                    await setTwoFactorMode(admin, 'optional');
                }
            });
        } finally {
            // Put back what 24-27 changed, even when one of them failed half way.
            for (const [what, undo] of [['the mode', async () => { if (twoFactorMode !== 'optional') await setTwoFactorMode(admin, 'optional'); }], ['the scratch user', () => removeScratch(admin)]]) {
                try {
                    await undo();
                } catch (e) {
                    say(`error: restoring ${what} after the two-factor checks: ${e.message}`);
                }
            }
        }

        // Live TLS and the in-place restart, as the administrator over the
        // gateway's writable /tls. Each check puts back what it changed: 29 the
        // gateway's own certificate, 30 the broker's CA file, 31 a signed-in
        // administrator, since the checks after them (the audit log, the compose
        // restart of 15, the browser's) expect the gateway as it was. The finally
        // looks again whatever a check found.
        try {
            await check(28, "GET /managed/tls shows the gateway's certificate by its fingerprint, the one a new TLS connection is served, the broker's CA file and the image's standard root CAs, trusted, with both files changeable, no path or key in the answer, and the same gate as every admin route", async () => {
                const res = await request('GET', '/managed/tls', { jar: admin });
                expect(res.status === 200, `GET /managed/tls: want 200, got ${res.status} ${res.body.slice(0, 300)}`);
                const view = JSON.parse(res.body);
                const want = certFingerprint(gatewayPair.certPem);
                const cert = view.certificate ?? {};
                expect(cert.sha256 === want, `the certificate's sha256: want ${want}, got ${cert.sha256}`);
                expect(cert.selfSigned === false && cert.expired === false, `selfSigned ${cert.selfSigned}, expired ${cert.expired}: want a CA-signed certificate that is valid`);
                for (const name of ['localhost', 'gateway', 'direct', GATEWAY.host]) {
                    expect(Array.isArray(cert.names) && cert.names.includes(name), `the certificate's names ${JSON.stringify(cert.names)} lack ${name}`);
                }
                expect(view.certificateWritable === true && view.trustWritable === true,
                    `certificateWritable ${view.certificateWritable}, trustWritable ${view.trustWritable}: want both true (the e2e stack mounts /tls writable)`);
                const file = view.trust.find((f) => f.name === TRUST_FILE);
                expect(file && file.problem === '', `the CA files ${JSON.stringify(view.trust.map((f) => [f.name, f.problem]))} lack a good ${TRUST_FILE}`);
                const wantCerts = pemCertificates(brokerCaPem).map((c) => c.fingerprint256);
                expect(JSON.stringify(file.certificates.map((c) => c.sha256)) === JSON.stringify(wantCerts),
                    `${TRUST_FILE} holds ${JSON.stringify(file.certificates.map((c) => c.sha256))}, want ${JSON.stringify(wantCerts)}`);
                // The image's bundle (Mozilla's list, well over 100 roots), on by default.
                const std = view.standard ?? {};
                expect(std.trusted === true && std.problem === '' && Array.isArray(std.certificates) && std.certificates.length >= 100,
                    `the standard root CAs: want the image's bundle, trusted, got trusted ${std.trusted}, ${std.certificates?.length} certificates, problem "${std.problem}"`);
                expect(!/\/tls\/|tls\.key|PRIVATE KEY/.test(res.body), 'the answer names a path or holds key text');
                const served = await servedFingerprint();
                expect(served === want, `a new TLS connection is served ${served}, want ${want}`);
                const anonymous = await request('GET', '/managed/tls');
                expect(anonymous.status === 401, `without a session: want 401, got ${anonymous.status}`);
                const plain = createCookieJar();
                const signedIn = await signIn(plain, USER, secrets.userPassword);
                expect(signedIn.status === 303, `the e2e user's sign-in: want 303, got ${signedIn.status}`);
                const problem = refusalProblem(await request('GET', '/managed/tls', { jar: plain }), { status: 403, error: 'forbidden' });
                expect(problem === '', `as a user who is not an administrator: ${problem}`);
                return `${want.slice(0, 11)}..., ${view.trust.length} CA file(s)`;
            });

            await check(29, 'the check refuses a key that does not match and an expired certificate, and a refused replace swaps nothing; a replace is served by the next TLS connection with no restart, and the original certificate is put back', async () => {
                const names = { cn: 'localhost', dns: ['localhost', 'gateway', 'direct'], ip: [GATEWAY.host] };
                const second = issueCert(runCA, names);
                const stranger = issueCert(runCA, names);
                const expired = issueExpiredCert(runCA, names);
                tlsKeys['replacement key'] = keyLine(second.keyPem);
                tlsKeys['mismatched key'] = keyLine(stranger.keyPem);
                tlsKeys['expired certificate key'] = keyLine(expired.keyPem);
                const original = certFingerprint(gatewayPair.certPem);
                const replacement = certFingerprint(second.certPem);
                const unchanged = async (what) => {
                    const served = await servedFingerprint();
                    const shown = (await tlsView(admin)).certificate?.sha256;
                    expect(served === original && shown === original, `${what}: the gateway serves ${served} and shows ${shown}, want ${original} still`);
                };
                const CHECK = '/managed/tls/certificate/check';
                const REPLACE = '/managed/tls/certificate';
                let restored = '';
                try {
                    const mismatched = { certificate: second.certPem, key: stranger.keyPem };
                    for (const [what, method, route, body, field, reason] of [
                        ['the check of a key that does not match', 'POST', CHECK, mismatched, 'key', /does not match/],
                        ['the replace with a key that does not match', 'PUT', REPLACE, mismatched, 'key', /does not match/],
                        ['the check of an expired certificate', 'POST', CHECK, pairBody(expired), 'certificate', /expired/],
                        ['the replace with an expired certificate', 'PUT', REPLACE, pairBody(expired), 'certificate', /expired/],
                    ]) {
                        const problem = invalidProblem(await request(method, route, { jar: admin, json: body }), field, reason);
                        expect(problem === '', `${what}: ${problem}`);
                        await unchanged(what);
                    }
                    // A good pair, from someone who is not an administrator or has no session, is refused too.
                    const plain = createCookieJar();
                    const signedIn = await signIn(plain, USER, secrets.userPassword);
                    expect(signedIn.status === 303, `the e2e user's sign-in: want 303, got ${signedIn.status}`);
                    const denied = refusalProblem(await request('PUT', REPLACE, { jar: plain, json: pairBody(second) }), { status: 403, error: 'forbidden' });
                    expect(denied === '', `a replace by a user who is not an administrator: ${denied}`);
                    const anonymous = refusalProblem(await request('PUT', REPLACE, { json: pairBody(second) }), { status: 401, error: 'unauthenticated' });
                    expect(anonymous === '', `a replace without a session: ${anonymous}`);
                    await unchanged('a refused replace');
                    // The check describes the leaf and installs nothing.
                    const described = await request('POST', CHECK, { jar: admin, json: pairBody(second) });
                    expect(described.status === 200 && JSON.parse(described.body).certificate?.sha256 === replacement,
                        `the check of a good pair: want 200 describing ${replacement}, got ${described.status} ${described.body.slice(0, 300)}`);
                    await unchanged('the check of a good pair');
                    // The replace swaps at once: the next connection is served the new certificate and the old session still works.
                    const put = await request('PUT', REPLACE, { jar: admin, json: pairBody(second) });
                    expect(put.status === 200 && JSON.parse(put.body).certificate?.sha256 === replacement,
                        `the replace: want 200 describing ${replacement}, got ${put.status} ${put.body.slice(0, 300)}`);
                    const served = await servedFingerprint();
                    expect(served === replacement && served !== original, `the next TLS connection is served ${served}, want ${replacement}`);
                    expect((await tlsView(admin)).certificate?.sha256 === replacement, 'GET /managed/tls does not show the new certificate');
                    const me = await request('GET', '/managed/me', { jar: admin });
                    expect(me.status === 200, `the administrator's session after the replace: want 200 (no restart), got ${me.status}`);
                } finally {
                    try {
                        await restoreCertificate(admin);
                    } catch (e) {
                        restored = e.message;
                        say(`error: putting the gateway's own certificate back after check 29: ${e.message}`);
                    }
                }
                expect(restored === '', `putting the original certificate back: ${restored}`);
                const hits = sweepSecrets(records, tlsKeys);
                expect(hits.length === 0, `a private key is in a response: ${hits.join('; ')}`);
                return `${replacement.slice(0, 11)}... served, then ${original.slice(0, 11)}... again`;
            });

            await check(30, "deleting the broker's CA file makes the relay fail to verify the broker, and adding it back makes it work, both with no restart", async () => {
                if (insecure()) return skip('E2E_INSECURE=1 turns broker verification off, so the CA file proves nothing');
                const jar = createCookieJar();
                const signedIn = await signIn(jar, USER, secrets.userPassword);
                expect(signedIn.status === 303, `the e2e user's sign-in: want 303, got ${signedIn.status}`);
                const relay = () => request('GET', `/managed/relay/${BROKER}/SEMP/v2/monitor/msgVpns/${vpnPath}/queues/${enc(queue)}`, {
                    jar, headers: { Accept: 'application/json' },
                });
                const before = await relay();
                expect(before.status === 200, `with the CA file in place: want 200, got ${before.status} ${before.body.slice(0, 200)}`);
                let detail = '';
                let halfOnly = false;
                let restored = '';
                try {
                    const deleted = await request('DELETE', `/managed/tls/trust/${TRUST_FILE}`, { jar: admin });
                    expect(deleted.status === 200 && !JSON.parse(deleted.body).trust.some((f) => f.name === TRUST_FILE),
                        `deleting ${TRUST_FILE}: want 200 and a list without it, got ${deleted.status} ${deleted.body.slice(0, 300)}`);
                    const without = await relay();
                    if (without.status === 200) {
                        // A broker whose certificate chains to a public root is trusted through the image's standard roots too.
                        halfOnly = true;
                    } else {
                        expect(without.status === 502, `without the CA file: want 502, got ${without.status} ${without.body.slice(0, 200)}`);
                        // Any 502 would do for the status; the gateway's log names why this one failed.
                        const relayLog = compose(['logs', '--no-color', '--tail', '50', 'gateway'], { quiet: true }).out;
                        expect(/semp relay upstream failure.*x509/.test(relayLog), `the gateway log does not name an x509 failure for the relay: ${relayLog.trim().slice(-300)}`);
                        detail = `${without.status} ${errorCode(without)} without the CA file`;
                    }
                    const added = await request('POST', '/managed/tls/trust', { jar: admin, json: { name: TRUST_FILE, certificate: brokerCaPem } });
                    expect(added.status === 200 && JSON.parse(added.body).trust.some((f) => f.name === TRUST_FILE),
                        `adding ${TRUST_FILE} back: want 200 and a list with it, got ${added.status} ${added.body.slice(0, 300)}`);
                    const again = await relay();
                    expect(again.status === 200, `with the CA file added back: want 200, got ${again.status} ${again.body.slice(0, 200)}`);
                    const alive = await request('GET', '/managed/me', { jar });
                    expect(alive.status === 200, `the user's session after both changes: want 200 (no restart), got ${alive.status}`);
                } finally {
                    try {
                        await restoreTrustFile(admin);
                    } catch (e) {
                        restored = e.message;
                        say(`error: adding ${TRUST_FILE} back after check 30: ${e.message}`);
                    }
                }
                expect(restored === '', `adding ${TRUST_FILE} back: ${restored}`);
                return halfOnly
                    ? skip("only adding the file back was proved: the broker's certificate also verifies against the standard root CAs the image carries, so deleting it changes nothing")
                    : detail;
            });

            await check(31, 'POST /managed/restart is refused without a session and for a user who is not an administrator; for the administrator it answers 202 and the gateway starts again in place: the container keeps running, the old sessions are refused, and the administrator signs in again', async () => {
                const plain = createCookieJar();
                const signedIn = await signIn(plain, USER, secrets.userPassword);
                expect(signedIn.status === 303, `the e2e user's sign-in: want 303, got ${signedIn.status}`);
                const anonymous = refusalProblem(await request('POST', '/managed/restart'), { status: 401, error: 'unauthenticated' });
                expect(anonymous === '', `a restart without a session: ${anonymous}`);
                const denied = refusalProblem(await request('POST', '/managed/restart', { jar: plain }), { status: 403, error: 'forbidden' });
                expect(denied === '', `a restart by a user who is not an administrator: ${denied}`);
                const still = await request('GET', '/managed/me', { jar: admin });
                expect(still.status === 200, `the administrator's session after the refused restarts: want 200 (nothing restarted), got ${still.status}`);
                const container = compose(['ps', '--quiet', 'gateway'], { quiet: true }).out.trim();
                expect(/^[0-9a-f]{12,64}$/.test(container), `no gateway container id: ${container}`);
                const res = await request('POST', '/managed/restart', { jar: admin });
                expect(res.status === 202 && JSON.parse(res.body).restarting === true, `want 202 {"restarting":true}, got ${res.status} ${res.body.slice(0, 200)}`);
                // The old process drains and goes; only the new one refuses the old session.
                // waitFor gives up at once if the container stops (the exec failed).
                await waitFor('the gateway after its restart', 60, async () => (await request('GET', '/managed/me', { jar: admin })).status === 401, 'gateway');
                await waitFor('the gateway after its restart', 60, async () => (await request('GET', '/hosted')).status === 200, 'gateway');
                const after = compose(['ps', '--quiet', 'gateway'], { quiet: true }).out.trim();
                expect(after === container, `the gateway container was replaced (${container.slice(0, 12)} then ${after.slice(0, 12)}): it did not start itself again in place`);
                const stale = await request('GET', '/managed/me', { jar: plain });
                expect(stale.status === 401, `the user's session from before the restart: want 401, got ${stale.status}`);
                const again = await signIn(admin, 'admin', secrets.adminPassword);
                expect(again.status === 303 && again.headers.location === '/', `the administrator's sign-in: want 303 to /, got ${again.status} ${again.headers.location ?? ''}`);
                const me = await request('GET', '/managed/me', { jar: admin });
                expect(me.status === 200 && JSON.parse(me.body).admin === true, `/managed/me after signing in again: ${me.status} ${me.body.slice(0, 200)}`);
                const view = await tlsView(admin);
                const want = certFingerprint(gatewayPair.certPem);
                expect(view.certificate?.sha256 === want && view.trust.some((f) => f.name === TRUST_FILE),
                    `after the restart the certificate is ${view.certificate?.sha256} (want ${want}) and the CA files are ${JSON.stringify(view.trust.map((f) => f.name))}`);
                const served = await servedFingerprint();
                expect(served === want, `after the restart a new TLS connection is served ${served}, want ${want}`);
                return `container ${container.slice(0, 12)} kept`;
            });
        } finally {
            // Put back what 29-31 changed, even when one of them failed half way: a
            // signed-in administrator first (the others need one), then the
            // original certificate and the CA file.
            for (const [what, undo] of [
                ['the administrator', async () => {
                    await waitFor('the gateway', 60, async () => (await request('GET', '/hosted')).status === 200, 'gateway');
                    if ((await request('GET', '/managed/me', { jar: admin })).status !== 200) {
                        const s = await signIn(admin, 'admin', secrets.adminPassword);
                        expect(s.status === 303, `sign-in: want 303, got ${s.status}`);
                    }
                }],
                ['the certificate', () => restoreCertificate(admin)],
                ['the broker CA file', () => restoreTrustFile(admin)],
            ]) {
                try {
                    await undo();
                } catch (e) {
                    say(`error: restoring ${what} after the TLS checks: ${e.message}`);
                }
            }
        }

        // After 31 and before the restart of 15: the audit trail is plain JSON by
        // design (so check 14's sealed-store checks do not apply to it), and
        // every sign-in, settings change and backup above has left a line.
        await check(19, 'the audit log (/data/audit.log) holds one JSON entry per line with the decided fields: the refused and the ok sign-in, the settings change, the backup export and import, the two-factor set-up, a refused code and the administrator\'s reset, and the certificate replace, the CA file add and delete and the restart', async () => {
            const dest = path.join(WORK, 'at-rest-audit.log');
            const cp = compose(['cp', 'gateway:/data/audit.log', dest], { quiet: true });
            expect(cp.code === 0, `docker compose cp audit.log: ${cp.out.trim()}`);
            const { entries, problems } = parseAuditLog(fs.readFileSync(dest, 'utf8'));
            expect(entries.length > 0, 'audit.log is empty');
            expect(problems.length === 0, problems.slice(0, 5).join('; '));
            const missing = auditMissing(entries, {
                user: USER, settingsKeys: ['connModes', 'modules.userDefault'], twoFactorUser: SCRATCH,
                // Check 30 does not delete the CA file under E2E_INSECURE=1.
                tls: { trustFile: insecure() ? undefined : TRUST_FILE },
            });
            expect(missing.length === 0, `lacks ${missing.join('; ')}`);
            return `${entries.length} entries`;
        });

        await check(15, 'after a restart the stores still open: old sessions are gone, and the admin signs in again', async () => {
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

        // After check 15, the last check that sends a request, so the sweep
        // covers every response of the run.
        await check(13, 'no response from either gateway carries a credential except the dial answer\'s body', async () => {
            const sweep = sweepable();
            // By value: a SEMP password equal to the client password rightly
            // appears in the dial answer too.
            const hits = sweepSecrets(records, sweep,
                (r, name, where) => where === 'body' && r.label === 'POST /managed/dial -> 200' && sweep[name] === brokerSecrets.clientPassword);
            expect(hits.length === 0, hits.join('; '));
            return `${records.length} responses`;
        });

        await check(16, 'the gateway refuses to start when its key file is missing beside an existing store', async () => {
            compose(['stop', 'gateway'], { quiet: true });
            // The key's path is fixed (/data/store.key), so the refusal is
            // provoked with a /data that holds the users file and no key: a copy
            // of the store out of the stopped gateway, mounted over its volume.
            const bare = path.join(WORK, 'no-key-data');
            fs.mkdirSync(bare, { recursive: true });
            fs.chmodSync(bare, 0o777);
            const cp = compose(['cp', 'gateway:/data/users.yaml', path.join(bare, 'users.yaml')], { quiet: true });
            expect(cp.code === 0, `docker compose cp users.yaml: ${cp.out.trim()}`);
            fs.chmodSync(path.join(bare, 'users.yaml'), 0o644);
            const run = compose(['run', '--rm', '--no-deps', '-T', '-v', `${bare}:/data`, 'gateway'], { quiet: true });
            runOutput = run.out;
            expect(run.code !== 0, 'the gateway started without its key file');
            // slog quotes the error, so the inner quotes arrive escaped.
            expect(/is missing but \\?"\/data\/users\.yaml\\?" exists/.test(run.out), `exit ${run.code}; output: ${run.out.trim().slice(-400)}`);
            return `exit ${run.code}`;
        });

        await check(17, 'neither gateway log nor the audit log holds a password, backup passphrase, store key, session cookie, two-factor secret, recovery code or the private key a check uploaded', async () => {
            const logs = compose(['logs', '--no-color', 'gateway', 'direct'], { quiet: true });
            const text = logs.out + runOutput;
            // The key the gateway made on its fresh volume (64 hex characters).
            const keyFile = path.join(WORK, 'at-rest-store.key');
            const cp = compose(['cp', 'gateway:/data/store.key', keyFile], { quiet: true });
            expect(cp.code === 0, `docker compose cp store.key: ${cp.out.trim()}`);
            const storeKey = fs.readFileSync(keyFile, 'utf8').trim();
            expect(storeKey.length >= MIN_MASKED, 'the gateway made no store key');
            const found = Object.entries({ ...sweepable(), storeKey, ...cookies, ...twoFactor, ...tlsKeys }).filter(([, v]) => text.includes(v)).map(([name]) => name);
            expect(found.length === 0, `found ${found.join(', ')}`);
            // The audit log is swept the same way, from a copy taken now, after
            // the restart of 15 and the stop of 16, so it holds every line the run wrote.
            const auditFile = path.join(WORK, 'at-rest-audit-final.log');
            const cpAudit = compose(['cp', 'gateway:/data/audit.log', auditFile], { quiet: true });
            expect(cpAudit.code === 0, `docker compose cp audit.log: ${cpAudit.out.trim()}`);
            const auditText = fs.readFileSync(auditFile, 'utf8');
            const inAudit = Object.entries({ ...sweepable(), storeKey, ...cookies, ...twoFactor, ...tlsKeys }).filter(([, v]) => auditText.includes(v)).map(([name]) => name);
            expect(inAudit.length === 0, `audit.log holds ${inAudit.join(', ')}`);
            return `${text.split('\n').length} lines, ${auditText.split('\n').length} audit lines`;
        });
    } finally {
        // Newest first: each SMF session before the bridge it runs through.
        for (const close of closers.splice(0).reverse()) {
            try { close(); } catch { /* already gone */ }
        }
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

/** A response the browser received from `app`'s gateway, as a record for check 13; its session cookie is masked from then on. */
async function recordResponse(res, app) {
    const url = new URL(res.url());
    if (url.origin !== app) return;
    const headers = await res.headersArray();
    noteCookies(headers.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value));
    let body = '';
    try {
        body = await res.text();
    } catch { /* a redirect, or a page closed meanwhile, has no body to read */ }
    records.push({
        label: `${tag(app === DIRECT_APP)}${res.request().method()} ${url.pathname} -> ${res.status()}`,
        headers: headers.reduce((s, h) => `${s}${h.name}: ${h.value}\r\n`, ''),
        body,
    });
}

/** A browser context on one gateway's app (`app`: APP, the default, or DIRECT_APP) that notes what its pages do in `seen` (see newSeen). */
async function openContext(browser, seen, app = APP) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: app });
    context.setDefaultTimeout(30_000);
    // Anything but that gateway is aborted, so it never leaves the stack.
    await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === app || !/^https?:$/.test(url.protocol)) return route.continue();
        seen.foreign.push(url.href);
        return route.abort('blockedbyclient');
    });
    // Caught at once: an unhandled rejection would end the run.
    context.on('response', (res) => {
        const read = { what: `${res.request().method()} ${res.url()}` };
        seen.open.add(read);
        seen.pending.push(recordResponse(res, app).catch(() => { seen.unread += 1; }).finally(() => seen.open.delete(read)));
    });
    // Routes do not see WebSockets, so their URLs are noted apart.
    context.on('page', (p) => {
        p.on('websocket', (ws) => seen.sockets.push(ws.url()));
        p.on('pageerror', (e) => seen.errors.push(e.message));
        // Whatever a Content-Security-Policy refuses (a script, a style, a
        // connection) the browser reports only on the console.
        p.on('console', (msg) => {
            if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) seen.errors.push(`refused by the policy: ${msg.text()}`);
        });
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
 * What a browser's pages did, for B9 and D4: response reads still running
 * (check 13 waits for them), those not yet finished, and those that failed;
 * requests to another origin (aborted), WebSocket URLs and uncaught errors.
 */
const newSeen = () => ({ pending: [], open: new Set(), unread: 0, foreign: [], sockets: [], errors: [] });

/** How long drain waits for response bodies: the app streams none, so one still open after this never ends. */
const DRAIN_MS = 15_000;

/**
 * Every response read, also those that arrive meanwhile, so check 13 sweeps
 * all of them. A body still open after DRAIN_MS is not waited for: drain
 * returns those responses, as `METHOD url`.
 */
async function drain(seen) {
    const until = Date.now() + DRAIN_MS;
    for (let n = 0; n !== seen.pending.length;) {
        n = seen.pending.length;
        const left = until - Date.now();
        const settled = left > 0 && await withTimeout(Promise.allSettled(seen.pending), left, 'drain').then(() => true, () => false);
        if (!settled) break;
    }
    return [...seen.open].map((r) => r.what);
}

/** The responses drain left open, as problems: their bodies cannot be swept. */
const openProblems = (open) => open.map((r) => `a response still open after ${DRAIN_MS / 1000}s: ${r}`);

/** What should not be in `seen`: a request to another origin, a socket to anything but `app`'s gateway, a page error. */
const seenProblems = (seen, app) => [
    ...seen.foreign.map((u) => `request to ${u}`),
    ...seen.sockets.filter((u) => !u.startsWith(`${app.replace(/^https:/, 'wss:')}/`)).map((u) => `socket to ${u}`),
    ...seen.errors.map((m) => `page error: ${m}`),
];

/** The page a failing browser check screenshots; null for none. */
let shown = null;

/** A browser check: a failure saves a screenshot of `shown` to scripts/logs/e2e-<id>.png (git-ignored). */
const bcheck = (id, title, fn) => check(id, title, async () => {
    try {
        return await fn();
    } catch (e) {
        const shot = path.join(LOGS, `e2e-${id}.png`);
        if (shown && await shown.screenshot({ path: shot }).then(() => true, () => false)) e.message += ` (screenshot: scripts/logs/e2e-${id}.png)`;
        throw e;
    }
});

/** Binds `queue` in Queue Browser on `page`: 'bound', or 'error: ' and the bind error. */
async function bindInQueueBrowser(page, queue) {
    await page.click('.nav-item[data-module-id="queue-browser"]');
    await page.locator('#browser-active-view').waitFor();
    await page.fill('#browser-bind-input', queue);
    await page.click('#btn-browser-bind');
    const outcome = await page.waitForFunction((q) => {
        const error = document.querySelector('#browser-bind-error')?.textContent?.trim();
        if (error) return `error: ${error}`;
        return [...document.querySelectorAll('#browser-bound-queues option')].some((o) => o.value === q) && 'bound';
    }, queue);
    return outcome.jsonValue();
}

/**
 * Checks B1-B9: the Provisioned app in a real browser, as the e2e user and
 * then the admin. A failure saves a screenshot to scripts/logs/e2e-<id>.png
 * (git-ignored); no page the run opens shows a password.
 */
async function runBrowserChecks(admin) {
    const { vpn, queue } = broker;
    const smfPath = `/managed/smf/${BROKER}/${vpn}`;
    const seen = newSeen();
    let browser = null;
    let user = null;
    let page = null;
    let socket = null;

    if (fs.existsSync(LOGS)) {
        for (const f of fs.readdirSync(LOGS)) if (/^e2e-[BD]\d\.png$/.test(f)) fs.rmSync(path.join(LOGS, f));
    }

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
            await page.locator('.account-control-name').waitFor();
            const name = (await page.locator('.account-control-name').innerText()).trim();
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
            // Connections always; the three grantable modules, as a fresh config
            // offers them all and modules.userDefault=all grants them.
            expect(nav.join() === 'connections,queue-browser,queue-copy,queue-subscription-explorer', `sidebar: ${nav.join(', ')}`);
        });

        // The app re-reads /managed/me only on load, on sign-in and on Refresh.
        await bcheck('B3', 'a settings change reaches the sidebar on Refresh: modules.userDefault none leaves Connections only, and all brings the modules back', async () => {
            expect(page, 'no signed-in page (B1)');
            const nav = () => page.locator('.nav-item[data-module-id]').evaluateAll((items) => items.map((i) => i.dataset.moduleId).join());
            const refresh = async (want) => {
                const me = page.waitForResponse((r) => new URL(r.url()).pathname === '/managed/me');
                me.catch(() => {});
                await page.click('#btn-managed-refresh');
                const res = await me;
                expect(res.status() === 200, `Refresh: /managed/me ${res.status()}`);
                await page.waitForFunction((w) => [...document.querySelectorAll('.nav-item[data-module-id]')]
                    .map((i) => i.dataset.moduleId).join() === w, want, { timeout: 10_000 }).catch(() => {});
                return nav();
            };
            const put = (userDefault) => saveSettings(admin, { modules: { userDefault } });
            let none = null;
            let all = null;
            let shrunk = '';
            try {
                none = await put('none');
                if (none.status === 200) shrunk = await refresh('connections');
            } finally {
                all = await put('all');
            }
            expect(none.status === 200, `PUT userDefault none: ${none.status} ${none.body}`);
            expect(shrunk === 'connections', `after none and Refresh the sidebar shows ${shrunk || 'nothing'}`);
            expect(all.status === 200, `PUT userDefault all: ${all.status} ${all.body}`);
            const back = await refresh('connections,queue-browser,queue-copy,queue-subscription-explorer');
            expect(back === 'connections,queue-browser,queue-copy,queue-subscription-explorer', `after all and Refresh the sidebar shows ${back}`);
        });

        await bcheck('B4', `Connect opens the browser's own WebSocket to ${smfPath}, and the page shows no broker address`, async () => {
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
            const found = findTokens(text, [...new Set([broker.host, broker.brokerAddr, broker.brokerIp])]
                .filter((v) => v && v.length >= 4 && !named.includes(v)).map((v) => v.toLowerCase()));
            expect(found.length === 0, `the page shows ${found.join(', ')}`);
            return new URL(socket.url()).origin;
        });

        await bcheck('B5', `the Queue Browser binds ${queue} read-only, with no delete`, async () => {
            expect(socket, 'no SMF session (B4)');
            const result = await bindInQueueBrowser(page, queue);
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

        await bcheck('B6', 'browser storage holds no password, store key or session cookie', async () => {
            expect(page, 'no signed-in page (B1)');
            const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
            const found = Object.entries({ ...sweepable(), ...cookies }).filter(([, v]) => stored.includes(v)).map(([n]) => n);
            expect(found.length === 0, `holds ${found.join(', ')}`);
        });

        await bcheck('B7', '/solAdmin refuses the e2e user, and shows the admin both users, both connections and Backup & Restore', async () => {
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
            await ap.click('.nav-item[data-module-id="backup"]');
            await ap.locator('#backup-schedule-status', { hasText: 'No schedule' }).waitFor();
            expect(await ap.locator('#backup-dir-problem').isHidden(), `backup directory: ${await ap.locator('#backup-dir-problem').innerText()}`);
        });

        await bcheck('B8', 'Sign out in the sidebar ends the session and closes the browser\'s SMF socket', async () => {
            shown = page;
            expect(socket, 'no SMF session (B4)');
            const closed = socket.isClosed() ? Promise.resolve() : socket.waitForEvent('close', { timeout: 15_000 });
            closed.catch(() => {});
            const logout = page.waitForResponse((r) => new URL(r.url()).pathname === '/managed/logout');
            logout.catch(() => {});
            await page.click('.account-control-signout');
            const out = await logout;
            expect(out.status() === 204, `logout: want 204, got ${out.status()}`);
            await closed;
            await page.locator('.account-control').waitFor({ state: 'hidden' });
            const me = await page.evaluate(() => fetch('/managed/me').then((r) => r.status));
            expect(me === 401, `/managed/me after sign-out: want 401, got ${me}`);
            await page.goto('/');
            expect(new URL(page.url()).pathname === '/login', `/ after sign-out: want /login, got ${page.url()}`);
        });

        await bcheck('B9', 'nothing in the browser reached another origin, and no page threw', async () => {
            shown = null;
            expect(user, 'no browser (B1)');
            const problems = [...openProblems(await drain(seen)), ...seenProblems(seen, APP)];
            expect(problems.length === 0, problems.join('; '));
            return `${seen.sockets.length} socket(s)${seen.unread ? `; ${seen.unread} response(s) closed before they could be swept` : ''}`;
        });
    } finally {
        await drain(seen);
        await browser?.close().catch(() => {});
    }
}

// --- Gateway mode ------------------------------------------------------------------

/**
 * Checks D1-D4: the image in its default mode, the `direct` service. No
 * sign-in: the Direct relay forwards what the caller sends, so they use the
 * broker's details as a person would type them. D4 opens its own browser
 * connection; B1-B9 closed theirs.
 */
async function runDirectChecks() {
    const { vpn, queue } = broker;
    const wssPath = `/wss/${broker.smfPort}/${broker.host}`;

    await check('D1', 'Gateway mode: /hosted says direct, / serves the Direct app, and /login, an unknown path, /managed, /solAdmin and the other bundles are plain 404s', async () => {
        const hosted = await request('GET', '/hosted', { at: DIRECT });
        expect(hosted.status === 200 && hosted.body.trim() === '{"hosted":true,"connModes":"direct","defaultConn":"direct"}',
            `/hosted: ${hosted.status} ${hosted.body.trim()}`);
        const root = await request('GET', '/', { at: DIRECT });
        expect(root.status === 200 && root.body.includes('id="conn-host"') && !root.body.includes('conn-panel-managed'),
            `/: want 200 with the Direct form and no Provisioned panel, got ${root.status}`);
        // No sign-in page in Gateway mode, and a path the gateway does not serve is never redirected: /login is a plain 404 too.
        for (const p of ['/login', '/a/b', '/managed/me', '/solAdmin', '/solAdmin/', '/provisioned.html', '/solAdmin.html']) {
            const r = await request('GET', p, { at: DIRECT });
            expect(r.status === 404 && r.body === '404 page not found\n', `${p}: want a plain 404, got ${r.status} ${r.body.slice(0, 120)}`);
        }
        const log = compose(['logs', '--no-color', 'direct'], { quiet: true }).out;
        expect(/conn_modes=direct\b/.test(log) && !/\bmode=provisioned\b/.test(log),
            'the direct log does not say conn_modes=direct, or its startup summary says mode=provisioned');
    });

    await check('D2', "the Direct relay forwards a SEMP GET with the caller's own credentials, passes the broker's 401 through, and answers a bad path 400 and an unknown host 502", async () => {
        const ok = await request('GET', directSempPath(), { at: DIRECT, headers: sempAuth() });
        expect(ok.status === 200 && JSON.parse(ok.body).data?.queueName === queue,
            `with the SEMP credential: want 200 naming ${queue}, got ${ok.status} ${ok.body.slice(0, 300)}`);
        const anonymous = await request('GET', directSempPath(), { at: DIRECT, headers: { Accept: 'application/json' } });
        expect(anonymous.status === 401, `without a credential: want the broker's 401, got ${anonymous.status} ${anonymous.body.slice(0, 200)}`);
        const bad = await request('GET', '/https/abc/h', { at: DIRECT });
        expect(bad.status === 400 && bad.body.startsWith('400 bad request: '), `a malformed path: want 400, got ${bad.status} ${bad.body.slice(0, 200)}`);
        const unknown = await request('GET', `/https/${broker.sempPort}/e2e-no-such-host.invalid/SEMP/v2/monitor/msgVpns`, { at: DIRECT });
        expect(unknown.status === 502 && unknown.body === '502 bad gateway: upstream unreachable\n',
            `an unknown host: want 502, got ${unknown.status} ${unknown.body.slice(0, 200)}`);
    });

    await check('D3', `a real SMF login through the Direct relay's ${wssPath} binds a queue browser to ${queue}`, async () => {
        const bridge = await startBridge({ at: DIRECT });
        const solace = loadSolace();
        const smf = await openSession(solace, bridge, { smfPath: wssPath, vpn, user: broker.clientUser, pass: brokerSecrets.clientPassword });
        await bindQueue(solace, smf.session, queue);
        smf.session.disconnect();
        await withTimeout(smf.down, 10_000, 'the SDK did not report the session down within 10s of its disconnect');
    });

    if (!browserOn()) return;
    const seen = newSeen();
    let browser = null;
    try {
        await bcheck('D4', `a browser on the Direct app at ${DIRECT_APP} connects SEMP and SMF through it and binds ${queue}, reaching no other origin`, async () => {
            shown = null;
            // isValidHost in src/core/utils.ts: a name or an IPv4 address.
            expect(!broker.host.includes(':'), `the Direct form takes a host name or an IPv4 address, not ${broker.host}`);
            browser = await connectBrowser();
            const page = await (await openContext(browser, seen, DIRECT_APP)).newPage();
            shown = page;
            // The form's handlers attach once the app has probed /hosted.
            const probed = page.waitForResponse((r) => new URL(r.url()).pathname === '/hosted');
            probed.catch(() => {});
            await page.goto('/');
            const hosted = await probed;
            expect(hosted.status() === 200, `the app's /hosted probe: ${hosted.status()}`);
            expect(await page.locator('#conn-panel-managed').count() === 0, 'the Direct app shows the Provisioned panel');
            // 'connected' once the button offers Disconnect; otherwise what the form says is wrong.
            const until = async (button, error) => (await page.waitForFunction(([b, e]) => {
                const slot = document.querySelector(e);
                const text = slot?.textContent?.trim();
                if (text && slot.style.display !== 'none') return `error: ${text}`;
                const invalid = [...document.querySelectorAll('.is-invalid')].map((i) => i.id);
                if (invalid.length) return `invalid: ${invalid.join(', ')}`;
                return document.querySelector(b)?.textContent?.trim() === 'Disconnect' && 'connected';
            }, [button, error])).jsonValue();
            await page.selectOption('#semp-protocol', 'https');
            await page.fill('#conn-host', broker.host);
            await page.fill('#semp-port', broker.sempPort);
            await page.fill('#semp-username', broker.sempUser);
            await page.fill('#semp-password', brokerSecrets.sempPassword);
            await page.click('#btn-semp-connect');
            const semp = await until('#btn-semp-connect', '#semp-connect-error');
            expect(semp === 'connected', `SEMP: ${semp}`);
            await page.selectOption('#solace-protocol', 'wss');
            await page.fill('#solace-port', broker.smfPort);
            await page.fill('#solace-vpn', vpn);
            await page.fill('#solace-username', broker.clientUser);
            await page.fill('#solace-password', brokerSecrets.clientPassword);
            const opened = page.waitForEvent('websocket', { timeout: 30_000, predicate: (ws) => ws.url().startsWith(`wss://direct:9443${wssPath}`) });
            opened.catch(() => {});
            await page.click('#btn-solace-connect');
            const client = await until('#btn-solace-connect', '#solace-connect-error');
            expect(client === 'connected', `client: ${client}`);
            const socket = await opened;
            const bound = await bindInQueueBrowser(page, queue);
            expect(bound === 'bound', `bind: ${bound}`);
            await page.waitForFunction(() => /^Read-(Only|Write)$/.test(document.querySelector('#browser-permissions')?.textContent ?? '')).catch(() => {});
            // textContent: the badge is text-transform: uppercase. Either value
            // is right here: it is the broker's own permission for the client
            // username, not a grant.
            const shownQueue = ((await page.locator('#browser-queue-name').textContent()) ?? '').trim();
            const permissions = ((await page.locator('#browser-permissions').textContent()) ?? '').trim();
            expect(shownQueue === queue && /^Read-(Only|Write)$/.test(permissions), `shows queue ${shownQueue}, permissions ${permissions || '(none)'}`);
            // The SDK falls back to HTTP when its WebSocket fails: SMF would
            // then not be on the socket.
            expect(!socket.isClosed(), `the WebSocket to ${wssPath} closed: the SDK left it for another transport`);
            const total = await page.locator('#count-total').innerText();
            // Closed before the drain: the app never reads the body of its
            // SEMP connect probe (semp-client.ts checks the status only), and
            // Chromium finishes such a response only once the page reads it.
            // Closing cancels it, so it is counted as not swept instead of
            // holding the drain to its limit.
            shown = null;
            await page.context().close();
            const open = await drain(seen);
            const relayed = `direct GET /https/${broker.sempPort}/${broker.host}/SEMP/`;
            expect(records.some((r) => r.label.startsWith(relayed) && r.label.endsWith(' -> 200')),
                `no SEMP call went through ${DIRECT_APP}/https/${broker.sempPort}/${broker.host}/`);
            const problems = [...openProblems(open), ...seenProblems(seen, DIRECT_APP)];
            expect(problems.length === 0, problems.join('; '));
            return `${permissions}; total ${total}; ${seen.sockets.length} socket(s)`
                + `${seen.unread ? `; ${seen.unread} response(s) the page never read, not swept` : ''}`;
        });
    } finally {
        await drain(seen);
        await browser?.close().catch(() => {});
    }
}

// --- main ------------------------------------------------------------------------

// True from writeMaterial on: from then the stack and WORK exist to tear down.
let started = false;
let tornDown = false;

function teardown() {
    if (tornDown) return;
    tornDown = true;
    try { compose(['down', '-v', '--remove-orphans'], { quiet: true }); } catch { /* the dev task's down -v is the backstop */ }
    fs.rmSync(WORK, { recursive: true, force: true });
}

// One run at a time on this machine, whatever the checkout: the compose project
// name and the host ports are fixed, so a second run's opening `down -v` would
// remove the first run's stack under it.
const LOCK = path.join(os.tmpdir(), 'smu-e2e.lock');

/** True while process `pid` runs (EPERM: it runs as another user). */
function alive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM';
    }
}

/** Takes the lock and returns null, or returns why another run holds it. A lock whose process has ended is taken over. */
function takeLock() {
    for (;;) {
        try {
            fs.writeFileSync(LOCK, `${process.pid} ${REPO}`, { flag: 'wx' });
            return null;
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
        }
        let held;
        try { held = fs.readFileSync(LOCK, 'utf8'); } catch { continue; /* removed meanwhile */ }
        const [pid, ...where] = held.split(' ');
        // An empty file is a lock being written: held.
        if (!/^\d+$/.test(pid) || alive(Number(pid))) {
            return `another e2e run (process ${pid || '?'}, in ${where.join(' ') || '?'}) is using the smu-e2e stack. `
                + `Wait for it to end; if no run is going, delete ${LOCK}.`;
        }
        fs.rmSync(LOCK, { force: true });
    }
}

/** Ends the run on a signal or an error nothing caught, tearing down what a normal end would. */
function abort(message, code) {
    say(message);
    if (started) teardown();
    process.exit(code);
}

async function main() {
    if (!fs.existsSync(SOLCLIENT)) {
        say(`error: ${SOLCLIENT} is missing. Run npm ci: package.json pins solclientjs.`);
        return 1;
    }
    const held = takeLock();
    if (held) {
        say(`error: ${held}`);
        return 1;
    }
    // Every way out ends in process.exit, the password prompt's Ctrl-C included.
    process.on('exit', () => fs.rmSync(LOCK, { force: true }));
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
        process.on(signal, () => abort(`interrupted (${signal}); tearing the stack down`, code));
    }
    const crashed = (e) => abort(`error: ${e instanceof Error ? e.message : String(e)}; tearing the stack down`, 1);
    process.on('uncaughtException', crashed);
    process.on('unhandledRejection', crashed);
    return run();
}

async function run() {
    let setupError = null;
    try {
        broker = await collectDetails();
        brokerSecrets.sempPassword = broker.sempPassword;
        brokerSecrets.clientPassword = broker.clientPassword;
        const certs = readBrokerCA(broker.caFile);
        describeBroker(certs);
        if (browserOn()) playwright = await loadPlaywright();
        started = true;
        writeMaterial(certs);
        await stackUp();
        const admin = await configureGateway();
        await runChecks(admin);
    } catch (e) {
        setupError = e;
        say(`error: setup failed: ${e.message}`);
    }
    const failed = results.filter((r) => !r.ok).map((r) => r.n);
    const skipped = results.filter((r) => r.skipped).map((r) => r.n);
    if (started) {
        if (setupError || failed.length) {
            try {
                say('--- gateway log (last 60 lines) ---');
                compose(['logs', '--no-color', '--tail', '60', 'gateway']);
                if (setupError || failed.some((n) => String(n).startsWith('D'))) {
                    say('--- direct log (last 60 lines) ---');
                    compose(['logs', '--no-color', '--tail', '60', 'direct']);
                }
            } catch (e) {
                say(`error: reading the gateway logs: ${e.message}`);
            }
        }
        teardown();
    }
    say(`e2e: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}`
        + `${skipped.length ? `, ${skipped.length} skipped (${skipped.join(', ')})` : ''}${setupError ? ', setup failed' : ''}`
        + `${insecure() ? "; the broker's certificate was not verified (E2E_INSECURE=1)" : ''}`
        + `${broker.browser === '0' ? '; the browser checks were skipped (E2E_BROWSER=0)' : ''}`);
    return setupError || failed.length ? 1 : 0;
}

// process.exit, not a natural end: the SDK's timers would keep Node alive.
process.exit(await main());
