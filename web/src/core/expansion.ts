// Expanding the club: the level only OPENS the next building, the player has to pay for the works. Pure logic.

import { PHASES, levelNow, type ClubState, type Phase } from './club.ts';
import { PRICE_SCALE } from './pricing.ts';
import { PHASE_LEVELS } from './progression.ts';

/** Price of the works that take the club to phase N (index = N). Big on purpose: it is the biggest purchase of each stage. */
export const EXPANSION_PRICE = [0, 0, 3_000, 30_000, 180_000, 800_000, 3_000_000, 9_000_000].map((p) => p * PRICE_SCALE);

export interface Expansion {
  phase: Phase;
  price: number;
  /** level that opens it */
  unlockLevel: number;
}

/** The next building the club can grow into (undefined when it already is the biggest). */
export function nextExpansion(state: ClubState): Expansion | undefined {
  const phase = PHASES[state.phase]; // PHASES[i] is phase i + 1, so this is the one after the current
  if (!phase) return undefined;
  return { phase, price: EXPANSION_PRICE[phase.id], unlockLevel: PHASE_LEVELS[phase.id - 1] };
}

export function expansionState(state: ClubState): { ok: boolean; reason?: string } {
  const e = nextExpansion(state);
  if (!e) return { ok: false, reason: 'Tu club ya es el más grande.' };
  if (levelNow(state) < e.unlockLevel) return { ok: false, reason: `La ampliación se abre en el nivel ${e.unlockLevel}.` };
  if (state.coins < e.price) return { ok: false, reason: 'No te alcanzan las monedas para la obra.' };
  return { ok: true };
}

/** Pay for the works: the club becomes the next building (the furniture stays where it is). */
export function buyExpansion(state: ClubState): { state: ClubState; error?: string } {
  const e = nextExpansion(state);
  const check = expansionState(state);
  if (!e || !check.ok) return { state, error: check.reason };
  return { state: { ...state, coins: state.coins - e.price, phase: e.phase.id } };
}
