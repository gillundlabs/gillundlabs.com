/* Level 0 is a short playable turn in the single-chamber trap. It can be
   skipped, replayed, and it must not write coins, unlocks, or records.
   Run: node tests/maxwell-tutorial.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../play/maxwells-demon/index.html', import.meta.url), 'utf8');
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
vm.runInContext(script('src/tutorial.js'), context);
vm.runInContext(script('src/settings.js'), context);
const P = context.MDPhysics;
const E = context.MDEntropy;
const Sort = context.MDSorting;
const T = context.MDTutorial;
const S = context.MDSettings;

const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }

const seeded = { coins: 7, unlockedZ: 2, tutorialSeen: false, settings: { theme: 'victorian', wallTemp: 20e-9 }, best: { 'single:1': 50e-9, 'sort2:demon': 4 } };
const best = seeded.best;

check(T.begin(T.create(), seeded).action === 'level0', 'a new player begins on Level 0');
let active = T.begin(T.create(), seeded).state;
check(active.active && T.writesRecords(active) === false, 'Level 0 does not write records while it is running');
check(T.writesRecords(null) && T.writesRecords(T.create()), 'a normal run still writes records');

active = T.observe(active, { moved: true });
check(active.moved && !active.heated && !active.complete, 'moving the paddle is not yet the whole lesson');
active = T.observe(active, { heated: true });
check(active.heated && !active.complete, 'a hotter atom is the score, and the lesson stays open long enough to read it');
active = T.observe(active, { finish: true });
check(active.complete, 'the lesson ends after the score has been shown');
check(!T.observe(T.begin(T.create(), seeded).state, { heated: true, finish: true }).complete, 'heat before the paddle moves does not finish Level 0');

const done = T.finish(active, seeded);
check(done.action === 'done' && done.record === false, 'finishing Level 0 is not a scored round');
check(done.store.tutorialSeen === true, 'finishing remembers that Level 0 was seen');
check(done.store.coins === 7 && done.store.unlockedZ === 2, 'finishing keeps coins and unlocks');
check(done.store.best === best && best['single:1'] === 50e-9 && best['sort2:demon'] === 4, 'finishing does not replace records');
check(seeded.tutorialSeen === false, 'the saved object is copied, not rewritten in place');
check(T.begin(T.create(), done.store).action === 'modes', 'the next Begin goes to the mode list');

const again = T.replay(T.create(), done.store);
check(again.action === 'level0' && again.state.active, 'Level 0 can be replayed');
check(again.store.tutorialSeen === true && again.store.best === best && again.store.coins === 7, 'replay keeps the seen flag, coins, and records');

const fresh = { coins: 1, unlockedZ: 1, tutorialSeen: false, best: { 'single:1': 12e-9 } };
const skipped = T.skip(T.begin(T.create(), fresh).state, fresh);
check(skipped.action === 'modes' && skipped.record === false && skipped.store.tutorialSeen === true, 'skip leaves Level 0 for the mode list');
check(skipped.store.coins === 1 && skipped.store.best['single:1'] === 12e-9, 'skip does not touch a normal-run record');
check(T.begin(T.create(), skipped.store).action === 'modes', 'after skip, Begin is not blocked on Level 0');
check(T.writesRecords(skipped.state), 'after skip, a normal run may write records');

const spec = T.setup();
check(spec.mode === 'single' && spec.shape === 'rect' && spec.mix[1] === 1 && Object.keys(spec.mix).length === 1, 'Level 0 is one hydrogen atom in the open chamber');
check(spec.gravity === 'micro', 'Level 0 uses the default microgravity');

const rules = JSON.stringify(Sort.DIFFICULTIES);
const plain = Sort.create({
  P, E, R: {}, settings: { gravity: 'micro', residenceMean: 0.15, exitLaw: 'cos', collisionModel: 'quantum', sortPreview: true, sortDifficulty: 'demon' },
  W: 1000, H: 680,
});
plain.start({ mix: { 1: 8 }, difficulty: 'apprentice', warmup: 0, pace: 1 });
check(JSON.stringify(Sort.DIFFICULTIES) === rules, 'Level 0 does not rewrite sorting difficulties');
check(plain.S.diff.key === 'apprentice' && plain.S.diff.time === 180, 'a normal sorting start is unchanged');
check(!script('src/sorting.js').includes('S.tutorial'), 'sorting is not the Level 0 lesson');

const lines = [
  T.line({ active: true }),
  T.line({ active: true, moved: true }),
  T.line({ active: true, moved: true, slipped: true }),
  T.line({ active: true, moved: true, heated: true }),
];
check(lines.every((s) => s && s.length <= 170), `lesson lines stay short: ${lines.map((s) => s.length).join(',')}`);
check(new Set(lines).size === lines.length, 'each step has its own line');
check(/paddle/i.test(lines[0]) && /Space pauses/.test(lines[0]) && !/trapdoor|Space, to open/i.test(lines.join('\n')), 'the lesson teaches the paddle, and Space only pauses');
check(/open right side/i.test(lines[1]) && /temperature/i.test(lines[1]) && /hotter is higher/i.test(lines[1]), 'the lesson states the objective and the score');
check(/big number/i.test(lines[3]) && /temperature/i.test(lines[3]), 'the temperature readout is the score');
const banned = /cheat|bose|condens|analogy|coffee/i;
check(!banned.test(lines.join('\n')) && !banned.test(script('src/tutorial.js')), 'the lesson does not use banned framing');
check(!html.includes('seore') && html.includes('your score'), 'the title says score');

function overlaps(a, b) {
  return a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
}
for (const bw of [false, true]) {
  const lay = T.headerLayout(bw);
  check(lay.length === 3, 'three header plaques');
  for (let p = 0; p < lay.length; p++) {
    const plaque = lay[p];
    check(plaque.y + plaque.h < 118, `${plaque.id} stays above the chamber`);
    check(plaque.slots.length === 3, `${plaque.id} has one slot per line`);
    if (p) check(lay[p - 1].x + lay[p - 1].w <= plaque.x, 'plaques do not overlap');
    for (let i = 0; i < plaque.slots.length; i++) {
      const s = plaque.slots[i];
      check(s.h >= 14, `${plaque.id} slot ${i} is at least 14px, not a 7px shrink`);
      check(s.x >= plaque.x + plaque.inset - 0.1 && s.x + s.w <= plaque.x + plaque.w - plaque.inset + 0.1, `${plaque.id} slot clears the side screws`);
      check(s.y >= plaque.y + plaque.inset - 0.1 && s.y + s.h <= plaque.y + plaque.h - plaque.inset + 0.1, `${plaque.id} slot clears the corner screws`);
      for (let j = i + 1; j < plaque.slots.length; j++) check(!overlaps(s, plaque.slots[j]), `${plaque.id} slots intersect`);
    }
  }
}

const game = script('src/game.js');
const startGame = game.slice(game.indexOf('function startGame'), game.indexOf('function setupPaddleGame'));
check(startGame.indexOf('leaveTutorial()') >= 0 && startGame.indexOf('leaveTutorial()') < startGame.indexOf('startSort'), 'a normal run clears Level 0 before play');
const endGame = game.slice(game.indexOf('function endGame'), game.indexOf('function trialEndNote'));
check(endGame.includes('state.tutorial') && endGame.indexOf('state.tutorial') < endGame.indexOf('store.best'), 'paddle records are not reached during Level 0');
const endSort = game.slice(game.indexOf('function endSort'), game.indexOf('function startAttract'));
check(endSort.indexOf('state.tutorial') < endSort.indexOf('store.best'), 'sorting records are not reached during Level 0');
check(game.includes('TUT.setup()') && game.includes("state.mode = spec.mode"), 'Level 0 starts in the default chamber');
const starter = game.slice(game.indexOf('function startTutorial'), game.indexOf('function skipTutorial'));
check(!starter.includes('SORT.start'), 'Level 0 does not start a sorting round');
const keys = game.slice(game.indexOf("addEventListener('keydown'"), game.indexOf("addEventListener('keyup'"));
const up = game.slice(game.indexOf("addEventListener('keyup'"), game.indexOf("addEventListener('blur'"));
check(keys.includes("e.code === 'Space'") && keys.includes('pause()'), 'Space pauses');
const doorAt = keys.indexOf('SORT.doorDown()');
check(doorAt > 0 && !keys.slice(Math.max(0, doorAt - 280), doorAt).includes('Space'), 'Space does not open the trapdoor');
check(keys.includes("e.code === 'Enter' && state.mode === 'sort'") && keys.includes('SORT.doorDown()'), 'Enter holds the trapdoor in Sorting');
check(up.includes("e.code === 'Enter'") && up.includes('SORT.doorUp()') && !up.includes('Space'), 'releasing Enter shuts a held door, and Space does not');
check(keys.includes('focusOwnsKey'), 'Space and Enter are left with fields and focused controls');
check(keys.includes('!state.tutorial'), 'Enter does not open the Sorting door during Level 0');
const adsorb = game.slice(game.indexOf('function adsorb'), game.indexOf('function desorb'));
check(adsorb.indexOf('state.tutorial') < adsorb.indexOf('store.coins++'), 'a Level 0 paddle touch does not pay a coin');
check(html.includes('id="b-skip-level0"') && html.includes('id="b-level0"') && html.includes('id="s-level0"') && html.includes('id="b-pause-skip"'), 'skip and replay controls are in the page');

{
  const mem = new Map();
  const localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const ctx = { console, Math, Number, Object, JSON, isFinite, localStorage };
  ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script('src/physics.js'), ctx);
  vm.runInContext(script('src/settings.js'), ctx);
  const Settings = ctx.MDSettings;
  const first = Settings.load();
  check(first.tutorialSeen === false, 'a fresh save has not seen Level 0');
  check(first.coins === 0 && first.settings.wallHeat === 'preset', 'a fresh save is otherwise the normal new game');
  first.tutorialSeen = true; first.coins = 3; first.best['single:1'] = 50e-9; Settings.save(first);
  const kept = Settings.load();
  check(kept.tutorialSeen === true && kept.coins === 3 && kept.best['single:1'] === 50e-9, 'the seen flag reloads beside coins and records');
  check(kept.settings.wallTemp === 20e-9, 'saving the flag does not retune the wall');
  mem.set(Settings.KEY, JSON.stringify({ settings: { tempScale2: true, wallTemp: 30e-9 }, coins: 9, unlockedZ: 4, best: { 'single:1': 80e-9 } }));
  const old = Settings.load();
  check(old.tutorialSeen === false && old.coins === 9 && old.unlockedZ === 4 && old.best['single:1'] === 80e-9, 'an older save still loads, and Begin may offer Level 0');
  check(old.settings.wallTemp === 30e-9 && old.settings.wallHeat === 'absolute', 'an older absolute wall temperature is unchanged');
  const wiped = Settings.reset();
  check(wiped.tutorialSeen === false && wiped.coins === 0 && Object.keys(wiped.best).length === 0, 'erase progress is a fresh start');
  check(T.skip(T.begin(T.create(), wiped).state, wiped).action === 'modes', 'a fresh start can skip straight to the modes');
}

if (failures.length) {
  console.error(failures.map((f) => 'FAIL ' + f).join('\n'));
  process.exit(1);
}
console.log('tutorial ok');
