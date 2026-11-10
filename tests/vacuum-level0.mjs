/* Vacuum Maze Level 0: first Begin, skip, replay, and a real extraction that writes nothing.
   Run: node tests/vacuum-level0.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT = 9378;
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-level0-test', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {}
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
    setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error('timeout ' + method)); } }, 8000);
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');

  async function boot() {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: BASE + '/play/vacuum-maze/' });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
      await sleep(120);
    }
    await ev(`localStorage.removeItem('vacuum-maze.v2'); true`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
      await sleep(120);
    }
  }
  const snap = () => ev(`(() => {
    const s = JSON.parse(localStorage.getItem('vacuum-maze.v2') || 'null');
    return {
      playing: document.body.classList.contains('playing'),
      lesson: !!(document.getElementById('level0-hud') && document.getElementById('level0-hud').classList.contains('show')),
      line: (document.querySelector('#level0-plaque .vls-plaque__label') || {}).textContent || '',
      levels: document.getElementById('p-levels').classList.contains('show'),
      win: document.getElementById('p-win').classList.contains('show'),
      winTitle: document.getElementById('win-title').textContent,
      winNote: document.getElementById('win-note').textContent,
      titleNote: !document.getElementById('title-level0').hidden,
      seen: !!(s && s.tutorialSeen),
      coins: s ? s.coins : 0,
      best: s ? Object.keys(s.best || {}) : [],
      cleared: s ? Object.keys(s.cleared || {}) : [],
      notebook: s ? Object.keys(s.notebook || {}) : [],
      pumps: s ? Object.keys(s.pumpsSeen || {}) : [],
    };
  })()`);
  async function hold(code, key, vk, ms) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(ms);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }

  await boot();
  const fresh = await snap();
  console.log('fresh', JSON.stringify(fresh));
  if (!fresh.titleNote) fail('title does not offer Level 0 to a new player');
  await ev(`document.getElementById('b-begin').click(); true`);
  await sleep(300);
  let st = await snap();
  console.log('begin', JSON.stringify(st));
  if (!st.playing || !st.lesson) fail('first Begin did not enter Level 0 ' + JSON.stringify(st));
  if (!/Space pauses/.test(st.line)) fail('desktop Level 0 line omitted Space ' + st.line);
  if (st.seen || st.coins || st.best.length || st.cleared.length || st.notebook.length || st.pumps.length) fail('Level 0 wrote progress on entry ' + JSON.stringify(st));

  await ev(`document.getElementById('b-skip-level0').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('skip', JSON.stringify(st));
  if (!st.levels || st.lesson || st.playing) fail('skip did not return to the level list ' + JSON.stringify(st));
  if (!st.seen) fail('skip did not remember that Level 0 was seen');
  if (st.coins || st.best.length || st.cleared.length || st.notebook.length || st.pumps.length) fail('skip wrote coins, records, or unlocks ' + JSON.stringify(st));

  await ev(`document.getElementById('b-begin').click(); true`);
  await sleep(200);
  st = await snap();
  if (st.playing || st.lesson || !st.levels) fail('a later Begin returned to Level 0 ' + JSON.stringify(st));

  await ev(`document.getElementById('b-replay-level0').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('replay', JSON.stringify(st));
  if (!st.playing || !st.lesson) fail('Level 0 could not be replayed ' + JSON.stringify(st));

  await hold('ArrowRight', 'ArrowRight', 39, 2500);
  await hold('ArrowDown', 'ArrowDown', 40, 2500);
  let won = null;
  for (let i = 0; i < 40; i++) {
    won = await snap();
    if (won.win) break;
    await hold('ArrowRight', 'ArrowRight', 39, 400);
    await hold('ArrowDown', 'ArrowDown', 40, 400);
  }
  console.log('done', JSON.stringify(won));
  if (!won.win || won.winTitle !== 'Level 0 complete') fail('Level 0 did not complete ' + JSON.stringify(won));
  if (!/wrote nothing/.test(won.winNote)) fail('completion note does not say nothing was written ' + won.winNote);
  if (won.coins || won.best.length || won.cleared.length || won.notebook.length || won.pumps.length) fail('completion wrote coins, records, or unlocks ' + JSON.stringify(won));
  if (!won.seen) fail('completion did not mark Level 0 seen');
} catch (err) {
  fail(err && err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : String(err));
} finally {
  if (ws) ws.close();
  chrome.kill();
}
if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
