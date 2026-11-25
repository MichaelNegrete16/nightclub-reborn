// The ranking of the city, kept by the server: every thirty seconds it ranks the clubs that are open and recently played, tells each
// online player their position, and keeps each club's crowd factor for the simulations (the player's own door and the server's shadow).

import { buildBoard, factorFor } from '../web/src/core/ranking.ts';
import { statsOf } from '../web/src/core/club.ts';

const RECENT_MS = 3 * 24 * 3600_000;

export class Ranking {
  board = [];
  #factors = new Map();

  /** Rank every club that has a saved game and was played in the last three days. */
  update(world, saves, isOnline, now = Date.now()) {
    const clubs = [];
    for (const [id, p] of world.players) {
      if (now - (p.lastSeen || 0) > RECENT_MS && !isOnline(id)) continue;
      const save = saves.read(id);
      if (!save) continue;
      clubs.push({
        n: p.n, name: p.club.name, rating: p.club.rating, level: p.club.level, open: !!p.club.open, online: isOnline(id),
        luxury: statsOf(save.state).luxury, vips: save.state.stats.vips, stars: starsOf(save.state),
      });
    }
    this.board = buildBoard(clubs);
    this.#factors = new Map(this.board.map((r) => [r.n, factorFor(this.board, r.n)]));
    return this.board;
  }

  /** The share of the city's crowd of this club (by lot number). */
  factorOf(n) {
    return this.#factors.get(n) ?? 1;
  }

  /** What one player is told: their position and the top of the board. */
  viewFor(n) {
    const row = this.board.find((r) => r.n === n);
    const open = this.board.filter((r) => r.open).length;
    return { you: { n, rank: row?.rank ?? 0, of: open, factor: this.factorOf(n) }, board: this.board.slice(0, 15) };
  }
}

function starsOf(state) {
  const r = (state.reviews ?? []).slice(0, 30);
  return r.length ? r.reduce((a, x) => a + x.stars, 0) / r.length : 0;
}
