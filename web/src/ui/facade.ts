import { UPGRADES, has, type Upgrade } from '../core/exterior';
import { levelNow } from '../core/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';
import type { Ctx } from './shop';

/** The "Fachada" window: paint, sign, awning, rope, lights and a doorman for the outside of the club. */
export function openFacade(ctx: Ctx): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Fachada del club', 'facade', () => unsub());
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);
  const list = el('div', 'upgrades');
  modal.body.append(el('p', 'facade-intro', 'Lo que la gente ve antes de entrar. Algunas mejoras solo se ven bonitas; otras cambian cómo funciona la puerta.'), list);

  const card = (u: Upgrade) => {
    const s = club.state;
    const owned = has(s.exterior, u.id);
    const inUse = u.group === 'paint' && s.exterior.paint === u.id;
    const locked = levelNow(s) < u.unlockLevel;
    const c = el('div', `upgrade${owned ? ' owned' : ''}${locked ? ' locked' : ''}`);
    if (u.color !== undefined) {
      const sw = el('i', 'swatch');
      sw.style.background = `#${u.color.toString(16).padStart(6, '0')}`;
      c.append(sw);
    }
    const text = el('div', 'upgrade-text');
    text.append(el('b', '', u.name), el('span', '', u.desc));
    c.append(text);
    let label: string;
    let disabled = false;
    if (inUse) {
      label = 'En uso';
      disabled = true;
    } else if (owned) label = u.group === 'paint' ? 'Usar' : 'Comprada';
    else if (locked) label = `Nivel ${u.unlockLevel}`;
    else label = fmt(u.price);
    if (owned && u.group !== 'paint') disabled = true;
    if (locked && !owned) disabled = true;
    const b = button('', 'upgrade-buy', () => club.buyExterior(u.id));
    b.disabled = disabled;
    b.innerHTML = !owned && !locked ? `${icon('coin')} ${label}` : label;
    c.append(b);
    return c;
  };

  unsub = reactive(
    ctx,
    () => { const s = club.state; return JSON.stringify([s.exterior, levelNow(s), UPGRADES.map((u) => s.coins >= u.price)]); },
    () => list.replaceChildren(...UPGRADES.map(card)),
    () => (coins.innerHTML = `${icon('coin')} ${fmt(club.state.coins)}`),
  );
}
