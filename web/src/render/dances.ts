// The dances: animation clips built in code on top of the character's skeleton (the model only ships idle, walk, dance,
// celebrate and dj_mix). Each dance is a function of the position in a 4-beat loop that says how far to turn each bone from
// its rest pose; the clip is that function sampled 48 times, so everything loops without a seam. The clips are drawn at
// 100 BPM and sped up or slowed down to the song (see DANCE_BPM).
//
// How the rig turns (read from the model's own dance clip): bones are measured in their rest frame, where
//   arms:  rotating about Z lifts the arm sideways (left: -Z, right: +Z), about -X lifts it forward; the elbow bends about -X
//   legs:  rotating about -X swings the thigh forward, about Z (left -Z, right +Z) out to the side; the knee bends about +X
//   spine, hips, neck and head: +X leans forward, Y turns, Z leans sideways.

import * as THREE from 'three';
import { CHORE_ANIMS, type ChoreAnim, type EmoteId } from '../core/character.ts';
import { DANCE_BPM, EMOTES } from '../core/emotes.ts';

type Bone = 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'handL' | 'handR' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'footL' | 'footR';
const BONES: Bone[] = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
/** the names of the bones in the model (the loader drops the dots of the names it was authored with) */
const NAME: Record<Bone, string[]> = {
  hips: ['hips'], spine: ['spine'], chest: ['chest'], neck: ['neck'], head: ['head'],
  armL: ['upper_armL', 'upper_arm.L'], armR: ['upper_armR', 'upper_arm.R'], foreL: ['forearmL', 'forearm.L'], foreR: ['forearmR', 'forearm.R'], handL: ['handL', 'hand.L'], handR: ['handR', 'hand.R'],
  thighL: ['thighL', 'thigh.L'], thighR: ['thighR', 'thigh.R'], shinL: ['shinL', 'shin.L'], shinR: ['shinR', 'shin.R'], footL: ['footL', 'foot.L'], footR: ['footR', 'foot.R'],
};

/** Find a bone of the skeleton by its role, whichever way the loader spelled its name. */
export function findBone(root: THREE.Object3D, bone: Bone): THREE.Object3D | null {
  for (const n of NAME[bone]) {
    const o = root.getObjectByName(n);
    if (o) return o;
  }
  return null;
}

type V3 = [number, number, number];
interface Pose {
  /** degrees (X, Y, Z) away from the rest pose, per bone */
  rot: Partial<Record<Bone, V3>>;
  /** how far the hips move from their rest place: sideways, up (negative = down), forward */
  hips?: V3;
}

const TAU = Math.PI * 2;
const rad = (d: number) => (d * Math.PI) / 180;
/** seconds of one loop: four beats */
export const LOOP_SECONDS = (4 * 60) / DANCE_BPM;
const FRAMES = 48;
/** how far the hips drop when a leg is bent so that the feet stay on the floor (thigh and shin are about 0.13 each) */
const drop = (knee: number) => 0.26 * (1 - Math.cos(rad(knee) / 2));

// small builders for the poses
const armL = (up: number, fwd = 0): V3 => [-fwd, 0, -up];
const armR = (up: number, fwd = 0): V3 => [-fwd, 0, up];
const elbow = (bend: number, roll = 0): V3 => [-bend, 0, roll];
const legs = (kL: number, kR: number, out: number): Partial<Record<Bone, V3>> => ({
  thighL: [-kL / 2, 0, -out], thighR: [-kR / 2, 0, out], shinL: [kL, 0, 0], shinR: [kR, 0, 0],
});
const snap = (pattern: number[], p: number): number => {
  const n = pattern.length;
  const i = Math.floor(p * n) % n;
  const f = p * n - Math.floor(p * n);
  const a = pattern[(i + n - 1) % n];
  const b = pattern[i];
  const k = Math.min(1, f / 0.22);
  return a + (b - a) * (k * k * (3 - 2 * k));
};

type Dance = (p: number) => Pose;
const w = (p: number, n: number, ph = 0) => Math.sin(TAU * (n * p + ph));

