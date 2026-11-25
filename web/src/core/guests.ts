// Guest simulation: who comes in, where they go, what they pay. Pure logic (no rendering), deterministic for a seed,
// so it can be tested without a browser and later run on the server to settle offline income.

import { BY_ID } from './catalog.ts';
import { perksOf, type DoorPerks } from './exterior.ts';
import { COMFORT_PER_TIER, COVER_PER_TIER, upkeepPerMinute } from './renovation.ts';
import { MOOD_TARGET, VIP_RATING, liking, tasteFor, type Genre } from './music.ts';
import { levelOf } from './progression.ts';
import { composeReview, type Facts, type Tag } from './reviews.ts';
import { earningOf, FULL_HOUSE } from './income.ts';
import { CELEBS } from './celebs.ts';
import { WAGE_EVERY, perksOfStaff, wagePerMinute, type StaffPerks } from './staff.ts';

const SHOW_EVERY = 10;
import { PARCEL, YARD, PHASES, soundSystem, tierOfItem, blockedSet, cellsOf, doorCells, phaseOf, reachableCells, statsOf, type ClubState, type Phase, type Rot } from './club.ts';

export type Mode = 'walk' | 'dance' | 'drink' | 'lounge' | 'idle';
export type SlotKind = 'dance' | 'bar' | 'lounge';

export interface Slot {
  kind: SlotKind;
  key: string;
  x: number;
  y: number;
  /** direction the guest should face once there */
  fx: number;
  fy: number;
  /** sits on the piece (the guest stands on its cell, with the feet at this height) */
  sit?: number;
}

/** A guest who claims to be famous. Only the player can find out (by checking) whether it is true. */
export interface Vip {
  /** which famous person (core/celebs.ts): the portrait is drawn from it */
  celeb: string;
  name: string;
  /** what they claim to be */
  title: string;
  /** the truth: a real star brings money and buzz, an impostor sneaks in and leaves without paying */
  real: boolean;
  checked: boolean;
}

/** What a guest shows over their head about the music. */
export type EmoteKind = 'love' | 'like' | 'bored' | 'hate';

export interface Guest {
  id: number;
  /** the genre this guest loves */
  taste: Genre;
  /** a bubble over the head for a moment; the view draws it */
  emote?: { kind: EmoteKind; ttl: number };
  emoteCd: number;
  vip?: Vip;
  /** waiting in line outside the door */
  queued?: boolean;
  /** seated: the height of the feet (missing: standing) */
  sit?: number;
  /** seconds of patience left in line */
  patience?: number;
  /** points still to walk through on the way to the line (along the sidewalk) */
  route?: Array<[number, number]>;
  /** position in tile units (cell centre = cell + 0.5) */
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  mode: Mode;
  path: Array<[number, number]>;
  slot: Slot | null;
  /** what to do on arrival at the end of the path */
  then: SlotKind | 'wander' | 'leave' | null;
  timer: number;
  /** seconds of stay left before heading out */
  stay: number;
  happiness: number;
  leaving: boolean;
  /** seconds of patience it started with, and how long it waited in line */
  wait0?: number;
  waited?: number;
}

export interface GuestEvent {
  x: number;
  y: number;
  /** coins earned (0 for a finished dance: it only gives XP) */
  amount: number;
  kind: 'cover' | 'drink' | 'dance' | 'vip' | 'fraud' | 'wage' | 'upkeep' | 'show';
}

/** Why someone in line did not get in. */
export type QueueNote = { kind: 'full' | 'impatient' | 'vip-left'; name?: string } | { kind: 'review'; stars: number; text: string; tags: Tag[]; who: string };

/** Cost of checking a VIP's story (the UI charges it). */
export const VIP_CHECK_COST = 60;
export const VIP_REAL_COVER = 300;
export const VIP_FRAUD_LOSS = 200;
export const VIP_DRINK = 120;
export const MAX_QUEUE = 10;
/** The sidewalk in front of the lot (world z): people come walking along it and go back along it. */
export const SIDEWALK_Y = PARCEL.h - YARD - 1.3;
/** where the sidewalk leaves the view on each side */
const SIDEWALK_ENDS = [-44, 78];
const SPACING = 1.05;
const ADMIT_EVERY = 2.5;

export const COVER = 10;
export const DRINK_PRICE = 50;
const SPEED = 1.15; // tiles per second
/**
 * The most people a club can hold, by the club's level and its building: it grows with the level (a famous club is a bigger crowd)
 * and the building must be big enough for it (an expansion lifts the ceiling). The tiles and seats still decide how many fit.
 */
