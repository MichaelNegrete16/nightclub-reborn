// Story, scenes and missions. Pure data and rules: the UI plays the scenes and shows the missions.
// Main arc: you inherit your late uncle's basement club, "El Sótano". His dream was to play at Neón Fest, the biggest
// festival in the world. His old partner turned rival, Zeta, shut him out. You finish what he started.
// The missions of chapter 1 are also the tutorial: each one teaches one part of the game.

import { BY_ID } from './catalog.ts';
import { PRICE_SCALE } from './pricing.ts';
import { addXp, levelNow, soundSystem, statsOf, type ClubState } from './club.ts';

export interface Speaker {
  name: string;
  role: string;
}

export const SPEAKERS: Record<string, Speaker> = {
  narrator: { name: '', role: '' },
  beto: { name: 'Tío Beto', role: 'DJ legendario del Sótano' },
  rosa: { name: 'Rosa', role: 'La reina de la barra' },
  zeta: { name: 'Zeta', role: 'Dueño de los clubes Eclipse' },
  ferro: { name: 'Comisario Ferro', role: 'Brigada del Ruido' },
  you: { name: '{name}', role: 'Tú' },
};

export interface Choice {
  label: string;
  /** value stored as {motive} for the lines that follow */
  value: string;
}

export interface Line {
  who: keyof typeof SPEAKERS | string;
  text: string;
  choice?: Choice[];
  /** only shown if the player's motive matches */
  onlyIf?: string;
  /** comic panel that illustrates this line (stays until another line names a different one) */
  shot?: string;
  /** small second panel (a daydream, a memory) shown on top of the main one; "" clears it */
  inset?: string;
}

export interface Scene {
  id: string;
  title: string;
  /** shown once, when the club reaches this phase (0 = the very beginning) */
  phase: number;
  lines: Line[];
}

export const SCENES: Scene[] = [
  {
    id: 'intro',
    title: 'El Sótano',
    phase: 0,
    lines: [
      { who: 'narrator', text: 'Ciudad Neón. Medianoche. Llueve.', shot: 'city' },
      { who: 'narrator', text: 'Llegas a una puerta oxidada con un letrero apagado: EL SÓTANO.', shot: 'door' },
      { who: 'beto', text: 'Si estás leyendo esto, ya eres dueño del Sótano. Perdona el polvo: no tuve tiempo de barrer.', shot: 'letter' },
      { who: 'beto', text: 'Toqué treinta años en este hueco. Nunca llegué a Neón Fest, el festival donde suenan los más grandes del mundo. Era mi sueño.', shot: 'beto_dream' },
      { who: 'beto', text: 'Te dejo mi cabina y un disco: La Pista Cero. No lo toques todavía. Ese disco se toca en el escenario grande, o no se toca.', shot: 'record' },
      {
        who: 'narrator',
        text: '¿Por qué viniste?',
        shot: 'inside',
        choice: [
          { label: 'Por ti, Tío Beto', value: 'beto' },
          { label: 'Quiero ser el mejor DJ del mundo', value: 'best' },
          { label: 'Necesitaba empezar de cero', value: 'fresh' },
        ],
      },
      { who: 'you', text: 'Prometí terminar lo que empezaste, Tío.', onlyIf: 'beto' },
      { who: 'you', text: 'Voy a tocar en Neón Fest. Y no pienso parar hasta ser el número uno.', onlyIf: 'best' },
      { who: 'you', text: 'No tengo nada que perder. Este sótano es mi segunda oportunidad.', onlyIf: 'fresh' },
      { who: 'rosa', text: 'Entonces ya llegaste. Soy Rosa. Llevo veinte años detrás de esa barra y tu tío me dejó a cargo... de ti.', shot: 'rosa_bar' },
      { who: 'rosa', text: 'Mira esta pista vacía. Hoy es silencio. Pronto será la mejor fiesta de la ciudad. Pero se arma paso a paso.', shot: 'empty_floor', inset: 'dream_party' },
      { who: 'zeta', text: '¿Un sótano? Qué tierno. Soy Zeta, dueño de los clubes Eclipse. Beto nunca pasó del primer escalón. Tú tampoco.', shot: 'zeta', inset: '' },
      { who: 'zeta', text: 'Cuando quieras vender el terreno, me llamas. Tengo muchos estacionamientos que construir.' },
      { who: 'you', text: 'Nos vemos en Neón Fest, Zeta.' },
      { who: 'rosa', text: 'Así se habla. Vamos a armar tu discoteca juntos: primero la pista, luego la cabina, luego la barra. Yo te guío.', shot: 'rosa_bar' },
      { who: 'narrator', text: 'Tu meta: llenar el Sótano, crecer club a club y subir al escenario de Neón Fest como el DJ número uno del mundo.', shot: 'neon_fest' },
    ],
  },
  {
    id: 'ch2',
    title: 'Bar de barrio',
    phase: 2,
    lines: [
      { who: 'narrator', text: 'El Sótano ya no es un sótano: es un bar de barrio con nombre propio.' },
      { who: 'rosa', text: 'Los vecinos hablan de ti, {name}. Hasta preguntan por tu música.' },
      { who: 'zeta', text: 'Un bar de barrio... los comienzos son tiernos. Te regalo un consejo: sin lujo no hay multitud.' },
      { who: 'rosa', text: 'Ni lo escuches. Aunque... decora. El lujo atrae gente, y la gente llena la caja.' },
    ],
  },
  {
    id: 'ch3',
    title: 'Club',
    phase: 3,
    lines: [
      { who: 'narrator', text: 'Ahora tienes un club de verdad, con zona VIP y todo.' },
      { who: 'rosa', text: 'Hay algo que debes saber. Zeta y tu tío fueron socios. Juntos soñaron Neón Fest.' },
      { who: 'rosa', text: 'Zeta se quedó con los clubes... y con la fama. Y le cerró las puertas del festival a Beto.' },
      { who: 'you', text: 'Entonces no es solo un sueño. Es una deuda.' },
    ],
  },
  {
    id: 'ch4',
    title: 'Club grande',
    phase: 4,
    lines: [
      { who: 'narrator', text: 'Dos plantas, luces por todas partes. La ciudad empieza a mirarte.' },
      { who: 'zeta', text: 'Ya me estás estorbando, {name}. Dos plantas... ¿y ahora qué, un escenario?' },
      { who: 'rosa', text: 'Que hable. Tú sigue construyendo.' },
    ],
  },
  {
    id: 'ch5',
    title: 'Mega club',
    phase: 5,
    lines: [
      { who: 'narrator', text: 'Las radios piden tu nombre. Las filas dan la vuelta a la cuadra.' },
      { who: 'rosa', text: 'Tu tío estaría orgulloso. Pero Neón Fest no regala nada: solo suben los que llenan estadios.' },
    ],
  },
  {
    id: 'ch6',
    title: 'Rooftop',
    phase: 6,
    lines: [
      { who: 'narrator', text: 'Desde la azotea, la ciudad entera late a tu ritmo.' },
      { who: 'zeta', text: 'Te propongo un trato: te hago socio de Eclipse. Dejas el Sótano y todos ganamos.' },
      { who: 'you', text: 'No vendo lo que me dejó mi tío. Ni por todo tu dinero.' },
    ],
  },
  {
    id: 'ch7',
    title: 'Festival',
    phase: 7,
    lines: [
      { who: 'narrator', text: 'Llega una carta con sello dorado: INVITACIÓN OFICIAL — NEÓN FEST.' },
      { who: 'rosa', text: 'Lo lograste, {name}. El escenario grande te espera.' },
      { who: 'beto', text: 'Sabía que ibas a tocarlo. Cuando llegue el momento, pon La Pista Cero.' },
    ],
  },
];

