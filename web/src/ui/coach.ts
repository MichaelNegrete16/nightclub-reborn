import { BY_ID } from '../core/catalog';
import { NPC_LOOKS } from '../core/npcs';
import type { ClubState } from '../core/club';
import type { ClubView } from '../render/club';
import type { Thumbs } from '../render/thumbs';
import { button, el } from './dom';

// Rosa's guided tutorial: the first steps of building your own club, one click at a time.
// A step shows what to do, rings the exact button to press, and moves on by itself when you have done it.
// It only looks at the game (state and open windows), never takes control.

interface Facts {
  s: ClubState;
  shop: boolean;
  inv: boolean;
  /** id of the card selected in the open window */
  card: string | null;
  /** id of the object being placed right now */
  placing: string | null;
  tiles: number;
  tilesOwned: number;
  booth: boolean;
  bar: boolean;
}

type Target = string | { cell: [number, number, number, number] };

interface Step {
  id: string;
  text: (f: Facts) => string;
  /** the first target that exists is ringed */
  targets?: Target[];
  /** a story beat with a button instead of an action */
  say?: boolean;
  done: (f: Facts) => boolean;
  skip?: (f: Facts) => boolean;
}

const SHOP_BTN = '.bb[data-id="shop"]';
const INV_BTN = '.bb[data-id="inventory"]';
const tilesReady = (f: Facts) => f.tiles + f.tilesOwned >= 4;
const needShop = (f: Facts, text: string) => (f.shop ? text : 'Abre la **Tienda**.');
const needInv = (f: Facts, text: string) => (f.inv || f.placing ? text : 'Abre el **Inventario**.');

