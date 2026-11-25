// Platform-agnostic character data. No rendering imports here: the same module can be used by the
// mobile build and by the backend to validate/store a player's character.

export type Sex = 'male' | 'female';
export type TopId = 'tshirt' | 'hoodie';
export type BottomId = 'jeans' | 'skirt';
/** the dances and gestures the player can do (see core/emotes.ts) */
export type EmoteId = 'dancehall' | 'reggaeton' | 'salsa' | 'merengue' | 'hiphop' | 'robot' | 'disco' | 'cumbia' | 'saltos' | 'ola' | 'aplauso' | 'saludo';
/** the chores of the prison (see render/prison.ts): each one has its own working movement */
export type ChoreAnim = 'scrub' | 'mop' | 'wash' | 'fold' | 'paint' | 'sweep';
export const CHORE_ANIMS: ChoreAnim[] = ['scrub', 'mop', 'wash', 'fold', 'paint', 'sweep'];
export type AnimId = 'idle' | 'walk' | 'dance' | 'celebrate' | 'dj_mix' | EmoteId | ChoreAnim;

export interface CharacterConfig {
  sex: Sex;
  skin: string;
  hairStyle: string;
  hairColor: string;
  eyeColor: string;
  top: TopId;
  topColor: string;
  bottom: BottomId;
  bottomColor: string;
  shoesColor: string;
  cap: boolean;
  capColor: string;
  glasses: boolean;
}

export const SKIN_TONES = ['#f4cfb2', '#e3a77f', '#c98a62', '#a4663f', '#7b4527', '#4e2a17'];
export const HAIR_COLORS = ['#120d0b', '#3b2112', '#6d3d1b', '#cfa62d', '#b3260f', '#2a5bd7', '#e0408a', '#e8e8ee'];
export const EYE_COLORS = ['#3b2112', '#2a6bd7', '#2f8f3a', '#7a8794', '#7d4bd6'];
export const CLOTH_COLORS = [
  '#e6199c', '#12b8e6', '#f2c40d', '#7a28d9', '#e63a2e', '#18b862', '#f4f4f8', '#1b1f3a', '#2c3f8f', '#7a1b1b',
];

export const HAIR_STYLES: { id: string; label: string; group: 'male' | 'female' | 'unisex' }[] = [
  { id: 'crop_fringe', label: 'Corto con flequillo', group: 'male' },
  { id: 'side_part', label: 'Raya al lado', group: 'male' },
  { id: 'curtains', label: 'Cortinas', group: 'male' },
  { id: 'curly_top', label: 'Rizos', group: 'male' },
  { id: 'shaggy', label: 'Melena media', group: 'male' },
  { id: 'afro', label: 'Afro', group: 'unisex' },
  { id: 'long_layered', label: 'Larga en capas', group: 'female' },
  { id: 'bob_bangs', label: 'Bob con flequillo', group: 'female' },
  { id: 'high_ponytail', label: 'Cola alta', group: 'female' },
  { id: 'space_buns', label: 'Moños', group: 'female' },
];

export const ANIMATIONS: { id: AnimId; label: string }[] = [
  { id: 'idle', label: 'Reposo' },
  { id: 'walk', label: 'Caminar' },
  { id: 'dance', label: 'Bailar' },
  { id: 'celebrate', label: 'Celebrar' },
  { id: 'dj_mix', label: 'Mezclar' },
];

export function defaultConfig(sex: Sex): CharacterConfig {
  return sex === 'male'
    ? {
        sex, skin: SKIN_TONES[1], hairStyle: 'side_part', hairColor: HAIR_COLORS[1], eyeColor: EYE_COLORS[0],
        top: 'tshirt', topColor: CLOTH_COLORS[0], bottom: 'jeans', bottomColor: CLOTH_COLORS[8],
        shoesColor: '#f4f4f8', cap: false, capColor: CLOTH_COLORS[4], glasses: false,
      }
    : {
        sex, skin: SKIN_TONES[1], hairStyle: 'long_layered', hairColor: HAIR_COLORS[3], eyeColor: EYE_COLORS[1],
        top: 'tshirt', topColor: CLOTH_COLORS[1], bottom: 'skirt', bottomColor: CLOTH_COLORS[7],
        shoesColor: '#f4f4f8', cap: false, capColor: CLOTH_COLORS[4], glasses: false,
      };
}

/** Lip color that keeps contrast against the skin tone (dark skin gets lighter lips, light skin deeper ones). */
export function lipsFor(skinHex: string): string {
  const n = parseInt(skinHex.slice(1), 16);
  const lum = (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
  return lum < 0.38 ? '#d9707a' : '#b8404e';
}

const rand = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export function randomConfig(sex: Sex): CharacterConfig {
  const hair = HAIR_STYLES.filter((h) => h.group === sex || h.group === 'unisex');
  return {
    sex,
    skin: rand(SKIN_TONES),
    hairStyle: rand(hair).id,
    hairColor: rand(HAIR_COLORS),
    eyeColor: rand(EYE_COLORS),
    top: rand<TopId>(['tshirt', 'hoodie']),
    topColor: rand(CLOTH_COLORS),
    bottom: sex === 'female' ? rand<BottomId>(['jeans', 'skirt']) : 'jeans',
    bottomColor: rand(CLOTH_COLORS),
    shoesColor: rand(['#f4f4f8', '#1b1f3a', ...CLOTH_COLORS]),
    cap: Math.random() < 0.2,
    capColor: rand(CLOTH_COLORS),
    glasses: Math.random() < 0.25,
  };
}

/** Defensive parse for saved/imported characters: anything invalid falls back to the defaults. */
export function sanitize(raw: unknown): CharacterConfig {
  const r = (raw ?? {}) as Partial<CharacterConfig>;
  const sex: Sex = r.sex === 'female' ? 'female' : 'male';
  const d = defaultConfig(sex);
  const hex = (v: unknown, fb: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);
  const hairOk = HAIR_STYLES.some((h) => h.id === r.hairStyle);
  return {
    sex,
    skin: hex(r.skin, d.skin),
    hairStyle: hairOk ? (r.hairStyle as string) : d.hairStyle,
    hairColor: hex(r.hairColor, d.hairColor),
    eyeColor: hex(r.eyeColor, d.eyeColor),
    top: r.top === 'hoodie' ? 'hoodie' : 'tshirt',
    topColor: hex(r.topColor, d.topColor),
    bottom: r.bottom === 'skirt' && sex === 'female' ? 'skirt' : 'jeans',
    bottomColor: hex(r.bottomColor, d.bottomColor),
    shoesColor: hex(r.shoesColor, d.shoesColor),
    cap: !!r.cap,
    capColor: hex(r.capColor, d.capColor),
    glasses: !!r.glasses,
  };
}
