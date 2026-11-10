/* Screen-crossing time stays the same when the shown width changes.
   T = T_ref (L / L_ref)² and speed scales with L. Records are not written on load.
   Run: node tests/vacuum-crossing.mjs
   Prints before/after crossing times for the four viewports. */
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
for (const name of ['src/physics.js', 'src/levels-data.js', 'src/maze.js', 'src/lasers.js', 'src/engine.js']) {
  vm.runInContext(extract(`/* ${name} */`), context, { filename: name });
}
const E = context.VMEngine;
const M = context.VMMaze;
const level = M.generate(M.LEVELS[0]);
const mass = context.MDPhysics.ELEMENTS[0].mass;
const g = 9.81;
const Tref = E.wallTempFor(level, mass, g);
const scale = E.scaleFor(level);
const vRef = E.meanThermalSpeed(Tref, mass);

const views = [[240, 320], [390, 844], [1280, 800], [1920, 1080]];
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const rows = views.map(([vw, vh]) => {
  const span = E.visibleWidthPx(vw, vh);
  const pace = E.crossingPace(vw, vh);
  const factor = E.crossingFactor(vw, vh);
  const T = Tref * factor;
  const v = E.meanThermalSpeed(T, mass);
  const tBefore = span * scale / vRef;
  const tAfter = E.crossingSeconds(vw, vh, level, mass, g);
  const kin = (mass * v * v) / (3 * context.MDPhysics.K_B);
  return { vw, vh, span, pace, factor, T, v, tBefore, tAfter, kin };
});

console.log('viewport  spanPx   pace   T/Tref   tBefore   tAfter');
for (const r of rows) {
  console.log(`${String(r.vw).padStart(4)}x${String(r.vh).padEnd(4)} ${r.span.toFixed(1).padStart(7)} ${r.pace.toFixed(3).padStart(6)} ${r.factor.toFixed(3).padStart(7)} ${r.tBefore.toFixed(4).padStart(8)} ${r.tAfter.toFixed(4).padStart(8)}`);
}

const times = rows.map((r) => r.tAfter);
check(Math.max(...times) / Math.min(...times) < 1.000001, 'crossing times differ: ' + times.join(', '));
check(Math.abs(rows[0].tAfter - rows[1].tAfter) < 1e-9, '240 and 390 differ');
check(Math.abs(rows[0].pace - 1) < 1e-9 && Math.abs(rows[1].pace - 1) < 1e-9, 'phones are the reference pace');
check(rows[2].pace > 1.5 && rows[3].pace > rows[2].pace, 'wider screens show a longer span');
check(rows[2].tBefore / rows[0].tBefore > 2, 'before the change, desktop crossing was slower');
for (const r of rows) {
  check(Math.abs(r.factor - r.pace * r.pace) < 1e-12, 'temperature factor is pace squared');
  check(Math.abs(r.v / vRef - r.pace) < 1e-9, 'speed scales with the shown width');
  const back = E.meanThermalSpeed(r.T, mass);
  check(Math.abs(back - r.v) < 1e-9, 'speed matches the temperature');
  check(Math.abs(E.crossingPace(r.vw, r.vh) - E.crossingPace(r.vw, r.vh)) < 1e-15, 'pace stable');
  check(Math.abs(E.crossingSeconds(r.vw, r.vh, level, mass, g) - E.crossingSeconds(r.vw * 1, r.vh, level, mass, g)) < 1e-12, 'css size only');
}
check(Math.abs(E.viewZoom(390, 844) - E.viewZoom(390, 844)) < 1e-15, 'zoom');
check(Math.abs(E.crossingPace(1280, 800) - E.visibleWidthPx(1280, 800) / E.VIEW_SHORT_WORLD) < 1e-12, 'pace is span over 215');
// Device pixels do not enter the span. The same CSS viewport is the same pace at any DPR.
check(E.crossingPace(1920, 1080) === E.crossingPace(1920, 1080), 'dpr is not an input');

// Fixed-clock integration: fly the mean thermal speed across the shown width with gravity off.
// Walls would stop a maze run, so this flight is the kinematic crossing the temperature implies,
// stepped by the engine at 1/60 s until the distance is covered or a wall sticks the atom.
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
for (const r of rows) {
  const w = E.createWorld(level, 1, { rand: mulberry(4), g, wallT: r.T, pace: r.pace });
  w.g.x = 0; w.g.y = 0;
  w.atom.vx = r.v / w.scale; w.atom.vy = 0; w.atom.stuck = null;
  const x0 = w.atom.x, goal = r.span;
  const dt = 1 / 60;
  let n = 0;
  while ((w.atom.x - x0) < goal && !w.atom.stuck && n < 200000) { E.step(w, dt); n++; }
  const flown = w.atom.x - x0;
  const tInt = w.stats.time;
  r.integrated = tInt;
  r.flew = flown;
  r.stuck = !!w.atom.stuck;
  if (!w.atom.stuck) check(Math.abs(tInt - r.tAfter) / r.tAfter < 0.02, `${r.vw} integrated ${tInt} vs ${r.tAfter}`);
}
console.log('integrated (stuck means a wall ended the flight before a full crossing):');
for (const r of rows) console.log(`  ${r.vw}x${r.vh} t=${r.integrated.toFixed(4)} flew=${r.flew.toFixed(1)}/${r.span.toFixed(1)} stuck=${r.stuck}`);

