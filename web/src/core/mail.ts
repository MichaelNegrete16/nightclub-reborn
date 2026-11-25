// The mailbox: what the server tells a player has happened to their club while they were away (for now, a robbery). The
// server applies it to its own copy at once; the player's game applies the same thing when it gets the mail, then confirms.
// Pure logic, used by both sides so they always agree.

import type { ClubState } from './club.ts';
import { sanitizeLoan } from './club.ts';
import type { BankLetter } from './bank.ts';
import type { Kit } from './heist.ts';

export interface MailPiece {
  uid: string;
  id: string;
  tier: number;
  /** stolen pieces are "hot" until this time (ms) */
  hotUntil?: number;
}

export interface Mail {
  id: string;
  at: number;
  /** robbed: something was taken from my club · loot: what I took in a robbery of mine (or what I spent trying) */
  kind: 'robbed' | 'loot' | 'police' | 'income' | 'fee' | 'jail' | 'refund' | 'bank';
  /** bank: what happened with the loan and how it stands now */
  bank?: BankLetter;
  /** income: how many minutes the club worked while the player was away */
  minutes?: number;
  /** jail: what was taken (cash), how the thief was found out, and which piece they went for */
  stolenCash?: number;
  story?: 'caught' | 'convicted' | 'raid';
  /** jail: how many chores to do to get out */
  chores?: number;
  /** police: the club is shut until then (ms) */
  closedUntil?: number;
  /** loot: the kits used up */
  kitsUsed?: Kit[];
  /** lot number and name of the thief */
  by: number;
  byName: string;
  cash: number;
  pieces: MailPiece[];
}

/** The state after the losses in these letters: the pieces are gone and the cash is lower (never below zero). */
export function applyMail(state: ClubState, mail: readonly Mail[]): ClubState {
  if (!mail.length) return state;
  let next = state;
  for (const m of mail) {
    // a letter that is already written down was applied before (it can arrive twice before it is confirmed): never twice
    if (next.reports.some((r) => r.id === m.id)) continue;
    // every letter is written down once (the log is what the player reads; the same letter is never counted twice)
    const isNew = !next.reports.some((r) => r.id === m.id);
    if (m.kind === 'fee' || m.kind === 'jail') {
      // money paid (the anti-theft protector) or a fine for being caught robbing, and for a jail the club is shut too
      const rep = { id: m.id, at: m.at, kind: m.kind, by: m.by, byName: m.byName, cash: m.cash, pieces: [] as string[], closedUntil: m.closedUntil ?? 0 };
      next = { ...next, coins: Math.max(0, next.coins - m.cash), open: m.kind === 'jail' && (m.closedUntil ?? 0) > m.at ? false : next.open, reports: [rep, ...next.reports].slice(0, 12) };
      continue;
    }
    if (m.kind === 'bank' && m.bank) {
      // the bank's books: the loan as the server keeps it, the cash that moved, the pieces held or given back
      const b = m.bank;
      const gone = new Set(b.taken.map((p) => p.uid));
      const kept = [...next.kept, ...b.returned.filter((p) => !next.kept.some((k) => k.uid === p.uid))];
      const rep = { id: m.id, at: m.at, kind: 'bank' as const, by: -1, byName: m.byName, cash: Math.abs(b.delta), pieces: b.taken.map((p) => p.id), closedUntil: 0, event: b.event };
      next = {
        ...next,
        coins: Math.max(0, next.coins + b.delta),
        loan: b.loan,
        embargoed: b.embargoed,
        badCreditUntil: b.badUntil,
        kept,
        items: next.items.filter((i) => !gone.has(i.uid)),
        open: b.event === 'closure' ? false : next.open,
        // routine hourly payments replace the previous one in the log, so they do not push the robberies out (a letter is still never applied twice)
        reports: [rep, ...next.reports.filter((r) => !(b.event === 'payment' && r.kind === 'bank' && r.event === 'payment'))].slice(0, 12),
      };
      continue;
    }
    if (m.kind === 'refund') {
      // money given back (a punishment that should not have been)
      const rep = { id: m.id, at: m.at, kind: 'refund' as const, by: -1, byName: m.byName, cash: m.cash, pieces: [] as string[], closedUntil: 0 };
      next = { ...next, coins: next.coins + m.cash, reports: [rep, ...next.reports].slice(0, 12) };
      continue;
    }
    if (m.kind === 'income') {
      // what the club earned while the player was away (the server worked it out and kept its own copy up to date)
      next = { ...next, coins: next.coins + m.cash, reports: isNew ? [{ id: m.id, at: m.at, kind: 'income' as const, by: -1, byName: '', cash: m.cash, pieces: [], closedUntil: 0 }, ...next.reports].slice(0, 12) : next.reports };
      continue;
    }
    if (isNew) {
      const rep = { id: m.id, at: m.at, kind: m.kind, by: m.by, byName: m.byName, cash: m.cash, pieces: m.pieces.map((p) => p.id), closedUntil: m.closedUntil ?? 0 };
      const worked = m.kind === 'loot' && (m.cash > 0 || m.pieces.length > 0);
      next = { ...next, reports: [rep, ...next.reports].slice(0, 12), stats: worked ? { ...next.stats, heists: next.stats.heists + 1 } : next.stats };
    }
    if (m.kind === 'robbed' || m.kind === 'police') {
      const gone = new Set(m.pieces.map((p) => p.uid));
      next = { ...next, coins: Math.max(0, next.coins - m.cash), items: next.items.filter((i) => !gone.has(i.uid)), loot: next.loot.filter((l) => !gone.has(l.uid)), open: m.kind === 'police' && (m.closedUntil ?? 0) > m.at ? false : next.open };
    } else {
      // my own robbery: the cash comes in, the pieces go into the hot bag (once each), the used kits are gone
      const have = new Set(next.loot.map((l) => l.uid));
      const added = m.pieces.filter((p) => !have.has(p.uid)).map((p) => ({ uid: p.uid, id: p.id, tier: p.tier, hotUntil: p.hotUntil ?? 0, from: m.by }));
      const kits = { ...next.kits };
      for (const k of m.kitsUsed ?? []) kits[k] = Math.max(0, (kits[k] ?? 0) - 1);
      next = { ...next, coins: next.coins + m.cash, loot: [...next.loot, ...added], kits };
    }
  }
  return next;
}