// ------------------------------------------------------------------------- missions
export type Goal =
  | { kind: 'placed'; ids: string[]; count: number }
  | { kind: 'tiles'; count: number }
  | { kind: 'seats'; count: number }
  | { kind: 'guests'; count: number }
  | { kind: 'drinks'; count: number }
  | { kind: 'dances'; count: number }
  | { kind: 'level'; level: number }
  | { kind: 'luxury'; value: number }
  | { kind: 'staff'; count: number }
  | { kind: 'facade'; count: number }
  | { kind: 'songs'; count: number }
  | { kind: 'vips'; count: number }
  | { kind: 'visits'; count: number }
  | { kind: 'rating'; value: number }
  | { kind: 'copies'; id: string; count: number }
  | { kind: 'hired'; role: 'guard' | 'dj' | 'bartender'; count: number }
  | { kind: 'upgrade'; id: string }
  | { kind: 'renovation'; count: number }
  | { kind: 'phase'; phase: number }
  | { kind: 'tier'; tier: number; count: number }
  | { kind: 'decor'; count: number }
  | { kind: 'heists'; count: number }
  /** the sound system (speakers, towers, subs and booths) averages at least this version (1 to 4) */
  | { kind: 'sound'; value: number };

export interface Reward {
  coins?: number;
  xp?: number;
  items?: Record<string, number>;
}

export interface Mission {
  id: string;
  chapter: number;
  title: string;
  /** what to do, in plain words (this is the tutorial text) */
  hint: string;
  goal: Goal;
  reward: Reward;
}

