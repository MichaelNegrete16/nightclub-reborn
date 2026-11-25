import type { CharacterConfig } from '../core/character';
import type { PlacedItem } from '../core/club';
import type { Genre } from '../core/music';
import { cleanMail, type Mail } from '../core/mail';
import { RADIUS_CELLS, type Cell, type FacadeFace, type Neighbor } from '../core/world';

/** One club in the city, as the server describes it. Cells are absolute (the server's spiral). */
export interface PublicClub {
  music: MusicFace;
  n: number;
  ext: FacadeFace;
  i: number;
  j: number;
  name: string;
  phase: number;
  level: number;
  rating: number;
  open: boolean;
  guests: number;
  online: boolean;
  color: string;
}

/** The player's record with the law, as the server keeps it. */
export interface CrimeView {
  heat: number;
  shieldUntil: number;
  detainedUntil: number;
  closedUntil: number;
  /** prison: chores done and needed to get out (goal 0: not in prison) */
  chores: number;
  choreGoal: number;
  /** the anti-theft protector bought, until when (0: none) */
  guardUntil: number;
  /** it is Blackout Night right now */
  blackout: boolean;
}

export interface ScoutReply {
  n: number;
  ok: boolean;
  error?: string;
  target?: { n: number; name: string; level: number; open: boolean; guests: number; guards: number; alarm: boolean; crowded: boolean; cash: 'poca' | 'media' | 'mucha'; pieces: Array<{ uid: string; id: string; tier: number; value: number; heavy: boolean }> };
  denied?: { reason: string; until?: number } | null;
  kits?: Record<string, number>;
  heat?: number;
  odds?: { bare: number; kitted: number };
}

export interface HeistReply {
  n: number;
  ok: boolean;
  error?: string;
  result?: { kind: 'full' | 'partial' | 'fail' | 'denied'; reason?: string; until?: number; cash?: number; pieces?: Array<{ id: string; tier: number }>; victim?: string; heat?: number; detainedUntil?: number; jail?: { goal: number; fine: number; until: number; victim?: string } | null };
}

export interface CityMsg {
  me: { i: number; j: number; n: number };
  clubs: PublicClub[];
  online: number;
}

export type NetStatus = 'off' | 'connecting' | 'online';

/** What the server needs to know about my club. */
export interface ClubFace {
  name: string;
  phase: number;
  level: number;
  rating: number;
  open: boolean;
  guests: number;
  ext: FacadeFace;
  decor: Record<string, string>;
  music: MusicFace;
}

/** What a club is playing (for the neighbours to hear). */
export interface MusicFace {
  playing: boolean;
  title: string;
  genre: Genre;
  bpm: number;
  builtin: boolean;
  /** what exactly plays (empty for a file from their computer), and when it started on the city's clock */
  source: '' | 'builtin' | 'youtube' | 'spotify' | 'url' | 'cloud' | 'song';
  ref: string;
  startedAt: number;
}

/** Someone walking nearby: offsets in whole lots from my own, position inside their lot, and (once) their look. */
export interface Peer {
  n: number;
  di: number;
  dj: number;
  x: number;
  z: number;
  /** 1 = inside their club */
  m: number;
  /** the dance they are doing, if any */
  e?: string;
  look?: CharacterConfig | null;
}

/** The city's ranking as the server reports it to me: my position, how much of the city's crowd I get, and the top of the board. */
export interface RankMsg {
  you: { n: number; rank: number; of: number; factor: number };
  board: import('../core/ranking').BoardRow[];
  /** who is in prison right now */
  jailed: Array<{ n: number; name: string; until: number; chores: number; goal: number; victim: string; look?: CharacterConfig | null }>;
}

/** A club seen from inside: what a visitor needs to draw it. */
export interface VisitView {
  n: number;
  name: string;
  phase: number;
  ext: FacadeFace;
  /** the owner's interior finishes, one id per group */
  decor?: Record<string, string>;
  items: Array<Pick<PlacedItem, 'id' | 'x' | 'y' | 'rot' | 'tier'>>;
}

/**
 * The city the server describes, as the cells around me in the shape the renderer already draws: a club where a player
 * lives, a free lot ("se vende") everywhere else.
 */
export function neighborsFrom(city: CityMsg): Neighbor[] {
  const byCell = new Map(city.clubs.map((c) => [`${c.i},${c.j}`, c]));
  const out: Neighbor[] = [];
  for (let di = -RADIUS_CELLS; di <= RADIUS_CELLS; di++) {
    for (let dj = -RADIUS_CELLS; dj <= RADIUS_CELLS; dj++) {
      if (!di && !dj) continue;
      const cell: Cell = { i: di, j: dj };
      const c = byCell.get(`${city.me.i + di},${city.me.j + dj}`);
      if (c) out.push({ kind: 'club', cell, name: `CLUB ${c.name}`.toUpperCase().slice(0, 18), phase: c.phase, color: c.color, open: c.open, online: c.online, level: c.level, rating: c.rating, n: c.n, ext: c.ext, guests: c.guests, music: c.music });
      else out.push({ kind: 'vacant', cell });
    }
  }
  return out;
}

