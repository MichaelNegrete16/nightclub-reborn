// The club's music: genres, the playlist, what each guest likes, and how the crowd reacts. Pure logic.
// The sound itself (Web Audio, YouTube, Spotify) lives in src/audio; this file only decides who is happy.

import type { ClubState } from './club.ts';

export type Genre = 'reggaeton' | 'pop' | 'house' | 'salsa' | 'rock';

export const GENRES: Array<{ id: Genre; label: string; color: string; bpm: number; /** share of the crowd that loves it */ share: number }> = [
  { id: 'reggaeton', label: 'Reggaetón', color: '#ff3da6', bpm: 96, share: 0.3 },
  { id: 'pop', label: 'Pop', color: '#ffd23f', bpm: 112, share: 0.25 },
  { id: 'house', label: 'House', color: '#18d8ff', bpm: 124, share: 0.2 },
  { id: 'salsa', label: 'Salsa', color: '#ff7a1a', bpm: 100, share: 0.15 },
  { id: 'rock', label: 'Rock', color: '#a13cff', bpm: 130, share: 0.1 },
];
export const GENRE_BY_ID = new Map(GENRES.map((g) => [g.id, g]));

/** Genres that sit well together: a guest who loves one is fine with the other. */
const NEIGHBOURS: Array<[Genre, Genre]> = [['reggaeton', 'pop'], ['reggaeton', 'salsa'], ['pop', 'house'], ['pop', 'rock']];

export type Source = 'builtin' | 'youtube' | 'spotify' | 'file' | 'url' | 'cloud' | 'song';

export interface Track {
  id: string;
  title: string;
  genre: Genre;
  bpm: number;
  source: Source;
  /** builtin: pattern id · youtube: video id · spotify: "track/ID" (or playlist/album) · file: id of the file kept in this browser · url: the audio link */
  ref: string;
}

export interface MusicState {
  /** the player's own playlist (YouTube and Spotify links, and any built-in track they added) */
  tracks: Track[];
  current: string | null;
  playing: boolean;
  volume: number;
}

/**
 * The game's own songs: the mp3 files in the `songs/` folder of the project, served by the city server at /songs/<ref>.mp3.
 * Everybody has the same list, so any club's song can be played by anyone, from the same second. BPMs are approximate (set by ear).
 */
