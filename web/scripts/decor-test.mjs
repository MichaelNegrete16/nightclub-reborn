// Interior finishes (pure logic). Run: node --experimental-strip-types scripts/decor-test.mjs
import assert from 'node:assert/strict';
import { newClub, sanitizeClub, statsOf } from '../src/core/club.ts';
import { DECOR, DECOR_BY_ID, DEFAULTS, GROUPS, buyDecor, chooseDecor, decorLuxury, optionsOf, sanitizeDecor } from '../src/core/decor.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const rich = (xp = 1e9) => ({ ...newClub(), coins: 1e12, xp });

test('the club starts as a bare basement and every group has a free starting option and four or more upgrades', () => {
  const d = newClub().decor;
  assert.deepEqual(d.sel, DEFAULTS);
  assert.equal(decorLuxury(d), 0);
  for (const g of GROUPS) {
    const o = optionsOf(g.id);
    assert.ok(o.length >= 4, g.id);
    assert.equal(o.filter((x) => x.price === 0).length, 1, `${g.id} has one free option`);
    const paid = o.filter((x) => x.price > 0);
    assert.deepEqual(paid.map((x) => x.price), [...paid.map((x) => x.price)].sort((a, b) => a - b), `${g.id} gets pricier`);
    assert.deepEqual(paid.map((x) => x.unlockLevel), [...paid.map((x) => x.unlockLevel)].sort((a, b) => a - b), `${g.id} opens in order`);
  }
});

test('buying needs level and coins, puts the finish on at once and adds luxury; owned finishes can be switched for free', () => {
  assert.match(buyDecor({ ...newClub(), coins: 1e12 }, 'wall_marble').error, /nivel/);
  assert.match(buyDecor({ ...rich(), coins: 3 }, 'wall_paint').error, /monedas/);
  let s = rich();
  const before = statsOf(s).luxury;
  s = buyDecor(s, 'wall_brick').state;
  assert.equal(s.decor.sel.wall, 'wall_brick');
  assert.equal(statsOf(s).luxury - before, DECOR_BY_ID.get('wall_brick').luxury);
  assert.match(buyDecor(s, 'wall_brick').error, /Ya la tienes/);
  const paid = s.coins;
  s = chooseDecor(s, 'wall_concrete').state;
  assert.equal(s.decor.sel.wall, 'wall_concrete');
  assert.equal(s.coins, paid, 'switching back is free');
  assert.match(chooseDecor(s, 'wall_neon').error, /Todavía/);
  assert.equal(statsOf(s).luxury, before, 'only what is in use adds luxury');
});

test('the best of everything adds a lot of luxury; saves are cleaned of unknown or mismatched finishes', () => {
  let s = rich();
  for (const o of DECOR) if (o.price > 0) s = buyDecor(s, o.id).state;
  assert.ok(decorLuxury(s.decor) >= 200);
  const d = sanitizeDecor({ owned: ['wall_marble', 'nope', 5], sel: { wall: 'wall_marble', floor: 'wall_marble', trim: 'trim_gold', light: 'x' } });
  assert.equal(d.sel.wall, 'wall_marble');
  assert.equal(d.sel.floor, DEFAULTS.floor, 'a wall cannot be a floor');
  assert.equal(d.sel.trim, DEFAULTS.trim, 'in use but not owned: back to the default');
  assert.equal(sanitizeClub({ decor: 'junk' }).decor.sel.wall, DEFAULTS.wall);
});

console.log(`\n${passed} tests passed`);
