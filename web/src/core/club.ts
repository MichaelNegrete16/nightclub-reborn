// Club layout and ownership rules. Pure functions over plain data: the same code validates placements in the browser,
// on mobile and (later) on the server, so a client can never save something the rules would reject.
//
// Ownership model (like the original's Store / Inventory / Edit): you BUY into your inventory, PLACE from the
// inventory into the room, STASH an item back into the inventory, or SELL it for half its price.

import { BOOTH_IDS, BY_ID, type ItemDef } from './catalog.ts';
import { MAX_REVIEWS, type Review, type Tag } from './reviews.ts';
import { newExterior, sanitizeExterior, type Exterior } from './exterior.ts';
import { decorLuxury, newDecor, sanitizeDecor, type Decor } from './decor.ts';
import type { Kit } from './heist.ts';
import { newMusic, sanitizeMusic, type MusicState } from './music.ts';
import { newOffline, sanitizeOffline, type OfflineInfo } from './offline.ts';
import { sanitizeRenovation } from './renovation.ts';
import { newStaff, sanitizeStaff, type StaffCount } from './staff.ts';
import type { Loan } from './bank.ts';
import { PRICE_SCALE } from './pricing.ts';
import { TIER_LEVEL, TIER_LUXURY, TIER_NAMES, clampTier, invested, soundQuality, upgradeCost, type Tier } from './tiers.ts';
import { XP, levelOf } from './progression.ts';

export interface Phase {
  id: number;
  name: string;
  w: number;
  h: number;
  /** max object-layer items (floor tiles don't count) */
  maxObjects: number;
}

// Interior grids from docs/WORLD_AND_DECOR.md (phases 4+ will also get an upper floor later).
export const PHASES: Phase[] = [
  { id: 1, name: 'Sótano', w: 8, h: 8, maxObjects: 40 },
  { id: 2, name: 'Bar de barrio', w: 10, h: 10, maxObjects: 65 },
  { id: 3, name: 'Club', w: 12, h: 14, maxObjects: 100 },
  { id: 4, name: 'Club grande', w: 14, h: 18, maxObjects: 150 },
  { id: 5, name: 'Mega club', w: 18, h: 22, maxObjects: 220 },
  { id: 6, name: 'Rooftop', w: 20, h: 24, maxObjects: 280 },
  { id: 7, name: 'Festival / Arena', w: 28, h: 32, maxObjects: 400 },
];

/** Land the player owns: bigger than the building so there is room to grow. */
/** Free ground between the edge of the lot and the building on its north and west sides. */
export const YARD = 4;
export const PARCEL = { w: 34, h: 38 };

export type Rot = 0 | 1 | 2 | 3;

export interface PlacedItem {
  uid: string;
  id: string;
  /** top-left cell of the (rotated) footprint */
  x: number;
  y: number;
  rot: Rot;
  /** which version of the object this is, 1 (basement) to 4 (elite); missing means 1 */
  tier?: number;
  /** a stolen piece on display: hot until this time (ms). It adds heat every hour until it is cleaned or cools down. */
  hot?: number;
}

export interface ClubStats {
  guests: number;
  drinks: number;
  dances: number;
  /** ids of objects bought at least once (the first purchase of each gives bonus XP) */
  discovered: string[];
  /** real stars let in, neighbours' clubs visited, and the best club rating reached (for missions) */
  vips: number;
  visits: number;
  bestRating: number;
  /** robberies of mine that worked */
  heists: number;
  /** when the last star arrived at the door (ms): the clock of the stars survives a reload */
  vipAt: number;
}

export interface StoryState {
  /** has the opening story been played */
  intro: boolean;
  /** player's name as shown in dialogues */
  name: string;
  /** ids of completed missions */
  done: string[];
  /** ids of chapter scenes already shown */
  seen: string[];
  /** how many steps of Rosa's guided tutorial are done (see ui/coach.ts); -1 = skipped */
  tutorial: number;
  /** ids of the guide tips already explained (see core/tips.ts) */
  tips: string[];
  /** id of the last "novedades" window the player has seen (see core/news.ts) */
  news: string;
}

