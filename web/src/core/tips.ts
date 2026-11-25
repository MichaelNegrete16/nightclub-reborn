// The guide: short "te explico" cards that appear the first time something becomes useful, one at a time, and are kept in a
// Guide the player can read again. Pure logic: what is true about the game decides which tip is next.

import { levelNow, type ClubState } from './club.ts';
import { nextExpansion } from './expansion.ts';

export interface TipCtx {
  state: ClubState;
  online: boolean;
  /** heat with the police, 0 to 100 */
  heat: number;
  /** windows opened during this session (by their class: shop, inventory, office, music, missions, facade, decor, heist) */
  opened: ReadonlySet<string>;
}

export interface Tip {
  id: string;
  /** an icon name from ui/icons.ts */
  icon: string;
  title: string;
  text: string;
  /** an element to ring while the tip is up */
  target?: string;
  /** true when it is time to explain this */
  when(c: TipCtx): boolean;
  /** what the Guide says while it is still locked */
  locked: string;
}

const staffCount = (s: ClubState) => s.staff.guard + s.staff.dj + s.staff.bartender;

export const TIPS: Tip[] = [
  { id: 'shop', icon: 'shop', title: 'La Tienda', text: 'Lo que compras va a tu Inventario. Elígelo y haz clic en el piso para colocarlo. Si no te cabe, amplía el local.', when: (c) => c.opened.has('shop'), locked: 'Se explica la primera vez que abras la Tienda.' },
  { id: 'inventory', icon: 'inventory', title: 'El Inventario', text: 'Aquí está lo que ya compraste y todavía no pones. Vender una pieza te devuelve la mitad de lo que pagaste.', when: (c) => c.opened.has('inventory'), locked: 'Se explica la primera vez que abras el Inventario.' },
  { id: 'missions', icon: 'missions', title: 'Las misiones', text: 'Cada misión paga monedas y mucha experiencia. Completarlas es la forma más rápida de subir de nivel.', when: (c) => c.opened.has('missions'), locked: 'Se explica la primera vez que abras las Misiones.' },
  { id: 'office', icon: 'monitor', title: 'Tu oficina', text: 'Aquí contratas DJ, guardia y bartender, ves cuánto ganas por minuto y amplías el local.', when: (c) => c.opened.has('office'), locked: 'Se explica la primera vez que abras la Oficina.' },
  { id: 'music', icon: 'music', title: 'La música', text: 'Cada invitado tiene su género favorito. Pon canciones que le gusten a la mayoría: sube el ambiente y atrae famosos.', when: (c) => c.opened.has('music'), locked: 'Se explica la primera vez que abras la Música.' },
  { id: 'facade', icon: 'street', title: 'La fachada', text: 'La pintura, el toldo y el letrero se ven desde la calle y traen más gente a la puerta.', when: (c) => c.opened.has('facade'), locked: 'Se explica la primera vez que abras la Fachada.' },
  { id: 'decor', icon: 'monitor', title: 'Decorar el interior', text: 'Paredes, piso, luces y cuadros suman lujo, y el lujo atrae más invitados.', when: (c) => c.opened.has('decor'), locked: 'Se explica la primera vez que abras la decoración.' },
  { id: 'queue', icon: 'guests', title: 'La fila', text: 'Si el club se llena, la gente espera afuera y algunos se cansan y se van. Más pista y más asientos suben el aforo.', when: (c) => c.state.stats.guests >= 8, locked: 'Se explica cuando pasen tus primeros 8 invitados.' },
  { id: 'staff', icon: 'monitor', title: 'Tu primer empleado', text: 'Un bartender o un DJ trabaja por ti. Cuestan un sueldo por minuto, pero el club rinde más.', target: '.bb[data-id="office"]', when: (c) => levelNow(c.state) >= 3 && staffCount(c.state) === 0, locked: 'Se explica en el nivel 3.' },
  { id: 'upgrade', icon: 'luxury', title: 'Mejorar objetos', text: 'Toca una pieza de tu club y pulsa Mejorar. Cada versión suena y se ve mejor, y cuesta menos que comprarla nueva.', when: (c) => levelNow(c.state) >= 4 && c.state.items.length >= 3, locked: 'Se explica en el nivel 4.' },
  { id: 'rating', icon: 'star', title: 'El ambiente', text: 'Sube con música que le guste a tu público, lujo y un buen DJ. Con 78 o más vienen los famosos.', when: (c) => c.state.stats.bestRating >= 50, locked: 'Se explica cuando tu ambiente pase de 50.' },
  { id: 'vip', icon: 'star', title: 'Los famosos', text: 'Un famoso espera en la puerta. Revísalo antes de dejarlo pasar: algunos son impostores y te hacen perder plata.', when: (c) => c.state.stats.vips >= 1 || c.state.stats.bestRating >= 78, locked: 'Se explica cuando llegue el primero.' },
  { id: 'city', icon: 'city', title: 'No estás solo', text: 'Toca el club de un vecino para visitarlo, o camina hasta su puerta. El minimapa de la esquina muestra dónde está cada uno.', when: (c) => c.online && levelNow(c.state) >= 2, locked: 'Se explica al conectarte a la ciudad.' },
  { id: 'expansion', icon: 'monitor', title: 'Ya puedes ampliar', text: 'Oficina › Ampliación del local. Cuesta bastante, pero tu club crece y entra más gente.', target: '.bb[data-id="office"]', when: (c) => { const e = nextExpansion(c.state); return !!e && levelNow(c.state) >= e.unlockLevel; }, locked: 'Se explica cuando se abra la siguiente ampliación.' },
  { id: 'ranking', icon: 'star', title: 'El ranking de la ciudad', text: 'La píldora "Puesto" de arriba muestra dónde está tu club frente a los demás. Los mejor puestos reciben más gente; los últimos, menos. Súbela con ambiente, lujo y buenas reseñas.', when: (c) => c.online && levelNow(c.state) >= 3, locked: 'Se explica al conectarte a la ciudad, desde el nivel 3.' },
  { id: 'reviews', icon: 'guests', title: 'Las reseñas', text: 'Tus invitados dejan opiniones al irse. Mira Oficina › Reseñas: te dicen qué mejorar y adónde ir. Las estrellas también suben tu fama en el ranking.', when: (c) => c.state.reviews.length >= 3, locked: 'Se explica cuando lleguen tus primeras reseñas.' },
  { id: 'prepare', icon: 'shop', title: 'Prepárate antes del nivel 10', text: 'Desde el nivel 10 los demás jugadores pueden asaltarte. Ve a Tienda › Seguridad: alarma, cámara y caja fuerte te protegen. Las misiones de seguridad te dan monedas y experiencia.', when: (c) => levelNow(c.state) >= 8, locked: 'Se explica en el nivel 8.' },
  { id: 'dance', icon: 'dance', title: 'Baila', text: 'El botón Bailar (o la tecla B) abre tus bailes: dancehall, salsa, hip hop y más. Los demás jugadores te ven bailar, y se mueve al ritmo de la música. Caminar te hace parar.', when: (c) => levelNow(c.state) >= 2, locked: 'Se explica en el nivel 2.' },
  { id: 'cage', icon: 'star', title: 'La jaula de baile', text: 'Tienda › Shows. La bailarina atrae gente y deja propinas de los que la miran: pon sofás y pista cerca. Mejórala y rinde mucho más. Cobra sueldo mientras el club está abierto.', when: (c) => levelNow(c.state) >= 14, locked: 'Se explica en el nivel 14.' },
  { id: 'defense', icon: 'shop', title: 'Protege tu club', text: 'Desde ahora pueden asaltarte, incluso cuando no estás. En Tienda › Seguridad hay alarma, caja fuerte y vitrina blindada.', when: (c) => levelNow(c.state) >= 10, locked: 'Se explica en el nivel 10.' },
  { id: 'heist', icon: 'street', title: 'Asaltos', text: 'Toca el club de un vecino y pulsa Asaltar. Zeta vende el equipo. Si sale bien, lo robado queda caliente: la policía lo busca.', when: (c) => levelNow(c.state) >= 10 && c.opened.has('office'), locked: 'Se explica en el nivel 10.' },
  { id: 'police', icon: 'guests', title: 'La Brigada del Ruido', text: 'Tu calor subió. Con calor alto la policía pasa por tu club, multa y puede clausurarlo. Baja solo con las horas, o lava las piezas con Zeta.', when: (c) => c.heat >= 30, locked: 'Se explica cuando tu calor pase de 30.' },
];

export const TIP_BY_ID = new Map(TIPS.map((t) => [t.id, t]));

/** The next tip to show: the first in the list that is due and not seen. */
export function nextTip(c: TipCtx): Tip | null {
  const seen = new Set(c.state.story.tips);
  for (const t of TIPS) if (!seen.has(t.id) && t.when(c)) return t;
  return null;
}

export function markTipSeen(state: ClubState, id: string): ClubState {
  if (state.story.tips.includes(id)) return state;
  return { ...state, story: { ...state.story, tips: [...state.story.tips, id] } };
}
