// Buying the robbery kits from Zeta, and what the player's own bag of stolen pieces looks like. Pure logic.

import { levelOf } from './progression.ts';
import { KIT_BY_ID, RULES, launderPrice, type Kit } from './heist.ts';
import type { ClubState } from './club.ts';

export function buyKit(state: ClubState, kit: Kit): { state: ClubState; error?: string } {
  const k = KIT_BY_ID.get(kit);
  if (!k) return { state, error: 'Ese kit no existe.' };
  if (levelOf(state.xp).level < RULES.noviceLevel) return { state, error: `Zeta solo vende a partir del nivel ${RULES.noviceLevel}.` };
  if (kit === 'van' && state.kits.van >= 1) return { state, error: 'Ya tienes la furgoneta.' };
  if (state.kits[kit] >= 99) return { state, error: 'Ya llevas muchos.' };
  if (state.coins < k.price) return { state, error: 'No te alcanzan las monedas.' };
  return { state: { ...state, coins: state.coins - k.price, kits: { ...state.kits, [kit]: state.kits[kit] + 1 } } };
}

/** Is this stolen piece still hot at `now`? */
export const isHot = (hotUntil: number, now: number): boolean => hotUntil > now;

/** Total heat a player's hot pieces on display add per hour. */
export function hotHeatPerHour(items: ReadonlyArray<{ hot?: number }>, now: number): number {
  return items.filter((i) => isHot(i.hot ?? 0, now)).length * RULES.heatPerHotPieceHour;
}

export { launderPrice };