export const LIBRARY: Track[] = [
  { id: 's_silla', title: 'Silla · Yailin La Más Viral', genre: 'reggaeton', bpm: 108, source: 'song', ref: 'silla' },
  { id: 's_ponte', title: 'Ponte Perrita · El Yeulin 777, Sherlyn LSP, Danner Music', genre: 'reggaeton', bpm: 112, source: 'song', ref: 'ponte-perrita' },
  { id: 's_chulo', title: 'Chulo pt.2 · Bad Gyal, Young Miko, Tokischa', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'chulo-pt2' },
  { id: 's_dichavate', title: 'Dichavate · Ya Ice Dilan, Rey Toni, Helabusador', genre: 'reggaeton', bpm: 110, source: 'song', ref: 'dichavate' },
  { id: 's_fashion', title: 'Fashion Girl Pt. 2 · Bad Gyal, Jadiel', genre: 'pop', bpm: 104, source: 'song', ref: 'fashion-girl' },
  { id: 's_coleto', title: 'Compa Coleto · Aria Vega', genre: 'pop', bpm: 118, source: 'song', ref: 'compa-coleto' },
  { id: 's_perreo', title: 'Mix Perreo Salvaje (old school) · Dj Anthony Alexander', genre: 'reggaeton', bpm: 96, source: 'song', ref: 'perreo-salvaje' },
  { id: 's_amanecer', title: 'Voy a amanecer · Lil Silvio', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'voy-amanecer' },
  { id: 's_6am', title: '6 AM · J Balvin, Farruko', genre: 'reggaeton', bpm: 96, source: 'song', ref: '6-am' },
  { id: 's_ragga', title: 'Ragga Tonseh', genre: 'reggaeton', bpm: 96, source: 'song', ref: 'ragga-tonseh' },
  { id: 's_carne', title: 'Carne hincha · El Boys C, Lil Shany', genre: 'reggaeton', bpm: 110, source: 'song', ref: 'carne-hincha' },
  { id: 's_tiki', title: 'El Tiki · Big Mancilla', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'el-tiki' },
  { id: 's_sientes', title: 'Qué sientes · Choliare', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'que-sientes' },
  { id: 's_natural', title: 'A lo natural', genre: 'pop', bpm: 100, source: 'song', ref: 'a-lo-natural' },
  { id: 's_trabaje', title: 'Trabaje papi · latin house', genre: 'house', bpm: 124, source: 'song', ref: 'trabaje-papi' },
  { id: 's_lomilo', title: 'Lomilo · afrohouse y aleteo', genre: 'house', bpm: 124, source: 'song', ref: 'lomilo' },
  { id: 's_gozadera', title: 'La gozadera · Gente de Zona, Marc Anthony', genre: 'salsa', bpm: 98, source: 'song', ref: 'la-gozadera' },
  { id: 's_playa', title: 'Vamos pa la playa', genre: 'salsa', bpm: 100, source: 'song', ref: 'vamos-pa-la-playa' },
  { id: 's_bby', title: 'BbY WOW (mix) · Karol G, Judeline, Rusowsky', genre: 'pop', bpm: 96, source: 'song', ref: 'bby-wow' },
  { id: 's_fever', title: 'Fever · Vybz Kartel', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'fever' },
  { id: 's_conjugal', title: 'Conjugal Visit · Spice, Vybz Kartel', genre: 'reggaeton', bpm: 96, source: 'song', ref: 'conjugal-visit' },
  { id: 's_sidechick', title: 'Side Chick', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'side-chick' },
  { id: 's_prendete', title: 'Préndete · Jose Mc, Nigga Lionz, Seven Plom', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'prendete' },
  { id: 's_nomehables', title: 'No me hables · Mosta Man, Lil Silvio, Kevin Florez', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'no-me-hables' },
  { id: 's_cantinero', title: 'Cantinero · Lil Silvio', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'cantinero' },
  { id: 's_juegate', title: 'Juégate a la suerte · Maelo Ruiz', genre: 'salsa', bpm: 98, source: 'song', ref: 'juegate-a-la-suerte' },
  { id: 's_nonstop', title: 'Non Stop · Gyptian', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'non-stop' },
  { id: 's_costenita', title: 'Costeñita · Reyes On The Mic, Mosta Man', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'costenita' },
  { id: 's_bikeback', title: 'Bike Back · Charly Black', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'bike-back' },
  { id: 's_arabe', title: 'Árabe · Kevin Florez, Big Mancilla, Reyes On The Mic', genre: 'reggaeton', bpm: 100, source: 'song', ref: 'arabe' },
  { id: 's_fleek', title: 'Fleek · Alkaline', genre: 'reggaeton', bpm: 96, source: 'song', ref: 'fleek' },
];
export const LIBRARY_BY_ID = new Map(LIBRARY.map((t) => [t.id, t]));

/** Tracks the game makes itself, so there is always something to play. */
export const BUILTIN: Track[] = [
  { id: 'b_reggaeton', title: 'Noche de Barrio', genre: 'reggaeton', bpm: 96, source: 'builtin', ref: 'reggaeton' },
  { id: 'b_pop', title: 'Luces de Neón', genre: 'pop', bpm: 112, source: 'builtin', ref: 'pop' },
  { id: 'b_house', title: 'Pista Eléctrica', genre: 'house', bpm: 124, source: 'builtin', ref: 'house' },
  { id: 'b_salsa', title: 'Sabor del Sótano', genre: 'salsa', bpm: 100, source: 'builtin', ref: 'salsa' },
  { id: 'b_rock', title: 'Amplificadores', genre: 'rock', bpm: 130, source: 'builtin', ref: 'rock' },
];

export function newMusic(): MusicState {
  return { tracks: [], current: null, playing: false, volume: 0.7 };
}

export function allTracks(m: MusicState): Track[] {
  return [...LIBRARY, ...m.tracks];
}

