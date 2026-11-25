// Story and missions test (pure logic). Run: node --experimental-strip-types scripts/story-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, buyItem, addXp, levelNow, owned, sanitizeClub, upgradeItem } from '../src/core/club.ts';
import { BY_ID } from '../src/core/catalog.ts';
import { xpToNext, phaseForLevel, PHASE_LEVELS } from '../src/core/progression.ts';
import { MISSIONS, SCENES, SPEAKERS, checkMissions, pendingScene, markSeen, activeMissions, allMissions, fillText, progressOf } from '../src/core/story.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const put = (s, id, x, y, rot = 0, mode = 'buy') => { const r = placeItem(s, id, x, y, rot, mode); assert.equal(r.error, undefined, `${id}: ${r.error}`); return r.state; };
const rich = (s = newClub()) => ({ ...s, coins: 200000 });
const toLevel = (s, lv) => { let xp = 0; for (let l = 1; l < lv; l++) xp += xpToNext(l); return { ...addXp({ ...s, xp: 0 }, xp), phase: Math.max(s.phase, phaseForLevel(lv)) }; };

test('content is consistent: unique ids, known speakers, known catalog items, scenes for every phase', () => {
  const ids = MISSIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(SCENES.map((s) => s.id)).size, SCENES.length);
  for (const sc of SCENES) for (const l of sc.lines) assert.ok(l.who in SPEAKERS, `${sc.id}: unknown speaker ${l.who}`);
  for (const m of MISSIONS) {
    for (const id of Object.keys(m.reward.items ?? {})) assert.ok(BY_ID.has(id), `${m.id}: reward ${id}`);
    if (m.goal.kind === 'placed') for (const id of m.goal.ids) assert.ok(BY_ID.has(id), `${m.id}: goal ${id}`);
  }
  for (let phase = 2; phase <= 7; phase++) assert.ok(SCENES.some((s) => s.phase === phase), `no scene for phase ${phase}`);
  assert.ok(SCENES[0].id === 'intro' && SCENES[0].phase === 0);
});

test('the intro plays first and only once, and names are filled in', () => {
  let s = newClub();
  assert.equal(pendingScene(s).id, 'intro');
  s = markSeen(s, 'intro');
  assert.equal(s.story.intro, true);
  assert.equal(pendingScene(s), null, 'nothing else at phase 1');
  assert.equal(fillText('Hola {name}', { name: '' }), 'Hola DJ');
  assert.equal(fillText('Hola {name}', { name: 'Ana' }), 'Hola Ana');
});

test('a phase scene appears when the club grows, and only once', () => {
  let s = markSeen(newClub(), 'intro');
  s = toLevel(s, PHASE_LEVELS[1]);
  assert.equal(s.phase, 2);
  assert.equal(pendingScene(s).id, 'ch2');
  s = markSeen(s, 'ch2');
  assert.equal(pendingScene(s), null);
  assert.equal(pendingScene({ ...toLevel(s, PHASE_LEVELS[3]), story: { ...s.story } }).id, 'ch3', 'skipped phases still tell their scenes in order');
});

test('tutorial chain: each chapter-1 mission completes by doing exactly what its hint says', () => {
  let s = newClub();
  assert.equal(activeMissions(s)[0].mission.id, 'tiles');
  // buy 4 tiles into the inventory (Tienda) and place them (Colocar)
  s = buyItem(s, 'floor_cyan', 4).state;
  for (let i = 0; i < 4; i++) s = put(s, 'floor_cyan', 3 + i, 4, 0, 'inventory');
  let c = checkMissions(s);
  assert.deepEqual(c.completed.map((m) => m.id), ['tiles']);
  s = c.state;
  assert.ok(s.coins > 0);
  // the uncle's booth from the inventory
  s = put(s, 'dj_booth', 5, 0, 0, 'inventory');
  c = checkMissions(s); s = c.state;
  assert.deepEqual(c.completed.map((m) => m.id), ['booth']);
  // bar
  s = put({ ...s, coins: s.coins + 3000 }, 'bar_straight', 1, 0);
  c = checkMissions(s); s = c.state;
  assert.deepEqual(c.completed.map((m) => m.id), ['bar']);
  assert.equal(activeMissions(s)[0].mission.id, 'guests10');
});

