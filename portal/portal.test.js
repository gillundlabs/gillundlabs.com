import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { acceptZipBytes, assertSafeOut } from './accept-package.js';
import { REFUSED_PACKAGE_IDS } from './catalog.js';
import { loadPortalConfig } from './config.js';
import { hashPassword, manifestSealOk, MIN_ITERATIONS } from './crypto.js';
import { handle } from './handle.js';
import { createLimiter, memoryStore } from './limit.js';
import { GUARD_SCRIPT, renderClosed } from './pages.js';
import { safeNext } from './redirect.js';
import { scopeCoversBench } from './sw-guard.js';
import { readZip } from './zip.js';

const SENTINEL = 'PRIVATE_GAME_SENTINEL';
const PASSWORD = 'correct horse battery';

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function zipFiles(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.from(file.data);
    const method = file.method || 0;
    const stored = method === 8 ? deflateRawSync(raw) : raw;
    const crc = file.crc == null ? crc32(raw) : file.crc;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localAt = offset;
    const chunk = Buffer.concat([local, name, stored]);
    locals.push(chunk);
    offset += chunk.length;
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(file.external || 0, 38);
    central.writeUInt32LE(localAt, 42);
    central.set(name, 46);
    centrals.push(central);
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function bucketFrom(entries) {
  return {
    async get(key) {
      const value = entries.get(key);
      if (!value) return null;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      return {
        async text() { return new TextDecoder().decode(bytes); },
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      };
    },
  };
}

function depsFor(env, extra = {}) {
  const config = loadPortalConfig(env);
  return {
    env,
    bucket: extra.bucket || null,
    limiter: extra.limiter === undefined
      ? createLimiter(memoryStore(), {
        windowMs: config.windowMs || 600000,
        userLimit: config.userLimit || 8,
        ipLimit: config.ipLimit || 30,
      })
      : extra.limiter,
    getIp: () => extra.ip || '203.0.113.9',
  };
}

async function configuredEnv(overrides = {}) {
  const passwordHash = await hashPassword(PASSWORD, 1000);
  return {
    PORTAL_TEST_KDF: '1',
    PORTAL_SESSION_SECRET: 'session-secret-session-secret-session',
    PORTAL_PACKAGE_SEAL_KEY: 'package-seal-key-package-seal-key-1',
    PORTAL_USERS: JSON.stringify([{ username: 'ada', passwordHash, iterations: 1000 }]),
    PORTAL_RATE_USER_LIMIT: '8',
    PORTAL_RATE_IP_LIMIT: '30',
    PORTAL_RATE_WINDOW_MS: '600000',
    ...overrides,
  };
}

function cookieValue(response, name) {
  const row = (response.headers.getSetCookie?.() || []).find((item) => item.startsWith(`${name}=`));
  if (!row) return '';
  return row.slice(name.length + 1).split(';')[0];
}

function assertUncached(response) {
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(response.headers.get('x-robots-tag') || '', /nofollow/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('vary') || '', /Cookie/i);
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
}

async function signIn(env, deps, { password = PASSWORD, username = 'ada', next = '', origin = 'https://lab.example', csrfCookie = '', csrf = '' } = {}) {
  if (!csrf) {
    const page = await handle(new Request('https://lab.example/test/'), deps);
    csrf = cookieValue(page, 'gl_test_csrf');
    const html = await page.text();
    const field = html.match(/name="csrf" value="([^"]*)"/);
    assert.equal(field && field[1], csrf);
  }
  const body = new URLSearchParams({ username, password, csrf, next });
  return handle(new Request('https://lab.example/test/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin,
      cookie: `gl_test_csrf=${csrfCookie || csrf}`,
    },
    body,
  }), deps);
}

