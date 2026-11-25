// Reviews: guests who leave the club say what they thought, and the owner reads them in the office to know what to improve.
// Pure logic: the simulation gives the facts of a visit, this turns them into stars, a line and the tags behind it.

export type Tag = 'musica' | 'fila' | 'asientos' | 'barra' | 'bartender' | 'pista' | 'lleno' | 'decoracion' | 'sonido' | 'musica+' | 'lujo+' | 'ambiente+';

export interface Review {
  id: string;
  /** when it was written (ms) */
  at: number;
  stars: number;
  text: string;
  tags: Tag[];
  who: string;
}

/** What the simulation knows about a visit when the guest leaves. */
export interface Facts {
  happiness: number;
  liking: 'love' | 'ok' | 'dislike' | 'silence';
  /** seconds spent in line */
  waited: number;
  seats: number;
  barSlots: number;
  danceTiles: number;
  inside: number;
  capacity: number;
  luxury: number;
  rating: number;
  /** better speakers and seats make the crowd happier (0 = basement) */
  gearComfort: number;
  hasBartender: boolean;
}

const NAMES = ['Camila', 'Andrés', 'Valentina', 'Sebastián', 'Daniela', 'Mateo', 'Laura', 'Juan', 'Sofía', 'Carlos', 'Isabella', 'Felipe', 'Manuela', 'David', 'Paula', 'Santiago', 'Luisa', 'Esteban', 'Mariana', 'Jhon'];
const INITIALS = 'ABCDEFGHJKLMNPRSTV';

const SAYS: Record<Tag, string[]> = {
  musica: ['La música no era lo mío.', 'Pusieron un género que no me gusta.', 'Cambien la música, por favor.'],
  fila: ['Esperé demasiado en la fila.', 'La fila no avanza nunca.'],
  asientos: ['No había dónde sentarse.', 'Faltan sillas y sofás.'],
  barra: ['La barra estaba muy lenta.', 'Pocos puestos para pedir un trago.'],
  bartender: ['Nadie atendía la barra.', 'Sin bartender es difícil tomarse algo.'],
  pista: ['La pista es muy chiquita para bailar.', 'Faltan baldosas para bailar.'],
  lleno: ['Estaba lleno hasta el techo, ni se podía caminar.'],
  decoracion: ['El lugar se ve pelado, le falta decoración.'],
  sonido: ['El sonido se escucha mal, mejoren los altavoces.'],
  'musica+': ['La música estuvo brutal.', 'Justo la canción que quería escuchar.'],
  'lujo+': ['Se nota el lujo, está espectacular.'],
  'ambiente+': ['Qué buen ambiente tiene este club.'],
};

/** What to do about each complaint, and where in the game. */
export const ADVICE: Record<string, { title: string; text: string; where: 'shop' | 'music' | 'team' | 'decor' | 'office' }> = {
  musica: { title: 'La música no les gusta', text: 'Mira Música › "Lo que le gusta a tu público" y pon canciones del género que más se repite.', where: 'music' },
  fila: { title: 'La fila es muy larga', text: 'Sube el aforo (más pista y asientos), contrata un guardia o amplía el local.', where: 'shop' },
  asientos: { title: 'Faltan asientos', text: 'Compra sillas, sofás o puffs: la gente que se sienta se queda más tiempo.', where: 'shop' },
  barra: { title: 'La barra se queda corta', text: 'Compra otra barra o una barra de cócteles: más puestos, más tragos vendidos.', where: 'shop' },
  bartender: { title: 'Nadie atiende la barra', text: 'Contrata un bartender en la Oficina: sirve mejor y cobra más caro cada trago.', where: 'team' },
  pista: { title: 'La pista es pequeña', text: 'Pon más baldosas de pista: cada baldosa deja bailar a una persona más.', where: 'shop' },
  lleno: { title: 'El club está lleno', text: 'Es buena señal: amplía el local en la Oficina para que quepa más gente.', where: 'office' },
  decoracion: { title: 'El local se ve pelado', text: 'Decora el interior (paredes, piso, luces y cuadros) y compra objetos de lujo.', where: 'decor' },
  sonido: { title: 'El sonido es malo', text: 'Mejora los altavoces y la cabina del DJ a una versión mejor.', where: 'shop' },
};

/** Stars from how the guest felt, then taken down by a long wait. */
export function starsFor(happiness: number, waited: number): number {
  const base = happiness >= 80 ? 5 : happiness >= 62 ? 4 : happiness >= 45 ? 3 : happiness >= 28 ? 2 : 1;
  return Math.max(1, base - (waited > 50 ? 1 : 0));
}

/** The complaints that apply, most important first. */
export function complaints(f: Facts): Tag[] {
  const out: Tag[] = [];
  if (f.liking === 'dislike' || f.liking === 'silence') out.push('musica');
  if (f.waited > 45) out.push('fila');
  if (f.seats < Math.max(2, f.inside * 0.25)) out.push('asientos');
  if (f.barSlots < Math.max(1, f.inside * 0.15)) out.push('barra');
  if (f.barSlots > 0 && !f.hasBartender && f.inside >= 6) out.push('bartender');
  if (f.danceTiles < Math.max(3, f.inside * 0.4)) out.push('pista');
  if (f.inside >= f.capacity * 0.95 && f.capacity >= 8) out.push('lleno');
  if (f.gearComfort < 1) out.push('sonido');
  if (f.luxury < 60) out.push('decoracion');
  return out;
}

export function composeReview(rand: () => number, f: Facts): Pick<Review, 'stars' | 'text' | 'tags' | 'who'> {
  const stars = starsFor(f.happiness, f.waited);
  const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length) % a.length];
  const who = `${pick(NAMES)} ${pick([...INITIALS])}.`;
  let tags: Tag[];
  if (stars <= 3) {
    tags = complaints(f).slice(0, 2);
    if (!tags.length) return { stars, text: stars === 3 ? 'Estuvo bien, nada especial.' : 'No me terminó de convencer.', tags: [], who };
  } else {
    tags = [];
    if (f.liking === 'love') tags.push('musica+');
    if (f.luxury >= 200) tags.push('lujo+');
    if (f.rating >= 70) tags.push('ambiente+');
    tags = tags.slice(0, 2);
    if (!tags.length) return { stars, text: 'Me la pasé muy bien.', tags: [], who };
  }
  return { stars, text: tags.map((t) => pick(SAYS[t])).join(' '), tags, who };
}

export function averageStars(reviews: readonly Review[]): number {
  return reviews.length ? Math.round((reviews.reduce((a, r) => a + r.stars, 0) / reviews.length) * 10) / 10 : 0;
}

/** The complaints that appear most in the reviews, with how many times: what the owner should work on first. */
export function topComplaints(reviews: readonly Review[], limit = 3): Array<{ tag: string; count: number }> {
  const count = new Map<string, number>();
  for (const r of reviews) for (const t of r.tags) if (t in ADVICE) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].map(([tag, n]) => ({ tag, count: n })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export const MAX_REVIEWS = 40;
