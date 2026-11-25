// The bank's scenes: what the player sees when the Banco del Ruido acts. Built from the letter the server sent, so they show exactly what
// happened (which pieces were taken, how much is due). Pure logic: each one is a Scene for the comic player (ui/dialogue.ts).

import { BY_ID } from './catalog.ts';
import type { Mail } from './mail.ts';
import type { Scene } from './story.ts';

const list = (names: string[]): string => (names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);
const money = (n: number): string => n.toLocaleString('es-CO');

/** The events that get a scene (the routine ones are only a notice). */
export const SCENE_EVENTS = ['granted', 'mora', 'embargo', 'closure'];

/** The scene for a `bank` letter, or null if that event has none. */
export function bankScene(m: Mail, name: string): Scene | null {
  const b = m.bank;
  if (!b || !SCENE_EVENTS.includes(b.event)) return null;
  const loan = b.loan;
  if (b.event === 'granted') {
    return {
      id: `bank-granted-${m.id}`,
      title: 'Préstamo aprobado',
      phase: 0,
      lines: [
        { who: 'narrator', shot: 'bankdesk', text: 'El Banco del Ruido huele a madera vieja y a plata ajena. Detrás del escritorio, un hombre de lentes cuenta billetes sin mirarlos.' },
        { who: 'bruno', text: `Buenas, ${name}. Aquí tiene ${money(b.delta)} monedas. Es plata del banco, y el banco la quiere de vuelta.` },
        { who: 'narrator', text: `Firmas. ${money(loan?.owed ?? 0)} en total: doce cuotas de ${money(loan?.installment ?? 0)}, una por hora, con una comisión fija. Sin letras chiquitas. Casi.` },
        { who: 'bruno', text: 'No me haga ir hasta su local. Nunca es una buena visita.' },
        { who: 'you', text: 'Tranquilo, don Bruno. La pista paga.' },
      ],
    };
  }
  if (b.event === 'mora') {
    return {
      id: `bank-mora-${m.id}`,
      title: 'Toc, toc',
      phase: 0,
      lines: [
        { who: 'narrator', shot: 'bankdoor', text: 'Tres golpes secos en la puerta del club. Una camioneta negra con el letrero del banco espera con el motor prendido.' },
        { who: 'bruno', text: `Soy yo, ${name}. Tres horas de atraso: ${money(loan?.due ?? 0)} monedas. Le cargo un recargo y el banco ya no le presta por dos días.` },
        { who: 'you', text: 'Ahorita me pongo al día, don Bruno.' },
        { who: 'bruno', text: 'Ojalá. La próxima vez no vengo a hablar: vengo a llevarme algo suyo.' },
      ],
    };
  }
  if (b.event === 'embargo') {
    const names = b.taken.map((p) => BY_ID.get(p.id)?.name ?? p.id);
    const payload = b.taken.map((p) => p.id).join(',');
    return {
      id: `bank-embargo-${m.id}`,
      title: 'Embargo',
      phase: 0,
      lines: [
        { who: 'narrator', shot: `embargo|${payload}`, text: 'Don Bruno llegó con dos cargadores y una camioneta. Sellos rojos en cada pieza: EMBARGADO.' },
        { who: 'bruno', text: `Me llevo ${list(names.map((n) => n.toLowerCase())) || 'una pieza'}. El banco se lo guarda y se lo devuelve el día que termine de pagar.` },
        { who: 'you', text: '¡Eso era lo más bonito del club!' },
        { who: 'bruno', text: 'Por eso lo escogí. Y si el atraso sigue, la próxima visita es para cerrar la puerta.' },
      ],
    };
  }
  return {
    id: `bank-closure-${m.id}`,
    title: 'Clausurado',
    phase: 0,
    lines: [
      { who: 'narrator', shot: 'shut', text: 'Una cadena gruesa cruza la puerta y un sello rojo la cierra: CLAUSURADO POR EL BANCO.' },
      { who: 'bruno', text: `Su club queda cerrado hasta que se ponga al día con ${money(loan?.due ?? 0)} monedas. Cuando pague, yo mismo le abro.` },
      { who: 'you', text: 'Voy a pagar, don Bruno. Solo deme un respiro.' },
      { who: 'narrator', text: 'Oficina › Banco: ahí puedes ponerte al día. Vendiendo una pieza o esperando las ganancias, lo que llegue primero.' },
    ],
  };
}
