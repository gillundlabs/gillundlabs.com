/* Goal-chip clearance across every level that draws it.
   Ink must stay 3 px from every visible world label and the minimap, or the chip stays hidden.
   Both themes, at each viewport where the chip is drawn, sampled through a short tilt.
   Run: node tests/vacuum-goal-chip-sweep.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT0 = +(process.argv[3] || 9440);
const VIEWS = [[360, 740], [390, 844], [430, 932], [820, 1180], [1180, 820], [768, 1024], [1280, 800], [1920, 1080]];
const THEMES = ['victorian', 'bw'];
const WORKERS = 4;
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

function sampleSource(from, to) {
  return `(() => {
  const gap = (a, b) => {
    const xOver = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    const yOver = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (xOver > 0 && yOver > 0) return -Math.min(xOver, yOver);
    if (xOver > 0) return Math.max(a.t, b.t) - Math.min(a.b, b.b);
    if (yOver > 0) return Math.max(a.l, b.l) - Math.min(a.r, b.r);
    return Math.hypot(Math.max(a.l, b.l) - Math.min(a.r, b.r), Math.max(a.t, b.t) - Math.min(a.b, b.b));
  };
  const read = () => {
    const hud = window.VMHudInk || {};
    const goal = hud.goal || null;
    if (!goal) return { shown: false, bad: [] };
    const boxes = [...(window.VMStageLabels() || []), hud.map].filter(Boolean);
    const bad = [];
    for (const b of boxes) {
      const g = gap(goal, b);
      if (g < 3) bad.push({ g: Math.round(g * 10) / 10, text: b.text || 'minimap' });
    }
    return { shown: true, bad };
  };
  return (async () => {
    const ids = [];
    for (let id = ${from}; id <= ${to}; id++) ids.push(id);
    const cases = [];
    for (const id of ids) {
      if (!window.VMStartLevel(id)) { cases.push({ id, skip: true }); continue; }
      window.VMPlaytest.toast.clear();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) window.VMPlaytest.release(code);
      const snaps = [read()];
      window.VMPlaytest.kick('ArrowRight');
      window.VMPlaytest.kick('ArrowDown');
      for (let i = 0; i < 5; i++) {
        await new Promise((res) => setTimeout(res, 300));
        snaps.push(read());
      }
      for (const code of ['ArrowRight', 'ArrowDown']) window.VMPlaytest.release(code);
      const shown = snaps.some((s) => s.shown);
      const bad = [];
      snaps.forEach((s, i) => { for (const hit of s.bad) bad.push({ i, ...hit }); });
      cases.push({ id, shown, samples: snaps.length, bad: bad.slice(0, 6) });
    }
    return cases;
  })();
})()`;
}

function connect(port) {
  return (async () => {
    const chrome = spawn('google-chrome', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/vac-goal-sweep-${port}`, 'about:blank',
    ], { stdio: 'ignore' });
    let ws;
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
      if (!target) await sleep(100);
    }
    if (!target) { chrome.kill(); throw new Error('Chrome did not start on ' + port); }
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0; const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    };
    const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
      const msgId = ++seq; pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
      setTimeout(() => { if (pending.has(msgId)) { pending.delete(msgId); reject(new Error('timeout ' + method)); } }, timeout);
    });
    const ev = async (expression, timeout = 20000) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r.result.value;
    };
    return {
      chrome, ws, send, ev,
      close() { try { ws.close(); } catch {} chrome.kill(); },
    };
  })();
}

async function boot(page) {
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await page.send('Page.navigate', { url: BASE + '/play/vacuum-maze/?dev=1' });
  for (let i = 0; i < 50; i++) {
    if (await page.ev(`!!window.VMPlaytest && !!window.VMStartLevel && !!window.VMStageLabels`)) break;
    await sleep(80);
  }
  if (!await page.ev(`!!window.VMPlaytest`)) throw new Error('playtest hooks missing');
}

async function sweepView(page, theme, w, h) {
  const portrait = h >= w;
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 900,
    screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
  });
  await page.ev(`document.getElementById('s-map').checked = true; document.getElementById('s-theme').value = ${JSON.stringify(theme)}; document.getElementById('s-theme').dispatchEvent(new Event('input', { bubbles: true })); window.dispatchEvent(new Event('resize')); true`);
  await sleep(40);
  const cases = [];
  for (let from = 1; from <= 100; from += 20) {
    const to = Math.min(100, from + 19);
    const chunk = await page.ev(sampleSource(from, to), 90000);
    cases.push(...(chunk || []));
    console.log('chunk', theme, w + 'x' + h, from + '-' + to);
  }
  return cases;
}

async function worker(index) {
  const mine = VIEWS.filter((_, i) => i % WORKERS === index);
    const page = await connect(PORT0 + index);
  const found = [];
  try {
    await boot(page);
    for (const theme of THEMES) {
      for (const [w, h] of mine) {
        const t0 = Date.now();
        const cases = await sweepView(page, theme, w, h);
        const shown = cases.filter((c) => c.shown);
        const bad = cases.filter((c) => c.bad && c.bad.length);
        console.log('view', theme, w + 'x' + h, 'levels', cases.filter((c) => !c.skip).length, 'shown', shown.length, 'bad', bad.length, 'ms', Date.now() - t0);
        for (const c of bad) {
          const hit = c.bad[0];
          const msg = theme + ' ' + w + 'x' + h + ' L' + c.id + ' t' + hit.i + ' ' + hit.g + ' ' + hit.text;
          found.push(msg);
          fail(msg);
        }
        const skipped = cases.filter((c) => c.skip).map((c) => c.id);
        if (skipped.length) console.log('skip', theme, w + 'x' + h, skipped.join(','));
        found.meta = found.meta || { cases: 0, shown: 0, samples: 0 };
        for (const c of cases) {
          if (c.skip) continue;
          found.meta.cases++;
          found.meta.samples += c.samples || 0;
          if (c.shown) found.meta.shown++;
        }
      }
    }
  } finally {
    page.close();
  }
  return found;
}

const started = Date.now();
let meta = { cases: 0, shown: 0, samples: 0 };
try {
  const parts = await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));
  for (const part of parts) {
    if (!part.meta) continue;
    meta.cases += part.meta.cases;
    meta.shown += part.meta.shown;
    meta.samples += part.meta.samples;
  }
} catch (err) {
  fail(err && err.stack ? err.stack.split('\n').slice(0, 6).join(' ') : String(err));
}
const sec = ((Date.now() - started) / 1000).toFixed(1);
console.log('cases', meta.cases, 'shown', meta.shown, 'samples', meta.samples, 'fail', failures.length, 'sec', sec);
if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
