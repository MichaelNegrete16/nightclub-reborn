// A copy of every player's whole game on the server, with backups. The browser stays the owner of the game for now; this is
// what protects people's progress (a cleared browser, a new computer, a bug) and what the robberies will be settled on.
//
// Rules that keep progress safe:
//   - an incoming game is always cleaned with the game's own sanitizeClub (never stored as received);
//   - the previous copy is kept as a backup (at most one every 30 minutes, the last 8 are kept);
//   - a game that looks like a wipe (far less progress than the stored one) does NOT replace it unless the player explicitly
//     started over; it is kept apart as "suspect", so nothing is lost either way.

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
  #db;
  /** `db`: the city database (see db.mjs), or null when saving to the cloud is off */
  constructor(db) {
    this.#db = db;
  }

  /** The stored game and when it was stored, or null. */
  read(id) {
    if (!this.#db) return null;
    const row = this.#db.prepare('SELECT at, meta, state FROM saves WHERE pid = ?').get(id);
    if (!row) return null;
    try {
      // cleaned on the way out: a game stored before a field existed comes back with that field filled in
      return { at: row.at, meta: JSON.parse(row.meta), state: sanitizeClub(JSON.parse(row.state)) };
    } catch {
      return null;
    }
  }

  /** Every player that has a stored game. */
  ids() {
    return this.#db ? this.#db.prepare('SELECT pid FROM saves').all().map((r) => r.pid) : [];
  }

  /** Keep the current copy as a backup, if the last backup is old enough. */
  #backup(id, now) {
    const cur = this.#db.prepare('SELECT at, meta, state FROM saves WHERE pid = ?').get(id);
    if (!cur) return;
    const last = this.backups(id)[0];
    if (last && now - last.at < BACKUP_EVERY) return;
    this.#db.prepare('INSERT OR REPLACE INTO save_backups (pid, at, body) VALUES (?, ?, ?)').run(id, now, JSON.stringify({ at: cur.at, meta: JSON.parse(cur.meta), state: JSON.parse(cur.state) }));
    this.#db.prepare('DELETE FROM save_backups WHERE pid = ? AND at NOT IN (SELECT at FROM save_backups WHERE pid = ? ORDER BY at DESC LIMIT ?)').run(id, id, KEEP);
  }

  /** Backups of a game, newest first. */
  backups(id) {
    if (!this.#db) return [];
    return this.#db.prepare('SELECT at FROM save_backups WHERE pid = ? ORDER BY at DESC').all(id).map((r) => ({ at: r.at }));
  }

  /** A stored backup (the same shape as read), or null. */
  backup(id, at) {
    const row = this.#db?.prepare('SELECT body FROM save_backups WHERE pid = ? AND at = ?').get(id, at);
    return row ? JSON.parse(row.body) : null;
  }

  #put(id, now, meta, state) {
    // the backup and the new copy go in together: either both happen or none
    this.#db.exec('BEGIN');
    try {
      this.#backup(id, now);
      this.#db.prepare('INSERT INTO saves (pid, at, meta, state) VALUES (?, ?, ?, ?) ON CONFLICT(pid) DO UPDATE SET at = excluded.at, meta = excluded.meta, state = excluded.state').run(id, now, JSON.stringify(meta), JSON.stringify(state));
      this.#db.exec('COMMIT');
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Change the stored game on the server's own authority (a robbery settled): no validation, no wipe guard. */
  update(id, fn, now = Date.now()) {
    const cur = this.read(id);
    if (!cur) return false;
    const state = sanitizeClub(fn(cur.state));
    this.#put(id, now, metaOf(state), state);
    return true;
  }

  /** Store a game. `force`: the player started over on purpose. Returns { ok, meta } or { error, status }. */
  write(id, raw, force = false, now = Date.now(), pending = [], measured = null) {
    if (!this.#db) return { error: 'El guardado en la nube no está activo.', status: 503 };
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
    // the bank's books are the server's: an uploaded game can never lower the debt, free a piece or clear bad credit
    state = { ...state, loan: prev?.state.loan ?? null, embargoed: prev?.state.embargoed ?? [], badCreditUntil: prev?.state.badCreditUntil ?? 0 };
    const meta = metaOf(state);
    if (prev && !force && prev.meta.xp >= WIPE_MIN_XP && meta.xp < prev.meta.xp * WIPE_RATIO) {
      // looks like a wipe: keep it apart and leave the good copy where it is
      this.#db.prepare('INSERT OR REPLACE INTO save_suspects (pid, body) VALUES (?, ?)').run(id, JSON.stringify({ at: now, meta, state }));
      return { error: 'Esta partida tiene mucho menos progreso que la guardada: no la reemplacé (se guardó aparte).', status: 409, meta: prev.meta };
    }
    this.#put(id, now, meta, state);
    return { ok: true, meta, at: now, flags: checked.flags };
  }
}
