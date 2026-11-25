import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from './comic';
import { toon, type ToonOpts } from './toon';

// Models built from primitives (1 tile = 1 unit). Each is centred on its footprint, sits on y = 0 and faces +Z at
// rotation 0. Style: bright saturated colours, rounded edges, neon trims and small details, like the original game.

const GOLD = 0xffc81a;
const CHROME = 0xdfe6f2;
const PLUM = 0x2d2352;
const WOOD = 0xc07a3a;
const WOOD_DARK = 0x8a4f26;

type O = ToonOpts;
const glow = (c: number, i = 1.2): O => ({ emissive: c, emissiveIntensity: i, outline: false });

/** Rounded box (corners softened), sitting on `y`, centred on x/z. */
function box(w: number, h: number, d: number, color: number | string, x: number, y: number, z: number, o?: O, r = Math.min(0.045, w / 3, h / 3, d / 3)): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(0.004, r)), toon(color, o));
  m.position.set(x, y + h / 2, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, color: number | string, x: number, y: number, z: number, seg = 16, o?: O): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), toon(color, o));
  m.position.set(x, y + h / 2, z);
  return m;
}

function ball(r: number, color: number | string, x: number, y: number, z: number, o?: O & { detail?: number; flat?: boolean }): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, o?.detail ?? 2), toon(color, o));
  m.position.set(x, y, z);
  return m;
}

function torus(r: number, tube: number, color: number | string, x: number, y: number, z: number, o?: O, rotX = Math.PI / 2): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 24), toon(color, o));
  m.position.set(x, y, z);
  m.rotation.x = rotX;
  return m;
}

/** An unlit picture (screens): bright whatever the lights do. */
function picture(w: number, h: number, tex: THREE.Texture, x: number, y: number, z: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  mat.userData.outlineParameters = { visible: false };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  return m;
}

const screenCache = new Map<string, THREE.CanvasTexture>();
/** A colourful screen image: sunset bars, a wave or a music visualiser. */
function screenTex(kind: 'tv' | 'big'): THREE.CanvasTexture {
  let t = screenCache.get(kind);
  if (!t) {
    t = canvasTexture(256, 144, (g) => {
      const grad = g.createLinearGradient(0, 0, 256, 144);
      grad.addColorStop(0, kind === 'tv' ? '#2a1a8a' : '#6a1aa8');
      grad.addColorStop(0.55, '#ff2d9a');
      grad.addColorStop(1, '#ffb11e');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 144);
      // a sun and a city skyline
      g.fillStyle = 'rgba(255,240,170,.9)';
      g.beginPath();
      g.arc(190, 52, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#16113a';
      for (let i = 0; i < 14; i++) g.fillRect(i * 19, 100 - ((i * 37) % 38), 17, 60);
      // equalizer bars
      for (let i = 0; i < 22; i++) {
        const h = 12 + ((i * 53) % 46);
        g.fillStyle = `hsl(${180 + i * 7},95%,62%)`;
        g.fillRect(8 + i * 11, 134 - h, 8, h);
      }
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      g.strokeRect(2, 2, 252, 140);
    });
    screenCache.set(kind, t);
  }
  return t;
}

const recordTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () =>
    (t ??= canvasTexture(128, 128, (g) => {
      g.fillStyle = '#0d0d16';
      g.fillRect(0, 0, 128, 128);
      for (let r = 56; r > 14; r -= 5) {
        g.strokeStyle = r % 10 ? '#1d1d2c' : '#2b2b40';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(64, 64, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#ff3da6';
      g.beginPath();
      g.arc(64, 64, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(64, 64, 3, 0, Math.PI * 2);
      g.fill();
    }));
})();

type Builder = (g: THREE.Group, tier: number) => void;


const pick = <T,>(tier: number, a: T, b: T, c: T, d: T): T => [a, b, c, d][tier - 1];

/**
 * Props that move carry `userData.tick(time, beat, pulse, dt)`; the club view calls it every frame. `beat` counts beats of
 * the song playing (or a steady clock when nothing plays) and `pulse` is 1 on each kick, fading to 0.
 */
export type PropTick = (time: number, beat: number, pulse: number, dt: number) => void;

/** A speaker cone that pumps out with every kick. */
function pump(m: THREE.Mesh, amount = 1): THREE.Mesh {
  const z0 = m.position.z;
  const s0 = m.scale.clone();
  m.userData.tick = ((_t, _b, p) => {
    m.position.z = z0 + 0.035 * p * amount;
    m.scale.set(s0.x * (1 + 0.14 * p * amount), s0.y, s0.z * (1 + 0.14 * p * amount));
  }) as PropTick;
  return m;
}

interface DancerLook { top: number; bottom: number; skin: number; hair: number; shoes: number; lit?: O }

/**
 * A pole dancer with joints (hips, knees, waist, shoulders, elbows) who runs a routine on the beat: spinning round the
 * pole, dancing facing the crowd with her arms up, sliding down the pole and a body roll. `r` is how far she stands from
 * the pole. Returns the group to add at the foot of the pole.
 */
function poleDancer(look: DancerLook, r: number, scale: number): THREE.Group {
  const mat = (c: number, o?: O) => toon(c, o);
  const capsule = (rad: number, len: number, c: number, y: number, o?: O) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 10), mat(c, o));
    m.position.y = y;
    return m;
  };
  const orbit = new THREE.Group(); // turns round the pole
  const root = new THREE.Group(); // the body, at distance r from the pole
  root.scale.setScalar(scale);
  orbit.add(root);

  const leg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.07, 0.5, 0);
    hip.add(capsule(0.055, 0.2, look.skin, -0.13));
    const knee = new THREE.Group();
    knee.position.y = -0.26;
    knee.add(capsule(0.042, 0.18, look.skin, -0.11));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.13), mat(look.shoes));
    shoe.position.set(0, -0.23, 0.03);
    knee.add(shoe);
    hip.add(knee);
    root.add(hip);
    return { hip, knee };
  };
  const L = leg(1);
  const R = leg(-1);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), mat(look.bottom, look.lit));
  pelvis.scale.set(1.1, 0.75, 0.85);
  pelvis.position.y = 0.53;
  root.add(pelvis);

  const upper = new THREE.Group(); // pivots at the waist
  upper.position.y = 0.6;
  root.add(upper);
  upper.add(capsule(0.07, 0.1, look.skin, 0.06));
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), mat(look.top, look.lit));
  chest.scale.set(1.05, 1.1, 0.85);
  chest.position.y = 0.24;
  upper.add(chest, capsule(0.03, 0.05, look.skin, 0.37));
  const head = new THREE.Group();
  head.position.y = 0.5;
  const face = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), mat(look.skin));
  const mane = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), mat(look.hair));
  mane.scale.set(1.05, 1.2, 0.95);
  mane.position.set(0, 0.01, -0.035);
  const tail = capsule(0.05, 0.2, look.hair, -0.17);
  tail.position.z = -0.09;
  head.add(face, mane, tail);
  upper.add(head);

  const arm = (side: number) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.14, 0.33, 0);
    sh.add(capsule(0.032, 0.16, look.skin, -0.1));
    const el = new THREE.Group();
    el.position.y = -0.22;
    el.add(capsule(0.028, 0.15, look.skin, -0.09));
    sh.add(el);
    upper.add(sh);
    return { sh, el };
  };
  const AL = arm(1);
  const AR = arm(-1);

  // a pose is a set of joint angles; the routine blends from one move to the next
  type Pose = {
    face: number; speed: number; y: number; sway: number; lean: number; twist: number; tilt: number; nod: number;
    lHip: number; lKnee: number; rHip: number; rKnee: number;
    lArmX: number; lArmZ: number; lEl: number; rArmX: number; rArmZ: number; rEl: number;
  };
  const S = Math.sin;
  const moves: Array<(b: number) => Pose> = [
    // spin: one hand high on the pole, one leg hooked out, turning fast
    (b) => ({ face: -Math.PI / 2 + 0.5, speed: 2.4, y: 0.04 + 0.03 * S(b * Math.PI), sway: 0, lean: -0.25, twist: 0.2, tilt: 0.1, nod: -0.2,
      lHip: -0.15, lKnee: 0.2, rHip: -1.0, rKnee: 0.9, lArmX: -0.6, lArmZ: 1.3, lEl: -0.3, rArmX: -2.7, rArmZ: 0.2, rEl: -0.2 }),
    // facing the crowd: hips side to side, arms up waving
    (b) => ({ face: Math.PI / 2, speed: 0, y: -0.03 * Math.abs(S(b * Math.PI)), sway: 0.06 * S(b * Math.PI), lean: 0.05, twist: 0.15 * S(b * Math.PI), tilt: -0.12 * S(b * Math.PI), nod: 0.1 * S(b * Math.PI * 2),
      lHip: -0.1, lKnee: 0.25 + 0.25 * Math.abs(S(b * Math.PI)), rHip: -0.1, rKnee: 0.25 + 0.25 * Math.abs(S(b * Math.PI + 1.5)),
      lArmX: -2.6 + 0.3 * S(b * Math.PI), lArmZ: 0.35, lEl: -0.6, rArmX: -2.6 - 0.3 * S(b * Math.PI), rArmZ: -0.35, rEl: -0.6 }),
    // back to the pole, sliding down and up again
    (b) => {
      const d = 0.5 - 0.5 * Math.cos(b * Math.PI * 0.5);
      return { face: Math.PI / 2, speed: 0.3, y: -0.2 * d, sway: 0, lean: -0.15 - 0.15 * d, twist: 0, tilt: 0.1 * S(b * Math.PI), nod: -0.3 * d,
        lHip: -1.2 * d, lKnee: 1.9 * d, rHip: -1.2 * d - 0.1, rKnee: 1.9 * d, lArmX: -2.9, lArmZ: -0.2, lEl: -0.4, rArmX: -2.9, rArmZ: 0.2, rEl: -0.4 };
    },
    // body roll, side on to the pole, arms in front
    (b) => ({ face: -0.2, speed: 0.7, y: -0.02, sway: 0.04 * S(b * Math.PI + 1), lean: 0.3 * S(b * Math.PI), twist: 0.2 * S(b * Math.PI * 0.5), tilt: 0.15 * S(b * Math.PI + 1), nod: -0.25 * S(b * Math.PI),
      lHip: -0.2 * S(b * Math.PI), lKnee: 0.3 + 0.2 * S(b * Math.PI), rHip: 0.1, rKnee: 0.2,
      lArmX: -1.4, lArmZ: 0.4, lEl: -1.4 + 0.4 * S(b * Math.PI), rArmX: -1.3, rArmZ: -0.4, rEl: -1.4 - 0.4 * S(b * Math.PI) }),
  ];
  const BARS = 8; // beats per move
  let angle = Math.random() * Math.PI * 2;
  orbit.userData.tick = ((_t, beat, _p, dt) => {
    const k = Math.floor(beat / BARS);
    const f = (beat % BARS) / BARS;
    const a = moves[((k % moves.length) + moves.length) % moves.length](beat);
    let w = 0;
    let p = a;
    if (f > 0.85) {
      // blend into the next move over the last beat or so
      const x = (f - 0.85) / 0.15;
      w = x * x * (3 - 2 * x);
      const n = moves[(((k + 1) % moves.length) + moves.length) % moves.length](beat);
      p = {} as Pose;
      for (const key of Object.keys(a) as Array<keyof Pose>) p[key] = a[key] + (n[key] - a[key]) * w;
    }
    angle += p.speed * Math.min(dt, 0.1);
    orbit.rotation.y = angle;
    root.position.set(r + p.sway * scale, p.y * scale, 0);
    root.rotation.y = p.face;
    upper.rotation.set(p.lean, p.twist, p.tilt);
    head.rotation.x = p.nod;
    L.hip.rotation.x = p.lHip;
    L.knee.rotation.x = p.lKnee;
    R.hip.rotation.x = p.rHip;
    R.knee.rotation.x = p.rKnee;
    AL.sh.rotation.set(p.lArmX, 0, p.lArmZ);
    AL.el.rotation.x = p.lEl;
    AR.sh.rotation.set(p.rArmX, 0, p.rArmZ);
    AR.el.rotation.x = p.rEl;
  }) as PropTick;
  orbit.userData.tick(0, 0, 0, 0);
  return orbit;
}