const GUEST_ANCHORS: Array<[number, number]> = [[1, 30], [6, 40], [13, 50], [23, 75], [36, 115], [51, 165], [71, 235], [100, 330]];
const GUEST_CEILING = [40, 52, 64, 100, 150, 220, 320];
export function guestCap(phase: number, level: number): number {
  let cap = GUEST_ANCHORS[GUEST_ANCHORS.length - 1][1];
  for (let i = 1; i < GUEST_ANCHORS.length; i++) {
    const [l0, c0] = GUEST_ANCHORS[i - 1];
    const [l1, c1] = GUEST_ANCHORS[i];
    if (level <= l1) {
      cap = c0 + ((c1 - c0) * Math.max(0, level - l0)) / (l1 - l0);
      break;
    }
  }
  return Math.floor(Math.min(cap, GUEST_CEILING[Math.min(Math.max(phase, 1), GUEST_CEILING.length) - 1]));
}
/**
 * Where a seated guest's feet are, by piece: the guest sits with the legs folded, so the hips (just above the feet) must
 * end at the height of the cushion, and the feet hang above the floor like a child's on a tall chair.
 */
/** how high the guest is lifted when sitting: the seat's top, minus the standing height of the hips (0.285), plus a little */
const SIT_DROP: Record<string, number> = { stool: 0.38, chair_red: 0.26, puff: 0.29, sofa_red_2: 0.31, booth: 0.31, sofa_vip: 0.31, lounge_bed: 0.32, sofa_corner: 0.31 };
/** facing of an object at each rotation (+Z at rotation 0, turned by the rotation) */
const FRONT: Array<[number, number]> = [[0, 1], [-1, 0], [0, -1], [1, 0]];

const key = (x: number, y: number) => `${x},${y}`;

export class GuestSim {
  guests: Guest[] = [];
  events: GuestEvent[] = [];
  enabled = true;
  /** total income since creation, for tests and stats */
  earned = 0;
  /** people waiting outside, first in line first */
  queue: Guest[] = [];
  /** people who gave up or were turned away because the line was full */
  turnedAway = 0;
  notes: QueueNote[] = [];
  /** seconds of extra crowd left after a real star walked in */
  buzz = 0;
  /** the club's score, 0-100: how happy the crowd inside is, smoothed. A star only comes to a club with a great one. */
  rating = 50;
  /** the music system is on (the game sets it; plain simulations ignore the music) */
  musicActive = false;
  private genre: Genre | null = null;
  /** points of happiness the room itself adds: luxury and a working DJ */
  private comfort = 0;

