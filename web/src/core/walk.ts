// Walking for the player character: along tiles inside the club, and around the building in the street. Pure logic.

export type Pt = [number, number];

/** Shortest 4-neighbour walk over free cells (the start is not included in the result). Null if there is no way. */
export function gridPath(blocked: ReadonlySet<string>, w: number, h: number, from: Pt, to: Pt): Pt[] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  if (to[0] < 0 || to[1] < 0 || to[0] >= w || to[1] >= h || blocked.has(key(to[0], to[1]))) return null;
  const prev = new Map<string, string>([[key(from[0], from[1]), '']]);
  const q: Pt[] = [from];
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === to[0] && y === to[1]) break;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || blocked.has(key(nx, ny)) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(x, y));
      q.push([nx, ny]);
    }
  }
  if (!prev.has(key(to[0], to[1]))) return null;
  const out: Pt[] = [];
  for (let k = key(to[0], to[1]); k !== key(from[0], from[1]); k = prev.get(k)!) out.push(k.split(',').map(Number) as Pt);
  return out.reverse();
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Does the segment a→b pass through the inside of the rectangle? */
export function crosses(r: Rect, a: Pt, b: Pt): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r.x0], [dx, r.x1 - a[0]], [-dy, a[1] - r.y0], [dy, r.y1 - a[1]]] as const) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/**
 * Points to walk through to get from `from` to `to` without crossing the building. Goes around the corners of the
 * rectangle (grown by `margin`) along the shorter side.
 */
export function routeAround(building: Rect, from: Pt, to: Pt, margin = 0.7): Pt[] {
  const r = { x0: building.x0 - margin, y0: building.y0 - margin, x1: building.x1 + margin, y1: building.y1 + margin };
  if (!crosses(r, from, to)) return [to];
  const corners: Pt[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
  const nodes: Pt[] = [from, ...corners, to];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const best = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  best[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || best[u] === Infinity) break;
    done[u] = true;
    for (let v = 0; v < nodes.length; v++) {
      if (done[v] || crosses(r, nodes[u], nodes[v])) continue;
      const d = best[u] + dist(nodes[u], nodes[v]);
      if (d < best[v]) {
        best[v] = d;
        prev[v] = u;
      }
    }
  }
  const last = nodes.length - 1;
  if (prev[last] < 0) return [to];
  const path: Pt[] = [];
  for (let i = last; i > 0; i = prev[i]) path.push(nodes[i]);
  return path.reverse();
}
