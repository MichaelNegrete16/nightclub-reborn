import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { randomConfig, type AnimId, type CharacterConfig, type Sex } from '../core/character';
import { NPC_LOOKS } from '../core/npcs';
import { applyConfig, instantiate, loadModel } from './avatar';
import { buildProp } from './props';
import { toon } from './toon';

// Comic panels for the story: little 3D sets, staged and lit like a comic book frame, rendered to a picture.
// Characters use the player's own look, so the story is about *your* DJ.

export const PANEL_W = 1024;
export const PANEL_H = 576;

export interface ShotEnv {
  player: CharacterConfig;
  name: string;
  /** what comes after the first "|" of the shot id (e.g. the stolen pieces in "evidence|disco_ball,speaker|1200") */
  arg?: string;
}

/** How the picture is tinted by the page (flashbacks are sepia, for instance). */
export const SHOT_FILTER: Record<string, string> = { beto_dream: 'sepia' };

// ---------------------------------------------------------------------------------------------- helpers
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

const basic = (color: number | string, opacity = 1, additive = false): THREE.MeshBasicMaterial => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1 || additive, opacity, depthWrite: !additive });
  if (additive) m.blending = THREE.AdditiveBlending;
  m.userData.outlineParameters = { visible: false };
  return m;
};

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Glowing neon lettering on a transparent plane. The text shrinks to fit the sign. */
export function neon(text: string, color: string, w: number, h: number, lit = true): THREE.Mesh {
  const tex = canvasTexture(1024, Math.round(1024 * (h / w)), (g) => {
    const W = g.canvas.width;
    const H = g.canvas.height;
    g.clearRect(0, 0, W, H);
    let size = H * 0.72;
    const font = (px: number) => `900 ${px}px "Arial Black", Impact, system-ui, sans-serif`;
    g.font = font(size);
    const width = g.measureText(text).width;
    if (width > W * 0.88) size *= (W * 0.88) / width;
    g.font = font(size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (lit) {
      g.shadowColor = color;
      g.shadowBlur = size * 0.3;
      g.fillStyle = color;
      g.fillText(text, W / 2, H / 2);
      g.shadowBlur = size * 0.1;
      g.fillText(text, W / 2, H / 2);
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.85;
      g.fillText(text, W / 2, H / 2);
    } else {
      g.fillStyle = color;
      g.fillText(text, W / 2, H / 2);
    }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.material.userData.outlineParameters = { visible: false };
  return m;
}

export function windowsTexture(seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  return canvasTexture(128, 256, (g) => {
    g.fillStyle = '#10143a';
    g.fillRect(0, 0, 128, 256);
    const cols = ['#ffd27a', '#7ff1ff', '#ff8fd0', '#ffd27a', '#2a3070'];
    for (let y = 8; y < 248; y += 16) {
      for (let x = 8; x < 120; x += 16) {
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.fillRect(x, y, 9, 10);
      }
    }
  });
}

export function glowSprite(color: string, size: number): THREE.Mesh {
  const tex = canvasTexture(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.material.userData.outlineParameters = { visible: false };
  return m;
}

// ---------------------------------------------------------------------------------------------- the set
class Rig {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, PANEL_W / PANEL_H, 0.1, 300);
  readonly mixers: THREE.AnimationMixer[] = [];
  readonly mats: THREE.Material[] = [];

  constructor(private studio: ComicStudio) {}

  bg(color: string, fogNear = 0, fogFar = 0): void {
    this.scene.background = new THREE.Color(color);
    if (fogFar) this.scene.fog = new THREE.Fog(color, fogNear, fogFar);
  }

  lights(hemiSky: number, hemiGround: number, hemi: number, key: number, keyI: number, keyPos: [number, number, number]): void {
    this.scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemi));
    const k = new THREE.DirectionalLight(key, keyI);
    k.position.set(...keyPos);
    this.scene.add(k);
  }

  point(color: number, intensity: number, pos: [number, number, number], dist = 12): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.set(...pos);
    this.scene.add(l);
    return l;
  }

  cam(pos: [number, number, number], look: [number, number, number], fov: number, roll = 0): void {
    this.camera.fov = fov;
    this.camera.position.set(...pos);
    this.camera.lookAt(...look);
    this.camera.rotateZ(roll);
    this.camera.updateProjectionMatrix();
  }

  add<T extends THREE.Object3D>(o: T, pos?: [number, number, number], rotY = 0): T {
    if (pos) o.position.set(...pos);
    o.rotation.y = rotY;
    this.scene.add(o);
    return o;
  }

  box(w: number, h: number, d: number, color: number | string, pos: [number, number, number], rotY = 0, mat?: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat ?? toon(color));
    m.position.set(pos[0], pos[1] + h / 2, pos[2]);
    m.rotation.y = rotY;
    this.scene.add(m);
    return m;
  }

  cyl(rt: number, rb: number, h: number, color: number | string, pos: [number, number, number], seg = 16, mat?: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat ?? toon(color));
    m.position.set(pos[0], pos[1] + h / 2, pos[2]);
    this.scene.add(m);
    return m;
  }

  prop(id: string, pos: [number, number, number], rotY = 0, scale = 1): THREE.Group {
    const g = buildProp(id, 1, 1);
    g.scale.setScalar(scale);
    return this.add(g, pos, rotY);
  }

  /** A chibi character, frozen in a pose taken from one of the game animations. */
  async char(cfg: CharacterConfig, o: { x?: number; y?: number; z?: number; ry?: number; s?: number; pose?: AnimId; t?: number } = {}): Promise<THREE.Object3D> {
    const gltf = await this.studio.model(cfg.sex);
    const p = instantiate(gltf);
    applyConfig(p, cfg);
    const clip = THREE.AnimationClip.findByName(p.clips, o.pose ?? 'idle');
    if (clip) {
      const action = p.mixer.clipAction(clip);
      action.play();
      action.time = o.t ?? 0;
      p.mixer.update(0);
    }
    const holder = new THREE.Group();
    p.root.scale.setScalar(o.s ?? 1);
    holder.add(p.root);
    holder.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    holder.rotation.y = o.ry ?? 0;
    this.scene.add(holder);
    p.mats.forEach((m) => this.mats.push(m));
    return holder;
  }

  rain(count: number, box: [number, number, number], center: [number, number, number], seed = 1): void {
    const r = rng(seed);
    const pts: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = center[0] + (r() - 0.5) * box[0];
      const y = center[1] + (r() - 0.5) * box[1];
      const z = center[2] + (r() - 0.5) * box[2];
      pts.push(x, y, z, x - 0.18, y - 0.95, z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8ff, transparent: true, opacity: 0.55 }));
    this.scene.add(l);
  }

  skyline(z: number, count: number, spread: number, hMin: number, hMax: number, seed: number, tint = 0xffffff): void {
    const r = rng(seed);
    const textures = [windowsTexture(seed), windowsTexture(seed + 7), windowsTexture(seed + 13)];
    for (let i = 0; i < count; i++) {
      const w = 2.2 + r() * 3;
      const h = hMin + r() * (hMax - hMin);
      const x = -spread / 2 + (i / count) * spread + (r() - 0.5) * 1.5;
      const tex = textures[i % 3].clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(w / 2.2)), Math.max(1, Math.round(h / 4)));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const side = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a72c0).multiply(new THREE.Color(tint)), map: tex });
      const top = new THREE.MeshBasicMaterial({ color: 0x14183c });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), [side, side, top, top, side, side]);
      m.position.set(x, h / 2, z - r() * 3);
      this.scene.add(m);
    }
  }

  /** Cone of light (additive, see-through): a spotlight beam. */
  beam(color: number, from: [number, number, number], to: [number, number, number], radius: number, opacity = 0.2): void {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const len = a.distanceTo(b);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, len, 24, 1, true), basic(color, opacity, true));
    cone.position.copy(a).lerp(b, 0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
    this.scene.add(cone);
  }

  /** A crowd of dark silhouettes seen from behind, some with arms up. */
  crowd(rows: number, perRow: number, z0: number, dz: number, spread: number, seed: number, y = 0, color = 0x0a0814, size = 1): void {
    const r = rng(seed);
    const body = toon(color, { outline: false });
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < perRow; i++) {
        const x = -spread / 2 + ((i + (row % 2) * 0.5) / perRow) * spread + (r() - 0.5) * 0.25;
        const z = z0 + row * dz;
        const s = 0.9 + r() * 0.25;
        const g = new THREE.Group();
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8), body);
        torso.position.y = 0.4;
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), body);
        head.position.y = 0.88;
        g.add(torso, head);
        if (r() < 0.55) {
          for (const sx of [-1, 1]) {
            if (r() < 0.7) {
              const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6), body);
              arm.position.set(sx * 0.22, 0.95, 0);
              arm.rotation.z = -sx * (0.25 + r() * 0.3);
              g.add(arm);
            }
          }
        }
        g.scale.setScalar(s * size);
        g.position.set(x, y, z);
        this.scene.add(g);
      }
    }
  }

  floorTiles(w: number, d: number, cx: number, cz: number, colors: [number, number], emissive = 0): void {
    const geo = new THREE.BoxGeometry(0.96, 0.06, 0.96);
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        const m = new THREE.Mesh(geo, toon(0x0c1230, emissive ? { emissive: colors[(x + z) % 2], emissiveIntensity: emissive, outline: false } : { outline: false }));
        if (!emissive) (m.material as THREE.MeshToonMaterial).color.set(colors[(x + z) % 2]);
        m.position.set(cx + x - w / 2 + 0.5, -0.03, cz + z - d / 2 + 0.5);
        this.scene.add(m);
      }
    }
  }

  dust(count: number, box: [number, number, number], center: [number, number, number], seed = 5): void {
    const r = rng(seed);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012 + r() * 0.012, 0), basic(0xffe9b0, 0.8));
      m.position.set(center[0] + (r() - 0.5) * box[0], center[1] + (r() - 0.5) * box[1], center[2] + (r() - 0.5) * box[2]);
      this.scene.add(m);
    }
  }

  suitcase(pos: [number, number, number], ry = 0): void {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.18), toon(0x8a4a2a));
    body.position.y = 0.19;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 12, Math.PI), toon(0x2a2a30));
    handle.position.y = 0.4;
    g.add(body, handle);
    g.position.set(...pos);
    g.rotation.y = ry;
    this.scene.add(g);
  }
}

