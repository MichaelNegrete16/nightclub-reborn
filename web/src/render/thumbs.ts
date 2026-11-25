import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterConfig, Sex } from '../core/character';
import { BY_ID } from '../core/catalog';
import { applyConfig, instantiate, loadModel } from './avatar';
import { buildProp } from './props';

const SIZE = 200;

/**
 * Renders small pictures of the 3D objects and of the characters (portraits) for the shop, inventory and dialogues.
 * Uses its own tiny renderer so it never disturbs the game view. Results are cached as data URLs.
 */
export class Thumbs {
  private renderer: THREE.WebGLRenderer;
  private effect: OutlineEffect;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  private cache = new Map<string, string>();
  private models: Partial<Record<Sex, GLTF>> = {};

  constructor() {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.setClearColor(0x000000, 0);
    this.effect = new OutlineEffect(this.renderer, { defaultThickness: 0.0075, defaultColor: [0.02, 0.02, 0.05], defaultAlpha: 1 });
    this.effect.setSize(SIZE, SIZE);
    this.scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x3a2a5a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4);
    this.scene.add(key);
  }

  /** Picture of a catalog object seen from the club's usual angle. */
  item(id: string, tier = 1): string {
    const hit = this.cache.get(`item:${id}:${tier}`);
    if (hit) return hit;
    const def = BY_ID.get(id);
    if (!def) return '';
    const model = buildProp(id, def.w, def.d, tier);
    const holder = new THREE.Group();
    holder.add(model);
    holder.rotation.y = 0.6; // the front of the object (+Z) turned towards the camera, which looks from the south-east like the club camera
    const url = this.shoot(holder, 0.55);
    this.cache.set(`item:${id}:${tier}`, url);
    return url;
  }

  /** Head-and-shoulders portrait of a character with a given look. */
  async portrait(key: string, cfg: CharacterConfig): Promise<string> {
    const cacheKey = `portrait:${key}:${JSON.stringify(cfg)}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    if (!this.models[cfg.sex]) this.models[cfg.sex] = await loadModel(cfg.sex);
    const prepared = instantiate(this.models[cfg.sex]!);
    applyConfig(prepared, cfg);
    const holder = new THREE.Group();
    holder.add(prepared.root);
    holder.rotation.y = -0.25;
    const url = this.shoot(holder, 0.8, true);
    prepared.mats.forEach((m) => m.dispose());
    this.cache.set(cacheKey, url);
    return url;
  }

  private shoot(object: THREE.Object3D, lift: number, portrait = false): string {
    this.scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    if (portrait) {
      // head and shoulders of a 1.2 m character
      this.camera.fov = 24;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(0.3, 0.98, 2.6);
      this.camera.lookAt(0, 0.9, 0);
    } else {
      this.camera.fov = 26;
      this.camera.updateProjectionMatrix();
      const radius = Math.max(size.x, size.y, size.z) * 0.62 + 0.25;
      const dist = radius / Math.tan((this.camera.fov * Math.PI) / 360);
      this.camera.position.set(center.x + dist * 0.62, center.y + lift * dist * 0.62 + 0.2, center.z + dist * 0.78);
      this.camera.lookAt(center.x, center.y - 0.05, center.z);
    }
    // The canvas keeps its pixels (preserveDrawingBuffer) and is shared by every picture: wipe colour and depth first,
    // otherwise each picture is drawn over the previous one.
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.effect.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(object);
    return url;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
