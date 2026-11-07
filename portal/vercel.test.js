import assert from 'node:assert/strict';
import test from 'node:test';
import { createLimiter } from './limit.js';
import { bucketFromEnv, rateStoreFromEnv, requestFromNode, upstashStore } from './node-adapter.js';

test('a Vercel rewrite keeps the bench path and the query', async () => {
  const request = requestFromNode({
    method: 'GET',
    query: { path: 'play/maxwells-demon' },
    headers: {
      host: 'preview.vercel.app',
      'x-forwarded-proto': 'https',
      'x-gl-bench-search': '?next=%2Ftest%2F',
      'x-invoke-path': '/api/bench',
    },
  });
  assert.equal(request.url, 'https://preview.vercel.app/test/play/maxwells-demon?next=%2Ftest%2F');
  const invoked = requestFromNode({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'lab.example', 'x-invoke-path': '/test/login' },
  }, 'username=ada');
  assert.equal(invoked.url, 'https://lab.example/test/login');
  assert.equal(await invoked.text(), 'username=ada');
});

test('rate limit and package stores stay off without https settings', async () => {
  assert.equal(rateStoreFromEnv({}), null);
  assert.equal(rateStoreFromEnv({ KV_REST_API_URL: 'http://example.test', KV_REST_API_TOKEN: 't' }), null);
  assert.equal(bucketFromEnv({ PORTAL_PACKAGE_BASE_URL: 'http://files.example' }), null);

  let body = null;
  const fetchImpl = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ result: body[0] === 'GET' ? '1' : 'OK' }), { status: 200 });
  };
  const store = upstashStore('https://example.upstash.io', 'token', fetchImpl);
  assert.equal(await store.get('rev:abc'), '1');
  assert.deepEqual(body, ['GET', 'rev:abc']);
  const limiter = createLimiter(store, { windowMs: 60000, userLimit: 8, ipLimit: 30, now: () => 1_000 });
  const hit = await limiter.attempt('203.0.113.8', 'ada');
  assert.equal(hit.ok, true);
  assert.equal(body[0], 'SET');

  const files = new Map();
  const bucket = bucketFromEnv({
    PORTAL_PACKAGE_BASE_URL: 'https://files.example/private',
    PORTAL_PACKAGE_TOKEN: 'secret-token',
  }, async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer secret-token');
    assert.equal(url, 'https://files.example/private/packages/md/manifest.json');
    files.set('seen', true);
    return new Response(null, { status: 404 });
  });
  assert.equal(await bucket.get('packages/md/manifest.json'), null);
  assert.equal(files.get('seen'), true);
});
