// The arrest scene: what the player sees when the Brigada del Ruido takes them to prison. Built from the letter the server sent
// (who was robbed, what was taken or attempted, with what, and how long the club stays shut), so it shows exactly what happened.
// Pure logic: it makes a Scene for the comic player (ui/dialogue.ts).

import { BY_ID } from './catalog.ts';
import { KIT_BY_ID } from './heist.ts';
import type { Mail } from './mail.ts';
import type { Scene } from './story.ts';

const list = (names: string[]): string => (names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);

/** The scene for a `jail` letter. */
export function arrestScene(m: Mail, name: string): Scene {
  const victim = m.byName || 'otro club';
  const items = m.pieces.map((p) => BY_ID.get(p.id)?.name ?? p.id);
  const cash = m.stolenCash ?? 0;
  const goal = m.chores ?? 20;
  const kits = (m.kitsUsed ?? []).map((k) => KIT_BY_ID.get(k)?.name.toLowerCase() ?? k);
  const how = kits.length ? `con ${list(kits)}` : 'sin ningún equipo, por la puerta de atrás';
  const convicted = m.story === 'convicted';
  const took = [items.length ? list(items.map((i) => i.toLowerCase())) : '', cash ? `${cash.toLocaleString('es-CO')} monedas` : ''].filter(Boolean).join(' y ');
  const payload = `${m.pieces.map((p) => p.id).join(',')}|${cash}|${convicted ? '1' : '0'}`;
  const fine = m.cash.toLocaleString('es-CO');
  return {
    id: `arrest-${m.id}`,
    title: convicted ? 'La Brigada llega' : 'Te atraparon',
    phase: 0,
    lines: [
      { who: 'narrator', shot: `raid|${victim}`, text: 'Las sirenas rompieron la noche. Las luces rojas y azules llenaron la puerta del club.' },
      { who: 'ferro', text: `Alto ahí, ${name}. Tenemos un reporte de robo contra ${victim}.` },
      { who: 'narrator', shot: `evidence|${payload}`, text: convicted
        ? `Sobre la mesa de pruebas quedó todo: ${took || 'lo que se llevó'}. Lo hizo ${how}.`
        : `Sobre la mesa de pruebas: el equipo que usaste ${how}${items.length ? `, y la pieza que querías: ${list(items.map((i) => i.toLowerCase()))}` : ''}. No alcanzaste a llevarte nada.` },
      { who: 'ferro', text: convicted ? `${victim} lo vio todo, y en este barrio la música se respeta, no se roba.` : 'La alarma sonó y no saliste a tiempo. En este barrio la música se respeta, no se roba.' },
      { who: 'narrator', shot: 'cell', text: `Te llevan a prisión. No sales hasta hacer ${goal} tareas: limpiar baños, trapear, lavar platos... Tu club queda cerrado y pagas ${fine} de multa.` },
      { who: 'you', text: 'Vaya noche... la próxima lo pienso dos veces.' },
    ],
  };
}
