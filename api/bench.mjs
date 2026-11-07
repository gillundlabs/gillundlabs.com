/* Vercel Node function for /test only. Rewritten by vercel.json.
   With no secrets and no shared rate-limit store, this returns the closed page. */

import { loadPortalConfig } from '../portal/config.js';
import { handle } from '../portal/handle.js';
import { createLimiter } from '../portal/limit.js';
import { bucketFromEnv, rateStoreFromEnv, requestFromNode } from '../portal/node-adapter.js';

export const config = { api: { bodyParser: false } };

function clientIp(request) {
  if (process.env.VERCEL !== '1') return 'local';
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return /^[A-Za-z0-9:.]{3,64}$/.test(ip) ? ip : 'unknown';
}

export default async function bench(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const request = requestFromNode(req, body.length ? body : undefined);
  const portal = loadPortalConfig(process.env);
  const store = rateStoreFromEnv(process.env);
  const limiter = store
    ? createLimiter(store, {
      windowMs: portal.windowMs || 15 * 60 * 1000,
      userLimit: portal.userLimit || 8,
      ipLimit: portal.ipLimit || 30,
    })
    : null;
  const response = await handle(request, {
    env: process.env,
    limiter,
    bucket: bucketFromEnv(process.env),
    getIp: clientIp,
  });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key === 'set-cookie') return;
    res.setHeader(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
