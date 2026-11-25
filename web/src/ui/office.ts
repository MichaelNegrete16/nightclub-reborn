import { unlocksAt } from '../core/unlocks';
import { BANK, lendLimit } from '../core/bank';
import { openBank } from './bank';
import { expansionState, nextExpansion } from '../core/expansion';
import { phaseOf } from '../core/club';
import { MAX_TIER, nextRenovation, upkeepPerMinute } from '../core/renovation';
import { STAFF, wagePerMinute, working, type StaffDef } from '../core/staff';
import { levelNow } from '../core/club';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { openDecor } from './decor';
import { openHeist } from './heist';
import { openMusic } from './music';
import { openRanking } from './ranking';
import { ADVICE, averageStars, topComplaints } from '../core/reviews';
import { RULES, guardPrice } from '../core/heist';
import { BOOTH_IDS, BY_ID } from '../core/catalog';
import { TIER_NAMES } from '../core/tiers';
import { launderPrice } from '../core/kits';
import { reactive } from './live';
import type { Ctx } from './shop';

/** The office computer: the club's team and its wages, the night's numbers, and a shortcut to the facade. */
export function openOffice(ctx: Ctx, openFacade: () => void): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Oficina', 'office', () => unsub());
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);
  const summary = el('div', 'office-summary');
  const team = el('div', 'upgrades');
  const foot = el('div', 'office-foot');
  foot.append(button('Ranking de la ciudad', 'upgrade-buy', () => { modal.close(); openRanking(ctx); }), button('Decorar el interior', 'upgrade-buy', () => { modal.close(); openDecor(ctx); }), button('Ver la fachada', 'upgrade-buy', () => { modal.close(); openFacade(); }));
  const soon = el('div', 'upgrades');
  const bag = el('div', 'upgrades');
  const reports = el('div', 'upgrades');
  const reviewsBox = el('div', 'upgrades');
  const guardBox = el('div', 'upgrades');
  const bankBox = el('div', 'upgrades');
  const grow = el('div', 'upgrades');
  const reform = el('div', 'upgrades');
  modal.body.append(summary, el('h3', 'office-title', 'Protector antirrobos'), guardBox, el('h3', 'office-title', 'Reseñas de tus invitados'), reviewsBox, el('h3', 'office-title', 'Banco'), bankBox, el('h3', 'office-title', 'Tu equipo'), team, el('h3', 'office-title', 'Botín (piezas robadas)'), bag, el('h3', 'office-title', 'Informes (robos y policía)'), reports, el('h3', 'office-title', 'Ampliación del local'), grow, el('h3', 'office-title', 'Reformas del local'), reform, el('h3', 'office-title', 'Próximos desbloqueos'), soon, foot);

  const stat = (label: string, value: string) => {
    const d = el('div', 'stat');
    d.append(el('small', '', label), el('b', '', value));
    return d;
  };

  const card = (d: StaffDef) => {
    const s = club.state;
    const hired = s.staff[d.role];
    const active = working(s)[d.role];
    const locked = levelNow(s) < d.unlockLevel;
    const c = el('div', `upgrade${hired ? ' owned' : ''}${locked ? ' locked' : ''}`);
    const text = el('div', 'upgrade-text');
    text.append(el('b', '', `${d.name}  ${hired}/${d.max}`), el('span', '', d.desc));
    const note = active < hired ? (d.needs === 'lounge' ? 'Sin sitio para trabajar: hace falta un sofá, reservado, cama lounge o mesa VIP con una casilla libre al lado. Mientras tanto no cobra ni ayuda.' : d.needs ? 'Sin sitio para trabajar: deja una casilla libre detrás o al lado de la cabina o la barra. Mientras tanto no cobra ni ayuda.' : 'Sin dónde trabajar.') : `Sueldo: ${d.wage} monedas por minuto con el club abierto.`;
    text.append(el('span', 'wage', locked ? `Se desbloquea en el nivel ${d.unlockLevel}.` : note));
    c.append(text);
    const hire = button('', 'upgrade-buy', () => club.hireStaff(d.role));
    hire.innerHTML = locked ? `Nivel ${d.unlockLevel}` : hired >= d.max ? 'Completo' : `${icon('coin')} ${fmt(d.hire)}`;
    hire.disabled = locked || hired >= d.max;
    c.append(hire);
    if (hired) {
      const fire = button('Despedir', 'fire-btn', () => club.fireStaff(d.role));
      c.append(fire);
    }
    return c;
  };

  const live = () => {
    const s = club.state;
    coins.innerHTML = `${icon('coin')} ${fmt(s.coins)}`;
    summary.replaceChildren(
      stat('Dentro / aforo', `${club.guestCount}/${club.roomCapacity}`),
      stat('En la fila', String(club.queueCount)),
      stat('Ingresos por minuto', fmt(club.incomePerMin(performance.now() / 1000))),
      stat('Sueldos por minuto', `-${fmt(wagePerMinute(s))}`),
      stat('Gastos del local por minuto', `-${fmt(upkeepPerMinute(s))}`),
      stat('Invitados atendidos', fmt(s.stats.guests)),
      stat('Tragos vendidos', fmt(s.stats.drinks)),
    );
  };

  const draw = () => {
    const s = club.state;
    team.replaceChildren(...STAFF.map(card));
    // the bag of stolen pieces: they are hot until they cool down (72 h) or are cleaned by Zeta
    const nowMs = Date.now();
    const bagRows: HTMLElement[] = [];
    for (const l of s.loot) {
      const def = BY_ID.get(l.id);
      const hotNow = l.hotUntil > nowMs;
      const r = el('div', `upgrade${hotNow ? ' hot' : ''}`);
      const tx = el('div', 'upgrade-text');
      tx.append(el('b', '', `${def?.name ?? l.id} · ${TIER_NAMES[l.tier - 1]}`), el('span', '', hotNow ? `🔥 Caliente: se enfría sola en ${Math.max(1, Math.round((l.hotUntil - nowMs) / 3_600_000))} h, o límpiala con Zeta.` : 'Limpia: ya no atrae a la policía.'));
      r.append(tx, button('Colocar en mi club', 'upgrade-buy', () => { modal.close(); club.startPlaceLoot(l.uid); }));
      if (hotNow) {
        const cl = button('', 'upgrade-buy', () => club.launder(l.uid));
        cl.innerHTML = `Limpiar ${icon('coin')} ${fmt(launderPrice({ uid: l.uid, id: l.id, tier: l.tier }))}`;
        r.append(cl);
      }
      bagRows.push(r);
    }
    bag.replaceChildren(...(bagRows.length ? bagRows : [el('p', 'facade-intro', 'Tu bolsa está vacía. Las piezas que robes aparecen aquí.')]));

    // the anti-theft protector: for a while nobody can rob this club (robbing someone yourself ends it)
    const guardLeft = Math.max(0, club.crime.guardUntil - Date.now());
    const gHead = el('div', 'upgrade-text');
    gHead.append(
      el('b', '', guardLeft ? `Protegido: ${guardLeft >= 3_600_000 ? `${Math.floor(guardLeft / 3_600_000)} h ${Math.round((guardLeft % 3_600_000) / 60000)} min` : `${Math.max(1, Math.round(guardLeft / 60000))} min`} restantes` : 'Sin protector'),
      el('span', '', 'Mientras esté activo nadie puede asaltar tu club, ni siquiera de noche. Si tú asaltas a alguien, lo pierdes. Se puede acumular hasta 24 horas.'),
    );
    const gRow = el('div', 'guard-row');
    for (const h of RULES.guardHours) {
      const price = guardPrice(levelNow(s), h);
      const b = button('', 'upgrade-buy', () => club.buyGuard(h));
      b.innerHTML = `${h} h<br>${icon('coin')} ${fmt(price)}`;
      b.disabled = s.coins < price || guardLeft + h * 3_600_000 > RULES.guardMaxHours * 3_600_000;
      gRow.append(b);
    }
    const gCard = el('div', 'upgrade');
    gCard.style.flexWrap = 'wrap';
    gCard.append(gHead, gRow);
    guardBox.replaceChildren(gCard);

    // the bank: a loan to buy sooner (the window itself is ui/bank.ts)
    const bk = el('div', 'upgrade');
    const bkText = el('div', 'upgrade-text');
    const loan = s.loan;
    bkText.append(
      el('b', '', loan ? `Debes ${fmt(loan.owed)}${loan.due > 0 ? ` · atrasado ${fmt(loan.due)}` : ''}` : levelNow(s) >= BANK.minLevel ? `Préstamo de hasta ${fmt(lendLimit(s))}` : `El banco presta desde el nivel ${BANK.minLevel}`),
      el('span', '', loan ? `Cuota de ${fmt(loan.installment)} por hora${loan.closed ? ' · club clausurado por el banco' : ''}` : 'Plata hoy, cuotas por hora y una comisión fija.'),
    );
    bk.append(bkText, button('Abrir el banco', 'upgrade-buy', () => { modal.close(); openBank(ctx); }));
    bankBox.replaceChildren(bk);

    // the reviews: what the guests said on leaving, and what to do about the complaints that repeat
    const rv = s.reviews;
    const avg = averageStars(rv);
    const head = el('div', 'review-head');
    head.append(el('b', '', rv.length ? `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))} ${avg.toFixed(1)}` : 'Sin reseñas todavía'), el('span', 'muted', rv.length ? `${rv.length} reseñas recientes` : 'Cuando los invitados se vayan del club dejarán su opinión aquí.'));
    const adviceRows: HTMLElement[] = topComplaints(rv).map((c) => {
      const a = ADVICE[c.tag];
      const r = el('div', 'upgrade hot');
      const tx = el('div', 'upgrade-text');
      tx.append(el('b', '', `${a.title} (${c.count} ${c.count === 1 ? 'queja' : 'quejas'})`), el('span', '', a.text));
      r.append(tx);
      const go = a.where === 'shop' ? button('Ir a la Tienda', 'upgrade-buy', () => { modal.close(); ctx.openShop(); })
        : a.where === 'music' ? button('Abrir la Música', 'upgrade-buy', () => { modal.close(); openMusic(ctx); })
        : a.where === 'decor' ? button('Decorar', 'upgrade-buy', () => { modal.close(); openDecor(ctx); })
        : null;
      if (go) r.append(go);
      return r;
    });
    const list: HTMLElement[] = rv.slice(0, 6).map((x) => {
      const row = el('div', 'review');
      const mins = Math.max(1, Math.round((Date.now() - x.at) / 60000));
      row.append(el('b', '', `${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}`), el('p', '', x.text), el('small', '', `${x.who} · hace ${mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`}`));
      return row;
    });
    reviewsBox.replaceChildren(head, ...(adviceRows.length ? [el('h4', 'review-sub', 'Qué mejorar')] : []), ...adviceRows, ...(list.length ? [el('h4', 'review-sub', 'Lo último que dijeron')] : []), ...list);

    // the reports: who robbed me (with a way to take revenge), my own jobs, and the police visits
    const rep: HTMLElement[] = s.reports.filter((x) => !(x.kind === 'bank' && x.event === 'payment')).slice(0, 8).map((x) => {
      const r = el('div', `upgrade${x.kind === 'robbed' ? ' hot' : ''}`);
      const tx = el('div', 'upgrade-text');
      const what = [x.cash ? `${fmt(x.cash)} monedas` : '', ...x.pieces.map((id) => BY_ID.get(id)?.name ?? id)].filter(Boolean).join(' y ') || 'nada';
      const when = new Date(x.at).toLocaleString('es-CO', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const bankTitle: Record<string, string> = { granted: 'Préstamo del banco', late: 'Cuota atrasada', mora: 'Mora con el banco', embargo: 'Embargo del banco', closure: 'Clausura del banco', reopened: 'Clausura levantada', repaid: 'Deuda pagada de una vez', paid: 'Deuda pagada' };
      const title = x.kind === 'bank' ? bankTitle[x.event ?? ''] ?? 'Banco del Ruido' : x.kind === 'robbed' ? `Te asaltó ${x.byName || 'alguien'}` : x.kind === 'loot' ? `Tu golpe a ${x.byName || 'un club'}` : 'Visita de la Brigada del Ruido';
      tx.append(el('b', '', title), el('span', '', `${when} · ${x.kind === 'police' ? 'multa y decomiso' : x.kind === 'robbed' ? 'se llevó' : 'sacaste'}: ${what}${x.closedUntil > x.at ? ' · clausura' : ''}`));
      r.append(tx);
      if (x.kind === 'robbed' && x.by >= 0 && club.heistApi) r.append(button('Vengarme', 'upgrade-buy', () => { modal.close(); openHeist(ctx, x.by, club.heistApi!); }));
      return r;
    });
    reports.replaceChildren(...(rep.length ? rep : [el('p', 'facade-intro', 'Sin novedades. Aquí aparecen los robos, tus golpes y las visitas de la policía.')]));

    // the big purchase of each stage: the works that make the building bigger
    const ex = nextExpansion(s);
    const exCard = el('div', `upgrade${ex ? '' : ' owned'}`);
    const exText = el('div', 'upgrade-text');
    if (ex) {
      const now = phaseOf(s);
      exText.append(el('b', '', `Ampliación: ${ex.phase.name}`), el('span', '', `De ${now.w}×${now.h} a ${ex.phase.w}×${ex.phase.h} casillas, con sitio para ${ex.phase.maxObjects} objetos. Tus muebles se quedan donde están. Es una obra grande.`));
      if (levelNow(s) < ex.unlockLevel) exText.append(el('span', 'wage', `La obra se abre en el nivel ${ex.unlockLevel}.`));
    } else exText.append(el('b', '', 'Tu club ya es el más grande'), el('span', '', 'No se puede ampliar más.'));
    exCard.append(exText);
    if (ex) {
      const b = button('', 'upgrade-buy', () => {
        if (club.expandClub() === undefined) modal.close(); // so the works can be seen
      });
      b.innerHTML = levelNow(s) < ex.unlockLevel ? `Nivel ${ex.unlockLevel}` : `${icon('coin')} ${fmt(ex.price)}`;
      b.disabled = !expansionState(s).ok;
      exCard.append(b);
    }
    grow.replaceChildren(exCard);

    const next = nextRenovation(s);
    const c = el('div', `upgrade${next ? '' : ' owned'}`);
    const text = el('div', 'upgrade-text');
    if (next) {
      text.append(el('b', '', `Reforma ${next.tier}/${MAX_TIER}: ${next.name}`), el('span', '', `${next.desc} Cada reforma: +12% de lujo, +10% de cover y gente más contenta.`));
      if (levelNow(s) < next.unlockLevel) text.append(el('span', 'wage', `Se desbloquea en el nivel ${next.unlockLevel}.`));
    } else text.append(el('b', '', 'Tu club tiene todas las reformas'), el('span', '', 'Es un icono de la ciudad.'));
    c.append(text);
    if (next) {
      const b = button('', 'upgrade-buy', () => club.renovate());
      b.innerHTML = levelNow(s) < next.unlockLevel ? `Nivel ${next.unlockLevel}` : `${icon('coin')} ${fmt(next.price)}`;
      b.disabled = levelNow(s) < next.unlockLevel;
      c.append(b);
    }
    reform.replaceChildren(c);
    // what the next levels open, so people know what they are playing towards
    const lv = levelNow(s);
    const rows: HTMLElement[] = [];
    for (let l = lv + 1; l <= lv + 60 && rows.length < 3; l++) {
      const list = unlocksAt(l);
      if (!list.length) continue;
      const row = el('div', 'upgrade');
      const text = el('div', 'upgrade-text');
      text.append(el('b', '', `Nivel ${l} · faltan ${l - lv} ${l - lv === 1 ? 'nivel' : 'niveles'}`));
      for (const u of list.slice(0, 5)) text.append(el('span', '', `• ${u.name} (${u.place})`));
      if (list.length > 5) text.append(el('span', '', `• y ${list.length - 5} más`));
      row.append(text);
      rows.push(row);
    }
    soon.replaceChildren(...(rows.length ? rows : [el('p', 'facade-intro', 'Ya abriste todo lo que hay por ahora.')]));
  };
  unsub = reactive(
    ctx,
    () => {
      const s = club.state;
      const next = nextRenovation(s);
      const furniture = s.items.filter((i) => BOOTH_IDS.includes(i.id) || BY_ID.get(i.id)?.category === 'bars').map((i) => [i.id, i.x, i.y, i.rot]);
      return JSON.stringify([club.crime.guardUntil, s.reviews[0]?.id, s.loot, s.staff, levelNow(s), s.renovation, s.phase, expansionState(s).ok, STAFF.map((d) => s.coins >= d.hire), next ? s.coins >= next.price : 0, furniture]);
    },
    draw,
    live,
  );
}
