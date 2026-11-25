// Levels, XP and which phase of the building a level unlocks. Pure logic.
// The curve numbers are tuned with scripts/economy-sim.mjs, which plays the game with a bot and reports how long each level takes.

export const MAX_LEVEL = 100;

/** First level of each building phase (index = phase - 1). Matches docs/WORLD_AND_DECOR.md. */
export const PHASE_LEVELS = [1, 6, 13, 23, 36, 51, 71];

export const TITLES = [
  'Aprendiz del Sótano',
  'Anfitrión de Barrio',
  'Dueño de Club',
  'Promotor',
  'Magnate Nocturno',
  'Estrella del Rooftop',
  'Leyenda del Festival',
];

let XP_A = 285;
let XP_B = 1.5;

/** Replace the curve (only used by the economy simulator to try values; the game uses the defaults above). */
export function setCurve(a: number, b: number): void {
  XP_A = a;
  XP_B = b;
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(XP_A * Math.pow(Math.max(1, level), XP_B));
}

/** XP gained by the things that happen in the club. */
export const XP = {
  cover: 1,
  drink: 2,
  dance: 1,
  /** a real star walks in */
  vip: 25,
  /** first purchase of each kind of object gives price / this many XP (once, so buy/sell can't be farmed) */
  discoveryPer: 100,
};

export interface LevelInfo {
  level: number;
  /** XP inside the current level */
  into: number;
  /** XP the current level needs */
  need: number;
  progress: number;
}

export function levelOf(xp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  const need = level >= MAX_LEVEL ? 1 : xpToNext(level);
  return { level, into: level >= MAX_LEVEL ? need : left, need, progress: level >= MAX_LEVEL ? 1 : left / need };
}

export function phaseForLevel(level: number): number {
  let phase = 1;
  PHASE_LEVELS.forEach((lv, i) => {
    if (level >= lv) phase = i + 1;
  });
  return phase;
}

export function titleFor(level: number): string {
  return TITLES[phaseForLevel(level) - 1];
}
