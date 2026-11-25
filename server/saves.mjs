// A copy of every player's whole game on the server, with backups. The browser stays the owner of the game for now; this is
// what protects people's progress (a cleared browser, a new computer, a bug) and what the robberies will be settled on.
//
// Rules that keep progress safe:
//   - an incoming game is always cleaned with the game's own sanitizeClub (never stored as received);
//   - the previous copy is kept as a backup (at most one every 30 minutes, the last 8 are kept);
//   - a game that looks like a wipe (far less progress than the stored one) does NOT replace it unless the player explicitly
//     started over; it is kept apart as "suspect", so nothing is lost either way.

import fs from 'node:fs';
import path from 'node:path';
import { sanitizeClub } from '../web/src/core/club.ts';
import { levelOf } from '../web/src/core/progression.ts';
import { reconcile, validate } from './vault.mjs';

export const MAX_SAVE_BYTES = 300 * 1024;
const BACKUP_EVERY = 30 * 60 * 1000;
const KEEP = 8;
/** below this share of the stored experience, an incoming game is treated as a possible wipe */
const WIPE_RATIO = 0.3;
const WIPE_MIN_XP = 3000;

const metaOf = (state) => ({ level: levelOf(state.xp).level, phase: state.phase, coins: state.coins, xp: state.xp });

export class SaveStore {
  #dir;
  constructor(dir) {
    this.#dir = dir;
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }

  #file(id, suffix = '') {
    return path.join(this.#dir, `${id}${suffix}.json`);
  }

  /** The stored game and when it was stored, or null. */
  read(id) {
    if (!this.#dir) return null;
    try {
      return JSON.parse(fs.readFileSync(this.#file(id), 'utf8'));
    } catch {
      return null;
    }
  }

  /** Keep the current copy as a backup, if the last backup is old enough. */
  #backup(id, now) {
    const cur = this.#file(id);
    if (!fs.existsSync(cur)) return;
    const list = this.backups(id);
    if (list.length && now - list[0].at < BACKUP_EVERY) return;
    fs.copyFileSync(cur, this.#file(id, `.bak.${now}`));
    for (const old of this.backups(id).slice(KEEP)) fs.rmSync(this.#file(id, `.bak.${old.at}`), { force: true });
  }

  /** Backups of a game, newest first. */
  backups(id) {
    if (!this.#dir) return [];
    return fs
      .readdirSync(this.#dir)
      .filter((f) => f.startsWith(`${id}.bak.`))
      .map((f) => ({ at: Number(f.slice(id.length + 5, -5)) }))
      .filter((b) => Number.isFinite(b.at))
      .sort((a, b) => b.at - a.at);
  }

  /** Change the stored game on the server's own authority (a robbery settled): no validation, no wipe guard. */
  update(id, fn, now = Date.now()) {
    const cur = this.read(id);
    if (!cur) return false;
    const state = sanitizeClub(fn(cur.state));
    this.#backup(id, now);
    const tmp = `${this.#file(id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ at: now, meta: metaOf(state), state }));
    fs.renameSync(tmp, this.#file(id));
    return true;
  }

  /** Store a game. `force`: the player started over on purpose. Returns { ok, meta } or { error, status }. */
  write(id, raw, force = false, now = Date.now(), pending = [], measured = null) {
    if (!this.#dir) return { error: 'El guardado en la nube no está activo.', status: 503 };
    let state;
    try {
      state = sanitizeClub(raw);
    } catch {
      return { error: 'Partida no válida.', status: 400 };
    }
    const prev = this.read(id);
    // what the server keeps: believable (clamped if not) and with the losses the player has not confirmed yet
    // (the losses and winnings of the robberies come first, so the upload is compared with the stored game on equal terms)
    const checked = validate(prev?.state ?? null, reconcile(state, pending), prev ? now - prev.at : 0, measured);
    state = checked.state;
    const meta = metaOf(state);
    if (prev && !force && prev.meta.xp >= WIPE_MIN_XP && meta.xp < prev.meta.xp * WIPE_RATIO) {
      // looks like a wipe: keep it apart and leave the good copy where it is
      fs.writeFileSync(this.#file(id, '.suspect'), JSON.stringify({ at: now, meta, state }));
      return { error: 'Esta partida tiene mucho menos progreso que la guardada: no la reemplacé (se guardó aparte).', status: 409, meta: prev.meta };
    }
    this.#backup(id, now);
    const tmp = `${this.#file(id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ at: now, meta, state }));
    fs.renameSync(tmp, this.#file(id));
    return { ok: true, meta, at: now, flags: checked.flags };
  }
}
