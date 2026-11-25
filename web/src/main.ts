import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Governor, TIERS, getPreference, startTier, type Settings } from './render/quality';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import {
  defaultConfig, randomConfig, sanitize,
  type AnimId, type CharacterConfig,
} from './core/character';
import { newClub, sanitizeClub } from './core/club';
import { levelOf } from './core/progression';
import { CATALOG } from './core/catalog';
import { simulatedNeighbors } from './core/world';
import { Cloud, looksFresh, describe as describeSave } from './net/cloud';
import { Online, guestId, httpBase, neighborsFrom, serverUrl } from './net/client';
import { Avatar } from './render/avatar';
import { ClubView, type ClubHooks } from './render/club';
import { ComicStudio } from './render/comic';
import { Stage } from './render/stage';
import { Thumbs } from './render/thumbs';
import { GameUi } from './ui/game';
import { modalOpen } from './ui/modal';
import { Prison } from './ui/prison';
import { ChatBox } from './ui/chat';
import { Panel } from './ui/panel';
import '@fontsource/bungee/400.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import './style.css';
import './theme.css';

const CHAR_KEY = 'nc.character.v1';
const CLUB_KEY = 'nc.club.v1';

type Mode = 'club' | 'character';

function loadCharacter(): CharacterConfig {
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultConfig('male');
  } catch {
    return defaultConfig('male');
  }
}

function loadClub() {
  try {
    const raw = localStorage.getItem(CLUB_KEY);
    return raw ? sanitizeClub(JSON.parse(raw)) : newClub();
  } catch {
    return newClub();
  }
}

