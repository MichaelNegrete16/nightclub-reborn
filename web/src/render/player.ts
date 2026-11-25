import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimId, CharacterConfig, Sex } from '../core/character';
import { applyConfig, comboKey, instantiateFixed, loadModel, playClip, type Prepared } from './avatar';
import { isEmote } from '../core/emotes';

const WALK_SPEED_UP = 1.9; // the walk cycle was authored slower than the player moves

/** The player's own character in the club and the street: stands, and walks along points it is given. */
export class PlayerActor {
  readonly group = new THREE.Group();
  x = 0;
  z = 0;
  /** points still to walk through (world units) */
  path: Array<[number, number]> = [];
  speed = 3;
  /** how big the character is drawn (staff are a bit smaller so they fit in tight spots) */
  size = 0.95;
  /** play this animation even when standing (a DJ mixing, a guard idling) */
  stance: AnimId | null = null;
  /** how fast the dances run (the music's BPM over the 100 they were drawn at) */
  tempo = 1;
  floorAt: ((x: number, z: number) => number) | null = null;
  private lift = 0;

  private models: Partial<Record<Sex, GLTF>> = {};
  private prepared: Prepared | null = null;
  private sex: Sex | null = null;
  private action: THREE.AnimationAction | null = null;
  private anim: AnimId | null = null;
  private yaw = 0;
  private look: CharacterConfig | null = null;

  async setLook(cfg: CharacterConfig): Promise<void> {
    this.look = cfg;
    if (this.sex !== cfg.sex || (this.prepared?.combo !== undefined && this.prepared.combo !== comboKey(cfg))) {
      this.models[cfg.sex] ??= await loadModel(cfg.sex);
      if (this.look !== cfg) return; // a newer look arrived while loading
      if (this.prepared) {
        this.group.remove(this.prepared.root);
        this.prepared.release?.();
      }
      this.prepared = instantiateFixed(this.models[cfg.sex]!, cfg);
      this.prepared.root.scale.setScalar(this.size);
      this.group.add(this.prepared.root);
      this.sex = cfg.sex;
      this.anim = null;
      this.action = null;
    }
    if (this.prepared) applyConfig(this.prepared, cfg);
  }

  face(dx: number, dz: number): void {
    this.yaw = Math.atan2(dx, dz);
    this.group.rotation.y = this.yaw;
  }

  get ready(): boolean {
    return this.prepared !== null;
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.path = [];
    this.group.position.set(x, 0, z);
  }

  /** Move along the path. Returns true on the frame the last point is reached. */
  update(dt: number): boolean {
    let arrived = false;
    let left = this.speed * dt;
    while (left > 0 && this.path.length) {
      const [tx, tz] = this.path[0];
      const dx = tx - this.x;
      const dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-6) this.turn(dx, dz, dt);
      if (dist <= left) {
        this.x = tx;
        this.z = tz;
        left -= dist;
        this.path.shift();
        if (!this.path.length) arrived = true;
      } else {
        this.x += (dx / dist) * left;
        this.z += (dz / dist) * left;
        left = 0;
      }
    }
    this.lift += ((this.floorAt ? this.floorAt(this.x, this.z) : 0) - this.lift) * Math.min(1, dt * 14);
    this.group.position.set(this.x, this.lift, this.z);
    this.group.rotation.y = this.yaw;
    this.play(this.path.length ? 'walk' : this.stance ?? 'idle');
    if (this.action && this.anim && isEmote(this.anim)) this.action.timeScale = this.tempo;
    this.prepared?.mixer.update(dt);
    return arrived;
  }

  private turn(dx: number, dz: number, dt: number): void {
    const target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 12);
  }

  private play(id: AnimId): void {
    if (!this.prepared || this.anim === id) return;
    this.anim = id;
    this.action = playClip(this.prepared, id, this.action, 0.2);
    if (this.action) this.action.timeScale = id === 'walk' ? WALK_SPEED_UP : 1;
  }
}
