import { el } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import type { Ctx } from './shop';

/** The city's ranking: every club by fame, with yours highlighted, and what the position means for the crowd at your door. */
export function openRanking(ctx: Ctx): void {
  const club = ctx.club;
  const modal = openModal('Ranking de la ciudad', 'ranking', undefined);
  const r = club.rank;
  const draw = () => {
    modal.body.replaceChildren();
    if (!r) {
      modal.body.append(el('p', 'muted', 'El ranking aparece cuando estás conectado a la ciudad.'));
      return;
    }
    const you = r.you;
    const pct = Math.round((you.factor - 1) * 100);
    const head = el('div', 'rank-head');
    head.append(
      el('h3', '', you.rank > 0 ? `Vas en el puesto ${you.rank} de ${you.of}` : 'Tu club está cerrado'),
      el('p', 'muted', you.rank > 0 ? (pct === 0 ? 'Recibes la gente normal en tu puerta.' : pct > 0 ? `Por tu puesto llega ${pct}% más gente a tu puerta.` : `Por tu puesto llega ${-pct}% menos gente: se van a otras discos.`) : 'Los clubes cerrados no compiten: abre el tuyo para entrar al ranking.'),
    );
    const list = el('div', 'rank-list');
    for (const row of r.board) {
      const mine = row.n === you.n;
      const item = el('div', `rank-row${mine ? ' me' : ''}${row.open ? '' : ' closed'}`);
      const pos = el('div', `rank-pos${row.rank === 1 ? ' gold' : row.rank === 2 ? ' silver' : row.rank === 3 ? ' bronze' : ''}`);
      pos.textContent = row.open ? String(row.rank) : '–';
      const info = el('div', 'rank-info');
      info.append(el('b', '', `${row.name}${mine ? ' (tú)' : ''}`), el('span', '', row.open ? `Nivel ${row.level} · ambiente ${row.rating}` : `Nivel ${row.level} · cerrado`));
      const score = el('div', 'rank-score');
      score.innerHTML = row.open ? `${icon('star')} ${row.score}` : '';
      const dot = el('i', `rank-dot ${row.online ? 'on' : ''}`);
      dot.title = row.online ? 'En línea' : 'Ausente';
      item.append(pos, info, score, dot);
      list.append(item);
    }
    const why = el('div', 'rank-why');
    why.append(
      el('h4', '', '¿Cómo se sube?'),
      el('p', 'muted', 'La fama suma el ambiente de tu club, su lujo, tu nivel, los famosos que han pasado y las estrellas de las reseñas. Los mejores puestos reciben hasta 30% más gente; los últimos, 25% menos.'),
    );
    const jailed = el('div', 'rank-jail');
    jailed.append(el('h4', '', r.jailed.length ? 'En prisión ahora' : 'Nadie está en prisión'));
    for (const j of r.jailed) {
      const left = Math.max(0, j.until - Date.now());
      jailed.append(el('p', 'muted', `🚨 ${j.name}${j.victim ? ` (intentó asaltar a ${j.victim})` : ''}: ${j.chores}/${j.goal} tareas, o sale solo en ${Math.floor(left / 3_600_000)} h ${Math.round((left % 3_600_000) / 60000)} min.`));
    }
    modal.body.append(head, list, jailed, why);
  };
  draw();
}
