import type { CharacterConfig } from '../core/character';
import { VIP_CHECK_COST, type Vip } from '../core/guests';
import { levelOf, titleFor } from '../core/progression';
import { canOpen, owned } from '../core/club';
import type { Neighbor } from '../core/world';
import { SCENES, activeMissions, markSeen, pendingScene, type Mission } from '../core/story';
import type { ClubHooks, ClubView } from '../render/club';
import { SHOT_FILTER, type ComicStudio } from '../render/comic';
import type { Thumbs } from '../render/thumbs';
import { playScene } from './dialogue';
import { el, button } from './dom';
import { icon } from './icons';
import { Coach } from './coach';
import { ContextBar } from './contextbar';
import { Hud } from './hud';
import { openFacade } from './facade';
import { openOffice } from './office';
import { openMenu } from './menu';
import { mountMinimap } from './minimap';
import { openMusic } from './music';
import { openUnlocks } from './unlocks';
import { openHeist } from './heist';
import { openMissions, rewardText } from './missionsModal';
import { closeModals, modalOpen } from './modal';
import { NPC_LOOKS } from '../core/npcs';
import { openCatalog, type Ctx } from './shop';
import { showTitle } from './title';
import { Tips } from './tips';
import { perksOfStaff } from '../core/staff';
import { openNews } from './news';
import { openEmotes } from './emotes';
import { openRanking } from './ranking';
import { arrestScene } from '../core/arrest';
import type { Mail } from '../core/mail';
import { LATEST_NEWS, newsById } from '../core/news';

export interface GameDeps {
  club: ClubView;
  thumbs: Thumbs;
  comic: ComicStudio;
  getPlayer(): CharacterConfig;
  /** open the character creator and resolve when the player is done (used right after the title screen) */
  createCharacter(): Promise<void>;
  openCharacter(): void;
}

/** Everything the player sees on top of the 3D club: HUD, menus, tutorial pointers, story scenes. */
export class GameUi {
  readonly ctx: Ctx;
  private hud: Hud;
  private context: ContextBar;
  private toasts = el('div', 'toasts');
  private buttons: Record<string, HTMLButtonElement> = {};
  private badges: Record<string, HTMLElement> = {};
  private listeners = new Set<() => void>();
  private playing = false;
  private coach: Coach;
  private tips!: Tips;

  constructor(private stage: HTMLElement, private deps: GameDeps) {
    const club = deps.club;
    this.ctx = {
      club,
      thumbs: deps.thumbs,
      toast: (m, k) => this.toast(m, k),
      subscribe: (fn) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
      },
      openShop: () => this.openShop(),
    };

    this.coach = new Coach(club, deps.thumbs);
    this.tips = new Tips(club, stage);
    this.hud = new Hud({ openMissions: () => this.openMissions(), openMenu: () => this.openMenu(), openMusic: () => openMusic(this.ctx), openRanking: () => openRanking(this.ctx) });
    this.context = new ContextBar(club);

    // floating view controls
    const controls = el('div', 'view-controls');
    const mk = (ic: string, label: string, fn: () => void, cls = '') => {
      const b = button('', `round-btn ${cls}`, fn);
      b.innerHTML = icon(ic);
      b.title = label;
      b.setAttribute('aria-label', label);
      controls.append(b);
      return b;
    };
    mk('rotate', 'Girar vista a la izquierda (Q)', () => club.rotateView(-1), 'flip');
    mk('rotate', 'Girar vista a la derecha (E)', () => club.rotateView(1));
    mk('center', 'Centrar la vista', () => club.resetView());
    mk('undo', 'Deshacer (Ctrl+Z)', () => club.undo());
    mk('dance', 'Bailar (B)', () => openEmotes(this.ctx));
    const eye = mk('eye', 'Mostrar u ocultar invitados', () => club.toggleGuests());
    eye.dataset.role = 'guests';

    // bottom bar
    const bar = el('nav', 'bottombar');
    const add = (id: string, label: string, ic: string, fn: () => void) => {
      const b = button('', 'bb', fn);
      b.dataset.id = id;
      b.innerHTML = `${icon(ic)}<span>${label}</span>`;
      const badge = el('i', 'badge');
      b.append(badge);
      this.buttons[id] = b;
      this.badges[id] = badge;
      bar.append(b);
    };
    add('open', 'Abrir club', 'door', () => this.toggleOpen());
    add('shop', 'Tienda', 'shop', () => this.openShop());
    add('inventory', 'Inventario', 'inventory', () => this.openInventory());
    add('missions', 'Misiones', 'missions', () => this.openMissions());
    add('office', 'Oficina', 'monitor', () => openOffice(this.ctx, () => this.openFacade()));
    add('street', 'Salir', 'street', () => deps.club.toggleMode());
    add('character', 'Personaje', 'character', () => deps.openCharacter());

