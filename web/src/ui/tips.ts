import { TIPS, markTipSeen, nextTip, type Tip, type TipCtx } from '../core/tips';
import type { ClubView } from '../render/club';
import { button, el } from './dom';
import { icon } from './icons';
import { modalOpen, setModalOpenHook } from './modal';

/** How long to wait after one tip is closed before showing the next. */
const GAP_MS = 25_000;

/** The "te explico" cards: one at a time, near what they explain, never while a window, a scene or Rosa's tutorial is up. */
export class Tips {
  private opened = new Set<string>();
  private card: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private lastClosed = 0;
  private current: Tip | null = null;

  constructor(private club: ClubView, private host: HTMLElement) {
    setModalOpenHook((cls) => {
      for (const w of ['shop', 'inventory', 'missions', 'office', 'music', 'facade', 'decor', 'heist']) if (cls.split(' ').includes(w)) this.opened.add(w);
    });
  }

  private ctx(): TipCtx {
    return { state: this.club.state, online: this.club.net.status === 'online', heat: this.club.crime.heat, opened: this.opened };
  }

  /** Called whenever the game changes: shows the next tip when it is a good moment. */
  update(): void {
    if (this.card) {
      // the tip goes away by itself if what it explains is no longer true (e.g. the player did it already)
      if (modalOpen() || document.body.classList.contains('in-scene') || document.body.classList.contains('visiting')) this.close(false);
      return;
    }
    const b = document.body.classList;
    if (modalOpen() || b.contains('in-scene') || b.contains('coaching') || b.contains('onboarding') || b.contains('visiting')) return;
    if (Date.now() - this.lastClosed < GAP_MS) return;
    const tip = nextTip(this.ctx());
    if (tip) this.show(tip);
  }

  private show(tip: Tip): void {
    this.current = tip;
    const card = el('div', 'tip');
    const mascot = el('div', 'mascot');
    mascot.innerHTML = icon(tip.icon);
    const body = el('div', '');
    const acts = el('div', 'acts');
    acts.append(
      button('Entendido', 'btn go small', () => this.close(true)),
      button('Saltar todos', 'btn ghost small', () => this.skipAll()),
    );
    const seen = this.club.state.story.tips.length;
    acts.append(el('span', 'muted', `${seen + 1} de ${TIPS.length}`));
    body.append(el('h4', '', tip.title), el('p', '', tip.text), acts);
    card.append(mascot, body);
    this.host.append(card);
    this.card = card;
    if (tip.target) {
      const t = document.querySelector(tip.target);
      if (t) {
        const r = t.getBoundingClientRect();
        const ring = el('div', 'pulse-ring');
        Object.assign(ring.style, { position: 'fixed', left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, zIndex: '80', pointerEvents: 'none' });
        document.body.append(ring);
        this.ring = ring;
      }
    }
  }

  private close(markSeen: boolean): void {
    this.card?.remove();
    this.ring?.remove();
    this.card = this.ring = null;
    if (markSeen && this.current) {
      const id = this.current.id;
      this.club.patchState((s) => markTipSeen(s, id));
    }
    this.current = null;
    this.lastClosed = Date.now();
  }

  /** Mark everything that is due as seen (for players who already know the game). */
  private skipAll(): void {
    this.close(false);
    const ctx = this.ctx();
    this.club.patchState((s) => TIPS.filter((t) => t.when({ ...ctx, state: s })).reduce((acc, t) => markTipSeen(acc, t.id), s));
  }
}
