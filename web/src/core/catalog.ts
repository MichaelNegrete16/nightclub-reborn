// Decoration catalog (design numbers are proposals to balance later; see docs/WORLD_AND_DECOR.md).
// Platform-agnostic: no rendering imports.

import { PRICE_SCALE } from './pricing.ts';

export type Layer = 'floor' | 'object';
export type CategoryId = 'floors' | 'bars' | 'seats' | 'tables' | 'dj' | 'lights' | 'screens' | 'trophies' | 'decor' | 'security' | 'shows' | 'outdoor';

export interface ItemDef {
  id: string;
  name: string;
  category: CategoryId;
  layer: Layer;
  /** footprint in tiles at rotation 0 */
  w: number;
  d: number;
  price: number;
  luxury: number;
  seats?: number;
  /** guests/staff must be able to walk up to it */
  needsAccess?: boolean;
  /** player level that unlocks it in the shop */
  unlockLevel: number;
  /** max copies per club */
  max?: number;
  /** accent color for the catalog card */
  color: string;
  /** only goes on the terrace (outside the building) */
  outdoor?: boolean;
}

/** every kind of DJ booth: one of them lets the club open, and they all make the sound system */
export const BOOTH_IDS = ['dj_booth', 'dj_booth_pro', 'out_stage'];

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'floors', label: 'Pistas' },
  { id: 'bars', label: 'Barras' },
  { id: 'seats', label: 'Asientos' },
  { id: 'tables', label: 'Mesas' },
  { id: 'dj', label: 'DJ y sonido' },
  { id: 'lights', label: 'Luces' },
  { id: 'screens', label: 'Pantallas' },
  { id: 'trophies', label: 'Trofeos' },
  { id: 'shows', label: 'Shows' },
  { id: 'decor', label: 'Decoración' },
  { id: 'security', label: 'Seguridad' },
  { id: 'outdoor', label: 'Terraza' },
];

