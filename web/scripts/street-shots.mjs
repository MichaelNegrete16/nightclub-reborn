// Draws the club and its city at different hours and weather, to review the look. Usage: npm run build && node scripts/city-shots.mjs [outDir]
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews/street'));
await mkdir(outDir, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
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
const snap = async (name, ms = 1800) => { await page.waitForTimeout(ms); await page.screenshot({ path: path.join(outDir, name) }); };
const club = (fn, arg) => page.evaluate(fn, arg);
await club(() => { const c = window.__nc.club; c.setState({ ...c.state, coins: 50000, xp: 30000 }); });
await club(() => { const c = window.__nc.club; c.sim.guests.forEach((g) => (g.stay = 9999)); for (let i = 0; i < 60; i++) c.sim.update(0.5); c.goOutsideNow(); });
await snap('1_outside_plain.png', 3000);
// click-walk: click on the street to the left of the door
const where = await club(() => { const c = window.__nc.club; return { x: c.player.x, z: c.player.z, mode: c.mode }; });
console.log('start', JSON.stringify(where));
const pt = await club(() => { const c = window.__nc.club; const v = c.cellToScreen(-3, 14); return v; });
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(3500);
console.log('after click', JSON.stringify(await club(() => { const c = window.__nc.club; return { x: +c.player.x.toFixed(1), z: +c.player.z.toFixed(1), moving: c.player.moving }; })));
await snap('2_walked_left.png', 500);
// hire the crew and place the office: the guards stand at the door, DJ and bartender inside
await club(() => { const c = window.__nc.club; c.setState({ ...c.state, coins: 99999 }); for (const [id, x, y] of []) c.tryPlace(id, x, y, 0, 'buy'); for (const r of ['guard', 'guard', 'dj', 'bartender']) c.hireStaff(r); });
console.log('staff', JSON.stringify(await club(() => window.__nc.club.state.staff)));
// buy facade upgrades
for (const id of ['paint_red', 'awning', 'rope', 'sign_neon', 'lights']) console.log(id, await club((i) => window.__nc.club.buyExterior(i) ?? 'ok', id));
await club(() => window.__nc.club.player.teleport(window.__nc.club.player.x, window.__nc.club.player.z));
await snap('3_outside_upgraded.png', 2500);
// click the building: walk to the door and go in
const bpt = await club(() => window.__nc.club.cellToScreen(3, 4));
await page.mouse.click(bpt.x, bpt.y);
await page.waitForFunction(() => window.__nc.club.mode === 'inside', null, { timeout: 15000 });
console.log('entered; mode inside');
await snap('4_inside_after_enter.png', 1500);
// click an empty floor cell inside: the character walks there
const fpt = await club(() => window.__nc.club.cellToScreen(5, 5));
await page.mouse.click(fpt.x, fpt.y);
await page.waitForTimeout(3000);
console.log('inside walk', JSON.stringify(await club(() => { const c = window.__nc.club; return { x: +c.player.x.toFixed(1), z: +c.player.z.toFixed(1) }; })));
await snap('5_inside_walked.png', 300);
await page.click('.bb[data-id="office"]');
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '6_office.png') });
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
