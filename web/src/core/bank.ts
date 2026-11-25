// The bank: a loan to buy things sooner, paid back by the hour with a flat fee. Pure logic, used by the city server (which keeps the
// real books) and by the game (which only shows them).
//
// The rules, in short:
//  - one loan at a time, from level 15, up to a limit that grows with the level; nothing is lent to someone with bad credit
//  - the fee is a flat share of what is lent (no compound interest): you owe `principal + fee`, split in equal hourly installments
//  - an "hour" is 60 minutes the city server is UP and the owner is free (the clock stops while it is off or the owner is in prison)
//  - each hour the bank collects what is due from the club's cash. What cannot be collected stays due, and the arrears grow:
//      3 hours  -> late fee and bad credit (no new loans for two days)
//      6 hours  -> embargo: the bank takes the most valuable piece that is not essential (it comes back to the bag when the debt is paid)
//      10 hours -> closure: the club stays shut until what is due is paid
//  - paying everything early cuts the fee that was left in half
//  - the debt counts against the club's wealth (core/ledger.ts), so a loan can never be used to look richer

import { BY_ID } from './catalog.ts';
import type { ClubState, KeptPiece } from './club.ts';
import { tierOfItem } from './club.ts';
import { PRICE_SCALE } from './pricing.ts';
import { levelOf } from './progression.ts';
import { invested } from './tiers.ts';

export const BANK = {
  minLevel: 15,
  /** flat fee on what is lent */
  feeShare: 0.15,
  /** how many hourly installments the debt is split in */
  installments: 12,
  /** server minutes in an "hour" */
  cycleMinutes: 60,
  /** extra charged on what is due when the club falls into arrears */
  lateFeeShare: 0.05,
  moraAt: 3,
  embargoAt: 6,
  closeAt: 10,
  /** no new loan for this long after falling into arrears */
  badCreditMs: 48 * 3_600_000,
  /** early payoff: this share of the fee still to pay is forgiven */
  payoffDiscount: 0.5,
};

export interface Loan {
  id: string;
  /** when it was taken (ms) */
  at: number;
  principal: number;
  fee: number;
  /** what is left to pay, fee included */
  owed: number;
  /** each hour's share */
  installment: number;
  /** what should have been paid already and has not been */
  due: number;
  /** minutes into the current hour (0 to 59) */
  cycle: number;
  /** hours in a row that ended with something unpaid */
  arrears: number;
  /** the bank has shut the club until what is due is paid */
  closed: boolean;
}

export type BankEvent = 'granted' | 'payment' | 'late' | 'mora' | 'embargo' | 'closure' | 'reopened' | 'repaid' | 'paid';

export interface BankLetter {
  event: BankEvent;
  /** coins that came in (+) or went out (-) of the club with this event */
  delta: number;
  /** the loan as it stands after the event (null: none) */
  loan: Loan | null;
  /** the pieces the bank holds after the event */
  embargoed: KeptPiece[];
  /** no new loans until this time (ms; 0: credit is fine) */
  badUntil: number;
  /** pieces taken from the club (embargo) or given back to the bag (paid) with this event */
  taken: KeptPiece[];
  returned: KeptPiece[];
}

/** What the bank lends at most at a level (prices scale with the economy). */
export function loanLimit(level: number): number {
  const l = Math.max(1, level);
  return Math.round(2000 * l * PRICE_SCALE * (1 + l / 25));
}

/** Pieces that keep the club working: the bank never takes them. */
const ESSENTIAL = (id: string): boolean => {
  const d = BY_ID.get(id);
  return !d || d.layer === 'floor' || d.category === 'bars' || d.category === 'dj' || d.category === 'security' || d.category === 'tables' || d.category === 'seats';
};

/** What a loan of this size would cost and how it would be paid. */
export function quote(principal: number): { fee: number; owed: number; installment: number } {
  const p = Math.max(0, Math.floor(principal));
  const fee = Math.round(p * BANK.feeShare);
  const owed = p + fee;
  return { fee, owed, installment: Math.ceil(owed / BANK.installments) };
}

/** Why this club cannot borrow right now (null: it can). */
export function whyNotLend(state: ClubState, now: number): string | null {
  if (levelOf(state.xp).level < BANK.minLevel) return `El banco presta desde el nivel ${BANK.minLevel}.`;
  if (state.loan) return 'Ya tienes un préstamo: termina de pagarlo primero.';
  if (state.badCreditUntil > now) return 'Tienes mal crédito por atrasarte: el banco no te presta todavía.';
  return null;
}

export function lendLimit(state: ClubState): number {
  return loanLimit(levelOf(state.xp).level);
}

/** Take a loan: the cash arrives at once and the debt starts. */
export function takeLoan(state: ClubState, amount: number, now: number, id: string): { state: ClubState; loan?: Loan; error?: string } {
  const why = whyNotLend(state, now);
  if (why) return { state, error: why };
  const principal = Math.floor(amount);
  if (!(principal >= 1000)) return { state, error: 'El préstamo mínimo es de 1.000 monedas.' };
  if (principal > lendLimit(state)) return { state, error: `A tu nivel el banco presta hasta ${lendLimit(state).toLocaleString('es-CO')} monedas.` };
  const q = quote(principal);
  const loan: Loan = { id, at: now, principal, fee: q.fee, owed: q.owed, installment: q.installment, due: 0, cycle: 0, arrears: 0, closed: false };
  return { state: { ...state, coins: state.coins + principal, loan }, loan };
}

