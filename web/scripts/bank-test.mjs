// The bank: loans, hourly installments, arrears (late fee, embargo, closure), early payoff, and the ledger. Run: node --experimental-strip-types scripts/bank-test.mjs
import assert from 'node:assert/strict';
import { newClub, placeItem, sanitizeClub } from '../src/core/club.ts';
import { BANK, bankMinute, lendLimit, payoffPrice, quote, repay, takeLoan, whyNotLend } from '../src/core/bank.ts';
import { applyMail } from '../src/core/mail.ts';
import { wealthOf } from '../src/core/ledger.ts';
import { bankScene, SCENE_EVENTS } from '../src/core/bank-scenes.ts';
import { SPEAKERS } from '../src/core/story.ts';
import { NPC_LOOKS } from '../src/core/npcs.ts';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };
const NOW = Date.UTC(2026, 10, 30, 12, 0, 0);
const rich = (level = 20, coins = 50_000) => ({ ...newClub(), xp: level >= 20 ? 3_500_000 : 800_000, coins, open: true });
const hour = (state, now = NOW) => { let st = state; let letters = []; for (let i = 0; i < BANK.cycleMinutes; i++) { const r = bankMinute(st, now); st = r.state; letters = letters.concat(r.letters); } return { state: st, letters }; };

test('a loan needs the level, one at a time, good credit, a sensible amount and stays within the limit', () => {
  assert.match(whyNotLend({ ...newClub(), xp: 0 }, NOW), /nivel 15/);
  assert.match(takeLoan(newClub(), 5000, NOW, 'l1').error, /nivel/);
  const s = rich();
  assert.match(takeLoan(s, 500, NOW, 'l1').error, /mínimo/);
  assert.match(takeLoan(s, lendLimit(s) + 1, NOW, 'l1').error, /hasta/);
  const r = takeLoan(s, 20_000, NOW, 'l1');
  assert.equal(r.error, undefined);
  assert.equal(r.state.coins, s.coins + 20_000);
  const q = quote(20_000);
  assert.equal(r.loan.owed, 20_000 + q.fee);
  assert.equal(q.fee, Math.round(20_000 * BANK.feeShare));
  assert.equal(r.loan.installment, Math.ceil(r.loan.owed / BANK.installments));
  assert.match(takeLoan(r.state, 5000, NOW, 'l2').error, /Ya tienes/);
  assert.match(takeLoan({ ...s, badCreditUntil: NOW + 1000 }, 5000, NOW, 'l3').error, /mal crédito/);
});

test('the debt counts against the wealth: a loan can never make a club look richer', () => {
  const s = rich();
  const r = takeLoan(s, 20_000, NOW, 'l1').state;
  assert.equal(wealthOf(r), wealthOf(s) - quote(20_000).fee, 'only the fee is lost at once');
});

test('every hour the bank collects an installment; the loan ends when it is all paid', () => {
  let st = takeLoan(rich(20, 1_000_000), 12_000, NOW, 'l1').state;
  const owed = st.loan.owed;
  const first = hour(st);
  assert.equal(first.letters.length, 1);
  assert.equal(first.letters[0].event, 'payment');
  assert.equal(first.state.loan.owed, owed - st.loan.installment);
  assert.equal(first.state.coins, st.coins - st.loan.installment);
  assert.equal(first.state.loan.due, 0);
  // minutes inside the hour change nothing visible
  assert.equal(bankMinute(st, NOW).letters.length, 0);
  let cur = st;
  let last;
  for (let h = 0; h < BANK.installments + 1 && cur.loan; h++) { const r = hour(cur); cur = r.state; last = r.letters.at(-1); }
  assert.equal(cur.loan, null, 'paid off');
  assert.equal(last.event, 'paid');
});

