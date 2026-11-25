// What each level opens: furniture, staff, facade upgrades, renovations and new buildings. Pure logic, built from the same
// tables the game itself uses, so the "you unlocked..." pop-up can never disagree with what is really available.

import { CATALOG, CATEGORIES } from './catalog.ts';
import { DECOR } from './decor.ts';
import { EMOTES } from './emotes.ts';
import { EXPANSION_PRICE } from './expansion.ts';
import { PHASES } from './club.ts';
import { UPGRADES } from './exterior.ts';
import { PHASE_LEVELS } from './progression.ts';
import { RENOVATIONS } from './renovation.ts';
import { STAFF } from './staff.ts';

/** Where the player finds it. */
export type Where = 'shop' | 'team' | 'facade' | 'renovation' | 'building' | 'dance';

export interface Unlock {
  kind: 'item' | 'staff' | 'facade' | 'renovation' | 'phase' | 'emote';
  id: string;
  name: string;
  desc: string;
  where: Where;
  /** text for "Dónde lo encuentras" */
  place: string;
}

const CATEGORY_LABEL = new Map(CATEGORIES.map((c) => [c.id, c.label]));

/** Everything that opens exactly at this level. */
export function unlocksAt(level: number): Unlock[] {
  const out: Unlock[] = [];
  PHASE_LEVELS.forEach((lv, i) => {
    if (lv === level && i > 0) {
      const p = PHASES[i];
      out.push({ kind: 'phase', id: `phase${p.id}`, name: `Ampliación: ${p.name}`, desc: `Se abre la obra: el edificio pasa a ${p.w}×${p.h} casillas y caben hasta ${p.maxObjects} objetos. Cuesta ${EXPANSION_PRICE[p.id].toLocaleString('es-CO')} monedas.`, where: 'renovation', place: 'Oficina › Ampliación del local' });
    }
  });
  for (const d of CATALOG) {
    if (d.unlockLevel === level && level > 1) {
      out.push({ kind: 'item', id: d.id, name: d.name, desc: `${CATEGORY_LABEL.get(d.category) ?? 'Decoración'} · lujo +${d.luxury}`, where: 'shop', place: `Tienda › ${CATEGORY_LABEL.get(d.category) ?? 'Todo'}` });
    }
  }
  for (const s of STAFF) {
    if (s.unlockLevel === level) out.push({ kind: 'staff', id: s.role, name: `${s.name} para contratar`, desc: s.desc, where: 'team', place: 'Oficina › Tu equipo' });
  }
  for (const u of UPGRADES) {
    if (u.unlockLevel === level && u.price > 0) out.push({ kind: 'facade', id: u.id, name: u.name, desc: u.desc, where: 'facade', place: 'Oficina › Ver la fachada' });
  }
  for (const o of DECOR) {
    if (o.unlockLevel === level && o.price > 0) out.push({ kind: 'facade', id: o.id, name: o.name, desc: o.desc, where: 'renovation', place: 'Oficina › Decorar el interior' });
  }
  for (const r of RENOVATIONS) {
    if (r.unlockLevel === level) out.push({ kind: 'renovation', id: `reno${r.tier}`, name: `Reforma ${r.tier}: ${r.name}`, desc: `${r.desc} +12% de lujo, +10% de cover.`, where: 'renovation', place: 'Oficina › Reformas del local' });
  }
  for (const e of EMOTES) {
    if (e.unlockLevel === level && level > 1) out.push({ kind: 'emote', id: e.id, name: `Baile: ${e.label}`, desc: e.desc, where: 'dance', place: 'Botón Bailar, a la derecha de la pantalla' });
  }
  return out;
}

/** Everything that opened going from `from` (already seen) up to `to`, level by level. */
export function unlocksBetween(from: number, to: number): Array<{ level: number; unlocks: Unlock[] }> {
  const out: Array<{ level: number; unlocks: Unlock[] }> = [];
  for (let l = from + 1; l <= to; l++) {
    const unlocks = unlocksAt(l);
    if (unlocks.length) out.push({ level: l, unlocks });
  }
  return out;
}

/** The next level that opens something, for a hint in the UI. */
export function nextUnlockLevel(level: number): number | null {
  for (let l = level + 1; l <= level + 60; l++) if (unlocksAt(l).length) return l;
  return null;
}
