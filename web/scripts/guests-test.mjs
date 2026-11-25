// Guest simulation test (pure logic). Run: node --experimental-strip-types scripts/guests-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, setPhase, phaseOf, blockedSet } from '../src/core/club.ts';
import { BY_ID } from '../src/core/catalog.ts';
import { guestCap, GuestSim, SIDEWALK_Y, COVER, DRINK_PRICE, MAX_QUEUE, VIP_REAL_COVER, VIP_FRAUD_LOSS } from '../src/core/guests.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const put = (s, id, x, y, rot = 0) => { const r = placeItem(s, id, x, y, rot, 'free'); assert.equal(r.error, undefined, `${id}@${x},${y}: ${r.error}`); return r.state; };

function decorated() {
  let s = setPhase(newClub(), 3);
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) s = put(s, 'floor_cyan', x, y);
  s = put(s, 'bar_straight', 1, 1);
  s = put(s, 'dj_booth', 7, 1);
  for (const y of [5, 7, 9]) s = put(s, 'sofa_red_2', 1, y, 1);
  for (const x of [1, 2, 3]) s = put(s, 'stool', x, 2);
  s = put(s, 'chair_red', 9, 6); s = put(s, 'chair_red', 9, 8); s = put(s, 'table_low', 9, 7);
  return s;
}

function run(sim, seconds, dt = 0.1, check = () => {}) {
  for (let t = 0; t < seconds; t += dt) { sim.update(dt); check(sim); }
}

function inBoundsAndFree(sim, state) {
  const p = phaseOf(state);
  const blocked = blockedSet(state.items);
  for (const g of sim.guests) {
    const cx = Math.floor(g.x), cy = Math.floor(g.y);
    assert.ok(cy >= 0 && cy <= 45 && (cy > p.h || (cx >= 0 && cx < p.w)), `guest ${g.id} out of bounds at ${g.x},${g.y}`);
    // the only things a guest may stand on are seats (a stool, a chair, a sofa...): they sit on them
    const onStool = state.items.some((i) => { const d = BY_ID.get(i.id); return d?.seats && cx >= i.x && cx < i.x + (i.rot % 2 ? d.d : d.w) && cy >= i.y && cy < i.y + (i.rot % 2 ? d.w : d.d); });
    if (cy < p.h) assert.ok(!blocked.has(`${cx},${cy}`) || onStool, `guest ${g.id} stands inside an object at ${cx},${cy}`);
  }
}

test('an empty club still gets a few guests who only pay the cover', () => {
  const s = setPhase(newClub(), 1);
  const sim = new GuestSim(7);
  sim.setLayout(s);
  let max = 0;
  run(sim, 180, 0.1, (m) => { max = Math.max(max, m.inside); inBoundsAndFree(m, s); });
  assert.ok(max >= 1 && max <= 4, `max guests ${max}`);
  assert.equal(sim.earned % COVER, 0, 'only covers were charged');
  assert.ok(sim.earned > 0);
});

test('a decorated club fills up, guests dance, drink and pay', () => {
  const s = decorated();
  const sim = new GuestSim(11);
  sim.setLayout(s);
  const modes = new Set();
  let max = 0, drinks = 0;
  run(sim, 400, 0.1, (m) => {
    max = Math.max(max, m.guests.length);
    for (const g of m.guests) modes.add(g.mode);
    for (const e of m.events) if (e.kind === 'drink') drinks++;
    inBoundsAndFree(m, s);
  });
  assert.ok(max >= 8, `club should fill up, max ${max}`);
  assert.ok(modes.has('dance') && modes.has('drink') && modes.has('lounge') && modes.has('walk'), [...modes].join());
  assert.ok(drinks > 0, 'someone bought a drink');
  assert.ok(sim.earned > COVER * 10 + DRINK_PRICE, `earned ${sim.earned}`);
  console.log(`      max guests ${max}, drinks ${drinks}, earned ${sim.earned}`);
});

test('never more guests than the capacity cap, never two on the same slot', () => {
  const s = decorated();
  const sim = new GuestSim(3);
  sim.setLayout(s);
  run(sim, 400, 0.1, (m) => {
    assert.ok(m.guests.filter((g) => !g.leaving).length <= 40);
    const keys = m.guests.filter((g) => g.slot).map((g) => g.slot.key);
    assert.equal(new Set(keys).size, keys.length, 'two guests share a slot');
  });
});

test('everyone leaves once the door stops letting people in', () => {
  const s = decorated();
  const sim = new GuestSim(5);
  sim.setLayout(s);
  run(sim, 120);
  assert.ok(sim.guests.length > 0);
  sim.enabled = false;
  run(sim, 300);
  assert.equal(sim.guests.length, 0);
});