const BASE_CATALOG: ItemDef[] = [
  { id: 'floor_cyan', name: 'Baldosa cian', category: 'floors', layer: 'floor', w: 1, d: 1, price: 50, luxury: 1, unlockLevel: 1, color: '#14d6f2' },
  { id: 'floor_pink', name: 'Baldosa rosa', category: 'floors', layer: 'floor', w: 1, d: 1, price: 50, luxury: 1, unlockLevel: 2, color: '#ff3da6' },
  { id: 'floor_violet', name: 'Baldosa violeta', category: 'floors', layer: 'floor', w: 1, d: 1, price: 60, luxury: 1, unlockLevel: 5, color: '#a13cff' },

  { id: 'bar_straight', name: 'Barra recta', category: 'bars', layer: 'object', w: 3, d: 1, price: 3000, luxury: 20, needsAccess: true, unlockLevel: 1, color: '#e8791e' },
  { id: 'stool', name: 'Taburete', category: 'bars', layer: 'object', w: 1, d: 1, price: 150, luxury: 2, seats: 1, unlockLevel: 1, color: '#d8262f' },

  { id: 'chair_red', name: 'Silla roja', category: 'seats', layer: 'object', w: 1, d: 1, price: 400, luxury: 6, seats: 1, unlockLevel: 1, color: '#d8262f' },
  { id: 'puff', name: 'Puff', category: 'seats', layer: 'object', w: 1, d: 1, price: 250, luxury: 4, seats: 1, unlockLevel: 1, color: '#e6199c' },
  { id: 'sofa_red_2', name: 'Sofá rojo (2 plazas)', category: 'seats', layer: 'object', w: 2, d: 1, price: 1200, luxury: 14, seats: 2, unlockLevel: 6, color: '#d8262f' },
  { id: 'booth', name: 'Reservado', category: 'seats', layer: 'object', w: 2, d: 2, price: 3500, luxury: 30, seats: 4, unlockLevel: 13, color: '#b01c4a' },

  { id: 'table_low', name: 'Mesa baja', category: 'tables', layer: 'object', w: 1, d: 1, price: 300, luxury: 3, unlockLevel: 1, color: '#7a4a2a' },
  { id: 'table_high', name: 'Mesa alta', category: 'tables', layer: 'object', w: 1, d: 1, price: 350, luxury: 4, unlockLevel: 7, color: '#2a3a6a' },

  { id: 'dj_booth', name: 'Cabina DJ', category: 'dj', layer: 'object', w: 2, d: 1, price: 4000, luxury: 25, needsAccess: true, unlockLevel: 1, max: 1, color: '#18d8ff' },
  { id: 'speaker', name: 'Altavoz', category: 'dj', layer: 'object', w: 1, d: 1, price: 900, luxury: 8, unlockLevel: 2, color: '#2a2a35' },

  { id: 'disco_ball', name: 'Bola disco', category: 'lights', layer: 'object', w: 1, d: 1, price: 2200, luxury: 14, unlockLevel: 8, color: '#c8d4ff' },
  { id: 'laser_tower', name: 'Torre láser', category: 'lights', layer: 'object', w: 1, d: 1, price: 1500, luxury: 12, unlockLevel: 15, color: '#2dff7a' },

  { id: 'tv_stand', name: 'TV con mueble', category: 'screens', layer: 'object', w: 1, d: 1, price: 1800, luxury: 12, unlockLevel: 16, color: '#3a7bff' },
  { id: 'big_screen', name: 'Pantalla gigante', category: 'screens', layer: 'object', w: 3, d: 1, price: 6000, luxury: 35, unlockLevel: 26, color: '#3a7bff' },

  { id: 'trophy_cup', name: 'Copa en pedestal', category: 'trophies', layer: 'object', w: 1, d: 1, price: 600, luxury: 6, unlockLevel: 3, color: '#f2c40d' },
  { id: 'trophy_case', name: 'Vitrina de trofeos', category: 'trophies', layer: 'object', w: 1, d: 1, price: 2500, luxury: 18, unlockLevel: 10, color: '#f2c40d' },
  { id: 'floor_gold', name: 'Baldosa dorada', category: 'floors', layer: 'floor', w: 1, d: 1, price: 120, luxury: 3, unlockLevel: 20, color: '#ffc81a' },
  { id: 'floor_led', name: 'Pista LED', category: 'floors', layer: 'floor', w: 1, d: 1, price: 220, luxury: 5, unlockLevel: 28, color: '#5ec8ff' },
  { id: 'sofa_vip', name: 'Sofá VIP (3 plazas)', category: 'seats', layer: 'object', w: 3, d: 1, price: 3800, luxury: 34, seats: 3, needsAccess: true, unlockLevel: 21, color: '#b04cff' },
  { id: 'lounge_bed', name: 'Cama lounge', category: 'seats', layer: 'object', w: 2, d: 2, price: 7500, luxury: 52, seats: 4, needsAccess: true, unlockLevel: 28, color: '#ff4fa3' },
  { id: 'table_vip', name: 'Mesa de botellas', category: 'tables', layer: 'object', w: 2, d: 1, price: 1400, luxury: 18, unlockLevel: 17, color: '#f5b91d' },
  { id: 'speaker_tower', name: 'Torre de sonido', category: 'dj', layer: 'object', w: 1, d: 1, price: 2200, luxury: 14, unlockLevel: 12, color: '#5ec8ff' },
  { id: 'sub_bass', name: 'Subwoofer doble', category: 'dj', layer: 'object', w: 2, d: 1, price: 3200, luxury: 18, unlockLevel: 20, color: '#d6314a' },
  { id: 'strobe', name: 'Luz estroboscópica', category: 'lights', layer: 'object', w: 1, d: 1, price: 1100, luxury: 10, unlockLevel: 11, color: '#f4f1ff' },
  { id: 'fog_machine', name: 'Máquina de humo', category: 'lights', layer: 'object', w: 1, d: 1, price: 1700, luxury: 16, unlockLevel: 15, color: '#8f96b4' },
  { id: 'led_wall', name: 'Pared LED', category: 'lights', layer: 'object', w: 3, d: 1, price: 5200, luxury: 30, unlockLevel: 22, color: '#3ddc97' },
  { id: 'gold_record', name: 'Disco de oro', category: 'trophies', layer: 'object', w: 1, d: 1, price: 1800, luxury: 20, unlockLevel: 14, color: '#f5b91d' },
  { id: 'award_wall', name: 'Muro de premios', category: 'trophies', layer: 'object', w: 2, d: 1, price: 7800, luxury: 38, unlockLevel: 31, color: '#f5b91d' },
  { id: 'palm', name: 'Palmera', category: 'decor', layer: 'object', w: 1, d: 1, price: 300, luxury: 6, unlockLevel: 11, color: '#3ddc97' },
  { id: 'neon_wall', name: 'Letrero de neón', category: 'decor', layer: 'object', w: 2, d: 1, price: 2600, luxury: 20, unlockLevel: 12, color: '#ff4fa3' },
  { id: 'sculpture', name: 'Escultura de neón', category: 'decor', layer: 'object', w: 1, d: 1, price: 6200, luxury: 40, unlockLevel: 26, color: '#5ec8ff' },
  { id: 'cocktail_bar', name: 'Barra de cócteles', category: 'bars', layer: 'object', w: 2, d: 1, price: 1600, luxury: 12, needsAccess: true, unlockLevel: 9, color: '#ff4fa3' },
  { id: 'bar_corner', name: 'Barra de esquina', category: 'bars', layer: 'object', w: 2, d: 2, price: 4200, luxury: 26, needsAccess: true, unlockLevel: 16, color: '#f5b91d' },
  { id: 'bar_long', name: 'Barra larga de lujo', category: 'bars', layer: 'object', w: 5, d: 1, price: 9500, luxury: 44, needsAccess: true, unlockLevel: 25, color: '#d6314a' },
  { id: 'sofa_corner', name: 'Sofá de esquina', category: 'seats', layer: 'object', w: 2, d: 2, price: 2600, luxury: 24, seats: 3, needsAccess: true, unlockLevel: 15, color: '#5ec8ff' },
  { id: 'dj_booth_pro', name: 'Cabina DJ profesional', category: 'dj', layer: 'object', w: 3, d: 1, price: 12000, luxury: 55, unlockLevel: 24, color: '#b04cff' },
  { id: 'moving_heads', name: 'Luces móviles', category: 'lights', layer: 'object', w: 1, d: 1, price: 4800, luxury: 28, unlockLevel: 19, color: '#5ec8ff' },
  { id: 'totem_led', name: 'Tótem LED', category: 'screens', layer: 'object', w: 1, d: 1, price: 2400, luxury: 18, unlockLevel: 19, color: '#3ddc97' },
  { id: 'tv_wall', name: 'Dos pantallas', category: 'screens', layer: 'object', w: 2, d: 1, price: 4200, luxury: 24, unlockLevel: 23, color: '#8f96b4' },
  { id: 'video_wall', name: 'Muro de video', category: 'screens', layer: 'object', w: 4, d: 1, price: 14000, luxury: 60, unlockLevel: 33, color: '#ff4fa3' },
  { id: 'pole_podium', name: 'Podio de baile', category: 'shows', layer: 'object', w: 1, d: 1, price: 5500, luxury: 30, unlockLevel: 18, max: 4, color: '#ff4fa3' },
  { id: 'photo_booth', name: 'Cabina de fotos', category: 'decor', layer: 'object', w: 1, d: 1, price: 2200, luxury: 16, unlockLevel: 13, color: '#f5b91d' },
  { id: 'arcade', name: 'Máquina arcade', category: 'decor', layer: 'object', w: 1, d: 1, price: 3000, luxury: 20, unlockLevel: 17, color: '#b04cff' },
  { id: 'camera', name: 'Cámara de seguridad', category: 'security', layer: 'object', w: 1, d: 1, price: 900, luxury: 1, unlockLevel: 12, max: 3, color: '#8f96b4' },
  { id: 'dance_cage', name: 'Jaula de baile', category: 'shows', layer: 'object', w: 2, d: 2, price: 12000, luxury: 70, unlockLevel: 14, max: 2, color: '#ff4fa3' },
  { id: 'alarm', name: 'Alarma', category: 'security', layer: 'object', w: 1, d: 1, price: 1500, luxury: 1, unlockLevel: 10, max: 1, color: '#ff3d55' },
  { id: 'safe', name: 'Caja fuerte', category: 'security', layer: 'object', w: 1, d: 1, price: 4000, luxury: 2, unlockLevel: 12, max: 2, color: '#8d96a8' },
  { id: 'vault_case', name: 'Vitrina blindada', category: 'security', layer: 'object', w: 1, d: 1, price: 6000, luxury: 14, unlockLevel: 15, max: 2, color: '#18d8ff' },
  { id: 'gold_statue', name: 'Estatua dorada', category: 'trophies', layer: 'object', w: 1, d: 1, price: 5000, luxury: 40, unlockLevel: 23, color: '#f2c40d' },

  { id: 'plant', name: 'Planta', category: 'decor', layer: 'object', w: 1, d: 1, price: 200, luxury: 3, unlockLevel: 1, color: '#18b862' },
  { id: 'velvet_rope', name: 'Cuerda de terciopelo', category: 'decor', layer: 'object', w: 2, d: 1, price: 500, luxury: 5, unlockLevel: 9, color: '#d8262f' },
  { id: 'aquarium', name: 'Acuario', category: 'decor', layer: 'object', w: 2, d: 1, price: 4500, luxury: 30, unlockLevel: 18, color: '#18d8ff' },
  { id: 'fountain', name: 'Fuente', category: 'decor', layer: 'object', w: 2, d: 2, price: 6500, luxury: 45, unlockLevel: 30, color: '#18d8ff' },

  // the terrace (open-air disco): only outside, on the ground the terrace upgrade opens
  { id: 'out_palm', name: 'Palmera', category: 'outdoor', layer: 'object', w: 1, d: 1, price: 800, luxury: 6, unlockLevel: 25, color: '#2f8f4e', outdoor: true },
  { id: 'out_fence', name: 'Cordón dorado', category: 'outdoor', layer: 'object', w: 2, d: 1, price: 600, luxury: 4, unlockLevel: 25, color: '#f2c40d', outdoor: true },
  { id: 'out_stage', name: 'Escenario con cabina de DJ', category: 'outdoor', layer: 'object', w: 3, d: 2, price: 9000, luxury: 30, max: 1, unlockLevel: 25, color: '#ff3da6', outdoor: true },
  { id: 'out_tower', name: 'Torre de parlantes', category: 'outdoor', layer: 'object', w: 1, d: 1, price: 3500, luxury: 12, unlockLevel: 26, color: '#18d8ff', outdoor: true },
  { id: 'out_tiki', name: 'Barra tropical', category: 'bars', layer: 'object', w: 3, d: 1, price: 5000, luxury: 22, needsAccess: true, unlockLevel: 27, color: '#c8a060', outdoor: true },
  { id: 'out_truss', name: 'Arco de luces', category: 'outdoor', layer: 'object', w: 3, d: 1, price: 7000, luxury: 25, unlockLevel: 28, color: '#b04cff', outdoor: true },
  { id: 'out_brazier', name: 'Brasero', category: 'outdoor', layer: 'object', w: 1, d: 1, price: 1200, luxury: 8, unlockLevel: 29, color: '#ff7a1e', outdoor: true },
  { id: 'out_sofa', name: 'Sofá VIP exterior', category: 'outdoor', layer: 'object', w: 2, d: 1, price: 2500, luxury: 14, seats: 2, unlockLevel: 30, color: '#7a1030', outdoor: true },
  { id: 'out_screen', name: 'Pantalla de escenario', category: 'outdoor', layer: 'object', w: 2, d: 1, price: 9000, luxury: 30, unlockLevel: 32, color: '#7a3ad6', outdoor: true },
];

/** The shop's prices, scaled (see pricing.ts). */
export const CATALOG: ItemDef[] = BASE_CATALOG.map((d) => ({ ...d, price: d.price * PRICE_SCALE }));

export const BY_ID: Map<string, ItemDef> = new Map(CATALOG.map((d) => [d.id, d]));