export interface ClubState {
  phase: number;
  coins: number;
  /** the club is open for business: only then do guests come in */
  open: boolean;
  xp: number;
  items: PlacedItem[];
  /** bought but not placed: object id -> amount */
  inventory: Record<string, number>;
  nextUid: number;
  stats: ClubStats;
  story: StoryState;
  /** what the facade looks like and the door perks bought for it */
  exterior: Exterior;
  /** people working for the club */
  staff: StaffCount;
  /** the playlist and what is playing */
  music: MusicState;
  /** how many renovation tiers the club has had (0-5) */
  renovation: number;
  /** what the club was earning when the game last ran, for income while away */
  offline: OfflineInfo;
  /** the finishes of the inside: walls, floor, mouldings, lighting and art */
  decor: Decor;
  /** robbery kits in the bag */
  kits: Record<Kit, number>;
  /** stolen pieces in the bag, still "hot" */
  loot: LootPiece[];
  /** improved pieces taken out of the room and kept, with their version */
  kept: KeptPiece[];
  /** the bank's loan, if any (the server keeps the real books: this is what the game shows) */
  loan: Loan | null;
  /** pieces the bank holds until the debt is paid */
  embargoed: KeptPiece[];
  /** no new loans until this time (ms) */
  badCreditUntil: number;
  /** the last letters about robberies and police visits (newest first) */
  reports: Report[];
  /** what the guests said about the club when they left (newest first) */
  reviews: Review[];
}

export interface Report {
  /** the letter's id: a letter is only written down once */
  id: string;
  at: number;
  kind: 'robbed' | 'loot' | 'police' | 'income' | 'fee' | 'jail' | 'refund' | 'bank';
  /** bank: what happened (see core/bank.ts) */
  event?: string;
  /** lot number and name of the other side (thief, victim, or the police) */
  by: number;
  byName: string;
  cash: number;
  pieces: string[];
  closedUntil: number;
}

export interface LootPiece {
  uid: string;
  id: string;
  tier: number;
  /** hot until this time (ms); 0 once it is clean */
  hotUntil: number;
  /** lot number of the club it was taken from */
  from: number;
}

/** an improved piece put away: it keeps its version (and what was paid for it) until it is placed again or sold */
export interface KeptPiece {
  uid: string;
  id: string;
  tier: Tier;
}

export const MAX_KEPT = 60;

export const START_COINS = 4000 * PRICE_SCALE;
export const SELL_RATIO = 0.5;
/** the late uncle's booth: a gift in the inventory at the very start of the story */
export const STARTER_INVENTORY: Record<string, number> = { dj_booth: 1 };

export function newClub(): ClubState {
  return {
    phase: 1,
    coins: START_COINS,
    open: false,
    xp: 0,
    items: [],
    inventory: { ...STARTER_INVENTORY },
    nextUid: 1,
    stats: { guests: 0, drinks: 0, dances: 0, discovered: [], vips: 0, visits: 0, bestRating: 0, heists: 0, vipAt: 0 },
    story: { intro: false, name: '', done: [], seen: [], tutorial: 0, tips: [], news: '' },
    exterior: newExterior(),
    staff: newStaff(),
    music: newMusic(),
    renovation: 0,
    offline: newOffline(),
    decor: newDecor(),
    kits: { picks: 0, jammer: 0, van: 0, disguise: 0 },
    loot: [],
    kept: [],
    loan: null,
    embargoed: [],
    badCreditUntil: 0,
    reports: [],
    reviews: [],
  };
}

export function phaseOf(state: ClubState): Phase {
  return PHASES[Math.min(Math.max(state.phase, 1), PHASES.length) - 1];
}

export function levelNow(state: ClubState): number {
  return levelOf(state.xp).level;
}