const BASE_MISSIONS: Mission[] = [
  { id: 'tiles', chapter: 1, title: 'Enciende la pista', hint: 'Abre la Tienda, compra baldosas de baile y colócalas en el piso. Necesitas 4.', goal: { kind: 'tiles', count: 4 }, reward: { coins: 300, xp: 6 } },
  { id: 'booth', chapter: 1, title: 'La cabina del Tío Beto', hint: 'Abre el Inventario: ahí está la cabina de tu tío. Colócala cerca de la pared.', goal: { kind: 'placed', ids: ['dj_booth'], count: 1 }, reward: { xp: 8 } },
  { id: 'bar', chapter: 1, title: 'Abre la barra', hint: 'Compra una barra recta en la Tienda y colócala. Deja espacio libre delante para los clientes.', goal: { kind: 'placed', ids: ['bar_straight'], count: 1 }, reward: { coins: 500, xp: 8 } },
  { id: 'guests10', chapter: 1, title: 'Primeros clientes', hint: 'Abre el club con el botón de la puerta y mira entrar a tus primeros 10 invitados. Pagan cover al entrar.', goal: { kind: 'guests', count: 10 }, reward: { coins: 400, xp: 10 } },
  { id: 'seats4', chapter: 1, title: 'Que se queden', hint: 'Compra taburetes, sillas o puffs: necesitas 4 asientos. Los taburetes junto a la barra invitan a beber.', goal: { kind: 'seats', count: 4 }, reward: { coins: 400, xp: 10 } },
  { id: 'drinks20', chapter: 1, title: 'La barra no descansa', hint: 'Vende 20 tragos. Los clientes beben en la barra o en los taburetes de al lado.', goal: { kind: 'drinks', count: 20 }, reward: { coins: 500, xp: 14 } },
  { id: 'level3', chapter: 1, title: 'Sube de nivel', hint: 'Los invitados, los tragos y descubrir objetos nuevos te dan experiencia. Llega al nivel 3.', goal: { kind: 'level', level: 3 }, reward: { items: { trophy_cup: 1 }, xp: 10 } },
  { id: 'cup', chapter: 1, title: 'Tu primer trofeo', hint: 'Rosa te regaló una copa. Búscala en el Inventario y colócala: el lujo atrae más gente.', goal: { kind: 'placed', ids: ['trophy_cup'], count: 1 }, reward: { coins: 600, xp: 12 } },
  { id: 'speaker', chapter: 1, title: 'Sonido de verdad', hint: 'Compra un altavoz en la Tienda (Altavoz, nivel 2): los parlantes laten con la música.', goal: { kind: 'placed', ids: ['speaker'], count: 1 }, reward: { coins: 400, xp: 60 } },
  { id: 'plants3', chapter: 1, title: 'Un toque verde', hint: 'Pon 3 plantas en tu club: suman lujo.', goal: { kind: 'copies', id: 'plant', count: 3 }, reward: { coins: 300, xp: 60 } },
  { id: 'staff1', chapter: 1, title: 'Tu primer empleado', hint: 'Pulsa Oficina (abajo) y contrata un bartender. Necesitas la barra puesta y nivel 3.', goal: { kind: 'staff', count: 1 }, reward: { coins: 400, xp: 80 } },
  { id: 'upgrade1', chapter: 1, title: 'Equipo mejor', hint: 'Toca un objeto de tu club y pulsa Mejorar: la barra, los altavoces o la cabina pasan a la versión Profesional (nivel 4). Se ve mejor, y el sonido sale más limpio.', goal: { kind: 'tier', tier: 2, count: 1 }, reward: { coins: 300, xp: 120 } },
  { id: 'decor1', chapter: 1, title: 'Una mano de pintura', hint: 'Oficina › Decorar el interior: compra una pintura para las paredes (nivel 2). El sótano ya no tiene que verse como un sótano.', goal: { kind: 'decor', count: 1 }, reward: { coins: 300, xp: 100 } },
  { id: 'decor4', chapter: 1, title: 'Un local con estilo', hint: 'Compra 4 acabados para el interior: paredes, suelo, molduras, luces o cuadros.', goal: { kind: 'decor', count: 4 }, reward: { coins: 800, xp: 200 } },
  { id: 'songs1', chapter: 1, title: 'Tu propia música', hint: 'Toca la canción que suena (arriba) y sube una canción tuya. Tus invitados tienen gustos: míralos.', goal: { kind: 'songs', count: 1 }, reward: { coins: 300, xp: 80 } },
  { id: 'facade1', chapter: 1, title: 'Cara nueva', hint: 'Oficina › Ver la fachada: compra una pintura, el toldo o el cordón de terciopelo.', goal: { kind: 'facade', count: 1 }, reward: { coins: 500, xp: 80 } },
  { id: 'tiles10', chapter: 1, title: 'Pista grande', hint: 'Llega a 10 baldosas de baile en tu piso.', goal: { kind: 'tiles', count: 10 }, reward: { coins: 300, xp: 60 } },
  { id: 'guests40', chapter: 1, title: 'Casa llena', hint: 'Deja entrar a 40 invitados en total. Si hay fila afuera, vas bien.', goal: { kind: 'guests', count: 40 }, reward: { coins: 500, xp: 100 } },
  { id: 'seats8', chapter: 1, title: 'Más asientos', hint: 'Ten 8 asientos: sillas, puffs y taburetes cuentan.', goal: { kind: 'seats', count: 8 }, reward: { coins: 400, xp: 70 } },
  { id: 'drinks50', chapter: 1, title: 'Tragos para todos', hint: 'Vende 50 tragos. Un bartender contratado los vende más caros.', goal: { kind: 'drinks', count: 50 }, reward: { coins: 600, xp: 100 } },
  { id: 'dances20', chapter: 1, title: 'A bailar', hint: 'Consigue que tus invitados terminen 20 bailes: necesitan pista y música que les guste.', goal: { kind: 'dances', count: 20 }, reward: { coins: 400, xp: 80 } },
  { id: 'lux90', chapter: 1, title: 'Un lugar con estilo', hint: 'Decora hasta 90 de lujo: luces, plantas, trofeos. Es más de lo que traen la cabina y la barra.', goal: { kind: 'luxury', value: 90 }, reward: { coins: 500, xp: 80 } },
  { id: 'rating60', chapter: 1, title: 'Ambiente que se siente', hint: 'Sube el ambiente del club a 60 (la estrella de arriba). Pon música que le guste a tu público: mira sus globos.', goal: { kind: 'rating', value: 60 }, reward: { coins: 700, xp: 120 } },
  { id: 'level4', chapter: 1, title: 'Nivel 4', hint: 'Sigue atendiendo gente y descubriendo objetos nuevos.', goal: { kind: 'level', level: 4 }, reward: { coins: 600, xp: 40 } },
  { id: 'staff2', chapter: 1, title: 'Equipo completo', hint: 'Contrata un segundo empleado: un DJ (nivel 4) o un guardia (nivel 5). Déjales una casilla libre junto a la cabina o la barra.', goal: { kind: 'staff', count: 2 }, reward: { coins: 600, xp: 100 } },
  { id: 'facade3', chapter: 1, title: 'Fachada de lujo', hint: 'Ten 3 mejoras de fachada: la gente decide desde la calle si entra.', goal: { kind: 'facade', count: 3 }, reward: { coins: 800, xp: 120 } },
  { id: 'guests100', chapter: 1, title: 'Cien invitados', hint: 'Llega a 100 invitados atendidos.', goal: { kind: 'guests', count: 100 }, reward: { coins: 800, xp: 120 } },
  { id: 'visit1', chapter: 1, title: 'Visita a un vecino', hint: 'Estando en línea, sal a la calle, haz clic en el club de otro jugador y entra a verlo.', goal: { kind: 'visits', count: 1 }, reward: { coins: 500, xp: 100 } },
  { id: 'level5', chapter: 1, title: 'Nivel 5', hint: 'Falta poco para el bar de barrio.', goal: { kind: 'level', level: 5 }, reward: { coins: 700, xp: 40 } },
  { id: 'drinks100', chapter: 1, title: 'La barra manda', hint: 'Vende 100 tragos.', goal: { kind: 'drinks', count: 100 }, reward: { coins: 800, xp: 100 } },
  { id: 'rating75', chapter: 1, title: 'Casi famoso', hint: 'Ambiente 75: con 78 o más pueden llegar los famosos a tu puerta.', goal: { kind: 'rating', value: 75 }, reward: { coins: 1000, xp: 150 } },
  { id: 'phase2', chapter: 1, title: 'Un bar de verdad', hint: 'Llega al nivel 6: se abre la ampliación del Sótano a Bar de barrio.', goal: { kind: 'level', level: 6 }, reward: { coins: 1500 } },
  { id: 'expand2', chapter: 1, title: 'Amplía tu local', hint: 'Oficina › Ampliación del local: paga la obra y el Sótano se convierte en un Bar de barrio, más grande y con más sitio.', goal: { kind: 'phase', phase: 2 }, reward: { coins: 1000, xp: 200 } },

  { id: 'sofa', chapter: 2, title: 'Comodidad', hint: 'Compra un sofá: cuatro personas descansan en dos.', goal: { kind: 'placed', ids: ['sofa_red_2'], count: 1 }, reward: { coins: 800, xp: 20 } },
  { id: 'upgrade3', chapter: 2, title: 'Gama premium', hint: 'Mejora 2 objetos a la versión Premium (nivel 12): mira cómo cambia su diseño.', goal: { kind: 'tier', tier: 3, count: 2 }, reward: { coins: 1500, xp: 300 } },
  { id: 'decor10', chapter: 2, title: 'Un interior de revista', hint: 'Ten 10 acabados comprados para el interior: ladrillo, parquet, neón, cuadros...', goal: { kind: 'decor', count: 10 }, reward: { coins: 3000, xp: 400 } },
  { id: 'soundsys', chapter: 2, title: 'Sonido de estudio', hint: 'Mejora los altavoces y la cabina del DJ: cuanto mejor el equipo, más limpia suena la música y más contenta está la gente.', goal: { kind: 'sound', value: 2 }, reward: { coins: 2500, xp: 400 } },
  { id: 'soundsys3', chapter: 3, title: 'Sonido de gran estudio', hint: 'Lleva el sonido a la versión Premium (nivel 12): mejora tus altavoces, torres, subwoofers y la cabina hasta que el promedio sea Premium.', goal: { kind: 'sound', value: 3 }, reward: { coins: 9000, xp: 1000 } },
  { id: 'lux100', chapter: 2, title: 'Sin lujo no hay multitud', hint: 'Decora hasta llegar a 100 de lujo. Mira el contador de lujo arriba.', goal: { kind: 'luxury', value: 100 }, reward: { coins: 1200, xp: 30 } },
  { id: 'case', chapter: 2, title: 'La vitrina', hint: 'Compra una vitrina de trofeos (nivel 10).', goal: { kind: 'placed', ids: ['trophy_case'], count: 1 }, reward: { coins: 1500, xp: 40 } },
  { id: 'table_high', chapter: 2, title: 'Mesas altas', hint: 'Compra una mesa alta (nivel 7) y colócala cerca de la barra.', goal: { kind: 'placed', ids: ['table_high'], count: 1 }, reward: { coins: 1000, xp: 150 } },
  { id: 'bartender2', chapter: 2, title: 'Dos barras, dos bartenders', hint: 'Contrata un segundo bartender en la Oficina: cada uno sube un 25% el precio de los tragos.', goal: { kind: 'hired', role: 'bartender', count: 2 }, reward: { coins: 1500, xp: 200 } },
  { id: 'reno1', chapter: 2, title: 'Primera reforma', hint: 'En la Oficina › Reformas del local, paga la primera reforma (nivel 8). Más lujo, más cover.', goal: { kind: 'renovation', count: 1 }, reward: { coins: 5000, xp: 300 } },
  { id: 'disco', chapter: 2, title: 'Luces de discoteca', hint: 'Compra una bola disco (nivel 8) y ponla sobre la pista.', goal: { kind: 'placed', ids: ['disco_ball'], count: 1 }, reward: { coins: 1500, xp: 150 } },
  { id: 'speakers3', chapter: 2, title: 'Que se oiga', hint: 'Ten 3 altavoces en tu club.', goal: { kind: 'copies', id: 'speaker', count: 3 }, reward: { coins: 1200, xp: 150 } },
  { id: 'velvet', chapter: 2, title: 'Cuerda de terciopelo', hint: 'Compra la cuerda de terciopelo (nivel 9) para ordenar tu club.', goal: { kind: 'placed', ids: ['velvet_rope'], count: 1 }, reward: { coins: 1000, xp: 120 } },
  { id: 'staff3', chapter: 2, title: 'Equipo de tres', hint: 'Ten tres empleados contratados: un bartender, un DJ y un guardia.', goal: { kind: 'staff', count: 3 }, reward: { coins: 2500, xp: 250 } },
  { id: 'songs3', chapter: 2, title: 'Tu playlist', hint: 'Sube o agrega 3 canciones propias para variar la música según el público.', goal: { kind: 'songs', count: 3 }, reward: { coins: 1500, xp: 200 } },
  { id: 'facade5', chapter: 2, title: 'Fachada con nombre', hint: 'Ten 5 mejoras de fachada, incluida alguna del letrero de neón o el gigante (nivel 10).', goal: { kind: 'facade', count: 5 }, reward: { coins: 3000, xp: 250 } },
  { id: 'sign_giant', chapter: 2, title: 'Letrero gigante', hint: 'Compra el letrero gigante (nivel 10): se ve desde toda la cuadra y trae más gente.', goal: { kind: 'upgrade', id: 'sign_giant' }, reward: { coins: 3000, xp: 250 } },
  { id: 'vip1', chapter: 2, title: 'Una estrella en la puerta', hint: 'Con ambiente 78 o más llegan los famosos. Déjalo pasar si es de verdad: si no tienes guardia lo investigas tú, y con guardia él ya lo investiga solo (algunos son farsantes: espera a uno real).', goal: { kind: 'vips', count: 1 }, reward: { coins: 3000, xp: 300 } },
  { id: 'guests300', chapter: 2, title: 'Trescientos invitados', hint: 'Atiende a 300 invitados en total.', goal: { kind: 'guests', count: 300 }, reward: { coins: 2500, xp: 250 } },
  { id: 'drinks300', chapter: 2, title: 'Trescientos tragos', hint: 'Vende 300 tragos.', goal: { kind: 'drinks', count: 300 }, reward: { coins: 2500, xp: 250 } },
  { id: 'level10', chapter: 2, title: 'Nivel 10', hint: 'Sigue creciendo: cada nivel abre cosas nuevas.', goal: { kind: 'level', level: 10 }, reward: { coins: 2000, xp: 100 } },
  { id: 'phase3', chapter: 2, title: 'Un club de verdad', hint: 'Llega al nivel 13: se abre la ampliación a Club.', goal: { kind: 'level', level: 13 }, reward: { coins: 3000 } },
  { id: 'expand3', chapter: 2, title: 'Un club de verdad', hint: 'Oficina › Ampliación del local: paga la gran obra y tu bar pasa a ser un Club.', goal: { kind: 'phase', phase: 3 }, reward: { coins: 8000, xp: 500 } },

  { id: 'dances100', chapter: 3, title: 'La pista no para', hint: 'Consigue que tus invitados terminen 100 bailes.', goal: { kind: 'dances', count: 100 }, reward: { coins: 3000, xp: 80 } },
  { id: 'elite1', chapter: 3, title: 'Lo mejor del mercado', hint: 'Mejora un objeto a la versión Élite (nivel 25): dorada, brillante, la mejor.', goal: { kind: 'tier', tier: 4, count: 1 }, reward: { coins: 6000, xp: 600 } },
  { id: 'decor_all', chapter: 3, title: 'Todo el lujo', hint: 'Ten 18 acabados del interior: el local completo, de pared a pared.', goal: { kind: 'decor', count: 18 }, reward: { coins: 15000, xp: 900 } },
  { id: 'elite4', chapter: 3, title: 'Un club de élite', hint: 'Ten 4 objetos en versión Élite.', goal: { kind: 'tier', tier: 4, count: 4 }, reward: { coins: 20000, xp: 1200 } },
  { id: 'booth2', chapter: 3, title: 'Sonido de club', hint: 'Compra un reservado (nivel 13) y una bola disco.', goal: { kind: 'placed', ids: ['booth', 'disco_ball'], count: 2 }, reward: { coins: 4000, xp: 100 } },
  { id: 'laser', chapter: 3, title: 'Rayos láser', hint: 'Compra una torre láser (nivel 15) y haz que tu pista sea un espectáculo.', goal: { kind: 'placed', ids: ['laser_tower'], count: 1 }, reward: { coins: 4000, xp: 300 } },
  { id: 'reno2', chapter: 3, title: 'Insonorización', hint: 'Paga la segunda reforma en la Oficina (nivel 16).', goal: { kind: 'renovation', count: 2 }, reward: { coins: 15000, xp: 500 } },
  { id: 'tv', chapter: 3, title: 'Pantallas', hint: 'Compra una TV con mueble (nivel 16).', goal: { kind: 'placed', ids: ['tv_stand'], count: 1 }, reward: { coins: 4000, xp: 300 } },
  { id: 'staff5', chapter: 3, title: 'Plantilla completa', hint: 'Ten cinco empleados: dos guardias, un DJ y dos bartenders.', goal: { kind: 'staff', count: 5 }, reward: { coins: 8000, xp: 500 } },
  { id: 'aquarium', chapter: 3, title: 'Un acuario', hint: 'Compra el acuario (nivel 18): ningún otro club tiene uno.', goal: { kind: 'placed', ids: ['aquarium'], count: 1 }, reward: { coins: 6000, xp: 400 } },
  { id: 'vips5', chapter: 3, title: 'Club de famosos', hint: 'Deja pasar a 5 famosos de verdad. Los farsantes no cuentan: recházalos.', goal: { kind: 'vips', count: 5 }, reward: { coins: 10000, xp: 600 } },
  { id: 'rating90', chapter: 3, title: 'Ambiente perfecto', hint: 'Lleva el ambiente del club a 90.', goal: { kind: 'rating', value: 90 }, reward: { coins: 8000, xp: 500 } },
  { id: 'songs8', chapter: 3, title: 'Una playlist de verdad', hint: 'Ten 8 canciones propias en tu lista.', goal: { kind: 'songs', count: 8 }, reward: { coins: 5000, xp: 300 } },
  { id: 'visits5', chapter: 3, title: 'Vida social', hint: 'Visita los clubes de 5 vecinos (en línea).', goal: { kind: 'visits', count: 5 }, reward: { coins: 5000, xp: 400 } },
  { id: 'phase4', chapter: 3, title: 'Más grande', hint: 'Llega al nivel 23: se abre la ampliación a Club grande.', goal: { kind: 'level', level: 23 }, reward: { coins: 8000 } },
  { id: 'expand4', chapter: 3, title: 'Más espacio', hint: 'Oficina › Ampliación del local: la obra más cara hasta ahora. Tu club será el Club grande.', goal: { kind: 'phase', phase: 4 }, reward: { coins: 30000, xp: 1200 } },
  { id: 'cocktail1', chapter: 2, title: 'Cócteles en la esquina', hint: 'Tienda › Barras: compra una Barra de cócteles (nivel 9) y colócala. Más puestos para servir tragos.', goal: { kind: 'placed', ids: ['cocktail_bar'], count: 1 }, reward: { coins: 2500, xp: 500 } },
  { id: 'guests800', chapter: 2, title: 'Casa llena', hint: 'Recibe 800 invitados en total. Más aforo, más fila y más ambiente ayudan.', goal: { kind: 'guests', count: 800 }, reward: { coins: 3000, xp: 600 } },
  { id: 'palm2', chapter: 2, title: 'Un rincón tropical', hint: 'Pon 2 palmeras en tu club (Tienda › Decoración, nivel 11).', goal: { kind: 'copies', id: 'palm', count: 2 }, reward: { coins: 2000, xp: 500 } },
  { id: 'strobe1', chapter: 2, title: 'Luces de verdad', hint: 'Compra una Luz estroboscópica (Tienda › Luces, nivel 11) y colócala sobre la pista.', goal: { kind: 'placed', ids: ['strobe'], count: 1 }, reward: { coins: 2500, xp: 600 } },
  { id: 'drinks400', chapter: 2, title: 'La barra no para', hint: 'Vende 400 tragos en total. Con más puestos en la barra y un bartender se sirve más rápido.', goal: { kind: 'drinks', count: 400 }, reward: { coins: 3000, xp: 700 } },
  { id: 'tower1', chapter: 2, title: 'Más volumen', hint: 'Compra una Torre de sonido (Tienda › DJ y sonido, nivel 12): mejora el sonido de tu club.', goal: { kind: 'placed', ids: ['speaker_tower'], count: 1 }, reward: { coins: 3500, xp: 800 } },
  { id: 'neonwall1', chapter: 2, title: 'Tu nombre en neón', hint: 'Cuelga un Letrero de neón (Tienda › Decoración, nivel 12).', goal: { kind: 'placed', ids: ['neon_wall'], count: 1 }, reward: { coins: 3500, xp: 800 } },
  { id: 'dances600', chapter: 2, title: 'La pista no se cansa', hint: 'Consigue 600 bailes terminados. Más baldosas de pista, más gente bailando.', goal: { kind: 'dances', count: 600 }, reward: { coins: 3500, xp: 900 } },
  { id: 'rating82', chapter: 2, title: 'Gran ambiente', hint: 'Llega a ambiente 82: música que le guste a tu público, lujo y un buen DJ.', goal: { kind: 'rating', value: 82 }, reward: { coins: 4000, xp: 900 } },
  { id: 'staff4', chapter: 2, title: 'Equipo completo', hint: 'Ten 4 empleados trabajando en tu club (Oficina › Tu equipo).', goal: { kind: 'staff', count: 4 }, reward: { coins: 5000, xp: 1000 } },
  { id: 'camera1', chapter: 3, title: 'Te están mirando', hint: 'Protégete antes de que te asalten: compra una Cámara de seguridad (Tienda › Seguridad, nivel 12). Cada cámara hace más difícil un robo.', goal: { kind: 'placed', ids: ['camera'], count: 1 }, reward: { coins: 2500, xp: 700 } },
  { id: 'protect3', chapter: 3, title: 'Club blindado', hint: 'Ten alarma, caja fuerte y cámara a la vez. Con eso un ladrón la tiene mucho más difícil.', goal: { kind: 'placed', ids: ['alarm', 'safe', 'camera'], count: 3 }, reward: { coins: 6000, xp: 1500 } },
  { id: 'heist2', chapter: 3, title: 'Segundo golpe', hint: 'Haz 2 asaltos con éxito. Recuerda: lo robado queda caliente y la policía lo busca. Límpialo con Zeta o espera.', goal: { kind: 'heists', count: 2 }, reward: { coins: 6000, xp: 1800 } },
  { id: 'alarm', chapter: 3, title: 'Se oye una alarma', hint: 'Rosa dice que alguien anda mirando locales de noche. Tienda › Seguridad: compra una Alarma (nivel 10).', goal: { kind: 'placed', ids: ['alarm'], count: 1 }, reward: { coins: 2000, xp: 150 } },
  { id: 'safe1', chapter: 3, title: 'Lo valioso, bajo llave', hint: 'Compra una Caja fuerte (nivel 12): guarda tu mejor pieza y parte de la caja.', goal: { kind: 'placed', ids: ['safe'], count: 1 }, reward: { coins: 3000, xp: 250 } },
  { id: 'heist1', chapter: 3, title: 'Zeta tiene un trabajo', hint: 'Zeta, el que vende sin preguntas, dice que alguien en la ciudad se lo merece. En la tarjeta de un vecino pulsa Asaltar y sal con algo en la bolsa. El calor te lo va a cobrar Ferro.', goal: { kind: 'heists', count: 1 }, reward: { coins: 4000, xp: 400 } },
  { id: 'cage1', chapter: 3, title: 'La estrella de la noche', hint: 'Tienda › Shows: compra una Jaula de baile (nivel 14). La gente se queda mirando y deja propinas.', goal: { kind: 'placed', ids: ['dance_cage'], count: 1 }, reward: { coins: 6000, xp: 400 } },
  { id: 'cage2', chapter: 4, title: 'Show de lujo', hint: 'Mejora una jaula de baile a la versión Premium (nivel 12): sube mucho lo que gana.', goal: { kind: 'tier', tier: 3, count: 1 }, reward: { coins: 12000, xp: 800 } },
  { id: 'vault1', chapter: 4, title: 'Vitrina blindada', hint: 'Ferro cierra locales por una bombilla fundida, pero a los ladrones no los ve. Compra una Vitrina blindada (nivel 15).', goal: { kind: 'placed', ids: ['vault_case'], count: 1 }, reward: { coins: 10000, xp: 600 } },
  { id: 'safe2', chapter: 4, title: 'Dos cerraduras', hint: 'Una segunda Caja fuerte: ya nadie se lleva tu pieza más valiosa y tu caja casi no se toca.', goal: { kind: 'copies', id: 'safe', count: 2 }, reward: { coins: 8000, xp: 500 } },
  { id: 'heist3', chapter: 4, title: 'La Noche del Apagón', hint: 'Los sábados de madrugada el calor baja el doble de rápido. Completa 3 asaltos con éxito.', goal: { kind: 'heists', count: 3 }, reward: { coins: 15000, xp: 1500 } },
];