test('same seed, same night', () => {
  const s = decorated();
  const a = new GuestSim(42), b = new GuestSim(42);
  a.setLayout(s); b.setLayout(s);
  run(a, 200); run(b, 200);
  assert.equal(a.earned, b.earned);
  assert.equal(a.guests.length, b.guests.length);
});

test('editing the club while guests are inside never traps or hides anyone', () => {
  let s = decorated();
  const sim = new GuestSim(9);
  sim.setLayout(s);
  run(sim, 90, 0.1, (m) => inBoundsAndFree(m, s));
  // drop a big object right where guests are dancing, then remove the bar
  const r = placeItem(s, 'booth', 4, 5, 0, 'free');
  if (!r.error) s = r.state;
  sim.setLayout(s);
  inBoundsAndFree(sim, s);
  run(sim, 60, 0.1, (m) => inBoundsAndFree(m, s));
  s = { ...s, items: s.items.filter((i) => i.id !== 'bar_straight') };
  sim.setLayout(s);
  run(sim, 120, 0.1, (m) => inBoundsAndFree(m, s));
  assert.ok(sim.guests.length >= 0);
});

test('luxury brings more guests per minute', () => {
  const poor = decorated();
  const rich = decorated();
  rich.items.push(...Array.from({ length: 6 }, (_, i) => ({ uid: `x${i}`, id: 'gold_statue', x: 10, y: 1 + i, rot: 0 })));
  const a = new GuestSim(1), b = new GuestSim(1);
  a.setLayout(poor); b.setLayout({ ...rich, phase: 4 });
  let na = 0, nb = 0;
  for (let t = 0; t < 60; t += 0.1) { a.update(0.1); b.update(0.1); na += a.events.filter((e) => e.kind === 'cover').length; nb += b.events.filter((e) => e.kind === 'cover').length; }
  assert.ok(nb > na, `rich ${nb} vs poor ${na}`);
});

test('closing the club sends everyone out and stops arrivals; reopening lets people in again', () => {
  const s = decorated();
  const sim = new GuestSim(21);
  sim.setLayout(s);
  run(sim, 150);
  assert.ok(sim.guests.length > 3, 'there is a crowd');
  sim.setOpen(false);
  assert.ok(sim.guests.every((g) => g.leaving), 'everyone is heading out');
  let arrivals = 0;
  run(sim, 120, 0.1, (m) => { arrivals += m.events.filter((e) => e.kind === 'cover').length; });
  assert.equal(arrivals, 0, 'nobody comes in while closed');
  assert.equal(sim.guests.length, 0, 'the club emptied');
  sim.setOpen(true);
  run(sim, 120, 0.1, (m) => { arrivals += m.events.filter((e) => e.kind === 'cover').length; });
  assert.ok(arrivals > 0, 'people come again once it reopens');
});

test('nobody gets in beyond the room capacity: the rest wait in line outside', () => {
  const s = setPhase(newClub(), 1);
  const sim = new GuestSim(11);
  sim.setLayout(s);
  const cap = sim.roomCapacity;
  let maxInside = 0;
  run(sim, 600, 0.1, () => { maxInside = Math.max(maxInside, sim.inside); assert.ok(sim.queue.length <= MAX_QUEUE); });
  assert.ok(maxInside <= cap, `inside ${maxInside} > capacity ${cap}`);
  assert.ok(sim.queue.every((g) => g.y > phaseOf(s).h), 'the line is outside the building');
});

test('closing the club breaks up the line', () => {
  const sim = new GuestSim(3);
  sim.setLayout(decorated());
  run(sim, 200);
  sim.setOpen(false);
  assert.equal(sim.queue.length, 0);
  run(sim, 120);
  assert.equal(sim.guests.length, 0);
});

test('a real VIP pays and brings buzz; an impostor costs money; rejecting does neither', () => {
  const make = (real, seed) => {
    const sim = new GuestSim(seed);
    sim.setLayout(decorated());
    for (let i = 0; i < 40000 && !sim.waitingVip; i++) sim.update(0.1);
    const v = sim.waitingVip;
    assert.ok(v, 'a VIP shows up eventually');
    v.vip.real = real;
    assert.equal(v.vip.checked, false);
    assert.equal(sim.checkVip(v.id).real, real);
    return [sim, v];
  };
  let [sim, v] = make(true, 5);
  sim.events = [];
  assert.ok(sim.admitVip(v.id));
  // the click happens between two steps: what it caused must still be reported by the next step (it used to be wiped)
  sim.update(0.1);
  assert.equal(sim.events.find((e) => e.kind === 'vip').amount, VIP_REAL_COVER);
  assert.ok(sim.buzz > 0);
  [sim, v] = make(false, 5);
  assert.ok(sim.admitVip(v.id));
  sim.update(0.1);
  assert.equal(sim.events.find((e) => e.kind === 'fraud').amount, -VIP_FRAUD_LOSS);
  assert.equal(sim.buzz, 0);
  [sim, v] = make(true, 9);
  assert.ok(sim.rejectVip(v.id));
  assert.ok(!sim.waitingVip && !sim.guests.some((g) => g.vip && !g.leaving));
});