const DANCES: Record<EmoteId, Dance> = {
  dancehall: (p) => {
    const k = 40 + 14 * w(p, 8);
    const sway = w(p, 4);
    return {
      hips: [0.05 * sway, -drop(k) - 0.012 * w(p, 8), 0],
      rot: {
        ...legs(k, k, 14), hips: [4 * w(p, 8), 8 * sway, 12 * sway], spine: [0, -6 * sway, -5 * sway], head: [6 * w(p, 8), 8 * w(p, 4), 0],
        armL: armL(55 + 45 * w(p, 4), 20), armR: armR(55 - 45 * w(p, 4), 20), foreL: elbow(60 + 30 * w(p, 8)), foreR: elbow(60 - 30 * w(p, 8)),
      },
    };
  },
  reggaeton: (p) => {
    const k = 58 + 6 * w(p, 8);
    return {
      hips: [0, -drop(k), 0.02],
      rot: {
        ...legs(k, k, 20), hips: [16 * w(p, 4), 6 * w(p, 2), 4 * w(p, 4)], spine: [14, 0, 0], head: [10 + 6 * w(p, 8), 0, 0],
        armL: armL(14, 30 + 20 * w(p, 4)), armR: armR(14, 30 + 20 * w(p, 4, 0.25)), foreL: elbow(80), foreR: elbow(80),
      },
    };
  },
  salsa: (p) => {
    const s = w(p, 4);
    const kL = 20 + 14 * Math.max(0, s);
    const kR = 20 + 14 * Math.max(0, -s);
    return {
      hips: [0.06 * w(p, 2), -(drop(kL) + drop(kR)) / 2, 0],
      rot: {
        ...legs(kL, kR, 8), hips: [0, 16 * s, 7 * w(p, 4, 0.25)], spine: [2, -8 * s, 0], head: [0, 6 * s, 0],
        armL: armL(22 + 12 * w(p, 4), 40), armR: armR(22 + 12 * w(p, 4, 0.5), 40), foreL: elbow(95), foreR: elbow(95),
      },
    };
  },
  merengue: (p) => {
    const k = 22 + 8 * Math.abs(w(p, 8));
    return {
      hips: [0, -drop(k) + 0.012 * w(p, 16), 0],
      rot: {
        ...legs(k, k, 8), hips: [0, 0, 6 * w(p, 8)], spine: [0, 6 * w(p, 4), 0], head: [0, -6 * w(p, 4), 0],
        armL: armL(15, 60), armR: armR(15, 60), foreL: elbow(100), foreR: elbow(100),
      },
    };
  },
  hiphop: (p) => {
    const b = w(p, 4);
    const k = 34 + 12 * b;
    return {
      hips: [0, -drop(k), 0],
      rot: {
        ...legs(k, k, 16), hips: [0, 5 * w(p, 2), 0], spine: [-8 + 6 * b, 0, 0], head: [12 * b, 0, 0],
        armL: armL(20, 70 + 25 * b), armR: armR(20, 70 - 25 * b), foreL: elbow(90 - 30 * b), foreR: elbow(90 + 30 * b),
      },
    };
  },
  robot: (p) => {
    const k = 22;
    return {
      hips: [0, -drop(k), 0],
      rot: {
        ...legs(k, k, 10), hips: [0, snap([0, 20, 20, 0, -20, -20, 0, 0], p), 0], head: [0, snap([0, 25, 25, 0, 0, -25, -25, 0], p), 0],
        armL: armL(snap([20, 80, 80, 20, 60, 60, 20, 20], p), snap([0, 0, 40, 40, 0, 0, 0, 40], p)), armR: armR(snap([60, 60, 20, 80, 80, 20, 20, 60], p), snap([40, 0, 0, 0, 40, 40, 0, 0], p)),
        foreL: elbow(snap([90, 90, 60, 90, 90, 60, 90, 90], p)), foreR: elbow(snap([60, 90, 90, 90, 60, 90, 90, 60], p)),
      },
    };
  },
  disco: (p) => {
    const sw = w(p, 2);
    const k = 24 + 10 * w(p, 4);
    return {
      hips: [0.04 * sw, -drop(k), 0],
      rot: {
        ...legs(k, k, 12), hips: [0, 6 * sw, 10 * w(p, 4)], head: [0, 0, 6 * sw],
        armR: armR(sw > 0 ? 150 : 28, 0), armL: armL(sw > 0 ? 28 : 150, 0), foreR: elbow(sw > 0 ? 8 : 115), foreL: elbow(sw > 0 ? 115 : 8),
      },
    };
  },
  cumbia: (p) => {
    const sw = w(p, 2);
    const k = 24 + 8 * Math.abs(w(p, 4));
    return {
      hips: [0.07 * sw, -drop(k), 0],
      rot: {
        ...legs(k, k, 10), hips: [0, 0, 9 * sw], spine: [0, 0, -5 * sw], head: [0, 0, 5 * sw],
        armL: armL(35 + 25 * sw), armR: armR(35 - 25 * sw), foreL: elbow(30), foreR: elbow(30),
      },
    };
  },
  saltos: (p) => {
    const air = Math.max(0, w(p, 4));
    const k = 46 - 38 * air;
    return {
      hips: [0, -drop(k) + 0.1 * air, 0],
      rot: { ...legs(k, k, 12), spine: [-4, 0, 0], head: [-6, 0, 0], armL: armL(140 + 20 * w(p, 4)), armR: armR(140 - 20 * w(p, 4)), foreL: elbow(20), foreR: elbow(20) },
    };
  },
  ola: (p) => {
    const k = 28 + 8 * w(p, 4);
    return {
      hips: [0, -drop(k), 0],
      rot: {
        ...legs(k, k, 12), hips: [0, 0, 5 * w(p, 2)], spine: [0, 0, 8 * w(p, 1)], head: [0, 0, 6 * w(p, 1)],
        armL: armL(90 + 70 * w(p, 1)), armR: armR(90 + 70 * w(p, 1, 0.5)), foreL: elbow(25 + 20 * w(p, 2)), foreR: elbow(25 + 20 * w(p, 2, 0.5)),
      },
    };
  },
  aplauso: (p) => {
    const c = w(p, 8);
    const k = 12;
    return {
      hips: [0, -drop(k) + 0.008 * c, 0],
      rot: { ...legs(k, k, 6), head: [4, 0, 0], armL: armL(6 + 14 * c, 55), armR: armR(6 + 14 * c, 55), foreL: elbow(100), foreR: elbow(100) },
    };
  },
  saludo: (p) => {
    const k = 8;
    return {
      hips: [0, -drop(k), 0],
      rot: {
        ...legs(k, k, 6), hips: [0, 0, 3 * w(p, 2)], head: [0, 0, 5 * w(p, 2)],
        armR: armR(125), foreR: elbow(35, 28 * w(p, 6)), armL: armL(8),
      },
    };
  },
};


