// Server tests. Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createServer } from './index.mjs';
import { cleanClub, cleanName } from './protocol.mjs';
import { CAPS, validate, vaultOf } from './vault.mjs';
import { sanitizeClub, newClub, placeItem } from '../web/src/core/club.ts';
import { applyMail } from '../web/src/core/mail.ts';
import { attempt, buyGuard, doChore, launder, pardon, scout } from './heists.mjs';
import { patrolTick } from './police.mjs';
import { awayTick, settleAway } from './away.mjs';
import { Ranking } from './ranking.mjs';
import { RULES, KITS } from '../web/src/core/heist.ts';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('ok  -', name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tiny client: remembers the last city it was told about. */
function client(port, id, name = 'Test') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const c = { ws, city: null, closed: null, messages: 0 };
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'city') { c.city = m; c.messages++; } });
  ws.on('close', (code) => (c.closed = code));
  c.ready = new Promise((r) => ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', id, name })); r(); }));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.waitCity = async (pred = () => true, ms = 4000) => { for (let t = 0; t < ms; t += 50) { if (c.city && pred(c.city)) return c.city; await sleep(50); } throw new Error('no city update'); };
  return c;
}

await test('input is cleaned: names, numbers and booleans cannot be abused', () => {
  assert.equal(cleanName('  <script>alert(1)</script> Ñandú  '), 'scriptalert1script Ñandú'.slice(0, 20));
  assert.equal(cleanName(''), 'Jugador');
  assert.equal(cleanName(42), 'Jugador');
  assert.equal(cleanName('x'.repeat(100)).length, 20);
  const c = cleanClub({ name: 'A', phase: 99, level: -4, rating: 1e9, open: 'yes', guests: NaN, extra: 'x' });
  const ext = { paint: 'paint_grey', awning: false, rope: false, lights: false, sign: 0 };
  const music = { playing: false, title: '', genre: 'pop', bpm: 120, builtin: false, source: '', ref: '', startedAt: 0 };
  const decor = { wall: 'wall_concrete', floor: 'floor_cement', trim: 'trim_none', light: 'light_bare', art: 'art_none' };
  assert.deepEqual(c, { ext, decor, music, name: 'A', phase: 7, level: 1, rating: 100, open: false, guests: 0 });
  assert.deepEqual(cleanClub(null), { ext, decor, music, name: 'Jugador', phase: 1, level: 1, rating: 50, open: false, guests: 0 });
  assert.deepEqual(cleanClub({ ext: { paint: 'paint_gold', awning: true, sign: 9, rope: 'x', evil: 1 } }).ext, { paint: 'paint_gold', awning: true, rope: false, lights: false, sign: 2 });
  assert.equal(cleanClub({ ext: { paint: 'awning' } }).ext.paint, 'paint_grey', 'only real paints');
  assert.deepEqual(cleanClub({ decor: { wall: 'wall_brick', floor: 'wall_brick', trim: '<x>', light: 'light_laser', art: 5 } }).decor, { ...decor, wall: 'wall_brick', light: 'light_laser' }, 'only real finishes, each in its own group');
});

await test('players get lots in a spiral: the second one lives next door and both see each other', async () => {
  const s = await createServer({ port: 0, dataFile: null });
  const a = client(s.port, 'player-aaaaaaaa', 'Ana');
  await a.ready;
  const ca = await a.waitCity();
  assert.deepEqual([ca.me.i, ca.me.j, ca.me.n], [0, 0, 0]);
  assert.equal(ca.clubs.length, 0);
  const b = client(s.port, 'player-bbbbbbbb', 'Beto');
  await b.ready;
  const cb = await b.waitCity();
  assert.equal(cb.me.n, 1);
  assert.deepEqual([cb.me.i, cb.me.j], [1, 0]);
  assert.equal(cb.clubs[0].name, 'Ana');
  assert.equal(cb.clubs[0].online, true);
  const ca2 = await a.waitCity((c) => c.clubs.length === 1);
  assert.equal(ca2.clubs[0].name, 'Beto');
  assert.equal(ca2.online, 2);
  a.ws.close(); b.ws.close();
  await s.close();
});

await test('a club update reaches the neighbours, cleaned, and not faster than once a second', async () => {
  const s = await createServer({ port: 0, dataFile: null });
  const a = client(s.port, 'player-aaaaaaaa', 'Ana');
  const b = client(s.port, 'player-bbbbbbbb', 'Beto');
  await Promise.all([a.ready, b.ready]);
  await b.waitCity();
  await sleep(1100);
  a.send({ t: 'club', club: { name: 'Gran Club', phase: 99, level: 12, rating: 91, open: true, guests: 30 } });
  a.send({ t: 'club', club: { name: 'Trampa', phase: 1 } }); // too soon: ignored
  const c = await b.waitCity((x) => x.clubs[0]?.name === 'Gran Club');
  assert.deepEqual([c.clubs[0].phase, c.clubs[0].rating, c.clubs[0].open], [7, 91, true]);
  await sleep(1800);
  assert.equal(b.city.clubs[0].name, 'Gran Club');
  a.ws.close(); b.ws.close();
  await s.close();
});

await test('bad ids are rejected, a second connection replaces the first, a slow hello is dropped', async () => {
  const s = await createServer({ port: 0, dataFile: null });
  const bad = client(s.port, 'x');
  await bad.ready;
  await sleep(200);
  assert.equal(bad.closed, 4002);
  const one = client(s.port, 'player-cccccccc');
  await one.ready;
  await one.waitCity();
  const two = client(s.port, 'player-cccccccc');
  await two.ready;
  await two.waitCity();
  await sleep(200);
  assert.equal(one.closed, 4000);
  assert.equal(two.city.me.n, one.city.me.n, 'same player, same lot');
  two.ws.close();
  await s.close();
});

await test('the world is remembered: a restart keeps the lots, and absent players stay as offline clubs', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nc-')), 'world.json');
  let s = await createServer({ port: 0, dataFile: file });
  const a = client(s.port, 'player-aaaaaaaa', 'Ana');
  const b = client(s.port, 'player-bbbbbbbb', 'Beto');
  await Promise.all([a.ready, b.ready]);
  await b.waitCity();
  a.ws.close(); b.ws.close();
  await sleep(100);
  await s.close();
  s = await createServer({ port: 0, dataFile: file });
  const b2 = client(s.port, 'player-bbbbbbbb', 'Beto');
  await b2.ready;
  const c = await b2.waitCity();
  assert.equal(c.me.n, 1, 'Beto keeps his lot');
  assert.equal(c.clubs[0].name, 'Ana');
  assert.equal(c.clubs[0].online, false, 'Ana is away but her club is still in the city');
  const z = client(s.port, 'player-dddddddd', 'Zeta');
  await z.ready;
  assert.equal((await z.waitCity()).me.n, 2, 'new players continue the spiral');
  b2.ws.close(); z.ws.close();
  await s.close();
});

await test('abuse is contained: oversized messages close the socket and garbage is ignored', async () => {
  const s = await createServer({ port: 0, dataFile: null });
  const big = client(s.port, 'player-eeeeeeee');
  await big.ready;
  await big.waitCity();
  big.ws.send('x'.repeat(5000));
  await sleep(200);
  assert.equal(big.closed, 1009);
  const ok = client(s.port, 'player-ffffffff');
  await ok.ready;
  ok.ws.send('not json');
  ok.send({ t: 'nope' });
  ok.send(null);
  await ok.waitCity();
  assert.equal(ok.closed, null, 'garbage does not kill the connection');
  ok.ws.close();
  await s.close();
});