/** Colours of the seats by version: faded plastic, red vinyl, leather with chrome, royal velvet with gold. */
function seatPal(tier: number): { main: number; dark: number; leg: number; accent: number; glow: number } {
  return {
    main: pick(tier, 0x7d7f8c, 0xe8303a, 0xa31c33, 0x5a24b0),
    dark: pick(tier, 0x5a5c68, 0xb81f2d, 0x7a1226, 0x3d1580),
    leg: pick(tier, 0x4a4a54, 0xdfe6f2, 0xeef2fa, 0xffc81a),
    accent: pick(tier, 0x6a6c78, 0xff6a72, 0xd8405a, 0xffd860),
    glow: pick(tier, 0, 0, 0, 1),
  };
}

/** Table tops: bare chipboard, wood, glass, marble with gold. */
function tablePal(tier: number): { top: number; rim: number; pole: number } {
  return { top: pick(tier, 0x9a8a70, 0xc07a3a, 0xbfe9ff, 0xf2eef6), rim: pick(tier, 0x6a5a44, 0x8a4f26, 0xdfe6f2, 0xffc81a), pole: pick(tier, 0x6a5a55, 0xdfe6f2, 0xeef2fa, 0xffc81a) };
}

const TIERED: Record<string, Builder> = {
  dance_cage: (g, t) => {
    // a glass box with a pole and a dancer who turns round it: 1 scaffold pipes and a bare bulb · 2 black frame, pink neon · 3 chrome, LED roof, mirror base · 4 gold frame, crystal glass, mirror ball and sparkles
    const frame = pick(t, 0x5a5c68, 0x1c1530, 0xdfe6f2, 0xffc81a);
    const neon = pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860);
    const base = pick(t, 0x4a3d58, 0x2a1850, 0x16213f, 0x15101f);
    g.add(box(1.9, 0.16, 1.9, base, 0, 0, 0, undefined, 0.03));
    if (t >= 3) g.add(box(1.5, 0.02, 1.5, 0xbfe9ff, 0, 0.16, 0, { opacity: 0.55, outline: false }, 0.005));
    for (const [x, z, w, d] of [[0, -0.97, 1.96, 0.05], [0, 0.97, 1.96, 0.05], [-0.97, 0, 0.05, 1.96], [0.97, 0, 0.05, 1.96]] as const) g.add(box(w, 0.05, d, neon, x, 0.16, z, t === 1 ? undefined : glow(neon, 1.3), 0.01));
    // the glass: four panes
    const pane = pick(t, 0xcdf0ff, 0xcdf0ff, 0xb8e8ff, 0xfff2c8);
    for (const [x, z, w, d] of [[0, -0.93, 1.8, 0.03], [0, 0.93, 1.8, 0.03], [-0.93, 0, 0.03, 1.8], [0.93, 0, 0.03, 1.8]] as const) g.add(box(w, 1.9, d, pane, x, 0.2, z, { opacity: t === 1 ? 0.14 : 0.2, outline: false }, 0.005));
    for (const [x, z] of [[-0.93, -0.93], [0.93, -0.93], [-0.93, 0.93], [0.93, 0.93]] as const) g.add(cyl(0.05, 0.05, 2.05, frame, x, 0.12, z, 8));
    g.add(box(1.96, 0.1, 1.96, frame, 0, 2.1, 0, undefined, 0.02));
    if (t === 1) g.add(ball(0.09, 0xfff1a0, 0, 2.0, 0, { detail: 1, ...glow(0xffe08a, 1.2) }));
    if (t >= 2) g.add(box(1.7, 0.03, 1.7, neon, 0, 2.06, 0, glow(neon, 1.6), 0.01));
    if (t === 4) {
      g.add(ball(0.2, 0xf2f6ff, 0, 1.78, 0, { detail: 1, emissive: 0xffffff, emissiveIntensity: 0.5 }));
      for (const [x, y, z] of [[-0.6, 1.4, 0.5], [0.6, 1.1, -0.5], [0.3, 1.7, 0.7], [-0.5, 0.9, -0.6]] as const) g.add(ball(0.04, 0xfff1a0, x, y, z, { detail: 1, ...glow(0xffd860, 2.2) }));
    }
    // the pole
    g.add(cyl(0.04, 0.04, 1.95, 0xdfe6f2, 0, 0.16, 0, 10));
    // the dancer: jointed, she spins round the pole and dances a routine on the beat
    const dancer = poleDancer({
      top: pick(t, 0xff4fa3, 0x18e0ff, 0xb04cff, 0xffc81a),
      bottom: pick(t, 0x2a2238, 0x15101f, 0x15101f, 0x15101f),
      skin: pick(t, 0xe8b890, 0xc98e66, 0xf0c8a0, 0x8a5a3c),
      hair: pick(t, 0x3a2418, 0x15101f, 0xe8d36a, 0xff4fa3),
      shoes: pick(t, 0x2a2238, 0xd6314a, 0xdfe6f2, 0xffc81a),
      lit: t === 4 ? glow(pick(t, 0, 0, 0, 0xffc81a), 0.45) : undefined,
    }, 0.3, 1.3);
    dancer.position.y = 0.16;
    g.add(dancer);
  },
  bar_straight: (g, t) => {
    // 1 plywood and a plank for the bottles · 2 wood, blue top, neon · 3 walnut, marble, brass rail, lit glass shelves · 4 black lacquer, onyx, gold, mirror and pendant lamps
    const body = pick(t, 0xa07a50, WOOD, 0x6a3a1c, 0x15101f);
    const topC = pick(t, 0x6a7088, 0x2d7bff, 0xf2f0ee, 0x1a1530);
    g.add(box(2.95, 0.9, 0.66, body, 0, 0, 0.1, undefined, t === 1 ? 0.012 : 0.045));
    if (t === 2) for (let i = 0; i < 6; i++) g.add(box(0.42, 0.74, 0.04, i % 2 ? WOOD_DARK : 0xd98a45, -1.25 + i * 0.5, 0.08, 0.45));
    if (t === 3) for (let i = 0; i < 5; i++) g.add(box(0.5, 0.7, 0.03, i % 2 ? 0x7e4824 : 0x5a2e14, -1.2 + i * 0.6, 0.1, 0.44));
    if (t === 4) for (let i = 0; i < 4; i++) g.add(box(0.05, 0.78, 0.03, GOLD, -1.1 + i * 0.73, 0.06, 0.44, glow(GOLD, 0.5)));
    g.add(box(3.05, 0.1, 0.9, topC, 0, 0.9, 0.1, t === 4 ? { emissive: 0x2a3cff, emissiveIntensity: 0.25 } : undefined, 0.05));
    if (t >= 2) g.add(box(3.05, 0.03, 0.9, pick(t, 0, 0x8fd0ff, 0xffffff, 0x5a6aff), 0, 1.0, 0.1, { opacity: t === 2 ? 0.5 : 0.35, outline: false }));
    if (t >= 3) g.add(box(3.1, 0.05, 0.05, t === 4 ? GOLD : 0xd4a640, 0, 1.0, 0.56, t === 4 ? glow(GOLD, 0.7) : undefined)); // brass or gold edge
    if (t >= 3) g.add(cyl(0.03, 0.03, 2.9, t === 4 ? GOLD : 0xd4a640, 0, 0.2, 0.55, 8).rotateZ(Math.PI / 2)); // foot rail
    if (t >= 2) {
      g.add(box(2.9, 0.05, 0.05, 0x18e0ff, 0, 0.78, 0.46, glow(0x18e0ff)));
      g.add(box(2.9, 0.05, 0.05, 0xff3da6, 0, 0.12, 0.46, glow(0xff3da6)));
    }
    // the back of the bar: a plank, a shelf with bottles, lit glass shelves, or a mirror wall
    if (t === 1) {
      g.add(box(2.4, 0.05, 0.22, 0x8a6a44, 0, 0.8, -0.38));
      for (const x of [-1.1, 1.1]) g.add(box(0.05, 0.4, 0.2, 0x5a4a38, x, 0.4, -0.38));
    } else {
      g.add(box(2.9, t === 4 ? 1.35 : 1.25, 0.12, pick(t, 0, 0x3a2a5a, 0x2a1a3a, 0x0a0816), 0, 0, -0.43));
      if (t === 4) g.add(box(2.7, 1.1, 0.02, 0x9fd0ff, 0, 0.12, -0.36, { emissive: 0x6a9aff, emissiveIntensity: 0.4, opacity: 0.55, outline: false })); // mirror
      for (const y of t === 4 ? [0.5, 0.85, 1.2] : [0.55, 1.0]) {
        g.add(box(2.8, 0.04, 0.2, t >= 3 ? 0xdff3ff : 0xc8a070, 0, y, -0.33, t >= 3 ? { opacity: 0.6, outline: false } : undefined));
        if (t >= 3) g.add(box(2.7, 0.025, 0.04, 0xffe9b0, 0, y - 0.02, -0.25, glow(0xffd060, 1.2))); // light under each shelf
      }
    }
    const cols = [0x18d86a, 0xffd21e, 0xff3a3a, 0x18e0ff, 0xff3da6, 0xb04cff, 0xff8a1e];
    const rows = t === 1 ? [0.85] : t === 4 ? [0.54, 0.89, 1.24] : [0.59, 1.04];
    const per = t === 1 ? 5 : 12;
    rows.forEach((y, row) => {
      for (let i = 0; i < per; i++) {
        const c = t === 1 ? [0x4a7a4a, 0x8a7a3a, 0x6a4a4a][i % 3] : cols[(i + row * 3) % cols.length];
        const x = t === 1 ? -0.9 + i * 0.45 : -1.3 + i * 0.236;
        g.add(cyl(0.045, 0.055, 0.2, c, x, y, -0.33, 8, t === 1 ? undefined : { emissive: c, emissiveIntensity: t >= 3 ? 0.6 : 0.45 }));
        g.add(cyl(0.02, 0.03, 0.08, c, x, y + 0.2, -0.33, 8));
      }
    });
    if (t >= 2) for (let i = 0; i < 6; i++) g.add(cyl(0.05, 0.04, 0.1, 0xeaf6ff, -1.1 + i * 0.44, 1.0, 0.25, 10, { opacity: 0.7, outline: false })); // glasses
    if (t === 4) for (const x of [-0.9, 0, 0.9]) {
      g.add(cyl(0.012, 0.012, 0.5, GOLD, x, 1.55, 0.1, 6));
      g.add(ball(0.12, 0xfff1c0, x, 1.5, 0.1, { detail: 2, ...glow(0xffd060, 1.6) })); // pendant lamps
    }
  },

  speaker: (g, t) => {
    // 1 a small grey cabinet with one worn cone · 2 two cones with neon rings · 3 a bigger tower, chrome corners · 4 a three-module line array with gold rings and a crown light
    const mods = t === 4 ? 3 : 1;
    const h = pick(t, 1.0, 1.32, 1.5, 1.9);
    const w = pick(t, 0.5, 0.62, 0.68, 0.64);
    g.add(box(w, h, pick(t, 0.4, 0.5, 0.55, 0.52), pick(t, 0x4a4a54, PLUM, 0x2a1a5a, 0x18153a), 0, 0.04, 0, undefined, t === 1 ? 0.015 : 0.06));
    if (t >= 2) for (const y of [0.04, h]) g.add(box(w + 0.04, 0.06, 0.58, t === 4 ? GOLD : CHROME, 0, y, 0, undefined, 0.02));
    if (t === 1) g.add(box(0.12, 0.5, 0.01, 0x6a6a74, 0.15, 0.3, 0.205)); // a scuff
    const cones: Array<[number, number, number]> = t === 1 ? [[0.16, 0.5, 0x777788]] : t === 2 ? [[0.2, 0.86, 0x18e0ff], [0.15, 0.4, 0xff3da6]] : t === 3 ? [[0.22, 1.05, 0x18e0ff], [0.17, 0.62, 0xb04cff], [0.08, 0.26, 0xff3da6]] : [];
    if (t === 4) for (let m = 0; m < mods; m++) { cones.push([0.16, 0.34 + m * 0.6, 0xffc81a]); cones.push([0.07, 0.62 + m * 0.6, 0x18e0ff]); }
    for (const [r, y, c] of cones) {
      if (t >= 2) g.add(torus(r + 0.04, 0.03, c, 0, y, 0.255, glow(c, t === 4 ? 1.3 : 1), 0));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.45, 0.07, 20), toon(t === 1 ? 0x2a2a30 : 0x16142e));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, y, pick(t, 0.2, 0.25, 0.28, 0.26));
      g.add(pump(cone));
      g.add(ball(r * 0.3, t === 1 ? 0x55555f : 0x4a456f, 0, y, pick(t, 0.24, 0.29, 0.32, 0.3), { detail: 1, outline: false }));
    }
    if (t >= 2) g.add(box(0.3, 0.05, 0.03, 0x18e0ff, 0, h - 0.12, 0.27, glow(0x18e0ff)));
    if (t >= 3) {
      g.add(box(0.04, h * 0.8, 0.03, t === 4 ? 0x18e0ff : 0xff3da6, w / 2 - 0.02, 0.15, 0.27, glow(t === 4 ? 0x18e0ff : 0xff3da6, 1.2)));
      g.add(box(0.04, h * 0.8, 0.03, t === 4 ? 0x18e0ff : 0xff3da6, -w / 2 + 0.02, 0.15, 0.27, glow(t === 4 ? 0x18e0ff : 0xff3da6, 1.2)));
    }
    if (t === 4) {
      g.add(ball(0.11, 0xffe9a0, 0, h + 0.14, 0, { detail: 2, ...glow(0xffd060, 1.8) })); // crown light
      g.add(box(0.8, 0.05, 0.7, GOLD, 0, 0, 0, glow(GOLD, 0.4))); // plinth
    }
  },

  dj_booth: (g, t) => {
    // 1 a folding table with cheap decks · 2 a lit console · 3 three decks, a big LED panel · 4 four glowing decks, a light screen, gold, and a truss of lights
    if (t === 1) {
      g.add(box(1.9, 0.07, 0.7, 0x9a7a52, 0, 0.82, 0));
      for (const [x, z] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]] as const) g.add(cyl(0.03, 0.03, 0.82, 0x6a6a74, x, 0, z, 8));
      for (const x of [-0.6, 0.6]) {
        g.add(box(0.46, 0.06, 0.42, 0x5a5a64, x, 0.89, 0.04));
        g.add(cyl(0.17, 0.17, 0.02, 0x2a2a34, x, 0.95, 0.04, 20));
      }
      g.add(box(0.36, 0.08, 0.34, 0x3a3a46, 0, 0.89, 0.04));
      g.add(box(0.34, 0.02, 0.22, 0xb0b4c0, 0.7, 0.89, -0.2));
      g.add(box(0.34, 0.2, 0.02, 0x3a3a46, 0.7, 0.9, -0.3));
      return;
    }
    const body = pick(t, 0, 0x2a2060, 0x1a1250, 0x0e0a24);
    g.add(box(1.9, 0.95, 0.72, body, 0, 0, 0, undefined, 0.05));
    const cols = [0x18e0ff, 0xff3da6, 0xffd21e, 0x35f08a, 0xb04cff];
    if (t === 4) {
      g.add(picture(1.7, 0.7, screenTex('big'), 0, 0.46, 0.371)); // a light screen across the front
    } else {
      for (let r = 0; r < (t === 3 ? 3 : 2); r++) for (let i = 0; i < (t === 3 ? 13 : 9); i++) {
        const c = cols[(i + r) % 5];
        g.add(box(t === 3 ? 0.1 : 0.14, t === 3 ? 0.1 : 0.14, 0.03, c, (t === 3 ? -0.76 : -0.8) + i * (t === 3 ? 0.127 : 0.2), 0.18 + r * (t === 3 ? 0.2 : 0.22), 0.37, glow(c, 1.1)));
      }
    }
    g.add(box(1.96, 0.06, 0.78, pick(t, 0, 0x3b2f86, 0x2a2090, t === 4 ? GOLD : 0x2a2090), 0, 0.95, 0, t === 4 ? glow(GOLD, 0.25) : undefined, 0.03));
    g.add(box(1.9, 0.06, 0.05, 0x18e0ff, 0, 0.6, 0.38, glow(0x18e0ff)));
    g.add(box(1.9, 0.04, 0.05, 0xff3da6, 0, 0.1, 0.38, glow(0xff3da6)));
    const decks = t === 2 ? [-0.62, 0.62] : t === 3 ? [-0.75, 0, 0.75] : [-0.8, -0.27, 0.27, 0.8];
    const dw = t === 2 ? 0.5 : t === 3 ? 0.46 : 0.4;
    decks.forEach((x, i) => {
      g.add(box(dw, 0.05, 0.46, 0x14122c, x, 1.01, 0.08, undefined, 0.02));
      const rec = new THREE.Mesh(new THREE.CylinderGeometry(t === 4 ? 0.17 : 0.2, t === 4 ? 0.17 : 0.2, 0.02, 28), (() => { const m = new THREE.MeshBasicMaterial({ map: recordTex() }); m.userData.outlineParameters = { visible: false }; return m; })());
      rec.position.set(x, 1.075, 0.08);
      rec.userData.spin = 2.2 + i * 0.3;
      g.add(rec);
      if (t === 4) g.add(torus(0.19, 0.012, cols[i], x, 1.07, 0.08, glow(cols[i], 1.5), Math.PI / 2)); // a glowing ring around each deck
    });
    if (t <= 3) {
      g.add(box(0.5, 0.07, 0.4, 0x23224a, 0, 1.01, 0.08, undefined, 0.02));
      for (let i = 0; i < (t === 3 ? 6 : 4); i++) g.add(cyl(0.025, 0.025, 0.04, cols[i % 5], -0.2 + i * (t === 3 ? 0.08 : 0.1), 1.08, 0.2, 8, glow(cols[i % 5], 0.6)));
    } else {
      g.add(box(0.36, 0.06, 0.36, 0x23224a, 0, 1.01, 0.08, undefined, 0.02)); // the mixer, between the two middle decks
    }
    g.add(box(0.36, 0.02, 0.2, CHROME, 0.72, 1.07, -0.26, undefined, 0.01)); // laptop
    g.add(box(0.36, 0.22, 0.02, 0x23224a, 0.72, 1.08, -0.35));
    g.add(picture(0.32, 0.18, screenTex('tv'), 0.72, 1.2, -0.337));
    if (t === 4) {
      // a truss over the booth with three spotlights
      g.add(box(2.1, 0.06, 0.06, 0xcfd6e8, 0, 1.8, -0.2, undefined, 0.02));
      for (const x of [-0.8, 0.8]) g.add(box(0.05, 0.85, 0.05, 0xcfd6e8, x, 1.0, -0.2, undefined, 0.01));
      for (const [x, c] of [[-0.6, 0xff3da6], [0, 0x18e0ff], [0.6, 0xffd21e]] as const) g.add(ball(0.09, c, x, 1.72, -0.2, { detail: 1, ...glow(c, 1.8) }));
    }
  },

  stool: (g, t) => {
    const P = seatPal(t);
    g.add(cyl(0.2, 0.2, 0.09, P.main, 0, 0.5, 0, 20));
    g.add(torus(0.2, 0.025, P.dark, 0, 0.52, 0, undefined, Math.PI / 2));
    g.add(cyl(0.17, 0.17, 0.02, P.accent, 0, 0.59, 0, 20, { outline: false }));
    g.add(cyl(0.035, 0.035, 0.5, P.leg, 0, 0, 0, 10));
    g.add(torus(0.13, 0.015, P.leg, 0, 0.2, 0, undefined, Math.PI / 2));
    g.add(cyl(0.2, 0.23, 0.04, P.leg, 0, 0, 0, 20));
    if (t === 4) g.add(ball(0.04, 0xffe9a0, 0, 0.62, 0, { detail: 1, ...glow(0xffd860, 1.5) }));
    if (t === 1) g.add(box(0.16, 0.012, 0.05, 0x3a3a42, 0.06, 0.585, 0.06)); // a patch of tape
  },
  chair_red: (g, t) => {
    const P = seatPal(t);
    g.add(box(0.58, 0.14, 0.58, P.main, 0, 0.3, 0, undefined, 0.06));
    g.add(box(0.5, 0.05, 0.5, P.accent, 0, 0.44, 0, { outline: false }, 0.02));
    g.add(box(0.58, t >= 3 ? 0.62 : 0.5, 0.12, P.dark, 0, 0.44, -0.25, undefined, 0.06));
    for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]] as const) g.add(cyl(0.03, 0.025, 0.3, P.leg, x, 0, z, 8));
    if (t >= 3) for (let i = 0; i < 3; i++) g.add(ball(0.025, t === 4 ? 0xffd860 : 0xeef2fa, -0.15 + i * 0.15, 0.78, -0.18, { detail: 1, outline: false, ...(t === 4 ? glow(0xffd860, 1) : {}) })); // buttons
  },
  puff: (g, t) => {
    const P = seatPal(t);
    const col = pick(t, 0x8a8c9a, 0xff2fb0, 0xc0243a, 0x6a2cd0);
    const m = ball(0.33, col, 0, 0.27, 0, { detail: 3 });
    m.scale.y = 0.78;
    g.add(m);
    g.add(torus(0.33, 0.02, P.dark, 0, 0.2, 0, undefined, Math.PI / 2));
    g.add(ball(0.06, P.dark, 0, 0.52, 0, { detail: 1 }));
    g.add(ball(0.1, P.accent, -0.1, 0.4, 0.12, { detail: 1, outline: false }));
    if (t === 4) g.add(torus(0.34, 0.015, 0xffd860, 0, 0.3, 0, glow(0xffd860, 1), Math.PI / 2));
  },
  sofa_red_2: (g, t) => {
    const P = seatPal(t);
    g.add(box(1.9, 0.3, 0.82, P.dark, 0, 0.08, 0, undefined, 0.06));
    for (const x of [-0.46, 0.46]) g.add(box(0.88, 0.16, 0.7, P.main, x, 0.38, 0.04, undefined, 0.07));
    g.add(box(1.9, 0.52, 0.22, P.dark, 0, 0.3, -0.32, undefined, 0.08));
    for (const x of [-0.46, 0.46]) g.add(box(0.8, 0.34, 0.1, P.main, x, 0.4, -0.2, undefined, 0.06));
    for (const x of [-0.93, 0.93]) g.add(box(0.2, 0.42, 0.82, P.dark, x, 0.3, 0, undefined, 0.08));
    for (const [x, z] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]] as const) g.add(cyl(0.04, 0.03, t >= 3 ? 0.14 : 0.1, t === 1 ? 0x4a4a54 : GOLD, x, 0, z, 8));
    if (t >= 3) for (let i = 0; i < 6; i++) g.add(ball(0.03, t === 4 ? 0xffd860 : 0xeef2fa, -0.7 + i * 0.28, 0.66, -0.2, { detail: 1, outline: false, ...(t === 4 ? glow(0xffd860, 1) : {}) }));
    if (t === 4) g.add(box(1.9, 0.04, 0.84, GOLD, 0, 0.36, 0, glow(GOLD, 0.4), 0.02));
  },
  booth: (g, t) => {
    const P = seatPal(t);
    const seat = pick(t, 0x7d7f8c, 0xc0245a, 0x9e1a2e, 0x5a24b0);
    const back = pick(t, 0x5a5c68, 0x8f1244, 0x6a1020, 0x3d1580);
    g.add(box(1.9, 0.3, 0.58, seat, 0, 0.08, -0.7, undefined, 0.06));
    g.add(box(1.9, 0.65, 0.2, back, 0, 0.3, -0.92, undefined, 0.08));
    g.add(box(0.58, 0.3, 1.5, seat, -0.7, 0.08, 0.1, undefined, 0.06));
    g.add(box(0.2, 0.65, 1.5, back, -0.92, 0.3, 0.1, undefined, 0.08));
    for (let i = 0; i < 5; i++) g.add(ball(0.035, t === 1 ? 0x4a4a54 : GOLD, -0.7 + i * 0.35, 0.72, -0.8, { detail: 1, outline: false }));
    const tb = tablePal(t);
    g.add(cyl(0.4, 0.4, 0.06, t === 1 ? 0x8a7a60 : PLUM, 0.2, 0.52, 0.1, 24, t === 3 ? { opacity: 0.8, outline: false } : undefined));
    g.add(torus(0.4, 0.02, t === 4 ? 0xffc81a : 0x18e0ff, 0.2, 0.56, 0.1, t === 1 ? undefined : glow(t === 4 ? 0xffc81a : 0x18e0ff, 1), Math.PI / 2));
    g.add(cyl(0.05, 0.05, 0.52, tb.pole, 0.2, 0, 0.1, 8));
    g.add(cyl(0.2, 0.22, 0.04, tb.pole, 0.2, 0, 0.1, 16));
    g.add(cyl(0.06, 0.05, 0.16, 0xffffff, 0.35, 0.58, 0.1, 8, { opacity: 0.6, outline: false }));
    if (t === 4) g.add(ball(0.1, 0xffd860, 0.2, 0.7, 0.1, { detail: 2, ...glow(0xffd860, 1.4) })); // a lamp on the table
    void P;
  },
  table_low: (g, t) => {
    const P = tablePal(t);
    g.add(cyl(0.36, 0.36, 0.06, P.top, 0, 0.36, 0, 24, t === 3 ? { opacity: 0.7, outline: false } : undefined));
    g.add(torus(0.36, 0.02, P.rim, 0, 0.4, 0, t === 4 ? glow(0xffc81a, 0.6) : undefined, Math.PI / 2));
    g.add(cyl(0.05, 0.05, 0.36, P.pole, 0, 0, 0, 8));
    g.add(cyl(0.2, 0.22, 0.04, P.pole, 0, 0, 0, 16));
    if (t >= 2) g.add(cyl(0.05, 0.05, 0.14, 0x18e0ff, 0.12, 0.42, 0.05, 10, { emissive: 0x18e0ff, emissiveIntensity: 0.8 }));
    if (t >= 2) g.add(ball(0.03, 0xffe08a, 0.12, 0.6, 0.05, { detail: 1, ...glow(0xffc040, 1.6) }));
    if (t === 4) g.add(cyl(0.06, 0.05, 0.1, 0xffd860, -0.15, 0.42, -0.05, 8, glow(0xffd860, 0.6)));
  },
  table_high: (g, t) => {
    const P = tablePal(t);
    g.add(cyl(0.32, 0.32, 0.06, pick(t, 0x9a8a70, 0x2e57d8, 0xbfe9ff, 0xf2eef6), 0, 0.98, 0, 24, t === 3 ? { opacity: 0.7, outline: false } : undefined));
    g.add(torus(0.32, 0.018, t === 4 ? 0xffc81a : t === 1 ? 0x6a5a44 : 0x18e0ff, 0, 1.02, 0, t === 1 ? undefined : glow(t === 4 ? 0xffc81a : 0x18e0ff, 1), Math.PI / 2));
    g.add(cyl(0.05, 0.05, 0.98, P.pole, 0, 0, 0, 8));
    g.add(cyl(0.24, 0.27, 0.05, P.pole, 0, 0, 0, 16));
    if (t >= 2) g.add(cyl(0.06, 0.05, 0.12, 0xff7ab8, 0.1, 1.04, 0.05, 8, { opacity: 0.8, outline: false }));
  },
};

