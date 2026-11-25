// Facade upgrades and walking (pure logic). Run: node --experimental-strip-types scripts/exterior-test.mjs
import assert from 'node:assert/strict';
import { newClub, sanitizeClub } from '../src/core/club.ts';
import { UPGRADES, UPGRADE_BY_ID, buyUpgrade, choosePaint, perksOf, paintColor, DEFAULT_PAINT } from '../src/core/exterior.ts';
import { gridPath, crosses, routeAround } from '../src/core/walk.ts';
import { GuestSim } from '../src/core/guests.ts';
import { hireStaff, fireStaff, wagePerMinute, perksOfStaff, working, staffSpots, STAFF } from '../src/core/staff.ts';
import { placeItem } from '../src/core/club.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const rich = (level = 1) => ({ ...newClub(), coins: 99999, xp: level > 1 ? 10 ** 7 : 0 });

test('a new club starts with the grey paint and no perks', () => {
  const s = newClub();
  assert.equal(s.exterior.paint, DEFAULT_PAINT);
  assert.deepEqual(perksOf(s.exterior), { arrivals: 1, patience: 1 });
});

test('buying needs coins and level, charges once and cannot be repeated', () => {
  assert.match(buyUpgrade({ ...newClub(), coins: 5 }, 'paint_red').error, /monedas|nivel/);
  assert.match(buyUpgrade(rich(1), 'sign_giant').error, /nivel/);
  const s = rich(2);
  const r = buyUpgrade(s, 'paint_red');
  assert.equal(r.error, undefined);
  assert.equal(r.state.coins, s.coins - UPGRADE_BY_ID.get('paint_red').price);
  assert.equal(r.state.exterior.paint, 'paint_red', 'a new paint goes on right away');
  assert.equal(paintColor(r.state.exterior), 0xb23a48);
  assert.match(buyUpgrade(r.state, 'paint_red').error, /Ya la tienes/);
  assert.equal(choosePaint(r.state, DEFAULT_PAINT).state.exterior.paint, DEFAULT_PAINT);
  assert.match(choosePaint(r.state, 'paint_gold').error, /Todavía/);
});

test('perks add up: signs do not stack, the rope helps patience', () => {
  let s = rich(2);
  for (const u of UPGRADES) { const r = buyUpgrade(s, u.id); if (!r.error) s = r.state; }
  const p = perksOf(s.exterior);
  assert.ok(Math.abs(p.arrivals - 1.2 * 1.05) < 1e-9, 'giant sign (20%) and lights (5%), not the neon sign on top');
  assert.equal(p.patience, 1.3);
});

test('with a guard on the payroll a VIP arrives already checked', () => {
  const sim = new GuestSim(5);
  const s = { ...newClub(), phase: 3, staff: { guard: 1, dj: 0, bartender: 0 } };
  sim.setLayout(s);
  for (let i = 0; i < 40000 && !sim.waitingVip; i++) sim.update(0.1);
  assert.ok(sim.waitingVip.vip.checked);
});

test('a damaged save is cleaned: unknown upgrades dropped, paint must be owned', () => {
  const s = sanitizeClub({ exterior: { owned: ['rope', 'nope', 42], paint: 'paint_gold' } });
  assert.deepEqual(s.exterior.owned.sort(), [DEFAULT_PAINT, 'rope'].sort());
  assert.equal(s.exterior.paint, DEFAULT_PAINT);
});

test('grid walk goes around furniture and says no when walled in', () => {
  const blocked = new Set(['1,0', '1,1']);
  const p = gridPath(blocked, 4, 3, [0, 0], [2, 0]);
  assert.deepEqual(p, [[0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]]);
  assert.equal(gridPath(new Set(['1,0', '1,1', '1,2']), 4, 3, [0, 0], [2, 0]), null);
  assert.equal(gridPath(blocked, 4, 3, [0, 0], [1, 1]), null, 'cannot end inside an object');
});

test('street walk never cuts through the building', () => {
  const b = { x0: 0, y0: 0, x1: 10, y1: 10 };
  assert.ok(crosses(b, [-3, 5], [13, 5]));
  assert.ok(!crosses(b, [-3, -3], [13, -3]));
  const route = routeAround(b, [-3, 5], [13, 5]);
  assert.ok(route.length >= 2);
  let at = [-3, 5];
  for (const pt of route) { assert.ok(!crosses(b, at, pt), `leg ${at}→${pt} crosses the building`); at = pt; }
  assert.deepEqual(routeAround(b, [-3, 12], [13, 12]), [[13, 12]], 'a clear line is walked straight');
});

