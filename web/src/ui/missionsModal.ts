import { BY_ID } from '../core/catalog';
import { allMissions, type Reward } from '../core/story';
import type { Ctx } from './shop';
import { el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${fmt(r.coins)} monedas`);
  if (r.xp) parts.push(`${fmt(r.xp)} XP`);
  for (const [id, n] of Object.entries(r.items ?? {})) parts.push(`${n} × ${BY_ID.get(id)?.name ?? id}`);
  return parts.join(' · ');
}

export function openMissions(ctx: Ctx): void {
  let unsub = () => {};
  const modal = openModal('Misiones', 'missions', () => unsub());
  const list = el('div', 'mission-list');
  modal.body.append(list);

  const draw = () => {
    list.replaceChildren();
    const all = allMissions(ctx.club.state);
    const active = all.filter((m) => !m.done);
    const done = all.filter((m) => m.done);
    const row = (m: (typeof all)[number]) => {
      const r = el('div', `mission${m.done ? ' done' : ''}`);
      const mark = el('span', 'mark');
      mark.innerHTML = m.done ? icon('check') : icon('star');
      const text = el('div', 'text');
      text.append(el('b', '', m.mission.title), el('small', '', m.mission.hint));
      const bar = el('div', 'bar');
      const fill = el('i');
      fill.style.width = `${Math.round((m.progress.current / m.progress.target) * 100)}%`;
      bar.append(fill);
      const count = el('span', 'count', m.done ? 'Hecha' : `${fmt(m.progress.current)} / ${fmt(m.progress.target)}`);
      const rew = el('span', 'reward', rewardText(m.mission.reward) || '—');
      r.append(mark, text, bar, count, rew);
      return r;
    };
    if (active.length) {
      list.append(el('h3', '', 'En curso'));
      active.forEach((m) => list.append(row(m)));
    }
    if (done.length) {
      list.append(el('h3', '', 'Completadas'));
      done.forEach((m) => list.append(row(m)));
    }
    if (!active.length && !done.length) list.append(el('p', 'hint', 'Todavía no hay misiones.'));
  };
  unsub = reactive(ctx, () => JSON.stringify(allMissions(ctx.club.state).map((m) => [m.mission.id, m.done, m.progress.current])), draw);
}
