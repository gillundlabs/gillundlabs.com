/* Web Crypto helpers shared by the edge handler and the local seal tools.
   No password, hash, or seal from the laboratory is stored in this file. */

const text = new TextEncoder();

export const MIN_ITERATIONS = 600000;
export const TEST_MIN_ITERATIONS = 1000;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function bytesToB64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64urlToBytes(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function timingSafeEqual(left, right) {
  const a = typeof left === 'string' ? text.encode(left) : left;
  const b = typeof right === 'string' ? text.encode(right) : right;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function pbkdf2Bits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, iterations = MIN_ITERATIONS) {
  const salt = randomBytes(16);
  const bits = await pbkdf2Bits(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToB64url(salt)}$${bytesToB64url(bits)}`;
}

export function parsePasswordHash(record, { testKdf = false } = {}) {
  if (!record || typeof record.username !== 'string' || typeof record.passwordHash !== 'string') return null;
  const username = record.username.trim();
  if (!/^[A-Za-z0-9._@-]{1,64}$/.test(username)) return null;
  const match = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(record.passwordHash);
  if (!match) return null;
  const iterations = Number(match[1]);
  const declared = Number(record.iterations);
  if (!Number.isInteger(iterations) || iterations !== declared) return null;
  const min = testKdf ? TEST_MIN_ITERATIONS : MIN_ITERATIONS;
  if (iterations < min || iterations > 2000000) return null;
  let salt;
  let hash;
  try {
    salt = b64urlToBytes(match[2]);
    hash = b64urlToBytes(match[3]);
  } catch {
    return null;
  }
  if (salt.length < 16 || hash.length !== 32) return null;
  return { username, iterations, salt, hash };
}

export async function passwordMatches(password, user) {
  const derived = await pbkdf2Bits(password, user.salt, user.iterations);
  return timingSafeEqual(derived, user.hash);
}

export async function hmacB64url(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    text.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, text.encode(message));
  return bytesToB64url(new Uint8Array(sig));
}

export function canonicalManifest(body) {
  const files = {};
  const names = Object.keys(body.files || {}).sort();
  for (const name of names) {
    const entry = body.files[name];
    files[name] = { sha256: entry.sha256, bytes: entry.bytes };
  }
  return JSON.stringify({ packageId: body.packageId, zipSha256: body.zipSha256, files });
}

export async function sealManifest(body, sealKey) {
  const canon = canonicalManifest(body);
  return { ...JSON.parse(canon), seal: await hmacB64url(sealKey, canon) };
}

export async function manifestSealOk(parsed, sealKey) {
  if (!parsed || typeof parsed !== 'object') return false;
  const keys = Object.keys(parsed).sort();
  if (keys.join() !== 'files,packageId,seal,zipSha256') return false;
  if (typeof parsed.seal !== 'string' || typeof parsed.packageId !== 'string') return false;
  if (!/^[a-f0-9]{64}$/.test(parsed.zipSha256 || '')) return false;
  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) return false;
  for (const [name, entry] of Object.entries(parsed.files)) {
    if (!isSafePackagePath(name)) return false;
    if (!entry || typeof entry !== 'object') return false;
    const entryKeys = Object.keys(entry).sort().join();
    if (entryKeys !== 'bytes,sha256') return false;
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 || '')) return false;
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 25 * 1024 * 1024) return false;
  }
  const canon = canonicalManifest(parsed);
  const expected = await hmacB64url(sealKey, canon);
  return timingSafeEqual(expected, parsed.seal);
}

export function isSafePackagePath(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 240) return false;
  if (name.includes('\0') || name.includes('\\') || name.startsWith('/')) return false;
  const parts = name.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return false;
  return !isServiceWorkerName(parts[parts.length - 1]);
}

export function isServiceWorkerName(name) {
  return /^(sw|service-worker|serviceworker)\.js$/i.test(name);
}

export async function signSession(secret, payload) {
  const body = bytesToB64url(text.encode(JSON.stringify(payload)));
  const sig = await hmacB64url(secret, body);
  return `${body}.${sig}`;
}

export async function readSession(secret, token) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacB64url(secret, body);
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (!json || typeof json.u !== 'string' || typeof json.sid !== 'string' || typeof json.exp !== 'number') return null;
    return json;
  } catch {
    return null;
  }
}
