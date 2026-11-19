/* On a phone or tablet, Vacuum Maze defaults to the tilt sensor on every route into play.
   Desktop stays on drag and keys. An iOS-style requestPermission runs on the first tap.
   Run: node tests/vacuum-tilt-default.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT = 9388;
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const seen = { settings: { theme: 'victorian' }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: true, custom: true } };
const fresh = { ...seen, tutorialSeen: { levels: false, custom: false } };

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-tilt-default', 'about:blank',
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

  async function metrics(w, h, mobile) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 1, mobile,
      screenOrientation: { type: mobile ? 'portraitPrimary' : 'landscapePrimary', angle: mobile ? 0 : 90 },
    });
    if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  async function boot(save, mobile) {
    await metrics(mobile ? 390 : 1280, mobile ? 844 : 800, mobile);
    await send('Page.navigate', { url: BASE + '/play/vacuum-maze/?dev=1' });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
      await sleep(80);
    }
    await ev(`localStorage.setItem('vacuum-maze.v2', ${JSON.stringify(JSON.stringify(save))}); true`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && !!window.VMTiltProbe && document.readyState === 'complete'`)) break;
      await sleep(80);
    }
  }
  async function tap(sel) {
    const box = await ev(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!box || box.w < 2) throw new Error('no tap target ' + sel);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(60);
  }
  async function nudge() {
    const ok = await ev(`(() => {
      try {
        window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0.02, y: 0.01, z: 9.8 }, interval: 16 }));
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 20, gamma: 10, absolute: false }));
        return 'ok';
      } catch (e) { return String(e); }
    })()`);
    if (ok !== 'ok') throw new Error('synthetic motion failed: ' + ok);
    await sleep(40);
  }
  const probe = () => ev(`window.VMTiltProbe()`);
  async function playLevel() {
    await tap('#b-begin');
    for (let i = 0; i < 30 && !await ev(`!!document.querySelector('#level-list button[data-lv="0"]')`); i++) await sleep(60);
    await tap('#level-list button[data-lv="0"]');
    await sleep(120);
  }
  async function expectSensor(where) {
    await nudge();
    const p = await probe();
    console.log(where, JSON.stringify(p));
    if (!p || !p.touch) fail(where + ' not a touch device ' + JSON.stringify(p));
    if (!p || p.tiltSource !== 'sensor' || p.drag) fail(where + ' tilt ' + JSON.stringify(p));
    if (!p || p.inputMode !== 'sensor') fail(where + ' inputMode ' + JSON.stringify(p));
    if (!p || p.cap !== 'sensor') fail(where + ' caption ' + (p && p.cap));
    if (!p || p.note !== 'Tilt sensor active: tip the phone to steer.') fail(where + ' tilt note ' + (p && p.note));
    return p;
  }

  const stripPrompt = `(() => {
    const DM = window.DeviceMotionEvent;
    if (!DM || typeof DM.requestPermission !== 'function') return;
    try { delete DM.requestPermission; } catch (e) {}
    if (typeof DM.requestPermission === 'function') DM.requestPermission = undefined;
  })();`;
  const stripped = await send('Page.addScriptToEvaluateOnNewDocument', { source: stripPrompt });
  await boot(seen, true);
  const api = await ev(`typeof (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission)`);
  console.log('android permission api', api);
  if (api === 'function') fail('this Chrome already has requestPermission, so the no-prompt path is not under test');
  await nudge();
  const attached = await probe();
  console.log('attached at load', JSON.stringify(attached));
  if (!attached || !(attached.events > 0)) fail('motion listeners were not attached before the first tap ' + JSON.stringify(attached));

  await playLevel();
  await expectSensor('begin');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 180, y: 420, button: 'left', clickCount: 1 });
  await sleep(50);
  const dragging = await probe();
  console.log('drag override', JSON.stringify(dragging));
  if (!dragging || dragging.tiltSource !== 'drag' || !dragging.drag) fail('a finger down did not override tilt ' + JSON.stringify(dragging));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 180, y: 420, button: 'left', clickCount: 1 });
  await expectSensor('after drag');

  await boot(seen, true);
  await nudge();
  await tap('#b-settings');
  await tap('#s-close');
  await playLevel();
  await expectSensor('levels from settings');

  await boot(seen, true);
  await nudge();
  await tap('#b-notebook');
  await tap('#b-nb-back');
  await playLevel();
  await expectSensor('notebook return');

  await boot(seen, true);
  await nudge();
  await tap('#b-shop');
  await tap('#b-shop-back');
  await playLevel();
  await expectSensor('shop return');

  await boot(seen, true);
  await nudge();
  await playLevel();
  if (!await ev(`window.VMShowFinish()`)) fail('next route did not open the finish');
  await sleep(80);
  await tap('#b-next');
  await sleep(120);
  await expectSensor('next');

  await boot(seen, true);
  await nudge();
  await playLevel();
  if (!await ev(`window.VMShowFinish()`)) fail('retry route did not open the finish');
  await sleep(80);
  await tap('#b-retry');
  await sleep(120);
  await expectSensor('retry');

  await boot(fresh, true);
  await nudge();
  await playLevel();
  const lesson = await expectSensor('tutorial');
  if (!lesson || lesson.line !== 'Tip the phone, or drag, to steer the atom.') fail('tutorial copy ' + (lesson && lesson.line));

  await boot(seen, true);
  await nudge();
  await playLevel();
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 50; i++) {
    if (await ev(`!!document.getElementById('b-begin') && !!window.VMTiltProbe`)) break;
    await sleep(80);
  }
  await nudge();
  const reattached = await probe();
  if (!reattached || !(reattached.events > 0)) fail('reload did not attach motion before a tap ' + JSON.stringify(reattached));
  await playLevel();
  await expectSensor('reload');

  await metrics(1280, 800, false);
  await boot(seen, false);
  await sleep(1700);
  await playLevel();
  await sleep(200);
  const desk = await probe();
  console.log('desktop', JSON.stringify(desk));
  if (!desk || desk.touch) fail('desktop was treated as a touch device ' + JSON.stringify(desk));
  if (!desk || desk.inputMode !== 'manual') fail('desktop did not stay manual ' + JSON.stringify(desk));
  if (desk.tiltSource === 'sensor' || desk.drag) fail('desktop took the sensor ' + JSON.stringify(desk));
  if ((desk.note || '').replace(/\u00a0/g, ' ') !== 'No motion sensor: drag or use the arrow keys to tip the apparatus.') fail('desktop tilt note ' + desk.note);
  if (!/ \(no tilt sensor\)$/.test(desk.cap)) fail('desktop caption ' + desk.cap);

  const buttonBreaks = `(() => {
    const problems = [];
    const plate = document.getElementById('p-title');
    if (!plate || !plate.classList.contains('show')) return ['title hidden'];
    plate.scrollTop = 0;
    const pr = plate.getBoundingClientRect();
    for (const b of plate.querySelectorAll('.row > button')) {
      const face = b.querySelector('.vm-button-face') || b;
      const text = [...face.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const label = b.textContent.replace(/\\s+/g, ' ').trim();
      const box = b.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(face).fontSize);
      if (!(box.height >= 44)) problems.push(label + ' height ' + box.height.toFixed(1));
      if (!(fs >= 11)) problems.push(label + ' font ' + fs);
      if (box.left < pr.left - 1 || box.right > pr.right + 1 || box.top < -1 || box.bottom > innerHeight + 1) problems.push(label + ' outside');
      if (!text) { problems.push(label + ' no text'); continue; }
      const src = text.textContent;
      const re = /\\S+/g;
      let m;
      while ((m = re.exec(src))) {
        const range = document.createRange();
        range.setStart(text, m.index);
        range.setEnd(text, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.2);
        if (rects.length > 1) problems.push(label + ' splits ' + m[0]);
      }
    }
    return problems;
  })()`;
  const noteInk = `(() => {
    const plate = document.getElementById('p-title');
    const note = document.getElementById('tilt-note');
    plate.scrollTop = 0;
    const node = [...note.childNodes].find((n) => n.nodeType === 3);
    const range = document.createRange();
    range.selectNodeContents(node);
    const ink = range.getBoundingClientRect();
    const lines = [];
    const s = node.textContent;
    let top = null, start = 0;
    const push = (end) => lines.push(s.slice(start, end).replace(/\\u00a0/g, ' ').trim());
    for (let i = 0; i <= s.length; i++) {
      if (i === s.length) { push(i); break; }
      const rr = document.createRange();
      rr.setStart(node, i); rr.setEnd(node, i + 1);
      const rect = rr.getClientRects()[0];
      if (!rect || rect.width < 0.2) continue;
      if (top === null) { top = rect.top; start = i; }
      else if (Math.abs(rect.top - top) > 2) { push(i); start = i; top = rect.top; }
    }
    const clean = lines.filter(Boolean);
    return {
      bottom: +ink.bottom.toFixed(1), vh: innerHeight,
      gap: +(innerHeight - ink.bottom).toFixed(1),
      over: plate.scrollHeight - plate.clientHeight,
      last: clean[clean.length - 1] || '',
    };
  })()`;
  const buttonSizes = [[300, 560], [320, 568], [340, 600], [360, 640], [390, 844], [568, 320], [844, 390]];
  const noteSizes = [[320, 568], [360, 640], [390, 844], [568, 320], [640, 360], [844, 390], [820, 1180]];
  await boot(seen, true);
  for (const theme of ['victorian', 'bw']) {
    await ev(`document.body.dataset.theme = ${JSON.stringify(theme)}; true`);
    for (const [w, h] of buttonSizes) {
      const portrait = h >= w;
      await send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: true,
        screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
      });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await sleep(80);
      const where = theme + ' title buttons ' + w + 'x' + h;
      const problems = await ev(buttonBreaks);
      console.log(where, JSON.stringify(problems));
      for (const p of problems || ['no result']) if (p) fail(where + ' ' + p);
    }
    for (const [w, h] of noteSizes) {
      const portrait = h >= w;
      await send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 1, mobile: true,
        screenOrientation: { type: portrait ? 'portraitPrimary' : 'landscapePrimary', angle: portrait ? 0 : 90 },
      });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      await sleep(60);
      const ink = await ev(noteInk);
      console.log(theme, 'note', w + 'x' + h, JSON.stringify(ink));
      if (!ink || ink.over > 1 || !(ink.gap >= 10)) fail(theme + ' tilt note ' + w + 'x' + h + ' ' + JSON.stringify(ink));
    }
    await send('Emulation.setDeviceMetricsOverride', {
      width: 820, height: 1180, deviceScaleFactor: 1, mobile: true,
      screenOrientation: { type: 'portraitPrimary', angle: 0 },
    });
    await ev(`document.getElementById('tilt-note').textContent = 'No motion sensor: drag or use the arrow keys to tip the\\u00a0apparatus.'; true`);
    const none = await ev(noteInk);
    console.log(theme, 'no-sensor 820x1180', JSON.stringify(none));
    if (!none || none.last.split(/\s+/).filter(Boolean).length < 2) fail(theme + ' no-sensor widows ' + (none && none.last));
    await ev(`document.getElementById('tilt-note').textContent = ${JSON.stringify('On a phone, tap Begin and allow motion access. On a computer, drag or use the arrow keys to tip the\u00a0apparatus.')}; true`);
  }

  if (stripped && stripped.identifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stripped.identifier });
  const iosStub = `(() => {
    const DM = window.DeviceMotionEvent;
    if (!DM) return;
    DM.requestPermission = function () {
      window.__motionPerm = (window.__motionPerm || 0) + 1;
      if (window.__motionFailLeft > 0) { window.__motionFailLeft--; return Promise.reject(new Error('missed')); }
      return Promise.resolve('granted');
    };
  })();`;
  const added = await send('Page.addScriptToEvaluateOnNewDocument', { source: iosStub });
  await boot(seen, true);
  const permApi = await ev(`typeof DeviceMotionEvent.requestPermission`);
  if (permApi !== 'function') fail('iOS stub was not installed');
  await tap('#b-settings');
  await sleep(40);
  const first = await ev(`window.__motionPerm || 0`);
  console.log('ios first tap', first);
  if (first !== 1) fail('requestPermission was not called on the first tap ' + first);
  await tap('#s-close');
  await nudge();
  await playLevel();
  const after = await ev(`window.__motionPerm || 0`);
  if (after !== 1) fail('requestPermission ran again after it was granted ' + after);
  await expectSensor('ios after first tap');

  await ev(`window.__motionFailLeft = 1; window.__motionPerm = 0; true`);
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 50; i++) {
    if (await ev(`!!document.getElementById('b-begin') && !!window.VMTiltProbe`)) break;
    await sleep(80);
  }
  await ev(`window.__motionFailLeft = 1; true`);
  await tap('#b-begin');
  const missed = await ev(`window.__motionPerm || 0`);
  console.log('ios missed first', missed);
  if (missed !== 1) fail('missed gesture did not ask once ' + missed);
  for (let i = 0; i < 30 && !await ev(`!!document.querySelector('#level-list button[data-lv="0"]')`); i++) await sleep(60);
  await tap('#level-list button[data-lv="0"]');
  await sleep(80);
  const retried = await ev(`window.__motionPerm || 0`);
  console.log('ios level start retry', retried);
  if (retried !== 2) fail('level start did not ask again after a missed tap ' + retried);
  await nudge();
  await expectSensor('ios after retry');
  if (added && added.identifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.identifier });
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
