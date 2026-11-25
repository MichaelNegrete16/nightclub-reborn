import { unlocksBetween, type Unlock, type Where } from '../core/unlocks';
import { titleFor } from '../core/progression';
import { button, el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';

const KIND_ICON: Record<Unlock['kind'], string> = { item: 'shop', staff: 'guests', facade: 'facade', renovation: 'luxury', phase: 'city', emote: 'dance' };
const WHERE_BUTTON: Record<Where, string> = { shop: 'Ir a la Tienda', team: 'Abrir la Oficina', facade: 'Ver la fachada', renovation: 'Abrir la Oficina', building: 'Ver mi club', dance: 'Elegir un baile' };

/** The "you reached level N" pop-up: everything the new levels opened, with an icon and where to find it. */
export function openUnlocks(ctx: Ctx, from: number, to: number, go: (where: Where) => void): boolean {
  const groups = unlocksBetween(from, to);
  if (!groups.length) return false;
  const modal = openModal(`¡Nivel ${to}!`, 'unlocks');
  const hero = el('div', 'unlock-hero');
  hero.append(el('b', '', titleFor(to)), el('span', '', `Desbloqueaste ${groups.reduce((a, g) => a + g.unlocks.length, 0)} cosas nuevas`));
  modal.body.append(hero);
  const list = el('div', 'unlock-list');
  const seenWhere = new Set<Where>();
  for (const g of groups) {
    if (groups.length > 1) list.append(el('h4', 'unlock-level', `Nivel ${g.level}`));
    for (const u of g.unlocks) {
      const card = el('div', `unlock kind-${u.kind}`);
      const ic = el('div', 'unlock-icon');
      if (u.kind === 'item') {
        const img = document.createElement('img');
        img.src = ctx.thumbs.item(u.id);
        img.alt = '';
        ic.append(img);
      } else {
        ic.innerHTML = icon(KIND_ICON[u.kind]);
      }
      const text = el('div', 'unlock-text');
      text.append(el('b', '', u.name), el('span', '', u.desc), el('small', '', `📍 ${u.place}`));
      card.append(ic, text);
      list.append(card);
      seenWhere.add(u.where);
    }
  }
  modal.body.append(list);
  const foot = el('div', 'unlock-foot');
  for (const w of ['shop', 'team', 'facade', 'renovation', 'building', 'dance'] as Where[]) {
    if (!seenWhere.has(w)) continue;
    if (w === 'renovation' && seenWhere.has('team')) continue; // both open the office: one button is enough
    foot.append(button(WHERE_BUTTON[w], 'unlock-go', () => { modal.close(); go(w); }));
  }
  foot.append(button('¡Genial!', 'unlock-ok', () => modal.close()));
  modal.body.append(foot);
  return true;
}