test('service-worker scopes under the demos do not cover the bench', () => {
  assert.equal(scopeCoversBench('https://gillundlabs.com/play/vacuum-maze/', '/test'), false);
  assert.equal(scopeCoversBench('https://gillundlabs.com/play/maxwells-demon/sw.js', '/test'), false);
  assert.equal(scopeCoversBench('https://gillundlabs.com/', '/test'), true);
  assert.equal(scopeCoversBench('https://gillundlabs.com/test', '/test'), true);
  assert.equal(scopeCoversBench('https://gillundlabs.com/testing/', '/test'), false);
  assert.match(GUARD_SCRIPT, /path === '\/'/);
  assert.match(GUARD_SCRIPT, /unregister/);
});

test('redirects stay under the bench', () => {
  assert.equal(safeNext('https://evil.example/test/play/maxwells-demon/', '/test'), '/test/');
  assert.equal(safeNext('//evil.example/test/', '/test'), '/test/');
  assert.equal(safeNext('/test/play/maxwells-demon/../../robots.txt', '/test'), '/test/');
  assert.equal(safeNext('/test/play/maxwells-demon/', '/test'), '/test/play/maxwells-demon/');
  assert.equal(safeNext('/test/play/maxwells-demon', '/test'), '/test/play/maxwells-demon/');
  assert.equal(safeNext('/robots.txt', '/test'), '/test/');
  assert.equal(safeNext('/test/%2e%2e/robots.txt', '/test'), '/test/');
});

test('the public and unconfigured pages do not ask for a password', async () => {
  for (const reason of ['public', 'unconfigured', 'unavailable']) {
    const html = renderClosed({ reason });
    assert.equal(html.includes('type="password"'), false);
    assert.equal(html.includes('<form'), false);
    assert.equal(html.includes('autocomplete="current-password"'), false);
    assert.match(html, /noindex/);
    assert.match(html, /Testing bench/);
  }
  const page = await handle(new Request('https://lab.example/test/'), { env: {}, limiter: null });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.equal(html.includes('<form'), false);
  assert.match(html, /does not ask for one/);
  assertUncached(page);
  assert.match(page.headers.get('strict-transport-security') || '', /max-age=/);
  assert.match(page.headers.get('content-security-policy') || '', /worker-src 'none'/);

  const posted = await handle(new Request('https://lab.example/test/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://lab.example' },
    body: 'username=ada&password=super-secret-value',
  }), { env: {} });
  const denied = await posted.text();
  assert.equal(posted.status, 404);
  assert.equal(denied.includes('super-secret-value'), false);
  assert.equal(denied.includes('<form'), false);
  assert.equal(posted.headers.get('set-cookie'), null);
});

test('a weak password record or a missing rate limit stays closed', async () => {
  const passwordHash = await hashPassword(PASSWORD, 1000);
  const weak = await configuredEnv({ PORTAL_TEST_KDF: undefined, PORTAL_USERS: JSON.stringify([{ username: 'ada', passwordHash, iterations: 1000 }]) });
  delete weak.PORTAL_TEST_KDF;
  const weakPage = await handle(new Request('https://lab.example/test/'), depsFor(weak));
  assert.equal((await weakPage.text()).includes('<form'), false);

  const strongHash = await hashPassword('x', MIN_ITERATIONS);
  const parsed = loadPortalConfig({
    PORTAL_SESSION_SECRET: 'session-secret-session-secret-session',
    PORTAL_USERS: JSON.stringify([{ username: 'ada', passwordHash: strongHash, iterations: MIN_ITERATIONS }]),
  });
  assert.equal(parsed.authReady, true);
  assert.equal(parsed.users[0].iterations, MIN_ITERATIONS);

  const ready = await configuredEnv();
  const closed = await handle(new Request('https://lab.example/test/'), depsFor(ready, { limiter: null }));
  assert.equal((await closed.text()).includes('type="password"'), false);

  const remote = await handle(new Request('http://lab.example/test/'), depsFor({ ...ready, PORTAL_DEV_INSECURE: '1' }));
  assert.equal((await remote.text()).includes('type="password"'), false);
  assert.equal(remote.headers.get('strict-transport-security'), null);
});

