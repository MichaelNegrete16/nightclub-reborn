import * as THREE from 'three';
import type { Phase } from '../core/club';
import type { Decor } from '../core/decor';
import { canvasTexture } from './comic';
import { toon } from './toon';

/** What the inside of a club looks like for a set of finishes: floor, two cutaway walls with moulding and art, lighting. */
export interface Shell {
  floor: THREE.InstancedMesh;
  wallN: THREE.Group;
  wallW: THREE.Group;
  /** materials whose colour cycles through the rainbow (the RGB neon) */
  rgb: THREE.MeshToonMaterial[];
  /** the unlit floor of the "glass with light" style: its brightness pulses with the music */
  led: THREE.MeshBasicMaterial | null;
  /** how bright the club's coloured lights are (1 = the disco lights), their two colours, and whether the colours shift */
  lights: { mul: number; a: number; b: number; shift: boolean };
}

const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const texCache = new Map<string, THREE.CanvasTexture>();
function wallTexture(style: string): THREE.CanvasTexture {
  let t = texCache.get(style);
  if (t) return t;
  const r = rnd(7);
  t = canvasTexture(256, 128, (g) => {
    const W = 256;
    const H = 128;
    if (style === 'wall_concrete') {
      g.fillStyle = '#7c8088';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '40,42,50' : '170,172,180'},${0.08 + r() * 0.12})`;
        g.fillRect(r() * W, r() * H, 1 + r() * 4, 1 + r() * 3);
      }
      g.fillStyle = 'rgba(50,50,58,.22)';
      g.fillRect(0, 0, 3, H);
      g.fillRect(0, 62, W, 2);
      for (let i = 0; i < 4; i++) g.fillRect(20 + r() * 200, 70 + r() * 50, 6 + r() * 18, 22 + r() * 30); // damp stains
    } else if (style === 'wall_paint') {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#c7c3e6');
      grad.addColorStop(1, '#a9a5cc');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    } else if (style === 'wall_brick') {
      g.fillStyle = '#8a6a5a';
      g.fillRect(0, 0, W, H);
      const bh = 16;
      const bw = 40;
      for (let row = 0; row * bh < H; row++) {
        for (let x = -(row % 2) * (bw / 2); x < W; x += bw) {
          const l = 38 + r() * 12;
          g.fillStyle = `hsl(${8 + r() * 10},${50 + r() * 15}%,${l}%)`;
          g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
        }
      }
    } else if (style === 'wall_wood') {
      g.fillStyle = '#e8dcc4'; // plaster above
      g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 21) {
        g.fillStyle = `hsl(${24 + r() * 6},${45 + r() * 10}%,${30 + r() * 10}%)`;
        g.fillRect(x, 44, 20, H - 44);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x + 20, 44, 1, H - 44);
      }
      g.fillStyle = '#5a3a1e';
      g.fillRect(0, 40, W, 6); // the rail
    } else if (style === 'wall_marble') {
      g.fillStyle = '#ecebf2';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(110,110,140,.35)';
      for (let i = 0; i < 9; i++) {
        g.lineWidth = 0.6 + r() * 1.4;
        g.beginPath();
        g.moveTo(r() * W, 0);
        g.bezierCurveTo(r() * W, H * 0.3, r() * W, H * 0.7, r() * W, H);
        g.stroke();
      }
      for (const x of [20, 150]) {
        const mg = g.createLinearGradient(x, 0, x + 84, H);
        mg.addColorStop(0, '#cfe9ff');
        mg.addColorStop(0.5, '#f5fbff');
        mg.addColorStop(1, '#a8cdee');
        g.fillStyle = mg;
        g.fillRect(x, 14, 84, H - 28);
        g.strokeStyle = '#c8a24a';
        g.lineWidth = 3;
        g.strokeRect(x, 14, 84, H - 28);
        g.strokeStyle = 'rgba(255,255,255,.7)';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x + 14, H - 20);
        g.lineTo(x + 56, 20);
        g.stroke();
      }
    } else if (style === 'wall_velvet') {
      g.fillStyle = '#6a0e2a';
      g.fillRect(0, 0, W, H);
      for (let x = 0; x < W; x += 16) {
        const fold = g.createLinearGradient(x, 0, x + 16, 0);
        fold.addColorStop(0, 'rgba(0,0,0,.35)');
        fold.addColorStop(0.5, 'rgba(255,120,150,.18)');
        fold.addColorStop(1, 'rgba(0,0,0,.35)');
        g.fillStyle = fold;
        g.fillRect(x, 0, 16, H);
      }
      g.fillStyle = '#e8b82a';
      g.fillRect(0, 0, W, 5);
      g.fillRect(0, H - 5, W, 5);
    } else if (style === 'wall_deco') {
      g.fillStyle = '#14141c';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#e8b82a';
      g.lineWidth = 2;
      for (let x = 0; x < W; x += 64) {
        for (let k = 1; k <= 5; k++) {
          g.beginPath();
          g.arc(x + 32, H, k * 11, Math.PI, 0);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
    } else if (style === 'wall_jungle') {
      g.fillStyle = '#17331f';
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `hsl(${105 + r() * 40},${45 + r() * 25}%,${22 + r() * 24}%)`;
        g.beginPath();
        g.ellipse(r() * W, r() * H, 5 + r() * 9, 2.5 + r() * 4, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 18; i++) {
        g.fillStyle = r() < 0.5 ? '#ffd98a' : '#ff8ac8';
        g.beginPath();
        g.arc(r() * W, r() * H, 1.6 + r() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
    } else if (style === 'wall_galaxy') {
      const sky = g.createLinearGradient(0, 0, W, H);
      sky.addColorStop(0, '#0b0630');
      sky.addColorStop(0.5, '#2a1068');
      sky.addColorStop(1, '#0a1a4a');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 3; i++) {
        const cx = r() * W, cy = r() * H;
        const neb = g.createRadialGradient(cx, cy, 2, cx, cy, 60);
        neb.addColorStop(0, `hsla(${280 + r() * 60},90%,60%,.45)`);
        neb.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = neb;
        g.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < 110; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
        g.fillRect(r() * W, r() * H, 1 + (r() < 0.12 ? 1 : 0), 1 + (r() < 0.12 ? 1 : 0));
      }
    } else if (style === 'wall_gold') {
      g.fillStyle = '#7a5a10';
      g.fillRect(0, 0, W, H);
      for (let row = 0; row * 18 < H; row++) {
        for (let x = -(row % 2) * 24; x < W; x += 48) {
          const bar = g.createLinearGradient(x, row * 18, x, row * 18 + 16);
          bar.addColorStop(0, '#fff0a0');
          bar.addColorStop(0.5, '#e8b82a');
          bar.addColorStop(1, '#a8780a');
          g.fillStyle = bar;
          g.fillRect(x + 2, row * 18 + 2, 44, 15);
        }
      }
    } else {
      g.fillStyle = '#0a0f30';
      g.fillRect(0, 0, W, H);
      g.lineWidth = 2;
      for (let x = 0; x <= W; x += 64) {
        g.strokeStyle = x % 128 ? '#ff3da6' : '#18e0ff';
        g.shadowColor = g.strokeStyle as string;
        g.shadowBlur = 8;
        g.beginPath();
        g.moveTo(x + 1, 0);
        g.lineTo(x + 1, H);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(80,120,255,.22)';
      for (let x = 6; x < W; x += 64) g.fillRect(x, 10, 52, H - 20);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(style, t);
  return t;
}

function wallMaterial(style: string, length: number): THREE.MeshToonMaterial {
  const tex = wallTexture(style).clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, length / 4), 1);
  const m = new THREE.MeshToonMaterial({ map: tex });
  if (style === 'wall_neon' || style === 'wall_galaxy' || style === 'wall_gold') {
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = style === 'wall_neon' ? 0.55 : style === 'wall_galaxy' ? 0.5 : 0.3;
  }
  m.userData.outlineParameters = { thickness: 0.0034, color: [0.02, 0.02, 0.05], alpha: 1, visible: true };
  return m;
}

const flat = (map: THREE.Texture, w: number, h: number): THREE.Mesh => {
  const mat = new THREE.MeshBasicMaterial({ map });
  mat.userData.outlineParameters = { visible: false };
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
};

const artCache = new Map<string, THREE.CanvasTexture>();
/** One picture on the wall: a poster, a framed picture, a vinyl or a gold record. */
function artTexture(style: string, i: number): THREE.CanvasTexture {
  const key = `${style}:${i % 4}`;
  let t = artCache.get(key);
  if (t) return t;
  const r = rnd(31 + i * 17);
  const hue = [330, 190, 45, 270][i % 4];
  t = canvasTexture(128, 160, (g) => {
    if (style === 'art_posters') {
      const grad = g.createLinearGradient(0, 0, 128, 160);
      grad.addColorStop(0, `hsl(${hue},90%,55%)`);
      grad.addColorStop(1, `hsl(${(hue + 60) % 360},90%,35%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = '900 30px "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.fillText(['LIVE', 'DJ', 'NOCHE', 'FIESTA'][i % 4], 64, 60);
      g.font = '800 15px sans-serif';
      g.fillText(['SÁBADO', 'EN VIVO', 'TODA LA NOCHE', 'ENTRADA LIBRE'][i % 4], 64, 90);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(64, 124, 22, 0, Math.PI * 2);
      g.fill();
    } else if (style === 'art_frames') {
      g.fillStyle = '#6a4220';
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#f4efe2';
      g.fillRect(10, 10, 108, 140);
      if (i % 2) {
        g.fillStyle = '#0d0d16';
        g.beginPath();
        g.arc(64, 80, 46, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2b2b40';
        for (let q = 40; q > 14; q -= 5) {
          g.beginPath();
          g.arc(64, 80, q, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = `hsl(${hue},85%,55%)`;
        g.beginPath();
        g.arc(64, 80, 13, 0, Math.PI * 2);
        g.fill();
      } else {
        for (let q = 0; q < 7; q++) {
          g.fillStyle = `hsl(${(hue + q * 40) % 360},80%,${45 + r() * 15}%)`;
          g.fillRect(14 + r() * 60, 14 + r() * 100, 30 + r() * 60, 20 + r() * 40);
        }
      }
    } else if (style === 'art_neon') {
      g.fillStyle = '#0c0c18';
      g.fillRect(0, 0, 128, 160);
      const col = ['#ff3da6', '#18e0ff', '#ffd23a', '#9aff4a'][i % 4];
      g.strokeStyle = col;
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 12;
      g.lineWidth = 5;
      g.lineCap = 'round';
      if (i % 4 === 0) { g.beginPath(); g.arc(64, 70, 34, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(52, 62); g.lineTo(52, 76); g.moveTo(76, 62); g.lineTo(76, 76); g.stroke(); g.beginPath(); g.arc(64, 78, 16, 0.2, Math.PI - 0.2); g.stroke(); }
      else if (i % 4 === 1) { g.beginPath(); g.moveTo(64, 120); g.bezierCurveTo(10, 78, 28, 28, 64, 56); g.bezierCurveTo(100, 28, 118, 78, 64, 120); g.stroke(); }
      else if (i % 4 === 2) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2; const rr = k % 2 ? 16 : 38; g.lineTo(64 + Math.cos(a) * rr, 72 + Math.sin(a) * rr); } g.closePath(); g.stroke(); }
      else { g.font = '900 34px "Arial Black", sans-serif'; g.textAlign = 'center'; g.fillText('DJ', 64, 84); g.strokeRect(22, 40, 84, 60); }
      g.shadowBlur = 0;
    } else if (style === 'art_gallery') {
      const gold = g.createLinearGradient(0, 0, 128, 160);
      gold.addColorStop(0, '#f4d878');
      gold.addColorStop(0.5, '#b8861a');
      gold.addColorStop(1, '#f0d070');
      g.fillStyle = gold;
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#1a1424';
      g.fillRect(12, 12, 104, 136);
      for (let q = 0; q < 9; q++) {
        g.fillStyle = `hsla(${(hue + q * 37) % 360},75%,${45 + r() * 20}%,.85)`;
        g.beginPath();
        g.arc(24 + r() * 80, 24 + r() * 112, 8 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
    } else if (style === 'art_stars') {
      g.fillStyle = '#d8dce8';
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#1a2a52';
      g.fillRect(8, 8, 112, 144);
      const pl = g.createRadialGradient(64, 70, 6, 64, 70, 46);
      pl.addColorStop(0, '#ffffff');
      pl.addColorStop(0.6, '#c8d0e4');
      pl.addColorStop(1, '#8a94b0');
      g.fillStyle = pl;
      g.beginPath();
      g.arc(64, 70, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#14122c';
      g.beginPath();
      g.arc(64, 70, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd23a';
      for (const sx of [34, 64, 94]) { g.beginPath(); g.arc(sx, 138, 5, 0, Math.PI * 2); g.fill(); }
    } else {
      g.fillStyle = '#ffc81a';
      g.fillRect(0, 0, 128, 160);
      g.fillStyle = '#7a1a2a';
      g.fillRect(8, 8, 112, 144);
      const gold = g.createRadialGradient(64, 70, 6, 64, 70, 46);
      gold.addColorStop(0, '#fff6c0');
      gold.addColorStop(0.5, '#ffd23a');
      gold.addColorStop(1, '#b8860b');
      g.fillStyle = gold;
      g.beginPath();
      g.arc(64, 70, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#14122c';
      g.beginPath();
      g.arc(64, 70, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffe9a0';
      g.fillRect(24, 128, 80, 14);
    }
  });
  artCache.set(key, t);
  return t;
}

const FLOORS: Record<string, { a: number; b: number }> = {
  floor_cement: { a: 0x5b5f6b, b: 0x50545f },
  floor_tile: { a: 0xd6d1c4, b: 0xc6c1b3 },
  floor_checker: { a: 0xf2f2f2, b: 0x1a1a22 },
  floor_wood: { a: 0xb07a45, b: 0xa06c3a },
  floor_marble: { a: 0x2a2a35, b: 0x30303c },
  floor_led: { a: 0x18b8e0, b: 0xd02a88 },
  floor_carpet: { a: 0x9c1d2e, b: 0x8a1828 },
  floor_terrazzo: { a: 0xd8cfc4, b: 0xcbc1b4 },
  floor_gold: { a: 0xd9a928, b: 0x16121c },
  floor_aqua: { a: 0x2ee6c8, b: 0x1a7ae0 },
};
const LED_FLOORS = new Set(['floor_led', 'floor_aqua']);

export function buildShell(p: Phase, sel: Decor['sel']): Shell {
  // ---- floor (instanced: cheap even for the biggest building)
  const style = FLOORS[sel.floor] ?? FLOORS.floor_cement;
  const led = LED_FLOORS.has(sel.floor);
  const mat = led ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : toon(0xffffff, { outline: false });
  if (led) mat.userData.outlineParameters = { visible: false };
  const floor = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.04, 0.98), mat, p.w * p.h);
  const ca = new THREE.Color(style.a);
  const cb = new THREE.Color(style.b);
  const r = rnd(11);
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Color();
  let i = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      m4.setPosition(x + 0.5, -0.02, y + 0.5);
      floor.setMatrixAt(i, m4);
      if (sel.floor === 'floor_wood') tmp.copy(ca).lerp(cb, ((y * 7 + x * 3) % 5) / 4).offsetHSL(0, 0, (r() - 0.5) * 0.05);
      else if (sel.floor === 'floor_terrazzo') tmp.copy(ca).lerp(cb, r()).offsetHSL((r() - 0.5) * 0.08, 0.05, (r() - 0.5) * 0.12);
      else if (sel.floor === 'floor_marble') tmp.copy(ca).lerp(cb, r()).offsetHSL(0, 0, (r() - 0.5) * 0.04);
      else tmp.copy((x + y) % 2 ? ca : cb);
      floor.setColorAt(i, tmp);
      i++;
    }
  }

  // ---- walls with their moulding and pictures
  const rgb: THREE.MeshToonMaterial[] = [];
  const north = new THREE.Mesh(new THREE.BoxGeometry(p.w + 0.3, 2.5, 0.22), wallMaterial(sel.wall, p.w));
  north.position.set(p.w / 2, 1.25, -0.11);
  const west = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.5, p.h + 0.3), wallMaterial(sel.wall, p.h));
  west.position.set(-0.11, 1.25, p.h / 2);
  const wallN = new THREE.Group();
  const wallW = new THREE.Group();
  wallN.add(north);
  wallW.add(west);

  const band = (alongX: boolean, len: number, y: number, h: number, depth: number, color: number, o?: Parameters<typeof toon>[1]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : depth, h, alongX ? depth : len), toon(color, o));
    m.position.set(alongX ? len / 2 : depth / 2 - 0.02, y, alongX ? depth / 2 - 0.02 : len / 2);
    return m;
  };
  const trim = sel.trim;
  const wood = 0x6a4a2a;
  const goldC = 0xffc81a;
  for (const [along, len, grp] of [[true, p.w, wallN], [false, p.h, wallW]] as const) {
    if (trim === 'trim_baseboard' || trim === 'trim_neon') {
      grp.add(band(along, len, 0.12, 0.24, 0.1, wood), band(along, len, 2.42, 0.1, 0.1, wood));
    }
    if (trim === 'trim_neon') {
      const c = along ? 0x18e0ff : 0xff3da6;
      grp.add(band(along, len, 2.25, 0.07, 0.05, c, { emissive: c, emissiveIntensity: 1.2, outline: false }));
    }
    if (trim === 'trim_rgb') {
      for (const y of [2.25, 0.25]) {
        const m = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
        m.userData.outlineParameters = { visible: false };
        rgb.push(m);
        const strip = band(along, len, y, 0.07, 0.05, 0xffffff);
        strip.material = m;
        grp.add(strip);
      }
    }
    if (trim === 'trim_chrome') {
      const ch = { emissive: 0x8890a8, emissiveIntensity: 0.35 };
      grp.add(band(along, len, 0.12, 0.24, 0.1, 0xd0d4e0, ch), band(along, len, 2.42, 0.12, 0.1, 0xd0d4e0, ch), band(along, len, 1.25, 0.04, 0.05, 0xd0d4e0, ch));
    }
    if (trim === 'trim_crystal') {
      for (const y of [2.3, 0.2]) grp.add(band(along, len, y, 0.09, 0.05, 0xa8f0ff, { emissive: 0xa8f0ff, emissiveIntensity: 1.3, outline: false }));
      grp.add(band(along, len, 2.42, 0.06, 0.08, 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9, outline: false }));
    }
    if (trim === 'trim_fire') {
      for (const [y, hh] of [[2.3, 0.1], [0.14, 0.18]] as const) grp.add(band(along, len, y, hh, 0.06, 0xff7a1e, { emissive: 0xff5a0a, emissiveIntensity: 1.5, outline: false }));
      grp.add(band(along, len, 2.42, 0.06, 0.08, 0xffd23a, { emissive: 0xffb02a, emissiveIntensity: 1.1, outline: false }));
    }
    if (trim === 'trim_royal') {
      grp.add(band(along, len, 0.14, 0.28, 0.12, goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }), band(along, len, 2.4, 0.14, 0.12, goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
      grp.add(band(along, len, 2.22, 0.07, 0.05, 0xb04cff, { emissive: 0xb04cff, emissiveIntensity: 1.4, outline: false }));
      for (let c = 0; c <= len; c += 3) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), toon(goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
        col.position.set(along ? c : 0.03, 1.25, along ? 0.03 : c);
        grp.add(col);
      }
    }
    if (trim === 'trim_gold') {
      grp.add(band(along, len, 0.14, 0.28, 0.12, goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }), band(along, len, 2.4, 0.14, 0.12, goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
      for (let c = 0; c <= len; c += 4) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.5, 0.22), toon(goldC, { emissive: 0x8a5a00, emissiveIntensity: 0.5 }));
        col.position.set(along ? c : 0.03, 1.25, along ? 0.03 : c);
        grp.add(col);
      }
    }
  }

  // pictures on both walls (the north one carries the most)
  if (sel.art !== 'art_none') {
    const place = (grp: THREE.Group, along: boolean, len: number) => {
      const step = sel.art === 'art_gold' ? 3.4 : sel.art === 'art_gallery' ? 3.2 : 2.7;
      for (let k = 0, c = 1.8; c < len - 1.2; c += step, k++) {
        const w = sel.art === 'art_posters' ? 0.8 : 0.78;
        const pic = flat(artTexture(sel.art, k + (along ? 0 : 2)), w, w * 1.25);
        pic.position.set(along ? c : 0.13, 1.35, along ? 0.13 : c);
        pic.rotation.y = along ? 0 : Math.PI / 2;
        if (sel.art === 'art_posters') pic.rotation.z = (k % 2 ? 1 : -1) * 0.05; // stuck on a bit crooked
        grp.add(pic);
        if (sel.art === 'art_gold' && k % 2 === 1) {
          const tv = flat(wallTexture('wall_neon'), 1.1, 0.62);
          tv.position.set(along ? c + 1.5 : 0.14, 1.5, along ? 0.14 : c + 1.5);
          tv.rotation.y = along ? 0 : Math.PI / 2;
          grp.add(tv);
        }
      }
    };
    place(wallN, true, p.w);
    place(wallW, false, p.h);
  }

  const L: Record<string, Shell['lights']> = {
    light_bare: { mul: 0.22, a: 0xffd890, b: 0xffc070, shift: false },
    light_spots: { mul: 0.6, a: 0xff8a1e, b: 0x3a7bff, shift: false },
    light_disco: { mul: 1, a: 0x18d8ff, b: 0xff2d9a, shift: false },
    light_laser: { mul: 1.45, a: 0x35f08a, b: 0xff2d9a, shift: true },
    light_sunset: { mul: 1.1, a: 0xff7a3a, b: 0xff2d7a, shift: false },
    light_aurora: { mul: 1.3, a: 0x35f0c8, b: 0xb04cff, shift: true },
    light_royal: { mul: 1.5, a: 0xffc81a, b: 0xd6314a, shift: false },
    light_ultra: { mul: 1.9, a: 0x18d8ff, b: 0xff2d9a, shift: true },
  };
  return { floor, wallN, wallW, rgb, led: led ? (mat as THREE.MeshBasicMaterial) : null, lights: L[sel.light] ?? L.light_bare };
}
