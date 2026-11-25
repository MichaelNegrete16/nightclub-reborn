// Robbery and police rules (pure logic). Run: node --experimental-strip-types scripts/heist-test.mjs
import assert from 'node:assert/strict';
import {
  RULES, newCrime, heatNow, addHeat, whyNot, resolveHeist, applyHeist, successChance, isStealable, needsVan, pieceValue, policeLevel,
  policeAction, patrolEveryHours, launderPrice, isBlackoutNight, nextBlackoutNight,
} from '../src/core/heist.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const H = 3_600_000;
// a Saturday at 10:00 city time and a Saturday at 03:00 city time (UTC-5)
const NORMAL = Date.UTC(2026, 10, 28, 15, 0, 0); // Sat 28 Nov 2026, 10:00 in UTC-5
const BLACKOUT = Date.UTC(2026, 10, 28, 8, 0, 0); // Sat 28 Nov 2026, 03:00 in UTC-5
const party = (n, level = 20, crime = newCrime()) => ({ n, level, crime });
const sec = { guards: 0, alarm: false, crowded: false, locks: 0 };
const statue = { uid: 'i1', id: 'gold_statue', tier: 1 };
const bar = { uid: 'i2', id: 'bar_straight', tier: 4 };

test('novices, big level gaps and robbing yourself are refused; the shield, cooldowns and daily cap hold', () => {
  const t = party(1);
  assert.equal(whyNot(t, party(1), NORMAL).reason, 'self');
  assert.equal(whyNot(party(1, 9), party(2), NORMAL).reason, 'novice');
  assert.equal(whyNot(t, party(2, 9), NORMAL).reason, 'novice');
  assert.equal(whyNot(t, party(2, 26), NORMAL).reason, 'band');
  assert.equal(whyNot(t, party(2, 25), NORMAL), null, 'five levels apart is fine');
  assert.equal(whyNot(t, party(2, 20, { ...newCrime(), shieldUntil: NORMAL + H }), NORMAL).reason, 'shield');
  assert.equal(whyNot(party(1, 20, { ...newCrime(), lastHeistAt: NORMAL - H }), party(2), NORMAL).reason, 'cooldown');
  assert.equal(whyNot(party(1, 20, { ...newCrime(), lastHeistAt: NORMAL - 4 * H }), party(2), NORMAL), null);
  assert.equal(whyNot(party(1, 20, { ...newCrime(), lastHeistAt: NORMAL - 4 * H, targets: { 2: NORMAL - 5 * H } }), party(2), NORMAL).reason, 'sameTarget');
  assert.equal(whyNot(party(1, 20, { ...newCrime(), detainedUntil: NORMAL + H }), party(2), NORMAL).reason, 'detained');
  const day = Math.floor((NORMAL - 5 * H) / (24 * H));
  assert.equal(whyNot(t, party(2, 20, { ...newCrime(), lossDay: day, lossPieces: 1 }), NORMAL).reason, 'dailyCap');
});

test('revenge: the victim may hit back within a day, with a one hour wait instead of three and ignoring the same-target rule', () => {
  const victim = party(2, 20, { ...newCrime(), revenge: { 1: NORMAL + 20 * H }, lastHeistAt: NORMAL - 2 * H, targets: { 1: NORMAL - 2 * H } });
  assert.equal(whyNot(victim, party(1), NORMAL), null);
  assert.equal(whyNot(party(2, 20, { ...newCrime(), lastHeistAt: NORMAL - 2 * H }), party(1), NORMAL).reason, 'cooldown');
});

test('heat falls with the hours, twice as fast on Blackout Night, and never below zero or above 100', () => {
  let c = addHeat(newCrime(), 50, NORMAL);
  assert.equal(heatNow(c, NORMAL), 50);
  assert.equal(heatNow(c, NORMAL + 5 * H), 50 - 5 * RULES.heatDecayPerHour);
  assert.equal(heatNow(c, NORMAL + 1000 * H), 0);
  assert.equal(heatNow(addHeat(newCrime(), 500, NORMAL), NORMAL), 100);
  c = addHeat(newCrime(), 50, BLACKOUT);
  assert.equal(heatNow(c, BLACKOUT + 2 * H), 50 - 2 * RULES.heatDecayPerHour * 2, 'double on the night');
  assert.ok(isBlackoutNight(BLACKOUT) && !isBlackoutNight(NORMAL));
  assert.ok(nextBlackoutNight(NORMAL) > NORMAL);
  assert.ok(isBlackoutNight(nextBlackoutNight(NORMAL) + H));
});

test('odds: guards, alarm and a crowd lower them; picks, a jammer and skill raise them; always between 5% and 95%', () => {
  const base = successChance([], sec);
  assert.equal(base, 0.5);
  assert.ok(successChance(['picks'], sec) > base);
  assert.ok(successChance([], { ...sec, guards: 2 }) < base);
  assert.ok(successChance([], { ...sec, alarm: true }) < base);
  assert.ok(successChance(['jammer'], { ...sec, alarm: true }) > successChance([], { ...sec, alarm: true }));
  assert.ok(successChance([], { ...sec, crowded: true }) < base);
  assert.ok(successChance([], sec, 1) > base && successChance([], sec, 0) < base);
  assert.equal(successChance(['picks', 'jammer'], { ...sec, alarm: true }, 1), 0.5 + 0.08 + 0.12 + 0.2);
  assert.equal(successChance([], { guards: 9, alarm: true, crowded: true, locks: 9 }, 0), 0.05);
  assert.equal(successChance(['picks', 'jammer'], sec, 1), 0.5 + 0.08 + 0.2 > 0.95 ? 0.95 : 0.78);
});

