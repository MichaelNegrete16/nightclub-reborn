import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOOTH_IDS, BY_ID, type ItemDef } from '../core/catalog';
import {
  PARCEL, PHASES, YARD, blockedSet, buyItem, doorCells, setOpen as setClubOpen, footprint, levelNow, newClub, owned, phaseOf, placeItem, removeItem, sellFromInventory,
  sellValue, setPhase, stashItem, validatePlacement, type ClubState, type PlaceMode, type PlacedItem, type Rot,
} from '../core/club';
import { applyEvents } from '../core/game';
import { GuestSim, VIP_CHECK_COST, type GuestEvent, type Vip } from '../core/guests';
import { checkMissions, type Mission } from '../core/story';
import { DANCE_BPM, EMOTE_BY_ID } from '../core/emotes';
import { MAX_REVIEWS, type Review } from '../core/reviews';
import { PRISON_AT, PrisonWorld, WORK_SECONDS, type Station } from './prison';
import { NPC_LOOKS } from '../core/npcs';
import type { EmoteId } from '../core/character';
import { GuestCrowd } from './guests';
import { PlayerActor } from './player';
import type { Settings } from './quality';
import { MusicEngine } from '../audio/engine';
import { deleteFile } from '../audio/files';
import { type Track, GENRE_BY_ID, GENRES, addCloudTrack, addLocalTrack, addTrack, nextTrackId, removeTrack, selectTrack, setPlaying, setVolume, trackById, type Genre } from '../core/music';
import { SoundFx } from './soundfx';
import { RemotePlayers, makeNameTag } from './remote';
import { NeighborCrowd } from './neighborcrowd';
import { Bubbles } from './bubbles';
import { buildShell, type Shell } from './roomstyle';
import { buildInterior } from './interior';
import type { VisitView } from '../net/client';
import { buyRenovation, upkeepPerMinute } from '../core/renovation';
import { buyExpansion } from '../core/expansion';
import { buyDecor, chooseDecor } from '../core/decor';
import { applyMail } from '../core/mail';
import { buyKit } from '../core/kits';
import type { Kit } from '../core/heist';
import { soundSystem, tierOfItem, upgradeItem } from '../core/club';
import { TIER_NAMES } from '../core/tiers';
import { settle, stamp } from '../core/offline';
import { wagePerMinute } from '../core/staff';
import { buildFacade, buildLane } from './facade';
import { buildYard } from './yard';
import { buyUpgrade, choosePaint } from '../core/exterior';
import { gridPath, routeAround, type Pt } from '../core/walk';
import { randomConfig, type CharacterConfig } from '../core/character';
import { fireStaff, hireStaff, staffSpots, type Role } from '../core/staff';
import { RADIUS_CELLS, buildingOrigin, lotOrigin, simulatedNeighbors, type Neighbor } from '../core/world';
import { buildCity, type City } from './city';
import { Environment } from './environment';
import { neon } from './comic';
import { buildProp, type PropTick } from './props';
import { toon } from './toon';

const ORIGIN = { x: YARD, z: YARD }; // the building sits this many tiles inside the parcel
/** where the player may walk in the street: the lot and the roads around it */
const STREET_BOX = {
  x0: lotOrigin({ i: -RADIUS_CELLS, j: -RADIUS_CELLS }).x,
  z0: lotOrigin({ i: -RADIUS_CELLS, j: -RADIUS_CELLS }).z,
  x1: lotOrigin({ i: RADIUS_CELLS, j: RADIUS_CELLS }).x + PARCEL.w,
  z1: lotOrigin({ i: RADIUS_CELLS, j: RADIUS_CELLS }).z + PARCEL.h,
};

export type ViewMode = 'inside' | 'outside';

export type Tool =
  | { kind: 'select' }
  | { kind: 'place'; defId: string; rot: Rot; mode: PlaceMode; moveFrom?: PlacedItem; fromLoot?: string };

/** What the game UI wants to hear about. The view never touches the UI directly. */
export interface ClubHooks {
  /** layout, tool or selection changed */
  onChange(): void;
  /** coins, XP or stats changed because of the guests */
  onEarn(): void;
  onMissions(done: Mission[]): void;
  onLevelUp(level: number): void;
  onPhaseUp(phase: number): void;
  /** a short message for the player (errors, confirmations) */
  onToast(message: string, kind?: 'ok' | 'bad'): void;
  /** a real star walked in: show their portrait */
  onStar?(celeb: string, name: string): void;
  /** the VIP at the door changed (arrived, was checked, left): `null` when nobody is waiting */
  onVip(vip: { id: number; vip: Vip } | null): void;
  /** the Brigada took the player to prison: play the arrest scene */
  onJail(letter: import('../core/mail').Mail): void;
  /** the player went out to the street or came back in */
  onMode(mode: ViewMode): void;
}

const GHOST_OK = new THREE.MeshBasicMaterial({ color: 0x35f08a, transparent: true, opacity: 0.55, depthWrite: false });
const GHOST_BAD = new THREE.MeshBasicMaterial({ color: 0xff3d55, transparent: true, opacity: 0.55, depthWrite: false });
GHOST_OK.userData.outlineParameters = { visible: false };
GHOST_BAD.userData.outlineParameters = { visible: false };

