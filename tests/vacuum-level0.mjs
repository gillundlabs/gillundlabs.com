/* Vacuum Maze tutorials replace Level 0.
   First entry to official levels and to a maze you build each show a short practice.
   Skip or finishing remembers that mode. Settings can show it again. Nothing is recorded.
   Run: node tests/vacuum-level0.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8772';
const PORT = 9378;
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

  async function boot(save) {
    await send('Page.navigate', { url: BASE + '/play/vacuum-maze/' });
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
  for (const [w, h, theme] of [[320, 700, 'bw'], [320, 700, 'victorian'], [360, 740, 'bw'], [360, 740, 'victorian'], [390, 844, 'bw'], [390, 844, 'victorian'], [768, 900, 'bw'], [768, 900, 'victorian'], [1280, 800, 'bw'], [1280, 800, 'victorian']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: w < 500, maxTouchPoints: 1 });
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
    if (!hint || !hint.shown) fail(where + ' message is not showing in the practice');
    else {
      if (hint.text !== sensorLine) fail(where + ' wording changed ' + hint.text);
      if (hint.clipped) fail(where + ' message is clipped ' + JSON.stringify(hint));
      if (hint.l < -1 || hint.t < -1 || hint.r > w + 1 || hint.b > h + 1) fail(where + ' message leaves the viewport ' + JSON.stringify(hint));
      if (hits(hint, box.gauge)) fail(where + ' message covers the gauge ' + JSON.stringify({ hint, gauge: box.gauge }));
      for (const name of ['tube', 'atom', 'mouth', 'pump', 'plate']) {
        if (hits(hint, box[name])) fail(where + ' message covers the ' + name + ' ' + JSON.stringify(box));
      }
    }
    console.log('sensor', theme, w, hint && JSON.stringify({ l: Math.round(hint.l), t: Math.round(hint.t), r: Math.round(hint.r), b: Math.round(hint.b), clipped: hint.clipped }));
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
