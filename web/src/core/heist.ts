// Robberies and the police: the rules, as pure functions of the data and the clock. The server runs these (never the client)
// when it settles a robbery; the client uses the same functions only to SHOW things (odds, cooldowns, heat).
// Time is milliseconds since 1970. Design: docs/ROBOS_Y_POLICIA.md

import { BY_ID } from './catalog.ts';
import { PRICE_SCALE } from './pricing.ts';
import { invested, type Tier } from './tiers.ts';

const H = 3_600_000;

export const RULES = {
  /** nobody below this level can rob or be robbed */
  noviceLevel: 10,
  /** how far apart in level two players can be */
  levelBand: 5,
  /** between two robberies by the same player */
  ownCooldown: 3 * H,
  /** the same target again */
  sameTargetCooldown: 12 * H,
  /** a robbed club cannot be robbed again for this long */
  shield: 8 * H,
  /** after the thieves were caught */
  detention: 6 * H,
  /** the victim can take revenge for this long, with a short wait */
  revengeWindow: 24 * H,
  revengeCooldown: 1 * H,
  /** what one victim can lose in a day: a share of the cash box and a number of pieces */
  dailyCashShare: 0.1,
  dailyPieces: 1,
  /** heat (0-100) */
  heatPerHeist: 15,
  heatPerFail: 25,
  heatPerHotPieceHour: 2,
  heatDecayPerHour: 4,
  /** a stolen piece cools down by itself after this long */
  coolOff: 72 * H,
  /** the receiver cleans a piece for this share of its value */
  launderShare: 0.3,
  /** a thief caught in the act goes to prison, and their own club is shut for this many minutes (more for a hard target) */
  jailMinutes: 10,
  jailMinutesHard: 15,
  /** ...and pays a fine of this share of their cash */
  fineShare: 0.05,
  /** prison: the thief leaves by doing chores (cleaning the toilets, mopping...); this many for a soft target, more for a hard one */
  choreGoalSoft: 20,
  choreGoalHard: 30,
  /** the server counts at most one chore per this many milliseconds (so the chores cannot be skipped by a modified game) */
  choreGapMs: 5000,
  /** the anti-theft protector can be bought for these hours, and never more than a day ahead */
  guardHours: [2, 6, 12, 24] as readonly number[],
  guardMaxHours: 24,
} as const;

// ---- the weekly Blackout Night: heat falls twice as fast and the shields are shorter, so there is more to do ----------------
/** Saturday from 02:00 to 05:00 city time (UTC-5), the anniversary of the Blackout. */
export function isBlackoutNight(now: number): boolean {
  const d = new Date(now - 5 * H);
  return d.getUTCDay() === 6 && d.getUTCHours() >= 2 && d.getUTCHours() < 5;
}

/** The next Blackout Night start, for the countdown. */
export function nextBlackoutNight(now: number): number {
  const t = new Date(now - 5 * H);
  const dayStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  for (let i = 0; i < 9; i++) {
    const start = dayStart + i * 24 * H + 2 * H;
    if (new Date(start).getUTCDay() === 6 && start + 3 * H > now - 5 * H) return start + 5 * H;
  }
  return now;
}

// ---- what a player's club looks like to the rules ---------------------------------------------------------------------------
export interface Crime {
  heat: number;
  /** when `heat` was last brought up to date */
  heatAt: number;
  /** nobody can rob this club until then */
  shieldUntil: number;
  /** the last robbery this player carried out */
  lastHeistAt: number;
  /** lot number -> when this player last robbed it */
  targets: Record<string, number>;
  /** this player cannot rob until then (caught) */
  detainedUntil: number;
  /** the club is shut by the police until then */
  closedUntil: number;
  /** prison: chores done and chores needed to get out (0 when not in prison) */
  chores: number;
  choreGoal: number;
  /** when the last chore was counted (the server keeps a gap between chores) */
  lastChoreAt: number;
  /** bought protection: nobody can rob this club until then (robbing someone yourself ends it) */
  guardUntil: number;
  /** when the police last brought the heat up to date for the hot pieces on show */
  policeAt: number;
  /** when the police last visited this club */
  patrolAt: number;
  /** lot number -> until when this player can take revenge on it */
  revenge: Record<string, number>;
  /** robbed today: cash taken and pieces taken, and which day (a number of days since 1970) */
  lossDay: number;
  lossCash: number;
  lossPieces: number;
}

export function newCrime(): Crime {
  return { heat: 0, heatAt: 0, shieldUntil: 0, lastHeistAt: 0, targets: {}, detainedUntil: 0, closedUntil: 0, chores: 0, choreGoal: 0, lastChoreAt: 0, guardUntil: 0, policeAt: 0, patrolAt: 0, revenge: {}, lossDay: 0, lossCash: 0, lossPieces: 0 };
}