await test('players see each other walk, with their look; visitors get the layout; everyone gets the city clock', async () => {
  const s = await createServer({ port: 0, dataFile: null });
  const msgs = { a: [], b: [] };
  const mk = (id, key) => {
    const c = client(s.port, id, key);
    c.ws.on('message', (d) => msgs[key].push(JSON.parse(d.toString())));
    return c;
  };
  const a = mk('player-aaaaaaaa', 'a');
  const b = mk('player-bbbbbbbb', 'b');
  await Promise.all([a.ready, b.ready]);
  await b.waitCity();
  assert.ok(msgs.a.some((m) => m.t === 'clock' && Math.abs(m.now - Date.now()) < 5000), 'the city clock comes with the welcome');
  a.send({ t: 'look', look: { sex: 'female', skin: 'zzz' } });
  a.send({ t: 'pos', x: 12.34, z: 5, m: 0 });
  a.send({ t: 'layout', items: [{ id: 'dj_booth', x: 1, y: 1, rot: 0 }, { id: 'nope', x: 0, y: 0 }, { id: 'stool', x: 'x', y: 99, rot: 7 }] });
  let peers = null;
  for (let t = 0; t < 3000 && !peers; t += 50) { peers = msgs.b.filter((m) => m.t === 'peers').map((m) => m.p).find((p) => p.length); await sleep(50); }
  assert.ok(peers, 'B sees A walking');
  assert.deepEqual([peers[0].n, peers[0].di, peers[0].dj, peers[0].x, peers[0].z, peers[0].m], [0, -1, 0, 12.3, 5, 0]);
  assert.equal(peers[0].look.sex, 'female', 'the look is sent with the first sighting, cleaned');
  b.send({ t: 'visit', n: 0 });
  let club = null;
  for (let t = 0; t < 2000 && !club; t += 50) { club = msgs.b.find((m) => m.t === 'club' && m.n === 0 && m.items); await sleep(50); }
  assert.ok(club);
  assert.deepEqual(club.items.map((i) => i.id), ['dj_booth', 'stool'], 'unknown objects are dropped');
  assert.equal(club.items[1].y, 40, 'numbers are clamped');
  b.send({ t: 'visit', n: 99 });
  await sleep(200);
  assert.ok(!msgs.b.some((m) => m.t === 'club' && m.n === 99), 'nobody lives in lot 99');
  a.ws.close(); b.ws.close();
  await s.close();
});

