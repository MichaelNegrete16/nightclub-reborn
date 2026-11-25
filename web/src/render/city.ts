import * as THREE from 'three';
import { PHASES } from '../core/club';
import { buildFacade, buildLane } from './facade';
import { buildYard } from './yard';
import { newExterior, type Exterior } from '../core/exterior';
import { CELL, LOT, STREET, buildingOrigin, lotOrigin, type Cell, type Neighbor } from '../core/world';
import { canvasTexture, neon } from './comic';

// The city around the player's lot, laid out on the lot grid of core/world.ts: streets with lane lines and zebra
// crossings, trees and lamps at regular spacing, the neighbours' clubs standing in their own lots exactly like the
// player's, free lots for sale, and downtown towers further out. Day and night are driven by Environment.

export interface City {
  group: THREE.Group;
  /** 0 = broad daylight .. 1 = deep night: lights windows, lamps and neon signs */
  setNight(night: number): void;
  /** 0 = dry .. 1 = pouring: darker, shinier ground */
  setWet(wet: number): void;
  /** the real players' clubs (for picking them with the mouse) */
  clubs: Array<{ n: number; cell: Cell; group: THREE.Group; body: THREE.Object3D; tag: THREE.Sprite; name: string; online: boolean }>;
  /** what a player is doing, shown on the tag over their club */
  setClubStatus(n: number, status: 'inside' | 'street'): void;
  /** hide or show a player's building (while a visitor is looking at its inside) */
  setClubVisible(n: number, visible: boolean): void;
}

const std = (color: number | string, roughness = 0.95): THREE.MeshStandardMaterial => {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  m.userData.outlineParameters = { visible: false };
  return m;
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Facade with glass windows (day) and the same windows lit in warm and cool colours (night, via emissiveMap). */
function facade(seed: number, wall: string): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const r = rng(seed);
  const lit: string[] = [];
  const cols = 8;
  const rows = 16;
  for (let i = 0; i < cols * rows; i++) {
    const v = r();
    lit.push(v < 0.45 ? '' : v < 0.7 ? '#ffd27a' : v < 0.85 ? '#ffb86a' : v < 0.95 ? '#9fe8ff' : '#ff9ad0');
  }
  const draw = (glow: boolean) =>
    canvasTexture(128, 256, (g) => {
      g.fillStyle = glow ? '#000' : wall;
      g.fillRect(0, 0, 128, 256);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = lit[y * cols + x];
          if (glow) {
            if (!c) continue;
            g.fillStyle = c;
          } else {
            g.fillStyle = '#26354f';
          }
          g.fillRect(x * 16 + 3, y * 16 + 3, 10, 10);
        }
      }
    });
  return { map: draw(false), glow: draw(true) };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: THREE.Color[]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  m.count = mats.length;
  mats.forEach((mx, i) => {
    m.setMatrixAt(i, mx);
    if (colors) m.setColorAt(i, colors[i]);
  });
  m.frustumCulled = false;
  m.instanceMatrix.needsUpdate = true;
  return m;
}

const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

type TagStatus = 'away' | 'street' | 'inside';
const TAG_TEXT: Record<TagStatus, [string, string]> = { away: ['○ ausente', '#aab0c4'], street: ['● en línea', '#35f08a'], inside: ['● en su club', '#18d8ff'] };

/** A floating name plate: the club's name and whether its owner is away, around or inside. */
function makeTag(name: string, status: TagStatus, color: string): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(name, status, color), depthTest: false, transparent: true }));
  sprite.scale.set(8, 2, 1);
  sprite.renderOrder = 18;
  sprite.userData.color = color;
  return sprite;
}

function tagTexture(name: string, status: TagStatus, color: string): THREE.CanvasTexture {
  return canvasTexture(512, 128, (g) => {
    g.fillStyle = 'rgba(14,16,40,.88)';
    g.beginPath();
    g.roundRect(6, 6, 500, 116, 28);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = color;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.font = '900 54px "Arial Black", system-ui, sans-serif';
    g.fillText(name.slice(0, 14), 256, 50);
    g.fillStyle = TAG_TEXT[status][1];
    g.font = '700 32px system-ui, sans-serif';
    g.fillText(TAG_TEXT[status][0], 256, 96);
  });
}

function updateTag(tag: THREE.Sprite, name: string, status: TagStatus): void {
  const m = tag.material as THREE.SpriteMaterial;
  m.map?.dispose();
  m.map = tagTexture(name, status, tag.userData.color as string);
  m.needsUpdate = true;
}

