// Renovations and running costs: the money sinks of the long game. Pure logic.
//
// Running costs are paid for every minute the club is open (rent, power, cleaning) and grow with its size and luxury, so a
// big club is expensive to keep. Renovations are big one-off investments, five tiers, each making the club permanently
// nicer: more luxury, a higher cover charge and a happier crowd.

import { PRICE_SCALE } from './pricing.ts';
import { levelOf } from './progression.ts';
import { statsOf, type ClubState } from './club.ts';

export interface Renovation {
  tier: number;
  name: string;
  desc: string;
  price: number;
  unlockLevel: number;
}

const BASE_RENOVATIONS: Renovation[] = [
  { tier: 1, name: 'Pintura y luces nuevas', desc: 'El local se ve cuidado.', price: 5_000, unlockLevel: 8 },
  { tier: 2, name: 'Insonorización y barra de madera', desc: 'Suena mejor y se ve más serio.', price: 17_000, unlockLevel: 16 },
  { tier: 3, name: 'Reforma de diseñador', desc: 'Una revista habla de tu club.', price: 50_000, unlockLevel: 26 },
  { tier: 4, name: 'Zona VIP y acabados de lujo', desc: 'Mármol, cuero y terciopelo.', price: 135_000, unlockLevel: 38 },
  { tier: 5, name: 'Icono de la ciudad', desc: 'Todos quieren entrar a tu club.', price: 330_000, unlockLevel: 52 },
];

/** renovation prices are scaled (see pricing.ts) */
export const RENOVATIONS: Renovation[] = BASE_RENOVATIONS.map((r) => ({ ...r, price: r.price * PRICE_SCALE }));

export const MAX_TIER = RENOVATIONS.length;
/** each tier: +12% luxury, +10% cover charge, +2 points of crowd happiness */
export const LUXURY_PER_TIER = 0.12;
export const COVER_PER_TIER = 0.1;
export const COMFORT_PER_TIER = 2;

export function nextRenovation(state: ClubState): Renovation | undefined {
  return RENOVATIONS[state.renovation];
}

export function buyRenovation(state: ClubState): { state: ClubState; error?: string } {
  const r = nextRenovation(state);
  if (!r) return { state, error: 'Tu club ya tiene todas las reformas.' };
  if (levelOf(state.xp).level < r.unlockLevel) return { state, error: `Esta reforma se desbloquea en el nivel ${r.unlockLevel}.` };
  if (state.coins < r.price) return { state, error: 'No te alcanzan las monedas.' };
  return { state: { ...state, coins: state.coins - r.price, renovation: state.renovation + 1 } };
}

export function luxuryMultiplier(state: ClubState): number {
  return 1 + LUXURY_PER_TIER * state.renovation;
}

/** A bigger building costs more to run: the multiplier for each phase of the building. */
const PHASE_COST = [0.6, 1.2, 2.2, 3.5, 5, 6.5, 8];

/** Rent, power and cleaning per minute of an open club. */
export function upkeepPerMinute(state: ClubState): number {
  const st = statsOf(state);
  const f = PHASE_COST[Math.min(Math.max(state.phase, 1), PHASE_COST.length) - 1];
  return Math.round((0.45 * st.capacity + 0.05 * st.luxury) * f * 10) / 10;
}

export function sanitizeRenovation(raw: unknown): number {
  return Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw as number), 0), MAX_TIER) : 0;
}
