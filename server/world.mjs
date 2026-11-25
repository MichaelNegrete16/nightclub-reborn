// The city's memory: who owns which lot and what their club looks like. Lots are handed out in a spiral from the
// centre (the same spiral the game uses to draw the city), so players who join one after the other live next door.

import fs from 'node:fs';
import path from 'node:path';
import { spiralCell } from '../web/src/core/world.ts';
import { cleanMail } from '../web/src/core/mail.ts';
import { newCrime, heatNow, isBlackoutNight, RULES } from '../web/src/core/heist.ts';
import { cleanClub, cleanItems, cleanLook, cleanPos, colorFor, validId, RADIUS, PEER_RADIUS } from './protocol.mjs';

export class World {
  /** id -> { n, club, lastSeen } */
  players = new Map();
  /** "i,j" -> id */
  cells = new Map();
  /** lot number -> id */
  byN = new Map();
  /** id -> latest position in the street (not saved: it only matters while they are online) */
  pos = new Map();
  nextLot = 0;
  version = 0;
  #file;
  #timer = null;

  constructor(file) {
    this.#file = file;
    // `file`: a path to a JSON file, or a store with load() and save(obj) (the city database)
    const stored = typeof file === 'object' && file ? file.load() : file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (stored) {
      try {
        const raw = stored;
        for (const [id, p] of Object.entries(raw.players ?? {})) {
          if (!validId(id) || !Number.isInteger(p.n) || p.n < 0) continue;
          this.#add(id, p.n, cleanClub(p.club), Number(p.lastSeen) || 0);
          this.players.get(id).look = cleanLook(p.look);
          this.players.get(id).items = cleanItems(p.items);
          this.players.get(id).crime = { ...newCrime(), ...(p.crime && typeof p.crime === 'object' ? p.crime : {}) };
          this.players.get(id).mail = cleanMail(p.mail);
          this.players.get(id).away = p.away && Number.isFinite(p.away.coins) ? { coins: Math.max(0, p.away.coins), minutes: Math.max(0, Math.floor(p.away.minutes) || 0) } : { coins: 0, minutes: 0 };
        }
        this.nextLot = Math.max(this.nextLot, Number.isInteger(raw.nextLot) ? raw.nextLot : 0);
      } catch (e) {
        console.error('could not read', file, e.message);
      }
    }
  }

