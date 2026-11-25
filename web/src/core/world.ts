// The shape of the city: a regular grid of lots (parcelas) separated by streets. Pure logic, no rendering.
//
// Why a grid of fixed lots: every player owns ONE lot, sized for the biggest club (phase 7). The building grows INSIDE
// its lot, so it can never run into a neighbour, however many people join. In the early game the unused part of the lot
// is yard and parking. The server only has to hand out free lots; the client draws the city around the player's lot.

import { PARCEL, PHASES, YARD } from './club.ts';
import type { Genre } from './music.ts';

/** One lot, in world units. */
export const LOT = { w: PARCEL.w, h: PARCEL.h };
/** Street (road + sidewalks) between two lots. */
export const STREET = 10;
/** A lot plus the street that runs along its south and east sides. */
export const CELL = { w: LOT.w + STREET, h: LOT.h + STREET };
/** Where the building sits inside its lot: leaves a yard on every side. */
/** How many cells around the player's lot the city is drawn (and the server reports). */
export const RADIUS_CELLS = 3;
export const BUILDING_OFFSET = { x: YARD, z: YARD };
/** World position of the player's own lot corner. */
export const HOME = { x: -YARD, z: -YARD };

export interface Cell {
  /** columns / rows relative to the player's own lot (0, 0) */
  i: number;
  j: number;
}

export function lotOrigin(c: Cell): { x: number; z: number } {
  return { x: HOME.x + c.i * CELL.w, z: HOME.z + c.j * CELL.h };
}

export function buildingOrigin(c: Cell): { x: number; z: number } {
  const o = lotOrigin(c);
  return { x: o.x + BUILDING_OFFSET.x, z: o.z + BUILDING_OFFSET.z };
}

/** The n-th cell of a square spiral around (0, 0): (0,0), (1,0), (1,1), (0,1), (-1,1), (-1,0), ... Used to hand out lots. */
export function spiralCell(n: number): Cell {
  if (n <= 0) return { i: 0, j: 0 };
  let ring = 1;
  while ((2 * ring + 1) ** 2 <= n) ring++;
  const start = (2 * ring - 1) ** 2; // first index of this ring
  const side = 2 * ring;
  const k = n - start;
  const edge = Math.floor(k / side);
  const off = k % side;
  const r = ring;
  switch (edge) {
    case 0: return { i: r, j: -r + 1 + off };
    case 1: return { i: r - 1 - off, j: r };
    case 2: return { i: -r, j: r - 1 - off };
    default: return { i: -r + 1 + off, j: -r };
  }
}

/** How a real player's facade looks, as the server reports it. */
export interface FacadeFace {
  paint: string;
  awning: boolean;
  rope: boolean;
  lights: boolean;
  sign: number;
}

export type Neighbor =
  | { kind: 'club'; cell: Cell; name: string; phase: number; color: string; open?: boolean; online?: boolean; level?: number; rating?: number; n?: number; ext?: FacadeFace; guests?: number; music?: { playing: boolean; title: string; genre: Genre; bpm: number; builtin: boolean; source: string; ref: string; startedAt: number } }
  | { kind: 'vacant'; cell: Cell };

const NAMES: Array<[string, string]> = [
  ['ECLIPSE', '#ff2255'], ['VOLTAJE', '#18d8ff'], ['MAGENTA', '#ff2d9a'], ['NEBULA', '#a13cff'],
  ['PULSO', '#35f08a'], ['LUNA', '#ffd24a'], ['TURBO', '#ff8a1e'], ['AZUL', '#3a7bff'],
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Neighbours around the player's lot. For now they are simulated (deterministic for a seed); with real players the server
 * returns the same shape: who lives in each nearby cell, how big their club is, and which lots are free.
 */
export function simulatedNeighbors(seed: number, radius = 3): Neighbor[] {
  const r = rng(seed);
  const out: Neighbor[] = [];
  let n = 0;
  for (let i = -radius; i <= radius; i++) {
    for (let j = -radius; j <= radius; j++) {
      if (i === 0 && j === 0) continue;
      const dist = Math.max(Math.abs(i), Math.abs(j));
      if (dist > 1) {
        out.push({ kind: 'vacant', cell: { i, j } }); // far cells are drawn as downtown by the renderer
        continue;
      }
      if (r() < 0.22) {
        out.push({ kind: 'vacant', cell: { i, j } });
      } else {
        const [name, color] = NAMES[n++ % NAMES.length];
        out.push({ kind: 'club', cell: { i, j }, name, color, phase: 1 + Math.floor(r() * 4) });
      }
    }
  }
  return out;
}

/** Does a building of this phase fit inside its lot, with room for a yard on every side? */
export function fitsInLot(phaseId: number, margin = 2): boolean {
  const p = PHASES[phaseId - 1];
  return BUILDING_OFFSET.x + p.w + margin <= LOT.w && BUILDING_OFFSET.z + p.h + margin <= LOT.h;
}

/** Cells that touch a lot (the 8 around it). Two lots are never closer than a street apart. */
export function neighboursOf(c: Cell): Cell[] {
  const out: Cell[] = [];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (di || dj) out.push({ i: c.i + di, j: c.j + dj });
  return out;
}