test('rewards are paid once, in coins, XP and items, and a level-up can chain into the next mission', () => {
  let s = rich();
  s = { ...s, stats: { ...s.stats, guests: 10 } };
  const before = s.coins;
  let c = checkMissions(s);
  assert.ok(c.completed.some((m) => m.id === 'guests10'));
  assert.ok(c.state.coins > before);
  const again = checkMissions(c.state);
  assert.equal(again.completed.length, 0, 'never paid twice');
  // reaching level 3 gives the trophy as an item
  let t = toLevel(rich(), 3);
  t = checkMissions(t).state;
  assert.equal(owned(t, 'trophy_cup') >= 1, true);
  assert.ok(t.story.done.includes('level3'));
});

test('missions of later chapters stay hidden until the building reaches that phase', () => {
  let s = newClub();
  assert.ok(allMissions(s).every((m) => m.mission.chapter === 1));
  s = toLevel(s, 6);
  assert.ok(allMissions(s).some((m) => m.mission.chapter === 2));
  assert.ok(!allMissions(s).some((m) => m.mission.chapter === 3));
});

test('progress never exceeds the target and "placed" with several ids counts kinds', () => {
  let s = rich();
  s = toLevel(s, 13);
  const m = MISSIONS.find((x) => x.id === 'booth2');
  assert.equal(progressOf(m, s).current, 0);
  s = put(s, 'booth', 8, 8); s = put(s, 'disco_ball', 2, 8);
  assert.deepEqual(progressOf(m, s), { current: 2, target: 2 });
  assert.ok(levelNow(s) >= 13);
});

test('the prologue is fully illustrated: it opens with a panel and only uses known panel ids', () => {
  const intro = SCENES.find((x) => x.id === 'intro');
  assert.ok(intro.lines[0].shot, 'the first line names its panel');
  const known = new Set(['city', 'door', 'letter', 'beto_dream', 'record', 'inside', 'rosa_bar', 'empty_floor', 'dream_party', 'zeta', 'neon_fest']);
  for (const l of intro.lines) {
    for (const id of [l.shot, l.inset]) if (id) assert.ok(known.has(id), `unknown panel ${id}`);
  }
  assert.ok(intro.lines.some((l) => l.inset === 'dream_party'), 'the dream of a full club is shown');
});

test('the tutorial progress is saved and survives dirty input', () => {
  assert.equal(newClub().story.tutorial, 0);
  assert.equal(sanitizeClub({ story: { tutorial: 5 } }).story.tutorial, 5);
  assert.equal(sanitizeClub({ story: { tutorial: -1 } }).story.tutorial, -1);
  assert.equal(sanitizeClub({ story: { tutorial: 'x' } }).story.tutorial, 0);
  assert.equal(sanitizeClub({ story: { tutorial: 9999 } }).story.tutorial, 99);
});

test('the sound mission follows what its text says: better speakers and booth, not any four Premium pieces', () => {
  const m = MISSIONS.find((x) => x.id === 'soundsys');
  let st = { ...newClub(), phase: 2, xp: 40000 };
  st = placeItem(placeItem(st, 'speaker', 1, 1, 0, 'free').state, 'dj_booth', 4, 1, 0, 'free').state;
  assert.equal(progressOf(m, st).current, 1, 'basement gear: sound 1');
  const up = (s2) => { let x = s2; for (const it of s2.items) x = upgradeItem({ ...x, coins: 1e9 }, it.uid).state; return x; };
  const better = up(st);
  assert.deepEqual(progressOf(m, better), { current: 2, target: 2 }, 'every piece one version up completes it');
  assert.ok(checkMissions(better).completed.some((c) => c.id === 'soundsys'));
  assert.equal(progressOf(MISSIONS.find((x) => x.id === 'soundsys3'), better).current, 2);
});

console.log(`\n${passed} tests passed`);
