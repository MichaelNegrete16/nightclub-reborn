import { newClub, sanitizeClub, type ClubState } from '../core/club';
import { levelOf } from '../core/progression';
import { guestId, httpBase } from './client';

export interface CloudMeta {
  level: number;
  phase: number;
  coins: number;
  xp: number;
}

export interface CloudInfo {
  at: number;
  meta: CloudMeta;
}

/** Does this game look brand new (nothing done yet)? Then a saved one on the server is probably what the player wants back. */
export function looksFresh(s: ClubState): boolean {
  return s.xp === 0 && s.items.length === 0 && s.stats.guests === 0 && !s.story.intro;
}

/**
 * The copy of the player's game on the city server. The browser stays the owner of the game: this only uploads a copy
 * (so nothing is lost if the browser's data is cleared or the player changes computer) and brings it back when asked.
 * It NEVER replaces what is in the browser by itself.
 */
export class Cloud {
  info: CloudInfo | null = null;
  /** why the last upload did not happen, for the menu */
  problem = '';
  private last = '';
  private busy = false;
  private id: string;
  /** the player started over on purpose: the next upload may replace a bigger game */
  forceNext = false;

  constructor(private get: () => ClubState) {
    this.id = guestId();
  }

  private url(path: string, q = ''): string | null {
    const base = httpBase();
    return base ? `${base}${path}?pid=${this.id}${q}` : null;
  }

  /** Upload the game if it changed since the last upload. */
  async sync(force = false, ack: string[] = []): Promise<boolean> {
    const url = this.url('/save', `${this.forceNext ? '&force=1' : ''}${ack.length ? `&ack=${ack.join(',')}` : ''}`);
    if (!url || this.busy) return false;
    const s = this.get();
    const body = JSON.stringify(s);
    if (!force && body === this.last) return false;
    this.busy = true;
    try {
      const r = await fetch(url, { method: 'POST', body });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; meta?: CloudMeta; at?: number };
      if (r.ok && j.ok && j.meta) {
        this.last = body;
        this.forceNext = false;
        this.problem = '';
        this.info = { at: j.at ?? Date.now(), meta: j.meta };
        return true;
      }
      if (r.status === 429) return false; // too soon: try again at the next tick
      this.problem = j.error ?? 'No se pudo guardar en la nube.';
      if (r.status === 409 && j.meta) this.info = { at: this.info?.at ?? 0, meta: j.meta };
    } catch {
      this.problem = 'Sin conexión con el servidor: se guardará cuando vuelva.';
    } finally {
      this.busy = false;
    }
    return false;
  }

  /** What the server has saved for a code (this player's own by default), without the game itself. */
  async peek(code = this.id): Promise<CloudInfo | null> {
    const base = httpBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/save?pid=${encodeURIComponent(code)}&meta=1`);
      if (!r.ok) return null;
      return (await r.json()) as CloudInfo;
    } catch {
      return null;
    }
  }

  /** The saved game for a code, cleaned. Null if there is none. */
  async fetchGame(code = this.id): Promise<{ state: ClubState; meta: CloudMeta } | null> {
    const base = httpBase();
    if (!base) return null;
    try {
      const r = await fetch(`${base}/save?pid=${encodeURIComponent(code)}`);
      if (!r.ok) return null;
      const j = (await r.json()) as { state: unknown; meta: CloudMeta };
      return { state: sanitizeClub(j.state), meta: j.meta };
    } catch {
      return null;
    }
  }

  get code(): string {
    return this.id;
  }
}

export const describe = (m: CloudMeta): string => `nivel ${levelOf(m.xp).level}, ${m.coins.toLocaleString('es-CO')} monedas`;
export { newClub };
