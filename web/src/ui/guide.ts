import { TIPS, type TipCtx } from '../core/tips';
import { el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';

/** The Guide: every tip, the ones already explained in green, the ones that are due in gold, and when the rest will come. */
export function openGuide(ctx: Ctx): void {
  const club = ctx.club;
  const modal = openModal('Guía del juego', 'menu guide');
  const state = club.state;
  const seen = new Set(state.story.tips);
  const tctx: TipCtx = { state, online: club.net.status === 'online', heat: club.crime.heat, opened: new Set() };
  const head = el('div', 'muted', `${seen.size} de ${TIPS.length} consejos leídos. Aquí puedes releerlos cuando quieras.`);
  const list = el('div', 'guide-list');
  const rank = (id: string) => (seen.has(id) ? 0 : 1);
  for (const t of [...TIPS].sort((a, b) => rank(a.id) - rank(b.id))) {
    const isSeen = seen.has(t.id);
    const due = !isSeen && t.when(tctx);
    const row = el('div', `guide-item ${isSeen ? 'seen' : due ? 'next' : 'locked'}`);
    const mark = el('div', 'mark');
    mark.innerHTML = icon(isSeen ? 'check' : t.icon);
    const body = el('div', '');
    body.append(el('h4', '', t.title), el('p', '', isSeen || due ? t.text : t.locked));
    row.append(mark, body);
    list.append(row);
  }
  modal.body.append(head, list);
  modal.body.style.display = 'grid';
  modal.body.style.gap = '12px';
  modal.body.style.padding = '16px';
}
