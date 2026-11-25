// The guide: which tip is next, one at a time, remembered once seen (pure logic). Run: node --experimental-strip-types scripts/tips-test.mjs
import assert from 'node:assert/strict';
import { newClub, sanitizeClub, addXp } from '../src/core/club.ts';
import { TIPS, nextTip, markTipSeen } from '../src/core/tips.ts';
import { xpToNext, levelOf } from '../src/core/progression.ts';
import { NEWS, LATEST_NEWS } from '../src/core/news.ts';
import { BY_ID } from '../src/core/catalog.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const ctx = (state, extra = {}) => ({ state, online: false, heat: 0, opened: new Set(), ...extra });
const toLevel = (s, lv) => { while (levelOf(s.xp).level < lv) s = addXp(s, xpToNext(levelOf(s.xp).level)); return s; };

test('a new club has nothing to explain yet; opening a window explains it, once', () => {
  let s = newClub();
  assert.equal(nextTip(ctx(s)), null);
  const t = nextTip(ctx(s, { opened: new Set(['shop']) }));
  assert.equal(t.id, 'shop');
  s = markTipSeen(s, 'shop');
  assert.equal(nextTip(ctx(s, { opened: new Set(['shop']) })), null, 'never twice');
  assert.deepEqual(s.story.tips, ['shop']);
  assert.equal(markTipSeen(s, 'shop'), s, 'marking twice changes nothing');
});

test('things that happen bring their tip, one at a time and in the order of the list', () => {
  let s = toLevel(newClub(), 10);
  const first = nextTip(ctx(s));
  assert.ok(['staff', 'defense'].includes(first.id));
  let seen = 0;
  while (nextTip(ctx(s, { heat: 40, online: true }))) {
    s = markTipSeen(s, nextTip(ctx(s, { heat: 40, online: true })).id);
    seen++;
    assert.ok(seen < 30);
  }
  assert.ok(s.story.tips.includes('police') && s.story.tips.includes('city'));
});

test('every tip has text, an icon and a reason it is still locked; ids are unique; the list survives a save', () => {
  assert.equal(new Set(TIPS.map((t) => t.id)).size, TIPS.length);
  for (const t of TIPS) assert.ok(t.title && t.text && t.icon && t.locked, t.id);
  const s = sanitizeClub({ ...markTipSeen(newClub(), 'shop'), story: { ...newClub().story, tips: ['shop', 'x'.repeat(99), 5] } });
  assert.deepEqual(s.story.tips.map((t) => t.slice(0, 4)), ['shop', 'xxxx']);
});

test('the novedades list: the newest is first, every picture exists and what was seen is remembered', () => {
  assert.equal(LATEST_NEWS, NEWS[0].id);
  assert.equal(new Set(NEWS.map((n) => n.id)).size, NEWS.length);
  for (const n of NEWS) for (const e of n.entries) {
    assert.ok(e.title && e.text, e.title);
    if (e.kind === 'item') assert.ok(BY_ID.has(e.ref), e.ref);
  }
  assert.equal(newClub().story.news, '');
  assert.equal(sanitizeClub({ story: { news: LATEST_NEWS } }).story.news, LATEST_NEWS);
});

console.log(`\n${passed} tests passed`);