await test('songs: uploaded files are checked, limited, streamed with ranges and removable only by their owner', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-audio-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: dir });
  const base = `http://127.0.0.1:${s.port}`;
  const pid = 'player-uploader1';
  const c = client(s.port, pid, 'Subidor');
  await c.ready;
  await c.waitCity();
  const wav = (n) => { const b = Buffer.alloc(2000 + n); b.write('RIFF', 0); b.write('WAVE', 8); b.write('fmt ', 12); for (let i = 44; i < b.length; i++) b[i] = (i * 7 + n) & 255; return b; };
  const up = (id, body, title = 'x') => fetch(`${base}/upload?pid=${id}&title=${title}`, { method: 'POST', body });
  assert.equal((await up('player-stranger1', wav(1))).status, 403, 'only players inside the city can upload');
  assert.equal((await up(pid, Buffer.from('this is not audio at all, just text'))).status, 415, 'the bytes decide, not the name');
  // too big: the server answers 413 and cuts the connection, which the client may see as either
  const big = await up(pid, Buffer.alloc(16 * 1024 * 1024, 1)).then((r) => r.status, () => 413);
  assert.equal(big, 413);
  const ok = await up(pid, wav(5), 'Mi tema');
  assert.equal(ok.status, 200);
  const { id } = await ok.json();
  assert.match(id, /^[a-f0-9]{20}$/);
  assert.equal((await (await up(pid, wav(5))).json()).id, id, 'the same file is stored once');
  const full = await fetch(`${base}/audio/${id}`);
  assert.equal(full.headers.get('content-type'), 'audio/wav');
  assert.equal((await full.arrayBuffer()).byteLength, 2005);
  const part = await fetch(`${base}/audio/${id}`, { headers: { range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 100-199/2005');
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${base}/audio/${id}`, { headers: { range: 'bytes=9999-' } })).status, 416);
  assert.equal((await fetch(`${base}/audio/not-a-song`)).status, 404);
  for (let n = 10; n < 19; n++) assert.equal((await up(pid, wav(n))).status, 200);
  assert.equal((await up(pid, wav(99))).status, 409, 'ten songs per player');
  assert.equal((await fetch(`${base}/audio/${id}?pid=player-stranger1`, { method: 'DELETE' })).status, 404, 'only the owner removes it');
  assert.equal((await fetch(`${base}/audio/${id}?pid=${pid}`, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(`${base}/audio/${id}`)).status, 404);
  c.ws.close();
  await s.close();
});

await test('chat: neighbours hear it cleaned, far players do not, and it is rate limited', async () => {
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, maxPerIp: 500 });
  const heard = { b: [], far: [] };
  const mk = (id, key) => { const c = client(s.port, id, key); if (heard[key]) c.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'chat') heard[key].push(m); }); return c; };
  const a = mk('player-chat-aaaa', 'a');
  const b = mk('player-chat-bbbb', 'b');
  await Promise.all([a.ready, b.ready]);
  await b.waitCity();
  // players 2..45 fill the spiral so the last one lives far from the first
  const fill = [];
  for (let i = 0; i < 60; i++) { const f = client(s.port, `player-fill-${String(i).padStart(4, '0')}`, `f${i}`); fill.push(f); await f.ready; }
  const far = mk('player-chat-far0', 'far');
  await far.ready;
  await far.waitCity();
  a.send({ t: 'chat', text: '  hola\u0000   \n  a todos  ' + 'x'.repeat(200) });
  a.send({ t: 'chat', text: 'segundo mensaje enseguida' });
  for (let t = 0; t < 2500 && !heard.b.length; t += 50) await sleep(50);
  assert.equal(heard.b.length, 1, 'only the first line: the second came too fast');
  assert.equal(heard.b[0].text.length, 100);
  assert.ok(heard.b[0].text.startsWith('hola a todos x'), heard.b[0].text);
  assert.equal(heard.b[0].n, 0);
  await sleep(300);
  assert.equal(heard.far.length, 0, 'a player many lots away does not hear it');
  a.send({ t: 'chat', text: '   ' });
  await sleep(1300);
  a.send({ t: 'chat', text: 'ok' });
  for (let t = 0; t < 2000 && heard.b.length < 2; t += 50) await sleep(50);
  assert.equal(heard.b.length, 2, 'blank lines are dropped; the next real one passes after the wait');
  [a, b, far, ...fill].forEach((c) => c.ws.close());
  await s.close();
});

await test('saved games: exact copy, cleaned, backed up, and a wipe can never replace a good game by accident', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-saves-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const pid = 'player-saver-0001';
  const c = client(s.port, pid, 'Guardador');
  await c.ready;
  await c.waitCity();
  const post = (id, body, q = '') => fetch(`${base}/save?pid=${id}${q}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  const game = { xp: 50000, coins: 123456, phase: 3, items: [{ id: 'plant', x: 1, y: 1, rot: 0 }], story: { intro: true, name: 'Camila', seen: ['intro'], done: ['tiles'], tutorial: -1 }, exterior: { owned: ['paint_grey', 'awning'], paint: 'paint_grey' } };

  assert.equal((await post('player-stranger-9', game)).status, 403, 'only a known player');
  assert.equal((await post(pid, 'not json')).status, 400);
  assert.equal(await post(pid, Buffer.alloc(301 * 1024, 120)).then((r) => r.status, () => 413), 413, 'too big');
  const first = await post(pid, game);
  assert.equal(first.status, 200);
  const got = await (await fetch(`${base}/save?pid=${pid}`)).json();
  assert.equal(got.state.coins, 123456);
  assert.equal(got.state.story.name, 'Camila');
  assert.deepEqual(got.state.story.done, ['tiles']);
  assert.ok(got.state.exterior.owned.includes('awning'), 'the facade comes back');
  assert.equal(got.meta.xp, 50000);
  assert.equal((await fetch(`${base}/save?pid=player-stranger-9`)).status, 404, 'nobody else can read it');
  assert.equal((await fetch(`${base}/save?pid=${pid}&meta=1`).then((r) => r.json())).state, undefined, 'meta only on request');

  // junk inside is cleaned, never stored as received
  await post(pid, { ...game, xp: 50050, coins: -5, items: [{ id: 'nope', x: 1, y: 1 }, { id: 'plant', x: 2, y: 2, rot: 0 }] });
  const cleaned = (await (await fetch(`${base}/save?pid=${pid}`)).json()).state;
  assert.equal(cleaned.items.length, 1);
  assert.ok(cleaned.coins >= 0);

  // an old copy from another device (a bit less experience) does not step on the newer one
  const stale = await post(pid, { ...game, xp: 50010, coins: 999 });
  assert.equal(stale.status, 409, 'an older copy is refused');
  assert.equal((await (await fetch(`${base}/save?pid=${pid}`)).json()).meta.xp, 50050, 'the newer copy stays');

  // a wipe does not replace the good game; it is kept apart; an explicit start-over does replace it
  const wipe = await post(pid, { xp: 0, story: { intro: false } });
  assert.equal(wipe.status, 409);
  assert.equal((await (await fetch(`${base}/save?pid=${pid}`)).json()).meta.xp, 50050, 'the good copy is still there');
  assert.ok(s.db.prepare('SELECT 1 FROM save_suspects WHERE pid = ?').get(pid), 'and the wipe is kept apart');
  assert.equal((await post(pid, { xp: 0, story: { intro: false } }, '&force=1')).status, 200, 'starting over on purpose is allowed');
  assert.equal((await (await fetch(`${base}/save?pid=${pid}`)).json()).meta.xp, 0);
  assert.ok(s.saves.backups(pid).length > 0, 'the earlier game was kept as a backup');
  c.ws.close();
  await s.close();
});

await test('validation: honest games pass untouched, absurd jumps are clamped and flagged, impossible versions are fixed', () => {
  const prev = sanitizeClub({ xp: 20000, coins: 100000 });
  const honest = sanitizeClub({ xp: 20300, coins: 103000 });
  const ok = validate(prev, honest, 30 * 60_000);
  assert.deepEqual(ok.flags, []);
  assert.equal(ok.state.coins, 103000);
  const cheat = validate(prev, sanitizeClub({ xp: 5e7, coins: 9e11 }), 60_000);
  assert.deepEqual(cheat.flags.sort(), ['coins', 'xp']);
  assert.ok(cheat.state.coins <= prev.coins + 20000, 'what the club could have earned in a minute, plus a margin');
  assert.ok(cheat.state.xp <= prev.xp + 1000);
  let g = { ...newClub(), xp: 0, coins: 1e9, phase: 3 };
  g = placeItem(g, 'plant', 1, 1, 0, 'free').state;
  const forged = { ...g, items: [{ ...g.items[0], tier: 4 }, { ...g.items[0], x: 5 }] };
  const fixed = validate(sanitizeClub(forged), sanitizeClub(forged), 0);
  assert.ok(fixed.flags.includes('tier'));
  assert.ok(fixed.state.items.every((i) => !i.tier), 'a level-1 player cannot hold an elite piece');
  assert.deepEqual(validate(null, sanitizeClub({ xp: 1000, coins: 5e6 }), 0).flags, [], 'an existing player joining may already have a lot');
  assert.deepEqual(validate(null, sanitizeClub({ coins: 9e12 }), 0).flags, ['coins']);
});

await test('the vault lists what a thief could see: the cash and the pieces', () => {
  let g = { ...newClub(), coins: 5000, phase: 3, staff: { guard: 2, dj: 0, bartender: 0 } };
  g = placeItem(g, 'gold_statue', 2, 2, 0, 'free').state;
  const v = vaultOf(g, true);
  assert.equal(v.cash, 5000);
  assert.deepEqual(v.pieces.map((p) => p.id), ['gold_statue']);
  assert.equal(v.security.guards, 2);
});

await test('mail: a robbery loss is applied to the server copy even if the player ignores it, and stops once they confirm it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-mail-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const pid = 'player-victim-0001';
  const c = client(s.port, pid, 'Victima');
  const mails = [];
  c.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'mail' || m.t === 'crime') mails.push(m); });
  await c.ready;
  await c.waitCity();
  let g = { ...newClub(), xp: 90000, coins: 100000, phase: 3 };
  g = placeItem(g, 'gold_statue', 2, 2, 0, 'free').state;
  const uid = g.items[0].uid;
  const post = (q = '') => fetch(`${base}/save?pid=${pid}${q}`, { method: 'POST', body: JSON.stringify(g) });
  assert.equal((await post()).status, 200);
  // a thief's robbery arrives (stage 3 will call this)
  s.world.addMail(pid, { id: 'm1', at: Date.now(), kind: 'robbed', by: 7, byName: 'Ladron', cash: 10000, pieces: [{ uid, id: 'gold_statue', tier: 1 }] });
  s.pushMail(pid);
  for (let t = 0; t < 2000 && !mails.some((m) => m.t === 'mail'); t += 50) await sleep(50);
  assert.equal(mails.find((m) => m.t === 'mail').mail[0].id, 'm1');
  // the player's game does NOT apply it and uploads the old game again: the server copy still carries the loss
  await post();
  let saved = (await (await fetch(`${base}/save?pid=${pid}`)).json()).state;
  assert.equal(saved.coins, 90000);
  assert.equal(saved.items.length, 0, 'the stolen piece does not come back');
  // the game applies the letter and confirms it: from then on its own numbers are the truth, with no double charge
  g = applyMail(g, mails.find((m) => m.t === 'mail').mail);
  assert.equal(g.coins, 90000);
  await post('&ack=m1');
  saved = (await (await fetch(`${base}/save?pid=${pid}`)).json()).state;
  assert.equal(saved.coins, 90000, 'not charged twice');
  assert.deepEqual(s.world.pendingMail(pid), []);
  // the crime record reached the player, read-only
  const crime = mails.find((m) => m.t === 'crime');
  assert.ok(crime && crime.heat === 0 && crime.shieldUntil === 0);
  c.ws.close();
  await s.close();
});

await test('the crime record is kept by the server and survives a restart', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nc-crime-')), 'world.json');
  let s = await createServer({ port: 0, dataFile: file, audioDir: null, savesDir: null });
  const a = client(s.port, 'player-crime-0001', 'Cr');
  await a.ready;
  await a.waitCity();
  const cr = s.world.crimeOf('player-crime-0001');
  s.world.setCrime('player-crime-0001', { ...cr, heat: 70, heatAt: Date.now(), shieldUntil: Date.now() + 1000 });
  s.world.addMail('player-crime-0001', { id: 'm9', at: 1, kind: 'robbed', by: 1, byName: 'x', cash: 5, pieces: [] });
  a.ws.close();
  await sleep(100);
  await s.close();
  s = await createServer({ port: 0, dataFile: file, audioDir: null, savesDir: null });
  assert.equal(s.world.crimeOf('player-crime-0001').heat, 70);
  assert.equal(s.world.pendingMail('player-crime-0001')[0].id, 'm9', 'a letter not yet confirmed is not lost');
  assert.ok(s.world.crimeView('player-crime-0001').heat >= 60);
  await s.close();
});

