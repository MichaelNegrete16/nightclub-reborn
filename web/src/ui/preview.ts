import type { Decor } from '../core/decor';
import type { Exterior } from '../core/exterior';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import type { Ctx } from './shop';

export interface PreviewOptions {
  /** what is being tried on */
  title: string;
  price: number;
  /** why it cannot be bought yet (a level, not enough coins), or '' */
  blocked: string;
  /** the outside look to show, or the inside finishes to show */
  ext?: Exterior;
  sel?: Decor['sel'];
  /** buys it; returns an error message or undefined */
  buy(): string | undefined;
  /** called when the preview ends (to bring the window back) */
  back(): void;
}

let current: (() => void) | null = null;

/** Show the club with a look the player has not bought yet, with a bar to buy it or go back to the window. */
export function startPreview(ctx: Ctx, o: PreviewOptions): void {
  current?.();
  const club = ctx.club;
  if (o.ext) club.goOutsideNow();
  else club.goInsideNow();
  club.setPreview({ ext: o.ext, sel: o.sel });
  const bar = el('div', 'preview-bar');
  const text = el('div', 'preview-text');
  text.append(el('small', '', 'Vista previa'), el('b', '', o.title));
  const buy = button('', 'upgrade-buy', () => {
    const err = o.buy();
    if (err) return;
    end();
  });
  buy.innerHTML = o.blocked || `Comprar ${icon('coin')} ${fmt(o.price)}`;
  buy.disabled = !!o.blocked;
  const back = button('Volver', 'preview-back', () => end());
  bar.append(text, buy, back);
  document.body.append(bar);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') end();
  };
  window.addEventListener('keydown', onKey);
  function end(): void {
    if (current !== end) return;
    current = null;
    window.removeEventListener('keydown', onKey);
    bar.remove();
    club.setPreview(null);
    o.back();
  }
  current = end;
}
