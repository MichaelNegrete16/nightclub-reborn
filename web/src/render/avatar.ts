import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeAttributes } from 'three/addons/utils/BufferGeometryUtils.js';
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
  paint?: (cfg: CharacterConfig) => void;
  release?: () => void;
  combo?: string;
}

export const modelUrl = (sex: Sex) => `${import.meta.env.BASE_URL}models/base_${sex}.glb`;

const MODELS = new Map<Sex, Promise<GLTF>>();

export function loadModel(sex: Sex): Promise<GLTF> {
  let p = MODELS.get(sex);
  if (!p) {
    p = new GLTFLoader().loadAsync(modelUrl(sex));
    p.catch(() => MODELS.delete(sex));
    MODELS.set(sex, p);
  }
  return p;
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

const GATED = /^(hair_|top_|bottom_|acc_)/;
const trim = (name: string) => name.replace(/(\.\d+|_\d+)$/, '');

function shows(name: string, cfg: CharacterConfig): boolean {
  if (name.startsWith('hair_')) return name === `hair_${cfg.hairStyle}` && !cfg.cap;
  if (name.startsWith('top_')) return name === `top_${cfg.top}`;
  if (name.startsWith('bottom_')) return name === `bottom_${cfg.bottom}`;
  if (name === 'acc_cap') return cfg.cap;
  if (name === 'acc_glasses') return cfg.glasses;
  return true;
}

function tints(cfg: CharacterConfig): Array<[string, string]> {
  return [
    ['skin', cfg.skin], ['lips', lipsFor(cfg.skin)], ['hair', cfg.hairColor], ['brow', cfg.hairColor], ['iris', cfg.eyeColor],
    ['top', cfg.topColor], ['bottom', cfg.bottomColor], ['shoes', cfg.shoesColor], ['cap', cfg.capColor],
  ];
}

const MAX_SLOTS = 16;

interface Source {
  gates: string[];
  slot: number;
  outlined: boolean;
  geometry: THREE.BufferGeometry;
}

interface Combo {
  geometry: THREE.BufferGeometry;
}

interface Rig {
  template: THREE.Object3D;
  bones: number[];
  holder: number;
  inverses: THREE.Matrix4[];
  bind: THREE.Matrix4;
  sources: Source[];
  slots: string[];
  base: Float32Array;
  combos: Map<string, Combo | null>;
}

const RIGS = new WeakMap<GLTF, Rig | null>();

function listOf(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => out.push(o));
  return out;
}

function rigOf(gltf: GLTF): Rig | null {
  if (RIGS.has(gltf)) return RIGS.get(gltf)!;
  const rig = buildRig(gltf);
  RIGS.set(gltf, rig);
  return rig;
}