test('sign-in, session, sign-out, and a reused cookie', async () => {
  const env = await configuredEnv();
  const deps = depsFor(env);
  const bad = await signIn(env, deps, { password: 'nope' });
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /were not accepted/);
  assert.equal(cookieValue(bad, 'gl_test_session'), '');
  assertUncached(bad);

  const good = await signIn(env, deps);
  assert.equal(good.status, 303);
  assert.equal(good.headers.get('location'), '/test/');
  const session = cookieValue(good, 'gl_test_session');
  const setCookies = good.headers.getSetCookie();
  const sessionCookie = setCookies.find((item) => item.startsWith('gl_test_session='));
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Strict/);
  assert.match(sessionCookie, /Path=\/test/);
  assert.equal(session.includes(PASSWORD), false);
  assertUncached(good);
  assert.match(good.headers.get('strict-transport-security') || '', /max-age=/);

  const hub = await handle(new Request('https://lab.example/test/', { headers: { cookie: `gl_test_session=${session}` } }), deps);
  const hubHtml = await hub.text();
  assert.equal(hub.status, 200);
  assert.match(hubHtml, /Signed in as ada/);
  assert.match(hubHtml, /Maxwell's Demon/);
  assert.match(hubHtml, /Vacuum Maze/);
  assert.match(hubHtml, /Experimental/);
  assert.match(hubHtml, /Five extra parts/);
  assert.match(hubHtml, /md-test-36ec3cdea1/);
  assert.match(hubHtml, /vm-test-full-a4a51186fe/);
  assert.match(hubHtml, /fa-standard-full-v1-4322acb/);
  assert.match(hubHtml, /fa-experimental-full-v3-craft-b6a055d/);
  assert.match(hubHtml, /stays closed/);
  assert.equal(hubHtml.includes('still to come'), false);
  assert.equal(hubHtml.includes('still waiting'), false);
  assert.equal(hubHtml.includes('being put together'), false);
  assert.equal(hubHtml.includes(REFUSED_PACKAGE_IDS[0]), false);
  assert.equal(hubHtml.includes('href="/test/play/'), false);
  assert.equal(hubHtml.includes('cheating'), false);
  assert.equal(hubHtml.includes('$'), false);
  assert.match(hub.headers.get('content-security-policy') || '', /worker-src 'none'/);
  assertUncached(hub);
  const csrf = cookieValue(hub, 'gl_test_csrf');
  assert.equal(hubHtml.match(/name="csrf" value="([^"]*)"/)[1], csrf);

  const goodbye = await handle(new Request('https://lab.example/test/logout', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://lab.example',
      cookie: `gl_test_session=${session}; gl_test_csrf=${csrf}`,
    },
    body: new URLSearchParams({ csrf }),
  }), deps);
  assert.equal(goodbye.status, 303);
  assert.equal(goodbye.headers.get('location'), '/test/');
  assert.equal(goodbye.headers.get('clear-site-data'), '"cache"');
  assert.match(goodbye.headers.getSetCookie().find((item) => item.startsWith('gl_test_session=')), /Max-Age=0/);
  assertUncached(goodbye);
  assert.equal(hub.headers.has('clear-site-data'), false);
  assert.equal(good.headers.has('clear-site-data'), false);

  const again = await handle(new Request('https://lab.example/test/', { headers: { cookie: `gl_test_session=${session}` } }), deps);
  const againHtml = await again.text();
  assert.match(againHtml, /Sign in/);
  assert.equal(againHtml.includes('Signed in as ada'), false);
});

