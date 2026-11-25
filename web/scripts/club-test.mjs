// Rules test for the club (pure logic, no browser). Run: node --experimental-strip-types scripts/club-test.mjs
import assert from 'node:assert/strict';
import {
  newClub, placeItem, buyItem, removeItem, stashItem, sellFromInventory, setPhase, sanitizeClub, validatePlacement,
  statsOf, doorCells, phaseOf, addXp, owned, levelNow, START_COINS, canOpen, setOpen,
} from '../src/core/club.ts';
import { BY_ID } from '../src/core/catalog.ts';
import { EXPANSION_PRICE, buyExpansion, nextExpansion } from '../src/core/expansion.ts';
import { levelOf, xpToNext, phaseForLevel, PHASE_LEVELS } from '../src/core/progression.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const rich = (s = newClub()) => ({ ...s, coins: 200000 * 100 });
const at = (s, level) => { let n = 1, xp = 0; while (n < level) xp += xpToNext(n++); return { ...s, xp, phase: Math.max(s.phase, phaseForLevel(level)) }; };
const place = (s, id, x, y, rot = 0, mode = 'buy') => {
  const r = placeItem(s, id, x, y, rot, mode);
  assert.equal(r.error, undefined, `${id}@${x},${y}: ${r.error}`);
  return r.state;
};

// ---------------------------------------------------------------- progression
test('levels follow the XP curve and phases unlock at the planned levels', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(xpToNext(1)).level, 2);
  assert.equal(levelOf(xpToNext(1) - 1).level, 1);
  assert.deepEqual(PHASE_LEVELS.map((l) => phaseForLevel(l)), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(phaseForLevel(5), 1);
  assert.equal(phaseForLevel(6), 2);
});

test('XP never changes the building by itself: only paying for the expansion does, and only once the level opens it', () => {
  let s = addXp(newClub(), 100000);
  assert.equal(s.phase, 1, 'a high level alone does not grow the club');
  assert.ok(levelNow(s) >= PHASE_LEVELS[1]);
  const e = nextExpansion(s);
  assert.equal(e.phase.id, 2);
  assert.ok(e.price >= 5000, 'the works cost real money');
  assert.match(buyExpansion({ ...s, coins: 10 }).error, /monedas/);
  assert.match(buyExpansion({ ...newClub(), coins: 1e9 }).error, /nivel 6/);
  s = { ...s, coins: 1e9, items: [] };
  const placed = placeItem(s, 'plant', 1, 1, 0, 'free').state;
  const bought = buyExpansion(placed);
  assert.equal(bought.state.phase, 2);
  assert.equal(placed.coins - bought.state.coins, e.price);
  assert.equal(bought.state.items.length, 1, 'the furniture stays');
  let top = { ...s, phase: 7 };
  assert.match(buyExpansion(top).error, /más grande/);
  const prices = EXPANSION_PRICE.slice(2);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'each stage costs more than the last');
});

// ---------------------------------------------------------------- buying and the inventory
test('the story starts with the uncle\'s DJ booth in the inventory and a small purse', () => {
  const s = newClub();
  assert.equal(s.coins, START_COINS);
  assert.equal(owned(s, 'dj_booth'), 1);
  assert.equal(s.items.length, 0);
});

test('buying puts the object in the inventory and charges the price', () => {
  const r = buyItem(newClub(), 'bar_straight');
  assert.equal(r.error, undefined);
  assert.equal(r.state.coins, START_COINS - BY_ID.get('bar_straight').price);
  assert.equal(owned(r.state, 'bar_straight'), 1);
  assert.equal(r.state.items.length, 0);
});

test('the first purchase of each object gives discovery XP, repeats do not (no farming)', () => {
  let s = rich();
  s = buyItem(s, 'chair_red').state;
  const first = s.xp;
  assert.ok(first >= 1);
  s = buyItem(s, 'chair_red').state;
  assert.equal(s.xp, first);
  s = sellFromInventory(sellFromInventory(s, 'chair_red').state, 'chair_red').state;
  s = buyItem(s, 'chair_red').state;
  assert.equal(s.xp, first, 'buy/sell loops give nothing');
});

