import * as THREE from 'three';
import { doorCells, type Phase } from '../core/club';
import { has, paintColor, signTier, type Exterior } from '../core/exterior';
import { SIDEWALK_Y } from '../core/guests';
import { canvasTexture, neon } from './comic';
import { toon } from './toon';

export const WALL_H = 3.6;

/**
 * The club seen from the street: closed walls in the facade paint, a roof, windows, the door and everything the player
 * bought for the outside (sign, awning, velvet rope, entrance lights). Building coordinates: (0,0) is the
 * north-west corner and the door is on the south side (z = phase.h), like the interior.
 */
export function buildFacade(phase: Phase, ext: Exterior, clubName: string): THREE.Group {
  const g = new THREE.Group();
  const { w, h } = phase;
  const [d1, d2] = doorCells(phase);
  const doorL = d1[0];
  const doorR = d2[0] + 1;
  const mid = (doorL + doorR) / 2;
  const wall = toon(paintColor(ext));
  const trim = toon(0x2a2438);
  const T = 0.35;

  const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat: THREE.Material, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // walls (the south one has the doorway)
  box(w + T, WALL_H, T, w / 2, WALL_H / 2, -T / 2, wall);
  box(T, WALL_H, h + T, -T / 2, WALL_H / 2, h / 2, wall);
  box(T, WALL_H, h + T, w + T / 2, WALL_H / 2, h / 2, wall);
  box(doorL + T / 2, WALL_H, T, (doorL - T / 2) / 2, WALL_H / 2, h + T / 2, wall);
  box(w - doorR + T / 2, WALL_H, T, doorR + (w - doorR + T / 2) / 2, WALL_H / 2, h + T / 2, wall);
  box(doorR - doorL, WALL_H - 2.5, T, mid, 2.5 + (WALL_H - 2.5) / 2, h + T / 2, wall); // lintel over the door

  // roof with a parapet, and a few boxes on top
  box(w + 0.9, 0.3, h + 0.9, w / 2, WALL_H + 0.15, h / 2, trim);
  const stripe = toon(0xff3da6, { emissive: 0xff3da6, emissiveIntensity: 1.2, outline: false });
  box(w + 0.95, 0.08, 0.08, w / 2, WALL_H + 0.34, h + 0.45, stripe);
  box(0.08, 0.08, h + 0.95, -0.45, WALL_H + 0.34, h / 2, toon(0x18d8ff, { emissive: 0x18d8ff, emissiveIntensity: 1.2, outline: false }));
  for (const [x, z, s] of [[w * 0.25, h * 0.3, 1.4], [w * 0.7, h * 0.55, 1.1], [w * 0.4, h * 0.75, 0.9]] as const) {
    box(s, 0.7, s, x, WALL_H + 0.65, z, toon(0x6a6f84));
  }

  // windows: warm glowing panes on the front and the east side, dark frames
  const glass = toon(0xffd98a, { emissive: 0xffc04d, emissiveIntensity: 0.9, outline: false });
  const pane = (x: number, z: number, alongX: boolean) => {
    box(alongX ? 1.3 : 0.1, 1.0, alongX ? 0.1 : 1.3, x, 1.7, z, trim);
    box(alongX ? 1.1 : 0.14, 0.8, alongX ? 0.14 : 1.1, x, 1.7, z, glass);
  };
  for (let x = 1.5; x < w - 0.8; x += 2.4) if (x + 0.65 < doorL - 0.3 || x - 0.65 > doorR + 0.3) pane(x, h + T + 0.03, true);
  for (let z = 1.6; z < h - 0.8; z += 2.6) pane(w + T + 0.03, z, false);

  // the name over the door: a plain board, or neon, or a giant sign on a pole
  const name = `CLUB ${clubName || 'NOCHE'}`.toUpperCase().slice(0, 18);
  const tier = signTier(ext);
  if (tier === 0) {
    box(3.2, 0.75, 0.12, mid, WALL_H + 0.95, h + T + 0.05, trim); // the backing board
    const label = neon(name, '#ffffff', 3.0, 0.65, false);
    label.position.set(mid, WALL_H + 0.95, h + T + 0.14);
    g.add(label);
  } else {
    const label = neon(name, tier === 1 ? '#18d8ff' : '#ff3da6', tier === 1 ? 4.2 : 6.2, tier === 1 ? 0.9 : 1.3);
    label.position.set(mid, WALL_H + (tier === 1 ? 1.0 : 1.5), h + T + 0.12);
    g.add(label);
    if (tier === 2) {
      for (const dx of [-2.6, 2.6]) box(0.16, 1.6, 0.16, mid + dx, WALL_H + 0.8, h + T + 0.1, trim);
    }
  }

  // doorway frame glow
  box(0.1, 2.5, 0.1, doorL - 0.05, 1.25, h + T + 0.05, stripe);
  box(0.1, 2.5, 0.1, doorR + 0.05, 1.25, h + T + 0.05, stripe);

  if (has(ext, 'awning')) {
    const tex = canvasTexture(128, 32, (c) => {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#f4f0e6' : '#c8283c';
        c.fillRect(i * 16, 0, 16, 32);
      }
    });
    const mat = new THREE.MeshToonMaterial({ map: tex });
    mat.userData.outlineParameters = { visible: false };
    const awn = new THREE.Mesh(new THREE.BoxGeometry(doorR - doorL + 1.2, 0.08, 2.2), mat);
    awn.position.set(mid, 2.85, h + T + 1.0);
    awn.rotation.x = 0.28;
    g.add(awn);
    for (const dx of [-1, 1]) box(0.08, 2.8, 0.08, mid + dx * ((doorR - doorL) / 2 + 0.55), 1.4, h + T + 2.0, trim);
  }

  if (has(ext, 'lights')) {
    const beam = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.16, depthWrite: false });
    beam.userData.outlineParameters = { visible: false };
    for (const side of [-1, 1]) {
      const x = mid + side * 3.2;
      box(0.35, 0.35, 0.35, x, 0.18, h + 1.6, trim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 6, 16, 1, true), beam);
      cone.position.set(x + side * 0.4, 3.2, h + 1.6);
      cone.rotation.z = -side * 0.14;
      g.add(cone);
    }
  }

  return g;
}

