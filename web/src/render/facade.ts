import * as THREE from 'three';
import { doorCells, type Phase } from '../core/club';
import { has, paintColor, signTier, type Exterior } from '../core/exterior';
import { SIDEWALK_Y } from '../core/guests';
import { canvasTexture, neon } from './comic';
import { gradientMap, toon } from './toon';

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

  // the name over the door: a real sign standing on the roof (painted wood, a neon box, or a marquee with bulbs)
  buildSign(g, `CLUB ${clubName || 'NOCHE'}`.toUpperCase().slice(0, 18), signTier(ext), mid, h + T);

  // doorway frame glow
  box(0.1, 2.5, 0.1, doorL - 0.05, 1.25, h + T + 0.05, stripe);
  box(0.1, 2.5, 0.1, doorR + 0.05, 1.25, h + T + 0.05, stripe);

  // what every club has: a stone base, corner pilasters, a cornice under the roof and two lamps by the door
  const lux = has(ext, 'columns');
  const plinth = toon(lux ? 0xece6da : 0x3a3448);
  const molding = toon(lux ? 0xf2c40d : 0xe8e2d4);
  const pilaster = toon(new THREE.Color(paintColor(ext)).multiplyScalar(0.72).getHex());
  const B = 0.5;
  const P = T + 0.16;
  box(doorL + T, B, P, (doorL - T) / 2, B / 2, h + T / 2, plinth); // front, left of the door
  box(w - doorR + T, B, P, doorR + (w - doorR + T) / 2, B / 2, h + T / 2, plinth); // front, right of the door
  box(P, B, h + T, w + T / 2, B / 2, h / 2, plinth); // east side
  box(w + T + 0.16, 0.22, P, w / 2, WALL_H - 0.11, h + T / 2, molding); // cornice
  box(P, 0.22, h + T + 0.16, w + T / 2, WALL_H - 0.11, h / 2, molding);
  for (const [x, z] of [[-T / 2, h + T / 2], [w + T / 2, h + T / 2], [w + T / 2, -T / 2]] as const) {
    box(0.55, WALL_H - 0.22, 0.55, x, (WALL_H - 0.22) / 2, z, pilaster);
    box(0.65, 0.18, 0.65, x, 0.09, z, plinth);
  }
  const lampGlow = toon(0xffe2a0, { emissive: 0xffc04d, emissiveIntensity: 1.4, outline: false });
  for (const x of [doorL - 0.95, doorR + 0.95]) {
    box(0.12, 0.26, 0.2, x, 2.42, h + T + 0.1, trim);
    box(0.24, 0.34, 0.24, x, 2.64, h + T + 0.22, lampGlow);
    box(0.3, 0.06, 0.3, x, 2.84, h + T + 0.22, trim);
  }

  if (lux) {
    // gold columns with capitals both sides of the door, and a marble step
    const gold = toon(0xf2c40d);
    for (const x of [doorL - 0.32, doorR + 0.32]) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 2.75, 14), gold);
      shaft.position.set(x, 1.5, h + T + 0.32);
      g.add(shaft);
      box(0.5, 0.14, 0.5, x, 0.07, h + T + 0.32, plinth);
      box(0.52, 0.16, 0.52, x, 2.95, h + T + 0.32, gold);
    }
    box(doorR - doorL + 1.3, 0.18, 0.5, mid, 3.12, h + T + 0.32, gold); // the beam over the columns
    box(doorR - doorL + 0.4, 0.06, 0.9, mid, 0.03, h + T + 0.45, plinth); // the step
  }

  if (has(ext, 'uplights')) {
    // light washing up the walls from small fixtures on the ground, and a glowing roof edge
    const wash = washMaterial(0xc77dff);
    const fixture = toon(0x2a2438);
    const spots: Array<[number, number, boolean]> = [];
    for (let x = 0.9; x < w - 0.5; x += 2.4) if (x < doorL - 0.9 || x > doorR + 0.9) spots.push([x, h + T + 0.2, true]);
    for (let z = 1.2; z < h - 0.5; z += 2.6) spots.push([w + T + 0.2, z, false]);
    for (const [x, z, front] of spots) {
      box(0.22, 0.12, 0.22, x, 0.56, z, fixture);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, WALL_H - 0.6), wash);
      plane.position.set(front ? x : w + T + 0.04, 0.6 + (WALL_H - 0.6) / 2, front ? h + T + 0.04 : z);
      if (!front) plane.rotation.y = Math.PI / 2;
      g.add(plane);
    }
    const edge = toon(0xc77dff, { emissive: 0xc77dff, emissiveIntensity: 1.3, outline: false });
    box(w + 0.95, 0.06, 0.06, w / 2, WALL_H + 0.02, h + 0.47, edge);
    box(0.06, 0.06, h + 0.95, w + 0.47, WALL_H + 0.02, h / 2, edge);
  }

  if (has(ext, 'planters')) {
    // clipped bushes in stone boxes along the front, palms at the corners
    const stone = toon(0xd8d2c4);
    const leaf = toon(0x2f8f4e);
    const leafDark = toon(0x23703c);
    const trunk = toon(0x8a6440);
    for (let x = 2.4; x < w - 0.6; x += 2.4) {
      if (x > doorL - 3.2 && x < doorR + 3.2) continue; // the door, the podium and the floodlights live there
      box(1.1, 0.5, 0.6, x, 0.25, h + T + 0.55, stone);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), leaf);
      bush.scale.set(1.25, 0.8, 0.75);
      bush.position.set(x, 0.75, h + T + 0.55);
      g.add(bush);
    }
    for (const [x, z] of [[0.7, h + 1.1], [w + 1.2, h + 1.1], [w + 1.2, h * 0.45]] as const) {
      box(0.9, 0.55, 0.9, x, 0.28, z, stone);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.2, 8), trunk);
      t.position.set(x, 2.1, z);
      t.rotation.z = 0.08;
      g.add(t);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.38), i % 2 ? leaf : leafDark);
        frond.position.set(x + Math.cos(a) * 0.7, 3.55, z + Math.sin(a) * 0.7);
        frond.rotation.set(0, -a, -0.45);
        g.add(frond);
      }
    }
  }

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

