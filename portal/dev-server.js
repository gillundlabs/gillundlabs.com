/* Local preview only. Binds to loopback. It does not publish the site.
   A password check runs only when the same environment the edge expects is present. */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './handle.js';
import { createLimiter, memoryStore } from './limit.js';
import { loadPortalConfig } from './config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = loadPortalConfig(process.env);
const limiter = createLimiter(memoryStore(), {
  windowMs: config.windowMs || 15 * 60 * 1000,
  userLimit: config.userLimit || 8,
  ipLimit: config.ipLimit || 30,
});

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function localFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '127.0.0.1';
  const requestUrl = `http://${host}${req.url || '/'}`;
  const url = new URL(requestUrl);
  if (url.pathname === config.base || url.pathname.startsWith(`${config.base}/`)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const response = await handle(new Request(requestUrl, { method: req.method, headers, body: body.length ? body : undefined }), {
      env: process.env,
      limiter,
      bucket: null,
      getIp: () => 'local',
    });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key === 'set-cookie') return;
      res.setHeader(key, value);
    });
    const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (cookies.length) res.setHeader('set-cookie', cookies);
    const bytes = Buffer.from(await response.arrayBuffer());
    res.end(bytes);
    return;
  }
  let file = localFile(url.pathname);
  if (!file) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) file = path.join(file, 'index.html');
    const ext = path.extname(file).toLowerCase();
    res.setHeader('content-type', types[ext] || 'application/octet-stream');
    res.setHeader('x-content-type-options', 'nosniff');
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => {
  const mode = config.authReady ? 'password check configured' : 'closed, no password form';
  console.log(`Testing bench preview at http://127.0.0.1:${port}${config.base}/ (${mode}).`);
});