/** The club: parcel, building, placed items, ghost preview, picking and editing. */
export class ClubView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 1400);
  private baseDist = 50;
  private zoomGoal: number | null = null;
  private zoomedForPlacing = false;
  readonly env: Environment;
  private city: City;
  private neonLights: THREE.PointLight[] = [];
  /** how bright the coloured lights over the floor are (the lighting the player bought) */
  private lightMul = 0.22;
  private shell: Shell | null = null;
  private decorKey = '';
  private plotLines = new THREE.Group();
  readonly controls: OrbitControls;

  state: ClubState = newClub();
  tool: Tool = { kind: 'select' };
  selectedUid: string | null = null;
  message = '';
  enabled = false;

  private room = new THREE.Group();
  private interior = new THREE.Group();
  private facade = new THREE.Group();
  private lane = new THREE.Group();
  readonly player = new PlayerActor();
  mode: ViewMode = 'inside';
  /** what to do when the player reaches the end of the current walk */
  private arrival: 'enter' | 'exit' | null = null;
  private items = new THREE.Group();
  private grid!: THREE.LineSegments;
  private signOpen: THREE.Object3D | null = null;
  private signClosed: THREE.Object3D | null = null;
  /** yellow police tape across the door while the Brigada has the club shut */
  private tape: THREE.Group | null = null;
  private wallN = new THREE.Group();
  private wallW = new THREE.Group();
  private highlight: THREE.Mesh;
  private ghost: THREE.Group | null = null;
  private ghostKey = '';
  private hover: { x: number; y: number } | null = null;
  private undoStack: Array<{ prev: ClubState; refund: number }> = [];
  private moveSnapshot: ClubState | null = null;
  private yawRemaining = 0;
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private down: { x: number; y: number; t: number } | null = null;
  private pulse: THREE.MeshToonMaterial[] = [];
  private spinners: THREE.Object3D[] = [];
  /** props that animate themselves (dancers, lasers, smoke, speaker cones) */
  private ticks: PropTick[] = [];
  private builtPhase = 0;

  readonly sim = new GuestSim((Math.random() * 1e9) | 0);
  readonly crowd = new GuestCrowd();
  /** other players walking in the street */
  readonly remote = new RemotePlayers();
  /** the lines of people outside the other players' open clubs */
  readonly ambient = new NeighborCrowd();
  /** speech balloons over characters */
  readonly bubbles = new Bubbles();
  /** everything about sound: the current track, the beat, the volume */
  readonly music: MusicEngine;
  private fx = new SoundFx();
  showGuests = true;
  /** the night does not run during the title, the character creator or a story scene */
  paused = false;
  private pending: GuestEvent[] = [];
  private earnTimer = 0;
  private incomeLog: Array<[number, number]> = [];
  private popups: HTMLElement | null = null;

  constructor(private canvas: HTMLCanvasElement, private hooks: ClubHooks) {
    const s = this.scene;
    const hemi = new THREE.HemisphereLight(0x9aa8ff, 0x2a1a4a, 1.5);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(10, 22, 14);
    s.add(hemi, key, key.target);
    const cyan = new THREE.PointLight(0x18d8ff, 40, 22);
    cyan.position.set(2, 3.5, 3);
    const pink = new THREE.PointLight(0xff2d9a, 40, 22);
    pink.position.set(6, 3.5, 6);
    this.neonLights = [cyan, pink];
    s.add(cyan, pink);
    this.city = buildCity(simulatedNeighbors(7));
    this.sim.upkeepOn = true; // the real game pays rent, power and wages
    this.music = new MusicEngine(canvas.parentElement ?? document.body);
    this.music.onEnded = () => this.skip(1);
    this.music.onError = (m) => {
      this.hooks.onToast(m, 'bad');
      this.hooks.onEarn();
      // a song that cannot play must not leave the club in silence: on to the next one
      const failedId = this.music.track?.id;
      window.setTimeout(() => {
        if (failedId && this.music.track?.id === failedId && this.music.failed.has(failedId)) this.skip(1);
      }, 3500);
    };
    s.add(this.fx.group, this.remote.group, this.ambient.group);
    s.add(this.city.group, this.room, this.facade, this.items, this.crowd.group, this.player.group, this.staffGroup, this.lane);
    // sky, sun/moon, fog and light follow the hour and the weather; the city and the club's neon follow the night
    this.env = new Environment(s, { hemi, sun: key });
    this.env.onNight = (night) => {
      this.lastNight = night;
      this.city.setNight(night);
      this.neonLights.forEach((l) => (l.intensity = 40 * (0.2 + 0.8 * night) * this.lightMul));
    };
    this.env.onWet = (wet) => {
      this.lastWet = wet;
      this.city.setWet(wet);
    };
    canvas.addEventListener('wheel', () => (this.zoomGoal = null), { passive: true });
    this.popups = document.createElement('div');
    this.popups.className = 'popups';
    canvas.parentElement?.append(this.popups);

    const highlightMat = new THREE.MeshBasicMaterial({ color: 0x18d8ff, transparent: true, opacity: 0.35, depthWrite: false });
    highlightMat.userData.outlineParameters = { visible: false };
    this.highlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), highlightMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.06;
    this.highlight.visible = false;
    s.add(this.highlight);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;
    this.controls.enableDamping = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.enabled = false;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointerleave', () => this.setHover(null));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.rebuildRoom();
    this.rebuildItems();
    this.resetView();
  }

  // ---- lifecycle -----------------------------------------------------------------------------
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.controls.enabled = on;
    if (!on) this.setHover(null);
  }

  setState(s: ClubState): void {
    const phaseChanged = s.phase !== this.builtPhase;
    if (phaseChanged && this.builtPhase > 0 && s.phase > this.builtPhase) this.buildT = 0; // an expansion: the works begin
    this.state = s;
    this.sim.setLayout(s);
    if (this.sim.enabled !== s.open) this.sim.setOpen(s.open);
    if (phaseChanged) this.rebuildRoom();
    else if (this.facadeKey !== this.facadeSig()) this.rebuildFacade();
    if (!phaseChanged && this.decorKey !== this.decorSig()) this.rebuildRoom(); // new finishes inside
    this.keepPlayerFree(phaseChanged);
    this.rebuildItems();
    this.refreshGhost();
    this.refreshHighlight();
    this.updateSign();
    if (phaseChanged) this.resetView();
  }

  resetView(): void {
    const p = phaseOf(this.state);
    const target = new THREE.Vector3(p.w / 2, 0, p.h / 2);
    // a tall (phone) window sees much less sideways, so pull the camera back to keep the whole building in view
    const dist = ((p.w + p.h) * 1.15 + 32) * Math.max(1, 1.1 / this.camera.aspect);
    this.baseDist = dist;
    // zoom stays around the club and its street: no flying off into the empty distance
    this.controls.minDistance = dist * 0.25;
    this.controls.maxDistance = dist * 1.3;
    this.zoomGoal = null;
    this.zoomedForPlacing = false;
    const yaw = Math.PI / 4;
    const elev = (32 * Math.PI) / 180;
    this.controls.target.copy(target);
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(elev) * dist,
      Math.sin(elev) * dist,
      target.z + Math.cos(yaw) * Math.cos(elev) * dist,
    );
    this.yawRemaining = 0;
    this.controls.update();
  }

  rotateView(dir: 1 | -1): void {
    this.yawRemaining += (dir * Math.PI) / 2;
  }

  update(dt: number, time: number): void {
    if (this.tape) this.tape.visible = this.crime.closedUntil > Date.now();
    if (Math.abs(this.yawRemaining) > 1e-4) {
      const step = Math.sign(this.yawRemaining) * Math.min(Math.abs(this.yawRemaining), dt * 6);
      const off = this.camera.position.clone().sub(this.controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      this.camera.position.copy(this.controls.target).add(off);
      this.yawRemaining -= step;
    }
    if (this.zoomGoal !== null) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const d = off.length();
      const next = d + (this.zoomGoal - d) * Math.min(1, dt * 5);
      this.camera.position.copy(this.controls.target).add(off.setLength(next));
      if (Math.abs(next - this.zoomGoal) < 0.2) this.zoomGoal = null;
    }
    this.growBuilding(dt);
    this.updatePlayer(dt);
    this.updatePrison(dt);
    // dances: walking ends them, a gesture ends by itself, and everybody dances at the speed of the music
    if (this.emote && (this.player.moving || (this.emoteUntil && performance.now() > this.emoteUntil))) this.setEmote(null);
    const tempo = this.music.bpm / DANCE_BPM;
    this.player.tempo = tempo;
    this.remote.tempo = tempo;
    this.crowd.bpm = this.visitCrowd ? DANCE_BPM : this.music.bpm;
    this.crowd.genre = this.music.genre;
    if (this.visitCrowd) {
      this.visitCrowd.bpm = this.music.bpm;
      this.visitCrowd.genre = this.music.genre;
    }
    this.ownTag();
    this.remote.update(dt);
    this.bubbles.update();
    if (this.visitSim && this.visitCrowd && !this.paused) {
      this.visitSim.update(dt);
      this.visitCrowd.update(dt, time, [...this.visitSim.guests, ...this.visitSim.queue]);
    }
    // walked away from the club being visited (out of its door and down the street): the visit is over, and so is its music
    if (this.visiting && this.visitSpace) {
      const v = this.visitSpace;
      const lx = this.player.x - v.ox;
      const lz = this.player.z - v.oz;
      const outside = lx < -1 || lx > v.w + 1 || lz < -1 || lz > v.h + 0.5;
      if (outside && Math.hypot(lx - v.doorX, lz - v.h) > 8) this.leaveVisit();
    }
    this.ambient.update(Math.min(dt, 0.1));
    if (!this.paused) this.stampNow(dt);
    for (const a of this.staffActors) a.actor.update(dt);
    this.applyStaffVisibility();
    this.controls.update();
    const ph = phaseOf(this.state);
    if (!this.visiting && !this.prison) this.keepNearClub(ph.w, ph.h);
    this.env.update(dt, time, this.camera, this.controls.target);
    this.wallN.scale.y = this.camera.position.z < ph.h / 2 ? 0.12 : 1;
    this.wallW.scale.y = this.camera.position.x < ph.w / 2 ? 0.12 : 1;
    const sounding = !!this.music.track;
    const beat = sounding ? this.music.beats() : 0;
    const pulse = sounding ? Math.exp(-(beat % 1) * 4.5) : 0;
    this.music.sync(this.state.music);
    this.music.setSystem(soundSystem(this.state));
    this.hearNeighbors();
    // visiting: you hear THEIR song at full volume; if theirs cannot be shared, your own is silenced and a stand-in plays instead
    if (this.visiting) this.music.setListening(this.music.hasOverride, 1);
    else this.music.setListening(this.mode === 'inside', this.musicReach());
    this.sim.setMusic(this.music.genre);
    this.fx.update(dt, sounding ? { beat, pulse, color: GENRE_BY_ID.get(this.music.genre as Genre)?.color ?? '#ffffff', bands: this.music.bands(6) } : null);
    this.pulse.forEach((m, i) => {
      const wave = 0.5 + 0.5 * Math.sin(beat * Math.PI - i * 0.7);
      m.emissiveIntensity = sounding ? 0.3 + 0.5 * wave + 0.4 * pulse : 0.25;
    });
    for (const o of this.spinners) o.rotation.y += dt * (o.userData.spin as number);
    // without music the props keep moving on a steady 120 bpm clock
    const clock = sounding ? beat : time * 2;
    for (const tick of this.ticks) tick(time, clock, pulse, dt);
    const sh = this.shell;
    if (sh) {
      // the finishes that move: RGB neon cycles through the rainbow, the glass floor pulses, laser light shifts colour
      sh.rgb.forEach((m, i) => {
        m.color.setHSL((time * 0.12 + i * 0.4) % 1, 1, 0.55);
        m.emissive.copy(m.color);
      });
      if (sh.led) sh.led.color.setScalar(0.62 + 0.38 * (sounding ? pulse : 0.4));
      if (sh.lights.shift) {
        this.neonLights[0]?.color.setHSL((time * 0.1) % 1, 1, 0.55);
        this.neonLights[1]?.color.setHSL((time * 0.1 + 0.5) % 1, 1, 0.55);
      }
    }

    this.crowd.group.visible = this.showGuests;
    if (this.showGuests && !this.paused) {
      this.sim.update(dt);
      this.collect(time);
      this.earnTimer += dt;
      if (this.earnTimer >= 0.5) this.flushEarnings();
      const outside = this.mode === 'outside';
      const doorY = phaseOf(this.state).h;
      this.crowd.update(dt, time, [...this.sim.guests, ...this.sim.queue], outside ? (g) => g.y > doorY - 0.4 : undefined);
      this.watchDoor();
    }
  }

  /** Fast-forward the night without rendering (offline income, tests). */
  simulate(seconds: number): void {
    for (let t = 0; t < seconds; t += 0.1) {
      this.sim.update(0.1);
      this.collect(performance.now() / 1000);
    }
    this.flushEarnings();
  }

  get guestCount(): number {
    return this.sim.inside;
  }

  get queueCount(): number {
    return this.sim.queue.length;
  }

  get roomCapacity(): number {
    return this.sim.roomCapacity;
  }

  private vipSeen = '';

  /** Tell the UI when the VIP at the door changes, and say why people walked away. */
  private watchDoor(): void {
    const g = this.sim.waitingVip;
    const sig = g ? `${g.id}:${g.vip!.checked}` : '';
    if (sig !== this.vipSeen) {
      if (g && this.vipSeen.split(':')[0] !== String(g.id)) this.light({ ...this.state, stats: { ...this.state.stats, vipAt: Date.now() } }); // a new star: remember when
      this.vipSeen = sig;
      this.hooks.onVip(g ? { id: g.id, vip: g.vip! } : null);
    }
    const fresh: Review[] = [];
    for (const n of this.sim.notes) {
      if (n.kind === 'vip-left') this.hooks.onToast(`${n.name} se cansó de esperar y se fue.`, 'bad');
      else if (n.kind === 'review') fresh.push({ id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), stars: n.stars, text: n.text, tags: n.tags, who: n.who });
    }
    // what the guests say on leaving goes to the office (only while the club earns: a disconnected game writes nothing)
    if (fresh.length && this.earning) this.light({ ...this.state, reviews: [...fresh.reverse(), ...this.state.reviews].slice(0, MAX_REVIEWS) });
  }

  /** Pay to find out if the VIP at the door is who they claim to be. */
  checkVip(): string | undefined {
    const g = this.sim.waitingVip;
    if (!g || g.vip!.checked) return undefined;
    if (this.state.coins < VIP_CHECK_COST) {
      this.say('No te alcanza para investigarlo.');
      return 'coins';
    }
    this.commit({ ...this.state, coins: this.state.coins - VIP_CHECK_COST }, false);
    this.sim.checkVip(g.id);
    this.vipSeen = '';
    return undefined;
  }

  admitVip(): void {
    const g = this.sim.waitingVip;
    if (g) this.sim.admitVip(g.id);
  }

  rejectVip(): void {
    const g = this.sim.waitingVip;
    if (g) this.sim.rejectVip(g.id);
  }

  /** Income over the last minute, scaled to a per-minute figure. */
  incomePerMin(now: number): number {
    this.incomeLog = this.incomeLog.filter(([t]) => now - t <= 60);
    return Math.round(this.incomeLog.reduce((a, [, v]) => a + v, 0));
  }

  /** Open or close the club's doors. Returns the reason if it cannot be done. */
  setOpen(open: boolean): string | undefined {
    if (open && this.crime.closedUntil > Date.now()) {
      const mins = Math.ceil((this.crime.closedUntil - Date.now()) / 60000);
      const msg = this.crime.detainedUntil > Date.now() ? `Estás en prisión: haz las tareas (${this.crime.chores}/${this.crime.choreGoal || 20}) para salir y reabrir el club.` : `La Brigada del Ruido clausuró el club: reabre en ${mins} min.`;
      this.say(msg);
      return msg;
    }
    const r = setClubOpen(this.state, open);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    if (open && !this.state.music.playing) this.light(setPlaying(this.state, true)); // a club needs music
    this.hooks.onToast(open ? '¡Club abierto! Ya pueden entrar.' : 'Club cerrado. Los invitados se van.', 'ok');
    return undefined;
  }

  /** 0..1: how close the player's character is to the club (1 at the walls, 0 beyond ~16 tiles). */
  private musicReach(): number {
    if (this.mode === 'inside') return 1;
    const p = phaseOf(this.state);
    const dx = Math.max(-this.player.x, 0, this.player.x - p.w);
    const dz = Math.max(-this.player.z, 0, this.player.z - p.h);
    const d = Math.hypot(dx, dz);
    return Math.max(0, 1 - d / 16) ** 1.5;
  }

  // ---- music commands (the UI calls these) ---------------------------------------------------
  /** A change that does not touch the layout: no rebuild, just save and refresh the HUD. */
  private light(next: ClubState): void {
    this.apply(this.state, next, false); // also checks the missions: songs and the like count
  }

  playTrack(id: string): void {
    this.music.unlock();
    this.light(selectTrack(this.state, id));
  }

  togglePlay(): void {
    this.music.unlock();
    this.light(setPlaying(this.state, !this.state.music.playing));
  }

  skip(step: 1 | -1): void {
    this.music.unlock();
    this.light(selectTrack(this.state, nextTrackId(this.state.music, step)));
  }

  setMusicVolume(v: number): void {
    this.light(setVolume(this.state, v));
  }

  addSong(link: string, title: string, genre: Genre, bpm: number): string | undefined {
    const r = addTrack(this.state, link, title, genre, bpm);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    // a song you just added should play right away: the click that added it is the permission the browser needs
    this.music.unlock();
    this.light(r.id ? selectTrack(r.state, r.id) : r.state);
    return undefined;
  }

  /** Add a song whose file was just saved in this browser; it starts playing. */
  addLocalSong(id: string, title: string, genre: Genre, bpm: number): string | undefined {
    const r = addLocalTrack(this.state, id, title, genre, bpm);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.music.unlock();
    this.light(selectTrack(r.state, id));
    return undefined;
  }

  /** Add a song that was uploaded to the city server; it starts playing. */
  addCloudSong(id: string, title: string, genre: Genre, bpm: number): string | undefined {
    const r = addCloudTrack(this.state, id, title, genre, bpm);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.music.unlock();
    this.light(selectTrack(r.state, `c${id}`));
    return undefined;
  }

  removeSong(id: string): void {
    void deleteFile(id);
    const t = this.state.music.tracks.find((x) => x.id === id);
    if (t?.source === 'cloud') this.onCloudRemove(t.ref);
    this.light(removeTrack(this.state, id));
  }

  /** Called once when the game starts: pay what the open club earned while the player was away. */
  settleOffline(): void {
    const r = settle(this.state, Date.now());
    if (!r) return;
    this.light(r.state);
    const h = Math.floor(r.minutes / 60);
    const m = r.minutes % 60;
    this.hooks.onToast(`Mientras no estabas (${h ? `${h} h ` : ''}${m} min) tu club ganó ${r.earned.toLocaleString('es-CO')} monedas.`, 'ok');
  }

  private stampTimer = 0;

  /** Remember how the club is earning (net of wages and running costs), every few seconds. */
  private stampNow(dt: number): void {
    this.stampTimer += dt;
    if (this.stampTimer < 10) return;
    this.stampTimer = 0;
    const net = this.incomePerMin(performance.now() / 1000) - wagePerMinute(this.state) - upkeepPerMinute(this.state);
    this.state = stamp(this.state, net, Date.now());
    // the best rating ever reached, for missions
    if (this.rating > this.state.stats.bestRating) this.light({ ...this.state, stats: { ...this.state.stats, bestRating: this.rating } });
  }

  /** Buy a finish for the inside (or switch to one already owned). */
  buyDecor(id: string): string | undefined {
    const owned = this.state.decor.owned.includes(id);
    const r = owned ? chooseDecor(this.state, id) : buyDecor(this.state, id);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    return undefined;
  }

  /** Pay for the works that grow the club into the next building. */
  expandClub(): string | undefined {
    const r = buyExpansion(this.state);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.hooks.onToast('¡Empiezan las obras! Tu club se está ampliando…', 'ok');
    this.commit(r.state, false);
    return undefined;
  }

  /** 0 → 1 while the new building rises after an expansion (1 = finished). */
  private buildT = 1;

  /** The works: walls, furniture and facade grow up from the ground over a couple of seconds. */
  private growBuilding(dt: number): void {
    if (this.buildT >= 1) return;
    this.buildT = Math.min(1, this.buildT + dt / 2.8);
    const t = this.buildT;
    const e = 1 - (1 - t) ** 3; // fast at first, then settles
    const y = Math.max(0.04, e + (t > 0.7 ? Math.sin((t - 0.7) * Math.PI * 3.3) * 0.03 : 0)); // a little bounce at the end
    this.interior.scale.y = y;
    this.items.scale.y = y;
    this.facade.scale.y = y;
    if (this.buildT >= 1) {
      this.interior.scale.y = this.items.scale.y = this.facade.scale.y = 1;
      this.hooks.onToast(`¡Obra terminada! Ahora tienes un ${phaseOf(this.state).name}.`, 'ok');
    }
  }

  /** Pay for the next renovation tier. */
  renovate(): string | undefined {
    const r = buyRenovation(this.state);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    this.hooks.onToast('¡Reforma terminada! Tu club se ve (y rinde) mejor.', 'ok');
    return undefined;
  }

  /** The club's score, 0-100. */
  get rating(): number {
    return Math.round(this.sim.rating);
  }

  /** Title of what is playing, or null. */
  get nowPlaying(): string | null {
    const t = this.music.track;
    return t ? trackById(this.state.music, t.id)?.title ?? t.title ?? null : null;
  }

  /** What the people inside like: share per genre. */
  crowdTastes(): Array<{ genre: Genre; share: number }> {
    const inside = this.sim.guests.filter((g) => !g.leaving && g.y < phaseOf(this.state).h);
    return GENRES.map((g) => ({ genre: g.id, share: inside.length ? inside.filter((x) => x.taste === g.id).length / inside.length : 0 }));
  }

  /** Neon sign over the door: green ABIERTO or red CERRADO. */
  private updateSign(): void {
    if (this.signOpen) this.signOpen.visible = this.state.open;
    if (this.signClosed) this.signClosed.visible = !this.state.open;
  }

  /** Panning can't carry the view away from the club. */
  private keepNearClub(w: number, h: number): void {
    const t = this.controls.target;
    // in the street the view may roam over the whole block; inside it stays near the club
    const out = this.mode === 'outside';
    const x = out ? Math.min(Math.max(t.x, STREET_BOX.x0), STREET_BOX.x1) : Math.min(Math.max(t.x, -5), w + 5);
    const z = out ? Math.min(Math.max(t.z, STREET_BOX.z0), STREET_BOX.z1) : Math.min(Math.max(t.z, -5), h + 5);
    if (x !== t.x || z !== t.z) {
      const dx = x - t.x;
      const dz = z - t.z;
      t.x = x;
      t.z = z;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
  }

  toggleGuests(): void {
    this.showGuests = !this.showGuests;
    if (!this.showGuests) this.crowd.clear();
    this.onChange();
  }

  private collect(now: number): void {
    for (const e of this.sim.events) {
      this.pending.push(e);
      if (e.amount > 0) this.incomeLog.push([now, e.amount]);
      if (e.kind === 'drink' || e.kind === 'show') this.popup(e.x, e.y, e.amount);
      if (e.kind === 'vip') {
        const v = this.sim.guests.find((g) => g.vip && !g.leaving)?.vip;
        this.hooks.onToast(`¡Era ${v?.name ?? 'la estrella'} de verdad! +${e.amount} monedas y más gente en camino.`, 'ok');
        if (v) this.hooks.onStar?.(v.celeb, v.name);
      }
      if (e.kind === 'fraud') this.hooks.onToast(`Era un farsante: se colaron y te costó ${-e.amount} monedas.`, 'bad');
    }
  }

  private flushEarnings(): void {
    this.earnTimer = 0;
    if (!this.earning) this.pending = []; // not connected to the city server: the club does not earn (or pay) anything
    if (!this.pending.length) return this.hooks.onEarn(); // the door count in the HUD moves even when no coins do
    const before = this.state;
    const next = applyEvents(before, this.pending);
    this.pending = [];
    this.apply(before, next, false);
  }

  /** Make `next` the current state: pay finished missions and tell the UI about it, level-ups and new phases. */
  private apply(before: ClubState, next: ClubState, layoutChanged: boolean): void {
    const done = checkMissions(next);
    const after = done.state;
    if (layoutChanged || after.phase !== before.phase) this.setState(after);
    else this.state = after;
    if (layoutChanged) this.hooks.onChange();
    else this.hooks.onEarn();
    if (done.completed.length) this.hooks.onMissions(done.completed);
    const l0 = levelNow(before);
    const l1 = levelNow(after);
    if (l1 > l0) this.hooks.onLevelUp(l1);
    if (after.phase > before.phase) this.hooks.onPhaseUp(after.phase);
  }

  private popup(x: number, y: number, amount: number): void {
    if (!this.popups || !this.enabled) return;
    const v = new THREE.Vector3(x, 1.5, y).project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = `+${amount}`;
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v.y) / 2) * 100}%`;
    this.popups.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  // ---- commands (called by the UI / keyboard) ------------------------------------------------
  /** Start placing an object: from the inventory ('inventory') or buying it on the spot ('buy'). */
  pickTool(defId: string, mode: PlaceMode = 'buy'): void {
    this.goInsideNow(); // objects are placed from inside the club
    this.cancelTool(false);
    this.selectedUid = null;
    this.tool = { kind: 'place', defId, rot: 0, mode };
    this.message = '';
    this.afterToolChange();
  }

  cancelTool(notify = true): void {
    if (this.tool.kind === 'place' && this.tool.moveFrom && this.moveSnapshot) {
      this.state = this.moveSnapshot; // moving was cancelled: put the item back where it was
      this.moveSnapshot = null;
      this.rebuildItems();
    }
    this.tool = { kind: 'select' };
    this.moveSnapshot = null;
    if (notify) this.afterToolChange();
  }

  rotate(): void {
    if (this.tool.kind === 'place') {
      this.tool = { ...this.tool, rot: ((this.tool.rot + 1) % 4) as Rot };
      this.refreshGhost();
      this.onChange();
      return;
    }
    const it = this.selected();
    if (!it) return;
    const def = BY_ID.get(it.id)!;
    const rot = ((it.rot + 1) % 4) as Rot;
    const check = validatePlacement(this.state, def, it.x, it.y, rot, it.uid);
    if (!check.ok) return this.say(check.reason ?? 'No se puede rotar aquí');
    this.commit({ ...this.state, items: this.state.items.map((i) => (i.uid === it.uid ? { ...i, rot } : i)) });
  }

  startMove(): void {
    const it = this.selected();
    if (!it) return;
    this.moveSnapshot = this.state;
    this.state = removeItem(this.state, it.uid, false).state;
    this.tool = { kind: 'place', defId: it.id, rot: it.rot, mode: 'free', moveFrom: it };
    this.selectedUid = null;
    this.rebuildItems();
    this.afterToolChange();
  }

  sellSelected(): void {
    const it = this.selected();
    if (!it) return;
    const def = BY_ID.get(it.id)!;
    this.commit(removeItem(this.state, it.uid).state);
    this.selectedUid = null;
    this.say(`Vendido por ${sellValue(def, tierOfItem(it))} monedas`);
    this.refreshHighlight();
  }

  /** Pay to improve the selected piece to its next version. */
  upgradeSelected(): void {
    const it = this.selected();
    if (!it) return;
    const r = upgradeItem(this.state, it.uid);
    if (r.error) return this.say(r.error);
    this.commit(r.state, false);
    const now = r.state.items.find((i) => i.uid === it.uid)!;
    this.hooks.onToast(`¡${BY_ID.get(it.id)!.name} mejorado a ${TIER_NAMES[tierOfItem(now) - 1]}!`, 'ok');
  }

  /** Take the selected object out of the room and keep it in the inventory. */
  stashSelected(): void {
    const it = this.selected();
    if (!it) return;
    const r = stashItem(this.state, it.uid);
    if (r.error) return this.say(r.error);
    const toBag = r.state.loot.length > this.state.loot.length;
    this.commit(r.state);
    this.selectedUid = null;
    this.say(toBag ? `${BY_ID.get(it.id)!.name} (robado) vuelve a tu bolsa` : `${BY_ID.get(it.id)!.name} guardado en el inventario`);
    this.refreshHighlight();
  }

  /** The server cleaned a stolen piece (in the bag or on display) and charged for it: make the local copy say the same. */
  applyLaunder(uid: string, price: number): void {
    this.patchState((s) => ({
      ...s,
      coins: s.coins - price,
      loot: s.loot.map((l) => (l.uid === uid ? { ...l, hotUntil: 0 } : l)),
      items: s.items.map((i) => (i.uid === uid && i.hot ? { ...i, hot: undefined } : i)),
    }));
  }

  /** Buy into the inventory (shop). Returns the error, if any. */
  buy(defId: string, qty = 1): string | undefined {
    const res = buyItem(this.state, defId, qty);
    if (res.error) {
      this.say(res.error);
      return res.error;
    }
    this.commit(res.state, false);
    return undefined;
  }

  /** Sell something that is in the inventory. */
  sellStock(defId: string): string | undefined {
    const res = sellFromInventory(this.state, defId);
    if (res.error) {
      this.say(res.error);
      return res.error;
    }
    this.commit(res.state, false);
    return undefined;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return this.say('No hay nada que deshacer');
    this.selectedUid = null;
    // Only the layout and the inventory go back. XP, stats, missions and what the guests paid since stay as they are;
    // the edit's own cost or refund is reversed. (Restoring the whole state would hand out mission rewards twice.)
    this.setState({ ...this.state, items: entry.prev.items, inventory: entry.prev.inventory, coins: this.state.coins + entry.refund });
    this.hooks.onChange();
  }

  /** Back to a brand new game (the UI then shows the title screen again). */
  /** the server's record of my crime (heat, shield, detention), read-only */
  crime: { heat: number; shieldUntil: number; detainedUntil: number; closedUntil: number; chores: number; choreGoal: number; guardUntil: number; blackout: boolean } = { heat: 0, shieldUntil: 0, detainedUntil: 0, closedUntil: 0, chores: 0, choreGoal: 0, guardUntil: 0, blackout: false };

  /** The police shut the club: close the doors now if they were open. */
  enforceClosure(): void {
    if (this.crime.closedUntil > Date.now() && this.state.open) this.commit(setClubOpen(this.state, false).state, false);
  }

  /** Apply what the server says happened while I was away (a robbery) and tell the player. */
  applyMail(mail: import('../core/mail').Mail[]): void {
    if (!mail.length) return;
    this.commit(applyMail(this.state, mail), false);
    for (const m of mail) {
      const took = [m.cash ? `${m.cash.toLocaleString('es-CO')} monedas` : '', ...m.pieces.map((p) => BY_ID.get(p.id)?.name ?? p.id)].filter(Boolean).join(' y ');
      if (m.kind === 'police') {
        const shutMin = Math.round(((m.closedUntil ?? 0) - m.at) / 60000);
        const shut = (m.closedUntil ?? 0) > m.at ? ` Clausuraron el club ${shutMin >= 60 ? `${Math.round(shutMin / 60)} h` : `${Math.max(1, shutMin)} min`}.` : '';
        this.hooks.onToast(`La Brigada del Ruido pasó por tu club${took ? `: se llevó ${took}` : ''}.${shut}`, 'bad');
      } else if (m.kind === 'fee') {
        this.hooks.onToast(`Pagaste ${m.cash.toLocaleString('es-CO')} monedas: ${m.byName}.`, 'ok');
      } else if (m.kind === 'jail') {
        this.hooks.onJail(m);
        this.hooks.onToast(`¡Te atraparon asaltando a ${m.byName || 'otro club'}! Vas a prisión: haz ${m.chores ?? 20} tareas para salir, y pagas ${m.cash.toLocaleString('es-CO')} de multa.`, 'bad');
      } else if (m.kind === 'income') {
        const h = Math.floor((m.minutes ?? 0) / 60);
        const mm = (m.minutes ?? 0) % 60;
        this.hooks.onToast(`Mientras no estabas (${h ? `${h} h ` : ''}${mm} min) tu club ganó ${m.cash.toLocaleString('es-CO')} monedas.`, 'ok');
      } else if (m.kind === 'robbed') this.hooks.onToast(`¡Te robaron! ${m.byName || 'Alguien'} se llevó ${took || 'algo'}.`, 'bad');
    }
  }

  /** my place in the city's ranking, as the server last told me */
  rank: import('../net/client').RankMsg | null = null;

  /** the club earns (and pays wages) only while the game is connected to the city server; single-player has no server and always earns */
  earning = true;

  /** the prison, while the player is inside it (a building far from the city: the camera and the character move there) */
  prison: PrisonWorld | null = null;
  private chore: { st: Station; phase: 'walk' | 'work'; t: number; tool: { group: THREE.Group; move(t: number): void } | null } | null = null;
  /** the other prisoners (real players who are in prison too) and the guard: they live in the prison building, each doing chores */
  private inmates = new Map<number, { actor: PlayerActor; st: Station | null; phase: 'walk' | 'work' | 'rest'; t: number; dur: number; tool: { group: THREE.Group; move(t: number): void } | null }>();
  private warden: PlayerActor | null = null;

  /** Show the other prisoners (the list comes with the ranking): each one walks to a chore and works, with their own name over them. */
  setInmates(list: import('../net/client').RankMsg['jailed'], myN: number): void {
    if (!this.prison) return;
    const seen = new Set<number>();
    for (const j of list) {
      if (j.n === myN) continue;
      seen.add(j.n);
      let m = this.inmates.get(j.n);
      if (!m) {
        const actor = new PlayerActor();
        actor.speed = 2.6;
        this.scene.add(actor.group);
        actor.teleport(PRISON_AT.x - 8.6 + Math.random() * 2, PRISON_AT.z - 3.4 + Math.random() * 1.5);
        void actor.setLook({ ...(j.look ?? randomConfig(Math.random() < 0.5 ? 'male' : 'female')), topColor: '#ff8a1e', bottomColor: '#ff8a1e', cap: false });
        actor.group.add(makeNameTag(j.name, '#ffb070'));
        m = { actor, st: null, phase: 'rest', t: Math.random() * 2, dur: 0, tool: null };
        this.inmates.set(j.n, m);
      }
    }
    for (const [n, m] of this.inmates) {
      if (seen.has(n)) continue;
      this.scene.remove(m.actor.group);
      this.inmates.delete(n);
    }
  }

  private stepInmate(m: NonNullable<ReturnType<typeof this.inmates.get>>, dt: number): void {
    const st = this.prison!.stations;
    m.actor.update(dt);
    if (m.phase === 'rest') {
      m.t -= dt;
      if (m.t > 0) return;
      m.st = st[Math.floor(Math.random() * st.length)];
      m.actor.path = [[m.st.x + (Math.random() - 0.5) * 1.4, m.st.z + (Math.random() - 0.5) * 0.4]];
      m.phase = 'walk';
    } else if (m.phase === 'walk') {
      if (m.actor.moving || !m.st) return;
      m.actor.face(m.st.face[0], m.st.face[1]);
      m.actor.stance = m.st.id;
      m.tool = m.st.tool();
      m.actor.group.add(m.tool.group);
      m.phase = 'work';
      m.t = 0;
      m.dur = WORK_SECONDS + Math.random() * 3;
    } else {
      m.t += dt;
      m.tool?.move(m.t);
      if (m.t < m.dur) return;
      if (m.tool) m.actor.group.remove(m.tool.group);
      m.tool = null;
      m.actor.stance = null;
      m.phase = 'rest';
      m.t = 1 + Math.random() * 3;
    }
  }

  /** a chore was finished in the prison (the server counts it) */
  onChoreDone: (id: string) => void = () => {};
  /** how far the chore the character is doing is (0 to 1), or null when they are not working */
  onChoreProgress: (p: number | null) => void = () => {};

  /** Take the player to the prison: an orange suit, a cell, and the camera on the whole building. */
  enterPrison(look: CharacterConfig): void {
    if (this.prison) return;
    this.cancelTool(false);
    this.selectedUid = null;
    if (this.visiting) this.leaveVisit(false);
    this.setEmote(null);
    this.prison = new PrisonWorld();
    this.scene.add(this.prison.group);
    this.player.teleport(PRISON_AT.x - 8.2, PRISON_AT.z - 3.6);
    this.setPlayerLook({ ...look, topColor: '#ff8a1e', bottomColor: '#ff8a1e', cap: false });
    const v = this.prison.view;
    const dist = 34 * Math.max(1, 1.1 / this.camera.aspect);
    this.baseDist = dist;
    this.controls.minDistance = dist * 0.4;
    this.controls.maxDistance = dist * 1.3;
    this.zoomGoal = null;
    const yaw = Math.PI / 4;
    const elev = (38 * Math.PI) / 180;
    this.controls.target.set(v.x, 0, v.z);
    this.camera.position.set(v.x + Math.sin(yaw) * Math.cos(elev) * dist, Math.sin(elev) * dist, v.z + Math.cos(yaw) * Math.cos(elev) * dist);
    this.controls.update();
    // the guard watches from the desk
    this.warden = new PlayerActor();
    this.scene.add(this.warden.group);
    this.warden.teleport(PRISON_AT.x + 3.6, PRISON_AT.z + 4.9);
    this.warden.face(-0.4, -1);
    void this.warden.setLook(NPC_LOOKS.ferro);
    this.warden.group.add(makeNameTag('Guardia', '#9fb8ff'));
    if (this.rank) this.setInmates(this.rank.jailed, this.rank.you.n);
  }

  /** The prison is over: back in the club, in the clothes the player chose. */
  leavePrison(look: CharacterConfig): void {
    if (!this.prison) return;
    this.endChore(false);
    for (const m of this.inmates.values()) this.scene.remove(m.actor.group);
    this.inmates.clear();
    if (this.warden) this.scene.remove(this.warden.group);
    this.warden = null;
    this.scene.remove(this.prison.group);
    this.prison.dispose();
    this.prison = null;
    this.setPlayerLook(look);
    this.mode = 'outside';
    this.goInsideNow();
  }

  /** Send the character to do a chore: walk to its place, then work there for a few seconds (the animation is the chore's own). */
  startChore(id: string): boolean {
    const st = this.prison?.station$(id);
    if (!st || this.chore) return false;
    this.player.path = [[st.x, st.z]];
    this.chore = { st, phase: 'walk', t: 0, tool: null };
    return true;
  }

  get working(): boolean {
    return this.chore !== null;
  }

  private endChore(done: boolean): void {
    const c = this.chore;
    if (!c) return;
    if (c.tool) this.player.group.remove(c.tool.group);
    this.player.stance = null;
    this.chore = null;
    this.onChoreProgress(null);
    if (done) this.onChoreDone(c.st.id);
  }

  private updatePrison(dt: number): void {
    if (this.prison) {
      for (const m of this.inmates.values()) this.stepInmate(m, dt);
      this.warden?.update(dt);
    }
    const c = this.chore;
    if (!this.prison || !c) return;
    if (c.phase === 'walk') {
      if (this.player.moving) return;
      this.player.face(c.st.face[0], c.st.face[1]);
      this.player.stance = c.st.id;
      c.tool = c.st.tool();
      this.player.group.add(c.tool.group);
      c.phase = 'work';
      return;
    }
    c.t += dt;
    c.tool?.move(c.t);
    this.onChoreProgress(Math.min(1, c.t / WORK_SECONDS));
    if (c.t >= WORK_SECONDS) this.endChore(true);
  }

  /** the dance the player is doing now */
  emote: EmoteId | null = null;
  private emoteUntil = 0;

  /** Start a dance or a gesture, or stop with null. Returns why it cannot be done. */
  setEmote(id: EmoteId | null): string | undefined {
    if (id) {
      const e = EMOTE_BY_ID.get(id);
      if (!e) return 'Ese baile no existe.';
      if (levelNow(this.state) < e.unlockLevel) {
        const msg = `${e.label} se desbloquea en el nivel ${e.unlockLevel}.`;
        this.say(msg);
        return msg;
      }
      this.player.path = [];
      this.emoteUntil = e.kind === 'gesture' ? performance.now() + 5200 : 0;
    }
    this.emote = id;
    this.player.stance = id;
    this.hooks.onChange();
    return undefined;
  }

  /** buy the anti-theft protector for some hours (set by main: the server charges it) */
  buyGuard: (hours: number) => void = () => {};

  /** talks to the server about robberies (set by main) */
  heistApi: import('../ui/heist').HeistApi | null = null;
  launder: (uid: string) => void = () => {};

  /** Buy a robbery kit from Zeta. */
  buyKit(kit: Kit): string | undefined {
    const r = buyKit(this.state, kit);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    return undefined;
  }

  /** Start putting a stolen piece from the bag into the club: it keeps its version and stays hot. */
  startPlaceLoot(uid: string): void {
    const l = this.state.loot.find((x) => x.uid === uid);
    if (!l) return;
    this.goInsideNow();
    this.cancelTool(false);
    this.selectedUid = null;
    const moveFrom = { uid: l.uid, id: l.id, x: 0, y: 0, rot: 0 as Rot, tier: l.tier, hot: l.hotUntil } as PlacedItem;
    this.tool = { kind: 'place', defId: l.id, rot: 0, mode: 'free', moveFrom, fromLoot: l.uid };
    this.message = '';
    this.afterToolChange();
  }

  /** the copy of the game on the server (set by main) */
  cloud: import('../net/cloud').Cloud | null = null;

  /** when the player last started over on purpose (the cloud copy may then be replaced) */
  resetAt = 0;

  reset(): void {
    this.resetAt = Date.now();
    this.undoStack = [];
    this.selectedUid = null;
    this.tool = { kind: 'select' };
    this.pending = [];
    this.sim.guests.length = 0;
    this.crowd.clear();
    this.setState(newClub());
    this.hooks.onChange();
  }

  /** Developer tool: jump the building to a phase. Objects that no longer fit go to the inventory. */
  changePhase(n: number): void {
    this.setState(setPhase(this.state, n));
    this.say(`Fase ${n}: ${PHASES[n - 1].name}`);
  }

  /** Change non-layout state (story flags, name, coins...) and let missions, levels and phases react. */
  patchState(fn: (s: ClubState) => ClubState): void {
    const before = this.state;
    this.apply(before, fn(before), false);
  }

  /** Developer/test helper: replace the state and let missions, levels and phases react. */
  load(next: ClubState): void {
    this.undoStack = [];
    this.selectedUid = null;
    this.tool = { kind: 'select' };
    this.setState(next);
    this.hooks.onChange();
  }

  /** Buy and place without a pointer (keyboard, gamepad, scripted checks). Returns the error, if any. */
  tryPlace(defId: string, x: number, y: number, rot: Rot = 0, mode: PlaceMode = 'buy'): string | undefined {
    const res = placeItem(this.state, defId, x, y, rot, mode);
    if (res.error) {
      this.say(res.error);
      return res.error;
    }
    this.commit(res.state);
    return undefined;
  }

  // ---- internals -----------------------------------------------------------------------------
  private selected(): PlacedItem | undefined {
    return this.state.items.find((i) => i.uid === this.selectedUid);
  }

  say(msg: string): void {
    this.message = msg;
    this.hooks.onChange();
    if (msg) this.hooks.onToast(msg);
  }

  private onChange(): void {
    this.hooks.onChange();
  }

  private afterToolChange(): void {
    this.refreshGhost();
    this.refreshHighlight();
    this.grid.visible = this.tool.kind === 'place';
    this.plotLines.visible = this.tool.kind === 'place';
    const placing = this.tool.kind === 'place';
    if (placing && !this.zoomedForPlacing) {
      this.zoomedForPlacing = true;
      this.zoomGoal = Math.max(this.controls.minDistance, this.baseDist * 0.5);
    } else if (!placing && this.zoomedForPlacing) {
      this.zoomedForPlacing = false;
      this.zoomGoal = this.baseDist;
    }
    this.onChange();
  }

  private commit(next: ClubState, undoable = true): void {
    const before = this.state;
    if (undoable) {
      this.undoStack.push({ prev: before, refund: before.coins - next.coins });
      if (this.undoStack.length > 40) this.undoStack.shift();
    }
    this.apply(before, next, true);
  }

  private setHover(c: { x: number; y: number } | null): void {
    this.hover = c;
    this.refreshGhost();
  }

  private currentGhostCell(): { x: number; y: number; ok: boolean; reason?: string } | null {
    if (this.tool.kind !== 'place' || !this.hover) return null;
    const def = BY_ID.get(this.tool.defId)!;
    const check = validatePlacement(this.state, def, this.hover.x, this.hover.y, this.tool.rot);
    return { ...this.hover, ok: check.ok, reason: check.reason };
  }

  private refreshGhost(): void {
    const cell = this.currentGhostCell();
    if (!cell || this.tool.kind !== 'place') {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const def = BY_ID.get(this.tool.defId)!;
    const ghostTier = this.tool.moveFrom ? tierOfItem(this.tool.moveFrom) : 1;
    const key = `${def.id}:${this.tool.rot}:${cell.ok}:${ghostTier}`;
    if (key !== this.ghostKey || !this.ghost) {
      if (this.ghost) this.scene.remove(this.ghost);
      this.ghost = buildProp(def.id, def.w, def.d, ghostTier);
      this.ghost.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = cell.ok ? GHOST_OK : GHOST_BAD;
      });
      this.scene.add(this.ghost);
      this.ghostKey = key;
    }
    this.place(this.ghost, def, cell.x, cell.y, this.tool.rot);
    this.ghost.visible = true;
    if (!cell.ok && cell.reason && this.message !== cell.reason) {
      this.message = cell.reason;
      this.onChange();
    } else if (cell.ok && this.message && !this.message.startsWith('Vendido') && !this.message.startsWith('Fase') && !this.message.startsWith('Club')) {
      this.message = '';
      this.onChange();
    }
  }

  private refreshHighlight(): void {
    const it = this.selected();
    if (!it) {
      this.highlight.visible = false;
      return;
    }
    const def = BY_ID.get(it.id)!;
    const fp = footprint(def, it.rot);
    this.highlight.scale.set(fp.w, fp.d, 1);
    this.highlight.position.set(it.x + fp.w / 2, 0.06, it.y + fp.d / 2);
    this.highlight.visible = true;
  }

  private place(g: THREE.Object3D, def: ItemDef, x: number, y: number, rot: Rot): void {
    const fp = footprint(def, rot);
    g.position.set(x + fp.w / 2, 0, y + fp.d / 2);
    g.rotation.y = (-rot * Math.PI) / 2;
  }

  private rebuildItems(): void {
    disposeChildren(this.items);
    this.pulse = [];
    this.spinners = [];
    this.ticks = [];
    this.fx.clearSources();
    for (const it of this.state.items) {
      const def = BY_ID.get(it.id);
      if (!def) continue;
      const g = buildProp(def.id, def.w, def.d, tierOfItem(it));
      g.userData.uid = it.uid;
      this.place(g, def, it.x, it.y, it.rot);
      g.traverse((o) => {
        if (o.userData.spin !== undefined) this.spinners.push(o);
        if (typeof o.userData.tick === 'function') this.ticks.push(o.userData.tick as PropTick);
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.pulse) this.pulse.push(m.material as THREE.MeshToonMaterial);
      });
      this.items.add(g);
      if (def.id === 'speaker' || BOOTH_IDS.includes(def.id)) this.fx.addSource(g, BOOTH_IDS.includes(def.id) ? 'booth' : 'speaker');
    }
    // Picking runs between frames: refresh world matrices now so a click right after an edit hits the new layout.
    this.items.updateMatrixWorld(true);
    this.rebuildStaff();
  }

  private rebuildRoom(): void {
    disposeChildren(this.room);
    const p = phaseOf(this.state);
    this.builtPhase = p.id;
    const r = this.room;
    // what only exists inside the club (the cutaway view); hidden when the player is out in the street
    const inner = new THREE.Group();
    this.interior = inner;
    r.add(inner);

    // parcel ground + border
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xa6aab8, roughness: 0.95, metalness: 0 });
    groundMat.userData.outlineParameters = { visible: false };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL.w, PARCEL.h), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(PARCEL.w / 2 - ORIGIN.x, -0.06, PARCEL.h / 2 - ORIGIN.z);
    r.add(ground);
    // the lot and the footprint of the next phase: only drawn while you are placing things
    this.plotLines = new THREE.Group();
    this.plotLines.add(rectLine(-ORIGIN.x, -ORIGIN.z, PARCEL.w, PARCEL.h, 0x18d8ff, 0.8, -0.05));
    const next = PHASES[p.id]; // phase after this one (undefined at the last)
    if (next) this.plotLines.add(rectLine(0, 0, next.w, next.h, 0xa13cff, 0.8, -0.04));
    this.plotLines.visible = this.tool.kind === 'place';
    r.add(this.plotLines);

    // floor, walls, mouldings, pictures and lights: the finishes the player has bought (render/roomstyle.ts)
    const shell = buildShell(p, this.state.decor.sel);
    this.shell = shell;
    inner.add(shell.floor);
    this.wallN = shell.wallN;
    this.wallW = shell.wallW;
    inner.add(this.wallN, this.wallW);
    this.lightMul = shell.lights.mul;
    this.neonLights[0]?.color.setHex(shell.lights.a);
    this.neonLights[1]?.color.setHex(shell.lights.b);
    this.decorKey = this.decorSig();

    // entrance: red carpet + gold posts + neon arch
    const [d1, d2] = doorCells(p);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 1), toon(0x9c1d2e, { outline: false }));
    carpet.position.set(d1[0] + 1, 0.0, d1[1] + 0.5);
    r.add(carpet);
    for (const x of [d1[0] - 0.05, d2[0] + 1.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 8), toon(0xf2c40d));
      post.position.set(x, 0.8, p.h + 0.02);
      r.add(post);
    }
    const arch = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.1), toon(0xff3da6, { emissive: 0xff3da6, emissiveIntensity: 1.3, outline: false }));
    arch.position.set(d1[0] + 1, 1.62, p.h + 0.02);
    r.add(arch);
    this.signOpen = neon('ABIERTO', '#35f08a', 2.6, 0.7);
    this.signClosed = neon('CERRADO', '#ff3d55', 2.6, 0.7);
    for (const sign of [this.signOpen, this.signClosed]) {
      sign.position.set(d1[0] + 1, 2.25, p.h + 0.45); // hangs in the doorway: seen from the street and from inside
      r.add(sign);
    }
    // police tape: two striped bars crossed over the doorway and a sign (only while the club is shut by the police)
    const tape = new THREE.Group();
    const yellow = toon(0xf2c40d, { outline: false });
    const black = toon(0x15151a, { outline: false });
    for (const [rot, y] of [[0.42, 1.25], [-0.42, 1.25]] as const) {
      const bar = new THREE.Group();
      bar.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.03), yellow));
      for (let i = -5; i <= 5; i += 2) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.035), black);
        st.position.x = i * 0.24;
        st.rotation.z = 0.7;
        bar.add(st);
      }
      bar.position.set(d1[0] + 1, y, p.h + 0.6);
      bar.rotation.z = rot;
      tape.add(bar);
    }
    const board = neon('CLAUSURADO', '#f2c40d', 2.8, 0.7);
    board.position.set(d1[0] + 1, 2.7, p.h + 0.62);
    tape.add(board);
    tape.visible = false;
    r.add(tape);
    this.tape = tape;
    this.updateSign();

    this.room.add(buildYard(p.id));
    this.rebuildFacade();

    // grid overlay (only visible while placing)
    const pts: number[] = [];
    for (let x = 0; x <= p.w; x++) pts.push(x, 0.03, 0, x, 0.03, p.h);
    for (let y = 0; y <= p.h; y++) pts.push(0, 0.03, y, p.w, 0.03, y);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x18d8ff, transparent: true, opacity: 0.28 }));
    this.grid.visible = this.tool.kind === 'place';
    inner.add(this.grid);
    this.applyMode();
  }


  /** Say something: a balloon over my own character. */
  sayOwn(text: string): void {
    this.bubbles.say(this.player.group, this.state.story.name || 'Jugador', text, '#0f8fb0');
  }

  /** Somebody nearby spoke: a balloon over their character if I can see them. */
  hear(n: number, name: string, text: string): void {
    const a = this.remote.actors.get(n);
    if (a) this.bubbles.say(a.actor.group, name, text);
  }

  // ---- the multiplayer city ---------------------------------------------------------------------
  private lastNight = 0;
  private lastWet = 0;
  private neighborsSig = '';
  /** the neighbours now drawn (simulated until a city server answers) */
  neighbors: Neighbor[] = [];
  /** connection to the city server, for the HUD */
  net: { status: 'off' | 'connecting' | 'online'; online: number } = { status: 'off', online: 0 };

  private visitNoteFor = -1;

  /** Of the open clubs around, the one you hear: the closest that is playing music. */
  private hearNeighbors(): void {
    let best: { genre: Genre; bpm: number } | null = null;
    let reach = 0;
    let real: Track | null = null;
    if (this.visiting) {
      const m = this.neighbors.find((n) => n.kind === 'club' && n.n === this.visiting!.n);
      if (m && m.kind === 'club' && m.music?.playing && m.open) {
        const f = m.music;
        if (f.source && f.ref) {
          // the very same song, from the same moment: a link or one of the game's own tracks
          const elapsed = Math.max(0, (Date.now() + (this.env.cityOffsetMs ?? 0) - f.startedAt) / 1000);
          real = { id: `visit:${f.ref}:${f.startedAt}`, title: f.title, genre: f.genre, bpm: f.bpm, source: f.source as Track['source'], ref: f.ref, start: elapsed < 7200 ? elapsed : 0 } as Track;
        } else {
          best = f; // a file from their computer cannot be sent: the same genre and tempo stands in
          reach = 1;
          if (this.visitNoteFor !== m.n) {
            this.visitNoteFor = m.n as number;
            this.hooks.onToast(`La canción de este club ("${f.title}") es un archivo de su computador y no se puede compartir: oyes algo del mismo género.`, 'ok');
          }
        }
      }
    } else if (this.mode === 'outside') {
      for (const n of this.neighbors) {
        if (n.kind !== 'club' || !n.open || n.online === false || !n.music?.playing) continue;
        const p = PHASES[Math.min(Math.max(n.phase, 1), PHASES.length) - 1];
        const o = buildingOrigin(n.cell);
        const dx = Math.max(o.x - this.player.x, 0, this.player.x - (o.x + p.w));
        const dz = Math.max(o.z - this.player.z, 0, this.player.z - (o.z + p.h));
        const r = Math.max(0, 1 - Math.hypot(dx, dz) / 16) ** 1.5;
        if (r > reach) {
          reach = r;
          best = n.music;
        }
      }
    }
    this.music.setOverride(real);
    if (real && !this.state.music.playing) this.music.unlock();
    this.music.setNeighbor(best, reach);
  }

  private presence: Array<[number, boolean]> = [];

  /** Update the tags over players' clubs: who is inside their club and who is out in the street. */
  showPresence(list: Array<[number, boolean]>): void {
    this.presence = list;
    for (const [n, inside] of list) this.city.setClubStatus(n, inside ? 'inside' : 'street');
  }

  /** My lot's cell in the city (set when the server tells me). */
  home = { i: 0, j: 0 };

  /** how many lots around mine are drawn (graphics quality) */
  private cityRange = 3;
  private maxGuests = 60;

  /** Apply a graphics quality: lights, weather effects, how much city is drawn and how often guests animate. */
  setQuality(q: Settings): void {
    this.neonLights.forEach((l) => (l.visible = q.neonLights));
    this.env.weatherFx = q.weatherFx;
    this.crowd.mixerEvery = q.mixerEvery;
    this.crowd.maxGuests = q.maxGuests;
    this.visitCrowd && (this.visitCrowd.maxGuests = q.maxGuests);
    this.ambient.maxPeople = q.maxAmbient;
    this.maxGuests = q.maxGuests;
    if (q.cityRange !== this.cityRange) {
      this.cityRange = q.cityRange;
      this.neighborsSig = ''; // force a redraw of the city at the new size
      this.setNeighbors(this.neighbors.length ? this.neighbors : simulatedNeighbors(7));
    }
  }

  /** Replace the city's neighbours (real players from the server). Redraws the city only if something changed. */
  setNeighbors(list: Neighbor[]): void {
    const sig = JSON.stringify(list);
    if (sig === this.neighborsSig) return;
    this.neighborsSig = sig;
    this.neighbors = list;
    this.ambient.setClubs(list);
    this.scene.remove(this.city.group);
    this.city.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (!mat.userData.shared) mat.dispose();
    });
    this.city = buildCity(list, this.home, this.cityRange);
    this.scene.add(this.city.group);
    this.city.setNight(this.lastNight);
    this.city.setWet(this.lastWet);
    this.showPresence(this.presence);
    if (this.visiting) this.city.setClubVisible(this.visiting.n, false); // the city was redrawn: keep the visited building open
  }

  // ---- visiting another player's club ------------------------------------------------------------
  /** the club being visited, if any */
  visiting: { n: number; name: string } | null = null;
  private visitGroup: THREE.Group | null = null;
  /** the visited club's night, simulated here from its layout: dancers inside and a line outside */
  private visitSim: GuestSim | null = null;
  private visitCrowd: GuestCrowd | null = null;
  /** the club being walked in: where its building stands, its size, and which cells are furniture */
  private visitSpace: { ox: number; oz: number; w: number; h: number; blocked: Set<string>; doorX: number } | null = null;
  /** called when the player clicks a real player's club in the street */
  onNeighborClick: (club: Neighbor) => void = () => {};
  /** removes an uploaded song from the server (set by main) */
  onCloudRemove: (ref: string) => void = () => {};
  /** asks the city server for a club's inside (set by main) */
  requestVisit: (n: number) => void = () => {};
  /** told to the server when a visit ends */
  onLeaveVisit: () => void = () => {};
  /** called when a visit starts or ends */
  onVisitChange: (visiting: { n: number; name: string } | null) => void = () => {};

  /** Which real player's club is under the pointer (outside view only). */
  private pickNeighbor(e: PointerEvent): Neighbor | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    for (const c of this.city.clubs) {
      if (this.raycaster.intersectObject(c.group, true).length) return this.neighbors.find((n) => n.kind === 'club' && n.n === c.n) ?? null;
    }
    return null;
  }

  /** Walk into somebody's club to look around: their furniture appears where their building stands and the view flies there. */
  enterVisit(v: VisitView): void {
    this.leaveVisit(false);
    const nb = this.neighbors.find((n) => n.kind === 'club' && n.n === v.n);
    if (!nb) return;
    const o = buildingOrigin(nb.cell);
    this.visitGroup = buildInterior(v.phase, v.items, (v.decor ?? undefined) as never);
    this.visitGroup.position.set(o.x, 0, o.z);
    this.scene.add(this.visitGroup);
    this.city.setClubVisible(v.n, false);
    this.visiting = { n: v.n, name: v.name };
    this.remote.visiting = v.n;
    this.light({ ...this.state, stats: { ...this.state.stats, visits: this.state.stats.visits + 1 } });
    // fill it with life: their layout runs as a night of its own (these guests are scenery, not their real ones)
    const fake = { ...newClub(), phase: v.phase, items: v.items.map((i, k) => ({ ...i, uid: `v${k}` })) } as ClubState;
    this.visitSim = new GuestSim(v.n * 7919 + 1);
    this.visitSim.setLayout(fake);
    this.visitCrowd = new GuestCrowd();
    this.visitCrowd.maxGuests = this.maxGuests;
    this.visitCrowd.group.position.set(o.x, 0, o.z);
    this.scene.add(this.visitCrowd.group);
    void this.visitCrowd.init();
    for (let t = 0; t < 90; t += 0.25) this.visitSim.update(0.25); // it is already a busy night when you walk in
    this.cancelTool(false);
    const p = PHASES[Math.min(Math.max(v.phase, 1), PHASES.length) - 1];
    // my character arrives at their door and walks in, like going into my own club
    const [d1] = doorCells(p);
    this.visitSpace = { ox: o.x, oz: o.z, w: p.w, h: p.h, blocked: blockedSet(v.items.map((i, k) => ({ ...i, uid: `v${k}` })) as PlacedItem[]), doorX: d1[0] + 1 };
    this.mode = 'outside';
    this.applyMode();
    this.player.teleport(o.x + d1[0] + 1, o.z + p.h + 3);
    this.player.path = [[o.x + d1[0] + 1, o.z + p.h + 0.6], [o.x + d1[0] + 1, o.z + p.h - 1.2]];
    const dist = ((p.w + p.h) * 1.15 + 32) * Math.max(1, 1.1 / this.camera.aspect);
    const off = this.camera.position.clone().sub(this.controls.target).setLength(dist);
    this.controls.target.set(o.x + p.w / 2, 0, o.z + p.h / 2);
    this.camera.position.copy(this.controls.target).add(off);
    this.zoomGoal = null;
    this.onVisitChange(this.visiting);
  }

  /** Click while inside a friend's club: walk to that spot around their furniture (or back out through their door). */
  private clickVisit(e: PointerEvent): void {
    const v = this.visitSpace;
    const pt = this.worldPoint(e);
    if (!v || !pt) return;
    const lx = pt.x - v.ox;
    const lz = pt.z - v.oz;
    const doorIn: Pt = [v.ox + v.doorX, v.oz + v.h - 0.5];
    const doorOut: Pt = [v.ox + v.doorX, v.oz + v.h + 1.4];
    const meLocal = [this.player.x - v.ox, this.player.z - v.oz];
    const meInside = meLocal[0] >= 0 && meLocal[0] < v.w && meLocal[1] >= 0 && meLocal[1] < v.h;
    if (lz >= v.h) {
      // clicked the street in front of their club: walk out through the door
      this.player.path = meInside ? [doorIn, doorOut, [pt.x, pt.z]] : [[pt.x, pt.z]];
      return;
    }
    if (lx < 0 || lz < 0 || lx >= v.w) return;
    const from: Pt = meInside ? [Math.floor(meLocal[0]), Math.floor(meLocal[1])] : [v.doorX - 1, v.h - 1];
    const cells = gridPath(v.blocked, v.w, v.h, from, [Math.floor(lx), Math.floor(lz)]);
    if (!cells) return this.say('No puedes llegar hasta ahí.');
    const entry: Array<[number, number]> = meInside ? [] : [doorOut, doorIn];
    this.player.path = [...entry, ...cells.map(([x, y]): [number, number] => [v.ox + x + 0.5, v.oz + y + 0.5])];
  }

  leaveVisit(notify = true): void {
    this.visitNoteFor = -1;
    if (!this.visiting) return;
    if (this.visitGroup) {
      this.scene.remove(this.visitGroup);
      this.visitGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.visitGroup = null;
    }
    if (this.visitCrowd) {
      this.visitCrowd.clear();
      this.scene.remove(this.visitCrowd.group);
    }
    this.visitCrowd = null;
    this.visitSim = null;
    this.city.setClubVisible(this.visiting.n, true);
    // back out on the street, in front of my own door
    const [mx, mz] = this.doorOutside();
    this.player.teleport(mx, mz + 1.5);
    this.visitSpace = null;
    this.visiting = null;
    this.remote.visiting = null;
    this.onLeaveVisit();
    this.resetView();
    if (notify) this.onVisitChange(null);
  }

  private ownTagName = '';
  private ownTagSprite: THREE.Sprite | null = null;

  /** My own name over my character (in cyan, to tell it from the others). */
  private ownTag(): void {
    const name = this.state.story.name || 'Jugador';
    if (name === this.ownTagName) return;
    this.ownTagName = name;
    if (this.ownTagSprite) {
      this.player.group.remove(this.ownTagSprite);
      this.ownTagSprite.material.map?.dispose();
      this.ownTagSprite.material.dispose();
    }
    this.ownTagSprite = makeNameTag(name, '#7fe9ff');
    this.player.group.add(this.ownTagSprite);
  }

  // ---- the player's character: walking, the street, the facade ---------------------------------
  private facadeKey = '';

  // ---- staff: guards at the door, the DJ in the booth, bartenders behind the bar ---------------
  private staffGroup = new THREE.Group();
  private staffActors: Array<{ actor: PlayerActor; inside: boolean }> = [];
  private staffSig = '';
  private staffLooks = new Map<string, CharacterConfig>();

  private rebuildStaff(): void {
    const s = this.state;
    const p = phaseOf(s);
    const sig = JSON.stringify([s.staff, s.items.map((i) => [i.id, i.x, i.y, i.rot]), p.id]);
    if (sig === this.staffSig) return;
    this.staffSig = sig;
    for (const a of this.staffActors) this.staffGroup.remove(a.actor.group);
    this.staffActors = [];
    const add = (key: string, inside: boolean, x: number, z: number, face: Pt, stance: 'idle' | 'dj_mix') => {
      let look = this.staffLooks.get(key);
      if (!look) {
        look = randomConfig(Math.random() < 0.5 ? 'male' : 'female');
        this.staffLooks.set(key, look);
      }
      const actor = new PlayerActor();
      actor.size = 1.0;
      actor.stance = stance;
      void actor.setLook(look).then(() => {
        actor.teleport(x, z);
        actor.face(face[0], face[1]);
      });
      this.staffGroup.add(actor.group);
      this.staffActors.push({ actor, inside });
    };
    // the DJ and the bartenders stand on free cells next to their booth or bar, never inside the furniture
    const spots = staffSpots(s);
    if (s.staff.dj && spots.dj[0]) {
      const sp = spots.dj[0];
      add('dj:0', true, sp.x, sp.z, [sp.fx, sp.fz], 'dj_mix');
    }
    spots.bartender.slice(0, s.staff.bartender).forEach((sp, i) => add(`bartender:${i}`, true, sp.x, sp.z, [sp.fx, sp.fz], 'idle'));
    const [d1] = doorCells(p);
    for (let i = 0; i < s.staff.guard; i++) {
      // one behind the podium, the other across the carpet, both watching the line
      const mid = d1[0] + 1;
      if (i === 0) add(`guard:${i}`, false, mid - 2.2, p.h + 0.6, [0, 1], 'idle');
      else add(`guard:${i}`, false, mid + 2.2, p.h + 1.2, [-1, 0.4], 'idle');
    }
    this.applyStaffVisibility();
  }

  private applyStaffVisibility(): void {
    for (const a of this.staffActors) a.actor.group.visible = this.enabled && (this.mode === 'inside' || !a.inside);
  }

  hireStaff(role: Role): string | undefined {
    const r = hireStaff(this.state, role);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    return undefined;
  }

  fireStaff(role: Role): void {
    const r = fireStaff(this.state, role);
    if (!r.error) this.commit(r.state, false);
  }

  private decorSig(): string {
    return JSON.stringify(this.state.decor.sel);
  }

  private facadeSig(): string {
    return JSON.stringify([this.state.phase, this.state.exterior, this.state.story.name]);
  }

  private rebuildFacade(): void {
    disposeChildren(this.facade);
    this.facadeKey = this.facadeSig();
    this.facade.add(buildFacade(phaseOf(this.state), this.state.exterior, this.state.story.name));
    disposeChildren(this.lane);
    this.lane.add(buildLane(phaseOf(this.state), this.state.exterior));
  }

  /** Show the inside (cutaway, furniture, crowd) or the outside (closed building, street). */
  private applyMode(): void {
    const inside = this.mode === 'inside';
    this.interior.visible = inside;
    this.items.visible = inside;
    this.facade.visible = !inside;
    if (!inside) this.highlight.visible = false;
    else this.refreshHighlight();
    this.refreshGhost();
  }

  setPlayerLook(cfg: CharacterConfig): void {
    void this.player.setLook(cfg).then(() => this.player.teleport(this.player.x, this.player.z));
  }

  private doorInside(): Pt {
    const [d1] = doorCells(phaseOf(this.state));
    return [d1[0] + 1, d1[1] - 0.5];
  }

  private doorOutside(): Pt {
    const p = phaseOf(this.state);
    const [d1] = doorCells(p);
    return [d1[0] + 1, p.h + 0.7];
  }

  private cellOfPlayer(): Pt {
    const p = phaseOf(this.state);
    return [Math.min(Math.max(Math.floor(this.player.x), 0), p.w - 1), Math.min(Math.max(Math.floor(this.player.z), 0), p.h - 1)];
  }

  /** After the layout changed: keep the character out of furniture and its path walkable. */
  private keepPlayerFree(reset: boolean): void {
    const pl = this.player;
    if (reset) {
      this.arrival = null;
      const [x, z] = this.mode === 'inside' ? this.doorInside() : this.doorOutside();
      pl.teleport(x, z);
      return;
    }
    if (this.mode !== 'inside') return;
    const blocked = blockedSet(this.state.items);
    const [cx, cz] = this.cellOfPlayer();
    if (blocked.has(`${cx},${cz}`)) {
      this.arrival = null;
      const [x, z] = this.doorInside();
      pl.teleport(x, z);
    } else if (pl.path.some(([x, z]) => blocked.has(`${Math.floor(x)},${Math.floor(z)}`))) {
      pl.path = [];
      this.arrival = null;
    }
  }

  private updatePlayer(dt: number): void {
    const pl = this.player;
    pl.group.visible = this.enabled && pl.ready;
    const arrived = pl.update(dt);
    if (arrived && this.arrival) {
      const a = this.arrival;
      this.arrival = null;
      if (a === 'enter') this.goInsideNow();
      else this.goOutsideNow();
    }
    if (this.mode === 'outside' && pl.moving && !this.prison) {
      // the view follows the character through the street
      const t = this.controls.target;
      const k = Math.min(1, dt * 3);
      const dx = (pl.x - t.x) * k;
      const dz = (pl.z - t.z) * k;
      t.x += dx;
      t.z += dz;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
  }

  /** Come in through the door (no walk). */
  goInsideNow(): void {
    if (this.mode === 'inside') return;
    this.mode = 'inside';
    this.arrival = null;
    const [x, z] = this.doorInside();
    this.player.teleport(x, z);
    this.applyMode();
    this.resetView();
    this.hooks.onMode('inside');
  }

  /** Step out into the street (no walk to the door). */
  goOutsideNow(): void {
    if (this.mode === 'outside') return;
    this.cancelTool(false);
    this.selectedUid = null;
    this.mode = 'outside';
    this.arrival = null;
    const [x, z] = this.doorOutside();
    this.player.teleport(x, z);
    this.player.path = [[x + 1.6, z + 1.2]];
    this.applyMode();
    const off = this.camera.position.clone().sub(this.controls.target).setLength(this.baseDist * 0.55);
    this.controls.target.set(x, 0, z + 2);
    this.camera.position.copy(this.controls.target).add(off);
    this.zoomGoal = null;
    this.hooks.onMode('outside');
    this.hooks.onChange();
  }

  /** Walk to the door and go through it, whichever side the player is on. */
  toggleMode(): void {
    if (this.mode === 'inside') this.walkInsideTo(this.doorInside(), 'exit');
    else this.walkOutsideTo(this.doorOutside(), 'enter');
  }

  private walkInsideTo(target: Pt, arrival: 'exit' | null): void {
    const p = phaseOf(this.state);
    if (this.tool.kind === 'place') this.cancelTool();
    const from = this.cellOfPlayer();
    const blocked = blockedSet(this.state.items);
    let goal: Pt = [Math.min(Math.max(Math.floor(target[0]), 0), p.w - 1), Math.min(Math.max(Math.floor(target[1]), 0), p.h - 1)];
    let cells = gridPath(blocked, p.w, p.h, from, goal);
    if (arrival === 'exit') {
      // going out: any of the door cells will do, whatever is standing in front of the one that was clicked
      const [d1, d2] = doorCells(p);
      const options: Pt[] = [goal, [d1[0], d1[1]], [d2[0], d2[1]]];
      cells = null;
      for (const o of options) {
        cells = o[0] === from[0] && o[1] === from[1] ? [] : gridPath(blocked, p.w, p.h, from, o);
        if (cells) {
          goal = o;
          break;
        }
      }
      if (!cells) {
        // boxed in by furniture (it can happen if something was placed on top of you): step out of the door anyway
        this.goOutsideNow();
        return;
      }
    }
    if (!cells) return this.say('No puedes llegar hasta ahí.');
    this.player.path = cells.map(([x, y]) => [x + 0.5, y + 0.5]);
    if (!cells.length && arrival === 'exit') this.player.path = [[goal[0] + 0.5, goal[1] + 0.5]];
    this.arrival = arrival;
  }

  private walkOutsideTo(target: Pt, arrival: 'enter' | null): void {
    const p = phaseOf(this.state);
    const box = { x0: 0, y0: 0, x1: p.w, y1: p.h };
    const x = Math.min(Math.max(target[0], STREET_BOX.x0), STREET_BOX.x1);
    const z = Math.min(Math.max(target[1], STREET_BOX.z0), STREET_BOX.z1);
    this.player.path = routeAround(box, [this.player.x, this.player.z], [x, z]);
    this.arrival = arrival;
  }

  /** A click on empty ground: walk there (or through the door, if that is where the click was). */
  private clickGround(e: PointerEvent): void {
    const pt = this.worldPoint(e);
    if (!pt) return;
    const p = phaseOf(this.state);
    const [d1, d2] = doorCells(p);
    if (this.mode === 'inside') {
      if (pt.z >= p.h) return this.walkInsideTo(this.doorInside(), 'exit'); // clicked the street: go out
      if (pt.x < 0 || pt.z < 0 || pt.x >= p.w) return;
      const onDoor = Math.floor(pt.z) === d1[1] && (Math.floor(pt.x) === d1[0] || Math.floor(pt.x) === d2[0]);
      this.walkInsideTo([pt.x, pt.z], onDoor ? 'exit' : null);
    } else if (pt.x >= -0.5 && pt.x <= p.w + 0.5 && pt.z >= -0.5 && pt.z <= p.h + 0.5) {
      this.walkOutsideTo(this.doorOutside(), 'enter'); // clicked the building: go in through the door
    } else {
      this.walkOutsideTo([pt.x, pt.z], null);
    }
  }

  /** Pay for a facade upgrade (or switch to a paint already owned). */
  buyExterior(id: string): string | undefined {
    const owned = this.state.exterior.owned.includes(id);
    const r = owned ? choosePaint(this.state, id) : buyUpgrade(this.state, id);
    if (r.error) {
      this.say(r.error);
      return r.error;
    }
    this.commit(r.state, false);
    return undefined;
  }

  // ---- picking -------------------------------------------------------------------------------
  private worldPoint(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, out) ? out : null;
  }

  private cellFor(e: PointerEvent): { x: number; y: number } | null {
    if (this.tool.kind !== 'place') return null;
    const p = this.worldPoint(e);
    if (!p) return null;
    const def = BY_ID.get(this.tool.defId)!;
    const fp = footprint(def, this.tool.rot);
    return { x: Math.round(p.x - fp.w / 2), y: Math.round(p.z - fp.d / 2) };
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  private onMove(e: PointerEvent): void {
    if (!this.enabled) return;
    if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) return; // dragging = panning
    if (e.pointerType === 'touch') return; // touch uses tap-to-preview, handled on up
    this.setHover(this.cellFor(e));
  }

  private onUp(e: PointerEvent): void {
    if (this.prison) return; // in prison the character is sent to chores with the buttons, not walked around
    if (!this.enabled || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 6 || e.button === 2) return; // it was a pan, or a right click
    if (this.tool.kind === 'place') {
      const cell = this.cellFor(e);
      if (!cell) return;
      if (e.pointerType === 'touch') {
        const same = this.hover && this.hover.x === cell.x && this.hover.y === cell.y;
        if (!same) return this.setHover(cell); // first tap previews, second tap on the same cell confirms
      }
      this.hover = cell;
      this.commitPlace();
    } else if (this.visiting) {
      this.clickVisit(e); // walking around somebody else's club: nothing to edit, but you can walk
    } else if (this.mode === 'outside') {
      const nb = this.pickNeighbor(e);
      if (nb) this.onNeighborClick(nb);
      else this.clickGround(e);
    } else {
      this.pick(e);
    }
  }

  private commitPlace(): void {
    if (this.tool.kind !== 'place' || !this.hover) return;
    const t = this.tool;
    const res = placeItem(this.state, t.defId, this.hover.x, this.hover.y, t.rot, t.mode);
    if (res.error) return this.say(res.error);
    if (t.moveFrom) {
      this.undoStack.push({ prev: this.moveSnapshot ?? this.state, refund: 0 });
      this.moveSnapshot = null;
      this.tool = { kind: 'select' };
      // moving keeps the version the piece had
      const moved = tierOfItem(t.moveFrom);
      const last = res.state.items.length - 1;
      const hot = t.moveFrom.hot && t.moveFrom.hot > Date.now() ? t.moveFrom.hot : undefined;
      let placed = moved > 1 || hot ? { ...res.state, items: res.state.items.map((i, k) => (k === last ? { ...i, ...(moved > 1 ? { tier: moved } : {}), ...(hot ? { hot } : {}) } : i)) } : res.state;
      if (t.fromLoot) placed = { ...placed, loot: placed.loot.filter((l) => l.uid !== t.fromLoot) }; // it left the bag
      this.selectedUid = placed.items[last].uid;
      this.setState(placed);
      this.afterToolChange();
    } else {
      this.commit(res.state);
      // keep placing copies while the player can supply another one (from the inventory, or by paying for it)
      const def = BY_ID.get(t.defId)!;
      const another = owned(this.state, t.defId) >= 1 || (t.mode === 'buy' && this.state.coins >= def.price);
      if (!another) this.cancelTool();
      else this.afterToolChange();
    }
  }

  private pick(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.items.children, true);
    let uid: string | null = null;
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.uid === undefined) o = o.parent;
      if (o) {
        uid = o.userData.uid as string;
        break;
      }
    }
    this.selectedUid = uid;
    this.refreshHighlight();
    this.onChange();
    if (!uid) this.clickGround(e); // empty floor: the character walks there
  }

  /** Screen position (in CSS pixels, relative to the canvas) of a cell centre. Used by automated checks. */
  cellToScreen(x: number, y: number): { x: number; y: number } {
    const v = new THREE.Vector3(x + 0.5, 0, y + 0.5).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }
}

function rectLine(x: number, z: number, w: number, h: number, color: number, opacity: number, y: number): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, y, z), new THREE.Vector3(x + w, y, z), new THREE.Vector3(x + w, y, z + h), new THREE.Vector3(x, y, z + h),
  ]);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
}

function disposeChildren(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x !== GHOST_OK && x !== GHOST_BAD && !x.userData.shared && x.dispose());
      else if (mat && mat !== GHOST_OK && mat !== GHOST_BAD && !mat.userData.shared) mat.dispose();
    });
  }
}