test('not enough coins, locked by level', () => {
  assert.equal(buyItem({ ...newClub(), coins: 10 }, 'bar_straight').error, 'No te alcanzan las monedas');
  assert.match(buyItem(rich(), 'sofa_red_2').error, /nivel 6/);
  assert.equal(buyItem(at(rich(), 6), 'sofa_red_2').error, undefined);
});

test('placing from the inventory consumes the copy', () => {
  let s = buyItem(newClub(), 'stool').state;
  s = place(s, 'stool', 2, 2, 0, 'inventory');
  assert.equal(owned(s, 'stool'), 0);
  assert.equal(s.items.length, 1);
  assert.equal(placeItem(s, 'stool', 3, 3, 0, 'inventory').error, 'No tienes ese objeto en el inventario');
});

test('"buy" mode uses an owned copy first, otherwise buys one', () => {
  let s = rich();
  s = place(s, 'plant', 1, 1);                 // buys
  assert.equal(s.coins, rich().coins - BY_ID.get('plant').price);
  s = buyItem(s, 'plant').state;               // owned: 1
  const coins = s.coins;
  s = place(s, 'plant', 2, 1);                 // uses the owned copy, no charge
  assert.equal(s.coins, coins);
  assert.equal(owned(s, 'plant'), 0);
});

test('stashing returns an object to the inventory without any money moving', () => {
  let s = place(rich(), 'table_low', 3, 3);
  const coins = s.coins;
  s = stashItem(s, s.items[0].uid).state;
  assert.equal(s.coins, coins);
  assert.equal(owned(s, 'table_low'), 1);
  assert.equal(s.items.length, 0);
});

test('selling pays 50%, from the room or from the inventory', () => {
  let s = place(rich(), 'bar_straight', 2, 2);
  const c0 = s.coins;
  s = removeItem(s, s.items[0].uid).state;
  assert.equal(s.coins, c0 + BY_ID.get('bar_straight').price / 2);
  s = buyItem(s, 'plant').state;
  const c1 = s.coins;
  s = sellFromInventory(s, 'plant').state;
  assert.equal(s.coins, c1 + BY_ID.get('plant').price / 2);
  assert.equal(sellFromInventory(s, 'plant').error, 'No tienes ese objeto');
});

test('moving (free placement, no refund) leaves coins and inventory untouched', () => {
  let s = place(rich(), 'chair_red', 1, 1);
  const { coins, inventory } = s;
  const uid = s.items[0].uid;
  s = removeItem(s, uid, false).state;
  s = place(s, 'chair_red', 4, 4, 0, 'free');
  assert.equal(s.coins, coins - 0);
  assert.deepEqual(s.inventory, inventory);
});

// ---------------------------------------------------------------- the grid rules (unchanged behaviour)
test('rejects overlapping objects, allows a floor tile under an object', () => {
  let s = place(rich(), 'table_low', 3, 3);
  assert.equal(placeItem(s, 'plant', 3, 3, 0).error, 'Ese espacio está ocupado');
  s = place(s, 'floor_cyan', 3, 3);
  assert.equal(s.items.length, 2);
});

test('rejects items outside the room (rotation changes the footprint)', () => {
  const s = rich();
  assert.equal(placeItem(s, 'plant', 8, 0, 0).error, 'Fuera del local');
  assert.equal(placeItem(s, 'bar_straight', 6, 0, 0).error, 'Fuera del local');
  assert.equal(placeItem(s, 'bar_straight', 6, 0, 1).error, undefined);
});

test('never lets you cover the entrance', () => {
  const s = rich();
  const [dx, dy] = doorCells(phaseOf(s))[0];
  assert.equal(placeItem(s, 'plant', dx, dy, 0).error, 'No puedes tapar la entrada');
});

test('max copies (one DJ booth)', () => {
  const s = place(rich(), 'dj_booth', 1, 1);
  assert.equal(placeItem(s, 'dj_booth', 4, 1, 0).error, 'Solo puedes tener 1');
});

