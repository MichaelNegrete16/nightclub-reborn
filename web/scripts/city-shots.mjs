// Draws the club and its city at different hours and weather, to review the look. Usage: npm run build && node scripts/city-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/city'));
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
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
  for (const [id, x, y] of [['dj_booth', 5, 0], ['bar_straight', 1, 0], ['sofa_red_2', 6, 3], ['trophy_cup', 0, 3], ['plant', 7, 6], ['stool', 1, 1], ['stool', 2, 1]]) c.tryPlace(id, x, y, 0);
  for (let x = 2; x <= 5; x++) for (let y = 3; y <= 5; y++) c.tryPlace('floor_cyan', x, y, 0);
  c.setOpen(true);
  c.simulate(90);
});
const set = async (time, weather) => {
  await page.evaluate(([t, w]) => window.__nc.club.env.apply({ time: t, weather: w }), [time, weather]);
  await page.waitForTimeout(3500);
};
const snap = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
await set(13, 'clear'); await snap('1_day_clear');
await set(18.7, 'clear'); await snap('2_dusk');
await set(23, 'clear'); await snap('3_night');
await set(14, 'rain'); await snap('4_day_rain');
await set(14, 'cloudy'); await snap('5_day_cloudy');
await set(8, 'fog'); await snap('6_morning_fog');
await set(13, 'clear');
await page.evaluate(() => {
  const c = window.__nc.club;
  const off = c.camera.position.clone().sub(c.controls.target).multiplyScalar(1.4);
  c.camera.position.copy(c.controls.target).add(off);
  c.controls.update();
});
await page.waitForTimeout(800); await snap('7_zoom_out');
await page.evaluate(() => { window.__nc.club.resetView(); window.__nc.club.rotateView(1); window.__nc.club.rotateView(1); });
await page.waitForTimeout(1800); await snap('8_rotated_view');
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
