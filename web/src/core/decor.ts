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
  { id: 'wall_velvet', group: 'wall', name: 'Terciopelo burdeos', desc: 'Cortinas y paneles de terciopelo: un club de película.', price: 70000, unlockLevel: 28, swatch: 0x7a1030, luxury: 82 },
  { id: 'wall_deco', group: 'wall', name: 'Art déco negro y oro', desc: 'Líneas doradas sobre laca negra. Elegancia de los años veinte.', price: 110000, unlockLevel: 32, swatch: 0x1a1a24, luxury: 96 },
  { id: 'wall_jungle', group: 'wall', name: 'Jardín vertical', desc: 'Una pared viva llena de hojas y luces cálidas.', price: 150000, unlockLevel: 36, swatch: 0x2f8f4e, luxury: 108 },
  { id: 'wall_galaxy', group: 'wall', name: 'Galaxia', desc: 'Estrellas y nebulosas en las paredes. Se siente el universo.', price: 250000, unlockLevel: 42, swatch: 0x2a1a6a, luxury: 124 },
  { id: 'wall_gold', group: 'wall', name: 'Pared de oro', desc: 'Lingotes de oro de piso a techo. Más no se puede.', price: 400000, unlockLevel: 50, swatch: 0xe8b82a, luxury: 145 },

  { id: 'floor_cement', group: 'floor', name: 'Cemento', desc: 'El suelo con el que empiezas.', price: 0, unlockLevel: 1, swatch: 0x5a6180, luxury: 0 },
  { id: 'floor_tile', group: 'floor', name: 'Cerámica', desc: 'Limpia y fácil de cuidar.', price: 800, unlockLevel: 3, swatch: 0xc9c4b8, luxury: 6 },
  { id: 'floor_checker', group: 'floor', name: 'Damero blanco y negro', desc: 'El suelo de las discotecas de siempre.', price: 3000, unlockLevel: 6, swatch: 0xeeeeee, luxury: 14 },
  { id: 'floor_wood', group: 'floor', name: 'Parquet', desc: 'Madera brillante bajo los pies.', price: 9000, unlockLevel: 10, swatch: 0xb07a45, luxury: 26 },
  { id: 'floor_marble', group: 'floor', name: 'Mármol negro', desc: 'Pulido, oscuro, caro.', price: 25000, unlockLevel: 16, swatch: 0x2a2a35, luxury: 44 },
  { id: 'floor_carpet', group: 'floor', name: 'Alfombra roja', desc: 'Mullida, cálida y de gala.', price: 32000, unlockLevel: 18, swatch: 0x9c1d2e, luxury: 52 },
  { id: 'floor_terrazzo', group: 'floor', name: 'Terrazo', desc: 'Piedra de colores pulida a mano.', price: 45000, unlockLevel: 22, swatch: 0xd8cfc4, luxury: 60 },
  { id: 'floor_led', group: 'floor', name: 'Cristal con luz', desc: 'Todo el suelo late con la música.', price: 60000, unlockLevel: 26, swatch: 0x18e0ff, luxury: 70 },
  { id: 'floor_gold', group: 'floor', name: 'Oro y ébano', desc: 'Damero de ébano y oro pulido.', price: 140000, unlockLevel: 34, swatch: 0xd9a928, luxury: 96 },
  { id: 'floor_aqua', group: 'floor', name: 'Piscina de luz', desc: 'Un suelo de agua luminosa que se mueve con la música.', price: 220000, unlockLevel: 40, swatch: 0x2ee6c8, luxury: 118 },

  { id: 'trim_none', group: 'trim', name: 'Sin molduras', desc: 'Las paredes terminan a secas.', price: 0, unlockLevel: 1, swatch: 0x44485a, luxury: 0 },
  { id: 'trim_baseboard', group: 'trim', name: 'Zócalo y cornisa', desc: 'Un borde de madera que le da forma al salón.', price: 300, unlockLevel: 2, swatch: 0x8a5a32, luxury: 4 },
  { id: 'trim_neon', group: 'trim', name: 'Neón doble', desc: 'Una tira cian y una rosa en lo alto de las paredes.', price: 1500, unlockLevel: 5, swatch: 0x18e0ff, luxury: 10 },
  { id: 'trim_rgb', group: 'trim', name: 'Neón RGB', desc: 'Cambia de color solo, todo el tiempo.', price: 6000, unlockLevel: 12, swatch: 0xff3da6, luxury: 20 },
  { id: 'trim_gold', group: 'trim', name: 'Molduras doradas', desc: 'Columnas y bordes de oro.', price: 20000, unlockLevel: 22, swatch: 0xffc81a, luxury: 36 },
  { id: 'trim_chrome', group: 'trim', name: 'Cromo pulido', desc: 'Bordes de acero brillante, como una nave.', price: 40000, unlockLevel: 28, swatch: 0xd0d4e0, luxury: 48 },
  { id: 'trim_crystal', group: 'trim', name: 'Cristal de hielo', desc: 'Tiras de luz blanca y azul como cristales.', price: 70000, unlockLevel: 34, swatch: 0xa8f0ff, luxury: 62 },
  { id: 'trim_fire', group: 'trim', name: 'Fuego líquido', desc: 'Franjas naranjas que parecen brasas.', price: 120000, unlockLevel: 40, swatch: 0xff7a1e, luxury: 78 },
  { id: 'trim_royal', group: 'trim', name: 'Realeza', desc: 'Columnas de oro y luz morada.', price: 200000, unlockLevel: 48, swatch: 0xb04cff, luxury: 96 },

  { id: 'light_bare', group: 'light', name: 'Bombillas desnudas', desc: 'Luz pobre y amarilla.', price: 0, unlockLevel: 1, swatch: 0x8a7a4a, luxury: 0 },
  { id: 'light_spots', group: 'light', name: 'Focos de colores', desc: 'Dos focos que le dan color a la pista.', price: 2000, unlockLevel: 5, swatch: 0xff8a1e, luxury: 8 },
  { id: 'light_disco', group: 'light', name: 'Luces de discoteca', desc: 'Luces vivas que laten con la música.', price: 7000, unlockLevel: 11, swatch: 0xb04cff, luxury: 18 },
  { id: 'light_laser', group: 'light', name: 'Show de luces', desc: 'Luz intensa que cambia de color.', price: 22000, unlockLevel: 20, swatch: 0x35f08a, luxury: 34 },
  { id: 'light_sunset', group: 'light', name: 'Atardecer', desc: 'Luz naranja y rosa, ideal para empezar la noche.', price: 50000, unlockLevel: 30, swatch: 0xff7a3a, luxury: 44 },
  { id: 'light_aurora', group: 'light', name: 'Aurora', desc: 'Verdes y violetas que se mezclan lentamente.', price: 90000, unlockLevel: 38, swatch: 0x35f0c8, luxury: 56 },
  { id: 'light_royal', group: 'light', name: 'Luz real', desc: 'Dorado y rojo intenso, de gran estreno.', price: 160000, unlockLevel: 46, swatch: 0xffc81a, luxury: 70 },
  { id: 'light_ultra', group: 'light', name: 'Festival', desc: 'Toda la potencia de un festival, con colores que no paran.', price: 300000, unlockLevel: 55, swatch: 0x18d8ff, luxury: 90 },

  { id: 'art_none', group: 'art', name: 'Pared vacía', desc: 'Nada colgado.', price: 0, unlockLevel: 1, swatch: 0x44485a, luxury: 0 },
  { id: 'art_posters', group: 'art', name: 'Afiches', desc: 'Carteles de conciertos pegados con cinta.', price: 600, unlockLevel: 3, swatch: 0xff6a3a, luxury: 5 },
  { id: 'art_frames', group: 'art', name: 'Cuadros y vinilos', desc: 'Marcos de verdad y discos de colección.', price: 3500, unlockLevel: 9, swatch: 0x5a9aff, luxury: 14 },
  { id: 'art_gold', group: 'art', name: 'Discos de oro y pantallas', desc: 'Premios, pantallas y mucho brillo.', price: 15000, unlockLevel: 18, swatch: 0xffc81a, luxury: 30 },
  { id: 'art_neon', group: 'art', name: 'Letreros de neón', desc: 'Frases y dibujos de neón en la pared.', price: 60000, unlockLevel: 26, swatch: 0xff3da6, luxury: 40 },
  { id: 'art_gallery', group: 'art', name: 'Galería de arte', desc: 'Cuadros enormes con marcos dorados.', price: 110000, unlockLevel: 34, swatch: 0xc8a24a, luxury: 54 },
  { id: 'art_stars', group: 'art', name: 'Discos de platino', desc: 'Los premios de los DJ más grandes del mundo.', price: 220000, unlockLevel: 44, swatch: 0xd8dce8, luxury: 72 },
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
