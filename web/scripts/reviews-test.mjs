// Reviews and the city's ranking (pure logic). Run: node --experimental-strip-types scripts/reviews-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, setPhase, sanitizeClub } from '../src/core/club.ts';
import { GuestSim } from '../src/core/guests.ts';
import { composeReview, complaints, starsFor, topComplaints, averageStars, ADVICE } from '../src/core/reviews.ts';
import { buildBoard, rankFactor, factorFor, fameScore } from '../src/core/ranking.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const put = (s, id, x, y) => placeItem(s, id, x, y, 0, 'free').state;
const rng = (() => { let a = 7; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const base = { happiness: 50, liking: 'ok', waited: 0, seats: 10, barSlots: 6, danceTiles: 20, inside: 10, capacity: 30, luxury: 120, rating: 60, gearComfort: 2, hasBartender: true };

test('stars follow how the guest felt, and a long wait takes one off', () => {
  assert.equal(starsFor(90, 0), 5);
  assert.equal(starsFor(70, 0), 4);
  assert.equal(starsFor(50, 0), 3);
  assert.equal(starsFor(30, 0), 2);
  assert.equal(starsFor(5, 0), 1);
  assert.equal(starsFor(90, 80), 4);
  assert.equal(starsFor(5, 80), 1, 'never below one');
});

test('a bad visit names what was wrong, a good one what was right, and every complaint has advice', () => {
  const bad = composeReview(rng, { ...base, happiness: 20, seats: 0, liking: 'dislike' });
  assert.ok(bad.stars <= 2);
  assert.deepEqual(bad.tags, ['musica', 'asientos']);
  assert.ok(bad.text.length > 10);
  const good = composeReview(rng, { ...base, happiness: 90, liking: 'love', luxury: 300, rating: 80 });
  assert.equal(good.stars, 5);
  assert.deepEqual(good.tags, ['musica+', 'lujo+']);
  for (const t of ['musica', 'fila', 'asientos', 'barra', 'bartender', 'pista', 'lleno', 'decoracion', 'sonido']) assert.ok(ADVICE[t], t);
  assert.deepEqual(complaints({ ...base, inside: 30, barSlots: 1, hasBartender: false, danceTiles: 2, gearComfort: 0, luxury: 10, waited: 60 }).sort(), ['barra', 'bartender', 'decoracion', 'fila', 'lleno', 'pista', 'sonido'].sort());
});

test('the complaints that repeat come first', () => {
  const r = (tags) => ({ id: 'x', at: 0, stars: 2, text: 't', tags, who: 'a' });
  const top = topComplaints([r(['asientos']), r(['asientos', 'musica']), r(['asientos']), r(['musica']), r(['musica+'])]);
  assert.deepEqual(top.map((c) => [c.tag, c.count]), [['asientos', 3], ['musica', 2]]);
  assert.equal(averageStars([r([]), { ...r([]), stars: 4 }]), 3);
});

test('guests leaving a real club leave reviews that match what the club lacks, and a closed club writes none', () => {
  let s = setPhase(newClub(), 3);
  for (let y = 4; y <= 6; y++) for (let x = 3; x <= 8; x++) s = put(s, 'floor_cyan', x, y);
  s = put(s, 'bar_straight', 1, 1);
  const sim = new GuestSim(9);
  sim.setLayout(s);
  sim.setMusic('rock'); // most of the crowd does not love it
  const reviews = [];
  for (let t = 0; t < 1800; t += 0.5) { sim.update(0.5); for (const n of sim.notes) if (n.kind === 'review') reviews.push(n); }
  assert.ok(reviews.length >= 3, `only ${reviews.length} reviews in half an hour`);
  assert.ok(reviews.every((r) => r.stars >= 1 && r.stars <= 5 && r.text && r.who));
  assert.ok(reviews.some((r) => r.tags.includes('asientos')), 'no seats at all: somebody says so');
  const closed = new GuestSim(9);
  closed.setLayout(s);
  closed.setMusic('rock');
  closed.setOpen(false);
  for (let t = 0; t < 600; t += 0.5) { closed.update(0.5); assert.ok(!closed.notes.some((n) => n.kind === 'review')); }
});

test('reviews survive a save and are capped', () => {
  const many = Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, at: i, stars: 9, text: 'x'.repeat(500), tags: ['musica', 'nope', 5], who: 'w'.repeat(99) }));
  const s = sanitizeClub({ reviews: many });
  assert.equal(s.reviews.length, 40);
  assert.ok(s.reviews.every((r) => r.stars === 5 && r.text.length <= 160 && r.who.length <= 24));
});

const club = (n, o) => ({ n, name: `C${n}`, rating: 50, luxury: 100, level: 5, vips: 0, open: true, online: true, ...o });

test('the ranking: open clubs by fame, closed ones below and out of the competition', () => {
  const board = buildBoard([club(1, { rating: 60 }), club(2, { rating: 90 }), club(3, { open: false, rating: 99 }), club(4, { rating: 40 })]);
  assert.deepEqual(board.map((r) => [r.n, r.rank]), [[2, 1], [1, 2], [4, 3], [3, 0]]);
  assert.equal(fameScore(club(3, { open: false })), 0);
  assert.ok(fameScore(club(1, { stars: 5 })) > fameScore(club(1, { stars: 1 })), 'good reviews raise the fame');
});

test('the crowd follows the ranking: the best gets +30%, the last -25%, a lonely club the normal amount', () => {
  assert.equal(rankFactor(1, 6), 1.3);
  assert.equal(rankFactor(6, 6), 0.75);
  assert.equal(rankFactor(1, 1), 1);
  assert.equal(rankFactor(0, 6), 1);
  const board = buildBoard([club(1, { rating: 90 }), club(2, { rating: 50 }), club(3, { rating: 70 })]);
  assert.ok(factorFor(board, 1) > factorFor(board, 3) && factorFor(board, 3) > factorFor(board, 2));
  // and it is real in the door: the same club with the best position gets more people than with the worst
  let s = setPhase(newClub(), 3);
  for (let y = 4; y <= 8; y++) for (let x = 3; x <= 8; x++) s = put(s, 'floor_cyan', x, y);
  const arrivals = (f) => { let total = 0; for (let seed = 1; seed <= 6; seed++) { const sim = new GuestSim(seed); sim.setLayout(s); sim.rankBoost = f; sim.upkeepOn = false; let n = 0; for (let t = 0; t < 900; t += 0.5) { sim.update(0.5); n += sim.events.filter((e) => e.kind === 'cover').length; } total += n; } return total; };
  assert.ok(arrivals(1.3) > arrivals(0.75) * 1.3, 'the best place fills the door');
});

console.log(`\n${passed} tests passed`);
