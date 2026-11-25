// People who work for the club: guards at the door, a DJ in the booth, bartenders behind the bar. Pure logic.
// Each one is hired once (hiring fee) and then paid wages for every minute the club is open, so staff is also the
// money sink the late game needs. A DJ without a booth, or a bartender without a bar, has nothing to do and costs nothing.

import { BOOTH_IDS, BY_ID } from './catalog.ts';
import { blockedSet, cellsOf, phaseOf, type ClubState } from './club.ts';
import { PRICE_SCALE } from './pricing.ts';
import { levelOf } from './progression.ts';

export type Role = 'guard' | 'dj' | 'bartender';

export interface StaffDef {
  role: Role;
  name: string;
  plural: string;
  desc: string;
  /** one-time hiring fee */
  hire: number;
  /** wage per minute the club is open */
  wage: number;
  unlockLevel: number;
  max: number;
  /** what they need in the club to be useful */
  needs?: 'dj_booth' | 'bar';
}

const BASE_STAFF: StaffDef[] = [
  { role: 'bartender', name: 'Bartender', plural: 'Bartenders', desc: 'Sirve mejor y cobra más caro: cada uno sube el precio de los tragos un 25%. Necesita una barra.', hire: 600, wage: 2, unlockLevel: 3, max: 2, needs: 'bar' },
  { role: 'dj', name: 'DJ', plural: 'DJs', desc: 'Mantiene la pista viva: cada baile termina con propina. Necesita la cabina.', hire: 1200, wage: 3, unlockLevel: 4, max: 1, needs: 'dj_booth' },
  { role: 'guard', name: 'Guardia', plural: 'Guardias', desc: 'El primero reconoce a los famosos de verdad y hace que la fila aguante más. Con dos, la puerta deja pasar más rápido.', hire: 800, wage: 2, unlockLevel: 5, max: 2 },
];

/** hiring fees are scaled (see pricing.ts); wages are not */
export const STAFF: StaffDef[] = BASE_STAFF.map((d) => ({ ...d, hire: d.hire * PRICE_SCALE }));

export const STAFF_BY_ROLE = new Map(STAFF.map((s) => [s.role, s]));
export const DANCE_TIP = 1;
export const WAGE_EVERY = 30;

export type StaffCount = Record<Role, number>;

export function newStaff(): StaffCount {
  return { guard: 0, dj: 0, bartender: 0 };
}

export function sanitizeStaff(raw: unknown): StaffCount {
  const r = (raw ?? {}) as Partial<StaffCount>;
  const out = newStaff();
  for (const d of STAFF) out[d.role] = Number.isFinite(r[d.role]) ? Math.min(Math.max(Math.floor(r[d.role] as number), 0), d.max) : 0;
  return out;
}

/** A place where a worker stands: the centre of a free cell, and the direction they face (towards the guests). */
export interface Spot {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

const FRONT: Array<[number, number]> = [[0, 1], [-1, 0], [0, -1], [1, 0]];

/**
 * Where the DJ and the bartenders can stand: on a FREE cell behind the booth or the bar and, when that is the wall or
 * another piece of furniture, on a free cell at one end of it. Never inside the furniture. No free cell, no spot, and
 * the worker has nowhere to work.
 */
export function staffSpots(state: ClubState): { dj: Spot[]; bartender: Spot[] } {
  const p = phaseOf(state);
  const blocked = blockedSet(state.items);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && !blocked.has(`${x},${y}`);
  const out: { dj: Spot[]; bartender: Spot[] } = { dj: [], bartender: [] };
  const taken = new Set<string>();
  for (const it of state.items) {
    const def = BY_ID.get(it.id);
    const role = BOOTH_IDS.includes(it.id) ? 'dj' : def?.category === 'bars' && def.needsAccess ? 'bartender' : null;
    if (!role || !def) continue;
    const [fx, fz] = FRONT[it.rot];
    const cells = cellsOf(def, it.x, it.y, it.rot);
    const own = new Set(cells.map(([x, y]) => `${x},${y}`));
    const mx = cells.reduce((a, [x]) => a + x, 0) / cells.length;
    const my = cells.reduce((a, [, y]) => a + y, 0) / cells.length;
    const cand: Array<[number, number]> = [];
    // behind the piece, starting from the middle
    const behind = cells.map(([x, y]) => [x - fx, y - fz] as [number, number]).filter(([x, y]) => !own.has(`${x},${y}`));
    behind.sort((a, b) => Math.hypot(a[0] + 0.5 - mx, a[1] + 0.5 - my) - Math.hypot(b[0] + 0.5 - mx, b[1] + 0.5 - my));
    cand.push(...behind);
    // at the ends of the piece, on its back row
    const ax = Math.abs(fz);
    const az = Math.abs(fx);
    const key = (c: [number, number]) => c[0] * ax + c[1] * az; // position along the piece
    const back = [...cells].sort((a, b) => key(a) - key(b));
    if (back.length) {
      const lo = back[0];
      const hi = back[back.length - 1];
      cand.push([lo[0] - ax, lo[1] - az], [hi[0] + ax, hi[1] + az]);
    }
    for (const [x, y] of cand) {
      const k = `${x},${y}`;
      if (!free(x, y) || taken.has(k)) continue;
      taken.add(k);
      out[role].push({ x: x + 0.5, z: y + 0.5, fx, fz });
    }
  }
  return out;
}

/** How many of each role actually work: hired, and with a place to stand at their booth or bar. */
export function working(state: ClubState): StaffCount {
  const spots = staffSpots(state);
  const out = newStaff();
  out.guard = state.staff.guard;
  out.dj = Math.min(state.staff.dj, Math.min(spots.dj.length, 1));
  out.bartender = Math.min(state.staff.bartender, spots.bartender.length);
  return out;
}

/** Wages per minute of an open club. */
export function wagePerMinute(state: ClubState): number {
  const w = working(state);
  return STAFF.reduce((a, d) => a + w[d.role] * d.wage, 0);
}

export interface StaffPerks {
  drinkPrice: number;
  danceTip: number;
  patience: number;
  /** door speed: multiplier on how fast the line moves */
  door: number;
  checksVips: boolean;
}

export function perksOfStaff(state: ClubState): StaffPerks {
  const w = working(state);
  return {
    drinkPrice: 1 + 0.25 * w.bartender,
    danceTip: w.dj ? DANCE_TIP : 0,
    patience: w.guard ? 1.2 : 1,
    door: w.guard >= 2 ? 1.5 : 1,
    checksVips: w.guard >= 1,
  };
}

export function hireStaff(state: ClubState, role: Role): { state: ClubState; error?: string } {
  const d = STAFF_BY_ROLE.get(role);
  if (!d) return { state, error: 'Ese puesto no existe.' };
  if (levelOf(state.xp).level < d.unlockLevel) return { state, error: `Se desbloquea en el nivel ${d.unlockLevel}.` };
  if (state.staff[role] >= d.max) return { state, error: `Ya tienes el máximo de ${d.plural.toLowerCase()}.` };
  if (state.coins < d.hire) return { state, error: 'No te alcanzan las monedas.' };
  return { state: { ...state, coins: state.coins - d.hire, staff: { ...state.staff, [role]: state.staff[role] + 1 } } };
}

export function fireStaff(state: ClubState, role: Role): { state: ClubState; error?: string } {
  if (state.staff[role] <= 0) return { state, error: 'No tienes a nadie en ese puesto.' };
  return { state: { ...state, staff: { ...state.staff, [role]: state.staff[role] - 1 } } };
}