export const STEPS: Step[] = [
  { id: 'open_shop', text: () => 'Empecemos por la pista de baile. Abre la **Tienda**.', targets: [SHOP_BTN], done: (f) => f.shop, skip: tilesReady },
  {
    id: 'pick_tile',
    text: (f) => needShop(f, 'Elige la **Baldosa cian**: es el piso de baile.'),
    targets: ['.modal.shop .card[data-id="floor_cyan"]', SHOP_BTN],
    done: (f) => f.card === 'floor_cyan' && f.shop,
    skip: tilesReady,
  },
  {
    id: 'buy_tiles',
    text: (f) => needShop(f, 'Cada baldosa cuesta 50 monedas. Pulsa **Comprar** hasta tener 4.'),
    targets: ['.modal.shop button[data-action="buy"]', SHOP_BTN],
    done: tilesReady,
  },
  {
    id: 'close_shop',
    text: () => 'Perfecto. Cierra la tienda: lo que compras se guarda en tu **Inventario**.',
    targets: ['.modal.shop .modal-head .icon-btn'],
    done: (f) => !f.shop,
    skip: (f) => f.tiles >= 4 || f.inv,
  },
  { id: 'open_inv', text: () => 'Abre el **Inventario**.', targets: [INV_BTN], done: (f) => f.inv || f.placing !== null, skip: (f) => f.tiles >= 4 },
  {
    id: 'pick_place',
    text: (f) => needInv(f, 'Elige las baldosas y pulsa **Colocar**.'),
    targets: ['.modal.inventory button[data-action="place"]', '.modal.inventory .card[data-id="floor_cyan"]', INV_BTN],
    done: (f) => f.placing === 'floor_cyan' || f.tiles >= 4,
    skip: (f) => f.tiles >= 4,
  },
  {
    id: 'place_tiles',
    text: () => 'Toca el piso para ponerlas. Coloca las 4. Con **R** las giras.',
    targets: [{ cell: [3, 3, 2, 2] }],
    done: (f) => f.tiles >= 4,
  },
  {
    id: 'say_booth',
    say: true,
    text: () => '¡Eso ya es una pista! Ahora falta el corazón del club: la cabina de tu tío.',
    done: () => false,
    skip: (f) => f.booth || f.inv || f.placing === 'dj_booth',
  },
  { id: 'open_inv2', text: () => 'Abre el **Inventario**: ahí te dejó su cabina.', targets: [INV_BTN], done: (f) => f.inv || f.placing === 'dj_booth', skip: (f) => f.booth },
  {
    id: 'pick_booth',
    text: (f) => needInv(f, 'Elige la **Cabina DJ** y pulsa **Colocar**.'),
    targets: ['.modal.inventory button[data-action="place"]', '.modal.inventory .card[data-id="dj_booth"]', INV_BTN],
    done: (f) => f.placing === 'dj_booth' || f.booth,
    skip: (f) => f.booth,
  },
  {
    id: 'place_booth',
    text: () => 'Colócala pegada a la pared del fondo.',
    targets: [{ cell: [5, 0, 2, 1] }],
    done: (f) => f.booth,
  },
  {
    id: 'say_bar',
    say: true,
    text: () => 'Ahora la barra: ahí está la plata del club. Cuesta 3.000 y ya te alcanza.',
    done: () => false,
    skip: (f) => f.bar || f.shop || f.placing === 'bar_straight',
  },
  { id: 'open_shop2', text: () => 'Abre la **Tienda**.', targets: [SHOP_BTN], done: (f) => f.shop || f.placing === 'bar_straight', skip: (f) => f.bar },
  {
    id: 'pick_bar',
    text: (f) => needShop(f, 'Busca la **Barra recta** y elígela. Está en la categoría Barras.'),
    targets: ['.modal.shop .card[data-id="bar_straight"]', SHOP_BTN],
    done: (f) => f.card === 'bar_straight' || f.placing === 'bar_straight' || f.bar,
    skip: (f) => f.bar,
  },
  {
    id: 'buy_place_bar',
    text: (f) => needShop(f, 'Pulsa **Comprar y colocar**.'),
    targets: ['.modal.shop button[data-action="buy-place"]', '.modal.shop .card[data-id="bar_straight"]', SHOP_BTN],
    done: (f) => f.placing === 'bar_straight' || f.bar,
    skip: (f) => f.bar,
  },
  {
    id: 'place_bar',
    text: () => 'Ponla contra la pared, y deja libre el espacio de adelante: ahí se paran los clientes.',
    targets: [{ cell: [1, 0, 3, 1] }],
    done: (f) => f.bar,
  },
  {
    id: 'open_club',
    text: () => '¡Pista, cabina y barra! Ahora **abre el club**: si está cerrado no entra nadie. Pulsa el botón de la puerta.',
    targets: ['.bb[data-id="open"]'],
    done: (f) => f.s.open,
    skip: (f) => f.s.open,
  },
  {
    id: 'say_end',
    say: true,
    text: () => '¡Club abierto! Mira entrar a tus primeros invitados: pagan cover, bailan y beben. Desde aquí te guían las **misiones** de arriba. Yo me quedo cerca.',
    done: () => false,
  },
];

const bold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/** The tutorial controller: a small card with Rosa, and a pulsing ring on the thing to press. */
export class Coach {
  private card = el('div', 'coach');
  private face = el('img', 'coach-face') as HTMLImageElement;
  private body = el('p', 'coach-text');
  private actions = el('div', 'coach-actions');
  private ring = el('div', 'coach-ring');
  private index = -1;
  private raf = 0;
  private ringKey = '';
  private lastAdvance = 0;
  private ended = true;
  private name = 'DJ';

  constructor(private club: ClubView, private thumbs: Thumbs) {
    const text = el('div', 'coach-body');
    text.append(el('b', 'coach-name', 'Rosa'), this.body, this.actions);
    this.card.append(this.face, text);
    this.card.style.display = 'none';
    this.ring.style.display = 'none';
    document.body.append(this.card, this.ring);
  }

