import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { randomConfig, type AnimId, type Sex } from '../core/character';
import type { Guest, Mode } from '../core/guests';
import type { Genre } from '../core/music';
import { DANCE_BPM, crowdDances } from '../core/emotes';
import { canvasTexture } from './comic';
import { instantiateFixed, loadModel, playClip, type Prepared } from './avatar';
import { LOOP_SECONDS, findBone } from './dances';

const ANIM: Record<Mode, AnimId> = { walk: 'walk', dance: 'dance', drink: 'idle', lounge: 'idle', idle: 'idle' };
const SCALE = 0.85; // guests are a bit smaller than the tile so they fit between furniture
const WALK_SPEED_UP = 1.6; // the walk cycle was authored slower than the guests move

interface Actor {
  prepared: Prepared;
  holder: THREE.Group;
  action: THREE.AnimationAction | null;
  mode: Mode | null;
  /** the clip that is playing (a dancer's dance depends on the music) */
  clip: AnimId | null;
  yaw: number;
  badge: THREE.Sprite | null;
  badgeState: string;
  emote: THREE.Sprite | null;
  emoteKind: string;
  /** the leg bones with their standing orientation, to fold them when the guest sits */
  legs: Array<{ thigh: THREE.Object3D; shin: THREE.Object3D; thighRest: THREE.Quaternion; shinRest: THREE.Quaternion }>;
  seated: boolean;
  lift: number;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const THIGH_FORWARD = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);
const SHIN_DOWN = new THREE.Quaternion().setFromAxisAngle(X_AXIS, Math.PI / 2);