/** The working movements of the prison chores: bent over a toilet, mopping, washing up, folding, painting, sweeping. */
const CHORES: Record<ChoreAnim, Dance> = {
  scrub: (p) => {
    const k = 38;
    return { hips: [0, -drop(k), 0.04], rot: { ...legs(k, k, 14), spine: [34, 0, 0], head: [12, 0, 0], armL: armL(8, 70 + 14 * w(p, 4)), armR: armR(8, 70 - 14 * w(p, 4)), foreL: elbow(30 + 25 * w(p, 4)), foreR: elbow(30 - 25 * w(p, 4)) } };
  },
  mop: (p) => {
    const k = 22;
    return { hips: [0.05 * w(p, 1), -drop(k), 0], rot: { ...legs(k, k, 12), hips: [0, 14 * w(p, 1), 0], spine: [22, 10 * w(p, 1), 0], head: [8, 0, 0], armL: armL(10, 52), armR: armR(10, 58 + 10 * w(p, 2)), foreL: elbow(40), foreR: elbow(34) } };
  },
  wash: (p) => {
    const k = 12;
    return { hips: [0, -drop(k), 0], rot: { ...legs(k, k, 8), spine: [10, 0, 0], head: [14, 0, 0], armL: armL(14, 46 + 8 * w(p, 4)), armR: armR(14, 46 - 8 * w(p, 4)), foreL: elbow(78 + 14 * w(p, 4)), foreR: elbow(78 - 14 * w(p, 4)) } };
  },
  fold: (p) => {
    const k = 12;
    return { hips: [0, -drop(k), 0], rot: { ...legs(k, k, 8), spine: [12, 0, 0], head: [16, 0, 0], armL: armL(12 + 10 * w(p, 2), 44), armR: armR(12 - 10 * w(p, 2), 44), foreL: elbow(70 + 20 * w(p, 2)), foreR: elbow(70 - 20 * w(p, 2)) } };
  },
  paint: (p) => {
    const k = 14;
    return { hips: [0, -drop(k), 0], rot: { ...legs(k, k, 10), spine: [-4, 0, 0], head: [-10, 0, 0], armR: armR(30, 100 + 40 * w(p, 2)), foreR: elbow(24), armL: armL(12, 8), foreL: elbow(50) } };
  },
  sweep: (p) => {
    const k = 20;
    return { hips: [0.04 * w(p, 1), -drop(k), 0], rot: { ...legs(k, k, 12), hips: [0, 10 * w(p, 1), 0], spine: [16, 8 * w(p, 1), 0], head: [10, 0, 0], armL: armL(10, 48), armR: armR(10, 54), foreL: elbow(36), foreR: elbow(30) } };
  },
};

