// The catalog is consistent: unique ids, sane numbers, seats where they should be, and a ladder of unlock levels with no long gaps.
import assert from 'node:assert/strict';
import { CATALOG, CATEGORIES } from '../src/core/catalog.ts';
import { PHASES } from '../src/core/club.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

test('ids are unique, every object has a category, a price, luxury and a footprint that fits the biggest club', () => {
  assert.equal(new Set(CATALOG.map((d) => d.id)).size, CATALOG.length);
  const cats = new Set(CATEGORIES.map((c) => c.id));
  const biggest = PHASES[PHASES.length - 1];
  for (const d of CATALOG) {
    assert.ok(cats.has(d.category), d.id);
    assert.ok(d.price > 0 && d.luxury > 0 && d.w >= 1 && d.d >= 1 && d.w <= biggest.w && d.d <= biggest.h, d.id);
    assert.ok(d.unlockLevel >= 1 && d.unlockLevel <= 45, d.id);
    if (d.seats) assert.ok(d.seats <= d.w * d.d, `${d.id}: more seats than tiles`);
  }
});

test('the ladder of unlocks has no gap longer than 8 levels up to level 31', () => {
  const levels = [...new Set(CATALOG.map((d) => d.unlockLevel))].sort((a, b) => a - b).filter((l) => l <= 31);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 8, `gap between ${levels[i - 1]} and ${levels[i]}`);
});

test('no object gives more than 0.05 luxury per coin (no free lunch)', () => {
  for (const d of CATALOG) {
    const perCoin = d.luxury / d.price;
    assert.ok(perCoin <= 0.05, `${d.id} gives ${perCoin.toFixed(3)} luxury per coin`);
  }
});

console.log(`\n${passed} tests passed`);
