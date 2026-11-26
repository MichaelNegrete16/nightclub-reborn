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

export type UpgradeGroup = 'paint' | 'sign' | 'awning' | 'rope' | 'lights' | 'decor' | 'entrance' | 'terrace';

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
  /** terrace size (1 to 3): the free ground beside the club the player can furnish */
  terrace?: number;
}

export const DEFAULT_PAINT = 'paint_grey';

const BASE_UPGRADES: Upgrade[] = [
  { id: 'paint_grey', group: 'paint', name: 'Gris cemento', desc: 'La fachada con la que empiezas.', price: 0, unlockLevel: 1, color: 0x8f96b4 },
  { id: 'paint_red', group: 'paint', name: 'Rojo teatro', desc: 'Una fachada que se nota desde la esquina.', price: 250, unlockLevel: 2, color: 0xb23a48 },
  { id: 'paint_blue', group: 'paint', name: 'Azul medianoche', desc: 'Elegante y oscura.', price: 250, unlockLevel: 2, color: 0x3a56a8 },
  { id: 'paint_gold', group: 'paint', name: 'Dorado', desc: 'Para los que ya llegaron.', price: 900, unlockLevel: 8, color: 0xd9a928 },
  { id: 'paint_black', group: 'paint', name: 'Negro azabache', desc: 'Misterio y elegancia de noche.', price: 1800, unlockLevel: 10, color: 0x1c1b26 },
  { id: 'paint_white', group: 'paint', name: 'Blanco hielo', desc: 'Limpio, moderno y luminoso.', price: 2200, unlockLevel: 12, color: 0xe8e8f0 },
  { id: 'paint_purple', group: 'paint', name: 'Morado neón', desc: 'El color de las noches grandes.', price: 3000, unlockLevel: 14, color: 0x7a3ad6 },
  { id: 'paint_green', group: 'paint', name: 'Verde esmeralda', desc: 'Fresco y de lujo.', price: 4000, unlockLevel: 18, color: 0x1f8a5a },
  { id: 'paint_pink', group: 'paint', name: 'Rosa chicle', desc: 'Divertido y se ve desde lejos.', price: 5500, unlockLevel: 22, color: 0xe85aa8 },
  { id: 'paint_copper', group: 'paint', name: 'Cobre', desc: 'Metal cálido que brilla al atardecer.', price: 9000, unlockLevel: 28, color: 0xb8683a },
  { id: 'paint_pearl', group: 'paint', name: 'Perla', desc: 'Un blanco con reflejos rosados.', price: 14000, unlockLevel: 34, color: 0xf0e4ec },
  { id: 'paint_obsidian', group: 'paint', name: 'Obsidiana', desc: 'Negro volcánico, casi un espejo.', price: 24000, unlockLevel: 42, color: 0x2a1f3a },
  { id: 'awning', group: 'awning', name: 'Toldo de la entrada', desc: 'Los que esperan en la fila no se mojan.', price: 400, unlockLevel: 3 },
  { id: 'rope', group: 'rope', name: 'Cordón de terciopelo', desc: 'Una fila ordenada. La gente aguanta un 30% más esperando.', price: 350, unlockLevel: 3 },
  { id: 'sign_neon', group: 'sign', name: 'Letrero de neón', desc: 'El nombre del club con luces. 10% más gente llega.', price: 600, unlockLevel: 4, tier: 1 },
  { id: 'lights', group: 'lights', name: 'Reflectores', desc: 'Dos haces de luz en la entrada. 5% más gente llega.', price: 700, unlockLevel: 5 },
  { id: 'sign_giant', group: 'sign', name: 'Letrero gigante', desc: 'Se ve desde toda la cuadra. 20% más gente llega.', price: 2500, unlockLevel: 10, tier: 2 },
  { id: 'sign_holo', group: 'sign', name: 'Letrero holográfico', desc: 'Luz azul que flota sobre el techo. 30% más gente llega.', price: 14000, unlockLevel: 30, tier: 3 },
  { id: 'sign_imperial', group: 'sign', name: 'Letrero imperial', desc: 'Una corona de luz con tu nombre. 40% más gente llega.', price: 40000, unlockLevel: 45, tier: 4 },
  { id: 'searchlights', group: 'lights', name: 'Reflectores al cielo', desc: 'Dos haces de luz cruzan la noche sobre el club. 5% más gente llega.', price: 8000, unlockLevel: 30 },
  // the way in: the carpet, the line and the door itself
  { id: 'flowerbeds', group: 'entrance', name: 'Maceteros con flores', desc: 'Flores frescas a los lados de la fila.', price: 2600, unlockLevel: 16 },
  { id: 'carpet_gold', group: 'entrance', name: 'Alfombra dorada', desc: 'Una alfombra de oro para recibir a los famosos.', price: 6000, unlockLevel: 20 },
  { id: 'braziers', group: 'entrance', name: 'Braseros de fuego', desc: 'Llamas que calientan la fila y se ven desde lejos.', price: 6500, unlockLevel: 26 },
  { id: 'walkfame', group: 'entrance', name: 'Paseo de las estrellas', desc: 'Estrellas doradas en el piso, como en Hollywood.', price: 8000, unlockLevel: 30 },
  { id: 'doorglass', group: 'entrance', name: 'Puertas de cristal doradas', desc: 'Dos hojas de cristal con marco de oro en la puerta.', price: 9000, unlockLevel: 34 },
  { id: 'lanearch', group: 'entrance', name: 'Arco de luces', desc: 'Un arco con bombillas sobre el comienzo de la fila.', price: 14000, unlockLevel: 40 },
  { id: 'flamecols', group: 'entrance', name: 'Columnas de fuego', desc: 'Dos columnas altas de fuego a cada lado de la puerta.', price: 22000, unlockLevel: 46 },
  // the terrace: free ground beside the club that the player furnishes with objects from the shop (core/club.ts, patioRect)
  { id: 'terrace_1', group: 'terrace', name: 'Terraza: el terreno', desc: 'Abre un terreno al costado del club (4×6 casillas) para armar tu disco al aire libre con objetos de la Tienda › Terraza.', price: 15000, unlockLevel: 25, terrace: 1 },
  { id: 'terrace_2', group: 'terrace', name: 'Terraza ampliada', desc: 'El terreno crece a 7×9 casillas: más espacio para la pista, el escenario y la barra.', price: 40000, unlockLevel: 35, terrace: 2 },
  { id: 'terrace_3', group: 'terrace', name: 'Terraza grande', desc: 'El terreno llega a 10×12 casillas: una disco al aire libre completa.', price: 90000, unlockLevel: 45, terrace: 3 },
  // looks only: they make the outside feel expensive
  { id: 'planters', group: 'decor', name: 'Jardineras y palmeras', desc: 'Palmeras y arbustos podados en el frente del club.', price: 1200, unlockLevel: 6 },
  { id: 'uplights', group: 'decor', name: 'Luces en la fachada', desc: 'Franjas de luz que bañan las paredes y el borde del techo.', price: 1600, unlockLevel: 8 },
  { id: 'columns', group: 'decor', name: 'Entrada de mármol', desc: 'Columnas doradas, zócalo de mármol y escalón en la puerta.', price: 3500, unlockLevel: 12 },
  { id: 'banners', group: 'decor', name: 'Estandartes', desc: 'Banderas colgantes de colores entre las ventanas.', price: 2800, unlockLevel: 14 },
  { id: 'doorneon', group: 'decor', name: 'Neón en la puerta', desc: 'Un marco de neón rosa y cian alrededor de la entrada.', price: 3200, unlockLevel: 16 },
  { id: 'bollards', group: 'decor', name: 'Postes de luz', desc: 'Luces bajas que marcan el camino hasta la puerta.', price: 3000, unlockLevel: 18 },
  { id: 'valet', group: 'decor', name: 'Servicio de valet', desc: 'Una caseta con valet y conos para los autos de los VIP.', price: 5000, unlockLevel: 20 },
  { id: 'lions', group: 'decor', name: 'Leones de piedra', desc: 'Dos leones sobre pedestales cuidan la entrada.', price: 7000, unlockLevel: 24 },
  { id: 'ledscreen', group: 'decor', name: 'Pantalla LED gigante', desc: 'Una pantalla en el costado con luces que cambian.', price: 12000, unlockLevel: 28 },
  { id: 'fountain', group: 'decor', name: 'Fuente de la entrada', desc: 'Una fuente iluminada frente al club.', price: 15000, unlockLevel: 32 },
  { id: 'rooftop', group: 'decor', name: 'Terraza en el techo', desc: 'Barandas de cristal, mesas y guirnaldas de luces arriba.', price: 25000, unlockLevel: 38 },
  { id: 'limo', group: 'decor', name: 'Limusina en la puerta', desc: 'Una limusina negra esperando a los famosos.', price: 40000, unlockLevel: 48 },
];

