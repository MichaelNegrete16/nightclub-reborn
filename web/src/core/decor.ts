// The look of the inside of the club: walls, floor, mouldings and neon, lighting and wall art. You start with the bare
// basement and buy better and better finishes. Pure logic (the drawing lives in render/roomstyle.ts).

import type { ClubState } from './club.ts';
import { levelOf } from './progression.ts';
import { PRICE_SCALE } from './pricing.ts';

export type DecorGroup = 'wall' | 'floor' | 'trim' | 'light' | 'art';

export interface DecorOption {
  id: string;
  group: DecorGroup;
  name: string;
  desc: string;
  /** base price (multiplied by the price scale) */
  price: number;
  unlockLevel: number;
  /** colour of the little swatch in the window */
  swatch: number;
  /** luxury it adds to the club */
  luxury: number;
}

export const GROUPS: Array<{ id: DecorGroup; label: string; hint: string }> = [
  { id: 'wall', label: 'Paredes', hint: 'Lo primero que se ve al entrar.' },
  { id: 'floor', label: 'Suelo', hint: 'Debajo de la pista y de las mesas.' },
  { id: 'trim', label: 'Molduras y neón', hint: 'El borde de las paredes.' },
  { id: 'light', label: 'Iluminación', hint: 'El ambiente de luces del local.' },
  { id: 'art', label: 'Cuadros y afiches', hint: 'Lo que cuelga de la pared del fondo.' },
];

const BASE: DecorOption[] = [
  { id: 'wall_concrete', group: 'wall', name: 'Concreto pelado', desc: 'Lo que hay en un sótano.', price: 0, unlockLevel: 1, swatch: 0x7c8088, luxury: 0 },
  { id: 'wall_paint', group: 'wall', name: 'Pintura lisa', desc: 'Una mano de pintura lila y el sótano ya parece otro.', price: 500, unlockLevel: 2, swatch: 0xb8b4d8, luxury: 6 },
  { id: 'wall_brick', group: 'wall', name: 'Ladrillo visto', desc: 'El clásico de los bares con carácter.', price: 1500, unlockLevel: 4, swatch: 0xb0503a, luxury: 14 },
  { id: 'wall_wood', group: 'wall', name: 'Paneles de madera', desc: 'Cálido, elegante, de local con clase.', price: 5000, unlockLevel: 8, swatch: 0x8a5a32, luxury: 26 },
  { id: 'wall_marble', group: 'wall', name: 'Mármol y espejos', desc: 'Para clubes que ya llegaron.', price: 14000, unlockLevel: 14, swatch: 0xe9e6f0, luxury: 44 },
  { id: 'wall_neon', group: 'wall', name: 'Cristal y neón', desc: 'Paredes que brillan solas. Lo último.', price: 40000, unlockLevel: 24, swatch: 0x2a3cff, luxury: 70 },

  { id: 'floor_cement', group: 'floor', name: 'Cemento', desc: 'El suelo con el que empiezas.', price: 0, unlockLevel: 1, swatch: 0x5a6180, luxury: 0 },
  { id: 'floor_tile', group: 'floor', name: 'Cerámica', desc: 'Limpia y fácil de cuidar.', price: 800, unlockLevel: 3, swatch: 0xc9c4b8, luxury: 6 },
  { id: 'floor_checker', group: 'floor', name: 'Damero blanco y negro', desc: 'El suelo de las discotecas de siempre.', price: 3000, unlockLevel: 6, swatch: 0xeeeeee, luxury: 14 },
  { id: 'floor_wood', group: 'floor', name: 'Parquet', desc: 'Madera brillante bajo los pies.', price: 9000, unlockLevel: 10, swatch: 0xb07a45, luxury: 26 },
  { id: 'floor_marble', group: 'floor', name: 'Mármol negro', desc: 'Pulido, oscuro, caro.', price: 25000, unlockLevel: 16, swatch: 0x2a2a35, luxury: 44 },
  { id: 'floor_led', group: 'floor', name: 'Cristal con luz', desc: 'Todo el suelo late con la música.', price: 60000, unlockLevel: 26, swatch: 0x18e0ff, luxury: 70 },

  { id: 'trim_none', group: 'trim', name: 'Sin molduras', desc: 'Las paredes terminan a secas.', price: 0, unlockLevel: 1, swatch: 0x44485a, luxury: 0 },
  { id: 'trim_baseboard', group: 'trim', name: 'Zócalo y cornisa', desc: 'Un borde de madera que le da forma al salón.', price: 300, unlockLevel: 2, swatch: 0x8a5a32, luxury: 4 },
  { id: 'trim_neon', group: 'trim', name: 'Neón doble', desc: 'Una tira cian y una rosa en lo alto de las paredes.', price: 1500, unlockLevel: 5, swatch: 0x18e0ff, luxury: 10 },
  { id: 'trim_rgb', group: 'trim', name: 'Neón RGB', desc: 'Cambia de color solo, todo el tiempo.', price: 6000, unlockLevel: 12, swatch: 0xff3da6, luxury: 20 },
  { id: 'trim_gold', group: 'trim', name: 'Molduras doradas', desc: 'Columnas y bordes de oro.', price: 20000, unlockLevel: 22, swatch: 0xffc81a, luxury: 36 },

  { id: 'light_bare', group: 'light', name: 'Bombillas desnudas', desc: 'Luz pobre y amarilla.', price: 0, unlockLevel: 1, swatch: 0x8a7a4a, luxury: 0 },
  { id: 'light_spots', group: 'light', name: 'Focos de colores', desc: 'Dos focos que le dan color a la pista.', price: 2000, unlockLevel: 5, swatch: 0xff8a1e, luxury: 8 },
  { id: 'light_disco', group: 'light', name: 'Luces de discoteca', desc: 'Luces vivas que laten con la música.', price: 7000, unlockLevel: 11, swatch: 0xb04cff, luxury: 18 },
  { id: 'light_laser', group: 'light', name: 'Show de luces', desc: 'Luz intensa que cambia de color.', price: 22000, unlockLevel: 20, swatch: 0x35f08a, luxury: 34 },

  { id: 'art_none', group: 'art', name: 'Pared vacía', desc: 'Nada colgado.', price: 0, unlockLevel: 1, swatch: 0x44485a, luxury: 0 },
  { id: 'art_posters', group: 'art', name: 'Afiches', desc: 'Carteles de conciertos pegados con cinta.', price: 600, unlockLevel: 3, swatch: 0xff6a3a, luxury: 5 },
  { id: 'art_frames', group: 'art', name: 'Cuadros y vinilos', desc: 'Marcos de verdad y discos de colección.', price: 3500, unlockLevel: 9, swatch: 0x5a9aff, luxury: 14 },
  { id: 'art_gold', group: 'art', name: 'Discos de oro y pantallas', desc: 'Premios, pantallas y mucho brillo.', price: 15000, unlockLevel: 18, swatch: 0xffc81a, luxury: 30 },
];

