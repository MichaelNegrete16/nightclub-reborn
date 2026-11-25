// Money sinks and income while away (pure logic). Run: node --experimental-strip-types scripts/economy-test.mjs
import assert from 'node:assert/strict';
import { newClub, sanitizeClub, setPhase, statsOf, placeItem } from '../src/core/club.ts';
import { RENOVATIONS, buyRenovation, nextRenovation, upkeepPerMinute, MAX_TIER } from '../src/core/renovation.ts';
import { OFFLINE_CAP_MIN, OFFLINE_EFFICIENCY, settle, stamp } from '../src/core/offline.ts';
import { GuestSim, COVER } from '../src/core/guests.ts';
import { applyEvents } from '../src/core/game.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const rich = (xp = 10 ** 8) => ({ ...newClub(), coins: 1e9, xp });

test('renovations come in order, need level and coins, and each makes the club nicer', () => {
  let s = { ...newClub(), coins: 1e9 };
  assert.match(buyRenovation(s).error, /nivel 8/);
  s = rich();
  assert.match(buyRenovation({ ...s, coins: 5 }).error, /monedas/);
  let lux = (st) => statsOf(st).luxury;
  s = placeItem(s, 'plant', 1, 1, 0, 'free').state;
  const before = lux(s);
  for (let t = 1; t <= MAX_TIER; t++) {
    assert.equal(nextRenovation(s).tier, t);
    const paid = s.coins;
    s = buyRenovation(s).state;
    assert.equal(paid - s.coins, RENOVATIONS[t - 1].price);
    assert.equal(s.renovation, t);
  }
  assert.ok(lux(s) > before, 'luxury grows with renovations');
  assert.match(buyRenovation(s).error, /todas las reformas/);
});

test('running costs grow with the building and its size', () => {
  const small = setPhase(rich(), 1);
  const big = setPhase(rich(), 4);
  const full = (s) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s = placeItem(s, 'floor_cyan', x, y + 4, 0, 'free').state; return s; };
  assert.ok(upkeepPerMinute(full(big)) > upkeepPerMinute(full(small)) * 2);
  assert.equal(upkeepPerMinute(newClub()), 0);
});

test('rent is only charged when the real rules are on, and only while open', () => {
  let s = setPhase(rich(), 3);
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) s = placeItem(s, 'floor_cyan', x, y, 0, 'free').state;
  const run = (on, open) => {
    const sim = new GuestSim(2);
    sim.upkeepOn = on;
    sim.setLayout(s);
    sim.setOpen(open);
    let cost = 0;
    for (let t = 0; t < 300; t += 0.5) { sim.update(0.5); for (const e of sim.events) if (e.kind === 'upkeep') cost += e.amount; }
    return cost;
  };
  assert.equal(run(false, true), 0);
  assert.equal(run(true, false), 0);
  const c = run(true, true);
  assert.ok(Math.abs(c + upkeepPerMinute(s) * 5) < 6, `charged ${c}`);
  // and the game takes it from the bank without going negative
  assert.equal(applyEvents({ ...s, coins: 3 }, [{ x: 0, y: 0, amount: -50, kind: 'upkeep' }]).coins, 0);
});

test('a renovated club charges a higher cover', () => {
  const cover = (tier) => {
    const sim = new GuestSim(9);
    sim.setLayout({ ...newClub(), renovation: tier });
    let first = 0;
    for (let t = 0; t < 600 && !first; t += 0.5) { sim.update(0.5); for (const e of sim.events) if (e.kind === 'cover') first = e.amount; }
    return first;
  };
  assert.equal(cover(0), COVER);
  assert.equal(cover(5), Math.round(COVER * 1.5));
});

test('income while away: efficiency, cap, minimum absence, closed club earns nothing', () => {
  const MIN = 60_000;
  let s = stamp({ ...newClub(), open: true }, 100, 0 + MIN);
  assert.equal(settle(s, MIN + 2 * MIN), null, 'two minutes away is not worth reporting');
  const r = settle(s, MIN + 60 * MIN);
  assert.equal(r.minutes, 60);
  assert.equal(r.earned, Math.round(100 * 60 * OFFLINE_EFFICIENCY));
  assert.equal(r.state.coins, s.coins + r.earned);
  assert.equal(settle(r.state, MIN + 60 * MIN + 1000), null, 'nothing is paid twice');
  const week = settle(s, MIN + 7 * 24 * 60 * MIN);
  assert.equal(week.minutes, OFFLINE_CAP_MIN, 'a week away pays for 8 hours at most');
  assert.equal(settle(stamp({ ...newClub(), open: false }, 100, MIN), 99 * MIN), null, 'a closed club earns nothing');
  assert.equal(settle(stamp({ ...newClub(), open: true }, -50, MIN), 99 * MIN), null, 'a club losing money earns nothing');
});

test('a damaged save cannot invent money or tiers', () => {
  const s = sanitizeClub({ renovation: 99, offline: { rate: 1e12, at: -5 } });
  assert.equal(s.renovation, MAX_TIER);
  assert.ok(s.offline.rate <= 1e6 && s.offline.at === 0);
  assert.equal(sanitizeClub({ renovation: 'x' }).renovation, 0);
});

console.log(`\n${passed} tests passed`);
