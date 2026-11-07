/* Testing-bench request handler.
   With no password check configured, it never draws a password field.
   Package bytes are served only for a sealed, Professor-accepted slot. */

import { SLOTS, isRefusedPackage, slotById, slotStatusCopy } from './catalog.js';
import { cookieSecure, loadPortalConfig, transportAllowsSession } from './config.js';
import {
  isSafePackagePath,
  isServiceWorkerName,
  manifestSealOk,
  passwordMatches,
  pbkdf2Bits,
  randomBytes,
  readSession,
  sha256Hex,
  signSession,
  timingSafeEqual,
  SESSION_TTL_MS,
  bytesToB64url,
} from './crypto.js';
import { securityHeaders } from './headers.js';
import { GUARD_SCRIPT, renderClosed, renderHub, renderLogin, renderMissing } from './pages.js';
import { safeNext } from './redirect.js';

const TYPES = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'],
  ['txt', 'text/plain; charset=utf-8'],
  ['svg', 'image/svg+xml'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
  ['ico', 'image/x-icon'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
  ['wasm', 'application/wasm'],
  ['map', 'application/json; charset=utf-8'],
  ['mp3', 'audio/mpeg'],
  ['ogg', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['webm', 'video/webm'],
  ['mp4', 'video/mp4'],
]);

const dummySalt = randomBytes(16);
let dummyBits = null;

function manifestKey(packageId) {
  return `packages/${packageId}/manifest.json`;
}

function fileKey(packageId, filePath) {
  return `packages/${packageId}/files/${filePath}`;
}

function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

function serializeCookie(name, value, { path, maxAge, secure }) {
  const parts = [`${name}=${value}`, `Path=${path}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function response(status, body, { https, csp, assetOrigin, cookies = [], extra = {}, contentType, head = false } = {}) {
  const headers = securityHeaders(
    contentType ? { 'content-type': contentType } : {},
    { https, csp, assetOrigin },
  );
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(head ? null : body, { status, headers });
}

function html(status, body, opts) {
  return response(status, body, { ...opts, contentType: 'text/html; charset=utf-8', csp: 'shell' });
}

function plain(status, body, opts) {
  return response(status, body, { ...opts, contentType: 'text/plain; charset=utf-8', csp: 'plain' });
}

function relativePath(pathname, base) {
  if (pathname === base || pathname === `${base}/`) return '';
  if (!pathname.startsWith(`${base}/`)) return null;
  return pathname.slice(base.length + 1);
}

function wantsDocument(request) {
  const dest = request.headers.get('sec-fetch-dest');
  if (dest === 'document') return true;
  if (dest) return false;
  const accept = request.headers.get('accept') || '';
  return accept.split(',').some((part) => part.split(';')[0].trim().toLowerCase() === 'text/html');
}

function originOk(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === url.origin;
  } catch {
    return false;
  }
}

function clientIp(request, config, deps) {
  if (typeof deps.getIp === 'function') {
    const ip = deps.getIp(request);
    if (typeof ip === 'string' && /^[A-Za-z0-9:.]{1,64}$/.test(ip)) return ip;
  }
  if (config.trustProxy) {
    const cf = request.headers.get('cf-connecting-ip') || '';
    if (/^[A-Za-z0-9:.]{3,64}$/.test(cf)) return cf;
  }
  return 'local';
}

async function readForm(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/x-www-form-urlencoded')) return { error: 'type' };
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > 4096) return { error: 'size' };
  const raw = await request.text();
  if (raw.length > 4096) return { error: 'size' };
  return { params: new URLSearchParams(raw) };
}

async function dummyCompare(password, iterations) {
  if (!dummyBits || dummyBits.iterations !== iterations) {
    dummyBits = {
      iterations,
      bits: await pbkdf2Bits('portal-dummy-not-a-credential', dummySalt, iterations),
    };
  }
  const derived = await pbkdf2Bits(password.length > 0 && password.length <= 1024 ? password : 'x', dummySalt, iterations);
  return timingSafeEqual(derived, dummyBits.bits);
}

function usernameOk(username) {
  return /^[A-Za-z0-9._@-]{1,64}$/.test(username);
}

async function loadManifest(bucket, packageId, sealKey) {
  if (!bucket) return null;
  const object = await bucket.get(manifestKey(packageId));
  if (!object) return null;
  const text = await object.text();
  if (text.length > 256 * 1024) return { mismatch: true };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { mismatch: true };
  }
  if (!(await manifestSealOk(parsed, sealKey))) return { mismatch: true };
  return { parsed };
}

async function slotState(slot, config, bucket) {
  if (slot.approval !== 'accepted' || !slot.packageId || isRefusedPackage(slot.packageId)) return 'pending';
  const expected = config.packages[slot.id];
  if (!config.sealReady || !expected || expected.packageId !== slot.packageId) return 'unsealed';
  const loaded = await loadManifest(bucket, slot.packageId, config.sealKey);
  if (!loaded) return 'missing';
  if (loaded.mismatch) return 'mismatch';
  if (loaded.parsed.packageId !== slot.packageId) return 'mismatch';
  if (!timingSafeEqual(loaded.parsed.zipSha256, expected.sha256)) return 'mismatch';
  return 'ready';
}

function contentTypeFor(filePath) {
  const ext = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase() : '';
  return TYPES.get(ext) || 'application/octet-stream';
}

function fileFromPlay(rest) {
  let decoded;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (decoded.endsWith('/')) decoded = `${decoded}index.html`;
  if (decoded === '') return 'index.html';
  if (!isSafePackagePath(decoded)) return null;
  if (isServiceWorkerName(decoded.split('/').pop())) return null;
  if (/\.(zip|7z|rar)$/i.test(decoded)) return null;
  return decoded;
}

export async function handle(request, deps = {}) {
  const env = deps.env || {};
  try {
    const config = loadPortalConfig(env);
    return await route(request, deps, config);
  } catch (err) {
    console.error('test portal failed', err && err.stack);
    let https = false;
    try {
      https = new URL(request.url).protocol === 'https:';
    } catch {
      https = false;
    }
    return html(503, renderClosed({ reason: 'unavailable' }), { https, assetOrigin: '' });
  }
}

async function route(request, deps, config) {
  const url = new URL(request.url);
  const https = cookieSecure(url, request, config);
  const head = request.method.toUpperCase() === 'HEAD';
  const method = head ? 'GET' : request.method.toUpperCase();
  const opts = { https, assetOrigin: config.assetOrigin, head };
  const rel = relativePath(url.pathname, config.base);
  if (rel === null) return plain(404, 'Not found\n', opts);
  if (request.headers.get('service-worker')) return plain(404, 'Not found\n', opts);

  if (rel === 'portal-sw-guard.js' && method === 'GET') {
    return response(200, GUARD_SCRIPT, {
      ...opts,
      contentType: 'text/javascript; charset=utf-8',
      csp: 'plain',
    });
  }

  const secureCookie = https;
  const authOn = config.authReady && deps.limiter && transportAllowsSession(url, request, config);
  if (!authOn) {
    const status = method === 'GET' ? 200 : 404;
    return html(status, renderClosed({ base: config.base, assetOrigin: config.assetOrigin, reason: 'unconfigured' }), opts);
  }

  if (method !== 'GET' && method !== 'POST') return plain(405, 'Method not allowed\n', { ...opts, extra: { Allow: 'GET, HEAD, POST' } });

  if (rel === 'login' && method === 'POST') return login(request, url, config, deps, opts, secureCookie);
  if (rel === 'logout' && method === 'POST') return logout(request, url, config, deps, opts, secureCookie);
  if (rel === 'login' && method === 'GET') {
    return response(303, '', { ...opts, csp: 'shell', extra: { Location: `${config.base}/` } });
  }
  if (rel.startsWith('play/')) return play(request, url, rel, config, deps, opts);
  if (method === 'POST') return plain(405, 'Method not allowed\n', { ...opts, extra: { Allow: 'GET, HEAD' } });
  if (rel !== '' && rel !== 'index.html') return denyOrMissing(request, url, config, deps, opts);
  const user = await currentUser(request, config, deps.limiter);
  if (!user) return loginPage(url, config, opts, secureCookie, '', '', null);
  return hubPage(config, deps, opts, secureCookie, user);
}

async function denyOrMissing(request, url, config, deps, opts) {
  const user = await currentUser(request, config, deps.limiter);
  if (!user) {
    if (!wantsDocument(request)) return plain(401, 'Unauthorized\n', opts);
    return response(303, '', { ...opts, csp: 'shell', extra: { Location: `${config.base}/` } });
  }
  return html(404, renderMissing({ base: config.base, assetOrigin: config.assetOrigin }), opts);
}

async function currentUser(request, config, limiter) {
  const token = readCookie(request.headers.get('cookie'), 'gl_test_session');
  if (!token) return null;
  const session = await readSession(config.sessionSecret, token);
  if (!session || session.exp <= Date.now()) return null;
  if (await limiter.isRevoked(session.sid)) return null;
  if (!config.users.some((user) => user.username === session.u)) return null;
  return session;
}

function csrfPair(config, secure) {
  const csrf = bytesToB64url(randomBytes(32));
  const cookie = serializeCookie('gl_test_csrf', csrf, { path: config.base, maxAge: 60 * 30, secure });
  return { csrf, cookie };
}

function loginPage(url, config, opts, secureCookie, error, username, nextValue, status = 0) {
  const next = safeNext(nextValue != null ? nextValue : url.searchParams.get('next'), config.base);
  const issued = csrfPair(config, secureCookie);
  return html(status || (error ? 401 : 200), renderLogin({
    base: config.base,
    assetOrigin: config.assetOrigin,
    error,
    username,
    csrf: issued.csrf,
    next: next === `${config.base}/` ? '' : next,
  }), { ...opts, cookies: [issued.cookie] });
}

async function hubPage(config, deps, opts, secureCookie, session) {
  const { csrf, cookie } = csrfPair(config, secureCookie);
  const states = new Map();
  await Promise.all(SLOTS.map(async (slot) => {
    states.set(slot.id, await slotState(slot, config, deps.bucket));
  }));
  return html(200, renderHub({
    base: config.base,
    assetOrigin: config.assetOrigin,
    username: session.u,
    csrf,
    states,
  }), { ...opts, cookies: [cookie] });
}

async function login(request, url, config, deps, opts, secureCookie) {
  const ip = clientIp(request, config, deps);
  const form = await readForm(request);
  if (form.error) {
    await deps.limiter.attempt(ip, '-');
    return plain(form.error === 'size' ? 413 : 415, 'The sign-in form was not accepted.\n', opts);
  }
  const username = (form.params.get('username') || '').trim();
  const password = form.params.get('password') || '';
  const postedCsrf = form.params.get('csrf') || '';
  const cookieCsrf = readCookie(request.headers.get('cookie'), 'gl_test_csrf');
  const postedNext = form.params.get('next');
  const rateKey = usernameOk(username) ? username : '-';
  const rate = await deps.limiter.attempt(ip, rateKey);
  const fail = (status, message, keepUser) => loginPage(
    url,
    config,
    {
      ...opts,
      extra: status === 429 && rate.retryAfter ? { 'retry-after': String(rate.retryAfter) } : {},
    },
    secureCookie,
    message,
    keepUser ? username : '',
    postedNext,
    status,
  );
  if (!rate.ok) return fail(429, 'Too many attempts from this place. Wait a little, then try again.');
  if (!originOk(request, url) || !postedCsrf || !cookieCsrf || !timingSafeEqual(postedCsrf, cookieCsrf)) {
    return fail(403, 'That sign-in could not be checked. Reload the page and try again.');
  }
  const known = usernameOk(username);
  const user = known ? config.users.find((row) => row.username === username) : null;
  let matches = false;
  if (user && password.length > 0 && password.length <= 1024) matches = await passwordMatches(password, user);
  else await dummyCompare(password, config.users[0].iterations);
  if (!matches) return fail(401, 'Those credentials were not accepted.', known);
  const sid = bytesToB64url(randomBytes(16));
  const token = await signSession(config.sessionSecret, { u: user.username, sid, exp: Date.now() + SESSION_TTL_MS });
  const next = safeNext(postedNext, config.base);
  const cookies = [
    serializeCookie('gl_test_session', token, { path: config.base, maxAge: SESSION_TTL_MS / 1000, secure: secureCookie }),
    serializeCookie('gl_test_csrf', '', { path: config.base, maxAge: 0, secure: secureCookie }),
  ];
  return response(303, '', { ...opts, csp: 'shell', cookies, extra: { Location: next } });
}

async function logout(request, url, config, deps, opts, secureCookie) {
  const form = await readForm(request);
  if (form.error) return plain(415, 'The sign-out form was not accepted.\n', opts);
  const postedCsrf = form.params.get('csrf') || '';
  const cookieCsrf = readCookie(request.headers.get('cookie'), 'gl_test_csrf');
  if (!originOk(request, url) || !postedCsrf || !cookieCsrf || !timingSafeEqual(postedCsrf, cookieCsrf)) {
    const issued = csrfPair(config, secureCookie);
    return html(403, renderLogin({
      base: config.base,
      assetOrigin: config.assetOrigin,
      error: 'That sign-out could not be checked. Reload the page and try again.',
      csrf: issued.csrf,
    }), { ...opts, cookies: [issued.cookie] });
  }
  const session = await currentUser(request, config, deps.limiter);
  if (session) await deps.limiter.revoke(session.sid, Math.ceil(SESSION_TTL_MS / 1000));
  const cookies = [
    serializeCookie('gl_test_session', '', { path: config.base, maxAge: 0, secure: secureCookie }),
    serializeCookie('gl_test_csrf', '', { path: config.base, maxAge: 0, secure: secureCookie }),
  ];
  return response(303, '', {
    ...opts,
    csp: 'shell',
    cookies,
    extra: { Location: `${config.base}/`, 'Clear-Site-Data': '"cache"' },
  });
}

async function play(request, url, rel, config, deps, opts) {
  const user = await currentUser(request, config, deps.limiter);
  const match = /^play\/([a-z0-9-]+)\/?(.*)$/.exec(rel);
  if (!match) return plain(404, 'Not found\n', opts);
  const slot = slotById(match[1]);
  const requested = `${config.base}/play/${match[1]}/${match[2]}`;
  if (!user) {
    if (!wantsDocument(request)) return plain(401, 'Unauthorized\n', opts);
    const next = safeNext(requested, config.base);
    return response(303, '', {
      ...opts,
      csp: 'shell',
      extra: { Location: `${config.base}/?next=${encodeURIComponent(next)}` },
    });
  }
  if (!slot) return html(404, renderMissing({ base: config.base, assetOrigin: config.assetOrigin }), opts);
  const state = await slotState(slot, config, deps.bucket);
  if (state !== 'ready') {
    return html(404, renderMissing({
      base: config.base,
      assetOrigin: config.assetOrigin,
      message: slotStatusCopy(slot, state),
    }), opts);
  }
  let rest = match[2];
  if (rest === '' && !rel.endsWith('/')) {
    return response(303, '', { ...opts, csp: 'shell', extra: { Location: `${config.base}/play/${slot.id}/` } });
  }
  const filePath = fileFromPlay(rest);
  if (!filePath) return plain(404, 'Not found\n', opts);
  const loaded = await loadManifest(deps.bucket, slot.packageId, config.sealKey);
  const expected = config.packages[slot.id];
  if (!loaded || loaded.mismatch || !expected || !timingSafeEqual(loaded.parsed.zipSha256, expected.sha256)) {
    return html(404, renderMissing({
      base: config.base,
      assetOrigin: config.assetOrigin,
      message: slotStatusCopy(slot, 'mismatch'),
    }), opts);
  }
  const entry = loaded.parsed.files[filePath];
  if (!entry) return plain(404, 'Not found\n', opts);
  const object = await deps.bucket.get(fileKey(slot.packageId, filePath));
  if (!object) return plain(404, 'Not found\n', opts);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== entry.bytes || !timingSafeEqual(await sha256Hex(bytes), entry.sha256)) {
    return plain(404, 'Not found\n', opts);
  }
  const type = contentTypeFor(filePath);
  const extra = {};
  if (type === 'application/octet-stream' || type === 'image/svg+xml') {
    extra['content-security-policy'] = "script-src 'none'; object-src 'none'; base-uri 'none'";
  }
  if (type === 'application/octet-stream') extra['content-disposition'] = 'attachment';
  return response(200, bytes, { ...opts, contentType: type, csp: 'game', extra });
}