/** Heat now: it falls by itself with the hours (twice as fast on Blackout Night, hour by hour). */
export function heatNow(c: Crime, now: number): number {
  if (!c.heatAt || now <= c.heatAt) return c.heat;
  let heat = c.heat;
  let t = c.heatAt;
  while (t < now && heat > 0) {
    const step = Math.min(now, t + H);
    heat -= RULES.heatDecayPerHour * ((step - t) / H) * (isBlackoutNight(t) ? 2 : 1);
    t = step;
  }
  return Math.max(0, heat);
}

export function addHeat(c: Crime, amount: number, now: number): Crime {
  return { ...c, heat: Math.min(100, heatNow(c, now) + amount), heatAt: now };
}

// ---- who can rob whom ------------------------------------------------------------------------------------------------------
export interface Party {
  /** lot number (the id of the club in the city) */
  n: number;
  level: number;
  crime: Crime;
}

export type Reason = 'novice' | 'band' | 'self' | 'cooldown' | 'sameTarget' | 'shield' | 'guard' | 'detained' | 'dailyCap' | 'closed';

const dayOf = (now: number) => Math.floor((now - 5 * H) / (24 * H));

/** Why this robbery is not allowed (null: it is). */
export function whyNot(thief: Party, victim: Party, now: number): { reason: Reason; until?: number } | null {
  if (thief.n === victim.n) return { reason: 'self' };
  if (thief.level < RULES.noviceLevel || victim.level < RULES.noviceLevel) return { reason: 'novice' };
  if (Math.abs(thief.level - victim.level) > RULES.levelBand) return { reason: 'band' };
  if (thief.crime.detainedUntil > now) return { reason: 'detained', until: thief.crime.detainedUntil };
  const revenge = (thief.crime.revenge[String(victim.n)] ?? 0) > now;
  const wait = revenge ? RULES.revengeCooldown : RULES.ownCooldown;
  if (thief.crime.lastHeistAt && now - thief.crime.lastHeistAt < wait) return { reason: 'cooldown', until: thief.crime.lastHeistAt + wait };
  const last = thief.crime.targets[String(victim.n)];
  if (last && now - last < RULES.sameTargetCooldown && !revenge) return { reason: 'sameTarget', until: last + RULES.sameTargetCooldown };
  if (victim.crime.guardUntil > now) return { reason: 'guard', until: victim.crime.guardUntil };
  if (victim.crime.shieldUntil > now) return { reason: 'shield', until: victim.crime.shieldUntil };
  const v = victim.crime;
  if (v.lossDay === dayOf(now) && v.lossPieces >= RULES.dailyPieces) return { reason: 'dailyCap' };
  return null;
}

/** The price of the anti-theft protector: it grows with the level (a bigger club has more to lose and earns more). */
export function guardPrice(level: number, hours: number): number {
  return Math.round(400 * Math.max(1, level) * hours);
}

/** Minutes the thief's own club stays shut when they are caught: 15 for a hard target (alarm, or a heavy piece), 10 otherwise. */
export function jailMinutes(hard: boolean): number {
  return hard ? RULES.jailMinutesHard : RULES.jailMinutes;
}

/** How many chores a caught thief must do to get out of prison. */
export function choreGoalFor(hard: boolean): number {
  return hard ? RULES.choreGoalHard : RULES.choreGoalSoft;
}

// ---- what can be taken ----------------------------------------------------------------------------------------------------
/** Pieces that can be stolen, and whether they need the van. Everything else (finishes of the room, honour trophies) cannot. */
const LOOT: Record<string, { heavy: boolean; minTier: number }> = {
  gold_statue: { heavy: false, minTier: 1 },
  trophy_cup: { heavy: false, minTier: 1 },
  trophy_case: { heavy: true, minTier: 1 },
  big_screen: { heavy: true, minTier: 1 },
  tv_stand: { heavy: false, minTier: 1 },
  laser_tower: { heavy: false, minTier: 1 },
  aquarium: { heavy: true, minTier: 1 },
  fountain: { heavy: true, minTier: 1 },
  disco_ball: { heavy: false, minTier: 1 },
  bar_straight: { heavy: true, minTier: 3 },
  dj_booth: { heavy: true, minTier: 3 },
  speaker: { heavy: false, minTier: 3 },
  speaker_tower: { heavy: false, minTier: 3 },
  sub_bass: { heavy: true, minTier: 3 },
  led_wall: { heavy: true, minTier: 1 },
  gold_record: { heavy: false, minTier: 1 },
  award_wall: { heavy: true, minTier: 1 },
  sculpture: { heavy: false, minTier: 1 },
  dj_booth_pro: { heavy: true, minTier: 3 },
  video_wall: { heavy: true, minTier: 1 },
  tv_wall: { heavy: true, minTier: 1 },
  totem_led: { heavy: false, minTier: 1 },
  arcade: { heavy: true, minTier: 1 },
  moving_heads: { heavy: false, minTier: 1 },
  bar_long: { heavy: true, minTier: 3 },
};

