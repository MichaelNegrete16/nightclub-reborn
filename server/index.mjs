// Multiplayer server. Run: npm start   (PORT, HOST, DATA_FILE, MAX_PER_IP, ALLOWED_ORIGINS are optional)
//
// Protocol (JSON, one object per message):
//   client -> server  { t: 'hello', id, name }          first message: who am I (a guest id kept in the browser)
//                     { t: 'club', club: {...} }        my club changed (name, phase, level, rating, open, guests)
//                     { t: 'look', look }               how my character looks
//                     { t: 'pos', x, z, m }             where I am in the street (m=1: inside my club)
//                     { t: 'layout', items: [...] }     my furniture, so others can visit
//                     { t: 'scout', n }                 look at the club in lot n before robbing it
//                     { t: 'heist', n, want, kits, skill }   try the robbery
//                     { t: 'launder', uid }             pay to clean a stolen piece
//                     { t: 'loan', amount }             ask the bank for a loan
//                     { t: 'repay', amount | 'all' }    pay the bank
//                     { t: 'chat', text }               say something (heard within three lots)
//                     { t: 'visit', n }                 show me the club of the player in lot n
//   server -> client  { t: 'city', me: {i,j,n}, clubs: [...], online }   the lots around me and who lives there
//                     { t: 'peers', p: [...] }          players walking nearby (several times a second)
//                     { t: 'club', ... }                the club I asked to visit
//                     { t: 'chat', n, name, text }      somebody nearby said something
//                     { t: 'mail', mail: [...] }        what happened to my club while I was away (until I confirm it)
//                     { t: 'crime', heat, shieldUntil, detainedUntil, closedUntil, blackout }   my record, read-only
//                     { t: 'clock', now }               the city's time: the same sky for everyone
// The server does not run the game: it only stores each club's public face. The economy stays on each client for now.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { World } from './world.mjs';
import { AudioStore, MAX_FILE } from './audio.mjs';
import { MAX_SAVE_BYTES, SaveStore } from './saves.mjs';
import { attempt, buyGuard, detain, doChore, launder, pardon, scout } from './heists.mjs';
import { patrolTick } from './police.mjs';
import { bankTick, lend, payback } from './bank.mjs';
import { Shadows } from './shadow.mjs';
import { awayTick, settleAway } from './away.mjs';
import { Ranking } from './ranking.mjs';
import { cleanChat, cleanName, validId } from './protocol.mjs';
import { backupDb, importLegacy, openDb, prune, worldStore } from './db.mjs';
import { createAuth } from './auth.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const MAX_PER_IP = Number(process.env.MAX_PER_IP ?? 20);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/** The built game (npm run build in web/): served from the same address so friends only need one link. */
const SONGS_DIR = process.env.SONGS_DIR ?? new URL('../songs', import.meta.url).pathname;
const STATIC_DIR = process.env.STATIC_DIR ?? new URL('../web/dist', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
/** Name of the built script: if it changes, players with the page open are told to reload. */
function buildId() {
  try {
    return /assets\/(index-[^"]+\.js)/.exec(fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8'))?.[1] ?? '';
  } catch {
    return '';
  }
}
const SAVES_DIR = process.env.SAVES_DIR === '' ? null : (process.env.SAVES_DIR ?? new URL('./data/saves', import.meta.url).pathname);
const AUDIO_DIR = process.env.AUDIO_DIR === '' ? null : (process.env.AUDIO_DIR ?? new URL('./data/audio', import.meta.url).pathname);
const DATA_FILE = process.env.DATA_FILE === '' ? null : (process.env.DATA_FILE ?? undefined);
const DB_FILE = process.env.DB_FILE ?? new URL('./data/nightclub.db', import.meta.url).pathname;
const DB_BACKUPS = process.env.DB_BACKUPS ?? new URL('./data/db-backups', import.meta.url).pathname;
/** Where players may sign in with passkeys from. A passkey is tied to the site's name: add your domain here when you have one. */
const AUTH_ORIGINS = (process.env.AUTH_ORIGINS ?? 'http://localhost:5173,http://localhost:8787,http://localhost:4173').split(',').map((s) => s.trim()).filter(Boolean);

export function createServer({ port = PORT, host = HOST, dataFile = DATA_FILE, audioDir = AUDIO_DIR, maxPerIp = MAX_PER_IP, savesDir, dbFile, saveEveryMs = 10_000, authOrigins = AUTH_ORIGINS } = {}) {
  // one database file holds the saves, the world and the accounts; tests get a throwaway one (or one inside their own folder)
  const standard = dbFile === undefined && savesDir === undefined && dataFile === undefined;
  const dbPath = dbFile !== undefined ? dbFile : typeof savesDir === 'string' ? path.join(savesDir, 'nightclub.db') : standard ? DB_FILE : ':memory:';
  const db = openDb(dbPath);
  if (standard) {
    const moved = importLegacy(db, { worldFile: new URL('./data/world.json', import.meta.url).pathname, savesDir: SAVES_DIR });
    if (moved.world || moved.saves) console.log(`imported from the old JSON files: world=${moved.world}, saves=${moved.saves}, backups=${moved.backups}`);
  }
  const world = new World(dataFile === undefined ? worldStore(db) : dataFile);
  const auth = createAuth({ db, origins: authOrigins });
  /** a copy of the whole database every 6 hours (the last 14 are kept): the answer to "I lost my progress" */
  let dbBackupTimer = null;
  if (dbPath !== ':memory:') {
    const snapshot = () => {
      try {
        const d = new Date();
        const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}`;
        const dir = path.join(path.dirname(dbPath), 'db-backups');
        backupDb(db, path.join(dir, `nightclub-${stamp}.db`));
        prune(dir, 'nightclub-', 14);
      } catch (e) {
        console.error('database backup failed:', e.message);
      }
    };
    snapshot();
    dbBackupTimer = setInterval(snapshot, 6 * 3_600_000);
  }
  const audio = new AudioStore(audioDir);
  const saves = new SaveStore(savesDir === null ? null : db);
  const shadows = new Shadows();
  const ranking = new Ranking();
  /** Tell a player (or everybody, with no argument) who is in prison right now, as the city's police would. */
  function announceJailed(only) {
    for (const j of world.jailed()) {
      const note = JSON.stringify({ t: 'bust', name: j.name, victim: j.victim, goal: j.goal, chores: j.chores, ongoing: true });
      if (only) {
        const c = online.get(only);
        if (c && c.ws.readyState === 1 && world.players.get(only)?.n !== j.n) c.ws.send(note);
      } else for (const c of online.values()) if (c.ws.readyState === 1) c.ws.send(note);
    }
  }

  /** Tell one player their position in the city's ranking (and the top of the board). */
  function pushRank(id) {
    const conn = online.get(id);
    const p = world.players.get(id);
    if (conn && p && conn.ws.readyState === 1) conn.ws.send(JSON.stringify({ t: 'rank', ...ranking.viewFor(p.n), jailed: world.jailed() }));
  }
  function rankAll() {
    ranking.update(world, saves, (id) => online.has(id));
    for (const id of online.keys()) pushRank(id);
  }
  const lastSave = new Map();
  const authHits = new Map();
  /** id -> { ws, last: string, lastClub: number, tokens: number, refill: number } */
  const online = new Map();
  const perIp = new Map();
  const started = Date.now();
  let sent = 0;
  let received = 0;
  let lastVersion = -1;

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-nc-token', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
    } else if (u.pathname === '/upload' && req.method === 'POST') {
      // a player uploads a song: the body is the file itself
      const pid = u.searchParams.get('pid') ?? '';
      if (!validId(pid) || !world.players.has(pid)) return void res.writeHead(403, cors).end(JSON.stringify({ error: 'Primero entra a la ciudad.' }));
      if (!auth.allowed(pid, req.headers['x-nc-token'])) return void res.writeHead(401, cors).end(JSON.stringify({ error: 'Inicia sesión con tu cuenta.', login: true }));
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_FILE) {
          res.writeHead(413, cors).end(JSON.stringify({ error: 'La canción pesa más de 15 MB.' }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (size > MAX_FILE) return;
        const r = audio.add(pid, Buffer.concat(chunks), u.searchParams.get('title'));
        res.writeHead(r.error ? r.status : 200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r.error ? { error: r.error } : { id: r.id }));
      });
    } else if (u.pathname === '/save' && req.method === 'POST') {
      // the player's whole game, to keep a copy: the body is the saved game as JSON
      const pid = u.searchParams.get('pid') ?? '';
      if (!validId(pid) || !world.players.has(pid)) return void res.writeHead(403, cors).end(JSON.stringify({ error: 'Primero entra a la ciudad.' }));
      if (!auth.allowed(pid, req.headers['x-nc-token'])) return void res.writeHead(401, cors).end(JSON.stringify({ error: 'Inicia sesión con tu cuenta.', login: true }));
      const now = Date.now();
      if (now - (lastSave.get(pid) ?? 0) < saveEveryMs) return void res.writeHead(429, cors).end(JSON.stringify({ error: 'Muy seguido.' }));
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_SAVE_BYTES) {
          res.writeHead(413, cors).end(JSON.stringify({ error: 'La partida es demasiado grande.' }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (size > MAX_SAVE_BYTES) return;
        lastSave.set(pid, now);
        let raw;
        try {
          raw = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          return void res.writeHead(400, cors).end(JSON.stringify({ error: 'Partida no válida.' }));
        }
        // letters the player's game says it has applied are done; the rest are taken out of what they upload
        const acked = (u.searchParams.get('ack') ?? '').split(',').filter(Boolean).slice(0, 50);
        world.ackMail(pid, acked);
        const force = u.searchParams.get('force') === '1';
        const r = saves.write(pid, raw, force, now, world.pendingMail(pid), force ? null : shadows.take(pid));
        if (r.ok) shadows.track(pid, saves.read(pid).state, now, ranking.factorOf(world.players.get(pid).n));
        res.writeHead(r.error ? r.status : 200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r.error ? { error: r.error, meta: r.meta } : { ok: true, meta: r.meta, at: r.at }));
      });
    } else if (u.pathname === '/save' && req.method === 'GET') {
      // only the owner (who knows the secret code) can read a saved game
      const pid = u.searchParams.get('pid') ?? '';
      if (validId(pid) && !auth.allowed(pid, req.headers['x-nc-token'])) return void res.writeHead(401, cors).end(JSON.stringify({ error: 'Inicia sesión con tu cuenta.', login: true }));
      const s = validId(pid) ? saves.read(pid) : null;
      if (!s) return void res.writeHead(404, cors).end(JSON.stringify({ error: 'No hay una partida guardada con ese código.' }));
      res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ at: s.at, meta: s.meta, state: u.searchParams.get('meta') === '1' ? undefined : s.state }));
    } else if (u.pathname.startsWith('/auth/') && req.method === 'POST') {
      // accounts: passkeys, device linking and recovery (see auth.mjs). Slow down guessing of codes.
      const ip = req.socket.remoteAddress ?? '?';
      const nowA = Date.now();
      const hits = (authHits.get(ip) ?? []).filter((t) => nowA - t < 60_000);
      if (hits.length >= 60) return void res.writeHead(429, cors).end(JSON.stringify({ error: 'Demasiados intentos: espera un minuto.' }));
      hits.push(nowA);
      authHits.set(ip, hits);
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 20_000) req.destroy();
        else chunks.push(c);
      });
      req.on('end', async () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch {
          return void res.writeHead(400, cors).end(JSON.stringify({ error: 'Petición no válida.' }));
        }
        const token = req.headers['x-nc-token'];
        const origin = req.headers.origin;
        const device = String(req.headers['user-agent'] ?? '').slice(0, 60);
        let r;
        try {
          const step = u.pathname.slice(6);
          if (step === 'register/options') {
            const pid = body.pid;
            if (!validId(pid) || !world.players.has(pid)) r = { status: 403, error: 'Primero entra a la ciudad.' };
            else r = await auth.registerOptions({ pid, token, name: world.players.get(pid).club.name, origin, via: body.via });
          } else if (step === 'register/code') {
            const pid = body.pid;
            if (!validId(pid) || !world.players.has(pid)) r = { status: 403, error: 'Primero entra a la ciudad.' };
            else r = auth.registerCode({ pid, device });
          } else if (step === 'register/verify') r = await auth.registerVerify({ cid: body.cid, response: body.response, origin, label: body.label, device });
          else if (step === 'login/options') r = await auth.loginOptions({ origin, via: body.via });
          else if (step === 'login/verify') r = await auth.loginVerify({ cid: body.cid, response: body.response, origin, device });
          else if (step === 'link/create') r = auth.linkCreate({ token });
          else if (step === 'link/redeem') r = auth.linkRedeem({ code: body.code, device });
          else if (step === 'recover') r = auth.recover({ code: body.code, device });
          else if (step === 'recovery/new') r = auth.newRecovery({ token });
          else if (step === 'me') r = auth.me({ token });
          else if (step === 'passkey/remove') r = auth.removePasskey({ token, id: body.id });
          else if (step === 'logout') r = auth.logout({ token });
          else r = { status: 404, error: 'No existe.' };
        } catch (e) {
          r = { status: 500, error: 'Error de cuenta.' };
          console.error('auth', u.pathname, e);
        }
        res.writeHead(r.error ? r.status ?? 400 : 200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r.error ? { error: r.error } : r));
      });
    } else if (u.pathname === '/admin/pardon' && req.method === 'POST') {
      // only from this very machine (never from the network): the owner undoes a prison that should not have been
      const addr = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return void res.writeHead(403, cors).end();
      const n = Number(u.searchParams.get('n'));
      const r = pardon(world, saves, n, deliver);
      if (r.ok) pushCrime(world.byN.get(n));
      res.writeHead(r.ok ? 200 : 400, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r));
    } else if (u.pathname === '/admin/announce' && req.method === 'POST') {
      const addr = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return void res.writeHead(403, cors).end();
      announceJailed();
      res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, jailed: world.jailed().map((j) => j.name) }));
    } else if (u.pathname === '/admin/detain' && req.method === 'POST') {
      const addr = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) return void res.writeHead(403, cors).end();
      const n = Number(u.searchParams.get('n'));
      const r = detain(world, n, Number(u.searchParams.get('until')));
      if (r.ok) pushCrime(world.byN.get(n));
      res.writeHead(r.ok ? 200 : 400, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(r));
    } else if (u.pathname.startsWith('/audio/') && req.method === 'DELETE') {
      const owner = u.searchParams.get('pid') ?? '';
      if (validId(owner) && !auth.allowed(owner, req.headers['x-nc-token'])) return void res.writeHead(401, cors).end();
      const ok = audio.remove(owner, u.pathname.slice(7));
      res.writeHead(ok ? 200 : 404, cors).end();
    } else if (u.pathname.startsWith('/audio/') && req.method === 'GET') {
      const info = audio.info(u.pathname.slice(7));
      if (!info) return void res.writeHead(404, cors).end();
      // Range support: the player can start anywhere and fetch just what it needs
      const file = audio.file(u.pathname.slice(7));
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      const start = m && m[1] !== '' ? Number(m[1]) : 0;
      const end = m && m[2] !== '' ? Math.min(Number(m[2]), info.size - 1) : info.size - 1;
      if (m && (start > end || start >= info.size)) return void res.writeHead(416, { ...cors, 'content-range': `bytes */${info.size}` }).end();
      res.writeHead(m ? 206 : 200, { ...cors, 'content-type': info.type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'public, max-age=31536000, immutable', ...(m ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}) });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else if (u.pathname.startsWith('/songs/') && req.method === 'GET') {
      // the game's own songs (the project's songs/ folder): only plain names like "silla.mp3", with Range so players can start anywhere
      const name = u.pathname.slice(7);
      const file = path.join(SONGS_DIR, name);
      if (!/^[a-z0-9-]{3,40}\.mp3$/.test(name) || !fs.existsSync(file)) return void res.writeHead(404, cors).end();
      const size = fs.statSync(file).size;
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      const start = m && m[1] !== '' ? Number(m[1]) : 0;
      const end = m && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (m && (start > end || start >= size)) return void res.writeHead(416, { ...cors, 'content-range': `bytes */${size}` }).end();
      res.writeHead(m ? 206 : 200, { ...cors, 'content-type': 'audio/mpeg', 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'public, max-age=86400', ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    } else if (req.url === '/who') {
      // who is online and where they are (names only, no ids)
      const list = [...online.keys()].map((id) => { const p = world.players.get(id); const q = world.pos.get(id); return { n: p?.n, name: p?.club.name, pos: q ? { x: q.x, z: q.z, inside: q.m === 1 } : null }; });
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }).end(JSON.stringify(list));
    } else if (req.url === '/stats') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ online: online.size, players: world.players.size, lots: world.nextLot, uptime: Math.round((Date.now() - started) / 1000), rssMB: Math.round(process.memoryUsage().rss / 1e6), sent, received }));
    } else if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
      // the game itself: only files inside the build folder, never anything outside it
      let url;
      try {
        url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      } catch {
        return void res.writeHead(400).end();
      }
      let file = path.join(STATIC_DIR, url === '/' ? 'index.html' : url);
      if (!file.startsWith(STATIC_DIR + path.sep) && file !== STATIC_DIR) return void res.writeHead(403).end();
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } else {
      res.writeHead(404).end();
    }
  });
  const wss = new WebSocketServer({ server, maxPayload: 20000, verifyClient: ({ origin }) => !ORIGINS.length || (origin && ORIGINS.includes(origin)) });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? '?';
    if ((perIp.get(ip) ?? 0) >= maxPerIp) return ws.close(1013, 'too many connections');
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    let id = null;
    let conn = null;
    const hello = setTimeout(() => ws.close(4001, 'hello expected'), 5000);

    ws.on('message', (data) => {
      received++;
      const big = data.length > 2048; // only a furniture layout may be bigger than this
      if (conn) {
        // at most 10 messages a second, with a small burst
        const now = Date.now();
        conn.tokens = Math.min(20, conn.tokens + ((now - conn.refill) / 1000) * 20);
        conn.refill = now;
        if (conn.tokens < 1) return;
        conn.tokens--;
      }
      let m;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return big ? ws.close(1009, 'too big') : undefined;
      }
      if (!m || typeof m !== 'object') return;
      if (big && m.t !== 'layout') return ws.close(1009, 'too big');
      if (m.t === 'hello' && !id) {
        if (!validId(m.id)) return ws.close(4002, 'bad id');
        if (!auth.allowed(m.id, m.token)) {
          // this club belongs to an account: tell the page to ask for the passkey instead of letting anyone in with the id
          ws.send(JSON.stringify({ t: 'auth', need: true }));
          return ws.close(4003, 'login required');
        }
        clearTimeout(hello);
        id = m.id;
        online.get(id)?.ws.close(4000, 'opened elsewhere'); // one connection per player
        conn = { ws, last: '', lastClub: 0, lastLayout: 0, tokens: 20, refill: Date.now(), lastPeers: '', looks: new Map(), visiting: null };
        online.set(id, conn);
        world.join(id, cleanName(m.name));
        settleAway(world, saves, id, deliver); // whatever the club earned while they were away
        ws.send(JSON.stringify({ t: 'clock', now: Date.now(), build: buildId() }));
        push(id);
        pushMail(id);
        pushCrime(id);
        rankAll();
        announceJailed(id); // whoever is in prison when they arrive
      } else if (m.t === 'club' && id) {
        const now = Date.now();
        if (now - conn.lastClub < 1000) return; // a club does not change faster than this
        conn.lastClub = now;
        world.update(id, m.club);
      } else if (m.t === 'look' && id) {
        world.setLook(id, m.look);
      } else if (m.t === 'pos' && id) {
        world.setPos(id, m);
      } else if (m.t === 'layout' && id) {
        const now = Date.now();
        if (now - conn.lastLayout < 3000) return;
        conn.lastLayout = now;
        world.setLayout(id, m.items);
      } else if (m.t === 'chat' && id) {
        // talk: everybody within three lots hears it (the sender already shows it to themselves)
        const now = Date.now();
        if (now - (conn.lastChat ?? 0) < 1200) return; // at most one line every 1.2 s
        const text = cleanChat(m.text);
        if (!text) return;
        conn.lastChat = now;
        const me = world.players.get(id);
        const msg = JSON.stringify({ t: 'chat', n: me.n, name: me.club.name, text });
        for (const [other, c] of online) if (other !== id && c.ws.readyState === 1 && world.inRange(id, other)) c.ws.send(msg);
      } else if (m.t === 'scout' && id && Number.isInteger(m.n)) {
        ws.send(JSON.stringify({ t: 'scout', n: m.n, ...scout(world, saves, id, m.n) }));
      } else if (m.t === 'heist' && id && Number.isInteger(m.n)) {
        const now = Date.now();
        if (now - (conn.lastHeist ?? 0) < 2000) return; // no hammering
        conn.lastHeist = now;
        const r = attempt(world, saves, id, m.n, m, deliver, now);
        ws.send(JSON.stringify({ t: 'heist', n: m.n, ...r }));
        // everybody hears who was caught
        if (r.result?.jail) {
          const note = JSON.stringify({ t: 'bust', name: world.players.get(id).club.name, victim: r.result.jail.victim, goal: r.result.jail.goal });
          for (const c of online.values()) if (c.ws.readyState === 1) c.ws.send(note);
        }
        for (const pid of online.keys()) pushCrime(pid);
      } else if (m.t === 'chore' && id) {
        const r = doChore(world, id);
        ws.send(JSON.stringify({ t: 'chore', ...r }));
        pushCrime(id);
        if (r.released) {
          const note = JSON.stringify({ t: 'freed', name: world.players.get(id).club.name });
          for (const c of online.values()) if (c.ws.readyState === 1) c.ws.send(note);
        }
      } else if (m.t === 'guard' && id && Number.isInteger(m.hours)) {
        const now = Date.now();
        if (now - (conn.lastGuard ?? 0) < 1500) return;
        conn.lastGuard = now;
        const r = buyGuard(world, saves, id, m.hours, deliver);
        ws.send(JSON.stringify({ t: 'guard', ...r }));
        pushCrime(id);
      } else if ((m.t === 'loan' || m.t === 'repay') && id) {
        const now = Date.now();
        if (now - (conn.lastBank ?? 0) < 1000) return;
        conn.lastBank = now;
        const r = m.t === 'loan' ? lend(world, saves, id, m.amount, deliver) : payback(world, saves, id, m.amount === 'all' ? 'all' : m.amount, deliver);
        ws.send(JSON.stringify({ t: 'bank', op: m.t, ...r }));
        pushCrime(id);
      } else if (m.t === 'launder' && id && typeof m.uid === 'string') {
        const r = launder(saves, id, m.uid);
        ws.send(JSON.stringify({ t: 'launder', uid: m.uid, ...r }));
        if (r.ok) pushMail(id);
      } else if (m.t === 'away' && id) {
        // the game went to the background (or came back): a hidden game does not run the club, the server does
        const was = conn.away === true;
        conn.away = m.away === true;
        if (was && !conn.away) {
          settleAway(world, saves, id, deliver);
          pushMail(id);
        }
      } else if (m.t === 'leave' && id) {
        conn.visiting = null;
      } else if (m.t === 'visit' && id && Number.isInteger(m.n)) {
        const v = world.visitView(m.n);
        if (v) conn.visiting = m.n;
        if (v && ws.readyState === 1) ws.send(JSON.stringify({ t: 'club', ...v }));
      }
    });

    ws.on('close', () => {
      clearTimeout(hello);
      perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
      if (id && online.get(id)?.ws === ws) {
        online.delete(id);
        world.touch(id);
      }
    });
    ws.on('error', () => ws.terminate());
  });

  /** Tell one player about their surroundings (skipped when nothing changed for them). */
  function push(id) {
    const conn = online.get(id);
    const city = world.cityFor(id, (o) => online.has(o));
    if (!conn || !city || conn.ws.readyState !== 1) return;
    const msg = JSON.stringify({ t: 'city', ...city, online: online.size });
    if (msg === conn.last) return;
    conn.last = msg;
    conn.ws.send(msg);
    sent++;
  }

  /** Give a player a letter and tell them at once if they are online. */
  function deliver(id, letter) {
    world.addMail(id, letter);
    pushMail(id);
  }

  /** Letters waiting for this player (until they confirm them). */
  function pushMail(id) {
    const conn = online.get(id);
    const mail = world.pendingMail(id);
    if (conn && conn.ws.readyState === 1 && mail.length) conn.ws.send(JSON.stringify({ t: 'mail', mail }));
  }

  /** The player's crime record (heat, shield, detention), read-only for them; sent when it changes. */
  function pushCrime(id) {
    const conn = online.get(id);
    const view = world.crimeView(id);
    if (!conn || !view || conn.ws.readyState !== 1) return;
    const msg = JSON.stringify({ t: 'crime', ...view });
    if (msg === conn.lastCrime) return;
    conn.lastCrime = msg;
    conn.ws.send(msg);
  }

  /** Players walking nearby: sent only when something moved, with each character's look the first time you see it. */
  function pushPeers(id) {
    const conn = online.get(id);
    if (!conn || conn.ws.readyState !== 1) return;
    const peers = world.peersFor(id, (o) => online.has(o), conn.visiting);
    const key = JSON.stringify(peers);
    if (key === conn.lastPeers) return;
    conn.lastPeers = key;
    const p = peers.map((q) => {
      if (conn.looks.get(q.n) === q.lv) return q;
      conn.looks.set(q.n, q.lv);
      return { ...q, look: world.lookOf(q.n) };
    });
    conn.ws.send(JSON.stringify({ t: 'peers', p }));
    sent++;
  }

  const peersTick = setInterval(() => {
    for (const id of online.keys()) pushPeers(id);
  }, 200);
  const clockTick = setInterval(() => {
    const msg = JSON.stringify({ t: 'clock', now: Date.now(), build: buildId() });
    for (const c of online.values()) if (c.ws.readyState === 1) c.ws.send(msg);
    for (const id of online.keys()) pushCrime(id);
    rankAll();
  }, 30000);
  // the police go round every minute (the clubs of offline players too)
  // every minute the server is up, the clubs whose owners are away earn their share (nothing while the server is off)
  const awayTimer = setInterval(() => {
    awayTick(world, saves, shadows, (id) => !online.has(id) || online.get(id).away === true);
  }, 60000);
  // the shadow clubs run once a second
  let lastShadow = Date.now();
  const shadowTick = setInterval(() => {
    const t = Date.now();
    shadows.tick(Math.min(5, (t - lastShadow) / 1000), t);
    lastShadow = t;
  }, 1000);
  const policeTick = setInterval(() => {
    try {
      patrolTick(world, saves, deliver);
      for (const id of online.keys()) pushCrime(id);
    } catch (e) {
      console.error('police tick failed', e);
    }
  }, 60000);

  // the bank's clock: one minute at a time, only while the server is up
  const bankTimer = setInterval(() => {
    try {
      bankTick(world, saves, deliver);
      for (const id of online.keys()) pushCrime(id);
    } catch (e) {
      console.error('bank tick failed', e);
    }
  }, 60000);

  const tick = setInterval(() => {
    if (world.version === lastVersion) return;
    lastVersion = world.version;
    for (const id of online.keys()) push(id);
  }, 1500);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        world,
        online,
        saves, shadows, ranking, auth, db,
        pushMail,
        deliver,
        pushCrime,
        close: () => new Promise((done) => {
          clearInterval(tick);
          clearInterval(peersTick);
          clearInterval(clockTick);
          clearInterval(policeTick);
          clearInterval(bankTimer);
          clearInterval(awayTimer);
          clearInterval(shadowTick);
          clearInterval(dbBackupTimer);
          world.save();
          for (const c of online.values()) c.ws.terminate();
          wss.close(() => server.close(() => { try { db.close(); } catch { /* already closed */ } done(); }));
        }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await createServer();
  console.log(`city server listening on ws://${HOST}:${s.port}  (stats: http://${HOST}:${s.port}/stats)`);
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
