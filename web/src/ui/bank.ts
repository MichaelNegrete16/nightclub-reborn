import { BY_ID } from '../core/catalog';
import { BANK, lendLimit, payoffPrice, quote, whyNotLend } from '../core/bank';
import { TIER_NAMES } from '../core/tiers';
import { button, el, fmt } from './dom';
import { icon } from './icons';
import { openModal } from './modal';
import { reactive } from './live';
import type { Ctx } from './shop';

/** "Banco del Ruido": ask for a loan, see what is owed and when the next installment falls due, pay it off. The server keeps the books. */
export function openBank(ctx: Ctx): void {
  const club = ctx.club;
  let unsub = () => {};
  const modal = openModal('Banco del Ruido', 'bank', () => unsub());
  const coins = el('div', 'pill coins');
  modal.headExtra.append(coins);
  const body = el('div', 'bank-body');
  modal.body.append(body);
  let share = 0.5; // how much of the limit to ask for

  const stat = (label: string, value: string, cls = '') => {
    const d = el('div', `bank-stat ${cls}`);
    d.append(el('span', '', label), el('b', '', value));
    return d;
  };

  const draw = () => {
    const s = club.state;
    const now = Date.now();
    body.replaceChildren();
    const loan = s.loan;

    if (!loan) {
      const why = whyNotLend(s, now);
      const limit = lendLimit(s);
      const amount = Math.max(1000, Math.round((limit * share) / 1000) * 1000);
      const q = quote(Math.min(amount, limit));
      body.append(
        el('p', 'facade-intro', 'Plata hoy para comprar antes, y la pagas en 12 cuotas, una por hora de juego. Una comisión fija, sin intereses que se disparen.'),
        stat('El banco te presta hasta', `${fmt(limit)} monedas`),
      );
      if (why) {
        body.append(el('p', 'bank-why', why));
      } else {
        const row = el('div', 'bank-shares');
        for (const sh of [0.25, 0.5, 0.75, 1]) {
          const b = button(`${Math.round(sh * 100)}%`, `btn${Math.abs(share - sh) < 1e-6 ? ' primary' : ''}`, () => {
            share = sh;
            draw();
          });
          row.append(b);
        }
        const ask = button('', 'btn primary', () => club.bankOp('loan', amount));
        ask.innerHTML = `Pedir ${icon('coin')} ${fmt(Math.min(amount, limit))}`;
        body.append(
          row,
          stat('Recibes ahora', `${fmt(Math.min(amount, limit))}`),
          stat(`Comisión (${Math.round(BANK.feeShare * 100)}%)`, `${fmt(q.fee)}`),
          stat('Debes en total', `${fmt(q.owed)}`),
          stat(`${BANK.installments} cuotas de`, `${fmt(q.installment)} por hora`),
          ask,
        );
      }
    } else {
      const due = loan.due;
      const minsLeft = Math.max(1, BANK.cycleMinutes - loan.cycle);
      const price = payoffPrice(loan);
      body.append(
        loan.closed ? el('p', 'bank-why', 'El banco cerró tu club. Ponte al día con lo atrasado para volver a abrir.') : el('p', 'facade-intro', 'Cada hora el banco cobra su cuota de la caja de tu club. Si no alcanza, queda atrasada.'),
        stat('Debes', `${fmt(loan.owed)}`),
        stat('Cuota por hora', `${fmt(loan.installment)}`),
        stat('Atrasado', due > 0 ? `${fmt(due)}` : 'Nada', due > 0 ? 'bad' : 'good'),
        stat('Próxima cuota en', `${minsLeft} min`),
      );
      if (loan.arrears > 0) {
        const next = loan.arrears < BANK.moraAt ? `a las ${BANK.moraAt} horas, mora` : loan.arrears < BANK.embargoAt ? `a las ${BANK.embargoAt} horas, embargo` : loan.arrears < BANK.closeAt ? `a las ${BANK.closeAt} horas, clausura` : 'club clausurado';
        body.append(el('p', 'bank-why', `Llevas ${loan.arrears} ${loan.arrears === 1 ? 'hora' : 'horas'} de atraso (${next}).`));
      }
      const row = el('div', 'bank-actions');
      const pay = (amount: number | 'all', label: string, disabled = false, cls = 'btn') => {
        const b = button(label, cls, () => club.bankOp('repay', amount));
        b.disabled = disabled;
        row.append(b);
      };
      const next = due > 0 ? due : loan.installment;
      pay(next, `${due > 0 ? 'Ponerme al día' : 'Adelantar una cuota'} · ${fmt(Math.min(next, loan.owed))}`, s.coins < 1, 'btn primary');
      pay(Math.max(1, Math.ceil(loan.owed * 0.25)), `Abonar 25% · ${fmt(Math.ceil(loan.owed * 0.25))}`, s.coins < 1);
      pay('all', `Pagar todo · ${fmt(price)} (ahorras ${fmt(loan.owed - price)})`, s.coins < price, 'btn');
      body.append(row);
      if (s.embargoed.length) {
        const held = el('div', 'bank-held');
        held.append(el('b', '', 'El banco tiene estas piezas (vuelven a tu bolsa al terminar de pagar):'));
        for (const p of s.embargoed) held.append(el('span', '', `${BY_ID.get(p.id)?.name ?? p.id} · ${TIER_NAMES[p.tier - 1]}`));
        body.append(held);
      }
    }

    body.append(
      el('h4', 'review-sub', 'Cómo funciona'),
      el('p', 'sub', `Se presta desde el nivel ${BANK.minLevel}, un préstamo a la vez. Una hora son 60 minutos con el servidor encendido y tú libre: si el servidor está apagado o estás en prisión, el reloj se detiene. Atrasarte ${BANK.moraAt} horas trae recargo y mal crédito (2 días sin préstamos); ${BANK.embargoAt}, un embargo de tu pieza más valiosa que no sea esencial; ${BANK.closeAt}, la clausura del club. Pagar todo antes te perdona la mitad de la comisión que quede. La deuda cuenta contra tu riqueza.`),
    );
    live();
  };
  const live = () => {
    coins.innerHTML = `${icon('coin')} ${fmt(club.state.coins)}`;
  };
  unsub = reactive(
    ctx,
    () => {
      const s = club.state;
      const price = s.loan ? payoffPrice(s.loan) : 0;
      return JSON.stringify([s.loan, s.embargoed, s.badCreditUntil > Date.now(), Math.floor(s.xp / 1000), share, s.coins >= 1, s.coins >= price]);
    },
    draw,
    live,
  );
}
