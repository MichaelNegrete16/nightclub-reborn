// What an object earns by itself. Shows (the dancing cage and podium) and trophies pay coins every minute the club is open, with music
// on and a crowd around: a full crowd of 8 people pays the whole amount, fewer pay a share. The simulation (core/guests.ts) pays these
// amounts, and the shop shows them, so what the description says is exactly what the club earns. Pure logic.

import type { ItemDef } from './catalog.ts';
import { TIER_LUXURY } from './tiers.ts';

/** dancing cages and podiums by version: tips per minute with a full crowd (the cage), and the dancer's wage */
export const SHOW_RATE = [300, 500, 800, 1250];
export const SHOW_WAGE = [20, 36, 60, 96];
/** every show piece: how much of the cage's tips and wage it has (the small podium is a cheaper stage) */
export const SHOW_SHARE: Record<string, number> = { dance_cage: 1, pole_podium: 0.4 };
/** a trophy pays this many coins a minute per point of its luxury (times the version's multiplier) */
export const TROPHY_RATE = 3;

export interface Earning {
  /** coins per minute with a full crowd, for each version (1 to 4) */
  perMin: number[];
  /** what it costs per minute to run (a dancer's wage), for each version */
  wage: number[];
  /** how far people watching it count, in tiles */
  radius: number;
  kind: 'show' | 'trophy';
}

/** The earnings of an object, or null if it earns nothing by itself. */
export function earningOf(def: Pick<ItemDef, 'id' | 'category' | 'luxury'>): Earning | null {
  const share = SHOW_SHARE[def.id];
  if (share) return { perMin: SHOW_RATE.map((r) => Math.round(r * share)), wage: SHOW_WAGE.map((w) => Math.round(w * share)), radius: 5, kind: 'show' };
  if (def.category === 'trophies') return { perMin: TIER_LUXURY.map((m) => Math.round(def.luxury * TROPHY_RATE * m * 10) / 10), wage: [0, 0, 0, 0], radius: 9, kind: 'trophy' };
  return null;
}