export function trackById(m: MusicState, id: string | null): Track | undefined {
  return id ? allTracks(m).find((t) => t.id === id) : undefined;
}

export function currentTrack(m: MusicState): Track | undefined {
  return m.playing ? trackById(m, m.current) : undefined;
}

// ---- links --------------------------------------------------------------------------------------
export function parseYouTube(url: string): string | null {
  const m = url.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function parseSpotify(url: string): string | null {
  const m = url.trim().match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|episode)\/([A-Za-z0-9]{10,30})/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** A direct link to an audio file (mp3, ogg, wav, m4a...). */
export function parseAudioUrl(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\/[^\s]{4,480}\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)(\?[^\s]*)?$/i.test(u) ? u : null;
}

/** Add a song that was uploaded to the city server (everybody can hear it from there). */
export function addCloudTrack(state: ClubState, id: string, title: string, genre: Genre, bpm: number): { state: ClubState; error?: string } {
  if (state.music.tracks.length >= 40) return { state, error: 'La playlist está llena (40 canciones).' };
  if (!/^[a-f0-9]{20}$/.test(id)) return { state, error: 'Archivo no válido.' };
  if (state.music.tracks.some((t) => t.source === 'cloud' && t.ref === id)) return { state, error: 'Esa canción ya está en tu playlist.' };
  const track: Track = {
    id: `c${id}`,
    title: title.trim().slice(0, 60) || 'Mi canción',
    genre: GENRE_BY_ID.has(genre) ? genre : 'pop',
    bpm: Number.isFinite(bpm) ? Math.min(Math.max(Math.round(bpm), 60), 200) : (GENRE_BY_ID.get(genre)?.bpm ?? 120),
    source: 'cloud',
    ref: id,
  };
  return { state: { ...state, music: { ...state.music, tracks: [...state.music.tracks, track] } } };
}

/** Add a song whose file lives in this browser (the caller saves the file under `id`). */
export function addLocalTrack(state: ClubState, id: string, title: string, genre: Genre, bpm: number): { state: ClubState; error?: string } {
  if (state.music.tracks.length >= 40) return { state, error: 'La playlist está llena (40 canciones).' };
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return { state, error: 'Archivo no válido.' };
  const track: Track = {
    id,
    title: title.trim().slice(0, 60) || 'Mi canción',
    genre: GENRE_BY_ID.has(genre) ? genre : 'pop',
    bpm: Number.isFinite(bpm) ? Math.min(Math.max(Math.round(bpm), 60), 200) : (GENRE_BY_ID.get(genre)?.bpm ?? 120),
    source: 'file',
    ref: id,
  };
  return { state: { ...state, music: { ...state.music, tracks: [...state.music.tracks, track] } } };
}

export function addTrack(state: ClubState, link: string, title: string, genre: Genre, bpm: number): { state: ClubState; error?: string; id?: string } {
  const yt = parseYouTube(link);
  const sp = yt ? null : parseSpotify(link);
  const au = yt || sp ? null : parseAudioUrl(link);
  if (!yt && !sp && !au) return { state, error: 'Ese link no es de YouTube, de Spotify ni un archivo de audio (mp3, ogg, wav, m4a).' };
  if (state.music.tracks.length >= 40) return { state, error: 'La playlist está llena (40 canciones).' };
  const source: Source = yt ? 'youtube' : sp ? 'spotify' : 'url';
  const ref = (yt ?? sp ?? au) as string;
  if (state.music.tracks.some((t) => t.source === source && t.ref === ref)) return { state, error: 'Esa canción ya está en tu playlist.' };
  const track: Track = {
    id: `u${Date.now().toString(36)}${state.music.tracks.length}`,
    title: title.trim().slice(0, 60) || (yt ? 'Video de YouTube' : sp ? 'Canción de Spotify' : 'Canción'),
    genre: GENRE_BY_ID.has(genre) ? genre : 'pop',
    bpm: Number.isFinite(bpm) ? Math.min(Math.max(Math.round(bpm), 60), 200) : (GENRE_BY_ID.get(genre)?.bpm ?? 120),
    source,
    ref,
  };
  return { state: { ...state, music: { ...state.music, tracks: [...state.music.tracks, track] } }, id: track.id };
}

