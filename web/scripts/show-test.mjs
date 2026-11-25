// The dancing cage: it pays tips only with a crowd watching, music on and the doors open; better versions pay more and cost more wages.
import assert from 'node:assert/strict';
import { newClub, placeItem, setPhase, upgradeItem } from '../src/core/club.ts';
import { GuestSim } from '../src/core/guests.ts';
import { SHOW_RATE, SHOW_WAGE, earningOf, TROPHY_RATE } from '../src/core/income.ts';
import { applyEvents } from '../src/core/game.ts';
import { BY_ID } from '../src/core/catalog.ts';
import { canOpen } from '../src/core/club.ts';
import { staffSpots } from '../src/core/staff.ts';
import { successChance, securityOfClub } from '../src/core/heist.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const put = (s, id, x, y) => placeItem(s, id, x, y, 0, 'free').state;

function club(withCage, tier = 1) {
  let s = setPhase(newClub(), 4);
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 12; x++) s = put(s, 'floor_cyan', x, y);
  s = put(s, 'bar_straight', 1, 1);
  s = put(s, 'dj_booth', 9, 1);
  for (const x of [1, 2, 3]) s = put(s, 'stool', x, 2);
  s = { ...s, xp: 600000 };
  if (withCage) {
    s = put(s, 'dance_cage', 6, 4);
    for (let t = 1; t < tier; t++) s = upgradeItem({ ...s, coins: 1e9 }, s.items.find((i) => i.id === 'dance_cage').uid).state;
  }
  return s;
}
function night(state, music = true, open = true, seconds = 900) {
  const sim = new GuestSim(11);
  sim.upkeepOn = false;
  sim.setLayout(state);
  sim.setOpen(open);
  if (music) sim.setMusic('reggaeton');
  let show = 0;
  let wage = 0;
  for (let t = 0; t < seconds; t += 0.5) {
    sim.update(0.5);
    for (const e of sim.events) { if (e.kind === 'show') show += e.amount; if (e.kind === 'wage') wage += e.amount; }
  }
  return { show, wage };
}

test('the cage is in the shop at level 14 and fits a 2x2 spot', () => {
  const d = BY_ID.get('dance_cage');
  assert.deepEqual([d.w, d.d, d.unlockLevel, d.category], [2, 2, 14, 'shows']);
  assert.ok(club(true).items.some((i) => i.id === 'dance_cage'));
});

test('it pays tips with music, open doors and people around it, and nothing otherwise', () => {
  assert.ok(night(club(true)).show > 0);
  assert.equal(night(club(false)).show, 0, 'no cage, no tips');
  assert.equal(night(club(true), false).show, 0, 'no music, no show');
  assert.equal(night(club(true), true, false).show, 0, 'closed doors, no show');
});

test('better versions earn more, and the dancer is paid more too', () => {
  const t1 = night(club(true, 1));
  const t4 = night(club(true, 4));
  assert.ok(t4.show > t1.show * 2.5, `${t4.show} vs ${t1.show}`);
  assert.ok(-t4.wage > -t1.wage);
  assert.ok(SHOW_RATE[3] > SHOW_RATE[0] * 3 && SHOW_WAGE[3] > SHOW_WAGE[0]);
});

test('tips become coins and a little XP', () => {
  const s = newClub();
  const after = applyEvents(s, [{ x: 0, y: 0, amount: 50, kind: 'show' }]);
  assert.equal(after.coins, s.coins + 50);
  assert.ok(after.xp >= s.xp);
});

test('the podium is a cheaper stage: it pays, but less than the cage', () => {
  let s = club(false);
  s = put(s, 'pole_podium', 6, 5);
  const podium = night(s);
  assert.ok(podium.show > 0);
  assert.ok(podium.show < night(club(true)).show);
  assert.ok(-podium.wage > 0);
});

test('new bars get a bartender, and the professional booth lets the club open', () => {
  let s = setPhase(newClub(), 4);
  s = put(s, 'bar_long', 1, 1);
  s = put(s, 'cocktail_bar', 8, 1);
  s = put(s, 'bar_corner', 12, 1);
  assert.ok(staffSpots(s).bartender.length >= 2, 'a bartender can stand behind the new bars');
  assert.equal(canOpen(s).ok, false);
  s = put(s, 'dj_booth_pro', 4, 6);
  assert.equal(canOpen(s).ok, true);
  assert.ok(staffSpots(s).dj.length >= 1, 'the DJ stands behind the pro booth');
});

test('security cameras make a robbery a little harder, up to three', () => {
  const none = successChance([], securityOfClub([], 0, false));
  const three = successChance([], securityOfClub([{ id: 'camera' }, { id: 'camera' }, { id: 'camera' }], 0, false));
  const five = successChance([], securityOfClub(Array.from({ length: 5 }, () => ({ id: 'camera' })), 0, false));
  assert.ok(three < none && Math.abs(five - three) < 1e-9);
});

test('trophies earn too, as the shop says: more with better versions, nothing without music or people, and the description matches the pay', () => {
  const statue = BY_ID.get('gold_statue');
  const e = earningOf(statue);
  assert.equal(e.kind, 'trophy');
  assert.equal(e.perMin[0], Math.round(statue.luxury * TROPHY_RATE * 10) / 10);
  assert.ok(e.perMin[3] > e.perMin[0] * 3);
  assert.equal(earningOf(BY_ID.get('stool')), null, 'a stool earns nothing by itself');
  assert.equal(earningOf(BY_ID.get('dance_cage')).kind, 'show');
  const withStatue = (tier) => { let s = club(false); s = put(s, 'gold_statue', 6, 5); for (let t = 1; t < tier; t++) s = upgradeItem({ ...s, coins: 1e9 }, s.items.find((i) => i.id === 'gold_statue').uid).state; return s; };
  const a = night(withStatue(1));
  const b = night(withStatue(4));
  assert.ok(a.show > 0, 'the statue pays tips of prestige');
  assert.ok(b.show > a.show * 2.5, `${b.show} vs ${a.show}`);
  assert.equal(night(withStatue(1), false).show, 0, 'no music, nothing');
  assert.equal(night(club(false)).show, 0, 'no trophy, nothing');
});

console.log(`\n${passed} tests passed`);