/** Soft light that fades upwards: what an uplight paints on a wall. */
function washMaterial(color: number): THREE.MeshBasicMaterial {
  const c = new THREE.Color(color);
  const tex = canvasTexture(8, 128, (x) => {
    const grad = x.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0.75)`);
    grad.addColorStop(1, `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, 8, 128);
  });
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.userData.outlineParameters = { visible: false };
  return m;
}

/**
 * The club's name as an actual sign on the roof edge, facing the street. `front` is the z of the facade.
 * Tier 0: a painted wooden board on two posts. Tier 1: a dark box with chrome frame and neon letters.
 * Tier 2: a big marquee framed in gold with a row of bulbs all around, on a steel truss.
 */
function buildSign(g: THREE.Group, name: string, tier: number, mid: number, front: number): void {
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const block = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat: THREE.Material) =>
    add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat), x, y, z);
  const steel = toon(0x3c3f52);
  const [W, H] = [[3.6, 0.95], [5.2, 1.3], [7.2, 1.9]][tier];
  const y = WALL_H + 0.45 + H / 2; // stands on the parapet
  const z = front - 0.05;
  const D = 0.26;

  // legs and braces behind the board, down to the roof
  for (const dx of [-W * 0.32, W * 0.32]) {
    block(0.14, y - WALL_H, 0.14, mid + dx, WALL_H + (y - WALL_H) / 2, z - D / 2 - 0.12, steel);
    const brace = block(0.08, 1.2, 0.08, mid + dx, WALL_H + 0.5, z - D / 2 - 0.55, steel);
    brace.rotation.x = 0.6;
  }
  if (tier === 2) block(W * 0.7, 0.1, 0.1, mid, WALL_H + 0.3, z - D / 2 - 0.12, steel); // truss cross bar

  if (tier === 0) {
    // painted wood: planks, a cream border and hand-lettered name
    const face = canvasTexture(1024, Math.round((1024 * H) / W), (c) => {
      const cw = c.canvas.width;
      const ch = c.canvas.height;
      c.fillStyle = '#6b4226';
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = 'rgba(0,0,0,0.25)';
      c.lineWidth = 4;
      for (let py = ch / 3; py < ch; py += ch / 3) { c.beginPath(); c.moveTo(0, py); c.lineTo(cw, py); c.stroke(); }
      c.strokeStyle = '#f4e6c4';
      c.lineWidth = 14;
      c.strokeRect(22, 22, cw - 44, ch - 44);
      let size = ch * 0.5;
      c.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
      const tw = c.measureText(name).width;
      if (tw > cw * 0.84) size *= (cw * 0.84) / tw;
      c.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#2a1608';
      c.fillText(name, cw / 2 + 4, ch / 2 + 5);
      c.fillStyle = '#f4e6c4';
      c.fillText(name, cw / 2, ch / 2);
    });
    const faceMat = new THREE.MeshToonMaterial({ map: face, gradientMap: gradientMap() });
    const wood = toon(0x4a2c18);
    // a box: wood on the sides, the painted face in front
    const mats = [wood, wood, wood, wood, faceMat, wood];
    add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mats), mid, y, z);
    return;
  }

  // a cabinet sign: dark box, metal (or gold) frame, neon name floating just in front
  const cabinet = toon(tier === 2 ? 0x1a1030 : 0x161a2c);
  const frame = toon(tier === 2 ? 0xf2c40d : 0xc9cbd6);
  block(W, H, D, mid, y, z, cabinet);
  const f = 0.12;
  block(W + f * 2, f, D + 0.06, mid, y + H / 2 + f / 2, z, frame);
  block(W + f * 2, f, D + 0.06, mid, y - H / 2 - f / 2, z, frame);
  block(f, H, D + 0.06, mid - W / 2 - f / 2, y, z, frame);
  block(f, H, D + 0.06, mid + W / 2 + f / 2, y, z, frame);
  const color = tier === 1 ? '#18d8ff' : '#ff3da6';
  const label = neon(name, color, W * 0.94, H * 0.78);
  add(label, mid, y, z + D / 2 + 0.02);

  if (tier === 2) {
    // marquee bulbs all around the frame, drawn as one instanced mesh
    const pts: Array<[number, number]> = [];
    const step = 0.42;
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += step) pts.push([x, H / 2 + f / 2], [x, -H / 2 - f / 2]);
    for (let yy = -H / 2 + step; yy < H / 2 - 1e-6; yy += step) pts.push([-W / 2 - f / 2, yy], [W / 2 + f / 2, yy]);
    const bulbMat = toon(0xfff4c8, { emissive: 0xffd36b, emissiveIntensity: 1.6, outline: false });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), bulbMat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([bx, by], i) => bulbs.setMatrixAt(i, m4.makeTranslation(mid + bx, y + by, z + D / 2 + 0.06)));
    g.add(bulbs);
    // a star on top
    const star = toon(0xf2c40d, { emissive: 0xf2c40d, emissiveIntensity: 0.6 });
    const s = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), star), mid, y + H / 2 + 0.55, z);
    s.scale.set(1, 1.2, 0.35);
  }
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
