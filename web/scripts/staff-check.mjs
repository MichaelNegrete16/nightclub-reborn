// Draws the club and its city at different hours and weather, to review the look. Usage: npm run build && node scripts/city-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/staff'));
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 910 } });
const saved = { story: { intro: true, name: 'Camila', seen: ['intro', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7'], done: [], tutorial: -1 }, coins: 9000, open: true, inventory: { dj_booth: 1 }, items: [] };
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


await page.addStyleTag({ content: '.vip-card{display:none!important}' });
await page.evaluate(() => { const c = window.__nc.club; c.setState({ ...c.state, coins: 99999, xp: 30000 }); for (const r of ['dj', 'bartender', 'bartender', 'guard']) c.hireStaff(r); });
await page.waitForTimeout(1500);
const pos = await page.evaluate(() => { const c = window.__nc.club; const p = c.state.phase; return { staff: c.staffActors.map((a) => [+a.actor.x.toFixed(2), +a.actor.z.toFixed(2), +a.actor.size]), items: c.state.items.filter((i) => ['bar_straight', 'dj_booth'].includes(i.id)).map((i) => [i.id, i.x, i.y]), phase: p }; });
console.log(JSON.stringify(pos));
await page.evaluate(() => { const c = window.__nc.club; c.controls.target.set(4, 0, 2); c.camera.position.set(4 + 7, 8, 2 + 9); c.controls.update(); });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(outDir, '1_staff_at_wall.png') });
// music reach: inside, near the wall outside, far away
const reach = await page.evaluate(() => { const c = window.__nc.club; const out = [];
  out.push(['inside', +c.musicReach().toFixed(2)]);
  c.goOutsideNow();
  for (const [x, z] of [[4, 8.8], [4, 14], [4, 20], [4, 30]]) { c.player.teleport(x, z); out.push([`outside ${z}`, +c.musicReach().toFixed(2)]); }
  return out; });
console.log(JSON.stringify(reach));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
