// Multiplayer check: a real server, two browsers (two players) and a crowd of bots. Usage: npm run build && node scripts/net-e2e.mjs [outDir]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import WebSocket from '../../server/node_modules/ws/wrapper.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/net'));
await mkdir(outDir, { recursive: true });
const PORT = 8800 + Math.floor(Math.random() * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['--experimental-strip-types', 'index.mjs'], {
  cwd: path.resolve(here, '../../server'), env: { ...process.env, PORT: String(PORT), DATA_FILE: '', MAX_PER_IP: '1000' }, stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => server.stdout.on('data', (d) => d.toString().includes('listening') && r()));
console.log('server up on', PORT);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function player(name, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 850 } });
  const saved = { story: { intro: true, name, seen: ['intro', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7'], done: [], tutorial: -1 }, coins: 9000, open: true, items: [], inventory: { dj_booth: 1 }, ...extra };
  await ctx.addInitScript((v) => localStorage.setItem('nc.club.v1', JSON.stringify(v)), saved);
  await ctx.route('http://nc.test/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    try { await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) }); }
    catch { await route.fulfill({ status: 404, body: 'not found' }); }
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|ERR_/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://nc.test/?server=ws://127.0.0.1:${PORT}&e2e`);
  await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
  await page.addStyleTag({ content: '.vip-card{display:none!important}' });
  return page;
}
const clubs = (page) => page.evaluate(() => window.__nc.club.neighbors.filter((n) => n.kind === 'club').map((n) => [n.name, n.cell.i, n.cell.j, n.open, n.online]));

// two players: the second one moves in next door
const ana = await player('Ana');
await ana.waitForFunction(() => window.__nc.club.net.status === 'online', null, { timeout: 15000 });
console.log('Ana online; neighbours at first:', JSON.stringify(await clubs(ana)));
const beto = await player('Beto');
await beto.waitForFunction(() => window.__nc.club.neighbors.some((n) => n.kind === 'club'), null, { timeout: 15000 });
await ana.waitForFunction(() => window.__nc.club.neighbors.some((n) => n.kind === 'club'), null, { timeout: 15000 });
const a = await clubs(ana);
const b = await clubs(beto);
console.log('Ana sees', JSON.stringify(a));
console.log('Beto sees', JSON.stringify(b));
assert.deepEqual(a.map((c) => [c[0], c[1], c[2]]), [['CLUB BETO', 1, 0]], 'Ana sees Beto one lot to the east');
assert.deepEqual(b.map((c) => [c[0], c[1], c[2]]), [['CLUB ANA', -1, 0]], 'Beto sees Ana one lot to the west');
assert.equal(await ana.evaluate(() => window.__nc.club.net.online), 2);
console.log('two players see each other, 2 online');

// Beto furnishes and opens his club (a club needs a DJ booth and a dance floor to open): the lamp turns green for Ana,
// then he closes it and it turns red
await beto.evaluate(() => { const c = window.__nc.club; c.tryPlace('dj_booth', 4, 0, 0, 'inventory'); for (let x = 2; x < 6; x++) c.tryPlace('floor_cyan', x, 3, 0); return c.setOpen(true); });
await ana.waitForFunction(() => window.__nc.club.neighbors.find((n) => n.kind === 'club')?.open === true, null, { timeout: 15000 });
console.log("Beto opened his club: Ana sees the lamp turn green");
await beto.evaluate(() => window.__nc.club.setOpen(false));
await ana.waitForFunction(() => window.__nc.club.neighbors.find((n) => n.kind === 'club')?.open === false, null, { timeout: 15000 });
console.log("Beto's club closed: Ana sees the lamp turn red");

// progress shows: Beto repaints his facade and grows; Ana sees his new colour and a bigger building
await beto.evaluate(() => { const c = window.__nc.club; c.setState({ ...c.state, coins: 99999, xp: 400000 }); return c.buyExterior('paint_red'); });
await ana.waitForFunction(() => { const n = window.__nc.club.neighbors.find((x) => x.kind === 'club'); return n?.ext?.paint === 'paint_red' && n.phase >= 3; }, null, { timeout: 15000 });
const grown = await ana.evaluate(() => { const n = window.__nc.club.neighbors.find((x) => x.kind === 'club'); return [n.ext.paint, n.phase, n.level]; });
console.log("Beto's progress is visible to Ana:", JSON.stringify(grown));

// the sky is the city's: Ana has chosen night and fog on her own, but online she sees what everyone sees
await ana.evaluate(() => window.__nc.club.env.apply({ time: 3, weather: 'fog' }));
await sleep(1500);
const sky = async (p) => p.evaluate(() => { const d = window.__nc.club.env.describe(); return [Math.round(d.hour * 10) / 10, d.weather]; });
const [sa, sb] = [await sky(ana), await sky(beto)];
console.log('sky for Ana', JSON.stringify(sa), 'and for Beto', JSON.stringify(sb));
assert.deepEqual(sa, sb, 'the same hour and weather for everybody');

// Beto steps out into the street: Ana sees him walking
await beto.evaluate(() => { const c = window.__nc.club; c.goOutsideNow(); });
await ana.waitForFunction(() => window.__nc.club.remote.count === 1, null, { timeout: 15000 });
const where = () => ana.evaluate(() => { const a = [...window.__nc.club.remote.actors.values()][0].actor; return [Math.round(a.x * 10) / 10, Math.round(a.z * 10) / 10, a.ready]; });
const w0 = await where();
await beto.evaluate(() => { const c = window.__nc.club; c.player.path = [[c.player.x + 8, c.player.z + 6]]; });
let w1 = await where();
for (let t = 0; t < 20000 && Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) <= 3; t += 500) { await sleep(500); w1 = await where(); } // the test browser renders slowly
console.log("Ana sees Beto's character walking:", JSON.stringify(w0), '->', JSON.stringify(w1));
assert.ok(Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) > 3, 'his character moved on her screen');
assert.ok(w1[2], 'with his look loaded');

// the visit screenshots want a clear afternoon: pick the city's clock for one (same formula as the game's autoWeather)
const clearAt = () => {
  const weather = (ms) => { const block = Math.floor(ms / (3 * 3600 * 1000)); let x = (block * 2654435761) >>> 0; x = (x ^ (x >>> 15)) >>> 0; return ((x % 1000) / 1000) < 0.55 ? 'clear' : 'other'; };
  const now = Date.now();
  for (let k = 0; k < 400; k++) {
    const t = now + k * 15 * 60 * 1000;
    const hour = (new Date(t).getUTCHours() - 5 + 24) % 24;
    if (weather(t) === 'clear' && hour >= 12 && hour <= 15) return t - now;
  }
  return 0;
};
const offset = clearAt();
// Beto plays a song of the game in his club; Ana, out in the street, hears it more the closer she gets, silence far away
await beto.evaluate(() => { const c = window.__nc.club; c.setOpen(true); c.music.unlock(); c.playTrack('b_salsa'); });
await ana.evaluate(() => window.__nc.club.music.unlock());
await ana.waitForFunction(() => { const n = window.__nc.club.neighbors.find((x) => x.kind === 'club'); return n?.open && n?.music?.playing && n.music.genre === 'salsa'; }, null, { timeout: 15000 });
const hear = async (x, z) => { await ana.evaluate(([x, z]) => { const c = window.__nc.club; c.goOutsideNow(); c.player.teleport(x, z); }, [x, z]); await sleep(900); return ana.evaluate(() => { const g = window.__nc.club.music.nGain; return +(g?.gain.value ?? -1).toFixed(3); }); };
const near = await hear(40, 8);
const far = await hear(-30, 8);
console.log('Beto plays salsa: Ana hears it at', near, 'near his club and', far, 'far away');
assert.ok(near > far && far < 0.02, 'closer is louder; far away it is silent');
// Beto goes back inside his club: his tag changes, and Ana sees him there when she visits
await beto.evaluate(() => window.__nc.club.goInsideNow());
await ana.waitForFunction(() => [...window.__nc.club.remote.actors.values()].some((a) => a.inside), null, { timeout: 15000 });
console.log("Beto is inside his club: Ana's city marks it ('en su club')");
// Ana visits Beto's club
await ana.evaluate((o) => { window.__nc.club.env.cityOffsetMs = o; }, offset);
await ana.evaluate(() => { const c = window.__nc.club; const n = c.neighbors.find((x) => x.kind === 'club'); c.requestVisit(n.n); });
await ana.waitForFunction(() => window.__nc.club.visiting !== null, null, { timeout: 10000 });
await sleep(1500);
await ana.screenshot({ path: path.join(outDir, '0_visiting_betos_club.png') });
console.log('Ana is visiting', await ana.evaluate(() => window.__nc.club.visiting.name));
await ana.waitForFunction(() => { const a = [...window.__nc.club.remote.actors.values()][0]; return a && a.actor.group.visible; }, null, { timeout: 10000 });
console.log('and she sees Beto inside his club');
await ana.evaluate(() => window.__nc.club.leaveVisit());
assert.equal(await ana.evaluate(() => window.__nc.club.visiting), null);

// a crowd of bots moves in around them
const bots = [];
for (let i = 0; i < 40; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  ws.on('open', () => {
    ws.send(JSON.stringify({ t: 'hello', id: `bot-${String(i).padStart(4, '0')}-e2etest`, name: ['Eclipse', 'Voltaje', 'Magenta', 'Nebula', 'Pulso', 'Luna', 'Turbo', 'Azul'][i % 8] }));
    setTimeout(() => ws.send(JSON.stringify({ t: 'club', club: { name: ['Eclipse', 'Voltaje', 'Magenta', 'Nebula', 'Pulso', 'Luna', 'Turbo', 'Azul'][i % 8], phase: 1 + (i % 5), level: 5 + i, rating: 40 + (i % 50), open: i % 3 !== 0, guests: i % 30 } })), 1200 + i * 30);
  });
  ws.on('error', () => {});
  bots.push(ws);
}
await ana.waitForFunction(() => window.__nc.club.neighbors.filter((n) => n.kind === 'club').length >= 20, null, { timeout: 20000 });
await ana.waitForFunction(() => window.__nc.club.ambient.count > 0, null, { timeout: 30000 });
console.log(`life outside the open clubs: ${await ana.evaluate(() => window.__nc.club.ambient.count)} people in lines`);
const count = (await clubs(ana)).length;
console.log(`Ana now sees ${count} clubs around her; online ${await ana.evaluate(() => window.__nc.club.net.online)}`);
assert.ok(count >= 20);
await ana.evaluate(() => { const c = window.__nc.club; c.env.apply({ time: 15, weather: 'clear' }); c.resetView(); c.goOutsideNow(); const d = c.camera.position.clone().sub(c.controls.target).setLength(c.baseDist * 1.25); c.controls.target.set(20, 0, 20); c.camera.position.copy(c.controls.target).add(d); });
await sleep(3500);
await ana.evaluate(() => document.querySelector('.minimap')?.classList.add('big'));
await ana.screenshot({ path: path.join(outDir, '1_city_with_players.png') });

// the server goes down: the game keeps working and reconnects
server.kill('SIGTERM');
await ana.waitForFunction(() => window.__nc.club.net.status !== 'online', null, { timeout: 10000 });
console.log('server stopped: Ana falls back to single-player (status', await ana.evaluate(() => window.__nc.club.net.status) + ') and the game still runs');
assert.ok(await ana.evaluate(() => window.__nc.club.guestCount >= 0));
await ana.screenshot({ path: path.join(outDir, '2_server_down.png') });
bots.forEach((w) => w.terminate());
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
