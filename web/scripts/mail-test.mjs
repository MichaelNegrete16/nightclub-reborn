// The mailbox letters (pure logic). Run: node --experimental-strip-types scripts/mail-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem } from '../src/core/club.ts';
import { applyMail, cleanMail } from '../src/core/mail.ts';
import { buyKit, hotHeatPerHour } from '../src/core/kits.ts';
import { KITS, RULES } from '../src/core/heist.ts';
import { sanitizeClub } from '../src/core/club.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

test('a robbery letter removes the stolen pieces and the cash, never below zero, and leaves the rest', () => {
  let s = { ...newClub(), coins: 5000, phase: 3 };
  s = placeItem(placeItem(s, 'gold_statue', 1, 1, 0, 'free').state, 'plant', 4, 4, 0, 'free').state;
  const statue = s.items.find((i) => i.id === 'gold_statue');
  const letter = { id: 'm1', at: 1, kind: 'robbed', by: 2, byName: 'X', cash: 800, pieces: [{ uid: statue.uid, id: 'gold_statue', tier: 1 }] };
  const after = applyMail(s, [letter]);
  assert.equal(after.coins, 4200);
  assert.deepEqual(after.items.map((i) => i.id), ['plant']);
  assert.equal(applyMail(s, [{ ...letter, cash: 99999 }]).coins, 0);
  assert.equal(applyMail(s, []), s, 'no letters, nothing changes');
  assert.equal(applyMail(after, [letter]).coins, 4200, 'a letter that arrives twice before it is confirmed is applied once');
});

test('letters from the network are cleaned', () => {
  assert.deepEqual(cleanMail('junk'), []);
  const m = cleanMail([{ id: 'a', kind: 'robbed', by: 3, byName: 'n'.repeat(99), cash: -5, pieces: [{ uid: 'i1', id: 'gold_statue', tier: 99 }, { nope: 1 }] }, { id: 'b', kind: 'other' }]);
  assert.equal(m.length, 1);
  assert.equal(m[0].byName.length, 20);
  assert.equal(m[0].cash, 0);
  assert.deepEqual(m[0].pieces, [{ uid: 'i1', id: 'gold_statue', tier: 4 }]);
});

test('a loot letter brings the cash and the hot piece (once only) and uses up the kits; kits are bought from Zeta from level 10', () => {
  const s = { ...newClub(), coins: 1000, kits: { picks: 2, jammer: 0, van: 1, disguise: 0 } };
  const letter = { id: 'l1', at: 1, kind: 'loot', by: 5, byName: 'V', cash: 500, kitsUsed: ['picks', 'van'], pieces: [{ uid: 'h1', id: 'gold_statue', tier: 3, hotUntil: 999 }] };
  const a = applyMail(s, [letter]);
  assert.equal(a.coins, 1500);
  assert.deepEqual(a.loot, [{ uid: 'h1', id: 'gold_statue', tier: 3, hotUntil: 999, from: 5 }]);
  assert.deepEqual(a.kits, { picks: 1, jammer: 0, van: 0, disguise: 0 });
  assert.equal(applyMail(a, [letter]).loot.length, 1, 'the same piece is never added twice');
  const back = sanitizeClub(JSON.parse(JSON.stringify(a)));
  assert.equal(back.loot[0].hotUntil, 999);
  assert.equal(back.kits.picks, 1);
  assert.equal(sanitizeClub({ kits: { picks: 9999, van: 5 }, loot: [{ uid: 'x', id: 'nope' }] }).kits.van, 1, 'only one van');
});

test('buying a kit: level 10, coins, one van only; hot pieces on display add heat every hour', () => {
  const rich = { ...newClub(), coins: 1e12, xp: 600000 };
  assert.match(buyKit({ ...newClub(), coins: 1e12 }, 'picks').error, /nivel 10/);
  assert.match(buyKit({ ...rich, coins: 1 }, 'picks').error, /monedas/);
  const k = KITS.find((x) => x.id === 'picks');
  const b = buyKit(rich, 'picks').state;
  assert.equal(rich.coins - b.coins, k.price);
  assert.equal(b.kits.picks, 1);
  const v = buyKit(rich, 'van').state;
  assert.match(buyKit(v, 'van').error, /Ya tienes/);
  const now = 1000;
  assert.equal(hotHeatPerHour([{ hot: now + 5 }, { hot: now - 5 }, {}], now), RULES.heatPerHotPieceHour);
});

