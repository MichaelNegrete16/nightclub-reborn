// The dances and gestures: what each one is called, when it opens, and which music the crowd dances it to.
// Pure data (the moves themselves are built from this in render/dances.ts).

import type { EmoteId } from './character.ts';
import type { Genre } from './music.ts';

export interface Emote {
  id: EmoteId;
  label: string;
  /** a short line for the picker */
  desc: string;
  unlockLevel: number;
  /** a dance goes on until you walk; a gesture is a short greeting */
  kind: 'dance' | 'gesture';
  /** the crowd dances this one when the music is of these genres */
  genres: Genre[];
}

export const EMOTES: Emote[] = [
  { id: 'dancehall', label: 'Dancehall', desc: 'Rodillas sueltas, caderas y brazos al ritmo.', unlockLevel: 1, kind: 'dance', genres: ['reggaeton'] },
  { id: 'aplauso', label: 'Aplaudir', desc: 'Palmas al compás.', unlockLevel: 1, kind: 'gesture', genres: [] },
  { id: 'saludo', label: 'Saludar', desc: 'Una mano en alto para el que llega.', unlockLevel: 1, kind: 'gesture', genres: [] },
  { id: 'reggaeton', label: 'Reggaetón', desc: 'Inclinado al frente, con el ritmo del dembow.', unlockLevel: 3, kind: 'dance', genres: ['reggaeton'] },
  { id: 'salsa', label: 'Salsa', desc: 'Pasos de lado y caderas en ocho.', unlockLevel: 5, kind: 'dance', genres: ['salsa'] },
  { id: 'hiphop', label: 'Hip hop', desc: 'Rebote, brazos arriba y cabeza al ritmo.', unlockLevel: 7, kind: 'dance', genres: ['pop', 'house'] },
  { id: 'merengue', label: 'Merengue', desc: 'Pasitos rápidos con los brazos como abrazando.', unlockLevel: 9, kind: 'dance', genres: ['salsa'] },
  { id: 'disco', label: 'Disco', desc: 'El dedo al cielo, como en los setenta.', unlockLevel: 11, kind: 'dance', genres: ['pop', 'house'] },
  { id: 'cumbia', label: 'Cumbia', desc: 'Balanceo de lado a lado con brazos de péndulo.', unlockLevel: 13, kind: 'dance', genres: ['salsa', 'reggaeton'] },
  { id: 'robot', label: 'Robot', desc: 'Movimientos cortados, como de máquina.', unlockLevel: 15, kind: 'dance', genres: ['house'] },
  { id: 'saltos', label: 'Saltos', desc: 'Brincos con los brazos arriba, de concierto de rock.', unlockLevel: 17, kind: 'dance', genres: ['rock'] },
  { id: 'ola', label: 'La ola', desc: 'Los brazos suben uno tras otro.', unlockLevel: 19, kind: 'dance', genres: ['pop', 'rock'] },
];

export const EMOTE_BY_ID = new Map(EMOTES.map((e) => [e.id, e]));
export const EMOTE_IDS: string[] = EMOTES.map((e) => e.id);
export const isEmote = (id: string | null | undefined): id is EmoteId => !!id && EMOTE_BY_ID.has(id as EmoteId);

/** The dances of the crowd for a genre, in the order guests are given them (one per guest, by id). */
export function crowdDances(genre: Genre | null): EmoteId[] {
  const list = EMOTES.filter((e) => e.kind === 'dance' && (genre ? e.genres.includes(genre) : true)).map((e) => e.id);
  return list.length ? list : ['dancehall'];
}

/** BPM the dance clips are drawn at: they are sped up or slowed down to the music playing. */
export const DANCE_BPM = 100;