/** `home` is my lot's place in the city (the server's spiral): everything that looks random is decided from the ABSOLUTE lot, so every player sees the same city. */
export function buildCity(neighbors: Neighbor[], home: Cell = { i: 0, j: 0 }, range = 3): City {
  const g = new THREE.Group();
  const windowMats: THREE.MeshStandardMaterial[] = [];
  const signMats: THREE.MeshBasicMaterial[] = [];
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x9aa0b0 });
  bulbMat.userData.outlineParameters = { visible: false };
  const haloMats: THREE.MeshBasicMaterial[] = [];
  const r = rng(5);
  const clubs: City['clubs'] = [];
  const calm = new Map<THREE.Material, THREE.Material>();

  // The streets and the ground are always drawn out to 3 lots (they are cheap), whatever the graphics level: a lower level only
  // leaves out the trees, the lamps and the filler towers far from home. Real players' clubs are always drawn.
  const RANGE = Math.max(range, 3);
  const detail = (c: Cell) => Math.max(Math.abs(c.i), Math.abs(c.j)) <= range;
  const cells: Cell[] = [];
  for (let i = -RANGE; i <= RANGE; i++) for (let j = -RANGE; j <= RANGE; j++) cells.push({ i, j });

  // ---- the ground, the streets and their markings --------------------------------------------------------------
  const flat = (w: number, d: number, x: number, z: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  flat(1400, 1400, 13, 15, -0.14, std(0x4a5068));
  const asphalt = std(0x30343f, 0.9);
  const pavement = std(0xa6aab8);
  const dry = { asphalt: asphalt.color.clone(), pavement: pavement.color.clone() };
  const x0 = lotOrigin({ i: -RANGE, j: -RANGE }).x;
  const z0 = lotOrigin({ i: -RANGE, j: -RANGE }).z;
  const spanW = CELL.w * (2 * RANGE + 1);
  const spanH = CELL.h * (2 * RANGE + 1);
  for (const c of cells) {
    const o = lotOrigin(c);
    if (c.i !== 0 || c.j !== 0) flat(LOT.w, LOT.h, o.x + LOT.w / 2, o.z + LOT.h / 2, -0.1, pavement);
  }
  for (let j = -RANGE; j <= RANGE; j++) flat(spanW, STREET, x0 + spanW / 2, lotOrigin({ i: 0, j }).z + LOT.h + STREET / 2, -0.095, asphalt);
  for (let i = -RANGE; i <= RANGE; i++) flat(STREET, spanH, lotOrigin({ i, j: 0 }).x + LOT.w + STREET / 2, z0 + spanH / 2, -0.095, asphalt);

  // sidewalks along the south and east side of every lot, with a curb where they meet the road
  const walkMat = std(0xc9ccd8);
  const curbMat = std(0xe2e4ec);
  const SW = 2.6;
  for (const c of cells) {
    const o = lotOrigin(c);
    flat(LOT.w, SW, o.x + LOT.w / 2, o.z + LOT.h - SW / 2, -0.045, walkMat);
    flat(SW, LOT.h, o.x + LOT.w - SW / 2, o.z + LOT.h / 2, -0.045, walkMat);
    for (const [w, d, x, z] of [[LOT.w, 0.22, o.x + LOT.w / 2, o.z + LOT.h - 0.11], [0.22, LOT.h, o.x + LOT.w - 0.11, o.z + LOT.h / 2]] as const) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), curbMat);
      curb.position.set(x, -0.02, z);
      g.add(curb);
    }
  }

  const line = std(0xe8e4d0);
  const dashes: THREE.Matrix4[] = [];
  const zebra: THREE.Matrix4[] = [];
  for (let j = -RANGE; j <= RANGE; j++) {
    const zc = lotOrigin({ i: 0, j }).z + LOT.h + STREET / 2;
    for (let x = x0; x < x0 + spanW; x += 5) {
      const inX = ((x - lotOrigin({ i: 0, j: 0 }).x) % CELL.w + CELL.w) % CELL.w;
      if (inX > LOT.w - 4) continue; // none inside the intersections
      dashes.push(at(x + 1, -0.08, zc, 2.2, 1, 0.16));
    }
  }
  for (let i = -RANGE; i <= RANGE; i++) {
    const xc = lotOrigin({ i, j: 0 }).x + LOT.w + STREET / 2;
    for (let z = z0; z < z0 + spanH; z += 5) {
      const inZ = ((z - lotOrigin({ i: 0, j: 0 }).z) % CELL.h + CELL.h) % CELL.h;
      if (inZ > LOT.h - 4) continue;
      dashes.push(at(xc, -0.08, z + 1, 0.16, 1, 2.2));
    }
  }
  for (const c of cells) {
    const o = lotOrigin(c);
    const ix = o.x + LOT.w; // intersection corner
    const iz = o.z + LOT.h;
    for (let k = 0; k < 7; k++) {
      const t = 0.9 + k * 1.3;
      zebra.push(at(ix + t, -0.075, iz - 2.4, 0.7, 1, 3)); // north of the intersection, crossing the N-S street
      zebra.push(at(ix + t, -0.075, iz + STREET + 2.4, 0.7, 1, 3)); // south
      zebra.push(at(ix - 2.4, -0.075, iz + t, 3, 1, 0.7)); // west, crossing the E-W street
      zebra.push(at(ix + STREET + 2.4, -0.075, iz + t, 3, 1, 0.7)); // east
    }
  }
  g.add(instanced(new THREE.BoxGeometry(1, 0.02, 1), line, dashes));
  g.add(instanced(new THREE.BoxGeometry(1, 0.02, 1), line, zebra));

  // ---- trees and lamps along every lot's street edges ---------------------------------------------------------
  const trunks: THREE.Matrix4[] = [];
  const crowns: THREE.Matrix4[] = [];
  const crownCols: THREE.Color[] = [];
  const poles: THREE.Matrix4[] = [];
  const bulbs: THREE.Matrix4[] = [];
  const halos: Array<[number, number]> = [];
  for (const c of cells) {
    if (!detail(c)) continue;
    const o = lotOrigin(c);
    for (let x = o.x + 4; x < o.x + LOT.w - 2; x += 7) {
      trunks.push(at(x, 0.7, o.z + LOT.h - 1.2, 1, 1, 1));
      const s = 0.9 + r() * 0.5;
      crowns.push(at(x, 2.5, o.z + LOT.h - 1.2, s, s, s));
      crownCols.push(new THREE.Color().setHSL(0.3 + r() * 0.06, 0.45, 0.3 + r() * 0.12));
    }
    for (let z = o.z + 4; z < o.z + LOT.h - 2; z += 7) {
      trunks.push(at(o.x + LOT.w - 1.2, 0.7, z, 1, 1, 1));
      const s = 0.9 + r() * 0.5;
      crowns.push(at(o.x + LOT.w - 1.2, 2.5, z, s, s, s));
      crownCols.push(new THREE.Color().setHSL(0.3 + r() * 0.06, 0.45, 0.3 + r() * 0.12));
    }
    for (let x = o.x + 7; x < o.x + LOT.w; x += 13) {
      poles.push(at(x, 2.4, o.z + LOT.h + 0.9));
      bulbs.push(at(x, 4.9, o.z + LOT.h + 0.9));
      if (Math.abs(c.i) <= 1 && Math.abs(c.j) <= 1) halos.push([x, o.z + LOT.h + 0.9]);
    }
    for (let z = o.z + 8; z < o.z + LOT.h; z += 14) {
      poles.push(at(o.x + LOT.w + 0.9, 2.4, z));
      bulbs.push(at(o.x + LOT.w + 0.9, 4.9, z));
      if (Math.abs(c.i) <= 1 && Math.abs(c.j) <= 1) halos.push([o.x + LOT.w + 0.9, z]);
    }
  }
  g.add(instanced(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6), std(0x5a4030), trunks));
  const crown = instanced(new THREE.IcosahedronGeometry(1.5, 1), std(0xffffff, 0.9), crowns, crownCols);
  g.add(crown);
  g.add(instanced(new THREE.CylinderGeometry(0.08, 0.12, 4.8, 6), std(0x2a2d3c), poles));
  g.add(instanced(new THREE.IcosahedronGeometry(0.34, 1), bulbMat, bulbs));
  const haloTex = canvasTexture(64, 64, (c) => {
    const grd = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,236,170,0.95)');
    grd.addColorStop(1, 'rgba(255,236,170,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 64, 64);
  });
  for (const [x, z] of halos) {
    const mat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    mat.userData.outlineParameters = { visible: false };
    haloMats.push(mat);
    const h = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), mat);
    h.position.set(x, 4.9, z);
    h.lookAt(x + 40, 30, z + 40); // faces the usual camera
    g.add(h);
  }

  // ---- buildings --------------------------------------------------------------------------------------------
  const walls = ['#8a7aa8', '#6f8fb0', '#b07a8a', '#7aa89a', '#a8987a', '#8a8fb8'];
  const towerMat = (seed: number, wall: string, w: number, h: number): THREE.Material[] => {
    const f = facade(seed, wall);
    for (const t of [f.map, f.glow]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, Math.round(w / 2.6)), Math.max(1, Math.round(h / 4)));
    }
    const side = new THREE.MeshStandardMaterial({ color: 0xffffff, map: f.map, emissive: 0xffffff, emissiveMap: f.glow, emissiveIntensity: 0, roughness: 0.9 });
    side.userData.outlineParameters = { visible: false };
    windowMats.push(side);
    const top = std(0x4a4f66);
    return [side, side, top, top, side, side];
  };
  const tower = (x: number, z: number, w: number, d: number, h: number, seed: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat(seed, walls[seed % walls.length], Math.max(w, d), h));
    m.position.set(x, h / 2 - 0.1, z);
    g.add(m);
  };


  const byCell = new Map(neighbors.map((n) => [`${n.cell.i},${n.cell.j}`, n]));
  for (const c of cells) {
    if (c.i === 0 && c.j === 0) continue; // the player's own lot is built by the club view
    const o = lotOrigin(c);
    const n = byCell.get(`${c.i},${c.j}`);
    if (!n && !detail(c)) continue; // the far filler is left out on low graphics
    const ai = c.i + home.i;
    const aj = c.j + home.j;
    const dist = Math.max(Math.abs(c.i), Math.abs(c.j)); // for what is drawn near me
    const far = Math.max(Math.abs(ai), Math.abs(aj)); // for the skyline: taller away from the city centre
    const seed = (ai + 40) * 31 + (aj + 40) * 7;
    const lotRand = rng(seed * 7919 + 13);

    if (n?.kind === 'club' && n.ext) {
      // a real player's club: built with the same pieces as the player's own, so their paint, awning, sign and size show
      const p = PHASES[n.phase - 1];
      const b = buildingOrigin(c);
      const owned = [n.ext.paint];
      if (n.ext.awning) owned.push('awning');
      if (n.ext.rope) owned.push('rope');
      if (n.ext.lights) owned.push('lights');
      if (n.ext.sign >= 1) owned.push('sign_neon');
      if (n.ext.sign >= 2) owned.push('sign_giant');
      const ext: Exterior = { ...newExterior(), owned, paint: n.ext.paint };
      const club = new THREE.Group();
      club.position.set(b.x, 0, b.z);
      const body = buildFacade(p, ext, n.name.replace(/^CLUB /, ''));
      club.add(body, buildLane(p, ext), buildYard(n.phase));
      // far away, and drawn without the black outline (it doubles the cost): the neighbours get their own copies of the
      // materials, because the originals are shared with the objects of my own club and must keep theirs
      club.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        let c = calm.get(mesh.material);
        if (!c) {
          c = mesh.material.clone();
          c.userData = { outlineParameters: { visible: false } };
          calm.set(mesh.material, c);
        }
        mesh.material = c;
      });
      g.add(club);
      // a name tag over the club, so you can tell who lives where and who is around
      const short = n.name.replace(/^CLUB /, '');
      const tag = makeTag(short, n.online === false ? 'away' : 'street', n.color);
      tag.position.set(p.w / 2, 8.2, p.h / 2);
      club.add(tag);
      if (n.n !== undefined) clubs.push({ n: n.n, cell: c, group: club, body, tag, name: short, online: n.online !== false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: n.open ? 0x35f08a : 0xff3d55 }));
      lamp.position.set(b.x + p.w / 2 + 3.2, 3, b.z + p.h + 0.6);
      club.add(lamp);
    } else if (n?.kind === 'club') {
      const p = PHASES[n.phase - 1];
      const b = buildingOrigin(c);
      const h = 4.4 + n.phase * 0.7;
      const body = new THREE.Mesh(new THREE.BoxGeometry(p.w, h, p.h), std(walls[seed % walls.length], 0.9));
      body.position.set(b.x + p.w / 2, h / 2, b.z + p.h / 2);
      g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.6, 0.5, p.h + 0.6), std(0x3a3f56));
      roof.position.set(b.x + p.w / 2, h + 0.2, b.z + p.h / 2);
      g.add(roof);
      const sign = neon(n.name, n.color, Math.min(p.w - 1.2, 7), 1.5);
      sign.position.set(b.x + p.w / 2, h * 0.68, b.z + p.h + 0.08);
      g.add(sign);
      signMats.push(sign.material as THREE.MeshBasicMaterial);
      if (n.open !== undefined) {
        // a real player's club: a lamp over the door says whether it is open, and the sign dims when they are away
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: n.open ? 0x35f08a : 0xff3d55 }));
        lamp.position.set(b.x + p.w / 2, 3.4, b.z + p.h + 0.3);
        g.add(lamp);
        if (n.online === false) (sign.material as THREE.MeshBasicMaterial).opacity *= 0.6;
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.2), std(0x1c1430));
      door.position.set(b.x + p.w / 2, 1.3, b.z + p.h + 0.05);
      g.add(door);
      flat(2.6, 2.6, b.x + p.w / 2, b.z + p.h + 1.5, -0.06, std(0x9c1d2e));
    } else if (n?.kind === 'vacant' && dist <= 1) {
      // a free lot: gravel, a fence and a "for sale" board
      flat(LOT.w - 4, LOT.h - 4, o.x + LOT.w / 2, o.z + LOT.h / 2, -0.07, std(0x8f8a78));
      const fence = std(0x6a6f84);
      for (const [fx, fz, fw, fd] of [
        [o.x + LOT.w / 2, o.z + 2, LOT.w - 4, 0.2],
        [o.x + LOT.w / 2, o.z + LOT.h - 2, LOT.w - 4, 0.2],
        [o.x + 2, o.z + LOT.h / 2, 0.2, LOT.h - 4],
        [o.x + LOT.w - 2, o.z + LOT.h / 2, 0.2, LOT.h - 4],
      ] as const) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.3, fd), fence);
        f.position.set(fx, 0.65, fz);
        g.add(f);
      }
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.6, 0.2),
        std(0xffffff, 0.8),
      );
      board.position.set(o.x + LOT.w / 2, 3, o.z + LOT.h - 2.6);
      g.add(board);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(5.6, 2.2),
        new THREE.MeshBasicMaterial({
          map: canvasTexture(256, 100, (c2) => {
            c2.fillStyle = '#ffffff';
            c2.fillRect(0, 0, 256, 100);
            c2.fillStyle = '#d8262f';
            c2.font = '900 54px "Arial Black", Impact, sans-serif';
            c2.textAlign = 'center';
            c2.textBaseline = 'middle';
            c2.fillText('SE VENDE', 128, 54);
          }),
        }),
      );
      label.material.userData.outlineParameters = { visible: false };
      label.position.set(o.x + LOT.w / 2, 3, o.z + LOT.h - 2.48);
      g.add(label);
      for (const sx of [-2.4, 2.4]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), fence);
        post.position.set(o.x + LOT.w / 2 + sx, 1.5, o.z + LOT.h - 2.6);
        g.add(post);
      }
    } else {
      // downtown: towers that fill the lot, taller the further out they stand
      const slots: Array<[number, number, number, number]> = [
        [o.x + 9, o.z + 10, 12, 14],
        [o.x + 25, o.z + 11, 12, 14],
        [o.x + 10, o.z + 28, 12, 14],
        [o.x + 25, o.z + 28, 12, 14],
      ];
      slots.forEach(([tx, tz, w, d], k) => {
        const h = 10 + Math.min(far, 6) * 6 + lotRand() * 26 + (k % 2) * 6;
        tower(tx, tz, w, d, h, seed + k);
      });
    }
  }


  // the city never moves: skip recomputing every object's position each frame
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    o.matrixAutoUpdate = false;
  });
  return {
    group: g,
    clubs,
    setClubStatus(n: number, status: 'inside' | 'street'): void {
      for (const c of clubs) if (c.n === n && c.online) updateTag(c.tag, c.name, status);
    },
    setClubVisible(n: number, visible: boolean): void {
      // only the closed building opens up: the yard, the carpet, the fence and the sign stay, like in my own lot
      for (const c of clubs) if (c.n === n) c.body.visible = visible;
    },
    setNight(night: number): void {
      const n = Math.min(1, Math.max(0, night));
      const lit = 0.02 + 1.3 * Math.pow(n, 1.4);
      windowMats.forEach((m) => (m.emissiveIntensity = lit));
      signMats.forEach((m) => (m.opacity = 0.28 + 0.72 * n));
      haloMats.forEach((m) => (m.opacity = Math.pow(n, 1.2)));
      bulbMat.color.setRGB(0.55 + 0.45 * n, 0.58 + 0.4 * n, 0.65 + 0.2 * n * 0.5);
    },
    setWet(wet: number): void {
      const w = Math.min(1, Math.max(0, wet));
      asphalt.color.copy(dry.asphalt).multiplyScalar(1 - 0.4 * w);
      pavement.color.copy(dry.pavement).multiplyScalar(1 - 0.32 * w);
      asphalt.roughness = 0.9 - 0.55 * w;
      pavement.roughness = 0.95 - 0.5 * w;
    },
  };
}