test('a police letter fines, takes the pieces (shown or in the bag) and shuts the club', () => {
  let s = { ...newClub(), coins: 5000, phase: 3, open: true, loot: [{ uid: 'bag1', id: 'gold_statue', tier: 1, hotUntil: 9e12, from: 2 }] };
  s = placeItem(s, 'plant', 4, 4, 0, 'free').state;
  const plant = s.items[0];
  const letter = { id: 'p1', at: 1000, kind: 'police', by: 0, byName: 'Brigada del Ruido', cash: 600, closedUntil: 1000 + 6 * 3600_000, pieces: [{ uid: 'bag1', id: 'gold_statue', tier: 1 }, { uid: plant.uid, id: 'plant', tier: 1 }] };
  const after = applyMail(s, [letter]);
  assert.equal(after.coins, 4400);
  assert.equal(after.open, false);
  assert.equal(after.loot.length, 0);
  assert.equal(after.items.length, 0);
  assert.equal(cleanMail([letter])[0].closedUntil, letter.closedUntil);
  // a fine with no closure leaves the club open
  assert.equal(applyMail(s, [{ ...letter, closedUntil: undefined }]).open, true);
});

test('every letter is written in the reports once, and my own successful jobs count for the missions', () => {
  const s = { ...newClub(), phase: 3 };
  const loot = { id: 'l9', at: 5, kind: 'loot', by: 3, byName: 'V', cash: 100, pieces: [], kitsUsed: [] };
  const a = applyMail(s, [loot]);
  assert.equal(a.stats.heists, 1);
  assert.equal(a.reports.length, 1);
  const b = applyMail(a, [loot]);
  assert.equal(b.reports.length, 1, 'not written twice');
  assert.equal(b.stats.heists, 1, 'not counted twice');
  assert.equal(applyMail(s, [{ ...loot, id: 'l10', cash: 0 }]).stats.heists, 0, 'a failed job is not a heist done');
});

test('an income letter pays the club once, whatever the number of times it arrives', () => {
  const s = { ...newClub(), coins: 1000 };
  const letter = { id: 'a1', at: 5, kind: 'income', by: -1, byName: '', cash: 4200, minutes: 480, pieces: [] };
  const a = applyMail(s, [letter, letter]);
  assert.equal(a.coins, 5200);
  assert.equal(applyMail(a, [letter]).coins, 5200);
  assert.equal(cleanMail([letter])[0].minutes, 480);
});

test('a fee letter charges the protector once; a jail letter fines the thief and shuts their club', () => {
  const s = { ...newClub(), coins: 5000, open: true };
  const fee = { id: 'g1', at: 100, kind: 'fee', by: -1, byName: 'Protector antirrobos 6 h', cash: 1200, pieces: [] };
  const a = applyMail(s, [fee, fee]);
  assert.equal(a.coins, 3800);
  assert.equal(a.open, true, 'a fee does not close the club');
  assert.equal(applyMail(a, [fee]).coins, 3800);
  const jail = { id: 'j1', at: 100, kind: 'jail', by: 3, byName: 'Club Rival', cash: 250, closedUntil: 100 + 10 * 60_000, pieces: [] };
  const b = applyMail(a, [jail, jail]);
  assert.equal(b.coins, 3550);
  assert.equal(b.open, false);
  assert.equal(cleanMail([jail])[0].closedUntil, jail.closedUntil);
  assert.equal(applyMail({ ...s, coins: 100 }, [jail]).coins, 0, 'never below zero');
});

console.log(`\n${passed} tests passed`);
