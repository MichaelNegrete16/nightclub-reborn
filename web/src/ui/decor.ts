import { DECOR, GROUPS, optionsOf, type DecorOption } from '../core/decor';
import { levelNow } from '../core/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';
import type { Ctx } from './shop';

/** "Decoración del local": the walls, floor, mouldings, lighting and pictures of the inside, from bare basement to luxury. */
export function openDecor(ctx: Ctx): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Decoración del local', 'decor', () => unsub());
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);
  const body = el('div', 'decor-groups');
  const count = el('p', 'facade-intro');
  modal.body.append(count, el('p', 'facade-intro', 'El local empieza pelado, como un sótano. Cada acabado que compras se pone al instante y suma lujo. Puedes volver a uno anterior cuando quieras.'), body);

  const card = (o: DecorOption) => {
    const s = club.state;
    const owned = s.decor.owned.includes(o.id);
    const inUse = s.decor.sel[o.group] === o.id;
    const locked = levelNow(s) < o.unlockLevel && !owned;
    const c = el('div', `decor-card${inUse ? ' on' : ''}${owned ? ' owned' : ''}${locked ? ' locked' : ''}`);
    const sw = el('i', 'swatch');
    sw.style.background = `#${o.swatch.toString(16).padStart(6, '0')}`;
    c.append(sw);
    const text = el('div', 'decor-text');
    text.append(el('b', '', o.name), el('span', '', o.desc), el('small', '', `Lujo +${o.luxury}`));
    c.append(text);
    const b = button('', 'upgrade-buy', () => club.buyDecor(o.id));
    if (inUse) {
      b.textContent = 'En uso';
      b.disabled = true;
    } else if (owned) b.textContent = 'Usar';
    else if (locked) {
      b.textContent = `Nivel ${o.unlockLevel}`;
      b.disabled = true;
    } else b.innerHTML = `${icon('coin')} ${fmt(o.price)}`;
    c.append(b);
    return c;
  };

  const draw = () => {
    body.replaceChildren();
    count.textContent = `Acabados: ${club.state.decor.owned.length} de ${DECOR.length} (5 básicos incluidos).`;
    for (const g of GROUPS) {
      const sec = el('section', 'decor-group');
      sec.append(el('h3', '', g.label), el('p', 'decor-hint', g.hint));
      const row = el('div', 'decor-row');
      for (const o of optionsOf(g.id)) row.append(card(o));
      sec.append(row);
      body.append(sec);
    }
  };
  unsub = reactive(
    ctx,
    () => {
      const s = club.state;
      return JSON.stringify([s.decor, levelNow(s), DECOR.map((o) => s.coins >= o.price)]);
    },
    draw,
    () => (coins.innerHTML = `${icon('coin')} ${fmt(club.state.coins)}`),
  );
}