/** What it costs to pay everything now: the fee still to pay is cut in half. */
export function payoffPrice(loan: Loan): number {
  const feeLeft = loan.owed * (loan.fee / Math.max(1, loan.principal + loan.fee));
  return Math.max(0, Math.round(loan.owed - BANK.payoffDiscount * feeLeft));
}

export const bankLetter = (state: ClubState, event: BankEvent, delta: number, taken: KeptPiece[] = [], returned: KeptPiece[] = []): BankLetter => ({
  event,
  delta,
  loan: state.loan,
  embargoed: state.embargoed,
  badUntil: state.badCreditUntil,
  taken,
  returned,
});

/** The loan is over: the pieces the bank held go back to the bag. */
function settle(state: ClubState, event: 'paid' | 'repaid', delta: number): { state: ClubState; letter: BankLetter } {
  const back = state.embargoed;
  const kept = [...state.kept, ...back.filter((b) => !state.kept.some((k) => k.uid === b.uid))];
  const next = { ...state, loan: null, embargoed: [], kept };
  return { state: next, letter: bankLetter(next, event, delta, [], back) };
}

/**
 * Pay on purpose. `amount` is what to pay now (it goes to what is due first), or 'all' to pay everything with the early discount.
 * Returns the new state and the letter for it (null if nothing was paid).
 */
export function repay(state: ClubState, amount: number | 'all'): { state: ClubState; letter?: BankLetter; error?: string } {
  const loan = state.loan;
  if (!loan) return { state, error: 'No tienes ningún préstamo.' };
  if (amount === 'all') {
    const price = payoffPrice(loan);
    if (state.coins < price) return { state, error: `Para pagar todo ahora hacen falta ${price.toLocaleString('es-CO')} monedas.` };
    const paid = { ...state, coins: state.coins - price };
    const done = settle(paid, 'repaid', -price);
    return { state: done.state, letter: done.letter };
  }
  const pay = Math.min(Math.floor(amount), loan.owed, state.coins);
  if (!(pay > 0)) return { state, error: 'No hay nada que pagar con esas monedas.' };
  const owed = loan.owed - pay;
  if (owed <= 0) {
    const done = settle({ ...state, coins: state.coins - pay }, 'paid', -pay);
    return { state: done.state, letter: done.letter };
  }
  const due = Math.max(0, loan.due - pay);
  const reopened = loan.closed && due === 0;
  const next = { ...state, coins: state.coins - pay, loan: { ...loan, owed, due, closed: reopened ? false : loan.closed, arrears: due === 0 ? 0 : loan.arrears } };
  return { state: next, letter: bankLetter(next, reopened ? 'reopened' : 'payment', -pay) };
}

/** The piece the bank would take: the most valuable one that is not essential. */
function embargoPick(state: ClubState): KeptPiece | null {
  let best: { it: ClubState['items'][number]; v: number } | null = null;
  for (const it of state.items) {
    if (ESSENTIAL(it.id)) continue;
    const def = BY_ID.get(it.id);
    if (!def) continue;
    const v = invested(def.price, tierOfItem(it));
    if (!best || v > best.v) best = { it, v };
  }
  return best ? { uid: best.it.uid, id: best.it.id, tier: tierOfItem(best.it) } : null;
}

/**
 * One minute of the bank's clock for a club with a loan (call it only while the city server is up and the owner is free).
 * Returns the new state and the letters to send, if anything happened (most minutes nothing does).
 */
export function bankMinute(state: ClubState, now: number): { state: ClubState; letters: BankLetter[] } {
  const loan = state.loan;
  if (!loan) return { state, letters: [] };
  if (loan.cycle + 1 < BANK.cycleMinutes) return { state: { ...state, loan: { ...loan, cycle: loan.cycle + 1 } }, letters: [] };

  // the hour is over: whatever is still unpaid from before counts as arrears, then this hour's installment falls due
  const letters: BankLetter[] = [];
  let arrears = loan.due > 0 ? loan.arrears + 1 : 0;
  let due = Math.min(loan.owed, loan.due + loan.installment);
  let owed = loan.owed;
  let coins = state.coins;
  const pay = Math.min(due, coins);
  coins -= pay;
  owed -= pay;
  due -= pay;
  let next: ClubState = { ...state, coins, loan: { ...loan, cycle: 0, owed, due, arrears } };
  if (owed <= 0) {
    const done = settle(next, 'paid', -pay);
    return { state: done.state, letters: [done.letter] };
  }
  if (due === 0) {
    arrears = 0;
    const reopened = loan.closed;
    next = { ...next, loan: { ...next.loan!, arrears: 0, closed: false } };
    return { state: next, letters: [bankLetter(next, reopened ? 'reopened' : 'payment', -pay)] };
  }
  // something is still unpaid
  let event: BankEvent = pay > 0 ? 'payment' : 'late';
  let taken: KeptPiece[] = [];
  if (arrears === BANK.moraAt) {
    const fee = Math.round(due * BANK.lateFeeShare);
    next = { ...next, badCreditUntil: now + BANK.badCreditMs, loan: { ...next.loan!, owed: owed + fee, due: due + fee } };
    event = 'mora';
  }
  if (arrears === BANK.embargoAt) {
    const piece = embargoPick(next);
    if (piece) {
      next = { ...next, items: next.items.filter((i) => i.uid !== piece.uid), embargoed: [...next.embargoed, piece] };
      taken = [piece];
      event = 'embargo';
    }
  }
  if (arrears >= BANK.closeAt && !next.loan!.closed) {
    next = { ...next, open: false, loan: { ...next.loan!, closed: true } };
    event = 'closure';
  }
  letters.push(bankLetter(next, event, -pay, taken));
  return { state: next, letters };
}