const GUEST_KEY = 'nc.guest.v1';

/** A random id for this browser: it is how the server knows which lot is yours. No account needed yet. */
export function guestId(): string {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    // randomUUID only exists on secure pages (https or localhost); getRandomValues works everywhere
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

/** The address of the city server for plain requests (uploads, songs): the same machine, http(s) instead of ws(s). */
export function httpBase(): string | null {
  const u = serverUrl();
  return u ? u.replace(/^ws/, 'http').replace(/\/$/, '') : null;
}

/** Where the city server lives: `?server=ws://host:port` (or `?server=off`), else the same machine on port 8787. */
export function serverUrl(): string | null {
  const q = new URLSearchParams(location.search).get('server');
  if (q === 'off') return null;
  if (q) {
    localStorage.setItem('nc.server', q);
    return q;
  }
  const saved = localStorage.getItem('nc.server');
  if (saved) return saved === 'off' ? null : saved;
  // an https page cannot open an insecure socket: single-player until a secure server is configured
  if (location.protocol === 'https:') return null;
  return `ws://${location.hostname || 'localhost'}:8787`;
}

/** Connection to the city server. If it is not there, the game simply stays single-player and keeps trying. */
export class Online {
  status: NetStatus = 'off';
  online = 0;
  onCity: (city: CityMsg) => void = () => {};
  onStatus: (status: NetStatus) => void = () => {};
  onPeers: (peers: Peer[]) => void = () => {};
  /** what happened to my club while I was away: apply it, then confirm */
  onMail: (mail: Mail[]) => void = () => {};
  /** answers to my scouting, robbery and laundering requests */
  onScout: (r: ScoutReply) => void = () => {};
  onHeist: (r: HeistReply) => void = () => {};
  onLaunder: (r: { uid: string; ok: boolean; price?: number; error?: string }) => void = () => {};
  /** my crime record, kept by the server (read-only here) */
  onCrime: (c: CrimeView) => void = () => {};
  /** somebody nearby said something */
  onChat: (m: { n: number; name: string; text: string }) => void = () => {};
  onVisit: (club: VisitView) => void = () => {};
  onRank: (r: RankMsg) => void = () => {};
  onBust: (b: { name: string; victim: string; goal: number; chores: number; ongoing: boolean }) => void = () => {};
  onFreed: (name: string) => void = () => {};
  onChore: (r: { ok: boolean; error?: string; done: number; goal: number; released: boolean }) => void = () => {};
  onGuard: (r: { ok: boolean; error?: string; price: number; until: number }) => void = () => {};
  /** the city's clock: milliseconds since 1970, from the server */
  onClock: (serverNow: number, build: string) => void = () => {};

  private ws: WebSocket | null = null;
  private retry = 0;
  private timer = 0;
  private stopped = false;
  private face: ClubFace | null = null;
  private lastSent = '';
  private lastAt = 0;
  private look: CharacterConfig | null = null;
  private lastLook = '';
  private layout: Array<Pick<PlacedItem, 'id' | 'x' | 'y' | 'rot' | 'tier'>> | null = null;
  private lastLayout = '';
  private lastLayoutAt = 0;
  private pos: { x: number; z: number; m: number; e?: string } = { x: 0, z: 0, m: 0 };
  private away = false;
  private lastPos = '';
  private lastPosAt = 0;

  constructor(private url: string, private id: string, private name: () => string) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    this.ws?.close();
    this.set('off');
  }

  private set(s: NetStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }

  private connect(): void {
    this.set('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.again();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'hello', id: this.id, name: this.name() }));
      if (this.away) ws.send(JSON.stringify({ t: 'away', away: true })); // opened while hidden
      this.lastSent = '';
      this.lastLook = '';
      this.lastLayout = '';
      this.flush();
      this.flushExtras();
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.t === 'peers') this.onPeers(m.p as Peer[]);
        else if (m.t === 'mail') this.onMail(cleanMail(m.mail));
        else if (m.t === 'crime') this.onCrime({ heat: Number(m.heat) || 0, shieldUntil: Number(m.shieldUntil) || 0, detainedUntil: Number(m.detainedUntil) || 0, closedUntil: Number(m.closedUntil) || 0, chores: Number(m.chores) || 0, choreGoal: Number(m.choreGoal) || 0, guardUntil: Number(m.guardUntil) || 0, blackout: m.blackout === true });
        else if (m.t === 'scout') this.onScout(m as ScoutReply);
        else if (m.t === 'heist') this.onHeist(m as HeistReply);
        else if (m.t === 'launder') this.onLaunder(m);
        else if (m.t === 'chat') this.onChat({ n: Number(m.n), name: String(m.name ?? ''), text: String(m.text ?? '').slice(0, 100) });
        else if (m.t === 'guard') this.onGuard({ ok: m.ok === true, error: typeof m.error === 'string' ? m.error : undefined, price: Number(m.price) || 0, until: Number(m.until) || 0 });
        else if (m.t === 'rank') this.onRank({ ...(m as unknown as RankMsg), jailed: Array.isArray(m.jailed) ? (m.jailed as RankMsg['jailed']) : [] });
        else if (m.t === 'bust') this.onBust({ name: String(m.name ?? '').slice(0, 24), victim: String(m.victim ?? '').slice(0, 24), goal: Number(m.goal) || 0, chores: Number(m.chores) || 0, ongoing: m.ongoing === true });
        else if (m.t === 'freed') this.onFreed(String(m.name ?? '').slice(0, 24));
        else if (m.t === 'chore') this.onChore({ ok: m.ok === true, error: typeof m.error === 'string' ? m.error : undefined, done: Number(m.done) || 0, goal: Number(m.goal) || 0, released: m.released === true });
        else if (m.t === 'club') this.onVisit(m as VisitView);
        else if (m.t === 'clock') this.onClock(Number(m.now), String(m.build ?? ''));
        else if (m.t === 'city') {
          this.online = m.online ?? 0;
          this.set('online');
          this.onCity(m as CityMsg);
        }
      } catch {
        /* ignore a broken message */
      }
    };
    ws.onclose = (e) => {
      this.ws = null;
      this.set('off');
      if (e.code !== 4000) this.again(); // 4000: this player opened the game somewhere else
    };
    ws.onerror = () => ws.close();
  }

  private again(): void {
    if (this.stopped) return;
    this.retry = Math.min(this.retry + 1, 6);
    this.timer = window.setTimeout(() => this.connect(), 1000 * 2 ** this.retry);
  }

  /** Tell the server how my club looks now (it only sends when something changed, and not too often). */
  publish(face: ClubFace): void {
    this.face = face;
    this.flush();
  }

  private flush(): void {
    if (!this.face || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg = JSON.stringify({ t: 'club', club: this.face });
    const now = Date.now();
    if (msg === this.lastSent || now - this.lastAt < 1100) return;
    this.lastSent = msg;
    this.lastAt = now;
    this.ws.send(msg);
  }

  /** Call every few seconds so a change made right after another one still gets sent. */
  tick(): void {
    this.flush();
    this.flushExtras();
  }

  setLook(look: CharacterConfig): void {
    this.look = look;
    this.flushExtras();
  }

  setLayout(items: Array<Pick<PlacedItem, 'id' | 'x' | 'y' | 'rot' | 'tier'>>): void {
    this.layout = items;
    this.flushExtras();
  }

  /** Where I am (in my own lot's coordinates); sent several times a second while moving. */
  setPos(x: number, z: number, inside: boolean, emote: string | null = null): void {
    this.pos = { x, z, m: inside ? 1 : 0, e: emote ?? '' };
    this.flushExtras();
  }

  /** One chore done in prison (the server counts them, at most one every few seconds). */
  doChore(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'chore' }));
  }

  /** Buy the anti-theft protector for 2, 6, 12 or 24 hours (the server charges the coins and answers). */
  buyGuard(hours: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'guard', hours }));
  }

  /** The game went to the background (true) or came back (false): while it is away the server runs the club. */
  setAway(away: boolean): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'away', away }));
    this.away = away;
  }

  scout(n: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'scout', n }));
  }

  heist(n: number, want: string | null, kits: string[], skill = 0.5): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'heist', n, want, kits, skill }));
  }

  launder(uid: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'launder', uid }));
  }

  say(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'chat', text }));
  }

  /** I stopped visiting. */
  leave(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'leave' }));
  }

  /** Ask the server for the inside of the club in lot `n`. */
  visit(n: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'visit', n }));
  }

  private flushExtras(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (this.look) {
      const s = JSON.stringify(this.look);
      if (s !== this.lastLook) {
        this.lastLook = s;
        ws.send(JSON.stringify({ t: 'look', look: this.look }));
      }
    }
    if (this.layout && now - this.lastLayoutAt > 3200) {
      const s = JSON.stringify(this.layout);
      if (s !== this.lastLayout) {
        this.lastLayout = s;
        this.lastLayoutAt = now;
        ws.send(JSON.stringify({ t: 'layout', items: this.layout }));
      }
    }
    const p = JSON.stringify(this.pos);
    if (p !== this.lastPos && now - this.lastPosAt > 220) {
      this.lastPos = p;
      this.lastPosAt = now;
      ws.send(JSON.stringify({ t: 'pos', ...this.pos }));
    }
  }
}
