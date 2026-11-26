import * as THREE from 'three';
import { doorCells, patioRect, type Phase } from '../core/club';
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
    for (const [x, z] of [[0.7, h + 1.1], [w + 1.2, h + 1.1], ...(has(ext, 'terrace_1') ? [] : [[w + 1.2, h * 0.45] as [number, number]])] as Array<[number, number]>) {
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

  const glowMat = (c: number, k = 1.4) => toon(c, { emissive: c, emissiveIntensity: k, outline: false });

  if (has(ext, 'banners')) {
    // hanging flags between the windows
    const cols = [0xff3da6, 0x18d8ff, 0xf2c40d];
    let n = 0;
    for (let x = 2.7; x < w - 0.8; x += 2.4) {
      if (x > doorL - 1.4 && x < doorR + 1.4) continue;
      box(0.7, 0.05, 0.05, x, 2.72, h + T + 0.12, trim);
      box(0.5, 1.2, 0.04, x, 2.05, h + T + 0.1, toon(cols[n++ % 3]));
    }
  }

  if (has(ext, 'doorneon')) {
    // a neon frame hugging the doorway
    const dh = 2.62;
    box(0.07, dh, 0.07, doorL - 0.16, dh / 2, h + T + 0.1, glowMat(0xff3da6));
    box(0.07, dh, 0.07, doorR + 0.16, dh / 2, h + T + 0.1, glowMat(0x18d8ff));
    box(doorR - doorL + 0.4, 0.07, 0.07, mid, dh, h + T + 0.1, glowMat(0xffd23a));
  }

  if (has(ext, 'bollards')) {
    // low lamps along the way to the door
    for (const dx of [-4.2, -5.8, 4.2, 5.8]) {
      const x = mid + dx;
      if (x < 0.8 || x > w - 0.8) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.7, 10), toon(0x2a2438));
      post.position.set(x, 0.35, h + 3.0);
      g.add(post);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), glowMat(0xffe2a0, 1.5));
      lamp.position.set(x, 0.82, h + 3.0);
      g.add(lamp);
    }
  }

  if (has(ext, 'valet')) {
    // a small booth with a lit sign, and cones
    const vx = Math.min(w - 1, mid + 5.6);
    box(1.3, 1.5, 1.0, vx, 0.75, h + 2.4, toon(0x2a2438));
    box(1.5, 0.12, 1.2, vx, 1.56, h + 2.4, toon(0xc8283c));
    box(1.0, 0.45, 0.06, vx, 1.15, h + 2.92, glowMat(0xffd23a, 1.0));
    for (const dx of [-1.3, 1.3]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 8), toon(0xff7a1e));
      cone.position.set(vx + dx, 0.25, h + 3.3);
      g.add(cone);
    }
  }

  if (has(ext, 'lions')) {
    // two stone lions on pedestals, looking at the street
    const stone = toon(0xd8d2c4);
    for (const side of [-1, 1]) {
      const x = mid + side * 2.6;
      const z = h + T + 0.95;
      box(0.8, 0.5, 0.8, x, 0.25, z, stone);
      box(0.5, 0.42, 0.7, x, 0.72, z, stone); // body
      box(0.4, 0.4, 0.4, x, 1.06, z + 0.22, stone); // chest and head
      const mane = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), toon(0xc2b48e));
      mane.position.set(x, 1.1, z + 0.28);
      g.add(mane);
      box(0.1, 0.1, 0.1, x - 0.1, 1.12, z + 0.45, trim);
      box(0.1, 0.1, 0.1, x + 0.1, 1.12, z + 0.45, trim);
      box(0.12, 0.36, 0.12, x, 0.8, z - 0.42, stone); // tail
    }
  }

  if (has(ext, 'ledscreen')) {
    // a big LED screen on the east side with colour bars
    const tex = canvasTexture(256, 64, (c) => {
      const grad = c.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, '#ff3da6');
      grad.addColorStop(0.5, '#18d8ff');
      grad.addColorStop(1, '#ffd23a');
      c.fillStyle = '#0a0a18';
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = grad;
      for (let i = 0; i < 24; i++) c.fillRect(i * 10 + 2, 64 - (8 + ((i * 37) % 44)), 7, 8 + ((i * 37) % 44));
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.userData.outlineParameters = { visible: false };
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(5, h - 1), 1.1), mat);
    screen.position.set(w + T + 0.09, 2.9, h / 2);
    screen.rotation.y = Math.PI / 2;
    g.add(screen);
    box(0.08, 1.25, Math.min(5, h - 1) + 0.15, w + T + 0.05, 2.9, h / 2, trim);
  }

  if (has(ext, 'fountain')) {
    const fx = Math.max(1.6, mid - 6.4);
    const fz = h + 2.5;
    const stone = toon(0xd8d2c4);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.45, 18), stone);
    basin.position.set(fx, 0.22, fz);
    g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 18), glowMat(0x4adcff, 0.9));
    water.position.set(fx, 0.46, fz);
    g.add(water);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 10), stone);
    col.position.set(fx, 0.9, fz);
    g.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.18, 14), stone);
    bowl.position.set(fx, 1.35, fz);
    g.add(bowl);
    const jet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glowMat(0x9ae8ff, 1.2));
    jet.position.set(fx, 1.6, fz);
    g.add(jet);
  }

  if (has(ext, 'rooftop')) {
    // glass rails on the roof, round tables with umbrellas and a string of bulbs
    const top = WALL_H + 0.3;
    const glassRail = new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.25, depthWrite: false });
    glassRail.userData.outlineParameters = { visible: false };
    const rf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.7, 0.04), glassRail);
    rf.position.set(w / 2, top + 0.35, h + 0.3);
    g.add(rf);
    const re = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, h - 0.4), glassRail);
    re.position.set(w + 0.3, top + 0.35, h / 2);
    g.add(re);
    const bulbs: Array<[number, number, number]> = [];
    for (let x = 0.6; x < w - 0.3; x += 0.55) bulbs.push([x, top + 1.55 - 0.18 * Math.sin(((x % 3.3) / 3.3) * Math.PI), h + 0.3]);
    const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 5), glowMat(0xfff0b0, 1.6), bulbs.length);
    const m4 = new THREE.Matrix4();
    bulbs.forEach(([bx, by, bz], i) => bm.setMatrixAt(i, m4.makeTranslation(bx, by, bz)));
    g.add(bm);
    for (let x = 0.3; x < w; x += 3.3) box(0.06, 1.3, 0.06, x, top + 0.65, h + 0.3, trim);
    const umb = [0xff3da6, 0x18d8ff, 0xf2c40d];
    [0.28, 0.5, 0.72].forEach((f, i) => {
      const tx = w * f;
      const tz = h * (0.35 + 0.12 * i);
      const tbl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 14), toon(0xf4f0e6));
      tbl.position.set(tx, top + 0.7, tz);
      g.add(tbl);
      box(0.06, 0.7, 0.06, tx, top + 0.35, tz, trim);
      const um = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.35, 10), toon(umb[i]));
      um.position.set(tx, top + 1.9, tz);
      g.add(um);
      box(0.04, 1.2, 0.04, tx, top + 1.3, tz, trim);
    });
  }

  if (has(ext, 'searchlights')) {
    // two beams crossing in the sky
    const beam = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.2, depthWrite: false });
    beam.userData.outlineParameters = { visible: false };
    const len = 14;
    for (const [bx, dir] of [[0.5, new THREE.Vector3(0.45, 1, -0.2)], [w - 0.5, new THREE.Vector3(-0.45, 1, -0.2)]] as const) {
      const d = dir.clone().normalize();
      box(0.6, 0.35, 0.6, bx, WALL_H + 0.5, h + 0.3, trim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, len, 14, 1, true), beam);
      cone.position.set(bx, WALL_H + 0.6, h + 0.3).addScaledVector(d, len / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
      g.add(cone);
    }
  }

  if (has(ext, 'limo')) {
    // a long black car waiting on the street side of the sidewalk
    const lx = Math.min(w - 2.2, Math.max(2.2, mid + (mid > w / 2 ? -9 : 9)));
    const lz = h + 3.8;
    const body = toon(0x14121c);
    const chrome = toon(0xc9cbd6);
    box(1.0, 0.5, 4.2, lx, 0.45, lz, body);
    box(0.9, 0.38, 2.2, lx, 0.9, lz - 0.2, body);
    box(0.92, 0.22, 2.0, lx, 0.92, lz - 0.2, toon(0x5a7a9a));
    for (const [dx, dz] of [[-0.5, -1.4], [0.5, -1.4], [-0.5, 1.3], [0.5, 1.3]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), toon(0x0a0a10));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(lx + dx, 0.22, lz + dz);
      g.add(wheel);
    }
    box(0.8, 0.08, 0.06, lx, 0.35, lz + 2.12, chrome);
    box(0.2, 0.14, 0.06, lx - 0.3, 0.55, lz + 2.12, glowMat(0xfff1b0));
    box(0.2, 0.14, 0.06, lx + 0.3, 0.55, lz + 2.12, glowMat(0xfff1b0));
  }

  if (has(ext, 'doorglass')) {
    // two glass leaves with a gold frame, set in the doorway
    const goldD = toon(0xf2c40d, { emissive: 0x8a5a00, emissiveIntensity: 0.4 });
    const paneM = new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.28, depthWrite: false });
    paneM.userData.outlineParameters = { visible: false };
    const dw = doorR - doorL;
    for (const k of [0, 1]) {
      const cx = doorL + dw * (k ? 0.75 : 0.25);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(dw / 2 - 0.1, 2.4, 0.04), paneM);
      leaf.position.set(cx, 1.25, h + T - 0.02);
      g.add(leaf);
      box(0.06, 2.44, 0.07, cx - (dw / 4 - 0.05), 1.25, h + T - 0.02, goldD);
      box(0.06, 2.44, 0.07, cx + (dw / 4 - 0.05), 1.25, h + T - 0.02, goldD);
      box(dw / 2 - 0.1, 0.06, 0.07, cx, 2.44, h + T - 0.02, goldD);
      box(0.05, 0.9, 0.09, cx + (k ? -0.12 : 0.12), 1.2, h + T + 0.03, goldD); // the handle
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
  const [W, H] = [[3.6, 0.95], [5.2, 1.3], [7.2, 1.9], [8.4, 2.2], [9.6, 2.5]][tier];
  const y = WALL_H + 0.45 + H / 2; // stands on the parapet
  const z = front - 0.05;
  const D = 0.26;

  // legs and braces behind the board, down to the roof
  for (const dx of [-W * 0.32, W * 0.32]) {
    block(0.14, y - WALL_H, 0.14, mid + dx, WALL_H + (y - WALL_H) / 2, z - D / 2 - 0.12, steel);
    const brace = block(0.08, 1.2, 0.08, mid + dx, WALL_H + 0.5, z - D / 2 - 0.55, steel);
    brace.rotation.x = 0.6;
  }
  if (tier >= 2) block(W * 0.7, 0.1, 0.1, mid, WALL_H + 0.3, z - D / 2 - 0.12, steel); // truss cross bar

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
  const cabinet = toon(tier === 4 ? 0x2a0a3c : tier >= 2 ? 0x1a1030 : 0x161a2c);
  const frame = toon(tier === 3 ? 0x18d8ff : tier >= 2 ? 0xf2c40d : 0xc9cbd6, tier === 3 ? { emissive: 0x18d8ff, emissiveIntensity: 1.1, outline: false } : undefined);
  block(W, H, D, mid, y, z, cabinet);
  const f = 0.12;
  block(W + f * 2, f, D + 0.06, mid, y + H / 2 + f / 2, z, frame);
  block(W + f * 2, f, D + 0.06, mid, y - H / 2 - f / 2, z, frame);
  block(f, H, D + 0.06, mid - W / 2 - f / 2, y, z, frame);
  block(f, H, D + 0.06, mid + W / 2 + f / 2, y, z, frame);
  const color = tier === 1 ? '#18d8ff' : tier === 3 ? '#7af0ff' : tier === 4 ? '#ffd23a' : '#ff3da6';
  const label = neon(name, color, W * 0.94, H * 0.78);
  add(label, mid, y, z + D / 2 + 0.02);

  if (tier >= 2) {
    // marquee bulbs all around the frame, drawn as one instanced mesh
    const pts: Array<[number, number]> = [];
    const step = 0.42;
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += step) pts.push([x, H / 2 + f / 2], [x, -H / 2 - f / 2]);
    for (let yy = -H / 2 + step; yy < H / 2 - 1e-6; yy += step) pts.push([-W / 2 - f / 2, yy], [W / 2 + f / 2, yy]);
    const bulbMat = toon(tier === 3 ? 0xc8f8ff : 0xfff4c8, { emissive: tier === 3 ? 0x4adcff : 0xffd36b, emissiveIntensity: 1.6, outline: false });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), bulbMat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([bx, by], i) => bulbs.setMatrixAt(i, m4.makeTranslation(mid + bx, y + by, z + D / 2 + 0.06)));
    g.add(bulbs);
    // a star on top
    const star = toon(0xf2c40d, { emissive: 0xf2c40d, emissiveIntensity: 0.6 });
    const s = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), star), mid, y + H / 2 + 0.55, z);
    s.scale.set(1, 1.2, 0.35);
    if (tier === 4) {
      // the imperial sign: a crown of points over the board and a star on each side
      const crownMat = toon(0xf2c40d, { emissive: 0xf2c40d, emissiveIntensity: 0.7 });
      for (let k = -3; k <= 3; k++) {
        const spike = add(new THREE.Mesh(new THREE.ConeGeometry(0.2, k % 2 ? 0.55 : 0.85, 4), crownMat), mid + k * (W / 7.5), y + H / 2 + 0.3 + (k % 2 ? 0 : 0.15), z);
        spike.scale.z = 0.5;
      }
      for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), crownMat), mid + sx * (W / 2 + 0.7), y, z).scale.set(1, 1.2, 0.35);
    }
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
  const goldCarpet = has(ext, 'carpet_gold');
  flat(2.1, len, mid, h + len / 2, 0.0, toon(goldCarpet ? 0xd9a928 : 0x9c1d2e, { outline: false }));
  for (const side of [-1, 1]) flat(0.1, len, mid + side * 1.0, h + len / 2, 0.02, toon(goldCarpet ? 0x9c1d2e : 0xf2c40d, { outline: false }));
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

  const glow = (c: number, k = 1.4) => toon(c, { emissive: c, emissiveIntensity: k, outline: false });
  const laneZs: number[] = [];
  for (let z = h + 1.0; z <= end - 0.3; z += 2.1) laneZs.push(z);

  if (has(ext, 'flowerbeds')) {
    // pots with flowers outside the ropes
    const pot = toon(0xb8683a);
    const cols = [0xff3da6, 0xffd23a, 0xffffff, 0xb04cff];
    laneZs.forEach((z, i) => {
      for (const side of [-1, 1]) {
        const x = mid + side * 2.15;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), pot);
        p.position.set(x, 0.15, z + 1.0);
        g.add(p);
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), toon(0x2f8f4e));
        bush.position.set(x, 0.45, z + 1.0);
        g.add(bush);
        for (let k = 0; k < 4; k++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), toon(cols[(i + k + (side > 0 ? 1 : 0)) % 4], { outline: false }));
          f.position.set(x + Math.cos(k * 1.6) * 0.17, 0.55 + (k % 2) * 0.08, z + 1.0 + Math.sin(k * 1.6) * 0.17);
          g.add(f);
        }
      }
    });
  }

  if (has(ext, 'walkfame')) {
    // gold stars in the middle of the carpet
    for (let z = h + 1.6; z < end - 0.4; z += 1.5) {
      const star = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 5), toon(0xf2c40d, { emissive: 0x8a5a00, emissiveIntensity: 0.6, outline: false }));
      star.position.set(mid, 0.05, z);
      star.rotation.y = z;
      g.add(star);
    }
  }

  if (has(ext, 'braziers')) {
    // flaming bowls on tall stands
    for (const z of laneZs.filter((_, i) => i % 2 === 0)) {
      for (const side of [-1, 1]) {
        const x = mid + side * 1.95;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.1, 8), toon(0x2a2438));
        stand.position.set(x, 0.55, z);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.18, 10), toon(0x3a3448));
        bowl.position.set(x, 1.18, z);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 8), glow(0xff7a1e, 1.6));
        flame.position.set(x, 1.5, z);
        const core = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), glow(0xffd23a, 1.8));
        core.position.set(x, 1.45, z);
        g.add(stand, bowl, flame, core);
      }
    }
  }

  if (has(ext, 'lanearch')) {
    // an arch of lights over the start of the line, by the sidewalk
    const az = end - 0.9;
    const steel = toon(0x3c3f52);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.0, 8), steel);
      post.position.set(mid + side * 1.7, 1.5, az);
      g.add(post);
    }
    const pts: Array<[number, number]> = [];
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI - (k / 14) * Math.PI;
      pts.push([mid + Math.cos(a) * 1.7, 3.0 + Math.sin(a) * 0.9]);
    }
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xfff0b0, 1.7), pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([bx, by], i) => bulbs.setMatrixAt(i, m4.makeTranslation(bx, by, az)));
    g.add(bulbs);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.28, 0.08), glow(0xff3da6, 1.2));
    bar.position.set(mid, 3.0, az);
    g.add(bar);
  }

  if (has(ext, 'flamecols')) {
    // tall pillars of fire by the door
    const [e1, e2] = doorCells(phase);
    for (const x of [e1[0] - 1.5, e2[0] + 2.5]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 10), toon(0x2a2438));
      base.position.set(x, 0.25, h + 0.95);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 8), glow(0xff7a1e, 1.2));
      col.position.set(x, 1.3, h + 0.95);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 8), glow(0xffb02a, 1.7));
      top.position.set(x, 2.5, h + 0.95);
      g.add(base, col, top);
    }
  }

  // the terrace: a paved pad on the free ground beside the club, with a low curb. The player furnishes it with shop objects.
  const pr = patioRect(phase, ext);
  if (pr) {
    const pw = pr.x1 - pr.x0;
    const pd = pr.y1 - pr.y0;
    const tex = canvasTexture(128, 128, (c) => {
      c.fillStyle = '#9a8f80';
      c.fillRect(0, 0, 128, 128);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        c.fillStyle = (a + b) % 2 ? '#a89d8e' : '#8f8576';
        c.fillRect(a * 32 + 1, b * 32 + 1, 30, 30);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(pw / 2, pd / 2);
    const slabMat = new THREE.MeshToonMaterial({ map: tex });
    slabMat.userData.outlineParameters = { visible: false };
    const slab = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.05, pd), slabMat);
    slab.position.set(pr.x0 + pw / 2, 0.025, pr.y0 + pd / 2);
    g.add(slab);
    const curbMat = toon(0xf2c40d);
    const curb = (cw: number, cd: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.1, cd), curbMat);
      m.position.set(x, 0.05, z);
      g.add(m);
    };
    curb(pw + 0.12, 0.1, pr.x0 + pw / 2, pr.y0 - 0.05);
    curb(pw + 0.12, 0.1, pr.x0 + pw / 2, pr.y1 + 0.05);
    curb(0.1, pd, pr.x0 - 0.05, pr.y0 + pd / 2);
    curb(0.1, pd, pr.x1 + 0.05, pr.y0 + pd / 2);
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


