// The four versions of every object (pure logic). Run: node --experimental-strip-types scripts/tiers-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, upgradeItem, stashItem, sellKept, removeItem, sellValue, statsOf, soundSystem, tierOfItem, sanitizeClub } from '../src/core/club.ts';
import { BY_ID, CATALOG } from '../src/core/catalog.ts';
import { TIER_COST, TIER_LEVEL, TIER_LUXURY, upgradeCost, invested, soundQuality } from '../src/core/tiers.ts';
import { GuestSim } from '../src/core/guests.ts';
import { assetValue } from '../src/core/ledger.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const rich = (level = 40) => ({ ...newClub(), coins: 1e12, xp: level >= 40 ? 1e9 : 0 });
const put = (s, id, x, y) => placeItem(s, id, x, y, 0, 'free').state;

test('upgrading costs more each time, needs the level, and pays only once per step', () => {
  const bar = BY_ID.get('bar_straight');
  let s = put({ ...rich(), phase: 3 }, 'bar_straight', 1, 1);
  const uid = s.items[0].uid;
  for (let t = 1; t < 4; t++) {
    const before = s.coins;
    s = upgradeItem(s, uid).state;
    assert.equal(tierOfItem(s.items[0]), t + 1);
    assert.equal(before - s.coins, upgradeCost(bar.price, t));
  }
  assert.match(upgradeItem(s, uid).error, /mejor versión/);
  assert.ok(TIER_COST[1] < TIER_COST[2] && TIER_COST[2] < TIER_COST[3]);
  const poor = put({ ...newClub(), coins: 1e12, xp: 0 }, 'bar_straight', 1, 1);
  assert.match(upgradeItem(poor, poor.items[0].uid).error, new RegExp(`nivel ${TIER_LEVEL[1]}`));
  const broke = { ...put(rich(), 'bar_straight', 1, 1), coins: 5 };
  assert.match(upgradeItem(broke, broke.items[0].uid).error, /monedas/);
});

test('better versions give more luxury; selling returns half of everything paid; an improved piece is stashed with its version', () => {
  let s = put({ ...rich(), phase: 3 }, 'speaker', 1, 1);
  const base = statsOf(s).luxury;
  const uid = s.items[0].uid;
  s = upgradeItem(upgradeItem(s, uid).state, uid).state;
  assert.equal(statsOf(s).luxury, Math.round(BY_ID.get('speaker').luxury * TIER_LUXURY[2]));
  assert.ok(statsOf(s).luxury > base * 2);
  const def = BY_ID.get('speaker');
  assert.equal(sellValue(def, 3), Math.floor(invested(def.price, 3) / 2));
  assert.ok(sellValue(def, 3) > sellValue(def, 1) * 3);
  // stashing keeps the version: nothing is lost, it comes back as it was, and it can be sold at its value
  const away = stashItem(s, uid);
  assert.equal(away.error, undefined);
  assert.equal(away.state.items.length, 0);
  assert.equal(away.state.kept.length, 1);
  assert.equal(away.state.kept[0].tier, 3);
  assert.equal(Object.keys(away.state.inventory).includes('speaker'), false, 'it does not go to the plain inventory');
  assert.equal(assetValue(away.state), assetValue(s), 'its value still counts');
  const back = sanitizeClub(JSON.parse(JSON.stringify(away.state)));
  assert.deepEqual(back.kept, away.state.kept, 'it survives saving and loading');
  const soldKept = sellKept(away.state, away.state.kept[0].uid);
  assert.equal(soldKept.state.coins - s.coins, sellValue(def, 3));
  assert.equal(soldKept.state.kept.length, 0);
  const sold = removeItem(s, uid);
  assert.equal(sold.state.coins - s.coins, sellValue(def, 3));
  assert.equal(stashItem(put(rich(), 'plant', 1, 1), 'i1').error, undefined, 'a basic piece still goes to the inventory');
});

test('the sound system is the average version of speakers and the DJ booth', () => {
  let s = { ...rich(), phase: 3 };
  assert.equal(soundSystem(s), 0);
  s = put(put(s, 'speaker', 1, 1), 'dj_booth', 5, 1);
  assert.equal(soundSystem(s), 1);
  s = upgradeItem(s, s.items[0].uid).state;
  assert.equal(soundSystem(s), 1.5);
  assert.equal(soundQuality([4, 4]), 4);
});

test('a saved improved piece keeps its version; junk versions are cleaned', () => {
  let s = put({ ...rich(), phase: 3 }, 'sofa_red_2', 1, 1);
  s = upgradeItem(s, s.items[0].uid).state;
  const back = sanitizeClub(JSON.parse(JSON.stringify(s)));
  assert.equal(tierOfItem(back.items.find((i) => i.id === 'sofa_red_2')), 2);
  assert.equal(tierOfItem(sanitizeClub({ items: [{ id: 'plant', x: 1, y: 1, rot: 0, tier: 99 }] }).items[0]), 4);
  assert.equal(tierOfItem(sanitizeClub({ items: [{ id: 'plant', x: 1, y: 1, rot: 0, tier: 'x' }] }).items[0]), 1);
});

test('a better bar charges more for each drink', () => {
  const night = (tier) => {
    let s = { ...rich(), phase: 3 };
    for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) s = put(s, 'floor_cyan', x, y);
    s = put(put(s, 'bar_straight', 1, 1), 'dj_booth', 7, 1);
    for (const x of [1, 2, 3]) s = put(s, 'stool', x, 2);
    for (let t = 1; t < tier; t++) s = upgradeItem(s, s.items.find((i) => i.id === 'bar_straight').uid).state;
    const sim = new GuestSim(21);
    sim.setLayout(s);
    let drinks = 0, n = 0;
    for (let t = 0; t < 900; t += 0.1) { sim.update(0.1); for (const e of sim.events) if (e.kind === 'drink') { drinks += e.amount; n++; } }
    return drinks / n;
  };
  const [a, b, c] = [night(1), night(3), night(4)];
  assert.ok(b > a * 1.15 && c > b * 1.1, `average drink ${a.toFixed(1)} / ${b.toFixed(1)} / ${c.toFixed(1)}`);
});

test('every object can be improved: nothing in the catalog is left out', () => {
  for (const d of CATALOG) {
    let s = put({ ...rich(), phase: 7 }, d.id, 2, 2);
    const it = s.items[0];
    if (!it) continue; // some pieces need room the test does not give
    for (let t = 1; t < 4; t++) s = upgradeItem(s, it.uid).state;
    assert.equal(tierOfItem(s.items[0]), 4, d.id);
  }
});

console.log(`\n${passed} tests passed`);