/** coin rewards grow with the prices (see pricing.ts); XP and items do not */
/** missions pay this many times the XP written in the list: they were giving too little */
export const MISSION_XP_SCALE = 5;
export const MISSIONS: Mission[] = BASE_MISSIONS.map((m) => ({
  ...m,
  reward: { ...m.reward, ...(m.reward.coins ? { coins: m.reward.coins * PRICE_SCALE } : {}), ...(m.reward.xp ? { xp: m.reward.xp * MISSION_XP_SCALE } : {}) },
}));

/** A chapter also opens by level, not only by buying the next building: before, levels 11 to 13 had almost nothing to do. */
export const CHAPTER_LEVEL = [1, 6, 10, 20];
export const chapterOpen = (state: ClubState, chapter: number): boolean => state.phase >= chapter || levelNow(state) >= (CHAPTER_LEVEL[chapter - 1] ?? 999);

export interface Progress {
  current: number;
  target: number;
}

export function progressOf(m: Mission, state: ClubState): Progress {
  const g = m.goal;
  const st = statsOf(state);
  const placedOf = (ids: string[]) => ids.filter((id) => state.items.some((i) => i.id === id)).length;
  switch (g.kind) {
    case 'placed': {
      // count distinct kinds placed, or copies when a single id is asked for
      const cur = g.ids.length === 1 ? state.items.filter((i) => i.id === g.ids[0]).length : placedOf(g.ids);
      return { current: Math.min(cur, g.count), target: g.count };
    }
    case 'tiles': return { current: Math.min(st.floorTiles, g.count), target: g.count };
    case 'seats': return { current: Math.min(st.seats, g.count), target: g.count };
    case 'guests': return { current: Math.min(state.stats.guests, g.count), target: g.count };
    case 'drinks': return { current: Math.min(state.stats.drinks, g.count), target: g.count };
    case 'dances': return { current: Math.min(state.stats.dances, g.count), target: g.count };
    case 'level': return { current: Math.min(levelNow(state), g.level), target: g.level };
    case 'luxury': return { current: Math.min(st.luxury, g.value), target: g.value };
    case 'staff': return { current: Math.min(state.staff.guard + state.staff.dj + state.staff.bartender, g.count), target: g.count };
    case 'facade': return { current: Math.min(state.exterior.owned.length - 1, g.count), target: g.count };
    case 'songs': return { current: Math.min(state.music.tracks.length, g.count), target: g.count };
    case 'vips': return { current: Math.min(state.stats.vips, g.count), target: g.count };
    case 'visits': return { current: Math.min(state.stats.visits, g.count), target: g.count };
    case 'copies': return { current: Math.min(state.items.filter((i) => i.id === g.id).length, g.count), target: g.count };
    case 'hired': return { current: Math.min(state.staff[g.role], g.count), target: g.count };
    case 'upgrade': return { current: state.exterior.owned.includes(g.id) ? 1 : 0, target: 1 };
    case 'decor': return { current: Math.min(state.decor.owned.length - 5, g.count), target: g.count };
    case 'tier': return { current: Math.min(state.items.filter((i) => (i.tier ?? 1) >= g.tier).length, g.count), target: g.count };
    case 'sound': return { current: Math.min(Math.floor(soundSystem(state)), g.value), target: g.value };
    case 'heists': return { current: Math.min(state.stats.heists, g.count), target: g.count };
    case 'phase': return { current: Math.min(state.phase, g.phase), target: g.phase };
    case 'renovation': return { current: Math.min(state.renovation, g.count), target: g.count };
    case 'rating': return { current: Math.min(state.stats.bestRating, g.value), target: g.value };
  }
}