test('people arrive walking along the sidewalk from far away, not out of thin air', () => {
  const sim = new GuestSim(4);
  sim.setLayout(setPhase(newClub(), 2));
  const born = new Map();
  run(sim, 400, 0.1, (m) => { for (const g of m.queue) if (!born.has(g.id)) born.set(g.id, { x: g.x, y: g.y }); });
  assert.ok(born.size >= 5);
  for (const [id, p] of born) {
    assert.ok(Math.abs(p.y - SIDEWALK_Y) < 0.6, `guest ${id} appeared at y ${p.y}, not on the sidewalk`);
    assert.ok(p.x < -30 || p.x > 60, `guest ${id} appeared at x ${p.x}, in view`);
  }
});

test('guests sit ON the chairs and sofas, facing the way the seat faces, and stand up when they leave', () => {
  const sim = new GuestSim(12);
  sim.setLayout(decorated());
  const state = decorated();
  let seated = 0;
  run(sim, 400, 0.1, (m) => {
    for (const g of m.guests) {
      if (g.mode !== 'lounge' || g.sit === undefined) continue;
      seated++;
      const it = state.items.find((i) => { const d = BY_ID.get(i.id); return d?.seats && Math.floor(g.x) >= i.x && Math.floor(g.x) < i.x + (i.rot % 2 ? d.d : d.w) && Math.floor(g.y) >= i.y && Math.floor(g.y) < i.y + (i.rot % 2 ? d.w : d.d); });
      assert.ok(it, `guest ${g.id} sits at ${g.x},${g.y} where there is no seat`);
    }
    for (const g of m.guests) if (g.mode === 'walk') assert.equal(g.sit, undefined, 'a walking guest is not seated');
  });
  assert.ok(seated > 0, 'somebody sat down during the night');
});

test('letting a real star in by hand pays, counts and completes the mission (the click between steps is not lost)', async () => {
  const { applyEvents } = await import('../src/core/game.ts');
  const { checkMissions } = await import('../src/core/story.ts');
  const sim = new GuestSim(5);
  sim.setLayout(decorated());
  for (let i = 0; i < 40000 && !sim.waitingVip; i++) sim.update(0.1);
  const v = sim.waitingVip;
  v.vip.real = true;
  let state = { ...newClub(), phase: 2, xp: 3000 };
  sim.admitVip(v.id);
  sim.update(0.1);
  state = applyEvents(state, sim.events);
  assert.equal(state.stats.vips, 1);
  assert.ok(checkMissions(state).completed.some((m) => m.id === 'vip1'));
});

test('a reloaded game (the warm-up) never has a star at the door, however many times it is reloaded', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sim = new GuestSim(seed);
    sim.setLayout(decorated());
    sim.warm(120);
    assert.equal(sim.waitingVip, undefined, `seed ${seed}: a star was waiting after the warm-up`);
    assert.ok(!sim.guests.some((g) => g.vip), `seed ${seed}: a star was inside after the warm-up`);
    assert.ok(sim.guests.length + sim.queue.length > 0, 'but the club is not empty');
    assert.equal(sim.events.length, 0, 'and nothing was paid');
  }
});

test('the most people a club holds grows with its level and its building, and never shrinks along the way', () => {
  assert.equal(guestCap(2, 12), 48);
  assert.ok(guestCap(3, 20) > 40, 'a bigger building and level hold more than the old limit of 40');
  assert.ok(guestCap(4, 30) > guestCap(4, 23));
  assert.equal(guestCap(2, 40), 52, 'a small building caps even a famous club');
  assert.ok(guestCap(5, 50) > guestCap(4, 35), 'an expansion lifts the ceiling');
  let prev = 0;
  for (let phase = 1, level = 1; level <= 100; level++) {
    if (level >= [1, 6, 13, 23, 36, 51, 71][phase]) phase = Math.min(7, phase + 1);
    const c = guestCap(phase, level);
    assert.ok(c >= prev, `level ${level} holds ${c}, less than the ${prev} before`);
    prev = c;
  }
  // in the simulation: a club with room for 100 and the level of a big one lets more than 40 in
  let s = setPhase(newClub(), 4);
  for (let y = 4; y <= 16; y++) for (let x = 0; x <= 12; x++) s = put(s, 'floor_cyan', x, y);
  s = { ...s, xp: 200000 };
  const sim = new GuestSim(3);
  sim.setLayout(s);
  assert.ok(sim.roomCapacity > 40, `room capacity ${sim.roomCapacity}`);
});

console.log(`\n${passed} tests passed`);