export interface Piece {
  uid: string;
  id: string;
  tier: number;
  /** locked in a vitrine or the safe */
  locked?: boolean;
}

export function isStealable(p: Piece): boolean {
  const rule = LOOT[p.id];
  return !!rule && p.tier >= rule.minTier && !p.locked;
}

export function needsVan(p: Piece): boolean {
  return LOOT[p.id]?.heavy ?? false;
}

/** What a piece is worth (everything paid for it). */
export function pieceValue(p: Piece): number {
  const def = BY_ID.get(p.id);
  return def ? invested(def.price, Math.min(4, Math.max(1, p.tier)) as Tier) : 0;
}

export type Kit = 'picks' | 'jammer' | 'van' | 'disguise';

/** The robbery kits Zeta sells. Picks, jammer and disguise are used up in one attempt; the van is kept. */
export const KITS: Array<{ id: Kit; name: string; desc: string; price: number; consumed: boolean }> = [
  { id: 'picks', name: 'Ganzúas', desc: 'Abren vitrinas y la puerta de atrás: más probabilidad de éxito.', price: 400 * PRICE_SCALE, consumed: true },
  { id: 'jammer', name: 'Inhibidor de alarma', desc: 'Si el club tiene alarma, no suena.', price: 1500 * PRICE_SCALE, consumed: true },
  { id: 'van', name: 'Furgoneta', desc: 'Necesaria para llevarse piezas grandes. Se queda contigo.', price: 12000 * PRICE_SCALE, consumed: false },
  { id: 'disguise', name: 'Disfraz', desc: 'Si te descubren, el calor sube la mitad.', price: 1000 * PRICE_SCALE, consumed: true },
];
export const KIT_BY_ID = new Map(KITS.map((k) => [k.id, k]));

export interface Security {
  guards: number;
  alarm: boolean;
  /** the club is open with people inside */
  crowded: boolean;
  /** vitrines with a lock and safes: each one keeps the most valuable piece out of reach */
  locks: number;
  /** safes: each one keeps part of the cash box out of reach */
  safes?: number;
  /** security cameras: each one makes the job a little harder (up to 3) */
  cameras?: number;
}

/** The security of a club, read from what it has bought: an alarm, safes, armoured vitrines and the guards. */
export function securityOfClub(items: ReadonlyArray<{ id: string }>, guards: number, crowded: boolean): Security {
  const safes = items.filter((i) => i.id === 'safe').length;
  const cases = items.filter((i) => i.id === 'vault_case').length;
  return { guards, alarm: items.some((i) => i.id === 'alarm'), crowded, locks: safes + cases, safes, cameras: Math.min(3, items.filter((i) => i.id === 'camera').length) };
}

/** The pieces a safe or armoured vitrine keeps out of reach: the most valuable ones, one per lock. */
export function lockedUids(items: ReadonlyArray<{ uid: string; id: string; tier: number }>, locks: number): Set<string> {
  return new Set(items.filter((p) => LOOT[p.id]).sort((a, b) => pieceValue(b) - pieceValue(a)).slice(0, Math.max(0, locks)).map((p) => p.uid));
}

/** Chance of success, 0.05 to 0.95. `skill` is how well the player did in the short game (0 to 1; 0.5 when it is skipped). */
export function successChance(kits: Kit[], sec: Security, skill = 0.5): number {
  let p = 0.5;
  p += 0.08 * (kits.includes('picks') ? 1 : 0);
  p += 0.12 * (kits.includes('jammer') && sec.alarm ? 1 : 0);
  p -= 0.1 * sec.guards;
  p -= 0.12 * (sec.alarm && !kits.includes('jammer') ? 1 : 0);
  p -= 0.08 * (sec.crowded ? 1 : 0);
  p -= 0.05 * Math.min(sec.locks, 3);
  p -= 0.04 * Math.min(sec.cameras ?? 0, 3);
  p += (skill - 0.5) * 0.4;
  return Math.min(0.95, Math.max(0.05, p));
}

export interface Loot {
  cash: number;
  pieces: Piece[];
}

export type Outcome = { kind: 'full'; loot: Loot } | { kind: 'partial'; loot: Loot } | { kind: 'fail' } | { kind: 'denied'; reason: Reason; until?: number };

/**
 * Settle a robbery. `roll` is a random number in [0, 1) that the SERVER draws. The thief names the piece they want (if it is
 * out of reach it is ignored); the cash taken is a share of the box, never more than the daily share.
 */
