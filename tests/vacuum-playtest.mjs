/* Playtest fixes: the goal toast is not replaced by a notebook toast, the trial clock
   uses wall time under a low frame rate, drag distance for 90° is capped, and an arrow
   tap kicks the tilt by 8°.
   Run: node tests/vacuum-playtest.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT = 9396;
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-playtest', 'about:blank',
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
    if (msg.method === 'Runtime.exceptionThrown') fail('page exception ' + ((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) || '').slice(0, 240));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id; pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
    setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error('timeout ' + method)); } }, 15000);
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/play/vacuum-maze/?dev=1' });
  for (let i = 0; i < 50; i++) {
    if (await ev(`!!window.VMPlaytest && !!window.VMStartLevel`)) break;
    await sleep(80);
  }
  if (!await ev(`!!window.VMPlaytest`)) fail('playtest hooks missing');

  await ev(`window.VMPlaytest.toast.clear(); true`);
  const queued = await ev(`window.VMPlaytest.toast.push('Steer the atom into the rotary pump')`);
  const held = await ev(`window.VMPlaytest.toast.push('New notebook entry: Walls')`);
  console.log('toast queued', JSON.stringify(held));
  if (!queued || queued.text !== 'Steer the atom into the rotary pump' || queued.q.length) fail('goal toast did not show ' + JSON.stringify(queued));
  if (!held || held.text !== 'Steer the atom into the rotary pump' || held.q.length !== 1) fail('notebook toast replaced the goal ' + JSON.stringify(held));
  const next = await ev(`window.VMPlaytest.toast.advance(3.5)`);
  console.log('toast next', JSON.stringify(next));
  if (!next || next.text !== 'New notebook entry: Walls' || next.q.length) fail('notebook toast did not follow the goal ' + JSON.stringify(next));

  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await ev(`window.dispatchEvent(new Event('resize')); true`);
  await sleep(40);
  const big = await ev(`window.VMPlaytest.dragR()`);
  console.log('dragR 1600x1000', big);
  if (!(big <= 260)) fail('dragR was not capped at 260 on a large screen ' + big);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await ev(`window.dispatchEvent(new Event('resize')); true`);
  await sleep(40);
  const phone = await ev(`window.VMPlaytest.dragR()`);
  console.log('dragR 390x844', phone);
  if (!(phone >= 160 && phone <= 260)) fail('phone dragR left the old range ' + phone);

  if (!await ev(`window.VMStartLevel(1)`)) fail('level did not start');
  const opened = await ev(`window.VMPlaytest.toast.read()`);
  console.log('level toast', JSON.stringify(opened));
  if (!opened || !/Steer the atom/.test(opened.text)) fail('level start did not lead with the goal ' + JSON.stringify(opened));
  if (/New notebook entry/.test(opened.text)) fail('a notebook toast replaced the goal at level start ' + JSON.stringify(opened));
  if (!opened.q.some((t) => /Temperature is the atom/.test(t))) fail('the temperature note was not queued behind the goal ' + JSON.stringify(opened));
  if (opened.q.length && !/Temperature is the atom/.test(opened.q[0])) fail('a notebook toast jumped ahead of the goal ' + JSON.stringify(opened));
  const kicks = await ev(`(() => {
    window.VMPlaytest.release('ArrowRight');
    const first = window.VMPlaytest.kick('ArrowRight');
    const repeat = window.VMPlaytest.kick('ArrowRight');
    window.VMPlaytest.release('ArrowRight');
    const again = window.VMPlaytest.kick('ArrowRight');
    return { first, repeat, again };
  })()`);
  console.log('kick', JSON.stringify(kicks));
  if (!kicks || Math.abs(kicks.first.ax - 8) > 0.01) fail('arrow tap did not kick 8 deg ' + JSON.stringify(kicks));
  if (Math.abs(kicks.repeat.ax - 8) > 0.01) fail('a held arrow kicked again ' + JSON.stringify(kicks));
  if (Math.abs(kicks.again.ax - 16) > 0.01) fail('a second tap did not add another 8 deg ' + JSON.stringify(kicks));

  const slow = await ev(`window.VMPlaytest.trialStep(1)`);
  console.log('trial 1s frame', JSON.stringify(slow));
  if (!slow || Math.abs(slow.delta - 250) > 0.5) fail('a 1 s frame advanced the trial by ' + (slow && slow.delta) + ' ms, not 250');
  const fast = await ev(`window.VMPlaytest.trialStep(0.02)`);
  console.log('trial 20ms frame', JSON.stringify(fast));
  if (!fast || Math.abs(fast.delta - 20) > 0.5) fail('a 20 ms frame advanced the trial by ' + (fast && fast.delta) + ' ms');

  const gapOf = (a, b) => {
    if (!a || !b) return 99;
    const xOver = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    const yOver = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (xOver > 0 && yOver > 0) return -Math.min(xOver, yOver);
    if (xOver > 0) return Math.max(a.t, b.t) - Math.min(a.b, b.b);
    if (yOver > 0) return Math.max(a.l, b.l) - Math.min(a.r, b.r);
    return Math.hypot(Math.max(a.l, b.l) - Math.min(a.r, b.r), Math.max(a.t, b.t) - Math.min(a.b, b.b));
  };
  const readLayout = `(() => {
    const hud = window.VMHudInk || {};
    const hintEl = document.getElementById('rotate-hint');
    const cs = hintEl ? getComputedStyle(hintEl) : null;
    const r = hintEl ? hintEl.getBoundingClientRect() : null;
    let hint = null;
    if (cs && cs.display !== 'none' && cs.visibility !== 'hidden' && r && r.width > 2 && r.height > 2) {
      hint = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      if (r.left <= 1 && r.right >= innerWidth - 1) {
        const node = [...hintEl.childNodes].find((n) => n.nodeType === 3) || hintEl;
        const range = document.createRange();
        range.selectNodeContents(node);
        const ink = range.getBoundingClientRect();
        if (ink.width > 2) hint = { l: ink.left, t: ink.top, r: ink.right, b: ink.bottom };
      }
    }
    return {
      parElided: !!hud.parElided,
      parLines: hud.parLines || [],
      goalElided: !!hud.goalElided,
      goalLines: hud.goalLines || [],
      goal: hud.goal || null,
      toast: hud.toast || null,
      map: hud.map || null,
      hint,
    };
  })()`;
  async function show(theme, w, h) {
    const portrait = h >= w;
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 900,
      screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
    });
    await ev(`document.getElementById('s-map').checked = true; document.getElementById('s-theme').value = ${JSON.stringify(theme)}; document.getElementById('s-theme').dispatchEvent(new Event('input', { bubbles: true })); window.dispatchEvent(new Event('resize')); true`);
    if (!await ev(`window.VMStartLevel(1)`)) fail(theme + ' ' + w + 'x' + h + ' did not start');
    await sleep(60);
    return ev(readLayout);
  }
  for (const theme of ['victorian', 'bw']) {
    const par = await show(theme, 320, 568);
    const text = (par.parLines || []).join(' ');
    console.log('par', theme, JSON.stringify(text), 'elided', par.parElided);
    if (!text || par.parLines.length !== 1 || par.parElided || /…|\.\.\./.test(text) || !/Earth/.test(text)) fail(theme + ' 320 par line ' + text);
    if (par.goal && par.toast && gapOf(par.goal, par.toast) < 0) fail(theme + ' 320 goal chip intersects the toast');
  }
  const phones = [[320, 568], [568, 320], [360, 640], [640, 360], [375, 667], [667, 375], [390, 844], [844, 390], [414, 896], [896, 414], [430, 932], [932, 430], [1280, 800], [820, 1180]];
  for (const theme of ['victorian', 'bw']) {
    for (const [w, h] of phones) {
      const lay = await show(theme, w, h);
      if (lay.hint && lay.map) {
        const g = gapOf(lay.hint, lay.map);
        if (g < 3) fail(theme + ' ' + w + 'x' + h + ' rotate hint vs minimap ' + g.toFixed(1));
      } else if (h > w && !lay.hint) fail(theme + ' ' + w + 'x' + h + ' rotate hint missing');
      if (lay.toast && lay.goal) fail(theme + ' ' + w + 'x' + h + ' goal chip visible during a toast');
      if (h < 480 && lay.goal) fail(theme + ' ' + w + 'x' + h + ' goal chip shown below 480');
    }
  }
  async function settled(theme, w, h, levelId) {
    const portrait = h >= w;
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 900,
      screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
    });
    await ev(`document.getElementById('s-map').checked = true; document.getElementById('s-theme').value = ${JSON.stringify(theme)}; document.getElementById('s-theme').dispatchEvent(new Event('input', { bubbles: true })); window.dispatchEvent(new Event('resize')); true`);
    if (!await ev(`window.VMStartLevel(${levelId})`)) fail(theme + ' L' + levelId + ' ' + w + 'x' + h + ' did not start');
    await ev(`window.VMPlaytest.toast.clear(); new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))`);
    return ev(`(() => {
      const hud = window.VMHudInk || {};
      return {
        goal: hud.goal || null, map: hud.map || null, labels: window.VMStageLabels(),
        parElided: !!hud.parElided, parLines: hud.parLines || [],
        goalElided: !!hud.goalElided, goalLines: hud.goalLines || [],
      };
    })()`);
  }
  function plateClear(where, lay) {
    const par = (lay.parLines || []).join(' ');
    const goal = (lay.goalLines || []).join(' ');
    if (!par || (lay.parLines || []).length !== 1 || lay.parElided || /…|\.\.\./.test(par)) fail(where + ' par ellipsis ' + par);
    if (lay.goal && (!goal || lay.goalElided || /…|\.\.\./.test(goal))) fail(where + ' goal ellipsis ' + goal);
  }
  function goalClear(where, lay) {
    if (!lay.goal) return;
    const boxes = [...(lay.labels || []), lay.map].filter(Boolean);
    for (const box of boxes) {
      const g = gapOf(lay.goal, box);
      if (g < 3) fail(where + ' goal ' + g.toFixed(1) + ' from ' + (box.text || 'minimap'));
    }
  }
  for (const theme of ['victorian', 'bw']) {
    for (const id of [1, 4]) {
      const lay = await settled(theme, 568, 320, id);
      console.log('goal short', theme, 'L' + id, lay.goal ? 'shown' : 'hidden', 'labels', (lay.labels || []).length);
      if (lay.goal) fail(theme + ' 568x320 L' + id + ' goal chip shown below 480');
      plateClear(theme + ' 568x320 L' + id, lay);
    }
    for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) {
      const lay = await settled(theme, w, h, 1);
      console.log('goal tall', theme, w + 'x' + h, lay.goal ? 'shown' : 'hidden');
      if (!lay.goal) fail(theme + ' ' + w + 'x' + h + ' goal chip hidden');
      plateClear(theme + ' ' + w + 'x' + h, lay);
      goalClear(theme + ' ' + w + 'x' + h, lay);
    }
    for (const [w, h] of [[390, 844], [430, 932]]) {
      for (const id of [1, 2, 3, 4]) {
        const first = await settled(theme, w, h, id);
        const frames = [first];
        await ev(`window.VMPlaytest.release('ArrowRight'); window.VMPlaytest.release('ArrowDown'); window.VMPlaytest.kick('ArrowRight'); window.VMPlaytest.kick('ArrowDown'); true`);
        for (let i = 0; i < 8; i++) {
          await sleep(250);
          frames.push(await ev(`(() => { const hud = window.VMHudInk || {}; return { goal: hud.goal || null, map: hud.map || null, labels: window.VMStageLabels() }; })()`));
        }
        await ev(`window.VMPlaytest.release('ArrowRight'); window.VMPlaytest.release('ArrowDown'); true`);
        console.log('goal move', theme, 'L' + id, w + 'x' + h, frames.map((f) => (f.goal ? 'Y' : 'n')).join(''));
        frames.forEach((lay, i) => goalClear(theme + ' ' + w + 'x' + h + ' L' + id + ' t' + i, lay));
      }
    }
  }
} catch (err) {
  fail(err && err.stack ? err.stack.split('\n').slice(0, 4).join(' ') : String(err));
} finally {
  if (ws) ws.close();
  chrome.kill();
}

if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
