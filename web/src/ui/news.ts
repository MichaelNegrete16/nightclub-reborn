import { NEWS, type News } from '../core/news';
import { button, el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';

/** The "Novedades" window: every entry with its picture (or icon), what it does and where to find it. */
export function openNews(ctx: Ctx, news: News = NEWS[0], onClose?: () => void): void {
  const modal = openModal('Novedades', 'news', onClose);
  const hero = el('div', 'news-hero');
  hero.append(el('h3', '', news.title), el('p', 'muted', `${news.date} · ${news.intro}`));
  const grid = el('div', 'news-grid');
  for (const e of news.entries) {
    const card = el('div', 'news-card');
    const pic = el('div', 'news-pic');
    if (e.kind === 'item') {
      const img = document.createElement('img');
      img.alt = e.title;
      img.src = ctx.thumbs.item(e.ref, e.tier ?? 1);
      pic.append(img);
    } else {
      pic.innerHTML = icon(e.ref);
    }
    const text = el('div', 'news-text');
    text.append(el('h4', '', e.title), el('p', '', e.text));
    if (e.where) text.append(el('span', 'tag', e.where));
    card.append(pic, text);
    grid.append(card);
  }
  const foot = el('div', 'news-foot');
  foot.append(button('A jugar', 'btn primary', () => modal.close()));
  modal.body.append(hero, grid, foot);
  // older releases, one tap away
  if (NEWS.length > 1) {
    const older = el('div', 'news-older');
    older.append(el('span', 'muted', 'Versiones anteriores: '));
    for (const n of NEWS.slice(1)) older.append(button(n.title, 'chip', () => { modal.close(); openNews(ctx, n); }));
    modal.body.append(older);
  }
}
