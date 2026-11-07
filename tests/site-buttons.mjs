/* Shared button regression: brass .btn stays engraved, labels stay inside the
   bevel, and ivory is not stamped onto buttons (that rotated ::before through
   the label). Ivory plaques keep procedural ivory and Old Standard TT.
   Run: node tests/site-buttons.mjs [baseUrl]  (default http://127.0.0.1:8765) */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8765';
const OUT = process.argv[3] || '/tmp/gl-buttons';
const PORT = 9341;
const ROUTES = ['/', '/about/', '/games/maxwells-demon/', '/games/vacuum-maze/', '/games/fantastic-apparatus/', '/notebook/', '/404.html'];
const WIDTHS = [320, 360, 390, 393, 1280];

await mkdir(OUT, { recursive: true });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/gl-chrome-buttons', 'about:blank',
], { stdio: 'ignore' });

const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

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
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('CSS.enable');

  const probe = `(() => {
    const buttons = [...document.querySelectorAll('.btn')].map((el) => {
      const br = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      const bevel = parseFloat(getComputedStyle(el).getPropertyValue('--gl-bevel-ring')) || 0;
      const before = getComputedStyle(el, '::before');
      const cs = getComputedStyle(el);
      const clear = {
        left: tr.width ? +(tr.left - (br.left + bevel)).toFixed(2) : null,
        right: tr.width ? +((br.right - bevel) - tr.right).toFixed(2) : null,
        top: tr.height ? +(tr.top - (br.top + bevel)).toFixed(2) : null,
        bottom: tr.height ? +((br.bottom - bevel) - tr.bottom).toFixed(2) : null,
      };
      return {
        text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        className: el.className,
        ivory: el.getAttribute('data-vls-ivory'),
        vlsIvoryClass: el.classList.contains('vls-ivory'),
        font: cs.fontFamily,
        bg: cs.backgroundImage.slice(0, 80),
        beforeTransform: before.transform,
        beforeDisplay: before.display,
        beforeW: before.width,
        beforeH: before.height,
        clear,
        inside: clear.left == null || Object.values(clear).every((n) => n >= -0.5),
        store: el.classList.contains('store') || el.classList.contains('soon'),
      };
    });
    const plaques = [...document.querySelectorAll('.vls-plaque--ivory')].slice(0, 4).map((el) => {
      const cs = getComputedStyle(el);
      return {
        className: el.className.slice(0, 80),
        ivory: el.getAttribute('data-vls-ivory'),
        vlsIvoryClass: el.classList.contains('vls-ivory'),
        font: cs.fontFamily.split(',')[0],
        ready: el.getAttribute('data-vls-ivory-ready'),
      };
    });
    return { buttons, plaques, nPlaques: document.querySelectorAll('.vls-plaque--ivory').length };
  })()`;

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const height = width >= 1000 ? 900 : 900;
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: width < 800,
      });
      await send('Page.navigate', { url: BASE + route });
      for (let i = 0; i < 40; i++) {
        const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
        if (r.result.value === 'complete') break;
        await sleep(50);
      }
      await send('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready', awaitPromise: true, returnByValue: true });
      await sleep(450);
      const ev = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
      const data = ev.result.value;
      const tag = `${width} ${route}`;
      if (!data) { fail(tag + ' probe failed'); continue; }
      for (const b of data.buttons) {
        const where = `${tag} "${b.text}" .${b.className}`;
        if (b.vlsIvoryClass || b.ivory) fail(where + ' has ivory stamp ' + b.ivory);
        if (b.beforeTransform && b.beforeTransform !== 'none') fail(where + ' ::before transform ' + b.beforeTransform);
        if (!b.inside) fail(where + ' label outside face ' + JSON.stringify(b.clear));
        if (!b.store) {
          if (!b.font.includes('VLS Engraving CC')) fail(where + ' font ' + b.font);
          if (b.beforeDisplay !== 'none' && b.bg === 'none') fail(where + ' missing brass face');
        }
      }
      for (const p of data.plaques) {
        if (!p.ivory) fail(tag + ' ivory plaque missing data-vls-ivory ' + p.className);
        if (!p.vlsIvoryClass) fail(tag + ' ivory plaque missing .vls-ivory ' + p.className);
        if (!p.font.includes('Old Standard') && !p.font.includes('VLS Old Standard')) {
          /* brass section labels are engraved; ivory plates are Old Standard */
          if (p.className.includes('plaque--ivory') && !p.className.includes('plaque--brass')) {
            fail(tag + ' ivory plaque font ' + p.font + ' ' + p.className);
          }
        }
      }
      if (route === '/') {
        const cards = await send('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const hero = document.querySelector('.hero');
            const rows = [...document.querySelectorAll('.cardbody .row')].map((row) =>
              [...row.querySelectorAll('.btn')].map((el) => {
                const r = el.getBoundingClientRect();
                return { t: el.innerText.replace(/\\s+/g, ' ').trim(), x: r.x, y: r.y };
              }));
            return {
              eyebrow: !!document.querySelector('.hero .eyebrow'),
              hero: hero ? hero.innerText.replace(/\\s+/g, ' ').trim().slice(0, 48) : '',
              overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              rows,
            };
          })()`,
        });
        const c = cards.result.value;
        if (!c) fail(tag + ' card probe failed');
        else {
          if (c.eyebrow || /Gillund.s Laboratory/.test(c.hero)) fail(tag + ' hero still shows the plaque title: ' + c.hero);
          if (c.overflow) fail(tag + ' homepage overflows horizontally');
          if (c.rows.length !== 3) fail(tag + ' expected 3 card pairs, got ' + c.rows.length);
          for (const row of c.rows) {
            if (row.length !== 2 || Math.abs(row[0].y - row[1].y) > 1 || !(row[1].x > row[0].x)) {
              fail(tag + ' Play/Details not side by side ' + JSON.stringify(row));
            }
          }
        }
      }
      if (width === 390 || width === 1280) {
        const shot = await send('Page.captureScreenshot', {
          format: 'png', clip: { x: 0, y: 0, width, height: Math.min(height, width >= 1000 ? 720 : 820), scale: 1 },
        });
        const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
        await writeFile(`${OUT}/${width}-${name}.png`, Buffer.from(shot.data, 'base64'));
      }
      console.log('ok', tag, 'buttons', data.buttons.length, 'plaques', data.nPlaques);
    }
  }

  /* Hover and keyboard focus on the first action button of home and about. */
  for (const route of ['/', '/about/', '/games/maxwells-demon/']) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: BASE + route });
    for (let i = 0; i < 30; i++) {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r.result.value === 'complete') break;
      await sleep(40);
    }
    await sleep(400);
    const doc = await send('DOM.getDocument', { depth: 0 });
    const found = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'a.btn, button.btn' });
    if (!found.nodeId) { fail(route + ' no button to hover'); continue; }
    await send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: ['hover'] });
    const hover = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const el = document.querySelector('a.btn, button.btn'); const s = getComputedStyle(el); return { filter: s.filter, font: s.fontFamily.split(',')[0], transform: getComputedStyle(el, '::before').transform }; })()`,
    });
    const h = hover.result.value;
    if (h.transform !== 'none') fail(route + ' hover rotated ::before ' + h.transform);
    if (!h.font.includes('Engraving')) fail(route + ' hover font ' + h.font);
    await send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: [] });
    console.log('hover ok', route, h.filter);
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 860, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(600);
  for (let n = 0; n < 16; n++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(30);
    const ev = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const el = document.activeElement; if (!el || !el.classList || !el.classList.contains('btn')) return null; return { text: el.innerText.trim().slice(0,40), focus: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle, transform: getComputedStyle(el,'::before').transform, ivory: el.classList.contains('vls-ivory') }; })()`,
    });
    if (ev.result.value && ev.result.value.text) {
      const f = ev.result.value;
      if (!f.focus || f.outline !== 'solid') fail('home focus ' + JSON.stringify(f));
      if (f.transform !== 'none' || f.ivory) fail('home focus collision ' + JSON.stringify(f));
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 390, height: 780, scale: 1 } });
      await writeFile(`${OUT}/390-home-focus.png`, Buffer.from(shot.data, 'base64'));
      console.log('focus ok', f.text);
      break;
    }
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
}

if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