export function removeTrack(state: ClubState, id: string): ClubState {
  const tracks = state.music.tracks.filter((t) => t.id !== id);
  const gone = state.music.current === id;
  return { ...state, music: { ...state.music, tracks, current: gone ? null : state.music.current, playing: gone ? false : state.music.playing } };
}

export function selectTrack(state: ClubState, id: string): ClubState {
  if (!trackById(state.music, id)) return state;
  return { ...state, music: { ...state.music, current: id, playing: true } };
}

export function setPlaying(state: ClubState, playing: boolean): ClubState {
  const current = state.music.current ?? LIBRARY[0].id;
  return { ...state, music: { ...state.music, current, playing } };
}

/** The next track in the list (built-in first, then the player's), wrapping around. */
export function nextTrackId(m: MusicState, step: 1 | -1 = 1): string {
  const list = allTracks(m);
  const i = list.findIndex((t) => t.id === m.current);
  return list[(i + step + list.length * 2) % list.length].id;
}

export function setVolume(state: ClubState, volume: number): ClubState {
  return { ...state, music: { ...state.music, volume: Math.min(Math.max(volume, 0), 1) } };
}

export function sanitizeMusic(raw: unknown): MusicState {
  const r = (raw ?? {}) as Partial<MusicState>;
  const tracks: Track[] = [];
  if (Array.isArray(r.tracks)) {
    for (const t of r.tracks.slice(0, 40)) {
      const x = t as Partial<Track>;
      if (typeof x.id !== 'string' || typeof x.ref !== 'string' || !['file', 'cloud'].includes(x.source as string)) continue;
      if (x.source === 'cloud' && !/^[a-f0-9]{20}$/.test(x.ref)) continue;
      if (x.source === 'file' && !/^[A-Za-z0-9_-]{4,40}$/.test(x.ref)) continue;
      if (x.source === 'url' && !parseAudioUrl(x.ref)) continue;
      if (x.source === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(x.ref)) continue;
      if (x.source === 'spotify' && !/^(track|playlist|album|episode)\/[A-Za-z0-9]{10,30}$/.test(x.ref)) continue;
      tracks.push({
        id: x.id.slice(0, 20),
        title: typeof x.title === 'string' ? x.title.slice(0, 60) : 'Canción',
        genre: GENRE_BY_ID.has(x.genre as Genre) ? (x.genre as Genre) : 'pop',
        bpm: Number.isFinite(x.bpm) ? Math.min(Math.max(Math.round(x.bpm as number), 60), 200) : 120,
        source: x.source as Source,
        ref: x.ref,
      });
    }
  }
  const m: MusicState = { tracks, current: typeof r.current === 'string' ? r.current : null, playing: !!r.playing, volume: Number.isFinite(r.volume) ? Math.min(Math.max(r.volume as number, 0), 1) : 0.7 };
  if (!trackById(m, m.current)) {
    m.current = null;
    m.playing = false;
  }
  return m;
}

// ---- the crowd -------------------------------------------------------------------------------------
/** What a guest loves (random, but with the genres' shares). `roll` is a number in [0, 1). */
export function tasteFor(roll: number): Genre {
  let acc = 0;
  for (const g of GENRES) {
    acc += g.share;
    if (roll < acc) return g.id;
  }
  return GENRES[GENRES.length - 1].id;
}

export type Liking = 'love' | 'ok' | 'dislike' | 'silence';

export function liking(taste: Genre, playing: Genre | null): Liking {
  if (!playing) return 'silence';
  if (playing === taste) return 'love';
  return NEIGHBOURS.some(([a, b]) => (a === taste && b === playing) || (b === taste && a === playing)) ? 'ok' : 'dislike';
}

/** The happiness a guest drifts towards while a song plays (or none). */
export const MOOD_TARGET: Record<Liking, number> = { love: 100, ok: 72, dislike: 30, silence: 5 };
/** The club's score needed for a real star to show up. */
export const VIP_RATING = 78;

export function stars(rating: number): number {
  return Math.round((Math.min(Math.max(rating, 0), 100) / 100) * 5 * 2) / 2;
}
