/* Level 0 is a short playable sorting round. It can be skipped, replayed,
   and it must not write coins, unlocks, or records.
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

active = T.observe(active, { opens: 1, cmd: 1, door: 1 });
check(active.opened && !active.closed && !active.complete, 'opening the trapdoor is not yet the whole lesson');
active = T.observe(active, { opens: 1, cmd: 0, door: 0 });
check(active.closed && !active.passed && !active.complete, 'shutting the trapdoor is recorded');
active = T.observe(active, { opens: 1, cmd: 0, door: 0, helpfulCross: true });
check(active.passed && active.complete, 'a marked atom completing the pass finishes the lesson');

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
check(spec.mix[1] === 8 && Object.keys(spec.mix).length === 1, 'Level 0 uses a small hydrogen gas');
check(spec.difficulty === 'apprentice' && spec.gravity === 'micro' && spec.time === 90, 'Level 0 is a short microgravity round');

const rules = JSON.stringify(Sort.DIFFICULTIES);
const box = Sort.create({
  P, E, R: {}, settings: { gravity: 'micro', residenceMean: 0.15, exitLaw: 'cos', collisionModel: 'quantum', sortPreview: true, sortDifficulty: 'demon' },
  W: 1000, H: 680,
});
box.start({ mix: spec.mix, difficulty: spec.difficulty, tutorial: true, time: spec.time, warmup: 0, pace: 1 });
check(JSON.stringify(Sort.DIFFICULTIES) === rules, 'Level 0 does not rewrite the other modes');
check(box.S.tutorial === true && box.S.diff.key === 'level0' && box.S.diff.time === 90, 'the lesson round is not stored under a scored key');
check(box.S.atoms.length === 8 && box.S.atoms.every((a) => a.z === 1), 'every Level 0 atom is hydrogen');
check(box.S.diff.id === 'apprentice' && Sort.DIFFICULTIES.apprentice.time === 180, 'Apprentice itself is unchanged');
const plain = Sort.create({
  P, E, R: {}, settings: { gravity: 'micro', residenceMean: 0.15, exitLaw: 'cos', collisionModel: 'quantum' },
  W: 1000, H: 680,
});
plain.start({ mix: { 1: 8 }, difficulty: 'apprentice', warmup: 0, pace: 1 });
check(plain.S.tutorial !== true && plain.S.diff.key === 'apprentice' && plain.S.diff.time === 180, 'a normal sorting start is not a tutorial');

const themes = [
  [{ door: 'hold', theme: 'victorian', preview: true }, { opened: false }],
  [{ door: 'toggle', theme: 'bw', preview: true }, { opened: false }],
  [{ door: 'hold', theme: 'victorian', preview: false }, { opened: false }],
  [{ door: 'hold', theme: 'victorian', preview: true, doorOpen: true }, { active: true, opened: true }],
  [{ door: 'hold', theme: 'bw', preview: true, doorOpen: true }, { active: true, opened: true }],
  [{ door: 'hold', theme: 'victorian', preview: false, doorOpen: true }, { active: true, opened: true }],
  [{ door: 'hold', theme: 'bw', preview: true, doorOpen: false }, { active: true, opened: true, closed: true }],
];
const lines = themes.map(([opts, st]) => T.line({ active: true, ...st }, opts));
check(lines.every((s) => s && s.length <= 170), `lesson lines stay short: ${lines.map((s) => s.length).join(',')}`);
check(new Set(lines).size === lines.length, 'each step has its own line');
check(lines.some((s) => /trapdoor/i.test(s) && /open/i.test(s) && /shut/i.test(s)), 'the lesson shows how to open and shut the trapdoor');
check(lines.some((s) => /Green ring/.test(s)) && lines.some((s) => /Solid \+/.test(s)), 'marks are described in both themes');
check(lines.some((s) => /score/.test(s) && /k_B ln 2/.test(s) && /temperature/i.test(s)), 'score and temperature are explained in a few words');
const banned = /cheat|bose|condens|analogy|coffee/i;
check(!banned.test(lines.join('\n')) && !banned.test(script('src/tutorial.js')), 'the lesson does not use banned framing');

const sortingSrc = script('src/sorting.js');
const previewFn = sortingSrc.slice(sortingSrc.indexOf('function previewOn'), sortingSrc.indexOf('function lockPreviewHot'));
check(previewFn.indexOf('sortPreview === false') < previewFn.indexOf('S.tutorial'), 'turning highlights off still applies on Level 0');

const game = script('src/game.js');
const startGame = game.slice(game.indexOf('function startGame'), game.indexOf('function setupPaddleGame'));
check(startGame.indexOf('leaveTutorial()') >= 0 && startGame.indexOf('leaveTutorial()') < startGame.indexOf('startSort'), 'a normal run clears Level 0 before play');
const endGame = game.slice(game.indexOf('function endGame'), game.indexOf('function trialEndNote'));
check(endGame.includes('state.tutorial') && endGame.indexOf('state.tutorial') < endGame.indexOf('store.best'), 'paddle records are not reached during Level 0');
const endSort = game.slice(game.indexOf('function endSort'), game.indexOf('function startAttract'));
check(endSort.indexOf('state.tutorial') < endSort.indexOf('store.best'), 'sorting records are not reached during Level 0');
check(game.includes('TUT.setup()') && game.includes('tutorial: true'), 'the round uses the lesson setup');
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
