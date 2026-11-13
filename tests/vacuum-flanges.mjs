/* Bolted flanges must not cut through each other or a part they are not bolted to.
   Mating halves of one joint are a single footprint. A plain tube left where a second
   flange would not fit is not a footprint.
   Run: node tests/vacuum-flanges.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../play/vacuum-maze/index.html', import.meta.url), 'utf8');
function extract(marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('missing ' + marker);
  const start = html.lastIndexOf('<script>', i);
  const end = html.indexOf('</script>', i);
  return html.slice(start + '<script>'.length, end);
}
const context = { console, Math, Number, Object, Array, Map, Set, JSON, Date, isFinite, Infinity, performance: { now: () => 0 } };
context.self = context;
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(extract('/* src/levels-data.js */'), context, { filename: 'levels-data.js' });
vm.runInContext(extract('/* src/maze.js */'), context, { filename: 'maze.js' });
const M = context.VMMaze;

const VIEWS = [[320, 568], [320, 700], [390, 844], [768, 900], [1280, 800]];
function zoom(vw, vh) {
  const short = Math.min(vw, vh);
  return short / Math.max(215, short / 2.2);
}
function hit(a, b) {
  return a.r > b.l + 0.5 && a.l < b.r - 0.5 && a.b > b.t + 0.5 && a.t < b.b - 0.5;
}
function overlap(a, b) {
  const l = Math.max(a.l, b.l), t = Math.max(a.t, b.t), r = Math.min(a.r, b.r), bot = Math.min(a.b, b.b);
  if (r - l <= 0.5 || bot - t <= 0.5) return null;
  return { w: r - l, h: bot - t };
}
function scaleBox(box, k) {
  return { l: box.l * k, t: box.t * k, r: box.r * k, b: box.b * k };
}

const practice = {
  id: 0, name: 'Level 0', caption: 'A short practice run into the first pump. Nothing is recorded.',
  chapter: 1, setup: 'Practice', cf: 'DN40CF', boreMM: 35,
  cols: 2, rows: 1, seed: 7, loops: 0, exits: ['rotary'],
  deadEnds: [], cold: 0, hot: 0, lasers: [], kappa: 1,
};

const levels = M.LEVELS.map((spec, index) => ({ spec, index, role: index === 0 ? 'official and title demo' : 'official' }));
levels.push({ spec: practice, index: -1, role: 'practice' });

const failures = [];
let checked = 0;
let omitted = 0;
for (const item of levels) {
  const L = M.generate(item.spec);
  checked++;
  const layout = M.hardwareLayout(L);
  omitted += layout.flanges.dropped.length;
  const pieces = layout.placed;
  for (const [vw, vh] of VIEWS) {
    const k = zoom(vw, vh);
    for (let a = 0; a < pieces.length; a++) for (let b = a + 1; b < pieces.length; b++) {
      if (pieces[a].key === pieces[b].key) continue;
      for (const pa of pieces[a].parts) for (const pb of pieces[b].parts) {
        const o = overlap(scaleBox(pa, k), scaleBox(pb, k));
        if (!o) continue;
        failures.push(`${item.role} ${L.id} ${L.name} @ ${vw}x${vh}: ${pieces[a].key} overlaps ${pieces[b].key} by ${o.w.toFixed(1)}×${o.h.toFixed(1)} screen px`);
        if (failures.length > 30) break;
      }
      if (failures.length > 30) break;
    }
    if (failures.length > 30) break;
  }
}

console.log(`checked ${checked} levels (${M.LEVELS.length} official, including the title demo, plus the practice). omitted ${omitted} joints that would have cut through another flange.`);
if (failures.length) {
  console.error(failures.slice(0, 30).join('\n'));
  console.error(`FAIL ${failures.length} overlap(s)`);
  process.exit(1);
}
console.log('PASS');