await test('robberies are settled on the server: scouting, success, failure, kits, the rules, laundering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-heist-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const [A, B] = ['player-thief-0001', 'player-owner-0001'];
  const ca = client(s.port, A, 'Ladron');
  const cb = client(s.port, B, 'Dueno');
  await Promise.all([ca.ready, cb.ready]);
  await cb.waitCity();
  const letters = { a: [], b: [] };
  const track = (c, k) => c.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'mail') letters[k].push(...m.mail); });
  track(ca, 'a'); track(cb, 'b');
  const xp = 600000; // level well above 10 for both
  let thiefGame = { ...newClub(), xp, coins: 50000, phase: 4, kits: { picks: 2, jammer: 0, van: 0, disguise: 1 } };
  let ownerGame = { ...newClub(), xp, coins: 200000, phase: 4, staff: { guard: 0, dj: 0, bartender: 0 } };
  ownerGame = placeItem(placeItem(ownerGame, 'gold_statue', 2, 2, 0, 'free').state, 'plant', 4, 4, 0, 'free').state;
  const statueUid = ownerGame.items.find((i) => i.id === 'gold_statue').uid;
  const save = (id, g) => fetch(`${base}/save?pid=${id}`, { method: 'POST', body: JSON.stringify(g) });
  await save(A, thiefGame); await save(B, ownerGame);
  const NOW = Date.UTC(2026, 10, 28, 15, 0, 0);
  const deliver = (id, letter) => s.deliver(id, letter);

  // a player whose game the server has never seen cannot be robbed
  assert.equal(scout(s.world, s.saves, A, 99).ok, false);

  // scouting shows the guards and the pieces worth taking, and says the cash only as "poca / media / mucha"
  const look = scout(s.world, s.saves, A, 1, NOW);
  assert.equal(look.ok, true);
  assert.deepEqual(look.target.pieces.map((p) => p.id), ['gold_statue'], 'only what could be taken');
  assert.equal(look.target.cash, 'mucha');
  assert.equal(look.denied, null);
  assert.ok(look.odds.kitted > look.odds.bare);

  // bringing a kit you do not have is refused
  assert.match(attempt(s.world, s.saves, A, 1, { kits: ['van'] }, deliver, NOW, () => 0.01).error, /No tienes/);

  // a good job: the cash and the statue change hands, both sides get letters, the kits are spent, the shield goes up
  const win = attempt(s.world, s.saves, A, 1, { want: statueUid, kits: ['picks'], skill: 0.5 }, deliver, NOW, () => 0.01);
  assert.equal(win.result.kind, 'full');
  assert.equal(win.result.cash, 20000);
  assert.deepEqual(win.result.pieces.map((p) => p.id), ['gold_statue']);
  const ownerSave = s.saves.read(B).state;
  assert.equal(ownerSave.coins, 180000);
  assert.ok(!ownerSave.items.some((i) => i.id === 'gold_statue'), 'gone from the owner');
  const thiefSave = s.saves.read(A).state;
  assert.equal(thiefSave.coins, 70000);
  assert.equal(thiefSave.loot.length, 1);
  assert.ok(thiefSave.loot[0].hotUntil > NOW, 'the stolen piece is hot');
  assert.equal(thiefSave.kits.picks, 1, 'one pair of picks was used up');
  for (let t = 0; t < 2000 && !(letters.a.length && letters.b.length); t += 50) await sleep(50);
  assert.equal(letters.b[0].kind, 'robbed');
  assert.equal(letters.a[0].kind, 'loot');
  assert.deepEqual(letters.a[0].kitsUsed, ['picks']);
  assert.ok(s.world.crimeOf(A).heat >= RULES.heatPerHeist);
  assert.ok(s.world.crimeOf(B).shieldUntil > NOW);

  // the rules hold: the victim is shielded now, and the thief has to wait
  assert.equal(attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, NOW + 3600_000, () => 0.01).result.reason, 'cooldown');
  assert.equal(scout(s.world, s.saves, A, 1, NOW + 3600_000).denied.reason, 'cooldown');

  // laundering the hot piece costs a share of its value and cools it
  const uid = thiefSave.loot[0].uid;
  const price = launder(s.saves, A, uid, NOW).price;
  assert.ok(price > 0);
  assert.equal(s.saves.read(A).state.loot[0].hotUntil, 0);
  assert.equal(s.saves.read(A).state.coins, 70000 - price);
  assert.match(launder(s.saves, A, 'nope').error, /bolsa/);

  // a failed robbery: detention and heat for the thief, nothing taken, the disguise halves the heat
  const later = NOW + 13 * 3600_000;
  s.world.setCrime(B, { ...s.world.crimeOf(B), shieldUntil: 0, lossDay: 0, lossPieces: 0, lossCash: 0 });
  const lost = attempt(s.world, s.saves, A, 1, { kits: ['disguise'] }, deliver, later, () => 0.99);
  assert.equal(lost.result.kind, 'fail');
  assert.equal(s.world.crimeOf(A).detainedUntil, later + RULES.detention);
  assert.equal(s.saves.read(B).state.coins, 180000, 'a failed robbery takes nothing');
  assert.equal(attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, later + 3600_000, () => 0.01).result.reason, 'detained');
  assert.ok(KITS.length === 4);
  ca.ws.close(); cb.ws.close();
  await s.close();
});

await test('the police: hot pieces on show raise the heat, then patrols fine, seize and shut the club', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-police-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const P = 'player-police-0001';
  const c = client(s.port, P, 'Sospechoso');
  await c.ready;
  const NOW = Date.UTC(2026, 10, 28, 15, 0, 0);
  let g = { ...newClub(), xp: 600000, coins: 100000, phase: 4 };
  g = placeItem(g, 'gold_statue', 2, 2, 0, 'free').state;
  const uid = g.items.find((i) => i.id === 'gold_statue').uid;
  g = { ...g, open: true, items: g.items.map((i) => (i.uid === uid ? { ...i, hot: NOW + 72 * 3600_000 } : i)) };
  await fetch(`${base}/save?pid=${P}`, { method: 'POST', body: JSON.stringify(g) });
  const letters = [];
  const deliver = (id, l) => { letters.push(l); s.deliver(id, l); };

  // the first pass only starts the clock; a clean club is left alone
  patrolTick(s.world, s.saves, deliver, NOW);
  assert.equal(letters.length, 0);
  // ten hours later the hot statue has made the heat grow (2 an hour), (60 falls to 20 in ten hours, the statue adds 20) so patrols start looking
  const t1 = NOW + 10 * 3600_000;
  s.world.setCrime(P, { ...s.world.crimeOf(P), heat: 60, heatAt: NOW });
  const v1 = patrolTick(s.world, s.saves, deliver, t1);
  assert.ok(s.world.crimeOf(P).heat > 0);
  assert.equal(v1.length, 1, 'a patrol came by');
  assert.equal(v1[0].seized, 1);
  assert.equal(letters[0].kind, 'police');
  assert.ok(!s.saves.read(P).state.items.some((i) => i.uid === uid), 'the hot statue was seized');
  assert.ok(s.saves.read(P).state.coins < 100000, 'and a fine was paid');
  // not again until the next visit is due
  assert.equal(patrolTick(s.world, s.saves, deliver, t1 + 60_000).length, 0);
  // very high heat: the raid shuts the club and the heat falls back
  s.world.setCrime(P, { ...s.world.crimeOf(P), heat: 95, heatAt: t1 + 3_600_000, patrolAt: 0 });
  const t2 = t1 + 3_600_000;
  const v2 = patrolTick(s.world, s.saves, deliver, t2);
  assert.equal(v2[0].level, 'raid');
  assert.ok(s.world.crimeOf(P).closedUntil >= t2 + 12 * 3600_000);
  assert.equal(s.saves.read(P).state.open, false, 'the club is shut');
  assert.ok(s.world.crimeOf(P).heat <= 40);
  c.ws.close();
  await s.close();
});