/** The clips of every dance, built for this particular skeleton (they hold its own rest pose). */
export function makeDanceClips(root: THREE.Object3D): THREE.AnimationClip[] {
  const bones = new Map<Bone, THREE.Object3D>();
  for (const b of BONES) {
    const o = findBone(root, b);
    if (o) bones.set(b, o);
  }
  const hips = bones.get('hips');
  if (!hips) return [];
  const rest = new Map<Bone, THREE.Quaternion>([...bones].map(([b, o]) => [b, o.quaternion.clone()]));
  const hipsRest = hips.position.clone();
  const feet = [findBone(root, 'footL'), findBone(root, 'footR')].filter((o): o is THREE.Object3D => !!o);
  const wp = new THREE.Vector3();
  const lowestFoot = () => {
    root.updateMatrixWorld(true);
    return Math.min(...feet.map((f) => f.getWorldPosition(wp).y));
  };
  const restFloor = lowestFoot();
  const times = Array.from({ length: FRAMES + 1 }, (_, i) => (i / FRAMES) * LOOP_SECONDS);
  const euler = new THREE.Euler();
  const delta = new THREE.Quaternion();
  const clips: THREE.AnimationClip[] = [];
  const all: Array<{ id: string; fn: Dance; chore: boolean }> = [...EMOTES.map((e) => ({ id: e.id as string, fn: DANCES[e.id], chore: false })), ...CHORE_ANIMS.map((id) => ({ id: id as string, fn: CHORES[id], chore: true }))];
  for (const emote of all) {
    const dance = emote.fn;
    const tracks: THREE.KeyframeTrack[] = [];
    const quats = new Map<Bone, number[]>([...bones.keys()].map((b) => [b, []]));
    const hipPos: number[] = [];
    const last = new Map<Bone, THREE.Quaternion>();
    for (let i = 0; i <= FRAMES; i++) {
      const pose = dance((i % FRAMES) / FRAMES);
      for (const [b] of bones) {
        const v = pose.rot[b] ?? [0, 0, 0];
        delta.setFromEuler(euler.set(rad(v[0]), rad(v[1]), rad(v[2]), 'XYZ'));
        const q = rest.get(b)!.clone().multiply(delta);
        const prev = last.get(b);
        if (prev && prev.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w); // the short way round
        last.set(b, q);
        quats.get(b)!.push(q.x, q.y, q.z, q.w);
      }
      const h = pose.hips ?? [0, 0, 0];
      // the feet are kept on the floor: put this pose on the skeleton, see where the lowest foot ends up, and move the hips by the
      // difference (the jump only gets lifted when it sinks, so it can still leave the floor)
      for (const [b, o] of bones) o.quaternion.fromArray(quats.get(b)!, quats.get(b)!.length - 4);
      hips.position.set(hipsRest.x + h[0], hipsRest.y + h[1], hipsRest.z + h[2]);
      const off = restFloor - lowestFoot();
      const fix = emote.id === 'saltos' ? Math.max(0, off) : off;
      hipPos.push(hipsRest.x + h[0], hipsRest.y + h[1] + fix, hipsRest.z + h[2]);
    }
    for (const [b, o] of bones) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, quats.get(b)!));
      o.quaternion.copy(rest.get(b)!);
    }
    hips.position.copy(hipsRest);
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, hipPos));
    clips.push(new THREE.AnimationClip(emote.id, LOOP_SECONDS, tracks));
  }
  return clips;
}