test('arrears: a late hour, then mora with a fee and bad credit, then embargo, then closure; paying brings everything back', () => {
  let st = takeLoan(rich(25, 0), 20_000, NOW, 'l1').state;
  st = { ...st, coins: 0 };
  st = placeItem({ ...st, coins: 0 }, 'trophy_case', 1, 1, 0, 'free').state; // the only valuable non-essential piece (free placement costs nothing)
  st = placeItem(st, 'bar_straight', 4, 4, 0, 'free').state;
  const events = [];
  let ever = null;
  for (let h = 0; h < BANK.closeAt + 1; h++) {
    const r = hour(st, NOW + h * 3_600_000);
    st = r.state;
    for (const l of r.letters) events.push(l.event);
    if (h === BANK.moraAt) ever = st;
  }
  assert.equal(events[0], 'late', 'the first hour with nothing to pay is just late');
  assert.ok(events.includes('mora') && events.includes('embargo') && events.includes('closure'), events.join());
  assert.ok(events.indexOf('mora') < events.indexOf('embargo') && events.indexOf('embargo') < events.indexOf('closure'));
  assert.ok(st.loan.closed && st.open === false, 'the club is shut');
  assert.ok(st.badCreditUntil > NOW, 'bad credit');
  assert.equal(st.embargoed.length, 1);
  assert.equal(st.embargoed[0].id, 'trophy_case', 'the most valuable non-essential piece');
  assert.ok(!st.items.some((i) => i.id === 'trophy_case'), 'and it is gone from the room');
  assert.ok(st.items.some((i) => i.id === 'bar_straight'), 'the bar is essential: never taken');
  assert.ok(ever.loan.owed > 0);
  // the owner pays what is due: the club reopens (but the debt stays)
  st = { ...st, coins: st.loan.due + 10 };
  const back = repay(st, st.loan.due);
  assert.equal(back.letter.event, 'reopened');
  assert.equal(back.state.loan.closed, false);
  assert.equal(back.state.loan.arrears, 0);
  assert.ok(back.state.loan.owed > 0);
  // and paying it all gives the held piece back to the bag
  const rest = { ...back.state, coins: 10_000_000 };
  const done = repay(rest, 'all');
  assert.equal(done.letter.event, 'repaid');
  assert.equal(done.state.loan, null);
  assert.equal(done.state.embargoed.length, 0);
  assert.ok(done.state.kept.some((k) => k.id === 'trophy_case'), 'back in the bag');
});

test('paying everything early forgives half of the fee that was left', () => {
  const st = takeLoan(rich(20, 1_000_000), 40_000, NOW, 'l1').state;
  const full = st.loan.owed;
  const price = payoffPrice(st.loan);
  assert.equal(price, Math.round(full - 0.5 * (full * (st.loan.fee / (st.loan.principal + st.loan.fee)))));
  assert.ok(price < full && price > st.loan.principal);
  assert.match(repay({ ...st, coins: price - 1 }, 'all').error, /hacen falta/);
  const done = repay(st, 'all');
  assert.equal(done.state.coins, st.coins - price);
  assert.equal(done.state.loan, null);
  assert.match(repay(rich(), 500).error, /ningún préstamo/);
});

test('the bank\'s letters make the player\'s game agree with the server, once', () => {
  const server = takeLoan(rich(20), 20_000, NOW, 'l1');
  const letter = { id: 'b1', at: NOW, kind: 'bank', by: -1, byName: 'Banco del Ruido', cash: 20_000, pieces: [], bank: { event: 'granted', delta: 20_000, loan: server.loan, embargoed: [], badUntil: 0, taken: [], returned: [] } };
  const mine = rich();
  const after = applyMail(mine, [letter]);
  assert.equal(after.coins, mine.coins + 20_000);
  assert.deepEqual(after.loan, server.loan);
  assert.equal(applyMail(after, [letter]).coins, after.coins, 'a letter is never applied twice');
  const survived = sanitizeClub(JSON.parse(JSON.stringify(after)));
  assert.deepEqual(survived.loan, server.loan, 'the loan survives saving and loading');
  assert.equal(sanitizeClub({ loan: { id: 'x', owed: -5 } }).loan, null, 'a broken loan is dropped');
});

test('the bank\'s scenes show what happened, and the routine events have none', () => {
  const loan = takeLoan(rich(), 20_000, NOW, 'l1').loan;
  const letter = (event, extra = {}) => ({ id: `b-${event}`, at: NOW, kind: 'bank', by: -1, byName: 'Banco del Ruido', cash: 0, pieces: [], bank: { event, delta: 0, loan, embargoed: [], badUntil: 0, taken: [], returned: [], ...extra } });
  for (const e of ['payment', 'late', 'reopened', 'repaid', 'paid']) assert.equal(bankScene(letter(e), 'Camila'), null, `${e} is only a notice`);
  for (const e of SCENE_EVENTS) {
    const sc = bankScene(letter(e, e === 'embargo' ? { taken: [{ uid: 'u1', id: 'gold_statue', tier: 4 }, { uid: 'u2', id: 'trophy_case', tier: 2 }] } : {}), 'Camila');
    assert.ok(sc && sc.lines.length >= 4, e);
    assert.ok(sc.lines.every((l) => l.who === 'narrator' || SPEAKERS[l.who]), 'every speaker exists');
    assert.ok(sc.lines.some((l) => l.shot), 'with a picture');
  }
  assert.ok(NPC_LOOKS.bruno && SPEAKERS.bruno.name === 'Don Bruno');
  const emb = bankScene(letter('embargo', { taken: [{ uid: 'u1', id: 'gold_statue', tier: 4 }, { uid: 'u2', id: 'trophy_case', tier: 2 }] }), 'Camila');
  assert.equal(emb.lines[0].shot, 'embargo|gold_statue,trophy_case', 'the picture shows the pieces that were taken');
  assert.match(emb.lines[1].text, /estatua dorada y vitrina de trofeos/i);
  assert.match(bankScene(letter('granted', { delta: 20_000 }), 'Camila').lines[1].text, /20\.000/);
});

console.log(`\n${passed} tests passed`);