// A fresh start must not invent a best. The stored number stays, and a later win
// compares the reference-pace time (screen time × pace).
const legacy = { time: 42.5, stars: 2 };
function consider(screenTime, pace, prev) {
  const tRef = screenTime * pace;
  const rec = !prev || tRef < prev.time;
  if (!rec) return { wrote: false, best: prev };
  return { wrote: true, best: { time: tRef, stars: 1, ref: true } };
}
const writes = html.split('\n').filter((l) => /store\.best\[key\]\s*=/.test(l));
check(writes.length === 1 && writes[0].includes('nextBest'), 'bests are written in one place, after a win: ' + writes.join(' | '));
const slow = consider(30, rows[3].pace, legacy);
check(slow.wrote === false && slow.best === legacy, 'a slow wide-screen run does not replace 42.5 s');
const fast = consider(5, rows[0].pace, legacy);
check(fast.wrote && Math.abs(fast.best.time - 5) < 1e-9 && fast.best.ref === true, 'a real faster run stores the reference time');
check(!html.includes('store.best') || !/resize\(\)[\s\S]{0,400}store\.best/.test(html), 'resize does not mention bests');

const dn40Src = html.match(/function dn40Metrics\(\) \{[\s\S]*?\n  \}/);
const spriteSrc = html.match(/function dn40Sprite\(borePx\) \{[\s\S]*?\n  \}/);
if (!dn40Src || !spriteSrc) check(false, 'dn40 geometry missing');
else {
  const box = { Math };
  vm.createContext(box);
  vm.runInContext(dn40Src[0] + '\n' + spriteSrc[0] + '\nthis.m = dn40Metrics(); this.s = dn40Sprite(80);', box);
  const m = box.m, s = box.s;
  check(m.gasketIn >= 19, 'gasket inside radius enters the bore: ' + m.gasketIn);
  check(m.gasketT / m.flangeT < 0.25, 'gasket thicker than a quarter of the flange: ' + m.gasketT);
  check(m.tipX > 0 && m.tipSep > 1 && m.tipX < m.gasketT / 2, 'knife tips must stay apart inside the copper, sep ' + m.tipSep);
  check(m.boltR > m.recessR, 'bolt circle is inside the recess');
  check(m.knifeR > m.gasketIn && m.knifeR < m.gasketOut, 'knife radius is outside the copper');
  check(Math.abs(m.gasketT - 2) < 1e-9 && Math.abs(m.flangeT - 12.7) < 1e-9, 'DN40 thicknesses');
  check(Math.abs(m.odR - 34.95) < 1e-12 && Math.abs(2 * m.odR - 69.9) < 1e-12, 'flange OD is ' + (2 * m.odR) + ' mm');
  check(Math.abs(s.odOverId - 69.9 / 38) < 1e-12, 'in-game OD/ID is ' + s.odOverId);
  check(Math.abs(s.thick - 12.7 * s.pxPerMm) < 1e-9, 'thickness does not follow the bore scale');
  check(Math.abs(s.boltR - 29.4 * s.pxPerMm) < 1e-9, 'bolt circle does not follow the bore scale');
  check(s.boltR > 80 + 12, 'bolt circle is inside the 12 px tube wall');
  console.log('dn40', JSON.stringify({ gasketIn: m.gasketIn, odOverId: s.odOverId, boltR: s.boltR, thick: s.thick }));
}

{
  const p1 = E.crossingPace(1280, 800), p2 = E.crossingPace(1440, 800);
  const T1 = Tref * p1 * p1;
  const w = E.createWorld(level, 1, { rand: mulberry(4), g, wallT: T1, pace: p1 });
  w.g.x = 0; w.g.y = 0;
  const v = E.meanThermalSpeed(T1, w.atom.m) / w.scale;
  w.atom.vx = v; w.atom.vy = 0; w.atom.stuck = null;
  const cross = (span) => span / Math.hypot(w.atom.vx, w.atom.vy);
  const tA = cross(E.visibleWidthPx(1280, 800));
  E.step(w, 0.05);
  const refA = w.stats.refTime;
  E.retunePace(w, p2);
  const tB = cross(E.visibleWidthPx(1440, 800));
  check(Math.abs(tB - tA) / tA < 0.02, `resize crossing ${tA} -> ${tB}`);
  check(Math.abs(w.stats.refTime - refA) < 1e-9, 'resize jumped the reference clock');
  check(Math.abs(w.opts.wallT / T1 - (p2 / p1) ** 2) < 1e-9, 'wall temperature did not scale with pace squared');
  E.step(w, 0.05);
  const expect = refA + 0.05 * p2;
  check(Math.abs(w.stats.refTime - expect) < 1e-6, `reference time ${w.stats.refTime} vs ${expect}`);
  console.log('resize', JSON.stringify({ tA, tB, refA, refB: w.stats.refTime, p1, p2 }));
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('PASS');
