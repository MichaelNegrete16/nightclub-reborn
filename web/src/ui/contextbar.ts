import { BY_ID } from '../core/catalog';
import { sellValue, tierOfItem } from '../core/club';
import { TIER_NAMES, upgradeCost } from '../core/tiers';
import type { ClubView } from '../render/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';

/** The bar that appears above the bottom menu: what you are placing, or what you have selected. */
export class ContextBar {
  readonly root = el('div', 'contextbar');

  constructor(private club: ClubView) {}

  update(): void {
    const v = this.club;
    this.root.replaceChildren();
    this.root.classList.remove('show', 'placing');

    const act = (ic: string, label: string, fn: () => void, cls = '') => {
      const b = button('', `ctx-btn ${cls}`, fn);
      b.innerHTML = `${icon(ic)}<span>${label}</span>`;
      return b;
    };

    if (v.tool.kind === 'place') {
      const def = BY_ID.get(v.tool.defId)!;
      const moving = !!v.tool.moveFrom;
      const info = el('div', 'ctx-info');
      info.append(el('b', '', `${moving ? 'Moviendo' : 'Colocando'}: ${def.name}`));
      const sub = moving ? 'Haz clic en el nuevo lugar' : v.tool.mode === 'buy' ? `Cuesta ${fmt(def.price)} al colocarlo` : 'Sale de tu inventario';
      info.append(el('small', v.message ? 'bad' : '', v.message || sub));
      const row = el('div', 'ctx-actions');
      row.append(act('rotate', 'Girar', () => v.rotate()), act('close', 'Cancelar', () => v.cancelTool(), 'ghost'));
      this.root.append(info, row);
      this.root.classList.add('show', 'placing');
      return;
    }
    const sel = v.state.items.find((i) => i.uid === v.selectedUid);
    if (!sel) return;
    const def = BY_ID.get(sel.id)!;
    const info = el('div', 'ctx-info');
    const tier = tierOfItem(sel);
    const stars = '★'.repeat(tier) + '☆'.repeat(4 - tier);
    info.append(el('b', '', `${def.name} · ${TIER_NAMES[tier - 1]} ${stars}`), el('small', '', `Lujo +${Math.round(def.luxury * [1, 1.7, 2.6, 4][tier - 1])}${def.seats ? ` · ${def.seats} asiento(s)` : ''}`));
    const row = el('div', 'ctx-actions');
    row.append(
      ...(tier < 4 ? [act('star', `Mejorar ${fmt(upgradeCost(def.price, tier))}`, () => v.upgradeSelected(), 'upgrade')] : []),
      act('rotate', 'Girar', () => v.rotate()),
      act('move', 'Mover', () => v.startMove()),
      act('stash', 'Guardar', () => v.stashSelected()),
      act('sell', `Vender +${fmt(sellValue(def, tier))}`, () => v.sellSelected(), 'danger'),
    );
    this.root.append(info, row);
    this.root.classList.add('show');
  }
}
