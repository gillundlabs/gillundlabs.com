/* Vacuum Maze tutorials replace Level 0.
   First entry to official levels and to a maze you build each show a short practice.
   Skip or finishing remembers that mode. Settings can show it again. Nothing is recorded.
   Run: node tests/vacuum-level0.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const MAIN_REV = '94de085';
const MAIN_PORT = 8774;
const PORT = 9378;
const mainRoot = '/tmp/vac-main-' + MAIN_REV;
rmSync(mainRoot, { recursive: true, force: true });
mkdirSync(mainRoot + '/play/vacuum-maze', { recursive: true });
const mainAnchor = "addEventListener('keyup', (e) => keys.delete(e.code));";
const mainInject = `
window.VMHoldWorld = (on) => { devHooks.on = !!on; state.freeze = !!on; state.holdWorld = !!on; };
window.VMSettlePlay = function () {
  devHooks.on = true; state.freeze = true; state.holdWorld = true;
  const w = state.world;
  if (!w) return false;
  w.atom.vx = 0; w.atom.vy = 0;
  state.tilt = { x: 0, y: 0 };
  state.cam.x = w.atom.x; state.cam.y = w.atom.y; state.cam.lx = 0; state.cam.ly = 0;
  state.cam.k = E.viewZoom(vw, vh) * devHooks.zoom();
  return true;
};
window.VMShowHint = function () { inputMode = 'manual'; inputReason = 'none'; showHint(); };
window.VMPlayGeometry = function () {
  const L = state.level, w = state.world, c = state.cam;
  if (!L || !w || !c) return null;
  const inset = playInset();
  const viewH = Math.max(80, vh - inset.top - inset.bottom);
  const project = (x, y) => ({ x: (x - c.x) * c.k + vw / 2, y: (y - c.y) * c.k + inset.top + viewH / 2 + (inset.bias || 0) });
  const boxOf = (x, y, hw, hh) => { const p = project(x, y); return { l: p.x - hw * c.k, t: p.y - hh * c.k, r: p.x + hw * c.k, b: p.y + hh * c.k }; };
  const union = (a, b) => (a ? { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) } : b);
  let tube = null;
  for (const cell of L.cells) {
    if (!cell || cell.shape === 'empty') continue;
    const horiz = !!(cell.mask & (M.BIT.E | M.BIT.W));
    const vert = !!(cell.mask & (M.BIT.N | M.BIT.S));
    tube = union(tube, boxOf(cell.cx, cell.cy, horiz ? Math.max(HC, H + WALL_T) : H + WALL_T, vert ? Math.max(HC, H + WALL_T) : H + WALL_T));
  }
  let pump = null;
  for (const e of L.exits) { const p = M.pumpLayout(M.exitPlane(L, e)); pump = union(pump, boxOf(p.x, p.y, p.r * 1.08, p.r * 1.4)); }
  const left = safe.l + 8, top = safe.t + 8, avail = vw - safe.r - left - 64, width = Math.min(560, Math.max(148, avail));
  const narrow = width < 340, bw = document.body.dataset.theme === 'bw';
  const pad = bw ? (narrow ? 8 : 12) : (narrow ? 22 : 20);
  const titleH = narrow ? 15 : 18, labH = 12, valH = narrow ? 16 : 22, parH = narrow ? 14 : 16;
  const block = titleH + (narrow ? 6 : 10) + labH + 4 + valH + (narrow ? 6 : 8) + parH;
  const ring = bw ? 34 : 34 * 1.18, gx = safe.l + 52, gy = vh - safe.b - 56;
  const shown = (id) => {
    const el = document.getElementById(id); if (!el) return null;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null;
    return { l: b.left, t: b.top, r: b.right, b: b.bottom };
  };
  return { tube, atom: boxOf(w.atom.x, w.atom.y, 22, 22), pump, gauge: { l: gx - ring, t: gy - ring, r: gx + ring, b: gy + ring }, hud: { l: left, t: top, r: left + width, b: top + pad * 2 + block }, rotate: shown('rotate-hint'), hint: shown('hint-plaque'), cam: { x: c.x, y: c.y, k: c.k } };
};
`;
let mainHtml = execSync('git show ' + MAIN_REV + ':play/vacuum-maze/index.html', { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (!mainHtml.includes(mainAnchor)) throw new Error('main geometry anchor missing');
writeFileSync(mainRoot + '/play/vacuum-maze/index.html', mainHtml.replace(mainAnchor, mainAnchor + mainInject));
const mainServer = spawn('python3', ['-m', 'http.server', String(MAIN_PORT), '--bind', '127.0.0.1'], { cwd: mainRoot, stdio: 'ignore' });
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-tutorial-test', 'about:blank',
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  async function boot(save, base = BASE) {
    await send('Page.navigate', { url: base + '/play/vacuum-maze/' });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
      await sleep(120);
    }
    await ev(`localStorage.removeItem('vacuum-maze.entitlement.v1'); true`);
    if (save === null) await ev(`localStorage.removeItem('vacuum-maze.v2'); true`);
    else await ev(`localStorage.setItem('vacuum-maze.v2', ${JSON.stringify(JSON.stringify(save))}); true`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 50; i++) {
      if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
      await sleep(120);
    }
  }
  const snap = () => ev(`(() => {
    const s = JSON.parse(localStorage.getItem('vacuum-maze.v2') || 'null');
    const seen = s && s.tutorialSeen;
    const list = document.getElementById('level-list');
    return {
      playing: document.body.classList.contains('playing'),
      lesson: !!(document.getElementById('tutorial-hud') && document.getElementById('tutorial-hud').classList.contains('show')),
      skip: (document.getElementById('b-skip-tutorial') || {}).textContent || '',
      line: (document.querySelector('#tutorial-plaque .vls-plaque__label') || {}).textContent || '',
      levels: document.getElementById('p-levels').classList.contains('show'),
      settings: document.getElementById('p-settings').classList.contains('show'),
      settingsMsg: (document.getElementById('s-tutor-msg') || {}).textContent || '',
      win: document.getElementById('p-win').classList.contains('show'),
      winTitle: document.getElementById('win-title').textContent,
      winNote: document.getElementById('win-note').textContent,
      level0: !!(list && /Level 0/.test(list.textContent)),
      seenLevels: !!(seen && seen.levels),
      seenCustom: !!(seen && seen.custom),
      seenShape: seen && typeof seen,
      coins: s ? s.coins : 0,
      best: s && s.best ? s.best : {},
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
  async function openFirstLevel() {
    await ev(`document.getElementById('b-begin').click(); true`);
    for (let i = 0; i < 30; i++) {
      if (await ev(`!!document.querySelector('#level-list button[data-lv="0"]')`)) break;
      await sleep(80);
    }
    await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
    await sleep(300);
  }
  const records = (s) => !s.coins && !Object.keys(s.best).length && !s.cleared.length && !s.pumps.length;

  await boot(null);
  let st = await snap();
  console.log('fresh', JSON.stringify(st));
  if (st.level0) fail('the level list still has Level 0');
  await ev(`document.getElementById('b-begin').click(); true`);
  await sleep(250);
  st = await snap();
  console.log('begin', JSON.stringify({ levels: st.levels, lesson: st.lesson, level0: st.level0 }));
  if (!st.levels || st.lesson) fail('Begin should open the level list, not a practice ' + JSON.stringify(st));
  if (st.level0) fail('Level 0 is still in the list');

  await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('first', JSON.stringify(st));
  if (!st.playing || !st.lesson) fail('first level did not open the levels practice ' + JSON.stringify(st));
  if (st.skip !== 'Skip') fail('skip button is not Skip: ' + st.skip);
  if (!/Space pauses/.test(st.line)) fail('desktop practice omitted Space ' + st.line);
  if (/Level 0/.test(st.line)) fail('practice still says Level 0 ' + st.line);
  if (st.seenLevels || st.seenCustom || !records(st) || st.notebook.length) fail('starting the practice wrote progress ' + JSON.stringify(st));

  await hold('ArrowRight', 'ArrowRight', 39, 80);
  await sleep(150);
  st = await snap();
  console.log('steered', st.line);
  if (!/pump/.test(st.line)) fail('after a tip the practice did not name the pump ' + st.line);
  if (st.seenLevels || !records(st) || st.notebook.length) fail('tipping wrote progress ' + JSON.stringify(st));

  await ev(`document.getElementById('b-skip-tutorial').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('skip', JSON.stringify(st));
  if (!st.playing || st.lesson) fail('skip did not leave the practice for the level ' + JSON.stringify(st));
  if (!st.seenLevels || st.seenCustom) fail('skip remembered the wrong modes ' + JSON.stringify(st));
  if (!records(st)) fail('skip wrote coins, records, or pumps ' + JSON.stringify(st));

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(100);
  await ev(`document.getElementById('b-pause-levels').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('again', JSON.stringify({ lesson: st.lesson, playing: st.playing }));
  if (st.lesson || !st.playing) fail('the levels practice showed again after skip ' + JSON.stringify(st));

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-settings').click(); true`);
  await sleep(150);
  await ev(`document.getElementById('s-tutor-levels').click(); true`);
  await sleep(100);
  st = await snap();
  console.log('restart', st.settingsMsg, st.seenLevels, JSON.stringify(st.best));
  if (!st.settings) fail('settings did not open');
  if (st.seenLevels) fail('Levels again did not clear the levels practice');
  if (!/Best times are unchanged/.test(st.settingsMsg)) fail('settings did not say records stay ' + st.settingsMsg);
  if (!records(st)) fail('restarting the practice wrote a record ' + JSON.stringify(st));

  await ev(`document.getElementById('s-close').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-levels').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
  await sleep(300);
  st = await snap();
  if (!st.lesson) fail('the levels practice did not return after Settings');

  const kept = {
    settings: { theme: 'victorian' },
    coins: 4, paidCoins: 0, owned: [1],
    best: { '1|earth': { time: 9.5, stars: 2 } },
    cleared: { 1: true },
    pumpsSeen: {}, notebook: { tilt: true }, notebookNew: {},
    parts: {},
    tutorialSeen: true,
  };
  await boot(kept);
  st = await snap();
  console.log('old save', JSON.stringify({ seen: st.seenShape, levels: st.seenLevels, coins: st.coins, best: st.best, cleared: st.cleared }));
  if (st.seenLevels || st.seenCustom) fail('an old Level 0 flag was treated as the new practices ' + JSON.stringify(st));
  if (st.coins !== 4 || st.best['1|earth'].time !== 9.5 || st.cleared.join() !== '1' || st.notebook.join() !== 'tilt') fail('loading the new flag disturbed a saved record ' + JSON.stringify(st));
  await openFirstLevel();
  st = await snap();
  if (!st.lesson) fail('a player who had finished Level 0 did not get the new levels practice');
  await ev(`document.getElementById('b-skip-tutorial').click(); true`);
  await sleep(250);
  st = await snap();
  if (st.coins !== 4 || st.best['1|earth'].time !== 9.5 || st.best['1|earth'].stars !== 2 || st.cleared.join() !== '1') fail('skip changed an existing record ' + JSON.stringify(st));
  if (st.lesson || !st.playing) fail('skip did not enter the level when a record already existed');

  await boot(null);
  await openFirstLevel();
  await hold('ArrowLeft', 'ArrowLeft', 37, 2200);
  await hold('ArrowDown', 'ArrowDown', 40, 1600);
  let won = null;
  for (let i = 0; i < 36; i++) {
    won = await snap();
    if (won.win) break;
    await hold('ArrowLeft', 'ArrowLeft', 37, 350);
    await hold('ArrowDown', 'ArrowDown', 40, 250);
  }
  console.log('done', JSON.stringify({ title: won.winTitle, note: won.winNote, seen: won.seenLevels }));
  if (!won.win || won.winTitle !== 'Practice done') fail('the practice did not finish ' + JSON.stringify(won));
  if (!/saved nothing/.test(won.winNote) || !/record pace/.test(won.winNote)) fail('the practice result does not teach scoring ' + won.winNote);
  const scored = await ev(`(() => {
    const stats = document.getElementById('win-stats').innerText.replace(/\\s+/g, ' ');
    const num = (label) => { const m = stats.match(new RegExp(label + '\\\\s+([0-9.]+)')); return m ? +m[1] : null; };
    const starsFor = (t, par) => (t <= par ? 3 : t <= 2 * par ? 2 : 1);
    const t = num('Screen time'), tRef = num('Record pace'), par = num('Par');
    const shown = (document.getElementById('win-stars').textContent.match(/★/g) || []).length;
    return { t, tRef, par, recordStars: starsFor(tRef, par), shown, stats };
  })()`);
  console.log('score', JSON.stringify(scored));
  if (scored.shown !== scored.recordStars) fail('practice stars did not follow record pace ' + JSON.stringify(scored));
  if (!won.seenLevels || !records(won) || won.notebook.length) fail('finishing the practice wrote a record or forgot the flag ' + JSON.stringify(won));

  const customSave = {
    settings: { theme: 'victorian' },
    coins: 4, paidCoins: 0, owned: [1],
    best: { '1|earth': { time: 9.5, stars: 2 } },
    cleared: { 1: true },
    pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {},
    tutorialSeen: { levels: true, custom: false },
  };
  await boot(customSave);
  const code = await ev(`(() => {
    const EC = window.VMEditorCore;
    let m = EC.resize(EC.newMaze('Practice'), 2, 2);
    EC.place(m, 'tube', 0, 0, 1);
    EC.place(m, 'source', 0, 0);
    EC.place(m, 'rotary', 0, 0);
    const errors = EC.validate(m);
    return { errors, code: errors.length ? '' : EC.encode(m) };
  })()`);
  console.log('maze', JSON.stringify(code.errors));
  if (code.errors.length) fail('practice maze is not playable ' + code.errors.join(' '));
  await ev(`document.getElementById('b-editor').click(); true`);
  await sleep(200);
  await ev(`document.getElementById('mm-code').value = ${JSON.stringify(code.code)}; document.getElementById('mm-import').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#mm-list button[data-play]').click(); true`);
  await sleep(300);
  st = await snap();
  console.log('custom', st.line);
  if (!st.lesson) fail('the first maze did not open its practice ' + JSON.stringify(st));
  if (st.coins !== 4 || st.best['1|earth'].time !== 9.5) fail('opening the maze practice changed a record ' + JSON.stringify(st));
  let customLine = '';
  for (let i = 0; i < 24; i++) {
    await hold('ArrowLeft', 'ArrowLeft', 37, 280);
    await hold('ArrowDown', 'ArrowDown', 40, 200);
    st = await snap();
    customLine = st.line;
    if (/no best time/.test(customLine) || st.win) break;
  }
  console.log('custom score line', customLine, st.winTitle);
  if (!/no best time/.test(customLine) && !(st.win && /no best time/.test(st.winNote))) fail('maze practice did not explain scoring ' + customLine + ' / ' + st.winNote);
  await ev(`document.getElementById('b-skip-tutorial').click(); true`);
  await sleep(300);
  st = await snap();
  if (st.lesson || !st.playing) fail('skip did not enter the maze ' + JSON.stringify(st));
  if (!st.seenCustom || st.coins !== 4 || st.best['1|earth'].time !== 9.5) fail('maze skip changed records or the flag ' + JSON.stringify(st));

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-levels').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#mm-list button[data-play]').click(); true`);
  await sleep(250);
  st = await snap();
  if (st.lesson) fail('the maze practice showed again after skip');

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-settings').click(); true`);
  await sleep(120);
  await ev(`document.getElementById('s-tutor-custom').click(); true`);
  await sleep(80);
  st = await snap();
  if (st.seenCustom) fail('My mazes again did not clear the maze practice');
  if (st.best['1|earth'].time !== 9.5) fail('clearing the maze practice changed a best time');
  await ev(`document.getElementById('s-close').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-levels').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#mm-list button[data-play]').click(); true`);
  await sleep(250);
  st = await snap();
  if (!st.lesson) fail('the maze practice did not return after Settings');
  if (st.best['1|earth'].time !== 9.5 || st.coins !== 4) fail('returning the maze practice changed a record ' + JSON.stringify(st));

  const hits = (a, b) => !!(a && b && a.r > b.l + 1 && a.l < b.r - 1 && a.b > b.t + 1 && a.t < b.b - 1);
  async function plateClear(where) {
    const box = await ev(`window.VMTutorialLayout()`);
    const live = await snap();
    if (!box || !box.shown) fail(where + ' plate is not showing');
    if (!box.plate || box.plate.b - box.plate.t < 24) fail(where + ' plate has no size ' + JSON.stringify(box && box.plate));
    for (const name of ['tube', 'source', 'atom', 'mouth', 'readout']) {
      if (hits(box.plate, box[name])) fail(where + ' plate covers the ' + name + ' ' + JSON.stringify(box));
    }
    return { box, live };
  }
  for (const [w, h, theme] of [[320, 700, 'victorian'], [320, 700, 'bw'], [390, 844, 'victorian'], [390, 844, 'bw'], [768, 900, 'victorian'], [768, 900, 'bw'], [1280, 800, 'victorian'], [1280, 800, 'bw']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: w < 500, maxTouchPoints: 1 });
    await boot({ settings: { theme }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } });
    await openFirstLevel();
    await sleep(250);
    let step = await plateClear(theme + ' ' + w + ' step 1');
    if (theme === 'victorian' && !step.box.chrome) fail(theme + ' ' + w + ' step 1 has no kit frame');
    if (theme === 'bw' && step.box.chrome) fail(theme + ' ' + w + ' drew screws on the plain plate');
    await hold('ArrowRight', 'ArrowRight', 39, 120);
    await sleep(200);
    step = await plateClear(theme + ' ' + w + ' step 2');
    if (!/pump/.test(step.live.line)) fail(theme + ' ' + w + ' step 2 line ' + step.live.line);
    for (let i = 0; i < 24 && step.live.lesson && !/record pace/.test(step.live.line); i++) {
      await hold('ArrowLeft', 'ArrowLeft', 37, 140);
      step = { live: await snap(), box: step.box };
    }
    if (!step.live.lesson || !/record pace/.test(step.live.line)) fail(theme + ' ' + w + ' scoring step missing the plate ' + step.live.line + ' lesson ' + step.live.lesson);
    await plateClear(theme + ' ' + w + ' step 3');
    console.log('clear', theme, w);
  }

  const sensorLine = 'No motion sensor found. Drag or use arrow keys to tip the apparatus';
  const sensorSizes = [[320, 700, 'bw'], [320, 700, 'victorian'], [320, 568, 'bw'], [320, 568, 'victorian'], [568, 320, 'bw'], [568, 320, 'victorian'], [667, 375, 'bw'], [667, 375, 'victorian'], [812, 375, 'bw'], [812, 375, 'victorian'], [360, 640, 'bw'], [360, 640, 'victorian'], [360, 740, 'bw'], [360, 740, 'victorian'], [390, 844, 'bw'], [390, 844, 'victorian'], [412, 915, 'bw'], [412, 915, 'victorian'], [768, 900, 'bw'], [768, 900, 'victorian'], [1280, 800, 'bw'], [1280, 800, 'victorian']];
  for (const [w, h, theme] of sensorSizes) {
    const phone = Math.min(w, h) < 500;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: phone });
    await send('Emulation.setTouchEmulationEnabled', { enabled: phone, maxTouchPoints: 1 });
    await boot({ settings: { theme }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } });
    await ev(`document.getElementById('b-begin').click(); true`);
    let appeared = false;
    for (let i = 0; i < 30 && !appeared; i++) {
      appeared = await ev(`document.getElementById('hint-plaque').classList.contains('show')`);
      if (!appeared) await sleep(100);
    }
    if (!appeared) fail(theme + ' ' + w + ' sensor message never appeared');
    await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
    await sleep(450);
    const box = await ev(`window.VMTutorialLayout()`);
    const hint = box && box.hint;
    const where = theme + ' ' + w + ' sensor';
    const folded = w > h && h <= 420;
    const insideView = (part) => part && part.l >= -1 && part.t >= -1 && part.r <= w + 1 && part.b <= h + 1;
    if (folded) {
      const foldedText = await ev(`(() => {
        const el = document.getElementById('tutorial-plaque');
        const node = el && el.querySelector('.tutor-sensor');
        const plaque = document.getElementById('hint-plaque');
        if (!node) return { text: '', shown: false, plaque: !!(plaque && plaque.classList.contains('show') && getComputedStyle(plaque).display !== 'none') };
        const range = document.createRange(); range.selectNodeContents(node);
        const rr = range.getBoundingClientRect();
        const pr = el.getBoundingClientRect();
        return {
          text: node.textContent,
          shown: true,
          plaque: !!(plaque && plaque.classList.contains('show') && getComputedStyle(plaque).display !== 'none'),
          range: { l: rr.left, t: rr.top, r: rr.right, b: rr.bottom, w: rr.width, h: rr.height },
          plate: { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom },
          scroll: el.scrollTop + node.scrollTop,
        };
      })()`);
      if (foldedText.plaque) fail(where + ' sensor plaque is still a separate plate');
      if (foldedText.text !== sensorLine) fail(where + ' wording changed ' + foldedText.text);
      if (!foldedText.range || foldedText.range.w < 20 || foldedText.range.h < 8) fail(where + ' sensor line has no box ' + JSON.stringify(foldedText));
      if (foldedText.scroll > 0) fail(where + ' sensor line is scrolled');
      const plateHolds = (a, b) => a.l >= b.l - 1 && a.t >= b.t - 1 && a.r <= b.r + 1 && a.b <= b.b + 1;
      if (!plateHolds(foldedText.range, { l: 0, t: 0, r: w, b: h }) || !plateHolds(foldedText.range, foldedText.plate)) fail(where + ' sensor line is cut off ' + JSON.stringify(foldedText));
    } else if (!hint || !hint.shown) fail(where + ' message is not showing in the practice');
    else {
      if (hint.text !== sensorLine) fail(where + ' wording changed ' + hint.text);
      if (hint.clipped) fail(where + ' message is clipped ' + JSON.stringify(hint));
      if (hint.l < -1 || hint.t < -1 || hint.r > w + 1 || hint.b > h + 1) fail(where + ' message leaves the viewport ' + JSON.stringify(hint));
      if (hits(hint, box.gauge)) fail(where + ' message covers the gauge ' + JSON.stringify({ hint, gauge: box.gauge }));
      for (const name of ['tube', 'atom', 'mouth', 'pump', 'plate', 'pause', 'levelBtn', 'skip', 'caption', 'corner']) {
        if (hits(hint, box[name])) fail(where + ' message covers the ' + name + ' ' + JSON.stringify({ hint, part: box[name] }));
      }
    }
    {
      const fully = (w > h && h <= 420) || (h > w && w <= 390) || (w === 390 && h === 844);
      for (const name of ['tube', 'atom', 'mouth', 'pump', 'plate']) {
        const part = box[name];
        if (!part) fail(where + ' ' + name + ' is missing');
        else if (fully) {
          if (!insideView(part)) fail(where + ' ' + name + ' is not fully on screen ' + JSON.stringify(part));
        } else if (part.b < 1 || part.t > h - 1 || part.r < 1 || part.l > w - 1) fail(where + ' ' + name + ' is off the screen ' + JSON.stringify(part));
      }
      if (fully) {
        for (const name of ['tube', 'atom', 'mouth', 'pump']) {
          const part = box[name];
          for (const blocker of ['gauge', 'caption', 'pause', 'levelBtn', 'skip', 'plate', 'corner']) {
            if (hits(part, box[blocker])) fail(where + ' ' + name + ' overlaps the ' + blocker + ' ' + JSON.stringify({ part, blocker: box[blocker] }));
          }
          if (box.rotate && hits(part, box.rotate)) fail(where + ' ' + name + ' overlaps the rotate hint ' + JSON.stringify({ part, rotate: box.rotate }));
        }
      }
      if (box.rotate) {
        if (box.rotate.l < -1 || box.rotate.t < -1 || box.rotate.r > w + 1 || box.rotate.b > h + 1) fail(where + ' rotate hint leaves the viewport ' + JSON.stringify(box.rotate));
        for (const name of ['gauge', 'caption', 'corner', 'tube', 'atom', 'mouth', 'pump', 'skip', 'pause', 'levelBtn', 'plate']) {
          if (hits(box.rotate, box[name])) fail(where + ' rotate hint covers the ' + name + ' ' + JSON.stringify({ rotate: box.rotate, part: box[name] }));
        }
      }
    }
    console.log('sensor', theme, w, folded ? 'in-plate' : (hint && JSON.stringify({ l: Math.round(hint.l), t: Math.round(hint.t), r: Math.round(hint.r), b: Math.round(hint.b), clipped: hint.clipped })), 'pump', box.pump && JSON.stringify({ l: Math.round(box.pump.l), t: Math.round(box.pump.t), r: Math.round(box.pump.r), b: Math.round(box.pump.b) }));
  }

  async function tap(code, keyName, vk) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(120);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
  await boot(null);
  await ev(`document.getElementById('b-begin').click(); true`);
  await sleep(200);
  const lockedIndex = await ev(`window.VMPurchase.CONFIG.FREE_LEVELS`);
  await ev(`document.querySelector('#level-list button[data-lv="${lockedIndex}"]').click(); true`);
  await sleep(250);
  st = await snap();
  console.log('locked', JSON.stringify({ levels: st.levels, lesson: st.lesson, playing: st.playing, seen: st.seenLevels, ledger: await ev(`document.getElementById('p-ledger').classList.contains('show')`) }));
  if (st.lesson || st.playing) fail('a locked level started play ' + JSON.stringify(st));
  if (st.seenLevels || st.seenCustom) fail('a locked level marked a practice seen');
  if (!await ev(`document.getElementById('p-ledger').classList.contains('show')`)) fail('a locked level did not open the paywall');
  await ev(`(document.getElementById('b-notnow-web') || document.getElementById('b-notnow')).click(); true`);
  await sleep(150);
  st = await snap();
  if (st.seenLevels || st.lesson) fail('closing the paywall marked or started a practice ' + JSON.stringify(st));

  const prior = await ev(`window.VM_LEVEL_DATA.levels.slice(0, window.VMPurchase.CONFIG.FREE_LEVELS).map((l) => l.id)`);
  const cleared = {};
  for (const id of prior) cleared[id] = true;
  await boot({ settings: { theme: 'victorian' }, coins: 2, paidCoins: 0, owned: [1], best: { '1|earth': { time: 8, stars: 1 } }, cleared, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } });
  await ev(`document.getElementById('b-begin').click(); true`);
  await sleep(200);
  await ev(`document.querySelector('#level-list button[data-lv="${lockedIndex}"]').click(); true`);
  await sleep(200);
  if (!await ev(`document.getElementById('p-ledger').classList.contains('show')`)) fail('progress-open locked level did not open the paywall');
  await ev(`(document.getElementById('b-trial-web') || document.getElementById('b-trial')).click(); true`);
  await sleep(400);
  st = await snap();
  const run = await ev(`window.VMTutorialLayout()`);
  console.log('trial', st.line, run && run.levelIdx, run && run.tutorial);
  if (!st.lesson || st.skip !== 'Skip') fail('trial did not open the practice with Skip ' + JSON.stringify(st));
  if (!run.tutorial || run.levelIdx !== lockedIndex) fail('trial started the wrong level ' + JSON.stringify(run));
  if (st.seenLevels || st.best['1|earth'].time !== 8) fail('starting the practice from the trial wrote a record ' + JSON.stringify(st));

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-settings').click(); true`);
  await sleep(120);
  await tap('Escape', 'Escape', 27);
  st = await snap();
  const afterSettings = await ev(`({ settings: document.getElementById('p-settings').classList.contains('show'), pause: document.getElementById('p-pause').classList.contains('show'), run: window.VMTutorialLayout() })`);
  console.log('escape settings', JSON.stringify(afterSettings), st.seenLevels);
  if (afterSettings.settings || !afterSettings.pause) fail('Escape did not close Settings back to pause ' + JSON.stringify(afterSettings));
  if (!afterSettings.run.tutorial || st.seenLevels) fail('Escape from Settings skipped the practice ' + JSON.stringify(afterSettings) + st.seenLevels);
  await tap('Escape', 'Escape', 27);
  st = await snap();
  const afterPause = await ev(`window.VMTutorialLayout()`);
  console.log('escape pause', st.lesson, st.playing, afterPause.tutorial, st.seenLevels);
  if (!st.playing || !st.lesson || !afterPause.tutorial || st.seenLevels) fail('Escape from pause did not resume the practice ' + JSON.stringify(st));

  await ev(`document.getElementById('b-pausebtn').click(); true`);
  await sleep(80);
  await ev(`document.getElementById('b-pause-levels').click(); true`);
  await sleep(200);
  st = await snap();
  console.log('leave', st.seenLevels, st.levels);
  if (st.seenLevels || st.lesson) fail('leaving the practice marked it seen ' + JSON.stringify(st));
  await ev(`document.querySelector('#level-list button[data-lv="0"]').click(); true`);
  await sleep(300);
  st = await snap();
  if (!st.lesson) fail('the practice did not return after leaving without Skip');

  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 40; i++) {
    if (await ev(`!!document.getElementById('b-begin') && document.readyState === 'complete'`)) break;
    await sleep(120);
  }
  st = await snap();
  console.log('reload', st.seenLevels);
  if (st.seenLevels) fail('reloading mid-practice marked it seen');
  await openFirstLevel();
  st = await snap();
  if (!st.lesson || !/record pace|Space pauses|tip the tube|Tip the phone/.test(st.line)) fail('the practice did not return after reload ' + st.line);
  if (!/saves nothing|record pace|Space pauses|tip the tube|Tip the phone/.test(st.line)) fail('practice copy drifted ' + st.line);

  const FULL_LINES = [
    'Tip the phone, or drag, to steer the atom.',
    'Drag, or the arrow keys, to tip the tube. Space pauses.',
    'The open end is a pump. Steer the atom into it.',
    'Stars use record pace, not the screen clock. This practice saves nothing.',
    'A maze you build keeps no best time and pays no coins. This practice saves nothing.',
  ];
  async function lessonLine(where) {
    const info = await ev(`(() => {
      const el = document.getElementById('tutorial-plaque');
      const lab = el && el.querySelector('.vls-plaque__label');
      const range = document.createRange(); range.selectNodeContents(lab);
      const rr = range.getBoundingClientRect();
      const pr = el.getBoundingClientRect();
      const line = lab.querySelector('.tutor-line');
      const sensor = lab.querySelector('.tutor-sensor');
      const sr = sensor ? (document.createRange(), range.selectNodeContents(sensor), range.getBoundingClientRect()) : null;
      return {
        text: line ? line.textContent : lab.textContent,
        sensor: sensor ? sensor.textContent : '',
        sensorRange: sr ? { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom, w: sr.width, h: sr.height } : null,
        range: { l: rr.left, t: rr.top, r: rr.right, b: rr.bottom, w: rr.width, h: rr.height },
        plate: { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom },
        scroll: el.scrollTop + lab.scrollTop,
        overflow: getComputedStyle(el).overflowY + ' ' + getComputedStyle(lab).overflowY,
        vw: innerWidth, vh: innerHeight,
      };
    })()`);
    if (!FULL_LINES.includes(info.text)) fail(where + ' lesson text is not a full line: ' + info.text);
    if (info.vw > info.vh && info.vh <= 420) {
      if (info.sensor !== 'No motion sensor found. Drag or use arrow keys to tip the apparatus') fail(where + ' sensor line missing from the plate ' + info.sensor);
      if (!info.sensorRange || info.sensorRange.h < 8) fail(where + ' sensor line has no box');
    }
    if (info.range.w < 20 || info.range.h < 8) fail(where + ' lesson text has no box ' + JSON.stringify(info.range));
    if (info.scroll > 0) fail(where + ' lesson text is scrolled');
    if (/\b(auto|scroll)\b/.test(info.overflow)) fail(where + ' lesson plate scrolls ' + info.overflow);
    const inside = (a, b) => a.l >= b.l - 1 && a.t >= b.t - 1 && a.r <= b.r + 1 && a.b <= b.b + 1;
    if (!inside(info.range, { l: 0, t: 0, r: info.vw, b: info.vh })) fail(where + ' lesson text leaves the screen ' + JSON.stringify(info));
    if (!inside(info.range, info.plate)) fail(where + ' lesson text leaves the plate ' + JSON.stringify(info));
    return info.text;
  }
  for (const [w, h, theme] of [[320, 568, 'bw'], [320, 568, 'victorian'], [568, 320, 'bw'], [568, 320, 'victorian']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 500 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: Math.min(w, h) < 500, maxTouchPoints: 1 });
    await boot({ settings: { theme }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } });
    await openFirstLevel();
    if (w > h && h <= 420) {
      for (let i = 0; i < 25 && !await ev(`!!document.querySelector('#tutorial-plaque .tutor-sensor')`); i++) await sleep(100);
    }
    const where = theme + ' ' + w + 'x' + h;
    const first = await lessonLine(where + ' step 1');
    await hold('ArrowRight', 'ArrowRight', 39, 160);
    await sleep(200);
    const second = await lessonLine(where + ' step 2');
    if (!/pump/.test(second)) fail(where + ' step 2 did not name the pump ' + second);
    let third = second;
    for (let i = 0; i < 24 && !/saves nothing|record pace/.test(third); i++) {
      await hold('ArrowLeft', 'ArrowLeft', 37, 140);
      third = (await lessonLine(where + ' step 3')).toString();
    }
    if (!/saves nothing|record pace/.test(third)) fail(where + ' scoring line missing ' + third);
    if (first === second || second === third) fail(where + ' lesson steps did not change ' + [first, second, third].join(' | '));
    console.log('lines', where, 'ok');
  }

  const MAIN = 'http://127.0.0.1:' + MAIN_PORT;
  const round = (b) => {
    if (!b) return null;
    const o = {};
    for (const k of Object.keys(b)) o[k] = Math.round(b[k] * 100) / 100;
    return o;
  };
  function sameGeom(branch, main, where) {
    if (!branch || !main) { fail(where + ' geometry missing'); return; }
    if (branch.framing) fail(where + ' lesson framing still on');
    for (const key of ['tube', 'atom', 'pump', 'gauge', 'hud', 'rotate', 'hint']) {
      const a = JSON.stringify(round(branch[key])), b = JSON.stringify(round(main[key]));
      if (a !== b) fail(where + ' ' + key + ' branch ' + a + ' main ' + b);
    }
  }
  async function frozenLevel(base) {
    await ev(`window.VMHoldWorld(true); document.getElementById('b-begin').click(); true`);
    for (let i = 0; i < 30; i++) {
      if (await ev(`!!document.querySelector('#level-list button[data-lv="0"]')`)) break;
      await sleep(60);
    }
    await ev(`window.VMHoldWorld(true); document.querySelector('#level-list button[data-lv="0"]').click(); true`);
    await sleep(120);
    await ev(`window.VMSettlePlay(); window.VMShowHint(); true`);
    await sleep(350);
    return ev(`window.VMPlayGeometry()`);
  }
  const geomSizes = [[568, 320], [667, 375], [812, 375], [320, 568]];
  const mainGeom = {};
  for (const theme of ['victorian', 'bw']) {
    for (const [w, h] of geomSizes) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 500 });
      await send('Emulation.setTouchEmulationEnabled', { enabled: Math.min(w, h) < 500, maxTouchPoints: 1 });
      const save = { settings: { theme }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: true };
      await boot(save, MAIN);
      mainGeom[theme + w + 'x' + h] = await frozenLevel(MAIN);
      console.log('main', theme, w + 'x' + h, 'cam', mainGeom[theme + w + 'x' + h] && mainGeom[theme + w + 'x' + h].cam);
    }
  }
  for (const theme of ['victorian', 'bw']) {
    for (const [w, h] of geomSizes) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: Math.min(w, h) < 500 });
      await send('Emulation.setTouchEmulationEnabled', { enabled: Math.min(w, h) < 500, maxTouchPoints: 1 });
      const blank = { settings: { theme }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } };
      const seen = { ...blank, tutorialSeen: { levels: true, custom: true } };
      const key = theme + w + 'x' + h;
      await boot(seen);
      sameGeom(await frozenLevel(BASE), mainGeom[key], theme + ' ' + w + 'x' + h + ' already seen');
      await boot(blank);
      await openFirstLevel();
      await ev(`window.VMHoldWorld(true); document.getElementById('b-skip-tutorial').click(); true`);
      await sleep(120);
      await ev(`window.VMSettlePlay(); window.VMShowHint(); true`);
      await sleep(350);
      sameGeom(await ev(`window.VMPlayGeometry()`), mainGeom[key], theme + ' ' + w + 'x' + h + ' after Skip');
      await boot(seen);
      await openFirstLevel();
      await ev(`document.getElementById('b-pausebtn').click(); true`);
      await sleep(80);
      await ev(`document.getElementById('b-pause-settings').click(); true`);
      await sleep(120);
      await ev(`document.getElementById('s-tutor-levels').click(); true`);
      await sleep(80);
      await ev(`document.getElementById('s-close').click(); true`);
      await sleep(80);
      await ev(`document.getElementById('b-pause-levels').click(); true`);
      await sleep(200);
      await ev(`window.VMHoldWorld(true); document.querySelector('#level-list button[data-lv="0"]').click(); true`);
      await sleep(250);
      if (!await ev(`!!(document.getElementById('tutorial-hud') && document.getElementById('tutorial-hud').classList.contains('show'))`)) fail(theme + ' ' + w + ' replay did not show the lesson');
      await ev(`window.VMHoldWorld(true); document.getElementById('b-skip-tutorial').click(); true`);
      await sleep(120);
      await ev(`window.VMSettlePlay(); window.VMShowHint(); true`);
      await sleep(350);
      sameGeom(await ev(`window.VMPlayGeometry()`), mainGeom[key], theme + ' ' + w + 'x' + h + ' after Settings replay then Skip');
      console.log('geom', key, 'seen/skip/replay');
    }
  }
  for (const [w, h] of [[568, 320], [320, 568]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await boot({ settings: { theme: 'victorian' }, coins: 0, paidCoins: 0, owned: [1], best: {}, cleared: {}, pumpsSeen: {}, notebook: {}, notebookNew: {}, parts: {}, tutorialSeen: { levels: false, custom: false } });
    await openFirstLevel();
    let won = false;
    for (let i = 0; i < 40 && !won; i++) {
      await hold('ArrowLeft', 'ArrowLeft', 37, 180);
      won = await ev(`document.getElementById('p-win').classList.contains('show') || (document.getElementById('win-title') || {}).textContent === 'Practice done'`);
    }
    if (!won) {
      for (let i = 0; i < 20 && !won; i++) { await sleep(100); won = await ev(`document.getElementById('p-win').classList.contains('show')`); }
    }
    if (!won) fail('the lesson did not finish by itself at ' + w + 'x' + h);
    else {
      await ev(`window.VMHoldWorld(true); document.getElementById('b-next').click(); true`);
      await sleep(120);
      await ev(`window.VMSettlePlay(); window.VMShowHint(); true`);
      await sleep(350);
      sameGeom(await ev(`window.VMPlayGeometry()`), mainGeom['victorian' + w + 'x' + h], 'victorian ' + w + 'x' + h + ' after the lesson ended');
      console.log('geom ended', w + 'x' + h);
    }
  }
} catch (err) {
  fail(err && err.stack ? err.stack.split('\n').slice(0, 4).join(' ') : String(err));
} finally {
  if (ws) ws.close();
  chrome.kill();
  mainServer.kill();
}
if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
