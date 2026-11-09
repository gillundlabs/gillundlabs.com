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
