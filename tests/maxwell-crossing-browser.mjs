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
  async function boot(view, theme) {
    await send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: view.source === 'phone' });
    if (preloadId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preloadId });
    const added = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.setItem('maxwells-demon.v2', JSON.stringify({settings:{theme:${JSON.stringify(theme)}}}));}catch(e){}`,
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
    const gutter = view.w > view.h && view.w > 720 ? 420 : 0;
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
      const gutter = view.w > view.h && view.w > 720 ? 420 : 0;
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
  await boot({ name: 'tiny-landscape', w: 400, h: 300, ppi: 100, source: 'monitor' }, 'victorian');
  const tiny = await evalJs(`(() => {
    const box = document.getElementById('game').getBoundingClientRect();
    const c = MDGameLive.crossing();
    return { viewportWidth: 400, viewportHeight: 300, canvasCssWidth: box.width, canvasCssHeight: box.height, chamberWidthMm: c.L * 1000 };
  })()`);
  if (!(tiny.canvasCssWidth > 100)) fail(`400×300 landscape stage collapsed to ${tiny.canvasCssWidth}`);
  const tinyExpect = 880 * (tiny.canvasCssWidth / 1000) * (0.0254 / 100) * 1000;
  if (Math.abs(tiny.chamberWidthMm - tinyExpect) / tinyExpect > 0.02) fail(`400×300 chamber ${tiny.chamberWidthMm} mm is not the drawn width`);
  console.log('tiny landscape', tiny.canvasCssWidth.toFixed(1), 'css px, L', tiny.chamberWidthMm.toFixed(2), 'mm');
  const viewsOnly = readouts.filter((r) => r.temperatureReadout);
  await writeFile(`${OUT}/maxwell-crossing-readouts.json`, JSON.stringify({
    game: "Maxwell's Demon",
    mode: 'single',
    gas: 'hydrogen',
    note: 'displayedTemperature is the exact string drawn on the canvas (there is no DOM temperature node). numericTemperatureNK is the physical value. roundedSummaryNotDisplayed is formatT(T, 2) and is not the HUD string.',
    views: viewsOnly,
    smallLandscape: tiny,
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
