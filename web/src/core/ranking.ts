// The city's ranking of clubs. Every open club gets a fame score from what makes a club good (its atmosphere, its luxury, its
// level and the stars it has had at the door), and the crowd of the city follows the ranking: the better the position, the more
// people arrive at the door; the worse, the more of them go to another club. Pure logic, used by the server (which holds the
// board) and by the game (which shows it and applies the factor to its own door).

export interface ClubFacts {
  n: number;
  name: string;
  rating: number;
  luxury: number;
  level: number;
  vips: number;
  open: boolean;
  online: boolean;
  /** average stars of the guests' reviews (0 when there are none) */
  stars?: number;
}

export interface BoardRow {
  n: number;
  name: string;
  score: number;
  level: number;
  rating: number;
  open: boolean;
  online: boolean;
  /** position among the open clubs (1 = the best); 0 for a closed club, which does not compete */
  rank: number;
}

/** A club's fame: atmosphere counts the most, then lasting things (level, luxury, the stars that came) and the reviews. */
export function fameScore(c: Pick<ClubFacts, 'rating' | 'luxury' | 'level' | 'vips' | 'open' | 'stars'>): number {
  if (!c.open) return 0;
  const s = c.rating + Math.min(c.luxury, 2000) * 0.05 + c.level * 1.5 + Math.min(c.vips, 60) * 0.4 + (c.stars ?? 0) * 3;
  return Math.round(s * 10) / 10;
}

/** The share of the city's crowd a club gets, from its position: 1.3 for the best, 0.75 for the last, 1 when it competes alone. */
export function rankFactor(rank: number, total: number): number {
  if (rank <= 0 || total <= 1) return 1;
  const t = Math.min(1, Math.max(0, (rank - 1) / (total - 1)));
  return Math.round((1.3 - 0.55 * t) * 1000) / 1000;
}

/** The whole board: open clubs by fame, then the closed ones (they do not compete). */
export function buildBoard(clubs: ClubFacts[]): BoardRow[] {
  const rows = clubs.map((c) => ({ n: c.n, name: c.name, score: fameScore(c), level: c.level, rating: c.rating, open: c.open, online: c.online, rank: 0 }));
  const open = rows.filter((r) => r.open).sort((a, b) => b.score - a.score || b.level - a.level || a.n - b.n);
  open.forEach((r, i) => (r.rank = i + 1));
  const closed = rows.filter((r) => !r.open).sort((a, b) => b.level - a.level || a.n - b.n);
  return [...open, ...closed];
}

export function factorFor(board: BoardRow[], n: number): number {
  const total = board.filter((r) => r.open).length;
  const row = board.find((r) => r.n === n);
  return row ? rankFactor(row.rank, total) : 1;
}