/** A straight bar of any length: counter, bottles on the back shelf and, from version 2, glasses and neon. Customers stand on the +z side. */
function barModel(g: THREE.Group, t: number, len: number, tall: boolean): void {
  const body = pick(t, 0xa07a50, WOOD, 0x6a3a1c, 0x15101f);
  const topC = pick(t, 0x6a7088, 0x2d7bff, 0xf2f0ee, 0x1a1530);
  const neon = pick(t, 0, 0x18e0ff, 0x18e0ff, GOLD);
  const w = len - 0.05;
  g.add(box(w, 0.9, 0.66, body, 0, 0, 0.1, undefined, t === 1 ? 0.012 : 0.045));
  g.add(box(w + 0.1, 0.1, 0.9, topC, 0, 0.9, 0.1, t === 4 ? { emissive: 0x2a3cff, emissiveIntensity: 0.25 } : undefined, 0.05));
  if (t >= 2) g.add(box(w - 0.1, 0.04, 0.04, neon, 0, 0.7, 0.46, glow(neon, 1.1), 0.01));
  if (t >= 3) {
    g.add(box(w + 0.15, 0.05, 0.05, t === 4 ? GOLD : 0xd4a640, 0, 1.0, 0.56, t === 4 ? glow(GOLD, 0.7) : undefined));
    g.add(cyl(0.03, 0.03, w - 0.1, t === 4 ? GOLD : 0xd4a640, 0, 0.2, 0.55, 8).rotateZ(Math.PI / 2));
  }
  g.add(box(w - 0.05, tall ? 1.3 : 1.05, 0.12, pick(t, 0x6a5a44, 0x3a2a5a, 0x2a1a3a, 0x0a0816), 0, 0, -0.43));
  if (t === 4 && tall) g.add(box(w - 0.3, 1.1, 0.02, 0x9fd0ff, 0, 0.12, -0.36, { emissive: 0x6a9aff, emissiveIntensity: 0.4, opacity: 0.55, outline: false }));
  const cols = [0x18d86a, 0xffd21e, 0xff3a3a, 0x18e0ff, 0xff3da6, 0xb04cff, 0xff8a1e];
  const rows = tall ? [0.5, 0.9] : [0.6];
  const per = Math.max(3, Math.round((w - 0.3) / 0.24));
  rows.forEach((y, row) => {
    g.add(box(w - 0.15, 0.04, 0.2, t >= 3 ? 0xdff3ff : 0xc8a070, 0, y - 0.02, -0.33, t >= 3 ? { opacity: 0.6, outline: false } : undefined));
    for (let i = 0; i < per; i++) {
      const c = t === 1 ? [0x4a7a4a, 0x8a7a3a, 0x6a4a4a][i % 3] : cols[(i + row * 3) % cols.length];
      g.add(cyl(0.045, 0.055, 0.2, c, -(w - 0.4) / 2 + (i * (w - 0.4)) / Math.max(1, per - 1), y, -0.33, 8, t === 1 ? undefined : { emissive: c, emissiveIntensity: 0.5 }));
    }
  });
  if (t >= 2) for (let i = 0; i < Math.round(len * 2); i++) g.add(cyl(0.05, 0.04, 0.1, 0xeaf6ff, -w / 2 + 0.25 + i * ((w - 0.5) / Math.max(1, Math.round(len * 2) - 1)), 1.0, 0.25, 10, { opacity: 0.7, outline: false }));
  if (t === 4) for (let i = 0; i < Math.max(2, Math.round(len / 1.4)); i++) {
    const x = -w / 2 + 0.5 + i * ((w - 1) / Math.max(1, Math.round(len / 1.4) - 1));
    g.add(cyl(0.012, 0.012, 0.5, GOLD, x, 1.55, 0.1, 6));
    g.add(ball(0.12, 0xfff1c0, x, 1.5, 0.1, { detail: 2, ...glow(0xffd060, 1.6) }));
  }
}

