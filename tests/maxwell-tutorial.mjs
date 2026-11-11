/* Each mode has a first-play tutorial. Skip and Replay mark only the seen
   flags. A tutorial writes no coins, unlocks, or records.
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

const seeded = { coins: 7, unlockedZ: 2, tutorials: { single: false, two: false, sort: false }, settings: { theme: 'victorian', wallTemp: 20e-9 }, best: { 'single:1': 50e-9, 'sort2:demon': 4 } };
const best = seeded.best;

for (const mode of ['single', 'two', 'sort']) {
  check(T.shouldStart(mode, seeded), `${mode} runs the first time it is played`);
  const lesson = T.arm(mode, { door: 'hold' });
  check(lesson.active && T.writesRecords(lesson) === false, `${mode} tutorial does not write records`);
  const lines = [0, 1, 2].map((step) => T.line({ ...lesson, step }));
  check(lines.every((s) => s && s.length <= 170), `${mode} lines stay short: ${lines.map((s) => s.length).join(',')}`);
  check(new Set(lines).size === lines.length, `${mode} steps are distinct`);
  check(/Space pauses/.test(lines[0]), `${mode} says Space pauses`);
  if (mode === 'single') {
    check(/paddle/i.test(lines[0]) && /open right side/i.test(lines[1]) && /temperature/i.test(lines[1]) && /hotter is higher/i.test(lines[1]), 'the default mode teaches the paddle, the objective and the score');
    check(/big number/i.test(lines[2]) && /temperature/i.test(lines[2]), 'the temperature readout is the score');
  }
  if (mode === 'two') {
    check(/pong/i.test(lines[0]) && /W\/S/.test(lines[1]) && /arrows/i.test(lines[1]) && /point/i.test(lines[2]), 'two players teaches pong and both controls');
  }
  if (mode === 'sort') {
    check(/trapdoor/i.test(lines[0]) && /Enter/.test(lines[0]) && /Hold the screen/.test(lines[0]), 'sorting teaches the held trapdoor');
    check(/entropy/i.test(lines[2]) && /ln 2/.test(lines[2]), 'sorting teaches the entropy score');
    const toggled = T.line(T.arm('sort', { door: 'toggle' }));
    check(/Tap the screen/.test(toggled) && /Enter/.test(toggled) && /Space pauses/.test(toggled), 'sorting teaches the toggled trapdoor');
  }
  const banned = /cheat|bose|condens|analogy|coffee/i;
  check(!banned.test(lines.join('\n')) && !banned.test(script('src/tutorial.js')), 'the lesson does not use banned framing');
}
check(T.writesRecords(null) && T.writesRecords(T.create()), 'a normal run still writes records');
const stepped = T.advance(T.advance(T.advance(T.arm('single'))));
check(stepped.complete, 'the default lesson finishes after its steps');
const done = T.finish(stepped, seeded);
check(done.record === false && done.store.tutorials.single === true && done.store.tutorials.two === false, 'finishing marks only that mode seen');
check(done.store.coins === 7 && done.store.unlockedZ === 2 && done.store.best === best, 'finishing keeps coins, unlocks and records');
check(seeded.tutorials.single === false, 'the saved object is copied, not rewritten in place');
check(!T.shouldStart('single', done.store) && T.shouldStart('sort', done.store), 'a seen mode does not run again; the others still do');

const fresh = { coins: 1, unlockedZ: 1, tutorials: { single: false, two: false, sort: false }, best: { 'single:1': 12e-9 } };
const skipped = T.skip(T.arm('two'), fresh);
check(skipped.record === false && skipped.store.tutorials.two === true && skipped.store.tutorials.single === false, 'skip marks only the mode that was showing');
check(skipped.store.coins === 1 && skipped.store.best['single:1'] === 12e-9 && skipped.store.unlockedZ === 1, 'skip does not touch coins, records or unlocks');
check(T.writesRecords(skipped.state), 'after skip, a normal run may write records');
const cleared = T.clearAll({ ...done.store, tutorials: { single: true, two: true, sort: true } });
check(!cleared.tutorials.single && !cleared.tutorials.two && !cleared.tutorials.sort, 'replay clears every mode');
check(cleared.coins === 7 && cleared.best === best, 'replay does not touch coins or records');
T.setEnabled(false);
check(!T.shouldStart('single', fresh), 'tests can turn the tutorial off');
T.setEnabled(true);
check(T.shouldStart('single', fresh), 'turning it back on restores a first run');

const rules = JSON.stringify(Sort.DIFFICULTIES);
const plain = Sort.create({
  P, E, R: {}, settings: { gravity: 'micro', residenceMean: 0.15, exitLaw: 'cos', collisionModel: 'quantum', sortPreview: true, sortDifficulty: 'demon' },
  W: 1000, H: 680,
});
plain.start({ mix: { 1: 8 }, difficulty: 'apprentice', warmup: 0, pace: 1 });
check(JSON.stringify(Sort.DIFFICULTIES) === rules, 'a tutorial does not rewrite sorting difficulties');
check(plain.S.diff.key === 'apprentice' && plain.S.diff.time === 180, 'a normal sorting start is unchanged');
check(!script('src/sorting.js').includes('S.tutorial'), 'sorting is not the lesson');
check(!html.includes('seore') && html.includes('your score'), 'the title says score');
check(!/Level 0|LEVEL 0/.test(html), 'Level 0 wording is gone from the game');

{
  const pageIds = [...html.matchAll(/id: '([a-z0-9]+)', title:/g)].map((m) => m[1]);
  const N = Math.floor(pageIds.length / 2);
  const want = [pageIds[N - 1], pageIds[N], pageIds[N + 1]];
  check(pageIds.length === 28 && N + 2 <= pageIds.length, `numbered notebook pages: ${pageIds.length}`);
  check(want.join() === 'speeds,waves,lasercool', `middle pages are ${want.join(', ')}`);
  const fade = html.match(/const MUG_FADE = \{([^}]+)\}/);
  check(fade && fade[1].replace(/\s/g, '') === 'speeds:0,waves:1,lasercool:2', `in-game mug pages: ${fade && fade[1]}`);
  check(html.includes('seed: 1867') && html.includes('lineGap / 12') && html.includes('x: outer / 2') && html.includes('6.25 * lineGap'), 'mug seed, size and centre stay as reviewed');
  const pub = readFileSync(new URL('../notebook/maxwells-demon/index.html', import.meta.url), 'utf8');
  const pubIds = [...pub.matchAll(/id="note-([a-z0-9]+)"/g)].map((m) => m[1]).filter((id) => id !== 'contents');
  check(pubIds.join() === pageIds.join(), 'the public notebook lists the same numbered pages');
  const pubFade = pub.match(/var FADE = \{([^}]+)\}/);
  check(pubFade && pubFade[1].replace(/\s/g, '') === 'speeds:0,waves:1,lasercool:2', `public mug pages: ${pubFade && pubFade[1]}`);
}

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
check(startGame.indexOf('modeAllowed') >= 0 && startGame.indexOf('modeAllowed') < startGame.indexOf('beginModeTutorial'), 'a locked mode returns before any tutorial');
check(startGame.indexOf('leaveTutorial()') >= 0 && startGame.indexOf('leaveTutorial()') < startGame.indexOf('startSort'), 'starting a mode clears a previous lesson first');
const endGame = game.slice(game.indexOf('function endGame'), game.indexOf('function trialEndNote'));
check(endGame.includes('state.tutorial') && endGame.indexOf('state.tutorial') < endGame.indexOf('store.best'), 'paddle records are not reached during a tutorial');
const endSort = game.slice(game.indexOf('function endSort'), game.indexOf('function startAttract'));
check(endSort.indexOf('state.tutorial') < endSort.indexOf('store.best'), 'sorting records are not reached during a tutorial');
const chrome = game.slice(game.indexOf('function clearTutorialChrome'), game.indexOf('function leaveTutorial'));
const dismiss = game.slice(game.indexOf('function dismissTutorial'), game.indexOf('function finishTutorial'));
check(chrome.includes("classList.remove('tutorial')") && chrome.includes('b-skip-tutorial') && chrome.includes('hidden = true'), 'skip hides the tutorial and its button');
check(dismiss.includes('clearTutorialChrome()') && dismiss.includes("showPanel(null)") && dismiss.includes("state.screen = 'playing'"), 'skip leaves an unpaused game with no overlay');
const keys = game.slice(game.indexOf("addEventListener('keydown'"), game.indexOf("addEventListener('keyup'"));
const up = game.slice(game.indexOf("addEventListener('keyup'"), game.indexOf("addEventListener('blur'"));
check(keys.includes("e.code === 'Space'") && keys.includes('pause()'), 'Space pauses');
check(keys.includes("e.code === 'Escape' && state.tutorial") && keys.includes('skipTutorial()'), 'Escape skips the tutorial');
const doorAt = keys.indexOf('SORT.doorDown()');
check(doorAt > 0 && !keys.slice(Math.max(0, doorAt - 280), doorAt).includes('Space'), 'Space does not open the trapdoor');
check(keys.includes("e.code === 'Enter' && state.mode === 'sort'") && keys.includes('SORT.doorDown()'), 'Enter holds the trapdoor in Sorting');
check(!keys.includes('!state.tutorial'), 'Enter still opens the trapdoor during the sorting tutorial');
check(up.includes("e.code === 'Enter'") && up.includes('SORT.doorUp()') && !up.includes('Space'), 'releasing Enter shuts a held door, and Space does not');
check(keys.includes('focusOwnsKey'), 'Space and Enter are left with fields and focused controls');
const adsorb = game.slice(game.indexOf('function adsorb'), game.indexOf('function desorb'));
check(adsorb.indexOf('state.tutorial') < adsorb.indexOf('store.coins++'), 'a tutorial paddle touch does not pay a coin');
check(html.includes('id="b-skip-tutorial"') && html.includes('>Skip<') && html.includes('id="s-replay"') && html.includes('Replay tutorial'), 'skip and replay controls are in the page');
check(!html.includes('id="b-level0"') && !html.includes('id="s-level0"'), 'the Level 0 entry points are gone');
check(game.includes('replayTutorials') && game.includes('TUT.clearAll'), 'settings replay clears every mode and starts the current one');

{
  const mem = new Map();
  const writes = [];
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { writes.push(k); mem.set(k, v); },
    removeItem: (k) => mem.delete(k),
  };
  const ctx = { console, Math, Number, Object, JSON, isFinite, localStorage };
  ctx.self = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script('src/physics.js'), ctx);
  vm.runInContext(script('src/settings.js'), ctx);
  const Settings = ctx.MDSettings;
  writes.length = 0;
  const first = Settings.load();
  check(writes.length === 0, 'loading a fresh save writes nothing');
  check(first.tutorials.single === false && first.tutorials.two === false && first.tutorials.sort === false, 'a fresh save has seen no tutorial');
  check(!Object.prototype.hasOwnProperty.call(first, 'tutorialSeen'), 'a fresh save has no dead Level 0 flag');
  check(first.coins === 0 && first.settings.wallHeat === 'preset', 'a fresh save is otherwise the normal new game');
  first.tutorials = { single: true, two: false, sort: true }; first.coins = 3; first.best['single:1'] = 50e-9; Settings.save(first);
  const kept = Settings.load();
  check(kept.tutorials.single === true && kept.tutorials.sort === true && kept.tutorials.two === false, 'seen flags reload per mode');
  check(kept.coins === 3 && kept.best['single:1'] === 50e-9, 'the flags reload beside coins and records');
  check(kept.settings.wallTemp === 20e-9, 'saving the flags does not retune the wall');
  mem.set(Settings.KEY, JSON.stringify({ tutorialSeen: true, settings: { tempScale2: true, wallTemp: 30e-9 }, coins: 9, unlockedZ: 4, best: { 'single:1': 80e-9 } }));
  writes.length = 0;
  const migrated = Settings.load();
  check(migrated.tutorials.single === true && migrated.tutorials.two === false && migrated.tutorials.sort === false, 'an old Level 0 flag counts as the default mode only');
  check(migrated.coins === 9 && migrated.unlockedZ === 4 && migrated.best['single:1'] === 80e-9, 'migration keeps coins, unlocks and records');
  check(migrated.settings.wallTemp === 30e-9 && migrated.settings.wallHeat === 'absolute', 'migration does not retune an absolute wall');
  const stored = JSON.parse(mem.get(Settings.KEY));
  check(stored.tutorialSeen === undefined && stored.tutorials.single === true, 'migration drops the dead flag and keeps one key');
  check(writes.length === 1 && writes[0] === Settings.KEY, 'migration writes only the game save');
  mem.set(Settings.KEY, JSON.stringify({ settings: { tempScale2: true, wallTemp: 30e-9 }, coins: 9, unlockedZ: 4, best: { 'single:1': 80e-9 } }));
  const older = Settings.load();
  check(!older.tutorials.single && older.coins === 9 && older.best['single:1'] === 80e-9, 'a save with no old flag has not seen the default tutorial');
  const wiped = Settings.reset();
  check(!wiped.tutorials.single && wiped.coins === 0 && Object.keys(wiped.best).length === 0, 'erase progress is a fresh start');
  const before = JSON.parse(JSON.stringify(wiped));
  const after = T.skip(T.arm('single'), wiped).store;
  check(after.tutorials.single === true && after.coins === before.coins && JSON.stringify(after.best) === JSON.stringify(before.best) && after.unlockedZ === before.unlockedZ, 'skip writes nothing except the seen flag');
}

if (failures.length) {
  console.error(failures.map((f) => 'FAIL ' + f).join('\n'));
  process.exit(1);
}
console.log('tutorial ok');
