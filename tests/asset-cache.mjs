/* Returning visitor: GitHub Pages sends Cache-Control: max-age=600 and the
   button fix lives in stable asset URLs. A revalidated HTML document must not
   reuse a cached pre-deploy site.css / plaque-boot.js.
   Run: node tests/asset-cache.mjs */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8777;
const CDP = 9346;
/* Marker sheets, not the full kit: this test is the cache key, not the paint. */
const OLD_CSS = '.btn.ghost{background-color:rgb(241,236,223) !important}';
const NEW_CSS = '.btn.ghost{background-color:rgb(184,130,40) !important}';
const OLD_JS = "document.querySelectorAll('.btn.ghost').forEach(function(el){el.setAttribute('data-cache-stamp','old')})";
const NEW_JS = "document.querySelectorAll('.btn.ghost').forEach(function(el){el.setAttribute('data-cache-stamp','new')})";

let htmlVersioned = false;
let assetsNew = false;
const hits = [];

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  hits.push(url.pathname + url.search);
  const versioned = url.search.includes('v=24fe294');
  if (url.pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'max-age=0');
    const css = htmlVersioned ? 'assets/site.css?v=24fe294' : 'assets/site.css';
    const js = htmlVersioned ? 'assets/plaque-boot.js?v=24fe294' : 'assets/plaque-boot.js';
    res.end(`<!doctype html><link rel="stylesheet" href="${css}"><body>
<p class="row"><a class="btn" href="#play">Play</a><a class="btn ghost" href="#d">Details</a></p>
<script src="${js}" defer></script></body>`);
    return;
  }
  if (url.pathname === '/assets/site.css') {
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'max-age=600');
    res.end((assetsNew || versioned) ? NEW_CSS : OLD_CSS);
    return;
  }
  if (url.pathname === '/assets/plaque-boot.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.setHeader('Cache-Control', 'max-age=600');
    res.end((assetsNew || versioned) ? NEW_JS : OLD_JS);
    return;
  }
  res.statusCode = 404;
  res.end('missing');
});

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

function assertFrozenUnchanged() {
  const frozen = [
    'notebook/maxwells-demon/index.html',
    'notebook/vacuum-maze/index.html',
    'notebook/fantastic-apparatus/index.html',
    'play/maxwells-demon/index.html',
  ];
  for (const rel of frozen) {
    const text = readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
    if (text.includes('v=24fe294') || text.includes('v=20261107c')) throw new Error(rel + ' was cache-busted; frozen HTML must stay immutable');
  }
  const owned = ['index.html', 'about/index.html', 'notebook/index.html', '404.html',
    'games/maxwells-demon/index.html', 'games/vacuum-maze/index.html', 'games/fantastic-apparatus/index.html'];
  for (const rel of owned) {
    const text = readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
    if (!text.includes('site.css?v=20261107c') || !text.includes('plaque-boot.js?v=24fe294')) {
      throw new Error(rel + ' is missing the current asset version');
    }
  }
}
assertFrozenUnchanged();

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/gl-chrome-cachebust',
  '--disk-cache-size=67108864', 'about:blank',
], { stdio: 'ignore' });

let ws;
const fail = [];
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(100);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id; pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: false });

  async function load() {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 30; i++) {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r.result.value === 'complete') break;
      await sleep(40);
    }
    await sleep(250);
    const ev = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const el = document.querySelector('.btn.ghost');
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, stamp: el.getAttribute('data-cache-stamp'), href: document.querySelector('link[rel=stylesheet]').href };
      })()`,
    });
    return ev.result.value;
  }

  const first = await load();
  if (first.bg !== 'rgb(241, 236, 223)' || first.stamp !== 'old') fail.push('initial visit did not get the pre-deploy assets: ' + JSON.stringify(first));
  assetsNew = true;
  const stale = await load();
  if (stale.stamp !== 'old' || stale.bg !== 'rgb(241, 236, 223)') fail.push('returning visit ignored max-age and refetched the stable URL: ' + JSON.stringify(stale));
  htmlVersioned = true;
  const fresh = await load();
  if (fresh.stamp !== 'new' || fresh.bg !== 'rgb(184, 130, 40)') fail.push('versioned URL still used the cached assets: ' + JSON.stringify(fresh));
  if (!fresh.href.includes('v=24fe294')) fail.push('stylesheet href was not versioned: ' + fresh.href);
  console.log('initial', JSON.stringify(first));
  console.log('returning-same-url', JSON.stringify(stale));
  console.log('returning-versioned', JSON.stringify(fresh));
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  server.close();
}

if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log('PASS');
