import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { lipsFor, type AnimId, type CharacterConfig, type Sex } from '../core/character';
import { gradientMap } from './toon';
import { makeDanceClips } from './dances';

// glTF material name -> customization slot. Every slot shares ONE material, so tinting a slot tints every mesh using it.
const SLOT_BY_MATERIAL: Record<string, string> = {
  mat_skin: 'skin', mat_hair: 'hair', mat_brow: 'brow', mat_iris: 'iris', mat_lips: 'lips',
  mat_top: 'top', mat_bottom: 'bottom', mat_shoes: 'shoes', mat_cap: 'cap', mat_glasses: 'glasses',
  mat_face: 'face', mat_eye_white: 'eyeWhite',
};
// Tiny dark features look better without the ink outline (it would swallow them).
const NO_OUTLINE = new Set(['face', 'brow', 'lips', 'iris']);

/** A character model with its own materials (so it can have its own colors) and its own animation mixer. */
export interface Prepared {
  root: THREE.Object3D;
  mats: Map<string, THREE.MeshToonMaterial>;
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
  nodes: string[];
}

export const modelUrl = (sex: Sex) => `${import.meta.env.BASE_URL}models/base_${sex}.glb`;

export function loadModel(sex: Sex): Promise<GLTF> {
  return new GLTFLoader().loadAsync(modelUrl(sex));
}

/** Independent copy of a loaded model (skeleton included), ready to be tinted and animated. */
export function instantiate(gltf: GLTF): Prepared {
  return prepareModel(cloneSkinned(gltf.scene), withDances(gltf));
}

/** The model's own clips plus the dances built for its skeleton (built once per model: every copy shares them). */
const DANCES = new WeakMap<GLTF, THREE.AnimationClip[]>();
export function withDances(gltf: GLTF): THREE.AnimationClip[] {
  let d = DANCES.get(gltf);
  if (!d) {
    d = makeDanceClips(gltf.scene);
    DANCES.set(gltf, d);
  }
  return [...gltf.animations, ...d];
}

export function prepareModel(root: THREE.Object3D, animations: THREE.AnimationClip[]): Prepared {
  const mats = new Map<string, THREE.MeshToonMaterial>();
  const nodes: string[] = [];
  const slotOf = (m: THREE.Material) => SLOT_BY_MATERIAL[m.name.replace(/\.\d+$/, '')] ?? m.name;
  const toon = (src: THREE.Material): THREE.MeshToonMaterial => {
    const slot = slotOf(src);
    let m = mats.get(slot);
    if (!m) {
      const base = (src as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color('#ffffff');
      m = new THREE.MeshToonMaterial({ color: base, gradientMap: gradientMap() });
      m.name = slot;
      m.userData.outlineParameters = NO_OUTLINE.has(slot)
        ? { visible: false }
        : { thickness: 0.0042, color: [0.02, 0.02, 0.05], alpha: 1, visible: true };
      mats.set(slot, m);
    }
    return m;
  };
  root.traverse((o) => {
    if (o.name) nodes.push(o.name);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.frustumCulled = false; // skinned bounds are unreliable once animated
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toon) : toon(mesh.material);
    }
  });
  return { root, mats, clips: animations, mixer: new THREE.AnimationMixer(root), nodes };
}

export function applyConfig(cur: Prepared, cfg: CharacterConfig): void {
  const tint = (slot: string, hex: string) => cur.mats.get(slot)?.color.set(hex);
  tint('skin', cfg.skin);
  tint('lips', lipsFor(cfg.skin));
  tint('hair', cfg.hairColor);
  tint('brow', cfg.hairColor);
  tint('iris', cfg.eyeColor);
  tint('top', cfg.topColor);
  tint('bottom', cfg.bottomColor);
  tint('shoes', cfg.shoesColor);
  tint('cap', cfg.capColor);

  const show = (name: string): boolean => {
    if (name.startsWith('hair_')) return name === `hair_${cfg.hairStyle}` && !cfg.cap;
    if (name.startsWith('top_')) return name === `top_${cfg.top}`;
    if (name.startsWith('bottom_')) return name === `bottom_${cfg.bottom}`;
    if (name === 'acc_cap') return cfg.cap;
    if (name === 'acc_glasses') return cfg.glasses;
    return true;
  };
  // Multi-material meshes come in as groups; three suffixes duplicate names (_1, .001), so normalise before matching.
  cur.root.traverse((o) => {
    if (/^(hair_|top_|bottom_|acc_)/.test(o.name)) o.visible = show(o.name.replace(/(\.\d+|_\d+)$/, ''));
  });
}

/** Cross-fade to a clip by id. Returns the running action. */
export function playClip(cur: Prepared, id: AnimId, from: THREE.AnimationAction | null, fade = 0.25): THREE.AnimationAction | null {
  const clip = THREE.AnimationClip.findByName(cur.clips, id) ?? cur.clips[0];
  if (!clip) return null;
  const next = cur.mixer.clipAction(clip);
  next.reset().play();
  if (from && from !== next) from.crossFadeTo(next, fade, false);
  return next;
}

/** The single character shown in the character creator. */
export class Avatar {
  readonly group = new THREE.Group();
  private cache = new Map<Sex, Prepared>();
  private current: Prepared | null = null;
  private action: THREE.AnimationAction | null = null;

  async setSex(sex: Sex): Promise<void> {
    let prepared = this.cache.get(sex);
    if (!prepared) {
      const gltf = await loadModel(sex);
      prepared = prepareModel(gltf.scene, withDances(gltf));
      this.cache.set(sex, prepared);
    }
    if (this.current) this.group.remove(this.current.root);
    this.current = prepared;
    this.group.add(prepared.root);
    this.action = null;
  }

  has(nodeName: string): boolean {
    return !!this.current?.nodes.some((n) => n === nodeName || n.startsWith(nodeName));
  }

  apply(cfg: CharacterConfig): void {
    if (this.current) applyConfig(this.current, cfg);
  }

  play(id: AnimId): void {
    if (this.current) this.action = playClip(this.current, id, this.action);
  }

  update(dt: number): void {
    this.current?.mixer.update(dt);
  }
}