/** facade prices are scaled (see pricing.ts) */
export const UPGRADES: Upgrade[] = BASE_UPGRADES.map((u) => ({ ...u, price: u.price * PRICE_SCALE }));

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

/** What the outside would look like with one more upgrade (to try it on before buying). */
export function previewExterior(ext: Exterior, id: string): Exterior {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return ext;
  const owned = ext.owned.includes(id) ? ext.owned : [...ext.owned, id];
  return { owned, paint: u.group === 'paint' ? id : ext.paint };
}

export function newExterior(): Exterior {
  return { owned: [DEFAULT_PAINT], paint: DEFAULT_PAINT };
}

export function has(ext: Exterior, id: string): boolean {
  return ext.owned.includes(id);
}

export function paintColor(ext: Exterior): number {
  return UPGRADE_BY_ID.get(ext.paint)?.color ?? 0x8f96b4;
}

/** The biggest sign owned: 0 plain, 1 neon, 2 giant, 3 holographic, 4 imperial. */
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
  const sign = [1, 1.1, 1.2, 1.3, 1.4][signTier(ext)];
  const dressing = Math.min(0.12, ext.owned.filter((id) => ['decor', 'entrance'].includes(UPGRADE_BY_ID.get(id)?.group ?? '')).length * 0.01);
  return { arrivals: sign * (has(ext, 'lights') ? 1.05 : 1) * (has(ext, 'searchlights') ? 1.05 : 1) * (1 + dressing), patience: has(ext, 'rope') ? 1.3 : 1 };
}

/** The size of the terrace: 0 none, 1 to 3. */
export function terraceTier(ext: Exterior): number {
  return Math.max(0, ...ext.owned.map((id) => UPGRADE_BY_ID.get(id)?.terrace ?? 0));
}

export function buyUpgrade(state: ClubState, id: string): { state: ClubState; error?: string } {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return { state, error: 'Esa mejora no existe.' };
  if (has(state.exterior, id)) return { state, error: 'Ya la tienes.' };
  if (u.terrace && terraceTier(state.exterior) < u.terrace - 1) return { state, error: 'Primero compra la terraza anterior.' };
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