async function main() {
  const stageEl = document.getElementById('stage') as HTMLElement;
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const loading = document.getElementById('loading') as HTMLElement;
  const panelEl = document.getElementById('panel') as HTMLElement;

  const tier0 = startTier();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: TIERS[tier0].antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, TIERS[tier0].pixelRatio));
  const effect = new OutlineEffect(renderer, { defaultThickness: 0.0042, defaultColor: [0.02, 0.02, 0.05], defaultAlpha: 1 });
  const thumbs = new Thumbs();
  const comic = new ComicStudio();

  // ---------------------------------------------------------------- character creator
  const stage = new Stage();
  const avatar = new Avatar();
  stage.scene.add(avatar.group);
  const charCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  charCamera.position.set(0, 0.95, 3.4);
  const charControls = new OrbitControls(charCamera, canvas);
  charControls.target.set(0, 0.6, 0);
  charControls.enableDamping = true;
  charControls.enablePan = false;
  charControls.minDistance = 1.4;
  charControls.maxDistance = 5.5;
  charControls.maxPolarAngle = Math.PI * 0.53;

  let cfg = loadCharacter();
  let anim: AnimId = 'idle';
  let saveTimer = 0;
  const saveCharacter = () => localStorage.setItem(CHAR_KEY, JSON.stringify(cfg));

  const charPanel: Panel = new Panel(panelEl, () => cfg, () => anim, {
    change: (patch) => void setConfig({ ...cfg, ...patch }),
    anim: (id) => {
      anim = id;
      avatar.play(id);
      charPanel.sync();
    },
    random: () => void setConfig(randomConfig(cfg.sex)),
    save: () => {
      saveCharacter();
      ui.toast('Personaje guardado');
    },
    exportJson: () => {
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'personaje.json';
      a.click();
      URL.revokeObjectURL(a.href);
    },
    has: (n) => avatar.has(n),
  });

  async function setConfig(next: CharacterConfig): Promise<void> {
    const sexChanged = next.sex !== cfg.sex;
    cfg = sanitize(next);
    saveCharacter();
    club.setPlayerLook(cfg);
    if (sexChanged || !avatar.has('body_skin')) {
      await avatar.setSex(cfg.sex);
      avatar.play(anim);
      avatar.apply(cfg);
      charPanel.build();
    } else {
      avatar.apply(cfg);
      charPanel.sync();
    }
  }

  // ---------------------------------------------------------------- club
  let uiHooks: ClubHooks | null = null;
  const chat = new ChatBox(stageEl);
  // alone (no server) you can still talk: only you see it
  chat.onSend = (text) => {
    club.sayOwn(text);
    chat.add({ name: club.state.story.name || 'Yo', text, mine: true });
  };
  const save = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => localStorage.setItem(CLUB_KEY, JSON.stringify(club.state)), 300);
  };
  const club = new ClubView(canvas, {
    onChange: () => { save(); uiHooks?.onChange(); },
    onEarn: () => { save(); uiHooks?.onEarn(); },
    onMissions: (d) => { save(); uiHooks?.onMissions(d); },
    onLevelUp: (l) => uiHooks?.onLevelUp(l),
    onPhaseUp: (p) => uiHooks?.onPhaseUp(p),
    onToast: (m, k) => uiHooks?.onToast(m, k),
    onVip: (v) => uiHooks?.onVip(v),
    onJail: (m) => uiHooks?.onJail(m),
    onMode: (m) => uiHooks?.onMode(m),
  });
  club.setState(loadClub());
  let sendChore = () => {};
  const prison = new Prison(stageEl, club, () => sendChore(), () => cfg);
  // a reload must not empty the club: let the night run for a while first, without paying for it
  if (club.state.open) club.sim.warm(120);
  // the stars keep their own clock across reloads: a reload never brings one sooner
  club.sim.vipCooldown = Math.max(60, 150 - (Date.now() - (club.state.stats.vipAt || 0)) / 1000);
  club.neighbors = simulatedNeighbors(7);
  // the city server: if it is not running the game stays single-player with simulated neighbours
  let url: string | null = null;
  try {
    url = serverUrl();
  } catch {
    /* storage blocked: single-player */
  }
  if (!url) {
    // single-player (no city server configured): the old rules, with the club paying for the time away at once
    club.settleOffline();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) club.settleOffline();
    });
  }
  if (url) {
    // with a city server, the SERVER runs the club while its owner is away, and only while the server itself is up: nothing is
    // generated here when it is off (the club earns only while the game is connected)
    club.earning = false;
    const net = new Online(url, guestId(), () => club.state.story.name || 'Jugador');
    // a hidden tab (or a phone app in the background) does not run the club: tell the server so it takes over
    document.addEventListener('visibilitychange', () => net.setAway(document.hidden));
    if (document.hidden) net.setAway(true);
    net.onCity = (c) => {
      club.home = { i: c.me.i, j: c.me.j };
      club.setNeighbors(neighborsFrom(c));
      club.net = { status: 'online', online: c.online };
      club.earning = true;
      uiHooks?.onEarn();
    };
    net.onStatus = (s) => {
      const was = club.earning;
      club.net = { status: s, online: s === 'online' ? net.online : 0 };
      club.earning = s === 'online';
      if (was && !club.earning) uiHooks?.onToast('Sin conexión con el servidor: tu club no genera monedas hasta que vuelva.', 'bad');
      uiHooks?.onEarn();
    };
    const myBuild = /assets\/(index-[^"']+\.js)/.exec(document.documentElement.innerHTML)?.[1] ?? '';
    let warned = false;
    net.onClock = (now, build) => {
      club.env.cityOffsetMs = now - Date.now(); // the sky is the city's: the same hour and weather for everyone
      if (build && myBuild && build !== myBuild && !warned) {
        // the game was updated while this page was open: an old page cannot see the others properly
        warned = true;
        const bar = document.createElement('div');
        bar.className = 'update-bar';
        bar.innerHTML = '<span>Hay una versión nueva del juego.</span>';
        const b = document.createElement('button');
        b.textContent = 'Recargar ahora';
        b.onclick = () => location.reload();
        bar.append(b);
        document.body.append(bar);
      }
    };
    net.onPeers = (peers) => {
      for (const n of club.neighbors) if (n.kind === 'club' && n.n !== undefined) club.remote.names.set(n.n, n.name.replace(/^CLUB /, ''));
      club.remote.set(peers);
      club.showPresence(peers.map((p) => [p.n, p.m === 1] as [number, boolean]));
    };
    net.onRank = (r) => {
      club.rank = r;
      club.setInmates(r.jailed, r.you.n);
      club.sim.rankBoost = r.you.factor; // the city's crowd follows the ranking: the better the place, the more people at my door
      uiHooks?.onEarn();
    };
    club.onLeaveVisit = () => net.leave();
    // what the server says happened to my club: apply it, then confirm it with the next upload so it is not charged twice
    net.onMail = (mail) => {
      club.applyMail(mail);
      void cloud.sync(true, mail.map((m) => m.id));
    };
    // robberies: the screen asks the server and shows the answer
    const heistListeners = { scout: (_r: import('./net/client').ScoutReply) => {}, heist: (_r: import('./net/client').HeistReply) => {} };
    net.onScout = (r) => heistListeners.scout(r);
    net.onHeist = (r) => heistListeners.heist(r);
    club.heistApi = {
      scout: (n) => net.scout(n),
      heist: (n, want, kits, skill) => net.heist(n, want, kits, skill),
      onScout: (fn) => (heistListeners.scout = fn),
      onHeist: (fn) => (heistListeners.heist = fn),
    };
    club.launder = (uid) => net.launder(uid);
    net.onLaunder = (r) => {
      uiHooks?.onToast(r.ok ? `Pieza limpia: pagaste ${(r.price ?? 0).toLocaleString('es-CO')} a Zeta.` : r.error ?? 'No se pudo limpiar.', r.ok ? 'ok' : 'bad');
      if (r.ok) void cloud.sync(true);
    };
    net.onGuard = (r) => {
      uiHooks?.onToast(r.ok ? 'Protector antirrobos activo.' : r.error ?? 'No se pudo comprar el protector.', r.ok ? 'ok' : 'bad');
    };
    club.buyGuard = (hours) => net.buyGuard(hours);
    sendChore = () => net.doChore();
    net.onBust = (b) => {
      const text = b.ongoing
        ? `${b.name} está preso${b.victim ? ` por intentar asaltar a ${b.victim}` : ''}: lleva ${b.chores} de ${b.goal} tareas.`
        : `${b.name} fue detenido por intentar asaltar a ${b.victim || 'otro club'}.`;
      uiHooks?.onToast(`🚨 ${text}`, 'bad');
      chat.add({ name: 'Brigada del Ruido', text, mine: false });
    };
    net.onFreed = (name) => chat.add({ name: 'Brigada del Ruido', text: `${name} cumplió sus tareas y salió de prisión.`, mine: false });
    net.onChore = (r) => prison.answered(r);
    net.onCrime = (c) => {
      const wasInside = prison.inside;
      club.crime = c;
      club.enforceClosure();
      prison.update();
      if (wasInside && !prison.inside) uiHooks?.onToast('¡Saliste de prisión! Ya puedes reabrir tu club.', 'ok');
      uiHooks?.onEarn();
    };
    // a copy of the game on the server: uploaded every so often, and offered back if this browser lost its data
    const cloud = new Cloud(() => club.state);
    club.cloud = cloud;
    let restoreOffered = false;
    const offerRestore = async () => {
      if (restoreOffered || !looksFresh(club.state)) return;
      restoreOffered = true;
      const found = await cloud.peek();
      if (!found || found.meta.xp <= 0) return;
      if (!window.confirm(`Encontré una partida tuya guardada en la nube (${describeSave(found.meta)}). ¿La recupero?`)) return;
      const game = await cloud.fetchGame();
      if (!game) return;
      localStorage.setItem(CLUB_KEY, JSON.stringify(game.state));
      location.reload();
    };
    net.onStatus = ((prev) => (s) => {
      prev(s);
      if (s === 'online') void offerRestore();
    })(net.onStatus);
    window.setInterval(() => {
      if (club.resetAt > lastReset) {
        lastReset = club.resetAt;
        cloud.forceNext = true; // started over on purpose
      }
      if (net.status === 'online' && !looksFresh(club.state)) void cloud.sync();
      else if (net.status === 'online' && cloud.forceNext) void cloud.sync();
    }, 30_000);
    let lastReset = club.resetAt;
    net.onChat = (m) => {
      club.hear(m.n, m.name, m.text);
      chat.add({ name: m.name, text: m.text, mine: false });
    };
    chat.onSend = (text) => {
      net.say(text);
      club.sayOwn(text);
      chat.add({ name: club.state.story.name || 'Yo', text, mine: true });
    };
    club.music.audioBase = httpBase() ?? '';
    club.onCloudRemove = (ref) => void fetch(`${httpBase()}/audio/${ref}?pid=${guestId()}`, { method: 'DELETE' }).catch(() => {});
    net.onVisit = (v) => club.enterVisit(v);
    club.requestVisit = (n) => net.visit(n);
    net.onStatus = ((prev) => (s) => {
      prev(s);
      if (s !== 'online') {
        club.env.cityOffsetMs = null; // back to playing alone: the player's own clock again
        club.remote.clear();
      }
    })(net.onStatus);
    // the start time of the song, fixed once per song (so it does not change the message every tick)
    let startedId = '';
    let startedVal = 0;
    const startedFor = (id: string): number => {
      if (id !== startedId) {
        startedId = id;
        startedVal = Math.round(club.music.startedWall() + (club.env.cityOffsetMs ?? 0));
      }
      return startedVal;
    };
    let lastItems: unknown = null;
    const face = () => {
      const x = club.state.exterior;
      net.publish({
        name: club.state.story.name || 'Jugador', phase: club.state.phase, level: levelOf(club.state.xp).level, rating: club.rating, open: club.state.open, guests: club.guestCount,
        music: { playing: club.state.music.playing && !!club.music.track, title: club.nowPlaying ?? '', genre: club.music.genre ?? 'pop', bpm: club.music.bpm, builtin: club.music.track?.source === 'builtin', source: ['builtin', 'cloud', 'song'].includes(club.music.track?.source ?? '') ? (club.music.track!.source as 'builtin') : '', ref: ['builtin', 'cloud', 'song'].includes(club.music.track?.source ?? '') ? club.music.track!.ref : '', startedAt: startedFor(club.music.track?.id ?? '') },
        decor: club.state.decor.sel,
        ext: { paint: x.paint, awning: x.owned.includes('awning'), rope: x.owned.includes('rope'), lights: x.owned.includes('lights'), sign: x.owned.includes('sign_giant') ? 2 : x.owned.includes('sign_neon') ? 1 : 0 },
      });
      if (club.state.items !== lastItems) {
        lastItems = club.state.items; // only when the furniture really changed
        net.setLayout(club.state.items.map((i) => ({ id: i.id, x: i.x, y: i.y, rot: i.rot, tier: i.tier })));
      }
      net.setPos(club.player.x, club.player.z, club.mode === 'inside', club.emote);
      net.setLook(cfg);
      net.tick();
    };
    window.setInterval(face, 250);
    net.start();
  }
  // browsers only allow sound after a click or tap
  window.addEventListener('pointerdown', () => club.music.unlock(), { capture: true });
  window.addEventListener('keydown', () => club.music.unlock(), { capture: true });
  try {
    const raw = localStorage.getItem('nc.env.v1');
    if (raw) club.env.apply(JSON.parse(raw));
  } catch {
    /* a broken saved setting just means "real" */
  }

  // ---------------------------------------------------------------- modes
  let mode: Mode = 'club';
  const setMode = (m: Mode) => {
    mode = m;
    document.body.classList.toggle('mode-club', m === 'club');
    document.body.classList.toggle('mode-character', m === 'character');
    charControls.enabled = m === 'character';
    club.setEnabled(m === 'club');
    if (m === 'character') charPanel.build();
    window.dispatchEvent(new Event('resize'));
  };

  const backToClub = () => {
    charPanel.setFooter(null);
    setMode('club');
  };
  const ui: GameUi = new GameUi(stageEl, {
    club,
    thumbs,
    comic,
    getPlayer: () => cfg,
    createCharacter: () =>
      new Promise<void>((resolve) => {
        charPanel.setFooter('¡Listo, a la pista!', () => {
          backToClub();
          resolve();
        });
        setMode('character');
      }),
    openCharacter: () => {
      charPanel.setFooter('Volver al club', backToClub);
      setMode('character');
    },
  });
  uiHooks = ui.hooks();

  window.addEventListener('keydown', (e) => {
    if (mode !== 'club' || modalOpen() || e.target instanceof HTMLInputElement) return;
    if (document.querySelector('.dialogue, .title-screen')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') club.rotate();
    else if (k === 'escape') {
      if (club.tool.kind === 'place') club.cancelTool();
      else {
        club.selectedUid = null;
        club.setState(club.state);
        ui.refresh();
      }
    } else if (k === 'delete' || k === 'backspace') club.sellSelected();
    else if (k === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      club.undo();
    } else if (k === 'q') club.rotateView(-1);
    else if (k === 'e') club.rotateView(1);
    else if (k === 't') ui.openShop();
    else if (k === 'i') ui.openInventory();
    else if (k === 'm') ui.openMissions();
  });

  // ---------------------------------------------------------------- sizing & loop
  const resize = () => {
    const w = Math.max(1, stageEl.clientWidth);
    const h = Math.max(1, stageEl.clientHeight);
    effect.setSize(w, h);
    charCamera.aspect = club.camera.aspect = w / h;
    charCamera.updateProjectionMatrix();
    club.camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stageEl);
  resize();
  club.resetView(); // frame the building for the real window shape

  await Promise.all([avatar.setSex(cfg.sex), club.crowd.init()]);
  avatar.apply(cfg);
  avatar.play(anim);
  club.setPlayerLook(cfg);
  setMode('club');
  loading.remove();

  // graphics quality: chosen in the menu, or adjusted by itself when the computer cannot keep up
  let q: Settings = TIERS[tier0];
  const governor = new Governor(tier0, getPreference() === 'auto');
  const applyTier = (t: keyof typeof TIERS) => {
    q = TIERS[t];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    resize();
    club.setQuality(q);
  };
  applyTier(tier0);
  governor.onChange = (t) => {
    applyTier(t);
    uiHooks?.onToast(`Bajé los gráficos a "${t === 'medium' ? 'Medio' : 'Bajo'}" para que el juego vaya más fluido. Puedes cambiarlo en el menú.`, 'ok');
  };
  const draw = (scene: THREE.Scene, camera: THREE.Camera) => (q.outline ? effect.render(scene, camera) : renderer.render(scene, camera));
  const clock = new THREE.Clock();
  let sinceDraw = 0;
  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.1);
    governor.frame(raw);
    sinceDraw += raw;
    if (q.fpsCap && sinceDraw < 1 / q.fpsCap - 0.004) return; // a modest computer is spared half the frames
    const step = Math.min(sinceDraw, 0.1);
    sinceDraw = 0;
    if (mode === 'club') {
      club.update(q.fpsCap ? step : dt, clock.elapsedTime);
      draw(club.scene, club.camera);
    } else {
      avatar.update(dt);
      stage.update(clock.elapsedTime);
      charControls.update();
      draw(stage.scene, charCamera);
    }
  });

  // Hooks so automated checks can drive the app: only with ?e2e in the address (never for players).
  if (new URLSearchParams(location.search).has('e2e')) (window as unknown as Record<string, unknown>).__nc = {
    ready: true,
    setMode,
    setConfig: (c: CharacterConfig) => setConfig(c),
    getConfig: () => cfg,
    setAnim: (id: AnimId) => {
      anim = id;
      avatar.play(id);
      charPanel.sync();
    },
    club,
    ui,
    comic,
    catalogIds: CATALOG.map((d) => d.id),
  };

  await ui.start();
}

main().catch((err) => {
  console.error(err);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'No se pudo cargar: ' + (err instanceof Error ? err.message : String(err));
});
