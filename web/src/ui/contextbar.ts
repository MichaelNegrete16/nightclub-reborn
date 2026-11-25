import { BY_ID } from '../core/catalog';
import { sellValue, tierOfItem } from '../core/club';
import { launderPrice } from '../core/kits';
import { TIER_NAMES, upgradeCost } from '../core/tiers';
import type { ClubView } from '../render/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';

/** The bar that appears above the bottom menu: what you are placing, or what you have selected. */
export class ContextBar {
  readonly root = el('div', 'contextbar');

  /** what the bar showed last time: the buttons are only rebuilt when this changes */
  private last = '';
  private pressing = false;
  private dirty = false;

  constructor(private club: ClubView) {
    // The game refreshes about twice a second (money comes in). Rebuilding the buttons each time swaps the button under the
    // finger, and a click that starts on the old one and ends on the new one is lost (it took three tries to upgrade).
    this.root.addEventListener('pointerdown', () => (this.pressing = true), true);
    const release = () => {
      this.pressing = false;
      if (this.dirty) window.setTimeout(() => this.dirty && !this.pressing && this.update(), 80); // after the click was delivered
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
  }

  /** Everything the bar's content depends on. */
  private signature(): string {
    const v = this.club;
    const t = v.tool;
    const sel = v.state.items.find((i) => i.uid === v.selectedUid);
    return JSON.stringify([
      t.kind,
      t.kind === 'place' ? [t.defId, t.mode, !!t.moveFrom] : 0,
      v.message,
      sel ? [sel.uid, sel.id, tierOfItem(sel), (sel.hot ?? 0) > Date.now()] : 0,
    ]);
  }

  update(): void {
    const sig = this.signature();
    if (sig === this.last) return;
    if (this.pressing) {
      this.dirty = true;
      return;
    }
    this.last = sig;
    this.dirty = false;
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
      ...((sel.hot ?? 0) > Date.now() ? [act('coin', `Limpiar ${fmt(launderPrice({ uid: sel.uid, id: sel.id, tier }))}`, () => v.launder(sel.uid), 'upgrade')] : []),
      act('stash', 'Guardar', () => v.stashSelected()),
      act('sell', `Vender +${fmt(sellValue(def, tier))}`, () => v.sellSelected(), 'danger'),
    );
    this.root.append(info, row);
    this.root.classList.add('show');
  }
}
