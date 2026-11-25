// The level-up pop-up lists exactly what the game unlocks (pure logic). Run: node --experimental-strip-types scripts/unlocks-test.mjs
import assert from 'node:assert/strict';
import { unlocksAt, unlocksBetween, nextUnlockLevel } from '../src/core/unlocks.ts';
import { CATALOG } from '../src/core/catalog.ts';
import { UPGRADES } from '../src/core/exterior.ts';
import { STAFF } from '../src/core/staff.ts';
import { RENOVATIONS } from '../src/core/renovation.ts';
import { PHASE_LEVELS } from '../src/core/progression.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const all = [];
for (let l = 1; l <= 80; l++) for (const u of unlocksAt(l)) all.push({ ...u, level: l });

test('every unlockable thing appears once, at the level the game really unlocks it', () => {
  for (const d of CATALOG.filter((d) => d.unlockLevel > 1)) assert.equal(all.filter((u) => u.kind === 'item' && u.id === d.id && u.level === d.unlockLevel).length, 1, d.id);
  for (const s of STAFF) assert.equal(all.filter((u) => u.kind === 'staff' && u.id === s.role && u.level === s.unlockLevel).length, 1, s.role);
  for (const f of UPGRADES.filter((u) => u.price > 0)) assert.equal(all.filter((u) => u.kind === 'facade' && u.id === f.id && u.level === f.unlockLevel).length, 1, f.id);
  for (const r of RENOVATIONS) assert.equal(all.filter((u) => u.kind === 'renovation' && u.level === r.unlockLevel).length, 1, `reno ${r.tier}`);
  for (const lv of PHASE_LEVELS.slice(1)) assert.equal(all.filter((u) => u.kind === 'phase' && u.level === lv).length, 1, `phase at ${lv}`);
});

test('every unlock says where to find it', () => {
  assert.ok(all.every((u) => u.name && u.desc && u.place));
});

test('jumping several levels lists each level once and in order; nothing before the first level', () => {
  const g = unlocksBetween(2, 6);
  assert.deepEqual(g.map((x) => x.level), [...new Set(g.map((x) => x.level))].sort((a, b) => a - b));
  assert.ok(g.every((x) => x.level > 2 && x.level <= 6));
  assert.deepEqual(unlocksBetween(5, 5), []);
  assert.equal(unlocksAt(1).length, 0, 'level 1 is where you start');
  assert.ok(nextUnlockLevel(1) > 1);
});

console.log(`\n${passed} tests passed`);
