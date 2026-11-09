/* Vacuum Maze notebook: one scrollable book (contents jump to a page) and no analogy Post-its.
   The technical pages, simplification notes, citations, and unlock save stay.
   Run: node tests/vacuum-notebook.mjs [baseUrl] */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.argv[2] || 'http://127.0.0.1:8767';
const PORT = 9362;
const root = new URL('../', import.meta.url);
const play = readFileSync(new URL('../play/vacuum-maze/index.html', import.meta.url), 'utf8');
const site = readFileSync(new URL('../notebook/vacuum-maze/index.html', import.meta.url), 'utf8');
const failures = [];
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

const analogyFields = play.split('\n').filter((l) => /^\s*analogy:/.test(l) && !l.includes("analogy: 'Analogy'"));
if (analogyFields.length) fail('play notebook still has ' + analogyFields.length + ' analogy fields');
if (play.includes("slip('analogy'")) fail('play notebook still renders analogy slips');
if ((site.match(/vls-analogy/g) || []).length) fail('site notebook still has analogy Post-its');
for (const kept of [
  'g·sin θ',
  'The game is flat (2D)',
  'Jousten (2016), ch. 7 (oil-sealed rotary pumps)',
  'W. Becker',
  'Knudsen',
  'Clausing',
]) {
  if (!play.includes(kept)) fail('play lost technical text: ' + kept);
  if (!site.includes(kept)) fail('site notebook lost technical text: ' + kept);
}
if ((site.match(/vls-simplification/g) || []).length < 16) fail('site simplification notes dropped');
if (!play.includes('function renderNotebook') || !play.includes('scrollIntoView')) fail('scrollable book navigation missing');
if (!play.includes('id="nb-body" class="vls-notebook scrollable"')) fail('notebook scroller missing');
if (/tea tray|tennis player swatting|revolving door with sliding panels|lumpy, slightly soft wall/.test(play + site)) fail('analogy sentence still published');
if (/SK\['scale'\]/.test(play) || /SK\['part-blank'\]/.test(play)) fail('a flange sketch is still overridden');
if (play.includes('hatchPoly') || /\.hatch\(/.test(play)) fail('notebook still has hatch drawing');
{
  const p9 = site.slice(site.indexOf('id="p9"'), site.indexOf('id="p10"'));
  const fig = p9.slice(p9.indexOf('<figure'), p9.indexOf('</figure>'));
  if (!fig.includes('2 mm copper') || !fig.includes('M6') || !fig.includes('5×') || !fig.includes('data-inset="seal"') || fig.includes('knife-edge') || fig.includes('bore (vacuum)')) fail('site notebook still shows the old flange figure');
}

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/vac-nb-test', 'about:blank',
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
  });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
    return r.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');

  const save = {
    settings: { theme: 'victorian', plainNotebook: false },
    notebook: { tilt: true, cosine: true, accommodation: true, walltemp: true, flight: true, clausing: true, scale: true, mfp: true, 'pump-rotary': true, 'pump-turbo': true },
    notebookNew: { cosine: true },
    best: { '1|earth': { time: 42.5, stars: 2 } },
    coins: 3, paidCoins: 0, owned: [1], cleared: {}, parts: {}, pumpsSeen: { rotary: true },
  };

  async function boot(w, h) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await send('Page.navigate', { url: BASE + '/play/vacuum-maze/' });
    for (let i = 0; i < 40; i++) { if (await ev('!!document.getElementById("b-notebook")')) break; await sleep(150); }
    await ev(`localStorage.setItem('vacuum-maze.v2', ${JSON.stringify(JSON.stringify(save))}); true`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 40; i++) { if (await ev('!!document.getElementById("b-notebook") && document.readyState==="complete"')) break; await sleep(150); }
    await ev(`document.querySelector('#b-notebook').click(); true`);
    await sleep(250);
  }

  await boot(1280, 800);
  const opened = await ev(`(() => {
    const book = document.getElementById('nb-body');
    const pages = [...book.querySelectorAll('.vls-page')];
    const links = [...book.querySelectorAll('a[data-entry]')];
    const orphans = links.filter((a) => !document.getElementById('note-' + a.dataset.entry));
    const empty = pages.filter((p) => !p.querySelector('h2') || (p.innerText || '').trim().length < 12);
    const tilt = document.getElementById('note-tilt');
    const close = document.getElementById('b-nb-back').getBoundingClientRect();
    return {
      analogies: document.querySelectorAll('.vls-analogy').length,
      tea: book.innerText.includes('tea tray'),
      pages: pages.length,
      links: links.length,
      orphans: orphans.map((a) => a.dataset.entry),
      empty: empty.map((p) => p.id),
      simplifications: book.querySelectorAll('.vls-simplification').length,
      tiltBody: !!(tilt && tilt.innerText.includes('g') && tilt.innerText.includes('sin')),
      tiltSlip: !!(tilt && tilt.querySelector('.vls-simplification')),
      accuracy: !!document.getElementById('note-accuracy'),
      scrollable: book.classList.contains('scrollable'),
      taller: book.scrollHeight > book.clientHeight + 40,
      closeInView: close.top >= 0 && close.bottom <= innerHeight && close.width >= 44,
      best: JSON.parse(localStorage.getItem('vacuum-maze.v2')).best['1|earth'].time,
    };
  })()`);
  console.log('desktop open', JSON.stringify(opened));
  if (opened.analogies) fail('analogy Post-it rendered');
  if (opened.tea) fail('analogy sentence rendered');
  if (opened.pages < 8) fail('expected the book of pages, got ' + opened.pages);
  if (opened.orphans.length) fail('orphan contents links ' + opened.orphans.join(','));
  if (opened.empty.length) fail('empty notebook cards ' + opened.empty.join(','));
  if (!opened.tiltBody || !opened.tiltSlip) fail('tilt technical note missing');
  if (opened.simplifications < 1) fail('simplification notes missing');
  if (!opened.accuracy) fail('accuracy notes missing');
  if (!opened.scrollable || !opened.taller) fail('book does not scroll');
  if (!opened.closeInView) fail('close control not on screen');
  if (opened.best !== 42.5) fail('best rewritten on open');

  async function flangeSvg() {
    return ev(`(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const page = document.getElementById('note-scale');
      const svg = page && page.querySelector('svg.vm-sketch');
      if (!svg) return { present: false };
      const text = svg.textContent || '';
      const ctm = svg.getScreenCTM();
      const clipEl = svg.querySelector('clipPath rect');
      const clip = clipEl ? { x: +clipEl.getAttribute('x'), y: +clipEl.getAttribute('y'), w: +clipEl.getAttribute('width'), h: +clipEl.getAttribute('height') } : null;
      const vb = svg.viewBox.baseVal;
      const view = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
      const cut = (a, b) => {
        if (!b) return a;
        const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
        const r = Math.min(a.x + a.w, b.x + b.w), bot = Math.min(a.y + a.h, b.y + b.h);
        return r < x || bot < y ? null : { x, y, w: r - x, h: bot - y };
      };
      const toScreen = (box) => {
        const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(([x, y]) => {
          const sp = svg.createSVGPoint(); sp.x = x; sp.y = y; return sp.matrixTransform(ctm);
        });
        return {
          l: Math.min(...corners.map((p) => p.x)), r: Math.max(...corners.map((p) => p.x)),
          t: Math.min(...corners.map((p) => p.y)), b: Math.max(...corners.map((p) => p.y)),
        };
      };
      const labels = [...svg.querySelectorAll('text')].map((node) => {
        const id = node.getAttribute('data-k');
        const lead = svg.querySelector('path[data-lead="' + id + '"]');
        const tr = node.getBoundingClientRect();
        const sr = svg.getBoundingClientRect();
        const R = { l: tr.left - 2, r: tr.right + 2, t: tr.top - 2, b: tr.bottom + 2 };
        const overlaps = (box) => box && R.l <= box.r && R.r >= box.l && R.t <= box.b && R.b >= box.t;
        let hit = false;
        if (ctm) {
          for (const path of svg.querySelectorAll('path, circle')) {
            if (path.getAttribute('data-lead') === id) continue;
            const region = path.closest('[data-inset]') && clip ? cut(view, clip) : view;
            if (path.tagName === 'circle') {
              const sp = svg.createSVGPoint();
              sp.x = +path.getAttribute('cx'); sp.y = +path.getAttribute('cy');
              if (region && (sp.x < region.x || sp.x > region.x + region.w || sp.y < region.y || sp.y > region.y + region.h)) continue;
              const s = sp.matrixTransform(ctm);
              if (s.x >= R.l && s.x <= R.r && s.y >= R.t && s.y <= R.b) { hit = true; break; }
              continue;
            }
            let bb = null;
            try { bb = path.getBBox(); } catch (e) { bb = null; }
            const painted = bb ? cut({ x: bb.x, y: bb.y, w: bb.width, h: bb.height }, region) : null;
            if (painted && overlaps(toScreen(painted))) { hit = true; break; }
            const len = path.getTotalLength ? path.getTotalLength() : 0;
            const step = Math.max(1.2, len / 70);
            for (let d = 0; d <= len; d += step) {
              const pt = path.getPointAtLength(d);
              if (region && (pt.x < region.x || pt.x > region.x + region.w || pt.y < region.y || pt.y > region.y + region.h)) continue;
              const sp = svg.createSVGPoint();
              sp.x = pt.x; sp.y = pt.y;
              const s = sp.matrixTransform(ctm);
              if (s.x >= R.l && s.x <= R.r && s.y >= R.t && s.y <= R.b) { hit = true; break; }
            }
            if (hit) break;
          }
        }
        return {
          t: node.textContent,
          lead: !!lead,
          inside: tr.width > 0 && tr.left >= sr.left - 1 && tr.right <= sr.right + 1 && tr.top >= sr.top - 1 && tr.bottom <= sr.bottom + 1,
          hit,
        };
      });
      const calloutPaths = [...svg.querySelectorAll('[data-callout]')];
      let joint = -Infinity;
      for (const path of svg.querySelectorAll('path')) {
        if (path.closest('[data-inset]') || path.hasAttribute('data-callout') || path.hasAttribute('data-lead')) continue;
        let bb = null;
        try { bb = path.getBBox(); } catch (e) { bb = null; }
        if (!bb) continue;
        if (clip && bb.height > clip.h * 0.75 && bb.y > clip.y - 6) continue;
        joint = Math.max(joint, bb.y + bb.height);
      }
      const top = clip ? clip.y - 1 : null;
      let low = Infinity, high = -Infinity, outside = 0;
      for (const path of calloutPaths) {
        const len = path.getTotalLength();
        const step = Math.max(1, len / 40);
        for (let d = 0; d <= len; d += step) {
          const pt = path.getPointAtLength(d);
          low = Math.min(low, pt.y); high = Math.max(high, pt.y);
          if (top == null || pt.y < joint - 1.5 || pt.y > top + 1.5) outside++;
        }
      }
      return {
        present: true,
        paths: svg.querySelectorAll('path').length,
        inset: !!svg.querySelector('[data-inset="seal"]'),
        five: text.includes('5×'),
        fiveLead: labels.some((l) => l.t === '5×' && l.lead),
        copper: text.includes('2 mm copper'),
        knife: text.includes('20° knife'),
        bolt: text.includes('M6'),
        bore: labels.some((l) => l.t === 'bore'),
        flange: labels.some((l) => l.t === 'flange'),
        leaders: labels.filter((l) => l.t !== '5×').every((l) => l.lead),
        clipped: labels.filter((l) => !l.inside).map((l) => l.t),
        hits: labels.filter((l) => l.hit).map((l) => l.t),
        callout: { n: calloutPaths.length, low: Number.isFinite(low) ? +low.toFixed(1) : null, high: Number.isFinite(high) ? +high.toFixed(1) : null, joint: Number.isFinite(joint) ? +joint.toFixed(1) : null, top, outside },
        old: ['knife-edge', 'copper gasket', 'bore (vacuum)', '2¾'].filter((s) => text.includes(s)),
      };
    })()`);
  }
  const flange = await flangeSvg();
  console.log('flange svg', JSON.stringify(flange));
  if (!flange.present || !flange.copper || !flange.knife || !flange.bolt || !flange.bore || !flange.flange || !flange.five) fail('rendered flange sketch is not the DN40 drawing ' + JSON.stringify(flange));
  if (!flange.inset) fail('flange sketch has no enlarged seal inset');
  if (!flange.leaders) fail('a flange label has no leader line');
  if (flange.fiveLead) fail('5× still has a leader');
  if (!flange.callout || flange.callout.n < 2 || flange.callout.outside) fail('callout leaves the gap under the joint ' + JSON.stringify(flange.callout));
  if (flange.old.length) fail('old flange labels still rendered ' + flange.old.join(','));
  if (flange.paths > 180) fail('rendered flange sketch still has hatch paths ' + flange.paths);
  if (flange.clipped.length) fail('flange labels clipped on desktop ' + flange.clipped.join(','));
  if (flange.hits.length) fail('flange labels touch the drawing on desktop ' + flange.hits.join(','));

  const jumped = await ev(`(() => {
    const book = document.getElementById('nb-body');
    const before = book.scrollTop;
    document.querySelector('a[data-entry="clausing"]').click();
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const page = document.getElementById('note-clausing');
        const gap = page.getBoundingClientRect().top - book.getBoundingClientRect().top;
        if (Math.abs(gap) < 24 || performance.now() - start > 4000) {
          resolve({ before, after: book.scrollTop, pageTop: gap, text: page.innerText.includes('Clausing') });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  })()`);
  console.log('jump', JSON.stringify(jumped));
  if (!(jumped.after > jumped.before + 40)) fail('contents link did not scroll');
  if (Math.abs(jumped.pageTop) > 24) fail('landed ' + jumped.pageTop + ' px off the Clausing page');
  if (!jumped.text) fail('Clausing page lost its text');

  await ev(`document.querySelector('#b-nb-toc').click(); true`);
  const back = await ev(`(() => new Promise((resolve) => {
    const book = document.getElementById('nb-body');
    const start = performance.now();
    const tick = () => {
      const page = document.getElementById('note-contents');
      const top = page.getBoundingClientRect().top - book.getBoundingClientRect().top;
      if (Math.abs(top) < 24 || performance.now() - start > 4000) resolve({ top, scroll: book.scrollTop });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }))()`);
  if (Math.abs(back.top) > 24) fail('Contents did not return to the top of the book');

  await ev(`document.querySelector('#b-nb-acc').click(); true`);
  const acc = await ev(`(() => new Promise((resolve) => {
    const book = document.getElementById('nb-body');
    const start = performance.now();
    const tick = () => {
      const page = document.getElementById('note-accuracy');
      const top = page.getBoundingClientRect().top - book.getBoundingClientRect().top;
      if (Math.abs(top) < 24 || performance.now() - start > 4000) resolve({ top, hasList: !!page.querySelector('li') });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }))()`);
  if (Math.abs(acc.top) > 24 || !acc.hasList) fail('Accuracy notes did not scroll into place');

  const keys = await ev(`(() => new Promise((resolve) => {
    const book = document.getElementById('nb-body');
    book.scrollTop = 0;
    book.focus();
    const top = book.scrollTop;
    book.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', bubbles: true, cancelable: true }));
    const start = performance.now();
    const tick = () => {
      if (book.scrollTop > top + 20 || performance.now() - start > 800) {
        resolve({ top, after: book.scrollTop, active: document.activeElement && document.activeElement.id });
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }))()`);
  const afterKey = keys.after;
  console.log('arrow', JSON.stringify(keys), afterKey);
  if (keys.active !== 'nb-body') fail('book did not take keyboard focus');
  if (!(afterKey > keys.top + 8)) fail('ArrowDown did not scroll the book');

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(80);
  const closed = await ev(`document.getElementById('p-notebook').classList.contains('show')`);
  if (closed) fail('Escape left the notebook open');
  const bestAfter = await ev(`JSON.parse(localStorage.getItem('vacuum-maze.v2')).best['1|earth'].time`);
  if (bestAfter !== 42.5) fail('best changed after navigation');

  for (const w of [320, 360, 390, 1280]) {
    for (const theme of ['victorian', 'bw']) {
      save.settings.theme = theme;
      await boot(w, w >= 800 ? 800 : w === 390 ? 844 : 640);
      const narrow = await flangeSvg();
      console.log('flange', w, theme, JSON.stringify({ clipped: narrow.clipped, hits: narrow.hits, callout: narrow.callout }));
      if (!narrow.inset || !narrow.leaders || !narrow.copper || !narrow.five) fail(w + ' px flange sketch incomplete ' + theme);
      if (narrow.fiveLead) fail('5× still has a leader at ' + w + ' ' + theme);
      if (narrow.clipped && narrow.clipped.length) fail('flange labels clipped at ' + w + ' ' + theme + ' ' + narrow.clipped.join(','));
      if (narrow.hits && narrow.hits.length) fail('flange labels touch the drawing at ' + w + ' ' + theme + ' ' + narrow.hits.join(','));
      if (!narrow.callout || narrow.callout.n < 2 || narrow.callout.outside) fail('callout leaves the gap under the joint at ' + w + ' ' + theme + ' ' + JSON.stringify(narrow.callout));
    }
  }
  save.settings.theme = 'victorian';

  await boot(390, 844);
  const phone = await ev(`(() => {
    const book = document.getElementById('nb-body');
    const close = document.getElementById('b-nb-back').getBoundingClientRect();
    const link = document.querySelector('a[data-entry="pump-turbo"]');
    link.click();
    return new Promise((resolve) => {
      const start = performance.now();
      const tick = () => {
        const page = document.getElementById('note-pump-turbo');
        const pageTop = page.getBoundingClientRect().top - book.getBoundingClientRect().top;
        if (Math.abs(pageTop) < 28 || performance.now() - start > 4000) {
          resolve({
            taller: book.scrollHeight > book.clientHeight + 40,
            closeInView: close.bottom <= innerHeight && close.top >= 0,
            pageTop,
            analogies: document.querySelectorAll('.vls-analogy').length,
            touch: getComputedStyle(book).touchAction,
          });
        } else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  })()`);
  console.log('phone', JSON.stringify(phone));
  if (!phone.taller || !phone.closeInView) fail('phone book is not a fixed-bar scroller');
  if (Math.abs(phone.pageTop) > 28) fail('phone link missed the turbo page');
  if (phone.analogies) fail('phone still shows an analogy Post-it');
  if (phone.touch !== 'pan-y') fail('phone touch-action ' + phone.touch);

  save.settings.theme = 'bw';
  await boot(390, 844);
  const bw = await ev(`(() => {
    const page = document.getElementById('note-tilt');
    const cs = getComputedStyle(page);
    return { theme: document.body.dataset.theme, analogies: document.querySelectorAll('.vls-analogy').length, color: cs.color, pages: document.querySelectorAll('#nb-body .vls-page').length };
  })()`);
  console.log('bw', JSON.stringify(bw));
  if (bw.theme !== 'bw' || bw.analogies || bw.pages < 8) fail('black-and-white notebook broken ' + JSON.stringify(bw));

  await send('Page.navigate', { url: BASE + '/notebook/vacuum-maze/' });
  for (let i = 0; i < 30; i++) { if (await ev('!!document.getElementById("book")')) break; await sleep(150); }
  const siteView = await ev(`(() => ({ analogies: document.querySelectorAll('.vls-analogy').length, simplifications: document.querySelectorAll('.vls-simplification').length, links: document.querySelectorAll('.notes-toc a').length, missing: [...document.querySelectorAll('.notes-toc a')].filter((a) => !document.querySelector(a.getAttribute('href'))).map((a) => a.getAttribute('href')) }))()`);
  console.log('site', JSON.stringify(siteView));
  if (siteView.analogies) fail('public notebook page still has analogy Post-its');
  if (siteView.simplifications < 16) fail('public notebook page lost lab notes');
  if (siteView.missing.length) fail('public notebook orphan links ' + siteView.missing.join(','));
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGKILL');
}

if (failures.length) {
  console.error(failures.length + ' failure(s)');
  process.exit(1);
}
console.log('PASS');