/** Prices are scaled like everything else the player buys (see pricing.ts). */
export const DECOR: DecorOption[] = BASE.map((o) => ({ ...o, price: o.price * PRICE_SCALE }));
export const DECOR_BY_ID = new Map(DECOR.map((o) => [o.id, o]));
export const DEFAULTS: Record<DecorGroup, string> = { wall: 'wall_concrete', floor: 'floor_cement', trim: 'trim_none', light: 'light_bare', art: 'art_none' };

export interface Decor {
  owned: string[];
  /** what is in use in each group (one of the owned options) */
  sel: Record<DecorGroup, string>;
}

export function newDecor(): Decor {
  return { owned: Object.values(DEFAULTS), sel: { ...DEFAULTS } };
}

export function optionsOf(group: DecorGroup): DecorOption[] {
  return DECOR.filter((o) => o.group === group);
}

/** Luxury the finishes add (only the ones in use). */
export function decorLuxury(d: Decor): number {
  return Object.values(d.sel).reduce((a, id) => a + (DECOR_BY_ID.get(id)?.luxury ?? 0), 0);
}

export function buyDecor(state: ClubState, id: string): { state: ClubState; error?: string } {
  const o = DECOR_BY_ID.get(id);
  if (!o) return { state, error: 'Esa opción no existe.' };
  if (state.decor.owned.includes(id)) return { state, error: 'Ya la tienes.' };
  if (levelOf(state.xp).level < o.unlockLevel) return { state, error: `Se desbloquea en el nivel ${o.unlockLevel}.` };
  if (state.coins < o.price) return { state, error: 'No te alcanzan las monedas.' };
  // a new finish goes on right away
  return { state: { ...state, coins: state.coins - o.price, decor: { owned: [...state.decor.owned, id], sel: { ...state.decor.sel, [o.group]: id } } } };
}

/** Switch to a finish you already own. */
export function chooseDecor(state: ClubState, id: string): { state: ClubState; error?: string } {
  const o = DECOR_BY_ID.get(id);
  if (!o || !state.decor.owned.includes(id)) return { state, error: 'Todavía no la tienes.' };
  return { state: { ...state, decor: { ...state.decor, sel: { ...state.decor.sel, [o.group]: id } } } };
}

export function sanitizeDecor(raw: unknown): Decor {
  const r = (raw ?? {}) as Partial<Decor>;
  const owned = new Set<string>(Object.values(DEFAULTS));
  if (Array.isArray(r.owned)) for (const id of r.owned) if (typeof id === 'string' && DECOR_BY_ID.has(id)) owned.add(id);
  const sel = { ...DEFAULTS };
  for (const g of Object.keys(DEFAULTS) as DecorGroup[]) {
    const id = r.sel?.[g];
    if (typeof id === 'string' && owned.has(id) && DECOR_BY_ID.get(id)?.group === g) sel[g] = id;
  }
  return { owned: [...owned], sel };
}
