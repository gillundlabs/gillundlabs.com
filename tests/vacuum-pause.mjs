/* Desktop Space pauses and unpauses Vacuum Maze the same way P does.
   Space in a text field or on a focused button is left alone. Phones are unchanged.
   Run: node tests/vacuum-pause.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT = 9374;
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-pause-test', 'about:blank',
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
    if (msg.method === 'Runtime.exceptionThrown') fail('page exception ' + (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || '').slice(0, 240));
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');

  async function boot(w, h, mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Page.navigate', { url: BASE + '/play/vacuum-maze/' });
    for (let i = 0; i < 50; i++) {
      if (await ev('!!document.getElementById("b-begin") && document.readyState === "complete"')) break;
      await sleep(120);
    }
  }
  async function beginRun() {
    await ev(`document.getElementById('b-begin').click(); true`);
    for (let i = 0; i < 30; i++) {
      if (await ev(`!!document.querySelector('#level-list button[data-lv="0"]')`)) break;
      await sleep(80);
    }
    await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
    await sleep(100);
  }
  async function key(code, keyName, vk) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(40);
  }
  const playState = () => ev(`({
    playing: document.body.classList.contains('playing'),
    pause: document.getElementById('p-pause').classList.contains('show'),
    notebook: document.getElementById('p-notebook').classList.contains('show'),
    touch: 'ontouchstart' in window,
    help: document.querySelector('#p-pause .sub').textContent,
  })`);

  await boot(1280, 800, false);
  const desk = await ev(`'ontouchstart' in window`);
  console.log('desktop ontouchstart', desk);
  if (desk) fail('desktop Chrome reports ontouchstart, so the computer check would treat it as a phone');

  await beginRun();
  let st = await playState();
  console.log('started', JSON.stringify(st));
  if (!st.playing || st.pause) fail('level did not start playing ' + JSON.stringify(st));
  if (!/Space/.test(st.help) || !/computer/.test(st.help) || !/P or Esc/.test(st.help)) fail('pause help does not mention desktop Space: ' + st.help);

  await ev(`(() => {
    window.__space = null;
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') window.__space = { prevented: e.defaultPrevented }; });
    document.documentElement.style.overflow = 'auto';
    document.body.style.position = 'absolute';
    document.body.style.height = '5000px';
    window.scrollTo(0, 240);
    return window.scrollY;
  })()`);
  const before = await ev('window.scrollY');
  await key('Space', ' ', 32);
  const afterSpace = await ev(`({ scroll: window.scrollY, before: ${before}, prevented: window.__space && window.__space.prevented, playing: document.body.classList.contains('playing'), pause: document.getElementById('p-pause').classList.contains('show') })`);
  console.log('space pause', JSON.stringify(afterSpace));
  if (afterSpace.playing || !afterSpace.pause) fail('desktop Space did not pause ' + JSON.stringify(afterSpace));
  if (!afterSpace.prevented) fail('Space did not preventDefault while pausing');
  if (Math.abs(afterSpace.scroll - afterSpace.before) > 1) fail('Space scrolled the page while pausing ' + afterSpace.before + ' -> ' + afterSpace.scroll);

  await key('Space', ' ', 32);
  st = await playState();
  console.log('space resume', JSON.stringify(st));
  if (!st.playing || st.pause) fail('desktop Space did not unpause ' + JSON.stringify(st));

  await ev(`(() => {
    const field = document.createElement('input');
    field.id = 'space-field';
    field.value = 'atom';
    document.body.appendChild(field);
    field.focus();
    window.__fieldSpace = null;
    window.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'space-field') window.__fieldSpace = { prevented: e.defaultPrevented }; });
    return document.activeElement.id;
  })()`);
  await key('Space', ' ', 32);
  const typed = await ev(`({ value: document.getElementById('space-field').value, active: document.activeElement && document.activeElement.id, prevented: window.__fieldSpace && window.__fieldSpace.prevented, playing: document.body.classList.contains('playing'), pause: document.getElementById('p-pause').classList.contains('show') })`);
  console.log('field', JSON.stringify(typed));
  if (!typed.playing || typed.pause) fail('Space in a text field toggled pause ' + JSON.stringify(typed));
  if (typed.active !== 'space-field') fail('text field was not focused ' + JSON.stringify(typed));
  if (typed.prevented !== false) fail('Space in a text field was preventDefaulted ' + JSON.stringify(typed));
  await ev(`document.getElementById('space-field').remove(); document.body.focus(); true`);

  await key('KeyP', 'p', 80);
  st = await playState();
  if (st.playing || !st.pause) fail('P did not pause ' + JSON.stringify(st));
  await key('Escape', 'Escape', 27);
  st = await playState();
  if (!st.playing || st.pause) fail('Escape did not unpause ' + JSON.stringify(st));
  await key('KeyP', 'p', 80);
  await key('KeyP', 'p', 80);
  st = await playState();
  console.log('p escape', JSON.stringify(st));
  if (!st.playing || st.pause) fail('P did not unpause ' + JSON.stringify(st));

  await ev(`document.getElementById('b-notebook').click(); true`);
  await sleep(60);
  await key('Space', ' ', 32);
  await key('KeyP', 'p', 80);
  st = await playState();
  console.log('notebook', JSON.stringify(st));
  if (!st.notebook) fail('notebook did not open');
  if (st.pause) fail('Space or P paused underneath the notebook ' + JSON.stringify(st));
  await ev(`document.getElementById('b-nb-back').click(); true`);
  await sleep(40);
  await beginRun();

  await ev(`document.getElementById('b-pausebtn').focus(); true`);
  await key('Space', ' ', 32);
  await sleep(30);
  st = await playState();
  console.log('button', JSON.stringify(st));
  if (st.playing || !st.pause) fail('Space on the focused pause button did not activate it ' + JSON.stringify(st));
  await ev(`document.body.focus(); true`);
  await key('Escape', 'Escape', 27);
  st = await playState();
  if (!st.playing || st.pause) fail('Escape did not resume after the button ' + JSON.stringify(st));

  await boot(390, 844, true);
  const phoneTouch = await ev(`'ontouchstart' in window`);
  console.log('phone ontouchstart', phoneTouch);
  if (!phoneTouch) fail('phone emulation did not enable ontouchstart');
  await beginRun();
  await key('Space', ' ', 32);
  st = await playState();
  console.log('phone space', JSON.stringify(st));
  if (!st.playing || st.pause) fail('Space paused on a phone ' + JSON.stringify(st));
  await key('KeyP', 'p', 80);
  st = await playState();
  if (st.playing || !st.pause) fail('P did not pause on a phone ' + JSON.stringify(st));
  await key('Escape', 'Escape', 27);
  st = await playState();
  if (!st.playing || st.pause) fail('Escape did not unpause on a phone ' + JSON.stringify(st));
} catch (err) {
  fail(err && err.stack ? err.stack.split('\n')[0] : String(err));
} finally {
  if (ws) ws.close();
  chrome.kill();
}

if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
