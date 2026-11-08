/* Fresh-run crossing time: T_start = T_ref (L / L_ref)².
   L is the rendered chamber width at magnification 1. Speed stays √(T/m).
   Run: node tests/maxwell-crossing.mjs
   Prints before/after L/mean(v) for the representative viewports. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../play/maxwells-demon/index.html', import.meta.url), 'utf8');
const notes = readFileSync(new URL('../notebook/maxwells-demon/index.html', import.meta.url), 'utf8');

function script(name) {
  const m = html.match(new RegExp(`<script data-src="${name}">\\n([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`missing ${name}`);
  return m[1];
}

const context = {
  console, Math, Number, Object, Array, Map, Set, isFinite, Infinity, JSON, Date,
  performance: { now: () => 0 },
};
context.self = context;
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(script('src/physics.js'), context);
vm.runInContext(script('src/entropy.js'), context);
vm.runInContext(script('src/sorting.js'), context);
const P = context.MDPhysics;
const E = context.MDEntropy;
const Sort = context.MDSorting;

const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const H = P.ELEMENTS[0];
const He = P.ELEMENTS[1];
const Kr = P.ELEMENTS[P.ELEMENTS.length - 1];

check(P.REF_CHAMBER_PX === 880, 'reference width is 880 logical px');
check(Math.abs(P.REF_CROSSING_M - 880 * P.DEFAULT_METERS_PER_PX) < 1e-18, 'L_ref = 880 × default m/px');
check(Math.abs(P.REF_CROSSING_S - 880 / 222) < 1e-12, 'reference crossing time is 880/222 s');
check(Math.abs(P.crossingFactor(P.REF_CROSSING_M) - 1) < 1e-12, 'factor is 1 on the reference chamber');
check(Math.abs(H.startT - 40e-9) / 40e-9 < 1e-9, 'hydrogen reference start stays 40 nK');

const game = script('src/game.js');
const ch = game.match(/const CH = \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}/);
const sb = script('src/sorting.js').match(/const SB = \{ x: (\d+), y: (\d+), w: (\d+), h: (\d+) \}/);
check(ch && +ch[3] === 880 && +ch[4] === 500, 'paddle chamber is 880×500');
check(sb && +sb[3] === 880 && +sb[4] === 440, 'sorting box is 880×440');
check(+ch[3] === P.REF_CHAMBER_PX && +sb[3] === P.REF_CHAMBER_PX, 'both glasses use the reference width');

function stageCss(vw, vh) {
  const landscape = vw > vh;
  const byH = vh * 1000 / 680;
  const byW = landscape ? vw - 420 : vw;
  return Math.min(byW, byH);
}
function metersPerPx(cssW, cssPerInch) {
  return (cssW / 1000) * (0.0254 / cssPerInch);
}

const views = [
  { name: 'phone-portrait', vw: 390, vh: 844, ppi: 160, kind: 'phone' },
  { name: 'desktop-landscape', vw: 1280, vh: 800, ppi: 100, kind: 'monitor' },
  { name: 'phone-landscape', vw: 844, vh: 390, ppi: 160, kind: 'phone' },
];

function row(view, logicalW) {
  const cssW = stageCss(view.vw, view.vh);
  const mpp = metersPerPx(cssW, view.ppi);
  const L = logicalW * mpp;
  const pace = P.crossingPace(L);
  const factor = pace * pace;
  const v = P.START_SPEED * pace;
  const T = H.startT * factor;
  const tBefore = L / P.START_SPEED;
  const tAfter = L / v;
  return { ...view, cssW, mpp, L, pace, factor, v, T, tBefore, tAfter, meanV: v };
}

const table = [];
for (const view of views) {
  for (const [mode, w, h] of [['single', 880, 500], ['two', 880, 500], ['sorting', 880, 440]]) {
    const r = row(view, w);
    r.mode = mode;
    r.heightM = h * r.mpp;
    r.tHeight = r.heightM / r.v;
    table.push(r);
  }
}

const tSet = new Set(table.map((r) => r.tAfter.toFixed(12)));
check(tSet.size === 1, `width crossing time is one value, got ${[...tSet]}`);
check(Math.abs(table[0].tAfter - P.REF_CROSSING_S) < 1e-9, 'that time is the reference crossing time');
const tBef = table.filter((r) => r.mode === 'single').map((r) => r.tBefore);
check(Math.max(...tBef) / Math.min(...tBef) > 2, 'before the change, phone and desktop crossing times differ');

for (const r of table.filter((x) => x.mode === 'single')) {
  P.setMagnification(1);
  P.setMetersPerPx(r.mpp);
  const vPx = (P.START_SPEED * r.pace) / P.METERS_PER_PX;
  const T = P.speedToTemperature(vPx, H.mass);
  const vBack = P.temperatureToSpeed(T, H.mass) * P.METERS_PER_PX;
  check(Math.abs(T / H.startT - r.factor) < 1e-9, `${r.name} hydrogen T scales as L²`);
  check(Math.abs(vBack - P.START_SPEED * r.pace) < 1e-9, `${r.name} v = √(3 k T / m)`);
  const The = P.speedToTemperature(vPx, He.mass);
  check(Math.abs(The / T - He.mass / H.mass) < 1e-9, `${r.name} same speed, T ∝ m`);
  check(Math.abs(vPx - P.REF_PX_PER_S) < 1e-6, `${r.name} logical pace is 222 px/s from the physics, not a separate fudge`);
}

function sortAt(mpp, pace, M, id) {
  P.setMetersPerPx(mpp);
  P.setMagnification(M);
  const box = Sort.create({
    P, E, R: {}, settings: { gravity: 'micro', residenceMean: 0.15, exitLaw: 'cos', collisionModel: 'quantum' },
    W: 1000, H: 680,
  });
  box.start({ mix: { 1: 20 }, difficulty: id, pace, warmup: 0 });
  return box.summary();
}

const phone = table.find((r) => r.name === 'phone-portrait' && r.mode === 'sorting');
const desk = table.find((r) => r.name === 'desktop-landscape' && r.mode === 'sorting');
for (const id of ['demon', 'maxwell', 'apprentice', 'custom']) {
  const a = sortAt(phone.mpp, phone.pace, 1, id);
  const b = sortAt(desk.mpp, desk.pace, 1, id);
  check(Math.abs(a.Th / a.Tc - a.spread) < 1e-9 && Math.abs(b.Th / b.Tc - b.spread) < 1e-9, `${id} keeps Th/Tc`);
  check(Math.abs(a.spread - b.spread) < 1e-12, `${id} spread matches across screens`);
  check(a.mean === b.mean, `${id} mean factor matches`);
  const meanSpeed = (s) => {
    const rms = (T) => Math.sqrt((2 * P.K_B * T) / H.mass);
    const mb = (T) => rms(T) * Math.sqrt(Math.PI) / 2;
    return 0.5 * (mb(s.Tc) + mb(s.Th));
  };
  const ta = phone.L / meanSpeed(a);
  const tb = desk.L / meanSpeed(b);
  check(Math.abs(ta - tb) / ta < 1e-9, `${id} L/mean(v) matches phone and desktop (${ta} vs ${tb})`);
  check(Math.abs(a.T0 / b.T0 - phone.factor / desk.factor) < 1e-9, `${id} mean temperature scales once with L²`);
}

const mag = sortAt(desk.mpp, desk.pace, 4, 'demon');
const bare = sortAt(desk.mpp, desk.pace, 1, 'demon');
check(Math.abs(mag.T0 / bare.T0 - 1 / 16) < 1e-9, 'magnification divides T by M² once');
check(Math.abs(mag.pace - desk.pace) < 1e-12, 'pace is not divided by M again');
P.setMetersPerPx(desk.mpp);
P.setMagnification(4);
const vPxMag = (P.START_SPEED * desk.pace) / P.BASE_METERS_PER_PX;
check(Math.abs(vPxMag - 222) < 1e-6, '×4 keeps the same logical pace as ×1');

const capRef = Sort.magCap([H.mass], 1, E, P.DEFAULT_METERS_PER_PX);
P.setMetersPerPx(P.DEFAULT_METERS_PER_PX);
const capNow = Sort.magCap([H.mass], 1, E, P.BASE_METERS_PER_PX);
check(capRef === capNow, 'magnification cap still uses the reference temperature');
const cold = Sort.magColdest(E, desk.mpp);
check(Math.abs(cold.factor - desk.factor) < 1e-9, 'reported coldest start includes the width factor once');

const oldMpp = phone.mpp, newMpp = desk.mpp;
const vPx = 222;
const vPx2 = vPx * (oldMpp / newMpp);
const T1 = (H.mass * (vPx * oldMpp) ** 2) / (3 * P.K_B);
const T2 = (H.mass * (vPx2 * newMpp) ** 2) / (3 * P.K_B);
check(Math.abs(T1 - T2) / T1 < 1e-12, 'rescaling pixel velocity by old/new m/px does not change T');
check(game.includes('onRescale = (f) => { for (const a of state.atoms) { a.vx *= f; a.vy *= f; }'), 'active atoms keep physical speed on resize');
check(game.includes('highlight: 0.18, deviceRim: true'), 'principal temperature engraving uses a quieter catch-light');
check(script('src/render.js').includes('cut.highlight != null ? cut.highlight : 0.55'), 'other engraving keeps the kit catch-light');
check(game.includes('freezeRun(CH.w)'), 'paddle runs freeze pace at start');
check(game.includes('freezeRun(SORT.SB.w)'), 'sorting runs freeze pace at start');
check(!game.includes('runFactor = paceFor'), 'resize does not assign a new run factor');

const settings = script('src/settings.js');
check(settings.includes('wallTemp: 20e-9'), 'default wall temperature is unchanged');
check(!settings.includes('crossingFactor'), 'wall temperature is not run through the width factor');
check(html.includes('e.startT * (state.runFactor'), 'a bought atom uses the frozen run temperature');

function coins(best, factor) { return Math.floor(best / (1e-6 * P.T_SCALE * factor) + 1e-9); }
check(coins(H.startT * 4, 4) === coins(H.startT, 1), 'temperature bonus follows the fresh-start factor');
const wide = 0.5;
const wideFactor = P.crossingFactor(wide);
check(H.startT * wideFactor > He.unlockT, 'a half-metre chamber would pass the reference helium unlock if it were not scaled');
check(H.startT * wideFactor < He.unlockT * wideFactor, 'scaled unlock still sits above the fresh start');
check(Math.abs((He.unlockT * desk.factor) / (H.startT * desk.factor) - He.unlockT / H.startT) < 1e-12, 'unlock/start ratio is independent of width');

const box = Sort.create({ P, E, R: {}, settings: { gravity: 'micro' }, W: 1000, H: 680 });
check(box.Q_LIM === 653 / 250, 'phase-space target is unchanged');
check(script('src/sorting.js').includes('const Q_LIM = 653 / 250'), 'phase-space constant is the real threshold');
check(!html.includes('take longer to cross'), 'in-game notes no longer say a bigger screen takes longer');
check(html.includes('(L / L_ref)'), 'in-game notes state T ∝ (L/L_ref)²');
check(P.stageMetersPerPx(0, 100) === null, 'a zero-width stage does not fall back to 1000 CSS px');
check(game.includes('if (!(r.width > 0) || !(r.height > 0)) return;'), 'resize ignores an unlaid-out canvas');
check(html.includes('max-width: 720px'), 'a narrow landscape stage is not shrunk by the 420 px gutter');
const deskFactor = desk.factor;
const phoneFactor = phone.factor;
const startDesk = H.startT * deskFactor;
const seeded = P.performanceRecord(startDesk, startDesk, deskFactor, 50e-9);
check(!seeded.beat && seeded.stored === 50e-9, 'desktop fresh start does not overwrite a 50 nK record');
check(Math.abs(seeded.peakEq - H.startT) / H.startT < 1e-9, 'fresh-start equivalent is the reference 40 nK');
const heated = P.performanceRecord(startDesk * 2, startDesk, deskFactor, 50e-9);
check(heated.beat && Math.abs(heated.stored - H.startT * 2) < 1e-12, 'a real heating is stored as reference-chamber kelvin, not the dial reading');
const freshAward = P.performanceRecord(H.startT * phoneFactor, H.startT * phoneFactor, phoneFactor, 0);
check(!freshAward.beat && freshAward.stored === 0, 'a fresh start with no saved record still awards nothing');
const kick = (f) => P.heatingKick('preset', 20e-9, 20e-9, f).mean;
const gap = He.unlockT - H.startT;
const kicks = (f) => (gap * f) / kick(f);
check(Math.abs(kicks(deskFactor) - kicks(phoneFactor)) < 1e-6, 'default wall step keeps the same number of kicks to helium');
check(Math.abs(kicks(1) - gap / 20e-9) < 1e-6, 'reference chamber needs the same kicks');
const custom = P.heatingKick('absolute', 30e-9, 20e-9, deskFactor);
check(!custom.preset && custom.mean === 30e-9, 'an explicit wall temperature stays absolute');
const exact20 = P.heatingKick('absolute', 20e-9, 20e-9, deskFactor);
check(!exact20.preset && exact20.mean === 20e-9, 'an explicit 20 nK stays absolute on a wide screen');
const quant = P.heatingKick('absolute', 2.0005824250172538e-8, 20e-9, phoneFactor);
check(quant.mean === 2.0005824250172538e-8, 'a stored slider temperature is not snapped back to the preset');
const applyFn = game.slice(game.indexOf('function applySettings'), game.indexOf('function onWallChosen'));
check(!applyFn.includes('wallTemp') && !applyFn.includes('wallFromSlider'), 'other settings do not rewrite the wall temperature');
check(game.includes("settings.wallHeat = 'absolute'"), 'moving the slider records an absolute choice');
{
  const mem = new Map();
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const ctx = { console, Math, Number, Object, JSON, isFinite, localStorage };
  ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script('src/physics.js'), ctx);
  vm.runInContext(script('src/settings.js'), ctx);
  const S = ctx.MDSettings;
  const fresh = S.load();
  check(fresh.settings.wallHeat === 'preset' && fresh.settings.wallTemp === 20e-9, 'a new game uses the scaled heating preset');
  S.save(fresh);
  const kept = S.load();
  check(kept.settings.wallHeat === 'preset' && kept.settings.wallTemp === 20e-9, 'reload keeps the preset and does not quantize it');
  fresh.settings.wallHeat = 'absolute'; fresh.settings.wallTemp = 20e-9; S.save(fresh);
  const abs = S.load();
  check(abs.settings.wallHeat === 'absolute' && abs.settings.wallTemp === 20e-9, 'explicit 20 nK absolute survives reload');
  mem.set(S.KEY, JSON.stringify({ settings: { tempScale2: true, wallTemp: 30e-9 }, best: {} }));
  const chosen = S.load();
  check(chosen.settings.wallHeat === 'absolute' && chosen.settings.wallTemp === 30e-9, 'a saved absolute temperature without the new flag stays absolute');
  mem.set(S.KEY, JSON.stringify({ settings: { wallTemp: 250e-9 }, best: { 'single:1': 1e-6 } }));
  const released = S.load();
  check(Math.abs(released.settings.wallTemp / 20e-9 - 1) < 1e-9, 'the released 0.08 migration still scales an old wall temperature');
  check(Math.abs(released.best['single:1'] - 8e-8) < 1e-15, 'the released 0.08 migration still scales an old temperature record');
  check(released.settings.wallHeat === 'absolute', 'the 0.08 migration does not invent a scaled preset');
  mem.set(S.KEY, JSON.stringify({ settings: { tempScale2: true, wallTemp: 2.0005824250172538e-8 }, best: { 'single:1': 95.033e-9 } }));
  const unreleased = S.load();
  check(unreleased.best['single:1'] === 95.033e-9, 'an unreleased raw-dial best is not rewritten');
  check(unreleased.settings.wallTemp === 2.0005824250172538e-8 && unreleased.settings.wallHeat === 'absolute', 'a quantized wall value is kept as stored');
  const wiped = S.reset();
  check(wiped.settings.wallHeat === 'preset' && wiped.settings.wallTemp === 20e-9, 'reset restores the scaled default');
}
check(html.includes('word-break: keep-all'), 'Victorian full-version button keeps words intact');
check(!html.includes('where the game starts it'), 'de Broglie notes no longer say 40 nK is every screen\'s start');
check(notes.includes('40 nK in the reference chamber') && !notes.includes('where the game starts it'), 'public de Broglie notes name the reference chamber');
check(!html.includes("Sorting mode's standard"), 'entropy note no longer calls 60 nK the mode standard on every screen');
check(!notes.includes('take longer to cross'), 'public notebook no longer says a bigger screen takes longer');
check(notes.includes('(L / L_ref)'), 'public notebook states the same formula');
check(notes.includes("reference chamber's standard Sorting start, 60 nK"), 'public entropy note qualifies the 60 nK');
check(!notes.includes("Sorting mode's standard 60 nK"), 'public entropy note drops the stale wording');
check(html.includes('let PIN_SCALE = false'), 'scale pin stays off in the release');
check(html.includes('#dev-badge { display: none !important; }'), 'dev badge stays hidden');
check(!/easter|hidden reward|ACH2/i.test(script('src/physics-notes.js') + script('src/physics-notes-more.js')), 'notes do not describe a hidden reward');

const out = {
  formula: 'T = T_ref * (L / L_ref)^2 / M^2',
  L: 'rendered wall-to-wall width at magnification 1 = logicalWidth * BASE_METERS_PER_PX',
  Lref_m: P.REF_CROSSING_M,
  Lref_mm: P.REF_CROSSING_M * 1000,
  Tref_H_K: H.startT,
  tref_s: P.REF_CROSSING_S,
  vref_m_s: P.START_SPEED,
  rows: table.map((r) => ({
    view: r.name, mode: r.mode, viewport: `${r.vw}x${r.vh}`, cssPerInch: r.ppi,
    stageCss: +r.cssW.toFixed(2), L_m: r.L, L_mm: +(r.L * 1000).toFixed(3),
    height_mm: +(r.heightM * 1000).toFixed(3),
    T_nK: r.T * 1e9, v_mm_s: r.v * 1000,
    t_before_s: r.tBefore, t_after_s: r.tAfter, t_height_s: r.tHeight,
  })),
};
console.log(JSON.stringify(out, null, 2));
if (failures.length) {
  console.error(failures.map((f) => 'FAIL ' + f).join('\n'));
  process.exit(1);
}
console.log(`ok ${table.length} view rows, reference crossing ${P.REF_CROSSING_S.toFixed(4)} s, L_ref ${(P.REF_CROSSING_M * 1000).toFixed(3)} mm`);