test('what can be stolen: gold and expensive gear yes (heavy pieces need the van), finishes of the room no, locked pieces no', () => {
  assert.ok(isStealable(statue));
  assert.ok(!isStealable({ ...statue, locked: true }));
  assert.ok(!isStealable({ uid: 'x', id: 'stool', tier: 4 }), 'a stool is not worth a robbery');
  assert.ok(!isStealable({ ...bar, tier: 2 }), 'basic gear stays');
  assert.ok(isStealable(bar) && needsVan(bar) && !needsVan(statue));
  assert.ok(pieceValue(bar) > pieceValue(statue) / 10);
});

test('a successful robbery: cash up to 10%, one piece, shield, heat, revenge; a heavy piece needs the van', () => {
  const thief = party(1), victim = party(2);
  const full = resolveHeist(thief, victim, 100_000, [statue, bar], null, ['picks'], sec, 0.5, 0.01, NORMAL);
  assert.equal(full.kind, 'full');
  assert.equal(full.loot.cash, 10_000);
  assert.deepEqual(full.loot.pieces.map((p) => p.uid), ['i1'], 'no van: the heavy bar stays, the statue goes');
  const withVan = resolveHeist(thief, victim, 100_000, [statue, bar], null, ['van'], sec, 0.5, 0.01, NORMAL);
  assert.equal(withVan.loot.pieces.length, 1);
  assert.equal(withVan.loot.pieces[0].uid, pieceValue(bar) > pieceValue(statue) ? 'i2' : 'i1', 'the most valuable piece in reach');
  assert.equal(resolveHeist(thief, victim, 100_000, [statue, bar], 'i1', ['van'], sec, 0.5, 0.01, NORMAL).loot.pieces[0].uid, 'i1', 'what the thief asked for');
  const { thief: t, victim: v } = applyHeist(thief, victim, full, NORMAL);
  assert.equal(heatNow(t, NORMAL), RULES.heatPerHeist);
  assert.equal(t.lastHeistAt, NORMAL);
  assert.equal(v.shieldUntil, NORMAL + RULES.shield);
  assert.equal(v.revenge[1], NORMAL + RULES.revengeWindow);
  assert.equal(v.lossPieces, 1);
  assert.equal(v.lossCash, 10_000);
});

test('a close call keeps only the cash; a failure means detention and a lot of heat and nothing for the victim', () => {
  const thief = party(1), victim = party(2);
  const chance = successChance([], sec);
  const close = resolveHeist(thief, victim, 50_000, [statue], null, [], sec, 0.5, chance * 0.9, NORMAL);
  assert.equal(close.kind, 'partial');
  assert.deepEqual(close.loot.pieces, []);
  const fail = resolveHeist(thief, victim, 50_000, [statue], null, [], sec, 0.5, 0.99, NORMAL);
  assert.equal(fail.kind, 'fail');
  const r = applyHeist(thief, victim, fail, NORMAL);
  assert.equal(heatNow(r.thief, NORMAL), RULES.heatPerFail);
  assert.equal(r.thief.detainedUntil, NORMAL + RULES.detention);
  assert.equal(r.victim.shieldUntil, 0, 'a failed attempt does not shield the victim');
  assert.equal(resolveHeist(party(1, 5), victim, 1, [], null, [], sec, 0.5, 0.1, NORMAL).kind, 'denied');
});

test('the daily cap holds across robberies; on Blackout Night the shield is half as long', () => {
  const thief = party(1), victim = party(2);
  const a = resolveHeist(thief, victim, 100_000, [statue], null, [], sec, 0.5, 0.01, NORMAL);
  const after = applyHeist(thief, victim, a, NORMAL).victim;
  const next = resolveHeist(party(3), party(2, 20, { ...after, shieldUntil: 0 }), 90_000, [statue], null, [], sec, 0.5, 0.01, NORMAL + H);
  assert.equal(next.kind, 'denied');
  assert.equal(next.reason, 'dailyCap');
  const night = applyHeist(thief, victim, resolveHeist(thief, victim, 100_000, [statue], null, [], sec, 0.5, 0.01, BLACKOUT), BLACKOUT).victim;
  assert.equal(night.shieldUntil - BLACKOUT, RULES.shield / 2);
});

test('the police: more heat, harder consequences; hot pieces make it worse; the Raid takes everything hot and prestige', () => {
  assert.deepEqual(['none', 'patrol', 'closure', 'raid'], [10, 40, 70, 90].map(policeLevel));
  assert.equal(policeAction(10, 3, true).seize, false);
  assert.equal(policeAction(40, 0, true).fineShare, 0, 'a patrol finds nothing without hot pieces');
  assert.equal(policeAction(40, 1, false).seize, false, 'nobody inspects a closed club');
  const patrol = policeAction(40, 1, true);
  assert.ok(patrol.seize && patrol.fineShare > 0 && patrol.closeHours === 0);
  const closure = policeAction(70, 1, true);
  assert.ok(closure.closeHours >= 1 && closure.fineShare > patrol.fineShare);
  const raid = policeAction(90, 0, true);
  assert.ok(raid.seize && raid.closeHours === 12 && raid.prestigeLoss > 0);
  assert.ok(patrolEveryHours(90) < patrolEveryHours(70) && patrolEveryHours(70) < patrolEveryHours(40) && patrolEveryHours(10) === 0);
  assert.equal(launderPrice(statue), Math.round(pieceValue(statue) * 0.3));
});

console.log(`\n${passed} tests passed`);
