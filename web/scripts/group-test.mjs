// Moving, stashing and selling many pieces at once (a whole dance floor). Run: node --experimental-strip-types scripts/group-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, itemsInRect, moveGroup, stashGroup, sellGroup, groupValue, upgradeItem, tierOfItem } from '../src/core/club.ts';

let passed = 0;
const queue = [];
const test = (name, fn) => { queue.push(async () => { await fn(); passed++; console.log('ok  -', name); }); };
const put = (s, id, x, y) => placeItem(s, id, x, y, 0, 'free').state;

/** a 4x3 dance floor at (3,3), a bar, and a plant */
function club() {
  let s = { ...newClub(), phase: 3, coins: 1e9, xp: 5_000_000 };
  for (let y = 3; y < 6; y++) for (let x = 3; x < 7; x++) s = put(s, 'floor_cyan', x, y);
  s = put(s, 'bar_straight', 1, 1);
  s = put(s, 'plant', 10, 6);
  return s;
}

test('an area picks the pieces fully inside it, any corner order, with or without the furniture', () => {
  const s = club();
  assert.equal(itemsInRect(s, 3, 3, 6, 5, true).length, 12);
  assert.equal(itemsInRect(s, 6, 5, 3, 3, true).length, 12, 'the corners can be given in any order');
  assert.equal(itemsInRect(s, 3, 3, 5, 5, true).length, 9, 'only what is fully inside');
  assert.equal(itemsInRect(s, 0, 0, 12, 8, true).length, 12, 'floors only: the bar and the plant stay out');
  assert.equal(itemsInRect(s, 0, 0, 12, 8, false).length, 14, 'everything');
});

test('the whole floor moves together, keeping its shape, and nothing else changes', () => {
  const s = club();
  const uids = itemsInRect(s, 3, 3, 6, 5, true).map((i) => i.uid);
  const r = moveGroup(s, uids, 2, 1);
  assert.equal(r.error, undefined);
  const xs = r.state.items.filter((i) => i.id === 'floor_cyan').map((i) => `${i.x - 5},${i.y - 4}`).sort();
  assert.deepEqual(xs, itemsInRect(s, 3, 3, 6, 5, true).map((i) => `${i.x - 3},${i.y - 3}`).sort(), 'same shape, shifted by (2, 1)');
  assert.equal(r.state.items.length, s.items.length);
  assert.deepEqual(r.state.items.find((i) => i.id === 'bar_straight'), s.items.find((i) => i.id === 'bar_straight'));
  assert.deepEqual(moveGroup(s, uids, 0, 0).state, s, 'not moving is not an error');
});

test('a group that does not fit does not move at all, and says why', () => {
  const s = club();
  const uids = itemsInRect(s, 3, 3, 6, 5, true).map((i) => i.uid);
  const wall = moveGroup(s, uids, -4, 0); // tiles would stick out of the left wall
  assert.match(wall.error, /Fuera del local/);
  assert.deepEqual(wall.state, s, 'nothing moved');
  // a floor tile cannot land on another floor tile that stays
  const part = itemsInRect(s, 3, 3, 4, 5, true).map((i) => i.uid);
  assert.match(moveGroup(s, part, 2, 0).error, /ocupado/);
  assert.match(moveGroup(s, [], 1, 1).error, /nada seleccionado/);
  // a group may move onto the cells it used to occupy
  assert.equal(moveGroup(s, uids, 1, 0).error, undefined);
});

test('improved pieces keep their version when the group moves', () => {
  let s = club();
  const tile = s.items.find((i) => i.id === 'floor_cyan');
  s = upgradeItem(s, tile.uid).state;
  assert.ok(tierOfItem(s.items.find((i) => i.uid === tile.uid)) > 1);
  const r = moveGroup(s, [tile.uid], 0, 0);
  assert.equal(r.error, undefined);
  const uids = itemsInRect(s, 3, 3, 6, 5, true).map((i) => i.uid);
  const moved = moveGroup(s, uids, 3, 0).state;
  assert.equal(tierOfItem(moved.items.find((i) => i.uid === tile.uid)), tierOfItem(s.items.find((i) => i.uid === tile.uid)));
});

test('stashing and selling a group: each piece goes where it should, once', () => {
  let s = club();
  const t = s.items.filter((i) => i.id === 'floor_cyan');
  s = upgradeItem(s, t[0].uid).state; // one improved tile
  const uids = t.map((i) => i.uid);
  const away = stashGroup(s, uids);
  assert.equal(away.done, 12);
  assert.equal(away.state.items.filter((i) => i.id === 'floor_cyan').length, 0);
  assert.equal(away.state.inventory.floor_cyan, 11, 'the basic ones go to the inventory');
  assert.equal(away.state.kept.length, 1, 'the improved one is kept with its version');
  const value = groupValue(s, uids);
  assert.ok(value > 0);
  const sold = sellGroup(s, uids);
  assert.equal(sold.coins - s.coins, value);
  assert.equal(sold.items.filter((i) => i.id === 'floor_cyan').length, 0);
});

test('nobody sits on the empty corner of an L-shaped sofa or booth, at any rotation', async () => {
  const { GuestSim, seatHole } = await import('../src/core/guests.ts');
  const { setPhase } = await import('../src/core/club.ts');
  assert.equal(seatHole('plant', 0), null);
  // sofa_corner: back-right corner; booth: front-right (the table). Each quarter turn moves it round the piece.
  assert.deepEqual([0, 1, 2, 3].map((r) => seatHole('sofa_corner', r)), [[1, 0], [1, 1], [0, 1], [0, 0]]);
  assert.deepEqual([0, 1, 2, 3].map((r) => seatHole('booth', r)), [[1, 1], [0, 1], [0, 0], [1, 0]]);
  for (const id of ['sofa_corner', 'booth']) for (const rot of [0, 1, 2, 3]) {
    let s = setPhase({ ...newClub(), coins: 1e9, xp: 9e6 }, 4);
    for (let y = 4; y <= 9; y++) for (let x = 3; x <= 12; x++) s = put(s, 'floor_cyan', x, y);
    s = put(s, 'bar_straight', 1, 1);
    s = placeItem(s, id, 12, 11, rot, 'free').state;
    const sim = new GuestSim(3);
    sim.setLayout(s);
    const hole = seatHole(id, rot);
    const slots = sim.slots.lounge.map((l) => [l.x - 12, l.y - 11]);
    assert.equal(slots.length, 3, `${id} rot ${rot}: three real seats`);
    assert.ok(!slots.some(([c, r]) => c === hole[0] && r === hole[1]), `${id} rot ${rot}: the hole is empty`);
  }
});

for (const run of queue) await run();
console.log(`\n${passed} tests passed`);
