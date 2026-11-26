import { UPGRADES, has, previewExterior, type Upgrade } from '../core/exterior';
import { levelNow } from '../core/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';
import { makeTabs } from './tabs';
import { startPreview } from './preview';

let lastTab = 'paint';
import type { Ctx } from './shop';

/** The "Fachada" window: paint, sign, awning, rope, lights and a doorman for the outside of the club. */
export function openFacade(ctx: Ctx): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Fachada del club', 'facade', () => unsub());
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);
  const TABS: Array<{ id: string; label: string; groups: Upgrade['group'][]; hint: string }> = [
    { id: 'paint', label: 'Pintura', groups: ['paint'], hint: 'El color de las paredes de tu club. Compra uno y úsalo cuando quieras.' },
    { id: 'sign', label: 'Letrero', groups: ['sign'], hint: 'Un letrero más grande trae más gente a la puerta.' },
    { id: 'door', label: 'Entrada', groups: ['awning', 'rope', 'entrance'], hint: 'La puerta y la fila: toldo, cordón, alfombra, braseros, puertas de cristal y más.' },
    { id: 'lights', label: 'Luces', groups: ['lights'], hint: 'Haces de luz que se ven desde toda la cuadra.' },
    { id: 'terrace', label: 'Terraza', groups: ['terrace'], hint: 'Abre el terreno libre al costado del club y arma tu disco al aire libre: lo amueblas tú con objetos de la Tienda › Terraza (pistas, escenario, DJ, barra, luces…). Se hace poco a poco. Si ampliaste el club al máximo no queda terreno al lado.' },
    { id: 'decor', label: 'Decoración', groups: ['decor'], hint: 'Mejoras que hacen ver tu club más caro. Cada una atrae un poco más de gente (hasta un 12 %).' },
  ];
  const pages: Record<string, HTMLElement> = {};
  const lists: Record<string, HTMLElement> = {};
  for (const t of TABS) {
    const page = el('section', 'tab-page');
    const l = el('div', 'upgrades two');
    lists[t.id] = l;
    page.append(el('p', 'facade-intro', t.hint), l);
    pages[t.id] = page;
  }
  const tabs = makeTabs(TABS, pages, lastTab, (id) => (lastTab = id));
  modal.body.append(el('p', 'facade-intro', 'Lo que la gente ve antes de entrar. Algunas mejoras solo se ven bonitas; otras cambian cómo funciona la puerta.'), tabs.bar, ...TABS.map((t) => pages[t.id]));

  const card = (u: Upgrade) => {
    const s = club.state;
    const owned = has(s.exterior, u.id);
    const inUse = u.group === 'paint' && s.exterior.paint === u.id;
    const locked = levelNow(s) < u.unlockLevel;
    const c = el('div', `upgrade${owned ? ' owned' : ''}${locked ? ' locked' : ''}${inUse ? ' on' : ''}`);
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
    const side = el('div', 'card-actions');
    side.append(b);
    if (!owned) {
      // try it on the building before paying for it
      side.append(button('Ver cómo queda', 'preview-btn', () => {
        modal.close();
        startPreview(ctx, {
          title: u.name,
          price: u.price,
          blocked: locked ? `Nivel ${u.unlockLevel}` : club.state.coins < u.price ? 'Faltan monedas' : '',
          ext: previewExterior(club.state.exterior, u.id),
          buy: () => club.buyExterior(u.id),
          back: () => openFacade(ctx),
        });
      }));
    }
    c.append(side);
    return c;
  };

  unsub = reactive(
    ctx,
    () => { const s = club.state; return JSON.stringify([s.exterior, levelNow(s), UPGRADES.map((u) => s.coins >= u.price)]); },
    () => {
      for (const t of TABS) {
        const mine = UPGRADES.filter((u) => t.groups.includes(u.group));
        lists[t.id].replaceChildren(...mine.map(card));
        const own = mine.filter((u) => has(club.state.exterior, u.id)).length;
        tabs.badge(t.id, `${own}/${mine.length}`);
      }
    },
    () => (coins.innerHTML = `${icon('coin')} ${fmt(club.state.coins)}`),
  );
}
