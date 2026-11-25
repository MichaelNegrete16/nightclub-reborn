// Draws the club and its city at different hours and weather, to review the look. Usage: npm run build && node scripts/city-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/music'));
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 910 } });
const saved = { story: { intro: true, name: 'Camila', seen: ['intro'], done: [], tutorial: -1 }, coins: 9000, open: true, inventory: { dj_booth: 1 }, items: [] };
await ctx.addInitScript((v) => localStorage.setItem('nc.club.v1', JSON.stringify(v)), saved);
await ctx.route('http://nc.test/**', async (route) => {
  const u = new URL(route.request().url());
  const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
  try { await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) }); }
  catch { await route.fulfill({ status: 404, body: 'not found' }); }
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://nc.test/?server=off&e2e');
await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
await page.evaluate(() => {
  const c = window.__nc.club;
  for (const [id, x, y] of [['dj_booth', 4, 0], ['bar_straight', 1, 0], ['sofa_red_2', 6, 3], ['trophy_cup', 0, 3], ['plant', 7, 6], ['speaker', 0, 5], ['speaker', 7, 4], ['stool', 1, 1], ['stool', 2, 1]]) c.tryPlace(id, x, y, 0);
  for (let x = 2; x <= 5; x++) for (let y = 3; y <= 5; y++) c.tryPlace('floor_cyan', x, y, 0);
  c.setOpen(true);
  c.simulate(90);
});


await page.addStyleTag({ content: '.vip-card{display:none!important}' });
await page.mouse.click(960, 450); // the first click unlocks the sound
await page.waitForTimeout(500);
await page.evaluate(() => { const c = window.__nc.club; c.sim.guests.forEach((g) => (g.stay = 9999)); });
await page.waitForTimeout(3500);
const info = () => page.evaluate(() => { const c = window.__nc.club; return { track: c.music.track?.title ?? null, playing: c.state.music.playing, level: +c.music.level().toFixed(2), beats: +c.music.beats().toFixed(1), rating: c.rating, unlocked: c.music.unlocked }; });
console.log('with sound   ', JSON.stringify(await info()));
await page.screenshot({ path: path.join(outDir, '1_music_playing.png') });
await page.evaluate(() => { const c = window.__nc.club; for (let i = 0; i < 240; i++) c.sim.update(0.5); });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '2_crowd_reactions.png') });
console.log('after 2 min  ', JSON.stringify(await info()));
await page.click('.pill.song');
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '3_music_window.png') });
// add a YouTube link through the form
await page.fill('.mu-input[placeholder^="Pega"]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
await page.fill('.mu-input[placeholder^="Nombre"]', 'Prueba YouTube');
await page.click('.mu-primary');
await page.waitForTimeout(400);
console.log('playlist     ', await page.evaluate(() => JSON.stringify(window.__nc.club.state.music.tracks.map((t) => [t.title, t.source, t.ref]))));
await page.keyboard.press('Escape');
await page.evaluate(() => window.__nc.club.togglePlay());
await page.waitForTimeout(800);
console.log('paused       ', JSON.stringify(await info()));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