export function footprint(def: ItemDef, rot: Rot): { w: number; d: number } {
  return rot % 2 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

export function cellsOf(def: ItemDef, x: number, y: number, rot: Rot): Array<[number, number]> {
  const { w, d } = footprint(def, rot);
  const cells: Array<[number, number]> = [];
  for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) cells.push([x + dx, y + dy]);
  return cells;
}

/** The entrance: two cells in the middle of the south edge (the edge facing the default camera). */
export function doorCells(phase: Phase): Array<[number, number]> {
  const x = Math.floor(phase.w / 2) - 1;
  return [[x, phase.h - 1], [x + 1, phase.h - 1]];
}

const key = (x: number, y: number) => `${x},${y}`;

export function blockedSet(items: PlacedItem[]): Set<string> {
  const blocked = new Set<string>();
  for (const it of items) {
    const def = BY_ID.get(it.id);
    if (!def || def.layer !== 'object') continue;
    for (const [cx, cy] of cellsOf(def, it.x, it.y, it.rot)) blocked.add(key(cx, cy));
  }
  return blocked;
}

/** Cells reachable on foot from the door through cells not blocked by object-layer items. */
export function reachableCells(items: PlacedItem[], phase: Phase): Set<string> {
  const blocked = blockedSet(items);
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [];
  for (const [x, y] of doorCells(phase)) {
    if (!blocked.has(key(x, y))) {
      seen.add(key(x, y));
      queue.push([x, y]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= phase.w || ny >= phase.h) continue;
      const k = key(nx, ny);
      if (blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function hasAccess(it: PlacedItem, def: ItemDef, reach: Set<string>): boolean {
  const own = new Set(cellsOf(def, it.x, it.y, it.rot).map(([x, y]) => key(x, y)));
  for (const [cx, cy] of cellsOf(def, it.x, it.y, it.rot)) {
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      const k = key(nx, ny);
      if (!own.has(k) && reach.has(k)) return true;
    }
  }
  return false;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

export function validatePlacement(
  state: ClubState,
  def: ItemDef,
  x: number,
  y: number,
  rot: Rot,
  ignoreUid?: string,
): Check {
  const phase = phaseOf(state);
  const cells = cellsOf(def, x, y, rot);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cy < 0 || cx >= phase.w || cy >= phase.h) return { ok: false, reason: 'Fuera del local' };
  }

  const others = state.items.filter((i) => i.uid !== ignoreUid);
  const mine = new Set(cells.map(([cx, cy]) => key(cx, cy)));
  for (const it of others) {
    const od = BY_ID.get(it.id);
    if (!od || od.layer !== def.layer) continue;
    for (const [cx, cy] of cellsOf(od, it.x, it.y, it.rot)) {
      if (mine.has(key(cx, cy))) return { ok: false, reason: 'Ese espacio está ocupado' };
    }
  }

  if (def.max !== undefined && others.filter((i) => i.id === def.id).length >= def.max) {
    return { ok: false, reason: `Solo puedes tener ${def.max}` };
  }

  if (def.layer === 'object') {
    for (const [dx, dy] of doorCells(phase)) {
      if (mine.has(key(dx, dy))) return { ok: false, reason: 'No puedes tapar la entrada' };
    }
    const objects = others.filter((i) => BY_ID.get(i.id)?.layer === 'object').length;
    if (objects >= phase.maxObjects) return { ok: false, reason: 'Llegaste al límite de objetos de esta fase' };

    const candidate: PlacedItem = { uid: '__candidate__', id: def.id, x, y, rot };
    const all = [...others, candidate];
    const reach = reachableCells(all, phase);
    for (const it of all) {
      const d = BY_ID.get(it.id);
      if (d?.needsAccess && !hasAccess(it, d, reach)) return { ok: false, reason: 'Bloquearías el paso' };
    }
  }
  return { ok: true };
}

export interface Result {
  state: ClubState;
  error?: string;
}

export function owned(state: ClubState, id: string): number {
  return state.inventory[id] ?? 0;
}

function withInventory(state: ClubState, id: string, delta: number): Record<string, number> {
  const inv = { ...state.inventory };
  const n = (inv[id] ?? 0) + delta;
  if (n > 0) inv[id] = n;
  else delete inv[id];
  return inv;
}

/** Add XP and move the building to the phase the new level unlocks (phases never go backwards on their own). */
export function addXp(state: ClubState, amount: number): ClubState {
  if (amount <= 0) return state;
  const xp = state.xp + amount;
  // the level only OPENS the next building (see expansion.ts): the phase changes when the player pays for the works
  return { ...state, xp };
}

/** Buy into the inventory. The first time you buy an object you also get discovery XP. */
export function buyItem(state: ClubState, defId: string, qty = 1): Result {
  const def = BY_ID.get(defId);
  if (!def) return { state, error: 'Objeto desconocido' };
  if (levelNow(state) < def.unlockLevel) return { state, error: `Se desbloquea en el nivel ${def.unlockLevel}` };
  if (state.coins < def.price * qty) return { state, error: 'No te alcanzan las monedas' };
  let next: ClubState = {
    ...state,
    coins: state.coins - def.price * qty,
    inventory: withInventory(state, defId, qty),
  };
  if (!next.stats.discovered.includes(defId)) {
    next = { ...next, stats: { ...next.stats, discovered: [...next.stats.discovered, defId] } };
    next = addXp(next, Math.max(1, Math.ceil(def.price / XP.discoveryPer)));
  }
  return { state: next };
}

export type PlaceMode = 'buy' | 'inventory' | 'free';

/**
 * Put an object in the room.
 *  - 'inventory': consumes one from the inventory
 *  - 'buy': buys it and places it in one go (uses an owned copy first, if there is one)
 *  - 'free': placing something already in the room (moving it): no cost
 */
export function placeItem(state: ClubState, defId: string, x: number, y: number, rot: Rot, mode: PlaceMode = 'buy'): Result {
  const def = BY_ID.get(defId);
  if (!def) return { state, error: 'Objeto desconocido' };
  const check = validatePlacement(state, def, x, y, rot);
  if (!check.ok) return { state, error: check.reason };

  let next = state;
  if (mode === 'inventory' || (mode === 'buy' && owned(state, defId) > 0)) {
    if (owned(state, defId) < 1) return { state, error: 'No tienes ese objeto en el inventario' };
    next = { ...next, inventory: withInventory(next, defId, -1) };
  } else if (mode === 'buy') {
    const bought = buyItem(next, defId);
    if (bought.error) return { state, error: bought.error };
    next = { ...bought.state, inventory: withInventory(bought.state, defId, -1) };
  }
  const item: PlacedItem = { uid: `i${next.nextUid}`, id: def.id, x, y, rot };
  return { state: { ...next, items: [...next.items, item], nextUid: next.nextUid + 1 } };
}

/** A club can open once it has a DJ booth: no booth, no party. */
export function canOpen(state: ClubState): Check {
  if (!state.items.some((i) => BOOTH_IDS.includes(i.id))) return { ok: false, reason: 'Necesitas una cabina DJ para abrir el club' };
  return { ok: true };
}

export function setOpen(state: ClubState, open: boolean): Result {
  if (open) {
    const c = canOpen(state);
    if (!c.ok) return { state, error: c.reason };
  }
  return { state: { ...state, open } };
}

export function sellValue(def: ItemDef, tier: Tier = 1): number {
  return Math.floor(invested(def.price, tier) * SELL_RATIO);
}

export const tierOfItem = (it: { tier?: number }): Tier => clampTier(it.tier);

/** Pay to improve a piece to its next version. */
export function upgradeItem(state: ClubState, uid: string): Result {
  const it = state.items.find((i) => i.uid === uid);
  if (!it) return { state, error: 'No existe' };
  const def = BY_ID.get(it.id);
  if (!def) return { state, error: 'Objeto desconocido' };
  const tier = tierOfItem(it);
  if (tier >= 4) return { state, error: 'Ya es la mejor versión.' };
  if (levelNow(state) < TIER_LEVEL[tier]) return { state, error: `Para la versión ${TIER_NAMES[tier]} necesitas el nivel ${TIER_LEVEL[tier]}.` };
  const cost = upgradeCost(def.price, tier);
  if (state.coins < cost) return { state, error: 'No te alcanzan las monedas.' };
  return { state: { ...state, coins: state.coins - cost, items: state.items.map((i) => (i.uid === uid ? { ...i, tier: tier + 1 } : i)) } };
}

/**
 * Take an object out of the room. A normal piece goes to the inventory (no money changes hands); a stolen one that is
 * still hot goes back to the bag, keeping its version and its heat (the inventory would otherwise clean it for free).
 */
export function stashItem(state: ClubState, uid: string, now = Date.now()): Result {
  const it = state.items.find((i) => i.uid === uid);
  if (!it) return { state, error: 'No existe' };
  const items = state.items.filter((i) => i.uid !== uid);
  if ((it.hot ?? 0) > now) {
    if (state.loot.length >= 20) return { state, error: 'Tu bolsa está llena (20 piezas).' };
    return { state: { ...state, items, loot: [...state.loot, { uid: it.uid, id: it.id, tier: tierOfItem(it), hotUntil: it.hot!, from: -1 }] } };
  }
  // an improved piece is kept with its version: what was paid for the upgrades is not lost
  if (tierOfItem(it) > 1) {
    if (state.kept.length >= MAX_KEPT) return { state, error: `Ya guardaste ${MAX_KEPT} piezas mejoradas: coloca o vende alguna.` };
    return { state: { ...state, items, kept: [...state.kept, { uid: it.uid, id: it.id, tier: tierOfItem(it) }] } };
  }
  return { state: { ...state, items, inventory: withInventory(state, it.id, 1) } };
}

/** Sell a kept (improved) piece for what a piece of that version is worth. */
export function sellKept(state: ClubState, uid: string): Result {
  const k = state.kept.find((x) => x.uid === uid);
  const def = k && BY_ID.get(k.id);
  if (!k || !def) return { state, error: 'No existe' };
  return { state: { ...state, coins: state.coins + sellValue(def, k.tier), kept: state.kept.filter((x) => x.uid !== uid) } };
}

// ---- groups: moving, stashing and selling many pieces at once (a whole dance floor) ------------------------------------------------

/** The pieces whose whole footprint lies inside the rectangle between two cells (any corner order). `floorsOnly`: just the floor tiles. */
export function itemsInRect(state: ClubState, ax: number, ay: number, bx: number, by: number, floorsOnly: boolean): PlacedItem[] {
  const x0 = Math.min(ax, bx);
  const x1 = Math.max(ax, bx);
  const y0 = Math.min(ay, by);
  const y1 = Math.max(ay, by);
  return state.items.filter((it) => {
    const def = BY_ID.get(it.id);
    if (!def || (floorsOnly && def.layer !== 'floor')) return false;
    return cellsOf(def, it.x, it.y, it.rot).every(([cx, cy]) => cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1);
  });
}

/**
 * Move several pieces by the same (dx, dy) in one go. They are put down one after another against everything that stays and
 * the ones already moved, so every rule of placing (walls, the door, the limits, keeping the way free) holds for the whole group.
 * All or nothing: if one does not fit, nothing moves and the reason says which.
 */
export function moveGroup(state: ClubState, uids: readonly string[], dx: number, dy: number): Result {
  const moving = new Set(uids);
  const group = state.items.filter((i) => moving.has(i.uid));
  if (!group.length) return { state, error: 'No hay nada seleccionado.' };
  if (dx === 0 && dy === 0) return { state };
  let acc: ClubState = { ...state, items: state.items.filter((i) => !moving.has(i.uid)) };
  const moved: PlacedItem[] = [];
  for (const it of group) {
    const def = BY_ID.get(it.id);
    if (!def) return { state, error: 'Objeto desconocido' };
    const check = validatePlacement(acc, def, it.x + dx, it.y + dy, it.rot);
    if (!check.ok) return { state, error: check.reason ?? 'No cabe ahí' };
    const next = { ...it, x: it.x + dx, y: it.y + dy };
    moved.push(next);
    acc = { ...acc, items: [...acc.items, next] };
  }
  const byUid = new Map(moved.map((m) => [m.uid, m]));
  return { state: { ...state, items: state.items.map((i) => byUid.get(i.uid) ?? i) } };
}

/** Put several pieces away: basic ones to the inventory, improved ones to the stash, hot ones back to the bag. Returns how many went. */
export function stashGroup(state: ClubState, uids: readonly string[], now = Date.now()): { state: ClubState; done: number; skipped: number; error?: string } {
  let next = state;
  let done = 0;
  let error: string | undefined;
  for (const uid of uids) {
    const r = stashItem(next, uid, now);
    if (r.error) error = r.error;
    else {
      next = r.state;
      done++;
    }
  }
  return { state: next, done, skipped: uids.length - done, error };
}

/** What selling these pieces would pay. */
export function groupValue(state: ClubState, uids: readonly string[]): number {
  const set = new Set(uids);
  return state.items.reduce((sum, i) => {
    const def = set.has(i.uid) ? BY_ID.get(i.id) : undefined;
    return def ? sum + sellValue(def, tierOfItem(i)) : sum;
  }, 0);
}

/** Sell several pieces at once. */
export function sellGroup(state: ClubState, uids: readonly string[]): ClubState {
  let next = state;
  for (const uid of uids) next = removeItem(next, uid).state;
  return next;
}

/** Sell an object from the room. `refund` false is used internally while picking something up to move it. */
export function removeItem(state: ClubState, uid: string, refund = true): Result {
  const it = state.items.find((i) => i.uid === uid);
  if (!it) return { state, error: 'No existe' };
  const def = BY_ID.get(it.id)!;
  return {
    state: {
      ...state,
      coins: state.coins + (refund ? sellValue(def, tierOfItem(it)) : 0),
      items: state.items.filter((i) => i.uid !== uid),
    },
  };
}

export function sellFromInventory(state: ClubState, defId: string): Result {
  const def = BY_ID.get(defId);
  if (!def || owned(state, defId) < 1) return { state, error: 'No tienes ese objeto' };
  return { state: { ...state, coins: state.coins + sellValue(def), inventory: withInventory(state, defId, -1) } };
}

/** Set the building phase directly (developer tool). Objects that no longer fit go to the inventory, not the bin. */
export function setPhase(state: ClubState, phaseId: number): ClubState {
  const phase = PHASES[Math.min(Math.max(phaseId, 1), PHASES.length) - 1];
  let next: ClubState = { ...state, phase: phase.id };
  for (const it of state.items) {
    const def = BY_ID.get(it.id);
    if (!def) continue;
    const without = { ...next, items: next.items.filter((i) => i.uid !== it.uid) };
    if (!validatePlacement(without, def, it.x, it.y, it.rot).ok) {
      next = { ...without, inventory: withInventory(without, it.id, 1) };
    }
  }
  return next;
}

export interface Stats {
  luxury: number;
  seats: number;
  floorTiles: number;
  objects: number;
  capacity: number;
}

export function statsOf(state: ClubState): Stats {
  let luxury = 0;
  let seats = 0;
  let floorTiles = 0;
  let objects = 0;
  for (const it of state.items) {
    const def = BY_ID.get(it.id);
    if (!def) continue;
    luxury += def.luxury * TIER_LUXURY[tierOfItem(it) - 1];
    seats += def.seats ?? 0;
    if (def.layer === 'floor') floorTiles += 1;
    else objects += 1;
  }
  luxury += decorLuxury(state.decor);
  return { luxury: Math.round(luxury * (1 + 0.12 * (state.renovation ?? 0))), seats, floorTiles, objects, capacity: seats + floorTiles };
}

/** The sound system, 1 (basement) to 4 (studio): the average version of the speakers and the DJ booth. 0 when there is none. */
export function soundSystem(state: ClubState): number {
  return soundQuality(state.items.filter((i) => i.id === 'speaker' || i.id === 'speaker_tower' || i.id === 'sub_bass' || BOOTH_IDS.includes(i.id)).map(tierOfItem));
}

/** Rebuild a saved/imported club, dropping anything the rules reject (never trusts the input). */
/** A loan from a saved game or the network: numbers only, never negative, sensible sizes. */
export function sanitizeLoan(raw: unknown): Loan | null {
  const l = raw as Partial<Loan> | null;
  if (!l || typeof l !== 'object' || typeof l.id !== 'string') return null;
  const n = (v: unknown, max = 1e12) => (Number.isFinite(v) ? Math.min(Math.max(Math.floor(v as number), 0), max) : 0);
  if (!(n(l.owed) > 0)) return null;
  return { id: l.id.slice(0, 40), at: n(l.at, 1e15), principal: n(l.principal), fee: n(l.fee), owed: n(l.owed), installment: n(l.installment), due: n(l.due), cycle: n(l.cycle, 59), arrears: n(l.arrears, 1000), closed: l.closed === true };
}

export function sanitizeClub(raw: unknown): ClubState {
  const r = (raw ?? {}) as Partial<ClubState>;
  const base = newClub();
  const nat = (v: unknown, fb: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v as number)) : fb);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : []);

  const xp = nat(r.xp, 0);
  const phase = Number.isInteger(r.phase) ? Math.min(Math.max(r.phase as number, 1), PHASES.length) : 1;
  let state: ClubState = {
    ...base,
    xp,
    phase,
    coins: nat(r.coins, START_COINS),
    open: !!r.open,
    exterior: sanitizeExterior(r.exterior),
    staff: sanitizeStaff(r.staff),
    music: sanitizeMusic(r.music),
    renovation: sanitizeRenovation(r.renovation),
    offline: sanitizeOffline(r.offline),
    decor: sanitizeDecor(r.decor),
    kits: {
      picks: Math.min(nat(r.kits?.picks, 0), 99),
      jammer: Math.min(nat(r.kits?.jammer, 0), 99),
      van: Math.min(nat(r.kits?.van, 0), 1),
      disguise: Math.min(nat(r.kits?.disguise, 0), 99),
    },
    loan: sanitizeLoan(r.loan),
    embargoed: (Array.isArray(r.embargoed) ? r.embargoed : []).slice(0, 5).filter((k) => k && typeof k.uid === 'string' && typeof k.id === 'string' && BY_ID.has(k.id)).map((k) => ({ uid: k.uid.slice(0, 30), id: k.id, tier: clampTier(k.tier) })),
    badCreditUntil: Number.isFinite(r.badCreditUntil) ? Math.max(0, r.badCreditUntil as number) : 0,
    kept: (Array.isArray(r.kept) ? r.kept : []).slice(0, MAX_KEPT).filter((k) => k && typeof k.uid === 'string' && typeof k.id === 'string' && BY_ID.has(k.id)).map((k) => ({ uid: k.uid.slice(0, 30), id: k.id, tier: clampTier(k.tier) })),
    loot: (Array.isArray(r.loot) ? r.loot : []).slice(0, 20).filter((l) => l && typeof l.uid === 'string' && typeof l.id === 'string' && BY_ID.has(l.id)).map((l) => ({ uid: l.uid.slice(0, 30), id: l.id, tier: clampTier(l.tier), hotUntil: Number.isFinite(l.hotUntil) ? Math.max(0, l.hotUntil) : 0, from: Number.isInteger(l.from) ? l.from : -1 })),
    reports: (Array.isArray(r.reports) ? r.reports : []).slice(0, 12).filter((x) => x && typeof x.id === 'string' && ['robbed', 'loot', 'police', 'income', 'fee', 'jail', 'refund', 'bank'].includes(x.kind)).map((x) => ({
      id: x.id.slice(0, 40), at: nat(x.at, 0), kind: x.kind, by: Number.isInteger(x.by) ? x.by : -1, byName: typeof x.byName === 'string' ? x.byName.slice(0, 20) : '',
      cash: nat(x.cash, 0), pieces: Array.isArray(x.pieces) ? x.pieces.filter((p) => typeof p === 'string').slice(0, 5).map((p) => p.slice(0, 30)) : [], closedUntil: nat(x.closedUntil, 0),
      ...(typeof x.event === 'string' ? { event: x.event.slice(0, 12) } : {}),
    })),
    reviews: (Array.isArray(r.reviews) ? r.reviews : []).slice(0, MAX_REVIEWS).filter((x) => x && typeof x.id === 'string' && typeof x.text === 'string').map((x) => ({
      id: x.id.slice(0, 40), at: nat(x.at, 0), stars: Math.min(5, Math.max(1, Math.round(Number(x.stars) || 3))), text: x.text.slice(0, 160), who: typeof x.who === 'string' ? x.who.slice(0, 24) : 'Un invitado',
      tags: (Array.isArray(x.tags) ? x.tags : []).filter((t): t is Tag => typeof t === 'string').slice(0, 3),
    })),
    inventory: {},
    stats: {
      guests: nat(r.stats?.guests, 0),
      drinks: nat(r.stats?.drinks, 0),
      dances: nat(r.stats?.dances, 0),
      discovered: strs(r.stats?.discovered).filter((id) => BY_ID.has(id)),
      vips: nat(r.stats?.vips, 0),
      visits: nat(r.stats?.visits, 0),
      bestRating: Math.min(nat(r.stats?.bestRating, 0), 100),
      heists: nat(r.stats?.heists, 0),
      vipAt: nat(r.stats?.vipAt, 0),
    },
    story: {
      intro: !!r.story?.intro,
      name: typeof r.story?.name === 'string' ? r.story.name.slice(0, 24) : '',
      done: strs(r.story?.done),
      seen: strs(r.story?.seen),
      tutorial: Number.isInteger(r.story?.tutorial) ? Math.min(Math.max(r.story!.tutorial as number, -1), 99) : 0,
      tips: strs(r.story?.tips).slice(0, 60).map((t) => t.slice(0, 30)),
      news: typeof r.story?.news === 'string' ? r.story.news.slice(0, 30) : '',
    },
  };
  if (r.inventory && typeof r.inventory === 'object') {
    for (const [id, n] of Object.entries(r.inventory)) {
      if (BY_ID.has(id)) state = { ...state, inventory: { ...state.inventory, [id]: Math.min(nat(n, 0), 999) } };
    }
    state = { ...state, inventory: Object.fromEntries(Object.entries(state.inventory).filter(([, n]) => n > 0)) };
  } else if (!r.story?.intro) {
    state = { ...state, inventory: { ...STARTER_INVENTORY } };
  }
  const list = Array.isArray(r.items) ? r.items : [];
  for (const it of list) {
    const p = it as Partial<PlacedItem>;
    const def = typeof p.id === 'string' ? BY_ID.get(p.id) : undefined;
    if (!def || !Number.isInteger(p.x) || !Number.isInteger(p.y)) continue;
    const rot = (([0, 1, 2, 3] as const).includes(p.rot as Rot) ? p.rot : 0) as Rot;
    if (validatePlacement(state, def, p.x as number, p.y as number, rot).ok) {
      state = {
        ...state,
        items: [...state.items, { uid: `i${state.nextUid}`, id: def.id, x: p.x as number, y: p.y as number, rot, ...(p.tier && clampTier(p.tier) > 1 ? { tier: clampTier(p.tier) } : {}), ...(Number.isFinite(p.hot) && (p.hot as number) > 0 ? { hot: p.hot } : {}) }],
        nextUid: state.nextUid + 1,
      };
    }
  }
  return state;
}