  /** Begin or resume. Players who already built the basics are not nagged. */
  async start(name: string): Promise<void> {
    this.name = name;
    const s = this.club.state;
    if (s.story.tutorial < 0 || s.story.tutorial >= STEPS.length || s.story.done.includes('bar')) {
      this.stop();
      return;
    }
    if (!this.face.src) this.face.src = await this.thumbs.portrait('rosa', NPC_LOOKS.rosa);
    this.index = s.story.tutorial;
    this.ended = false;
    this.show();
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.update();
    };
    tick();
  }

  stop(): void {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.card.style.display = 'none';
    this.ring.style.display = 'none';
    document.body.classList.remove('coaching');
  }

  /** Where the tutorial is now (used by tests). */
  current(): string | null {
    return this.ended ? null : STEPS[this.index]?.id ?? null;
  }

  private facts(): Facts {
    const s = this.club.state;
    const floors = s.items.filter((i) => BY_ID.get(i.id)?.layer === 'floor').length;
    const tool = this.club.tool;
    const sel = document.querySelector<HTMLElement>('.modal .card.on');
    return {
      s,
      shop: !!document.querySelector('.modal.shop'),
      inv: !!document.querySelector('.modal.inventory'),
      card: sel?.dataset.id ?? null,
      placing: tool.kind === 'place' ? tool.defId : null,
      tiles: floors,
      tilesOwned: s.inventory.floor_cyan ?? 0,
      booth: s.story.done.includes('booth') || s.items.some((i) => i.id === 'dj_booth'),
      bar: s.story.done.includes('bar') || s.items.some((i) => i.id === 'bar_straight'),
    };
  }

  private advance(): void {
    this.index++;
    this.lastAdvance = performance.now();
    this.club.patchState((s) => ({ ...s, story: { ...s.story, tutorial: this.index >= STEPS.length ? STEPS.length : this.index } }));
    if (this.index >= STEPS.length) return this.stop();
    this.ringKey = '';
    this.show();
  }

  private skipAll(): void {
    this.club.patchState((s) => ({ ...s, story: { ...s.story, tutorial: -1 } }));
    this.stop();
  }

  private update(): void {
    if (this.ended) return;
    const hidden = document.body.classList.contains('in-scene') || document.body.classList.contains('mode-character') || document.body.classList.contains('onboarding');
    this.card.style.display = hidden ? 'none' : '';
    document.body.classList.toggle('coaching', !hidden);
    if (hidden) {
      this.ring.style.display = 'none';
      return;
    }
    const step = STEPS[this.index];
    if (!step) return this.stop();
    const f = this.facts();
    const settled = performance.now() - this.lastAdvance > 450; // let a step be read before it can complete
    if (step.skip?.(f)) return this.advance();
    if (!step.say && settled && step.done(f)) return this.advance();
    this.body.innerHTML = bold(step.text(f).replace('{name}', this.name));
    this.placeRing(step);
  }

  private show(): void {
    const step = STEPS[this.index];
    if (!step) return;
    this.actions.replaceChildren();
    if (step.say) {
      const last = this.index === STEPS.length - 1;
      this.actions.append(button(last ? '¡Vamos!' : 'Seguir', 'btn primary', () => this.advance()));
    } else {
      this.actions.append(button('Saltar tutorial', 'coach-skip', () => this.skipAll()));
    }
    this.body.innerHTML = bold(step.text(this.facts()));
  }

  private placeRing(step: Step): void {
    if (!step.targets) {
      this.ring.style.display = 'none';
      return;
    }
    for (const t of step.targets) {
      let rect: { x: number; y: number; w: number; h: number } | null = null;
      let round = false;
      let key = '';
      if (typeof t === 'string') {
        const node = document.querySelector<HTMLElement>(t);
        if (!node) continue;
        key = t;
        if (this.ringKey !== key) node.scrollIntoView({ block: 'nearest' });
        const b = node.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        rect = { x: b.left, y: b.top, w: b.width, h: b.height };
      } else {
        const [cx, cy, w, d] = t.cell;
        const p = this.club.cellToScreen(cx + (w - 1) / 2, cy + (d - 1) / 2);
        const size = 70 + (w + d) * 16;
        rect = { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size };
        round = true;
        key = `cell:${cx},${cy}`;
      }
      this.ringKey = key;
      const pad = 6;
      Object.assign(this.ring.style, {
        display: 'block',
        left: `${rect.x - pad}px`,
        top: `${rect.y - pad}px`,
        width: `${rect.w + pad * 2}px`,
        height: `${rect.h + pad * 2}px`,
        borderRadius: round ? '50%' : '16px',
      });
      return;
    }
    this.ring.style.display = 'none';
  }
}
