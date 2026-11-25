// The ledger: what a club is WORTH and how much it could honestly have earned in a given time. The server uses it to judge
// what a player uploads. Wealth = coins + everything paid for (pieces in their versions, the bag, finishes, facade, works,
// reforms, staff, kits). Buying only moves wealth from coins to things, so it stays the same; the wealth can only GROW by what the
// club earns, by the reward of a finished mission, or by a robbery (which the server settles itself). Anything else (coins from
// nowhere, things for free) shows up as a jump that the club could not have earned. Pure logic, no clock inside.

import { BY_ID } from './catalog.ts';
import { invested } from './tiers.ts';
import { statsOf, tierOfItem, type ClubState } from './club.ts';
import { UPGRADE_BY_ID } from './exterior.ts';
import { DECOR_BY_ID } from './decor.ts';
import { RENOVATIONS } from './renovation.ts';
import { EXPANSION_PRICE } from './expansion.ts';
import { STAFF } from './staff.ts';
import { KITS } from './heist.ts';
import { MISSIONS, progressOf } from './story.ts';
import { XP } from './progression.ts';

/** Everything the club has paid for, valued at today's prices. */
export function assetValue(s: ClubState): number {
  let total = 0;
  for (const it of s.items) {
    const def = BY_ID.get(it.id);
    if (def) total += invested(def.price, tierOfItem(it));
  }
  for (const [id, n] of Object.entries(s.inventory)) total += (BY_ID.get(id)?.price ?? 0) * n;
  for (const k of s.kept ?? []) {
    const def = BY_ID.get(k.id);
    if (def) total += invested(def.price, k.tier);
  }
  for (const l of s.loot) {
    const def = BY_ID.get(l.id);
    if (def) total += invested(def.price, tierOfItem(l));
  }
  for (const id of s.exterior.owned) total += UPGRADE_BY_ID.get(id)?.price ?? 0;
  for (const id of s.decor.owned) total += DECOR_BY_ID.get(id)?.price ?? 0;
  for (let i = 0; i < s.renovation; i++) total += RENOVATIONS[i]?.price ?? 0;
  for (let p = 2; p <= s.phase; p++) total += EXPANSION_PRICE[p] ?? 0;
  for (const d of STAFF) total += d.hire * (s.staff[d.role] ?? 0);
  for (const k of KITS) total += k.price * (s.kits[k.id] ?? 0);
  return total;
}

export const wealthOf = (s: ClubState): number => s.coins + assetValue(s);

/** Most coins per minute a club could earn: a few times what the simulated players earn (see scripts/economy-sim.mjs). */
export function incomePerMinuteCap(prev: ClubState, next: ClubState): number {
  const cap = Math.max(statsOf(prev).capacity, statsOf(next).capacity);
  return 80 + 30 * cap;
}

/** Most XP per minute: honest play gives 10-20 even in a big club. */
export function xpPerMinuteCap(prev: ClubState, next: ClubState): number {
  const cap = Math.max(statsOf(prev).capacity, statsOf(next).capacity);
  return 60 + 2 * cap;
}

/** Longest stretch of play that one upload may account for (a day away is not a day of work: the offline income is capped). */
export const MAX_MINUTES = 600;

/** What the server's shadow club measured since the last upload (see core/shadow.ts). */
export interface Measured {
  coins: number;
  xp: number;
  seconds: number;
  /** coins per minute while open, 0 when not known yet */
  rate: number;
}

/** A real game may earn up to this many times what the shadow club did (a careful door, luck, a busy night). */
export const SLACK = 1.7;
/** ...and always gets this many minutes of its usual income on top, because the shadow lags a little behind the player. */
export const GRACE_MIN = 2;

export interface Allowance {
  coins: number;
  xp: number;
  /** missions that were marked done but whose goal is not met (their reward is not counted) */
  bogus: string[];
}

/** What a club may have gained between two uploads: the work of `minutes`, plus what the newly finished missions and newly discovered objects pay. */
export function allowance(prev: ClubState, next: ClubState, minutes: number, measured?: Measured): Allowance {
  const min = Math.min(Math.max(0, minutes), MAX_MINUTES);
  let coins = incomePerMinuteCap(prev, next) * (min + 2);
  let xp = xpPerMinuteCap(prev, next) * (min + 2);
  if (measured && (measured.seconds > 0 || measured.rate > 0)) {
    // measured by the server's own simulation: what it counted (times the slack), the time it did not cover at the guessed rate, and a short grace
    const simMin = measured.seconds / 60;
    const gap = Math.max(0, min - simMin);
    const cRate = measured.rate > 0 ? measured.rate * SLACK : incomePerMinuteCap(prev, next);
    const xRate = xpPerMinuteCap(prev, next);
    coins = measured.coins * SLACK + cRate * (gap + GRACE_MIN);
    xp = measured.xp * SLACK + xRate * (gap + GRACE_MIN);
  }
  const bogus: string[] = [];
  const had = new Set(prev.story.done);
  for (const id of next.story.done) {
    if (had.has(id)) continue;
    const m = MISSIONS.find((x) => x.id === id);
    const p = m ? progressOf(m, next) : null;
    if (!m || !p || p.current < p.target) {
      bogus.push(id);
      continue;
    }
    coins += m.reward.coins ?? 0;
    xp += m.reward.xp ?? 0;
    for (const [item, n] of Object.entries(m.reward.items ?? {})) coins += (BY_ID.get(item)?.price ?? 0) * n;
  }
  const seen = new Set(prev.stats.discovered);
  for (const id of next.stats.discovered) {
    if (seen.has(id)) continue;
    xp += Math.max(1, Math.ceil((BY_ID.get(id)?.price ?? 0) / XP.discoveryPer));
  }
  return { coins, xp, bogus };
}
