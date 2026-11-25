// Songs the players upload: stored on disk and streamed to everyone (with Range, so playback can seek and never stutters
// waiting for the whole file). Limits keep the server from filling up.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_FILE = 15 * 1024 * 1024; // per song
export const MAX_PER_PLAYER = 10;
export const MAX_TOTAL = 1024 * 1024 * 1024; // all songs together

/** What kind of audio the first bytes say it is (never trust the name or the declared type). */
export function sniff(b) {
  if (b.length < 12) return null;
  const s = (i, n) => b.subarray(i, i + n).toString('latin1');
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav';
  if (s(4, 4) === 'ftyp') return 'audio/mp4';
  if (s(0, 4) === 'fLaC') return 'audio/flac';
  return null;
}

export class AudioStore {
  #dir;
  #index = {};
  constructor(dir) {
    this.#dir = dir;
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    try {
      this.#index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    } catch {
      this.#index = {};
    }
  }

  #save() {
    if (this.#dir) fs.writeFileSync(path.join(this.#dir, 'index.json'), JSON.stringify(this.#index));
  }

  countOf(owner) {
    return Object.values(this.#index).filter((f) => f.owner === owner).length;
  }

  total() {
    return Object.values(this.#index).reduce((a, f) => a + f.size, 0);
  }

  /** Save an uploaded song. Returns { id } or { error, status }. Identical files are stored once. */
  add(owner, bytes, title) {
    if (!this.#dir) return { error: 'La subida de música no está activa.', status: 503 };
    if (bytes.length > MAX_FILE) return { error: 'La canción pesa más de 15 MB.', status: 413 };
    const type = sniff(bytes);
    if (!type) return { error: 'Eso no parece un archivo de audio (mp3, ogg, wav, m4a o flac).', status: 415 };
    if (this.countOf(owner) >= MAX_PER_PLAYER) return { error: `Ya tienes ${MAX_PER_PLAYER} canciones subidas: borra alguna.`, status: 409 };
    if (this.total() + bytes.length > MAX_TOTAL) return { error: 'El servidor de música está lleno.', status: 507 };
    const id = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 20);
    if (!this.#index[id]) {
      fs.writeFileSync(path.join(this.#dir, id), bytes);
      this.#index[id] = { owner, size: bytes.length, type, title: String(title ?? '').slice(0, 60) };
      this.#save();
    }
    return { id };
  }

  info(id) {
    return /^[a-f0-9]{20}$/.test(id) ? this.#index[id] : undefined;
  }

  file(id) {
    return path.join(this.#dir, id);
  }

  remove(owner, id) {
    const f = this.info(id);
    if (!f || f.owner !== owner) return false;
    delete this.#index[id];
    fs.rmSync(this.file(id), { force: true });
    this.#save();
    return true;
  }
}