function buildRig(gltf: GLTF): Rig | null {
  const srcNodes = listOf(gltf.scene);
  const skinned = srcNodes.filter((o) => (o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[];
  if (!skinned.length) return null;
  const first = skinned[0];
  const parent = skinned.every((m) => m.parent === first.parent || m.parent?.parent === first.parent) ? first.parent : null;
  if (!parent) return null;
  const slots: string[] = [];
  const base = new Float32Array(MAX_SLOTS * 3);
  const sources: Source[] = [];
  for (const m of skinned) {
    if (Array.isArray(m.material) || m.skeleton.bones.length !== first.skeleton.bones.length || m.skeleton.bones.some((b, i) => b !== first.skeleton.bones[i])) return null;
    if (!m.bindMatrix.equals(first.bindMatrix) || !m.matrix.equals(first.matrix)) return null;
    if (m.parent !== parent && !(m.parent && m.parent.matrix.equals(new THREE.Matrix4()))) return null;
    const name = SLOT_BY_MATERIAL[m.material.name.replace(/\.\d+$/, '')] ?? m.material.name;
    let slot = slots.indexOf(name);
    if (slot < 0) {
      if (slots.length >= MAX_SLOTS) return null;
      slot = slots.push(name) - 1;
      ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color('#ffffff')).toArray(base, slot * 3);
    }
    const gates: string[] = [];
    for (let o: THREE.Object3D | null = m; o && o !== gltf.scene; o = o.parent) if (GATED.test(o.name)) gates.push(trim(o.name));
    sources.push({ gates, slot, outlined: !NO_OUTLINE.has(name), geometry: m.geometry });
  }
  const template = cloneSkinned(gltf.scene);
  const tplNodes = listOf(template);
  const drop = new Set<THREE.Object3D>();
  for (const m of skinned) {
    const t = tplNodes[srcNodes.indexOf(m)];
    drop.add(t);
    if (m.parent !== parent && t.parent) drop.add(t.parent);
  }
  for (const t of drop) t.removeFromParent();
  const kept = listOf(template);
  const holder = kept.indexOf(tplNodes[srcNodes.indexOf(parent)]);
  const bones = first.skeleton.bones.map((b) => kept.indexOf(tplNodes[srcNodes.indexOf(b)]));
  if (holder < 0 || bones.some((i) => i < 0)) return null;
  return { template, bones, holder, inverses: first.skeleton.boneInverses, bind: first.bindMatrix.clone(), sources, slots, base, combos: new Map() };
}

export function comboKey(cfg: CharacterConfig): string {
  return [cfg.sex, cfg.cap ? '' : cfg.hairStyle, cfg.top, cfg.bottom, cfg.cap ? 1 : 0, cfg.glasses ? 1 : 0].join('|');
}

function comboOf(rig: Rig, cfg: CharacterConfig): Combo | null {
  const key = comboKey(cfg);
  if (rig.combos.has(key)) return rig.combos.get(key)!;
  const combo = buildCombo(rig, cfg);
  rig.combos.set(key, combo);
  return combo;
}

function buildCombo(rig: Rig, cfg: CharacterConfig): Combo | null {
  const picked = rig.sources.filter((s) => s.gates.every((g) => shows(g, cfg)));
  const ordered = [...picked.filter((s) => s.outlined), ...picked.filter((s) => !s.outlined)];
  if (!ordered.length) return null;
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    const parts = ordered.map((s) => s.geometry.getAttribute(name));
    if (parts.some((a) => !a || (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)) return null;
    const merged = mergeAttributes(parts as THREE.BufferAttribute[]);
    if (!merged) return null;
    geometry.setAttribute(name, merged);
  }
  let verts = 0;
  let outlinedIndices = 0;
  const index: number[] = [];
  const slotId = new Float32Array(geometry.getAttribute('position').count);
  for (const s of ordered) {
    const count = s.geometry.getAttribute('position').count;
    slotId.fill(s.slot, verts, verts + count);
    const idx = s.geometry.index;
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + verts);
    else for (let i = 0; i < count; i++) index.push(i + verts);
    verts += count;
    if (s.outlined) outlinedIndices = index.length;
  }
  geometry.setAttribute('slotId', new THREE.BufferAttribute(slotId, 1));
  geometry.setIndex(index);
  geometry.addGroup(0, outlinedIndices, 0);
  geometry.addGroup(outlinedIndices, index.length - outlinedIndices, 1);
  return { geometry };
}

function slotMaterial(colors: Float32Array, outlined: boolean): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradientMap() });
  m.userData.outlineParameters = outlined ? { thickness: 0.0042, color: [0.02, 0.02, 0.05], alpha: 1, visible: true } : { visible: false };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.slotColors = { value: colors };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute float slotId;\nvarying float vSlot;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = slotId;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `uniform vec3 slotColors[ ${MAX_SLOTS} ];\nvarying float vSlot;\n#include <common>`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( slotColors[ int( vSlot + 0.5 ) ], opacity );');
  };
  m.customProgramCacheKey = () => 'slots';
  return m;
}

const paintColor = new THREE.Color();

export function instantiateFixed(gltf: GLTF, cfg: CharacterConfig): Prepared {
  const rig = rigOf(gltf);
  const combo = rig && comboOf(rig, cfg);
  if (!rig || !combo) {
    const plain = instantiate(gltf);
    applyConfig(plain, cfg);
    return plain;
  }
  const root = rig.template.clone(true);
  const nodes = listOf(root);
  const colors = rig.base.slice();
  const body = slotMaterial(colors, true);
  const face = slotMaterial(colors, false);
  const mesh = new THREE.SkinnedMesh(combo.geometry, [body, face]);
  mesh.frustumCulled = false;
  nodes[rig.holder].add(mesh);
  mesh.bind(new THREE.Skeleton(rig.bones.map((i) => nodes[i] as THREE.Bone), rig.inverses), rig.bind);
  const paint = (c: CharacterConfig) => {
    for (const [slot, hex] of tints(c)) {
      const i = rig.slots.indexOf(slot);
      if (i >= 0) paintColor.set(hex).toArray(colors, i * 3);
    }
  };
  paint(cfg);
  const release = () => {
    body.dispose();
    face.dispose();
    mesh.skeleton.dispose();
  };
  return { root, mats: new Map(), clips: withDances(gltf), mixer: new THREE.AnimationMixer(root), nodes: [], paint, release, combo: comboKey(cfg) };
}

export function applyConfig(cur: Prepared, cfg: CharacterConfig): void {
  if (cur.paint) return cur.paint(cfg);
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
      prepared = instantiate(await loadModel(sex));
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