export function resolveHeist(thief: Party, victim: Party, victimCash: number, pieces: Piece[], want: string | null, kits: Kit[], sec: Security, skill: number, roll: number, now: number): Outcome {
  const no = whyNot(thief, victim, now);
  if (no) return { kind: 'denied', ...no };
  const chance = successChance(kits, sec, skill);
  if (roll >= chance) return { kind: 'fail' };
  const room = RULES.dailyCashShare * victimCash * (1 - Math.min(0.6, 0.3 * (sec.safes ?? 0))) - (victim.crime.lossDay === dayOf(now) ? victim.crime.lossCash : 0);
  const cash = Math.max(0, Math.floor(room));
  const canTake = victim.crime.lossDay === dayOf(now) ? victim.crime.lossPieces < RULES.dailyPieces : true;
  const pool = canTake ? pieces.filter((p) => isStealable(p) && (!needsVan(p) || kits.includes('van'))) : [];
  const chosen = pool.find((p) => p.uid === want) ?? [...pool].sort((a, b) => pieceValue(b) - pieceValue(a))[0];
  const loot: Loot = { cash, pieces: chosen ? [chosen] : [] };
  // a wide margin is a clean job; a close one leaves something behind (only the cash)
  return roll < chance * 0.6 ? { kind: 'full', loot } : { kind: 'partial', loot: { cash, pieces: [] } };
}

/** Apply a settled robbery to both sides: shields, cooldowns, heat, what each lost today, detention. */
export function applyHeist(thief: Party, victim: Party, out: Outcome, now: number): { thief: Crime; victim: Crime } {
  if (out.kind === 'denied') return { thief: thief.crime, victim: victim.crime };
  const day = dayOf(now);
  let t: Crime = { ...thief.crime, lastHeistAt: now, targets: { ...thief.crime.targets, [String(victim.n)]: now } };
  let v: Crime = { ...victim.crime };
  if (out.kind === 'fail') {
    t = addHeat(t, RULES.heatPerFail, now);
    t.detainedUntil = now + RULES.detention; // the alarm rang: the Brigade arrives
    return { thief: t, victim: v };
  }
  t = addHeat(t, RULES.heatPerHeist, now);
  const shield = isBlackoutNight(now) ? RULES.shield / 2 : RULES.shield;
  v = {
    ...v,
    shieldUntil: now + shield,
    revenge: { ...v.revenge },
    lossDay: day,
    lossCash: (v.lossDay === day ? v.lossCash : 0) + out.loot.cash,
    lossPieces: (v.lossDay === day ? v.lossPieces : 0) + out.loot.pieces.length,
  };
  v.revenge[String(thief.n)] = now + RULES.revengeWindow;
  return { thief: t, victim: v };
}

// ---- the police ------------------------------------------------------------------------------------------------------------
export type PoliceLevel = 'none' | 'patrol' | 'closure' | 'raid';

export function policeLevel(heat: number): PoliceLevel {
  return heat >= 85 ? 'raid' : heat >= 60 ? 'closure' : heat >= 30 ? 'patrol' : 'none';
}

export interface PoliceAction {
  level: PoliceLevel;
  /** share of the player's cash taken as a fine */
  fineShare: number;
  /** hours the club is shut */
  closeHours: number;
  /** the hot pieces are taken away */
  seize: boolean;
  /** share of prestige lost (0 to 1) */
  prestigeLoss: number;
}

/**
 * What the police do when they visit a club (the server decides when: every so often, more often the higher the heat).
 * With no hot pieces a patrol finds nothing.
 */
export function policeAction(heat: number, hotPieces: number, open: boolean): PoliceAction {
  const level = policeLevel(heat);
  const none: PoliceAction = { level, fineShare: 0, closeHours: 0, seize: false, prestigeLoss: 0 };
  if (level === 'none') return none;
  if (level === 'patrol') return hotPieces > 0 && open ? { ...none, fineShare: 0.05, seize: true } : none;
  if (level === 'closure') return { level, fineShare: hotPieces > 0 ? 0.12 : 0.04, closeHours: hotPieces > 0 ? 6 : 1, seize: hotPieces > 0, prestigeLoss: 0 };
  return { level, fineShare: 0.25, closeHours: 12, seize: true, prestigeLoss: 0.15 };
}

/** How often the police visit, in hours between visits, for a heat level (0: never). */
export function patrolEveryHours(heat: number): number {
  const level = policeLevel(heat);
  return level === 'raid' ? 2 : level === 'closure' ? 4 : level === 'patrol' ? 8 : 0;
}

/** Price to clean a hot piece with the receiver. */
export function launderPrice(p: Piece): number {
  return Math.round(pieceValue(p) * RULES.launderShare);
}

/** A hot piece is cool again after this time (or when it was cleaned). */
export function coolsAt(stolenAt: number): number {
  return stolenAt + RULES.coolOff;
}
