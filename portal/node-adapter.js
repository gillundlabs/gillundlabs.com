/* Node and Vercel adapters. No account, store, or secret is created here.
   Missing rate-limit or package settings leave the bench closed. */

export function firstHeader(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value == null ? '' : String(value);
}

const SKIP_HEADERS = new Set(['transfer-encoding', 'connection', 'keep-alive', 'host', 'content-length', 'upgrade']);

export function requestFromNode(req, body) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value == null || SKIP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  const proto = firstHeader(req.headers?.['x-forwarded-proto']).split(',')[0].trim() || 'https';
  const host = firstHeader(req.headers?.['x-forwarded-host']).split(',')[0].trim()
    || firstHeader(req.headers?.host)
    || 'localhost';
  const invoked = firstHeader(req.headers?.['x-invoke-path']);
  let path;
  if (invoked === '/test' || invoked.startsWith('/test/')) path = invoked;
  else {
    const raw = req.query?.path;
    const suffix = Array.isArray(raw) ? raw.filter(Boolean).join('/') : (raw || '');
    const cleaned = String(suffix).replace(/^\/+/, '');
    path = cleaned ? `/test/${cleaned}` : '/test/';
  }
  if (path === '/test') path = '/test/';
  const search = firstHeader(req.headers?.['x-gl-bench-search']);
  const url = `${proto}://${host}${path}${search}`;
  const method = (req.method || 'GET').toUpperCase();
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && body) init.body = body;
  return new Request(url, init);
}

export function upstashStore(baseUrl, token, fetchImpl = fetch) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  async function command(args) {
    const response = await fetchImpl(root, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error('rate store');
    const json = await response.json();
    return json.result;
  }
  return {
    async get(key) {
      const result = await command(['GET', key]);
      return result == null ? null : String(result);
    },
    async set(key, value, ttlSec) {
      await command(['SET', key, value, 'EX', String(Math.max(1, Math.ceil(ttlSec)))]);
    },
  };
}

export function httpBucket(baseUrl, token, fetchImpl = fetch) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  return {
    async get(key) {
      const response = await fetchImpl(`${root}/${key}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('package store');
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        async text() { return new TextDecoder().decode(bytes); },
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
      };
    },
  };
}

export function rateStoreFromEnv(env, fetchImpl = fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '';
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '';
  if (!url || !token) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return upstashStore(url, token, fetchImpl);
}

export function bucketFromEnv(env, fetchImpl = fetch) {
  const base = env.PORTAL_PACKAGE_BASE_URL || '';
  if (!base) return null;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return httpBucket(base, env.PORTAL_PACKAGE_TOKEN || '', fetchImpl);
}