const EMOTES: Record<string, { glyph: string; color: string; bg: string }> = {
  love: { glyph: '♥', color: '#ff3d8b', bg: '#fff0f6' },
  like: { glyph: '♪', color: '#18a8d8', bg: '#eaf9ff' },
  bored: { glyph: 'z z', color: '#6a6f84', bg: '#eceef4' },
  hate: { glyph: '✖', color: '#e0243c', bg: '#fff0f2' },
};
const emoteTextures = new Map<string, THREE.CanvasTexture>();
function emoteTexture(kind: string): THREE.CanvasTexture {
  let t = emoteTextures.get(kind);
  if (!t) {
    const e = EMOTES[kind];
    t = canvasTexture(128, 128, (g) => {
      g.fillStyle = e.bg;
      g.strokeStyle = e.color;
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 60, 48, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(52, 104);
      g.lineTo(64, 124);
      g.lineTo(76, 104);
      g.fillStyle = e.bg;
      g.fill();
      g.fillStyle = e.color;
      g.font = `bold ${kind === 'bored' ? 44 : 64}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(e.glyph, 64, 64);
    });
    emoteTextures.set(kind, t);
  }
  return t;
}

/** Floating mark over a VIP: a star while their story is unchecked, a tick if true, a cross if false. */
function badgeTexture(state: 'claim' | 'real' | 'fake'): THREE.CanvasTexture {
  const color = { claim: '#ffd23f', real: '#35f08a', fake: '#ff3d55' }[state];
  const glyph = { claim: '★', real: '✓', fake: '✕' }[state];
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#1a0f2e';
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = color;
    g.stroke();
    g.fillStyle = color;
    g.font = 'bold 74px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, 64, 70);
  });
}

/** Shows each simulated guest as its own character (own colors, own animation). */
function legsOf(root: THREE.Object3D): Actor['legs'] {
  const legs: Actor['legs'] = [];
  for (const side of ['L', 'R']) {
    // (the loader drops the dot from the bone names: it is thighL, not thigh.L; the old lookup found nothing and nobody ever sat)
    const thigh = findBone(root, side === 'L' ? 'thighL' : 'thighR');
    const shin = findBone(root, side === 'L' ? 'shinL' : 'shinR');
    if (thigh && shin) legs.push({ thigh, shin, thighRest: thigh.quaternion.clone(), shinRest: shin.quaternion.clone() });
  }
  return legs;
}

export class GuestCrowd {
  readonly group = new THREE.Group();
  private models: Partial<Record<Sex, GLTF>> = {};
  private actors = new Map<number, Actor>();
  ready = false;
  /** animate bodies every N frames (a slower computer animates less often) */
  mixerEvery = 1;
  /** guests beyond this many are not drawn */
  maxGuests = 60;
  /** what is playing: the crowd dances the dances of that genre, at its tempo */
  genre: Genre | null = null;
  bpm = DANCE_BPM;
  private frame = 0;
  floorAt: ((x: number, z: number) => number) | null = null;

  async init(): Promise<void> {
    const [male, female] = await Promise.all([loadModel('male'), loadModel('female')]);
    this.models = { male, female };
    this.ready = true;
  }

  /** `show` hides some guests (e.g. everyone inside the club while the player is out in the street) */
  update(dt: number, time: number, guests: readonly Guest[], show?: (g: Guest) => boolean): void {
    if (!this.ready) return;
    this.frame++;
    const alive = new Set<number>();
    // too many for this computer: draw the people inside first, then those leaving, and the line outside last
    const rank = (g: Guest) => (g.queued ? 2 : g.leaving ? 1 : 0);
    const order = guests.length > this.maxGuests ? [...guests].sort((a, b) => rank(a) - rank(b) || a.id - b.id) : guests;
    let shown = 0;
    for (const g of order) {
      // the line at the door (at most 10 people) is always drawn: it is what tells you the club is full
      if (!g.queued) {
        if (shown >= this.maxGuests) continue;
        shown++;
      }
      alive.add(g.id);
      let a = this.actors.get(g.id);
      if (!a) {
        a = this.spawn(g);
        this.actors.set(g.id, a);
      }
      const onSeat = g.sit !== undefined && (g.mode === 'lounge' || g.mode === 'drink');
      const floor = this.floorAt ? this.floorAt(g.x, g.y) : 0;
      a.lift += (floor - a.lift) * Math.min(1, dt * 14);
      a.holder.position.set(g.x, onSeat ? g.sit! : a.lift, g.y);
      this.updateBadge(a, g);
      this.updateEmote(a, g, time);
      a.holder.visible = !show || show(g);

      const target = Math.atan2(g.dirX, g.dirY);
      let diff = target - a.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.yaw += diff * Math.min(1, dt * 10);
      a.holder.rotation.y = a.yaw;

      // sitting: the legs fold (thighs forward, shins down) and the animation stops; standing up resumes it
      const seated = g.sit !== undefined && (g.mode === 'lounge' || g.mode === 'drink');
      if (seated !== a.seated) {
        a.seated = seated;
        if (seated) a.action?.stop();
        else {
          for (const l of a.legs) {
            l.thigh.quaternion.copy(l.thighRest);
            l.shin.quaternion.copy(l.shinRest);
          }
          a.mode = null; // play the right clip again
        }
      }
      if (seated) {
        for (const l of a.legs) {
          l.thigh.quaternion.copy(l.thighRest).premultiply(THIGH_FORWARD);
          l.shin.quaternion.copy(l.shinRest).premultiply(SHIN_DOWN);
        }
      } else {
        // each dancer has a dance of the music that is playing (one per guest, by id), and they all keep the club's beat
        const want: AnimId = g.mode === 'dance' ? crowdDances(this.genre)[g.id % crowdDances(this.genre).length] : ANIM[g.mode];
        if (a.mode !== g.mode || a.clip !== want) {
          a.mode = g.mode;
          a.clip = want;
          a.action = playClip(a.prepared, want, a.action, 0.2);
          if (a.action) {
            a.action.timeScale = g.mode === 'walk' ? WALK_SPEED_UP : g.mode === 'dance' ? this.bpm / DANCE_BPM : 1;
            if (g.mode === 'dance') a.action.time = ((time * this.bpm) / DANCE_BPM) % LOOP_SECONDS;
          }
        } else if (g.mode === 'dance' && a.action) a.action.timeScale = this.bpm / DANCE_BPM;
      }
      if (!a.seated && this.frame % this.mixerEvery === 0) a.prepared.mixer.update(dt * this.mixerEvery);
    }
    for (const [id, a] of this.actors) {
      if (alive.has(id)) continue;
      this.group.remove(a.holder);
      a.prepared.mats.forEach((m) => m.dispose());
      a.prepared.release?.();
      this.actors.delete(id);
    }
  }

  clear(): void {
    for (const a of this.actors.values()) {
      this.group.remove(a.holder);
      a.prepared.release?.();
    }
    this.actors.clear();
  }

  private spawn(g: Guest): Actor {
    const sex: Sex = g.id % 2 === 0 ? 'female' : 'male';
    const prepared = instantiateFixed(this.models[sex]!, randomConfig(sex));
    const holder = new THREE.Group();
    prepared.root.scale.setScalar(SCALE);
    holder.add(prepared.root);
    this.group.add(holder);
    return { prepared, holder, action: null, mode: null, clip: null, yaw: Math.atan2(g.dirX, g.dirY), badge: null, badgeState: '', emote: null, emoteKind: '', legs: legsOf(prepared.root), seated: false, lift: this.floorAt ? this.floorAt(g.x, g.y) : 0 };
  }

  /** The bubble over a guest's head when they love, like, dislike or are bored by the music. */
  private updateEmote(a: Actor, g: Guest, time: number): void {
    const kind = g.emote?.kind ?? '';
    if (kind !== a.emoteKind) {
      a.emoteKind = kind;
      if (a.emote) {
        a.holder.remove(a.emote);
        a.emote.material.dispose();
        a.emote = null;
      }
      if (kind) {
        a.emote = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoteTexture(kind), depthTest: false, transparent: true }));
        a.emote.scale.set(0.8, 0.8, 1);
        a.emote.renderOrder = 21;
        a.holder.add(a.emote);
      }
    }
    if (a.emote) a.emote.position.y = (a.badge ? 3.5 : 2.75) + 0.08 * Math.sin(time * 6 + g.id);
  }

  private updateBadge(a: Actor, g: Guest): void {
    const state = !g.vip ? '' : !g.vip.checked ? 'claim' : g.vip.real ? 'real' : 'fake';
    if (state === a.badgeState) return;
    a.badgeState = state;
    if (a.badge) {
      a.holder.remove(a.badge);
      a.badge.material.map?.dispose();
      a.badge.material.dispose();
      a.badge = null;
    }
    if (!state) return;
    const mat = new THREE.SpriteMaterial({ map: badgeTexture(state as 'claim' | 'real' | 'fake'), depthTest: false, transparent: true });
    a.badge = new THREE.Sprite(mat);
    a.badge.scale.set(0.9, 0.9, 1);
    a.badge.position.y = 2.6;
    a.badge.renderOrder = 20;
    a.holder.add(a.badge);
  }
}
