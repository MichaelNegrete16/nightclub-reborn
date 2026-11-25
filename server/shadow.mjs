// The server's shadow clubs: for every player who uploads their game, a simulated copy of that club runs here (the same guest
// simulation the game uses, with an ideal DJ and a careful doorman). What it earns is what the ledger lets the player's game
// claim to have earned. Players who stop uploading stop being simulated after a while, but their measured rate is remembered.

import { ShadowClub } from '../web/src/core/shadow.ts';

const IDLE_MS = 15 * 60_000;
const hash = (s) => [...s].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);

export class Shadows {
  #map = new Map();

  get size() {
    return this.#map.size;
  }

  /** Start or update the shadow of a player from the game the server just stored. */
  track(id, state, now = Date.now(), rank = 1) {
    let e = this.#map.get(id);
    if (!e) {
      const club = new ShadowClub(hash(id) >>> 0);
      club.sync(state, rank);
      club.run(240, false); // the crowd builds up before anything is counted
      e = { club, touched: now, active: true, rate: 0 };
      this.#map.set(id, e);
    } else {
      if (!e.active) {
        e.club.sync(state, rank);
        e.club.run(240, false);
        e.active = true;
      }
      e.club.sync(state, rank);
    }
    e.touched = now;
  }

  /** Gross coins per minute the shadow of this club earned while open (0 if unknown). */
  rateOf(id) {
    const e = this.#map.get(id);
    return e ? e.club.openRate || e.rate || 0 : 0;
  }

  /** What the shadow earned since the last upload (null if there is no shadow for this player). */
  take(id) {
    const e = this.#map.get(id);
    if (!e) return null;
    const m = e.club.take();
    if (m.rate > 0) e.rate = m.rate;
    return { ...m, rate: m.rate || e.rate };
  }

  /** Let `seconds` pass for every active shadow. */
  tick(seconds, now = Date.now()) {
    for (const e of this.#map.values()) {
      if (!e.active) continue;
      if (now - e.touched > IDLE_MS) {
        e.active = false; // stops running; the rate stays
        continue;
      }
      e.club.run(seconds);
    }
  }
}
