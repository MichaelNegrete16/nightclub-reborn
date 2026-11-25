import * as THREE from 'three';
import { PHASES } from '../core/club';
import { EXPANSION_PRICE } from '../core/expansion';
import { PHASE_LEVELS } from '../core/progression';
import { canvasTexture } from './comic';
import { toon } from './toon';

/**
 * The part of the lot the club has not grown into yet is a reserved construction zone: bare ground inside a fence, with
 * barrier tape around the next phase and a sign saying at which level it opens. It shrinks as the building grows.
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
  flatStd(last.w, last.h, last.w / 2, last.h / 2, -0.055, 0x8c846e); // the reserved ground
  if (next) flatStd(next.w, next.h, next.w / 2, next.h / 2, -0.05, 0x9c9378); // the next phase: freshly cleared

  const post = toon(0x6a6f84, { outline: false });
  const rail = toon(0x8a8fa6, { outline: false });
  for (const [x1, z1, x2, z2] of [[0, last.h, last.w, last.h], [last.w, 0, last.w, last.h]] as const) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.round(len / 3);
    // the south fence has a gate in front of the door so the line and the player can get out to the street
    const south = z1 === z2 && z1 === last.h;
    const gate0 = Math.floor(PHASES[phaseId - 1].w / 2) - 3.5;
    const gate1 = gate0 + 7;
    for (let i = 0; i <= steps; i++) {
      const px = x1 + ((x2 - x1) * i) / steps;
      if (south && px > gate0 - 1 && px < gate1 + 1) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.2), post);
      p.position.set(px, 0.65, z1 + ((z2 - z1) * i) / steps);
      r.add(p);
    }
    const spans: Array<[number, number]> = south ? [[x1, gate0], [gate1, x2]] : [[x1, x2]];
    for (const [a, b] of south ? spans : [[0, 0] as [number, number]]) {
      const sx1 = south ? a : x1;
      const sx2 = south ? b : x2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(sx2 - sx1) || 0.08, 0.08, Math.abs(z2 - z1) || 0.08), rail);
      bar.position.set((sx1 + sx2) / 2, 1.05, (z1 + z2) / 2);
      r.add(bar);
    }
  }

  if (next) {
    const tex = canvasTexture(64, 16, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#15151c' : '#ffd21e';
        g.fillRect(i * 8, 0, 8, 16);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // the tape leaves the carpet free: it runs on both sides of the way in
    const mid = Math.floor(PHASES[phaseId - 1].w / 2);
    const gl = mid - 2.5;
    const gr = mid + 2.5;
    const segs: Array<[number, number, number, number]> = [[next.w, next.h / 2, 0.1, next.h]];
    if (gl > 0.5) segs.push([gl / 2, next.h, gl, 0.1]);
    if (next.w - gr > 0.5) segs.push([gr + (next.w - gr) / 2, next.h, next.w - gr, 0.1]);
    for (const [cx, cz, w, d] of segs) {
      const t = tex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(w, d) / 1.6, 1);
      const tapeMat = new THREE.MeshBasicMaterial({ map: t });
      tapeMat.userData.outlineParameters = { visible: false };
      const tape = new THREE.Mesh(new THREE.BoxGeometry(w || 0.06, 0.3, d || 0.06), tapeMat);
      tape.position.set(cx, 0.9, cz);
      r.add(tape);
    }
    // cones at the corners and a few crates
    for (const [x, z] of [[next.w, next.h], [next.w - 0.2, 0.4], [0.4, next.h - 0.2]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), toon(0xff7a1e));
      cone.position.set(x, 0.35, z);
      r.add(cone);
    }
    const crate = (x: number, z: number, s: number) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), toon(0xa8784a));
      c.position.set(x, s / 2, z);
      c.rotation.y = x * 0.7;
      r.add(c);
    };
    crate(next.w + 2.4, next.h * 0.4, 1.0);
    crate(next.w + 3.6, next.h * 0.4 + 1.2, 0.8);
    crate(next.w * 0.7, next.h + 2.6, 0.9);
    // sign: where the club grows next
    const board = canvasTexture(512, 160, (g) => {
      g.fillStyle = '#ffd21e';
      g.fillRect(0, 0, 512, 160);
      g.fillStyle = '#15151c';
      g.fillRect(8, 8, 496, 144);
      g.fillStyle = '#ffd21e';
      g.textAlign = 'center';
      // each line shrinks until it fits the board
      const fitLine = (text: string, px: number, y: number) => {
        const font = (s: number) => `900 ${s}px "Arial Black", Impact, sans-serif`;
        g.font = font(px);
        const w = g.measureText(text).width;
        if (w > 470) px *= 470 / w;
        g.font = font(px);
        g.fillText(text, 256, y);
      };
      fitLine('PRÓXIMA AMPLIACIÓN', 52, 70);
      fitLine(`${next.name} · nivel ${PHASE_LEVELS[phaseId]} · ${EXPANSION_PRICE[next.id].toLocaleString('es-CO')}`, 44, 128);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: board });
    signMat.userData.outlineParameters = { visible: false };
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.62), signMat);
    sign.position.set(next.w + 4.5, 2.6, next.h + 3);
    sign.rotation.y = Math.PI / 4;
    r.add(sign);
    for (const o of [-1.9, 1.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.7, 0.18), post);
      leg.position.set(next.w + 4.5 + o * 0.7, 1.35, next.h + 3 - o * 0.7);
      r.add(leg);
    }
  }
  return r;
}
