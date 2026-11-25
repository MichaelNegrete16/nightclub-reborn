// The outside of the club: facade paint, sign, awning, velvet rope and entrance lights. Pure logic.
// Upgrades are bought once with coins (and unlock by level); some are only looks, some change how the door works.

import type { ClubState } from './club.ts';
import { PRICE_SCALE } from './pricing.ts';
import { levelOf } from './progression.ts';

export interface Exterior {
  /** ids of the upgrades the player owns */
  owned: string[];
  /** the paint in use (one of the owned `paint` upgrades, or the free default) */
  paint: string;
}

export type UpgradeGroup = 'paint' | 'sign' | 'awning' | 'rope' | 'lights' | 'decor';

export interface Upgrade {
  id: string;
  group: UpgradeGroup;
  name: string;
  desc: string;
  price: number;
  unlockLevel: number;
  /** facade color, for paints */
  color?: number;
  /** sign size: a bigger sign brings more people to the door */
  tier?: number;
}

export const DEFAULT_PAINT = 'paint_grey';

const BASE_UPGRADES: Upgrade[] = [
  { id: 'paint_grey', group: 'paint', name: 'Gris cemento', desc: 'La fachada con la que empiezas.', price: 0, unlockLevel: 1, color: 0x8f96b4 },
  { id: 'paint_red', group: 'paint', name: 'Rojo teatro', desc: 'Una fachada que se nota desde la esquina.', price: 250, unlockLevel: 2, color: 0xb23a48 },
  { id: 'paint_blue', group: 'paint', name: 'Azul medianoche', desc: 'Elegante y oscura.', price: 250, unlockLevel: 2, color: 0x3a56a8 },
  { id: 'paint_gold', group: 'paint', name: 'Dorado', desc: 'Para los que ya llegaron.', price: 900, unlockLevel: 8, color: 0xd9a928 },
  { id: 'awning', group: 'awning', name: 'Toldo de la entrada', desc: 'Los que esperan en la fila no se mojan.', price: 400, unlockLevel: 3 },
  { id: 'rope', group: 'rope', name: 'Cordón de terciopelo', desc: 'Una fila ordenada. La gente aguanta un 30% más esperando.', price: 350, unlockLevel: 3 },
  { id: 'sign_neon', group: 'sign', name: 'Letrero de neón', desc: 'El nombre del club con luces. 10% más gente llega.', price: 600, unlockLevel: 4, tier: 1 },
  { id: 'lights', group: 'lights', name: 'Reflectores', desc: 'Dos haces de luz en la entrada. 5% más gente llega.', price: 700, unlockLevel: 5 },
  { id: 'sign_giant', group: 'sign', name: 'Letrero gigante', desc: 'Se ve desde toda la cuadra. 20% más gente llega.', price: 2500, unlockLevel: 10, tier: 2 },
  // looks only: they make the outside feel expensive
  { id: 'planters', group: 'decor', name: 'Jardineras y palmeras', desc: 'Palmeras y arbustos podados en el frente del club.', price: 1200, unlockLevel: 6 },
  { id: 'uplights', group: 'decor', name: 'Luces en la fachada', desc: 'Franjas de luz que bañan las paredes y el borde del techo.', price: 1600, unlockLevel: 8 },
  { id: 'columns', group: 'decor', name: 'Entrada de mármol', desc: 'Columnas doradas, zócalo de mármol y escalón en la puerta.', price: 3500, unlockLevel: 12 },
];

/** facade prices are scaled (see pricing.ts) */
export const UPGRADES: Upgrade[] = BASE_UPGRADES.map((u) => ({ ...u, price: u.price * PRICE_SCALE }));

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function newExterior(): Exterior {
  return { owned: [DEFAULT_PAINT], paint: DEFAULT_PAINT };
}

export function has(ext: Exterior, id: string): boolean {
  return ext.owned.includes(id);
}

export function paintColor(ext: Exterior): number {
  return UPGRADE_BY_ID.get(ext.paint)?.color ?? 0x8f96b4;
}

/** The biggest sign owned: 0 plain, 1 neon, 2 giant. */
export function signTier(ext: Exterior): number {
  return Math.max(0, ...ext.owned.map((id) => UPGRADE_BY_ID.get(id)?.tier ?? 0));
}

export interface DoorPerks {
  /** multiplier on how many people arrive */
  arrivals: number;
  /** multiplier on how long they wait in line */
  patience: number;
}

export function perksOf(ext: Exterior): DoorPerks {
  const sign = [1, 1.1, 1.2][signTier(ext)];
  return { arrivals: sign * (has(ext, 'lights') ? 1.05 : 1), patience: has(ext, 'rope') ? 1.3 : 1 };
}

export function buyUpgrade(state: ClubState, id: string): { state: ClubState; error?: string } {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return { state, error: 'Esa mejora no existe.' };
  if (has(state.exterior, id)) return { state, error: 'Ya la tienes.' };
  if (levelOf(state.xp).level < u.unlockLevel) return { state, error: `Se desbloquea en el nivel ${u.unlockLevel}.` };
  if (state.coins < u.price) return { state, error: 'No te alcanzan las monedas.' };
  const owned = [...state.exterior.owned, id];
  // a new paint goes on the walls right away
  const paint = u.group === 'paint' ? id : state.exterior.paint;
  return { state: { ...state, coins: state.coins - u.price, exterior: { owned, paint } } };
}

/** Switch to another paint you already own. */
export function choosePaint(state: ClubState, id: string): { state: ClubState; error?: string } {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || u.group !== 'paint' || !has(state.exterior, id)) return { state, error: 'Todavía no tienes esa pintura.' };
  return { state: { ...state, exterior: { ...state.exterior, paint: id } } };
}

export function sanitizeExterior(raw: unknown): Exterior {
  const r = (raw ?? {}) as Partial<Exterior>;
  const owned = new Set<string>([DEFAULT_PAINT]);
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && UPGRADE_BY_ID.has(id)) owned.add(id);
  const paint = typeof r.paint === 'string' && owned.has(r.paint) && UPGRADE_BY_ID.get(r.paint)!.group === 'paint' ? r.paint : DEFAULT_PAINT;
  return { owned: [...owned], paint };
}
