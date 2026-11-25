// The famous people who show up at the door: original characters with a Colombian flavour (vallenato, champeta, salsa
// caleña, football, cycling, telenovelas...). They are invented on purpose: no real person's name or face is used, because
// a commercial game needs consent to use someone's image. Each one carries what its caricature is drawn from (ui/caricature.ts).
// Pure logic: the guest simulation and the server use the list.

export type HairStyle = 'curly' | 'afro' | 'long' | 'fade' | 'bun' | 'mohawk' | 'braids' | 'bald' | 'slick' | 'none';
export type Accessory =
  | 'vueltiao' | 'shades' | 'chain' | 'hoops' | 'flower' | 'helmet' | 'headphones' | 'phone' | 'glasses'
  | 'pearls' | 'jersey' | 'turban' | 'poncho' | 'cap' | 'mic' | 'earring' | 'star_shades';

export interface Celeb {
  id: string;
  name: string;
  /** what they are famous for (also what an impostor claims) */
  title: string;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  /** a second colour for dyed tips, flowers, stripes */
  accent: string;
  outfit: string;
  /** the background of the portrait */
  bg: string;
  acc: Accessory[];
  beard?: 'mustache' | 'beard' | 'goatee';
  lips?: string;
  nose?: 'round' | 'long' | 'small';
  /** wrinkles and grey hair */
  older?: boolean;
  /** a number on the shirt (football) */
  number?: number;
}

export const CELEBS: Celeb[] = [
  { id: 'arrieta', name: 'Juancho Arrieta', title: 'el rey del vallenato', skin: '#c98e66', hair: 'none', hairColor: '#2a1a10', accent: '#15101f', outfit: '#f4f0e6', bg: '#f5b91d', acc: ['vueltiao', 'chain'], beard: 'mustache', nose: 'round' },
  { id: 'fenix', name: 'J Fénix', title: 'reguetonero de Medellín', skin: '#e0a878', hair: 'fade', hairColor: '#f5d76e', accent: '#2a1a10', outfit: '#15101f', bg: '#ff4fa3', acc: ['shades', 'chain', 'earring'], beard: 'goatee', nose: 'small' },
  { id: 'candela', name: 'La Negra Candela', title: 'salsera caleña', skin: '#7a4a2c', hair: 'afro', hairColor: '#1a0f08', accent: '#ff3d5a', outfit: '#d6314a', bg: '#3ddc97', acc: ['flower', 'hoops'], lips: '#c8283c', nose: 'round' },
  { id: 'mosquera', name: 'La Pantera Mosquera', title: 'goleador de la selección', skin: '#6a3f24', hair: 'curly', hairColor: '#15101f', accent: '#f5b91d', outfit: '#f5d21d', bg: '#1e4fd6', acc: ['jersey'], nose: 'round', number: 10 },
  { id: 'kande', name: 'Rey Kandé', title: 'el rey de la champeta', skin: '#5a3420', hair: 'braids', hairColor: '#15101f', accent: '#f5b91d', outfit: '#18d8ff', bg: '#ff8a1e', acc: ['star_shades', 'chain'], nose: 'round' },
  { id: 'montoya', name: 'Valeria Montoya', title: 'actriz de telenovela', skin: '#f0c8a0', hair: 'long', hairColor: '#5a2e18', accent: '#ffffff', outfit: '#b04cff', bg: '#ffd1e8', acc: ['pearls'], lips: '#d6314a', nose: 'small' },
  { id: 'condor', name: 'Cóndor Rincón', title: 'ciclista campeón de montaña', skin: '#b87a50', hair: 'none', hairColor: '#15101f', accent: '#d6314a', outfit: '#ffffff', bg: '#5ec8ff', acc: ['helmet', 'shades'], nose: 'long' },
  { id: 'mafe', name: 'Mafe Influ', title: 'influencer paisa con 5 millones de seguidores', skin: '#f2c9a4', hair: 'bun', hairColor: '#e8b04a', accent: '#ff4fa3', outfit: '#ff9ac8', bg: '#b04cff', acc: ['phone', 'hoops'], lips: '#ff4f8a', nose: 'small' },
  { id: 'rosario', name: 'Mamá Rosario', title: 'la reina de la cumbia', skin: '#8a5a3c', hair: 'none', hairColor: '#cfcfcf', accent: '#f5b91d', outfit: '#ff6a3a', bg: '#3ddc97', acc: ['turban', 'hoops'], lips: '#a8283c', nose: 'round', older: true },
  { id: 'guacamaya', name: 'DJ Guacamaya', title: 'DJ de festivales en todo el mundo', skin: '#d9a070', hair: 'mohawk', hairColor: '#18d8ff', accent: '#3ddc97', outfit: '#15101f', bg: '#f5b91d', acc: ['headphones', 'earring'], nose: 'long' },
  { id: 'kid', name: 'Kid Barranquilla', title: 'campeón mundial de boxeo', skin: '#4a2a18', hair: 'bald', hairColor: '#15101f', accent: '#d6314a', outfit: '#d6314a', bg: '#15101f', acc: ['chain'], beard: 'beard', nose: 'round' },
  { id: 'mono', name: 'El Mono Sabroso', title: 'humorista de la tele', skin: '#f4caa0', hair: 'slick', hairColor: '#e8b04a', accent: '#d6314a', outfit: '#8a5a3c', bg: '#ff4fa3', acc: ['glasses', 'poncho'], beard: 'mustache', nose: 'long' },
  { id: 'lucero', name: 'Lucero Vallejo', title: 'cantante de música popular', skin: '#e8b890', hair: 'long', hairColor: '#15101f', accent: '#f5b91d', outfit: '#15101f', bg: '#d6314a', acc: ['cap', 'hoops'], lips: '#c8283c', nose: 'small' },
  { id: 'brayan', name: 'Bray Stiven', title: 'rapero de Bogotá', skin: '#c98e66', hair: 'curly', hairColor: '#2a1a10', accent: '#ffffff', outfit: '#3a56a8', bg: '#8f96b4', acc: ['cap', 'mic', 'chain'], beard: 'goatee', nose: 'round' },
];

export const CELEB_BY_ID = new Map(CELEBS.map((c) => [c.id, c]));