type ShotFn = (r: Rig, env: ShotEnv) => Promise<void>;

// ---------------------------------------------------------------------------------------------- the shots
const SHOTS: Record<string, ShotFn> = {
  // 1 - rain over the city, you arrive with a suitcase
  async city(r, env) {
    r.bg('#0b0a2c', 18, 70);
    r.lights(0x7a86ff, 0x1a1030, 1.1, 0xb0baff, 1.3, [-4, 8, 6]);
    r.skyline(-30, 28, 62, 9, 26, 3);
    r.skyline(-19, 20, 46, 6, 15, 9, 0xc8b0ff);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), toon(0x14143c, { outline: false }));
    ground.rotation.x = -Math.PI / 2;
    r.scene.add(ground);
    for (const [x, z, c] of [[-2.2, -1, 0xff3da6], [1.6, -3, 0x18d8ff], [-0.4, 2.6, 0xff3da6], [3.3, 1.2, 0x18d8ff]] as const) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), basic(c, 0.35));
      p.rotation.x = -Math.PI / 2;
      p.scale.y = 0.45;
      p.position.set(x, 0.012, z);
      r.scene.add(p);
    }
    // street lamp with its cone of light
    r.cyl(0.06, 0.08, 4.2, 0x1a1a2a, [3.4, 0, -1.5], 8);
    r.box(1.0, 0.07, 0.07, 0x1a1a2a, [2.95, 4.15, -1.5]);
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), basic(0xfff1c0));
    bulb.position.set(2.5, 4.05, -1.5);
    r.scene.add(bulb);
    r.beam(0xffe9b0, [2.5, 4.0, -1.5], [2.5, 0, -1.5], 1.9, 0.16);
    const glow = glowSprite('rgba(255,230,160,0.9)', 2.6);
    glow.position.set(2.5, 4.0, -1.45);
    r.scene.add(glow);
    r.add(neon('CLUB', '#ff2d9a', 5, 1.6), [-7, 6.5, -17.4]);
    r.add(neon('LIVE', '#18d8ff', 3.6, 1.2), [8, 4.5, -17.4]);
    await r.char(env.player, { x: 0.1, z: 1.3, ry: Math.PI + 0.25, pose: 'walk', t: 0.12 });
    r.suitcase([0.78, 0, 1.3], 0.3);
    r.rain(650, [30, 16, 30], [0, 6, -4], 4);
    r.cam([-2.6, 1.55, 6.4], [0.4, 1.7, -3], 46);
  },

  // 2 - the rusty door at the bottom of the stairs, sign still dark
  async door(r, env) {
    r.bg('#08061c', 8, 40);
    r.lights(0x5a66d8, 0x120a24, 0.8, 0x9aa6ff, 0.9, [3, 8, 5]);
    for (let i = 0; i < 6; i++) {
      const top = -(i + 1) * 0.3;
      const h = 0.3 + (i + 1) * 0.3 + 1;
      r.box(3.2, h, 0.56, 0x3a3548, [0, top - h + 0, -0.5 - i * 0.55]);
    }
    for (const sx of [-1, 1]) r.box(0.5, 6, 6.4, 0x2c2640, [sx * 1.85, -3, -2.8]);
    r.box(3.4, 6, 0.5, 0x2a2438, [0, -3.6, -5.9]);
    r.box(1.5, 2.6, 0.22, 0x1a1822, [0, -1.8, -5.55]);
    r.box(1.2, 2.3, 0.14, 0x7a3b22, [0, -1.8, -5.42]);
    for (const y of [-0.9, -1.8, -2.7]) r.box(1.1, 0.07, 0.04, 0x4a2414, [0, y + 0.9, -5.33]);
    r.box(0.2, 0.2, 0.1, 0xf2c40d, [0.4, -1.95, -5.28]);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), toon(0xcfd2e8));
    shackle.position.set(0.4, -1.72, -5.28);
    r.scene.add(shackle);
    r.add(neon('EL SÓTANO', '#4a5290', 2.8, 0.9, false), [0, -0.1, -5.28]);
    const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), basic(0xffd890));
    bulb.position.set(-0.9, -0.4, -5.1);
    r.scene.add(bulb);
    r.point(0xffb060, 6, [-0.9, -0.4, -4.6], 6);
    const g = glowSprite('rgba(255,200,120,0.8)', 1.4);
    g.position.set(-0.9, -0.4, -5.05);
    r.scene.add(g);
    await r.char(env.player, { x: -0.5, z: 1.4, ry: Math.PI - 0.2, pose: 'idle' });
    r.suitcase([0.2, 0, 1.4], -0.3);
    r.rain(260, [8, 8, 10], [0, 3, 1], 12);
    r.cam([1.1, 2.0, 3.3], [0, -1.0, -4.5], 52);
  },

  // the Brigada del Ruido arrives at the club's door and takes the thief away (the arrest scene, core/arrest.ts)
  async raid(r, env) {
    r.bg('#06041a', 10, 46);
    r.lights(0x3a46b8, 0x120a24, 0.7, 0x8a96ff, 0.7, [3, 8, 5]);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), toon(0x14143c, { outline: false }));
    ground.rotation.x = -Math.PI / 2;
    r.scene.add(ground);
    r.box(10, 4.8, 0.7, 0x2a2540, [0, 0, -4.2]);
    r.box(1.5, 2.5, 0.2, 0x1a1822, [0, 0, -3.8]);
    r.box(1.2, 2.3, 0.1, 0x7a3b22, [0, 0, -3.7]);
    r.add(neon('TU CLUB', '#ff4fa3', 3.4, 0.9, true), [0, 3.4, -3.8]);
    // yellow tape across the door
    for (const [y, rot] of [[1.0, 0.1], [1.6, -0.08]] as const) {
      const t = r.box(4.2, 0.12, 0.03, 0xf2c40d, [0, y, -3.55]);
      t.rotation.z = rot;
    }
    // two patrol cars with their light bars
    for (const sx of [-1, 1]) {
      const x = sx * 4.1;
      r.box(2.4, 0.6, 1.1, 0xe8ecf8, [x, 0.25, -1.4], 0.35 * sx);
      r.box(1.3, 0.5, 1.0, 0x2a3a6a, [x - sx * 0.1, 0.8, -1.4], 0.35 * sx);
      const red = r.box(0.45, 0.14, 0.2, 0xff2030, [x - 0.25, 1.28, -1.4], 0.35 * sx);
      const blue = r.box(0.45, 0.14, 0.2, 0x2050ff, [x + 0.25, 1.28, -1.4], 0.35 * sx);
      (red.material as THREE.MeshToonMaterial).emissive = new THREE.Color(0xff2030);
      (blue.material as THREE.MeshToonMaterial).emissive = new THREE.Color(0x2050ff);
      r.point(sx < 0 ? 0xff2030 : 0x2050ff, 9, [x, 1.6, -0.6], 11);
      const glow = glowSprite(sx < 0 ? 'rgba(255,40,60,0.9)' : 'rgba(60,110,255,0.9)', 3.4);
      glow.position.set(x, 1.5, -0.9);
      r.scene.add(glow);
    }
    // the thief, cuffed, and the commissioner leading them away
    const thief = await r.char(env.player, { x: -0.55, z: 0.9, ry: 0.5, pose: 'idle', s: 1.35 });
    for (const sx of [-1, 1]) {
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), toon(0xcfd2e8));
      cuff.position.set(sx * 0.1, 0.62, 0.22);
      thief.add(cuff);
    }
    await r.char(NPC_LOOKS.ferro, { x: 0.75, z: 0.7, ry: -0.9, pose: 'idle', s: 1.35 });
    await r.char(NPC_LOOKS.ferro, { x: 2.0, z: -0.4, ry: -0.5, pose: 'idle', s: 1.2 });
    r.beam(0xffffff, [-3, 4, 3], [-0.5, 0, 0.9], 1.4, 0.1);
    r.cam([0.4, 1.0, 4.4], [0.1, 1.2, -0.8], 50);
  },

  // the table of evidence: what was stolen (or what was going to be), the money, the tools. arg = "piece,piece|cash|convicted"
  async evidence(r, env) {
    const [ids = '', cashText = '0', convicted = '0'] = (env.arg ?? '').split('|');
    const pieces = ids.split(',').filter(Boolean).slice(0, 4);
    const cash = Number(cashText) || 0;
    r.bg('#0a0818', 8, 36);
    r.lights(0x6a76c8, 0x180f2c, 0.7, 0xdfe6ff, 0.9, [0, 8, 4]);
    r.box(7, 3.8, 0.3, 0x2a2540, [0, 0, -2.2]);
    r.add(neon('EVIDENCIA', '#f2c40d', 2.6, 0.7, true), [0, 2.7, -2.0]);
    r.box(5.2, 0.85, 2.0, 0x5a4a3a, [0, 0, 0]);
    r.box(5.3, 0.06, 2.1, 0x7a6450, [0, 0.85, 0]);
    pieces.forEach((id, i) => {
      const x = (i - (pieces.length - 1) / 2) * 1.35 - (cash ? 0.6 : 0);
      r.prop(id, [x, 0.91, 0], (i % 2 ? 0.3 : -0.25), 1.15);
    });
    if (cash) {
      const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), toon(0x9a6a3a));
      sack.scale.y = 1.15;
      sack.position.set(1.8, 1.28, 0.1);
      r.scene.add(sack);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), toon(0x2a2a30));
      tie.rotation.x = Math.PI / 2;
      tie.position.set(1.8, 1.72, 0.1);
      r.scene.add(tie);
      for (let i = 0; i < 4; i++) r.cyl(0.18, 0.18, 0.05, 0xf2c40d, [1.15, 0.91 + i * 0.05, 0.55 + (i % 2) * 0.04], 14);
    }
    // caught in the act (nothing was taken): the alarm that rang is on the table too
    if (convicted === '0') r.prop('alarm', [-2.2, 0.91, -0.4], 0.3, 1.0);
    // the tools of the job: a pair of picks and a crowbar, and tape of the police
    r.box(0.7, 0.04, 0.05, 0x8f96b4, [-2.1, 0.91, 0.55], 0.4);
    r.box(0.5, 0.04, 0.04, 0x8f96b4, [-1.9, 0.95, 0.7], -0.3);
    r.box(5.4, 0.14, 0.03, 0xf2c40d, [0, 0.45, 1.05]);
    r.beam(0xffffff, [0, 5, 1.5], [0, 0.9, 0], 1.7, 0.1);
    r.dust(30, [4, 2, 2], [0, 1.6, 0.5], 4);
    r.cam([0.0, 2.7, 3.9], [0.0, 0.9, 0], 48);
  },

  // the cell
  async cell(r, env) {
    r.bg('#07060f', 6, 24);
    r.lights(0x5a66a8, 0x0a0816, 0.5, 0x9aa6ff, 0.5, [-3, 6, 4]);
    r.box(8, 4, 0.4, 0x2a2838, [0, 0, -2.4]);
    r.box(8, 0.2, 5, 0x1a1826, [0, -0.2, 0]);
    // the window with the moon, and its light
    r.box(1.0, 1.0, 0.1, 0xdfe8ff, [1.6, 2.3, -2.15]);
    r.beam(0xaabaff, [1.6, 3.3, -2.0], [0.6, 0, -0.4], 1.0, 0.09);
    r.point(0x7a8aff, 4, [1.2, 2.6, -1.5], 8);
    // the bunk
    r.box(2.2, 0.35, 1.0, 0x4a4256, [-2.1, 0.0, -1.6]);
    r.box(2.2, 0.15, 1.0, 0x8f96b4, [-2.1, 0.35, -1.6]);
    // the bars in front of the camera
    for (let i = 0; i < 11; i++) r.cyl(0.06, 0.06, 3.6, 0x3a3a46, [-2.6 + i * 0.52, 0, 1.4], 8);
    r.box(5.8, 0.12, 0.12, 0x3a3a46, [0, 0.4, 1.4]);
    r.box(5.8, 0.12, 0.12, 0x3a3a46, [0, 3.0, 1.4]);
    // tally marks on the wall
    for (let i = 0; i < 5; i++) r.box(0.04, 0.4, 0.02, 0xdfe6f2, [-0.6 + i * 0.1, 1.4, -2.18]);
    await r.char(env.player, { x: 0.2, z: -0.4, ry: 0.15, pose: 'idle', s: 1.35 });
    r.cam([0.0, 1.45, 4.6], [0.0, 1.2, 0], 46);
  },

  // 3 - Tío Beto's letter on the dusty table
  async letter(r, env) {
    r.bg('#10081a', 6, 18);
    r.lights(0x6a5a8a, 0x1a1020, 0.8, 0xffd9a0, 1.1, [-2, 4, 2]);
    r.point(0xffc27a, 34, [-0.7, 1.5, 0.5], 7);
    r.box(3.4, 0.12, 2.0, 0x4a2f22, [0, -0.12, 0]);
    const letterTex = canvasTexture(512, 700, (g) => {
      g.fillStyle = '#f3e8c8';
      g.fillRect(0, 0, 512, 700);
      g.strokeStyle = 'rgba(120,90,50,0.35)';
      g.lineWidth = 6;
      g.strokeRect(10, 10, 492, 680);
      g.fillStyle = '#3a2a1a';
      g.font = 'italic 40px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
      const lines = [`Para ti, ${env.name}:`, '', 'Si lees esto,', 'el Sótano ya es tuyo.', 'Perdona el polvo.', '', 'No dejes que se apague', 'la pista.', '', '— Tío Beto'];
      lines.forEach((t, i) => g.fillText(t, 48, 90 + i * 56));
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.3), toon(0xffffff));
    (paper.material as THREE.MeshToonMaterial).map = letterTex;
    paper.rotation.set(-Math.PI / 2, 0, 0.1);
    paper.position.set(0.32, 0.015, 0.05);
    r.scene.add(paper);
    // vinyl on the left, half out of its sleeve
    const sleeveTex = canvasTexture(512, 512, (g) => {
      g.fillStyle = '#1b1040';
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = '#ff2d9a';
      g.beginPath();
      g.arc(256, 256, 150, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '900 54px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center';
      g.fillText('LA PISTA', 256, 250);
      g.fillText('CERO', 256, 310);
    });
    const sleeve = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), toon(0xffffff));
    (sleeve.material as THREE.MeshToonMaterial).map = sleeveTex;
    sleeve.rotation.set(-Math.PI / 2, 0, -0.25);
    sleeve.position.set(-1.25, 0.012, -0.2);
    r.scene.add(sleeve);
    r.cyl(0.46, 0.46, 0.025, 0x0b0b12, [-0.98, 0.02, -0.08], 40);
    r.cyl(0.15, 0.15, 0.03, 0xff2d9a, [-0.98, 0.03, -0.08], 24);
    r.prop('dj_booth', [0.2, 0, -1.55], 0, 1.6);
    r.dust(40, [3, 1.6, 2], [0, 0.8, 0], 9);
    r.cam([0.2, 1.2, 1.4], [-0.25, 0.05, 0.0], 38);
  },

  // 4 - Beto's dream (flashback): the Neón Fest stage, the crowd, the spotlight
  async beto_dream(r) {
    r.bg('#24101a', 12, 60);
    r.lights(0xffb08a, 0x2a1020, 1.0, 0xfff0c0, 1.4, [0, 6, 6]);
    r.box(13, 0.7, 5, 0x3a2a3a, [0, 0, -3]);
    r.box(0.5, 7, 0.5, 0x2a2030, [-6.2, 0, -4.5]);
    r.box(0.5, 7, 0.5, 0x2a2030, [6.2, 0, -4.5]);
    r.box(13, 0.4, 0.5, 0x2a2030, [0, 7, -4.5]);
    r.add(neon('NEÓN FEST', '#ffd24a', 10, 2.6), [0, 5.2, -4.8]);
    for (const [x, tx, c] of [[-4, -0.6, 0xfff0c0], [0, 0, 0xffc0e0], [4, 0.6, 0xc0f0ff]] as const) r.beam(c, [x, 7, -3], [tx, 0.7, -2.2], 1.6, 0.22);
    const sun = glowSprite('rgba(255,225,150,0.9)', 7);
    sun.position.set(0, 3.6, -4.4);
    r.scene.add(sun);
    await r.char(NPC_LOOKS.beto, { x: 0, y: 0.7, z: -1.6, ry: 0, pose: 'celebrate', t: 0.35, s: 2.1 });
    r.crowd(3, 14, 3.4, 1.0, 13, 21, 0, 0x0a0814, 0.8);
    for (let i = 0; i < 70; i++) {
      const q = rng(i + 400);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), basic([0xffd24a, 0xff7ab0, 0x7ff1ff][i % 3]));
      c.position.set((q() - 0.5) * 12, 1.5 + q() * 5, -4 + q() * 7);
      c.rotation.set(q() * 3, q() * 3, q() * 3);
      r.scene.add(c);
    }
    r.cam([0, 0.9, 7.4], [0, 2.7, -2], 52);
  },

  // 5 - the record: La Pista Cero, glowing on a turntable
  async record(r) {
    r.bg('#06050f', 6, 20);
    r.lights(0x4a4a8a, 0x120a20, 0.6, 0xffffff, 0.8, [0, 5, 3]);
    r.point(0x18d8ff, 10, [-2.2, 1.6, 1.2], 8);
    r.point(0xff2d9a, 12, [2.2, 1.6, 1.2], 8);
    r.box(2.6, 0.26, 2.1, 0x1c1c2a, [0, 0, 0]);
    r.cyl(0.84, 0.84, 0.06, 0x8e93a8, [0, 0.26, 0], 40);
    r.cyl(0.78, 0.78, 0.035, 0x0b0b12, [0, 0.32, 0], 48);
    for (const rad of [0.3, 0.42, 0.54, 0.66]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rad, rad + 0.012, 64), basic(0x2a2a3c));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.356;
      r.scene.add(ring);
    }
    const labelTex = canvasTexture(256, 256, (g) => {
      g.fillStyle = '#ff2d9a';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#fff';
      g.font = '900 30px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center';
      g.fillText('LA PISTA', 128, 120);
      g.fillText('CERO', 128, 160);
    });
    const label = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), toon(0xffffff, { outline: false }));
    (label.material as THREE.MeshToonMaterial).map = labelTex;
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.36;
    r.scene.add(label);
    r.box(0.06, 0.06, 1.1, 0xcfd2e8, [0.95, 0.4, 0.15], 0.5);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.03, 8, 64), basic(0x18d8ff, 0.8, true));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.4;
    r.scene.add(halo);
    const g = glowSprite('rgba(24,216,255,0.8)', 4.2);
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.38;
    r.scene.add(g);
    r.cam([0.3, 1.9, 1.7], [0, 0.3, 0], 36);
  },

  // 6 - inside the Sótano: dust, a flickering neon sign, an empty room
  async inside(r, env) {
    r.bg('#0a0818', 6, 26);
    r.lights(0x4a5090, 0x140a24, 0.7, 0x9fb4ff, 1.0, [0, 6, 8]);
    r.point(0xff2d9a, 38, [0, 2.6, -3.8], 10);
    r.floorTiles(8, 8, 0, -1, [0x2b2f45, 0x232740]);
    r.box(8.4, 4, 0.3, 0x3a3f5c, [0, 0, -5.1]);
    r.box(0.3, 4, 8, 0x333852, [-4.2, 0, -1]);
    r.add(neon('EL SÓTANO', '#ff2d9a', 4.4, 1.4), [0, 2.4, -4.9]);
    const glow = glowSprite('rgba(255,45,154,0.7)', 7);
    glow.position.set(0, 2.4, -4.8);
    r.scene.add(glow);
    r.prop('dj_booth', [2.6, 0, -4.2], 0, 1.3);
    r.prop('speaker', [1.3, 0, -4.5], 0, 1.3);
    r.prop('stool', [-2.6, 0, -3.6], 0, 1.2);
    r.box(0.12, 2.2, 0.12, 0x2a2a38, [-3.8, 0, -4]);
    await r.char(env.player, { x: 0.2, z: 1.9, ry: Math.PI, pose: 'idle' });
    r.suitcase([0.85, 0, 1.9], 0.2);
    r.dust(60, [8, 3.5, 9], [0, 1.6, -1], 6);
    r.beam(0x9fb4ff, [0.2, 3.2, 3.4], [0.2, 0, 1.8], 1.4, 0.12);
    r.cam([0.9, 1.55, 4.2], [0, 1.15, -3], 52);
  },

  // 7 - Rosa behind the bar
  async rosa_bar(r, env) {
    r.bg('#190e12', 8, 24);
    r.lights(0xffb070, 0x2a1418, 1.0, 0xffe0b0, 1.2, [1, 5, 5]);
    r.point(0xff9a40, 34, [0, 2.4, 1.4], 9);
    r.point(0x18d8ff, 18, [-3, 1.6, 1.5], 8);
    r.box(8, 3.6, 0.3, 0x5a3a30, [0, 0, -1.8]);
    for (const [y, c] of [[1.15, 0x7a4a2a], [1.6, 0x7a4a2a], [2.05, 0x7a4a2a]] as const) {
      r.box(5.2, 0.07, 0.35, c, [0, y, -1.55]);
      for (let i = 0; i < 12; i++) {
        const col = [0x18b862, 0xf2c40d, 0xe63a2e, 0x18d8ff, 0xff7ab0, 0xff9a40][(i + Math.round(y * 5)) % 6];
        const x = -2.4 + i * 0.44;
        r.cyl(0.07, 0.085, 0.3, col, [x, y + 0.07, -1.55], 8, toon(col, { emissive: col, emissiveIntensity: 0.35 }));
        r.cyl(0.03, 0.03, 0.1, col, [x, y + 0.37, -1.55], 8);
      }
    }
    r.box(0.8, 0.34, 0.8, 0x3a2a30, [0, 0, -0.8]);
    await r.char(NPC_LOOKS.rosa, { x: 0, y: 0.34, z: -0.8, ry: 0, pose: 'idle', s: 1.15 });
    r.prop('bar_straight', [0, 0, 0.1], 0, 1.0);
    r.box(0.5, 0.55, 0.5, 0x23242e, [2.8, 0, -1.0]);
    r.prop('stool', [-1.3, 0, 1.0], 0, 1.3);
    await r.char(env.player, { x: -1.9, z: 1.5, ry: Math.PI - 0.5, pose: 'idle', s: 1.0 });
    r.cam([0.9, 1.35, 3.4], [0, 1.25, -0.4], 38);
  },

  // 8 - the empty dance floor, seen from behind you and Rosa
  async empty_floor(r, env) {
    r.bg('#07061a', 8, 30);
    r.lights(0x7a86d0, 0x1c1430, 1.5, 0xc8d2ff, 1.1, [0, 7, 5]);
    r.floorTiles(8, 7, 0, -2, [0x424a74, 0x363d62]);
    r.box(8.4, 4, 0.3, 0x4a5078, [0, 0, -5.6]);
    r.box(0.3, 4, 9, 0x424768, [-4.2, 0, -1]);
    r.beam(0xc8d2ff, [0, 5, -2], [0, 0, -2], 2.2, 0.24);
    await r.char(env.player, { x: -0.55, z: 2.4, ry: Math.PI, pose: 'idle' });
    await r.char(NPC_LOOKS.rosa, { x: 0.55, z: 2.4, ry: Math.PI, pose: 'idle', s: 1.05 });
    r.dust(50, [7, 3.5, 7], [0, 1.6, -1], 17);
    r.cam([0, 1.6, 5.4], [0, 0.9, -2], 48);
  },

  // 8b - the same floor, as Rosa imagines it: full of people (shown as a small panel)
  async dream_party(r, env) {
    r.bg('#10042a', 8, 40);
    r.lights(0xb08aff, 0x2a1050, 1.1, 0xffe0ff, 1.2, [0, 7, 5]);
    const cols: [number, number][] = [[0x14d6f2, 0xa13cff], [0xff3da6, 0x14d6f2]];
    r.floorTiles(8, 7, 0, -2, cols[0], 0.9);
    r.box(8.4, 4, 0.3, 0x2a1850, [0, 0, -5.6]);
    r.point(0xff2d9a, 60, [-2.5, 3, -1], 12);
    r.point(0x18d8ff, 60, [2.5, 3, -1], 12);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), toon(0xdfe6ff, { emissive: 0x8899ff, emissiveIntensity: 0.6 }));
    ball.position.set(0, 3.2, -2);
    r.scene.add(ball);
    for (const [x, c] of [[-2.4, 0xff2d9a], [-0.8, 0x18d8ff], [0.8, 0xa13cff], [2.4, 0xffd24a]] as const) r.beam(c, [0, 3.2, -2], [x, 0, -0.5], 0.5, 0.28);
    const spots: Array<[number, number, number]> = [[-1.8, -1.2, 0.1], [-0.4, -2.0, 0.3], [1.3, -1.0, 0.6], [2.1, -2.4, 0.2], [0.5, 0.2, 0.45], [-2.2, 0.4, 0.8]];
    for (let i = 0; i < spots.length; i++) {
      const sex: Sex = i % 2 ? 'female' : 'male';
      await r.char(randomConfig(sex), { x: spots[i][0], z: spots[i][1], ry: (i - 2) * 0.25, pose: 'dance', t: spots[i][2] });
    }
    r.prop('dj_booth', [0, 0, -4.4], 0, 1.4);
    await r.char(env.player, { x: 0, z: -4.9, y: 0, ry: 0, pose: 'dj_mix', t: 0.12 });
    r.cam([0, 1.9, 5.2], [0, 0.9, -2], 52);
  },

  // 9 - Zeta, low angle, red light, a hologram of his parking tower
  async zeta(r) {
    r.bg('#14061c', 10, 50);
    r.lights(0xb0a0e0, 0x200830, 1.4, 0xffd0d8, 1.2, [3, 4, 5]);
    r.point(0xff2255, 14, [2.6, 1.4, 1.2], 9);
    r.point(0xa13cff, 10, [-3, 1.6, 1.5], 9);
    r.skyline(-14, 20, 44, 7, 20, 11, 0xff90b0);
    r.add(neon('ECLIPSE', '#ff2255', 7, 2.0), [3.2, 6.2, -9.5]);
    // hologram of a parking tower
    const holo = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 1.3), new THREE.MeshBasicMaterial({ color: 0x18d8ff, wireframe: true, transparent: true, opacity: 0.9 }));
      f.position.y = i * 0.36;
      f.material.userData.outlineParameters = { visible: false };
      holo.add(f);
    }
    holo.position.set(-2.1, 0.9, -1.4);
    holo.rotation.y = 0.5;
    r.scene.add(holo);
    r.box(1.4, 0.06, 1.4, 0x18d8ff, [-2.1, 0.78, -1.4], 0.5, basic(0x18d8ff, 0.5, true));
    await r.char(NPC_LOOKS.zeta, { x: 0.5, z: 0, ry: -0.35, pose: 'idle', s: 1.35 });
    r.cam([0.4, 0.3, 3.4], [0.4, 1.35, 0], 44, 0.14);
  },

  // 10 - the goal: the Neón Fest main stage
  async neon_fest(r, env) {
    r.bg('#0a0630', 14, 80);
    r.lights(0x8a7aff, 0x2a1050, 1.0, 0xffffff, 1.0, [0, 8, 6]);
    r.box(16, 0.9, 6, 0x2a2048, [0, 0, -7]);
    r.box(0.6, 9, 0.6, 0x1a1430, [-8, 0, -9]);
    r.box(0.6, 9, 0.6, 0x1a1430, [8, 0, -9]);
    r.box(16.6, 0.5, 0.6, 0x1a1430, [0, 9, -9]);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 4.6),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(512, 214, (g) => {
          const grd = g.createLinearGradient(0, 0, 512, 214);
          grd.addColorStop(0, '#ff2d9a');
          grd.addColorStop(0.5, '#6a2cff');
          grd.addColorStop(1, '#18d8ff');
          g.fillStyle = grd;
          g.fillRect(0, 0, 512, 214);
        }),
      }),
    );
    screen.material.userData.outlineParameters = { visible: false };
    screen.position.set(0, 5.4, -9.9);
    r.scene.add(screen);
    r.add(neon('NEÓN FEST', '#ffffff', 9.6, 2.4), [0, 5.4, -9.8]);
    const colors = [0xff2d9a, 0x18d8ff, 0xffd24a, 0xa13cff, 0x35f08a, 0xff2d9a, 0x18d8ff];
    colors.forEach((c, i) => r.beam(c, [-7.5 + i * 2.5, 9, -8.5], [-10 + i * 3.3, 0, 3], 1.1, 0.2));
    r.prop('dj_booth', [0, 0.9, -6.4], 0, 1.3);
    r.box(2.2, 0.8, 1.2, 0x2a2048, [0, 0.9, -7.6]);
    await r.char(env.player, { x: 0, y: 1.7, z: -7.6, ry: 0, pose: 'dj_mix', t: 0.12, s: 1.7 });
    r.crowd(5, 18, 0.5, 1.15, 17, 31, 0);
    for (let i = 0; i < 130; i++) {
      const q = rng(i + 900);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), basic([0xffd24a, 0xff7ab0, 0x7ff1ff, 0xffffff][i % 4]));
      c.position.set((q() - 0.5) * 18, 1 + q() * 8, -8 + q() * 12);
      c.rotation.set(q() * 3, q() * 3, q() * 3);
      r.scene.add(c);
    }
    r.cam([0, 1.5, 7.2], [0, 3.6, -7], 56);
  },
};

