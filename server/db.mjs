// The city's database: one SQLite file (node:sqlite, nothing to install). It holds every player's game and its backups,
// the world (lots, mail, records), and the accounts (passkeys, sessions, link codes). One file means one thing to back up.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS saves (pid TEXT PRIMARY KEY, at INTEGER NOT NULL, meta TEXT NOT NULL, state TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS save_backups (pid TEXT NOT NULL, at INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (pid, at));
  CREATE TABLE IF NOT EXISTS save_suspects (pid TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS accounts (pid TEXT PRIMARY KEY, created INTEGER NOT NULL, recovery_hash TEXT);
  CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, pid TEXT NOT NULL, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT, label TEXT, created INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS credentials_pid ON credentials (pid);
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, pid TEXT NOT NULL, created INTEGER NOT NULL, last INTEGER NOT NULL, device TEXT);
  CREATE INDEX IF NOT EXISTS sessions_pid ON sessions (pid);
  CREATE TABLE IF NOT EXISTS link_codes (hash TEXT PRIMARY KEY, pid TEXT NOT NULL, expires INTEGER NOT NULL);
`;

/** Open (and create if needed) the database. `:memory:` gives a throwaway one (tests). */
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  return db;
}

/** A consistent copy of the whole database while it is in use. */
export function backupDb(db, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { force: true });
  db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`);
}

/** Keep only the newest `keep` files of a folder (names sort by date). */
export function prune(dir, prefix, keep) {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort().reverse();
  for (const f of files.slice(keep)) fs.rmSync(path.join(dir, f), { force: true });
}

/** Where the world is kept: a row of the database (same load/save shape as a file store). */
export function worldStore(db) {
  return {
    load: () => {
      const row = db.prepare("SELECT v FROM kv WHERE k = 'world'").get();
      return row ? JSON.parse(row.v) : null;
    },
    save: (obj) => void db.prepare("INSERT INTO kv (k, v) VALUES ('world', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(JSON.stringify(obj)),
  };
}

/**
 * One-time move from the old JSON files into the database. Nothing is deleted: the files stay where they are as a backup.
 * Returns what was imported.
 */
export function importLegacy(db, { worldFile, savesDir }) {
  const out = { world: false, saves: 0, backups: 0 };
  if (worldFile && fs.existsSync(worldFile) && !db.prepare("SELECT 1 FROM kv WHERE k = 'world'").get()) {
    try {
      worldStore(db).save(JSON.parse(fs.readFileSync(worldFile, 'utf8')));
      out.world = true;
    } catch (e) {
      console.error('could not import', worldFile, e.message);
    }
  }
  if (savesDir && fs.existsSync(savesDir)) {
    const put = db.prepare('INSERT OR IGNORE INTO saves (pid, at, meta, state) VALUES (?, ?, ?, ?)');
    const bak = db.prepare('INSERT OR IGNORE INTO save_backups (pid, at, body) VALUES (?, ?, ?)');
    const sus = db.prepare('INSERT OR IGNORE INTO save_suspects (pid, body) VALUES (?, ?)');
    for (const f of fs.readdirSync(savesDir)) {
      const full = path.join(savesDir, f);
      try {
        let m;
        if ((m = /^([A-Za-z0-9_-]{8,40})\.json$/.exec(f))) {
          const j = JSON.parse(fs.readFileSync(full, 'utf8'));
          if (put.run(m[1], j.at, JSON.stringify(j.meta), JSON.stringify(j.state)).changes) out.saves++;
        } else if ((m = /^([A-Za-z0-9_-]{8,40})\.bak\.(\d+)\.json$/.exec(f))) {
          if (bak.run(m[1], Number(m[2]), fs.readFileSync(full, 'utf8')).changes) out.backups++;
        } else if ((m = /^([A-Za-z0-9_-]{8,40})\.suspect\.json$/.exec(f))) {
          sus.run(m[1], fs.readFileSync(full, 'utf8'));
        }
      } catch (e) {
        console.error('could not import', f, e.message);
      }
    }
  }
  return out;
}
