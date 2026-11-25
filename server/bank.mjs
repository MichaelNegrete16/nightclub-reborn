// The bank, on the server: it keeps the real books (the loan lives in the player's saved game on the server, and an uploaded game can
// never change it), collects the hourly installments while the server is up, and sends the player a letter for everything that happens.
// The rules themselves are in web/src/core/bank.ts.

import { bankLetter, bankMinute, repay, takeLoan } from '../web/src/core/bank.ts';

const BANK_NAME = 'Banco del Ruido';
/** a club the bank has shut stays shut "forever" until the debt is paid: a date this far away marks it */
const CLOSURE_MS = 400 * 86_400_000;

function send(deliver, id, n, now, letter, extra = '') {
  deliver(id, { id: `b${now}-${n}${extra}`, at: now, kind: 'bank', by: -1, byName: BANK_NAME, cash: Math.abs(letter.delta), pieces: [], bank: letter });
}

/** The bank shut the club (or opened it again): the city's record of the club follows. */
function followClosure(world, id, loanAfter, now) {
  const p = world.players.get(id);
  if (!p) return;
  const c = p.crime;
  if (loanAfter?.closed && !(c.closedUntil > now + CLOSURE_MS / 2)) world.setCrime(id, { ...c, closedUntil: now + CLOSURE_MS });
  else if (!loanAfter?.closed && c.closedUntil > now + CLOSURE_MS / 2) world.setCrime(id, { ...c, closedUntil: 0 });
}

/** The player asks for a loan. */
export function lend(world, saves, id, amount, deliver, now = Date.now()) {
  const p = world.players.get(id);
  const save = saves.read(id);
  if (!p || !save) return { ok: false, error: 'Tu partida todavía no está en el servidor: espera un momento.' };
  if (p.crime.detainedUntil > now) return { ok: false, error: 'No puedes pedir un préstamo estando en prisión.' };
  const r = takeLoan(save.state, Number(amount), now, `l${now}-${p.n}`);
  if (r.error) return { ok: false, error: r.error };
  saves.update(id, () => r.state, now);
  send(deliver, id, p.n, now, bankLetter(r.state, 'granted', Math.floor(Number(amount))));
  return { ok: true, loan: r.loan };
}

/** The player pays something (or everything: `amount` 'all'). */
export function payback(world, saves, id, amount, deliver, now = Date.now()) {
  const p = world.players.get(id);
  const save = saves.read(id);
  if (!p || !save) return { ok: false, error: 'Tu partida todavía no está en el servidor: espera un momento.' };
  const r = repay(save.state, amount === 'all' ? 'all' : Number(amount));
  if (r.error) return { ok: false, error: r.error };
  saves.update(id, () => r.state, now);
  send(deliver, id, p.n, now, r.letter);
  followClosure(world, id, r.state.loan, now);
  return { ok: true, paid: -r.letter.delta, loan: r.state.loan };
}

/**
 * One pass, every minute the server is up: the bank's clock moves for every club with a loan, except for owners who are in prison
 * (their clock waits). Returns the letters sent, for logs and tests.
 */
export function bankTick(world, saves, deliver, now = Date.now()) {
  const sent = [];
  for (const [id, p] of world.players) {
    const save = saves.read(id);
    if (!save?.state.loan) continue;
    if (p.crime.detainedUntil > now) continue;
    const r = bankMinute(save.state, now);
    if (!r.letters.length && r.state.loan?.cycle === save.state.loan.cycle) continue;
    saves.update(id, () => r.state, now);
    r.letters.forEach((l, i) => {
      send(deliver, id, p.n, now, l, `-${i}`);
      sent.push({ n: p.n, event: l.event });
    });
    if (r.letters.length) followClosure(world, id, r.state.loan, now);
  }
  return sent;
}
