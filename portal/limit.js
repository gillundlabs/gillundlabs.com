/* Shared attempt counter. A single Node process may keep it in memory.
   More than one instance, including every edge isolate, needs a shared store.
   Login does not proceed when the counter is missing or fails. */

export function createLimiter(store, options) {
  const windowMs = options.windowMs;
  const userLimit = options.userLimit;
  const ipLimit = options.ipLimit;
  const now = options.now || (() => Date.now());

  async function take(key, limit) {
    const t = now();
    const raw = await store.get(key);
    let stamps = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) stamps = parsed.filter((n) => typeof n === 'number' && t - n < windowMs);
      } catch {
        stamps = [];
      }
    }
    if (stamps.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (t - stamps[0])) / 1000));
      return { ok: false, retryAfter };
    }
    stamps.push(t);
    await store.set(key, JSON.stringify(stamps), Math.ceil(windowMs / 1000));
    return { ok: true, retryAfter: 0 };
  }

  return {
    async attempt(ip, username) {
      const ipHit = await take(`ip:${ip}`, ipLimit);
      if (!ipHit.ok) return ipHit;
      return take(`user:${ip}:${username.toLowerCase()}`, userLimit);
    },
    async revoke(sid, ttlSec) {
      await store.set(`rev:${sid}`, '1', ttlSec);
    },
    async isRevoked(sid) {
      return (await store.get(`rev:${sid}`)) === '1';
    },
  };
}

export function memoryStore() {
  const map = new Map();
  return {
    async get(key) {
      const row = map.get(key);
      if (!row) return null;
      if (row.expires <= Date.now()) {
        map.delete(key);
        return null;
      }
      return row.value;
    },
    async set(key, value, ttlSec) {
      map.set(key, { value, expires: Date.now() + ttlSec * 1000 });
    },
  };
}

export function cloudflareKvStore(kv) {
  return {
    async get(key) {
      return kv.get(key);
    },
    async set(key, value, ttlSec) {
      await kv.put(key, value, { expirationTtl: Math.max(60, Math.ceil(ttlSec)) });
    },
  };
}
