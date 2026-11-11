/* Rendered chamber check: phone, desktop and landscape, both themes.
   Confirms L matches the drawn stage, fresh-run T follows L², and a resize
   does not reheat the gas already in play.
   Run: node tests/maxwell-crossing-browser.mjs [port]
   Writes screenshots under /opt/cursor/artifacts and a JSON readout beside them. */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { stat } from 'node:fs/promises';

const PORT = Number(process.argv[2] || 8767);
const CDP = 9342;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = '/opt/cursor/artifacts';
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
  `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/gl-chrome-maxwell', 'about:blank',
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
    const file = `${OUT}/${name}.png`;
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  };

  const views = [
    { name: 'phone-portrait', w: 390, h: 844, ppi: 160, source: 'phone' },
    { name: 'desktop-landscape', w: 1280, h: 800, ppi: 100, source: 'monitor' },
    { name: 'phone-landscape', w: 844, h: 390, ppi: 160, source: 'phone' },
  ];
  const themes = ['victorian', 'bw'];
  const readouts = [];

  let preloadId = null;
  async function boot(view, theme, extra = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: view.source === 'phone' });
    if (preloadId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadId });
    const saved = {
      settings: { theme, tempScale2: true, wallHeat: 'preset', ...(extra.settings || {}) },
      coins: 0, unlockedZ: 1, best: extra.best || {},
    };
    const added = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.MDTutorialEnabled=false;try{localStorage.setItem('maxwells-demon.v2', ${JSON.stringify(JSON.stringify(saved))});}catch(e){}`,
    });
    preloadId = added.identifier;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/play/maxwells-demon/?t=${theme}-${view.name}` });
    await sleep(400);
    for (let i = 0; i < 40; i++) {
      const ready = await evalJs('!!(window.MDGameLive && window.MDPhysics && window.MDScale)');
      if (ready) break;
      await sleep(100);
      if (i === 39) throw new Error('game did not start');
    }
    await evalJs(`MDScale.set(${view.ppi}, ${JSON.stringify(view.source)})`);
    const gutter = view.w > view.h ? (view.w > 720 ? 420 : 112) : 0;
    const expectCss = Math.min(Math.max(0, view.w - gutter), view.h * 1000 / 680);
    for (let i = 0; i < 30; i++) {
      const w = await evalJs("document.getElementById('game').getBoundingClientRect().width");
      if (Math.abs(w - expectCss) < 1.5) break;
      await evalJs('dispatchEvent(new Event("resize"))');
      await sleep(50);
      if (i === 29) throw new Error(`stage stayed ${w}, expected ${expectCss}`);
    }
    await sleep(50);
  }

  for (const theme of themes) {
    for (const view of views) {
      await boot(view, theme);
      await evalJs("document.getElementById('b-begin').click()");
      await evalJs("document.getElementById('b-single').click()");
      await evalJs('(async () => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()');
      await sleep(40);
      const sample = await evalJs(`(() => {
        const c = MDGameLive.crossing();
        const g = MDGameLive.gas();
        const box = document.getElementById('game').getBoundingClientRect();
        const H = MDPhysics.ELEMENTS[0];
        const free = g.filter((a) => a.v > 0);
        const a = free[0] || g[0];
        const vFromT = a ? Math.sqrt((3 * MDPhysics.K_B * a.T) / H.mass) : 0;
        return {
          theme: document.body.dataset.theme,
          font: getComputedStyle(document.body).fontFamily,
          scale: MDScale.describe(),
          cssPerInch: MDScale.cssPerInch,
          c, T: a ? a.T : 0, v: a ? a.v : 0, vFromT, free: free.length,
          canvas: { w: box.width, h: box.height },
          displayedTemperature: (MDGameLive.hudReadout && MDGameLive.hudReadout().scoreText) || '',
          canvasString: MDPhysics.formatT(a ? a.T : 0),
          roundedSummary: a ? MDPhysics.formatT(a.T, 2) : '',
          expectT: H.startT * c.factor,
        };
      })()`);
      const gutter = view.w > view.h ? (view.w > 720 ? 420 : 112) : 0;
      const cssW = Math.min(Math.max(0, view.w - gutter), view.h * 1000 / 680);
      const mpp = (cssW / 1000) * (0.0254 / view.ppi);
      const L = 880 * mpp;
      if (Math.abs(sample.canvas.w - cssW) > 2) fail(`${theme} ${view.name} canvas ${sample.canvas.w} != stage ${cssW}`);
      if (Math.abs(sample.c.L - L) / L > 0.01) fail(`${theme} ${view.name} L ${sample.c.L} != ${L}`);
      if (!sample.T) fail(`${theme} ${view.name} spawned no atom`);
      const T = sample.T;
      if (Math.abs(T - sample.expectT) / sample.expectT > 1e-6) fail(`${theme} ${view.name} T ${T} != ${sample.expectT}`);
      if (sample.free && Math.abs(sample.v - sample.vFromT) / sample.vFromT > 1e-6) fail(`${theme} ${view.name} speed ${sample.v} != √(3kT/m)`);
      if (sample.displayedTemperature !== sample.canvasString) fail(`${theme} ${view.name} HUD drew ${JSON.stringify(sample.displayedTemperature)}, not ${JSON.stringify(sample.canvasString)}`);
      if (sample.theme !== theme) fail(`${theme} ${view.name} theme is ${sample.theme}`);
      const t = sample.c.L / sample.vFromT;
      readouts.push({
        file: `maxwell-${view.name}-${theme}.png`,
        theme, view: view.name,
        viewportWidth: view.w, viewportHeight: view.h, viewport: `${view.w}x${view.h}`,
        calibrationCssPxPerInch: sample.cssPerInch, calibration: sample.scale,
        canvasCssWidth: sample.canvas.w, canvasCssHeight: sample.canvas.h,
        chamberWidthMm: sample.c.L * 1000,
        temperatureReadout: sample.displayedTemperature,
        displayedTemperature: sample.displayedTemperature,
        numericTemperatureNK: T * 1e9,
        roundedSummaryNotDisplayed: sample.roundedSummary,
        speedMmPerS: sample.vFromT * 1000, crossingTimeS: t,
        v_mm_s: sample.vFromT * 1000, t_s: t, hud: sample.hudT, font: sample.font, free: sample.free,
      });
      await shot(`maxwell-${view.name}-${theme}`);
      console.log(theme, view.name, 'L', (sample.c.L * 1000).toFixed(2), 'mm', 'displayed', JSON.stringify(sample.displayedTemperature), 't', t.toFixed(4), 's', sample.free ? 'free' : 'adsorbed');
    }
  }

  const times = readouts.filter((r) => r.theme === 'victorian').map((r) => r.t_s);
  if (Math.max(...times) - Math.min(...times) > 1e-4) fail(`crossing times differ ${times}`);

  await boot(views[0], 'victorian');
  await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click()");
  await sleep(200);
  const before = await evalJs(`({ T: MDGameLive.gas()[0].T, f: MDGameLive.crossing().runFactor, id: MDGameLive.gas()[0].z })`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await evalJs("MDScale.set(100, 'monitor'); dispatchEvent(new Event('resize'))");
  await sleep(200);
  const mid = await evalJs(`({ T: MDGameLive.gas()[0].T, f: MDGameLive.crossing().runFactor, screen: MDGameLive.crossing().factor })`);
  if (Math.abs(mid.T - before.T) / before.T > 1e-6) fail(`resize reheated the gas ${before.T} -> ${mid.T}`);
  if (Math.abs(mid.f - before.f) > 1e-12) fail('resize replaced the frozen run factor');
  if (!(mid.screen > mid.f * 2)) fail('the new screen factor did not move');
  await shot('maxwell-resize-same-run-desktop');
  await evalJs("document.getElementById('b-pausebtn').click()");
  await sleep(100);
  await evalJs("document.getElementById('b-end').click()");
  await sleep(100);
  await evalJs("document.getElementById('b-again').click()");
  await sleep(250);
  const after = await evalJs(`({ T: MDGameLive.gas()[0].T, f: MDGameLive.crossing().runFactor, hud: MDPhysics.formatT(MDGameLive.gas()[0].T) })`);
  if (Math.abs(after.T - before.T) / before.T < 0.2) fail('the next fresh run did not pick up the new width');
  if (Math.abs(after.f - mid.screen) / mid.screen > 1e-6) fail('fresh run factor is not the resized screen');
  await shot('maxwell-fresh-run-after-resize-desktop-victorian');
  console.log('resize hold', (before.T * 1e9).toFixed(3), 'nK ->', (mid.T * 1e9).toFixed(3), 'nK; next run', after.hud);
  const tinyViews = [];
  for (const theme of ['victorian', 'bw']) {
    await boot({ name: 'tiny-landscape', w: 400, h: 300, ppi: 100, source: 'monitor' }, theme);
    await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click();");
    await evalJs('(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()');
    await sleep(200);
    const lay = await evalJs(`(() => {
      const box = document.getElementById('game').getBoundingClientRect();
      const controls = [...document.querySelectorAll('#controls button')].map((el) => el.getBoundingClientRect());
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
      const overlaps = controls.filter((r) => hit(box, r)).length;
      const c = MDGameLive.crossing();
      return { theme: document.body.dataset.theme, canvasCssWidth: box.width, canvasCssHeight: box.height, chamberWidthMm: c.L * 1000, controlOverlaps: overlaps, displayedTemperature: MDGameLive.hudReadout().scoreText };
    })()`);
    if (lay.controlOverlaps) fail(`${theme} 400×300 controls overlap the chamber (${lay.controlOverlaps})`);
    if (!(lay.canvasCssWidth > 100 && lay.canvasCssWidth < 390)) fail(`${theme} 400×300 stage width ${lay.canvasCssWidth} is not kept clear of the controls`);
    tinyViews.push(lay);
    console.log('tiny', theme, lay.canvasCssWidth.toFixed(1), 'px, overlaps', lay.controlOverlaps);
  }
  const tiny = tinyViews[0];
  await boot({ name: 'desktop-landscape', w: 1280, h: 800, ppi: 100, source: 'monitor' }, 'victorian', { best: { 'single:1': 50e-9 } });
  await evalJs("document.getElementById('b-begin').click(); document.getElementById('b-single').click();");
  await sleep(150);
  await evalJs("document.getElementById('b-pausebtn').click();");
  await sleep(80);
  await evalJs("document.getElementById('b-end').click();");
  await sleep(150);
  const ended = await evalJs(`(() => {
    const panel = document.getElementById('p-over');
    const again = document.getElementById('b-again');
    const shopBtn = document.getElementById('b-over-shop');
    again.scrollIntoView({ block: 'end' });
    const pr = panel.getBoundingClientRect();
    const inside = (r) => r.top >= pr.top - 2 && r.bottom <= pr.bottom + 2 && r.height > 0;
    const saved = JSON.parse(localStorage.getItem('maxwells-demon.v2'));
    return {
      note: document.getElementById('over-note').textContent,
      stats: document.getElementById('over-stats').innerText,
      best: saved.best['single:1'],
      again: inside(again.getBoundingClientRect()),
      shop: inside(shopBtn.getBoundingClientRect()),
    };
  })()`);
  if (ended.best !== 50e-9) fail(`no-play end overwrote the 50 nK record with ${ended.best}`);
  if (!/No record/.test(ended.note)) fail(`end screen announced a record: ${ended.note}`);
  if (!/50\.0 nK/.test(ended.stats) || !/40\.0 nK/.test(ended.stats)) fail(`end screen labels missing reference comparison: ${ended.stats}`);
  if (!ended.again || !ended.shop) fail('end-screen actions are not reachable by scrolling');
  await evalJs("document.getElementById('b-over-shop').click();");
  await sleep(200);
  const shopBest = await evalJs(`document.querySelector('#shop-list tr.sel') ? document.querySelector('#shop-list tr.sel').innerText : ''`);
  if (!/50\.0 nK/.test(shopBest)) fail(`shop did not show the seeded reference best: ${shopBest}`);
  await boot({ name: 'desktop-landscape', w: 1280, h: 800, ppi: 100, source: 'monitor' }, 'victorian', { best: { 'single:1': 50e-9 } });
  await evalJs("document.getElementById('b-settings').click();");
  await sleep(100);
  await evalJs("document.getElementById('s-wall').value = '1'; document.getElementById('s-wall').dispatchEvent(new Event('input', { bubbles: true }));");
  await sleep(50);
  await evalJs("document.getElementById('s-close').click(); document.getElementById('b-begin').click(); document.getElementById('b-single').click();");
  let heated = null;
  for (let i = 0; i < 40; i++) {
    heated = await evalJs(`(() => {
      const over = document.getElementById('p-over').classList.contains('show');
      const g = MDGameLive.gas();
      const T = g.length ? g[0].T : 0;
      const saved = JSON.parse(localStorage.getItem('maxwells-demon.v2'));
      return { over, T, best: saved.best['single:1'], hud: MDGameLive.hudReadout().scoreText };
    })()`);
    if (heated.over || heated.T > 2e-7) break;
    await sleep(400);
  }
  if (!heated.over) {
    await evalJs("document.getElementById('b-pausebtn').click();");
    await sleep(50);
    await evalJs("document.getElementById('b-end').click();");
    await sleep(150);
    heated = await evalJs(`(() => { const saved = JSON.parse(localStorage.getItem('maxwells-demon.v2')); return { over: true, best: saved.best['single:1'], note: document.getElementById('over-note').textContent, stats: document.getElementById('over-stats').innerText }; })()`);
  } else {
    heated.note = await evalJs("document.getElementById('over-note').textContent");
    heated.stats = await evalJs("document.getElementById('over-stats').innerText");
  }
  if (!(heated.best > 50e-9)) fail(`heated run did not store a higher reference record (${heated.best})`);
  if (!/reference-chamber record/.test(heated.note || '')) fail(`heated run did not announce a reference record: ${heated.note}`);
  console.log('end-game path kept', ended.best, 'then stored', heated.best);
  const viewsOnly = readouts.filter((r) => r.temperatureReadout);
  await writeFile(`${OUT}/maxwell-crossing-readouts.json`, JSON.stringify({
    game: "Maxwell's Demon",
    mode: 'single',
    gas: 'hydrogen',
    note: 'displayedTemperature is the exact string drawn on the canvas (there is no DOM temperature node). numericTemperatureNK is the physical value. roundedSummaryNotDisplayed is formatT(T, 2) and is not the HUD string.',
    views: viewsOnly,
    smallLandscape: tinyViews,
    endGame: { seededBest: ended.best, heatedBest: heated.best, note: heated.note },
    resizeHold: { T_nK: before.T * 1e9, T_after_resize_nK: mid.T * 1e9, freshRunReadout: after.hud, fresh_nK: after.T * 1e9 },
    failures,
  }, null, 2));
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
  server.close();
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('browser ok');