// ---------------------------------------------------------------------------------------------- the studio
export class ComicStudio {
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private cache = new Map<string, Promise<string | null>>();
  private models: Partial<Record<Sex, Promise<GLTF>>> = {};
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PANEL_W, PANEL_H, false);
    this.effect = new OutlineEffect(this.renderer, { defaultThickness: 0.0042, defaultColor: [0.02, 0.02, 0.05], defaultAlpha: 1 });
    this.effect.setSize(PANEL_W, PANEL_H);
  }

  model(sex: Sex): Promise<GLTF> {
    return (this.models[sex] ??= loadModel(sex));
  }

  has(id: string): boolean {
    return id.split('|')[0] in SHOTS;
  }

  /** Picture (data URL) of a panel, or null if there is no such shot. Rendered once per player look, in order. */
  shot(id: string, env: ShotEnv): Promise<string | null> {
    const [base, ...rest] = id.split('|');
    const fn = SHOTS[base];
    if (!fn) return Promise.resolve(null);
    env = { ...env, arg: rest.join('|') };
    const key = `${id}:${env.name}:${JSON.stringify(env.player)}`;
    let p = this.cache.get(key);
    if (!p) {
      p = new Promise<string | null>((resolve) => {
        this.queue = this.queue.then(async () => {
          try {
            resolve(await this.render(fn, env));
          } catch (err) {
            console.error('comic shot failed:', id, err);
            resolve(null);
          }
        });
      });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Start drawing these panels in the background so they are ready when the story reaches them. */
  prefetch(ids: string[], env: ShotEnv): void {
    for (const id of ids) void this.shot(id, env);
  }

  private async render(fn: ShotFn, env: ShotEnv): Promise<string> {
    const rig = new Rig(this);
    await fn(rig, env);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor((rig.scene.background as THREE.Color) ?? 0x000000, 1);
    this.renderer.clear(true, true, true);
    this.effect.render(rig.scene, rig.camera);
    const url = this.renderer.domElement.toDataURL('image/jpeg', 0.92);
    rig.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    rig.mats.forEach((m) => m.dispose());
    return url;
  }
}
