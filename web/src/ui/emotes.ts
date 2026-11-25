import { EMOTES } from '../core/emotes';
import { levelNow } from '../core/club';
import { button, el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';

/** The dance picker: every dance and gesture, the ones still locked with their level. Pick one and your character does it until you walk. */
export function openEmotes(ctx: Ctx): void {
  const club = ctx.club;
  const modal = openModal('Bailes', 'emotes');
  const level = levelNow(club.state);
  const intro = el('p', 'muted', club.emote ? 'Estás bailando. Camina para parar, o elige otro.' : 'Elige un baile: tu personaje lo hace hasta que camines. Se ve igual para los demás jugadores y sigue el ritmo de la música.');
  const grid = el('div', 'emote-grid');
  for (const e of EMOTES) {
    const locked = level < e.unlockLevel;
    const card = button('', `emote-card${club.emote === e.id ? ' on' : ''}${locked ? ' locked' : ''}`, () => {
      if (locked) return void club.say(`${e.label} se desbloquea en el nivel ${e.unlockLevel}.`);
      club.setEmote(e.id);
      modal.close();
    });
    const ic = el('div', 'emote-icon');
    ic.innerHTML = icon(locked ? 'lock' : 'dance');
    const text = el('div', 'emote-text');
    text.append(el('b', '', e.label), el('span', '', locked ? `Nivel ${e.unlockLevel}` : e.desc));
    if (!locked && e.kind === 'gesture') text.append(el('small', '', 'Gesto corto'));
    card.append(ic, text);
    grid.append(card);
  }
  const foot = el('div', 'emote-foot');
  if (club.emote) foot.append(button('Dejar de bailar', 'btn danger', () => { club.setEmote(null); modal.close(); }));
  modal.body.append(intro, grid, foot);
}