export interface MissionView {
  mission: Mission;
  progress: Progress;
  done: boolean;
}

/** Missions to show: the unfinished ones of the current chapter (and earlier), oldest first, max `limit`. */
export function activeMissions(state: ClubState, limit = 3): MissionView[] {
  return MISSIONS.filter((m) => chapterOpen(state, m.chapter) && !state.story.done.includes(m.id))
    .slice(0, limit)
    .map((mission) => ({ mission, progress: progressOf(mission, state), done: false }));
}

export function allMissions(state: ClubState): MissionView[] {
  return MISSIONS.filter((m) => chapterOpen(state, m.chapter)).map((mission) => {
    const done = state.story.done.includes(mission.id);
    const progress = done ? { current: 1, target: 1 } : progressOf(mission, state);
    return { mission, progress, done };
  });
}

export interface Completion {
  state: ClubState;
  completed: Mission[];
}

/** Check every active mission, pay the rewards of the finished ones. Call after anything that can change progress. */
export function checkMissions(state: ClubState): Completion {
  const completed: Mission[] = [];
  let next = state;
  let again = true;
  while (again) {
    again = false;
    for (const m of MISSIONS) {
      if (!chapterOpen(next, m.chapter) || next.story.done.includes(m.id)) continue;
      const p = progressOf(m, next);
      if (p.current < p.target) continue;
      const inv = { ...next.inventory };
      for (const [id, n] of Object.entries(m.reward.items ?? {})) if (BY_ID.has(id)) inv[id] = (inv[id] ?? 0) + n;
      next = {
        ...next,
        coins: next.coins + (m.reward.coins ?? 0),
        inventory: inv,
        story: { ...next.story, done: [...next.story.done, m.id] },
      };
      next = addXp(next, m.reward.xp ?? 0);
      completed.push(m);
      again = true; // a reward can complete the next mission (e.g. level-ups)
    }
  }
  return { state: next, completed };
}

/** The next story scene that should be played, if any. */
export function pendingScene(state: ClubState): Scene | null {
  for (const s of SCENES) {
    if (state.story.seen.includes(s.id)) continue;
    if (s.phase === 0 || state.phase >= s.phase) return s;
  }
  return null;
}

export function markSeen(state: ClubState, sceneId: string): ClubState {
  if (state.story.seen.includes(sceneId)) return state;
  return { ...state, story: { ...state.story, seen: [...state.story.seen, sceneId], intro: state.story.intro || sceneId === 'intro' } };
}

/** Fill {name} and {motive} in a line of text. */
export function fillText(text: string, vars: { name: string; motive?: string }): string {
  return text.replace(/\{name\}/g, vars.name || 'DJ').replace(/\{motive\}/g, vars.motive ?? '');
}
