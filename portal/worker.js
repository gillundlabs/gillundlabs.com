/* Edge entry. Deploying this file is a separate owner decision.
   Without the rate-limit store and the password secret, every request stays closed. */

import { loadPortalConfig } from './config.js';
import { handle } from './handle.js';
import { cloudflareKvStore, createLimiter } from './limit.js';

export default {
  async fetch(request, env) {
    const config = loadPortalConfig(env);
    const limiter = env.PORTAL_RATE
      ? createLimiter(cloudflareKvStore(env.PORTAL_RATE), {
        windowMs: config.windowMs || 15 * 60 * 1000,
        userLimit: config.userLimit || 8,
        ipLimit: config.ipLimit || 30,
      })
      : null;
    return handle(request, {
      env,
      limiter,
      bucket: env.PORTAL_PACKAGES || null,
      getIp(req) {
        const ip = req.headers.get('cf-connecting-ip') || '';
        return /^[A-Za-z0-9:.]{3,64}$/.test(ip) ? ip : 'unknown';
      },
    });
  },
};
