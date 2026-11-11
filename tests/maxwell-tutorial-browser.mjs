/* Lock-screen trial, Escape during a lesson, and lesson layout.
   Try it free must start the locked mode and its tutorial.
   Escape closes Settings, then pause, and skips only when no panel is open.
   At short and landscape sizes the stage, coach text, and Skip stay inside
   the viewport, and the Trial label stays off the chamber.
   Outside the lesson the stage matches main at every listed viewport.
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

  const LAYOUT = `(() => {
    const vw = innerWidth, vh = innerHeight;
    const canvas = document.getElementById('game');
    const cr = canvas.getBoundingClientRect();
    const sx = cr.width / 1000, sy = cr.height / 680;
    const mode = window.MDGameLive.tutorial().playMode;
    const play = mode === 'sort'
      ? { x: cr.left + 60 * sx, y: cr.top + 176 * sy, w: 880 * sx, h: 440 * sy }
      : { x: cr.left + 60 * sx, y: cr.top + 118 * sy, w: 880 * sx, h: 500 * sy };
    const overlap = (a, b) => {
      if (!a || !b || a.hidden || a.w < 1 || a.h < 1) return 0;
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return Math.round(x * y);
    };
    const box = (el) => {
      if (!el) return { missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        hidden: !!(el.hidden || cs.display === 'none' || cs.visibility === 'hidden'),
        x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
        scrollY: el.scrollHeight - el.clientHeight,
      };
    };
    const inside = (b) => !!(b && !b.missing && !b.hidden && b.w > 1 && b.x >= -1 && b.y >= -1 && b.right <= vw + 1 && b.bottom <= vh + 1);
    const stage = box(canvas);
    const msg = box(document.getElementById('instrument-message'));
    const skip = box(document.getElementById('b-skip-tutorial'));
    const trial = box(document.getElementById('trial-badge'));
    const pause = box(document.getElementById('p-pause'));
    const pauseSkip = box(document.getElementById('b-pause-skip'));
    const t = window.MDGameLive.tutorial();
    const round = (b) => b && !b.missing ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), bottom: Math.round(b.bottom) } : b;
    return {
      vw, vh,
      stage: round(stage), msg: round(msg), skip: round(skip), trial: round(trial), pause: round(pause), pauseSkip: round(pauseSkip),
      stageIn: inside(stage), msgIn: inside(msg), skipIn: inside(skip),
      msgCut: !!(msg && msg.scrollY > 2),
      coachStage: overlap(msg, { x: cr.x, y: cr.y, w: cr.width, h: cr.height }),
      skipStage: overlap(skip, { x: cr.x, y: cr.y, w: cr.width, h: cr.height }),
      trialChamber: trial.hidden ? 0 : overlap(trial, play),
      pauseIn: inside(pause), pauseSkipIn: inside(pauseSkip),
      pauseShown: document.getElementById('p-pause').classList.contains('show'),
      step: t.step, active: t.active, playMode: t.playMode, screen: t.screen,
    };
  })()`;
  const layoutRows = [];
  const layoutViews = [
    { name: '480x320', w: 480, h: 320 },
    { name: '568x320', w: 568, h: 320 },
    { name: '640x360', w: 640, h: 360 },
    { name: '667x375', w: 667, h: 375 },
    { name: '812x375', w: 812, h: 375 },
    { name: '320x568', w: 320, h: 568 },
    { name: '360x740', w: 360, h: 740 },
    { name: '390x844', w: 390, h: 844 },
    { name: '768x900', w: 768, h: 900 },
    { name: '1280x800', w: 1280, h: 800 },
  ];
  let layoutPreload = null;
  async function layoutBoot(view, theme, tutorials) {
    await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: view.w < 900 });
    if (layoutPreload) { try { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: layoutPreload }); } catch {} }
    const saved = { settings: { theme, tempScale2: true, wallHeat: 'preset' }, coins: 0, unlockedZ: 1, best: {}, tutorials: tutorials || { single: false, two: false, sort: false } };
    layoutPreload = (await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.removeItem('maxwells-demon.access');localStorage.setItem('maxwells-demon.v2', ${JSON.stringify(JSON.stringify(saved))});}catch(e){}`,
    })).identifier;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/play/maxwells-demon/?layout=${theme}-${view.name}` });
    for (let i = 0; i < 50; i++) {
      if (await evalJs('!!(window.MDGameLive && document.getElementById("b-begin"))')) return;
      await sleep(100);
    }
    throw new Error(`layout game did not start ${theme} ${view.name}`);
  }
  async function waitLayoutStep(n) {
    for (let i = 0; i < 70; i++) {
      const t = await evalJs('window.MDGameLive.tutorial()');
      if (t.active && t.step === n && t.coach) return t;
      await sleep(100);
    }
    return await evalJs('window.MDGameLive.tutorial()');
  }
  function layoutProblems(m, { pause = false } = {}) {
    const problems = [];
    if (pause) {
      if (!m.pauseShown) problems.push('pause panel hidden');
      if (!m.pauseIn) problems.push(`pause panel outside ${JSON.stringify(m.pause)}`);
      if (!m.pauseSkipIn) problems.push(`pause Skip outside ${JSON.stringify(m.pauseSkip)}`);
      return problems;
    }
    if (!m.stageIn) problems.push(`stage outside ${JSON.stringify(m.stage)}`);
    if (!m.msgIn) problems.push(`coach outside ${JSON.stringify(m.msg)}`);
    if (!m.skipIn) problems.push(`Skip outside ${JSON.stringify(m.skip)}`);
    if (m.msgCut) problems.push('coach text clipped');
    if (m.coachStage > 0) problems.push(`coach overlaps stage by ${m.coachStage}px`);
    if (m.skipStage > 0) problems.push(`Skip overlaps stage by ${m.skipStage}px`);
    if (m.trialChamber > 0) problems.push(`Trial label overlaps chamber by ${m.trialChamber}px`);
    return problems;
  }
  for (const view of layoutViews) {
    for (const theme of ['victorian', 'bw']) {
      await layoutBoot(view, theme);
      for (const mode of ['single', 'two', 'sort']) {
        if (mode === 'single') {
          await evalJs("document.getElementById('b-begin').click(); true");
          await sleep(120);
          await evalJs("document.getElementById('b-single').click(); true");
        } else {
          const locked = await evalJs(`(() => { const b = document.getElementById(${JSON.stringify(mode === 'two' ? 'b-two' : 'b-sort')}); b.click(); return document.getElementById('p-locked').classList.contains('show'); })()`);
          await sleep(150);
          if (locked) await evalJs("document.getElementById('lk-trial').click(); true");
        }
        for (let step = 0; step < 3; step++) {
          const got = await waitLayoutStep(step);
          if (!got.active || got.step !== step) {
            fail(`${view.name} ${theme} ${mode} did not reach step ${step}`);
            layoutRows.push({ view: view.name, theme, mode, step, fail: 'missing step' });
            break;
          }
          await sleep(250);
          const m = await evalJs(LAYOUT);
          const problems = layoutProblems(m);
          if (m.step !== step || m.playMode !== mode) problems.push(`measured step ${m.step} mode ${m.playMode}`);
          if (problems.length) fail(`${view.name} ${theme} ${mode} step ${step}: ${problems.join('; ')}`);
          layoutRows.push({ view: view.name, theme, mode, step, problems, stage: m.stage, msg: m.msg, skip: m.skip, trial: m.trial, coachStage: m.coachStage, skipStage: m.skipStage, trialChamber: m.trialChamber });
          await shot(`${theme}-${view.name}-${mode}-step${step}`);
          console.log('layout', view.name, theme, mode, 'step', step, problems.length ? 'FAIL' : 'ok');
          if (mode === 'single' && step === 0) {
            await evalJs("document.getElementById('b-pausebtn').click(); true");
            await sleep(200);
            const p = await evalJs(LAYOUT);
            const pp = layoutProblems(p, { pause: true });
            if (pp.length) fail(`${view.name} ${theme} pause: ${pp.join('; ')}`);
            layoutRows.push({ view: view.name, theme, mode: 'pause', step: 0, problems: pp, pause: p.pause, pauseSkip: p.pauseSkip });
            await shot(`${theme}-${view.name}-pause`);
            console.log('layout', view.name, theme, 'pause', pp.length ? 'FAIL' : 'ok');
            await evalJs("document.getElementById('b-resume').click(); true");
            await sleep(100);
          }
        }
        await evalJs("document.getElementById('b-pausebtn').click(); document.getElementById('b-end').click(); true");
        await sleep(200);
        if (mode !== 'sort') await evalJs("document.getElementById('b-over-title').click(); document.getElementById('b-begin').click(); true");
      }
    }
  }
  const STAGE = `(() => {
    const stageEl = document.getElementById('stage');
    const s = stageEl.getBoundingClientRect();
    const read = document.getElementById('sorting-readout');
    const rr = read.getBoundingClientRect();
    const chrome = read.querySelector(':scope > .vls-plaque__chrome-built');
    const t = window.MDGameLive.tutorial();
    const overlap = (a, b) => {
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return Math.round(Math.max(0, x) * Math.max(0, y));
    };
    const corner = document.elementFromPoint(s.left + 6, s.bottom - 6);
    const parse = (c) => (String(c).match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = (rgb) => rgb.slice(0, 3).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const opaque = (c) => { const p = parse(c); return p.length >= 3 && (p.length < 4 || p[3] > 0.05); };
    let bgNode = read;
    while (bgNode && !opaque(getComputedStyle(bgNode).backgroundColor)) bgNode = bgNode.parentElement;
    const plateBg = getComputedStyle(bgNode || read).backgroundColor;
    const label = read.querySelector('.vls-plaque__label') || read;
    const labelColor = getComputedStyle(label).color;
    const fg = parse(labelColor), bg = parse(plateBg);
    const L1 = lum(fg), L2 = lum(bg.length ? bg : [0, 0, 0]);
    const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return {
      width: s.width, height: s.height, top: s.top,
      inlineWidth: stageEl.style.width || '',
      screen: t.screen, active: !!t.active,
      readHidden: !!read.hidden,
      read: { x: rr.x, y: rr.y, w: rr.width, h: rr.height, right: rr.right, bottom: rr.bottom, left: rr.left, top: rr.top },
      stageBox: { left: s.left, top: s.top, right: s.right, bottom: s.bottom },
      plateStage: overlap(rr, s),
      cornerIsPlate: !!(corner && corner.closest && corner.closest('#sorting-readout, #instrument-dock')),
      cornerTag: corner ? (corner.id || corner.tagName) : '',
      screws: chrome ? chrome.querySelectorAll('circle').length : 0,
      plaque: read.classList.contains('vls-plaque'),
      color: labelColor, background: plateBg, contrast,
      theme: document.body.dataset.theme,
      vw: innerWidth, vh: innerHeight,
    };
  })()`;
  const fullSize = {
    '568x320': { w: 456, h: 310.1 },
    '667x375': { w: 551.5, h: 375 },
  };
  const wideSize = {
    '812x375': { w: 392, h: 266.6 },
    '1024x600': { w: 604, h: 410.7 },
    '1280x800': { w: 860, h: 584.8 },
  };
  function near(m, exp) {
    return Math.abs(m.width - exp.w) < 1.5 && Math.abs(m.height - exp.h) < 1.5 && !m.inlineWidth;
  }
  function plateProblems(m) {
    const problems = [];
    if (!near(m, fullSize[m.view])) problems.push(`stage ${m.width.toFixed(1)}x${m.height.toFixed(1)} top ${m.top.toFixed(1)} inline ${JSON.stringify(m.inlineWidth)}`);
    if (m.readHidden) problems.push('pressure readout hidden');
    else {
      if (m.read.bottom > m.vh + 1 || m.read.top < -1 || m.read.right > m.vw + 1 || m.read.left < -1) problems.push(`pressure outside ${JSON.stringify(m.read)}`);
      if (!(m.read.h > 20)) problems.push('pressure plate too small');
      if (!m.plaque || m.screws < 4) problems.push(`pressure is not an engraved plate (plaque ${m.plaque}, screws ${m.screws})`);
      if (m.plateStage > 0) problems.push(`pressure plate overlaps the stage by ${m.plateStage}px`);
      if (m.cornerIsPlate) problems.push(`chamber corner is the plate (${m.cornerTag})`);
    }
    return problems;
  }
  function readoutLegibility(m) {
    const problems = [];
    if (m.readHidden) return ['pressure readout hidden'];
    if (m.theme === 'bw') {
      if (!(m.contrast >= 7)) problems.push(`B&W label contrast ${Number(m.contrast).toFixed(2)} (${m.color} on ${m.background})`);
    } else if (!(/241,\s*236,\s*223/.test(m.background) && /42,\s*24,\s*3/.test(m.color))) {
      problems.push(`Victorian readout changed (${m.color} on ${m.background})`);
    }
    return problems;
  }
  async function cropShot(name, box) {
    const pad = 18;
    const clip = {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.w + pad * 2,
      height: box.h + pad * 2,
      scale: 3,
    };
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
    await writeFile(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  }
  async function gutterCrops(theme, when, m) {
    if (!m.read || m.readHidden) return;
    await cropShot(`${theme}-568x320-${when}-plate`, { x: m.read.x, y: m.read.y, w: m.read.w, h: m.read.h });
    await cropShot(`${theme}-568x320-${when}-corner`, { x: m.stageBox.left, y: m.stageBox.bottom - 90, w: 140, h: 100 });
  }
  async function settlePlate() {
    await evalJs('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
    for (let i = 0; i < 20; i++) {
      const n = await evalJs(`(() => { const r = document.getElementById('sorting-readout'); if (!r || r.hidden) return 0; const c = r.querySelector(':scope > .vls-plaque__chrome-built'); return c ? c.querySelectorAll('circle').length : 0; })()`);
      if (n >= 4) break;
      await sleep(80);
    }
    await sleep(400);
  }
  const restoreViews = [
    { name: '568x320', w: 568, h: 320 },
    { name: '667x375', w: 667, h: 375 },
  ];
  const shotViews = [
    ...restoreViews,
    { name: '320x568', w: 320, h: 568 },
    { name: '390x844', w: 390, h: 844 },
  ];
  for (const view of shotViews) {
    for (const theme of ['victorian', 'bw']) {
      await layoutBoot(view, theme);
      await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click(); true");
      await waitLayoutStep(0);
      await evalJs('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
      await sleep(400);
      const before = Object.assign({ view: view.name, theme, when: 'before-skip' }, await evalJs(STAGE));
      layoutRows.push(before);
      await shot(`${theme}-${view.name}-before-skip`);
      await evalJs("document.getElementById('b-skip-tutorial').click(); true");
      await settlePlate();
      const after = Object.assign({ view: view.name, theme, when: 'after-skip' }, await evalJs(STAGE));
      const afterProblems = fullSize[view.name] ? plateProblems(after) : (!after.inlineWidth ? [] : [`portrait stage still has inline width ${after.inlineWidth}`]);
      afterProblems.push(...readoutLegibility(after));
      if (afterProblems.length) fail(`${view.name} ${theme} after Skip: ${afterProblems.join('; ')}`);
      after.problems = afterProblems;
      layoutRows.push(after);
      await shot(`${theme}-${view.name}-after-skip`);
      if (view.name === '568x320') await gutterCrops(theme, 'after-skip', after);
      if (theme === 'bw' && (view.name === '320x568' || view.name === '390x844')) {
        await cropShot(`${theme}-${view.name}-after-skip-readout`, { x: after.read.x, y: after.read.y, w: after.read.w, h: after.read.h });
      }
      console.log('restore', view.name, theme, 'after-skip', afterProblems.length ? 'FAIL' : 'ok', after.width.toFixed(1), after.height.toFixed(1), 'top', after.top.toFixed(1));

      await layoutBoot(view, theme);
      await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click(); true");
      let finished = false;
      for (let i = 0; i < 110; i++) {
        const t = await evalJs('window.MDGameLive.tutorial()');
        if (!t.active && t.screen === 'playing' && t.seen && t.seen.single) { finished = true; break; }
        await sleep(200);
      }
      if (!finished) fail(`${view.name} ${theme} lesson did not finish`);
      await settlePlate();
      const done = Object.assign({ view: view.name, theme, when: 'after-finish' }, await evalJs(STAGE));
      const doneProblems = fullSize[view.name] ? plateProblems(done) : (!done.inlineWidth ? [] : [`portrait stage still has inline width ${done.inlineWidth}`]);
      if (doneProblems.length) fail(`${view.name} ${theme} after finish: ${doneProblems.join('; ')}`);
      done.problems = doneProblems;
      layoutRows.push(done);
      console.log('restore', view.name, theme, 'after-finish', doneProblems.length ? 'FAIL' : 'ok', done.width.toFixed(1), done.height.toFixed(1));

      await evalJs("document.getElementById('b-pausebtn').click(); true");
      await sleep(150);
      await evalJs("document.getElementById('b-pause-settings').click(); true");
      await sleep(200);
      await evalJs("document.getElementById('s-replay').click(); true");
      await waitLayoutStep(0);
      await evalJs("document.getElementById('b-skip-tutorial').click(); true");
      await settlePlate();
      const replay = Object.assign({ view: view.name, theme, when: 'replay-skip' }, await evalJs(STAGE));
      const replayProblems = fullSize[view.name] ? plateProblems(replay) : (!replay.inlineWidth ? [] : [`portrait stage still has inline width ${replay.inlineWidth}`]);
      if (replayProblems.length) fail(`${view.name} ${theme} after replay Skip: ${replayProblems.join('; ')}`);
      replay.problems = replayProblems;
      layoutRows.push(replay);
      console.log('restore', view.name, theme, 'replay-skip', replayProblems.length ? 'FAIL' : 'ok', replay.width.toFixed(1), replay.height.toFixed(1));

      await layoutBoot(view, theme, { single: true, two: true, sort: true });
      await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click(); true");
      for (let i = 0; i < 30; i++) {
        const t = await evalJs('window.MDGameLive.tutorial()');
        if (t.screen === 'playing' && !t.active) break;
        await sleep(80);
      }
      await settlePlate();
      const ordinary = Object.assign({ view: view.name, theme, when: 'ordinary-play' }, await evalJs(STAGE));
      const ordinaryProblems = fullSize[view.name] ? plateProblems(ordinary) : (!ordinary.inlineWidth ? [] : [`portrait stage still has inline width ${ordinary.inlineWidth}`]);
      ordinaryProblems.push(...readoutLegibility(ordinary));
      if (ordinary.active) ordinaryProblems.push('ordinary play started a lesson');
      if (ordinaryProblems.length) fail(`${view.name} ${theme} ordinary play: ${ordinaryProblems.join('; ')}`);
      ordinary.problems = ordinaryProblems;
      layoutRows.push(ordinary);
      await shot(`${theme}-${view.name}-ordinary-play`);
      if (view.name === '568x320') await gutterCrops(theme, 'ordinary-play', ordinary);
      if (theme === 'bw' && (view.name === '320x568' || view.name === '390x844')) {
        await cropShot(`${theme}-${view.name}-ordinary-play-readout`, { x: ordinary.read.x, y: ordinary.read.y, w: ordinary.read.w, h: ordinary.read.h });
      }
      console.log('restore', view.name, theme, 'ordinary', ordinaryProblems.length ? 'FAIL' : 'ok', ordinary.width.toFixed(1), ordinary.height.toFixed(1));
    }
  }
  for (const [name, exp] of Object.entries(wideSize)) {
    const [w, h] = name.split('x').map(Number);
    for (const theme of ['victorian', 'bw']) {
      await layoutBoot({ name, w, h }, theme, { single: true, two: true, sort: true });
      await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click(); true");
      for (let i = 0; i < 30; i++) {
        const t = await evalJs('window.MDGameLive.tutorial()');
        if (t.screen === 'playing' && !t.active) break;
        await sleep(80);
      }
      await settlePlate();
      const m = Object.assign({ view: name, theme, when: 'wide-ordinary' }, await evalJs(STAGE));
      const problems = [];
      if (m.inlineWidth) problems.push(`shortened with inline width ${m.inlineWidth}`);
      if (Math.abs(m.width - exp.w) > 2 || Math.abs(m.height - exp.h) > 2) problems.push(`stage ${m.width.toFixed(1)}x${m.height.toFixed(1)} expected ${exp.w}x${exp.h}`);
      if (problems.length) fail(`${name} ${theme} wide ordinary: ${problems.join('; ')}`);
      m.problems = problems;
      layoutRows.push(m);
      console.log('wide', name, theme, problems.length ? 'FAIL' : 'ok', m.width.toFixed(1), m.height.toFixed(1));
    }
  }

  const mainStage = {
    '480x320': { w: 368, h: 250.23 },
    '568x320': { w: 456, h: 310.08 },
    '640x360': { w: 528, h: 359.03 },
    '667x375': { w: 551.47, h: 374.98 },
    '812x375': { w: 392, h: 266.55 },
    '320x568': { w: 320, h: 217.59 },
    '360x740': { w: 360, h: 244.8 },
    '390x844': { w: 390, h: 265.19 },
    '768x900': { w: 768, h: 522.23 },
    '1024x600': { w: 604, h: 410.72 },
    '1280x800': { w: 860, h: 584.8 },
  };
  const matrixViews = Object.keys(mainStage).map((name) => {
    const [w, h] = name.split('x').map(Number);
    return { name, w, h };
  });
  const MATRIX = `(() => {
    const vw = innerWidth, vh = innerHeight;
    const stageEl = document.getElementById('stage');
    const s = stageEl.getBoundingClientRect();
    const canvas = document.getElementById('game').getBoundingClientRect();
    const sx = canvas.width / 1000, sy = canvas.height / 680;
    const sorting = document.body.classList.contains('sorting');
    const chamber = sorting
      ? { left: canvas.left + 60 * sx, top: canvas.top + 176 * sy, right: canvas.left + 940 * sx, bottom: canvas.top + 616 * sy }
      : { left: canvas.left + 60 * sx, top: canvas.top + 118 * sy, right: canvas.left + 940 * sx, bottom: canvas.top + 618 * sy };
    const overlap = (r, b) => {
      if (!r || r.width < 1 || r.height < 1) return 0;
      const x = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left));
      const y = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top));
      return Math.round(x * y);
    };
    const info = (id) => {
      const el = document.getElementById(id);
      if (!el) return { missing: true, hidden: true };
      const cs = getComputedStyle(el);
      const hidden = !!(el.hidden || cs.display === 'none' || cs.visibility === 'hidden');
      const r = el.getBoundingClientRect();
      return {
        hidden, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom,
        off: !hidden && (r.width < 1 || r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1),
        stage: hidden ? 0 : overlap(r, s),
        chamber: hidden ? 0 : overlap(r, chamber),
      };
    };
    const skip = document.getElementById('b-skip-tutorial');
    let skipHit = false;
    if (skip && !skip.hidden) {
      const r = skip.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      skipHit = !!(el && el.closest && el.closest('#b-skip-tutorial'));
    }
    const read = document.getElementById('sorting-readout');
    const label = read.querySelector('.vls-plaque__label') || read;
    const parse = (c) => (String(c).match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
    const lum = (rgb) => rgb.slice(0, 3).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const opaque = (c) => { const p = parse(c); return p.length >= 3 && (p.length < 4 || p[3] > 0.05); };
    let bgNode = read;
    while (bgNode && !opaque(getComputedStyle(bgNode).backgroundColor)) bgNode = bgNode.parentElement;
    const plateBg = getComputedStyle(bgNode || read).backgroundColor;
    const labelColor = getComputedStyle(label).color;
    const fg = parse(labelColor), bgc = parse(plateBg);
    const L1 = lum(fg), L2 = lum(bgc.length ? bgc : [0, 0, 0]);
    const chrome = read.querySelector(':scope > .vls-plaque__chrome-built');
    const t = window.MDGameLive.tutorial();
    return {
      width: s.width, height: s.height, inline: stageEl.style.width || '',
      active: !!t.active, screen: t.screen, playMode: t.playMode,
      paused: document.getElementById('p-pause').classList.contains('show'),
      controls: info('controls'), trial: info('trial-badge'), msg: info('instrument-message'),
      read: info('sorting-readout'), skip: info('b-skip-tutorial'), skipHit,
      contrast: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
      color: labelColor, background: plateBg,
      screws: chrome ? chrome.querySelectorAll('circle').length : 0,
      theme: document.body.dataset.theme,
    };
  })()`;
  function matrixProblems(m, kind) {
    const problems = [];
    const lesson = kind === 'lesson';
    if (!lesson) {
      const exp = mainStage[m.view];
      if (Math.abs(m.width - exp.w) > 0.8 || Math.abs(m.height - exp.h) > 0.8) problems.push(`stage ${m.width.toFixed(2)}x${m.height.toFixed(2)} expected ${exp.w}x${exp.h}`);
      if (m.inline) problems.push(`inline width ${m.inline}`);
    }
    const shown = (box, name, { stage = true, chamber = true } = {}) => {
      if (!box || box.missing || box.hidden) problems.push(`${name} hidden`);
      else if (box.off) problems.push(`${name} outside the viewport`);
      else {
        if (stage && box.stage > 0) problems.push(`${name} overlaps the stage by ${box.stage}px`);
        if (chamber && box.chamber > 0) problems.push(`${name} overlaps the chamber by ${box.chamber}px`);
      }
    };
    if (lesson) {
      shown(m.msg, 'coach');
      shown(m.skip, 'Skip');
      shown(m.read, 'readout', { stage: false });
      if (!m.skipHit) problems.push('Skip is not under elementFromPoint');
    } else if (!m.paused) {
      shown(m.read, 'readout');
      if (m.read && !m.read.hidden) {
        if (!(m.screws >= 4)) problems.push(`readout screws ${m.screws}`);
        if (m.theme === 'bw') {
          if (!(m.contrast >= 7)) problems.push(`B&W contrast ${Number(m.contrast).toFixed(2)}`);
        } else if (!(/241,\s*236,\s*223/.test(m.background) && /42,\s*24,\s*3/.test(m.color))) {
          problems.push(`Victorian plate ${m.color} on ${m.background}`);
        }
      }
      if (!m.controls || m.controls.hidden || m.controls.off) problems.push('controls off screen');
    }
    if (m.trial && !m.trial.hidden) shown(m.trial, 'trial');
    if (!lesson && m.msg && !m.msg.hidden) shown(m.msg, 'door help', { stage: false });
    return problems;
  }
  async function startPlaying(mode) {
    await evalJs(`(() => {
      if (document.getElementById('p-pause').classList.contains('show')) document.getElementById('b-end').click();
      if (document.getElementById('p-over').classList.contains('show')) document.getElementById('b-over-title').click();
      if (document.getElementById('p-title').classList.contains('show')) document.getElementById('b-begin').click();
      return true;
    })()`);
    await sleep(120);
    const id = mode === 'single' ? 'b-single' : mode === 'two' ? 'b-two' : 'b-sort';
    await evalJs(`document.getElementById(${JSON.stringify(id)}).click(); true`);
    await sleep(160);
    if (await evalJs(`document.getElementById('p-locked').classList.contains('show')`)) {
      await evalJs(`document.getElementById('lk-trial').click(); true`);
      await sleep(200);
    }
  }
  async function endPlaying() {
    const where = await evalJs(`(() => ({
      playing: document.body.classList.contains('playing'),
      pause: document.getElementById('p-pause').classList.contains('show'),
      over: document.getElementById('p-over').classList.contains('show'),
    }))()`);
    if (where.over || (!where.playing && !where.pause)) return;
    if (where.pause) await evalJs(`document.getElementById('b-end').click(); true`);
    else await evalJs(`document.getElementById('b-pausebtn').click(); document.getElementById('b-end').click(); true`);
    await sleep(150);
  }
  async function measureMatrix(view, theme, mode, kind) {
    if (kind === 'trial-pause') await sleep(120);
    else {
      await settlePlate();
      if (kind !== 'lesson' && await evalJs(`document.getElementById('p-over').classList.contains('show')`)) {
        await startPlaying(mode);
        await settlePlate();
      }
    }
    const m = Object.assign({ view: view.name, theme, mode, kind }, await evalJs(MATRIX));
    const problems = matrixProblems(m, kind === 'lesson' ? 'lesson' : 'play');
    if (kind !== 'lesson' && m.active) problems.push('lesson still active');
    if (kind === 'ordinary' && m.trial && !m.trial.hidden) problems.push('ordinary play showed a trial badge');
    if (kind === 'trial-pause' && (!m.trial || m.trial.hidden)) problems.push('trial badge hidden while paused');
    if (kind === 'sort-live' && (!m.msg || m.msg.hidden)) problems.push('sort door help was not showing');
    if (m.playMode && m.playMode !== mode && kind !== 'trial-pause') problems.push(`mode ${m.playMode}`);
    if (problems.length) fail(`${view.name} ${theme} ${mode} ${kind}: ${problems.join('; ')}`);
    m.problems = problems;
    layoutRows.push(m);
    console.log('matrix', view.name, theme, mode, kind, problems.length ? 'FAIL' : 'ok', m.width.toFixed(2), m.height.toFixed(2));
    return m;
  }
  const seenTutorials = { single: true, two: true, sort: true };
  for (const view of matrixViews) {
    for (const theme of ['victorian', 'bw']) {
      await layoutBoot(view, theme, seenTutorials);
      await startPlaying('single');
      await measureMatrix(view, theme, 'single', 'ordinary');
      await endPlaying();
      await evalJs('MDAccess.startTrial()');
      for (const mode of ['single', 'two', 'sort']) {
        await startPlaying(mode);
        await measureMatrix(view, theme, mode, mode === 'sort' ? 'sort-live' : 'trial');
        await evalJs(`document.getElementById('b-pausebtn').click(); true`);
        await sleep(180);
        await measureMatrix(view, theme, mode, 'trial-pause');
        await evalJs(`document.getElementById('b-resume').click(); true`);
        await sleep(80);
        await endPlaying();
      }
      for (const mode of ['single', 'two', 'sort']) {
        await layoutBoot(view, theme);
        await startPlaying(mode);
        await measureMatrix(view, theme, mode, 'lesson');
        await evalJs(`document.getElementById('b-skip-tutorial').click(); true`);
        await measureMatrix(view, theme, mode, 'after-skip');
        await evalJs(`document.getElementById('b-pausebtn').click(); true`);
        await sleep(100);
        await evalJs(`document.getElementById('b-pause-settings').click(); true`);
        await sleep(150);
        await evalJs(`document.getElementById('s-replay').click(); true`);
        await waitLayoutStep(0);
        await measureMatrix(view, theme, mode, 'lesson');
        await evalJs(`document.getElementById('b-skip-tutorial').click(); true`);
        await measureMatrix(view, theme, mode, 'replay-skip');
      }
      for (const mode of ['single', 'two', 'sort']) {
        await layoutBoot(view, theme);
        await startPlaying(mode);
        let finished = false;
        for (let i = 0; i < 100; i++) {
          const t = await evalJs('window.MDGameLive.tutorial()');
          if (!t.active && t.screen === 'playing' && t.seen && t.seen[mode]) { finished = true; break; }
          await sleep(200);
        }
        if (!finished) {
          const stalled = await evalJs(`(() => {
            const t = window.MDGameLive.tutorial();
            return {
              over: document.getElementById('p-over').classList.contains('show'),
              active: !!t.active,
              seen: !!(t.seen && t.seen[${JSON.stringify(mode)}]),
            };
          })()`);
          if (stalled.over) {
            if (stalled.active) await evalJs(`document.getElementById('b-skip-tutorial').click(); true`);
            await sleep(80);
            await startPlaying(mode);
            finished = true;
          }
        }
        if (!finished) fail(`${view.name} ${theme} ${mode} lesson did not finish`);
        await measureMatrix(view, theme, mode, 'finish');
      }
    }
  }
  await writeFile(`${OUT}/layout-measurements.json`, JSON.stringify(layoutRows, null, 2));
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
