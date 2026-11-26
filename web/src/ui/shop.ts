import { TIER_LEVEL, TIER_NAMES, upgradeCost } from '../core/tiers';
import { earningOf, FULL_HOUSE } from '../core/income';
import { BY_ID, CATALOG, CATEGORIES, type CategoryId, type ItemDef } from '../core/catalog';
import { terraceTier } from '../core/exterior';
import { levelNow, owned, sellValue } from '../core/club';
import type { ClubView } from '../render/club';
import type { Thumbs } from '../render/thumbs';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';

export interface Ctx {
  club: ClubView;
  thumbs: Thumbs;
  toast(message: string, kind?: 'ok' | 'bad'): void;
  /** called whenever the club changes; returns an unsubscribe function */
  subscribe(fn: () => void): () => void;
  openShop(): void;
}

type Mode = 'shop' | 'inventory';

/** Shop (buy into the inventory, or buy and place) and Inventory (place, sell). Same layout, different content. */
export function openCatalog(ctx: Ctx, mode: Mode): void {
  const club = ctx.club;
  let category: CategoryId | 'all' = 'all';
  let selected: string | null = null;
  let signature = '';

  let unsub = () => {};
  let spin = 0;
  const modal = openModal(mode === 'shop' ? 'Tienda' : 'Inventario', `catalog ${mode}`, () => { unsub(); window.clearInterval(spin); });
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);

  const cats = el('nav', 'cats');
  const grid = el('div', 'grid');
  const detail = el('aside', 'detail');
  const layout = el('div', 'layout');
  layout.append(cats, grid, detail);
  modal.body.append(layout);

  const visible = (): ItemDef[] => {
    const list = mode === 'shop' ? CATALOG : CATALOG.filter((d) => owned(club.state, d.id) > 0);
    return list
      .filter((d) => category === 'all' || d.category === category || (category === 'outdoor' && !!d.outdoor))
      .sort((a, b) => a.unlockLevel - b.unlockLevel || a.price - b.price);
  };

  const sig = () =>
    JSON.stringify([category, selected, levelNow(club.state), club.state.inventory, club.state.kept, mode === 'shop' ? 0 : 1]);

  function renderCats(): void {
    cats.replaceChildren();
    const mk = (id: CategoryId | 'all', label: string) => {
      const count = (mode === 'inventory'
        ? CATALOG.filter((d) => (id === 'all' || d.category === id || (id === 'outdoor' && d.outdoor)) && owned(club.state, d.id) > 0)
        : CATALOG.filter((d) => id === 'all' || d.category === id || (id === 'outdoor' && d.outdoor))
      ).length;
      if (mode === 'inventory' && id !== 'all' && count === 0) return;
      const b = button('', `cat${category === id ? ' on' : ''}`, () => {
        category = id;
        selected = null;
        render(true);
      });
      b.append(el('span', '', label), el('em', '', String(count)));
      cats.append(b);
    };
    mk('all', 'Todo');
    for (const c of CATEGORIES) mk(c.id, c.label);
  }

  function renderGrid(): void {
    grid.replaceChildren();
    const items = visible();
    const kept = mode === 'inventory' ? club.state.kept.filter((k) => category === 'all' || BY_ID.get(k.id)?.category === category) : [];
    if (items.length === 0 && kept.length === 0) {
      const empty = el('div', 'empty');
      empty.append(el('p', '', mode === 'inventory' ? 'Tu inventario está vacío.' : 'Nada en esta categoría.'));
      if (mode === 'inventory') {
        empty.append(el('p', 'sub', 'Compra objetos en la Tienda y aparecerán aquí, listos para colocar.'));
        empty.append(button('Ir a la Tienda', 'btn primary', () => {
          modal.close();
          ctx.openShop();
        }));
      }
      grid.append(empty);
      return;
    }
    const level = levelNow(club.state);
    for (const def of items) {
      const locked = mode === 'shop' && def.unlockLevel > level;
      const card = button('', `card${selected === def.id ? ' on' : ''}${locked ? ' locked' : ''}`, () => {
        selected = def.id;
        render(true);
      });
      card.dataset.id = def.id;
      const img = el('img') as HTMLImageElement;
      img.src = ctx.thumbs.item(def.id);
      img.alt = def.name;
      img.draggable = false;
      const name = el('span', 'name', def.name);
      const price = el('span', 'price');
      price.innerHTML = `${icon('coin')} ${fmt(mode === 'shop' ? def.price : sellValue(def))}`;
      const earnCard = earningOf(def);
      card.append(img, name, price);
      if (earnCard) card.append(el('span', 'earn', `+${earnCard.perMin[0]}/min`));
      if (mode === 'inventory') card.append(el('span', 'count', `x${owned(club.state, def.id)}`));
      else if (owned(club.state, def.id) > 0) card.append(el('span', 'count have', `Tienes ${owned(club.state, def.id)}`));
      if (locked) {
        const lock = el('span', 'lock');
        lock.innerHTML = `${icon('lock')} Nivel ${def.unlockLevel}`;
        card.append(lock);
      }
      grid.append(card);
    }
    if (kept.length) {
      // improved pieces that were put away: each keeps its version
      grid.append(el('h3', 'kept-title', 'Piezas mejoradas guardadas'));
      for (const k of kept) {
        const def = BY_ID.get(k.id);
        if (!def) continue;
        const row = el('div', 'kept-row');
        const img = el('img') as HTMLImageElement;
        img.src = ctx.thumbs.item(def.id, k.tier);
        img.alt = def.name;
        img.draggable = false;
        const text = el('div', 'kept-text');
        text.append(el('b', '', `${def.name} · ${TIER_NAMES[k.tier - 1]}`), el('span', '', '★'.repeat(k.tier) + '☆'.repeat(4 - k.tier)));
        const place = button('Colocar', 'btn primary', () => {
          modal.close();
          club.startPlaceKept(k.uid);
        });
        const sell = button(`Vender +${fmt(sellValue(def, k.tier))}`, 'btn danger', () => {
          club.sellKeptPiece(k.uid);
          render(true);
        });
        row.append(img, text, place, sell);
        grid.append(row);
      }
    }
  }

  function renderDetail(): void {
    detail.replaceChildren();
    window.clearInterval(spin);
    const def = selected ? BY_ID.get(selected) : undefined;
    if (!def) {
      detail.append(el('p', 'hint', mode === 'shop' ? 'Elige un objeto para ver sus detalles.' : 'Elige un objeto para colocarlo o venderlo.'));
      return;
    }
    const img = el('img', 'big') as HTMLImageElement;
    img.src = ctx.thumbs.item(def.id);
    img.alt = def.name;
    // the big picture turns through the versions this object can be upgraded to
    const tierLabel = el('div', 'tier-label');
    detail.append(img, tierLabel, el('h3', '', def.name));
    const tags = el('div', 'tags');
    const tag = (ic: string, text: string) => {
      const t = el('span', 'tag');
      t.innerHTML = `${icon(ic)} ${text}`;
      tags.append(t);
    };
    tag('luxury', `Lujo +${def.luxury}`);
    tag('star', 'Mejorable ×4');
    if (def.seats) tag('guests', `${def.seats} asiento${def.seats > 1 ? 's' : ''}`);
    tag('move', `${def.w}×${def.d}`);
    if (def.layer === 'floor') tag('star', 'Suelo');
    if (def.outdoor) tag('move', 'Solo en la terraza');
    detail.append(tags);
    // what it earns by itself (the same numbers the club is paid with)
    const earn = earningOf(def);
    if (earn) {
      const box = el('div', 'income');
      box.append(el('b', '', `Genera ingresos: +${earn.perMin[0]}/min`));
      box.append(el('span', '', TIER_NAMES.map((n, i) => `${n} +${earn.perMin[i]}`).join(' · ') + ' por minuto'));
      box.append(el('small', '', earn.kind === 'show'
        ? `Con el club abierto, música y gente mirándola (paga completo con ${FULL_HOUSE} personas cerca). La bailarina cobra ${earn.wage[0]}/min en la versión 1.`
        : `Con el club abierto, música y gente cerca (paga completo con ${FULL_HOUSE} personas alrededor). No cuesta mantenimiento.`));
      detail.append(box);
    }

    // the four versions of this object, so the player sees what upgrading buys: pick one or let them turn by themselves
    const ladder = el('div', 'tiers');
    ladder.append(el('small', '', 'Versiones (se mejoran con el objeto ya puesto):'));
    const rowT = el('div', 'tier-tabs');
    const tabs: HTMLButtonElement[] = [];
    let shown = 0;
    const show = (i: number) => {
      shown = i;
      img.src = ctx.thumbs.item(def.id, i + 1);
      tabs.forEach((t, k) => t.classList.toggle('on', k === i));
      tierLabel.replaceChildren(el('b', `t${i + 1}`, TIER_NAMES[i]), el('span', '', i === 0 ? `Precio ${fmt(def.price)}` : `Mejora +${fmt(upgradeCost(def.price, i as 1 | 2 | 3))} · nivel ${TIER_LEVEL[i]}`));
    };
    TIER_NAMES.forEach((name, i) => {
      const t = button(name, 'tier-tab', () => {
        window.clearInterval(spin); // the player chose: stop turning
        show(i);
      });
      tabs.push(t);
      rowT.append(t);
    });
    ladder.append(rowT);
    detail.append(ladder);
    show(0);
    spin = window.setInterval(() => show((shown + 1) % TIER_NAMES.length), 1800);

    const actions = el('div', 'actions');
    const have = owned(club.state, def.id);
    if (mode === 'shop') {
      const level = levelNow(club.state);
      const locked = def.unlockLevel > level;
      const poor = club.state.coins < def.price;
      const noTerrace = !!def.outdoor && terraceTier(club.state.exterior) === 0;
      const why = locked ? `Se desbloquea en el nivel ${def.unlockLevel}` : noTerrace ? 'Primero abre la terraza (Oficina › Fachada › Terraza)' : poor ? `Te faltan ${fmt(def.price - club.state.coins)} monedas` : '';
      const price = el('div', 'bigprice');
      price.innerHTML = `${icon('coin')} ${fmt(def.price)}`;
      detail.append(price);
      if (have > 0) detail.append(el('p', 'sub', `Ya tienes ${have} en el inventario`));
      const buy = button('Comprar', 'btn', () => {
        if (club.buy(def.id) === undefined) ctx.toast(`Comprado: ${def.name}. Está en tu inventario.`, 'ok');
        render(true);
      });
      const buyPlace = button('Comprar y colocar', 'btn primary', () => {
        modal.close();
        club.pickTool(def.id, 'buy');
      });
      buy.disabled = buyPlace.disabled = locked || poor || noTerrace;
      buy.dataset.action = 'buy';
      buyPlace.dataset.action = 'buy-place';
      actions.append(buyPlace, buy);
      if (why) detail.append(el('p', 'why', why));
    } else {
      const place = button('Colocar', 'btn primary', () => {
        modal.close();
        club.pickTool(def.id, 'inventory');
      });
      const sell = button(`Vender  +${fmt(sellValue(def))}`, 'btn danger', () => {
        club.sellStock(def.id);
        ctx.toast(`Vendido: ${def.name} (+${fmt(sellValue(def))})`, 'ok');
        if (owned(club.state, def.id) < 1) selected = null;
        render(true);
      });
      place.dataset.action = 'place';
      sell.dataset.action = 'sell';
      detail.append(el('p', 'sub', `Tienes ${have} en el inventario`));
      actions.append(place, sell);
    }
    detail.append(actions);
  }

  /** Cheap refresh for things that change while the window is open (coins, affordability). */
  function renderLive(): void {
    coins.innerHTML = `${icon('coin')} ${fmt(club.state.coins)}`;
    if (mode !== 'shop' || !selected) return;
    const def = BY_ID.get(selected);
    if (!def) return;
    const blocked = def.unlockLevel > levelNow(club.state) || club.state.coins < def.price;
    detail.querySelectorAll<HTMLButtonElement>('button[data-action^="buy"]').forEach((b) => (b.disabled = blocked));
  }

  function render(force = false): void {
    const s = sig();
    if (force || s !== signature) {
      signature = s;
      renderCats();
      renderGrid();
      renderDetail();
    }
    renderLive();
  }

  unsub = ctx.subscribe(() => render(false));
  render(true);
}