test('cannot wall in a DJ booth, nor seal the room off from the door', () => {
  let s = place(rich(), 'dj_booth', 3, 3);
  const ring = [[2, 3], [5, 3], [3, 2], [4, 2], [3, 4], [4, 4]];
  for (const [x, y] of ring.slice(0, 5)) s = place(s, 'plant', x, y);
  assert.equal(placeItem(s, 'plant', ring[5][0], ring[5][1], 0).error, 'Bloquearías el paso');

  let t = place(rich(), 'bar_straight', 1, 1);
  for (let x = 0; x < 7; x++) t = place(t, 'plant', x, 5);
  assert.equal(placeItem(t, 'plant', 7, 5, 0).error, 'Bloquearías el paso');
});

test('changing the phase keeps what no longer fits in the inventory (nothing is lost)', () => {
  let s = setPhase(rich(), 2);
  s = place(s, 'plant', 9, 9);
  s = setPhase(s, 1);
  assert.equal(s.items.length, 0);
  assert.equal(owned(s, 'plant'), 1);
});

test('stats add luxury, seats and capacity', () => {
  let s = rich();
  s = place(s, 'chair_red', 1, 1);
  s = place(s, 'stool', 2, 1);
  s = place(s, 'floor_cyan', 4, 4);
  const st = statsOf(s);
  assert.equal(st.luxury, BY_ID.get('chair_red').luxury + BY_ID.get('stool').luxury + 1);
  assert.equal(st.seats, 2);
  assert.equal(st.capacity, 3);
});

// ---------------------------------------------------------------- saved games
test('sanitizeClub rebuilds a clean state from dirty input and survives garbage', () => {
  const dirty = { xp: 500, coins: 500, inventory: { plant: 2, nope: 5, stool: -3 }, items: [
    { id: 'plant', x: 1, y: 1, rot: 0 }, { id: 'plant', x: 1, y: 1, rot: 0 },
    { id: 'nope', x: 2, y: 2, rot: 0 }, { id: 'plant', x: 99, y: 99, rot: 0 }, { id: 'plant', x: 'a', y: 1 },
  ], story: { intro: true, name: 'x'.repeat(100), done: ['a', 5], seen: [] }, stats: { discovered: ['plant', 'zzz'] } };
  const s = sanitizeClub(dirty);
  assert.equal(s.items.length, 1);
  assert.deepEqual(s.inventory, { plant: 2 });
  assert.equal(s.story.name.length, 24);
  assert.deepEqual(s.story.done, ['a']);
  assert.deepEqual(s.stats.discovered, ['plant']);
  assert.equal(levelNow(s), levelOf(500).level);
  assert.equal(sanitizeClub(null).items.length, 0);
  assert.equal(sanitizeClub('garbage').phase, 1);
});

test('an old save without inventory still gets the starter booth only before the intro', () => {
  assert.equal(owned(sanitizeClub({ items: [] }), 'dj_booth'), 1);
  assert.equal(owned(sanitizeClub({ items: [], story: { intro: true } }), 'dj_booth'), 0);
});

test('validatePlacement with ignoreUid allows re-placing on its own spot', () => {
  const s = place(rich(), 'bar_straight', 2, 2);
  const def = BY_ID.get('bar_straight');
  assert.equal(validatePlacement(s, def, 2, 2, 0).ok, false);
  assert.equal(validatePlacement(s, def, 2, 2, 0, s.items[0].uid).ok, true);
});

test('the club starts closed, and cannot open without a DJ booth', () => {
  const s = newClub();
  assert.equal(s.open, false);
  assert.equal(canOpen(s).ok, false);
  assert.equal(setOpen(s, true).error, 'Necesitas una cabina DJ para abrir el club');
  const withBooth = place(s, 'dj_booth', 3, 1, 0, 'inventory');
  assert.equal(canOpen(withBooth).ok, true);
  const opened = setOpen(withBooth, true).state;
  assert.equal(opened.open, true);
  assert.equal(setOpen(opened, false).state.open, false, 'closing never needs anything');
});

test('open/closed is saved, and a dirty value means closed', () => {
  assert.equal(sanitizeClub({ open: true }).open, true);
  assert.equal(sanitizeClub({ open: 'yes please' }).open, true);
  assert.equal(sanitizeClub({}).open, false);
  assert.equal(sanitizeClub(null).open, false);
});

console.log(`\n${passed} tests passed`);
