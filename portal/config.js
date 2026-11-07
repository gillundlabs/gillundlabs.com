/* Read edge configuration. Missing or weak secrets leave the bench closed.
   Zip seals are not given a default. */

import { parsePasswordHash } from './crypto.js';
import { isRefusedPackage } from './catalog.js';

const HEX = /^[a-f0-9]{64}$/;

export function normalizeBase(value) {
  if (typeof value !== 'string' || !/^\/[a-z0-9-]{1,32}$/.test(value)) return null;
  return value;
}

function parseLimit(raw, fallback, min, max) {
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(String(raw))) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function parseAssetOrigin(raw) {
  if (raw == null || raw === '') return '';
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.origin;
  } catch {
    return '';
  }
  return '';
}

export function loadPortalConfig(env = {}) {
  const base = normalizeBase(env.PORTAL_BASE || '/test');
  const testKdf = env.PORTAL_TEST_KDF === '1';
  const devInsecure = env.PORTAL_DEV_INSECURE === '1';
  const trustProxy = env.PORTAL_TRUST_PROXY === '1';
  const sessionSecret = typeof env.PORTAL_SESSION_SECRET === 'string' ? env.PORTAL_SESSION_SECRET : '';
  const sealKey = typeof env.PORTAL_PACKAGE_SEAL_KEY === 'string' ? env.PORTAL_PACKAGE_SEAL_KEY : '';
  const userLimit = parseLimit(env.PORTAL_RATE_USER_LIMIT, 8, 3, 40);
  const ipLimit = parseLimit(env.PORTAL_RATE_IP_LIMIT, 30, 3, 200);
  const windowMs = parseLimit(env.PORTAL_RATE_WINDOW_MS, 15 * 60 * 1000, 1000, 24 * 60 * 60 * 1000);
  const assetOrigin = parseAssetOrigin(env.PORTAL_ASSET_ORIGIN);
  const users = parseUsers(env.PORTAL_USERS, testKdf);
  const packages = parsePackages(env.PORTAL_PACKAGES_MANIFEST);
  const authReady = Boolean(
    base
    && sessionSecret.length >= 32
    && users
    && users.length > 0
    && userLimit
    && ipLimit
    && windowMs,
  );
  return {
    base: base || '/test',
    testKdf,
    devInsecure,
    trustProxy,
    sessionSecret,
    sealKey,
    sealReady: sealKey.length >= 32,
    users: users || [],
    packages: packages || {},
    packagesBroken: packages === null,
    userLimit: userLimit || 0,
    ipLimit: ipLimit || 0,
    windowMs: windowMs || 0,
    assetOrigin,
    authReady: authReady && packages !== null,
  };
}

function parseUsers(raw, testKdf) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 32) return null;
  const users = [];
  for (const row of parsed) {
    const user = parsePasswordHash(row, { testKdf });
    if (!user) return null;
    users.push(user);
  }
  const iterations = users[0].iterations;
  if (users.some((user) => user.iterations !== iterations)) return null;
  const names = new Set(users.map((user) => user.username));
  if (names.size !== users.length) return null;
  return users;
}

function parsePackages(raw) {
  if (raw == null || raw === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out = {};
  for (const [slotId, entry] of Object.entries(parsed)) {
    if (!/^[a-z0-9-]{1,64}$/.test(slotId)) return null;
    if (!entry || typeof entry !== 'object') return null;
    const packageId = entry.packageId;
    const sha256 = entry.sha256;
    if (typeof sha256 !== 'string' || sha256 === '') continue;
    if (!HEX.test(sha256)) return null;
    if (typeof packageId !== 'string' || !/^[a-z0-9-]{8,80}$/.test(packageId)) return null;
    if (isRefusedPackage(packageId)) return null;
    out[slotId] = { packageId, sha256 };
  }
  return out;
}

export function isLocalHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

export function cookieSecure(url, request, config) {
  if (url.protocol === 'https:') return true;
  if (!config.trustProxy) return false;
  return (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

export function localDevHttp(url, config) {
  return config.devInsecure && isLocalHost(url.hostname) && url.protocol === 'http:';
}

export function transportAllowsSession(url, request, config) {
  if (cookieSecure(url, request, config)) return true;
  return localDevHttp(url, config);
}
