/* Lock-screen trial and Escape during a lesson.
   Try it free must start the locked mode and its tutorial.
   Escape closes Settings, then pause, and skips only when no panel is open.
   Run: node tests/maxwell-tutorial-browser.mjs [port]
   Screenshots go to /tmp/maxwell-hold-shots, not the repo. */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { stat } from 'node:fs/promises';

const PORT = Number(process.argv[2] || 8773);
const CDP = 9357;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = '/tmp/maxwell-hold-shots';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
  if (path.endsWith('/')) path += 'index.html';
  let file = join(ROOT, path === '' ? 'index.html' : path);
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = join(file, 'index.html');
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('missing');
  }
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
await mkdir(OUT, { recursive: true });

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/gl-chrome-tut-hold', 'about:blank',
], { stdio: 'ignore' });

const failures = [];
const fail = (m) => { failures.push(m); console.error('FAIL', m); };
let ws;
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!target) await sleep(120);
  }
  if (!target) throw new Error('Chrome did not start');
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
  await send('Runtime.enable');
  await send('Page.enable');
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  };
  const fresh = {
    settings: { theme: 'victorian', tempScale2: true, wallHeat: 'preset' },
    coins: 0, unlockedZ: 1, best: {}, tutorials: { single: false, two: false, sort: false },
  };
  let preload = null;
  async function boot(view) {
    await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: view.w < 700 });
    if (preload) { try { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload }); } catch {} }
    const added = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('maxwells-demon.access');localStorage.setItem('maxwells-demon.v2', ${JSON.stringify(JSON.stringify(fresh))});}catch(e){}`,
    });
    preload = added.identifier;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/play/maxwells-demon/?hold=${view.name}` });
    for (let i = 0; i < 50; i++) {
      if (await evalJs('!!(window.MDGameLive && document.getElementById("b-begin"))')) return;
      await sleep(100);
    }
    throw new Error('game did not start');
  }
  const pressEscape = () => evalJs("document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); true");
  const lesson = () => evalJs(`(() => {
    const t = window.MDGameLive.tutorial();
    const skip = document.getElementById('b-skip-tutorial');
    const msg = document.getElementById('instrument-message');
    const box = skip.getBoundingClientRect();
    return Object.assign({}, t, {
      settings: document.getElementById('p-settings').classList.contains('show'),
      pause: document.getElementById('p-pause').classList.contains('show'),
      locked: document.getElementById('p-locked').classList.contains('show'),
      anyPanel: !!document.querySelector('.panel.show'),
      skipText: skip.textContent,
      msgHidden: msg.hidden,
      skipBox: box.height,
    });
  })()`);

  const views = [{ name: 'desktop', w: 1280, h: 900 }, { name: 'phone', w: 390, h: 844 }];
  for (const view of views) {
    for (const mode of ['two', 'sort']) {
      await boot(view);
      await evalJs("document.getElementById('b-begin').click(); true");
      await sleep(150);
      await evalJs(`document.getElementById(${JSON.stringify(mode === 'two' ? 'b-two' : 'b-sort')}).click(); true`);
      await sleep(250);
      const locked = await lesson();
      if (!locked.locked) fail(`${view.name} ${mode} did not open the lock screen`);
      const trialHidden = await evalJs("document.getElementById('lk-trial').hidden");
      if (trialHidden) fail(`${view.name} ${mode} hid Try it free`);
      await evalJs("document.getElementById('lk-trial').click(); true");
      let live = null;
      for (let i = 0; i < 30; i++) {
        live = await lesson();
        if (live.active && live.playMode === mode && !live.skipHidden && live.coach) break;
        await sleep(100);
      }
      const expect = mode === 'two' ? /pong/i : /trapdoor/i;
      if (live.playMode !== mode) fail(`${view.name} ${mode} Try it free left mode ${live.playMode}`);
      if (!live.active) fail(`${view.name} ${mode} Try it free did not start the tutorial`);
      if (!expect.test(live.coach || '')) fail(`${view.name} ${mode} coach was ${JSON.stringify(live.coach)}`);
      if (live.skipHidden || live.msgHidden || !(live.skipBox > 20) || live.skipText !== 'Skip') fail(`${view.name} ${mode} Skip was not on the lesson`);
      if (live.seen && live.seen[mode]) fail(`${view.name} ${mode} marked the tutorial seen before it was skipped`);
      if (live.anyPanel) fail(`${view.name} ${mode} left a panel over the lesson`);
      await shot(`${view.name}-trial-${mode}-skip`);
      console.log('trial', view.name, mode, live.playMode, live.coach);
      if (mode === 'two') {
        await evalJs("document.getElementById('b-pausebtn').click(); true");
        await sleep(100);
        await evalJs("document.getElementById('b-pause-settings').click(); true");
        await sleep(100);
        let mid = await lesson();
        if (!mid.settings || !mid.active || mid.seen.two) fail(`${view.name} settings did not open over the lesson`);
        await pressEscape();
        await sleep(100);
        mid = await lesson();
        if (mid.settings || !mid.pause || !mid.active || mid.screen !== 'paused' || mid.seen.two) fail(`${view.name} Escape from Settings skipped or left Settings open: ${JSON.stringify({ settings: mid.settings, pause: mid.pause, active: mid.active, screen: mid.screen, seen: mid.seen.two })}`);
        await shot(`${view.name}-escape-settings-to-pause`);
        await pressEscape();
        await sleep(150);
        mid = await lesson();
        if (mid.anyPanel || mid.screen !== 'playing' || !mid.active || mid.skipHidden || !/pong/i.test(mid.coach) || mid.seen.two) fail(`${view.name} Escape from pause skipped the lesson: ${JSON.stringify({ panel: mid.anyPanel, screen: mid.screen, active: mid.active, skip: mid.skipHidden, coach: mid.coach, seen: mid.seen.two })}`);
        await shot(`${view.name}-escape-resume-still-tutorial`);
        await pressEscape();
        await sleep(150);
        mid = await lesson();
        if (mid.active || !mid.skipHidden || mid.coach || mid.screen !== 'playing' || !mid.seen.two || mid.playMode !== 'two') fail(`${view.name} Escape with no panel did not skip cleanly: ${JSON.stringify({ active: mid.active, skip: mid.skipHidden, coach: mid.coach, screen: mid.screen, seen: mid.seen.two, mode: mid.playMode })}`);
        await shot(`${view.name}-escape-skip`);
        console.log('escape', view.name, 'ok');
      }
    }
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  await new Promise((resolve) => server.close(resolve));
}
if (failures.length) {
  console.error(failures.map((f) => 'FAIL ' + f).join('\n'));
  process.exit(1);
}
console.log('tutorial browser ok');