const EVENTS = ['granted', 'payment', 'late', 'mora', 'embargo', 'closure', 'reopened', 'repaid', 'paid'];
const cleanPieces = (v: unknown): BankLetter['taken'] =>
  (Array.isArray(v) ? v : []).slice(0, 5).filter((p) => p && typeof p.uid === 'string' && typeof p.id === 'string').map((p) => ({ uid: p.uid.slice(0, 30), id: p.id.slice(0, 30), tier: Math.min(4, Math.max(1, Math.floor(Number(p.tier) || 1))) as 1 | 2 | 3 | 4 }));

function cleanBank(raw: unknown): BankLetter | undefined {
  const b = raw as Partial<BankLetter> | null;
  if (!b || typeof b !== 'object' || typeof b.event !== 'string' || !EVENTS.includes(b.event)) return undefined;
  return {
    event: b.event,
    delta: Number.isFinite(b.delta) ? Math.max(-1e12, Math.min(1e12, Math.round(b.delta as number))) : 0,
    loan: sanitizeLoan(b.loan),
    embargoed: cleanPieces(b.embargoed),
    badUntil: Number.isFinite(b.badUntil) ? Math.max(0, b.badUntil as number) : 0,
    taken: cleanPieces(b.taken),
    returned: cleanPieces(b.returned),
  };
}

/** Keep only well-formed letters (they come from the network). */
export function cleanMail(raw: unknown): Mail[] {
  if (!Array.isArray(raw)) return [];
  const out: Mail[] = [];
  for (const m of raw.slice(0, 50)) {
    const x = m as Partial<Mail>;
    if (!x || typeof x.id !== 'string' || (x.kind !== 'robbed' && x.kind !== 'loot' && x.kind !== 'police' && x.kind !== 'income' && x.kind !== 'fee' && x.kind !== 'jail' && x.kind !== 'refund' && x.kind !== 'bank')) continue;
    out.push({
      id: x.id.slice(0, 40),
      at: Number.isFinite(x.at) ? (x.at as number) : 0,
      kind: x.kind,
      ...(Number.isFinite(x.closedUntil) ? { closedUntil: x.closedUntil } : {}),
      ...(Number.isFinite(x.stolenCash) ? { stolenCash: Math.max(0, Math.floor(x.stolenCash as number)) } : {}),
      ...(Number.isFinite(x.chores) ? { chores: Math.max(0, Math.min(Math.floor(x.chores as number), 200)) } : {}),
      ...(x.story === 'caught' || x.story === 'convicted' || x.story === 'raid' ? { story: x.story } : {}),
      ...(Number.isFinite(x.minutes) ? { minutes: Math.max(0, Math.min(Math.floor(x.minutes as number), 100000)) } : {}),
      ...(x.kind === 'bank' ? { bank: cleanBank(x.bank) } : {}),
      kitsUsed: Array.isArray(x.kitsUsed) ? (x.kitsUsed.filter((k) => ['picks', 'jammer', 'van', 'disguise'].includes(k as string)) as Kit[]).slice(0, 4) : undefined,
      by: Number.isInteger(x.by) ? (x.by as number) : -1,
      byName: typeof x.byName === 'string' ? x.byName.slice(0, 20) : '',
      cash: Number.isFinite(x.cash) ? Math.max(0, Math.floor(x.cash as number)) : 0,
      pieces: Array.isArray(x.pieces) ? x.pieces.slice(0, 5).filter((p) => p && typeof p.uid === 'string' && typeof p.id === 'string').map((p) => ({ uid: p.uid.slice(0, 20), id: p.id.slice(0, 30), tier: Math.min(4, Math.max(1, Math.floor(Number(p.tier) || 1))), ...(Number.isFinite(p.hotUntil) ? { hotUntil: p.hotUntil } : {}) })) : [],
    });
  }
  return out;
}
