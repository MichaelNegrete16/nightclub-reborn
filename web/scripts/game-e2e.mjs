// Plays the game like a player would, in a headless Chrome: title -> name -> character -> story -> shop -> inventory ->
// placing -> mission rewards -> level-up -> chapter scene. Real clicks on real buttons.
// Usage: npm run build && node scripts/game-e2e.mjs <outDir>
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../art/previews'));
await mkdir(outDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

async function open(viewport, saved) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (saved) await ctx.addInitScript((v) => localStorage.setItem('nc.club.v1', JSON.stringify(v)), saved);
  await ctx.route('http://nc.test/**', async (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    try {
      await route.fulfill({ status: 200, contentType: MIME[path.extname(p)] ?? 'application/octet-stream', body: await readFile(path.join(dist, p)) });
    } catch {
      await route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('http://nc.test/?server=off&e2e');
  await page.waitForFunction(() => window.__nc?.ready, null, { timeout: 90000 });
  return page;
}

const S = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__nc.club.state)));
const aim = async (page, x, y, w = 1, d = 1) => {
  const pt = await page.evaluate(([x, y, w, d]) => window.__nc.club.cellToScreen(x + (w - 1) / 2, y + (d - 1) / 2), [x, y, w, d]);
  await page.mouse.move(pt.x, pt.y);
  return pt;
};
// the camera glides in when you start placing: wait for it to settle so the cell under the pointer is the one we aim at
const settle = (page) => page.waitForFunction(() => window.__nc.club.zoomGoal === null, null, { timeout: 8000 });
const click = async (page, x, y, w, d) => {
  await settle(page);
  const pt = await aim(page, x, y, w, d);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(120);
};

async function runDialogue(page, { choose, snap = [], prefix = 'comic_' } = {}) {
  const taken = new Set();
  for (let i = 0; i < 600; i++) {
    // read the scene state without waiting: the element can vanish between two calls
    const st = await page.evaluate(() => {
      const d = document.querySelector('.dialogue');
      return d ? { line: d.dataset.line ?? null, typing: d.dataset.typing ?? null, choices: document.querySelectorAll('.dlg-choice').length } : null;
    });
    if (!st) return;
    if (st.line !== null && st.typing === 'false' && snap.includes(Number(st.line)) && !taken.has(st.line)) {
      taken.add(st.line);
      await page.waitForTimeout(350);
      await shot(page, `${prefix}${String(st.line).padStart(2, '0')}`);
    }
    if (st.choices > 0 && st.typing === 'false') await page.locator('.dlg-choice').nth(choose ?? 0).click();
    else await page.keyboard.press('Space');
    await page.waitForTimeout(st.typing === 'true' ? 30 : 120);
  }
}

const coachText = (page) => page.locator('.coach-text').innerText();
const waitCoach = (page, fragment) =>
  page.waitForFunction((f) => (document.querySelector('.coach-text')?.textContent ?? '').includes(f), fragment, { timeout: 12000 });

// ======================================================================== 1. a brand new game
let s;
const page = await open({ width: 1280, height: 800 });
await page.waitForSelector('.title-screen');
await shot(page, 'g_1_title');
console.log('title screen shown');