test('hiring needs level, coins and room; wages only run while someone has a place to work', () => {
  assert.match(hireStaff({ ...newClub(), coins: 9999 }, 'guard').error, /nivel/);
  let s = { ...rich(2), coins: 99999 };
  assert.equal(wagePerMinute(s), 0);
  s = hireStaff(s, 'dj').state;
  s = hireStaff(s, 'bartender').state;
  assert.equal(s.staff.dj, 1);
  assert.equal(wagePerMinute(s), 0, 'no booth and no bar: nothing to do, nothing to pay');
  assert.equal(perksOfStaff(s).drinkPrice, 1);
  s = placeItem(s, 'dj_booth', 1, 1, 0, 'free').state;
  s = placeItem(s, 'bar_straight', 4, 1, 0, 'free').state;
  assert.deepEqual(working(s), { guard: 0, dj: 1, bartender: 1 });
  assert.equal(wagePerMinute(s), 3 + 2);
  assert.equal(perksOfStaff(s).drinkPrice, 1.25);
  assert.match(hireStaff(hireStaff(s, 'dj').state, 'dj').error, /máximo/);
  assert.equal(fireStaff(s, 'dj').state.staff.dj, 0);
  assert.match(fireStaff(newClub(), 'guard').error, /nadie/);
  assert.ok(STAFF.every((d) => d.hire > 0 && d.wage > 0));
});

test('staff changes the night: wages are charged while open, drinks sell dearer, dances tip', () => {
  const base = (staff) => {
    let s = { ...rich(2), phase: 3, staff };
    for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) s = placeItem(s, 'floor_cyan', x, y, 0, 'free').state;
    s = placeItem(s, 'bar_straight', 1, 1, 0, 'free').state;
    s = placeItem(s, 'dj_booth', 7, 1, 0, 'free').state;
    for (const x of [1, 2, 3]) s = placeItem(s, 'stool', x, 2, 0, 'free').state;
    const sim = new GuestSim(21);
    sim.setLayout(s);
    const kinds = {};
    for (let t = 0; t < 600; t += 0.1) { sim.update(0.1); for (const e of sim.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + e.amount; }
    return kinds;
  };
  const none = base({ guard: 0, dj: 0, bartender: 0 });
  const crew = base({ guard: 1, dj: 1, bartender: 1 });
  assert.equal(none.wage ?? 0, 0);
  assert.equal(crew.wage, -Math.round((7 * 30) / 60) * 20, 'a 10 minute night costs 7 coins a minute');
  assert.ok(crew.drink > none.drink * 1.1, 'the bartender sells dearer');
  assert.ok(crew.dance > 0 && (none.dance ?? 0) === 0, 'the DJ earns tips');
});

test('workers stand on free cells, never in the furniture or the wall; no free cell, no work', () => {
  const base = { ...rich(2), staff: { guard: 0, dj: 1, bartender: 2 } };
  // furniture flush against the north wall: the worker takes a free cell at the end of the piece
  let s = placeItem(placeItem(base, 'dj_booth', 5, 0, 0, 'free').state, 'bar_straight', 0, 0, 0, 'free').state;
  const blocked = new Set(s.items.flatMap((i) => (i.id === 'dj_booth' ? [`${i.x},${i.y}`, `${i.x + 1},${i.y}`] : [0, 1, 2].map((d) => `${i.x + d},${i.y}`))));
  const sp = staffSpots(s);
  assert.ok(sp.dj.length >= 1 && sp.bartender.length >= 1);
  for (const w of [...sp.dj, ...sp.bartender]) {
    assert.ok(w.x > 0 && w.z > 0 && w.x < 8 && w.z < 8, 'inside the room');
    assert.ok(!blocked.has(`${Math.floor(w.x)},${Math.floor(w.z)}`), `worker at ${w.x},${w.z} stands inside furniture`);
  }
  // away from the wall there is room behind
  s = placeItem(placeItem(base, 'dj_booth', 4, 3, 0, 'free').state, 'bar_straight', 0, 3, 0, 'free').state;
  assert.equal(working(s).bartender, 2);
  assert.equal(working(s).dj, 1);
  // boxed in on every side: nowhere to stand, so nobody works and nobody is paid
  let boxed = placeItem(base, 'dj_booth', 0, 0, 0, 'free').state;
  boxed = placeItem(boxed, 'plant', 2, 0, 0, 'free').state;
  boxed = placeItem(boxed, 'plant', 0, 1, 0, 'free').state;
  boxed = placeItem(boxed, 'plant', 1, 1, 0, 'free').state;
  assert.equal(working(boxed).dj, 0);
  assert.equal(wagePerMinute({ ...boxed, staff: { guard: 0, dj: 1, bartender: 0 } }), 0);
});

console.log(`\n${passed} tests passed`);
