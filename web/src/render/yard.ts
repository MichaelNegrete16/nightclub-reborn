import * as THREE from 'three';
import { PARCEL, PHASES, YARD } from '../core/club';
import { EXPANSION_PRICE } from '../core/expansion';
import { PHASE_LEVELS } from '../core/progression';
import { canvasTexture } from './comic';
import { toon } from './toon';

/**
 * The part of the lot the club has not grown into yet: bare ground inside a low hedge, and a billboard saying what the next
 * expansion is, at which level it opens and what it costs. It shrinks as the building grows.
 */
export function buildYard(phaseId: number): THREE.Group {
const r = new THREE.Group();
  const last = PHASES[PHASES.length - 1];
  const next = PHASES[phaseId]; // undefined in the last phase
  const flatStd = (w: number, d: number, x: number, z: number, y: number, color: number) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.97, metalness: 0 });
    mat.userData.outlineParameters = { visible: false };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    r.add(m);
  };
  // the east side of the lot is wider than the biggest building: the terrace goes there
  const east = PARCEL.w - YARD - 1;
  flatStd(east, last.h, east / 2, last.h / 2, -0.055, 0x8c846e); // the reserved ground
  if (next) flatStd(next.w, next.h, next.w / 2, next.h / 2, -0.05, 0x9c9378); // the next phase: freshly cleared

  // a low clipped hedge around the lot (instead of a fence), with a gap in front of the door
  const hedge = toon(0x2f7d4a);
  const hedgeTop = toon(0x3c9a5c, { outline: false });
  const gate0 = Math.floor(PHASES[phaseId - 1].w / 2) - 3.5;
  const gate1 = gate0 + 7;
  const runs: Array<[number, number, number, number]> = [
    [0, last.h, gate0, last.h],
    [gate1, last.h, east, last.h],
    [east, 0, east, last.h],
  ];
  for (const [x1, z1, x2, z2] of runs) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.4) continue;
    const alongX = z1 === z2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.7, 0.75, alongX ? 0.7 : len), hedge);
    body.position.set((x1 + x2) / 2, 0.375, (z1 + z2) / 2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len - 0.1 : 0.6, 0.08, alongX ? 0.6 : len - 0.1), hedgeTop);
    top.position.set((x1 + x2) / 2, 0.79, (z1 + z2) / 2);
    r.add(body, top);
  }

  if (next) {
    // a billboard on the lot: where the club grows next, at which level and for how much
    const W = 5.4;
    const H = 1.9;
    const board = canvasTexture(1024, Math.round((1024 * H) / W), (g) => {
      const cw = g.canvas.width;
      const ch = g.canvas.height;
      const bg = g.createLinearGradient(0, 0, 0, ch);
      bg.addColorStop(0, '#241a44');
      bg.addColorStop(1, '#150d26');
      g.fillStyle = bg;
      g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#f5b91d';
      g.fillRect(0, 0, cw, 70);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // each line shrinks until it fits the board
      const fitLine = (text: string, px: number, y: number, color: string) => {
        const font = (sz: number) => `900 ${sz}px "Arial Black", Impact, sans-serif`;
        g.font = font(px);
        const tw = g.measureText(text).width;
        if (tw > cw * 0.9) px *= (cw * 0.9) / tw;
        g.font = font(px);
        g.fillStyle = color;
        g.fillText(text, cw / 2, y);
      };
      fitLine('PRÓXIMA AMPLIACIÓN', 50, 37, '#150d26');
      fitLine(next.name.toUpperCase(), 78, 150, '#ffffff');
      fitLine(`Nivel ${PHASE_LEVELS[phaseId]}  ·  ${EXPANSION_PRICE[next.id].toLocaleString('es-CO')} monedas`, 46, 250, '#f5b91d');
      g.strokeStyle = '#ff4fa3';
      g.lineWidth = 10;
      g.strokeRect(5, 5, cw - 10, ch - 10);
    });
    const faceMat = new THREE.MeshBasicMaterial({ map: board });
    faceMat.userData.outlineParameters = { visible: false };
    const steel = toon(0x3c3f52);
    const sign = new THREE.Group();
    const D = 0.2;
    const backMat = toon(0x241a44);
    sign.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [backMat, backMat, backMat, backMat, faceMat, backMat]));
    const frame = toon(0xd9dbe6);
    for (const [fw, fh, fx, fy] of [[W + 0.2, 0.1, 0, H / 2 + 0.05], [W + 0.2, 0.1, 0, -H / 2 - 0.05], [0.1, H, -W / 2 - 0.05, 0], [0.1, H, W / 2 + 0.05, 0]] as const) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, D + 0.04), frame);
      f.position.set(fx, fy, 0);
      sign.add(f);
    }
    // two posts behind the board, on concrete feet, and two lamps lighting it from above
    for (const dx of [-W * 0.3, W * 0.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.4 + H, 0.18), steel);
      leg.position.set(dx, -0.7, -D / 2 - 0.1);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), toon(0x9a9a9a));
      foot.position.set(dx, -1.4 - H / 2 + 0.12, -D / 2 - 0.1);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), steel);
      arm.position.set(dx, H / 2 + 0.2, 0.15);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.16), toon(0xfff1b0, { emissive: 0xffd36b, emissiveIntensity: 1.3, outline: false }));
      lamp.position.set(dx, H / 2 + 0.17, 0.42);
      sign.add(leg, foot, arm, lamp);
    }
    sign.position.set(next.w + 4.5, 1.4 + H / 2, next.h + 3);
    sign.rotation.y = Math.PI / 4;
    r.add(sign);
  }
  return r;
}