/**
 * The way in: a red carpet from the door to the sidewalk, posts and rope along both sides (a plain chain at first,
 * velvet once bought) and the doorman's podium with the guest list. Same coordinates as the facade. It is outdoors, so
 * it stays visible from inside the club too.
 */
export function buildLane(phase: Phase, ext: Exterior): THREE.Group {
  const g = new THREE.Group();
  const { h } = phase;
  const [d1, d2] = doorCells(phase);
  const mid = (d1[0] + d2[0] + 1) / 2;
  const end = SIDEWALK_Y - 1.5; // the carpet stops at the edge of the sidewalk
  const len = end - h;
  const velvet = has(ext, 'rope');

  const flat = (w: number, d: number, x: number, z: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat);
    m.position.set(x, y, z);
    g.add(m);
  };
  flat(2.1, len, mid, h + len / 2, 0.0, toon(0x9c1d2e, { outline: false }));
  for (const side of [-1, 1]) flat(0.1, len, mid + side * 1.0, h + len / 2, 0.02, toon(0xf2c40d, { outline: false }));
  // a doormat of light where the carpet meets the sidewalk
  flat(3.2, 0.5, mid, end + 0.25, 0.01, toon(0xf2c40d, { outline: false }));

  const post = toon(velvet ? 0xf2c40d : 0x9aa0b4);
  const cord = toon(velvet ? 0x9c1d2e : 0x2a2a34, { outline: false });
  for (const side of [-1, 1]) {
    const x = mid + side * 1.5;
    const zs: number[] = [];
    for (let z = h + 1.0; z <= end - 0.3; z += 2.1) zs.push(z);
    zs.forEach((z, i) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 8), post);
      p.position.set(x, 0.5, z);
      g.add(p);
      const top = new THREE.Mesh(new THREE.SphereGeometry(velvet ? 0.1 : 0.07, 8, 6), post);
      top.position.set(x, 1.02, z);
      g.add(top);
      if (i) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(velvet ? 0.06 : 0.03, velvet ? 0.06 : 0.03, 2.1), cord);
        r.position.set(x, 0.82, (z + zs[i - 1]) / 2);
        g.add(r);
      }
    });
  }

  // the doorman's podium with the guest list, and a lamp
  const px = mid - 2.2;
  const pz = h + 1.4;
  const dark = toon(0x2a2438);
  const podium = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.05, 0.55), dark);
  podium.position.set(px, 0.52, pz);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.65), toon(0x6a6f84));
  top.position.set(px, 1.08, pz);
  const list = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.35), toon(0xf4f0e6, { outline: false }));
  list.position.set(px, 1.13, pz);
  list.rotation.x = -0.25;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xffd98a, { emissive: 0xffc04d, emissiveIntensity: 1.2, outline: false }));
  lamp.position.set(px + 0.3, 1.25, pz - 0.15);
  g.add(podium, top, list, lamp);
  return g;
}
