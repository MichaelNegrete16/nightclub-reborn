// Draws the club and its city at different hours and weather, to review the look. Usage: npm run build && node scripts/city-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/queue'));
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
  for (const [id, x, y] of [['dj_booth', 4, 0], ['bar_straight', 1, 0], ['sofa_red_2', 6, 3], ['trophy_cup', 0, 3], ['plant', 7, 6], ['stool', 1, 1], ['stool', 2, 1]]) c.tryPlace(id, x, y, 0);
  for (let x = 2; x <= 5; x++) for (let y = 3; y <= 5; y++) c.tryPlace('floor_cyan', x, y, 0);
  c.setOpen(true);
  c.simulate(90);
});

await page.evaluate(() => { const c = window.__nc.club; c.simulate(1); });
// run the real clock until a line forms and a VIP shows up
await page.evaluate(() => { const c = window.__nc.club; for (let i = 0; i < 400 && !c.sim.waitingVip; i++) c.sim.update(0.5); window.__nc.club.sim.guests.forEach((g) => (g.stay = 9999)); });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => { const c = window.__nc.club; return { inside: c.guestCount, cap: c.roomCapacity, queue: c.queueCount, vip: c.sim.waitingVip?.vip?.name ?? null }; });
console.log(JSON.stringify(info));
await page.screenshot({ path: path.join(outDir, '1_queue_vip.png') });
await page.click('.vip-check');
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '2_vip_checked.png') });
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