await page.locator('.name-input').fill('Camila');
await page.getByRole('button', { name: 'Comenzar' }).click();
await page.waitForFunction(() => document.body.classList.contains('mode-character'));
await page.getByRole('button', { name: 'Mujer' }).click();
await page.waitForTimeout(500);
await shot(page, 'g_2_character_creation');
console.log('character creator opened after the title');
await page.getByRole('button', { name: '¡Listo, a la pista!' }).click();
await page.waitForSelector('.dialogue.comic');
await page.waitForFunction(() => { const i = document.querySelector('.cm-panel.main .cm-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 20000 });
console.log('comic panel drawn: first picture loaded');
await runDialogue(page, { choose: 1, snap: [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13] });
await page.waitForSelector('.dialogue', { state: 'detached', timeout: 30000 });
s = await S(page);
assert.equal(s.story.intro, true, 'intro marked as seen');
assert.equal(s.story.name, 'Camila');
console.log('story intro played; name', s.story.name);
await page.evaluate(() => { window.__nc.club.showGuests = false; }); // exact coin checks below
await page.waitForTimeout(600);
await shot(page, 'g_4_hud_and_coach');
assert.match(await page.locator('.hud-player').innerText(), /Camila/);

// ======================================================================== 2. Rosa's guided first steps, with real clicks
await page.waitForSelector('.coach');
assert.match(await coachText(page), /Tienda/);
assert.equal((await S(page)).open, false, 'the club starts closed');
assert.equal(await page.evaluate(() => window.__nc.club.guestCount), 0, 'nobody is inside a closed club');
await page.waitForFunction(() => getComputedStyle(document.querySelector('.coach-ring')).display !== 'none');
{
  const ring = await page.locator('.coach-ring').boundingBox();
  const btn = await page.locator('.bb[data-id="shop"]').boundingBox();
  const cx = btn.x + btn.width / 2;
  const cy = btn.y + btn.height / 2;
  assert.ok(cx > ring.x && cx < ring.x + ring.width && cy > ring.y && cy < ring.y + ring.height, 'the ring is on the Shop button');
}
await shot(page, 'g_4b_coach_shop');
console.log('Rosa points at the Shop button');

await page.locator('.bb[data-id="shop"]').click();
await page.waitForSelector('.modal.shop');
await waitCoach(page, 'Baldosa cian');
await page.locator('.card[data-id="floor_cyan"]').click();
await shot(page, 'g_5_shop');
await waitCoach(page, 'Comprar');
for (let i = 0; i < 4; i++) await page.locator('button[data-action="buy"]').click();
s = await S(page);
assert.equal(s.inventory.floor_cyan, 4, 'bought 4 tiles into the inventory');
assert.equal(s.coins, 4000 - 200, 'paid 4 x 50');
console.log('bought 4 tiles; coins', s.coins);
await waitCoach(page, 'Cierra la tienda');
await page.keyboard.press('Escape');
await page.waitForSelector('.modal', { state: 'detached' });

await waitCoach(page, 'Inventario');
await page.locator('.bb[data-id="inventory"]').click();
await page.waitForSelector('.modal.inventory');
await waitCoach(page, 'Colocar');
await page.locator('.modal.inventory .card[data-id="floor_cyan"]').click();
await shot(page, 'g_6_inventory');
await page.locator('button[data-action="place"]').click();
await page.waitForSelector('.contextbar.placing');
await waitCoach(page, 'Toca el piso');
await shot(page, 'g_6b_coach_place');
for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) await click(page, x, y);
s = await S(page);
assert.equal(s.items.filter((i) => i.id === 'floor_cyan').length, 4, '4 tiles placed from the inventory');
assert.equal(s.inventory.floor_cyan, undefined, 'inventory used up');
assert.equal(await page.locator('.contextbar.placing').count(), 0, 'placing ends when the stock runs out');
await page.waitForSelector('.toast.mission-toast');
await shot(page, 'g_7_mission_complete');
assert.match(await page.locator('.toast.mission-toast').first().innerText(), /Enciende la pista/);
console.log('mission "Enciende la pista" completed');

// story beat, then the uncle's booth
await waitCoach(page, 'cabina de tu tío');
await page.getByRole('button', { name: 'Seguir' }).click();
await waitCoach(page, 'Inventario');
await page.locator('.bb[data-id="inventory"]').click();
await waitCoach(page, 'Cabina DJ');
await page.locator('.modal.inventory .card[data-id="dj_booth"]').click();
await page.locator('button[data-action="place"]').click();
await waitCoach(page, 'pared del fondo');
await click(page, 5, 0, 2, 1);
s = await S(page);
assert.ok(s.items.some((i) => i.id === 'dj_booth'), 'booth placed');
assert.ok(s.story.done.includes('booth'));
console.log('booth placed');

// the bar
await waitCoach(page, 'la barra');
await page.getByRole('button', { name: 'Seguir' }).click();
await waitCoach(page, 'Tienda');
await page.locator('.bb[data-id="shop"]').click();
await waitCoach(page, 'Barra recta');
await page.locator('.cat', { hasText: 'Barras' }).click();
await page.locator('.card[data-id="bar_straight"]').click();
await waitCoach(page, 'Comprar y colocar');
await page.locator('button[data-action="buy-place"]').click();
await waitCoach(page, 'contra la pared');
await click(page, 1, 0, 3, 1);
s = await S(page);
assert.ok(s.items.some((i) => i.id === 'bar_straight'), 'bar bought and placed');
assert.equal(s.coins >= 0, true);
console.log('bar placed; coins', s.coins, 'done', s.story.done.join(','));

// open the club: until then nobody comes in
await waitCoach(page, 'abre el club');
await shot(page, 'g_7a_coach_open');
await page.locator('.bb[data-id="open"]').click();
s = await S(page);
assert.equal(s.open, true, 'the club is open');
await page.waitForFunction(() => /Cerrar club/.test(document.querySelector('.bb[data-id="open"]')?.textContent ?? ''));
await waitCoach(page, 'Club abierto');
await shot(page, 'g_7b_coach_end');
await page.getByRole('button', { name: '¡Vamos!' }).click();
await page.waitForFunction(() => !document.querySelector('.coach') || getComputedStyle(document.querySelector('.coach')).display === 'none');
s = await S(page);
assert.ok(s.story.tutorial >= 18, 'tutorial finished and saved');
await page.waitForFunction(() => /Primeros clientes/.test(document.querySelector('.tracker')?.textContent ?? ''));
console.log('club opened; tutorial finished; the mission tracker takes over');
await page.evaluate(() => { window.__nc.club.showGuests = false; }); // exact coin checks below

// select a placed item: stash it, then sell it from the inventory
await click(page, 3, 3);
await page.waitForSelector('.contextbar.show');
await shot(page, 'g_8_item_selected');
const coinsBefore = (await S(page)).coins;
await page.locator('.ctx-btn', { hasText: 'Guardar' }).click();
s = await S(page);
assert.equal(s.inventory.floor_cyan, 1, 'stashed into the inventory');
assert.equal(s.coins, coinsBefore, 'stashing costs nothing');
await page.locator('.bb', { hasText: 'Inventario' }).click();
await page.locator('.card', { hasText: 'Baldosa cian' }).click();
await page.locator('button[data-action="sell"]').click();
s = await S(page);
assert.equal(s.coins, coinsBefore + 25, 'sold for half price');
await page.keyboard.press('Escape');
console.log('stash and sell OK');

// ======================================================================== 3. a night with guests, then level-up
await page.evaluate(() => { window.__nc.club.showGuests = true; window.__nc.club.simulate(180); });
await page.waitForTimeout(2500);
s = await S(page);
assert.ok(s.stats.guests > 0, 'guests came in');
console.log('after a night: guests served', s.stats.guests, 'drinks', s.stats.drinks, 'xp', s.xp, 'level up?', await page.locator('.hud-player .lvl-badge').innerText());
await shot(page, 'g_9_night');

// closing: everybody goes home and nobody new comes; reopening brings people back
await page.locator('.bb[data-id="open"]').click();
assert.equal((await S(page)).open, false);
assert.match(await page.locator('.bb[data-id="open"]').innerText(), /Abrir club/);
await page.evaluate(() => window.__nc.club.simulate(120));
assert.equal(await page.evaluate(() => window.__nc.club.guestCount), 0, 'the club emptied after closing');
const servedClosed = (await S(page)).stats.guests;
await page.evaluate(() => window.__nc.club.simulate(120));
assert.equal((await S(page)).stats.guests, servedClosed, 'no new guests while closed');
await shot(page, 'g_9b_closed');
await page.locator('.bb[data-id="open"]').click();
assert.equal((await S(page)).open, true);
await page.evaluate(() => window.__nc.club.simulate(120));
assert.ok((await S(page)).stats.guests > servedClosed, 'people come again after reopening');
console.log('close / reopen OK');

// ======================================================================== 4. growing: dev tool to level up, chapter scene
await page.locator('.hud .menu-btn').click();
await page.waitForSelector('.modal.menu');
await page.locator('.menu-sec.dev summary').click();
await shot(page, 'g_10_menu');
await page.getByRole('button', { name: '+10 niveles' }).click();
await page.keyboard.press('Escape');
await page.waitForSelector('.dialogue', { timeout: 20000 });
await page.waitForTimeout(900);
await shot(page, 'g_11_chapter_scene');
assert.match(await page.locator('.cm-title').innerText(), /Bar de barrio/i);
await runDialogue(page);
await page.waitForSelector('.dialogue', { state: 'detached' });
s = await S(page);
assert.ok(s.phase >= 2, 'the building grew');
assert.ok(s.story.seen.includes('ch2'));
console.log('level-up grew the building to phase', s.phase, '- chapter scene seen');
await page.waitForTimeout(1200);
await shot(page, 'g_12_bigger_club');

// ======================================================================== 5. persistence
await page.waitForTimeout(600);
await page.reload();
await page.waitForFunction(() => window.__nc?.ready);
await page.waitForTimeout(1500);
assert.equal(await page.locator('.title-screen').count(), 0, 'no title on a returning game');
assert.equal(await page.locator('.dialogue').count(), 0, 'no scene replayed');
const after = await S(page);
assert.equal(after.story.name, 'Camila');
assert.equal(after.phase, s.phase);
console.log('reloaded: name, level and club kept');

// ======================================================================== 6. phone
{
  const m = await open({ width: 390, height: 844 });
  await m.evaluate(() => { window.__nc.club.showGuests = true; });
  await m.waitForTimeout(500);
  await runIfDialogue(m);
  await m.waitForTimeout(800);
  await shot(m, 'g_13_mobile_hud');
  await m.locator('.bb', { hasText: 'Tienda' }).click();
  await m.waitForSelector('.modal.shop');
  await m.locator('.card').first().click();
  await m.waitForTimeout(400);
  await shot(m, 'g_14_mobile_shop');
}

async function runIfDialogue(p) {
  if ((await p.locator('.title-screen').count()) > 0) {
    await p.locator('.name-input').fill('Leo');
    await p.getByRole('button', { name: 'Comenzar' }).click();
    await p.getByRole('button', { name: '¡Listo, a la pista!' }).click();
    await p.waitForSelector('.dialogue');
    await runDialogue(p, { choose: 0, snap: [2, 8, 9], prefix: 'comic_mobile_' });
  }
}

// ======================================================================== 7. a wide desktop window, like the player's
{
  const saved = { story: { intro: true, name: 'Camila', seen: ['intro'], done: [], tutorial: -1 }, coins: 9000, open: true,
    inventory: { dj_booth: 1 }, items: [] };
  const w = await open({ width: 1920, height: 910 }, saved);
  await w.evaluate(() => {
    const c = window.__nc.club;
    for (const [id, x, y, r] of [['dj_booth', 5, 0, 0], ['bar_straight', 1, 0, 0], ['sofa_red_2', 6, 3, 0], ['trophy_cup', 0, 3, 0], ['plant', 7, 6, 0], ['stool', 1, 1, 0], ['stool', 2, 1, 0]]) c.tryPlace(id, x, y, r);
    for (let x = 2; x <= 5; x++) for (let y = 3; y <= 5; y++) c.tryPlace('floor_cyan', x, y, 0);
    c.setOpen(true);
    c.simulate(90);
  });
  await w.waitForTimeout(2500);
  await shot(w, 'g_15_wide_screen');
  // zoom out as far as the game lets you: the club and its street must still be in view
  await w.evaluate(() => {
    const c = window.__nc.club;
    const off = c.camera.position.clone().sub(c.controls.target).multiplyScalar(5);
    c.camera.position.copy(c.controls.target).add(off);
    c.controls.update();
  });
  await w.waitForTimeout(1500);
  await shot(w, 'g_16_wide_zoomed_out');
  const dist = await w.evaluate(() => window.__nc.club.camera.position.distanceTo(window.__nc.club.controls.target));
  const max = await w.evaluate(() => window.__nc.club.controls.maxDistance);
  assert.ok(dist <= max + 0.01, `zoom is limited: ${dist.toFixed(1)} <= ${max.toFixed(1)}`);
  console.log('wide screen captured; zoom limited to', max.toFixed(1));
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