await test('defenses: a safe or armoured vitrine locks the best piece and shields cash, the alarm adds heat', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-def-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const [A, B] = ['player-thief-0002', 'player-owner-0002'];
  const ca = client(s.port, A, 'Ladron'); const cb = client(s.port, B, 'Dueno');
  await Promise.all([ca.ready, cb.ready]); await cb.waitCity();
  let owner = { ...newClub(), xp: 600000, coins: 200000, phase: 4, staff: { guard: 0, dj: 0, bartender: 0 } };
  for (const [id, x, y] of [['gold_statue', 2, 2], ['trophy_cup', 4, 2], ['safe', 6, 2], ['alarm', 8, 2]]) owner = placeItem(owner, id, x, y, 0, 'free').state;
  const thief = { ...newClub(), xp: 600000, coins: 50000, phase: 4, kits: { picks: 0, jammer: 0, van: 0, disguise: 0 } };
  await fetch(`${base}/save?pid=${A}`, { method: 'POST', body: JSON.stringify(thief) });
  await fetch(`${base}/save?pid=${B}`, { method: 'POST', body: JSON.stringify(owner) });
  const NOW = Date.UTC(2026, 10, 28, 15, 0, 0);
  const look = scout(s.world, s.saves, A, 1, NOW);
  assert.equal(look.target.alarm, true);
  assert.ok(!look.target.pieces.some((p) => p.id === 'gold_statue'), 'the safe keeps the statue out of reach');
  assert.ok(look.target.pieces.some((p) => p.id === 'trophy_cup'));
  const win = attempt(s.world, s.saves, A, 1, { kits: [] }, (id, l) => s.deliver(id, l), NOW, () => 0.01);
  assert.equal(win.result.cash, 14000, 'a safe shields 30% of the 10% share: 20000 -> 14000');
  assert.ok(s.world.crimeOf(A).heat >= RULES.heatPerHeist + 10, 'the alarm added heat');
  ca.ws.close(); cb.ws.close(); await s.close();
});

await test('chat: insults are masked, names and ordinary words are not', async () => {
  const { cleanChat } = await import('./protocol.mjs');
  assert.equal(cleanChat('eres un IDIOTA'), 'eres un ******');
  assert.equal(cleanChat('puuuta madre'), '****** madre');
  assert.equal(cleanChat('Vergara y la computadora'), 'Vergara y la computadora');
});