    stage.append(this.hud.root, this.context.root, controls, bar, this.toasts);
    const tickSky = () => {
      const d = deps.club.env.describe();
      this.hud.updateSky(d.hour, d.weather, d.night);
    };
    tickSky();
    setInterval(tickSky, 1000);
    stage.classList.add('game-ui-host');
    mountMinimap(stage, deps.club);
    deps.club.onNeighborClick = (nb) => this.showNeighbor(nb);
    deps.club.onVisitChange = (v) => this.showVisit(v);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && deps.club.visiting) deps.club.leaveVisit();
      // B opens the dances (not while typing in the chat or with a window open)
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if ((e.key === 'b' || e.key === 'B') && !typing && !modalOpen() && !e.ctrlKey && !e.metaKey) openEmotes(this.ctx);
    });
  }

  // ---- hooks the club view calls --------------------------------------------------------------
  hooks(): ClubHooks {
    return {
      onChange: () => {
        this.refresh();
      },
      onEarn: () => {
        this.refresh();
      },
      onMissions: (done) => this.missionsDone(done),
      onLevelUp: (level) => {
        this.toast(`¡Nivel ${level}! ${titleFor(level)}`, 'level');
        this.showUnlocks(level);
      },
      onPhaseUp: () => void this.playPending(),
      onToast: (m, k) => this.toast(m, k ?? 'bad'),
      onVip: (v) => this.showVip(v),
      onJail: (m) => void this.playArrest(m),
      onMode: () => this.refresh(),
    };
  }

  // ---- screens -------------------------------------------------------------------------------
  openFacade(): void {
    this.deps.club.goOutsideNow(); // so the changes show behind the window
    openFacade(this.ctx);
  }

  openShop(): void {
    openCatalog(this.ctx, 'shop');
  }

  /** The door button: open the club for business, or close it. */
  toggleOpen(): void {
    this.deps.club.setOpen(!this.deps.club.state.open);
  }

  openInventory(): void {
    openCatalog(this.ctx, 'inventory');
  }

  openMissions(): void {
    openMissions(this.ctx);
  }

  openMenu(): void {
    openMenu({
      ctx: this.ctx,
      replayIntro: () => void this.replay('intro'),
      restart: () => {
        closeModals();
        this.coach.stop();
        this.deps.club.reset();
        void this.start();
      },
    });
  }

  // ---- story ---------------------------------------------------------------------------------
  /** New game: title, character creator, opening scene. Otherwise just catches up on any unseen chapter scene. */
  async start(): Promise<void> {
    const club = this.deps.club;
    const fresh = !club.state.story.intro;
    if (fresh) {
      club.paused = true;
      document.body.classList.add('onboarding');
      const name = await showTitle(club.state.story.name);
      club.patchState((s) => ({ ...s, story: { ...s.story, name } }));
      await this.deps.createCharacter();
    }
    this.refresh();
    await this.playPending();
    document.body.classList.remove('onboarding');
    club.paused = false;
    await this.coach.start(club.state.story.name || 'DJ');
    this.announce(fresh);
  }

  /** The "novedades" window, once per release, for players who were here before it. */
  private announce(fresh: boolean): void {
    const club = this.deps.club;
    if (club.state.story.news === LATEST_NEWS) return;
    const mark = () => club.patchState((s) => ({ ...s, story: { ...s.story, news: LATEST_NEWS } }));
    if (fresh) return mark(); // a new player sees everything anyway
    const news = newsById(LATEST_NEWS);
    if (!news) return mark();
    const tryOpen = () => {
      const b = document.body.classList;
      if (b.contains('in-scene') || b.contains('coaching') || b.contains('onboarding') || modalOpen()) return void setTimeout(tryOpen, 4000);
      openNews(this.ctx, news, mark);
    };
    setTimeout(tryOpen, 2500);
  }

  private env() {
    const club = this.deps.club;
    const name = club.state.story.name || 'DJ';
    const shotEnv = () => ({ player: this.deps.getPlayer(), name });
    return {
      name,
      portrait: async (who: string) => {
        const cfg = who === 'you' ? this.deps.getPlayer() : NPC_LOOKS[who];
        return cfg ? this.deps.thumbs.portrait(who, cfg) : null;
      },
      shot: (id: string) => this.deps.comic.shot(id, shotEnv()),
      prefetch: (ids: string[]) => this.deps.comic.prefetch(ids, shotEnv()),
      filter: (id: string) => SHOT_FILTER[id],
    };
  }

  /** The arrest scene: the Brigada takes the thief away, showing what was taken (or attempted), from whom and how. */
  private async playArrest(m: Mail): Promise<void> {
    while (this.playing) await new Promise((r) => setTimeout(r, 1500));
    this.playing = true;
    try {
      closeModals();
      document.body.classList.add('in-scene');
      this.deps.club.paused = true;
      await playScene(arrestScene(m, this.deps.club.state.story.name || 'DJ'), this.env());
    } finally {
      this.playing = false;
      document.body.classList.remove('in-scene');
      this.deps.club.paused = document.body.classList.contains('onboarding');
    }
  }

  /** Play every story scene that is due and has not been seen yet. */
  async playPending(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      document.body.classList.add('in-scene');
      this.deps.club.paused = true;
      for (let scene = pendingScene(this.deps.club.state); scene; scene = pendingScene(this.deps.club.state)) {
        const motive = await playScene(scene, this.env());
        void motive;
        const id = scene.id;
        this.deps.club.patchState((s) => markSeen(s, id));
      }
    } finally {
      this.playing = false;
      document.body.classList.remove('in-scene');
      this.deps.club.paused = document.body.classList.contains('onboarding');
    }
    this.refresh();
  }

  private async replay(id: string): Promise<void> {
    const scene = SCENES.find((s) => s.id === id);
    if (!scene) return;
    document.body.classList.add('in-scene');
    await playScene(scene, this.env());
    document.body.classList.remove('in-scene');
  }

  // ---- feedback ------------------------------------------------------------------------------
  toast(message: string, kind: 'ok' | 'bad' | 'level' | 'mission' = 'ok', ms = 2600): void {
    for (const old of [...this.toasts.children]) if (old.textContent === message) old.remove();
    const t = el('div', `toast ${kind}`, message);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  private missionsDone(done: Mission[]): void {
    for (const m of done) {
      const t = el('div', 'toast mission-toast');
      t.append(el('small', '', '¡Misión cumplida!'), el('b', '', m.title));
      const reward = rewardText(m.reward);
      if (reward) t.append(el('span', '', reward));
      this.toasts.append(t);
      setTimeout(() => {
        t.classList.add('out');
        setTimeout(() => t.remove(), 300);
      }, 4200);
    }
    this.refresh();
  }

  // ---- what a new level opened ------------------------------------------------------------------
  private seenLevel = 0;

  /** After a level-up (or several at once): the pop-up with everything that just opened, once any story scene is done. */
  private showUnlocks(level: number, tries = 0): void {
    const from = this.seenLevel || level - 1;
    if (document.querySelector('.dialogue') && tries < 40) return void setTimeout(() => this.showUnlocks(level, tries + 1), 1500);
    this.seenLevel = level;
    setTimeout(() => {
      openUnlocks(this.ctx, from, level, (where) => {
        const club = this.deps.club;
        if (where === 'shop') this.openShop();
        else if (where === 'facade') this.openFacade();
        else if (where === 'building') club.goInsideNow();
        else if (where === 'dance') openEmotes(this.ctx);
        else openOffice(this.ctx, () => this.openFacade());
      });
    }, 900);
  }

  // ---- other players' clubs ---------------------------------------------------------------------
  private neighborCard: HTMLElement | null = null;
  private visitBanner: HTMLElement | null = null;

  private showNeighbor(nb: Neighbor): void {
    this.neighborCard?.remove();
    this.neighborCard = null;
    if (nb.kind !== 'club' || nb.n === undefined) return;
    const club = this.deps.club;
    const card = el('div', 'vip-card neighbor-card');
    card.append(el('small', '', nb.online ? 'Jugador en línea' : 'Jugador ausente'), el('b', '', nb.name));
    card.append(el('span', 'vip-claim', `Nivel ${nb.level ?? 1} · Ambiente ${nb.rating ?? 0} · ${nb.open ? 'Abierto' : 'Cerrado'}`));
    card.append(el('span', 'vip-claim', nb.open && nb.music?.playing ? `♪ Suena: ${nb.music.title || 'música'}` : nb.open ? '♪ Sin música' : ''));
    const row = el('div', 'vip-actions');
    const go = button('Entrar a ver su club', 'vip-admit', () => {
      card.remove();
      this.neighborCard = null;
      club.requestVisit(nb.n as number);
    });
    const rob = button('Asaltar', 'vip-reject', () => {
      card.remove();
      this.neighborCard = null;
      if (club.heistApi) openHeist(this.ctx, nb.n as number, club.heistApi);
    });
    row.append(go, rob, button('Cerrar', 'vip-reject', () => { card.remove(); this.neighborCard = null; }));
    card.append(row);
    this.neighborCard = card;
    this.stage.append(card);
  }

  private showVisit(v: { n: number; name: string } | null): void {
    this.visitBanner?.remove();
    this.visitBanner = null;
    document.body.classList.toggle('visiting', !!v);
    if (!v) return;
    const b = el('div', 'visit-banner');
    b.append(el('span', '', `Visitando ${v.name}`), button('Volver a mi club', 'vip-admit', () => this.deps.club.leaveVisit()));
    this.visitBanner = b;
    this.stage.append(b);
  }

  // ---- VIP at the door -----------------------------------------------------------------------
  private vipCard: HTMLElement | null = null;

  private showVip(v: { id: number; vip: Vip } | null): void {
    this.vipCard?.remove();
    this.vipCard = null;
    if (!v) return;
    const club = this.deps.club;
    const card = el('div', 'vip-card');
    card.append(el('small', '', '★ Alguien famoso en la puerta'));
    card.append(el('b', '', v.vip.name));
    card.append(el('span', 'vip-claim', `Dice que es ${v.vip.title}.`));
    if (!v.vip.checked) {
      card.append(el('span', 'vip-hint', '¿Será verdad? Puedes investigar antes de dejarlo pasar.'));
    } else {
      if (perksOfStaff(club.state).checksVips) card.append(el('span', 'vip-hint', 'Tu guardia ya lo investigó.'));
      card.append(
        el('span', v.vip.real ? 'vip-verdict real' : 'vip-verdict fake', v.vip.real ? '✓ Es de verdad: gasta mucho y atrae más gente. Déjalo pasar.' : '✕ Es un farsante: se cuela y te cuesta dinero. Recházalo.'),
      );
    }
    const row = el('div', 'vip-actions');
    if (!v.vip.checked) row.append(button(`Investigar · ${VIP_CHECK_COST}`, 'vip-check', () => club.checkVip()));
    row.append(button('Dejar pasar', 'vip-admit', () => club.admitVip()), button('Rechazar', 'vip-reject', () => club.rejectVip()));
    card.append(row);
    this.vipCard = card;
    this.stage.append(card);
  }

  // ---- refresh -------------------------------------------------------------------------------
  refresh(): void {
    const club = this.deps.club;
    const s = club.state;
    this.hud.update(s, club.guestCount, club.roomCapacity, club.queueCount, club.rating, club.nowPlaying, club.net, club.crime, club.rank?.you ?? null);
    if (!this.seenLevel) this.seenLevel = levelOf(s.xp).level; // what is already open is not news
    const missions = activeMissions(s, 9);
    this.hud.updateTracker(missions);
    this.context.update();

    const outside = club.mode === 'outside';
    const streetLabel = this.buttons.street.querySelector('span');
    if (streetLabel) streetLabel.textContent = outside ? 'Entrar' : 'Salir';
    this.buttons.street.title = outside ? 'Entrar al club' : 'Salir a la calle';
    document.body.classList.toggle('outside', outside);
    const openBtn = this.buttons.open;
    openBtn.classList.toggle('is-open', s.open);
    openBtn.classList.toggle('ready', !s.open && canOpen(s).ok);
    const label = openBtn.querySelector('span');
    if (label) label.textContent = s.open ? 'Cerrar club' : 'Abrir club';
    const invCount = Object.values(s.inventory).reduce((a, n) => a + n, 0);
    this.setBadge('inventory', invCount);
    // tutorial pointer: after something is bought, the inventory is where to go; otherwise the shop
    const needsPlacing = missions[0] && ['placed', 'tiles', 'seats', 'luxury'].includes(missions[0].mission.goal.kind);
    this.buttons.inventory.classList.toggle('pulse', needsPlacing && invCount > 0 && club.tool.kind === 'select');
    this.buttons.shop.classList.toggle('pulse', needsPlacing && invCount === 0 && club.tool.kind === 'select' && levelOf(s.xp).level <= 6);
    const eye = this.stage.querySelector<HTMLElement>('[data-role="guests"]');
    eye?.classList.toggle('off', !club.showGuests);
    for (const fn of this.listeners) fn();
    this.tips.update();
  }

  private setBadge(id: string, n: number): void {
    const b = this.badges[id];
    b.textContent = n > 9 ? '9+' : String(n);
    b.style.display = n > 0 ? '' : 'none';
  }

  /** Used by tests: how many copies of an object the player holds. */
  held(id: string): number {
    return owned(this.deps.club.state, id);
  }
}
