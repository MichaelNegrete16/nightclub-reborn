import {
  ANIMATIONS, CLOTH_COLORS, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES,
  type AnimId, type CharacterConfig,
} from '../core/character';

export interface PanelActions {
  change(patch: Partial<CharacterConfig>): void;
  anim(id: AnimId): void;
  random(): void;
  save(): void;
  exportJson(): void;
  has(nodeName: string): boolean;
}

const SHOE_COLORS = ['#f4f4f8', '#1b1f3a', '#e6199c', '#12b8e6', '#f2c40d', '#e63a2e'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Control panel. `build()` creates the controls; `sync()` only refreshes their selected state (cheap, safe while dragging). */
export class Panel {
  private updaters: Array<() => void> = [];
  private footer: { label: string; run: () => void } | null = null;

  constructor(
    private root: HTMLElement,
    private cfg: () => CharacterConfig,
    private anim: () => AnimId,
    private a: PanelActions,
  ) {}

  build(): void {
    this.root.replaceChildren();
    this.updaters = [];
    const title = el('h1', 'title', 'Tu personaje');
    this.root.append(title);

    this.section('Cuerpo', (box) =>
      this.chips(box, [{ id: 'male', label: 'Hombre' }, { id: 'female', label: 'Mujer' }],
        (id) => this.cfg().sex === id, (id) => this.a.change({ sex: id as CharacterConfig['sex'] })));

    this.section('Piel', (box) =>
      this.swatches(box, SKIN_TONES, () => this.cfg().skin, (c) => this.a.change({ skin: c })));

    this.section('Peinado', (box) => {
      this.chips(box, HAIR_STYLES, (id) => this.cfg().hairStyle === id, (id) => this.a.change({ hairStyle: id }));
      box.append(el('div', 'sub', 'Color de pelo'));
      this.swatches(box, HAIR_COLORS, () => this.cfg().hairColor, (c) => this.a.change({ hairColor: c }));
    });

    this.section('Ojos', (box) =>
      this.swatches(box, EYE_COLORS, () => this.cfg().eyeColor, (c) => this.a.change({ eyeColor: c })));

    this.section('Parte de arriba', (box) => {
      this.chips(box, [{ id: 'tshirt', label: 'Camiseta' }, { id: 'hoodie', label: 'Sudadera' }],
        (id) => this.cfg().top === id, (id) => this.a.change({ top: id as CharacterConfig['top'] }));
      this.swatches(box, CLOTH_COLORS, () => this.cfg().topColor, (c) => this.a.change({ topColor: c }));
    });

    this.section('Parte de abajo', (box) => {
      const opts = [{ id: 'jeans', label: 'Jeans' }];
      if (this.a.has('bottom_skirt')) opts.push({ id: 'skirt', label: 'Falda' });
      this.chips(box, opts, (id) => this.cfg().bottom === id, (id) => this.a.change({ bottom: id as CharacterConfig['bottom'] }));
      this.swatches(box, CLOTH_COLORS, () => this.cfg().bottomColor, (c) => this.a.change({ bottomColor: c }));
    });

    this.section('Zapatos', (box) =>
      this.swatches(box, SHOE_COLORS, () => this.cfg().shoesColor, (c) => this.a.change({ shoesColor: c })));

    this.section('Accesorios', (box) => {
      this.toggle(box, 'Gorra', () => this.cfg().cap, (v) => this.a.change({ cap: v }));
      this.toggle(box, 'Lentes de sol', () => this.cfg().glasses, (v) => this.a.change({ glasses: v }));
      const capColors = el('div');
      this.swatches(capColors, CLOTH_COLORS, () => this.cfg().capColor, (c) => this.a.change({ capColor: c }));
      box.append(el('div', 'sub', 'Color de la gorra'), capColors);
    });

    this.section('Animación', (box) =>
      this.chips(box, ANIMATIONS, (id) => this.anim() === id, (id) => this.a.anim(id as AnimId)));

    const actions = el('div', 'actions');
    const mk = (label: string, fn: () => void, cls = '') => {
      const b = el('button', `btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', fn);
      actions.append(b);
    };
    mk('Aleatorio', () => this.a.random());
    mk('Guardar', () => this.a.save(), 'primary');
    mk('Exportar JSON', () => this.a.exportJson());
    this.root.append(actions);
    if (this.footer) {
      const f = this.footer;
      const done = el('button', 'btn primary big', f.label);
      done.type = 'button';
      done.addEventListener('click', f.run);
      this.root.append(done);
    }

    this.sync();
  }

  /** A big button at the bottom ("Back to the club", "Ready!"). Pass null to remove it. */
  setFooter(label: string | null, run: () => void = () => {}): void {
    this.footer = label ? { label, run } : null;
    this.build();
  }

  sync(): void {
    for (const u of this.updaters) u();
  }

  private section(title: string, fill: (box: HTMLElement) => void): void {
    const sec = el('section', 'sec');
    sec.append(el('h2', '', title));
    const box = el('div', 'box');
    fill(box);
    sec.append(box);
    this.root.append(sec);
  }

  private chips(box: HTMLElement, items: ReadonlyArray<{ id: string; label: string }>, active: (id: string) => boolean, pick: (id: string) => void): void {
    const wrap = el('div', 'chips');
    const buttons = items.map((it) => {
      const b = el('button', 'chip', it.label);
      b.type = 'button';
      b.addEventListener('click', () => pick(it.id));
      wrap.append(b);
      return { b, id: it.id };
    });
    box.append(wrap);
    this.updaters.push(() => buttons.forEach(({ b, id }) => b.classList.toggle('on', active(id))));
  }

  private swatches(box: HTMLElement, colors: readonly string[], get: () => string, set: (c: string) => void): void {
    const wrap = el('div', 'swatches');
    const buttons = colors.map((c) => {
      const b = el('button', 'sw');
      b.type = 'button';
      b.style.background = c;
      b.title = c;
      b.addEventListener('click', () => set(c));
      wrap.append(b);
      return { b, c };
    });
    const custom = el('input', 'sw custom');
    custom.type = 'color';
    custom.title = 'Color personalizado';
    custom.addEventListener('input', () => set(custom.value));
    wrap.append(custom);
    box.append(wrap);
    this.updaters.push(() => {
      const cur = get().toLowerCase();
      buttons.forEach(({ b, c }) => b.classList.toggle('on', c.toLowerCase() === cur));
      custom.value = cur;
    });
  }

  private toggle(box: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void): void {
    const b = el('button', 'chip toggle', label);
    b.type = 'button';
    b.addEventListener('click', () => set(!get()));
    box.append(b);
    this.updaters.push(() => b.classList.toggle('on', get()));
  }
}