await test('the game songs are served with Range and only by plain name; a club can publish one', async () => {
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: null, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const part = await fetch(`${base}/songs/silla.mp3`, { headers: { range: 'bytes=0-99' } });
  assert.equal(part.status, 206);
  assert.equal((await part.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${base}/songs/nope.mp3`)).status, 404);
  assert.equal((await fetch(`${base}/songs/..%2Findex.mjs`)).status, 404);
  const { cleanMusic } = await import('./protocol.mjs');
  assert.equal(cleanMusic({ playing: true, source: 'song', ref: 'silla', title: 'x', genre: 'pop' }).ref, 'silla');
  assert.equal(cleanMusic({ source: 'song', ref: '../etc' }).source, '');
  await s.close();
});

await test('shadow clubs: the server simulates a club and the ledger only lets the game claim what it could have earned', async () => {
  const { Shadows } = await import('./shadow.mjs');
  let g = { ...newClub(), phase: 3, xp: 40000, coins: 50000, open: true };
  const put = (id, x, y) => { g = placeItem(g, id, x, y, 0, 'free').state; };
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) put('floor_cyan', x, y);
  put('bar_straight', 1, 1); put('dj_booth', 7, 1);
  for (const x of [1, 2, 3]) put('stool', x, 2);
  g = { ...g, music: { ...g.music, playing: true, current: 's_silla' } };
  g = sanitizeClub(g);
  const sh = new Shadows();
  sh.track('p1', g, 0);
  sh.tick(600, 1000); // ten minutes of the night
  const m = sh.take('p1');
  assert.ok(m.coins > 0 && m.seconds >= 599, 'the shadow club earned something over ten minutes');
  // an honest game that earned what the shadow did passes; one that conjured 10x more is clamped
  const honest = { ...g, coins: g.coins + Math.round(m.coins) };
  assert.deepEqual(validate(g, honest, 600_000, m).flags, []);
  const cheat = { ...g, coins: g.coins + Math.round(m.coins * 10) + 100000 };
  const r = validate(g, cheat, 600_000, m);
  assert.ok(r.flags.includes('coins'));
  assert.ok(r.state.coins < cheat.coins / 2, 'most of the invention is taken out');
});

await test('dances: a valid emote travels with the position, anything else is dropped', async () => {
  const { cleanPos } = await import('./protocol.mjs');
  assert.equal(cleanPos({ x: 1, z: 2, m: 1, e: 'dancehall' }).e, 'dancehall');
  assert.equal(cleanPos({ x: 1, z: 2, e: '<script>' }).e, '');
  assert.equal(cleanPos({ x: 1, z: 2 }).e, '');
});

await test('away income: only the running server pays, a share of the usual income, capped, and it arrives as a letter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-away-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const P = 'player-away-00001';
  const c = client(s.port, P, 'Ausente');
  await c.ready;
  let g = { ...newClub(), xp: 40000, coins: 1000, phase: 3, open: true };
  for (let y = 4; y <= 9; y++) for (let x = 3; x <= 8; x++) g = placeItem(g, 'floor_cyan', x, y, 0, 'free').state;
  g = placeItem(g, 'bar_straight', 1, 1, 0, 'free').state;
  g = { ...g, offline: { rate: 300, at: Date.now() } };
  await fetch(`${base}/save?pid=${P}`, { method: 'POST', body: JSON.stringify(g) });
  // while the owner is playing nothing is paid
  const tick = () => awayTick(s.world, s.saves, s.shadows, (id) => id === P);
  c.ws.close();
  await sleep(100);
  for (let i = 0; i < 20; i++) tick();
  const owed = s.world.players.get(P).away;
  assert.ok(owed.coins > 0 && owed.minutes === 20, 'twenty minutes of the server being up were counted');
  assert.ok(owed.coins <= 300 * 0.35 * 20 + 1, 'never more than the club says it earns, times the 35% share');
  // the cap: no more than 8 hours per absence
  for (let i = 0; i < 600; i++) tick();
  assert.equal(s.world.players.get(P).away.minutes, 480);
  // the owner comes back: a letter and the server's copy
  const letters = [];
  const delivered = (id, l) => letters.push(l);
  const before = s.saves.read(P).state.coins;
  const paid = settleAway(s.world, s.saves, P, delivered);
  assert.ok(paid > 0 && letters[0].kind === 'income' && letters[0].cash === paid && letters[0].minutes === 480);
  assert.equal(s.saves.read(P).state.coins, before + paid);
  assert.equal(settleAway(s.world, s.saves, P, delivered), 0, 'paid once');
  await s.close();
});

await test('ranking: open clubs are ranked by fame, the crowd factor follows, closed clubs do not compete', () => {
  const players = new Map([
    ['a', { n: 0, club: { name: 'Alta', rating: 90, level: 12, open: true }, lastSeen: Date.now() }],
    ['b', { n: 1, club: { name: 'Media', rating: 60, level: 8, open: true }, lastSeen: Date.now() }],
    ['c', { n: 2, club: { name: 'Baja', rating: 30, level: 4, open: true }, lastSeen: Date.now() }],
    ['d', { n: 3, club: { name: 'Cerrada', rating: 99, level: 20, open: false }, lastSeen: Date.now() }],
    ['e', { n: 4, club: { name: 'Vieja', rating: 99, level: 20, open: true }, lastSeen: Date.now() - 10 * 24 * 3600_000 }],
  ]);
  const saves = { read: () => ({ state: sanitizeClub({}) }) };
  const r = new Ranking();
  r.update({ players }, saves, (id) => id === 'a');
  assert.deepEqual(r.board.map((x) => x.name), ['Alta', 'Media', 'Baja', 'Cerrada'], 'a club not played for ten days is out');
  assert.equal(r.factorOf(0), 1.3);
  assert.equal(r.factorOf(2), 0.75);
  assert.equal(r.factorOf(3), 1, 'a closed club has the normal factor and no place');
  assert.deepEqual(r.viewFor(1).you, { n: 1, rank: 2, of: 3, factor: r.factorOf(1) });
});

await test('strict robberies: a bought protector makes a club untouchable, a caught thief goes to prison with their club shut and a fine, and robbing ends their own protector', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-guard-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const [A, B] = ['player-thief-0003', 'player-owner-0003'];
  const ca = client(s.port, A, 'Ladron');
  const cb = client(s.port, B, 'Dueno');
  await Promise.all([ca.ready, cb.ready]);
  await cb.waitCity();
  const xp = 600000;
  const thief = { ...newClub(), xp, coins: 100000, phase: 4 };
  let owner = { ...newClub(), xp, coins: 200000, phase: 4, staff: { guard: 0, dj: 0, bartender: 0 } };
  owner = placeItem(owner, 'gold_statue', 2, 2, 0, 'free').state;
  const save = (id, g) => fetch(`${base}/save?pid=${id}`, { method: 'POST', body: JSON.stringify(g) });
  await save(A, thief); await save(B, owner);
  const NOW = Date.UTC(2026, 10, 28, 15, 0, 0);
  const letters = [];
  const deliver = (id, l) => letters.push({ id, ...l });

  // buying the protector: charged by the server, capped at a day, and it blocks robberies
  assert.equal(buyGuard(s.world, s.saves, B, 5, deliver, NOW).ok, false, 'only the real options');
  const bought = buyGuard(s.world, s.saves, B, 6, deliver, NOW);
  assert.ok(bought.ok && bought.price > 0);
  assert.equal(s.saves.read(B).state.coins, 200000 - bought.price);
  assert.equal(letters.at(-1).kind, 'fee');
  assert.equal(buyGuard(s.world, s.saves, B, 24, deliver, NOW).ok, false, 'not beyond 24 hours in a row');
  assert.equal(attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, NOW, () => 0.01).result.reason, 'guard');
  assert.equal(scout(s.world, s.saves, A, 1, NOW).denied.reason, 'guard');
  // the protector runs out
  const later = NOW + 7 * 3600_000;
  s.world.setCrime(B, { ...s.world.crimeOf(B), shieldUntil: 0 });
  // a thief caught: prison (leave by doing chores: 20, or 30 for a hard target), the club shut while inside, a fine, and the heat
  const coinsBefore = s.saves.read(A).state.coins;
  const caught = attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, later, () => 0.99);
  assert.equal(caught.result.kind, 'fail');
  assert.equal(caught.result.jail.goal, 20);
  assert.equal(s.world.crimeOf(A).closedUntil, s.world.crimeOf(A).detainedUntil, 'the club is shut for as long as they are inside');
  assert.ok(s.world.crimeOf(A).detainedUntil > later);
  assert.equal(s.world.crimeOf(A).choreGoal, 20);
  assert.equal(caught.result.jail.fine, Math.floor(coinsBefore * RULES.fineShare));
  assert.equal(s.saves.read(A).state.open, false);
  assert.equal(letters.at(-1).kind, 'jail');
  assert.equal(letters.at(-1).chores, 20);
  assert.equal(s.world.jailed(later + 1).map((j) => j.name).join(), 'Ladron'.length ? s.world.players.get(A).club.name : '', 'the prison list names them');
  // in prison they are not out in the city, and the chores are the way out (one every few seconds, no faster)
  s.world.pos.set(A, { x: 5, z: 5, m: 0, v: 1 });
  assert.ok(!s.world.peersFor(B, () => true).some((q) => q.n === s.world.players.get(A).n), 'a prisoner does not walk in the city');
  const t0 = Date.now();
  let r = doChore(s.world, A, t0);
  assert.ok(r.ok && r.done === 1 && !r.released);
  assert.equal(doChore(s.world, A, t0 + 1000).ok, false, 'too fast');
  for (let i = 2; i <= 20; i++) r = doChore(s.world, A, t0 + i * 6000);
  assert.ok(r.ok && r.released && r.done === 20, 'the 20th chore opens the door');
  assert.equal(s.world.crimeOf(A).detainedUntil, 0);
  assert.equal(s.world.crimeOf(A).closedUntil, 0);
  assert.equal(doChore(s.world, A, t0 + 999999).ok, false, 'free people have no chores');
  // a hard target (an alarm) means 30 chores
  const hardOwner = placeItem(owner, 'alarm', 6, 6, 0, 'free').state;
  await save(B, hardOwner);
  s.world.setCrime(A, { ...s.world.crimeOf(A), detainedUntil: 0, lastHeistAt: 0, targets: {}, closedUntil: 0 });
  s.world.setCrime(B, { ...s.world.crimeOf(B), shieldUntil: 0 });
  const hard = attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, later + 24 * 3600_000, () => 0.99);
  assert.equal(hard.result.jail.goal, 30);
  // robbing ends the thief's own protector
  s.world.setCrime(A, { ...s.world.crimeOf(A), detainedUntil: 0, lastHeistAt: 0, targets: {}, closedUntil: 0, guardUntil: later + 99 * 3600_000 });
  s.world.setCrime(B, { ...s.world.crimeOf(B), shieldUntil: 0, guardUntil: 0, lossDay: 0, lossPieces: 0 });
  attempt(s.world, s.saves, A, 1, { kits: [] }, deliver, later + 48 * 3600_000, () => 0.99);
  assert.equal(s.world.crimeOf(A).guardUntil, 0);
  ca.ws.close(); cb.ws.close();
  await s.close();
});

await test('a prison that should not have been (a robbery nobody saw) is undone: the door opens and the fine comes back', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-pardon-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0 });
  const P = 'player-pardon-0001';
  const c = client(s.port, P, 'Libre');
  await c.ready;
  await fetch(`http://127.0.0.1:${s.port}/save?pid=${P}`, { method: 'POST', body: JSON.stringify({ ...newClub(), xp: 40000, coins: 9000, phase: 3 }) });
  const now = Date.now();
  s.world.setCrime(P, { ...s.world.crimeOf(P), detainedUntil: now + 6 * 3600_000, closedUntil: now + 6 * 3600_000, choreGoal: 20 });
  s.world.addMail(P, { id: 'c1-0', at: now, kind: 'jail', by: 3, byName: 'X', cash: 450, closedUntil: now + 1000, pieces: [] });
  const letters = [];
  const r = pardon(s.world, s.saves, s.world.players.get(P).n, (id, l) => letters.push(l), now);
  assert.equal(r.ok, true);
  assert.equal(r.refunded, 450);
  assert.equal(s.world.crimeOf(P).detainedUntil, 0);
  assert.equal(s.world.pendingMail(P).length, 0, 'the unread letter was withdrawn');
  assert.equal(s.saves.read(P).state.coins, 9000 + 450);
  assert.equal(letters[0].kind, 'refund');
  c.ws.close();
  await s.close();
});

await test('a police visit that finds stolen goods while shutting the club is an arrest: prison, chores, and the scene in the letter', async () => {
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const P = 'player-arrest-0001';
  const c = client(s.port, P, 'Escondido');
  await c.ready;
  const NOW = Date.UTC(2026, 10, 28, 15, 0, 0);
  let g = { ...newClub(), xp: 600000, coins: 100000, phase: 4 };
  g = placeItem(g, 'gold_statue', 2, 2, 0, 'free').state;
  const uid = g.items.find((i) => i.id === 'gold_statue').uid;
  g = { ...g, open: true, items: g.items.map((i) => (i.uid === uid ? { ...i, hot: NOW + 72 * 3600_000 } : i)) };
  await fetch(`${base}/save?pid=${P}`, { method: 'POST', body: JSON.stringify(g) });
  const letters = [];
  const deliver = (id, l) => { letters.push(l); s.deliver(id, l); };
  patrolTick(s.world, s.saves, deliver, NOW); // starts the clock
  s.world.setCrime(P, { ...s.world.crimeOf(P), heat: 70, heatAt: NOW, patrolAt: 0 }); // "closure" level with a hot piece on show
  const v = patrolTick(s.world, s.saves, deliver, NOW + 60_000);
  assert.equal(v.length, 1);
  const crime = s.world.crimeOf(P);
  assert.ok(v[0].closedUntil > 0 && v[0].seized === 1);
  assert.equal(crime.detainedUntil, crime.closedUntil, 'the owner is in prison for as long as the club is shut');
  assert.ok(crime.choreGoal > 0 && crime.chores === 0, 'with chores to do to get out');
  assert.equal(letters[0].story, 'raid');
  assert.equal(letters[0].chores, crime.choreGoal);
  c.ws.close();
  await s.close();
});

await test('the database: the old JSON files move in once, nothing is lost, and the copy is exact', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-import-'));
  const savesDir = path.join(dir, 'saves');
  fs.mkdirSync(savesDir);
  const game = sanitizeClub({ ...newClub(), xp: 7000, coins: 4242, phase: 2 });
  const rec = { at: 1_700_000_000_000, meta: { level: 5, phase: 2, coins: 4242, xp: 7000 }, state: game };
  fs.writeFileSync(path.join(savesDir, 'player-old-00001.json'), JSON.stringify(rec));
  fs.writeFileSync(path.join(savesDir, 'player-old-00001.bak.1699999999999.json'), JSON.stringify({ ...rec, at: 1_699_999_999_999 }));
  const worldFile = path.join(dir, 'world.json');
  fs.writeFileSync(worldFile, JSON.stringify({ nextLot: 1, players: { 'player-old-00001': { n: 0, club: { name: 'Viejo' }, lastSeen: 1 } } }));
  const { openDb, importLegacy, worldStore } = await import('./db.mjs');
  const { SaveStore } = await import('./saves.mjs');
  const db = openDb(path.join(dir, 'nightclub.db'));
  const first = importLegacy(db, { worldFile, savesDir });
  assert.deepEqual(first, { world: true, saves: 1, backups: 1 });
  assert.deepEqual(importLegacy(db, { worldFile, savesDir }), { world: false, saves: 0, backups: 0 }, 'a second run imports nothing');
  const store = new SaveStore(db);
  assert.equal(store.read('player-old-00001').state.coins, 4242);
  assert.equal(store.read('player-old-00001').meta.xp, 7000);
  assert.equal(store.backups('player-old-00001')[0].at, 1_699_999_999_999);
  assert.equal(worldStore(db).load().players['player-old-00001'].club.name, 'Viejo');
  assert.ok(fs.existsSync(path.join(savesDir, 'player-old-00001.json')), 'the files stay as a backup');
  // a file copy of the live database is a complete database
  const { backupDb } = await import('./db.mjs');
  const copy = path.join(dir, 'copy', 'n.db');
  backupDb(db, copy);
  assert.equal(new SaveStore(openDb(copy)).read('player-old-00001').state.coins, 4242);
  db.close();
});

await test('accounts: a passkey protects a club, other devices join with a code, and a recovery code is the way back', async () => {
  const crypto = await import('node:crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-auth-'));
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, savesDir: dir, saveEveryMs: 0, authOrigins: ['http://localhost:5173'] });
  const base = `http://127.0.0.1:${s.port}`;
  const ORIGIN = 'http://localhost:5173';
  const P = 'player-account-01';
  const c = client(s.port, P, 'Cuentas');
  await c.ready;
  await c.waitCity();
  const call = async (step, body = {}, token, origin = ORIGIN) => {
    const r = await fetch(`${base}/auth/${step}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(token ? { 'x-nc-token': token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  };

  // --- a tiny software authenticator (ES256, no attestation), like the one in a phone ---
  const b64 = (b) => Buffer.from(b).toString('base64url');
  const cbor = (v) => {
    const head = (major, n) => (n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]));
    if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
    if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
    if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
    const entries = v instanceof Map ? [...v] : Object.entries(v);
    return Buffer.concat([head(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = crypto.randomBytes(32);
  const rpHash = crypto.createHash('sha256').update('localhost').digest();
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  const counter = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const client_data = (type, challenge) => Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));

  // 1. a guest club claims itself with a passkey
  const ro = await call('register/options', { pid: P });
  assert.equal(ro.status, 200);
  const authData = Buffer.concat([rpHash, Buffer.from([0x45]), counter(0), Buffer.alloc(16), Buffer.from([credId.length >> 8, credId.length & 255]), credId, cose]);
  const cd = client_data('webauthn.create', ro.options.challenge);
  const rv = await call('register/verify', { cid: ro.cid, label: 'Mi telefono', response: { id: b64(credId), rawId: b64(credId), type: 'public-key', response: { clientDataJSON: b64(cd), attestationObject: b64(cbor({ fmt: 'none', attStmt: {}, authData })), transports: ['internal'] }, clientExtensionResults: {} } });
  assert.equal(rv.status, 200, rv.error);
  assert.equal(rv.pid, P);
  assert.match(rv.recovery, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
  assert.equal(rv.passkeys.length, 1);
  assert.equal((await call('register/verify', { cid: ro.cid, response: {} })).status, 400, 'a challenge works once');
  assert.equal((await call('register/options', { pid: P }, undefined, 'http://evil.example')).status, 400, 'only our own site can ask for passkeys');
  // on a computer the passkey is asked for on the player's phone (the browser shows its QR)
  assert.deepEqual((await call('register/options', { pid: P, via: 'phone' }, rv.token)).options.hints, ['hybrid']);
  assert.deepEqual((await call('login/options', { via: 'phone' })).options.hints, ['hybrid']);
  assert.equal((await call('login/options', {})).options.hints, undefined, 'no preference unless asked');
  c.ws.close();

  // 2. now knowing the id is not enough
  const stranger = client(s.port, P, 'Intruso');
  await stranger.ready;
  await sleep(300);
  assert.equal(stranger.closed, 4003, 'the club asks for a login');
  const post = (token) => fetch(`${base}/save?pid=${P}`, { method: 'POST', headers: token ? { 'x-nc-token': token } : {}, body: JSON.stringify(newClub()) });
  assert.equal((await post()).status, 401);
  assert.equal((await post('x'.repeat(43))).status, 401, 'a made-up token is no good');
  assert.equal((await fetch(`${base}/save?pid=${P}`)).status, 401, 'reading is protected too');
  assert.equal((await post(rv.token)).status, 200, 'with the session it works');
  const welcome = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const got = [];
  welcome.on('message', (d) => got.push(JSON.parse(d.toString()).t));
  await new Promise((r) => welcome.on('open', r));
  welcome.send(JSON.stringify({ t: 'hello', id: P, name: 'Cuentas', token: rv.token }));
  await sleep(400);
  assert.ok(got.includes('city'), 'the owner gets in with the token');
  welcome.close();

  // 3. another device: sign in with the passkey (no id needed)
  const lo = await call('login/options');
  const sign = (n) => {
    const ad = Buffer.concat([rpHash, Buffer.from([0x05]), counter(n)]);
    const cdj = client_data('webauthn.get', lo.options.challenge);
    const sig = crypto.sign('sha256', Buffer.concat([ad, crypto.createHash('sha256').update(cdj).digest()]), { key: privateKey, dsaEncoding: 'der' });
    return { id: b64(credId), rawId: b64(credId), type: 'public-key', response: { clientDataJSON: b64(cdj), authenticatorData: b64(ad), signature: b64(sig), userHandle: b64(P) }, clientExtensionResults: {} };
  };
  const lv = await call('login/verify', { cid: lo.cid, response: sign(1) });
  assert.equal(lv.status, 200, lv.error);
  assert.equal(lv.pid, P);
  assert.notEqual(lv.token, rv.token, 'each device has its own session');
  const replay = await call('login/options');
  assert.equal((await call('login/verify', { cid: replay.cid, response: sign(2) })).status, 401, 'a signature for another challenge is refused');

  // 4. a code to link a phone, once, and not for strangers
  assert.equal((await call('link/create')).status, 401);
  const lk = await call('link/create', {}, lv.token);
  assert.match(lk.code, /^\d{8}$/);
  const joined = await call('link/redeem', { code: lk.code });
  assert.equal(joined.pid, P);
  assert.equal((await call('link/redeem', { code: lk.code })).status, 401, 'a code works once');
  assert.equal((await call('link/redeem', { code: '00000000' })).status, 401);
  const me = await call('me', {}, joined.token);
  assert.equal(me.pid, P);
  assert.equal(me.passkeys.length, 1);

  // 5. every device lost: the recovery code
  assert.equal((await call('recover', { code: 'AAAAA-AAAAA-AAAAA-AAAAA' })).status, 401);
  const back = await call('recover', { code: rv.recovery.toLowerCase().replaceAll('-', ' ') });
  assert.equal(back.pid, P, 'case and separators do not matter');
  const fresh = await call('recovery/new', {}, back.token);
  assert.equal((await call('recover', { code: rv.recovery })).status, 401, 'a new recovery code replaces the old one');
  assert.equal((await call('recover', { code: fresh.recovery })).pid, P);
  assert.equal((await call('passkey/remove', { id: b64(credId) }, back.token)).status, 400, 'the last passkey cannot be removed');

  // 5b. a device with no passkey protects its club with a recovery code only; a second try on a club with an account is refused
  const Q = 'player-codeonly-01';
  const cq = client(s.port, Q, 'SinPasskey');
  await cq.ready;
  await cq.waitCity();
  const rc = await call('register/code', { pid: Q });
  assert.equal(rc.status, 200, rc.error);
  assert.match(rc.recovery, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
  assert.equal(rc.passkeys.length, 0);
  assert.equal((await call('register/code', { pid: Q })).status, 409, 'only once');
  assert.equal((await call('register/code', { pid: 'player-nobody-777' })).status, 403);
  const lk2 = await call('link/create', {}, rc.token);
  assert.equal((await call('link/redeem', { code: lk2.code })).pid, Q, 'and it can link a phone with a code (or the QR)');
  cq.ws.close();

  // 6. logging out ends that session only
  await call('logout', {}, joined.token);
  assert.equal((await call('me', {}, joined.token)).status, 401);
  assert.equal((await call('me', {}, back.token)).pid, P);
  stranger.ws.close();
  await s.close();
});

await test('the bank on the server: the books are the server\'s, installments run only while it is up, a prisoner\'s clock waits, closure follows the debt', async () => {
  const s = await createServer({ port: 0, dataFile: null, audioDir: null, saveEveryMs: 0 });
  const base = `http://127.0.0.1:${s.port}`;
  const P = 'player-bank-00001';
  const c = client(s.port, P, 'Deudor');
  await c.ready;
  const { lend, payback, bankTick } = await import('./bank.mjs');
  const NOW = Date.UTC(2026, 10, 30, 12, 0, 0);
  const g = { ...newClub(), xp: 3_500_000, coins: 5000, phase: 3, open: true };
  await fetch(`${base}/save?pid=${P}`, { method: 'POST', body: JSON.stringify(g) });
  const letters = [];
  const deliver = (id, l) => { letters.push(l); s.deliver(id, l); };

  assert.match(lend(s.world, s.saves, P, 100, deliver, NOW).error, /mínimo/);
  const got = lend(s.world, s.saves, P, 30_000, deliver, NOW);
  assert.equal(got.ok, true);
  assert.equal(s.saves.read(P).state.coins, 5000 + 30_000);
  assert.equal(letters[0].kind, 'bank');
  assert.equal(letters[0].bank.event, 'granted');
  assert.equal(letters[0].bank.delta, 30_000);
  assert.match(lend(s.world, s.saves, P, 5000, deliver, NOW).error, /Ya tienes/);

  // the game cannot erase the debt by uploading a copy without it
  const cheat = applyMail(g, letters); // what an honest game looks like after the letter...
  await fetch(`${base}/save?pid=${P}`, { method: 'POST', body: JSON.stringify({ ...cheat, loan: null }) });
  assert.ok(s.saves.read(P).state.loan, 'the loan is still there');
  assert.equal(s.saves.read(P).state.loan.owed, got.loan.owed);

  // 59 minutes: nothing; the 60th collects the first installment
  for (let i = 0; i < 59; i++) bankTick(s.world, s.saves, deliver, NOW + i * 60_000);
  assert.equal(letters.length, 1, 'nothing happens inside the hour');
  bankTick(s.world, s.saves, deliver, NOW + 59 * 60_000);
  assert.equal(letters.length, 2);
  assert.equal(letters[1].bank.event, 'payment');
  assert.equal(s.saves.read(P).state.loan.owed, got.loan.owed - got.loan.installment);

  // in prison the clock waits
  s.world.setCrime(P, { ...s.world.crimeOf(P), detainedUntil: NOW + 99 * 3_600_000 });
  const cycle = s.saves.read(P).state.loan.cycle;
  for (let i = 0; i < 5; i++) bankTick(s.world, s.saves, deliver, NOW + (60 + i) * 60_000);
  assert.equal(s.saves.read(P).state.loan.cycle, cycle, 'the clock did not move');
  s.world.setCrime(P, { ...s.world.crimeOf(P), detainedUntil: 0 });

  // broke: the bank shuts the club after ten late hours, and the city's record follows; paying what is due opens it again
  s.saves.update(P, (st) => ({ ...st, coins: 0 }), NOW);
  let t = NOW + 200 * 60_000;
  for (let i = 0; i < 12 * 60; i++) bankTick(s.world, s.saves, deliver, (t += 60_000));
  const sv = s.saves.read(P).state;
  assert.ok(sv.loan.closed, 'closed by the bank');
  assert.ok(s.world.crimeOf(P).closedUntil > t + 100 * 86_400_000, 'the city keeps the club shut');
  assert.ok(letters.some((l) => l.bank?.event === 'closure'));
  s.saves.update(P, (st) => ({ ...st, coins: sv.loan.due + 5 }), t);
  const reopened = payback(s.world, s.saves, P, sv.loan.due, deliver, t);
  assert.equal(reopened.ok, true);
  assert.equal(s.world.crimeOf(P).closedUntil, 0, 'the closure is lifted');
  assert.match(payback(s.world, s.saves, 'player-nobody-0001', 'all', deliver, t).error, /partida/);
  c.ws.close();
  await s.close();
});

console.log(`\n${passed} tests passed`);
process.exit(0);