test('bad origin, missing token, open redirect, and rate limit', async () => {
  const env = await configuredEnv({ PORTAL_RATE_USER_LIMIT: '3', PORTAL_RATE_IP_LIMIT: '10' });
  const deps = depsFor(env);
  const first = await handle(new Request('https://lab.example/test/?next=https://evil.example/steal'), deps);
  const csrf = cookieValue(first, 'gl_test_csrf');
  const html = await first.text();
  assert.equal(html.includes('evil.example'), false);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /method="post"/);

  const cross = await signIn(env, deps, { origin: 'https://evil.example', csrf });
  assert.equal(cross.status, 403);
  assert.equal(cross.headers.get('set-cookie')?.includes(PASSWORD), false);

  const page = await handle(new Request('https://lab.example/test/'), deps);
  const token = cookieValue(page, 'gl_test_csrf');
  await page.text();
  const sneaky = await signIn(env, deps, { csrf: token, next: 'https://evil.example/test/play/maxwells-demon/' });
  assert.equal(sneaky.status, 303);
  assert.equal(sneaky.headers.get('location'), '/test/');

  const limited = depsFor(env, { ip: '203.0.113.20' });
  for (let i = 0; i < 3; i++) {
    const attempt = await signIn(env, limited, { password: 'wrong' });
    assert.equal(attempt.status, 401);
    await attempt.text();
  }
  const locked = await signIn(env, limited, { password: PASSWORD });
  assert.equal(locked.status, 429);
  assert.match(locked.headers.get('retry-after') || '', /^[1-9]/);
  assert.equal(cookieValue(locked, 'gl_test_session'), '');
  assert.equal((await locked.text()).includes(PASSWORD), false);
});