const BUILDERS: Record<string, Builder> = {
  floor_cyan: (g, t) => floorTile(g, 0x14e0ff, t),
  floor_pink: (g, t) => floorTile(g, 0xff3da6, t),
  floor_violet: (g, t) => floorTile(g, 0xb04cff, t),
  ...TIERED,

  floor_gold: (g, t) => floorTile(g, 0xffc81a, t),
  floor_led: (g, t) => floorTile(g, 0x5ec8ff, t),

  sofa_vip: (g, t) => {
    // a long curved-back sofa: 1 worn vinyl · 2 purple velvet · 3 leather with chrome studs · 4 royal velvet with gold
    const main = pick(t, 0x6a5a7a, 0x7a2fd0, 0x2a1a3a, 0x4a1a8a);
    const dark = pick(t, 0x4a4256, 0x4b1a8a, 0x15101f, 0x2a0f5a);
    g.add(box(2.9, 0.3, 0.86, dark, 0, 0.08, 0, undefined, 0.07));
    for (const x of [-0.95, 0, 0.95]) g.add(box(0.9, 0.17, 0.72, main, x, 0.38, 0.05, undefined, 0.08));
    g.add(box(2.9, 0.58, 0.22, dark, 0, 0.3, -0.34, undefined, 0.09));
    for (const x of [-0.95, 0, 0.95]) g.add(box(0.84, 0.38, 0.1, main, x, 0.42, -0.21, undefined, 0.07));
    for (const x of [-1.42, 1.42]) g.add(box(0.2, 0.46, 0.86, dark, x, 0.3, 0, undefined, 0.09));
    if (t >= 3) for (let i = 0; i < 9; i++) g.add(ball(0.03, t === 4 ? 0xffd860 : 0xeef2fa, -1.1 + i * 0.275, 0.72, -0.22, { detail: 1, outline: false, ...(t === 4 ? glow(0xffd860, 1) : {}) }));
    if (t === 4) g.add(box(2.9, 0.04, 0.88, GOLD, 0, 0.36, 0, glow(GOLD, 0.4), 0.02));
    for (const x of [-1.3, 1.3]) g.add(cyl(0.04, 0.03, 0.1, t === 1 ? 0x4a4a54 : GOLD, x, 0, 0.3, 8));
  },
  lounge_bed: (g, t) => {
    // a round-cornered daybed with cushions and a canopy of light
    const main = pick(t, 0x7a6a8a, 0xff4fa3, 0xf2eef6, 0x15101f);
    const trim = pick(t, 0x4a4256, 0x8a1f55, 0xdfe6f2, 0xffc81a);
    g.add(box(1.9, 0.3, 1.9, trim, 0, 0.05, 0, undefined, 0.1));
    g.add(box(1.75, 0.2, 1.75, main, 0, 0.35, 0, undefined, 0.1));
    g.add(box(1.9, 0.5, 0.2, trim, 0, 0.3, -0.85, undefined, 0.08));
    for (const [x, z] of [[-0.45, -0.6], [0.45, -0.6], [-0.2, 0.2], [0.4, 0.45]] as const) g.add(box(0.5, 0.14, 0.42, pick(t, 0x9a8aaa, 0xffa8d0, 0xe9e2f3, 0xffc81a), x, 0.55, z, undefined, 0.06));
    if (t >= 2) for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]] as const) g.add(cyl(0.03, 0.03, 1.6, t === 4 ? GOLD : CHROME, x, 0.1, z, 8));
    if (t >= 3) g.add(box(1.9, 0.03, 1.9, t === 4 ? GOLD : 0x5ec8ff, 0, 1.7, 0, glow(t === 4 ? GOLD : 0x5ec8ff, 1.3), 0.01));
  },
  table_vip: (g, t) => {
    const top = pick(t, 0x9a8a70, 0x2a1a3a, 0xf2f0ee, 0x15101f);
    const rim = pick(t, 0x6a5a44, 0xb04cff, 0xdfe6f2, 0xffc81a);
    g.add(box(1.8, 0.07, 0.8, top, 0, 0.62, 0, undefined, 0.03));
    g.add(box(1.84, 0.03, 0.84, rim, 0, 0.6, 0, t === 1 ? undefined : glow(rim, 0.7), 0.012));
    for (const x of [-0.7, 0.7]) g.add(box(0.12, 0.6, 0.6, pick(t, 0x6a5a55, 0x3a2a4a, 0xdfe6f2, 0xffc81a), x, 0, 0, undefined, 0.03));
    // bottles and an ice bucket
    for (const [x, c] of [[-0.55, 0x2d7bff], [-0.35, 0x35f08a], [-0.15, 0xff4fa3]] as const) g.add(cyl(0.05, 0.07, 0.3, c, x, 0.69, 0, 8, { opacity: 0.85, outline: false }));
    g.add(cyl(0.16, 0.12, 0.22, t >= 3 ? CHROME : 0x8f96b4, 0.4, 0.69, 0, 14));
    for (const [x, z] of [[0.35, 0.02], [0.45, -0.03], [0.4, 0.07]] as const) g.add(ball(0.05, 0xdff4ff, x, 0.93, z, { detail: 1, opacity: 0.8, outline: false }));
    if (t === 4) for (const x of [0.62, 0.78]) g.add(cyl(0.03, 0.02, 0.16, 0xfff1a0, x, 0.69, 0.12, 8, glow(0xffd860, 0.8)));
  },
  speaker_tower: (g, t) => {
    const body = pick(t, 0x4a4a54, 0x1c1530, 0x15101f, 0x15101f);
    g.add(box(0.5, 1.9, 0.5, body, 0, 0, 0, undefined, 0.04));
    for (const [y, r] of [[0.35, 0.17], [0.85, 0.15], [1.4, 0.11]] as const) {
      g.add(pump(cyl(r, r, 0.04, pick(t, 0x2a2a34, 0x5a5c78, 0xdfe6f2, 0xffc81a), 0, y, 0.26, 18).rotateX(Math.PI / 2)));
      g.add(pump(cyl(r * 0.45, r * 0.45, 0.05, pick(t, 0x3a3a44, 0x2a2238, 0x8f96b4, 0x15101f), 0, y, 0.27, 12).rotateX(Math.PI / 2), 1.4));
    }
    g.add(box(0.46, 0.04, 0.46, pick(t, 0x6a6c78, 0x5ec8ff, 0x5ec8ff, 0xffd860), 0, 1.9, 0, t === 1 ? undefined : glow(pick(t, 0x6a6c78, 0x5ec8ff, 0x5ec8ff, 0xffd860), 1.2), 0.01));
  },
  sub_bass: (g, t) => {
    const body = pick(t, 0x4a4a54, 0x1c1530, 0x15101f, 0x15101f);
    g.add(box(1.9, 0.85, 0.85, body, 0, 0, 0, undefined, 0.05));
    for (const x of [-0.5, 0.5]) {
      g.add(pump(cyl(0.33, 0.33, 0.05, pick(t, 0x2a2a34, 0xd6314a, 0xdfe6f2, 0xffc81a), x, 0.42, 0.43, 22).rotateX(Math.PI / 2), 1.2));
      g.add(pump(cyl(0.15, 0.15, 0.07, 0x15101f, x, 0.42, 0.45, 14).rotateX(Math.PI / 2), 1.6));
    }
    if (t >= 2) g.add(box(1.8, 0.03, 0.03, pick(t, 0, 0xd6314a, 0x5ec8ff, 0xffd860), 0, 0.82, 0.43, glow(pick(t, 0, 0xd6314a, 0x5ec8ff, 0xffd860), 1.5), 0.01));
  },
  strobe: (g, t) => {
    g.add(cyl(0.07, 0.1, 1.3, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 0, 0, 8));
    g.add(box(0.46, 0.22, 0.3, pick(t, 0x4a4a54, 0x1c1530, 0x15101f, 0x15101f), 0, 1.3, 0, undefined, 0.03));
    const bulb = box(0.38, 0.14, 0.04, 0xffffff, 0, 1.34, 0.16, glow(0xffffff, pick(t, 0.8, 1.6, 2.2, 2.8)), 0.01);
    bulb.userData.pulse = true;
    g.add(bulb);
    g.add(cyl(0.2, 0.22, 0.04, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 0, 0, 14));
  },
  fog_machine: (g, t) => {
    g.add(box(0.7, 0.34, 0.44, pick(t, 0x4a4a54, 0x1c1530, 0x2a2a3a, 0x15101f), 0, 0, 0, undefined, 0.05));
    g.add(cyl(0.08, 0.08, 0.2, 0x15101f, 0.25, 0.3, 0.2, 10).rotateX(Math.PI / 2.4));
    g.add(box(0.18, 0.04, 0.04, pick(t, 0x8f96b4, 0x3ddc97, 0x5ec8ff, 0xffd860), -0.2, 0.34, 0.2, glow(pick(t, 0x8f96b4, 0x3ddc97, 0x5ec8ff, 0xffd860), 1), 0.01));
    // puffs of smoke leave the nozzle, swell, drift and fade; it blows harder on the kick
    const puffs: Array<{ m: THREE.Mesh; mat: THREE.MeshToonMaterial; seed: number }> = [];
    for (let i = 0; i < 9; i++) {
      const m = ball(0.16, 0xe8ecf8, 0.3, 0.4, 0.3, { detail: 1, opacity: 0.4, outline: false });
      puffs.push({ m, mat: m.material as THREE.MeshToonMaterial, seed: i / 9 });
      g.add(m);
    }
    let blow = 0;
    puffs[0].m.userData.tick = ((time, _b, pulse, dt) => {
      blow += Math.min(dt, 0.1) * (0.28 + 0.25 * pulse);
      for (const p of puffs) {
        const f = (blow + p.seed) % 1;
        const side = Math.sin(p.seed * 37) * 0.6;
        p.m.position.set(0.3 + f * (1.4 + side * 0.5), 0.4 + f * 0.9 - f * f * 0.5, 0.3 + f * (1.2 - side));
        p.m.scale.setScalar(0.6 + f * 3.2);
        p.mat.opacity = 0.42 * Math.sin(Math.PI * Math.min(1, f * 1.15)) * (0.8 + 0.2 * Math.sin(time * 3 + p.seed * 9));
        p.m.visible = p.mat.opacity > 0.01;
      }
    }) as PropTick;
  },
  led_wall: (g, t) => {
    g.add(box(2.95, 1.7, 0.16, pick(t, 0x2a2a34, 0x15101f, 0x15101f, 0x15101f), 0, 0.2, 0, undefined, 0.03));
    const cols = [0xff4fa3, 0x5ec8ff, 0x3ddc97, 0xffd860, 0xb04cff, 0xff6a3a];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const c = cols[(i + j * 2) % cols.length];
      const px = box(0.4, 0.44, 0.04, c, -1.25 + i * 0.5, 0.35 + j * 0.5, 0.1, glow(c, pick(t, 0.35, 0.8, 1.1, 1.5)), 0.01);
      px.userData.pulse = (i + j) % 2 === 0;
      g.add(px);
    }
    for (const x of [-1.2, 1.2]) g.add(cyl(0.05, 0.05, 0.2, 0x4a4a54, x, 0, -0.05, 8));
    if (t === 4) g.add(box(3.05, 0.05, 0.2, GOLD, 0, 1.9, 0, glow(GOLD, 0.6), 0.02));
  },
  gold_record: (g, t) => {
    g.add(cyl(0.22, 0.26, 0.05, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 0, 0, 16));
    g.add(cyl(0.03, 0.03, 0.7, pick(t, 0x6a6c78, 0xdfe6f2, 0xdfe6f2, 0xffc81a), 0, 0.05, 0, 8));
    const disc = cyl(0.36, 0.36, 0.04, pick(t, 0xb89a4a, 0xf5b91d, 0xffd860, 0xfff1a0), 0, 0.85, 0, 28, { emissive: 0x8a5a00, emissiveIntensity: 0.4 }).rotateX(Math.PI / 2);
    g.add(disc);
    g.add(cyl(0.1, 0.1, 0.06, 0xd6314a, 0, 0.85, 0, 16).rotateX(Math.PI / 2));
    g.add(torus(0.36, 0.015, pick(t, 0x6a5a44, 0x15101f, 0x15101f, 0x15101f), 0, 0.85, 0.02, undefined, 0));
  },
  award_wall: (g, t) => {
    g.add(box(1.95, 1.5, 0.12, pick(t, 0x4a3a2a, 0x2a1850, 0x15101f, 0x15101f), 0, 0.2, 0, undefined, 0.03));
    for (const [x, y, c] of [[-0.55, 1.15, 0xf5b91d], [0.05, 1.2, 0xdfe6f2], [0.6, 1.1, 0xff4fa3], [-0.5, 0.6, 0x5ec8ff], [0.1, 0.55, 0xf5b91d], [0.6, 0.6, 0xdfe6f2]] as const) {
      g.add(cyl(0.2, 0.2, 0.04, c, x, y, 0.08, 18, { emissive: c, emissiveIntensity: 0.25 }).rotateX(Math.PI / 2));
      g.add(cyl(0.1, 0.1, 0.05, 0x15101f, x, y, 0.1, 12).rotateX(Math.PI / 2));
    }
    g.add(box(1.95, 0.06, 0.16, pick(t, 0x6a5a44, 0xb04cff, 0xdfe6f2, 0xffc81a), 0, 1.7, 0, t === 1 ? undefined : glow(pick(t, 0, 0xb04cff, 0x5ec8ff, 0xffd860), 0.9), 0.02));
  },
  palm: (g, t) => {
    g.add(cyl(0.2, 0.26, 0.28, pick(t, 0xb06a3a, 0x8a4f26, 0xdfe6f2, 0xffc81a), 0, 0, 0, 14));
    const lean = new THREE.Group();
    lean.add(cyl(0.05, 0.08, 1.3, 0x7a5a3a, 0, 0.28, 0, 8));
    for (let i = 0; i < 7; i++) {
      const leaf = box(0.12, 0.03, 0.78, pick(t, 0x3d8a4a, 0x2fa05a, 0x2fc070, 0x35e08a), 0, 0, 0.4, undefined, 0.01);
      const arm = new THREE.Group();
      arm.add(leaf);
      arm.position.set(0, 1.55, 0);
      arm.rotation.y = (i / 7) * Math.PI * 2;
      arm.rotation.x = -0.45;
      lean.add(arm);
    }
    lean.rotation.z = 0.1;
    g.add(lean);
  },
  neon_wall: (g, t) => {
    const c = pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860);
    g.add(box(1.9, 0.9, 0.08, pick(t, 0x2a2a34, 0x15101f, 0x15101f, 0x15101f), 0, 0.5, 0, undefined, 0.03));
    // a neon note and a heart, drawn with tubes
    g.add(torus(0.22, 0.03, c, -0.45, 0.95, 0.06, glow(c, pick(t, 0.7, 1.4, 1.8, 2.3)), 0));
    g.add(box(0.06, 0.5, 0.05, c, -0.25, 0.95, 0.06, glow(c, pick(t, 0.7, 1.4, 1.8, 2.3)), 0.01));
    g.add(torus(0.25, 0.03, pick(t, 0x8ad8ff, 0x5ec8ff, 0xff4fa3, 0xfff1a0), 0.4, 0.92, 0.06, glow(pick(t, 0x8ad8ff, 0x5ec8ff, 0xff4fa3, 0xfff1a0), pick(t, 0.7, 1.4, 1.8, 2.3)), 0));
    for (const x of [-0.85, 0.85]) g.add(cyl(0.03, 0.03, 0.12, 0x8f96b4, x, 0.1, 0, 8));
  },
  sculpture: (g, t) => {
    // a twisted glowing ribbon on a plinth
    g.add(box(0.7, 0.45, 0.7, pick(t, 0x6a6c78, 0xe9e4f2, 0xe9e4f2, 0x15101f), 0, 0, 0, undefined, 0.04));
    g.add(box(0.76, 0.05, 0.76, pick(t, 0x8f96b4, 0xb04cff, 0x5ec8ff, 0xffc81a), 0, 0.45, 0, t === 1 ? undefined : glow(pick(t, 0, 0xb04cff, 0x5ec8ff, 0xffc81a), 0.7), 0.02));
    const ribbon = new THREE.Group();
    const c1 = pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860);
    const c2 = pick(t, 0x8ad8ff, 0x5ec8ff, 0xb04cff, 0xff4fa3);
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7;
      ribbon.add(ball(0.11, i % 2 ? c1 : c2, Math.cos(a) * (0.22 - i * 0.012), 0.6 + i * 0.16, Math.sin(a) * (0.22 - i * 0.012), { detail: 1, ...glow(i % 2 ? c1 : c2, pick(t, 0.5, 1.2, 1.6, 2)) }));
    }
    ribbon.userData.spin = 0.5;
    g.add(ribbon);
  },

  cocktail_bar: (g, t) => barModel(g, t, 2, false),
  bar_long: (g, t) => barModel(g, t, 5, true),
  bar_corner: (g, t) => {
    // an L-shaped counter in the corner: the long side faces the room, the short one runs to the back wall
    const body = pick(t, 0xa07a50, WOOD, 0x6a3a1c, 0x15101f);
    const topC = pick(t, 0x6a7088, 0x2d7bff, 0xf2f0ee, 0x1a1530);
    const neon = pick(t, 0, 0x18e0ff, 0x18e0ff, GOLD);
    g.add(box(1.95, 0.9, 0.62, body, 0, 0, 0.55, undefined, t === 1 ? 0.012 : 0.045));
    g.add(box(0.62, 0.9, 1.4, body, -0.66, 0, -0.35, undefined, t === 1 ? 0.012 : 0.045));
    g.add(box(2.05, 0.1, 0.8, topC, 0, 0.9, 0.55, undefined, 0.05));
    g.add(box(0.8, 0.1, 1.5, topC, -0.66, 0.9, -0.35, undefined, 0.05));
    if (t >= 2) g.add(box(1.9, 0.04, 0.04, neon, 0, 0.6, 0.88, glow(neon, 1.1), 0.01));
    if (t >= 3) g.add(box(2.1, 0.04, 0.04, t === 4 ? GOLD : 0xd4a640, 0, 1.0, 0.94, t === 4 ? glow(GOLD, 0.6) : undefined, 0.01));
    // shelves on the back wall
    g.add(box(1.9, t === 1 ? 0.06 : 1.1, 0.1, pick(t, 0x8a6a44, 0x3a2a5a, 0x2a1a3a, 0x0a0816), 0.05, t === 1 ? 0.85 : 0.1, -0.93));
    const cols = [0x18d86a, 0xffd21e, 0xff3a3a, 0x18e0ff, 0xff3da6, 0xb04cff];
    for (let i = 0; i < 8; i++) {
      const c = t === 1 ? 0x6a8a5a : cols[i % cols.length];
      g.add(cyl(0.045, 0.055, 0.2, c, -0.35 + i * 0.22, t === 1 ? 0.91 : 0.7, -0.84, 8, t === 1 ? undefined : { emissive: c, emissiveIntensity: 0.5 }));
    }
    if (t === 4) for (const x of [-0.3, 0.5]) g.add(ball(0.11, 0xfff1c0, x, 1.55, 0.55, { detail: 2, ...glow(0xffd060, 1.6) }));
  },
  dj_booth_pro: (g, t) => {
    // a three-deck console with a mixer between, a light screen behind and, in the best version, a truss with lights
    const body = pick(t, 0x2a2238, 0x2a2060, 0x1a1250, 0x0e0a24);
    g.add(box(2.9, 0.95, 0.74, body, 0, 0, 0, undefined, 0.05));
    g.add(box(2.96, 0.06, 0.8, pick(t, 0x4a4256, 0x3b2f86, 0x2a2090, GOLD), 0, 0.95, 0, t === 4 ? glow(GOLD, 0.25) : undefined, 0.03));
    for (const x of [-0.95, 0.95]) {
      g.add(box(0.7, 0.05, 0.6, 0x3a3a46, x, 1.01, 0.02));
      g.add(cyl(0.25, 0.25, 0.03, pick(t, 0x2a2a34, 0x15101f, 0x15101f, 0x15101f), x, 1.06, 0.02, 24));
      g.add(cyl(0.05, 0.05, 0.035, pick(t, 0x8f96b4, 0xd6314a, 0x5ec8ff, 0xffd860), x, 1.09, 0.02, 12, glow(pick(t, 0x8f96b4, 0xd6314a, 0x5ec8ff, 0xffd860), 0.8)));
    }
    g.add(box(0.8, 0.1, 0.55, 0x15101f, 0, 1.01, 0.02, undefined, 0.02));
    for (let i = 0; i < 4; i++) g.add(box(0.05, 0.03, 0.2, [0x18e0ff, 0xff3da6, 0xffd21e, 0x35f08a][i], -0.27 + i * 0.18, 1.12, 0.02, glow([0x18e0ff, 0xff3da6, 0xffd21e, 0x35f08a][i], 1.2), 0.01));
    const cols = [0x18e0ff, 0xff3da6, 0xffd21e, 0x35f08a, 0xb04cff];
    for (let i = 0; i < 16; i++) g.add(box(0.1, 0.1, 0.03, cols[i % 5], -1.3 + i * 0.173, 0.3, 0.38, glow(cols[i % 5], 0.5 + t * 0.2), 0.01));
    g.add(box(2.9, 0.05, 0.05, 0x18e0ff, 0, 0.62, 0.39, glow(0x18e0ff)));
    g.add(box(2.9, 0.04, 0.05, 0xff3da6, 0, 0.1, 0.39, glow(0xff3da6)));
    if (t >= 3) {
      g.add(box(2.8, 0.9, 0.04, 0x0a0816, 0, 1.2, -0.34));
      for (let i = 0; i < 14; i++) for (let j = 0; j < 4; j++) g.add(box(0.14, 0.14, 0.02, cols[(i + j) % 5], -1.3 + i * 0.2, 1.3 + j * 0.2 - 0.18, -0.31, glow(cols[(i + j) % 5], t === 4 ? 1.3 : 0.8), 0.005));
    }
    if (t === 4) for (const x of [-1.3, 1.3]) { g.add(cyl(0.04, 0.04, 2.3, GOLD, x, 0, -0.34, 8)); g.add(ball(0.12, 0xfff1c0, x, 2.35, -0.34, { detail: 1, ...glow(0xffd860, 1.8) })); }
  },
  sofa_corner: (g, t) => {
    const P = seatPal(t);
    g.add(box(1.9, 0.3, 0.82, P.dark, 0, 0.08, 0.5, undefined, 0.06));
    g.add(box(0.82, 0.3, 1.5, P.dark, -0.53, 0.08, -0.3, undefined, 0.06));
    g.add(box(1.7, 0.16, 0.66, P.main, 0.08, 0.38, 0.52, undefined, 0.07));
    g.add(box(0.66, 0.16, 1.1, P.main, -0.53, 0.38, -0.5, undefined, 0.07));
    g.add(box(1.9, 0.5, 0.2, P.dark, 0, 0.3, 0.88, undefined, 0.08));
    g.add(box(0.2, 0.5, 1.9, P.dark, -0.92, 0.3, 0, undefined, 0.08));
    if (t >= 3) for (let i = 0; i < 5; i++) g.add(ball(0.03, t === 4 ? 0xffd860 : 0xeef2fa, -0.8 + i * 0.4, 0.74, 0.8, { detail: 1, outline: false, ...(t === 4 ? glow(0xffd860, 1) : {}) }));
    if (t === 4) g.add(box(1.9, 0.04, 0.84, GOLD, 0, 0.36, 0.5, glow(GOLD, 0.4), 0.02));
  },
  moving_heads: (g, t) => {
    // a short truss with two lamps that swing
    g.add(cyl(0.2, 0.24, 0.05, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 0, 0, 14));
    g.add(cyl(0.04, 0.04, 1.7, pick(t, 0x6a6c78, 0xdfe6f2, 0xdfe6f2, 0xffc81a), 0, 0.05, 0, 8));
    g.add(box(1.0, 0.07, 0.07, pick(t, 0x6a6c78, 0xdfe6f2, 0xdfe6f2, 0xffc81a), 0, 1.75, 0, undefined, 0.02));
    const c = pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860);
    for (const x of [-0.4, 0.4]) {
      const head = new THREE.Group();
      head.add(box(0.2, 0.26, 0.2, 0x15101f, 0, -0.26, 0, undefined, 0.03));
      head.add(box(0.14, 0.03, 0.14, c, 0, -0.27, 0.02, glow(c, 2), 0.01));
      head.add(cyl(0.05, 0.12, 0.5, c, 0, -0.78, 0, 10, { opacity: 0.22, emissive: c, emissiveIntensity: 0.9, outline: false }));
      head.position.set(x, 1.75, 0);
      head.userData.spin = x < 0 ? 0.9 : -0.9;
      g.add(head);
    }
  },
  totem_led: (g, t) => {
    g.add(box(0.7, 0.14, 0.7, pick(t, 0x4a4a54, 0x1c1530, 0x15101f, 0x15101f), 0, 0, 0, undefined, 0.03));
    g.add(box(0.5, 1.9, 0.26, pick(t, 0x2a2a34, 0x15101f, 0x15101f, 0x15101f), 0, 0.14, 0, undefined, 0.03));
    const cols = [0x18e0ff, 0xff3da6, 0xffd21e, 0x35f08a, 0xb04cff];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 2; i++) {
      const c = cols[(j + i) % 5];
      const px = box(0.18, 0.18, 0.03, c, -0.1 + i * 0.2, 0.28 + j * 0.2, 0.14, glow(c, pick(t, 0.3, 0.7, 1, 1.4)), 0.005);
      px.userData.pulse = (i + j) % 2 === 0;
      g.add(px);
    }
    if (t === 4) g.add(box(0.56, 0.05, 0.3, GOLD, 0, 2.04, 0, glow(GOLD, 0.7), 0.02));
  },
  tv_wall: (g, t) => {
    g.add(box(1.95, 0.6, 0.5, pick(t, 0x4a3a2a, 0x2a1850, 0x15101f, 0x15101f), 0, 0, 0, undefined, 0.04));
    for (const x of [-0.5, 0.5]) {
      g.add(box(0.9, 0.62, 0.06, 0x0a0816, x, 0.8, 0.04));
      g.add(picture(0.82, 0.54, screenTex('tv'), x, 0.84, 0.075));
      g.add(cyl(0.03, 0.03, 0.2, 0x4a4a54, x, 0.6, 0.02, 8));
    }
    if (t >= 3) g.add(box(1.95, 0.03, 0.52, t === 4 ? GOLD : CHROME, 0, 0.6, 0, t === 4 ? glow(GOLD, 0.6) : undefined, 0.01));
  },
  video_wall: (g, t) => {
    g.add(box(3.95, 0.5, 0.45, pick(t, 0x2a2a34, 0x15101f, 0x15101f, 0x15101f), 0, 0, 0, undefined, 0.04));
    for (let i = 0; i < 4; i++) {
      g.add(box(0.95, 1.5, 0.06, 0x0a0816, -1.5 + i, 0.5, 0.03));
      g.add(picture(0.88, 1.42, screenTex('big'), -1.5 + i, 1.21, 0.065));
    }
    if (t >= 2) g.add(box(3.95, 0.04, 0.05, pick(t, 0, 0xff4fa3, 0x5ec8ff, GOLD), 0, 0.5, 0.2, glow(pick(t, 0, 0xff4fa3, 0x5ec8ff, GOLD), 1.3), 0.01));
    if (t === 4) g.add(box(4.0, 0.06, 0.1, GOLD, 0, 2.05, 0, glow(GOLD, 0.6), 0.02));
  },
  pole_podium: (g, t) => {
    // a small round stage with a pole and a dancer (the cage's smaller sister)
    const neon = pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860);
    g.add(cyl(0.46, 0.5, 0.22, pick(t, 0x4a3d58, 0x2a1850, 0x16213f, 0x15101f), 0, 0, 0, 24));
    g.add(torus(0.47, 0.03, neon, 0, 0.22, 0, t === 1 ? undefined : glow(neon, 1.4), Math.PI / 2));
    g.add(cyl(0.03, 0.03, 1.9, CHROME, 0, 0.22, 0, 8));
    g.add(cyl(0.2, 0.2, 0.04, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 2.1, 0, 14));
    const dancer = poleDancer({
      top: pick(t, 0xff4fa3, 0x18e0ff, 0xb04cff, 0xffc81a),
      bottom: 0x15101f,
      skin: pick(t, 0xe8b890, 0xc98e66, 0xf0c8a0, 0x8a5a3c),
      hair: pick(t, 0x3a2418, 0x15101f, 0xe8d36a, 0xff4fa3),
      shoes: pick(t, 0x2a2238, 0xd6314a, 0xdfe6f2, 0xffc81a),
    }, 0.2, 1.0);
    dancer.position.y = 0.22;
    g.add(dancer);
  },
  photo_booth: (g, t) => {
    const c = pick(t, 0xb06a3a, 0xd6314a, 0x5ec8ff, 0xffc81a);
    g.add(box(0.9, 1.9, 0.9, c, 0, 0, 0, undefined, 0.05));
    g.add(box(0.7, 1.1, 0.04, 0x15101f, 0, 0.3, 0.45)); // the opening
    g.add(box(0.6, 0.5, 0.06, 0xf4f1ff, 0, 1.55, 0.46, glow(0xffffff, pick(t, 0.3, 0.7, 1, 1.4)), 0.02)); // the lit sign
    g.add(box(0.5, 0.06, 0.1, 0x15101f, 0, 0.3, 0.5));
    g.add(cyl(0.06, 0.06, 0.04, 0xd6314a, 0.3, 0.9, 0.46, 10).rotateX(Math.PI / 2));
    if (t >= 2) g.add(box(0.94, 0.05, 0.94, pick(t, 0, 0xffd860, CHROME, GOLD), 0, 1.9, 0, glow(pick(t, 0, 0xffd860, 0xffffff, GOLD), 0.8), 0.02));
  },
  arcade: (g, t) => {
    const body = pick(t, 0x6a4a8a, 0x2a1860, 0x15101f, 0x15101f);
    g.add(box(0.8, 1.6, 0.7, body, 0, 0, 0, undefined, 0.05));
    g.add(box(0.62, 0.5, 0.05, 0x0a0816, 0, 0.9, 0.36));
    g.add(picture(0.56, 0.44, screenTex('tv'), 0, 0.93, 0.39));
    g.add(box(0.7, 0.12, 0.34, pick(t, 0x4a3a6a, 0x3a2a8a, 0x2a2a34, GOLD), 0, 0.72, 0.38, undefined, 0.03));
    g.add(cyl(0.015, 0.015, 0.14, 0xdfe6f2, -0.15, 0.84, 0.4, 6));
    g.add(ball(0.05, 0xd6314a, -0.15, 0.99, 0.4, { detail: 1 }));
    for (const [x, c] of [[0.12, 0xffd21e], [0.24, 0x35f08a]] as const) g.add(cyl(0.035, 0.035, 0.03, c, x, 0.84, 0.4, 8));
    g.add(box(0.8, 0.25, 0.04, pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860), 0, 1.35, 0.33, glow(pick(t, 0xff9ac8, 0xff4fa3, 0x5ec8ff, 0xffd860), pick(t, 0.5, 1, 1.4, 1.8)), 0.01));
  },
  camera: (g, t) => {
    g.add(box(0.2, 0.08, 0.2, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 1.8, 0, undefined, 0.02)); // wall bracket
    g.add(cyl(0.035, 0.035, 1.8, pick(t, 0x6a6c78, 0x4a4a54, 0xdfe6f2, 0xffc81a), 0, 0, 0, 8));
    g.add(cyl(0.16, 0.2, 0.05, pick(t, 0x4a4a54, 0x2a2238, 0xdfe6f2, 0xffc81a), 0, 0, 0, 14));
    const head = new THREE.Group();
    head.add(box(0.2, 0.16, 0.42, pick(t, 0xdfe6f2, 0xf4f1ff, 0xf4f1ff, 0x15101f), 0, -0.08, 0, undefined, 0.04));
    head.add(cyl(0.06, 0.06, 0.06, 0x15101f, 0, -0.08, 0.22, 10).rotateX(Math.PI / 2));
    head.add(ball(0.025, 0xff3a3a, 0.07, 0, -0.1, { detail: 0, ...glow(0xff3a3a, 2.5) }));
    head.position.set(0, 1.9, 0.1);
    head.userData.spin = 0.5;
    g.add(head);
  },

  disco_ball: (g) => {
    g.add(cyl(0.22, 0.27, 0.06, CHROME, 0, 0, 0, 20));
    g.add(cyl(0.05, 0.08, 1.1, 0x6a6f8a, 0, 0.06, 0, 10));
    g.add(cyl(0.08, 0.05, 0.1, CHROME, 0, 1.12, 0, 10));
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 2), toon(0xeaf0ff, { emissive: 0x7a8cff, emissiveIntensity: 0.55 }));
    b.position.set(0, 1.6, 0);
    b.userData.spin = 0.6;
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4;
      const s = ball(0.045, [0xff3da6, 0x18e0ff, 0xffd21e][i % 3], Math.cos(a) * 0.38 * Math.cos(i), Math.sin(i * 1.3) * 0.3, Math.sin(a) * 0.38 * Math.cos(i), { detail: 0, ...glow([0xff3da6, 0x18e0ff, 0xffd21e][i % 3], 1.4) });
      b.add(s);
    }
    g.add(b);
  },
  laser_tower: (g) => {
    g.add(cyl(0.2, 0.24, 0.1, CHROME, 0, 0, 0, 16));
    g.add(cyl(0.1, 0.15, 1.2, PLUM, 0, 0.1, 0, 12));
    g.add(torus(0.13, 0.02, 0x35f08a, 0, 0.6, 0, glow(0x35f08a, 1), Math.PI / 2));
    const headMat = toon(0x35f08a, glow(0x35f08a, 1.4));
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), headMat);
    head.position.y = 1.45;
    g.add(head);
    // a fan of beams that sweeps the room and changes colour; brighter on every kick
    const fan = new THREE.Group();
    fan.position.y = 1.45;
    const beams: THREE.MeshBasicMaterial[] = [];
    const geo = new THREE.CylinderGeometry(0.018, 0.018, 4.5, 6, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 2.25);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x35f08a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
      m.userData.outlineParameters = { visible: false };
      const beam = new THREE.Mesh(geo, m);
      beam.rotation.y = (i - 2.5) * 0.22;
      fan.add(beam);
      beams.push(m);
    }
    g.add(fan);
    fan.userData.tick = ((time, beat, pulse) => {
      fan.rotation.y = Math.sin(time * 0.7) * 1.3;
      fan.rotation.x = 0.32 + Math.sin(time * 1.3) * 0.18;
      const spread = 0.16 + 0.08 * Math.sin(beat * Math.PI * 0.25);
      beams.forEach((m, i) => {
        (fan.children[i] as THREE.Mesh).rotation.y = (i - 2.5) * spread;
        m.color.setHSL((time * 0.08 + Math.floor(beat / 4) * 0.33 + i * 0.03) % 1, 1, 0.55);
        m.opacity = 0.45 + 0.5 * pulse;
      });
      headMat.emissive.copy(beams[0].color);
      headMat.color.copy(beams[0].color);
    }) as PropTick;
  },
  tv_stand: (g) => {
    g.add(box(1.0, 0.5, 0.5, WOOD_DARK, 0, 0, 0, undefined, 0.05));
    g.add(box(0.9, 0.04, 0.46, WOOD, 0, 0.5, 0, undefined, 0.02));
    g.add(box(0.92, 0.58, 0.07, 0x14122c, 0, 0.56, -0.05, undefined, 0.03));
    g.add(picture(0.84, 0.5, screenTex('tv'), 0, 0.6, -0.013));
    g.add(box(0.2, 0.03, 0.14, CHROME, 0, 0.5, -0.05));
  },
  big_screen: (g) => {
    g.add(box(2.95, 1.65, 0.16, 0x14122c, 0, 0.5, 0, undefined, 0.05));
    g.add(picture(2.8, 1.5, screenTex('big'), 0, 1.25, 0.086));
    g.add(box(2.95, 0.05, 0.18, 0x18e0ff, 0, 0.48, 0.01, glow(0x18e0ff)));
    for (const x of [-1.05, 1.05]) g.add(box(0.14, 0.52, 0.34, PLUM, x, 0, 0, undefined, 0.04));
  },
  trophy_cup: (g) => {
    g.add(box(0.46, 0.5, 0.46, 0xe9e4f2, 0, 0, 0, undefined, 0.04));
    g.add(box(0.5, 0.06, 0.5, GOLD, 0, 0.5, 0, undefined, 0.03));
    g.add(cyl(0.2, 0.09, 0.3, GOLD, 0, 0.56, 0, 16, { emissive: 0x8a5a00, emissiveIntensity: 0.4 }));
    g.add(cyl(0.04, 0.05, 0.1, GOLD, 0, 0.86, 0, 8));
    g.add(cyl(0.13, 0.04, 0.05, GOLD, 0, 0.95, 0, 12));
    for (const s of [-1, 1]) g.add(torus(0.07, 0.016, GOLD, s * 0.22, 0.74, 0, undefined, 0));
    g.add(ball(0.045, 0xfff1a0, 0, 1.03, 0, { detail: 1, ...glow(0xffd21e, 1.5) }));
  },
  trophy_case: (g) => {
    // an open frame (back, sides, top and base) with glass in front, so the trophies inside can be seen
    g.add(box(0.94, 1.55, 0.06, 0x2a2060, 0, 0, -0.26, undefined, 0.02));
    for (const x of [-0.45, 0.45]) g.add(box(0.06, 1.55, 0.58, WOOD_DARK, x, 0, 0, undefined, 0.02));
    g.add(box(0.94, 0.1, 0.58, WOOD_DARK, 0, 0, 0, undefined, 0.03));
    g.add(box(0.98, 0.09, 0.62, WOOD, 0, 1.46, 0, undefined, 0.03));
    g.add(box(0.84, 1.36, 0.02, 0xcdf0ff, 0, 0.1, 0.29, { opacity: 0.16, outline: false }));
    g.add(box(0.8, 0.05, 0.05, 0xffe9a0, 0, 1.4, 0.2, glow(0xffd860, 1.6)));
    for (const [i, y] of [0.34, 0.78, 1.2].entries()) {
      g.add(box(0.84, 0.035, 0.46, 0xf0e0c0, 0, y, 0, undefined, 0.01));
      g.add(cyl(0.075, 0.04, 0.17, GOLD, -0.2, y + 0.035, 0.02, 10));
      g.add(cyl(0.075, 0.04, 0.17, GOLD, 0.2, y + 0.035, 0.02, 10));
      g.add(ball(0.065, [0xff3da6, 0x18e0ff, 0x35f08a][i], 0, y + 0.1, 0.04, { detail: 1, ...glow([0xff3da6, 0x18e0ff, 0x35f08a][i], 0.5) }));
    }
  },
  alarm: (g) => {
    g.add(box(0.34, 0.5, 0.2, 0xd8dde8, 0, 0.5, -0.3, undefined, 0.03));
    g.add(box(0.1, 0.5, 0.1, 0x3b4256, 0, 0, -0.3, undefined, 0.02));
    g.add(cyl(0.12, 0.12, 0.14, 0xff3d55, 0, 1.0, -0.3, 14, glow(0xff3d55, 1.4)));
    g.add(box(0.16, 0.06, 0.02, 0x15151a, 0, 0.72, -0.19, undefined, 0.01));
  },
  safe: (g) => {
    g.add(box(0.82, 0.86, 0.7, 0x8d96a8, 0, 0, 0, undefined, 0.05));
    g.add(box(0.7, 0.74, 0.04, 0xaeb7c8, 0, 0.06, 0.35, undefined, 0.03));
    g.add(cyl(0.12, 0.12, 0.05, 0x3b4256, 0.0, 0.43, 0.39, 18));
    g.add(box(0.05, 0.2, 0.05, 0xffc81a, 0.22, 0.4, 0.39));
    for (const x of [-0.3, 0.3]) g.add(box(0.1, 0.08, 0.1, 0x3b4256, x, -0.0, -0.3));
  },
  vault_case: (g) => {
    g.add(box(0.94, 1.5, 0.06, 0x2b3347, 0, 0, -0.26, undefined, 0.02));
    for (const x of [-0.45, 0.45]) g.add(box(0.07, 1.5, 0.58, 0x6a7388, x, 0, 0, undefined, 0.02));
    g.add(box(0.98, 0.12, 0.62, 0x6a7388, 0, 0, 0, undefined, 0.03));
    g.add(box(0.98, 0.1, 0.62, 0x6a7388, 0, 1.44, 0, undefined, 0.03));
    g.add(box(0.84, 1.3, 0.03, 0x9fe8ff, 0, 0.12, 0.29, { opacity: 0.22, outline: false }));
    g.add(box(0.1, 0.12, 0.05, 0xffc81a, 0, 0.7, 0.33));
    g.add(box(0.8, 0.04, 0.04, 0x18d8ff, 0, 1.38, 0.2, glow(0x18d8ff, 1.4)));
    g.add(ball(0.12, 0xffd21e, 0, 0.42, 0, { detail: 1, ...glow(0xffd21e, 0.6) }));
  },
  gold_statue: (g) => {
    g.add(box(0.62, 0.48, 0.62, 0xe9e4f2, 0, 0, 0, undefined, 0.05));
    g.add(box(0.7, 0.06, 0.7, GOLD, 0, 0.48, 0, undefined, 0.03));
    g.add(cyl(0.17, 0.23, 0.62, GOLD, 0, 0.54, 0, 14, { emissive: 0x8a5a00, emissiveIntensity: 0.45 }));
    g.add(ball(0.18, GOLD, 0, 1.3, 0, { detail: 2, emissive: 0x8a5a00, emissiveIntensity: 0.45 }));
    g.add(box(0.52, 0.09, 0.12, GOLD, 0, 1.02, 0));
    g.add(ball(0.05, 0xfff1a0, 0.08, 1.38, 0.1, { detail: 1, outline: false, ...glow(0xffd21e, 1.2) }));
  },
  plant: (g) => {
    g.add(cyl(0.24, 0.18, 0.32, 0xd9743a, 0, 0, 0, 14));
    g.add(torus(0.24, 0.025, 0xb85a28, 0, 0.32, 0, undefined, Math.PI / 2));
    g.add(cyl(0.2, 0.2, 0.02, 0x4a2e1a, 0, 0.32, 0, 14));
    const greens = [0x22d070, 0x18b862, 0x35e88a, 0x14a050];
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.62, 6), toon(greens[i % 4]));
      leaf.position.set(Math.cos(a) * 0.12, 0.65, Math.sin(a) * 0.12);
      leaf.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      g.add(leaf);
    }
  },
  velvet_rope: (g) => {
    for (const x of [-0.8, 0.8]) {
      g.add(cyl(0.045, 0.065, 0.85, GOLD, x, 0.04, 0, 10));
      g.add(ball(0.085, GOLD, x, 0.93, 0, { detail: 2 }));
      g.add(cyl(0.13, 0.15, 0.05, GOLD, x, 0, 0, 14));
    }
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.8, 0.82, 0), new THREE.Vector3(0, 0.48, 0), new THREE.Vector3(0.8, 0.82, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.04, 6), toon(0xd8183a)));
  },
  aquarium: (g) => {
    g.add(box(1.92, 0.45, 0.62, PLUM, 0, 0, 0, undefined, 0.05));
    g.add(box(1.84, 0.88, 0.5, 0x8fd8ff, 0, 0.45, 0, { opacity: 0.4, outline: false }));
    g.add(box(1.86, 0.05, 0.52, 0x18e0ff, 0, 1.33, 0, glow(0x18e0ff, 1.4)));
    g.add(box(1.8, 0.06, 0.46, 0xf0d890, 0, 0.45, 0, undefined, 0.02)); // sand
    for (const [x, h, c] of [[-0.6, 0.42, 0x35e88a], [0.55, 0.55, 0x18b862], [0.2, 0.3, 0xff7ab8]] as const) g.add(cyl(0.02, 0.05, h, c, x, 0.5, -0.12, 6));
    g.add(ball(0.12, 0x8a8fa8, -0.1, 0.55, 0.08, { detail: 1 }));
    for (const [x, y, c] of [[-0.55, 0.95, 0xff8a1e], [0.15, 0.8, 0xffd21e], [0.62, 1.05, 0xff3da6], [-0.1, 1.1, 0x18e0ff]] as const) {
      const fish = ball(0.09, c, x, y, 0.05, { detail: 1, emissive: c, emissiveIntensity: 0.5 });
      fish.scale.set(1.4, 0.9, 0.6);
      g.add(fish);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), toon(c));
      tail.position.set(x - 0.15, y, 0.05);
      tail.rotation.z = Math.PI / 2;
      g.add(tail);
    }
    for (const [x, y] of [[0.4, 0.9], [-0.3, 1.0], [0.7, 0.7]] as const) g.add(ball(0.03, 0xeaf6ff, x, y, 0.1, { detail: 0, opacity: 0.8, outline: false }));
  },
  fountain: (g) => {
    g.add(cyl(1.0, 1.05, 0.34, 0xb4b9d0, 0, 0, 0, 28));
    g.add(torus(1.0, 0.05, 0xd8dcee, 0, 0.34, 0, undefined, Math.PI / 2));
    g.add(cyl(0.88, 0.88, 0.05, 0x18e0ff, 0, 0.32, 0, 28, glow(0x18e0ff, 1.2)));
    g.add(cyl(0.14, 0.22, 0.62, 0xb4b9d0, 0, 0.34, 0, 12));
    g.add(cyl(0.5, 0.5, 0.06, 0xb4b9d0, 0, 0.9, 0, 20));
    g.add(cyl(0.42, 0.42, 0.03, 0x18e0ff, 0, 0.95, 0, 20, glow(0x18e0ff, 1.2)));
    g.add(cyl(0.05, 0.08, 0.34, 0xb4b9d0, 0, 0.95, 0, 8));
    g.add(ball(0.17, 0xbff0ff, 0, 1.38, 0, { detail: 2, emissive: 0x18e0ff, emissiveIntensity: 0.8 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(ball(0.045, 0xdff8ff, Math.cos(a) * 0.62, 0.55, Math.sin(a) * 0.62, { detail: 1, opacity: 0.8, outline: false }));
    }
  },
};

function floorTile(g: THREE.Group, color: number, tier: number): void {
  // 1 a dull painted tile, 2 a lit tile, 3 a brighter one with a silver frame, 4 glass over light with a gold frame
  const frame = [0x2a2f4a, 0x141a3c, 0xcfd6e8, 0xffc81a][tier - 1];
  g.add(box(0.97, 0.05, 0.97, frame, 0, 0, 0, tier >= 3 ? glow(frame, tier === 4 ? 0.5 : 0.15) : { outline: false }, 0.02));
  const lit = [0.12, 0.6, 0.95, 1.3][tier - 1];
  const plate = box(0.8, 0.025, 0.8, [0x1c2038, 0x0c1230, 0x0c1230, 0x080c24][tier - 1], 0, 0.05, 0, { emissive: color, emissiveIntensity: lit, outline: false }, 0.02);
  plate.userData.pulse = tier > 1;
  g.add(plate);
  const core = box(0.36, 0.015, 0.36, 0xffffff, 0, 0.075, 0, { emissive: color, emissiveIntensity: [0.1, 1.2, 1.5, 1.9][tier - 1], outline: false }, 0.02);
  core.userData.pulse = tier > 1;
  g.add(core);
  if (tier === 4) g.add(box(0.7, 0.01, 0.7, 0xffffff, 0, 0.088, 0, { opacity: 0.18, outline: false }, 0.02)); // the glass over the light
}

/**
 * The finish of a piece that has no hand-made versions: worn and dull (1), as modelled (2), with a silver frame and a
 * touch more light (3), or with a glowing gold frame and sparkles (4).
 */
function grade(g: THREE.Group, tier: number, w: number, d: number): void {
  if (tier === 1) {
    const seen = new Map<THREE.Material, THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material) || !(m.material as THREE.MeshToonMaterial).color) return;
      let c = seen.get(m.material);
      if (!c) {
        const src = m.material as THREE.MeshToonMaterial;
        const worn = src.clone();
        worn.userData = { ...src.userData, shared: false };
        const hsl = { h: 0, s: 0, l: 0 };
        src.color.getHSL(hsl);
        worn.color.setHSL(hsl.h, hsl.s * 0.4, hsl.l * 0.78);
        worn.emissiveIntensity = src.emissiveIntensity * 0.35;
        seen.set(src, worn);
        c = worn;
      }
      m.material = c;
    });
  } else if (tier >= 3) {
    const rim = tier === 4 ? 0xffc81a : 0xdfe6f2;
    g.add(box(w * 0.98, 0.03, d * 0.98, rim, 0, 0, 0, tier === 4 ? glow(rim, 0.8) : undefined, 0.012));
    if (tier === 4) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(ball(0.045, 0xfff1a0, (x * w) / 2.1, 0.07, (z * d) / 2.1, { detail: 1, ...glow(0xffd860, 1.8) }));
  }
}

/** pieces that people work behind: how much to lower them (1 = as modelled) */
const LOW_STATION = new Map([['bar_straight', 0.74], ['dj_booth', 0.7], ['cocktail_bar', 0.74], ['bar_corner', 0.74], ['bar_long', 0.74], ['dj_booth_pro', 0.7]]);

/** Model for a catalog id, centred on its (unrotated) footprint. Unknown ids get a grey box so nothing is invisible. */
export function buildProp(id: string, w: number, d: number, tier = 1): THREE.Group {
  const g = new THREE.Group();
  const build = BUILDERS[id];
  if (build && LOW_STATION.has(id)) {
    // the bar and the DJ booth are lowered so that the person working behind them can be seen from the camera
    const inner = new THREE.Group();
    build(inner, tier);
    inner.scale.y = LOW_STATION.get(id)!;
    g.add(inner);
  } else if (build) {
    build(g, tier);
    if (!(id in TIERED) && !id.startsWith('floor_')) grade(g, tier, w, d); // the rest get the shared finish
  } else g.add(box(w * 0.9, 0.6, d * 0.9, 0x888899, 0, 0, 0));
  return g;
}