  private seed: number;
  private nextId = 1;
  private spawnAcc = 0;
  private phase: Phase = PHASES[0];
  private blocked = new Set<string>();
  private reach = new Set<string>();
  private slots: Record<SlotKind, Slot[]> = { dance: [], bar: [], lounge: [] };
  private slotByKey = new Map<string, Slot>();
  private taken = new Set<string>();
  private luxury = 0;
  private capacity = 0;
  private perks: DoorPerks = { arrivals: 1, patience: 1 };
  private crew: StaffPerks = { drinkPrice: 1, danceTip: 0, patience: 1, door: 1, checksVips: false };
  private wages = 0;
  /** rent, power and cleaning per minute of an open club; charged only when the game turns the real rules on */
  private upkeep = 0;
  /** the real running costs apply (the game turns this on; plain simulations leave it off) */
  upkeepOn = false;
  /** the share of the city's crowd this club gets, from the ranking (1 = an average club; see core/ranking.ts) */
  rankBoost = 1;
  /** the most people the club's level and building allow (see guestCap) */
  guestLimit = 40;
  private coverPrice = COVER;
  private tier = 0;
  /** the better bar charges more for each drink */
  private barMult = 1;
  /** better speakers and DJ gear, and better seats, make the crowd happier */
  private gearComfort = 0;
  private wageAcc = 0;
  /** events caused by the player's clicks between two steps */
  private carried: GuestEvent[] = [];
  /** the glass cages with a dancer: where each stands (tile centre) and its version */
  private shows: Array<{ x: number; y: number; rate: number; wage: number; radius: number; acc: number }> = [];
  private upkeepAcc = 0;
  private admitAcc = 0;
  /** seconds until a star can show up at the door again */
  vipCooldown = 60;
  /** no stars arrive while this is on (the warm-up of a reloaded game: a reload must never be a way to meet a star) */
  noVip = false;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }

  // ---- random (mulberry32) -------------------------------------------------------------------
  private rand(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  private range(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  /**
   * Let the night run for `seconds` so a reloaded club is not empty, WITHOUT stars: any star that was already in line is sent
   * away. Nothing that happens here is paid (the caller does not read the events).
   */
  warm(seconds: number): void {
    this.noVip = true;
    for (let t = 0; t < seconds; t += 0.25) this.update(0.25);
    this.noVip = false;
    this.queue = this.queue.filter((g) => !g.vip);
    for (const g of this.guests) if (g.vip) g.vip = undefined;
    this.events = [];
    this.notes = [];
  }

  /** Open or close the doors. Closing sends everyone inside home (they walk out; nobody new comes). */
  setOpen(open: boolean): void {
    this.enabled = open;
    if (!open) {
      for (const g of this.guests) if (!g.leaving) this.planLeave(g);
      // the line breaks up
      for (const g of this.queue) {
        g.queued = false;
        g.leaving = true;
        g.then = 'leave';
        g.mode = 'walk';
        g.path = this.sidewalkExit();
        this.guests.push(g);
      }
      this.queue = [];
    }
  }

  /** Tell the crowd what is playing (null: silence). Turns the music system on. */
  setMusic(genre: Genre | null): void {
    this.musicActive = true;
    this.genre = genre;
  }

  /** How many people may be inside at once: one per seat or dance tile (3 at least), and no more than the club's level and building allow. */
  get roomCapacity(): number {
    return Math.min(this.guestLimit, Math.max(3, this.capacity));
  }

  get inside(): number {
    return this.guests.filter((g) => !g.leaving).length;
  }

  /** The VIP waiting at the door, if there is one. */
  get waitingVip(): Guest | undefined {
    return this.queue.find((g) => g.vip);
  }

  /** Find out whether the VIP is who they say they are (the caller charges VIP_CHECK_COST). */
  checkVip(id: number): Vip | undefined {
    const v = this.queue.find((g) => g.id === id)?.vip;
    if (v) v.checked = true;
    return v;
  }

  /** Let a VIP skip the line and come in. */
  admitVip(id: number): boolean {
    const g = this.queue.find((q) => q.id === id && q.vip);
    if (!g) return false;
    const from = this.events.length;
    const ok = this.admit(g);
    this.carried.push(...this.events.splice(from)); // reported on the next step
    return ok;
  }

  /** Send a VIP away. */
  rejectVip(id: number): boolean {
    const i = this.queue.findIndex((q) => q.id === id && q.vip);
    if (i < 0) return false;
    this.queue[i].patience = 0;
    this.queue[i].vip!.checked = true;
    this.dismiss(this.queue[i], false);
    return true;
  }

  // ---- layout --------------------------------------------------------------------------------
  /** Call whenever the club layout changes. Guests whose plans no longer hold are re-planned. */
  setLayout(state: ClubState): void {
    this.phase = phaseOf(state);
    this.blocked = blockedSet(state.items);
    this.reach = reachableCells(state.items, this.phase);
    const st = statsOf(state);
    this.luxury = st.luxury;
    this.capacity = st.capacity;
    this.guestLimit = guestCap(state.phase, levelOf(state.xp).level);
    this.perks = perksOf(state.exterior);
    this.crew = perksOfStaff(state);
    // each dancing cage draws a crowd of its own, and its dancer is paid by the minute
    this.shows = state.items.flatMap((i) => {
      const def = BY_ID.get(i.id);
      const earn = def && earningOf(def);
      if (!def || !earn) return [];
      const cx = i.x + def.w / 2;
      const cy = i.y + def.d / 2;
      const t = tierOfItem(i);
      return [{ x: cx, y: cy, rate: earn.perMin[t - 1], wage: earn.wage[t - 1], radius: earn.radius, acc: this.shows.find((o) => o.x === cx && o.y === cy)?.acc ?? 0 }];
    });
    this.wages = wagePerMinute(state) + this.shows.reduce((a, c) => a + c.wage, 0);
    this.upkeep = upkeepPerMinute(state);
    this.tier = state.renovation;
    this.coverPrice = Math.round(COVER * (1 + COVER_PER_TIER * state.renovation));
    const bars = state.items.filter((i) => BY_ID.get(i.id)?.category === 'bars' && BY_ID.get(i.id)?.needsAccess).map(tierOfItem);
    this.barMult = [1, 1, 1.2, 1.45, 1.8][bars.length ? Math.max(...bars) : 0];
    const seats = state.items.filter((i) => BY_ID.get(i.id)?.seats && i.id !== 'stool').map(tierOfItem);
    const sound = soundSystem(state);
    this.gearComfort = (sound ? (sound - 1) * 2.5 : 0) + (seats.length ? (seats.reduce((a, b) => a + b, 0) / seats.length - 1) * 1.5 : 0);
    this.comfort = this.gearComfort + Math.min(15, st.luxury / 15) + (this.crew.danceTip > 0 ? 5 : 0) + COMFORT_PER_TIER * this.tier;
    this.computeSlots(state);

    for (const g of this.guests) {
      const cx = Math.floor(g.x);
      const cy = Math.floor(g.y);
      const inRoom = cx >= 0 && cy >= 0 && cx < this.phase.w && cy < this.phase.h;
      if (g.slot && !this.slotByKey.has(g.slot.key)) this.release(g);
      const onOwnSlot = !!g.slot && g.slot.x === cx && g.slot.y === cy;
      if (inRoom && this.blocked.has(key(cx, cy)) && !onOwnSlot) {
        // an item was dropped on top of this guest: send them back to the door
        const [dx, dy] = doorCells(this.phase)[0];
        g.x = dx + 0.5;
        g.y = dy + 0.5;
        g.path = [];
        this.release(g);
        g.mode = 'idle';
        g.timer = 0;
        g.then = null;
        continue;
      }
      if (g.mode === 'walk' && !g.leaving) {
        g.path = [];
        g.then = null; // will be decided on the next tick
        g.mode = 'idle';
        g.timer = 0;
      } else if (g.mode !== 'walk' && !g.slot && g.then === null) {
        g.timer = 0;
      }
      if (g.leaving) this.planLeave(g);
    }
  }

  private computeSlots(state: ClubState): void {
    const s: Record<SlotKind, Slot[]> = { dance: [], bar: [], lounge: [] };
    const barCells = new Set<string>();
    for (const it of state.items) {
      const def = BY_ID.get(it.id);
      if (def?.category === 'bars' && def.needsAccess) for (const [x, y] of cellsOf(def, it.x, it.y, it.rot)) barCells.add(key(x, y));
    }
    for (const it of state.items) {
      const def = BY_ID.get(it.id);
      if (!def) continue;
      const cells = cellsOf(def, it.x, it.y, it.rot);
      if (def.layer === 'floor') {
        for (const [x, y] of cells) {
          if (this.reach.has(key(x, y))) s.dance.push({ kind: 'dance', key: `dance:${key(x, y)}`, x, y, fx: 0, fy: 1 });
        }
        continue;
      }
      const [fx, fy] = FRONT[it.rot as Rot];
      const own = new Set(cells.map(([x, y]) => key(x, y)));
      const front = cells
        .map(([x, y]) => [x + fx, y + fy] as [number, number])
        .filter(([x, y]) => !own.has(key(x, y)) && this.reach.has(key(x, y)));
      if (def.category === 'bars' && def.needsAccess) {
        for (const [x, y] of front) s.bar.push({ kind: 'bar', key: `bar:${key(x, y)}`, x, y, fx: -fx, fy: -fy });
      } else if (def.category === 'bars' && def.seats) {
        // a stool next to the bar: the guest leans on it, facing the bar
        const [sx, sy] = cells[0];
        const toBar = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dx, dy]) => barCells.has(key(sx + dx, sy + dy)));
        const reachable = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => this.reach.has(key(sx + dx, sy + dy)));
        if (toBar && reachable) s.bar.push({ kind: 'bar', key: `bar:${key(sx, sy)}`, x: sx, y: sy, fx: toBar[0], fy: toBar[1], sit: SIT_DROP[it.id] ?? 0.3 });
      } else if (def.seats) {
        // a real seat: the guest goes onto the piece itself, facing the way it faces, and sits
        const next4 = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
        const seatCells = cells.filter(([x, y]) => next4.some(([dx, dy]) => this.reach.has(key(x + dx, y + dy))));
        for (const [x, y] of seatCells.slice(0, def.seats)) {
          s.lounge.push({ kind: 'lounge', key: `lounge:${key(x, y)}`, x, y, fx, fy, sit: SIT_DROP[it.id] ?? 0.28 });
        }
      }
    }
    // a cell can only host one slot of each kind
    for (const kind of ['dance', 'bar', 'lounge'] as const) {
      const seen = new Set<string>();
      s[kind] = s[kind].filter((sl) => (seen.has(sl.key) ? false : (seen.add(sl.key), true)));
    }
    this.slots = s;
    this.slotByKey = new Map([...s.dance, ...s.bar, ...s.lounge].map((sl) => [sl.key, sl]));
    for (const k of [...this.taken]) if (!this.slotByKey.has(k)) this.taken.delete(k);
  }

  // ---- stepping ------------------------------------------------------------------------------
  update(dt: number): void {
    // what the doorman did between two steps (letting a star in) is reported with this step's events, not lost
    this.events = this.carried;
    this.carried = [];
    this.notes = [];
    this.buzz = Math.max(0, this.buzz - dt);
    if (this.enabled && this.upkeepOn) {
      this.upkeepAcc += dt;
      while (this.upkeepAcc >= WAGE_EVERY) {
        this.upkeepAcc -= WAGE_EVERY;
        this.events.push({ x: 0, y: 0, amount: -Math.round((this.upkeep * WAGE_EVERY) / 60), kind: 'upkeep' });
      }
    }
    if (this.enabled && this.wages > 0) {
      // staff is paid for the time the doors are open
      this.wageAcc += dt;
      while (this.wageAcc >= WAGE_EVERY) {
        this.wageAcc -= WAGE_EVERY;
        const amount = -Math.round((this.wages * WAGE_EVERY) / 60);
        this.earned += amount;
        this.events.push({ x: 0, y: 0, amount, kind: 'wage' });
      }
    }
    if (this.enabled && this.musicActive && this.genre !== null) this.performShows(dt);
    if (this.enabled) {
      this.spawn(dt);
      this.moveQueue(dt);
    }
    for (const g of [...this.guests]) {
      g.stay -= dt;
      if (g.mode === 'walk') this.walk(g, dt);
      else this.activity(g, dt);
    }
    if (this.musicActive) this.mood(dt);
  }

  /**
   * The dancing cages and the trophies: every few seconds each one earns the tips of the people watching it (up to a full house of FULL_HOUSE around it).
   * The better the version, the more it earns; the dancer's wage is charged with the rest of the staff.
   */
  private performShows(dt: number): void {
    for (const c of this.shows) {
      c.acc += dt;
      if (c.acc < SHOW_EVERY) continue;
      c.acc -= SHOW_EVERY;
      const watching = this.guests.filter((g) => !g.leaving && g.y < this.phase.h && Math.hypot(g.x - c.x, g.y - c.y) <= c.radius).length;
      const amount = Math.round((c.rate * SHOW_EVERY) / 60 * Math.min(1, watching / FULL_HOUSE));
      if (amount <= 0) continue;
      this.earned += amount;
      this.events.push({ x: c.x, y: c.y, amount, kind: 'show' });
    }
  }

  /** The crowd listens: each guest drifts towards how much they like the song, shows it, and may walk out. */
  private mood(dt: number): void {
    const inside = this.guests.filter((g) => !g.leaving && g.y < this.phase.h);
    for (const g of inside) {
      const l = liking(g.taste, this.genre);
      g.happiness += ((Math.min(100, MOOD_TARGET[l] + (l === 'silence' ? 0 : this.comfort)) - g.happiness) * dt) / 25;
      if (g.emote && (g.emote.ttl -= dt) <= 0) g.emote = undefined;
      g.emoteCd -= dt;
      if (g.emoteCd > 0) continue;
      g.emoteCd = this.range(7, 14);
      if (l === 'love') g.emote = { kind: this.rand() < 0.6 ? 'love' : 'like', ttl: 2.5 };
      else if (l === 'ok') g.emote = this.rand() < 0.3 ? { kind: 'like', ttl: 2.5 } : undefined;
      else if (l === 'dislike') g.emote = this.rand() < 0.6 ? { kind: 'hate', ttl: 2.5 } : undefined;
      else g.emote = { kind: 'bored', ttl: 2.5 };
      if (g.happiness < 12 && l !== 'love') {
        g.emote = { kind: 'hate', ttl: 2.5 };
        this.planLeave(g); // fed up: this is not the place for them
      }
    }
    const mean = inside.length ? inside.reduce((a, g) => a + g.happiness, 0) / inside.length : 50;
    this.rating += ((inside.length ? mean : 50) - this.rating) * Math.min(1, dt / 20);
  }

  private spawn(dt: number): void {
    // a well-rated club draws a bigger crowd, a badly rated one a smaller one
    const fame = this.musicActive ? 0.5 + this.rating / 100 : 1;
    const perMinute = (5 + this.luxury * 0.05) * (this.buzz > 0 ? 1.6 : 1) * this.perks.arrivals * fame * this.rankBoost;
    this.spawnAcc += (perMinute * dt) / 60;
    this.vipCooldown -= dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.queue.length >= MAX_QUEUE) {
        this.turnedAway++;
        this.notes.push({ kind: 'full' });
        continue;
      }
      const [dx] = doorCells(this.phase)[0];
      const vip = !this.noVip && this.vipCooldown <= 0 && (!this.musicActive || this.rating >= VIP_RATING) && !this.waitingVip && !this.guests.some((x) => x.vip) && this.rand() < 0.12;
      const g: Guest = {
        id: this.nextId++, taste: tasteFor(this.rand()), emoteCd: this.range(3, 9), x: SIDEWALK_ENDS[this.rand() < 0.5 ? 0 : 1], y: SIDEWALK_Y + this.range(-0.5, 0.5), dirX: 1, dirY: 0, mode: 'walk',
        path: [], slot: null, then: null, timer: 0, stay: this.range(60, 120), happiness: 50, leaving: false,
        queued: true, patience: this.range(60, 110) * this.perks.patience * this.crew.patience,
        route: [[dx + 0.5, SIDEWALK_Y]],
      };
      g.wait0 = g.patience;
      if (vip) {
        const c = CELEBS[Math.floor(this.rand() * CELEBS.length)];
        g.vip = { celeb: c.id, name: c.name, title: c.title, real: this.rand() < 0.6, checked: this.crew.checksVips };
        g.patience = 70;
        g.stay = this.range(90, 150);
        this.vipCooldown = 150;
      }
      this.queue.push(g);
    }
  }

  /** Line management: walk to your place, lose patience, and let the next one in when there is room. */
  private moveQueue(dt: number): void {
    const [dx] = doorCells(this.phase)[0];
    const front = this.queue.filter((g) => g.vip);
    const order = [...front, ...this.queue.filter((g) => !g.vip)];
    order.forEach((g, i) => {
      if (g.route?.length) {
        // still on the sidewalk: walk along it to the foot of the carpet
        const [rx, ry] = g.route[0];
        const d = Math.hypot(rx - g.x, ry - g.y);
        const step = SPEED * 2.2 * dt;
        g.dirX = (rx - g.x) / (d || 1);
        g.dirY = (ry - g.y) / (d || 1);
        g.mode = 'walk';
        if (d <= step) {
          g.x = rx;
          g.y = ry;
          g.route.shift();
        } else {
          g.x += g.dirX * step;
          g.y += g.dirY * step;
        }
        return;
      }
      const tx = dx + 0.5;
      const ty = this.phase.h + 1.4 + i * SPACING;
      const vx = tx - g.x;
      const vy = ty - g.y;
      const dist = Math.hypot(vx, vy);
      if (dist > 0.04) {
        // people come in from the street at a walking pace, and shuffle forward slowly once in line
        const speed = SPEED * 1.6;
        const step = Math.min(dist, speed * dt);
        g.x += (vx / dist) * step;
        g.y += (vy / dist) * step;
        g.dirX = vx / dist;
        g.dirY = vy / dist;
        g.mode = 'walk';
      } else {
        g.dirX = 0;
        g.dirY = -1;
        g.mode = 'idle';
      }
      // only start losing patience once in line, not while still walking up the street
      if (dist < 0.6 || g.y < SIDEWALK_Y - 4) g.patience = (g.patience ?? 60) - dt;
    });
    for (const g of [...this.queue]) {
      if (g.patience! <= 0) this.dismiss(g, true);
    }
    this.admitAcc += dt * this.crew.door;
    if (this.admitAcc >= ADMIT_EVERY) {
      const next = this.queue.find((g) => !g.vip);
      if (next && this.inside < this.roomCapacity && this.admit(next)) this.admitAcc = 0;
      else this.admitAcc = ADMIT_EVERY;
    }
  }

  /** Walk from where the guest stands to the sidewalk and away along it (cells, like every other path). */
  private sidewalkExit(): Array<[number, number]> {
    const [dx] = doorCells(this.phase)[0];
    const row = Math.floor(SIDEWALK_Y);
    const far = this.rand() < 0.5 ? 0 : 1;
    return [[dx, row], [Math.floor(SIDEWALK_ENDS[far]), row]];
  }

  /** Someone leaves the line without getting in. */
  private dismiss(g: Guest, impatient: boolean): void {
    this.queue = this.queue.filter((q) => q !== g);
    g.queued = false;
    g.leaving = true;
    g.then = 'leave';
    g.mode = 'walk';
    g.path = this.sidewalkExit();
    this.guests.push(g);
    if (impatient) {
      if (!g.vip && this.rand() < 0.6) this.notes.push({ kind: 'review', ...composeReview(() => this.rand(), this.factsOf(g, 5, true)) });
      this.turnedAway++;
      this.notes.push(g.vip ? { kind: 'vip-left', name: g.vip.name } : { kind: 'impatient' });
    }
  }

  /** Let someone from the line in: they pay the cover (a star or an impostor does something special). */
  private admit(g: Guest): boolean {
    const doors = doorCells(this.phase);
    const [dx, dy] = doors[0];
    if (this.blocked.has(key(dx, dy))) return false;
    this.queue = this.queue.filter((q) => q !== g);
    g.waited = Math.max(0, (g.wait0 ?? 0) - (g.patience ?? 0));
    g.queued = false;
    g.x = dx + 0.5;
    g.path = [[dx, dy]];
    g.mode = 'walk';
    this.guests.push(g);
    if (g.vip) {
      if (g.vip.real) {
        this.earned += VIP_REAL_COVER;
        this.events.push({ x: g.x, y: g.y, amount: VIP_REAL_COVER, kind: 'vip' });
        this.buzz = 120;
      } else {
        // an impostor: no cover, and the "friends" they brought run up a tab nobody pays
        this.earned -= VIP_FRAUD_LOSS;
        this.events.push({ x: g.x, y: g.y, amount: -VIP_FRAUD_LOSS, kind: 'fraud' });
      }
      g.vip.checked = true;
    } else {
      this.pay(g, this.coverPrice, 'cover');
    }
    return true;
  }

  private pay(g: Guest, amount: number, kind: 'cover' | 'drink'): void {
    this.earned += amount;
    this.events.push({ x: g.x, y: g.y, amount, kind });
  }

  private walk(g: Guest, dt: number): void {
    let left = SPEED * dt;
    while (left > 0 && g.path.length) {
      const [cx, cy] = g.path[0];
      const tx = cx + 0.5;
      const ty = cy + 0.5;
      const dx = tx - g.x;
      const dy = ty - g.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        g.dirX = dx / dist;
        g.dirY = dy / dist;
      }
      if (dist <= left) {
        g.x = tx;
        g.y = ty;
        left -= dist;
        g.path.shift();
      } else {
        g.x += g.dirX * left;
        g.y += g.dirY * left;
        left = 0;
      }
    }
    if (g.path.length === 0) this.arrive(g);
  }

  private arrive(g: Guest): void {
    if (g.leaving) {
      this.release(g);
      this.guests = this.guests.filter((x) => x !== g);
      return;
    }
    const then = g.then;
    g.then = null;
    if (then === 'dance' || then === 'bar' || then === 'lounge') {
      g.mode = then === 'bar' ? 'drink' : then;
      g.timer = then === 'dance' ? this.range(12, 25) : then === 'bar' ? this.range(6, 10) : this.range(10, 20);
      if (g.slot) {
        g.dirX = g.slot.fx;
        g.dirY = g.slot.fy;
        g.sit = g.slot.sit;
      }
    } else {
      g.mode = 'idle';
      g.timer = this.range(2, 4);
    }
  }

  private activity(g: Guest, dt: number): void {
    g.timer -= dt;
    if (g.timer > 0) return;
    if (g.mode === 'drink') {
      const tip = Math.floor(g.happiness / 20);
      this.pay(g, Math.round((g.vip?.real ? VIP_DRINK : g.vip ? 0 : DRINK_PRICE) * this.crew.drinkPrice * this.barMult) + tip, 'drink');
      g.happiness = Math.min(100, g.happiness + 10);
    } else if (g.mode === 'dance' || g.mode === 'lounge') {
      g.happiness = Math.min(100, g.happiness + 6);
      if (g.mode === 'dance') this.events.push({ x: g.x, y: g.y, amount: this.crew.danceTip, kind: 'dance' });
    }
    this.release(g);
    this.decide(g);
  }

  private decide(g: Guest): void {
    if (g.stay <= 0) return this.planLeave(g);
    const free = (k: SlotKind) => this.slots[k].filter((s) => !this.taken.has(s.key));
    const options: Array<[SlotKind, number]> = [];
    if (free('dance').length) options.push(['dance', 0.5]);
    if (free('bar').length) options.push(['bar', 0.25]);
    if (free('lounge').length) options.push(['lounge', 0.25]);
    if (options.length) {
      const total = options.reduce((a, [, w]) => a + w, 0);
      let r = this.rand() * total;
      let kind = options[0][0];
      for (const [k, w] of options) {
        if ((r -= w) <= 0) {
          kind = k;
          break;
        }
      }
      const spots = free(kind);
      const slot = spots[Math.floor(this.rand() * spots.length)];
      const path = this.pathTo(g, slot.x, slot.y);
      if (path) {
        this.taken.add(slot.key);
        g.slot = slot;
        g.path = path;
        g.then = kind;
        g.mode = 'walk';
        return;
      }
    }
    // nothing to do here: wander to a random reachable cell
    const cells = [...this.reach];
    if (cells.length) {
      const [x, y] = cells[Math.floor(this.rand() * cells.length)].split(',').map(Number);
      const path = this.pathTo(g, x, y);
      if (path) {
        g.path = path;
        g.then = 'wander';
        g.mode = 'walk';
        return;
      }
    }
    g.mode = 'idle';
    g.timer = 3;
  }

  private planLeave(g: Guest): void {
    if (this.enabled && !g.leaving && !g.queued && !g.vip && g.y < this.phase.h) this.review(g);
    this.release(g);
    g.leaving = true;
    g.then = 'leave';
    if (g.y >= this.phase.h) {
      // already outside the building: just walk off along the sidewalk
      g.path = this.sidewalkExit();
      g.mode = 'walk';
      return;
    }
    const doors = doorCells(this.phase);
    const [dx, dy] = doors[Math.floor(this.rand() * doors.length)];
    const path = this.pathTo(g, dx, dy);
    g.path = [...(path ?? []), [dx, this.phase.h], ...this.sidewalkExit()];
    if (!path) {
      // cannot find a way out (should not happen: layouts keep a path): just walk straight there
      g.x = dx + 0.5;
      g.y = dy + 0.5;
    }
    g.mode = 'walk';
  }

  /** What this visit looked like (for the review the guest leaves). */
  private factsOf(g: Guest, waitedOverride?: number, angry = false): Facts {
    const inside = this.inside;
    return {
      happiness: angry ? 10 : g.happiness,
      liking: liking(g.taste, this.genre),
      waited: waitedOverride === 5 ? 90 : g.waited ?? 0,
      seats: this.slots.lounge.length + this.slots.bar.filter((b) => b.sit !== undefined).length,
      barSlots: this.slots.bar.length,
      danceTiles: this.slots.dance.length,
      inside,
      capacity: this.roomCapacity,
      luxury: this.luxury,
      rating: this.rating,
      gearComfort: this.gearComfort,
      hasBartender: this.crew.drinkPrice > 1,
    };
  }

  /** About one guest in three, on leaving the club, writes a review. */
  private review(g: Guest): void {
    if (this.rand() > 0.33) return;
    this.notes.push({ kind: 'review', ...composeReview(() => this.rand(), this.factsOf(g)) });
  }

  private release(g: Guest): void {
    if (g.slot) this.taken.delete(g.slot.key);
    g.slot = null;
    g.sit = undefined;
  }

  /** Shortest 4-neighbour walk from the guest's cell to (tx, ty), excluding the start cell. */
  private pathTo(g: Guest, tx: number, ty: number): Array<[number, number]> | null {
    const sx = Math.min(Math.max(Math.floor(g.x), 0), this.phase.w - 1);
    const sy = Math.min(Math.max(Math.floor(g.y), 0), this.phase.h - 1);
    // a guest still outside the building (south of the door) enters through the door cell first
    const outside = g.y >= this.phase.h;
    const start: [number, number] = outside ? [sx, this.phase.h - 1] : [sx, sy];
    const prefix: Array<[number, number]> = outside ? [start] : [];
    const goalKey = key(tx, ty);
    if (start[0] === tx && start[1] === ty) return prefix;
    const prev = new Map<string, string>();
    const q: Array<[number, number]> = [start];
    prev.set(key(start[0], start[1]), '');
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === tx && y === ty) break;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= this.phase.w || ny >= this.phase.h) continue;
        const k = key(nx, ny);
        if ((this.blocked.has(k) && k !== goalKey) || prev.has(k)) continue;
        prev.set(k, key(x, y));
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(tx, ty))) return null;
    const out: Array<[number, number]> = [];
    for (let k = key(tx, ty); k !== key(start[0], start[1]); k = prev.get(k)!) out.push(k.split(',').map(Number) as [number, number]);
    return [...prefix, ...out.reverse()];
  }
}
