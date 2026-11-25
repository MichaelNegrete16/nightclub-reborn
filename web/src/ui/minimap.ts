import { CELL, LOT, RADIUS_CELLS, lotOrigin } from '../core/world';
import type { ClubView } from '../render/club';
import { el } from './dom';

const SIZE = 190;

/** A small map of the city in a corner: every lot, the clubs (green = open), the other players and me. Click to enlarge. */
export function mountMinimap(host: HTMLElement, club: ClubView): void {
  const box = el('div', 'minimap');
  const cv = document.createElement('canvas');
  cv.width = SIZE * 2;
  cv.height = SIZE * 2;
  box.append(cv, el('span', 'minimap-title', 'Ciudad'));
  box.title = 'Mapa de la ciudad (clic para agrandar)';
  box.addEventListener('click', () => box.classList.toggle('big'));
  host.append(box);
  const g = cv.getContext('2d')!;
  const o = lotOrigin({ i: -RADIUS_CELLS, j: -RADIUS_CELLS });
  const span = CELL.w * (2 * RADIUS_CELLS + 1);
  const px = (x: number) => ((x - o.x) / span) * cv.width;
  const pz = (z: number) => ((z - o.z) / span) * cv.height;

  const dot = (x: number, z: number, r: number, color: string, label?: string) => {
    g.fillStyle = color;
    g.strokeStyle = '#0b1030';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(px(x), pz(z), r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (label) {
      g.font = '700 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText(label.slice(0, 9), px(x), pz(z) - r - 5);
    }
  };

  const draw = () => {
    if (document.hidden) return;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#2b3150';
    g.fillRect(0, 0, cv.width, cv.height);
    const clubs = new Map(club.neighbors.filter((n) => n.kind === 'club').map((n) => [`${n.cell.i},${n.cell.j}`, n]));
    for (let i = -RADIUS_CELLS; i <= RADIUS_CELLS; i++) {
      for (let j = -RADIUS_CELLS; j <= RADIUS_CELLS; j++) {
        const lo = lotOrigin({ i, j });
        const c = clubs.get(`${i},${j}`);
        g.fillStyle = i === 0 && j === 0 ? '#3b5a8a' : c && c.kind === 'club' ? (c.open ? '#1f7a4d' : '#6b2b3a') : '#454c6e';
        g.fillRect(px(lo.x) + 2, pz(lo.z) + 2, (LOT.w / span) * cv.width - 4, (LOT.h / span) * cv.height - 4);
        if (c && c.kind === 'club' && c.online) {
          g.fillStyle = '#35f08a';
          g.fillRect(px(lo.x) + 6, pz(lo.z) + 6, 10, 10);
        }
      }
    }
    for (const n of club.neighbors) {
      if (n.kind !== 'club') continue;
      const lo = lotOrigin(n.cell);
      g.font = '700 20px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#ffffffcc';
      g.fillText(n.name.replace(/^CLUB /, '').slice(0, 9), px(lo.x + LOT.w / 2), pz(lo.z + LOT.h / 2));
    }
    for (const [n, a] of club.remote.actors) {
      const name = club.remote.names.get(n) ?? '';
      dot(a.actor.x, a.actor.z, a.inside ? 7 : 11, a.inside ? '#8fb7ff' : '#ffd23f', a.inside ? undefined : name);
    }
    dot(club.player.x, club.player.z, 12, '#7fe9ff', 'Yo');
    box.classList.toggle('offline', club.net.status !== 'online');
  };
  draw();
  window.setInterval(draw, 500);
}