  #add(id, n, club, lastSeen) {
    this.players.set(id, { n, club, lastSeen, look: null, items: [], crime: newCrime(), mail: [], away: { coins: 0, minutes: 0 } });
    this.byN.set(n, id);
    const c = spiralCell(n);
    this.cells.set(`${c.i},${c.j}`, id);
    this.nextLot = Math.max(this.nextLot, n + 1);
  }

  /** The player's lot; a new player gets the next free one. */
  join(id, nameHint) {
    let p = this.players.get(id);
    if (!p) {
      this.#add(id, this.nextLot, cleanClub({ name: nameHint }), Date.now());
      p = this.players.get(id);
    }
    p.lastSeen = Date.now();
    this.#changed();
    return p;
  }

  update(id, rawClub) {
    const p = this.players.get(id);
    if (!p) return false;
    p.club = cleanClub(rawClub);
    p.lastSeen = Date.now();
    this.#changed();
    return true;
  }

  setLook(id, raw) {
    const p = this.players.get(id);
    const look = cleanLook(raw);
    if (!p || !look) return;
    p.look = look;
    p.lookV = (p.lookV ?? 0) + 1;
    this.#changed();
  }

  setLayout(id, raw) {
    const p = this.players.get(id);
    if (!p) return;
    p.items = cleanItems(raw);
    this.#changed();
  }

  setPos(id, raw) {
    if (!this.players.has(id)) return;
    this.pos.set(id, { ...cleanPos(raw), v: (this.pos.get(id)?.v ?? 0) + 1 });
  }

  /** A club as a visitor sees it from inside: layout, phase and facade. Null if nobody lives there. */
  visitView(n) {
    const id = this.byN.get(n);
    const p = id && this.players.get(id);
    return p ? { n, name: p.club.name, phase: p.club.phase, ext: p.club.ext, decor: p.club.decor, items: p.items } : null;
  }

  /** Who is moving around near `id`, with offsets in whole cells from the receiver's own lot. */
  peersFor(id, isOnline, visiting = null) {
    const me = this.players.get(id);
    if (!me) return [];
    const home = spiralCell(me.n);
    const out = [];
    for (let di = -PEER_RADIUS; di <= PEER_RADIUS; di++) {
      for (let dj = -PEER_RADIUS; dj <= PEER_RADIUS; dj++) {
        const other = di || dj ? this.cells.get(`${home.i + di},${home.j + dj}`) : id;
        if (!other || other === id || !isOnline(other)) continue;
        const o = this.players.get(other);
        const pos = this.pos.get(other);
        if (!pos || o.crime.detainedUntil > Date.now()) continue; // somebody in prison is not out in the city
        out.push({ n: o.n, di, dj, x: pos.x, z: pos.z, m: pos.m, e: pos.e || undefined, lv: o.lookV ?? 0 });
      }
    }
    // the club being visited, wherever it is: its owner shows up inside it
    if (visiting !== null && !out.some((q) => q.n === visiting)) {
      const other = this.byN.get(visiting);
      const o = other && other !== id && isOnline(other) ? this.players.get(other) : null;
      const pos = o && this.pos.get(other);
      if (o && pos) {
        const c = spiralCell(o.n);
        out.push({ n: o.n, di: c.i - home.i, dj: c.j - home.j, x: pos.x, z: pos.z, m: pos.m, e: pos.e || undefined, lv: o.lookV ?? 0 });
      }
    }
    return out;
  }

  /** Are these two players' lots within `r` lots of each other? (who can hear whom) */
  inRange(idA, idB, r = RADIUS) {
    const a = this.players.get(idA);
    const b = this.players.get(idB);
    if (!a || !b) return false;
    const ca = spiralCell(a.n);
    const cb = spiralCell(b.n);
    return Math.max(Math.abs(ca.i - cb.i), Math.abs(ca.j - cb.j)) <= r;
  }

  /** The crime record of a player (heat, shield, detention...), kept by the server only. */
  crimeOf(id) {
    return this.players.get(id)?.crime ?? null;
  }

  setCrime(id, crime) {
    const p = this.players.get(id);
    if (!p) return;
    p.crime = crime;
    this.#changed();
  }

  /** Who is in prison right now (names, how far they are from getting out, and who they tried to rob). */
  jailed(now = Date.now()) {
    const out = [];
    for (const p of this.players.values()) {
      if (p.crime.detainedUntil > now) out.push({ n: p.n, name: p.club.name, until: p.crime.detainedUntil, chores: p.crime.chores ?? 0, goal: p.crime.choreGoal || RULES.choreGoalSoft, victim: p.jailVictim ?? '', look: p.look ?? null });
    }
    return out.sort((a, b) => a.until - b.until);
  }

  /** What the player's game is told about their crime record (read-only on the client). */
  crimeView(id, now = Date.now()) {
    const c = this.crimeOf(id);
    if (!c) return null;
    // a prison from before the chores existed: the same way out as the others
    if (c.detainedUntil > now && !c.choreGoal) {
      c.choreGoal = RULES.choreGoalSoft;
      c.closedUntil = Math.max(c.closedUntil, c.detainedUntil);
    }
    return { chores: c.chores ?? 0, choreGoal: c.detainedUntil > now ? c.choreGoal ?? 0 : 0, heat: Math.round(heatNow(c, now)), shieldUntil: Math.max(c.shieldUntil, c.guardUntil ?? 0), guardUntil: c.guardUntil ?? 0, detainedUntil: c.detainedUntil, closedUntil: c.closedUntil, blackout: isBlackoutNight(now) };
  }

  /** A letter for a player: it stays until they confirm it. */
  addMail(id, letter) {
    const p = this.players.get(id);
    if (!p) return false;
    p.mail = [...p.mail, ...cleanMail([letter])];
    this.#changed();
    return true;
  }

  pendingMail(id) {
    return this.players.get(id)?.mail ?? [];
  }

  /** The player's game has applied these letters. */
  ackMail(id, ids) {
    const p = this.players.get(id);
    if (!p || !ids.length) return;
    const set = new Set(ids);
    p.mail = p.mail.filter((m) => !set.has(m.id));
    this.#changed();
  }

  lookOf(n) {
    const id = this.byN.get(n);
    return id ? this.players.get(id)?.look ?? null : null;
  }

  touch(id) {
    const p = this.players.get(id);
    if (p) p.lastSeen = Date.now();
    this.#changed();
  }

  /** What `id` sees: its own cell and the clubs in the lots around it (absolute cells; the client works out the offsets). */
  cityFor(id, isOnline) {
    const me = this.players.get(id);
    if (!me) return null;
    const home = spiralCell(me.n);
    const clubs = [];
    for (let di = -RADIUS; di <= RADIUS; di++) {
      for (let dj = -RADIUS; dj <= RADIUS; dj++) {
        if (!di && !dj) continue;
        const other = this.cells.get(`${home.i + di},${home.j + dj}`);
        if (!other) continue;
        const o = this.players.get(other);
        clubs.push({ i: home.i + di, j: home.j + dj, n: o.n, ...o.club, online: isOnline(other), color: colorFor(o.n) });
      }
    }
    return { me: { i: home.i, j: home.j, n: me.n }, clubs };
  }

  #changed() {
    this.version++;
    if (!this.#file || this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.save();
    }, 3000);
  }

  save() {
    if (!this.#file) return;
    const out = { nextLot: this.nextLot, players: Object.fromEntries([...this.players].map(([id, p]) => [id, { n: p.n, club: p.club, lastSeen: p.lastSeen, look: p.look, items: p.items, crime: p.crime, mail: p.mail, away: p.away }])) };
    if (typeof this.#file === 'object') return void this.#file.save(out);
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    const tmp = `${this.#file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, this.#file);
  }
}
