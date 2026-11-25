// What the server accepts from clients. Never trust the client: every field is cleaned and clamped here.

import { sanitize } from '../web/src/core/character.ts';
import { BY_ID } from '../web/src/core/catalog.ts';
import { UPGRADE_BY_ID } from '../web/src/core/exterior.ts';
import { GENRE_BY_ID, parseAudioUrl } from '../web/src/core/music.ts';
import { DECOR_BY_ID, DEFAULTS } from '../web/src/core/decor.ts';
import { EMOTE_IDS } from '../web/src/core/emotes.ts';

export const RADIUS = 3;
export const PEER_RADIUS = 3; // cells around a player whose movements are streamed live // cells around a player that the server tells them about
export const MAX_NAME = 20;

const int = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), lo), hi) : fb);

export function cleanName(raw) {
  const s = typeof raw === 'string' ? raw : '';
  // letters (with accents), digits, spaces and a few marks; everything else is dropped
  const t = s.normalize('NFC').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim();
  return t.slice(0, MAX_NAME) || 'Jugador';
}

/** How the facade looks: the paint, awning, rope, sign size and lights (ids checked against the real upgrades). */
export function cleanExt(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const paint = typeof r.paint === 'string' && UPGRADE_BY_ID.get(r.paint)?.group === 'paint' ? r.paint : 'paint_grey';
  return { paint, awning: r.awning === true, rope: r.rope === true, lights: r.lights === true, sign: int(r.sign, 0, 2, 0) };
}

/** The character's look, cleaned by the same function the game uses. */
export function cleanLook(raw) {
  try {
    return raw && typeof raw === 'object' ? sanitize(raw) : null;
  } catch {
    return null;
  }
}

/** The furniture layout: only known objects, whole numbers, at most 400 pieces. */
export function cleanItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const it of raw.slice(0, 400)) {
    if (!it || typeof it.id !== 'string' || !BY_ID.has(it.id)) continue;
    out.push({ id: it.id, x: int(it.x, 0, 40, 0), y: int(it.y, 0, 40, 0), rot: int(it.rot, 0, 3, 0), tier: int(it.tier, 1, 4, 1) });
  }
  return out;
}

/** A position in the street, in the player's own lot coordinates. */
export function cleanPos(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = (v) => (Number.isFinite(v) ? Math.min(Math.max(Math.round(v * 10) / 10, -300), 300) : 0);
  return { x: n(r.x), z: n(r.z), m: r.m === 1 ? 1 : 0, e: EMOTE_IDS.includes(r.e) ? r.e : '' };
}

/** What a club is playing, so neighbours can hear it when they come close. */
export function cleanMusic(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const genre = GENRE_BY_ID.has(r.genre) ? r.genre : 'pop';
  // what exactly plays, so a visitor can hear the same song: only public links (never a file from the player's computer)
  const ref = typeof r.ref === 'string' ? r.ref : '';
  const okRef = (r.source === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(ref)) || (r.source === 'spotify' && /^(track|playlist|album|episode)\/[A-Za-z0-9]{10,30}$/.test(ref)) || (r.source === 'url' && parseAudioUrl(ref) === ref) || (r.source === 'cloud' && /^[a-f0-9]{20}$/.test(ref)) || (r.source === 'song' && /^[a-z0-9-]{3,40}$/.test(ref)) || (r.source === 'builtin' && /^[a-z]{3,12}$/.test(ref));
  return {
    playing: r.playing === true, title: typeof r.title === 'string' ? r.title.slice(0, 40) : '', genre, bpm: int(r.bpm, 60, 200, 120), builtin: r.builtin === true,
    source: okRef ? r.source : '', ref: okRef ? ref : '', startedAt: Number.isFinite(r.startedAt) ? Math.max(0, Math.floor(r.startedAt)) : 0,
  };
}

/** The finishes of the inside (one id per group, checked against the real options) so visitors see the same room. */
export function cleanDecor(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULTS };
  for (const g of Object.keys(DEFAULTS)) {
    const id = r[g];
    if (typeof id === 'string' && DECOR_BY_ID.get(id)?.group === g) out[g] = id;
  }
  return out;
}

/** The public face of a club: just enough to draw it in the city. */
export function cleanClub(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    ext: cleanExt(r.ext),
    decor: cleanDecor(r.decor),
    music: cleanMusic(r.music),
    name: cleanName(r.name),
    phase: int(r.phase, 1, 7, 1),
    level: int(r.level, 1, 200, 1),
    rating: int(r.rating, 0, 100, 50),
    open: r.open === true,
    guests: int(r.guests, 0, 300, 0),
  };
}

/** A chat line: letters, numbers, punctuation and emoji; no control characters; one line, at most 100 characters. */
// words that are masked in the chat (a short list: the common insults in Spanish, matched without accents and with repeated
// letters squeezed, so "p u t a" or "puuuta" do not slip through)
const BAD = ['puta', 'putas', 'puto', 'putos', 'mierda', 'marica', 'maricon', 'gonorrea', 'hijueputa', 'hijoputa', 'malparido', 'pendejo', 'cabron', 'verga', 'coño', 'joder', 'idiota', 'imbecil', 'estupido', 'nazi', 'violador', 'negro de mierda'];
const fold = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/(.)\1+/g, '$1');
const BAD_FOLDED = BAD.map(fold);
/** Mask the bad words: each one becomes asterisks (the rest of the message is kept). */
export function maskBad(text) {
  return text.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const f = fold(w);
    return BAD_FOLDED.some((b) => f === b || (b.length >= 6 && f.includes(b))) ? '*'.repeat(w.length) : w;
  });
}

export function cleanChat(raw) {
  const s = typeof raw === 'string' ? raw : '';
  return maskBad(s.normalize('NFC').replace(/[\p{C}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100));
}

export const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(id);

/** A colour for a club's neon sign, the same for everyone who sees it. */
const COLORS = ['#ff2255', '#18d8ff', '#ff2d9a', '#a13cff', '#35f08a', '#ffd24a', '#ff8a1e', '#3a7bff'];
export function colorFor(n) {
  return COLORS[n % COLORS.length];
}