test('direct requests for a sealed copy, an archive, and a worker are denied', async () => {
  const html = `<!doctype html><title>Fixture</title><p>${SENTINEL}</p>`;
  const zip = zipFiles([{ name: 'index.html', data: html }, { name: 'extra.txt', data: 'hello' }]);
  const sha = createHash('sha256').update(zip).digest('hex');
  const env = await configuredEnv({
    PORTAL_PACKAGES_MANIFEST: JSON.stringify({
      'maxwells-demon': { packageId: 'md-test-36ec3cdea1', sha256: sha },
    }),
  });
  const accepted = await acceptZipBytes({
    bytes: zip,
    slotId: 'maxwells-demon',
    packagesManifest: JSON.parse(env.PORTAL_PACKAGES_MANIFEST),
    sealKey: env.PORTAL_PACKAGE_SEAL_KEY,
  });
  assert.equal(await manifestSealOk(accepted.manifest, env.PORTAL_PACKAGE_SEAL_KEY), true);
  const entries = new Map();
  entries.set('packages/md-test-36ec3cdea1/manifest.json', Buffer.from(JSON.stringify(accepted.manifest)));
  for (const file of accepted.files) entries.set(`packages/md-test-36ec3cdea1/files/${file.name}`, file.data);
  entries.set('packages/md-test-36ec3cdea1/files/sw.js', Buffer.from('self.addEventListener("fetch",()=>{})'));
  entries.set('packages/md-test-36ec3cdea1.zip', Buffer.from(SENTINEL));
  const deps = depsFor(env, { bucket: bucketFrom(entries) });

  const anonymous = await handle(new Request('https://lab.example/test/play/maxwells-demon/index.html'), deps);
  assert.equal(anonymous.status, 401);
  assert.equal(await anonymous.text(), 'Unauthorized\n');
  assertUncached(anonymous);
  assert.equal(anonymous.headers.has('clear-site-data'), false);

  const browser = await handle(new Request('https://lab.example/test/play/maxwells-demon/', { headers: { accept: 'text/html' } }), deps);
  assert.equal(browser.status, 303);
  assert.equal(browser.headers.get('location'), '/test/?next=%2Ftest%2Fplay%2Fmaxwells-demon%2F');
  assert.equal((await browser.text()).includes(SENTINEL), false);
  assertUncached(browser);

  const archive = await handle(new Request('https://lab.example/test/packages/md-test-36ec3cdea1.zip'), deps);
  assert.equal(archive.status, 401);
  assert.equal((await archive.text()).includes(SENTINEL), false);

  const asWorker = await handle(new Request('https://lab.example/test/play/maxwells-demon/index.html', {
    headers: { 'service-worker': 'script' },
  }), deps);
  assert.equal(asWorker.status, 404);

  const signed = await signIn(env, deps);
  const session = cookieValue(signed, 'gl_test_session');
  await signed.text();
  const authed = { cookie: `gl_test_session=${session}` };
  const game = await handle(new Request('https://lab.example/test/play/maxwells-demon/', { headers: authed }), deps);
  assert.equal(game.status, 200);
  assert.match(game.headers.get('content-type') || '', /text\/html/);
  assert.match(game.headers.get('cache-control') || '', /no-store/);
  assert.match(game.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal((game.headers.get('content-security-policy') || '').includes("script-src 'none'"), false);
  const body = await game.text();
  assert.equal(body.includes(SENTINEL), true);
  assert.equal(game.headers.has('clear-site-data'), false);

  const workerFile = await handle(new Request('https://lab.example/test/play/maxwells-demon/sw.js', { headers: authed }), deps);
  assert.equal(workerFile.status, 404);
  assert.equal((await workerFile.text()).includes('addEventListener'), false);

  const zipUrl = await handle(new Request('https://lab.example/test/packages/md-test-36ec3cdea1.zip', { headers: authed }), deps);
  assert.equal(zipUrl.status, 404);
  assert.equal((await zipUrl.text()).includes(SENTINEL), false);

  const escaped = await handle(new Request('https://lab.example/test/play/maxwells-demon/%2e%2e/%2e%2e/robots.txt', { headers: authed }), deps);
  assert.notEqual(escaped.status, 200);
  assert.equal((await escaped.text()).includes('Sitemap'), false);

  const pending = await handle(new Request('https://lab.example/test/play/fantastic-apparatus-experimental/', {
    headers: { ...authed, accept: 'text/html' },
  }), deps);
  const pendingHtml = await pending.text();
  assert.equal(pending.status, 404);
  assert.match(pendingHtml, /five extra parts/);
  assert.match(pendingHtml, /stays closed/);
  assert.equal(pendingHtml.includes('still to come'), false);
  assert.equal(pendingHtml.includes(SENTINEL), false);

  const hub = await handle(new Request('https://lab.example/test/', { headers: authed }), deps);
  const hubHtml = await hub.text();
  assert.match(hubHtml, /href="\/test\/play\/maxwells-demon\/"/);
  assert.equal(hubHtml.includes('/test/play/fantastic-apparatus/'), false);
  assert.equal(hubHtml.includes('/test/play/vacuum-maze/'), false);
});

test('a mismatched or refused package is not served', async () => {
  const zip = zipFiles([{ name: 'index.html', data: SENTINEL }]);
  const sha = createHash('sha256').update(zip).digest('hex');
  const env = await configuredEnv({
    PORTAL_PACKAGES_MANIFEST: JSON.stringify({
      'maxwells-demon': { packageId: 'md-test-36ec3cdea1', sha256: sha },
    }),
  });
  const accepted = await acceptZipBytes({
    bytes: zip,
    slotId: 'maxwells-demon',
    packagesManifest: JSON.parse(env.PORTAL_PACKAGES_MANIFEST),
    sealKey: env.PORTAL_PACKAGE_SEAL_KEY,
  });
  const manifest = { ...accepted.manifest, files: { ...accepted.manifest.files } };
  manifest.files['index.html'] = { ...manifest.files['index.html'], sha256: 'a'.repeat(64) };
  const entries = new Map([
    ['packages/md-test-36ec3cdea1/manifest.json', Buffer.from(JSON.stringify(manifest))],
    ['packages/md-test-36ec3cdea1/files/index.html', Buffer.from(SENTINEL)],
  ]);
  const deps = depsFor(env, { bucket: bucketFrom(entries) });
  const signed = await signIn(env, deps);
  const session = cookieValue(signed, 'gl_test_session');
  const game = await handle(new Request('https://lab.example/test/play/maxwells-demon/', {
    headers: { cookie: `gl_test_session=${session}`, accept: 'text/html' },
  }), deps);
  const text = await game.text();
  assert.notEqual(game.status, 200);
  assert.equal(text.includes(SENTINEL), false);

  const refused = await configuredEnv({
    PORTAL_PACKAGES_MANIFEST: JSON.stringify({
      'vacuum-maze': { packageId: REFUSED_PACKAGE_IDS[0], sha256: sha },
    }),
  });
  assert.equal(loadPortalConfig(refused).authReady, false);
  const closed = await handle(new Request('https://lab.example/test/'), depsFor(refused));
  assert.equal((await closed.text()).includes('type="password"'), false);
});

test('zip acceptance rejects slip, workers, the wrong seal, and the public tree', async () => {
  const good = zipFiles([
    { name: 'index.html', data: '<p>ok</p>' },
    { name: 'js/app.js', data: 'var n=1;', method: 8 },
  ]);
  const files = readZip(good);
  assert.deepEqual(files.map((file) => file.name), ['index.html', 'js/app.js']);
  assert.throws(() => readZip(zipFiles([{ name: '../secret.txt', data: 'x' }])));
  assert.throws(() => readZip(zipFiles([{ name: '/etc/passwd', data: 'x' }])));
  assert.throws(() => readZip(zipFiles([{ name: 'sw.js', data: 'fetch' }])));
  assert.throws(() => readZip(zipFiles([{ name: 'link', data: 'x', external: 0o120000 << 16 }])));

  const sha = createHash('sha256').update(good).digest('hex');
  await assert.rejects(() => acceptZipBytes({
    bytes: good,
    slotId: 'fantastic-apparatus-experimental',
    packagesManifest: {
      'fantastic-apparatus-experimental': {
        packageId: 'fa-experimental-full-v3-craft-b6a055d',
        sha256: sha,
      },
    },
    sealKey: 'package-seal-key-package-seal-key-1',
  }));
  const standard = await acceptZipBytes({
    bytes: good,
    slotId: 'fantastic-apparatus',
    packagesManifest: {
      'fantastic-apparatus': { packageId: 'fa-standard-full-v1-4322acb', sha256: sha },
    },
    sealKey: 'package-seal-key-package-seal-key-1',
  });
  assert.equal(standard.manifest.packageId, 'fa-standard-full-v1-4322acb');
  await assert.rejects(() => acceptZipBytes({
    bytes: good,
    slotId: 'maxwells-demon',
    packagesManifest: { 'maxwells-demon': { packageId: 'md-test-36ec3cdea1', sha256: 'b'.repeat(64) } },
    sealKey: 'package-seal-key-package-seal-key-1',
  }));
  assert.throws(() => assertSafeOut(path.join(process.cwd(), 'games', 'private')));
  const dir = await mkdtemp(path.join(tmpdir(), 'gl-bench-'));
  assert.doesNotThrow(() => assertSafeOut(dir));
  await rm(dir, { recursive: true });
  assert.equal(sha.length, 64);
});

test('loopback preview may omit Secure, and a store failure does not echo the password', async () => {
  const env = await configuredEnv({ PORTAL_DEV_INSECURE: '1' });
  const deps = depsFor(env);
  const page = await handle(new Request('http://127.0.0.1/test/'), deps);
  assert.match(await page.text(), /type="password"/);
  const csrfCookie = page.headers.getSetCookie().find((item) => item.startsWith('gl_test_csrf='));
  assert.equal(csrfCookie.includes('Secure'), false);
  assert.equal(page.headers.get('strict-transport-security'), null);

  const broken = depsFor(env, {
    limiter: {
      async attempt() { throw new Error('store down'); },
      async isRevoked() { return false; },
      async revoke() {},
    },
  });
  const posted = await handle(new Request('https://lab.example/test/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://lab.example' },
    body: 'username=ada&password=super-secret-value&csrf=nope',
  }), broken);
  const text = await posted.text();
  assert.equal(posted.status, 503);
  assert.equal(text.includes('super-secret-value'), false);
  assert.equal(text.includes('<form'), false);
});

test('the committed public page matches the closed renderer and the guard script', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const html = await readFile(path.join(root, 'test', 'index.html'), 'utf8');
  const guard = await readFile(path.join(root, 'test', 'portal-sw-guard.js'), 'utf8');
  assert.equal(html, renderClosed({ reason: 'public' }));
  assert.equal(guard, GUARD_SCRIPT);
});
